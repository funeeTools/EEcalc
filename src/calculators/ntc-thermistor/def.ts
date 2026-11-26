/** NTC Thermistor — calculator definition (β / Steinhart–Hart, divider readout, self-heating). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { nearestE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM } from '@/core/unitsets';
import { type Divider, type Ntc, type ShCoef, K0, shTurning, betaBetween, betaModel, dVdT, fitSH, lnDerivs, nonlinearityK, rFromV, rsInflection, selfHeatPower, shModel, vOut } from './model';

export type NtcModel = 'beta' | 'sh' | 'shfit';
/** rt: R and V_out at T · temp: T from R · tempFromV: T (and R) from V_out */
export type NtcSolve = 'rt' | 'temp' | 'tempFromV';

export interface NtcState {
  solveFor: NtcSolve;
  model: NtcModel;
  r0: number;
  r0Unit: string;
  t0: number;
  beta: number;
  shA: number;
  shB: number;
  shC: number;
  fr1: number;
  fr1Unit: string;
  ft1: number;
  fr2: number;
  fr2Unit: string;
  ft2: number;
  fr3: number;
  fr3Unit: string;
  ft3: number;
  /** Thermistor temperature, °C */
  temp: number;
  r: number;
  rUnit: string;
  vout: number;
  divider: Divider;
  vs: number;
  rs: number;
  rsUnit: string;
  adcBits: number;
  tLo: number;
  tHi: number;
  /** Dissipation constant, W/K */
  delta: number;
  deltaUnit: string;
  eseries: 'E12' | 'E24' | 'E96';
}

export const defaults = (): NtcState => ({
  solveFor: 'rt',
  model: 'beta',
  r0: 10e3,
  r0Unit: 'kΩ',
  t0: 25,
  beta: 3950,
  shA: 1.129148e-3,
  shB: 2.34125e-4,
  shC: 8.76741e-8,
  fr1: 32650,
  fr1Unit: 'kΩ',
  ft1: 0,
  fr2: 10000,
  fr2Unit: 'kΩ',
  ft2: 25,
  fr3: 3602,
  fr3Unit: 'kΩ',
  ft3: 50,
  temp: 25,
  r: 10e3,
  rUnit: 'kΩ',
  vout: 1.65,
  divider: 'low',
  vs: 3.3,
  rs: 10e3,
  rsUnit: 'kΩ',
  adcBits: 12,
  tLo: 0,
  tHi: 100,
  delta: 1.5e-3,
  deltaUnit: 'mW/K',
  eseries: 'E24',
});

