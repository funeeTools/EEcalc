/**
 * LM317 / LM337 adjustable regulator — equations only (pure, SI in/out, magnitudes).
 *
 *   Vin ── IN [LM317] OUT ──┬── Vout
 *                ADJ        R1   (Vref across R1)
 *                 └─────────┤
 *                           R2   (carries Vref/R1 + I_ADJ)
 *   GND ────────────────────┴──
 *
 * The regulator holds V_REF between OUT and ADJ, so R1 carries V_REF/R1 and R2 carries that plus the
 * adjustment-pin current:
 *
 *   Vout = V_REF·(1 + R2/R1) + I_ADJ·R2               (TI LM317 data sheet SLVS044Z, eq. 1 / eq. 2)
 *
 * The LM337 (TI SLVS047L) is the negative mirror image: the same equation holds for magnitudes.
 * Data-sheet limits used by the presets (full operating temperature range):
 *   LM317: V_REF 1.2 / 1.25 / 1.3 V, I_ADJ 50 typ / 100 max µA, minimum load 3.5 typ / 10 max mA at
 *          Vin − Vout = 40 V, current limit ≥ 1.5 A (Vin − Vout ≤ 15 V), "up to 3 V headroom" (§7.4.2).
 *   LM337: V_REF −1.2 / −1.25 / −1.3 V, I_ADJ 65 typ / 100 max µA, minimum output current 2.5 typ /
 *          10 max mA (|Vin − Vout| ≤ 40 V), peak output current ≥ 1.5 A (≤ 15 V), specified from 3 V.
 */

import { bracketE, eValues } from '@/core/eseries';

export { POWER_RATINGS, ratingFor } from '@/core/eseries';

/** Output voltage magnitude of the adjustable regulator. */
export function vOut(vref: number, iadj: number, r1: number, r2: number): number {
  return vref * (1 + r2 / r1) + iadj * r2;
}

/** R2 for a target output (exact inverse of vOut in R2). Negative when Vout < Vref. */
export function r2For(vout: number, vref: number, iadj: number, r1: number): number {
  return (vout - vref) / (vref / r1 + iadj);
}

/** R1 for a target output with R2 given (exact inverse of vOut in R1). Non-positive when I_ADJ·R2 alone reaches Vout − Vref. */
export function r1For(vout: number, vref: number, iadj: number, r2: number): number {
  const d = vout - vref - iadj * r2;
  return d > 0 ? (vref * r2) / d : -1;
}

export interface WorstCase {
  lo: number;
  hi: number;
  /** Half-span contributions (V) of each error source alone */
  dVref: number;
  dRes: number;
  dIadj: number;
}

/**
 * Worst-case output: V_REF at ±vrefTol, both resistors at ±t (R2 high with R1 low gives the maximum),
 * I_ADJ between 0 (the data sheets give no minimum) and its maximum.
 */
export function worstCase(vref: number, vrefTol: number, iadjMax: number, r1: number, r2: number, t: number): WorstCase {
  const hi = vOut(vref * (1 + vrefTol), iadjMax, r1 * (1 - t), r2 * (1 + t));
  const lo = vOut(vref * (1 - vrefTol), 0, r1 * (1 + t), r2 * (1 - t));
  const k = 1 + r2 / r1;
  const kHi = 1 + (r2 * (1 + t)) / (r1 * (1 - t));
  const kLo = 1 + (r2 * (1 - t)) / (r1 * (1 + t));
  return { lo, hi, dVref: vref * vrefTol * k, dRes: (vref * (kHi - kLo)) / 2, dIadj: (iadjMax * r2) / 2 };
}

export interface Lm317Op {
  vout: number;
  /** Current in R1 = V_REF / R1 (it also flows in R2 and leaves through the OUT pin) */
  iR1: number;
  /** Current in R2 = I_R1 + I_ADJ */
  iR2: number;
  pR1: number;
  pR2: number;
  /** Current out of the OUT pin: load + divider */
  iOutPin: number;
  /** Input current: load + divider + I_ADJ */
  iin: number;
  /** Regulator dissipation */
  pd: number;
  pout: number;
  eff: number;
  /** Vin − Vout − V_DO (≥ 0 when regulating) */
  margin: number;
}

/** Operating point at input vin and external load current iload. */
export function operatingPoint(vref: number, iadj: number, r1: number, r2: number, vin: number, iload: number, vdo: number): Lm317Op {
  const vout = vOut(vref, iadj, r1, r2);
  const iR1 = vref / r1;
  const iR2 = iR1 + iadj;
  const iOutPin = iload + iR1;
  const iin = iOutPin + iadj;
  // OUT pin current drops Vin − Vout across the pass device; I_ADJ leaves the ADJ pin at Vout − Vref.
  const pd = (vin - vout) * iOutPin + (vin - vout + vref) * iadj;
  const pout = vout * iload;
  return { vout, iR1, iR2, pR1: vref * iR1, pR2: iR2 * iR2 * r2, iOutPin, iin, pd, pout, eff: vin > 0 && iin > 0 ? pout / (vin * iin) : 0, margin: vin - vout - vdo };
}

export interface Pair {
  r1: number;
  r2: number;
  vout: number;
  /** Relative output error against the target */
  err: number;
}

/**
 * Best standard (R1, R2) pairs for a target output: every series value of R1 within ×/÷ `span` of
 * the reference R1, each with the two series values that bracket its exact R2. Sorted by |error|,
 * then by closeness of R1 to the reference. Standard values are kept within 1 Ω … 10 MΩ, and R1 at or
 * below r1Max ranked first (R1 candidates reach down to r1Max/span so a passing pair exists).
 */
export function bestPairs(series: string, target: number, vref: number, iadj: number, r1Ref: number, r1Max = Infinity, span = 2.2, n = 8): Pair[] {
  if (!(target > vref) || !(r1Ref > 0)) return [];
  const out: Pair[] = [];
  const seen = new Set<string>();
  for (const r1 of eValues(series, Math.max(Math.min(r1Ref, r1Max) / span, 1), Math.min(r1Ref * span, 1e6))) {
    const exact = r2For(target, vref, iadj, r1);
    if (!(exact > 0)) continue;
    for (const r2 of bracketE(series, exact)) {
      if (r2 < 1 || r2 > 10e6) continue;
      const key = `${r1}/${r2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const v = vOut(vref, iadj, r1, r2);
      out.push({ r1, r2, vout: v, err: v / target - 1 });
    }
  }
  const dist = (p: Pair) => Math.abs(Math.log(p.r1 / r1Ref));
  // pairs whose R₁ is too large for the minimum load go last
  const over = (p: Pair) => (p.r1 > r1Max ? 1 : 0);
  out.sort((a, b) => over(a) - over(b) || Math.abs(a.err) - Math.abs(b.err) || dist(a) - dist(b));
  return out.slice(0, n);
}
