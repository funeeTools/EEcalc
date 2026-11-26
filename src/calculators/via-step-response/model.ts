/**
 * Via step response — pure model (no DOM, SI in/out).
 *
 * A via in a Z₀ line is treated as a lumped discontinuity (valid while its delay h·√εr/c is short against the edge):
 *
 *  • Pad-to-plane capacitance, H. Johnson & M. Graham, High-Speed Digital Design, Prentice Hall 1993, §7.3 (inches):
 *        C ≈ 1.41·εr·T·D₁/(D₂ − D₁)  pF        T board thickness, D₁ pad, D₂ antipad (clearance) diameter
 *  • Barrel inductance, same book §7.4 (inches):  L ≈ 5.08·h·[ln(4h/d) + 1]  nH  (as printed). The Rosa/Grover partial
 *    self-inductance 5.08·h·[ln(4h/d) − 1] nH (E. B. Rosa, Bull. Bureau of Standards 4(2), 1908) is offered as the
 *    lower alternative; both functions are shared with the Via calculator and Differential via pages.
 *  • Rise-time degradation, J&G §7.3: the via capacitance sees the line as Z₀/2 (source half and load half in parallel),
 *    a single pole of τ_C = C·Z₀/2 whose 10–90 % time is 2.2·τ_C (ln 9 = 2.197). The same argument for a series
 *    inductance between two Z₀ halves gives τ_L = L/(2Z₀) (§7.4). Cascaded rise times add in quadrature (the book’s
 *    root-sum-of-squares rule): t_out ≈ √(t_r² + t_C² + t_L²). That ignores that L and C partly cancel; the
 *    net-excess form uses τ_net = |C·Z₀/2 − L/(2Z₀)|, from the area of the reflected wave (below).
 *  • TDR area theorem for a lumped discontinuity in a matched line (any L–C ladder): ∫ρ(t)dt = L/(2Z₀) − C·Z₀/2, from
 *    the low-frequency expansion Γ(s) ≈ s·(L/Z₀ − C·Z₀)/2 (Agilent Technologies, "Time Domain Reflectometry Theory",
 *    application note 1304-2, 2006: excess C and L from the integrated reflection).
 *  • Step waveforms: the network (π: C/2 – L – C/2, T: L/2 – C – L/2, C only or L only) between a Z₀ source driven by
 *    2·u(t) and a Z₀ load, u a linear ramp 0 → 1 with the 10–90 % time t_r. Solved as a linear state-space system,
 *    stepped exactly with the matrix exponential (first-order hold: the ramp is piecewise linear, so samples are exact).
 *    Reflected wave ρ(t) = v₁(t) − u(t), transmitted wave v₂(t). Crossing times are refined by cubic Hermite
 *    interpolation with the exact state derivatives.
 */

import { C0, johnsonC, johnsonL, partialL } from '@/calculators/differential-via/model';

export { C0, johnsonC, johnsonL, partialL };

export type Topology = 'pi' | 'tee' | 'c' | 'l';
export type LForm = 'johnson' | 'rosa';

export const LN9 = Math.log(9);

export function viaL(h: number, d: number, form: LForm): number {
  return form === 'rosa' ? partialL(h, d) : johnsonL(h, d);
}

/** Johnson & Graham single-pole 10–90 % times of the capacitance and the inductance in a Z₀ line (s). */
export function jgRiseC(c: number, z0: number): number {
  return LN9 * c * (z0 / 2);
}
export function jgRiseL(l: number, z0: number): number {
  return LN9 * (l / (2 * z0));
}

type Mat = number[][];

