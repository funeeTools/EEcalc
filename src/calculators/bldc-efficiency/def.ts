/** BLDC / PMSM efficiency and loss breakdown — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_IND, withDefault } from '@/core/unitsets';
import { U_KT, U_KV, U_SPEED, U_TORQUE } from '../dc-motor-speed/def';
import { RPM, windingResistance } from '../dc-motor-speed/model';
import { bestTorque, emfSpeedLimit, point, torqueForCurrent, type BldcParams, type BldcPoint, type Drive } from './model';

export const ID = 'motor/bldc-efficiency';

export interface BldcState {
  solveFor: 'i' | 'tq' | 'n';
  drive: Drive;
  rLL: number;
  tW: number;
  kForm: 'k' | 'kv';
  k: number;
  kUnit: string;
  kv: number;
  kvUnit: string;
  p: number;
  lLL: number;
  lLLUnit: string;
  lossForm: 'coeff' | 'noload';
  pFeRef: number;
  nRef: number;
  nRefUnit: string;
  /** hysteresis share of the iron loss at n_ref, % */
  hyst: number;
  tFric: number;
  tFricUnit: string;
  /** viscous / windage coefficient, N·m·s/rad */
  bVisc: number;
  i0: number;
  n0: number;
  n0Unit: string;
  /** eddy (∝ n²) share of the no-load loss, % */
  eddy: number;
  vdc: number;
  rds: number;
  tsw: number;
  fsw: number;
  fswUnit: string;
  pCtrl: number;
  n: number;
  nUnit: string;
  tq: number;
  tqUnit: string;
  i: number;
}

/** A 48 V, ~200 W, 4-pole-pair PMSM on a FOC inverter (round illustrative numbers, see the theory). */
export const defaults = (): BldcState => ({
  solveFor: 'i',
  drive: 'sine',
  rLL: 0.2,
  tW: 25,
  kForm: 'k',
  k: 0.12,
  kUnit: 'N·m/A',
  kv: 1 / 0.12,
  kvUnit: 'rpm/V',
  p: 4,
  lLL: 0.4e-3,
  lLLUnit: 'mH',
  lossForm: 'coeff',
  pFeRef: 6,
  nRef: 3000 * RPM,
  nRefUnit: 'rpm',
  hyst: 50,
  tFric: 0.01,
  tFricUnit: 'N·m',
  bVisc: 1e-5,
  i0: 0.3,
  n0: 4000 * RPM,
  n0Unit: 'rpm',
  eddy: 30,
  vdc: 48,
  rds: 10e-3,
  tsw: 100e-9,
  fsw: 20e3,
  fswUnit: 'kHz',
  pCtrl: 0.5,
  n: 3000 * RPM,
  nUnit: 'rpm',
  tq: 0.64,
  tqUnit: 'N·m',
  i: 5.5,
});

