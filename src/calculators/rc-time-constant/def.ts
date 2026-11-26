/** RC Time Constant — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { nearestE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { TIME_UNITS, si } from '@/core/units';
import { U_CAP, U_OHM, withDefault } from '@/core/unitsets';
import { cornerHz, highPass, iAt, logspace, lowPass, tauMultiple, vAt } from './model';

export type RcSolve = 't' | 'vth' | 'r' | 'c';

export interface RcState {
  /** The unknown: time to reach V_th, voltage at t, or R / C for a design target */
  solveFor: RcSolve;
  /** When solving R or C: the target is the time constant τ or "reach V_th at time t" */
  target: 'threshold' | 'tau';
  r: number;
  rUnit: string;
  c: number;
  cUnit: string;
  tau: number;
  tauUnit: string;
  v0: number;
  vInf: number;
  vth: number;
  t: number;
  tUnit: string;
  eseries: 'E12' | 'E24' | 'E96' | 'none';
}

export const defaults = (): RcState => ({
  solveFor: 't',
  target: 'threshold',
  r: 10e3,
  rUnit: 'kΩ',
  c: 100e-9,
  cUnit: 'nF',
  tau: 1e-3,
  tauUnit: 'ms',
  v0: 0,
  vInf: 5,
  vth: 2.5,
  t: 693.147e-6,
  tUnit: 'ms',
  eseries: 'E24',
});

