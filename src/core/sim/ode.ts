/**
 * General-purpose ODE integrators for circuit transients.
 *
 *  - dopri5 : Dormand–Prince 5(4), adaptive, FSAL. Accurate for ringing circuits.
 *  - ros23  : Shampine–Reichelt Rosenbrock 2(3) (MATLAB ode23s). L-stable, for stiff
 *             circuits (tiny L with big R, etc.). Uses a finite-difference Jacobian.
 *  - auto   : dopri5 first; if it burns through its step budget (stiffness), re-run ros23.
 *
 * The right-hand side writes into `dydt` to avoid allocation in the inner loop.
 */

import { luFactor, luSolve } from './linalg';

export type Rhs = (t: number, y: Float64Array, dydt: Float64Array) => void;

export interface OdeOptions {
  rtol?: number;
  /** Absolute tolerance, scalar or per component. */
  atol?: number | ArrayLike<number>;
  /** Largest step allowed (also controls plot / peak resolution). */
  hmax?: number;
  hinit?: number;
  maxSteps?: number;
  /** Times the integrator must land on exactly (breakpoints in the source). */
  tstops?: number[];
  method?: 'dopri5' | 'ros23' | 'auto';
}

export interface OdeResult {
  t: Float64Array;
  /** y[k] is the time history of state component k. */
  y: Float64Array[];
  steps: number;
  rejected: number;
  method: 'dopri5' | 'ros23';
  ok: boolean;
  message: string;
}

class Recorder {
  t: number[] = [];
  y: number[][];
  constructor(n: number) {
    this.y = Array.from({ length: n }, () => []);
  }
  push(t: number, y: Float64Array): void {
    this.t.push(t);
    for (let k = 0; k < y.length; k++) this.y[k].push(y[k]);
  }
  finish(): { t: Float64Array; y: Float64Array[] } {
    return { t: Float64Array.from(this.t), y: this.y.map((a) => Float64Array.from(a)) };
  }
}

function makeAtol(atol: number | ArrayLike<number> | undefined, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    out[k] = typeof atol === 'number' ? atol : atol ? atol[k] : 1e-9;
  }
  return out;
}

function errNorm(err: Float64Array, y0: Float64Array, y1: Float64Array, atol: Float64Array, rtol: number): number {
  let s = 0;
  for (let k = 0; k < err.length; k++) {
    const sc = atol[k] + rtol * Math.max(Math.abs(y0[k]), Math.abs(y1[k]));
    const r = err[k] / sc;
    s += r * r;
  }
  return Math.sqrt(s / err.length);
}

function nextStop(stops: number[], t: number, t1: number): number {
  for (const s of stops) if (s > t * (1 + 1e-12) + 1e-300 && s < t1) return s;
  return t1;
}

function initialStep(f: Rhs, t0: number, y0: Float64Array, f0: Float64Array, atol: Float64Array, rtol: number, order: number, hmax: number): number {
  const n = y0.length;
  let d0 = 0;
  let d1 = 0;
  for (let k = 0; k < n; k++) {
    const sc = atol[k] + rtol * Math.abs(y0[k]);
    d0 += (y0[k] / sc) ** 2;
    d1 += (f0[k] / sc) ** 2;
  }
  d0 = Math.sqrt(d0 / n);
  d1 = Math.sqrt(d1 / n);
  let h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 * hmax : (0.01 * d0) / d1;
  h0 = Math.min(h0, hmax);
  const y1 = new Float64Array(n);
  for (let k = 0; k < n; k++) y1[k] = y0[k] + h0 * f0[k];
  const f1 = new Float64Array(n);
  f(t0 + h0, y1, f1);
  let d2 = 0;
  for (let k = 0; k < n; k++) {
    const sc = atol[k] + rtol * Math.abs(y0[k]);
    d2 += ((f1[k] - f0[k]) / sc) ** 2;
  }
  d2 = Math.sqrt(d2 / n) / h0;
  const h1 = Math.max(d1, d2) <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : (0.01 / Math.max(d1, d2)) ** (1 / (order + 1));
  return Math.min(100 * h0, h1, hmax);
}

// Dormand–Prince tableau
const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const A71 = 35 / 384, A73 = 500 / 1113, A74 = 125 / 192, A75 = -2187 / 6784, A76 = 11 / 84;
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

