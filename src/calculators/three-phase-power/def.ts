/** Three-phase power — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { type Conn, type Side, SQ3, balanced, pInst, unbalanced } from './model';

export type TpSolve = 'p' | 'il' | 'vl' | 'pf';
export type PowerBy = 'p' | 's';

export interface TpState {
  solveFor: TpSolve;
  conn: Conn;
  vl: number;
  f: number;
  il: number;
  pf: number;
  side: Side;
  pBy: PowerBy;
  p: number;
  s: number;
  unbal: boolean;
  ia: number;
  ib: number;
  ic: number;
  aDeg: number;
  bDeg: number;
  cDeg: number;
}

export const defaults = (): TpState => ({
  solveFor: 'p',
  conn: 'wye',
  vl: 400,
  f: 50,
  il: 10,
  pf: 0.85,
  side: 'lag',
  pBy: 'p',
  p: 5889,
  s: 6928,
  unbal: false,
  ia: 10,
  ib: 8,
  ic: 6,
  aDeg: -31.8,
  bDeg: -151.8,
  cDeg: 88.2,
});

/** The power target is used when solving for I_L or V_L (P or S, per pBy) and for PF (always P). */
const targetMode = (r: any) => r.solveFor === 'il' || r.solveFor === 'vl';
const pGiven = (r: any) => r.solveFor === 'pf' || (targetMode(r) && r.pBy === 'p');
const sGiven = (r: any) => targetMode(r) && r.pBy === 's';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'System',
    fields: [
      { kind: 'select', key: 'conn', label: 'Load connection', options: [{ value: 'wye', label: 'Wye (star)' }, { value: 'delta', label: 'Delta' }] },  // unbal is kept (ignored for Δ) so Y → Δ → Y restores it (review 2026-11-26)
      { kind: 'number', key: 'vl', symbol: 'V_L', label: 'Line voltage (rms)', unit: 'V', min: 1, max: 2e6, solvable: true, help: 'Line-to-line voltage, as quoted for the system (400 V, 480 V, 11 kV…).' },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', unit: 'Hz', min: 1, max: 10e3, help: 'Only used for the per-phase L or C equivalent and the time axis of the waveform graph.' },
    ],
  },
  {
    kind: 'section',
    title: 'Load',
    fields: [
      { kind: 'number', key: 'il', symbol: 'I_L', label: 'Line current (rms)', unit: 'A', min: 1e-6, max: 1e6, solvable: true },
      { kind: 'number', key: 'pf', symbol: 'PF', label: 'Power factor', min: 0, max: 1, solvable: true, help: 'cos θ of the per-phase load (sinusoidal currents).' },
      { kind: 'select', key: 'side', label: 'PF is', options: [{ value: 'lag', label: 'Lagging (inductive)' }, { value: 'lead', label: 'Leading (capacitive)' }], visible: (s) => s.pf < 1 },
      { kind: 'select', key: 'pBy', label: 'Power given as', options: [{ value: 'p', label: 'Real power P' }, { value: 's', label: 'Apparent power S (kVA)' }], visible: (s) => targetMode(s) },
      {
        kind: 'number',
        key: 'p',
        symbol: 'P',
        label: 'Real power (total)',
        unit: 'W',
        min: 0,
        max: 1e13,
        solvable: true,
        solvedWhen: (_s, r) => !pGiven(r),
        onSolve: (_s, r) => (r.solveFor = 'p'),
        onUnsolve: (_s, r) => {
          if (!targetMode(r)) r.solveFor = 'il';
          r.pBy = 'p';
        },
        help: 'Computed from V_L, I_L and PF; click ◎ to enter it and solve for the current instead.',
      },
      {
        kind: 'number',
        key: 's',
        symbol: 'S',
        label: 'Apparent power',
        unit: 'VA',
        min: 0,
        max: 1e13,
        solvable: true,
        solvedWhen: (_s, r) => !sGiven(r),
        onSolve: (_s, r) => (r.solveFor = 'p'),
        onUnsolve: (_s, r) => {
          if (!targetMode(r)) r.solveFor = 'il';
          r.pBy = 's';
        },
        help: 'kVA rating ↔ line current: click ◎ to enter S and solve for I_L.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Unbalanced 4-wire (neutral current)',
    collapsed: true,
    note: 'Phasors of the three line currents of a Y load with neutral; angles relative to V_an.',
    visible: (s) => s.conn === 'wye',
    fields: [
      { kind: 'toggle', key: 'unbal', label: 'Compute neutral current' },
      { kind: 'number', key: 'ia', symbol: 'I_a', label: 'Phase A current', unit: 'A', min: 0, max: 1e6, visible: (s) => s.unbal },
      { kind: 'number', key: 'aDeg', symbol: '∠I_a', label: 'Phase A angle', suffix: '°', min: -360, max: 360, visible: (s) => s.unbal },
      { kind: 'number', key: 'ib', symbol: 'I_b', label: 'Phase B current', unit: 'A', min: 0, max: 1e6, visible: (s) => s.unbal },
      { kind: 'number', key: 'bDeg', symbol: '∠I_b', label: 'Phase B angle', suffix: '°', min: -360, max: 360, visible: (s) => s.unbal },
      { kind: 'number', key: 'ic', symbol: 'I_c', label: 'Phase C current', unit: 'A', min: 0, max: 1e6, visible: (s) => s.unbal },
      { kind: 'number', key: 'cDeg', symbol: '∠I_c', label: 'Phase C angle', suffix: '°', min: -360, max: 360, visible: (s) => s.unbal },
    ],
  },
];

const LABEL: Record<string, string> = { il: 'Line current', vl: 'Line voltage', pf: 'Power factor', p: 'Real power' };
const RANGE: Record<'il' | 'vl', [number, number]> = { il: [1e-6, 1e6], vl: [1, 2e6] };

function noSolution(report: CalcReport, key: string, msg: string): CalcReport {
  report.warnings.push(msg);
  report.status = { text: 'NO SOLUTION', tone: 'fail' };
  report.results.push({ key, label: LABEL[key] ?? key, value: null, display: '—', primary: true, solved: true });
  return report;
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const pfText = (pf: number, side: Side) => `${pf.toFixed(3)}${pf >= 1 ? '' : side === 'lag' ? ' lagging' : ' leading'}`;

export function compute(st: TpState): CalcReport {
  const num = ['vl', 'f', 'il', 'pf', 'p', 's', 'ia', 'ib', 'ic', 'aDeg', 'bDeg', 'cDeg'] as const;
  for (const k of num) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  const s: TpState = { ...st };
  if (s.solveFor !== 'vl' && !(s.vl > 0)) throw new Error('Line voltage must be > 0.');
  if (s.solveFor !== 'il' && !(s.il > 0)) throw new Error('Line current must be > 0.');
  if (!(s.f > 0)) throw new Error('Frequency must be > 0.');
  if (s.solveFor !== 'pf' && !(s.pf >= 0 && s.pf <= 1)) throw new Error('Power factor must be in [0, 1].');
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'power/three-phase-power', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  // ── solve (S = √3·V_L·I_L and P = S·PF are linear in each unknown: exact closed-form inverses)
  if (s.solveFor === 'il' || s.solveFor === 'vl') {
    const useS = s.pBy === 's';
    const target = useS ? s.s : s.p;
    // Harness note (error-after-edit, legitimate): typing P = 0, S = 0 or PF = 0 (the fields' minimum, valid
    // for analysis) leaves no power to solve I_L or V_L from — a typed-input error, not a switch error.
    if (!(target > 0)) throw new Error(`${useS ? 'Apparent' : 'Real'} power must be > 0 to solve for ${s.solveFor === 'il' ? 'the current' : 'the voltage'}.`);
    if (!useS && !(s.pf > 0)) throw new Error('With PF = 0 the load draws no real power: give S instead of P.');
    const sva = useS ? target : target / s.pf;
    const x = s.solveFor === 'il' ? sva / (SQ3 * s.vl) : sva / (SQ3 * s.il);
    const [lo, hi] = RANGE[s.solveFor];
    if (x < lo || x > hi) return noSolution(report, s.solveFor, `${useS ? 'S' : 'P'} = ${si(target, useS ? 'VA' : 'W', 3)} needs ${s.solveFor === 'il' ? 'I_L' : 'V_L'} = ${si(x, s.solveFor === 'il' ? 'A' : 'V', 3)}, outside ${s.solveFor === 'il' ? '1 µA – 1 MA' : '1 V – 2 MV'}.`);
    s[s.solveFor] = x;
  } else if (s.solveFor === 'pf') {
    if (!(s.p >= 0)) throw new Error('Real power must be ≥ 0.');
    const sva = SQ3 * s.vl * s.il;
    const pf = s.p / sva;
    if (pf > 1 + 1e-12) return noSolution(report, 'pf', `P = ${si(s.p, 'W', 3)} exceeds S = √3·V_L·I_L = ${si(sva, 'VA', 3)}: no power factor above 1. Raise I_L or V_L, or lower P.`);
    s.pf = Math.min(1, pf);
  }

  const b = balanced(s.vl, s.il, s.pf, s.side, s.conn);
  const w = 2 * Math.PI * s.f;
  const lEq = b.x > 0 ? b.x / w : 0;
  const cEq = b.x < 0 ? 1 / (w * -b.x) : 0;

  // ── results
  const item = (key: string, label: string, value: number | string, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const R = report.results;
  const sv = s.solveFor;
  if (sv === 'il') R.push(item('il', 'Line current', s.il, 'A', si(s.il, 'A', 4), { symbol: 'I_L', solved: true, primary: true, note: `for ${s.pBy === 's' ? `S = ${si(s.s, 'VA', 3)}` : `P = ${si(s.p, 'W', 3)}`}` }));
  if (sv === 'vl') R.push(item('vl', 'Line voltage', s.vl, 'V', si(s.vl, 'V', 4), { symbol: 'V_L', solved: true, primary: true, note: `V_ph = ${si(b.vph, 'V', 3)}` }));
  if (sv === 'pf') R.push(item('pf', 'Power factor', s.pf, '', pfText(s.pf, s.side), { symbol: 'PF', solved: true, primary: true, note: `θ = ${deg(b.theta).toFixed(2).replace('-', '−')}°` }));
  R.push(
    item('p', 'Real power', b.p, 'W', si(b.p, 'W', 4), { symbol: 'P', primary: true, solved: !pGiven(s), note: `${si(b.p / 3, 'W', 3)} per phase` }),
    item('q', 'Reactive power', b.q, 'var', si(b.q, 'var', 4), { symbol: 'Q', primary: true, note: b.q < 0 ? 'negative: leading (capacitive)' : 'lagging (inductive)' }),
    item('s', 'Apparent power', b.s, 'VA', si(b.s, 'VA', 4), { symbol: 'S', primary: true, solved: !sGiven(s), note: '√3·V_L·I_L' }),
  );
  if (sv === 'p') R.push(item('vphHead', 'Phase voltage', b.vph, 'V', si(b.vph, 'V', 4), { symbol: 'V_ph', primary: true, note: s.conn === 'wye' ? 'V_L/√3 (line to neutral)' : '= V_L (across each Δ branch)' }));

  const g1 = 'Per phase';
  R.push(
    item('vph', 'Phase voltage', b.vph, 'V', si(b.vph, 'V', 4), { symbol: 'V_ph', group: g1, note: s.conn === 'wye' ? 'V_L/√3' : '= V_L' }),
    item('iph', 'Phase current', b.iph, 'A', si(b.iph, 'A', 4), { symbol: 'I_ph', group: g1, note: s.conn === 'wye' ? '= I_L' : 'I_L/√3' }),
    item('z', 'Impedance', b.z, 'Ω', `${si(b.z, 'Ω', 4)} ∠${deg(b.theta).toFixed(2).replace('-', '−')}°`, { symbol: '|Z_ph|', group: g1, note: s.conn === 'delta' ? `each Δ branch · Y equivalent ${si(b.zY, 'Ω', 4)}` : 'each Y arm' }),
    item('r', 'Resistance', b.r, 'Ω', si(b.r, 'Ω', 4), { symbol: 'R_ph', group: g1 }),
    item('x', 'Reactance', b.x, 'Ω', si(b.x, 'Ω', 4), { symbol: 'X_ph', group: g1, note: b.x > 0 ? `L = ${si(lEq, 'H', 4)} at ${si(s.f, 'Hz', 3)}` : b.x < 0 ? `C = ${si(cEq, 'F', 4)} at ${si(s.f, 'Hz', 3)}` : 'resistive' }),
    item('theta', 'Load angle', deg(b.theta), '°', `${deg(b.theta).toFixed(2).replace('-', '−')}°`, { symbol: 'θ', group: g1, note: 'V_ph to I_ph; + lagging' }),
  );
  if (sv !== 'pf') R.push(item('pfOut', 'Power factor', s.pf, '', pfText(s.pf, s.side), { symbol: 'PF', group: g1 }));

  // ── unbalanced 4-wire neutral current
  let ub: ReturnType<typeof unbalanced> | null = null;
  if (s.unbal && s.conn === 'wye') {
    for (const k of ['ia', 'ib', 'ic'] as const) if (s[k] < 0) throw new Error('Phase currents must be ≥ 0.');
    ub = unbalanced(s.ia, s.aDeg, s.ib, s.bDeg, s.ic, s.cDeg);
    const imax = Math.max(s.ia, s.ib, s.ic);
    const g2 = 'Neutral (unbalanced 4-wire)';
    const vuf = ub.i1 > 0 ? ub.i2 / ub.i1 : 0;
    R.push(
      item('in', 'Neutral current', ub.inMag, 'A', `${si(ub.inMag, 'A', 4)} ∠${ub.inDeg.toFixed(1).replace('-', '−')}°`, { symbol: 'I_N', group: g2, tone: ub.inMag > imax ? 'warn' : '', note: 'I_a + I_b + I_c = 3·I₀' }),
      item('i1', 'Positive sequence', ub.i1, 'A', si(ub.i1, 'A', 4), { symbol: 'I_1', group: g2 }),
      item('i2', 'Negative sequence', ub.i2, 'A', si(ub.i2, 'A', 4), { symbol: 'I_2', group: g2, note: `I₂/I₁ = ${(vuf * 100).toFixed(1)} %` }),
      item('i0', 'Zero sequence', ub.i0, 'A', si(ub.i0, 'A', 4), { symbol: 'I_0', group: g2 }),
    );
    if (ub.inMag > imax * (1 + 1e-9)) warnings.push(`Neutral current ${si(ub.inMag, 'A', 3)} exceeds the largest phase current ${si(imax, 'A', 3)}: size the neutral conductor for I_N, not for the phases.`);
    notes.push('Neutral current is the fundamental phasor sum only; triplen harmonics (3rd, 9th…) from rectifier loads add arithmetically in the neutral and can make it larger still.');
  }

  // ── checks
  if (s.pf < 0.5 && s.pf > 0) notes.push(`PF ${s.pf.toFixed(2)} is low: most of the line current is reactive. See the power-factor page to size correction capacitors.`);
  if (s.pf === 0) notes.push('PF = 0: a purely reactive load, no real power.');
  if (s.solveFor === 'pf' && s.p === 0) notes.push('P = 0 gives PF = 0 (purely reactive load).');

  report.summary = `Balanced ${s.conn === 'wye' ? 'Y' : 'Δ'} load at V_L = ${si(s.vl, 'V', 3)}, I_L = ${si(s.il, 'A', 3)}, ${pfText(s.pf, s.side)} · P = ${si(b.p, 'W', 3)}`;
  report.details = { balanced: b, state: { vl: s.vl, il: s.il, pf: s.pf, side: s.side, conn: s.conn }, unbalanced: ub };
  report.graphs = graphs(s, b);
  return report;
}

function graphs(s: TpState, b: ReturnType<typeof balanced>): GraphSpec[] {
  // 1) P, Q, S vs line current at this V_L and PF
  const n = 101;
  const iMax = 2 * s.il;
  const is = Array.from({ length: n }, (_, k) => (iMax * k) / (n - 1));
  const sOf = (i: number) => SQ3 * s.vl * i;
  const pVsI: GraphSpec = {
    id: 'power-vs-current',
    title: 'Power vs current',
    x: { label: 'Line current I_L', unit: 'A' },
    y: [{ id: 'p', label: 'Power', unit: 'W / var / VA', includeZero: true }],
    series: [
      { label: 'S', x: is, y: is.map(sOf), color: '#9a8f7a', width: 1.4, dash: [5, 3] },
      { label: 'P', x: is, y: is.map((i) => sOf(i) * Math.cos(b.theta)), color: '#1f4e5f', width: 2.2 },
      { label: 'Q', x: is, y: is.map((i) => sOf(i) * Math.sin(b.theta)), color: '#c47b17', width: 1.6 },
    ],
    vlines: [{ value: s.il, label: `I_L = ${si(s.il, 'A', 3)}` }],
    markers: [{ x: s.il, y: b.p, label: si(b.p, 'W', 3) }],
  };

  // 2) Instantaneous power of each phase and the (constant) total, two cycles
  const T = 1 / s.f;
  const m = 161;
  const ts = Array.from({ length: m }, (_, k) => (2 * T * k) / (m - 1));
  const w = 2 * Math.PI * s.f;
  const ph = [0, (-2 * Math.PI) / 3, (2 * Math.PI) / 3];
  const pa = ph.map((sh) => ts.map((t) => pInst(b.vph, b.iph, b.theta, w, t, sh)));
  const tot = ts.map((_, k) => pa[0][k] + pa[1][k] + pa[2][k]);
  const inst: GraphSpec = {
    id: 'instantaneous',
    title: 'Instantaneous power',
    subtitle: 'balanced: the three pulsating phase powers sum to a constant P',
    x: { label: 'Time', unit: 's' },
    // headroom above the constant total so it does not sit on the frame
    y: [{ id: 'p', label: 'Power', unit: 'W', includeZero: true, max: 1.12 * Math.max(b.p, b.vph * b.iph * (1 + Math.abs(Math.cos(b.theta))), 1e-30) }],
    legend: 'below',
    series: [
      { label: 'p_a', x: ts, y: pa[0], color: '#1f4e5f', width: 1.3 },
      { label: 'p_b', x: ts, y: pa[1], color: '#4f8a8b', width: 1.3 },
      { label: 'p_c', x: ts, y: pa[2], color: '#6b5b95', width: 1.3 },
      { label: 'p_a + p_b + p_c', x: ts, y: tot, color: '#c47b17', width: 2.4 },
    ],
  };
  return [pVsI, inst];
}

export const def: CalcDef<TpState> = {
  id: 'power/three-phase-power',
  version: '0.1.0',
  method:
    'Balanced three-phase relations (Alexander & Sadiku ch. 12; Glover, Sarma & Overbye ch. 2): Y: V_L = √3·V_ph, I_L = I_ph; Δ: V_L = V_ph, I_L = √3·I_ph; S = √3·V_L·I_L, P = S·cos θ, Q = S·sin θ; per-phase Z = V_ph/I_ph∠θ. I_L, V_L and PF are exact closed-form inverses. Unbalanced 4-wire Y: I_N = I_a + I_b + I_c and Fortescue sequence components.',
  fields,
  defaults,
  solve: {
    default: 'p',
    analysis: 'p',
    options: [
      { key: 'p', label: 'P, Q, S from V_L, I_L and PF (analysis)' },
      { key: 'il', label: 'Line current for a given P or S' },
      { key: 'vl', label: 'Line voltage for a given P or S' },
      { key: 'pf', label: 'Power factor from V_L, I_L and P' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '400 V Y load, 10 A at 0.85 lagging', state: defaults() },
    {
      id: 'sadiku',
      label: 'Alexander & Sadiku Ex. 12.3: 100 V Y source into Δ of 8 + j4 Ω',
      // V_an = 100 V → V_L = 173.2 V; Z_Δ = 8 + j4 Ω → PF = 8/√80, I_ph = 19.36 A, P = 3·I_ph²·8 = 9 kW; text: I_a = 33.54 A
      state: { solveFor: 'il', conn: 'delta', vl: 100 * SQ3, f: 60, pf: 8 / Math.sqrt(80), side: 'lag', pBy: 'p', p: 9000, unbal: false },
    },
    {
      id: 'kva-to-amps',
      label: '500 kVA transformer at 400 V: full-load current',
      state: { solveFor: 'il', conn: 'wye', vl: 400, f: 50, pf: 0.9, side: 'lag', pBy: 's', s: 500e3, unbal: false },
    },
    {
      id: 'motor-delta',
      label: '480 V Δ motor, 75 kW at 0.88: current and per-phase Z',
      state: { solveFor: 'il', conn: 'delta', vl: 480, f: 60, pf: 0.88, side: 'lag', pBy: 'p', p: 75e3, unbal: false },
    },
    {
      id: 'pf-from-meter',
      label: 'PF from meter readings: 11 kV, 52 A, 850 kW',
      state: { solveFor: 'pf', conn: 'delta', vl: 11e3, f: 50, il: 52, side: 'lag', pBy: 'p', p: 850e3, unbal: false },
    },
    {
      id: 'neutral',
      label: '4-wire Y, unbalanced 100 / 80 / 60 A: neutral current',
      state: { solveFor: 'p', conn: 'wye', vl: 400, f: 50, il: 80, pf: 0.9, side: 'lag', pBy: 'p', unbal: true, ia: 100, aDeg: -25.84, ib: 80, bDeg: -145.84, ic: 60, cDeg: 94.16 },
    },
  ],
};
