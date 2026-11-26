/**
 * Switching-regulator capacitor ripple: capacitive, ESR and ESL parts of the input and output ripple of the
 * buck, boost and inverting buck-boost in continuous conduction, and their exact (phase-aware) sum.
 * Pure, SI in / SI out.
 *
 * Sources:
 *  - R. W. Erickson, D. Maksimović, Fundamentals of Power Electronics, 2nd ed., ch. 2: ideal CCM conversion
 *    ratios, inductor ripple ΔiL, capacitor charge balance and the output-ripple derivations (§2.4–2.5).
 *  - TI SLVA477 (buck: ΔV = ΔIL/(8·fs·C), ESR·ΔIL, input ripple Iout·D(1 − D)/(fs·Cin)) and SLVA372 (boost:
 *    ΔV = Iout·D/(fs·C), ESR·Ipk).
 *  - ESL voltage v = ESL·di/dt across the capacitor's series inductance: a square wave ESL·Vin/L for a
 *    triangular current, and spikes ESL·ΔI/t_tr at the current steps of a pulsed current (TI SLVA630,
 *    "Output ripple voltage for buck switching regulator", and ADI/Linear AN-101 on ESL spikes).
 *
 * The capacitor is modelled as C_eff + ESR + ESL in series. The terminal current is piecewise linear (the
 * current steps take t_tr, centred on the switching instants), so v(t) = q/C + ESR·i + ESL·di/dt is
 * quadratic + linear + piecewise constant on each piece and its extremes are found exactly.
 */

export type Topology = 'buck' | 'boost' | 'buckboost';

export interface ConverterInputs {
  topo: Topology;
  vin: number;
  /** output magnitude (the buck-boost output is negative) */
  vout: number;
  iout: number;
  fsw: number;
  l: number;
  /** current transition time of a switch/diode commutation (s) */
  tr: number;
}

export interface Pwl {
  t: number[];
  i: number[];
}

export interface Converter {
  d: number;
  T: number;
  dIL: number;
  iLavg: number;
  iPk: number;
  iValley: number;
  /** t_tr actually used (clamped to a quarter of the shorter interval) */
  tr: number;
  trClamped: boolean;
  /** current through Cout's terminal node from the converter (before the load takes its DC) */
  out: Pwl;
  /** current drawn from the input node by the converter (Cin supplies its AC part) */
  in: Pwl;
  outKind: 'triangle' | 'pulsed';
  inKind: 'triangle' | 'pulsed';
}

/** Ideal CCM duty (lossless): Erickson ch. 2. */
export function idealDuty(topo: Topology, vin: number, vout: number): number {
  if (topo === 'buck') return vout / vin;
  if (topo === 'boost') return 1 - vin / vout;
  return vout / (vin + vout);
}

export function converter(p: ConverterInputs): Converter {
  const T = 1 / p.fsw;
  const d = idealDuty(p.topo, p.vin, p.vout);
  const vOn = p.topo === 'buck' ? p.vin - p.vout : p.vin; // across L while the switch is on
  const dIL = (vOn * d * T) / p.l;
  const iLavg = p.topo === 'buck' ? p.iout : p.iout / (1 - d);
  const iv = iLavg - dIL / 2;
  const ip = iLavg + dIL / 2;
  const tOn = d * T;
  const trMax = 0.25 * Math.min(tOn, T - tOn);
  const tr = Math.min(p.tr, trMax);
  const iL = (t: number) => (t <= tOn ? iv + (dIL * t) / tOn : ip - (dIL * (t - tOn)) / (T - tOn));
  const tri: Pwl = { t: [0, tOn, T], i: [iv, ip, iv] };
  // Switch current: iL during the on-time, ramping in/out over t_tr centred on t = 0 (≡ T) and t = tOn
  // (linear across the period boundary). With t_tr = 0 the steps are zero-length pieces.
  const h = tr / 2;
  const sw: Pwl =
    tr > 0
      ? { t: [0, h, tOn - h, tOn + h, T - h, T], i: [iL(h) / 2, iL(h), iL(tOn - h), 0, 0, iL(h) / 2] }
      : { t: [0, tOn, tOn, T], i: [iv, ip, 0, 0] };
  // Rectifier current: the complement.
  const rc: Pwl =
    tr > 0
      ? { t: [0, h, tOn - h, tOn + h, T - h, T], i: [iL(T - h) / 2, 0, 0, iL(tOn + h), iL(T - h), iL(T - h) / 2] }
      : { t: [0, 0, tOn, T], i: [0, 0, ip, iv] };
  const outKind = p.topo === 'buck' ? 'triangle' : 'pulsed';
  const inKind = p.topo === 'boost' ? 'triangle' : 'pulsed';
  return {
    d,
    T,
    dIL,
    iLavg,
    iPk: ip,
    iValley: iv,
    tr,
    trClamped: p.tr > trMax,
    out: outKind === 'triangle' ? tri : rc,
    in: inKind === 'triangle' ? tri : sw,
    outKind,
    inKind,
  };
}

