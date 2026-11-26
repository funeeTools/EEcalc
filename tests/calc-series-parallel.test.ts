import { describe, expect, it } from 'vitest';
import { type SpState, def, part } from '@/calculators/series-parallel/def';
import { req, rssSpread, solveOne, worstCase } from '@/calculators/series-parallel/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<SpState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;

function clean(r: CalcReport) {
  const bad: string[] = [];
  for (const x of r.results) {
    if (typeof x.value === 'number' && !Number.isFinite(x.value)) bad.push(`value ${x.key}`);
    if (BAD.test(x.display)) bad.push(`display ${x.key}: ${x.display}`);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const c of Object.values(row)) if (BAD.test(c)) bad.push(`${t.id}: ${c}`);
  for (const s of [r.summary ?? '', r.error ?? '', ...r.warnings, ...r.notes]) if (BAD.test(s)) bad.push(s);
  for (const g of r.graphs) {
    for (const s of g.series ?? []) if (![...s.x, ...s.y].every(Number.isFinite)) bad.push(`${g.id}/${s.label}`);
    for (const m of g.markers ?? []) if (!(Number.isFinite(m.x) && Number.isFinite(m.y))) bad.push(`${g.id} marker`);
  }
  expect(bad).toEqual([]);
}

describe('series/parallel — Python reference and identities', () => {
  const rs = [10e3, 4.7e3, 2.2e3];
  const tols = [0.01, 0.05, 0.1];
  it('10k ∥ 4.7k ∥ 2.2k = 1303.2518 Ω; worst case and RSS (Python)', () => {
    expect(req('parallel', rs)).toBeCloseTo(1303.2518275775146, 9);
    const w = worstCase('parallel', rs, tols);
    expect(w.lo).toBeCloseTo(1204.7833197056418, 9);
    expect(w.hi).toBeCloseTo(1398.8610454584464, 9);
    expect(rssSpread('parallel', rs, tols)).toBeCloseTo(0.0608534749228304, 13);
  });
  it('second source: product-over-sum (two resistors) and n equal parts (R/n, nR, t/√n)', () => {
    expect(req('parallel', [3e3, 6e3])).toBeCloseTo((3e3 * 6e3) / 9e3, 9);
    expect(req('parallel', Array(5).fill(1e3))).toBeCloseTo(200, 10);
    expect(req('series', Array(4).fill(1e6))).toBe(4e6);
    expect(rssSpread('series', Array(4).fill(1e3), Array(4).fill(0.01))).toBeCloseTo(0.01 / 2, 14);
    const w = worstCase('series', [1e3, 2e3], [0.05, 0.05]);
    expect([w.lo, w.hi]).toEqual([2850, 3150]); // equal tolerances: the network has exactly the part tolerance
  });
  it('per-part operating points: series V splits ∝ R, parallel I splits ∝ 1/R', () => {
    const s = run({ topo: 'series', parts: [part(1e3), part(3e3)], drive: 'v', v: 8 });
    const op = (s.details as any).op;
    expect(op.parts.map((p: any) => p.v)).toEqual([2, 6]);
    const p = run({ topo: 'parallel', parts: [part(1e3), part(3e3)], drive: 'i', i: 4e-3 });
    const oq = (p.details as any).op;
    expect(oq.parts[0].i).toBeCloseTo(3e-3, 15);
    expect(oq.parts[1].i).toBeCloseTo(1e-3, 15);
  });
});

