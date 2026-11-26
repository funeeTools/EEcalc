/**
 * Edge-coupled (embedded) microstrip pair — pure model (no DOM, SI in/out).
 *
 * Two strips W × T, edge gap S, on a substrate of height H (εr) over one ground plane, optionally buried
 * under a planar dielectric cover (εrc) whose top is H₂ above the copper. Quasi-static (quasi-TEM): every
 * mode impedance is Z = Z_air/√εeff, with Z_air the same geometry in vacuum.
 *
 * Pieces, each from a published source:
 *  • Single strip, zero thickness: E. Hammerstad & Ø. Jensen, "Accurate Models for Microstrip Computer-Aided
 *    Design", IEEE MTT-S Digest 1980, pp. 407–409 (Z_air(u), εeff(u, εr), thickness widening Δu₁, Δu_r).
 *  • Coupled strips, zero thickness: M. Kirschning & R. H. Jansen, "Accurate Wide-Range Design Equations for
 *    the Frequency-Dependent Characteristic of Parallel Coupled Microstrip Lines", IEEE Trans. MTT-32(1),
 *    Jan. 1984, pp. 83–90, static part (εeff,e, εeff,o; Q₁…Q₁₀). Stated: impedances within 0.6 %, 0.1 ≤ u ≤ 10,
 *    0.1 ≤ g ≤ 10, 1 ≤ εr ≤ 18. Their Z_e/Z_o factor into an εr-free air part and εeff, which this file uses.
 *  • Finite thickness, even mode: R. H. Jansen, "High-Speed Computation of Single and Coupled Microstrip
 *    Parameters Including Dispersion, High-Order Modes, Loss and Finite Strip Thickness", IEEE Trans. MTT-26(2),
 *    Feb. 1978, pp. 75–82: the even mode keeps only part of the single-strip widening as the gap closes,
 *    W_e = W + ΔW·(1 − ½·exp(−0.69·ΔW/Δt)), Δt = 2TH/(Sεr) (as given in the Qucs technical papers §11), with
 *    ΔW from Hammerstad–Jensen.
 *  • Finite thickness, odd mode: the parallel-plate capacitance of the two facing copper walls to the odd-mode
 *    virtual ground, 2ε·T/S, from S. B. Cohn, "Shielded Coupled-Strip Transmission Line", IRE Trans. MTT-3(5),
 *    Oct. 1955, eq. 22, filled with the cover dielectric (air for a bare pair).
 *  • Cover: the embedded-microstrip burial correction εeff' = εr − (εr − εeff)·exp(−2d/H), d the dielectric
 *    depth over the substrate surface (here H₂ + T), attributed to B. C. Wadell, Transmission Line Design
 *    Handbook, Artech House 1991, §3.5.4 — as restated in the open-source pcb-toolkit (docs.rs/pcb-toolkit,
 *    impedance/embedded.rs); not checked against the book. Its error is measured here against a field solver.
 *    Written as filling factors (Wheeler / J. Svačina, IEEE Trans. MTT-40(4), 1992, pp. 769–772),
 *    εeff' = 1 + q(εr − 1) + (1 − q)·q_c·(εrc − 1), q = (εeff − 1)/(εr − 1), q_c = 1 − exp(−2d/H), which is
 *    the same formula when εrc = εr and lets the cover differ from the substrate. Applied to each mode.
 *
 * Accuracy of the combination, against this project's 2-D finite-volume field solution (Richardson-
 * extrapolated, 3 grids; builder scratch fd/): see ACCURACY below and the theory section.
 */

export const C0 = 299_792_458;
export const ETA0 = 376.730313668;

/** Hammerstad–Jensen: impedance of a zero-thickness strip of width u = W/H in vacuum. */
export function zAirHJ(u: number): number {
  const f = 6 + (2 * Math.PI - 6) * Math.exp(-((30.666 / u) ** 0.7528));
  return (ETA0 / (2 * Math.PI)) * Math.log(f / u + Math.sqrt(1 + (2 / u) ** 2));
}

/** Hammerstad–Jensen: static εeff of a zero-thickness strip. */
export function epsHJ(u: number, er: number): number {
  const a = 1 + Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49 + Math.log(1 + (u / 18.1) ** 3) / 18.7;
  const b = 0.564 * ((er - 0.9) / (er + 3)) ** 0.053;
  return (er + 1) / 2 + ((er - 1) / 2) * (1 + 10 / u) ** (-a * b);
}

