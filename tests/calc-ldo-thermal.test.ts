import { describe, expect, it } from 'vitest';
import { def, type LdoState } from '@/calculators/ldo-thermal/def';

const val = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<LdoState>) => def.compute({ ...def.defaults(), ...p });

function finiteResults(r: ReturnType<typeof run>) {
  for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value) || Math.abs(x.value) === Infinity, `${x.key} = ${x.value}`).toBe(true);
  for (const x of r.results) if (typeof x.value === 'number') expect(Number.isNaN(x.value)).toBe(false);
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of [...s.x, ...s.y]) expect(Number.isFinite(y)).toBe(true);
}

describe('LDO thermal — TI SLVA118A worked examples', () => {
  it('example 1: 5 V → 1.8 V at 100 mA, Ta 70 °C, Tj 125 °C → Pd 320 mW, θJA ≤ ~171 °C/W, η 36 %', () => {
    const r = run({ solveFor: 'thetaJA', vin: 5, vout: 1.8, iout: 0.1, ignd: 0, vdo: 0, ta: 70, tj: 125, tjMax: 125 });
    expect(val(r, 'pd')).toBeCloseTo(0.32, 12);
    expect(val(r, 'thetaJA')).toBeCloseTo(171.875, 6);
    expect(val(r, 'eff')).toBeCloseTo(0.36, 12);
    // SLVA118 also quotes 95 °C/W at 150 mA and 289 °C/W at Vin = 3.3 V; both are arithmetic slips in the
    // note ((5 − 1.8)·0.15 = 0.48 W → 114.6 °C/W; (3.3 − 1.8)·0.1 = 0.15 W → 366.7 °C/W), checked in Python.
    expect(val(run({ solveFor: 'thetaJA', vin: 5, vout: 1.8, iout: 0.15, ignd: 0, ta: 70, tj: 125 }), 'thetaJA')).toBeCloseTo(114.583, 2);
    expect(val(run({ solveFor: 'thetaJA', vin: 3.3, vout: 1.8, iout: 0.1, ignd: 0, ta: 70, tj: 125 }), 'thetaJA')).toBeCloseTo(366.667, 2);
  });
  it('example 2: 5.25 V → 3.234 V at 0.95 A, Ta 50 °C, Tj derated to 115 °C → Pd 1.915 W, θJA ≤ 33.9 °C/W', () => {
    const r = run({ solveFor: 'thetaJA', vin: 5.25, vout: 3.234, iout: 0.95, ignd: 0, vdo: 0, ta: 50, tj: 115, tjMax: 125 });
    expect(val(r, 'pd')).toBeCloseTo(1.9152, 4);
    expect(val(r, 'thetaJA')).toBeCloseTo(33.94, 2);
  });
  it('example 3: 5.25 V → 2.45 V at 1 A, Ta 50 °C, Tj 150 °C → Pd 2.8 W, θJA ≤ 35.7 °C/W', () => {
    const r = run({ solveFor: 'thetaJA', vin: 5.25, vout: 2.45, iout: 1, ignd: 0, vdo: 0, iRated: 0, ta: 50, tj: 150, tjMax: 150 });
    expect(val(r, 'pd')).toBeCloseTo(2.8, 10);
    expect(val(r, 'thetaJA')).toBeCloseTo(35.714, 3);
  });
  it('SLVA118 §3: TPS78925 quiescent power 3.3 V × 17 µA ≈ 56 µW vs 80 mW', () => {
    const r = run({ vin: 3.3, vout: 2.5, iout: 0.1, ignd: 17e-6 });
    expect(val(r, 'pGnd')).toBeCloseTo(56.1e-6, 8);
    expect(val(r, 'pLoad')).toBeCloseTo(0.08, 10);
  });
});

describe('LDO thermal — independent Python re-implementation (defaults)', () => {
  it('Tj, limits and efficiency', () => {
    const r = run({});
    expect(val(r, 'tj')).toBeCloseTo(101.3, 9);
    expect(val(r, 'iMax')).toBeCloseTo(0.73235294, 7);
    expect(val(r, 'taMax')).toBeCloseTo(73.7, 9);
    expect(val(r, 'vinMax')).toBeCloseTo(5.78842315, 7);
    expect(val(r, 'thetaNeeded')).toBeCloseTo(87.71929825, 6);
    expect(val(r, 'eff')).toBeCloseTo(0.65868263, 7);
    expect(r.status?.text).toBe('PASS');
  });
});

