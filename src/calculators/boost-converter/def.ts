/** Boost converter power stage — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { bracketE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_IND, U_OHM, withDefault } from '@/core/unitsets';
import { type BoostInputs, type BoostOutputs, type Rectifier, analyzeBoost, ccmDuty, maxOutputCurrent } from './model';

export type BoostSolve = 'l' | 'ripplePct' | 'fsw' | 'cout';

export interface BoostState {
  solveFor: BoostSolve;
  vin: number;
  vinMin: number;
  vout: number;
  iout: number;
  fsw: number;
  fswUnit: string;
  ripplePct: number;
  l: number;
  lUnit: string;
  dcr: number;
  dcrUnit: string;
  pCore: number;
  cout: number;
  coutUnit: string;
  esr: number;
  esrUnit: string;
  dvOut: number;
  rect: Rectifier;
  rSw: number;
  rSwUnit: string;
  rRect: number;
  rRectUnit: string;
  vf: number;
  qrr: number;
  tsw: number;
  qg: number;
  vdrv: number;
  cin: number;
  cinUnit: string;
  esrIn: number;
  esrInUnit: string;
}

export const defaults = (): BoostState => ({
  solveFor: 'l',
  vin: 5,
  vinMin: 4.5,
  vout: 12,
  iout: 0.5,
  fsw: 500e3,
  fswUnit: 'kHz',
  ripplePct: 30,
  l: 22e-6,
  lUnit: 'µH',
  dcr: 40e-3,
  dcrUnit: 'mΩ',
  pCore: 0.02,
  cout: 20e-6,
  coutUnit: 'µF',
  esr: 5e-3,
  esrUnit: 'mΩ',
  dvOut: 30e-3,
  rect: 'diode',
  rSw: 50e-3,
  rSwUnit: 'mΩ',
  rRect: 30e-3,
  rRectUnit: 'mΩ',
  vf: 0.4,
  qrr: 0,
  tsw: 20e-9,
  qg: 5e-9,
  vdrv: 5,
  cin: 10e-6,
  cinUnit: 'µF',
  esrIn: 5e-3,
  esrInUnit: 'mΩ',
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
      { kind: 'number', key: 'vin', symbol: 'V_in', label: 'Input voltage', unit: 'V', min: 0.1, max: 1000, help: 'Design point for the ripple and the inductor. The inductor ripple of a boost is largest near Vin = Vout/2 (SLVA372).' },
      { kind: 'number', key: 'vinMin', symbol: 'V_in,min', label: 'Lowest input voltage', unit: 'V', min: 0.1, max: 1000, help: 'Worst case for the duty cycle and the peak switch / inductor current (SLVA372 uses the minimum Vin for Isw,max). Set it equal to Vin to skip the check.' },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output voltage', unit: 'V', min: 0.1, max: 2000 },
      { kind: 'number', key: 'iout', symbol: 'I_out', label: 'Output current', unit: 'A', min: 1e-6, max: 1000, help: 'Load current. The average inductor (input) current is Iout/(1 − D), larger by the step-up ratio.' },
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
        help: 'r = ΔIL/I_L,avg: peak-to-peak inductor ripple as a percentage of the average inductor (input) current. 20–40 % is the usual choice (SLVA372). A diode boost enters discontinuous conduction above 200 %.',
      },
      { kind: 'number', key: 'l', symbol: 'L', label: 'Inductance', units: U_IND_U, unitKey: 'lUnit', solvable: true, min: 1e-9, max: 1, help: 'Use the inductance at the operating current; cores lose inductance towards saturation.' },
      { kind: 'number', key: 'dcr', symbol: 'DCR', label: 'Winding resistance', units: U_MOHM, unitKey: 'dcrUnit', min: 0, max: 100 },
      { kind: 'number', key: 'pCore', symbol: 'P_core', label: 'Core loss', unit: 'W', min: 0, max: 1000, help: 'From the inductor maker’s loss calculator at this ripple and frequency (it depends on ΔIL, fsw and the core material). Added to the loss budget as entered.' },
    ],
  },
  {
    kind: 'section',
    title: 'Output capacitor',
    fields: [
      { kind: 'number', key: 'cout', symbol: 'C_out', label: 'Output capacitance', units: U_CAP_U, unitKey: 'coutUnit', solvable: true, min: 1e-9, max: 1, help: 'Effective capacitance at Vout. Ceramic X5R/X7R parts lose much of their rated value under DC bias, worst at the high output voltage of a boost.' },
      { kind: 'number', key: 'esr', symbol: 'ESR', label: 'Output cap ESR', units: U_MOHM, unitKey: 'esrUnit', min: 0, max: 100, help: 'ESR of the whole output bank. A boost’s output capacitor sees the pulsed diode current, so ESR·I_pk is often the larger ripple term.' },
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
        onSolve: (_s, root) => (root.solveFor = 'ripplePct'),
        onUnsolve: (_s, root) => (root.solveFor = 'cout'),
        help: 'Calculated from L, Cout and ESR. Click ◎ to type a target instead and solve for Cout.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Switches & losses',
    collapsed: true,
    note: 'Conduction drops set the duty cycle; the rest only feed the loss and efficiency estimate.',
    fields: [
      { kind: 'select', key: 'rect', label: 'Rectifier', options: [{ value: 'diode', label: 'Diode (asynchronous)' }, { value: 'sync', label: 'Synchronous (high-side FET)' }],
        // the rectifier changes DCM vs negative-current CCM, so a ripple-ratio target no longer means the same: analyse
        apply: (_v, s: any) => {
          s.solveFor = 'ripplePct';
        },
      },
      { kind: 'number', key: 'rSw', symbol: 'R_on,SW', label: 'Switch on-resistance', units: U_MOHM, unitKey: 'rSwUnit', min: 0, max: 100, help: 'Low-side (main) switch R_DS(on) at the operating temperature.' },
      { kind: 'number', key: 'rRect', symbol: 'R_on,SR', label: 'Sync FET on-resistance', units: U_MOHM, unitKey: 'rRectUnit', min: 0, max: 100, visible: (s) => s.rect === 'sync' },
      { kind: 'number', key: 'vf', symbol: 'V_F', label: 'Diode forward voltage', unit: 'V', min: 0, max: 5, visible: (s) => s.rect === 'diode', help: 'At the peak current and a warm junction; Schottky diodes are typically 0.3–0.6 V.' },
      { kind: 'number', key: 'qrr', symbol: 'Q_rr', label: 'Diode recovery charge', unit: 'C', min: 0, max: 1e-5, visible: (s) => s.rect === 'diode', help: 'Reverse-recovery charge; about 0 for a Schottky (only its junction capacitance), tens of nC for a fast silicon diode. Loss ≈ Qrr·Vout·fsw in CCM.' },
      { kind: 'number', key: 'tsw', symbol: 't_edges', label: 'Switch-node edges', unit: 's', min: 0, max: 1e-5, help: 'Sum of the rise and fall times of the switch node. Hard-switching loss ≈ ½·Vout·I·(tr + tf)·fsw.' },
      { kind: 'number', key: 'qg', symbol: 'Q_g', label: 'Total gate charge', unit: 'C', min: 0, max: 1e-5, help: 'Sum over the FETs driven each cycle. Gate-drive loss = Qg·Vdrv·fsw (TI SLUA618).' },
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

export const toInputs = (s: BoostState): BoostInputs => ({
  vin: s.vin,
  vout: s.vout,
  iout: s.iout,
  fsw: s.fsw,
  l: s.l,
  dcr: s.dcr,
  cout: s.cout,
  esr: s.esr,
  rect: s.rect,
  rSw: s.rSw,
  rRect: s.rect === 'sync' ? s.rRect : 0,
  vf: s.rect === 'diode' ? s.vf : 0,
  qrr: s.rect === 'diode' ? s.qrr : 0,
  tsw: s.tsw,
  qg: s.qg,
  vdrv: s.vdrv,
  pCore: s.pCore,
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

export function compute(st: BoostState): CalcReport {
  const num = ['vin', 'vinMin', 'vout', 'iout', 'fsw', 'ripplePct', 'l', 'dcr', 'pCore', 'cout', 'esr', 'dvOut', 'rSw', 'rRect', 'vf', 'qrr', 'tsw', 'qg', 'vdrv', 'cin', 'esrIn'] as const;
  for (const k of num) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!(st.vin > 0) || !(st.vout > 0)) throw new Error('Input and output voltages must be > 0.');
  if (st.vout <= st.vin) throw new Error(`A boost converter steps up: Vout (${si(st.vout, 'V')}) must be above Vin (${si(st.vin, 'V')}). Use a buck or buck-boost topology.`);
  if (!(st.iout > 0)) throw new Error('Output current must be > 0.');
  if (st.solveFor !== 'fsw' && !(st.fsw > 0)) throw new Error('Switching frequency must be > 0.');
  if (st.solveFor !== 'l' && !(st.l > 0)) throw new Error('Inductance must be > 0.');
  if (st.solveFor !== 'cout' && !(st.cout > 0)) throw new Error('Output capacitance must be > 0.');
  if ((st.solveFor === 'l' || st.solveFor === 'fsw') && !(st.ripplePct > 0)) throw new Error('Ripple ratio must be > 0.');
  if (st.solveFor === 'cout' && !(st.dvOut > 0)) throw new Error('Target output ripple must be > 0.');
  if (!(st.cin > 0)) throw new Error('Input capacitance must be > 0.');
  for (const k of ['dcr', 'pCore', 'esr', 'rSw', 'rRect', 'vf', 'qrr', 'tsw', 'qg', 'vdrv', 'esrIn'] as const) if (st[k] < 0) throw new Error(`${k} must be ≥ 0.`);

  const s: BoostState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];
  const I = s.iout;
  const d0 = ccmDuty(toInputs(s));
  if (d0 == null) {
    const iMax = maxOutputCurrent(toInputs(s));
    throw new Error(`With these conduction losses the boost cannot reach ${si(s.vout, 'V', 4)} at ${si(I, 'A', 3)}: it delivers at most ${si(iMax, 'A', 3)} at Vin = ${si(s.vin, 'V', 3)}. Lower DCR / R_on or the load, or raise Vin.`);
  }
  if (d0 < 0) throw new Error(`Vin (${si(s.vin, 'V', 3)}) is too close to Vout: even at zero duty the output would be ${si(s.vin, 'V', 3)} minus the rectifier and DCR drops, above ${si(s.vout, 'V', 3)}. Use a buck-boost or SEPIC.`);

  const report: CalcReport = { calc: 'power/boost-converter', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  // The CCM duty does not depend on L, fsw or C; a null (no self-consistent waveform, extreme drops) reads as NaN.
  const NONE = { rippleRatio: NaN, dVout: NaN, mode: 'none' } as unknown as BoostOutputs;
  const at = (patch: Partial<BoostState>) => analyzeBoost(toInputs({ ...s, ...patch })) ?? NONE;
  // keep only true roots (a jump in the forward model can look like a sign change)
  const realRoots = (xs: number[], g: (x: number) => number, target: number) => xs.filter((x) => Math.abs(g(x) - target) <= 1e-6 * Math.abs(target));

  const inconsistent = () => new Error(`No self-consistent waveform: the inductor ripple is so large that the resistive drops (DCR + R_on) change the duty cycle within a cycle (L/R = ${si(s.l / (s.dcr + s.rSw), 's', 3)}). Raise L or fsw, or lower the resistances.`);
  if ((s.solveFor === 'cout' || s.solveFor === 'ripplePct') && !analyzeBoost(toInputs(s))) throw inconsistent();
  if (s.solveFor === 'l' || s.solveFor === 'fsw') {
    const key = s.solveFor;
    const target = s.ripplePct / 100;
    const r = invert((x) => at({ [key]: x }).rippleRatio, target, { ...SOLVE_RANGE[key], log: true, samples: 120 });
    r.roots = realRoots(r.roots, (x) => at({ [key]: x }).rippleRatio, target);
    r.ok = r.roots.length > 0;
    // Several roots happen only when tiny L or fsw drive a huge peak current whose resistive drop bends r(x) back
    // up (lossy DCM). The physical design is the largest x (smallest ripple current); among those prefer CCM.
    if (r.ok && r.roots.length > 1) r.roots.sort((a, b) => Number(at({ [key]: b }).mode === 'ccm') - Number(at({ [key]: a }).mode === 'ccm') || b - a);
    if (!r.ok) return noSolution(report, key, `No ${key === 'l' ? 'inductance' : 'frequency'} in ${key === 'l' ? '1 nH – 1 H' : '1 kHz – 100 MHz'} gives a ${s.ripplePct} % ripple ratio (closest ${Number.isFinite(r.closestValue) ? (r.closestValue * 100).toPrecision(3) + ' %' : 'none: no valid waveform'}).`);
    s[key] = r.roots[0];
  } else if (s.solveFor === 'cout') {
    const floor = at({ cout: 1e6 }).dVout; // ESR-only limit ESR·I_pk (C → ∞)
    if (s.dvOut < floor * (1 - 1e-9)) return noSolution(report, 'cout', `The ESR alone gives ${si(floor, 'V', 3)} of ripple (ESR·I_pk with the pulsed diode current). Lower the ESR (parallel capacitors) to reach ${si(s.dvOut, 'V', 3)}.`);
    // Mode-switch harness note: from an ESR-dominated analysis (e.g. fsw = 100 MHz) ◎ Cout returns the smallest C on
    // the ESR floor, not the C in the state: every C above it gives the same ripple. Legitimate round-trip "failure".
    if (s.dvOut <= floor * (1 + 1e-9)) {
      // Target at the ESR floor: above some C the ripple is exactly ESR·I_pk; return the smallest such C.
      let lo = Math.log(SOLVE_RANGE.cout.lo);
      let hi = Math.log(1e6);
      if (at({ cout: Math.exp(lo) }).dVout <= floor * (1 + 1e-9)) hi = lo;
      for (let k = 0; k < 80 && hi - lo > 1e-12; k++) {
        const mid = (lo + hi) / 2;
        if (at({ cout: Math.exp(mid) }).dVout <= floor * (1 + 1e-9)) hi = mid;
        else lo = mid;
      }
      s.cout = Math.exp(hi);
      notes.push(`ΔVout equals the ESR ripple (${si(floor, 'V', 3)}): every C above ${si(s.cout, 'F', 3)} gives the same ripple, so that is the smallest C that meets it.`);
    } else {
      const r = invert((c) => at({ cout: c }).dVout, s.dvOut, { ...SOLVE_RANGE.cout, log: true, samples: 120 });
      r.roots = realRoots(r.roots, (c) => at({ cout: c }).dVout, s.dvOut);
      r.ok = r.roots.length > 0;
      if (!r.ok) return noSolution(report, 'cout', `No capacitance in 1 nF – 1 F gives ΔVout = ${si(s.dvOut, 'V', 3)} (closest ${Number.isFinite(r.closestValue) ? si(r.closestValue, 'V', 3) : 'none'}).`);
      s.cout = r.roots[0];
    }
  }

  const o0 = analyzeBoost(toInputs(s));
  if (!o0) throw inconsistent();
  const o = o0;
  // Keep the outputs physical (and inside the solvable fields' ranges): ripple beyond these is a typo in L, fsw or C.
  if (o.rippleRatio > 1e4) throw new Error(`The inductor ripple is ${si(o.dIL, 'A', 3)}, over 10 000 × the average current: L (${si(s.l, 'H', 3)}) or fsw (${si(s.fsw, 'Hz', 3)}) is far too small for this design.`);
  if (o.dVout > s.vout) throw new Error(`The output ripple (${si(o.dVout, 'V', 3)}) would exceed Vout itself: Cout (${si(s.cout, 'F', 3)}) or fsw is far too small, or the ESR far too large.`);
  if (s.solveFor !== 'l' && s.solveFor !== 'fsw') s.ripplePct = o.rippleRatio * 100;
  if (s.solveFor !== 'cout') s.dvOut = o.dVout;
  const T = o.period;

  // Worst case at the lowest input voltage (same L and fsw)
  const useMin = s.vinMin < s.vin;
  let oMin: BoostOutputs | null = null;
  let vinMinError = '';
  if (useMin) {
    const dm = ccmDuty(toInputs({ ...s, vin: s.vinMin }));
    if (dm == null) vinMinError = `At V_in,min = ${si(s.vinMin, 'V', 3)} the boost cannot reach ${si(s.vout, 'V', 3)} at ${si(I, 'A', 3)} (at most ${si(maxOutputCurrent(toInputs({ ...s, vin: s.vinMin })), 'A', 3)}): the conduction losses limit the gain. Lower DCR / R_on or raise V_in,min.`;
    else {
      oMin = analyzeBoost(toInputs({ ...s, vin: s.vinMin }));
      if (!oMin) vinMinError = `At V_in,min = ${si(s.vinMin, 'V', 3)} the inductor ripple is so large that the resistive drops make the waveform inconsistent; raise L or fsw.`;
    }
  } else if (s.vinMin > s.vin) notes.push(`V_in,min (${si(s.vinMin, 'V', 3)}) is above Vin, so the low-line check uses Vin.`);
  // Worst case = the operating point with the larger peak current. Usually V_in,min, but a forced-PWM sync boost at
  // light load (ripple ratio > 2, D > 0.5) can peak higher at nominal Vin (review 2026-11-26).
  const worstAtMin = !!oMin && oMin.iPk >= o.iPk;
  const worst = worstAtMin ? oMin! : o;

  // ── checks and warnings
  if (vinMinError) warnings.push(vinMinError);
  if (o.mode === 'dcm')
    warnings.push(`Discontinuous conduction: Iout = ${si(I, 'A', 3)} is below the CCM boundary ${si(o.iCrit, 'A', 3)}, so the inductor current falls to zero each cycle and the duty cycle drops to ${pct(o.d)}. Results use the DCM waveform; raise L or fsw to stay in CCM.`);
  if (o.mode === 'ccm-negative')
    warnings.push(`Iout = ${si(I, 'A', 3)} is below the CCM boundary ${si(o.iCrit, 'A', 3)}: in forced PWM a synchronous boost stays in CCM with the inductor current going negative (valley ${si(o.iValley, 'A', 3)}), energy flowing back to the input, as computed here. A controller with diode emulation / PFM would enter DCM or skip pulses instead.`);
  if (worst.d > 0.85)
    warnings.push(`Duty cycle ${pct(worst.d)}${oMin ? ' at V_in,min' : ''}: above about 85 % the conduction losses grow as 1/(1 − D)² and many controllers hit their maximum duty. Consider a lower step-up per stage, a tapped-inductor or a flyback.`);
  const iMax = maxOutputCurrent(toInputs({ ...s, vin: useMin && !vinMinError ? s.vinMin : s.vin }));
  if (!vinMinError && I > 0.7 * iMax) warnings.push(`Iout is ${pct(I / iMax, 0)} of the most this lossy boost can deliver (${si(iMax, 'A', 3)}${useMin ? ' at V_in,min' : ''}): it is near the peak of its gain curve, where a small load increase collapses the output. Reduce DCR / R_on.`);
  if (o.ton > 0.2 * o.tau) warnings.push(`The on-time (${si(o.ton, 's', 3)}) is more than a fifth of the inductor’s L/R time constant (${si(o.tau, 's', 3)}): the current ramps are visibly curved and the linear-ripple results are approximate. Lower DCR / R_on or raise fsw.`);
  if (o.ton < 100e-9) warnings.push(`On-time ${si(o.ton, 's', 3)} is very short; boost controllers typically need a minimum on-time of 50–150 ns. Lower fsw or check the datasheet.`);
  if (o.mode === 'ccm' && (o.rippleRatio < 0.1 || o.rippleRatio > 0.6))
    notes.push(`Ripple ratio ${pct(o.rippleRatio, 0)} is outside the usual 20–40 % (SLVA372): ${o.rippleRatio < 0.1 ? 'a large inductor lowers the RHP-zero frequency and costs size' : 'large ripple raises peak current, core loss and output ripple'}.`);
  if (o.eff < 0.7) warnings.push(`Estimated efficiency is only ${pct(o.eff)}; check the loss breakdown (Tables tab) — the dominant term is ${dominantLoss(o)}.`);
  if (s.solveFor === 'cout' && s.cout > 0.01) warnings.push(`Cout = ${si(s.cout, 'F', 3)} is impractically large; lower the ESR or raise fsw.`);
  if (o.mode !== 'dcm' && o.fRhp < s.fsw / 20)
    notes.push(`The right-half-plane zero is at ${si(o.fRhp, 'Hz', 3)}${oMin ? ` (${si(oMin.fRhp, 'Hz', 3)} at V_in,min)` : ''}: keep the loop crossover below about a fifth of it, so the boost responds slowly to load steps.`);

  // ── results
  const item = (key: string, label: string, value: ResultItem['value'], unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const solved = s.solveFor;
  const [, lStd] = bracketE('E12', s.l);
  if (solved === 'l') results.push(item('l', 'Inductance', s.l, 'H', si(s.l, 'H', 4), { symbol: 'L', solved: true, primary: true, note: `next E12 ${si(lStd, 'H', 3)} → r = ${pct(at({ l: lStd }).rippleRatio, 0)}` }));
  if (solved === 'fsw') results.push(item('fsw', 'Switching frequency', s.fsw, 'Hz', si(s.fsw, 'Hz', 4), { symbol: 'f_sw', solved: true, primary: true, note: `for ΔIL = ${pct(o.rippleRatio, 0)} of I_L` }));
  if (solved === 'cout') results.push(item('cout', 'Output capacitance', s.cout, 'F', si(s.cout, 'F', 4), { symbol: 'C_out', solved: true, primary: true, note: `for ΔVout = ${si(s.dvOut, 'V', 3)} p-p` }));
  results.push(
    item('ripplePct', 'Ripple ratio', o.rippleRatio * 100, '%', pct(o.rippleRatio), { symbol: 'r', solved: solved === 'ripplePct' || solved === 'cout', primary: solved === 'ripplePct', note: `ΔIL = ${si(o.dIL, 'A', 3)} p-p` }),
    item('duty', 'Duty cycle', o.d, '', pct(o.d, 2), { symbol: 'D', primary: true, note: `ideal 1 − Vin/Vout = ${pct(o.dIdeal, 2)}${o.mode === 'dcm' ? ' · DCM' : ''}${oMin ? ` · ${pct(oMin.d, 1)} at V_in,min` : ''}` }),
    item('iPk', 'Peak switch / inductor current', worst.iPk, 'A', si(worst.iPk, 'A', 4), { symbol: 'I_L,pk', primary: true, note: `${oMin ? (worstAtMin ? `worst case at V_in,min; ${si(o.iPk, 'A', 3)} at Vin` : `worst case at Vin; ${si(oMin.iPk, 'A', 3)} at V_in,min`) : `rms ${si(o.iLrms, 'A', 3)}`} · rate Isat above this` }),
    item('dvOut', 'Output ripple (p-p)', o.dVout, 'V', si(o.dVout, 'V', 3), { symbol: 'ΔV_out', solved: solved !== 'cout', primary: true, note: `${pct(o.dVout / s.vout, 2)} of Vout` }),
    item('eff', 'Efficiency (estimate)', o.eff, '', pct(o.eff), { symbol: 'η', primary: true, note: `losses ${si(o.loss.total, 'W', 3)}` }),
  );
  const g1 = 'Inductor';
  results.push(
    item('iLavg', 'Average current', o.iLavg, 'A', si(o.iLavg, 'A', 4), { symbol: 'I_L,avg', group: g1, note: o.mode === 'dcm' ? '' : 'Iout/(1 − D)' }),
    item('dIL', 'Ripple current (p-p)', o.dIL, 'A', si(o.dIL, 'A', 4), { symbol: 'ΔI_L', group: g1, note: o.mode === 'dcm' ? 'DCM: equals the peak' : 'SLVA372 eq. 4 with drops' }),
    item('iValley', 'Valley current', o.iValley, 'A', si(o.iValley, 'A', 4), { symbol: 'I_L,min', group: g1 }),
    item('iLrms', 'RMS current', o.iLrms, 'A', si(o.iLrms, 'A', 4), { symbol: 'I_L,rms', group: g1 }),
    item('iCrit', 'CCM/DCM boundary load', o.iCrit, 'A', si(o.iCrit, 'A', 3), { symbol: 'I_out,crit', group: g1, tone: o.mode !== 'ccm' ? 'warn' : '', note: 'Iout below this leaves CCM' }),
    item('lCrit', 'L for CCM boundary', o.lCrit, 'H', si(o.lCrit, 'H', 3), { symbol: 'L_crit', group: g1, note: 'smallest L that keeps CCM at Iout' }),
    item('mode', 'Conduction mode', o.mode, '', o.mode === 'ccm' ? 'CCM' : o.mode === 'dcm' ? 'DCM' : 'CCM, negative current', { group: g1, tone: o.mode === 'ccm' ? '' : 'warn' }),
  );
  const g2 = 'Switches';
  const vStress = s.vout + (s.rect === 'diode' ? s.vf : 0);
  results.push(
    item('ton', 'On-time', o.ton, 's', si(o.ton, 's', 3), { symbol: 't_on', group: g2, note: `period ${si(T, 's', 3)}` }),
    item('iSwRms', 'Switch RMS current', worst.iSwRms, 'A', si(worst.iSwRms, 'A', 3), { symbol: 'I_SW,rms', group: g2, note: oMin ? (worstAtMin ? 'at V_in,min' : 'at Vin (worst case)') : '' }),
    item('iDAvg', s.rect === 'sync' ? 'Sync FET average current' : 'Diode average current', o.iDAvg, 'A', si(o.iDAvg, 'A', 3), { symbol: 'I_F', group: g2, note: 'equals Iout (SLVA372 eq. 7)' }),
    item('iDRms', s.rect === 'sync' ? 'Sync FET RMS current' : 'Diode RMS current', o.iDRms, 'A', si(o.iDRms, 'A', 3), { group: g2, note: `peak ${si(worst.iPk, 'A', 3)}` }),
    item('vStress', 'Switch / rectifier voltage', vStress, 'V', si(vStress, 'V', 3), { group: g2, note: 'Vout (+ V_F) plus ringing; derate ≥ 20 %' }),
  );
  const g3 = 'Capacitors';
  results.push(
    item('dVoutC', 'Ripple from C alone', o.dVoutC, 'V', si(o.dVoutC, 'V', 3), { group: g3, note: o.mode === 'dcm' ? 'charge only (ESR = 0), DCM waveform' : 'Iout·D/(fsw·C), SLVA372 eq. 9' }),
    item('dVoutEsr', 'Ripple from ESR alone', o.dVoutEsr, 'V', si(o.dVoutEsr, 'V', 3), { group: g3, note: 'ESR·I_pk, SLVA372 eq. 10' }),
    item('iCoutRms', 'Output cap RMS current', o.iCoutRms, 'A', si(o.iCoutRms, 'A', 3), { symbol: 'I_Cout,rms', group: g3, note: o.mode === 'ccm' ? '≈ Iout·√(D/(1 − D))' : '' }),
    item('iCinRms', 'Input cap RMS current', o.iCinRms, 'A', si(o.iCinRms, 'A', 3), { symbol: 'I_Cin,rms', group: g3, note: o.mode === 'ccm' ? 'ΔIL/√12' : '' }),
    item('dVin', 'Input ripple (p-p)', o.dVin, 'V', si(o.dVin, 'V', 3), { symbol: 'ΔV_in', group: g3, note: 'Cin carries the inductor ripple' }),
    item('iinAvg', 'Average input current', o.iinAvg, 'A', si(o.iinAvg, 'A', 3), { symbol: 'I_in', group: g3 }),
  );
  results.push(
    item('fRhp', 'Right-half-plane zero', o.mode === 'dcm' ? null : o.fRhp, 'Hz', o.mode === 'dcm' ? 'n/a in DCM' : si(o.fRhp, 'Hz', 3), {
      symbol: 'f_RHP',
      group: 'Control',
      note: o.mode === 'dcm' ? 'moves near fsw in DCM; not a design limit' : `(1 − D)²·R_load/(2π·L); crossover ≲ f_RHP/5${oMin ? ` · ${si(oMin.fRhp, 'Hz', 3)} at V_in,min` : ''}`,
    }),
  );
  const g4 = 'Losses';
  results.push(
    item('pSw', 'Switch conduction', o.loss.swCond, 'W', si(o.loss.swCond, 'W', 3), { group: g4 }),
    item('pRect', s.rect === 'sync' ? 'Sync FET conduction' : 'Diode conduction', o.loss.rect, 'W', si(o.loss.rect, 'W', 3), { group: g4 }),
    item('pDcr', 'Inductor DCR + core', o.loss.dcr + o.loss.core, 'W', si(o.loss.dcr + o.loss.core, 'W', 3), { group: g4 }),
    item('pEdge', 'Switching (edges, Qrr)', o.loss.edge + o.loss.qrr, 'W', si(o.loss.edge + o.loss.qrr, 'W', 3), { group: g4 }),
    item('pGate', 'Gate drive', o.loss.gate, 'W', si(o.loss.gate, 'W', 3), { group: g4 }),
    item('pCap', 'Capacitor ESR', o.loss.cout + o.loss.cin, 'W', si(o.loss.cout + o.loss.cin, 'W', 3), { group: g4 }),
    item('pLoss', 'Total loss', o.loss.total, 'W', si(o.loss.total, 'W', 3), { group: g4, note: `Pout ${si(o.pout, 'W', 3)}` }),
  );
  report.results = results;
  report.tables = [lossTable(o, s.rect)];
  report.summary = `${si(s.vin, 'V', 3)} → ${si(s.vout, 'V', 3)} at ${si(I, 'A', 3)} · fsw ${si(s.fsw, 'Hz', 3)} · ${s.rect === 'sync' ? 'synchronous' : 'diode'} · ${o.mode === 'ccm' ? 'CCM' : o.mode === 'dcm' ? 'DCM' : 'CCM (negative IL)'}`;
  notes.push(
    'Steady state, ideal switching waveforms: duty cycle from inductor volt-second balance with switch on-resistance, DCR and diode drop (Erickson ch. 3).',
    'Output ripple is evaluated exactly on the pulsed rectifier current (capacitor charge plus ESR); the ESL spikes at the current steps are on the Switching Regulator Ripple page.',
    'Switching losses are first-order estimates; Coss charging, dead-time body-diode conduction and controller quiescent current are not included.',
  );
  report.details = { ...o, inputs: toInputs(s), atVinMin: oMin, iMax };
  report.graphs = graphs(s, o);
  return report;
}

function noSolution(report: CalcReport, key: string, msg: string): CalcReport {
  report.warnings.push(msg);
  report.status = { text: 'NO SOLUTION', tone: 'fail' };
  report.results.push({ key, label: LABEL[key] ?? key, value: null, display: '—', primary: true, solved: true });
  return report;
}

const LOSS_NAMES: Record<string, string> = { swCond: 'switch conduction', rect: 'rectifier conduction', qrr: 'diode recovery', dcr: 'inductor DCR', core: 'core loss', edge: 'switching edges', gate: 'gate drive', cout: 'output-cap ESR', cin: 'input-cap ESR' };

function dominantLoss(o: BoostOutputs): string {
  const [k] = Object.entries(o.loss)
    .filter(([k]) => k in LOSS_NAMES)
    .sort((a, b) => b[1] - a[1])[0];
  return LOSS_NAMES[k] ?? k;
}

function lossTable(o: BoostOutputs, rect: Rectifier): TableSpec {
  const rows: [string, number, string][] = [
    ['Switch conduction', o.loss.swCond, 'I_SW,rms²·R_DS(on)'],
    [rect === 'sync' ? 'Sync FET conduction' : 'Diode conduction', o.loss.rect, rect === 'sync' ? 'I_SR,rms²·R_DS(on)' : 'Iout·V_F'],
    ...(rect === 'diode' ? [['Diode recovery', o.loss.qrr, 'Qrr·Vout·fsw (CCM)'] as [string, number, string]] : []),
    ['Inductor DCR', o.loss.dcr, 'I_L,rms²·DCR'],
    ['Core loss', o.loss.core, 'as entered'],
    ['Switching (edges)', o.loss.edge, '½·Vout·I·(tr+tf)·fsw'],
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

function graphs(s: BoostState, o: BoostOutputs): GraphSpec[] {
  const T = o.period;
  const tI: number[] = [];
  const iL: number[] = [];
  const iD: number[] = [];
  const vSw: number[] = [];
  for (let n = 0; n < 2; n++) {
    o.segments.forEach((sg, k) => {
      tI.push(n * T + sg.t0, n * T + sg.t1);
      iL.push(sg.i0, sg.i1);
      iD.push(k === 1 ? sg.i0 : 0, k === 1 ? sg.i1 : 0);
      vSw.push(sg.vsw, sg.vsw);
    });
  }
  const waves: GraphSpec = {
    id: 'waveforms',
    title: 'Waveforms',
    subtitle: o.mode === 'dcm' ? 'DCM: the switch node rings around Vin while the inductor is idle (shown as a flat level)' : undefined,
    x: { label: 'Time', unit: 's' },
    y: [
      { id: 'i', label: 'Current', unit: 'A', includeZero: true },
      { id: 'v', label: 'Switch node', unit: 'V', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'v_SW', x: tI, y: vSw, axis: 'v', color: '#9a8f7a', width: 1.3 },
      { label: 'i_L', x: tI, y: iL, axis: 'i', color: '#1f4e5f', width: 2.2 },
      { label: 'i_D (rectifier)', x: tI, y: iD, axis: 'i', color: '#c47b17', width: 1.4, dash: [5, 3] },
      { label: 'I_out', x: [0, 2 * T], y: [s.iout, s.iout], axis: 'i', color: '#2f7d4f', dash: [2, 3], width: 1.2, noReadout: true },
    ],
    legend: 'below',
  };

  const ls = logspace(s.l / 10, s.l * 10, 120);
  const sw0 = ls.map((l) => analyzeBoost(toInputs({ ...s, l })));
  const lsOk = ls.filter((_, k) => sw0[k]);
  const sweep = sw0.filter((x) => x) as BoostOutputs[];
  const rippleVsL: GraphSpec = {
    id: 'ripple-vs-l',
    title: 'Ripple vs L',
    x: { label: 'Inductance L', unit: 'H', log: true },
    y: [
      { id: 'i', label: 'ΔIL (p-p)', unit: 'A', includeZero: true },
      { id: 'f', label: 'RHP zero', unit: 'Hz', side: 'right', log: true },
    ],
    series: [
      { label: 'ΔIL', x: lsOk, y: sweep.map((r) => r.dIL), axis: 'i', width: 2.2 },
      { label: 'f_RHP (CCM)', x: lsOk, y: sweep.map((r) => r.fRhp), axis: 'f', color: '#6b5b95', width: 1.4, dash: [5, 3] },
    ],
    hlines: [{ value: 2 * (s.iout / (1 - o.d)), label: 'CCM boundary ΔIL = 2·I_L', axis: 'i', color: '#8b1e1e', dash: [5, 4] }],
    vlines: [{ value: s.l, label: `L = ${si(s.l, 'H', 3)}` }, ...(o.lCrit > ls[0] && o.lCrit < ls[ls.length - 1] ? [{ value: o.lCrit, label: 'L_crit', color: '#8b1e1e', dash: [3, 3] }] : [])],
    markers: [{ x: s.l, y: o.dIL, axis: 'i', label: si(o.dIL, 'A', 3) }],
  };
  if (o.mode === 'dcm') rippleVsL.hlines = [];

  const imax = maxOutputCurrent(toInputs(s));
  const is = logspace(s.iout / 50, Math.min(s.iout * 1.5, imax * 0.999), 100);
  const pts = is.map((i) => (ccmDuty(toInputs({ ...s, iout: i })) != null ? analyzeBoost(toInputs({ ...s, iout: i })) : null));
  const ix = is.filter((_, k) => pts[k] && Number.isFinite(pts[k]!.eff));
  const ok = pts.filter((p) => p && Number.isFinite(p.eff)) as BoostOutputs[];
  const effGraph: GraphSpec = {
    id: 'efficiency',
    title: 'Efficiency vs load',
    x: { label: 'Output current', unit: 'A', log: true },
    y: [
      { id: 'e', label: 'Efficiency', unit: '%', max: 100 },
      { id: 'p', label: 'Loss', unit: 'W', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'η', x: ix, y: ok.map((r) => r.eff * 100), axis: 'e', width: 2.2 },
      { label: 'Total loss', x: ix, y: ok.map((r) => r.loss.total), axis: 'p', color: '#c47b17', width: 1.4, dash: [5, 3] },
    ],
    vlines: [{ value: s.iout, label: `Iout = ${si(s.iout, 'A', 3)}` }, ...(o.iCrit > ix[0] && o.iCrit < ix[ix.length - 1] ? [{ value: o.iCrit, label: 'CCM boundary', color: '#8b1e1e', dash: [3, 3] }] : [])],
    markers: [{ x: s.iout, y: o.eff * 100, axis: 'e', label: pct(o.eff) }],
  };
  return [waves, rippleVsL, effGraph];
}

export const def: CalcDef<BoostState> = {
  id: 'power/boost-converter',
  version: '0.1.0',
  method:
    'Steady-state CCM/DCM boost power stage: duty from inductor volt-second balance with switch, DCR and diode drops (Erickson & Maksimović ch. 3, 5); ripple, inductor, peak-current and capacitor equations per TI SLVA372 (Hauke); output/input ripple evaluated exactly on the pulsed rectifier and the inductor current (charge + ESR); RHP zero (1 − D)²R/(2πL) (Erickson ch. 8); first-order switching, Qrr and gate (TI SLUA618) losses. L, fsw and Cout are solved by root finding on the same forward model.',
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
    { id: 'default', label: '5 V (4.5 V min) → 12 V, 0.5 A Schottky boost at 500 kHz: size L for 30 % ripple', state: defaults() },
    {
      id: 'liion-5v',
      label: 'Li-ion 3.7 V (3.0 V min) → 5 V, 1 A sync at 1 MHz (analyse 1 µH)',
      state: { solveFor: 'ripplePct', vin: 3.7, vinMin: 3.0, vout: 5, iout: 1, fsw: 1e6, fswUnit: 'MHz', l: 1e-6, lUnit: 'µH', dcr: 30e-3, pCore: 0.03, cout: 22e-6, esr: 3e-3, rect: 'sync', rSw: 40e-3, rRect: 50e-3, tsw: 10e-9, qg: 4e-9, vdrv: 5, cin: 10e-6, esrIn: 3e-3 },
    },
    {
      id: 'auto-24v',
      label: '12 V (9 V min) → 24 V, 1 A at 250 kHz: Cout for 100 mV ripple',
      state: { solveFor: 'cout', vin: 12, vinMin: 9, vout: 24, iout: 1, fsw: 250e3, fswUnit: 'kHz', l: 33e-6, lUnit: 'µH', dcr: 25e-3, pCore: 0.05, esr: 10e-3, dvOut: 0.1, rect: 'diode', rSw: 30e-3, vf: 0.5, qrr: 0, tsw: 25e-9, qg: 15e-9, vdrv: 7.5, cin: 22e-6, esrIn: 5e-3 },
    },
    {
      id: 'step-up-48',
      label: '12 V → 48 V, 1 A with a 22 µH part: fsw for 30 % ripple (high duty)',
      state: { solveFor: 'fsw', vin: 12, vinMin: 10, vout: 48, iout: 1, ripplePct: 30, l: 22e-6, lUnit: 'µH', dcr: 15e-3, pCore: 0.1, cout: 10e-6, esr: 5e-3, rect: 'diode', rSw: 15e-3, vf: 0.7, qrr: 20e-9, tsw: 30e-9, qg: 20e-9, vdrv: 10, cin: 47e-6, esrIn: 5e-3 },
    },
    {
      id: 'led-dcm',
      label: 'LED string: 3.6 V → 30 V at 20 mA, 4.7 µH at 1.2 MHz (DCM)',
      state: { solveFor: 'ripplePct', vin: 3.6, vinMin: 3.0, vout: 30, iout: 0.02, fsw: 1.2e6, fswUnit: 'MHz', l: 4.7e-6, lUnit: 'µH', dcr: 0.3, pCore: 0.005, cout: 1e-6, esr: 10e-3, rect: 'diode', rSw: 0.3, vf: 0.45, qrr: 0, tsw: 10e-9, qg: 1e-9, vdrv: 5, cin: 4.7e-6, esrIn: 5e-3 },
    },
  ],
};
