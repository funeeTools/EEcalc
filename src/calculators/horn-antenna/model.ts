/**
 * Rectangular horn antennas (pyramidal, E-plane sectoral, H-plane sectoral) — pure model, SI in/out.
 *
 * Aperture model of C. A. Balanis, Antenna Theory: Analysis and Design, 3rd/4th ed., Wiley, ch. 13:
 *   the TE₁₀ field of the feed spreads into the flare with a quadratic phase across the aperture,
 *     E_ap(x, y) = cos(πx/a₁) · exp(−jk[x²/(2ρ₂) + y²/(2ρ₁)])
 *   (ρ₁, ρ₂ = axial apex-to-aperture distances of the E- and H-plane flares; ρ = ∞ for an unflared plane).
 *   The far field is the Fourier transform of E_ap times the Huygens factor (1 + cos θ)/2 (§13.1–13.3).
 *   The two one-dimensional aperture integrals are evaluated in closed form with Fresnel integrals
 *   (Balanis eqs. 13-xx for I₁, I₂), and the directivity is D = 4π|∫E_ap|² / (λ²∫|E_ap|²), which is
 *   Balanis eq. 13-52 for the pyramidal horn (and 13-19 / 13-41 for the sectoral horns).
 * Optimum gain: an E-plane flare has its maximum directivity for b₁ = √(2λρ₁) (s = 1/4), an H-plane flare
 *   for a₁ = √(3λρ₂) (t = 3/8) (Balanis §13.1.3, §13.2.3). Realisability of a pyramidal horn: p_e = p_h
 *   (§13.3.2, eqs. 13-49a/b). Balanis’ closed-form design procedure (§13.4, eqs. 13-56 … 13-58) is also
 *   implemented, to reproduce his Example 13.6.
 * Fresnel integrals C(x), S(x): power series for |x| ≤ 1.5, continued fraction of erfc for larger |x|
 *   (W. H. Press et al., Numerical Recipes, 3rd ed., §6.8 “frenel”), accurate to ~1e-15.
 */

import { brent, invert } from '@/core/calc/solve';

export const C0 = 299_792_458;

export type HornType = 'pyramidal' | 'e-sectoral' | 'h-sectoral';

/** Fresnel integrals C(x) = ∫₀ˣ cos(πt²/2)dt, S(x) = ∫₀ˣ sin(πt²/2)dt. */
export function fresnel(x: number): { c: number; s: number } {
  const EPS = 1e-16;
  const FPMIN = 1e-300;
  const ax = Math.abs(x);
  let c: number;
  let s: number;
  if (ax < 1e-150) {
    c = ax;
    s = 0;
  } else if (ax <= 1.5) {
    let sum = 0;
    let sums = 0;
    let sumc = ax;
    let sign = 1;
    const fact = (Math.PI / 2) * ax * ax;
    let odd = true;
    let term = ax;
    let n = 3;
    for (let k = 1; k <= 200; k++) {
      term *= fact / k;
      sum += (sign * term) / n;
      const test = Math.abs(sum) * EPS;
      if (odd) {
        sign = -sign;
        sums = sum;
        sum = sumc;
      } else {
        sumc = sum;
        sum = sums;
      }
      if (term < test) break;
      odd = !odd;
      n += 2;
    }
    s = sums;
    c = sumc;
  } else {
    // Lentz on the continued fraction for erfc((1−i)√π x /2)
    const pix2 = Math.PI * ax * ax;
    let bRe = 1;
    let bIm = -pix2;
    let ccRe = 1 / FPMIN;
    let ccIm = 0;
    let den = bRe * bRe + bIm * bIm;
    let dRe = bRe / den;
    let dIm = -bIm / den;
    let hRe = dRe;
    let hIm = dIm;
    let n = -1;
    for (let k = 2; k <= 400; k++) {
      n += 2;
      const a = -n * (n + 1);
      bRe += 4;
      // d = 1/(a·d + b)
      const tRe = a * dRe + bRe;
      const tIm = a * dIm + bIm;
      den = tRe * tRe + tIm * tIm;
      dRe = tRe / den;
      dIm = -tIm / den;
      // cc = b + a/cc
      den = ccRe * ccRe + ccIm * ccIm;
      ccRe = bRe + (a * ccRe) / den;
      ccIm = bIm - (a * ccIm) / den;
      // del = cc·d ; h = h·del
      const delRe = ccRe * dRe - ccIm * dIm;
      const delIm = ccRe * dIm + ccIm * dRe;
      const nhRe = hRe * delRe - hIm * delIm;
      const nhIm = hRe * delIm + hIm * delRe;
      hRe = nhRe;
      hIm = nhIm;
      if (Math.abs(delRe - 1) + Math.abs(delIm) < EPS) break;
    }
    // h = h·(ax − i ax)
    const h2Re = hRe * ax + hIm * ax;
    const h2Im = hIm * ax - hRe * ax;
    // cs = (1+i)/2 · (1 − (cos + i sin)(pix2/2) · h)
    const cr = Math.cos(0.5 * pix2);
    const si = Math.sin(0.5 * pix2);
    const pRe = 1 - (cr * h2Re - si * h2Im);
    const pIm = -(cr * h2Im + si * h2Re);
    c = 0.5 * (pRe - pIm);
    s = 0.5 * (pRe + pIm);
  }
  return x < 0 ? { c: -c, s: -s } : { c, s };
}

