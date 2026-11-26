/** MOSFET operating point — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM } from '@/core/unitsets';
import { FET_PRESETS, idAtVds, idOf, kFromGfs, kFromPoint, smallSignal, solveOp, vovFor, type Circuit, type Fet, type OpPoint } from './model';

export const ID = 'general/mosfet-operating-point';

export interface FetState {
  solveFor: 'id' | 'gate' | 'rd';
  type: 'n' | 'p';
  bias: 'vgs' | 'divider';
  vdd: number;
  vgs: number;
  r1: number;
  r1Unit: string;
  r2: number;
  r2Unit: string;
  rd: number;
  rdUnit: string;
  rs: number;
  rsUnit: string;
  id: number;
  idUnit: string;
  vds: number;
  part: string;
  form: 'point' | 'gfs' | 'k';
  vth: number;
  vgsPt: number;
  idPt: number;
  idPtUnit: string;
  gfs: number;
  idG: number;
  idGUnit: string;
  k: number;
  lambda: number;
  vthMin: number | null;
  vthMax: number | null;
  vdsMax: number;
  vgsMax: number;
  idMax: number;
  idMaxUnit: string;
  ptot: number;
  /** Channel and K form at the last compute (kept by sync): lets a switch carry the bias / K across */
  prevType?: 'n' | 'p';
  prevForm?: FetState['form'];
}

const U_I: Record<string, number> = { mA: 1e-3, 'µA': 1e-6, A: 1, nA: 1e-9, pA: 1e-12 };
const DEFAULT_PART = '2N7000 (TO-92)';

export const defaults = (): FetState => ({
  solveFor: 'id',
  type: 'n',
  bias: 'divider',
  vdd: 12,
  vgs: 2.4,
  r1: 1e6,
  r1Unit: 'MΩ',
  r2: 510e3,
  r2Unit: 'kΩ',
  rd: 150,
  rdUnit: 'Ω',
  rs: 47,
  rsUnit: 'Ω',
  id: 30e-3,
  idUnit: 'mA',
  vds: 6,
  part: DEFAULT_PART,
  form: 'gfs',
  vth: 2.1,
  vgsPt: 3.35,
  idPt: 0.2,
  idPtUnit: 'mA',
  gfs: 0.32,
  idG: 0.2,
  idGUnit: 'mA',
  k: 0.256,
  lambda: 0,
  vthMin: 0.8,
  vthMax: 3,
  vdsMax: 60,
  vgsMax: 20,
  idMax: 0.2,
  idMaxUnit: 'mA',
  ptot: 0.4,
});

