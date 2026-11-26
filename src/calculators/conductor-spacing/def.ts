/** Minimum conductor spacing (IPC-2221B Table 6-1) — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSeries, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB } from '@/core/unitsets';
import { ALT_LIMIT, BAND_MAX, COLUMNS, COLUMN_TEXT, PER_VOLT, TABLE, type Column, bandLabel, bandOf, maxVoltage, minSpacing } from './model';

export const ID = 'pcb/minimum-conductor-spacing';

/** What the user picks; B3 is not a choice of its own but B2 above 3050 m. */
export type Condition = 'B1' | 'B2' | 'B4' | 'A5' | 'A6' | 'A7';

export interface SpacingState {
  solveFor: 'd' | 'v';
  v: number;
  vKind: 'peak' | 'rms';
  d: number;
  dUnit: string;
  cond: Condition;
  alt: number;
  altUnit: string;
}

export const defaults = (): SpacingState => ({
  solveFor: 'd',
  v: 100,
  vKind: 'peak',
  d: 0.6e-3,
  dUnit: 'mm',
  cond: 'B2',
  alt: 0,
  altUnit: 'm',
});

const V_MAX = 1e6;
const D_MAX = 50; // B3 at 1 MV RMS (1.41 MV peak) needs 35 m
const U_ALT: Record<string, number> = { m: 1, km: 1e3, ft: 0.3048 };

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'B1', label: 'B1 · Internal layer' },
  { value: 'B2', label: 'B2/B3 · External, uncoated' },
  { value: 'B4', label: 'B4 · External, solder mask / polymer coat' },
  { value: 'A5', label: 'A5 · External, conformal coat' },
  { value: 'A6', label: 'A6 · Component leads, uncoated' },
  { value: 'A7', label: 'A7 · Component leads, conformal coat' },
];

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Voltage & spacing',
    fields: [
      { kind: 'number', key: 'v', symbol: 'V', label: 'Voltage between them', unit: 'V', solvable: true, min: 0, max: V_MAX, help: 'Largest voltage difference between the two conductors: DC, or the peak of AC (choose RMS below to enter a sine RMS value). Click ◎ to find the highest voltage the spacing is rated for.' },
      {
        kind: 'select',
        key: 'vKind',
        label: 'Voltage given as',
        options: [{ value: 'peak', label: 'DC or AC peak' }, { value: 'rms', label: 'AC RMS (sine, × √2)' }],
        help: 'Table 6-1 is indexed by DC or AC peak voltage. An RMS value is converted with √2, which is right for a sine only; for other waveforms enter the true peak.',
      },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Conductor spacing', units: U_LEN_PCB, unitKey: 'dUnit', solvable: true, min: 1e-6, max: D_MAX, help: 'Edge-to-edge clearance between the two conductors. Solved: the minimum Table 6-1 allows. Given: the spacing in your layout, when solving for the voltage.' },
    ],
  },
  {
    kind: 'section',
    title: 'Where the conductors are',
    fields: [
      {
        kind: 'select',
        key: 'cond',
        label: 'Condition',
        options: CONDITIONS,
        help: 'IPC-2221B column. Internal conductors are protected by laminate; external ones by solder mask (a permanent polymer coat, B4), by a conformal coat over the finished assembly (A5), or not at all (B2/B3). A6/A7 are component leads and terminations, which are never under mask.',
      },
      { kind: 'number', key: 'alt', symbol: 'h', label: 'Operating altitude', units: U_ALT, unitKey: 'altUnit', unitFamily: 'none', min: 0, max: 30e3, help: 'Air breaks down at lower voltages in thin air. Above 3050 m (10 000 ft) uncoated external conductors move from column B2 to B3; the coated and internal columns apply at any elevation.' },
    ],
  },
];

/** Effective column(s): B2 → B3 above 3050 m; uncoated leads above 3050 m have no column (A6 and B3 both applied). */
export function columnsFor(s: Pick<SpacingState, 'cond' | 'alt'>): Column[] {
  const high = s.alt > ALT_LIMIT;
  if (s.cond === 'B2') return [high ? 'B3' : 'B2'];
  if (s.cond === 'A6' && high) return ['A6', 'B3'];
  return [s.cond];
}

const dmin = (cols: Column[], vp: number) => Math.max(...cols.map((c) => minSpacing(c, vp)));
function vmax(cols: Column[], d: number): number | null {
  let best = Infinity;
  for (const c of cols) {
    const v = maxVoltage(c, d);
    if (v == null) return null;
    best = Math.min(best, v);
  }
  return best;
}

