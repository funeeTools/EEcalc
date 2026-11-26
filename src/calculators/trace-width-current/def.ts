/** PCB trace width vs current (IPC-2221) — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN, U_LEN_PCB, U_THICK, withDefault } from '@/core/unitsets';
import { type Layer, MIL2, ipcCurrent, kOf, traceDc } from './model';

export type TraceSolve = 'w' | 'i' | 'dT';

export interface TraceState {
  solveFor: TraceSolve;
  i: number;
  w: number;
  wUnit: string;
  dT: number;
  layer: Layer;
  t: number;
  tUnit: string;
  ta: number;
  len: number;
  lenUnit: string;
}

const OZ = 34.79e-6; // U_THICK's "oz" (1 oz/ft² ≈ 1.37 mil)

export const defaults = (): TraceState => ({
  solveFor: 'w',
  i: 3,
  w: 1.5e-3,
  wUnit: 'mm',
  dT: 10,
  layer: 'external',
  t: OZ,
  tUnit: 'oz',
  ta: 25,
  len: 50e-3,
  lenUnit: 'mm',
});

const MIL = 25.4e-6;
/** IPC-2221 Fig. 6-4 chart span: ΔT curves 10–100 °C, up to 35 A (external), 700 mil², widths to 400 mil, ½–3 oz copper. */
const CHART = { dTmin: 10, dTmax: 100, iMaxExt: 35, areaMax: 700 * MIL2, wMax: 400 * MIL, tMin: 0.5 * OZ, tMax: 3 * OZ };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Trace',
    fields: [
      { kind: 'number', key: 'i', symbol: 'I', label: 'Current', unit: 'A', solvable: true, min: 1e-6, max: 1e5, help: 'Continuous (DC or RMS) current in the trace.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: 1e-6, max: 1 },
      { kind: 'number', key: 'dT', symbol: 'ΔT', label: 'Temperature rise', suffix: '°C', solvable: true, min: 0.01, max: 500, help: 'Allowed rise of the conductor above ambient. 10 °C is a common conservative choice; IPC-2221 charts cover 10–100 °C.' },
      { kind: 'select', key: 'layer', label: 'Layer', options: [{ value: 'external', label: 'External (outer layer)' }, { value: 'internal', label: 'Internal (inner layer)' }], help: 'IPC-2221 derates internal conductors to half the external current (k = 0.024 vs 0.048). IPC-2152 later showed internal traces actually run cooler than that assumes.' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: withDefault(U_THICK, 'oz'), unitKey: 'tUnit', min: 1e-6, max: 1e-3, help: 'Finished copper thickness (“oz” = oz/ft², 1 oz ≈ 35 µm). Outer layers are usually plated up, so a 1 oz base foil often finishes thicker.' },
    ],
  },
  {
    kind: 'section',
    title: 'Resistance & losses',
    fields: [
      { kind: 'number', key: 'ta', symbol: 'T_A', label: 'Ambient temperature', suffix: '°C', min: -100, max: 300, help: 'Board/ambient temperature. The conductor runs at T_A + ΔT, which sets the copper resistivity.' },
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'Trace length', units: withDefault(U_LEN, 'mm'), unitKey: 'lenUnit', min: 0, max: 100 },
    ],
  },
];

const LABEL: Record<TraceSolve, string> = { w: 'Minimum trace width', i: 'Maximum current', dT: 'Temperature rise' };
/** Solve ranges equal the input fields' limits, so a solved value is always one the form accepts. */
const RANGE: Record<'w' | 'dT', { lo: number; hi: number }> = { w: { lo: 1e-6, hi: 1 }, dT: { lo: 0.01, hi: 500 } };

const fmtW = (w: number) => `${si(w, 'm', 4)} (${(w / MIL).toFixed(1)} mil)`;
const degC = (t: number, d = 1) => `${t.toFixed(d)} °C`;