const U_L = withDefault(U_IND, 'mH');
const U_F = withDefault(U_FREQ, 'kHz');
const kGiven = (root: any) => root.kForm !== 'kv' || root.drive !== 'block';
const blockOnly = (_s: any, root: any) => root.drive === 'block';
const DRIVE_LABEL: Record<Drive, string> = { sine: 'Sinusoidal (FOC), I = phase RMS', block: 'Block / six-step, I = DC-link' };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Operating point',
    note: 'Click ◎ to choose the unknown: current for a torque, torque for a current, or the top speed on the bus.',
    fields: [
      { kind: 'number', key: 'n', symbol: 'n', label: 'Speed', units: U_SPEED, unitKey: 'nUnit', min: 0, max: 1e6, solvable: true, help: 'Shaft speed. Solved: the highest speed the inverter can reach at this torque on V_dc (full modulation).' },
      { kind: 'number', key: 'tq', symbol: 'T', label: 'Shaft torque', units: U_TORQUE, unitKey: 'tqUnit', min: 0, max: 1e5, solvable: true, help: 'Useful torque at the shaft. Losses add to it to give the electromagnetic torque K_t·I.' },
      { kind: 'number', key: 'i', symbol: 'I', label: 'Current', unit: 'A', min: 0, max: 1e5, solvable: true, visible: (_s, root) => root.solveFor !== 'n', help: 'Current in the drive’s convention: phase RMS for sinusoidal drive, DC-link (conducting-phase) current for block commutation.' },
    ],
  },
  {
    kind: 'section',
    title: 'Motor',
    fields: [
      // The current changes convention with the drive (phase RMS ↔ DC link), so a "torque for a current" target
      // does not carry over: the switch keeps the torque and speed and solves for the current instead.
      { kind: 'select', key: 'drive', label: 'Commutation', structural: true, options: (Object.keys(DRIVE_LABEL) as Drive[]).map((value) => ({ value, label: DRIVE_LABEL[value] })), apply: (_v, s) => { if (s.solveFor === 'tq') s.solveFor = 'i'; }, help: 'Sets the current convention, the copper and conduction loss formulas, the switching-loss model and the voltage limit.' },
      { kind: 'number', key: 'rLL', symbol: 'R_LL', label: 'Resistance', unit: 'Ω', min: 1e-5, max: 1e4, help: 'Line-to-line (phase-to-phase) resistance at 25 °C, as datasheets give it. For a wye winding R_ph = R_LL/2.' },
      { kind: 'number', key: 'tW', symbol: 'ϑ_W', label: 'Winding', suffix: '°C', min: -60, max: 250, help: 'Copper resistance rises 0.39 %/K.' },
      {
        kind: 'number', key: 'k', symbol: 'K_t', label: 'Torque/amp', units: U_KT, unitKey: 'kUnit', min: 1e-6, max: 100, solvable: true,
        solvedWhen: (_s, root) => !kGiven(root), onSolve: (_s, root) => (root.kForm = 'kv'), onUnsolve: (_s, root) => (root.kForm = 'k'),
        help: 'Torque per ampere in the chosen convention: per A_rms for sinusoidal drive (K_t = 3·E_ph,rms/ω), per DC ampere for block commutation.',
      },
      {
        kind: 'number', key: 'kv', symbol: 'K_v', label: 'Speed/volt', units: U_KV, unitKey: 'kvUnit', min: 1e-3, max: 1e7, solvable: true, visible: blockOnly,
        solvedWhen: (_s, root) => kGiven(root), onSolve: (_s, root) => (root.kForm = 'k'), onUnsolve: (_s, root) => (root.kForm = 'kv'),
        help: 'Hobby-motor rating: no-load rpm per volt of DC supply under block commutation, K_v = 1/K_t.',
      },
      { kind: 'number', key: 'p', symbol: 'p', label: 'Pole pairs', integer: true, min: 1, max: 100, help: 'Electrical frequency f_e = p·n/60.' },
      { kind: 'number', key: 'lLL', symbol: 'L_LL', label: 'Inductance', units: U_L, unitKey: 'lLLUnit', min: 0, max: 10, visible: (_s, root) => root.drive === 'sine', help: 'Line-to-line inductance; L_ph = L_LL/2. Its voltage drop ω_e·L·I limits the top speed of a sinusoidal drive.' },
    ],
  },
  {
    kind: 'section',
    title: 'Speed-dependent losses',
    fields: [
      { kind: 'select', key: 'lossForm', label: 'Given as', structural: true, options: [{ value: 'coeff', label: 'Iron loss + friction coefficients' }, { value: 'noload', label: 'No-load current at a speed' }] },
      { kind: 'number', key: 'pFeRef', symbol: 'P_Fe,ref', label: 'Iron loss', unit: 'W', min: 0, max: 1e6, visible: (_s, r) => r.lossForm === 'coeff', help: 'Core loss at the reference speed (from the motor maker, an FEA run, or a no-load test minus friction).' },
      { kind: 'number', key: 'nRef', symbol: 'n_ref', label: 'Reference speed', units: U_SPEED, unitKey: 'nRefUnit', min: 1e-3, max: 1e6, visible: (_s, r) => r.lossForm === 'coeff' },
      { kind: 'number', key: 'hyst', symbol: 'h', label: 'Hysteresis', suffix: '%', min: 0, max: 100, visible: (_s, r) => r.lossForm === 'coeff', help: 'Part of the iron loss at n_ref that scales with f (hysteresis); the rest scales with f² (eddy currents). Laminated steel at a few hundred Hz: roughly 50–80 % hysteresis.' },
      { kind: 'number', key: 'tFric', symbol: 'T_f', label: 'Friction', units: U_TORQUE, unitKey: 'tFricUnit', min: 0, max: 1e4, visible: (_s, r) => r.lossForm === 'coeff', help: 'Constant (Coulomb) bearing and seal friction.' },
      { kind: 'number', key: 'bVisc', symbol: 'B', label: 'Viscous', unit: 'N·m·s/rad', min: 0, max: 100, visible: (_s, r) => r.lossForm === 'coeff', help: 'Viscous damping and windage, a torque B·ω (loss B·ω²).' },
      { kind: 'number', key: 'i0', symbol: 'I₀', label: 'No-load I', unit: 'A', min: 0, max: 1e4, visible: (_s, r) => r.lossForm === 'noload', help: 'Current with nothing on the shaft at speed n₀ (datasheet or measured), in the same convention as I. Its torque K_t·I₀ covers iron and friction loss at n₀.' },
      { kind: 'number', key: 'n0', symbol: 'n₀', label: 'No-load speed', units: U_SPEED, unitKey: 'n0Unit', min: 1e-3, max: 1e6, visible: (_s, r) => r.lossForm === 'noload' },
      { kind: 'number', key: 'eddy', symbol: 'e', label: 'Eddy share', suffix: '%', min: 0, max: 100, visible: (_s, r) => r.lossForm === 'noload', help: 'Part of the no-load loss that scales with n² (eddy current, windage); the rest scales with n (hysteresis, friction). 0 % = constant loss torque, the classic DC-motor model.' },
    ],
  },
  {
    kind: 'section',
    title: 'Inverter',
    fields: [
      { kind: 'number', key: 'vdc', symbol: 'V_dc', label: 'DC bus voltage', unit: 'V', min: 0.1, max: 1e5 },
      { kind: 'number', key: 'rds', symbol: 'R_DS(on)', label: 'Per switch', unit: 'Ω', min: 0, max: 100, help: 'Per MOSFET, at its operating temperature (often 1.5–2 × the 25 °C value).' },
      { kind: 'number', key: 'tsw', symbol: 't_r+t_f', label: 'Rise + fall', unit: 's', min: 0, max: 1e-3, help: 'Sum of current rise and fall (crossover) times per switching cycle, for the ½·V·I·t·f loss estimate.' },
      { kind: 'number', key: 'fsw', symbol: 'f_sw', label: 'PWM frequency', units: U_F, unitKey: 'fswUnit', min: 0, max: 10e6 },
      { kind: 'number', key: 'pCtrl', symbol: 'P_ctrl', label: 'Controller', unit: 'W', min: 0, max: 1e4, help: 'Gate drive, MCU and housekeeping power drawn from the bus.' },
    ],
  },
];

