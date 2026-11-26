import { describe, expect, it } from 'vitest';
import { def, type DiffPairState } from '@/calculators/differential-pair/def';
import { coupledMicrostrip, kjStatic } from '@/calculators/differential-pair/model';
import { microstripStatic } from '@/calculators/microstrip/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const st = (p: Partial<DiffPairState> = {}): DiffPairState => ({ ...def.defaults(), ...p });
const run = (p: Partial<DiffPairState>) => def.compute(st(p));
const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe('differential pair — independent references', () => {
  it('matches the Python re-implementation (scratch pcb1/ref.py, from Kirschning–Jansen 1984 / Jansen 1978) to 1e-9', () => {
    const a = coupledMicrostrip(0.2e-3, 0.2e-3, 0.2e-3, 35e-6, 4.2);
    expect(rel(a.zdiff, 110.61565560876316)).toBeLessThan(1e-9);
    expect(rel(a.zcm, 38.546765036638305)).toBeLessThan(1e-9);
    expect(rel(a.eo, 2.5442471419375114)).toBeLessThan(1e-9);
    expect(rel(a.ee, 3.068058288813175)).toBeLessThan(1e-9);
    const b = coupledMicrostrip(0.15e-3, 0.15e-3, 0.1e-3, 0, 4.4);
    expect(rel(b.zdiff, 104.866467504538)).toBeLessThan(1e-9);
    expect(rel(b.zcm, 31.238363243702388)).toBeLessThan(1e-9);
    const c = coupledMicrostrip(0.635e-3, 0.635e-3, 0.635e-3, 0, 10);
    expect(rel(c.zdiff, 84.09988773223758)).toBeLessThan(1e-9);
    expect(rel(c.ee, 7.271458616943673)).toBeLessThan(1e-9);
  });

  // No published worked example of the Kirschning–Jansen static impedances was available; the second
  // independent source is a 2-D finite-volume Laplace solution (builder scratch fd.mjs; graded mesh, 3-grid
  // Richardson extrapolation; reproduces the exact stripline to 0.03 % and Hammerstad–Jensen to 0.04 %).
  it('2-D field solution: Zdiff and Zcm inside the stated bands on all 27 cross-sections (εr 4.2)', () => {
    // [W/H, S/H, T/H, Z0e_FD, Z0o_FD]
    const GRID = [[0.5,0.3,0,129.1757,61.9637],[0.5,0.6,0,119.7258,73.4562],[0.5,1.5,0,106.5305,87.7333],[1,0.3,0,91.9061,48.6337],[1,0.6,0,86.8171,56.1919],[1,1.5,0,78.9765,65.5625],[2,0.3,0,59.4637,36.1723],[2,0.6,0,57.2775,40.3986],[2,1.5,0,53.5714,45.4887],[0.5,0.3,0.05,125.7751,56.811],[0.5,0.6,0.05,116.3716,68.8117],[0.5,1.5,0.05,103.0629,83.522],[1,0.3,0.05,90.364,45.5188],[1,0.6,0.05,85.2788,53.5939],[1,1.5,0.05,77.3305,63.3772],[2,0.3,0.05,58.8664,34.4441],[2,0.6,0.05,56.6695,39.0729],[2,1.5,0.05,52.8956,44.4732],[0.5,0.3,0.175,120.8696,48.7294],[0.5,0.6,0.175,111.6549,61.4477],[0.5,1.5,0.175,98.1653,76.9384],[1,0.3,0.175,88.0221,40.2685],[1,0.6,0.175,82.993,49.1485],[1,1.5,0.175,74.8919,59.6965],[2,0.3,0.175,57.9364,31.3645],[2,0.6,0.175,55.7416,36.6897],[2,1.5,0.175,51.8707,42.6851]];
    for (const [u, g, t, ze, zo] of GRID) {
      const o = coupledMicrostrip(u, g, 1, t, 4.2);
      const ed = (o.zo / zo - 1) * 100;
      const ec = (o.ze / ze - 1) * 100;
      const [dlo, dhi, clo, chi] = t === 0 ? [-0.2, 0.2, -0.25, 0.45] : [-0.9, 1.3, -2.7, 0.45];
      expect(ed, `u ${u} g ${g} t ${t} Zdiff`).toBeGreaterThanOrEqual(dlo);
      expect(ed, `u ${u} g ${g} t ${t} Zdiff`).toBeLessThanOrEqual(dhi);
      expect(ec, `u ${u} g ${g} t ${t} Zcm`).toBeGreaterThanOrEqual(clo);
      expect(ec, `u ${u} g ${g} t ${t} Zcm`).toBeLessThanOrEqual(chi);
    }
  });

  it('the capacitance form of Jansen’s thickness correction keeps Zdiff within 1 % here (the width form errs Zdiff by up to +5 %)', () => {
    const o = coupledMicrostrip(1, 1, 1, 0.175, 4.4);
    // FD: Z0e 76.84, Z0o 54.41 (W = S = H, T/H = 0.175, εr 4.4)
    expect(rel(o.ze, 76.84)).toBeLessThan(0.02);
    expect(rel(o.zo, 54.41)).toBeLessThan(0.01);
  });
});

