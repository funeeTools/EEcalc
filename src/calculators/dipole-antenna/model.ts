/**
 * Thin-wire centre-fed dipole — pure model (no DOM), SI in/out.
 *
 * Current: the classic sinusoidal standing wave I(z) = I_m·sin[k(l/2 − |z|)] on a wire of total length l.
 * Radiation resistance (referred to the current maximum), directivity and pattern:
 *   C. A. Balanis, Antenna Theory: Analysis and Design, 3rd/4th ed., Wiley, §4.5 (finite-length dipole)
 *   and §4.6 (half-wave dipole).
 * Reactance: the induced-EMF self-reactance of the same sinusoidal current on a wire of radius a,
 *   P. S. Carter, "Circuit relations in radiating systems and applications to antenna problems",
 *   Proc. IRE 20(6), 1932; in the form given by Balanis §8.5 (self-impedance, induced-EMF method).
 * Input quantities are transferred to the feed with R_in = R_m / sin²(kl/2) (Balanis §4.5, lossless).
 * Sine and cosine integrals: series for x ≤ 4, continued fraction for E₁(ix) above (Abramowitz & Stegun
 *   §5.2; Press et al., Numerical Recipes, §6.9 "cisi"), accurate to ~1e-15.
 */

export const C0 = 299_792_458;
export const MU0 = 1.25663706212e-6;
export const ETA0 = MU0 * C0; // 376.730… Ω
const EULER = 0.5772156649015329;

/** Sine and cosine integrals Si(x), Ci(x) for x > 0. */
export function cisi(x: number): { si: number; ci: number } {
  const t = Math.abs(x);
  if (t === 0) return { si: 0, ci: -Infinity };
  if (t <= 4) {
    // Si = Σ (−1)ⁿ x^(2n+1) / ((2n+1)(2n+1)!),  Ci = γ + ln x + Σ_{n≥1} (−1)ⁿ x^(2n) / ((2n)(2n)!)
    let si = 0;
    let ci = 0;
    let term = t; // x^(2n+1)/(2n+1)!
    for (let n = 0; n < 40; n++) {
      si += term / (2 * n + 1) * (n % 2 ? -1 : 1);
      const termC = (term * t) / (2 * n + 2); // x^(2n+2)/(2n+2)!
      ci += (termC / (2 * n + 2)) * (n % 2 ? 1 : -1);
      term = (termC * t) / (2 * n + 3);
      if (term < 1e-18 * Math.abs(si)) break;
    }
    return { si: x < 0 ? -si : si, ci: EULER + Math.log(t) + ci };
  }
  // Modified Lentz on the continued fraction of E₁(i t) (Numerical Recipes cisi).
  const FPMIN = 1e-300;
  let bRe = 1;
  const bIm = t;
  let cRe = 1 / FPMIN;
  let cIm = 0;
  // d = h = 1/b
  let den = bRe * bRe + bIm * bIm;
  let dRe = bRe / den;
  let dIm = -bIm / den;
  let hRe = dRe;
  let hIm = dIm;
  for (let i = 2; i <= 200; i++) {
    const a = -(i - 1) * (i - 1);
    bRe += 2;
    // d = 1/(a·d + b)
    const xRe = a * dRe + bRe;
    const xIm = a * dIm + bIm;
    den = xRe * xRe + xIm * xIm;
    dRe = xRe / den;
    dIm = -xIm / den;
    // c = b + a/c
    den = cRe * cRe + cIm * cIm;
    cRe = bRe + (a * cRe) / den;
    cIm = bIm - (a * cIm) / den;
    // del = c·d ; h = h·del
    const delRe = cRe * dRe - cIm * dIm;
    const delIm = cRe * dIm + cIm * dRe;
    const nhRe = hRe * delRe - hIm * delIm;
    hIm = hRe * delIm + hIm * delRe;
    hRe = nhRe;
    if (Math.abs(delRe - 1) + Math.abs(delIm) < 1e-16) break;
  }
  // h ← (cos t − i sin t)·h
  const cs = Math.cos(t);
  const sn = Math.sin(t);
  const rRe = cs * hRe + sn * hIm;
  const rIm = cs * hIm - sn * hRe;
  const si = Math.PI / 2 + rIm;
  return { si: x < 0 ? -si : si, ci: -rRe };
}

