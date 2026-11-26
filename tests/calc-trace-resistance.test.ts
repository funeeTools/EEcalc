import { describe, expect, it } from 'vitest';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { def, OZ, type TrState } from '@/calculators/trace-resistance/def';
import { acArea, roughFactor, skinOnset, traceR } from '@/calculators/trace-resistance/model';

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


const run = (p: Partial<TrState>) => def.compute({ ...def.defaults(), ...p });

describe('trace resistance — published values', () => {
  it('IEC 60028: 1 km of 1 mm² annealed copper is 17.241 Ω at 20 °C (as a 1 mm × 1 mm “trace”)', () => {
    const r = run({ w: 1e-3, t: 1e-3, len: 100, tC: 20, f: 0 });
    expect(res(r, 'r') * 10).toBeCloseTo(17.241, 3); // 100 m → ×10 for 1 km
  });
  it('IEC 60028 tempco: +0.393 %/°C, so 85 °C is 1.2555 × the 20 °C value', () => {
    const r = run({ tC: 85, f: 0 });
    expect(res(r, 'r') / res(r, 'rdc20')).toBeCloseTo(1 + 0.00393 * 65, 12);
  });
  it('Skin depth of copper ≈ 66 µm at 1 MHz and 2.09 µm at 1 GHz (Ramo, Whinnery & Van Duzer §3.16)', () => {
    expect(res(run({ f: 1e6, tC: 20 }), 'delta')).toBeCloseTo(66.09e-6, 7);
    expect(res(run({ f: 1e9, tC: 20 }), 'delta')).toBeCloseTo(2.09e-6, 8);
  });
  it('Bogatin’s rule of thumb: 1 oz copper ≈ 0.5 mΩ per square', () => {
    expect(res(run({ t: OZ, tC: 25, f: 0 }), 'sheet')).toBeCloseTo(0.5e-3, 4);
  });
  it('Hammerstad–Jensen factor: 1 + (2/π)·atan(1.4) = 1.6037 at Δ = δ, and → 2 for Δ ≫ δ', () => {
    expect(roughFactor(1e-6, 1e-6)).toBeCloseTo(1 + (2 / Math.PI) * Math.atan(1.4), 14);
    expect(roughFactor(1e-4, 1e-6)).toBeCloseTo(2, 4);
    expect(roughFactor(0, 1e-6)).toBe(1);
  });
});

describe('trace resistance — independent Python reference (trace_resistance.py, 300 random states, all solve options, worst 1e-14)', () => {
  it('DC: 0.5 mm × 100 mm, 1 oz, 25 °C', () => expect(res(run({ w: 0.5e-3, len: 0.1, t: OZ, tC: 25, f: 0 }), 'r')).toBeCloseTo(0.10106451516983676, 14));
  it('2 MHz, 2 oz, plane below, 1 µm roughness, 70 °C', () =>
    expect(res(run({ w: 2e-3, len: 20e-3, t: 2 * OZ, tC: 70, f: 2e6, ret: 'micro', rough: 1e-6 }), 'r')).toBeCloseTo(0.004037247220267526, 15));
  it('5 GHz stripline, ½ oz, 1.5 µm roughness', () =>
    expect(res(run({ w: 0.15e-3, len: 50e-3, t: 0.5 * OZ, tC: 25, f: 5e9, ret: 'strip', rough: 1.5e-6 }), 'r') / 5.664853863759492).toBeCloseTo(1, 13));
  it('100 MHz isolated trace (whole perimeter)', () =>
    expect(res(run({ w: 1e-3, len: 0.05, t: OZ, tC: 25, f: 100e6, ret: 'iso', rough: 0 }), 'r')).toBeCloseTo(0.06447881071009129, 14));
});

