/**
 * BLDC / PMSM motor + inverter loss breakdown — equations only (pure, SI in/out).
 *
 * Current conventions (stated on the page):
 *   block (six-step, trapezoidal):  I = DC-link (= conducting phase) current, two phases in series:
 *       T_em = K_t·I,  P_Cu = I²·R_LL,  inverter conduction 2·I²·R_DS(on)  (one high- and one low-side switch)
 *   sinusoidal (FOC, i_d = 0):      I = phase current RMS, wye winding R_ph = R_LL/2:
 *       T_em = K_t·I,  P_Cu = 3·I²·R_ph = 1.5·I²·R_LL,  inverter conduction 3·I²·R_DS(on)
 *   (Krishnan, Permanent Magnet Synchronous and Brushless DC Motor Drives, CRC 2010, ch. 2/9; maxon "Key
 *   information" for the block-commutated data convention: terminal resistance phase–phase, K_t per A.)
 *
 * Speed-dependent losses at constant magnet flux (the flux-density amplitude in the core is set by the
 * magnets, so the Steinmetz/Bertotti loss separation reduces to a frequency dependence):
 *   iron   P_Fe(ω) = P_Fe,ref·[h·(ω/ω_ref) + (1 − h)·(ω/ω_ref)²]   hysteresis ∝ f, classical eddy ∝ f²
 *          (G. Bertotti, IEEE Trans. Magn. 24(1) 1988, 621–630; excess loss ∝ f^1.5 is not separated)
 *   mech.  P_fw(ω) = T_f·ω + B·ω²   Coulomb friction + viscous damping (the T_e = J dω/dt + Bω + T_L model)
 *   or, from a no-load test (I₀ at n₀): P₀(ω) = K_t·I₀·ω₀·[(1 − e)·(ω/ω₀) + e·(ω/ω₀)²]
 *
 * Inverter switching loss, linearised hard switching (Mohan, Undeland & Robbins, Power Electronics, 3rd ed.,
 * §2-3, eq. 2-6): P = ½·V_dc·I_sw·f_sw·(t_r + t_f) per switching leg; block: one leg switches I; sinusoidal:
 * three legs each switch |i(t)|, whose mean is (2√2/π)·I_rms. Conduction loss R_DS(on)·I² per conducting
 * MOSFET (Graovac, Pürschel, Kiep, "MOSFET Power Losses Calculation Using the Data-Sheet Parameters",
 * Infineon application note, 2006).
 *
 * Voltage limit: block  V_dc·m = K_t·ω + I·(R_LL + 2R_DS)   (commutation and inductance neglected)
 *                sinusoidal  V_ph,rms = |E + (R_ph + R_DS)·I + jω_e·L_ph·I|, E = K_t·ω/3, max V_dc/√6 (SVPWM)
 */

export type Drive = 'block' | 'sine';

export interface BldcParams {
  drive: Drive;
  /** line-to-line (terminal) resistance, Ω */
  rLL: number;
  /** torque constant in the drive's current convention, N·m/A */
  k: number;
  /** pole pairs */
  p: number;
  /** line-to-line inductance, H */
  lLL: number;
  /** speed-dependent losses */
  loss:
    | { form: 'coeff'; pFeRef: number; wRef: number; hyst: number; tFric: number; bVisc: number }
    | { form: 'noload'; i0: number; w0: number; eddy: number };
  /** inverter */
  vdc: number;
  rds: number;
  /** t_r + t_f, s */
  tsw: number;
  fsw: number;
  pCtrl: number;
}

export interface BldcPoint {
  speed: number;
  torque: number;
  /** electromagnetic torque, N·m */
  tEm: number;
  /** current in the drive's convention, A */
  current: number;
  pShaft: number;
  pCu: number;
  pFe: number;
  pFw: number;
  /** iron + friction in no-load-test mode (pFe / pFw are then 0) */
  pNoLoad: number;
  pCond: number;
  pSw: number;
  pCtrl: number;
  pMotorIn: number;
  pDc: number;
  pLoss: number;
  etaMotor: number;
  etaInv: number;
  etaSys: number;
  /** required voltage as a fraction of what the inverter can deliver (≤ 1 is feasible) */
  mod: number;
  /** block: needed DC voltage; sine: needed phase voltage (rms), V */
  vNeed: number;
  /** back-EMF: block E = K·ω (DC-equivalent), sine E_ph,rms = K·ω/3 */
  emf: number;
  iDc: number;
}

