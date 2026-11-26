/** BGA breakout width — calculator definition (inputs, solve-for, report). DOM-free. */

import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TableSpec, emptyReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB } from '@/core/unitsets';
import { dMaxForN, dogboneClearance, layersNeeded, tracesInGap, wMaxForN } from './model';

export const ID = 'pcb/bga-breakout-width';

export type BgaSolve = 'n' | 'w' | 'dPad' | 'dVia';

export interface BgaState {
  solveFor: BgaSolve;
  preset: string;
  p: number;
  pUnit: string;
  ball: number;
  ballUnit: string;
  padDef: 'nsmd' | 'smd';
  dPad: number;
  dPadUnit: string;
  dMask: number;
  dMaskUnit: string;
  fanout: 'dogbone' | 'vip';
  dVia: number;
  dViaUnit: string;
  drill: number;
  drillUnit: string;
  channel: 'pads' | 'vias';
  n: number;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
  rows: number;
}

const MM = 1e-3;
/**
 * Typical starting points per pitch: JEDEC nominal ball, IPC-7351-style land (≈ 80 % of the ball), NSMD
 * mask opening +0.1 mm, a via the pitch can take and a common trace/space class. Check your fabricator.
 */
export const PRESETS: Record<string, { p: number; ball: number; land: number; via: number; drill: number; w: number; s: number; fanout: 'dogbone' | 'vip' } | null> = {
  Custom: null,
  '1.27 mm': { p: 1.27, ball: 0.75, land: 0.6, via: 0.6, drill: 0.3, w: 0.127, s: 0.127, fanout: 'dogbone' },
  '1.0 mm': { p: 1.0, ball: 0.6, land: 0.48, via: 0.5, drill: 0.25, w: 0.1, s: 0.1, fanout: 'dogbone' },
  '0.8 mm': { p: 0.8, ball: 0.45, land: 0.35, via: 0.45, drill: 0.2, w: 0.1, s: 0.1, fanout: 'dogbone' },
  '0.65 mm': { p: 0.65, ball: 0.35, land: 0.28, via: 0.35, drill: 0.15, w: 0.075, s: 0.075, fanout: 'dogbone' },
  '0.5 mm': { p: 0.5, ball: 0.3, land: 0.25, via: 0.25, drill: 0.1, w: 0.075, s: 0.075, fanout: 'vip' },
  '0.4 mm': { p: 0.4, ball: 0.25, land: 0.2, via: 0.2, drill: 0.1, w: 0.05, s: 0.05, fanout: 'vip' },
};
const MASK_EXP = 0.05 * MM; // NSMD mask opening per side / SMD mask overlap per side

export const defaults = (): BgaState => ({
  solveFor: 'n',
  preset: '0.8 mm',
  p: 0.8 * MM,
  pUnit: 'mm',
  ball: 0.45 * MM,
  ballUnit: 'mm',
  padDef: 'nsmd',
  dPad: 0.35 * MM,
  dPadUnit: 'mm',
  dMask: 0.45 * MM,
  dMaskUnit: 'mm',
  fanout: 'dogbone',
  dVia: 0.45 * MM,
  dViaUnit: 'mm',
  drill: 0.2 * MM,
  drillUnit: 'mm',
  channel: 'pads',
  n: 1,
  w: 0.1 * MM,
  wUnit: 'mm',
  s: 0.1 * MM,
  sUnit: 'mm',
  rows: 16,
});

