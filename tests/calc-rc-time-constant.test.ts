import { describe, expect, it } from 'vitest';
import { def, type RcState } from '@/calculators/rc-time-constant/def';
import { highPass, lowPass, tauMultiple, vAt } from '@/calculators/rc-time-constant/model';

const res = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<RcState>) => def.compute({ ...def.defaults(), ...p });

describe('rc-time-constant: textbook relations', () => {
  it('63.2 % at τ, 50 % at τ·ln2, 90 % at 2.303τ, 10–90 % rise = 2.197τ (Horowitz & Hill §1.4.2)', () => {
    expect(vAt(1, 1, 0, 1)).toBeCloseTo(0.63212, 5);
    expect(tauMultiple(0, 1, 0.5)).toBeCloseTo(0.693147, 6);
    expect(tauMultiple(0, 1, 0.9)).toBeCloseTo(2.302585, 6);
    expect(tauMultiple(0, 1, 0.9) - tauMultiple(0, 1, 0.1)).toBeCloseTo(2.197225, 6);
  });
  it('defaults: 10 kΩ × 100 nF = 1 ms, 50 % at 693.1 µs, f_c = 159.15 Hz', () => {
    const r = def.compute(def.defaults());
    expect(r.ok).toBe(true);
    expect(res(r, 'tau')).toBeCloseTo(1e-3, 12);
    expect(res(r, 't')).toBeCloseTo(693.147e-6, 9);
    expect(res(r, 'fc')).toBeCloseTo(159.1549, 3);
    expect(res(r, 'trBw')).toBeCloseTo(0.3497, 4);
  });
  it('single-pole filters are −3.01 dB and ∓45° at f_c', () => {
    expect(lowPass(100, 100).db).toBeCloseTo(-3.0103, 4);
    expect(lowPass(100, 100).deg).toBeCloseTo(-45, 9);
    expect(highPass(100, 100).db).toBeCloseTo(-3.0103, 4);
    expect(highPass(100, 100).deg).toBeCloseTo(45, 9);
    // 20 dB/decade asymptotes
    expect(lowPass(1e6, 100).db).toBeCloseTo(-80, 3);
    expect(highPass(1e-2, 100).db).toBeCloseTo(-80, 3);
  });
  it('Python cross-check: bleeder 400 V → 50 V, 100 kΩ, 470 µF = 97.734 s; energy split', () => {
    const r = run({ solveFor: 't', r: 100e3, c: 470e-6, v0: 400, vInf: 0, vth: 50 });
    expect(res(r, 't')).toBeCloseTo(97.73375, 4);
    expect(res(r, 'eR')).toBeCloseTo(37.6, 9);
    expect(res(r, 'i0')).toBeCloseTo(-4e-3, 12);
  });
  it('part-charged start: step from 1 V to −2 V matches an RK4 integration (Python)', () => {
    const r = run({ solveFor: 'vth', r: 2e3, c: 3e-6, v0: 1, vInf: -2, t: 1.7 * 6e-3 });
    expect(res(r, 'vth')).toBeCloseTo(-1.45194942784, 9);
  });
});

describe('rc-time-constant: solve round trips', () => {
  const base: Partial<RcState> = { r: 22e3, c: 47e-9, v0: 0.3, vInf: 3.3, vth: 2.1 };
  const fwd = run({ ...base, solveFor: 't' });
  const t = res(fwd, 't');
  it('t → vth reproduces the threshold', () => {
    expect(res(run({ ...base, solveFor: 'vth', t }), 'vth')).toBeCloseTo(2.1, 10);
  });
  it('R and C from (V_th, t)', () => {
    expect(res(run({ ...base, solveFor: 'r', target: 'threshold', t, r: 1 }), 'r') / 22e3).toBeCloseTo(1, 10);
    expect(res(run({ ...base, solveFor: 'c', target: 'threshold', t, c: 1e-12 }), 'c') / 47e-9).toBeCloseTo(1, 10);
  });
  it('R and C from a τ target, and t then follows', () => {
    const r1 = run({ ...base, solveFor: 'r', target: 'tau', tau: 22e3 * 47e-9 });
    expect(res(r1, 'r') / 22e3).toBeCloseTo(1, 10);
    expect(res(r1, 't') / t).toBeCloseTo(1, 10);
    const r2 = run({ ...base, solveFor: 'c', target: 'tau', tau: 22e3 * 47e-9 });
    expect(res(r2, 'c') / 47e-9).toBeCloseTo(1, 10);
  });
  it('discharge round trip', () => {
    const d = { r: 1e3, c: 1e-6, v0: 12, vInf: 0, vth: 3 };
    const tt = res(run({ ...d, solveFor: 't' }), 't');
    expect(tt).toBeCloseTo(1e-3 * Math.log(4), 12);
    expect(res(run({ ...d, solveFor: 'c', t: tt, c: 5 }), 'c')).toBeCloseTo(1e-6, 15);
  });
  it('E-series rounding of a solved R', () => {
    const r = run({ solveFor: 'r', target: 'tau', c: 1e-6, tau: 21.5e-3, eseries: 'E24' });
    expect(res(r, 'rStd')).toBe(22000);
    expect(res(r, 'tauStd')).toBeCloseTo(22e-3, 12);
  });
});

