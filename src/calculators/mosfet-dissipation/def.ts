/** MOSFET power dissipation in a hard-switched converter — definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSeries, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_OHM, withDefault } from '@/core/unitsets';
import { type FetInputs, type FetResult, type Role, analyze, iMaxDrive, lossAt } from './model';

export type FetSolve = 'tj' | 'iL' | 'fsw' | 'rthJA' | 'rthSA';
export type ThermalPath = 'ja' | 'jc';

export interface FetState {
  solveFor: FetSolve;
  role: Role;
  v: number;
  iL: number;
  dIL: number;
  duty: number;
  fsw: number;
  fswUnit: string;
  part: string;
  vdsMax: number;
  rds25: number;
  rdsUnit: string;
  vgsSpec: number;
  alphaPct: number;
  tjMax: number;
  vth: number;
  gfs: number;
  qg: number;
  qgs: number;
  qgd: number;
  qgth: number;
  rgInt: number;
  coss: number;
  cossUnit: string;
  cossOpp: number;
  topo: 'buck' | 'boost';
  rect: 'fet' | 'diode';
  vsd: number;
  vdrv: number;
  rSrc: number;
  rSnk: number;
  rgExt: number;
  tdt: number;
  qrr: number;
  path: ThermalPath;
  ta: number;
  rthJA: number;
  rthJC: number;
  rthCS: number;
  rthSA: number;
  tj: number;
}

interface Part {
  vdsMax: number;
  rds25: number;
  vgsSpec: number;
  alphaPct: number;
  tjMax: number;
  vth: number;
  gfs: number;
  qg: number;
  qgs: number;
  qgd: number;
  qgth: number;
  rgInt: number;
  coss: number;
  vsd: number;
  qrr: number;
  rthJC: number;
  rthJA: number;
}

/**
 * Datasheet values (checked against the TI PDFs, Nov 2026): R_DS(on) max at the listed V_GS; V_th, g_fs, Q_g,
 * Q_gs, Q_gd, Q_g(th), R_G, V_SD, Q_rr typical; R_θJC and R_θJA max (1 in² 2 oz pad). α is the slope of the
 * Figure 8 "normalized R_DS(on) vs temperature" curve between 25 °C and 125 °C. C_oss,eff = Q_oss / V_DS at
 * the Q_oss test point (charge-equivalent, slightly conservative for the stored energy).
 */
export const PARTS: Record<string, Part> = {
  'CSD17578Q5A · 30 V · V_GS 4.5 V': { vdsMax: 30, rds25: 9.3e-3, vgsSpec: 4.5, alphaPct: 0.55, tjMax: 150, vth: 1.5, gfs: 44, qg: 7.9e-9, qgs: 3.1e-9, qgd: 2.0e-9, qgth: 1.7e-9, rgInt: 1.8, coss: 4.2e-9 / 15, vsd: 0.8, qrr: 6.5e-9, rthJC: 3.8, rthJA: 50 },
  'CSD17578Q5A · 30 V · V_GS 10 V': { vdsMax: 30, rds25: 6.9e-3, vgsSpec: 10, alphaPct: 0.6, tjMax: 150, vth: 1.5, gfs: 44, qg: 17.2e-9, qgs: 3.1e-9, qgd: 2.0e-9, qgth: 1.7e-9, rgInt: 1.8, coss: 4.2e-9 / 15, vsd: 0.8, qrr: 6.5e-9, rthJC: 3.8, rthJA: 50 },
  'CSD18540Q5B · 60 V · V_GS 10 V': { vdsMax: 60, rds25: 2.2e-3, vgsSpec: 10, alphaPct: 0.6, tjMax: 175, vth: 1.9, gfs: 116, qg: 41e-9, qgs: 8.8e-9, qgd: 6.7e-9, qgth: 6.3e-9, rgInt: 0.8, coss: 83e-9 / 30, vsd: 0.8, qrr: 145e-9, rthJC: 0.8, rthJA: 50 },
  'CSD19534Q5A · 100 V · V_GS 10 V': { vdsMax: 100, rds25: 15.1e-3, vgsSpec: 10, alphaPct: 0.8, tjMax: 150, vth: 2.8, gfs: 47, qg: 17e-9, qgs: 5.1e-9, qgd: 3.2e-9, qgth: 3.3e-9, rgInt: 1.1, coss: 44e-9 / 50, vsd: 0.8, qrr: 134e-9, rthJC: 2.0, rthJA: 50 },
};
const PART_KEYS = Object.keys(PARTS);
const PART_FIELDS: (keyof Part)[] = ['vdsMax', 'rds25', 'vgsSpec', 'alphaPct', 'tjMax', 'vth', 'gfs', 'qg', 'qgs', 'qgd', 'qgth', 'rgInt', 'coss', 'vsd'];
export const DEFAULT_PART = 'CSD17578Q5A · 30 V · V_GS 4.5 V';

export const defaults = (): FetState => ({
  solveFor: 'tj',
  role: 'switch',
  v: 12,
  iL: 10,
  dIL: 3,
  duty: 28,
  fsw: 500e3,
  fswUnit: 'kHz',
  part: DEFAULT_PART,
  ...partState(DEFAULT_PART),
  rdsUnit: 'mΩ',
  cossUnit: 'pF',
  topo: 'buck',
  rect: 'fet',
  vdrv: 5,
  rSrc: 1.5,
  rSnk: 0.8,
  rgExt: 0,
  tdt: 20e-9,
  path: 'ja',
  ta: 50,
  rthJA: 50,
  rthCS: 0.5,
  rthSA: 20,
  tj: 100,
});

function partState(name: string): Omit<Part, 'rthJA'> & { cossOpp: number } {
  const { rthJA: _r, ...rest } = PARTS[name];
  // the opposite rectifier is assumed to be the same part (Q_rr and C_oss), as in a synchronous leg
  return { ...rest, cossOpp: rest.coss };
}

const U_MOHM = withDefault(U_OHM, 'mΩ');
const U_FREQ_K = withDefault(U_FREQ, 'kHz');
const U_CAP_P = withDefault(U_CAP, 'pF');

