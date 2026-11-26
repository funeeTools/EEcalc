import { describe, expect, it } from 'vitest';
import { def, type StepState } from '@/calculators/via-step-response/def';
import { expm, johnsonC, johnsonL, jgRiseC, jgRiseL, stepResponse } from '@/calculators/via-step-response/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<StepState>) => def.compute({ ...def.defaults(), ...p });
const IN = 0.0254;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('via step response — published values', () => {
  it('Johnson & Graham §7.3: 0.028 in pad, 0.055 in clearance, 0.063 in FR-4 (εr 4.4) → 0.41 pF; t10–90 = 2.2·C·Z₀/2 ≈ 22 ps in 50 Ω', () => {
    const c = johnsonC(4.4, 0.063 * IN, 0.028 * IN, 0.055 * IN);
    expect(c * 1e12).toBeCloseTo(0.405, 3);
    expect(jgRiseC(c, 50) * 1e12).toBeCloseTo(22.3, 1);
    const r = run(def.examples!.find((e) => e.id === 'jg-c')!.state);
    expect(res(r, 'c') * 1e12).toBeCloseTo(0.405, 3);
    expect(res(r, 'tC') * 1e12).toBeCloseTo(22.3, 1);
  });
  it('Johnson & Graham §7.4: 0.063 in via, 0.016 in drill → 1.2 nH (book form)', () => {
    expect(johnsonL(0.063 * IN, 0.016 * IN) * 1e9).toBeCloseTo(1.2, 1);
  });
  it('single pole: a near-ideal step through C alone (L alone) rises in ln 9 · C·Z₀/2 (ln 9 · L/2Z₀)', () => {
    expect(rel(stepResponse('c', 1e-9, 0.5e-12, 50, 1e-16).trOut, jgRiseC(0.5e-12, 50))).toBeLessThan(1e-6);
    expect(rel(stepResponse('l', 1e-9, 0.5e-12, 50, 1e-16).trOut, jgRiseL(1e-9, 50))).toBeLessThan(1e-6);
  });
  it('TDR area theorem (Agilent AN 1304-2): ∫ρ dt = L/(2Z₀) − C·Z₀/2 for every topology', () => {
    for (const top of ['pi', 'tee', 'c', 'l'] as const) {
      const m = stepResponse(top, 1.3e-9, 0.6e-12, 50, 60e-12);
      const w = m.wave;
      let a = 0;
      for (let i = 1; i < w.t.length; i++) a += 0.5 * (w.rho[i] + w.rho[i - 1]) * (w.t[i] - w.t[i - 1]);
      const want = (top === 'c' ? 0 : 1.3e-9 / 100) - (top === 'l' ? 0 : (0.6e-12 * 50) / 2);
      expect(Math.abs(a - want) / 1.3e-11).toBeLessThan(1e-3);
    }
  });
});

describe('via step response — independent Python model (sr/lap.py: Laplace residues, no time stepping)', () => {
  it('default π via, J&G inductance', () => {
    const r = run({});
    expect(rel(res(r, 'c'), 5.862047244094486e-13)).toBeLessThan(1e-12);
    expect(rel(res(r, 'l'), 1.2992866543013e-9)).toBeLessThan(1e-12);
    expect(rel(res(r, 'trOut'), 9.958508384656843e-11)).toBeLessThan(1e-6);
    expect(rel(res(r, 'delay'), 2.7263868385511804e-11)).toBeLessThan(1e-6);
    expect(Math.abs(res(r, 'overshoot') / 100 - 0.015630962778589774)).toBeLessThan(1e-6);
    expect(Math.abs(res(r, 'rhoMin') / 100 - -0.03706926792100019)).toBeLessThan(1e-6);
    expect(Math.abs(res(r, 'rhoMax') / 100 - 0.02417474746181577)).toBeLessThan(1e-6);
  });
  it('3.2 mm backplane via, T model, 40 ps edge', () => {
    const r = run(def.examples!.find((e) => e.id === 'backplane')!.state);
    expect(rel(res(r, 'trOut'), 5.927620947926544e-11)).toBeLessThan(1e-6);
    expect(Math.abs(res(r, 'overshoot') / 100 - 0.07772074431136877)).toBeLessThan(1e-6);
    expect(Math.abs(res(r, 'rhoMax') / 100 - 0.1898049849568888)).toBeLessThan(1e-6);
    expect(Math.abs(res(r, 'rhoMin') / 100 - -0.08263806732935261)).toBeLessThan(1e-6);
  });
  it('Rosa inductance alone, 42.5 Ω line, 30 ps edge', () => {
    const r = run({ lForm: 'rosa', topology: 'l', z0: 42.5, tr: 30e-12 });
    expect(rel(res(r, 'l'), 6.592866543013001e-10)).toBeLessThan(1e-9);
    expect(rel(res(r, 'trOut'), 3.396518221934524e-11)).toBeLessThan(1e-6);
    expect(Math.abs(res(r, 'rhoMax') / 100 - 0.20519099885981498)).toBeLessThan(1e-6);
  });
  it('matrix exponential: e^(diag) and a rotation', () => {
    const e = expm([[-3, 0], [0, 2]]);
    expect(e[0][0]).toBeCloseTo(Math.exp(-3), 14);
    expect(e[1][1]).toBeCloseTo(Math.exp(2), 12);
    const r = expm([[0, -40], [40, 0]]);
    expect(r[0][0]).toBeCloseTo(Math.cos(40), 10);
    expect(r[1][0]).toBeCloseTo(Math.sin(40), 10);
  });
});