// Solved values reach the field limits (R up to 1 TΩ, C up to 100 F, τ down to fs): give the core enough
// prefixes to show them readably (it can only move a solved value to a prefix that is in the list).
// Above 9999 s (R and C near their maxima) a solved τ or t stays in s: no time unit beyond s is meant for
// reading, so "100000 s" is expected (the harness reports it as unreadable).
const U_TIME = { ...withDefault(TIME_UNITS, 'ms'), ps: 1e-12 };
const U_R = { ...U_OHM, 'GΩ': 1e9 };
const U_C = { ...U_CAP, mF: 1e-3, F: 1 };
const solvingRC = (s: RcState) => s.solveFor === 'r' || s.solveFor === 'c';
/** τ is typed only when solving R or C for a τ target. */
const tauGiven = (s: RcState) => solvingRC(s) && s.target === 'tau';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Circuit',
    note: 'Click ◎ to pick the unknown. τ is computed unless it is the design target.',
    fields: [
      { kind: 'number', key: 'r', symbol: 'R', label: 'Resistance', units: U_R, unitKey: 'rUnit', solvable: true, min: 1e-3, max: 1e12, help: 'Total series resistance, including the source’s output resistance.' },
      { kind: 'number', key: 'c', symbol: 'C', label: 'Capacitance', units: U_C, unitKey: 'cUnit', solvable: true, min: 1e-15, max: 100, help: 'Use the effective value at the operating voltage: class-2 ceramics (X7R, X5R) lose much of their capacitance under DC bias.' },
      {
        kind: 'number', key: 'tau', symbol: 'τ', label: 'Time constant RC', units: U_TIME, unitKey: 'tauUnit', solvable: true, min: 1e-15, max: 1e9,
        solvedWhen: (_s, root) => !tauGiven(root as RcState),
        onSolve: (_s, root) => (root.target = 'threshold'),
        onUnsolve: (_s, root) => {
          if (!solvingRC(root as RcState)) root.solveFor = 'r';
          root.target = 'tau';
        },
        help: 'τ = R·C. Click ◎ on the green value to make τ the design target (then R or C is solved for it).',
      },
      {
        kind: 'select', key: 'target', label: 'Design target', visible: (s) => solvingRC(s as RcState),
        options: [
          { value: 'threshold', label: 'Reach V_th at time t' },
          { value: 'tau', label: 'Time constant τ' },
        ],
      },
    ],
  },
  {
    kind: 'section',
    title: 'Step & threshold',
    note: 'Charge: V₀ < V∞. Discharge: V₀ > V∞ (e.g. 5 V → 0 V).',
    fields: [
      { kind: 'number', key: 'v0', symbol: 'V₀', label: 'Initial voltage', unit: 'V', min: -1e6, max: 1e6, help: 'Capacitor voltage at t = 0, when the step is applied.' },
      { kind: 'number', key: 'vInf', symbol: 'V∞', label: 'Final voltage', unit: 'V', min: -1e6, max: 1e6, help: 'Voltage the capacitor settles to: the source voltage after the step (0 V for a discharge to ground).' },
      {
        kind: 'number', key: 'vth', symbol: 'V_th', label: 'Threshold voltage', unit: 'V', solvable: true, min: -1e6, max: 1e6,
        onUnsolve: (_s, root) => (root.solveFor = 't'),
        help: 'Voltage of interest, e.g. a logic or comparator threshold. It must lie between V₀ and V∞ to be reached.',
      },
      {
        kind: 'number', key: 't', symbol: 't', label: 'Time after step', units: U_TIME, unitKey: 'tUnit', solvable: true, min: 0, max: 1e9,
        solvedWhen: (_s, root) => root.solveFor === 't' || tauGiven(root as RcState),
        onUnsolve: (_s, root) => {
          if (root.solveFor === 't') root.solveFor = 'vth';
          else root.target = 'threshold';
        },
        help: 'Time to reach V_th when that is the unknown; otherwise the time at which v(t) is evaluated (or the design target).',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Options',
    collapsed: true,
    fields: [
      {
        kind: 'select', key: 'eseries', label: 'Standard values',
        options: [{ value: 'E12', label: 'E12 (10 %)' }, { value: 'E24', label: 'E24 (5 %)' }, { value: 'E96', label: 'E96 (1 %)' }, { value: 'none', label: 'Off' }],
        help: 'Rounds a solved R or C to the nearest preferred value (IEC 60063) and shows the timing it gives.',
      },
    ],
  },
];

const fmtT = (s: number) => si(s, 's', 4);
/** One rule for summary and graph title: stored energy rises (charge), falls (discharge) or is unchanged (step, e.g. −5 V → +5 V). */
const stepKind = (v0: number, vInf: number) => (Math.abs(vInf) > Math.abs(v0) ? 'Charge' : Math.abs(vInf) < Math.abs(v0) ? 'Discharge' : 'Step');
const fmtV = (v: number) => si(v, 'V', 4);
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

export function compute(st: RcState): CalcReport {
  for (const k of ['r', 'c', 'tau', 'v0', 'vInf', 'vth', 't'] as const) if (!finite(st[k])) throw new Error(`${k} must be a finite number.`);
  const s: RcState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];
  const dV = s.vInf - s.v0;
  if (dV === 0) throw new Error('V₀ = V∞: the capacitor voltage never changes. Set different initial and final voltages.');

  // ── time constant and the solved R / C
  let tau: number;
  if (solvingRC(s)) {
    if (s.target === 'tau') {
      if (!(s.tau > 0)) throw new Error('Enter a time constant τ > 0.');
      tau = s.tau;
    } else {
      const n = tauMultiple(s.v0, s.vInf, s.vth);
      if (!(n > 0)) throw new Error(`V_th = ${fmtV(s.vth)} is never reached on the way from ${fmtV(s.v0)} to ${fmtV(s.vInf)}: it must lie strictly between V₀ and V∞.`);
      if (!(s.t > 0)) throw new Error('Enter a time t > 0 to reach V_th.');
      tau = s.t / n;
    }
    if (s.solveFor === 'r') {
      if (!(s.c > 0)) throw new Error('Capacitance must be > 0.');
      s.r = tau / s.c;
    } else {
      if (!(s.r > 0)) throw new Error('Resistance must be > 0.');
      s.c = tau / s.r;
    }
  } else {
    if (!(s.r > 0) || !(s.c > 0)) throw new Error('R and C must be > 0.');
    tau = s.r * s.c;
  }
  s.tau = tau;

  // ── the threshold pair
  const n = tauMultiple(s.v0, s.vInf, s.vth);
  let tTh: number | null = null;
  if (s.solveFor === 'vth') {
    if (s.t < 0) throw new Error('Time must be ≥ 0.');
    s.vth = vAt(s.t, tau, s.v0, s.vInf);
    tTh = s.t;
  } else if (s.solveFor === 't' || tauGiven(s)) {
    // Never reached: t shows "—" but the state keeps the last time. Solving V_th from here uses that
    // time, so the harness's round trip "fails" from this no-answer state; that is expected.
    if (Number.isFinite(n)) tTh = n * tau;
    else warnings.push(`V_th = ${fmtV(s.vth)} is never reached: the voltage goes from ${fmtV(s.v0)} towards ${fmtV(s.vInf)} and only approaches V∞. Pick a threshold strictly between them.`);
  } else tTh = s.t;
  if (tTh != null) s.t = tTh;

  const fc = cornerHz(tau);
  const frac = (s.vth - s.v0) / dV;
  const i0 = dV / s.r;
  const kind = stepKind(s.v0, s.vInf);

  if (tTh != null && tTh > 3 * tau * (1 + 1e-9)) warnings.push(`V_th is ${(frac * 100).toFixed(3)} % of the way to V∞ (t = ${(tTh / tau).toFixed(2)} τ). Beyond 3 τ (95 %) the curve is flat near the asymptote, so capacitor leakage, dielectric absorption, source drift and comparator offset dominate the timing — use a threshold below about 95 %.`);
  if (s.r < 10) notes.push(`R = ${si(s.r, 'Ω', 3)} is small: the source resistance and capacitor ESR are probably comparable and should be added to R.`);
  if (s.r > 10e6) warnings.push(`R = ${si(s.r, 'Ω', 3)}: the charging current starts at only ${si(Math.abs(i0), 'A', 2)} and keeps falling, so capacitor and PCB leakage and the input bias of whatever reads the node (nA–µA) can shift the timing. Prefer R ≤ 1–10 MΩ and a larger C.`);
  if (s.c < 100e-12) notes.push(`C = ${si(s.c, 'F', 3)}: stray and input capacitance (a few pF) are a noticeable fraction — add them to C.`);

  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const tauItem = item('tau', 'Time constant', tau, 's', fmtT(tau), { symbol: 'τ', primary: true, solved: !tauGiven(s), note: `R·C = ${si(s.r, 'Ω', 4)} × ${si(s.c, 'F', 4)}` });
  const tItem = item('t', 'Time to threshold', tTh, 's', tTh == null ? '— (never reached)' : fmtT(tTh), {
    symbol: 't', primary: true, solved: s.solveFor === 't' || tauGiven(s), tone: tTh == null ? 'warn' : '',
    note: tTh == null ? '' : `${(tTh / tau).toPrecision(4)} τ · V_th = ${fmtV(s.vth)} (${(frac * 100).toFixed(2)} % of the step)`,
  });
  const vItem = item('vth', 'Voltage at time t', s.vth, 'V', fmtV(s.vth), { symbol: 'v(t)', primary: true, solved: true, note: `at t = ${fmtT(s.t)} (${(s.t / tau).toPrecision(4)} τ) · ${(frac * 100).toFixed(2)} % of the step` });
  const fcItem = item('fc', 'RC corner frequency (−3 dB)', fc, 'Hz', si(fc, 'Hz', 4), { symbol: 'f_c', primary: true, note: '1/(2πRC), low-pass or high-pass' });

  const primary: ResultItem[] = [];
  if (s.solveFor === 'r') primary.push(item('r', 'Resistance', s.r, 'Ω', si(s.r, 'Ω', 4), { symbol: 'R', primary: true, solved: true, note: `for C = ${si(s.c, 'F', 4)}` }));
  if (s.solveFor === 'c') primary.push(item('c', 'Capacitance', s.c, 'F', si(s.c, 'F', 4), { symbol: 'C', primary: true, solved: true, note: `for R = ${si(s.r, 'Ω', 4)}` }));
  if (s.solveFor === 'vth') primary.push(vItem, tauItem);
  else if (s.solveFor === 't') primary.push(tItem, tauItem);
  else primary.push(tauItem, tItem);
  primary.push(fcItem);

  const g = 'Transient';
  const more: ResultItem[] = [
    item('fraction', 'Threshold as % of step', frac * 100, '%', `${(frac * 100).toFixed(3)} %`, { group: g, note: '(V_th − V₀)/(V∞ − V₀)' }),
    item('i0', 'Initial current', i0, 'A', si(i0, 'A', 4), { symbol: 'I₀', group: g, note: '(V∞ − V₀)/R, at t = 0⁺' }),
    item('tRise', '10–90 % rise / fall time', Math.log(9) * tau, 's', fmtT(Math.log(9) * tau), { symbol: 't_r', group: g, note: 'τ·ln 9 ≈ 2.197 τ' }),
    item('t99', 'Settling to 1 %', Math.log(100) * tau, 's', fmtT(Math.log(100) * tau), { symbol: 't₁%', group: g, note: 'τ·ln 100 ≈ 4.6 τ' }),
    item('t999', 'Settling to 0.1 %', Math.log(1000) * tau, 's', fmtT(Math.log(1000) * tau), { symbol: 't₀.₁%', group: g, note: 'τ·ln 1000 ≈ 6.9 τ' }),
    item('eCap', 'Change in stored energy', 0.5 * s.c * (s.vInf ** 2 - s.v0 ** 2), 'J', si(0.5 * s.c * (s.vInf ** 2 - s.v0 ** 2), 'J', 4), { symbol: 'ΔE_C', group: 'Energy', note: '½·C·(V∞² − V₀²)' }),
    item('eR', 'Energy dissipated in R', 0.5 * s.c * dV ** 2, 'J', si(0.5 * s.c * dV ** 2, 'J', 4), { symbol: 'E_R', group: 'Energy', note: '½·C·(V∞ − V₀)², independent of R' }),
    item('pPeak', 'Peak power in R', (dV * dV) / s.r, 'W', si((dV * dV) / s.r, 'W', 4), { symbol: 'P_pk', group: 'Energy', note: '(V∞ − V₀)²/R at t = 0⁺' }),
    item('wc', 'Corner angular frequency', 1 / tau, 'rad/s', si(1 / tau, 'rad/s', 4), { symbol: 'ω_c', group: 'Frequency domain', note: '1/τ' }),
    item('trBw', 'Rise time × bandwidth', Math.log(9) / (2 * Math.PI), '', (Math.log(9) / (2 * Math.PI)).toFixed(4), { group: 'Frequency domain', note: 'ln 9 / 2π ≈ 0.35 for any single pole' }),
  ];

  // ── standard values for a solved R or C
  if (solvingRC(s) && s.eseries !== 'none') {
    const isR = s.solveFor === 'r';
    const std = nearestE(isR ? s.r : s.c, s.eseries);
    const tauStd = isR ? std * s.c : s.r * std;
    const grp = `Nearest ${s.eseries} value`;
    more.push(item(isR ? 'rStd' : 'cStd', isR ? `Nearest ${s.eseries} resistor` : `Nearest ${s.eseries} capacitor`, std, isR ? 'Ω' : 'F', si(std, isR ? 'Ω' : 'F', 3), { group: grp, symbol: isR ? 'R_E' : 'C_E' }));
    more.push(item('tauStd', 'τ with that value', tauStd, 's', `${fmtT(tauStd)} (${(((tauStd - tau) / tau) * 100).toFixed(2)} %)`, { group: grp }));
    if (Number.isFinite(n)) more.push(item('tStd', 'Time to V_th with that value', n * tauStd, 's', fmtT(n * tauStd), { group: grp }));
  }

  // ── table of τ multiples
  const rows: Record<string, number | string | null>[] = [];
  const disp: Record<string, string>[] = [];
  for (const k of [0.5, 0.693, 1, 2, 2.197, 2.303, 3, 4, 4.605, 5]) {
    const tk = k * tau;
    const v = vAt(tk, tau, s.v0, s.vInf);
    const pct = (1 - Math.exp(-k)) * 100;
    rows.push({ n: k, t: tk, pct, v, i: iAt(tk, tau, s.r, s.v0, s.vInf) });
    disp.push({ n: `${k} τ`, t: fmtT(tk), pct: `${pct.toFixed(2)} %`, v: fmtV(v), i: si(iAt(tk, tau, s.r, s.v0, s.vInf), 'A', 3) });
  }
  const tables: TableSpec[] = [
    {
      id: 'tau-multiples',
      title: 'Response at multiples of τ',
      columns: [
        { key: 'n', label: 't / τ', align: 'left' },
        { key: 't', label: 'Time', unit: 's' },
        { key: 'pct', label: '% of step', unit: '%' },
        { key: 'v', label: 'v_C', unit: 'V' },
        { key: 'i', label: 'i', unit: 'A' },
      ],
      rows,
      display: disp,
      note: '0.693 τ = 50 %, 2.197 τ = 10→90 %, 2.303 τ = 90 %, 4.605 τ = 99 %.',
    },
  ];

  notes.push(
    'Ideal step source (zero output resistance — or include it in R), ideal capacitor (no leakage, ESR or dielectric absorption) and no load on the capacitor node.',
    'With a resistive load R_L across C, use the Thévenin equivalent: R → R‖R_L and V∞ → V∞·R_L/(R + R_L).',
  );

  const report: CalcReport = {
    calc: 'general/rc-time-constant',
    ok: true,
    solveFor: s.solveFor,
    results: [...primary, ...more],
    graphs: graphs(s, tau, tTh),
    tables,
    warnings,
    notes,
    summary: `${kind} ${fmtV(s.v0)} → ${fmtV(s.vInf)} · τ = ${fmtT(tau)} · f_c = ${si(fc, 'Hz', 4)}`,
    details: { tau, n, fc, frac, state: s },
  };
  return report;
}

