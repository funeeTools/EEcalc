import { describe, expect, it } from 'vitest';
import { def, maxInSeries, type LedState } from '@/calculators/led-resistor/def';
import { LED_PRESETS, ledCurrent } from '@/calculators/led-resistor/model';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<LedState>) => def.compute({ ...def.defaults(), ...p });

function noNaN(r: CalcReport) {
  for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y), `${g.id}/${s.label}`).toBe(true);
}

describe('LED resistor — worked examples (Kingbright datasheet Vf, checked in Python)', () => {
  it('red WP7113ID (Vf typ 1.9 V, max 2.3 V) on 5 V at 10 mA → 310 Ω, E24 330 Ω → 9.394 mA', () => {
    const r = run({});
    expect(res(r, 'r')).toBeCloseTo(310, 9);
    expect(res(r, 'rStd')).toBe(330);
    expect(res(r, 'iStd')).toBeCloseTo(0.009393939393939394, 12);
    expect(res(r, 'iStdMin')).toBeUndefined();
    expect(res(r, 'iRange')).toBeCloseTo(0.008181818181818182, 12);
    expect(res(r, 'pR')).toBeCloseTo(0.02912121212121212, 12);
    expect(res(r, 'eff')).toBeCloseTo(0.38, 12);
    expect(r.warnings).toEqual([]);
  });
  it('IR WP7113SF4C at 50 mA: 74 Ω → E12 82 Ω, 45.1 mA, 0.167 W → ½ W part (2× margin), margin warning', () => {
    const ex = def.examples!.find((e) => e.id === 'ir-pulse')!;
    const r = run(ex.state);
    expect(res(r, 'r')).toBeCloseTo(74, 9);
    expect(res(r, 'rStd')).toBe(82);
    expect(res(r, 'iStd')).toBeCloseTo(0.0451219512195122, 12);
    expect(res(r, 'pR')).toBeCloseTo(0.16695121951219516, 12);
    expect(r.results.find((x) => x.key === 'pR')!.note).toMatch(/500 mW/);
    expect(r.warnings.some((w) => w.includes('80 %'))).toBe(true);
  });
  it('3 white LEDs on 12 V: string cannot light with max-Vf parts', () => {
    const r = run(def.examples!.find((e) => e.id === 'white-12v-3')!.state);
    expect(res(r, 'rStd')).toBe(110);
    expect(res(r, 'iRange')).toBe(0);
    expect(r.warnings.some((w) => w.includes('may not light'))).toBe(true);
  });
  it('presets are internally consistent', () => {
    for (const [k, p] of Object.entries(LED_PRESETS)) {
      if (!p) continue;
      expect(p.vfMax, k).toBeGreaterThanOrEqual(p.vf);
      expect(p.iMax, k).toBeGreaterThanOrEqual(p.iTest);
    }
  });
});

describe('LED resistor — solve round trips', () => {
  const base: Partial<LedState> = { vs: 12, n: 3, vf: 2.1, vfMax: 2.5, iF: 12e-3, r: 0, led: 'Custom', iMax: null };
  it('R → I_F → R', () => {
    const r = run({ ...base, solveFor: 'r' });
    const rx = res(r, 'r');
    expect(rx).toBeCloseTo((12 - 6.3) / 12e-3, 9);
    const i = run({ ...base, solveFor: 'iF', r: rx });
    expect(res(i, 'iF')).toBeCloseTo(12e-3, 14);
  });
  it('Vs from R and I_F reproduces the supply', () => {
    const r = run({ ...base, solveFor: 'vs', r: 475, vs: 0 });
    const vs = res(r, 'vs');
    expect(vs).toBeCloseTo(6.3 + 12e-3 * 475, 12);
    expect(ledCurrent(vs, 3, 2.1, 475)).toBeCloseTo(12e-3, 14);
  });
});

describe('LED resistor — edge cases', () => {
  it('zero headroom fails despite float rounding (3 × 2.3 V on 6.9 V)', () => {
    const r = run({ solveFor: 'r', vs: 6.9, n: 3, vf: 2.3, vfMax: 2.3, iF: 0.01, led: 'Custom' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/at most 2/);
    expect(run({ solveFor: 'iF', vs: 6.9, n: 3, vf: 2.3, vfMax: 2.3, r: 100, led: 'Custom' }).ok).toBe(false);
  });
  it('max LEDs in series is strict when Vs is an exact multiple of Vf max', () => {
    expect(maxInSeries(6.9, 2.3)).toBe(2);
    expect(maxInSeries(7, 2.3)).toBe(3);
    expect(maxInSeries(2, 2.3)).toBe(0);
    const r = run({ solveFor: 'r', vs: 6.9, n: 2, vf: 2.0, vfMax: 2.3, iF: 0.01, led: 'Custom' });
    expect(res(r, 'maxN')).toBe(2);
  });
  it('IR preset is labelled by peak wavelength', () => {
    expect(Object.keys(LED_PRESETS)).toContain('Infrared 880 nm peak');
  });
  it('supply below n·Vf is an error with a suggestion', () => {
    const r = run({ vs: 3, n: 2 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cannot forward-bias/);
    expect(run({ solveFor: 'iF', vs: 1.9, r: 100 }).ok).toBe(false);
  });
  it('bad inputs report errors, never NaN', () => {
    expect(run({ n: 0 }).ok).toBe(false);
    expect(run({ n: 2.5 }).ok).toBe(false);
    expect(run({ iF: 0 }).ok).toBe(false);
    expect(run({ solveFor: 'iF', r: 0 }).ok).toBe(false);
    expect(run({ vf: NaN }).ok).toBe(false);
  });
  it('over-current against the absolute maximum fails the row and warns', () => {
    const r = run({ solveFor: 'iF', r: 47 });
    expect(r.ok).toBe(true);
    expect(r.results.find((x) => x.key === 'iOp')!.tone).toBe('fail');
    expect(r.warnings.some((w) => w.includes('exceeds the absolute maximum'))).toBe(true);
  });
  it('low headroom warns', () => {
    const r = run({ vs: 2.2, iF: 5e-3 });
    expect(r.warnings.some((w) => w.includes('left across the resistor'))).toBe(true);
    noNaN(r);
  });
  it('preset sync falls back to Custom on edit', () => {
    const s = { ...def.defaults(), vf: 2.05 };
    def.sync!(s);
    expect(s.led).toBe('Custom');
    const t = def.defaults();
    def.sync!(t);
    expect(t.led).toBe('Red 617 nm (GaAsP)');
  });
  it('every example computes', () => {
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      noNaN(r);
    }
    expect(def.examples![0].state).toEqual(def.defaults());
  });
  it('standard-value rows: red above the absolute maximum, yellow above 80 % of it', () => {
    const r = run({ iMax: 30e-3 });
    const t = r.tables[0];
    t.rows.forEach((row, i) => {
      const iTyp = row.i as number;
      const iMin = row.iMin as number;
      const want = iTyp > 30e-3 || iMin <= 0 ? 'fail' : iTyp > 24e-3 || iMin < 0.5 * iTyp ? 'warn' : 'pass';
      expect(t.rowTones![i]).toBe(want);
    });
  });
});

describe('LED resistor — mode-switch regressions', () => {
  it('a supply below one LED says so instead of "at most 0"', () => {
    const r = def.compute({ ...def.defaults(), vs: 0.5 });
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/at most 0/);
    expect(r.error).toMatch(/Even one LED/);
  });
});
