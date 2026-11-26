/**
 * Edge-coupled offset (asymmetric) stripline pair — pure model (no DOM, SI in/out).
 *
 * Two traces W × T, edge gap S, on one layer between two planes: H₁ of dielectric below the traces and H₂ above
 * (b = H₁ + T + H₂), homogeneous εr (pure TEM, εeff = εr). Normalised capacitances C/ε throughout.
 *
 * No closed form exists for this geometry (the conformal map of an off-centre coupled pair is not elementary).
 * The model is an equivalent centred line built from two sourced pieces:
 *   1. the single offset trace, C_s,off — the asymmetric-stripline page’s model (Cohn 1960 broadside odd mode,
 *      narrow-strip deficit restored from Cohn’s exact centred line (1954), image-method copper thickness after
 *      Wadell §3.6.3; field-checked +0 … +0.9 % for W ≥ H_near);
 *   2. Cohn’s coupled stripline (S. B. Cohn, "Shielded Coupled-Strip Transmission Line", IRE Trans. MTT-3(5), 1955,
 *      pp. 29–38: exact at T = 0, eqs. 18/20/22 for thickness), imported unchanged from the edge-coupled stripline
 *      page.
 * The pair is taken to couple like the centred pair whose single trace has the same capacitance: b_eq solves
 *   C_s,centred(W, b_eq, T) = C_s,off(W, T, H₁, H₂),   2H_near + T ≤ b_eq ≤ 2H_far + T,
 * and Z_0e, Z_0o are Cohn’s coupled-stripline values at (W, S, b_eq, T). So the single-trace limit (S → ∞) is the
 * offset model exactly, H₁ = H₂ is the symmetric pair exactly, and every impedance rises monotonically as either
 * plane moves away (C_s,off falls, b_eq grows), as the physics requires.
 *
 * Rejected alternatives (same field check): the plain image method (each mode ½Σ C_mode(2Hᵢ + T)) reads up to
 * +9.7 % (even) and +4 % (odd) high at T = 0; adding image-method coupling increments to C_s,off reads Zdiff up to
 * −3.8 % low and, worse, makes Zdiff fall again beyond H_far/H_near ≈ 4 — physically impossible, and it broke the
 * H solves. The equivalent-line model reads slightly high instead (the offset pair couples a little more than its
 * equivalent centred pair) and is monotonic.
 *
 * Accuracy against a 2-D finite-volume Laplace solution (builder scratch builderA2/cfd.mjs on pcb1/fd.mjs: graded
 * mesh, 3-grid Richardson extrapolation; 300 cross-sections, H_far/H_near 1–5, W/H_near 0.25–2, S/H_near 0.25–4,
 * T/H_near 0–0.25): see BANDS. At T = 0 the error comes only from the equivalence; with copper it adds to the
 * known error of Cohn’s thickness corrections (largest for narrow traces with S just above 5T).
 */

import { brent } from '@/core/calc/solve';
import { offsetCap } from '../broadside-coupled/model';
import { striplineCap } from '../controlled-impedance/model';
import { ETA0, coupledStripline } from '../stripline-diff/model';

export { ETA0 };

export interface AsymPairResult {
  ze: number;
  zo: number;
  zdiff: number;
  zcm: number;
  /** backward coupling (Ze − Zo)/(Ze + Zo) */
  kb: number;
  /** single offset trace (S → ∞) */
  zs: number;
  /** equivalent centred plane spacing */
  bEq: number;
  /** plane spacing H₁ + T + H₂ */
  b: number;
  /** which odd-mode thickness formula of Cohn applies ('exact' at T = 0) */
  branch: 'exact' | 'wide' | 'close';
  /** the same pair centred in the same planes (H₁ = H₂ = (b − T)/2), for comparison */
  zdiffSym: number;
  /** plain image method (both modes ½Σ C(2Hᵢ + T)), for comparison */
  zdiffImage: number;
}

