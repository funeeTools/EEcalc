/**
 * Heatsink selection — equations only (pure, SI in/out).
 *
 * 1. Required sink-to-ambient resistance from the thermal stack:  θ_SA,req = (T_J,max − T_A)/P − θ_JC − θ_CS.
 *
 * 2. First sizing by volumetric thermal resistance (S. Lee, "How to Select a Heat Sink", Electronics Cooling,
 *    June 1995, table 2): V ≈ R_v / θ_SA with R_v = 500–800 cm³·°C/W in natural convection, 150–250 at
 *    1.0 m/s, 80–150 at 2.5 m/s and 50–80 at 5.0 m/s. Lee stresses this is a first estimate only.
 *
 * 3. Plate-fin heat sink model (vertical rectangular fins on a base W wide, fins L long in the flow
 *    direction, H high, t thick, N fins, gap S = (W − N·t)/(N − 1)):
 *    natural convection — Bar-Cohen & Rohsenow (J. Heat Transfer 106, 1984, 116–123) composite correlation
 *      for symmetric isothermal parallel plates, as in Incropera & DeWitt, Fundamentals of Heat and Mass
 *      Transfer, §9.7.1 (Table 9.3, C₁ = 576, C₂ = 2.87):
 *        Nu_S = [576/(Ra_S·S/L)² + 2.87/(Ra_S·S/L)^½]^(−½),  Ra_S = gβΔT·S³/(να),  h = Nu_S·k/S
 *      optimum gap S_opt = 2.714·(L·να/(gβΔT))^¼ (same reference).
 *    forced convection, ducted — Teertstra, Yovanovich & Culham (J. Electronics Manufacturing 10(4), 2000)
 *      as given by R. E. Simons, "Estimating Parallel Plate-Fin Heat Sink Thermal Resistance", Electronics
 *      Cooling, Feb. 2003, eqs. 7–10:
 *        Re* = (ρ·V_ch·S/μ)·(S/L),  Nu_S = [(Re*·Pr/2)^(−3) + (0.664·√Re*·Pr^⅓·√(1 + 3.65/√Re*))^(−3)]^(−⅓)
 *      with the channel velocity V_ch = V·(S + t)/S from the approach velocity V (all air through the fins).
 *      h is referenced to the inlet air: the correlation already includes the air temperature rise
 *      (Simons), so θ_conv = 1/(η_o·h·A) (Simons eq. 14) with no extra caloric term.
 *    fins — adiabatic-tip-corrected straight fin efficiency η_f = tanh(mL_c)/(mL_c), m = √(2h/(k_f·t)),
 *      L_c = H + t/2; overall surface efficiency η_o = 1 − (A_f/A)(1 − η_f) (Incropera §3.6.5);
 *      natural convection likewise θ_conv = 1/(η_o·h·A).
 *    radiation — from the outer envelope (fin-tip face and the two outside fins), view factor 1 to large
 *      surroundings at T_A: h_r = εσ(T_s² + T_A²)(T_s + T_A) (Incropera eq. 1.9); inter-fin radiation neglected.
 *    base — one-dimensional conduction t_b/(k_f·W·L) when the heat covers the base, or Lee's (1998) maximum
 *      constriction resistance for a centred source of given footprint (see spreading()).
 * Air properties: Incropera Table A.4 (air at 1 atm), linear interpolation at the film temperature,
 * β = 1/T_film (ideal gas).
 */

import { brent } from '@/core/calc/solve';

export const SIGMA = 5.670374419e-8;
export const G0 = 9.80665;
export const KELVIN = 273.15;

/** Incropera & DeWitt Table A.4, air at atmospheric pressure: T (K), ρ (kg/m³), c_p (J/kg·K), μ (N·s/m²), k (W/m·K). */
export const AIR_TABLE: [number, number, number, number, number][] = [
  [200, 1.7458, 1007, 132.5e-7, 18.1e-3],
  [250, 1.3947, 1006, 159.6e-7, 22.3e-3],
  [300, 1.1614, 1007, 184.6e-7, 26.3e-3],
  [350, 0.995, 1009, 208.2e-7, 30.0e-3],
  [400, 0.8711, 1014, 230.1e-7, 33.8e-3],
  [450, 0.774, 1021, 250.7e-7, 37.3e-3],
  [500, 0.6964, 1030, 270.1e-7, 40.7e-3],
];

