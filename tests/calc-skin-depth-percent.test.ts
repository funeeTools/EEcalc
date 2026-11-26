import { describe, expect, it } from 'vitest';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { def, OZ, type SdpState } from '@/calculators/skin-depth-percent/def';
import { dowellF, profileExact, shareWithin } from '@/calculators/skin-depth-percent/model';
import { traceR } from '@/calculators/trace-resistance/model';

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


const run = (p: Partial<SdpState>) => def.compute({ ...def.defaults(), ...p });

describe('skin depth percentage — published and reference values', () => {
  it('Copper skin depth 66.09 µm at 1 MHz and 2.09 µm at 1 GHz, 20 °C (Ramo, Whinnery & Van Duzer §3.16)', () => {
    expect(res(run({ f: 1e6, tC: 20 }), 'delta')).toBeCloseTo(66.09e-6, 7);
    expect(res(run({ f: 1e9, tC: 20 }), 'delta')).toBeCloseTo(2.09e-6, 8);
  });
  it('Half-space: 1 − 1/e = 63.2 % of the current and 1 − 1/e² = 86.5 % of the loss within one δ; 99 % of the current within 4.605δ', () => {
    expect(shareWithin(1, 1, 'current')).toBeCloseTo(1 - Math.exp(-1), 15);
    expect(shareWithin(1, 1, 'loss')).toBeCloseTo(1 - Math.exp(-2), 15);
    const r = run({ solveFor: 'x', p: 99, f: 1e9, tC: 20 });
    expect(res(r, 'x') / res(r, 'delta')).toBeCloseTo(Math.log(100), 10);
  });
  it('Dowell single-layer F(Δ): F → 1 + 4Δ⁴/45 at low Δ, F(1) = 1.085636 and F → Δ (Python cmath reference)', () => {
    expect(dowellF(0.01)).toBeCloseTo(1.000000000888889, 14);
    expect(dowellF(1)).toBeCloseTo(1.0856357047503278, 12);
    expect(dowellF(2)).toBeCloseTo(1.8978064467695106, 12);
    expect(dowellF(5)).toBeCloseTo(4.999372104140528, 12);
    expect(dowellF(0.05)).toBeCloseTo(1.0000005555554232, 14); // series / closed-form switch
    expect(dowellF(0.0500001)).toBeCloseTo(1.0000005555554232, 9);
  });
  it('Python reference points (independent re-implementation, 1e-9)', () => {
    // generated by builder's sdp_ref.py (Ramo §3.16 + Dowell 1966, written from the sources)
    const a = run({ solveFor: 'p', f: 1e9, x: 5e-6, count: 'current', t: OZ, w: 0.3e-3, ret: 'micro', model: 'layer', tC: 25 });
    expect(res(a, 'p') / 90.64631294527125).toBeCloseTo(1, 9);
    const b = run({ solveFor: 'f', x: 3e-6, p: 90, count: 'loss', tC: 25 });
    expect(res(b, 'f') / 655831496.455464).toBeCloseTo(1, 9);
    const c = run({ solveFor: 'p', f: 20e6, x: 10e-6, t: 0.5 * OZ, w: 0.5e-3, ret: 'micro', model: 'exact', tC: 25 });
    expect(res(c, 'ratio') / 1.1534253311230493).toBeCloseTo(1, 9);
  });
  it('The uniform-layer Rac/Rdc is exactly the Trace Resistance page’s skin factor (no contradiction)', () => {
    for (const ret of ['micro', 'strip', 'iso'] as const)
      for (const f of [1e5, 3e6, 1e8, 1e10]) {
        const r = run({ f, ret, model: 'layer', w: 0.2e-3, t: OZ, tC: 40 });
        const tr = traceR({ w: 0.2e-3, len: 0.1, t: OZ, tC: 40, f, ret, rough: 0, rho20: 1 / 58e6, alpha: 0.00393 });
        expect(res(r, 'ratio')).toBeCloseTo(tr.skin, 12);
        expect(res(r, 'delta')).toBeCloseTo(tr.delta, 15);
      }
  });
});

describe('skin depth percentage — solve round trips', () => {
  for (const count of ['current', 'loss'] as const)
    for (const [f, x] of [[1e6, 20e-6], [1e9, 5e-6], [2e10, 0.3e-6]]) {
      it(`x and f round trip (${count}, f = ${f}, x = ${x})`, () => {
        const a = run({ solveFor: 'p', f, x, count });
        const p = res(a, 'p');
        const bx = run({ solveFor: 'x', f, p, count });
        expect(res(bx, 'x') / x).toBeCloseTo(1, 9);
        const bf = run({ solveFor: 'f', x, p, count });
        expect(res(bf, 'f') / f).toBeCloseTo(1, 9);
        // and forward again from the solved value
        expect(res(run({ solveFor: 'p', f: res(bf, 'f'), x, count }), 'p') / p).toBeCloseTo(1, 9);
      });
    }
});

