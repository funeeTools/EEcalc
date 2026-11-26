/**
 * Resistive voltage divider — equations only (pure, SI in/out).
 *
 *   Vin ── R1 ──┬── Vout
 *               R2   R_L (optional load)
 *   GND ────────┴──
 *
 * Kirchhoff / Ohm only (any circuits text, e.g. Horowitz & Hill, The Art of Electronics, 3rd ed., §1.2.3
 * and §1.2.5 Thévenin's theorem). With a load, R2 is replaced by R2 ∥ R_L.
 */

import { R_STD_MAX, R_STD_MIN, bracketE, eValues } from '@/core/eseries';

export { bracketE, eValues, POWER_RATINGS, R_STD_MAX, R_STD_MIN, ratingFor } from '@/core/eseries';

/** Parallel combination; an infinite / missing resistor leaves the other one. */
export function par(a: number, b: number | null | undefined): number {
  if (b == null || !Number.isFinite(b)) return a;
  if (!Number.isFinite(a)) return b;
  return (a * b) / (a + b);
}

/** Output voltage of the (optionally loaded) divider. */
export function vOut(vin: number, r1: number, r2: number, rl: number | null): number {
  const r2e = par(r2, rl);
  return (vin * r2e) / (r1 + r2e);
}

export interface DividerOperatingPoint {
  vout: number;
  /** Output with the load removed (Thévenin voltage) */
  vth: number;
  /** Thévenin source resistance seen by the load: R1 ∥ R2 */
  rth: number;
  /** Current drawn from Vin (through R1) */
  i1: number;
  /** Current in R2 */
  i2: number;
  /** Load current */
  il: number;
  p1: number;
  p2: number;
  pl: number;
  /** Output change caused by the load, relative to the unloaded output (≤ 0) */
  loadErr: number;
  ratio: number;
}

export function operatingPoint(vin: number, r1: number, r2: number, rl: number | null): DividerOperatingPoint {
  const vout = vOut(vin, r1, r2, rl);
  const vth = vOut(vin, r1, r2, null);
  const rth = par(r1, r2);
  const i1 = (vin - vout) / r1;
  const i2 = vout / r2;
  const il = rl != null ? vout / rl : 0;
  return {
    vout,
    vth,
    rth,
    i1,
    i2,
    il,
    p1: ((vin - vout) * (vin - vout)) / r1,
    p2: (vout * vout) / r2,
    pl: rl != null ? (vout * vout) / rl : 0,
    loadErr: vth !== 0 ? vout / vth - 1 : 0,
    ratio: par(r2, rl) / (r1 + par(r2, rl)),
  };
}

/** Worst-case output for resistor tolerance t (fraction): Vout rises with R2 and falls with R1. */
export function worstCase(vin: number, r1: number, r2: number, rl: number | null, t: number): { lo: number; hi: number } {
  const a = vOut(vin, r1 * (1 + t), r2 * (1 - t), rl);
  const b = vOut(vin, r1 * (1 - t), r2 * (1 + t), rl);
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

/**
 * Root-sum-square spread (fraction of Vout) for independent resistor errors of ±t:
 * sqrt(S1² + S2²)·t with the sensitivities S = ∂ln Vout/∂ln R.
 *   S1 = −R1/(R1 + R2e),  S2 = (R1/(R1 + R2e))·(R2e/R2)
 */
export function rssSpread(r1: number, r2: number, rl: number | null, t: number): number {
  const r2e = par(r2, rl);
  const s1 = r1 / (r1 + r2e);
  const s2 = s1 * (r2e / r2);
  return Math.hypot(s1, s2) * t;
}

// ── E-series pair search ────────────────────────────────────────────────────────

export interface Pair {
  r1: number;
  r2: number;
  vout: number;
  /** Relative error of vout against the target */
  err: number;
}


/**
 * Best standard R1/R2 pairs for a target output, among all pairs whose total R1 + R2 lies within
 * `span`× of `rTotal` (default half a decade each way) and whose parts lie in R_STD_MIN…R_STD_MAX.
 * For a fixed R2, Vout falls monotonically with R1, so the best R1 is one of the preferred values next
 * to the exact R1 (clamped into the window); scanning every R2 this way equals a full brute force.
 * Sorted by |error|, then by closeness to rTotal.
 */
export function bestPairs(
  series: string,
  vin: number,
  target: number,
  rl: number | null,
  rTotal: number,
  count = 8,
  span = Math.sqrt(10),
): Pair[] {
  const k = target / vin;
  if (!(k > 0 && k < 1) || !(rTotal > 0)) return [];
  const tLo = rTotal / span;
  const tHi = rTotal * span;
  const out: Pair[] = [];
  const seen = new Set<string>();
  // R2 can never exceed the pair total; with a load it can be far above k·total, so scan the full range.
  for (const r2 of eValues(series, R_STD_MIN, Math.min(R_STD_MAX, tHi))) {
    const lo1 = Math.max(R_STD_MIN, tLo - r2);
    const hi1 = Math.min(R_STD_MAX, tHi - r2);
    if (!(hi1 >= lo1)) continue;
    const r1Ideal = par(r2, rl) * (1 / k - 1);
    if (!(r1Ideal > 0)) continue;
    const x = Math.min(Math.max(r1Ideal, lo1), hi1);
    const cands = [...bracketE(series, x), bracketE(series, hi1)[0], bracketE(series, lo1)[1]];
    for (const r1 of cands) {
      if (!(r1 >= lo1 * (1 - 1e-12) && r1 <= hi1 * (1 + 1e-12))) continue;
      const key = `${r1}|${r2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const v = vOut(vin, r1, r2, rl);
      out.push({ r1, r2, vout: v, err: v / target - 1 });
    }
  }
  const dist = (p: Pair) => Math.abs(Math.log((p.r1 + p.r2) / rTotal));
  out.sort((a, b) => Math.abs(a.err) - Math.abs(b.err) || dist(a) - dist(b));
  return out.slice(0, count);
}

/**
 * Typical thick-film chip resistor limits (Vishay CRCW e3 datasheet, doc. 20035: rated power at 70 °C and
 * limiting element voltage). Used only to suggest a package; check the actual part.
 */
export const CHIP_SIZES: { size: string; p: number; v: number }[] = [
  { size: '0402', p: 0.063, v: 50 },
  { size: '0603', p: 0.1, v: 75 },
  { size: '0805', p: 0.125, v: 150 },
  { size: '1206', p: 0.25, v: 200 },
  { size: '1210', p: 0.5, v: 200 },
  { size: '2010', p: 0.75, v: 400 },
  { size: '2512', p: 1.0, v: 500 },
];

/** Smallest chip size with ≥ 2× power margin and voltage rating ≥ |v|. */
export function chipFor(p: number, v: number): string | null {
  return CHIP_SIZES.find((c) => c.p >= 2 * p && c.v >= Math.abs(v))?.size ?? null;
}