const isSwitch = (s: any) => s.role === 'switch';
const tjSolvedWhen = (_s: any, root: any) => root.solveFor === 'tj';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Converter operating point',
    fields: [
      {
        kind: 'select',
        key: 'role',
        label: 'Position',
        options: [
          { value: 'switch', label: 'Control switch (hard-switched)' },
          { value: 'sr', label: 'Synchronous rectifier' },
        ],
        help: 'Control switch: the high-side FET of a buck or the low-side FET of a boost, switched on and off under full voltage and current. Synchronous rectifier: the FET that replaces the freewheeling diode; its channel switches at nearly zero voltage, but its body diode conducts during each dead time.',
      },
      { kind: 'select', key: 'topo', label: 'Topology', options: [{ value: 'buck', label: 'Buck (control FET on the high side)' }, { value: 'boost', label: 'Boost (control FET on the low side)' }], help: 'Only changes the drawing and the meaning of V_sw and I_L: the loss equations are the same for any hard-switched leg.' },
      { kind: 'select', key: 'rect', label: 'Rectifier', options: [{ value: 'fet', label: 'Synchronous FET' }, { value: 'diode', label: 'Schottky diode' }], visible: isSwitch, help: 'The opposite device. Enter its Q_rr (0 for a Schottky) and its capacitance (FET C_oss,eff or diode C_j) below.' },
      { kind: 'number', key: 'v', symbol: 'V_sw', label: 'Switched voltage', unit: 'V', min: 0.1, max: 2000, help: 'Off-state drain–source voltage: Vin for a buck, Vout (+ diode drop) for a boost. Ringing above it is not included.' },
      { kind: 'number', key: 'iL', symbol: 'I_L', label: 'Inductor current (mean)', unit: 'A', min: 1e-3, max: 1000, solvable: true, help: 'Average inductor current while this FET conducts: Iout for a buck, Iin for a boost. Solve for it to find the largest current that keeps T_J at the target.' },
      { kind: 'number', key: 'dIL', symbol: 'ΔI_L', label: 'Ripple current (p-p)', unit: 'A', min: 0, max: 2000, help: 'Peak-to-peak inductor ripple. The switch turns on at I_L − ΔI_L/2 and off at I_L + ΔI_L/2.' },
      { kind: 'number', key: 'duty', symbol: 'D', label: 'Control duty cycle', suffix: '%', min: 0.1, max: 99.9, help: 'Duty cycle of the control switch (Vout/Vin for a buck). The synchronous rectifier conducts for 1 − D.' },
      { kind: 'number', key: 'fsw', symbol: 'f_sw', label: 'Switching frequency', units: U_FREQ_K, unitKey: 'fswUnit', unitFamily: 'none', min: 1e3, max: 10e6, solvable: true, help: 'Solve for it to find the highest frequency that keeps T_J at the target.' },
    ],
  },
  {
    kind: 'section',
    title: 'MOSFET',
    fields: [
      {
        kind: 'select',
        key: 'part',
        label: 'Preset',
        options: [...PART_KEYS, 'Custom'],
        apply: (v: string, s: any) => {
          if (PARTS[v]) Object.assign(s, partState(v), s.path === 'ja' && s.solveFor !== 'rthJA' ? { rthJA: PARTS[v].rthJA } : {});
        },
        help: 'Fills the device fields from the datasheet (TI NexFET): R_DS(on) max at the named V_GS, typical charges, the R_DS(on)-vs-temperature slope, R_θJC and the 1 in² pad R_θJA. Q_rr is filled assuming the same part is the rectifier. Editing any device field switches to Custom.',
      },
      { kind: 'number', key: 'vdsMax', symbol: 'V_DSS', label: 'Drain voltage rating', unit: 'V', min: 5, max: 3000 },
      { kind: 'number', key: 'rds25', symbol: 'R_DS(on)', label: 'On-resistance at 25 °C', units: U_MOHM, unitKey: 'rdsUnit', min: 1e-5, max: 100, help: 'Maximum R_DS(on) at T_J = 25 °C and your gate-drive voltage (the datasheet lists it at a few V_GS values).' },
      { kind: 'number', key: 'vgsSpec', symbol: 'V_GS,spec', label: 'R_DS(on) specified at', unit: 'V', min: 1, max: 20, help: 'The V_GS at which that R_DS(on) is guaranteed. A lower drive voltage than this is flagged.' },
      { kind: 'number', key: 'alphaPct', symbol: 'α', label: 'R_DS(on) tempco', suffix: '%/°C', min: 0, max: 1, help: 'Slope of the datasheet “normalized R_DS(on) vs temperature” curve: (R125/R25 − 1)/100 °C. Typically 0.4–0.8 %/°C for silicon MOSFETs.' },
      { kind: 'number', key: 'tjMax', symbol: 'T_J,max', label: 'Max junction temp.', suffix: '°C', min: 100, max: 225 },
    ],
  },
  {
    kind: 'section',
    title: 'Gate charge & capacitance',
    collapsed: true,
    note: 'Typical values from the datasheet’s dynamic characteristics.',
    fields: [
      { kind: 'number', key: 'vth', symbol: 'V_th', label: 'Gate threshold', unit: 'V', min: 0.3, max: 10 },
      { kind: 'number', key: 'gfs', symbol: 'g_fs', label: 'Transconductance', unit: 'S', min: 0.1, max: 2000, help: 'Sets the Miller plateau V_pl = V_th + I/g_fs (TI SLUA618 eq. 8).' },
      { kind: 'number', key: 'qg', symbol: 'Q_g', label: 'Total gate charge', unit: 'C', min: 1e-10, max: 1e-5, help: 'At your gate-drive voltage (datasheets list Q_g at 4.5 V and 10 V).' },
      { kind: 'number', key: 'qgs', symbol: 'Q_gs', label: 'Gate–source charge', unit: 'C', min: 0, max: 1e-5 },
      { kind: 'number', key: 'qgd', symbol: 'Q_gd', label: 'Gate–drain (Miller) charge', unit: 'C', min: 0, max: 1e-5, help: 'Charge moved during the voltage transition. It grows with V_DS; the datasheet value is at its test voltage.' },
      { kind: 'number', key: 'qgth', symbol: 'Q_g(th)', label: 'Gate charge at V_th', unit: 'C', min: 0, max: 1e-5, help: 'Q_gs2 = Q_gs − Q_g(th) is the charge between V_th and the plateau, during which the current rises or falls. If it is not listed, Q_gs/2 is a common estimate.' },
      { kind: 'number', key: 'rgInt', symbol: 'R_G,int', label: 'Internal gate resistance', unit: 'Ω', min: 0, max: 50 },
      { kind: 'number', key: 'coss', symbol: 'C_oss,eff', label: 'Output capacitance', units: U_CAP_P, unitKey: 'cossUnit', min: 0, max: 1e-6, visible: isSwitch, help: 'Energy-equivalent C_oss: ½·C·V² is the energy dumped into the channel at hard turn-on. If the datasheet gives Q_oss, Q_oss/V_DS (charge-equivalent) is a slightly conservative stand-in; C_oss at the test voltage underestimates.' },
      { kind: 'number', key: 'cossOpp', symbol: 'C_opp', label: 'Rectifier capacitance', units: U_CAP_P, unitKey: 'cossUnit', min: 0, max: 1e-6, visible: isSwitch, help: 'Charge-equivalent capacitance of the opposite device (synchronous FET Q_oss/V, or a diode’s C_j). This switch charges it from the supply at every hard turn-on, dissipating ≈ ½·C_opp·V² in its channel on top of its own ½·C_oss·V². Presets assume the same FET as rectifier.' },
      { kind: 'number', key: 'vsd', symbol: 'V_SD', label: 'Body-diode forward drop', unit: 'V', min: 0.2, max: 3, visible: (s: any) => !isSwitch(s) },
    ],
  },
  {
    kind: 'section',
    title: 'Gate drive',
    fields: [
      { kind: 'number', key: 'vdrv', symbol: 'V_drv', label: 'Gate drive voltage', unit: 'V', min: 2, max: 20 },
      { kind: 'number', key: 'rSrc', symbol: 'R_src', label: 'Driver pull-up resistance', unit: 'Ω', min: 0, max: 100, help: 'Output resistance of the driver while sourcing (R_HI in SLUA618). Bipolar drivers are not resistive; use V/I at the plateau voltage.' },
      { kind: 'number', key: 'rSnk', symbol: 'R_snk', label: 'Driver pull-down resistance', unit: 'Ω', min: 0, max: 100 },
      { kind: 'number', key: 'rgExt', symbol: 'R_G,ext', label: 'External gate resistor', unit: 'Ω', min: 0, max: 1000 },
      { kind: 'number', key: 'qrr', symbol: 'Q_rr', label: 'Rectifier recovery charge', unit: 'C', min: 0, max: 1e-5, visible: isSwitch, help: 'Reverse-recovery charge of the opposite rectifier (the synchronous FET’s body diode or a PN diode), pulled through this switch at each turn-on. 0 for a Schottky or GaN rectifier. Datasheet Q_rr is at a stated di/dt; faster edges recover more charge.' },
      { kind: 'number', key: 'tdt', symbol: 't_dt', label: 'Dead time per edge', unit: 's', min: 0, max: 1e-6, visible: (s: any) => !isSwitch(s), help: 'Time the body diode conducts before and after each control-switch transition.' },
    ],
  },
  {
    kind: 'section',
    title: 'Thermal',
    fields: [
      {
        kind: 'select',
        key: 'path',
        label: 'Thermal path',
        options: [
          { value: 'ja', label: 'Board-mounted: R_θJA' },
          { value: 'jc', label: 'Case + interface + heatsink' },
        ],
        apply: (v: string, _s: any, r: any) => {
          if (v === 'jc' && r.solveFor === 'rthJA') r.solveFor = 'rthSA';
          if (v === 'ja' && r.solveFor === 'rthSA') r.solveFor = 'rthJA';
        },
      },
      { kind: 'number', key: 'ta', symbol: 'T_A', label: 'Ambient temperature', suffix: '°C', min: -55, max: 150 },
      { kind: 'number', key: 'rthJA', symbol: 'R_θJA', label: 'Junction–ambient', suffix: '°C/W', min: 1e-3, max: 1e6, solvable: true, visible: (s: any) => s.path === 'ja', help: 'For a board-mounted part this depends on the copper area: the datasheet value is for its test board (here 1 in² of 2 oz copper). Solve for it to get the thermal resistance the layout must achieve.' },
      { kind: 'number', key: 'rthJC', symbol: 'R_θJC', label: 'Junction–case', suffix: '°C/W', min: 0.01, max: 50, visible: (s: any) => s.path === 'jc' },
      { kind: 'number', key: 'rthCS', symbol: 'R_θCS', label: 'Case–sink (interface)', suffix: '°C/W', min: 0, max: 50, visible: (s: any) => s.path === 'jc', help: 'Thermal pad, grease or insulator, plus the PCB if the heatsink is on the other side.' },
      { kind: 'number', key: 'rthSA', symbol: 'R_θSA', label: 'Heatsink–ambient', suffix: '°C/W', min: 1e-3, max: 1e6, solvable: true, visible: (s: any) => s.path === 'jc', help: 'Solve for it to get the heatsink a design needs.' },
      {
        kind: 'number',
        key: 'tj',
        symbol: 'T_J',
        label: 'Junction temperature',
        suffix: '°C',
        min: -55,
        max: 1e4,
        solvable: true,
        solvedWhen: tjSolvedWhen,
        onSolve: (_s, root) => (root.solveFor = 'tj'),
        onUnsolve: (_s, root) => (root.solveFor = 'iL'),
        help: 'Computed from the losses. Click ◎ to make it a target (e.g. 125 °C) and solve for the largest current; pick the unknown with the other ◎ buttons.',
      },
    ],
  },
];

