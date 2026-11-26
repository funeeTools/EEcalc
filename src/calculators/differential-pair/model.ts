/**
 * Edge-coupled microstrip differential pair — pure model (no DOM, SI in/out).
 *
 * Zero thickness — M. Kirschning, R. H. Jansen, "Accurate Wide-Range Design Equations for the Frequency-
 * Dependent Characteristic of Parallel Coupled Microstrip Lines", IEEE T-MTT 32(1), Jan. 1984, pp. 83–90
 * (corrections: T-MTT 33(3), Mar. 1985, p. 288): static even/odd εeff (their eqs. 3–4) and impedances
 * (eqs. 8–9 with Q₁…Q₁₀), built on the Hammerstad–Jensen single line. Stated accuracy 0.6 % (impedances)
 * for 0.1 ≤ u ≤ 10, 0.1 ≤ g ≤ 10, 1 ≤ εr ≤ 18. The formulas as written here were cross-checked against the
 * transcription in the Qucs technical documentation (§11, "Parallel coupled microstrip lines").
 *
 * Copper thickness — R. H. Jansen, "High-Speed Computation of Single and Coupled Microstrip Parameters
 * Including Dispersion, High-Order Modes, Loss and Finite Strip Thickness", IEEE T-MTT 26(2), Feb. 1978,
 * pp. 75–82: the even mode gains the fraction j = 1 − ½·exp(−0.69·Δw/Δt) of a single strip’s thickness
 * correction, and the odd mode additionally the side-wall term Δt = 2t·h/(s·εr). Jansen states these as
 * extra strip widths fed back into the zero-thickness formulas. Here the same increments are applied to
 * capacitances, in air and in the dielectric, as Hammerstad & Jensen do for the single line:
 * ΔC = j·[C_HJ(t) − C_HJ(0)] per mode, plus 2ε₀t/s (the side wall, an air gap) in the odd mode.
 * Why: against 2-D field solutions of 18 thick cross-sections (this builder) the width form errs Zdiff by
 * −2.5 … +5.1 % (+1.9 … +17 % as transcribed in Qucs, which mixes the widths), the capacitance form by
 * −0.85 … +1.3 %. The choice is driven by Zdiff; it costs some Zcm accuracy in places: an independent
 * reviewer’s 4-case check found width form Zcm −0.45 … −1.55 % against −0.68 … −3.8 % here (this builder’s
 * grid: width form −4.3 … −0.5 %, capacitance form −2.7 … −0.1 %).
 * C_HJ is the Hammerstad–Jensen single line with its thickness correction (microstrip/model).
 *
 * Accuracy against a 2-D finite-volume field solution (27 cross-sections, W/H 0.5–2, S/H 0.3–1.5, T/H 0–0.175,
 * εr 4.2; builder scratch fd.mjs): t = 0: Zdiff −0.15…+0.07 %, Zcm −0.22…+0.41 %; with copper: Zdiff
 * −0.85…+1.3 %, Zcm −2.7…+0.4 % (worst for 1 oz on 0.2 mm, narrow traces); an independent reviewer’s 4 thick
 * cases: Zdiff −0.71…+2.0 %, Zcm −0.68…−3.8 %. Stated: Zdiff −0.9…+2.0 %, Zcm −3.8…+0.4 %.
 */

import { C0, ETA0, epsEffHJ, microstripStatic, z0Air } from '../microstrip/model';

export { C0, ETA0 };

export interface CoupledMsResult {
  ze: number;
  zo: number;
  ee: number;
  eo: number;
  zdiff: number;
  zcm: number;
  /** backward voltage coupling (Ze − Zo)/(Ze + Zo) */
  kb: number;
  /** single isolated line (Hammerstad–Jensen with thickness) */
  z0: number;
  eeff0: number;
  /** zero-thickness KJ values */
  ze0: number;
  zo0: number;
  /** Jansen even-mode share of the thickness increment */
  j: number;
}

