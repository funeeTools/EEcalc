/** PWM duty cycle for a brushed DC motor — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_IND, withDefault } from '@/core/unitsets';
import { U_KT, U_KV, U_SPEED, U_TORQUE } from '../dc-motor-speed/def';
import { RPM, motorFigures, operatingPoint, windingResistance } from '../dc-motor-speed/model';
import { currentNeeded, dutyFor, operate, sampleWaveform, waveform, type Drive, type MotorLoad, type PwmCircuit } from './model';

export const ID = 'motor/pwm-duty-cycle-motor';

export interface PwmMotorState {
  solveFor: 'n' | 'duty' | 'tL';
  drive: Drive;
  vs: number;
  /** duty cycle, % */
  duty: number;
  f: number;
  fUnit: string;
  ron: number;
  vd: number;
  r: number;
  l: number;
  lUnit: string;
  /** extra series choke, H */
  lx: number;
  lxUnit: string;
  kForm: 'k' | 'kv';
  k: number;
  kUnit: string;
  kv: number;
  kvUnit: string;
  i0: number;
  tW: number;
  tL: number;
  tLUnit: string;
  n: number;
  nUnit: string;
}

/** maxon RE 40 Ø40 mm 150 W, 24 V winding, order no. 148867 (maxon product page, 2025 data, values at 25 °C). */
export const defaults = (): PwmMotorState => ({
  solveFor: 'n',
  drive: 'lowside',
  vs: 24,
  duty: 50,
  f: 20e3,
  fUnit: 'kHz',
  ron: 10e-3,
  vd: 0.5,
  r: 0.299,
  l: 0.0824e-3,
  lUnit: 'mH',
  lx: 0,
  lxUnit: 'µH',
  kForm: 'k',
  k: 30.2e-3,
  kUnit: 'mN·m/A',
  kv: 1 / 30.2e-3,
  kvUnit: 'rpm/V',
  i0: 0.137,
  tW: 25,
  tL: 0.1,
  tLUnit: 'mN·m',
  n: 3000 * RPM,
  nUnit: 'rpm',
});

const kGiven = (root: any) => root.kForm !== 'kv';
const U_L = withDefault(U_IND, 'mH');
const U_LX = withDefault(U_IND, 'µH');
const U_F = withDefault(U_FREQ, 'kHz');