const isDiv = (_s: unknown, r: Record<string, any>) => r.bias === 'divider';
const solvedIn = (...keys: string[]) => (_s: unknown, r: Record<string, any>) => keys.includes(r.solveFor);

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Circuit',
    note: 'V_DD → R_D → drain; source → R_S → ground. P-channel: enter magnitudes.',
    fields: [
      { kind: 'select', key: 'type', label: 'Channel', options: [{ value: 'n', label: 'N-channel' }, { value: 'p', label: 'P-channel' }], apply: (v, s) => { const p = FET_PRESETS[s.part]; if (p && p.type !== v) s.part = 'Custom'; mirror(s, v); }, help: 'P-channel is drawn with its source towards V_DD. All voltages are entered and solved as magnitudes; the results show the real signs.' },
      {
        kind: 'select', key: 'bias', label: 'Gate bias', options: [{ value: 'vgs', label: 'V_GS applied directly' }, { value: 'divider', label: 'Divider R1/R2 + R_S' }],
        apply: (_v, _s, r) => { if (r.solveFor === 'gate') r.solveFor = 'id'; },
        help: 'Direct: a fixed gate–source voltage (R_S = 0). Divider: the gate sits at V_DD·R2/(R1+R2) and a source resistor R_S sets negative feedback.',
      },
      { kind: 'number', key: 'vdd', symbol: 'V_DD', label: 'Supply voltage', unit: 'V', min: 0.1, max: 1000 },
      { kind: 'number', key: 'vgs', symbol: 'V_GS', label: 'Gate–source voltage', unit: 'V', solvable: true, min: 0, max: 100, visible: (_s, r) => r.bias === 'vgs', solvedWhen: solvedIn('gate'), onSolve: (_s, r) => (r.solveFor = 'gate'), onUnsolve: (_s, r) => (r.solveFor = 'id') },
      { kind: 'number', key: 'r1', symbol: 'R₁', label: 'Gate resistor to V_DD', units: U_OHM, unitKey: 'r1Unit', min: 1, max: 1e10, visible: isDiv },
      { kind: 'number', key: 'r2', symbol: 'R₂', label: 'Gate resistor to ground', units: U_OHM, unitKey: 'r2Unit', solvable: true, min: 1, max: 1e10, visible: isDiv, solvedWhen: solvedIn('gate'), onSolve: (_s, r) => (r.solveFor = 'gate'), onUnsolve: (_s, r) => (r.solveFor = 'id'), help: 'Solve it (◎) for the gate bias that gives the target I_D.' },
      { kind: 'number', key: 'rd', symbol: 'R_D', label: 'Drain resistor', units: U_OHM, unitKey: 'rdUnit', solvable: true, min: 0, max: 1e9, onUnsolve: (_s, r) => (r.solveFor = 'id'), help: '0 for a drain tied straight to V_DD (then V_DS = V_DD). Solve it (◎) for a target V_DS.' },
      { kind: 'number', key: 'rs', symbol: 'R_S', label: 'Source resistor', units: U_OHM, unitKey: 'rsUnit', min: 0, max: 1e9, visible: isDiv, help: 'Source degeneration: stabilises I_D against V_th and K spread.' },
    ],
  },
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'id', symbol: 'I_D', label: 'Drain current', units: U_I, unitKey: 'idUnit', solvable: true, min: 0, max: 1000, solvedWhen: solvedIn('id', 'rd'), onSolve: (_s, r) => (r.solveFor = 'id'), onUnsolve: (_s, r) => (r.solveFor = 'gate'), help: 'Result of the analysis, or the target when solving for the gate bias.' },
      { kind: 'number', key: 'vds', symbol: 'V_DS', label: 'Drain–source voltage', unit: 'V', solvable: true, min: 0, max: 1000, solvedWhen: solvedIn('id', 'gate'), onSolve: (_s, r) => (r.solveFor = 'id'), onUnsolve: (_s, r) => (r.solveFor = 'rd'), help: 'Result of the analysis, or the target when solving for R_D.' },
    ],
  },
  {
    kind: 'section',
    title: 'Square-law model',
    fields: [
      {
        kind: 'select', key: 'part', label: 'Part preset', options: Object.keys(FET_PRESETS),
        apply: (v, s) => {
          const p = FET_PRESETS[v];
          if (p) mirror(s, p.type);
          if (p) Object.assign(s, { type: p.type, form: 'gfs', vth: p.vth, vthMin: p.vthMin, vthMax: p.vthMax, gfs: p.gfs, idG: p.idG, vdsMax: p.vdsMax, vgsMax: p.vgsMax, idMax: p.idMax, ptot: p.ptot });
        },
        help: 'Fits K to the datasheet forward transconductance g_fs at its test current (typical, or minimum where no typical is given). These are vertical power devices: treat the result as an estimate near that current.',
      },
      { kind: 'select', key: 'form', label: 'K from', apply: (v, s) => carryK(s, v), options: [{ value: 'gfs', label: 'g_fs at a current' }, { value: 'point', label: 'One (V_GS, I_D) point' }, { value: 'k', label: 'K entered directly' }], help: 'K = 2I_D/(V_GS − V_th)² from a point on the transfer curve, K = g_fs²/(2I_D) from a transconductance spec, or K = µC_ox·W/L directly.' },
      { kind: 'number', key: 'vth', symbol: 'V_th', label: 'Threshold voltage', unit: 'V', min: 0.01, max: 50, help: 'Typical V_GS(th). Note the datasheet test current (often 250 µA or 1 mA): the square law’s V_th is an extrapolation, so fit it to your own data when it matters.' },
      { kind: 'number', key: 'gfs', symbol: 'g_fs', label: 'Transconductance', unit: 'S', min: 1e-6, max: 1e4, visible: (_s, r) => r.form === 'gfs' },
      { kind: 'number', key: 'idG', symbol: 'I_D,gfs', label: 'at drain current', units: U_I, unitKey: 'idGUnit', min: 1e-9, max: 1000, visible: (_s, r) => r.form === 'gfs' },
      { kind: 'number', key: 'vgsPt', symbol: 'V_GS1', label: 'Point: gate voltage', unit: 'V', min: 0.01, max: 100, visible: (_s, r) => r.form === 'point' },
      { kind: 'number', key: 'idPt', symbol: 'I_D1', label: 'Point: drain current', units: U_I, unitKey: 'idPtUnit', min: 1e-9, max: 1000, visible: (_s, r) => r.form === 'point', help: 'A point on the typical transfer characteristic (I_D vs V_GS in saturation), with V_th typical. The 2N7000 default (200 mA at 3.35 V) is the point its typical g_fs = 320 mS at 200 mA implies. Do not pair a guaranteed minimum such as I_D(on) with a typical V_th.' },
      { kind: 'number', key: 'k', symbol: 'K', label: 'Transconductance par.', unit: 'A/V²', min: 1e-9, max: 1e5, visible: (_s, r) => r.form === 'k', help: 'K = µC_ox·W/L (Sedra & Smith’s k_n). I_D = (K/2)·V_ov² in saturation.' },
      { kind: 'number', key: 'lambda', symbol: 'λ', label: 'Channel-length mod.', suffix: '1/V', min: 0, max: 1, help: 'Output-conductance parameter: I_D grows by (1 + λV_DS). Discrete datasheets do not give it; estimate it from the slope of the output curves (λ ≈ ΔI_D/(I_D·ΔV_DS)) or leave 0.' },
      { kind: 'number', key: 'vthMin', symbol: 'V_th,min', label: 'Threshold, min', unit: 'V', optional: true, zeroHint: 'not checked', min: 0.01, max: 50, help: 'Datasheet spread. The page recomputes the bias at both ends; leave blank to skip.' },
      { kind: 'number', key: 'vthMax', symbol: 'V_th,max', label: 'Threshold, max', unit: 'V', optional: true, zeroHint: 'not checked', min: 0.01, max: 50 },
    ],
  },
  {
    kind: 'section',
    title: 'Ratings',
    collapsed: true,
    fields: [
      { kind: 'number', key: 'vdsMax', symbol: 'V_DS,max', label: 'Drain–source rating', unit: 'V', min: 0.1, max: 10000 },
      { kind: 'number', key: 'vgsMax', symbol: 'V_GS,max', label: 'Gate–source rating', unit: 'V', min: 0.1, max: 100 },
      { kind: 'number', key: 'idMax', symbol: 'I_D,max', label: 'Continuous drain current', units: U_I, unitKey: 'idMaxUnit', min: 1e-6, max: 10000 },
      { kind: 'number', key: 'ptot', symbol: 'P_tot', label: 'Power rating (25 °C)', unit: 'W', min: 1e-3, max: 10000 },
    ],
  },
];

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fI = (i: number, d = 3) => si(i, 'A', d);
const fV = (v: number, d = 4) => si(v, 'V', d).replace(/^-/, '−');

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

