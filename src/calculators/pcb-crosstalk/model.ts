/**
 * PCB crosstalk between two parallel traces — pure model (no DOM, SI in/out).
 *
 * Coupling from the per-unit-length L and C matrices of the pair (S. H. Hall and H. L. Heck, Advanced Signal
 * Integrity for High-Speed Digital Designs, Wiley 2009, ch. 4; E. Bogatin, Signal and Power Integrity —
 * Simplified, 2nd ed., Prentice Hall 2009, ch. 10), for an aggressor driven with a linear edge of rise time
 * t_r and a victim terminated in its characteristic impedance at both ends (weak coupling):
 *   backward (near-end) coefficient   K_b = ¼·(L_m/L + C_m/C)
 *   NEXT = K_b·min(1, 2·TD/t_r),       TD = ℓ·t_pd, t_pd = (√εe + √εo)/(2c): saturates once the coupled length passes
 *                                     L_sat = t_r/(2·t_pd)
 *   FEXT = ½·(C_m/C − L_m/L)·TD/t_r    (negative-going on microstrip, where L_m/L > C_m/C; zero in a
 *                                     homogeneous stripline, where L_m/L = C_m/C exactly)
 * L and C come from the even/odd modes: c·C_e,o = √εe,o/Z_e,o, c·L... = Z_e,o·√εe,o, with
 * L = (L_e + L_o)/2, L_m = (L_e − L_o)/2, C = (C_e + C_o)/2, C_m = (C_o − C_e)/2.
 * Modes:
 *   microstrip — Kirschning–Jansen coupled microstrip with Jansen's thickness rules
 *                (../edge-coupled-embedded/model.ts, no cover);
 *   stripline  — Cohn's coupled stripline (../stripline-diff/model.ts), centred, planes H above and below
 *                (b = 2H + T), εeff = εr for both modes.
 * Rule of thumb (labelled as such on the page): crosstalk ∝ 1/(1 + (D/H)²), D the centre-to-centre pitch
 * (H. W. Johnson & M. Graham, High-Speed Digital Design, Prentice Hall 1993, ch. 5 on crosstalk).
 */

import { coupledPair } from '@/calculators/edge-coupled-embedded/model';
import { coupledStripline } from '@/calculators/stripline-diff/model';

export const C0 = 299_792_458;

export type Topo = 'microstrip' | 'stripline';

export interface XtGeom {
  topo: Topo;
  w: number;
  s: number;
  /** trace to (nearest) plane */
  h: number;
  t: number;
  er: number;
}

export interface Coupling {
  ze: number;
  zo: number;
  ee: number;
  eo: number;
  l: number;
  lm: number;
  c: number;
  cm: number;
  /** self-characteristic impedance √(L/C) */
  z0: number;
  /** delay per metre: mean of the even- and odd-mode delays */
  tpd: number;
  kb: number;
  /** ½(C_m/C − L_m/L), signed */
  kf: number;
  /** Cohn odd-mode branch (stripline only) */
  branch?: string;
}

export function coupling(g: XtGeom): Coupling {
  let ze: number;
  let zo: number;
  let ee: number;
  let eo: number;
  let branch: string | undefined;
  if (g.topo === 'stripline') {
    const r = coupledStripline(g.w, g.s, 2 * g.h + g.t, g.t, g.er);
    ze = r.ze;
    zo = r.zo;
    ee = eo = g.er;
    branch = r.branch;
  } else {
    const r = coupledPair({ w: g.w, s: g.s, h: g.h, t: g.t, er: g.er, h2: 0, erc: 1 });
    ze = r.ze;
    zo = r.zo;
    ee = r.ee;
    eo = r.eo;
  }
  const ce = Math.sqrt(ee) / (C0 * ze);
  const co = Math.sqrt(eo) / (C0 * zo);
  const le = (ze * Math.sqrt(ee)) / C0;
  const lo = (zo * Math.sqrt(eo)) / C0;
  const l = (le + lo) / 2;
  const lm = (le - lo) / 2;
  const c = (ce + co) / 2;
  const cm = (co - ce) / 2;
  // homogeneous stripline: L_m/L = C_m/C to rounding; make FEXT exactly zero
  const kf = g.topo === 'stripline' ? 0 : 0.5 * (cm / c - lm / l);
  // Line delay: the mean of the two mode delays (an edge on one trace is half even, half odd mode). √(L·C) is not
  // the delay once the coupling is strong (in stripline it is √εr/c·(Z₀ₑ + Z₀ₒ)/(2√(Z₀ₑZ₀ₒ)), 15 % long at K_b = 0.25).
  const tpd = (Math.sqrt(ee) + Math.sqrt(eo)) / (2 * C0);
  return { ze, zo, ee, eo, l, lm, c, cm, z0: Math.sqrt(l / c), tpd, kb: 0.25 * (lm / l + cm / c), kf, branch };
}

/** NEXT (fraction of the aggressor swing) for coupled length ℓ and rise time t_r. */
export function nextOf(k: Coupling, len: number, tr: number): number {
  return k.kb * Math.min(1, (2 * len * k.tpd) / tr);
}

/**
 * FEXT magnitude (fraction of the swing). The linear law is the small-delay limit of the modal picture, in which
 * the far-end noise is ½·[r(t − T_e) − r(t − T_o)] (½ of the swing once the even and odd modes have fully
 * separated, |T_o − T_e| ≥ t_r); the cap at ½ keeps a very long or very fast run physical.
 */
export function fextOf(k: Coupling, len: number, tr: number): number {
  return Math.min(Math.abs(k.kf) * ((len * k.tpd) / tr), 0.5);
}

/** Coupled length beyond which NEXT stops growing. */
export function satLength(k: Coupling, tr: number): number {
  return tr / (2 * k.tpd);
}

/** Victim near- and far-end waveforms (fractions of the swing) for a linear edge: Bogatin's trapezoid and pulse. */
export function waveforms(k: Coupling, len: number, tr: number, t: number): { ne: number; fe: number; agg: number } {
  const ramp = (x: number) => Math.min(Math.max(x / tr, 0), 1);
  const td = len * k.tpd;
  const ne = k.kb * (ramp(t) - ramp(t - 2 * td));
  const fe = t >= td && t < td + tr ? Math.sign(k.kf) * fextOf(k, len, tr) : 0;
  return { ne, fe, agg: ramp(t - td) };
}

/**
 * Stripline K_b error (model − field)/field in %, against the builder's 2-D finite-volume solution (scratch fd/,
 * 141 cross-sections, W/H 0.2–5, S/H 0.1–5, T/b 0–0.2, b = 2H + T): zero thickness, and with copper for W/b ≥ 0.15
 * and below. Cohn's thickness correction (shared stripline-diff model) gives too little odd-mode/coupling change.
 */
export const STRIP_KB = { cases: 141, zero: [-2, 0.2], wide: [-26, 0.7], narrow: [-40, -3] } as const;
