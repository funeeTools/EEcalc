import { describe, expect, it } from 'vitest';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { def, type ErState, MATERIALS } from '@/calculators/embedded-resistor/def';
import { MIL2, ohmegaSmallPd, powerRating, tolerance, widthForRating } from '@/calculators/embedded-resistor/model';

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


const run = (p: Partial<ErState>) => def.compute({ ...def.defaults(), ...p });
const MIL = 25.4e-6;

describe('embedded resistor — published values', () => {
  it('Ohmega design guide: 25 Ω/□, 30 × 15 mil = 2 squares = 50 Ω', () => {
    const r = run({ solveFor: 'r', mat: 'Custom', rs: 25, l: 30 * MIL, w: 15 * MIL, nc: 0 });
    expect(res(r, 'r')).toBeCloseTo(50, 12);
  });
  it('Ohmega meander: 37 squares + 16 corners × 0.56 of 100 Ω/□ = 45.96 squares ≈ 4.6 kΩ', () => {
    const r = runCompute(def, normalizeState(def, { ...def.defaults(), ...def.examples!.find((e) => e.id === 'meander-4k6')!.state }));
    expect(res(r, 'n')).toBeCloseTo(45.96, 10);
    expect(res(r, 'r')).toBeCloseTo(4596, 8);
  });
  it('Snogren Table 4: etch-only tolerance range of a 50 Ω one-square element (+10/−5 µm etch)', () => {
    const pub: [number, number][] = [[0.1, 29.4], [0.25, 11.9], [0.5, 6.0], [1.0, 3.0], [2.5, 1.2], [5, 0.6], [10, 0.3]];
    for (const [mm, pct] of pub) {
      const t = tolerance(mm * 1e-3, mm * 1e-3, 0, 0, 10e-6, 5e-6)!;
      expect(Math.round(1000 * (t.geoPlus + t.geoMinus)) / 10).toBeCloseTo(pct, 6);
    }
  });
  it('Ohmega small-element curve: 25 Ω/□ at 500 mil² = 61.2·500^−0.87 mW/mil², held at 200 mil² below that', () => {
    expect((ohmegaSmallPd(25, 500 * MIL2)! * MIL2) / 1e-3).toBeCloseTo(61.2 * 500 ** -0.87, 12);
    expect(ohmegaSmallPd(25, 50 * MIL2)).toBeCloseTo(ohmegaSmallPd(25, 200 * MIL2)!, 6);
    expect(ohmegaSmallPd(33, 500 * MIL2)).toBeNull();
  });
  it('Python reference points (independent re-implementation, 1e-9)', () => {
    // er_ref.py: default 100 Ω in 25 Ω/□ at 0.5 mm: L = 2 mm, A = 1 mm² (1550 mil², above the curve: 0.150 mW/mil²)
    const a = run({});
    expect(res(a, 'l')).toBeCloseTo(2e-3, 15);
    // 70 °C ambient: Ohmega's 25 / 80 °C large-element densities 0.150 / 0.098 mW/mil², interpolated
    expect(res(a, 'pMax') / ((0.15 + (45 / 55) * (0.098 - 0.15)) * 1e-3 * (1e-6 / MIL2))).toBeCloseTo(1, 12);
    expect(res(a, 'rMax') / (25 * 1.05 * (2.01e-3 / 0.495e-3))).toBeCloseTo(1, 12);
    expect(res(a, 'rMin') / (25 * 0.95 * (1.995e-3 / 0.51e-3))).toBeCloseTo(1, 12);
    // 50 Ω under a BGA, 0.25 × 0.25 mm (96.9 mil²): Ohmega curve held at 200 mil² for 50 Ω/□
    const b = runCompute(def, normalizeState(def, { ...def.defaults(), ...def.examples!.find((e) => e.id === 'term-50')!.state }));
    expect(res(b, 'pMax') / ((54.5 + (45 / 55) * (35.4 - 54.5)) * 200 ** -0.87 * 1e-3 * (0.0625e-6 / MIL2))).toBeCloseTo(1, 9);
  });
});

describe('embedded resistor — solve round trips', () => {
  for (const [w, l, nc, rs] of [[0.5e-3, 2e-3, 0, 25], [0.1e-3, 3.7e-3, 16, 100], [2e-3, 0.4e-3, 0, 10], [30e-6, 5e-3, 4, 1000]] as const)
    it(`L and W for the resistance of ${w} × ${l}, ${nc} corners, ${rs} Ω/□`, () => {
      const base = { mat: 'Custom', rs, nc };
      const r = res(run({ ...base, solveFor: 'r', w, l }), 'r');
      expect(res(run({ ...base, solveFor: 'l', r, w }), 'l') / l).toBeCloseTo(1, 12);
      expect(res(run({ ...base, solveFor: 'w', r, l }), 'w') / w).toBeCloseTo(1, 12);
    });
  it('narrowest width for P really rates P (both power models)', () => {
    for (const [mat, p] of [['OhmegaPly NiP 25 Ω/□', 0.05], ['OhmegaPly NiP 25 Ω/□', 2e-3], ['OhmegaPly NiP 100 Ω/□', 0.3], ['Ticer TCR NiCr 50 Ω/□', 0.1]] as const) {
      const [rs, tol, tcr, pd, tech] = MATERIALS[mat];
      const st = { mat, rs, tol, tcr, pd, tech, p, r: 100, solveFor: 'l' as const };
      const w = res(run(st), 'wMinP');
      const r2 = run({ ...st, w });
      expect(r2.summary).toContain(mat);
      expect(res(r2, 'pMax') / p).toBeCloseTo(1, 6);
    }
  });
});