const len = (key: string, symbol: string, label: string, min: number, max: number, extra: Record<string, unknown> = {}): FieldSpec =>
  ({ kind: 'number', key, symbol, label, units: U_LEN_PCB, unitKey: `${key}Unit`, min, max, ...extra }) as FieldSpec;

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Package & land',
    fields: [
      {
        kind: 'select',
        key: 'preset',
        label: 'Pitch preset',
        options: Object.keys(PRESETS),
        apply: (v, sc) => {
          const s = sc as BgaState;
          const q = PRESETS[v];
          if (!q) return;
          s.p = q.p * MM;
          s.ball = q.ball * MM;
          s.dVia = q.via * MM;
          s.drill = q.drill * MM;
          s.w = q.w * MM;
          s.s = q.s * MM;
          s.fanout = q.fanout;
          // the land preset is the solderable diameter: NSMD copper land, or the SMD mask opening
          if (s.padDef === 'nsmd') {
            s.dPad = q.land * MM;
            s.dMask = q.land * MM + 2 * MASK_EXP;
          } else {
            s.dMask = q.land * MM;
            s.dPad = q.land * MM + 2 * MASK_EXP;
          }
          // a new package: analyse it rather than solving a target left over from the old one
          s.solveFor = 'n';
        },
        help: 'Fills pitch, ball, land, via and a common trace/space class with typical values for that pitch. They are starting points, not a standard: check the package drawing and your fabricator’s capabilities.',
      },
      len('p', 'p', 'Ball pitch', 0.1 * MM, 3 * MM),
      len('ball', 'D_ball', 'Nominal ball Ø', 0.05 * MM, 2 * MM, { help: 'From the package drawing. Only used for the land-to-ball ratio (IPC-7351: lands 20–25 % smaller than a collapsing ball).' }),
      {
        kind: 'select',
        key: 'padDef',
        label: 'Land definition',
        options: [{ value: 'nsmd', label: 'NSMD (copper-defined)' }, { value: 'smd', label: 'SMD (mask-defined)' }],
        apply: (v, sc) => {
          const s = sc as BgaState;
          // keep the solderable diameter: NSMD → SMD enlarges the copper under the mask, and back
          if (v === 'smd' && s.dMask > s.dPad) {
            s.dMask = s.dPad;
            s.dPad = s.dPad + 2 * MASK_EXP;
          } else if (v === 'nsmd' && s.dMask < s.dPad) {
            s.dPad = s.dMask;
            s.dMask = s.dMask + 2 * MASK_EXP;
          }
          if (s.solveFor === 'dPad') s.solveFor = 'n'; // the land's meaning changed: analyse instead
        },
        help: 'NSMD: the mask opening is larger than the copper land, and the land sets the joint (the usual choice). SMD: the mask overlaps a larger copper pad; the joint is set by the opening, and the larger copper eats routing space.',
      },
      len('dPad', 'D_land', 'Copper land Ø', 0.05 * MM, 3 * MM, { solvable: true, onSolve: (_: unknown, root: Record<string, any>) => { root.solveFor = 'dPad'; root.channel = 'pads'; }, help: 'Copper diameter of the BGA land. Click ◎ for the largest land that still passes N traces between lands.' }),
      len('dMask', 'D_mask', 'Mask opening Ø', 0.05 * MM, 3 * MM, { help: 'NSMD: typically the land + 0.1 mm. SMD: smaller than the copper, typically by 0.1 mm.' }),
    ],
  },
  {
    kind: 'section',
    title: 'Fan-out via',
    fields: [
      {
        kind: 'select',
        key: 'fanout',
        label: 'Fan-out',
        options: [{ value: 'dogbone', label: 'Dog-bone (via between balls)' }, { value: 'vip', label: 'Via in pad (filled, capped)' }],
        help: 'Dog-bone: a short neck from each land to a via at the centre of four balls. Via in pad: the via sits in the land and must be filled and plated over (IPC-4761 type VII).',
      },
      len('dVia', 'D_via', 'Via pad Ø', 0.05 * MM, 3 * MM, { solvable: true, onSolve: (_: unknown, root: Record<string, any>) => { root.solveFor = 'dVia'; root.channel = 'vias'; }, help: 'Copper pad of the via on the routing layers. Click ◎ for the largest via pad that still passes N traces between vias.' }),
      len('drill', 'd_drill', 'Drill Ø', 0.02 * MM, 2 * MM, { help: 'Finished hole; sets the annular ring (D_via − d)/2.' }),
    ],
  },
  {
    kind: 'section',
    title: 'Routing channel',
    fields: [
      {
        kind: 'select',
        key: 'channel',
        label: 'Channel',
        options: [{ value: 'pads', label: 'Between lands (outer layer)' }, { value: 'vias', label: 'Between vias (inner layers)' }],
        apply: (v, sc) => {
          const s = sc as BgaState;
          // the obstacle being solved follows the channel (same meaning: the largest one that passes N traces)
          if (v === 'vias' && s.solveFor === 'dPad') s.solveFor = 'dVia';
          if (v === 'pads' && s.solveFor === 'dVia') s.solveFor = 'dPad';
        },
        help: 'Which gap the traces-per-channel and width answers refer to. Both channels are always listed in the results.',
      },
      { kind: 'number', key: 'n', symbol: 'N', label: 'Traces per channel', integer: true, min: 0, max: 1000, solvable: true, help: 'Result by default (how many fit). Click ◎ on W or a diameter to make N the requirement instead.' },
      len('w', 'W', 'Trace width', 0.005 * MM, 2 * MM, { solvable: true, help: 'Click ◎ for the widest trace that lets N traces through the channel.' }),
      len('s', 's', 'Clearance', 0.005 * MM, 1 * MM, { help: 'Copper-to-copper spacing used for trace–trace and trace–land/via gaps.' }),
      { kind: 'number', key: 'rows', symbol: 'n_rows', label: 'Ball rows in the array', integer: true, min: 2, max: 80, help: 'Balls along one side of a full array (16 for a 16 × 16 BGA). Only used for the layer-count estimate.' },
    ],
  },
];