const DRIVE_LABEL: Record<Drive, string> = {
  lowside: 'Low-side switch + freewheel diode',
  sync: 'H-bridge, sign-magnitude (synchronous)',
  antiphase: 'H-bridge, locked anti-phase',
};

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Drive',
    note: 'Click ◎ to choose the unknown: speed, duty for a target speed, or the load torque at a speed.',
    fields: [
      {
        kind: 'select', key: 'drive', label: 'Topology',
        options: (Object.keys(DRIVE_LABEL) as Drive[]).map((value) => ({ value, label: DRIVE_LABEL[value] })),
        // The duty means something else in each topology (anti-phase: 50 % = 0 V), so a torque solved for a
        // given duty does not carry over: analyse the speed instead. A duty solved for a target speed keeps
        // its target unless the new topology cannot reach it.
        apply: (_v, s) => {
          if (s.solveFor === 'tL' || (s.solveFor === 'duty' && !compute(s as PwmMotorState).ok)) s.solveFor = 'n';
        },
        help: 'Low-side: one switch, current freewheels through a diode and can stop (discontinuous). Sign-magnitude H-bridge with synchronous rectification: the off state shorts the motor through two low-side switches, current can reverse, always continuous. Locked anti-phase: the bridge alternates +V_s / −V_s; 50 % duty is standstill.',
      },
      { kind: 'number', key: 'vs', symbol: 'V_s', label: 'Supply voltage', unit: 'V', min: 0.1, max: 1e4 },
      { kind: 'number', key: 'duty', symbol: 'D', label: 'Duty cycle', suffix: '%', min: 0, max: 100, solvable: true, help: 'Fraction of each period with the supply applied (switch on). For anti-phase: fraction at +V_s.' },
      { kind: 'number', key: 'f', symbol: 'f_PWM', label: 'PWM frequency', units: U_F, unitKey: 'fUnit', min: 1, max: 10e6 },
      { kind: 'number', key: 'ron', symbol: 'R_on', label: 'On-resistance', unit: 'Ω', min: 0, max: 100, help: 'R_DS(on) of each MOSFET (hot). One switch is in the path for the low-side drive, two for an H-bridge.' },
      { kind: 'number', key: 'vd', symbol: 'V_F', label: 'Diode drop', unit: 'V', min: 0, max: 5, visible: (s) => s.drive === 'lowside', help: 'Freewheel diode drop (Schottky ≈ 0.4–0.6 V).' },
    ],
  },
  {
    kind: 'section',
    title: 'Motor (datasheet)',
    note: 'Give K_t or K_v (click ◎ on the green one to switch); the other is calculated.',
    fields: [
      { kind: 'number', key: 'r', symbol: 'R', label: 'Resistance', unit: 'Ω', min: 1e-4, max: 1e5, help: 'Winding plus brush resistance at 25 °C; scaled to the winding temperature below.' },
      { kind: 'number', key: 'l', symbol: 'L', label: 'Inductance', units: U_L, unitKey: 'lUnit', min: 1e-9, max: 10, help: 'Armature inductance from the datasheet. It sets the current ripple with the PWM frequency.' },
      {
        kind: 'number', key: 'k', symbol: 'K_t', label: 'Torque/amp', units: U_KT, unitKey: 'kUnit', min: 1e-6, max: 100, solvable: true,
        solvedWhen: (_s, root) => !kGiven(root), onSolve: (_s, root) => (root.kForm = 'kv'), onUnsolve: (_s, root) => (root.kForm = 'k'),
        help: 'In SI units the torque constant (N·m/A) equals the back-EMF constant (V·s/rad).',
      },
      {
        kind: 'number', key: 'kv', symbol: 'K_v', label: 'Speed/volt', units: U_KV, unitKey: 'kvUnit', min: 1e-3, max: 1e7, solvable: true,
        solvedWhen: (_s, root) => kGiven(root), onSolve: (_s, root) => (root.kForm = 'k'), onUnsolve: (_s, root) => (root.kForm = 'kv'),
        help: 'Ideal no-load speed per volt, K_v = 1/K_t.',
      },
      { kind: 'number', key: 'i0', symbol: 'I₀', label: 'No-load I', unit: 'A', min: 0, max: 1e3, help: 'Stands for friction and iron losses as a constant torque K·I₀.' },
      { kind: 'number', key: 'tW', symbol: 'ϑ_W', label: 'Winding', suffix: '°C', min: -60, max: 250, help: 'Copper resistance rises 0.39 %/K.' },
    ],
  },
  {
    kind: 'section',
    title: 'Load',
    fields: [
      { kind: 'number', key: 'tL', symbol: 'T_L', label: 'Load torque', units: U_TORQUE, unitKey: 'tLUnit', min: 0, max: 1e4, solvable: true, help: 'Torque at the shaft (≥ 0). When solved: the torque at which the motor turns at speed n with duty D.' },
      { kind: 'number', key: 'n', symbol: 'n', label: 'Speed', units: U_SPEED, unitKey: 'nUnit', min: 0, max: 1e6, solvable: true, help: 'Shaft speed. Target speed when solving for D or T_L.' },
      { kind: 'number', key: 'lx', symbol: 'L_x', label: 'Series choke', units: U_LX, unitKey: 'lxUnit', min: 0, max: 10, zeroHint: 'none', help: 'Optional inductor in series with the motor to cut the ripple (motor makers recommend one for low-inductance motors on PWM).' },
    ],
  },
];

const fmtRpm = (w: number) => `${(w / RPM).toFixed(Math.abs(w / RPM) < 100 ? 2 : 0)} rpm`;
const fmtT = (t: number) => si(t, 'N·m', 4);
const fA = (i: number, d = 4) => si(i, 'A', d);
const fW = (p: number) => si(p, 'W', 3);

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: PwmMotorState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/** Effective circuit and motor from the state (hot resistance, total inductance). */
export function circuitOf(s: PwmMotorState): { c: PwmCircuit; m: MotorLoad; k: number; rHot: number } {
  const k = s.kForm === 'kv' ? 1 / s.kv : s.k;
  const rHot = windingResistance(s.r, s.tW);
  return {
    c: { drive: s.drive, vs: s.vs, d: s.duty / 100, f: s.f, ron: s.ron, vd: s.drive === 'lowside' ? s.vd : 0, r: rHot, l: s.l + (s.lx || 0) },
    m: { k, i0: s.i0, tL: s.tL },
    k,
    rHot,
  };
}

