/**
 * Series / branched RLC inrush: closed-form step response plus an adaptive ODE solve.
 *
 * Topology: source → shared feed (R0, L0) → N parallel branches (Rk, Lk, Ck(V)).
 * One branch is a plain series RLC.
 */

import { solveOde } from '@/core/sim/ode';
import { type CapacitorModel, cOfV } from './capacitors';
import { type Stimulus, sourceBreakpoints, sourceVoltage, suggestedSimTime } from './stimulus';

export type DampingKind = 'underdamped' | 'critically damped' | 'overdamped';

export interface LinearPeaks {
  damping: DampingKind;
  zeta: number;
  omega0: number;
  f0Hz: number;
  q: number;
  zChar: number;
  vPeak: number;
  iPeak: number;
  tVpeak: number;
  tIpeak: number;
  overshootFrac: number;
}

export interface Waveform {
  t: Float64Array;
  /** Capacitor voltage of the worst group */
  vCap: Float64Array;
  /** Total feed current */
  i: Float64Array;
  vSource: Float64Array;
  /** Per-group capacitor voltage and branch current */
  vGroups: Float64Array[];
  iGroups: Float64Array[];
}

export interface RlcBranch {
  r: number;
  l: number;
  cap: CapacitorModel;
}

export interface GroupPeaks {
  iPeak: number;
  vPeak: number;
  tIpeak: number;
  tVpeak: number;
  energyJ: number;
}

export interface RlcResult {
  linear: LinearPeaks;
  wave: Waveform;
  iPeak: number;
  vPeak: number;
  tIpeak: number;
  tVpeak: number;
  i2t: number;
  energyJ: number;
  usedNonlinearC: boolean;
  notes: string[];
  worstGroup: number;
  groupPeaks: GroupPeaks[];
  solver: { method: string; steps: number; rejected: number; ok: boolean; ms: number; tEnd: number; tReached: number };
}

export function dampingParameters(r: number, l: number, c: number): { omega0: number; zeta: number; q: number; kind: DampingKind } {
  l = Math.max(l, 1e-12);
  c = Math.max(c, 1e-18);
  const omega0 = 1 / Math.sqrt(l * c);
  const zeta = (r / 2) * Math.sqrt(c / l);
  const kind: DampingKind = zeta < 0.999 ? 'underdamped' : zeta > 1.001 ? 'overdamped' : 'critically damped';
  return { omega0, zeta, q: 1 / (2 * Math.max(zeta, 1e-12)), kind };
}

/** Exact peaks for a voltage step into series R–L–C, capacitor starting at v0. */
export function linearStepPeaks(vStep: number, r: number, l: number, c: number, v0 = 0): LinearPeaks {
  const dv = vStep - v0;
  const { omega0, zeta, q, kind } = dampingParameters(r, l, c);
  const zChar = Math.sqrt(Math.max(l, 1e-12) / Math.max(c, 1e-18));
  const f0Hz = omega0 / (2 * Math.PI);
  const base = { damping: kind, zeta, omega0, f0Hz, q, zChar };
  if (Math.abs(dv) < 1e-18) return { ...base, vPeak: v0, iPeak: 0, tVpeak: 0, tIpeak: 0, overshootFrac: 0 };
  const L = Math.max(l, 1e-12);
  const alpha = r / (2 * L);
  if (kind === 'underdamped') {
    const wd = omega0 * Math.sqrt(Math.max(1 - zeta * zeta, 1e-12));
    const tI = Math.atan(wd / Math.max(alpha, 1e-18)) / wd;
    const iPeak = (Math.abs(dv) / L / wd) * Math.exp(-alpha * tI) * Math.sin(wd * tI);
    const over = Math.exp((-Math.PI * zeta) / Math.sqrt(Math.max(1 - zeta * zeta, 1e-12)));
    return { ...base, vPeak: v0 + dv * (1 + over), iPeak, tVpeak: Math.PI / wd, tIpeak: tI, overshootFrac: over };
  }
  const disc = Math.max(alpha * alpha - omega0 * omega0, 0);
  const s1 = -alpha + Math.sqrt(disc);
  const s2 = -alpha - Math.sqrt(disc);
  let tI: number;
  let iPeak: number;
  if (kind === 'overdamped' && Math.abs(s1 - s2) > 1e-12) {
    tI = s1 !== 0 && s2 / s1 > 0 ? Math.max(Math.log(s2 / s1) / (s1 - s2), 0) : 0;
    iPeak = Math.abs((dv / L / (s1 - s2)) * (Math.exp(s1 * tI) - Math.exp(s2 * tI)));
  } else {
    tI = 1 / Math.max(alpha, 1e-12);
    iPeak = Math.abs((dv / L) * tI * Math.exp(-1));
  }
  return { ...base, vPeak: vStep, iPeak, tVpeak: 8 / Math.max(alpha, 1), tIpeak: tI, overshootFrac: 0 };
}

