/**
 * LVDT (linear variable differential transformer) output, demodulation and resolution — equations only
 * (pure, SI in/out).
 *
 * Within its rated range the differential secondary voltage is proportional to the core displacement and
 * to the excitation (ratiometric):
 *   V_out = S · V_ex · x            (S in V/V/m; 1 mV/V/mm = 1 V/V/m)
 * The phase of V_out flips by 180° when the core crosses null, so the sign of x is only recovered by
 * phase-sensitive (synchronous) demodulation.
 * Sources: H. Schaevitz, “The linear variable differential transformer”, Proc. SESA 4(2), 1947;
 * TE Connectivity (Measurement Specialties), “LVDT basics” tutorial and E-series datasheet (sensitivity
 * in mV/V/0.001 in, linearity in % of full-range output); R. Pallás-Areny, J. G. Webster, Sensors and
 * Signal Conditioning, 2nd ed., Wiley 2001, §4.3 (LVDT) and §3.5.2 (phase-sensitive detectors).
 *
 * Synchronous full-wave demodulation of a sine of rms value V with a reference phase error φ, followed by
 * averaging, gives DC = (2√2/π)·V·cos φ  (average of |sin| = 2/π, times the √2 peak factor).
 */

/** DC out of an averaging synchronous rectifier per volt rms in: 2√2/π = 0.9003. */
export const K_AVG = (2 * Math.SQRT2) / Math.PI;

/** 1 mV/V/mm in SI (V/V/m). */
export const MV_V_MM = 1;
/** 1 mV/V/mil (0.001 in) in SI. */
export const MV_V_MIL = 1e-3 / 25.4e-6;

/** Differential secondary output (rms, signed: negative = 180° phase). */
export const lvdtOut = (sens: number, vex: number, x: number) => sens * vex * x;

/** Displacement from a measured output. */
export const lvdtX = (sens: number, vex: number, vout: number) => vout / (sens * vex);

/** Sensitivity from one calibration point. */
export const lvdtSens = (vex: number, x: number, vout: number) => vout / (vex * x);

/** Demodulator gain (DC per V rms) for a reference phase error phi (rad). */
export function demodGain(kind: 'avg' | 'rms', phi: number): number {
  return (kind === 'avg' ? K_AVG : 1) * Math.cos(phi);
}

export interface AdcResult {
  /** LSB size, V (bipolar input ±vref, N bits) */
  lsb: number;
  /** Two’s-complement code, clamped to the converter range */
  code: number;
  clipped: boolean;
}

/** Bipolar ±vref converter, rounding quantiser. */
export function adcCode(v: number, vref: number, bits: number): AdcResult {
  const lsb = (2 * vref) / 2 ** bits;
  const raw = Math.round(v / lsb);
  const hi = 2 ** (bits - 1) - 1;
  const lo = -(2 ** (bits - 1));
  return { lsb, code: Math.min(Math.max(raw, lo), hi), clipped: raw > hi || raw < lo };
}
