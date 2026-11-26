/**
 * PWM-driven permanent-magnet brushed DC motor — equations only (pure, SI in/out).
 *
 * Armature circuit (motor R, L, back-EMF E = K·ω) fed from a switching bridge. Within one PWM period the
 * speed is taken as constant (mechanical time constant ≫ PWM period), so the armature current obeys the
 * first-order equation  L di/dt = v(t) − R_x·i − E  piecewise, with v and R_x fixed in each switch state:
 *
 *   low-side switch + freewheel diode:  on  v = V_s,   R_x = R + R_on       off (i > 0)  v = −V_f, R_x = R
 *                                       i = 0 when the diode current runs out (discontinuous conduction)
 *   H-bridge, sign-magnitude, synchronous rectification:   on  v = V_s, off  v = 0,    R_x = R + 2R_on
 *   H-bridge, locked anti-phase (bipolar switching):       on  v = V_s, off  v = −V_s, R_x = R + 2R_on
 *
 * Each interval is solved exactly, i(t) = I∞ + (i₀ − I∞)·e^(−t/τ), τ = L/R_x, I∞ = (v − E)/R_x, and the periodic
 * steady state follows from i(T) = i(0). Averages and RMS values are exact integrals of the exponentials.
 * For τ ≫ T this reduces to the textbook small-ripple result ΔI_pp = V_s·D·(1 − D)/(L·f) (sign-magnitude)
 * and 2·V_s·D·(1 − D)/(L·f) (anti-phase): N. Mohan, T. Undeland, W. Robbins, Power Electronics, 3rd ed.,
 * Wiley 2003, ch. 7 (§7-3 step-down converter ripple, which the low-side and sign-magnitude drives follow;
 * §7-6 full-bridge converter with bipolar voltage switching = locked anti-phase) and ch. 13 (dc motor drives).
 * (Mohan's unipolar full-bridge scheme switches both legs and ripples at 2f; it is not modelled here.)
 *
 * Torque balance with the brushed-motor model of ../dc-motor-speed (maxon "Key information"; Hughes & Drury,
 * Electric Motors and Drives, 4th ed., ch. 3): mean electromagnetic torque K·Ī = T_L + K·I₀ (no-load current
 * I₀ as a constant friction/iron-loss torque). Ī(ω) falls monotonically with ω, so the speed is the root of
 * K(Ī(ω) − I₀) = T_L (Brent), and the duty for a target speed is the root of Ī(ω, D) = T_L/K + I₀.
 */

import { brent } from '@/core/calc/solve';

export type Drive = 'lowside' | 'sync' | 'antiphase';

export interface PwmCircuit {
  drive: Drive;
  /** supply voltage, V */
  vs: number;
  /** duty cycle 0 … 1 (on-state fraction of the period) */
  d: number;
  /** PWM frequency, Hz */
  f: number;
  /** switch on-resistance, Ω */
  ron: number;
  /** freewheel diode forward drop, V (low-side drive only) */
  vd: number;
  /** armature resistance (at winding temperature), Ω */
  r: number;
  /** total inductance in the armature loop (motor + series choke), H */
  l: number;
}

/** One interval of constant applied voltage: i(s) = iInf + (i0 − iInf)·e^(−s/τ), 0 ≤ s ≤ dt. */
export interface Segment {
  t0: number;
  dt: number;
  i0: number;
  iInf: number;
  tau: number;
  /** voltage across the motor terminals during the interval; null = depends on i (v = E + R·i + L di/dt) */
  vTerm: number | null;
  /** current flows from the supply (+1), back into it (−1) or not at all (0) */
  supply: 1 | -1 | 0;
  /** resistance of the switches / Schottky in the path, and diode drop, for loss accounting */
  rSw: number;
  vDiode: number;
  zero?: boolean;
}

export interface Waveform {
  mode: 'ccm' | 'dcm' | 'off';
  segments: Segment[];
  /** current at the start / end of the on interval (min / max in CCM) */
  iStart: number;
  iPeak: number;
  iMin: number;
  iMax: number;
  ripple: number;
  iAvg: number;
  iRms: number;
  /** average voltage across the motor terminals = E + R·Ī (exact: the inductor averages to zero) */
  vMotor: number;
  /** average bridge output voltage (incl. switch / diode drops) */
  vBridge: number;
  isAvg: number;
  isRms: number;
  /** losses, W */
  pSw: number;
  pDiode: number;
  pCu: number;
  /** time the current is zero per period (DCM), s */
  tZero: number;
}

const em1 = (x: number) => -Math.expm1(-x); // 1 − e^(−x), accurate for small x

/** ∫₀^dt i ds and ∫₀^dt i² ds of one segment. */
function integrals(sg: Segment): { a: number; q: number } {
  if (sg.zero) return { a: 0, q: 0 };
  const b = sg.i0 - sg.iInf;
  const e1 = Number.isFinite(sg.tau) ? sg.tau * em1(sg.dt / sg.tau) : sg.dt;
  const e2 = Number.isFinite(sg.tau) ? (sg.tau / 2) * em1((2 * sg.dt) / sg.tau) : sg.dt;
  return { a: sg.iInf * sg.dt + b * e1, q: sg.iInf * sg.iInf * sg.dt + 2 * sg.iInf * b * e1 + b * b * e2 };
}