const f = (m: number) => si(m, 'm', 3);
const fmil = (m: number) => `${(m / 25.4e-6).toPrecision(3)} mil`;

export function compute(st: BgaState): CalcReport {
  for (const k of ['p', 'ball', 'dPad', 'dMask', 'dVia', 'drill', 'n', 'w', 's', 'rows'] as const) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  for (const k of ['p', 'ball', 'dMask', 'drill', 's'] as const) if (!(st[k] > 0)) throw new Error(`${k} must be > 0.`);
  if (st.solveFor !== 'w' && !(st.w > 0)) throw new Error('Trace width must be > 0.');
  if (st.solveFor !== 'dPad' && !(st.dPad > 0)) throw new Error('Land diameter must be > 0.');
  if (st.solveFor !== 'dVia' && !(st.dVia > 0)) throw new Error('Via pad diameter must be > 0.');
  if (st.solveFor !== 'dPad' && st.dPad >= st.p) throw new Error(`The lands overlap: a ${si(st.dPad, 'm', 3)} land on a ${si(st.p, 'm', 3)} pitch leaves no gap. Use a land smaller than the pitch.`);
  if (st.solveFor !== 'dVia' && st.dVia >= st.p) throw new Error(`The via pads overlap: a ${si(st.dVia, 'm', 3)} pad on a ${si(st.p, 'm', 3)} pitch leaves no gap. Use a via pad smaller than the pitch.`);
  const s: BgaState = { ...st };
  const n0 = Math.round(s.n);
  const chanName = s.channel === 'pads' ? 'between lands' : 'between vias';

  // ── solve
  if (s.solveFor !== 'n' && n0 < 1) return noSol(s, `Enter at least N = 1 trace per channel to size ${s.solveFor === 'w' ? 'the width' : 'the diameter'} for.`);
  if (s.solveFor === 'w') {
    const g = s.p - (s.channel === 'pads' ? s.dPad : s.dVia);
    const w = wMaxForN(g, s.s, n0);
    if (!(w >= 0.005 * MM)) return noSol(s, `${n0} trace${n0 > 1 ? 's' : ''} ${chanName} ${n0 > 1 ? 'need' : 'needs'} a channel wider than ${(n0 + 1)} × s = ${f((n0 + 1) * s.s)} plus the trace${n0 > 1 ? 's' : ''}; the channel is ${f(g)}. Use fewer traces, a smaller clearance or a smaller ${s.channel === 'pads' ? 'land' : 'via pad'}.`);
    s.w = w;
  } else if (s.solveFor === 'dPad' || s.solveFor === 'dVia') {
    const d = dMaxForN(s.p, s.w, s.s, n0);
    if (!(d >= 0.05 * MM)) return noSol(s, `${n0} trace${n0 > 1 ? 's' : ''} of ${f(s.w)} at ${f(s.s)} clearance already ${n0 > 1 ? 'take' : 'takes'} ${f(n0 * s.w + (n0 + 1) * s.s)} of the ${f(s.p)} pitch: no ${s.solveFor === 'dPad' ? 'land' : 'via pad'} is left. Use fewer or narrower traces.`);
    s[s.solveFor] = d;
  }

  const gPad = s.p - s.dPad;
  const gVia = s.p - s.dVia;
  const nPad = tracesInGap(gPad, s.w, s.s);
  const nVia = tracesInGap(gVia, s.w, s.s);
  const gSel = s.channel === 'pads' ? gPad : gVia;
  const nSel = s.channel === 'pads' ? nPad : nVia;
  if (s.solveFor === 'n') s.n = nSel;
  const nReq = s.solveFor === 'n' ? Math.max(nSel, 1) : n0;
  const wRaw = wMaxForN(gSel, s.s, nReq);
  const wMax = Math.abs(wRaw) < 1e-12 * s.p ? 0 : wRaw; // an exact no-fit, not a 1e-20 rounding residue
  const rowsDeep = Math.ceil(s.rows / 2);
  // dog-bone vias sit between the balls of the inner rows; via-in-pad has them on the lands
  const lay = layersNeeded(rowsDeep, nPad, nVia);
  const ring = (s.dVia - s.drill) / 2;
  const dbClear = dogboneClearance(s.p, s.dPad, s.dVia);
  const web = s.p - s.dMask;
  const ratio = (s.padDef === 'nsmd' ? s.dPad : s.dMask) / s.ball;

  const warnings: string[] = [];
  const notes: string[] = [];
  if (nSel === 0) warnings.push(`No trace fits ${chanName}: the ${f(gSel)} channel is narrower than W + 2s = ${f(s.w + 2 * s.s)}. Use a narrower trace or clearance, a smaller ${s.channel === 'pads' ? 'land' : 'via pad'}, or escape this row on another layer.`);
  if (s.padDef === 'nsmd' && s.dMask <= s.dPad) warnings.push(`NSMD land with a mask opening (${f(s.dMask)}) no larger than the copper (${f(s.dPad)}): that is an SMD land. Open the mask to about the land + 0.1 mm, or select SMD.`);
  if (s.padDef === 'smd' && s.dMask >= s.dPad) warnings.push(`SMD land with a mask opening (${f(s.dMask)}) not smaller than the copper (${f(s.dPad)}): the mask does not define the joint. Make the copper about 0.1 mm larger than the opening, or select NSMD.`);
  if (web < 0.075 * MM) warnings.push(`Mask web between land openings is ${f(web)}, below the ~75 µm a liquid photo-imageable mask can hold (rule of thumb): it may flake off and let solder bridge. Use smaller openings or a gang (no-web) opening.`);
  if (ring < 0.05 * MM && s.fanout === 'dogbone') warnings.push(`Annular ring (D_via − d)/2 = ${f(ring)} is below 50 µm (2 mil), a common minimum for mechanically drilled vias (rule of thumb; IPC-6012 Class 2 allows breakout). Enlarge the via pad or use a smaller drill.`);
  if (s.drill >= s.dVia) warnings.push('The drill is as large as the via pad: there is no copper ring. Enlarge the via pad.');
  if (s.fanout === 'dogbone' && dbClear < s.s) warnings.push(`Dog-bone via pad and land are only ${f(dbClear)} apart (p/√2 − (D_land + D_via)/2), less than the clearance s: there is no room for a via between the balls. Use a smaller via pad, or via in pad.`);
  if (s.fanout === 'vip' && s.dVia > s.dPad) warnings.push(`Via-in-pad with a via pad (${f(s.dVia)}) larger than the land (${f(s.dPad)}): the via copper widens the land and shrinks the top-layer channel. Keep the via pad within the land.`);
  if (s.fanout === 'vip') notes.push('Via in pad must be filled and plated over (IPC-4761 type VII); an open via wicks solder out of the joint.');
  else notes.push('Dog-bone vias are assumed tented (covered by mask) on the outer layer, so the mask web to the land openings is not reduced by them.');
  if (s.w < 0.075 * MM) notes.push(`W = ${f(s.w)} (${fmil(s.w)}) is below the 75 µm (3 mil) most standard fabs hold: expect HDI pricing.`);
  notes.push('Channels assume round lands and vias on the full pitch grid, one clearance rule for trace–trace and trace–copper, and straight traces through the middle of the channel.');
  notes.push(`Layer estimate: ${rowsDeep} rows deep (half of ${s.rows}), N + 1 rows per layer (outer row direct, N rows through each channel); power and ground balls that drop straight to planes reduce it.`);

  const item = (key: string, label: string, value: number | string, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const primary: ResultItem[] = [];
  const solved = s.solveFor;
  if (solved === 'w') primary.push(item('w', 'Maximum trace width', s.w, 'm', f(s.w), { symbol: 'W', solved: true, primary: true, note: `${fmil(s.w)} · ${n0} per channel ${chanName}` }));
  if (solved === 'dPad') primary.push(item('dPad', 'Largest copper land', s.dPad, 'm', f(s.dPad), { symbol: 'D_land', solved: true, primary: true, note: `${n0} × ${f(s.w)} traces between lands` }));
  if (solved === 'dVia') primary.push(item('dVia', 'Largest via pad', s.dVia, 'm', f(s.dVia), { symbol: 'D_via', solved: true, primary: true, note: `${n0} × ${f(s.w)} traces between vias` }));
  primary.push(item('n', 'Traces per channel', nSel, '', `${nSel}`, { symbol: 'N', solved: solved === 'n', primary: true, tone: nSel === 0 ? 'fail' : '', note: `${chanName} · ${f(gSel)} gap` }));
  primary.push(item('gap', 'Channel width', gSel, 'm', f(gSel), { symbol: 'g', primary: true, note: `p − D_${s.channel === 'pads' ? 'land' : 'via'} · ${fmil(gSel)}` }));
  primary.push(item('layers', 'Signal layers to escape', lay.total, '', `${lay.total}`, { primary: true, note: `rule of thumb · ${s.rows} × ${s.rows} array` }));

  const rest: ResultItem[] = [
    item('gapPad', 'Gap between lands', gPad, 'm', f(gPad), { group: 'Channels', note: `${nPad} trace${nPad === 1 ? '' : 's'}` }),
    item('nPad', 'Traces between lands', nPad, '', `${nPad}`, { group: 'Channels' }),
    item('gapVia', 'Gap between via pads', gVia, 'm', f(gVia), { group: 'Channels', note: `${nVia} trace${nVia === 1 ? '' : 's'}` }),
    item('nVia', 'Traces between vias', nVia, '', `${nVia}`, { group: 'Channels' }),
    item('wMax', `Widest trace for ${nReq} per channel`, wMax, 'm', wMax > 0 ? `${f(wMax)} (${fmil(wMax)})` : 'does not fit', { group: 'Channels', tone: wMax > 0 ? '' : 'fail' }),
    item('ratio', s.padDef === 'nsmd' ? 'Land ÷ ball' : 'Mask opening ÷ ball', ratio, '', ratio.toFixed(2), { group: 'Land', tone: ratio < 0.7 || ratio > 0.85 ? 'warn' : '', note: 'IPC-7351: 0.75–0.80 for collapsing balls' }),
    item('web', 'Mask web between lands', web, 'm', f(web), { group: 'Land', tone: web < 0.075 * MM ? 'warn' : '' }),
    item('ring', 'Annular ring', ring, 'm', f(ring), { group: 'Via', tone: ring < 0.05 * MM ? 'warn' : '' }),
    ...(s.fanout === 'dogbone' ? [item('dbClear', 'Via pad to land', dbClear, 'm', f(dbClear), { group: 'Via', tone: dbClear < s.s ? 'fail' : '', note: 'p/√2 − (D_land + D_via)/2' })] : []),
    item('rowsTop', 'Rows escaped on the outer layer', lay.top, '', `${lay.top}`, { group: 'Escape estimate', note: `N_lands + 1 = ${nPad + 1}` }),
    item('rowsInner', 'Rows per inner layer', lay.perInner, '', `${lay.perInner}`, { group: 'Escape estimate', note: `N_vias + 1` }),
    item('innerLayers', 'Inner signal layers', lay.inner, '', `${lay.inner}`, { group: 'Escape estimate', note: `${rowsDeep} rows deep` }),
  ];
  const report: CalcReport = { calc: ID, ok: true, solveFor: solved, results: [...primary, ...rest], graphs: [], tables: [], warnings, notes };
  report.summary = `${f(s.p)} pitch · ${s.padDef.toUpperCase()} ${f(s.dPad)} land · ${s.fanout === 'vip' ? 'via in pad' : 'dog-bone'} ${f(s.dVia)}/${f(s.drill)} · W/s ${f(s.w)}/${f(s.s)} → ${nPad} between lands, ${nVia} between vias`;
  report.tables = [classTable(s)];
  report.graphs = graphs(s, nReq, gSel, wMax);
  report.details = { gPad, gVia, nPad, nVia, layers: lay };
  return report;
}

function noSol(s: BgaState, error: string): CalcReport {
  return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' }, error };
}

/** Common trace/space classes and what each gets through the two channels. */
function classTable(s: BgaState): TableSpec {
  const classes: [string, number][] = [['6/6 mil', 0.15], ['5/5 mil', 0.127], ['4/4 mil', 0.1], ['3/3 mil', 0.075], ['2/2 mil (HDI)', 0.05]];
  const req = Math.max(s.solveFor === 'n' ? 1 : Math.round(s.n), 1);
  const rows = classes.map(([name, x]) => {
    const w = x * MM;
    const np = tracesInGap(s.p - s.dPad, w, w);
    const nv = tracesInGap(s.p - s.dVia, w, w);
    return { cls: name, w, nPad: np, nVia: nv, layers: layersNeeded(Math.ceil(s.rows / 2), np, nv).total };
  });
  const sel = (r: (typeof rows)[number]) => (s.channel === 'pads' ? r.nPad : r.nVia);
  return {
    id: 'classes',
    title: 'Trace / space classes',
    columns: [
      { key: 'cls', label: 'W / s', align: 'left' },
      { key: 'w', label: 'W = s', unit: 'm' },
      { key: 'nPad', label: 'Between lands' },
      { key: 'nVia', label: 'Between vias' },
      { key: 'layers', label: 'Signal layers' },
    ],
    rows,
    display: rows.map((r) => ({ cls: r.cls, w: f(r.w), nPad: String(r.nPad), nVia: String(r.nVia), layers: String(r.layers) })),
    rowTones: rows.map((r) => (sel(r) >= req ? (sel(r) === req && wMaxForN(s.channel === 'pads' ? s.p - s.dPad : s.p - s.dVia, r.w, req) < r.w * 1.1 ? 'warn' : 'pass') : 'fail')),
    note: `Green: at least ${req} trace${req > 1 ? 's' : ''} ${s.channel === 'pads' ? 'between lands' : 'between vias'}; yellow: fits with under 10 % width margin; red: does not fit. Land ${f(s.dPad)}, via pad ${f(s.dVia)}.`,
  };
}

function graphs(s: BgaState, nReq: number, gSel: number, wMax: number): GraphSpec[] {
  const dNow = s.channel === 'pads' ? s.dPad : s.dVia;
  const d0 = Math.max(0.2 * s.p, 0.05 * MM);
  const d1 = 0.95 * s.p;
  const ds = Array.from({ length: 120 }, (_, i) => d0 + ((d1 - d0) * i) / 119);
  const ns = [1, 2, 3];
  const colors = ['#1f4e5f', '#c47b17', '#4f8a8b'];
  return [
    {
      id: 'wmax-vs-d',
      title: 'Widest trace vs obstacle size',
      x: { label: s.channel === 'pads' ? 'Copper land Ø' : 'Via pad Ø', unit: 'm' },
      y: [{ id: 'w', label: 'Widest trace', unit: 'm', includeZero: true }],
      // N = 1 is always drawn (clamped at 0 where nothing fits) so the graph is never empty
      series: ns.map((n, i) => {
        const pts = ds.map((d) => wMaxForN(s.p - d, s.s, n));
        const keep = pts.map((w) => w > 0 || n === 1);
        return { label: `N = ${n}`, x: ds.filter((_, j) => keep[j]), y: pts.filter((_, j) => keep[j]).map((w) => Math.max(w, 0)), color: colors[i], width: n === nReq ? 2.4 : 1.3 };
      }).filter((x) => x.x.length > 1),
      hlines: [{ value: s.w, label: `W = ${f(s.w)}`, color: '#9a8f7a', dash: [3, 3] }],
      vlines: [{ value: dNow, label: `${s.channel === 'pads' ? 'land' : 'via'} ${f(dNow)}`, color: '#9a8f7a' }],
      markers: wMax > 0 ? [{ x: dNow, y: wMax, label: `${f(wMax)} for N = ${nReq}` }] : [],
      subtitle: `pitch ${f(s.p)} · clearance ${f(s.s)}`,
    },
    {
      id: 'n-vs-w',
      title: 'Traces per channel vs width',
      x: { label: 'Trace width W (= clearance s)', unit: 'm' },
      y: [{ id: 'n', label: 'Traces per channel', unit: '', includeZero: true }],
      series: [
        { label: 'Between lands', x: wGrid(s), y: wGrid(s).map((w) => tracesInGap(s.p - s.dPad, w, w)), width: 2.2 },
        { label: 'Between vias', x: wGrid(s), y: wGrid(s).map((w) => tracesInGap(s.p - s.dVia, w, w)), color: '#c47b17', width: 1.6, dash: [5, 3] },
      ],
      vlines: [{ value: s.w, label: `W = ${f(s.w)}`, color: '#9a8f7a' }],
      subtitle: `${f(gSel)} channel ${s.channel === 'pads' ? 'between lands' : 'between vias'}; W and s equal on this graph`,
    },
  ];
}

const wGrid = (s: BgaState) => Array.from({ length: 160 }, (_, i) => 0.02 * MM + ((Math.max(0.5 * s.p, 0.1 * MM) - 0.02 * MM) * i) / 159);

export const def: CalcDef<BgaState> = {
  id: ID,
  version: '0.1.0',
  method: 'Channel arithmetic between round lands / via pads on the ball pitch: N = ⌊(p − D − s)/(W + s)⌋, W_max = (p − D − (N+1)s)/N, D_max = p − N·W − (N+1)s; N + 1 rows per signal layer (Intel AN 114 §1.3.4.1, Xilinx UG1099); dog-bone clearance p/√2 − (D_land + D_via)/2; land-to-ball ratio per IPC-7351B. Mask web, annular ring and minimum trace thresholds are labelled rules of thumb.',
  fields,
  defaults,
  // Mode-switch harness notes (reviewed): roundtrip flags for w / dPad / dVia are expected — N is a whole
  // number, so the widest trace (or largest land / via pad) for N is generally not the value typed, which only
  // had to fit; error-after-edit flags come from typed extremes (pitch ÷10, N × 10) that leave no channel,
  // and the error says which limit is hit. A ◎ click on W or a diameter when even one trace cannot pass
  // (a high error-after-switch from a typed 0.22 mm pitch) is NO SOLUTION on purpose: the user asked for it.
  solve: {
    default: 'n',
    analysis: 'n',
    options: [
      { key: 'n', label: 'Traces per channel N (analysis)' },
      { key: 'w', label: 'Widest trace W for N per channel' },
      { key: 'dPad', label: 'Largest land for N traces between lands' },
      { key: 'dVia', label: 'Largest via pad for N traces between vias' },
    ],
  },
  compute,
  sync: (s) => {
    // sizing W or a diameter needs at least one trace: after an analysis that found none (N = 0), ◎ starts from 1
    if (s.solveFor !== 'n' && !(s.n >= 1)) s.n = 1;
    // the land is solved for the channel between lands, the via pad for the one between vias
    if (s.solveFor === 'dPad') s.channel = 'pads';
    if (s.solveFor === 'dVia') s.channel = 'vias';
    const q = PRESETS[s.preset];
    if (q && (Math.abs(q.p * MM - s.p) > 1e-12 || Math.abs(q.ball * MM - s.ball) > 1e-12)) s.preset = 'Custom';
  },
  examples: [
    { id: 'default', label: '0.8 mm BGA, NSMD 0.35 mm lands, dog-bone, 4/4 mil', state: { ...defaults() } },
    { id: 'pbga-127', label: '1.27 mm PBGA: two 5 mil traces between 0.6 mm lands', state: { ...defaults(), preset: '1.27 mm', p: 1.27 * MM, ball: 0.75 * MM, dPad: 0.6 * MM, dMask: 0.7 * MM, dVia: 0.6 * MM, drill: 0.3 * MM, w: 0.127 * MM, s: 0.127 * MM, rows: 23, n: 2, solveFor: 'n' } },
    { id: 'max-w-1mm', label: '1.0 mm BGA: widest trace for 2 between lands', state: { ...defaults(), preset: '1.0 mm', p: 1.0 * MM, ball: 0.6 * MM, dPad: 0.48 * MM, dMask: 0.58 * MM, dVia: 0.5 * MM, drill: 0.25 * MM, w: 0.1 * MM, s: 0.1 * MM, rows: 32, n: 2, solveFor: 'w', channel: 'pads' } },
    { id: 'smd-08', label: '0.8 mm with SMD lands: the copper eats the channel', state: { ...defaults(), padDef: 'smd', dMask: 0.35 * MM, dPad: 0.45 * MM, solveFor: 'n' } },
    { id: 'via-065', label: '0.65 mm: largest via pad for 1 trace between vias', state: { ...defaults(), preset: '0.65 mm', p: 0.65 * MM, ball: 0.35 * MM, dPad: 0.28 * MM, dMask: 0.38 * MM, dVia: 0.35 * MM, drill: 0.15 * MM, w: 0.075 * MM, s: 0.075 * MM, rows: 20, n: 1, solveFor: 'dVia', channel: 'vias' } },
    { id: 'vip-04', label: '0.4 mm WLCSP-style: via in pad, 2/2 mil', state: { ...defaults(), preset: '0.4 mm', p: 0.4 * MM, ball: 0.25 * MM, dPad: 0.2 * MM, dMask: 0.3 * MM, fanout: 'vip', dVia: 0.2 * MM, drill: 0.1 * MM, w: 0.05 * MM, s: 0.05 * MM, rows: 10, n: 1, solveFor: 'n', channel: 'pads' } },
  ],
};