export interface Air {
  rho: number;
  cp: number;
  mu: number;
  k: number;
  nu: number;
  alpha: number;
  pr: number;
  beta: number;
}

/** Air properties at temperature T (K), linear interpolation in Table A.4 (clamped to 200–500 K). */
export function airAt(T: number): Air {
  const t = Math.min(Math.max(T, AIR_TABLE[0][0]), AIR_TABLE[AIR_TABLE.length - 1][0]);
  let j = 0;
  while (j < AIR_TABLE.length - 2 && t > AIR_TABLE[j + 1][0]) j++;
  const a = AIR_TABLE[j];
  const b = AIR_TABLE[j + 1];
  const f = (t - a[0]) / (b[0] - a[0]);
  const lerp = (i: number) => a[i] + (b[i] - a[i]) * f;
  const rho = lerp(1);
  const cp = lerp(2);
  const mu = lerp(3);
  const k = lerp(4);
  return { rho, cp, mu, k, nu: mu / rho, alpha: k / (rho * cp), pr: (mu * cp) / k, beta: 1 / T };
}

/** Bar-Cohen & Rohsenow composite Nusselt number for symmetric isothermal plates, El = Ra_S·S/L. */
export const nuNatural = (el: number): number => (el > 0 ? 1 / Math.sqrt(576 / (el * el) + 2.87 / Math.sqrt(el)) : 0);

/** Optimum plate gap for natural convection (isothermal plates). */
export const sOptNatural = (L: number, air: Air, dT: number): number => 2.714 * ((L * air.nu * air.alpha) / (G0 * air.beta * dT)) ** 0.25;

/** Teertstra composite Nusselt number for developing laminar flow between plates, Re* = Re_S·S/L. */
export const nuForced = (reStar: number, pr: number): number => {
  if (!(reStar > 0)) return 0;
  const a = (reStar * pr) / 2;
  const b = 0.664 * Math.sqrt(reStar) * pr ** (1 / 3) * Math.sqrt(1 + 3.65 / Math.sqrt(reStar));
  return (a ** -3 + b ** -3) ** (-1 / 3);
};

/** Fin efficiency of a straight rectangular fin with corrected length L_c = H + t/2. */
export const finEfficiency = (h: number, kf: number, t: number, H: number): number => {
  const m = Math.sqrt((2 * h) / (kf * t));
  const x = m * (H + t / 2);
  return x > 1e-9 ? Math.tanh(x) / x : 1;
};

export interface Sink {
  /** base width across the fins, m */
  w: number;
  /** fin length along the flow (vertical height in natural convection), m */
  l: number;
  /** fin height above the base, m */
  h: number;
  /** fin thickness, m */
  t: number;
  /** base thickness, m */
  tb: number;
  /** number of fins (≥ 2) */
  n: number;
  /** fin / base conductivity, W/m·K */
  kf: number;
  /** emissivity (0 = no radiation) */
  eps: number;
  /** heat-source footprint on the base, m² (null = heat spread over the whole base) */
  src?: number | null;
}

export interface Flow {
  mode: 'natural' | 'forced';
  /** approach air velocity, m/s (forced) */
  v: number;
}

export interface SinkResult {
  /** sink-to-ambient resistance, K/W */
  theta: number;
  /** fin gap, m */
  s: number;
  /** convection coefficient, W/m²K */
  hc: number;
  nu: number;
  /** Ra_S·S/L (natural) or Re* (forced) */
  group: number;
  etaF: number;
  etaO: number;
  /** wetted area (fins both sides + exposed base), m² */
  area: number;
  thetaConv: number;
  thetaRad: number;
  thetaBase: number;
  hr: number;
  /** air: channel velocity, flow (m³/s), air temperature rise (K) — forced only */
  vch: number;
  flow: number;
  dTair: number;
  /** channel Reynolds number on the hydraulic diameter (forced) */
  reDh: number;
  sOpt: number;
  volume: number;
  air: Air;
}

