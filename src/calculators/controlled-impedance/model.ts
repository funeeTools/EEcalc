/**
 * Controlled impedance — pure model (no DOM, SI in/out) for five single-ended PCB structures.
 *
 *  • Surface microstrip: Hammerstad & Jensen, "Accurate Models for Microstrip Computer-Aided Design",
 *    IEEE MTT-S Digest 1980, pp. 407–409, with their strip-thickness correction (reused from microstrip/model).
 *  • Solder-mask-coated and embedded microstrip: the bare H&J line plus a cover-layer filling factor.
 *    The cover’s share of the field above the strip is Wan & Hoorfar’s multilayer filling factor q₂
 *    (C. Wan, A. Hoorfar, "Improved Design Equations for Multilayer Microstrip Lines", IEEE Microwave and
 *    Guided Wave Letters 10(6), June 2000, pp. 223–224, eqs. 2, 4–6, 8, 12–13; an extension of J. Svačina,
 *    "Analysis of Multilayer Microstrip Lines by a Conformal Mapping Method", IEEE T-MTT 40(4), 1992,
 *    pp. 769–772). The cover displaces air, so εeff rises by Δq·(εc − 1) (Bahl & Stuchly, "Analysis of a
 *    Microstrip Covered with a Lossy Dielectric", IEEE T-MTT 28(2), Feb. 1980, pp. 104–109). Δq is taken
 *    relative to the uncovered line so the correction vanishes at zero cover. The same decomposition is
 *    used by KiCad’s PCB calculator (transline_calculation_base.cpp, 2026).
 *  • Symmetric stripline: Cohn’s exact zero-thickness K/K′ result (S. B. Cohn, "Characteristic Impedance of
 *    the Shielded-Strip Transmission Line", IRE T-MTT 2, July 1954, pp. 52–57) with Cohn’s fringing-
 *    capacitance thickness correction around Wheeler’s thick strip (H. A. Wheeler, "Transmission-Line
 *    Properties of a Strip Line Between Parallel Planes", IEEE T-MTT 26(11), 1978, pp. 866–876) — the
 *    isolated-strip limit used by the edge-coupled stripline page (stripline-diff/model).
 *  • Grounded coplanar waveguide (conductor-backed CPW): conformal mapping, G. Ghione & C. Naldi,
 *    "Coplanar Waveguides for MMIC Applications: Effect of Upper Shielding, Conductor Backing, Finite-Extent
 *    Ground Planes, and Line-to-Line Coupling", IEEE T-MTT 35(3), 1987, pp. 260–267; R. N. Simons, Coplanar
 *    Waveguide Circuits, Components, and Systems, Wiley 2001, §2.4 eqs. 2.37–2.40. Copper thickness: the
 *    parallel-plate capacitance of the gap side walls, ε₀T/G per gap, added to the air side (Cohn 1955
 *    eq. 22; R. Garg, I. J. Bahl, "Characteristics of Coupled Microstriplines", IEEE T-MTT 27(7), 1979).
 *    Gupta’s equivalent-width correction was tried and rejected: it diverges once its Δ approaches G.
 *
 * Accuracy of each structure was measured on this page against a 2-D finite-volume Laplace solution
 * (graded mesh, 3-grid Richardson extrapolation; exact stripline reproduced to 0.03 %); see ACCURACY.
 */

import { C0, ETA0, microstripStatic, z0Air } from '../microstrip/model';
import { fringeCap, kRatio, wheelerZair } from '../stripline-diff/model';

export { C0, ETA0 };

export type Structure = 'ms' | 'mask' | 'emb' | 'sl' | 'cpwg';

export interface CiInputs {
  structure: Structure;
  /** trace width */
  w: number;
  /** dielectric height: substrate (microstrip, CPWG) or trace-to-each-plane (stripline) */
  h: number;
  /** copper thickness */
  t: number;
  er: number;
  /** solder-mask thickness (mask structure) */
  c: number;
  /** solder-mask permittivity */
  erm: number;
  /** cover dielectric above the trace top (embedded structure) */
  hc: number;
  /** cover permittivity (embedded structure) */
  erc: number;
  /** CPWG gap from trace edge to the coplanar ground */
  g: number;
}

export interface CiResult {
  z0: number;
  epsEff: number;
  /** Z₀ of the same conductors in air (sets L′) */
  zAir: number;
  /** Bare-microstrip values for the covered structures (mask / embedded); else equal to z0/epsEff */
  z0Bare: number;
  epsEffBare: number;
  /** filling factor increment of the cover (mask / embedded) */
  dq: number;
  /** stripline plane spacing b = 2H + T */
  b: number;
  /** CPWG: side-wall share of the air capacitance */
  cpwWall: number;
}

// ── Wan–Hoorfar multilayer filling factor ───────────────────────────────────────────────────────────

