/** Power factor and capacitor correction — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, withDefault } from '@/core/unitsets';
import { type BankConn, type Correction, type Load, type LoadBy, type Phase, type Side, cFor, correct, loadFrom, qcFor } from './model';

export type PfSolve = 'c' | 'pfTarget';

export interface PfState {
  solveFor: PfSolve;
  phase: Phase;
  v: number;
  f: number;
  loadBy: LoadBy;
  p: number;
  s: number;
  i: number;
  pfd: number;
  loadSide: Side;
  thdPct: number;
  pfTarget: number;
  targetSide: Side;
  c: number;
  cUnit: string;
  conn: BankConn;
  ssc: number;
}

export const defaults = (): PfState => ({
  solveFor: 'c',
  phase: 'single',
  v: 230,
  f: 50,
  loadBy: 's',
  p: 800,
  s: 1000,
  i: 1000 / 230,
  pfd: 0.8,
  loadSide: 'lag',
  thdPct: 0,
  pfTarget: 0.95,
  targetSide: 'lag',
  c: 20e-6,
  cUnit: 'µF',
  conn: 'delta',
  ssc: 0,
});

const U_CAP_U = withDefault(U_CAP, 'µF');
const SIDE_OPTS = [
  { value: 'lag', label: 'Lagging (inductive)' },
  { value: 'lead', label: 'Leading (capacitive)' },
];

/** P, S and I are three forms of the same load: the two not chosen are computed (green) and written back. */
const loadField = (key: LoadBy, symbol: string, label: string, unit: string, other: LoadBy, help: string): FieldSpec => ({
  kind: 'number',
  key,
  symbol,
  label,
  unit,
  // Wide limits: the two computed forms must fit (I = S/(√3·V) spans V = 1 V … 1 MV, THD up to 500 %).
  // Harness note: typing the min or max of the *given* form can still push a computed form past these
  // limits (OUT OF RANGE, error-after-edit) — legitimate for typed numbers 30+ decades from any real load.
  min: 1e-40,
  max: 1e40,
  solvable: true,
  solvedWhen: (_s, root) => root.loadBy !== key,
  onSolve: (_s, root) => (root.loadBy = other),
  onUnsolve: (_s, root) => (root.loadBy = key),
  help,
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Supply',
    fields: [
      { kind: 'select', key: 'phase', label: 'System', options: [{ value: 'single', label: 'Single-phase' }, { value: 'three', label: 'Three-phase, balanced' }] },
      { kind: 'number', key: 'v', symbol: 'V', label: 'Voltage (rms)', unit: 'V', min: 1, max: 1e6, help: 'Single-phase: the supply voltage. Three-phase: the line-to-line voltage V_L.' },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', unit: 'Hz', min: 1, max: 10e3, help: '50 or 60 Hz mains; 400 Hz aircraft supplies.' },
    ],
  },
  {
    kind: 'section',
    title: 'Load',
    fields: [
      { kind: 'select', key: 'loadBy', label: 'Load given as', options: [{ value: 'p', label: 'Real power P' }, { value: 's', label: 'Apparent power S' }, { value: 'i', label: 'Line current I' }] },
      loadField('p', 'P', 'Real power', 'W', 's', 'Active power drawn by the load (total of three phases).'),
      loadField('s', 'S', 'Apparent power', 'VA', 'p', 'Total apparent power V·I (×√3 for three-phase), including the distortion power when THD > 0.'),
      loadField('i', 'I', 'Line current (rms)', 'A', 'p', 'True rms line current, fundamental plus harmonics.'),
      { kind: 'number', key: 'pfd', symbol: 'cos θ_1', label: 'Displacement PF', min: 0.01, max: 1, help: 'cos θ₁: the cosine of the angle between the fundamental voltage and current. Equals the power factor for a sinusoidal current (THD = 0). This is what a capacitor corrects.' },
      { kind: 'select', key: 'loadSide', label: 'Load PF is', options: SIDE_OPTS, visible: (s) => s.pfd < 1 },
      { kind: 'number', key: 'thdPct', symbol: 'THD_I', label: 'Current THD', suffix: '%', min: 0, max: 500, help: 'Total harmonic distortion of the load current, I_H/I₁. 0 for a linear load (motor, ballast); 80–150 % for a rectifier with a capacitor input and no PFC.' },
    ],
  },
  {
    kind: 'section',
    title: 'Correction capacitor',
    fields: [
      // min 0: an analysis of a huge overcorrection can approach 0; typing 0 while solving C is a typed error.
      { kind: 'number', key: 'pfTarget', symbol: 'cos θ_2', label: 'Target PF', min: 0, max: 1, solvable: true, help: 'Displacement PF after correction. 0.95 lagging is the usual utility target; correcting to exactly 1 costs disproportionately more capacitance and risks leading PF at light load.' },
      { kind: 'select', key: 'targetSide', label: 'Target PF is', options: SIDE_OPTS, visible: (s) => s.solveFor === 'c' && s.pfTarget < 1 },
      { kind: 'number', key: 'c', symbol: 'C', label: 'Capacitance (each)', units: U_CAP_U, unitKey: 'cUnit', min: 0, max: 1, solvable: true, help: 'Capacitance of each unit: one capacitor for single-phase, each of the three for a three-phase bank.' },
      { kind: 'select', key: 'conn', label: 'Bank connection', options: [{ value: 'delta', label: 'Delta (each C across V_L)' }, { value: 'wye', label: 'Wye (each C across V_L/√3)' }], visible: (s) => s.phase === 'three' },
      { kind: 'number', key: 'ssc', symbol: 'S_sc', label: 'Supply fault level', unit: 'VA', min: 0, max: 1e12, zeroHint: 'skip', help: 'Short-circuit apparent power at the bank (from the utility or the transformer: S_rated/Z_pu). Used for the parallel-resonance check h_r = √(S_sc/Q_C). 0 = skip.' },
    ],
  },
];