export const Si = (x: number) => cisi(x).si;
export const Ci = (x: number) => cisi(x).ci;

/** Radiation pattern function F(θ) = [(cos(kl/2·cosθ) − cos(kl/2)) / sinθ]² (Balanis §4.5). */
export function patternF(kl: number, theta: number): number {
  const s = Math.sin(theta);
  if (Math.abs(s) < 1e-9) return 0;
  const v = (Math.cos((kl / 2) * Math.cos(theta)) - Math.cos(kl / 2)) / s;
  return v * v;
}

/**
 * Q(kl) = C + ln(kl) − Ci(kl) + ½ sin(kl)[Si(2kl) − 2Si(kl)] + ½ cos(kl)[C + ln(kl/2) + Ci(2kl) − 2Ci(kl)],
 * so that P_rad = η|I_m|²Q/(4π) and R_m = ηQ/(2π) (Balanis §4.5).
 */
export function qIntegral(kl: number): number {
  const a = cisi(kl);
  const b = cisi(2 * kl);
  return (
    EULER + Math.log(kl) - a.ci + 0.5 * Math.sin(kl) * (b.si - 2 * a.si) + 0.5 * Math.cos(kl) * (EULER + Math.log(kl / 2) + b.ci - 2 * a.ci)
  );
}

/** Radiation resistance referred to the current maximum (Ω). */
export function radiationResistance(kl: number): number {
  // Q ∝ (kl)⁴ for short wires and the closed form cancels; with Si/Ci good to ~1e-15 absolute the result
  // stays accurate to ~1e-8 relative down to l/λ ≈ 0.005, the lower limit the calculator accepts.
  return (ETA0 / (2 * Math.PI)) * qIntegral(kl);
}

/**
 * Induced-EMF reactance referred to the current maximum (Ω), wire radius a:
 * X_m = η/(4π)·{2Si(kl) + cos(kl)[2Si(kl) − Si(2kl)] − sin(kl)[2Ci(kl) − Ci(2kl) − Ci(2ka²/l)]}.
 */
export function reactanceMax(kl: number, ka: number): number {
  const a = cisi(kl);
  const b = cisi(2 * kl);
  const cSmall = Ci((2 * ka * ka) / kl);
  return (ETA0 / (4 * Math.PI)) * (2 * a.si + Math.cos(kl) * (2 * a.si - b.si) - Math.sin(kl) * (2 * a.ci - b.ci - cSmall));
}

/** Peak of F(θ) and the angle where it occurs (θ in 0…π/2; the pattern is symmetric about 90°). */
export function patternMax(kl: number, n = 720): { fMax: number; thetaMax: number } {
  let best = 0;
  let thBest = Math.PI / 2;
  for (let i = 1; i <= n; i++) {
    const th = (i / n) * (Math.PI / 2);
    const v = patternF(kl, th);
    if (v > best) {
      best = v;
      thBest = th;
    }
  }
  // Golden-section polish around the best grid point
  let lo = Math.max(thBest - Math.PI / (2 * n), 1e-6);
  let hi = Math.min(thBest + Math.PI / (2 * n), Math.PI / 2);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 60; it++) {
    const m1 = hi - g * (hi - lo);
    const m2 = lo + g * (hi - lo);
    if (patternF(kl, m1) > patternF(kl, m2)) hi = m2;
    else lo = m1;
  }
  const th = (lo + hi) / 2;
  const v = patternF(kl, th);
  return v >= best ? { fMax: v, thetaMax: th } : { fMax: best, thetaMax: thBest };
}