export const toInputs = (s: FetState): FetInputs => ({
  role: s.role,
  v: s.v,
  iL: s.iL,
  dIL: s.dIL,
  d: s.duty / 100,
  fsw: s.fsw,
  rds25: s.rds25,
  alpha: s.alphaPct / 100,
  vth: s.vth,
  gfs: s.gfs,
  qg: s.qg,
  qgs: s.qgs,
  qgd: s.qgd,
  qgth: s.qgth,
  rgInt: s.rgInt,
  coss: s.coss,
  cossOpp: s.cossOpp,
  vsd: s.vsd,
  vdrv: s.vdrv,
  rSrc: s.rSrc,
  rSnk: s.rSnk,
  rgExt: s.rgExt,
  tdt: s.tdt,
  qrr: s.qrr,
  ta: s.ta,
  rth: rthTotal(s),
});

export const rthTotal = (s: any) => (s.path === 'ja' ? s.rthJA : s.rthJC + s.rthCS + s.rthSA);

const LABEL: Record<FetSolve, string> = { tj: 'Junction temperature', iL: 'Maximum inductor current', fsw: 'Maximum switching frequency', rthJA: 'Required R_θJA', rthSA: 'Required heatsink R_θSA' };

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;
const degC = (t: number) => (Number.isFinite(t) ? `${t.toFixed(Math.abs(t) < 1000 ? 1 : 0)} °C` : '—');

