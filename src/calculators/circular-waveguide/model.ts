/**
 * Circular metal waveguide — pure model (no DOM), SI in/out.
 *
 * Cutoffs of TE_nm and TM_nm in a pipe of inner radius a filled with εr (μr = 1):
 *   f_c = p·c / (2π a √εr), with p = p′_nm (m-th zero of J_n′, TE) or p_nm (m-th zero of J_n, TM)
 *   D. M. Pozar, Microwave Engineering, 4th ed., Wiley, 2012, §3.4 (eqs. 3.126, 3.143; Tables 3.4, 3.5).
 * Bessel zeros: computed to 60 significant digits by power series + bisection (scratch script
 *   bessel_zeros.py) and rounded to 15 digits; they agree with M. Abramowitz & I. A. Stegun, Handbook of
 *   Mathematical Functions, NBS 1964, Table 9.5, and with Pozar Tables 3.4/3.5 (tests).
 * Conductor attenuation (perturbation method, smooth walls, R_s = √(ωμ₀/2σ)):
 *   TE_nm: α_c = R_s/(aη√(1−(f_c/f)²)) · [(f_c/f)² + n²/(p′² − n²)]
 *   TM_nm: α_c = R_s/(aη√(1−(f_c/f)²))
 *   (N. Marcuvitz, Waveguide Handbook, 1951, §2.3; R. E. Collin, Foundations for Microwave Engineering,
 *   2nd ed., 1992, ch. 3, circular waveguide). For TE₁₁ this is Pozar eq. 3.133; for TE₀m it falls as
 *   f^(−3/2) far above cutoff — the low-loss property of TE₀₁. Checked in the tests against a numerical
 *   integration of the Pozar §3.4 fields.
 * Dielectric loss, wave impedance and the rest are shared with the rectangular guide (Pozar §3.1).
 */

import { C0, ETA0, modeWave, surfaceResistance, type ModeType, type ModeWave } from '../waveguide-cutoff/model';

export { C0, ETA0 };

/** p_nm: zeros of J_n (TM modes), n = 0…7, m = 1…5. */
export const P_TM: number[][] = [
  [2.40482555769577, 5.52007811028631, 8.65372791291101, 11.7915344390143, 14.9309177084878],
  [3.83170597020751, 7.01558666981562, 10.1734681350627, 13.3236919363142, 16.4706300508776],
  [5.13562230184068, 8.41724414039986, 11.6198411721491, 14.7959517823513, 17.9598194949878],
  [6.38016189592398, 9.76102312998167, 13.0152007216984, 16.2234661603188, 19.409415226435],
  [7.5883424345038, 11.0647094885012, 14.3725366716176, 17.6159660498048, 20.8269329569624],
  [8.77148381595995, 12.3386041974669, 15.7001740797117, 18.9801338751799, 22.2177998965613],
  [9.93610952421768, 13.5892901705412, 17.003819667816, 20.3207892135665, 23.5860844355814],
  [11.0863700192451, 14.8212687270132, 18.2875828324817, 21.6415410198484, 24.934927887673],
];

/** p′_nm: zeros of J_n′ (TE modes), n = 0…7, m = 1…5 (x = 0 excluded). */
export const P_TE: number[][] = [
  [3.83170597020751, 7.01558666981562, 10.1734681350627, 13.3236919363142, 16.4706300508776],
  [1.84118378134066, 5.33144277352503, 8.53631636634629, 11.7060049025921, 14.863588633909],
  [3.05423692822714, 6.70613319415846, 9.9694678230876, 13.1703708560161, 16.3475223183218],
  [4.20118894121053, 8.01523659837595, 11.345924310743, 14.585848286167, 17.7887478660665],
  [5.31755312608399, 9.28239628524161, 12.6819084426389, 15.9641070377316, 19.1960288000489],
  [6.41561637570024, 10.5198608737723, 13.9871886301403, 17.3128424878846, 20.5755145213869],
  [7.50126614468415, 11.7349359530427, 15.2681814610979, 18.6374430096662, 21.9317150178022],
  [8.57783648971407, 12.9323862370896, 16.5293658843669, 19.9418533665273, 23.2680529264576],
];

export const N_MAX = P_TE.length - 1;
export const M_MAX = P_TE[0].length;

export function validCircMode(n: number, m: number): boolean {
  return Number.isInteger(n) && Number.isInteger(m) && n >= 0 && n <= N_MAX && m >= 1 && m <= M_MAX;
}

/** Bessel-zero of the mode: p′_nm for TE, p_nm for TM. */
export function besselZero(type: ModeType, n: number, m: number): number {
  return (type === 'TE' ? P_TE : P_TM)[n][m - 1];
}

/** Cutoff of TE_nm / TM_nm in a pipe of radius a. */
export function circCutoff(type: ModeType, a: number, n: number, m: number, er: number): number {
  return (besselZero(type, n, m) * C0) / (2 * Math.PI * a * Math.sqrt(er));
}

