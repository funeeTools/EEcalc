/** Aperture diagonal — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, withDefault } from '@/core/unitsets';
import { aperture, diagonal, gridUp, growth, sideFor } from './model';

export const ID = 'pcb/aperture-diagonal';

/** 'd' (analysis): diagonal, covering hole and routed opening of L × W; 'l' / 'w': a side for a target diagonal. */
export type ApSolve = 'd' | 'l' | 'w';
export type Fit = 'clear' | 'A' | 'B' | 'C' | 'custom';

export interface ApState {
  solveFor: ApSolve;
  l: number;
  lUnit: string;
  w: number;
  wUnit: string;
  d: number;
  dUnit: string;
  fit: Fit;
  c: number;
  cUnit: string;
  step: number;
  stepUnit: string;
  dMin: number;
  dMinUnit: string;
  dMax: number;
  dMaxUnit: string;
  dr: number;
  drUnit: string;
}

/** IPC-7251 hole-over-lead allowance by density level (diametral). */
export const IPC7251: Record<'A' | 'B' | 'C', number> = { A: 0.25e-3, B: 0.2e-3, C: 0.15e-3 };
const FIT_C: Record<Exclude<Fit, 'custom'>, number> = { clear: 0, ...IPC7251 };

export const LIM = { side: [10e-6, 0.5], d: [10e-6, 0.75] } as const;

const MM = withDefault(U_LEN_PCB, 'mm');

/**
 * A solved length shown in mil or in can read "0.00051 in": the core rescales a solved value only within one
 * unit's SI prefixes, which imperial units lack. Move it to the imperial unit that shows it nearest 0.1…9999.
 */
const IMPERIAL: Record<string, number> = { mil: 25.4e-6, in: 0.0254 };
function fitImperial(st: Record<string, any>, key: string, unitKey: string): void {
  const v = st[key];
  if (!(st[unitKey] in IMPERIAL) || !(typeof v === 'number' && v > 0)) return;
  const mant = v / IMPERIAL[st[unitKey]];
  if (mant >= 0.1 && mant < 1e4) return;
  st[unitKey] = v / IMPERIAL.mil < 1e4 ? 'mil' : 'in';
}


