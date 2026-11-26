import { describe, expect, it } from 'vitest';
import { def, type DualState } from '@/calculators/dual-stripline/def';
import { dualStripline, parallelRun } from '@/calculators/dual-stripline/model';
import { stackScale } from '@/calculators/dual-stripline/scale';
import { offsetStripline } from '@/calculators/asymmetric-stripline/model';
import { broadside } from '@/calculators/broadside-coupled/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const st = (p: Partial<DualState> = {}): DualState => ({ ...def.defaults(), ...p });
const run = (p: Partial<DualState>) => def.compute(st(p));
const rel = (a: number, b: number) => Math.abs(a / b - 1);
const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));

describe('dual stripline — independent references', () => {
  // scratch builderA2/xcheck.py: offset strip (Cohn 1960 + exact-centred anchor + image thickness, pcb1/ref.py, written
  // from the papers) composed per layer from the stack, and the broadside pair at the mean H. 319 random states
  // over every solve option agree with the page to ≤ 1e-9 (worst 2.8e-14).
  it('matches the Python re-implementation to 1e-9', () => {
    const a = dualStripline(0.12e-3, 0.15e-3, 17.5e-6, 0.125e-3, 0.25e-3, 0.2e-3, 4.2);
    expect(rel(a.l1.z0, 55.781087866167965)).toBeLessThan(1e-9);
    expect(rel(a.l2.z0, 59.52463885901168)).toBeLessThan(1e-9);
    expect(rel(parallelRun(0.135e-3, 17.5e-6, 0.125e-3, 0.25e-3, 0.2e-3, 4.2).kb, 0.2064143626068343)).toBeLessThan(1e-9);
    const b = dualStripline(0.3e-3, 0.3e-3, 35e-6, 0.254e-3, 0.508e-3, 0.254e-3, 3.66);
    expect(rel(b.l1.z0, 53.87481132418392)).toBeLessThan(1e-9);
    const c = dualStripline(0.1e-3, 0.2e-3, 0, 0.1e-3, 0.1e-3, 0.3e-3, 4.0);
    expect(rel(c.l1.z0, 61.260740117854226)).toBeLessThan(1e-9);
    expect(rel(c.l2.z0, 55.06626128818485)).toBeLessThan(1e-9);
  });

  // No published dual-stripline worked example with an exact answer was found. Second independent source: each layer
  // is an offset stripline, whose model was checked against a 2-D field solution (asymmetric-stripline tests, 60
  // sections, +0 … +2.6 %); here the composition is checked against that model with the stack mapped by hand.
  it('each layer is the offset stripline of its own near and far dielectric', () => {
    const s = st({ w1: 0.11e-3, w2: 0.16e-3, h1: 0.1e-3, d: 0.3e-3, h2: 0.2e-3, t: 35e-6 });
    const o = dualStripline(s.w1, s.w2, s.t, s.h1, s.d, s.h2, s.er);
    expect(rel(o.l1.z0, offsetStripline(0.11e-3, 35e-6, 0.1e-3, 0.3e-3 + 35e-6 + 0.2e-3, 4.2).z0)).toBeLessThan(1e-14);
    expect(rel(o.l2.z0, offsetStripline(0.16e-3, 35e-6, 0.2e-3, 0.3e-3 + 35e-6 + 0.1e-3, 4.2).z0)).toBeLessThan(1e-14);
    expect(o.b).toBeCloseTo(0.1e-3 + 0.3e-3 + 0.2e-3 + 70e-6, 15);
    // symmetric stack: the parallel-run pair is exactly the broadside-coupled page’s model
    const p = parallelRun(0.12e-3, 17.5e-6, 0.125e-3, 0.25e-3, 0.125e-3, 4.2);
    const bs = broadside(0.12e-3, 0.25e-3, 0.125e-3, 17.5e-6, 4.2);
    expect(p.exact).toBe(true);
    expect(rel(p.kb, bs.kb)).toBeLessThan(1e-15);
  });
});

