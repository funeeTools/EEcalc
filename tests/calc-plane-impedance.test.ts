import { describe, expect, it } from 'vitest';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { def, type PlaneState } from '@/calculators/plane-impedance/def';
import { absC, modeF, modesBelow, planeC, planeZ, rowSum, spreadSum } from '@/calculators/plane-impedance/model';

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

const run = (p: Partial<PlaneState>) => def.compute({ ...def.defaults(), ...p });
const P = { a: 0.1, b: 0.08, d: 1e-4, er: 4.3, tanD: 0.02, px: 0.025, py: 0.02, wp: 0.5e-3, tCu: 34.79e-6 };

describe('plane impedance — published rules', () => {
  it('Bogatin: C [pF] = 0.225·εr·A[in²]/h[in]', () => {
    const aIn2 = (0.1 / 0.0254) * (0.08 / 0.0254);
    expect(planeC(0.1, 0.08, 1e-4, 4.3) * 1e12 / ((0.225 * 4.3 * aIn2) / (1e-4 / 0.0254))).toBeCloseTo(1, 2);
  });
  it('Bogatin: sheet inductance ≈ 32 pH per square per mil of dielectric', () => {
    expect(res(run({ d: 25.4e-6 }), 'lSq')).toBeCloseTo(31.9e-12, 13);
  });
  it('first cavity mode: half a wavelength across the longer side, c/(2√εr·a)', () => {
    expect(res(run({}), 'f1')).toBeCloseTo(299792458 / (2 * Math.sqrt(4.3) * 0.1), 3);
    expect(modeF(1, 1, 0.1, 0.08, 4.3)).toBeCloseTo(Math.hypot(modeF(1, 0, 0.1, 0.08, 4.3), modeF(0, 1, 0.1, 0.08, 4.3)), 3);
  });
});

describe('plane impedance — independent Python reference (plane.py: Gradshteyn–Ryzhik closed-form row sums + direct double sum of the fast-converging remainder, 120 random states, both solve options, worst 1.2e-4 near series dips)', () => {
  it('defaults: |Z| at 100 MHz and the spreading inductance', () => {
    const r = run({});
    expect(res(r, 'zf') / 0.4507563210608143).toBeCloseTo(1, 5);
    expect(res(r, 'lsp') / 1.1358875014849308e-10).toBeCloseTo(1, 4);
  });
  it('port at the centre', () => {
    const r = run({ px: 0.05, py: 0.04 });
    expect(res(r, 'zf') / 0.4633590088569251).toBeCloseTo(1, 5);
    expect(res(r, 'lsp') / 9.395349995988e-11).toBeCloseTo(1, 4);
  });
  it('60 × 40 mm, 76 µm, 1 GHz', () => {
    const r = run({ a: 0.06, b: 0.04, d: 76e-6, er: 4.2, tanD: 0.018, px: 0.018, py: 0.012, wp: 0.4e-3, f: 1e9, fMax: 6e9 });
    expect(res(r, 'zf') / 0.49077364072747515).toBeCloseTo(1, 4);
    expect(res(r, 'lsp') / 7.583495290189251e-11).toBeCloseTo(1, 4);
  });
  it('closed-form row sum equals a brute-force sum over n (2·10⁶ terms) to 1e-11', () => {
    const sinc = (u: number) => (Math.abs(u) < 1e-8 ? 1 : Math.sin(u) / u);
    for (const [kx, b, y, w] of [[31.4, 0.08, 0.02, 0.5e-3], [0, 0.08, 0.02, 0.5e-3], [500, 0.095, 0.001, 67e-6]]) {
      let s = 0;
      for (let n = kx === 0 ? 1 : 0; n < 2e6; n++) {
        const k = (n * Math.PI) / b;
        s += ((n ? 2 : 1) * Math.cos(k * y) ** 2 * sinc((k * w) / 2) ** 2) / (kx * kx + k * k);
      }
      expect(rowSum(kx, b, y, w) / s).toBeCloseTo(1, 10);
    }
  });
  it('review regression: small ports no longer truncate the spreading inductance (0.1 mm port: brute-force double sum to 8a/w gives 145.774 pH; the old 400-mode cap gave 134 pH)', () => {
    const l = res(run({ wp: 0.1e-3 }), 'lsp');
    expect(Math.abs(l / 1.4577400974628156e-10 - 1)).toBeLessThan(2e-4);
    expect(spreadSum({ ...P, wp: 0.1e-3 }, 8) / spreadSum({ ...P, wp: 0.1e-3 }, 64)).toBeCloseTo(1, 4);
  });
  it('review regression: 300 × 200 mm, 0.3 mm port, 100 MHz (was −34 %) and 224 × 95 mm, 67 µm port, 2.66 GHz (was −23 %) match Python', () => {
    const r1 = run({ a: 0.3, b: 0.2, px: 0.1, py: 0.05, wp: 0.3e-3, f: 100e6 });
    expect(res(r1, 'zf') / 0.019272826525983427).toBeCloseTo(1, 3);
    const r2 = run({ a: 0.224, b: 0.095, px: 0.05, py: 0.03, wp: 67e-6, f: 2.66e9, fMax: 3e9 });
    expect(res(r2, 'zf') / 1.8829907695251782).toBeCloseTo(1, 3);
    expect(res(r2, 'lsp') / 1.758726238851035e-10).toBeCloseTo(1, 4);
  });
});