export const defaults = (): ApState => ({
  solveFor: 'd',
  l: 0.64e-3,
  lUnit: 'mm',
  w: 0.64e-3,
  wUnit: 'mm',
  d: 0.905e-3,
  dUnit: 'mm',
  fit: 'B',
  c: 0.2e-3,
  cUnit: 'mm',
  step: 0.05e-3,
  stepUnit: 'mm',
  dMin: 0.15e-3,
  dMinUnit: 'mm',
  dMax: 6.5e-3,
  dMaxUnit: 'mm',
  dr: 0.5e-3,
  drUnit: 'mm',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Rectangle',
    note: 'The rectangular opening, or the cross-section of a rectangular pin or tab that must pass through.',
    fields: [
      { kind: 'number', key: 'l', symbol: 'L', label: 'Length', units: MM, unitKey: 'lUnit', min: LIM.side[0], max: LIM.side[1], solvable: true, help: 'Long side of the rectangle (maximum material size for a lead). Click ◎ to find the longest side a given diagonal allows.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Width', units: MM, unitKey: 'wUnit', min: LIM.side[0], max: LIM.side[1], solvable: true, help: 'Short side of the rectangle. Click ◎ to find the widest side a given diagonal allows.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Diagonal', units: MM, unitKey: 'dUnit', min: LIM.d[0], max: LIM.d[1], solvable: true, help: 'Corner-to-corner diagonal √(L² + W²): the smallest circle that contains the rectangle. As a target, e.g. the drill you have, the page finds L or W.' },
    ],
  },
  {
    kind: 'section',
    title: 'Fit',
    fields: [
      {
        kind: 'select', key: 'fit', label: 'Clearance',
        options: [
          { value: 'clear', label: 'Opening only (none)' },
          { value: 'A', label: 'Lead, IPC-7251 A (+0.25 mm)' },
          { value: 'B', label: 'Lead, IPC-7251 B (+0.20 mm)' },
          { value: 'C', label: 'Lead, IPC-7251 C (+0.15 mm)' },
          { value: 'custom', label: 'Custom' },
        ],
        apply: (v: Fit, s) => {
          if (v !== 'custom') s.c = FIT_C[v];
        },
        help: 'Diametral clearance added to the diagonal. A rectangular lead in a plated hole: IPC-7251 adds 0.25 / 0.20 / 0.15 mm to the maximum lead size for density level A / B / C. A plain cutout that only has to clear the rectangle: none.',
      },
      { kind: 'number', key: 'c', symbol: 'c', label: 'Clearance (diam.)', units: MM, unitKey: 'cUnit', min: 0, max: 5e-3, help: 'Hole diameter minus the lead’s diagonal (finished hole for a plated hole).' },
    ],
  },
  {
    kind: 'section',
    title: 'Tooling',
    collapsed: true,
    note: 'Your fabricator’s finished-hole grid and router cutter.',
    fields: [
      { kind: 'number', key: 'step', symbol: 'Δd', label: 'Hole size step', units: MM, unitKey: 'stepUnit', min: 1e-6, max: 1e-3, help: 'Finished hole sizes are offered in steps, typically 0.05 mm (some fabs use 0.1 mm or 1 mil).' },
      { kind: 'number', key: 'dMin', symbol: 'd_min', label: 'Smallest hole', units: MM, unitKey: 'dMinUnit', min: 0, max: 10e-3, help: 'Smallest finished hole on the grid (the grid starts here).' },
      { kind: 'number', key: 'dMax', symbol: 'd_max', label: 'Largest drill', units: MM, unitKey: 'dMaxUnit', min: 0.1e-3, max: 0.1, help: 'Largest drilled hole the fabricator offers (often 6.3–6.5 mm); bigger openings are routed.' },
      { kind: 'number', key: 'dr', symbol: 'd_r', label: 'Router cutter', units: MM, unitKey: 'drUnit', min: 0.1e-3, max: 10e-3, help: 'Diameter of the router bit used for slots and cutouts (commonly 0.8–2.4 mm; ask the fabricator which one they use for internal cutouts). Inside corners keep its radius.' },
    ],
  },
];

const fmt = (m: number) => si(m, 'm', 4);
const SIDE_NAME: Record<'l' | 'w', string> = { l: 'Length', w: 'Width' };

function noSolution(s: ApState, key: ApSolve, why: string, display: string): CalcReport {
  return {
    calc: ID, ok: true, solveFor: s.solveFor, warnings: [why], notes: [], graphs: [], tables: [],
    status: { text: 'NO SOLUTION', tone: 'fail' },
    results: [{ key, label: key === 'd' ? 'Diagonal' : SIDE_NAME[key], value: null, display, primary: true, solved: true }],
  };
}