interface Cx {
  re: number;
  im: number;
}

/**
 * ∫_{−w/2}^{w/2} exp(−j[k u²/(2ρ) − q u]) du (uniform amplitude, quadratic phase), closed form with Fresnel
 * integrals; ρ = ∞ (or a negligible phase error) gives the plain sinc.
 */
export function quadPhaseIntegral(q: number, w: number, rho: number, k: number): Cx {
  const sPhase = (k * w * w) / (8 * rho); // max phase error in radians (= 2π·s)
  if (!Number.isFinite(rho) || sPhase < 1e-9) {
    const X = (q * w) / 2;
    return { re: Math.abs(X) < 1e-12 ? w : (w * Math.sin(X)) / X, im: 0 };
  }
  const g = Math.sqrt(k / (Math.PI * rho));
  const u0 = (q * rho) / k;
  const t1 = g * (-w / 2 - u0);
  const t2 = g * (w / 2 - u0);
  const f1 = fresnel(t1);
  const f2 = fresnel(t2);
  const dC = f2.c - f1.c;
  const dS = f2.s - f1.s;
  const amp = Math.sqrt((Math.PI * rho) / k);
  const ph = (q * q * rho) / (2 * k);
  // amp·e^{jph}·(dC − j dS)
  const cr = Math.cos(ph);
  const sn = Math.sin(ph);
  return { re: amp * (cr * dC + sn * dS), im: amp * (sn * dC - cr * dS) };
}

/** E-plane aperture integral I₂(k_y): uniform over b₁, phase k y²/(2ρ₁). */
export function iE(ky: number, b1: number, rho1: number, k: number): Cx {
  return quadPhaseIntegral(ky, b1, rho1, k);
}

/** H-plane aperture integral I₁(k_x): cos(πx/a₁) over a₁, phase k x²/(2ρ₂). */
export function iH(kx: number, a1: number, rho2: number, k: number): Cx {
  if (!Number.isFinite(rho2) || (k * a1 * a1) / (8 * rho2) < 1e-9) {
    // ∫ cos(πx/a) e^{j kx x} dx = (πa/2)·cos(X)/((π/2)² − X²), X = kx·a/2
    const X = (kx * a1) / 2;
    const d = (Math.PI / 2) ** 2 - X * X;
    return { re: Math.abs(d) < 1e-9 ? a1 / 2 : ((Math.PI * a1) / 2) * (Math.cos(X) / d), im: 0 };
  }
  const p = quadPhaseIntegral(kx + Math.PI / a1, a1, rho2, k);
  const m = quadPhaseIntegral(kx - Math.PI / a1, a1, rho2, k);
  return { re: 0.5 * (p.re + m.re), im: 0.5 * (p.im + m.im) };
}

const abs2 = (z: Cx) => z.re * z.re + z.im * z.im;

export interface HornGeom {
  a1: number;
  b1: number;
  /** axial apex-to-aperture distances; Infinity for an unflared plane */
  rho1: number;
  rho2: number;
  lambda: number;
}

/** Directivity (linear) from the aperture model. */
export function directivity(g: HornGeom): number {
  const k = (2 * Math.PI) / g.lambda;
  const i1 = abs2(iH(0, g.a1, g.rho2, k));
  const i2 = abs2(iE(0, g.b1, g.rho1, k));
  return ((4 * Math.PI) / (g.lambda * g.lambda)) * ((i1 * i2) / ((g.a1 / 2) * g.b1));
}