/** Half-power beamwidth (rad) of a broadside main lobe, or null if the maximum is not at θ = 90°. */
export function hpbw(kl: number, fMax: number, thetaMax: number): number | null {
  if (Math.abs(thetaMax - Math.PI / 2) > 1e-3) return null;
  const f = (th: number) => patternF(kl, th) / fMax - 0.5;
  // walk down from 90° until the pattern drops below half power
  let hi = Math.PI / 2;
  let lo = hi;
  const step = Math.PI / 720;
  while (lo > step && f(lo) > 0) lo -= step;
  if (f(lo) > 0) return null;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (f(m) > 0) hi = m;
    else lo = m;
  }
  return 2 * (Math.PI / 2 - (lo + hi) / 2);
}

export interface DipoleInputs {
  /** total length (m) */
  len: number;
  /** frequency (Hz) */
  f: number;
  /** wire diameter (m) */
  d: number;
  /** conductivity (S/m) */
  sigma: number;
}

export interface DipoleResult {
  lambda: number;
  k: number;
  kl: number;
  lOverLambda: number;
  /** radiation resistance at the current maximum */
  rm: number;
  /** induced-EMF reactance at the current maximum */
  xm: number;
  /** sin²(kl/2): transfer factor from the current maximum to the feed */
  feedFactor: number;
  rin: number;
  xin: number;
  /** ohmic loss resistance referred to the current maximum, and to the feed */
  rLossM: number;
  rLossIn: number;
  efficiency: number;
  directivity: number;
  fMax: number;
  thetaMax: number;
  q: number;
  skinDepth: number;
  rs: number;
}

/** Feed impedance (lossless radiation part + induced-EMF reactance) of a dipole at one frequency. */
export function feedImpedance(len: number, f: number, d: number): { rin: number; xin: number; rm: number; xm: number; feedFactor: number; kl: number } {
  const k = (2 * Math.PI * f) / C0;
  const kl = k * len;
  const rm = radiationResistance(kl);
  const xm = reactanceMax(kl, (k * d) / 2);
  const s = Math.sin(kl / 2);
  const feedFactor = s * s;
  return { rin: rm / feedFactor, xin: xm / feedFactor, rm, xm, feedFactor, kl };
}

/** Ohmic loss of the sinusoidal current on a round wire (skin effect), referred to the current maximum. */
export function lossResistanceMax(kl: number, len: number, d: number, rs: number): number {
  // R = Rs/(2πa)·∫ sin²(k(l/2 − |z|)) dz = Rs·l/(4πa)·(1 − sin(kl)/(kl))  (Balanis §2.14 for l = λ/2)
  return ((rs * len) / (2 * Math.PI * d)) * (1 - Math.sin(kl) / kl);
}

export function calcDipole(i: DipoleInputs): DipoleResult {
  const lambda = C0 / i.f;
  const k = (2 * Math.PI) / lambda;
  const fi = feedImpedance(i.len, i.f, i.d);
  const q = qIntegral(fi.kl);
  const { fMax, thetaMax } = patternMax(fi.kl);
  const omega = 2 * Math.PI * i.f;
  const rs = Math.sqrt((omega * MU0) / (2 * i.sigma));
  const skinDepth = Math.sqrt(2 / (omega * MU0 * i.sigma));
  const rLossM = lossResistanceMax(fi.kl, i.len, i.d, rs);
  return {
    lambda,
    k,
    kl: fi.kl,
    lOverLambda: i.len / lambda,
    rm: fi.rm,
    xm: fi.xm,
    feedFactor: fi.feedFactor,
    rin: fi.rin,
    xin: fi.xin,
    rLossM,
    rLossIn: rLossM / fi.feedFactor,
    efficiency: fi.rm / (fi.rm + rLossM),
    directivity: (2 * fMax) / q,
    fMax,
    thetaMax,
    q,
    skinDepth,
    rs,
  };
}
