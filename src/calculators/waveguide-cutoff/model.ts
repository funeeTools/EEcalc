/**
 * Rectangular metal waveguide — pure model (no DOM), SI in/out.
 *
 * Mode cutoffs, propagation constant, guide wavelength, phase / group velocity and wave impedance of
 * TE_mn and TM_mn modes in a guide of inner width a and height b, filled with a lossless-looking
 * dielectric εr (μr = 1):
 *   D. M. Pozar, Microwave Engineering, 4th ed., Wiley, 2012, §3.3 (eqs. 3.84, 3.86–3.88, 3.105–3.111)
 *   and §3.1 (Z_TE = kη/β, Z_TM = βη/k; dielectric loss α_d = k² tan δ / 2β, eq. 3.29).
 * Conductor loss by the perturbation (power-loss) method of Pozar §2.7 / §3.3: α_c = P_ℓ / 2P with the
 *   unperturbed TE / TM fields of Pozar Table 3.2 integrated in closed form over the four walls. For TE₁₀
 *   this is exactly Pozar eq. 3.96; for TM_mn it equals the classic
 *   α_c = 2R_s(m²b³ + n²a³)/(η b a(m²b² + n²a²)·√(1−(f_c/f)²)) (Ramo, Whinnery & Van Duzer, Fields and
 *   Waves in Communication Electronics, 3rd ed., §8.4).
 * Surface resistance R_s = √(ωμ₀/2σ) (Pozar eq. 1.131); smooth walls.
 * Power capacity of TE₁₀: P = ab·E₀²/(4·Z_TE) from Pozar §3.3 (P₁₀ and E₀ = ωμaA₁₀/π).
 * Standard sizes: EIA RS-261-B / IEC 60153-2 inner dimensions and recommended bands (also Pozar Appendix I).
 */

export const C0 = 299_792_458;
export const MU0 = 1.25663706212e-6;
export const ETA0 = MU0 * C0;
export const NP_TO_DB = 20 / Math.LN10; // 8.686 dB per neper

export type ModeType = 'TE' | 'TM';

/** Wall metals: conductivity at room temperature (Pozar, Appendix F). */
export const METALS: Record<string, number | null> = {
  Custom: null,
  Silver: 6.173e7,
  Copper: 5.813e7,
  Gold: 4.098e7,
  Aluminium: 3.816e7,
  Brass: 2.564e7,
};

/** Fillings: εr and tan δ near 10 GHz (Pozar, Appendix G). */
export const FILLINGS: Record<string, { er: number; tanD: number } | null> = {
  Custom: null,
  Air: { er: 1, tanD: 0 },
  'PTFE (Teflon)': { er: 2.08, tanD: 0.0004 },
  Polyethylene: { er: 2.25, tanD: 0.0004 },
  Polystyrene: { er: 2.54, tanD: 0.00033 },
};

/** Standard rectangular waveguides: inner a × b (inches) and the recommended TE₁₀ band (GHz). */
export const WR_SIZES: Record<string, { a: number; b: number; lo: number; hi: number; band?: string } | null> = {
  Custom: null,
  'WR-650': { a: 6.5, b: 3.25, lo: 1.12, hi: 1.7, band: 'L' },
  'WR-430': { a: 4.3, b: 2.15, lo: 1.7, hi: 2.6 },
  'WR-340': { a: 3.4, b: 1.7, lo: 2.2, hi: 3.3 },
  'WR-284': { a: 2.84, b: 1.34, lo: 2.6, hi: 3.95, band: 'S' },
  'WR-229': { a: 2.29, b: 1.145, lo: 3.3, hi: 4.9 },
  'WR-187': { a: 1.872, b: 0.872, lo: 3.95, hi: 5.85, band: 'C' },
  'WR-159': { a: 1.59, b: 0.795, lo: 4.9, hi: 7.05 },
  'WR-137': { a: 1.372, b: 0.622, lo: 5.85, hi: 8.2 },
  'WR-112': { a: 1.122, b: 0.497, lo: 7.05, hi: 10 },
  'WR-90': { a: 0.9, b: 0.4, lo: 8.2, hi: 12.4, band: 'X' },
  'WR-75': { a: 0.75, b: 0.375, lo: 10, hi: 15 },
  'WR-62': { a: 0.622, b: 0.311, lo: 12.4, hi: 18, band: 'Ku' },
  'WR-51': { a: 0.51, b: 0.255, lo: 15, hi: 22 },
  'WR-42': { a: 0.42, b: 0.17, lo: 18, hi: 26.5, band: 'K' },
  'WR-34': { a: 0.34, b: 0.17, lo: 22, hi: 33 },
  'WR-28': { a: 0.28, b: 0.14, lo: 26.5, hi: 40, band: 'Ka' },
  'WR-22': { a: 0.224, b: 0.112, lo: 33, hi: 50, band: 'Q' },
  'WR-19': { a: 0.188, b: 0.094, lo: 40, hi: 60, band: 'U' },
  'WR-15': { a: 0.148, b: 0.074, lo: 50, hi: 75, band: 'V' },
  'WR-12': { a: 0.122, b: 0.061, lo: 60, hi: 90, band: 'E' },
  'WR-10': { a: 0.1, b: 0.05, lo: 75, hi: 110, band: 'W' },
};

