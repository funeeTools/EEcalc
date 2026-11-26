/**
 * Balanced three-phase power (Y or Δ load) and the neutral current of an unbalanced 4-wire Y system.
 * Pure, SI in / SI out (angles in radians unless named …Deg).
 *
 * Sources:
 *  - C. K. Alexander, M. N. O. Sadiku, Fundamentals of Electric Circuits, ch. 12 (three-phase circuits):
 *    V_L = √3·V_ph and I_L = I_ph (Y); V_L = V_ph and I_L = √3·I_ph (Δ); P = √3·V_L·I_L·cos θ,
 *    Q = √3·V_L·I_L·sin θ, S = √3·V_L·I_L; constant total instantaneous power of a balanced system.
 *  - J. D. Glover, M. S. Sarma, T. J. Overbye, Power System Analysis and Design, ch. 2 (balanced three-phase,
 *    Δ–Y equivalent Z_Y = Z_Δ/3) and ch. 8 (symmetrical components: I₀, I₁, I₂ with a = 1∠120°).
 *  - IEEE Std 1459-2010, §3.2 (balanced three-phase: S = 3·V_ph·I_ph) — the sinusoidal-case definitions.
 *  - C. L. Fortescue, "Method of symmetrical co-ordinates applied to the solution of polyphase networks",
 *    Trans. AIEE 37 (1918) — sequence components.
 *
 * Sign convention: θ > 0 lagging (inductive), Q > 0. Phase sequence ABC: V_bn lags V_an by 120°.
 */

export type Conn = 'wye' | 'delta';
export type Side = 'lag' | 'lead';

export const SQ3 = Math.sqrt(3);

export interface Balanced {
  vph: number;
  iph: number;
  p: number;
  q: number;
  s: number;
  /** Load angle θ (rad), + lagging */
  theta: number;
  /** Per-phase load impedance (of the connection given): |Z|, R, X */
  z: number;
  r: number;
  x: number;
  /** Per-phase impedance of the equivalent Y load (= Z for Y, Z/3 for Δ) */
  zY: number;
}

/** θ from a PF in [0, 1] and its side. */
export const thetaOf = (pf: number, side: Side) => (side === 'lead' ? -1 : 1) * Math.acos(Math.min(1, Math.max(0, pf)));

export function balanced(vl: number, il: number, pf: number, side: Side, conn: Conn): Balanced {
  const vph = conn === 'wye' ? vl / SQ3 : vl;
  const iph = conn === 'wye' ? il : il / SQ3;
  const theta = thetaOf(pf, side);
  // cos θ = pf exactly (not cos(acos(pf))), so P = 0 at PF = 0 and P/S round-trips to the typed PF
  const c = Math.min(1, Math.max(0, pf));
  const sn = (side === 'lead' ? -1 : 1) * Math.sqrt(1 - c * c);
  const s = SQ3 * vl * il;
  const z = vph / iph;
  return { vph, iph, p: s * c, q: s * sn, s, theta, z, r: z * c, x: z * sn, zY: conn === 'wye' ? z : z / 3 };
}

/** Instantaneous power of one phase, p(t) = v(t)·i(t) with phase offset `shift` (rad). */
export function pInst(vph: number, iph: number, theta: number, w: number, t: number, shift: number): number {
  return 2 * vph * iph * Math.cos(w * t + shift) * Math.cos(w * t + shift - theta);
}

export interface Cx {
  re: number;
  im: number;
}

const polar = (mag: number, deg: number): Cx => ({ re: mag * Math.cos((deg * Math.PI) / 180), im: mag * Math.sin((deg * Math.PI) / 180) });
const add = (...z: Cx[]): Cx => z.reduce((a, b) => ({ re: a.re + b.re, im: a.im + b.im }), { re: 0, im: 0 });
const rot = (z: Cx, deg: number): Cx => {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return { re: z.re * c - z.im * s, im: z.re * s + z.im * c };
};
const mag = (z: Cx) => Math.hypot(z.re, z.im);
const argDeg = (z: Cx) => (Math.atan2(z.im, z.re) * 180) / Math.PI;

export interface Unbalanced {
  ia: Cx;
  ib: Cx;
  ic: Cx;
  /** Neutral current I_N = I_a + I_b + I_c (returning to the source) */
  in: Cx;
  inMag: number;
  inDeg: number;
  /** Sequence components (magnitudes) */
  i0: number;
  i1: number;
  i2: number;
}

/** Neutral current and symmetrical components from three line-current phasors (rms magnitude, degrees). */
export function unbalanced(ia: number, aDeg: number, ib: number, bDeg: number, ic: number, cDeg: number): Unbalanced {
  const A = polar(ia, aDeg);
  const B = polar(ib, bDeg);
  const C = polar(ic, cDeg);
  const n = add(A, B, C);
  const i1 = add(A, rot(B, 120), rot(C, 240));
  const i2 = add(A, rot(B, 240), rot(C, 120));
  return { ia: A, ib: B, ic: C, in: n, inMag: mag(n), inDeg: mag(n) > 1e-12 * Math.max(ia, ib, ic) ? argDeg(n) : 0, i0: mag(n) / 3, i1: mag(i1) / 3, i2: mag(i2) / 3 };
}
