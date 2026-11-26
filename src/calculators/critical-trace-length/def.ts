/** Critical trace length — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN, U_LEN_PCB, U_THICK, withDefault } from '@/core/unitsets';
import { K_PRESETS, bw35, criticalLength, effPermittivity, kneeFreq, tpdOf, type Topology } from './model';

export const ID = 'pcb/critical-trace-length';

/** Laminate presets: design Dk (manufacturer data sheets, around 1 GHz). */
export const MATERIALS: Record<string, number | null> = {
  Custom: null,
  'FR-4 (generic)': 4.3,
  'FR-4 high-Tg (IS410)': 4.0,
  'Megtron 6': 3.4,
  RO4350B: 3.66,
  'PTFE (RT/duroid 5880)': 2.2,
};

/** Criterion presets: label → k. */
export const CRITERIA: Record<string, number | null> = {
  'k = 2 · round trip = t_r': 2,
  'k = 3 · permissive': 3,
  'k = 4': 4,
  'k = 5 · Bogatin 20 % rule': 5,
  'k = 6 · Johnson & Graham': 6,
  'k = 10 · conservative': 10,
  Custom: null,
};

export interface CtlState {
  solveFor: 'len' | 'tr' | 'ratio';
  tr: number;
  trUnit: string;
  len: number;
  lenUnit: string;
  ratio: number;
  criterion: string;
  k: number;
  topo: Topology;
  material: string;
  er: number;
  eeff: number;
  w: number;
  wUnit: string;
  h: number;
  hUnit: string;
  t: number;
  tUnit: string;
}

const U_TR: Record<string, number> = { ns: 1e-9, ps: 1e-12, 'µs': 1e-6, fs: 1e-15, ms: 1e-3 };
// mm first; µm and km added so every critical length the solve can reach reads as 1–9999 (no global length family then)
const U_TRACE: Record<string, number> = { ...withDefault(U_LEN, 'mm'), 'µm': 1e-6, km: 1e3 };

export const defaults = (): CtlState => ({
  solveFor: 'len',
  tr: 1e-9,
  trUnit: 'ns',
  len: 0.025,
  lenUnit: 'mm',
  ratio: 1,
  criterion: 'k = 6 · Johnson & Graham',
  k: 6,
  topo: 'microstrip',
  material: 'FR-4 (generic)',
  er: 4.3,
  eeff: 3.3,
  w: 0.3e-3,
  wUnit: 'mm',
  h: 0.2e-3,
  hUnit: 'mm',
  t: 35e-6,
  tUnit: 'µm',
});

/** Field limits (also the range every solved value must stay in). */
/**
 * Field limits (also the range every solved value must stay in). L_crit = t_r/(k·t_pd) spans many decades, so the
 * length range is wide enough for every edge in the t_r range at k ≥ 1 (up to 3 km for a 10 µs edge); combining
 * extreme typed values (1 ps edge with L/L_crit = 10⁵, …) can still leave the range, and that is reported.
 */
const LIM = { tr: [1e-13, 1e-5], len: [1e-7, 1e5], ratio: [1e-4, 1e5], k: [1, 100] } as const;

const isMs = (s: Record<string, any>) => s.topo === 'microstrip';

