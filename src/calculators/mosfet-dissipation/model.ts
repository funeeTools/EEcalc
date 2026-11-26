/**
 * Power MOSFET losses in a hard-switched converter leg, and the junction temperature they cause.
 * Pure, SI in / SI out (temperatures in °C, tempco α in 1/°C).
 *
 * The switch carries the inductor current: a trapezoid of mean I and peak-to-peak ripple ΔI, for the duty
 * D_sw of this switch (D for the control switch, 1 − D for the synchronous rectifier).
 *
 *   I_rms² = D_sw·(I² + ΔI²/12)                                   (Erickson & Maksimović, App. A)
 *   P_cond = I_rms²·R_DS(on)(T_J),  R_DS(on)(T) = R25·(1 + α·(T − 25 °C))   (linear fit of the datasheet
 *            "normalized R_DS(on) vs temperature" curve)
 *
 * Control switch, clamped inductive switching (Balogh, TI SLUA618A eq. 8, 11–14):
 *   V_pl = V_th + I/g_fs                                            (eq. 8, at the switched current)
 *   turn-on : I_G2 = (V_drv − ½(V_pl + V_th))/R_on,  I_G3 = (V_drv − V_pl)/R_on,  R_on = R_src + R_G,ext + R_G,int
 *   turn-off: I_G3 = V_pl/R_off,  I_G2 = ½(V_pl + V_th)/R_off,                  R_off = R_snk + R_G,ext + R_G,int
 *   t_i = Q_gs2/I_G2 (current transition), t_v = Q_gd/I_G3 (voltage transition), Q_gs2 = Q_gs − Q_g(th)
 *   E = ½·V·I·(t_i + t_v) per edge, turn-on at the valley I − ΔI/2, turn-off at the peak I + ΔI/2.
 *   SLUA618 writes t2 = C_iss·(V_pl − V_th)/I_G2 and t3 = C_rss·V/I_G3; the datasheet charges Q_gs2 and
 *   Q_gd are the same integrals measured on the non-linear capacitances, so they are used instead.
 *   P_Coss = ½·(C_oss,eff + C_opp)·V²·f: this switch's own stored energy is dumped into its channel, and charging
 *            the opposite device's capacitance (SR C_oss or diode C_j) from the supply through this channel
 *            dissipates Q·V − E ≈ ½·C_opp·V² more (equal FETs: ≈ Q_oss·V·f in total)
 *   P_rr   = Q_rr·V·f (the opposite rectifier's recovery charge is pulled through this switch;
 *            Erickson & Maksimović ch. 4, diode recovered charge)
 * Synchronous rectifier: soft (ZVS) channel transitions; the body diode carries the current for each dead
 *   time: P_bd = V_SD·t_dt·f·(I_pk + max(I_valley, 0)).
 * Gate drive (SLUA618A eq. 10): P_G = Q_g·V_drv·f split over the resistances in the loop; the share in the
 *   FET's internal gate resistance heats the die: ½·P_G·(R_G,int/R_on + R_G,int/R_off).
 *
 * Junction temperature: T_J = T_A + R_θ·P(T_J), linear in T_J, solved in closed form; thermal runaway when
 * R_θ·α·P_cond,25 ≥ 1.
 */

export type Role = 'switch' | 'sr';

export interface FetInputs {
  role: Role;
  /** Switched (off-state) voltage, V */
  v: number;
  /** Mean inductor current through the switch while it conducts, A */
  iL: number;
  /** Peak-to-peak inductor ripple, A */
  dIL: number;
  /** Control-switch duty cycle (0..1) */
  d: number;
  fsw: number;
  rds25: number;
  /** R_DS(on) tempco, 1/°C */
  alpha: number;
  vth: number;
  gfs: number;
  qg: number;
  qgs: number;
  qgd: number;
  qgth: number;
  rgInt: number;
  coss: number;
  /** Charge-equivalent capacitance of the opposite rectifier (SR FET C_oss or diode C_j), F */
  cossOpp: number;
  vsd: number;
  vdrv: number;
  rSrc: number;
  rSnk: number;
  rgExt: number;
  /** Dead time per edge (SR), s */
  tdt: number;
  /** Recovery charge of the opposite rectifier (control switch), C */
  qrr: number;
  ta: number;
  /** Total junction-to-ambient thermal resistance, °C/W */
  rth: number;
}

export interface Edges {
  iOn: number;
  iOff: number;
  vplOn: number;
  vplOff: number;
  tir: number;
  tvf: number;
  tvr: number;
  tif: number;
  eOn: number;
  eOff: number;
  /** turn-on is soft (valley current ≤ 0: the node is already pulled to V by the negative current) */
  zvs: boolean;
}

