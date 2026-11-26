/**
 * Boost (step-up) converter power stage — steady-state equations. Pure, SI in / SI out.
 *
 * Sources:
 *  - B. Hauke, "Basic Calculation of a Boost Converter's Power Stage", TI SLVA372 (rev. D): eq. 1 duty
 *    D = 1 − Vin·η/Vout, eq. 4 ripple ΔIL = Vin·D/(fs·L), eq. 5 Isw,max = ΔIL/2 + Iout/(1 − D), eq. 6 L,
 *    eq. 7 diode average current = Iout, eq. 9 Cout(min) = Iout·D/(fs·ΔVout), eq. 10 ΔVout(ESR) = ESR·(Iout/(1 − D) + ΔIL/2).
 *  - R. W. Erickson, D. Maksimović, Fundamentals of Power Electronics, 2nd ed.: ch. 2 (volt-second and charge
 *    balance), ch. 3 §3.3–3.4 (boost with inductor resistance and switch/diode drops: the averaged
 *    steady-state model), ch. 5 §5.3 (boost in DCM), ch. 8 §8.2 (right-half-plane zero ω_z = (1 − D)²R/L).
 *  - Switching loss ½·V·I·(tr + tf)·fs: Erickson §4.3; gate drive Qg·Vdrv·fs: Balogh, TI SLUA618;
 *    diode reverse-recovery loss Qrr·Vout·fs: Erickson §4.3 (switching loss, diode recovered charge).
 *
 * The inductor current is treated as piecewise linear. The diode (rectifier) current feeds Cout ‖ load and the
 * inductor current is drawn through Cin, so both ripples are evaluated exactly on those waveforms with the buck
 * page's charge + ESR routine.
 */

import { brent } from '@/core/calc/solve';
import { outputRipple, type Segment } from '../buck-converter/model';

export type Rectifier = 'sync' | 'diode';
export type Mode = 'ccm' | 'dcm' | 'ccm-negative';

export interface BoostInputs {
  vin: number;
  vout: number;
  iout: number;
  fsw: number;
  l: number;
  dcr: number;
  cout: number;
  esr: number;
  rect: Rectifier;
  /** low-side (main) switch on-resistance */
  rSw: number;
  /** synchronous rectifier on-resistance (sync only) */
  rRect: number;
  vf: number;
  qrr: number;
  tsw: number;
  qg: number;
  vdrv: number;
  pCore: number;
  cin: number;
  esrIn: number;
}

export interface BoostOutputs {
  mode: Mode;
  d: number;
  d2: number;
  dIdeal: number;
  ton: number;
  iLavg: number;
  dIL: number;
  /** ΔIL / I_L,avg */
  rippleRatio: number;
  iPk: number;
  iValley: number;
  iLrms: number;
  iSwRms: number;
  iSwAvg: number;
  iDAvg: number;
  iDRms: number;
  /** Output current at the CCM/DCM boundary for this L, fsw and Vin */
  iCrit: number;
  /** L at the CCM/DCM boundary for this load */
  lCrit: number;
  dVout: number;
  /** charge part alone Iout·D/(fs·C) (SLVA372 eq. 9, CCM) and ESR part alone ESR·Ipk (eq. 10) */
  dVoutC: number;
  dVoutEsr: number;
  iCoutRms: number;
  iCinRms: number;
  dVin: number;
  /** right-half-plane zero (CCM), Hz */
  fRhp: number;
  /** inductor L/R time constant L/(DCR + R_sw); the linear-ramp model needs t_on ≪ τ */
  tau: number;
  loss: { sw: number; swCond: number; rect: number; qrr: number; dcr: number; core: number; edge: number; gate: number; cout: number; cin: number; total: number };
  pout: number;
  pin: number;
  eff: number;
  iinAvg: number;
  segments: Segment[];
  period: number;
}

/**
 * CCM duty with conduction drops (Erickson ch. 3 averaged model). With D' = 1 − D, I_L = Iout/D' and
 * V_off = V_F (diode) or I_L·R_rect (sync), volt-second balance
 *   Vin − I_L·DCR − D·I_L·R_sw − D'·(Vout + V_off) = 0
 * multiplied by D' is the quadratic (Vout + V_F)·D'² − (Vin + Iout·R_sw − Iout·R_rect)·D' + Iout·(DCR + R_sw) = 0.
 * The larger root is the normal operating point; no real root means Vout is beyond the converter's peak gain.
 */