function outOfRange(s: PwmMotorState, msg: string): CalcReport {
  return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'OUT OF RANGE', tone: 'warn' }, error: msg };
}

function run(st: PwmMotorState): CalcReport {
  const s: PwmMotorState = { ...st };
  for (const key of ['vs', 'f', 'ron', 'vd', 'r', 'l', 'i0', 'tW'] as const) finite(key, s[key]);
  if (s.lx == null) s.lx = 0;
  finite('Series choke', s.lx);
  if (!(s.vs > 0)) throw new Error('Supply voltage must be > 0.');
  if (!(s.f > 0)) throw new Error('PWM frequency must be > 0.');
  if (!(s.r > 0)) throw new Error('Terminal resistance must be > 0.');
  if (!(s.l > 0) || s.lx < 0) throw new Error('Inductance must be > 0 (series choke ≥ 0).');
  if (s.ron < 0 || s.vd < 0 || s.i0 < 0) throw new Error('R_on, V_F and I₀ must be ≥ 0.');
  const kRaw = s.kForm === 'kv' ? finite('K_v', s.kv) : finite('K_t', s.k);
  if (!(kRaw > 0)) throw new Error(s.kForm === 'kv' ? 'Speed constant must be > 0.' : 'Torque constant must be > 0.');
  if (s.kForm === 'kv' && (1 / kRaw > 100 || 1 / kRaw < 1e-6)) return outOfRange(s, `K_t = 1/K_v would be ${si(1 / kRaw, 'N·m/A', 3)}, outside the 1 µN·m/A … 100 N·m/A this input accepts. Check the K_v value and its unit.`);
  if (s.solveFor !== 'duty') {
    finite('Duty cycle', s.duty);
    if (s.duty < 0 || s.duty > 100) throw new Error('Duty cycle must be 0 … 100 %.');
  }
  if (s.solveFor !== 'tL') {
    finite('Load torque', s.tL);
    if (s.tL < 0) throw new Error('Load torque must be ≥ 0 (this page models motoring only).');
  }
  if (s.solveFor !== 'n') {
    finite('Speed', s.n);
    if (s.n < 0) throw new Error('Speed must be ≥ 0 (forward rotation).');
  }
  const { c, m, k, rHot } = circuitOf(s);
  if (!(rHot > 0)) throw new Error('Winding temperature gives a non-positive resistance.');
  if (s.drive === 'lowside' && s.solveFor !== 'tL' && !(currentNeeded(m) > 0))
    throw new Error('With no load torque and no friction (I₀ = 0) a low-side drive spins the ideal motor up to E = V_s at any duty: enter I₀ > 0 or a load torque.');

  const warnings: string[] = [];
  const notes: string[] = [];
  let status: CalcReport['status'];
  let speed: number;
  let e: number;

  // ── solve
  if (s.solveFor === 'duty') {
    const d = dutyFor(c, m, s.n);
    if (d == null) {
      const full = operate({ ...c, d: 1 }, m);
      return {
        ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' },
        error: `${fmtRpm(s.n)} at ${fmtT(s.tL)} needs more than 100 % duty: the top speed at this load is ${fmtRpm(full.speed)}. Lower the speed or load, or raise V_s.`,
      };
    }
    s.duty = d * 100;
    c.d = d;
    speed = s.n;
    e = k * speed;
  } else if (s.solveFor === 'tL') {
    e = k * s.n;
    const w0 = waveform(c, e);
    let t = k * (w0.iAvg - s.i0);
    // zero load solved back from its own speed: the mean current equals I₀ up to round-off
    if (Math.abs(t) <= 1e-9 * k * Math.max(Math.abs(w0.iAvg), s.i0)) t = 0;
    if (t < 0) {
      return {
        ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' },
        error:
          s.n > 0
            ? `At ${s.duty.toPrecision(3)} % duty the motor cannot reach ${fmtRpm(s.n)} even unloaded (the mean current there, ${fA(w0.iAvg, 3)}, is below I₀ = ${fA(s.i0, 3)}). Raise the duty or lower the speed.`
            : `At ${s.duty.toPrecision(3)} % duty the motor cannot start: at standstill its mean current (${fA(w0.iAvg, 3)}) does not even cover friction (I₀ = ${fA(s.i0, 3)}), so no load torque ≥ 0 sets the speed to 0 rpm. Raise the duty or enter a speed above 0.`,
      };
    }
    if (t > 1e4) return outOfRange(s, `T_L would be ${fmtT(t)}, above the 10 kN·m this input accepts: the motor constants and supply describe a very large machine. Check K_t / K_v, R and V_s.`);
    s.tL = t;
    m.tL = t;
    speed = s.n;
  } else {
    const op = operate(c, m);
    speed = op.speed;
    e = op.e;
    if (speed > 1e6) return outOfRange(s, `The speed would be ${si(speed, 'rad/s', 3)} (${(speed / RPM).toPrecision(3)} rpm), above the 10⁶ rad/s this input accepts: V_s/K_t is unrealistically high. Check K_t / K_v and V_s.`);
    s.n = speed;
    if (op.regime === 'stalled') {
      status = { text: 'STALLED', tone: 'fail' };
      warnings.push(
        s.drive === 'antiphase' && c.d <= 0.5
          ? `Anti-phase drive at ${s.duty.toPrecision(3)} % duty gives a zero or negative average voltage: the motor holds or would turn backwards (not modelled). Use D > 50 % for forward rotation.`
          : `The drive cannot overcome T_L + friction at standstill (mean stall current ${fA(op.w.iAvg, 3)} < ${fA(currentNeeded(m), 3)} needed). The motor stalls: raise the duty or V_s, or gear down.`,
      );
    }
  }

  const w = waveform(c, e);
  const T = 1 / c.f;
  const pOut = s.tL * speed;
  const pFric = k * s.i0 * speed;
  const pIn = s.vs * w.isAvg;
  const eff = pIn > 0 && pOut > 0 ? pOut / pIn : 0;
  const ffLoss = w.iAvg > 0 ? (w.iRms / w.iAvg) ** 2 - 1 : 0;
  const rLoop = rHot + (s.drive === 'lowside' ? s.ron : 2 * s.ron);
  const vIdeal = s.drive === 'antiphase' ? (2 * c.d - 1) * s.vs : c.d * s.vs;
  // averaged-model comparison with the dc-motor-speed model (exact for the H-bridge drives in continuous conduction)
  const avgModel = operatingPoint({ v: vIdeal, r: rLoop, k, i0: s.i0 }, s.tL);
  const fig = motorFigures({ v: Math.max(vIdeal, 0), r: rLoop, k, i0: s.i0 });
  const tauE = c.l / rLoop;

  // ── report
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const primary: ResultItem[] = [];
  if (s.solveFor === 'duty') primary.push(item('duty', 'Duty cycle', s.duty, '%', `${s.duty.toPrecision(4)} %`, { symbol: 'D', solved: true, primary: true, note: `for ${fmtRpm(s.n)} at ${fmtT(s.tL)}` }));
  if (s.solveFor === 'tL') primary.push(item('tL', 'Load torque', s.tL, 'N·m', fmtT(s.tL), { symbol: 'T_L', solved: true, primary: true, note: `at ${fmtRpm(s.n)}, D ${s.duty.toPrecision(3)} %` }));
  primary.push(item('n', 'Speed', s.n, 'rad/s', fmtRpm(s.n), { symbol: 'n', solved: s.solveFor === 'n', primary: true, tone: status ? 'fail' : '', note: `${si(s.n, 'rad/s', 4)} · E ${si(e, 'V', 3)}` }));
  primary.push(item('iAvg', 'Mean current', w.iAvg, 'A', fA(w.iAvg), { symbol: 'Ī', primary: true, note: `RMS ${fA(w.iRms, 3)}` }));
  primary.push(item('ripple', 'Current ripple', w.ripple, 'A', `${fA(w.ripple, 3)} p-p`, { symbol: 'ΔI_pp', primary: true, tone: ffLoss > 0.1 ? 'warn' : '', note: w.mode === 'ccm' ? 'continuous conduction' : w.mode === 'dcm' ? `discontinuous: zero for ${((w.tZero / T) * 100).toFixed(1)} % of T` : 'no current' }));
  primary.push(item('eff', 'Efficiency', eff > 0 ? eff : null, '', eff > 0 ? `${(eff * 100).toFixed(1)} %` : '—', { symbol: 'η', primary: true, note: `P_out ${fW(pOut)} of ${fW(pIn)}` }));

  const g = (name: string) => ({ group: name });
  const rest: ResultItem[] = [
    item('iMax', 'Peak current', w.iMax, 'A', fA(w.iMax), { symbol: 'I_max', ...g('Current waveform') }),
    item('iMin', 'Minimum current', w.iMin, 'A', fA(w.iMin), { symbol: 'I_min', ...g('Current waveform') }),
    item('iRms', 'RMS current', w.iRms, 'A', fA(w.iRms), { symbol: 'I_rms', ...g('Current waveform') }),
    item('ffLoss', 'Extra copper loss from ripple', ffLoss, '', `${(ffLoss * 100).toFixed(2)} %`, { symbol: '(I_rms/Ī)²−1', ...g('Current waveform'), tone: ffLoss > 0.1 ? 'warn' : '' }),
    item('mode', 'Conduction', w.mode, '', w.mode === 'ccm' ? 'continuous (CCM)' : w.mode === 'dcm' ? 'discontinuous (DCM)' : 'none', g('Current waveform')),
    item('tauRatio', 'Electrical time constant', tauE, 's', `${si(tauE, 's', 3)} = ${(tauE / T).toPrecision(3)} T`, { symbol: 'τ_e = L/R', ...g('Current waveform') }),
    item('vIdeal', 'Ideal mean voltage', vIdeal, 'V', si(vIdeal, 'V', 4), { symbol: s.drive === 'antiphase' ? '(2D−1)V_s' : 'D·V_s', ...g('Voltages') }),
    item('vMotor', 'Mean motor voltage', w.vMotor, 'V', si(w.vMotor, 'V', 4), { symbol: 'V_m = E + RĪ', ...g('Voltages'), note: w.mode === 'dcm' ? 'raised by E during the zero-current time' : 'after switch / diode drops' }),
    item('backEmf', 'Back-EMF', e, 'V', si(e, 'V', 4), { symbol: 'E = Kω', ...g('Voltages') }),
    item('isAvg', 'Mean supply current', w.isAvg, 'A', fA(w.isAvg), { symbol: 'Ī_s', ...g('Supply') }),
    item('isRms', 'RMS supply current', w.isRms, 'A', fA(w.isRms), { symbol: 'I_s,rms', ...g('Supply') }),
    item('iCap', 'Bus capacitor ripple current', Math.sqrt(Math.max(w.isRms ** 2 - w.isAvg ** 2, 0)), 'A', fA(Math.sqrt(Math.max(w.isRms ** 2 - w.isAvg ** 2, 0)), 3), { symbol: 'I_C,rms', ...g('Supply'), note: 'AC part of the supply current' }),
    item('pIn', 'Input power', pIn, 'W', fW(pIn), { symbol: 'P_in', ...g('Power') }),
    item('pOut', 'Shaft power', pOut, 'W', fW(pOut), { symbol: 'P_out', ...g('Power') }),
    item('pCu', 'Copper loss', w.pCu, 'W', fW(w.pCu), { symbol: 'R·I_rms²', ...g('Power') }),
    item('pSw', 'Switch conduction loss', w.pSw, 'W', fW(w.pSw), { symbol: 'P_sw', ...g('Power'), note: 'switching transitions not included' }),
    ...(s.drive === 'lowside' ? [item('pDiode', 'Diode loss', w.pDiode, 'W', fW(w.pDiode), { symbol: 'V_F·Ī_D', ...g('Power') })] : []),
    item('pFric', 'Friction & iron loss', pFric, 'W', fW(pFric), { symbol: 'K·I₀·ω', ...g('Power') }),
    item('avgSpeed', 'Averaged-model speed', avgModel.regime === 'forward' ? avgModel.speed : 0, 'rad/s', avgModel.regime === 'forward' ? fmtRpm(avgModel.speed) : 'stalled', { ...g('DC-equivalent (averaged) motor'), note: `DC motor on ${si(vIdeal, 'V', 3)} through ${si(rLoop, 'Ω', 3)}` }),
    item('noLoadSpeed', 'No-load speed at this duty', fig.valid ? fig.noLoadSpeed : null, 'rad/s', fig.valid ? fmtRpm(fig.noLoadSpeed) : '—', { symbol: 'n₀', ...g('DC-equivalent (averaged) motor') }),
    item('stallCurrent', 'Mean stall current', fig.stallCurrent, 'A', fA(fig.stallCurrent), { symbol: 'Ī_A', ...g('DC-equivalent (averaged) motor'), note: 'D·V_s / R_loop' }),
    item('k', 'Torque constant', k, 'N·m/A', si(k, 'N·m/A', 4), { symbol: 'K_t', group: 'Motor constants', solved: s.kForm === 'kv' }),
    item('kv', 'Speed constant', 1 / k, 'rad/s/V', `${(1 / k / RPM).toPrecision(4)} rpm/V`, { symbol: 'K_v', group: 'Motor constants', solved: s.kForm !== 'kv' }),
    item('stallTorque', 'Stall torque at this duty', fig.valid ? fig.stallTorque : null, 'N·m', fig.valid ? fmtT(fig.stallTorque) : '—', { symbol: 'T_H', ...g('DC-equivalent (averaged) motor') }),
  ];

  if (ffLoss > 0.1) warnings.push(`The ripple adds ${(ffLoss * 100).toFixed(0)} % copper loss (I_rms/Ī = ${(w.iRms / w.iAvg).toFixed(3)}) and extra brush wear. Raise f_PWM or add a series choke L_x so that τ_e = L/R is several PWM periods.`);
  if (w.mode === 'dcm') notes.push(`Discontinuous conduction: the current is zero for ${((w.tZero / T) * 100).toFixed(1)} % of each period, the motor terminal then shows its back-EMF, and speed rises above the averaged model (${fmtRpm(avgModel.speed)}). Speed control becomes load-dependent at light load.`);
  if (s.drive === 'antiphase' && w.iMin < 0 && w.iAvg > 0) notes.push('Locked anti-phase: the current reverses within each period, so energy circulates back to the supply. The bus capacitor must absorb it.');
  if (s.drive === 'sync' && w.iMin < 0) notes.push('Sign-magnitude with synchronous rectification: the current goes negative in part of the period (brief regenerative braking), which keeps conduction continuous.');
  if (c.f < 20e3) notes.push(`f_PWM = ${si(c.f, 'Hz', 3)} is in the audible range: expect whine from the winding. 20 kHz or more is common.`);
  if (c.f > 100e3) notes.push('Above ~100 kHz switching losses (not modelled) usually dominate in motor drives.');
  if (s.tW > 155) warnings.push(`Winding temperature ${s.tW} °C exceeds the usual 155 °C insulation class limit for small motors.`);
  if (w.iMax > 0 && fig.valid && w.iMax > 0.8 * (s.vs / rLoop)) warnings.push(`Peak current ${fA(w.iMax, 3)} approaches the full-voltage stall current V_s/R = ${fA(s.vs / rLoop, 3)}: check the switch and current-limit ratings.`);
  notes.push(
    'Speed is taken as constant within a PWM period (mechanical time constant ≫ 1/f_PWM). The current in each switch state is solved exactly (first-order L–R circuit with back-EMF).',
    'Switching transitions, dead time and brush voltage drop are not modelled; switches are resistive, the diode a constant drop.',
  );

  const report: CalcReport = {
    ...emptyReport(ID),
    solveFor: s.solveFor,
    status,
    results: [...primary, ...rest],
    warnings,
    notes,
    summary: `${DRIVE_LABEL[s.drive]} · ${si(s.vs, 'V', 3)} at ${s.duty.toPrecision(3)} %, ${si(c.f, 'Hz', 3)} → ${fmtRpm(s.n)}, Ī ${fA(w.iAvg, 3)}, ΔI ${fA(w.ripple, 3)}`,
    details: { k, rHot, rLoop, e, speed, waveform: { ...w, segments: undefined }, vIdeal, solved: { duty: s.duty, tL: s.tL, n: s.n } },
  };
  report.graphs = graphs(s, c, m, k, e, w, rLoop, status != null);
  return report;
}