describe('rc-time-constant: edge cases', () => {
  it('unreachable threshold is a warning (t → null), never NaN', () => {
    const r = run({ solveFor: 't', vth: 6 });
    expect(r.ok).toBe(true);
    expect(res(r, 't')).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/never reached/);
    expect(JSON.stringify(r)).not.toMatch(/NaN/);
  });
  it('threshold beyond the asymptote cannot be designed for', () => {
    expect(() => run({ solveFor: 'r', target: 'threshold', vth: 5, t: 1e-3 })).toThrow(/never reached/);
    expect(() => run({ solveFor: 'c', target: 'threshold', vth: 2, t: 0 })).toThrow(/t > 0/);
  });
  it('V₀ = V∞ and zero parts are input errors', () => {
    expect(() => run({ v0: 5, vInf: 5 })).toThrow();
    expect(() => run({ solveFor: 't', r: 0 })).toThrow();
    expect(() => run({ solveFor: 'r', target: 'tau', tau: 0 })).toThrow();
  });
  it('threshold near V∞ warns', () => {
    expect(run({ vth: 4.995 }).warnings.join(' ')).toMatch(/asymptote/);
  });
  it('extreme values stay finite', () => {
    const r = run({ solveFor: 't', r: 1e12, c: 100, vth: 2.5 });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
  it('every example computes', () => {
    for (const ex of def.examples ?? []) {
      const r = def.compute({ ...def.defaults(), ...structuredClone(ex.state) } as RcState);
      expect(r.ok, ex.id).toBe(true);
      expect(JSON.stringify(r), ex.id).not.toMatch(/NaN/);
    }
  });
});

describe('rc-time-constant: review regressions', () => {
  it('asymptote warning starts beyond 3 τ, matching its advice', () => {
    expect(run({ vth: 4.7 }).warnings.join(' ')).not.toMatch(/Beyond 3 τ/); // 94 %, 2.81 τ
    expect(run({ vth: 4.8 }).warnings.join(' ')).toMatch(/Beyond 3 τ/);
  });
  it('summary and graph title agree on charge / discharge', () => {
    const r = run({ v0: -5, vInf: 0, vth: -1 });
    expect(r.summary).toMatch(/^Discharge/);
    expect(r.graphs[0].title).toMatch(/Discharge/);
    const c = run({ v0: 1, vInf: -2, vth: -1 });
    expect(c.summary).toMatch(/^Charge/);
    expect(c.graphs[0].title).toMatch(/Charging/);
  });
});

describe('rc-time-constant: mode-switch regressions', () => {
  it('solved R, C and τ at the field limits land in a readable unit (GΩ, mF/F, ps exist)', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const st: RcState = { ...def.defaults(), solveFor: 'c', target: 'tau', r: 1e-3, tau: 1e-3 };
    runCompute(def, st as any);
    expect(st.c).toBeCloseTo(1, 12);
    expect(st.cUnit).toBe('F');
    const s2: RcState = { ...def.defaults(), solveFor: 'r', target: 'tau', c: 1e-12, tau: 0.5 };
    runCompute(def, s2 as any);
    expect(s2.rUnit).toBe('GΩ');
    const s3: RcState = { ...def.defaults(), solveFor: 't', r: 1, c: 10e-12 };
    runCompute(def, s3 as any);
    expect(s3.tauUnit).toBe('ps');
  });
});
