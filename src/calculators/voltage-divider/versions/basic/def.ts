/**
 * Voltage Divider, Basic version — calculator definition. DOM-free.
 *
 * A separate calculator reached from the version menu of power/voltage-divider (style guide §13a).
 * It is self-contained on purpose: it imports only core/, never the Standard version's files, so
 * changes to the Standard divider can never change this one.
 *
 *   Vin ── R1 ──┬── Vout
 *               R2
 *   GND ────────┴──
 */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';

export const ID = 'power/voltage-divider@basic';

export interface BasicDividerState {
  solveFor: 'vout' | 'vin' | 'r1' | 'r2';
  vin: number;
  vout: number;
  r1: number;
  r1Unit: string;
  r2: number;
  r2Unit: string;
}

export const defaults = (): BasicDividerState => ({
  solveFor: 'vout',
  vin: 12,
  vout: 3,
  r1: 30e3,
  r1Unit: 'kΩ',
  r2: 10e3,
  r2Unit: 'kΩ',
});

const U_R = { ...withDefault(U_OHM, 'kΩ'), 'GΩ': 1e9 };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Divider',
    note: 'Click ◎ to choose the unknown. Vout is measured across R₂, with nothing connected to it.',
    fields: [
      { kind: 'number', key: 'vin', symbol: 'V_in', label: 'Input voltage', unit: 'V', solvable: true, min: -1e6, max: 1e6, help: 'Voltage across the whole divider. Negative values work too: Vout then has the same sign.' },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output voltage', unit: 'V', solvable: true, min: -1e6, max: 1e6, help: 'Unloaded voltage across R₂.' },
      { kind: 'number', key: 'r1', symbol: 'R₁', label: 'Top resistor', units: U_R, unitKey: 'r1Unit', solvable: true, min: 1e-3, max: 1e12 },
      { kind: 'number', key: 'r2', symbol: 'R₂', label: 'Bottom resistor', units: U_R, unitKey: 'r2Unit', solvable: true, min: 1e-3, max: 1e12 },
    ],
  },
];

const LABEL: Record<BasicDividerState['solveFor'], string> = { vout: 'Output voltage', vin: 'Input voltage', r1: 'Top resistor', r2: 'Bottom resistor' };
const SYM: Record<BasicDividerState['solveFor'], string> = { vout: 'V_out', vin: 'V_in', r1: 'R₁', r2: 'R₂' };

const fV = (v: number, d = 4) => si(v, 'V', d);
const fR = (r: number, d = 4) => si(r, 'Ω', d);

/** Unloaded divider output */
export const vOut = (vin: number, r1: number, r2: number): number => (vin * r2) / (r1 + r2);

