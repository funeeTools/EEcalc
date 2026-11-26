/**
 * Current divider: N resistive branches in parallel, fed by an ideal current source or by a voltage
 * source with a series (source) resistance. Pure functions, SI in/out.
 *
 *   G = Σ G_j (G_j = 1/R_j),  share_j = I_j / I_total = G_j / G
 *   current source:  V_node = I / G
 *   voltage source:  V_node = V / (1 + R_s·G),  I_total = V_node·G
 *
 * Solving branch k (others fixed, G_o = Σ_{j≠k} G_j), all exact:
 *   for a share s:            G_k = G_o·s/(1 − s)
 *   for a current I_k (I src): G_k = I_k·G_o/(I − I_k)
 *   for a current I_k (V src): G_k = I_k·(1 + R_s·G_o)/(V − I_k·R_s)
 *
 * Sources: C. K. Alexander, M. N. O. Sadiku, Fundamentals of Electric Circuits, 6th ed., 2017, §2.6
 * (parallel resistors and current division) and §2.9 (ammeter shunts); P. Horowitz, W. Hill, The Art
 * of Electronics, 3rd ed., 2015, §1.2.2.
 */

export type Drive = 'i' | 'v';

export interface DividerOp {
  /** Voltage across the branches */
  vNode: number;
  /** Current into the branches */
  iTotal: number;
  /** Branch currents */
  i: number[];
  /** Branch shares I_j / I_total (G_j/G) */
  share: number[];
  /** Branch powers */
  p: number[];
  /** Power in the source resistance (voltage drive) */
  pRs: number;
  /** Parallel resistance of all branches */
  rp: number;
}

export function divide(rs: number[], drive: Drive, amount: number, rsrc = 0): DividerOp {
  const g = rs.map((r) => 1 / r);
  const gt = g.reduce((a, x) => a + x, 0);
  const vNode = drive === 'i' ? amount / gt : amount / (1 + rsrc * gt);
  const iTotal = vNode * gt;
  const i = g.map((x) => vNode * x);
  return { vNode, iTotal, i, share: g.map((x) => x / gt), p: g.map((x) => vNode * vNode * x), pRs: drive === 'v' ? iTotal * iTotal * rsrc : 0, rp: 1 / gt };
}

/** Conductance of all branches but k. */
export function gOthers(rs: number[], k: number): number {
  return rs.reduce((a, r, j) => (j === k ? a : a + 1 / r), 0);
}

/** R_k giving branch k the share s (0 < s < 1) of the total current; null if impossible. */
export function rForShare(rs: number[], k: number, s: number): number | null {
  const go = gOthers(rs, k);
  if (!(s > 0 && s < 1) || !(go > 0)) return null;
  return (1 - s) / (s * go);
}

/** R_k that carries the current ik; null if impossible. */
export function rForCurrent(rs: number[], k: number, ik: number, drive: Drive, amount: number, rsrc = 0): number | null {
  const go = gOthers(rs, k);
  let gk: number;
  if (drive === 'i') gk = (ik * go) / (amount - ik);
  else gk = (ik * (1 + rsrc * go)) / (amount - ik * rsrc);
  return gk > 0 && Number.isFinite(gk) ? 1 / gk : null;
}
