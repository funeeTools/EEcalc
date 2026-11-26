/**
 * BGA breakout (escape routing) — pure model (no DOM, SI in/out).
 *
 * Channel arithmetic: N traces of width w with clearance s between every two copper features fit in a
 * gap g between two obstacles (lands or via pads) when g ≥ N·w + (N+1)·s, so
 *   N = ⌊(g − s)/(w + s)⌋,   w_max(N) = (g − (N+1)·s)/N,   D_max(N) = p − N·w − (N+1)·s,
 * with g = p − D for obstacles of diameter D on pitch p (lands on the top layer, via pads on inner layers).
 * Rows escaped per signal layer = N + 1: the outer row leaves directly, each further row needs one more
 * trace through every channel outside it (Intel AN 114, "Board Design Guidelines for Intel Programmable
 * Device Packages", §1.3.4.1; Xilinx UG1099 "Recommended Design Rules and Strategies for BGA Devices").
 * Dog-bone fan-out puts the via at the centre of four balls, a distance p/√2 from each land, so the
 * copper clearance there is p/√2 − (D_land + D_via)/2.
 * Land sizing for collapsing (SAC) balls: IPC-7351B BGA land-pattern guidance — land about 20–25 % smaller
 * than the nominal ball (land/ball ≈ 0.75–0.80).
 */

export const SQRT2 = Math.SQRT2;

/** Traces that fit in a gap g (≥ 0); a tiny relative tolerance keeps an exact fit (w = w_max) counted. */
export function tracesInGap(g: number, w: number, s: number): number {
  if (!(g > s)) return 0;
  return Math.max(0, Math.floor((g - s) / (w + s) + 1e-9));
}

/** Widest trace for N traces in a gap g (may be ≤ 0: no fit). */
export const wMaxForN = (g: number, s: number, n: number) => (g - (n + 1) * s) / n;

/** Largest obstacle diameter on pitch p that still passes N traces of width w at clearance s. */
export const dMaxForN = (p: number, w: number, s: number, n: number) => p - n * w - (n + 1) * s;

/** Copper clearance between a dog-bone via pad (centre of four balls) and each surrounding land. */
export const dogboneClearance = (p: number, dLand: number, dVia: number) => p / SQRT2 - (dLand + dVia) / 2;

/** Signal layers needed to escape `rows` rows: the top layer takes nTop + 1 rows, each inner layer nIn + 1. */
export function layersNeeded(rows: number, nTop: number, nIn: number): { top: number; perInner: number; inner: number; total: number } {
  const top = Math.min(rows, nTop + 1);
  const perInner = nIn + 1;
  const inner = Math.ceil(Math.max(0, rows - top) / perInner);
  return { top, perInner, inner, total: 1 + inner };
}
