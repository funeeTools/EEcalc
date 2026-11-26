/**
 * Op-amp closed-loop bandwidth — pure model, SI in/out.
 *
 * Open-loop gain with a dominant pole f₁ = GBW/A_OL and, optionally, a second pole f₂ placed so that the
 * unity-gain phase margin equals the data-sheet value:
 *   A(s) = A_OL / [(1 + s/ω₁)(1 + s/ω₂)]
 * With feedback factor β = 1/NG (noise gain: NG = |G| non-inverting, 1 + |G| inverting) the closed loop is
 * the ideal gain times 1/(1 + 1/(Aβ)), a second-order low-pass
 *   ω₀² = ω₁ω₂(1 + A_OLβ),   Q = (1 + A_OLβ) / [ω₀ (1/ω₁ + 1/ω₂)]
 * (S. Franco, Design with Operational Amplifiers and Analog Integrated Circuits, 4th ed., McGraw-Hill 2015,
 * ch. 6 "dynamic limitations" and ch. 8 "stability"; Sedra & Smith 7e §11.10, two-pole feedback amplifiers).
 * Single-pole case: f₋₃dB = f₁(1 + A_OLβ) ≈ GBW/NG (reused from opamp-gain/model.ts).
 * n identical stages: |H|ⁿ = 1/√2 solved exactly for the second-order response; for single-pole stages
 * f_n = f₁·√(2^{1/n} − 1). Full-power bandwidth f_FP = SR/(2π·V_pk) (Franco ch. 6).
 * Step responses: standard second-order step response; the cascade by exact first-order-hold steps of each pole.
 */

import { brent } from '@/core/calc/solve';
import { closedLoopBandwidth } from '@/calculators/opamp-gain/model';

export type Config = 'noninv' | 'inv';

export const noiseGainOf = (cfg: Config, g: number) => (cfg === 'noninv' ? g : 1 + g);

export interface Amp {
  gbw: number;
  /** Open-loop DC gain, V/V */
  a0: number;
  /** Second pole, Hz (Infinity = single-pole op-amp) */
  f2: number;
}

const DEG = 180 / Math.PI;

/** Phase margin (°) of the loop A·β; NaN when |Aβ| never reaches 1 (A_OL·β ≤ 1). */
export function phaseMargin(a: Amp, beta: number): number {
  const f1 = a.gbw / a.a0;
  const t0 = a.a0 * beta;
  if (!(t0 > 1)) return NaN;
  let x: number; // crossover frequency squared
  if (!Number.isFinite(a.f2)) x = f1 * f1 * (t0 * t0 - 1);
  else {
    const A = 1 / (f1 * f1 * a.f2 * a.f2);
    const B = 1 / (f1 * f1) + 1 / (a.f2 * a.f2);
    const C = 1 - t0 * t0;
    x = (2 * -C) / (B + Math.sqrt(B * B - 4 * A * C)); // stable form of the positive root
  }
  const fx = Math.sqrt(x);
  return 180 - Math.atan(fx / f1) * DEG - (Number.isFinite(a.f2) ? Math.atan(fx / a.f2) * DEG : 0);
}

/** Second pole that gives the stated phase margin at unity gain (β = 1). pm ≥ the single-pole value → Infinity. */
export function secondPole(gbw: number, a0: number, pm: number): number {
  const single = phaseMargin({ gbw, a0, f2: Infinity }, 1);
  if (!(pm < single - 1e-9)) return Infinity;
  const g = (lf2: number) => phaseMargin({ gbw, a0, f2: 10 ** lf2 }, 1) - pm;
  // PM rises monotonically with f₂; bracket it on a log scale
  let lo = Math.log10(gbw) - 6;
  let hi = Math.log10(gbw) + 8;
  if (g(lo) > 0) return 10 ** lo;
  if (g(hi) < 0) return 10 ** hi;
  return 10 ** brent(g, lo, hi, 1e-13);
}

export interface Stage {
  /** DC gain magnitude of the stage including the finite-A_OL error */
  dcGain: number;
  /** Natural frequency (Hz) and Q of the closed-loop poles; Q = 0 means first order with pole fc */
  f0: number;
  q: number;
  /** First-order corner (Hz), single-pole case only */
  fc: number;
  order: 1 | 2;
  pm: number;
}

/** Closed-loop stage (normalised to its ideal gain) for noise gain ng. */
export function stage(a: Amp, ng: number, idealMag: number): Stage {
  const beta = 1 / ng;
  const t0 = a.a0 * beta;
  const dcGain = (idealMag * t0) / (1 + t0);
  const f1 = a.gbw / a.a0;
  const pm = phaseMargin(a, beta);
  if (!Number.isFinite(a.f2)) {
    // reuse of the opamp-gain single-pole result: fc = (GBW/A_OL)(1 + A_OL/NG)
    const fc = closedLoopBandwidth(ng - 1, 1, a.a0, a.gbw);
    return { dcGain, f0: fc, q: 0, fc, order: 1, pm };
  }
  const f0 = Math.sqrt(f1 * a.f2 * (1 + t0));
  const q = (1 + t0) / (f0 * (1 / f1 + 1 / a.f2));
  return { dcGain, f0, q, fc: NaN, order: 2, pm };
}