export interface Losses {
  cond: number;
  sw: number;
  coss: number;
  rr: number;
  bd: number;
  gate: number;
  total: number;
}

export interface FetResult {
  dSw: number;
  irms: number;
  edges: Edges;
  /** temperature-independent part of the loss, W */
  fixed: number;
  /** conduction loss at 25 °C, W */
  cond25: number;
  tj: number;
  runaway: boolean;
  rdsTj: number;
  loss: Losses;
  /** gate-drive supply power Q_g·V_drv·f (mostly in the driver), W */
  pGateTotal: number;
}

export function edges(p: FetInputs): Edges {
  const valley = p.iL - p.dIL / 2;
  const iOn = Math.max(valley, 0);
  const iOff = p.iL + p.dIL / 2;
  const vplOn = p.vth + iOn / p.gfs;
  const vplOff = p.vth + iOff / p.gfs;
  const rOn = p.rSrc + p.rgExt + p.rgInt;
  const rOff = p.rSnk + p.rgExt + p.rgInt;
  const qgs2 = Math.max(p.qgs - p.qgth, 0);
  // t = Q·R/ΔV keeps R = 0 (ideal driver) finite
  const tir = (qgs2 * rOn) / (p.vdrv - 0.5 * (vplOn + p.vth));
  const tvf = (p.qgd * rOn) / (p.vdrv - vplOn);
  const tvr = (p.qgd * rOff) / vplOff;
  const tif = (qgs2 * rOff) / (0.5 * (vplOff + p.vth));
  const zvs = valley <= 0;
  const hard = p.role === 'switch';
  const eOn = hard && !zvs ? 0.5 * p.v * iOn * (tir + tvf) : 0;
  const eOff = hard ? 0.5 * p.v * iOff * (tvr + tif) : 0;
  return { iOn, iOff, vplOn, vplOff, tir, tvf, tvr, tif, eOn, eOff, zvs };
}

/** Highest mean current the gate drive can carry fully enhanced: V_pl at the peak must stay below V_drv. */
export function iMaxDrive(p: FetInputs): number {
  return (p.vdrv - p.vth) * p.gfs - p.dIL / 2;
}

export function analyze(p: FetInputs): FetResult {
  const dSw = p.role === 'switch' ? p.d : 1 - p.d;
  const irms = Math.sqrt(dSw * (p.iL * p.iL + (p.dIL * p.dIL) / 12));
  const e = edges(p);
  const hard = p.role === 'switch';
  const sw = (e.eOn + e.eOff) * p.fsw;
  const coss = hard && !e.zvs ? 0.5 * (p.coss + p.cossOpp) * p.v * p.v * p.fsw : 0;
  const rr = hard && !e.zvs ? p.qrr * p.v * p.fsw : 0;
  const bd = hard ? 0 : p.vsd * p.tdt * p.fsw * (e.iOff + e.iOn);
  const rOn = p.rSrc + p.rgExt + p.rgInt;
  const rOff = p.rSnk + p.rgExt + p.rgInt;
  const pGateTotal = p.qg * p.vdrv * p.fsw;
  const gate = 0.5 * pGateTotal * ((rOn > 0 ? p.rgInt / rOn : 0) + (rOff > 0 ? p.rgInt / rOff : 0));
  const fixed = sw + coss + rr + bd + gate;
  const cond25 = irms * irms * p.rds25;
  // T = Ta + Rθ·(fixed + cond25·(1 + α(T − 25)))  →  T·(1 − Rθ·cond25·α) = Ta + Rθ·(fixed + cond25·(1 − 25α))
  const den = 1 - p.rth * cond25 * p.alpha;
  const runaway = !(den > 1e-9);
  const tj = runaway ? Infinity : (p.ta + p.rth * (fixed + cond25 * (1 - 25 * p.alpha))) / den;
  const rdsTj = p.rds25 * (1 + p.alpha * (tj - 25));
  const cond = irms * irms * rdsTj;
  return { dSw, irms, edges: e, fixed, cond25, tj, runaway, rdsTj, loss: { cond, sw, coss, rr, bd, gate, total: cond + fixed }, pGateTotal };
}

/** Total die loss at a given junction temperature (for the required-R_θ solve). */
export function lossAt(p: FetInputs, tj: number): number {
  const r = analyze({ ...p, rth: 0 });
  return r.fixed + r.cond25 * (1 + p.alpha * (tj - 25));
}
