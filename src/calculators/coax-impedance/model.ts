/**
 * Coaxial line — equations (pure, SI in / SI out).
 *
 * TEM line between two concentric round conductors, inner diameter d, outer (shield inner) diameter D,
 * filled with a homogeneous dielectric εr (μr = 1). Sources:
 *  - D. M. Pozar, Microwave Engineering, 4th ed., §2.1–2.2 (Table 2.1: L', C', R', G' of coax),
 *    §2.7 (attenuation), §3.5 (higher-order modes of coax, kc ≈ 2/(a+b)).
 *  - S. Ramo, J. R. Whinnery, T. Van Duzer, Fields and Waves in Communication Electronics, 3rd ed.,
 *    §5.11 and §8.10 (coaxial line, TE11 cutoff from the Bessel cross-product equation).
 *  - N. Marcuvitz, Waveguide Handbook, MIT Rad. Lab. Ser. vol. 10, 1951, §2.4 (coaxial waveguide modes).
 *  - M. Abramowitz, I. A. Stegun, Handbook of Mathematical Functions, 1964, 9.4.1–9.4.6
 *    (polynomial approximations of J0, J1, Y0, Y1 used for the exact TE11 cutoff).
 */

import { brent } from '@/core/calc/solve';
import { wireZRatio } from '@/calculators/skin-depth/model';
import { C_LIGHT, EPS0, MU0 } from '@/physics/constants';

export const C0 = C_LIGHT;
/** Free-space wave impedance μ0·c ≈ 376.73 Ω */
export const ETA0 = MU0 * C_LIGHT;
export const NP_TO_DB = 20 / Math.LN10;

/** Z₀ = η0/(2π√εr) · ln(D/d) */
export function coaxZ0(D: number, d: number, er: number): number {
  return (ETA0 / (2 * Math.PI * Math.sqrt(er))) * Math.log(D / d);
}

/** Outer diameter for a target Z₀ (exact inverse of coaxZ0). */
export function coaxDForZ0(z0: number, d: number, er: number): number {
  return d * Math.exp((2 * Math.PI * Math.sqrt(er) * z0) / ETA0);
}

/** Inner diameter for a target Z₀ (exact inverse of coaxZ0). */
export function coaxdForZ0(z0: number, D: number, er: number): number {
  return D * Math.exp((-2 * Math.PI * Math.sqrt(er) * z0) / ETA0);
}

/** εr for a target Z₀ (exact inverse of coaxZ0). */
export function coaxErForZ0(z0: number, D: number, d: number): number {
  return ((ETA0 * Math.log(D / d)) / (2 * Math.PI * z0)) ** 2;
}

/** External inductance per metre μ0/(2π)·ln(D/d) (high-frequency value; internal inductance omitted). */
export const lPerM = (D: number, d: number) => (MU0 / (2 * Math.PI)) * Math.log(D / d);
/** Capacitance per metre 2π ε0 εr / ln(D/d) */
export const cPerM = (D: number, d: number, er: number) => (2 * Math.PI * EPS0 * er) / Math.log(D / d);

/** Surface resistance of a good conductor √(π f μ0 / σ) */
export const surfaceR = (f: number, sigma: number) => Math.sqrt((Math.PI * f * MU0) / sigma);
export const skinDepth = (f: number, sigma: number) => 1 / Math.sqrt(Math.PI * f * MU0 * sigma);

/**
 * Line loss from the exact propagation constant γ = √((R′ + jX′)(G′ + jωC′)) (Pozar §2.1, eq. 2.5).
 *  - Inner conductor: exact internal impedance of a solid round wire (Bessel solution, shared with the
 *    skin-depth calculator), so it is right from DC (R = Rdc) to the skin-effect limit Rs/(2πa).
 *  - Outer conductor: thick-wall surface impedance Rs(1 + j)/(2πb). This is the textbook high-frequency
 *    value; when δ approaches the real shield thickness it underestimates the shield resistance.
 *  - G′ = ωC′ tanδ.
 * At high frequency α_c → R′/(2Z₀) with R′ = (Rs/2π)(1/a + 1/b) and α_d → k tanδ/2 (Pozar §2.7).
 * Smooth solid conductors, both of conductivity σ.
 */
