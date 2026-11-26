/**
 * Conductor-to-pad width — pure model (no DOM, SI in/out).
 *
 * There is no closed-form physics for "how wide may the trace into a land be"; the rule in use is a vendor design
 * guideline, and this page states it as one:
 *   TI AN-1112 (SNVA009AI, 2019) §4.1 item 3: for NSMD lands, the trace width at the connection to the land should
 *   not exceed 2/3 of the land diameter. TI's LMG3522R050 datasheet (SLUSEY6A, 2024) applies the same 2/3 limit to
 *   the width of the land on the side the trace joins, and asks that it hold for as long as the trace is not covered
 *   by solder mask.
 *   Microchip, "SMT Guidelines and PCB Best Practices" (WLCSP), §6: trace in the exposed (NSMD) area < 100 µm,
 *   preferably 75 µm.
 * We found no numeric conductor-to-land ratio in IPC-7351B or IPC-2221B.
 *
 * What the page computes exactly (plane geometry):
 *  - the copper of the trace exposed inside an NSMD mask opening, which solder wets and so draws from the joint:
 *      rectangular land (trace entering an edge, opening e beyond the land):  A = min(W, D + 2e)·e
 *      round land radius R, opening R + e, trace strip |x| ≤ W/2:          A = 2[F(W/2, R + e) − F(W/2, R)],
 *      F(a, ρ) = ∫₀^min(a,ρ) √(ρ² − x²) dx = ½[m√(ρ² − m²) + ρ² asin(m/ρ)],  m = min(a, ρ)
 *    (the Suntron 0402 study, E. Reno 2011, uses the same exposed-copper argument: solder spreads over every exposed
 *    copper surface, so the joint height drops in proportion);
 *  - the neck-down length: the narrowed section must run from the land edge to under the mask edge, so
 *    L_neck ≥ e + δ_reg (mask clearance plus mask-to-copper registration);
 *  - thermal balance of a two-terminal part: the copper width leaving each land (a trace W, n spokes of w, or the
 *    land's whole perimeter when it sits in a pour). For equal copper thickness and length, a strip's conductance is
 *    proportional to its width, so the ratio of those widths indicates which land heats more slowly (Suntron 2011:
 *    make the connections equal). The ±50 % tolerance offered is a labelled rule of thumb (AtlasPCB 2026), not a standard.
 */

export type LandShape = 'rect' | 'round';

/** ∫₀^min(a,ρ) √(ρ² − x²) dx */
export function segInt(a: number, rho: number): number {
  if (!(rho > 0) || !(a > 0)) return 0;
  const m = Math.min(a, rho);
  return 0.5 * (m * Math.sqrt(Math.max(rho * rho - m * m, 0)) + rho * rho * Math.asin(Math.min(m / rho, 1)));
}

/** Area of land (wettable copper) for a rectangle D × L or a circle of diameter D. */
export const landArea = (shape: LandShape, d: number, l: number) => (shape === 'rect' ? d * l : (Math.PI * d * d) / 4);

/** Trace copper exposed in an NSMD opening that clears the land by e (per side). */
export function exposedTrace(shape: LandShape, d: number, w: number, e: number): number {
  if (!(e > 0) || !(w > 0)) return 0;
  if (shape === 'rect') return Math.min(w, d + 2 * e) * e;
  const R = d / 2;
  return 2 * (segInt(w / 2, R + e) - segInt(w / 2, R));
}

/** Copper width leaving a land, for the thermal-balance indicator. */
export function leavingWidth(conn: 'trace' | 'spokes' | 'pour', shape: LandShape, d: number, l: number, w: number, nSpokes: number, wSpoke: number): number {
  if (conn === 'trace') return w;
  if (conn === 'spokes') return nSpokes * wSpoke;
  return shape === 'rect' ? 2 * (d + l) : Math.PI * d;
}

/** TI AN-1112 §4.1: trace at most 2/3 of the land. */
export const TI_RATIO = 2 / 3;
