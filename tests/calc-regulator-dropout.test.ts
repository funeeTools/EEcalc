import { describe, expect, it } from 'vitest';
import { def, type DropState } from '@/calculators/regulator-dropout/def';
import { dcSource, iForVdo, vdoAt } from '@/calculators/regulator-dropout/model';
import { applyDefValues } from '@/core/calc/fields';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<DropState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;

describe('regulator dropout — equations', () => {
  it('defaults: 3.3 V + 0.5 A × 0.6 Ω = 3.6 V needed; USB 5 V −5 % = 4.75 V; margin 1.15 V (Python)', () => {
    const r = run({});
    expect(res(r, 'vinReq')).toBeCloseTo(3.6, 12);
    expect(res(r, 'vinLow')).toBeCloseTo(4.75, 12);
    expect(res(r, 'margin')).toBeCloseTo(1.15, 12);
    // SLVA118A: P_D = (Vin − Vout)·I + Vin·I_GND at 5.25 V
    expect(res(r, 'pdMax')).toBeCloseTo((5.25 - 3.3) * 0.5 + 5.25 * 1e-3, 12);
    expect(res(r, 'effNom')).toBeCloseTo((3.3 * 0.5) / (5 * 0.501), 12);
    expect(r.status?.text).toBe('REGULATES');
  });
  it('Python reference: two-point model and ripple valley (7 V ±10 %, 1.2 Vpp, 1 A)', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'ripple-valley')!.state });
    expect(res(r, 'vinLow')).toBeCloseTo(7 * 0.9 - 0.6, 12);
    expect(res(r, 'vinReq')).toBeCloseTo(5 + 0.6, 12);
    expect(res(r, 'margin')).toBeCloseTo(0.1, 12);
  });
  it('dropout models: fixed, R_DS(on) through the origin, straight line through two points', () => {
    const p = { model: 'points' as const, vdo: 2, ron: 0, i1: 0.1, vdo1: 0.25, i2: 1, vdo2: 0.6 };
    expect(vdoAt(p, 0.55)).toBeCloseTo(0.425, 12);
    expect(iForVdo(p, 0.425)).toBeCloseTo(0.55, 12);
    expect(vdoAt({ ...p, model: 'rdson', ron: 0.6 }, 0.5)).toBeCloseTo(0.3, 12);
    expect(vdoAt({ ...p, model: 'fixed' }, 5)).toBe(2);
    expect(iForVdo({ ...p, model: 'fixed' }, 1)).toBeNull();
    expect(dcSource(5, 0.05, 0.2)).toEqual({ vMin: 4.75 - 0.1, vNom: 5, vMax: 5.25 + 0.1 });
  });
  it('battery: 3 × AA alkaline drops out at (3.3 + 0.133)/3 = 1.144 V per cell', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'alkaline-3')!.state });
    expect(res(r, 'vCellDrop')).toBeCloseTo((3.3 + (0.2 / 0.15) * 0.1) / 3, 12);
    expect(r.status?.text).toBe('DROPOUT');
  });
});

describe('regulator dropout — solve round trips', () => {
  for (const k of ['iout', 'vout', 'vin', 'vEnd'] as const) {
    for (const m of [0, 0.2]) {
      it(`solve ${k} with margin ${m} V → analysis returns the margin`, () => {
        const st: DropState = { ...def.defaults(), solveFor: k, margin: m, model: 'points', vdo1: 0.2, i1: 0.2, vdo2: 0.5, i2: 1, source: k === 'vEnd' ? 'battery' : 'dc', cells: 2, chem: 'Custom' };
        const r = runCompute(def, st);
        expect(r.ok, r.error).toBe(true);
        const a = def.compute({ ...st, solveFor: 'margin' });
        expect(res(a, 'margin')).toBeCloseTo(m, 9);
      });
    }
  }
});

describe('regulator dropout — limits and warnings', () => {
  it('dropout warning and status', () => {
    const r = run({ vin: 3.5 });
    expect(r.status?.text).toBe('DROPOUT');
    expect(r.warnings.join(' ')).toMatch(/short of headroom/);
  });
  it('battery dropping out above its nominal voltage', () => {
    expect(run({ source: 'battery', cells: 1, vout: 3.6, chem: 'Custom' }).warnings.join(' ')).toMatch(/capacity is unusable/);
  });
  it('fixed model cannot solve for load current; impossible targets explain themselves', () => {
    expect(run({ solveFor: 'iout', model: 'fixed' }).error).toMatch(/fixed dropout/);
    expect(run({ solveFor: 'vout', vin: 0.3, margin: 0 }).error).toMatch(/no output/);
    expect(run({ solveFor: 'iout', model: 'points', vdo1: 0.3, i1: 0.1, vdo2: 0.6, i2: 1, vin: 3.4, vinTol: 0, margin: 0 }).error).toMatch(/zero load/);
  });
  it('extrapolated two-point model, falling dropout and high dissipation', () => {
    expect(run({ model: 'points', i1: 0.1, i2: 0.2, iout: 1 }).notes.join(' ')).toMatch(/extrapolated/);
    expect(run({ model: 'points', vdo1: 0.5, vdo2: 0.2 }).warnings.join(' ')).toMatch(/falls/);
    expect(run({ vin: 12, iout: 1 }).warnings.join(' ')).toMatch(/dissipated/);
  });
  it('setting switches move a hidden unknown back to the analysis', () => {
    const st = { ...def.defaults(), solveFor: 'vin' as const };
    expect(applyDefValues(def, st as any, { source: 'battery' })).toEqual([]);
    expect(st.solveFor).toBe('margin');
    const st2 = { ...def.defaults(), solveFor: 'iout' as const };
    applyDefValues(def, st2 as any, { model: 'fixed' });
    expect(st2.solveFor).toBe('margin');
  });
});