/** Normalised E- and H-plane field patterns (linear, 1 on axis) at angle θ from boresight. */
export function patternE(g: HornGeom, th: number): number {
  const k = (2 * Math.PI) / g.lambda;
  const r = Math.sqrt(abs2(iE(k * Math.sin(th), g.b1, g.rho1, k)) / abs2(iE(0, g.b1, g.rho1, k)));
  return ((1 + Math.cos(th)) / 2) * r;
}

export function patternH(g: HornGeom, th: number): number {
  const k = (2 * Math.PI) / g.lambda;
  const r = Math.sqrt(abs2(iH(k * Math.sin(th), g.a1, g.rho2, k)) / abs2(iH(0, g.a1, g.rho2, k)));
  return ((1 + Math.cos(th)) / 2) * r;
}

/**
 * Full beamwidth (rad) at `levelDb` below boresight: twice the first angle where the pattern drops to that
 * level; null if it never does within 90° (very small aperture).
 */
export function beamwidth(pat: (th: number) => number, levelDb: number): number | null {
  const lvl = 10 ** (levelDb / 20);
  const N = 720;
  let prev = 0;
  for (let i = 1; i <= N; i++) {
    const th = (i / N) * (Math.PI / 2);
    if (pat(th) <= lvl) return 2 * brent((x) => pat(x) - lvl, prev, th, 1e-12);
    prev = th;
  }
  return null;
}

/** True when the pattern rises above its boresight value somewhere inside 60° (split / squinted main beam). */
export function beamSplit(pat: (th: number) => number): boolean {
  for (let i = 1; i <= 120; i++) if (pat((i / 120) * (Math.PI / 3)) > 1.0001) return true;
  return false;
}

/** Phase-error parameters s = b₁²/(8λρ₁), t = a₁²/(8λρ₂) (in wavelengths). */
export function phaseErrors(g: HornGeom): { s: number; t: number } {
  return { s: Number.isFinite(g.rho1) ? (g.b1 * g.b1) / (8 * g.lambda * g.rho1) : 0, t: Number.isFinite(g.rho2) ? (g.a1 * g.a1) / (8 * g.lambda * g.rho2) : 0 };
}

/** Axial flare length from the feed to the aperture for one plane: p = ρ·(w₁ − w)/w₁ (Balanis 13-49). */
export function flareLength(w1: number, w: number, rho: number): number {
  return (rho * (w1 - w)) / w1;
}

/** Apex distance of a flare of axial length L from feed width w to aperture width w₁. */
export function apexDistance(w1: number, w: number, L: number): number {
  return w1 > w ? (L * w1) / (w1 - w) : Infinity;
}

/**
 * Geometry of an optimum-flare horn whose controlling aperture dimension is x (a₁ for pyramidal and
 * H-plane sectoral, b₁ for E-plane sectoral): H flare t = 3/8, E flare s = 1/4, equal axial lengths.
 * Returns null if the aperture does not exceed the feed.
 */
export function optimumGeom(type: HornType, x: number, a: number, b: number, lambda: number): (HornGeom & { L: number }) | null {
  if (type === 'e-sectoral') {
    if (!(x > b)) return null;
    const rho1 = (x * x) / (2 * lambda);
    return { a1: a, b1: x, rho1, rho2: Infinity, lambda, L: flareLength(x, b, rho1) };
  }
  if (!(x > a)) return null;
  const rho2 = (x * x) / (3 * lambda);
  const L = flareLength(x, a, rho2);
  if (type === 'h-sectoral') return { a1: x, b1: b, rho1: Infinity, rho2, lambda, L };
  // E plane: (√(2λ)·q − b)·q/√(2λ) = L with q = √ρ₁, b₁ = √(2λρ₁)
  const r = Math.sqrt(2 * lambda);
  const q = (b / r + Math.sqrt((b * b) / (2 * lambda) + 4 * L)) / 2;
  const rho1 = q * q;
  return { a1: x, b1: r * q, rho1, rho2, lambda, L };
}

