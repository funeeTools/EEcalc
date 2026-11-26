/** Maximum pad diameter — calculator definition (inputs, solve-for, report). DOM-free. */

import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TableSpec, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB } from '@/core/unitsets';
import { LEVEL_OPTIONS, minPads } from '@/calculators/annular-ring/def';
import { LEVELS, REQS, clearanceFor, dMaxForN, maxHole, pitchFor, wMaxForN } from './model';

export const ID = 'pcb/maximum-pad-diameter';

export type MaxSolve = 'd' | 'p' | 's' | 'w';
export type ReqKey = 'c3' | 'c2t' | 'c2' | 'c1';

export const REQ_OPTIONS: { value: ReqKey; label: string }[] = [
  { value: 'c3', label: 'IPC-2221 rule / Class 3 (50 / 25 µm ring)' },
  { value: 'c2t', label: 'Class 2, no breakout (tangency)' },
  { value: 'c2', label: 'Class 2, ≤ 90° breakout' },
  { value: 'c1', label: 'Class 1, ≤ 180° breakout' },
];

export interface MaxPadState {
  solveFor: MaxSolve;
  p: number;
  pUnit: string;
  n: number;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
  d: number;
  dUnit: string;
  padType: 'smd' | 'pth';
  maskExp: number;
  maskExpUnit: string;
  fhs: number;
  fhsUnit: string;
  tol: number;
  tolUnit: string;
  allow: number;
  allowUnit: string;
  req: ReqKey;
  level: string;
  c: number;
  cUnit: string;
}

const MM = 1e-3;

export const defaults = (): MaxPadState => ({
  solveFor: 'd',
  p: 2.54 * MM,
  pUnit: 'mm',
  n: 2,
  w: 0.2 * MM,
  wUnit: 'mm',
  s: 0.2 * MM,
  sUnit: 'mm',
  d: 1.54 * MM,
  dUnit: 'mm',
  padType: 'pth',
  maskExp: 0.05 * MM,
  maskExpUnit: 'mm',
  fhs: 1.0 * MM,
  fhsUnit: 'mm',
  tol: 0.08 * MM,
  tolUnit: 'mm',
  allow: 0.1 * MM,
  allowUnit: 'mm',
  req: 'c3',
  level: 'B',
  c: 0.25 * MM,
  cUnit: 'mm',
});

/** Field limits, shared by the form and the solver's range checks. */
/** Solvable ranges cover every answer the other fields allow (§5a): D, s and W can each approach the 20 mm pitch. */
const LIM = { p: [0.1 * MM, 50 * MM], d: [0.02 * MM, 20 * MM], s: [5e-6, 20 * MM], w: [5e-6, 20 * MM] } as const;

const len = (key: string, symbol: string, label: string, lim: readonly [number, number], extra: Record<string, unknown> = {}): FieldSpec =>
  ({ kind: 'number', key, symbol, label, units: U_LEN_PCB, unitKey: `${key}Unit`, min: lim[0], max: lim[1], ...extra }) as FieldSpec;