export function compute(st: TraceState): CalcReport {
  for (const k of ['i', 'w', 'dT', 't', 'ta', 'len'] as const) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (st.layer !== 'external' && st.layer !== 'internal') throw new Error('Layer must be "external" or "internal".');
  const s: TraceState = { ...st };
  if (!(s.t > 0)) throw new Error('Copper thickness must be > 0.');
  if (s.solveFor !== 'i' && !(s.i > 0)) throw new Error('Current must be > 0.');
  if (s.solveFor !== 'w' && !(s.w > 0)) throw new Error('Trace width must be > 0.');
  if (s.solveFor !== 'dT' && !(s.dT > 0)) throw new Error('Temperature rise must be > 0.');
  if (s.len < 0) throw new Error('Length must be ≥ 0.');

  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'pcb/trace-width-current', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  // ── solve: one forward equation I(W·T, ΔT), inverted numerically
  if (s.solveFor !== 'i') {
    const key = s.solveFor;
    const g = (x: number) => ipcCurrent((key === 'w' ? x : s.w) * s.t, key === 'dT' ? x : s.dT, s.layer);
    const { lo, hi } = RANGE[key];
    // No width / ΔT in range: the solved box shows "—" (value null) and the state keeps the last answer, so a
    // round trip from such a state does not reproduce it (the mode-switch harness flags that; it is expected).
    const stop = (why: string, display: string, status: CalcReport['status']) => {
      report.warnings.push(why);
      report.status = status;
      report.results.push({ key, label: LABEL[key], value: null, display, primary: true, solved: true });
      return report;
    };
    // The IPC current rises with both width and ΔT: check the ends of the input range first.
    if (g(hi) < s.i) {
      if (key === 'w') return stop(`${si(s.i, 'A', 3)} at ΔT = ${degC(s.dT)} needs a trace wider than 1 m on this copper (1 m carries ${si(g(hi), 'A', 3)}). Use thicker copper, several layers in parallel, or a bus bar.`, '> 1 m', { text: 'NO SOLUTION', tone: 'fail' });
      return stop(`${si(s.i, 'A', 3)} would heat this trace by more than 500 °C (the input limit; 500 °C carries only ${si(g(hi), 'A', 3)}) — far outside the IPC-2221 charts, and the trace would burn or fuse. Widen it or use thicker copper.`, '> 500 °C', { text: 'NO SOLUTION', tone: 'fail' });
    }
    if (g(lo) > s.i) {
      if (key === 'w') return stop(`Even a 1 µm trace carries ${si(s.i, 'A', 3)} within ΔT = ${degC(s.dT)} by the IPC-2221 fit; current is not what sizes this trace (use the fabricator’s minimum width).`, '< 1 µm', { text: 'NOT LIMITING', tone: 'pass' });
      return stop(`The temperature rise is below 0.01 °C — negligible heating at ${si(s.i, 'A', 3)}.`, '< 0.01 °C', { text: 'NOT LIMITING', tone: 'pass' });
    }
    const r = invert(g, s.i, { lo, hi, log: true, samples: 80 });
    if (!r.ok) return stop(`No ${key === 'w' ? 'width' : 'temperature rise'} in range gives ${si(s.i, 'A', 3)}.`, '—', { text: 'NO SOLUTION', tone: 'fail' });
    s[key] = r.roots[0];
  } else s.i = ipcCurrent(s.w * s.t, s.dT, s.layer);

  const area = s.w * s.t;
  const areaMil2 = area / MIL2;
  const dc = traceDc(s.i, s.w, s.t, s.len, s.ta, s.dT);
  const other: Layer = s.layer === 'external' ? 'internal' : 'external';
  // width the same current would need on the other layer type (ratio of k: A ∝ k^(−1/0.725))
  const wOther = s.w * (kOf(s.layer) / kOf(other)) ** (1 / 0.725);

  // ── validity of the IPC-2221 fit (chart span)
  const outside: string[] = [];
  if (s.dT < CHART.dTmin - 1e-9 || s.dT > CHART.dTmax + 1e-9) outside.push(`ΔT = ${degC(s.dT)} (charts: 10–100 °C)`);
  const iMax = s.layer === 'external' ? CHART.iMaxExt : CHART.iMaxExt / 2;
  if (s.i > iMax * (1 + 1e-9)) outside.push(`I = ${si(s.i, 'A', 3)} (charts: up to ${iMax} A ${s.layer})`);
  if (area > CHART.areaMax * (1 + 1e-9)) outside.push(`A = ${areaMil2.toFixed(0)} mil² (charts: up to 700 mil²)`);
  if (s.w > CHART.wMax * (1 + 1e-9)) outside.push(`W = ${(s.w / MIL).toFixed(0)} mil (charts: up to 400 mil)`);
  if (s.t < CHART.tMin * 0.99 || s.t > CHART.tMax * 1.01) outside.push(`T = ${(s.t / OZ).toFixed(2)} oz (charts: ½–3 oz)`);
  if (outside.length) warnings.push(`Outside the IPC-2221 chart range: ${outside.join('; ')}. The curve fit is extrapolated there; check against IPC-2152 or a thermal simulation.`);
  if (dc.tCond > 105) warnings.push(`Conductor temperature ${degC(dc.tCond)} exceeds the ~105–130 °C maximum operating temperature (UL relative thermal index) of typical FR-4. Widen the trace or lower ΔT.`);
  if (s.w < 0.1e-3) warnings.push(`W = ${fmtW(s.w)} is below typical fabrication minimums (≈ 0.1 mm / 4 mil); check with your fabricator.`);

  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const solved = s.solveFor;
  results.push(
    solved === 'w'
      ? item('w', 'Minimum trace width', s.w, 'm', si(s.w, 'm', 4), { symbol: 'W', solved: true, primary: true, note: `${(s.w / MIL).toFixed(1)} mil · ${s.layer} · ${(s.t / OZ).toFixed(2)} oz` })
      : solved === 'i'
        ? item('i', 'Maximum current', s.i, 'A', si(s.i, 'A', 4), { symbol: 'I', solved: true, primary: true, note: `for ΔT = ${degC(s.dT)} · ${s.layer}` })
        : item('dT', 'Temperature rise', s.dT, '°C', degC(s.dT, 2), { symbol: 'ΔT', solved: true, primary: true, note: `conductor at ${degC(dc.tCond)}` }),
  );
  results.push(
    item('area', 'Cross-section', area, 'm²', `${areaMil2.toFixed(1)} mil²`, { symbol: 'A', primary: true, note: `${(area * 1e6).toPrecision(3)} mm²` }),
    item('r', `Resistance at ${degC(dc.tCond, 0)}`, dc.r, 'Ω', si(dc.r, 'Ω', 4), { symbol: 'R', primary: true, note: `${si(dc.r20, 'Ω', 3)} at 20 °C · ℓ = ${si(s.len, 'm', 3)}` }),
    item('vDrop', 'Voltage drop', dc.vDrop, 'V', si(dc.vDrop, 'V', 4), { symbol: 'ΔV', primary: true }),
    item('pLoss', 'Power loss', dc.pLoss, 'W', si(dc.pLoss, 'W', 4), { symbol: 'P', primary: true }),
  );
  const gC = 'Conductor';
  results.push(
    item('widthOut', 'Width', s.w, 'm', fmtW(s.w), { group: gC }),
    item('j', 'Current density', dc.j, 'A/m²', `${(dc.j * 1e-6).toPrecision(3)} A/mm²`, { symbol: 'J', group: gC }),
    item('tCond', 'Conductor temperature', dc.tCond, '°C', degC(dc.tCond), { symbol: 'T_cond', group: gC, tone: dc.tCond > 105 ? 'warn' : '' }),
    item('wOther', `Width if ${other}`, wOther, 'm', fmtW(wOther), { group: gC, note: `same I and ΔT, IPC-2221 ${other} curve` }),
    item('rPerLen', 'Resistance per length', dc.rho / area, 'Ω/m', `${si((dc.rho / area) * 1e-3, 'Ω', 4)}/mm`, { group: gC, note: `ρ = ${(dc.rho * 1e8).toFixed(3)} µΩ·cm at ${degC(dc.tCond, 0)}` }),
  );
  report.results = results;
  report.summary = `IPC-2221 ${s.layer} · ${(s.t / OZ).toFixed(2)} oz (${si(s.t, 'm', 3)}) · ${si(s.i, 'A', 3)} · ΔT ${degC(s.dT, 1)} · k = ${kOf(s.layer)}`;
  notes.push(
    'IPC-2221 Fig. 6-4 curve fit I = k·ΔT^0.44·A^0.725 (A in mil²). The charts come from 1956 NBS measurements on external traces; the internal curve is simply the external one derated by half.',
    'IPC-2152 (2009) replaced the charts with modern measurements: internal traces carry far more than IPC-2221 allows, while for external traces it gives roughly 25 % less current (Brooks & Adam, 2015). Nearby planes and thicker boards raise the capacity further.',
    'The temperature rise is at the hottest point of a long, isolated trace; short traces into planes or large pads run cooler.',
    'Resistance uses annealed copper, ρ20 = 1.724 µΩ·cm and α = 0.393 %/°C (IEC 60028), at the conductor temperature. Electrodeposited PCB copper is a few percent more resistive.',
  );
  report.details = { areaMil2, k: kOf(s.layer), ...dc, wOther, outsideChart: outside };
  report.graphs = graphs(s);
  return report;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}
