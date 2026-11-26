import { describe, expect, it } from 'vitest';
import { def, type StriplineDiffState } from '@/calculators/stripline-diff/def';
import { accuracyBand, coupledStripline, fringeCap, TB_MAX, wheelerZair, zeroThickness, ETA0 } from '@/calculators/stripline-diff/model';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<StriplineDiffState>) => def.compute({ ...def.defaults(), ...p });

describe('edge-coupled stripline — independent references', () => {
  it('matches the Python re-implementation (Carlson R_F elliptic integrals, Cohn 1955 + Wheeler 1978)', () => {
    // python3 refs.py: coupled(W, S, b, t, εr)
    const a = coupledStripline(150e-6, 200e-6, 600e-6, 35e-6, 4.2); // S ≥ 5t branch
    expect(a.zdiff).toBeCloseTo(98.66306274145948, 9);
    expect(a.ze).toBeCloseTo(67.51243513543695, 9);
    expect(a.zs).toBeCloseTo(58.63714229458398, 9);
    const b = coupledStripline(150e-6, 100e-6, 600e-6, 35e-6, 3.66); // S < 5t branch
    expect(b.branch).toBe('close');
    expect(b.zdiff).toBeCloseTo(83.95751008554895, 9);
    expect(b.zcm).toBeCloseTo(39.50880740198554, 9);
    const c = coupledStripline(0.25e-3, 0.1e-3, 0.5e-3, 0, 4.4); // exact, t = 0
    expect(c.zdiff).toBeCloseTo(76.37563652842768, 9);
    expect(c.kb).toBeCloseTo(0.18755043195635088, 12);
    const d = coupledStripline(3e-3, 0.5e-3, 1e-3, 10e-6, 2.2); // wide strips, k → 1 numerics
    expect(d.ze).toBeCloseTo(18.52156145189398, 9);
    expect(d.zo).toBeCloseTo(17.79262372430852, 9);
  });

  it('2-D finite-difference Laplace solution: exact at t = 0 (FD 107.155 / 93.221 Ω, W = S = b/2, air)', () => {
    const z0 = coupledStripline(1, 1, 2, 0, 1);
    expect(Math.abs(z0.ze / 107.155 - 1)).toBeLessThan(2e-5);
    expect(Math.abs(z0.zo / 93.2208 - 1)).toBeLessThan(1e-4);
  });

  it('stated accuracy band covers the field solution on the whole 140-point FD grid (t/b 0.05–0.2, W/b 0.15–1, S 1.5t–12t)', () => {
    // [t/b, W/b, S/t, Zdiff error %, Zcm error %]: (Cohn − FD)/FD, FD = sparse 5-point Laplace, 3-grid Richardson (builder scratch fd_grid.py)
    const GRID: number[][] = [[0.05,0.15,1.5,1.42,-3.91],[0.05,0.15,3,1.58,-3.51],[0.05,0.15,4.5,1.61,-3.02],[0.05,0.15,5,5.73,-2.86],[0.05,0.15,6,4.47,-2.55],[0.05,0.15,8,2.87,-2.01],[0.05,0.15,12,1.3,-1.2],[0.05,0.25,1.5,0.89,-1.94],[0.05,0.25,3,1.05,-1.88],[0.05,0.25,4.5,1.12,-1.7],[0.05,0.25,5,4.28,-1.63],[0.05,0.25,6,3.29,-1.48],[0.05,0.25,8,2.07,-1.19],[0.05,0.25,12,0.93,-0.73],[0.05,0.35,1.5,0.63,-1.11],[0.05,0.35,3,0.78,-1.17],[0.05,0.35,4.5,0.87,-1.1],[0.05,0.35,5,3.52,-1.07],[0.05,0.35,6,2.67,-0.99],[0.05,0.35,8,1.65,-0.82],[0.05,0.35,12,0.72,-0.52],[0.05,0.5,1.5,0.44,-0.61],[0.05,0.5,3,0.57,-0.72],[0.05,0.5,4.5,0.65,-0.72],[0.05,0.5,5,2.86,-0.71],[0.05,0.5,6,2.14,-0.67],[0.05,0.5,8,1.29,-0.58],[0.05,0.5,12,0.55,-0.38],[0.05,1.0,1.5,0.23,-0.27],[0.05,1.0,3,0.31,-0.36],[0.05,1.0,4.5,0.36,-0.39],[0.05,1.0,5,1.91,-0.39],[0.05,1.0,6,1.4,-0.38],[0.05,1.0,8,0.82,-0.34],[0.05,1.0,12,0.32,-0.24],[0.15,0.15,1.5,0.33,-5.89],[0.15,0.15,3,1.17,-3.61],[0.15,0.15,4.5,2.41,-2.0],[0.15,0.15,5,1.78,-1.63],[0.15,0.15,6,1.05,-1.07],[0.15,0.15,8,0.35,-0.47],[0.15,0.15,12,-0.0,-0.13],[0.15,0.25,1.5,-0.17,-3.53],[0.15,0.25,3,0.79,-2.31],[0.15,0.25,4.5,2.0,-1.3],[0.15,0.25,5,1.33,-1.05],[0.15,0.25,6,0.8,-0.68],[0.15,0.25,8,0.31,-0.27],[0.15,0.25,12,0.06,-0.03],[0.15,0.35,1.5,-0.45,-2.46],[0.15,0.35,3,0.52,-1.74],[0.15,0.35,4.5,1.66,-1.02],[0.15,0.35,5,1.02,-0.83],[0.15,0.35,6,0.59,-0.55],[0.15,0.35,8,0.21,-0.24],[0.15,0.35,12,0.01,-0.06],[0.15,0.5,1.5,-0.66,-1.75],[0.15,0.5,3,0.26,-1.35],[0.15,0.5,4.5,1.28,-0.84],[0.15,0.5,5,0.71,-0.71],[0.15,0.5,6,0.38,-0.5],[0.15,0.5,8,0.08,-0.27],[0.15,0.5,12,-0.07,-0.13],[0.15,1.0,1.5,-0.71,-1.05],[0.15,1.0,3,-0.02,-0.89],[0.15,1.0,4.5,0.69,-0.6],[0.15,1.0,5,0.37,-0.53],[0.15,1.0,6,0.15,-0.4],[0.15,1.0,8,-0.04,-0.26],[0.15,1.0,12,-0.14,-0.17],[0.1,0.15,1.5,0.91,-5.34],[0.1,0.15,3,1.17,-4.01],[0.1,0.15,4.5,1.6,-2.8],[0.1,0.15,5,3.32,-2.47],[0.1,0.15,6,2.28,-1.9],[0.1,0.15,8,1.1,-1.1],[0.1,0.15,12,0.25,-0.38],[0.1,0.25,1.5,0.34,-2.97],[0.1,0.25,3,0.71,-2.42],[0.1,0.25,4.5,1.2,-1.75],[0.1,0.25,5,2.45,-1.55],[0.1,0.25,6,1.67,-1.19],[0.1,0.25,8,0.83,-0.68],[0.1,0.25,12,0.23,-0.2],[0.1,0.35,1.5,0.05,-1.92],[0.1,0.35,3,0.45,-1.69],[0.1,0.35,4.5,0.94,-1.27],[0.1,0.35,5,1.94,-1.13],[0.1,0.35,6,1.31,-0.89],[0.1,0.35,8,0.63,-0.52],[0.1,0.35,12,0.17,-0.16],[0.1,0.5,1.5,-0.16,-1.25],[0.1,0.5,3,0.22,-1.2],[0.1,0.5,4.5,0.68,-0.95],[0.1,0.5,5,1.49,-0.86],[0.1,0.5,6,0.98,-0.69],[0.1,0.5,8,0.45,-0.43],[0.1,0.5,12,0.09,-0.16],[0.1,1.0,1.5,-0.3,-0.68],[0.1,1.0,3,-0.0,-0.72],[0.1,1.0,4.5,0.33,-0.61],[0.1,1.0,5,0.91,-0.56],[0.1,1.0,6,0.57,-0.46],[0.1,1.0,8,0.23,-0.31],[0.1,1.0,12,0.0,-0.15],[0.2,0.15,1.5,-0.1,-5.93],[0.2,0.15,3,1.7,-2.92],[0.2,0.15,4.5,3.89,-1.3],[0.2,0.15,5,0.87,-0.99],[0.2,0.15,6,0.41,-0.58],[0.2,0.15,8,0.04,-0.24],[0.2,0.15,12,-0.09,-0.11],[0.2,0.25,1.5,-0.53,-3.76],[0.2,0.25,3,1.31,-1.96],[0.2,0.25,4.5,3.33,-0.87],[0.2,0.25,5,0.66,-0.66],[0.2,0.25,6,0.33,-0.37],[0.2,0.25,8,0.07,-0.13],[0.2,0.25,12,-0.03,-0.04],[0.2,0.35,1.5,-0.8,-2.77],[0.2,0.35,3,0.99,-1.56],[0.2,0.35,4.5,2.82,-0.75],[0.2,0.35,5,0.45,-0.58],[0.2,0.35,6,0.18,-0.36],[0.2,0.35,8,-0.02,-0.18],[0.2,0.35,12,-0.09,-0.1],[0.2,0.5,1.5,-0.98,-2.1],[0.2,0.5,3,0.65,-1.3],[0.2,0.5,4.5,2.25,-0.7],[0.2,0.5,5,0.22,-0.57],[0.2,0.5,6,0.02,-0.41],[0.2,0.5,8,-0.14,-0.26],[0.2,0.5,12,-0.2,-0.21],[0.2,1.0,1.5,-0.98,-1.34],[0.2,1.0,3,0.22,-0.92],[0.2,1.0,4.5,1.31,-0.56],[0.2,1.0,5,0.02,-0.48],[0.2,1.0,6,-0.11,-0.38],[0.2,1.0,8,-0.21,-0.29],[0.2,1.0,12,-0.25,-0.25]];
    expect(GRID.length).toBe(140);
    for (const [t, w, k, ezd, ezc] of GRID) {
      const o = coupledStripline(w, k * t, 1, t, 1);
      const band = accuracyBand(w, k * t, 1, t)!;
      expect(band.checked).toBe(true);
      expect(ezd, `t ${t} W ${w} S ${k}t Zdiff`).toBeGreaterThanOrEqual(band.zdiff[0]);
      expect(ezd, `t ${t} W ${w} S ${k}t Zdiff`).toBeLessThanOrEqual(band.zdiff[1]);
      expect(ezc, `t ${t} W ${w} S ${k}t Zcm`).toBeGreaterThanOrEqual(band.zcm[0]);
      expect(ezc, `t ${t} W ${w} S ${k}t Zcm`).toBeLessThanOrEqual(band.zcm[1]);
      expect(o.zdiff).toBeGreaterThan(0);
    }
  });

  it('review worst cases are inside the band the page states (independent reviewer FD: +2.67 %, +2.14 %, −1.89 %, −1.28 %, −3.65 %, −3.05 %)', () => {
    const cases: [number, number, number, 'zdiff' | 'zcm', number][] = [
      [0.05, 0.35, 0.3, 'zdiff', 2.67], // t/b, W/b, S/b, quantity, error %
      [0.05, 0.5, 0.3, 'zdiff', 2.14],
      [0.1, 0.35, 0.2, 'zcm', -1.89],
      [0.1, 0.5, 0.2, 'zcm', -1.28],
      [0.1, 0.2, 0.2, 'zcm', -3.65],
      [0.1, 0.2, 0.3, 'zcm', -3.05],
    ];
    for (const [t, w, sb, q, err] of cases) {
      const band = accuracyBand(w, sb, 1, t)!;
      expect(err).toBeGreaterThanOrEqual(band[q][0]);
      expect(err).toBeLessThanOrEqual(band[q][1]);
    }
    // and the page shows the band beside the result, with a warning when it exceeds ±2.5 %
    const r = run({ solveFor: 'zdiff', w: 0.2e-3, s: 0.2e-3, b: 1e-3, t: 0.1e-3 });
    expect(r.results.find((x) => x.key === 'zcm')!.note).toMatch(/model error −6.5 … \+0.5 %/);
    expect(r.warnings.some((w) => w.startsWith('Accuracy for this geometry'))).toBe(true);
  });

  it('Pozar Ex. 3.5 (4e): 50 Ω stripline, b = 3.2 mm, εr = 2.2 → W ≈ 2.66 mm (Pozar’s fit is ±1 %): isolated-strip limit agrees', () => {
    // isolated strip: zeroThickness().cs at a very wide gap; solve W by bisection for 50 Ω
    let lo = 0.5e-3;
    let hi = 6e-3;
    const z = (w: number) => ETA0 / Math.sqrt(2.2) / zeroThickness(w, 1, 3.2e-3).cs;
    for (let i = 0; i < 80; i++) {
      const m = (lo + hi) / 2;
      if (z(m) > 50) lo = m;
      else hi = m;
    }
    expect(Math.abs(lo / 2.66e-3 - 1)).toBeLessThan(0.01);
  });

  it('Cohn fringing capacitance: C′f(0)/ε = 2 ln2/π and rises with t/b; Wheeler reduces to its zero-thickness form', () => {
    expect(fringeCap(0)).toBeCloseTo((2 * Math.LN2) / Math.PI, 15);
    expect(fringeCap(1e-12)).toBeCloseTo(fringeCap(0), 9);
    expect(fringeCap(0.1)).toBeGreaterThan(fringeCap(0.05));
    expect(wheelerZair(1e-3, 2e-3, 1e-15)).toBeCloseTo(wheelerZair(1e-3, 2e-3, 0), 6);
    // Wheeler (1978) vs the exact K/K' at t = 0: within his stated 0.5 %
    for (const wb of [0.1, 0.3, 1, 3]) {
      const exact = ETA0 / zeroThickness(wb, 1e3, 1).cs;
      expect(Math.abs(wheelerZair(wb, 1, 0) / exact - 1)).toBeLessThan(0.005);
    }
  });
});

