/**
 * Inductor energy — pure model (no DOM), SI in/out.
 *
 * Ideal inductor (Alexander & Sadiku, Fundamentals of Electric Circuits, 6th ed., §6.4; Horowitz & Hill,
 * The Art of Electronics 3e, §1.5):
 *   v = L·di/dt,  λ = L·I (flux linkage, Wb-turns),  E = ½·L·I² = λ²/(2L)
 * Current ramp from 0 when a step V is applied through a series resistance R (first-order RL step response,
 * Alexander & Sadiku §7.6; Nilsson & Riedel ch. 7):
 *   i(t) = (V/R)·(1 − e^(−t/τ)),  τ = L/R;   time to reach I:  t = −τ·ln(1 − I·R/V)   (needs I < V/R)
 *   R → 0:  i(t) = V·t/L,  t = L·I/V.
 * Turn-off into a clamp: the coil current I decays against a constant reverse voltage V_cl plus the drop iR,
 *   L·di/dt = −(V_cl + i·R)  →  i(t) = (I + V_cl/R)·e^(−t/τ) − V_cl/R,
 *   t_off = τ·ln(1 + I·R/V_cl)  (R → 0: L·I/V_cl),  energy into the clamp E_cl = V_cl·∫i dt = V_cl·(τ·I − V_cl·t_off/R)
 *   (R → 0: ½·L·I²); the rest of ½·L·I² heats R.
 */

export const energy = (l: number, i: number) => 0.5 * l * i * i;
export const fluxLinkage = (l: number, i: number) => l * i;

/** Current after time t of a step V applied through R into L (from 0 A). */
export function iRamp(t: number, l: number, v: number, r: number): number {
  if (!(r > 0)) return (v * t) / l;
  return (v / r) * -Math.expm1((-t * r) / l);
}

/** Time to reach current i from 0 A; NaN when i ≥ V/R (never reached). */
export function tReach(i: number, l: number, v: number, r: number): number {
  if (!(r > 0)) return (l * i) / v;
  const x = (i * r) / v;
  if (!(x < 1)) return NaN;
  return -(l / r) * Math.log1p(-x);
}

/** L that reaches current i at time t (inverse of tReach); NaN when unreachable. */
export function lFor(i: number, t: number, v: number, r: number): number {
  if (!(r > 0)) return (v * t) / i;
  const x = (i * r) / v;
  if (!(x < 1)) return NaN;
  return (t * r) / -Math.log1p(-x);
}

/** V needed to reach current i at time t through R. */
export function vFor(i: number, t: number, l: number, r: number): number {
  if (!(r > 0)) return (l * i) / t;
  return (i * r) / -Math.expm1((-t * r) / l);
}

/** Turn-off into a clamp voltage vcl (> 0): decay time and energy split. */
export function turnOff(i: number, l: number, r: number, vcl: number): { t: number; eClamp: number; eR: number } {
  const e0 = energy(l, i);
  if (!(r > 0)) return { t: (l * i) / vcl, eClamp: e0, eR: 0 };
  const tau = l / r;
  const x = (i * r) / vcl;
  const t = tau * Math.log1p(x);
  // E_cl = V_cl·(τI − V_cl·t/R) = L·I²·(x − ln(1 + x))/x²; the series avoids cancellation for small x
  const g = x < 1e-3 ? 0.5 - x / 3 + (x * x) / 4 - (x * x * x) / 5 : (x - Math.log1p(x)) / (x * x);
  const eClamp = l * i * i * g;
  return { t, eClamp: Math.min(Math.max(eClamp, 0), e0), eR: Math.max(e0 - eClamp, 0) };
}

/** Coil current during the turn-off decay, s after the switch opens. */
export function iOff(t: number, i0: number, l: number, r: number, vcl: number): number {
  if (!(r > 0)) return i0 - (vcl * t) / l;
  return (i0 + vcl / r) * Math.exp((-t * r) / l) - vcl / r;
}
