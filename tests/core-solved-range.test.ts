import { describe, expect, it } from 'vitest';
import { runCompute } from '@/core/calc/page';
import { emptyReport, type CalcDef } from '@/core/calc/types';

// A one-field calculator whose solved speed is whatever the state asks for.
const def: CalcDef<{ solveFor: string; n: number; nUnit: string; want: number }> = {
  id: 'test/guard',
  version: '0.1.0',
  fields: [{ kind: 'number', key: 'n', label: 'Speed', units: { rpm: Math.PI / 30, 'rad/s': 1 }, unitKey: 'nUnit', solvable: true, min: 0, max: 1000 }],
  defaults: () => ({ solveFor: 'n', n: 10, nUnit: 'rpm', want: 500 }),
  compute: (s) => ({ ...emptyReport('test/guard'), results: [{ key: 'n', label: 'Speed', value: s.want, unit: 'rad/s', display: `${s.want}`, solved: true }] }),
};

describe('core: solved values never leave their input range', () => {
  it('an in-range solved value is written back', () => {
    const st = def.defaults();
    const r = runCompute(def, st);
    expect(r.ok).toBe(true);
    expect(st.n).toBe(500);
  });
  it('an out-of-range solved value becomes OUT OF RANGE, in the box’s unit, and is not written back', () => {
    const st = { ...def.defaults(), want: 2000 };
    const r = runCompute(def, st);
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('OUT OF RANGE');
    expect(r.error).toContain('rpm');
    expect(r.error).toContain(`${+(2000 / (Math.PI / 30)).toPrecision(4)} rpm`);
    expect(st.n).toBe(10);
  });
});

// A solved frequency with a unit dropdown (the 555 page left "0.00063548 kHz" after a mode switch).
const fdef: CalcDef<{ solveFor: string; f: number; fUnit: string; d: number; dUnit: string; want: number }> = {
  id: 'test/units',
  version: '0.1.0',
  fields: [
    { kind: 'number', key: 'f', label: 'Frequency', units: { mHz: 1e-3, Hz: 1, kHz: 1e3, MHz: 1e6 }, unitKey: 'fUnit', solvable: true, min: 1e-6, max: 1e9 },
    { kind: 'number', key: 'd', label: 'Length', units: { mm: 1e-3, m: 1, mil: 25.4e-6, in: 0.0254 }, unitKey: 'dUnit', solvable: true, min: 0, max: 1e3 },
  ],
  defaults: () => ({ solveFor: 'f', f: 1e3, fUnit: 'kHz', d: 1e-3, dUnit: 'mil', want: 0.63548 }),
  compute: (s) => ({
    ...emptyReport('test/units'),
    graphs: [{ id: 'g', title: 'G', x: { label: 'x', unit: '' }, y: [{ id: 'y', label: 'y', unit: '' }], series: [] }],
    results: [{ key: s.solveFor, label: 'X', value: s.want, unit: '', display: `${s.want}`, solved: true }],
  }),
};

describe('core: solved values are shown in a readable prefix of their unit', () => {
  it('0.63548 Hz solved in a kHz box moves to mHz', () => {
    const st = fdef.defaults();
    runCompute(fdef, st);
    expect(st.f).toBe(0.63548);
    expect(st.fUnit).toBe('mHz');
  });
  it('a value that reads well in the current unit keeps it', () => {
    const st = { ...fdef.defaults(), want: 2.5e3 };
    runCompute(fdef, st);
    expect(st.fUnit).toBe('kHz');
  });
  it('picks the largest prefix that shows the value as 1…9999', () => {
    const st = { ...fdef.defaults(), want: 47e6 };
    runCompute(fdef, st);
    expect(st.fUnit).toBe('MHz');
  });
  it('never changes unit system (mil stays imperial: no m/mm candidates)', () => {
    const st = { ...fdef.defaults(), solveFor: 'd', want: 5 };
    runCompute(fdef, st);
    expect(st.dUnit).toBe('mil');
  });
  it('an out-of-range solve drops the graphs drawn from the impossible value', () => {
    const st = { ...fdef.defaults(), want: 1e12 };
    const r = runCompute(fdef, st);
    expect(r.ok).toBe(false);
    expect(r.graphs).toEqual([]);
    expect(st.f).toBe(1e3);
  });
});