export const segValue = (sg: Segment, s: number): number => (sg.zero ? 0 : sg.iInf + (sg.i0 - sg.iInf) * Math.exp(-s / sg.tau));

/** Applied voltage, loop resistance and supply direction in the two switch states. */
export function states(c: PwmCircuit): { v1: number; r1: number; v2: number; r2: number; sw1: number; sw2: number; vd2: number; sup2: 1 | -1 | 0 } {
  if (c.drive === 'lowside') return { v1: c.vs, r1: c.r + c.ron, v2: -c.vd, r2: c.r, sw1: c.ron, sw2: 0, vd2: c.vd, sup2: 0 };
  if (c.drive === 'sync') return { v1: c.vs, r1: c.r + 2 * c.ron, v2: 0, r2: c.r + 2 * c.ron, sw1: 2 * c.ron, sw2: 2 * c.ron, vd2: 0, sup2: 0 };
  return { v1: c.vs, r1: c.r + 2 * c.ron, v2: -c.vs, r2: c.r + 2 * c.ron, sw1: 2 * c.ron, sw2: 2 * c.ron, vd2: 0, sup2: -1 };
}

/** Periodic steady-state armature current for back-EMF e (V). */
export function waveform(c: PwmCircuit, e: number): Waveform {
  const T = 1 / c.f;
  const d = Math.min(Math.max(c.d, 0), 1);
  const ton = d * T;
  const toff = T - ton;
  const st = states(c);
  const tau1 = c.l / st.r1;
  const tau2 = c.l / st.r2;
  const inf1 = (st.v1 - e) / st.r1;
  const inf2 = (st.v2 - e) / st.r2;
  const x1 = ton / tau1;
  const x2 = toff / tau2;
  const a1 = Math.exp(-x1);
  const a2 = Math.exp(-x2);
  // CCM periodic solution: i(0) = I0, i(ton) = I1, i(T) = I0
  const den = em1(x1 + x2);
  let i0 = den > 0 ? (inf2 * em1(x2) + a2 * inf1 * em1(x1)) / den : d * inf1 + (1 - d) * inf2;
  let mode: Waveform['mode'] = 'ccm';
  const segs: Segment[] = [];
  let tZero = 0;
  if (c.drive === 'lowside' && i0 < 0) {
    // diode blocks negative current: discontinuous conduction (or no current at all)
    if (inf1 <= 0 || ton === 0) {
      mode = 'off';
      i0 = 0;
      segs.push({ t0: 0, dt: T, i0: 0, iInf: 0, tau: Infinity, vTerm: e, supply: 0, rSw: 0, vDiode: 0, zero: true });
      tZero = T;
    } else {
      mode = 'dcm';
      i0 = 0;
      const i1 = inf1 * em1(x1);
      // current reaches zero at tx after turn-off (inf2 < 0 here)
      let tx = inf2 < 0 ? tau2 * Math.log((i1 - inf2) / -inf2) : toff;
      tx = Math.min(Math.max(tx, 0), toff);
      segs.push({ t0: 0, dt: ton, i0: 0, iInf: inf1, tau: tau1, vTerm: st.v1 + 0, supply: 1, rSw: st.sw1, vDiode: 0 });
      segs.push({ t0: ton, dt: tx, i0: i1, iInf: inf2, tau: tau2, vTerm: st.v2, supply: st.sup2, rSw: st.sw2, vDiode: st.vd2 });
      if (toff - tx > 0) segs.push({ t0: ton + tx, dt: toff - tx, i0: 0, iInf: 0, tau: Infinity, vTerm: e, supply: 0, rSw: 0, vDiode: 0, zero: true });
      tZero = toff - tx;
    }
  }
  if (mode === 'ccm') {
    const i1 = inf1 + (i0 - inf1) * a1;
    segs.push({ t0: 0, dt: ton, i0, iInf: inf1, tau: tau1, vTerm: st.v1, supply: 1, rSw: st.sw1, vDiode: 0 });
    segs.push({ t0: ton, dt: toff, i0: i1, iInf: inf2, tau: tau2, vTerm: st.v2, supply: st.sup2, rSw: st.sw2, vDiode: st.vd2 });
  }
  // the bridge output during an interval is v minus the switch drop (motor terminals see v − R_sw·i)
  let sumA = 0;
  let sumQ = 0;
  let sA = 0;
  let sQ = 0;
  let pSw = 0;
  let pDiode = 0;
  let vBridgeInt = 0;
  for (const sg of segs) {
    const { a, q } = integrals(sg);
    sumA += a;
    sumQ += q;
    sA += sg.supply * a;
    if (sg.supply !== 0) sQ += q;
    pSw += sg.rSw * q;
    pDiode += sg.vDiode * a;
    vBridgeInt += sg.zero ? e * sg.dt : (sg.vTerm ?? 0) * sg.dt - sg.rSw * a;
  }
  const ends = segs.flatMap((sg) => [sg.i0, segValue(sg, sg.dt)]);
  const iMin = Math.min(...ends);
  const iMax = Math.max(...ends);
  // a mean that cancels to round-off (anti-phase at 50 %: ±3.6 A ripple, mean 1e-14 A) is shown as 0, not "−8.67 fA"
  const iAvgRaw = sumA / T;
  const iAvg = Math.abs(iAvgRaw) <= 1e-12 * Math.max(Math.abs(iMin), Math.abs(iMax)) ? 0 : iAvgRaw;
  const rm = c.r;
  return {
    mode,
    segments: segs,
    iStart: i0,
    iPeak: segs[0].zero ? 0 : segValue(segs[0], segs[0].dt),
    iMin,
    iMax,
    ripple: iMax - iMin,
    iAvg,
    iRms: Math.sqrt(Math.max(sumQ / T, 0)),
    vMotor: e + rm * iAvg,
    vBridge: vBridgeInt / T,
    isAvg: sA / T,
    isRms: Math.sqrt(Math.max(sQ / T, 0)),
    pSw: pSw / T,
    pDiode: pDiode / T,
    pCu: (rm * sumQ) / T,
    tZero,
  };
}