/** K of the square law from the selected fit. */
export function fitK(s: Pick<FetState, 'form' | 'vth' | 'vgsPt' | 'idPt' | 'gfs' | 'idG' | 'k'>): number {
  if (s.form === 'point') {
    if (!(s.vgsPt > s.vth)) throw new Error(`The datasheet point V_GS1 = ${fV(s.vgsPt, 3)} must be above V_th = ${fV(s.vth, 3)}.`);
    return kFromPoint(s.idPt, s.vgsPt, s.vth);
  }
  if (s.form === 'gfs') return kFromGfs(s.gfs, s.idG);
  if (s.form === 'k') return s.k;
  throw new Error(`Unknown parameter form "${String(s.form)}".`);
}

/**
 * A channel switch keeps the bias: measured from the source rail the P-channel circuit is the N one with R1 and R2
 * exchanged, so they are swapped (the drawing then shows the mirrored divider with the same currents).
 */
function mirror(s: Record<string, any>, to: 'n' | 'p'): void {
  if (s.prevType != null && s.prevType !== to) [s.r1, s.r2, s.r1Unit, s.r2Unit] = [s.r2, s.r1, s.r2Unit, s.r1Unit];
  s.prevType = to;
}

/** A switch of the K form carries the current K over (the new form's parameters are set to reproduce it). */
function carryK(s: Record<string, any>, to: FetState['form']): void {
  const from = s.prevForm;
  s.prevForm = to;
  if (from == null || from === to) return;
  let k: number;
  try {
    k = fitK({ ...(s as FetState), form: from });
  } catch {
    return;
  }
  if (!(k > 0) || !Number.isFinite(k)) return;
  if (to === 'k') s.k = k;
  else if (to === 'gfs') s.gfs = Math.sqrt(2 * k * s.idG);
  else if (to === 'point') s.vgsPt = s.vth + Math.sqrt((2 * s.idPt) / k);
}

/** Gate voltage (frame) of the bias network, and the resistor from which it is set. */
const gateOf = (s: FetState) => (s.bias === 'vgs' ? s.vgs : s.type === 'p' ? (s.vdd * s.r1) / (s.r1 + s.r2) : (s.vdd * s.r2) / (s.r1 + s.r2));

