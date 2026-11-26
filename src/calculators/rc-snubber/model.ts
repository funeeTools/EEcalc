/**
 * RC snubber for switch-node / diode ringing. Pure, SI in / SI out.
 *
 * Parasitics from two ring measurements (TI SLVA255 eq. 1–3; P. Todd, Unitrode/TI SLUP100):
 *   f₀ = 1/(2π√(L·C_p)),  f₁ = 1/(2π√(L·(C_p + C_add)))
 *   ⇒ C_p = C_add / ((f₀/f₁)² − 1),  L = 1/((2πf₀)²·C_p),  Z₀ = √(L/C_p)
 * Snubber: R_s = k·Z₀ (k = 1 for the textbook critical-damping choice), C_s = n·C_p (n = 3–4),
 *   P_R = ½·C_s·V²·f_sw on an inductive node (one hard edge, SLVA255), C_s·V²·f_sw when both edges are hard
 *   (conservative bound) — see snubberPower().
 *
 * Damping check: a step V applied through L to the node (C_p in parallel with R_s + C_s). With ω₀ = 1/√(L·C_p)
 * and the normalised Laplace variable x = s/ω₀, the node transfer function is
 *   H(x) = (1 + k·n·x) / (k·n·x³ + (1 + n)·x² + k·n·x + 1)
 * (from v/V = 1/(1 + sL·Y), Y = sC_p + sC_s/(1 + sR_sC_s)), so the overshoot depends only on k and n.
 * The step response is evaluated exactly by residues at the three poles.
 */

export interface Parasitics {
  cp: number;
  lp: number;
  z0: number;
  f0: number;
}

/** C_p, L_p and Z₀ from the ring frequency f₀ and the frequency f₁ after adding C_add. */
export function fromTwoFreqs(f0: number, f1: number, cAdd: number): Parasitics {
  const cp = cAdd / ((f0 / f1) ** 2 - 1);
  const lp = 1 / ((2 * Math.PI * f0) ** 2 * cp);
  return { cp, lp, z0: Math.sqrt(lp / cp), f0 };
}

export function fromLC(lp: number, cp: number): Parasitics {
  return { cp, lp, z0: Math.sqrt(lp / cp), f0: 1 / (2 * Math.PI * Math.sqrt(lp * cp)) };
}

type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

export interface StepResponse {
  /** poles in x = s/ω₀ */
  poles: C[];
  /** y(τ) for τ = ω₀·t; y → 1 */
  y: (tau: number) => number;
  /** damping ratio and normalised frequency of the oscillating pair (ζ = 1, ω = 0 if none) */
  zeta: number;
  wRing: number;
}

