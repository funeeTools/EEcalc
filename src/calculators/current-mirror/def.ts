/** Current mirror (BJT basic / degenerated / Wilson / Widlar, MOSFET simple / cascode) — calculator definition. DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { brent } from '@/core/calc/solve';
import { bracketE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { type MirrorIn, type MirrorPoint, type Topo, atIref, irefFromR, isBjt, rOut, rrefFor, thermalVoltage } from './model';

export const ID = 'general/current-mirror';

export interface MirrorState {
  /** iref: currents from R_ref (analysis) · rref: R_ref for a target I_ref · re: Widlar R_E and R_ref for target I_ref and I_out */
  solveFor: 'iref' | 'rref' | 're';
  topo: Topo;
  polarity: 'sink' | 'source';
  vcc: number;
  /** Output node voltage (absolute) */
  vout: number;
  n: number;
  iref: number;
  irefUnit: string;
  iout: number;
  ioutUnit: string;
  rref: number;
  rrefUnit: string;
  /** Degeneration resistor (Q1 emitter; Q2 gets R_E/N) */
  re: number;
  reUnit: string;
  /** Widlar emitter resistor */
  rw: number;
  rwUnit: string;
  bjtPart: string;
  beta: number;
  is: number;
  va: number;
  vcesat: number;
  mosPart: string;
  kp: number;
  wl: number;
  vt: number;
  lambda: number;
  temp: number;
  eseries: string;
}

/** Fairchild/onsemi SPICE models (IS, VAF); β = data-sheet minimum h_FE at I_C = 1 mA (2N3904 70, 2N3906 80); V_CE(sat) max at 10 mA. */
const BJT_PARTS: Record<string, { label: string; type: 'npn' | 'pnp'; beta: number; is: number; va: number; vcesat: number } | null> = {
  q2n3904: { label: '2N3904 (NPN)', type: 'npn', beta: 70, is: 6.734e-15, va: 74.03, vcesat: 0.2 },
  q2n3906: { label: '2N3906 (PNP)', type: 'pnp', beta: 80, is: 1.41e-15, va: 18.7, vcesat: 0.25 },
  custom: null,
};
/** Sedra & Smith 7e Example 8.1 process: k′n = 200 µA/V², V_t = 0.7 V, W/L = 10 µm/1 µm, V_A′ = 20 V/µm → λ = 0.05 V⁻¹. */
const MOS_PARTS: Record<string, { label: string; kp: number; wl: number; vt: number; lambda: number } | null> = {
  sedra: { label: 'Textbook process (Sedra & Smith Ex. 8.1)', kp: 200e-6, wl: 10, vt: 0.7, lambda: 0.05 },
  custom: null,
};

export const defaults = (): MirrorState => ({
  solveFor: 'rref',
  topo: 'bjt-basic',
  polarity: 'sink',
  vcc: 5,
  vout: 2.5,
  n: 1,
  iref: 1e-3,
  irefUnit: 'mA',
  iout: 1e-3,
  ioutUnit: 'mA',
  rref: 4.3e3,
  rrefUnit: 'kΩ',
  re: 1e3,
  reUnit: 'kΩ',
  rw: 10e3,
  rwUnit: 'kΩ',
  bjtPart: 'q2n3904',
  beta: 70,
  is: 6.734e-15,
  va: 74.03,
  vcesat: 0.2,
  mosPart: 'sedra',
  kp: 200e-6,
  wl: 10,
  vt: 0.7,
  lambda: 0.05,
  temp: 25,
  eseries: 'E24',
});

