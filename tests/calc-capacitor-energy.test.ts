import { describe, expect, it } from 'vitest';
import { def, type CapState } from '@/calculators/capacitor-energy/def';
import { holdup, vcAfter, vTerminal } from '@/calculators/capacitor-energy/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<CapState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;

describe('capacitor-energy: published examples', () => {
  it('Alexander & Sadiku ex. 6.1: 3 pF at 20 V holds 60 pC and 600 pJ', () => {
    const r = runCompute(def, { ...def.defaults(), ...def.examples!.find((e) => e.id === 'sadiku-6-1')!.state });
    expect(res(r, 'q')).toBeCloseTo(60e-12, 22);
    expect(res(r, 'e')).toBeCloseTo(600e-12, 22);
  });
  it('A&S practice problem 6.1: 4.5 µF with 0.12 mC → 26.67 V, 1.6 mJ (solved V from E)', () => {
    const r = run({ solveFor: 'v', target: 'energy', c: 4.5e-6, e: 1.6e-3, ns: 1, np: 1 });
    expect(res(r, 'v')).toBeCloseTo(26.6667, 4);
    expect(res(r, 'q')).toBeCloseTo(0.12e-3, 12);
  });
});

describe('capacitor-energy: Python cross-check (hold-up integrated in the terminal voltage)', () => {
  it('default 470 µF, 24 → 18 V, 5 W / 90 %, 50 mΩ: t = 10.6293 ms, E_ESR = 37.47 µJ', () => {
    const r = run({});
    expect(res(r, 'tHold')).toBeCloseTo(0.010629345140506022, 15);
    expect(res(r, 'eEsr')).toBeCloseTo(3.747103201577662e-5, 14);
  });
  it('supercap example: 2 cells in series, 1 W / 85 % for 10 s, 5 → 2 V, 30 mΩ/cell → 2.27012 F per cell', () => {
    const r = run(def.examples!.find((e) => e.id === 'supercap')!.state);
    expect(res(r, 'c')).toBeCloseTo(2.2701198589055833, 12);
  });
  it('closed form agrees with an RK4 integration of C dv/dt = −i(v)', () => {
    const C = 0.1, V1 = 12, V2 = 6, P = 20, R = 0.3;
    const h = holdup(C, V1, V2, P, R)!;
    let v = V1, t = 0;
    const dt = h.t / 20000;
    const f = (vc: number) => -(vc - Math.sqrt(vc * vc - 4 * R * P)) / (2 * R) / C;
    for (let k = 0; k < 20000; k++) {
      const k1 = f(v), k2 = f(v + (dt / 2) * k1), k3 = f(v + (dt / 2) * k2), k4 = f(v + dt * k3);
      v += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      t += dt;
    }
    expect(vTerminal(v, P, R)).toBeCloseTo(V2, 8);
    expect(vcAfter(C, V1, P, R, h.t)).toBeCloseTo(h.vcEnd, 9);
  });
});

describe('capacitor-energy: solve round trips', () => {
  const pts: Partial<CapState>[] = [{}, { c: 10, v: 5, vMin: 2, pOut: 1, eta: 85, esr: 0.03, ns: 2 }, { c: 220e-6, v: 300, vMin: 50, pOut: 1000, esr: 0.5, np: 3 }];
  for (const p of pts) {
    it(`C and V₁ for E and for t_hold reproduce the forward result (${JSON.stringify(p)})`, () => {
      const fwd = run(p);
      const E = res(fwd, 'e');
      const T = res(fwd, 'tHold');
      const c = p.c ?? def.defaults().c;
      const v = p.v ?? def.defaults().v;
      expect(res(run({ ...p, solveFor: 'c', target: 'energy', e: E, c: 1 }), 'c') / c).toBeCloseTo(1, 10);
      expect(res(run({ ...p, solveFor: 'v', target: 'energy', e: E, v: 1 }), 'v') / v).toBeCloseTo(1, 10);
      expect(res(run({ ...p, solveFor: 'c', target: 'holdup', tHold: T, c: 1 }), 'c') / c).toBeCloseTo(1, 10);
      expect(res(run({ ...p, solveFor: 'v', target: 'holdup', tHold: T, v: 1000 }), 'v') / v).toBeCloseTo(1, 10);
    });
  }
});

describe('capacitor-energy: mode-switch regressions', () => {
  it('◎ on C or V₁ where no hold-up is possible switches the target to the energy (no red error)', () => {
    const st: CapState = { ...def.defaults(), ...(def.examples!.find((e) => e.id === 'esr-limit')!.state as CapState) };
    const f = (def.fields[0] as any).fields.find((x: any) => x.key === 'c');
    f.onSolve(st, st);
    expect(st.target).toBe('energy');
    expect(runCompute(def, st).ok).toBe(true);
  });
});