const fmtRpm = (w: number) => `${(w / RPM).toFixed(Math.abs(w / RPM) < 100 ? 2 : 0)} rpm`;
const fT = (t: number) => si(t, 'N·m', 4);
const fW = (p: number) => si(p, 'W', 3);
const pc = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function paramsOf(s: BldcState): BldcParams {
  const k = s.drive === 'block' && s.kForm === 'kv' ? 1 / s.kv : s.k;
  return {
    drive: s.drive,
    rLL: windingResistance(s.rLL, s.tW),
    k,
    p: s.p,
    lLL: s.drive === 'sine' ? s.lLL : 0,
    loss: s.lossForm === 'noload' ? { form: 'noload', i0: s.i0, w0: s.n0, eddy: s.eddy / 100 } : { form: 'coeff', pFeRef: s.pFeRef, wRef: s.nRef, hyst: s.hyst / 100, tFric: s.tFric, bVisc: s.bVisc },
    vdc: s.vdc,
    rds: s.rds,
    tsw: s.tsw,
    fsw: s.fsw,
    pCtrl: s.pCtrl,
  };
}

export function compute(st: BldcState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/** Speed at which the inverter reaches full modulation at torque t; null when even standstill is over the limit. */
export function maxSpeed(b: BldcParams, t: number): number | null {
  const f = (w: number) => point(b, w, t).mod - 1;
  if (f(0) >= 0) return null;
  let hi = emfSpeedLimit(b);
  for (let k = 0; k < 60 && f(hi) < 0; k++) hi *= 2;
  if (f(hi) < 0) return null;
  return brent(f, 0, hi, 1e-13 * hi);
}

function outOfRange(s: BldcState, msg: string): CalcReport {
  return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'OUT OF RANGE', tone: 'warn' }, error: msg };
}

