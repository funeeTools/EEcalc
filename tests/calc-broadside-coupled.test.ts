import { describe, expect, it } from 'vitest';
import { def, type BroadsideState } from '@/calculators/broadside-coupled/def';
import { broadside, cohnThin } from '@/calculators/broadside-coupled/model';
import { offsetStripline } from '@/calculators/asymmetric-stripline/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const st = (p: Partial<BroadsideState> = {}): BroadsideState => ({ ...def.defaults(), ...p });
const run = (p: Partial<BroadsideState>) => def.compute(st(p));
const rel = (a: number, b: number) => Math.abs(a / b - 1);
const IN = 0.0254;

describe('broadside pair — published table and independent references', () => {
  it('Rogers Design Note 3.2.1 example designs (Cohn 1960): coupler Z₀ and coupling reproduced to the table’s digits', () => {
    // [laminate, outer board (H), centre board (S), line width (W) in inches, εr, coupling dB, Z₀ = √(Z₀ₑZ₀ₒ)]
    const TABLE: [string, number, number, number, number, number, number][] = [
      ['5880', 0.031, 0.005, 0.2, 2.2, 1.47, 9.83],
      ['5870', 0.031, 0.005, 0.2, 2.33, 1.47, 9.55],
      ['6002', 0.03, 0.005, 0.06, 2.94, 1.88, 23.53],
      ['6006', 0.05, 0.01, 0.1, 6.15, 2.22, 17.5],
      ['6010', 0.05, 0.01, 0.125, 10.2, 2.11, 11.39],
      ['TMM-3', 0.06, 0.015, 0.2, 3.27, 2.42, 17.36],
      ['TMM-10', 0.05, 0.015, 0.175, 9.2, 2.82, 10.68],
    ];
    for (const [name, h, s, w, er, cdb, z0] of TABLE) {
      const o = broadside(w * IN, s * IN, h * IN, 0, er);
      // Cohn and Rogers used 377 Ω (188.3, 296.1); η₀ = 376.73 Ω here, 0.07 % lower
      expect(Math.abs(o.z0 - z0), `${name} Z₀`).toBeLessThan(0.016);
      expect(Math.abs(-20 * Math.log10(o.kb) - cdb), `${name} coupling`).toBeLessThan(0.011);
    }
  });

  it('matches the Python re-implementation (scratch pcb1/ref.py; Cohn’s k by 80-digit bisection) to 1e-9', () => {
    const a = broadside(0.15e-3, 0.3e-3, 0.2e-3, 17.5e-6, 4.2);
    expect(rel(a.zdiff, 96.51818350957306)).toBeLessThan(1e-9);
    expect(rel(a.zcm, 36.34076373094639)).toBeLessThan(1e-9);
    const b = broadside(1.2e-3, 0.1e-3, 0.5e-3, 17.5e-6, 3.66);
    expect(rel(b.zdiff, 13.517394684639132)).toBeLessThan(1e-9);
    expect(rel(b.ze, 54.96113376261356)).toBeLessThan(1e-9);
    const c = broadside(0.25e-3, 1e-3, 0.5e-3, 0, 1);
    expect(rel(c.zo, 139.91709941943566)).toBeLessThan(1e-9);
    expect(rel(c.ze, 167.8077560893065)).toBeLessThan(1e-9);
  });

  it('2-D field solution (builder finite-volume solver) on 25 cross-sections: inside the stated bands (εr = 1)', () => {
    // [W, S, H, T, Z0e_FD, Z0o_FD]
    const GRID = [[1,0.2,0.5,0.035,112.043,25.918],[1,0.2,0.5,0.07,108.713,25.394],[0.5,0.2,0.5,0.035,159.719,44.187],[2,0.5,1,0.07,110.392,30.35],[0.3,0.2,0.4,0.035,172.748,60.578],[1,0.1,1,0.05,177.21,15.43],[0.6,0.4,0.6,0.035,152.833,60.569],[1.5,0.15,0.3,0.035,58.127,13.647],[0.25,1,0.5,0,180.7923,139.7996],[0.25,1,0.5,0.05,165.7908,125.1479],[0.5,2,1,0.05,171.7865,130.9822],[0.3,0.6,1,0.1,215.2175,103.067],[1,0.5,0.25,0.05,62.5723,36.6571],[0.15,0.3,0.5,0.0875,203.1529,96.1052],[0.6,0.2,1,0.035,213.8482,40.5004],[2,0.2,0.5,0.1,67.9646,13.9297],[0.5,0.5,0.5,0.035,144.7793,73.582],[0.2,0.5,2,0.035,327.0659,125.5913],[1,1,1,0.1,142.5188,72.2092],[0.4,0.1,0.3,0.035,137.9794,30.8822],[0.1,0.08,0.5,0.035,278.6649,66.266],[0.2,0.15,1,0.05,289.0578,65.6994],[0.1,0.05,0.4,0.035,265.3902,49.5201],[2,0.2,0.5,0.1,67.9646,13.9297],[0.15,0.1,0.8,0.035,300.7799,61.5717]];
    for (const [w, s, h, t, ze, zo] of GRID) {
      const o = broadside(w, s, h, t, 1);
      const eo = (o.zo / zo - 1) * 100;
      const ee = (o.ze / ze - 1) * 100;
      expect(eo, `W ${w} S ${s} Zdiff`).toBeGreaterThanOrEqual(-0.1);
      expect(eo, `W ${w} S ${s} Zdiff`).toBeLessThanOrEqual(1.2);
      const narrow = w / (2 * h + 2 * t) < 0.2;
      const [lo, hi] = w >= s ? (narrow ? [-1.8, 0.05] : [-0.65, 0.05]) : w >= s / 2 ? [-2.6, 0.05] : [-7.2, 0.05];
      expect(ee, `W ${w} S ${s} Zcm`).toBeGreaterThanOrEqual(lo);
      expect(ee, `W ${w} S ${s} Zcm`).toBeLessThanOrEqual(hi);
    }
  });
});

