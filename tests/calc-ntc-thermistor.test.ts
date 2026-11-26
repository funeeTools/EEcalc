import { describe, expect, it } from 'vitest';
import { def, type NtcState } from '@/calculators/ntc-thermistor/def';
import { K0, betaBetween, betaModel, fitSH, rsInflection, shLnR, shModel } from '@/calculators/ntc-thermistor/model';

const res = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<NtcState>) => def.compute({ ...def.defaults(), ...p });
const SH44006 = { a: 1.129148e-3, b: 2.34125e-4, c: 8.76741e-8 };

describe('ntc-thermistor: models', () => {
  it('published 10 kΩ “44006” Steinhart–Hart set reproduces its table: 32.65 kΩ at 0 °C, 10.00 kΩ at 25 °C', () => {
    const n = shModel(SH44006);
    expect(n.r(0 + K0)).toBeCloseTo(32650, -1);
    expect(n.r(25 + K0)).toBeCloseTo(10000, -1);
    expect(n.t(10000) - K0).toBeCloseTo(25, 2);
  });
  it('Cardano inverse is the exact inverse of Steinhart–Hart', () => {
    for (const t of [-40, 0, 37, 85, 150]) {
      const x = shLnR(SH44006, t + K0);
      expect(1 / (SH44006.a + SH44006.b * x + SH44006.c * x ** 3) - K0).toBeCloseTo(t, 9);
    }
  });
  it('β model: B-value definition round trip (B25/85 between 25 and 85 °C)', () => {
    const n = betaModel(10e3, 298.15, 3434);
    expect(betaBetween(10e3, 298.15, n.r(358.15), 358.15)).toBeCloseTo(3434, 9);
    expect(n.r(358.15)).toBeCloseTo(10e3 * Math.exp(3434 * (1 / 358.15 - 1 / 298.15)), 9);
  });
  it('Steinhart–Hart fit through three points (Python Gaussian elimination)', () => {
    const k = fitSH([{ r: 32650, tK: K0 }, { r: 10000, tK: 25 + K0 }, { r: 3602, tK: 50 + K0 }]);
    expect(k.a).toBeCloseTo(0.0011273546816804184, 15);
    expect(k.b / 0.00023439782268541573).toBeCloseTo(1, 10);
    expect(k.c / 8.674847737882508e-8).toBeCloseTo(1, 8);
    const r = run({ model: 'shfit', solveFor: 'rt', temp: 37 });
    expect(res(r, 'r')).toBeCloseTo(6014.8889, 3);
  });
  it('sensitivity α = −β/T² for the β model', () => {
    const r = run({});
    expect(res(r, 'alpha')).toBeCloseTo((-3950 / 298.15 ** 2) * 100, 5);
  });
});

describe('ntc-thermistor: divider, series resistor, self-heating (Python cross-check)', () => {
  it('T from a 0.82 V reading = 52.1763 °C (Python bisection)', () => {
    const r = run({ solveFor: 'tempFromV', vout: 0.82 });
    expect(res(r, 'temp')).toBeCloseTo(52.17631375, 6);
  });
  it('max-swing R_S = √(R_0°C·R_100°C) = 4842.63 Ω, also the brute-force optimum', () => {
    expect(res(run({}), 'rsSwing')).toBeCloseTo(4842.627, 2);
  });
  it('inflection R_S matches the β closed form (Python brute force 2579.09 Ω)', () => {
    const n = betaModel(10e3, 298.15, 3950);
    const tm = 323.15;
    expect(rsInflection(n, tm)! / (n.r(tm) * (3950 - 2 * tm) / (3950 + 2 * tm))).toBeCloseTo(1, 6);
    expect(res(run({}), 'rsInfl')).toBeCloseTo(2579.09, 1);
  });
  it('self-heating at 25 °C: 272.25 µW, 0.1815 K with δ = 1.5 mW/K', () => {
    const r = run({});
    expect(res(r, 'power')).toBeCloseTo(272.25e-6, 12);
    expect(res(r, 'selfHeat')).toBeCloseTo(0.1815, 9);
  });
  it('NTC on top inverts the slope', () => {
    expect(res(run({ divider: 'low' }), 'slope')).toBeLessThan(0);
    expect(res(run({ divider: 'high' }), 'slope')).toBeGreaterThan(0);
  });
});

describe('ntc-thermistor: solve round trips', () => {
  for (const model of ['beta', 'sh', 'shfit'] as const) {
    for (const divider of ['low', 'high'] as const) {
      it(`${model}, NTC ${divider}: T → R, V → T`, () => {
        const fwd = run({ model, divider, solveFor: 'rt', temp: 63.4 });
        const r = res(fwd, 'r');
        const v = res(fwd, 'vout');
        expect(res(run({ model, divider, solveFor: 'temp', r }), 'temp')).toBeCloseTo(63.4, 8);
        const back = run({ model, divider, solveFor: 'tempFromV', vout: v });
        expect(res(back, 'temp')).toBeCloseTo(63.4, 8);
        expect(res(back, 'r') / r).toBeCloseTo(1, 9);
      });
    }
  }
});

