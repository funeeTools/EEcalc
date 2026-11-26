import { describe, expect, it } from 'vitest';
import { def, type OpampState } from '@/calculators/opamp-gain/def';
import { closedLoop, closedLoopBandwidth, diffAmpCmrr, resistorNoiseOut } from '@/calculators/opamp-gain/model';
import type { CalcReport } from '@/core/calc/types';
import { findField } from '@/core/calc/fields';
import { runCompute } from '@/core/calc/page';
import type { SelectField } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<OpampState>) => def.compute({ ...def.defaults(), ...p });

function noNaN(r: CalcReport) {
  for (const x of r.results) if (typeof x.value === 'number') expect(Number.isNaN(x.value), x.key).toBe(false);
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y), `${g.id}/${s.label}`).toBe(true);
}

describe('op-amp gain — textbook relations (Franco ch. 1, 2, 6)', () => {
  it('f_B = f_t / (1 + R2/R1): GBW 1 MHz, noise gain 10 → 100 kHz (100.01 kHz with A_OL = 100 dB)', () => {
    expect(closedLoopBandwidth(9e3, 1e3, 1e5, 1e6)).toBeCloseTo(100010, 6);
    // Python: bisection on |A/(1 + Aβ)| = |H(0)|/√2 → 100009.99999
    expect(closedLoopBandwidth(9e3, 1e3, 1e5, 1e6)).toBeCloseTo(100009.99999999999, 3);
  });
  it('closed loop matches an independent Python nodal solution (inverting ×47, NE5532 at 20 kHz)', () => {
    const r = run(def.examples!.find((e) => e.id === 'inv-mic')!.state);
    const rf = res(r, 'rf');
    expect(rf).toBeCloseTo(103400, 6);
    expect(res(r, 'gainAtF')).toBeCloseTo(46.82798356575969, 9);
    expect(res(r, 'phaseAtF')).toBeCloseTo(175.42826386437636, 9);
    expect(res(r, 'f3db')).toBeCloseTo(250120, 3);
    expect(res(r, 'noiseOut')).toBeCloseTo(2.85870888785404e-7, 15);
  });
  it('DC gain error ≈ −NG/A_OL', () => {
    const r = run({ solveFor: 'gain', config: 'noninv', rf: 999e3, rin: 1e3, a0: 100 });
    expect(res(r, 'dcGainErr')).toBeCloseTo(-1000 / (1e5 + 1000), 12);
  });
  it('difference amp worst-case CMRR: exact 54.4024 dB (Python, all 16 tolerance corners) vs (1+G)/(4t) 54.403 dB', () => {
    expect(20 * Math.log10(diffAmpCmrr(20, 0.01))).toBeCloseTo(54.40240016636064, 8);
    const r = run(def.examples!.find((e) => e.id === 'diff-shunt')!.state);
    expect(res(r, 'cmrr')).toBeCloseTo(54.40240016636064, 8);
    expect(diffAmpCmrr(10, 0)).toBe(Infinity);
  });
  it('resistor noise: non-inverting input-referred equals √(4kT·Rf∥Rin)', () => {
    expect(resistorNoiseOut('noninv', 9e3, 1e3) / 10).toBeCloseTo(3.849552958019931e-9, 18);
  });
  it('phase: inverting starts at 180°, non-inverting at 0°, both lose 45° at f₋₃dB', () => {
    const fc = closedLoopBandwidth(10e3, 1e3, 1e5, 1e6);
    const ph = (z: { re: number; im: number }) => (Math.atan2(z.im, z.re) * 180) / Math.PI;
    expect(ph(closedLoop('noninv', 10e3, 1e3, 1e5, 1e6, fc))).toBeCloseTo(-45, 9);
    expect(ph(closedLoop('inv', 10e3, 1e3, 1e5, 1e6, fc))).toBeCloseTo(135, 9);
  });
});

describe('op-amp gain — solve round trips', () => {
  for (const config of ['noninv', 'inv', 'diff'] as const) {
    it(`${config}: Rf and Rin solves reproduce the gain`, () => {
      const g = 23.7;
      const r1 = run({ config, solveFor: 'rf', gain: g, rin: 4.7e3 });
      const rf = res(r1, 'rf');
      expect(res(run({ config, solveFor: 'gain', rf, rin: 4.7e3 }), 'gain')).toBeCloseTo(g, 10);
      const r2 = run({ config, solveFor: 'rin', gain: g, rf: 100e3 });
      const rin = res(r2, 'rin');
      expect(res(run({ config, solveFor: 'gain', rf: 100e3, rin }), 'gain')).toBeCloseTo(g, 10);
    });
  }
  it('E-series pair is exact when a 10:1 pair exists', () => {
    const r = run({});
    expect(res(r, 'pairErr')).toBeCloseTo(0, 12);
    expect(res(r, 'pairRf') / res(r, 'pairRin')).toBeCloseTo(9, 12);
  });
});