export function compute(st: FetState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: FetState): CalcReport {
  const s: FetState = { ...st };
  const vdd = finite('Supply voltage', s.vdd);
  for (const [n, v] of [['V_th', s.vth], ['λ', s.lambda], ['R_D', s.rd], ['R₁', s.r1], ['R₂', s.r2], ['R_S', s.rs], ['V_GS', s.vgs], ['g_fs', s.gfs], ['I_D (g_fs)', s.idG], ['V_GS1', s.vgsPt], ['I_D1', s.idPt], ['K', s.k]] as const) finite(n, v);
  if (!(vdd > 0) || !(s.vth > 0) || !(s.lambda >= 0)) throw new Error('V_DD and V_th must be > 0, λ ≥ 0.');
  if (s.type !== 'n' && s.type !== 'p') throw new Error(`Unknown channel "${String(s.type)}".`);
  if (s.bias !== 'vgs' && s.bias !== 'divider') throw new Error(`Unknown gate bias "${String(s.bias)}".`);
  const k = fitK(s);
  if (!(k > 0) || !Number.isFinite(k)) throw new Error('The fitted K must be > 0: check the datasheet values.');
  const f: Fet = { vth: s.vth, k, lambda: s.lambda };
  const div = s.bias === 'divider';
  const rs = div ? s.rs : 0;
  if (!(s.rd >= 0) || !(rs >= 0)) throw new Error('R_D and R_S must be ≥ 0.');
  if (div && !(s.r1 > 0)) throw new Error('R1 must be > 0.');
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });

  let op: OpPoint;
  if (s.solveFor === 'id') {
    if (div && !(s.r2 > 0)) throw new Error('R2 must be > 0.');
    op = solveOp({ vdd, vg: gateOf(s), rd: s.rd, rs }, f);
    if (op.id > 1000) return fail(`I_D would be ${fI(op.id)}: over 1 kA. Check K and the bias, or add R_D.`);
    s.id = op.id;
    s.vds = op.vds;
  } else if (s.solveFor === 'gate') {
    const id = finite('Target I_D', s.id);
    if (!(id > 0)) throw new Error('Target drain current must be > 0.');
    const vds = vdd - id * (s.rd + rs);
    if (!(vds > 1e-9 * vdd)) return fail(`I_D = ${fI(id)} through R_D + R_S = ${fR(s.rd + rs, 3)} would need more than V_DD = ${fV(vdd, 3)} (it drops ${fV(id * (s.rd + rs), 3)}). Lower R_D or the target current.`);
    const vgs = f.vth + vovFor(id, vds, f);
    const vg = vgs + id * rs;
    if (!div) {
      if (vgs > 100) return fail(`It would take V_GS = ${fV(vgs, 3)}: check the target current and K.`);
      s.vgs = vgs;
    } else {
      if (!(vg < vdd)) return fail(`The gate would have to sit at ${fV(vg, 3)}, above V_DD = ${fV(vdd, 3)}, which a divider cannot reach. Lower R_S or the target current.`);
      const r2 = s.type === 'p' ? (s.r1 * (vdd - vg)) / vg : (s.r1 * vg) / (vdd - vg);
      if (!(r2 >= 1 && r2 <= 1e10)) return fail(`R2 would be ${fR(r2, 3)}, outside 1 Ω … 10 GΩ. Change R1.`);
      s.r2 = r2;
    }
    op = { id, vgs, vds, region: vds < vgs - f.vth ? 'triode' : 'saturation' };
    s.vds = vds;
  } else if (s.solveFor === 'rd') {
    const vdsT = finite('Target V_DS', s.vds);
    if (div && !(s.r2 > 0)) throw new Error('R2 must be > 0.');
    if (!(vdsT > 0)) throw new Error('Target V_DS must be > 0.');
    const vg = gateOf(s);
    if (!(vg > f.vth)) return fail(`The gate is at ${fV(vg, 3)}, not above V_th = ${fV(f.vth, 3)}: no drain current flows, so no R_D sets V_DS. Raise the gate bias.`);
    const id = idAtVds(vg, rs, vdsT, f);
    if (id > 1000) return fail(`I_D would be ${fI(id)}: over 1 kA. Check K and the gate bias.`);
    const rd = (vdd - vdsT) / id - rs;
    if (!(vdsT < vdd) || !(rd >= 0)) return fail(`V_DS = ${fV(vdsT, 3)} is out of reach: even with R_D = 0 the drain sits at ${fV(vdd - id * rs, 3)} (V_DD minus the drop across R_S). Choose a lower V_DS.`);
    if (rd > 1e9) return fail(`R_D would be ${fR(rd, 3)}: over 1 GΩ.`);
    s.rd = rd;
    s.id = id;
    op = { id, vgs: vg - id * rs, vds: vdsT, region: vdsT < vg - id * rs - f.vth ? 'triode' : 'saturation' };
  } else throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);

  const vg = div ? gateOf(s) : op.vgs + op.id * rs;
  const vov = op.vgs - f.vth;
  const ss = smallSignal(op.vgs, op.vds, f);
  const ro = ss.gds > 0 ? 1 / ss.gds : Infinity;
  const rdRo = Number.isFinite(ro) ? (s.rd * ro) / (s.rd + ro) : s.rd;
  const avByp = -ss.gm * rdRo;
  const avDeg = -(ss.gm * s.rd) / (1 + ss.gm * rs);
  const pd = op.id * op.vds;
  const circ: Circuit = { vdd, vg, rd: s.rd, rs };
  const spread = (vth: number | null) => (vth != null && vth > 0 ? solveOp(circ, { ...f, vth }) : null);
  const vthLo = s.vthMin != null && s.vthMax != null ? Math.min(s.vthMin, s.vthMax) : s.vthMin;
  const vthHi = s.vthMin != null && s.vthMax != null ? Math.max(s.vthMin, s.vthMax) : s.vthMax;
  const opLo = spread(vthLo); // low threshold → most current
  const opHi = spread(vthHi);
  const idFit = s.form === 'gfs' ? s.idG : s.form === 'point' ? s.idPt : null;
  const pch = s.type === 'p';
  const sg = pch ? -1 : 1;
  const node = (v: number) => (pch ? vdd - v : v);
  const vgsSym = 'V_GS';

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const regionTone = op.region === 'cutoff' ? 'warn' : '';
  const results: ResultItem[] = [];
  if (s.solveFor === 'gate') {
    if (div) results.push(item('r2', 'Gate resistor to ground', s.r2, 'Ω', fR(s.r2), { symbol: 'R₂', solved: true, primary: true, note: `V_G = ${fV(node(vg), 4)}` }));
    else results.push(item('vgs', 'Gate–source voltage', s.vgs, 'V', fV(sg * s.vgs), { symbol: vgsSym, solved: true, primary: true, note: `V_ov = ${fV(vov, 3)}` }));
    results.push(item('vds', 'Drain–source voltage', op.vds, 'V', fV(sg * op.vds), { symbol: 'V_DS', solved: true, primary: true, note: op.region }));
  } else if (s.solveFor === 'rd') {
    results.push(
      item('rd', 'Drain resistor', s.rd, 'Ω', fR(s.rd), { symbol: 'R_D', solved: true, primary: true }),
      item('id', 'Drain current', op.id, 'A', fI(op.id, 4), { symbol: 'I_D', solved: true, primary: true, note: op.region }),
    );
  } else {
    results.push(
      item('id', 'Drain current', op.id, 'A', fI(op.id, 4), { symbol: 'I_D', solved: true, primary: true, tone: regionTone }),
      item('vds', 'Drain–source voltage', op.vds, 'V', fV(sg * op.vds), { symbol: 'V_DS', solved: true, primary: true }),
    );
  }
  results.push(item('region', 'Operating region', op.region, '', op.region, { primary: true, tone: regionTone, note: op.region === 'cutoff' ? `V_GS ≤ V_th` : op.region === 'triode' ? `V_DS < V_ov = ${fV(vov, 3)}` : `V_DS ≥ V_ov = ${fV(vov, 3)}` }));
  results.push(item('gm', 'Transconductance', ss.gm, 'S', si(ss.gm, 'S', 3), { symbol: 'g_m', primary: true, note: op.region === 'saturation' ? '= 2I_D/V_ov' : undefined }));
  results.push(
    item('vgsOp', 'Gate–source voltage', sg * op.vgs, 'V', fV(sg * op.vgs), { symbol: vgsSym, group: 'Bias point' }),
    item('vov', 'Overdrive', vov, 'V', fV(vov, 3), { symbol: 'V_ov', group: 'Bias point', note: 'V_GS − V_th' }),
    item('vgNode', 'Gate voltage', node(vg), 'V', fV(node(vg)), { symbol: 'V_G', group: 'Bias point', note: 'to ground' }),
    item('vsNode', 'Source voltage', node(op.id * rs), 'V', fV(node(op.id * rs)), { symbol: 'V_S', group: 'Bias point' }),
    item('vdNode', 'Drain voltage', node(op.id * rs + op.vds), 'V', fV(node(op.id * rs + op.vds)), { symbol: 'V_D', group: 'Bias point' }),
    item('vdsat', 'Saturation edge', Math.max(vov, 0), 'V', fV(Math.max(vov, 0), 3), { symbol: 'V_DS,sat', group: 'Bias point', note: 'V_DS ≥ V_ov for saturation' }),
    item('pd', 'Dissipation', pd, 'W', si(pd, 'W', 3), { symbol: 'P_D', group: 'Bias point', tone: pd > s.ptot ? 'fail' : pd > 0.5 * s.ptot ? 'warn' : '' }),
    item('kFit', 'Square-law K', k, 'A/V²', `${si(k, 'A', 4)}/V²`, { symbol: 'K', group: 'Model', note: s.form === 'gfs' ? 'g_fs²/(2I_D)' : s.form === 'point' ? '2I_D1/(V_GS1 − V_th)²' : 'entered' }),
    item('ro', 'Output resistance', Number.isFinite(ro) ? ro : null, 'Ω', Number.isFinite(ro) ? fR(ro, 3) : '∞ (λ = 0)', { symbol: 'r_o', group: 'Small signal' }),
    item('avByp', 'Gain, R_S bypassed', avByp, 'V/V', avByp.toFixed(2), { symbol: 'A_v', group: 'Small signal', note: '−g_m·(R_D ∥ r_o)' }),
  );
  if (div && rs > 0) results.push(item('avDeg', 'Gain, R_S not bypassed', avDeg, 'V/V', avDeg.toFixed(2), { symbol: 'A_v', group: 'Small signal', note: '−g_m·R_D/(1 + g_m·R_S), r_o ignored' }));
  if (op.region === 'triode' && ss.gds > 0) results.push(item('rdsLin', 'Channel resistance', op.vds / op.id, 'Ω', fR(op.vds / op.id, 3), { symbol: 'R_DS', group: 'Small signal', note: 'V_DS / I_D in triode' }));
  if (opLo || opHi) {
    const show = (o: OpPoint | null, v: number | null) => (o && v != null ? `${fI(o.id)} (${o.region}) at V_th ${fV(v, 3)}` : '—');
    results.push(
      item('idVthMin', 'I_D at V_th,min', opLo?.id ?? null, 'A', show(opLo, vthLo), { group: 'Threshold spread', tone: opLo && opLo.region !== op.region ? 'warn' : '' }),
      item('idVthMax', 'I_D at V_th,max', opHi?.id ?? null, 'A', show(opHi, vthHi), { group: 'Threshold spread', tone: opHi && opHi.region !== op.region ? 'warn' : '' }),
    );
  }
  report.results = results;

  // ── warnings: model validity first
  if (op.region === 'cutoff') warnings.push(`V_GS = ${fV(op.vgs, 3)} is below V_th = ${fV(f.vth, 3)}: the square law gives no current. A real device still conducts a subthreshold current (µA–mA near threshold, exponential in V_GS). Raise the gate bias.`);
  else if (vov < 0.15) warnings.push(`Overdrive is only ${fV(vov, 3)}: close to threshold the current is closer to exponential than square-law, so I_D here may be off by a large factor.`);
  if (idFit != null && op.id > 0 && (op.id > 5 * idFit || op.id < idFit / 20)) warnings.push(`I_D = ${fI(op.id)} is far from the ${fI(idFit)} where K was fitted. Discrete (vertical) MOSFETs follow the square law only roughly: at high current I_D rises nearly linearly with V_GS, at low current more steeply. Fit K near your operating current, or read the datasheet transfer curve.`);
  if (opLo && opHi && opLo.id > 0 && (opLo.id - opHi.id) / Math.max(op.id, 1e-15) > 0.5) warnings.push(`Over the threshold spread ${fV(vthLo!, 3)} … ${fV(vthHi!, 3)} the current ranges ${fI(opHi.id)} … ${fI(opLo.id)}. ${rs > 0 ? 'Increase R_S (with a higher gate voltage) for more degeneration.' : 'Use a divider with a source resistor, or a current-mirror/feedback bias.'}`);
  if (op.region === 'triode' && s.solveFor !== 'rd') notes.push('Triode region: the MOSFET acts as a voltage-controlled resistor, as in a switch. For an amplifier bias, aim for V_DS a few volts above V_ov.');
  if (vdd > s.vdsMax) warnings.push(`V_DD = ${fV(vdd, 3)} exceeds the drain–source rating ${fV(s.vdsMax, 3)} (the drain sees it when the device is off).`);
  if (op.vgs > s.vgsMax || (s.bias === 'divider' && vg > s.vgsMax)) warnings.push(`The gate–source voltage can exceed the ${fV(s.vgsMax, 3)} rating. Keep V_GS below it.`);
  if (op.id > s.idMax) warnings.push(`I_D = ${fI(op.id)} exceeds the continuous rating ${fI(s.idMax)}.`);
  if (pd > s.ptot) warnings.push(`The MOSFET dissipates ${si(pd, 'W', 3)}, above its ${si(s.ptot, 'W', 3)} rating. Lower I_D or V_DS, or add heat sinking.`);
  else if (pd > 0.5 * s.ptot) warnings.push(`The MOSFET dissipates ${si(pd, 'W', 3)}, over half its 25 °C rating: check the derating and the board’s thermal resistance.`);
  notes.push(
    'Square-law (Shichman–Hodges, SPICE level 1) model with one K for the whole curve: accurate for long-channel devices, an estimate for discrete power MOSFETs.',
    'V_th falls about 2–5 mV/°C and K falls with temperature (mobility); neither is modelled.',
  );
  if (pch) notes.push('P-channel: solved with magnitudes; V_GS and V_DS are shown negative, node voltages to ground.');

  report.summary = `${pch ? 'P' : 'N'}-channel · V_DD ${fV(vdd, 3)} · I_D ${fI(op.id)} · V_DS ${fV(sg * op.vds, 3)} · ${op.region}`;
  report.details = { op, k, vg, vov, gm: ss.gm, gds: ss.gds, opLo, opHi, rs, pd };
  report.tables.push(spreadTable(circ, f, s, sg));
  report.graphs = graphs(s, f, circ, op, idFit, sg);
  return report;
}

