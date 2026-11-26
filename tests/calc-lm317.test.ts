import { describe, expect, it } from 'vitest';
import { def, type Lm317State } from '@/calculators/lm317/def';
import { bestPairs, r1For, r2For, vOut, worstCase } from '@/calculators/lm317/model';
import { applyDefValues } from '@/core/calc/fields';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<Lm317State>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;

describe('LM317 — equations', () => {
  it('hand calculation with TI SLVS044Z eq. 2, Fig. 8-1’s R₁ = 240 Ω and R₂ = 720 Ω (the pair of Fig. 8-9): 5.036 V with I_ADJ = 50 µA', () => {
    const r = run({ solveFor: 'vout', r1: 240, r2: 720 });
    expect(res(r, 'vout')).toBeCloseTo(5.036, 12);
    expect(vOut(1.25, 0, 240, 720)).toBeCloseTo(5, 12); // the textbook 1.25·(1 + 720/240)
  });
  it('TI LM337 data sheet (SLVS047L §9.2.2): R₁ = 120 Ω carries about 10.42 mA', () => {
    const r = run({ part: 'LM337 (negative)', iadj: 65e-6, r1: 120 });
    expect(res(r, 'iR1')).toBeCloseTo(1.25 / 120, 12);
    expect(res(r, 'iR1') * 1e3).toBeCloseTo(10.42, 2);
    expect(res(r, 'voutCheck')).toBeLessThan(0); // negative regulator shows the sign
  });
  it('Python reference values (independent re-implementation)', () => {
    expect(res(run({}), 'r2')).toBeCloseTo(358.28025477707007, 9);
    const r = run({ solveFor: 'vout', r1: 240, r2: 720, vin: 10, iload: 0.1, tol: 1, vrefTol: 4, iadjMax: 100e-6 });
    // hi = 1.3·(1 + 727.2/237.6) + 100 µA·727.2 ; lo = 1.2·(1 + 712.8/242.4)
    expect(res(r, 'voutMax')).toBeCloseTo(1.3 * (1 + 727.2 / 237.6) + 100e-6 * 727.2, 12);
    expect(res(r, 'voutMin')).toBeCloseTo(1.2 * (1 + 712.8 / 242.4), 12);
    expect(res(r, 'pd')).toBeCloseTo((10 - 5.036) * (0.1 + 1.25 / 240) + (10 - 5.036 + 1.25) * 50e-6, 12);
  });
  it('inverses are exact and the sensitivity signs are right', () => {
    expect(vOut(1.25, 50e-6, 240, r2For(12, 1.25, 50e-6, 240))).toBeCloseTo(12, 12);
    expect(vOut(1.25, 50e-6, r1For(12, 1.25, 50e-6, 2e3), 2e3)).toBeCloseTo(12, 12);
    expect(r1For(1.3, 1.25, 100e-6, 1e3)).toBeLessThan(0); // I_ADJ·R₂ = 0.1 V > 0.05 V
    const w = worstCase(1.25, 0.04, 100e-6, 240, 720, 0.01);
    expect(w.hi).toBeGreaterThan(vOut(1.25, 50e-6, 240, 720));
    expect(w.lo).toBeLessThan(vOut(1.25, 50e-6, 240, 720));
    expect(worstCase(1.25, 0, 0, 240, 720, 0).hi).toBeCloseTo(5, 12);
  });
  it('E-series pairs: E24 finds an exact-ratio pair; pairs meeting the minimum load come first', () => {
    const p = bestPairs('E24', 5, 1.25, 0, 120);
    expect(Math.abs(p[0].err)).toBeLessThan(1e-12);
    const r = run({});
    for (const row of r.tables[0].rows) expect(row.r1 as number).toBeLessThanOrEqual(125 * (1 + 1e-9));
    // review: with R₁ = 1 kΩ (failing) the best pair must not move R₁ further up
    const h = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'high-r')!.state });
    expect(res(h, 'pairR1')).toBeLessThanOrEqual(125);
    expect(res(r, 'keepPick')).toBeCloseTo(vOut(1.25, 50e-6, 120, 360), 12);
  });
});

