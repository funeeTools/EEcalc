/**
 * Embedded (buried) planar resistor — equations (pure, SI in / SI out).
 *
 * Resistance in squares (Ohmega Technologies, “OhmegaPly® Design Guide”, v18, “Explanation of Ohms-per-Square”
 * and “Meander Type”):
 *     R = R_s · N,   N = L/W + 0.56·n_c
 * with L the straight length of the element between the copper terminations (corner squares excluded) and
 * n_c right-angle corners of a meander, each worth 0.56 squares because the current cuts the corner.
 * Element area A = W·(L + n_c·W).
 *
 * Untrimmed tolerance, worst case (R. C. Snogren, “Designing Resistors to Embed”, IPC, Tables 3–4 and
 * “Untrimmed Resistance Tolerance”): the copper etch moves both the width and the length between the
 * terminations by +e⁺ / −e⁻ (½ oz copper: +10 / −5 µm, which reproduces Snogren's Table 4); the largest
 * resistance has the narrowest, longest element, the smallest the widest, shortest one; the sheet tolerance t
 * is added on top:
 *     R_max = R_s(1 + t)·[(L + e⁺)/(W − e⁻) + 0.56 n_c],   R_min = R_s(1 − t)·[(L − e⁻)/(W + e⁺) + 0.56 n_c]
 * A laser-trimmed design is drawn low, at R/(1 + tol⁺), so every part can be trimmed up to R.
 *
 * Temperature: R(T) = R(25 °C)·[1 + TCR·(T − 25 °C)] (vendor RTC per MIL-STD-202 method 304, −55…125 °C).
 * Power: P_max = PD·A with the vendor's power density PD; the narrowest element for a power P at fixed N is
 *     W_min = √(P / (PD·(N + 0.44 n_c)))   (from A = W²·(N − 0.56 n_c + n_c)).
 * Ohmega's design guide also gives an area-dependent rating for small NiP elements (< 1100 mil²):
 *     PD = a·A^−0.87 mW/mil² (A in mil²), a = 76.5, 61.2, 54.5, 45.9, 39.7 (25 °C ambient) and 49.7, 39.9,
 *     35.4, 29.8, 25.9 (80 °C) for 10, 25, 50, 100, 250 Ω/□,
 * held at its 200 mil² value for smaller elements (20 × 10 mil, the size the 2023 selection guide rates; the
 * curve there, 0.39–0.77 mW/mil², is close to that guide's 250–875 W/in² = 0.25–0.875 mW/mil²).
 * For those presets the rating is the larger of the two (the curve only raises elements below about 1100 mil²),
 * and the narrowest width for P is then found from the area that rates exactly P.
 */

export const CORNER_SQ = 0.56;
export const MIL2 = 25.4e-6 * 25.4e-6;
/** Smallest area (mil²) the curve is used at; smaller elements keep that density. */
export const SMALL_FLOOR = 200;

export const squares = (l: number, w: number, nc: number) => l / w + CORNER_SQ * nc;
export const area = (l: number, w: number, nc: number) => w * (l + nc * w);

/** Straight length for a target number of squares at width w (NaN if the corners alone exceed it). */
export const lengthFor = (n: number, w: number, nc: number) => (n > CORNER_SQ * nc ? w * (n - CORNER_SQ * nc) : NaN);
/** Width for a target number of squares at straight length l. */
export const widthFor = (n: number, l: number, nc: number) => (n > CORNER_SQ * nc ? l / (n - CORNER_SQ * nc) : NaN);

export interface Tol {
  /** fractional limits, e.g. +0.066 / −0.071 */
  plus: number;
  minus: number;
  /** etch-only (geometry) part, same signs, sheet tolerance excluded */
  geoPlus: number;
  geoMinus: number;
}