const RANGE_C = { lo: 0, hi: 1 };
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;
const degText = (rad: number) => `${((rad * 180) / Math.PI).toFixed(2).replace('-', '−')}°`;
const pfText = (pf: number, side: string) => `${pf.toFixed(3)}${side === 'unity' ? '' : side === 'lag' ? ' lagging' : ' leading'}`;

/** The load described by the state (from the chosen form P / S / I). */
export function loadOf(s: PfState): Load {
  const val = s.loadBy === 'p' ? s.p : s.loadBy === 's' ? s.s : s.i;
  return loadFrom(s.loadBy, val, s.pfd, s.pfd >= 1 ? 'lag' : s.loadSide, s.thdPct / 100, s.v, s.phase);
}

function validate(st: PfState) {
  const num = ['v', 'f', 'p', 's', 'i', 'pfd', 'thdPct', 'pfTarget', 'c', 'ssc'] as const;
  for (const k of num) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!(st.v > 0)) throw new Error('Voltage must be > 0.');
  if (!(st.f > 0)) throw new Error('Frequency must be > 0.');
  const given = st.loadBy === 'p' ? st.p : st.loadBy === 's' ? st.s : st.i;
  if (!(given > 0)) throw new Error(`${st.loadBy === 'p' ? 'Real power' : st.loadBy === 's' ? 'Apparent power' : 'Line current'} must be > 0.`);
  if (!(st.pfd > 0 && st.pfd <= 1)) throw new Error('Displacement PF must be in (0, 1].');
  if (st.thdPct < 0) throw new Error('THD must be ≥ 0.');
  if (st.solveFor === 'c' && !(st.pfTarget > 0 && st.pfTarget <= 1)) throw new Error('Target PF must be in (0, 1].');
  if (st.solveFor === 'pfTarget' && !(st.c >= 0)) throw new Error('Capacitance must be ≥ 0.');
  if (st.ssc < 0) throw new Error('Fault level must be ≥ 0 (0 = skip).');
}

