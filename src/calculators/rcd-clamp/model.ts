/**
 * RCD clamp (snubber) for a flyback's leakage inductance — steady-state design equations. Pure, SI in / out.
 *
 * Sources:
 *  - H.-S. Choi, Fairchild (onsemi) AN-4147, "Design Guidelines for RCD Snubber of Flyback Converters" (2006):
 *    t_s = L_lk·I_pk/(V_sn − V_RO); P_sn = ½·L_lk·I_pk²·f_s·V_sn/(V_sn − V_RO); R_sn = V_sn²/P_sn;
 *    C_sn = V_sn/(ΔV_sn·R_sn·f_s); V_DS,max = V_DC,max + V_sn.
 *  - Fairchild AN-4137 (flyback design; V_RO, drain stress) and TI SLUP254 (Picard, flyback clamp options).
 *  - Derivation (checks the factor): while the clamp diode conducts, the leakage current falls linearly from
 *    I_pk to 0 in t_s with V_sn − V_RO across L_lk; the charge ½·I_pk·t_s enters the clamp at V_sn, so the
 *    clamp energy per cycle is V_sn·½·I_pk·t_s = ½·L_lk·I_pk²·V_sn/(V_sn − V_RO).
 *
 * The leakage loss and reset time are imported from the flyback model so both pages use one formula.
 */

import { clampPower, clampResetTime } from '../flyback-converter/model';

export { clampPower, clampResetTime };

export interface ClampInputs {
  llk: number;
  ipk: number;
  fsw: number;
  vor: number;
}

/** R that holds the clamp at vclamp: V²/P = 2·V·(V − V_OR)/(L_lk·I_pk²·f). */
export const rForClamp = (p: ClampInputs, vclamp: number): number => (2 * vclamp * (vclamp - p.vor)) / (p.llk * p.ipk * p.ipk * p.fsw);

/** Clamp voltage a resistor settles at: positive root of 2V² − 2·V_OR·V − R·L_lk·I_pk²·f = 0. */
export const clampForR = (p: ClampInputs, r: number): number => (p.vor + Math.sqrt(p.vor * p.vor + 2 * r * p.llk * p.ipk * p.ipk * p.fsw)) / 2;

/** C for a peak-to-peak clamp ripple ΔV/V = ripple: C = V/(ΔV·R·f) = 1/(ripple·R·f). */
export const cForRipple = (r: number, fsw: number, ripple: number): number => 1 / (ripple * r * fsw);

export interface ClampOp {
  vclamp: number;
  r: number;
  /** clamp (resistor) power */
  p: number;
  /** bare leakage energy rate ½·L·I²·f */
  pLeak: number;
  /** V_clamp/(V_clamp − V_OR) */
  factor: number;
  ts: number;
  /** clamp diode average current ½·I_pk·t_s·f */
  iDavg: number;
}

export function clampOp(p: ClampInputs, vclamp: number, r: number): ClampOp {
  const ts = clampResetTime(p.llk, p.ipk, vclamp, p.vor);
  return {
    vclamp,
    r,
    p: clampPower(p.llk, p.ipk, p.fsw, vclamp, p.vor),
    pLeak: 0.5 * p.llk * p.ipk * p.ipk * p.fsw,
    factor: vclamp / (vclamp - p.vor),
    ts,
    iDavg: 0.5 * p.ipk * ts * p.fsw,
  };
}

/**
 * Clamp-capacitor voltage over one period (for the waveform graph): during t_s the diode current
 * I_pk·(1 − t/t_s) charges C (R's discharge neglected over that short interval), then C decays through R.
 * Steady state: v_peak·(1 − e^{−(T − t_s)/RC}) = Q/C with Q = ½·I_pk·t_s. Returns samples of (t, v_C, i_D).
 */
export function clampWave(p: ClampInputs, op: ClampOp, c: number, n = 160): { t: number[]; v: number[]; i: number[] } {
  const T = 1 / p.fsw;
  const ts = Math.min(op.ts, T);
  const tau = op.r * c;
  const q = 0.5 * p.ipk * ts;
  const decay = Math.exp(-(T - ts) / tau);
  const vPk = q / c / (1 - decay);
  const v0 = vPk * decay;
  const t: number[] = [];
  const v: number[] = [];
  const i: number[] = [];
  const xs = Array.from({ length: n + 1 }, (_, k) => (k / n) * T);
  xs.push(ts);
  xs.sort((a, b) => a - b);
  for (const x of xs) {
    t.push(x);
    if (x <= ts) {
      v.push(v0 + (p.ipk * x - (p.ipk * x * x) / (2 * ts)) / c);
      i.push(p.ipk * (1 - x / ts));
    } else {
      v.push(vPk * Math.exp(-(x - ts) / tau));
      i.push(0);
    }
  }
  return { t, v, i };
}