/** Kirschning–Jansen static even- and odd-mode εeff (zero thickness). */
export function kjEps(u: number, g: number, er: number): { e: number; o: number } {
  const v = (u * (20 + g * g)) / (10 + g * g) + g * Math.exp(-g);
  const e = epsHJ(v, er);
  const e1 = epsHJ(u, er);
  const ao = 0.7287 * (e1 - (er + 1) / 2) * (1 - Math.exp(-0.179 * u));
  const bo = (0.747 * er) / (0.15 + er);
  const co = bo - (bo - 0.207) * Math.exp(-0.414 * u);
  const dO = 0.593 + 0.694 * Math.exp(-0.562 * u);
  const o = ((er + 1) / 2 + ao - e1) * Math.exp(-co * g ** dO) + e1;
  return { e, o };
}

/** Kirschning–Jansen Q₄ (even) and Q₁₀ (odd): Z_mode,air = Z_air/(1 − Z_air·Q/η₀). Independent of εr. */
export function kjQ(u: number, g: number): { q4: number; q10: number } {
  const q1 = 0.8695 * u ** 0.194;
  const q2 = 1 + 0.7519 * g + 0.189 * g ** 2.31;
  const q3 = 0.1975 + (16.6 + (8.4 / g) ** 6) ** -0.387 + Math.log(g ** 10 / (1 + (g / 3.4) ** 10)) / 241;
  const q4 = ((q1 / q2) * 2) / (Math.exp(-g) * u ** q3 + (2 - Math.exp(-g)) * u ** -q3);
  const q5 = 1.794 + 1.14 * Math.log(1 + 0.638 / (g + 0.517 * g ** 2.43));
  const q6 = 0.2305 + Math.log(g ** 10 / (1 + (g / 5.8) ** 10)) / 281.3 + Math.log(1 + 0.598 * g ** 1.154) / 5.1;
  const q7 = (10 + 190 * g * g) / (1 + 82.3 * g ** 3);
  const q8 = Math.exp(-6.5 - 0.95 * Math.log(g) - (g / 0.15) ** 5);
  const q9 = Math.log(q7) * (q8 + 1 / 16.5);
  const q10 = (q2 * q4 - q5 * Math.exp(Math.log(u) * q6 * u ** -q9)) / q2;
  return { q4, q10 };
}

/** Even/odd air impedances of a zero-thickness pair (KJ). */
export function kjZair(u: number, g: number): { e: number; o: number } {
  const za = zAirHJ(u);
  const { q4, q10 } = kjQ(u, g);
  return { e: za / (1 - (za * q4) / ETA0), o: za / (1 - (za * q10) / ETA0) };
}

/** Hammerstad–Jensen thickness widening (normalised to H): Δu₁ in vacuum, Δu_r in the dielectric. */
export function hjWidening(u: number, tn: number, er: number): { du1: number; dur: number } {
  if (!(tn > 0)) return { du1: 0, dur: 0 };
  const coth = 1 / Math.tanh(Math.sqrt(6.517 * u));
  const du1 = (tn / Math.PI) * Math.log(1 + (4 * Math.E) / (tn * coth * coth));
  return { du1, dur: 0.5 * (1 + 1 / Math.cosh(Math.sqrt(Math.max(er - 1, 0)))) * du1 };
}

export interface PairInputs {
  w: number;
  s: number;
  /** substrate height, trace to plane */
  h: number;
  t: number;
  er: number;
  /** cover thickness above the copper top (0 = cover only fills the gap up to the copper top) */
  h2: number;
  /** cover permittivity (1 = bare microstrip) */
  erc: number;
}

export interface PairResult {
  ze: number;
  zo: number;
  /** effective permittivities with the cover */
  ee: number;
  eo: number;
  /** air impedances (all dielectrics removed) */
  zea: number;
  zoa: number;
  /** bare-pair (no cover) εeff */
  eeBare: number;
  eoBare: number;
  /** cover filling factor q_c */
  qc: number;
  zdiff: number;
  zcm: number;
  /** backward coupling (Ze − Zo)/(Ze + Zo) */
  k: number;
  /** per-unit-length matrices (H/m, F/m): self and mutual */
  l11: number;
  lm: number;
  c11: number;
  cm: number;
}