describe('op-amp gain — edge cases', () => {
  it('low loop gain warning: no "-0 dB", no double negative', () => {
    const r = run({ solveFor: 'gain', config: 'noninv', rf: 1e6, rin: 1e3, a0: 60, gbw: 1e6 });
    const w = r.warnings.find((x) => x.startsWith('Loop gain'))!;
    expect(w).toMatch(/only 0\.0 dB/);
    expect(w).toMatch(/50\.0 % below/);
    expect(w).not.toMatch(/[-−]0/);
    expect(r.results.find((x) => x.key === 'loopGain')!.display).toBe('0.0 dB');
  });
  it('near-unity gain gives no sub-ohm "standard" value', () => {
    const r = run({ solveFor: 'rf', config: 'noninv', gain: 1.0001, rin: 1e3 });
    expect(r.ok).toBe(true);
    expect(r.results.find((x) => x.key === 'keepPick')!.display).toMatch(/no practical resistor/);
    expect(res(r, 'pairRf') ?? 1).toBeGreaterThanOrEqual(1);
    expect(r.warnings.some((w) => w.includes('practical parts'))).toBe(true);
  });
  it('non-inverting gain below 1 is rejected', () => {
    const r = run({ config: 'noninv', solveFor: 'rf', gain: 0.5 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/≥ 1/);
  });
  it('unity non-inverting: Rf = 0 follower, Rin cannot be sized', () => {
    const r = run({ config: 'noninv', solveFor: 'rf', gain: 1 });
    expect(r.ok).toBe(true);
    expect(res(r, 'rf')).toBe(0);
    expect(res(r, 'f3db')).toBeCloseTo(0.7e6 + 7, 6); // GBW·(1 + 1/A_OL)
    noNaN(r);
    expect(run({ config: 'noninv', solveFor: 'rin', gain: 1 }).ok).toBe(false);
  });
  it('bad numbers give errors, not NaN', () => {
    expect(run({ gbw: 0 }).ok).toBe(false);
    expect(run({ solveFor: 'gain', config: 'inv', rf: 0 }).ok).toBe(false);
    expect(run({ gain: NaN }).ok).toBe(false);
    expect(run({ tol: 60 }).ok).toBe(false);
  });
  it('bandwidth and slew warnings', () => {
    const r = run(def.examples!.find((e) => e.id === 'gbw-limit')!.state);
    expect(r.warnings.some((w) => w.includes('below its DC value'))).toBe(true);
    const s = run({ fsig: 100e3, vpk: 5 });
    expect(s.warnings.some((w) => w.includes('Slew-rate limit'))).toBe(true);
    noNaN(s);
  });
  it('optional inputs blank', () => {
    const r = run({ fsig: null, vpk: null, sr: null });
    expect(r.ok).toBe(true);
    noNaN(r);
  });
  it('every example computes', () => {
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      noNaN(r);
    }
    expect(def.examples![0].state).toEqual(def.defaults());
  });
  it('pair table rows are toned by gain error against max(tol, 0.5 %)', () => {
    const r = run({ tol: 1 });
    const t = r.tables.find((x) => x.id === 'pairs')!;
    expect(t.rowTones!.length).toBe(t.rows.length);
    t.rows.forEach((row, i) => {
      const e = Math.abs(row.err as number) / 100;
      expect(t.rowTones![i]).toBe(e > 0.01 ? 'fail' : e > 0.005 ? 'warn' : 'pass');
    });
  });
});

describe('op-amp gain — mode-switch regressions', () => {
  const sel = (st: OpampState, key: string, v: unknown) => {
    const f = findField(def.fields, key)!.field as SelectField;
    (st as any)[key] = v;
    f.apply?.(v, st, st);
    return runCompute(def, st as any);
  };
  it('non-inverting |G| = 1: Rf = 0 Ω follower is a valid solved value (was OUT OF RANGE)', () => {
    const st = { ...def.defaults(), gain: 1 };
    const r = runCompute(def, st as any);
    expect(r.ok).toBe(true);
    expect(st.rf).toBe(0);
    // analysing the follower, then switching to inverting, sizes Rf for |G| = 1 instead of erroring
    st.solveFor = 'gain';
    expect(runCompute(def, st as any).ok).toBe(true);
    const r2 = sel(st, 'config', 'inv');
    expect(r2.ok).toBe(true);
    expect(st.solveFor).toBe('rf');
    expect(st.rf).toBeCloseTo(st.rin, 9);
  });
  it('inverting |G| < 1 design → non-inverting analyses the resistors (no red error)', () => {
    const st = { ...def.defaults(), config: 'inv' as const, gain: 0.5, rin: 10e3 };
    expect(runCompute(def, st as any).ok).toBe(true);
    const r = sel(st, 'config', 'noninv');
    expect(r.ok).toBe(true);
    expect(st.solveFor).toBe('gain');
    expect(st.gain).toBeCloseTo(1.5, 12);
  });
  it('analysis gain covers every resistor ratio in range', () => {
    const st = { ...def.defaults(), solveFor: 'gain' as const, rf: 1e12, rin: 1e-3 };
    expect(runCompute(def, st as any).ok).toBe(true);
    const st2 = { ...def.defaults(), solveFor: 'gain' as const, config: 'inv' as const, rf: 1e-3, rin: 1e12 };
    expect(runCompute(def, st2 as any).ok).toBe(true);
  });
});

describe('op-amp gain — solved Rf below 1 mΩ', () => {
  it('is refused with a message (the box allows 0 for the follower only)', () => {
    const r = run({ config: 'inv', solveFor: 'rf', gain: 1e-15, rin: 2.2e3 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/below the 1 mΩ/);
  });
});
