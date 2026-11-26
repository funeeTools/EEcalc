/**
 * RC time constant — pure model (no DOM), SI in/out.
 *
 * First-order step response of a series RC driven by an ideal step from V₀ to V∞ (Alexander & Sadiku,
 * Fundamentals of Electric Circuits, ch. 7; Horowitz & Hill, The Art of Electronics 3e, §1.4.2):
 *   v(t) = V∞ + (V₀ − V∞)·e^(−t/τ),  τ = R·C
 *   t(v) = τ·ln[(V₀ − V∞)/(v − V∞)]
 * Single-pole RC filter (AoE §1.7): f_c = 1/(2πRC); low-pass H = 1/(1 + jf/f_c), high-pass H = (jf/f_c)/(1 + jf/f_c).
 */

/** Capacitor voltage at time t ≥ 0. */
export function vAt(t: number, tau: number, v0: number, vInf: number): number {
  return vInf + (v0 - vInf) * Math.exp(-t / tau);
}

/** Series current (positive in the charging direction from the source into the capacitor). */
export function iAt(t: number, tau: number, r: number, v0: number, vInf: number): number {
  return ((vInf - v0) / r) * Math.exp(-t / tau);
}

/** ln[(V₀ − V∞)/(V_th − V∞)]: the threshold time in units of τ. NaN when V_th is never reached. */
export function tauMultiple(v0: number, vInf: number, vth: number): number {
  const a = v0 - vInf;
  const b = vth - vInf;
  if (a === 0 || b === 0 || a / b < 1) return NaN; // past the asymptote, on the wrong side, or before the start
  return Math.log(a / b);
}

/** Corner frequency of the single-pole RC filter. */
export const cornerHz = (tau: number) => 1 / (2 * Math.PI * tau);

/** Low-pass (output across C) magnitude in dB and phase in degrees. */
export function lowPass(f: number, fc: number): { db: number; deg: number } {
  const u = f / fc;
  return { db: -10 * Math.log10(1 + u * u), deg: (-Math.atan(u) * 180) / Math.PI };
}

/** High-pass (output across R) magnitude in dB and phase in degrees. */
export function highPass(f: number, fc: number): { db: number; deg: number } {
  const u = f / fc;
  return { db: 20 * Math.log10(u) - 10 * Math.log10(1 + u * u), deg: 90 - (Math.atan(u) * 180) / Math.PI };
}

export function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}