/** Equivalent centred spacing: the centred line whose single trace has the offset trace’s capacitance. */
export function equivalentB(w: number, t: number, h1: number, h2: number): number {
  const lo = 2 * Math.min(h1, h2) + t;
  const hi = 2 * Math.max(h1, h2) + t;
  if (!(hi > lo * (1 + 1e-12))) return lo;
  const c = offsetCap(w, t, h1, h2);
  const f = (b: number) => striplineCap(w, b, t) - c;
  // C_sym(lo) ≥ C_off ≥ C_sym(hi): the near plane alone holds more than the offset line, the far one less
  if (f(lo) <= 0) return lo;
  if (f(hi) >= 0) return hi;
  return brent(f, lo, hi, 1e-13 * hi);
}

/** W, S (edge gap), T, H₁ (below), H₂ (above), εr. `lean` skips the comparison lines (for root finding and graphs). */
export function asymPair(w: number, s: number, t: number, h1: number, h2: number, er: number, lean = false): AsymPairResult {
  const bEq = equivalentB(w, t, h1, h2);
  const c = coupledStripline(w, s, bEq, t, er);
  const b = h1 + t + h2;
  const k = ETA0 / Math.sqrt(er);
  const r: AsymPairResult = { ze: c.ze, zo: c.zo, zdiff: c.zdiff, zcm: c.zcm, kb: c.kb, zs: c.zs, bEq, b, branch: c.branch, zdiffSym: NaN, zdiffImage: NaN };
  if (lean) return r;
  const a1 = coupledStripline(w, s, 2 * h1 + t, t, 1);
  const a2 = coupledStripline(w, s, 2 * h2 + t, t, 1);
  return { ...r, zdiffSym: coupledStripline(w, s, b, t, er).zdiff, zdiffImage: (2 * k) / (0.5 * (a1.co + a2.co)) };
}

/**
 * Error band of Zdiff and Zcm (percent, model − field)/field against the 2-D field solution (300 cross-sections,
 * builder scratch builderA2/grid.jsonl), by copper group, trace width and offset ratio r = H_far/H_near. Measured
 * extremes in the comments; the bands are widened outward to the next 0.5 %.
 */