/*
 * Mode-switch harness: "error-after-edit" flags come from typed extremes (min/max of L or L/L_crit) whose solved value
 * leaves its field range; they are reported on purpose. "unreadable" flags only appear when the user picks an
 * imperial unit (in, ft, mil, which have no prefixes) for an extreme solved length; mm/µm/km keep it readable.
 */

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Edge and trace',
    note: 'Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'tr', symbol: 't_r', label: 'Rise time (10–90 %)', units: U_TR, unitKey: 'trUnit', solvable: true, min: LIM.tr[0], max: LIM.tr[1], help: 'Fastest 10–90 % edge of the signal (from the driver data sheet or an IBIS model, not the clock period). Solved: the rise time at which this trace length reaches the criterion; any faster edge makes it a transmission line.' },
      { kind: 'number', key: 'len', symbol: 'L', label: 'Trace length', units: U_TRACE, unitKey: 'lenUnit', solvable: true, min: LIM.len[0], max: LIM.len[1], help: 'Routed length from driver to receiver. Solved: the critical length (the longest trace still lumped at this rise time), or a multiple of it if L/L_crit is not 1.' },
      { kind: 'number', key: 'ratio', symbol: 'L/L_crit', label: 'Length / critical', suffix: '×', solvable: true, min: LIM.ratio[0], max: LIM.ratio[1], help: 'Trace length over the critical length. Above 1 the trace needs controlled impedance and termination. Solved in the analysis mode; as an input it sets the margin (1 = exactly at the limit, 0.5 = half of it).' },
    ],
  },
  {
    kind: 'section',
    title: 'Criterion',
    fields: [
      {
        kind: 'select',
        key: 'criterion',
        label: 'Lumped while TD <',
        options: Object.keys(CRITERIA),
        apply: (v, s) => {
          const k = CRITERIA[v];
          if (k != null) s.k = k;
        },
        help: 'Fraction of the rise time the one-way delay may reach before the trace counts as a transmission line: TD < t_r/k. k = 2: the round trip equals the rise time. k = 5: Bogatin’s 20 % rule (ringing below about 10 %). k = 6: Johnson & Graham’s 1/6 of the edge length. Larger k is more conservative.',
      },
      { kind: 'number', key: 'k', symbol: 'k', label: 'Criterion k', min: LIM.k[0], max: LIM.k[1], help: 'L_crit = t_r/(k·t_pd). Typing a value selects Custom.' },
    ],
  },
  {
    kind: 'section',
    title: 'Line',
    fields: [
      {
        kind: 'select',
        key: 'topo',
        label: 'Routing layer',
        structural: true,
        options: [
          { value: 'microstrip', label: 'Microstrip (outer layer)' },
          { value: 'stripline', label: 'Stripline (inner layer)' },
          { value: 'custom', label: 'Known εeff' },
        ],
        help: 'Microstrip: part of the field is in air, so εeff < εr and edges travel faster. Stripline: fully in the dielectric, εeff = εr. Known εeff: type it (e.g. from a field solver).',
      },
      {
        kind: 'select',
        key: 'material',
        label: 'Laminate',
        options: Object.keys(MATERIALS),
        visible: (s) => s.topo !== 'custom',
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m != null) s.er = m;
        },
        help: 'Fills εr with a typical design Dk. Use the stack-up value from your fabricator.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 20, visible: (s) => s.topo !== 'custom', help: 'Relative permittivity (Dk) of the laminate.' },
      { kind: 'number', key: 'eeff', symbol: 'ε_eff', label: 'Effective permittivity', min: 1, max: 20, visible: (s) => s.topo === 'custom', help: 'Effective permittivity of the line: t_pd = √εeff/c.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', min: 1e-6, max: 0.05, visible: isMs, help: 'Only sets how much of the field is in air (εeff, Hammerstad–Jensen).' },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Height to plane', units: U_LEN_PCB, unitKey: 'hUnit', min: 1e-6, max: 0.05, visible: isMs, help: 'Dielectric between the trace and its reference plane.' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 1e-3, visible: isMs, help: '1 oz ≈ 35 µm. Has a small effect on εeff.' },
    ],
  },
];