export function ccmDuty(p: BoostInputs): number | null {
  const a = p.vout + (p.rect === 'diode' ? p.vf : 0);
  const b = p.vin + p.iout * p.rSw - (p.rect === 'sync' ? p.iout * p.rRect : 0);
  const c = p.iout * (p.dcr + p.rSw);
  const disc = b * b - 4 * a * c;
  if (!(disc >= 0) || !(b > 0)) return null;
  const dp = (b + Math.sqrt(disc)) / (2 * a);
  const d = 1 - dp;
  return d >= 0 && d < 1 ? d : null;
}

function pwlStats(segs: Segment[], T: number, pick: (k: number) => boolean): { avg: number; rms: number } {
  let q = 0;
  let q2 = 0;
  segs.forEach((s, k) => {
    if (!pick(k)) return;
    const dt = s.t1 - s.t0;
    q += ((s.i0 + s.i1) / 2) * dt;
    q2 += ((s.i0 * s.i0 + s.i0 * s.i1 + s.i1 * s.i1) / 3) * dt;
  });
  return { avg: q / T, rms: Math.sqrt(Math.max(q2 / T, 0)) };
}

/**
 * Diode boost in DCM (Erickson ch. 5) with the drops kept at the interval-average current ipk/2 (equal to I_L at
 * the CCM boundary, so the two solutions meet): up = Vin − (ipk/2)(DCR + R_sw), dn = Vout + V_F − Vin + (ipk/2)·DCR,
 * D1 = ipk·L·fs/up, D2 = ipk·L·fs/dn, Iout = ipk·D2/2 (the diode carries the falling ramp). Iout(ipk) is increasing.
 */
export function dcmSolve(p: BoostInputs): { ipk: number; d1: number; d2: number } | null {
  const T = 1 / p.fsw;
  const rUp = p.dcr + p.rSw;
  const up = (i: number) => p.vin - (i / 2) * rUp;
  const dn = (i: number) => p.vout + p.vf - p.vin + (i / 2) * p.dcr;
  if (!(dn(0) > 0)) return null;
  const f = (i: number) => (i * i * p.l) / (2 * T * dn(i)) - p.iout;
  let hi = rUp > 0 ? (2 * p.vin / rUp) * (1 - 1e-9) : 4 * p.iout + 1;
  if (rUp === 0) for (let k = 0; k < 200 && f(hi) < 0; k++) hi *= 2;
  if (!(f(hi) > 0)) return null;
  const ipk = brent(f, 0, hi, 1e-15);
  return { ipk, d1: (ipk * p.l) / (up(ipk) * T), d2: (ipk * p.l) / (dn(ipk) * T) };
}