describe('LDO thermal — solve → forward round trips', () => {
  for (const key of ['iout', 'ta', 'vin', 'thetaJA'] as const) {
    it(`solve ${key} for Tj = 110 °C, then analyse`, () => {
      const a = run({ solveFor: key, tj: 110 });
      expect(a.status?.tone).not.toBe('fail');
      const x = val(a, key);
      const b = run({ solveFor: 'tj', [key]: x });
      expect(val(b, 'tj')).toBeCloseTo(110, 8);
    });
  }
  it('maximum current equals the "limit" row when the target is Tj,max', () => {
    const a = run({ solveFor: 'iout', tj: 125 });
    expect(val(a, 'iout')).toBeCloseTo(val(run({}), 'iMax'), 9);
  });
});

describe('LDO thermal — edge cases', () => {
  it('Vin ≤ Vout is an input error', () => {
    expect(() => run({ vin: 3.3, vout: 3.3 })).toThrow(/above Vout/);
  });
  it('target Tj below ambient is an input error when solving', () => {
    expect(() => run({ solveFor: 'iout', tj: 40, ta: 50 })).toThrow(/above the ambient/);
  });
  it('ground current alone too hot: no load current solution, no NaN', () => {
    const r = run({ solveFor: 'iout', vin: 40, ignd: 20e-3, thetaJA: 200, ta: 60, tj: 125 });
    expect(r.status?.tone).toBe('fail');
    expect(r.warnings[0]).toMatch(/ground current/);
    expect(r.results.every((x) => x.value === null || !Number.isNaN(x.value as number))).toBe(true);
  });
  it('zero load: only the ground current heats the part; no NaN', () => {
    const r = run({ iout: 0 });
    expect(val(r, 'pd')).toBeCloseTo(5e-3, 12);
    expect(val(r, 'eff')).toBe(0);
    finiteResults(r);
  });
  it('over temperature, dropout and over-current are flagged', () => {
    expect(run({ vin: 12, vout: 5, iout: 0.4, ta: 60 }).status?.text).toBe('TOO HOT');
    const d = run({ vin: 3.5, vout: 3.3, vdo: 0.3 });
    expect(d.status?.text).toBe('DROPOUT');
    expect(d.warnings.some((w) => w.includes('dropout'))).toBe(true);
    expect(run({ iout: 1.2, thetaJA: 10 }).status?.text).toBe('OVER RATED I');
    expect(run({ ta: 70 }).status?.text).toBe('MARGINAL'); // Tj 121.3 °C
  });
  it('package preset fills θJA and an edit switches it back to Custom', () => {
    const s = def.defaults();
    s.thetaJA = 45;
    def.sync!(s);
    expect(s.pkg).toBe('Custom');
  });
});

describe('LDO thermal — examples', () => {
  it('first example equals the defaults', () => {
    expect({ ...def.defaults(), ...def.examples![0].state }).toEqual(def.defaults());
  });
  for (const e of def.examples ?? []) {
    it(`example computes: ${e.label}`, () => {
      const r = run(e.state);
      expect(r.ok).toBe(true);
      expect(r.status?.text).not.toBe('NO SOLUTION');
      finiteResults(r);
    });
  }
});