describe('skin depth percentage — physics sanity', () => {
  it('share rises with depth and frequency; Rac/Rdc rises with f and → 1 at low f', () => {
    const p = [1e6, 1e7, 1e8, 1e9].map((f) => res(run({ f }), 'p'));
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
    for (const model of ['layer', 'exact'] as const) {
      const r = [1e3, 1e6, 1e8, 1e10].map((f) => res(run({ f, model }), 'ratio'));
      for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
      expect(r[0]).toBeCloseTo(1, 6);
    }
  });
  it('at high frequency both models agree (Rac/Rdc → T/δ microstrip, T/2δ stripline)', () => {
    for (const ret of ['micro', 'strip'] as const) {
      const a = run({ f: 1e10, ret, model: 'layer' });
      const b = run({ f: 1e10, ret, model: 'exact' });
      expect(res(a, 'ratio') / res(b, 'ratio')).toBeCloseTo(1, 9);
    }
  });
  it('largest gap between the models is 8.56 %, at δ = T (as the theory says)', () => {
    // one face: layer Rac/Rdc = max(Δ, 1), exact F(Δ), Δ = T/δ
    let worst = 0;
    let at = 0;
    for (let i = 1; i <= 4000; i++) {
      const d = i / 1000;
      const g = dowellF(d) / Math.max(d, 1) - 1;
      if (g > worst) [worst, at] = [g, d];
    }
    expect(worst).toBeCloseTo(0.0856357, 6);
    expect(at).toBeCloseTo(1, 6);
  });
  it('the exact profile is 1 at the face and decays; doubling ρ grows δ by √2', () => {
    expect(profileExact(0, 35e-6, 2e-6, 'micro')).toBeCloseTo(1, 12);
    expect(profileExact(10e-6, 35e-6, 2e-6, 'micro')).toBeCloseTo(Math.exp(-5), 3);
    expect(profileExact(17.5e-6, 35e-6, 200e-6, 'strip')).toBeGreaterThan(0.99);
    const a = res(run({ rho20: 1e-8 }), 'delta');
    const b = res(run({ rho20: 2e-8 }), 'delta');
    expect(b / a).toBeCloseTo(Math.SQRT2, 10);
  });
  it('a hotter conductor has a larger skin depth (δ ∝ √ρ(T))', () => {
    expect(res(run({ tC: 100 }), 'delta')).toBeGreaterThan(res(run({ tC: 20 }), 'delta'));
  });
});

describe('skin depth percentage — validity limits', () => {
  it('warns when the copper is thinner than 3δ', () => {
    expect(run({ f: 5e6 }).warnings.join(' ')).toMatch(/skin depths thick/);
    expect(run({ f: 1e9 }).warnings.join(' ')).not.toMatch(/skin depths thick/);
  });
  it('notes a depth deeper than the copper', () => expect(run({ x: 50e-6 }).notes.join(' ')).toMatch(/deeper than the copper/));
  it('warns for a trace only a few skin depths wide', () => expect(run({ w: 10e-6, f: 5e8, ret: 'iso' }).warnings.join(' ')).toMatch(/skin depths wide/));
  it('warns below −50 °C', () => expect(run({ tC: -55 }).warnings.join(' ')).toMatch(/tempco/));
  it('no solution outside the depth and frequency ranges, with a reason', () => {
    const a = run({ solveFor: 'x', p: 99.9999, f: 1e3, rho20: 1e-6 });
    expect(a.status?.text).toBe('NO SOLUTION');
    const b = run({ solveFor: 'f', p: 99.9, x: 1e-8 });
    expect(b.status?.text).toBe('NO SOLUTION');
    expect(b.warnings[0]).toMatch(/1 THz/);
    expect(run({ solveFor: 'x', p: 100 }).status?.text).toBe('NO SOLUTION');
  });
});

describe('skin depth percentage — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, normalizeState(def, { ...def.defaults(), ...ex.state }));
      expect(r.ok, ex.id).toBe(true);
      expect(r.status, ex.id).toBeUndefined();
    }
  });
  it('fuzz: 400 random states through runCompute', () => {
    const ok = fuzz(def, 400, 9177, {});
    expect(ok).toBeGreaterThan(300);
  });
  it('computes well under 50 ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) run({ f: 1e6 * (i + 1) });
    expect((performance.now() - t0) / 20).toBeLessThan(50);
  });
});
