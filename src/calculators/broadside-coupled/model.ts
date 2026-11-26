/**
 * Broadside-coupled stripline pair — pure model (no DOM, SI in/out).
 *
 * Two traces of width W stacked one above the other with a facing gap S, centred between ground planes,
 * each H from its own plane (b = 2H + 2T + S), in a homogeneous dielectric εr (pure TEM, εeff = εr).
 *
 * Zero thickness — S. B. Cohn, "Characteristic Impedances of Broadside-Coupled Strip Transmission Lines",
 * IRE Trans. MTT-8(6), Nov. 1960, pp. 633–637 (as reproduced in Rogers Corp. design note 3.2.1, "Design
 * Equations for Broadside and Edgewise Stripline Couplers"), with s = S/b, w = W/b and one parameter k ∈ (s, 1):
 *   Z₀ₑ = (η₀/2)/√εr · K(k′)/K(k),   Z₀ₒ = (η₀π/4)·s / (√εr · artanh k)
 *   w = (2/π)·[artanh R − s·artanh(R/k)],   R = √[(k − s)/(1/k − s)]
 * Cohn used 188.3 Ω = 377/2 and 296.1 Ω = 377·π/4; here η₀ = 376.73 Ω exactly. Given w and s, k is found by
 * Brent’s method on y = artanh k, with 1 − R² = (1 − k²)/(1 − sk) and 1 − (R/k)² = s(1 − k²)/(k(1 − sk)) so wide
 * strips (k → 1) keep full precision. Against a 2-D field solution the formulas agree to 0.03–0.25 % for
 * 0.18 ≤ W/(b − S) ≤ 3.3 (builder check, scratch fd.mjs).
 *
 * Odd mode — the mid-plane is an electric wall, so each strip is an offset stripline (H to its plane, S/2 to the
 * wall), computed with the asymmetric-stripline model (Cohn’s odd formula, narrow-strip deficit restored from
 * the exact centred line, image-method thickness increments).
 *
 * Even mode and thickness — Cohn’s even formula with the strips on their centre planes (gap S + T), plus the
 * plane-side thickness increment ½[C(2H+T, T) − C(2H+T, 0)] of the centred thick stripline (image method,
 * Wadell, Transmission Line Design Handbook §3.6.3; C(b, t) as on the edge-coupled stripline page, Cohn 1954 +
 * Wheeler 1978). The even mode faces a magnetic wall on the other side and gains nothing there.
 *
 * Accuracy against a 2-D finite-volume field solution (builder scratch fd.mjs, 20 cross-sections): see ACCURACY.
 */

import { brent } from '@/core/calc/solve';
import { ETA0 } from '../stripline-diff/model';
import { kRatioLn, striplineCap } from '../controlled-impedance/model';

export { ETA0 };

/** w(y) of Cohn’s parametric width equation, y = artanh k, s = S/b. */
function widthOf(y: number, s: number): number {
  const k = Math.tanh(y);
  // ln(1 − k²) = −2·ln cosh y, in a form that does not overflow for wide strips (large y)
  const lnKp2 = -2 * (y + Math.log1p(Math.exp(-2 * y)) - Math.LN2);
  const d = 1 - s * k;
  const R = Math.sqrt(Math.max(0, (k * (k - s)) / d)); // ≥ 0 even when tanh(y) rounds just below s
  const aR = 0.5 * (2 * Math.log1p(R) + Math.log(d) - lnKp2); // artanh R = ½ ln[(1+R)²/(1−R²)], 1 − R² = (1 − k²)/d
  const Rk = R / k;
  const aRk = 0.5 * (2 * Math.log1p(Rk) + Math.log((k * d) / s) - lnKp2); // 1 − (R/k)² = s(1 − k²)/(k·d)
  return (2 / Math.PI) * (aR - s * aRk);
}

/** Cohn’s parameter k (returned as y = artanh k) for normalised width w = W/b and gap s = S/b. */
export function cohnY(w: number, s: number): number {
  const y0 = Math.atanh(s);
  let lo = y0;
  let hi = y0 + 1;
  while (widthOf(hi, s) < w && hi < 1e4) {
    lo = hi;
    hi = y0 + 2 * (hi - y0);
  }
  // w(y) is smooth and increasing: Brent converges in ~10 evaluations
  return brent((y) => (y === y0 ? -w : widthOf(y, s) - w), lo, hi, 1e-15 * hi);
}

/** Thin broadside strips: normalised capacitances per strip C/ε, even and odd mode (Cohn 1960). */
export function cohnThin(w: number, s: number): { ce: number; co: number; y: number } {
  const y = cohnY(w, s);
  const lnKp = -(y + Math.log1p(Math.exp(-2 * y)) - Math.LN2); // ln sech y, finite for wide strips
  return { ce: 2 * kRatioLn(Math.tanh(y), lnKp), co: (4 * y) / (Math.PI * s), y };
}

/** Thickness increment C(b, t) − C(b, 0) of a centred stripline (normalised). */
export const dThick = (w: number, b: number, t: number) => (t > 0 ? striplineCap(w, b, t) - striplineCap(w, b, 0) : 0);

/**
 * Offset strip W × T, h1 below and h2 above, normalised C/ε (see asymmetric-stripline/model for the derivation):
 * Cohn’s broadside odd mode with the wall on the nearer side, the narrow-strip deficit restored from the exact
 * centred stripline, plus image-method thickness increments.
 */
export function offsetCap(w: number, t: number, h1: number, h2: number): number {
  const near = Math.min(h1, h2) + t / 2;
  const far = Math.max(h1, h2) + t / 2;
  const bb = 2 * (near + far);
  const cohn = cohnThin(w / bb, (2 * near) / bb).co;
  const cohnSym = cohnThin(w / (4 * near), 0.5).co;
  return cohn + (striplineCap(w, 2 * near, 0) - cohnSym) + 0.5 * dThick(w, 2 * h1 + t, t) + 0.5 * dThick(w, 2 * h2 + t, t);
}

export interface BroadsideResult {
  ze: number;
  zo: number;
  zdiff: number;
  zcm: number;
  /** backward voltage coupling (Ze − Zo)/(Ze + Zo) */
  kb: number;
  /** √(Ze·Zo), the coupler impedance */
  z0: number;
  /** plane spacing 2H + 2T + S */
  b: number;
  ce: number;
  co: number;
  /** thin-strip (t = 0 at the centre planes) values */
  ze0: number;
  zo0: number;
}

/** Broadside pair: W, S (facing gap), H (each trace’s outer face to its plane), T, εr. */
export function broadside(w: number, s: number, h: number, t: number, er: number): BroadsideResult {
  const b = 2 * h + 2 * t + s;
  const thin = cohnThin(w / b, (s + t) / b);
  const plane = 0.5 * dThick(w, 2 * h + t, t);
  const ce = thin.ce + plane;
  // odd mode: an electric wall S/2 above the strip makes it an offset stripline (same model as that page)
  const co = offsetCap(w, t, h, s / 2);
  const k = ETA0 / Math.sqrt(er);
  const ze = k / ce;
  const zo = k / co;
  return { ze, zo, zdiff: 2 * zo, zcm: ze / 2, kb: (ze - zo) / (ze + zo), z0: Math.sqrt(ze * zo), b, ce, co, ze0: k / thin.ce, zo0: k / thin.co };
}