/** Shortest natural period in the network (common mode per branch + branch-to-branch differential). */
function fastestPeriod(l0: number, branches: RlcBranch[], cAt: (b: RlcBranch) => number): number {
  let tmin = Infinity;
  for (const b of branches) tmin = Math.min(tmin, 2 * Math.PI * Math.sqrt(Math.max(l0 + b.l, 1e-12) * Math.max(cAt(b), 1e-18)));
  for (let i = 0; i < branches.length; i++) {
    for (let j = i + 1; j < branches.length; j++) {
      const a = branches[i];
      const b = branches[j];
      const ld = Math.max(a.l, 1e-12) + Math.max(b.l, 1e-12);
      const cs = 1 / (1 / Math.max(cAt(a), 1e-18) + 1 / Math.max(cAt(b), 1e-18));
      tmin = Math.min(tmin, 2 * Math.PI * Math.sqrt(ld * cs));
    }
  }
  return tmin;
}

/** Common-mode R, L, C: shared feed plus the parallel combination of branches. */
export function equivalentFeed(r0: number, l0: number, branches: RlcBranch[]): { r: number; l: number; c: number } {
  const c = branches.reduce((s, b) => s + Math.max(b.cap.cEffF, 1e-18), 0);
  const gL = branches.reduce((s, b) => s + 1 / Math.max(b.l, 1e-12), 0);
  const gR = branches.reduce((s, b) => s + 1 / Math.max(b.r, 1e-12), 0);
  return { r: Math.max(r0, 0) + 1 / Math.max(gR, 1e-18), l: Math.max(l0, 0) + 1 / Math.max(gL, 1e-18), c };
}

function trapz(y: ArrayLike<number>, x: ArrayLike<number>, sq = false): number {
  let s = 0;
  for (let k = 1; k < x.length; k++) {
    const a = sq ? y[k - 1] * y[k - 1] : y[k - 1];
    const b = sq ? y[k] * y[k] : y[k];
    s += 0.5 * (a + b) * (x[k] - x[k - 1]);
  }
  return s;
}

/** Refine a sampled extreme with a parabola through the neighbouring samples (non-uniform spacing). */
export function refineExtreme(t: ArrayLike<number>, y: ArrayLike<number>, k: number): { t: number; y: number } {
  if (k <= 0 || k >= y.length - 1) return { t: t[k], y: y[k] };
  const [x0, x1, x2] = [t[k - 1], t[k], t[k + 1]];
  const [y0, y1, y2] = [y[k - 1], y[k], y[k + 1]];
  const d0 = (y1 - y0) / (x1 - x0);
  const d1 = (y2 - y1) / (x2 - x1);
  const a = (d1 - d0) / (x2 - x0);
  if (a === 0 || !Number.isFinite(a)) return { t: x1, y: y1 };
  const b = d0 - a * (x0 + x1);
  const tv = -b / (2 * a);
  if (tv < x0 || tv > x2) return { t: x1, y: y1 };
  const yv = y1 + d0 * (tv - x1) + a * (tv - x0) * (tv - x1);
  // Only accept a refinement that moves the extreme outward (never inward).
  return Math.abs(yv) >= Math.abs(y1) ? { t: tv, y: yv } : { t: x1, y: y1 };
}

function argExtreme(a: ArrayLike<number>, mode: 'max' | 'min' | 'absmax'): number {
  let best = 0;
  let bv = mode === 'min' ? Infinity : -Infinity;
  for (let k = 0; k < a.length; k++) {
    const v = mode === 'absmax' ? Math.abs(a[k]) : a[k];
    if (mode === 'min' ? v < bv : v > bv) {
      bv = v;
      best = k;
    }
  }
  return best;
}