function graphs(s: RcState, tau: number, tTh: number | null): GraphSpec[] {
  const tMax = Math.min(Math.max(5 * tau, (tTh ?? 0) * 1.15), 60 * tau);
  const N = 400;
  const ts = Array.from({ length: N + 1 }, (_, i) => (tMax * i) / N);
  const fc = cornerHz(tau);
  const fs = logspace(fc / 1000, fc * 1000, 241);
  const lp = fs.map((f) => lowPass(f, fc));
  const hp = fs.map((f) => highPass(f, fc));
  const vlines = [1, 2, 3, 4, 5].filter((k) => k * tau <= tMax).map((k) => ({ value: k * tau, label: `${k}τ`, color: '#9a8f7a', dash: [2, 3] }));
  const transient: GraphSpec = {
    id: 'transient',
    title: { Charge: 'Charging curve', Discharge: 'Discharge curve', Step: 'Step response' }[stepKind(s.v0, s.vInf)],
    x: { label: 'Time', unit: 's' },
    y: [
      { id: 'v', label: 'Capacitor voltage', unit: 'V' },
      { id: 'i', label: 'Current', unit: 'A', side: 'right' },
    ],
    series: [
      { label: 'v_C(t)', x: ts, y: ts.map((t) => vAt(t, tau, s.v0, s.vInf)), axis: 'v', width: 2.2, color: '#1f4e5f' },
      { label: 'i(t)', x: ts, y: ts.map((t) => iAt(t, tau, s.r, s.v0, s.vInf)), axis: 'i', width: 1.3, color: '#4f8a8b', dash: [5, 3] },
    ],
    hlines: [
      { value: s.vth, label: `V_th = ${fmtV(s.vth)}`, axis: 'v', color: '#c47b17', dash: [5, 3] },
      { value: s.vInf, label: `V∞ = ${fmtV(s.vInf)}`, axis: 'v', color: '#9a8f7a', dash: [3, 3] },
    ],
    vlines,
    markers: tTh != null && tTh <= tMax ? [{ x: tTh, y: s.vth, axis: 'v', label: `t = ${fmtT(tTh)}`, color: '#c47b17' }] : [],
  };
  const bode: GraphSpec = {
    id: 'frequency',
    title: 'Frequency response',
    subtitle: 'Low-pass: output across C · high-pass: output across R',
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [
      { id: 'db', label: 'Gain', unit: 'dB' },
      { id: 'deg', label: 'Phase', unit: '°', side: 'right' },
    ],
    series: [
      { label: 'Low-pass |H|', x: fs, y: lp.map((p) => p.db), axis: 'db', width: 2.2, color: '#1f4e5f' },
      { label: 'High-pass |H|', x: fs, y: hp.map((p) => p.db), axis: 'db', width: 2.2, color: '#c47b17' },
      { label: 'Low-pass phase', x: fs, y: lp.map((p) => p.deg), axis: 'deg', width: 1.2, color: '#1f4e5f', dash: [5, 3] },
      { label: 'High-pass phase', x: fs, y: hp.map((p) => p.deg), axis: 'deg', width: 1.2, color: '#c47b17', dash: [5, 3] },
    ],
    hlines: [{ value: -10 * Math.log10(2), label: '−3.01 dB', axis: 'db', color: '#8b1e1e', dash: [4, 3] }],
    vlines: [{ value: fc, label: `f_c = ${si(fc, 'Hz', 4)}` }],
  };
  return [transient, bode];
}