const U_I: Record<string, number> = { mA: 1e-3, 'µA': 1e-6, nA: 1e-9, A: 1, pA: 1e-12 };
const U_R: Record<string, number> = { ...withDefault(U_OHM, 'kΩ'), 'GΩ': 1e9 };
const bjt = (s: any) => isBjt(s.topo);
const mos = (s: any) => !isBjt(s.topo);
const TOPO_LABEL: Record<Topo, string> = {
  'bjt-basic': 'BJT basic (two transistors)',
  'bjt-degen': 'BJT with emitter degeneration',
  'bjt-wilson': 'BJT Wilson (three transistors)',
  'bjt-widlar': 'BJT Widlar (small currents)',
  'mos-simple': 'MOSFET simple',
  'mos-cascode': 'MOSFET cascode',
};

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Mirror',
    fields: [
      {
        kind: 'select', key: 'topo', label: 'Topology', options: Object.entries(TOPO_LABEL).map(([value, label]) => ({ value, label })),
        apply: (v, s) => {
          if (s.solveFor === 're' && v !== 'bjt-widlar') s.solveFor = 'rref';
        },
        help: 'Basic: Q1 diode-connected sets V_BE for Q2. Degeneration: emitter resistors improve matching and output resistance. Wilson: a third transistor cancels most base-current error and raises R_out by ≈ β/2. Widlar: an emitter resistor in Q2 alone gives a much smaller output current. MOSFET simple and cascode (four transistors, higher R_out, more headroom needed).',
      },
      {
        kind: 'select', key: 'polarity', label: 'Polarity', options: [{ value: 'sink', label: 'Sink (NPN / NMOS to ground)' }, { value: 'source', label: 'Source (PNP / PMOS from V_CC)' }],
        apply: (v, s) => {
          if (v === 'source' && s.bjtPart === 'q2n3904') Object.assign(s, pick('q2n3906'));
          if (v === 'sink' && s.bjtPart === 'q2n3906') Object.assign(s, pick('q2n3904'));
        },
        help: 'Same equations with voltages measured from the mirror’s rail; the drawing and the output-voltage direction follow.',
      },
      { kind: 'number', key: 'vcc', symbol: 'V_CC', label: 'Supply voltage', unit: 'V', min: 0.1, max: 1000, help: 'Drives the reference branch through R_ref.' },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output node voltage', unit: 'V', min: -1000, max: 1000, help: 'Voltage at the output (collector / drain) node, from ground. A sink needs it above the compliance voltage; a source needs it below V_CC by that much.' },
      { kind: 'number', key: 'n', symbol: 'N', label: 'Mirror ratio', suffix: '×', min: 0.01, max: 100, visible: (s) => s.topo !== 'bjt-wilson', help: 'Output / reference device size: emitter area (BJT) or W/L (MOSFET). The Wilson mirror here uses equal devices.' },
    ],
  },
  {
    kind: 'section',
    title: 'Currents & resistors',
    note: 'Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'iref', symbol: 'I_ref', label: 'Reference current', units: U_I, unitKey: 'irefUnit', solvable: true, min: 1e-12, max: 10, solvedWhen: (_s, r) => r.solveFor === 'iref', onSolve: (_s, r) => (r.solveFor = 'iref'), onUnsolve: (_s, r) => (r.solveFor = 'rref'), help: 'Current in R_ref (reference branch, including base currents).' },
      { kind: 'number', key: 'rref', symbol: 'R_ref', label: 'Reference resistor', units: U_R, unitKey: 'rrefUnit', solvable: true, min: 1e-3, max: 1e12, solvedWhen: (_s, r) => r.solveFor === 'rref' || r.solveFor === 're', onSolve: (_s, r) => (r.solveFor = 'rref'), onUnsolve: (_s, r) => (r.solveFor = 'iref'), help: 'From V_CC (or ground, for a source) to the diode-connected reference transistor.' },
      { kind: 'number', key: 'iout', symbol: 'I_out', label: 'Output current', units: U_I, unitKey: 'ioutUnit', solvable: true, min: 1e-15, max: 1e3, solvedWhen: (_s, r) => r.solveFor !== 're', onSolve: (_s, r) => { if (r.topo === 'bjt-widlar') r.solveFor = 're'; }, onUnsolve: (_s, r) => { if (r.topo === 'bjt-widlar') r.solveFor = 're'; }, help: 'An answer, except in the Widlar design (◎ on R_E), where it is the target.' },
      { kind: 'number', key: 're', symbol: 'R_E', label: 'Emitter resistor (Q1)', units: U_R, unitKey: 'reUnit', min: 0, max: 1e9, visible: (s) => s.topo === 'bjt-degen', help: 'In Q1’s emitter; Q2 gets R_E/N so the currents scale with N. A drop I_E·R_E of a few hundred mV makes the mirror far less sensitive to V_BE mismatch.' },
      { kind: 'number', key: 'rw', symbol: 'R_E', label: 'Widlar emitter resistor', units: U_R, unitKey: 'rwUnit', solvable: true, min: 0, max: 1e9, visible: (s) => s.topo === 'bjt-widlar', solvedWhen: (_s, r) => r.solveFor === 're', onSolve: (_s, r) => (r.solveFor = 're'), onUnsolve: (_s, r) => (r.solveFor = 'rref'), help: 'In Q2’s emitter only: V_T·ln(I_C1/I_C2) = I_E2·R_E. Solving it designs R_E and R_ref for the target I_ref and I_out.' },
    ],
  },
  {
    kind: 'section',
    title: 'Transistors',
    fields: [
      { kind: 'select', key: 'bjtPart', label: 'BJT', visible: bjt, options: Object.entries(BJT_PARTS).map(([value, p]) => ({ value, label: p ? p.label : 'Custom' })), apply: (v, s) => { if (BJT_PARTS[v]) Object.assign(s, pick(v)); }, help: 'I_S and V_A from the Fairchild/onsemi SPICE models; β = the data-sheet minimum h_FE at I_C = 1 mA (2N3904: 70, 2N3906: 80; 100 at 10 mA), a safe design value; V_CE(sat) = data-sheet maximum at 10 mA.' },
      { kind: 'number', key: 'beta', symbol: 'β', label: 'Current gain', min: 1, max: 1e5, visible: bjt },
      { kind: 'number', key: 'is', symbol: 'I_S', label: 'Saturation current', unit: 'A', min: 1e-20, max: 1e-6, visible: bjt, help: 'Sets V_BE = V_T·ln(I_C/I_S) and so the reference-branch voltage.' },
      { kind: 'number', key: 'va', symbol: 'V_A', label: 'Early voltage', unit: 'V', min: 1, max: 1e5, visible: bjt, help: 'Output resistance r_o = (V_A + V_CE)/I_C.' },
      { kind: 'number', key: 'vcesat', symbol: 'V_CE,sat', label: 'Saturation voltage', unit: 'V', min: 0, max: 2, visible: bjt },
      { kind: 'select', key: 'mosPart', label: 'MOSFET process', visible: mos, options: Object.entries(MOS_PARTS).map(([value, p]) => ({ value, label: p ? p.label : 'Custom' })), apply: (v, s) => { const p = MOS_PARTS[v]; if (p) Object.assign(s, { kp: p.kp, wl: p.wl, vt: p.vt, lambda: p.lambda }); } },
      { kind: 'number', key: 'kp', symbol: 'k′', label: 'Process transconductance', unit: 'A/V²', min: 1e-9, max: 10, visible: mos, help: 'µ·C_ox; I_D = ½k′(W/L)(V_GS − V_t)²(1 + λV_DS).' },
      { kind: 'number', key: 'wl', symbol: 'W/L', label: 'Aspect ratio (Q1)', min: 1e-3, max: 1e6, visible: mos },
      { kind: 'number', key: 'vt', symbol: 'V_t', label: 'Threshold voltage', unit: 'V', min: 0, max: 10, visible: mos },
      { kind: 'number', key: 'lambda', symbol: 'λ', label: 'Channel-length modulation', suffix: 'V⁻¹', min: 0, max: 2, visible: mos, help: 'λ = 1/V_A; r_o ≈ 1/(λ·I_D). Scales roughly as 1/L.' },
      { kind: 'number', key: 'temp', symbol: 'T', label: 'Temperature', suffix: '°C', min: -55, max: 200, visible: bjt, help: 'Sets V_T = kT/q (I_S is taken as given at this temperature).' },
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E96'] },
    ],
  },
];

