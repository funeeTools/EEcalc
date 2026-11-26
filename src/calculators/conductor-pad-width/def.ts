/** Conductor-to-pad width — calculator definition (inputs, solve-for, report). DOM-free. */

import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB } from '@/core/unitsets';
import { type LandShape, TI_RATIO, exposedTrace, landArea, leavingWidth } from './model';

export const ID = 'pcb/conductor-to-pad-width';

export type CpwSolve = 'ratio' | 'w' | 'd';
export type OtherConn = 'none' | 'trace' | 'spokes' | 'pour';

export interface CpwState {
  solveFor: CpwSolve;
  /** W / D (%): computed in the check, the target when solving W or D */
  ratio: number;
  rule: 'ti' | 'custom';
  /** largest W / D the guideline allows (%) */
  k: number;
  shape: LandShape;
  d: number;
  dUnit: string;
  l: number;
  lUnit: string;
  padDef: 'nsmd' | 'smd';
  e: number;
  eUnit: string;
  reg: number;
  regUnit: string;
  w: number;
  wUnit: string;
  wr: number;
  wrUnit: string;
  other: OtherConn;
  wb: number;
  wbUnit: string;
  ns: number;
  wsp: number;
  wspUnit: string;
  /** the limit at the last compute: a W/D target sitting on the limit follows a typed limit (§5a) */
  kSeen?: number;
}

const MM = 1e-3;
const TI_PCT = TI_RATIO * 100;

export const defaults = (): CpwState => ({
  solveFor: 'w',
  ratio: TI_PCT,
  rule: 'ti',
  k: TI_PCT,
  shape: 'rect',
  d: 0.6 * MM,
  dUnit: 'mm',
  l: 0.5 * MM,
  lUnit: 'mm',
  padDef: 'nsmd',
  e: 0.05 * MM,
  eUnit: 'mm',
  reg: 0.05 * MM,
  regUnit: 'mm',
  w: 0.4 * MM,
  wUnit: 'mm',
  wr: 0.5 * MM,
  wrUnit: 'mm',
  other: 'trace',
  wb: 0.4 * MM,
  wbUnit: 'mm',
  ns: 2,
  wsp: 0.2 * MM,
  wspUnit: 'mm',
});

const LIM = { ratio: [0.01, 30000], w: [5e-6, 5 * MM], d: [20e-6, 10 * MM] } as const;

const len = (key: string, symbol: string, label: string, min: number, max: number, extra: Record<string, unknown> = {}): FieldSpec =>
  ({ kind: 'number', key, symbol, label, units: U_LEN_PCB, unitKey: `${key}Unit`, min, max, ...extra }) as FieldSpec;

/** ◎ on W or D from the check: the ratio box becomes the target, so start it at the limit (§5a: no carried-over 83 %). */
const leaveCheck = (to: CpwSolve) => (s: Record<string, any>) => {
  if (s.solveFor === 'ratio') s.ratio = s.k;
  s.solveFor = to;
};