/**
 * Maximum constriction (spreading) resistance of a centred source on a heatsink base, S. Lee, "Calculating
 * Spreading Resistance in Heat Sinks", Electronics Cooling, Jan. 1998 (from Lee, Song, Au & Moran 1995), eq. 1:
 *   a = √(A_s/π), b = √(A_p/π), ε = a/b, τ = t/b, Bi = h·b/k with h = 1/(R₀·A_p), λ = π + 1/(√π·ε)
 *   Φ = (tanh(λτ) + λ/Bi)/(1 + (λ/Bi)·tanh(λτ)),  ψ_max = ετ/√π + (1 − ε)·Φ/√π,  R_c = ψ_max/(k·a·√π)
 * R_c includes the one-dimensional conduction t/(k·A_p); the total is R₀ + R_c. Lee quotes about 5 % accuracy
 * for plate aspect ratios up to 2.5. A source as large as the base gives the 1-D term only.
 */
export function spreading(as: number, ap: number, t: number, k: number, r0: number): number {
  if (!(as < ap)) return t / (k * ap);
  const a = Math.sqrt(as / Math.PI);
  const b = Math.sqrt(ap / Math.PI);
  const eps = a / b;
  const tau = t / b;
  const bi = (1 / (r0 * ap)) * (b / k);
  const lam = Math.PI + 1 / (Math.sqrt(Math.PI) * eps);
  const th = Math.tanh(lam * tau);
  const phi = (th + lam / bi) / (1 + (lam / bi) * th);
  const psi = (eps * tau) / Math.sqrt(Math.PI) + ((1 - eps) * phi) / Math.sqrt(Math.PI);
  return psi / (k * a * Math.sqrt(Math.PI));
}

/** Fin gap for N fins on width W. */
export const gapOf = (w: number, n: number, t: number): number => (w - n * t) / (n - 1);

/**
 * Sink-to-ambient resistance at base temperature rise dT (K) over ambient tA (°C).
 * Returns null when the geometry is impossible (gap ≤ 0).
 */
