import { describe, expect, it } from 'vitest';
import { def } from '@/calculators/skin-depth/def';
import { racRatio, skinDepth, wireZRatio } from '@/calculators/skin-depth/model';

type R = { results: { key: string; value: unknown }[] };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Record<string, unknown>) => def.compute({ ...def.defaults(), ...p } as any);

describe('skin depth', () => {
  it('copper (58 MS/m): δ = 8.53 mm at 60 Hz, 66.1 µm at 1 MHz, Rs = 26.1 mΩ at 10 GHz', () => {
    expect(skinDepth(60, 5.8e7, 1) * 1e3).toBeCloseTo(8.5316, 3);
    expect(skinDepth(1e6, 5.8e7, 1) * 1e6).toBeCloseTo(66.0855, 3);
    const r = run({ f: 10e9 });
    expect(res(r, 'rs') * 1e3).toBeCloseTo(26.0895, 3);
  });

  it('Rac/Rdc reproduces Terman’s round-wire table (x = √2·a/δ)', () => {
    // F. E. Terman, Radio Engineers’ Handbook (1943), sec. 2 — R/R0 vs x
    const table: [number, number][] = [[1, 1.005], [1.5, 1.026], [2, 1.078], [2.5, 1.175], [3, 1.318], [4, 1.678], [5, 2.043], [6, 2.394], [7, 2.743], [8, 3.094], [10, 3.799], [20, 7.328]];
    for (const [q, r] of table) expect(racRatio(q / Math.SQRT2)).toBeCloseTo(r, 3);
  });

  it('matches a 90-digit Python Kelvin-function evaluation, across the series/asymptotic crossover', () => {
    const ref: [number, number][] = [[0.1, 1.000002083329861], [1, 1.0204923888556225], [3, 1.7681316525097368], [10, 5.259301857510797], [29.9, 15.203133013138455], [30, 15.253122586402979], [30.1, 15.303112228778383], [40, 20.25234274636915], [80, 40.25117175222677]];
    for (const [x, r] of ref) expect(racRatio(x) / r).toBeCloseTo(1, 8);
    // DC limits: Rac/Rdc → 1 + x⁴/48, internal inductance → μ0/8π
    expect(racRatio(0.05) - 1).toBeCloseTo(0.05 ** 4 / 48, 12);
    expect(wireZRatio(0.05).im).toBeCloseTo(0.05 ** 2 / 4, 8);
    const lf = run({ f: 1, d: 1e-3, wire: 'Custom' });
    expect(res(lf, 'li') * 1e9).toBeCloseTo(50, 3);
  });

  it('solve → forward round trips: f from δ, f from Rac/Rdc', () => {
    const fwd = run({ solveFor: 'delta', f: 2.7e6 });
    const back = run({ solveFor: 'f', delta: res(fwd, 'delta'), f: 1 });
    expect(res(back, 'f') / 2.7e6).toBeCloseTo(1, 10);
    const back2 = run({ solveFor: 'fRatio', ratio: res(fwd, 'ratio'), f: 1 });
    expect(res(back2, 'f') / 2.7e6).toBeCloseTo(1, 8);
    expect(res(back2, 'delta') / res(fwd, 'delta')).toBeCloseTo(1, 8);
    // and on the asymptotic branch (a/δ > 30)
    const hf = run({ solveFor: 'delta', f: 5e9 });
    const hb = run({ solveFor: 'fRatio', ratio: res(hf, 'ratio') });
    expect(res(hb, 'f') / 5e9).toBeCloseTo(1, 7);
  });

  it('edge cases: bad inputs throw, ferromagnetic warns, no NaN', () => {
    expect(() => run({ f: 0 })).toThrow(/Frequency/);
    expect(() => run({ sigma: 0 })).toThrow(/Conductivity/);
    expect(() => run({ d: 0 })).toThrow(/diameter/);
    expect(() => run({ solveFor: 'fRatio', ratio: 1 })).toThrow(/greater than 1/);
    expect(() => run({ solveFor: 'f', delta: 0 })).toThrow();
    const st = run({ material: 'Low-carbon steel (μr ≈ 100)', sigma: 7e6, mur: 100 });
    expect(st.warnings.some((w) => w.includes('μr = 100'))).toBe(true);
    const extreme = run({ f: 1e13, d: 0.1 });
    expect(extreme.results.every((x) => typeof x.value !== 'number' || Number.isFinite(x.value))).toBe(true);
    expect(extreme.warnings.length).toBeGreaterThan(0);
  });

  it('regression: a Rac/Rdc solved at 1 Hz can be fed back as a target', () => {
    const lo = run({ solveFor: 'delta', f: 1 });
    expect(res(lo, 'ratio')).toBeGreaterThan(1);
    const back = run({ solveFor: 'fRatio', ratio: res(lo, 'ratio') });
    expect(back.ok).toBe(true);
    expect(res(back, 'f')).toBeCloseTo(1, 2);
  });

  it('regression: warns when σ is not ≫ ωε₀; asymptote shows — where invalid', () => {
    expect(run({ sigma: 1e3, f: 1e13 }).warnings.some((w) => w.includes('σ/ωε₀'))).toBe(true);
    expect(run({}).warnings.some((w) => w.includes('σ/ωε₀'))).toBe(false);
    const thin = run({ f: 1e3 }); // AWG 18, a/δ ≈ 0.24
    const asym = thin.results.find((x) => x.key === 'ratioAsym')!;
    expect(asym.value).toBeNull();
    expect(asym.display).toBe('—');
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

describe('skin depth — mode-switch regressions', () => {
  it('large ratios are shown without e-notation (2.9907e+5 read as an exponent of +525 next to "25 mm")', () => {
    const r = run({ f: 1e13, d: 25e-3, wire: 'Custom' });
    const ratio = r.results.find((x) => x.key === 'ratio')!;
    expect(ratio.display).not.toMatch(/e[+-]/);
    expect(ratio.note).not.toMatch(/e[+-]/);
    expect(r.results.find((x) => x.key === 'xOverDelta')!.display).not.toMatch(/e[+-]/);
    // toPrecision(d) switches to e-notation from 10^d up, not 10⁵ (the diagram showed d/δ = 1.02e+3)
    const al = run({ solveFor: 'f', delta: 1e-6, sigma: 1 / 2.65e-8 });
    expect(al.results.find((x) => x.key === 'ratio')!.note).toMatch(/d\/δ = 1024$/);
    const big = run({ f: 1e12, d: 25e-3, wire: 'Custom' });
    expect(big.results.find((x) => x.key === 'xOverDelta')!.display).toMatch(/^\d{1,3}(,\d{3})+$/);
  });
});

describe('skin depth — ◎ on a unit Rac/Rdc', () => {
  it('making Rac/Rdc the target at 1 mHz (ratio = 1 to double precision) starts from 2, not a red error', () => {
    const ratio = (def.fields[2] as any).fields.find((f: any) => f.key === 'ratio');
    const st: any = { ...def.defaults(), f: 1e-3 };
    def.compute(st);
    st.ratio = 1.0000000000000002; // written back by the analysis at 1 mHz
    ratio.onUnsolve(st, st);
    expect(st.solveFor).toBe('fRatio');
    expect(st.ratio).toBe(2);
    expect(def.compute(st).ok).toBe(true);
    // a real target is kept
    const t: any = { ...def.defaults(), ratio: 3.5 };
    ratio.onUnsolve(t, t);
    expect(t.ratio).toBe(3.5);
  });
});
