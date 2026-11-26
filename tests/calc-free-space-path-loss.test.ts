import { describe, expect, it } from 'vitest';
import { def } from '@/calculators/free-space-path-loss/def';
import { fsplDb } from '@/calculators/free-space-path-loss/model';

type R = { results: { key: string; value: unknown }[] };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Record<string, unknown>) => def.compute({ ...def.defaults(), ...p } as any);

describe('free-space path loss', () => {
  it('ITU-R P.525: L = 32.45 + 20 log f(MHz) + 20 log d(km)', () => {
    expect(fsplDb(1e3, 1e6)).toBeCloseTo(32.4478, 4);
    for (const [fMHz, dkm] of [[1000, 1], [2450, 0.1], [868, 10], [12000, 35786], [0.5, 2000]]) {
      expect(fsplDb(dkm * 1e3, fMHz * 1e6)).toBeCloseTo(32.44778 + 20 * Math.log10(fMHz) + 20 * Math.log10(dkm), 4);
    }
    // Friis (1946): doubling the distance costs 6.02 dB
    expect(fsplDb(200, 1e9) - fsplDb(100, 1e9)).toBeCloseTo(6.0206, 4);
  });

  it('link budget matches an independent Python calculation (defaults; LoRa range)', () => {
    const r = run({});
    expect(res(r, 'fspl')).toBeCloseTo(80.231105, 5);
    expect(res(r, 'pr')).toBeCloseTo(-58.231105, 5);
    expect(res(r, 'linkMargin')).toBeCloseTo(23.768895, 5);
    expect(res(r, 'eField')).toBeCloseTo(Math.sqrt(29.9792458 * 10 ** (2.2 - 3)) / 100, 9);
    expect(res(r, 'aeRx') * 1e4).toBeCloseTo(18.88423, 4);
    expect(r.status?.text).toBe('LINK OK');
    const lora = run(def.examples!.find((e) => e.id === 'lora-868')!.state);
    expect(res(lora, 'maxRange') / 1e3).toBeCloseTo(142.5907, 3);
    expect(res(run(def.examples!.find((e) => e.id === 'geo-ku')!.state), 'fspl')).toBeCloseTo(205.1057, 3);
  });

  it('solve → forward round trips for distance and frequency', () => {
    const d = run({ solveFor: 'd', fspl: 100, f: 5.8e9, link: false });
    expect(res(d, 'd') / 1e3).toBeCloseTo(0.41132286, 7);
    expect(fsplDb(res(d, 'd'), 5.8e9)).toBeCloseTo(100, 10);
    const f = run({ solveFor: 'f', fspl: 120, d: 3e3, link: false });
    expect(fsplDb(3e3, res(f, 'f'))).toBeCloseTo(120, 10);
    // the range at the required margin really leaves that margin
    const r = run({});
    const atMax = run({ d: res(r, 'maxRange') });
    expect(res(atMax, 'linkMargin')).toBeCloseTo(def.defaults().margin, 9);
  });

  it('far-field and edge cases: near-field warnings, impossible link, bad inputs', () => {
    const near = run({ d: 0.05, f: 2.4e9, ant: 0.3, link: false });
    expect(near.warnings.some((w) => w.includes('far field'))).toBe(true);
    expect(near.warnings.some((w) => w.includes('2D²/λ'))).toBe(true);
    const neg = run({ d: 1e-3, f: 1e9, link: false });
    expect(neg.warnings.some((w) => w.includes('meaningless'))).toBe(true);
    const fail = run({ d: 100e3 });
    expect(fail.status?.text).toBe('NO LINK');
    expect(fail.warnings.length).toBeGreaterThan(0);
    expect(() => run({ d: 0 })).toThrow(/Distance/);
    expect(() => run({ f: 0 })).toThrow(/Frequency/);
    expect(() => run({ solveFor: 'd', f: 0 })).toThrow();
    for (const r of [near, neg, fail]) expect(r.results.every((x) => typeof x.value !== 'number' || Number.isFinite(x.value))).toBe(true);
  });

  it('regression: d_max inside the near field is not offered as a range', () => {
    const r = run({ pt: -100, sens: 0 });
    expect(r.results.find((x) => x.key === 'maxRange')!.value).toBeNull();
    expect(r.warnings.some((w) => w.includes('cannot close in the far field'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('shorten the path'))).toBe(false);
    expect(r.graphs[0].vlines!.some((v) => v.label.startsWith('d_max'))).toBe(false);
  });

  it('regression: solved d / f outside the field limits give NO SOLUTION; L ≤ 0 is never LINK OK', () => {
    for (const p of [{ solveFor: 'f', fspl: 400, d: 1e-6 }, { solveFor: 'd', fspl: 400, f: 1 }, { solveFor: 'f', fspl: -200, d: 1 }]) {
      const r = run(p);
      expect(r.ok, JSON.stringify(p)).toBe(false);
      expect(r.status?.text, JSON.stringify(p)).toBe('NO SOLUTION');
      expect(r.error).toMatch(/outside the/);
    }
    const neg = run({ solveFor: 'd', fspl: -20 });
    expect(neg.status?.text).toBe('NEAR FIELD');
    expect(neg.warnings.some((w) => w.includes('≤ λ/4π'))).toBe(true);
    const zero = run({ solveFor: 'd', fspl: 0, link: false });
    expect(zero.warnings.some((w) => w.includes('≤ λ/4π'))).toBe(true);
  });

  it('every example computes with ok: true and finite numbers', () => {
    for (const ex of def.examples!) {
      const r = run(ex.state);
      expect(r.ok, ex.id).toBe(true);
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${ex.id}.${x.key}`).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite), `${ex.id}.${g.id}`).toBe(true);
    }
  });
});

describe('FSPL — mode-switch regressions', () => {
  it('solving back from a value typed at a field limit is not refused by rounding', () => {
    const L = fsplDb(1e-6, 2.45e9);
    const r = run({ solveFor: 'd', fspl: L, f: 2.45e9 });
    expect(r.ok).toBe(true);
    expect(r.results.find((x) => x.key === 'd')!.value).toBeGreaterThanOrEqual(1e-6);
    const rf = run({ solveFor: 'f', fspl: fsplDb(100, 1), d: 100 });
    expect(rf.ok).toBe(true);
  });
  it('the path-loss field range holds every analysis result (−267.5 … 412.4 dB)', () => {
    const f = (def.fields[0] as any).fields.find((x: any) => x.key === 'fspl');
    expect(f.min).toBeLessThanOrEqual(fsplDb(1e-6, 1));
    expect(f.max).toBeGreaterThanOrEqual(fsplDb(1e13, 1e15));
  });
});