function spreadTable(c: Circuit, f: Fet, s: FetState, sg: number): TableSpec {
  const vths = [s.vthMin, f.vth, s.vthMax].filter((v): v is number => v != null && v > 0).sort((a, b) => a - b);
  const uniq = [...new Set(vths)];
  const pts = uniq.map((v) => ({ v, o: solveOp(c, { ...f, vth: v }) }));
  return {
    id: 'vth-spread',
    title: 'Bias point across the threshold spread',
    columns: [
      { key: 'vth', label: 'V_th', unit: 'V' },
      { key: 'id', label: 'I_D', unit: 'A' },
      { key: 'vds', label: 'V_DS', unit: 'V' },
      { key: 'region', label: 'Region', align: 'left' },
    ],
    rows: pts.map(({ v, o }) => ({ vth: v, id: o.id, vds: sg * o.vds, region: o.region })),
    display: pts.map(({ v, o }) => ({ vth: fV(v, 3), id: fI(o.id), vds: fV(sg * o.vds, 3), region: o.region })),
    rowTones: pts.map(({ o }) => (o.region === 'saturation' ? (o.id * o.vds > s.ptot ? 'fail' : 'pass') : o.region === 'triode' ? 'warn' : 'fail')),
    note: 'Green: saturation (amplifier bias). Yellow: triode. Red: cut off or over the power rating. Same gate bias and resistors, K unchanged.',
  };
}