const rect = (s: Record<string, any>) => s.shape === 'rect';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Guideline',
    note: 'Click ◎ on W for the widest trace at the land, on D for the smallest land; the ratio checks a trace as entered.',
    fields: [
      { kind: 'number', key: 'ratio', symbol: 'W/D', label: 'Trace / land width', suffix: '%', min: LIM.ratio[0], max: LIM.ratio[1], solvable: true, help: 'Trace width at the land over the land width (diameter for a round land). Target when solving W or D (start at the limit); otherwise the ratio of the trace as entered.' },
      {
        kind: 'select',
        key: 'rule',
        label: 'Limit',
        options: [{ value: 'ti', label: 'TI AN-1112: ≤ 2/3 of the land (NSMD)' }, { value: 'custom', label: 'Custom limit' }],
        apply: (v: string, sc: Record<string, any>) => {
          if (v === 'ti') sc.k = TI_PCT;
          // a new limit is a new target when sizing W or D
          if (sc.solveFor !== 'ratio') sc.ratio = sc.k;
        },
        help: 'TI AN-1112 §4.1: the trace at an NSMD land should not exceed 2/3 of the land diameter. No IPC document gives a number; use your assembler’s rule if it has one.',
      },
      { kind: 'number', key: 'k', symbol: 'k', label: 'Width limit', suffix: '%', min: 1, max: 300, visible: (s: Record<string, any>) => s.rule === 'custom', help: 'Largest trace / land ratio your rule allows.' },
    ],
  },
  {
    kind: 'section',
    title: 'Land',
    fields: [
      {
        kind: 'select',
        key: 'shape',
        label: 'Land shape',
        options: [{ value: 'rect', label: 'Rectangular (chip, lead land)' }, { value: 'round', label: 'Round (BGA, CSP)' }],
      },
      len('d', 'D', 'Land width', LIM.d[0], LIM.d[1], { solvable: true, onSolve: leaveCheck('d'), help: 'Width of the land edge the trace joins (the diameter for a round land). Solved: the smallest land that takes the trace at the ratio.' }),
      len('l', 'L', 'Land length', 20e-6, 10 * MM, { visible: rect, help: 'Land length along the trace, for its area (the wettable surface the exposed trace adds to).' }),
      { kind: 'select', key: 'padDef', label: 'Land definition', options: [{ value: 'nsmd', label: 'NSMD (mask clears the land)' }, { value: 'smd', label: 'SMD (mask-defined)' }], help: 'NSMD: the mask opening clears the land, so the trace is bare copper for the first e. SMD: the mask covers the land edge and the trace.' },
      len('e', 'e', 'Mask clearance', 0, 0.5 * MM, { help: 'Mask opening beyond the land, per side (NSMD), typically 0.05 mm.' }),
      len('reg', 'δ_reg', 'Mask registration', 0, 0.3 * MM, { help: 'Mask-to-copper registration tolerance of the fabricator (often ±50 µm). The narrow neck must run under the mask by this much.' }),
    ],
  },
  {
    kind: 'section',
    title: 'Trace',
    fields: [
      len('w', 'W', 'Trace width at land', LIM.w[0], LIM.w[1], { solvable: true, onSolve: leaveCheck('w'), help: 'Width where the trace joins the land, up to the mask edge. Solved: the widest trace the ratio allows.' }),
      len('wr', 'W_r', 'Routing width', LIM.w[0], LIM.w[1], { help: 'Width the trace needs away from the land (current, impedance). If wider than W, the trace is necked down to W near the land.' }),
    ],
  },
  {
    kind: 'section',
    title: 'Other terminal (thermal balance)',
    visible: rect,
    fields: [
      {
        kind: 'select',
        key: 'other',
        label: 'Other land joins',
        options: [{ value: 'none', label: 'Not shown' }, { value: 'trace', label: 'A trace' }, { value: 'spokes', label: 'A pour, by relief spokes' }, { value: 'pour', label: 'A pour, directly' }],
        help: 'How the other land of a two-terminal part (resistor, capacitor) is connected. Unequal copper heats the two lands at different rates in reflow and can stand the part on end (tombstoning).',
      },
      len('wb', 'W_b', 'Its trace width', LIM.w[0], LIM.w[1], { visible: (s: Record<string, any>) => s.other === 'trace' }),
      { kind: 'number', key: 'ns', symbol: 'n', label: 'Spokes', integer: true, min: 1, max: 8, visible: (s: Record<string, any>) => s.other === 'spokes' },
      len('wsp', 'w_sp', 'Spoke width', LIM.w[0], LIM.w[1], { visible: (s: Record<string, any>) => s.other === 'spokes' }),
    ],
  },
];

const f = (m: number) => (m === 0 ? '0' : si(m, 'm', 4));
const f3 = (m: number) => (m === 0 ? '0' : si(m, 'm', 3));
const pc = (x: number) => `${x.toFixed(1)} %`;
const mm2 = (a: number) => `${+(a * 1e6).toPrecision(3)} mm²`;

function num(name: string, v: unknown, strict = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (strict ? !(v > 0) : !(v >= 0)) throw new Error(`${name} must be ${strict ? '> 0' : '≥ 0'}.`);
  return v;
}

function noSol(s: CpwState, error: string): CalcReport {
  return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' }, error };
}

const inRange = (k: keyof typeof LIM, v: number) => v >= LIM[k][0] * (1 - 1e-9) && v <= LIM[k][1] * (1 + 1e-9);