describe('LDO thermal — review regressions (2026-11-22)', () => {
  it('max load current is min(thermal, rated) and is not reported as a failure', () => {
    const r = run({ solveFor: 'iout', thetaJA: 20 });
    expect(val(r, 'iout')).toBe(1); // thermal limit 1.468 A, rating 1 A
    expect(r.status?.tone).not.toBe('fail');
    expect(r.notes.some((n) => n.includes('rated current limits'))).toBe(true);
    const t = run({ solveFor: 'iout' }); // thermal limit below the rating
    expect(val(t, 'iout')).toBeCloseTo(0.4872549, 6); // ((100 − 50)/60 − 5 mW)/1.7 V
    expect(t.results.find((x) => x.key === 'iout')!.note).toMatch(/thermal limit/);
  });
  it('a root beyond the top of the range is "not limiting", not "no input voltage works"', () => {
    const r = run({ solveFor: 'vin', iout: 0, ignd: 20e-6, thetaJA: 200, ta: 25, tj: 125 });
    expect(r.status?.text).toBe('NOT LIMITING');
    expect(r.warnings[0]).toMatch(/Not thermally limiting/);
    const i = run({ solveFor: 'iout', iRated: 0, thetaJA: 0.1, ta: 25 });
    expect(i.status?.text).toBe('NOT LIMITING');
    expect(i.results[0].display).toBe('> 100 A');
  });
  it('θJA with zero dissipation is ∞ (not limiting) and the message keeps “θJA” intact', () => {
    const r = run({ solveFor: 'thetaJA', iout: 0, ignd: 0 });
    expect(r.results[0].display).toBe('∞');
    expect(r.warnings[0]).toMatch(/θJA/);
    expect(r.warnings.join(' ')).not.toMatch(/θja/);
  });
  it('dropout: dissipation uses the dropout-limited output (pass element drops V_DO)', () => {
    const r = run({ vin: 3.5, vout: 3.3, vdo: 0.3, iout: 0.5, ignd: 1e-3 });
    expect(val(r, 'pLoad')).toBeCloseTo(0.3 * 0.5, 12);
    expect(val(r, 'pout')).toBeCloseTo(3.2 * 0.5, 12);
  });
  it('every solved value lies inside its input field limits', () => {
    const fields = def.fields.flatMap((x: any) => x.fields ?? []) as any[];
    for (const [key, p] of [['thetaJA', { iout: 3, vin: 12, iRated: 0 }], ['iout', { thetaJA: 1, iRated: 0 }], ['vin', { iout: 1e-3 }], ['ta', {}]] as const) {
      const r = run({ solveFor: key as any, ...(p as any) });
      const f = fields.find((x) => x.key === key);
      const v = r.results.find((x) => x.key === key)!.value;
      if (typeof v === 'number') {
        expect(v).toBeGreaterThanOrEqual(f.min);
        expect(v).toBeLessThanOrEqual(f.max);
      }
    }
  });
});

describe('LDO thermal — mode-switch regressions', () => {
  it('a package preset while solving θJA goes back to analysis instead of bouncing to Custom', () => {
    const f = def.fields.flatMap((x) => (x.kind === 'section' ? x.fields : [x])).find((x) => x.kind === 'select' && x.key === 'pkg');
    const s: LdoState = { ...def.defaults(), solveFor: 'thetaJA', pkg: 'Custom', thetaJA: 171.875 };
    s.pkg = 'SOT-23-5 (≈ 200 °C/W)';
    (f as unknown as { apply: (v: unknown, s: LdoState) => void }).apply(s.pkg, s);
    expect(s.solveFor).toBe('tj');
    expect(s.thetaJA).toBe(200);
    const r = def.compute(s);
    expect(r.ok).toBe(true);
    def.sync!(s);
    expect(s.pkg).toBe('SOT-23-5 (≈ 200 °C/W)');
  });
  it('no load and no ground current (Tj = Ta): ◎ on Iout, Vin or θJA gives no red error', () => {
    const base = { iout: 0, ignd: 0 };
    const tj = val(run(base), 'tj');
    expect(tj).toBe(50);
    const ri = run({ ...base, tj, solveFor: 'iout' });
    expect(ri.ok).toBe(true);
    expect(val(ri, 'iout')).toBe(0);
    for (const k of ['vin', 'thetaJA'] as const) {
      const r = run({ ...base, tj, solveFor: k });
      expect(r.ok, `${k}: ${r.error}`).toBe(true);
      expect(r.status?.text).toBe('NOT LIMITING');
    }
    expect(run({ ...base, tj, solveFor: 'ta' }).ok).toBe(true);
    // a target below the ambient is still an input error
    expect(() => run({ tj: 40, ta: 50, solveFor: 'iout' })).toThrow(/above the ambient/);
  });
});

describe('LDO thermal — output ranges', () => {
  it('an absurdly hot analysed Tj (1 kV in) is reported, not refused by the range guard', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const r = runCompute(def, { ...def.defaults(), vin: 1000 } as any);
    expect(r.ok, r.error).toBe(true);
    expect(val(r, 'tj')).toBeGreaterThan(1e4);
  });
});