const fd = (m: number) => si(m, 'm', 4);
const fv = (v: number) => si(v, 'V', 4);

export function compute(st: SpacingState): CalcReport {
  for (const k of ['v', 'd', 'alt'] as const) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (st.solveFor !== 'v' && !(st.v >= 0)) throw new Error('Voltage must be ≥ 0.');
  if (st.solveFor !== 'd' && !(st.d > 0)) throw new Error('Spacing must be > 0.');
  if (!(st.alt >= 0)) throw new Error('Altitude must be ≥ 0.');
  if (!CONDITIONS.some((c) => c.value === st.cond)) throw new Error(`Unknown condition ${st.cond}.`);
  const s: SpacingState = { ...st };
  const k = s.vKind === 'rms' ? Math.SQRT2 : 1;
  const cols = columnsFor(s);
  const colName = cols.length > 1 ? 'A6 + B3' : cols[0];
  const warnings: string[] = [];
  const notes: string[] = [];

  if (s.solveFor === 'v') {
    const vp = vmax(cols, s.d);
    if (vp == null) {
      const smallest = Math.max(...cols.map((c) => TABLE[c][0]));
      return { ...emptyReport(ID), ok: false, solveFor: 'v', status: { text: 'NO SOLUTION', tone: 'fail' }, error: `d = ${fd(s.d)} is below the smallest ${colName} spacing (${fd(smallest)}, for 0–15 V): no voltage is allowed. Widen the gap or pick a better-protected condition.` };
    }
    if (vp / k > V_MAX) return { ...emptyReport(ID), ok: false, solveFor: 'v', status: { text: 'NO SOLUTION', tone: 'fail' }, error: `d = ${fd(s.d)} is rated above ${fv(V_MAX)} in column ${colName}, beyond this page’s voltage range. Enter a smaller spacing.` };
    s.v = vp / k;
  }
  const vPeak = s.v * k;
  const need = dmin(cols, vPeak);
  if (s.solveFor === 'd') s.d = need;

  if (s.cond === 'A6' && s.alt > ALT_LIMIT) {
    warnings.push(`IPC-2221B gives no spacing for uncoated component leads above ${ALT_LIMIT} m. This page applies the larger of A6 and B3 (bare external conductors at altitude) as a conservative stand-in, not an IPC value: conformal-coat the leads (A7) to be inside the table.`);
  }
  if (s.alt > ALT_LIMIT && (s.cond === 'B1' || s.cond === 'B4' || s.cond === 'A5' || s.cond === 'A7')) notes.push(`Column ${s.cond} applies at any elevation: the ${si(s.alt, 'm', 3)} altitude does not change it (it only moves uncoated external conductors to B3).`);
  if (s.solveFor === 'v' && s.vKind === 'rms') notes.push('Maximum voltage shown as a sine RMS value (peak ÷ √2).');
  if (vPeak > 500) notes.push(`Above 500 V: d = d(301–500 V) + (V − 500 V) × the per-volt increment of the column (${cols.map((c) => `${c} ${(PER_VOLT[c] * 1e3).toPrecision(3)} mm/V`).join(', ')}).`);
  if (s.cond === 'B4') notes.push('B4 holds only where the mask covers both conductors and the gap between them without openings; a mask-defined pad, an untented via or a scratch in the gap puts that spot back in B2/B3.');
  notes.push(
    'Table 6-1 is read as a step function of the voltage band (each band including its upper end, e.g. 15 V is in 0–15 V); there is no interpolation inside a band.',
    'IPC-2221B spacing is a functional design rule for clean boards. Mains-connected or safety-isolated circuits must meet the creepage and clearance of their safety standard (IEC 62368-1, IEC 60664-1, UL), which are usually much larger.',
  );

  const band = bandLabel(vPeak);
  const solvedV = s.solveFor === 'v';
  const item = (key: string, label: string, value: number | string, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const dCard = item('d', solvedV ? 'Conductor spacing' : 'Minimum spacing', s.d, 'm', fd(s.d), { symbol: 'd', note: `${(s.d / 25.4e-6).toPrecision(4)} mil${solvedV ? ' · given' : ` · ${colName} at ${band}`}` });
  const vCard = item('v', solvedV ? 'Maximum voltage' : 'Voltage', s.v, 'V', `${fv(s.v)}${s.vKind === 'rms' ? ' RMS' : ''}`, { symbol: 'V', note: s.vKind === 'rms' ? `${fv(vPeak)} peak` : 'DC or AC peak' });
  const colCard = item('column', 'IPC-2221B column', colName, '', colName, { primary: true, note: cols.map((c) => COLUMN_TEXT[c]).join(' & ') });
  const primary: ResultItem[] = solvedV
    ? [{ ...vCard, primary: true, solved: true }, item('dmin', 'Spacing needed at V', need, 'm', fd(need), { symbol: 'd_min', primary: true, note: `${band} · given d = ${fd(s.d)}` }), colCard]
    : [{ ...dCard, primary: true, solved: true }, item('vPeak', 'Peak voltage', vPeak, 'V', fv(vPeak), { symbol: 'V_pk', primary: true, note: `band ${band}` }), colCard];
  const perVolt = Math.max(...cols.map((c) => PER_VOLT[c]));
  const base500 = Math.max(...cols.map((c) => TABLE[c][8]));
  const details: ResultItem[] = [
    item('band', 'Voltage band', band, '', band, { group: 'Table 6-1' }),
    item('bandValue', vPeak > 500 ? 'Value at 301–500 V' : 'Value for this band', vPeak > 500 ? base500 : need, 'm', fd(vPeak > 500 ? base500 : need), { group: 'Table 6-1' }),
    item('perVolt', 'Increment above 500 V', perVolt, 'm/V', `${(perVolt * 1e6).toPrecision(3)} µm/V`, { group: 'Table 6-1' }),
    item('margin', 'Spacing ÷ minimum', s.d / need, '', `${(s.d / need).toFixed(3)} ×`, { group: 'Check' }),
    item('dMil', 'Spacing', s.d / 25.4e-6, 'mil', `${(s.d / 25.4e-6).toPrecision(4)} mil`, { group: 'Check' }),
    { ...(solvedV ? dCard : vCard), group: 'Check' },
  ];
  if (solvedV) details.unshift(item('vPeak', 'Peak voltage', vPeak, 'V', fv(vPeak), { symbol: 'V_pk', group: 'Table 6-1' }));
  const report: CalcReport = { calc: ID, ok: true, solveFor: s.solveFor, results: [...primary, ...details], graphs: [], tables: [], warnings, notes };
  report.summary = `${colName} · ${band} → d ≥ ${fd(need)}${solvedV ? ` · ${fd(s.d)} rated to ${fv(vPeak)} peak` : ''}${s.alt > 0 ? ` · ${si(s.alt, 'm', 3)} altitude` : ''}`;
  report.tables = [allColumns(s, vPeak)];
  report.graphs = [graph(s, cols, vPeak)];
  report.details = { columns: cols, vPeak, band: bandOf(vPeak), dmin: need };
  return report;
}

/** Every column at this voltage, each judged against the spacing on the page. */
function allColumns(s: SpacingState, vPeak: number): TableSpec {
  const rows = COLUMNS.map((c) => ({ col: c, what: COLUMN_TEXT[c], dmin: minSpacing(c, vPeak), vmax: maxVoltage(c, s.d) }));
  return {
    id: 'columns',
    title: `All Table 6-1 columns at ${fv(vPeak)} peak`,
    columns: [
      { key: 'col', label: 'Column', align: 'left' },
      { key: 'what', label: 'Condition', align: 'left' },
      { key: 'dmin', label: 'Minimum spacing', unit: 'm' },
      { key: 'vmax', label: `Max. peak V at d = ${fd(s.d)}`, unit: 'V' },
    ],
    rows,
    display: rows.map((r) => ({ col: r.col, what: r.what, dmin: fd(r.dmin), vmax: r.vmax == null ? 'none' : fv(r.vmax) })),
    rowTones: rows.map((r) => (s.d >= r.dmin * (1 - 1e-12) ? 'pass' : 'fail')),
    note: `Green: d = ${fd(s.d)} meets the column at this voltage; red: it does not. B3 replaces B2 above ${ALT_LIMIT} m; A6 has no value above ${ALT_LIMIT} m.`,
  };
}

function stairs(col: Column, x0: number, x1: number): { x: number[]; y: number[] } {
  const x: number[] = [x0];
  const y: number[] = [minSpacing(col, x0)];
  for (let i = 0; i < BAND_MAX.length; i++) {
    const e = BAND_MAX[i];
    if (e <= x0) continue;
    if (e >= x1) break;
    x.push(e, e * (1 + 1e-9));
    y.push(minSpacing(col, e), minSpacing(col, e * (1 + 1e-9)));
  }
  if (x1 > 500) for (let i = 1; i <= 40; i++) {
    const v = Math.max(500, x0) * (x1 / Math.max(500, x0)) ** (i / 40);
    x.push(v);
    y.push(minSpacing(col, v));
  }
  else {
    x.push(x1);
    y.push(minSpacing(col, x1));
  }
  return { x, y };
}

function graph(s: SpacingState, cols: Column[], vPeak: number): GraphSpec {
  const x0 = Math.min(1, Math.max(vPeak / 2, 0.1));
  const x1 = Math.max(1000, vPeak * 3);
  const high = s.alt > ALT_LIMIT;
  const show: { c: Column; label: string; color?: string; width: number; dash?: number[] }[] = cols.map((c) => ({ c, label: `${c} (this board)`, width: 2.4, color: '#1f4e5f' }));
  if (cols.length > 1) show[1].color = '#6b5b95';
  const ref: Column = high ? 'B3' : 'B2';
  if (!cols.includes(ref)) show.push({ c: ref, label: `${ref} external, uncoated`, width: 1.3, color: '#c47b17', dash: [5, 3] });
  if (!cols.includes('B1')) show.push({ c: 'B1', label: 'B1 internal', width: 1.3, color: '#4f8a8b', dash: [2, 3] });
  const series: GraphSeries[] = show.map((o) => ({ label: o.label, ...stairs(o.c, x0, x1), color: o.color, width: o.width, dash: o.dash }));
  return {
    id: 'dmin-vs-v',
    title: 'Minimum spacing vs voltage',
    x: { label: 'Peak voltage', unit: 'V', log: true },
    y: [{ id: 'd', label: 'Minimum spacing', unit: 'm', log: true }],
    series,
    vlines: [{ value: vPeak, label: `${fv(vPeak)} pk`, color: '#9a8f7a' }],
    hlines: s.solveFor === 'v' ? [{ value: s.d, label: `d = ${fd(s.d)}`, color: '#9a8f7a', dash: [3, 3] }] : [],
    markers: [{ x: vPeak, y: dmin(cols, vPeak), label: fd(dmin(cols, vPeak)) }],
  };
}

export const def: CalcDef<SpacingState> = {
  id: ID,
  version: '0.1.0',
  method: 'IPC-2221B (2012) Table 6-1 electrical conductor spacing, columns B1–B4 and A5–A7, read as a step function of the DC/peak voltage band with the per-volt increment added above 500 V; B2 becomes B3 above 3050 m. Transcribed from the Altair PollEx Table 6-1 reference and checked cell by cell against the Sierra Circuits and KiCad copies. Maximum voltage: the top of the highest band (or the continuous >500 V rule) the spacing satisfies.',
  fields,
  defaults,
  // Mode-switch harness notes (reviewed):
  //  • roundtrip flags are expected: Table 6-1 is a staircase, so the maximum voltage for a spacing is the top
  //    of a band (0.6 mm on B2 → 150 V, not the 100 V typed), and in the V mode the spacing is the layout's,
  //    larger than the minimum the table needs at that voltage;
  //  • error-after-edit flags come from typed extremes (a 1 µm gap allows no voltage; a 50 m gap is rated
  //    beyond 1 MV): the user asked for exactly that, and the message says what limits it;
  //  • "unreadable" for a solved metre-scale spacing shown in mil: mil has no prefixed forms to move to.
  solve: {
    default: 'd',
    analysis: 'd',
    options: [
      { key: 'd', label: 'Minimum spacing d for a voltage' },
      { key: 'v', label: 'Maximum voltage V for a spacing' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '100 V DC, outer layer without mask (B2)', state: { ...defaults() } },
    { id: 'mains-rms', label: '230 V AC mains on an uncoated outer layer', state: { ...defaults(), solveFor: 'd', v: 230, vKind: 'rms', cond: 'B2', alt: 0, altUnit: 'm' } },
    { id: 'mask-48v', label: '48 V bus under solder mask (B4)', state: { ...defaults(), solveFor: 'd', v: 48, vKind: 'peak', cond: 'B4', alt: 0, altUnit: 'm' } },
    { id: 'altitude', label: 'Max voltage for 1 mm at 10 000 m (B3)', state: { ...defaults(), solveFor: 'v', d: 1e-3, dUnit: 'mm', vKind: 'peak', cond: 'B2', alt: 10e3, altUnit: 'm' } },
    { id: 'hv-inner', label: '1 kV between inner-layer conductors (B1, per-volt rule)', state: { ...defaults(), solveFor: 'd', v: 1000, vKind: 'peak', cond: 'B1', alt: 0, altUnit: 'm' } },
    { id: 'leads-coated', label: 'Max voltage across 0.5 mm coated leads (A7)', state: { ...defaults(), solveFor: 'v', d: 0.5e-3, dUnit: 'mm', vKind: 'peak', cond: 'A7', alt: 0, altUnit: 'm' } },
  ],
};