describe('edge-coupled stripline — physics', () => {
  it('t → 0 reduces exactly to Cohn’s zero-thickness solution', () => {
    // corrections vanish like (t/b)·ln(t/b): at t/b = 2e-12 they are below 1e-9
    const a = coupledStripline(0.2e-3, 0.3e-3, 0.5e-3, 1e-15, 4);
    const b = coupledStripline(0.2e-3, 0.3e-3, 0.5e-3, 0, 4);
    expect(a.zdiff / b.zdiff).toBeCloseTo(1, 8);
    expect(a.zcm / b.zcm).toBeCloseTo(1, 8);
  });
  it('S → ∞: both modes → isolated strip, k → 0; Zdiff → 2Z₀', () => {
    for (const t of [0, 35e-6]) {
      const o = coupledStripline(0.15e-3, 20e-3, 0.6e-3, t, 4.2);
      expect(o.ze / o.zs).toBeCloseTo(1, 9);
      expect(o.zo / o.zs).toBeCloseTo(1, 9);
      expect(o.kb).toBeLessThan(1e-9);
    }
  });
  it('impedances scale as 1/√εr exactly (TEM)', () => {
    const a = coupledStripline(0.1e-3, 0.15e-3, 0.4e-3, 17e-6, 1);
    const b = coupledStripline(0.1e-3, 0.15e-3, 0.4e-3, 17e-6, 4);
    expect(a.zdiff / b.zdiff).toBeCloseTo(2, 12);
    expect(a.zcm / b.zcm).toBeCloseTo(2, 12);
  });
  it('scale invariance: multiplying W, S, b, t by 10 leaves Z unchanged', () => {
    const a = coupledStripline(0.1e-3, 0.15e-3, 0.4e-3, 17e-6, 3.5);
    const b = coupledStripline(1e-3, 1.5e-3, 4e-3, 170e-6, 3.5);
    expect(a.zdiff / b.zdiff).toBeCloseTo(1, 12);
  });
  it('monotonic: Zdiff falls with W and t, rises with S and b; Zo < Zs < Ze', () => {
    const base = coupledStripline(0.12e-3, 0.2e-3, 0.4e-3, 17e-6, 4);
    expect(coupledStripline(0.14e-3, 0.2e-3, 0.4e-3, 17e-6, 4).zdiff).toBeLessThan(base.zdiff);
    expect(coupledStripline(0.12e-3, 0.25e-3, 0.4e-3, 17e-6, 4).zdiff).toBeGreaterThan(base.zdiff);
    expect(coupledStripline(0.12e-3, 0.2e-3, 0.5e-3, 17e-6, 4).zdiff).toBeGreaterThan(base.zdiff);
    expect(coupledStripline(0.12e-3, 0.2e-3, 0.4e-3, 35e-6, 4).zdiff).toBeLessThan(base.zdiff);
    expect(base.zo).toBeLessThan(base.zs);
    expect(base.zs).toBeLessThan(base.ze);
  });
});

