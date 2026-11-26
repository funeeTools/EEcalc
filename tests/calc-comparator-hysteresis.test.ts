import { describe, expect, it } from 'vitest';
import { type CompState, def } from '@/calculators/comparator-hysteresis/def';
import { design, thresholds } from '@/calculators/comparator-hysteresis/model';
import { runCompute } from '@/core/calc/page';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const run = (p: Partial<CompState>) => def.compute({ ...def.defaults(), ...p });
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

describe('comparator hysteresis: published design (TI TIDU020A)', () => {
  it('5 V, R_x = 100 kΩ, 2.7 V / 2.3 V → R_y = 100 kΩ, R_h = 575 kΩ (TIDU020A §2.1), best E96 R₃ = 576 kΩ', () => {
    const r = run({});
    expect(r.ok).toBe(true);
    expect(res(r, 'r2')).toBeCloseTo(100e3, 4);
    expect(res(r, 'r3')).toBeCloseTo(575e3, 3);
    expect(r.tables[0].rows[0]).toMatchObject({ r2: 100e3, r3: 576e3 });
  });
  it('as built with 576 kΩ: thresholds 2.6997 V / 2.3003 V (TI simulation 2.706 / 2.294 V includes the TLV3201 itself)', () => {
    const r = run({ solveFor: 'vth', r2: 100e3, r3: 576e3 });
    expect(res(r, 'vth')).toBeCloseTo(2.69966, 4);
    expect(res(r, 'vtl')).toBeCloseTo(2.30034, 4);
  });
});

describe('comparator hysteresis: independent Python reference (Thévenin divider + feedback)', () => {
  it('open-drain inverting, 100k/100k/1M, 10 kΩ pull-up to 5 V, V_OL 0.2 V', () => {
    const r = run({ solveFor: 'vth', out: 'opendrain', vol: 0.2, vpu: 5, rp: 10e3, r1: 100e3, r2: 100e3, r3: 1e6 });
    expect(res(r, 'vth')).toBeCloseTo(2.6179245283018866, 12);
    expect(res(r, 'vtl')).toBeCloseTo(2.3904761904761904, 12);
  });
  it('non-inverting push-pull 3.3 V, 47k/22k reference, R₃ 220k, R₄ 15k', () => {
    const r = run({ solveFor: 'vth', topo: 'noninv', vr: 3.3, voh: 3.3, vol: 0, r1: 47e3, r2: 22e3, r3: 220e3, r4: 15e3, vcc: 3.3 });
    expect(res(r, 'vth')).toBeCloseTo(1.1239130434782607, 12);
    expect(res(r, 'vtl')).toBeCloseTo(0.8989130434782608, 12);
  });
  it('inverting push-pull 12 V, 33k/10k/470k, V_OH 11.5 V, V_OL 0.3 V', () => {
    const r = run({ solveFor: 'vth', vr: 12, vcc: 12, voh: 11.5, vol: 0.3, r1: 33e3, r2: 10e3, r3: 470e3 });
    expect(res(r, 'vth')).toBeCloseTo(2.9306231742940603, 12);
    expect(res(r, 'vtl')).toBeCloseTo(2.7506815968841285, 12);
  });
  it('rail-to-rail closed forms: V_TH = V_R·R₂/(R₂ + R₁∥R₃), V_TL = V_R·(R₂∥R₃)/(R₁ + R₂∥R₃)', () => {
    const p = (a: number, b: number) => (a * b) / (a + b);
    const t = thresholds({ topo: 'inv', out: 'pushpull', vr: 5, r1: 47e3, r2: 33e3, r3: 330e3, r4: 1, voh: 5, vol: 0, vpu: 5, rp: 1 });
    expect(t.vth).toBeCloseTo((5 * 33e3) / (33e3 + p(47e3, 330e3)), 12);
    expect(t.vtl).toBeCloseTo((5 * p(33e3, 330e3)) / (47e3 + p(33e3, 330e3)), 12);
  });
});

