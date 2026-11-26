import { describe, expect, it } from 'vitest';
import { def, type IndState } from '@/calculators/inductor-energy/def';
import { iRamp, tReach, turnOff } from '@/calculators/inductor-energy/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<IndState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;

describe('inductor-energy: published example', () => {
  it('Alexander & Sadiku practice problem 6.8: 1 mH carrying 60 mA (peak) stores 1.8 µJ; v = L di/dt peaks at 6 mV', () => {
    const r = runCompute(def, { ...def.defaults(), ...def.examples!.find((e) => e.id === 'sadiku-pp-6-8')!.state });
    expect(res(r, 'e')).toBeCloseTo(1.8e-6, 15);
    // i = 60 cos(100t) mA → |di/dt|max = 6 A/s → v = L·6 = 6 mV
    expect(1e-3 * 0.06 * 100).toBeCloseTo(6e-3, 15);
  });
});

describe('inductor-energy: Python cross-check', () => {
  it('default 10 µH, 2 A, 12 V, 50 mΩ: t = 1.673650 µs (bisection on i(t))', () => {
    expect(res(run({}), 't')).toBeCloseTo(1.673649934103322e-6, 17);
  });
  it('relay 0.8 H / 400 Ω at 27 mA, diode clamp 0.7 V: t_off = 5.5980 ms, E_clamp = 30.94 µJ (RK4)', () => {
    const r = run(def.examples!.find((e) => e.id === 'relay')!.state);
    expect(res(r, 'tOff')).toBeCloseTo(0.005598043958615873, 11);
    expect(res(r, 'eClamp')).toBeCloseTo(3.094239615069577e-5, 13);
  });
  it('review fix: 24 V zener across a low-side switch on a 12 V relay: coil sees 12 V, t_off = 1.2837 ms; the zener takes V_Z·∫i dt = 371.7 µJ (RK4 ∫i dt × 24 V), 185.9 µJ of it from the supply', () => {
    const r = run(def.examples!.find((e) => e.id === 'zener')!.state);
    expect(res(r, 'tOff')).toBeCloseTo(0.0012837077723447865, 11);
    expect(res(r, 'eClamp')).toBeCloseTo(2 * 0.00018586520195587507, 13);
    expect(res(r, 'eSupply')).toBeCloseTo(0.00018586520195587507, 13);
    expect(res(r, 'vSwitch')).toBe(24);
    // the same 12 V across the coil from a clamp across it takes only the coil's share
    expect(res(run({ ...def.examples!.find((e) => e.id === 'zener')!.state, clampType: 'coil', vClamp: 12 }), 'eClamp')).toBeCloseTo(0.00018586520195587507, 13);
  });
  it('zener at or below the supply warns; R_off replaces R in the decay loop only', () => {
    expect(run({ vClamp: 10, clampType: 'ground' }).warnings.join(' ')).toMatch(/not above the supply/);
    const a = run({ vClamp: 0.7, r: 0.5, rOff: 0.05 });
    expect(res(a, 'tOff')).toBeCloseTo(turnOff(2, 10e-6, 0.05, 0.7).t, 15);
    expect(res(a, 't')).toBeCloseTo(tReach(2, 10e-6, 12, 0.5), 15);
  });
  it('review fix: ◎ on L with I ≥ V/R falls back to the energy target (no red error)', () => {
    const st: IndState = { ...def.defaults(), ...(def.examples!.find((e) => e.id === 'relay')!.state as IndState), i: 40e-3, target: 'time' };
    const f = (def.fields[0] as any).fields.find((x: any) => x.key === 'l');
    f.onSolve(st, st);
    expect(st.target).toBe('energy');
    expect(runCompute(def, st).ok).toBe(true);
  });
});

describe('inductor-energy: solve round trips', () => {
  const pts: Partial<IndState>[] = [{}, { l: 0.8, i: 0.027, v: 12, r: 400 }, { l: 47e-6, i: 3, v: 24, r: 0 }];
  for (const p of pts) {
    it(`L, I, V for E and for t reproduce the forward result (${JSON.stringify(p)})`, () => {
      const fwd = run(p);
      const E = res(fwd, 'e');
      const T = res(fwd, 't');
      const d = { ...def.defaults(), ...p };
      expect(res(run({ ...p, solveFor: 'l', target: 'energy', e: E, l: 1 }), 'l') / d.l).toBeCloseTo(1, 10);
      expect(res(run({ ...p, solveFor: 'i', target: 'energy', e: E, i: 1 }), 'i') / d.i).toBeCloseTo(1, 10);
      expect(res(run({ ...p, solveFor: 'l', target: 'time', t: T, l: 1 }), 'l') / d.l).toBeCloseTo(1, 10);
      expect(res(run({ ...p, solveFor: 'i', target: 'time', t: T, i: 1 }), 'i') / d.i).toBeCloseTo(1, 10);
      expect(res(run({ ...p, solveFor: 'v', t: T, v: 1 }), 'v') / d.v).toBeCloseTo(1, 10);
    });
  }
});