export function compute(st: ApState): CalcReport {
  for (const k of ['l', 'w', 'd', 'c', 'step', 'dMin', 'dMax', 'dr'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!['d', 'l', 'w'].includes(st.solveFor)) throw new Error('solveFor must be d, l or w.');
  if (!['clear', 'A', 'B', 'C', 'custom'].includes(st.fit)) throw new Error('fit must be clear, A, B, C or custom.');
  const s: ApState = { ...st };
  if (s.c < 0 || s.dMin < 0) throw new Error('Clearance and smallest hole must be ≥ 0.');
  if (!(s.step > 0) || !(s.dMax > 0) || !(s.dr > 0)) throw new Error('Hole step, largest drill and cutter must be > 0.');
  if (s.solveFor !== 'l' && !(s.l > 0)) throw new Error('Length must be > 0.');
  if (s.solveFor !== 'w' && !(s.w > 0)) throw new Error('Width must be > 0.');

  // ── solve: d = √(L² + W²), inverted exactly for the unknown side
  if (s.solveFor !== 'd') {
    const k = s.solveFor;
    const other = k === 'l' ? s.w : s.l;
    if (!(s.d > 0)) throw new Error('The target diagonal must be > 0.');
    if (!(s.d > other)) return noSolution(s, k, `A diagonal of ${fmt(s.d)} must be longer than the other side (${fmt(other)}): shorten the ${k === 'l' ? 'width' : 'length'} or allow a larger diagonal.`, '—');
    const v = sideFor(s.d, other);
    if (v < LIM.side[0]) return noSolution(s, k, `The diagonal ${fmt(s.d)} is only just longer than the other side, leaving ${si(v, 'm', 3)} — below the 10 µm this page accepts.`, '< 10 µm');
    if (v > LIM.side[1]) return noSolution(s, k, `That would need a side of ${si(v, 'm', 3)}, above the 0.5 m this page accepts.`, '> 0.5 m');
    s[k] = v;
  }
  const o = aperture(s.l, s.w, s.c, s.step, s.dMin, s.dMax, s.dr);
  s.d = o.d;
  const short = Math.min(s.l, s.w);
  const shortO = Math.min(o.lo, o.wo);
  const lead = s.fit !== 'clear';

  // ── results
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  if (s.solveFor === 'l' || s.solveFor === 'w') {
    const k = s.solveFor;
    results.push(item(k, k === 'l' ? 'Longest length' : 'Widest width', s[k], 'm', fmt(s[k]), { symbol: k === 'l' ? 'L' : 'W', primary: true, solved: true, note: `diagonal ${fmt(s.d)}` }));
  }
  results.push(item('d', 'Diagonal', o.d, 'm', fmt(o.d), { symbol: 'd', primary: true, solved: s.solveFor === 'd', note: s.solveFor === 'd' ? `√(L² + W²) of ${fmt(s.l)} × ${fmt(s.w)}` : 'target' }));
  const holeOk = Number.isFinite(o.hole);
  results.push(
    item('hole', 'Smallest covering hole', holeOk ? o.hole : null, 'm', holeOk ? fmt(o.hole) : `none ≤ ${si(s.dMax, 'm', 3)}`, { symbol: 'D', primary: true, tone: holeOk ? '' : 'warn', note: holeOk ? `${lead ? 'finished hole, ' : ''}d + c = ${fmt(o.dReq)} rounded up` : 'route it instead' }),
    item('opening', 'Routed opening', o.lo, 'm', `${si(o.lo, 'm', 3)} × ${si(o.wo, 'm', 3)}`, { symbol: 'L_o × W_o', primary: true, tone: s.dr > shortO * (1 + 1e-9) ? 'fail' : '', note: `cutter ${si(s.dr, 'm', 3)}, +${si(o.g, 'm', 3)} per side` }),
    item('r', 'Routed corner radius', o.r, 'm', fmt(o.r), { symbol: 'r', primary: true, note: 'd_r / 2' }),
  );
  const gH = 'Drilled hole';
  results.push(
    item('dReq', 'Hole needed (d + c)', o.dReq, 'm', fmt(o.dReq), { group: gH, note: lead ? `${fmt(s.c)} over the lead diagonal` : 'clears the corners exactly' }),
    item('over', 'Hole over diagonal', holeOk ? o.hole - o.d : null, 'm', holeOk ? fmt(o.hole - o.d) : '—', { group: gH, note: 'diametral, after rounding to the grid' }),
    // (D − W)/2 separates the hole wall from the long faces (W apart); (D − L)/2 from the short ends (L apart)
    item('gapFlat', 'Gap at the long faces', holeOk ? (o.hole - s.w) / 2 : null, 'm', holeOk ? fmt((o.hole - s.w) / 2) : '—', { group: gH, note: '(D − W)/2, each side' }),
    item('gapLong', 'Gap at the short ends', holeOk ? (o.hole - s.l) / 2 : null, 'm', holeOk ? fmt((o.hole - s.l) / 2) : '—', { group: gH, note: '(D − L)/2, each side' }),
    item('holeArea', 'Hole area / rectangle', holeOk ? (Math.PI * o.hole * o.hole) / 4 / (s.l * s.w) : null, '', holeOk ? `${((Math.PI * o.hole * o.hole) / 4 / (s.l * s.w)).toFixed(2)} ×` : '—', { group: gH, note: 'solder or air the hole adds' }),
  );
  const gR = 'Routed opening';
  results.push(
    item('g', 'Growth per side', o.g, 'm', fmt(o.g), { group: gR, note: o.g > s.c / 2 + 1e-15 ? 'r − (r − c/2)/√2: c/2 also at the corners' : 'c/2 at the flats already leaves c/2 at the corners' }),
    item('lo', 'Opening length', o.lo, 'm', fmt(o.lo), { symbol: 'L_o', group: gR }),
    item('wo', 'Opening width', o.wo, 'm', fmt(o.wo), { symbol: 'W_o', group: gR }),
    item('lost', 'Area lost to fillets', o.lostArea, 'm²', `${si(o.lostArea * 1e6, '', 3)} mm²`, { group: gR, note: '(4 − π)·r² against sharp corners' }),
    item('dog', 'Dog-bone centre inset', o.dogInset, 'm', fmt(o.dogInset), { group: gR, note: 'r/√2 from both edges: no growth needed' }),
  );

  // ── clearance levels compared
  const levels: [string, number][] = [['Opening only', 0], ['IPC-7251 C (+0.15 mm)', IPC7251.C], ['IPC-7251 B (+0.20 mm)', IPC7251.B], ['IPC-7251 A (+0.25 mm)', IPC7251.A]];
  const hOf = (c: number) => gridUp(o.d + c, s.step, s.dMin);
  const table: TableSpec = {
    id: 'levels',
    title: 'Covering hole by clearance',
    columns: [{ key: 'fit', label: 'Clearance', align: 'left' }, { key: 'need', label: 'd + c', unit: 'm' }, { key: 'hole', label: 'Hole on grid', unit: 'm' }],
    rows: levels.map(([fit, c]) => ({ fit, need: o.d + c, hole: hOf(c) <= s.dMax * (1 + 1e-9) ? hOf(c) : null })),
    display: levels.map(([fit, c]) => ({ fit, need: fmt(o.d + c), hole: hOf(c) <= s.dMax * (1 + 1e-9) ? fmt(hOf(c)) : 'route' })),
    note: `Grid from ${si(s.dMin, 'm', 3)} in ${si(s.step, 'm', 3)} steps, drilled up to ${si(s.dMax, 'm', 3)}.`,
  };

  // ── checks and advice
  const warnings: string[] = [];
  const notes: string[] = [];
  if (!holeOk) warnings.push(`d + c = ${fmt(o.dReq)} is larger than the largest drill (${si(s.dMax, 'm', 3)}): rout the opening (${si(o.lo, 'm', 3)} × ${si(o.wo, 'm', 3)} with a ${si(s.dr, 'm', 3)} cutter).`);
  if (s.dr > shortO * (1 + 1e-9)) warnings.push(`The ${si(s.dr, 'm', 3)} cutter is wider than the routed opening (${si(shortO, 'm', 3)}): use a cutter no larger than ${si(shortO, 'm', 3)}, or drill instead.`);
  else if (o.r > shortO / 4) notes.push(`The corner radius (${si(o.r, 'm', 3)}) is more than a quarter of the opening’s short side, so the routed opening looks like a slot with rounded ends; dog-bone reliefs keep it rectangular.`);
  if (holeOk && lead && Math.max(s.l, s.w) >= 2 * short) notes.push(`A flat lead in a round hole leaves ${si((o.hole - short) / 2, 'm', 3)} each side at its flats for the solder to bridge; a plated slot (${si(o.lo, 'm', 3)} × ${si(o.wo, 'm', 3)}) fits it more closely.`);
  if (s.l < s.w) notes.push('L is shorter than W; the results do not depend on which side is called the length.');
  notes.push(
    'A rectangle fits a circle only if the circle’s diameter is at least its diagonal; the covering hole is the next grid size at or above d + c.',
    'Routed inside corners keep the cutter radius; a square-cornered part needs each side grown by r − (r − c/2)/√2 to keep c/2 at its corners, or dog-bone reliefs.',
  );

  return {
    calc: ID, ok: true, solveFor: s.solveFor, results, tables: [table], warnings, notes,
    graphs: graphs(s, o.d),
    summary: `${si(s.l, 'm', 3)} × ${si(s.w, 'm', 3)} · ${lead ? `lead, c = ${si(s.c, 'm', 3)}` : 'opening'} · grid ${si(s.step, 'm', 2)} · cutter ${si(s.dr, 'm', 3)}`,
    details: { ...o, holeOk },
  };
}

function graphs(s: ApState, d: number): GraphSpec[] {
  // 1. covering hole vs length at this width
  const lLo = Math.max(LIM.side[0], s.l / 4);
  const lHi = Math.min(LIM.side[1], s.l * 2.5);
  const n = 301;
  const ls = Array.from({ length: n }, (_, i) => lLo + ((lHi - lLo) * i) / (n - 1));
  const mm = (v: number) => v * 1e3;
  const holes = ls.map((l) => gridUp(diagonal(l, s.w) + s.c, s.step, s.dMin));
  const top = Math.max(...holes);
  const hd: GraphSpec = {
    id: 'hole-vs-l',
    title: 'Covering hole vs length',
    subtitle: `W = ${si(s.w, 'm', 3)} · c = ${si(s.c, 'm', 3)} · grid ${si(s.step, 'm', 2)}`,
    x: { label: 'Length L', unit: 'mm' },
    y: [{ id: 'h', label: 'Diameter', unit: 'mm' }],
    series: [
      { label: 'Diagonal d', x: ls.map(mm), y: ls.map((l) => mm(diagonal(l, s.w))), axis: 'h', color: '#9a8f7a', width: 1.4, dash: [5, 3] },
      ...(s.c > 0 ? [{ label: 'd + c', x: ls.map(mm), y: ls.map((l) => mm(diagonal(l, s.w) + s.c)), axis: 'h', color: '#c47b17', width: 1.4, dash: [6, 3] }] : []),
      { label: 'Hole on the grid', x: ls.map(mm), y: holes.map((h) => mm(Math.min(h, top))), axis: 'h', width: 2.2 },
    ],
    hlines: s.dMax <= top * 1.05 ? [{ value: mm(s.dMax), label: `largest drill ${si(s.dMax, 'm', 3)}`, axis: 'h', color: '#8b1e1e', dash: [6, 4] }] : [],
    vlines: [{ value: mm(s.l), label: `L = ${si(s.l, 'm', 3)}` }],
    markers: [{ x: mm(s.l), y: mm(gridUp(d + s.c, s.step, s.dMin)), axis: 'h', label: `D ${si(gridUp(d + s.c, s.step, s.dMin), 'm', 3)}` }],
    legend: 'below',
  };
  // 2. routed opening growth vs cutter size
  const drHi = Math.max(2 * s.dr, Math.min(s.l, s.w) * 1.5, 1e-3);
  const drs = Array.from({ length: 121 }, (_, i) => (drHi * i) / 120);
  const rg: GraphSpec = {
    id: 'growth-vs-cutter',
    title: 'Routed opening growth vs cutter',
    subtitle: 'growth per side for a square-cornered part · c/2 floor',
    x: { label: 'Cutter diameter d_r', unit: 'mm' },
    y: [{ id: 'g', label: 'Length', unit: 'mm', includeZero: true }],
    series: [
      { label: 'Growth per side g', x: drs.map(mm), y: drs.map((x) => mm(growth(x / 2, s.c))), axis: 'g', width: 2.2 },
      { label: 'Corner radius r', x: drs.map(mm), y: drs.map((x) => mm(x / 2)), axis: 'g', color: '#c47b17', width: 1.4, dash: [5, 3] },
    ],
    vlines: [{ value: mm(s.dr), label: `d_r = ${si(s.dr, 'm', 3)}` }, { value: mm(Math.min(s.l, s.w) + 2 * growth(s.dr / 2, s.c)), label: 'opening short side', color: '#8b1e1e', dash: [6, 4] }],
    markers: [{ x: mm(s.dr), y: mm(growth(s.dr / 2, s.c)), axis: 'g', label: si(growth(s.dr / 2, s.c), 'm', 3) }],
  };
  return [hd, rg];
}

export const def: CalcDef<ApState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Diagonal d = √(L² + W²), the diameter of the smallest circle containing the rectangle; covering finished hole = d + c rounded up to the fabricator’s grid, with c the IPC-7251 hole-over-lead allowance (0.25 / 0.20 / 0.15 mm for levels A / B / C) for a lead; routed inside corners keep the cutter radius r = d_r/2, so a square-cornered part needs each side grown by max(c/2, r − (r − c/2)/√2) to keep c/2 at its corners too (or dog-bone reliefs at r/√2). Sides solved in closed form from a target diagonal.',
  fields,
  defaults,
  solve: {
    default: 'd',
    analysis: 'd',
    options: [
      { key: 'd', label: 'Diagonal, covering hole and routed opening' },
      { key: 'l', label: 'Longest length for a diagonal (a given drill)' },
      { key: 'w', label: 'Widest width for a diagonal (a given drill)' },
    ],
  },
  compute,
  sync: (s) => {
    fitImperial(s, s.solveFor, `${s.solveFor}Unit`);
    if (s.fit !== 'custom' && Math.abs(FIT_C[s.fit] - s.c) > 1e-12) s.fit = 'custom';
    if (s.fit === 'custom') for (const [k, v] of Object.entries(FIT_C)) if (Math.abs(v - s.c) <= 1e-12) s.fit = k as Fit;
  },
  examples: [
    { id: 'default', label: '0.64 mm square header pin, IPC-7251 level B', state: defaults() },
    {
      id: 'drill-2-5',
      label: 'Widest 2 mm opening one 2.5 mm drill covers',
      state: { solveFor: 'w', l: 2e-3, lUnit: 'mm', d: 2.5e-3, dUnit: 'mm', w: 1e-3, wUnit: 'mm', fit: 'clear', c: 0, step: 0.05e-3, dMin: 0.15e-3, dMax: 6.5e-3, dr: 1e-3, drUnit: 'mm' },
    },
    {
      id: 'shell-tab',
      label: 'Connector shell tab 1.7 × 0.6 mm: hole or 0.6 mm routed slot',
      state: { solveFor: 'd', l: 1.7e-3, lUnit: 'mm', w: 0.6e-3, wUnit: 'mm', fit: 'B', c: 0.2e-3, step: 0.05e-3, dMin: 0.15e-3, dMax: 6.5e-3, dr: 0.6e-3, drUnit: 'mm' },
    },
    {
      id: 'm3-slot',
      label: 'M3 adjustment slot 6.0 × 3.2 mm: too big to drill, routed',
      state: { solveFor: 'd', l: 6e-3, lUnit: 'mm', w: 3.2e-3, wUnit: 'mm', fit: 'clear', c: 0, step: 0.05e-3, dMin: 0.15e-3, dMax: 6.5e-3, dr: 2e-3, drUnit: 'mm' },
    },
    {
      id: 'square-1-14',
      label: '0.045″ (1.14 mm) square post, level C, 0.1 mm grid',
      state: { solveFor: 'd', l: 1.143e-3, lUnit: 'mm', w: 1.143e-3, wUnit: 'mm', fit: 'C', c: 0.15e-3, step: 0.1e-3, stepUnit: 'mm', dMin: 0.2e-3, dMax: 6.5e-3, dr: 1e-3, drUnit: 'mm' },
    },
  ],
};