function run(st: BldcState): CalcReport {
  const s: BldcState = { ...st };
  for (const key of ['rLL', 'tW', 'p', 'lLL', 'vdc', 'rds', 'tsw', 'fsw', 'pCtrl'] as const) finite(key, s[key]);
  if (s.lossForm === 'noload') for (const key of ['i0', 'n0', 'eddy'] as const) finite(key, s[key]);
  else for (const key of ['pFeRef', 'nRef', 'hyst', 'tFric', 'bVisc'] as const) finite(key, s[key]);
  if (!(s.rLL > 0)) throw new Error('Terminal resistance must be > 0.');
  if (!(s.vdc > 0)) throw new Error('DC bus voltage must be > 0.');
  if (!(s.p >= 1)) throw new Error('Pole pairs must be ≥ 1.');
  s.p = Math.round(s.p);
  for (const key of ['lLL', 'rds', 'tsw', 'fsw', 'pCtrl'] as const) if (s[key] < 0) throw new Error(`${key} must be ≥ 0.`);
  if (s.lossForm === 'coeff' && (s.pFeRef < 0 || !(s.nRef > 0) || s.hyst < 0 || s.hyst > 100 || s.tFric < 0 || s.bVisc < 0)) throw new Error('Iron-loss and friction inputs must be ≥ 0 (n_ref > 0, hysteresis share 0 … 100 %).');
  if (s.lossForm === 'noload' && (s.i0 < 0 || !(s.n0 > 0) || s.eddy < 0 || s.eddy > 100)) throw new Error('No-load inputs: I₀ ≥ 0, n₀ > 0, eddy share 0 … 100 %.');
  const kRaw = s.drive === 'block' && s.kForm === 'kv' ? finite('K_v', s.kv) : finite('K_t', s.k);
  if (!(kRaw > 0)) throw new Error('Torque / speed constant must be > 0.');
  const b = paramsOf(s);
  if (s.drive === 'block' && s.kForm === 'kv' && (b.k > 100 || b.k < 1e-6)) return outOfRange(s, `K_t = 1/K_v would be ${si(b.k, 'N·m/A', 3)}, outside the 1 µN·m/A … 100 N·m/A this input accepts. Check the K_v value and its unit.`);
  if (!(b.rLL > 0)) throw new Error('Winding temperature gives a non-positive resistance.');

  const warnings: string[] = [];
  const notes: string[] = [];
  let status: CalcReport['status'];

  // ── solve
  if (s.solveFor !== 'n') {
    finite('Speed', s.n);
    if (s.n < 0) throw new Error('Speed must be ≥ 0.');
  }
  if (s.solveFor === 'tq') {
    finite('Current', s.i);
    if (s.i < 0) throw new Error('Current must be ≥ 0.');
    const t = torqueForCurrent(b, s.n, s.i);
    if (t < 0) {
      const iMin = point(b, s.n, 0).current;
      return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' }, error: `I = ${si(s.i, 'A', 3)} does not even cover the losses at ${fmtRpm(s.n)} (needs ${si(iMin, 'A', 3)} for zero shaft torque). Raise the current or lower the speed.` };
    }
    if (t > 1e5) return outOfRange(s, `The shaft torque would be ${fT(t)}, above the 100 kN·m this input accepts. Check K_t and the current.`);
    s.tq = t;
  } else {
    finite('Shaft torque', s.tq);
    if (s.tq < 0) throw new Error('Shaft torque must be ≥ 0 (motoring only).');
  }
  if (s.solveFor === 'n') {
    const w = maxSpeed(b, s.tq);
    if (w == null) {
      const v0 = point(b, 0, s.tq);
      return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' }, error: `Even at standstill ${fT(s.tq)} needs ${si(v0.vNeed, 'V', 3)} (${pc(v0.mod)} of what V_dc = ${si(s.vdc, 'V', 3)} can supply). Lower the torque or raise V_dc.` };
    }
    if (w > 1e6) return outOfRange(s, `The top speed would be ${si(w, 'rad/s', 3)} (${(w / RPM).toPrecision(3)} rpm), above the 10⁶ rad/s this input accepts: V_dc/K_t is unrealistically high. Check K_t and V_dc.`);
    s.n = w;
  }
  const op = point(b, s.n, s.tq);
  if (s.solveFor !== 'tq' && op.current > 1e5)
    return outOfRange(s, `The current would be ${si(op.current, 'A', 3)}, above the 100 kA this input accepts: the losses or the torque need far more than K_t can give${s.lossForm === 'coeff' && s.nRef < 1 ? ' (n_ref is tiny, so the iron loss scaled to this speed is enormous)' : ''}. Check K_t, the loss inputs and the torque.`);
  if (s.solveFor !== 'tq') s.i = op.current;

  if (op.mod > 1 + 1e-9) {
    status = { text: 'VOLTAGE LIMIT', tone: 'fail' };
    warnings.push(`This point needs ${pc(op.mod)} modulation: V_dc = ${si(s.vdc, 'V', 3)} cannot drive ${si(Math.abs(op.current), 'A', 3)} against the back-EMF at ${fmtRpm(s.n)}. Raise V_dc, lower the speed, or (sinusoidal drive) use field weakening, which this page does not model.`);
  } else if (op.mod > 0.95 && s.solveFor !== 'n') warnings.push(`Modulation ${pc(op.mod)}: almost no voltage margin for current control and load steps. Keep about 5–10 % in reserve.`);

  // ── report
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const share = (p: number) => (op.pDc > 0 ? ` · ${pc(p / op.pDc)} of input` : '');
  const iLabel = s.drive === 'sine' ? 'Phase current (RMS)' : 'DC-link current';
  const primary: ResultItem[] = [];
  if (s.solveFor === 'i') primary.push(item('i', iLabel, s.i, 'A', si(s.i, 'A', 4), { symbol: 'I', solved: true, primary: true, note: `T_em ${fT(op.tEm)}` }));
  if (s.solveFor === 'tq') primary.push(item('tq', 'Shaft torque', s.tq, 'N·m', fT(s.tq), { symbol: 'T', solved: true, primary: true, note: `at ${si(s.i, 'A', 3)}, ${fmtRpm(s.n)}` }));
  if (s.solveFor === 'n') primary.push(item('n', 'Top speed on V_dc', s.n, 'rad/s', fmtRpm(s.n), { symbol: 'n', solved: true, primary: true, note: `full modulation at ${fT(s.tq)}` }));
  primary.push(
    item('etaSys', 'System efficiency', op.etaSys > 0 ? op.etaSys : null, '', op.etaSys > 0 ? pc(op.etaSys) : '—', { symbol: 'η', primary: true, note: `motor ${op.etaMotor > 0 ? pc(op.etaMotor) : '—'} · inverter ${op.etaInv > 0 ? pc(op.etaInv) : '—'}` }),
    item('pLoss', 'Total loss', op.pLoss, 'W', fW(op.pLoss), { symbol: 'P_loss', primary: true, note: `shaft ${fW(op.pShaft)}` }),
    item('pDc', 'DC input power', op.pDc, 'W', fW(op.pDc), { symbol: 'P_dc', primary: true, note: `I_dc ${si(op.iDc, 'A', 3)} from ${si(s.vdc, 'V', 3)}` }),
  );
  // solved: the current at the top speed is written back to the (hidden) I box, so ◎ T afterwards starts from
  // the current of this point instead of a stale one
  if (s.solveFor === 'n') primary.splice(2, 0, item('i', iLabel, op.current, 'A', si(op.current, 'A', 4), { symbol: 'I', primary: true, solved: true }));

  const G = 'Losses';
  const rest: ResultItem[] = [
    item('pShaft', 'Shaft power', op.pShaft, 'W', fW(op.pShaft), { symbol: 'P_out', group: G }),
    item('pCu', 'Copper loss', op.pCu, 'W', fW(op.pCu) + share(op.pCu), { symbol: s.drive === 'sine' ? '1.5·I²·R_LL' : 'I²·R_LL', group: G }),
    ...(s.lossForm === 'coeff'
      ? [
          item('pFe', 'Iron loss', op.pFe, 'W', fW(op.pFe) + share(op.pFe), { symbol: 'P_Fe', group: G }),
          item('pFw', 'Friction & windage', op.pFw, 'W', fW(op.pFw) + share(op.pFw), { symbol: 'T_f·ω + B·ω²', group: G }),
        ]
      : [item('pNoLoad', 'Iron + friction (no-load)', op.pNoLoad, 'W', fW(op.pNoLoad) + share(op.pNoLoad), { symbol: 'P₀(n)', group: G })]),
    item('pCond', 'Inverter conduction', op.pCond, 'W', fW(op.pCond) + share(op.pCond), { symbol: `${s.drive === 'sine' ? 3 : 2}·I²·R_DS`, group: G }),
    item('pSw', 'Inverter switching', op.pSw, 'W', fW(op.pSw) + share(op.pSw), { symbol: '½V·I·t·f', group: G }),
    item('pCtrl', 'Controller overhead', op.pCtrl, 'W', fW(op.pCtrl), { symbol: 'P_ctrl', group: G }),
    item('tEm', 'Electromagnetic torque', op.tEm, 'N·m', fT(op.tEm), { symbol: 'T_em = K_t·I', group: 'Motor' }),
    item('emf', s.drive === 'sine' ? 'Back-EMF per phase (RMS)' : 'Back-EMF (DC-equivalent)', op.emf, 'V', si(op.emf, 'V', 4), { symbol: s.drive === 'sine' ? 'E_ph = K_t·ω/3' : 'E = K_t·ω', group: 'Motor' }),
    item('vNeed', s.drive === 'sine' ? 'Phase voltage needed (RMS)' : 'DC voltage needed', op.vNeed, 'V', si(op.vNeed, 'V', 4), { symbol: 'V', group: 'Motor', note: s.drive === 'sine' ? `limit V_dc/√6 = ${si(s.vdc / Math.sqrt(6), 'V', 3)}` : undefined }),
    item('mod', 'Modulation', op.mod, '', pc(op.mod), { symbol: 'm', group: 'Motor', tone: op.mod > 1 ? 'fail' : op.mod > 0.95 ? 'warn' : '' }),
    item('fe', 'Electrical frequency', (s.p * s.n) / (2 * Math.PI), 'Hz', si((s.p * s.n) / (2 * Math.PI), 'Hz', 4), { symbol: 'f_e = p·n/60', group: 'Motor' }),
    item('rHot', 'Resistance at ϑ_W', b.rLL, 'Ω', si(b.rLL, 'Ω', 4), { symbol: 'R_LL(ϑ)', group: 'Motor' }),
    item('iDc', 'DC bus current', op.iDc, 'A', si(op.iDc, 'A', 4), { symbol: 'I_dc', group: 'Motor' }),
  ];
  // best efficiency at this speed, among the torques the inverter can still reach (modulation ≤ 1)
  let tHi = Math.max(3 * s.tq, b.k * (s.vdc / b.rLL) * 0.2, 1e-9);
  const modAt = (t: number) => point(b, s.n, t).mod - 1;
  const reachable = s.n > 0 && modAt(0) <= 0;
  if (reachable && modAt(tHi) > 0) tHi = brent(modAt, 0, tHi, 1e-12 * tHi);
  const best = reachable ? bestTorque(b, s.n, tHi) : null;
  if (best && best.eta > 0) {
    rest.push(
      item('bestTorque', 'Best-efficiency torque', best.t, 'N·m', fT(best.t), { group: `Best efficiency at ${fmtRpm(s.n)}`, note: best.t >= tHi * (1 - 1e-6) ? 'at the voltage limit' : undefined }),
      item('bestEta', 'Its system efficiency', best.eta, '', pc(best.eta), { group: `Best efficiency at ${fmtRpm(s.n)}`, note: '≈ where I²-losses equal the fixed losses' }),
    );
  } else if (s.n > 0 && !reachable) {
    const m0 = point(b, s.n, 0).mod;
    warnings.push(`At ${fmtRpm(s.n)} even zero torque needs ${pc(m0)} modulation: the back-EMF alone exceeds what V_dc = ${si(s.vdc, 'V', 3)} can supply, so no torque is reachable at this speed. Lower the speed or raise V_dc.`);
  }
  if (s.drive === 'block' && s.kForm === 'kv') rest.push(item('k', 'Torque constant', b.k, 'N·m/A', si(b.k, 'N·m/A', 4), { symbol: 'K_t', group: 'Motor', solved: true }));
  if (s.drive === 'block' && s.kForm !== 'kv') rest.push(item('kv', 'Speed constant', 1 / b.k, 'rad/s/V', `${(1 / b.k / RPM).toPrecision(4)} rpm/V`, { symbol: 'K_v', group: 'Motor', solved: true }));

  if (s.solveFor === 'n' && s.drive === 'sine' && s.lLL === 0) notes.push('L_LL = 0: the top speed ignores the inductive voltage drop and is optimistic.');
  if (op.pCu > 0 && (op.pFe + op.pFw + op.pNoLoad) > 3 * op.pCu && s.tq > 0) notes.push('Speed-dependent losses dominate: the motor is lightly loaded for this speed. Efficiency improves with more torque (see the best-efficiency point).');
  if (op.pCu > 3 * (op.pFe + op.pFw + op.pNoLoad) && op.pCu > 0) notes.push('Copper loss dominates: the motor is heavily loaded. A higher-K_t winding or a larger motor would run cooler.');
  if (s.lossForm === 'coeff' && s.n > 3 * s.nRef) warnings.push(`Speed is more than 3 × n_ref: the f/f² iron-loss scaling is an extrapolation there. Use iron-loss data nearer this speed.`);
  if (s.lossForm === 'noload' && s.n > 2 * s.n0) warnings.push('Speed is more than 2 × n₀: the no-load loss scaling is an extrapolation. Use data nearer this speed.');
  if (s.tW > 155) warnings.push(`Winding temperature ${s.tW} °C exceeds the usual 155 °C insulation class limit.`);
  if (s.drive === 'sine' && s.fsw > 0 && (s.p * s.n) / (2 * Math.PI) > s.fsw / 10) warnings.push(`Electrical frequency ${si((s.p * s.n) / (2 * Math.PI), 'Hz', 3)} is above f_sw/10: too few PWM periods per electrical cycle for good sinusoidal currents. Raise f_sw.`);
  notes.push(
    s.drive === 'sine'
      ? 'Sinusoidal drive with i_d = 0 (no field weakening): T = K_t·I_rms, copper loss 3·I²·R_ph with R_ph = R_LL/2 (wye).'
      : 'Block commutation: two phases conduct the DC-link current, copper loss I²·R_LL; commutation overlap and current ripple are not modelled.',
    'Iron loss uses constant flux density (magnet-set): hysteresis ∝ f, eddy ∝ f². Armature-reaction, PWM-ripple and magnet eddy losses are not included.',
    'Switching loss is the linearised ½·V·I·(t_r + t_f)·f estimate; diode reverse recovery and dead-time conduction are not included.',
  );

  const report: CalcReport = {
    ...emptyReport(ID),
    solveFor: s.solveFor,
    status,
    results: [...primary, ...rest],
    warnings,
    notes,
    summary: `${fmtRpm(s.n)} · ${fT(s.tq)} → ${fW(op.pShaft)} out, ${fW(op.pLoss)} lost, η ${op.etaSys > 0 ? pc(op.etaSys) : '—'} · ${DRIVE_LABEL[s.drive]}`,
    details: { ...op, k: b.k, rHot: b.rLL, best, solved: { i: s.i, tq: s.tq, n: s.n } },
  };
  report.graphs = graphs(s, b, op, best);
  return report;
}