/** Surface resistance of a smooth good conductor (μr = 1). */
export function surfaceResistance(f: number, sigma: number): number {
  return Math.sqrt((Math.PI * f * MU0) / sigma);
}

/** Skin depth δs = 1/√(πfμ₀σ). */
export function skinDepth(f: number, sigma: number): number {
  return 1 / Math.sqrt(Math.PI * f * MU0 * sigma);
}

/** Cutoff frequency of mode (m, n) in an a × b guide filled with εr (TE and TM share it). */
export function rectCutoff(a: number, b: number, m: number, n: number, er: number): number {
  return (C0 / (2 * Math.sqrt(er))) * Math.hypot(m / a, n / b);
}

export function validMode(type: ModeType, m: number, n: number): boolean {
  if (!Number.isInteger(m) || !Number.isInteger(n) || m < 0 || n < 0) return false;
  return type === 'TE' ? m + n > 0 : m >= 1 && n >= 1;
}

/** Propagation of one mode at f, given its cutoff (any guide shape; μr = 1). */
export interface ModeWave {
  fc: number;
  /** k = ω√εr/c */
  k: number;
  kc: number;
  propagating: boolean;
  /** phase constant, rad/m (null below cutoff) */
  beta: number | null;
  /** evanescent attenuation, Np/m (null above cutoff) */
  alphaEv: number | null;
  /** guide wavelength (null below cutoff) */
  lg: number | null;
  vp: number | null;
  vg: number | null;
  /** wave impedance (real above cutoff); below cutoff the reactance in zwIm (null exactly at cutoff, where Z_TE → ∞) */
  zw: number | null;
  zwIm: number | null;
  /** intrinsic impedance of the filling */
  eta: number;
}

export function modeWave(type: ModeType, fc: number, f: number, er: number): ModeWave {
  const k = (2 * Math.PI * f * Math.sqrt(er)) / C0;
  const kc = (2 * Math.PI * fc * Math.sqrt(er)) / C0;
  const eta = ETA0 / Math.sqrt(er);
  const v = C0 / Math.sqrt(er);
  const w = 2 * Math.PI * f;
  const beta = f > fc ? Math.sqrt((k - kc) * (k + kc)) : 0;
  // β must be > 0 to propagate (f a hair above fc can round to k = kc)
  if (beta > 0) {
    return { fc, k, kc, propagating: true, beta, alphaEv: null, lg: (2 * Math.PI) / beta, vp: w / beta, vg: (v * v * beta) / w, zw: type === 'TE' ? (k * eta) / beta : (beta * eta) / k, zwIm: null, eta };
  }
  const alpha = Math.sqrt(Math.max(0, (kc - k) * (kc + k)));
  // below cutoff: Z_TE = jkη/α (inductive), Z_TM = −jαη/k (capacitive)
  return { fc, k, kc, propagating: false, beta: null, alphaEv: alpha, lg: null, vp: null, vg: null, zw: null, zwIm: alpha > 0 ? (type === 'TE' ? (k * eta) / alpha : (-alpha * eta) / k) : null, eta };
}

/** Wave of mode (m, n) in a rectangular guide. */
export function rectWave(type: ModeType, a: number, b: number, m: number, n: number, er: number, f: number): ModeWave {
  return modeWave(type, rectCutoff(a, b, m, n, er), f, er);
}

/**
 * Conductor attenuation α_c (Np/m) of TE_mn / TM_mn by the perturbation method, closed form.
 * Valid above cutoff with R_s ≪ η and not within a few percent of f_c (where the method breaks down).
 */
export function rectAlphaC(type: ModeType, a: number, b: number, m: number, n: number, er: number, f: number, sigma: number): number | null {
  const wv = rectWave(type, a, b, m, n, er, f);
  if (!wv.propagating || wv.beta == null || wv.zw == null) return null;
  const kx = (m * Math.PI) / a;
  const ky = (n * Math.PI) / b;
  const kc2 = kx * kx + ky * ky;
  // ∫₀ᴸ cos²(kξ)dξ and ∫₀ᴸ sin²(kξ)dξ for k = pπ/L
  const Ic = (kk: number, L: number) => (kk === 0 ? L : L / 2);
  const Is = (kk: number, L: number) => (kk === 0 ? 0 : L / 2);
  const rs = surfaceResistance(f, sigma);
  const beta = wv.beta;
  let wallSum: number; // Σ over the four walls of ∫|H_tan|² dl  (field amplitude 1)
  let flux: number; // ∫∫|H_t|² dS
  if (type === 'TE') {
    // H_z = cos(kx x)cos(ky y), H_x ∝ (β kx/kc²) sin·cos, H_y ∝ (β ky/kc²) cos·sin
    const g = beta / kc2;
    wallSum = 2 * (Ic(ky, b) + g * g * ky * ky * Is(ky, b)) + 2 * (Ic(kx, a) + g * g * kx * kx * Is(kx, a));
    flux = g * g * (kx * kx * Is(kx, a) * Ic(ky, b) + ky * ky * Ic(kx, a) * Is(ky, b));
  } else {
    // E_z = sin(kx x)sin(ky y); H_x ∝ (ky/kc²) sin·cos, H_y ∝ (kx/kc²) cos·sin  (common factor ωε dropped)
    const g = 1 / kc2;
    wallSum = 2 * g * g * (kx * kx * Is(ky, b) + ky * ky * Is(kx, a));
    flux = g * g * (ky * ky * Is(kx, a) * Ic(ky, b) + kx * kx * Ic(kx, a) * Is(ky, b));
  }
  const pLoss = (rs / 2) * wallSum;
  const p = (wv.zw / 2) * flux;
  return pLoss / (2 * p);
}

