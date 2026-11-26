import { describe, expect, it } from 'vitest';
import { def, type DividerState } from '@/calculators/voltage-divider/def';
import { bestPairs, bracketE, eValues, rssSpread, vOut, worstCase } from '@/calculators/voltage-divider/model';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<DividerState>) => def.compute({ ...def.defaults(), ...p });

function noNaN(r: CalcReport) {
  for (const x of r.results) if (typeof x.value === 'number') expect(Number.isNaN(x.value), x.key).toBe(false);
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y), `${g.id}/${s.label}`).toBe(true);
}

describe('voltage divider — equations', () => {
  it('LM317 feedback (TI datasheet: Vo = 1.25 V·(1 + R2/R1)), 240 Ω / 720 Ω → 5 V', () => {
    // In divider terms the reference sits across the bottom resistor (240 Ω), the output across both.
    const r = run({ solveFor: 'vin', vout: 1.25, r1: 720, r2: 240, rl: null });
    expect(r.ok).toBe(true);
    expect(res(r, 'vin')).toBeCloseTo(5, 12);
  });
  it('12 V → 3.3 V with R2 = 10 kΩ needs R1 = 26.3636 kΩ; best E24 pair 24k/9.1k (Python brute force)', () => {
    const r = run({});
    expect(res(r, 'r1')).toBeCloseTo(26363.6364, 3);
    expect(res(r, 'pairR1')).toBe(24e3);
    expect(res(r, 'pairR2')).toBe(9.1e3);
    expect(res(r, 'pairErr')).toBeCloseTo(-2.746498e-4, 8);
    expect(res(r, 'rth')).toBeCloseTo((26363.6364 * 10e3) / 36363.6364, 2);
  });
  it('E96 regulator feedback 5 V → 1.25 V finds the exact 3:1 pair 10.2k/3.4k', () => {
    const p = bestPairs('E96', 5, 1.25, null, 40e3);
    expect([p[0].r1, p[0].r2]).toEqual([10.2e3, 3.4e3]);
    expect(p[0].err).toBeCloseTo(0, 12);
    expect([p[1].r1, p[1].r2]).toEqual([11.5e3, 3.83e3]);
  });
  it('loaded divider matches an independent Python evaluation', () => {
    const r = run({ solveFor: 'vout', vin: 4.2, r1: 470e3, r2: 680e3, rl: 50e3, tol: 1 });
    expect(res(r, 'vout')).toBeCloseTo(0.37867939538583933, 12);
    expect(res(r, 'loadErr')).toBeCloseTo(-0.8475205515778308, 10);
    expect(res(r, 'voutMin')).toBeCloseTo(0.37502880919041826, 12);
    expect(res(r, 'voutMax')).toBeCloseTo(0.38239212431514197, 12);
    expect(res(r, 'rss')).toBeCloseTo(0.009119698668798205, 7);
    expect(r.warnings.some((w) => w.includes('pulls Vout'))).toBe(true);
  });
  it('unloaded sensitivity: worst case ≈ ±2t(1−k) for small t', () => {
    const t = 1e-4;
    const w = worstCase(10, 30e3, 10e3, null, t);
    const k = 0.25;
    expect((w.hi - w.lo) / 2 / 2.5).toBeCloseTo(2 * t * (1 - k), 7);
    expect(rssSpread(30e3, 10e3, null, t)).toBeCloseTo(Math.SQRT2 * t * (1 - k), 10);
  });
  it('E-series helpers', () => {
    expect(eValues('E12', 1e3, 10e3)).toEqual([1e3, 1.2e3, 1.5e3, 1.8e3, 2.2e3, 2.7e3, 3.3e3, 3.9e3, 4.7e3, 5.6e3, 6.8e3, 8.2e3, 10e3]);
    expect(bracketE('E24', 26363.6)).toEqual([24e3, 27e3]);
    expect(bracketE('E24', 27e3)).toEqual([27e3, 27e3]);
    expect(bracketE('E12', 9.9e3)).toEqual([8.2e3, 10e3]);
    expect(bracketE('E96', 1e6)).toEqual([1e6, 1e6]);
  });
  it('bracketE agrees with a brute-force scan of every series', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (const series of ['E12', 'E24', 'E48', 'E96']) {
      for (let k = 0; k < 400; k++) {
        const x = 10 ** (rnd() * 7);
        const all = eValues(series, x / 2, x * 2);
        const below = Math.max(...all.filter((v) => v <= x));
        const above = Math.min(...all.filter((v) => v >= x));
        expect(bracketE(series, x), `${series} ${x}`).toEqual([below, above]);
      }
    }
  });
});