const pth = (s: Record<string, any>) => s.padType === 'pth';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Grid & routing',
    note: 'Click ◎ on the pad, the pitch, the clearance or the trace width to solve for it.',
    fields: [
      len('p', 'p', 'Pitch', LIM.p, { solvable: true, help: 'Centre-to-centre distance to the nearest neighbouring pad. On a staggered array use the shortest (often diagonal) distance.' }),
      { kind: 'number', key: 'n', symbol: 'N', label: 'Traces between pads', integer: true, min: 0, max: 10, help: 'Conductors routed through the gap between the two pads. 0 = pad-to-pad clearance only.' },
      len('w', 'W', 'Trace width', LIM.w, { solvable: true, visible: (s: Record<string, any>) => s.n > 0 || s.solveFor === 'w', help: 'Width of each conductor through the gap. Click ◎ for the widest trace that still lets N through.' }),
      len('s', 's', 'Clearance', LIM.s, { solvable: true, help: 'Copper-to-copper spacing, used between pad and trace and between traces (your fabricator’s rule, or IPC-2221 Table 6-1 for the voltage).' }),
    ],
  },
  {
    kind: 'section',
    title: 'Pad',
    fields: [
      len('d', 'D', 'Pad diameter', LIM.d, { solvable: true, help: 'Round land diameter. Solved: the largest pad the pitch allows. Otherwise the pad you want, for solving the pitch, clearance or trace width.' }),
      {
        kind: 'select',
        key: 'padType',
        label: 'Pad type',
        options: [{ value: 'pth', label: 'Plated hole (PTH or via)' }, { value: 'smd', label: 'Surface land (no hole)' }],
        help: 'A plated hole adds the IPC-2221 minimum land a + 2b + c, so you see whether the largest pad still holds its annular ring.',
      },
      len('maskExp', 'e_mask', 'Mask expansion', [0, 1 * MM], { help: 'Solder-mask opening beyond the pad, per side. Sets the mask web left between neighbouring openings.' }),
    ],
  },
  {
    kind: 'section',
    title: 'Plated hole',
    visible: pth,
    fields: [
      len('fhs', 'd_fin', 'Finished hole', [20e-6, 10 * MM], { help: 'Nominal finished (plated) hole diameter.' }),
      len('tol', '+Δd', 'Hole tolerance (+)', [0, 1 * MM], { help: 'Plus tolerance of the finished hole; the largest hole sets the external ring.' }),
      len('allow', 'Δ_drill', 'Drill allowance', [0, 1 * MM], { help: 'Drill minus finished hole (plating plus margin), typically 0.1 mm. The drill sets the internal ring.' }),
      { kind: 'select', key: 'req', label: 'Ring requirement', options: REQ_OPTIONS, help: 'IPC-2221B Table 9-2 rings (= IPC-6012 Class 3), or the IPC-6012 Class 2 / Class 1 breakout allowances.' },
      { kind: 'select', key: 'level', label: 'Producibility', options: LEVEL_OPTIONS, apply: (v: string, sc: Record<string, any>) => { const c = LEVELS[v]; if (c != null) sc.c = c; }, help: 'IPC-2221B Table 9-1 fabrication allowance for drill wander and registration.' },
      len('c', 'c', 'Fab allowance', [0, 2 * MM], { help: 'Diametral allowance: the hole may land c/2 off the pad centre.' }),
    ],
  },
];

const f = (m: number) => (m === 0 ? '0' : si(m, 'm', 4));
const fmil = (m: number) => `${(m / 25.4e-6).toPrecision(3)} mil`;
const um = (x: number) => (Math.abs(x) < 1e-3 ? `${(x * 1e6).toFixed(Math.abs(x) < 10e-6 ? 1 : 0)} µm` : f(x));

function num(name: string, v: unknown, strict = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (strict ? !(v > 0) : !(v >= 0)) throw new Error(`${name} must be ${strict ? '> 0' : '≥ 0'}.`);
  return v;
}

function noSol(s: MaxPadState, error: string): CalcReport {
  return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' }, error };
}

const inRange = (k: keyof typeof LIM, v: number) => v >= LIM[k][0] * (1 - 1e-9) && v <= LIM[k][1] * (1 + 1e-9);

