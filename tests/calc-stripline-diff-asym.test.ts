import { describe, expect, it } from 'vitest';
import { def, type AsymPairState } from '@/calculators/stripline-diff-asym/def';
import { accuracyBand, asymPair, equivalentB } from '@/calculators/stripline-diff-asym/model';
import { offsetStripline } from '@/calculators/asymmetric-stripline/model';
import { coupledStripline } from '@/calculators/stripline-diff/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const st = (p: Partial<AsymPairState> = {}): AsymPairState => ({ ...def.defaults(), ...p });
const run = (p: Partial<AsymPairState>) => def.compute(st(p));
const rel = (a: number, b: number) => Math.abs(a / b - 1);
const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));

describe('asymmetric edge-coupled stripline — independent references', () => {
  // scratch builderA2/xcheck.py: Cohn 1955 coupled stripline with thickness (eqs. 18/20/22) written from the paper,
  // the offset strip of pcb1/ref.py (Cohn 1960, written from the paper), b_eq by bisection. 343 random states over
  // every solve option agree with the page to ≤ 7e-15 (and each solve meets its target).
  it('matches the Python re-implementation to 1e-9', () => {
    const a = asymPair(0.1e-3, 0.15e-3, 17.5e-6, 0.125e-3, 0.3425e-3, 4.2);
    expect(rel(a.zdiff, 102.40743543273794)).toBeLessThan(1e-9);
    expect(rel(a.zcm, 32.73773868032921)).toBeLessThan(1e-9);
    expect(rel(a.zs, 58.48806576129512)).toBeLessThan(1e-9);
    const b = asymPair(0.2e-3, 0.1e-3, 35e-6, 0.254e-3, 0.508e-3, 3.66);
    expect(rel(b.zdiff, 79.02307226467245)).toBeLessThan(1e-9);
    expect(rel(b.zcm, 38.59015916070889)).toBeLessThan(1e-9);
    const c = asymPair(0.15e-3, 0.3e-3, 0, 0.3e-3, 0.1e-3, 4.4);
    expect(rel(c.zdiff, 92.14707103147077)).toBeLessThan(1e-9);
    expect(rel(c.zcm, 23.597660898709204)).toBeLessThan(1e-9);
  });

  // No published worked example of an asymmetric edge-coupled stripline with field-accurate values was found (Wadell
  // and IPC-2141A give only the offset single line). Second independent source: a 2-D finite-volume Laplace solution
  // (builder scratch builderA2/cfd.mjs on the pcb1 solver: graded mesh, 3-grid Richardson extrapolation, odd/even
  // mode by symmetry), εr = 1, H₁ = 1. 54 of the 300 sections are kept here; all 300 lie inside the stated bands.
  it('2-D field solution: inside the stated band; the plain image method is worse', () => {
    // [T, W, S, H2, Ze, Zo]
    const FD = [[0,0.25,0.25,1,240.2748,117.7055],[0,0.25,1,1,197.9513,163.3524],[0,0.25,4,1,180.9105,180.6014],[0,1,0.25,1,121.2346,72.9691],[0,1,1,1,107.0782,93.0757],[0,1,4,1,100.3797,100.2534],[0,0.25,0.25,2,270.4384,118.5529],[0,0.25,1,2,224.2952,168.15],[0,0.25,4,2,197.4407,195.3087],[0,1,0.25,2,145.9998,75.9636],[0,1,1,2,128.4551,100.7082],[0,1,4,2,115.6388,114.5366],[0,0.25,0.25,5,287.4698,118.6996],[0,0.25,1,5,240.5272,169.1124],[0,0.25,4,5,208.816,201.1532],[0,1,0.25,5,161.8014,76.6012],[0,1,1,5,143.1762,102.6632],[0,1,4,5,126.1029,120.9804],[0.1,0.25,0.25,1,215.7562,87.5306],[0.1,0.25,1,1,173.7074,135.7157],[0.1,0.25,4,1,155.1225,154.6993],[0.1,1,0.25,1,115.2665,60.8232],[0.1,1,1,1,100.6699,84.4135],[0.1,1,4,1,93.0211,92.8397],[0.1,0.25,0.25,2,245.0988,88.2071],[0.1,0.25,1,2,199.5969,140.0602],[0.1,0.25,4,2,171.3737,168.8712],[0.1,1,0.25,2,139.3199,63.1421],[0.1,1,1,2,121.6678,91.326],[0.1,1,4,2,107.9059,106.5806],[0.1,0.25,0.25,5,262.3861,88.3331],[0.1,0.25,1,5,216.1274,140.9869],[0.1,0.25,4,5,183.0979,174.692],[0.1,1,0.25,5,155.1446,63.6627],[0.1,1,1,5,136.5135,93.1786],[0.1,1,4,5,118.5868,112.9624],[0.25,0.25,0.25,1,197.4973,66.0279],[0.25,0.25,1,1,157.0866,114.788],[0.25,0.25,4,1,136.5868,135.9519],[0.25,1,0.25,1,110.0148,49.8674],[0.25,1,1,1,95.3538,76.1976],[0.25,1,4,1,86.5095,86.2218],[0.25,0.25,0.25,2,225.7609,66.5464],[0.25,0.25,1,2,182.311,118.5945],[0.25,0.25,4,2,152.4854,149.3899],[0.25,1,0.25,2,133.247,51.5832],[0.25,1,1,2,115.8649,82.2984],[0.25,1,4,2,100.9806,99.296],[0.25,0.25,0.25,5,243.3196,66.6521],[0.25,0.25,1,5,199.159,119.4721],[0.25,0.25,4,5,164.6595,155.1437],[0.25,1,0.25,5,149.093,51.9935],[0.25,1,1,5,130.8303,84.0233],[0.25,1,4,5,111.9474,105.5771]];
    expect(FD.length).toBe(54);
    let imgWorst = 0;
    for (const [t, w, s, h2, ze, zo] of FD) {
      const p = asymPair(w, s, t, 1, h2, 1);
      const b = accuracyBand(w, s, t, 1, h2);
      const ed = (p.zdiff / (2 * zo) - 1) * 100;
      const ec = (p.zcm / (ze / 2) - 1) * 100;
      const tag = `T ${t} W ${w} S ${s} H2 ${h2}`;
      expect(ed, tag).toBeGreaterThanOrEqual(b.zdiff[0]);
      expect(ed, tag).toBeLessThanOrEqual(b.zdiff[1]);
      expect(ec, tag).toBeGreaterThanOrEqual(b.zcm[0]);
      expect(ec, tag).toBeLessThanOrEqual(b.zcm[1]);
      if (t === 0 && h2 > 1) imgWorst = Math.max(imgWorst, Math.abs(p.zdiffImage / (2 * zo) - 1) * 100);
    }
    expect(imgWorst).toBeGreaterThan(2.5); // the plain image method misses by more than the model does at T = 0
  });
});