function pick(k: string) {
  const p = BJT_PARTS[k]!;
  return { bjtPart: k, beta: p.beta, is: p.is, va: p.va, vcesat: p.vcesat };
}

/** A preset stays selected only while its numbers are unchanged. */
function sync(s: MirrorState): void {
  const b = BJT_PARTS[s.bjtPart];
  if (b && (s.beta !== b.beta || s.is !== b.is || s.va !== b.va || s.vcesat !== b.vcesat)) s.bjtPart = 'custom';
  const m = MOS_PARTS[s.mosPart];
  if (m && (s.kp !== m.kp || s.wl !== m.wl || s.vt !== m.vt || s.lambda !== m.lambda)) s.mosPart = 'custom';
}

const fI = (i: number, d = 4) => si(i, 'A', d);
const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fV = (v: number, d = 4) => si(v, 'V', d);

function num(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: MirrorState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

export function modelIn(s: MirrorState): MirrorIn {
  const vo = s.polarity === 'sink' ? s.vout : s.vcc - s.vout;
  return {
    topo: s.topo,
    bjt: { is: s.is, beta: s.beta, va: s.va, vt: thermalVoltage(s.temp) },
    mos: { kp: s.kp, wl: s.wl, vt: s.vt, lambda: s.lambda },
    n: s.topo === 'bjt-wilson' ? 1 : s.n,
    re: s.topo === 'bjt-widlar' ? s.rw : s.topo === 'bjt-degen' ? s.re : 0,
    vo,
    vcesat: s.vcesat,
  };
}

function fail(s: MirrorState, msg: string): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

// Mode-switch harness: its remaining "error-after-edit" flags are typed numbers that make the answer impossible
// (a supply that cannot drive the reference branch, a Widlar target above the R_E = 0 current, a solved resistor or
// current outside its input's range); those are meant to be red. Topology and polarity switches never produce one.
function run(st: MirrorState): CalcReport {
  const s: MirrorState = { ...st };
  if (s.solveFor === 're' && s.topo !== 'bjt-widlar') s.solveFor = 'rref';
  num('V_CC', s.vcc);
  num('V_out', s.vout);
  if (!(s.vcc > 0)) throw new Error('V_CC must be > 0.');
  if (s.topo !== 'bjt-wilson' && !(num('N', s.n) > 0)) throw new Error('Mirror ratio must be > 0.');
  if (isBjt(s.topo)) {
    for (const [k, nm] of [['beta', 'β'], ['is', 'I_S'], ['va', 'V_A'], ['vcesat', 'V_CE,sat'], ['temp', 'Temperature']] as const) num(nm, s[k]);
    if (!(s.beta > 0 && s.is > 0 && s.va > 0 && s.vcesat >= 0)) throw new Error('β, I_S and V_A must be > 0.');
    if (s.topo === 'bjt-degen' && !(num('R_E', s.re) >= 0)) throw new Error('R_E must be ≥ 0.');
    if (s.topo === 'bjt-widlar' && s.solveFor !== 're' && !(num('R_E', s.rw) >= 0)) throw new Error('R_E must be ≥ 0.');
  } else {
    for (const [k, nm] of [['kp', 'k′'], ['wl', 'W/L'], ['vt', 'V_t'], ['lambda', 'λ']] as const) num(nm, s[k]);
    if (!(s.kp > 0 && s.wl > 0 && s.vt >= 0 && s.lambda >= 0)) throw new Error('k′ and W/L must be > 0, V_t and λ ≥ 0.');
  }
  const mi = modelIn(s);
  const vRail = s.vcc; // R_ref spans the supply

  // ── solve
  if (s.solveFor === 'iref') {
    if (!(num('R_ref', s.rref) > 0)) throw new Error('R_ref must be > 0.');
    const ir = irefFromR(mi, vRail, s.rref);
    if (ir == null) return fail(s, `V_CC = ${fV(s.vcc)} is too low to turn on the reference branch through ${fR(s.rref, 3)}.`);
    s.iref = ir;
  } else {
    if (!(num('I_ref', s.iref) > 0)) throw new Error('I_ref must be > 0.');
    if (s.solveFor === 're') {
      const target = num('I_out', s.iout);
      if (!(target > 0)) throw new Error('Target I_out must be > 0.');
      const at = (rw: number) => atIref({ ...mi, re: rw }, s.iref).iout;
      const i0 = at(0);
      if (target >= i0) return fail(s, `With R_E = 0 the output is ${fI(i0, 3)}; a Widlar resistor can only lower it. Raise N or I_ref for ${fI(target, 3)}.`);
      // I_out falls monotonically with R_E: bracket on a log scale
      const g = (l: number) => Math.log(at(Math.exp(l)) / target);
      const hi = Math.log(1e9);
      if (g(hi) > 0) return fail(s, `Even R_E = 1 GΩ leaves ${fI(at(1e9), 3)}: the target is too small for this I_ref.`);
      let lo = Math.log(1e-6);
      if (g(lo) < 0) lo = Math.log(1e-12);
      s.rw = Math.exp(brent(g, lo, hi, 1e-14));
      mi.re = s.rw;
    }
    const chk = atIref(mi, s.iref);
    if (!Number.isFinite(chk.vRef) || !Number.isFinite(chk.iout)) return fail(s, 'These device parameters give no valid operating point (check I_S against I_ref, and V_A).');
    const r = rrefFor(mi, vRail, s.iref);
    if (r == null) return fail(s, `V_CC = ${fV(s.vcc)} cannot drive ${fI(s.iref, 3)}: the reference branch alone needs ${fV(atIref(mi, s.iref).vRef, 3)}. Raise V_CC or lower I_ref.`);
    s.rref = r;
  }
  const p = atIref(mi, s.iref);
  if (!Number.isFinite(p.iout) || !(p.iout > 0)) return fail(s, 'These device parameters give no valid operating point (check I_S against I_ref, and V_A).');
  s.iout = p.iout;
  const ideal = mi.n * s.iref;
  const err = p.iout / ideal - 1;
  const ro = rOut(mi, s.iref);
  const vMinAbs = s.polarity === 'sink' ? p.vMin : s.vcc - p.vMin;
  const headroom = mi.vo - p.vMin;

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const res: ResultItem[] = [];
  const solved = s.solveFor;
  if (solved === 're') res.push(item('rw', 'Widlar emitter resistor', s.rw, 'Ω', fR(s.rw), { symbol: 'R_E', solved: true, primary: true, note: `I_E2·R_E = ${fV((p.ie2 ?? 0) * s.rw, 3)}` }));
  if (solved === 'rref' || solved === 're') res.push(item('rref', 'Reference resistor', s.rref, 'Ω', fR(s.rref), { symbol: 'R_ref', solved: true, primary: true, note: `(V_CC − ${fV(p.vRef, 3)}) / I_ref` }));
  if (solved === 'iref') res.push(item('iref', 'Reference current', s.iref, 'A', fI(s.iref), { symbol: 'I_ref', solved: true, primary: true, note: `${fV(p.vRef, 3)} across the reference transistor${s.topo === 'mos-cascode' || s.topo === 'bjt-wilson' ? 's' : ''}` }));
  const atLim = headroom < 0 ? ' (at V_out,lim)' : '';
  const limTone = headroom < 0 ? 'fail' : '';
  res.push(item('iout', `Output current${atLim}`, p.iout, 'A', fI(p.iout), { symbol: 'I_out', solved: solved !== 're', primary: true, note: headroom < 0 ? 'output saturated: the real current is lower' : s.topo === 'bjt-widlar' ? `I_ref/I_out = ${+(s.iref / p.iout).toPrecision(4)}` : `ideal N·I_ref = ${fI(ideal, 3)}`, tone: limTone }));
  if (s.topo !== 'bjt-widlar') res.push(item('err', `Output error${atLim}`, err, '', `${err >= 0 ? '+' : '−'}${Math.abs(err * 100).toFixed(3)} %`, { symbol: 'ΔI/I', primary: true, note: 'vs N·I_ref (β, Early)', tone: limTone || (Math.abs(err) > 0.05 ? 'warn' : '') }));
  res.push(item('rout', `Output resistance${atLim}`, Number.isFinite(ro) ? ro : null, 'Ω', Number.isFinite(ro) ? fR(ro, 3) : '∞ (no Early effect)', { symbol: 'R_out', primary: true, note: rOutNote(s), tone: limTone }));
  const gO = 'Output';
  res.push(
    item('compliance', 'Compliance (output limit)', vMinAbs, 'V', `${s.polarity === 'sink' ? '≥' : '≤'} ${fV(vMinAbs, 3)}`, { symbol: 'V_out,lim', group: gO, note: complianceNote(s.topo), tone: headroom < 0 ? 'fail' : '' }),
    item('headroom', 'Headroom above compliance', headroom, 'V', fV(headroom, 3), { group: gO, tone: headroom < 0 ? 'fail' : headroom < 0.1 ? 'warn' : '' }),
    item('dIdV', 'Output change per volt', Number.isFinite(ro) ? 1 / ro : 0, 'A/V', Number.isFinite(ro) ? `${fI(1 / ro, 3)}/V (${((1 / ro / p.iout) * 100).toPrecision(3)} %/V)` : '0', { group: gO }),
    item('pOut', 'Output transistor dissipation', p.iout * Math.max(mi.vo, 0), 'W', si(p.iout * Math.max(mi.vo, 0), 'W', 3), { group: gO, note: 'I_out × V (from the rail)' }),
  );
  const gR = 'Reference branch';
  res.push(
    item('vRef', 'Reference-branch voltage', p.vRef, 'V', fV(p.vRef), { symbol: isBjt(s.topo) ? 'V_BE…' : 'V_GS…', group: gR, note: refNote(s.topo) }),
    item('pRef', 'Power from the supply (reference)', s.iref * s.vcc, 'W', si(s.iref * s.vcc, 'W', 3), { group: gR }),
    item('pR', 'Power in R_ref', s.iref * s.iref * s.rref, 'W', si(s.iref * s.iref * s.rref, 'W', 3), { group: gR }),
  );
  if (solved === 'iref') res.push(item('irefChk', 'Reference current', s.iref, 'A', fI(s.iref), { group: gR }));
  const gT = 'Transistors';
  if (isBjt(s.topo)) {
    res.push(item('vt', 'Thermal voltage', mi.bjt.vt, 'V', fV(mi.bjt.vt), { symbol: 'V_T', group: gT, note: `kT/q at ${s.temp} °C` }));
    res.push(item('vbe1', s.topo === 'bjt-wilson' ? 'V_BE of Q1/Q2' : 'V_BE of Q1', p.vbe1!, 'V', fV(p.vbe1!), { group: gT }));
    res.push(item('vbe2', s.topo === 'bjt-wilson' ? 'V_BE of Q3' : 'V_BE of Q2', p.vbe2!, 'V', fV(p.vbe2!), { group: gT }));
    const gm = p.iout / mi.bjt.vt;
    res.push(item('gm', 'g_m of the output transistor', gm, 'S', si(gm, 'S', 3), { group: gT }), item('ro', 'r_o of the output transistor', (s.va + Math.max(mi.vo, 0)) / p.iout, 'Ω', fR((s.va + Math.max(mi.vo, 0)) / p.iout, 3), { group: gT, note: '(V_A + V_CE)/I_C' }));
  } else {
    res.push(item('vgs', 'V_GS', p.vgs!, 'V', fV(p.vgs!), { group: gT }), item('vov', 'Overdrive', p.vov!, 'V', fV(p.vov!), { symbol: 'V_OV', group: gT, note: 'V_GS − V_t' }));
    if (p.vx != null) res.push(item('vx', 'Drain of the bottom output device', p.vx, 'V', fV(p.vx), { group: gT, note: 'held near V_GS by the cascode' }));
    if (s.lambda > 0) res.push(item('ro', 'r_o of the output device', 1 / (s.lambda * p.iout), 'Ω', fR(1 / (s.lambda * p.iout), 3), { group: gT, note: '1/(λ·I_D)' }));
  }
  // standard values for the solved resistors
  const gE = `Standard parts (${s.eseries})`;
  if (solved === 'rref' || solved === 're') {
    for (const r of [...new Set(bracketE(s.eseries, s.rref))]) {
      const ir = irefFromR(mi, vRail, r);
      if (ir != null) res.push(item(`rref_${r}`, `R_ref = ${fR(r, 3)}`, atIref(mi, ir).iout, 'A', `I_ref ${fI(ir, 4)} → I_out ${fI(atIref(mi, ir).iout, 4)}`, { group: gE }));
    }
  }
  if (solved === 're') {
    for (const r of [...new Set(bracketE(s.eseries, s.rw))]) {
      const io = atIref({ ...mi, re: r }, s.iref).iout;
      res.push(item(`rw_${r}`, `R_E = ${fR(r, 3)}`, io, 'A', `I_out ${fI(io, 4)} (${io >= st.iout ? '+' : '−'}${Math.abs((io / st.iout - 1) * 100).toFixed(2)} %)`, { group: gE, note: 'at the target I_ref' }));
    }
  }
  report.results = res;

  // ── warnings & notes
  if (headroom < 0) warnings.push(`The output at ${fV(s.vout, 3)} is past the compliance limit (${s.polarity === 'sink' ? 'needs ≥' : 'needs ≤'} ${fV(vMinAbs, 3)}): the output ${isBjt(s.topo) ? 'transistor saturates' : 'device leaves saturation'} and the current collapses. The figures shown are for the output at the limit; the real current is lower. Move V_out or lower the current.`);
  else if (headroom < 0.1) notes.push(`Only ${fV(headroom, 3)} above compliance: the output current starts to fall earlier than the ideal knee in practice.`);
  if (Math.abs(err) > 0.05 && s.topo !== 'bjt-widlar') warnings.push(`I_out is ${(err * 100).toFixed(1)} % off N·I_ref, from ${isBjt(s.topo) ? 'base currents and ' : ''}the different V_${isBjt(s.topo) ? 'CE' : 'DS'} of the input and output devices (Early effect)${isBjt(s.topo) && s.topo !== 'bjt-wilson' && mi.n > 1 ? `; with N = ${+mi.n.toPrecision(3)} the reference also supplies N + 1 base currents` : ''}. ${isBjt(s.topo) ? 'Use a Wilson or cascode mirror, a higher-β part, or a buffer transistor for the base current; keep V_out near the reference-branch voltage.' : 'Match V_DS of the two devices (cascode) or lengthen L to lower λ.'}`);
  if (isBjt(s.topo)) {
    if (s.bjtPart !== 'custom' && (s.topo === 'bjt-basic' || s.topo === 'bjt-wilson')) warnings.push(`Discrete transistors are not matched: every 1 mV of V_BE difference changes I_out by about ${((Math.exp(1e-3 / mi.bjt.vt) - 1) * 100).toFixed(0)} %, and the two run at different temperatures. Use a matched pair in one package, or emitter degeneration (a few hundred mV across R_E).`);
    if (s.topo === 'bjt-degen' && (p.ie2 ?? 0) * (s.re / mi.n) < 2 * mi.bjt.vt) notes.push(`I_E·R_E is only ${fV((p.ie2 ?? 0) * (s.re / mi.n), 3)} (< 2·V_T): too little degeneration to swamp V_BE mismatch; aim for 0.1–0.5 V.`);
    const pd = p.iout * Math.max(mi.vo, 0);
    if (pd > 0.3) warnings.push(`The output transistor dissipates ${si(pd, 'W', 3)}: near the 625 mW rating of a TO-92 2N3904/2N3906 at 25 °C, and it heats Q2 relative to Q1, so the current drifts (≈ −2 mV/°C on V_BE). Lower V_out or the current, or use a power part on a heatsink.`);
    if (s.iref > 50e-3) notes.push('Above a few tens of mA the β and V_BE of small-signal transistors fall off (high injection), which this model leaves out.');
  } else {
    if ((p.vov ?? 1) < 0.1) notes.push(`Overdrive ${fV(p.vov!, 3)}: the device is near weak inversion, where the square law overstates the current. Treat the numbers as rough.`);
    notes.push('Body effect on the cascode devices (raising their V_t) and V_t / k′ mismatch are not modelled.');
  }
  if (s.solveFor !== 'iref' && s.rref < 100) notes.push(`R_ref = ${fR(s.rref, 3)} is small: supply variations move I_ref almost one-for-one.`);
  notes.push(`Supply sensitivity: I_ref ≈ (V_CC − ${fV(p.vRef, 3)})/R_ref, so a 10 % change in V_CC changes I_ref by about ${((0.1 * s.vcc) / (s.vcc - p.vRef) * 100).toFixed(0)} %.`);

  report.summary = `${TOPO_LABEL[s.topo]} · ${s.polarity} · I_ref ${fI(s.iref, 3)} → I_out ${fI(p.iout, 3)} · R_out ${Number.isFinite(ro) ? fR(ro, 3) : '∞'}`;
  report.details = { ...p, ro, err, ideal, headroom, vMinAbs, state: s };
  report.graphs = [outGraph(s, mi, p, vMinAbs), transferGraph(s, mi)];
  return report;
}

function complianceNote(t: Topo): string {
  return { 'bjt-basic': 'V_CE,sat', 'bjt-degen': 'V_CE,sat + I_E2·R_E/N', 'bjt-widlar': 'V_CE,sat + I_E2·R_E', 'bjt-wilson': 'V_BE + V_CE,sat', 'mos-simple': 'V_OV', 'mos-cascode': 'V_GS + V_OV = V_t + 2V_OV' }[t];
}
function refNote(t: Topo): string {
  return { 'bjt-basic': 'V_BE1', 'bjt-degen': 'V_BE1 + I_E1·R_E', 'bjt-widlar': 'V_BE1', 'bjt-wilson': 'V_BE1 + V_BE3', 'mos-simple': 'V_GS1', 'mos-cascode': '2·V_GS' }[t];
}
function rOutNote(s: MirrorState): string {
  if (s.topo === 'bjt-wilson') return '≈ β·r_o/2';
  if (s.topo === 'bjt-degen' || s.topo === 'bjt-widlar') return '≈ r_o·[1 + g_m(R_E ∥ r_π)]';
  if (s.topo === 'mos-cascode') return '≈ g_m·r_o²';
  return isBjt(s.topo) ? '≈ r_o = (V_A + V_CE)/I_C' : '≈ 1/(λ·I_D)';
}

function outGraph(s: MirrorState, mi: MirrorIn, p: MirrorPoint, vMinAbs: number): GraphSpec {
  // from the compliance limit to past the operating point / supply, in absolute output voltage
  const sink = s.polarity === 'sink';
  const far = sink ? Math.max(s.vcc, s.vout) * 1.05 + 0.1 : Math.min(0, s.vout) - 0.05 * s.vcc - 0.1;
  const xs = Array.from({ length: 121 }, (_, i) => vMinAbs + ((far - vMinAbs) * i) / 120);
  const ys = xs.map((v) => atIref(mi, s.iref, sink ? v : s.vcc - v).iout).map((y) => (Number.isFinite(y) ? y : 0));
  if (!sink) {
    xs.reverse();
    ys.reverse();
  }
  const outside = sink ? s.vout < vMinAbs : s.vout > vMinAbs;
  const pad = 0.03 * Math.abs(xs[xs.length - 1] - xs[0]);
  return {
    id: 'iout-vs-vout',
    title: 'Output characteristic',
    subtitle: `I_ref = ${fI(s.iref, 3)}; drawn from the compliance limit (below it the output saturates)`,
    x: { label: 'Output node voltage V_out', unit: 'V' },
    y: [{ id: 'i', label: 'Output current', unit: 'A', includeZero: true }],
    series: [
      { label: 'I_out', x: xs, y: ys, axis: 'i', width: 2.2 },
      ...(s.topo !== 'bjt-widlar' ? [{ label: 'N·I_ref', x: [xs[0], xs[xs.length - 1]], y: [mi.n * s.iref, mi.n * s.iref], axis: 'i', color: '#9a8f7a', width: 1, dash: [3, 3] }] : []),
    ],
    // past compliance the operating point is off the drawn curve: widen the axis to show where V_out is
    ...(outside ? { xRange: [Math.min(s.vout, xs[0], xs[xs.length - 1]) - pad, Math.max(s.vout, xs[0], xs[xs.length - 1]) + pad] as [number, number] } : {}),
    vlines: [
      { value: vMinAbs, label: `limit ${fV(vMinAbs, 3)}`, color: '#8b1e1e', dash: [4, 4] },
      ...(outside ? [{ value: s.vout, label: `V_out ${fV(s.vout, 3)} (saturated)`, color: '#8b1e1e', dash: [4, 4], width: 1.4 }] : []),
    ],
    markers: outside ? [] : [{ x: s.vout, y: p.iout, axis: 'i', label: fI(p.iout, 3) }],
  };
}

function transferGraph(s: MirrorState, mi: MirrorIn): GraphSpec {
  // points where the model has no operating point (supply too low, far past compliance) are left out
  const all = Array.from({ length: 121 }, (_, i) => s.iref * 100 ** (2 * (i / 120) - 1));
  const iouts = all.map((ir) => atIref(mi, ir).iout);
  const keep = all.map((_, i) => i).filter((i) => Number.isFinite(iouts[i]) && iouts[i] > 0);
  const xs = keep.map((i) => all[i]);
  const pts = keep.map((i) => iouts[i]);
  return {
    id: 'iout-vs-iref',
    title: 'Output vs reference current',
    subtitle: s.topo === 'bjt-widlar' ? `R_E = ${fR(s.rw, 3)} held: the Widlar output grows only logarithmically` : 'Other parts held; dashed: ideal N·I_ref',
    x: { label: 'Reference current I_ref', unit: 'A', log: true },
    y: [{ id: 'i', label: 'Output current', unit: 'A', log: true }],
    series: [
      { label: 'I_out', x: xs, y: pts, axis: 'i', width: 2.2 },
      { label: 'N·I_ref', x: xs, y: xs.map((x) => mi.n * x), axis: 'i', color: '#9a8f7a', width: 1, dash: [3, 3] },
    ],
    markers: [{ x: s.iref, y: atIref(mi, s.iref).iout, axis: 'i', label: fI(atIref(mi, s.iref).iout, 3) }],
  };
}

export const def: CalcDef<MirrorState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Large-signal device laws (BJT: I_C = I_S·e^{V_BE/V_T}(1 + V_CE/V_A), I_B = I_C0/β; MOSFET square law with λ) solved exactly with KCL for the basic, degenerated, Widlar (transcendental V_T·ln(I_C1/I_C2) = I_E2·R_E) and Wilson BJT mirrors and the simple and cascode MOSFET mirrors (Gray, Hurst, Lewis & Meyer 5e ch. 4; Sedra & Smith 7e ch. 8; Razavi 2e ch. 5); R_ref, I_ref and the Widlar R_E by root finding on the same model; R_out by differentiating it.',
  fields,
  defaults,
  sync,
  solve: {
    default: 'rref',
    analysis: 'iref',
    options: [
      { key: 'iref', label: 'Currents from R_ref (analysis)' },
      { key: 'rref', label: 'R_ref for a target I_ref' },
      { key: 're', label: 'Widlar: R_E and R_ref for target I_ref and I_out' },
    ],
  },
  compute,
  examples: [
    { id: 'basic-1ma', label: '2N3904 mirror, 1 mA from 5 V (solve R_ref)', state: defaults() },
    { id: 'widlar-10ua', label: 'Widlar: 1 mA reference → 10 µA output (solve R_E, R_ref)', state: { ...defaults(), topo: 'bjt-widlar', solveFor: 're', iref: 1e-3, iout: 10e-6, ioutUnit: 'µA', n: 1, vcc: 5, vout: 2.5 } },
    { id: 'wilson-pnp', label: 'Wilson PNP source (2N3906), 47 kΩ from 12 V', state: { ...defaults(), topo: 'bjt-wilson', polarity: 'source', ...pick('q2n3906'), solveFor: 'iref', vcc: 12, vout: 6, rref: 47e3 } },
    { id: 'degen-x2', label: '1:2 mirror with 1 kΩ / 500 Ω degeneration, 500 µA', state: { ...defaults(), topo: 'bjt-degen', n: 2, re: 1e3, solveFor: 'rref', iref: 500e-6, irefUnit: 'µA', ioutUnit: 'µA', vcc: 12, vout: 6 } },
    { id: 'sedra-8-1', label: 'Sedra & Smith Ex. 8.1: NMOS mirror, 100 µA from 3 V', state: { ...defaults(), topo: 'mos-simple', mosPart: 'sedra', kp: 200e-6, wl: 10, vt: 0.7, lambda: 0.05, solveFor: 'rref', vcc: 3, iref: 100e-6, irefUnit: 'µA', ioutUnit: 'µA', n: 1, vout: 1.5 } },
    { id: 'cascode-headroom', label: 'Edge case: NMOS cascode with only 1 V at the output', state: { ...defaults(), topo: 'mos-cascode', mosPart: 'sedra', kp: 200e-6, wl: 10, vt: 0.7, lambda: 0.05, solveFor: 'rref', vcc: 3, iref: 100e-6, irefUnit: 'µA', ioutUnit: 'µA', n: 1, vout: 1 } },
  ],
};