export function compute(st: MaxPadState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/** Minimum land for the plated hole (null for a surface land). */
export function holeMin(s: MaxPadState) {
  if (s.padType !== 'pth') return null;
  const rq = REQS[s.req];
  const mp = minPads(s.fhs, s.tol, s.allow, rq, s.c);
  return { ...mp, rq, dMin: Math.max(mp.ext, mp.int) };
}

/*
 * Mode-switch harness (§12.3) triage, reviewed: "unreadable" mediums on a solved length shown in inches (0.0009 in) come
 * from the user's own unit choice: inch has no prefixed forms for the core to move to, so they are left as chosen. error-after-edit flags come from typed extremes (pitch ÷ 10, N at
 * its maximum) that leave no room for the pad or a trace; the message names the term that fills the pitch.
 */
function run(st: MaxPadState): CalcReport {
  const s: MaxPadState = { ...st };
  const k = s.solveFor;
  if (!['d', 'p', 's', 'w'].includes(k)) throw new Error('solveFor must be d, p, s or w.');
  if (!['smd', 'pth'].includes(s.padType)) throw new Error('Unknown pad type.');
  if (!REQ_OPTIONS.some((o) => o.value === s.req)) throw new Error('Unknown ring requirement.');
  const n = Math.round(num('Traces between pads', s.n, false));
  s.n = n;
  if (k !== 'p') num('Pitch', s.p);
  if (k !== 'd') num('Pad diameter', s.d);
  if (k !== 's') num('Clearance', s.s);
  if (k !== 'w' && n > 0) num('Trace width', s.w);
  num('Mask expansion', s.maskExp, false);
  if (s.padType === 'pth') {
    num('Finished hole', s.fhs);
    num('Hole tolerance', s.tol, false);
    num('Drill allowance', s.allow, false);
    num('Fab allowance', s.c, false);
  }
  const wn = n > 0 ? s.w : 0; // conductors only count when there are some

  if (k === 'd') {
    const d = dMaxForN(s.p, wn, s.s, n);
    if (!inRange('d', d)) return noSol(s, `${n > 0 ? `${n} trace${n > 1 ? 's' : ''} of ${f(s.w)} and ` : ''}${n + 1} clearance${n ? 's' : ''} of ${f(s.s)} take ${f(n * wn + (n + 1) * s.s)} of the ${f(s.p)} pitch, leaving ${d > 0 ? f(d) : 'nothing'} for the pad. Use fewer or narrower traces, a smaller clearance or a larger pitch.`);
    s.d = d;
  } else if (k === 'p') {
    const p = pitchFor(s.d, wn, s.s, n);
    if (!inRange('p', p)) return noSol(s, `The pitch would be ${f(p)}, outside the 0.1–50 mm field range.`);
    s.p = p;
  } else if (k === 's') {
    const c = clearanceFor(s.p, s.d, wn, n);
    if (!inRange('s', c)) return noSol(s, c <= 0 ? `The ${f(s.d)} pad${n ? ` and ${n} × ${f(s.w)} of trace` : ''} already fill the ${f(s.p)} pitch: no clearance is left. Use a smaller pad, fewer or narrower traces, or a larger pitch.` : `The clearance would be ${f(c)}, outside the field range.`);
    s.s = c;
  } else {
    if (n < 1) return noSol(s, 'Enter at least N = 1 trace between the pads to size its width.');
    const w = wMaxForN(s.p - s.d, s.s, n);
    if (s.d >= s.p) return noSol(s, `${f(s.d)} pads on a ${f(s.p)} pitch overlap: no trace fits between them. Use a smaller pad or a larger pitch.`);
    if (!inRange('w', w)) return noSol(s, w <= 0 ? `${n + 1} clearances of ${f(s.s)} need ${f((n + 1) * s.s)}, but the gap between ${f(s.d)} pads on a ${f(s.p)} pitch is ${f(s.p - s.d)}: no trace fits. Use a smaller pad or clearance, or a larger pitch.` : `The trace would be ${f(w)}, outside the field range.`);
    s.w = w;
  }
  return report(s);
}

function report(s: MaxPadState): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const n = s.n;
  const wn = n > 0 ? s.w : 0;
  const gap = s.p - s.d;
  // mask web: with traces in the gap, the mask must also cover the traces, so the narrowest web is between an opening
  // and the nearest trace (s − e); with none, between the two openings
  const web = n > 0 ? s.s - s.maskExp : s.p - s.d - 2 * s.maskExp;
  const hm = holeMin(s);
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  const nTxt = n === 0 ? 'pad-to-pad' : `${n} × ${f(s.w)} between`;
  if (k === 'd') prim.push(item('d', 'Largest pad', s.d, 'm', f(s.d), { symbol: 'D_max', primary: true, solved: true, note: `${fmil(s.d)} · ${nTxt}` }));
  if (k === 'p') prim.push(item('p', 'Smallest pitch', s.p, 'm', f(s.p), { symbol: 'p_min', primary: true, solved: true, note: `${fmil(s.p)} · ${nTxt}` }));
  if (k === 's') prim.push(item('s', 'Largest clearance', s.s, 'm', f(s.s), { symbol: 's_max', primary: true, solved: true, note: `${fmil(s.s)} · ${nTxt}` }));
  if (k === 'w') prim.push(item('w', 'Widest trace', s.w, 'm', f(s.w), { symbol: 'W_max', primary: true, solved: true, note: `${fmil(s.w)} · ${n} between ${f(s.d)} pads` }));
  prim.push(item('gap', 'Gap between pads', gap, 'm', f(gap), { symbol: 'p − D', primary: true, note: `(N+1)·s = ${f((n + 1) * s.s)}${n ? ` + N·W = ${f(n * wn)}` : ''}` }));
  let ok = true;
  if (hm) {
    ok = s.d >= hm.dMin * (1 - 1e-9);
    prim.push(item('dMin', 'IPC minimum land', hm.dMin, 'm', f(hm.dMin), { symbol: 'D_min', primary: true, tone: ok ? 'pass' : 'fail', note: `a + 2b + c · margin ${s.d - hm.dMin >= 0 ? '+' : '−'}${um(Math.abs(s.d - hm.dMin))}` }));
  } else prim.push(item('ratio', 'Pad / pitch', s.d / s.p, '', `${((s.d / s.p) * 100).toFixed(1)} %`, { symbol: 'D/p', primary: true }));

  const sec: ResultItem[] = [
    item('clearTotal', 'Clearance consumed', (n + 1) * s.s, 'm', f((n + 1) * s.s), { symbol: '(N+1)·s', group: 'Channel' }),
    item('traceTotal', 'Trace copper', n * wn, 'm', n ? f(n * wn) : 'none', { symbol: 'N·W', group: 'Channel' }),
    item('ratioDp', 'Pad / pitch', s.d / s.p, '', `${((s.d / s.p) * 100).toFixed(1)} %`, { symbol: 'D/p', group: 'Channel' }),
    item('web', 'Mask web', web, 'm', web > 0 ? f(web) : n > 0 ? 'none (traces exposed)' : 'none (openings merge)', { symbol: n > 0 ? 's − e' : 'p − D − 2e', group: 'Channel', tone: web < 75e-6 ? 'warn' : '', note: n > 0 ? 'mask between an opening and the nearest trace' : 'between neighbouring mask openings' }),
    item('maskOpen', 'Mask opening', s.d + 2 * s.maskExp, 'm', f(s.d + 2 * s.maskExp), { symbol: 'D + 2e', group: 'Channel' }),
  ];
  if (hm) {
    const e = s.c / 2;
    const ringNom = (s.d - hm.aExt) / 2;
    const ringWc0 = ringNom - e;
    const ringWc = Math.abs(ringWc0) < 1e-12 ? 0 : ringWc0;
    const ringIntWc0 = (s.d - hm.aInt) / 2 - e;
    const ringIntWc = Math.abs(ringIntWc0) < 1e-12 ? 0 : ringIntWc0;
    const hMax = Math.min(maxHole(s.d, hm.rq.bExt, hm.rq.theta, s.c) - s.tol, maxHole(s.d, hm.rq.bInt, hm.rq.theta, s.c) - s.allow);
    const pMin = pitchFor(hm.dMin, wn, s.s, n);
    sec.push(
      item('dMinExt', 'Minimum land, external', hm.ext, 'm', f(hm.ext), { symbol: 'D_min,ext', group: 'Plated hole', note: `a = ${f(hm.aExt)} (largest finished hole)` }),
      item('dMinInt', 'Minimum land, internal', hm.int, 'm', f(hm.int), { symbol: 'D_min,int', group: 'Plated hole', note: `a = ${f(hm.aInt)} (drill)` }),
      item('ringNom', 'Ring, nominal (ext)', ringNom, 'm', um(ringNom), { symbol: 'b_nom', group: 'Plated hole', note: '(D − a_ext)/2, hole centred' }),
      item('ringWc', 'Ring, worst case (ext)', ringWc, 'm', ringWc >= 0 ? um(ringWc) : `${um(ringWc)} (breakout)`, { symbol: 'b_wc', group: 'Plated hole', note: `hole ${f(e)} off centre`, tone: ringWc < hm.rq.bExt - 1e-12 && hm.rq.theta === 0 ? 'fail' : '' }),
      item('ringIntWc', 'Ring, worst case (int)', ringIntWc, 'm', ringIntWc >= 0 ? um(ringIntWc) : `${um(ringIntWc)} (breakout)`, { symbol: 'b_wc,int', group: 'Plated hole', tone: ringIntWc < hm.rq.bInt - 1e-12 && hm.rq.theta === 0 ? 'fail' : '' }),
      item('hMax', 'Largest hole for this pad', hMax > 0 ? hMax : null, 'm', hMax > 0 ? f(hMax) : 'none fits', { symbol: 'd_fin,max', group: 'Plated hole', note: 'finished' }),
      item('pMin', 'Pitch for the minimum land', pMin, 'm', f(pMin), { symbol: 'p(D_min)', group: 'Plated hole', note: `D_min + N·W + (N+1)·s` }),
    );
    rep.status = ok ? { text: 'PAD ≥ IPC MINIMUM', tone: 'pass' } : { text: 'BELOW IPC MINIMUM LAND', tone: 'fail' };
    if (!ok) rep.warnings.push(`The ${f(s.d)} pad is below the ${f(hm.dMin)} IPC-2221 minimum land for a ${f(s.fhs)} hole (level ${s.level === 'custom' ? 'custom' : s.level}, c = ${f(s.c)}): ${k === 'd' ? 'even the largest pad the pitch allows cannot hold the ring. ' : ''}Use a smaller hole (≤ ${hMax > 0 ? f(hMax) : '—'}), a tighter producibility level or a breakout class, fewer or narrower traces, or a pitch of at least ${f(pMin)}.`);
  }
  rep.results = [...prim, ...sec];

  if (n > 0 && web <= 0) rep.warnings.push(`The ${f(s.maskExp)} mask expansion is at least the ${f(s.s)} clearance: the openings expose the traces next to the pads, and solder can bridge to them. Keep the expansion well under the clearance (≥ ~75 µm of mask over the gap).`);
  else if (web < 75e-6) rep.warnings.push(`Mask web ${n > 0 ? 'between an opening and the nearest trace' : 'between the openings'} is ${web > 0 ? f(web) : 'zero'}, below the ~75 µm a liquid photo-imageable mask holds reliably (rule of thumb): it may flake and let solder bridge. Reduce the mask expansion${n ? '' : ', use a gang opening'} or a smaller pad.`);
  if (n > 0 && s.w < 75e-6) rep.notes.push(`W = ${f(s.w)} (${fmil(s.w)}) is below the 75 µm (3 mil) most standard fabs hold: expect HDI pricing.`);
  if (s.s < 75e-6) rep.notes.push(`s = ${f(s.s)} is below the 75 µm (3 mil) most standard fabs hold.`);
  rep.notes.push('D_max is a ceiling, not a recommended size: at the limit every clearance is at its minimum. Size the pad for its hole or component first (IPC-2221, IPC-7351), then check it against this ceiling.');
  rep.notes.push('Round pads on a straight line between centres; traces straight and centred in the gap; one clearance rule for pad–trace and trace–trace. On staggered or diagonal routing use the shortest centre distance as p.');
  rep.summary = `${f(s.p)} pitch · ${n === 0 ? 'no traces' : `${n} × ${f(s.w)}`} at s = ${f(s.s)} · D = ${f(s.d)}${hm ? ` · ${f(s.fhs)} hole needs ≥ ${f(hm.dMin)}` : ''}`;
  rep.details = { gap, web, dMin: hm?.dMin ?? null };
  rep.tables = [pitchTable(s, hm?.dMin ?? null)];
  rep.graphs = graphs(s, hm?.dMin ?? null);
  return rep;
}