/** Wan–Hoorfar wide-strip branch (eqs. 2, 4, 5, 12). */
function whWide(u: number, hb: number): number {
  const we = u + (2 / Math.PI) * Math.log(17.08 * (u / 2 + 0.92)); // eq. 4
  const vb = (2 / Math.PI) * Math.atan(((2 * Math.PI) / (Math.PI * we - 4)) * (hb - 1)); // eq. 5
  const q1 = 1 - Math.log(Math.PI * we - 1) / (2 * we); // eq. 2
  const inner = (2 * we * Math.cos((Math.PI * vb) / 2)) / (2 * hb - 1 + vb) + Math.sin((Math.PI * vb) / 2);
  return 1 - q1 - ((1 - vb) / (2 * we)) * Math.log(inner); // eq. 12
}

/** Wan–Hoorfar narrow-strip branch (eqs. 6, 8, 13, with the ln(8/u) of their Table I). */
function whNarrow(u: number, hb: number): number {
  const ls = Math.log(8 / u);
  const q1 = 0.5 + 0.9 / (Math.PI * ls); // eq. 6
  const bj = (hb + 1) / (hb + u / 4 - 1); // eq. 8
  const arg = Math.min(1, Math.max(-1, (Math.sqrt(bj) * (hb - 1 + u / 8)) / hb));
  return 1 - q1 - (Math.log(bj) * Math.acos(arg)) / (4 * ls); // eq. 13
}

/** Half-width of the blend between the two branches, in ln u (±10 % in W/H around u = 1). */
const WH_BLEND = Math.log(1.1);

/**
 * Wan & Hoorfar (2000) filling factor q₂ of a cover layer whose top is at h₂ above the ground, for a
 * zero-thickness strip u = W/h on a substrate of height h (hb = h₂/h ≥ 1).
 *
 * The published wide (u ≥ 1) and narrow (u < 1) branches do not meet at u = 1: at C/H = 0.1 the jump makes a
 * coated 50 Ω line’s Z₀ step by +0.9 % and Z₀(W) non-monotonic (KiCad’s implementation has the same step).
 * This page smooths that published discontinuity by blending the two branches with a smoothstep in ln u over
 * 1/1.1 ≤ u ≤ 1.1; outside that band each branch is used as published.
 */
export function whQ2(u: number, hb: number): number {
  const x = Math.log(u) / WH_BLEND;
  if (x >= 1) return whWide(u, hb);
  if (x <= -1) return whNarrow(u, hb);
  const t = (x + 1) / 2;
  const sm = t * t * (3 - 2 * t);
  return (1 - sm) * whNarrow(u, hb) + sm * whWide(u, hb);
}

/** Share of the bare line’s air field taken over by a cover reaching hb = h₂/h (0 at hb = 1). */
export function coverDq(u: number, hb: number): number {
  return Math.max(0, whQ2(u, hb) - whQ2(u, 1));
}

/**
 * K(k)/K(k′) for k′ = e^lnKp. Below k′ = 1e-6 the asymptote K(k)/K(k′) = (2/π)·ln(4/k′) (error O(k′²)) is
 * used, so very wide strips (k′ underflowing to 0) still give the parallel-plate limit instead of ∞.
 */
export function kRatioLn(k: number, lnKp: number): number {
  if (lnKp < Math.log(1e-6)) return (2 / Math.PI) * (Math.log(4) - lnKp);
  return kRatio(k, Math.exp(lnKp));
}

// ── Stripline (centred, isolated) ───────────────────────────────────────────────────────────────────

/** Normalised capacitance C/ε of a centred strip W × t between planes b apart (Cohn 1954 + Wheeler 1978). */
export function striplineCap(w: number, b: number, t: number): number {
  const x = (Math.PI * w) / b;
  const u = Math.exp(-x);
  // exact, t = 0: 4K(k)/K(k′), k = tanh(πW/2b), k′ = sech(πW/2b) = 2√u/(1+u)
  const cs0 = 4 * kRatioLn((1 - u) / (1 + u), Math.LN2 - x / 2 - Math.log1p(u));
  if (!(t > 0)) return cs0;
  const csT = ETA0 / wheelerZair(w, b, t);
  const csW0 = ETA0 / wheelerZair(w, b, 0);
  const r = fringeCap(t / b) / fringeCap(0);
  return csT - r * (csW0 - cs0);
}

// ── CPWG ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Conductor-backed CPW normalised capacitances (C/ε₀) of the air side and the substrate side. Copper thickness
 * adds the parallel-plate capacitance of the two gap side walls, ε₀·T/G each, to the air side (the gaps are
 * air-filled) — the same side-wall term Cohn (1955, eq. 22) and Garg & Bahl use for coupled strips.
 */
