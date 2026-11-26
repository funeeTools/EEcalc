/**
 * Current mirrors — pure model, SI in/out. Voltages are magnitudes measured from the mirror's own rail
 * (ground for an NPN/NMOS sink, V_CC for a PNP/PMOS source), so one set of equations serves both.
 *
 * BJT (forward-active Gummel–Poon without high-injection terms, as in SPICE with IS, BF, VAF):
 *   I_e = A·I_S·exp(V_BE/V_T),  I_C = I_e·(1 + V_CE/V_A),  I_B = I_e/β
 * Basic, degenerated (R_E in both emitters, R_E2 = R_E/N) and Widlar (R_E in the output emitter only)
 * mirrors are one circuit: Q1 diode-connected, V_BE1 + I_E1·R_E1 = V_BE2 + I_E2·R_E2, and
 * I_ref = I_C1 + I_B1 + I_B2 (Gray, Hurst, Lewis & Meyer, Analysis and Design of Analog ICs 5e, §4.2.2,
 * §4.4.1; Sedra & Smith 7e §8.2, §8.6). The Widlar equation V_T·ln(I_C1/I_C2) = I_E2·R_E is solved, not
 * approximated. Wilson (three transistors, Gray & Meyer §4.4.3): KCL at both internal nodes with the same
 * device law; it reproduces I_out/I_ref = 1 − 2/(β² + 2β + 2) for V_A → ∞ and R_out ≈ β·r_o/2.
 * MOSFET (square law with channel-length modulation, Shichman–Hodges / SPICE level 1):
 *   I_D = ½·k′·(W/L)·(V_GS − V_t)²·(1 + λ·V_DS)
 * Simple and cascode mirrors (Sedra & Smith §8.2, §8.5; Razavi, Design of Analog CMOS ICs 2e, ch. 5).
 * Body effect, temperature drift of I_S / V_t and device mismatch are not modelled.
 */

import { brent } from '@/core/calc/solve';

export type Topo = 'bjt-basic' | 'bjt-degen' | 'bjt-wilson' | 'bjt-widlar' | 'mos-simple' | 'mos-cascode';
export const isBjt = (t: Topo) => t.startsWith('bjt');

export const Q_E = 1.602176634e-19;
export const K_B = 1.380649e-23;
export const thermalVoltage = (tC: number) => (K_B * (tC + 273.15)) / Q_E;

export interface Bjt {
  is: number;
  beta: number;
  va: number;
  vt: number;
}

export interface Mos {
  /** k′ = µ·C_ox, A/V² */
  kp: number;
  /** W/L of the reference device */
  wl: number;
  vt: number;
  lambda: number;
}

export interface MirrorPoint {
  iref: number;
  iout: number;
  /** Voltage across the reference branch (from the rail to the node R_ref drives) */
  vRef: number;
  /** Device details for the report */
  vbe1?: number;
  vbe2?: number;
  ic1?: number;
  ic2?: number;
  ie2?: number;
  vgs?: number;
  vov?: number;
  /** Cascode: drain voltage of the bottom output device */
  vx?: number;
  /** Lowest output voltage (from the rail) that keeps every output device active / saturated */
  vMin: number;
}

/** Fixed point I_e1·(1 + 1/β + V_BE1/V_A) = r for the diode-connected Q1 (contraction ~V_T/V_A). */
function solveIe1(b: Bjt, r: number): number {
  let ie = r / (1 + 1 / b.beta);
  for (let k = 0; k < 60; k++) {
    const vbe = b.vt * Math.log(ie / b.is);
    const nx = r / (1 + 1 / b.beta + vbe / b.va);
    if (Math.abs(nx - ie) <= 1e-15 * ie) return nx;
    ie = nx;
  }
  return ie;
}

/**
 * Two-transistor BJT mirror (basic / degenerated / Widlar) at a given reference current.
 * n: emitter-area ratio Q2/Q1; re1, re2 emitter resistors; vo output voltage from the rail; vcesat for compliance.
 */