function fail(msg: string, s: BasicDividerState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: BasicDividerState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: BasicDividerState): CalcReport {
  const s: BasicDividerState = { ...st };
  const need = (k: BasicDividerState['solveFor']) => (s.solveFor === k ? 0 : finite(LABEL[k], s[k]));
  const vin = need('vin');
  const vout = need('vout');
  const r1 = need('r1');
  const r2 = need('r2');
  if (s.solveFor !== 'r1' && !(r1 > 0)) throw new Error('R₁ must be > 0.');
  if (s.solveFor !== 'r2' && !(r2 > 0)) throw new Error('R₂ must be > 0.');

  switch (s.solveFor) {
    case 'vout':
      s.vout = vOut(vin, r1, r2);
      break;
    case 'vin':
      if (vout === 0) return fail('Vout = 0 V gives no information about Vin. Enter a non-zero output voltage.', s);
      s.vin = (vout * (r1 + r2)) / r2;
      break;
    case 'r1':
    case 'r2': {
      if (vin === 0) return fail('Vin = 0 V: every divider gives 0 V. Enter a non-zero input voltage.', s);
      const k = vout / vin;
      if (!(k > 0 && k < 1)) return fail(`A resistive divider can only give 0 < Vout/Vin < 1 (same sign as Vin, smaller in magnitude); Vout/Vin = ${k.toPrecision(4)}.`, s);
      if (s.solveFor === 'r1') s.r1 = r2 * (1 / k - 1);
      else s.r2 = (r1 * k) / (1 - k);
      break;
    }
    default:
      throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }

  const i = s.vin / (s.r1 + s.r2);
  const ratio = s.r2 / (s.r1 + s.r2);
  const rth = (s.r1 * s.r2) / (s.r1 + s.r2);
  const solved = s.solveFor;
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const isR = solved === 'r1' || solved === 'r2';

  const report: CalcReport = { ...emptyReport(ID), solveFor: solved };
  report.results = [
    item(solved, LABEL[solved], s[solved], isR ? 'Ω' : 'V', isR ? fR(s[solved]) : fV(s[solved], 5), { symbol: SYM[solved], solved: true, primary: true }),
    item('ratio', 'Division ratio', ratio, '', ratio.toPrecision(5), { symbol: 'Vout/Vin', primary: true }),
    item('i', 'Current', i, 'A', si(i, 'A', 3), { symbol: 'I', group: 'Divider', note: 'through R₁ and R₂' }),
    item('rth', 'Output resistance', rth, 'Ω', fR(rth), { symbol: 'R_th', group: 'Divider', note: 'R₁ ∥ R₂' }),
    item('p1', 'Power in R₁', i * i * s.r1, 'W', si(i * i * s.r1, 'W', 3), { symbol: 'P₁', group: 'Divider' }),
    item('p2', 'Power in R₂', i * i * s.r2, 'W', si(i * i * s.r2, 'W', 3), { symbol: 'P₂', group: 'Divider' }),
  ];
  report.summary = `${fV(s.vin)} → ${fV(s.vout)} · ${fR(s.r1, 3)} / ${fR(s.r2, 3)}`;
  report.notes.push('Ideal resistors and no load. The Standard version adds a load, standard-value pairs and tolerance.');
  report.details = { vin: s.vin, vout: s.vout, r1: s.r1, r2: s.r2, ratio, i, rth };
  report.graphs = [graph(s)];
  return report;
}

/** Vout as R₂ sweeps two decades either side of its value, R₁ and Vin held. */
function graph(s: BasicDividerState): GraphSpec {
  const n = 161;
  const xs = Array.from({ length: n }, (_, k) => s.r2 * 10 ** (-2 + (4 * k) / (n - 1)));
  return {
    id: 'vout-vs-r2',
    title: 'Vout vs R₂',
    x: { label: 'Bottom resistor R₂', unit: 'Ω', log: true },
    y: [{ id: 'v', label: 'Vout', unit: 'V', includeZero: true }],
    series: [{ label: `Vout (R₁ = ${fR(s.r1, 3)})`, x: xs, y: xs.map((r) => vOut(s.vin, s.r1, r)), axis: 'v', width: 2.2 }],
    hlines: [{ value: s.vin, label: `Vin ${fV(s.vin)}`, axis: 'v', color: '#9a8f7a', dash: [3, 3] }],
    markers: [{ x: s.r2, y: s.vout, axis: 'v', label: fV(s.vout, 3) }],
  };
}

export const def: CalcDef<BasicDividerState> = {
  id: ID,
  version: '0.1.0',
  method: 'Unloaded two-resistor divider, Vout = Vin·R₂/(R₁+R₂), with the exact inverse for each unknown.',
  fields,
  defaults,
  solve: {
    default: 'vout',
    analysis: 'vout',
    options: [
      { key: 'vout', label: 'Vout from Vin, R₁, R₂ (analysis)' },
      { key: 'r1', label: 'R₁ for a target Vout' },
      { key: 'r2', label: 'R₂ for a target Vout' },
      { key: 'vin', label: 'Vin that gives Vout' },
    ],
  },
  compute,
  examples: [
    { id: 'thirty-ten', label: '12 V across 30k / 10k', state: defaults() },
    { id: 'level-5v-3v3', label: '5 V → 3.3 V with R₁ = 1 kΩ (solve R₂)', state: { solveFor: 'r2', vin: 5, vout: 3.3, r1: 1e3 } },
  ],
};