/** Pozar eq. 3.96: TE₁₀ conductor attenuation, Np/m (kept for cross-checks). */
export function alphaCTE10(a: number, b: number, er: number, f: number, sigma: number): number | null {
  const wv = rectWave('TE', a, b, 1, 0, er, f);
  if (!wv.propagating || wv.beta == null) return null;
  const k = wv.k;
  const rs = surfaceResistance(f, sigma);
  return (rs * (2 * b * Math.PI ** 2 + a ** 3 * k * k)) / (a ** 3 * b * wv.beta * k * wv.eta);
}

/** Dielectric attenuation α_d = k² tan δ / (2β), Np/m (Pozar eq. 3.29; any mode above cutoff, small tan δ). */
export function alphaD(wv: ModeWave, tanD: number): number | null {
  if (!wv.propagating || wv.beta == null) return null;
  return (wv.k * wv.k * tanD) / (2 * wv.beta);
}

/** TE₁₀ power at which the peak field reaches E_bd (matched guide): P = ab·E²/(4 Z_TE). */
export function powerCapacityTE10(a: number, b: number, er: number, f: number, eBd: number): number | null {
  const wv = rectWave('TE', a, b, 1, 0, er, f);
  if (!wv.propagating || wv.zw == null) return null;
  return (a * b * eBd * eBd) / (4 * wv.zw);
}

export interface RectMode {
  type: ModeType;
  m: number;
  n: number;
  fc: number;
}

/** All TE / TM modes with m, n ≤ maxIdx sorted by cutoff. */
export function rectModes(a: number, b: number, er: number, maxIdx = 10): RectMode[] {
  const out: RectMode[] = [];
  for (let m = 0; m <= maxIdx; m++)
    for (let n = 0; n <= maxIdx; n++) {
      if (validMode('TE', m, n)) out.push({ type: 'TE', m, n, fc: rectCutoff(a, b, m, n, er) });
      if (validMode('TM', m, n)) out.push({ type: 'TM', m, n, fc: rectCutoff(a, b, m, n, er) });
    }
  // ties: TE before TM, then the mode varying along the broad wall a first (TE₁₀ before TE₀₁ in a square guide)
  out.sort((x, y) => x.fc - y.fc || (x.type === y.type ? x.n - y.n : x.type === 'TE' ? -1 : 1));
  return out;
}

/** Width a that puts mode (m, n) at cutoff f_c (b fixed); null if impossible (m = 0 or f_c too low). */
export function widthForCutoff(fc: number, b: number, m: number, n: number, er: number): number | null {
  if (m === 0) return null;
  const q = ((2 * fc * Math.sqrt(er)) / C0) ** 2 - (n / b) ** 2; // (m/a)²
  return q > 0 ? m / Math.sqrt(q) : null;
}

/** Frequency at which a mode with cutoff f_c has guide wavelength λg: f = √(f_c² + (v/λg)²). */
export function freqForGuideWavelength(fc: number, lg: number, er: number): number {
  const v = C0 / Math.sqrt(er);
  return Math.hypot(fc, v / lg);
}

/** Cutoff a mode needs so that λg is reached at f: f_c = √(f² − (v/λg)²); null if λg ≤ λ (impossible). */
export function cutoffForGuideWavelength(f: number, lg: number, er: number): number | null {
  const v = C0 / Math.sqrt(er);
  const q = f * f - (v / lg) ** 2;
  return q > 0 ? Math.sqrt(q) : null;
}

/** Transverse E-field (unnormalised) of a mode at (x, y), for sketches. */
export function rectEField(type: ModeType, a: number, b: number, m: number, n: number, x: number, y: number): [number, number] {
  const kx = (m * Math.PI) / a;
  const ky = (n * Math.PI) / b;
  if (type === 'TE') return [ky * Math.cos(kx * x) * Math.sin(ky * y), -kx * Math.sin(kx * x) * Math.cos(ky * y)];
  return [kx * Math.cos(kx * x) * Math.sin(ky * y), ky * Math.sin(kx * x) * Math.cos(ky * y)];
}
