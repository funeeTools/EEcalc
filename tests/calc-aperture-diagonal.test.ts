import { describe, expect, it } from 'vitest';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { def, type ApState } from '@/calculators/aperture-diagonal/def';
import { cornerGrowth, gridUp, growth } from '@/calculators/aperture-diagonal/model';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const BAD = /NaN|undefined|Infinity/;

// ── generic fuzz support: random states inside every field's min/max and every select option
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
function randomState(d: CalcDef<any>, rnd: () => number, extra: Record<string, unknown[]>): any {
  const st: any = d.defaults();
  const num = (f: Extract<FieldSpec, { kind: 'number' }>) => {
    const lo = f.min ?? -1e3;
    const hi = f.max ?? 1e3;
    // spread magnitudes over the whole range: log-uniform for wide ranges (with 0 or negatives too)
    let v: number;
    const span = Math.max(Math.abs(lo), Math.abs(hi));
    if (lo > 0 && hi / lo > 100) v = lo * (hi / lo) ** rnd();
    else if (lo >= 0 && hi > 100 * Math.max(lo, 1e-300)) v = rnd() < 0.05 ? lo : hi * 1e-7 * 1e7 ** rnd();
    else if (lo < 0 && span > 100) v = Math.min(Math.max((rnd() < 0.5 ? -1 : 1) * span * 1e-7 * 1e7 ** rnd(), lo), hi);
    else v = lo + (hi - lo) * rnd();
    return f.integer ? Math.max(Math.round(v), Math.ceil(lo)) : v;
  };
  const walk = (fs: FieldSpec[], into: any) => {
    for (const f of fs) {
      if (f.kind === 'section' || f.kind === 'group') walk(f.fields, into);
      else if (f.kind === 'select') {
        const o = f.options[Math.floor(rnd() * f.options.length)];
        into[f.key] = typeof o === 'string' ? o : o.value;
      } else if (f.kind === 'number' && !f.output) into[f.key] = num(f);
      else if (f.kind === 'list') {
        const n = 1 + Math.floor(rnd() * Math.min(f.maxItems ?? 4, 4));
        into[f.key] = Array.from({ length: n }, () => {
          const item = f.create(undefined);
          walk(f.fields, item);
          return item;
        });
      }
    }
  };
  walk(d.fields, st);
  st.solveFor = d.solve!.options[Math.floor(rnd() * d.solve!.options.length)].key;
  for (const [k, opts] of Object.entries(extra)) st[k] = opts[Math.floor(rnd() * opts.length)];
  return st;
}
function checkReport(r: CalcReport) {
  const bad: string[] = [];
  for (const x of r.results) {
    if (typeof x.value === 'number' && !Number.isFinite(x.value)) bad.push(`value ${x.key}`);
    if (BAD.test(x.display)) bad.push(`display ${x.key}: ${x.display}`);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const c of Object.values(row)) if (BAD.test(c)) bad.push(`${t.id}: ${c}`);
  for (const s of [r.summary ?? '', r.error ?? '', ...r.warnings, ...r.notes]) if (BAD.test(s)) bad.push(s);
  for (const g of r.graphs) {
    for (const s of g.series ?? []) if (![...s.x, ...s.y].every(Number.isFinite)) bad.push(`${g.id}/${s.label}`);
    for (const l of [...(g.hlines ?? []), ...(g.vlines ?? [])]) if (!Number.isFinite(l.value)) bad.push(`${g.id} line ${l.label}`);
    for (const m of g.markers ?? []) if (!(Number.isFinite(m.x) && Number.isFinite(m.y))) bad.push(`${g.id} marker`);
  }
  expect(bad).toEqual([]);
}
function fuzz(d: CalcDef<any>, n: number, seed: number, extra: Record<string, unknown[]>, post?: (st: any, rnd: () => number) => void) {
  const rnd = rng(seed);
  let ok = 0;
  for (let k = 0; k < n; k++) {
    const raw = randomState(d, rnd, extra);
    post?.(raw, rnd);
    const st = normalizeState(d, raw);
    const snap = JSON.stringify(st);
    let r: CalcReport;
    try {
      r = runCompute(d, st); // as the page does: compute, range guard, write-back
    } catch (e) {
      throw new Error(`compute threw for ${snap}: ${e}`);
    }
    // the calculator's own checks must catch out-of-range answers before the generic core guard does
    expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
    if (!r.ok) {
      expect(r.error, 'error message').toBeTruthy();
      continue;
    }
    ok++;
    checkReport(r);
    const outside = r.results
      .filter((x) => x.solved && typeof x.value === 'number')
      .filter((x) => {
        const f = findField(d.fields, x.key)?.field;
        if (!f || f.kind !== 'number') return false;
        const v = x.value as number;
        const tol = 1e-9 * Math.abs(v);
        return (f.min != null && v < f.min - tol) || (f.max != null && v > f.max + tol);
      })
      .map((x) => `${x.key} = ${x.value}`);
    expect(outside, snap).toEqual([]);
    // stability: computing the written-back state again gives the same answers
    const r2 = runCompute(d, structuredClone(st));
    expect(r2.ok, snap).toBe(true);
    const drift = r.results
      .filter((y) => y.primary && typeof y.value === 'number')
      .filter((x) => !(Math.abs(res(r2, x.key) - (x.value as number)) <= 1e-9 * Math.max(Math.abs(x.value as number), 1e-12)))
      .map((x) => `${x.key}: ${x.value} → ${res(r2, x.key)}`);
    expect(drift).toEqual([]);
  }
  return ok;
}