describe('edge-coupled stripline — solve-for', () => {
  it('round trips W, S and b at several points (target recovered to 1e-6)', () => {
    const pts: Partial<StriplineDiffState>[] = [
      { w: 0.1e-3, s: 0.2e-3, b: 0.4e-3, t: 17.5e-6, er: 4 },
      { w: 0.3e-3, s: 0.1e-3, b: 0.6e-3, t: 35e-6, er: 3.66 },
      { w: 50e-6, s: 60e-6, b: 0.2e-3, t: 0, er: 3 },
      { w: 1e-3, s: 2e-3, b: 1.5e-3, t: 18e-6, er: 2.2 },
    ];
    for (const p of pts) {
      const z = coupledStripline(p.w!, p.s!, p.b!, p.t!, p.er!).zdiff;
      for (const k of ['w', 's', 'b'] as const) {
        const r = run({ ...p, solveFor: k, zdiff: z, [k]: p[k]! * 2.7 });
        expect(r.ok, `${k} ${r.error}`).toBe(true);
        expect(res(r, k) / p[k]!).toBeCloseTo(1, 6);
        const fwd = run({ ...p, solveFor: 'zdiff', [k]: res(r, k) });
        expect(res(fwd, 'zdiff') / z).toBeCloseTo(1, 9);
      }
    }
  });
  it('unreachable targets give NO SOLUTION with a reason; a target in the S = 5t step gives S = 5t with a warning', () => {
    const r = run({ solveFor: 's', zdiff: 400 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/2·Z₀|cannot exceed/);
    // step: narrow traces, t = 35 µm → zdiff jumps at S = 175 µm
    const p = { w: 150e-6, b: 600e-6, t: 35e-6, er: 4.2 };
    const lo = coupledStripline(p.w, 175e-6 * (1 - 1e-9), p.b, p.t, p.er).zdiff;
    const hi = coupledStripline(p.w, 175e-6, p.b, p.t, p.er).zdiff;
    expect(hi).toBeGreaterThan(lo);
    const g = run({ ...p, solveFor: 's', zdiff: (lo + hi) / 2 });
    expect(g.ok).toBe(true);
    expect(res(g, 's') / 175e-6).toBeCloseTo(1, 6);
    expect(g.status?.text).toBe('IN MODEL STEP');
    expect(g.warnings[0]).toMatch(/step at S = 5t/);
    // the nearer side of the step: here the target sits nearer one of lo / hi
    const near = Math.abs(lo - (lo + hi) / 2) <= Math.abs(hi - (lo + hi) / 2) ? lo : hi;
    expect(res(g, 'zdiff')).toBeCloseTo(near, 9);
  });
  it('regression: PCIe example → FR-4 stripline preset lands the gap target in the S = 5t step: answer, not a red error', () => {
    const ex = def.examples!.find((e) => e.id === 'pcie-85')!;
    const st = { ...def.defaults(), ...ex.state } as StriplineDiffState;
    const mat = def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === 'material');
    st.material = 'FR-4 (stripline, ~1 GHz)';
    mat.apply(st.material, st, st);
    const r = def.compute(st);
    expect(r.ok).toBe(true);
    expect(res(r, 's') / (5 * st.t)).toBeCloseTo(1, 6);
    expect(r.warnings.join(' ')).toMatch(/step at S = 5t/);
  });
});