export interface SimOptions {
  v0?: number;
  nonlinear?: boolean;
  rtol?: number;
}

/**
 * Leads + series trace feeding N parallel (branch trace + capacitor group) arms.
 * State: [i_1..i_N, v_1..v_N].  L0·Σdi + L_k di_k = Vs − R0·Σi − R_k i_k − v_k ;  C_k(v_k) dv_k = i_k
 */
export function simulateBranched(stim: Stimulus, r0: number, l0: number, branches: RlcBranch[], opts: SimOptions = {}): RlcResult {
  if (!branches.length) throw new Error('Add at least one capacitor group.');
  const v0 = opts.v0 ?? 0;
  const n = branches.length;
  const notes: string[] = [];
  r0 = Math.max(r0, 0);
  l0 = Math.max(l0, 0);
  const rb = branches.map((b) => Math.max(b.r, 0));
  const lb = branches.map((b) => Math.max(b.l, 1e-12));
  const caps = branches.map((b) => b.cap);
  const useNl = (opts.nonlinear ?? true) && caps.some((c) => c.isVoltageDependent);
  if (n > 1) notes.push(`Solved as ${n} capacitor groups in parallel after a shared series feed (leads + series PCB trace). Each group has its own branch trace, ESR and ESL.`);
  notes.push(useNl ? 'Capacitance follows the estimated C(V) curve in each ceramic group during the transient (DC-bias effect).' : 'Capacitance in each group held constant at the bias-adjusted value.');

  const eq = equivalentFeed(r0, l0, branches);
  const lin = linearStepPeaks(stim.amplitudeV, eq.r, eq.l, eq.c, v0);
  let tEnd = suggestedSimTime(stim, eq.l, eq.c, eq.r);
  for (const b of branches) tEnd = Math.max(tEnd, suggestedSimTime(stim, l0 + Math.max(b.l, 1e-12), Math.max(b.cap.cEffF, 1e-18), r0 + b.r));

  // Resolution: ~30 steps on the fastest ring, using the smallest C the parts can reach.
  const vMaxGuess = Math.max(Math.abs(stim.amplitudeV), Math.abs(v0)) * 2;
  const cMin = (b: RlcBranch) => (useNl && b.cap.isVoltageDependent ? Math.min(b.cap.cEffF, cOfV(b.cap, vMaxGuess)) : b.cap.cEffF);
  const period = fastestPeriod(l0, branches, cMin);
  // Resolve the fastest ring (period/30), but never so finely that the window would need more than ~200k
  // steps — over a very long window (slow ramp, long impulse) error control alone keeps the accuracy.
  const hmax = Math.min(Math.max(period / 30, tEnd / 200_000), tEnd / 400);

  // Sherman–Morrison inverse of M = L0·11ᵀ + diag(Lk)
  const invL = lb.map((l) => 1 / l);
  const smDen = 1 + l0 * invL.reduce((s, x) => s + x, 0);
  const nl = caps.map((c) => useNl && c.isVoltageDependent);
  const cFixed = caps.map((c) => Math.max(c.cEffF, 1e-18));

  const rhs = (t: number, y: Float64Array, dy: Float64Array) => {
    let i0 = 0;
    for (let k = 0; k < n; k++) i0 += y[k];
    const vs = sourceVoltage(stim, t);
    let sx = 0;
    for (let k = 0; k < n; k++) {
      const x = (vs - r0 * i0 - rb[k] * y[k] - y[n + k]) * invL[k];
      dy[k] = x;
      sx += x;
    }
    const corr = (l0 * sx) / smDen;
    for (let k = 0; k < n; k++) {
      dy[k] -= invL[k] * corr;
      const c = nl[k] ? Math.max(cOfV(caps[k], y[n + k]), 1e-18) : cFixed[k];
      dy[n + k] = y[k] / c;
    }
  };

  const dV = Math.max(Math.abs(stim.amplitudeV - v0), Math.abs(stim.amplitudeV), 1e-3);
  const iScale = dV / Math.max(Math.sqrt(eq.l / eq.c), eq.r, 1e-6);
  const atol = [...Array(n).fill(iScale * 1e-7), ...Array(n).fill(dV * 1e-7)];
  const y0 = [...Array(n).fill(0), ...Array(n).fill(v0)];

  const t0 = performance.now();
  const sol = solveOde(rhs, y0, 0, tEnd, { rtol: opts.rtol ?? 1e-6, atol, hmax, tstops: sourceBreakpoints(stim), maxSteps: 600000 });
  const ms = performance.now() - t0;
  const tReached = sol.t[sol.t.length - 1];
  const complete = sol.ok && tReached >= tEnd * (1 - 1e-9);
  if (!complete) notes.push(`Solver stopped at ${(tReached * 1e6).toPrecision(3)} µs of the ${(tEnd * 1e6).toPrecision(3)} µs window (${sol.message ?? 'incomplete'}). Peaks after that point are missing.`);
  if (sol.method === 'ros23') notes.push('The explicit solver needed too many steps for this window, so the implicit Rosenbrock solver was used.');

  const t = sol.t;
  const iG = sol.y.slice(0, n);
  const vG = sol.y.slice(n);
  const iTot = new Float64Array(t.length);
  for (let k = 0; k < n; k++) for (let j = 0; j < t.length; j++) iTot[j] += iG[k][j];
  const vSrc = t.map((tt) => sourceVoltage(stim, tt));

  const rising = stim.amplitudeV >= v0;
  const groupPeaks: GroupPeaks[] = vG.map((v, k) => {
    const rv = refineExtreme(t, v, argExtreme(v, rising ? 'max' : 'min'));
    const ri = refineExtreme(t, iG[k], argExtreme(iG[k], 'absmax'));
    return {
      vPeak: rv.y,
      tVpeak: rv.t,
      iPeak: Math.abs(ri.y),
      tIpeak: ri.t,
      energyJ: 0.5 * Math.max(caps[k].cEffF, 1e-18) * rv.y * rv.y,
    };
  });
  let worst = 0;
  groupPeaks.forEach((p, k) => {
    if (Math.abs(p.vPeak) > Math.abs(groupPeaks[worst].vPeak)) worst = k;
  });
  const rTot = refineExtreme(t, iTot, argExtreme(iTot, 'absmax'));
  let iPeak = Math.abs(rTot.y);
  let tIpeak = rTot.t;
  let vPeak = groupPeaks[worst].vPeak;
  let tVpeak = groupPeaks[worst].tVpeak;

  // Single linear branch with an ideal step: closed-form peaks are exact.
  if (n === 1 && !useNl && stim.waveform.startsWith('Step (hot-plug)') && lin.damping === 'underdamped') {
    iPeak = lin.iPeak;
    vPeak = lin.vPeak;
    tIpeak = lin.tIpeak;
    tVpeak = lin.tVpeak;
    groupPeaks[0] = { ...groupPeaks[0], iPeak, vPeak, tIpeak, tVpeak, energyJ: 0.5 * caps[0].cEffF * vPeak * vPeak };
    notes.push('Peak values from the closed-form step response (exact for linear RLC).');
  }
  if (n > 1) notes.push(`Highest capacitor voltage is on group ${worst + 1}.`);

  const finite = [...iG, ...vG].every((a) => a.every(Number.isFinite));
  if (!finite) notes.push('The solver produced non-finite values — treat this run as invalid.');
  else if (Math.abs(vPeak - v0) > 2.05 * dV) {
    notes.push(
      useNl
        ? 'Class II C(V) can push capacitor voltage above 2× the applied step because C falls as V rises (charge taken on while C is large appears as a higher V). Treat that peak as an estimate.'
        : 'Peak voltage exceeded 2× the applied step with linear C — not possible for a passive RLC step. Check inputs.',
    );
  }

  return {
    linear: lin,
    wave: { t, vCap: vG[worst], i: iTot, vSource: vSrc, vGroups: vG, iGroups: iG },
    iPeak,
    vPeak,
    tIpeak,
    tVpeak,
    i2t: trapz(iTot, t, true),
    energyJ: groupPeaks.reduce((s, p) => s + p.energyJ, 0),
    usedNonlinearC: useNl,
    notes,
    worstGroup: worst,
    groupPeaks,
    solver: { method: sol.method, steps: sol.steps, rejected: sol.rejected, ok: complete, ms, tEnd, tReached },
  };
}
