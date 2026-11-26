/**
 * Resistor colour code and SMD marking — pure model (no DOM).
 *
 * Colour code per IEC 60062:2016, *Marking codes for resistors and capacitors*:
 *   digits     black 0 · brown 1 · red 2 · orange 3 · yellow 4 · green 5 · blue 6 · violet 7 · grey 8 · white 9
 *   multiplier pink 10⁻³ (added in 2016) · silver 10⁻² · gold 10⁻¹ · black 10⁰ … white 10⁹
 *   tolerance  silver ±10 % (K) · gold ±5 % (J) · red ±2 % (G) · brown ±1 % (F) · green ±0.5 % (D) · blue ±0.25 % (C)
 *              violet ±0.1 % (B) · orange ±0.05 % (W) · yellow ±0.02 % (P) · grey ±0.01 % (L) · none ±20 % (M)
 *   TCR (6th band, ppm/K) black 250 · brown 100 · red 50 · orange 15 · yellow 25 · green 20 · blue 10 · violet 5 · grey 1
 * 3 bands: 2 digits + multiplier (±20 %); 4 bands: + tolerance; 5 bands: 3 digits + multiplier + tolerance; 6 bands: + TCR.
 *
 * SMD marking (IEC 60062:2016 three- and four-character codes; EIA-96 code of EIA/ECIA-96 as used by resistor makers):
 *   3 digits  "472" = 47 × 10²   4 digits "4702" = 470 × 10²   "R" marks the decimal point: "4R7" = 4.7 Ω, "R47" = 0.47 Ω
 *             (likewise K, M, G with ×10³, ×10⁶, ×10⁹: "4K7" = 4.7 kΩ — the IEC 60062 letter code)
 *   EIA-96    two digits = index 01…96 into the E96 series, letter = multiplier:
 *             Z 10⁻³ · Y/R 10⁻² · X/S 10⁻¹ · A 10⁰ · B/H 10¹ · C 10² · D 10³ · E 10⁴ · F 10⁵     ("01C" = 10.0 kΩ)
 *   "0", "00", "000", "0000": zero-ohm jumper.
 *
 * Preferred values IEC 60063:2015: E6/E12/E24 tabulated; E48/E96/E192 = 10^(i/N) rounded to 3 figures, except
 * that E192 uses 9.20 where the formula gives 9.19.
 */

import { E_SERIES } from '@/core/eseries';

export type ColorName = 'pink' | 'silver' | 'gold' | 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'grey' | 'white' | 'none';

/** Display colours of the bands: data (physical paint colours), not theme colours. */
export const BAND_RGB: Record<ColorName, string> = {
  pink: '#f2a7c3',
  silver: '#c3c7cc',
  gold: '#c9a227',
  black: '#1b1b1b',
  brown: '#7a4a25',
  red: '#d22f2f',
  orange: '#f08a24',
  yellow: '#f3d21b',
  green: '#2f9a48',
  blue: '#2c62c8',
  violet: '#8a4fc2',
  grey: '#8d8d8d',
  white: '#f6f6f2',
  none: 'transparent',
};

/** Body colours of the drawing (data, like the bands; outlined with a theme stroke so they read in both themes). */
export const BODY_RGB = { carbon: '#e2cb9a', metal: '#9cc0e4' };

export const DIGIT_COLORS: ColorName[] = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
/** Multiplier exponent → colour */
export const MULT_COLORS: Record<number, ColorName> = { [-3]: 'pink', [-2]: 'silver', [-1]: 'gold', 0: 'black', 1: 'brown', 2: 'red', 3: 'orange', 4: 'yellow', 5: 'green', 6: 'blue', 7: 'violet', 8: 'grey', 9: 'white' };
/** Tolerance (%) → colour and IEC letter */
export const TOL: { pct: number; color: ColorName; letter: string }[] = [
  { pct: 20, color: 'none', letter: 'M' },
  { pct: 10, color: 'silver', letter: 'K' },
  { pct: 5, color: 'gold', letter: 'J' },
  { pct: 2, color: 'red', letter: 'G' },
  { pct: 1, color: 'brown', letter: 'F' },
  { pct: 0.5, color: 'green', letter: 'D' },
  { pct: 0.25, color: 'blue', letter: 'C' },
  { pct: 0.1, color: 'violet', letter: 'B' },
  { pct: 0.05, color: 'orange', letter: 'W' },
  { pct: 0.02, color: 'yellow', letter: 'P' },
  { pct: 0.01, color: 'grey', letter: 'L' },
];
/** Temperature coefficient (ppm/K) → colour */
export const TCR: { ppm: number; color: ColorName }[] = [
  { ppm: 250, color: 'black' },
  { ppm: 100, color: 'brown' },
  { ppm: 50, color: 'red' },
  { ppm: 15, color: 'orange' },
  { ppm: 25, color: 'yellow' },
  { ppm: 20, color: 'green' },
  { ppm: 10, color: 'blue' },
  { ppm: 5, color: 'violet' },
  { ppm: 1, color: 'grey' },
];

