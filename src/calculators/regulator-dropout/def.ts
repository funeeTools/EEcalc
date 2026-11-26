/** Voltage-regulator dropout / headroom — calculator definition (inputs, solve-for, report). DOM-free. */

import { ldoPower } from '@/calculators/ldo-thermal/model';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { type DropModel, type DropParams, type Source, batterySource, dcSource, iForVdo, margin, vdoAt } from './model';

export const ID = 'general/voltage-regulator-dropout';

export type DropSolve = 'margin' | 'iout' | 'vout' | 'vin' | 'vEnd';

export interface DropState {
  solveFor: DropSolve;
  vout: number;
  iout: number;
  model: DropModel;
  vdo: number;
  vdo1: number;
  i1: number;
  vdo2: number;
  i2: number;
  ignd: number;
  source: 'dc' | 'battery';
  vin: number;
  /** ± % */
  vinTol: number;
  /** Peak-to-peak ripple on the input, V */
  ripple: number;
  chem: string;
  cells: number;
  vFull: number;
  vNom: number;
  vEnd: number;
  /** Headroom margin: result in analysis, target otherwise */
  margin: number;
}

/**
 * Per-cell voltages (full / nominal / end of discharge), typical values from D. Linden, T. B. Reddy,
 * Handbook of Batteries, 4th ed. (McGraw-Hill, 2011), ch. 1 and the chemistry chapters. Cells differ:
 * Li-ion end-of-discharge is 2.5–3.0 V by maker, alkaline cut-off 0.8–1.1 V by application. The lead-acid
 * “full” value is the absorption-charge voltage (worst-case dissipation with a charger connected).
 */
export const CELLS: Record<string, [number, number, number] | null> = {
  'Li-ion / LiPo (4.2 / 3.7 / 3.0 V)': [4.2, 3.7, 3.0],
  'LiFePO₄ (3.65 / 3.2 / 2.5 V)': [3.65, 3.2, 2.5],
  'NiMH (1.4 / 1.2 / 1.0 V)': [1.4, 1.2, 1.0],
  'Alkaline (1.6 / 1.5 / 0.9 V)': [1.6, 1.5, 0.9],
  'Lead-acid (2.4 charging / 2.0 / 1.75 V)': [2.4, 2.0, 1.75],
  Custom: null,
};

export const defaults = (): DropState => ({
  solveFor: 'margin',
  vout: 3.3,
  iout: 0.5,
  model: 'rdson',
  vdo: 2,
  vdo1: 0.3,
  i1: 0.5,
  vdo2: 0.6,
  i2: 1,
  ignd: 1e-3,
  source: 'dc',
  vin: 5,
  vinTol: 5,
  ripple: 0,
  chem: 'Li-ion / LiPo (4.2 / 3.7 / 3.0 V)',
  cells: 1,
  vFull: 4.2,
  vNom: 3.7,
  vEnd: 3.0,
  margin: 1.15,
});

const MODELS: { value: DropModel; label: string }[] = [
  { value: 'rdson', label: 'MOS pass: V_DO ∝ I (R_DS(on))' },
  { value: 'points', label: 'Two data-sheet points' },
  { value: 'fixed', label: 'Fixed V_DO (78xx, LM317)' },
];