function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

const RISES = [10, 20, 30, 45, 60, 100];
const RISE_COLORS = ['#1f4e5f', '#4f8a8b', '#2f7d4f', '#c47b17', '#6b5b95', '#8b1e1e'];

function graphs(s: TraceState): GraphSpec[] {
  // 1. Current vs width for the IPC chart temperature rises (this layer and copper)
  const ws = logspace(Math.min(0.05e-3, s.w / 3), Math.max(CHART.wMax, s.w * 3), 140);
  const iVsW: GraphSpec = {
    id: 'i-vs-w',
    title: 'Current vs width',
    subtitle: `IPC-2221 ${s.layer}, ${(s.t / OZ).toFixed(2)} oz`,
    x: { label: 'Trace width', unit: 'm', log: true },
    y: [{ id: 'i', label: 'Current', unit: 'A', log: true }],
    series: [
      ...RISES.map((dT, k) => ({ label: `ΔT ${dT} °C`, x: ws, y: ws.map((w) => ipcCurrent(w * s.t, dT, s.layer)), axis: 'i', color: RISE_COLORS[k], width: dT === 10 ? 2 : 1.4 })),
      ...(RISES.includes(Math.round(s.dT * 100) / 100) ? [] : [{ label: `ΔT ${s.dT.toPrecision(3)} °C (yours)`, x: ws, y: ws.map((w) => ipcCurrent(w * s.t, s.dT, s.layer)), axis: 'i', color: '#9a8f7a', width: 2.2, dash: [5, 3] }]),
    ],
    vlines: [{ value: s.w, label: `W = ${si(s.w, 'm', 3)}` }],
    hlines: [{ value: s.i, label: `I = ${si(s.i, 'A', 3)}`, axis: 'i', color: '#9a8f7a', dash: [3, 3] }],
    markers: [{ x: s.w, y: s.i, axis: 'i', label: `${si(s.i, 'A', 3)}` }],
    // the curves climb into the top-right corner, where the operating point of a wide trace sits: keep the
    // legend off the plot
    legend: 'below',
  };

  // 2. Temperature rise vs current for this trace, external and internal
  const area = s.w * s.t;
  const iTop = Math.max(2 * s.i, ipcCurrent(area, 100, 'external'));
  const is = linspace(iTop / 200, iTop, 140);
  const rise = (i: number, layer: Layer) => (i / (kOf(layer) * (area / MIL2) ** 0.725)) ** (1 / 0.44);
  const dtVsI: GraphSpec = {
    id: 'dt-vs-i',
    title: 'Temperature rise vs current',
    subtitle: `This trace: ${si(s.w, 'm', 3)} × ${si(s.t, 'm', 3)}`,
    x: { label: 'Current', unit: 'A' },
    y: [{ id: 't', label: 'Temperature rise', unit: '°C', includeZero: true, max: Math.max(150, s.dT * 1.2) }],
    series: [
      { label: 'External', x: is, y: is.map((i) => rise(i, 'external')), axis: 't', color: '#1f4e5f', width: s.layer === 'external' ? 2.2 : 1.3 },
      { label: 'Internal', x: is, y: is.map((i) => rise(i, 'internal')), axis: 't', color: '#c47b17', width: s.layer === 'internal' ? 2.2 : 1.3 },
    ],
    hlines: [{ value: 100, label: 'chart limit 100 °C', axis: 't', color: '#8b1e1e', dash: [6, 4] }],
    vlines: [{ value: s.i, label: `I = ${si(s.i, 'A', 3)}` }],
    markers: [{ x: s.i, y: s.dT, axis: 't', label: degC(s.dT) }],
  };

  // 3. Drop and loss vs current over the length, with the conductor temperature following the IPC rise
  const dc = is.map((i) => traceDc(i, s.w, s.t, s.len, s.ta, rise(i, s.layer)));
  const loss: GraphSpec = {
    id: 'loss-vs-i',
    title: 'Drop & loss vs current',
    subtitle: `ℓ = ${si(s.len, 'm', 3)}, resistance at T_A + ΔT(I)`,
    x: { label: 'Current', unit: 'A' },
    y: [
      { id: 'v', label: 'Voltage drop', unit: 'V', includeZero: true },
      { id: 'p', label: 'Power loss', unit: 'W', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'ΔV', x: is, y: dc.map((d) => d.vDrop), axis: 'v', width: 2.2 },
      { label: 'P', x: is, y: dc.map((d) => d.pLoss), axis: 'p', color: '#c47b17', width: 1.4, dash: [5, 3] },
    ],
    vlines: [{ value: s.i, label: `I = ${si(s.i, 'A', 3)}` }],
  };
  return [iVsW, dtVsI, loss];
}

