/**
 * Ohm's law and Joule heating for a linear resistor (pure functions, SI in/out).
 *
 *   V = I·R,   P = V·I = I²R = V²/R
 *
 * Any two of V, I, R, P fix the other two. V and I may be negative (passive sign convention: they carry
 * the same sign, so P ≥ 0); R > 0. When only R and P are known the sign of V is free; the caller passes
 * a sign hint (the previous V) so a page that switches the known pair keeps the polarity.
 *
 * Sources: G. S. Ohm, Die galvanische Kette, 1827; P. Horowitz, W. Hill, The Art of Electronics, 3rd
 * ed., 2015, §1.2.1–1.2.2 (Ohm's law, power in resistors); IEC 60115-1:2020 §2.2 (rated dissipation at
 * 70 °C, rated voltage U_r = √(P_r·R) capped by the limiting element voltage); Vishay CRCW e3 datasheet
 * (doc. 20035) for chip-size ratings (table imported from the voltage-divider model).
 */

import { CHIP_SIZES } from '@/calculators/voltage-divider/model';
import { POWER_RATINGS } from '@/core/eseries';

export type Q = 'v' | 'i' | 'r' | 'p';
export type Pair = 'vi' | 'vr' | 'vp' | 'ir' | 'ip' | 'rp';
export const PAIRS: Pair[] = ['vi', 'vr', 'vp', 'ir', 'ip', 'rp'];
export const QS: Q[] = ['v', 'i', 'r', 'p'];

export interface VIRP {
  v: number;
  i: number;
  r: number;
  p: number;
}

/** Thrown when the two known values do not describe a resistor (open, short, negative R…). */
export class NoSolution extends Error {}

/** The pair containing a and b, in canonical order. */
export function pairOf(a: Q, b: Q): Pair {
  return (QS.indexOf(a) < QS.indexOf(b) ? a + b : b + a) as Pair;
}

/** Solve V, I, R, P from the two known values in `pair`. `signHint` gives the sign of V (and I) for the R–P pair. */
export function solve(pair: Pair, x: Partial<VIRP>, signHint = 1): VIRP {
  const { v = NaN, i = NaN, r = NaN, p = NaN } = x;
  const sgn = signHint < 0 ? -1 : 1;
  switch (pair) {
    case 'vi':
      if (i === 0) throw new NoSolution(v === 0 ? 'V = 0 and I = 0 say nothing about R. Enter a non-zero voltage or current.' : 'I = 0 with a voltage across it is an open circuit (R → ∞). Enter a non-zero current.');
      if (v === 0) throw new NoSolution('V = 0 with current flowing is a short circuit (R = 0). Enter a non-zero voltage.');
      if (v * i < 0) throw new NoSolution('V and I have opposite signs, so the part would deliver power (R < 0). A resistor needs V and I of the same sign.');
      return { v, i, r: v / i, p: v * i };
    case 'vr':
      return { v, i: v / r, r, p: (v * v) / r };
    case 'ir':
      return { v: i * r, i, r, p: i * i * r };
    case 'vp':
      if (v === 0) throw new NoSolution(p === 0 ? 'V = 0 and P = 0 say nothing about R or I. Enter a non-zero voltage.' : 'A resistor with V = 0 cannot dissipate power. Enter a non-zero voltage.');
      if (p === 0) throw new NoSolution('P = 0 W with a voltage across it is an open circuit (R → ∞). Enter a non-zero power.');
      return { v, i: p / v, r: (v * v) / p, p };
    case 'ip':
      if (i === 0) throw new NoSolution(p === 0 ? 'I = 0 and P = 0 say nothing about R or V. Enter a non-zero current.' : 'A resistor with I = 0 cannot dissipate power. Enter a non-zero current.');
      if (p === 0) throw new NoSolution('P = 0 W with current flowing is a short circuit (R = 0). Enter a non-zero power.');
      return { v: p / i, i, r: p / (i * i), p };
    case 'rp':
      return { v: sgn * Math.sqrt(p * r), i: sgn * Math.sqrt(p / r), r, p };
    default:
      throw new Error(`Unknown known pair "${String(pair)}".`);
  }
}

/** A part whose rating the dissipation is checked against. */
export interface PartRating {
  id: string;
  label: string;
  /** Rated dissipation at 70 °C ambient, W */
  p: number;
  /** Limiting element voltage, V (null: not given for this class of part — check the datasheet) */
  vMax: number | null;
}

const fracW = (p: number) => ({ 0.0625: '1/16 W', 0.1: '1/10 W', 0.125: '1/8 W', 0.25: '1/4 W', 0.5: '1/2 W' })[p] ?? `${p} W`;

export const PARTS: PartRating[] = [
  ...CHIP_SIZES.map((c) => ({ id: c.size, label: `${c.size} chip · ${fracW(c.p)} · ${c.v} V`, p: c.p, vMax: c.v })),
  ...POWER_RATINGS.filter((p) => p >= 0.125).map((p) => ({ id: `w${p}`, label: `Leaded / power · ${fracW(p)}`, p, vMax: null })),
];

/** Derating used for the automatic pick and the yellow band: dissipate at most half the rating. */
export const DERATE = 0.5;

/** Smallest part (chips first, then leaded ratings) that runs at ≤ DERATE of its rating and within its voltage limit. */
export function autoPart(p: number, v: number): PartRating | null {
  return PARTS.find((x) => p <= DERATE * x.p && (x.vMax == null || Math.abs(v) <= x.vMax)) ?? null;
}

/** IEC 60115-1 rated (continuous) voltage of a resistor: √(P_r·R), capped by the limiting element voltage. */
export function ratedVoltage(part: PartRating, r: number): number {
  const u = Math.sqrt(part.p * r);
  return part.vMax != null ? Math.min(u, part.vMax) : u;
}

/** Critical resistance: above it the voltage limit, not the power rating, sets the maximum voltage. */
export function criticalResistance(part: PartRating): number | null {
  return part.vMax != null ? (part.vMax * part.vMax) / part.p : null;
}