describe('asymmetric edge-coupled stripline — physics', () => {
  it('H₁ = H₂ is exactly the symmetric edge-coupled pair; S → ∞ gives the single offset trace', () => {
    for (const t of [0, 17.5e-6, 35e-6]) {
      const p = asymPair(0.1e-3, 0.2e-3, t, 0.2e-3, 0.2e-3, 4);
      const c = coupledStripline(0.1e-3, 0.2e-3, 0.4e-3 + t, t, 4);
      expect(rel(p.zdiff, c.zdiff)).toBeLessThan(1e-12);
      expect(rel(p.zcm, c.zcm)).toBeLessThan(1e-12);
    }
    const far = asymPair(0.1e-3, 20e-3, 17.5e-6, 0.1e-3, 0.3e-3, 4.2);
    const single = offsetStripline(0.1e-3, 17.5e-6, 0.1e-3, 0.3e-3, 4.2).z0;
    expect(rel(far.zdiff / 2, single)).toBeLessThan(1e-9);
    expect(rel(far.zcm * 2, single)).toBeLessThan(1e-9);
  });
  it('regression (model choice): Zdiff and Zcm rise monotonically as either plane moves away', () => {
    // the rejected image-increment model peaked near H_far/H_near ≈ 4 and fell again (an 85 Ω H₂ solve failed)
    for (const [w, s, t] of [[0.12e-3, 0.12e-3, 17.5e-6], [0.25e-3, 0.1e-3, 0], [1e-3, 1e-3, 0], [0.05e-3, 0.4e-3, 35e-6]]) {
      let prev = [0, 0];
      for (let i = 0; i <= 60; i++) {
        const h2 = 0.1e-3 * 50 ** (i / 60);
        const p = asymPair(w, s, t, 0.1e-3, h2, 4);
        expect(p.zdiff, `${w} ${s} ${t} ${h2}`).toBeGreaterThan(prev[0] * (1 - 1e-12));
        expect(p.zcm).toBeGreaterThan(prev[1] * (1 - 1e-12));
        prev = [p.zdiff, p.zcm];
      }
    }
  });
  it('b_eq lies between the two image spacings; swapping H₁ and H₂ changes nothing; Z ∝ 1/√εr; scale-free', () => {
    const b = equivalentB(0.12e-3, 17.5e-6, 0.1e-3, 0.3e-3);
    expect(b).toBeGreaterThan(0.2e-3 + 17.5e-6);
    expect(b).toBeLessThan(0.6e-3 + 17.5e-6);
    const p = asymPair(0.12e-3, 0.15e-3, 17.5e-6, 0.1e-3, 0.3e-3, 4);
    const q = asymPair(0.12e-3, 0.15e-3, 17.5e-6, 0.3e-3, 0.1e-3, 4);
    expect(rel(p.zdiff, q.zdiff)).toBeLessThan(1e-12);
    expect(asymPair(0.12e-3, 0.15e-3, 17.5e-6, 0.1e-3, 0.3e-3, 1).zdiff / p.zdiff).toBeCloseTo(2, 12);
    expect(rel(asymPair(1.2e-3, 1.5e-3, 175e-6, 1e-3, 3e-3, 4).zdiff, p.zdiff)).toBeLessThan(1e-9);
    // coupling falls as the gap opens, Zdiff rises (inside one thickness branch)
    let z = 0;
    for (const s of [0.1e-3, 0.15e-3, 0.3e-3, 0.6e-3]) {
      const r = asymPair(0.12e-3, s, 17.5e-6, 0.1e-3, 0.3e-3, 4);
      expect(r.zdiff).toBeGreaterThan(z);
      z = r.zdiff;
    }
  });
});

