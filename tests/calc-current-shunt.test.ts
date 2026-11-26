import { describe, expect, it } from 'vitest';
import { def, type ShuntState } from '@/calculators/current-shunt/def';
import { codeIdeal, currentFromCode, errorBudget, shuntFor } from '@/calculators/current-shunt/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<ShuntState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity/;

// ── generic fuzz support: random states inside every field's min/max and every select option
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
function randomState(d: CalcDef<any>, rnd: () => number, extra: Record<string, unknown[]>): any {
  const st: any = d.defaults();
  const walk = (fs: FieldSpec[]) => {
    for (const f of fs) {
      if (f.kind === 'section' || f.kind === 'group') walk(f.fields);
      else if (f.kind === 'select') {
        const o = f.options[Math.floor(rnd() * f.options.length)];
        st[f.key] = typeof o === 'string' ? o : o.value;
      } else if (f.kind === 'number') {
        if (f.optional && rnd() < 0.25) {
          st[f.key] = null;
          continue;
        }
        const lo = f.min ?? -1e3;
        const hi = f.max ?? 1e3;
        // spread magnitudes over the whole range: log-uniform for wide ranges (with 0 or negatives too)
        let v: number;
        const span = Math.max(Math.abs(lo), Math.abs(hi));
        if (lo > 0 && hi / lo > 100) v = lo * (hi / lo) ** rnd();
        else if (lo >= 0 && hi > 100 * Math.max(lo, 1e-300)) v = rnd() < 0.05 ? lo : hi * 1e-7 * 1e7 ** rnd();
        else if (lo < 0 && span > 100) v = Math.min(Math.max((rnd() < 0.5 ? -1 : 1) * span * 1e-7 * 1e7 ** rnd(), lo), hi);
        else v = lo + (hi - lo) * rnd();
        if (f.integer) v = Math.round(v);
        st[f.key] = v;
      }
    }
  };
  walk(d.fields);
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
function fuzz(d: CalcDef<any>, n: number, seed: number, extra: Record<string, unknown[]>) {
  const rnd = rng(seed);
  let ok = 0;
  for (let k = 0; k < n; k++) {
    const st = normalizeState(d, randomState(d, rnd, extra));
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

describe('current shunt — published example and Python reference', () => {
  it('TI SLAP178 slides 30–37: 1 mΩ at 5 A, V_os 1 mV → 20 %, CMRR 7.6 %, PSRR 5 %, worst 32.6 %, RSS 21.97 %', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'ti-slap178')!.state });
    expect(r.ok).toBe(true);
    const terms = Object.fromEntries((r.details as any).budget.terms.map((t: any) => [t.key, t.rel]));
    expect(terms.vos).toBeCloseTo(0.2, 12);
    expect(terms.cmrr).toBeCloseTo(0.076, 12);
    expect(terms.psrr).toBeCloseTo(0.05, 12);
    expect(res(r, 'errWorst')).toBeCloseTo(0.326, 6); // + 3e-8 from the 24-bit ADC's ½ LSB
    expect(res(r, 'errRss')).toBeCloseTo(0.2197, 4);
    expect(res(r, 'errRss')).toBeCloseTo(0.21971800108320916, 12); // Python
  });
  it('defaults match the independent Python implementation (cs.py)', () => {
    const r = run({});
    expect(res(r, 'r')).toBeCloseTo(0.011879999999999998, 15);
    expect(res(r, 'errRss')).toBeCloseTo(0.012188242757666543, 14);
    expect(res(r, 'errWorst')).toBeCloseTo(0.022565091014309764, 14);
    expect(res(r, 'lsbI')).toBeCloseTo(0.0013563368055555557, 16);
    expect((r.details as any).solved.code).toBeCloseTo(368.63999999999993, 9);
  });
  it('bidirectional ±20 A example matches Python: G = 148.5, RSS 4.79 %, worst 9.97 %', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'motor-bidir')!.state });
    expect(res(r, 'g')).toBeCloseTo(148.49999999999997, 10);
    expect(res(r, 'errRss')).toBeCloseTo(0.04789862835322551, 13);
    expect(res(r, 'errWorst')).toBeCloseTo(0.09971267361111111, 13);
    expect((r.details as any).solved.code).toBeCloseTo(2232.3199999999997, 9);
  });
  it('feature check: 10 A, 10 mΩ, G 20, 3.3 V, 12 bit → 100 mV, 1 W, 4.028 mA/LSB, code 2482', () => {
    const r = run({ solveFor: 'iMax', r: 10e-3, g: 20, vfs: 3.3, bits: 12, headroom: 0, iMeas: 10, measForm: 'current' });
    expect(res(r, 'vshMeas')).toBeCloseTo(0.1, 12);
    expect(res(r, 'pMeas')).toBeCloseTo(1, 12);
    expect(res(r, 'lsbI')).toBeCloseTo(0.004028320, 9);
    expect(res(r, 'codeInt')).toBe(2482);
    expect(res(r, 'iMax')).toBeCloseTo(16.5, 12);
  });
});

