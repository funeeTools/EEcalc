import { describe, expect, it } from 'vitest';
import { type MirrorState, def, modelIn } from '@/calculators/current-mirror/def';
import { atIref, bjtPair, rOut, wilson } from '@/calculators/current-mirror/model';
import { runCompute } from '@/core/calc/page';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const run = (p: Partial<MirrorState>) => def.compute({ ...def.defaults(), ...p });
const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const det = (r: CalcReport) => r.details as any;
const ideal = { is: 1e-15, beta: 1e9, va: 1e9, vt: 0.025 };

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

describe('current mirror: textbook results', () => {
  it('Sedra & Smith Ex. 8.1 (λ = 0): 100 µA from 3 V with k′ = 200 µA/V², W/L = 10, V_t = 0.7 V → V_OV = 0.316 V, R = 19.84 kΩ, V_O,min = 0.316 V', () => {
    const r = run({ ...def.examples!.find((e) => e.id === 'sedra-8-1')!.state, lambda: 0 });
    expect(res(r, 'rref')).toBeCloseTo(19837.72233983162, 6);
    expect(res(r, 'vov')).toBeCloseTo(Math.sqrt(0.1), 12);
    expect(det(r).vMinAbs).toBeCloseTo(0.31623, 5);
    expect(res(r, 'iout')).toBeCloseTo(100e-6, 15);
  });
  it('Sedra & Smith Ex. 8.1 with V_A = 20 V (λ = 0.05): r_o ≈ V_A/I_O = 200 kΩ; ΔI_O ≈ 5 µA per volt (model: exact derivative 1/(λK))', () => {
    const r = run(def.examples!.find((e) => e.id === 'sedra-8-1')!.state);
    const ro = res(r, 'rout');
    expect(ro / 200e3).toBeCloseTo(1.05, 1);
    const k = res(r, 'iout') / (1 + 0.05 * 1.5);
    expect(ro).toBeCloseTo(1 / (0.05 * k), 3);
  });
  it('Widlar (Sedra & Smith): I_ref = 1 mA → I_out = 10 µA needs R_E = V_T·ln(100)/10 µA = 11.51 kΩ at V_T = 25 mV', () => {
    const p = bjtPair(ideal, 1e-3, 1, 0, 11512.925464970229, 2, 0.2);
    expect(p.iout).toBeCloseTo(10e-6, 12);
  });
  it('basic mirror: I_out/I_ref = N/(1 + (N+1)/β) without Early effect; Wilson 1 − 2/(β² + 2β + 2)', () => {
    for (const [n, beta] of [[1, 100], [4, 50], [0.5, 200]]) {
      const p = bjtPair({ ...ideal, beta }, 1e-3, n, 0, 0, 0.7, 0.2);
      expect(p.iout / 1e-3).toBeCloseTo(n / (1 + (n + 1) / beta), 6);
    }
    for (const beta of [20, 100, 400]) expect(wilson({ ...ideal, beta }, 1e-3, 3, 0.2).iout / 1e-3).toBeCloseTo(1 - 2 / (beta * beta + 2 * beta + 2), 6);
  });
  it('output resistance: basic r_o = (V_A + V_CE)/I_C; Wilson ≈ β·r_o/2; degeneration ≈ r_o[1 + g_m(R_E∥r_π)]', () => {
    const s = { ...def.defaults(), bjtPart: 'custom', va: 50, beta: 100, solveFor: 'iref' as const, rref: 4.3e3 };
    const b = run(s);
    expect(res(b, 'rout')).toBeCloseTo((50 + 2.5) / res(b, 'iout'), -1);
    const w = run({ ...s, topo: 'bjt-wilson', vcc: 12, vout: 6, rref: 47e3 });
    const ro = (50 + 6) / res(w, 'iout');
    expect(Math.abs(res(w, 'rout') / ((100 * ro) / 2) - 1)).toBeLessThan(0.15); // small-signal estimate
    const d = run({ ...s, topo: 'bjt-degen', re: 1e3 });
    const ic = res(d, 'iout');
    const gm = ic / 0.025693;
    const rpi = 100 / gm;
    // base driven by Q1 + R_E1: R_B ≈ 1/g_m + R_E, so R_out ≈ r_o[1 + g_m·R_E·r_π/(r_π + R_B + R_E)] (Gray & Meyer)
    const rb = 1 / gm + 1e3;
    const est = ((50 + 2.5 - ic * 1e3) / ic) * (1 + (gm * 1e3 * rpi) / (rpi + rb + 1e3));
    expect(Math.abs(res(d, 'rout') / est - 1)).toBeLessThan(0.15);
  });
});