describe('ntc-thermistor: edge cases', () => {
  it('V_out at or beyond the rails is an input error', () => {
    expect(() => run({ solveFor: 'tempFromV', vout: 3.3 })).toThrow(/strictly between/);
    expect(() => run({ solveFor: 'tempFromV', vout: 0 })).toThrow();
  });
  it('bad fit points and a reversed range are errors', () => {
    expect(() => run({ model: 'shfit', fr3: 50e3 })).toThrow(/fall/);
    expect(() => run({ model: 'shfit', ft3: 25 })).toThrow(/different temperatures/);
    expect(() => run({ tLo: 50, tHi: 20 })).toThrow();
    expect(() => run({ model: 'sh', shB: -1e-4 })).toThrow();
  });
  it('heavy self-heating, out-of-range T and extrapolated fits warn', () => {
    expect(run({ temp: 60, vs: 5, rs: 1e3, delta: 1e-3 }).warnings.join(' ')).toMatch(/Self-heating/);
    expect(run({ temp: 200 }).warnings.join(' ')).toMatch(/−55…150/);
    expect(run({ model: 'shfit', temp: 120 }).warnings.join(' ')).toMatch(/extrapolating/);
  });
  it('extreme inputs stay finite', () => {
    const r = run({ solveFor: 'temp', r: 1e9 });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
  it('every example computes', () => {
    for (const ex of def.examples ?? []) {
      const r = def.compute({ ...def.defaults(), ...structuredClone(ex.state) } as NtcState);
      expect(r.ok, ex.id).toBe(true);
      expect(JSON.stringify(r), ex.id).not.toMatch(/NaN/);
    }
  });
});

describe('ntc-thermistor: review regressions', () => {
  const bad = { model: 'shfit' as const, fr1: 32650, ft1: 0, fr2: 10000, ft2: 25, fr3: 4500, ft3: 50 };
  it('Steinhart–Hart with C < 0 solves on the monotonic branch (was NaN → error)', () => {
    const r = run({ ...bad, solveFor: 'rt', temp: 25 });
    expect(r.ok).toBe(true);
    expect(res(r, 'r')).toBeCloseTo(10000, 6);
    expect(res(run({ ...bad, solveFor: 'temp', r: 10000 }), 'temp')).toBeCloseTo(25, 9);
    const k = r.details!.shFit as { a: number; b: number; c: number };
    expect(k.c).toBeLessThan(0);
    expect(res(run({ model: 'sh', shA: k.a, shB: k.b, shC: k.c, solveFor: 'rt', temp: 25 }), 'r')).toBeCloseTo(10000, 6);
    expect(res(run({ ...bad, solveFor: 'rt', temp: 50 }), 'r')).toBeCloseTo(4500, 6);
  });
  it('T beyond the C < 0 turning point is a clear error; R beyond it warns', () => {
    expect(() => run({ ...bad, solveFor: 'rt', temp: -60 })).toThrow(/turning point/);
    expect(run({ ...bad, solveFor: 'temp', r: 2e6 }).warnings.join(' ')).toMatch(/turning point/);
  });
  it('tiny C keeps full precision (Newton-polished): matches C = 0', () => {
    const sh = (c: number) => run({ model: 'sh', shA: 1.129148e-3, shB: 2.34125e-4, shC: c });
    expect(res(sh(1e-15), 'rsInfl') / res(sh(0), 'rsInfl')).toBeCloseTo(1, 6);
    expect(shLnR({ a: 1.129148e-3, b: 2.34125e-4, c: 1e-15 }, 300)).toBeCloseTo(shLnR({ a: 1.129148e-3, b: 2.34125e-4, c: 0 }, 300), 6);
  });
  it('R₀ labelled for T₀ ≠ 25 °C, ADC resolution never shows as 0', () => {
    const r = run({ t0: 20 });
    expect(r.summary).toMatch(/R₀ = .* at 20 °C/);
    const hi = run({ adcBits: 24 }).results.find((x) => x.key === 'adcRes')!;
    expect(hi.display).not.toMatch(/^0(\.0+)? K/);
  });
});

describe('mode-switch review (regressions)', () => {
  it('a very cold solved R moves to GΩ (the unit list reaches it)', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const st = { ...def.defaults(), solveFor: 'rt', temp: -130 } as NtcState;
    const r = runCompute(def, st as any);
    expect(r.ok).toBe(true);
    expect(st.rUnit).toBe('GΩ');
    expect(st.r / 1e9).toBeGreaterThan(1);
    expect(st.r / 1e9).toBeLessThan(1e4);
  });
});
