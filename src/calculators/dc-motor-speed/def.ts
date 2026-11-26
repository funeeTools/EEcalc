/** DC motor speed — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { RPM, motorFigures, operatingPoint, torqueFor, voltageFor, windingResistance, type MotorParams } from './model';

export interface MotorState {
  solveFor: 'n' | 'v' | 'tL';
  v: number;
  r: number;
  kForm: 'k' | 'kv';
  k: number;
  kUnit: string;
  kv: number;
  kvUnit: string;
  i0: number;
  tL: number;
  tLUnit: string;
  n: number;
  nUnit: string;
  tW: number;
  iMax: number | null;
}

/** Torque / back-EMF constant: N·m/A and V·s/rad are the same SI unit. */
export const U_KT: Record<string, number> = { 'mN·m/A': 1e-3, 'N·m/A': 1, 'V/krpm': (60 / (2 * Math.PI)) / 1000, 'oz·in/A': 0.00706155181 };
/** krpm/V keeps a solved K_v readable for very small K_t (fitSolvedUnit picks the prefix). */
export const U_KV: Record<string, number> = { 'rpm/V': RPM, 'krpm/V': 1000 * RPM, 'rad/s/V': 1 };
export const U_TORQUE: Record<string, number> = { 'mN·m': 1e-3, 'N·m': 1, 'oz·in': 0.00706155181, 'kg·cm': 0.0980665 };
export const U_SPEED: Record<string, number> = { rpm: RPM, krpm: 1000 * RPM, 'rad/s': 1 };

/** maxon RE 40 Ø40 mm 150 W, 24 V winding, article 148867 (maxon catalogue data, values at 25 °C). */
export const defaults = (): MotorState => ({
  solveFor: 'n',
  v: 24,
  r: 0.299,
  kForm: 'k',
  k: 30.2e-3,
  kUnit: 'mN·m/A',
  kv: 1 / 30.2e-3,
  kvUnit: 'rpm/V',
  i0: 0.137,
  tL: 0.177,
  tLUnit: 'mN·m',
  n: 7000 * RPM,
  nUnit: 'rpm',
  tW: 25,
  iMax: 6,
});

const kGiven = (root: any) => root.kForm !== 'kv';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Motor (datasheet)',
    note: 'Give K_t or K_v (click ◎ on the green one to switch); the other is calculated.',
    fields: [
      { kind: 'number', key: 'r', symbol: 'R', label: 'Terminal resistance', unit: 'Ω', min: 1e-4, max: 1e5, help: 'Winding plus brush resistance between the terminals, as specified at 25 °C. The winding temperature below scales it.' },
      {
        kind: 'number', key: 'k', symbol: 'K_t', label: 'Torque constant', units: U_KT, unitKey: 'kUnit', min: 1e-6, max: 100, solvable: true,
        solvedWhen: (_s, root) => !kGiven(root), onSolve: (_s, root) => (root.kForm = 'kv'), onUnsolve: (_s, root) => (root.kForm = 'k'),
        help: 'In SI units the torque constant (N·m/A) equals the back-EMF constant (V·s/rad). A back-EMF constant in V/krpm can be typed directly by choosing that unit.',
      },
      {
        kind: 'number', key: 'kv', symbol: 'K_v', label: 'Speed constant', units: U_KV, unitKey: 'kvUnit', min: 1e-3, max: 1e7, solvable: true,
        solvedWhen: (_s, root) => kGiven(root), onSolve: (_s, root) => (root.kForm = 'k'), onUnsolve: (_s, root) => (root.kForm = 'kv'),
        help: 'Ideal no-load speed per volt, K_v = 1/K_t (60/(2π·K_t) rpm/V). Hobby motors are usually rated this way.',
      },
      { kind: 'number', key: 'i0', symbol: 'I₀', label: 'No-load current', unit: 'A', min: 0, max: 1e3, help: 'Current drawn with nothing on the shaft. It stands for friction and iron losses, modelled as a constant torque K·I₀. 0 = ideal motor.' },
    ],
  },
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'v', symbol: 'V', label: 'Supply voltage', unit: 'V', min: 0, max: 1e4, solvable: true, help: 'Average voltage at the motor terminals (for PWM: duty × supply, when the current is continuous).' },
      { kind: 'number', key: 'tL', symbol: 'T_L', label: 'Load torque', units: U_TORQUE, unitKey: 'tLUnit', min: -1e4, max: 1e4, solvable: true, help: 'Torque at the shaft. When solved: the torque at which the motor turns at speed n on voltage V.' },
      { kind: 'number', key: 'n', symbol: 'n', label: 'Speed', units: U_SPEED, unitKey: 'nUnit', min: -1e6, max: 1e6, solvable: true, help: 'Shaft speed. Solve for V to find the supply needed for this speed at the load torque.' },
    ],
  },
  {
    kind: 'section',
    title: 'Limits & temperature',
    fields: [
      { kind: 'number', key: 'tW', symbol: 'ϑ_W', label: 'Winding temperature', suffix: '°C', min: -60, max: 250, help: 'R rises 0.39 %/K for copper. A hot winding (80–120 °C under load) runs noticeably slower at the same load. Magnet weakening with heat is not modelled.' },
      { kind: 'number', key: 'iMax', symbol: 'I_N', label: 'Max continuous current', unit: 'A', min: 0, max: 1e4, optional: true, zeroHint: 'not set', help: 'Datasheet nominal (thermal) current, for a warning only. Leave blank to skip.' },
    ],
  },
];