describe('asymmetric edge-coupled stripline — solve-for', () => {
  it('round trips W, S, H₁ and H₂ at several points (value to 1e-6, target to 1e-9)', () => {
    const pts: Partial<AsymPairState>[] = [
      { w: 0.1e-3, s: 0.15e-3, h1: 0.125e-3, h2: 0.3425e-3, t: 17.5e-6, er: 4.2 },
      { w: 0.2e-3, s: 0.3e-3, h1: 0.254e-3, h2: 0.508e-3, t: 35e-6, er: 3.66 },
      { w: 0.12e-3, s: 0.1e-3, h1: 0.2e-3, h2: 0.1e-3, t: 0, er: 4 },
    ];
    for (const p of pts) {
      const z = res(run({ ...p, solveFor: 'zdiff' }), 'zdiff');
      for (const k of ['w', 's', 'h1', 'h2'] as const) {
        const s = st({ ...p, solveFor: k, zdiff: z, [k]: (p[k] as number) * 1.9 });
        const r = runCompute(def, s);
        expect(r.ok, `${k} ${r.error}`).toBe(true);
        expect(rel(s[k] as number, p[k] as number), k).toBeLessThan(1e-6);
        expect(rel(res(run({ ...s, solveFor: 'zdiff' }), 'zdiff'), z)).toBeLessThan(1e-9);
      }
    }
  });
  it('regression: the 85 Ω PCIe example solves H₂ (failed with the image-increment model)', () => {
    const ex = def.examples!.find((e) => e.id === 'solve-h2')!;
    const s = { ...ex.state };
    const r = runCompute(def, s);
    expect(r.ok, r.error).toBe(true);
    expect(rel(res(r, 'zdiff'), 85)).toBeLessThan(1e-9);
  });
  it('a target inside Cohn’s S = 5T step returns S = 5T with a warning, not a red error', () => {
    const t = 17.5e-6;
    const base = st({ solveFor: 'zdiff', t });
    const zBelow = res(def.compute({ ...base, s: 5 * t * (1 - 1e-9) }), 'zdiff');
    const zAt = res(def.compute({ ...base, s: 5 * t }), 'zdiff');
    const s = st({ solveFor: 's', t, zdiff: (zBelow + zAt) / 2 });
    const r = runCompute(def, s);
    expect(r.ok).toBe(true);
    expect(r.status?.text).toBe('IN MODEL STEP');
    expect(rel(s.s, 5 * t)).toBeLessThan(1e-8);
  });
  it('an unreachable target is a NO SOLUTION that says what limits it', () => {
    const r = runCompute(def, st({ zdiff: 1000 }));
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.error).toMatch(/No W between .* gives Zdiff = 1 kΩ/);
    expect(runCompute(def, st({ solveFor: 's', zdiff: 300 })).error).toMatch(/2·Z₀|No S/);
  });
});