describe('differential pair — physics', () => {
  it('S → ∞: both modes approach the single line; k → 0', () => {
    const o = coupledMicrostrip(0.3e-3, 3e-3, 0.2e-3, 0, 4.2);
    const z1 = microstripStatic(0.3e-3, 0.2e-3, 0, 4.2).z0;
    expect(rel(o.ze, z1)).toBeLessThan(0.01);
    expect(rel(o.zo, z1)).toBeLessThan(0.01);
    expect(o.kb).toBeLessThan(0.005);
  });
  it('t → 0 joins the zero-thickness KJ values continuously', () => {
    const a = coupledMicrostrip(0.2e-3, 0.2e-3, 0.2e-3, 1e-12, 4.2);
    const z = kjStatic(1, 1, 4.2);
    expect(rel(a.ze, z.ze)).toBeLessThan(1e-6);
    expect(rel(a.zo, z.zo)).toBeLessThan(1e-6);
  });
  it('εeff,o < εeff,e < εr; Zo < Z0 < Ze; monotonic in W, S, H, T', () => {
    const b = coupledMicrostrip(0.2e-3, 0.2e-3, 0.2e-3, 35e-6, 4.2);
    expect(b.eo).toBeLessThan(b.ee);
    expect(b.ee).toBeLessThan(4.2);
    expect(b.zo).toBeLessThan(b.z0);
    expect(b.z0).toBeLessThan(b.ze);
    expect(coupledMicrostrip(0.25e-3, 0.2e-3, 0.2e-3, 35e-6, 4.2).zdiff).toBeLessThan(b.zdiff);
    expect(coupledMicrostrip(0.2e-3, 0.25e-3, 0.2e-3, 35e-6, 4.2).zdiff).toBeGreaterThan(b.zdiff);
    expect(coupledMicrostrip(0.2e-3, 0.2e-3, 0.25e-3, 35e-6, 4.2).zdiff).toBeGreaterThan(b.zdiff);
    expect(coupledMicrostrip(0.2e-3, 0.2e-3, 0.2e-3, 50e-6, 4.2).zdiff).toBeLessThan(b.zdiff);
  });
  it('εr = 1: both modes have εeff = 1 (no dielectric) and Z scales with the geometry only', () => {
    const o = coupledMicrostrip(0.2e-3, 0.2e-3, 0.2e-3, 0, 1);
    expect(o.ee).toBeCloseTo(1, 12);
    expect(o.eo).toBeCloseTo(1, 12);
  });
});