export function compute(st: CpwState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness (§12.3) triage, reviewed: "unreadable" mediums on a solved length shown in inches (0.0009 in) come
 * from the user's own unit choice: inch has no prefixed forms for the core to move to, so they are left as chosen. error-after-edit flags are typed ratios or widths that push the
 * solved W or D outside its field range; the message names the range.
 */
function run(st: CpwState): CalcReport {
  const s: CpwState = { ...st };
  const k = s.solveFor;
  if (!['ratio', 'w', 'd'].includes(k)) throw new Error('solveFor must be ratio, w or d.');
  if (s.shape !== 'rect' && s.shape !== 'round') throw new Error('Unknown land shape.');
  if (s.padDef !== 'nsmd' && s.padDef !== 'smd') throw new Error('Unknown land definition.');
  if (!['none', 'trace', 'spokes', 'pour'].includes(s.other)) throw new Error('Unknown connection.');
  num('Width limit', s.k);
  if (k !== 'ratio') num('Trace / land target', s.ratio);
  if (k !== 'd') num('Land width', s.d);
  if (k !== 'w') num('Trace width', s.w);
  num('Routing width', s.wr);
  num('Mask clearance', s.e, false);
  num('Mask registration', s.reg, false);
  if (s.shape === 'rect') num('Land length', s.l);
  if (s.shape === 'round') s.other = 'none'; // a round land has no partner terminal (on this copy only: the setting is kept for rect)
  if (s.other === 'trace') num('Other trace width', s.wb);
  if (s.other === 'spokes') {
    s.ns = Math.round(num('Spokes', s.ns));
    num('Spoke width', s.wsp);
  }
  if (k === 'w') {
    const w = (s.ratio / 100) * s.d;
    if (!inRange('w', w)) return noSol(s, `The trace would be ${f(w)}, outside the 5 µm – 5 mm field range.`);
    s.w = w;
  } else if (k === 'd') {
    const d = s.w / (s.ratio / 100);
    if (!inRange('d', d)) return noSol(s, `The land would be ${f(d)}, outside the 0.02–10 mm field range.`);
    s.d = d;
  } else {
    const r = (s.w / s.d) * 100;
    if (!inRange('ratio', r)) return noSol(s, `W / D = ${pc(r)} is outside the field range. Check the trace and land widths.`);
    s.ratio = r;
  }
  return report(s);
}

function report(s: CpwState): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const nsmd = s.padDef === 'nsmd';
  const ratio = s.w / s.d;
  const lim = s.k / 100;
  const pass = ratio <= lim * (1 + 1e-9);
  const wAllowed = lim * s.d;
  const area = landArea(s.shape, s.d, s.l);
  // the trace that actually enters: when W is the widest allowed, a narrower routing trace goes in at its own width
  const wAct = k === 'w' ? Math.min(s.wr, s.w) : s.w;
  const exW = nsmd ? exposedTrace(s.shape, s.d, wAct, s.e) : 0;
  const exWr = nsmd ? exposedTrace(s.shape, s.d, s.wr, s.e) : 0;
  const neck = s.wr > s.w * (1 + 1e-9);
  const lNeck = s.e + s.reg;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k === 'w') prim.push(item('w', 'Widest trace at the land', s.w, 'm', f(s.w), { symbol: 'W', primary: true, solved: true, note: `${(s.w / 25.4e-6).toFixed(1)} mil · ${pc(s.ratio)} of D` }));
  if (k === 'd') prim.push(item('d', 'Smallest land', s.d, 'm', f(s.d), { symbol: 'D', primary: true, solved: true, note: `for W = ${f3(s.w)} at ${pc(s.ratio)}` }));
  prim.push(item('ratio', 'Trace / land', s.ratio, '%', pc(ratio * 100), { symbol: 'W/D', primary: true, solved: k === 'ratio', tone: nsmd ? (pass ? 'pass' : 'fail') : '', note: `limit ${pc(s.k)}${s.rule === 'ti' ? ' (TI AN-1112)' : ''}${nsmd ? '' : ' · SMD: not binding'}` }));
  prim.push(item('exposed', 'Extra wettable copper', area > 0 ? exW / area : 0, '', nsmd ? `${pc((exW / area) * 100)} of the land` : 'none (mask covers)', { symbol: 'A_exp/A_land', primary: true, note: nsmd ? `${mm2(exW)} of trace in the opening` : 'SMD: the trace is under mask' }));
  prim.push(item('lNeck', neck ? 'Neck length, minimum' : 'Neck-down', neck ? lNeck : 0, 'm', neck ? `≥ ${f3(lNeck)}` : 'not needed', { symbol: 'L_neck', primary: true, note: neck ? `${f3(s.wr)} → ${f3(s.w)} · e + δ_reg` : `W_r ≤ W` }));

  const sec: ResultItem[] = [
    item('wAllowed', 'Widest trace the limit allows', wAllowed, 'm', f(wAllowed), { symbol: 'k·D', group: 'Guideline' }),
    item('wrRatio', 'Routing width / land', s.wr / s.d, '', pc((s.wr / s.d) * 100), { symbol: 'W_r/D', group: 'Guideline', tone: nsmd && s.wr > wAllowed * (1 + 1e-9) ? 'warn' : '', note: s.wr > wAllowed * (1 + 1e-9) ? 'neck it down at the land' : 'can enter at full width' }),
    item('area', 'Land area', area, 'm²', mm2(area), { group: 'Wetting' }),
    item('opening', 'Mask opening', nsmd ? s.d + 2 * s.e : s.d, 'm', s.shape === 'rect' ? `${f3(nsmd ? s.d + 2 * s.e : s.d)} × ${f3(nsmd ? s.l + 2 * s.e : s.l)}` : `Ø ${f3(nsmd ? s.d + 2 * s.e : s.d)}`, { group: 'Wetting' }),
    item('exW', 'Exposed trace, as routed', exW, 'm²', `${mm2(exW)} (${pc((exW / area) * 100)})`, { group: 'Wetting', note: 'copper in the opening' }),
    item('exWr', 'Exposed trace, unnecked', exWr, 'm²', `${mm2(exWr)} (${pc((exWr / area) * 100)})`, { group: 'Wetting', note: `if W_r = ${f3(s.wr)} ran in` }),
  ];
  // thermal balance of a two-terminal part
  let bal: number | null = null;
  if (s.shape === 'rect' && s.other !== 'none') {
    const a = wAct;
    const b = leavingWidth(s.other as 'trace' | 'spokes' | 'pour', s.shape, s.d, s.l, s.wb, s.ns, s.wsp);
    bal = Math.max(a, b) / Math.min(a, b);
    const heavy = b > a ? 'other' : 'this';
    sec.push(
      item('cuA', 'Copper leaving this land', a, 'm', f3(a), { group: 'Thermal balance', note: k === 'w' && s.wr < s.w ? 'routing trace W_r' : 'trace W' }),
      item('cuB', 'Copper leaving the other land', b, 'm', f3(b), { group: 'Thermal balance', note: s.other === 'trace' ? 'trace W_b' : s.other === 'spokes' ? `${s.ns} × ${f3(s.wsp)} spokes` : 'whole perimeter (direct)' }),
      item('balance', 'Imbalance', bal, '', `${bal.toFixed(2)} : 1`, { group: 'Thermal balance', tone: bal > 1.5 ? 'warn' : '', note: bal > 1 + 1e-9 ? `${heavy} land heats slower` : 'balanced' }),
    );
    if (bal > 1.5) rep.warnings.push(`The two lands lose heat unequally: ${f3(Math.max(a, b))} of copper leaves the ${heavy} land against ${f3(Math.min(a, b))} (${bal.toFixed(1)} : 1). In reflow the lighter land melts first and can pull a small part upright (tombstoning). ${s.other === 'pour' ? 'Connect the pour through thermal-relief spokes whose total width matches the trace on the other land' : s.other === 'spokes' ? 'Match the total spoke width to the trace on the other land' : 'Use equal widths near both lands (neck the wider one)'}. The 1.5 : 1 flag is a rule of thumb, not a standard.`);
  }
  rep.results = [...prim, ...sec];

  if (nsmd) {
    rep.status = pass ? { text: `W ≤ ${s.rule === 'ti' ? '2/3' : pc(s.k)} D`, tone: 'pass' } : { text: 'TRACE TOO WIDE FOR THE LAND', tone: 'fail' };
    if (!pass) rep.warnings.push(`At ${pc(ratio * 100)} of the land the trace joins an NSMD land wider than the ${pc(s.k)} limit: the exposed copper in the opening (${pc((exW / area) * 100)} of the land) draws solder from the joint and pulls the part off centre. Neck the trace to ≤ ${f3(wAllowed)} from the land edge for at least ${f3(lNeck)} (under the mask edge), or use a solder-mask-defined land.`);
  } else rep.notes.push('SMD land: the mask covers the land edge and the trace, so the trace width does not change the solderable area; the 2/3 guideline is for NSMD lands. The thermal balance still applies.');
  if (s.shape === 'round' && s.d <= 0.3 * MM && s.w > 100e-6) rep.notes.push(`Microchip’s WLCSP guideline asks for less than 100 µm (preferably 75 µm) of trace inside an NSMD opening; this trace is ${f3(s.w)}.`);
  if (s.wr > s.d) rep.notes.push(`The routing width (${f3(s.wr)}) is wider than the land: the neck is unavoidable. Check the neck carries the current over its short length (trace-width calculator).`);
  if (neck && nsmd) rep.notes.push(`Neck length = mask clearance ${f3(s.e)} + registration ${f3(s.reg)}: the full width must not reach into the opening even with the mask shifted (TI: keep the limit until the mask covers the trace). This is the geometric minimum, not a published figure; some assemblers ask for a longer equal-width run.`);
  rep.notes.push('Exposed copper is the trace strip inside the mask opening, entering perpendicular to the land edge on its centre line.');
  rep.summary = `${s.shape === 'rect' ? `${f3(s.d)} × ${f3(s.l)}` : `Ø ${f3(s.d)}`} ${s.padDef.toUpperCase()} land · W = ${f3(s.w)} (${pc(ratio * 100)}) · limit ${pc(s.k)}${bal != null ? ` · balance ${bal.toFixed(2)} : 1` : ''}`;
  rep.details = { ratio, wAllowed, wAct, exW, exWr, area, lNeck, balance: bal };
  rep.graphs = graphs(s, lim, area);
  return rep;
}