describe('dual stripline — physics', () => {
  it('symmetric stack: both layers equal; swapping H₁ and H₂ swaps the layers', () => {
    const r = run({ solveFor: 'z0' });
    expect(rel(res(r, 'z01'), res(r, 'z02'))).toBeLessThan(1e-12);
    const a = dualStripline(0.12e-3, 0.15e-3, 17.5e-6, 0.1e-3, 0.2e-3, 0.3e-3, 4);
    const b = dualStripline(0.15e-3, 0.12e-3, 17.5e-6, 0.3e-3, 0.2e-3, 0.1e-3, 4);
    expect(rel(a.l1.z0, b.l2.z0)).toBeLessThan(1e-12);
    expect(rel(a.l2.z0, b.l1.z0)).toBeLessThan(1e-12);
  });
  it('a thicker layer gap raises both impedances (towards the single-plane limit) and lowers the coupling', () => {
    let z = 0;
    let kb = 1;
    for (const d of [0.05e-3, 0.1e-3, 0.2e-3, 0.4e-3, 0.8e-3]) {
      const o = dualStripline(0.12e-3, 0.12e-3, 17.5e-6, 0.125e-3, d, 0.125e-3, 4.2);
      const p = parallelRun(0.12e-3, 17.5e-6, 0.125e-3, d, 0.125e-3, 4.2);
      expect(o.l1.z0).toBeGreaterThan(z);
      expect(p.kb).toBeLessThan(kb);
      z = o.l1.z0;
      kb = p.kb;
    }
    // far-plane limit: a huge D leaves the near plane only; Z₀ saturates
    const z1 = dualStripline(0.12e-3, 0.12e-3, 0, 0.125e-3, 20e-3, 0.125e-3, 4.2).l1.z0;
    const z2 = dualStripline(0.12e-3, 0.12e-3, 0, 0.125e-3, 40e-3, 0.125e-3, 4.2).l1.z0;
    expect(rel(z1, z2)).toBeLessThan(2e-3);
  });
  it('Z ∝ 1/√εr; delay = √εr/c on both layers; dimensions scale out', () => {
    const a = run({ solveFor: 'z0', er: 1 });
    const b = run({ solveFor: 'z0', er: 4 });
    expect(res(a, 'z01') / res(b, 'z01')).toBeCloseTo(2, 12);
    expect(res(b, 'tpd') * 299792458).toBeCloseTo(2, 12);
    const c = dualStripline(1.2e-3, 1.2e-3, 175e-6, 1.25e-3, 2.5e-3, 1.25e-3, 4.2);
    const d = dualStripline(0.12e-3, 0.12e-3, 17.5e-6, 0.125e-3, 0.25e-3, 0.125e-3, 4.2);
    expect(rel(c.l1.z0, d.l1.z0)).toBeLessThan(1e-12);
  });
  it('one-scale drawing: copper never thinner than 5 px; wide traces run off; heights compressed when needed', () => {
    const a = stackScale(0.12e-3, 5e-6, [0.125e-3, 0.25e-3, 0.125e-3], 2, 164, 300);
    expect(a.tPx).toBeCloseTo(5, 9); // thin copper held at 5 px, the heights then compressed
    expect(a.heightsToScale).toBe(false);
    const a2 = stackScale(0.12e-3, 17.5e-6, [0.125e-3, 0.25e-3, 0.125e-3], 2, 164, 300);
    expect(a2.tPx).toBeGreaterThanOrEqual(5);
    expect(a2.heightsToScale).toBe(true);
    expect((a.k * 0.12e-3) / a.tPx).toBeCloseTo(0.12e-3 / 5e-6, 9); // W : T kept
    const b = stackScale(5e-3, 35e-6, [0.1e-3, 0.3e-3, 0.1e-3], 2, 164, 300);
    expect(b.cut).toBe(true);
    const c = stackScale(0.12e-3, 17.5e-6, [0.125e-3, 2e-3, 0.125e-3], 2, 164, 300);
    expect(c.heightsToScale).toBe(false);
    expect(c.hPx.reduce((x, y) => x + y, 0) + 2 * c.tPx).toBeCloseTo(164, 6);
    expect(Math.min(...c.hPx)).toBeGreaterThanOrEqual(16 - 1e-9);
  });
});