/** |H(jf)|² normalised to DC. */
export function mag2(s: Stage, f: number): number {
  if (s.order === 1) return 1 / (1 + (f / s.fc) ** 2);
  const u = (f / s.f0) ** 2;
  return 1 / ((1 - u) ** 2 + u / (s.q * s.q));
}

/** Phase (°) of the normalised closed-loop response. */
export function phase(s: Stage, f: number): number {
  if (s.order === 1) return -Math.atan(f / s.fc) * DEG;
  const x = f / s.f0;
  return -Math.atan2(x / s.q, 1 - x * x) * DEG;
}

/** −3 dB bandwidth of n identical cascaded stages (n = 1: one stage). Exact for both orders. */
export function cascadeBw(s: Stage, n: number): number {
  const a = 2 ** (-1 / n); // |H|² at the band edge
  if (s.order === 1) return s.fc * Math.sqrt(1 / a - 1);
  const b = 2 - 1 / (s.q * s.q);
  const c = 1 / a - 1;
  const d = Math.sqrt(b * b + 4 * c);
  // positive root of u² − b·u − c = 0, in the form that does not cancel when b ≪ 0 (very low Q)
  const u = b >= 0 ? (b + d) / 2 : (2 * c) / (d - b);
  return s.f0 * Math.sqrt(u);
}

/** Peak of |H| above DC (V/V, ≥ 1) and its frequency; 1 and 0 when there is no peaking. */
export function peaking(s: Stage): { mp: number; fp: number } {
  if (s.order === 1 || s.q <= Math.SQRT1_2) return { mp: 1, fp: 0 };
  return { mp: s.q / Math.sqrt(1 - 1 / (4 * s.q * s.q)), fp: s.f0 * Math.sqrt(1 - 1 / (2 * s.q * s.q)) };
}

/** Step overshoot fraction of one stage (second order, Q > ½). */
export function overshoot(s: Stage): number {
  if (s.order === 1 || s.q <= 0.5) return 0;
  const z = 1 / (2 * s.q);
  return Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z));
}

/** Normalised step response of one stage at time t (closed form). */
export function step1(s: Stage, t: number): number {
  if (t <= 0) return 0;
  if (s.order === 1) return 1 - Math.exp(-2 * Math.PI * s.fc * t);
  const w0 = 2 * Math.PI * s.f0;
  const z = 1 / (2 * s.q);
  if (Math.abs(z - 1) < 1e-9) return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
  }
  const r = Math.sqrt(z * z - 1);
  const p1 = w0 * (z - r);
  const p2 = w0 * (z + r);
  return 1 - (p2 * Math.exp(-p1 * t) - p1 * Math.exp(-p2 * t)) / (p2 - p1);
}

/**
 * Normalised step response of n identical stages. Each second-order stage is split into its two
 * first-order factors p/(s + p) (complex for Q > ½), and every factor is advanced with its exact
 * solution for an input that is linear over the step, x₁ = e^{−ph}x₀ + (1 − e^{−ph})u₀ + (u₁ − u₀)·[1 − (1 − e^{−ph})/(ph)].
 * This stays stable for stiff (very overdamped) stages, unlike explicit Runge–Kutta, and is accurate to O(h²).
 */
export function stepChain(s: Stage, n: number, tEnd: number, steps = 2000): { t: number[]; y: number[] } {
  type C = [number, number];
  const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const div = (a: C, b: C): C => {
    const d = b[0] * b[0] + b[1] * b[1];
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  };
  let poles: C[];
  if (s.order === 1) poles = [[2 * Math.PI * s.fc, 0]];
  else {
    const w0 = 2 * Math.PI * s.f0;
    const z = 1 / (2 * s.q);
    if (z >= 1) {
      const r = Math.sqrt(z * z - 1);
      poles = [[w0 * (z - r), 0], [w0 * (z + r), 0]];
    } else {
      const r = Math.sqrt(1 - z * z);
      poles = [[w0 * z, w0 * r], [w0 * z, -w0 * r]];
    }
  }
  const h = tEnd / steps;
  const coef = poles.map((p) => {
    const ph: C = [p[0] * h, p[1] * h];
    const e: C = [Math.exp(-ph[0]) * Math.cos(-ph[1]), Math.exp(-ph[0]) * Math.sin(-ph[1])];
    const a: C = [1 - e[0], -e[1]];
    const b: C = [1 - div(a, ph)[0], -div(a, ph)[1]];
    return { e, a, b };
  });
  const m = n * poles.length;
  let x: C[] = Array.from({ length: m }, () => [0, 0] as C);
  const t: number[] = [0];
  const y: number[] = [0];
  for (let i = 1; i <= steps; i++) {
    const nx: C[] = [];
    let u0: C = [1, 0];
    let u1: C = [1, 0];
    for (let k = 0; k < m; k++) {
      const { e, a, b } = coef[k % poles.length];
      const ex = mul(e, x[k]);
      const au = mul(a, u0);
      const bu = mul(b, [u1[0] - u0[0], u1[1] - u0[1]]);
      const v: C = [ex[0] + au[0] + bu[0], ex[1] + au[1] + bu[1]];
      u0 = x[k];
      u1 = v;
      nx.push(v);
    }
    x = nx;
    t.push(i * h);
    y.push(x[m - 1][0]);
  }
  return { t, y };
}

