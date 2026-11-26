/**
 * BJT DC bias point — equations only (pure, SI in/out).
 *
 * Large-signal model (Sedra & Smith, Microelectronic Circuits 7e, §6.3–6.7 and §7.4 "Biasing"; Horowitz &
 * Hill, Art of Electronics 3e §2.2): constant V_BE when conducting, I_C = β·I_B in the active region,
 * V_CE = V_CE(sat) and I_C < β·I_B in saturation, I_B = I_C = 0 in cutoff. No Early effect, no I_CBO.
 *
 * Everything is solved in the "NPN frame": for a PNP the node voltages are measured down from V_CC and the
 * currents are magnitudes, which maps the PNP circuit (emitter towards V_CC) onto the NPN equations with the
 * divider's two resistors exchanged.
 *
 *   Divider (four-resistor) bias: V_BB = V_CC·R_lo/(R_hi + R_lo), R_B = R_hi ∥ R_lo (Thévenin of the divider)
 *   Fixed bias: V_BB = V_CC, R_B as fitted.
 *     active:     I_B = (V_BB − V_BE) / (R_B + (β+1)·R_E)
 *     saturation: V_BB − V_BE = I_B·(R_B + R_E) + I_C·R_E,  V_CC − V_CE(sat) = I_B·R_E + I_C·(R_C + R_E)
 *   Collector feedback (R_B from collector to base, R_C carries I_C + I_B):
 *     I_B = (V_CC − V_BE) / (R_B + (β+1)·(R_C + R_E)); V_CB = I_B·R_B ≥ 0, so it never saturates.
 *
 * Stability: with R_x the base-side and R_y the emitter-side resistance (R_y = R_E, or R_C + R_E with feedback),
 *   I_C = β(V − V_BE)/(R_x + (β+1)R_y),  S_β = (β/I_C)·∂I_C/∂β = (R_x + R_y)/(R_x + (β+1)R_y),
 *   ∂I_C/∂T = −(dV_BE/dT)·β/(R_x + (β+1)R_y) with dV_BE/dT ≈ −2 mV/°C (Sedra & Smith §3.2 / §6.2),
 *   I_CBO stability factor S = (β+1)·S_β (the classical S = (1+β)/(1+β·R_E/(R_E+R_B))).
 */

export type Topology = 'divider' | 'fixed' | 'feedback';
export type Region = 'cutoff' | 'active' | 'saturation';

export interface Bjt {
  beta: number;
  vbe: number;
  vceSat: number;
}

/** Circuit in the NPN frame: rHi goes from the base to the supply, rLo from the base to the common rail. */
export interface Bias {
  topo: Topology;
  vcc: number;
  rHi: number;
  rLo: number;
  rb: number;
  rc: number;
  re: number;
}

export interface BiasPoint {
  region: Region;
  ib: number;
  ic: number;
  ie: number;
  /** Node voltages in the NPN frame (from the common rail) */
  vb: number;
  ve: number;
  vc: number;
  vce: number;
  /** Thévenin base source and resistance (divider / fixed); for feedback vbb = V_CC, rbth = R_B */
  vbb: number;
  rbth: number;
}

export function thevenin(c: Bias): { vbb: number; rbth: number } {
  if (c.topo === 'divider') return { vbb: (c.vcc * c.rLo) / (c.rHi + c.rLo), rbth: (c.rHi * c.rLo) / (c.rHi + c.rLo) };
  return { vbb: c.vcc, rbth: c.rb };
}

/** Base-side and emitter-side resistance seen by the bias loop (see the header). */
export function loopRes(c: Bias): { rx: number; ry: number } {
  const { rbth } = thevenin(c);
  return c.topo === 'feedback' ? { rx: c.rb, ry: c.rc + c.re } : { rx: rbth, ry: c.re };
}

export function solveBias(c: Bias, t: Bjt): BiasPoint {
  const { vbb, rbth } = thevenin(c);
  const off = (vb: number): BiasPoint => ({ region: 'cutoff', ib: 0, ic: 0, ie: 0, vb, ve: 0, vc: c.vcc, vce: c.vcc, vbb, rbth });
  const b = t.beta;
  if (c.topo === 'feedback') {
    if (c.vcc <= t.vbe) return off(c.vcc);
    const ib = (c.vcc - t.vbe) / (c.rb + (b + 1) * (c.rc + c.re));
    const ic = b * ib;
    const ie = ic + ib;
    const ve = ie * c.re;
    const vc = c.vcc - ie * c.rc;
    return { region: 'active', ib, ic, ie, vb: ve + t.vbe, ve, vc, vce: vc - ve, vbb, rbth };
  }
  if (vbb <= t.vbe) return off(vbb);
  let ib = (vbb - t.vbe) / (rbth + (b + 1) * c.re);
  let ic = b * ib;
  let ve = (ib + ic) * c.re;
  let vc = c.vcc - ic * c.rc;
  if (vc - ve >= t.vceSat) return { region: 'active', ib, ic, ie: ib + ic, vb: ve + t.vbe, ve, vc, vce: vc - ve, vbb, rbth };
  // Saturation: both loops with V_CE pinned at V_CE(sat); I_C < β·I_B.
  const a1 = vbb - t.vbe;
  const a2 = c.vcc - t.vceSat;
  const det = (rbth + c.re) * (c.rc + c.re) - c.re * c.re;
  ib = (a1 * (c.rc + c.re) - c.re * a2) / det;
  ic = ((rbth + c.re) * a2 - c.re * a1) / det;
  if (!(ic > 0) || !(ib > 0)) return off(vbb); // supply below V_CE(sat): nothing flows
  ve = (ib + ic) * c.re;
  vc = ve + t.vceSat;
  return { region: 'saturation', ib, ic, ie: ib + ic, vb: ve + t.vbe, ve, vc, vce: t.vceSat, vbb, rbth };
}