describe('differential pair — solve-for', () => {
  it('round trips W, S and H at several points (value to 1e-6, target to 1e-9)', () => {
    const pts: Partial<DiffPairState>[] = [
      { w: 0.2e-3, s: 0.2e-3, h: 0.2e-3, t: 35e-6, er: 4.2 },
      { w: 0.1e-3, s: 0.15e-3, h: 0.1e-3, t: 17.5e-6, er: 3.66 },
      { w: 1e-3, s: 0.5e-3, h: 0.8e-3, t: 0, er: 2.2 },
    ];
    for (const p of pts) {
      const z = res(run({ ...p, solveFor: 'zdiff' }), 'zdiff');
      for (const k of ['w', 's', 'h'] as const) {
        const s = st({ ...p, solveFor: k, zdiff: z, [k]: p[k]! * 2.1 });
        const r = runCompute(def, s);
        expect(r.ok, `${k} ${r.error}`).toBe(true);
        expect(rel(s[k], p[k]!), k).toBeLessThan(1e-6);
        expect(rel(res(run({ ...s, solveFor: 'zdiff' }), 'zdiff'), z)).toBeLessThan(1e-9);
      }
    }
  });
  it('a target above 2·Z₀ cannot be reached by widening the gap: NO SOLUTION with the reason', () => {
    const r = run({ solveFor: 's', zdiff: 200 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cannot exceed it/);
  });
});

describe('differential pair — validity warnings', () => {
  const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));
  it('each fit limit triggers its warning', () => {
    expect(has(run({ solveFor: 'zdiff', w: 0.015e-3 }), /W\/H = .* outside 0.1–10/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', s: 3e-3 }), /S\/H = .* outside 0.1–10/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', t: 50e-6 }), /T\/H = 0.25/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', s: 40e-6 }), /under 1.5× the copper/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', f: 300e9 }), /TE₁ surface-wave/)).toBe(true);
    expect(run({}).warnings).toEqual([]);
    expect(run({ solveFor: 'zdiff', w: 1 }).error).toMatch(/outside 0.02–50/);
  });
});

type Num = { key: string; min: number; max: number };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: unknown[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o: any) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('differential pair — fuzz (400 random states via runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: unknown[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 99;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: any = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 3;
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      // half the states near realistic ratios so most of them compute
      if (i % 2) {
        s.w = s.h * (0.2 + 5 * rnd());
        s.s = s.h * (0.2 + 5 * rnd());
        s.t = s.h * 0.2 * rnd();
      }
      s.solveFor = def.solve!.options[i % 4].key;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, s))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const se of g.series ?? []) for (const y of se.y) expect(Number.isFinite(y), `${g.id}/${se.label}`).toBe(true);
      for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(v).not.toMatch(BAD);
      const again = runCompute(def, { ...s });
      expect(again.ok).toBe(true);
      expect(rel(res(again, 'zdiff'), res(r, 'zdiff'))).toBeLessThan(1e-9);
    }
    expect(ok).toBeGreaterThan(80); // the rest are random unreachable targets: legitimate NO SOLUTION reports
  });
  it('realistic pairs (300 states): every solve option succeeds for a reachable target', () => {
    let x = 31337;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const h = 0.05e-3 * 30 ** rnd();
      const p: Partial<DiffPairState> = { h, w: h * (0.15 + 6 * rnd()), s: h * (0.15 + 6 * rnd()), t: h * 0.17 * rnd(), er: 2 + 8 * rnd() };
      const z = res(run({ ...p, solveFor: 'zdiff' }), 'zdiff');
      const k = (['w', 's', 'h'] as const)[i % 3];
      const r = runCompute(def, st({ ...p, solveFor: k, zdiff: z }));
      expect(r.ok, `${k} ${r.error}`).toBe(true);
      expect(rel(res(r, 'zdiff'), z)).toBeLessThan(1e-9);
    }
  });
});

describe('differential pair — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = run(ex.state);
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.graphs.length).toBe(2);
    }
  });
  it('compute is fast (< 50 ms per example)', () => {
    for (const ex of def.examples!) run(ex.state);
    const t0 = performance.now();
    for (const ex of def.examples!) run(ex.state);
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
  });
});