describe('capacitor-energy: review regressions', () => {
  it('◎ on t_hold where no hold-up exists keeps the analysis (no stale 10 ms target, no red error)', () => {
    const st: CapState = { ...def.defaults(), ...(def.examples!.find((e) => e.id === 'esr-limit')!.state as CapState) };
    const f = (def.fields[1] as any).fields.find((x: any) => x.key === 'tHold');
    f.onUnsolve(st, st);
    expect(st.solveFor).toBe('e');
    expect(runCompute(def, st).ok).toBe(true);
  });
  it('◎ on t_hold from the defaults targets the shown hold-up and solves C back to 470 µF', () => {
    const st: CapState = def.defaults();
    runCompute(def, st);
    (def.fields[1] as any).fields.find((x: any) => x.key === 'tHold').onUnsolve(st, st);
    expect([st.solveFor, st.target]).toEqual(['c', 'holdup']);
    runCompute(def, st);
    expect(st.c / 470e-6).toBeCloseTo(1, 10);
  });
});

describe('capacitor-energy: physics sanity', () => {
  it('E ∝ V², E ∝ C; hold-up falls as ESR rises and reduces to the ideal form at ESR = 0', () => {
    expect(res(run({ v: 48 }), 'e') / res(run({ v: 24 }), 'e')).toBeCloseTo(4, 12);
    expect(res(run({ c: 940e-6 }), 'e') / res(run({}), 'e')).toBeCloseTo(2, 12);
    const t0 = res(run({ esr: 0 }), 'tHold');
    expect(t0).toBeCloseTo((470e-6 * (24 ** 2 - 18 ** 2)) / (2 * (5 / 0.9)), 15);
    let prev = t0;
    for (const esr of [0.01, 0.1, 1, 5]) {
      const t = res(run({ esr }), 'tHold');
      expect(t).toBeLessThan(prev);
      prev = t;
    }
    expect(res(run({ esr: 1e-9 }), 'tHold') / t0).toBeCloseTo(1, 7);
  });
  it('bank: 2 s × 3 p cells = 1.5 C and ESR × 2/3', () => {
    const r = run({ ns: 2, np: 3 });
    expect(res(r, 'cBank')).toBeCloseTo(1.5 * 470e-6, 15);
    expect(res(r, 'esrBank')).toBeCloseTo((0.05 * 2) / 3, 15);
  });
});

describe('capacitor-energy: validity warnings', () => {
  it('ESR too high for the power at V₂ (example) → warning, hold-up "—"', () => {
    const r = run(def.examples!.find((e) => e.id === 'esr-limit')!.state);
    expect(r.ok).toBe(true);
    expect(res(r, 'tHold')).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/ESR limit/);
  });
  it('over the cell rating → fail status', () => {
    const r = run({ v: 40 });
    expect(r.warnings.join(' ')).toMatch(/exceeds the rated/);
    expect(r.status?.tone).toBe('fail');
  });
  it('V₁ at or below the cut-off → no hold-up warning; hold-up target impossible → error', () => {
    expect(run({ vMin: 30 }).warnings.join(' ')).toMatch(/No hold-up/);
    expect(run({ solveFor: 'c', target: 'holdup', vMin: 30 }).ok).toBe(false);
  });
  it('ESR wasting > 10 % warns', () => {
    expect(run({ esr: 10 }).warnings.join(' ')).toMatch(/ESR wastes/);
  });
});

function collect(fields: FieldSpec[], nums: { key: string; min: number; max: number; optional?: boolean }[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, optional: f.optional });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}

describe('capacitor-energy: fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: { key: string; min: number; max: number; optional?: boolean }[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 7;
    const rnd = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) s[f.key] = f.optional && rnd() < 0.2 ? null : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 3;
      for (const k of ['ns', 'np']) s[k] = 1 + Math.floor(rnd() * 4);
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as CapState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        expect(st.solveFor).not.toBe('e'); // the analysis is never refused
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of sr.y) expect(Number.isFinite(y), g.id).toBe(true);
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      for (const k of ['e', 'q']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 9);
    }
    expect(ok).toBeGreaterThan(160); // every analysis state; the rest are random targets whose C or V₁ falls outside the field range (reported)
  });
});

describe('capacitor-energy: examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      // mode-switch regression: no NaN / Infinity text in any example (A&S 6.1 once showed "Infinity A" at V₂ = 0)
      expect(JSON.stringify([r.results, r.warnings, r.notes, r.summary]), ex.id).not.toMatch(BAD);
    }
  });
});