export function dopri5(f: Rhs, y0in: ArrayLike<number>, t0: number, t1: number, opts: OdeOptions = {}): OdeResult {
  const n = y0in.length;
  const rtol = opts.rtol ?? 1e-6;
  const atol = makeAtol(opts.atol, n);
  const span = t1 - t0;
  const hmax = Math.min(opts.hmax ?? span / 50, span);
  const maxSteps = opts.maxSteps ?? 400000;
  const stops = [...(opts.tstops ?? [])].sort((a, b) => a - b);

  let y = Float64Array.from(y0in);
  const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n), k4 = new Float64Array(n);
  const k5 = new Float64Array(n), k6 = new Float64Array(n), k7 = new Float64Array(n);
  const ys = new Float64Array(n), yn = new Float64Array(n), err = new Float64Array(n);
  const rec = new Recorder(n);
  rec.push(t0, y);

  f(t0, y, k1);
  let h = opts.hinit ?? initialStep(f, t0, y, k1, atol, rtol, 5, hmax);
  let t = t0;
  let steps = 0;
  let rejected = 0;
  let stop = nextStop(stops, t, t1);

  while (t < t1) {
    if (steps + rejected >= maxSteps) {
      return { ...rec.finish(), steps, rejected, method: 'dopri5', ok: false, message: `step budget (${maxSteps}) exhausted at t=${t.toExponential(3)} s` };
    }
    let hit = false;
    if (t + h >= stop * (1 - 1e-12)) {
      h = stop - t;
      hit = true;
    }
    for (let k = 0; k < n; k++) ys[k] = y[k] + h * A21 * k1[k];
    f(t + C2 * h, ys, k2);
    for (let k = 0; k < n; k++) ys[k] = y[k] + h * (A31 * k1[k] + A32 * k2[k]);
    f(t + C3 * h, ys, k3);
    for (let k = 0; k < n; k++) ys[k] = y[k] + h * (A41 * k1[k] + A42 * k2[k] + A43 * k3[k]);
    f(t + C4 * h, ys, k4);
    for (let k = 0; k < n; k++) ys[k] = y[k] + h * (A51 * k1[k] + A52 * k2[k] + A53 * k3[k] + A54 * k4[k]);
    f(t + C5 * h, ys, k5);
    for (let k = 0; k < n; k++) ys[k] = y[k] + h * (A61 * k1[k] + A62 * k2[k] + A63 * k3[k] + A64 * k4[k] + A65 * k5[k]);
    f(t + h, ys, k6);
    for (let k = 0; k < n; k++) yn[k] = y[k] + h * (A71 * k1[k] + A73 * k3[k] + A74 * k4[k] + A75 * k5[k] + A76 * k6[k]);
    f(t + h, yn, k7);
    for (let k = 0; k < n; k++) err[k] = h * (E1 * k1[k] + E3 * k3[k] + E4 * k4[k] + E5 * k5[k] + E6 * k6[k] + E7 * k7[k]);
    const en = errNorm(err, y, yn, atol, rtol);

    if (!Number.isFinite(en)) {
      h *= 0.1;
      rejected++;
      if (h < 1e-30) break;
      continue;
    }
    if (en <= 1) {
      t = hit ? stop : t + h;
      const tmp = y;
      y = Float64Array.from(yn);
      void tmp;
      k1.set(k7);
      rec.push(t, y);
      steps++;
      if (hit) {
        stop = nextStop(stops, t, t1);
        // Source may be discontinuous at a breakpoint: refresh the FSAL derivative.
        f(t, y, k1);
      }
      const fac = en === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * en ** -0.2));
      h = Math.min(h * fac, hmax);
    } else {
      rejected++;
      h *= Math.max(0.2, 0.9 * en ** -0.2);
    }
    if (h < Math.abs(t) * 1e-14 + 1e-300) {
      return { ...rec.finish(), steps, rejected, method: 'dopri5', ok: false, message: 'step size underflow' };
    }
  }
  return { ...rec.finish(), steps, rejected, method: 'dopri5', ok: true, message: '' };
}

const D23 = 1 / (2 + Math.SQRT2);
const E32 = 6 + Math.SQRT2;

