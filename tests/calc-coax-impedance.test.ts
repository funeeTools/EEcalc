import { describe, expect, it } from 'vitest';
import { def } from '@/calculators/coax-impedance/def';
import { bessel01, coaxZ0, te11Kc } from '@/calculators/coax-impedance/model';

type R = { results: { key: string; value: unknown }[] };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Record<string, unknown>) => def.compute({ ...def.defaults(), ...p } as any);

describe('coax impedance', () => {
  it('IEEE Std 287 7 mm precision air line (D = 7.000 mm, d = 3.040 mm) is 50 Ω', () => {
    const r = run({ solveFor: 'z0', D: 7e-3, d: 3.04e-3, er: 1, tanD: 0, cable: 'Custom', dielectric: 'Custom' });
    expect(res(r, 'z0')).toBeCloseTo(50.0, 1);
    // C′ = 2π ε0 / ln(D/d) = 66.7 pF/m, velocity factor 1
    expect(res(r, 'cPer') * 1e12).toBeCloseTo(66.71, 1);
    expect(res(r, 'vf')).toBeCloseTo(1, 12);
  });

  it('matches an independent Python re-implementation (LMR-400-style defaults, RG-58/U)', () => {
    const d = run({});
    expect(res(d, 'z0')).toBeCloseTo(49.5205, 3);
    expect(res(d, 'cPer') * 1e12).toBeCloseTo(79.2456, 3);
    expect(res(d, 'lPer') * 1e9).toBeCloseTo(194.3327, 3);
    expect(res(d, 'fcTe11') / 16.656649e9).toBeCloseTo(1, 6);
    // exact γ with Kelvin-function inner impedance (Python, 600-digit Decimal)
    expect(res(d, 'alphaC') * 100).toBeCloseTo(11.58675, 4);
    expect(res(d, 'alpha') * 100).toBeCloseTo(13.72959, 4);
    expect(res(d, 'alphaD') * 100).toBeCloseTo(2.14168, 4);
    const rg = run(def.examples!.find((e) => e.id === 'rg58')!.state);
    expect(res(rg, 'z0')).toBeCloseTo(51.6653, 3);
    expect(res(rg, 'alpha') * 100).toBeCloseTo(11.55933, 4);
    expect(res(rg, 'fcTe11') / 34.803044e9).toBeCloseTo(1, 6);
  });

  it('A&S Bessel approximations agree with the series (Wronskian J1Y0 − J0Y1 = 2/(πx))', () => {
    for (const x of [0.05, 0.3, 1, 2, 2.9, 3.5, 6]) {
      const b = bessel01(x);
      expect((b.j1 * b.y0 - b.j0 * b.y1) * ((Math.PI * x) / 2)).toBeCloseTo(1, 6);
    }
    expect(bessel01(1).j0).toBeCloseTo(0.7651976866, 7);
    expect(bessel01(1).y1).toBeCloseTo(-0.7812128213, 6);
  });

  it('TE11 root: limits and Python cross-check values', () => {
    // b/a → 1: kc(a+b)/2 → 1;  b/a → ∞: kc·b → p′11 = 1.84118 (circular guide, A&S Table 9.5)
    expect(te11Kc(1 / 1.01, 1) * (1 + 1 / 1.01) / 2).toBeCloseTo(1.0000041, 5);
    expect(te11Kc(0.5, 1) * 0.75).toBeCloseTo(1.016004, 5);
    expect(te11Kc(0.01, 1) * 1).toBeCloseTo(1.840798, 4);
    expect(te11Kc(1e-4, 1)).toBeCloseTo(1.84118, 2);
  });

  it('solve → forward round trips for D, d and εr', () => {
    const base = { D: 5.2e-3, d: 1.3e-3, er: 2.1, cable: 'Custom', dielectric: 'Custom' };
    const z0 = coaxZ0(base.D, base.d, base.er);
    for (const k of ['D', 'd', 'er'] as const) {
      const r = run({ ...base, solveFor: k, z0, [k]: 1 });
      expect(r.ok).toBe(true);
      expect(res(r, k) / base[k]).toBeCloseTo(1, 10);
      expect(res(r, 'z0')).toBeCloseTo(z0, 9);
    }
  });

  it('impossible εr target gives NO SOLUTION, not NaN', () => {
    const r = run({ solveFor: 'er', z0: 200, D: 3e-3, d: 1e-3 });
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.error).toMatch(/air gives only/);
    expect(r.results).toEqual([]);
  });

  it('edge cases: D ≤ d and zero inputs throw; above TE11 warns', () => {
    expect(() => run({ D: 1e-3, d: 2e-3 })).toThrow(/larger/);
    expect(() => run({ d: 0 })).toThrow();
    expect(() => run({ f: 0 })).toThrow();
    const hi = run({ f: 20e9 });
    expect(hi.warnings.some((w) => w.includes('TE₁₁'))).toBe(true);
    const thin = run({ D: 1.001e-3, d: 1e-3 });
    expect(thin.warnings.some((w) => w.includes('barely above 1'))).toBe(true);
  });

  it('regression: solved εr / d / D outside the field limits give NO SOLUTION, nothing written back', () => {
    for (const p of [{ solveFor: 'er', z0: 1, D: 3.5e-3, d: 1e-3 }, { solveFor: 'd', z0: 1000, D: 5e-3, er: 1 }, { solveFor: 'D', z0: 1000, d: 1e-6, er: 1 }]) {
      const r = run(p);
      expect(r.ok, p.solveFor).toBe(false);
      expect(r.status?.text, p.solveFor).toBe('NO SOLUTION');
      expect(r.results).toEqual([]);
      expect(r.error).toMatch(/would need/);
    }
  });

  it('regression: low frequency uses the exact γ and inner-wire resistance, and warns', () => {
    const r = run({ f: 1e3 });
    // Python: exact γ with Kelvin inner impedance and thick-wall shield → 0.018931 dB/100 m, |Zc| = 87.42 Ω
    expect(res(r, 'alpha') * 100).toBeCloseTo(0.0189313, 6);
    expect(r.warnings.some((w) => w.includes('lower bound') && w.includes('|Zc|'))).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/87\.4\d? Ω/);
    expect(run({}).warnings.some((w) => w.includes('lower bound'))).toBe(false);
  });

  it('regression: notes — stranded note only when analysing, tan δ note after solving εr', () => {
    const st = { cable: 'RG-174/U (stranded)', d: 0.48e-3, D: 1.52e-3, dielectric: 'Solid PE (VF 0.66)', er: 2.25, tanD: 0.0004 };
    expect(run({ ...st, solveFor: 'z0' }).notes.some((n) => n.includes('stranded'))).toBe(true);
    expect(run({ ...st, solveFor: 'D', z0: 50 }).notes.some((n) => n.includes('stranded'))).toBe(false);
    const s2: any = { ...def.defaults(), solveFor: 'er', z0: 40 };
    def.sync!(s2);
    const r = def.compute(s2);
    s2.er = res(r, 'er');
    def.sync!(s2);
    expect(def.compute(s2).notes.some((n) => n.includes('tan δ'))).toBe(true);
  });

  it('every example computes with ok: true and finite results and graphs', () => {
    for (const ex of def.examples!) {
      const r = run(ex.state);
      expect(r.ok, ex.id).toBe(true);
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${ex.id}.${x.key}`).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite), `${ex.id}.${g.id}`).toBe(true);
    }
  });
});

describe('coax impedance — mode-switch regressions', () => {
  const dielectric = (def.fields[1] as any).fields.find((f: any) => f.key === 'dielectric');
  it('picking a dielectric preset while solving εr analyses the diameters instead of bouncing back to Custom', () => {
    const st: any = { ...def.defaults(), solveFor: 'er', z0: 50, dielectric: 'Custom' };
    def.compute(st);
    st.dielectric = 'PTFE (VF 0.69)';
    dielectric.apply('PTFE (VF 0.69)', st, st);
    expect(st.solveFor).toBe('z0');
    expect(st.er).toBe(2.08);
    const r = def.compute(st);
    expect(r.ok).toBe(true);
    def.sync!(st);
    expect(st.dielectric).toBe('PTFE (VF 0.69)');
    // the analysis of the entered diameters with the preset εr
    expect(r.results.find((x) => x.key === 'z0')!.value as number).toBeCloseTo((376.730313 / (2 * Math.PI * Math.sqrt(2.08))) * Math.log(7.24 / 2.74), 3);
  });
});