describe('via step response — solve round trips', () => {
  const pts: Partial<StepState>[] = [{}, { topology: 'tee', lForm: 'rosa', h: 1e-3, d: 0.2e-3, pad: 0.45e-3, Da: 0.8e-3, z0: 42.5 }, { topology: 'c', er: 3.66, tr: 60e-12 }, { h: 2.4e-3, d: 0.4e-3, pad: 0.8e-3, Da: 1.2e-3, tr: 150e-12, z0: 85 }];
  it('t_r and D_ap: solve for the analysis slowdown, recover the value and the budget', () => {
    for (const p of pts) {
      const base = run({ ...p, solveFor: 'slow' });
      const slow = res(base, 'slow');
      if (slow < 0.5) continue;
      const rt = run({ ...p, solveFor: 'tr', budget: slow, tr: 1e-9 });
      expect(rt.ok, rt.error).toBe(true);
      expect(res(run({ ...p, solveFor: 'slow', tr: res(rt, 'tr') }), 'slow') / slow).toBeCloseTo(1, 7);
      const rd = run({ ...p, solveFor: 'Da', budget: slow, Da: 5e-3 });
      expect(rd.ok, rd.error).toBe(true);
      expect(res(run({ ...p, solveFor: 'slow', Da: res(rd, 'Da') }), 'slow') / slow).toBeCloseTo(1, 7);
    }
  });
  it('the solved edge sits at the budget; impossible budgets say what limits them', () => {
    const r = run({ solveFor: 'tr', budget: 10 });
    expect(res(r, 'slow')).toBeCloseTo(10, 6);
    // unreachable budgets: the closest approach, in red, with the reason (regression: harness high on ◎ D_ap from the backplane)
    const bp = run({ ...def.examples!.find((e) => e.id === 'backplane')!.state, solveFor: 'Da' });
    expect(bp.ok).toBe(true);
    expect(bp.status?.tone).toBe('fail');
    expect(bp.warnings.some((w) => /comes closest/.test(w))).toBe(true);
    const near = res(bp, 'slow');
    for (const f of [0.9, 1.1]) expect(res(run({ ...def.examples!.find((e) => e.id === 'backplane')!.state, Da: res(bp, 'Da') * f }), 'slow')).toBeGreaterThan(near - 1e-6);
    expect(run({ solveFor: 'Da', budget: 1, tr: 10e-12, topology: 'l' }).warnings.some((w) => /inductance alone/.test(w))).toBe(true);
    const all = run({ solveFor: 'tr', budget: 1e3, topology: 'c', h: 0.1e-3, d: 0.05e-3, pad: 0.1e-3, Da: 2e-3 });
    expect(all.ok).toBe(true);
    expect(res(all, 'tr')).toBe(1e-12);
    expect(run({ solveFor: 'tr', budget: 0.01, Da: 0.61e-3 }).warnings.some((w) => /Even a 10 ns edge/.test(w))).toBe(true);
  });
});

