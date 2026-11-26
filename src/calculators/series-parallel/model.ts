/**
 * Resistors in series and in parallel (pure functions, SI in/out).
 *
 *   series:   R_eq = Σ R_i              (same current, voltages add — Kirchhoff's voltage law)
 *   parallel: 1/R_eq = Σ 1/R_i          (same voltage, currents add — Kirchhoff's current law)
 *
 * R_eq is increasing and homogeneous of degree 1 in every R_i, so the tolerance extremes are all parts at
 * their low limit or all at their high limit. Log sensitivities: series S_i = R_i/R_eq, parallel
 * S_i = R_eq/R_i (both sum to 1).
 *
 * Sources: P. Horowitz, W. Hill, The Art of Electronics, 3rd ed., 2015, §1.2.2 (resistors in series and
 * parallel); C. K. Alexander, M. N. O. Sadiku, Fundamentals of Electric Circuits, 6th ed., 2017, §2.5–2.6;
 * IEC 60063 E-series.
 */

export type Topo = 'series' | 'parallel';

export function req(topo: Topo, rs: number[]): number {
  if (topo === 'series') return rs.reduce((a, r) => a + r, 0);
  return 1 / rs.reduce((a, r) => a + 1 / r, 0);
}

/** The resistor k that makes the network equal `target`, the others fixed; null when no positive value works. */
export function solveOne(topo: Topo, rs: number[], k: number, target: number): { r: number | null; limit: number } {
  const others = rs.filter((_, j) => j !== k);
  if (topo === 'series') {
    const sum = others.reduce((a, r) => a + r, 0);
    const r = target - sum;
    return { r: r > 0 ? r : null, limit: sum };
  }
  const g = others.reduce((a, r) => a + 1 / r, 0);
  const gk = 1 / target - g;
  return { r: gk > 0 ? 1 / gk : null, limit: g > 0 ? 1 / g : Infinity };
}

/** Log sensitivity ∂ln R_eq / ∂ln R_i. */
export function sensitivities(topo: Topo, rs: number[]): number[] {
  const r = req(topo, rs);
  return rs.map((x) => (topo === 'series' ? x / r : r / x));
}

/** Worst-case R_eq with each part at R_i(1 ± t_i). */
export function worstCase(topo: Topo, rs: number[], tols: number[]): { lo: number; hi: number } {
  return { lo: req(topo, rs.map((r, i) => r * (1 - tols[i]))), hi: req(topo, rs.map((r, i) => r * (1 + tols[i]))) };
}

/** Root-sum-square relative spread of R_eq for independent part errors ±t_i (first order). */
export function rssSpread(topo: Topo, rs: number[], tols: number[]): number {
  const s = sensitivities(topo, rs);
  return Math.sqrt(s.reduce((a, x, i) => a + (x * tols[i]) ** 2, 0));
}

export interface PartOp {
  v: number;
  i: number;
  p: number;
}

/** Per-resistor voltage, current and power for a voltage V across the network or a current I into it. */
export function operatingPoints(topo: Topo, rs: number[], drive: 'v' | 'i', amount: number): { v: number; i: number; parts: PartOp[] } {
  const r = req(topo, rs);
  const v = drive === 'v' ? amount : amount * r;
  const i = drive === 'v' ? amount / r : amount;
  const parts = rs.map((x) => {
    const pv = topo === 'series' ? i * x : v;
    const pi = topo === 'series' ? i : v / x;
    return { v: pv, i: pi, p: pv * pi };
  });
  return { v, i, parts };
}
