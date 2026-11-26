/**
 * NTC thermistor — pure model (no DOM). Temperatures in kelvin inside the model, resistances in ohms.
 *
 * β model (IEC 60539-1 B-value): R(T) = R₀·exp[β(1/T − 1/T₀)],  T(R) = 1/[1/T₀ + ln(R/R₀)/β].
 * Steinhart–Hart (Steinhart & Hart, Deep-Sea Research 15, 1968): 1/T = A + B·ln R + C·(ln R)³.
 *   R(T) by Cardano's formula on the depressed cubic C·x³ + B·x + (A − 1/T) = 0, x = ln R.
 *   A, B, C from three (R, T) points by solving the 3×3 linear system in closed form.
 * Divider readout: NTC to ground ("low") → V = V_S·R/(R + R_S); NTC to supply ("high") → V = V_S·R_S/(R + R_S).
 * Self-heating: P = V_S²·R/(R + R_S)², ΔT = P/δ (δ = dissipation constant, IEC 60539-1).
 */

import { brent } from '@/core/calc/solve';

export const K0 = 273.15;

export interface Ntc {
  /** Resistance at temperature T (K) */
  r(tK: number): number;
  /** Temperature (K) at resistance R */
  t(r: number): number;
}

export function betaModel(r0: number, t0K: number, beta: number): Ntc {
  return {
    r: (tK) => r0 * Math.exp(beta * (1 / tK - 1 / t0K)),
    t: (r) => 1 / (1 / t0K + Math.log(r / r0) / beta),
  };
}

export interface ShCoef {
  a: number;
  b: number;
  c: number;
}

const LN_R_MIN = Math.log(1e-3);
const LN_R_MAX = Math.log(1e13);

/**
 * With C < 0 (and B > 0) 1/T(x) has a turning point at x_t = √(−B/3C): beyond it R(T) is not monotonic
 * and the curve stops being physical. Returns x_t = ln R_t and the temperature there (the lowest
 * temperature the model can describe), or null when the curve is monotonic for all R.
 */
export function shTurning(k: ShCoef): { lnR: number; tK: number } | null {
  if (!(k.c < 0) || !(k.b > 0)) return null;
  const x = Math.sqrt(-k.b / (3 * k.c));
  return { lnR: x, tK: 1 / (k.a + k.b * x + k.c * x * x * x) };
}

/**
 * ln R for 1/T = A + B·x + C·x³. C ≥ 0: Cardano (or the C = 0 line, whichever fits better as a start),
 * Newton-polished so tiny |C| keeps full precision. C < 0: Brent on the monotonic branch x < x_t only.
 * NaN when T is outside what the coefficients can describe.
 */
export function shLnR(k: ShCoef, tK: number): number {
  const d = k.a - 1 / tK;
  const f = (x: number) => k.c * x * x * x + k.b * x + d;
  const fp = (x: number) => 3 * k.c * x * x + k.b;
  if (k.c < 0) {
    const t = shTurning(k);
    const lo = t ? Math.max(LN_R_MIN, -t.lnR) : LN_R_MIN;
    const hi = t ? Math.min(LN_R_MAX, t.lnR) : LN_R_MAX;
    return hi > lo && f(lo) * f(hi) <= 0 ? brent(f, lo, hi, 1e-15) : NaN;
  }
  const x0 = -d / k.b; // C = 0 solution
  let x = x0;
  if (k.c > 0) {
    const p = k.b / k.c;
    const q = d / k.c;
    const disc = (q * q) / 4 + (p * p * p) / 27;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const xc = Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s);
      if (Number.isFinite(xc) && Math.abs(f(xc)) < Math.abs(f(x0))) x = xc;
    }
  }
  for (let i = 0; i < 50; i++) {
    const dx = f(x) / fp(x);
    if (!Number.isFinite(dx)) return NaN;
    x -= dx;
    if (Math.abs(dx) <= 1e-15 * Math.max(1, Math.abs(x))) break;
  }
  return x;
}

export function shModel(k: ShCoef): Ntc {
  return {
    r: (tK) => Math.exp(shLnR(k, tK)),
    t: (r) => {
      const x = Math.log(r);
      return 1 / (k.a + k.b * x + k.c * x * x * x);
    },
  };
}