export const def: CalcDef<TraceState> = {
  id: 'pcb/trace-width-current',
  version: '0.1.0',
  method:
    'IPC-2221A §6.2 / Fig. 6-4 curve fit I = k·ΔT^0.44·A^0.725 (A in mil², k = 0.048 external, 0.024 internal); width, current or temperature rise solved by Brent root finding on that equation. DC resistance from annealed-copper resistivity (IEC 60028) at T_A + ΔT. IPC-2152 context from Brooks & Adam (2015).',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'dT',
    options: [
      { key: 'w', label: 'Minimum width for a current and ΔT' },
      { key: 'i', label: 'Maximum current for a width and ΔT' },
      { key: 'dT', label: 'Temperature rise for a width and current' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '3 A on an outer layer, 1 oz, 10 °C rise: width', state: defaults() },
    { id: 'usb-c', label: '5 A USB-C VBUS, outer 1 oz, 20 °C rise: width', state: { solveFor: 'w', i: 5, dT: 20, layer: 'external', t: OZ, tUnit: 'oz', ta: 40, len: 80e-3 } },
    { id: 'inner-2oz', label: '5 A on an inner 2 oz layer, 20 °C rise: width', state: { solveFor: 'w', i: 5, dT: 20, layer: 'internal', t: 2 * OZ, tUnit: 'oz', ta: 40, len: 100e-3 } },
    { id: 'max-i-10mil', label: 'Max current of a 10 mil, ½ oz signal trace (10 °C)', state: { solveFor: 'i', w: 10 * MIL, wUnit: 'mil', dT: 10, layer: 'external', t: 0.5 * OZ, tUnit: 'oz', ta: 25, len: 0.1, lenUnit: 'mm' } },
    { id: 'rise-2mm', label: 'Temperature rise of a 2 mm outer trace at 8 A', state: { solveFor: 'dT', i: 8, w: 2e-3, wUnit: 'mm', layer: 'external', t: OZ, tUnit: 'oz', ta: 50, len: 30e-3 } },
    { id: 'beyond-chart', label: '40 A bus bar trace: beyond the IPC-2221 charts', state: { solveFor: 'w', i: 40, dT: 30, layer: 'external', t: 3 * OZ, tUnit: 'oz', ta: 40, len: 60e-3 } },
  ],
};
