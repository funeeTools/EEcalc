/** RCD clamp for a flyback's leakage inductance — calculator definition. DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { bracketE, eValues, nearestE, ratingFor } from '@/core/eseries';
import { si } from '@/core/units';
import { U_FREQ, U_IND, U_OHM, withDefault } from '@/core/unitsets';
import { type ClampInputs, type ClampOp, cForRipple, clampForR, clampOp, clampWave, rForClamp } from './model';

export type RcdSolve = 'r' | 'vclamp';

export interface RcdState {
  solveFor: RcdSolve;
  vinMax: number;
  vor: number;
  llk: number;
  llkUnit: string;
  ipk: number;
  fsw: number;
  fswUnit: string;
  pout: number;
  vclamp: number;
  r: number;
  rUnit: string;
  ripplePct: number;
  series: string;
  vdss: number;
  deratePct: number;
  vfD: number;
}

/** Defaults: the Flyback Converter page’s default design (36–72 V → 12 V, 2 A, 200 kHz, N = 2.356, L_lk = 0.5 µH). */
export const defaults = (): RcdState => ({
  solveFor: 'r',
  vinMax: 72,
  vor: 29.5,
  llk: 0.5e-6,
  llkUnit: 'µH',
  ipk: 2.52,
  fsw: 200e3,
  fswUnit: 'kHz',
  pout: 24,
  vclamp: 50,
  r: 3.9e3,
  rUnit: 'kΩ',
  ripplePct: 5,
  series: 'E24',
  vdss: 150,
  deratePct: 90,
  vfD: 1,
});

const U_KOHM = withDefault(U_OHM, 'kΩ');
const U_IND_U = withDefault(U_IND, 'µH');
const U_FREQ_K = withDefault(U_FREQ, 'kHz');

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Flyback operating point',
    note: 'Take these from the Flyback Converter page (worst case: V_in,min, full load for I_pk).',
    fields: [
      { kind: 'number', key: 'vinMax', symbol: 'V_in,max', label: 'Max DC input', unit: 'V', min: 0, max: 2000 },
      { kind: 'number', key: 'vor', symbol: 'V_OR', label: 'Reflected voltage', unit: 'V', min: 0.01, max: 2000, help: 'N·(V_out + V_F): the drain sits at V_in + V_OR while the secondary conducts.' },
      { kind: 'number', key: 'llk', symbol: 'L_lk', label: 'Leakage inductance', units: U_IND_U, unitKey: 'llkUnit', min: 1e-9, max: 0.1, help: 'Primary leakage, measured with the secondary windings shorted.' },
      { kind: 'number', key: 'ipk', symbol: 'I_pk', label: 'Peak primary current', unit: 'A', min: 1e-3, max: 1000, help: 'At the worst case for the clamp: lowest input and full load (or the current limit, for a fault-proof design).' },
      { kind: 'number', key: 'fsw', symbol: 'f_sw', label: 'Switching frequency', units: U_FREQ_K, unitKey: 'fswUnit', unitFamily: 'none', min: 1, max: 10e6 },
      { kind: 'number', key: 'pout', symbol: 'P_out', label: 'Output power', unit: 'W', min: 1e-3, max: 1e5, help: 'Only used to express the clamp loss as an efficiency cost.' },
    ],
  },
  {
    kind: 'section',
    title: 'Clamp',
    fields: [
      { kind: 'number', key: 'vclamp', symbol: 'V_clamp', label: 'Clamp voltage', unit: 'V', min: 0.01, max: 1e7, solvable: true, help: 'Clamp-capacitor voltage above V_in. AN-4147 suggests about 2–2.5 × V_OR; lower wastes more, higher stresses the switch (V_DS = V_in,max + V_clamp).' },
      { kind: 'number', key: 'r', symbol: 'R_cl', label: 'Clamp resistor', units: U_KOHM, unitKey: 'rUnit', min: 1e-3, max: 1e9, solvable: true },
      { kind: 'number', key: 'ripplePct', symbol: 'ΔV/V', label: 'Clamp ripple', suffix: '%', min: 0.1, max: 50, help: 'Peak-to-peak ripple of the clamp capacitor voltage; 5–10 % is typical (AN-4147). Sets C.' },
      { kind: 'select', key: 'series', label: 'Part series', options: ['E12', 'E24', 'E48', 'E96'].map((v) => ({ value: v, label: v })) },
    ],
  },
  {
    kind: 'section',
    title: 'Parts',
    fields: [
      { kind: 'number', key: 'vdss', symbol: 'V_DSS', label: 'Switch rating', unit: 'V', min: 1, max: 5000 },
      { kind: 'number', key: 'deratePct', symbol: 'k_der', label: 'Allowed V_DS / V_DSS', suffix: '%', min: 10, max: 100, help: 'Highest clamped drain voltage you accept as a fraction of V_DSS (80–90 % is common, leaving room for ringing).' },
      { kind: 'number', key: 'vfD', symbol: 'V_F', label: 'Clamp diode drop', unit: 'V', min: 0, max: 5, help: 'Forward voltage of the clamp diode at I_pk (fast/ultrafast recovery types: 1–1.5 V).' },
    ],
  },
];

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;

