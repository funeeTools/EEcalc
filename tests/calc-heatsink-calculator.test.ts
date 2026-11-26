import { describe, expect, it } from 'vitest';
import { INTERFACES, def, type HeatsinkState } from '@/calculators/heatsink-calculator/def';

const val = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<HeatsinkState>) => def.compute({ ...def.defaults(), ...p });

function noNaN(r: ReturnType<typeof run>) {
  for (const x of r.results) if (typeof x.value === 'number') expect(Number.isNaN(x.value), x.key).toBe(false);
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of [...s.x, ...s.y]) expect(Number.isFinite(y)).toBe(true);
}

describe('heatsink — primary-source relations', () => {
  it('SLVA118A eq. 10: θSA ≤ (Tj − Ta)/P − θJC − θCS (onsemi AN1040 TO-220 greased-mica θCS = 1.6 °C/W)', () => {
    expect(INTERFACES['TO-220 · mica + grease (1.6)']).toBe(1.6); // AN1040 Table 1, TO-220AB, 2-mil mica, lubed
    expect(INTERFACES['TO-3 · grease (0.1)']).toBe(0.1); // AN1040 Table 1, TO-204AA metal-to-metal, lubed
    const r = run({ solveFor: 'thetaSA', p: 10, tj: 125, ta: 40, thetaJC: 1.0, thetaCS: 1.6 });
    expect(val(r, 'thetaSA')).toBeCloseTo(5.9, 10); // (125 − 40)/10 − 1 − 1.6
    expect(val(r, 'ts')).toBeCloseTo(99, 10);
    expect(val(r, 'thetaSAreq')).toBeCloseTo(8.4, 10); // against Tj,max = 150 °C
    expect(val(r, 'pMax')).toBeCloseTo(110 / 8.5, 10);
  });
  it('SLVA118A ex. 3 numbers with a heatsink: 2.8 W, Ta 50 °C, Tj 150 °C, θJC 3, θCS 1 → θSA 31.71 °C/W', () => {
    const r = run({ solveFor: 'thetaSA', p: 2.8, ta: 50, tj: 150, tjMax: 150, thetaJC: 3, thetaCS: 1, thetaJA0: 0 });
    expect(val(r, 'thetaSA')).toBeCloseTo(31.714286, 5);
  });
});

describe('heatsink — independent Python re-implementation', () => {
  it('TO-3 analysis: 25 W, Ta 45, θ 1.5 + 0.36 + 2 → Tj 141.5 °C', () => {
    const r = run({ solveFor: 'tj', p: 25, ta: 45, thetaJC: 1.5, thetaCS: 0.36, thetaSA: 2 });
    expect(val(r, 'tj')).toBeCloseTo(141.5, 10);
    expect(r.status?.text).toBe('MARGINAL');
  });
  it('four devices on one sink: Ts = Ta + 4·P·θSA, Tj = Ts + P·(θJC + θCS)', () => {
    const r = run({ solveFor: 'tj', p: 6, n: 4, ta: 40, thetaJC: 0.8, thetaCS: 1.6, thetaSA: 1, tjMax: 175 });
    expect(val(r, 'ts')).toBeCloseTo(64, 10);
    expect(val(r, 'tj')).toBeCloseTo(78.4, 10);
  });
  it('extra layer adds in series: P_max = 70/(1 + 3.4 + 0.15 + 3) = 9.2715 W', () => {
    const r = run({ solveFor: 'p', tj: 125, ta: 55, thetaJC: 1, thetaCS: 3.4, layers: [{ name: 'spreader', theta: 0.15 }], thetaSA: 3 });
    expect(val(r, 'p')).toBeCloseTo(9.2715232, 6);
    const t = r.tables[0];
    expect(t.rows.map((x) => x.node)).toEqual(['Junction', 'Case', 'Top of spreader', 'Heatsink', 'Ambient']);
    expect(t.rows[0].t).toBeCloseTo(125, 8);
  });
});