export function sinkTheta(k: Sink, fl: Flow, tA: number, dT: number): SinkResult | null {
  const s = gapOf(k.w, k.n, k.t);
  if (!(s > 0) || !(k.l > 0) || !(k.h > 0) || !(k.t > 0) || k.n < 2) return null;
  const TA = tA + KELVIN;
  const Ts = TA + Math.max(dT, 1e-6);
  const air = airAt((Ts + TA) / 2);
  const aFin = 2 * k.n * k.h * k.l;
  const aBase = (k.n - 1) * s * k.l;
  const area = aFin + aBase;
  let hc: number;
  let nu: number;
  let group: number;
  let vch = 0;
  let flow = 0;
  let reDh = 0;
  if (fl.mode === 'natural') {
    const ra = (G0 * air.beta * Math.max(dT, 1e-6) * s ** 3) / (air.nu * air.alpha);
    group = (ra * s) / k.l;
    nu = nuNatural(group);
    hc = (nu * air.k) / s;
  } else {
    vch = (fl.v * (s + k.t)) / s;
    group = ((air.rho * vch * s) / air.mu) * (s / k.l);
    nu = nuForced(group, air.pr);
    hc = (nu * air.k) / s;
    flow = vch * s * k.h * (k.n - 1);
    const dh = (2 * s * k.h) / (s + k.h);
    reDh = (vch * dh) / air.nu;
  }
  const etaF = finEfficiency(hc, k.kf, k.t, k.h);
  const etaO = 1 - (aFin / area) * (1 - etaF);
  // Simons (2003) eq. 14: R = 1/(h·(A_base + N·η·A_fin)). The Teertstra Nusselt number is referenced to the
  // inlet-air temperature difference and already includes the air heating along the channels, so no
  // separate caloric (ε-NTU) term is added; the air temperature rise is reported for information only.
  const thetaConv = 1 / (etaO * hc * area);
  const aEnv = k.w * k.l + 2 * (k.h + k.tb) * k.l;
  const hr = k.eps > 0 ? k.eps * SIGMA * (Ts * Ts + TA * TA) * (Ts + TA) : 0;
  const thetaRad = hr > 0 ? 1 / (hr * aEnv) : Infinity;
  // R₀ of Lee (1998): the heatsink resistance for heat spread evenly over the base (convection ∥ radiation)
  const par = 1 / (1 / thetaConv + (Number.isFinite(thetaRad) ? 1 / thetaRad : 0));
  // base: 1-D conduction, or Lee's constriction resistance (which contains the 1-D term) for a small source
  const thetaBase = k.src != null && k.src > 0 ? spreading(k.src, k.w * k.l, k.tb, k.kf, par) : k.tb / (k.kf * k.w * k.l);
  let dTair = 0;
  if (fl.mode === 'forced') {
    const qConv = (Math.max(dT, 0) / (thetaBase + par)) * (par / thetaConv);
    dTair = qConv / (air.rho * flow * air.cp);
  }
  return {
    theta: thetaBase + par,
    s,
    hc,
    nu,
    group,
    etaF,
    etaO,
    area,
    thetaConv,
    thetaRad,
    thetaBase,
    hr,
    vch,
    flow,
    dTair,
    reDh,
    sOpt: fl.mode === 'natural' ? sOptNatural(k.l, air, Math.max(dT, 1e-6)) : NaN,
    volume: k.w * k.l * (k.h + k.tb),
    air,
  };
}

/**
 * Self-consistent base temperature rise for power p: root of ΔT = p·θ(ΔT) (θ falls as ΔT rises, so the
 * root is unique). Brent on a bracket that always contains it.
 */
export function riseFor(k: Sink, fl: Flow, tA: number, p: number): { dT: number; r: SinkResult } | null {
  if (!(p > 0)) {
    const r = sinkTheta(k, fl, tA, 1e-6);
    return r ? { dT: 0, r } : null;
  }
  const g = (dT: number) => {
    const r = sinkTheta(k, fl, tA, dT);
    return r ? dT - p * r.theta : NaN;
  };
  const lo = 1e-6;
  let hi = 1;
  if (!Number.isFinite(g(lo))) return null;
  for (let i = 0; i < 80 && g(hi) < 0; i++) hi *= 2;
  if (!(g(hi) >= 0)) return null;
  const dT = g(lo) >= 0 ? lo : brent(g, lo, hi, 1e-12 * hi);
  return { dT, r: sinkTheta(k, fl, tA, dT)! };
}

/** Largest fin count that leaves a gap of at least sMin. */
export const maxFins = (w: number, t: number, sMin = 0.5e-3): number => Math.max(2, Math.floor((w + sMin) / (t + sMin)));

/** Lee (1995) volumetric thermal resistance ranges, cm³·°C/W, converted here to m³·K/W. */
export const VOLUMETRIC: { id: string; label: string; v: number | null; lo: number; hi: number }[] = [
  { id: 'natural', label: 'Natural convection', v: null, lo: 500e-6, hi: 800e-6 },
  { id: 'v1', label: 'Forced air 1.0 m/s', v: 1.0, lo: 150e-6, hi: 250e-6 },
  { id: 'v2.5', label: 'Forced air 2.5 m/s', v: 2.5, lo: 80e-6, hi: 150e-6 },
  { id: 'v5', label: 'Forced air 5.0 m/s', v: 5.0, lo: 50e-6, hi: 80e-6 },
];

/** Required sink-to-ambient resistance from the stack. */
export const thetaSaRequired = (tjMax: number, tA: number, p: number, thetaJC: number, thetaCS: number): number => (tjMax - tA) / p - thetaJC - thetaCS;
