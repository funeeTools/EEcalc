/**
 * Microstrip line — pure model (no DOM).
 *
 * Static Z₀ and εeff: Hammerstad & Jensen, "Accurate Models for Microstrip Computer-Aided Design",
 * IEEE MTT-S Digest 1980, pp. 407–409, including their strip-thickness correction.
 * Dispersion of εeff: Kirschning & Jansen, Electronics Letters 18(6), 1982, pp. 272–273.
 * Dielectric loss: Pozar, Microwave Engineering 4e, eq. 3.198 (exact for the quasi-TEM filling factor).
 * Conductor loss: Wheeler's incremental-inductance rule applied to the same H&J equations
 * (αc = Rs/(2η₀Z₀)·∂Z₀,air/∂n, all conductor walls receding by n), times the Hammerstad roughness factor.
 */

export const C0 = 299_792_458;
export const MU0 = 1.25663706212e-6;
export const ETA0 = MU0 * C0; // 376.730… Ω

/** f(u) in the H&J air impedance */
function fU(u: number): number {
  return 6 + (2 * Math.PI - 6) * Math.exp(-((30.666 / u) ** 0.7528));
}

/** Characteristic impedance of a zero-thickness strip in air (H&J eq. 1). */
export function z0Air(u: number): number {
  return (ETA0 / (2 * Math.PI)) * Math.log(fU(u) / u + Math.sqrt(1 + (2 / u) ** 2));
}

/** Static effective permittivity, zero-thickness strip (H&J eqs. 3–5). */
export function epsEffHJ(u: number, er: number): number {
  const a = 1 + Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49 + Math.log(1 + (u / 18.1) ** 3) / 18.7;
  const b = 0.564 * ((er - 0.9) / (er + 3)) ** 0.053;
  return (er + 1) / 2 + ((er - 1) / 2) * (1 + 10 / u) ** (-a * b);
}

export interface StaticResult {
  z0: number;
  epsEff: number;
  u: number;
  u1: number;
  ur: number;
  du1: number;
  dur: number;
  z0AirU1: number;
  z0AirUr: number;
  epsEffUr: number;
}

/** Static Z₀ and εeff with H&J's thickness correction (t = 0 → no correction). */
export function microstripStatic(w: number, h: number, t: number, er: number): StaticResult {
  const u = w / h;
  const tn = t / h;
  let du1 = 0;
  let dur = 0;
  if (tn > 0) {
    const coth = 1 / Math.tanh(Math.sqrt(6.517 * u));
    du1 = (tn / Math.PI) * Math.log(1 + (4 * Math.E) / (tn * coth * coth));
    dur = 0.5 * (1 + 1 / Math.cosh(Math.sqrt(er - 1))) * du1;
  }
  const u1 = u + du1;
  const ur = u + dur;
  const z0AirUr = z0Air(ur);
  const z0AirU1 = z0Air(u1);
  const epsEffUr = epsEffHJ(ur, er);
  const z0 = z0AirUr / Math.sqrt(epsEffUr);
  const epsEff = epsEffUr * (z0AirU1 / z0AirUr) ** 2;
  return { z0, epsEff, u, u1, ur, du1, dur, z0AirU1, z0AirUr, epsEffUr };
}

/** Kirschning–Jansen dispersive εeff(f). f in Hz, h in m, u = W/h. */
export function epsEffKJ(epsEff0: number, er: number, u: number, h: number, f: number): number {
  const fn = (f / 1e9) * (h * 1e3); // GHz·mm
  const p1 = 0.27488 + (0.6315 + 0.525 / (1 + 0.0157 * fn) ** 20) * u - 0.065683 * Math.exp(-8.7513 * u);
  const p2 = 0.33622 * (1 - Math.exp(-0.03442 * er));
  const p3 = 0.0363 * Math.exp(-4.6 * u) * (1 - Math.exp(-((fn / 38.7) ** 4.97)));
  const p4 = 1 + 2.751 * (1 - Math.exp(-((er / 15.916) ** 8)));
  const p = p1 * p2 * ((0.1844 + p3 * p4) * fn) ** 1.5763;
  return er - (er - epsEff0) / (1 + p);
}

export interface MicrostripInputs {
  w: number;
  h: number;
  t: number;
  er: number;
  f: number;
  tanD: number;
  sigma: number;
  /** RMS surface roughness (m) */
  rough: number;
  /** Line length for electrical length / total loss (m) */
  len: number;
}