/** Thermistor resistance: very cold NTCs reach the GΩ range (10 kΩ, β 3950: ≈ 140 MΩ at −100 °C, ≈ 17 GΩ at −130 °C). */
const U_RT: Record<string, number> = { ...U_OHM, 'GΩ': 1e9 };
const U_DISS: Record<string, number> = { 'mW/K': 1e-3, 'W/K': 1 };
const T_MIN = -K0;
const given = (root: any): 'temp' | 'r' | 'vout' => (root.solveFor === 'temp' ? 'r' : root.solveFor === 'tempFromV' ? 'vout' : 'temp');

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Thermistor model',
    fields: [
      {
        kind: 'select', key: 'model', label: 'Model',
        options: [
          { value: 'beta', label: 'β (B-value)' },
          { value: 'sh', label: 'Steinhart–Hart A, B, C' },
          { value: 'shfit', label: 'Steinhart–Hart from 3 points' },
        ],
        help: 'β: two data-sheet numbers, good to about ±1 K over 0–100 °C. Steinhart–Hart: three coefficients, typically about ±0.01–0.02 K over a 100 K span.',
      },
      { kind: 'number', key: 'r0', symbol: 'R₀', label: 'Resistance at T₀', units: U_OHM, unitKey: 'r0Unit', min: 1e-3, max: 1e12, visible: (s) => s.model === 'beta', help: 'Nominal resistance at the reference temperature T₀ (usually 25 °C, i.e. R₂₅).' },
      { kind: 'number', key: 't0', symbol: 'T₀', label: 'Reference temperature', suffix: '°C', min: -200, max: 500, visible: (s) => s.model === 'beta' },
      { kind: 'number', key: 'beta', symbol: 'β', label: 'B-value', suffix: 'K', min: 100, max: 20000, visible: (s) => s.model === 'beta', help: 'Data sheets give B between two temperatures, e.g. B25/50 or B25/85. Use the one whose range covers your application.' },
      { kind: 'number', key: 'shA', symbol: 'A', label: 'Coefficient A', min: -1, max: 1, visible: (s) => s.model === 'sh', help: '1/T = A + B·ln R + C·(ln R)³, T in kelvin, R in ohms.' },
      { kind: 'number', key: 'shB', symbol: 'B', label: 'Coefficient B', min: -1, max: 1, visible: (s) => s.model === 'sh' },
      { kind: 'number', key: 'shC', symbol: 'C', label: 'Coefficient C', min: -1, max: 1, visible: (s) => s.model === 'sh' },
      { kind: 'number', key: 'fr1', symbol: 'R₁', label: 'Resistance at T₁', units: U_OHM, unitKey: 'fr1Unit', min: 1e-3, max: 1e12, visible: (s) => s.model === 'shfit' },
      { kind: 'number', key: 'ft1', symbol: 'T₁', label: 'Point 1 temperature', suffix: '°C', min: -200, max: 500, visible: (s) => s.model === 'shfit' },
      { kind: 'number', key: 'fr2', symbol: 'R₂', label: 'Resistance at T₂', units: U_OHM, unitKey: 'fr2Unit', min: 1e-3, max: 1e12, visible: (s) => s.model === 'shfit' },
      { kind: 'number', key: 'ft2', symbol: 'T₂', label: 'Point 2 temperature', suffix: '°C', min: -200, max: 500, visible: (s) => s.model === 'shfit' },
      { kind: 'number', key: 'fr3', symbol: 'R₃', label: 'Resistance at T₃', units: U_OHM, unitKey: 'fr3Unit', min: 1e-3, max: 1e12, visible: (s) => s.model === 'shfit' },
      { kind: 'number', key: 'ft3', symbol: 'T₃', label: 'Point 3 temperature', suffix: '°C', min: -200, max: 500, visible: (s) => s.model === 'shfit', help: 'Spread the points over the working range (e.g. its ends and middle) from the data-sheet R–T table or your own calibration.' },
    ],
  },
  {
    kind: 'section',
    title: 'Operating point',
    note: 'Give one of T, R or V_out (click ◎ on a green value to type it); the other two are calculated.',
    fields: [
      { kind: 'number', key: 'temp', symbol: 'T', label: 'Temperature', suffix: '°C', min: T_MIN, max: 1000, solvable: true, solvedWhen: (_s, root) => given(root) !== 'temp', onSolve: (_s, root) => (root.solveFor = 'temp'), onUnsolve: (_s, root) => (root.solveFor = 'rt'), help: 'Thermistor body temperature.' },
      { kind: 'number', key: 'r', symbol: 'R_T', label: 'Resistance', units: U_RT, unitKey: 'rUnit', min: 1e-3, max: 1e13, solvable: true, solvedWhen: (_s, root) => given(root) !== 'r', onSolve: (_s, root) => (root.solveFor = 'rt'), onUnsolve: (_s, root) => (root.solveFor = 'temp'), help: 'Measured thermistor resistance.' },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Divider output', unit: 'V', min: 0, max: 1000, solvable: true, solvedWhen: (_s, root) => given(root) !== 'vout', onSolve: (_s, root) => (root.solveFor = 'rt'), onUnsolve: (_s, root) => (root.solveFor = 'tempFromV'), help: 'Voltage read by the ADC. Type it to get the temperature.' },
    ],
  },
  {
    kind: 'section',
    title: 'Divider readout',
    fields: [
      {
        kind: 'select', key: 'divider', label: 'NTC position',
        options: [
          { value: 'low', label: 'NTC to ground (V falls with T)' },
          { value: 'high', label: 'NTC to supply (V rises with T)' },
        ],
      },
      { kind: 'number', key: 'vs', symbol: 'V_S', label: 'Divider supply', unit: 'V', min: 1e-3, max: 1000, help: 'Use the ADC reference voltage for a ratiometric reading (then V_S drift cancels).' },
      { kind: 'number', key: 'rs', symbol: 'R_S', label: 'Series resistor', units: U_OHM, unitKey: 'rsUnit', min: 1e-3, max: 1e12, help: 'Fixed resistor in the divider. See the Tables tab for the best value over T_lo…T_hi.' },
      { kind: 'number', key: 'adcBits', symbol: 'N', label: 'ADC resolution', suffix: 'bit', integer: true, min: 0, max: 24, zeroHint: 'none', help: 'Ratiometric ADC (reference = V_S). 0 = no ADC.' },
    ],
  },
  {
    kind: 'section',
    title: 'Range & self-heating',
    collapsed: true,
    fields: [
      { kind: 'number', key: 'tLo', symbol: 'T_lo', label: 'Range low end', suffix: '°C', min: -200, max: 500, help: 'Working range used to pick the series resistor and for the plots and R–T table.' },
      { kind: 'number', key: 'tHi', symbol: 'T_hi', label: 'Range high end', suffix: '°C', min: -200, max: 500 },
      { kind: 'number', key: 'delta', symbol: 'δ', label: 'Dissipation constant', units: U_DISS, unitKey: 'deltaUnit', min: 1e-6, max: 10, help: 'Power that raises the thermistor 1 K above ambient (data sheet, still air). Typically about 1 mW/K for 0402–0603 chips, 1.5–3 mW/K for small beads and more for leaded discs.' },
      { kind: 'select', key: 'eseries', label: 'Resistor series', options: ['E12', 'E24', 'E96'] },
    ],
  },
];

