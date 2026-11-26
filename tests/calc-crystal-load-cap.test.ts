import { describe, expect, it } from 'vitest';
import { def, type XtalState } from '@/calculators/crystal-load-cap/def';
import { bestPairs, c2For, gmCrit, loadCap, loadRatio, pulling, sensitivity } from '@/calculators/crystal-load-cap/model';
import { applyDefValues } from '@/core/calc/fields';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<XtalState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;

describe('crystal load capacitance — published values', () => {
  it('Microchip AN826 example crystal: f_s = 7 997 836.8 Hz (L₁ 22 mH, C₁ 0.018 pF) and f_a = 8 013 816.5 Hz (C₀ 4.5 pF)', () => {
    const fs = 1 / (2 * Math.PI * Math.sqrt(22e-3 * 0.018e-12));
    expect(fs).toBeCloseTo(7997836.8, 0);
    // f_a is the load resonance with C_L = 0: f_s·√(1 + C₁/C₀)
    expect(fs * loadRatio(0.018e-12, 4.5e-12, 0)).toBeCloseTo(8013816.5, 0);
  });
  it('AN826 pulling "ppm/pF = C₁·10⁶/(2(C₀ + C_L)²)" is the first-order slope: 29.4 ppm/pF at C_L 13 pF', () => {
    expect(-sensitivity(18e-15, 4.5e-12, 13e-12) * 1e-12 * 1e6).toBeCloseTo(29.3878, 1);
  });
  it('AN826 Pierce load: C_L = C2·C3/(C2 + C3) + C_S; equal caps 2(C_L − C_S)', () => {
    expect(loadCap(22e-12, 22e-12, 5e-12)).toBeCloseTo(16e-12, 24);
    expect(res(run({}), 'cl1')).toBeCloseTo(16e-12, 24);
    expect(c2For(13e-12, 15e-12, 5e-12)).toBeCloseTo((15 * 8) / 7 * 1e-12, 24);
  });
});

describe('crystal load capacitance — Python reference values', () => {
  it('g_m,crit (ST AN2867) for the AN826 crystal at 13 pF and the ABS07 at 12.5 pF', () => {
    expect(gmCrit(100, 8e6, 4.5e-12, 13e-12)).toBeCloseTo(0.00030951079401816224, 15);
    expect(gmCrit(70e3, 32768, 2e-12, 12.5e-12)).toBeCloseTo(2.495477407844523e-6, 18);
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'abs07')!.state });
    expect(res(r, 'gainMargin')).toBeCloseTo(10e-6 / 2.495477407844523e-6, 9);
    expect(r.status?.text).toBe('LOW GAIN MARGIN');
  });
  it('22 pF + 22 pF + 4 pF stray on a 12.5 pF crystal runs −67.80 ppm', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'mismatch')!.state });
    expect(res(r, 'cload')).toBeCloseTo(15e-12, 24);
    expect(res(r, 'pull')).toBeCloseTo(-6.780381200821584e-5, 12);
    expect(r.warnings.join(' ')).toMatch(/tolerance/);
  });
  it('pulling is monotone: more load capacitance always runs slower', () => {
    let prev = Infinity;
    for (let c = 4e-12; c < 40e-12; c += 1e-12) {
      const p = pulling(18e-15, 4.5e-12, 13e-12, c);
      expect(p).toBeLessThan(prev);
      prev = p;
    }
    expect(pulling(18e-15, 4.5e-12, 13e-12, 13e-12)).toBe(0);
  });
  it('pair search: every pair within 2.2 : 1, sorted by |ΔC_L|; E24 hits 16 pF exactly', () => {
    const p = bestPairs('E24', 13e-12, 5e-12, 18e-15, 4.5e-12);
    expect(p[0].c1).toBe(16e-12);
    expect(p[0].c2).toBe(16e-12);
    for (const q of p) expect(q.c2 / q.c1).toBeLessThanOrEqual(2.2);
  });
});

