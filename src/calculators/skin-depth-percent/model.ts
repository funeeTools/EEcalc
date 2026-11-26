/**
 * Skin depth as a percentage — how much of a conductor carries the current at frequency f.
 * Pure equations, SI in / SI out.
 *
 * Skin depth δ = 1/√(π f μ0 μr σ) (Ramo, Whinnery & Van Duzer, Fields and Waves in Communication Electronics,
 * 3rd ed., 1994, §3.16), imported from the skin-depth calculator; resistivity ρ(T) = ρ20·[1 + α20·(T − 20 °C)]
 * as on the trace-resistance page (IEC 60028 for annealed copper).
 *
 * 1. A thick conductor (half-space), same reference §3.16: J(y) = J0·e^(−y/δ)·e^(−jy/δ), y the depth.
 *      share of the current magnitude within depth x   ∫0..x |J| / ∫0..∞ |J|   = 1 − e^(−x/δ)
 *      share of the ohmic loss within depth x          ∫0..x |J|² / ∫0..∞ |J|² = 1 − e^(−2x/δ)
 *    so x = −(δ/m)·ln(1 − p) with m = 1 (current) or 2 (loss), and the frequency for a share p within x
 *    follows from δ = m·x / (−ln(1 − p)) by the exact inverse of δ(f).
 *
 * 2. A trace W × T. Two models of how much of the copper carries the current:
 *    - uniform skin layer (the trace-resistance page's model, imported from it): the current fills a layer
 *      one δ thick under every face that carries it, A_ac = acArea(W, T, δ, return path), Rac/Rdc = W·T/A_ac;
 *    - exact one-dimensional solution for a conductor wide compared with its thickness (P. L. Dowell,
 *      “Effects of eddy currents in transformer windings”, Proc. IEE 113 (8), 1966, pp. 1387–1394, the
 *      single-layer case; the same result as the plane-conductor solution in Ramo et al.):
 *        current on one face, no field at the other (plane below):  Rac/Rdc = F(T/δ)
 *        current on both faces, symmetric (planes both sides):      Rac/Rdc = F(T/(2δ))
 *        F(Δ) = Re[(1 + j)Δ·coth((1 + j)Δ)] = Δ·(sinh 2Δ + sin 2Δ)/(cosh 2Δ − cos 2Δ)
 *      F → 1 at DC and → Δ when δ ≪ T, where it meets the uniform layer; it ignores the side edges.
 *    The share of the cross-section carrying the current is taken as Rdc/Rac (the uniform area that has the
 *    same resistance).
 */

import { freqForDepth, skinDepth } from '@/calculators/skin-depth/model';
import { acArea, type ReturnPath } from '@/calculators/trace-resistance/model';

export type Count = 'current' | 'loss';
export type AcModel = 'layer' | 'exact';

const mOf = (c: Count) => (c === 'loss' ? 2 : 1);

/** Share (0…1) of the current (or of the loss) within depth x of the surface of a thick conductor. */
export const shareWithin = (x: number, delta: number, c: Count) => -Math.expm1((-mOf(c) * x) / delta);

/** Depth that holds a share p (0 < p < 1) of the current (or loss). */
export const depthFor = (p: number, delta: number, c: Count) => (-delta * Math.log1p(-p)) / mOf(c);

/** Skin depth at which a share p lies within depth x. */
export const deltaFor = (p: number, x: number, c: Count) => (mOf(c) * x) / -Math.log1p(-p);

/** Frequency at which a share p of the current (or loss) lies within depth x. */
export const freqFor = (p: number, x: number, c: Count, rho: number) => freqForDepth(deltaFor(p, x, c), 1 / rho, 1);

/**
 * Dowell's single-layer factor F(Δ) = Δ(sinh 2Δ + sin 2Δ)/(cosh 2Δ − cos 2Δ).
 * Small Δ: series 1 + 4Δ⁴/45 − 16Δ⁸/4725 (the closed form loses digits to cancellation there); large Δ: Δ
 * (the exponentially small remainder is below 1e-16 for Δ > 20).
 */
export function dowellF(d: number): number {
  if (!(d > 0)) return 1;
  if (d < 0.05) {
    const d4 = d ** 4;
    return 1 + (4 * d4) / 45 - (16 * d4 * d4) / 4725;
  }
  if (d > 20) return d;
  const a = 2 * d;
  return (d * (Math.sinh(a) + Math.sin(a))) / (Math.cosh(a) - Math.cos(a));
}

/** Rac/Rdc of a W × T trace at skin depth δ (smooth copper, no edge crowding). */
export function racRatio(w: number, t: number, delta: number, ret: ReturnPath, model: AcModel): number {
  if (!Number.isFinite(delta)) return 1;
  if (model === 'layer') return (w * t) / acArea(w, t, delta, ret);
  return dowellF(ret === 'micro' ? t / delta : t / (2 * delta));
}

/** Frequency at which δ equals the depth the current spreads over at DC: T (one face) or T/2 (two faces). */
export const onsetFreq = (t: number, rho: number, ret: ReturnPath) => freqForDepth(ret === 'micro' ? t : t / 2, 1 / rho, 1);

/** ln|cosh(a + jb)|, safe for large a. */
function lnAbsCosh(a: number, b: number): number {
  // |cosh(a + jb)|² = sinh²a + cos²b = (e^2|a|/4)·(1 + 2 cos 2b·e^−2|a| + e^−4|a|)
  const aa = Math.abs(a);
  if (aa > 20) return aa - Math.LN2 + 0.5 * Math.log1p(2 * Math.cos(2 * b) * Math.exp(-2 * aa) + Math.exp(-4 * aa));
  const s = Math.sinh(aa);
  const c = Math.cos(b);
  return 0.5 * Math.log(s * s + c * c);
}

/**
 * Current density magnitude |J(y)|/|J(0)| at depth y below the conducting face, exact 1-D solution:
 * one face (field-free far face): cosh(k(T − y))/cosh(kT); two faces: cosh(k(T/2 − y))/cosh(kT/2), k = (1 + j)/δ.
 */
export function profileExact(y: number, t: number, delta: number, ret: ReturnPath): number {
  const h = ret === 'micro' ? t : t / 2;
  const u = ret === 'micro' ? t - y : Math.abs(t / 2 - y);
  return Math.exp(lnAbsCosh(u / delta, u / delta) - lnAbsCosh(h / delta, h / delta));
}

export { skinDepth };
