/**
 * Dual stripline — pure model (no DOM, SI in/out).
 *
 * Stack, bottom to top: plane · H₁ · layer-1 trace (W₁ × T) · D · layer-2 trace (W₂ × T) · H₂ · plane, one
 * homogeneous εr (pure TEM, εeff = εr). The two signal layers are routed at right angles, so a trace on one layer
 * only crosses the other layer’s traces briefly and its impedance is that of an offset stripline in which the
 * other signal layer is just dielectric:
 *   layer 1: offset stripline with H₁ to its near plane and D + T + H₂ to the far one,
 *   layer 2: offset stripline with H₂ to its near plane and D + T + H₁ to the far one.
 * That is the assumption behind the classic dual-stripline equation of the IPC high-speed design guides (IPC-2251
 * draft 2001; IPC-2141A), whose own closed form is not used here: its text could not be checked against the
 * standard, and the IPC asymmetric-stripline fit is far coarser than the model below.
 *
 * The offset-stripline impedance itself is the asymmetric-stripline page’s model, imported unchanged
 * (asymmetric-stripline/model.ts: Cohn 1960 broadside odd mode = offset stripline, narrow-strip deficit restored
 * from Cohn’s exact centred line (1954), image-method thickness increments; 2-D field check +0 … +0.9 % for
 * W ≥ H_near, up to +2.6 % for W = H_near/4).
 *
 * Parallel runs — if a layer-1 and a layer-2 trace run on top of each other they form a broadside-coupled pair
 * (facing gap D). Its even/odd impedances come from the broadside-coupled page’s model (Cohn 1960 with thickness
 * increments), which assumes the symmetric stack H₁ = H₂; for an asymmetric stack the page evaluates it at the
 * mean H = (H₁ + H₂)/2 and labels the result an estimate.
 */

import { type OffsetResult, offsetStripline } from '../asymmetric-stripline/model';
import { broadside } from '../broadside-coupled/model';

export interface DualResult {
  /** layer-1 and layer-2 trace, each an offset stripline */
  l1: OffsetResult;
  l2: OffsetResult;
  /** distance from each trace to its far plane */
  far1: number;
  far2: number;
  /** plane-to-plane spacing H₁ + T + D + T + H₂ */
  b: number;
}

/** Both layers’ impedances. w1/w2: trace widths on layer 1/2; t: copper (both layers). */
export function dualStripline(w1: number, w2: number, t: number, h1: number, d: number, h2: number, er: number): DualResult {
  const far1 = d + t + h2;
  const far2 = d + t + h1;
  return { l1: offsetStripline(w1, t, h1, far1, er), l2: offsetStripline(w2, t, far2, h2, er), far1, far2, b: h1 + h2 + d + 2 * t };
}

export interface ParallelResult {
  ze: number;
  zo: number;
  zdiff: number;
  /** backward coupling (Ze − Zo)/(Ze + Zo) */
  kb: number;
  /** H used: (H₁ + H₂)/2 */
  h: number;
  /** the stack is symmetric (H₁ = H₂ within 1 %): the broadside model applies directly */
  exact: boolean;
  /**
   * Inside the broadside model’s range: W ≥ D/4 and a positive k_b. Cohn’s even-mode formula assumes close coupling;
   * the broadside page’s field check has it reading Zcm 2.5–7 % low for D/4 ≤ W < D/2 (so k_b reads low there) and
   * worse below, where k_b can even come out negative (−0.9 % at W = 0.5 mm, D = 1.9 mm): then no k_b is given.
   */
  valid: boolean;
  /** D/4 ≤ W < D/2: loosely coupled, k_b reads low */
  loose: boolean;
}

/** Two traces of width w stacked on top of each other (gap d): broadside pair at H = mean(H₁, H₂). */
export function parallelRun(w: number, t: number, h1: number, d: number, h2: number, er: number): ParallelResult {
  const h = (h1 + h2) / 2;
  const r = broadside(w, d, h, t, er);
  return { ze: r.ze, zo: r.zo, zdiff: r.zdiff, kb: r.kb, h, exact: Math.abs(h1 - h2) <= 0.01 * h, valid: w >= d / 4 && r.kb > 0, loose: w < d / 2 };
}