describe('broadside pair — physics', () => {
  it('Cohn’s parameter: w(k) → 0 as k → s; wide strips keep precision (no NaN at W/b = 40)', () => {
    expect(cohnThin(1e-9, 0.3).y).toBeCloseTo(Math.atanh(0.3), 4);
    const wide = cohnThin(40, 0.2);
    expect(Number.isFinite(wide.ce) && Number.isFinite(wide.co)).toBe(true);
    // parallel-plate limit for wide strips: odd C/ε → W/(S/2) to the mid-plane + W/((b−S)/2) to the plane, plus fringing
    const pp = 40 / 0.1 + 40 / 0.4;
    expect(wide.co / pp).toBeGreaterThan(1);
    expect(wide.co / pp).toBeLessThan(1.01);
  });
  it('odd mode is the offset stripline against the mid-plane (shared model)', () => {
    const o = broadside(0.15e-3, 0.3e-3, 0.2e-3, 17.5e-6, 4.2);
    expect(rel(o.zo, offsetStripline(0.15e-3, 17.5e-6, 0.2e-3, 0.15e-3, 4.2).z0)).toBeLessThan(1e-12);
  });
  it('Zo < Ze; S → large: modes approach the single trace; Z ∝ 1/√εr', () => {
    const o = broadside(0.15e-3, 0.3e-3, 0.2e-3, 17.5e-6, 4.2);
    expect(o.zo).toBeLessThan(o.ze);
    const far = broadside(0.15e-3, 5e-3, 0.2e-3, 0, 4.2);
    expect(far.kb).toBeLessThan(0.02);
    const a = broadside(0.15e-3, 0.3e-3, 0.2e-3, 17.5e-6, 1);
    expect(a.zdiff / o.zdiff).toBeCloseTo(Math.sqrt(4.2), 12);
  });
  it('monotonic: Zdiff falls with W and T, rises with S and H', () => {
    const z = (w: number, s: number, h: number, t: number) => broadside(w, s, h, t, 4.2).zdiff;
    const b = z(0.15e-3, 0.3e-3, 0.2e-3, 17.5e-6);
    expect(z(0.18e-3, 0.3e-3, 0.2e-3, 17.5e-6)).toBeLessThan(b);
    expect(z(0.15e-3, 0.35e-3, 0.2e-3, 17.5e-6)).toBeGreaterThan(b);
    expect(z(0.15e-3, 0.3e-3, 0.25e-3, 17.5e-6)).toBeGreaterThan(b);
    expect(z(0.15e-3, 0.3e-3, 0.2e-3, 35e-6)).toBeLessThan(b);
  });
});