export function ros23(f: Rhs, y0in: ArrayLike<number>, t0: number, t1: number, opts: OdeOptions = {}): OdeResult {
  const n = y0in.length;
  const rtol = opts.rtol ?? 1e-5;
  const atol = makeAtol(opts.atol, n);
  const span = t1 - t0;
  const hmax = Math.min(opts.hmax ?? span / 50, span);
  const maxSteps = opts.maxSteps ?? 400000;
  const stops = [...(opts.tstops ?? [])].sort((a, b) => a - b);

  let y = Float64Array.from(y0in);
  const F0 = new Float64Array(n), F1 = new Float64Array(n), F2 = new Float64Array(n);
  const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n);
  const T = new Float64Array(n), ys = new Float64Array(n), yn = new Float64Array(n), err = new Float64Array(n);
  const fp = new Float64Array(n), tmp = new Float64Array(n);
  const J = new Float64Array(n * n);
  const W = new Float64Array(n * n);
  const piv = new Int32Array(n);
  const rec = new Recorder(n);
  rec.push(t0, y);

  f(t0, y, F0);
  let h = opts.hinit ?? initialStep(f, t0, y, F0, atol, rtol, 2, hmax);
  let t = t0;
  let steps = 0;
  let rejected = 0;
  let stop = nextStop(stops, t, t1);
  let needJ = true;

  const jacobian = (): void => {
    for (let j = 0; j < n; j++) {
      const yj = y[j];
      const dj = Math.sqrt(2.2e-16) * Math.max(Math.abs(yj), atol[j] * 1e3, 1e-12);
      y[j] = yj + dj;
      f(t, y, fp);
      y[j] = yj;
      for (let i = 0; i < n; i++) J[i * n + j] = (fp[i] - F0[i]) / dj;
    }
    const dt = Math.sqrt(2.2e-16) * Math.max(Math.abs(t), Math.abs(h), 1e-15);
    f(t + dt, y, fp);
    for (let i = 0; i < n; i++) T[i] = (fp[i] - F0[i]) / dt;
  };

  while (t < t1) {
    if (steps + rejected >= maxSteps) {
      return { ...rec.finish(), steps, rejected, method: 'ros23', ok: false, message: `step budget (${maxSteps}) exhausted at t=${t.toExponential(3)} s` };
    }
    let hit = false;
    if (t + h >= stop * (1 - 1e-12)) {
      h = stop - t;
      hit = true;
    }
    if (needJ) {
      jacobian();
      needJ = false;
    }
    for (let i = 0; i < n * n; i++) W[i] = -h * D23 * J[i];
    for (let i = 0; i < n; i++) W[i * n + i] += 1;
    if (!luFactor(W, n, piv)) {
      h *= 0.5;
      rejected++;
      continue;
    }
    for (let i = 0; i < n; i++) k1[i] = F0[i] + h * D23 * T[i];
    luSolve(W, n, piv, k1);
    for (let i = 0; i < n; i++) ys[i] = y[i] + 0.5 * h * k1[i];
    f(t + 0.5 * h, ys, F1);
    for (let i = 0; i < n; i++) k2[i] = F1[i] - k1[i];
    luSolve(W, n, piv, k2);
    for (let i = 0; i < n; i++) {
      k2[i] += k1[i];
      yn[i] = y[i] + h * k2[i];
    }
    f(t + h, yn, F2);
    for (let i = 0; i < n; i++) k3[i] = F2[i] - E32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]) + h * D23 * T[i];
    luSolve(W, n, piv, k3);
    for (let i = 0; i < n; i++) err[i] = (h / 6) * (k1[i] - 2 * k2[i] + k3[i]);
    const en = errNorm(err, y, yn, atol, rtol);

    if (Number.isFinite(en) && en <= 1) {
      t = hit ? stop : t + h;
      y = Float64Array.from(yn);
      rec.push(t, y);
      steps++;
      if (hit) {
        stop = nextStop(stops, t, t1);
        f(t, y, F0);
      } else {
        F0.set(F2);
      }
      needJ = true;
      const fac = en === 0 ? 5 : Math.min(5, Math.max(0.2, 0.8 * en ** (-1 / 3)));
      h = Math.min(h * fac, hmax);
    } else {
      rejected++;
      h *= Number.isFinite(en) ? Math.max(0.2, 0.8 * en ** (-1 / 3)) : 0.1;
    }
    void tmp;
    if (h < Math.abs(t) * 1e-14 + 1e-300) {
      return { ...rec.finish(), steps, rejected, method: 'ros23', ok: false, message: 'step size underflow' };
    }
  }
  return { ...rec.finish(), steps, rejected, method: 'ros23', ok: true, message: '' };
}

/** dopri5 with automatic fallback to ros23 when the problem turns out to be stiff. */
export function solveOde(f: Rhs, y0: ArrayLike<number>, t0: number, t1: number, opts: OdeOptions = {}): OdeResult {
  const method = opts.method ?? 'auto';
  if (method === 'dopri5') return dopri5(f, y0, t0, t1, opts);
  if (method === 'ros23') return ros23(f, y0, t0, t1, opts);
  const budget = Math.min(opts.maxSteps ?? 400000, 150000);
  const r = dopri5(f, y0, t0, t1, { ...opts, maxSteps: budget });
  if (r.ok) return r;
  const s = ros23(f, y0, t0, t1, { ...opts, rtol: Math.max(opts.rtol ?? 1e-6, 1e-6) });
  if (s.ok) return s;
  return r.t[r.t.length - 1] >= s.t[s.t.length - 1] ? r : s;
}
