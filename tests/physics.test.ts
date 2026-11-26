import { describe, expect, it } from 'vitest';
import ref from './python_reference.json';
import { awgDiameterM, awgResistanceOhm } from '@/physics/awg';
import { DIELECTRICS, ceramicModel, dcBiasRatio, electrolyticModel, parallelCombine } from '@/physics/capacitors';
import { linearStepPeaks, simulateBranched } from '@/physics/rlc';
import { type CapGroupInput, type InrushInputs, calculateInrush } from '@/calculators/inrush/model';
import type { CeramicInput, ElectrolyticInput } from '@/physics/capacitors';
import { parseEng, si } from '@/core/units';
import { dopri5, ros23 } from '@/core/sim/ode';

const near = (a: number, b: number, rel: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-12);

describe('units', () => {
  it('parses engineering strings', () => {
    expect(parseEng('4.7k')).toBeCloseTo(4700);
    expect(parseEng('4k7')).toBeCloseTo(4700);
    expect(parseEng('2.2u')).toBeCloseTo(2.2e-6);
    expect(parseEng('2.2µF', 'F')).toBeCloseTo(2.2e-6);
    expect(parseEng('10n')).toBeCloseTo(1e-8);
    expect(parseEng('1e-3')).toBeCloseTo(1e-3);
    expect(parseEng('100m')).toBeCloseTo(0.1);
    expect(parseEng('1M')).toBeCloseTo(1e6);
    expect(parseEng('50 mΩ', 'Ω')).toBeCloseTo(0.05);
    expect(parseEng('abc')).toBeNaN();
  });
  it('formats SI', () => {
    expect(si(4.7e-6, 'F')).toBe('4.7 µF');
    expect(si(1500, 'Ω')).toBe('1.5 kΩ');
    expect(si(0, 'V')).toBe('0 V');
  });
});

describe('ode solvers', () => {
  // y'' = -y  →  y = cos t
  const osc = (_t: number, y: Float64Array, d: Float64Array) => {
    d[0] = y[1];
    d[1] = -y[0];
  };
  it('dopri5 integrates a harmonic oscillator', () => {
    const r = dopri5(osc, [1, 0], 0, 20, { rtol: 1e-9, atol: 1e-12 });
    expect(r.ok).toBe(true);
    near(r.y[0][r.t.length - 1], Math.cos(20), 1e-6);
  });
  it('ros23 handles a stiff decay', () => {
    // y' = -1e7 (y - cos t)
    const f = (t: number, y: Float64Array, d: Float64Array) => {
      d[0] = -1e7 * (y[0] - Math.cos(t));
    };
    const r = ros23(f, [0], 0, 2, { rtol: 1e-5, atol: 1e-8 });
    expect(r.ok).toBe(true);
    expect(r.steps).toBeLessThan(5000);
    expect(Math.abs(r.y[0][r.t.length - 1] - Math.cos(2))).toBeLessThan(1e-4);
  });
});

describe('ported physics (matches Python unit tests)', () => {
  it('AWG 24 diameter', () => near(awgDiameterM(24), 0.0005105, 0.005));
  it('AWG 10 much lower R than 24', () => expect(awgResistanceOhm(1, 10)).toBeLessThan(awgResistanceOhm(1, 24) / 10));
  it('underdamped peaks', () => {
    const p = linearStepPeaks(12, 0.1, 1e-6, 10e-6, 0);
    expect(p.damping).toBe('underdamped');
    expect(p.zeta).toBeCloseTo(0.158113883, 5);
    expect(Math.abs(p.vPeak - 19.256)).toBeLessThan(0.05);
    expect(Math.abs(p.iPeak - 30.26)).toBeLessThan(0.4);
  });
  it('overdamped has no overshoot', () => {
    const p = linearStepPeaks(12, 5, 1e-6, 10e-6, 0);
    expect(p.damping).toBe('overdamped');
    expect(p.vPeak).toBeCloseTo(12, 6);
    expect(p.iPeak).toBeLessThan(12 / 5);
  });
  it('high-Q waveform stays bounded', () => {
    const cap = ceramicModel({ cNominalF: 10e-6, quantity: 2, dielectric: 'C0G/NP0', caseSize: '0805', vRated: 50 }, 12, 1e5);
    const r = simulateBranched({ waveform: 'Step (hot-plug)', amplitudeV: 12, riseS: 50e-9 }, 0.0001, 0.8e-6, [{ r: 0, l: 1e-12, cap }], { nonlinear: false });
    let max = 0;
    for (const v of r.wave.vCap) max = Math.max(max, Math.abs(v));
    expect(max).toBeLessThanOrEqual(24.5);
  });
  it('C0G almost flat', () => {
    const d = DIELECTRICS['C0G/NP0'];
    expect(dcBiasRatio(50, 50, d.cminLowVe, d.curveExp)).toBeGreaterThan(0.95);
  });
  it('high-density X5R drops', () => {
    const m = ceramicModel({ cNominalF: 10e-6, quantity: 1, dielectric: 'X5R', caseSize: '0805', vRated: 16 }, 16, 1e5);
    expect(m.cEffF / 10e-6).toBeLessThan(0.55);
    expect(m.cEffF / 10e-6).toBeGreaterThan(0.05);
  });
  it('parallel mixed banks add C and lower ESR', () => {
    const a = ceramicModel({ cNominalF: 1e-6, quantity: 2, dielectric: 'X7R', caseSize: '0805', vRated: 25 }, 12, 1e5);
    const b = electrolyticModel({ cNominalF: 100e-6, quantity: 1, chemistry: 'Aluminum electrolytic', package: 'Radial can', vRated: 25, esrOhm: 0.12 }, 1e5);
    const c = parallelCombine([a, b]);
    near(c.cEffF, a.cEffF + b.cEffF, 1e-12);
    expect(c.esrOhm).toBeLessThan(Math.min(a.esrOhm, b.esrOhm));
  });
});

