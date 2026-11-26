/**
 * Shared fuzz support for the zener, BJT-bias, MOSFET-operating-point and transistor-switch tests: random states
 * inside every field's min/max and every select option, run through runCompute as the page does.
 */
import { expect } from 'vitest';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

export const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const BAD = /NaN|undefined|Infinity|\[object/;

export function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

export function randomState(d: CalcDef<any>, rnd: () => number): any {
  const st: any = d.defaults();
  const num = (f: Extract<FieldSpec, { kind: 'number' }>) => {
    const lo = f.min ?? -1e3;
    const hi = f.max ?? 1e3;
    let v: number;
    if (lo > 0 && hi / lo > 100) v = lo * (hi / lo) ** rnd();
    else if (lo >= 0 && hi > 100 * Math.max(lo, 1e-300)) v = rnd() < 0.05 ? lo : hi * 1e-7 * 1e7 ** rnd();
    else v = lo + (hi - lo) * rnd();
    if (f.optional && rnd() < 0.15) return null;
    return f.integer ? Math.max(Math.round(v), Math.ceil(lo)) : v;
  };
  const walk = (fs: FieldSpec[]) => {
    for (const f of fs) {
      if (f.kind === 'section' || f.kind === 'group') walk(f.fields);
      else if (f.kind === 'select') {
        const o = f.options[Math.floor(rnd() * f.options.length)];
        st[f.key] = typeof o === 'string' ? o : o.value;
      } else if (f.kind === 'number' && !f.output) st[f.key] = num(f);
    }
  };
  walk(d.fields);
  st.solveFor = d.solve!.options[Math.floor(rnd() * d.solve!.options.length)].key;
  return st;
}

export function checkReport(r: CalcReport) {
  const bad: string[] = [];
  for (const x of r.results) {
    if (typeof x.value === 'number' && !Number.isFinite(x.value)) bad.push(`value ${x.key}`);
    if (BAD.test(x.display) || BAD.test(x.note ?? '')) bad.push(`display ${x.key}: ${x.display} ${x.note ?? ''}`);
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

/** Runs n random states; returns how many computed ok. `post` may adjust the raw state (e.g. narrow a range). */
export function fuzz(d: CalcDef<any>, n: number, seed: number, post?: (st: any, rnd: () => number) => void): number {
  const rnd = rng(seed);
  let ok = 0;
  for (let k = 0; k < n; k++) {
    const raw = randomState(d, rnd);
    post?.(raw, rnd);
    const st = normalizeState(d, raw);
    const snap = JSON.stringify(st);
    let r: CalcReport;
    try {
      r = runCompute(d, st);
    } catch (e) {
      throw new Error(`compute threw for ${snap}: ${e}`);
    }
    expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
    if (!r.ok) {
      expect(r.error, 'error message').toBeTruthy();
      expect(BAD.test(r.error ?? ''), r.error).toBe(false);
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
      .filter((x) => !(Math.abs(res(r2, x.key) - (x.value as number)) <= 1e-8 * Math.max(Math.abs(x.value as number), 1e-12)))
      .map((x) => `${x.key}: ${x.value} → ${res(r2, x.key)}`);
    expect(drift, snap).toEqual([]);
  }
  return ok;
}