const run = (p: Partial<ApState>) => def.compute({ ...def.defaults(), ...p });

describe('aperture diagonal — published and reference values', () => {
  it('3-4-5: the widest 2 mm opening a 2.5 mm drill covers is 1.5 mm (Euclid III.31; a published worked example)', () => {
    const r = run({ solveFor: 'w', l: 2e-3, d: 2.5e-3, fit: 'clear', c: 0 });
    expect(res(r, 'w')).toBeCloseTo(1.5e-3, 15);
    expect(res(r, 'hole')).toBeCloseTo(2.5e-3, 12);
  });
  it('IPC-7251 level B: a 0.64 mm square post needs d + 0.20 = 1.105 mm → 1.15 mm on a 0.05 mm grid', () => {
    const r = run({});
    expect(res(r, 'd')).toBeCloseTo(0.64e-3 * Math.SQRT2, 15);
    expect(res(r, 'dReq')).toBeCloseTo(0.64e-3 * Math.SQRT2 + 0.2e-3, 15);
    expect(res(r, 'hole')).toBeCloseTo(1.15e-3, 12);
  });
  it('IPC-7251 allowances: level A / B / C add 0.25 / 0.20 / 0.15 mm', () => {
    const t = run({}).tables[0];
    const need = t.rows.map((x) => x.need as number);
    const d = 0.64e-3 * Math.SQRT2;
    expect(need.map((v) => v - d)).toEqual([0, 0.15e-3, 0.2e-3, 0.25e-3].map((v) => expect.closeTo(v, 12)));
  });
  it('Python reference points (brute-force fillet check, 1e-9)', () => {
    // from builder's ap_ref.py: L = 6, W = 3.2 mm, c = 0, cutter 2 mm → g = r(1 − 1/√2) = 0.292893 mm
    const a = run({ l: 6e-3, w: 3.2e-3, fit: 'clear', c: 0, dr: 2e-3 });
    expect(res(a, 'g') / 0.00029289321881345254).toBeCloseTo(1, 9);
    expect(res(a, 'lo') / 0.006585786437626905).toBeCloseTo(1, 9);
    // c = 0.5 mm with a 1 mm cutter: c/2 at the corners needs r − (r − c/2)/√2 = 0.32322 mm > c/2
    const b = run({ l: 1e-3, w: 0.5e-3, fit: 'custom', c: 0.5e-3, dr: 1e-3 });
    expect(res(b, 'g') / 0.00032322330470336316).toBeCloseTo(1, 9);
    // small cutter: the flat clearance c/2 governs
    expect(res(run({ l: 1e-3, w: 0.5e-3, fit: 'custom', c: 0.5e-3, dr: 0.2e-3 }), 'g')).toBeCloseTo(0.25e-3, 15);
    // hole on a 0.1 mm grid from 0.2 mm: 1.143² ×2 → 1.6164 + 0.15 = 1.7664 → 1.8 mm
    expect(res(run({ l: 1.143e-3, w: 1.143e-3, fit: 'C', c: 0.15e-3, step: 0.1e-3, dMin: 0.2e-3 }), 'hole')).toBeCloseTo(1.8e-3, 12);
  });
  it('grid rounding: exact grid sizes are kept, the smallest size is a floor', () => {
    expect(gridUp(1.15e-3, 0.05e-3, 0.15e-3)).toBeCloseTo(1.15e-3, 15);
    expect(gridUp(1.1500001e-3, 0.05e-3, 0.15e-3)).toBeCloseTo(1.2e-3, 15);
    expect(gridUp(0.05e-3, 0.05e-3, 0.15e-3)).toBe(0.15e-3);
  });
});

