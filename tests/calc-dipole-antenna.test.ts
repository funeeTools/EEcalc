import { describe, expect, it } from 'vitest';
import { def } from '@/calculators/dipole-antenna/def';
import { C0, Ci, Si, calcDipole, feedImpedance } from '@/calculators/dipole-antenna/model';

const res = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;

/** Reference values from an independent Python re-implementation (scratch script, not in the repo):
 *  Si/Ci by Simpson integration of their definitions; R_r by direct numerical integration of the far-field
 *  power pattern (not the Si/Ci closed form); D by integrating F(θ)sinθ; X by the induced-EMF formula. */
const PY = {
  si2pi: 1.4181515761326302,
  ci2pi: -0.022560661746370503,
  si10: 1.6583475942188874,
  ci10: -0.04545643300444402,
  ci0001: -6.330539864080594,
  si30: 1.5667565400303474,
  ci30: -0.03303241728210038,
  // L/λ: [R_r, R_in, X_in (L/d = 1000), D]
  rows: [
    [0.1, 0.19087, 1.99885, -2176.05425, 1.50496],
    [0.5, 73.07901, 73.07901, 42.51511, 1.64092],
    [0.75, 185.68006, 371.36012, 910.8029, 1.88207],
    [1.25, 106.46322, 212.92645, -539.7669, 3.28248],
    [1.5, 105.42125, 105.42125, 45.50951, 2.22634],
  ],
};

describe('dipole antenna: special functions', () => {
  it('Si and Ci match numerical integration (series and continued-fraction branches)', () => {
    expect(Si(2 * Math.PI)).toBeCloseTo(PY.si2pi, 10);
    expect(Ci(2 * Math.PI)).toBeCloseTo(PY.ci2pi, 10);
    expect(Si(10)).toBeCloseTo(PY.si10, 10);
    expect(Ci(10)).toBeCloseTo(PY.ci10, 10);
    expect(Ci(0.001)).toBeCloseTo(PY.ci0001, 10);
    expect(Si(30)).toBeCloseTo(PY.si30, 9);
    expect(Ci(30)).toBeCloseTo(PY.ci30, 9);
    // continuity across the x = 4 branch switch
    expect(Si(4 - 1e-12)).toBeCloseTo(Si(4 + 1e-12), 11);
    expect(Ci(4 - 1e-12)).toBeCloseTo(Ci(4 + 1e-12), 11);
  });
});

describe('dipole antenna: Balanis half-wave values', () => {
  it('exact λ/2: Z_in ≈ 73.1 + j42.5 Ω, D₀ = 1.641 (2.15 dBi), HPBW ≈ 78°', () => {
    const f = 300e6;
    const r = def.compute({ ...def.defaults(), solveFor: 'xin', f, len: C0 / f / 2, d: 1e-3 });
    expect(r.ok).toBe(true);
    expect(res(r, 'rin')).toBeCloseTo(73.08, 1);
    expect(res(r, 'xin')).toBeCloseTo(42.52, 1); // 30·Si(2π) with η = 376.73 Ω
    expect(res(r, 'directivity')).toBeCloseTo(1.641, 3);
    expect(res(r, 'dBi')).toBeCloseTo(2.15, 2);
    expect(res(r, 'hpbw')).toBeCloseTo(78, 0);
  });
  it('closed forms agree with the independent pattern-integration reference over 0.1–1.5 λ', () => {
    for (const [ll, rr, rin, xin, d] of PY.rows) {
      const f = 100e6;
      const len = (ll * C0) / f;
      const o = calcDipole({ len, f, d: len / 1000, sigma: 5.8e7 });
      expect(o.rm / rr).toBeCloseTo(1, 4);
      expect(o.rin / rin).toBeCloseTo(1, 4);
      expect(o.xin / xin).toBeCloseTo(1, 4);
      expect(o.directivity / d).toBeCloseTo(1, 4);
    }
  });
  it('short dipole tends to 20π²(L/λ)² and D = 1.5 (Balanis §4.3)', () => {
    const f = 1e6;
    const ll = 0.01;
    const o = calcDipole({ len: (ll * C0) / f, f, d: 1e-3, sigma: 5.8e7 });
    // 20π² assumes η = 120π; with η₀ = 376.73 Ω the ratio is 0.9993, plus O((kL)²) terms
    expect(o.rin / (20 * Math.PI ** 2 * ll ** 2)).toBeCloseTo(1, 2);
    expect(o.directivity).toBeCloseTo(1.5, 3);
  });
  it('resonant length shortening grows with wire thickness (matches the Python table)', () => {
    const f = 100e6;
    const lam = C0 / f;
    const expected: [number, number][] = [
      [50, 0.9344],
      [100, 0.9455],
      [1000, 0.965],
      [1e4, 0.9742],
      [1e5, 0.9796],
    ];
    for (const [ld, k] of expected) {
      // solve with d chosen from the L/d ratio at the expected length, then compare
      const d = (k * lam) / 2 / ld;
      const r = def.compute({ ...def.defaults(), solveFor: 'len', f, d, xin: 0 });
      expect(res(r, 'shortening')).toBeCloseTo(k, 3);
    }
  });
});