describe('crystal load capacitance — solve round trips', () => {
  for (const [cl, cs] of [[13e-12, 5e-12], [12.5e-12, 3e-12], [6e-12, 2e-12], [20e-12, 4e-12]] as const) {
    it(`C_L ${cl * 1e12} pF, C_s ${cs * 1e12} pF: solved caps give C_L back`, () => {
      const st: XtalState = { ...def.defaults(), solveFor: 'cl1', cl, cs };
      runCompute(def, st);
      expect(res(def.compute({ ...st, solveFor: 'cload' }), 'cload') / cl).toBeCloseTo(1, 12);
      const st2: XtalState = { ...st, equal: false, cl1: 3 * (cl - cs), solveFor: 'cl2' };
      runCompute(def, st2);
      expect(res(def.compute({ ...st2, solveFor: 'cload' }), 'cload') / cl).toBeCloseTo(1, 12);
      expect(res(def.compute({ ...st2, solveFor: 'cl1' }), 'cl1') / st2.cl1).toBeCloseTo(1, 9);
    });
  }
});

describe('crystal load capacitance — limits and warnings', () => {
  it('stray capacitance at or above the specified load has no solution', () => {
    expect(run({ cs: 14e-12 }).error).toMatch(/stray/);
    expect(run({ solveFor: 'cload', cs: 14e-12 }).warnings.join(' ')).toMatch(/stray/);
  });
  it('the fixed capacitor too small for the target', () => {
    expect(run({ solveFor: 'cl2', equal: false, cl1: 6e-12 }).error).toMatch(/too small/);
  });
  it('gain margin and drive level', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'low-gm')!.state });
    expect(r.status?.text).toBe('MAY NOT START');
    expect(r.warnings.join(' ')).toMatch(/Drive level/);
  });
  it('no C_m: pulling is not computed, and the page says so', () => {
    const r = run({ cm: null });
    expect(res(r, 'pull')).toBeNull();
    expect(r.notes.join(' ')).toMatch(/motional/);
  });
});

describe('crystal load capacitance — examples and switches', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
  });
  it('equal on while solving C_L2 moves the unknown to C_L1; presets go Custom when edited', () => {
    const st: XtalState = { ...def.defaults(), equal: false, solveFor: 'cl2', cl1: 15e-12 };
    runCompute(def, st);
    expect(applyDefValues(def, st as any, { equal: true })).toEqual([]);
    expect(st.solveFor).toBe('cl1');
    st.esr = 80;
    runCompute(def, st);
    expect(st.preset).toBe('Custom');
  });
});

function collect(fields: FieldSpec[], nums: { key: string; min: number; max: number; opt?: boolean }[], sels: { key: string; options: string[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number' && !f.output) nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, opt: f.optional });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? String(o.value) : o)) });
  }
}

describe('crystal load capacitance — fuzz (360 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute; analysis never refused', () => {
    const nums: { key: string; min: number; max: number; opt?: boolean }[] = [];
    const sels: { key: string; options: string[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 21;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 360; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) s[f.key] = f.opt && rnd() < 0.2 ? null : rnd() < 0.1 ? (rnd() < 0.5 ? f.min : f.max) : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 3;
      s.equal = rnd() < 0.5;
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as XtalState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        expect(st.solveFor).not.toBe('cload');
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
      expect(res(again, 'cload') / res(r, 'cload')).toBeCloseTo(1, 9);
    }
    expect(ok).toBeGreaterThan(200);
  });
});

describe('crystal load capacitance: review regressions', () => {
  it('data-sheet g_m,crit,max mode judges the ratio against 1, G_m mode against 5', () => {
    const base = { gm: 1e-3, esr: 100 }; // ratio ≈ 3.2 at the AN826 defaults
    expect(run({ ...base, gmKind: 'gm' }).status?.text).toBe('LOW GAIN MARGIN');
    expect(run({ ...base, gmKind: 'gmCritMax' }).status).toBeUndefined();
  });
  it('preset switch sets the ESR unit; equal on → off restores the C_L2 solve', () => {
    const st: XtalState = { ...def.defaults(), preset: 'Abracon ABS07: 32.768 kHz, C_L 12.5 pF' };
    applyDefValues(def, st as any, { preset: 'AN826 example: 8 MHz, C_L 13 pF' });
    expect(st.esrUnit).toBe('Ω');
    const u: XtalState = { ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === 'unequal')!.state) } as XtalState;
    runCompute(def, u);
    applyDefValues(def, u as any, { equal: true });
    applyDefValues(def, u as any, { equal: false });
    expect(u.solveFor).toBe('cl2');
  });
  it('pulling tone uses the table thresholds (red above half the tolerance)', () => {
    const r = run({ solveFor: 'cload', cl1: 18e-12, cl2: 18e-12, ftol: 30 }); // 14 pF: ≈ −28 ppm
    expect(r.results.find((x) => x.key === 'pull')!.tone).toBe('fail');
  });
});
