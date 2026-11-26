import { describe, expect, it } from 'vitest';
import { def } from '@/calculators/attenuator-designer/def';
import { analysePad, branches, designPad, minLossDb } from '@/calculators/attenuator-designer/model';

type R = { results: { key: string; value: unknown }[] };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Record<string, unknown>) => def.compute({ ...def.defaults(), ...p } as any);

describe('attenuator designer', () => {
  it('published 50 Ω 10 dB values (Reference Data for Engineers equal-Z formulas): Pi 96.25/71.15, T 25.97/35.14', () => {
    const pi = run({ topology: 'pi', atten: 10, eseries: 'ideal' });
    expect(res(pi, 'r1')).toBeCloseTo(96.2475, 3);
    expect(res(pi, 'r2')).toBeCloseTo(71.1512, 3);
    expect(res(pi, 'r3')).toBeCloseTo(96.2475, 3);
    const t = run({ topology: 't', atten: 10, eseries: 'ideal' });
    expect(res(t, 'r1')).toBeCloseTo(25.9747, 3);
    expect(res(t, 'r2')).toBeCloseTo(35.1364, 3);
  });

  it('minimum-loss pad 75 → 50 Ω: 43.30 Ω series, 86.60 Ω shunt, 5.719 dB', () => {
    const r = run({ topology: 'minloss', z1: 75, z2: 50, eseries: 'ideal' });
    expect(res(r, 'r1')).toBeCloseTo(43.3013, 3);
    expect(res(r, 'r2')).toBeCloseTo(86.6025, 3);
    expect(res(r, 'atten')).toBeCloseTo(5.7195, 3);
    expect(minLossDb(50, 75)).toBeCloseTo(5.7195, 3);
  });

  it('matches an independent Python ABCD analysis (unequal 75 → 50 Ω, 10 dB; bridged-T; power split)', () => {
    const t = designPad('t', 10, 75, 50)!;
    expect(t.r1).toBeCloseTo(48.63352, 4);
    expect(t.r2).toBeCloseTo(43.03315, 4);
    expect(t.r3).toBeCloseTo(18.07796, 4);
    const p = designPad('pi', 10, 75, 50)!;
    expect(p.r1).toBeCloseTo(207.43488, 3);
    expect(p.r2).toBeCloseTo(87.14213, 4);
    expect(p.r3).toBeCloseTo(77.10731, 4);
    const b = designPad('bridgedT', 10, 50, 50)!;
    expect(b.r1).toBeCloseTo(108.11388, 4);
    expect(b.r2).toBeCloseTo(23.12376, 4);
    // 1 W available into a 10 dB 50 Ω Pi pad: 0.5195 / 0.3286 / 0.0519 W, 0.1 W to the load
    const r = run({ topology: 'pi', atten: 10, eseries: 'ideal', pin: 30 });
    expect(res(r, 'p_r1')).toBeCloseTo(0.519494, 5);
    expect(res(r, 'p_r2')).toBeCloseTo(0.328557, 5);
    expect(res(r, 'p_r3')).toBeCloseTo(0.0519494, 6);
    expect(res(r, 'pLoad')).toBeCloseTo(0.1, 9);
  });

  it('every designed pad is matched at both ports and has the requested loss (nodal check)', () => {
    for (const top of ['pi', 't', 'bridgedT'] as const) {
      for (const [z1, z2] of [[50, 50], [75, 75], [600, 600], [75, 50], [50, 300]]) {
        if (top === 'bridgedT' && z1 !== z2) continue;
        for (const A of [0.5, 3, 10, 26.5, 60]) {
          const v = designPad(top, A, z1, z2);
          if (A <= minLossDb(z1, z2)) {
            expect(v).toBeNull();
            continue;
          }
          const an = analysePad(branches(top, v!, z1, z2), z1, z2);
          expect(an.lossDb).toBeCloseTo(A, 8);
          expect(an.zin / z1).toBeCloseTo(1, 9);
          expect(an.zout / z2).toBeCloseTo(1, 9);
        }
      }
    }
  });

  it('solve → forward round trip: designed resistors analysed give the target attenuation back', () => {
    for (const top of ['pi', 't', 'bridgedT'] as const) {
      const d = run({ topology: top, atten: 13.7, eseries: 'ideal', z1: 75, z2: 75 });
      const back = run({ solveFor: 'atten', topology: top, z1: 75, z2: 75, r1: res(d, 'r1'), r2: res(d, 'r2'), r3: res(d, 'r3') });
      expect(res(back, 'atten')).toBeCloseTo(13.7, 9);
      expect(back.status?.text).toBe('MATCHED');
    }
    const m = run({ topology: 'minloss', z1: 300, z2: 50, eseries: 'ideal' });
    const mb = run({ solveFor: 'atten', topology: 'minloss', z1: 300, z2: 50, r1: res(m, 'r1'), r2: res(m, 'r2') });
    expect(res(mb, 'atten')).toBeCloseTo(minLossDb(300, 50), 9);
  });

  it('edge cases: A below the minimum loss, zero dB, equal-Z L pad, zero resistor', () => {
    const low = run({ topology: 'pi', z1: 75, z2: 50, atten: 3 });
    expect(low.ok).toBe(false);
    expect(low.status?.text).toBe('NO SOLUTION');
    expect(low.error).toMatch(/more than 5\.719 dB/);
    expect(() => run({ topology: 'pi', atten: 0 })).toThrow(/> 0 dB/);
    expect(() => run({ topology: 'minloss', z1: 50, z2: 50 })).toThrow(/Z₂ ≠ Z₁/);
    expect(() => run({ solveFor: 'atten', r2: 0 })).toThrow();
    const mis = run({ solveFor: 'atten', topology: 'pi', r1: 50, r2: 200, r3: 50 });
    expect(mis.status?.text).toBe('MISMATCHED');
    expect(mis.warnings.length).toBeGreaterThan(0);
  });

  it('regression: V₁/V₂ uses √(Z₁/Z₂) (reviewer: L pad 75→50 is 2.366, Pi 50→300 20 dB is 4.082)', () => {
    expect(res(run({ topology: 'minloss', z1: 75, z2: 50, eseries: 'ideal' }), 'kVoltage')).toBeCloseTo(Math.sqrt(10 ** (minLossDb(75, 50) / 10) * 1.5), 6);
    expect(res(run({ topology: 'minloss', z1: 75, z2: 50, eseries: 'ideal' }), 'kVoltage')).toBeCloseTo(2.3660, 4);
    expect(res(run({ topology: 'pi', z1: 50, z2: 300, atten: 20, eseries: 'ideal' }), 'kVoltage')).toBeCloseTo(Math.sqrt(100 / 6), 6);
    // mismatched analysis: still the true node-voltage ratio (Pi 50/200/50 in 50 Ω, by hand: V1/V2 = 1 + 200·(1/50 + 1/50))
    expect(res(run({ solveFor: 'atten', topology: 'pi', r1: 50, r2: 200, r3: 50 }), 'kVoltage')).toBeCloseTo(9, 9);
  });

  it('regression: leaving the minimum-loss pad for Pi/T lands on a valid design', () => {
    const st: any = { ...def.defaults(), ...def.examples!.find((e) => e.id === 'minloss-75-50')!.state };
    const r = def.compute(st);
    expect(res(r, 'atten')).toBeCloseTo(minLossDb(75, 50), 12); // written-back value is A_min, not the as-built loss
    st.atten = res(r, 'atten');
    const topo = (def.fields[0] as any).fields.find((f: any) => f.key === 'topology');
    for (const t of ['pi', 't']) {
      const s2 = { ...st, topology: t };
      topo.apply(t, s2, s2);
      const r2 = def.compute(s2);
      expect(r2.ok && r2.status?.text !== 'NO SOLUTION', t).toBe(true);
      expect(s2.atten).toBeGreaterThan(minLossDb(75, 50));
    }
  });

  it('regression: absurd resistor values near A_min warn; mismatched L pad warns', () => {
    const r = run({ topology: 'pi', z1: 75, z2: 50, atten: minLossDb(75, 50) + 1e-9 });
    expect(r.warnings.some((w) => w.includes('not buildable'))).toBe(true);
    const l = run({ solveFor: 'atten', topology: 'minloss', z1: 75, z2: 50, r1: 10, r2: 10 });
    expect(l.warnings.some((w) => w.includes('do not match'))).toBe(true);
  });

  it('every example computes with ok: true and finite numbers', () => {
    for (const ex of def.examples!) {
      const r = run(ex.state);
      expect(r.ok, ex.id).toBe(true);
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${ex.id}.${x.key}`).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite), `${ex.id}.${g.id}`).toBe(true);
    }
  });
});

describe('attenuator — mode-switch regressions', () => {
  const pad = (def.fields[0] as any).fields;
  const atten = pad.find((f: any) => f.key === 'atten');
  const r1 = (def.fields[1] as any).fields.find((f: any) => f.key === 'r1');
  it('switching analysis → design with an attenuation below A_min raises it instead of a red error', () => {
    // 75 → 50 Ω, a nearly transparent Pi analyses at ~0.2 dB, below the 5.72 dB a matched pad needs
    const st: any = { ...def.defaults(), solveFor: 'atten', topology: 'pi', z1: 75, z2: 50, r1: 1000, r2: 5, r3: 1000 };
    const a = def.compute(st);
    st.atten = a.results.find((x) => x.key === 'atten')!.value;
    expect(st.atten).toBeLessThan(minLossDb(75, 50));
    for (const fn of [(s: any) => r1.onSolve(s, s), (s: any) => atten.onUnsolve(s, s)]) {
      const s2: any = structuredClone(st);
      fn(s2);
      expect(s2.solveFor).toBe('res');
      expect(s2.atten).toBeCloseTo(6.8, 9); // ceil((A_min + 1)·10)/10
      expect(def.compute(s2).ok).toBe(true);
    }
    // a feasible attenuation is kept
    const ok: any = { ...def.defaults(), solveFor: 'atten', atten: 12.3 };
    r1.onSolve(ok, ok);
    expect(ok.atten).toBe(12.3);
  });

  it('no-solution design is an error: no stale R2/R3 can be left in the solved boxes', () => {
    const r = run({ topology: 't', z1: 500, z2: 50, atten: 10 });
    expect(r.ok).toBe(false);
    expect(r.results).toEqual([]);
  });

  it('output ranges hold every analysed loss and every designed resistor', () => {
    expect(atten.max).toBeGreaterThanOrEqual(180);
    const t120 = run({ topology: 't', z1: 0.1, z2: 0.1, atten: 120, eseries: 'ideal' });
    expect(t120.ok).toBe(true);
    const rs = ['r1', 'r2', 'r3'].map((k) => t120.results.find((x) => x.key === k)!.value as number);
    for (const v of rs) expect(v).toBeGreaterThanOrEqual(r1.min);
    const pi120 = run({ topology: 'pi', z1: 1e6, z2: 1e6, atten: 120, eseries: 'ideal' });
    expect(pi120.results.find((x) => x.key === 'r2')!.value as number).toBeLessThanOrEqual(r1.max);
  });
});
