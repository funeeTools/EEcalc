/** Padstack & annular ring — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TableSpec, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, U_ROUGH } from '@/core/unitsets';
import { LEVELS, REQS, type Req, type Requirement, breakout, maxHole, minLand, worstRing } from './model';

export const ID = 'pcb/padstack-annular-ring';

export const REQ_OPTIONS: { value: Req; label: string }[] = [
  { value: 'c3', label: 'IPC-2221 design rule / Class 3 (50 / 25 µm ring)' },
  { value: 'c2t', label: 'Class 2, no breakout (tangency)' },
  { value: 'c2', label: 'Class 2, ≤ 90° breakout' },
  { value: 'c1', label: 'Class 1, ≤ 180° breakout' },
  { value: 'custom', label: 'Custom ring' },
];

export const LEVEL_OPTIONS = [
  { value: 'A', label: 'Level A, general (c = 0.4 mm)' },
  { value: 'B', label: 'Level B, moderate (c = 0.25 mm)' },
  { value: 'C', label: 'Level C, high (c = 0.2 mm)' },
  { value: 'custom', label: 'Fabricator’s own allowance' },
];

export type RingSolve = 'ratio' | 'pad' | 'fhs';

export interface RingState {
  solveFor: RingSolve;
  /** Pad over the minimum pad (%): computed, or the target when solving the pad or the hole */
  ratio: number;
  req: Req;
  bExt: number;
  bExtUnit: string;
  bInt: number;
  bIntUnit: string;
  level: string;
  c: number;
  cUnit: string;
  fhs: number;
  fhsUnit: string;
  tol: number;
  tolUnit: string;
  allow: number;
  allowUnit: string;
  pad: number;
  padUnit: string;
  maskExp: number;
  maskExpUnit: string;
  h: number;
  hUnit: string;
}

export const defaults = (): RingState => ({
  solveFor: 'pad',
  ratio: 100,
  req: 'c3',
  bExt: 50e-6,
  bExtUnit: 'µm',
  bInt: 25e-6,
  bIntUnit: 'µm',
  level: 'B',
  c: 0.25e-3,
  cUnit: 'mm',
  fhs: 0.25e-3,
  fhsUnit: 'mm',
  tol: 0.05e-3,
  tolUnit: 'mm',
  allow: 0.1e-3,
  allowUnit: 'mm',
  pad: 0.7e-3,
  padUnit: 'mm',
  maskExp: 0.05e-3,
  maskExpUnit: 'mm',
  h: 1.6e-3,
  hUnit: 'mm',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Requirement',
    note: 'Click ◎ on the pad or the hole to size it; click the ratio to check the padstack as entered.',
    fields: [
      { kind: 'number', key: 'ratio', symbol: 'D/D_min', label: 'Pad / minimum pad', suffix: '%', min: 1e-3, max: 1e6, solvable: true, help: '100 % = exactly the minimum pad for this hole, class and allowance. Target when solving the pad or the hole (say 110 % for margin); otherwise how far the pad entered exceeds the minimum.' },
      { kind: 'select', key: 'req', label: 'Requirement', options: REQ_OPTIONS, apply: (v, s) => setReq(s as RingState, v) },
      { kind: 'number', key: 'bExt', symbol: 'b_ext', label: 'Ring, external', units: U_ROUGH, unitKey: 'bExtUnit', min: 0, max: 1e-3, visible: (s) => s.req === 'custom', help: 'Required annular ring on the outer layers, from the finished hole edge to the pad edge.' },
      { kind: 'number', key: 'bInt', symbol: 'b_int', label: 'Ring, internal', units: U_ROUGH, unitKey: 'bIntUnit', min: 0, max: 1e-3, visible: (s) => s.req === 'custom', help: 'Required annular ring on the inner layers, from the drilled hole edge to the pad edge.' },
      { kind: 'select', key: 'level', label: 'Producibility', options: LEVEL_OPTIONS, apply: (v, s) => setLevel(s as RingState, v), help: 'IPC-2221 Table 9-1 standard fabrication allowance: registration plus drill wander, as a diameter.' },
      { kind: 'number', key: 'c', symbol: 'c', label: 'Fab allowance', units: U_LEN_PCB, unitKey: 'cUnit', min: 0, max: 2e-3, help: 'Diametral allowance for drill wander and layer registration: the hole may land c/2 off the pad centre.' },
    ],
  },
  {
    kind: 'section',
    title: 'Hole & pad',
    fields: [
      { kind: 'number', key: 'fhs', symbol: 'd_fin', label: 'Finished hole', units: U_LEN_PCB, unitKey: 'fhsUnit', min: 20e-6, max: 10e-3, solvable: true, onSolve: (_s, r) => leaveAnalysis(r as RingState, 'fhs'), help: 'Nominal finished (plated) hole diameter, as on the drawing. Solving gives the largest hole the pad accepts.' },
      { kind: 'number', key: 'tol', symbol: '+Δd', label: 'Hole tolerance (+)', units: U_LEN_PCB, unitKey: 'tolUnit', min: 0, max: 1e-3, help: 'Plus tolerance of the finished hole (e.g. ±0.05 mm for vias, ±0.08 mm for component holes). The largest hole sets the external ring.' },
      { kind: 'number', key: 'allow', symbol: 'Δ_drill', label: 'Drill allowance', units: U_LEN_PCB, unitKey: 'allowUnit', min: 0, max: 1e-3, help: 'Drill minus finished hole: twice the plating plus the fabricator’s margin, typically 0.1 mm. The drill sets the internal ring.' },
      { kind: 'number', key: 'pad', symbol: 'D', label: 'Pad diameter', units: U_LEN_PCB, unitKey: 'padUnit', min: 50e-6, max: 20e-3, solvable: true, onSolve: (_s, r) => leaveAnalysis(r as RingState, 'pad'), help: 'Land diameter, the same on every layer. Solving gives the smallest pad that meets the requirement (times the ratio).' },
      { kind: 'number', key: 'maskExp', symbol: 'e_mask', label: 'Mask expansion', units: U_LEN_PCB, unitKey: 'maskExpUnit', min: 0, max: 1e-3, help: 'Solder-mask opening beyond the pad edge, per side. Drawing and mask-opening result only.' },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Board thickness', units: U_LEN_PCB, unitKey: 'hUnit', min: 0.1e-3, max: 10e-3, help: 'For the aspect ratio and the cross-section drawing.' },
    ],
  },
];