describe('broadside pair — solve-for', () => {
  it('round trips W, S and H at several points (value to 1e-6, target to 1e-9)', () => {
    const pts: Partial<BroadsideState>[] = [
      { w: 0.15e-3, s: 0.3e-3, h: 0.2e-3, t: 17.5e-6, er: 4.2 },
      { w: 0.5e-3, s: 0.1e-3, h: 0.3e-3, t: 17.5e-6, er: 3.66 },
      { w: 0.1e-3, s: 0.2e-3, h: 0.1e-3, t: 0, er: 3 },
    ];
    for (const p of pts) {
      const z = res(run({ ...p, solveFor: 'zdiff' }), 'zdiff');
      for (const k of ['w', 's', 'h'] as const) {
        const s = st({ ...p, solveFor: k, zdiff: z, [k]: p[k]! * 2.5 });
        const r = runCompute(def, s);
        expect(r.ok, `${k} ${r.error}`).toBe(true);
        expect(rel(s[k], p[k]!), k).toBeLessThan(1e-6);
        expect(rel(res(run({ ...s, solveFor: 'zdiff' }), 'zdiff'), z)).toBeLessThan(1e-9);
      }
    }
  });
  it('unreachable target: NO SOLUTION with the reason', () => {
    const r = run({ solveFor: 's', zdiff: 600 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cannot exceed it/);
  });
});

describe('broadside pair — validity', () => {
  const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));
  it('loose coupling, thick copper and parallel-plate modes warn; copper thicker than the limit is refused', () => {
    expect(has(run({ solveFor: 'zdiff', w: 0.15e-3, s: 0.4e-3 }), /W < S\/2: loosely coupled/)).toBe(true);
    expect(run({ solveFor: 'zdiff', w: 0.15e-3, s: 0.2e-3 }).notes.some((n) => /W < S: Cohn/.test(n))).toBe(true);
    expect(has(run({ solveFor: 'zdiff', w: 0.05e-3, s: 0.4e-3 }), /under a quarter of the gap/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', s: 0.12e-3, t: 17.5e-6 }), /thick relative to the gap/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', f: 150e9 }), /parallel-plate modes/)).toBe(true);
    expect(run({ solveFor: 'zdiff', s: 40e-6, t: 35e-6 }).error).toMatch(/too thick for the gap/);
    expect(run({}).warnings).toEqual([]);
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

describe('broadside pair — fuzz (400 random states via runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: unknown[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 8080;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: any = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 3;
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      if (i % 2) {
        s.w = s.s * (0.3 + 8 * rnd());
        s.h = s.s * (0.3 + 3 * rnd());
        s.t = s.s * 0.25 * rnd();
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
    expect(ok).toBeGreaterThan(80);
  });
  it('realistic stack-ups (300 states): every solve option succeeds for a reachable target', () => {
    let x = 4711;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const s = 0.05e-3 * 20 ** rnd();
      const p: Partial<BroadsideState> = { s, h: s * (0.4 + 3 * rnd()), w: s * (0.3 + 8 * rnd()), t: s * 0.2 * rnd(), er: 2 + 6 * rnd() };
      const fwd = run({ ...p, solveFor: 'zdiff' });
      if (!fwd.ok) {
        expect(fwd.error).toMatch(/too thick/);
        continue;
      }
      const z = res(fwd, 'zdiff');
      const k = (['w', 's', 'h'] as const)[i % 3];
      const r = runCompute(def, st({ ...p, solveFor: k, zdiff: z }));
      expect(r.ok, `${k} ${r.error}`).toBe(true);
      expect(rel(res(r, 'zdiff'), z)).toBeLessThan(1e-9);
    }
  });
});

describe('broadside pair — examples', () => {
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