const STD_PITCH = [2.54, 2.0, 1.27, 1.0, 0.8, 0.65, 0.5].map((x) => x * MM);

function pitchTable(s: MaxPadState, dMin: number | null): TableSpec {
  const wn = s.w;
  const rows = STD_PITCH.map((p) => {
    const r: Record<string, number | string | null> = { p };
    for (let n = 0; n <= 3; n++) {
      const d = dMaxForN(p, n ? wn : 0, s.s, n);
      r[`n${n}`] = d > 0 ? d : null;
    }
    return r;
  });
  const sel = Math.min(Math.max(s.n, 0), 3);
  return {
    id: 'pitches',
    title: 'Largest pad at common pitches',
    columns: [{ key: 'p', label: 'Pitch', unit: 'm' }, ...[0, 1, 2, 3].map((n) => ({ key: `n${n}`, label: n === 0 ? 'N = 0' : `N = ${n}`, unit: 'm', align: 'right' as const }))],
    rows,
    display: rows.map((r) => ({ p: f(r.p as number), ...Object.fromEntries([0, 1, 2, 3].map((n) => [`n${n}`, r[`n${n}`] == null ? '—' : f(r[`n${n}`] as number)])) })),
    rowTones: dMin != null ? rows.map((r) => { const d = r[`n${sel}`] as number | null; return d == null || d < dMin * (1 - 1e-9) ? 'fail' : d < dMin * 1.1 ? 'warn' : 'pass'; }) : undefined,
    note: `W = ${f(wn)}, s = ${f(s.s)}. ${dMin != null ? `Rows judged at N = ${sel} against the ${f(dMin)} minimum land: green ≥ 10 % over, yellow within 10 %, red below.` : 'Surface lands: no minimum, rows not judged.'}`,
  };
}