describe('via step response — physics', () => {
  it('C falls and Z_via rises as the antipad opens; L grows with length; slowdown grows with a faster edge (C only)', () => {
    expect(res(run({ Da: 1.5e-3 }), 'c')).toBeLessThan(res(run({}), 'c'));
    expect(res(run({ Da: 1.5e-3 }), 'zVia2')).toBeGreaterThan(res(run({}), 'zVia2'));
    expect(res(run({ h: 3.2e-3 }), 'l')).toBeGreaterThan(2 * res(run({}), 'l'));
    expect(res(run({ topology: 'c', tr: 30e-12 }), 'slow')).toBeGreaterThan(res(run({ topology: 'c', tr: 100e-12 }), 'slow'));
  });
  it('capacitive via dips the TDR, inductive via bumps it; Rosa L is below Johnson’s', () => {
    expect(res(run({ topology: 'c' }), 'rhoMin')).toBeLessThan(0);
    expect(res(run({ topology: 'c' }), 'rhoMax')).toBeCloseTo(0, 9);
    expect(res(run({ topology: 'l' }), 'rhoMax')).toBeGreaterThan(0);
    expect(res(run({ lForm: 'rosa' }), 'l')).toBeLessThan(res(run({}), 'l'));
  });
  it('a balanced via (antipad for Z_via = Z₀) slows the edge less than J&G’s quadrature estimate', () => {
    const da = res(run({}), 'daBal');
    const r = run({ Da: da });
    expect(res(r, 'zVia2')).toBeCloseTo(50, 8);
    expect(res(r, 'trOut')).toBeLessThan(res(r, 'tJG'));
  });
});

describe('via step response — validity warnings', () => {
  it('over budget, not lumped, ringing, short via; geometry errors', () => {
    const has = (p: Partial<StepState>, re: RegExp) => run(p).warnings.some((w) => re.test(w));
    expect(has({ tr: 20e-12, topology: 'c', Da: 0.7e-3 }, /over the 10 % budget/)).toBe(true);
    expect(run({ tr: 20e-12, topology: 'c', Da: 0.7e-3 }).status?.tone).toBe('fail');
    expect(has({ tr: 40e-12 }, /not electrically short/)).toBe(true);
    expect(has({ tr: 40e-12, h: 3.2e-3, d: 0.35e-3, pad: 0.65e-3, Da: 1.4e-3, topology: 'tee' }, /overshoots/)).toBe(true);
    expect(has({ h: 0.4e-3, d: 0.3e-3, pad: 0.6e-3 }, /h\/d = .* < 2/)).toBe(true);
    expect(run({}).warnings).toEqual([]);
    expect(run({ Da: 0.5e-3 }).error).toMatch(/must be larger than the pad/);
    expect(run({ pad: 0.25e-3 }).error).toMatch(/must be larger than the drill/);
    expect(run({ lForm: 'rosa', h: 0.1e-3, d: 0.3e-3, pad: 0.6e-3 }).error).toMatch(/too short for its drill/);
    // review R3: Johnson’s L reaches zero at h/d = 1/(4e); both forms share the h/d ≥ 0.7 floor, so a formula switch never errors
    expect(run({ h: 50e-6, d: 0.6e-3, pad: 0.8e-3, Da: 1.2e-3 }).error).toMatch(/too short for its drill/);
    expect(run({ h: 0.0921e-3, d: 1e-3, pad: 1.4e-3, Da: 2e-3 }).error).toMatch(/too short for its drill/);
    expect(run({ h: 0.7e-3, d: 1e-3, pad: 1.4e-3, Da: 2e-3, lForm: 'rosa' }).ok).toBe(true);
    expect(res(run({ topology: 'l' }), 'zVia2')).toBeNull();
    expect(run({ solveFor: 'Da', budget: 32.475866270677194, tr: 10e-12, topology: 'l' }).warnings.join(' ')).toMatch(/32\.48 % budget/);
  });
});

type Num = { key: string; min: number; max: number };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number' && !f.output) nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('via step response — fuzz (300 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute; valid vias never refused', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 3;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 300; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) s[f.key] = f.min * (f.max / f.min) ** rnd();
      const valid = i % 2 === 1;
      if (valid) {
        s.d = 0.1e-3 + 0.5e-3 * rnd();
        s.pad = (s.d as number) * (1.2 + 2 * rnd());
        s.Da = (s.pad as number) * (1.1 + 2 * rnd());
        s.h = (s.d as number) * (2 + 15 * rnd());
      }
      if (i % 10 === 4) s.h = (s.d as number) * (0.01 + 0.09 * rnd()); // review R3: very short vias, h/d < 0.1
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as StepState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        if (valid && st.solveFor === 'slow') expect(r.ok, `${JSON.stringify(st)} ${r.error}`).toBe(true);
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '', r.status?.text ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of sr.y) expect(Number.isFinite(y), g.id).toBe(true);
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      for (const k of ['trOut', 'c', 'l']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 7);
    }
    expect(ok).toBeGreaterThan(120);
  });
});

describe('via step response — examples', () => {
  it('first example equals the defaults; every example computes; the backplane fails its budget', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
    }
    expect(run(def.examples!.find((e) => e.id === 'backplane')!.state).status?.tone).toBe('fail');
  });
  it('computes well under 50 ms per solve', () => {
    for (const ex of def.examples!) run(ex.state);
    const t0 = performance.now();
    for (const ex of def.examples!) run(ex.state);
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
  });
});