function lossSeries(pts: BldcPoint[], xs: number[], coeff: boolean): NonNullable<GraphSpec['series']> {
  return [
    { label: 'Copper', x: xs, y: pts.map((q) => q.pCu), axis: 'p', color: '#c47b17', width: 1.6 },
    ...(coeff
      ? [
          { label: 'Iron', x: xs, y: pts.map((q) => q.pFe), axis: 'p', color: '#6b5b95', width: 1.6 },
          { label: 'Friction & windage', x: xs, y: pts.map((q) => q.pFw), axis: 'p', color: '#9a8f7a', width: 1.6 },
        ]
      : [{ label: 'Iron + friction', x: xs, y: pts.map((q) => q.pNoLoad), axis: 'p', color: '#6b5b95', width: 1.6 }]),
    { label: 'Inverter', x: xs, y: pts.map((q) => q.pCond + q.pSw + q.pCtrl), axis: 'p', color: '#4f8a8b', width: 1.6 },
  ];
}

function graphs(s: BldcState, b: BldcParams, op: BldcPoint, best: { t: number; eta: number } | null): GraphSpec[] {
  const coeff = s.lossForm === 'coeff';
  const N = 121;
  // 1 — efficiency and losses vs torque at this speed
  const tTop = Math.max(2 * s.tq, op.tEm - s.tq > 0 ? 10 * (op.tEm - s.tq) : 0, 1e-6);
  const ts = Array.from({ length: N }, (_, i) => (tTop * i) / (N - 1));
  const pts = ts.map((t) => point(b, s.n, t));
  const g1: GraphSpec = {
    id: 'vs-torque',
    title: 'Efficiency & losses vs torque',
    subtitle: `At ${fmtRpm(s.n)}`,
    x: { label: 'Shaft torque', unit: 'N·m' },
    y: [
      { id: 'e', label: 'Efficiency', unit: '%', min: 0, max: 100 },
      { id: 'p', label: 'Loss', unit: 'W', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'System η', x: ts, y: pts.map((q) => q.etaSys * 100), axis: 'e', width: 2.4, color: '#1f4e5f' },
      { label: 'Motor η', x: ts, y: pts.map((q) => q.etaMotor * 100), axis: 'e', width: 1.3, color: '#2f7d4f', dash: [5, 3] },
      ...lossSeries(pts, ts, coeff),
    ],
    vlines: [{ value: s.tq, label: `T ${si(s.tq, 'N·m', 3)}`, color: '#1f4e5f' }, ...(best && best.eta > 0 ? [{ value: best.t, label: 'η max', color: '#2f7d4f', dash: [2, 3] }] : [])],
    markers: [{ x: s.tq, y: op.etaSys * 100, axis: 'e', label: pc(op.etaSys) }],
    legend: 'below',
  };

  // 2 — efficiency map as slices: η vs torque at several speeds, cut at the voltage limit
  const fracs = [0.25, 0.5, 0.75, 1, 1.25];
  const colors = ['#9a8f7a', '#4f8a8b', '#6b5b95', '#1f4e5f', '#c47b17'];
  const series: NonNullable<GraphSpec['series']> = [];
  // Beyond the voltage limit at every slice (high speed): slice up to 90 % of the zero-torque top speed instead.
  const w0 = maxSpeed(b, 0);
  const nAll = (w: number) => w > 0 && point(b, w * fracs[0], 0).mod <= 1;
  const nBase = nAll(s.n) || w0 == null ? s.n : 0.9 * w0;
  fracs.forEach((f, j) => {
    const w = nBase * f;
    if (!(w > 0)) return;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const t of ts) {
      const q = point(b, w, t);
      if (q.mod > 1) break;
      xs.push(t);
      ys.push(q.etaSys * 100);
    }
    if (xs.length > 1) series.push({ label: `${fmtRpm(w)}${f === 1 && nBase === s.n ? ' (this speed)' : ''}`, x: xs, y: ys, axis: 'e', color: colors[j], width: f === 1 ? 2.4 : 1.4 });
  });
  const g2: GraphSpec = {
    id: 'map',
    title: 'Efficiency map (slices)',
    subtitle: `System η vs torque at 25 … 125 % of the speed; each line ends at the voltage limit${series.some((x) => x.label.includes('this speed')) ? '' : ' · this speed is beyond the limit at any torque'}`,
    x: { label: 'Shaft torque', unit: 'N·m' },
    y: [{ id: 'e', label: 'System efficiency', unit: '%', min: 0, max: 100 }],
    series,
    vlines: [{ value: s.tq, label: 'T', color: '#1f4e5f' }],
    markers: s.n > 0 && op.mod <= 1 ? [{ x: s.tq, y: op.etaSys * 100, axis: 'e', label: pc(op.etaSys) }] : [],
    legend: 'below',
  };

  // 3 — losses vs speed at this torque, up to the voltage limit
  const wMax = maxSpeed(b, s.tq);
  const wTop = Math.max(wMax != null ? wMax * 1.05 : 1.5 * s.n, s.n * 1.05, 1e-6);
  const ws = Array.from({ length: N }, (_, i) => (wTop * i) / (N - 1));
  const sp = ws.map((w) => point(b, w, s.tq));
  const g3: GraphSpec = {
    id: 'vs-speed',
    title: 'Losses vs speed',
    subtitle: `At ${fT(s.tq)}`,
    x: { label: 'Speed', unit: 'rpm' },
    y: [
      { id: 'p', label: 'Loss', unit: 'W', includeZero: true },
      { id: 'e', label: 'System efficiency', unit: '%', side: 'right', min: 0, max: 100 },
    ],
    series: [...lossSeries(sp, ws.map((w) => w / RPM), coeff), { label: 'System η', x: ws.map((w) => w / RPM), y: sp.map((q) => q.etaSys * 100), axis: 'e', width: 2.2, color: '#1f4e5f' }],
    vlines: [{ value: s.n / RPM, label: `n ${fmtRpm(s.n)}`, color: '#1f4e5f' }, ...(wMax != null ? [{ value: wMax / RPM, label: 'voltage limit', color: '#8b1e1e', dash: [4, 4] }] : [])],
    legend: 'below',
  };
  // no reachable slice at all (e.g. a winding resistance so high that even a light load is over the voltage
  // limit at any speed): leave the map out rather than draw an empty frame
  return series.length ? [g1, g2, g3] : [g1, g3];
}

