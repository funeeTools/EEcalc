/**
 * Battery life — runtime from a capacity and a load profile. DOM-free.
 *
 * Average load current from the duty-weighted phases: I_load = Σ I_k·D_k.
 * Battery current through the regulator:
 *   none:      I_bat = I_load
 *   linear:    I_bat = I_load + I_q                        (the series pass element passes the load current)
 *   switching: I_bat = V_load·I_load / (η·V_bat) + I_q     (power balance at the nominal battery voltage)
 * Usable capacity: C_u = C·DoD·f_T·f_age·f_P, with the Peukert factor (Peukert 1897; Linden & Reddy,
 * Handbook of Batteries, 4th ed., §3) f_P = (I_ref / I_bat)^(k−1) for I_bat > I_ref = C/H (H = rated
 * discharge time), and f_P = 1 below the rated current (no credit for slower discharge: conservative).
 * Self-discharge is a constant equivalent drain of the rated capacity: I_sd = C·r_sd / month.
 * Runtime: t = C_u / (I_bat + I_sd).
 */

export const MONTH = (365.25 / 12) * 86400; // s
export const HOUR = 3600;

export type Reg = 'none' | 'linear' | 'switching';

export interface LoadPhase {
  name: string;
  /** current drawn from the load rail, A */
  i: number;
  /** share of the time, % */
  duty: number;
}

export interface LifeInputs {
  /** rated capacity, A·s (C) */
  cap: number;
  /** discharge time at which `cap` is rated, s */
  hRated: number;
  /** Peukert exponent (1 = none) */
  k: number;
  /** usable fractions 0…1 */
  dod: number;
  fTemp: number;
  fAge: number;
  /** self-discharge, fraction of the rated capacity per month */
  sd: number;
  reg: Reg;
  /** regulated rail, V */
  vLoad: number;
  /** pack nominal voltage, V */
  vBat: number;
  /** converter efficiency 0…1 */
  eff: number;
  /** regulator quiescent current, A */
  iq: number;
}

export function avgLoad(phases: LoadPhase[]): number {
  return phases.reduce((a, p) => a + p.i * (p.duty / 100), 0);
}

/** Battery current for a load-rail current i (works for an average or an instantaneous current). */
export function batteryCurrent(i: number, p: Pick<LifeInputs, 'reg' | 'vLoad' | 'vBat' | 'eff' | 'iq'>): number {
  if (p.reg === 'none') return i;
  if (p.reg === 'linear') return i + p.iq;
  return (p.vLoad * i) / (p.eff * p.vBat) + p.iq;
}

export function peukertFactor(iBat: number, iRef: number, k: number): number {
  return iBat > iRef ? Math.pow(iRef / iBat, k - 1) : 1;
}

export interface LifeOutputs {
  iLoad: number;
  iBat: number;
  iSd: number;
  iRef: number;
  fP: number;
  capUsable: number;
  /** s (Infinity when nothing drains the cell) */
  t: number;
}

export function life(iLoad: number, p: LifeInputs): LifeOutputs {
  const iBat = batteryCurrent(iLoad, p);
  const iRef = p.cap / p.hRated;
  const fP = peukertFactor(iBat, iRef, p.k);
  const capUsable = p.cap * p.dod * p.fTemp * p.fAge * fP;
  const iSd = (p.cap * p.sd) / MONTH;
  const drain = iBat + iSd;
  return { iLoad, iBat, iSd, iRef, fP, capUsable, t: drain > 0 ? capUsable / drain : Infinity };
}

/** Longest runtime any capacity can give: self-discharge grows with C, so t → DoD·f_T·f_age·month / r_sd. */
export function selfDischargeLimit(p: LifeInputs): number {
  return p.sd > 0 ? (p.dod * p.fTemp * p.fAge * MONTH) / p.sd : Infinity;
}