export interface LineLoss {
  /** Conductor-only attenuation (G′ = 0), Np/m */
  alphaC: number;
  /** Dielectric-only attenuation (R′ = 0), Np/m */
  alphaD: number;
  /** Total attenuation, Np/m */
  alpha: number;
  /** Series resistance per metre (inner exact + outer surface), Ω/m */
  rPer: number;
  /** Series reactance per metre including internal inductance, Ω/m */
  xPer: number;
  /** |Zc| of the lossy line, Ω */
  zcMag: number;
}

function csqrt(re: number, im: number): { re: number; im: number } {
  const m = Math.hypot(re, im);
  const r = Math.sqrt((m + re) / 2);
  const i = Math.sqrt(Math.max((m - re) / 2, 0));
  return { re: r, im: im < 0 ? -i : i };
}

export function lineLoss(f: number, D: number, d: number, er: number, sigma: number, tanD: number): LineLoss {
  const w = 2 * Math.PI * f;
  const a = d / 2;
  const b = D / 2;
  const L = lPerM(D, d);
  const C = cPerM(D, d, er);
  const zi = wireZRatio(a / skinDepth(f, sigma));
  const rdcIn = 1 / (Math.PI * a * a * sigma);
  const rOut = surfaceR(f, sigma) / (2 * Math.PI * b);
  const R = rdcIn * zi.re + rOut;
  const X = w * L + rdcIn * zi.im + rOut;
  const G = w * C * tanD;
  const B = w * C;
  // γ = √((R + jX)(G + jB))
  const alphaOf = (r: number, x: number, g: number) => csqrt(r * g - x * B, r * B + x * g).re;
  const zc = csqrt(...divC(R, X, G, B));
  return { alphaC: alphaOf(R, X, 0), alphaD: alphaOf(0, w * L, G), alpha: alphaOf(R, X, G), rPer: R, xPer: X, zcMag: Math.hypot(zc.re, zc.im) };
}

function divC(ar: number, ai: number, br: number, bi: number): [number, number] {
  const den = br * br + bi * bi;
  return [(ar * br + ai * bi) / den, (ai * br - ar * bi) / den];
}

/** Conductor attenuation (Np/m). */
export const alphaConductor = (f: number, D: number, d: number, er: number, sigma: number) => lineLoss(f, D, d, er, sigma, 0).alphaC;

/** Dielectric attenuation (Np/m); → π f √εr tanδ / c for a low-loss dielectric. */
export const alphaDielectric = (f: number, D: number, d: number, er: number, tanD: number) => lineLoss(f, D, d, er, 5.8e7, tanD).alphaD;

// ── Bessel functions (Abramowitz & Stegun 9.4.1–9.4.6, |ε| ≤ 1.1e-7 for 0 < x ≤ 3) ────────────────
// For x > 3 the power series is used (never reached for the TE11 root, where kc·b < 2).

function besselSeries(x: number): { j0: number; j1: number; y0: number; y1: number } {
  const g = 0.5772156649015329;
  const h = x / 2;
  const q = h * h;
  let t0 = 1;
  let t1 = h;
  let j0 = 0;
  let j1 = 0;
  let s0 = 0;
  let s1 = 0;
  let H = 0; // harmonic number H_k
  for (let k = 0; k < 80; k++) {
    if (k > 0) {
      t0 *= -q / (k * k);
      t1 *= -q / (k * (k + 1));
    }
    const Hk1 = H + 1 / (k + 1);
    j0 += t0;
    j1 += t1;
    if (k > 0) s0 -= t0 * H; // Y0 tail: −Σ (−q)^k H_k /(k!)^2 = Σ (−1)^{k+1} H_k q^k/(k!)^2
    s1 += t1 * (H + Hk1); // ψ(k+1)+ψ(k+2) = H_k + H_{k+1} − 2γ
    H = Hk1;
    if (Math.abs(t0) < 1e-17 * Math.abs(j0) && Math.abs(t1) < 1e-17 * Math.abs(j1) && k > 3) break;
  }
  const ln = Math.log(h);
  const y0 = (2 / Math.PI) * ((ln + g) * j0 + s0);
  const y1 = -2 / (Math.PI * x) + (2 / Math.PI) * (ln + g) * j1 - (1 / Math.PI) * s1;
  return { j0, j1, y0, y1 };
}

