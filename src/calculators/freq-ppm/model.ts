/**
 * Frequency tolerance in ppm — equations only (pure; frequencies in Hz, errors in ppm).
 *
 *   ppm = Δf/f₀ · 10⁶,  % = ppm/10⁴,  f = f₀·(1 + ppm·10⁻⁶)
 *
 * Error budget of a crystal or oscillator (each term an interval in ppm):
 *   initial (calibration) tolerance  ±a
 *   temperature: AT-cut / oscillator spec "±b over T_min…T_max", or the tuning-fork parabola
 *                Δf/f = −β·(T − T₀)²  (β ≈ 0.034–0.040 ppm/°C², T₀ = 25 ± 5 °C; e.g. Abracon ABS07
 *                data sheet: −0.036 typ / −0.040 max ppm/°C², T₀ 20–30 °C)
 *   ageing: ±A₁ in the first year, ±A_n per year after (the usual data-sheet form)
 * The worst case adds the intervals; the RSS estimate adds the centres and root-sum-squares the half-widths
 * (independent errors). Timekeeping: an error of e ppm gains or loses e·10⁻⁶ × 86 400 s per day.
 *
 * UART budget (asynchronous, re-synchronised on each start bit): the receiver samples bit k at
 * (k + ½) bit times after the start edge it detected, with up to 1/OS bit of detection delay. The stop bit
 * of an N-bit frame (start + data + parity + stop) is sampled (N − ½) bits after the edge, so a relative
 * clock mismatch δ must satisfy δ·(N − ½) + 1/OS < ½  →  δ_max = (½ − 1/OS)/(N − ½).
 * USB 2.0 §7.1.11: data-rate tolerance ±1.5 % low speed, ±0.25 % full speed, ±0.05 % high speed.
 */

export interface Interval {
  lo: number;
  hi: number;
}

export const ppmToPct = (ppm: number) => ppm / 1e4;
export const pctToPpm = (pct: number) => pct * 1e4;
export const ppmToHz = (ppm: number, f0: number) => (ppm * f0) / 1e6;
export const hzToPpm = (df: number, f0: number) => (df / f0) * 1e6;
export const fToPpm = (f: number, f0: number) => (f / f0 - 1) * 1e6;
export const ppmToF = (ppm: number, f0: number) => f0 * (1 + ppm * 1e-6);

/** Tuning-fork parabola: offset (ppm) at temperature t. */
export function parabolic(beta: number, t0: number, t: number): number {
  return -beta * (t - t0) ** 2;
}

/** Range of the parabola over [tmin, tmax]. */
export function parabolicRange(beta: number, t0: number, tmin: number, tmax: number): Interval {
  const a = parabolic(beta, t0, tmin);
  const b = parabolic(beta, t0, tmax);
  const lo = Math.min(a, b);
  const hi = t0 >= tmin && t0 <= tmax ? 0 : Math.max(a, b);
  return { lo, hi };
}

/** Total ageing (± ppm) after `years`: first-year rate, then the later yearly rate. */
export function ageing(a1: number, an: number, years: number): number {
  return a1 * Math.min(years, 1) + an * Math.max(years - 1, 0);
}

export function sumWorst(parts: Interval[]): Interval {
  return parts.reduce((acc, p) => ({ lo: acc.lo + p.lo, hi: acc.hi + p.hi }), { lo: 0, hi: 0 });
}

/** RSS window: centres add, half-widths add in quadrature. */
export function sumRss(parts: Interval[]): Interval {
  const c = parts.reduce((acc, p) => acc + (p.lo + p.hi) / 2, 0);
  const h = Math.sqrt(parts.reduce((acc, p) => acc + ((p.hi - p.lo) / 2) ** 2, 0));
  return { lo: c - h, hi: c + h };
}

/** Clock gain (+) or loss (−) in seconds per day for an error in ppm. */
export const secPerDay = (ppm: number) => ppm * 1e-6 * 86400;
/** Minutes per 365-day year. */
export const minPerYear = (ppm: number) => ppm * 1e-6 * 525600;

/** Largest total UART clock mismatch (fraction) for an N-bit frame and OS× oversampling. */
export function uartMaxMismatch(nBits: number, os: number): number {
  return (0.5 - 1 / os) / (nBits - 0.5);
}