const LABEL: Record<CtlState['solveFor'], string> = { len: 'Critical length', tr: 'Critical rise time', ratio: 'Length / critical length' };
const fLen = (m: number) => si(m, 'm', 4);
const fT = (s: number) => si(s, 's', 4);
const inch = (m: number) => `${(m / 0.0254).toPrecision(3)} in`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: CtlState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function fail(msg: string, s: CtlState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function run(st: CtlState): CalcReport {
  const s: CtlState = { ...st };
  const k = finite('Criterion k', s.k);
  if (!(k > 0)) throw new Error('Criterion k must be > 0.');
  if (s.topo === 'custom') {
    if (!(finite('εeff', s.eeff) >= 1)) throw new Error('εeff must be ≥ 1.');
  } else if (!(finite('εr', s.er) >= 1)) throw new Error('εr must be ≥ 1.');
  if (s.topo === 'microstrip') {
    if (!(finite('Trace width', s.w) > 0)) throw new Error('Trace width must be > 0.');
    if (!(finite('Height', s.h) > 0)) throw new Error('Height to plane must be > 0.');
    if (!(finite('Copper thickness', s.t) >= 0)) throw new Error('Copper thickness must be ≥ 0.');
  }
  const eeff = effPermittivity(s);
  const tpd = tpdOf(eeff);
  const solved = s.solveFor;
  for (const key of ['tr', 'len', 'ratio'] as const) if (key !== solved && !(finite(LABEL[key], s[key]) > 0)) throw new Error(`${key === 'tr' ? 'Rise time' : key === 'len' ? 'Trace length' : 'Length / critical'} must be > 0.`);

  // L/L_crit = len·k·t_pd/t_r: one equation, solved in closed form for whichever term is unknown.
  if (solved === 'len') s.len = (s.ratio * s.tr) / (k * tpd);
  else if (solved === 'tr') s.tr = (s.len * k * tpd) / s.ratio;
  else s.ratio = (s.len * k * tpd) / s.tr;
  const lim = LIM[solved];
  if (!(s[solved] >= lim[0] && s[solved] <= lim[1])) {
    const v = s[solved];
    const shown = solved === 'len' ? fLen(v) : solved === 'tr' ? fT(v) : v.toPrecision(4);
    return fail(`${LABEL[solved]} = ${shown} is outside the field range (${solved === 'len' ? `${fLen(lim[0])} … ${fLen(lim[1])}` : solved === 'tr' ? `${fT(lim[0])} … ${fT(lim[1])}` : `${lim[0]} … ${lim[1]}`}). Check the units of the other inputs.`, s);
  }
  return report(s, eeff, tpd);
}

function report(s: CtlState, eeff: number, tpd: number): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.k;
  const lc = criticalLength(s.tr, k, tpd);
  const td = s.len * tpd;
  const lEdge = s.tr / tpd;
  const fk = kneeFreq(s.tr);
  const bw = bw35(s.tr);
  const isLine = s.ratio > 1;
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  const prim: ResultItem[] = [];
  const solved = s.solveFor;
  if (solved === 'len')
    prim.push(item('len', Math.abs(s.ratio - 1) < 1e-12 ? 'Critical length' : `Length at L/L_crit = ${+s.ratio.toPrecision(4)}`, s.len, 'm', fLen(s.len), { symbol: 'L', solved: true, primary: true, note: `${inch(s.len)} · longest trace still lumped` }));
  if (solved === 'tr') prim.push(item('tr', 'Critical rise time', s.tr, 's', fT(s.tr), { symbol: 't_r', solved: true, primary: true, note: `edges faster than this make the ${fLen(s.len)} trace a transmission line` }));
  if (solved === 'ratio')
    prim.push(item('ratio', 'Length / critical length', s.ratio, '', `${s.ratio.toPrecision(3)} ×`, { symbol: 'L/L_crit', solved: true, primary: true, tone: isLine ? 'warn' : 'pass', note: isLine ? 'transmission line: control Z₀ and terminate' : 'lumped: no termination needed' }));
  if (!(solved === 'len' && Math.abs(s.ratio - 1) < 1e-12)) prim.push(item('lcrit', 'Critical length', lc, 'm', fLen(lc), { symbol: 'L_crit', primary: true, note: `t_r/(k·t_pd), k = ${+k.toPrecision(4)} · ${inch(lc)}` }));
  prim.push(item('tpd', 'Propagation delay', tpd, 's/m', `${si(tpd * 1e-3, 's', 4)}/mm`, { symbol: 't_pd', primary: true, note: `${si(tpd * 0.0254, 's', 4)}/in · εeff = ${eeff.toPrecision(4)}` }));
  prim.push(item('fknee', 'Knee frequency', fk, 'Hz', si(fk, 'Hz', 4), { symbol: 'f_knee', primary: true, note: `0.5/t_r (Johnson & Graham) · 0.35/t_r = ${si(bw, 'Hz', 3)}` }));

  const sec: ResultItem[] = [
    item('eeff', 'Effective permittivity', eeff, '', eeff.toPrecision(4), { symbol: 'ε_eff', group: 'Line', note: s.topo === 'microstrip' ? 'Hammerstad–Jensen, static' : s.topo === 'stripline' ? 'stripline: εeff = εr' : 'entered' }),
    item('vp', 'Signal speed', 1 / tpd, 'm/s', `${si(1 / tpd, 'm/s', 4)} (${(100 / Math.sqrt(eeff)).toFixed(1)} % c)`, { symbol: 'v', group: 'Line', note: `${(1 / tpd / 0.0254 * 1e-9).toFixed(2)} in/ns` }),
    item('td', 'One-way delay of the trace', td, 's', fT(td), { symbol: 'TD', group: 'Line', note: `L·t_pd = ${(td / s.tr).toPrecision(3)} × t_r` }),
    item('rt', 'Round-trip delay', 2 * td, 's', fT(2 * td), { symbol: '2TD', group: 'Line', note: 2 * td > s.tr ? 'longer than the rise time: the reflection returns after the edge' : 'shorter than the rise time' }),
    item('ledge', 'Length of the rising edge', lEdge, 'm', fLen(lEdge), { symbol: 'l_edge', group: 'Edge', note: `t_r/t_pd: the edge spread out along the line · L_crit = l_edge/k` }),
    item('bw', 'Single-pole bandwidth', bw, 'Hz', si(bw, 'Hz', 4), { symbol: 'BW', group: 'Edge', note: '0.35/t_r, −3 dB of a first-order system with this 10–90 % rise' }),
    item('lambdaKnee', 'Wavelength at f_knee', 1 / (tpd * fk), 'm', fLen(1 / (tpd * fk)), { symbol: 'λ_knee', group: 'Edge', note: `in the line; L_crit = ${((lc * tpd * fk)).toPrecision(3)} λ_knee` }),
    item('k', 'Criterion', k, '', `TD < t_r/${+k.toPrecision(4)}`, { symbol: 'k', group: 'Edge' }),
  ];
  rep.results = [...prim, ...sec];
  rep.status = isLine ? { text: 'TRANSMISSION LINE', tone: 'warn' } : { text: 'LUMPED', tone: 'pass' };
  rep.summary = `${fT(s.tr)} edge · ${s.topo === 'stripline' ? 'stripline' : s.topo === 'microstrip' ? 'microstrip' : 'line'} εeff ${eeff.toPrecision(3)} · ${si(tpd * 1e-3, 's', 3)}/mm · k = ${+k.toPrecision(3)}`;

  // ── warnings and notes
  if (isLine) rep.warnings.push(`The ${fLen(s.len)} trace is ${s.ratio.toPrecision(3)} × the critical length: route it with controlled impedance and terminate it (series at the driver for point-to-point, parallel at the far end for multi-drop), or slow the edge.`);
  else if (s.ratio > 0.7) rep.notes.push(`The trace is ${(100 * s.ratio).toFixed(0)} % of the critical length: close to the limit, so a faster driver or a longer route will cross it. Consider a footprint for a series resistor.`);
  if (s.tr < 20e-12) rep.warnings.push(`A ${fT(s.tr)} edge has a knee near ${si(fk, 'Hz', 3)}: εeff, loss and dispersion change across the edge spectrum, and at this speed every trace is a transmission line. Use a field solver and channel simulation.`);
  if (s.topo === 'microstrip' && s.w / s.h > 20) rep.notes.push('W/H > 20: almost all the field is in the laminate, so εeff is close to εr.');
  if (k < 2) rep.warnings.push('k < 2 accepts a round-trip delay longer than the rise time: reflections will then show up as distinct steps on the edge. Use k ≥ 2.');
  rep.notes.push('The criterion is a rule of thumb: how much ringing a long unterminated trace shows also depends on the driver impedance and the load capacitance, not on length alone.');
  rep.notes.push('Use the fastest edge the driver can produce (fast process corner, light load), not the nominal or the clock frequency: a 10 MHz clock with 300 ps edges needs the same care as a 1 GHz one.');
  if (s.topo === 'microstrip') rep.notes.push('Static εeff: dispersion raises it slightly at the knee frequency, which would shorten L_crit by a few percent.');

  rep.tables = [criteriaTable(s, tpd)];
  rep.graphs = graphs(s, tpd, lc);
  rep.details = { eeff, tpd, lcrit: lc, td, ledge: lEdge, fknee: fk, bw35: bw };
  return rep;
}