/** Sampled waveform over `periods` PWM periods: time, current and motor terminal voltage. */
export function sampleWaveform(c: PwmCircuit, e: number, w: Waveform, periods = 3, perSeg = 40): { t: number[]; i: number[]; v: number[] } {
  const T = 1 / c.f;
  const t: number[] = [];
  const i: number[] = [];
  const v: number[] = [];
  for (let p = 0; p < periods; p++) {
    for (const sg of w.segments) {
      if (!(sg.dt > 0)) continue;
      const n = sg.zero ? 2 : perSeg;
      for (let k = 0; k <= n; k++) {
        const s = (sg.dt * k) / n;
        const cur = segValue(sg, s);
        t.push(p * T + sg.t0 + s);
        i.push(cur);
        v.push(sg.zero ? e : (sg.vTerm ?? 0) - sg.rSw * cur);
      }
    }
  }
  return { t, i, v };
}

export interface MotorLoad {
  /** torque constant K, N·m/A */
  k: number;
  /** no-load current I₀, A */
  i0: number;
  /** load torque, N·m (≥ 0) */
  tL: number;
}

/** Mean current needed at the shaft: K·Ī = T_L + K·I₀. */
export const currentNeeded = (m: MotorLoad): number => m.tL / m.k + m.i0;

export interface PwmOperatingPoint {
  /** 'run', or 'stalled' when the drive cannot overcome T_L + friction at standstill */
  regime: 'run' | 'stalled';
  speed: number;
  e: number;
  w: Waveform;
}

/** Operating speed at duty c.d: root of K(Ī(ω) − I₀) = T_L on 0 ≤ ω ≤ V_s/K. */
export function operate(c: PwmCircuit, m: MotorLoad): PwmOperatingPoint {
  const need = currentNeeded(m);
  const f = (w: number) => waveform(c, m.k * w).iAvg - need;
  const f0 = f(0);
  if (!(f0 > 0)) return { regime: 'stalled', speed: 0, e: 0, w: waveform(c, 0) };
  const hi = c.vs / m.k;
  const fHi = f(hi);
  // f(V_s/K) ≤ 0 always (no forward current can flow once E ≥ V_s); guard rounding at the end point
  const w = fHi >= 0 ? hi : brent(f, 0, hi, 1e-13 * hi);
  return { regime: 'run', speed: w, e: m.k * w, w: waveform(c, m.k * w) };
}

/** Duty for speed ω at load m: root of Ī(ω, D) = T_L/K + I₀ on 0 ≤ D ≤ 1; null when 100 % is not enough. */
export function dutyFor(c: PwmCircuit, m: MotorLoad, speed: number): number | null {
  const need = currentNeeded(m);
  const e = m.k * speed;
  const g = (d: number) => waveform({ ...c, d }, e).iAvg - need;
  const g1 = g(1);
  // a speed solved at 100 % duty and fed back may miss by round-off: accept it as 100 %
  if (g1 < 0) return -g1 <= 1e-9 * Math.max(need, Math.abs(waveform({ ...c, d: 1 }, e).iAvg), 1e-12) ? 1 : null;
  if (g1 === 0) return 1;
  const g0 = g(0);
  if (g0 >= 0) return 0;
  return brent(g, 0, 1, 1e-14);
}

/** Load torque at which the motor turns at ω on duty c.d (may be negative: speed above no-load). */
export const torqueAt = (c: PwmCircuit, m: Omit<MotorLoad, 'tL'>, speed: number): number => m.k * (waveform(c, m.k * speed).iAvg - m.i0);
