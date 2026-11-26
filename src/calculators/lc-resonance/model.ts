/**
 * LC resonance — pure model (no DOM), SI in/out.
 *
 *  f₀ = 1/(2π√(LC)), Z₀ = √(L/C)  (characteristic impedance; X_L = X_C = Z₀ at f₀)
 *
 * Series RLC (Pozar, Microwave Engineering 4e, §6.1; Alexander & Sadiku, Fundamentals of Electric Circuits, ch. 14):
 *   Z = R + jωL + 1/(jωC);  Q = ω₀L/R = Z₀/R;  half-power ω₁,₂ = ∓R/2L + √((R/2L)² + ω₀²);  BW = R/(2πL) exactly.
 * Parallel tank: an inductor with series loss r_L, in parallel with C and an optional resistance R_p:
 *   Y = 1/R_p + jωC + 1/(r_L + jωL).
 *   Zero-phase (unity power factor) frequency f_r = f₀·√(1 − r_L²C/L)  (Boylestad, Introductory Circuit Analysis,
 *   parallel resonance with a practical coil), where Z = R_p ‖ L/(r_L·C) exactly.
 *   Q and −3 dB bandwidth of the tank are found numerically from |Z(f)|, so they stay exact for low Q.
 */

export type Topology = 'series' | 'parallel';

export interface LcCircuit {
  l: number;
  c: number;
  topology: Topology;
  /** Series topology: total series resistance. Parallel: inductor series resistance r_L. */
  r: number;
  /** Parallel topology only: shunt resistance (null / ∞ = none) */
  rp: number | null;
}

export interface Cplx {
  re: number;
  im: number;
}

export const f0Of = (l: number, c: number) => 1 / (2 * Math.PI * Math.sqrt(l * c));
export const z0Of = (l: number, c: number) => Math.sqrt(l / c);
/** L for resonance at f with capacitance C (exact inverse of f0Of). */
export const lFor = (f: number, c: number) => 1 / ((2 * Math.PI * f) ** 2 * c);
/** C for resonance at f with inductance L. */
export const cFor = (f: number, l: number) => 1 / ((2 * Math.PI * f) ** 2 * l);

/** Impedance at frequency f (Hz). */
export function impedance(k: LcCircuit, f: number): Cplx {
  const w = 2 * Math.PI * f;
  if (k.topology === 'series') return { re: k.r, im: w * k.l - 1 / (w * k.c) };
  // Inductor branch admittance 1/(r + jωL)
  const d = k.r * k.r + w * w * k.l * k.l;
  const gRe = (k.rp != null && k.rp > 0 && Number.isFinite(k.rp) ? 1 / k.rp : 0) + k.r / d;
  const gIm = w * k.c - (w * k.l) / d;
  const m = gRe * gRe + gIm * gIm;
  if (m === 0) return { re: Infinity, im: 0 };
  return { re: gRe / m, im: -gIm / m };
}

export const mag = (z: Cplx) => Math.hypot(z.re, z.im);
export const phaseDeg = (z: Cplx) => (Math.atan2(z.im, z.re) * 180) / Math.PI;

/**
 * The "response" that peaks at resonance: |Y| for the series circuit (current for a voltage drive),
 * |Z| for the parallel tank (voltage for a current drive).
 */
export function response(k: LcCircuit, f: number): number {
  const z = mag(impedance(k, f));
  return k.topology === 'series' ? 1 / z : z;
}

/** Golden-section maximum of g on [a, b] in log-frequency. */
function goldenMax(g: (f: number) => number, a: number, b: number): number {
  let lo = Math.log(a);
  let hi = Math.log(b);
  const r = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - r * (hi - lo);
  let x2 = lo + r * (hi - lo);
  let g1 = g(Math.exp(x1));
  let g2 = g(Math.exp(x2));
  for (let i = 0; i < 200 && hi - lo > 1e-14; i++) {
    if (g1 < g2) {
      lo = x1;
      x1 = x2;
      g1 = g2;
      x2 = lo + r * (hi - lo);
      g2 = g(Math.exp(x2));
    } else {
      hi = x2;
      x2 = x1;
      g2 = g1;
      x1 = hi - r * (hi - lo);
      g1 = g(Math.exp(x1));
    }
  }
  return Math.exp((lo + hi) / 2);
}

/** Bisection in log-frequency for g(f) = target between a and b (g(a) − target and g(b) − target of opposite sign). */
function bisect(g: (f: number) => number, target: number, a: number, b: number): number {
  let lo = Math.log(a);
  let hi = Math.log(b);
  const sLo = Math.sign(g(a) - target);
  for (let i = 0; i < 200 && hi - lo > 1e-15; i++) {
    const m = (lo + hi) / 2;
    if (Math.sign(g(Math.exp(m)) - target) === sLo) lo = m;
    else hi = m;
  }
  return Math.exp((lo + hi) / 2);
}

export interface Band {
  /** Frequency of maximum response (|Y| for series, |Z| for parallel) */
  fPeak: number;
  peak: number;
  /** −3 dB (half-power) points; null when the response never falls 3 dB on that side */
  f1: number | null;
  f2: number | null;
  bw: number | null;
  /** Q = f_peak / BW (null without a bandwidth; Infinity for a lossless circuit) */
  q: number | null;
}

/** Peak and half-power bandwidth, found numerically on the exact impedance. */
export function band(k: LcCircuit): Band {
  const f0 = f0Of(k.l, k.c);
  const lossless = k.r === 0 && (k.topology === 'series' || k.rp == null || !Number.isFinite(k.rp));
  if (lossless) return { fPeak: f0, peak: Infinity, f1: f0, f2: f0, bw: 0, q: Infinity };
  const g = (f: number) => response(k, f);
  // The peak lies at or below f₀ (parallel tank with coil loss) — search well around it.
  const fPeak = goldenMax(g, f0 * 1e-3, f0 * 4);
  const peak = g(fPeak);
  const target = peak / Math.SQRT2;
  const lo = f0 * 1e-9;
  const hi = f0 * 1e9;
  const f1 = g(lo) < target ? bisect(g, target, lo, fPeak) : null;
  const f2 = g(hi) < target ? bisect(g, target, fPeak, hi) : null;
  const bw = f1 != null && f2 != null ? f2 - f1 : null;
  return { fPeak, peak, f1, f2, bw, q: bw != null && bw > 0 ? fPeak / bw : null };
}

/** Zero-phase resonance of the parallel tank (independent of R_p); null when r_L ≥ √(L/C). */
export function parallelZeroPhase(l: number, c: number, r: number): number | null {
  const x = 1 - (r * r * c) / l;
  return x > 0 ? f0Of(l, c) * Math.sqrt(x) : null;
}

export function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}
