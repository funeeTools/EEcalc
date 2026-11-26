/**
 * Via voltage drop — pure model (no DOM, SI in/out).
 *
 * N identical plated vias in parallel carry a current I from one copper layer to another.
 *
 *  • Conductor cross-section: plated barrel A = π·t·(d − t) (annulus inside a drill d); a copper-filled via conducts
 *    through the whole hole, A = π·d²/4. Resin plugs and air add nothing.
 *  • Copper resistivity: ρ(T) = ρ20·[1 + α20·(T − 20 °C)], annealed copper ρ20 = 1.724e-8 Ω·m, α20 = 0.00393 /K
 *    (IEC 60028:1925, International Standard of Resistance for Copper).
 *  • Barrel resistance R_b = ρ·h/A (uniform current along a straight conductor).
 *  • Optional pads: current leaving the barrel radially through a pad of diameter D_pad and copper thickness t_pad to
 *    an equipotential edge (the pour or plane it joins): R_pad = ρ·ln(D_pad/d)/(2π·t_pad), the resistance of an annular
 *    disc with radial current (D. J. Griffiths, Introduction to Electrodynamics, 4th ed., §7.1.1, Ex. 7.2: coaxial
 *    radial resistance ln(b/a)/(2πσL)). One pad at each end of the via.
 *  • N vias in parallel: R = (R_b + 2·R_pad)/N; drop V = I·R; power P = I²·R.
 *  • Barrel temperature rise: 1-D conduction with uniform Joule heating in each barrel, both ends (the pads) held at the
 *    operating temperature. Peak rise at mid-length ΔT_max = q‴(h/2)²/(2k) = P_via·h/(8·k·A), mean rise (2/3)·ΔT_max
 *    (F. P. Incropera et al., Fundamentals of Heat and Mass Transfer, 7th ed., §3.5, plane wall with generation,
 *    eq. 3.42). End-to-end thermal resistance θ = h/(k·A) (Fourier, §3.1).
 *  • Self-heating (optional): the same rod with ρ(T) linear in temperature, so the heating grows where it is hotter.
 *    k·θ″ + J²·[ρ_op + ρ20·α·θ] = 0 with θ = 0 at both ends has the exact solution (m² = J²·ρ20·α/k, u = m·h/2,
 *    x from mid-length)  θ(x) = (ρ_op/(ρ20·α))·[cos(m·x)/cos(u) − 1], so
 *        R_b = R_op·tan(u)/u,   ΔT_max = (ρ_op/(ρ20·α))·(1/cos u − 1),   mean rise (ρ_op/(ρ20·α))·(tan(u)/u − 1)
 *    (the textbook linear-generation fin/rod equation, Incropera §3.5–3.6; it reduces to P·h/(8kA) as u → 0).
 *    No steady state (thermal runaway) once u reaches π/2, i.e. above J = π/h·√(k/(ρ20·α)).
 *    Without self-heating the copper is held at T_op and the rise is the uniform-generation P_via·h/(8kA).
 *  • Second opinion on heating: the barrel as a conductor of equal cross-section on the IPC-2221A Fig. 6-4 chart
 *    (external curve), as on the Via calculator page.
 */

import { RHO_CU_20, TEMPCO_CU, copperResistivity } from '@/physics/constants';

export { RHO_CU_20, TEMPCO_CU, copperResistivity };

export type ViaFill = 'none' | 'resin' | 'cu';

export interface DropInput {
  i: number;
  n: number;
  d: number;
  t: number;
  h: number;
  fill: ViaFill;
  /** include the radial resistance of the top and bottom pads */
  pads: boolean;
  pad: number;
  tPad: number;
  /** operating (pad / board) temperature, °C */
  tOp: number;
  /** evaluate the barrel at its mean self-heated temperature (true) or at tOp (false) */
  selfHeat: boolean;
  kCu: number;
}

