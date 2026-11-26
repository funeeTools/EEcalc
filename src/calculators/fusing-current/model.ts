/**
 * Fusing current of a copper trace or wire — equations (pure; SI in / SI out except where noted).
 *
 * Onderdonk (adiabatic heating of copper from Ta to its melting point Tm in time t):
 *
 *     I = A · √( log10[ (Tm − Ta)/(234 + Ta) + 1 ] / (33 · t) )       A in circular mils, t in s, I in A
 *
 *   I. M. Onderdonk (unpublished), as given by E. R. Stauffacher, “Short-time current carrying capacity of
 *   copper wire”, General Electric Review, June 1928 (the earliest known source: D. Brooks, “Onderdonk’s and
 *   Preece’s equations: how do they compare?”, PCD&F, June 2023), and D. Brooks, “Fusing current: when traces
 *   melt without a trace”, Printed Circuit Design, Dec. 1998.
 *   234 °C is the inferred zero-resistance temperature of copper (ρ ∝ T + 234); 33 lumps the density,
 *   specific heat and resistivity of copper in these units. No heat leaves the conductor, so on a board the
 *   equation holds only for short pulses: Brooks & Adam find up to about 1–1.5 s (D. Brooks, J. Adam, “How
 *   do traces fuse (melt)?”, Signal Integrity Journal, 2017; PCB Design Guide to Via and Trace Currents and
 *   Temperatures, Artech House, 2021, App. G); with their cooling adjustments Brooks (PCD&F 2023) extends
 *   board estimates to about 4–5 s. It is the same relation as IEEE Std 80-2013 eq. (37) for the
 *   short-time rating of copper conductors.
 *
 * Preece (steady fusing of a bare round wire in air, no time dependence):
 *
 *     I = a · d^1.5,  a = 10244 for copper (d in inches)
 *
 *   W. H. Preece, “On the heating effects of electric currents”, Proc. Royal Society 36 (1884) 464–471;
 *   No. II, 43 (1888) 280–295. It applies to the fine bare wires he tested, not to traces on a board.
 */

/** m² per circular mil (the area of a 1 mil diameter circle) */
export const CMIL = (Math.PI / 4) * 25.4e-6 * 25.4e-6;
export const ONDERDONK_K = 33;
export const ONDERDONK_T0 = 234;
export const PREECE_CU = 10244;
export const T_MELT_CU = 1083;

/** log10[(Tm − Ta)/(234 + Ta) + 1] */
export const tempTerm = (ta: number, tm: number) => Math.log10((tm - ta) / (ONDERDONK_T0 + ta) + 1);

/** Onderdonk fusing current (A) for a cross-section area (m²), time (s) and temperatures (°C). */
export function onderdonkI(area: number, t: number, ta: number, tm: number): number {
  return (area / CMIL) * Math.sqrt(tempTerm(ta, tm) / (ONDERDONK_K * t));
}

/** Time (s) for current I to bring the conductor to Tm (Onderdonk solved for t). */
export function onderdonkT(area: number, i: number, ta: number, tm: number): number {
  return ((area / CMIL / i) ** 2 * tempTerm(ta, tm)) / ONDERDONK_K;
}

/** Preece fusing current (A) of a bare copper wire of diameter d (m). */
export const preeceI = (d: number) => PREECE_CU * (d / 0.0254) ** 1.5;

/**
 * Trace cross-section: W is the bottom width; the etch factor ef (thickness : undercut per side, 0 = vertical)
 * narrows the top by T/ef on each side, so A = T·(W − T/ef). A trace narrower than 2T/ef never reaches full
 * thickness: its sloped sides meet in a ridge of height W·ef/2, A = ef·W²/4 (the two forms agree at W = 2T/ef).
 */
export function traceArea(w: number, t: number, ef: number): { area: number; top: number; mean: number; height: number } {
  const cut = ef > 0 ? t / ef : 0;
  if (w - 2 * cut >= 0) return { area: (w - cut) * t, top: w - 2 * cut, mean: w - cut, height: t };
  const height = (w * ef) / 2;
  return { area: (ef * w * w) / 4, top: 0, mean: w / 2, height };
}
