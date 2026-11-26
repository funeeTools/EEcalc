/**
 * Common-mode choke — pure model (no DOM, SI in/out).
 *
 * Inductance from the core's inductance factor:  L = A_L·N²  (A_L in H/turn², per winding), so N = √(L/A_L).
 *   (Any ferrite data book, e.g. TDK/EPCOS "Ferrites and accessories", SIFERRIT data: A_L definition.)
 *
 * Two identical windings of self-inductance L, coupling k (M = kL):
 *   • common mode (lines tied together, each winding carries I/2 the same way):  V = jω(L+M)·I/2, so
 *     L_CM = (L + M)/2 = L(1+k)/2, which is L for k → 1. Data sheets quote L measured on one winding, which equals
 *     L_CM for a well-coupled choke.
 *   • differential mode (series-opposing round the loop):  L_DM = 2(L − M) = 2L(1−k).
 *   • "leakage inductance" as data sheets measure it, one winding with the other shorted:  L_sc = L(1−k²).
 *   (Coupled-inductor relations as used for chokes in C. R. Paul, "Introduction to Electromagnetic Compatibility",
 *   2nd ed., Wiley 2006, ch. 6; M. J. Nave, "Power Line Filter Design for Switched-Mode Power Supplies", Van Nostrand
 *   Reinhold, 1991.)
 *
 * Impedance with parasitics: Z_CM = (R_dc/2) + [ jωL_CM ∥ R_p ∥ 1/(jωC_p) ] — the parallel R–L–C equivalent circuit
 * that ferrite-choke makers fit to their |Z|(f) curves (self-resonance f_r = 1/(2π√(L C_p)), peak |Z| = R_p).
 *
 * Insertion loss of a series impedance Z between source Z_s and load Z_l (CISPR 17 definition, ratio of the
 * load voltage without and with the filter):  IL = 20·log₁₀|(Z_s + Z + Z_l)/(Z_s + Z_l)|.
 *
 * Core flux from common-mode current (Faraday):  B̂ = L·Î/(N·A_e) = A_L·N·Î/A_e (the CM ampere-turns are N·I_CM;
 * the differential current ideally cancels in the core).
 */

import { type Cx, abs, add, cx, div } from '@/core/math/complex';

export interface ChokeParams {
  /** Self-inductance of one winding (H) */
  l: number;
  /** Effective parallel capacitance across the CM impedance (F); 0 = none */
  cp: number;
  /** Parallel loss resistance (Ω); null/Infinity = lossless */
  rp: number | null;
  /** DC resistance of one winding (Ω) */
  rdc: number;
  /** Leakage inductance as a fraction of L, measured one winding with the other shorted (L_sc/L) */
  leak: number;
}

/** Coupling coefficient from the shorted-winding leakage fraction: L_sc/L = 1 − k². */
export function couplingFromLeak(leak: number): number {
  return Math.sqrt(Math.max(0, 1 - leak));
}

export function lcm(p: ChokeParams): number {
  // Windings in parallel carrying I/2 each: V = jω(L+M)·I/2  →  L_CM = (L+M)/2 = L(1+k)/2.
  return (p.l * (1 + couplingFromLeak(p.leak))) / 2;
}

export function ldm(p: ChokeParams): number {
  return 2 * p.l * (1 - couplingFromLeak(p.leak));
}

/** Common-mode impedance at f (both windings in parallel). */
export function zcm(p: ChokeParams, f: number): Cx {
  const w = 2 * Math.PI * f;
  const L = lcm(p);
  // admittance of the parallel L ∥ R_p ∥ C_p
  let y = cx(0, -1 / (w * L));
  if (p.rp != null && Number.isFinite(p.rp) && p.rp > 0) y = add(y, cx(1 / p.rp, 0));
  if (p.cp > 0) y = add(y, cx(0, w * p.cp));
  // lossless and exactly at resonance: the admittance cancels; cap the impedance at Q = 10¹² instead of ∞
  const floor = 1e-12 / (w * L);
  if (Math.hypot(y.re, y.im) < floor) y = cx(floor, 0);
  return add(cx(p.rdc / 2, 0), div(cx(1, 0), y));
}

/** Differential-mode impedance of the loop (both windings in series, opposing). */
export function zdm(p: ChokeParams, f: number): Cx {
  return cx(2 * p.rdc, 2 * Math.PI * f * ldm(p));
}

/** CISPR 17 insertion loss (dB) of a series impedance z between resistive source and load. */
export function insertionLoss(z: Cx, zs: number, zl: number): number {
  return 20 * Math.log10(abs(add(cx(zs + zl, 0), z)) / (zs + zl));
}

export function selfResonance(l: number, cp: number): number {
  return cp > 0 ? 1 / (2 * Math.PI * Math.sqrt(l * cp)) : Infinity;
}

/** Peak CM flux density (T) for a peak CM current. */
export function cmFlux(al: number, n: number, iPk: number, ae: number): number {
  return (al * n * iPk) / ae;
}
