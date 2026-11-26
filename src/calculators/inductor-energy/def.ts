/** Inductor Energy — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { bracketE, E_SERIES, nearestE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { TIME_UNITS, si } from '@/core/units';
import { U_IND, U_OHM } from '@/core/unitsets';
import { energy, fluxLinkage, iOff, iRamp, lFor, tReach, turnOff, vFor } from './model';

export const ID = 'general/inductor-energy';

export type IndSolve = 'e' | 'l' | 'i' | 'v';

export interface IndState {
  /** e: energy and ramp time from L and I (analysis) · l / i: for a target · v: voltage for a ramp time */
  solveFor: IndSolve;
  /** Target when solving L or I: the stored energy E, or the ramp time t */
  target: 'energy' | 'time';
  l: number;
  lUnit: string;
  i: number;
  iUnit: string;
  e: number;
  eUnit: string;
  v: number;
  r: number;
  rUnit: string;
  t: number;
  tUnit: string;
  /** Datasheet saturation current; null = not checked */
  iSat: number | null;
  iSatUnit: string;
  /** Reverse voltage across the coil while it is switched off (clamp); null = not given */
  vClamp: number | null;
  /** coil: clamp across the coil (diode, or diode + zener) · ground: zener/TVS across a low-side switch */
  clampType: 'coil' | 'ground';
  /** Resistance in the decay loop (winding only for a clamp across the coil); null = same as R */
  rOff: number | null;
  rOffUnit: string;
  eseries: 'E6' | 'E12' | 'E24' | 'none';
}

export const defaults = (): IndState => ({
  solveFor: 'e',
  target: 'time',
  l: 10e-6,
  lUnit: 'µH',
  i: 2,
  iUnit: 'A',
  e: 20e-6,
  eUnit: 'µJ',
  v: 12,
  r: 0.05,
  rUnit: 'mΩ',
  t: 1.67364e-6,
  tUnit: 'µs',
  iSat: 3,
  iSatUnit: 'A',
  vClamp: null,
  clampType: 'coil',
  rOff: null,
  rOffUnit: 'Ω',
  eseries: 'E12',
});

// Solved values can reach the field limits: enough prefixes to show them readably. At the field minima (1 pA) E and t
// fall below 1 fJ / 1 fs ("5e-15 fJ"): the core has no atto prefix and such values are not for reading (harness 'unreadable').
const U_L = { ...U_IND, H: 1, kH: 1e3 };
const U_A: Record<string, number> = { A: 1, mA: 1e-3, 'µA': 1e-6, nA: 1e-9, kA: 1e3, MA: 1e6 };
const U_E: Record<string, number> = { 'µJ': 1e-6, mJ: 1e-3, J: 1, nJ: 1e-9, pJ: 1e-12, fJ: 1e-15, kJ: 1e3, MJ: 1e6, GJ: 1e9, TJ: 1e12 };
const U_T: Record<string, number> = { ...TIME_UNITS, ps: 1e-12, fs: 1e-15, ks: 1e3, Ms: 1e6 };
const U_R = { ...U_OHM, 'µΩ': 1e-6 };