/**
 * ◎ on the pad or the hole. Coming from the check (ratio computed), the ratio box turns into a target: start it at
 * 100 % so the analysed ratio (say 83 % of a pad that is too small) is not carried over as the new target (§5a).
 */
function leaveAnalysis(s: RingState, to: 'pad' | 'fhs'): void {
  if (s.solveFor === 'ratio') s.ratio = 100;
  s.solveFor = to;
}

function setReq(s: RingState, v: Req): void {
  if (v === 'custom') return;
  s.bExt = REQS[v].bExt;
  s.bInt = REQS[v].bInt;
}

function setLevel(s: RingState, v: string): void {
  const c = LEVELS[v];
  if (c != null) s.c = c;
}

export function requirement(s: Pick<RingState, 'req' | 'bExt' | 'bInt'>): Requirement {
  return s.req === 'custom' ? { bExt: s.bExt, bInt: s.bInt, theta: 0 } : REQS[s.req];
}

const fLen = (m: number) => (m === 0 ? '0' : si(m, 'm', 4));
/** Ring widths: µm below 1 mm (they are often zero or negative, where an SI prefix would mislead). */
const um = (x: number) => (Math.abs(x) < 1e-3 ? `${(x * 1e6).toFixed(Math.abs(x) < 10e-6 ? 1 : 0)} µm` : fLen(x));
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(0)}°`;

function num(name: string, v: unknown, strict = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (strict ? !(v > 0) : !(v >= 0)) throw new Error(`${name} must be ${strict ? '> 0' : '≥ 0'}.`);
  return v;
}

function fail(msg: string, s: RingState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

/** Minimum pads for a finished hole (external from the largest finished hole, internal from the drill). */
export function minPads(fhs: number, tol: number, allow: number, rq: Requirement, c: number): { ext: number; int: number; aExt: number; aInt: number } {
  const aExt = fhs + tol;
  const aInt = fhs + allow;
  return { ext: minLand(aExt, rq.bExt, rq.theta, c), int: minLand(aInt, rq.bInt, rq.theta, c), aExt, aInt };
}

export function compute(st: RingState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness (§12.3) triage: the remaining "error-after-edit" mediums are typed ratios, pads or tolerances
 * that put the answer outside the field ranges (a pad of nanometres or metres, no hole small enough, every hole fits);
 * each message says which limit is hit. One "high" error-after-switch is reviewed and kept: ◎ on the finished hole
 * when the pad cannot take even the smallest hole at 100 % (e.g. a 0.5 mm pad with a 0.47 mm fab allowance). The user
 * asked for exactly that answer (§5a: ◎ clicks report their own errors), and the message says why none exists.
 */
function run(st: RingState): CalcReport {
  const s: RingState = { ...st };
  const k = s.solveFor;
  if (!['ratio', 'pad', 'fhs'].includes(k)) throw new Error('solveFor must be ratio, pad or fhs.');
  if (!REQ_OPTIONS.some((o) => o.value === s.req)) throw new Error('Unknown requirement.');
  if (k !== 'ratio') num('Target pad / minimum', s.ratio);
  if (k !== 'fhs') num('Finished hole', s.fhs);
  if (k !== 'pad') num('Pad diameter', s.pad);
  num('Hole tolerance', s.tol, false);
  num('Drill allowance', s.allow, false);
  num('Fab allowance', s.c, false);
  num('Mask expansion', s.maskExp, false);
  num('Board thickness', s.h);
  if (s.req === 'custom') {
    num('External ring', s.bExt, false);
    num('Internal ring', s.bInt, false);
  }
  const rq = requirement(s);
  const gov = (fhs: number) => {
    const m = minPads(fhs, s.tol, s.allow, rq, s.c);
    return Math.max(m.ext, m.int);
  };
  const tgt = s.ratio / 100;

  if (k === 'pad') {
    s.pad = tgt * gov(s.fhs);
    if (!(s.pad >= 50e-6 && s.pad <= 20e-3)) return fail(`The pad would be ${fLen(s.pad)}, outside the 0.05–20 mm field range.`, s);
  } else if (k === 'fhs') {
    // the governing minimum pad grows with the hole: find the finished hole whose minimum pad × ratio = D
    const g = (fhs: number) => tgt * gov(fhs) - s.pad;
    const lo = 20e-6;
    const hi = 10e-3;
    if (g(lo) > 0) return fail(`Even a ${fLen(lo)} hole needs a pad of ${fLen(tgt * gov(lo))} (at ${pct(tgt)} of the minimum): the fab allowance and ring alone exceed the ${fLen(s.pad)} pad. Enlarge the pad or choose a tighter producibility level.`, s);
    if (g(hi) < 0) return fail(`Every finished hole up to ${fLen(hi)} fits the ${fLen(s.pad)} pad at ${pct(tgt)} of the minimum: the pad is far larger than any hole needs. Check the pad and the ratio.`, s);
    s.fhs = brent(g, lo, hi, 1e-15);
  }
  const mp = minPads(s.fhs, s.tol, s.allow, rq, s.c);
  const dMin = Math.max(mp.ext, mp.int);
  const ratio = s.pad / dMin;
  if (k === 'ratio') {
    if (!(ratio >= 1e-5 && ratio <= 1e4)) return fail(`Pad / minimum = ${pct(ratio)} is outside the field range.`, s);
    s.ratio = ratio * 100;
  }
  return report(s, rq, mp, dMin);
}

function report(s: RingState, rq: Requirement, mp: ReturnType<typeof minPads>, dMin: number): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const e = s.c / 2;
  const ok = s.pad >= dMin * (1 - 1e-9);
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const layer = (name: 'ext' | 'int', a: number, b: number, dm: number) => {
    // snap rounding noise (1e-20 m rings, 1e-8 rad arcs at exact tangency) to zero
    const wc0 = worstRing(s.pad, a, e);
    const wc = Math.abs(wc0) < 1e-12 ? 0 : wc0;
    const bo0 = breakout(s.pad, a, e);
    const bo = bo0 < 1e-6 ? 0 : bo0;
    const lab = name === 'ext' ? 'External' : 'Internal';
    const pass = s.pad >= dm * (1 - 1e-9);
    return [
      item(`${name}Hole`, name === 'ext' ? 'Largest finished hole' : 'Drill', a, 'm', fLen(a), { symbol: name === 'ext' ? 'a_ext' : 'a_int', group: lab, note: name === 'ext' ? 'd_fin + Δd' : 'd_fin + Δ_drill' }),
      item(`${name}Nom`, 'Nominal ring', (s.pad - a) / 2, 'm', um((s.pad - a) / 2), { symbol: 'b_nom', group: lab, note: 'hole centred' }),
      item(`${name}Wc`, 'Worst-case ring', wc, 'm', wc >= 0 ? um(wc) : `${um(wc)} (breakout)`, { symbol: 'b_wc', group: lab, tone: pass ? '' : 'fail', note: `hole ${fLen(e)} off centre` }),
      item(`${name}Bo`, 'Breakout at worst case', bo, 'rad', bo > 0 ? deg(bo) : 'none', { symbol: 'θ_bo', group: lab, tone: rq.theta > 0 && bo > rq.theta * (1 + 1e-9) ? 'fail' : '' }),
      item(`${name}Min`, 'Minimum pad', dm, 'm', fLen(dm), { symbol: 'D_min', group: lab, note: rq.theta > 0 ? `≤ ${deg(rq.theta)} breakout` : `a + 2b + c, b = ${fLen(b)}` }),
    ];
  };
  const prim: ResultItem[] = [];
  if (k === 'pad') prim.push(item('pad', 'Pad diameter', s.pad, 'm', fLen(s.pad), { symbol: 'D', primary: true, solved: true, note: `${(s.pad / 25.4e-6).toFixed(1)} mil${Math.abs(s.ratio - 100) > 1e-7 ? ` · ${s.ratio.toPrecision(4)} % of minimum` : ''}` }));
  if (k === 'fhs') prim.push(item('fhs', 'Largest finished hole', s.fhs, 'm', fLen(s.fhs), { symbol: 'd_fin', primary: true, solved: true, note: `drill ${fLen(s.fhs + s.allow)}` }));
  prim.push(item('ratio', 'Pad / minimum pad', s.ratio, '%', `${s.ratio.toFixed(1)} %`, { symbol: 'D/D_min', primary: true, solved: k === 'ratio', tone: ok ? 'pass' : 'fail', note: `minimum ${fLen(dMin)}, ${mp.ext >= mp.int ? 'external' : 'internal'} layers govern` }));
  prim.push(item('minExt', 'Minimum pad, external', mp.ext, 'm', fLen(mp.ext), { symbol: 'D_min,ext', primary: true }));
  prim.push(item('minInt', 'Minimum pad, internal', mp.int, 'm', fLen(mp.int), { symbol: 'D_min,int', primary: true }));
  const wcExt = worstRing(s.pad, mp.aExt, e);
  const wcInt = worstRing(s.pad, mp.aInt, e);
  const sec: ResultItem[] = [
    ...layer('ext', mp.aExt, rq.bExt, mp.ext),
    ...layer('int', mp.aInt, rq.bInt, mp.int),
    item('offset', 'Worst-case hole offset', e, 'm', fLen(e), { symbol: 'e', group: 'Fabrication', note: 'c / 2' }),
    item('mask', 'Mask opening', s.pad + 2 * s.maskExp, 'm', fLen(s.pad + 2 * s.maskExp), { symbol: 'D_mask', group: 'Fabrication', note: 'D + 2·e_mask' }),
    item('ar', 'Aspect ratio', s.h / (s.fhs + s.allow), '', `${(s.h / (s.fhs + s.allow)).toFixed(2)} : 1`, { symbol: 'H/d_drill', group: 'Fabrication' }),
  ];
  // the inverse check, for the report: the largest hole this pad takes
  const hMax = Math.min(maxHole(s.pad, rq.bExt, rq.theta, s.c) - s.tol, maxHole(s.pad, rq.bInt, rq.theta, s.c) - s.allow);
  sec.push(item('maxFhs', 'Largest hole for this pad', hMax > 0 ? hMax : null, 'm', hMax > 0 ? fLen(hMax) : 'none fits', { symbol: 'd_fin,max', group: 'Fabrication', note: 'finished, at 100 % of the minimum' }));
  rep.results = [...prim, ...sec];
  rep.status = ok ? { text: 'MEETS ' + labelOf(s.req).toUpperCase(), tone: 'pass' } : { text: 'PAD TOO SMALL', tone: 'fail' };
  rep.tables = [classTable(s)];

  if (!ok) rep.warnings.push(`The ${fLen(s.pad)} pad is below the ${fLen(dMin)} minimum: at the worst-case drill position the ring is ${um(Math.min(wcExt, wcInt))}${rq.theta > 0 ? `, breakout ${deg(Math.max(breakout(s.pad, mp.aExt, e), breakout(s.pad, mp.aInt, e)))} (limit ${deg(rq.theta)})` : ''}. Enlarge the pad to ${fLen(dMin)}, use a smaller hole, or ask for a tighter producibility level.`);
  if (rq.theta > 0) rep.notes.push(`${labelOf(s.req)} accepts breakout at the worst-case position. Where a trace joins the pad, IPC-6012 also limits how much the breakout may narrow the junction; teardrops keep it intact.`);
  if (s.h / (s.fhs + s.allow) > 10) rep.warnings.push(`Aspect ratio ${(s.h / (s.fhs + s.allow)).toFixed(1)}:1 is above the ~8–10:1 most fabricators plate reliably. Use a larger drill or a thinner board.`);
  if (s.allow < 0.05e-3) rep.notes.push(`A drill allowance of ${fLen(s.allow)} leaves little room for plating (two walls of ≥ 20–25 µm). Fabricators usually drill about 0.1 mm over the finished hole.`);
  rep.notes.push(
    'External rings are measured from the largest finished hole, internal rings from the drilled hole (IPC-6012).',
    'Plated (supported) holes only. Copper heavier than 1 oz and boards over eight layers may need a larger allowance than the Table 9-1 figure; ask your fabricator.',
  );
  rep.summary = `${fLen(s.fhs)} finished hole (drill ${fLen(s.fhs + s.allow)}), c = ${fLen(s.c)} · ${labelOf(s.req)} · minimum pad ${fLen(dMin)}`;
  rep.details = { ...mp, dMin, e, wcExt, wcInt, hMax };
  rep.graphs = graphs(s, rq, mp, dMin);
  return rep;
}

const labelOf = (r: Req) => ({ c3: 'Class 3 / IPC-2221', c2t: 'Class 2, tangency', c2: 'Class 2', c1: 'Class 1', custom: 'custom ring' })[r];

function classTable(s: RingState): TableSpec {
  const rows = REQ_OPTIONS.filter((o) => o.value !== 'custom' || s.req === 'custom').map((o) => {
    const rq = requirement({ ...s, req: o.value });
    const mp = minPads(s.fhs, s.tol, s.allow, rq, s.c);
    const dMin = Math.max(mp.ext, mp.int);
    return { req: o.label, minExt: mp.ext, minInt: mp.int, ratio: s.pad / dMin };
  });
  return {
    id: 'classes',
    title: 'This padstack against each requirement',
    columns: [{ key: 'req', label: 'Requirement' }, { key: 'minExt', label: 'Min pad, ext', unit: 'm', align: 'right' }, { key: 'minInt', label: 'Min pad, int', unit: 'm', align: 'right' }, { key: 'ratio', label: 'D / D_min', align: 'right' }],
    rows,
    display: rows.map((r) => ({ req: r.req, minExt: fLen(r.minExt), minInt: fLen(r.minInt), ratio: pct(r.ratio) })),
    rowTones: rows.map((r) => (r.ratio >= 1.1 ? 'pass' : r.ratio >= 1 - 1e-9 ? 'warn' : 'fail')),
    note: `Same hole (${fLen(s.fhs)} finished) and allowance (c = ${fLen(s.c)}); pad ${fLen(s.pad)}. Green: at least 10 % over the minimum; yellow: within 10 %; red: too small.`,
  };
}

function graphs(s: RingState, rq: Requirement, mp: ReturnType<typeof minPads>, dMin: number): GraphSpec[] {
  const hLo = 0.05e-3;
  const hHi = Math.max(3 * s.fhs, 1.5e-3);
  const hs = Array.from({ length: 121 }, (_, i) => hLo + ((hHi - hLo) * i) / 120);
  const colors: Record<Req, string> = { c3: '#1f4e5f', c2t: '#4f8a8b', c2: '#c47b17', c1: '#6b5b95', custom: '#2f7d4f' };
  const series = REQ_OPTIONS.filter((o) => o.value !== 'custom' || s.req === 'custom').map((o) => {
    const r = requirement({ ...s, req: o.value });
    return { label: o.label, x: hs, y: hs.map((h) => { const m = minPads(h, s.tol, s.allow, r, s.c); return Math.max(m.ext, m.int); }), color: colors[o.value], width: o.value === s.req ? 2.4 : 1.2, dash: o.value === s.req ? undefined : [5, 3] };
  });
  const e = s.c / 2;
  const eHi = Math.max(s.pad / 2, 2 * e, 0.1e-3);
  const es = Array.from({ length: 161 }, (_, i) => (eHi * i) / 160);
  return [
    {
      id: 'min-pad',
      title: 'Minimum pad vs finished hole',
      subtitle: `c = ${fLen(s.c)}, +Δd = ${fLen(s.tol)}, drill = hole + ${fLen(s.allow)}`,
      x: { label: 'Finished hole d_fin', unit: 'm' },
      y: [{ id: 'd', label: 'Minimum pad', unit: 'm' }],
      legend: 'below',
      series,
      hlines: [{ value: s.pad, label: `D = ${fLen(s.pad)}`, color: '#9a8f7a', dash: [3, 3] }],
      vlines: [{ value: s.fhs, label: `d_fin = ${fLen(s.fhs)}` }],
      markers: [{ x: s.fhs, y: dMin, label: fLen(dMin) }],
    },
    {
      id: 'breakout',
      title: 'Breakout vs drill offset',
      subtitle: `pad ${fLen(s.pad)}`,
      x: { label: 'Hole offset from pad centre', unit: 'm' },
      y: [{ id: 'b', label: 'Breakout arc', unit: '°', includeZero: true, max: 360 }],
      series: [
        { label: 'External', x: es, y: es.map((x) => (breakout(s.pad, mp.aExt, x) * 180) / Math.PI), width: 2.2 },
        { label: 'Internal', x: es, y: es.map((x) => (breakout(s.pad, mp.aInt, x) * 180) / Math.PI), width: 1.6, dash: [5, 3] },
      ],
      hlines: rq.theta > 0 ? [{ value: (rq.theta * 180) / Math.PI, label: `${deg(rq.theta)} allowed`, dash: [5, 4] }] : [{ value: 0.5, label: 'no breakout allowed', dash: [5, 4] }],
      vlines: [{ value: e, label: `c/2 = ${fLen(e)}` }],
    },
  ];
}

export const def: CalcDef<RingState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Minimum land D = a + 2b + c (IPC-2221B §9.1.1): a = largest finished hole (external) or drill (internal), b from IPC-2221B Table 9-2 / IPC-6012 Class 3 (50 µm external, 25 µm internal), c from Table 9-1 by producibility level (0.4 / 0.25 / 0.2 mm). Classes that accept breakout (IPC-6012 Class 2: 90°, Class 1: 180°) from the exact geometry of a hole offset c/2 in a round pad. Pad and largest hole solved on the same equations.',
  fields,
  defaults,
  solve: {
    default: 'pad',
    analysis: 'ratio',
    options: [
      { key: 'ratio', label: 'Check the padstack as entered (analysis)' },
      { key: 'pad', label: 'Smallest pad D for the hole' },
      { key: 'fhs', label: 'Largest finished hole for the pad' },
    ],
  },
  compute,
  sync: (s) => {
    if (s.req !== 'custom') {
      const r = REQS[s.req];
      if (Math.abs(r.bExt - s.bExt) > 1e-12 || Math.abs(r.bInt - s.bInt) > 1e-12) s.req = 'custom';
    }
    const c = LEVELS[s.level];
    if (c != null && Math.abs(c - s.c) > 1e-12) s.level = 'custom';
  },
  examples: [
    { id: 'default', label: '0.25 mm via (0.35 mm drill), IPC-2221 rule, level B: smallest pad', state: defaults() },
    { id: 'class2-via', label: 'Same via, Class 2 with 90° breakout: smallest pad', state: { ...defaults(), req: 'c2', bExt: 0, bInt: 0 } },
    { id: 'check-05', label: 'Check: 0.3 mm drill in a 0.5 mm pad, level B', state: { ...defaults(), solveFor: 'ratio', fhs: 0.2e-3, tol: 0.05e-3, allow: 0.1e-3, pad: 0.5e-3 } },
    { id: 'component', label: '1.0 mm component hole, level A: smallest pad', state: { ...defaults(), fhs: 1.0e-3, tol: 0.08e-3, allow: 0.1e-3, level: 'A', c: 0.4e-3 } },
    { id: 'max-hole', label: 'Largest hole for a 0.6 mm pad, level C, Class 3', state: { ...defaults(), solveFor: 'fhs', ratio: 100, pad: 0.6e-3, level: 'C', c: 0.2e-3 } },
  ],
};
