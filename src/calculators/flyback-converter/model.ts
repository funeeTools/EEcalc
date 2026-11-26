/**
 * Flyback converter power stage (single output, fixed frequency, CCM or DCM) — steady-state equations.
 * Pure, SI in / SI out.
 *
 * Sources:
 *  - R. W. Erickson, D. Maksimović, Fundamentals of Power Electronics, 2nd ed., §6.3.4 (flyback as an
 *    isolated buck-boost: M(D) = D/(n·(1 − D)) in CCM, volt-second balance on the magnetizing inductance)
 *    and ch. 5 (DCM: the current starts and ends each cycle at zero).
 *  - N. Mohan, T. Undeland, W. Robbins, Power Electronics, 3rd ed., §10-4 (flyback converter waveforms).
 *  - Fairchild (onsemi) AN-4137, "Design Guidelines for Off-line Flyback Converters Using Fairchild Power
 *    Switch": P_in = P_out/η; V_RO = N·(V_o + V_F); D_max = V_RO/(V_RO + V_DC,min); ripple factor
 *    K_RF = ΔI/(2·I_EDC) with I_EDC = P_in/(V_DC,min·D_max); L_m = (V_DC,min·D_max)²/(2·P_in·f_s·K_RF).
 *  - Fairchild (onsemi) AN-4147, "Design Guidelines for RCD Snubber of Flyback Converters": leakage
 *    reset t_s = L_lk·I_pk/(V_sn − V_RO), clamp power ½·L_lk·I_pk²·f_s·V_sn/(V_sn − V_RO).
 *  - J. Picard, "Under the Hood of Flyback SMPS Designs", TI Power Supply Design Seminar SLUP254 (2010):
 *    turns-ratio / reflected-voltage trade-off, drain and rectifier voltage stress.
 *
 * Model: ideal switch and rectifier timing; the magnetizing current carries P_in = P_out/η (AN-4137, so the
 * primary currents are sized conservatively), and the secondary current is the magnetizing waveform reflected
 * by N and scaled so its average is exactly I_out. K_RF is extended past the boundary as L_crit/L_p (> 1 = DCM).
 */

import { outputRipple, type Segment } from '../buck-converter/model';

export interface FlybackPoint {
  /** DC input voltage at this operating point */
  vin: number;
  vout: number;
  iout: number;
  /** rectifier forward drop */
  vf: number;
  /** assumed overall efficiency (0–1] */
  eta: number;
  fsw: number;
  /** turns ratio Np/Ns */
  n: number;
  /** primary (magnetizing) inductance */
  lp: number;
}

export interface FlybackOp {
  mode: 'ccm' | 'dcm';
  pout: number;
  pin: number;
  /** reflected output voltage N·(Vout + VF) */
  vor: number;
  /** duty at the CCM/DCM boundary (= CCM duty) */
  dBcm: number;
  /** boundary inductance at this point */
  lCrit: number;
  /** ripple factor L_crit/L_p (= AN-4137 K_RF in CCM; > 1 in DCM) */
  krf: number;
  d: number;
  /** fraction of the period the secondary conducts */
  d2: number;
  /** centre of the primary ramp, P_in/(V_in·D) */
  iEdc: number;
  dIp: number;
  ipPk: number;
  ipVal: number;
  ipRms: number;
  ipAvg: number;
  isPk: number;
  isVal: number;
  isRms: number;
  /** energy stored in L_p at the current peak, ½·L_p·I_pk² */
  ePk: number;
  /** energy transferred per cycle, P_in/f_sw */
  eCycle: number;
  /** secondary current segments over one period (for the output ripple) */
  sec: Segment[];
  period: number;
}

/** Duty at the CCM/DCM boundary for a given reflected voltage: D = V_OR/(V_in + V_OR). */
export const dBoundary = (vin: number, vor: number): number => vor / (vin + vor);
/** Boundary (critical) primary inductance: L_crit = (V_in·D_bcm)²/(2·P_in·f_sw) (AN-4137 with K_RF = 1). */
export const lBoundary = (vin: number, dBcm: number, pin: number, fsw: number): number => (vin * dBcm) ** 2 / (2 * pin * fsw);