type Band = { zdiff: [number, number]; zcm: [number, number] };
type Row = [rMax: number, wide: Band, narrow: Band];
const B = (d0: number, d1: number, c0: number, c1: number): Band => ({ zdiff: [d0, d1], zcm: [c0, c1] });
// Groups: T = 0 ('t0'); with copper by Cohn’s odd-mode formula: S ≥ 8T ('far', eq. 20 well apart), 5T ≤ S < 8T ('mid',
// just above the switch, where eq. 20 is weakest), S < 5T ('close', eq. 22). Rows: H_far/H_near ≤ 1 (centred), 2, 3,
// ≤ 5 (beyond 5: same band, flagged unchecked). Each row: wide (W ≥ H_near/2), narrow. Measured Zdiff / Zcm extremes and section counts in the comments; cells
// with ≤ 4 sections are widened by a further 0.5 %.
const BANDS: Record<'t0' | 'far' | 'mid' | 'close', Row[]> = {
  t0: [
    [1.0001, B(0, 0.5, 0, 0.5), B(0, 0.5, 0, 0.5)], // 0.06…0.16 / 0.02…0.11 (n 15); 0.09…0.17 / 0.06…0.09 (n 5)
    [2, B(0, 1.5, -1, 0.5), B(0, 1.5, 0, 1)], // 0.10…1.04 / -0.62…0.22 (n 30); 0.28…1.09 / 0.48…0.96 (n 10)
    [3, B(0.5, 2.5, -1.5, 0.5), B(0, 2, 0, 1.5)], // 0.61…2.06 / -1.49…0.14 (n 15); 0.50…1.82 / 0.30…1.22 (n 5)
    [Infinity, B(0.5, 3.5, -3, 0.5), B(0.5, 3, -0.5, 1.5)], // 0.94…3.46 / -2.55…0.10 (n 15); 0.59…2.54 / -0.00…1.40 (n 5)
  ],
  far: [
    [1.0001, B(-0.5, 1.5, -1.5, 0), B(-0.5, 2.5, -2, 0)], // -0.08…1.50 / -1.01…-0.02 (n 15); -0.11…2.33 / -1.94…-0.14 (n 5)
    [2, B(0, 3.5, -1.5, 0.5), B(0, 4.5, -2, 0.5)], // 0.03…3.15 / -1.35…0.10 (n 30); 0.45…4.36 / -1.85…0.50 (n 10)
    [3, B(0.5, 4.5, -2, 0.5), B(2, 5.5, -1.5, 1)], // 0.71…4.22 / -1.67…0.04 (n 15); 2.04…5.45 / -1.42…0.66 (n 5)
    [Infinity, B(1.5, 6, -3, 0), B(3, 7, -1, 1)], // 1.79…5.69 / -2.56…-0.07 (n 15); 3.44…6.75 / -0.84…0.94 (n 5)
  ],
  mid: [
    [1.0001, B(1.5, 5.5, -2.5, 0.5), B(6, 7.5, -4.5, -3)], // 2.04…4.53 / -1.70…-0.38 (n 3); 6.64…6.64 / -3.52…-3.52 (n 1)
    [2, B(2.5, 6.5, -2, -0.5), B(7.5, 9.5, -4, -2.5)], // 2.81…6.43 / -1.85…-0.56 (n 6); 8.05…8.93 / -3.37…-3.14 (n 2)
    [3, B(4, 8, -2.5, -0.5), B(9, 10.5, -3.5, -2)], // 4.97…7.38 / -1.77…-1.49 (n 3); 9.91…9.91 / -2.69…-2.69 (n 1)
    [Infinity, B(5.5, 9, -3, -0.5), B(10, 11.5, -3, -1.5)], // 6.43…8.19 / -2.26…-1.46 (n 3); 10.73…10.73 / -2.00…-2.00 (n 1)
  ],
  close: [
    [1.0001, B(-0.5, 1.5, -4, 0), B(0.5, 2.5, -8.5, -3)], // -0.48…1.20 / -3.71…-0.34 (n 12); 1.11…1.88 / -7.89…-3.86 (n 4)
    [2, B(-0.5, 2.5, -4, 0), B(1.5, 3, -8.5, -4)], // -0.05…2.19 / -3.95…-0.48 (n 24); 1.67…2.76 / -8.00…-4.08 (n 8)
    [3, B(1, 3.5, -4, -1), B(1.5, 4.5, -8, -3)], // 1.31…3.09 / -3.71…-1.30 (n 12); 2.45…3.59 / -7.27…-3.66 (n 4)
    [Infinity, B(1.5, 4.5, -3.5, -1), B(2, 5, -7, -2)], // 1.93…4.04 / -3.10…-1.36 (n 12); 2.82…4.44 / -6.31…-2.77 (n 4)
  ],
};

export interface AccuracyBand extends Band {
  /** inside the field-checked grid (W ≥ H_near/4, 0.25 ≤ S/H_near ≤ 4, T ≤ H_near/4, r ≤ 5) */
  checked: boolean;
}

/** Measured error band (percent) of Zdiff and Zcm for this geometry. */
export function accuracyBand(w: number, s: number, t: number, h1: number, h2: number): AccuracyBand {
  const near = Math.min(h1, h2);
  const r = Math.max(h1, h2) / near;
  const group = !(t > 0) ? 't0' : s >= 8 * t ? 'far' : s >= 5 * t ? 'mid' : 'close';
  const row = BANDS[group].find((x) => r <= x[0])!;
  const narrow = w < near / 2;
  const band = narrow ? row[2] : row[1];
  return { ...band, checked: w >= near / 4 && s >= near / 4 && s <= 4 * near && t <= near / 4 && r <= 5 };
}