const isDc = (_s: unknown, r: Record<string, any>) => r.source === 'dc';
const isBat = (_s: unknown, r: Record<string, any>) => r.source === 'battery';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Regulator',
    note: 'Click ◎ to choose the unknown. Use the dropout at your worst temperature (usually hot).',
    fields: [
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output voltage', unit: 'V', solvable: true, min: 0.01, max: 1000, onUnsolve: (_s, r) => (r.solveFor = 'margin'), help: 'Regulated output. Solving for it gives the highest output this input can hold with the target margin.' },
      { kind: 'number', key: 'iout', symbol: 'I_out', label: 'Load current', unit: 'A', solvable: true, min: 0, max: 100, visible: (_s, r) => r.model !== 'fixed', onUnsolve: (_s, r) => (r.solveFor = 'margin'), help: 'Maximum steady load current: dropout is worst at full load. Solving for it gives the largest load that keeps the target margin.' },
      // A fixed dropout does not depend on the load, so there is nothing to solve the current for: same state key, no ◎.
      { kind: 'number', key: 'iout', symbol: 'I_out', label: 'Load current', unit: 'A', min: 0, max: 100, visible: (_s, r) => r.model === 'fixed', help: 'Maximum steady load current (for the dissipation; a fixed dropout does not depend on it).' },
      {
        kind: 'select',
        key: 'model',
        label: 'Dropout model',
        options: MODELS,
        apply: (v, _s, r) => {
          // a fixed dropout does not depend on the load: there is no maximum current to solve for
          if (v === 'fixed' && r.solveFor === 'iout') r.solveFor = 'margin';
        },
        help: 'MOS pass (PMOS/NMOS LDO): dropout is the channel resistance times the current, so give one data-sheet point. Two points: a straight line through two dropout specs (bipolar LDOs). Fixed: NPN/Darlington regulators need about 2–3 V regardless of load.',
      },
      { kind: 'number', key: 'vdo', symbol: 'V_DO', label: 'Dropout voltage', unit: 'V', min: 0, max: 50, visible: (_s, r) => r.model === 'fixed', help: '78xx: 2 V typical at 1 A; LM317: up to 3 V headroom. Use the worst-case data-sheet value.' },
      { kind: 'number', key: 'vdo1', symbol: 'V_DO,1', label: 'Dropout at I₁', unit: 'V', min: 0, max: 50, visible: (_s, r) => r.model !== 'fixed', help: 'Data-sheet dropout voltage, typically specified at the rated current (e.g. 300 mV at 500 mA).' },
      { kind: 'number', key: 'i1', symbol: 'I₁', label: 'at current I₁', unit: 'A', min: 1e-6, max: 100, visible: (_s, r) => r.model !== 'fixed', help: 'The load current of that dropout spec.' },
      { kind: 'number', key: 'vdo2', symbol: 'V_DO,2', label: 'Dropout at I₂', unit: 'V', min: 0, max: 50, visible: (_s, r) => r.model === 'points', help: 'A second data-sheet point (another load current, or read from the dropout-vs-current curve).' },
      { kind: 'number', key: 'i2', symbol: 'I₂', label: 'at current I₂', unit: 'A', min: 1e-6, max: 100, visible: (_s, r) => r.model === 'points' },
      { kind: 'number', key: 'ignd', symbol: 'I_GND', label: 'Ground current', unit: 'A', min: 0, max: 1, help: 'Quiescent/ground-pin current at this load: counts in the input current, efficiency and dissipation.' },
    ],
  },
  {
    kind: 'section',
    title: 'Input source',
    fields: [
      {
        kind: 'select',
        key: 'source',
        label: 'Source',
        options: [
          { value: 'dc', label: 'DC supply (tolerance, ripple)' },
          { value: 'battery', label: 'Battery' },
        ],
        apply: (v, _s, r) => {
          // the other source's unknown is hidden now: go back to the headroom analysis
          if ((v === 'dc' && r.solveFor === 'vEnd') || (v === 'battery' && r.solveFor === 'vin')) r.solveFor = 'margin';
        },
      },
      { kind: 'number', key: 'vin', symbol: 'V_in', label: 'Supply (average)', unit: 'V', solvable: true, min: 0, max: 1000, visible: isDc, onUnsolve: (_s, r) => (r.solveFor = 'margin'), help: 'Nominal (average) input. Solving for it gives the lowest nominal supply that keeps the target margin at low line and in the ripple valley.' },
      { kind: 'number', key: 'vinTol', symbol: 'tol', label: 'Supply tolerance', suffix: '%', min: 0, max: 50, visible: isDc, help: 'Low-line tolerance of the supply (±5 % for USB VBUS at the host connector, wider after cable drop).' },
      { kind: 'number', key: 'ripple', symbol: 'V_pp', label: 'Ripple peak-to-peak', unit: 'V', min: 0, max: 1000, visible: isDc, help: 'Ripple on the input (rectifier/bulk-capacitor ripple, switcher ripple). Its valley, V_in − V_pp/2, is what the regulator sees at the worst instant.' },
      {
        kind: 'select',
        key: 'chem',
        label: 'Chemistry',
        options: Object.keys(CELLS),
        visible: isBat,
        apply: (v, s) => {
          const c = CELLS[v];
          if (!c) return;
          [s.vFull, s.vNom, s.vEnd] = c;
          if (s.solveFor === 'vEnd') s.solveFor = 'margin';
        },
        help: 'Fills typical full / nominal / end-of-discharge voltages per cell (Linden’s Handbook of Batteries). Use your cell’s data sheet and your cut-off.',
      },
      { kind: 'number', key: 'cells', symbol: 'n', label: 'Cells in series', min: 1, max: 200, integer: true, visible: isBat },
      { kind: 'number', key: 'vFull', symbol: 'V_full', label: 'Full cell voltage', unit: 'V', min: 0.1, max: 10, visible: isBat, help: 'Highest cell voltage: sets the worst dissipation. Li-ion 4.2 V at end of charge; lead-acid 2.4 V while charging (2.25–2.3 V float, 2.1 V open circuit). Use the charge or float voltage if the charger stays connected.' },
      { kind: 'number', key: 'vNom', symbol: 'V_nom', label: 'Nominal cell voltage', unit: 'V', min: 0.1, max: 10, visible: isBat, help: 'Mid-discharge plateau: used for the typical efficiency.' },
      { kind: 'number', key: 'vEnd', symbol: 'V_end', label: 'End-of-discharge', unit: 'V', min: 0, max: 10, solvable: true, visible: isBat, onUnsolve: (_s, r) => (r.solveFor = 'margin'), help: 'Cell voltage at the end of use (under load). Solving for it gives the lowest cell voltage at which the regulator still holds V_out with the target margin.' },
    ],
  },
  {
    kind: 'section',
    title: 'Headroom',
    fields: [
      { kind: 'number', key: 'margin', symbol: 'ΔV', label: 'Headroom margin', unit: 'V', solvable: true, min: -1e12, max: 2000 /* analysis covers V_DO = 50 V/1 µA × 100 A */, help: 'Lowest input minus (V_out + V_DO). Calculated in analysis; when solving for something else it is the margin to design to (0 = exactly at dropout).' },
    ],
  },
];

