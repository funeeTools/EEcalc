/**
 * Padstack annular ring — pure model (no DOM, SI in/out). Plated (supported) holes.
 *
 * Minimum land (IPC-2221B §9.1.1, IPC-2222):   D_min = a + 2b + c
 *   a  largest hole the ring is measured from: the maximum finished hole on external layers, the drill on internal
 *      layers (the plating is not there yet when the inner layers are registered)
 *   b  minimum annular ring: IPC-2221B Table 9-2, supported holes, 0.050 mm external, 0.025 mm internal; the same
 *      figures are IPC-6012 Class 3 acceptance limits
 *   c  standard fabrication allowance for registration and drill wander, IPC-2221B / IPC-2222 Table 9-1:
 *      0.4 mm (level A), 0.25 mm (level B), 0.2 mm (level C)
 *
 * c covers the worst-case hole position, so the hole may sit e = c/2 off the pad centre. With a hole of radius r in a
 * pad of radius R, the narrowest ring is R − r − e; when that is negative the hole breaks out of the land over an arc
 * of the hole wall of 2φ, where e² + r² + 2er·cos φ = R² (plane geometry). The IPC-6012 annular-ring and breakout
 * requirements accept up to 90° of breakout for Class 2 and 180° for Class 1, so the minimum land for those classes is
 *   R = √(e² + r² + 2er·cos(θ/2)),  θ = allowed breakout.
 * Secondary checks of the class figures: Altium (Z. Peterson), "Meeting Standards: IPC-6012 Class 3 Via Sizes and
 * Annular Rings"; the IPC-2221 land formula and level allowances as quoted by fabricators' design guides.
 */

export type Req = 'c3' | 'c2t' | 'c2' | 'c1' | 'custom';

export interface Requirement {
  /** required ring (m) on the external / internal layers, when no breakout is allowed */
  bExt: number;
  bInt: number;
  /** allowed breakout angle (rad), 0 = none */
  theta: number;
}

export const REQS: Record<Exclude<Req, 'custom'>, Requirement> = {
  c3: { bExt: 50e-6, bInt: 25e-6, theta: 0 },
  c2t: { bExt: 0, bInt: 0, theta: 0 },
  c2: { bExt: 0, bInt: 0, theta: Math.PI / 2 },
  c1: { bExt: 0, bInt: 0, theta: Math.PI },
};

/** IPC-2221B Table 9-1 standard fabrication allowance by producibility level. */
export const LEVELS: Record<string, number> = { A: 0.4e-3, B: 0.25e-3, C: 0.2e-3 };

/** Minimum land diameter for a hole of diameter a, ring b / breakout theta, allowance c. */
export function minLand(a: number, b: number, theta: number, c: number): number {
  if (theta > 0) {
    const e = c / 2;
    const r = a / 2;
    return 2 * Math.sqrt(e * e + r * r + 2 * e * r * Math.cos(theta / 2));
  }
  return a + 2 * b + c;
}

/** Largest hole a pad of diameter D accepts (the inverse of minLand in a); ≤ 0 when none fits. */
export function maxHole(D: number, b: number, theta: number, c: number): number {
  if (theta > 0) {
    const e = c / 2;
    const R = D / 2;
    const ph = theta / 2;
    const disc = R * R - e * e * Math.sin(ph) ** 2;
    return disc > 0 ? 2 * (-e * Math.cos(ph) + Math.sqrt(disc)) : 0;
  }
  return D - 2 * b - c;
}

/** Narrowest ring (m) with the hole offset by e; negative = breakout. */
export function worstRing(D: number, a: number, e: number): number {
  return (D - a) / 2 - e;
}

/** Breakout arc of the hole wall (rad, 0…2π) with the hole offset by e from the pad centre. */
export function breakout(D: number, a: number, e: number): number {
  const R = D / 2;
  const r = a / 2;
  if (r <= 0) return 0;
  if (e <= 0) return r > R ? 2 * Math.PI : 0;
  const cphi = (R * R - e * e - r * r) / (2 * e * r);
  if (cphi >= 1) return 0;
  if (cphi <= -1) return 2 * Math.PI;
  return 2 * Math.acos(cphi);
}