describe('current shunt — solve round trips', () => {
  const pts: Partial<ShuntState>[] = [
    {},
    { iMax: 20, g: 20, vfs: 5, dir: 'bi', headroom: 5 },
    { iMax: 0.05, g: 100, vfs: 1.8, headroom: 25, bits: 16 },
    { iMax: 400, g: 8, vfs: 2.5, dir: 'bi', headroom: 0 },
  ];
  for (const p of pts) {
    it(`R → forward → I_max and G recover (${JSON.stringify(p)})`, () => {
      const a = run({ ...p, solveFor: 'r' });
      const r = res(a, 'r');
      const b = run({ ...p, solveFor: 'iMax', r });
      expect(res(b, 'iMax') / (p.iMax ?? 5)).toBeCloseTo(1, 10);
      const c = run({ ...p, solveFor: 'gain', r });
      expect(res(c, 'g') / (p.g ?? 50)).toBeCloseTo(1, 10);
    });
  }
  it('reading → current → reading recovers the code', () => {
    for (const code of [0, 1, 1500, 4095]) {
      const a = run({ solveFor: 'r', measForm: 'code', code });
      const i = res(a, 'iMeas');
      const b = run({ solveFor: 'r', measForm: 'current', iMeas: i });
      expect((b.details as any).solved.code).toBeCloseTo(code, 9);
    }
    const d = { r: 0.01, g: 20, vfs: 3.3, bits: 12, bidir: true };
    expect(currentFromCode(d, codeIdeal(d, -3.7))).toBeCloseTo(-3.7, 12);
  });
});

describe('current shunt — physics', () => {
  it('doubling the gain halves the shunt; doubling I_max halves it', () => {
    expect(shuntFor(5, 100, 3.3, false, 0.1) / shuntFor(5, 50, 3.3, false, 0.1)).toBeCloseTo(0.5, 14);
    expect(shuntFor(10, 50, 3.3, false, 0.1) / shuntFor(5, 50, 3.3, false, 0.1)).toBeCloseTo(0.5, 14);
    expect(shuntFor(5, 50, 3.3, true, 0.1) / shuntFor(5, 50, 3.3, false, 0.1)).toBeCloseTo(0.5, 14);
  });
  it('offset error ∝ 1/I; gain-type errors do not depend on I', () => {
    const base = { r: 0.01, tolR: 0.01, tcr: 0, temp: 25, thetaR: null, iHeat: 5, vos: 50e-6, vosDrift: 0, gainErr: 0.002, gainDrift: 0, cmrr: 200, vcm: 0, vcmTest: 0, psrr: 200, vs: 5, vsTest: 5, lsbI: 0, refTol: 0 };
    const a = errorBudget({ ...base, i: 1 });
    const b = errorBudget({ ...base, i: 2 });
    expect(a.terms.find((t) => t.key === 'vos')!.rel / b.terms.find((t) => t.key === 'vos')!.rel).toBeCloseTo(2, 12);
    expect(a.terms.find((t) => t.key === 'gain')!.rel).toBe(b.terms.find((t) => t.key === 'gain')!.rel);
    expect(a.rss).toBeLessThanOrEqual(a.worst);
  });
  it('power is I²R and the error graph falls with current', () => {
    const r = run({});
    expect(res(r, 'pMax')).toBeCloseTo(25 * res(r, 'r'), 14);
    const g = r.graphs.find((x) => x.id === 'error')!;
    const rss = g.series!.find((s) => s.label === 'RSS')!.y;
    for (let k = 1; k < rss.length; k++) expect(rss[k]).toBeLessThanOrEqual(rss[k - 1] * (1 + 1e-12));
  });
  it('self-heating adds P·θ_R to the TCR temperature', () => {
    const r = run({ thetaR: 50, tcr: 100, temp: 25 });
    const p = res(r, 'pMax');
    expect(res(r, 'dTself')).toBeCloseTo(p * 50, 12);
    expect((r.details as any).budget.terms.find((t: any) => t.key === 'tcr').rel).toBeCloseTo(100e-6 * p * 50, 14);
  });
});

