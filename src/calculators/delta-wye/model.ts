/**
 * Delta (Δ, Π) ↔ wye (Y, T, star) transformation of three-terminal networks (pure functions, SI in/out).
 *
 * Nodes A, B, C. Delta branches Z_AB, Z_BC, Z_CA; wye arms Z_A, Z_B, Z_C from each node to the star point.
 *
 *   Δ → Y:  Z_A = Z_AB·Z_CA / ΣΔ,  Z_B = Z_AB·Z_BC / ΣΔ,  Z_C = Z_BC·Z_CA / ΣΔ,   ΣΔ = Z_AB + Z_BC + Z_CA
 *   Y → Δ:  Z_AB = Π / Z_C,  Z_BC = Π / Z_A,  Z_CA = Π / Z_B,                   Π = Z_A Z_B + Z_B Z_C + Z_C Z_A
 *
 * Valid for complex impedances at one frequency (the derivation only uses Kirchhoff's laws and linearity).
 * Balanced: Z_Y = Z_Δ / 3.
 *
 * Sources: A. E. Kennelly, "Equivalence of triangles and three-pointed stars in conducting networks",
 * Electrical World and Engineer 34, 413–414 (1899); C. K. Alexander, M. N. O. Sadiku, Fundamentals of
 * Electric Circuits, 6th ed., 2017, §2.7 (resistive), ch. 9 (impedance combinations) and ch. 12 (balanced three-phase loads).
 */

export interface C {
  re: number;
  im: number;
}

export const cx = (re: number, im = 0): C => ({ re, im });
export const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
export const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export function div(a: C, b: C): C {
  // Smith's algorithm: avoids overflow / underflow for widely scaled parts
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    const r = b.im / b.re;
    const d = b.re + b.im * r;
    return { re: (a.re + a.im * r) / d, im: (a.im - a.re * r) / d };
  }
  const r = b.re / b.im;
  const d = b.re * r + b.im;
  return { re: (a.re * r + a.im) / d, im: (a.im * r - a.re) / d };
}
export const abs = (a: C): number => Math.hypot(a.re, a.im);
export const argDeg = (a: C): number => (Math.atan2(a.im, a.re) * 180) / Math.PI;

export interface Delta {
  ab: C;
  bc: C;
  ca: C;
}
export interface Wye {
  a: C;
  b: C;
  c: C;
}

/** Δ → Y. Throws when ΣΔ = 0 (series resonance of the loop: no equivalent star exists). */
export function deltaToWye(d: Delta): { y: Wye; sum: C } {
  const sum = add(add(d.ab, d.bc), d.ca);
  if (abs(sum) <= 1e-12 * Math.max(abs(d.ab), abs(d.bc), abs(d.ca))) throw new RangeError('The three delta branches add up to zero (all shorted, or a series-resonant loop): no equivalent star exists.');
  return { y: { a: div(mul(d.ab, d.ca), sum), b: div(mul(d.ab, d.bc), sum), c: div(mul(d.bc, d.ca), sum) }, sum };
}

/** Y → Δ. Throws when an arm is zero (that node is the star point: the delta branch opposite would be infinite). */
export function wyeToDelta(y: Wye): { d: Delta; prod: C } {
  const prod = add(add(mul(y.a, y.b), mul(y.b, y.c)), mul(y.c, y.a));
  const scale = Math.max(abs(y.a), abs(y.b), abs(y.c));
  for (const [k, z] of [['A', y.a], ['B', y.b], ['C', y.c]] as const) {
    if (abs(z) <= 1e-12 * scale) throw new RangeError(`Arm Z_${k} is zero: node ${k} is the star point itself, so the delta branch opposite it would be infinite.`);
  }
  return { d: { ab: div(prod, y.c), bc: div(prod, y.a), ca: div(prod, y.b) }, prod };
}

/** Series R–L–C branch at angular frequency w (c = null: no capacitor). */
export function branchZ(r: number, l: number, c: number | null, w: number): C {
  return { re: r, im: w * l - (c != null ? 1 / (w * c) : 0) };
}

/** Impedance between two terminals with the third left open. */
export function pairDelta(d: Delta): { ab: C; bc: C; ca: C } {
  const open = (z: C) => !Number.isFinite(z.re);
  const par = (z: C, a: C, b: C) => {
    if (open(a) || open(b)) return z; // the other path is open
    const s = add(a, b);
    if (open(z)) return s;
    return div(mul(z, s), add(z, s));
  };
  return { ab: par(d.ab, d.bc, d.ca), bc: par(d.bc, d.ca, d.ab), ca: par(d.ca, d.ab, d.bc) };
}
export function pairWye(y: Wye): { ab: C; bc: C; ca: C } {
  return { ab: add(y.a, y.b), bc: add(y.b, y.c), ca: add(y.c, y.a) };
}

/** Series equivalent at w: R and an inductance (X > 0) or capacitance (X < 0). */
export function seriesEquivalent(z: C, w: number): { r: number; l: number | null; c: number | null } {
  if (z.im > 0) return { r: z.re, l: z.im / w, c: null };
  if (z.im < 0) return { r: z.re, l: null, c: -1 / (w * z.im) };
  return { r: z.re, l: null, c: null };
}