describe('plane impedance — solve and physics', () => {
  for (const c of [1e-9, 10e-9, 100e-9]) {
    it(`thickness for C = ${c * 1e9} nF round-trips`, () => {
      const r = run({ solveFor: 'd', c });
      expect(res(run({ solveFor: 'c', d: res(r, 'd') }), 'c') / c).toBeCloseTo(1, 9);
    });
  }
  it('impossible capacitance: NO SOLUTION', () => expect(run({ solveFor: 'd', c: 1e-3 }).status?.text).toBe('NO SOLUTION'));
  it('low frequency: a capacitor with ESR = tan δ/(ωC)', () => {
    const z = planeZ(P, [1e5]).z[0];
    const c = planeC(0.1, 0.08, 1e-4, 4.3);
    const w = 2 * Math.PI * 1e5;
    expect(-z.im * w * c).toBeCloseTo(1, 3);
    expect(z.re * w * c).toBeCloseTo(0.02, 4);
  });
  it('well below f₁₀ the port looks like C in series with L_sp', () => {
    const f = 20e6;
    const r = planeZ(P, [f]);
    const w = 2 * Math.PI * f;
    const x = w * r.lsp - 1 / (w * planeC(0.1, 0.08, 1e-4, 4.3));
    expect(r.z[0].im / x).toBeCloseTo(1, 2);
  });
  it('spreading inductance scales with d, falls with port size, and is larger at a corner than at the centre', () => {
    const l = (q: Partial<typeof P>) => planeZ({ ...P, ...q }, [1e6]).lsp;
    expect(l({ d: 2e-4 }) / l({})).toBeCloseTo(2, 9);
    expect(l({ wp: 2e-3 })).toBeLessThan(l({}));
    expect(l({ px: 0.002, py: 0.002 })).toBeGreaterThan(l({ px: 0.05, py: 0.04 }));
  });
  it('a port on the TM₁₀ nodal line does not see it; one near the edge does (peak at f₁₀)', () => {
    const f10 = modeF(1, 0, 0.1, 0.08, 4.3);
    const centre = modesBelow({ ...P, px: 0.05, py: 0.04 }, 1e9).find((m) => m.m === 1 && m.n === 0)!;
    expect(centre.coupling).toBeCloseTo(0, 12);
    // review fix: coupling is normalised so a mode's voltage maximum reads 100 % (TM10 at a corner)
    expect(modesBelow({ ...P, px: 0, py: 0 }, 1e9).find((m) => m.m === 1 && m.n === 0)!.coupling).toBeCloseTo(1, 12);
    const fs = [0.9 * f10, f10, 1.1 * f10];
    const edge = planeZ({ ...P, px: 0.005 }, fs).z.map(absC);
    expect(edge[1]).toBeGreaterThan(edge[0]);
    expect(edge[1]).toBeGreaterThan(edge[2]);
  });
});

describe('plane impedance — validity', () => {
  it('thick dielectric vs plane size', () => expect(run({ a: 0.01, b: 0.01, px: 0.005, py: 0.005, d: 2e-3 }).warnings.join()).toMatch(/not thin/));
  it('dielectric thick compared with the wavelength', () => expect(run({ d: 4e-3, fMax: 40e9 }).warnings.join()).toMatch(/wavelengths thick/));
  it('port overhanging the edge', () => expect(run({ px: 0.0001 }).warnings.join()).toMatch(/overhangs/));
  it('review fix: a port off the plane (plane typed smaller) is moved to the edge with a warning, not a red error', () => {
    const r = def.compute({ ...def.defaults(), a: 0.01 });
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/off the plane/);
    expect(res(r, 'lsp')).toBeCloseTo(res(def.compute({ ...def.defaults(), a: 0.01, px: 0.01 }), 'lsp'), 18);
  });
});

describe('plane impedance — examples and fuzz', () => {
  it('every example computes; the first is the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, normalizeState(def, { ...def.defaults(), ...ex.state }));
      expect(r.ok, ex.id).toBe(true);
      expect(r.status?.text ?? '', ex.id).not.toBe('NO SOLUTION');
      checkReport(r);
    }
  });
  it('compute is fast enough for every keystroke', () => {
    run({});
    const t0 = performance.now();
    for (let k = 0; k < 5; k++) run({ f: 100e6 + k });
    expect((performance.now() - t0) / 5).toBeLessThan(150); // ~30–40 ms in the browser; generous for CI
  });
  it('320 random states through runCompute: no throw, finite, stable', () => {
    // the port position is drawn as a fraction of the (random) plane, so it lies on it
    const ok = fuzz(def, 320, 1234, {}, (st, rnd) => {
      st.px = rnd() * st.a;
      st.py = rnd() * st.b;
      st.wp = Math.min(st.wp, Math.min(st.a, st.b) / 2);
    });
    expect(ok).toBeGreaterThan(300);
  }, 120000);
});