export function compute(st: FetState): CalcReport {
  const num = ['v', 'iL', 'dIL', 'duty', 'fsw', 'vdsMax', 'rds25', 'vgsSpec', 'alphaPct', 'tjMax', 'vth', 'gfs', 'qg', 'qgs', 'qgd', 'qgth', 'rgInt', 'coss', 'cossOpp', 'vsd', 'vdrv', 'rSrc', 'rSnk', 'rgExt', 'tdt', 'qrr', 'ta', 'rthJA', 'rthJC', 'rthCS', 'rthSA', 'tj'] as const;
  for (const k of num) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!(st.v > 0)) throw new Error('Switched voltage must be > 0.');
  if (st.solveFor !== 'iL' && !(st.iL > 0)) throw new Error('Inductor current must be > 0.');
  if (!(st.duty > 0 && st.duty < 100)) throw new Error('Duty cycle must be between 0 and 100 %.');
  if (st.solveFor !== 'fsw' && !(st.fsw > 0)) throw new Error('Switching frequency must be > 0.');
  if (!(st.rds25 > 0) || !(st.gfs > 0) || !(st.vth > 0)) throw new Error('R_DS(on), g_fs and V_th must be > 0.');
  for (const k of ['dIL', 'qg', 'qgs', 'qgd', 'qgth', 'rgInt', 'coss', 'cossOpp', 'rSrc', 'rSnk', 'rgExt', 'tdt', 'qrr', 'alphaPct', 'rthCS'] as const) if (st[k] < 0) throw new Error(`${k} must be ≥ 0.`);
  if (st.path === 'ja' && st.solveFor !== 'rthJA' && !(st.rthJA > 0)) throw new Error('R_θJA must be > 0.');
  if (st.path === 'jc' && !(st.rthJC > 0)) throw new Error('R_θJC must be > 0.');
  if (st.path === 'jc' && st.solveFor !== 'rthSA' && !(st.rthSA > 0)) throw new Error('R_θSA must be > 0.');

  const s: FetState = { ...st };
  // keep the unknown visible and consistent with the thermal path (an API call may set either)
  if (s.path === 'ja' && s.solveFor === 'rthSA') s.solveFor = 'rthJA';
  if (s.path === 'jc' && s.solveFor === 'rthJA') s.solveFor = 'rthSA';
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'power/mosfet-power-dissipation', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const at = (patch: Partial<FetState>) => analyze(toInputs({ ...s, ...patch }));

  // The gate must hold the FET fully on at the peak current: V_pl(I_pk) < V_drv.
  // Harness "error-after-edit" (medium) on typed I_L = max or V_th ×10 is this error: a typed number that makes
  // the design impossible, which §5a says should be red. Setting switches cannot reach it (presets keep V_drv).
  const driveMsg = (i: number) => `V_drv = ${si(s.vdrv, 'V', 3)} cannot carry ${si(i, 'A', 3)}: the Miller plateau V_th + I_pk/g_fs = ${si(s.vth + i / s.gfs, 'V', 3)} is at or above the drive voltage, so the FET would stay in its linear region. Raise V_drv or use a FET with higher g_fs / lower V_th.`;
  // The synchronous rectifier switches at zero voltage (body diode first), so the limit applies to the control switch only.
  if (s.role === 'switch' && s.solveFor !== 'iL' && !(s.iL < iMaxDrive(toInputs(s)))) throw new Error(driveMsg(s.iL + s.dIL / 2));

  const target = s.tj;
  if (s.solveFor === 'iL' || s.solveFor === 'fsw') {
    if (!(target > s.ta)) return noSolution(report, s.solveFor, `The target T_J (${degC(target)}) must be above the ambient (${degC(s.ta)}).`);
    const key = s.solveFor;
    const hi = key === 'iL' ? (s.role === 'switch' ? Math.min(1000, iMaxDrive(toInputs(s)) * (1 - 1e-9)) : 1000) : 10e6;
    const lo = key === 'iL' ? 1e-3 : 1e3;
    if (!(hi > lo)) return noSolution(report, key, driveMsg(lo + s.dIL / 2));
    const g = (x: number) => {
      const r = at({ [key]: x });
      return r.runaway ? 1e12 : r.tj;
    };
    const gLo = g(lo);
    if (gLo > target) return noSolution(report, key, `Even at ${key === 'iL' ? si(lo, 'A', 3) : si(lo, 'Hz', 3)} the junction reaches ${degC(gLo)}, above the ${degC(target)} target${key === 'iL' ? ' (the frequency-dependent losses alone are too high)' : ' (conduction loss alone is too high)'}. Lower the thermal resistance or the ${key === 'iL' ? 'switching frequency' : 'current'}.`);
    const gHi = g(hi);
    if (gHi < target) {
      if (key === 'iL' && hi < 1000) return noSolution(report, key, `The gate drive limits the current before the junction reaches ${degC(target)}: above ${si(hi, 'A', 4)} mean current the Miller plateau at the peak exceeds V_drv = ${si(s.vdrv, 'V', 3)}.`);
      return noSolution(report, key, `T_J stays below ${degC(target)} up to ${key === 'iL' ? si(hi, 'A', 3) : si(hi, 'Hz', 3)} (the top of the search range): it reaches only ${degC(gHi)}.`);
    }
    const r = invert(g, target, { lo, hi, log: true, samples: 100 });
    if (!r.ok) return noSolution(report, key, `No ${key === 'iL' ? 'current' : 'frequency'} gives T_J = ${degC(target)}.`);
    // T_J(I) steps up where the valley current crosses zero (soft → hard turn-on adds C_oss and Q_rr loss):
    // a target inside that step has no exact answer.
    const root = r.roots.find((x) => Math.abs(g(x) - target) < 1e-6 * Math.max(1, Math.abs(target)));
    if (root == null) {
      const x = r.roots[0];
      return noSolution(report, key, `T_J jumps past ${degC(target)} at ${key === 'iL' ? `I_L = ΔI_L/2 = ${si(x, 'A', 3)}` : si(x, 'Hz', 3)}, where the valley current turns positive and the control switch starts hard turn-on (C_oss and recovery losses appear). Pick a target outside that step.`);
    }
    s[key] = root;
  }
  let rthSolved: number | null = null;
  if (s.solveFor === 'rthJA' || s.solveFor === 'rthSA') {
    if (!(target > s.ta)) return noSolution(report, s.solveFor, `The target T_J (${degC(target)}) must be above the ambient (${degC(s.ta)}).`);
    const p = lossAt(toInputs(s), target);
    const need = (target - s.ta) / p;
    if (!(need <= 1e6)) return noSolution(report, s.solveFor, `The loss at ${degC(target)} is only ${si(p, 'W', 3)}: any thermal resistance up to ${need.toPrecision(3)} °C/W keeps T_J below the target.`);
    if (s.solveFor === 'rthJA') {
      if (!(need >= 1e-3)) return noSolution(report, 'rthJA', `${si(p, 'W', 3)} at T_J = ${degC(target)} would need R_θ = ${need.toPrecision(3)} °C/W, which no thermal path achieves.`);
      rthSolved = need;
      s.rthJA = need;
    } else {
      const sa = need - s.rthJC - s.rthCS;
      if (!(sa >= 1e-3)) return noSolution(report, 'rthSA', `R_θJC + R_θCS = ${(s.rthJC + s.rthCS).toPrecision(3)} °C/W leaves no room within the ${need.toPrecision(3)} °C/W allowed for ${si(p, 'W', 3)} at T_J = ${degC(target)}: no heatsink is good enough. Reduce the losses, the interface resistance or the ambient.`);
      rthSolved = sa;
      s.rthSA = sa;
    }
  }

  const inp = toInputs(s);
  const o = analyze(inp);
  if (o.runaway) {
    return noSolution(
      report,
      s.solveFor,
      `Thermal runaway: R_θ·α·P_cond(25 °C) = ${(inp.rth * inp.alpha * o.cond25).toFixed(2)} ≥ 1, so each degree of heating raises the conduction loss by more than the thermal path can remove. Lower R_θ or the current, or use a FET with lower R_DS(on).`,
    );
  }
  if (o.tj > 1e4) return noSolution(report, s.solveFor, `T_J would exceed 10 000 °C (${si(o.loss.total, 'W', 3)} into ${inp.rth.toPrecision(3)} °C/W): the losses are far beyond what the package can dissipate.`);
  if (s.solveFor === 'tj') s.tj = o.tj;
  // the solved T_J is the target in the other modes; recompute exactly from the solved unknown
  const tj = o.tj;

  // ── checks
  const e = o.edges;
  if (tj > s.tjMax) warnings.push(`T_J = ${degC(tj)} exceeds the ${degC(s.tjMax)} rating. Lower the thermal resistance (copper area, heatsink), the current or f_sw, or pick a FET with lower losses.`);
  else if (tj > s.tjMax - 25) notes.push(`T_J is within 25 °C of the ${degC(s.tjMax)} rating; many designs derate to ≤ ${degC(s.tjMax - 25)} for lifetime and margin.`);
  if (s.v > 0.8 * s.vdsMax) warnings.push(`V_sw = ${si(s.v, 'V', 3)} is ${pct(s.v / s.vdsMax, 0)} of V_DSS = ${si(s.vdsMax, 'V', 3)}: switching overshoot and ringing come on top. Keep the steady voltage at or below about 80 % of the rating, or snub the ringing.`);
  if (s.vdrv < s.vgsSpec - 1e-9) warnings.push(`Gate drive ${si(s.vdrv, 'V', 3)} is below the ${si(s.vgsSpec, 'V', 3)} at which R_DS(on) is specified: the real on-resistance is higher than entered. Use the R_DS(on) for a V_GS at or below your drive.`);
  if (s.vdrv > 20) warnings.push('V_drv above 20 V exceeds the V_GS rating of most MOSFETs.');
  if (s.dIL > 2 * s.iL) notes.push(`ΔI_L > 2·I_L: the inductor current reverses each cycle (forced-PWM synchronous converter). ${s.role === 'switch' ? 'The control switch then turns on at zero voltage: no turn-on, C_oss or recovery loss.' : 'The rectifier body diode conducts only after the control switch turns off.'}`);
  else if (s.role === 'switch' && e.zvs) notes.push('The valley current is zero: the control switch turns on without current (boundary conduction), so turn-on, C_oss and recovery losses are dropped.');
  if (s.role === 'switch' && (s.rSrc + s.rgExt + s.rgInt === 0 || s.rSnk + s.rgExt + s.rgInt === 0)) warnings.push('A gate loop with zero resistance gives zero-time edges here, so the V·I switching loss shows as 0. Real edges are then set by the driver’s current limit and the common-source inductance, which this model omits: enter the driver output resistance and R_G,int.');
  if (s.qgth > s.qgs) warnings.push(`Q_g(th) (${si(s.qgth, 'C', 3)}) exceeds Q_gs (${si(s.qgs, 'C', 3)}): the current-transition charge Q_gs2 = Q_gs − Q_g(th) is taken as 0. Check the datasheet values (Q_g(th) is part of Q_gs).`);
  const tEdge = s.role === 'switch' ? e.tir + e.tvf + e.tvr + e.tif : 0;
  if (s.role === 'switch' && tEdge * s.fsw > 0.2) warnings.push(`The four switching intervals add up to ${pct(tEdge * s.fsw, 0)} of the period: the edges are too slow for this frequency and the linear-edge model loses accuracy. Use a stronger driver, a smaller R_G or a lower f_sw.`);
  if (s.role === 'switch' && o.loss.sw > 0 && o.loss.cond > 0 && o.loss.sw > 3 * o.loss.cond) notes.push('Switching losses dominate: a FET with lower Q_gd (smaller die) or a stronger gate drive trades conduction loss for switching loss.');
  if (s.role === 'switch' && o.loss.cond > 3 * (o.loss.sw + o.loss.coss + o.loss.rr) && o.loss.cond > 0.05) notes.push('Conduction loss dominates: a FET with lower R_DS(on) (larger die, more Q_g) would help.');
  if (s.role === 'sr' && s.tdt * s.fsw > 0.1) warnings.push(`Two dead times are ${pct(2 * s.tdt * s.fsw, 0)} of the period: the body diode carries the current for too long. Shorten the dead time.`);
  if (rthSolved != null && rthSolved < 1 && s.solveFor === 'rthJA') warnings.push(`R_θJA = ${rthSolved.toPrecision(3)} °C/W is not achievable for a board-mounted part (a few °C/W needs a heatsink). Switch the thermal path to case + heatsink, or reduce the losses.`);
  if (s.solveFor === 'rthSA' && rthSolved != null && rthSolved < 0.3) warnings.push(`R_θSA = ${rthSolved.toPrecision(3)} °C/W needs a large or fan-cooled heatsink.`);

  // ── results
  const item = (key: string, label: string, value: number | string, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const sv = s.solveFor;
  const rth = inp.rth;
  if (sv === 'iL') results.push(item('iL', 'Maximum inductor current', s.iL, 'A', si(s.iL, 'A', 4), { symbol: 'I_L,max', solved: true, primary: true, note: `for T_J = ${degC(tj)}` }));
  if (sv === 'fsw') results.push(item('fsw', 'Maximum switching frequency', s.fsw, 'Hz', si(s.fsw, 'Hz', 4), { symbol: 'f_sw,max', solved: true, primary: true, note: `for T_J = ${degC(tj)}` }));
  if (sv === 'rthJA') results.push(item('rthJA', 'Required R_θJA', s.rthJA, '°C/W', `${s.rthJA.toPrecision(4)} °C/W`, { symbol: 'R_θJA', solved: true, primary: true, note: `for T_J = ${degC(tj)}` }));
  if (sv === 'rthSA') results.push(item('rthSA', 'Required heatsink R_θSA', s.rthSA, '°C/W', `${s.rthSA.toPrecision(4)} °C/W`, { symbol: 'R_θSA', solved: true, primary: true, note: `with R_θJC + R_θCS = ${(s.rthJC + s.rthCS).toPrecision(3)} °C/W` }));
  const tjTone = tj > s.tjMax ? 'fail' : '';
  results.push(
    item('tj', 'Junction temperature', tj, '°C', degC(tj), { symbol: 'T_J', solved: sv === 'tj', primary: true, tone: tjTone, note: `ΔT = ${(tj - s.ta).toFixed(1)} °C over ${degC(s.ta)} ambient` }),
    item('pTotal', 'Total FET loss', o.loss.total, 'W', si(o.loss.total, 'W', 4), { symbol: 'P_D', primary: true, note: `R_θ = ${rth.toPrecision(3)} °C/W total` }),
    item('pCond', 'Conduction loss', o.loss.cond, 'W', si(o.loss.cond, 'W', 3), { symbol: 'P_cond', primary: true, note: `I_rms ${si(o.irms, 'A', 3)} · R_DS(on) ${si(o.rdsTj, 'Ω', 3)} at T_J` }),
  );
  if (s.role === 'switch') results.push(item('pSw', 'Switching loss', o.loss.sw, 'W', si(o.loss.sw, 'W', 3), { symbol: 'P_sw', primary: true, note: `E_on ${si(e.eOn, 'J', 3)} + E_off ${si(e.eOff, 'J', 3)} per cycle` }));
  else results.push(item('pBd', 'Body-diode (dead time)', o.loss.bd, 'W', si(o.loss.bd, 'W', 3), { symbol: 'P_bd', primary: true, note: `V_SD·t_dt·f·(I_pk + I_valley)` }));

  const g1 = 'Losses';
  results.push(item('pCondB', 'Conduction', o.loss.cond, 'W', si(o.loss.cond, 'W', 3), { group: g1, note: `${pct(o.loss.cond / o.loss.total)}` }));
  if (s.role === 'switch') {
    results.push(
      item('pOn', 'Turn-on (V·I overlap)', e.eOn * s.fsw, 'W', si(e.eOn * s.fsw, 'W', 3), { group: g1, note: e.zvs ? 'zero-current turn-on' : `at ${si(e.iOn, 'A', 3)}` }),
      item('pOff', 'Turn-off (V·I overlap)', e.eOff * s.fsw, 'W', si(e.eOff * s.fsw, 'W', 3), { group: g1, note: `at ${si(e.iOff, 'A', 3)}` }),
      item('pCoss', 'Output capacitances', o.loss.coss, 'W', si(o.loss.coss, 'W', 3), { group: g1, note: '½·(C_oss + C_opp)·V²·f' }),
      item('pRr', 'Rectifier recovery', o.loss.rr, 'W', si(o.loss.rr, 'W', 3), { group: g1, note: 'Q_rr·V·f' }),
    );
  }
  results.push(
    item('pGateFet', 'Gate (in R_G,int)', o.loss.gate, 'W', si(o.loss.gate, 'W', 3), { group: g1, note: 'share of Q_g·V_drv·f in the die' }),
    item('pLoss', 'Total in the FET', o.loss.total, 'W', si(o.loss.total, 'W', 4), { group: g1 }),
  );
  const g2 = 'Currents & edges';
  results.push(
    item('irms', 'RMS drain current', o.irms, 'A', si(o.irms, 'A', 4), { symbol: 'I_D,rms', group: g2, note: `conducts ${pct(o.dSw)} of the period` }),
    item('rdsTj', 'R_DS(on) at T_J', o.rdsTj, 'Ω', si(o.rdsTj, 'Ω', 4), { group: g2, note: `×${(o.rdsTj / s.rds25).toFixed(2)} of the 25 °C value` }),
    item('iPk', 'Peak current (turn-off)', e.iOff, 'A', si(e.iOff, 'A', 3), { symbol: 'I_pk', group: g2 }),
  );
  if (s.role === 'switch')
    results.push(
      item('vpl', 'Miller plateau on / off', e.vplOn, 'V', `${si(e.vplOn, 'V', 3)} / ${si(e.vplOff, 'V', 3)}`, { symbol: 'V_pl', group: g2, note: 'V_th + I/g_fs' }),
      item('tOn', 'Turn-on edge t_ri + t_vf', e.tir + e.tvf, 's', `${si(e.tir, 's', 3)} + ${si(e.tvf, 's', 3)}`, { group: g2, note: e.zvs ? 'no loss: zero current' : '' }),
      item('tOff', 'Turn-off edge t_vr + t_fi', e.tvr + e.tif, 's', `${si(e.tvr, 's', 3)} + ${si(e.tif, 's', 3)}`, { group: g2 }),
    );
  const g3 = 'Gate drive & thermal';
  results.push(
    item('pGate', 'Gate-drive power', o.pGateTotal, 'W', si(o.pGateTotal, 'W', 3), { symbol: 'P_G', group: g3, note: 'Q_g·V_drv·f, mostly in the driver and R_G,ext' }),
    item('rth', 'Total thermal resistance', rth, '°C/W', `${rth.toPrecision(4)} °C/W`, { group: g3, note: s.path === 'ja' ? 'R_θJA' : 'R_θJC + R_θCS + R_θSA' }),
  );
  if (s.path === 'jc') results.push(item('tc', 'Case temperature', tj - o.loss.total * s.rthJC, '°C', degC(tj - o.loss.total * s.rthJC), { symbol: 'T_C', group: g3 }), item('ts', 'Heatsink temperature', s.ta + o.loss.total * s.rthSA, '°C', degC(s.ta + o.loss.total * s.rthSA), { symbol: 'T_S', group: g3 }));
  results.push(item('tjMargin', 'Margin to T_J,max', s.tjMax - tj, '°C', `${(s.tjMax - tj).toFixed(1)} °C`, { group: g3, tone: tj > s.tjMax ? 'fail' : tj > s.tjMax - 25 ? 'warn' : '' }));

  report.results = results;
  report.tables = [lossTable(o, s.role)];
  report.summary = `${s.role === 'switch' ? 'Control switch' : 'Synchronous rectifier'} · ${si(s.v, 'V', 3)}, ${si(s.iL, 'A', 3)} at ${si(s.fsw, 'Hz', 3)}, D = ${s.duty.toFixed(1)} % · ${s.part === 'Custom' ? 'custom FET' : s.part.split(' · ')[0]}`;
  notes.push(
    'Steady state with ideal trapezoidal currents; switching edges are linear approximations (Balogh, TI SLUA618), so expect ±30 % on the switching terms — parasitic source and loop inductance can change them a lot.',
    'Only conduction loss follows the junction temperature (linear R_DS(on) tempco); the charges and V_th are taken at their 25 °C typical values.',
  );
  if (s.role === 'sr') notes.push('The rectifier’s own Q_rr is dissipated mostly in the control switch: enter it there as Q_rr.');
  report.details = { ...o, inputs: inp };
  report.graphs = graphs(s, o);
  report.status = tj > s.tjMax ? { text: 'OVER T_J,max', tone: 'fail' } : undefined;
  return report;
}