/** Settable non-field keys (window.eeCalc / URL inputs): validate against the allowed values. */
const oneOf = <T extends string>(name: string, ok: readonly T[]) => (raw: unknown): T => {
  const v = String(raw) as T;
  if (!ok.includes(v)) throw new Error(`${name} must be one of ${ok.map((o) => JSON.stringify(o)).join(', ')}`);
  return v;
};

export const def: CalcDef<BldcState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Loss breakdown at a speed/torque point: copper I²R in the drive’s current convention (block: I_dc, I²R_LL; sinusoidal: I_rms, 1.5·I²R_LL), iron loss with constant-flux hysteresis ∝ f + eddy ∝ f² (Bertotti 1988) or a no-load-test loss, Coulomb + viscous friction, inverter conduction R_DS·I² and linearised switching ½VI(t_r+t_f)f (Mohan et al. §2-3; Infineon MOSFET loss AN); voltage limit V_dc (block) or V_dc/√6 phase RMS (SVPWM); Brent for the top speed. Krishnan, PMSM and BLDC Motor Drives (2010).',
  fields,
  defaults,
  // The n solve is the top speed on the bus (full modulation), not the inverse of the speed box, so the
  // harness round-trip flags "solveFor n: n = 471 but the state has 314" (and the current at that speed,
  // "i = 5.65 but the state has 5.60") are expected.
  solve: {
    default: 'i',
    analysis: 'i',
    options: [
      { key: 'i', label: 'Current & losses for a torque' },
      { key: 'tq', label: 'Torque for a current' },
      { key: 'n', label: 'Top speed on the DC bus' },
    ],
  },
  compute,
  controls: { kForm: oneOf('kForm', ['k', 'kv'] as const) },
  sync: (s) => {
    // Keep the non-given motor constant in step (block commutation only; sinusoidal drive uses K_t).
    if (s.drive === 'block' && s.kForm === 'kv') {
      if (s.kv > 0) s.k = 1 / s.kv;
    } else if (s.k > 0) s.kv = 1 / s.k;
  },
  examples: [
    { id: 'default-48v', label: '48 V, 200 W PMSM on FOC at 3000 rpm', state: defaults() },
    { id: 'top-speed', label: 'Same motor: top speed at 0.64 N·m on 48 V', state: { ...defaults(), solveFor: 'n' } },
    { id: 'maxon-check', label: 'Block drive at its best point on 24 V: η = (1 − √(I₀/I_A))² (maxon formula)', state: { ...defaults(), solveFor: 'n', drive: 'block', rLL: 0.608, tW: 25, k: 36.9e-3, kUnit: 'mN·m/A', kForm: 'k', lossForm: 'noload', i0: 0.234, n0: 6000 * RPM, eddy: 0, vdc: 24, rds: 0, tsw: 0, pCtrl: 0, tq: 36.9e-3 * (Math.sqrt((0.234 * 24) / 0.608) - 0.234), tqUnit: 'mN·m' } },
    { id: 'drone', label: 'Drone motor, K_v 920 rpm/V, 6S (22.2 V), 10 A block drive', state: { ...defaults(), solveFor: 'tq', drive: 'block', kForm: 'kv', kv: 920 * RPM, kvUnit: 'rpm/V', rLL: 0.045, p: 7, lossForm: 'noload', i0: 0.6, n0: 920 * 22.2 * RPM, eddy: 50, vdc: 22.2, rds: 3e-3, tsw: 50e-9, fsw: 24e3, pCtrl: 0.3, n: 17000 * RPM, i: 10, tqUnit: 'mN·m' } },
    { id: 'light-load', label: 'Light load at high speed: iron loss dominates', state: { ...defaults(), n: 4000 * RPM, tq: 0.08 } },
    { id: 'over-voltage', label: 'Edge case: 5000 rpm at 1 N·m exceeds the 48 V limit', state: { ...defaults(), n: 5000 * RPM, tq: 1 } },
  ],
};