describe('series/parallel — solve one resistor', () => {
  for (const topo of ['series', 'parallel'] as const) {
    for (const k of [0, 1, 2]) {
      it(`${topo}: solve R${k + 1} for the R_eq of a known network → recovers it to 1e-9`, () => {
        const rs = [2.2e3, 6.8e3, 15e3];
        const target = req(topo, rs);
        const st: SpState = { ...def.defaults(), topo, solveFor: 'rk', solveIdx: k, req: target, parts: rs.map((r, j) => part(j === k ? 1 : r)) };
        const r = runCompute(def, st);
        expect(r.ok).toBe(true);
        expect(st.parts[k].r / rs[k]).toBeCloseTo(1, 10);
        const fwd = runCompute(def, { ...structuredClone(st), solveFor: 'req' });
        expect(res(fwd, 'req') / target).toBeCloseTo(1, 12);
      });
    }
  }
  it('E-series snap: 10 kΩ ∥ R₂ = 8 kΩ → 40 kΩ, E96 40.2 kΩ (+0.04 %)', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'trim-parallel')!.state });
    expect(res(r, 'parts.1.r')).toBeCloseTo(40e3, 6);
    expect(res(r, 'rkStd')).toBe(40.2e3);
    const t = r.tables.find((x) => x.id === 'standard')!;
    expect(t.rowTones).toEqual(['pass', 'pass']);
  });
  it('impossible targets say which limit applies', () => {
    expect(run({ topo: 'series', solveFor: 'rk', solveIdx: 1, req: 20, parts: [part(33), part(1)] }).error).toMatch(/already add up to 33/);
    expect(run({ topo: 'parallel', solveFor: 'rk', solveIdx: 1, req: 20e3, parts: [part(10e3), part(1)] }).error).toMatch(/can only lower R_eq/);
    expect(solveOne('parallel', [1e3, 0], 1, 999).r).toBeCloseTo(999e3, 6);
  });
  it('the solved resistor follows its identity when a resistor above it is removed', () => {
    const st: SpState = { ...def.defaults(), topo: 'series', solveFor: 'rk', solveIdx: 2, req: 10e3, parts: [part(1e3), part(2e3), part(3e3)] };
    runCompute(def, st);
    const solved = st.parts[2];
    st.parts.splice(0, 1);
    runCompute(def, st);
    expect(st.solveIdx).toBe(1);
    expect(st.parts[1]).toBe(solved);
    st.parts.splice(1, 1); // remove the solved one → analysis
    runCompute(def, st);
    expect(st.solveFor).toBe('req');
  });
});

describe('series/parallel — warnings, examples, fuzz', () => {
  it('high-voltage string: 250 V per 1 MΩ chip needs a 2010; one part at 1 kV has no chip', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'hv-string')!.state });
    expect(r.tables[0].rows.map((x) => x.chip)).toEqual(['2010', '2010', '2010', '2010']);
    const one = run({ topo: 'series', parts: [part(1e6)], drive: 'v', v: 1000 });
    expect(one.warnings.some((w) => w.includes('beyond a 2512'))).toBe(true);
  });
  it('a far-off parallel trimmer gets a note; a poor E-series fit warns', () => {
    expect(run({ topo: 'parallel', parts: [part(100), part(1e6)] }).notes.some((n) => n.includes('mainly trims'))).toBe(true);
    expect(run({ topo: 'series', solveFor: 'rk', solveIdx: 1, req: 47, parts: [part(33, 1), part(1)], eseries: 'E6' }).warnings.some((w) => w.includes('off target'))).toBe(true);
  });
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = def.compute({ ...def.defaults(), ...structuredClone(e.state) });
      expect(r.ok, e.id).toBe(true);
      clean(r);
    }
  });
  it('300+ random states through runCompute: no throw, finite, in range, stable', () => {
    let seed = 5;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    let ok = 0;
    for (let n = 0; n < 400; n++) {
      const m = 1 + Math.floor(rnd() * 8);
      const st: any = normalizeState(def, {
        solveFor: pick(['req', 'rk']), solveIdx: Math.floor(rnd() * m), topo: pick(['series', 'parallel']), req: 10 ** (-5 + 19 * rnd()),
        parts: Array.from({ length: m }, () => ({ r: 10 ** (-4 + 17 * rnd()), rUnit: 'kΩ', tol: 50 * rnd() })),
        drive: pick(['v', 'i']), v: (rnd() < 0.5 ? -1 : 1) * 10 ** (-3 + 9 * rnd()), i: (rnd() < 0.5 ? -1 : 1) * 10 ** (-9 + 14 * rnd()), eseries: pick(['E6', 'E12', 'E24', 'E48', 'E96']),
      });
      const snap = JSON.stringify(st);
      const r = runCompute(def, st);
      expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
      if (!r.ok) continue;
      ok++;
      clean(r);
      for (const x of r.results.filter((y) => y.solved)) {
        const f = findField(def.fields, x.key)!.field as any;
        expect(x.value as number, snap).toBeGreaterThanOrEqual(f.min * (1 - 1e-9));
        expect(x.value as number, snap).toBeLessThanOrEqual(f.max * (1 + 1e-9));
      }
      const r2 = runCompute(def, structuredClone(st));
      for (const x of r.results.filter((y) => y.primary && typeof y.value === 'number')) expect(Math.abs(res(r2, x.key) / (x.value as number) - 1), `${snap} ${x.key}`).toBeLessThan(1e-9);
    }
    expect(ok).toBeGreaterThan(200);
  });
});