function graphs(s: FetState, f: Fet, c: Circuit, op: OpPoint, idFit: number | null, sg: number): GraphSpec[] {
  const out: GraphSpec[] = [];
  // 1 — output characteristics around the operating V_GS, with the load line
  const vov = Math.max(op.vgs - f.vth, 0);
  const step = Math.max(vov / 2, 0.1 * f.vth, 0.1);
  const vgsList = [-2, -1, 0, 1, 2].map((n) => op.vgs + n * step).filter((v) => v > f.vth + 1e-9);
  const xMax = c.vdd * 1.05;
  const xs = Array.from({ length: 161 }, (_, i) => (xMax * i) / 160);
  const rt = c.rd + c.rs;
  // The axis fits the whole family (no clipped curve can pose as a plateau); only the load line and the
  // saturation-edge parabola are cut geometrically where they leave the plot.
  const yTop = Math.max(op.id * 1.2, ...vgsList.map((v) => idOf(v, xMax, f)), 1e-12) * 1.05;
  const edgeX = xs.filter((x) => (f.k / 2) * x * x * (1 + f.lambda * x) <= yTop);
  const iLine0 = rt > 0 ? c.vdd / rt : 0;
  const xLine0 = iLine0 > yTop ? c.vdd * (1 - yTop / iLine0) : 0;
  out.push({
    id: 'output',
    title: 'Output characteristics',
    subtitle: `V_GS steps of ${fV(step, 2)}`,
    x: { label: s.type === 'p' ? '|V_DS|' : 'Drain–source voltage V_DS', unit: 'V' },
    y: [{ id: 'i', label: 'Drain current', unit: 'A', includeZero: true, min: 0, max: yTop }],
    series: [
      ...vgsList.map((v, n) => ({ label: `V_GS ${fV(v, 3)}`, x: xs, y: xs.map((x) => idOf(v, x, f)), axis: 'i', width: Math.abs(v - op.vgs) < 1e-12 ? 2.4 : 1.2, color: Math.abs(v - op.vgs) < 1e-12 ? '#1f4e5f' : ['#9a8f7a', '#4f8a8b', '#6b5b95', '#2f7d4f', '#c47b17'][n % 5] })),
      ...(rt > 0 ? [{ label: 'Load line', x: [xLine0, c.vdd], y: [Math.min(iLine0, yTop), 0], axis: 'i', width: 1.8, dash: [6, 3], color: '#c47b17' }] : []),
      ...(edgeX.length > 1 ? [{ label: 'V_DS = V_ov', x: edgeX, y: edgeX.map((x) => (f.k / 2) * x * x * (1 + f.lambda * x)), axis: 'i', width: 1, dash: [2, 3], color: '#9a8f7a' }] : []),
    ],
    markers: [{ x: op.vds, y: op.id, axis: 'i', label: `Q ${fI(op.id)}` }],
    legend: 'below',
  });
  // 2 — transfer curve in saturation at the operating V_DS
  const vdsT = Math.max(op.vds, 1e-6);
  const g1 = Math.max(op.vgs, f.vth) + Math.max(2 * vov, f.vth, 1);
  const gs = Array.from({ length: 161 }, (_, i) => (g1 * i) / 160);
  const sat = (v: number) => (v > f.vth ? (f.k / 2) * (v - f.vth) ** 2 * (1 + f.lambda * vdsT) : 0);
  const marks = [{ x: op.vgs, y: op.id, axis: 'i', label: `Q ${fI(op.id)}` }];
  if (idFit != null && s.form === 'point') marks.push({ x: s.vgsPt, y: sat(s.vgsPt), axis: 'i', label: 'datasheet point' });
  out.push({
    id: 'transfer',
    title: 'Transfer curve (saturation)',
    subtitle: `V_DS = ${fV(sg * vdsT, 3)}`,
    x: { label: s.type === 'p' ? '|V_GS|' : 'Gate–source voltage V_GS', unit: 'V' },
    y: [{ id: 'i', label: 'Drain current', unit: 'A', includeZero: true }],
    series: [{ label: 'Square law', x: gs, y: gs.map(sat), axis: 'i', width: 2.2 }],
    vlines: [
      { value: f.vth, label: 'V_th', color: '#9a8f7a', dash: [4, 3] },
      ...(s.vthMin != null ? [{ value: s.vthMin, label: 'min', color: '#c47b17', dash: [3, 3] }] : []),
      ...(s.vthMax != null ? [{ value: s.vthMax, label: 'max', color: '#c47b17', dash: [3, 3] }] : []),
    ],
    hlines: idFit != null ? [{ value: idFit, label: `fit at ${fI(idFit)}`, axis: 'i', color: '#9a8f7a', dash: [2, 3] }] : [],
    markers: marks,
  });
  return out;
}