describe('dual stripline — solve-for', () => {
  it('round trips W (both layers), H₁, H₂ and εr at several points (value to 1e-6, target to 1e-9)', () => {
    const pts: Partial<DualState>[] = [
      { w1: 0.12e-3, w2: 0.12e-3, h1: 0.125e-3, d: 0.25e-3, h2: 0.125e-3, t: 17.5e-6, er: 4.2 },
      { w1: 0.1e-3, w2: 0.18e-3, h1: 0.1e-3, d: 0.2e-3, h2: 0.2e-3, t: 35e-6, er: 3.66 },
      { w1: 0.3e-3, w2: 0.25e-3, h1: 0.3e-3, d: 0.4e-3, h2: 0.25e-3, t: 0, er: 3 },
    ];
    for (const p of pts) {
      const f = run({ ...p, solveFor: 'z0' });
      const z01 = res(f, 'z01');
      const z02 = res(f, 'z02');
      for (const k of ['w', 'h1', 'h2', 'er'] as const) {
        const start: Partial<DualState> = k === 'w' ? { w1: 1e-3, w2: 1e-3 } : { [k]: (p[k] as number) * (k === 'er' ? 0.6 : 2.2) };
        const s = st({ ...p, solveFor: k, z01, z02, ...start });
        const r = runCompute(def, s);
        expect(r.ok, `${k} ${r.error}`).toBe(true);
        for (const key of k === 'w' ? (['w1', 'w2'] as const) : [k]) expect(rel(s[key] as number, p[key] as number), key).toBeLessThan(1e-6);
        // the consistent state: both impedances as before, the computed one written back
        expect(rel(s.z01, z01)).toBeLessThan(1e-9);
        expect(rel(s.z02, z02)).toBeLessThan(1e-9);
      }
    }
  });
  it('an unreachable target is a NO SOLUTION that names the range; the solve-W failure blanks both widths', () => {
    const r = runCompute(def, st({ z01: 400 }));
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.error).toMatch(/No W₁ gives Z₀₁ = 400 Ω \(W₁ = 1 µm … 50 mm gives/);
    expect(runCompute(def, st({ z02: 400 })).error).toMatch(/No W₂ gives Z₀₂ = 400 Ω/);
    expect(runCompute(def, st({ solveFor: 'er', z01: 200 })).error).toMatch(/No εr gives Z₀₁/);
  });
  it('a laminate preset while solving εr returns to analysis (target does not carry over)', () => {
    const s = st({ solveFor: 'er' });
    runCompute(def, s);
    const sel = def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === 'material');
    s.material = 'RO4350B';
    sel.apply('RO4350B', s, s);
    expect(s.solveFor).toBe('z0');
    expect(runCompute(def, s).ok).toBe(true);
  });
});