describe('inrush calculation matches the Python program', () => {
  const tr = (l: number) => ({ lengthM: l, widthM: 0.5e-3, copperOz: 1 });
  const x5r: CeramicInput = { cNominalF: 10e-6, quantity: 2, dielectric: 'X5R', caseSize: '0805', vRated: 25 };
  const c0g: CeramicInput = { cNominalF: 10e-6, quantity: 2, dielectric: 'C0G/NP0', caseSize: '0805', vRated: 50 };
  const al: ElectrolyticInput = { cNominalF: 100e-6, quantity: 1, chemistry: 'Aluminum electrolytic', package: 'Radial can', vRated: 25, esrOhm: 0.15 };
  const g = (l: number, c: CeramicInput[] = [], e: ElectrolyticInput[] = []): CapGroupInput => ({ trace: tr(l), ceramics: c, electrolytics: e });
  const inputs = (groups: CapGroupInput[], o: { wave?: string; v?: number; rise?: number; damp?: number } = {}): InrushInputs => ({
    stim: { waveform: o.wave ?? 'Step (hot-plug)', amplitudeV: o.v ?? 12, riseS: o.rise ?? 50e-9 },
    vFail: 16,
    iLimit: null,
    v0: 0,
    tempC: 25,
    seriesTrace: tr(0.05),
    wires: [{ lengthM: 0.5, awg: 20, isPair: true, spacingM: 0.005 }],
    extra: { sourceOhm: 0.05, dampingOhm: o.damp ?? 0, connectorMohm: 5 },
    groups,
  });
  const cases: Record<string, InrushInputs> = {
    x5r_single: inputs([g(0.01, [x5r])]),
    c0g_single: inputs([g(0.01, [c0g])]),
    two_groups: inputs([g(0.01, [x5r]), g(0.08, [], [al])]),
    mixed_bank: inputs([g(0.02, [x5r], [al])]),
    rise_1us: inputs([g(0.01, [c0g])], { wave: 'Step with rise time', rise: 1e-6 }),
    impulse: inputs([g(0.01, [c0g], [al])], { wave: '1.2/50 µs impulse (IEC 61000-4-5 OCV)', v: 100 }),
    damped: inputs([g(0.01, [x5r])], { damp: 1 }),
  };
  for (const [name, inp] of Object.entries(cases)) {
    it(name, () => {
      const r = { ...(ref as any)[name] };
      if (name === 'impulse') {
        // The Python reference used k = 1.043 for the 1.2/50 µs wave (peak 1.005·Vp); EEcalc uses
        // k = 1.0374 so the peak is exactly Vp. The circuit is linear, so peaks scale by the ratio.
        const s = 1.0374 / 1.043;
        r.i_peak *= s;
        r.v_peak *= s;
        r.i2t *= s * s;
      }
      const o = calculateInrush(inp);
      near(o.lSeries, r.L_series, 1e-6);
      near(o.rSeries, r.R_series, 1e-6);
      near(o.lEq, r.L_eq, 1e-6);
      near(o.rEq, r.R_eq, 1e-6);
      near(o.cap.cEffF, r.c_eff, 1e-6);
      near(o.result.linear.zeta, r.zeta, 1e-6);
      near(o.result.iPeak, r.i_peak, 0.01);
      near(o.result.vPeak, r.v_peak, 0.005);
      near(o.result.i2t, r.i2t, 0.02);
      expect(o.worstGroup).toBe(r.worst);
    });
  }
});
