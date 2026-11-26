/**
 * BGA land pad — pure model (no DOM, SI in/out).
 *
 * IPC-7351B (June 2010) §14, Table 14-5 "Land Approximation (mm) for Collapsible Solder Balls" and Table 14-6
 * "Land Approximation (mm) for Non-Collapsible Solder Balls". The land is the nominal ball diameter reduced
 * (collapsing SnPb / SAC balls) or enlarged (non-collapsing high-melt or Cu-core balls) by a percentage that
 * depends on the ball size:
 *   collapsing:      25 % for 0.55–0.75 mm balls, 20 % for 0.25–0.50 mm, 15 % for 0.15–0.20 mm
 *   non-collapsing: +15 % for 0.55–0.75 mm balls, +10 % for 0.25–0.50 mm, +5 % for 0.15–0.20 mm
 * The tables round the nominal land to the 0.05 mm grid (0.01 mm for the smallest balls) and give a land
 * variation (MMC–LMC). Row values below as tabulated (transcribed in Altium, "What's Your BGA Land Pattern and
 * Footprint?"; cross-checked row by row: every nominal is within 0.025 mm of ball × (1 ∓ r), rounded to 0.05 mm for
 * most rows and to 0.01 mm for the small balls, except the 0.17 mm collapsing row: 0.1445 → 0.15). A ball between two rows takes the smaller ball's row (PCB Libraries forum guidance on Table 14-5; the
 * same convention other land-pattern calculators use). Table 14-6 prints the 0.45 mm row variation as 0.55–0.40: a 0.15 mm spread where every
 * other row of that table spans 0.10 mm (0.06 mm for the smallest balls), so 0.55–0.45 is taken as intended (stated in
 * the theory and the table note). Table 14-5's uneven rows (0.30: 0.25–0.20, 0.25: 0.20–0.17) are kept as printed: they
 * still contain their nominal and their spreads match the neighbouring rows' pattern, so nothing marks them as misprints.
 *
 * IPC-7352 (2023) replaced the per-size bands with density levels: collapsing balls reduced 15 / 20 / 25 % at
 * levels A / B / C, non-collapsing enlarged 15 / 10 / 5 % (as summarised in the same Altium article).
 *
 * Package-pad matching: TI SPRAA99C (nFBGA Packaging, 2021) §2.1 — board land equal to the package's ball pad
 * (via) diameter for optimum reliability (ratio A/B = 1.0); Table 3-4: NSMD land about 90 % of the package via.
 * Table 2-1 there gives TI's optimum lands by pitch (NSMD land / mask opening): 0.4 mm 0.225/0.300, 0.5 mm 0.300/0.400,
 * 0.65 mm 0.350/0.450, 0.8 mm 0.400/0.500, 1.0 mm 0.450/0.550 (SMD: the same two numbers swapped).
 *
 * Channel between lands: N = ⌊(g − s)/(W + s)⌋ with g = p − D_copper, imported from ../bga-breakout/model.
 */

export { tracesInGap, wMaxForN, dMaxForN } from '@/calculators/bga-breakout/model';

export type BallType = 'collapse' | 'noncollapse';

export interface TableRow {
  ball: number;
  pct: number;
  land: number;
  max: number;
  min: number;
}

const MM = 1e-3;
const row = (ball: number, pct: number, land: number, max: number, min: number): TableRow => ({ ball: ball * MM, pct, land: land * MM, max: max * MM, min: min * MM });

/** IPC-7351B Table 14-5, collapsible balls (reduction %). */
export const T14_5: TableRow[] = [
  row(0.75, 25, 0.55, 0.6, 0.5),
  row(0.65, 25, 0.5, 0.55, 0.45),
  row(0.6, 25, 0.45, 0.5, 0.4),
  row(0.55, 25, 0.4, 0.45, 0.35),
  row(0.5, 20, 0.4, 0.45, 0.35),
  row(0.45, 20, 0.35, 0.4, 0.3),
  row(0.4, 20, 0.3, 0.35, 0.25),
  row(0.35, 20, 0.3, 0.35, 0.25),
  row(0.3, 20, 0.25, 0.25, 0.2),
  row(0.25, 20, 0.2, 0.2, 0.17),
  row(0.2, 15, 0.17, 0.2, 0.14),
  row(0.17, 15, 0.15, 0.18, 0.12),
  row(0.15, 15, 0.13, 0.15, 0.1),
];

