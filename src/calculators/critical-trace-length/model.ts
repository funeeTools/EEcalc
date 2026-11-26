/**
 * Critical trace length — pure model (no DOM, SI in/out).
 *
 * A trace needs transmission-line treatment (controlled impedance, termination) once its one-way delay
 * TD = len·t_pd is no longer small against the signal rise time t_r. The criterion is a fraction 1/k:
 *   lumped while TD ≤ t_r/k   ⇔   len ≤ L_crit = t_r / (k·t_pd),   t_pd = √εeff / c.
 * Common k and where they come from:
 *   k = 2  round-trip delay equals the rise time (2·TD = t_r): the reflection from the far end returns
 *          before the edge has finished, the classic "electrically long" boundary (e.g. M. I. Montrose,
 *          EMC and the Printed Circuit Board, IEEE Press 1999, "Calculating trace lengths", l_max = t_r/(2·t′_pd); page not
 *          confirmed here).
 *   k = 5  E. Bogatin, Signal and Power Integrity — Simplified, 2nd ed., Prentice Hall 2009, ch. 8 (reflections and ringing):
 *          keep TD below 20 % of the rise time and an unterminated line rings by less than about 10 %.
 *   k = 6  H. W. Johnson & M. Graham, High-Speed Digital Design, Prentice Hall 1993, §1.3 (lumped vs distributed systems): "lumped vs
 *          distributed": a circuit behaves as lumped when it is shorter than 1/6 of the effective length of
 *          the rising edge, l_edge = t_r/t_pd.
 *   k = 3, 4, 10  other fractions in use (app notes quote anything from 1/2 to 1/20 of the rise time);
 *          k = 10 is a conservative margin for precision clocks.
 * Knee frequency: Johnson & Graham §1.1, f_knee = 0.5/t_r (10–90 % edge), the frequency below which
 * most of a digital edge's energy lies. Single-pole bandwidth: BW = 0.35/t_r (10–90 % rise of a first-order
 * low-pass, t_r = ln 9/(2π·f₃dB) = 0.3497/f₃dB; Bogatin 2009 ch. 2, "BW = 0.35/RT").
 * εeff: microstrip from Hammerstad & Jensen 1980 (src/calculators/microstrip/model.ts, static), stripline
 * εeff = εr (homogeneous dielectric).
 */

import { microstripStatic } from '@/calculators/microstrip/model';

export const C0 = 299_792_458;

/** The criterion presets offered on the page. */
export const K_PRESETS = [2, 3, 4, 5, 6, 10] as const;

export type Topology = 'microstrip' | 'stripline' | 'custom';

export interface LineInputs {
  topo: Topology;
  er: number;
  /** microstrip geometry (only for topo = microstrip) */
  w: number;
  h: number;
  t: number;
  /** effective permittivity when topo = custom */
  eeff: number;
}

/** Effective permittivity of the line. */
export function effPermittivity(p: LineInputs): number {
  if (p.topo === 'stripline') return p.er;
  if (p.topo === 'custom') return p.eeff;
  return microstripStatic(p.w, p.h, p.t, p.er).epsEff;
}

/** Propagation delay per metre (s/m). */
export function tpdOf(eeff: number): number {
  return Math.sqrt(eeff) / C0;
}

/** Critical length L_crit = t_r/(k·t_pd). */
export function criticalLength(tr: number, k: number, tpd: number): number {
  return tr / (k * tpd);
}

/** Knee frequency (Johnson & Graham) and single-pole bandwidth for a 10–90 % rise time. */
export function kneeFreq(tr: number): number {
  return 0.5 / tr;
}
export function bw35(tr: number): number {
  return 0.35 / tr;
}