export interface RcdDetails {
  op: ClampOp;
  c: number;
  vds: number;
  vclampMax: number;
  rE: number;
  opE: ClampOp;
  cE: number;
  state: RcdState;
}

export function compute(st: RcdState): CalcReport {
  for (const k of ['vinMax', 'vor', 'llk', 'ipk', 'fsw', 'pout', 'vclamp', 'r', 'ripplePct', 'vdss', 'deratePct', 'vfD'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!(st.vor > 0) || !(st.llk > 0) || !(st.ipk > 0) || !(st.fsw > 0)) throw new Error('V_OR, L_lk, I_pk and f_sw must be > 0.');
  if (!(st.ripplePct > 0)) throw new Error('Clamp ripple must be > 0.');
  if (st.vinMax < 0 || st.vfD < 0) throw new Error('V_in,max and V_F must be ≥ 0.');
  const s: RcdState = { ...st };
  const p: ClampInputs = { llk: s.llk, ipk: s.ipk, fsw: s.fsw, vor: s.vor };
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'power/rcd-clamp-snubber', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  if (s.solveFor === 'r') {
    // A typed V_OR at or above the clamp target is a genuine input error (harness 'error-after-edit' on V_OR ×10 is
    // legitimate: the user's numbers make the clamp impossible). Setting switches never reach it.
    if (!(s.vclamp > s.vor)) throw new Error(`The clamp voltage must exceed V_OR = ${si(s.vor, 'V', 4)}: at or below it the clamp diode would conduct the whole off-time and short the secondary’s reflected voltage.`);
    const r = rForClamp(p, s.vclamp);
    if (!(r >= 1e-3 && r <= 1e9)) {
      report.warnings.push(`R = ${si(r, 'Ω', 3)} is outside 1 mΩ – 1 GΩ.`);
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      report.results.push({ key: 'r', label: 'Clamp resistor', value: null, display: '—', primary: true, solved: true });
      return report;
    }
    s.r = r;
  } else {
    if (!(s.r > 0)) throw new Error('R must be > 0.');
    s.vclamp = clampForR(p, s.r);
    if (!(s.vclamp <= 1e7)) {
      report.warnings.push(`R = ${si(s.r, 'Ω', 3)} would let the clamp rise to ${si(s.vclamp, 'V', 3)}: far beyond any switch. Lower R.`);
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      report.results.push({ key: 'vclamp', label: 'Clamp voltage', value: null, display: '—', primary: true, solved: true });
      return report;
    }
  }
  const op = clampOp(p, s.vclamp, s.r);
  const ripple = s.ripplePct / 100;
  const c = cForRipple(s.r, s.fsw, ripple);
  const vds = s.vinMax + s.vclamp;
  const vLimit = (s.deratePct / 100) * s.vdss;
  const vclampMax = vLimit - s.vinMax;
  const kc = s.vclamp / s.vor;
  const iDavg = op.iDavg;
  const pD = s.vfD * iDavg;
  // As built: nearest preferred R, and the next preferred C at or above the computed value (less ripple)
  const rE = nearestE(s.r, s.series);
  const opE = clampOp(p, clampForR(p, rE), rE);
  const cE = bracketE('E12', c)[1]; // capacitors: E12 is what is stocked
  const rRating = ratingFor(2 * op.p);

  // ── checks
  if (vds > s.vdss) warnings.push(`Clamped drain peak ${si(vds, 'V', 4)} exceeds V_DSS = ${si(s.vdss, 'V', 3)}: the switch will avalanche. Lower V_clamp (more clamp loss) or use a higher-voltage switch.`);
  else if (vds > vLimit) warnings.push(`Clamped drain peak ${si(vds, 'V', 4)} is ${pct(vds / s.vdss, 0)} of V_DSS, above the ${s.deratePct} % allowed: keep V_clamp ≤ ${si(vclampMax, 'V', 3)}.`);
  if (kc < 1.3) warnings.push(`V_clamp is only ${kc.toFixed(2)} × V_OR: the clamp loss is ${op.factor.toFixed(1)}× the bare leakage energy, and the clamp starts to take current meant for the secondary. AN-4147 uses about 2–2.5 × V_OR; raise V_clamp if the switch allows.`);
  if (op.p > 0.05 * s.pout) warnings.push(`Clamp loss ${si(op.p, 'W', 3)} is ${pct(op.p / s.pout)} of P_out: reduce the leakage (interleaved or sandwiched windings), or consider an active clamp or a TVS-diode clamp.`);
  if (op.ts > 0.5 / s.fsw) warnings.push(`Leakage reset time ${si(op.ts, 's', 3)} is ${op.ts * s.fsw >= 1 ? 'longer than the period: the clamp never stops conducting and these results do not apply' : 'over half the period: the reset may not finish before the next turn-on'}. Raise V_clamp or reduce L_lk.`);
  if (ripple > 0.1) notes.push(`Clamp ripple ${s.ripplePct.toPrecision(3)} % is above the usual 5–10 %: the peak drain voltage rises by about half the ripple (${si((ripple * s.vclamp) / 2, 'V', 3)}).`);
  if (vclampMax <= s.vor) warnings.push(`The switch rating leaves no room for a clamp: V_in,max + V_OR = ${si(s.vinMax + s.vor, 'V', 4)} already reaches ${s.deratePct} % of V_DSS. Use a higher-voltage switch or a lower N.`);

  // ── results
  const it = (key: string, label: string, value: number | string, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const rRes = it('r', 'Clamp resistor', s.r, 'Ω', si(s.r, 'Ω', 4), { symbol: 'R_cl', solved: s.solveFor === 'r', primary: true, note: `${s.series}: ${si(rE, 'Ω', 3)} → V_clamp ${si(opE.vclamp, 'V', 3)}` });
  const vRes = it('vclamp', 'Clamp voltage', s.vclamp, 'V', si(s.vclamp, 'V', 4), { symbol: 'V_clamp', solved: s.solveFor === 'vclamp', primary: true, note: `${kc.toFixed(2)} × V_OR · max ${si(vclampMax, 'V', 3)} for the rating` });
  const res: ResultItem[] = s.solveFor === 'r' ? [rRes, vRes] : [vRes, rRes];
  res.push(
    it('c', 'Clamp capacitor', c, 'F', si(c, 'F', 3), { symbol: 'C_cl', primary: true, note: `E12 ≥ ${si(cE, 'F', 3)} · rated ≥ ${si(s.vclamp * (1 + ripple / 2), 'V', 3)}` }),
    it('p', 'Clamp dissipation', op.p, 'W', si(op.p, 'W', 3), { symbol: 'P_R', primary: true, tone: op.p > 0.05 * s.pout ? 'warn' : '', note: `${pct(op.p / s.pout, 2)} of P_out · R rated ≥ ${rRating ? si(rRating, 'W', 3) : si(2 * op.p, 'W', 3)}` }),
    it('vds', 'Peak drain voltage', vds, 'V', si(vds, 'V', 4), { symbol: 'V_DS,pk', primary: true, tone: vds > s.vdss ? 'fail' : vds > vLimit ? 'warn' : '', note: `${pct(vds / s.vdss, 0)} of V_DSS ${si(s.vdss, 'V', 3)}` }),
  );
  const gC = 'Clamp';
  res.push(
    it('pLeak', 'Leakage energy rate', op.pLeak, 'W', si(op.pLeak, 'W', 3), { symbol: '½L_lkI²f', group: gC, note: 'what the leakage alone stores' }),
    it('factor', 'Reflected-voltage factor', op.factor, '', op.factor.toFixed(3), { symbol: 'V_cl/(V_cl − V_OR)', group: gC, note: 'clamp loss / leakage energy' }),
    it('ts', 'Leakage reset time', op.ts, 's', si(op.ts, 's', 3), { symbol: 't_s', group: gC, note: `${pct(op.ts * s.fsw)} of the period` }),
    it('dV', 'Clamp ripple (p-p)', ripple * s.vclamp, 'V', si(ripple * s.vclamp, 'V', 3), { symbol: 'ΔV_cl', group: gC }),
    it('tau', 'Time constant R·C', s.r * c, 's', si(s.r * c, 's', 3), { symbol: 'τ', group: gC, note: `${(s.r * c * s.fsw).toFixed(1)} periods` }),
    it('effCost', 'Efficiency cost', op.p / (s.pout + op.p), '', pct(op.p / (s.pout + op.p), 2), { symbol: 'Δη', group: gC, note: 'P_R/(P_out + P_R), other losses aside' }),
  );
  const gD = 'Clamp diode';
  res.push(
    it('vrrm', 'Reverse voltage', vds, 'V', si(vds, 'V', 4), { symbol: 'V_RRM ≥', group: gD, note: 'V_in,max + V_clamp: same as the drain' }),
    it('idPk', 'Peak current', s.ipk, 'A', si(s.ipk, 'A', 3), { symbol: 'I_D,pk', group: gD }),
    it('idAvg', 'Average current', iDavg, 'A', si(iDavg, 'A', 3), { symbol: 'I_D,avg', group: gD, note: '½·I_pk·t_s·f_sw' }),
    it('pD', 'Conduction loss', pD, 'W', si(pD, 'W', 3), { symbol: 'P_D', group: gD, note: 'V_F·I_D,avg; reverse recovery extra' }),
  );
  const gS = 'Switch';
  res.push(
    it('vclampMax', 'Highest V_clamp allowed', vclampMax, 'V', si(vclampMax, 'V', 4), { group: gS, tone: s.vclamp > vclampMax ? 'warn' : '', note: `${s.deratePct} % of V_DSS − V_in,max` }),
    it('vPlateau', 'Drain plateau', s.vinMax + s.vor, 'V', si(s.vinMax + s.vor, 'V', 4), { group: gS, note: 'V_in,max + V_OR after the reset' }),
  );
  report.results = res;
  report.tables = [candidates(s, p, vLimit, ripple)];
  report.summary = `V_OR ${si(s.vor, 'V', 3)} · L_lk ${si(s.llk, 'H', 3)} · I_pk ${si(s.ipk, 'A', 3)} · f_sw ${si(s.fsw, 'Hz', 3)} · clamp at ${kc.toFixed(2)} × V_OR`;
  notes.push(
    'Clamp loss per AN-4147: the leakage energy times V_clamp/(V_clamp − V_OR), all dissipated in R (V_clamp²/R).',
    'I_pk, V_OR and L_lk are taken as constant; size at the worst case (lowest input, full load or current limit). Drain ringing after the reset and diode reverse recovery are not included.',
  );
  report.details = { op, c, vds, vclampMax, rE, opE, cE, state: s } satisfies RcdDetails;
  report.graphs = graphs(s, p, op, c, vLimit);
  return report;
}

function candidates(s: RcdState, p: ClampInputs, vLimit: number, ripple: number): TableSpec {
  // preferred R values around the design: two below and two above (or the exact one)
  const all = eValues(s.series, s.r / 3, s.r * 3);
  const below = all.filter((v) => v <= s.r * (1 + 1e-9)).slice(-3);
  const above = all.filter((v) => v > s.r * (1 + 1e-9)).slice(0, 3);
  const rs = [...below, ...above];
  const rows = rs.map((r) => {
    const o = clampOp(p, clampForR(p, r), r);
    const vds = s.vinMax + o.vclamp;
    return { r, vclamp: o.vclamp, kc: o.vclamp / s.vor, vds, p: o.p, c: cForRipple(r, s.fsw, ripple) };
  });
  return {
    id: 'candidates',
    title: `Preferred resistors (${s.series})`,
    columns: [
      { key: 'r', label: 'R_cl', unit: 'Ω' },
      { key: 'vclamp', label: 'V_clamp', unit: 'V' },
      { key: 'kc', label: 'V_clamp/V_OR' },
      { key: 'vds', label: 'V_DS,pk', unit: 'V' },
      { key: 'p', label: 'P_R', unit: 'W' },
      { key: 'c', label: 'C for ripple', unit: 'F' },
    ],
    rows,
    display: rows.map((x) => ({ r: si(x.r, 'Ω', 3), vclamp: si(x.vclamp, 'V', 4), kc: x.kc.toFixed(2), vds: si(x.vds, 'V', 4), p: si(x.p, 'W', 3), c: si(x.c, 'F', 3) })),
    rowTones: rows.map((x) => (x.vds > vLimit ? 'fail' : x.kc < 1.3 || x.p > 0.05 * s.pout ? 'warn' : 'pass')),
    note: `Fail: V_DS,pk above ${s.deratePct} % of V_DSS (${si(vLimit, 'V', 3)}). Warn: V_clamp < 1.3 × V_OR or loss > 5 % of P_out. A larger R raises V_clamp and lowers the loss.`,
  };
}

function graphs(s: RcdState, p: ClampInputs, op: ClampOp, c: number, vLimit: number): GraphSpec[] {
  const hiV = Math.max(s.vclamp * 1.6, vLimit - s.vinMax, 3 * s.vor);
  const n = 140;
  const v0 = Math.min(1.2 * s.vor, s.vor + 0.5 * (s.vclamp - s.vor)); // start where the loss is ≤ 6× the leakage energy
  const vs = Array.from({ length: n }, (_, k) => v0 + ((hiV - v0) * k) / (n - 1));
  const sweep: GraphSpec = {
    id: 'loss-vs-vclamp',
    title: 'Loss vs V_clamp',
    subtitle: 'Higher clamp voltage: less loss, more drain stress',
    x: { label: 'Clamp voltage V_clamp', unit: 'V' },
    y: [
      { id: 'p', label: 'Clamp loss', unit: 'W', includeZero: true },
      { id: 'v', label: 'Peak drain voltage', unit: 'V', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'P_R', x: vs, y: vs.map((v) => clampOp(p, v, 0).p), axis: 'p', width: 2.2 },
      { label: 'V_DS,pk', x: vs, y: vs.map((v) => s.vinMax + v), axis: 'v', color: '#c47b17', width: 1.6, dash: [5, 3] },
    ],
    hlines: [
      { value: s.vdss, label: `V_DSS ${si(s.vdss, 'V', 3)}`, axis: 'v', color: '#8b1e1e', dash: [5, 4] },
      { value: 0.5 * s.llk * s.ipk * s.ipk * s.fsw, label: 'leakage energy ½·L·I²·f', axis: 'p', color: '#9a8f7a', dash: [2, 3] },
    ],
    vlines: [{ value: s.vclamp, label: `V_clamp ${si(s.vclamp, 'V', 3)}` }, { value: 2 * s.vor, label: '2·V_OR', color: '#9a8f7a', dash: [3, 3] }],
    markers: [{ x: s.vclamp, y: op.p, axis: 'p', label: si(op.p, 'W', 3) }],
  };
  // The waveform needs the reset to end within the period (warned otherwise); drop it when it does not.
  if (!(op.ts < 0.999 / s.fsw)) return [sweep];
  const w = clampWave(p, op, c);
  const wave: GraphSpec = {
    id: 'clamp-wave',
    title: 'Clamp waveform',
    subtitle: 'One period after turn-off: the diode current charges C, R discharges it',
    x: { label: 'Time after turn-off', unit: 's' },
    y: [
      { id: 'v', label: 'Clamp capacitor voltage', unit: 'V' },
      { id: 'i', label: 'Diode current', unit: 'A', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'v_C', x: w.t, y: w.v, axis: 'v', width: 2.2 },
      { label: 'i_D', x: w.t, y: w.i, axis: 'i', color: '#c47b17', width: 1.6 },
    ],
    hlines: [{ value: s.vclamp, label: `V_clamp ${si(s.vclamp, 'V', 3)}`, axis: 'v', color: '#9a8f7a', dash: [4, 3] }],
    legend: 'below',
  };
  return [sweep, wave];
}

export const def: CalcDef<RcdState> = {
  id: 'power/rcd-clamp-snubber',
  version: '0.1.0',
  method:
    'RCD clamp for flyback leakage per Fairchild AN-4147 (Choi): P = ½·L_lk·I_pk²·f·V_clamp/(V_clamp − V_OR), R = V_clamp²/P, C = V_clamp/(ΔV·R·f), V_DS = V_in,max + V_clamp; the same loss and reset-time functions as the Flyback Converter page. R and V_clamp are exact inverses (quadratic root).',
  fields,
  defaults,
  solve: {
    default: 'r',
    analysis: 'vclamp',
    options: [
      { key: 'r', label: 'Clamp resistor R for a clamp voltage' },
      { key: 'vclamp', label: 'Clamp voltage for a given R (analysis)' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '36–72 V → 12 V, 24 W telecom flyback (Flyback page default): R for a 50 V clamp', state: defaults() },
    {
      id: 'offline',
      label: 'Off-line 375 V DC max, 650 V switch, L_lk 30 µH, 65 kHz: R for V_clamp = 2 × V_OR',
      state: { solveFor: 'r', vinMax: 375, vor: 98, llk: 30e-6, llkUnit: 'µH', ipk: 0.39, fsw: 65e3, fswUnit: 'kHz', pout: 12, vclamp: 196, rUnit: 'kΩ', ripplePct: 5, series: 'E24', vdss: 650, deratePct: 90, vfD: 1.2 },
    },
    {
      id: 'given-r',
      label: 'Check a fitted 10 kΩ on the 24 W telecom design (analysis)',
      state: { solveFor: 'vclamp', vinMax: 72, vor: 29.5, llk: 0.5e-6, llkUnit: 'µH', ipk: 2.52, fsw: 200e3, fswUnit: 'kHz', pout: 24, r: 10e3, rUnit: 'kΩ', ripplePct: 5, series: 'E24', vdss: 150, deratePct: 90, vfD: 1 },
    },
    {
      id: 'tight',
      label: 'Tight clamp: V_clamp = 1.2 × V_OR to save a 100 V switch',
      state: { solveFor: 'r', vinMax: 60, vor: 25, llk: 1e-6, llkUnit: 'µH', ipk: 3, fsw: 150e3, fswUnit: 'kHz', pout: 20, vclamp: 30, rUnit: 'kΩ', ripplePct: 5, series: 'E24', vdss: 100, deratePct: 90, vfD: 1 },
    },
  ],
};
