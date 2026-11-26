/**
 * Minimum electrical conductor spacing — IPC-2221B Table 6-1 (pure model, SI in/out).
 *
 * Source: IPC-2221B, Generic Standard on Printed Board Design, IPC, Nov. 2012, §6.3 and Table 6-1
 * "Electrical Conductor Spacing". Voltage is DC or AC peak between the two conductors; the table is a
 * step function of the voltage band, and above 500 V the per-volt increment of the bottom row is added
 * to the 301–500 V value for every volt above 500 V (Altair's worked example of the rule: B1 at 600 V →
 * 0.25 mm + 100 V × 0.0025 mm/V = 0.50 mm).
 *
 * Transcription check (every cell): the full table as published in the Altair PollEx "IPC Material"
 * reference (help.altair.com, §6.3 Table 6-1, B1–B4 and A5–A7), compared cell by cell with the Sierra
 * Circuits (protoexpress.com) bare-board / assembly tables. They agree except two cells where Sierra
 * shows 6.4 mm for B3 at 151–170 V and 0.025 mm/V for B1 above 500 V; the Altair copy, its 600 V worked
 * example and the KiCad pcb_calculator table give 3.2 mm and 0.0025 mm/V, used here.
 *
 * Columns (IPC-2221B):
 *   B1 internal conductors (any elevation)
 *   B2 external conductors, uncoated, sea level to 3050 m
 *   B3 external conductors, uncoated, above 3050 m
 *   B4 external conductors with a permanent polymer coating (solder mask), any elevation
 *   A5 external conductors with conformal coating over the assembly, any elevation
 *   A6 external component lead / termination, uncoated, sea level to 3050 m
 *   A7 external component lead / termination with conformal coating, any elevation
 */

export type Column = 'B1' | 'B2' | 'B3' | 'B4' | 'A5' | 'A6' | 'A7';
export const COLUMNS: Column[] = ['B1', 'B2', 'B3', 'B4', 'A5', 'A6', 'A7'];

/** Upper end of each voltage band (V, DC or AC peak): 0–15, 16–30, 31–50, 51–100, 101–150, 151–170, 171–250, 251–300, 301–500. */
export const BAND_MAX = [15, 30, 50, 100, 150, 170, 250, 300, 500];

const MM = 1e-3;
/** Table 6-1 minimum spacing per band (m). */
export const TABLE: Record<Column, number[]> = {
  B1: [0.05, 0.05, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0.25].map((x) => x * MM),
  B2: [0.1, 0.1, 0.6, 0.6, 0.6, 1.25, 1.25, 1.25, 2.5].map((x) => x * MM),
  B3: [0.1, 0.1, 0.6, 1.5, 3.2, 3.2, 6.4, 12.5, 12.5].map((x) => x * MM),
  B4: [0.05, 0.05, 0.13, 0.13, 0.4, 0.4, 0.4, 0.4, 0.8].map((x) => x * MM),
  A5: [0.13, 0.13, 0.13, 0.13, 0.4, 0.4, 0.4, 0.4, 0.8].map((x) => x * MM),
  A6: [0.13, 0.25, 0.4, 0.5, 0.8, 0.8, 0.8, 0.8, 1.5].map((x) => x * MM),
  A7: [0.13, 0.13, 0.13, 0.13, 0.4, 0.4, 0.4, 0.8, 0.8].map((x) => x * MM),
};
/** Bottom row: increment per volt above 500 V (m/V). */
export const PER_VOLT: Record<Column, number> = { B1: 0.0025 * MM, B2: 0.005 * MM, B3: 0.025 * MM, B4: 0.00305 * MM, A5: 0.00305 * MM, A6: 0.00305 * MM, A7: 0.00305 * MM };

export const COLUMN_TEXT: Record<Column, string> = {
  B1: 'Internal conductors',
  B2: 'External, uncoated, ≤ 3050 m',
  B3: 'External, uncoated, > 3050 m',
  B4: 'External, polymer coating (solder mask)',
  A5: 'External, conformal coat over assembly',
  A6: 'Component leads, uncoated, ≤ 3050 m',
  A7: 'Component leads, conformal coat',
};

/** Altitude above which the uncoated external columns change (B2 → B3; A6 has no value above it). */
export const ALT_LIMIT = 3050;

/** Index of the band a peak voltage falls in (0…8), or 9 above 500 V. Bands are read with their upper end inclusive. */
export function bandOf(v: number): number {
  const i = BAND_MAX.findIndex((u) => v <= u);
  return i < 0 ? 9 : i;
}

/** Minimum spacing (m) for a peak voltage in one column. */
export function minSpacing(col: Column, v: number): number {
  const b = bandOf(v);
  const row = TABLE[col];
  return b < 9 ? row[b] : row[8] + (v - 500) * PER_VOLT[col];
}

/**
 * Highest peak voltage (V) a spacing d (m) is rated for in one column: the top of the highest band whose
 * value d meets, or the continuous >500 V rule. null when d is below the smallest value in the column.
 */
export function maxVoltage(col: Column, d: number): number | null {
  const row = TABLE[col];
  const tol = 1e-12; // d typed as exactly a table value (0.6 mm) must meet that value despite rounding
  if (d >= row[8] - tol) return 500 + Math.max(d - row[8], 0) / PER_VOLT[col];
  let best: number | null = null;
  for (let i = 0; i < 9; i++) if (row[i] <= d + tol) best = BAND_MAX[i];
  return best;
}

/** Band label for a peak voltage, e.g. "151–170 V" or "> 500 V". */
export function bandLabel(v: number): string {
  const b = bandOf(v);
  if (b === 9) return '> 500 V';
  const lo = b === 0 ? 0 : BAND_MAX[b - 1] + 1;
  return `${lo}–${BAND_MAX[b]} V`;
}
