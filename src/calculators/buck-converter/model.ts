/**
 * Buck (step-down) converter power stage — steady-state equations. Pure, SI in / SI out.
 *
 * Sources:
 *  - B. Hauke, "Basic Calculation of a Buck Converter's Power Stage", TI SLVA477 (rev. C):
 *    eq. 2 ripple ΔIL = (Vin − Vout)·D/(fs·L), eq. 5 L, eq. 7 diode current, eq. 12 Cout(min) = ΔIL/(8·fs·ΔVout),
 *    eq. 13 ΔVout(ESR) = ESR·ΔIL, eq. 14 Cout for a load step.
 *  - R. W. Erickson, D. Maksimović, Fundamentals of Power Electronics, 2nd ed.: ch. 2 (inductor volt-second
 *    and capacitor charge balance), ch. 3 (steady-state model with conduction losses: switch on-resistance,
 *    inductor winding resistance, diode forward voltage), ch. 5 (discontinuous conduction mode of the buck).
 *  - Switching-loss estimate ½·Vin·I·(tr + tf)·fs and gate-drive loss Qg·Vdrv·fs: Erickson §4.3;
 *    L. Balogh, "Fundamentals of MOSFET and IGBT Gate Driver Circuits", TI SLUA618.
 *
 * The inductor current is treated as a piecewise-linear waveform (constant voltage across L in each
 * interval). The output ripple is evaluated exactly on that waveform (capacitor charge + ESR drop), so
 * the textbook ΔIL/(8·fs·C) and ESR·ΔIL forms come out as the two limiting cases.
 */

import { brent } from '@/core/calc/solve';

export type Rectifier = 'sync' | 'diode';

export interface BuckInputs {
  vin: number;
  vout: number;
  iout: number;
  fsw: number;
  l: number;
  dcr: number;
  cout: number;
  esr: number;
  rect: Rectifier;
  rHs: number;
  rLs: number;
  vf: number;
  /** tr + tf of the switch node (s) */
  tsw: number;
  /** total gate charge of the switch(es), C */
  qg: number;
  vdrv: number;
  cin: number;
  esrIn: number;
}

/** One linear piece of the inductor current: from t0 to t1 the current goes i0 → i1; v_sw is the switch-node level. */
export interface Segment {
  t0: number;
  t1: number;
  i0: number;
  i1: number;
  vsw: number;
}

export type Mode = 'ccm' | 'dcm' | 'ccm-negative';

export interface BuckOutputs {
  mode: Mode;
  /** CCM duty (with conduction drops); in DCM: the on-time fraction D1 */
  d: number;
  /** DCM: fraction of the period the rectifier conducts */
  d2: number;
  /** Ideal duty Vout/Vin (reference) */
  dIdeal: number;
  ton: number;
  toff: number;
  /** Inductor ripple current, peak-to-peak */
  dIL: number;
  /** ΔIL / Iout */
  rippleRatio: number;
  iPk: number;
  iValley: number;
  iLrms: number;
  /** High-side switch RMS and average currents */
  iHsRms: number;
  iHsAvg: number;
  /** Low-side switch / diode RMS and average currents */
  iLsRms: number;
  iLsAvg: number;
  /** Load current at the CCM/DCM boundary (= ΔIL/2 at this operating point) */
  iCrit: number;
  /** Output ripple, peak-to-peak (exact on the PWL waveform) */
  dVout: number;
  /** Capacitive part alone ΔIL/(8·fs·C) (SLVA477 eq. 12, CCM) and ESR part alone ESR·ΔIL (eq. 13) */
  dVoutC: number;
  dVoutEsr: number;
  iCoutRms: number;
  iCinRms: number;
  dVin: number;
  iinAvg: number;
  loss: {
    hsCond: number;
    lsCond: number;
    dcr: number;
    sw: number;
    gate: number;
    cout: number;
    cin: number;
    total: number;
  };
  pout: number;
  pin: number;
  eff: number;
  segments: Segment[];
  period: number;
}

/** Ideal-switch duty with conduction drops (CCM volt-second balance, Erickson ch. 3). */
export function ccmDuty(p: BuckInputs): number {
  const I = p.iout;
  const vOffDrop = p.rect === 'sync' ? I * p.rLs : p.vf; // drop across the rectifier while it conducts
  // on:  vL = Vin − I·Rhs − I·DCR − Vout ;  off: vL = −(Vout + I·DCR + vOffDrop)
  // D·(Vin − I·Rhs) − (1 − D)·vOffDrop = Vout + I·DCR
  return (p.vout + I * p.dcr + vOffDrop) / (p.vin - I * p.rHs + vOffDrop);
}