const lOrI = (s: IndState) => s.solveFor === 'l' || s.solveFor === 'i';
const energyTarget = (s: IndState) => lOrI(s) && s.target === 'energy';
const timeGiven = (s: IndState) => s.solveFor === 'v' || (lOrI(s) && s.target === 'time');

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Inductor',
    note: 'Click ◎ to pick the unknown. E and t are computed unless one is the target.',
    fields: [
      { kind: 'number', key: 'l', symbol: 'L', label: 'Inductance', units: U_L, unitKey: 'lUnit', solvable: true, min: 1e-15, max: 1e5, onUnsolve: (_s, root) => (root.solveFor = 'e'),
        // ◎ on L: keep a time target only when I is reachable (I < V/R); otherwise design L for the energy
        onSolve: (_s, root) => {
          root.solveFor = 'l';
          if (root.target === 'time' && (!(root.t > 0) || (root.r > 0 && root.i * root.r >= root.v))) root.target = 'energy';
        },
        help: 'Inductance at the operating current. Power inductors lose inductance as they approach saturation (ferrite sharply, powdered iron gradually).' },
      { kind: 'number', key: 'i', symbol: 'I', label: 'Peak current', units: U_A, unitKey: 'iUnit', solvable: true, min: 1e-12, max: 1e7, onUnsolve: (_s, root) => (root.solveFor = 'e'), help: 'Current the inductor carries (the end of the ramp).' },
      {
        kind: 'number', key: 'e', symbol: 'E', label: 'Stored energy', units: U_E, unitKey: 'eUnit', solvable: true, min: 1e-40, max: 1e20, // covers ½·L·I² over the whole L and I ranges
        solvedWhen: (_s, root) => !energyTarget(root as IndState),
        onSolve: (_s, root) => (root.solveFor = 'e'),
        onUnsolve: (_s, root) => {
          if (!lOrI(root as IndState)) root.solveFor = 'l';
          root.target = 'energy';
        },
        help: 'E = ½·L·I². Click ◎ on the green value to make it a target (then L or I is solved for it).',
      },
      {
        kind: 'select', key: 'target', label: 'Design target', visible: (s) => lOrI(s as IndState),
        options: [
          { value: 'energy', label: 'Stored energy E' },
          { value: 'time', label: 'Ramp time t' },
        ],
      },
      { kind: 'number', key: 'iSat', symbol: 'I_sat', label: 'Saturation current', units: U_A, unitKey: 'iSatUnit', optional: true, zeroHint: 'not checked', min: 1e-12, max: 1e7, help: 'Datasheet saturation current (the current at which L has fallen by the stated amount, often 10–30 %). Leave blank to skip the check.' },
    ],
  },
  {
    kind: 'section',
    title: 'Current ramp',
    note: 'A step V through R into L, starting at 0 A.',
    fields: [
      { kind: 'number', key: 'v', symbol: 'V', label: 'Applied voltage', unit: 'V', solvable: true, min: 1e-9, max: 1e7, onUnsolve: (_s, root) => (root.solveFor = 'e'), help: 'Voltage step across the coil and its series resistance (supply minus switch drop).' },
      { kind: 'number', key: 'r', symbol: 'R', label: 'Series resistance', units: U_R, unitKey: 'rUnit', min: 0, max: 1e9, help: 'Everything in the loop: winding DCR, switch on-resistance, sense resistor, source resistance. 0 gives a straight ramp V·t/L.' },
      {
        kind: 'number', key: 't', symbol: 't', label: 'Time to reach I', units: U_T, unitKey: 'tUnit', solvable: true, min: 0, max: 1e25, // a computed ramp time can be very long (large L, tiny V)
        solvedWhen: (_s, root) => !timeGiven(root as IndState),
        onSolve: (_s, root) => (root.solveFor = 'e'),
        onUnsolve: (_s, root) => {
          // a time target is met by L when the current is reachable (I < V/R); otherwise only a higher V can do it
          if (!lOrI(root as IndState)) root.solveFor = root.r > 0 && root.i * root.r >= root.v ? 'v' : 'l';
          root.target = 'time';
        },
        help: 'Time for the current to rise from 0 to I. Click ◎ on the green value to make it a target (then L, I or V is solved for it).',
      },
      { kind: 'number', key: 'vClamp', symbol: 'V_cl', label: 'Turn-off clamp voltage', unit: 'V', optional: true, zeroHint: 'not given', min: 1e-3, max: 1e7, help: 'Clamp across the coil: the reverse voltage across the coil while the current decays (≈ 0.7 V for a diode, V_F + V_Z for a diode in series with a zener). Zener/TVS across a low-side switch: its breakdown voltage V_Z (the coil then sees V_Z − V). Leave blank to skip.' },
      {
        kind: 'select', key: 'clampType', label: 'Clamp arrangement', visible: (s) => s.vClamp != null,
        options: [{ value: 'coil', label: 'Across the coil' }, { value: 'ground', label: 'Zener across the switch' }],
        help: 'Across the coil: a diode (or diode + zener) from the switch end of the coil back to the supply end; the supply is out of the decay loop. Zener/TVS across a low-side switch: the supply stays in the loop and also feeds the zener while the current decays, so the zener absorbs V_Z/(V_Z − V) times the clamp energy.',
      },
      { kind: 'number', key: 'rOff', symbol: 'R_off', label: 'Decay-loop resistance', units: U_R, unitKey: 'rOffUnit', optional: true, zeroHint: 'same as R', min: 0, max: 1e9, visible: (s) => s.vClamp != null, help: 'Resistance the decaying current flows through: usually the winding DCR alone, since the switch, sense resistor and source are outside a clamp across the coil. Blank uses R.' },
    ],
  },
  {
    kind: 'section',
    title: 'Options',
    collapsed: true,
    fields: [
      { kind: 'select', key: 'eseries', label: 'Standard values', options: [{ value: 'E6', label: 'E6' }, { value: 'E12', label: 'E12' }, { value: 'E24', label: 'E24' }, { value: 'none', label: 'Off' }], help: 'Preferred inductances (IEC 60063) listed around a solved L. Power inductors are mostly sold in E6 and E12 steps.' },
    ],
  },
];