/** e^M for a small square matrix: scaling and squaring with a 14-term Taylor series (‖M‖/2^s ≤ 0.5: error < 1e-17). */
export function expm(m: Mat): Mat {
  const n = m.length;
  const nn = n * n;
  let norm = 0;
  for (const r of m) norm = Math.max(norm, r.reduce((q, v) => q + Math.abs(v), 0));
  const sq = norm > 0.5 ? Math.ceil(Math.log2(norm / 0.5)) : 0;
  const f = 2 ** -sq;
  const a = new Float64Array(nn);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) a[i * n + j] = m[i][j] * f;
  let term = new Float64Array(nn);
  let sum = new Float64Array(nn);
  for (let i = 0; i < n; i++) term[i * n + i] = sum[i * n + i] = 1;
  let tmp = new Float64Array(nn);
  const mul = (x: Float64Array, y: Float64Array, out: Float64Array, k = 1) => {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let v = 0;
        for (let q = 0; q < n; q++) v += x[i * n + q] * y[q * n + j];
        out[i * n + j] = v * k;
      }
  };
  for (let k = 1; k <= 14; k++) {
    mul(term, a, tmp, 1 / k);
    [term, tmp] = [tmp, term];
    for (let i = 0; i < nn; i++) sum[i] += term[i];
  }
  for (let i = 0; i < sq; i++) {
    mul(sum, sum, tmp);
    [sum, tmp] = [tmp, sum];
  }
  return Array.from({ length: n }, (_, i) => Array.from(sum.subarray(i * n, i * n + n)));
}

/** State-space form x' = A·x + B·u, v₁ = c1·x + d1·u, v₂ = c2·x + d2·u (u: incident wave). */
interface Sys {
  a: Mat;
  b: number[];
  c1: number[];
  d1: number;
  c2: number[];
  d2: number;
}

export function system(top: Topology, l: number, c: number, z0: number): Sys {
  if (top === 'pi') {
    const ch = c / 2;
    // x = [v1, iL, v2]
    return {
      a: [
        [-1 / (z0 * ch), -1 / ch, 0],
        [1 / l, 0, -1 / l],
        [0, 1 / ch, -1 / (z0 * ch)],
      ],
      b: [2 / (z0 * ch), 0, 0],
      c1: [1, 0, 0],
      d1: 0,
      c2: [0, 0, 1],
      d2: 0,
    };
  }
  if (top === 'tee') {
    const lh = l / 2;
    // x = [i1, vC, i2]
    return {
      a: [
        [-z0 / lh, -1 / lh, 0],
        [1 / c, 0, -1 / c],
        [0, 1 / lh, -z0 / lh],
      ],
      b: [2 / lh, 0, 0],
      c1: [-z0, 0, 0],
      d1: 2,
      c2: [0, 0, z0],
      d2: 0,
    };
  }
  if (top === 'c') return { a: [[-2 / (z0 * c)]], b: [2 / (z0 * c)], c1: [1], d1: 0, c2: [1], d2: 0 };
  // series L only: x = [i]
  return { a: [[(-2 * z0) / l]], b: [2 / l], c1: [-z0], d1: 2, c2: [z0], d2: 0 };
}

/** Time constants that set the simulation window (s). */
export function timeScales(top: Topology, l: number, c: number, z0: number): { tauC: number; tauL: number } {
  return { tauC: top === 'l' ? 0 : (c * z0) / 2, tauL: top === 'c' ? 0 : l / (2 * z0) };
}

type Arr = Float64Array;
export interface StepWave {
  t: Arr;
  /** incident ramp u(t) */
  u: Arr;
  /** reflected wave ρ(t) = v₁ − u (fraction of the step) */
  rho: Arr;
  /** transmitted wave v₂(t) (fraction of the step) */
  v2: Arr;
  /** exact time derivatives for interpolation, from the left and from the right of each sample (they differ only at
   * the ramp corners, where the incident slope jumps) */
  drho: { l: Arr; r: Arr };
  dv2: { l: Arr; r: Arr };
}

/**
 * Exact sampled response to a ramp of duration tRamp (0 → 1), from t = 0 to tEnd. After each ramp corner, where the
 * network’s transients start, the samples are dense: 100 steps over 10·tauMin, then 200 over 12·tauSum; then nRamp
 * equal steps to the end of the ramp and nTail to tEnd. The samples are exact, so the grid only sets how finely
 * features are seen (and the Hermite refinement of crossings and peaks between them).
 */