export interface MicrostripOutputs extends StaticResult {
  epsEffF: number;
  vp: number;
  /** Delay per metre (s/m) */
  delay: number;
  lambda0: number;
  lambdaG: number;
  lPer: number;
  cPer: number;
  skinDepth: number;
  rs: number;
  roughFactor: number;
  /** Np/m */
  alphaD: number;
  alphaC: number;
  /** dB over `len` */
  lossDb: number;
  elecLenDeg: number;
  lineDelay: number;
}

export const NP_TO_DB = 20 / Math.LN10; // 8.686

/**
 * Dielectric loss (Np/m), Pozar eq. 3.198 (first-order filling-factor form). `fill` overrides the filling
 * factor q = (εeff − 1)/(εr − 1), which is 0/0 at εr = 1.
 */
export function dielectricLoss(er: number, epsEff: number, tanD: number, f: number, fill?: number): number {
  if (tanD <= 0) return 0;
  const k0 = (2 * Math.PI * f) / C0;
  if (fill != null) return (k0 * er * fill * tanD) / (2 * Math.sqrt(epsEff));
  if (er <= 1) return 0;
  return (k0 * er * (epsEff - 1) * tanD) / (2 * Math.sqrt(epsEff) * (er - 1));
}

/**
 * Conductor loss (Np/m) by Wheeler's incremental-inductance rule: the strip's width and thickness shrink
 * by 2n and the strip-to-ground spacing grows by 2n as every metal wall recedes by n, and
 * αc = Rs/(2η₀Z₀)·∂Z₀,air/∂n (Wheeler 1942; Wadell §3.5). For a parallel-plate line it reduces to Rs/(Z₀W).
 */
export function conductorLoss(z0: number, w: number, h: number, t: number, f: number, sigma: number, rough: number): { alpha: number; rs: number; delta: number; k: number } {
  const delta = 1 / Math.sqrt(Math.PI * f * MU0 * sigma);
  const rs = Math.sqrt((Math.PI * f * MU0) / sigma);
  const k = 1 + (2 / Math.PI) * Math.atan(1.4 * (rough / delta) ** 2);
  // Undefined for a zero-thickness strip (the edge current diverges); the step stays below T/10 so the
  // thickness is never clamped, where H&J's t·ln(1/t) correction would make the derivative step-dependent.
  if (!(t > 0)) return { alpha: NaN, rs, delta, k };
  const dn = Math.min(1e-5 * Math.min(w, h), t / 10);
  const zAir = (n: number) => microstripStatic(w - 2 * n, h + 2 * n, t - 2 * n, 1).z0;
  const dZdn = (zAir(dn) - zAir(-dn)) / (2 * dn);
  return { alpha: ((rs * k) / (2 * ETA0 * z0)) * dZdn, rs, delta, k };
}

/** Filling factor override near εr = 1, where (εeff − 1)/(εr − 1) is 0/0: use ∂εeff/∂εr (central difference). */
export function fillingFactor(w: number, h: number, t: number, er: number): number | undefined {
  if (er - 1 >= 1e-6) return undefined;
  const d = 1e-4;
  return (microstripStatic(w, h, t, 1 + 2 * d).epsEff - microstripStatic(w, h, t, 1).epsEff) / (2 * d);
}

export function calcMicrostrip(i: MicrostripInputs): MicrostripOutputs {
  const s = microstripStatic(i.w, i.h, i.t, i.er);
  const epsEffF = epsEffKJ(s.epsEff, i.er, s.u, i.h, i.f);
  const vp = C0 / Math.sqrt(epsEffF);
  const lambda0 = C0 / i.f;
  const lambdaG = vp / i.f;
  const cond = conductorLoss(s.z0, i.w, i.h, i.t, i.f, i.sigma, i.rough);
  // Near εr = 1 take the filling factor as ∂εeff/∂εr instead of the 0/0 ratio.
  const fill = fillingFactor(i.w, i.h, i.t, i.er);
  const alphaD = dielectricLoss(i.er, epsEffF, i.tanD, i.f, fill);
  return {
    ...s,
    epsEffF,
    vp,
    delay: 1 / vp,
    lambda0,
    lambdaG,
    lPer: (s.z0 * Math.sqrt(s.epsEff)) / C0,
    cPer: Math.sqrt(s.epsEff) / (s.z0 * C0),
    skinDepth: cond.delta,
    rs: cond.rs,
    roughFactor: cond.k,
    alphaD,
    alphaC: cond.alpha,
    lossDb: (alphaD + (Number.isFinite(cond.alpha) ? cond.alpha : 0)) * NP_TO_DB * i.len,
    elecLenDeg: (360 * i.len) / lambdaG,
    lineDelay: i.len / vp,
  };
}
