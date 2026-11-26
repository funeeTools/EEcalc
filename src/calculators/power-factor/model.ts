/**
 * Power factor and shunt-capacitor correction — single-phase or balanced three-phase. Pure, SI in / SI out.
 *
 * Sources:
 *  - IEEE Std 1459-2010, "Definitions for the Measurement of Electric Power Quantities Under Sinusoidal,
 *    Nonsinusoidal, Balanced, or Unbalanced Conditions": active power P, fundamental apparent power
 *    S₁ = V₁I₁, fundamental reactive power Q₁ = V₁I₁·sin θ₁, current distortion power D_I = V₁·I_H = S₁·THD_I,
 *    S² = S₁² + D_I² (sinusoidal voltage), displacement PF₁ = cos θ₁ = P₁/S₁, PF = P/S.
 *  - J. Arrillaga, N. R. Watson, Power System Harmonics, 2nd ed., Wiley, 2003: PF = cos θ₁/√(1 + THD_I²)
 *    for a sinusoidal supply voltage.
 *  - IEEE Std 1036 (shunt power capacitors) / IEEE Std 18: capacitor reactive power Q_C = ω·C·V_C² per unit;
 *    bank of three in Δ sees V_L, in Y sees V_L/√3.
 *  - IEEE Std 1531-2003 (harmonic filters) / IEEE Std 519 guidance: parallel resonance of a shunt bank with
 *    the source inductance at h_r = √(S_sc/Q_C).
 *  - C. K. Alexander, M. N. O. Sadiku, Fundamentals of Electric Circuits (power-factor correction section):
 *    Q_C = P·(tan θ₁ − tan θ₂), C = Q_C/(ω·V²).
 *
 * Assumptions: the supply voltage is sinusoidal (THD_V = 0) and stiff; the capacitor changes only the
 * fundamental reactive power, not the load's harmonic currents (I_H stays the same).
 */

export type Phase = 'single' | 'three';
export type BankConn = 'delta' | 'wye';
export type Side = 'lag' | 'lead';

/** √3 for a three-phase line voltage, 1 for single-phase: S = m·V·I. */
export const mFactor = (phase: Phase) => (phase === 'three' ? Math.sqrt(3) : 1);

/** Q_C = k·ω·C·V² with V the supply (line) voltage and C per unit: single 1, three-phase Δ 3, Y 1. */
export const kBank = (phase: Phase, conn: BankConn) => (phase === 'single' ? 1 : conn === 'delta' ? 3 : 1);

/** Voltage across each capacitor. */
export const vCap = (phase: Phase, conn: BankConn, v: number) => (phase === 'three' && conn === 'wye' ? v / Math.sqrt(3) : v);

/** tan θ with the sign convention Q > 0 lagging (inductive). pf in (0, 1]. */
export const tanPhi = (pf: number, side: Side) => (side === 'lead' ? -1 : 1) * (Math.sqrt(Math.max(0, 1 - pf * pf)) / pf);

export interface Load {
  /** Active power P (W) */
  p: number;
  /** Fundamental reactive power Q₁ (var), + lagging */
  q1: number;
  /** Current THD as a fraction */
  thd: number;
}

export type LoadBy = 'p' | 's' | 'i';

/** Load from one of P, S (total apparent) or I (rms line current), the displacement PF and the current THD. */
export function loadFrom(by: LoadBy, value: number, pfd: number, side: Side, thd: number, v: number, phase: Phase): Load {
  const k = Math.sqrt(1 + thd * thd); // S/S₁
  let p: number;
  if (by === 'p') p = value;
  else {
    const s = by === 's' ? value : mFactor(phase) * v * value;
    p = (s / k) * pfd; // S₁ = S/√(1+THD²), P = S₁·cos θ₁
  }
  return { p, q1: p * tanPhi(pfd, side), thd };
}

export interface PowerState {
  p: number;
  q1: number;
  s1: number;
  /** Current distortion power D_I = S₁·THD_I */
  dI: number;
  s: number;
  /** Displacement PF cos θ₁ */
  pfd: number;
  /** Total (true) PF = P/S */
  pf: number;
  side: Side | 'unity';
  /** Displacement angle θ₁ (rad), + lagging */
  theta: number;
  /** Fundamental and total rms line current */
  i1: number;
  i: number;
  /** Harmonic rms current I_H */
  ih: number;
  /** THD of the current as a fraction */
  thd: number;
}

/** Powers and currents of a load with fundamental reactive power q1 after a shunt bank of Q_C. */
export function powers(p: number, q1: number, ih: number, v: number, phase: Phase): PowerState {
  const m = mFactor(phase);
  const s1 = Math.hypot(p, q1);
  const i1 = s1 / (m * v);
  const dI = m * v * ih;
  const s = Math.hypot(s1, dI);
  const eps = 1e-12 * Math.max(Math.abs(p), Math.abs(q1));
  const side = Math.abs(q1) <= eps ? 'unity' : q1 > 0 ? 'lag' : 'lead';
  return { p, q1, s1, dI, s, pfd: s1 > 0 ? p / s1 : 1, pf: s > 0 ? p / s : 1, side, theta: Math.atan2(q1, p), i1, i: Math.hypot(i1, ih), ih, thd: i1 > 0 ? ih / i1 : 0 };
}

export interface Correction {
  before: PowerState;
  after: PowerState;
  /** Total capacitor reactive power (var) */
  qc: number;
  /** Per capacitor: voltage, current, reactive power */
  vc: number;
  ic: number;
  qcEach: number;
  /** Line current drawn by the bank */
  iLineBank: number;
  /** Harmonic order of the parallel resonance with the source (null if no S_sc or no bank) */
  hr: number | null;
}

/** Apply a capacitor C (per unit) at supply voltage v and frequency f. ssc = short-circuit power (0 = unknown). */
export function correct(load: Load, v: number, f: number, c: number, phase: Phase, conn: BankConn, ssc: number): Correction {
  const w = 2 * Math.PI * f;
  const qc = kBank(phase, conn) * w * c * v * v;
  const before = powers(load.p, load.q1, 0, v, phase);
  const ih = before.i1 * load.thd;
  const b = powers(load.p, load.q1, ih, v, phase);
  const after = powers(load.p, load.q1 - qc, ih, v, phase);
  const vc = vCap(phase, conn, v);
  const ic = w * c * vc;
  const units = phase === 'single' ? 1 : 3;
  return {
    before: b,
    after,
    qc,
    vc,
    ic,
    qcEach: qc / units,
    iLineBank: phase === 'three' && conn === 'delta' ? Math.sqrt(3) * ic : ic,
    hr: ssc > 0 && qc > 0 ? Math.sqrt(ssc / qc) : null,
  };
}

/** Reactive power the bank must supply to move the displacement PF to the target (≤ 0: no capacitor helps). */
export function qcFor(load: Load, pfT: number, sideT: Side): number {
  return load.q1 - load.p * tanPhi(pfT, sideT);
}

/** Capacitance per unit for a bank of Q_C. */
export function cFor(qc: number, v: number, f: number, phase: Phase, conn: BankConn): number {
  return qc / (kBank(phase, conn) * 2 * Math.PI * f * v * v);
}