function criteriaTable(s: CtlState, tpd: number): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  const tones: ('pass' | 'warn' | 'fail' | '')[] = [];
  const why: Record<number, string> = { 2: 'round trip = rise time', 3: 'permissive', 4: '', 5: 'Bogatin: TD < 20 % t_r', 6: 'Johnson & Graham: 1/6 of the edge', 10: 'conservative' };
  for (const kk of K_PRESETS) {
    const lc = criticalLength(s.tr, kk, tpd);
    const r = s.len / lc;
    rows.push({ k: kk, rule: why[kk] ?? '', lcrit: lc, ratio: r });
    display.push({ k: String(kk), rule: why[kk] ?? '', lcrit: `${fLen(lc)} (${inch(lc)})`, ratio: `${r.toPrecision(3)} ×` });
    tones.push(r > 1 ? 'fail' : r > 0.7 ? 'warn' : 'pass');
  }
  return {
    id: 'criteria',
    title: 'Critical length by criterion',
    columns: [
      { key: 'k', label: 'k' },
      { key: 'rule', label: 'Rule', align: 'left' },
      { key: 'lcrit', label: 'L_crit', unit: 'm' },
      { key: 'ratio', label: `L/L_crit (L = ${fLen(s.len)})` },
    ],
    rows,
    display,
    rowTones: tones,
    note: `At t_r = ${fT(s.tr)}, t_pd = ${si(tpd * 1e-3, 's', 4)}/mm. Green: the trace is lumped under that rule; yellow: above 70 % of L_crit; red: treat it as a transmission line.`,
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: CtlState, tpd: number, lc: number): GraphSpec[] {
  const trs = logspace(Math.min(s.tr / 30, 10e-12), Math.max(s.tr * 30, 10e-9), 120);
  const pal: Record<number, string> = { 2: '#9a8f7a', 5: '#4f8a8b', 6: '#c47b17', 10: '#6b5b95' };
  const ks = [2, 5, 6, 10];
  const series = ks
    .filter((kk) => Math.abs(kk - s.k) > 1e-9)
    .map((kk) => ({ label: `k = ${kk}`, x: trs, y: trs.map((t) => criticalLength(t, kk, tpd)), color: pal[kk], width: 1.2, dash: [5, 3] }));
  const all: GraphSpec['series'] = [{ label: `k = ${+s.k.toPrecision(3)} (selected)`, x: trs, y: trs.map((t) => criticalLength(t, s.k, tpd)), axis: 'l', color: '#1f4e5f', width: 2.4 }, ...series.map((x) => ({ ...x, axis: 'l' }))];
  const lens = logspace(Math.min(s.len / 30, lc / 10), Math.max(s.len * 30, lc * 10), 120);
  return [
    {
      id: 'lcrit-vs-tr',
      title: 'Critical length vs rise time',
      subtitle: `t_pd = ${si(tpd * 1e-3, 's', 3)}/mm`,
      x: { label: 'Rise time t_r (10–90 %)', unit: 's', log: true },
      y: [{ id: 'l', label: 'Critical length', unit: 'm', log: true }],
      series: all,
      hlines: [{ value: s.len, label: `L = ${fLen(s.len)}`, axis: 'l', color: '#8b1e1e', dash: [6, 4] }],
      vlines: [{ value: s.tr, label: `t_r = ${fT(s.tr)}`, color: '#9a8f7a' }],
      markers: [{ x: s.tr, y: lc, axis: 'l', label: fLen(lc) }],
    },
    {
      id: 'td-vs-len',
      title: 'Delay / rise time vs length',
      subtitle: 'the trace becomes a transmission line where its curve crosses 1/k',
      x: { label: 'Trace length L', unit: 'm', log: true },
      y: [{ id: 'r', label: 'TD / t_r', unit: '', log: true }],
      series: [{ label: 'TD/t_r', x: lens, y: lens.map((l) => (l * tpd) / s.tr), axis: 'r', width: 2.2 }],
      hlines: ks.map((kk) => ({ value: 1 / kk, label: `1/${kk}`, axis: 'r', color: Math.abs(kk - s.k) < 1e-9 ? '#8b1e1e' : '#9a8f7a', dash: [5, 3] })),
      vlines: [{ value: s.len, label: `L = ${fLen(s.len)}`, color: '#9a8f7a' }],
      markers: [{ x: s.len, y: (s.len * tpd) / s.tr, axis: 'r', label: `${((s.len * tpd) / s.tr).toPrecision(3)}` }],
    },
  ];
}

