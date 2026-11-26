import { describe, expect, it } from 'vitest';
import { def, type CtlState } from '@/calculators/critical-trace-length/def';
import { bw35, criticalLength, kneeFreq } from '@/calculators/critical-trace-length/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<CtlState>) => def.compute({ ...def.defaults(), ...p });

describe('critical trace length — independent references', () => {
  it('matches the Python re-implementation (HJ εeff with thickness, L_crit = t_r/(k·t_pd))', () => {
    // python3 ref.py: ctl_ref(...)
    const a = run({ solveFor: 'len', ratio: 1, tr: 1e-9, k: 6, topo: 'microstrip', er: 4.3, w: 0.3e-3, h: 0.2e-3, t: 35e-6 });
    expect(res(a, 'len')).toBeCloseTo(0.028533523975937385, 12);
    expect(res(a, 'eeff')).toBeCloseTo(3.066394884965606, 12);
    expect(res(a, 'tpd') / 5.841082468720597e-9).toBeCloseTo(1, 12);
    const b = run({ solveFor: 'len', ratio: 1, tr: 2e-9, k: 2, topo: 'microstrip', er: 4.3, w: 3e-3, h: 1.6e-3, t: 35e-6 });
    expect(res(b, 'len')).toBeCloseTo(0.16671285374418454, 12);
    expect(res(b, 'eeff')).toBeCloseTo(3.23372611880548, 12);
    const c = run({ solveFor: 'ratio', tr: 1e-9, len: 1, k: 6, topo: 'microstrip', er: 4.3, w: 0.3e-3, h: 0.2e-3, t: 35e-6 });
    expect(res(c, 'ratio')).toBeCloseTo(35.04649481232358, 9);
  });

  it('Bogatin’s rule of thumb: in FR-4 stripline with k = 5, L_crit [in] ≈ t_r [ns] (v ≈ 6 in/ns)', () => {
    for (const tr of [0.5e-9, 1e-9, 2e-9]) {
      const r = run({ solveFor: 'len', ratio: 1, tr, k: 5, topo: 'stripline', er: 4.0 });
      const inches = res(r, 'len') / 0.0254;
      expect(inches / (tr * 1e9)).toBeGreaterThan(1.0);
      expect(inches / (tr * 1e9)).toBeLessThan(1.25); // 1.18 in/ns for εr = 4
    }
  });

  it('knee frequency 0.5/t_r (Johnson & Graham) and single-pole 0.35/t_r = ln 9/(2π)/t_r', () => {
    expect(kneeFreq(1e-9)).toBeCloseTo(5e8, 0);
    expect(bw35(1e-9)).toBeCloseTo(3.5e8, 0);
    // exact first-order 10–90 % rise: t_r = ln 9/(2π f3dB) → 0.3497
    expect(Math.abs(Math.log(9) / (2 * Math.PI) - 0.35) / 0.35).toBeLessThan(1e-3);
    // k = 5 is a tenth of the wavelength at the knee frequency
    const tpd = 6e-9;
    expect(criticalLength(1e-9, 5, tpd)).toBeCloseTo(1 / (tpd * kneeFreq(1e-9)) / 10, 12);
  });
});

describe('critical trace length — solve-for round trips', () => {
  it('len, tr and ratio round-trip to 1e-9 at several points', () => {
    for (const p of [
      { tr: 1e-9, len: 0.05, k: 6, topo: 'microstrip' as const },
      { tr: 100e-12, len: 0.01, k: 2, topo: 'stripline' as const },
      { tr: 5e-9, len: 0.3, k: 10, topo: 'custom' as const, eeff: 2.5 },
    ]) {
      const a = run({ ...p, solveFor: 'ratio' });
      const ratio = res(a, 'ratio');
      const b = run({ ...p, solveFor: 'len', ratio, len: 1 });
      expect(res(b, 'len') / p.len).toBeCloseTo(1, 9);
      const c = run({ ...p, solveFor: 'tr', ratio, tr: 1e-12 });
      expect(res(c, 'tr') / p.tr).toBeCloseTo(1, 9);
    }
  });
});

describe('critical trace length — physics', () => {
  it('L_crit ∝ t_r, ∝ 1/k; stripline shorter than microstrip; εeff between 1 and εr', () => {
    const l = (p: Partial<CtlState>) => res(run({ solveFor: 'len', ratio: 1, ...p }), 'len');
    expect(l({ tr: 2e-9 }) / l({ tr: 1e-9 })).toBeCloseTo(2, 12);
    expect(l({ k: 3 }) / l({ k: 6 })).toBeCloseTo(2, 12);
    expect(l({ topo: 'stripline' })).toBeLessThan(l({ topo: 'microstrip' }));
    const r = run({});
    expect(res(r, 'eeff')).toBeGreaterThan(1);
    expect(res(r, 'eeff')).toBeLessThan(4.3);
    // custom εeff = 1 → the speed of light
    expect(res(run({ topo: 'custom', eeff: 1 }), 'tpd') * 299_792_458).toBeCloseTo(1, 12);
  });
  it('verdict: L > L_crit is a transmission line, warns with what to do', () => {
    const r = run({ solveFor: 'ratio', len: 0.2 });
    expect(r.status?.text).toBe('TRANSMISSION LINE');
    expect(r.warnings.join(' ')).toMatch(/terminate/);
    expect(run({ solveFor: 'ratio', len: 0.005 }).status?.text).toBe('LUMPED');
    expect(r.tables[0].rowTones?.length).toBe(6);
  });
  it('validity warnings: very fast edge, k < 2', () => {
    expect(run({ tr: 10e-12 }).warnings.join(' ')).toMatch(/field solver/);
    expect(run({ k: 1.5, criterion: 'Custom' }).warnings.join(' ')).toMatch(/k ≥ 2/);
  });
});

// ── fuzz over the field spec, through runCompute
type Num = { key: string; min: number; max: number };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity/;

describe('critical trace length — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean strings; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 99;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const st: Record<string, unknown> = { ...def.defaults() };
      for (const f of nums) st[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      for (const f of sels) st[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      st.solveFor = def.solve!.options[i % 3].key;
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
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y), `${g.id}/${s.label}`).toBe(true);
      for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(v).not.toMatch(BAD);
      const again = runCompute(def, { ...st });
      expect(again.ok).toBe(true);
      expect(res(again, 'tpd') / res(r, 'tpd')).toBeCloseTo(1, 9);
      const solved = r.results.find((q) => q.solved)!;
      expect(res(again, solved.key) / (solved.value as number)).toBeCloseTo(1, 9);
    }
    expect(ok).toBeGreaterThan(250);
  });
});

describe('critical trace length — examples', () => {
  it('first example equals the defaults; every example computes; fast', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    const t0 = performance.now();
    for (const ex of def.examples!) {
      const r = run(ex.state);
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.graphs.length).toBeGreaterThan(0);
    }
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
    expect(run(def.examples!.find((e) => e.id === 'hc-5ns')!.state).status?.text).toBe('LUMPED');
    expect(run(def.examples!.find((e) => e.id === 'lvcmos-80mm')!.state).status?.text).toBe('TRANSMISSION LINE');
  });
});