/** Null when no steady state exists in the model: Vout out of reach (no duty), or no self-consistent waveform. */
export function analyzeBoost(p: BoostInputs): BoostOutputs | null {
  const T = 1 / p.fsw;
  const I = p.iout;
  const dIdeal = 1 - p.vin / p.vout;
  const dc = ccmDuty(p);
  if (dc == null) return null;
  const iL = I / (1 - dc);
  const vOn = p.vin - iL * (p.dcr + p.rSw); // across L while the switch is on
  const vOffDrop = p.rect === 'sync' ? iL * p.rRect : p.vf;
  const dILccm = (vOn * dc * T) / p.l;
  let mode: Mode = dILccm / 2 > iL ? (p.rect === 'diode' ? 'dcm' : 'ccm-negative') : 'ccm';
  let dcm: ReturnType<typeof dcmSolve> = null;
  if (mode === 'dcm') {
    dcm = dcmSolve(p);
    if (!dcm || dcm.d1 + dcm.d2 >= 1) {
      // Right at the boundary (rounding) the CCM answer is the same; anywhere else neither waveform is
      // self-consistent: the resistive drops are so large that the averaged-drop model breaks down.
      if (dILccm / 2 <= iL * (1 + 1e-6)) mode = 'ccm';
      else return null;
    }
  }
  let segs: Segment[];
  let d = dc;
  let d2 = 1 - dc;
  let dIL = dILccm;
  if (mode === 'dcm' && dcm) {
    d = dcm.d1;
    d2 = dcm.d2;
    dIL = dcm.ipk;
    segs = [
      { t0: 0, t1: d * T, i0: 0, i1: dcm.ipk, vsw: (dcm.ipk / 2) * p.rSw },
      { t0: d * T, t1: (d + d2) * T, i0: dcm.ipk, i1: 0, vsw: p.vout + p.vf },
      { t0: (d + d2) * T, t1: T, i0: 0, i1: 0, vsw: p.vin },
    ];
  } else {
    segs = [
      { t0: 0, t1: dc * T, i0: iL - dIL / 2, i1: iL + dIL / 2, vsw: iL * p.rSw },
      { t0: dc * T, t1: T, i0: iL + dIL / 2, i1: iL - dIL / 2, vsw: p.vout + vOffDrop },
    ];
  }
  const all = pwlStats(segs, T, () => true);
  const sw = pwlStats(segs, T, (k) => k === 0);
  const rc = pwlStats(segs, T, (k) => k === 1);
  const iPk = Math.max(...segs.map((s) => Math.max(s.i0, s.i1)));
  const iValley = Math.min(...segs.map((s) => Math.min(s.i0, s.i1)));
  // Output: Cout ‖ load is fed by the rectifier current (zero while the switch is on).
  const rSegs = segs.map((s, k) => (k === 1 ? s : { ...s, i0: 0, i1: 0 }));
  const dVout = outputRipple(rSegs, I, p.cout, p.esr);
  const dVoutC = mode === 'dcm' ? outputRipple(rSegs, I, p.cout, 0) : (I * d) / (p.fsw * p.cout);
  const dVoutEsr = p.esr * iPk;
  // Input: the source supplies the average, Cin the AC part of the inductor current.
  const dVin = outputRipple(segs, all.avg, p.cin, p.esrIn);
  const iCoutRms = Math.sqrt(Math.max(rc.rms * rc.rms - I * I, 0));
  const iCinRms = Math.sqrt(Math.max(all.rms * all.rms - all.avg * all.avg, 0));

  const swCond = sw.rms * sw.rms * p.rSw;
  const rect = p.rect === 'sync' ? rc.rms * rc.rms * p.rRect : rc.avg * p.vf;
  const qrr = p.rect === 'diode' && mode !== 'dcm' ? p.qrr * p.vout * p.fsw : 0; // DCM: the diode turns off at zero current
  const dcr = all.rms * all.rms * p.dcr;
  // Hard switching against the output voltage: turn-on at the valley, turn-off at the peak current.
  const vSwitched = p.vout + (p.rect === 'diode' ? p.vf : 0);
  const edge = 0.5 * vSwitched * (Math.max(segs[0].i0, 0) + Math.max(segs[0].i1, 0)) * (p.tsw / 2) * p.fsw;
  const gate = p.qg * p.vdrv * p.fsw;
  const cout = iCoutRms * iCoutRms * p.esr;
  const cin = iCinRms * iCinRms * p.esrIn;
  const total = swCond + rect + qrr + dcr + p.pCore + edge + gate + cout + cin;
  const pout = p.vout * I;
  const pin = pout + total;
  // CCM boundary: ΔIL/2 = I_L. For fixed D (lossless form), I_L scales with Iout, ΔIL does not.
  const iCrit = (dILccm / 2) * (1 - dc);
  const lCrit = (p.l * dILccm) / (2 * iL);
  const fRhp = (p.vout * (1 - dc) ** 2) / (2 * Math.PI * p.l * I);
  return {
    mode,
    d,
    d2,
    dIdeal,
    ton: d * T,
    iLavg: all.avg,
    dIL,
    rippleRatio: dIL / all.avg,
    iPk,
    iValley,
    iLrms: all.rms,
    iSwRms: sw.rms,
    iSwAvg: sw.avg,
    iDAvg: rc.avg,
    iDRms: rc.rms,
    iCrit,
    lCrit,
    dVout,
    dVoutC,
    dVoutEsr,
    iCoutRms,
    iCinRms,
    dVin,
    fRhp,
    tau: p.l / (p.dcr + p.rSw),
    loss: { sw: swCond + edge, swCond, rect, qrr, dcr, core: p.pCore, edge, gate, cout, cin, total },
    pout,
    pin,
    eff: pout / pin,
    iinAvg: pin / p.vin,
    segments: segs,
    period: T,
  };
}

/** Highest output current the lossy boost can deliver at this Vin (peak of the CCM gain curve). */
export function maxOutputCurrent(p: BoostInputs): number {
  // disc = b² − 4ac ≥ 0 with b, c linear in Iout: solve by bisection on the sign of the discriminant
  let lo = 0;
  let hi = 1e6;
  if (ccmDuty({ ...p, iout: hi }) != null) return hi;
  for (let k = 0; k < 200; k++) {
    const m = Math.sqrt(Math.max(lo, 1e-12) * hi);
    if (ccmDuty({ ...p, iout: m }) != null) lo = m;
    else hi = m;
    if (hi / Math.max(lo, 1e-300) < 1 + 1e-12) break;
  }
  return lo;
}
