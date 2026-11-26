/**
 * Asymmetric (offset) stripline — pure model (no DOM, SI in/out).
 *
 * A trace W × T between two ground planes, H₁ of dielectric below it and H₂ above it (b = H₁ + T + H₂),
 * homogeneous εr (pure TEM, εeff = εr).
 *
 * Thin strip — the odd mode of a broadside-coupled pair puts an electric wall (a virtual ground plane) on
 * the mid-plane, so one strip of that pair IS an offset stripline. Cohn’s broadside formulas (S. B. Cohn,
 * IRE Trans. MTT-8(6), Nov. 1960, pp. 633–637) therefore give the offset line: with the strip on its centre
 * plane, near = min(H₁, H₂) + T/2, far = max(H₁, H₂) + T/2, the pair has b′ = 2(near + far) and gap
 * S′ = 2·near, and C/ε = 4·artanh(k)/(π s′). The wall is put on the nearer plane, the close-coupling case
 * Cohn’s derivation targets (it treats the strips as wide compared with their spacing).
 *
 * Narrow strips — Cohn’s thin-strip result loses accuracy when W is small against the nearer spacing (−4 % at
 * W = near/4). The same formula evaluated for the centred line of spacing 2·near carries almost exactly the
 * same error, and the centred line has Cohn’s exact K/K′ solution (Cohn 1954), so that difference is added
 * back: C = C_Cohn(near, far) + [C_exact(2·near) − C_Cohn(near, near)]. It vanishes for wide strips and makes
 * the centred case exact.
 *
 * Copper thickness — image method (B. C. Wadell, Transmission Line Design Handbook, Artech House 1991,
 * §3.6.3, eq. 3.6.3.22): each face of the strip sees a centred stripline of spacing 2H₁ + T or 2H₂ + T, and
 * carries half of that line’s capacitance. Only the thickness increments of those two lines are used here
 * (Cohn 1954 fringing + Wheeler 1978 thick strip, as on the edge-coupled stripline page), added to the thin
 * result above. For H₁ = H₂ the whole model reduces to the centred stripline exactly.
 *
 * Accuracy against a 2-D finite-volume field solution (60 cross-sections, H₂/H₁ = 1.5–5, W/H_near
 * = 0.25–4, T/H_near = 0–0.25; builder scratch fd.mjs): +0.0…+0.9 % for W ≥ H_near; up to +2.6 % for
 * W = H_near/4 with thick copper and H₂ = 5H₁. The uncorrected image method (Wadell eq. 3.6.3.22 alone) was
 * +0.2…+7.2 % on the same set; IPC-2141A’s asymmetric formula is coarser still.
 */

import { ETA0 } from '../stripline-diff/model';
import { striplineCap } from '../controlled-impedance/model';
import { offsetCap } from '../broadside-coupled/model';

export { ETA0 };

export interface OffsetResult {
  z0: number;
  /** normalised capacitance C/ε */
  c: number;
  b: number;
  /** centred stripline of the same b (reference) */
  zSym: number;
  /** image-method estimate (Wadell eq. 3.6.3.22 alone), for comparison */
  zImage: number;
  /** share of the return current in the lower plane (H₁ side), from the two image half-capacitances */
  lowerShare: number;
}

/** Offset stripline: W × T, H₁ below, H₂ above, εr. The model itself is offsetCap (broadside-coupled/model). */
export function offsetStripline(w: number, t: number, h1: number, h2: number, er: number): OffsetResult {
  const c = offsetCap(w, t, h1, h2);
  const k = ETA0 / Math.sqrt(er);
  const b = h1 + t + h2;
  const c1 = striplineCap(w, 2 * h1 + t, t);
  const c2 = striplineCap(w, 2 * h2 + t, t);
  return { z0: k / c, c, b, zSym: k / striplineCap(w, b, t), zImage: k / (0.5 * (c1 + c2)), lowerShare: c1 / (c1 + c2) };
}
