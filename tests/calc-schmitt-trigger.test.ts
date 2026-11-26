import { describe, expect, it } from 'vitest';
import { type SchmittState, def } from '@/calculators/schmitt-trigger/def';
import { GATES, gateThresholds, kRange, oscFactors } from '@/calculators/schmitt-trigger/model';
import { runCompute } from '@/core/calc/page';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const run = (p: Partial<SchmittState>) => def.compute({ ...def.defaults(), ...p });
const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const det = (r: CalcReport) => r.details as any;

// ── fuzz helpers: random states over every field's min/max and select option, through runCompute ──
type Scope = Record<string, any>;
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function randomize(fields: FieldSpec[], scope: Scope, rnd: () => number): void {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') randomize(f.fields, scope, rnd);
    else if (f.kind === 'number') {
      if (f.optional && rnd() < 0.25) {
        scope[f.key] = null;
        continue;
      }
      const lo = f.min ?? -1e3;
      const hi = f.max ?? 1e3;
      let v = lo > 0 && hi / lo > 100 ? lo * (hi / lo) ** rnd() : lo + (hi - lo) * rnd();
      if (f.integer) v = Math.round(v);
      scope[f.key] = v;
    } else if (f.kind === 'select') {
      const o = f.options[Math.floor(rnd() * f.options.length)];
      scope[f.key] = typeof o === 'string' ? o : o.value;
    } else if (f.kind === 'toggle') scope[f.key] = rnd() < 0.5;
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;
function checkReport(r: CalcReport, tag: string): void {
  if (!r.ok) {
    expect(typeof r.error, tag).toBe('string');
    expect(BAD.test(r.error!), `${tag} error text: ${r.error}`).toBe(false);
    return;
  }
  for (const x of r.results) {
    if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${tag} ${x.key}=${x.value}`).toBe(true);
    expect(BAD.test(x.display), `${tag} ${x.key} display "${x.display}"`).toBe(false);
    if (x.note) expect(BAD.test(x.note), `${tag} ${x.key} note "${x.note}"`).toBe(false);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(BAD.test(v), `${tag} table "${v}"`).toBe(false);
  for (const s of [r.summary ?? '', ...r.warnings, ...r.notes]) expect(BAD.test(s), `${tag} text "${s}"`).toBe(false);
  for (const g of r.graphs)
    for (const s of g.series ?? []) {
      expect(s.x.length, `${tag} ${g.id}`).toBe(s.y.length);
      expect(s.x.every(Number.isFinite) && s.y.every(Number.isFinite), `${tag} ${g.id}/${s.label}`).toBe(true);
    }
}
/** n random states (solve options in turn) through runCompute; returns ok/fail counts. Solved states must recompute stably. */
function fuzz(d: CalcDef<any>, n: number, seed: number, fix?: (s: Scope) => void): { ok: number; fail: number } {
  const rnd = rng(seed);
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < n; i++) {
    const st: Scope = d.defaults();
    randomize(d.fields, st, rnd);
    st.solveFor = d.solve!.options[i % d.solve!.options.length].key;
    fix?.(st);
    let r!: CalcReport;
    expect(() => (r = runCompute(d, st)), `case ${i}`).not.toThrow();
    checkReport(r, `case ${i} (${st.solveFor})`);
    if (!r.ok) {
      fail++;
      continue;
    }
    ok++;
    const st2 = structuredClone(st);
    const r2 = runCompute(d, st2);
    expect(r2.ok, `case ${i} recompute: ${r2.error}`).toBe(true);
    for (const x of r.results) {
      const y = r2.results.find((z) => z.key === x.key);
      if (typeof x.value === 'number' && typeof y?.value === 'number') expect(Math.abs(y.value - x.value), `case ${i} stability ${x.key}`).toBeLessThanOrEqual(1e-6 * Math.max(Math.abs(x.value), 1e-12) + 1e-15);
    }
  }
  return { ok, fail };
}

describe('schmitt trigger: data-sheet thresholds', () => {
  it('74HC14 at the SCLS085L rows (typ): 2 V 1.2/0.6, 4.5 V 2.5/1.6, 6 V 3.3/2.0', () => {
    for (const [v, p, m] of [[2, 1.2, 0.6], [4.5, 2.5, 1.6], [6, 3.3, 2.0]]) {
      const t = gateThresholds(GATES.HC14, v);
      expect(t.vtp).toBeCloseTo(p, 12);
      expect(t.vtm).toBeCloseTo(m, 12);
    }
    const t = gateThresholds(GATES.HC14, 4.5);
    for (const [k, v] of Object.entries({ tpMin: 1.55, tpMax: 3.13, tmMin: 0.9, tmMax: 2.45, dvMin: 0.4, dvMax: 2.1 })) expect((t as any)[k], k).toBeCloseTo(v, 12);
  });
  it('74LVC1G14 at 3 V (SCES218AA): V_T+ 1.5–1.87 V, V_T− 0.84–1.14 V, ΔV_T 0.56–0.87 V; nominal = window centre', () => {
    const t = gateThresholds(GATES.LVC1G14, 3);
    for (const [k, v] of Object.entries({ tpMin: 1.5, tpMax: 1.87, tmMin: 0.84, tmMax: 1.14, dvMin: 0.56, dvMax: 0.87 })) expect((t as any)[k], k).toBeCloseTo(v, 12);
    expect(t.typical).toBe(false);
    expect(t.vtp).toBeCloseTo(1.685, 12);
  });
});

describe('schmitt trigger: oscillator equations (independent Python reference)', () => {
  it('74HC14 at 5 V (interpolated typ), 10 kΩ, 10 nF → 11 794.24 Hz, D = 44.85 %', () => {
    const r = run({});
    expect(res(r, 'f')).toBeCloseTo(11794.236590325085, 6);
    expect(res(r, 'duty') / 100).toBeCloseTo(0.44850516596962503, 12);
  });
  it('74HC14 at 4.5 V: C for 1 kHz with 100 kΩ = 12.227 nF', () => {
    const r = run({ vcc: 4.5, solveFor: 'c', r: 100e3, f: 1e3 });
    expect(res(r, 'c')).toBeCloseTo(1.222717117020179e-8, 18);
  });
  it('74LVC1G14 at 3.3 V: R for 32.768 kHz with 1 nF = 33.695 kΩ', () => {
    const r = run({ part: 'LVC1G14', vcc: 3.3, solveFor: 'r', c: 1e-9, f: 32768 });
    expect(res(r, 'r')).toBeCloseTo(33695.00528507167, 6);
  });
  it('op-amp astable, symmetric ±10.5 V, R₁ = R₂: Sedra & Smith T = 2RC·ln[(1+β)/(1−β)] = 2RC·ln3 → 968.34 Hz with 47 kΩ, 10 nF', () => {
    const r = run(def.examples!.find((e) => e.id === 'opamp-pm12')!.state);
    expect(res(r, 'f')).toBeCloseTo(968.3396027945079, 8);
    expect(det(r).k).toBeCloseTo(2 * Math.log(3), 12);
    expect(res(r, 'duty')).toBeCloseTo(50, 10);
  });
  it('frequency spread over the data-sheet window: 74HC14 5 V, 10k/10n → 5023.3 … 28 773.8 Hz (Python boundary scan)', () => {
    const r = run({});
    expect(det(r).fMin).toBeCloseTo(5023.324738275303, 5);
    expect(det(r).fMax).toBeCloseTo(28773.786393513346, 4);
    // k extremes against a brute-force grid over the window
    const t = gateThresholds(GATES.HC14, 5);
    let lo = Infinity;
    let hi = -Infinity;
    for (let a = 0; a <= 300; a++)
      for (let b = 0; b <= 300; b++) {
        const p = t.tpMin + ((t.tpMax - t.tpMin) * a) / 300;
        const m = t.tmMin + ((t.tmMax - t.tmMin) * b) / 300;
        if (p - m < t.dvMin || p - m > t.dvMax) continue;
        const k = oscFactors({ vth: p, vtl: m, voh: 5, vol: 0 }).k;
        lo = Math.min(lo, k);
        hi = Math.max(hi, k);
      }
    const kr = kRange(t, 5);
    expect(kr.kMin).toBeLessThanOrEqual(lo + 1e-12);
    expect(kr.kMax).toBeGreaterThanOrEqual(hi - 1e-12);
    expect(kr.kMin / lo).toBeCloseTo(1, 2);
    expect(kr.kMax / hi).toBeCloseTo(1, 2);
  });
});

describe('schmitt trigger: round trips, physics, limits', () => {
  for (const ex of ['hc14-5v', 'lvc-3v3', 'opamp-pm12', 'opamp-single']) {
    it(`${ex}: f → R → f and f → C → f`, () => {
      const base = { ...def.defaults(), ...def.examples!.find((e) => e.id === ex)!.state, solveFor: 'f' } as SchmittState;
      const a = def.compute(base);
      for (const k of ['r', 'c'] as const) {
        const b = def.compute({ ...base, solveFor: k, [k]: 1, f: det(a).f });
        expect(b.ok).toBe(true);
        expect(det(b).state[k] / base[k]).toBeCloseTo(1, 12);
      }
    });
  }
  it('f ∝ 1/(RC); centred thresholds give 50 % duty', () => {
    expect(det(run({ r: 20e3 })).f / det(run({ r: 10e3 })).f).toBeCloseTo(0.5, 12);
    const r = run({ part: 'custom', vcc: 5, vtp: 3, vtm: 2 });
    expect(res(r, 'duty')).toBeCloseTo(50, 10);
  });
  it('narrow hysteresis → high frequency: k → 0 as V_T+ → V_T−', () => {
    expect(det(run({ part: 'custom', vtp: 2.51, vtm: 2.49 })).k).toBeLessThan(0.02);
  });
  it('warnings: drive current, propagation delay, input capacitance, leakage, slew rate, high frequency', () => {
    const fast = run({ r: 680, c: 47e-12 });
    for (const s of ['drives up to', 'Propagation delay', 'input capacitance', 'delays and parasitics']) expect(fast.warnings.some((w) => w.includes(s)), s).toBe(true);
    expect(run({ r: 10e6, c: 1e-9 }).warnings.some((w) => w.includes('leakage'))).toBe(true);
    expect(run(def.examples!.find((e) => e.id === 'opamp-pm12')!.state).warnings.some((w) => w.includes('slew rate'))).toBe(true);
    expect(run({ type: 'opamp', voh: 12, vol: -12, r: 100, r1: 100, r2: 100 }).warnings.some((w) => w.includes('output supplies'))).toBe(true);
  });
  it('errors: V_CC outside the part range, bad custom thresholds, V_ref outside the swing', () => {
    expect(run({ vcc: 7 }).error).toMatch(/recommended range/);
    expect(run({ part: 'custom', vtp: 1, vtm: 2 }).ok).toBe(false);
    expect(run({ type: 'opamp', vref: 20 }).ok).toBe(false);
  });
  it('switching the gate clamps V_CC into the new part’s range (no red error after a setting switch)', () => {
    const st = { ...def.defaults(), part: 'LVC1G14', vcc: 1.8 } as SchmittState;
    const f = def.fields.flatMap((x) => (x.kind === 'section' ? x.fields : [x])).find((x) => x.kind === 'select' && x.key === 'part') as any;
    f.apply('HC14', st, st);
    st.part = 'HC14';
    expect(st.vcc).toBe(2);
    expect(def.compute(st).ok).toBe(true);
  });
});

describe('schmitt trigger: examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = runCompute(def as CalcDef<any>, { ...def.defaults(), ...structuredClone(e.state) });
      expect(r.ok, `${e.id}: ${r.error}`).toBe(true);
      checkReport(r, e.id);
    }
  });
  it('fuzz: 400 random states never throw, stay finite and recompute stably', () => {
    // fully random: V_CC is often outside the chosen gate's range and custom / op-amp thresholds are often
    // inconsistent, so many states are refused with a message; the next test covers valid ones
    const { ok } = fuzz(def as CalcDef<any>, 400, 23);
    expect(ok).toBeGreaterThan(30);
  });
  it('fuzz: valid inputs are never refused', () => {
    const { fail } = fuzz(def as CalcDef<any>, 300, 24, (s) => {
      const p = GATES[s.part];
      if (p) s.vcc = p.vMin + (p.vMax - p.vMin) * (s.vcc / 20);
      s.vtm = 0.2 * s.vcc;
      s.vtp = 0.7 * s.vcc;
      if (s.vol >= s.voh) s.vol = s.voh - 1;
      s.vref = (s.voh + s.vol) / 2;
      s.solveFor = 'f';
    });
    expect(fail).toBe(0);
  });
});