export interface DropResult {
  area: number;
  /** barrel resistance at 20 °C and at its working temperature (Ω, one via) */
  rb20: number;
  rb: number;
  /** one pad (Ω), 0 when pads are off */
  rPad: number;
  /** one via including its pads (Ω) */
  rVia: number;
  /** all N vias in parallel (Ω) */
  r: number;
  v: number;
  p: number;
  iVia: number;
  pVia: number;
  /** barrel temperature rise above the pads: peak (mid-length) and mean (K) */
  dTmax: number;
  dTmean: number;
  /** temperature at which the barrel resistivity is evaluated (°C) */
  tc: number;
  rho: number;
  /** end-to-end thermal resistance of one barrel (K/W) */
  theta: number;
  /** current density in the barrel (A/m²) */
  j: number;
  /** true when self-heating has no steady state (no finite result) */
  runaway: boolean;
}

/** Copper cross-section carrying the current (m²). */
export function condArea(d: number, t: number, fill: ViaFill): number {
  return fill === 'cu' ? (Math.PI * d * d) / 4 : Math.PI * t * (d - t);
}

/** Radial resistance of an annular pad from the drill edge to the pad edge (Ω). */
export function padR(pad: number, d: number, tPad: number, rho: number): number {
  return pad > d ? (rho * Math.log(pad / d)) / (2 * Math.PI * tPad) : 0;
}

/** Current (A) at which the self-heated barrel has no steady state; Infinity without self-heating. */
export function runawayCurrent(p: Omit<DropInput, 'i'>): number {
  if (!p.selfHeat) return Infinity;
  const A = condArea(p.d, p.t, p.fill);
  // u = m·h/2 = π/2  →  J = (π/h)·√(k/(ρ20·α))
  return p.n * A * (Math.PI / p.h) * Math.sqrt(p.kCu / (RHO_CU_20 * TEMPCO_CU));
}

export function viaDrop(p: DropInput): DropResult {
  const A = condArea(p.d, p.t, p.fill);
  const rb20 = (RHO_CU_20 * p.h) / A;
  const iVia = p.i / p.n;
  const rhoOp = copperResistivity(p.tOp);
  const rOp = (rhoOp * p.h) / A;
  let rb: number;
  let dTmax: number;
  let dTmean: number;
  let runaway = false;
  if (p.selfHeat) {
    const u = ((iVia / A) * Math.sqrt((RHO_CU_20 * TEMPCO_CU) / p.kCu) * p.h) / 2;
    const s0 = rhoOp / (RHO_CU_20 * TEMPCO_CU);
    runaway = !(u < Math.PI / 2 * (1 - 1e-12));
    // tan(u)/u − 1 by its series for small u and 1/cos(u) − 1 = 2·sin²(u/2)/cos(u): no cancellation
    const u2 = u * u;
    const tu = u < 1e-2 ? u2 * (1 / 3 + u2 * (2 / 15 + u2 * (17 / 315 + (62 / 2835) * u2))) : Math.tan(u) / u - 1;
    const sec = (2 * Math.sin(u / 2) ** 2) / Math.cos(u);
    rb = runaway ? Infinity : rOp * (1 + tu);
    dTmax = runaway ? Infinity : s0 * sec;
    dTmean = runaway ? Infinity : s0 * tu;
  } else {
    rb = rOp;
    dTmax = (iVia * iVia * rb * p.h) / (8 * p.kCu * A);
    dTmean = (2 / 3) * dTmax;
  }
  const pVia = iVia * iVia * rb;
  const tc = p.selfHeat ? p.tOp + dTmean : p.tOp;
  const rPad = p.pads ? padR(p.pad, p.d, p.tPad, copperResistivity(p.tOp)) : 0;
  const rVia = rb + 2 * rPad;
  const r = rVia / p.n;
  return {
    area: A,
    rb20,
    rb,
    rPad,
    rVia,
    r,
    v: p.i * r,
    p: p.i * p.i * r,
    iVia,
    pVia,
    dTmax,
    dTmean,
    tc,
    rho: copperResistivity(tc),
    theta: p.h / (p.kCu * A),
    j: iVia / A,
    runaway,
  };
}
