/**
 * Op-amp gain stages — equations only (pure, SI in/out).
 *
 * Feedback analysis with a single-pole (dominant-pole) open-loop gain
 *   A(s) = A0 / (1 + s/ωp),   ωp = 2π·GBW/A0
 * and feedback factor β = Rin/(Rin + Rf) (noise gain 1/β). Sources: S. Franco, Design with Operational
 * Amplifiers and Analog Integrated Circuits, 4th ed., McGraw-Hill 2015: ch. 1 (finite open-loop gain, noise
 * gain), ch. 2 (difference amplifier, CMRR vs resistor tolerance) and ch. 6 (closed-loop bandwidth with a
 * dominant-pole op-amp). The CMRR expression is also derived in the theory section.
 */

export type Config = 'noninv' | 'inv' | 'diff';

export const K_B = 1.380649e-23;

/** Ideal (A0 → ∞) signal gain, signed. */
export function idealGain(cfg: Config, rf: number, rin: number): number {
  return cfg === 'noninv' ? 1 + rf / rin : cfg === 'inv' ? -rf / rin : rf / rin;
}

export function noiseGain(rf: number, rin: number): number {
  return 1 + rf / rin;
}

/** Complex closed-loop gain at frequency f (Hz) for the single-pole op-amp. Returns { re, im }. */
export function closedLoop(cfg: Config, rf: number, rin: number, a0: number, gbw: number, f: number): { re: number; im: number } {
  const beta = rin / (rin + rf);
  const fp = gbw / a0;
  // A/(1 + Aβ) = [A0/(1 + A0β)] / (1 + j f/fc),  fc = fp(1 + A0β)
  const dc = a0 / (1 + a0 * beta);
  const fc = fp * (1 + a0 * beta);
  const x = f / fc;
  const den = 1 + x * x;
  let re = dc / den;
  let im = (-dc * x) / den;
  const k = cfg === 'noninv' ? 1 : cfg === 'inv' ? -(1 - beta) : 1 - beta;
  re *= k;
  im *= k;
  return { re, im };
}

/** Closed-loop −3 dB bandwidth of the single-pole model (exact): fc = (GBW/A0)·(1 + A0/NG) ≈ GBW/NG. */
export function closedLoopBandwidth(rf: number, rin: number, a0: number, gbw: number): number {
  return (gbw / a0) * (1 + a0 / noiseGain(rf, rin));
}

/** Open-loop gain magnitude |A(jf)|. */
export function openLoopMag(a0: number, gbw: number, f: number): number {
  const fp = gbw / a0;
  return a0 / Math.hypot(1, f / fp);
}

/**
 * Difference amplifier with R1 = R3 = Rin, R2 = R4 = Rf nominal and every resistor within ±t.
 * Worst case: the two ratios R2/R1 and R4/R3 are pushed apart, x = G(1+t)/(1−t), y = G(1−t)/(1+t).
 *   Vout = V2·x(1+y)/(1+x) − V1·y,  Acm = (x − y)/(1 + x),  Ad = ½[x(1+y)/(1+x) + y]
 * CMRR ≈ (1 + G)/(4t) for small t (Franco, ch. 2).
 */
export function diffAmpCmrr(g: number, t: number): number {
  if (!(t > 0)) return Infinity;
  const x = (g * (1 + t)) / (1 - t);
  const y = (g * (1 - t)) / (1 + t);
  const acm = (x - y) / (1 + x);
  const ad = 0.5 * ((x * (1 + y)) / (1 + x) + y);
  return ad / Math.abs(acm);
}

/**
 * Output noise density (V/√Hz) from the gain resistors alone (op-amp noise excluded), T in kelvin.
 * Inverting / non-inverting: e² = 4kT·Rf·NG (Rin's noise × (Rf/Rin)² plus Rf's own).
 * Difference amp: the R3/R4 network adds the same again.
 */
export function resistorNoiseOut(cfg: Config, rf: number, rin: number, tK = 298.15): number {
  const e2 = 4 * K_B * tK * rf * noiseGain(rf, rin);
  return Math.sqrt(cfg === 'diff' ? 2 * e2 : e2);
}