/** Integral-based statistics of a piecewise-linear periodic current. */
function pwlStats(segs: Segment[], T: number, pick: (s: Segment, k: number) => boolean): { avg: number; rms: number } {
  let q = 0;
  let q2 = 0;
  segs.forEach((s, k) => {
    if (!pick(s, k)) return;
    const dt = s.t1 - s.t0;
    q += ((s.i0 + s.i1) / 2) * dt;
    q2 += ((s.i0 * s.i0 + s.i0 * s.i1 + s.i1 * s.i1) / 3) * dt;
  });
  return { avg: q / T, rms: Math.sqrt(Math.max(q2 / T, 0)) };
}

/**
 * Exact peak-to-peak output ripple for a PWL inductor current feeding Cout ‖ load:
 * iC = iL − Iout, v = ESR·iC + (1/C)∫iC dt. On each piece v is quadratic, so the extremes are at the
 * piece ends or where dv/dt = ESR·di/dt + iC/C = 0.
 */
export function outputRipple(segs: Segment[], iout: number, c: number, esr: number): number {
  let q = 0;
  let vMin = Infinity;
  let vMax = -Infinity;
  const take = (v: number) => {
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  };
  for (const s of segs) {
    const dt = s.t1 - s.t0;
    if (!(dt > 0)) continue;
    const a = s.i0 - iout; // iC at the start
    const k = (s.i1 - s.i0) / dt; // di/dt
    const v = (tau: number) => esr * (a + k * tau) + (q + a * tau + (k * tau * tau) / 2) / c;
    take(v(0));
    take(v(dt));
    if (k !== 0) {
      const tau = -(a + esr * c * k) / k;
      if (tau > 0 && tau < dt) take(v(tau));
    }
    q += a * dt + (k * dt * dt) / 2;
  }
  return vMax - vMin;
}

/**
 * Diode buck in DCM (Erickson & Maksimović ch. 5) with the conduction drops kept: the current ramps up from
 * zero for D1·T, down for D2·T, then stays at zero. The resistive drops use the interval-average current
 * ipk/2, which equals Iout at the CCM boundary, so DCM and CCM meet continuously there:
 *   up = Vin − Vout − (ipk/2)·(R_HS + DCR),  dn = Vout + V_F + (ipk/2)·DCR
 *   D1 = ipk·L/(up·T),  D2 = ipk·L/(dn·T),  Iout = ipk·(D1 + D2)/2
 * Iout(ipk) is monotonic, solved with Brent. Returns null if no solution exists.
 */
export function dcmSolve(p: BuckInputs): { ipk: number; d1: number; d2: number } | null {
  const T = 1 / p.fsw;
  const rUp = p.rHs + p.dcr;
  const up = (ipk: number) => p.vin - p.vout - (ipk / 2) * rUp;
  const dn = (ipk: number) => p.vout + p.vf + (ipk / 2) * p.dcr;
  const iAvg = (ipk: number) => ((ipk * ipk * p.l) / (2 * T)) * (1 / up(ipk) + 1 / dn(ipk));
  const f = (ipk: number) => iAvg(ipk) - p.iout;
  let hi = rUp > 0 ? (2 * (p.vin - p.vout) / rUp) * (1 - 1e-9) : 4 * p.iout + 1;
  if (!(hi > 0)) return null;
  if (rUp === 0) for (let k = 0; k < 200 && f(hi) < 0; k++) hi *= 2;
  if (!(f(hi) > 0)) return null;
  const ipk = brent(f, 0, hi, 1e-14);
  return { ipk, d1: (ipk * p.l) / (up(ipk) * T), d2: (ipk * p.l) / (dn(ipk) * T) };
}