export const def: CalcDef<CtlState> = {
  id: ID,
  version: '0.1.0',
  method:
    'L_crit = t_r/(k·t_pd) with t_pd = √εeff/c; εeff from Hammerstad–Jensen (microstrip) or εr (stripline). Criteria: k = 2 round trip (Montrose 1999), k = 5 (Bogatin 2009, TD < 20 % t_r), k = 6 (Johnson & Graham 1993). Knee frequency 0.5/t_r (Johnson & Graham), bandwidth 0.35/t_r (single pole). Solved in closed form.',
  fields,
  defaults,
  solve: {
    default: 'len',
    analysis: 'ratio',
    options: [
      { key: 'ratio', label: 'Is this trace a transmission line? (analysis)' },
      { key: 'len', label: 'Critical length for this rise time' },
      { key: 'tr', label: 'Fastest rise time this trace tolerates' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
    const k = CRITERIA[s.criterion];
    if (k !== undefined && k !== null && Math.abs(k - s.k) > 1e-9) s.criterion = 'Custom';
    if (!(s.criterion in CRITERIA)) s.criterion = 'Custom';
  },
  examples: [
    { id: 'default', label: '1 ns edge, FR-4 microstrip, k = 6 (critical length)', state: defaults() },
    { id: 'lvcmos-80mm', label: '500 ps LVCMOS clock, 80 mm outer-layer route, k = 5', state: { ...defaults(), solveFor: 'ratio', tr: 500e-12, trUnit: 'ps', len: 0.08, lenUnit: 'mm', criterion: 'k = 5 · Bogatin 20 % rule', k: 5, topo: 'microstrip', material: 'Custom', er: 4.2 } },
    { id: 'bogatin-inch', label: 'Bogatin rule of thumb: 1 ns in FR-4 stripline, k = 5 (≈ 1 in)', state: { ...defaults(), solveFor: 'len', ratio: 1, tr: 1e-9, trUnit: 'ns', lenUnit: 'mm', criterion: 'k = 5 · Bogatin 20 % rule', k: 5, topo: 'stripline', material: 'Custom', er: 4.0 } },
    { id: 'ddr4-strip', label: 'Megtron 6 stripline: fastest edge a 5 mm route tolerates', state: { ...defaults(), solveFor: 'tr', len: 5e-3, lenUnit: 'mm', ratio: 1, trUnit: 'ps', criterion: 'k = 6 · Johnson & Graham', k: 6, topo: 'stripline', material: 'Megtron 6', er: 3.4 } },
    { id: 'hc-5ns', label: '74HC logic, 5 ns edge: a 120 mm route is still lumped', state: { ...defaults(), solveFor: 'ratio', tr: 5e-9, trUnit: 'ns', len: 0.12, lenUnit: 'mm', criterion: 'k = 6 · Johnson & Graham', k: 6, topo: 'microstrip', material: 'FR-4 (generic)', er: 4.3 } },
    { id: 'round-trip', label: 'Round-trip rule (k = 2), 2 ns edge, 1.6 mm board microstrip', state: { ...defaults(), solveFor: 'len', ratio: 1, tr: 2e-9, trUnit: 'ns', criterion: 'k = 2 · round trip = t_r', k: 2, topo: 'microstrip', material: 'FR-4 (generic)', er: 4.3, w: 3e-3, h: 1.6e-3 } },
  ],
};