describe('voltage divider — E-series pair search (review fixes)', () => {
  it('loaded divider: finds 11k/330k (−0.277 %) where the old R₂ scan stopped too low', () => {
    const r = run({ solveFor: 'r1', vin: 12, vout: 1, r2: 100e3, rl: 1e3, eseries: 'E24', tol: 1 });
    expect([res(r, 'pairR1'), res(r, 'pairR2')]).toEqual([11e3, 330e3]);
    expect(res(r, 'pairErr')).toBeCloseTo(-0.00277, 4);
    expect(r.warnings.some((w) => w.includes('closest'))).toBe(false);
  });
  it('loaded divider: 220k/220k is exact for 12 V → 1 V into 22 kΩ (E12)', () => {
    const r = run({ solveFor: 'r1', vin: 12, vout: 1, r2: 47e3, rl: 22e3, eseries: 'E12' });
    expect([res(r, 'pairR1'), res(r, 'pairR2')]).toEqual([220e3, 220e3]);
    expect(res(r, 'pairErr')).toBeCloseTo(0, 12);
  });
  it('equals a brute force over every pair in the total window, with and without loads', () => {
    let seed = 99;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 60; n++) {
      const series = n % 2 ? 'E12' : 'E24';
      const vin = 1 + rnd() * 30;
      const target = vin * (0.02 + 0.96 * rnd());
      const rTotal = 10 ** (2 + rnd() * 4);
      const rl = n % 3 === 0 ? null : 10 ** (2 + rnd() * 5);
      const span = Math.sqrt(10);
      const vals = eValues(series, 1, 10e6);
      let best = Infinity;
      for (const r1 of vals)
        for (const r2 of vals) {
          const t = r1 + r2;
          if (t < rTotal / span || t > rTotal * span) continue;
          best = Math.min(best, Math.abs(vOut(vin, r1, r2, rl) / target - 1));
        }
      const p = bestPairs(series, vin, target, rl, rTotal);
      if (!Number.isFinite(best)) expect(p.length).toBe(0);
      else expect(Math.abs(p[0].err), `case ${n}`).toBeCloseTo(best, 12);
    }
  });
  it('standard values stay within 1 Ω … 10 MΩ', () => {
    const tiny = run({ solveFor: 'r1', vin: 12, vout: 11.9999999, r2: 10e3 });
    expect(res(tiny, 'pairR1')).toBeGreaterThanOrEqual(1);
    expect(tiny.warnings.some((w) => w.includes('outside the 1 Ω'))).toBe(true);
    const huge = run({ solveFor: 'r1', vin: 12, vout: 1e-9, r2: 10e3 });
    expect(huge.ok).toBe(true);
    expect(res(huge, 'pairR1')).toBeUndefined();
    expect(res(huge, 'simplePick')).toBeUndefined();
  });
  it('high-voltage warning covers R₂ as well as R₁', () => {
    const r = run({ vin: 400, vout: 300, solveFor: 'r1' });
    expect(r.warnings.some((w) => w.startsWith('R₂ has 300 V'))).toBe(true);
  });
});

