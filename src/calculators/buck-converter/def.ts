/** Buck converter power stage — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_IND, U_OHM, withDefault } from '@/core/unitsets';
import { type BuckInputs, type BuckOutputs, type Rectifier, analyzeBuck, coutForStep } from './model';

export type BuckSolve = 'l' | 'ripplePct' | 'fsw' | 'cout';

export interface BuckState {
  solveFor: BuckSolve;
  vin: number;
  vout: number;
  iout: number;
  fsw: number;
  fswUnit: string;
  ripplePct: number;
  l: number;
  lUnit: string;
  dcr: number;
  dcrUnit: string;
  cout: number;
  coutUnit: string;
  esr: number;
  esrUnit: string;
  dvOut: number;
  rect: Rectifier;
  rHs: number;
  rHsUnit: string;
  rLs: number;
  rLsUnit: string;
  vf: number;
  tsw: number;
  qg: number;
  vdrv: number;
  cin: number;
  cinUnit: string;
  esrIn: number;
  esrInUnit: string;
  iStep: number;
}

export const defaults = (): BuckState => ({
  solveFor: 'l',
  vin: 12,
  vout: 3.3,
  iout: 3,
  fsw: 500e3,
  fswUnit: 'kHz',
  ripplePct: 30,
  l: 4.7e-6,
  lUnit: 'µH',
  dcr: 15e-3,
  dcrUnit: 'mΩ',
  cout: 44e-6,
  coutUnit: 'µF',
  esr: 5e-3,
  esrUnit: 'mΩ',
  dvOut: 10e-3,
  rect: 'sync',
  rHs: 20e-3,
  rHsUnit: 'mΩ',
  rLs: 10e-3,
  rLsUnit: 'mΩ',
  vf: 0.45,
  tsw: 20e-9,
  qg: 20e-9,
  vdrv: 5,
  cin: 20e-6,
  cinUnit: 'µF',
  esrIn: 5e-3,
  esrInUnit: 'mΩ',
  iStep: 1.5,
});

const U_MOHM = withDefault(U_OHM, 'mΩ');
const U_CAP_U = withDefault(U_CAP, 'µF');
const U_IND_U = withDefault(U_IND, 'µH');
const U_FREQ_K = withDefault(U_FREQ, 'kHz');

const rippleComputed = (_s: any, root: any) => root.solveFor === 'ripplePct' || root.solveFor === 'cout';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'vin', symbol: 'V_in', label: 'Input voltage', unit: 'V', min: 0.1, max: 1000, help: 'Use the highest input voltage for the inductor ripple and peak current (SLVA477), the lowest to check the maximum duty cycle.' },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output voltage', unit: 'V', min: 0.05, max: 1000 },
      { kind: 'number', key: 'iout', symbol: 'I_out', label: 'Output current', unit: 'A', min: 1e-6, max: 1000, help: 'Load current (the average inductor current).' },
      { kind: 'number', key: 'fsw', symbol: 'f_sw', label: 'Switching frequency', units: U_FREQ_K, unitKey: 'fswUnit', unitFamily: 'none', solvable: true, min: 1e3, max: 100e6 },
    ],
  },
  {
    kind: 'section',
    title: 'Inductor',
    fields: [
      {
        kind: 'number',
        key: 'ripplePct',
        symbol: 'r',
        label: 'Ripple ratio',
        suffix: '%',
        min: 1e-6,
        max: 1e6,
        solvable: true,
        solvedWhen: rippleComputed,
        onSolve: (_s, root) => (root.solveFor = 'ripplePct'),
        onUnsolve: (_s, root) => (root.solveFor = 'l'),
        help: 'r = ΔIL/Iout: peak-to-peak inductor ripple as a percentage of the load current. 20–40 % is the usual starting point (TI SLVA477). With a diode rectifier the converter enters discontinuous conduction above 200 %; a forced-PWM synchronous buck stays in CCM with negative inductor current.',
      },
      { kind: 'number', key: 'l', symbol: 'L', label: 'Inductance', units: U_IND_U, unitKey: 'lUnit', solvable: true, min: 1e-9, max: 1, help: 'Use the inductance at the operating current: ferrite and powder cores lose inductance as they approach saturation.' },
      { kind: 'number', key: 'dcr', symbol: 'DCR', label: 'Winding resistance', units: U_MOHM, unitKey: 'dcrUnit', min: 0, max: 100 },
    ],
  },
  {
    kind: 'section',
    title: 'Output capacitor',
    fields: [
      { kind: 'number', key: 'cout', symbol: 'C_out', label: 'Output capacitance', units: U_CAP_U, unitKey: 'coutUnit', solvable: true, min: 1e-9, max: 1, help: 'Effective capacitance at the output voltage. Ceramic X5R/X7R parts can lose half their rated value under DC bias.' },
      { kind: 'number', key: 'esr', symbol: 'ESR', label: 'Output cap ESR', units: U_MOHM, unitKey: 'esrUnit', min: 0, max: 100, help: 'Equivalent series resistance of the whole output bank (parallel parts divide it).' },
      {
        kind: 'number',
        key: 'dvOut',
        symbol: 'ΔV_out',
        label: 'Output ripple (p-p)',
        unit: 'V',
        min: 1e-12,
        max: 1000,
        solvable: true,
        solvedWhen: (_s, root) => root.solveFor !== 'cout',
        // Leaving "solve for Cout": make ΔVout a result again without turning L or fsw into the unknown.
        onSolve: (_s, root) => (root.solveFor = 'ripplePct'),
        onUnsolve: (_s, root) => (root.solveFor = 'cout'),
        help: 'Calculated from L, Cout and ESR. Click ◎ to type a target instead and solve for Cout.',
      },
      { kind: 'number', key: 'iStep', symbol: 'ΔI_step', label: 'Load step', unit: 'A', min: 0, max: 1000, help: 'Optional load-current step for the transient estimate (SLVA477 eq. 14). 0 = skip.' },
    ],
  },
  {
    kind: 'section',
    title: 'Switches & losses',
    collapsed: true,
    note: 'Conduction drops set the duty cycle; the rest only feed the loss and efficiency estimate.',
    fields: [
      { kind: 'select', key: 'rect', label: 'Rectifier', options: [{ value: 'sync', label: 'Synchronous (low-side FET)' }, { value: 'diode', label: 'Diode (asynchronous)' }] },
      { kind: 'number', key: 'rHs', symbol: 'R_on,HS', label: 'High-side on-resistance', units: U_MOHM, unitKey: 'rHsUnit', min: 0, max: 100 },
      { kind: 'number', key: 'rLs', symbol: 'R_on,LS', label: 'Low-side on-resistance', units: U_MOHM, unitKey: 'rLsUnit', min: 0, max: 100, visible: (s) => s.rect === 'sync' },
      { kind: 'number', key: 'vf', symbol: 'V_F', label: 'Diode forward voltage', unit: 'V', min: 0, max: 5, visible: (s) => s.rect === 'diode', help: 'At the load current and a warm junction; Schottky diodes are typically 0.3–0.6 V.' },
      { kind: 'number', key: 'tsw', symbol: 't_edges', label: 'Switch-node edges', unit: 's', min: 0, max: 1e-5, help: 'Sum of the rise and fall times of the switch node. Hard-switching loss ≈ ½·Vin·I·(tr + tf)·fsw.' },
      { kind: 'number', key: 'qg', symbol: 'Q_g', label: 'Total gate charge', unit: 'C', min: 0, max: 1e-5, help: 'Sum over the FETs that are driven each cycle. Gate-drive loss = Qg·Vdrv·fsw (TI SLUA618).' },
      { kind: 'number', key: 'vdrv', symbol: 'V_drv', label: 'Gate drive voltage', unit: 'V', min: 0, max: 30 },
    ],
  },
  {
    kind: 'section',
    title: 'Input capacitor',
    collapsed: true,
    fields: [
      { kind: 'number', key: 'cin', symbol: 'C_in', label: 'Input capacitance', units: U_CAP_U, unitKey: 'cinUnit', min: 1e-9, max: 1 },
      { kind: 'number', key: 'esrIn', symbol: 'ESR_in', label: 'Input cap ESR', units: U_MOHM, unitKey: 'esrInUnit', min: 0, max: 100 },
    ],
  },
];

const toInputs = (s: BuckState): BuckInputs => ({
  vin: s.vin,
  vout: s.vout,
  iout: s.iout,
  fsw: s.fsw,
  l: s.l,
  dcr: s.dcr,
  cout: s.cout,
  esr: s.esr,
  rect: s.rect,
  rHs: s.rHs,
  rLs: s.rect === 'sync' ? s.rLs : 0,
  vf: s.rect === 'diode' ? s.vf : 0,
  tsw: s.tsw,
  qg: s.qg,
  vdrv: s.vdrv,
  cin: s.cin,
  esrIn: s.esrIn,
});

const SOLVE_RANGE: Record<'l' | 'fsw' | 'cout', { lo: number; hi: number }> = {
  l: { lo: 1e-9, hi: 1 },
  fsw: { lo: 1e3, hi: 100e6 },
  cout: { lo: 1e-9, hi: 1 },
};

const LABEL: Record<string, string> = { l: 'Inductance', fsw: 'Switching frequency', cout: 'Output capacitance', ripplePct: 'Ripple ratio' };

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;

export function compute(st: BuckState): CalcReport {
  const num = ['vin', 'vout', 'iout', 'fsw', 'ripplePct', 'l', 'dcr', 'cout', 'esr', 'dvOut', 'rHs', 'rLs', 'vf', 'tsw', 'qg', 'vdrv', 'cin', 'esrIn', 'iStep'] as const;
  for (const k of num) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!(st.vin > 0) || !(st.vout > 0)) throw new Error('Input and output voltages must be > 0.');
  if (st.vout >= st.vin) throw new Error(`A buck converter steps down: Vout (${si(st.vout, 'V')}) must be below Vin (${si(st.vin, 'V')}). Use a boost or buck-boost topology.`);
  if (!(st.iout > 0)) throw new Error('Output current must be > 0.');
  if (st.solveFor !== 'fsw' && !(st.fsw > 0)) throw new Error('Switching frequency must be > 0.');
  if (st.solveFor !== 'l' && !(st.l > 0)) throw new Error('Inductance must be > 0.');
  if (st.solveFor !== 'cout' && !(st.cout > 0)) throw new Error('Output capacitance must be > 0.');
  if ((st.solveFor === 'l' || st.solveFor === 'fsw') && !(st.ripplePct > 0)) throw new Error('Ripple ratio must be > 0.');
  if (st.solveFor === 'cout' && !(st.dvOut > 0)) throw new Error('Target output ripple must be > 0.');
  if (!(st.cin > 0)) throw new Error('Input capacitance must be > 0.');
  for (const k of ['dcr', 'esr', 'rHs', 'rLs', 'vf', 'tsw', 'qg', 'vdrv', 'esrIn', 'iStep'] as const) if (st[k] < 0) throw new Error(`${k} must be ≥ 0.`);

  const s: BuckState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];
  const I = s.iout;
  // Lowest Vin at which the switch can still hold Vout at this load (D → 1)
  const vinMin = s.vout + I * (s.dcr + s.rHs);
  if (s.vin <= vinMin) throw new Error(`Vin must exceed Vout + Iout·(DCR + R_DS(on),HS) = ${si(vinMin, 'V', 4)} at this load (duty cycle would be ≥ 100 %).`);

  const report: CalcReport = { calc: 'power/buck-converter', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const at = (patch: Partial<BuckState>) => analyzeBuck(toInputs({ ...s, ...patch }));

  // ── solve for the unknown (one forward model, numeric inversion)
  if (s.solveFor === 'l' || s.solveFor === 'fsw') {
    const key = s.solveFor;
    const target = s.ripplePct / 100;
    const r = invert((x) => at({ [key]: x }).rippleRatio, target, { ...SOLVE_RANGE[key], log: true, samples: 120 });
    // ripple(L) and ripple(fsw) are monotonic, but if rounding ever yields several roots prefer a CCM one
    if (r.ok && r.roots.length > 1) r.roots.sort((a, b) => Number(at({ [key]: b }).mode === 'ccm') - Number(at({ [key]: a }).mode === 'ccm'));
    if (!r.ok) return noSolution(report, key, `No ${key === 'l' ? 'inductance' : 'frequency'} in ${key === 'l' ? '1 nH – 1 H' : '1 kHz – 100 MHz'} gives a ${s.ripplePct} % ripple ratio (closest ${(r.closestValue * 100).toPrecision(3)} %).`);
    s[key] = r.roots[0];
  } else if (s.solveFor === 'cout') {
    const floor = at({ cout: 1e6 }).dVout; // ESR-only limit (C → ∞)
    if (s.dvOut < floor * (1 - 1e-9)) return noSolution(report, 'cout', `The ESR alone gives ${si(floor, 'V', 3)} of ripple (ESR·ΔIL). Lower the ESR (parallel capacitors) or the inductor ripple to reach ${si(s.dvOut, 'V', 3)}.`);
    if (s.dvOut <= floor * (1 + 1e-9)) {
      // Target at the ESR floor (e.g. ◎ C from an ESR-dominated analysis): above some C the ripple is
      // exactly ESR·ΔIL, so the answer is the smallest C that reaches it (bisection in log C).
      let lo = Math.log(SOLVE_RANGE.cout.lo);
      let hi = Math.log(1e6);
      if (at({ cout: Math.exp(lo) }).dVout <= floor * (1 + 1e-9)) hi = lo;
      for (let k = 0; k < 80 && hi - lo > 1e-12; k++) {
        const mid = (lo + hi) / 2;
        if (at({ cout: Math.exp(mid) }).dVout <= floor * (1 + 1e-9)) hi = mid;
        else lo = mid;
      }
      s.cout = Math.exp(hi);
      report.notes.push(`ΔVout equals the ESR ripple (ESR·ΔIL = ${si(floor, 'V', 3)}): every C above ${si(s.cout, 'F', 3)} gives the same ripple, so that is the smallest C that meets it.`);
    } else {
      const r = invert((c) => at({ cout: c }).dVout, s.dvOut, { ...SOLVE_RANGE.cout, log: true, samples: 120 });
      if (!r.ok) return noSolution(report, 'cout', `No capacitance in 1 nF – 1 F gives ΔVout = ${si(s.dvOut, 'V', 3)} (closest ${si(r.closestValue, 'V', 3)}).`);
      s.cout = r.roots[0];
    }
  }

  const o = analyzeBuck(toInputs(s));
  if (s.solveFor !== 'l' && s.solveFor !== 'fsw') s.ripplePct = o.rippleRatio * 100;
  if (s.solveFor !== 'cout') s.dvOut = o.dVout;
  const T = o.period;

  // ── checks and warnings
  if (o.mode === 'dcm')
    warnings.push(`Discontinuous conduction: Iout = ${si(I, 'A', 3)} is below the CCM boundary ${si(o.iCrit, 'A', 3)} (ΔIL/2), so the inductor current falls to zero each cycle and the duty cycle drops to ${pct(o.d)}. Results use the DCM waveform; raise L or fsw to stay in CCM.`);
  if (o.mode === 'ccm-negative')
    warnings.push(`Iout = ${si(I, 'A', 3)} is below ΔIL/2 = ${si(o.iCrit, 'A', 3)}: in forced-PWM a synchronous buck stays in CCM with the inductor current going negative (valley ${si(o.iValley, 'A', 3)}), as computed here. A controller with diode emulation / PFM would enter DCM or skip pulses instead.`);
  const dMaxCheck = o.d;
  if (dMaxCheck > 0.9) warnings.push(`Duty cycle ${pct(dMaxCheck)}: many controllers cap the duty cycle at 90–95 % (minimum off-time, bootstrap refresh). Check the datasheet, lower fsw, or raise Vin.`);
  if (o.ton < 100e-9) warnings.push(`On-time ${si(o.ton, 's', 3)} is very short; typical buck controllers need a minimum on-time of 50–150 ns. Lower fsw or check the datasheet minimum on-time.`);
  if (o.mode === 'ccm' && (o.rippleRatio < 0.1 || o.rippleRatio > 0.6))
    notes.push(`Ripple ratio ${pct(o.rippleRatio, 0)} is outside the usual 20–40 % (SLVA477): ${o.rippleRatio < 0.1 ? 'a large inductor slows the load-step response and costs size' : 'large ripple raises peak current, core loss and output ripple'}.`);
  if (o.eff < 0.7) warnings.push(`Estimated efficiency is only ${pct(o.eff)}; check the loss breakdown (Tables tab) — the dominant term is ${dominantLoss(o)}.`);
  if (s.solveFor === 'cout' && s.cout > 0.01) warnings.push(`Cout = ${si(s.cout, 'F', 3)} is impractically large; lower the ripple ratio or the ESR, or raise fsw.`);

  // Load step ±ΔI with a 5 % deviation: release → overshoot (SLVA477 eq. 14), step-up → undershoot while
  // the inductor slews at (Vin − Vout)/L (same charge balance, full duty). The larger one governs.
  const cOver = s.iStep > 0 ? coutForStep(s.iStep, s.l, s.vout, 0.05 * s.vout) : 0;
  const cUnder = s.iStep > 0 ? coutForStep(s.iStep, s.l, s.vin - s.vout, 0.05 * s.vout) : 0;
  const cStep = Math.max(cOver, cUnder);

  // ── results
  const item = (key: string, label: string, value: number | string, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const solved = s.solveFor;
  if (solved === 'l') results.push(item('l', 'Inductance', s.l, 'H', si(s.l, 'H', 4), { symbol: 'L', solved: true, primary: true, note: `for ΔIL = ${pct(o.rippleRatio, 0)} of Iout` }));
  if (solved === 'fsw') results.push(item('fsw', 'Switching frequency', s.fsw, 'Hz', si(s.fsw, 'Hz', 4), { symbol: 'f_sw', solved: true, primary: true, note: `for ΔIL = ${pct(o.rippleRatio, 0)} of Iout` }));
  if (solved === 'cout') results.push(item('cout', 'Output capacitance', s.cout, 'F', si(s.cout, 'F', 4), { symbol: 'C_out', solved: true, primary: true, note: `for ΔVout = ${si(s.dvOut, 'V', 3)} p-p` }));
  results.push(
    item('ripplePct', 'Ripple ratio', o.rippleRatio * 100, '%', pct(o.rippleRatio), { symbol: 'r', solved: solved === 'ripplePct' || solved === 'cout', primary: solved === 'ripplePct', note: `ΔIL = ${si(o.dIL, 'A', 3)} p-p` }),
    item('duty', 'Duty cycle', o.d, '', pct(o.d, 2), { symbol: 'D', primary: true, note: `ideal Vout/Vin = ${pct(o.dIdeal, 2)}${o.mode === 'dcm' ? ' · DCM' : ''}` }),
    item('iPk', 'Peak inductor current', o.iPk, 'A', si(o.iPk, 'A', 4), { symbol: 'I_L,pk', primary: true, note: `rms ${si(o.iLrms, 'A', 3)} · rate Isat above this` }),
    item('dvOut', 'Output ripple (p-p)', o.dVout, 'V', si(o.dVout, 'V', 3), { symbol: 'ΔV_out', solved: solved !== 'cout', primary: true, note: `${pct(o.dVout / s.vout, 2)} of Vout` }),
    item('eff', 'Efficiency (estimate)', o.eff, '', pct(o.eff), { symbol: 'η', primary: true, note: `losses ${si(o.loss.total, 'W', 3)}` }),
  );
  const g1 = 'Inductor';
  results.push(
    item('dIL', 'Ripple current (p-p)', o.dIL, 'A', si(o.dIL, 'A', 4), { symbol: 'ΔI_L', group: g1 }),
    item('iValley', 'Valley current', o.iValley, 'A', si(o.iValley, 'A', 4), { symbol: 'I_L,min', group: g1 }),
    item('iLrms', 'RMS current', o.iLrms, 'A', si(o.iLrms, 'A', 4), { symbol: 'I_L,rms', group: g1 }),
    item('iCrit', 'CCM/DCM boundary load', o.iCrit, 'A', si(o.iCrit, 'A', 3), { symbol: 'I_crit', group: g1, tone: o.mode !== 'ccm' ? 'warn' : '', note: 'Iout below ΔIL/2 leaves CCM' }),
    item('lCrit', 'L for CCM boundary', (s.l * o.iCrit) / I, 'H', si((s.l * o.iCrit) / I, 'H', 3), { symbol: 'L_crit', group: g1, note: 'smallest L that keeps CCM at Iout' }),
    item('mode', 'Conduction mode', o.mode, '', o.mode === 'ccm' ? 'CCM' : o.mode === 'dcm' ? 'DCM' : 'CCM, negative current', { group: g1, tone: o.mode === 'ccm' ? '' : 'warn' }),
  );
  const g2 = 'Switches';
  results.push(
    item('ton', 'On-time', o.ton, 's', si(o.ton, 's', 3), { symbol: 't_on', group: g2, note: `period ${si(T, 's', 3)}` }),
    item('iHsRms', 'High-side RMS current', o.iHsRms, 'A', si(o.iHsRms, 'A', 3), { symbol: 'I_HS,rms', group: g2 }),
    item('iLsAvg', s.rect === 'sync' ? 'Low-side average current' : 'Diode average current', o.iLsAvg, 'A', si(o.iLsAvg, 'A', 3), { symbol: s.rect === 'sync' ? 'I_LS,avg' : 'I_F', group: g2, note: s.rect === 'diode' ? (o.mode === 'dcm' ? 'Iout·D2/(D1 + D2), DCM' : 'SLVA477 eq. 7: Iout·(1 − D)') : '' }),
    item('iLsRms', s.rect === 'sync' ? 'Low-side RMS current' : 'Diode RMS current', o.iLsRms, 'A', si(o.iLsRms, 'A', 3), { group: g2 }),
    item('vStress', 'Switch / diode voltage', s.vin, 'V', si(s.vin, 'V', 3), { group: g2, note: 'plus ringing; derate ≥ 20 %' }),
  );
  const g3 = 'Capacitors';
  results.push(
    item('dVoutC', 'Ripple from C alone', o.dVoutC, 'V', si(o.dVoutC, 'V', 3), { group: g3, note: o.mode === 'dcm' ? 'charge only (ESR = 0), DCM waveform' : 'ΔIL/(8·fsw·C), SLVA477 eq. 12' }),
    item('dVoutEsr', 'Ripple from ESR alone', o.dVoutEsr, 'V', si(o.dVoutEsr, 'V', 3), { group: g3, note: 'ESR·ΔIL, SLVA477 eq. 13' }),
    item('iCoutRms', 'Output cap RMS current', o.iCoutRms, 'A', si(o.iCoutRms, 'A', 3), { symbol: 'I_Cout,rms', group: g3 }),
    item('iCinRms', 'Input cap RMS current', o.iCinRms, 'A', si(o.iCinRms, 'A', 3), { symbol: 'I_Cin,rms', group: g3, note: o.mode === 'ccm' ? '≈ Iout·√(D(1 − D))' : '' }),
    item('dVin', 'Input ripple (p-p)', o.dVin, 'V', si(o.dVin, 'V', 3), { symbol: 'ΔV_in', group: g3, note: 'Cin supplies the pulsed switch current' }),
    item('iinAvg', 'Average input current', o.iinAvg, 'A', si(o.iinAvg, 'A', 3), { symbol: 'I_in', group: g3 }),
  );
  if (s.iStep > 0)
    results.push(
      item('coutStep', `Cout for ±${si(s.iStep, 'A', 3)} step, 5 % dev.`, cStep, 'F', si(cStep, 'F', 3), {
        group: g3,
        tone: cStep > s.cout ? 'warn' : '',
        note: `${cUnder > cOver ? `undershoot governs: ΔI²·L/(2·(Vin − Vout)·ΔV); overshoot needs ${si(cOver, 'F', 3)}` : `overshoot governs: ΔI²·L/(2·Vout·ΔV), SLVA477 eq. 14; undershoot needs ${si(cUnder, 'F', 3)}`} · ${cStep > s.cout ? 'more than fitted' : 'met'} · ignores the control loop`,
      }),
    );
  const g4 = 'Losses';
  results.push(
    item('pHs', 'High-side conduction', o.loss.hsCond, 'W', si(o.loss.hsCond, 'W', 3), { group: g4 }),
    item('pLs', s.rect === 'sync' ? 'Low-side conduction' : 'Diode conduction', o.loss.lsCond, 'W', si(o.loss.lsCond, 'W', 3), { group: g4 }),
    item('pDcr', 'Inductor DCR', o.loss.dcr, 'W', si(o.loss.dcr, 'W', 3), { group: g4 }),
    item('pSw', 'Switching (edges)', o.loss.sw, 'W', si(o.loss.sw, 'W', 3), { group: g4 }),
    item('pGate', 'Gate drive', o.loss.gate, 'W', si(o.loss.gate, 'W', 3), { group: g4 }),
    item('pCap', 'Capacitor ESR', o.loss.cout + o.loss.cin, 'W', si(o.loss.cout + o.loss.cin, 'W', 3), { group: g4 }),
    item('pLoss', 'Total loss', o.loss.total, 'W', si(o.loss.total, 'W', 3), { group: g4, note: `Pout ${si(o.pout, 'W', 3)}` }),
  );
  report.results = results;
  report.tables = [lossTable(o, s.rect)];
  report.summary = `${si(s.vin, 'V', 3)} → ${si(s.vout, 'V', 3)} at ${si(I, 'A', 3)} · fsw ${si(s.fsw, 'Hz', 3)} · ${s.rect === 'sync' ? 'synchronous' : 'diode'} · ${o.mode === 'ccm' ? 'CCM' : o.mode === 'dcm' ? 'DCM' : 'CCM (negative IL)'}`;
  notes.push(
    'Steady state, ideal switching waveforms: duty cycle from inductor volt-second balance including switch on-resistance, DCR and diode drop (Erickson ch. 3).',
    'Output and input ripple are evaluated exactly on the triangular current (capacitor charge plus ESR); ESL spikes and probe pickup are not included.',
    'Switching and gate losses are first-order estimates; core loss, reverse recovery, dead-time body-diode conduction and controller quiescent current are not included.',
    'Design at the highest Vin for ripple and peak current, and at the lowest Vin for the maximum duty cycle (SLVA477).',
  );
  report.details = { ...o, inputs: toInputs(s), coutOvershoot: cOver, coutUndershoot: cUnder };
  report.graphs = graphs(s, o);
  return report;
}

function noSolution(report: CalcReport, key: string, msg: string): CalcReport {
  report.warnings.push(msg);
  report.status = { text: 'NO SOLUTION', tone: 'fail' };
  report.results.push({ key, label: LABEL[key] ?? key, value: null, display: '—', primary: true, solved: true });
  return report;
}

function dominantLoss(o: BuckOutputs): string {
  const names: Record<string, string> = { hsCond: 'high-side conduction', lsCond: 'rectifier conduction', dcr: 'inductor DCR', sw: 'switching', gate: 'gate drive', cout: 'output-cap ESR', cin: 'input-cap ESR' };
  const [k] = Object.entries(o.loss)
    .filter(([k]) => k !== 'total')
    .sort((a, b) => b[1] - a[1])[0];
  return names[k] ?? k;
}

function lossTable(o: BuckOutputs, rect: Rectifier): TableSpec {
  const rows: [string, number, string][] = [
    ['High-side conduction', o.loss.hsCond, 'I_HS,rms²·R_DS(on)'],
    [rect === 'sync' ? 'Low-side conduction' : 'Diode conduction', o.loss.lsCond, rect === 'sync' ? 'I_LS,rms²·R_DS(on)' : 'I_F·V_F'],
    ['Inductor DCR', o.loss.dcr, 'I_L,rms²·DCR'],
    ['Switching (edges)', o.loss.sw, '½·Vin·I·(tr+tf)·fsw'],
    ['Gate drive', o.loss.gate, 'Qg·Vdrv·fsw'],
    ['Output cap ESR', o.loss.cout, 'I_Cout,rms²·ESR'],
    ['Input cap ESR', o.loss.cin, 'I_Cin,rms²·ESR_in'],
    ['Total', o.loss.total, ''],
  ];
  return {
    id: 'losses',
    title: 'Loss breakdown',
    columns: [
      { key: 'part', label: 'Loss', align: 'left' },
      { key: 'p', label: 'Power', unit: 'W' },
      { key: 'share', label: 'Share', unit: '%' },
      { key: 'formula', label: 'Formula', align: 'left' },
    ],
    rows: rows.map(([part, p, formula]) => ({ part, p, share: o.loss.total > 0 ? (p / o.loss.total) * 100 : 0, formula })),
    display: rows.map(([part, p, formula]) => ({ part, p: si(p, 'W', 3), share: o.loss.total > 0 ? `${((p / o.loss.total) * 100).toFixed(1)} %` : '—', formula })),
    note: `Efficiency ${pct(o.eff)} = Pout / (Pout + losses). First-order estimate; see Notes for what is not included.`,
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: BuckState, o: BuckOutputs): GraphSpec[] {
  // Waveforms over two periods: inductor current (PWL) and switch-node voltage (steps)
  const T = o.period;
  const tI: number[] = [];
  const iL: number[] = [];
  const tV: number[] = [];
  const vSw: number[] = [];
  for (let n = 0; n < 2; n++) {
    for (const sg of o.segments) {
      tI.push(n * T + sg.t0, n * T + sg.t1);
      iL.push(sg.i0, sg.i1);
      tV.push(n * T + sg.t0, n * T + sg.t1);
      vSw.push(sg.vsw, sg.vsw);
    }
  }
  const waves: GraphSpec = {
    id: 'waveforms',
    title: 'Waveforms',
    subtitle: o.mode === 'dcm' ? 'DCM: the switch node rings to Vout while the inductor is idle (shown as a flat level)' : undefined,
    x: { label: 'Time', unit: 's' },
    y: [
      { id: 'i', label: 'Inductor current', unit: 'A', includeZero: true },
      { id: 'v', label: 'Switch node', unit: 'V', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'v_SW', x: tV, y: vSw, axis: 'v', color: '#9a8f7a', width: 1.3 },
      { label: 'i_L', x: tI, y: iL, axis: 'i', color: '#1f4e5f', width: 2.2 },
      { label: 'I_out', x: [0, 2 * T], y: [s.iout, s.iout], axis: 'i', color: '#c47b17', dash: [5, 3], width: 1.2, noReadout: true },
    ],
  };

  // Ripple vs inductance (other inputs fixed)
  const ls = logspace(s.l / 10, s.l * 10, 120);
  const sweep = ls.map((l) => analyzeBuck(toInputs({ ...s, l })));
  const lCrit = (s.l * o.iCrit) / s.iout;
  const rippleVsL: GraphSpec = {
    id: 'ripple-vs-l',
    title: 'Ripple vs L',
    x: { label: 'Inductance L', unit: 'H', log: true },
    y: [
      { id: 'i', label: 'ΔIL (p-p)', unit: 'A', includeZero: true },
      { id: 'v', label: 'ΔVout (p-p)', unit: 'V', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'ΔIL', x: ls, y: sweep.map((r) => r.dIL), axis: 'i', width: 2.2 },
      { label: 'ΔVout', x: ls, y: sweep.map((r) => r.dVout), axis: 'v', color: '#c47b17', width: 1.6 },
    ],
    hlines: [{ value: 2 * s.iout, label: 'CCM boundary ΔIL = 2·Iout', axis: 'i', color: '#8b1e1e', dash: [5, 4] }],
    vlines: [
      { value: s.l, label: `L = ${si(s.l, 'H', 3)}` },
      ...(lCrit > ls[0] && lCrit < ls[ls.length - 1] ? [{ value: lCrit, label: `L_crit = ${si(lCrit, 'H', 3)}`, color: '#8b1e1e', dash: [3, 3] }] : []),
    ],
    markers: [{ x: s.l, y: o.dIL, axis: 'i', label: si(o.dIL, 'A', 3) }],
  };

  // Efficiency vs load current
  const is = logspace(s.iout / 50, s.iout * 1.5, 100);
  const effs = is.map((i) => {
    try {
      const r = analyzeBuck(toInputs({ ...s, iout: i }));
      return Number.isFinite(r.eff) && r.d < 1 ? r : null;
    } catch {
      return null;
    }
  });
  const ok = is.map((_, k) => effs[k] != null);
  const ix = is.filter((_, k) => ok[k]);
  const effGraph: GraphSpec = {
    id: 'efficiency',
    title: 'Efficiency vs load',
    x: { label: 'Output current', unit: 'A', log: true },
    y: [
      { id: 'e', label: 'Efficiency', unit: '%', max: 100 },
      { id: 'p', label: 'Loss', unit: 'W', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'η', x: ix, y: effs.filter((r) => r).map((r) => r!.eff * 100), axis: 'e', width: 2.2 },
      { label: 'Total loss', x: ix, y: effs.filter((r) => r).map((r) => r!.loss.total), axis: 'p', color: '#c47b17', width: 1.4, dash: [5, 3] },
    ],
    vlines: [{ value: s.iout, label: `Iout = ${si(s.iout, 'A', 3)}` }, ...(o.iCrit > ix[0] && o.iCrit < ix[ix.length - 1] ? [{ value: o.iCrit, label: 'CCM boundary', color: '#8b1e1e', dash: [3, 3] }] : [])],
    markers: [{ x: s.iout, y: o.eff * 100, axis: 'e', label: pct(o.eff) }],
  };
  return [waves, rippleVsL, effGraph];
}

export const def: CalcDef<BuckState> = {
  id: 'power/buck-converter',
  version: '0.1.0',
  method:
    'Steady-state CCM/DCM buck power stage: duty from inductor volt-second balance with switch, DCR and diode drops (Erickson & Maksimović ch. 3, 5); ripple, inductor and capacitor equations per TI SLVA477 (Hauke); output/input ripple evaluated exactly on the piecewise-linear current (charge + ESR); first-order switching (½·V·I·t·f) and gate (Qg·V·f, TI SLUA618) losses. L, fsw and Cout are solved by Brent root finding on the same forward model.',
  fields,
  defaults,
  solve: {
    default: 'l',
    analysis: 'ripplePct',
    options: [
      { key: 'l', label: 'Inductance L for a target ripple ratio' },
      { key: 'ripplePct', label: 'Ripple, peak current and ΔVout for a given L (analysis)' },
      { key: 'fsw', label: 'Switching frequency for a target ripple ratio' },
      { key: 'cout', label: 'Output capacitance for a target ΔVout' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '12 V → 3.3 V, 3 A sync at 500 kHz: size L for 30 % ripple', state: defaults() },
    {
      id: 'auto-diode',
      label: '24 V → 5 V, 2 A Schottky buck at 300 kHz (analyse 22 µH)',
      state: { solveFor: 'ripplePct', vin: 24, vout: 5, iout: 2, fsw: 300e3, fswUnit: 'kHz', l: 22e-6, lUnit: 'µH', dcr: 30e-3, cout: 47e-6, esr: 10e-3, rect: 'diode', rHs: 60e-3, vf: 0.5, tsw: 30e-9, qg: 10e-9, vdrv: 5, cin: 10e-6, esrIn: 10e-3, iStep: 1 },
    },
    {
      id: 'core-rail',
      label: '12 V → 1.0 V, 15 A core rail at 1 MHz (short on-time)',
      state: { solveFor: 'l', vin: 12, vout: 1.0, iout: 15, fsw: 1e6, fswUnit: 'MHz', ripplePct: 30, dcr: 0.5e-3, cout: 470e-6, esr: 1e-3, rect: 'sync', rHs: 6e-3, rLs: 2e-3, tsw: 10e-9, qg: 40e-9, vdrv: 5, cin: 66e-6, esrIn: 2e-3, iStep: 7.5 },
    },
    {
      id: 'cout-10mv',
      label: '5 V → 1.8 V, 2 A: Cout for 10 mV ripple',
      state: { solveFor: 'cout', vin: 5, vout: 1.8, iout: 2, fsw: 2e6, fswUnit: 'MHz', l: 1e-6, lUnit: 'µH', dcr: 20e-3, esr: 2e-3, dvOut: 10e-3, rect: 'sync', rHs: 40e-3, rLs: 25e-3, tsw: 5e-9, qg: 5e-9, vdrv: 5, cin: 10e-6, esrIn: 3e-3, iStep: 1 },
    },
    {
      id: 'fsw-for-ripple',
      label: '48 V → 12 V, 5 A with a 10 µH part: fsw for 30 % ripple',
      state: { solveFor: 'fsw', vin: 48, vout: 12, iout: 5, ripplePct: 30, l: 10e-6, lUnit: 'µH', dcr: 8e-3, cout: 100e-6, esr: 5e-3, rect: 'sync', rHs: 8e-3, rLs: 8e-3, tsw: 15e-9, qg: 30e-9, vdrv: 10, cin: 10e-6, esrIn: 5e-3, iStep: 2.5 },
    },
    {
      id: 'dcm-light',
      label: 'Light load: 24 V → 5 V diode buck at 100 mA (DCM)',
      state: { solveFor: 'ripplePct', vin: 24, vout: 5, iout: 0.1, fsw: 300e3, fswUnit: 'kHz', l: 22e-6, lUnit: 'µH', dcr: 30e-3, cout: 47e-6, esr: 10e-3, rect: 'diode', rHs: 60e-3, vf: 0.4, tsw: 30e-9, qg: 10e-9, vdrv: 5, cin: 10e-6, esrIn: 10e-3, iStep: 0 },
    },
  ],
};
