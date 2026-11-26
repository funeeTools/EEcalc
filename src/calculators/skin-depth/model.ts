/**
 * Skin effect — equations (pure, SI in / SI out).
 *
 *  - Skin depth δ = 1/√(π f μ0 μr σ), surface resistance Rs = 1/(σδ) = √(π f μ/σ)
 *    (Ramo, Whinnery & Van Duzer, Fields and Waves in Communication Electronics, 3rd ed., §3.16–3.17).
 *  - Round wire, exact internal impedance per unit length (same reference, §5.12; also S. A. Schelkunoff,
 *    Bell Syst. Tech. J. 13 (1934) 532):
 *        Z = (k / (2π a σ)) · J0(k a) / J1(k a),   k = (1 − j)/δ
 *    so  Z / Rdc = (k a / 2) · J0(k a) / J1(k a),  Rdc = 1/(π a² σ).
 *    This is the Bessel form of the classic Kelvin-function (ber/bei) result. Isolated straight wire, no
 *    proximity effect.
 *
 * Numerics. With w = −(ka)²/4 = j (a/δ)²/2 the power series give Z/Rdc = S0/S1, where
 * S0 = Σ w^n/(n!)² and S1 = Σ w^n/(n!(n+1)!), used for a/δ ≤ 30 (≥ 10 significant digits). Above that
 * the Hankel asymptotic expansion (Abramowitz & Stegun 9.2.5–9.2.10, 16 terms) is used, J ≈ H⁽¹⁾/2 since
 * Im(ka) < 0: Z/Rdc = (ka/2) · j · (P0 + jQ0)/(P1 + jQ1); both branches agree to ~1e-12 at the crossover.
 */

import { MU0 } from '@/physics/constants';

export const skinDepth = (f: number, sigma: number, mur: number) => 1 / Math.sqrt(Math.PI * f * MU0 * mur * sigma);
/** Frequency at which the skin depth equals δ (exact inverse of skinDepth). */
export const freqForDepth = (delta: number, sigma: number, mur: number) => 1 / (Math.PI * MU0 * mur * sigma * delta * delta);
export const surfaceResistance = (f: number, sigma: number, mur: number) => Math.sqrt((Math.PI * f * MU0 * mur) / sigma);

interface Cx {
  re: number;
  im: number;
}
const mul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const div = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

/**
 * Internal impedance of a round wire normalised to its DC resistance, as a function of x = a/δ:
 * re = Rac/Rdc, im = ωLi/Rdc.
 */
export function wireZRatio(x: number): Cx {
  if (!(x > 0)) return { re: 1, im: 0 };
  if (x <= 30) {
    const w: Cx = { re: 0, im: (x * x) / 2 };
    let t0: Cx = { re: 1, im: 0 }; // w^n/(n!)^2
    let t1: Cx = { re: 1, im: 0 }; // w^n/(n!(n+1)!)
    const s0: Cx = { re: 1, im: 0 };
    const s1: Cx = { re: 1, im: 0 };
    for (let n = 1; n < 400; n++) {
      t0 = mul(t0, w);
      t0 = { re: t0.re / (n * n), im: t0.im / (n * n) };
      t1 = mul(t1, w);
      t1 = { re: t1.re / (n * (n + 1)), im: t1.im / (n * (n + 1)) };
      s0.re += t0.re;
      s0.im += t0.im;
      s1.re += t1.re;
      s1.im += t1.im;
      if (Math.hypot(t0.re, t0.im) < 1e-18 * Math.hypot(s0.re, s0.im) && n > 4) break;
    }
    return div(s0, s1);
  }
  // Hankel asymptotic expansion (A&S 9.2.9–9.2.10), z = (1 − j) x:
  // P = Σ (−1)^k c_2k, Q = Σ (−1)^k c_2k+1, c_m = Π_{i≤m} (4ν² − (2i−1)²) / (m! (8z)^m)
  const z: Cx = { re: x, im: -x };
  const u = div({ re: 1, im: 0 }, { re: 8 * z.re, im: 8 * z.im });
  const pq = (nu: number) => {
    const mu = 4 * nu * nu;
    const P: Cx = { re: 1, im: 0 };
    const Q: Cx = { re: 0, im: 0 };
    let c: Cx = { re: 1, im: 0 };
    for (let m = 1; m <= 16; m++) {
      c = mul(c, u);
      const f = (mu - (2 * m - 1) ** 2) / m;
      c = { re: c.re * f, im: c.im * f };
      const sgn = Math.floor(m / 2) % 2 ? -1 : 1;
      const tgt = m % 2 ? Q : P;
      tgt.re += sgn * c.re;
      tgt.im += sgn * c.im;
    }
    return { re: P.re - Q.im, im: P.im + Q.re }; // P + jQ
  };
  const r = div(pq(0), pq(1));
  const zj: Cx = { re: x / 2, im: x / 2 }; // (z/2)·j = (1 + j) x / 2
  return mul(zj, r);
}

/** Rac/Rdc of an isolated round wire, exact (Bessel solution). */
export const racRatio = (x: number) => wireZRatio(x).re;

/** Common shortcut: all current in an annulus one skin depth thick, Rac/Rdc = a²/(2aδ − δ²) (δ < a). */
export function racAnnulus(x: number): number {
  return x <= 1 ? 1 : (x * x) / (2 * x - 1);
}

/** High-frequency asymptote Rac/Rdc ≈ a/(2δ) + 1/4 + 3δ/(32a) (from the Hankel expansion). */
export const racAsymptote = (x: number) => x / 2 + 0.25 + 3 / (32 * x);

export interface WireAc {
  delta: number;
  rs: number;
  x: number;
  rdc: number;
  rac: number;
  ratio: number;
  li: number;
  liDc: number;
}

/** Per-metre AC behaviour of a round wire of diameter d. */
export function wireAc(f: number, d: number, sigma: number, mur: number): WireAc {
  const delta = skinDepth(f, sigma, mur);
  const a = d / 2;
  const x = a / delta;
  const zr = wireZRatio(x);
  const rdc = 1 / (Math.PI * a * a * sigma);
  return { delta, rs: 1 / (sigma * delta), x, rdc, rac: rdc * zr.re, ratio: zr.re, li: (rdc * zr.im) / (2 * Math.PI * f), liDc: (MU0 * mur) / (8 * Math.PI) };
}