const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const fmtC = (c: number) => `${c.toFixed(Math.abs(c) < 100 ? 2 : 1)} °C`;
const fmtR = (r: number) => si(r, 'Ω', 4);

function buildModel(s: NtcState, warnings: string[], details: Record<string, unknown>): { n: Ntc; coef?: ShCoef; fitRange?: [number, number] } {
  if (s.model === 'beta') {
    if (!(s.r0 > 0) || !(s.beta > 0) || !(s.t0 > T_MIN)) throw new Error('R₀ and β must be > 0 and T₀ above absolute zero.');
    return { n: betaModel(s.r0, s.t0 + K0, s.beta) };
  }
  if (s.model === 'sh') {
    if (!finite(s.shA) || !finite(s.shB) || !finite(s.shC)) throw new Error('Enter finite Steinhart–Hart coefficients.');
    if (!(s.shB > 0)) throw new Error('Coefficient B must be > 0 for an NTC (resistance falling with temperature).');
    const coef = { a: s.shA, b: s.shB, c: s.shC };
    return { n: shModel(coef), coef };
  }
  const pts = [
    { r: s.fr1, tC: s.ft1 },
    { r: s.fr2, tC: s.ft2 },
    { r: s.fr3, tC: s.ft3 },
  ];
  if (pts.some((p) => !(p.r > 0) || !(p.tC > T_MIN))) throw new Error('Fit points need R > 0 and T above absolute zero.');
  const sorted = [...pts].sort((a, b) => a.tC - b.tC);
  if (sorted[0].tC === sorted[1].tC || sorted[1].tC === sorted[2].tC) throw new Error('The three fit points need three different temperatures.');
  if (!(sorted[0].r > sorted[1].r && sorted[1].r > sorted[2].r)) throw new Error('For an NTC the resistance must fall as temperature rises: check the fit points.');
  const k = fitSH(pts.map((p) => ({ r: p.r, tK: p.tC + K0 })));
  details.shFit = k;
  if (!(k.b > 0)) warnings.push('The fitted B coefficient is not positive: the three points are inconsistent with an NTC curve. Check them against the data-sheet table.');
  return { n: shModel(k), coef: k, fitRange: [sorted[0].tC, sorted[2].tC] };
}

