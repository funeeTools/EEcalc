/**
 * IEC 60063 preferred-number series. E6/E12/E24 are tabulated (they do not follow the rounding
 * formula); E48/E96 equal round(10^(i/N), 3 s.f.) exactly (the 9.20 exception is only in E192).
 */

const E6 = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const formula = (n: number) => Array.from({ length: n }, (_, i) => Number((10 ** (i / n)).toPrecision(3)));

export const E_SERIES: Record<string, number[]> = { E6, E12, E24, E48: formula(48), E96: formula(96) };

/** Nearest preferred value (nearest in ratio, i.e. on a log scale). */
export function nearestE(value: number, series: string): number {
  const base = E_SERIES[series];
  if (!base || !(value > 0) || !Number.isFinite(value)) return value;
  const dec = Math.floor(Math.log10(value));
  let best = value;
  let err = Infinity;
  for (const d of [dec - 1, dec, dec + 1]) {
    for (const m of base) {
      const v = m * 10 ** d;
      const e = Math.abs(Math.log(v / value));
      if (e < err) {
        err = e;
        best = Number(v.toPrecision(3));
      }
    }
  }
  return best;
}

/** All preferred values of a series between lo and hi (inclusive). */
export function eValues(series: string, lo: number, hi: number): number[] {
  const base = E_SERIES[series];
  if (!base || !(lo > 0) || !(hi >= lo)) return [];
  const out: number[] = [];
  for (let d = Math.floor(Math.log10(lo)) - 1; d <= Math.ceil(Math.log10(hi)); d++) {
    for (const m of base) {
      const v = Number((m * 10 ** d).toPrecision(3));
      if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v);
    }
  }
  return out;
}

/** The preferred values just below and just above x (both equal x when x is a preferred value). */
export function bracketE(series: string, x: number): [number, number] {
  const base = E_SERIES[series];
  if (!base || !(x > 0) || !Number.isFinite(x)) return [x, x];
  const d = Math.floor(Math.log10(x));
  const m = x / 10 ** d; // mantissa in [1, 10)
  const at = (k: number) => Number(((k >= base.length ? base[0] * 10 : k < 0 ? base[base.length - 1] / 10 : base[k]) * 10 ** d).toPrecision(3));
  let i = base.length - 1; // largest base value ≤ m
  while (i >= 0 && base[i] > m * (1 + 1e-9)) i--;
  const below = at(i);
  const above = below >= x * (1 - 1e-9) ? below : at(i + 1);
  return [below, above];
}

/** Smallest common resistor power rating (W) ≥ p. */
export const POWER_RATINGS = [0.0625, 0.1, 0.125, 0.25, 0.5, 1, 2, 3, 5, 10];
export function ratingFor(p: number): number | null {
  return POWER_RATINGS.find((r) => r >= p) ?? null;
}

/** Range searched for standard parts: what resistor makers stock (e.g. Vishay CRCW: 1 Ω – 10 MΩ). */
export const R_STD_MIN = 1;
export const R_STD_MAX = 10e6;
