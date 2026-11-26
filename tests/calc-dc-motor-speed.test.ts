import { describe, expect, it } from 'vitest';
import { def } from '@/calculators/dc-motor-speed/def';
import { RPM, motorFigures, operatingPoint } from '@/calculators/dc-motor-speed/model';
import type { NumberField } from '@/core/form/form';
import { findField } from '@/core/calc/fields';
import { runCompute } from '@/core/calc/page';

const res = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;

/**
 * maxon RE 40 catalogue data (DE 141, 2020), values at nominal voltage and 25 °C:
 * [V, n₀ rpm, I₀ A, stall torque mN·m, stall current A, η_max %, R Ω, K mN·m/A, gradient rpm/mN·m]
 */
const MAXON: Record<string, number[]> = {
  '148867': [24, 7580, 0.137, 2420, 80.2, 91, 0.299, 30.2, 3.14],
  '148877': [48, 7590, 0.0686, 2560, 42.4, 92, 1.13, 60.3, 2.97],
};

describe('dc motor: maxon RE 40 datasheet consistency', () => {
  for (const [art, [v, n0, i0, ts, ia, eta, r, k, grad]] of Object.entries(MAXON)) {
    it(`article ${art}: no-load speed, stall, gradient and η_max from R, K, I₀`, () => {
      const out = def.compute({ ...def.defaults(), solveFor: 'n', v, r, k: k * 1e-3, kForm: 'k', i0, tL: 0, tW: 25 });
      expect(res(out, 'noLoadSpeed') / RPM / n0).toBeCloseTo(1, 2); // within 0.5 %
      expect(res(out, 'stallCurrent') / ia).toBeCloseTo(1, 2);
      expect(res(out, 'stallTorque') / (ts * 1e-3)).toBeCloseTo(1, 2);
      expect(res(out, 'gradient') / RPM / 1000 / grad).toBeCloseTo(1, 2);
      // maxon rounds/truncates the printed efficiency; the formula gives 91.9 % and 92.1 %
      expect(Math.abs(res(out, 'maxEfficiency') * 100 - eta)).toBeLessThan(1.0);
      // at zero load the speed is the no-load speed
      expect(res(out, 'n')).toBeCloseTo(res(out, 'noLoadSpeed'), 9);
    });
  }
  it('nominal point of 148867 (177 mN·m): 6.0 A as on the datasheet, speed from the 25 °C line', () => {
    const out = def.compute(def.defaults());
    expect(res(out, 'current')).toBeCloseTo(6.0, 2); // datasheet nominal current 6 A
    // Python reference (independent script): 7021.77 rpm at 25 °C (datasheet 6940 rpm is quoted with a warm winding)
    expect(res(out, 'n') / RPM).toBeCloseTo(7021.77, 1);
  });
});

describe('dc motor: Python cross-check (independent script, brute-force efficiency scan)', () => {
  it('148867 at 0.1 N·m and max-efficiency point', () => {
    const m = { v: 24, r: 0.299, k: 30.2e-3, i0: 0.137 };
    const op = operatingPoint(m, 0.1);
    expect(op.speed / RPM).toBeCloseTo(7262.832, 2);
    expect(op.current).toBeCloseTo(3.44826, 5);
    const fig = motorFigures(m);
    expect(fig.maxEfficiency).toBeCloseTo(0.9191, 4);
    expect(fig.maxEffTorque).toBeCloseTo(0.09601, 4);
    expect(fig.maxPower).toBeCloseTo((fig.noLoadSpeed * fig.stallTorque) / 4, 9);
    // max power really is the peak of T·ω
    const p = (t: number) => operatingPoint(m, t).pOut;
    expect(p(fig.maxPowerTorque)).toBeGreaterThan(p(fig.maxPowerTorque * 1.01));
    expect(p(fig.maxPowerTorque)).toBeGreaterThan(p(fig.maxPowerTorque * 0.99));
  });
});

describe('dc motor: solve round trips', () => {
  it('voltage for 3000 rpm at 0.1 N·m matches Python (10.51864 V) and reproduces the speed', () => {
    const base = { ...def.defaults(), tL: 0.1, n: 3000 * RPM };
    const r = def.compute({ ...base, solveFor: 'v' });
    expect(res(r, 'v')).toBeCloseTo(10.51864, 5);
    const back = def.compute({ ...base, solveFor: 'n', v: res(r, 'v') });
    expect(res(back, 'n') / RPM).toBeCloseTo(3000, 8);
  });
  it('load torque at a speed reproduces the speed', () => {
    const base = { ...def.defaults(), n: 6000 * RPM, tW: 60 };
    const r = def.compute({ ...base, solveFor: 'tL' });
    const back = def.compute({ ...base, solveFor: 'n', tL: res(r, 'tL') });
    expect(res(back, 'n') / RPM).toBeCloseTo(6000, 8);
  });
  it('Kv form gives the same answer as the equivalent Kt', () => {
    const a = def.compute({ ...def.defaults(), kForm: 'k', k: 30.2e-3 });
    const b = def.compute({ ...def.defaults(), kForm: 'kv', kv: 1 / 30.2e-3, k: 999 });
    expect(res(b, 'n')).toBeCloseTo(res(a, 'n'), 9);
    expect(res(b, 'k')).toBeCloseTo(30.2e-3, 12);
    expect(res(a, 'kv') / RPM).toBeCloseTo(316.2, 1);
  });
  it('winding temperature: α₂₀ = 0.00393/K applied from 20 °C to the 25 °C datasheet value (regression)', () => {
    const r = def.compute({ ...def.defaults(), tW: 125 });
    expect(res(r, 'rHot')).toBeCloseTo((0.299 * (1 + 0.00393 * 105)) / (1 + 0.00393 * 5), 9);
    expect(res(def.compute({ ...def.defaults(), tW: 25 }), 'rHot')).toBeCloseTo(0.299, 12);
  });
});