/** 10–90 % rise time from sampled data (first crossings, linear interpolation). */
export function riseTime(t: number[], y: number[]): number {
  const cross = (lv: number) => {
    for (let i = 1; i < y.length; i++) if (y[i - 1] < lv && y[i] >= lv) return t[i - 1] + ((lv - y[i - 1]) * (t[i] - t[i - 1])) / (y[i] - y[i - 1]);
    return NaN;
  };
  return cross(0.9) - cross(0.1);
}

/** Exact 10–90 % rise time of one stage (closed form for first order, root search on step1 otherwise). */
export function riseTime1(s: Stage): number {
  if (s.order === 1) return Math.log(9) / (2 * Math.PI * s.fc);
  const w0 = 2 * Math.PI * s.f0;
  // first crossing of each level: scan, then Brent
  const tMax = 40 / (w0 * Math.min(s.q, 1)) + (40 * s.q) / w0;
  const cross = (lv: number) => {
    const N = 4000;
    let prev = 0;
    for (let i = 1; i <= N; i++) {
      const ti = (tMax * i) / N;
      const v = step1(s, ti);
      if (v >= lv) return brent((x) => step1(s, x) - lv, prev, ti, 1e-15 * tMax + 1e-30);
      prev = ti;
    }
    return NaN;
  };
  return cross(0.9) - cross(0.1);
}

/** Exact 10–90 % rise time of n identical first-order stages (Erlang step response). */
export function riseTimeErlang(fc: number, n: number): number {
  const tau = 1 / (2 * Math.PI * fc);
  const g = (x: number) => {
    // 1 − e^{−x} Σ_{k<n} x^k/k!
    let term = 1;
    let sum = 1;
    for (let k = 1; k < n; k++) {
      term *= x / k;
      sum += term;
    }
    return 1 - Math.exp(-x) * sum;
  };
  const solve = (lv: number) => brent((x) => g(x) - lv, 0, 10 * n + 50, 1e-14);
  return (solve(0.9) - solve(0.1)) * tau;
}

/** Largest slope of the normalised step response of one stage (1/s): sets the step size where slewing starts. */
export function maxSlope(s: Stage): number {
  if (s.order === 1) return 2 * Math.PI * s.fc;
  const w0 = 2 * Math.PI * s.f0;
  const z = 1 / (2 * s.q);
  // impulse response h(t) of the normalised second-order low-pass; its maximum is the steepest step slope
  let tPk: number;
  if (z < 1 - 1e-9) tPk = Math.atan(Math.sqrt(1 - z * z) / z) / (w0 * Math.sqrt(1 - z * z));
  else if (z > 1 + 1e-9) {
    const r = Math.sqrt(z * z - 1);
    const p1 = w0 * (z - r);
    const p2 = w0 * (z + r);
    tPk = Math.log(p2 / p1) / (p2 - p1);
  } else tPk = 1 / w0;
  const dt = tPk * 1e-6;
  return (step1(s, tPk + dt) - step1(s, tPk - dt)) / (2 * dt);
}

/**
 * 10–90 % rise time of a step ΔV with slewing: the output slews at SR until the remaining error equals SR·τ,
 * then settles exponentially with τ (single-pole slew-then-settle model, Franco ch. 6). For ΔV ≤ SR·τ there is
 * no slewing and the result is the linear ln9·τ.
 */
export function slewRise(dv: number, sr: number, tau: number): number {
  const e0 = sr * tau;
  if (dv <= e0) return Math.log(9) * tau;
  const y1 = dv - e0;
  const t1 = y1 / sr;
  const at = (lv: number) => (lv <= y1 ? lv / sr : t1 + tau * Math.log(e0 / (dv - lv)));
  return at(0.9 * dv) - at(0.1 * dv);
}

/** Full-power bandwidth for a sine of peak amplitude vpk. */
export const fpbw = (sr: number, vpk: number) => sr / (2 * Math.PI * vpk);
