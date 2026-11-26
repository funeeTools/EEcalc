/**
 * SI formatting / parsing and unit tables shared by every calculator.
 *
 * parseEng accepts what engineers actually type:
 *   "4.7k"  "4k7"  "2.2u"  "2.2µ"  "10n"  "1e-6"  "100m"  "1M"  "1meg"
 */

const PREFIXES: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
  [1e-15, 'f'],
];

const PREFIX_VALUE: Record<string, number> = {
  T: 1e12,
  G: 1e9,
  M: 1e6,
  meg: 1e6,
  MEG: 1e6,
  k: 1e3,
  K: 1e3,
  m: 1e-3,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
};

/** Trim trailing zeros from a fixed/precision string ("1.500" → "1.5"). */
function trimZeros(s: string): string {
  if (!s.includes('.') || s.includes('e')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** Format with SI prefix, e.g. si(0.0000047,'F') → "4.7 µF". Negative values get a typographic minus (−). */
export function si(value: number, unit = '', digits = 3): string {
  if (!Number.isFinite(value)) return `${value} ${unit}`.trim();
  if (value === 0) return `0 ${unit}`.trim();
  const av = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  for (const [scale, prefix] of PREFIXES) {
    if (av >= scale * 0.9995) {
      return `${sign}${trimZeros((av / scale).toPrecision(digits))} ${prefix}${unit}`.trim();
    }
  }
  return `${sign}${trimZeros((av / 1e-15).toPrecision(digits))} f${unit}`.trim();
}

/** Number only with prefix and no space, for compact inputs: 4.7e-6 → "4.7µ". */
export function engString(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const av = Math.abs(value);
  for (const [scale, prefix] of PREFIXES) {
    if (av >= scale * 0.99995) return `${trimZeros((value / scale).toPrecision(digits))}${prefix}`;
  }
  return value.toExponential(digits - 1);
}

/**
 * Parse an engineering string. Returns NaN on failure.
 * The optional unit symbol (e.g. "F", "Ω", "V") is stripped if present.
 */
export function parseEng(text: string, unit = ''): number {
  // A typographic minus (as si() prints it) is read as an ordinary one.
  let s = String(text).trim().replace(/,/g, '').replace(/\s+/g, '').replace(/^\u2212/, '-');
  if (!s) return NaN;
  if (unit) {
    const u = unit.replace(/\s+/g, '');
    if (u && s.endsWith(u) && s.length > u.length) s = s.slice(0, -u.length);
    if (u === 'Ω') s = s.replace(/(ohms?|Ω)$/i, '');
  }
  // Plain number / scientific notation.
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
  // "4k7" style (prefix as decimal point).
  let m = s.match(/^([+-]?\d+)(meg|MEG|[TGMkKmuµμnpf])(\d+)$/);
  if (m) return Number(`${m[1]}.${m[3]}`) * PREFIX_VALUE[m[2]];
  // "4.7k" style.
  m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(meg|MEG|[TGMkKmuµμnpf])$/);
  if (m) return Number(m[1]) * PREFIX_VALUE[m[2]];
  return NaN;
}

/** Unit choice tables: multiplier to SI base. */
export const LENGTH_UNITS: Record<string, number> = { mm: 1e-3, cm: 1e-2, m: 1, in: 0.0254, mil: 25.4e-6 };
export const WIDTH_UNITS: Record<string, number> = { mm: 1e-3, mil: 25.4e-6, in: 0.0254 };
export const TIME_UNITS: Record<string, number> = { ns: 1e-9, 'µs': 1e-6, ms: 1e-3, s: 1 };

/** Pick a time display unit so the axis reads in sensible numbers. */
export function timeScale(tMax: number): { scale: number; unit: string } {
  const a = Math.abs(tMax);
  if (a < 2e-6) return { scale: 1e9, unit: 'ns' };
  if (a < 2e-3) return { scale: 1e6, unit: 'µs' };
  if (a < 2) return { scale: 1e3, unit: 'ms' };
  return { scale: 1, unit: 's' };
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}