/** Normalised widths for the even mode (Jansen 1978) in vacuum (1) and in the dielectric (r). */
function evenWidths(u: number, g: number, tn: number, er: number): { u1: number; ur: number } {
  const { du1, dur } = hjWidening(u, tn, er);
  if (!(tn > 0)) return { u1: u, ur: u };
  const w = (du: number, e: number) => {
    const dt = (2 * tn) / (g * e);
    return u + du * (1 - 0.5 * Math.exp((-0.69 * du) / dt));
  };
  return { u1: w(du1, 1), ur: w(dur, er) };
}

/** Coupled (embedded) microstrip pair. */
export function coupledPair(p: PairInputs): PairResult {
  const u = p.w / p.h;
  const g = p.s / p.h;
  const tn = p.t / p.h;
  const { u1, ur } = evenWidths(u, g, tn, p.er);
  const epsR = kjEps(ur, g, p.er);
  const air1 = kjZair(u1, g);
  const airR = kjZair(ur, g);
  // Hammerstad–Jensen composition per mode: Z = Z_air(u_r)/√εeff(u_r), εeff = εeff(u_r)·(Z_air(u₁)/Z_air(u_r))²
  const eeBare = epsR.e * (air1.e / airR.e) ** 2;
  const eoKJ = epsR.o * (air1.o / airR.o) ** 2;
  const qc = 1 - Math.exp((-2 * (p.h2 + p.t)) / p.h);
  const cover = (eb: number) => {
    const q = p.er - 1 > 1e-9 ? (eb - 1) / (p.er - 1) : 0;
    return 1 + q * (p.er - 1) + (1 - q) * qc * (p.erc - 1);
  };
  const ee = cover(eeBare);
  const eoNoGap = cover(eoKJ);
  // odd mode: facing copper walls add 2εT/S to the virtual ground (vacuum: c·C = 1/Z_air)
  const cg = (2 * tn) / g / ETA0;
  const cAirO = 1 / air1.o + cg;
  const cDieO = eoNoGap / air1.o + p.erc * cg;
  const eo = cDieO / cAirO;
  const eoBare = (eoKJ / air1.o + cg) / cAirO;
  const zea = air1.e;
  const zoa = 1 / cAirO;
  const ze = zea / Math.sqrt(ee);
  const zo = zoa / Math.sqrt(eo);
  // L and C matrices from the modes (symmetric pair): c·C = √ε/Z, L/μ… = Z√ε/c
  const ce = Math.sqrt(ee) / (C0 * ze);
  const co = Math.sqrt(eo) / (C0 * zo);
  const le = (ze * Math.sqrt(ee)) / C0;
  const lo = (zo * Math.sqrt(eo)) / C0;
  return {
    ze,
    zo,
    ee,
    eo,
    zea,
    zoa,
    eeBare,
    eoBare,
    qc,
    zdiff: 2 * zo,
    zcm: ze / 2,
    k: (ze - zo) / (ze + zo),
    l11: (le + lo) / 2,
    lm: (le - lo) / 2,
    c11: (ce + co) / 2,
    cm: (co - ce) / 2,
  };
}

/** The same strip alone (gap → ∞): the Kirschning–Jansen modes both tend to the single strip. */
export function singleStrip(p: PairInputs): { z: number; eeff: number } {
  const r = coupledPair({ ...p, s: 1e3 * p.h });
  return { z: r.ze, eeff: r.ee };
}

/** Range of the 2-D field-solver check (normalised to H). */
export const CHECKED = { uMin: 0.2, uMax: 5, gMin: 0.1, gMax: 5, tMax: 0.4, h2Max: 3, erMin: 3, erMax: 4.8 };

/**
 * Error of this model against the 2-D finite-volume field solution (builder scratch fd/, Richardson-extrapolated
 * from three grids), (model − field)/field in %, over random cross-sections inside CHECKED (εr 3–4.8, cover εr
 * 1–4.8, H₂/H 0–3, T/H 0.02–0.4). `core`: the usual PCB region S ≥ 0.2H and T ≤ 0.25H; `all`: the whole check.
 * The largest errors: thick copper in a narrow gap (Zdiff low) and very narrow gaps under a thin cover (Zdiff high,
 * where the cover's reach into the gap is set by H rather than by S).
 */
export const ACCURACY = {
  cases: 400,
  core: { gMin: 0.2, tMax: 0.25, zdiff: [-4.8, 4.6] as const, zcm: [-4.0, 3.3] as const },
  all: { zdiff: [-6.6, 7.4] as const, zcm: [-5.1, 3.3] as const },
};