describe('edge-coupled stripline — validity warnings', () => {
  it('t/b > 0.1 warns, W/b < 0.15 warns (unchecked), large band warns, parallel-plate mode', () => {
    expect(run({ solveFor: 'zdiff', w: 0.15e-3, s: 0.1e-3, b: 0.3e-3, t: 35e-6 }).warnings.some((w) => w.includes('t/b'))).toBe(true);
    expect(run({ solveFor: 'zdiff', w: 0.04e-3, s: 0.2e-3, b: 0.4e-3, t: 17.5e-6 }).warnings.some((w) => w.includes('narrower than the field-solver check'))).toBe(true);
    expect(run({ solveFor: 'zdiff', w: 150e-6, s: 200e-6, b: 600e-6, t: 35e-6, er: 4.2 }).warnings.some((w) => w.startsWith('Accuracy for this geometry'))).toBe(true);
    expect(run({ solveFor: 'zdiff', b: 3e-3, w: 1e-3, s: 1e-3, f: 50e9 }).warnings.some((w) => w.includes('parallel-plate'))).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
  it('t/b above the checked limit is refused with the reason (review: t = 0.999b gave 0.21 Ω)', () => {
    const r = run({ solveFor: 'zdiff', t: 0.999 * 0.4e-3, b: 0.4e-3 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/t\/b = 0.999 is above 0.2/);
    expect(run({ solveFor: 'zdiff', t: TB_MAX * 0.4e-3 * 0.999, b: 0.4e-3 }).ok).toBe(true);
    // solving b never goes below t/TB_MAX
    const sb = run({ solveFor: 'b', zdiff: 30, t: 35e-6, w: 0.3e-3, s: 0.1e-3 });
    if (sb.ok) expect(35e-6 / res(sb, 'b')).toBeLessThanOrEqual(TB_MAX + 1e-12);
  });
  it('solved and analysed values never leave the field limits (W, S, b 1 µm–50 mm; Zdiff 1–1000 Ω)', () => {
    let x = 4321;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 600; i++) {
      const lg = (a: number, b: number) => a * (b / a) ** rnd();
      const st = { ...def.defaults(), zdiff: lg(1, 1000), w: lg(1e-6, 0.05), s: lg(1e-6, 0.05), b: lg(1e-6, 0.05), t: 0.2 * rnd() * 1e-4, er: lg(1, 100), solveFor: def.solve!.options[i % 4].key as StriplineDiffState['solveFor'] };
      const r = def.compute(st);
      if (!r.ok) continue;
      const v = res(r, st.solveFor);
      if (st.solveFor === 'zdiff') {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(1000);
      } else {
        expect(v).toBeGreaterThanOrEqual(1e-6);
        expect(v).toBeLessThanOrEqual(0.05);
      }
    }
    const low = run({ solveFor: 'zdiff', w: 0.04, s: 1e-6, b: 0.4e-3, t: 0, er: 100 });
    expect(low.ok).toBe(false);
    expect(low.error).toMatch(/outside 1–1000 Ω/);
  });
  it('bad input is reported, not thrown', () => {
    expect(run({ solveFor: 'zdiff', t: 1e-3, b: 0.5e-3 }).ok).toBe(false);
    expect(run({ solveFor: 'zdiff', w: 0.04, b: 100e-6 }).ok).toBe(false);
    expect(run({ er: 0.5 }).ok).toBe(false);
  });
});

// ── generic fuzz over the field spec
type Num = { key: string; min: number; max: number; optional?: boolean };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, optional: f.optional });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
function fuzz(n: number, seed: number) {
  const nums: Num[] = [];
  const sels: { key: string; options: (string | number)[] }[] = [];
  collect(def.fields, nums, sels);
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const out: StriplineDiffState[] = [];
  for (let i = 0; i < n; i++) {
    const s: Record<string, unknown> = { ...def.defaults() };
    for (const f of nums) {
      if (f.optional && rnd() < 0.2) s[f.key] = null;
      else s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
    }
    for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
    s.solveFor = def.solve!.options[i % def.solve!.options.length].key;
    out.push(s as unknown as StriplineDiffState);
  }
  return out;
}
const BAD = /NaN|undefined|Infinity/;

