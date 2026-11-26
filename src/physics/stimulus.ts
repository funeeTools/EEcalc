/** Applied voltage waveforms: step, finite rise, and standard impulses. */

export const WAVEFORMS = [
  'Step (hot-plug)',
  'Step with rise time',
  '1.2/50 µs impulse (IEC 61000-4-5 OCV)',
  '10/700 µs impulse (telecom)',
] as const;
export type WaveformName = (typeof WAVEFORMS)[number];

export interface Stimulus {
  waveform: string;
  amplitudeV: number;
  riseS: number;
  tDelayS?: number;
}

function doubleExp(t: number, vp: number, tau1: number, tau2: number, k: number): number {
  if (t < 0) return 0;
  return k * vp * (Math.exp(-t / tau1) - Math.exp(-t / tau2));
}

export function sourceVoltage(stim: Stimulus, t: number): number {
  const name = stim.waveform;
  const v = stim.amplitudeV;
  const tt = t - (stim.tDelayS ?? 0);
  // Double-exponential fits whose front time T1 = 1.67·(t90 − t30) and time-to-half T2 (from the virtual
  // origin) match the standard waveforms exactly; k normalises the peak to Vp.
  // IEC 61000-4-5 1.2/50 µs open-circuit voltage → 1.20 / 49.8 µs
  if (name.startsWith('1.2/50')) return doubleExp(tt, v, 67.89e-6, 0.405e-6, 1.0374);
  // ITU-T K.44 / IEC 61000-4-5 10/700 µs open-circuit voltage → 10.0 / 700 µs
  if (name.startsWith('10/700')) return doubleExp(tt, v, 975.55e-6, 3.2653e-6, 1.02275);
  if (name.toLowerCase().includes('rise')) {
    const tr = Math.max(stim.riseS, 1e-12);
    return v * Math.min(Math.max(tt / tr, 0), 1);
  }
  return tt >= 0 ? v : 0;
}

/** Breakpoints where the source has a kink or jump (ODE solver lands on them exactly). */
export function sourceBreakpoints(stim: Stimulus): number[] {
  if (stim.waveform.toLowerCase().includes('rise')) return [Math.max(stim.riseS, 1e-12) + (stim.tDelayS ?? 0)];
  return [];
}

/**
 * Long enough to see the first peaks, but not thousands of ring cycles.
 * (α = R/2L is a rate in 1/s, not ζ — mixing them up made the old sim window huge.)
 */
export function suggestedSimTime(stim: Stimulus, lH: number, cF: number, rOhm: number): number {
  lH = Math.max(lH, 1e-12);
  cF = Math.max(cF, 1e-15);
  const period = 2 * Math.PI * Math.sqrt(lH * cF);
  const zeta = rOhm > 0 ? (rOhm / 2) * Math.sqrt(cF / lH) : 0;
  let settle: number;
  if (zeta < 0.999) settle = 10 * period;
  else {
    // Overdamped: the slow pole |s₂| = α − √(α² − ω₀²) (≈ 1/RC) sets the settling time, not α.
    const alpha = rOhm / (2 * lH);
    const w0sq = 1 / (lH * cF);
    const slow = alpha - Math.sqrt(Math.max(alpha * alpha - w0sq, 0));
    settle = Math.max(6 * period, 8 / Math.max(slow > 0 ? slow : alpha, 1e-12));
  }
  let impulse = 0;
  if (stim.waveform.includes('1.2/50')) impulse = 250e-6;
  else if (stim.waveform.includes('10/700')) impulse = 3.5e-3;
  const rise = stim.waveform.toLowerCase().includes('rise') ? stim.riseS * 8 : 0;
  return Math.max(period * 6, settle, impulse, rise, 1e-7);
}