/** Characteristic figures are meaningless when the motor cannot overcome friction: show them as “—”. */
const charItems = (valid: boolean, items: ResultItem[]): ResultItem[] =>
  valid ? items : items.map((x) => ({ ...x, value: null, display: '—', note: 'motor cannot overcome friction at this V' }));

const fmtRpm = (w: number) => `${(w / RPM).toFixed(Math.abs(w / RPM) < 100 ? 2 : 0)} rpm`;
const fmtT = (t: number) => si(t, 'N·m', 4);

export function compute(st: MotorState): CalcReport {
  for (const k of ['v', 'r', 'k', 'kv', 'i0', 'tL', 'n', 'tW'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (!(st.r > 0)) throw new Error('Terminal resistance must be > 0.');
  if (st.i0 < 0) throw new Error('No-load current must be ≥ 0.');
  const k = st.kForm === 'kv' ? 1 / st.kv : st.k;
  if (!(k > 0) || !Number.isFinite(k)) throw new Error(st.kForm === 'kv' ? 'Speed constant must be > 0.' : 'Torque constant must be > 0.');
  const rHot = windingResistance(st.r, st.tW);
  if (!(rHot > 0)) throw new Error('Winding temperature gives a non-positive resistance.');

  const s: MotorState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];

  // ── solve (the model is linear in V, T and ω on each side of standstill, so the inverses are exact)
  if (s.solveFor === 'v') {
    s.v = voltageFor(k, rHot, s.i0, s.n, s.tL);
    if (s.v < 0) {
      // Stop here: a negative supply is outside the model's input range, and the characteristic at V < 0 is meaningless.
      return {
        calc: 'motor/dc-motor-speed', ok: true, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' },
        results: [{ key: 'v', label: 'Supply voltage', value: null, unit: 'V', display: '—', symbol: 'V', primary: true, solved: true, note: `would need ${si(s.v, 'V', 3)}` }],
        graphs: [], tables: [], notes: [],
        warnings: [`A negative supply (${si(s.v, 'V', 3)}) would be needed: the load torque alone drives the shaft faster than ${fmtRpm(s.n)}. Lower the speed target, brake the load, or check the sign of T_L.`],
      };
    }
  }
  if (!(s.v >= 0)) throw new Error('Supply voltage must be ≥ 0.');
  const m: MotorParams = { v: s.v, r: rHot, k, i0: s.i0 };
  if (s.solveFor === 'tL') s.tL = torqueFor(m, s.n);
  const op = operatingPoint(m, s.tL);
  if (s.solveFor === 'n') s.n = op.speed;
  const fig = motorFigures(m);

  let status: CalcReport['status'];
  if (op.regime === 'held') {
    if (!fig.valid) warnings.push(`V = ${si(s.v, 'V', 3)} does not overcome friction (needs > I₀·R = ${si(s.i0 * rHot, 'V', 3)}). The motor will not turn; it draws V/R = ${si(op.current, 'A', 3)} at standstill.`);
    else warnings.push(`The load torque ${fmtT(s.tL)} holds the shaft: the motor stalls (friction keeps it from being driven backwards) and draws V/R = ${si(op.current, 'A', 3)}. Raise V, gear down, or use a larger motor.`);
    status = { text: 'STALLED', tone: 'fail' };
  } else if (op.regime === 'backward' && s.tL > 0) {
    warnings.push(`The load torque ${fmtT(s.tL)} exceeds the stall torque ${fmtT(fig.stallTorque)}: the motor stalls and is driven backwards. Raise V, gear down, or use a larger motor.`);
    status = { text: 'STALLED', tone: 'fail' };
  }
  if (s.tL < 0 && op.speed > 0) notes.push('Negative load torque: the load drives the shaft (overhauling load); where I < 0 the motor generates.');
  if (s.iMax != null && s.iMax > 0 && Math.abs(op.current) > s.iMax) warnings.push(`Current ${si(op.current, 'A', 3)} exceeds the continuous rating ${si(s.iMax, 'A', 3)}: the winding will overheat in continuous duty. OK only for short bursts within the datasheet’s duty limits.`);
  if (s.tW > 155) warnings.push(`Winding temperature ${s.tW} °C exceeds the usual 155 °C insulation class limit for small motors.`);
  if (fig.valid && s.i0 > 0.5 * fig.stallCurrent) warnings.push('No-load current is more than half the stall current: check R and I₀ — the constant-friction model is doubtful here.');

  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const primary: ResultItem[] = [];
  if (s.solveFor === 'v') primary.push(item('v', 'Supply voltage', s.v, 'V', si(s.v, 'V', 4), { symbol: 'V', solved: true, primary: true, note: `for ${fmtRpm(s.n)} at ${fmtT(s.tL)}` }));
  if (s.solveFor === 'tL') primary.push(item('tL', 'Load torque', s.tL, 'N·m', fmtT(s.tL), { symbol: 'T_L', solved: true, primary: true, note: `at ${fmtRpm(s.n)} on ${si(s.v, 'V', 3)}` }));
  const pctNoLoad = fig.valid && fig.noLoadSpeed > 0 ? ` · ${((s.n / fig.noLoadSpeed) * 100).toFixed(1)} % of no-load` : '';
  primary.push(item('n', 'Speed', s.n, 'rad/s', fmtRpm(s.n), { symbol: 'n', solved: s.solveFor === 'n', primary: true, tone: status ? 'fail' : '', note: `${si(s.n, 'rad/s', 4)}${pctNoLoad}` }));
  primary.push(item('current', 'Current', op.current, 'A', si(op.current, 'A', 4), { symbol: 'I', primary: true, tone: s.iMax != null && s.iMax > 0 && Math.abs(op.current) > s.iMax ? 'warn' : '' }));
  primary.push(item('pOut', 'Output power', op.pOut, 'W', si(op.pOut, 'W', 4), { symbol: 'P_out', primary: true, note: `input ${si(op.pIn, 'W', 4)}` }));
  primary.push(item('efficiency', 'Efficiency', op.pIn > 0 && op.pOut > 0 ? op.efficiency : null, '', op.pIn > 0 && op.pOut > 0 ? `${(op.efficiency * 100).toFixed(1)} %` : '—', { symbol: 'η', primary: true, note: fig.valid ? `max ${(fig.maxEfficiency * 100).toFixed(1)} %` : undefined }));

  const kvRpm = 1 / k / RPM;
  const rest: ResultItem[] = [
    item('k', 'Torque constant', k, 'N·m/A', `${si(k, 'N·m/A', 4)}`, { symbol: 'K_t', group: 'Motor constants', solved: s.kForm === 'kv', note: `= ${(k * RPM * 1000).toPrecision(4)} V/krpm back-EMF` }),
    item('kv', 'Speed constant', 1 / k, 'rad/s/V', `${kvRpm.toPrecision(4)} rpm/V`, { symbol: 'K_v', group: 'Motor constants', solved: s.kForm !== 'kv' }),
    item('rHot', 'Resistance at ϑ_W', rHot, 'Ω', si(rHot, 'Ω', 4), { symbol: 'R(ϑ)', group: 'Motor constants', note: s.tW !== 25 ? `${si(s.r, 'Ω', 4)} at 25 °C, α₂₀ = 0.00393/K` : undefined }),
    item('gradient', 'Speed–torque gradient', fig.gradient, 'rad/s/(N·m)', `${(fig.gradient / RPM / 1000).toPrecision(4)} rpm/mN·m`, { symbol: 'Δn/ΔT', group: 'Motor constants', note: 'R/K²' }),
    ...charItems(fig.valid, [
    item('noLoadSpeed', 'No-load speed', fig.noLoadSpeed, 'rad/s', fmtRpm(fig.noLoadSpeed), { symbol: 'n₀', group: `Characteristic at ${si(s.v, 'V', 3)}` }),
    item('stallTorque', 'Stall torque', fig.stallTorque, 'N·m', fmtT(fig.stallTorque), { symbol: 'T_H', group: `Characteristic at ${si(s.v, 'V', 3)}` }),
    ]),
    item('stallCurrent', 'Stall current', fig.stallCurrent, 'A', si(fig.stallCurrent, 'A', 4), { symbol: 'I_A', group: `Characteristic at ${si(s.v, 'V', 3)}`, note: 'V/R — the start-up surge' }),
    ...charItems(fig.valid, [
    item('maxPower', 'Max output power', fig.maxPower, 'W', si(fig.maxPower, 'W', 4), { symbol: 'P_max', group: `Characteristic at ${si(s.v, 'V', 3)}`, note: `at ${fmtT(fig.maxPowerTorque)}, ${fmtRpm(fig.noLoadSpeed / 2)}` }),
    item('maxEfficiency', 'Max efficiency', fig.maxEfficiency, '', `${(fig.maxEfficiency * 100).toFixed(1)} %`, { symbol: 'η_max', group: `Characteristic at ${si(s.v, 'V', 3)}`, note: `at ${fmtT(fig.maxEffTorque)}, ${si(fig.maxEffCurrent, 'A', 3)}` }),
    ]),
    item('torque', 'Shaft torque', s.tL, 'N·m', fmtT(s.tL), { symbol: 'T', group: 'Operating point' }),
    item('backEmf', 'Back-EMF', k * s.n, 'V', si(k * s.n, 'V', 4), { symbol: 'E', group: 'Operating point' }),
    item('pIn', 'Input power', op.pIn, 'W', si(op.pIn, 'W', 4), { symbol: 'P_in', group: 'Operating point' }),
    item('pCu', 'Copper loss I²R', op.pCu, 'W', si(op.pCu, 'W', 4), { symbol: 'P_Cu', group: 'Operating point' }),
    item('pFric', 'Friction & iron loss', k * s.i0 * s.n, 'W', si(k * s.i0 * s.n, 'W', 4), { symbol: 'P_f', group: 'Operating point', note: 'K·I₀·ω' }),
  ];

  const report: CalcReport = {
    calc: 'motor/dc-motor-speed',
    ok: true,
    solveFor: s.solveFor,
    status,
    results: [...primary, ...rest],
    graphs: graphs(m, fig, s.tL, op.speed, op.current, op.pOut, op.efficiency),
    tables: [],
    warnings,
    notes,
    summary: `${si(s.v, 'V', 3)} · ${fmtT(s.tL)} → ${fmtRpm(s.n)}, ${si(op.current, 'A', 3)} · n₀ ${fmtRpm(fig.noLoadSpeed)} · stall ${fmtT(fig.stallTorque)}`,
    details: { ...fig, ...op, k, rHot },
  };
  notes.push(
    'Steady-state linear model (maxon “Key information”; Hughes & Drury ch. 3): V = IR + Kω, T = K(I − I₀). Friction and iron losses are lumped into the constant no-load current I₀; in reality they rise somewhat with speed.',
    'Brush contact drop, armature reaction and magnet temperature (K falls ≈ 0.1–0.2 %/K) are not modelled. Datasheet nominal speeds are usually quoted with a warm winding, so they are a little below this model at 25 °C.',
  );
  return report;
}

function graphs(m: MotorParams, fig: ReturnType<typeof motorFigures>, tL: number, speed: number, current: number, pOut: number, eff: number): GraphSpec[] {
  // V ≤ I₀·R: the motor cannot overcome friction, so there is no speed–torque characteristic to draw (the
  // warning says so); an empty frame would only look broken.
  if (!fig.valid) return [];
  const tMax = Math.max(fig.stallTorque, tL > 0 ? tL * 1.05 : 0, 1e-12);
  const n = 241;
  const ts = Array.from({ length: n }, (_, i) => (tMax * i) / (n - 1));
  const pts = ts.map((t) => operatingPoint(m, t));
  const show = tL >= 0 && tL <= tMax;
  const g1: GraphSpec = {
    id: 'speed-current',
    title: 'Speed & current vs torque',
    x: { label: 'Shaft torque', unit: 'N·m' },
    y: [
      { id: 'n', label: 'Speed', unit: 'rpm', includeZero: true },
      { id: 'i', label: 'Current', unit: 'A', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'Speed', x: ts, y: pts.map((p) => p.speed / RPM), axis: 'n', width: 2.2 },
      { label: 'Current', x: ts, y: pts.map((p) => p.current), axis: 'i', color: '#c47b17', width: 1.8 },
    ],
    vlines: show ? [{ value: tL, label: `T_L = ${si(tL, 'N·m', 3)}` }, { value: fig.maxEffTorque, label: 'η max', color: '#2f7d4f', dash: [2, 3] }] : [{ value: fig.maxEffTorque, label: 'η max', color: '#2f7d4f', dash: [2, 3] }],
    markers: show ? [{ x: tL, y: speed / RPM, axis: 'n', label: `${(speed / RPM).toFixed(0)} rpm` }, { x: tL, y: current, axis: 'i', label: si(current, 'A', 3), color: '#c47b17' }] : [],
  };
  const g2: GraphSpec = {
    id: 'power-efficiency',
    title: 'Power & efficiency vs torque',
    x: { label: 'Shaft torque', unit: 'N·m' },
    y: [
      { id: 'p', label: 'Output power', unit: 'W', includeZero: true },
      { id: 'e', label: 'Efficiency', unit: '%', side: 'right', min: 0, max: 100 },
    ],
    series: [
      { label: 'Output power', x: ts, y: pts.map((p) => Math.max(p.pOut, 0)), axis: 'p', width: 2.2 },
      { label: 'Efficiency', x: ts, y: pts.map((p) => Math.max(p.efficiency, 0) * 100), axis: 'e', color: '#2f7d4f', width: 1.8 },
    ],
    vlines: show ? [{ value: tL, label: `T_L = ${si(tL, 'N·m', 3)}` }] : [],
    markers: show
      ? [
          { x: tL, y: Math.max(pOut, 0), axis: 'p', label: si(pOut, 'W', 3) },
          { x: tL, y: Math.max(eff, 0) * 100, axis: 'e', label: `${(eff * 100).toFixed(1)} %`, color: '#2f7d4f' },
        ]
      : [],
  };
  return [g1, g2];
}

export const def: CalcDef<MotorState> = {
  id: 'motor/dc-motor-speed',
  version: '0.1.0',
  method:
    'Steady-state permanent-magnet DC motor: V = IR + Kω, T = K(I − I₀), K_t = K_e (SI), K_v = 1/K; no-load speed, stall, max power at half stall torque, max efficiency (1 − √(I₀/I_A))² (maxon “Key information” formulae; Hughes & Drury, Electric Motors and Drives, ch. 3). R scaled to the winding temperature (copper 0.393 %/K). Solve-for uses the exact linear inverses.',
  fields,
  defaults,
  // In the held region (V ≤ I₀·R, or a load the friction holds) many V and T_L give n = 0, so a round trip
  // from such a state need not return the entered V or T_L (harness "roundtrip" flags there are expected).
  solve: {
    default: 'n',
    analysis: 'n',
    options: [
      { key: 'n', label: 'Speed at a given voltage and load' },
      { key: 'v', label: 'Supply voltage for a target speed at the load' },
      { key: 'tL', label: 'Load torque at a given speed and voltage' },
    ],
  },
  compute,
  // set by the ◎ buttons rather than a form field; listed so the AI API can set it too (guide §10)
  controls: {
    kForm: (raw) => {
      const v = String(raw);
      if (!['k', 'kv'].includes(v)) throw new Error('kForm must be one of "k", "kv"');
      return v;
    },
  },
  sync: (s) => {
    // Keep the non-given motor constant in step (the solved one is also written back from the results).
    if (s.kForm === 'kv') {
      if (s.kv > 0) s.k = 1 / s.kv;
    } else if (s.k > 0) s.kv = 1 / s.k;
  },
  examples: [
    { id: 'maxon-re40-nominal', label: 'maxon RE 40 (148867, 24 V) at nominal torque', state: { solveFor: 'n', v: 24, r: 0.299, kForm: 'k', k: 30.2e-3, kUnit: 'mN·m/A', i0: 0.137, tL: 0.177, tLUnit: 'mN·m', tW: 25, iMax: 6 } },
    { id: 'maxon-re40-hot', label: 'Same motor, winding at 100 °C', state: { solveFor: 'n', v: 24, r: 0.299, kForm: 'k', k: 30.2e-3, kUnit: 'mN·m/A', i0: 0.137, tL: 0.177, tLUnit: 'mN·m', tW: 100, iMax: 6 } },
    { id: 'voltage-for-speed', label: 'Voltage for 3000 rpm at 100 mN·m (RE 40)', state: { solveFor: 'v', r: 0.299, kForm: 'k', k: 30.2e-3, kUnit: 'mN·m/A', i0: 0.137, tL: 0.1, tLUnit: 'mN·m', n: 3000 * RPM, nUnit: 'rpm', tW: 25, iMax: 6 } },
    { id: 'hobby-kv', label: '540-size brushed hobby motor, Kv 2000 rpm/V, 7.2 V', state: { solveFor: 'n', v: 7.2, r: 0.1, kForm: 'kv', kv: 2000 * RPM, kvUnit: 'rpm/V', i0: 1.5, tL: 0.02, tLUnit: 'mN·m', tW: 25, iMax: null } },
    { id: 'torque-at-speed', label: 'Torque available at 6000 rpm on 24 V (RE 40)', state: { solveFor: 'tL', v: 24, r: 0.299, kForm: 'k', k: 30.2e-3, kUnit: 'mN·m/A', i0: 0.137, n: 6000 * RPM, nUnit: 'rpm', tLUnit: 'mN·m', tW: 25, iMax: 6 } },
    { id: 'stall', label: 'Edge case: load above stall torque', state: { solveFor: 'n', v: 12, r: 0.299, kForm: 'k', k: 30.2e-3, kUnit: 'mN·m/A', i0: 0.137, tL: 1.5, tLUnit: 'N·m', tW: 25, iMax: 6 } },
  ],
};