const fA = (i: number) => si(i, 'A', 4);
const fT = (t: number) => si(t, 's', 4);
const fE = (e: number) => si(e, 'J', 4);
const fin = (name: string, v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
};

export function compute(st: IndState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: IndState): CalcReport {
  const s: IndState = { ...st };
  for (const [k, n] of [['l', 'Inductance'], ['i', 'Current'], ['e', 'Energy'], ['v', 'Voltage'], ['r', 'Resistance'], ['t', 'Time']] as const) fin(n, s[k]);
  if (s.r < 0) throw new Error('Series resistance must be ≥ 0.');
  if (s.solveFor !== 'l' && !(s.l > 0)) throw new Error('Inductance must be > 0.');
  if (s.solveFor !== 'i' && !(s.i > 0)) throw new Error('Current must be > 0.');
  if (s.solveFor !== 'v' && !(s.v > 0)) throw new Error('Applied voltage must be > 0.');
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });
  const tooHigh = () => `I = ${fA(s.i)} is never reached: with V = ${si(s.v, 'V', 4)} across ${si(s.r, 'Ω', 4)} the current levels off at V/R = ${fA(s.v / s.r)}. Raise V, lower R, or aim for a lower current.`;

  // ── the unknown
  if (energyTarget(s)) {
    if (!(s.e > 0)) throw new Error('Enter a target energy E > 0.');
    if (s.solveFor === 'l') s.l = (2 * s.e) / (s.i * s.i);
    else s.i = Math.sqrt((2 * s.e) / s.l);
  } else if (timeGiven(s)) {
    if (!(s.t > 0)) throw new Error('Enter a ramp time t > 0.');
    if (s.solveFor === 'l') {
      const l = lFor(s.i, s.t, s.v, s.r);
      if (!Number.isFinite(l)) return fail(tooHigh());
      s.l = l;
    } else if (s.solveFor === 'i') s.i = iRamp(s.t, s.l, s.v, s.r);
    else s.v = vFor(s.i, s.t, s.l, s.r);
  }
  const E = energy(s.l, s.i);
  s.e = E;
  const tR = tReach(s.i, s.l, s.v, s.r);
  const reached = Number.isFinite(tR);
  if (!timeGiven(s) && reached) s.t = tR;
  const lam = fluxLinkage(s.l, s.i);
  const tau = s.r > 0 ? s.l / s.r : null;
  const iFinal = s.r > 0 ? s.v / s.r : null;

  const warnings: string[] = [];
  const notes: string[] = [];
  if (!reached) warnings.push(tooHigh());
  const sat = s.iSat != null && s.i > s.iSat * (1 + 1e-9);
  if (sat) warnings.push(`I = ${fA(s.i)} is above I_sat = ${fA(s.iSat!)}: the core saturates, L collapses and the current then rises much faster than this ideal ramp. Use a part with I_sat above the peak current (with margin), or lower the peak.`);
  else if (s.iSat != null && s.i > 0.8 * s.iSat) notes.push(`I is ${((s.i / s.iSat) * 100).toFixed(0)} % of I_sat: L is already reduced there (by the datasheet’s saturation criterion at I_sat), and I_sat falls when the core is hot.`);
  if (iFinal != null && reached && s.i > 0.95 * iFinal) warnings.push(`I is ${((s.i / iFinal) * 100).toFixed(1)} % of the final current V/R: the ramp is nearly flat here, so small changes in V or R move the time a lot.`);
  if (sat && s.iSat != null) notes.push(`Energy at I_sat: ${fE(energy(s.l, s.iSat))} — the most this inductor can usefully hold.`);

  // turn-off: the reverse voltage across the coil is V_cl (clamp across the coil) or V_Z − V (zener across a low-side
  // switch, the supply still in the loop); the decay loop has R_off (blank: R)
  const ground = s.clampType === 'ground';
  const rOff = s.rOff ?? s.r;
  const vCoil = s.vClamp != null && s.vClamp > 0 ? (ground ? s.vClamp - s.v : s.vClamp) : null;
  if (ground && vCoil != null && vCoil <= 0) warnings.push(`V_Z = ${si(s.vClamp!, 'V', 4)} is not above the supply ${si(s.v, 'V', 4)}: a zener across the switch would conduct whenever the switch is off. Use V_Z well above V (or a clamp across the coil).`);
  const offRaw = vCoil != null && vCoil > 0 ? turnOff(s.i, s.l, rOff, vCoil) : null;
  // energy into the clamp device: V_cl·∫i dt across the coil; V_Z·∫i dt for the zener, of which V·∫i dt comes from the supply
  const off = offRaw ? { ...offRaw, eDevice: ground ? (offRaw.eClamp * s.vClamp!) / vCoil! : offRaw.eClamp, eSupply: ground ? (offRaw.eClamp * s.v) / vCoil! : 0, vCoil: vCoil! } : null;
  if (s.vClamp != null && !ground) notes.push('Turn-off uses R_off for the decay loop (blank: the whole R). With a clamp across the coil only the winding resistance is in that loop.');

  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const forWhat = energyTarget(s) ? `E = ${fE(s.e)}` : `t = ${fT(s.t)}`;
  if (s.solveFor === 'l') results.push(item('l', 'Inductance', s.l, 'H', si(s.l, 'H', 4), { symbol: 'L', primary: true, solved: true, note: `for ${forWhat} at ${fA(s.i)}` }));
  if (s.solveFor === 'i') results.push(item('i', 'Peak current', s.i, 'A', fA(s.i), { symbol: 'I', primary: true, solved: true, note: `for ${forWhat}`, tone: sat ? 'fail' : '' }));
  if (s.solveFor === 'v') results.push(item('v', 'Applied voltage', s.v, 'V', si(s.v, 'V', 4), { symbol: 'V', primary: true, solved: true, note: `reaches ${fA(s.i)} in ${fT(s.t)}` }));
  results.push(item('e', 'Stored energy', E, 'J', fE(E), { symbol: 'E', primary: true, solved: !energyTarget(s), note: `½·L·I² at ${fA(s.i)}` }));
  results.push(item('t', 'Time to reach I', reached || timeGiven(s) ? s.t : null, 's', reached || timeGiven(s) ? fT(s.t) : '— (never reached)', { symbol: 't', primary: true, solved: !timeGiven(s), tone: reached ? '' : 'warn', note: tau != null ? `${(s.t / tau).toPrecision(3)} τ from 0 A` : 'straight ramp V·t/L' }));
  results.push(item('lambda', 'Flux linkage', lam, 'Wb', si(lam, 'Wb', 4), { symbol: 'λ', primary: true, note: 'L·I (volt-seconds)' }));

  const g1 = 'Ramp';
  results.push(
    item('didt', 'Initial slope', s.v / s.l, 'A/s', `${si(s.v / s.l / 1e6, 'A/µs', 4)}`, { symbol: 'di/dt', group: g1, note: 'V/L at t = 0' }),
    item('tau', 'Time constant', tau, 's', tau != null ? fT(tau) : '∞ (R = 0)', { symbol: 'τ', group: g1, note: 'L/R' }),
    item('iFinal', 'Final current', iFinal, 'A', iFinal != null ? fA(iFinal) : 'unlimited (R = 0)', { symbol: 'V/R', group: g1 }),
    item('pctFinal', 'I as % of final', iFinal != null ? (s.i / iFinal) * 100 : null, '%', iFinal != null ? `${((s.i / iFinal) * 100).toFixed(2)} %` : '—', { group: g1, tone: iFinal != null && s.i > 0.95 * iFinal ? 'warn' : '' }),
    item('tLinear', 'Ideal ramp time (R = 0)', (s.l * s.i) / s.v, 's', fT((s.l * s.i) / s.v), { group: g1, note: 'L·I/V' }),
    item('pR', 'Loss in R at I', s.i * s.i * s.r, 'W', si(s.i * s.i * s.r, 'W', 4), { symbol: 'I²R', group: g1 }),
  );
  if (s.iSat != null) {
    const eSat = energy(s.l, s.iSat);
    results.push(
      item('satMargin', 'Current vs I_sat', s.i / s.iSat, '', `${((s.i / s.iSat) * 100).toFixed(1)} % of ${fA(s.iSat)}`, { group: 'Saturation', tone: sat ? 'fail' : s.i > 0.8 * s.iSat ? 'warn' : 'pass' }),
      item('eSat', 'Energy at I_sat', eSat, 'J', fE(eSat), { symbol: 'E_sat', group: 'Saturation', note: '½·L·I_sat²' }),
    );
  }
  if (off) {
    results.push(
      item('tOff', 'Decay time to 0 A', off.t, 's', fT(off.t), { symbol: 't_off', group: 'Turn-off', note: `${rOff > 0 ? 'τ_off·ln(1 + I·R_off/V_coil)' : 'L·I/V_coil'}, V_coil = ${si(off.vCoil, 'V', 4)}` }),
      item('eClamp', ground ? 'Energy into the zener' : 'Energy into the clamp', off.eDevice, 'J', fE(off.eDevice), { symbol: 'E_cl', group: 'Turn-off', note: ground ? `V_Z·∫i dt: ${fE(off.eClamp)} from the coil + ${fE(off.eSupply)} from the supply` : 'V_cl·∫i dt' }),
      ...(ground ? [item('eSupply', 'Energy from the supply (decay)', off.eSupply, 'J', fE(off.eSupply), { group: 'Turn-off', note: 'V·∫i dt' })] : []),
      item('eROff', 'Energy into R_off', off.eR, 'J', fE(off.eR), { group: 'Turn-off' }),
      item('vSwitch', 'Switch voltage (off)', ground ? s.vClamp! : s.v + s.vClamp!, 'V', si(ground ? s.vClamp! : s.v + s.vClamp!, 'V', 4), { symbol: ground ? 'V_Z' : 'V + V_cl', group: 'Turn-off', note: 'plus ringing' }),
    );
  }

  // ── preferred values around a solved L
  const tables: TableSpec[] = [];
  if (s.solveFor === 'l' && s.eseries !== 'none') {
    const base = E_SERIES[s.eseries];
    const [lo, hi] = bracketE(s.eseries, s.l);
    const step = 10 ** (1 / base.length);
    // the bracketing pair and one more preferred value on each side
    const list = [...new Set([nearestE(lo / step, s.eseries), lo, hi, nearestE(hi * step, s.eseries)])].sort((a, b) => a - b);
    const rows: Record<string, number | string | null>[] = [];
    const disp: Record<string, string>[] = [];
    const tones: ('pass' | 'warn' | 'fail' | '')[] = [];
    for (const L of list) {
      const e = energy(L, s.i);
      const t = tReach(s.i, L, s.v, s.r);
      const pass = energyTarget(s) ? e >= s.e * (1 - 1e-9) : Number.isFinite(t) && t <= s.t * (1 + 1e-9);
      rows.push({ l: L, e, t: Number.isFinite(t) ? t : null });
      disp.push({ l: si(L, 'H', 3), e: fE(e), t: Number.isFinite(t) ? fT(t) : 'never' });
      tones.push(sat ? 'fail' : pass ? 'pass' : 'fail');
    }
    tables.push({
      id: 'preferred',
      title: `Nearest ${s.eseries} inductances at ${fA(s.i)}`,
      columns: [
        { key: 'l', label: 'L', unit: 'H', align: 'left' },
        { key: 'e', label: 'Energy at I', unit: 'J' },
        { key: 't', label: 'Time to reach I', unit: 's' },
      ],
      rows,
      display: disp,
      rowTones: tones,
      note: energyTarget(s) ? `Pass: stores at least the target ${fE(s.e)} at ${fA(s.i)}.` : `Pass: reaches ${fA(s.i)} within the target ${fT(s.t)}.${sat ? ' All fail: the current exceeds I_sat.' : ''}`,
    });
  }

  notes.push('Ideal linear inductor: constant L up to I (no saturation), no core loss, no winding capacitance. The ramp starts from 0 A with an ideal voltage step.');

  return {
    ...emptyReport(ID),
    ok: true,
    solveFor: s.solveFor,
    status: s.iSat != null ? (sat ? { text: 'SATURATES', tone: 'fail' } : { text: 'BELOW I_sat', tone: 'pass' }) : undefined,
    results,
    graphs: graphs(s, reached ? s.t : null, tau, off),
    tables,
    warnings,
    notes,
    summary: `${si(s.l, 'H', 4)} at ${fA(s.i)}: E = ${fE(E)} · λ = ${si(lam, 'Wb', 4)}${reached ? ` · ${fT(s.t)} to ramp up from ${si(s.v, 'V', 4)}` : ''}`,
    details: { state: s, tau, iFinal, turnOff: off },
  };
}

