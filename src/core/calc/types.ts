/**
 * The calculator contract. Every calculator is split in two:
 *
 *   CalcDef  — pure, DOM-free: inputs (as a form spec), defaults, and `compute(state) → CalcReport`.
 *              The UI, the AI API (window.eeCalc / WebMCP) and the unit tests all call this same code,
 *              so what an agent reads back is exactly what the page shows.
 *   view     — optional page hooks (extra tabs, custom graphs, schematic) built on the standard page.
 *
 * State is plain JSON in SI units. Unit dropdown choices live in the state too (`…Unit` keys)
 * so a saved / shared state reproduces the page exactly.
 */

import type { FieldSpec } from '@/core/form/form';
import type { TheorySection } from '@/core/ui/theory';

export type Tone = 'pass' | 'fail' | 'warn' | 'muted' | 'accent' | 'solved' | '';

/** One headline result. `value` is SI (or a string / boolean for non-numeric results). */
export interface ResultItem {
  key: string;
  label: string;
  /** Equation symbol, e.g. "Z₀", "εeff" */
  symbol?: string;
  value: number | string | boolean | null;
  /** SI unit of `value` ("Ω", "s/m", "dB", "" for ratios) */
  unit?: string;
  /** Human formatted value, e.g. "50.2 Ω" */
  display: string;
  tone?: Tone;
  /** Short explanation shown under the value */
  note?: string;
  /** Group heading in the Results tab */
  group?: string;
  /** Big card in the Results tab and a chip in the headline */
  primary?: boolean;
  /** True when this is the solved-for unknown */
  solved?: boolean;
}

export interface GraphAxis {
  id: string;
  label: string;
  unit: string;
  side?: 'left' | 'right';
  log?: boolean;
  includeZero?: boolean;
  /** false hides the darker zero line this axis gets on a linear scale (when 0 is arbitrary) */
  zeroLine?: boolean;
  min?: number;
  max?: number;
}

export interface GraphSeries {
  label: string;
  x: number[];
  y: number[];
  axis?: string;
  color?: string;
  width?: number;
  dash?: number[];
  noReadout?: boolean;
}

export interface GraphRef {
  value: number;
  label: string;
  axis?: string;
  color?: string;
  dash?: number[];
  width?: number;
}

export interface GraphMarker {
  x: number;
  y: number;
  axis?: string;
  label?: string;
  color?: string;
}

/** Points on a Smith chart: normalised reflection coefficient Γ = re + j·im. */
export interface SmithTrace {
  label: string;
  re: number[];
  im: number[];
  color?: string;
  width?: number;
  dash?: number[];
}

export interface SmithPoint {
  re: number;
  im: number;
  label: string;
  color?: string;
  /** Set to make the point draggable; CalcDef.onDrag receives this id. */
  dragId?: string;
}

export interface GraphSpec {
  id: string;
  title: string;
  /** 'xy' (default): line plot. 'smith': normalised Smith chart. */
  kind?: 'xy' | 'smith';
  subtitle?: string;
  x?: { label: string; unit: string; log?: boolean; integer?: boolean; zeroLine?: boolean };
  y?: GraphAxis[];
  series?: GraphSeries[];
  hlines?: GraphRef[];
  vlines?: GraphRef[];
  markers?: GraphMarker[];
  xRange?: [number, number];
  /** 'below': legend under the plot area, for graphs whose traces fill the whole frame */
  legend?: 'inside' | 'below';
  /** Smith chart content. `admittance`: show the admittance grid by default (the user can switch Z / Y / Z+Y). */
  smith?: { z0: number; traces: SmithTrace[]; points: SmithPoint[]; admittance?: boolean };
  /** Id of another graph in the report drawn beside this one (that graph then gets no tab of its own). */
  beside?: string;
}

export interface TableSpec {
  id: string;
  title: string;
  columns: { key: string; label: string; unit?: string; align?: 'left' | 'right' }[];
  /** Raw values (SI numbers or strings) — what the API returns */
  rows: Record<string, number | string | null>[];
  /** Pre-formatted cell text for the UI (same shape as rows) */
  display?: Record<string, string>[];
  note?: string;
  /**
   * Verdict per row, for tables whose rows are candidate solutions or are each judged against a limit:
   * 'pass' works, 'warn' works but is close to a limit, 'fail' does not work. Leave unset otherwise.
   */
  rowTones?: ('pass' | 'warn' | 'fail' | '')[];
}

export interface CalcReport {
  calc: string;
  /** False when the inputs could not be evaluated (error is then set) */
  ok: boolean;
  error?: string;
  status?: { text: string; tone: Tone };
  /** Key of the solved-for unknown, when the calculator supports solve-for-X */
  solveFor?: string;
  results: ResultItem[];
  graphs: GraphSpec[];
  tables: TableSpec[];
  warnings: string[];
  notes: string[];
  /** Short one-line summary under the headline chips */
  summary?: string;
  /** Intermediate / underlying values not normally shown (for agents and debugging) */
  details?: Record<string, unknown>;
}

export interface SolveOption {
  /** State key of the variable that becomes the unknown */
  key: string;
  label: string;
}

export interface CalcDef<S extends Record<string, any> = Record<string, any>> {
  id: string;
  /** This calculator's version (SemVer, see src/app/version.ts); bump it with every change and log it in NOTES.md */
  version: string;
  /** Short description of the method, shown to agents in describe() */
  method?: string;
  fields: FieldSpec[];
  defaults(): S;
  /** Merge a saved / partial state over defaults (migrations, missing keys) */
  load?(raw: unknown): S;
  /** Solve-for-X: which state keys may be the unknown. The current choice is state.solveFor. */
  solve?: {
    options: SolveOption[];
    default: string;
    /**
     * The forward-analysis option (computes from the entered parts, needs no target). When a setting
     * switch makes the current solve impossible, the page falls back to it instead of a red error.
     */
    analysis?: string | ((state: S) => string);
  };
  compute(state: S): CalcReport;
  /** Extra settable top-level keys that are not form fields (e.g. which list item to solve for) */
  controls?: Record<string, (raw: unknown, state: S) => unknown>;
  /** Keep dependent inputs consistent before computing (e.g. a preset label after a manual edit). */
  sync?(state: S): void;
  /**
   * A draggable graph point (SmithPoint.dragId) was moved by the user. Mutate state so the next compute
   * puts the point at `at` (for a Smith chart: the reflection coefficient Γ = re + j·im).
   */
  onDrag?(state: S, graphId: string, dragId: string, at: { re: number; im: number }): void;
  /** Named example states (worked examples) */
  examples?: { id: string; label: string; state: Partial<S> }[];
}

export interface TheoryContent {
  intro: { title: string; lead: string };
  sections: TheorySection[];
}

export function emptyReport(calc: string): CalcReport {
  return { calc, ok: true, results: [], graphs: [], tables: [], warnings: [], notes: [] };
}

export function errorReport(calc: string, err: unknown): CalcReport {
  return { ...emptyReport(calc), ok: false, error: String((err as Error)?.message ?? err), status: { text: 'INPUT ERROR', tone: 'warn' } };
}