export const tolColor = (pct: number): ColorName => TOL.find((t) => t.pct === pct)?.color ?? 'none';
export const tcrColor = (ppm: number): ColorName => TCR.find((t) => t.ppm === ppm)?.color ?? 'black';

/** Decode digits and multiplier exponent to ohms (exact decimal arithmetic for the mantissa). */
export function decodeBands(digits: number[], exp: number): number {
  const m = digits.reduce((a, d) => a * 10 + d, 0);
  return Number((m * 10 ** exp).toPrecision(12));
}

export interface Encoded {
  digits: number[];
  exp: number;
  /** The value the bands actually code */
  value: number;
}

/**
 * Encode a resistance with n significant digits (2 or 3). Returns null when the value cannot be coded:
 * below the smallest code with a non-zero first digit (10·10⁻³ or 100·10⁻³ Ω) or above 99·10⁹ / 999·10⁹ Ω.
 */
export function encodeValue(r: number, n: 2 | 3): Encoded | null {
  if (!(r > 0) || !Number.isFinite(r)) return null;
  let exp = Math.floor(Math.log10(r) + 1e-12) - (n - 1);
  let m = Math.round(r / 10 ** exp);
  if (m >= 10 ** n) {
    exp += 1;
    m = Math.round(r / 10 ** exp);
  }
  if (m < 10 ** (n - 1)) {
    exp -= 1;
    m = Math.round(r / 10 ** exp);
  }
  if (exp < -3 || exp > 9) return null;
  const digits = String(m).padStart(n, '0').split('').map(Number);
  return { digits, exp, value: decodeBands(digits, exp) };
}

/** E192 with its one exception to the formula (9.20). */
export const E192 = Array.from({ length: 192 }, (_, i) => (i === 185 ? 9.2 : Number((10 ** (i / 192)).toPrecision(3))));
export const SERIES: Record<string, number[]> = { ...E_SERIES, E192 };
export const SERIES_NAMES = ['E6', 'E12', 'E24', 'E48', 'E96', 'E192'];

/** Mantissa in [1, 10) rounded to 3 figures, or null for 0. */
export function mantissa(r: number): number | null {
  if (!(r > 0) || !Number.isFinite(r)) return null;
  let e = Math.floor(Math.log10(r));
  let m = Number((r / 10 ** e).toPrecision(3));
  if (m >= 10) {
    e += 1;
    m = Number((m / 10).toPrecision(3));
  }
  return m;
}

/** Series (E6 … E192) that contain r exactly (to 3 significant figures, and r has no further digits). */
export function seriesOf(r: number): string[] {
  const m = mantissa(r);
  if (m == null) return [];
  const e = Math.floor(Math.log10(r / m) + 0.5);
  if (Math.abs(m * 10 ** e - r) > 1e-9 * r) return [];
  return SERIES_NAMES.filter((n) => SERIES[n].some((v) => Math.abs(v - m) < 1e-9));
}

/** Nearest preferred value of a series (log distance), with the neighbours below and above. */
export function nearestIn(r: number, series: string): { near: number; below: number; above: number } {
  const base = SERIES[series];
  const d = Math.floor(Math.log10(r));
  const cands: number[] = [];
  for (const k of [d - 1, d, d + 1]) for (const v of base) cands.push(Number((v * 10 ** k).toPrecision(3)));
  cands.sort((a, b) => a - b);
  let near = cands[0];
  for (const c of cands) if (Math.abs(Math.log(c / r)) < Math.abs(Math.log(near / r))) near = c;
  const below = [...cands].reverse().find((c) => c <= r * (1 + 1e-9)) ?? cands[0];
  const above = cands.find((c) => c >= r * (1 - 1e-9)) ?? cands[cands.length - 1];
  return { near, below, above };
}