describe('embedded resistor — physics sanity', () => {
  it('resistance scales with R_s and L, inversely with W; corners add 0.56 squares each', () => {
    const a = res(run({ solveFor: 'r', mat: 'Custom', rs: 50, l: 1e-3, w: 0.5e-3 }), 'r');
    expect(res(run({ solveFor: 'r', mat: 'Custom', rs: 50, l: 2e-3, w: 0.5e-3 }), 'r')).toBeCloseTo(2 * a, 10);
    expect(res(run({ solveFor: 'r', mat: 'Custom', rs: 50, l: 1e-3, w: 1e-3 }), 'r')).toBeCloseTo(a / 2, 10);
    expect(res(run({ solveFor: 'r', mat: 'Custom', rs: 50, l: 1e-3, w: 0.5e-3, nc: 2 }), 'r') - a).toBeCloseTo(50 * 1.12, 10);
  });
  it('tolerance falls toward the sheet tolerance as the element grows (bigger is better)', () => {
    const t = [0.1e-3, 0.5e-3, 5e-3].map((w) => res(run({ w }), 'tolPlus'));
    expect(t[0]).toBeGreaterThan(t[1]);
    expect(t[1]).toBeGreaterThan(t[2]);
    expect(t[2]).toBeCloseTo(5, 0);
    // no etch: tolerance is exactly the sheet tolerance
    expect(res(run({ etchP: 0, etchM: 0 }), 'tolPlus')).toBeCloseTo(5, 12);
  });
  it('power rating rises with area and the Ohmega curve never lowers it', () => {
    let prev = 0;
    for (let i = 1; i < 200; i++) {
      const a = (i * 20) * MIL2;
      const p = powerRating(a, 0.15e-3 / MIL2, 25);
      expect(p).toBeGreaterThan(prev);
      expect(p).toBeGreaterThanOrEqual(0.15e-3 / MIL2 * a - 1e-18);
      prev = p;
    }
  });
  it('TCR drift: +50 ppm/°C over 60 °C is +0.3 %', () => expect(res(run({ tcr: 50, mat: 'Custom', tOp: 85 }), 'drift')).toBeCloseTo(0.3, 12));
  it('W_min for P is a closed form without the curve', () => {
    const w = widthForRating(0.1, 1e5, null, 4, 0);
    expect(1e5 * w * w * 4).toBeCloseTo(0.1, 12);
  });
});

describe('embedded resistor — validity limits', () => {
  it('over power: fail status and a fix', () => {
    const r = run({ p: 1 });
    expect(r.status?.text).toBe('OVER POWER');
    expect(r.warnings.join(' ')).toMatch(/widen the element to W ≥/);
  });
  it('warns near the power limit', () => expect(run({ p: 0.15 }).warnings.join(' ')).toMatch(/% of the rating/));
  it('Ohmega rating follows the ambient: 25 °C and 80 °C tables, held outside, warning above 80 °C (review fix)', () => {
    const at = (tOp: number) => res(run({ tOp }), 'pMax');
    expect(at(80) / at(25)).toBeCloseTo(0.098 / 0.15, 12);
    expect(at(10)).toBeCloseTo(at(25), 15);
    expect(at(120)).toBeCloseTo(at(80), 15);
    expect(run({ tOp: 85 }).warnings.join(' ')).toMatch(/highest rating table/);
    expect(run({ tOp: 80 }).warnings.join(' ')).not.toMatch(/highest rating table/);
    expect((ohmegaSmallPd(25, 500 * MIL2, 80)! * MIL2) / 1e-3).toBeCloseTo(39.9 * 500 ** -0.87, 12);
  });
  it('warns for thin-film elements under 10 mil, citing Ohmega’s measured tolerances (review fix)', () => {
    expect(run({ w: 0.2e-3 }).warnings.join(' ')).toMatch(/under 10 mil/);
    expect(run({ w: 0.3e-3 }).warnings.join(' ')).not.toMatch(/under 10 mil/);
  });
  it('tolerance shows the same decimals on both sides (review fix)', () => {
    for (const w of [0.1e-3, 0.5e-3, 5e-3]) {
      const d = run({ w }).results.find((x) => x.key === 'tolPlus')!.display;
      const [a, b] = d.split(' / ').map((x) => x.split('.')[1]?.length);
      expect(a, d).toBe(b);
    }
  });
  it('warns when the etch dominates the tolerance, and when the element is smaller than the etch', () => {
    expect(run({ w: 0.15e-3 }).warnings.join(' ')).toMatch(/etch tolerance adds more/);
    expect(run({ w: 10e-6, solveFor: 'r', l: 1e-3, etchM: 20e-6 }).warnings.join(' ')).toMatch(/not larger than the etch/);
  });
  it('warns outside the TCR temperature range and for PTF', () => {
    expect(run({ tOp: 150 }).warnings.join(' ')).toMatch(/−55…125/);
    expect(run({ tech: 'ptf' }).warnings.join(' ')).toMatch(/±40 %/);
  });
  it('no solution when the corners alone exceed the target', () => {
    const r = run({ solveFor: 'l', r: 50, nc: 10, mat: 'Custom', rs: 25 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.warnings[0]).toMatch(/corners alone/);
  });
});

describe('embedded resistor — examples and fuzz', () => {
  it('every example computes; the first equals the defaults; only the power-fail example is over power', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, normalizeState(def, { ...def.defaults(), ...ex.state }));
      expect(r.ok, ex.id).toBe(true);
      expect(r.status?.text, ex.id).toBe(ex.id === 'power-fail' ? 'OVER POWER' : undefined);
    }
  });
  it('defaults raise no warnings', () => expect(run({}).warnings).toEqual([]));
  it('fuzz: 400 random states through runCompute', () => {
    const ok = fuzz(def, 400, 7373, {});
    expect(ok).toBeGreaterThan(250);
  });
});