function segments(t0: number, t1: number, tauMin: number, tauSum: number, nLast: number): [number, number][] {
  const half = (t1 - t0) / 2;
  const p1 = Math.min(10 * tauMin, half);
  const p2 = Math.max(p1, Math.min(12 * tauSum, half));
  const out: [number, number][] = [[p1, 100]];
  if (p2 > p1 * (1 + 1e-9)) out.push([p2 - p1, 200]);
  out.push([t1 - t0 - p2, nLast]);
  return out;
}
export function simulate(top: Topology, l: number, c: number, z0: number, tRamp: number, tEnd: number, tauMin: number, tauSum: number, nRamp = 120, nTail = 800): StepWave {
  const sys = system(top, l, c, z0);
  const n = sys.a.length;
  // augmented exponential for a first-order hold: [[A, B, 0], [0, 0, 1], [0, 0, 0]]·h
  const stepper = (h: number) => {
    const m: Mat = Array.from({ length: n + 2 }, () => Array(n + 2).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) m[i][j] = sys.a[i][j] * h;
      m[i][n] = sys.b[i] * h;
    }
    m[n][n + 1] = 1;
    const e = expm(m);
    // x(t+h) = Φ·x + Ψ1·u + Ψ2·(slope·h), with Ψ2 the third block column (h folded in)
    return { phi: e.slice(0, n).map((r) => r.slice(0, n)), psi1: e.slice(0, n).map((r) => r[n]), psi2: e.slice(0, n).map((r) => r[n + 1]) };
  };
  // flat arrays and unrolled small loops: this runs for every keystroke and inside the solves
  const tail = tEnd > tRamp;
  const segR = segments(0, tRamp, tauMin, tauSum, nRamp);
  const segT = tail ? segments(tRamp, tEnd, tauMin, tauSum, nTail) : [];
  const nR = segR.reduce((q, [, k]) => q + k, 0);
  const N = nR + segT.reduce((q, [, k]) => q + k, 0) + 1;
  const t = new Float64Array(N);
  const u = new Float64Array(N);
  const X = new Float64Array(N * n);
  t[0] = 0;
  u[0] = 0;
  let idx = 0;
  const run = (h: number, steps: number, slope: number) => {
    const { phi, psi1, psi2 } = stepper(h);
    const P = Float64Array.from(phi.flat());
    for (let k = 0; k < steps; k++) {
      const u0 = u[idx];
      const o = idx * n;
      for (let i = 0; i < n; i++) {
        let v = psi1[i] * u0 + psi2[i] * slope * h;
        for (let j = 0; j < n; j++) v += P[i * n + j] * X[o + j];
        X[o + n + i] = v;
      }
      idx++;
      t[idx] = t[idx - 1] + h;
      u[idx] = Math.min(1, u0 + slope * h);
    }
  };
  for (const [len, k] of segR) run(len / k, k, 1 / tRamp);
  u[idx] = 1;
  t[idx] = tRamp;
  for (const [len, k] of segT) run(len / k, k, 0);
  const slope = 1 / tRamp;
  const rho = new Float64Array(N);
  const v2 = new Float64Array(N);
  const drho = { l: new Float64Array(N), r: new Float64Array(N) };
  const dv2 = { l: new Float64Array(N), r: new Float64Array(N) };
  const xd = new Float64Array(n);
  for (let i = 0; i < N; i++) {
    const o = i * n;
    let c1x = 0;
    let c2x = 0;
    let c1d = 0;
    let c2d = 0;
    for (let k = 0; k < n; k++) {
      let v = sys.b[k] * u[i];
      for (let j = 0; j < n; j++) v += sys.a[k][j] * X[o + j];
      xd[k] = v;
      c1x += sys.c1[k] * X[o + k];
      c2x += sys.c2[k] * X[o + k];
      c1d += sys.c1[k] * v;
      c2d += sys.c2[k] * v;
    }
    rho[i] = c1x + sys.d1 * u[i] - u[i];
    v2[i] = c2x + sys.d2 * u[i];
    // the state derivative is continuous; only the direct term D·u' jumps at the ramp corners (samples 0 and nR)
    const ul = i >= 1 && i <= nR ? slope : 0;
    const ur = i < nR ? slope : 0;
    drho.l[i] = c1d + (sys.d1 - 1) * ul;
    drho.r[i] = c1d + (sys.d1 - 1) * ur;
    dv2.l[i] = c2d + sys.d2 * ul;
    dv2.r[i] = c2d + sys.d2 * ur;
  }
  return { t, u, rho, v2, drho, dv2 };
}