describe('dual stripline — validity', () => {
  it('each limit triggers its warning; copper beyond the thin-strip limit is refused', () => {
    expect(has(run({ solveFor: 'z0', t: 35e-6, h1: 0.1e-3 }), /Layer 1: T\/\(2H \+ T\) = 0.149 > 0.1/)).toBe(true);
    expect(has(run({ solveFor: 'z0', t: 35e-6, h1: 0.05e-3 }), /Layer 1: T\/\(2H \+ T\) = 0.259 > 0.2/)).toBe(true);
    expect(has(run({ solveFor: 'z0', h1: 0.05e-3, d: 0.3e-3 }), /Layer 1: the far plane is \d+(\.\d+)?× further/)).toBe(true);
    // threshold = the field-check range (5), as in the theory: 5.2× warns
    expect(has(run({ solveFor: 'z0', h1: 0.1e-3, d: 0.3825e-3, h2: 0.12e-3 }), /Layer 1: the far plane is 5.2\d× further/)).toBe(true);
    expect(has(run({ solveFor: 'z0', w2: 0.02e-3 }), /Layer 2: W is under a quarter/)).toBe(true);
    expect(has(run({ solveFor: 'z0', f: 200e9 }), /parallel-plate modes/)).toBe(true);
    expect(has(run({}), /couple broadside: k_b ≈ 18.0 %/)).toBe(true);
    // weak coupling (wide traces, thick gap): a note, not a warning
    const mid = run({ solveFor: 'z0', w1: 0.3e-3, w2: 0.3e-3, d: 1e-3 });
    expect(mid.warnings.some((w) => /broadside/.test(w))).toBe(false);
    expect(mid.notes.some((w) => /would couple broadside with k_b ≈ 1\.\d %/.test(w))).toBe(true);
    expect(mid.notes.some((w) => /k_b is an underestimate/.test(w))).toBe(true);
    // regression: loosely coupled, Cohn’s even-mode formula gave a negative k_b (−0.9 % at W = 0.5, D = 1.9 mm): no k_b now
    const far = run({ solveFor: 'z0', w1: 0.5e-3, w2: 0.5e-3, d: 1.9e-3 });
    expect(far.notes.some((w) => /broadside model is out of range, so no k_b is given/.test(w))).toBe(true);
    expect(res(far, 'kbPar')).toBeNull();
    expect(run({ solveFor: 'z0', d: 1.5e-3 }).results.find((x) => x.key === 'kbPar')?.display).toBe('not computed');
    for (const w of [0.12e-3, 0.5e-3]) for (let d = 0.02e-3; d < 3e-3; d *= 1.3) {
      const p = parallelRun(w, 17.5e-6, 0.125e-3, d, 0.125e-3, 4.2);
      if (p.valid) expect(p.kb).toBeGreaterThan(0);
    }
    expect(run({ solveFor: 'z0', t: 0.3e-3, h1: 0.1e-3 }).error).toMatch(/too thick for the dielectric next to layer 1/);
    // the parallel-run estimate is flagged for an asymmetric stack
    expect(run({ solveFor: 'z0', h2: 0.2e-3 }).notes.some((n) => /estimate/.test(n))).toBe(true);
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

describe('dual stripline — fuzz (400 random states via runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: unknown[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 4242;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: any = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 3;
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      if (i % 2) {
        s.h2 = s.h1 * (0.3 + 3 * rnd());
        s.d = s.h1 * (0.3 + 3 * rnd());
        s.w1 = s.h1 * (0.3 + 4 * rnd());
        s.w2 = s.h1 * (0.3 + 4 * rnd());
        s.t = s.h1 * 0.3 * rnd();
        s.z01 = 20 + 80 * rnd();
        s.z02 = 20 + 80 * rnd();
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
      expect(rel(res(again, 'z01'), res(r, 'z01'))).toBeLessThan(1e-9);
      expect(rel(res(again, 'z02'), res(r, 'z02'))).toBeLessThan(1e-9);
    }
    expect(ok).toBeGreaterThan(150);
  });
  it('realistic stack-ups (300 states): every solve option succeeds for a reachable target', () => {
    let x = 99;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const h1 = 0.05e-3 * 20 ** rnd();
      const p: Partial<DualState> = { h1, h2: h1 * (0.5 + 2 * rnd()), d: h1 * (0.5 + 3 * rnd()), w1: h1 * (0.3 + 3 * rnd()), w2: h1 * (0.3 + 3 * rnd()), t: h1 * 0.2 * rnd(), er: 2 + 6 * rnd() };
      const fwd = run({ ...p, solveFor: 'z0' });
      expect(fwd.ok, fwd.error).toBe(true);
      const k = (['w', 'h1', 'h2', 'er'] as const)[i % 4];
      const z01 = res(fwd, 'z01');
      const z02 = res(fwd, 'z02');
      const r = runCompute(def, st({ ...p, solveFor: k, z01, z02 }));
      expect(r.ok, `${k} ${r.error}`).toBe(true);
      expect(rel(res(r, 'z01'), z01)).toBeLessThan(1e-9);
      expect(rel(res(r, 'z02'), z02)).toBeLessThan(1e-9);
    }
  });
});

describe('dual stripline — examples', () => {
  it('first example equals the defaults; every example computes; fast', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...ex.state });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.graphs.length).toBe(2);
      // the only warning the examples raise is the broadside one (it applies to every stack shown)
      expect(r.warnings.every((w) => /couple broadside/.test(w)), ex.id).toBe(true);
    }
    const t0 = performance.now();
    for (const ex of def.examples!) def.compute(st(ex.state));
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
  });
});
