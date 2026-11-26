/**
 * Angle unit conversion — pure model (no DOM).
 *
 * Every unit is a fixed fraction of one full turn, so a conversion is one exact ratio:
 *   1 turn = 360° = 2π rad = 400 gon (grad) = 21 600′ = 1 296 000″ = 6400 mil (NATO).
 * Sources:
 *   BIPM, The International System of Units (SI Brochure), 9th ed. 2019, Table 8: 1° = (π/180) rad,
 *     1′ = (1/60)°, 1″ = (1/60)′ (non-SI units accepted for use with the SI).
 *   ISO 80000-3:2019, Quantities and units — Space and time, entry for plane angle (radian, degree, minute,
 *     second, gon = (π/200) rad) and the revolution (turn) as a unit of rotation.
 *   US Army FM 3-25.26, Map Reading and Land Navigation (2005), ch. 6 “Direction”: the NATO mil divides the circle into
 *     6400 mils (1° ≈ 17.78 mil); other mils (6000, 6300 per circle, or the true milliradian) are not used here.
 */

export type AngleUnit = 'deg' | 'rad' | 'grad' | 'turn' | 'arcmin' | 'arcsec' | 'mil';

/** Units in one full turn. */
export const PER_TURN: Record<AngleUnit, number> = {
  deg: 360,
  rad: 2 * Math.PI,
  grad: 400,
  turn: 1,
  arcmin: 360 * 60,
  arcsec: 360 * 3600,
  mil: 6400,
};

/** Convert x from unit a to unit b (one multiplication by an exact ratio). */
export function convert(x: number, a: AngleUnit, b: AngleUnit): number {
  if (a === b) return x;
  // Degree-based units keep exact decimal ratios (e.g. 1.5° → 90′ without a 360/360 round trip).
  return (x * PER_TURN[b]) / PER_TURN[a];
}

export interface Dms {
  sign: 1 | -1;
  d: number;
  m: number;
  s: number;
}

/** Degrees → sign, whole degrees, whole minutes, seconds (seconds rounded to 1e-9″ to absorb float noise). */
export function toDms(deg: number): Dms {
  const sign: 1 | -1 = deg < 0 ? -1 : 1;
  let total = Math.abs(deg) * 3600;
  total = Math.round(total * 1e9) / 1e9;
  let d = Math.floor(total / 3600);
  let m = Math.floor((total - d * 3600) / 60);
  let s = total - d * 3600 - m * 60;
  s = Math.round(s * 1e9) / 1e9;
  if (s >= 60) {
    s -= 60;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    d += 1;
  }
  return { sign: total === 0 ? 1 : sign, d, m, s };
}

export function fromDms(x: Dms): number {
  return x.sign * (x.d + x.m / 60 + x.s / 3600);
}

/** Normalise degrees to [0, 360); values already in range are returned unchanged. */
export function norm360(deg: number): number {
  if (deg >= 0 && deg < 360) return Object.is(deg, -0) ? 0 : deg;
  const r = deg % 360;
  const v = r < 0 ? r + 360 : r;
  // r + 360 can round up to exactly 360 for tiny negative r
  return v >= 360 || Object.is(v, -0) ? 0 : v;
}

/** Normalise degrees to (−180, 180]; values already in range are returned unchanged (no round trip through 0–360). */
export function norm180(deg: number): number {
  if (deg > -180 && deg <= 180) return Object.is(deg, -0) ? 0 : deg;
  const r = deg % 360;
  if (r > -180 && r <= 180) return Object.is(r, -0) ? 0 : r;
  return r > 180 ? r - 360 : r + 360;
}

/**
 * sin, cos, tan of an angle given in degrees. The angle is reduced to [0, 360) first and exact multiples
 * of 90° return exact 0 / ±1 (and tan = null where cos = 0), so sin 180° is 0, not 1.2e-16.
 */
export function trig(deg: number): { sin: number; cos: number; tan: number | null } {
  const a = norm360(deg);
  if (a % 90 === 0) {
    const q = a / 90;
    const sin = [0, 1, 0, -1][q];
    const cos = [1, 0, -1, 0][q];
    return { sin, cos, tan: cos === 0 ? null : sin / cos };
  }
  const r = (a * Math.PI) / 180;
  return { sin: Math.sin(r), cos: Math.cos(r), tan: Math.tan(r) };
}

/** Quadrant 1–4 of a normalised angle, or 0 when it lies on an axis. */
export function quadrant(deg360: number): 0 | 1 | 2 | 3 | 4 {
  if (deg360 % 90 === 0) return 0;
  return (Math.floor(deg360 / 90) + 1) as 1 | 2 | 3 | 4;
}

/** Reference angle (acute angle to the x axis), degrees; computed from the ±180° form so tiny angles keep their precision. */
export function referenceAngle(deg: number): number {
  const a = Math.abs(norm180(deg));
  return a > 90 ? 180 - a : a;
}