export function bessel01(x: number): { j0: number; j1: number; y0: number; y1: number } {
  if (x > 3) return besselSeries(x);
  const t = (x / 3) ** 2;
  const poly = (c: number[]) => c.reduceRight((acc, ci) => acc * t + ci, 0);
  const j0 = poly([1, -2.2499997, 1.2656208, -0.3163866, 0.0444479, -0.0039444, 0.00021]);
  const j1 = x * poly([0.5, -0.56249985, 0.21093573, -0.03954289, 0.00443319, -0.00031761, 0.00001109]);
  const lg = Math.log(x / 2);
  const y0 = (2 / Math.PI) * lg * j0 + poly([0.36746691, 0.60559366, -0.74350384, 0.25300117, -0.04261214, 0.00427916, -0.00024846]);
  const y1 = ((2 / Math.PI) * x * lg * j1 + poly([-0.6366198, 0.2212091, 2.1682709, -1.3164827, 0.3123951, -0.0400976, 0.0027873])) / x;
  return { j0, j1, y0, y1 };
}

/** J1'(x) and Y1'(x) from J1' = J0 − J1/x, Y1' = Y0 − Y1/x. */
function d1(x: number): { jp: number; yp: number } {
  const b = bessel01(x);
  return { jp: b.j0 - b.j1 / x, yp: b.y0 - b.y1 / x };
}

/**
 * TE11 cutoff wavenumber kc (rad/m) of a coaxial guide with radii a < b: the lowest root of
 * J1'(kc a) Y1'(kc b) − J1'(kc b) Y1'(kc a) = 0 (Ramo–Whinnery–Van Duzer §8.10; Marcuvitz §2.4).
 * The root lies between 0.92 and 1.03 times the classic estimate 2/(a+b) (above it for b/a ≲ 9, below it
 * for larger ratios, tending to the circular-guide value 1.8412/b as a → 0).
 */
export function te11Kc(a: number, b: number): number {
  const k0 = 2 / (a + b);
  // Scale out b so the equation is well conditioned for any size.
  const r = a / b;
  const f = (x: number) => {
    // x = kc·b
    const A = d1(x * r);
    const B = d1(x);
    return (A.jp * B.yp - B.jp * A.yp) * (x * r) ** 2; // × (kc a)² keeps Y1'(kc a) ~ 1/x² finite as a → 0
  };
  const x0 = k0 * b;
  let lo = 0.85 * x0;
  let hi = 1.1 * x0;
  if (f(lo) * f(hi) > 0) {
    // fall back to a scan (should not happen for 1 < b/a < 1e4)
    const n = 200;
    let prev = f(0.5 * x0);
    for (let i = 1; i <= n; i++) {
      const x = 0.5 * x0 + (i / n) * 0.7 * x0;
      const v = f(x);
      if (prev * v <= 0) {
        lo = x - (0.7 * x0) / n;
        hi = x;
        break;
      }
      prev = v;
    }
    if (f(lo) * f(hi) > 0) return k0;
  }
  return brent(f, lo, hi, 1e-13) / b;
}

/** TE11 cutoff frequency (Hz): exact (Bessel root) and the 2/(a+b) estimate. */
export function te11Cutoff(D: number, d: number, er: number): { exact: number; approx: number } {
  const a = d / 2;
  const b = D / 2;
  const v = C0 / Math.sqrt(er);
  return { exact: (v * te11Kc(a, b)) / (2 * Math.PI), approx: (v * (2 / (a + b))) / (2 * Math.PI) };
}

export interface CoaxResult {
  z0: number;
  ratio: number;
  lPer: number;
  cPer: number;
  vf: number;
  vp: number;
  delay: number;
  lambdaG: number;
  fcTe11: number;
  fcTe11Approx: number;
  skinDepth: number;
  rs: number;
  alphaC: number;
  alphaD: number;
  alpha: number;
  rPer: number;
  xPer: number;
  zcMag: number;
}

export function calcCoax(D: number, d: number, er: number, f: number, sigma: number, tanD: number): CoaxResult {
  const z0 = coaxZ0(D, d, er);
  const vp = C0 / Math.sqrt(er);
  const fc = te11Cutoff(D, d, er);
  return {
    z0,
    ratio: D / d,
    lPer: lPerM(D, d),
    cPer: cPerM(D, d, er),
    vf: 1 / Math.sqrt(er),
    vp,
    delay: 1 / vp,
    lambdaG: vp / f,
    fcTe11: fc.exact,
    fcTe11Approx: fc.approx,
    skinDepth: skinDepth(f, sigma),
    rs: surfaceR(f, sigma),
    ...lineLoss(f, D, d, er, sigma, tanD),
  };
}