describe('comparator hysteresis: solve round trips', () => {
  const bases: Partial<CompState>[] = [
    { topo: 'inv', out: 'pushpull' },
    { topo: 'inv', out: 'opendrain', vol: 0.2, rp: 4.7e3 },
    { topo: 'noninv', out: 'pushpull', r4: 22e3 },
    { topo: 'noninv', out: 'opendrain', r4: 10e3, rp: 2.2e3, vol: 0.1 },
    { topo: 'inv', out: 'pushpull', vol: -5, voh: 5, vr: 5 },
  ];
  for (const b of bases)
    for (const [r2, r3] of [[47e3, 470e3], [10e3, 1e6], [220e3, 2.2e6]]) {
      it(`${b.topo}/${b.out} ${r2}/${r3}: thresholds → R₂, R₃ → same thresholds`, () => {
        const a = run({ ...b, solveFor: 'vth', r2, r3 });
        expect(a.ok).toBe(true);
        const d = run({ ...b, solveFor: 'r2', vth: det(a).vth, vtl: det(a).vtl, r2: 1, r3: 1 });
        expect(d.ok, d.error).toBe(true);
        expect(res(d, 'r2') / r2).toBeCloseTo(1, 7);
        expect(res(d, 'r3') / r3).toBeCloseTo(1, 7);
      });
    }
  it('unreachable targets report the real gap and the constraint that limits them', () => {
    const ex = def.examples!.find((e) => e.id === 'noninv')!.state;
    expect(run({ ...ex, vr: 2 }).error).toMatch(/not below V_R.*Raise V_R/);
    const e = run({ solveFor: 'r2', voh: 3, vth: 4.9, vtl: 4 }).error!;
    expect(e).toMatch(/reaches ≈ 4\.600 V at best, 0\.300 V short of the 4\.900 V target/);
    expect(e).toMatch(/raise V_R or the output-high level/);
    expect(run({ solveFor: 'r2', vth: 5.5, vtl: 1 }).error).toMatch(/cannot exceed the higher of V_R and the output-high level/);
  });
  it('thresholds outside the rails: warning for the inverting circuit only (a note for the non-inverting one)', () => {
    const ex = def.examples!.find((e) => e.id === 'noninv')!.state;
    const n = run({ ...ex, solveFor: 'vth', vcc: 2 });
    expect(n.warnings.some((w) => w.includes('outside'))).toBe(false);
    expect(n.notes.some((w) => w.includes('source must swing'))).toBe(true);
  });
  it('impossible targets say why', () => {
    expect(run({ solveFor: 'r2', vth: 2.3, vtl: 2.7 }).error).toMatch(/must be above/);
    expect(run({ solveFor: 'r2', vth: 6, vtl: 5.5 }).ok).toBe(false);
    expect(run({ solveFor: 'r2', vth: 5.5, vtl: 5.2 }).error).toMatch(/No positive R₂/);
    expect(design({ topo: 'inv', out: 'pushpull', vr: 5, r1: 1e3, r2: 1, r3: 1, r4: 1, voh: 5, vol: 0, vpu: 5, rp: 1 }, 2.7, 2.3).ok).toBe(true);
  });
});

describe('comparator hysteresis: physics and limits', () => {
  it('hysteresis shrinks as R₃ grows and vanishes as R₃ → ∞', () => {
    const dv = (r3: number) => det(run({ solveFor: 'vth', r3 })).dv;
    expect(dv(100e3)).toBeGreaterThan(dv(1e6));
    expect(dv(1e6)).toBeGreaterThan(dv(1e7));
    expect(dv(1e12)).toBeLessThan(1e-5);
  });
  it('non-inverting hysteresis ≈ (V_OH − V_OL)·R₄/R₃', () => {
    const r = run({ solveFor: 'vth', topo: 'noninv', r4: 10e3, r3: 1e6 });
    expect(det(r).dv).toBeCloseTo((5 * 10e3) / 1e6, 12);
  });
  it('open-drain with R_P → 0 equals push-pull with V_OH = V_PU', () => {
    const a = det(run({ solveFor: 'vth', out: 'opendrain', rp: 1e-9 > 1 ? 1 : 1, vpu: 5, r3: 1e9 }));
    const b = det(run({ solveFor: 'vth', out: 'pushpull', voh: 5, r3: 1e9 + 1 }));
    expect(a.vth).toBeCloseTo(b.vth, 9);
  });
  it('warnings: noise wider than the hysteresis, loaded pull-up, sink current, high impedance, thresholds outside the rails', () => {
    expect(run({ solveFor: 'vth', r3: 12e6, noise: 50e-3 }).warnings.some((w) => w.includes('chatter'))).toBe(true);
    expect(run({ solveFor: 'vth', out: 'opendrain', rp: 100e3, r3: 200e3 }).warnings.some((w) => w.includes('loads the pull-up'))).toBe(true);
    expect(run({ solveFor: 'vth', out: 'opendrain', rp: 470 }).warnings.some((w) => w.includes('sinks'))).toBe(true);
    expect(run({ solveFor: 'vth', r1: 4.7e6, r2: 4.7e6, r3: 47e6 }).warnings.some((w) => w.includes('IN+ sees'))).toBe(true);
    expect(run({ solveFor: 'vth', vcc: 2 }).warnings.some((w) => w.includes('outside the comparator supply'))).toBe(true);
    expect(run({ solveFor: 'vth', r1: 47, r2: 47 }).warnings.some((w) => w.includes('below 100 Ω'))).toBe(true);
  });
  it('E-series table rows are toned by the worse threshold error against the hysteresis width', () => {
    const r = run({});
    const t = r.tables[0];
    const dv = det(r).dv;
    t.rows.forEach((row, i) => {
      const e = (row.err as number) / dv;
      expect(t.rowTones![i]).toBe(e <= 0.05 ? 'pass' : e <= 0.2 ? 'warn' : 'fail');
    });
  });
});

describe('comparator hysteresis: examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = runCompute(def as CalcDef<any>, { ...def.defaults(), ...structuredClone(e.state) });
      expect(r.ok, `${e.id}: ${r.error}`).toBe(true);
      checkReport(r, e.id);
    }
  });
  it('fuzz: 400 random states never throw, stay finite and recompute stably', () => {
    // half the states are designs with random targets over ±1e18 V and half have V_OH ≤ V_OL, so most are refused (with a message)
    const { ok } = fuzz(def as CalcDef<any>, 400, 17);
    expect(ok).toBeGreaterThan(60);
  });
  it('fuzz: analysis of any valid circuit is never refused', () => {
    const { fail } = fuzz(def as CalcDef<any>, 300, 18, (s) => {
      s.solveFor = 'vth';
      if (s.out === 'opendrain' ? s.vpu <= s.vol : s.voh <= s.vol) s.vol = (s.out === 'opendrain' ? s.vpu : s.voh) - 1;
    });
    expect(fail).toBe(0);
  });
});