export function compute(st: NtcState): CalcReport {
  const s: NtcState = { ...st };
  for (const k of ['temp', 'r', 'vout', 'vs', 'rs', 'adcBits', 'tLo', 'tHi', 'delta'] as const) if (!finite(s[k])) throw new Error(`${k} must be a finite number.`);
  if (!(s.vs > 0) || !(s.rs > 0) || !(s.delta > 0)) throw new Error('V_S, R_S and δ must be > 0.');
  if (!(s.tHi > s.tLo)) throw new Error('The range high end must be above the low end.');
  const warnings: string[] = [];
  const notes: string[] = [];
  const details: Record<string, unknown> = {};
  const { n, coef, fitRange } = buildModel(s, warnings, details);
  // C < 0: the Steinhart–Hart curve turns back at R_t; below T_t it describes no resistance.
  const turn = coef ? shTurning(coef) : null;
  const turnText = turn ? `these coefficients (C < 0) turn back at R_t = ${fmtR(Math.exp(turn.lnR))}, T_t = ${fmtC(turn.tK - K0)}` : '';
  if (turn) details.turning = { r: Math.exp(turn.lnR), tC: turn.tK - K0 };
  if (turn) (turn.tK - K0 > Math.min(s.tLo, s.temp) - 30 ? warnings : notes).push(`Steinhart–Hart with C < 0: ${turnText}. The curve is only valid well above T_t — usually a sign that the three points are inconsistent.`);

  // ── operating point from whichever of T, R, V_out is given
  const g = given(s);
  let tK: number;
  if (g === 'temp') {
    if (!(s.temp > T_MIN)) throw new Error('Temperature must be above absolute zero.');
    tK = s.temp + K0;
    s.r = n.r(tK);
    if (!(s.r > 0) || !Number.isFinite(s.r)) throw new Error(turn && tK <= turn.tK ? `T = ${fmtC(s.temp)} is beyond the model’s turning point: ${turnText}, so they give no resistance below T_t. Fit with points that cover this temperature.` : `The model gives no resistance at ${fmtC(s.temp)}: check the coefficients.`);
  } else {
    if (g === 'vout') {
      if (!(s.vout > 0 && s.vout < s.vs)) throw new Error(`V_out must lie strictly between 0 and V_S = ${si(s.vs, 'V')}.`);
      s.r = rFromV(s.vout, s.rs, s.vs, s.divider);
    }
    if (!(s.r > 0)) throw new Error('Resistance must be > 0.');
    tK = n.t(s.r);
    if (!(tK > 0) || !Number.isFinite(tK)) throw new Error(`R = ${fmtR(s.r)} is outside the model’s range (no physical temperature). Check R and the model inputs.`);
    s.temp = tK - K0;
    if (turn && Math.log(s.r) > turn.lnR) warnings.push(`R = ${fmtR(s.r)} lies beyond the model’s turning point (${turnText}): the temperature shown is on the non-physical branch of the curve.`);
  }
  if (g !== 'vout') s.vout = vOut(s.r, s.rs, s.vs, s.divider);

  // ── sensitivity, readout and self-heating
  const { d1 } = lnDerivs(n, tK);
  const alpha = d1; // (1/R)·dR/dT, 1/K
  const betaLocal = -d1 * tK * tK;
  const slope = dVdT(n, tK, s.rs, s.vs, s.divider);
  const p = selfHeatPower(s.r, s.rs, s.vs);
  const dT = p / s.delta;
  const i = s.vs / (s.r + s.rs);
  const lsb = s.adcBits > 0 ? s.vs / 2 ** s.adcBits : 0;
  const resK = lsb > 0 && slope !== 0 ? lsb / Math.abs(slope) : null;
  const code = s.adcBits > 0 ? Math.min(Math.round((s.vout / s.vs) * 2 ** s.adcBits), 2 ** s.adcBits - 1) : null;

  // ── series-resistor choice over the range
  const loK = s.tLo + K0;
  const hiK = s.tHi + K0;
  const rLo = n.r(loK);
  const rHi = n.r(hiK);
  const tmK = (loK + hiK) / 2;
  const rsSwing = Math.sqrt(rLo * rHi);
  const rsInfl = rsInflection(n, tmK);
  const rsMid = n.r(tmK);
  if (!(rLo > 0 && rHi > 0 && Number.isFinite(rLo) && Number.isFinite(rHi))) throw new Error(turn && loK <= turn.tK ? `T_lo = ${s.tLo} °C is beyond the model’s turning point: ${turnText}. Raise T_lo or refit with points covering the range.` : 'The model gives no resistance over the T_lo…T_hi range: check the range and coefficients.');

  // ── validity checks
  if (s.temp < -55 || s.temp > 150) warnings.push(`T = ${fmtC(s.temp)} is outside the −55…150 °C range of most epoxy-coated NTCs (glass-encapsulated types reach about 250–300 °C). Check the part’s data sheet.`);
  if (s.model === 'beta' && Math.abs(s.temp - s.t0) > 50) notes.push(`T is ${Math.abs(s.temp - s.t0).toFixed(0)} K from T₀: the β model drifts away from the real curve (often by 1–3 K at this distance). Use Steinhart–Hart or the data-sheet table for accuracy.`);
  if (fitRange && (s.temp < fitRange[0] - 10 || s.temp > fitRange[1] + 10)) warnings.push(`T = ${fmtC(s.temp)} is more than 10 K outside the fit points (${fitRange[0]}…${fitRange[1]} °C): the Steinhart–Hart fit is extrapolating. Fit with points that span the range you use.`);
  if (!(alpha < 0)) warnings.push('The model is not decreasing at this temperature — the coefficients do not describe an NTC here.');
  for (let k = 0; k <= 20; k++) {
    const t = loK + ((hiK - loK) * k) / 20;
    if (!(lnDerivs(n, t).d1 < 0)) {
      warnings.push('R(T) is not monotonic over T_lo…T_hi with these coefficients; temperatures computed from R are ambiguous there.');
      break;
    }
  }
  if (dT > 0.2) warnings.push(`Self-heating ΔT = ${dT.toFixed(dT < 1 ? 3 : 2)} K (${si(p, 'W', 3)} in the thermistor): the reading is that much high. Raise R_S, lower V_S, or power the divider only while sampling.`);
  const vFrac = s.vout / s.vs;
  if (vFrac < 0.05 || vFrac > 0.95) notes.push(`V_out is ${(vFrac * 100).toFixed(1)} % of V_S — near a rail, where the divider is insensitive. A series resistor near R_T at the temperatures of interest centres it.`);
  if (resK != null && resK > 0.5) notes.push(`One ADC step is ${resK.toFixed(2)} K here; oversample/average or pick R_S closer to R_T for finer steps.`);

  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const tItem = item('temp', 'Temperature', s.temp, '°C', fmtC(s.temp), { symbol: 'T', primary: true, solved: g !== 'temp', note: `${(tK).toFixed(2)} K` });
  const rItem = item('r', 'Thermistor resistance', s.r, 'Ω', fmtR(s.r), { symbol: 'R_T', primary: true, solved: g !== 'r', note: s.model === 'beta' ? `R/R₀ = ${(s.r / s.r0).toPrecision(4)} (R₀ at ${s.t0} °C)` : '' });
  const vItem = item('vout', 'Divider output', s.vout, 'V', si(s.vout, 'V', 4), { symbol: 'V_out', primary: true, solved: g !== 'vout', note: `${(vFrac * 100).toFixed(1)} % of V_S${code != null ? ` · ADC code ${code}` : ''}` });
  const primary = g === 'temp' ? [rItem, vItem, tItem] : g === 'r' ? [tItem, vItem, rItem] : [tItem, rItem, vItem];
  primary[2].primary = false;
  primary[2].group = 'Operating point';
  const results: ResultItem[] = [
    primary[0],
    primary[1],
    item('alpha', 'Temperature coefficient', alpha * 100, '%/K', `${(alpha * 100).toFixed(3)} %/K`, { symbol: 'α', primary: true, note: `(1/R)·dR/dT · local β = ${betaLocal.toFixed(0)} K` }),
    item('selfHeat', 'Self-heating error', dT, 'K', `${dT.toFixed(dT < 0.01 ? 4 : 3)} K`, { symbol: 'ΔT', primary: true, tone: dT > 0.2 ? 'warn' : '', note: `${si(p, 'W', 3)} / δ = ${si(s.delta, 'W/K', 3)}` }),
    primary[2],
    item('slope', 'Divider sensitivity', slope, 'V/K', `${si(slope, 'V', 4)}/K`, { symbol: 'dV/dT', group: 'Readout' }),
    item('current', 'Divider current', i, 'A', si(i, 'A', 3), { symbol: 'I', group: 'Readout' }),
    item('power', 'Thermistor power', p, 'W', si(p, 'W', 3), { symbol: 'P', group: 'Readout', note: `max ${si((s.vs * s.vs) / (4 * s.rs), 'W', 3)} when R_T = R_S` }),
  ];
  if (code != null) {
    results.push(
      item('adcCode', 'ADC code', code, '', `${code} of ${2 ** s.adcBits}`, { group: 'Readout', note: 'ratiometric, reference = V_S' }),
      item('adcRes', 'Temperature per LSB', resK, 'K', resK == null ? '—' : si(resK, 'K', 3), { group: 'Readout', note: `1 LSB = ${si(lsb, 'V', 3)}` }),
    );
  }
  const gm = 'Model';
  results.push(item('betaLocal', 'Local β at T', betaLocal, 'K', `${betaLocal.toFixed(1)} K`, { symbol: 'β_T', group: gm, note: '−T²·d(ln R)/dT' }));
  results.push(item('betaRange', `β over ${s.tLo}…${s.tHi} °C`, betaBetween(rLo, loK, rHi, hiK), 'K', `${betaBetween(rLo, loK, rHi, hiK).toFixed(1)} K`, { group: gm, note: 'two-point B-value of this curve' }));
  if (s.model !== 'beta') {
    const r25 = n.r(25 + K0);
    results.push(item('r25', 'Resistance at 25 °C', r25, 'Ω', fmtR(r25), { symbol: 'R₂₅', group: gm }));
  }
  if (details.shFit) {
    const k = details.shFit as { a: number; b: number; c: number };
    results.push(
      item('fitA', 'Fitted A', k.a, '', k.a.toExponential(6), { symbol: 'A', group: gm }),
      item('fitB', 'Fitted B', k.b, '', k.b.toExponential(6), { symbol: 'B', group: gm }),
      item('fitC', 'Fitted C', k.c, '', k.c.toExponential(6), { symbol: 'C', group: gm }),
    );
  }
  const gr = `Series resistor for ${s.tLo}…${s.tHi} °C`;
  const swing = (rs: number) => Math.abs(vOut(rLo, rs, s.vs, s.divider) - vOut(rHi, rs, s.vs, s.divider));
  const rsE = nearestE(rsSwing, s.eseries);
  results.push(
    item('rsSwing', 'Max-swing R_S = √(R_lo·R_hi)', rsSwing, 'Ω', fmtR(rsSwing), { symbol: 'R_S,opt', group: gr, note: `nearest ${s.eseries}: ${si(rsE, 'Ω', 3)} · swing ${si(swing(rsSwing), 'V', 3)}` }),
    item('swingNow', 'Swing with current R_S', swing(s.rs), 'V', `${si(swing(s.rs), 'V', 4)} (${((swing(s.rs) / swing(rsSwing)) * 100).toFixed(1)} % of max)`, { group: gr }),
    item('rsInfl', 'Linearity-optimal R_S (inflection at mid-range)', rsInfl, 'Ω', rsInfl == null ? '— (none)' : fmtR(rsInfl), { group: gr, note: s.model === 'beta' ? 'R(T_m)·(β − 2T_m)/(β + 2T_m)' : 'V″(T_m) = 0' }),
  );

  // ── tables
  const crit: [string, number | null][] = [
    ['Max swing √(R_lo·R_hi)', rsSwing],
    ['Inflection at mid-range', rsInfl],
    ['R(T_mid)', rsMid],
    ['Current R_S', s.rs],
  ];
  const rows: Record<string, number | string | null>[] = [];
  const disp: Record<string, string>[] = [];
  for (const [name, rs] of crit) {
    if (rs == null) continue;
    const e = nearestE(rs, s.eseries);
    const vL = vOut(rLo, rs, s.vs, s.divider);
    const vH = vOut(rHi, rs, s.vs, s.divider);
    const nl = nonlinearityK(n, loK, hiK, rs, s.vs, s.divider);
    rows.push({ criterion: name, rs, rsE: e, vLo: vL, vHi: vH, swing: Math.abs(vH - vL), nonlin: nl });
    disp.push({ criterion: name, rs: fmtR(rs), rsE: si(e, 'Ω', 3), vLo: si(vL, 'V', 4), vHi: si(vH, 'V', 4), swing: si(Math.abs(vH - vL), 'V', 4), nonlin: `${nl.toFixed(2)} K` });
  }
  const step = niceStep((s.tHi - s.tLo) / 20);
  const rt: Record<string, number | string | null>[] = [];
  const rtDisp: Record<string, string>[] = [];
  for (let t = Math.ceil(s.tLo / step) * step; t <= s.tHi + 1e-9; t += step) {
    const tk = t + K0;
    const r = n.r(tk);
    const v = vOut(r, s.rs, s.vs, s.divider);
    const sl = dVdT(n, tk, s.rs, s.vs, s.divider);
    const sh = selfHeatPower(r, s.rs, s.vs) / s.delta;
    rt.push({ t, r, v, slope: sl, selfHeat: sh, code: s.adcBits > 0 ? Math.round((v / s.vs) * 2 ** s.adcBits) : null });
    rtDisp.push({ t: `${+t.toFixed(3)} °C`, r: fmtR(r), v: si(v, 'V', 4), slope: `${si(sl, 'V', 3)}/K`, selfHeat: `${sh.toFixed(3)} K`, code: s.adcBits > 0 ? String(Math.min(Math.round((v / s.vs) * 2 ** s.adcBits), 2 ** s.adcBits - 1)) : '—' });
  }
  const tables: TableSpec[] = [
    {
      id: 'series-resistor',
      title: `Series resistor options (${s.tLo}…${s.tHi} °C, V_S = ${si(s.vs, 'V')})`,
      columns: [
        { key: 'criterion', label: 'Criterion', align: 'left' },
        { key: 'rs', label: 'R_S', unit: 'Ω' },
        { key: 'rsE', label: s.eseries, unit: 'Ω' },
        { key: 'vLo', label: 'V at T_lo', unit: 'V' },
        { key: 'vHi', label: 'V at T_hi', unit: 'V' },
        { key: 'swing', label: 'Swing', unit: 'V' },
        { key: 'nonlin', label: 'Non-linearity', unit: 'K' },
      ],
      rows,
      display: disp,
      note: 'Non-linearity: largest deviation of V(T) from the straight line through the range ends, in kelvin. Max swing gives the most volts per kelvin on average; the inflection choice gives the straightest curve around mid-range.',
    },
    {
      id: 'rt-table',
      title: 'R–T and readout table',
      columns: [
        { key: 't', label: 'T', unit: '°C' },
        { key: 'r', label: 'R_T', unit: 'Ω' },
        { key: 'v', label: 'V_out', unit: 'V' },
        { key: 'slope', label: 'dV/dT', unit: 'V/K' },
        { key: 'selfHeat', label: 'Self-heating', unit: 'K' },
        { key: 'code', label: 'ADC code' },
      ],
      rows: rt,
      display: rtDisp,
      note: 'With the current model, divider and R_S — e.g. for a firmware lookup table.',
    },
  ];

  notes.push(
    'T is the thermistor’s own temperature. With self-heating ΔT, the surrounding (ambient) temperature is about T − ΔT.',
    s.model === 'beta' ? 'β model: exact at T₀ and at the second temperature used to define β; in between and outside it is an approximation.' : 'Steinhart–Hart: typically within ±0.01–0.02 K of the real curve over a 100 K span when fitted to points covering it.',
    'Divider resistor tolerance and its temperature coefficient add directly to the error: a 1 % resistor shifts the reading by about 1 %/|α| ≈ 0.2–0.3 K near 25 °C.',
  );

  const summary = `${s.model === 'beta' ? `β = ${s.beta} K, R₀ = ${fmtR(s.r0)} at ${s.t0} °C` : 'Steinhart–Hart'} · ${fmtC(s.temp)} ↔ ${fmtR(s.r)} ↔ ${si(s.vout, 'V', 4)}`;
  return {
    calc: 'sensor/ntc-thermistor',
    ok: true,
    solveFor: s.solveFor,
    results,
    graphs: graphs(s, n, rsSwing, fitRange ? [s.ft1, s.ft2, s.ft3].map((t, k) => ({ t, r: [s.fr1, s.fr2, s.fr3][k] })) : []),
    tables,
    warnings,
    notes,
    summary,
    details: { ...details, tK, alpha, betaLocal, slope, power: p, selfHeat: dT, rsSwing, rsInflection: rsInfl, rLo, rHi },
  };
}

