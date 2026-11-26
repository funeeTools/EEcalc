import { describe, expect, it } from 'vitest';
import { def, type TraceState } from '@/calculators/trace-width-current/def';
import { MIL2, ipcArea, ipcCurrent, ipcRise } from '@/calculators/trace-width-current/model';

const val = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<TraceState>) => def.compute({ ...def.defaults(), ...p });
const OZ = 34.79e-6;
const MIL = 25.4e-6;

function noNaN(r: ReturnType<typeof run>) {
  for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of [...s.x, ...s.y]) expect(Number.isFinite(y)).toBe(true);
}

describe('trace width — IPC-2221A §6.2 curve fit', () => {
  it('I = 0.048·ΔT^0.44·A^0.725 (external), 0.024 (internal), A in mil²', () => {
    expect(ipcCurrent(100 * MIL2, 10, 'external')).toBeCloseTo(0.048 * 10 ** 0.44 * 100 ** 0.725, 12);
    expect(ipcCurrent(100 * MIL2, 10, 'internal')).toBeCloseTo(0.024 * 10 ** 0.44 * 100 ** 0.725, 12);
    // internal = external derated by half at the same cross-section (the origin of the internal chart)
    expect(ipcCurrent(250 * MIL2, 30, 'internal') / ipcCurrent(250 * MIL2, 30, 'external')).toBeCloseTo(0.5, 14);
  });
  it('closed-form inverses agree with the forward fit', () => {
    expect(ipcCurrent(ipcArea(7, 25, 'external'), 25, 'external')).toBeCloseTo(7, 12);
    expect(ipcRise(7, ipcArea(7, 25, 'internal'), 'internal')).toBeCloseTo(25, 10);
  });
});

describe('trace width — independent Python re-implementation', () => {
  it('3 A, 10 °C, external 1 oz → 74.16 mil², 54.15 mil (1.3753 mm); R, ΔV, P at 35 °C over 50 mm', () => {
    const r = run({});
    expect((r.details as any).areaMil2).toBeCloseTo(74.162, 2);
    expect(val(r, 'w') / MIL).toBeCloseTo(54.145, 2);
    expect(val(r, 'r')).toBeCloseTo(0.0190781, 6);
    expect(val(r, 'vDrop')).toBeCloseTo(0.0572344, 6);
    expect(val(r, 'pLoss')).toBeCloseTo(0.171703, 5);
  });
  it('5 A, 20 °C, internal 2 oz → 93.55 mil; 5 A external 1 oz → 71.92 mil', () => {
    expect(val(run({ i: 5, dT: 20, layer: 'internal', t: 2 * OZ }), 'w') / MIL).toBeCloseTo(93.551, 2);
    expect(val(run({ i: 5, dT: 20 }), 'w') / MIL).toBeCloseTo(71.922, 2);
  });
  it('max current of a 10 mil, ½ oz external trace at 10 °C = 0.5334 A; rise of 2 mm 1 oz at 8 A = 50.13 °C', () => {
    expect(val(run({ solveFor: 'i', w: 10 * MIL, t: 0.5 * OZ, dT: 10 }), 'i')).toBeCloseTo(0.53339, 4);
    expect(val(run({ solveFor: 'dT', w: 2e-3, i: 8 }), 'dT')).toBeCloseTo(50.1335, 3);
  });
  it('resistance is temperature-corrected with α = 0.00393 (IEC 60028)', () => {
    const r = run({ solveFor: 'i', w: 1e-3, t: 35e-6, dT: 30, ta: 20, len: 1 });
    const r20 = (1.724e-8 * 1) / (1e-3 * 35e-6);
    expect(val(r, 'r')).toBeCloseTo(r20 * (1 + 0.00393 * 30), 10);
  });
});

describe('trace width — solve → forward round trips', () => {
  it('width → current', () => {
    const a = run({ solveFor: 'w', i: 4.2, dT: 25, layer: 'internal' });
    const b = run({ solveFor: 'i', w: val(a, 'w'), dT: 25, layer: 'internal' });
    expect(val(b, 'i')).toBeCloseTo(4.2, 10);
  });
  it('temperature rise → current', () => {
    const a = run({ solveFor: 'dT', i: 2.5, w: 0.8e-3 });
    const b = run({ solveFor: 'i', w: 0.8e-3, dT: val(a, 'dT') });
    expect(val(b, 'i')).toBeCloseTo(2.5, 10);
  });
});

describe('trace width — validity and edge cases', () => {
  it('warns outside the IPC-2221 chart range', () => {
    const r = run({ i: 40, dT: 30, t: 3 * OZ });
    expect(r.warnings[0]).toMatch(/Outside the IPC-2221 chart range/);
    expect(r.warnings[0]).toMatch(/up to 35 A/);
    expect(r.warnings[0]).toMatch(/700 mil²/);
    expect(run({ dT: 5 }).warnings[0]).toMatch(/10–100 °C/);
    expect(run({ t: 5 * OZ }).warnings[0]).toMatch(/½–3 oz/);
    expect(run({}).warnings).toEqual([]);
  });
  it('warns when the conductor exceeds the laminate temperature and for sub-fab widths', () => {
    expect(run({ solveFor: 'dT', w: 0.5e-3, i: 5, ta: 60 }).warnings.some((w) => w.includes('FR-4'))).toBe(true);
    expect(run({ i: 0.05 }).warnings.some((w) => w.includes('fabrication'))).toBe(true);
  });
  it('zero / negative inputs are rejected with a message', () => {
    expect(() => run({ i: 0 })).toThrow(/Current/);
    expect(() => run({ t: 0 })).toThrow(/thickness/);
    expect(() => run({ solveFor: 'i', w: 0 })).toThrow(/width/);
    expect(() => run({ len: -1 })).toThrow(/Length/);
  });
  it('zero length gives zero drop, finite results', () => {
    const r = run({ len: 0 });
    expect(val(r, 'vDrop')).toBe(0);
    noNaN(r);
  });
});

describe('trace width — examples', () => {
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

describe('trace width — review regressions (2026-11-22)', () => {
  it('a target rise above the search range gives a clear message, not a generic "no solution in range"', () => {
    const r = run({ solveFor: 'dT', i: 200, w: 0.1e-3 });
    expect(r.status?.tone).toBe('fail');
    expect(r.results[0].display).toBe('> 500 °C');
    expect(r.warnings[0]).toMatch(/more than 500 °C/);
    expect(run({ solveFor: 'dT', i: 1e-5, w: 0.2 }).status?.text).toBe('NOT LIMITING');
    expect(run({ solveFor: 'w', i: 1e-5 }).results[0].display).toBe('< 1 µm');
    expect(run({ solveFor: 'w', i: 9e4, dT: 10 }).results[0].display).toBe('> 1 m');
  });
  it('every solved value lies inside its input field limits', () => {
    const fields = def.fields.flatMap((x: any) => x.fields ?? []) as any[];
    const cases: Partial<TraceState>[] = [{ solveFor: 'w', i: 1e-4 }, { solveFor: 'w', i: 500 }, { solveFor: 'dT', i: 1e-3, w: 5e-3 }, { solveFor: 'i', w: 1, t: 1e-3, dT: 500 }, { solveFor: 'i', w: 1e-6, t: 1e-6, dT: 0.01 }];
    for (const c of cases) {
      const r = run(c);
      const v = r.results[0].value;
      if (typeof v === 'number') {
        const f = fields.find((x) => x.key === c.solveFor);
        expect(v).toBeGreaterThanOrEqual(f.min);
        expect(v).toBeLessThanOrEqual(f.max);
      }
    }
  });
});
