import { describe, expect, it } from 'vitest';
import { def, type BasicDividerState } from '@/calculators/voltage-divider/versions/basic/def';
import { def as standard } from '@/calculators/voltage-divider/def';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<BasicDividerState>) => def.compute({ ...def.defaults(), ...p });

describe('voltage divider, Basic version', () => {
  it('12 V across 30 kΩ / 10 kΩ gives 3 V, 300 µA, R_th 7.5 kΩ (hand calculation)', () => {
    const r = run({});
    expect(r.ok).toBe(true);
    expect(res(r, 'vout')).toBeCloseTo(3, 12);
    expect(res(r, 'i')).toBeCloseTo(300e-6, 15);
    expect(res(r, 'rth')).toBeCloseTo(7500, 9);
    expect(res(r, 'p1')).toBeCloseTo(2.7e-3, 12);
    expect(res(r, 'p2')).toBeCloseTo(0.9e-3, 12);
  });

  it('every unknown round-trips: solve, feed the answer back as an input, get the target again', () => {
    for (const solveFor of ['vin', 'r1', 'r2'] as const) {
      const s = { ...def.defaults(), solveFor, vin: 5, vout: 3.3, r1: 1e3, r2: 1.94118e3 };
      const r = runCompute(def, s);
      expect(r.ok, solveFor).toBe(true);
      const back = def.compute({ ...s, solveFor: 'vout' });
      expect(res(back, 'vout'), solveFor).toBeCloseTo(3.3, 9);
    }
  });

  it('matches the Standard version for an unloaded divider', () => {
    for (const [vin, r1, r2] of [[12, 30e3, 10e3], [-5, 4.7e3, 2.2e3], [400, 1e6, 6.2e3]]) {
      const b = run({ solveFor: 'vout', vin, r1, r2 });
      const s = standard.compute({ ...standard.defaults(), solveFor: 'vout', vin, r1, r2, rl: null });
      expect(res(b, 'vout')).toBeCloseTo(res(s, 'vout'), 12);
    }
  });

  it('impossible targets say why instead of returning a value', () => {
    expect(run({ solveFor: 'r1', vin: 5, vout: 6 }).status?.text).toBe('NO SOLUTION');
    expect(run({ solveFor: 'r2', vin: 0, vout: 1 }).ok).toBe(false);
    expect(run({ solveFor: 'vin', vout: 0 }).ok).toBe(false);
    expect(run({ solveFor: 'vout', r1: 0 }).ok).toBe(false);
  });

  it('the graph passes through the operating point and stays finite', () => {
    const r = run({});
    const g = r.graphs[0];
    for (const y of g.series![0].y) expect(Number.isFinite(y)).toBe(true);
    expect(g.markers?.[0]).toMatchObject({ x: 10e3, y: 3 });
  });
});