export interface CapNet {
  /** effective capacitance (after count and DC-bias derating) */
  c: number;
  esr: number;
  esl: number;
}

export interface Ripple {
  /** exact peak-to-peak of the sum */
  pp: number;
  ppC: number;
  ppEsr: number;
  ppEsl: number;
  /** simple sum of the three parts (worst-case bound) */
  sum: number;
  /** root-sum-square of the parts (quadrature combination) */
  rss: number;
  irms: number;
  /** DC of the terminal current (supplied by the source / taken by the load) */
  idc: number;
}

function mean(w: Pwl, T: number): number {
  let q = 0;
  for (let k = 1; k < w.t.length; k++) q += ((w.i[k - 1] + w.i[k]) / 2) * (w.t[k] - w.t[k - 1]);
  return q / T;
}

/** Each linear piece of i_C = i − I_dc: start time, length, start current, slope. */
function pieces(w: Pwl, T: number) {
  const idc = mean(w, T);
  const out: { t0: number; dt: number; a: number; m: number }[] = [];
  for (let k = 1; k < w.t.length; k++) {
    const dt = w.t[k] - w.t[k - 1];
    const a = w.i[k - 1] - idc;
    out.push({ t0: w.t[k - 1], dt, a, m: dt > 0 ? (w.i[k] - w.i[k - 1]) / dt : 0 });
  }
  return { idc, ps: out };
}

/** Exact peak-to-peak ripple and its parts for a capacitor network carrying the AC part of `w`. */
export function capRipple(w: Pwl, T: number, cap: CapNet): Ripple {
  const { idc, ps } = pieces(w, T);
  let q = 0;
  const ext = () => ({ lo: Infinity, hi: -Infinity });
  const tot = ext();
  const vc = ext();
  const ie = ext();
  const sl = ext();
  const take = (e: { lo: number; hi: number }, v: number) => {
    if (v < e.lo) e.lo = v;
    if (v > e.hi) e.hi = v;
  };
  let q2 = 0;
  for (const p of ps) {
    const { a, m, dt } = p;
    const qq = (tau: number) => q + a * tau + (m * tau * tau) / 2;
    const vEsl = dt > 0 ? cap.esl * m : 0;
    const v = (tau: number) => qq(tau) / cap.c + cap.esr * (a + m * tau) + vEsl;
    take(ie, a);
    take(ie, a + m * dt);
    if (dt > 0) take(sl, m);
    // a zero-length piece (ideal step) has no ESL term but its ESR values still count
    take(tot, v(0));
    take(tot, v(dt));
    take(vc, qq(0) / cap.c);
    take(vc, qq(dt) / cap.c);
    if (m !== 0 && dt > 0) {
      const ts = -(a + cap.esr * cap.c * m) / m;
      if (ts > 0 && ts < dt) take(tot, v(ts));
      const tc = -a / m;
      if (tc > 0 && tc < dt) take(vc, qq(tc) / cap.c);
    }
    q2 += ((a * a + a * (a + m * dt) + (a + m * dt) ** 2) / 3) * dt;
    q += a * dt + (m * dt * dt) / 2;
  }
  const ppC = vc.hi - vc.lo;
  const ppEsr = cap.esr * (ie.hi - ie.lo);
  const ppEsl = cap.esl * (sl.hi - sl.lo);
  return { pp: tot.hi - tot.lo, ppC, ppEsr, ppEsl, sum: ppC + ppEsr + ppEsl, rss: Math.hypot(ppC, ppEsr, ppEsl), irms: Math.sqrt(Math.max(q2 / T, 0)), idc };
}

/** Sampled waveforms (two periods) of the ripple and its parts, centred on their mid-range, for the graph. */
export function rippleWave(w: Pwl, T: number, cap: CapNet, periods = 2) {
  const { ps } = pieces(w, T);
  const t: number[] = [];
  const tot: number[] = [];
  const vC: number[] = [];
  const vR: number[] = [];
  const vL: number[] = [];
  const ic: number[] = [];
  for (let n = 0; n < periods; n++) {
    let q = 0;
    for (const p of ps) {
      const steps = p.dt > 0 ? Math.max(2, Math.min(24, Math.round((24 * p.dt) / T) + 2)) : 1;
      const vEsl = p.dt > 0 ? cap.esl * p.m : 0;
      for (let k = 0; k <= steps; k++) {
        const tau = p.dt * (k / steps);
        const i = p.a + p.m * tau;
        const qq = q + p.a * tau + (p.m * tau * tau) / 2;
        t.push(n * T + p.t0 + tau);
        vC.push(qq / cap.c);
        vR.push(cap.esr * i);
        vL.push(vEsl);
        tot.push(qq / cap.c + cap.esr * i + vEsl);
        ic.push(i);
      }
      q += p.a * p.dt + (p.m * p.dt * p.dt) / 2;
    }
  }
  const centre = (a: number[]) => {
    const c = (Math.max(...a) + Math.min(...a)) / 2;
    return a.map((x) => x - c);
  };
  return { t, tot: centre(tot), vC: centre(vC), vR: centre(vR), vL: centre(vL), ic };
}