describe('current shunt — review fixes', () => {
  it('a reading below or above the ADC range is clamped with a warning, and the clamped code converts back', () => {
    const neg = run({ iMeas: -0.5 });
    expect(neg.ok).toBe(true);
    expect(res(neg, 'code')).toBe(0);
    expect(neg.warnings.some((w) => w.includes('reverse current'))).toBe(true);
    const hi = run({ iMeas: 50 });
    expect(res(hi, 'code')).toBe(4095);
    expect(hi.warnings.some((w) => w.includes('saturates at 4095'))).toBe(true);
    const st = { ...def.defaults(), iMeas: 50 };
    runCompute(def, st);
    expect(st.code).toBe(4095);
    const back = runCompute(def, { ...st, measForm: 'code' as const });
    expect(back.ok).toBe(true);
  });
  it('out-of-range solved R, G, I_max and current give specific errors', () => {
    const a = run({ solveFor: 'r', g: 1e5, iMax: 1e4, vfs: 0.01 });
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/1 µΩ … 1 MΩ/);
    const b = run({ solveFor: 'gain', r: 1e-6, iMax: 1e-3 });
    expect(b.ok).toBe(false);
    expect(b.error).toMatch(/100 000 V\/V/);
    const c = run({ solveFor: 'iMax', r: 1e-6, g: 0.01 });
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/10 kA/);
  });
  it('huge percentages print as plain integers, not exponents', () => {
    const r = run({ iMeas: 1e-4, vos: 0.01 });
    const e = r.results.find((x) => x.key === 'errRss')!.display;
    expect(e).not.toMatch(/e\+/);
    expect(e).toMatch(/\d %/);
  });
  it('the TCR term is labelled as hot at I_max when self-heating is included', () => {
    const r = run({ thetaR: 50 });
    expect((r.details as any).budget.terms.find((t: any) => t.key === 'tcr').label).toMatch(/I_max/);
    expect(r.notes.some((n) => n.includes('worst case'))).toBe(true);
  });
});

describe('current shunt — second review', () => {
  it('a clipped reading gets one warning and no error-budget figure', () => {
    const r = run({ iMeas: -1 });
    expect(r.warnings.filter((w) => /below the measurable range|saturat/.test(w)).length).toBe(1);
    expect(r.results.find((x) => x.key === 'errRss')!.display).toMatch(/n\/a/);
    expect(r.notes.some((n) => n.includes('budget figures do not apply'))).toBe(true);
    const hi = run({ iMeas: 50 });
    expect(hi.warnings.filter((w) => /saturat/.test(w)).length).toBe(1);
  });
});

describe('current shunt — limits, warnings and tables', () => {
  it('power above the rating fails, above half of it warns', () => {
    const over = run({ solveFor: 'gain', r: 10e-3, iMax: 30 });
    expect(over.warnings.some((w) => w.includes('above its'))).toBe(true);
    const half = run({ solveFor: 'gain', r: 30e-3, iMax: 5, pRated: 1 });
    expect(half.warnings.some((w) => w.includes('more than half'))).toBe(true);
  });
  it('clipping, sub-mΩ Kelvin and large-error warnings', () => {
    expect(run({ iMeas: 7 }).warnings.some((w) => w.includes('saturates'))).toBe(true);
    expect(run({ solveFor: 'gain', r: 0.5e-3 }).warnings.some((w) => w.includes('Kelvin'))).toBe(true);
    expect(run({ iMeas: 0.01 }).warnings.some((w) => w.includes('error is'))).toBe(true);
    expect(run({ solveFor: 'gain', r: 2e-5 }).warnings.some((w) => w.includes('outside the usual'))).toBe(true);
  });
  it('bad inputs come back as errors', () => {
    expect(run({ headroom: 100 }).ok).toBe(false);
    expect(run({ measForm: 'code', code: 5000 }).ok).toBe(false);
    expect(run({ vfs: 0 }).ok).toBe(false);
    expect(run({ vos: NaN }).ok).toBe(false);
  });
  it('candidate rows are toned by clipping, headroom, span use and power', () => {
    const r = run({});
    const t = r.tables.find((x) => x.id === 'candidates')!;
    t.rows.forEach((row, i) => {
      const clip = row.clip as number;
      const p = row.p as number;
      const use = (row.use as number) / 100;
      const exp = clip < 5 * (1 - 1e-9) || p > 1 ? 'fail' : use > 0.95 || p > 0.5 || use < 0.5 ? 'warn' : 'pass';
      expect(t.rowTones![i]).toBe(exp);
    });
    expect(t.rowTones).toContain('pass');
    expect(t.rowTones).toContain('fail');
  });
  it('every example computes and the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      checkReport(r);
    }
  });
  it('fuzz: 400 random states in every field range and option', () => {
    const ok = fuzz(def, 400, 7, { measForm: ['current', 'code'] });
    expect(ok).toBeGreaterThan(100);
  });
  it('computes in well under 50 ms', () => {
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) run({ iMax: 5 + k });
    expect((performance.now() - t0) / 20).toBeLessThan(25);
  });
});

describe('mode-switch review (regressions)', () => {
  it('◎ on the gain row selects the "gain" solve option (field key g) and the row then shows as solved', () => {
    const f = findField(def.fields, 'g')!.field as any;
    const st: any = def.defaults();
    expect(f.solvedWhen(st, st)).toBe(false);
    f.onSolve(st, st);
    expect(st.solveFor).toBe('gain');
    expect(f.solvedWhen(st, st)).toBe(true);
    const r = runCompute(def as CalcDef<any>, st);
    expect(r.ok).toBe(true);
    expect(r.results.find((x) => x.key === 'g')?.solved).toBe(true);
  });
});