function graphs(s: PwmMotorState, c: PwmCircuit, m: MotorLoad, k: number, e: number, w: ReturnType<typeof waveform>, rLoop: number, stalled: boolean): GraphSpec[] {
  // 1 — current waveform over three periods
  const smp = sampleWaveform(c, e, w, 3);
  const wave: GraphSpec = {
    id: 'waveform',
    title: 'Current waveform',
    subtitle: `${s.duty.toPrecision(3)} % at ${si(c.f, 'Hz', 3)} · τe = ${si(c.l / rLoop, 's', 3)}`,
    x: { label: 'Time', unit: 's' },
    y: [
      { id: 'i', label: 'Armature current', unit: 'A', includeZero: true },
      { id: 'v', label: 'Motor voltage', unit: 'V', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'Motor voltage', x: smp.t, y: smp.v, axis: 'v', color: '#9a8f7a', width: 1.1, dash: [2, 3] },
      { label: 'Armature current i(t)', x: smp.t, y: smp.i, axis: 'i', width: 2.2, color: '#1f4e5f' },
    ],
    hlines: [{ value: w.iAvg, label: `Ī ${fA(w.iAvg, 3)}`, axis: 'i', color: '#c47b17', dash: [5, 3] }],
    legend: 'below',
  };

  // 2 — speed and mean current vs duty at this load
  const n = 81;
  const ds = Array.from({ length: n }, (_, i) => i / (n - 1));
  const ops = ds.map((d) => operate({ ...c, d }, m));
  const tL = m.tL;
  const avg = ds.map((d) => {
    const v = s.drive === 'antiphase' ? (2 * d - 1) * s.vs : d * s.vs;
    const op = operatingPoint({ v, r: rLoop, k, i0: s.i0 }, tL);
    return op.regime === 'forward' ? op.speed / RPM : 0;
  });
  const dutyGraph: GraphSpec = {
    id: 'vs-duty',
    title: 'Speed vs duty',
    subtitle: `At TL = ${fmtT(tL)}`,
    x: { label: 'Duty cycle D', unit: '%' },
    y: [
      { id: 'n', label: 'Speed', unit: 'rpm', includeZero: true },
      { id: 'i', label: 'Mean current', unit: 'A', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'Speed', x: ds.map((d) => d * 100), y: ops.map((o) => o.speed / RPM), axis: 'n', width: 2.2 },
      { label: 'Averaged DC model', x: ds.map((d) => d * 100), y: avg, axis: 'n', color: '#9a8f7a', width: 1.2, dash: [2, 3] },
      { label: 'Mean current', x: ds.map((d) => d * 100), y: ops.map((o) => o.w.iAvg), axis: 'i', color: '#c47b17', width: 1.6 },
    ],
    vlines: [{ value: c.d * 100, label: `D ${(c.d * 100).toPrecision(3)} %`, color: '#1f4e5f' }],
    markers: stalled ? [] : [{ x: c.d * 100, y: s.n / RPM, axis: 'n', label: fmtRpm(s.n) }],
  };

  // 3 — ripple vs PWM frequency at this back-EMF
  const fs = Array.from({ length: 121 }, (_, i) => 500 * 10 ** ((i / 120) * 3.6));
  if (c.f > fs[0] && c.f < fs[fs.length - 1]) fs.push(c.f), fs.sort((a, b) => a - b);
  const wf = fs.map((f) => waveform({ ...c, f }, e));
  const rippleGraph: GraphSpec = {
    id: 'ripple-vs-f',
    title: 'Ripple vs frequency',
    subtitle: `Same duty and back-EMF (${si(e, 'V', 3)})`,
    x: { label: 'PWM frequency', unit: 'Hz', log: true },
    y: [
      { id: 'i', label: 'Ripple ΔIpp', unit: 'A', log: true },
      { id: 'p', label: 'Extra copper loss', unit: '%', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'ΔIpp', x: fs, y: wf.map((x) => Math.max(x.ripple, 1e-12)), axis: 'i', width: 2.2 },
      { label: 'Extra copper loss', x: fs, y: wf.map((x) => (x.iAvg > 0 ? ((x.iRms / x.iAvg) ** 2 - 1) * 100 : 0)), axis: 'p', color: '#c47b17', width: 1.6 },
    ],
    hlines: [{ value: 10, label: '10 % extra loss', axis: 'p', color: '#8b1e1e', dash: [4, 4] }],
    vlines: [{ value: c.f, label: `fPWM ${si(c.f, 'Hz', 3)}`, color: '#1f4e5f' }],
  };
  return [wave, dutyGraph, rippleGraph];
}