export function cpwgParts(w: number, g: number, h: number, t: number): { air: number; sub: number; wall: number } {
  const k1 = w / (w + 2 * g);
  const wall = t > 0 ? (2 * t) / g : 0;
  const air = 2 * kRatio(k1, Math.sqrt((1 - k1) * (1 + k1))) + wall;
  // lower region: conformal map of the strip over a ground at depth h
  const A = (Math.PI * w) / (4 * h);
  const B = (Math.PI * (w + 2 * g)) / (4 * h);
  const ta = Math.tanh(A);
  const tb = Math.tanh(B);
  const k3 = ta / tb;
  // k3′ without cancellation: 1 − k3² = (tb − ta)(tb + ta)/tb², tb − ta = 2(e^−2A − e^−2B)/((1 + e^−2A)(1 + e^−2B)),
  // taken in logs so a trace many H wide (k3′ underflowing) still gives the parallel-plate limit
  const lnDiff = Math.LN2 - 2 * A + Math.log(-Math.expm1(-2 * (B - A))) - Math.log1p(Math.exp(-2 * A)) - Math.log1p(Math.exp(-2 * B));
  const lnK3p = 0.5 * (lnDiff + Math.log(tb + ta)) - Math.log(tb);
  const sub = 2 * kRatioLn(k3, lnK3p);
  return { air, sub, wall };
}

// ── Analysis ────────────────────────────────────────────────────────────────────────────────────────

export function analyse(i: CiInputs): CiResult {
  const out = (z0: number, epsEff: number, zAir: number, extra: Partial<CiResult> = {}): CiResult => ({ z0, epsEff, zAir, z0Bare: z0, epsEffBare: epsEff, dq: 0, b: NaN, cpwWall: 0, ...extra });
  switch (i.structure) {
    case 'ms': {
      const s = microstripStatic(i.w, i.h, i.t, i.er);
      return out(s.z0, s.epsEff, s.z0AirU1);
    }
    case 'mask':
    case 'emb': {
      const s = microstripStatic(i.w, i.h, i.t, i.er);
      const zAir = s.z0AirU1; // the cover changes only the dielectric: Z₀ = Z₀,air(u₁)/√εeff
      const hb = i.structure === 'mask' ? 1 + i.c / i.h : 1 + (i.t + i.hc) / i.h;
      const epsC = i.structure === 'mask' ? i.erm : i.erc;
      // Δq can never exceed the air share of the bare line, 1 − q_sub (the cap KiCad applies as well)
      const qSub = i.er > 1 ? Math.min(Math.max((s.epsEff - 1) / (i.er - 1), 0), 1) : 0;
      const dq = Math.min(coverDq(i.w / i.h, hb), 1 - qSub);
      const epsEff = s.epsEff + dq * (epsC - 1);
      return out(zAir / Math.sqrt(epsEff), epsEff, zAir, { z0Bare: s.z0, epsEffBare: s.epsEff, dq });
    }
    case 'sl': {
      const b = 2 * i.h + i.t;
      const zAir = ETA0 / striplineCap(i.w, b, i.t);
      return out(zAir / Math.sqrt(i.er), i.er, zAir, { b });
    }
    case 'cpwg': {
      const p = cpwgParts(i.w, i.g, i.h, i.t);
      const ca = p.air + p.sub;
      const c = p.air + i.er * p.sub;
      const epsEff = c / ca;
      const zAir = ETA0 / ca;
      return out(zAir / Math.sqrt(epsEff), epsEff, zAir, { cpwWall: p.wall / p.air });
    }
  }
}

/** Bare H&J microstrip air impedance (re-exported for graphs). */
export { z0Air };

/**
 * Accuracy against the 2-D field solution (percent, model − field)/field, measured by this page’s builder
 * (scratch fd.mjs, graded finite-volume mesh, 3-grid Richardson). The page shows the band of the structure.
 *   ms   : H&J 1980 claim 0.2 % in εeff (0.01–0.03 % in Z₀,air); field check −0.1…+0.2 % (t/h ≤ 0.35).
 *   mask : conformal mask C/H 0.0125–0.25, εm 3.5, W/H 0.5–4, T/H 0.05–0.35: +0.39…+2.05 %, capturing 36–86 % of
 *          the mask’s real effect (no mask down the trace side walls); an independent reviewer’s solver found
 *          +0.35…+1.31 % and 34–84 %. Stated band: +0.35…+2.1 %.
 *   emb  : planar cover T+Hc = 0.4–3.2 H, W/H 0.6–3: +1.1…+2.8 % (reads high; the cover’s pull is under-estimated).
 *   sl   : Cohn exact at t = 0; thick strip within 0.3 % to T/b 0.2 (stripline-diff field check), −1.1…+0.6 % to
 *          T/b 0.45 (builder and reviewer checks).
 *   cpwg : t = 0, G ≤ H: +0.1…+0.8 %; with copper (T/H 0.05–0.175, G/H 0.15–0.75, W/H 0.5–3): +1.0…+2.4 %;
 *          wide gaps read higher: +1.9 % at G = 1.5H, +4.7 % at G = 3H (t = 0).
 */
export const ACCURACY: Record<Structure, string> = {
  ms: '≈ ±0.2 %',
  mask: '+0.35 … +2.1 % (reads high)',
  emb: '+1.1 … +2.8 % (reads high)',
  sl: '≈ ±0.3 %',
  cpwg: '+0.1 … +2.4 % (reads high)',
};