/** Cubic Hermite value on [t0, t1] at fraction θ. */
function herm(y0: number, y1: number, m0: number, m1: number, h: number, th: number): number {
  const t2 = th * th;
  const t3 = t2 * th;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + th) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
}

/** First time y(t) crosses `level` going up (Hermite-refined); null if never. */
export function crossUp(t: Arr, y: Arr, dy: { l: Arr; r: Arr }, level: number): number | null {
  for (let i = 0; i + 1 < t.length; i++) {
    if (y[i] < level && y[i + 1] >= level) {
      const h = t[i + 1] - t[i];
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (herm(y[i], y[i + 1], dy.r[i], dy.l[i + 1], h, mid) < level) lo = mid;
        else hi = mid;
      }
      return t[i] + ((lo + hi) / 2) * h;
    }
  }
  return null;
}

/** Extreme (sign = 1: max, −1: min) of a sampled curve, refined on the Hermite cubic around the best sample. */
export function extreme(t: Arr, y: Arr, dy: { l: Arr; r: Arr }, sign: 1 | -1): { t: number; y: number } {
  let best = 0;
  for (let i = 1; i < y.length; i++) if (sign * y[i] > sign * y[best]) best = i;
  let bt = t[best];
  let by = y[best];
  for (const i of [best - 1, best]) {
    if (i < 0 || i + 1 >= t.length) continue;
    const h = t[i + 1] - t[i];
    // golden-section search of the cubic on the interval
    let a = 0;
    let b = 1;
    const g = (th: number) => sign * herm(y[i], y[i + 1], dy.r[i], dy.l[i + 1], h, th);
    const r = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 80; k++) {
      const c1 = b - r * (b - a);
      const c2 = a + r * (b - a);
      if (g(c1) > g(c2)) b = c2;
      else a = c1;
    }
    const th = (a + b) / 2;
    const v = herm(y[i], y[i + 1], dy.r[i], dy.l[i + 1], h, th);
    if (sign * v > sign * by) {
      by = v;
      bt = t[i] + th * h;
    }
  }
  return { t: bt, y: by };
}

export interface StepMetrics {
  /** 10–90 % rise of the transmitted wave (s) */
  trOut: number;
  /** delay of the 50 % point against the incident 50 % point (s) */
  delay: number;
  /** overshoot of the transmitted wave above 1 (fraction, ≥ 0) */
  overshoot: number;
  rhoMin: { t: number; y: number };
  rhoMax: { t: number; y: number };
  wave: StepWave;
}

/** Simulate a ramp of 10–90 % time tr through the via and measure the transmitted and reflected waves. */
export function stepResponse(top: Topology, l: number, c: number, z0: number, tr: number): StepMetrics {
  const tRamp = tr / 0.8;
  const { tauC, tauL } = timeScales(top, l, c, z0);
  // window: the ramp plus 14 time constants of the slowest mechanism (the π/T networks decay at least this fast)
  const tEnd = tRamp + 14 * (tauC + tauL) + 0.6 * tRamp;
  // fastest time scale of the network: the half-capacitances and half-inductances, and the LC period
  const cand = [top !== 'l' ? (c * z0) / 4 : Infinity, top !== 'c' ? l / (4 * z0) : Infinity, top === 'pi' || top === 'tee' ? Math.sqrt(l * c) / 4 : Infinity];
  const w = simulate(top, l, c, z0, tRamp, tEnd, Math.min(...cand), tauC + tauL);
  const t10 = crossUp(w.t, w.v2, w.dv2, 0.1);
  const t50 = crossUp(w.t, w.v2, w.dv2, 0.5);
  const t90 = crossUp(w.t, w.v2, w.dv2, 0.9);
  const vmax = extreme(w.t, w.v2, w.dv2, 1);
  return {
    trOut: t10 != null && t90 != null ? t90 - t10 : NaN,
    delay: t50 != null ? t50 - tRamp / 2 : NaN,
    overshoot: Math.max(0, vmax.y - 1),
    rhoMin: extreme(w.t, w.rho, w.drho, -1),
    rhoMax: extreme(w.t, w.rho, w.drho, 1),
    wave: w,
  };
}

/** Impedance seen by a TDR for a reflection ρ (Ω). */
export const zOfRho = (rho: number, z0: number) => (z0 * (1 + rho)) / (1 - rho);