export function analyzeFlyback(p: FlybackPoint): FlybackOp {
  const vs = p.vout + p.vf;
  const vor = p.n * vs;
  const pout = p.vout * p.iout;
  const pin = pout / p.eta;
  const T = 1 / p.fsw;
  const dBcm = dBoundary(p.vin, vor);
  const lCrit = lBoundary(p.vin, dBcm, pin, p.fsw);
  const krf = lCrit / p.lp;
  let d: number;
  let d2: number;
  let ipPk: number;
  let ipVal: number;
  let mode: 'ccm' | 'dcm';
  if (krf <= 1) {
    mode = 'ccm';
    d = dBcm;
    d2 = 1 - d;
    const iEdc = pin / (p.vin * d);
    const dI = (p.vin * d) / (p.lp * p.fsw);
    ipPk = iEdc + dI / 2;
    ipVal = iEdc - dI / 2;
  } else {
    mode = 'dcm';
    ipPk = Math.sqrt((2 * pin) / (p.lp * p.fsw));
    ipVal = 0;
    d = (ipPk * p.lp * p.fsw) / p.vin;
    d2 = (p.vin * d) / vor; // reset volt-seconds on the primary side: V_OR·D2 = V_in·D
  }
  const iEdc = pin / (p.vin * d);
  const trap = (a: number, b: number, frac: number) => Math.sqrt(Math.max((frac * (a * a + a * b + b * b)) / 3, 0));
  const ipRms = trap(ipPk, ipVal, d);
  const ipAvg = (d * (ipPk + ipVal)) / 2;
  // secondary: reflected magnetizing current scaled so that its average is I_out
  const k = (p.iout * vs) / pin;
  const isPk = k * p.n * ipPk;
  const isVal = k * p.n * ipVal;
  const isRms = trap(isPk, isVal, d2);
  const sec: Segment[] = [
    { t0: 0, t1: d * T, i0: 0, i1: 0, vsw: 0 },
    { t0: d * T, t1: (d + d2) * T, i0: isPk, i1: isVal, vsw: 0 },
  ];
  if (d + d2 < 1 - 1e-12) sec.push({ t0: (d + d2) * T, t1: T, i0: 0, i1: 0, vsw: 0 });
  return {
    mode,
    pout,
    pin,
    vor,
    dBcm,
    lCrit,
    krf,
    d,
    d2,
    iEdc,
    dIp: ipPk - ipVal,
    ipPk,
    ipVal,
    ipRms,
    ipAvg,
    isPk,
    isVal,
    isRms,
    ePk: 0.5 * p.lp * ipPk * ipPk,
    eCycle: pin / p.fsw,
    sec,
    period: T,
  };
}

/**
 * Synthesis: N and L_p for a target duty D at V_in and a target ripple factor K (exact inverse of
 * analyzeFlyback). In DCM (K > 1) the duty is D_bcm/√K, so D_bcm = D·√K. Returns null if D_bcm ≥ 1.
 */
export function designNL(vin: number, vs: number, pin: number, fsw: number, d: number, krf: number): { n: number; lp: number } | null {
  const dB = d * Math.sqrt(Math.max(krf, 1));
  if (!(dB < 1) || !(dB > 0)) return null;
  const vor = (vin * dB) / (1 - dB);
  return { n: vor / vs, lp: lBoundary(vin, dB, pin, fsw) / krf };
}

/** DCM duty for a given L_p, √(2·P_in·f_sw·L_p)/V_in: the largest duty this L_p allows (independent of N). */
export const dDcm = (vin: number, pin: number, fsw: number, lp: number): number => Math.sqrt(2 * pin * fsw * lp) / vin;

/** Output ripple (charge + ESR, exact on the PWL secondary current) — the buck page's evaluator. */
export function flybackOutputRipple(op: FlybackOp, iout: number, c: number, esr: number): number {
  return outputRipple(op.sec, iout, c, esr);
}

/** Leakage reset time (AN-4147): the clamp holds V_clamp − V_OR across L_lk until its current reaches zero. */
export const clampResetTime = (llk: number, ipk: number, vclamp: number, vor: number): number => (llk * ipk) / (vclamp - vor);

/**
 * Power the RCD clamp absorbs (AN-4147): ½·L_lk·I_pk²·f_sw·V_clamp/(V_clamp − V_OR). The factor exceeds 1
 * because the source keeps feeding V_OR into the clamp loop while the leakage current resets.
 */
export const clampPower = (llk: number, ipk: number, fsw: number, vclamp: number, vor: number): number =>
  0.5 * llk * ipk * ipk * fsw * (vclamp / (vclamp - vor));