function graphs(s: MaxPadState, dMin: number | null): GraphSpec[] {
  const wn = s.w;
  const pLo = Math.max(0.1 * MM, 0.4 * s.p);
  const pHi = Math.max(1.6 * s.p, pLo * 2);
  const ps = Array.from({ length: 121 }, (_, i) => pLo + ((pHi - pLo) * i) / 120);
  const colors = ['#1f4e5f', '#c47b17', '#4f8a8b', '#6b5b95'];
  const series = [0, 1, 2, 3].map((n) => {
    const pts = ps.map((p) => dMaxForN(p, n ? wn : 0, s.s, n));
    const keep = pts.map((d) => d > 0);
    return { label: n === 0 ? 'N = 0 (pad-to-pad)' : `N = ${n}`, x: ps.filter((_, j) => keep[j]), y: pts.filter((_, j) => keep[j]), color: colors[n], width: n === s.n ? 2.4 : 1.2, dash: n === s.n ? undefined : [5, 3] };
  }).filter((x) => x.x.length > 1);
  const sLo = 0.02 * MM;
  const sHi = Math.max(2 * s.s, 0.3 * MM);
  const ss = Array.from({ length: 121 }, (_, i) => sLo + ((sHi - sLo) * i) / 120);
  const dS = ss.map((c) => dMaxForN(s.p, s.n ? wn : 0, c, s.n));
  const keepS = dS.map((d) => d > 0);
  const g2x = ss.filter((_, j) => keepS[j]);
  return [
    {
      id: 'dmax-vs-p',
      title: 'Largest pad vs pitch',
      subtitle: `W = ${f(wn)} · s = ${f(s.s)}`,
      x: { label: 'Pitch p', unit: 'm' },
      y: [{ id: 'd', label: 'Largest pad D_max', unit: 'm', includeZero: true }],
      legend: 'below',
      series,
      hlines: dMin != null ? [{ value: dMin, label: `D_min = ${f(dMin)}`, color: '#8b1e1e', dash: [6, 4] }] : [],
      vlines: [{ value: s.p, label: `p = ${f(s.p)}`, color: '#9a8f7a' }],
      markers: [{ x: s.p, y: s.d, label: `D = ${f(s.d)}` }],
    },
    ...(g2x.length > 1
      ? [
          {
            id: 'dmax-vs-s',
            title: 'Largest pad vs clearance',
            subtitle: `p = ${f(s.p)} · N = ${s.n}${s.n ? ` × ${f(wn)}` : ''}`,
            x: { label: 'Clearance s', unit: 'm' },
            y: [{ id: 'd', label: 'Largest pad D_max', unit: 'm', includeZero: true }],
            series: [{ label: `N = ${s.n}`, x: g2x, y: dS.filter((_, j) => keepS[j]), width: 2.2 }],
            hlines: dMin != null ? [{ value: dMin, label: `D_min = ${f(dMin)}`, color: '#8b1e1e', dash: [6, 4] }] : [],
            vlines: [{ value: s.s, label: `s = ${f(s.s)}`, color: '#9a8f7a' }],
          } as GraphSpec,
        ]
      : []),
  ];
}