describe('regulator dropout — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
  });
});

function collect(fields: FieldSpec[], nums: { key: string; min: number; max: number; int?: boolean }[], sels: { key: string; options: string[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number' && !f.output) nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, int: f.integer });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? String(o.value) : o)) });
  }
}

describe('regulator dropout — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: { key: string; min: number; max: number; int?: boolean }[] = [];
    const sels: { key: string; options: string[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 5;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) {
        const v = rnd() < 0.1 ? (rnd() < 0.5 ? f.min : f.max) : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 6;
        s[f.key] = f.int ? Math.round(v) : v;
      }
      s.solveFor = def.solve!.options[i % 5].key;
      const st = s as unknown as DropState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
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
      expect(res(again, 'vinReq')).toBeCloseTo(res(r, 'vinReq'), 9);
    }
    expect(ok).toBeGreaterThan(150); // the rest: random targets (margins up to ±2 kV, fixed-dropout load solves) that have no answer
  });
  it('the analysis is never refused for valid inputs', () => {
    let x = 9;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 100; i++) {
      const st: DropState = { ...def.defaults(), model: (['rdson', 'points', 'fixed'] as const)[i % 3], source: i % 2 ? 'dc' : 'battery', vout: 0.5 + 20 * rnd(), iout: 3 * rnd(), vin: 30 * rnd(), cells: 1 + Math.floor(6 * rnd()), chem: 'Custom' };
      expect(runCompute(def, st).ok).toBe(true);
    }
  });
});

describe('regulator dropout: mode-switch regressions', () => {
  it('two points at the same current fall back to the line through the origin, with a warning', () => {
    const r = run({ model: 'points', vdo1: 0.35, i1: 1, i2: 1 });
    expect(r.ok).toBe(true);
    expect(res(r, 'vinReq')).toBeCloseTo(3.3 + 0.35 * 0.5, 12);
    expect(r.warnings.join(' ')).toMatch(/same current/);
  });
  it('the analysis margin range covers a huge dropout (I₁ = 1 µA)', () => {
    const st = { ...def.defaults(), i1: 1e-6 };
    expect(runCompute(def, st).ok).toBe(true);
  });
});

describe('regulator dropout: review regressions', () => {
  const pts = { model: 'points' as const, vdo1: 0.01, i1: 0.1, vdo2: 0.6, i2: 1, vin: 5, vinTol: 0, ripple: 0, vout: 4.9, source: 'dc' as const };
  it('a margin target below the clamped zero-load dropout is an error, not a wrong current', () => {
    const r = run({ ...pts, solveFor: 'iout', margin: 0.12 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/smallest dropout/);
    const ok = run({ ...pts, solveFor: 'iout', margin: 0.05 });
    expect(res(def.compute({ ...def.defaults(), ...pts, iout: res(ok, 'iout'), solveFor: 'margin' }), 'margin')).toBeCloseTo(0.05, 9);
  });
  it('a falling two-point dropout cannot give a maximum load', () => {
    expect(run({ ...pts, solveFor: 'iout', vdo1: 0.6, vdo2: 0.2, margin: 0 }).error).toMatch(/does not rise/);
  });
  it('a battery that can never supply the regulator says so', () => {
    const r = run({ solveFor: 'vEnd', source: 'battery', cells: 1, vout: 5, margin: 0, chem: 'Li-ion / LiPo (4.2 / 3.7 / 3.0 V)', vFull: 4.2, vNom: 3.7 });
    expect(r.status?.text).toBe('BATTERY TOO LOW');
    expect(r.warnings.join(' ')).toMatch(/never supply/);
  });
  it('a solved end-of-discharge voltage does not turn the chemistry into Custom', () => {
    const st = { ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === 'liion-3v3')!.state) } as DropState;
    runCompute(def, st);
    expect(st.chem).toBe('Li-ion / LiPo (4.2 / 3.7 / 3.0 V)');
  });
});