describe('edge-coupled stripline — fuzz (400 random states)', () => {
  it('never throws; finite or null results; clean strings; finite graphs; stable recompute', () => {
    let ok = 0;
    for (const st of fuzz(400, 4242)) {
      let r: CalcReport;
      expect(() => (r = def.compute(st))).not.toThrow();
      r = def.compute(st);
      if (!r.ok) {
        expect(r.error && r.error.length > 5).toBe(true);
        expect(r.error).not.toMatch(BAD);
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y), `${g.id}/${s.label}`).toBe(true);
      for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(v).not.toMatch(BAD);
      // stability: write the solved value back and recompute
      const solved = r.results.find((x) => x.solved);
      const again = def.compute({ ...st, [st.solveFor]: solved!.value as number });
      expect(again.ok).toBe(true);
      for (const k of ['zdiff', 'zcm', 'zodd', 'zeven']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 9);
    }
    expect(ok).toBeGreaterThan(60); // the rest are legitimate NO SOLUTION / out-of-range reports
  });
  it('realistic stack-ups (300 states, t ≤ 0.1b, 0.1 ≤ W/b, S/b ≤ 10, reachable targets): all solve', () => {
    let x = 777;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const b = 0.1e-3 * 30 ** rnd();
      const p = { w: b * 0.1 * 100 ** rnd(), s: b * 0.1 * 100 ** rnd(), b, t: b * 0.1 * rnd(), er: 2 + 4 * rnd(), f: 1e9 };
      const solveFor = def.solve!.options[i % 4].key as StriplineDiffState['solveFor'];
      const z = coupledStripline(p.w, p.s, p.b, p.t, p.er).zdiff;
      const r = run({ ...p, solveFor, zdiff: z });
      // the uncoupled limit (S ≫ b) is the only allowed failure; the S = 5t step answers S = 5t
      if (!r.ok) {
        expect(r.error).toMatch(/uncoupled limit/);
        continue;
      }
      if ((r.details as any)?.step) continue;
      expect(res(r, 'zdiff') / z).toBeCloseTo(1, 9);
    }
  });
});

describe('edge-coupled stripline — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = run(ex.state);
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.graphs.length).toBeGreaterThan(0);
    }
  });
  it('compute is fast (< 50 ms)', () => {
    const t0 = performance.now();
    for (const ex of def.examples!) run(ex.state);
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
  });
  it('wide gap (k = 0): the coupling note has no −Infinity dB', () => {
    const r = def.compute({ ...def.defaults(), s: 10e-3 });
    const kb = r.results.find((x) => x.key === 'kb')!;
    expect(kb.note).not.toMatch(/Infinity|NaN/);
  });
});