export function analyzeBuck(p: BuckInputs): BuckOutputs {
  const T = 1 / p.fsw;
  const I = p.iout;
  const dIdeal = p.vout / p.vin;
  // CCM first
  const d = ccmDuty(p);
  const vOn = p.vin - I * p.rHs - I * p.dcr - p.vout; // across L during the on-time
  const vOffDrop = p.rect === 'sync' ? I * p.rLs : p.vf;
  const vSwOn = p.vin - I * p.rHs;
  const vSwOff = -vOffDrop;
  const dILccm = (vOn * d * T) / p.l;
  let mode: Mode = 'ccm';
  let segs: Segment[];
  let dOn = d;
  let d2 = 1 - d;
  let dIL = dILccm;
  if (dILccm / 2 > I) mode = p.rect === 'diode' ? 'dcm' : 'ccm-negative';
  let dcm: ReturnType<typeof dcmSolve> = null;
  if (mode === 'dcm') {
    dcm = dcmSolve(p);
    // Decide from the DCM solution itself: it is only valid if the current reaches zero (D1 + D2 < 1).
    if (!dcm || dcm.d1 + dcm.d2 >= 1) mode = 'ccm';
  }
  if (mode === 'dcm' && dcm) {
    dOn = dcm.d1;
    d2 = dcm.d2;
    dIL = dcm.ipk;
    segs = [
      { t0: 0, t1: dOn * T, i0: 0, i1: dcm.ipk, vsw: p.vin - (dcm.ipk / 2) * p.rHs },
      { t0: dOn * T, t1: (dOn + d2) * T, i0: dcm.ipk, i1: 0, vsw: -p.vf },
      { t0: (dOn + d2) * T, t1: T, i0: 0, i1: 0, vsw: p.vout },
    ];
  } else {
    const iv = I - dIL / 2;
    const ip = I + dIL / 2;
    segs = [
      { t0: 0, t1: d * T, i0: iv, i1: ip, vsw: vSwOn },
      { t0: d * T, t1: T, i0: ip, i1: iv, vsw: vSwOff },
    ];
  }
  const iL = pwlStats(segs, T, () => true);
  const hs = pwlStats(segs, T, (_s, k) => k === 0);
  const ls = pwlStats(segs, T, (_s, k) => k === 1);
  const iPk = Math.max(...segs.map((s) => Math.max(s.i0, s.i1)));
  const iValley = Math.min(...segs.map((s) => Math.min(s.i0, s.i1)));

  const dVout = outputRipple(segs, I, p.cout, p.esr);
  const dVoutC = mode === 'dcm' ? outputRipple(segs, I, p.cout, 0) : dIL / (8 * p.fsw * p.cout);
  const dVoutEsr = p.esr * dIL;
  const iCoutRms = Math.sqrt(Math.max(iL.rms * iL.rms - I * I, 0));
  // Input capacitor carries the switch current minus its average (the source supplies the DC part).
  const iCinRms = Math.sqrt(Math.max(hs.rms * hs.rms - hs.avg * hs.avg, 0));
  // Input ripple: Cin supplies the switch current minus its average (the source is assumed stiff at the
  // switching frequency), so the same exact charge + ESR evaluation applies to the high-side current
  // pulse. In CCM the charge term reduces to the usual Iout·D(1 − D)/(fs·Cin).
  const hsSegs: Segment[] = segs.map((s, k) => (k === 0 ? s : { ...s, i0: 0, i1: 0 }));
  const dVin = outputRipple(hsSegs, hs.avg, p.cin, p.esrIn);

  // Losses
  const hsCond = hs.rms * hs.rms * p.rHs;
  const lsCond = p.rect === 'sync' ? ls.rms * ls.rms * p.rLs : ls.avg * p.vf;
  const dcr = iL.rms * iL.rms * p.dcr;
  // Hard-switched turn-on at the valley current and turn-off at the peak current: ½·Vin·I·t per edge.
  const iOn = Math.max(segs[0].i0, 0);
  const iOff = Math.max(segs[0].i1, 0);
  const sw = 0.5 * p.vin * (iOn + iOff) * (p.tsw / 2) * p.fsw;
  const gate = p.qg * p.vdrv * p.fsw;
  const cout = iCoutRms * iCoutRms * p.esr;
  const cin = iCinRms * iCinRms * p.esrIn;
  const total = hsCond + lsCond + dcr + sw + gate + cout + cin;
  const pout = p.vout * I;
  const pin = pout + total;
  return {
    mode,
    d: dOn,
    d2,
    dIdeal,
    ton: dOn * T,
    toff: d2 * T,
    dIL,
    rippleRatio: dIL / I,
    iPk,
    iValley,
    iLrms: iL.rms,
    iHsRms: hs.rms,
    iHsAvg: hs.avg,
    iLsRms: ls.rms,
    iLsAvg: ls.avg,
    iCrit: dILccm / 2,
    dVout,
    dVoutC,
    dVoutEsr,
    iCoutRms,
    iCinRms,
    dVin,
    iinAvg: pin / p.vin,
    loss: { hsCond, lsCond, dcr, sw, gate, cout, cin, total },
    pout,
    pin,
    eff: pout / pin,
    segments: segs,
    period: T,
  };
}

/** SLVA477 eq. 14: output capacitance that limits the overshoot/undershoot of a load step ΔI to Vos. */
export function coutForStep(dI: number, l: number, vout: number, vos: number): number {
  return (dI * dI * l) / (2 * vout * vos);
}