export function bjtPair(b: Bjt, iref: number, n: number, re1: number, re2: number, vo: number, vcesat: number): MirrorPoint {
  const ie2Of = (ie2: number) => {
    const ie1 = solveIe1(b, iref - ie2 / b.beta);
    const vbe1 = b.vt * Math.log(ie1 / b.is);
    const IE1 = ie1 * (1 + vbe1 / b.va + 1 / b.beta);
    // I_E2 = I_e2(1 + 1/β + V_CE2/V_A) with V_CE2 = vo − I_E2·R_E2 (linear in I_E2)
    const IE2 = (ie2 * (1 + 1 / b.beta + vo / b.va)) / (1 + (ie2 * re2) / b.va);
    const vbe2 = b.vt * Math.log(ie2 / (n * b.is));
    return { ie1, vbe1, IE1, IE2, vbe2, res: vbe1 + IE1 * re1 - (vbe2 + IE2 * re2) };
  };
  // residual falls monotonically from +∞ (I_e2 → 0) to −∞ (I_e2 → β·I_ref, Q1 starved)
  const hi = Math.log(b.beta * iref) - 1e-12;
  const lo = Math.log(iref) - 60;
  const g = (l: number) => ie2Of(Math.exp(l)).res;
  // no bracket only far outside the active region (V_out well below compliance): report no operating point
  const x = g(lo) > 0 && g(hi) < 0 ? brent(g, lo, hi, 1e-13) : NaN;
  const ie2 = Math.exp(x);
  const p = ie2Of(ie2);
  const vce2 = vo - p.IE2 * re2;
  const ic2 = ie2 * (1 + vce2 / b.va);
  const ic1 = p.ie1 * (1 + p.vbe1 / b.va);
  return { iref, iout: ic2, vRef: p.vbe1 + p.IE1 * re1, vbe1: p.vbe1, vbe2: p.vbe2, ic1, ic2, ie2: p.IE2, vMin: vcesat + p.IE2 * re2 };
}

/** Wilson mirror (equal areas) at a given reference current. */
export function wilson(b: Bjt, iref: number, vo: number, vcesat: number): MirrorPoint {
  // every node voltage is explicit in the Q1/Q2 emitter current I_e, so one root search on ln I_e solves the KCL
  const at = (ie: number) => {
    const vb = b.vt * Math.log(ie / b.is);
    const vce3 = vo - vb;
    const ie3 = ((1 + vb / b.va + 2 / b.beta) / (1 + vce3 / b.va + 1 / b.beta)) * ie;
    const x = vb + b.vt * Math.log(ie3 / b.is);
    return { vb, vce3, ie3, x, res: ie * (1 + x / b.va) + ie3 / b.beta - iref };
  };
  const l0 = Math.log(iref);
  let ie = NaN;
  const g = (l: number) => at(Math.exp(l)).res;
  if (g(l0 - 60) < 0 && g(l0 + 5) > 0) ie = Math.exp(brent(g, l0 - 60, l0 + 5, 1e-13));
  const p = at(ie);
  return { iref, iout: p.ie3 * (1 + p.vce3 / b.va), vRef: p.x, vbe1: p.vb, vbe2: p.x - p.vb, ic1: ie * (1 + p.x / b.va), ic2: ie * (1 + p.vb / b.va), vMin: p.vb + vcesat };
}

/** V_GS of a diode-connected MOSFET carrying I (V_DS = V_GS). */
export function vgsDiode(m: Mos, wl: number, i: number): number {
  const f = (vov: number) => 0.5 * m.kp * wl * vov * vov * (1 + m.lambda * (m.vt + vov)) - i;
  // square-law guess, then Brent on the overdrive
  const g = Math.sqrt((2 * i) / (m.kp * wl));
  let hi = g * 1.01 + 1e-9;
  while (f(hi) < 0) hi *= 2;
  return m.vt + brent(f, 0, hi, 1e-15);
}

export function mosSimple(m: Mos, iref: number, n: number, vo: number): MirrorPoint {
  const vgs = vgsDiode(m, m.wl, iref);
  const vov = vgs - m.vt;
  const iout = 0.5 * m.kp * n * m.wl * vov * vov * (1 + m.lambda * vo);
  return { iref, iout, vRef: vgs, vgs, vov, vMin: vov };
}