export function compute(st: PfState): CalcReport {
  validate(st);
  const s: PfState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'power/power-factor', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const load = loadOf(s);
  const conn: BankConn = s.phase === 'three' ? s.conn : 'delta';

  // ── solve. Q_C = Q₁ − P·tan θ₂ and C = Q_C/(k·ω·V²) invert the forward model exactly (both linear in C),
  // so no numeric root finding is needed: C fed back reproduces the target PF to rounding.
  // Harness note (roundtrip, legitimate): when no capacitor can reach the target (load already better, or
  // leading) C is clamped to 0 with a note, so analysing that state returns the load's own PF, not the
  // typed target. Likewise at P ≫ Q_C (e.g. P = 1e23 W) Q₁ − P·tan θ₂ loses Q_C to rounding.
  let qcNeed = 0;
  if (s.solveFor === 'c') {
    const sideT: Side = s.pfTarget >= 1 ? 'lag' : s.targetSide;
    qcNeed = qcFor(load, s.pfTarget, sideT);
    const c = qcNeed > 0 ? cFor(qcNeed, s.v, s.f, s.phase, conn) : 0;
    if (c > RANGE_C.hi) {
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      warnings.push(`This correction needs C = ${si(c, 'F', 3)} per unit, above 1 F. Check the voltage and power, or use a higher-voltage bank (C scales with 1/V²).`);
      report.results.push({ key: 'c', label: 'Capacitance (each)', value: null, display: '—', primary: true, solved: true });
      return report;
    }
    s.c = c;
  }

  const o = correct(load, s.v, s.f, s.c, s.phase, conn, s.ssc);
  const b = o.before;
  const a = o.after;
  if (s.solveFor === 'pfTarget') s.pfTarget = a.pfd;
  const cUnity = load.q1 > 0 ? cFor(load.q1, s.v, s.f, s.phase, conn) : 0;

  // ── checks
  if (s.solveFor === 'c' && qcNeed <= 0) {
    if (load.q1 < 0) warnings.push(`The load is already leading (${pfText(b.pfd, b.side)}): a capacitor only makes it worse, so C = 0. Correct a leading load with a shunt reactor absorbing ${si(-qcNeed, 'var', 3)}.`);
    else notes.push(`The load’s displacement PF ${pfText(b.pfd, b.side)} already meets the target, so C = 0.`);
  }
  // not when the user asked for a leading target (review 2026-11-26)
  const leadAsked = s.solveFor === 'c' && s.targetSide === 'lead' && s.pfTarget < 1;
  if (a.side === 'lead' && o.qc > 0 && !leadAsked)
    warnings.push(`Overcorrected: ${si(o.qc, 'var', 3)} of capacitors exceeds the load’s ${si(load.q1 > 0 ? load.q1 : 0, 'var', 3)}, so the PF is now ${pfText(a.pfd, 'lead')}. A leading PF raises the voltage at light load and is penalised like a lagging one; keep C below ${si(cUnity, 'F', 3)} (unity) or switch the bank in steps.`);
  if (load.thd > 0.05) {
    const lim = 1 / Math.sqrt(1 + load.thd * load.thd);
    const msg = `Current THD ${pct(load.thd, 0)}: even at unity displacement the true PF cannot exceed 1/√(1 + THD²) = ${lim.toFixed(3)}. A capacitor corrects only the fundamental reactive power, not the distortion power D_I = ${si(o.before.dI, 'VA', 3)}.`;
    if (load.thd > 0.3) warnings.push(`${msg} Use active PFC (or a harmonic filter) for this load; shunt capacitors on a harmonic-rich bus also need detuning reactors.`);
    else notes.push(msg);
  }
  if (o.hr != null) {
    const near = [3, 5, 7, 9, 11, 13].filter((h) => (s.phase === 'single' || h % 3 !== 0) && Math.abs(o.hr! - h) <= 0.1 * h);
    if (near.length)
      warnings.push(`Parallel resonance with the supply at h_r = √(S_sc/Q_C) = ${o.hr.toFixed(2)}, within 10 % of the ${near[0]}${near[0] === 3 ? 'rd' : 'th'} harmonic: harmonic currents from nearby loads will be amplified. Change the bank size, or add a detuning reactor (e.g. 7 %, tuned near h = 3.8).`);
    else if (o.hr < 1.5) notes.push(`h_r = ${o.hr.toFixed(2)}: the bank is very large compared with the supply fault level.`);
  }
  if (s.solveFor === 'c' && s.pfTarget >= 0.995 && qcNeed > 0) notes.push(`The last few hundredths of PF are expensive: 0.95 needs ${si(Math.max(0, cFor(qcFor(load, 0.95, 'lag'), s.v, s.f, s.phase, conn)), 'F', 3)}, 1.00 needs ${si(cUnity, 'F', 3)}.`);
  notes.push('Assumes a sinusoidal, stiff supply voltage: the bank changes only the fundamental reactive power; harmonic currents are unchanged.');

  // ── results
  const item = (key: string, label: string, value: number | string, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = report.results;
  const units = s.phase === 'single' ? '' : ` × 3 in ${conn === 'delta' ? 'Δ' : 'Y'}`;
  const cItem = item('c', 'Capacitance (each)', s.c, 'F', si(s.c, 'F', 4), { symbol: 'C', solved: s.solveFor === 'c', primary: s.solveFor === 'c', note: `${si(o.qcEach, 'var', 3)} at ${si(o.vc, 'V', 3)}${units}` });
  const pfItem = item('pfTarget', 'PF after (displacement)', a.pfd, '', pfText(a.pfd, a.side), { symbol: 'cos θ_2', solved: s.solveFor === 'pfTarget', primary: true, note: `was ${pfText(b.pfd, b.side)}` });
  if (s.solveFor === 'c') results.push(cItem, pfItem);
  else results.push(pfItem, cItem);
  results.push(
    item('qc', 'Bank reactive power', o.qc, 'var', si(o.qc, 'var', 4), { symbol: 'Q_C', primary: true, note: `C for unity PF: ${si(cUnity, 'F', 3)}` }),
    item('iAfter', 'Line current after', a.i, 'A', si(a.i, 'A', 4), { symbol: "I'", primary: true, note: `was ${si(b.i, 'A', 3)} (${a.i <= b.i ? '−' : '+'}${pct(Math.abs(1 - a.i / b.i))})` }),
  );
  if (load.thd > 0) results.push(item('pfAfter', 'True PF after', a.pf, '', a.pf.toFixed(3), { symbol: "PF'", primary: true, note: `was ${b.pf.toFixed(3)} · P/S with distortion` }));

  const g1 = 'Load (before correction)';
  results.push(
    item('p', 'Real power', b.p, 'W', si(b.p, 'W', 4), { symbol: 'P', group: g1, solved: s.loadBy !== 'p' }),
    item('q1', 'Reactive power', b.q1, 'var', si(b.q1, 'var', 4), { symbol: 'Q_1', group: g1, note: b.side === 'lead' ? 'negative: leading' : '' }),
    item('s1', 'Fundamental apparent power', b.s1, 'VA', si(b.s1, 'VA', 4), { symbol: 'S_1', group: g1 }),
    ...(load.thd > 0 ? [item('dI', 'Current distortion power', b.dI, 'VA', si(b.dI, 'VA', 4), { symbol: 'D_I', group: g1, note: 'S₁·THD_I (IEEE 1459)' })] : []),
    item('s', 'Apparent power', b.s, 'VA', si(b.s, 'VA', 4), { symbol: 'S', group: g1, solved: s.loadBy !== 's' }),
    item('i', 'Line current (rms)', b.i, 'A', si(b.i, 'A', 4), { symbol: 'I', group: g1, solved: s.loadBy !== 'i', note: load.thd > 0 ? `fundamental ${si(b.i1, 'A', 3)}, harmonics ${si(b.ih, 'A', 3)}` : '' }),
    item('theta', 'Displacement angle', (b.theta * 180) / Math.PI, '°', degText(b.theta), { symbol: 'θ_1', group: g1 }),
    item('pfBefore', 'True PF', b.pf, '', b.pf.toFixed(4), { symbol: 'PF', group: g1, note: load.thd > 0 ? `cos θ₁/√(1 + THD²) = ${b.pfd.toFixed(3)}/${Math.sqrt(1 + load.thd ** 2).toFixed(3)}` : 'equals cos θ₁ (sinusoidal current)' }),
  );
  const g2 = 'After correction';
  results.push(
    item('q1After', 'Reactive power', a.q1, 'var', si(a.q1, 'var', 4), { symbol: "Q_1'", group: g2 }),
    item('s1After', 'Fundamental apparent power', a.s1, 'VA', si(a.s1, 'VA', 4), { symbol: "S_1'", group: g2 }),
    item('sAfter', 'Apparent power', a.s, 'VA', si(a.s, 'VA', 4), { symbol: "S'", group: g2, note: `${a.s <= b.s ? '−' : '+'}${pct(Math.abs(1 - a.s / b.s))} of S` }),
    item('thetaAfter', 'Displacement angle', (a.theta * 180) / Math.PI, '°', degText(a.theta), { symbol: 'θ_2', group: g2 }),
    ...(load.thd > 0 ? [item('thdAfter', 'Current THD', a.thd * 100, '%', pct(a.thd), { symbol: "THD_I'", group: g2, note: 'same harmonics over a smaller fundamental' })] : []),
  );
  const g3 = 'Capacitor bank';
  results.push(
    item('vc', 'Voltage across each C', o.vc, 'V', si(o.vc, 'V', 4), { symbol: 'V_C', group: g3, note: 'rate ≥ 1.1 × this (IEEE 18 allows 110 % continuous)' }),
    item('ic', 'Current in each C', o.ic, 'A', si(o.ic, 'A', 4), { symbol: 'I_C', group: g3 }),
    item('qcEach', 'Reactive power each', o.qcEach, 'var', si(o.qcEach, 'var', 4), { symbol: 'Q_C,1', group: g3 }),
    ...(s.phase === 'three' ? [item('iLineBank', 'Bank line current', o.iLineBank, 'A', si(o.iLineBank, 'A', 4), { group: g3, note: conn === 'delta' ? '√3 × I_C (Δ)' : '= I_C (Y)' })] : []),
    item('cUnity', 'C for unity PF', cUnity, 'F', si(cUnity, 'F', 4), { group: g3, note: load.q1 > 0 ? 'cancels Q₁ exactly' : 'load not lagging' }),
    ...(o.hr != null ? [item('hr', 'Resonant harmonic order', o.hr, '', o.hr.toFixed(2), { symbol: 'h_r', group: g3, tone: warnings.some((w) => w.startsWith('Parallel resonance')) ? 'warn' : '', note: '√(S_sc/Q_C)' })] : []),
  );

  report.summary = `${s.phase === 'single' ? 'Single-phase' : `Three-phase ${conn === 'delta' ? 'Δ' : 'Y'} bank`} at ${si(s.v, 'V', 3)}, ${si(s.f, 'Hz', 3)} · P = ${si(b.p, 'W', 3)} · ${pfText(b.pfd, b.side)} → ${pfText(a.pfd, a.side)}`;
  report.details = { load, before: b, after: a, qc: o.qc, cUnity, conn, correction: o };
  report.graphs = graphs(s, load, o, cUnity, conn);
  return report;
}

function graphs(s: PfState, load: Load, o: Correction, cUnity: number, conn: BankConn): GraphSpec[] {
  // 1) C needed vs target PF (lagging targets), with the line current it leaves
  const x0 = Math.max(0.05, Math.min(0.7, Math.floor(o.before.pfd * 20) / 20 - 0.05));
  const n = 121;
  const pfs = Array.from({ length: n }, (_, k) => x0 + ((1 - x0) * k) / (n - 1));
  const cs = pfs.map((pf) => Math.max(0, cFor(qcFor(load, pf, 'lag'), s.v, s.f, s.phase, conn)));
  const iAfter = cs.map((c) => correct(load, s.v, s.f, c, s.phase, conn, 0).after.i);
  const markLag = o.after.side !== 'lead';
  const cVsPf: GraphSpec = {
    id: 'c-vs-pf',
    title: 'C vs target PF',
    subtitle: 'lagging targets; the capacitance climbs steeply towards unity',
    x: { label: 'Target displacement PF (lagging)', unit: '', zeroLine: false },
    y: [
      { id: 'c', label: 'Capacitance (each)', unit: 'F', includeZero: true },
      { id: 'i', label: 'Line current after', unit: 'A', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'C', x: pfs, y: cs, axis: 'c', width: 2.2 },
      { label: "I'", x: pfs, y: iAfter, axis: 'i', color: '#c47b17', width: 1.4, dash: [5, 3] },
    ],
    vlines: [{ value: o.before.side === 'lag' || o.before.side === 'unity' ? o.before.pfd : x0, label: o.before.side === 'lead' ? '' : `now ${o.before.pfd.toFixed(2)}`, color: '#9a8f7a', dash: [3, 3] }],
    markers: markLag && o.after.pfd >= x0 ? [{ x: o.after.pfd, y: s.c, axis: 'c', label: si(s.c, 'F', 3) }] : [],
  };

  // 2) Line current and true PF vs C (minimum current at unity displacement, overcorrection beyond)
  const cMax = Math.max(2 * cUnity, 1.5 * s.c, cUnity > 0 ? 0 : cFor(Math.abs(load.q1) || load.p, s.v, s.f, s.phase, conn));
  const cx = Array.from({ length: n }, (_, k) => (cMax * k) / (n - 1));
  const rows = cx.map((c) => correct(load, s.v, s.f, c, s.phase, conn, 0).after);
  const iVsC: GraphSpec = {
    id: 'i-vs-c',
    title: 'Current vs C',
    x: { label: 'Capacitance (each)', unit: 'F' },
    y: [
      { id: 'i', label: 'Line current', unit: 'A', includeZero: true },
      { id: 'pf', label: 'True PF', unit: '', side: 'right', min: 0, max: 1 },
    ],
    series: [
      { label: 'I', x: cx, y: rows.map((r) => r.i), axis: 'i', width: 2.2 },
      { label: 'PF', x: cx, y: rows.map((r) => r.pf), axis: 'pf', color: '#c47b17', width: 1.4 },
    ],
    vlines: [{ value: s.c, label: `C = ${si(s.c, 'F', 3)}` }, ...(cUnity > 0 ? [{ value: cUnity, label: 'unity', color: '#2f7d4f', dash: [3, 3] }] : [])],
    markers: [{ x: s.c, y: o.after.i, axis: 'i', label: si(o.after.i, 'A', 3) }],
  };
  return [cVsPf, iVsC];
}

export const def: CalcDef<PfState> = {
  id: 'power/power-factor',
  version: '0.1.0',
  method:
    'IEEE 1459-2010 power definitions for a sinusoidal supply: P, Q₁, S₁ = √(P² + Q₁²), distortion power D_I = S₁·THD_I, S = √(S₁² + D_I²), true PF = cos θ₁/√(1 + THD_I²). Shunt correction Q_C = Q₁ − P·tan θ₂ and C = Q_C/(k·ω·V²) (k = 1 single-phase or Y bank on V_L, 3 for a Δ bank), as in Alexander & Sadiku; parallel resonance h_r = √(S_sc/Q_C) per IEEE 1531.',
  fields,
  defaults,
  solve: {
    default: 'c',
    analysis: 'pfTarget',
    options: [
      { key: 'c', label: 'Capacitor for a target PF' },
      { key: 'pfTarget', label: 'PF and current with a given capacitor (analysis)' },
    ],
  },
  sync: (s) => {
    // In analysis the achieved PF may be leading: keep the side select in step so ◎ C solves for the same point.
    if (s.solveFor !== 'pfTarget') return;
    try {
      const load = loadOf(s);
      const conn: BankConn = s.phase === 'three' ? s.conn : 'delta';
      const a = correct(load, s.v, s.f, s.c, s.phase, conn, 0).after;
      s.targetSide = a.side === 'lead' ? 'lead' : 'lag';
    } catch {
      /* invalid inputs: compute reports them */
    }
  },
  compute,
  examples: [
    { id: 'default', label: '1 kVA at 0.8 lagging, 230 V 50 Hz → 0.95', state: defaults() },
    {
      id: 'sadiku',
      label: 'Alexander & Sadiku: 4 kW at 0.8, 120 V 60 Hz → 0.95',
      state: { solveFor: 'c', phase: 'single', v: 120, f: 60, loadBy: 'p', p: 4000, pfd: 0.8, loadSide: 'lag', thdPct: 0, pfTarget: 0.95, targetSide: 'lag', cUnit: 'µF', ssc: 0 },
    },
    {
      id: 'motor-3ph',
      label: '3-phase 400 V motor, 75 kW at 0.82 → 0.95, Δ bank',
      state: { solveFor: 'c', phase: 'three', v: 400, f: 50, loadBy: 'p', p: 75e3, pfd: 0.82, loadSide: 'lag', thdPct: 0, pfTarget: 0.95, targetSide: 'lag', cUnit: 'µF', conn: 'delta', ssc: 0 },
    },
    {
      id: 'overcorrect',
      label: 'Analysis: 40 µF on the 1 kVA load (overcorrected)',
      state: { solveFor: 'pfTarget', phase: 'single', v: 230, f: 50, loadBy: 's', s: 1000, pfd: 0.8, loadSide: 'lag', thdPct: 0, c: 40e-6, cUnit: 'µF', ssc: 0 },
    },
    {
      id: 'rectifier',
      label: 'Rectifier load, THD 120 %: a capacitor barely helps',
      state: { solveFor: 'c', phase: 'single', v: 230, f: 50, loadBy: 'p', p: 500, pfd: 0.97, loadSide: 'lag', thdPct: 120, pfTarget: 0.99, targetSide: 'lag', cUnit: 'µF', ssc: 0 },
    },
    {
      id: 'resonance',
      label: '400 kW plant, 5 MVA fault level: 5th-harmonic resonance',
      state: { solveFor: 'c', phase: 'three', v: 400, f: 50, loadBy: 'p', p: 400e3, pfd: 0.75, loadSide: 'lag', thdPct: 0, pfTarget: 0.95, targetSide: 'lag', cUnit: 'µF', conn: 'delta', ssc: 5e6 },
    },
  ],
};