/** Relative sensitivity of I_C to β (active region). */
export function sBeta(c: Bias, beta: number): number {
  const { rx, ry } = loopRes(c);
  return (rx + ry) / (rx + (beta + 1) * ry);
}

/** ∂I_C/∂V_BE (A/V, negative) in the active region. */
export function dIcdVbe(c: Bias, beta: number): number {
  const { rx, ry } = loopRes(c);
  return -beta / (rx + (beta + 1) * ry);
}

export const DVBE_DT = -2e-3; // V/°C, Sedra & Smith

export interface Design {
  rHi: number;
  rLo: number;
  rb: number;
  rc: number;
  re: number;
}

/**
 * Resistors (NPN frame) for a target I_C and V_CE with emitter voltage ve and, for the divider, a divider
 * current k·I_B in R_lo. Exact: solveBias() of the result returns the targets (active region).
 * Returns a reason code when the targets cannot be met: 'sat' (V_CE below V_CE(sat)), 'headroom' (V_CE + V_E ≥ V_CC),
 * 'feedback-vce' (collector feedback needs V_CE > V_BE).
 */
export function design(topo: Topology, vcc: number, t: Bjt, ic: number, vce: number, ve: number, k: number): Design | 'sat' | 'headroom' | 'feedback-vce' {
  const ib = ic / t.beta;
  const ie = ic + ib;
  const re = ve / ie;
  const vb = ve + t.vbe;
  if (vce < t.vceSat) return 'sat';
  if (vcc - vce - ve <= 0) return 'headroom';
  if (topo === 'divider') {
    const i2 = k * ib;
    return { rLo: vb / i2, rHi: (vcc - vb) / (i2 + ib), rb: NaN, rc: (vcc - vce - ve) / ic, re };
  }
  if (topo === 'fixed') return { rHi: NaN, rLo: NaN, rb: (vcc - vb) / ib, rc: (vcc - vce - ve) / ic, re };
  // collector feedback: R_C carries I_C + I_B, R_B drops V_C − V_B = V_CE − V_BE
  if (vce <= t.vbe) return 'feedback-vce';
  const vc = vce + ve;
  return { rHi: NaN, rLo: NaN, rb: (vc - vb) / ib, rc: (vcc - vc) / ie, re };
}

export interface BjtPreset {
  type: 'npn' | 'pnp';
  beta: number;
  betaMin: number;
  betaMax: number;
  vbe: number;
  vceSat: number;
  vceo: number;
  icMax: number;
  ptot: number;
  note: string;
}

/**
 * Datasheet values (onsemi 2N3903/2N3904, P2N2222A, BC546/D, 2N3906/D, BC556B/D): h_FE min/max at the
 * stated current; the design β is the datasheet typical where one is given, else the geometric mean of min and max.
 */
export const BJT_PRESETS: Record<string, BjtPreset | null> = {
  Custom: null,
  '2N3904 (NPN)': { type: 'npn', beta: 173, betaMin: 100, betaMax: 300, vbe: 0.65, vceSat: 0.2, vceo: 40, icMax: 0.2, ptot: 0.625, note: 'h_FE 100–300 at 10 mA (≥ 70 at 1 mA), V_CE(sat) ≤ 0.2 V at 10 mA/1 mA' },
  '2N2222A (NPN)': { type: 'npn', beta: 150, betaMin: 75, betaMax: 300, vbe: 0.65, vceSat: 0.3, vceo: 40, icMax: 0.6, ptot: 0.625, note: 'h_FE ≥ 75 at 10 mA, 100–300 at 150 mA, V_CE(sat) ≤ 0.3 V at 150 mA' },
  'BC547B (NPN)': { type: 'npn', beta: 290, betaMin: 200, betaMax: 450, vbe: 0.65, vceSat: 0.25, vceo: 45, icMax: 0.1, ptot: 0.625, note: 'h_FE 200/290/450 at 2 mA, V_CE(sat) ≤ 0.25 V at 10 mA/0.5 mA' },
  '2N3906 (PNP)': { type: 'pnp', beta: 173, betaMin: 100, betaMax: 300, vbe: 0.65, vceSat: 0.25, vceo: 40, icMax: 0.2, ptot: 0.625, note: 'h_FE 100–300 at 10 mA, V_CE(sat) ≤ 0.25 V at 10 mA/1 mA' },
  'BC557B (PNP)': { type: 'pnp', beta: 290, betaMin: 180, betaMax: 460, vbe: 0.62, vceSat: 0.3, vceo: 45, icMax: 0.1, ptot: 0.625, note: 'h_FE 180/290/460 at 2 mA, V_BE(on) 0.62 V typ, V_CE(sat) ≤ 0.3 V at 10 mA/0.5 mA' },
};