/** IPC-7351B Table 14-6, non-collapsible balls (increase %). */
export const T14_6: TableRow[] = [
  row(0.75, 15, 0.86, 0.91, 0.81),
  row(0.65, 15, 0.75, 0.8, 0.7),
  row(0.6, 15, 0.69, 0.74, 0.64),
  row(0.55, 15, 0.63, 0.68, 0.58),
  row(0.5, 10, 0.55, 0.6, 0.5),
  row(0.45, 10, 0.5, 0.55, 0.45),
  row(0.4, 10, 0.44, 0.49, 0.39),
  row(0.35, 10, 0.38, 0.43, 0.33),
  row(0.3, 10, 0.33, 0.38, 0.28),
  row(0.25, 10, 0.27, 0.32, 0.22),
  row(0.2, 5, 0.21, 0.24, 0.18),
  row(0.17, 5, 0.18, 0.21, 0.15),
  row(0.15, 5, 0.16, 0.19, 0.13),
];

export const table = (t: BallType) => (t === 'collapse' ? T14_5 : T14_6);

/** Table row for a ball: the exact row, or the next smaller ball's row (null below 0.15 mm or above 0.75 mm). */
export function tableRow(t: BallType, ball: number): { row: TableRow; exact: boolean } | null {
  const rows = table(t);
  const tol = 0.5e-6;
  if (ball > rows[0].ball + tol || ball < rows[rows.length - 1].ball - tol) return null;
  for (const r of rows) if (ball >= r.ball - tol) return { row: r, exact: Math.abs(ball - r.ball) <= tol };
  return null;
}

/**
 * IPC-7351B percentage for a ball: the band of its row. Outside the table (balls over 0.75 mm, such as the 0.76 mm
 * balls of 1.27 mm PBGAs, or under 0.15 mm) the nearest band is extended and flagged.
 */
export function ipcPct(t: BallType, ball: number): { pct: number; extended: boolean } {
  const rows = table(t);
  const hit = tableRow(t, ball);
  if (hit) return { pct: hit.row.pct, extended: false };
  return { pct: ball > rows[0].ball ? rows[0].pct : rows[rows.length - 1].pct, extended: true };
}

/** IPC-7352 density-level percentage (reduction for collapsing, increase for non-collapsing balls). */
export const LEVEL_PCT: Record<BallType, Record<'A' | 'B' | 'C', number>> = {
  collapse: { A: 15, B: 20, C: 25 },
  noncollapse: { A: 15, B: 10, C: 5 },
};

/** Land from a ball and a percentage: reduced for collapsing balls, enlarged for non-collapsing ones. */
export const landFrom = (t: BallType, ball: number, pct: number) => ball * (t === 'collapse' ? 1 - pct / 100 : 1 + pct / 100);

/** The percentage a land represents (inverse of landFrom). */
export const pctFrom = (t: BallType, ball: number, land: number) => (t === 'collapse' ? (1 - land / ball) : (land / ball - 1)) * 100;

/** TI SPRAA99C Table 2-1: optimum NSMD land and mask opening by pitch. */
export const TI_PITCH: { p: number; land: number; smo: number }[] = [
  { p: 0.4 * MM, land: 0.225 * MM, smo: 0.3 * MM },
  { p: 0.5 * MM, land: 0.3 * MM, smo: 0.4 * MM },
  { p: 0.65 * MM, land: 0.35 * MM, smo: 0.45 * MM },
  { p: 0.8 * MM, land: 0.4 * MM, smo: 0.5 * MM },
  { p: 1.0 * MM, land: 0.45 * MM, smo: 0.55 * MM },
];