/** Optimum-gain design for a target directivity (linear): solve the controlling dimension. */
export function designOptimum(type: HornType, d0: number, a: number, b: number, lambda: number, xMax: number): { geom: HornGeom & { L: number }; x: number } | { error: string; dMin: number; dMax: number } {
  const lo = (type === 'e-sectoral' ? b : a) * (1 + 1e-6);
  const g = (x: number) => {
    const geo = optimumGeom(type, x, a, b, lambda);
    return geo ? 10 * Math.log10(directivity(geo)) : NaN;
  };
  const target = 10 * Math.log10(d0);
  const inv = invert(g, target, { lo, hi: xMax, log: true, samples: 200 });
  if (!inv.ok) return { error: 'no solution', dMin: 10 ** (g(lo) / 10), dMax: 10 ** (g(xMax) / 10) };
  const x = inv.roots[0];
  return { geom: optimumGeom(type, x, a, b, lambda)!, x };
}

/** Axial length L that gives a target directivity with the aperture fixed (longest root: smallest phase error). */
export function lengthForDirectivity(type: HornType, d0: number, a1: number, b1: number, a: number, b: number, lambda: number, lMax: number): { L: number } | { error: string; dInf: number; dMin: number } {
  const geomOf = (L: number): HornGeom => ({ a1, b1, rho1: type === 'h-sectoral' ? Infinity : apexDistance(b1, b, L), rho2: type === 'e-sectoral' ? Infinity : apexDistance(a1, a, L), lambda });
  const g = (L: number) => 10 * Math.log10(directivity(geomOf(L)));
  const target = 10 * Math.log10(d0);
  const lo = lambda * 1e-3;
  const inv = invert(g, target, { lo, hi: lMax, log: true, samples: 240 });
  const dInf = directivity({ a1, b1, rho1: Infinity, rho2: Infinity, lambda });
  if (!inv.ok) return { error: 'no solution', dInf, dMin: 10 ** (g(lo) / 10) };
  return { L: inv.roots[inv.roots.length - 1] };
}

/**
 * Balanis’ closed-form optimum-gain pyramidal design (§13.4, eqs. 13-56 … 13-58), assuming an aperture
 * efficiency of 0.51 and ρ₁ ≈ ρe, ρ₂ ≈ ρh. G0 linear. Lengths in metres.
 */
export function balanisDesign(G0: number, lambda: number, a: number, b: number): { chi: number; rhoe: number; rhoh: number; a1: number; b1: number; pe: number; ph: number } | null {
  const al = a / lambda;
  const bl = b / lambda;
  // (√(2χ) − b/λ)²(2χ − 1) = (G0/(2π)·√(3/(2π))/√χ − a/λ)²·(G0²/(6π³)/χ − 1)
  const F = (chi: number) => (Math.sqrt(2 * chi) - bl) ** 2 * (2 * chi - 1) - ((G0 / (2 * Math.PI)) * Math.sqrt(3 / (2 * Math.PI)) / Math.sqrt(chi) - al) ** 2 * ((G0 * G0) / (6 * Math.PI ** 3) / chi - 1);
  const chi1 = G0 / (2 * Math.PI * Math.sqrt(2 * Math.PI));
  // bracket around the trial value
  const lo = chi1 / 4;
  const hi = chi1 * 4;
  const N = 400;
  let root: number | null = null;
  let best = Infinity;
  let prev = F(lo);
  for (let i = 1; i <= N; i++) {
    const x = lo * (hi / lo) ** (i / N);
    const v = F(x);
    if (prev * v <= 0) {
      const xl = lo * (hi / lo) ** ((i - 1) / N);
      const r = brent(F, xl, x, 1e-13);
      if (Math.abs(r - chi1) < best) {
        best = Math.abs(r - chi1);
        root = r;
      }
    }
    prev = v;
  }
  if (root == null) return null;
  const chi = root;
  const rhoe = chi * lambda;
  const rhoh = ((G0 * G0) / (8 * Math.PI ** 3) / chi) * lambda;
  const a1 = (G0 / (2 * Math.PI)) * Math.sqrt(3 / (2 * Math.PI * chi)) * lambda;
  const b1 = Math.sqrt(2 * chi) * lambda;
  const pe = (b1 - b) * Math.sqrt((rhoe / b1) ** 2 - 0.25);
  const ph = (a1 - a) * Math.sqrt((rhoh / a1) ** 2 - 0.25);
  // outside the range of the procedure (target gain too small for the feed) the geometry is not real
  if (![chi, rhoe, rhoh, a1, b1, pe, ph].every((v) => Number.isFinite(v) && v > 0)) return null;
  return { chi, rhoe, rhoh, a1, b1, pe, ph };
}
