import { describe, expect, it } from 'vitest';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { def, type FuseState, OZ } from '@/calculators/fusing-current/def';
import { CMIL, onderdonkI, onderdonkT, preeceI, traceArea } from '@/calculators/fusing-current/model';
import { awgDiameterM } from '@/physics/awg';

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

const run = (p: Partial<FuseState>) => def.compute({ ...def.defaults(), ...p });

describe('fusing current — published values', () => {
  it('IEEE Std 80-2013 Table 2 (annealed copper, T_a 40 °C, T_m 1083 °C): K_f = 7.00 → 1 kcmil carries 142.9 A for 1 s; Onderdonk within 1 %', () => {
    const i = onderdonkI(1000 * CMIL, 1, 40, 1083);
    expect(Math.abs(i / (1000 / 7.0) - 1)).toBeLessThan(0.01);
  });
  it('IEEE Std 80-2013 eq. (37) with Table 1 constants (TCAP 3.42, α 0.00393, ρ 1.72 µΩcm, K₀ 234): 0.14281 A/cmil at 1 s — Onderdonk within 1 %', () => {
    expect(Math.abs(onderdonkI(CMIL, 1, 40, 1083) / 0.14280960773635196 - 1)).toBeLessThan(0.01);
  });
  it('Preece’s copper constant 10244 (d in inches) ≡ Brooks’s area form I = 12277·A^0.75 (A in in²)', () => {
    const d = 0.01 * 0.0254;
    const aIn2 = (Math.PI / 4) * 0.01 ** 2;
    expect(preeceI(d) / (12277 * aIn2 ** 0.75)).toBeCloseTo(1, 3); // 12277 is 10244·(4/π)^0.75 rounded
  });
});

describe('fusing current — independent Python reference (fusing.py, 300 random states, all solve options, worst 2e-15)', () => {
  it('0.25 mm, 1 oz, 100 ms from 25 °C', () => expect(res(run({}), 'i')).toBeCloseTo(7.94091331347037, 12));
  it('AWG 30 wire (d = 0.005 in · 92^(6/39)), 1 s', () => expect(res(run({ conductor: 'wire', d: awgDiameterM(30), dur: 1 }), 'i')).toBeCloseTo(14.703331515606893, 11));
  it('Preece, AWG 30', () => expect(res(run({ conductor: 'wire', d: awgDiameterM(30), dur: 1 }), 'preece')).toBeCloseTo(10.282681467177925, 11));
});

describe('fusing current — solve → forward round trips', () => {
  const pts: Partial<FuseState>[] = [
    {},
    { w: 1e-3, t: 2 * OZ, ef: 2, dur: 0.01, ta: 60 },
    { w: 0.15e-3, t: 0.5 * OZ, ef: 0, dur: 1, tm: 300 },
    { conductor: 'wire', d: 0.5e-3, dur: 0.002 },
  ];
  for (const [i, p] of pts.entries()) {
    it(`case ${i}: t, and the size, reproduce the current`, () => {
      const i0 = res(run({ ...p, solveFor: 'i' }), 'i');
      const iq = i0 * 1.3;
      const rt = run({ ...p, solveFor: 'dur', i: iq });
      expect(res(run({ ...p, solveFor: 'i', dur: res(rt, 'dur') }), 'i') / iq).toBeCloseTo(1, 9);
      const key = p.conductor === 'wire' ? 'd' : 'w';
      const rs = run({ ...p, solveFor: key, i: iq });
      expect(res(run({ ...p, solveFor: 'i', [key]: res(rs, key) }), 'i') / iq).toBeCloseTo(1, 9);
    });
  }
  it('the size unknown follows the conductor (w on a wire becomes d)', () => {
    const r = def.compute({ ...def.defaults(), conductor: 'wire', solveFor: 'w', i: 20 });
    expect(r.results.find((x) => x.solved)?.key).toBe('d');
  });
});

describe('fusing current — physics', () => {
  it('I ∝ A and ∝ 1/√t; I²t is constant', () => {
    expect(res(run({ w: 0.5e-3 }), 'i') / res(run({ w: 0.25e-3 }), 'i')).toBeCloseTo(2, 12);
    expect(res(run({ dur: 0.01 }), 'i') / res(run({ dur: 1 }), 'i')).toBeCloseTo(10, 12);
    expect(res(run({ dur: 0.01 }), 'i2t')).toBeCloseTo(res(run({ dur: 1 }), 'i2t'), 9);
  });
  it('hotter start or a lower limit temperature lowers the current; an etch factor shrinks the area', () => {
    expect(res(run({ ta: 85 }), 'i')).toBeLessThan(res(run({ ta: 25 }), 'i'));
    expect(res(run({ tm: 300 }), 'i')).toBeLessThan(res(run({ tm: 1083 }), 'i'));
    expect(traceArea(0.3e-3, 105e-6, 1).area).toBeCloseTo(105e-6 * (0.3e-3 - 105e-6), 15);
    expect(res(run({ ef: 1, t: 3 * OZ, w: 0.3e-3 }), 'i')).toBeLessThan(res(run({ ef: 0, t: 3 * OZ, w: 0.3e-3 }), 'i'));
  });
  it('onderdonkT inverts onderdonkI', () => expect(onderdonkT(1e-8, onderdonkI(1e-8, 0.37, 25, 1083), 25, 1083)).toBeCloseTo(0.37, 12));
});

describe('fusing current — validity', () => {
  it('beyond ~1.5 s: Brooks & Adam warning', () => expect(run({ dur: 5 }).warnings.join()).toMatch(/Brooks & Adam/));
  it('a limit temperature below melting is noted', () => expect(run({ tm: 300 }).notes.join()).toMatch(/not for melting/));
  it('review fix: T_m above copper’s melting point is refused (the model has no liquid copper)', () => expect(() => def.compute({ ...def.defaults(), tm: 1500 })).toThrow(/melting point/));
  it('fabrication minimum', () => expect(run({ w: 50e-6 }).warnings.join()).toMatch(/fabrication/));
  it('hot start above laminate rating', () => expect(run({ ta: 200 }).warnings.join()).toMatch(/laminates/));
  it('a current too small to fuse within an hour: NO SOLUTION', () => {
    const r = run({ solveFor: 'dur', i: 0.02 });
    expect(r.status?.text).toBe('NO SOLUTION');
  });
  it('a trace narrower than 2T/EF becomes a ridge: area ef·W²/4, continuous at W = 2T/EF, with a warning', () => {
    const t = 3 * OZ;
    expect(traceArea((2 * t) / 1, t, 1).area).toBeCloseTo(traceArea((2 * t) / 1 * (1 - 1e-12), t, 1).area, 18);
    expect(traceArea(0.1e-3, t, 1).area).toBeCloseTo((1 * 0.1e-3 * 0.1e-3) / 4, 18);
    const r = run({ w: 0.1e-3, t, ef: 1 });
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/ridge/);
  });
});

describe('fusing current — examples and fuzz', () => {
  it('every example computes; the first is the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, normalizeState(def, { ...def.defaults(), ...ex.state }));
      expect(r.ok, ex.id).toBe(true);
      expect(r.status?.text ?? '', ex.id).not.toBe('NO SOLUTION');
      checkReport(r);
    }
  });
  it('400 random states through runCompute: no throw, finite, stable', () => {
    expect(fuzz(def, 400, 77, {})).toBeGreaterThan(200);
  });
});