describe('asymmetric edge-coupled stripline — validity', () => {
  it('each limit triggers its warning; copper beyond the model is refused', () => {
    expect(has(run({ solveFor: 'zdiff', h1: 0.05e-3, h2: 0.4e-3, t: 10e-6 }), /far off-centre.*up to \+11 %/)).toBe(true);
    // the warning starts where the field check ends (ratio 5), as the theory says
    expect(has(run({ solveFor: 'zdiff', h1: 0.06e-3, h2: 0.31e-3, t: 10e-6 }), /far off-centre/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', w: 0.02e-3 }), /under a quarter of the nearer dielectric/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', s: 0.6e-3 }), /S\/H_near = 4.80 is outside 0.25–4/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', t: 35e-6, h1: 0.1e-3 }), /more than a quarter of the nearer dielectric/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', w: 0.05e-3, s: 0.1e-3, t: 17.5e-6 }), /Narrow traces with S between 5T and 8T/)).toBe(true);
    expect(has(run({ solveFor: 'zdiff', f: 200e9 }), /parallel-plate modes/)).toBe(true);
    expect(run({ solveFor: 'zdiff', s: 0.05e-3 }).notes.some((n) => /S < 5T/.test(n))).toBe(true);
    expect(run({ solveFor: 'zdiff', t: 0.1e-3, h1: 0.1e-3 }).error).toMatch(/too thick for the dielectric below/);
    expect(run({}).warnings).toEqual([]);
    // the card states the band of the geometry
    expect(run({}).results.find((x) => x.key === 'zdiff')?.note).toMatch(/model \+0\.5 … \+4\.5 %/);
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

describe('asymmetric edge-coupled stripline — fuzz (400 random states via runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: unknown[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 31337;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: any = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 3;
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      if (i % 2) {
        s.h2 = s.h1 * (0.3 + 4 * rnd());
        s.w = s.h1 * (0.3 + 3 * rnd());
        s.s = s.h1 * (0.3 + 3 * rnd());
        s.t = s.h1 * 0.3 * rnd();
        s.zdiff = 50 + 100 * rnd();
      }
      s.solveFor = def.solve!.options[i % 5].key;
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
      const again = runCompute(def, { ...s });
      expect(again.ok).toBe(true);
      expect(rel(res(again, 'zdiff'), res(r, 'zdiff'))).toBeLessThan(1e-9);
    }
    expect(ok).toBeGreaterThan(100); // the rest are honest refusals (copper too thick, target out of reach)
  });
  it('realistic stack-ups (300 states): every solve option succeeds for a reachable target', () => {
    let x = 2718;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const h1 = 0.05e-3 * 20 ** rnd();
      const t = h1 * 0.2 * rnd();
      const p: Partial<AsymPairState> = { h1, h2: h1 * (0.3 + 4 * rnd()), w: h1 * (0.3 + 3 * rnd()), s: Math.max(h1 * (0.3 + 3 * rnd()), 8 * t), t, er: 2 + 6 * rnd() };
      const fwd = run({ ...p, solveFor: 'zdiff' });
      if (!fwd.ok) {
        expect(fwd.error).toMatch(/too thick/);
        continue;
      }
      const z = res(fwd, 'zdiff');
      const k = (['w', 's', 'h1', 'h2'] as const)[i % 4];
      const r = runCompute(def, st({ ...p, solveFor: k, zdiff: z }));
      expect(r.ok, `${k} ${r.error}`).toBe(true);
      expect(rel(res(r, 'zdiff'), z)).toBeLessThan(1e-9);
    }
  });
});

describe('asymmetric edge-coupled stripline — examples', () => {
  it('first example equals the defaults; every example computes without warnings; fast', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...ex.state });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.graphs.length).toBe(3);
      expect(r.warnings, ex.id).toEqual([]);
    }
    const c = def.compute(st(def.examples!.find((e) => e.id === "centred")!.state));
    expect(rel(res(c, 'zdiff'), res(c, 'zdiffSym'))).toBeLessThan(1e-12);
    const t0 = performance.now();
    for (const ex of def.examples!) def.compute(st(ex.state));
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
  });
});