describe('inductor-energy: mode-switch regressions', () => {
  it('◎ on t when I is never reached solves V (not L) for the time target', () => {
    const st: IndState = { ...def.defaults(), i: 1000 };
    runCompute(def, st);
    const f = (def.fields[1] as any).fields.find((x: any) => x.key === 't');
    f.onUnsolve(st, st);
    expect(st.solveFor).toBe('v');
    expect(runCompute(def, st).ok).toBe(true);
  });
});

describe('inductor-energy: physics sanity', () => {
  it('E ∝ I², λ = LI; small R gives the straight ramp LI/V; R → large L/R behaviour', () => {
    expect(res(run({ i: 4 }), 'e') / res(run({ i: 2 }), 'e')).toBeCloseTo(4, 12);
    expect(res(run({}), 'lambda')).toBeCloseTo(20e-6, 18);
    expect(tReach(2, 10e-6, 12, 0)).toBeCloseTo((10e-6 * 2) / 12, 18);
    expect(tReach(2, 10e-6, 12, 1e-9) / tReach(2, 10e-6, 12, 0)).toBeCloseTo(1, 8);
    // 63.2 % of V/R at one τ
    expect(iRamp(1e-3, 1, 10, 1000) / (10 / 1000)).toBeCloseTo(1 - Math.exp(-1), 12);
  });
  it('turn-off energy splits into clamp + R and tends to ½LI² in the clamp as R → 0', () => {
    const o = turnOff(2, 1e-3, 0.5, 24);
    expect(o.eClamp + o.eR).toBeCloseTo(0.5 * 1e-3 * 4, 15);
    expect(turnOff(2, 1e-3, 1e-12, 24).eClamp).toBeCloseTo(2e-3, 12);
    expect(turnOff(2, 1e-3, 1e-12, 24).t).toBeCloseTo(1e-3 * 2 / 24, 12);
  });
});

describe('inductor-energy: validity warnings', () => {
  it('above I_sat → warning and SATURATES status', () => {
    const r = run(def.examples!.find((e) => e.id === 'saturation')!.state);
    expect(r.warnings.join(' ')).toMatch(/above I_sat/);
    expect(r.status?.tone).toBe('fail');
  });
  it('current never reached (I ≥ V/R): warning in analysis, error when designing for a time', () => {
    const r = run({ i: 1000 });
    expect(r.ok).toBe(true);
    expect(res(r, 't')).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/never reached/);
    expect(run({ solveFor: 'l', target: 'time', i: 1000 }).ok).toBe(false);
  });
  it('near the asymptote (> 95 % of V/R) warns', () => {
    expect(run({ i: 0.97 * 240 }).warnings.join(' ')).toMatch(/nearly flat/);
  });
});

function collect(fields: FieldSpec[], nums: { key: string; min: number; max: number; optional?: boolean }[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, optional: f.optional });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}

describe('inductor-energy: fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: { key: string; min: number; max: number; optional?: boolean }[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 11;
    const rnd = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) s[f.key] = f.optional && rnd() < 0.3 ? null : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : rnd() < 0.2 ? 0 : 1e-6 * (f.max / 1e-6) ** rnd();
      s.solveFor = def.solve!.options[i % 4].key;
      const st = s as unknown as IndState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        expect(st.solveFor).not.toBe('e'); // the analysis is never refused
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of [...sr.x, ...sr.y]) expect(Number.isFinite(y), g.id).toBe(true);
      for (const t of r.tables) for (const d of t.display ?? []) for (const v of Object.values(d)) expect(v).not.toMatch(BAD);
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      expect(res(again, 'e') / res(r, 'e')).toBeCloseTo(1, 9);
    }
    expect(ok).toBeGreaterThan(150); // every analysis state; the rest are random targets outside the field ranges
  });
});

describe('inductor-energy: examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      // mode-switch regression: no NaN / Infinity text in any example (A&S 6.1 once showed "Infinity A" at V₂ = 0)
      expect(JSON.stringify([r.results, r.warnings, r.notes, r.summary]), ex.id).not.toMatch(BAD);
    }
  });
  it('L for a time target lists E12 parts with pass/fail on the time', () => {
    const r = run(def.examples!.find((e) => e.id === 'l-for-time')!.state);
    const t = r.tables.find((x) => x.id === 'preferred')!;
    expect(t.rows.map((x) => x.l)).toEqual([33e-6, 39e-6, 47e-6, 56e-6]);
    expect(t.rowTones).toEqual(['pass', 'pass', 'fail', 'fail']);
  });
});