/** Kirschning–Jansen static even/odd parameters for zero-thickness strips, u = W/h, g = S/h. */
export function kjStatic(u: number, g: number, er: number): { ze: number; zo: number; ee: number; eo: number } {
  // even-mode εeff (KJ eq. 3): H&J εeff at a modified width v
  const v = (u * (20 + g * g)) / (10 + g * g) + g * Math.exp(-g);
  const ee = epsEffHJ(v, er);
  // odd-mode εeff (KJ eq. 4)
  const e0 = epsEffHJ(u, er);
  const d = 0.593 + 0.694 * Math.exp(-0.562 * u);
  const bo = (0.747 * er) / (0.15 + er);
  const co = bo - (bo - 0.207) * Math.exp(-0.414 * u);
  const ao = 0.7287 * (e0 - (er + 1) / 2) * (1 - Math.exp(-0.179 * u));
  const eo = ((er + 1) / 2 + ao - e0) * Math.exp(-co * g ** d) + e0;
  // single line, zero thickness
  const zl = z0Air(u) / Math.sqrt(e0);
  // even-mode impedance (KJ eq. 8)
  const q1 = 0.8695 * u ** 0.194;
  const q2 = 1 + 0.7519 * g + 0.189 * g ** 2.31;
  const q3 = 0.1975 + (16.6 + (8.4 / g) ** 6) ** -0.387 + Math.log(g ** 10 / (1 + (g / 3.4) ** 10)) / 241;
  const q4 = ((2 * q1) / q2) / (Math.exp(-g) * u ** q3 + (2 - Math.exp(-g)) * u ** -q3);
  const ze = (Math.sqrt(e0 / ee) * zl) / (1 - (zl * Math.sqrt(e0) * q4) / ETA0);
  // odd-mode impedance (KJ eq. 9)
  const q5 = 1.794 + 1.14 * Math.log(1 + 0.638 / (g + 0.517 * g ** 2.43));
  const q6 = 0.2305 + Math.log(g ** 10 / (1 + (g / 5.8) ** 10)) / 281.3 + Math.log(1 + 0.598 * g ** 1.154) / 5.1;
  const q7 = (10 + 190 * g * g) / (1 + 82.3 * g ** 3);
  const q8 = Math.exp(-6.5 - 0.95 * Math.log(g) - (g / 0.15) ** 5);
  const q9 = Math.log(q7) * (q8 + 1 / 16.5);
  const q10 = (q2 * q4 - q5 * Math.exp(Math.log(u) * q6 * u ** -q9)) / q2;
  const zo = (Math.sqrt(e0 / eo) * zl) / (1 - (zl * Math.sqrt(e0) * q10) / ETA0);
  return { ze, zo, ee, eo };
}

/** Normalised capacitances C/ε₀ (in the dielectric) and C_air/ε₀ from Z and εeff. */
const caps = (z: number, e: number) => ({ c: (ETA0 * Math.sqrt(e)) / z, a: ETA0 / (z * Math.sqrt(e)) });

export function coupledMicrostrip(w: number, s: number, h: number, t: number, er: number): CoupledMsResult {
  const u = w / h;
  const g = s / h;
  const z = kjStatic(u, g, er);
  const single = microstripStatic(w, h, t, er);
  let { ze, zo, ee, eo } = z;
  let j = 1;
  if (t > 0) {
    const thin = microstripStatic(w, h, 0, er);
    const sT = caps(single.z0, single.epsEff);
    const s0 = caps(thin.z0, thin.epsEff);
    const dC = sT.c - s0.c;
    const dA = sT.a - s0.a;
    // Jansen (1978): even-mode share of the single-strip width increase, from the dielectric-side Δw and Δt
    const dt = (2 * t * h) / (s * er);
    j = 1 - 0.5 * Math.exp((-0.69 * single.dur * h) / dt);
    const wall = (2 * t) / s; // 2ε₀t/s: odd-mode side wall facing the electric wall across an air gap
    const e = caps(z.ze, z.ee);
    const o = caps(z.zo, z.eo);
    const ce = e.c + j * dC;
    const ae = e.a + j * dA;
    const co = o.c + j * dC + wall;
    const ao = o.a + j * dA + wall;
    ze = ETA0 / Math.sqrt(ce * ae);
    zo = ETA0 / Math.sqrt(co * ao);
    ee = ce / ae;
    eo = co / ao;
  }
  return { ze, zo, ee, eo, zdiff: 2 * zo, zcm: ze / 2, kb: (ze - zo) / (ze + zo), z0: single.z0, eeff0: single.epsEff, ze0: z.ze, zo0: z.zo, j };
}