function graphs(s: CpwState, lim: number, area: number): GraphSpec[] {
  const wHi = Math.max(1.2 * s.d, 1.2 * s.wr, 1.2 * s.w);
  const ws = Array.from({ length: 161 }, (_, i) => (wHi * (i + 1)) / 161);
  const eShow = s.padDef === 'nsmd' ? s.e : s.e; // SMD: the curve shows what an NSMD opening would expose
  const ex = ws.map((w) => (exposedTrace(s.shape, s.d, w, eShow) / area) * 100);
  const dHi = Math.max(2 * s.d, (1.5 * s.wr) / lim);
  const ds = Array.from({ length: 121 }, (_, i) => (dHi * (i + 1)) / 121);
  return [
    {
      id: 'exposed-vs-w',
      title: 'Exposed trace copper vs trace width',
      subtitle: `${s.shape === 'rect' ? `${f3(s.d)} × ${f3(s.l)}` : `Ø ${f3(s.d)}`} land, opening e = ${f3(s.e)}${s.padDef === 'smd' ? ' (as if NSMD: SMD exposes none)' : ''}`,
      x: { label: 'Trace width at the land W', unit: 'm' },
      y: [{ id: 'a', label: 'Extra wettable area, % of land', unit: '%', includeZero: true }],
      legend: 'below',
      series: [{ label: 'trace copper in the opening', x: ws, y: ex, width: 2.2 }],
      vlines: [
        { value: lim * s.d, label: `limit ${f3(lim * s.d)}`, color: '#8b1e1e', dash: [6, 4] },
        ...(Math.abs(s.wr - s.w) > 1e-9 * s.w ? [{ value: s.wr, label: `W_r ${f3(s.wr)}`, color: '#9a8f7a', dash: [3, 3] }] : []),
      ],
      markers: [{ x: s.w, y: (exposedTrace(s.shape, s.d, s.w, eShow) / area) * 100, label: `W ${f3(s.w)}` }],
    },
    {
      id: 'wmax-vs-d',
      title: 'Widest trace vs land width',
      subtitle: `limit ${pc(s.k)} of the land`,
      x: { label: s.shape === 'rect' ? 'Land width D' : 'Land diameter D', unit: 'm' },
      y: [{ id: 'w', label: 'Widest trace at the land', unit: 'm', includeZero: true }],
      series: [{ label: `W = ${pc(s.k)} × D`, x: ds, y: ds.map((d) => lim * d), width: 2.2 }],
      hlines: [{ value: s.wr, label: `W_r = ${f3(s.wr)}`, color: '#9a8f7a', dash: [3, 3] }],
      vlines: [{ value: s.d, label: `D = ${f3(s.d)}`, color: '#9a8f7a' }],
      markers: [{ x: s.d, y: s.w, label: `W ${f3(s.w)}` }],
    },
  ];
}