/** Speed-loss torque split: iron (or no-load) and mechanical parts, as torques (finite at ω = 0). */
export function lossTorques(b: BldcParams, w: number): { fe: number; fw: number; nl: number } {
  const L = b.loss;
  if (L.form === 'coeff') {
    const fe = L.wRef > 0 ? L.pFeRef * (L.hyst / L.wRef + ((1 - L.hyst) * w) / (L.wRef * L.wRef)) : 0;
    return { fe, fw: L.tFric + L.bVisc * w, nl: 0 };
  }
  const p0 = b.k * L.i0 * L.w0;
  const nl = L.w0 > 0 ? p0 * ((1 - L.eddy) / L.w0 + (L.eddy * w) / (L.w0 * L.w0)) : 0;
  return { fe: 0, fw: 0, nl };
}

export const copperFactor = (d: Drive): number => (d === 'block' ? 1 : 1.5);
export const condSwitches = (d: Drive): number => (d === 'block' ? 2 : 3);

/** Required voltage and its ratio to the inverter limit at speed w and current i. */
export function voltage(b: BldcParams, w: number, i: number): { vNeed: number; vMax: number; emf: number } {
  if (b.drive === 'block') {
    const emf = b.k * w;
    return { vNeed: emf + i * (b.rLL + 2 * b.rds), vMax: b.vdc, emf };
  }
  const emf = (b.k * w) / 3;
  const re = emf + (b.rLL / 2 + b.rds) * i;
  const im = b.p * w * (b.lLL / 2) * i;
  return { vNeed: Math.hypot(re, im), vMax: b.vdc / Math.sqrt(6), emf };
}

/** Full loss breakdown at speed w (rad/s) and shaft torque t (N·m). */
export function point(b: BldcParams, w: number, t: number): BldcPoint {
  const lt = lossTorques(b, w);
  const tEm = t + lt.fe + lt.fw + lt.nl;
  const i = tEm / b.k;
  const ai = Math.abs(i);
  const pCu = copperFactor(b.drive) * i * i * b.rLL;
  const pCond = condSwitches(b.drive) * i * i * b.rds;
  const pSw = b.drive === 'block' ? 0.5 * b.vdc * ai * b.tsw * b.fsw : 3 * 0.5 * b.vdc * ((2 * Math.SQRT2) / Math.PI) * ai * b.tsw * b.fsw;
  const pShaft = t * w;
  const pFe = lt.fe * w;
  const pFw = lt.fw * w;
  const pNoLoad = lt.nl * w;
  const pMotorIn = pShaft + pCu + pFe + pFw + pNoLoad;
  const pDc = pMotorIn + pCond + pSw + b.pCtrl;
  const v = voltage(b, w, i);
  return {
    speed: w,
    torque: t,
    tEm,
    current: i,
    pShaft,
    pCu,
    pFe,
    pFw,
    pNoLoad,
    pCond,
    pSw,
    pCtrl: b.pCtrl,
    pMotorIn,
    pDc,
    pLoss: pDc - pShaft,
    etaMotor: pMotorIn > 0 && pShaft > 0 ? pShaft / pMotorIn : 0,
    etaInv: pDc > 0 && pMotorIn > 0 ? pMotorIn / pDc : 0,
    etaSys: pDc > 0 && pShaft > 0 ? pShaft / pDc : 0,
    mod: v.vMax > 0 ? v.vNeed / v.vMax : Infinity,
    vNeed: v.vNeed,
    emf: v.emf,
    iDc: b.vdc > 0 ? pDc / b.vdc : 0,
  };
}

/** Shaft torque for current i at speed w (exact inverse of point()'s T_em = T + T_loss). */
export const torqueForCurrent = (b: BldcParams, w: number, i: number): number => {
  const lt = lossTorques(b, w);
  return b.k * i - lt.fe - lt.fw - lt.nl;
};

/** Upper bound on speed from the back-EMF alone. */
export const emfSpeedLimit = (b: BldcParams): number => (b.drive === 'block' ? b.vdc / b.k : (3 * b.vdc) / (Math.sqrt(6) * b.k));

/** Torque in [0, tHi] with the highest system efficiency at speed w (golden-section search; η is unimodal in T). */
export function bestTorque(b: BldcParams, w: number, tHi: number): { t: number; eta: number } {
  const g = (t: number) => point(b, w, t).etaSys;
  let a = 0;
  let c = tHi;
  const r = (Math.sqrt(5) - 1) / 2;
  let x1 = c - r * (c - a);
  let x2 = a + r * (c - a);
  let f1 = g(x1);
  let f2 = g(x2);
  for (let k = 0; k < 80 && c - a > 1e-10 * tHi; k++) {
    if (f1 < f2) {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + r * (c - a);
      f2 = g(x2);
    } else {
      c = x2;
      x2 = x1;
      f2 = f1;
      x1 = c - r * (c - a);
      f1 = g(x1);
    }
  }
  const t = (a + c) / 2;
  return { t, eta: g(t) };
}