describe('dipole antenna: solve round trips', () => {
  it('len → analysis gives the target reactance back', () => {
    const base = { ...def.defaults(), f: 50e6, d: 4e-3, xin: 15 };
    const r = def.compute({ ...base, solveFor: 'len' });
    const len = res(r, 'len');
    const back = def.compute({ ...base, solveFor: 'xin', len, xin: 0 });
    expect(res(back, 'xin')).toBeCloseTo(15, 6);
  });
  it('f → len round trip', () => {
    const base = { ...def.defaults(), len: 3.1, d: 1e-3, xin: 0 };
    const r = def.compute({ ...base, solveFor: 'f' });
    const f = res(r, 'f');
    expect(feedImpedance(3.1, f, 1e-3).xin).toBeCloseTo(0, 6);
    const r2 = def.compute({ ...base, solveFor: 'len', f, len: 1 });
    expect(res(r2, 'len')).toBeCloseTo(3.1, 8);
  });
});

describe('dipole antenna: edge cases', () => {
  it('exact full-wave throws a helpful error instead of ∞', () => {
    expect(() => def.compute({ ...def.defaults(), solveFor: 'xin', f: 300e6, len: C0 / 300e6 })).toThrow(/whole number of wavelengths/);
  });
  it('near antiresonance warns; thick wire warns; very short is rejected', () => {
    const near = def.compute({ ...def.defaults(), solveFor: 'xin', f: 300e6, len: 0.97 });
    expect(near.warnings.some((w) => w.includes('antiresonance'))).toBe(true);
    const fat = def.compute({ ...def.defaults(), solveFor: 'len', f: 100e6, d: 0.05 });
    expect(fat.warnings.some((w) => w.includes('thick dipole'))).toBe(true);
    expect(() => def.compute({ ...def.defaults(), solveFor: 'xin', f: 1e3, len: 1 })).toThrow(/below 0.005/);
    expect(() => def.compute({ ...def.defaults(), d: 0 })).toThrow();
  });
  it('unreachable target reactance returns ok with NO SOLUTION, never NaN', () => {
    const r = def.compute({ ...def.defaults(), solveFor: 'len', xin: 5e4 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.results.every((x) => x.value === null || Number.isFinite(x.value as number))).toBe(true);
  });
  it('every example computes, with finite results and graph data', () => {
    for (const ex of def.examples ?? []) {
      const r = def.compute({ ...def.defaults(), ...ex.state });
      expect(r.ok, ex.id).toBe(true);
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${ex.id} ${x.key}`).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite), `${ex.id} ${g.id} ${s.label}`).toBe(true);
    }
  });
});

describe('dipole antenna: review regressions', () => {
  it('short dipoles do not get the full-wave antiresonance warning', () => {
    const short = def.compute({ ...def.defaults(), ...(def.examples ?? []).find((e) => e.id === 'short')!.state });
    expect(short.warnings.some((w) => w.includes('antiresonance'))).toBe(false);
    const tiny = def.compute({ ...def.defaults(), solveFor: 'xin', f: 30e6, len: 0.08 * (C0 / 30e6), d: 1e-3 });
    expect(tiny.warnings.some((w) => w.includes('antiresonance'))).toBe(false);
    const near2 = def.compute({ ...def.defaults(), solveFor: 'xin', f: 300e6, len: 1.97, d: 2e-3 });
    expect(near2.warnings.some((w) => w.includes('2λ antiresonance'))).toBe(true);
  });
  it('NO SOLUTION reports the reachable X_in range instead of blaming wire thickness', () => {
    for (const st of [
      { solveFor: 'len' as const, f: 7e6, d: 1e-3, xin: -1500 },
      { solveFor: 'len' as const, f: 14.2e6, d: 2e-3, xin: 2000 },
      { solveFor: 'f' as const, len: 10, d: 2e-3, xin: 2000 },
    ]) {
      const r = def.compute({ ...def.defaults(), ...st });
      expect(r.status?.text).toBe('NO SOLUTION');
      expect(r.warnings[0]).toMatch(/only spans .* to .* over that window/);
      expect(r.warnings[0]).not.toMatch(/too thick/);
    }
  });
  it('split-lobe note follows θ_max (broadside strongest up to ≈ 1.44 λ)', () => {
    const at = (ll: number) => def.compute({ ...def.defaults(), solveFor: 'xin', f: 100e6, len: (ll * C0) / 100e6, d: 1e-3 });
    expect(at(1.4).notes.some((n) => n.includes('strongest lobe'))).toBe(false);
    expect(res(at(1.4), 'thetaMax')).toBeCloseTo(90, 6);
    expect(at(1.5).notes.some((n) => n.includes('strongest lobe'))).toBe(true);
  });
  it('thick-wire warning threshold matches its text (L/d ≳ 100)', () => {
    const at = (ld: number) => def.compute({ ...def.defaults(), solveFor: 'xin', f: 100e6, len: 1.4, d: 1.4 / ld });
    expect(at(80).warnings.some((w) => w.includes('thick dipole'))).toBe(true);
    expect(at(120).warnings.some((w) => w.includes('thick dipole'))).toBe(false);
  });
  it('L/λ exactly 0.005 is accepted (float rounding)', () => {
    const f = 1e6;
    expect(() => def.compute({ ...def.defaults(), solveFor: 'xin', f, len: (0.005 * C0) / f, d: 1e-4 })).not.toThrow();
  });
});

describe('dipole — mode switches (review regressions)', () => {
  const field = (key: string): any => def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === key);
  it('analysis of a resonant length reads X_in = 0 exactly, not solver residue', () => {
    const st: any = { ...def.defaults() };
    st.len = res(def.compute(st), 'len');
    st.solveFor = 'xin';
    expect(res(def.compute(st), 'xin')).toBe(0);
  });
  it('◎ L / ◎ f from an analysis whose reactance the first-resonance window cannot reach targets resonance (was NO SOLUTION)', () => {
    for (const [id, key] of [['short', 'len'], ['short', 'f'], ['full-wave', 'len'], ['full-wave', 'f']] as const) {
      const st: any = { ...def.defaults(), ...def.examples!.find((e) => e.id === id)!.state };
      st.xin = res(def.compute(st), 'xin');
      field(key).onSolve({}, st);
      expect(st.solveFor).toBe(key);
      expect(st.xin).toBe(0);
      const r = def.compute(st);
      expect(r.status?.text).not.toBe('NO SOLUTION');
      expect(res(r, key)).toBeGreaterThan(0);
    }
    // a reachable analysis reactance stays the target (round trip)
    const st: any = { ...def.defaults(), ...def.examples!.find((e) => e.id === 'ideal-half-wave')!.state };
    st.xin = res(def.compute(st), 'xin');
    const x = st.xin;
    field('len').onSolve({}, st);
    expect(st.xin).toBe(x);
    expect(res(def.compute(st), 'len') / st.len).toBeCloseTo(1, 6);
  });
});

describe('dipole — page text (review regression)', () => {
  it('the whole-wavelength error does not use the word "null" (read as a missing value)', () => {
    expect(() => def.compute({ ...def.defaults(), solveFor: 'xin', f: 3e9, len: (5 * C0) / 3e9 })).toThrow(/whole number of wavelengths/);
    try {
      def.compute({ ...def.defaults(), solveFor: 'xin', f: 3e9, len: (5 * C0) / 3e9 });
    } catch (e) {
      expect(String(e)).not.toMatch(/\bnull\b/);
    }
  });
});