describe('LM317 — solve round trips', () => {
  for (const [vout, r1] of [[5, 120], [12, 240], [3.3, 100], [24, 1e3]] as const) {
    it(`R₂ for ${vout} V with R₁ = ${r1} Ω → analysis gives ${vout} V; solving R₁ gives R₁ back`, () => {
      const st = { ...def.defaults(), solveFor: 'r2' as const, vout, r1 };
      runCompute(def, st);
      const a = def.compute({ ...st, solveFor: 'vout' });
      expect(res(a, 'vout') / vout).toBeCloseTo(1, 9);
      const b = def.compute({ ...st, solveFor: 'r1' });
      expect(res(b, 'r1') / r1).toBeCloseTo(1, 9);
    });
  }
});

describe('LM317 — limits and warnings', () => {
  it('dropout below V_out + 3 V; V_in < V_out shows no negative dissipation (review)', () => {
    const d = run({ vin: 3 });
    expect(res(d, 'pd')).toBeNull();
    expect(d.results.find((x) => x.key === 'eff')!.display).toBe('—');
    const r = run({ vout: 9, vin: 10 });
    expect(r.status?.text).toBe('DROPOUT');
    expect(r.warnings.join(' ')).toMatch(/headroom/);
  });
  it('minimum load: 240 Ω alone does not meet the 10 mA guaranteed minimum', () => {
    expect(run({ r1: 240 }).warnings.join(' ')).toMatch(/minimum load/);
    expect(run({ r1: 240, ilmin: 0.01 }).warnings.join(' ')).not.toMatch(/minimum load/);
    expect(res(run({ r1: 240 }), 'r1MaxImin')).toBeCloseTo(125, 9);
  });
  it('input–output differential, rated current and dissipation', () => {
    expect(run({ vin: 50, vout: 5 }).warnings.join(' ')).toMatch(/absolute maximum/);
    expect(run({ iload: 2 }).warnings.join(' ')).toMatch(/rating/);
    expect(run({ vin: 20, iload: 1 }).warnings.join(' ')).toMatch(/dissipates/);
  });
  it('no-solution cases say what limits them', () => {
    expect(run({ solveFor: 'r2', vout: 1 }).error).toMatch(/V_REF/);
    expect(run({ solveFor: 'r1', vout: 1.3, r2: 1e4 }).error).toMatch(/I_ADJ/);
    expect(run({ solveFor: 'r2', vout: 1e6, r1: 1e6, iadj: 0 }).error).toMatch(/100 MΩ/);
  });
});

describe('LM317 — examples and mode switches', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
  });
  it('switching the part fills the data-sheet values; editing one switches to Custom', () => {
    const st = def.defaults();
    expect(applyDefValues(def, st as any, { part: 'LM337 (negative)' })).toEqual([]);
    expect(st.iadj).toBe(65e-6);
    st.iadj = 70e-6;
    runCompute(def, st);
    expect(st.part).toBe('Custom negative');
  });
});

function collect(fields: FieldSpec[], nums: { key: string; min: number; max: number }[], sels: { key: string; options: string[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number' && !f.output) nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? String(o.value) : o)) });
  }
}

describe('LM317 — fuzz (360 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: { key: string; min: number; max: number }[] = [];
    const sels: { key: string; options: string[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 11;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 360; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) s[f.key] = rnd() < 0.15 ? (rnd() < 0.5 ? f.min : f.max) : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 4;
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as Lm317State;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        expect(st.solveFor).not.toBe('vout'); // analysis is never refused
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
      expect(res(again, 'voutRange')).toBeCloseTo(res(r, 'voutRange'), 9);
    }
    expect(ok).toBeGreaterThan(150); // analysis (1/3) always; random targets over 0 … 1 GV often need R outside the field range (reported)
  });
});