function niceStep(x: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 20, 25, 50, 100]) if (s >= x) return s;
  return 100;
}

function graphs(s: NtcState, n: Ntc, rsSwing: number, fitPts: { t: number; r: number }[]): GraphSpec[] {
  const lo = Math.max(Math.min(s.tLo, s.temp) - 10, -270);
  const hi = Math.max(s.tHi, s.temp) + 10;
  const N = 200;
  const ts = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const rs = ts.map((t) => n.r(t + K0));
  const ok = rs.map((r) => r > 0 && Number.isFinite(r));
  const tsOk = ts.filter((_, i) => ok[i]);
  const rsOk = rs.filter((_, i) => ok[i]);
  const ranges = [
    { value: s.tLo, label: 'T_lo', color: '#9a8f7a', dash: [3, 3] },
    { value: s.tHi, label: 'T_hi', color: '#9a8f7a', dash: [3, 3] },
  ];
  const rGraph: GraphSpec = {
    id: 'r-vs-t',
    title: 'Resistance vs temperature',
    x: { label: 'Temperature', unit: '°C' },
    y: [{ id: 'r', label: 'Resistance', unit: 'Ω', log: true }],
    series: [{ label: 'R(T)', x: tsOk, y: rsOk, axis: 'r', width: 2.2, color: '#1f4e5f' }],
    vlines: ranges,
    // a fit point at the operating temperature (T = 25 °C with the default 0/25/50 °C points) loses its
    // label, which would sit on top of the operating-point label
    markers: [{ x: s.temp, y: s.r, axis: 'r', label: `${fmtC(s.temp)}, ${si(s.r, 'Ω', 3)}`, color: '#c47b17' }, ...fitPts.map((p, k) => ({ x: p.t, y: p.r, axis: 'r', label: Math.abs(p.t - s.temp) < 0.03 * (hi - lo) ? undefined : `fit point ${k + 1}`, color: '#8b1e1e' }))],
  };
  if (s.model !== 'beta') {
    // β curve through the range ends, for comparison with the Steinhart–Hart curve
    const rLo = n.r(s.tLo + K0);
    const rHi = n.r(s.tHi + K0);
    const b = betaBetween(rLo, s.tLo + K0, rHi, s.tHi + K0);
    rGraph.series!.push({ label: `β = ${b.toFixed(0)} K through T_lo, T_hi`, x: tsOk, y: tsOk.map((t) => rLo * Math.exp(b * (1 / (t + K0) - 1 / (s.tLo + K0)))), axis: 'r', width: 1.2, color: '#9a8f7a', dash: [5, 3] });
  }
  const vGraph: GraphSpec = {
    id: 'vout-vs-t',
    title: 'Divider output vs temperature',
    subtitle: s.divider === 'low' ? 'NTC to ground, R_S to V_S' : 'NTC to V_S, R_S to ground',
    x: { label: 'Temperature', unit: '°C' },
    y: [
      { id: 'v', label: 'V_out', unit: 'V', includeZero: true, max: s.vs },
      { id: 'dv', label: '|dV/dT|', unit: 'V/K', side: 'right', includeZero: true },
    ],
    series: [
      { label: `R_S = ${si(s.rs, 'Ω', 3)}`, x: tsOk, y: rsOk.map((r) => vOut(r, s.rs, s.vs, s.divider)), axis: 'v', width: 2.2, color: '#1f4e5f' },
      ...(Math.abs(rsSwing / s.rs - 1) > 0.01 ? [{ label: `max-swing R_S = ${si(rsSwing, 'Ω', 3)}`, x: tsOk, y: rsOk.map((r) => vOut(r, rsSwing, s.vs, s.divider)), axis: 'v', width: 1.3, color: '#4f8a8b', dash: [5, 3] }] : []),
      { label: '|dV/dT|', x: tsOk, y: tsOk.map((t) => Math.abs(dVdT(n, t + K0, s.rs, s.vs, s.divider))), axis: 'dv', width: 1.2, color: '#c47b17', dash: [2, 2] },
    ],
    vlines: ranges,
    markers: [{ x: s.temp, y: s.vout, axis: 'v', label: `${si(s.vout, 'V', 3)}`, color: '#c47b17' }],
  };
  const shGraph: GraphSpec = {
    id: 'self-heating',
    title: 'Self-heating vs temperature',
    subtitle: `δ = ${si(s.delta, 'W/K', 3)}, V_S = ${si(s.vs, 'V', 3)}, R_S = ${si(s.rs, 'Ω', 3)}`,
    x: { label: 'Temperature', unit: '°C' },
    y: [
      { id: 'dt', label: 'Self-heating ΔT', unit: 'K', includeZero: true },
      { id: 'p', label: 'Power', unit: 'W', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'ΔT', x: tsOk, y: rsOk.map((r) => selfHeatPower(r, s.rs, s.vs) / s.delta), axis: 'dt', width: 2.2, color: '#8b1e1e' },
      { label: 'Power', x: tsOk, y: rsOk.map((r) => selfHeatPower(r, s.rs, s.vs)), axis: 'p', width: 1.2, color: '#9a8f7a', dash: [4, 3] },
    ],
    vlines: [{ value: s.temp, label: fmtC(s.temp), color: '#c47b17' }],
  };
  return [rGraph, vGraph, shGraph];
}