const near = (a: number | null, b: number) => a != null && Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(b), 1e-12);

export const def: CalcDef<FetState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Square-law (Shichman–Hodges / SPICE level 1) MOSFET with channel-length modulation (Shichman & Hodges, IEEE JSSC 1968; Sedra & Smith, Microelectronic Circuits 7e §5.2–5.4, §7.4); bias point from V_GS = V_G − I_D·R_S and V_DS = V_DD − I_D(R_D+R_S) by Brent’s method; K fitted from datasheet g_fs or an (I_D, V_GS) point; datasheet presets (onsemi 2N7000, AOS AO3400A, Infineon IRLML2502, IRLZ44N).',
  fields,
  defaults,
  // Mode-switch harness notes (§12.3): ◎ gate after a cut-off analysis (I_D = 0 written) is the user's explicit request
  // and reports its own error; big jumps after a part-preset switch are a different transistor. A g_fs of 1 µS (the
  // field minimum) can give sub-picoamp currents that no unit shows as 1–9999: physically meaningless, left as is.
  solve: {
    default: 'id',
    analysis: 'id',
    options: [
      { key: 'id', label: 'I_D and V_DS from the bias' },
      { key: 'gate', label: 'Gate bias (V_GS or R2) for a target I_D' },
      { key: 'rd', label: 'R_D for a target V_DS' },
    ],
  },
  compute,
  sync: (s) => {
    s.prevType = s.type;
    s.prevForm = s.form;
    const p = FET_PRESETS[s.part];
    if (p && !(p.type === s.type && s.form === 'gfs' && near(s.vth, p.vth) && near(s.vthMin, p.vthMin) && near(s.vthMax, p.vthMax) && near(s.gfs, p.gfs) && near(s.idG, p.idG) && near(s.vdsMax, p.vdsMax) && near(s.vgsMax, p.vgsMax) && near(s.idMax, p.idMax) && near(s.ptot, p.ptot))) s.part = 'Custom';
  },
  examples: [
    { id: 'cs-2n7000', label: '2N7000 common-source stage on 12 V (1M/510k, R_D 150 Ω, R_S 47 Ω)', state: defaults() },
    { id: 'gate-for-50ma', label: 'Gate divider for 50 mA in the 2N7000 stage (solve R2)', state: { ...defaults(), solveFor: 'gate', id: 50e-3, idUnit: 'mA' } },
    { id: 'rd-for-6v', label: 'R_D that puts the 2N7000 drain at V_DS = 6 V', state: { ...defaults(), solveFor: 'rd', vds: 6 } },
    {
      id: 'sedra-nmos',
      label: 'Textbook NMOS: V_t 0.7 V, K 3.2 mA/V², R_S 3.25k, R_D 5k (Sedra & Smith, ±2.5 V → 0/5 V)',
      state: { ...defaults(), part: 'Custom', solveFor: 'id', bias: 'divider', type: 'n', vdd: 5, r1: 1e6, r1Unit: 'MΩ', r2: 1e6, r2Unit: 'MΩ', rd: 5e3, rdUnit: 'kΩ', rs: 3.25e3, rsUnit: 'kΩ', form: 'k', k: 3.2e-3, vth: 0.7, lambda: 0, vthMin: null, vthMax: null, idUnit: 'mA' },
    },
    { id: 'logic-ao3400', label: 'AO3400A at V_GS 2.5 V with a 10 Ω load: triode, far from the fit', state: { ...defaults(), ...presetState('AO3400A (SOT-23)'), solveFor: 'id', bias: 'vgs', vgs: 2.5, vdd: 5, rd: 10, rdUnit: 'Ω' } },
    {
      id: 'pmos',
      label: 'P-channel in saturation: |V_th| 1.5 V, K 20 mA/V², gate 3 V below V_DD = 5 V, R_D 100 Ω',
      state: { ...defaults(), part: 'Custom', solveFor: 'id', type: 'p', bias: 'vgs', vdd: 5, vgs: 3, rd: 100, rdUnit: 'Ω', form: 'k', k: 20e-3, vth: 1.5, lambda: 0.02, vthMin: 1, vthMax: 2, vdsMax: 20, vgsMax: 12, idMax: 1, ptot: 0.5 },
    },
  ],
};

function presetState(name: string): Partial<FetState> {
  const p = FET_PRESETS[name]!;
  return { part: name, type: p.type, form: 'gfs', vth: p.vth, vthMin: p.vthMin, vthMax: p.vthMax, gfs: p.gfs, idG: p.idG, vdsMax: p.vdsMax, vgsMax: p.vgsMax, idMax: p.idMax, ptot: p.ptot };
}