const LABEL: Record<DropSolve, string> = { margin: 'Headroom margin', iout: 'Maximum load current', vout: 'Maximum output voltage', vin: 'Minimum supply (average)', vEnd: 'Cell voltage at dropout' };
const SYM: Record<DropSolve, string> = { margin: 'ΔV', iout: 'I_out,max', vout: 'V_out,max', vin: 'V_in', vEnd: 'V_end' };

const fV = (v: number, d = 4) => si(v, 'V', d);
const fI = (i: number) => si(i, 'A', 3);
const fP = (p: number) => si(p, 'W', 3);
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

function fail(msg: string, s: DropState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

const dropParams = (s: DropState): DropParams => ({ model: s.model, vdo: s.vdo, ron: s.vdo1 / s.i1, i1: s.i1, vdo1: s.vdo1, i2: s.i2, vdo2: s.vdo2 });
const sourceOf = (s: DropState): Source => (s.source === 'battery' ? batterySource(s.cells, s.vFull, s.vNom, s.vEnd) : dcSource(s.vin, s.vinTol / 100, s.ripple));

export function compute(st: DropState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: DropState): CalcReport {
  const s: DropState = { ...st };
  for (const k of ['vout', 'iout', 'vdo', 'vdo1', 'i1', 'vdo2', 'i2', 'ignd', 'vin', 'vinTol', 'ripple', 'cells', 'vFull', 'vNom', 'vEnd', 'margin'] as const) {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (s.vdo < 0 || s.vdo1 < 0 || s.vdo2 < 0 || s.ignd < 0 || s.ripple < 0) throw new Error('Dropout voltages, ground current and ripple must be ≥ 0.');
  if (s.model !== 'fixed' && !(s.i1 > 0)) throw new Error('I₁ must be > 0.');
  // Two points at the same current define no slope: use the line through the origin instead (and say so),
  // so switching to this model from a state with I₂ = I₁ still gives an answer.
  const samePoint = s.model === 'points' && Math.abs(s.i2 - s.i1) < 1e-12 * Math.max(s.i1, s.i2);
  if (samePoint) s.model = 'rdson';
  if (s.source === 'dc' && (s.vinTol < 0 || s.vinTol >= 100)) throw new Error('Supply tolerance must be between 0 and 100 %.');
  if (s.source === 'battery' && !(s.cells >= 1)) throw new Error('At least one cell.');
  if (s.solveFor === 'vin' && s.source !== 'dc') s.solveFor = 'margin';
  if (s.solveFor === 'vEnd' && s.source !== 'battery') s.solveFor = 'margin';
  const p = dropParams(s);

  // ── solve: every model is linear in I, V_out and the input, so the inverses are exact.
  // Mode-switch harness: the medium "error-after-edit" flags left are typed numbers whose target has no answer
  // (a cell above 10 V, a supply above 1 kV, an input below the zero-load dropout…): those errors are intended.
  const need = () => s.vout + vdoAt(p, s.iout) + s.margin;
  switch (s.solveFor) {
    case 'margin':
      break;
    case 'iout': {
      if (s.model === 'fixed') return fail('A fixed dropout does not depend on the load current, so there is no maximum load to solve for. Pick a load-dependent dropout model.', s);
      if (s.model === 'points' && !((s.vdo2 - s.vdo1) / (s.i2 - s.i1) > 0)) return fail('The two dropout points give a dropout that does not rise with load, so no maximum load follows from them. Check the data-sheet points (dropout normally grows with current).', s);
      const x = sourceOf(s).vMin - s.vout - s.margin;
      const i = iForVdo(p, x);
      if (i == null) return fail(`The input leaves ${fV(x, 3)} for the dropout, less than the smallest dropout this model gives (${fV(vdoAt(p, 0), 3)} at zero load): no load current keeps the margin. Raise the input or lower V_out.`, s);
      if (i > 100) return fail(`Over 100 A of load would still keep the margin: the dropout does not limit this design.`, s);
      s.iout = i;
      break;
    }
    case 'vout': {
      const v = sourceOf(s).vMin - vdoAt(p, s.iout) - s.margin;
      if (!(v >= 0.01)) return fail(`The lowest input (${fV(sourceOf(s).vMin, 3)}) minus the dropout (${fV(vdoAt(p, s.iout), 3)}) and the margin leaves no output. Raise the input or reduce the load.`, s);
      if (v > 1000) return fail(`This allows ${fV(v, 3)} out, above the 1 kV the page accepts: lower the input or raise the margin target.`, s);
      s.vout = v;
      break;
    }
    case 'vin': {
      const v = (need() + s.ripple / 2) / (1 - s.vinTol / 100);
      if (!(v >= 0)) return fail(`A margin target of ${fV(s.margin, 3)} is below −(V_out + V_DO): any supply would do. Enter a margin of 0 V or more.`, s);
      if (v > 1000) return fail(`This needs an average supply of ${fV(v, 3)}, above the 1 kV the page accepts.`, s);
      s.vin = v;
      break;
    }
    case 'vEnd': {
      const v = need() / s.cells;
      if (!(v >= 0)) return fail(`A margin target of ${fV(s.margin, 3)} is below −(V_out + V_DO): any cell voltage would do. Enter a margin of 0 V or more.`, s);
      if (v > 10) return fail(`Each of the ${s.cells} cells would have to stay above ${fV(v, 3)}, beyond any cell chemistry. Add cells or lower V_out.`, s);
      s.vEnd = v;
      break;
    }
    default:
      throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }

  const src = sourceOf(s);
  const vdoI = vdoAt(p, s.iout);
  const vReq = s.vout + vdoI;
  const m0 = margin(src.vMin, s.vout, vdoI);
  // a solved design sits exactly on its target: clear the rounding residue so 0 V margin is not "dropout"
  const m = Math.abs(m0) < 1e-9 * Math.max(1, vReq) ? 0 : m0;
  if (s.solveFor === 'margin') s.margin = m;
  const dropout = m < 0;
  const solved = s.solveFor;
  const op = (vin: number) => ldoPower({ vin, vout: s.vout, iout: s.iout, ignd: s.ignd, thetaJA: 1, ta: 0 });
  const pMax = op(Math.max(src.vMax, vReq));
  const pNom = op(Math.max(src.vNom, vReq));
  const report: CalcReport = { ...emptyReport(ID), solveFor: solved };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  // ── headline
  const sv = s[solved];
  const svDisp = solved === 'iout' ? fI(sv) : fV(sv);
  const svNote: Record<DropSolve, string> = {
    margin: dropout ? 'in dropout at the lowest input' : `above V_out + V_DO at the lowest input`,
    iout: `keeps ${fV(s.margin, 3)} margin`,
    vout: `with ${fV(s.margin, 3)} margin at ${fI(s.iout)}`,
    vin: `±${+s.vinTol.toPrecision(3)} %${s.ripple > 0 ? `, ${fV(s.ripple, 3)} ripple` : ''}, ${fV(s.margin, 3)} margin`,
    vEnd: `${s.cells} cell${s.cells > 1 ? 's' : ''}, ${fV(s.margin, 3)} margin`,
  };
  const primary: ResultItem[] = [
    item(solved, LABEL[solved], sv, solved === 'iout' ? 'A' : 'V', svDisp, { symbol: SYM[solved], solved: true, primary: true, tone: solved === 'margin' ? (dropout ? 'fail' : 'pass') : '', note: svNote[solved] }),
    item('vinReq', 'Minimum input', vReq, 'V', fV(vReq), { symbol: 'V_in,req', primary: true, note: `V_out + V_DO(${fI(s.iout)}) = ${fV(s.vout, 3)} + ${fV(vdoI, 3)}` }),
    item('vinLow', 'Lowest input', src.vMin, 'V', fV(src.vMin), { symbol: 'V_in,min', primary: true, tone: dropout ? 'fail' : '', note: s.source === 'dc' ? (s.ripple > 0 ? 'low line, ripple valley' : 'low line') : `${s.cells} × ${fV(s.vEnd, 3)} end of discharge` }),
  ];
  if (solved !== 'margin') primary.push(item('marginCheck', 'Headroom margin', m, 'V', fV(m), { symbol: 'ΔV', primary: true, tone: dropout ? 'fail' : '' }));
  primary.push(item('pdMax', 'Worst dissipation', pMax.pd, 'W', fP(pMax.pd), { symbol: 'P_D,max', primary: true, note: `at V_in ${fV(Math.max(src.vMax, vReq), 3)}` }));

  const rest: ResultItem[] = [
    item('vdoI', 'Dropout at this load', vdoI, 'V', fV(vdoI), { symbol: 'V_DO', group: 'Dropout' }),
    ...(s.model === 'rdson' ? [item('ron', 'Pass-device resistance', p.ron, 'Ω', si(p.ron, 'Ω', 4), { symbol: 'R_DS(on)', group: 'Dropout', note: 'V_DO,1 / I₁' })] : []),
    ...(s.model === 'points' ? [item('slope', 'Dropout slope', (s.vdo2 - s.vdo1) / (s.i2 - s.i1), 'Ω', si((s.vdo2 - s.vdo1) / (s.i2 - s.i1), 'Ω', 4), { symbol: 'dV_DO/dI', group: 'Dropout' }), item('vdo0', 'Zero-load intercept', s.vdo1 - (s.i1 * (s.vdo2 - s.vdo1)) / (s.i2 - s.i1), 'V', fV(s.vdo1 - (s.i1 * (s.vdo2 - s.vdo1)) / (s.i2 - s.i1)), { group: 'Dropout' })] : []),
    item('vinNom', 'Typical input', src.vNom, 'V', fV(src.vNom), { group: 'Input', symbol: 'V_in,nom' }),
    item('vinMax', 'Highest input', src.vMax, 'V', fV(src.vMax), { group: 'Input', symbol: 'V_in,max', note: s.source === 'dc' ? 'high line, ripple peak' : 'fully charged' }),
    item('iin', 'Input current', pNom.iin, 'A', fI(pNom.iin), { symbol: 'I_in', group: 'Power', note: 'I_out + I_GND' }),
    item('pout', 'Output power', pNom.pout, 'W', fP(pNom.pout), { symbol: 'P_out', group: 'Power' }),
    item('pdNom', 'Dissipation (typical)', pNom.pd, 'W', fP(pNom.pd), { symbol: 'P_D', group: 'Power', note: `at ${fV(Math.max(src.vNom, vReq), 3)}` }),
    item('effNom', 'Efficiency (typical)', pNom.eff, '', pct(pNom.eff), { symbol: 'η', group: 'Power' }),
    item('effMax', 'Efficiency at high input', pMax.eff, '', pct(pMax.eff), { symbol: 'η_min', group: 'Power' }),
  ];
  if (s.source === 'battery') {
    const vCell = vReq / s.cells;
    rest.push(item('vCellDrop', 'Cell voltage at dropout', vCell, 'V', fV(vCell), { symbol: 'V_cell', group: 'Battery', tone: vCell > s.vEnd ? 'warn' : '', note: vCell > s.vNom ? 'above the nominal plateau' : vCell > s.vEnd ? 'before the end of discharge' : 'below the end of discharge' }));
  }
  report.results = [...primary, ...rest];

  // ── verdict, warnings, notes
  const neverOk = s.source === 'battery' && vReq > s.cells * s.vFull * (1 + 1e-12);
  report.status = neverOk ? { text: 'BATTERY TOO LOW', tone: 'fail' } : dropout ? { text: 'DROPOUT', tone: 'fail' } : { text: 'REGULATES', tone: 'pass' };
  if (neverOk) warnings.push(`Even fully charged, ${s.cells} cell${s.cells > 1 ? 's' : ''} give only ${fV(s.cells * s.vFull, 3)}, below the ${fV(vReq, 3)} the regulator needs: this battery can never supply it. Add cells or lower V_out.`);
  if (dropout) {
    const vo = Math.max(src.vMin - vdoI, 0);
    warnings.push(`At the lowest input (${fV(src.vMin, 3)}) the regulator is ${fV(-m, 3)} short of headroom: the output falls to about ${fV(vo, 3)} and input ripple passes through. Raise the input, use a lower-dropout regulator, or reduce the load.`);
  } else if (m < 0.1 * vReq && s.solveFor === 'margin') notes.push(`The margin is under 10 % of the required input: near dropout, ripple rejection (PSRR) and transient response degrade well before the output drops.`);
  if (s.source === 'battery') {
    const vCell = vReq / s.cells;
    if (vCell > s.vNom) warnings.push(`The regulator drops out at ${fV(vCell, 3)} per cell, above the nominal ${fV(s.vNom, 3)}: most of the battery capacity is unusable. Add a cell, choose a lower V_out, or use a buck-boost converter.`);
  }
  if (samePoint) warnings.push('The two dropout points have the same current, so they define no slope: the dropout is taken as proportional to the load through point 1. Enter a second point at another current.');
  if (s.model === 'points') {
    const lo = Math.min(s.i1, s.i2);
    const hi = Math.max(s.i1, s.i2);
    if (s.iout > hi * 1.2 || s.iout < lo * 0.5) notes.push(`I_out ${fI(s.iout)} is outside the two data-sheet points (${fI(lo)} … ${fI(hi)}): the straight line is extrapolated. Read a point near this load from the dropout curve.`);
    if (s.vdo2 < s.vdo1 === s.i2 > s.i1 && s.vdo1 !== s.vdo2) warnings.push('The dropout falls as the current rises between the two points: check the data-sheet values (dropout normally grows with load).');
  }
  if (pMax.pd > 1) warnings.push(`Up to ${fP(pMax.pd)} is dissipated at the highest input: check the junction temperature on the LDO thermal page.`);
  if (pNom.eff < 0.5 && !dropout) notes.push(`Efficiency is ${pct(pNom.eff)}: a linear regulator burns (V_in − V_out)·I_out. A buck converter (or a lower input) saves power if heat or battery life matters.`);
  notes.push('Dropout rises with temperature and current; use the data-sheet maximum at your hottest junction temperature. The model ignores the input’s own source resistance (cables, battery internal resistance): subtract its drop from the input first.');

  report.summary = `${fV(s.vout, 3)} at ${fI(s.iout)} needs ≥ ${fV(vReq, 4)} · lowest input ${fV(src.vMin, 4)} · margin ${fV(m, 3)}`;
  report.details = { src, vdoI, vReq, margin: m, pMax, pNom, ron: p.ron };
  report.graphs = graphs(s, p, src, vdoI);
  return report;
}

function graphs(s: DropState, p: DropParams, src: Source, vdoI: number): GraphSpec[] {
  // 1 — required input vs load current, against the lowest available input
  const iTop = Math.max(s.iout * 1.6, s.model === 'fixed' ? 0 : Math.max(s.i1, s.model === 'points' ? s.i2 : 0) * 1.2, 1e-3);
  const is = Array.from({ length: 121 }, (_, k) => (iTop * k) / 120);
  const req = (i: number) => s.vout + vdoAt(p, i);
  const g1: GraphSpec = {
    id: 'vin-vs-load',
    title: 'Required input vs load',
    x: { label: 'Load current I_out', unit: 'A' },
    y: [{ id: 'v', label: 'Input voltage', unit: 'V', includeZero: false }],
    series: [
      { label: 'V_out + V_DO(I)', x: is, y: is.map(req), axis: 'v', width: 2.2 },
      { label: 'V_out', x: [0, iTop], y: [s.vout, s.vout], axis: 'v', color: '#9a8f7a', width: 1.2, dash: [3, 3], noReadout: true },
    ],
    hlines: [
      { value: src.vMin, label: `lowest input ${si(src.vMin, 'V', 3)}`, axis: 'v', color: '#8b1e1e', dash: [4, 4], width: 1.2 },
      ...(src.vNom > src.vMin * 1.0001 ? [{ value: src.vNom, label: `typical ${si(src.vNom, 'V', 3)}`, axis: 'v', color: '#9a8f7a', dash: [2, 3] }] : []),
    ],
    vlines: [{ value: s.iout, label: `I_out ${si(s.iout, 'A', 3)}`, color: '#1f4e5f' }],
    markers: [{ x: s.iout, y: s.vout + vdoI, axis: 'v', label: si(s.vout + vdoI, 'V', 3) }],
  };
  // 2 — dissipation and efficiency across the input range
  const v0 = s.vout + vdoI;
  const v1 = Math.max(src.vMax * 1.15, v0 * 1.3);
  const vs = Array.from({ length: 121 }, (_, k) => v0 + ((v1 - v0) * k) / 120);
  const pw = (v: number) => ldoPower({ vin: v, vout: s.vout, iout: s.iout, ignd: s.ignd, thetaJA: 1, ta: 0 });
  const g2: GraphSpec = {
    id: 'power-vs-vin',
    title: 'Dissipation & efficiency',
    subtitle: `from dropout (${si(v0, 'V', 3)}) upward at I_out ${si(s.iout, 'A', 3)}`,
    x: { label: 'Input voltage V_in', unit: 'V' },
    y: [
      { id: 'p', label: 'Dissipation', unit: 'W', includeZero: true },
      { id: 'e', label: 'Efficiency', unit: '%', side: 'right', min: 0, max: 100 },
    ],
    series: [
      { label: 'P_D', x: vs, y: vs.map((v) => pw(v).pd), axis: 'p', width: 2.2 },
      { label: 'η', x: vs, y: vs.map((v) => pw(v).eff * 100), axis: 'e', color: '#c47b17', width: 1.8 },
    ],
    vlines: [
      { value: Math.max(src.vMin, v0), label: src.vMin >= v0 ? 'lowest' : 'dropout', color: src.vMin >= v0 ? '#9a8f7a' : '#8b1e1e', dash: [3, 3] },
      { value: Math.max(src.vMax, v0), label: 'highest', color: '#9a8f7a', dash: [3, 3] },
    ],
  };
  return [g1, g2];
}

export const def: CalcDef<DropState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Headroom check V_in,min ≥ V_out + V_DO(I_out) (TI SLVA079 dropout definition) with a fixed, R_DS(on)-proportional or two-point linear dropout model; lowest input from supply tolerance and ripple valley or battery end-of-discharge (Linden’s Handbook of Batteries); exact linear inverses for the maximum load, maximum output, minimum supply and cut-off cell voltage; dissipation and efficiency from the LDO thermal model (TI SLVA118A).',
  fields,
  defaults,
  solve: {
    default: 'margin',
    analysis: 'margin',
    options: [
      { key: 'margin', label: 'Headroom margin (analysis)' },
      { key: 'iout', label: 'Maximum load current' },
      { key: 'vout', label: 'Maximum output voltage' },
      { key: 'vin', label: 'Minimum supply voltage (DC supply)' },
      { key: 'vEnd', label: 'Lowest cell voltage (battery)' },
    ],
  },
  compute,
  sync: (s) => {
    const c = CELLS[s.chem];
    // a solved V_end is a result, not an edit of the preset
    const endEdited = c != null && s.solveFor !== 'vEnd' && Math.abs(c[2] - s.vEnd) > 1e-9;
    if (c && (Math.abs(c[0] - s.vFull) > 1e-9 || Math.abs(c[1] - s.vNom) > 1e-9 || endEdited)) s.chem = 'Custom';
  },
  examples: [
    { id: 'default', label: '3.3 V, 0.5 A PMOS LDO from USB 5 V ±5 %', state: defaults() },
    { id: 'liion-3v3', label: '3.3 V LDO on one Li-ion cell: where does it drop out?', state: { ...defaults(), solveFor: 'vEnd', source: 'battery', vout: 3.3, iout: 0.2, model: 'rdson', vdo1: 0.25, i1: 0.3, margin: 0 } },
    { id: 'ripple-valley', label: '5 V, 1 A bipolar LDO after a rectifier: ripple valley', state: { ...defaults(), solveFor: 'margin', vout: 5, iout: 1, model: 'points', vdo1: 0.25, i1: 0.1, vdo2: 0.6, i2: 1, ignd: 10e-3, source: 'dc', vin: 7, vinTol: 10, ripple: 1.2 } },
    { id: '7805-min-vin', label: '7805 at 1 A: minimum supply for 0.5 V margin', state: { ...defaults(), solveFor: 'vin', vout: 5, iout: 1, model: 'fixed', vdo: 2, ignd: 5e-3, source: 'dc', vinTol: 10, ripple: 1, margin: 0.5 } },
    { id: 'max-load', label: '1.8 V from 2.5 V ±5 %: maximum load for the PMOS LDO', state: { ...defaults(), solveFor: 'iout', vout: 1.8, model: 'rdson', vdo1: 0.35, i1: 1, vdo2: 0.07, i2: 0.2, ignd: 0.5e-3, source: 'dc', vin: 2.5, vinTol: 5, ripple: 0, margin: 0.05 } },
    { id: 'alkaline-3', label: '3.3 V from 3 × AA alkaline: drops out at 1.14 V per cell', state: { ...defaults(), solveFor: 'margin', vout: 3.3, iout: 0.1, model: 'rdson', vdo1: 0.2, i1: 0.15, source: 'battery', chem: 'Alkaline (1.6 / 1.5 / 0.9 V)', cells: 3, vFull: 1.6, vNom: 1.5, vEnd: 0.9 } },
  ],
};