describe('current mirror: independent Python reference (node-voltage formulation)', () => {
  it('2N3904 basic mirror (β = 70), 1 mA from 5 V, V_out 2.5 V, 25 °C → R_ref 4340.03 Ω, I_out 0.996418 mA', () => {
    const r = run({});
    expect(res(r, 'rref')).toBeCloseTo(4340.033408653693, 6);
    expect(res(r, 'iout')).toBeCloseTo(0.000996418084025077, 13);
  });
  it('2N3906 Wilson source (β = 80) at I_ref = 227.27 µA, 6 V from V_CC → I_out 220.857 µA', () => {
    const s = { ...def.defaults(), ...def.examples!.find((e) => e.id === 'wilson-pnp')!.state } as MirrorState;
    expect(atIref(modelIn(s), 227.27e-6).iout).toBeCloseTo(0.00022085679129328395, 13);
  });
  it('NMOS cascode, 100 µA, V_out 1.5 V (λ = 0.05) → I_out 99.9819 µA, reference branch 2.01709 V', () => {
    const s = { ...def.defaults(), ...def.examples!.find((e) => e.id === 'cascode-headroom')!.state, vout: 1.5 } as MirrorState;
    const p = atIref(modelIn(s), 100e-6);
    expect(p.iout).toBeCloseTo(9.998185829963727e-5, 14);
    expect(p.vRef).toBeCloseTo(2.01708788018838, 10);
  });
});

describe('current mirror: solve round trips', () => {
  for (const topo of ['bjt-basic', 'bjt-degen', 'bjt-wilson', 'bjt-widlar', 'mos-simple', 'mos-cascode'] as const)
    for (const polarity of ['sink', 'source'] as const)
      it(`${topo} ${polarity}: I_ref → R_ref → I_ref`, () => {
        const base: Partial<MirrorState> = { topo, polarity, vcc: 12, vout: 6, n: 2, iref: 200e-6, re: 1e3, rw: 5e3, solveFor: 'rref' };
        const a = run(base);
        expect(a.ok, a.error).toBe(true);
        const b = run({ ...base, solveFor: 'iref', rref: res(a, 'rref'), iref: 1 });
        expect(res(b, 'iref') / 200e-6).toBeCloseTo(1, 10);
      });
  it('Widlar design: (I_ref, I_out) → R_E, R_ref → analysis gives the same currents', () => {
    const a = run({ topo: 'bjt-widlar', solveFor: 're', iref: 1e-3, iout: 10e-6 });
    expect(a.ok).toBe(true);
    const b = run({ topo: 'bjt-widlar', solveFor: 'iref', rref: res(a, 'rref'), rw: res(a, 'rw') });
    expect(res(b, 'iref') / 1e-3).toBeCloseTo(1, 10);
    expect(res(b, 'iout') / 10e-6).toBeCloseTo(1, 9);
  });
  it('impossible requests say why', () => {
    expect(run({ topo: 'bjt-widlar', solveFor: 're', iref: 1e-3, iout: 2e-3 }).error).toMatch(/can only lower/);
    expect(run({ vcc: 0.3, solveFor: 'rref' }).error).toMatch(/cannot drive/);
    expect(run({ topo: 'mos-simple', vcc: 0.5, solveFor: 'iref' }).error).toMatch(/too low/);
  });
  it('switching away from Widlar turns its R_E design into an R_ref design; polarity swaps the preset part', () => {
    const st = { ...def.defaults(), topo: 'bjt-widlar', solveFor: 're' } as MirrorState;
    const fl = def.fields.flatMap((x) => (x.kind === 'section' ? x.fields : [x]));
    (fl.find((x) => x.kind === 'select' && x.key === 'topo') as any).apply('bjt-basic', st, st);
    expect(st.solveFor).toBe('rref');
    (fl.find((x) => x.kind === 'select' && x.key === 'polarity') as any).apply('source', st, st);
    expect(st.bjtPart).toBe('q2n3906');
    expect(st.va).toBe(18.7);
    expect(st.beta).toBe(80);
  });
  it('below compliance the figures are flagged as taken at the limit and the graph shows the real V_out', () => {
    const r = run({ ...def.examples!.find((e) => e.id === 'cascode-headroom')!.state, vout: 0.2 });
    const io = r.results.find((x) => x.key === 'iout')!;
    expect(io.tone).toBe('fail');
    expect(io.label).toMatch(/at V_out,lim/);
    const g = r.graphs.find((x) => x.id === 'iout-vs-vout')!;
    expect(g.xRange![0]).toBeLessThan(0.2);
    expect(g.vlines!.some((v) => v.value === 0.2)).toBe(true);
  });
  it('large-N base-current hint also for the degenerated mirror', () => {
    expect(run({ topo: 'bjt-degen', n: 100, re: 100 }).warnings.some((w) => w.includes('N + 1 base currents'))).toBe(true);
  });
});