describe('aperture diagonal — solve round trips', () => {
  for (const [l, w] of [[2e-3, 1e-3], [0.64e-3, 0.64e-3], [6e-3, 3.2e-3], [50e-6, 20e-6]])
    it(`L and W from the diagonal of ${l} × ${w}`, () => {
      const d = res(run({ l, w }), 'd');
      expect(res(run({ solveFor: 'l', w, d }), 'l') / l).toBeCloseTo(1, 12);
      expect(res(run({ solveFor: 'w', l, d }), 'w') / w).toBeCloseTo(1, 12);
    });
});

describe('aperture diagonal — physics sanity', () => {
  it('the diagonal exceeds each side and is symmetric in L and W', () => {
    const a = run({ l: 3e-3, w: 1e-3 });
    const b = run({ l: 1e-3, w: 3e-3 });
    expect(res(a, 'd')).toBeCloseTo(res(b, 'd'), 15);
    expect(res(a, 'd')).toBeGreaterThan(3e-3);
  });
  it('hole grows in steps with L and never falls below d + c', () => {
    let prev = 0;
    for (let i = 1; i < 200; i++) {
      const l = i * 0.02e-3;
      const r = run({ l, w: 0.5e-3 });
      expect(res(r, 'hole')).toBeGreaterThanOrEqual(res(r, 'dReq') - 1e-15);
      expect(res(r, 'hole')).toBeGreaterThanOrEqual(prev);
      prev = res(r, 'hole');
    }
  });
  it('corner growth keeps c/2 at the part corners (review fix: was zero clearance)', () => {
    expect(cornerGrowth(0)).toBe(0);
    for (const [r, c] of [[0.5e-3, 0], [0.25e-3, 0.2e-3], [1e-3, 0.5e-3], [0.3e-3, 0.2e-3]]) {
      const g = growth(r, c);
      // part corner to fillet centre is √2·(r − g); its gap to the arc must be c/2 (or more when c/2 governs)
      const gap = g >= r ? Infinity : r - Math.SQRT2 * (r - g);
      expect(gap).toBeGreaterThanOrEqual(c / 2 - 1e-15);
      if (g > c / 2) expect(gap).toBeCloseTo(c / 2, 15);
    }
    // default (0.64 mm pin, c = 0.2 mm, 0.5 mm cutter): 0.1 mm at the corners, not 0.038 mm
    const o = run({});
    expect(res(o, 'g')).toBeCloseTo(0.25e-3 - 0.15e-3 * Math.SQRT1_2, 15);
  });
});

describe('aperture diagonal — validity limits', () => {
  it('no covering drill above the largest drill: warns to route', () => {
    const r = run({ l: 6e-3, w: 3.2e-3, fit: 'clear', c: 0 });
    expect(r.results.find((x) => x.key === 'hole')?.value).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/largest drill/);
  });
  it('warns when the cutter is wider than the routed opening', () => expect(run({ dr: 2e-3 }).warnings.join(' ')).toMatch(/wider than the routed opening/));
  it('the clearance table keeps the same 1e-9 slack at the largest drill as the results (review fix)', () => {
    const r = run({ l: Math.sqrt(6.3e-3 ** 2 - 1e-3 ** 2), w: 1e-3, fit: 'B', c: 0.2e-3 });
    expect(res(r, 'hole')).toBeCloseTo(6.5e-3, 12);
    expect(r.tables[0].rows[2].hole).toBeCloseTo(6.5e-3, 12);
  });
  it('gap labels: (D − W)/2 is at the long faces (review fix)', () => {
    const r = run({ l: 1.7e-3, w: 0.6e-3 });
    expect(r.results.find((x) => x.key === 'gapFlat')!.label).toBe('Gap at the long faces');
    expect(res(r, 'gapFlat')).toBeCloseTo((2.05e-3 - 0.6e-3) / 2, 12);
  });
  it('notes a large corner radius and a flat lead', () => {
    expect(run({ l: 2e-3, w: 1e-3, dr: 1e-3 }).notes.join(' ')).toMatch(/quarter/);
    expect(run({ l: 1.7e-3, w: 0.6e-3 }).notes.join(' ')).toMatch(/flat lead/);
  });
  it('no solution when the target diagonal is not longer than the other side', () => {
    const r = run({ solveFor: 'l', w: 1e-3, d: 0.8e-3 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.warnings[0]).toMatch(/longer than the other side/);
  });
});

describe('aperture diagonal — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, normalizeState(def, { ...def.defaults(), ...ex.state }));
      expect(r.ok, ex.id).toBe(true);
      expect(r.status, ex.id).toBeUndefined();
    }
  });
  it('defaults raise no warnings', () => expect(run({}).warnings).toEqual([]));
  it('fuzz: 400 random states through runCompute', () => {
    const ok = fuzz(def, 400, 5151, {});
    expect(ok).toBeGreaterThan(300);
  });
});
