/**
 * Two-way passive loudspeaker crossover — pure model (no DOM), SI in/out.
 *
 * Each section is a voltage-driven (zero source impedance) LC ladder terminated in the driver, modelled as a
 * resistor R. Low-pass: series L, shunt C, series L, …; high-pass: series C, shunt L, … (the s → 1/s dual).
 * The ladder's transfer function is 1/(A + B/R) from its ABCD matrix, so element values follow from
 * matching the target denominator polynomial. For the normalised ladder (R = 1, ω_c = 1):
 *   order 1:  V_in/V_out = 1 + g₁s
 *   order 2:  1 + g₁s + g₁g₂s²
 *   order 3:  1 + (g₁+g₃)s + g₁g₂s² + g₁g₂g₃s³
 *   order 4:  1 + (g₁+g₃)s + (g₁g₂ + g₁g₄ + g₃g₄)s² + g₁g₂g₃s³ + g₁g₂g₃g₄s⁴
 * Targets: Butterworth (s+1), (s²+√2s+1), (s+1)(s²+s+1); Linkwitz–Riley (s+1)², (s²+√2s+1)²
 * (S. H. Linkwitz, "Active crossover networks for noncoincident drivers", JAES 24(1), 1976).
 * The resulting coefficients agree with the passive-crossover tables in R. M. Bullock, "Passive crossover
 * networks", and V. Dickason, The Loudspeaker Design Cookbook.
 */

import { abcdIdentity, abcdMul, abcdSeries, abcdShunt, add, cx, div, inv, mul, scale, sub, type Abcd, type Cx } from '@/core/math/complex';

export type XoverType = 'bw1' | 'bw2' | 'lr2' | 'bw3' | 'lr4';
export type Polarity = 'normal' | 'inverted';

const SQ2 = Math.SQRT2;

export interface Proto {
  label: string;
  order: number;
  /** normalised ladder values g₁…gₙ (series first) */
  g: number[];
  /** tweeter polarity that gives the intended summed response */
  polarity: Polarity;
  /** both polarities give a flat (all-pass) magnitude sum */
  eitherPolarity: boolean;
  /** each section's level at f_c (dB) */
  levelAtFc: number;
}

export const PROTOS: Record<XoverType, Proto> = {
  bw1: { label: '1st-order (6 dB/oct)', order: 1, g: [1], polarity: 'normal', eitherPolarity: true, levelAtFc: -3.0103 },
  bw2: { label: '2nd-order Butterworth', order: 2, g: [SQ2, 1 / SQ2], polarity: 'inverted', eitherPolarity: false, levelAtFc: -3.0103 },
  lr2: { label: '2nd-order Linkwitz–Riley', order: 2, g: [2, 0.5], polarity: 'inverted', eitherPolarity: false, levelAtFc: -6.0206 },
  bw3: { label: '3rd-order Butterworth', order: 3, g: [1.5, 4 / 3, 0.5], polarity: 'normal', eitherPolarity: true, levelAtFc: -3.0103 },
  lr4: { label: '4th-order Linkwitz–Riley', order: 4, g: [(4 * SQ2) / 3, 9 / (4 * SQ2), (2 * SQ2) / 3, 1 / (2 * SQ2)], polarity: 'normal', eitherPolarity: false, levelAtFc: -6.0206 },
};

export interface Part {
  ref: string;
  kind: 'L' | 'C';
  /** 'series' or 'shunt' */
  position: 'series' | 'shunt';
  value: number;
}

/** Ideal element values for one section at crossover frequency fc into a resistive driver R. */
export function sectionParts(type: XoverType, section: 'lp' | 'hp', fc: number, r: number): Part[] {
  const w = 2 * Math.PI * fc;
  const pre = section === 'lp' ? 'W' : 'T';
  let nl = 0;
  let nc = 0;
  return PROTOS[type].g.map((g, i) => {
    const series = i % 2 === 0;
    // Low-pass: series L = gR/ω, shunt C = g/(Rω). High-pass dual: series C = 1/(gRω), shunt L = R/(gω).
    const kind: 'L' | 'C' = (section === 'lp') === series ? 'L' : 'C';
    let value: number;
    if (section === 'lp') value = series ? (g * r) / w : g / (r * w);
    else value = series ? 1 / (g * r * w) : r / (g * w);
    const ref = `${kind}${kind === 'L' ? ++nl : ++nc}${pre}`;
    return { ref, kind, position: series ? 'series' : 'shunt', value };
  });
}

function partImpedance(p: Part, w: number): Cx {
  return p.kind === 'L' ? cx(0, w * p.value) : cx(0, -1 / (w * p.value));
}

function ladder(parts: Part[], w: number): Abcd {
  let m = abcdIdentity();
  for (const p of parts) {
    const z = partImpedance(p, w);
    m = abcdMul(m, p.position === 'series' ? abcdSeries(z) : abcdShunt(inv(z)));
  }
  return m;
}

/** Voltage transfer V_driver/V_amp and the input impedance of one section at frequency f. */
export function sectionResponse(parts: Part[], r: number, f: number): { h: Cx; zin: Cx } {
  const [a, b, c, d] = ladder(parts, 2 * Math.PI * f);
  const rl = cx(r);
  const h = inv(add(a, scale(b, 1 / r)));
  const zin = div(add(mul(a, rl), b), add(mul(c, rl), d));
  return { h, zin };
}

export interface XoverPoint {
  f: number;
  lp: Cx;
  hp: Cx;
  /** acoustic sum assuming flat, coincident, resistive drivers of equal sensitivity */
  sum: Cx;
  /** sum with the other tweeter polarity */
  sumOther: Cx;
  /** load the amplifier sees */
  zin: Cx;
}

export function evaluate(lp: Part[], hp: Part[], rW: number, rT: number, polarity: Polarity, f: number): XoverPoint {
  const a = sectionResponse(lp, rW, f);
  const b = sectionResponse(hp, rT, f);
  const plus = add(a.h, b.h);
  const minus = sub(a.h, b.h);
  return {
    f,
    lp: a.h,
    hp: b.h,
    sum: polarity === 'normal' ? plus : minus,
    sumOther: polarity === 'normal' ? minus : plus,
    zin: inv(add(inv(a.zin), inv(b.zin))),
  };
}

export const dB = (z: Cx): number => 20 * Math.log10(Math.max(Math.hypot(z.re, z.im), 1e-12));

/** L-pad for a tweeter: series and parallel resistors that attenuate by `atten` dB while presenting R. */
export function lPad(r: number, attenDb: number): { rs: number; rp: number } {
  const k = 10 ** (-attenDb / 20);
  return { rs: r * (1 - k), rp: k >= 1 ? Infinity : (r * k) / (1 - k) };
}