describe('voltage divider — solve round trips', () => {
  const base: Partial<DividerState> = { vin: 24, r1: 33e3, r2: 4.7e3, rl: 100e3, tol: 1, eseries: 'E24' };
  const vo = vOut(24, 33e3, 4.7e3, 100e3);
  for (const k of ['vin', 'r1', 'r2'] as const) {
    it(`solve ${k} (with load) → forward reproduces Vout`, () => {
      const r = run({ ...base, solveFor: k, vout: vo, [k]: 1 });
      expect(r.ok).toBe(true);
      expect(res(r, k) / (base[k] as number)).toBeCloseTo(1, 10);
      const fwd = run({ ...base, solveFor: 'vout', [k]: res(r, k) });
      expect(res(fwd, 'vout') / vo).toBeCloseTo(1, 12);
    });
  }
  it('solve vout (analysis)', () => {
    expect(res(run({ ...base, solveFor: 'vout' }), 'vout')).toBeCloseTo(vo, 12);
  });
  it('negative supply works (−12 V → −3.3 V)', () => {
    const r = run({ solveFor: 'r1', vin: -12, vout: -3.3, r2: 10e3 });
    expect(r.ok).toBe(true);
    expect(res(r, 'r1')).toBeCloseTo(26363.6364, 3);
    noNaN(r);
  });
});

describe('voltage divider — edge cases', () => {
  it('Vout ≥ Vin has no passive solution', () => {
    const r = run({ solveFor: 'r1', vin: 5, vout: 6 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/0 < Vout\/Vin < 1/);
  });
  it('analysis with Vin = 0 is valid and finite', () => {
    const r = run({ solveFor: 'vout', vin: 0 });
    expect(r.ok).toBe(true);
    expect(res(r, 'vout')).toBe(0);
    noNaN(r);
  });
  it('Vin = 0 and Vout = 0 report errors instead of NaN', () => {
    expect(run({ solveFor: 'r2', vin: 0 }).ok).toBe(false);
    expect(run({ solveFor: 'vin', vout: 0 }).ok).toBe(false);
  });
  it('heavy load: no R2 can reach the target', () => {
    const r = run({ solveFor: 'r2', vin: 10, vout: 5, r1: 10e3, rl: 5e3 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/limits the output/);
  });
  it('non-positive resistors and bad tolerance are rejected', () => {
    expect(run({ solveFor: 'vout', r1: 0 }).ok).toBe(false);
    expect(run({ solveFor: 'vout', rl: -5 }).ok).toBe(false);
    expect(run({ tol: 120 }).ok).toBe(false);
    expect(run({ vin: NaN }).ok).toBe(false);
  });
  it('extreme values stay finite and warn', () => {
    const hi = run({ solveFor: 'vout', vin: 1, r1: 1e10, r2: 1e10 });
    expect(hi.ok).toBe(true);
    expect(hi.warnings.some((w) => w.includes('Output resistance'))).toBe(true);
    noNaN(hi);
    const hot = run({ solveFor: 'vout', vin: 100, r1: 10, r2: 10 });
    expect(hot.warnings.some((w) => w.includes('dissipates'))).toBe(true);
    noNaN(hot);
    const zeroTol = run({ tol: 0 });
    expect(zeroTol.ok).toBe(true);
    noNaN(zeroTol);
  });
  it('every example computes', () => {
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      expect(r.graphs.length).toBeGreaterThan(0);
      noNaN(r);
    }
  });
  it('first example equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
  });
  it('pair table rows are toned by error against max(tol, 0.5 %)', () => {
    const r = run({ tol: 1 });
    const t = r.tables.find((x) => x.id === 'pairs')!;
    t.rows.forEach((row, i) => {
      const e = Math.abs(row.err as number) / 100;
      expect(t.rowTones![i]).toBe(e > 0.01 ? 'fail' : e > 0.005 ? 'warn' : 'pass');
    });
  });
});

describe('voltage divider: mode-switch regressions', () => {
  it('a solved resistor in the GΩ range is shown in GΩ', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const st: DividerState = { ...def.defaults(), solveFor: 'r1', vin: 1000, vout: 1e-3, r2: 10e3 };
    runCompute(def, st as any);
    expect(st.r1Unit).toBe('GΩ');
  });
});
