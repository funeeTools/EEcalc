/**
 * Maximum pad diameter — pure model (no DOM, SI in/out). The "maximum" counterpart of the padstack page: that
 * page sizes the smallest land a hole needs, this one the largest land the pitch allows.
 *
 * Channel arithmetic on the line joining two neighbouring pad centres (pitch p): the two half-pads, N conductors
 * of width W and N + 1 clearances s must fit in p, so
 *   D_max = p − N·W − (N+1)·s            (N = 0: pad-to-pad, D_max = p − s)
 * and, solved for the other unknowns,
 *   p_min = D + N·W + (N+1)·s,   s_max = (p − D − N·W)/(N+1),   W_max = (p − D − (N+1)·s)/N.
 * The same arithmetic is the BGA channel model (Intel AN 114 §1.3.4.1; Xilinx UG1099), imported from
 * ../bga-breakout/model rather than repeated. Published check: TI SPRAA99C (nFBGA Packaging, 2021) Figure 2-4,
 * 0.65 mm pitch, 0.35 mm NSMD land and one 0.100 mm line between lands → 0.100 mm copper clearance either side.
 *
 * Plated holes: the minimum land is IPC-2221B §9.1.1 D_min = a + 2b + c with the IPC-6012 class rules, imported
 * from ../annular-ring (model + minPads), so a pad between D_min and D_max both holds its ring and passes the
 * conductors. The ring a pad of D_max leaves is (D − a)/2 nominal and (D − a)/2 − c/2 at the worst-case drill
 * position.
 */

export { dMaxForN, wMaxForN, tracesInGap } from '@/calculators/bga-breakout/model';
export { maxHole, worstRing, breakout, LEVELS, REQS } from '@/calculators/annular-ring/model';

/** Smallest pitch that fits a pad D with N conductors W at clearance s. */
export const pitchFor = (d: number, w: number, s: number, n: number) => d + n * w + (n + 1) * s;

/** Largest uniform clearance s for a pad D on pitch p with N conductors W. */
export const clearanceFor = (p: number, d: number, w: number, n: number) => (p - d - n * w) / (n + 1);