function graphs(s: IndState, tR: number | null, tau: number | null, off: { t: number; vCoil: number } | null): GraphSpec[] {
  // on-ramp up to the target time, then (if a clamp is given) the turn-off decay
  const tOn = tR ?? 5 * (tau ?? 1);
  const tOff = off ? off.t : 0;
  const N = 240;
  const ts: number[] = [];
  const is: number[] = [];
  for (let k = 0; k <= N; k++) {
    const t = (tOn * k) / N;
    ts.push(t);
    is.push(Math.min(iRamp(t, s.l, s.v, s.r), tR == null ? Infinity : s.i));
  }
  if (off && tR != null) {
    for (let k = 1; k <= N; k++) {
      const t = (tOff * k) / N;
      ts.push(tOn + t);
      is.push(Math.max(iOff(t, s.i, s.l, s.rOff ?? s.r, off.vCoil), 0));
    }
  }
  const hl: GraphSpec['hlines'] = [{ value: s.i, label: `I = ${fA(s.i)}`, color: '#c47b17', dash: [5, 3] }];
  const iMaxPlot = Math.max(...is);
  if (s.iSat != null && s.iSat < 2 * iMaxPlot) hl.push({ value: s.iSat, label: `I_sat = ${fA(s.iSat)}`, color: '#8b1e1e', dash: [5, 4] });
  if (s.r > 0 && s.v / s.r < 1.6 * iMaxPlot) hl.push({ value: s.v / s.r, label: 'V/R', color: '#9a8f7a', dash: [2, 3] });
  const ramp: GraphSpec = {
    id: 'ramp',
    title: off && tR != null ? 'Current: ramp up, then decay into the clamp' : 'Current ramp after the voltage step',
    x: { label: 'Time', unit: 's' },
    y: [{ id: 'i', label: 'Current', unit: 'A', includeZero: true }],
    series: [{ label: 'i(t)', x: ts, y: is, width: 2.2, color: '#1f4e5f' }],
    hlines: hl,
    vlines: off && tR != null ? [{ value: tOn, label: 'switch off', color: '#9a8f7a', dash: [3, 3] }] : [],
    markers: tR != null ? [{ x: tR, y: s.i, label: `t = ${fT(tR)}`, color: '#c47b17' }] : [],
    legend: 'below',
  };
  const iTop = Math.max(s.i, s.iSat ?? 0) * 1.3;
  const M = 160;
  const ii = Array.from({ length: M + 1 }, (_, k) => (iTop * k) / M);
  const eGraph: GraphSpec = {
    id: 'energy',
    title: 'Stored energy vs current',
    subtitle: 'E = ½·L·I², for constant L (no saturation)',
    x: { label: 'Current', unit: 'A' },
    y: [{ id: 'e', label: 'Energy', unit: 'J', includeZero: true }],
    series: [{ label: 'E(I)', x: ii, y: ii.map((x) => energy(s.l, x)), width: 2.2, color: '#1f4e5f' }],
    vlines: s.iSat != null ? [{ value: s.iSat, label: `I_sat`, color: '#8b1e1e', dash: [5, 4] }] : [],
    markers: [{ x: s.i, y: energy(s.l, s.i), label: `E = ${fE(energy(s.l, s.i))}`, color: '#c47b17' }],
  };
  return [ramp, eGraph];
}