describe('dc motor: edge cases', () => {
  it('load above stall torque is flagged, not NaN', () => {
    const r = def.compute({ ...def.defaults(), v: 12, tL: 1.5 });
    expect(r.status?.text).toBe('STALLED');
    expect(res(r, 'n')).toBeLessThan(0);
    expect(r.results.every((x) => x.value === null || typeof x.value !== 'number' || Number.isFinite(x.value))).toBe(true);
  });
  it('zero voltage: motor does not turn; zero K or R throws', () => {
    const r = def.compute({ ...def.defaults(), v: 0, tL: 0 });
    expect(r.status?.text).toBe('STALLED');
    expect(() => def.compute({ ...def.defaults(), k: 0 })).toThrow();
    expect(() => def.compute({ ...def.defaults(), r: 0 })).toThrow();
    expect(() => def.compute({ ...def.defaults(), kForm: 'kv', kv: 0 })).toThrow();
  });
  it('current above the continuous rating warns', () => {
    const r = def.compute({ ...def.defaults(), tL: 0.5 });
    expect(r.warnings.some((w) => w.includes('continuous rating'))).toBe(true);
  });
  it('every example computes with finite results and graph data', () => {
    for (const ex of def.examples ?? []) {
      const r = def.compute({ ...def.defaults(), ...ex.state });
      expect(r.ok, ex.id).toBe(true);
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${ex.id} ${x.key}`).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite), `${ex.id} ${g.id} ${s.label}`).toBe(true);
    }
  });
});

describe('dc motor: review regressions', () => {
  const finite = (r: { results: { value: unknown }[] }) => r.results.every((x) => typeof x.value !== 'number' || Number.isFinite(x.value));
  it('negative-voltage solve returns NO SOLUTION early, with no NaN characteristic', () => {
    const r = def.compute({ ...def.defaults(), solveFor: 'v', tL: -0.5, n: 1000 * RPM });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.results.find((x) => x.key === 'v')?.value).toBeNull();
    expect(r.results.some((x) => x.display.includes('NaN'))).toBe(false);
    expect(finite(r)).toBe(true);
  });
  it('below the friction voltage the shaft is held: n = 0, I = V/R, P = 0, characteristic suppressed', () => {
    const r = def.compute({ ...def.defaults(), v: 0.02, tL: 0 }); // I₀R = 41 mV
    expect(r.status?.text).toBe('STALLED');
    expect(res(r, 'n')).toBe(0);
    expect(res(r, 'current')).toBeCloseTo(0.02 / 0.299, 12);
    expect(res(r, 'pOut')).toBe(0);
    expect(r.results.find((x) => x.key === 'maxEfficiency')?.value).toBeNull();
    for (const [v, i0] of [[0, 0], [0, 0.137], [0.02, 0.137]]) {
      const q = def.compute({ ...def.defaults(), v, i0, tL: 0 });
      expect(res(q, 'n'), `v=${v} i0=${i0}`).toBe(0);
      expect(q.results.some((x) => x.display.includes('NaN') || (x.note ?? '').includes('NaN'))).toBe(false);
      expect(finite(q)).toBe(true);
      for (const g of q.graphs) for (const sr of g.series ?? []) expect(sr.y.every(Number.isFinite)).toBe(true);
    }
  });
  it('overhauling load at V = 0 generates (forward) and is not reported as STALLED', () => {
    const r = def.compute({ ...def.defaults(), v: 0, tL: -0.1 });
    expect(res(r, 'n')).toBeGreaterThan(0);
    expect(r.status).toBeUndefined();
    expect(res(r, 'current')).toBeLessThan(0);
  });
  it('load just above stall torque is held by friction; well above it drives the motor backwards', () => {
    const fig = (def.compute(def.defaults()).details as any).stallTorque as number; // K(V/R − I₀)
    const held = def.compute({ ...def.defaults(), tL: fig + 0.5 * 2 * 30.2e-3 * 0.137 });
    expect(res(held, 'n')).toBe(0);
    const back = def.compute({ ...def.defaults(), tL: fig * 1.5 });
    expect(res(back, 'n')).toBeLessThan(0);
    expect(back.status?.text).toBe('STALLED');
    // backward branch round-trips through the voltage solve
    const v = def.compute({ ...def.defaults(), solveFor: 'v', tL: fig * 1.5, n: res(back, 'n') });
    expect(res(v, 'v')).toBeCloseTo(24, 9);
  });
});


describe('DC motor — review regressions', () => {
  it('V ≤ I₀·R draws no empty graphs', () => {
    const r = def.compute({ ...def.defaults(), i0: 1000 });
    expect(r.graphs).toEqual([]);
  });
  it('a solved K_v for a tiny K_t reads in krpm/V', () => {
    const st: any = { ...def.defaults(), ...def.examples!.find((e) => e.id === 'torque-at-speed')!.state, k: 1e-6 };
    runCompute(def as any, st);
    expect(st.kvUnit).toBe('krpm/V');
    expect(Object.keys((findField(def.fields, 'kv')!.field as NumberField).units!)).toContain('krpm/V');
  });
});