export const def: CalcDef<MaxPadState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Channel arithmetic on the line between pad centres: D_max = p − N·W − (N+1)·s, solved in closed form for p, s or W (the BGA channel model of Intel AN 114 §1.3.4.1 / Xilinx UG1099, imported from the BGA breakout page; checked against TI SPRAA99C Fig. 2-4). Plated holes: minimum land D_min = a + 2b + c (IPC-2221B §9.1.1, Tables 9-1/9-2) with the IPC-6012 class breakout rules, imported from the padstack page. Mask-web and fab-limit thresholds are labelled rules of thumb.',
  fields,
  defaults,
  solve: {
    default: 'd',
    analysis: 'd',
    options: [
      { key: 'd', label: 'Largest pad D for the pitch (analysis)' },
      { key: 'p', label: 'Smallest pitch for the pad' },
      { key: 's', label: 'Largest clearance' },
      { key: 'w', label: 'Widest trace for N between the pads' },
    ],
  },
  compute,
  sync: (s) => {
    // N is never changed by a solve switch (A → B → A must return): W with N = 0 reports that a trace count is needed,
    // and the W row is hidden at N = 0 anyway
    const c = LEVELS[s.level];
    if (c != null && Math.abs(c - s.c) > 1e-12) s.level = 'custom';
  },
  examples: [
    { id: 'default', label: '2.54 mm header, 1.0 mm hole, two 0.2 mm traces between: largest pad', state: defaults() },
    { id: 'ti-065', label: 'TI SPRAA99C Fig. 2-4: 0.65 mm pitch, 0.35 mm land, one 0.1 mm line → clearance', state: { ...defaults(), solveFor: 's', padType: 'smd', p: 0.65 * MM, n: 1, w: 0.1 * MM, s: 0.1 * MM, d: 0.35 * MM, maskExp: 0.05 * MM } },
    { id: 'smd-127', label: '1.27 mm SMD pitch, one 0.15 mm trace at 0.15 mm: largest land', state: { ...defaults(), solveFor: 'd', padType: 'smd', p: 1.27 * MM, n: 1, w: 0.15 * MM, s: 0.15 * MM, d: 0.82 * MM, maskExp: 0.05 * MM } },
    { id: 'wmax-127', label: 'Widest trace between 0.6 mm lands on 1.27 mm at 0.15 mm', state: { ...defaults(), solveFor: 'w', padType: 'smd', p: 1.27 * MM, n: 1, w: 0.15 * MM, s: 0.15 * MM, d: 0.6 * MM, maskExp: 0.05 * MM } },
    { id: 'pitch-16', label: 'Smallest pitch for 1.6 mm PTH pads with one 0.25 mm trace', state: { ...defaults(), solveFor: 'p', p: 2.54 * MM, n: 1, w: 0.25 * MM, s: 0.2 * MM, d: 1.6 * MM, fhs: 1.0 * MM } },
    { id: 'bga-via-08', label: '0.8 mm grid via pads with one 0.1 mm trace: below the IPC level B land', state: { ...defaults(), solveFor: 'd', p: 0.8 * MM, n: 1, w: 0.1 * MM, s: 0.1 * MM, d: 0.5 * MM, fhs: 0.2 * MM, tol: 0.05 * MM, allow: 0.1 * MM, maskExp: 0 } },
  ],
};