const D = defaults();

export const def: CalcDef<IndState> = {
  id: ID,
  version: '0.1.0',
  method: 'E = ½LI², λ = LI, v = L di/dt (Alexander & Sadiku, Fundamentals of Electric Circuits, §6.4); RL step response i(t) = (V/R)(1 − e^(−tR/L)) and its exact inverse t = −(L/R)ln(1 − IR/V) (ibid. §7.6); turn-off into a clamp from L di/dt = −(V_cl + iR). All solves are closed-form rearrangements.',
  fields,
  defaults,
  solve: {
    default: 'e',
    analysis: 'e',
    options: [
      { key: 'e', label: 'Energy and ramp time from L and I' },
      { key: 'l', label: 'L for a target (E, or ramp time t)' },
      { key: 'i', label: 'I for a target (E, or ramp time t)' },
      { key: 'v', label: 'V to reach I in time t' },
    ],
  },
  compute,
  examples: [
    { id: 'power', label: '10 µH power inductor ramped to 2 A from 12 V (I_sat 3 A)', state: { ...D } },
    { id: 'sadiku-pp-6-8', label: 'A&S practice 6.8: 1 mH at 60 mA peak stores 1.8 µJ', state: { ...D, solveFor: 'e', l: 1e-3, lUnit: 'mH', i: 60e-3, iUnit: 'mA', eUnit: 'µJ', v: 6e-3, r: 0, rUnit: 'Ω', tUnit: 'ms', iSat: null, vClamp: null } },
    { id: 'relay', label: '12 V relay coil (0.8 H, 400 Ω) to 90 % current, diode clamp at turn-off', state: { ...D, solveFor: 'e', l: 0.8, lUnit: 'H', i: 27e-3, iUnit: 'mA', eUnit: 'µJ', v: 12, r: 400, rUnit: 'Ω', tUnit: 'ms', iSat: null, vClamp: 0.7, clampType: 'coil', rOff: null } },
    { id: 'zener', label: 'Same relay, 24 V zener across a low-side switch: faster release, the zener takes 2× the coil’s energy', state: { ...D, solveFor: 'e', l: 0.8, lUnit: 'H', i: 27e-3, iUnit: 'mA', eUnit: 'µJ', v: 12, r: 400, rUnit: 'Ω', tUnit: 'ms', iSat: null, vClamp: 24, clampType: 'ground', rOff: null } },
    { id: 'l-for-time', label: 'L for a 5 µs ramp to 3 A from 24 V (E12 parts)', state: { ...D, solveFor: 'l', target: 'time', i: 3, iUnit: 'A', v: 24, r: 0.1, rUnit: 'mΩ', t: 5e-6, tUnit: 'µs', iSat: 4, eseries: 'E12', vClamp: null } },
    { id: 'saturation', label: 'Edge case: 4.7 µH pushed to 5 A with I_sat 4 A', state: { ...D, solveFor: 'e', l: 4.7e-6, i: 5, iUnit: 'A', v: 5, r: 0.03, rUnit: 'mΩ', iSat: 4, vClamp: null } },
  ],
};