/** Worst-case untrimmed tolerance; null when the element is not wider and longer than the etch shrink. */
export function tolerance(l: number, w: number, nc: number, t: number, ep: number, em: number): Tol | null {
  if (!(w > em) || !(l > em)) return null;
  const n = squares(l, w, nc);
  const nMax = (l + ep) / (w - em) + CORNER_SQ * nc;
  const nMin = (l - em) / (w + ep) + CORNER_SQ * nc;
  return { plus: ((1 + t) * nMax) / n - 1, minus: 1 - ((1 - t) * nMin) / n, geoPlus: nMax / n - 1, geoMinus: 1 - nMin / n };
}

/** Narrowest width that dissipates P at power density pd with N squares (fixed resistance). */
export const widthForPower = (p: number, pd: number, n: number, nc: number) => Math.sqrt(p / (pd * (n + (1 - CORNER_SQ) * nc)));

/**
 * Ohmega design guide v18 p.35–36 ratings at two ambients: the large-element (> 1100 mil²) density and the
 * small-element curve coefficient, mW/mil². Between 25 and 80 °C the page interpolates linearly; outside it
 * holds the nearer table (the def warns above 80 °C).
 */
export const OHMEGA_T = [25, 80] as const;
export const OHMEGA_PLATEAU: Record<number, [number, number]> = { 10: [0.187, 0.122], 25: [0.15, 0.098], 50: [0.138, 0.09], 100: [0.1, 0.065], 250: [0.09, 0.059] };
export const OHMEGA_COEF: Record<number, [number, number]> = { 10: [76.5, 49.7], 25: [61.2, 39.9], 50: [54.5, 35.4], 100: [45.9, 29.8], 250: [39.7, 25.9] };

const lerpT = (pair: [number, number], tAmb: number) => {
  const f = Math.min(Math.max((tAmb - OHMEGA_T[0]) / (OHMEGA_T[1] - OHMEGA_T[0]), 0), 1);
  return pair[0] + f * (pair[1] - pair[0]);
};

/** Ohmega's small-element power density (W/m²) for a NiP sheet resistance in the table, area a (m²), ambient tAmb. */
export function ohmegaSmallPd(rs: number, a: number, tAmb = 25): number | null {
  const c = OHMEGA_COEF[rs];
  if (!c) return null;
  // not extrapolated below 200 mil² (a 20 × 10 mil element, the size the selection guide rates): held there
  const aMil = Math.max(a / MIL2, SMALL_FLOOR);
  return ((lerpT(c, tAmb) * aMil ** -0.87) * 1e-3) / MIL2;
}

/** Ohmega's large-element power density (W/m²) at ambient tAmb. */
export const ohmegaPlateauPd = (rs: number, tAmb: number) => (OHMEGA_PLATEAU[rs] ? (lerpT(OHMEGA_PLATEAU[rs], tAmb) * 1e-3) / MIL2 : null);

/**
 * Power rating of an element of area a. OhmegaPly presets (nipRs set): the larger of the design guide's
 * large-element density and its small-element curve at the ambient (the curve falls below the large-element
 * value just above 1100 mil², so this joins them continuously and keeps the rating rising with area).
 * Anything else: the power density field × area.
 */
export function powerRating(a: number, pd: number, nipRs: number | null, tAmb = 25): number {
  const plateau = nipRs == null ? null : ohmegaPlateauPd(nipRs, tAmb);
  const small = nipRs == null ? null : ohmegaSmallPd(nipRs, a, tAmb);
  if (plateau == null || small == null) return pd * a;
  return Math.max(plateau, small) * a;
}

/** Narrowest width whose element rates P (N squares, n_c corners): A = W²·(N + 0.44 n_c). */
export function widthForRating(p: number, pd: number, nipRs: number | null, n: number, nc: number, tAmb = 25): number {
  const shape = n + (1 - CORNER_SQ) * nc;
  if (nipRs == null || !OHMEGA_COEF[nipRs]) return widthForPower(p, pd, n, nc);
  // the rating rises monotonically with area: bisect on ln A
  let lo = Math.log(1e-24);
  let hi = Math.log(1e4);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (powerRating(Math.exp(mid), pd, nipRs, tAmb) >= p) hi = mid;
    else lo = mid;
  }
  return Math.sqrt(Math.exp(hi) / shape);
}