export const def: CalcDef<NtcState> = {
  id: 'sensor/ntc-thermistor',
  version: '0.1.0',
  method: 'β model (IEC 60539-1 B-value) or Steinhart–Hart 1/T = A + B·lnR + C·ln³R (Steinhart & Hart 1968; coefficients given or fitted exactly through three points, R(T) by Cardano); voltage-divider readout with ratiometric ADC; max-swing series resistor √(R_lo·R_hi) and inflection-point (linearity) resistor derived from V(T); self-heating ΔT = P/δ (IEC 60539-1 dissipation constant).',
  fields,
  defaults,
  solve: {
    default: 'rt',
    analysis: 'rt',
    options: [
      { key: 'rt', label: 'R and V_out at a temperature T' },
      { key: 'temp', label: 'Temperature from a measured resistance R' },
      { key: 'tempFromV', label: 'Temperature (and R) from the divider output V_out' },
    ],
  },
  compute,
  examples: [
    { id: 'beta-25', label: '10 kΩ, β 3950 at 25 °C, 10 kΩ pull-up, 3.3 V, 12-bit ADC', state: { solveFor: 'rt', model: 'beta', r0: 10e3, beta: 3950, t0: 25, temp: 25, rs: 10e3, vs: 3.3, adcBits: 12 } },
    { id: 'adc-reading', label: 'Temperature from a 0.82 V reading (same circuit)', state: { solveFor: 'tempFromV', model: 'beta', vout: 0.82 } },
    { id: 'sh-44006', label: 'Steinhart–Hart 10 kΩ curve: T at R = 3.0 kΩ', state: { solveFor: 'temp', model: 'sh', shA: 1.129148e-3, shB: 2.34125e-4, shC: 8.76741e-8, r: 3e3 } },
    { id: 'sh-fit', label: 'Fit A, B, C through 0 / 25 / 50 °C table points', state: { solveFor: 'rt', model: 'shfit', temp: 37 } },
    { id: 'hot-end', label: '3D-printer hot end: 100 kΩ β 4267 glass NTC, 4.7 kΩ pull-up, 200 °C', state: { solveFor: 'rt', model: 'beta', r0: 100e3, beta: 4267, temp: 200, tLo: 150, tHi: 260, vs: 5, rs: 4.7e3, adcBits: 10 } },
    { id: 'self-heat', label: 'Edge case: 1 kΩ pull-up at 5 V — self-heating', state: { solveFor: 'rt', model: 'beta', temp: 60, vs: 5, rs: 1e3, delta: 1e-3 } },
  ],
};
