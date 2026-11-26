import { describe, expect, it } from 'vitest';
import { applyValues, describeFields, parseFieldValue } from '@/core/calc/fields';
import { brent, invert } from '@/core/calc/solve';
import { E_SERIES, nearestE } from '@/core/eseries';
import type { NumberField } from '@/core/form/form';
import { def as microstrip } from '@/calculators/microstrip/def';
import { def as nf } from '@/calculators/nf-cascade/def';

describe('solver', () => {
  it('brent finds sqrt(2)', () => {
    expect(brent((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 12);
  });
  it('invert finds all roots of a non-monotone function', () => {
    const r = invert((x) => Math.sin(x), 0.5, { lo: 0, hi: 2 * Math.PI, samples: 200 });
    expect(r.roots.length).toBe(2);
    expect(r.roots[0]).toBeCloseTo(Math.PI / 6, 10);
    expect(r.roots[1]).toBeCloseTo((5 * Math.PI) / 6, 10);
  });
  it('invert reports no solution', () => {
    const r = invert((x) => x * x, -1, { lo: 0, hi: 10 });
    expect(r.ok).toBe(false);
  });
});

describe('E-series', () => {
  // IEC 60063 E96 values (published list)
  const E96 = [1.0, 1.02, 1.05, 1.07, 1.1, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.3, 1.33, 1.37, 1.4, 1.43, 1.47, 1.5, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.0, 2.05, 2.1, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.8, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.4, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.9, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.5, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76];
  it('E96 formula matches IEC 60063', () => expect(E_SERIES.E96).toEqual(E96));
  it('E48 is every other E96 value', () => expect(E_SERIES.E48).toEqual(E96.filter((_, i) => i % 2 === 0)));
  it('nearest value', () => {
    expect(nearestE(4.6e-9, 'E12')).toBeCloseTo(4.7e-9, 20);
    expect(nearestE(63.66e-12, 'E24')).toBeCloseTo(62e-12, 20);
    expect(nearestE(9.6, 'E12')).toBe(10);
  });
});

describe('field parsing for the API', () => {
  const len: NumberField = { kind: 'number', key: 'w', label: 'W', units: { mm: 1e-3, mil: 25.4e-6, 'µm': 1e-6 } };
  it('parses units and prefixes', () => {
    expect(parseFieldValue(len, '10 mil')).toEqual({ value: 10 * 25.4e-6, unitChoice: 'mil' });
    expect(parseFieldValue(len, '1.5mm').value).toBeCloseTo(1.5e-3, 15);
    expect(parseFieldValue(len, 0.002).value).toBe(0.002);
    expect(parseFieldValue({ kind: 'number', key: 'c', label: 'C', unit: 'F' }, '47 nF').value).toBeCloseTo(47e-9, 20);
    expect(parseFieldValue({ kind: 'number', key: 'r', label: 'R', unit: 'Ω' }, '4k7').value).toBe(4700);
  });
  it('applies values, validates limits and selects', () => {
    const s = microstrip.defaults();
    const errs = applyValues(microstrip.fields, s, { solveFor: 'z0', w: '20 mil', er: 0.5, material: 'RO4350B', bogus: 1 });
    expect(applyValues(microstrip.fields, microstrip.defaults(), { w: 1e-3 })[0]).toMatch(/calculated/); // w is the default unknown
    expect(s.w).toBeCloseTo(20 * 25.4e-6, 15);
    expect(s.wUnit).toBe('mil');
    expect(s.er).toBe(3.66); // material preset applied, invalid er rejected
    expect(errs.some((e) => e.startsWith('er:'))).toBe(true);
    expect(errs.some((e) => e.includes('bogus'))).toBe(true);
  });
  it('describes nested list fields with paths', () => {
    const info = describeFields(nf.fields, nf.defaults());
    expect(info.some((f) => f.path === 'stages.1.nf')).toBe(true);
    expect(info.find((f) => f.path === 'stages')?.kind).toBe('list');
  });
});