export function circWave(type: ModeType, a: number, n: number, m: number, er: number, f: number): ModeWave {
  return modeWave(type, circCutoff(type, a, n, m, er), f, er);
}

/** Conductor attenuation α_c (Np/m) of TE_nm / TM_nm above cutoff; null below. */
export function circAlphaC(type: ModeType, a: number, n: number, m: number, er: number, f: number, sigma: number): number | null {
  const wv = circWave(type, a, n, m, er, f);
  if (!wv.propagating) return null;
  const rs = surfaceResistance(f, sigma);
  const r2 = (wv.fc / f) ** 2;
  const base = rs / (a * wv.eta * Math.sqrt(1 - r2));
  if (type === 'TM') return base;
  const p = besselZero('TE', n, m);
  return base * (r2 + (n * n) / (p * p - n * n));
}

/** Pozar eq. 3.133: TE₁₁ conductor attenuation (kept for cross-checks). */
export function alphaCTE11Pozar(a: number, er: number, f: number, sigma: number): number | null {
  const wv = circWave('TE', a, 1, 1, er, f);
  if (!wv.propagating || wv.beta == null) return null;
  const p = P_TE[1][0];
  const rs = surfaceResistance(f, sigma);
  return (rs / (a * wv.k * wv.eta * wv.beta)) * (wv.kc * wv.kc + (wv.k * wv.k) / (p * p - 1));
}

export interface CircMode {
  type: ModeType;
  n: number;
  m: number;
  p: number;
}

/** Every tabulated mode, sorted by its Bessel zero (TE before TM on ties). */
export function circModes(): CircMode[] {
  const out: CircMode[] = [];
  for (let n = 0; n <= N_MAX; n++)
    for (let m = 1; m <= M_MAX; m++) {
      out.push({ type: 'TE', n, m, p: P_TE[n][m - 1] }, { type: 'TM', n, m, p: P_TM[n][m - 1] });
    }
  out.sort((x, y) => x.p - y.p || (x.type === y.type ? x.n - y.n : x.type === 'TE' ? -1 : 1));
  return out;
}

/**
 * Bessel zero below which the tabulated list is complete: zeros grow with n and m, and every n ≥ 8 mode
 * lies above j′₈,₁ > j′₇,₁ while every m ≥ 6 zero lies above the smallest fifth zero (14.86), so all
 * modes with p ≤ j′₇,₁ = 8.578 are listed.
 */
export const P_COMPLETE = P_TE[N_MAX][0];

/** Radius that puts a mode at cutoff f_c. */
export function radiusForCutoff(type: ModeType, n: number, m: number, fc: number, er: number): number {
  return (besselZero(type, n, m) * C0) / (2 * Math.PI * fc * Math.sqrt(er));
}

/** Bessel function J_n(x) by its power series (fine for the x ≤ 25 used in field sketches). */
export function besselJ(n: number, x: number): number {
  const h = x / 2;
  let term = 1;
  for (let i = 1; i <= n; i++) term *= h / i;
  let s = term;
  for (let k = 1; k < 200; k++) {
    term *= (-h * h) / (k * (k + n));
    s += term;
    if (Math.abs(term) < 1e-17 * Math.max(Math.abs(s), 1e-300) && k > x) break;
  }
  return s;
}

function besselJp(n: number, x: number): number {
  return n === 0 ? -besselJ(1, x) : 0.5 * (besselJ(n - 1, x) - besselJ(n + 1, x));
}

/** Transverse E-field (unnormalised, Cartesian) of a mode at (ρ, φ), for sketches. TE₁₁ points along y at the centre. */
export function circEField(type: ModeType, n: number, m: number, a: number, rho: number, phi: number): [number, number] {
  const p = besselZero(type, n, m);
  const x = (p * rho) / a;
  let er: number;
  let ep: number;
  if (type === 'TE') {
    // E_ρ ∝ n sin(nφ) J_n(x)/x, E_φ ∝ cos(nφ) J_n′(x)
    er = x > 1e-9 ? (n * Math.sin(n * phi) * besselJ(n, x)) / x : n === 1 ? 0.5 * Math.sin(phi) : 0;
    ep = Math.cos(n * phi) * besselJp(n, x);
  } else {
    // E_ρ ∝ sin(nφ) J_n′(x), E_φ ∝ n cos(nφ) J_n(x)/x
    er = Math.sin(n * phi) * besselJp(n, x);
    ep = x > 1e-9 ? (n * Math.cos(n * phi) * besselJ(n, x)) / x : n === 1 ? 0.5 * Math.cos(phi) : 0;
    if (n === 0) er = -besselJp(0, x); // TM₀m: radial field
  }
  return [er * Math.cos(phi) - ep * Math.sin(phi), er * Math.sin(phi) + ep * Math.cos(phi)];
}