export const def: CalcDef<CpwState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Guideline check, not a physical law: trace width at an NSMD land ≤ 2/3 of the land (TI AN-1112 §4.1; same rule in TI power-device datasheets), solved for the widest trace or the smallest land. Exact plane geometry for the trace copper exposed in the mask opening (rectangle: min(W, D+2e)·e; circle: difference of circular segments) and the neck length e + δ_reg; thermal-balance indicator = ratio of copper widths leaving the two lands (Suntron 0402 study, 2011; 1.5 : 1 flag is a labelled rule of thumb).',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'ratio',
    options: [
      { key: 'ratio', label: 'Check the trace as entered (analysis)' },
      { key: 'w', label: 'Widest trace W at the land' },
      { key: 'd', label: 'Smallest land D for the trace' },
    ],
  },
  compute,
  sync: (s) => {
    if (s.rule === 'ti' && Math.abs(s.k - TI_PCT) > 1e-9) s.rule = 'custom';
    // a target on the old limit moves with a typed limit, as it does when the Limit select changes; a target the user
    // chose (say 50 % for margin) stays
    if (s.solveFor !== 'ratio' && s.kSeen != null && Math.abs(s.ratio - s.kSeen) < 1e-9 && Math.abs(s.k - s.kSeen) > 1e-12) s.ratio = s.k;
    s.kSeen = s.k;
  },
  examples: [
    { id: 'default', label: '0402 land, 0.5 mm supply trace: widest trace at the land (neck-down)', state: defaults() },
    { id: 'microchip-wlcsp', label: 'Microchip WLCSP: 0.23 mm NSMD land, 75 µm trace (check)', state: { ...defaults(), solveFor: 'ratio', shape: 'round', d: 0.23 * MM, w: 0.075 * MM, wr: 0.075 * MM, e: 0.05 * MM, reg: 0.025 * MM, other: 'none', ratio: (0.075 / 0.23) * 100 } },
    { id: 'csp-too-wide', label: '0.3 mm CSP land with a 0.25 mm trace: too wide (check)', state: { ...defaults(), solveFor: 'ratio', shape: 'round', d: 0.3 * MM, w: 0.25 * MM, wr: 0.25 * MM, e: 0.05 * MM, other: 'none', ratio: (0.25 / 0.3) * 100 } },
    { id: 'pour-direct', label: '0402: one land straight into a ground pour (tombstone risk)', state: { ...defaults(), other: 'pour', wr: 0.3 * MM } },
    { id: 'spokes', label: '0402: the pour joined by two 0.2 mm spokes instead', state: { ...defaults(), other: 'spokes', ns: 2, wsp: 0.2 * MM } },
    { id: 'min-land', label: 'Smallest round land for a 0.3 mm trace at 2/3', state: { ...defaults(), solveFor: 'd', shape: 'round', d: 0.45 * MM, w: 0.3 * MM, wr: 0.3 * MM, other: 'none' } },
    { id: 'smd', label: 'Mask-defined land: the trace stays under mask', state: { ...defaults(), solveFor: 'ratio', padDef: 'smd', w: 0.5 * MM, wr: 0.5 * MM, ratio: (0.5 / 0.6) * 100 } },
  ],
};