describe('trace resistance — solve → forward round trips', () => {
  const back = (r: CalcReport, k: 'w' | 'len', base: Partial<TrState>) => run({ ...base, solveFor: 'r', [k]: res(r, k) });
  const pts: Partial<TrState>[] = [
    { f: 0, tC: 25 },
    { f: 5e6, tC: 85, ret: 'micro', rough: 1e-6, t: 2 * OZ },
    { f: 3e9, tC: 25, ret: 'strip', rough: 0.5e-6, w: 0.1e-3, t: 0.5 * OZ },
    { f: 50e6, tC: -20, ret: 'iso', w: 3e-3, t: 3 * OZ },
  ];
  for (const [i, p] of pts.entries()) {
    it(`case ${i}: W and ℓ for a resistance and for a drop`, () => {
      const r0 = res(run(p), 'r');
      for (const [mode, k] of [['w', 'w'], ['len', 'len'], ['wV', 'w'], ['lenV', 'len']] as const) {
        const tgt = r0 * 1.7;
        const base = { ...p, i: 2, r: tgt, vd: 2 * tgt };
        const r = run({ ...base, solveFor: mode });
        expect(r.ok && r.results.find((x) => x.key === k)?.value != null, `${mode}`).toBe(true);
        const f = back(r, k, base);
        expect(res(f, 'r') / tgt, `${mode} R`).toBeCloseTo(1, 7);
        expect(res(f, 'vd') / (2 * tgt), `${mode} ΔV`).toBeCloseTo(1, 7);
      }
    });
  }
  it('no width can meet an impossible limit: NO SOLUTION, solved box blank', () => {
    const r = run({ solveFor: 'w', r: 1e-12, len: 100 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.results.find((x) => x.key === 'w')?.value).toBeNull();
  });
});

describe('trace resistance — physics', () => {
  it('R ∝ ℓ and ∝ 1/W at DC', () => {
    expect(res(run({ len: 0.2 }), 'r') / res(run({ len: 0.1 }), 'r')).toBeCloseTo(2, 12);
    expect(res(run({ w: 1e-3 }), 'r') / res(run({ w: 0.5e-3 }), 'r')).toBeCloseTo(0.5, 12);
  });
  it('R rises with temperature and never falls with frequency', () => {
    let prev = 0;
    for (const f of [0, 1e3, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10]) {
      const r = res(run({ f, ret: 'iso', rough: 1e-6 }), 'r');
      expect(r).toBeGreaterThanOrEqual(prev * (1 - 1e-12));
      prev = r;
    }
    expect(res(run({ tC: 100 }), 'r')).toBeGreaterThan(res(run({ tC: 0 }), 'r'));
  });
  it('AC limits: microstrip → T/δ, stripline half of it, isolated → WT/(2δ(W+T)); continuous at the onset', () => {
    const p = { w: 1e-3, t: OZ, f: 10e9, rough: 0, tC: 20 } as const;
    const m = traceR({ ...p, len: 1, ret: 'micro', rho20: 1 / 58e6, alpha: 0.00393 });
    expect(m.skin).toBeCloseTo(OZ / m.delta, 9);
    const st = traceR({ ...p, len: 1, ret: 'strip', rho20: 1 / 58e6, alpha: 0.00393 });
    expect(st.skin / m.skin).toBeCloseTo(0.5, 12);
    const iso = traceR({ ...p, len: 1, ret: 'iso', rho20: 1 / 58e6, alpha: 0.00393 });
    const d = iso.delta;
    expect(iso.skin).toBeCloseTo((1e-3 * OZ) / (2 * d * (1e-3 + OZ) - 4 * d * d), 9);
    for (const ret of ['micro', 'strip', 'iso'] as const) {
      const fOn = skinOnset(OZ, 1 / 58e6, ret);
      const dOn = Math.sqrt(1 / 58e6 / (Math.PI * fOn * 4e-7 * Math.PI));
      expect(acArea(1e-3, OZ, dOn, ret) / (1e-3 * OZ)).toBeCloseTo(1, 9);
    }
  });
});

describe('trace resistance — validity warnings', () => {
  it('temperature outside the linear-tempco range', () => expect(run({ tC: 350 }).warnings.join()).toMatch(/linear tempco/));
  it('roughness factor saturated', () => expect(run({ f: 20e9, rough: 5e-6 }).warnings.join()).toMatch(/saturated/));
  it('IPC-2221 heating beyond the charts', () => expect(run({ i: 30, w: 0.2e-3 }).warnings.join()).toMatch(/IPC-2221/));
  it('below the fabrication minimum width', () => expect(run({ w: 50e-6 }).warnings.join()).toMatch(/fabrication/));
  it('trace only a few skin depths wide', () => expect(run({ w: 20e-6, t: 3 * OZ, f: 100e6, ret: 'iso' }).warnings.join()).toMatch(/skin depths wide/));
});

describe('trace resistance — review regressions', () => {
  it('a solved length or width in mil/in moves to a readable imperial unit (was “2.498e+6 mil”)', () => {
    const a: any = normalizeState(def, { ...def.defaults(), solveFor: 'len', r: 30, lenUnit: 'mil' });
    runCompute(def, a);
    expect(a.lenUnit).toBe('ft');
    expect(a.len / 0.3048).toBeLessThan(1e4);
    const b: any = normalizeState(def, { ...def.defaults(), solveFor: 'w', r: 1e-4, wUnit: 'mil' });
    runCompute(def, b);
    expect(b.wUnit).toBe('in');
  });
  it('the solved drop moves to a readable prefix of V', () => {
    const b: any = normalizeState(def, { ...def.defaults(), vdUnit: 'kV' });
    runCompute(def, b);
    expect(b.vdUnit).toBe('mV');
  });
});

describe('trace resistance — examples and fuzz', () => {
  it('every example computes; the first is the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, normalizeState(def, { ...def.defaults(), ...ex.state }));
      expect(r.ok, ex.id).toBe(true);
      expect(r.status?.text ?? '', ex.id).not.toBe('NO SOLUTION');
      checkReport(r);
    }
  });
  it('compute is fast (< 50 ms)', () => {
    run({ f: 1e9 });
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) run({ f: 1e9, rough: 1e-6 });
    expect((performance.now() - t0) / 10).toBeLessThan(50);
  });
  it('400 random states through runCompute: no throw, finite, stable', () => {
    const ok = fuzz(def, 400, 4242, {});
    expect(ok).toBeGreaterThan(250);
  });
});