// ── SMD codes
export const EIA96_LETTER: Record<string, number> = { Z: -3, Y: -2, R: -2, X: -1, S: -1, A: 0, B: 1, H: 1, C: 2, D: 3, E: 4, F: 5 };
const EIA96_OUT: Record<number, string> = { [-3]: 'Z', [-2]: 'Y', [-1]: 'X', 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F' };

export type SmdKind = 'jumper' | '3-digit' | '4-digit' | 'R-3' | 'R-4' | 'EIA-96';
export interface SmdDecoded {
  value: number;
  kind: SmdKind;
  description: string;
  /** Another valid reading of an ambiguous code (e.g. “47R” as EIA-96), ohms */
  alt?: number;
}

/** Decode an SMD resistor marking. Throws with a readable message when the code is not valid. */
export function decodeSmd(raw: string): SmdDecoded {
  const c = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!c) throw new Error('Enter the code printed on the part (e.g. 472, 4702, 4R7 or 01C).');
  if (/^0{1,4}$/.test(c)) return { value: 0, kind: 'jumper', description: 'zero-ohm jumper' };
  let m = c.match(/^(\d)(\d)(\d)$/);
  if (m) return { value: decodeBands([+m[1], +m[2]], +m[3]), kind: '3-digit', description: `3-digit: ${m[1]}${m[2]} × 10^${m[3]}` };
  m = c.match(/^(\d)(\d)(\d)(\d)$/);
  if (m) return { value: decodeBands([+m[1], +m[2], +m[3]], +m[4]), kind: '4-digit', description: `4-digit: ${m[1]}${m[2]}${m[3]} × 10^${m[4]}` };
  // R / K / M / G in place of the decimal point (IEC 60062 letter code): 4R7, R47, 47R, 10R0, 4K7, 1M0.
  // Checked before EIA-96 so that "47R" reads 47 Ω; its EIA-96 reading (R = ×0.01) is returned as an alternative.
  m = c.match(/^(\d*)([RKMG])(\d*)$/);
  if (m && c.length >= 2 && c.length <= 5 && (m[1] + m[3]).length >= 1) {
    const mul = { R: 1, K: 1e3, M: 1e6, G: 1e9 }[m[2] as 'R' | 'K' | 'M' | 'G'];
    const v = Number(`${m[1] || '0'}.${m[3] || '0'}`) * mul;
    const kind: SmdKind = c.length <= 3 ? 'R-3' : 'R-4';
    const out: SmdDecoded = { value: Number(v.toPrecision(12)), kind, description: `${m[2]} marks the decimal point${mul > 1 ? ` (× ${m[2] === 'K' ? '1k' : m[2] === 'M' ? '1M' : '1G'})` : ''}: ${c.replace(m[2], '.')}${m[2] === 'R' ? ' Ω' : ` ${m[2] === 'K' ? 'k' : m[2]}Ω`}` };
    const e = c.match(/^(\d{2})R$/);
    if (e && +e[1] >= 1 && +e[1] <= 96) out.alt = Number((E_SERIES.E96[+e[1] - 1] * 100 * 1e-2).toPrecision(12));
    return out;
  }
  m = c.match(/^(\d{2})([ZYRXSABHCDEF])$/);
  if (m) {
    const idx = +m[1];
    if (idx < 1 || idx > 96) throw new Error(`EIA-96 codes run from 01 to 96; “${m[1]}” is not one.`);
    const v = E_SERIES.E96[idx - 1];
    const exp = EIA96_LETTER[m[2]];
    return { value: Number((v * 100 * 10 ** exp).toPrecision(12)), kind: 'EIA-96', description: `EIA-96: ${m[1]} → ${(v * 100).toFixed(0)}, ${m[2]} → × 10^${exp}` };
  }
  throw new Error(`“${raw}” is not a resistor code this page reads: use 3 digits (472), 4 digits (4702), R, K or M for the decimal point (4R7, R10, 4K7) or EIA-96 (01C).`);
}

/** The 3-character (2 significant digits) marking of r, or null if r needs more digits or is out of range. */
export function smd3(r: number): string | null {
  if (r === 0) return '000';
  const e = encodeValue(r, 2);
  if (!e || Math.abs(e.value - r) > 1e-9 * r) return null;
  const [a, b] = e.digits;
  if (e.exp >= 0) return `${a}${b}${e.exp}`;
  if (e.exp === -1) return `${a}R${b}`; // 4.7 Ω → 4R7
  if (e.exp === -2) return a === 0 ? null : `R${a}${b}`; // 0.47 Ω → R47
  return null;
}

/** The 4-character (3 significant digits) marking of r, or null. */
export function smd4(r: number): string | null {
  if (r === 0) return '0000';
  const e = encodeValue(r, 3);
  if (!e || Math.abs(e.value - r) > 1e-9 * r) return null;
  const [a, b, c] = e.digits;
  if (e.exp >= 0) return `${a}${b}${c}${e.exp}`;
  if (e.exp === -1) return `${a}${b}R${c}`; // 47.5 Ω → 47R5
  if (e.exp === -2) return `${a}R${b}${c}`; // 4.75 Ω → 4R75
  if (e.exp === -3) return `R${a}${b}${c}`; // 0.475 Ω → R475
  return null;
}

/** The EIA-96 marking of r when it is an E96 value with a multiplier the code has (0.1 Ω … 97.6 MΩ: 100 × 10⁻³ to 976 × 10⁵), else null. */
export function smdEia96(r: number): string | null {
  const e = encodeValue(r, 3);
  if (!e || Math.abs(e.value - r) > 1e-9 * r) return null;
  const m = e.digits[0] + e.digits[1] / 10 + e.digits[2] / 100;
  const idx = E_SERIES.E96.findIndex((v) => Math.abs(v - m) < 1e-9);
  if (idx < 0) return null;
  const letter = EIA96_OUT[e.exp]; // value = (E96 mantissa × 100) × 10^exp, the same exponent as the 3-digit code
  if (!letter) return null;
  return `${String(idx + 1).padStart(2, '0')}${letter}`;
}