export const def: CalcDef<RcState> = {
  id: 'general/rc-time-constant',
  version: '0.1.0',
  method: 'First-order RC step response v(t) = V∞ + (V₀ − V∞)e^(−t/RC) and single-pole corner f_c = 1/(2πRC) (Alexander & Sadiku, Fundamentals of Electric Circuits, ch. 7; Horowitz & Hill, The Art of Electronics 3e, §1.4 and §1.7). Solve-for inverts the exponential exactly: t = τ·ln[(V₀ − V∞)/(V_th − V∞)].',
  fields,
  defaults,
  solve: {
    default: 't',
    analysis: 'vth',
    options: [
      { key: 't', label: 'Time to reach V_th (from R and C)' },
      { key: 'vth', label: 'Voltage at time t (from R and C)' },
      { key: 'r', label: 'R for a target (V_th at t, or τ), given C' },
      { key: 'c', label: 'C for a target (V_th at t, or τ), given R' },
    ],
  },
  compute,
  examples: [
    { id: 'half', label: '10 kΩ, 100 nF: time to 50 % (2.5 V of 5 V)', state: { solveFor: 't', target: 'threshold', r: 10e3, c: 100e-9, v0: 0, vInf: 5, vth: 2.5 } },
    { id: 'por', label: 'Reset delay: R for 3.3 V supply to reach 2.0 V in 20 ms, C = 1 µF', state: { solveFor: 'r', target: 'threshold', c: 1e-6, cUnit: 'µF', v0: 0, vInf: 3.3, vth: 2.0, t: 20e-3, tUnit: 'ms' } },
    { id: 'bleeder', label: 'Bleeder: 400 V bus discharged to 50 V, 470 µF via 100 kΩ', state: { solveFor: 't', target: 'threshold', r: 100e3, c: 470e-6, cUnit: 'µF', v0: 400, vInf: 0, vth: 50, tUnit: 's' } },
    { id: 'tau-c', label: 'C for τ = 1 ms with R = 4.7 kΩ (E12)', state: { solveFor: 'c', target: 'tau', r: 4.7e3, tau: 1e-3, eseries: 'E12', v0: 0, vInf: 5, vth: 2.5 } },
    { id: 'v-at-t', label: 'Voltage after 3 τ (5 V step, 1 kΩ, 1 µF)', state: { solveFor: 'vth', r: 1e3, c: 1e-6, cUnit: 'µF', v0: 0, vInf: 5, t: 3e-3, tUnit: 'ms' } },
    { id: 'asymptote', label: 'Edge case: threshold at 99.9 % of the step', state: { solveFor: 't', target: 'threshold', r: 10e3, c: 100e-9, v0: 0, vInf: 5, vth: 4.995 } },
  ],
};