/** Steinhart–Hart coefficients through three (R, T[K]) points. Throws if the points are degenerate. */
export function fitSH(pts: { r: number; tK: number }[]): ShCoef {
  const [l1, l2, l3] = pts.map((p) => Math.log(p.r));
  const [y1, y2, y3] = pts.map((p) => 1 / p.tK);
  if (l1 === l2 || l1 === l3 || l2 === l3) throw new Error('The three fit points need three different resistances.');
  const g2 = (y2 - y1) / (l2 - l1);
  const g3 = (y3 - y1) / (l3 - l1);
  const c = ((g3 - g2) / (l3 - l2)) / (l1 + l2 + l3);
  const b = g2 - c * (l1 * l1 + l1 * l2 + l2 * l2);
  const a = y1 - (b + l1 * l1 * c) * l1;
  return { a, b, c };
}

/** β between two points (the B-value definition, e.g. B25/85). */
export const betaBetween = (r1: number, t1K: number, r2: number, t2K: number) => Math.log(r1 / r2) / (1 / t1K - 1 / t2K);

/** d(ln R)/dT and d²(ln R)/dT² by central differences (h = 0.01 K; ln R is smooth). */
export function lnDerivs(n: Ntc, tK: number): { d1: number; d2: number } {
  const h = 0.01;
  const up = Math.log(n.r(tK + h));
  const mid = Math.log(n.r(tK));
  const dn = Math.log(n.r(tK - h));
  return { d1: (up - dn) / (2 * h), d2: (up - 2 * mid + dn) / (h * h) };
}

export type Divider = 'low' | 'high';

export function vOut(r: number, rs: number, vs: number, div: Divider): number {
  return div === 'low' ? (vs * r) / (r + rs) : (vs * rs) / (r + rs);
}

/** Thermistor resistance from a divider output (0 < V < V_S). */
export function rFromV(v: number, rs: number, vs: number, div: Divider): number {
  return div === 'low' ? (rs * v) / (vs - v) : (rs * (vs - v)) / v;
}

/** Power in the thermistor (W): the same for both divider positions. */
export const selfHeatPower = (r: number, rs: number, vs: number) => (vs * vs * r) / ((r + rs) * (r + rs));

/** dV/dT (V/K) of the divider at temperature T. */
export function dVdT(n: Ntc, tK: number, rs: number, vs: number, div: Divider): number {
  const r = n.r(tK);
  const { d1 } = lnDerivs(n, tK); // (1/R)dR/dT
  const dVdR = (vs * rs) / ((r + rs) * (r + rs)) * (div === 'low' ? 1 : -1);
  return dVdR * r * d1;
}

/**
 * Series resistor that puts the inflection point of V(T) at T_m (best linearity around T_m):
 * with u = ln R, V'' = 0 ⇔ (s − 1)/(s + 1) = −u''/u'², s = R_S/R(T_m). For the β model this is
 * R_S = R(T_m)·(β − 2T_m)/(β + 2T_m). Null when no positive R_S exists.
 */
export function rsInflection(n: Ntc, tmK: number): number | null {
  const { d1, d2 } = lnDerivs(n, tmK);
  const k = -d2 / (d1 * d1);
  const s = (1 + k) / (1 - k);
  return s > 0 && Number.isFinite(s) ? s * n.r(tmK) : null;
}

/** Largest deviation of V(T) from the straight line through the range ends, expressed in kelvin. */
export function nonlinearityK(n: Ntc, loK: number, hiK: number, rs: number, vs: number, div: Divider): number {
  const vLo = vOut(n.r(loK), rs, vs, div);
  const vHi = vOut(n.r(hiK), rs, vs, div);
  const slope = (vHi - vLo) / (hiK - loK);
  if (slope === 0) return Infinity;
  let worst = 0;
  for (let i = 1; i < 100; i++) {
    const t = loK + ((hiK - loK) * i) / 100;
    const dev = Math.abs((vOut(n.r(t), rs, vs, div) - (vLo + slope * (t - loK))) / slope);
    if (dev > worst) worst = dev;
  }
  return worst;
}