/** Normalised node step response for R_s = k·Z₀, C_s = n·C_p (n = 0: no snubber, undamped LC). */
export function stepResponse(k: number, n: number): StepResponse {
  if (!(n > 1e-7) || !(k > 0)) {
    // (n ≤ 1e-7: the snubber holds < 1e-7 of the tank energy — treat as absent)
    // bare LC (or a snubber of zero R: C_s simply adds to C_p)
    const w = n > 1e-7 ? 1 / Math.sqrt(1 + n) : 1;
    return { poles: [[0, w], [0, -w]], y: (t) => 1 - Math.cos(w * t), zeta: 0, wRing: w };
  }
  const a3 = k * n;
  const a2 = 1 + n;
  const a1 = k * n;
  const D = (x: number) => ((a3 * x + a2) * x + a1) * x + 1;
  // one real root on (−∞, 0): D(0) = 1 > 0, D(−∞) < 0
  let lo = -1;
  while (D(lo) > 0) lo *= 2;
  let hi = 0;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (D(m) > 0) hi = m;
    else lo = m;
  }
  const r = (lo + hi) / 2;
  // deflate: D(x) = (x − r)(a3 x² + b x + c)
  // (deflated from the end that avoids cancellation: for |r| > 1 match the constant and x terms)
  const big = Math.abs(r) > 1;
  const c = big ? -1 / r : a1 + (a2 + a3 * r) * r;
  const b = big ? (c - a1) / r : a2 + a3 * r;
  const disc = b * b - 4 * a3 * c;
  const poles: C[] = [[r, 0]];
  if (disc < 0) {
    const re = -b / (2 * a3);
    const im = Math.sqrt(-disc) / (2 * a3);
    poles.push([re, im], [re, -im]);
  } else {
    const sq = Math.sqrt(disc);
    // numerically stable pair
    const q = -0.5 * (b + Math.sign(b || 1) * sq);
    poles.push([q / a3, 0], [c / q, 0]);
  }
  // residues of H(x)/x at each pole: N(p)/(p·D'(p)); constant term 1 from x = 0 (H(0) = 1)
  const Dp = (p: C): C => {
    const p2 = cmul(p, p);
    return [3 * a3 * p2[0] + 2 * a2 * p[0] + a1, 3 * a3 * p2[1] + 2 * a2 * p[1]];
  };
  // split nearly repeated poles so the residue formula stays finite (moves the poles by ~1e-7 relative)
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++)
      if (Math.hypot(poles[i][0] - poles[j][0], poles[i][1] - poles[j][1]) < 1e-6 * Math.hypot(...poles[i])) {
        poles[i] = [poles[i][0] * (1 + 1e-6), poles[i][1]];
        poles[j] = [poles[j][0] * (1 - 1e-6), poles[j][1]];
      }
  const res = poles.map((p) => cdiv([1 + k * n * p[0], k * n * p[1]], cmul(p, Dp(p))));
  const y = (t: number) => {
    let v = 1;
    for (let i = 0; i < 3; i++) {
      const [pr, pi] = poles[i];
      const e = Math.exp(pr * t);
      v += e * (res[i][0] * Math.cos(pi * t) - res[i][1] * Math.sin(pi * t));
    }
    return v;
  };
  const osc = poles.find((p) => p[1] > 0);
  const zeta = osc ? -osc[0] / Math.hypot(osc[0], osc[1]) : 1;
  return { poles, y, zeta, wRing: osc ? osc[1] : 0 };
}

/** Peak of the normalised step response (1 = no overshoot, 2 = undamped LC) and where it occurs (τ = ω₀t). */
export function peak(k: number, n: number): { peak: number; tau: number } {
  const sr = stepResponse(k, n);
  // the first maximum of the slowest oscillation lies within half its period. Scan the first 40 (in ω₀t,
  // ≈ 6 periods of the bare ring) finely, then the rest of three slow periods coarsely.
  const span = 3 * 2 * Math.PI * Math.sqrt(1 + n);
  const ts: number[] = [];
  const early = Math.min(span, 40);
  for (let i = 0; i <= 400; i++) ts.push((early * i) / 400);
  if (span > early) for (let i = 1; i <= 600; i++) ts.push(early + ((span - early) * i) / 600);
  let best = -Infinity;
  let at = 0;
  let ia = 0;
  ts.forEach((t, i) => {
    const v = sr.y(t);
    if (v > best) {
      best = v;
      at = t;
      ia = i;
    }
  });
  // golden-section polish around the sample maximum (40 steps: 1e-8 of the bracket)
  let a = ts[Math.max(0, ia - 1)];
  let b = ts[Math.min(ts.length - 1, ia + 1)];
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (sr.y(c) > sr.y(d)) b = d;
    else a = c;
  }
  const tm = (a + b) / 2;
  const vm = sr.y(tm);
  return vm > best ? { peak: vm, tau: tm } : { peak: best, tau: at };
}

/**
 * Resistor power. Each edge that steps the node by V through R_s dissipates ½·C_s·V² (whatever R_s is).
 * On an inductive, hard-switched node only the switch-driven edge is such a step; the other edge is
 * commutated by the inductor current, which recharges C_s with little loss: P ≈ ½·C_s·V²·f (TI SLVA255).
 * If both edges are hard (or as a conservative bound): P = C_s·V²·f.
 */
export const snubberPower = (cs: number, v: number, fsw: number, edges: 'inductive' | 'both' = 'both') => (edges === 'both' ? 1 : 0.5) * cs * v * v * fsw;