/** Cascode mirror: Q1/Q3 stacked diodes (both W/L), Q2/Q4 output pair (n·W/L), gate of Q4 at 2·V_GS. */
export function mosCascode(m: Mos, iref: number, n: number, vo: number): MirrorPoint {
  const vgs = vgsDiode(m, m.wl, iref);
  const vov = vgs - m.vt;
  const vg4 = 2 * vgs;
  const k = 0.5 * m.kp * n * m.wl;
  // bottom device: I = k·vov²(1 + λ·Vx); cascode: I = k·(vg4 − Vx − Vt)²(1 + λ(vo − Vx))
  const r = (vx: number) => k * vov * vov * (1 + m.lambda * vx) - k * Math.max(vg4 - vx - m.vt, 0) ** 2 * (1 + m.lambda * (vo - vx));
  const top = vg4 - m.vt;
  const vx = r(0) >= 0 ? 0 : brent(r, 0, top, 1e-15);
  const iout = k * vov * vov * (1 + m.lambda * vx);
  return { iref, iout, vRef: 2 * vgs, vgs, vov, vx, vMin: vgs + vov };
}

export interface MirrorIn {
  topo: Topo;
  bjt: Bjt;
  mos: Mos;
  n: number;
  /** Emitter resistor: both emitters (degen, R_E2 = R_E/N) or the output only (Widlar) */
  re: number;
  vo: number;
  vcesat: number;
}

/**
 * Operating point at a given reference current. Below the compliance limit the output device saturates and
 * the active-region laws no longer apply (the Early factors can even turn negative), so the point is then
 * evaluated at the limit itself and flagged `clamped`: the real current there is lower.
 */
export function atIref(i: MirrorIn, iref: number, vo = i.vo): MirrorPoint & { clamped: boolean; voEval: number } {
  const p = core(i, iref, vo);
  if (Number.isFinite(p.iout) && p.iout > 0 && vo >= p.vMin) return { ...p, clamped: false, voEval: vo };
  const ref = core(i, iref, Math.max(vo, 5, Number.isFinite(p.vRef) ? 2 * p.vRef : 0));
  let v = ref.vMin;
  let q = core(i, iref, v);
  v = q.vMin;
  q = core(i, iref, v);
  return { ...q, clamped: true, voEval: v };
}

function core(i: MirrorIn, iref: number, vo: number): MirrorPoint {
  switch (i.topo) {
    case 'bjt-basic':
      return bjtPair(i.bjt, iref, i.n, 0, 0, vo, i.vcesat);
    case 'bjt-degen':
      return bjtPair(i.bjt, iref, i.n, i.re, i.re / i.n, vo, i.vcesat);
    case 'bjt-widlar':
      return bjtPair(i.bjt, iref, i.n, 0, i.re, vo, i.vcesat);
    case 'bjt-wilson':
      return wilson(i.bjt, iref, vo, i.vcesat);
    case 'mos-simple':
      return mosSimple(i.mos, iref, i.n, vo);
    case 'mos-cascode':
      return mosCascode(i.mos, iref, i.n, vo);
  }
}

/** Reference current set by R_ref from the supply: I_ref·R_ref = V_CC − V_ref(I_ref). */
export function irefFromR(i: MirrorIn, vcc: number, rref: number): number | null {
  const g = (l: number) => {
    const ir = Math.exp(l);
    return ir * rref - (vcc - atIref(i, ir).vRef);
  };
  const hi = Math.log(vcc / rref);
  const lo = hi - 50;
  if (!(g(hi) > 0) || !(g(lo) < 0)) return null;
  return Math.exp(brent(g, lo, hi, 1e-13));
}

/** R_ref that gives a target I_ref (exact inverse of irefFromR). Null when V_CC cannot drive it. */
export function rrefFor(i: MirrorIn, vcc: number, iref: number): number | null {
  const v = vcc - atIref(i, iref).vRef;
  return v > 0 ? v / iref : null;
}

/** Output resistance by a central difference of the large-signal model (Infinity for V_A → ∞ / λ = 0). */
export function rOut(i: MirrorIn, iref: number): number {
  const v = atIref(i, iref).voEval;
  const dv = 1e-3 * Math.max(1, Math.abs(v));
  const di = core(i, iref, v + dv).iout - core(i, iref, v - dv).iout;
  return di > 0 ? (2 * dv) / di : Infinity;
}