function noSolution(report: CalcReport, key: string, msg: string): CalcReport {
  report.warnings.push(msg);
  report.status = { text: 'NO SOLUTION', tone: 'fail' };
  report.results.push({ key, label: LABEL[key as FetSolve] ?? key, value: null, display: '—', primary: true, solved: true });
  return report;
}

function lossTable(o: FetResult, role: Role): TableSpec {
  const L = o.loss;
  const rows: [string, number, string][] =
    role === 'switch'
      ? [
          ['Conduction', L.cond, 'I_rms²·R_DS(on)(T_J)'],
          ['Switching (V·I overlap)', L.sw, '½·V·(I_on·t_on + I_off·t_off)·f'],
          ['C_oss + rectifier C', L.coss, '½·(C_oss + C_opp)·V²·f'],
          ['Rectifier recovery', L.rr, 'Q_rr·V·f'],
          ['Gate (R_G,int share)', L.gate, '½·Q_g·V_drv·f·Σ R_G,int/R_loop'],
          ['Total', L.total, ''],
        ]
      : [
          ['Conduction', L.cond, 'I_rms²·R_DS(on)(T_J)'],
          ['Body diode (dead time)', L.bd, 'V_SD·t_dt·f·(I_pk + I_valley)'],
          ['Gate (R_G,int share)', L.gate, '½·Q_g·V_drv·f·Σ R_G,int/R_loop'],
          ['Total', L.total, ''],
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
    rows: rows.map(([part, p, formula]) => ({ part, p, share: L.total > 0 ? (p / L.total) * 100 : 0, formula })),
    display: rows.map(([part, p, formula]) => ({ part, p: si(p, 'W', 3), share: L.total > 0 ? `${((p / L.total) * 100).toFixed(1)} %` : '—', formula })),
    note: `Losses dissipated in the die at T_J = ${o.tj.toFixed(1)} °C. Gate-drive power outside the die: ${si(o.pGateTotal - L.gate, 'W', 3)}.`,
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: FetState, o: FetResult): GraphSpec[] {
  const inp = toInputs(s);
  const sweep = (key: 'iL' | 'fsw', xs: number[]) => {
    const pts = xs.map((x) => ({ x, r: analyze({ ...inp, [key]: x }) })).filter((p) => !p.r.runaway && Number.isFinite(p.r.tj) && p.r.tj < 1e4);
    return pts;
  };
  const series = (pts: { x: number; r: FetResult }[], role: Role) => {
    const x = pts.map((p) => p.x);
    const out: GraphSeries[] = [
      { label: 'Total', x, y: pts.map((p) => p.r.loss.total), axis: 'p', width: 2.2, color: '#1f4e5f' },
      { label: 'Conduction', x, y: pts.map((p) => p.r.loss.cond), axis: 'p', width: 1.4, color: '#4f8a8b' },
    ];
    if (role === 'switch') out.push({ label: 'Switching + C_oss + Q_rr', x, y: pts.map((p) => p.r.loss.sw + p.r.loss.coss + p.r.loss.rr), axis: 'p', width: 1.4, color: '#c47b17' });
    else out.push({ label: 'Body diode', x, y: pts.map((p) => p.r.loss.bd), axis: 'p', width: 1.4, color: '#c47b17' });
    out.push({ label: 'T_J', x, y: pts.map((p) => p.r.tj), axis: 't', width: 1.6, color: '#6b5b95', dash: [6, 3] });
    return out;
  };
  const yAxes = [
    { id: 'p', label: 'Loss', unit: 'W', includeZero: true },
    { id: 't', label: 'Junction temperature', unit: '°C', side: 'right' as const },
  ];
  const tjLine = { value: s.tjMax, label: `T_J,max ${s.tjMax} °C`, axis: 't', color: '#8b1e1e', dash: [5, 4] };

  const iMaxD = s.role === 'switch' ? iMaxDrive(inp) : Infinity;
  const iHi = Math.min(Math.max(2 * s.iL, 1e-3 * 1.01), iMaxD * 0.999);
  const iPts = sweep('iL', Array.from({ length: 101 }, (_, k) => Math.max(1e-3, (iHi * k) / 100)));
  const vsI: GraphSpec = {
    id: 'loss-vs-current',
    title: 'Loss vs current',
    x: { label: 'Inductor current I_L', unit: 'A' },
    y: yAxes,
    series: series(iPts, s.role),
    hlines: [tjLine],
    vlines: [{ value: s.iL, label: `I_L = ${si(s.iL, 'A', 3)}` }],
    markers: [{ x: s.iL, y: o.tj, axis: 't', label: `${o.tj.toFixed(0)} °C` }],
  };
  const fPts = sweep('fsw', logspace(Math.max(1e3, s.fsw / 10), Math.min(10e6, s.fsw * 10), 100));
  const vsF: GraphSpec = {
    id: 'loss-vs-fsw',
    title: 'Loss vs frequency',
    x: { label: 'Switching frequency', unit: 'Hz', log: true },
    y: yAxes,
    series: series(fPts, s.role),
    hlines: [tjLine],
    vlines: [{ value: s.fsw, label: `f_sw = ${si(s.fsw, 'Hz', 3)}` }],
    markers: [{ x: s.fsw, y: o.tj, axis: 't', label: `${o.tj.toFixed(0)} °C` }],
  };
  return [vsI, vsF, edgeGraph(s, o)];
}

/** Idealised drain voltage and current through one turn-on and one turn-off (SLUA618 intervals 2 and 3). */
function edgeGraph(s: FetState, o: FetResult): GraphSpec {
  const e = o.edges;
  const V = s.v;
  if (s.role === 'sr') {
    // body-diode conduction around the control-switch edges: v_DS ≈ −V_SD for t_dt, channel otherwise
    const td = s.tdt;
    const pad = Math.max(td, 5e-9);
    const vOn = -e.iOff * o.rdsTj;
    const t = [0, pad, pad, pad + td, pad + td, 2 * pad + td];
    const v = [0, 0, -s.vsd, -s.vsd, vOn, vOn];
    return {
      id: 'edges',
      title: 'Dead-time edge',
      subtitle: 'Rectifier after the control switch turns off: body diode for t_dt, then the channel',
      x: { label: 'Time', unit: 's' },
      y: [{ id: 'v', label: 'v_DS', unit: 'V', includeZero: true }],
      series: [{ label: 'v_DS', x: t, y: v, axis: 'v', width: 2 }],
      legend: 'below',
    };
  }
  const ton = e.tir + e.tvf;
  const toff = e.tvr + e.tif;
  const gap = Math.max(ton, toff, 1e-9);
  const t0 = gap * 0.5;
  const t1 = t0 + ton + gap; // turn-off starts here
  const tEnd = t1 + toff + gap * 0.5;
  const iOn = e.iOn;
  const tI = [0, t0, t0 + e.tir, t1, t1 + e.tvr, t1 + toff, tEnd];
  const iD = [0, 0, iOn, s.iL + s.dIL / 2, e.iOff, 0, 0];
  const tV = [0, t0, t0 + e.tir, t0 + ton, t1, t1 + e.tvr, tEnd];
  const vD = [V, V, V, 0, 0, V, V];
  return {
    id: 'edges',
    title: 'Switching edges',
    subtitle: `Turn-on at ${si(iOn, 'A', 3)}, turn-off at ${si(e.iOff, 'A', 3)}; the conduction time between them is shortened`,
    x: { label: 'Time', unit: 's' },
    y: [
      { id: 'v', label: 'v_DS', unit: 'V', includeZero: true },
      { id: 'i', label: 'i_D', unit: 'A', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'v_DS', x: tV, y: vD, axis: 'v', width: 2, color: '#1f4e5f' },
      { label: 'i_D', x: tI, y: iD, axis: 'i', width: 2, color: '#c47b17' },
    ],
    legend: 'below',
  };
}

export const def: CalcDef<FetState> = {
  id: 'power/mosfet-power-dissipation',
  version: '0.1.0',
  method:
    'Hard-switched converter MOSFET: conduction loss I_rms²·R_DS(on)(T_J) on the trapezoidal inductor current (Erickson & Maksimović), clamped-inductive switching edges from the gate charges and driver resistances with the Miller plateau V_th + I/g_fs (Balogh, TI SLUA618A eq. 8–14), ½·C_oss·V²·f, Q_rr·V·f, body-diode dead-time and R_G,int gate-drive shares; T_J from T_A + R_θ·P with a linear R_DS(on) tempco solved in closed form (runaway detected). Max current and max f_sw by Brent root finding on the same model; the required R_θ in closed form.',
  fields,
  defaults,
  solve: {
    default: 'tj',
    analysis: 'tj',
    options: [
      { key: 'tj', label: 'Junction temperature and losses (analysis)' },
      { key: 'iL', label: 'Maximum current for a target T_J' },
      { key: 'fsw', label: 'Maximum switching frequency for a target T_J' },
      { key: 'rthJA', label: 'Required R_θJA for a target T_J (board-mounted)' },
      { key: 'rthSA', label: 'Required heatsink R_θSA for a target T_J' },
    ],
  },
  compute,
  sync: (s) => {
    const p = PARTS[s.part];
    if (p && PART_FIELDS.some((k) => Math.abs((p[k] as number) - (s as any)[k]) > 1e-12 * Math.max(1, Math.abs(p[k] as number)))) s.part = 'Custom';
    // a solve option that belongs to the other thermal path moves to this path's thermal resistance
    if (s.path === 'ja' && s.solveFor === 'rthSA') s.solveFor = 'rthJA';
    if (s.path === 'jc' && s.solveFor === 'rthJA') s.solveFor = 'rthSA';
  },
  examples: [
    { id: 'default', label: '12 V → 3.3 V buck, 10 A at 500 kHz: CSD17578Q5A high side, 5 V drive', state: defaults() },
    {
      id: 'sync-rect',
      label: 'Same buck, low-side synchronous rectifier (72 % conduction, 20 ns dead time)',
      state: { ...defaults(), role: 'sr', part: 'CSD17578Q5A · 30 V · V_GS 4.5 V', ...partState('CSD17578Q5A · 30 V · V_GS 4.5 V'), tdt: 20e-9 },
    },
    {
      id: 'imax-48v',
      label: '48 V → 12 V Schottky buck, 250 kHz, CSD19534Q5A, 10 V drive: max current for T_J = 125 °C',
      state: { ...defaults(), solveFor: 'iL', role: 'switch', v: 48, iL: 5, dIL: 2, duty: 25, fsw: 250e3, fswUnit: 'kHz', part: 'CSD19534Q5A · 100 V · V_GS 10 V', ...partState('CSD19534Q5A · 100 V · V_GS 10 V'), vdrv: 10, rSrc: 2, rSnk: 1, rgExt: 2.2, rect: 'diode', qrr: 0, path: 'ja', ta: 50, rthJA: 40, tj: 125 },
    },
    {
      id: 'heatsink-boost',
      label: '24 V → 36 V Schottky boost, 20 A in, CSD18540Q5B on a heatsink: R_θSA for T_J = 110 °C',
      state: { ...defaults(), solveFor: 'rthSA', role: 'switch', v: 36.5, iL: 20, dIL: 6, duty: 34, fsw: 150e3, fswUnit: 'kHz', part: 'CSD18540Q5B · 60 V · V_GS 10 V', ...partState('CSD18540Q5B · 60 V · V_GS 10 V'), vdrv: 10, rSrc: 1.5, rSnk: 0.8, rgExt: 2, topo: 'boost', rect: 'diode', qrr: 0, path: 'jc', ta: 60, rthCS: 1.0, tj: 110 },
    },
    {
      id: 'fmax',
      label: '12 V buck, CSD17578Q5A at 10 V drive: highest f_sw for T_J = 110 °C',
      state: { ...defaults(), solveFor: 'fsw', part: 'CSD17578Q5A · 30 V · V_GS 10 V', ...partState('CSD17578Q5A · 30 V · V_GS 10 V'), vdrv: 10, rSrc: 2, rSnk: 1, rgExt: 0, tj: 110 },
    },
    {
      id: 'too-hot',
      label: 'Weak 2 Ω drive with 10 Ω R_G at 1 MHz: over T_J,max',
      state: { ...defaults(), fsw: 1e6, fswUnit: 'MHz', rSrc: 2, rSnk: 2, rgExt: 10, ta: 70 },
    },
  ],
};