describe('current mirror: physics and limits', () => {
  it('Widlar output falls monotonically with R_E; Iout grows with V_out (Early)', () => {
    const io = (rw: number) => res(run({ topo: 'bjt-widlar', solveFor: 'iref', rref: 4.3e3, rw }), 'iout');
    expect(io(1e3)).toBeGreaterThan(io(10e3));
    expect(io(10e3)).toBeGreaterThan(io(100e3));
    expect(res(run({ vout: 4 }), 'iout')).toBeGreaterThan(res(run({ vout: 1 }), 'iout'));
  });
  it('λ = 0 gives an infinite output resistance (shown as ∞, value null)', () => {
    const r = run({ topo: 'mos-simple', lambda: 0, mosPart: 'custom' });
    expect(r.results.find((x) => x.key === 'rout')!.value).toBeNull();
    expect(rOut(modelIn({ ...def.defaults(), topo: 'mos-simple', lambda: 0 }), 1e-4)).toBe(Infinity);
  });
  it('warnings: compliance, mismatch of discrete parts, large error, dissipation', () => {
    expect(run(def.examples!.find((e) => e.id === 'cascode-headroom')!.state).warnings.some((w) => w.includes('compliance'))).toBe(true);
    expect(run({}).warnings.some((w) => w.includes('not matched'))).toBe(true);
    expect(run({ n: 10, bjtPart: 'custom', beta: 30 }).warnings.some((w) => w.includes('off N·I_ref'))).toBe(true);
    expect(run({ vcc: 30, vout: 25, iref: 20e-3 }).warnings.some((w) => w.includes('dissipates'))).toBe(true);
  });
});

describe('current mirror: examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = runCompute(def as CalcDef<any>, { ...def.defaults(), ...structuredClone(e.state) });
      expect(r.ok, `${e.id}: ${r.error}`).toBe(true);
      checkReport(r, e.id);
    }
  });
  it('fuzz: 400 random states never throw, stay finite and recompute stably', () => {
    const { ok } = fuzz(def as CalcDef<any>, 400, 41);
    expect(ok).toBeGreaterThan(100);
  });
  it('fuzz: R_ref designs for currents the supply can drive are never refused', () => {
    const { fail } = fuzz(def as CalcDef<any>, 300, 42, (s) => {
      s.solveFor = 'rref';
      // a supply and parts that can drive the current: ≤ 1 mA, ≤ 1 V across R_E, MOSFET overdrive ≲ 1.4 V
      s.vcc = 30 + s.vcc / 50;
      s.iref = 1e-6 * 1e3 ** (s.iref > 0 ? (Math.log10(s.iref) + 12) / 13 : 0.5);
      s.vt = Math.min(s.vt, 1);
      s.kp = Math.max(s.kp, 1e-4);
      s.wl = Math.max(s.wl, 10);
      s.re = Math.min(s.re, 1e3);
      s.rw = Math.min(s.rw, 20e3);
      s.is = Math.min(s.is, 1e-12);
    });
    expect(fail).toBe(0);
  });
});