/** Settable non-field keys (window.eeCalc / URL inputs): validate against the allowed values. */
const oneOf = <T extends string>(name: string, ok: readonly T[]) => (raw: unknown): T => {
  const v = String(raw) as T;
  if (!ok.includes(v)) throw new Error(`${name} must be one of ${ok.map((o) => JSON.stringify(o)).join(', ')}`);
  return v;
};

export const def: CalcDef<PwmMotorState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Exact piecewise first-order L–R–EMF solution of the armature current per switch state (periodic steady state, CCM/DCM), exact mean/RMS integrals; torque balance K·Ī = T_L + K·I₀ solved with Brent for speed, duty or torque. Mohan, Undeland & Robbins, Power Electronics 3e ch. 7 & 13; brushed-motor model from maxon “Key information” and Hughes & Drury ch. 3.',
  fields,
  defaults,
  // When the motor is stalled (n = 0) many duties and torques hold it there, so a round trip from a stalled
  // state need not return the entered D or T_L (harness "roundtrip" flags from the stall example are expected).
  solve: {
    default: 'n',
    analysis: 'n',
    options: [
      { key: 'n', label: 'Speed at a duty cycle' },
      { key: 'duty', label: 'Duty for a target speed' },
      { key: 'tL', label: 'Load torque at a speed and duty' },
    ],
  },
  compute,
  controls: { kForm: oneOf('kForm', ['k', 'kv'] as const) },
  sync: (s) => {
    // Keep the non-given motor constant in step (the solved one is also written back from the results).
    if (s.kForm === 'kv') {
      if (s.kv > 0) s.k = 1 / s.kv;
    } else if (s.k > 0) s.kv = 1 / s.k;
  },
  examples: [
    { id: 'default-re40', label: 'maxon RE 40 (24 V) on a low-side switch, 50 %, 20 kHz', state: defaults() },
    { id: 'duty-for-3000', label: 'Duty for 3000 rpm at 100 mN·m, sign-magnitude H-bridge', state: { ...defaults(), solveFor: 'duty', drive: 'sync', n: 3000 * RPM } },
    { id: 'liu-ripple', label: 'LiU TSTE25 exam: 250 V, D 0.8, 0.2 mH, 30 kHz, Ī 5 A (ΔI 6.67 A)', state: { ...defaults(), solveFor: 'n', drive: 'lowside', vs: 250, duty: 80, f: 30e3, fUnit: 'kHz', ron: 0, vd: 0, r: 1e-3, l: 0.2e-3, lUnit: 'mH', lx: 0, kForm: 'k', k: 1, kUnit: 'N·m/A', i0: 0, tW: 25, tL: 5, tLUnit: 'N·m', nUnit: 'rpm' } },
    { id: 'light-load-dcm', label: 'Light load, low-side at 5 kHz: discontinuous current', state: { ...defaults(), duty: 30, f: 5e3, tL: 0 } },
    { id: 'antiphase', label: 'Locked anti-phase at 70 % with a 100 µH series choke', state: { ...defaults(), drive: 'antiphase', duty: 70, lx: 100e-6 } },
    { id: 'stall', label: 'Edge case: 10 % duty cannot start 0.5 N·m', state: { ...defaults(), duty: 10, tL: 0.5 } },
  ],
};