describe('heatsink — solve → forward round trips', () => {
  for (const key of ['thetaSA', 'p', 'ta'] as const) {
    it(`solve ${key} for Tj = 110 °C, then analyse`, () => {
      const a = run({ solveFor: key, tj: 110, n: 2, layers: [{ name: 'pad', theta: 0.3 }] });
      const x = val(a, key);
      expect(Number.isFinite(x)).toBe(true);
      const b = run({ solveFor: 'tj', [key]: x, n: 2, layers: [{ name: 'pad', theta: 0.3 }] });
      expect(val(b, 'tj')).toBeCloseTo(110, 8);
    });
  }
});

describe('heatsink — edge cases', () => {
  it('no heatsink is good enough: NO SOLUTION with the floor temperature, no NaN', () => {
    const r = run({ solveFor: 'thetaSA', p: 60 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.warnings[0]).toMatch(/196\.0 °C/);
    expect(r.results.every((x) => x.value === null || !Number.isNaN(x.value as number))).toBe(true);
  });
  it('target below ambient and zero power are input errors', () => {
    expect(() => run({ solveFor: 'thetaSA', tj: 30, ta: 40 })).toThrow(/above the ambient/);
    expect(() => run({ p: 0 })).toThrow(/Power/);
  });
  it('over temperature is flagged and suggests the needed θSA', () => {
    const r = run({ solveFor: 'tj', thetaSA: 15 });
    expect(r.status?.text).toBe('TOO HOT');
    expect(r.warnings[0]).toMatch(/θSA ≤ 8\.40/);
  });
  it('interface preset switches to Custom when θCS is edited', () => {
    const s = def.defaults();
    s.thetaCS = 0.7;
    def.sync!(s);
    expect(s.tim).toBe('Custom');
  });
  it('a bad layer value is rejected', () => {
    expect(() => run({ layers: [{ name: 'x', theta: -1 }] })).toThrow(/Layer 1/);
  });
  it('load() tolerates a missing layer list', () => {
    expect(def.load!({ p: 5 }).layers).toEqual([]);
  });
});

describe('heatsink — examples', () => {
  it('first example equals the defaults', () => {
    expect({ ...def.defaults(), ...def.examples![0].state }).toEqual(def.defaults());
  });
  for (const e of def.examples ?? []) {
    it(`example computes: ${e.label}`, () => {
      const r = run(e.state);
      expect(r.ok).toBe(true);
      noNaN(r);
    });
  }
});

describe('heatsink — review regressions (2026-11-22)', () => {
  it('tiny power: "no heatsink needed", not "even an ideal heatsink is too hot"', () => {
    const r = run({ solveFor: 'thetaSA', p: 50e-6 });
    expect(r.status?.text).toBe('NO HEATSINK NEEDED');
    expect(r.warnings[0]).toMatch(/No heatsink needed/);
    expect(r.warnings[0]).not.toMatch(/ideal heatsink/);
  });
  it('a required θSA below the field minimum is reported, not written back', () => {
    const r = run({ solveFor: 'thetaSA', p: 32.69 }); // needs ≈ 1.8e-4 °C/W
    expect(r.status?.tone).toBe('fail');
    expect(r.results[0].value).toBeNull();
    expect(r.warnings[0]).toMatch(/beyond any practical heatsink/);
  });
  it('every solved value lies inside its input field limits', () => {
    const fields = def.fields.flatMap((x: any) => x.fields ?? []) as any[];
    for (const key of ['thetaSA', 'p', 'ta'] as const) {
      for (const p of [1e-3, 0.1, 10, 30]) {
        const r = run({ solveFor: key, p });
        const v = r.results.find((x) => x.key === key)!.value;
        if (typeof v === 'number') {
          const f = fields.find((x) => x.key === key);
          expect(v).toBeGreaterThanOrEqual(f.min);
          expect(v).toBeLessThanOrEqual(f.max);
        }
      }
    }
  });
});

describe('heatsink calculator — review regressions', () => {
  it('no-solution example still draws the graphs (best case θSA → 0)', () => {
    const ex = def.examples!.find((e) => e.id === 'no-solution')!;
    const r = run(ex.state);
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.graphs.length).toBe(3);
    for (const g of r.graphs) expect(g.series!.some((x) => x.x.length > 1)).toBe(true);
  });
});
