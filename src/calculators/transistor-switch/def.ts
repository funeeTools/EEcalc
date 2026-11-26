/** Low-side transistor switch — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM } from '@/core/unitsets';
import { bracketE } from '@/core/eseries';
import { BJT_SWITCH, FET_SWITCH, baseResistor, bjtLoadCurrent, fetLoadCurrent, forcedBeta, hfeFor, plateau, pointFor, rdsonAt, tOff, tOn } from './model';

export const ID = 'general/transistor-switch';

export interface SwitchState {
  solveFor: 'rb' | 'betaF' | 'rg' | 'tsw';
  device: 'bjt' | 'mosfet';
  load: 'resistive' | 'relay' | 'led';
  vcc: number;
  rl: number;
  rlUnit: string;
  vf: number;
  vdrv: number;
  bjtPart: string;
  rb: number;
  rbUnit: string;
  betaF: number;
  vceSat: number;
  vbeSat: number;
  hfeMin: number;
  icMax: number;
  icMaxUnit: string;
  vceo: number;
  ptotB: number;
  fetPart: string;
  rg: number;
  rgUnit: string;
  rdrv: number;
  rdrvUnit: string;
  tsw: number;
  tswUnit: string;
  rdson: number;
  rdsonUnit: string;
  vth: number;
  vthMin: number;
  gfs: number;
  qg: number;
  qgd: number;
  rgInt: number;
  rgIntUnit: string;
  vdsMax: number;
  vgsMax: number;
  idMax: number;
  idMaxUnit: string;
  ptotF: number;
  fsw: number | null;
  fswUnit: string;
  eseries: string;
}

const U_I: Record<string, number> = { mA: 1e-3, A: 1, 'µA': 1e-6 };
const U_T: Record<string, number> = { ns: 1e-9, 'µs': 1e-6, ms: 1e-3 };
const U_F: Record<string, number> = { kHz: 1e3, Hz: 1, MHz: 1e6 };
const BJT_DEFAULT = '2N2222A (600 mA)';
const FET_DEFAULT = 'AO3400A (30 V, SOT-23)';

export const defaults = (): SwitchState => ({
  solveFor: 'rb',
  device: 'bjt',
  load: 'relay',
  vcc: 5,
  rl: 70,
  rlUnit: 'Ω',
  vf: 2,
  vdrv: 3.3,
  bjtPart: BJT_DEFAULT,
  rb: 300,
  rbUnit: 'Ω',
  betaF: 10,
  vceSat: 0.3,
  vbeSat: 1.2,
  hfeMin: 50,
  icMax: 0.6,
  icMaxUnit: 'mA',
  vceo: 40,
  ptotB: 0.625,
  fetPart: FET_DEFAULT,
  rg: 100,
  rgUnit: 'Ω',
  rdrv: 50,
  rdrvUnit: 'Ω',
  tsw: 200e-9,
  tswUnit: 'ns',
  rdson: 0.048,
  rdsonUnit: 'mΩ',
  vth: 1.45,
  vthMin: 0.65,
  gfs: 33,
  qg: 6e-9,
  qgd: 1.8e-9,
  rgInt: 3,
  rgIntUnit: 'Ω',
  vdsMax: 30,
  vgsMax: 12,
  idMax: 5.7,
  idMaxUnit: 'A',
  ptotF: 1.4,
  fsw: null,
  fswUnit: 'kHz',
  eseries: 'E24',
});

const isBjt = (_s: unknown, r: Record<string, any>) => r.device === 'bjt';
const isFet = (_s: unknown, r: Record<string, any>) => r.device === 'mosfet';
const bjtCustom = (_s: unknown, r: Record<string, any>) => r.device === 'bjt' && r.bjtPart === 'Custom';
const fetCustom = (_s: unknown, r: Record<string, any>) => r.device === 'mosfet' && r.fetPart === 'Custom';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Load',
    note: 'Low-side switch: V_CC → load → transistor → ground.',
    fields: [
      { kind: 'select', key: 'load', label: 'Load', options: [{ value: 'relay', label: 'Relay / solenoid coil' }, { value: 'resistive', label: 'Resistive (heater, lamp)' }, { value: 'led', label: 'LED + series resistor' }], help: 'An inductive load (relay, solenoid, motor) needs a flyback diode across it; the drawing adds one.' },
      { kind: 'number', key: 'vcc', symbol: 'V_CC', label: 'Load supply', unit: 'V', min: 0.1, max: 1000 },
      { kind: 'number', key: 'rl', symbol: 'R_L', label: 'Load resistance', units: U_OHM, unitKey: 'rlUnit', min: 1e-3, max: 1e8, help: 'Relay: the coil resistance from its datasheet (coil voltage² / coil power). LED: the series resistor.' },
      { kind: 'number', key: 'vf', symbol: 'V_F', label: 'LED forward voltage', unit: 'V', min: 0, max: 100, visible: (_s, r) => r.load === 'led', help: 'Total forward voltage of the LED string.' },
    ],
  },
  {
    kind: 'section',
    title: 'Switch and drive',
    fields: [
      { kind: 'select', key: 'device', label: 'Transistor', options: [{ value: 'bjt', label: 'NPN BJT' }, { value: 'mosfet', label: 'N-channel MOSFET' }], apply: (v, _s, r) => { const design = r.solveFor === 'rb' || r.solveFor === 'rg'; r.solveFor = v === 'bjt' ? (design ? 'rb' : 'betaF') : design ? 'rg' : 'tsw'; }, help: 'Switching device type. The unknown moves to the matching option of the other device (resistor design ↔ resistor design, analysis ↔ analysis), so switching back returns the same page.' },
      { kind: 'number', key: 'vdrv', symbol: 'V_drive', label: 'Drive high level', unit: 'V', min: 0.1, max: 100, help: 'Logic-high voltage of the driving pin (3.3 V, 5 V…), or the gate-driver supply.' },
      { kind: 'select', key: 'bjtPart', label: 'BJT preset', options: Object.keys(BJT_SWITCH), visible: isBjt, help: 'onsemi datasheets. The page reads V_CE(sat) and V_BE(sat) (maximum, at I_C/I_B = 10) from the test point at or above the load current, and the minimum h_FE around it.' },
      { kind: 'number', key: 'rb', symbol: 'R_B', label: 'Base resistor', units: U_OHM, unitKey: 'rbUnit', solvable: true, min: 1, max: 1e9, visible: isBjt, onUnsolve: (_s, r) => (r.solveFor = 'betaF') },
      { kind: 'number', key: 'betaF', symbol: 'β_F', label: 'Forced gain I_C/I_B', solvable: true, min: 0.1, max: 1e5, visible: isBjt, onUnsolve: (_s, r) => (r.solveFor = 'rb'), help: 'Design for hard saturation: 10 (datasheet V_CE(sat) condition), or up to h_FE,min / 2 when the base current is precious.' },
      { kind: 'number', key: 'vceSat', symbol: 'V_CE(sat)', label: 'Saturation voltage', unit: 'V', min: 0.01, max: 10, visible: bjtCustom },
      { kind: 'number', key: 'vbeSat', symbol: 'V_BE(sat)', label: 'Base voltage (sat)', unit: 'V', min: 0.3, max: 5, visible: bjtCustom },
      { kind: 'number', key: 'hfeMin', symbol: 'h_FE,min', label: 'Minimum current gain', min: 1, max: 1e5, visible: bjtCustom, help: 'Datasheet minimum at about the load current.' },
      { kind: 'number', key: 'icMax', symbol: 'I_C,max', label: 'Collector current rating', units: U_I, unitKey: 'icMaxUnit', min: 1e-6, max: 1e4, visible: bjtCustom },
      { kind: 'number', key: 'vceo', symbol: 'V_CEO', label: 'C–E breakdown', unit: 'V', min: 1, max: 1e4, visible: bjtCustom },
      { kind: 'number', key: 'ptotB', symbol: 'P_tot', label: 'Power rating (25 °C)', unit: 'W', min: 1e-3, max: 1e4, visible: bjtCustom },
      { kind: 'select', key: 'fetPart', label: 'MOSFET preset', options: Object.keys(FET_SWITCH), visible: isFet, help: 'Logic-level parts. The page uses the maximum R_DS(on) specified at the highest V_GS not above your drive voltage; V_th is the datasheet maximum.' },
      { kind: 'number', key: 'rg', symbol: 'R_G', label: 'Gate resistor', units: U_OHM, unitKey: 'rgUnit', solvable: true, min: 0, max: 1e6, visible: isFet, onUnsolve: (_s, r) => (r.solveFor = 'tsw'), help: 'Series gate resistor. It sets the switching speed (and EMI) and damps ringing of the gate loop.' },
      { kind: 'number', key: 'tsw', symbol: 't_sw', label: 'Slower edge time', units: U_T, unitKey: 'tswUnit', solvable: true, min: 1e-12, max: 1, visible: isFet, onUnsolve: (_s, r) => (r.solveFor = 'rg'), help: 'Drain-voltage transition of the slower edge (turn-on or turn-off), from the gate charge Q_gd. Solve R_G (◎ on R_G) for a target.' },
      { kind: 'number', key: 'rdrv', symbol: 'R_drv', label: 'Driver output resistance', units: U_OHM, unitKey: 'rdrvUnit', min: 0, max: 1e6, visible: isFet, help: 'Output resistance of the driving pin, from its V_OH spec: e.g. V_OH ≥ V_DD − 0.4 V at 8 mA is ≤ 50 Ω. A gate-driver IC is 1–5 Ω.' },
      { kind: 'number', key: 'rdson', symbol: 'R_DS(on)', label: 'On-resistance at V_drive', units: U_OHM, unitKey: 'rdsonUnit', min: 1e-5, max: 1e4, visible: fetCustom, help: 'Datasheet maximum R_DS(on) at a V_GS no higher than your drive voltage.' },
      { kind: 'number', key: 'vth', symbol: 'V_th,max', label: 'Threshold (max)', unit: 'V', min: 0.1, max: 20, visible: fetCustom, help: 'Datasheet maximum: sets the turn-on plateau (slowest turn-on).' },
      { kind: 'number', key: 'vthMin', symbol: 'V_th,min', label: 'Threshold (min)', unit: 'V', min: 0.05, max: 20, visible: fetCustom, help: 'Datasheet minimum: sets the turn-off plateau (slowest turn-off).' },
      { kind: 'number', key: 'gfs', symbol: 'g_fs', label: 'Transconductance', unit: 'S', min: 1e-4, max: 1e4, visible: fetCustom },
      { kind: 'number', key: 'qg', symbol: 'Q_g', label: 'Total gate charge', unit: 'C', min: 1e-12, max: 1e-5, visible: fetCustom },
      { kind: 'number', key: 'qgd', symbol: 'Q_gd', label: 'Gate–drain charge', unit: 'C', min: 1e-13, max: 1e-5, visible: fetCustom, help: 'The Miller charge: the plateau length on the datasheet gate-charge curve.' },
      { kind: 'number', key: 'rgInt', symbol: 'R_G,int', label: 'Internal gate resistance', units: U_OHM, unitKey: 'rgIntUnit', min: 0, max: 1e4, visible: fetCustom },
      { kind: 'number', key: 'vdsMax', symbol: 'V_DS,max', label: 'Drain–source rating', unit: 'V', min: 0.1, max: 1e4, visible: fetCustom },
      { kind: 'number', key: 'vgsMax', symbol: 'V_GS,max', label: 'Gate–source rating', unit: 'V', min: 0.1, max: 100, visible: fetCustom },
      { kind: 'number', key: 'idMax', symbol: 'I_D,max', label: 'Drain current rating', units: U_I, unitKey: 'idMaxUnit', min: 1e-6, max: 1e4, visible: fetCustom },
      { kind: 'number', key: 'ptotF', symbol: 'P_tot', label: 'Power rating', unit: 'W', min: 1e-3, max: 1e4, visible: fetCustom, help: 'Dissipation the part can take on your board or heatsink (SOT-23 ratings assume a copper pad).' },
    ],
  },
  {
    kind: 'section',
    title: 'Options',
    fields: [
      { kind: 'number', key: 'fsw', symbol: 'f_PWM', label: 'PWM frequency', units: U_F, unitKey: 'fswUnit', optional: true, zeroHint: 'on/off only', min: 1e-3, max: 1e8, help: 'Leave blank for a switch that stays on or off. With PWM the page adds switching loss (MOSFET) and gate-drive power; conduction loss is taken at 100 % duty.' },
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E48', 'E96'], help: 'IEC 60063 series for the base or gate resistor.' },
    ],
  },
];

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fI = (i: number, d = 3) => si(i, 'A', d);
const fV = (v: number, d = 4) => si(v, 'V', d);
const fP = (p: number) => si(p, 'W', 3);
const fT = (t: number) => si(t, 's', 3);

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export interface BjtParams { vceSat: number; vbeSat: number; hfeMin: number; hfeAt: number | null; specBf: number | null; beyond: boolean; icMax: number; vceo: number; ptot: number }
export interface FetParams { rds: number; rdsVgs: number | null; unspecified: boolean; vth: number; vthLo: number; gfs: number; qg: number; qgd: number; rgInt: number; vdsMax: number; vgsMax: number; idMax: number; ptot: number }

export function bjtParams(s: SwitchState, il0: number): BjtParams {
  const p = BJT_SWITCH[s.bjtPart];
  if (!p) return { vceSat: s.vceSat, vbeSat: s.vbeSat, hfeMin: s.hfeMin, hfeAt: null, specBf: null, beyond: false, icMax: s.icMax, vceo: s.vceo, ptot: s.ptotB };
  const sat = pointFor(p.sat, il0);
  const h = hfeFor(p.hfe, il0);
  return { vceSat: sat.p.vceSat, vbeSat: sat.p.vbeSat, hfeMin: h.hfe, hfeAt: h.at, specBf: p.bf, beyond: sat.beyond || h.beyond, icMax: p.icMax, vceo: p.vceo, ptot: p.ptot };
}

export function fetParams(s: SwitchState): FetParams {
  const p = FET_SWITCH[s.fetPart];
  if (!p) return { rds: s.rdson, rdsVgs: null, unspecified: false, vth: s.vth, vthLo: Math.min(s.vthMin, s.vth), gfs: s.gfs, qg: s.qg, qgd: s.qgd, rgInt: s.rgInt, vdsMax: s.vdsMax, vgsMax: s.vgsMax, idMax: s.idMax, ptot: s.ptotF };
  const r = rdsonAt(p.rdson, s.vdrv);
  return { rds: r.r, rdsVgs: r.vgs, unspecified: r.unspecified, vth: p.vthMax, vthLo: p.vthMin, gfs: p.gfs, qg: p.qg, qgd: p.qgd, rgInt: p.rgInt, vdsMax: p.vdsMax, vgsMax: p.vgsMax, idMax: p.idMax, ptot: p.ptot };
}

export function compute(st: SwitchState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

type Item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra?: Partial<ResultItem>) => ResultItem;
const item: Item = (key, label, value, unit, display, extra = {}) => ({ key, label, value, unit, display, ...extra });

function run(st: SwitchState): CalcReport {
  const s: SwitchState = { ...st };
  const vcc = finite('Load supply', s.vcc);
  const rl = finite('Load resistance', s.rl);
  const vdrv = finite('Drive voltage', s.vdrv);
  const vf = s.load === 'led' ? finite('LED forward voltage', s.vf) : 0;
  if (!(vcc > 0) || !(rl > 0) || !(vdrv > 0) || !(vf >= 0)) throw new Error('Supply, load resistance and drive voltage must be > 0.');
  if (!['relay', 'resistive', 'led'].includes(s.load)) throw new Error(`Unknown load "${String(s.load)}".`);
  const fsw = s.fsw == null ? null : finite('PWM frequency', s.fsw);
  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });
  if (s.load === 'led' && !(vcc > vf)) return fail(`The supply ${fV(vcc, 3)} does not exceed the LED forward voltage ${fV(vf, 3)}: the LED cannot light. Raise V_CC or use fewer LEDs in series.`);
  if (s.device === 'bjt') {
    if (s.solveFor !== 'rb' && s.solveFor !== 'betaF') throw new Error('With a BJT, solve for R_B or β_F.');
    return runBjt(s, report, fail, vcc, rl, vdrv, vf);
  }
  if (s.device === 'mosfet') {
    if (s.solveFor !== 'rg' && s.solveFor !== 'tsw') throw new Error('With a MOSFET, solve for R_G or the switching time.');
    return runFet(s, report, fail, vcc, rl, vdrv, vf, fsw);
  }
  throw new Error(`Unknown device "${String(s.device)}".`);
}

function loadNotes(s: SwitchState, report: CalcReport, vOff: number): void {
  if (s.load === 'relay') {
    report.notes.push(`Inductive load: a flyback diode (e.g. 1N4148 for small relays, 1N4001 for larger coils) across the coil, cathode to V_CC, clamps the switch at about V_CC + 0.7 V = ${fV(vOff, 3)} at turn-off. Without it the coil voltage spikes to hundreds of volts and breaks down the transistor.`);
    report.notes.push('The diode slows the relay’s release (the coil current decays slowly through it). For a fast release, add a zener in series with the diode; the switch then sees V_CC + V_Z.');
  }
  if (s.load === 'led') report.notes.push('LED load: the series resistor sets the current; the switch’s saturation voltage or I·R_DS(on) is subtracted from the resistor’s headroom.');
}

function runBjt(s: SwitchState, report: CalcReport, fail: (m: string) => CalcReport, vcc: number, rl: number, vdrv: number, vf: number): CalcReport {
  const il0 = (vcc - vf) / rl;
  const p = bjtParams(s, il0);
  for (const [n, v] of [['V_CE(sat)', p.vceSat], ['V_BE(sat)', p.vbeSat], ['h_FE,min', p.hfeMin]] as const) if (!(finite(n, v) > 0)) throw new Error(`${n} must be > 0.`);
  const il = bjtLoadCurrent(vcc, vf, p.vceSat, rl);
  if (!(il > 0)) return fail(`The supply ${fV(vcc, 3)} does not exceed ${s.load === 'led' ? 'V_F + ' : ''}V_CE(sat) = ${fV(vf + p.vceSat, 3)}: no load current.`);
  if (!(vdrv > p.vbeSat)) return fail(`The drive ${fV(vdrv, 3)} is not above V_BE(sat) = ${fV(p.vbeSat, 3)}: it cannot push base current through a resistor. Use a MOSFET or a higher drive voltage.`);
  let rbExact: number;
  let rUse: number;
  if (s.solveFor === 'rb') {
    const bf = finite('Forced gain', s.betaF);
    if (!(bf > 0)) throw new Error('Forced gain must be > 0.');
    rbExact = baseResistor(vdrv, p.vbeSat, il, bf);
    if (!(rbExact >= 1 && rbExact <= 1e9)) return fail(`R_B would be ${fR(rbExact, 3)}, outside 1 Ω … 1 GΩ. Check the drive voltage and forced gain.`);
    s.rb = rbExact;
    rUse = bracketE(s.eseries, rbExact)[0];
  } else {
    rbExact = rUse = finite('Base resistor', s.rb);
    if (!(rUse > 0)) throw new Error('Base resistor must be > 0.');
    const bf = forcedBeta(vdrv, p.vbeSat, il, rUse);
    if (!(bf >= 0.1 && bf <= 1e5)) return fail(`The forced gain would be ${bf.toPrecision(3)}, outside 0.1 … 100 000. Check R_B.`);
    s.betaF = bf;
  }
  const ib = (vdrv - p.vbeSat) / rUse;
  const bf = il / ib;
  const od = p.hfeMin / bf;
  const sat = od >= 1;
  // Worst case for a minimum-gain part that does not saturate: I_C = h_FE,min·I_B, V_CE from the load line.
  const icWorst = sat ? il : p.hfeMin * ib;
  const vceWorst = sat ? p.vceSat : vcc - vf - icWorst * rl;
  const pq = vceWorst * icWorst + p.vbeSat * ib;
  const vOff = s.load === 'relay' ? vcc + 0.7 : vcc;
  const [below, above] = bracketE(s.eseries, rbExact);
  const odTone = od < 1 ? 'fail' : od < 2 ? 'warn' : 'pass';
  const results: ResultItem[] = [];
  if (s.solveFor === 'rb') {
    results.push(
      item('rb', 'Base resistor', rbExact, 'Ω', fR(rbExact), { symbol: 'R_B', solved: true, primary: true, note: `β_F = ${s.betaF} exactly` }),
      item('rbStd', `${s.eseries} base resistor`, rUse, 'Ω', fR(rUse, 3), { symbol: 'R_B', primary: true, note: `next value down · β_F = ${bf.toFixed(1)}` }),
    );
  } else {
    results.push(item('betaF', 'Forced gain I_C/I_B', bf, '', bf.toFixed(2), { symbol: 'β_F', solved: true, primary: true }));
  }
  results.push(
    item('il', 'Load current', il, 'A', fI(il, 4), { symbol: 'I_L', primary: true, tone: il > p.icMax ? 'fail' : '', note: `V_CE(sat) ${fV(p.vceSat, 3)}` }),
    item('overdrive', 'Overdrive h_FE,min / β_F', od, '', `${od.toFixed(2)} ×`, { primary: true, tone: odTone, note: sat ? (od >= 2 ? 'saturates with margin' : 'saturates, little margin') : 'NOT saturated for a min-gain part' }),
    item('pq', 'Transistor dissipation', pq, 'W', fP(pq), { symbol: 'P_Q', primary: true, tone: pq > p.ptot ? 'fail' : pq > 0.5 * p.ptot ? 'warn' : '' }),
    item('ib', 'Base current', ib, 'A', fI(ib), { symbol: 'I_B', group: 'Drive', note: 'from the driving pin' }),
    item('vbeSatUsed', 'V_BE(sat) used', p.vbeSat, 'V', fV(p.vbeSat, 3), { symbol: 'V_BE(sat)', group: 'Drive', note: p.specBf ? `datasheet max at I_C/I_B = ${p.specBf}` : 'entered' }),
    item('hfeUsed', 'h_FE,min used', p.hfeMin, '', String(p.hfeMin), { symbol: 'h_FE,min', group: 'Drive', note: p.hfeAt != null ? `datasheet at ${fI(p.hfeAt)}` : 'entered' }),
    item('pDrive', 'Drive power', vdrv * ib, 'W', fP(vdrv * ib), { group: 'Drive' }),
    item('vceSatUsed', 'V_CE(sat) used', p.vceSat, 'V', fV(p.vceSat, 3), { symbol: 'V_CE(sat)', group: 'Load', note: p.specBf ? 'datasheet max' : 'entered' }),
    item('pLoad', 'Load power', (vcc - p.vceSat) * il, 'W', fP((vcc - p.vceSat) * il), { group: 'Load', note: s.load === 'led' ? 'LED + resistor' : undefined }),
    item('vOff', 'Off-state switch voltage', vOff, 'V', fV(vOff, 3), { symbol: 'V_CE,off', group: 'Load', tone: vOff > p.vceo ? 'fail' : '', note: s.load === 'relay' ? 'clamped by the flyback diode' : undefined }),
  );
  if (!sat) results.push(item('icWorst', 'I_C for a min-gain part', icWorst, 'A', fI(icWorst), { group: 'Load', tone: 'fail', note: `V_CE = ${fV(vceWorst, 3)}` }));
  if (s.solveFor === 'rb') results.push(item('rbAbove', `${s.eseries} value above`, above, 'Ω', `${fR(above, 3)} → β_F ${forcedBeta(vdrv, p.vbeSat, il, above).toFixed(1)}`, { group: 'Standard values' }), item('rbBelow', `${s.eseries} value used`, below, 'Ω', fR(below, 3), { group: 'Standard values' }));
  report.results = results;

  const w = report.warnings;
  if (!sat) w.push(`Base drive too weak: a minimum-gain part (h_FE = ${p.hfeMin}) would need I_B ≥ ${fI(il / p.hfeMin)} but gets ${fI(ib)}. It would sit in the active region at ${fI(icWorst)}, V_CE = ${fV(vceWorst, 3)}, dissipating ${fP(pq)}. Lower R_B.`);
  else if (od < 2) w.push(`Only ${od.toFixed(1)}× overdrive over the minimum h_FE: h_FE also falls in the cold and at high current. Aim for β_F ≤ h_FE,min/2, or 10 for a datasheet-grade V_CE(sat).`);
  if (p.specBf != null && bf > p.specBf * 1.05) w.push(`β_F = ${bf.toFixed(1)} is above the datasheet’s I_C/I_B = ${p.specBf} test condition, so the real V_CE(sat) is higher than the ${fV(p.vceSat, 3)} used.`);
  if (p.beyond) w.push(`The load current ${fI(il)} is above the datasheet’s highest saturation test point: V_CE(sat) and h_FE are extrapolated. Use a larger transistor.`);
  if (ib > 20e-3) w.push(`The driving pin must source ${fI(ib)}. Most MCU pins are rated for 4–20 mA: use a MOSFET, a Darlington, or a buffer stage.`);
  else if (ib > 8e-3) w.push(`The driving pin sources ${fI(ib)}: check its rating and that its V_OH holds at this current (the page assumes the full ${fV(vdrv, 3)}).`);
  if (il > p.icMax) w.push(`Load current ${fI(il)} exceeds the ${fI(p.icMax)} collector rating.`);
  if (vOff > p.vceo) w.push(`The switch sees ${fV(vOff, 3)} when off, above V_CEO = ${fV(p.vceo, 3)}.`);
  if (pq > p.ptot) w.push(`The transistor dissipates ${fP(pq)}, above its ${fP(p.ptot)} rating.`);
  else if (pq > 0.5 * p.ptot) w.push(`The transistor dissipates ${fP(pq)}, over half its ${fP(p.ptot)} rating at 25 °C.`);
  loadNotes(s, report, vOff);
  report.notes.push('A resistor from base to emitter (about 10× R_B) keeps the transistor off when the driving pin floats at reset.', 'Saturated BJTs turn off slowly (storage time, a few hundred ns for these parts at I_C/I_B = 10); for fast PWM use a MOSFET.');
  report.summary = `BJT low-side switch · ${fI(il)} load from ${fV(vcc, 3)} · R_B ${fR(rUse, 3)} from ${fV(vdrv, 3)} · β_F ${bf.toFixed(1)} · ${fP(pq)}`;
  report.details = { il, ib, bf, od, sat, pq, rUse, rbExact, params: p, vOff, icWorst, vceWorst };
  report.tables.push(rbTable(s, p, il, vdrv, rbExact));
  report.graphs = bjtGraphs(s, p, il, vdrv, vf, rUse, pq);
  return report;
}

function rbTable(s: SwitchState, p: BjtParams, il: number, vdrv: number, r: number): TableSpec {
  const vals: number[] = [];
  let x = r;
  for (let k = 0; k < 3; k++) {
    const [b] = bracketE(s.eseries, x * 0.999);
    vals.unshift(b);
    x = b;
  }
  x = r;
  for (let k = 0; k < 3; k++) {
    const [, a] = bracketE(s.eseries, x * 1.001);
    vals.push(a);
    x = a;
  }
  const rows = [...new Set(vals)].sort((a, b) => a - b).map((rb) => {
    const ib = (vdrv - p.vbeSat) / rb;
    return { rb, ib, bf: il / ib, od: (p.hfeMin * ib) / il };
  });
  return {
    id: 'rb-values',
    title: `${s.eseries} base resistors around ${fR(r, 4)}`,
    columns: [
      { key: 'rb', label: 'R_B', unit: 'Ω' },
      { key: 'ib', label: 'I_B', unit: 'A' },
      { key: 'bf', label: 'β_F' },
      { key: 'od', label: 'Overdrive' },
    ],
    rows,
    display: rows.map((x) => ({ rb: fR(x.rb, 3), ib: fI(x.ib), bf: x.bf.toFixed(1), od: `${x.od.toFixed(2)} ×` })),
    rowTones: rows.map((x) => (x.od < 1 ? 'fail' : x.od < 2 || x.ib > 20e-3 ? 'warn' : 'pass')),
    note: 'Red: not saturated for a minimum-gain part. Yellow: under 2× overdrive, or more than 20 mA of base current.',
  };
}

function bjtGraphs(s: SwitchState, p: BjtParams, il: number, vdrv: number, vf: number, rb: number, pq: number): GraphSpec[] {
  // 1 — dissipation vs load current at the same base drive (the transistor leaves saturation where h_FE,min·I_B < I_L)
  const ib = (vdrv - p.vbeSat) / rb;
  const xMax = Math.max(il * 2, 1e-9);
  const is = Array.from({ length: 201 }, (_, k) => (xMax * k) / 200);
  const pAt = (i: number) => {
    const ic = Math.min(i, p.hfeMin * ib);
    const vce = i <= p.hfeMin * ib ? p.vceSat : Math.max((s.vcc - vf) * (1 - ic / i), p.vceSat); // load line for a load that wants i
    return vce * ic + p.vbeSat * ib;
  };
  const g1: GraphSpec = {
    id: 'power-load',
    title: 'Dissipation vs load current',
    subtitle: `R_B = ${fR(rb, 3)}, minimum-gain part`,
    x: { label: 'Load current (fully on)', unit: 'A' },
    y: [{ id: 'p', label: 'Transistor power', unit: 'W', includeZero: true }],
    series: [{ label: 'P_Q', x: is, y: is.map(pAt), axis: 'p', width: 2.2 }],
    hlines: [{ value: p.ptot, label: `P_tot ${fP(p.ptot)}`, axis: 'p', color: '#8b1e1e', dash: [6, 4] }],
    vlines: [{ value: p.hfeMin * ib, label: 'h_FE,min·I_B', color: '#c47b17', dash: [4, 3] }],
    markers: [{ x: il, y: pq, axis: 'p', label: fP(pq) }],
  };
  // 2 — overdrive against the base resistor
  const r0 = rb / 20;
  const r1 = rb * 20;
  const rs = Array.from({ length: 161 }, (_, k) => r0 * (r1 / r0) ** (k / 160));
  const g2: GraphSpec = {
    id: 'overdrive-rb',
    title: 'Overdrive vs base resistor',
    subtitle: `I_L = ${fI(il)}, h_FE,min = ${p.hfeMin}`,
    x: { label: 'Base resistor', unit: 'Ω', log: true },
    y: [{ id: 'o', label: 'h_FE,min / β_F', unit: '×', log: true }],
    series: [{ label: 'Overdrive', x: rs, y: rs.map((r) => (p.hfeMin * (vdrv - p.vbeSat)) / r / il), axis: 'o', width: 2.2 }],
    hlines: [
      { value: 1, label: 'edge of saturation', axis: 'o', color: '#8b1e1e', dash: [6, 4] },
      { value: 2, label: '2× margin', axis: 'o', color: '#c47b17', dash: [3, 3] },
    ],
    vlines: [{ value: rb, label: `R_B ${fR(rb, 3)}`, color: '#9a8f7a' }],
  };
  return [g1, g2];
}

function runFet(s: SwitchState, report: CalcReport, fail: (m: string) => CalcReport, vcc: number, rl: number, vdrv: number, vf: number, fsw: number | null): CalcReport {
  const p = fetParams(s);
  for (const [n, v] of [['R_DS(on)', p.rds], ['V_th', p.vth], ['g_fs', p.gfs], ['Q_g', p.qg], ['Q_gd', p.qgd]] as const) if (!(finite(n, v) > 0)) throw new Error(`${n} must be > 0.`);
  const rdrv = finite('Driver resistance', s.rdrv);
  if (!(rdrv >= 0) || !(p.rgInt >= 0)) throw new Error('Driver and internal gate resistance must be ≥ 0.');
  const il = fetLoadCurrent(vcc, vf, rl, p.rds);
  // each edge at the threshold that makes it slow: turn-on at the highest plateau, turn-off at the lowest
  const vpl = plateau(p.vth, il, p.gfs);
  const vplLo = plateau(p.vthLo, il, p.gfs);
  if (!(vdrv > vpl)) return fail(`The drive ${fV(vdrv, 3)} does not reach the Miller plateau (V_th,max + I_L/g_fs ≈ ${fV(vpl, 3)}): the MOSFET would not switch fully on. Use a logic-level part with a lower threshold or a higher gate drive.`);
  const vmin = Math.min(vdrv - vpl, vplLo);
  let rgExact: number;
  let rgUse: number;
  if (s.solveFor === 'rg') {
    const t = finite('Target edge time', s.tsw);
    if (!(t > 0)) throw new Error('Target edge time must be > 0.');
    rgExact = (t * vmin) / p.qgd - rdrv - p.rgInt;
    if (!(rgExact >= 0)) return fail(`Even with no gate resistor the slower edge takes ${fT(Math.max(tOff(p.qgd, rdrv + p.rgInt, vplLo), tOn(p.qgd, rdrv + p.rgInt, vdrv, vpl)))} through the driver’s ${fR(rdrv + p.rgInt, 3)}. A faster edge needs a stronger driver (a gate-driver IC).`);
    if (rgExact > 1e6) return fail(`R_G would be ${fR(rgExact, 3)}: over 1 MΩ. Choose a shorter edge time.`);
    s.rg = rgExact;
    rgUse = rgExact > 0 ? bracketE(s.eseries, rgExact)[0] : 0; // next value down: the edge is at most the target
  } else {
    rgExact = rgUse = finite('Gate resistor', s.rg);
    if (!(rgUse >= 0)) throw new Error('Gate resistor must be ≥ 0.');
  }
  const rTot = rgUse + rdrv + p.rgInt;
  const ton = tOn(p.qgd, rTot, vdrv, vpl);
  const toff = tOff(p.qgd, rTot, vplLo);
  if (s.solveFor === 'tsw') {
    const t = Math.max(ton, toff);
    if (!(t > 0)) return fail('With no gate resistance at all the edges are instantaneous in this model: enter the driver’s output resistance.');
    if (t > 1) return fail(`The edges would take ${fT(t)}: check the gate resistor.`);
    s.tsw = t;
  }
  const vds = il * p.rds;
  const pCond = il * il * p.rds;
  const vOff = s.load === 'relay' ? vcc + 0.7 : vcc;
  const inductive = s.load === 'relay';
  const pSw = fsw != null ? (inductive ? 0.5 : 1 / 6) * vOff * il * (ton + toff) * fsw : 0;
  const pGate = fsw != null ? p.qg * vdrv * fsw : 0;
  const pq = pCond + pSw;
  const igPk = rTot > 0 ? vdrv / rTot : Infinity;
  const results: ResultItem[] = [];
  if (s.solveFor === 'rg') {
    results.push(
      item('rg', 'Gate resistor', rgExact, 'Ω', fR(rgExact), { symbol: 'R_G', solved: true, primary: true, note: `slower edge = ${fT(s.tsw)}` }),
      item('rgStd', `${s.eseries} gate resistor`, rgUse, 'Ω', fR(rgUse, 3), { symbol: 'R_G', primary: true, note: `next value down · t_on ${fT(ton)}, t_off ${fT(toff)}` }),
    );
  } else {
    results.push(item('tsw', 'Slower edge time', s.tsw, 's', fT(s.tsw), { symbol: 't_sw', solved: true, primary: true, note: `t_on ${fT(ton)} · t_off ${fT(toff)}` }));
  }
  const rdsNote = p.rdsVgs != null ? `max at V_GS = ${fV(p.rdsVgs, 2)}${p.unspecified ? ' (above your drive!)' : ''}` : 'entered';
  results.push(
    item('il', 'Load current', il, 'A', fI(il, 4), { symbol: 'I_L', primary: true, tone: il > p.idMax ? 'fail' : '' }),
    item('rds', 'R_DS(on) used', p.rds, 'Ω', fR(p.rds, 3), { symbol: 'R_DS(on)', primary: true, tone: p.unspecified ? 'fail' : '', note: rdsNote }),
    item('pq', 'MOSFET dissipation', pq, 'W', fP(pq), { symbol: 'P_Q', primary: true, tone: pq > p.ptot ? 'fail' : pq > 0.5 * p.ptot ? 'warn' : '', note: fsw != null ? `${fP(pCond)} conduction + ${fP(pSw)} switching` : 'conduction, I_L²·R_DS(on)' }),
    item('vds', 'Voltage across the switch', vds, 'V', fV(vds, 3), { symbol: 'V_DS', group: 'Load' }),
    item('vOff', 'Off-state switch voltage', vOff, 'V', fV(vOff, 3), { symbol: 'V_DS,off', group: 'Load', tone: vOff > p.vdsMax ? 'fail' : '', note: s.load === 'relay' ? 'clamped by the flyback diode' : undefined }),
    item('vov', 'Gate overdrive above V_th,max', vdrv - p.vth, 'V', fV(vdrv - p.vth, 3), { group: 'Gate', tone: vdrv < 2 * p.vth ? 'warn' : '' }),
    item('vpl', 'Miller plateau (est.)', vpl, 'V', `${fV(vplLo, 3)} … ${fV(vpl, 3)}`, { symbol: 'V_pl', group: 'Gate', note: 'V_th,min … V_th,max + I_L/g_fs' }),
    item('rTot', 'Total gate resistance', rTot, 'Ω', fR(rTot, 3), { symbol: 'R_G,tot', group: 'Gate', note: 'R_G + R_drv + R_G,int' }),
    item('igPk', 'Peak gate current', Number.isFinite(igPk) ? igPk : null, 'A', Number.isFinite(igPk) ? fI(igPk) : '—', { group: 'Gate' }),
    item('ton', 'Turn-on transition', ton, 's', fT(ton), { symbol: 't_on', group: 'Switching', note: 'Q_gd·R/(V_drv − V_pl), at V_th,max' }),
    item('toff', 'Turn-off transition', toff, 's', fT(toff), { symbol: 't_off', group: 'Switching', note: 'Q_gd·R/V_pl, at V_th,min' }),
    item('tCharge', 'Full gate charge time (est.)', (p.qg * rTot) / Math.max(vdrv - vpl, 1e-12), 's', fT((p.qg * rTot) / Math.max(vdrv - vpl, 1e-12)), { group: 'Switching', note: 'Q_g at the plateau current: upper bound' }),
  );
  if (fsw != null) results.push(item('pSw', 'Switching loss', pSw, 'W', fP(pSw), { group: 'Switching', note: inductive ? `½·V·I·(t_on + t_off)·f at ${si(fsw, 'Hz', 3)}; current-rise interval not included` : `V·I·(t_on + t_off)·f/6 at ${si(fsw, 'Hz', 3)} (resistive)` }), item('pGate', 'Gate-drive power', pGate, 'W', fP(pGate), { group: 'Switching', note: 'Q_g·V_drv·f (in the driver)' }));
  report.results = results;

  const w = report.warnings;
  if (p.unspecified) w.push(`The datasheet specifies R_DS(on) only at V_GS ≥ ${fV(p.rdsVgs!, 2)}, above your ${fV(vdrv, 3)} drive: the on-resistance is not guaranteed and may be far higher. Raise the drive or choose a part rated at your logic level.`);
  else if (vdrv < 2 * p.vth) w.push(`The drive ${fV(vdrv, 3)} is less than twice the maximum threshold ${fV(p.vth, 3)}: only use R_DS(on) values the datasheet guarantees at this V_GS.`);
  if (vdrv > p.vgsMax) w.push(`The gate drive ${fV(vdrv, 3)} exceeds the ±${fV(p.vgsMax, 3)} gate rating.`);
  if (il > p.idMax) w.push(`Load current ${fI(il)} exceeds the ${fI(p.idMax)} drain rating.`);
  if (vOff > p.vdsMax) w.push(`The switch sees ${fV(vOff, 3)} when off, above its ${fV(p.vdsMax, 3)} V_DS rating.`);
  if (pq > p.ptot) w.push(`The MOSFET dissipates ${fP(pq)}, above the ${fP(p.ptot)} it can shed. Use a lower-R_DS(on) part, more drive, or a heatsink.`);
  else if (pq > 0.5 * p.ptot) w.push(`The MOSFET dissipates ${fP(pq)}, over half of ${fP(p.ptot)}: check the board’s thermal resistance.`);
  if (fsw != null && (ton + toff) * fsw > 0.05) w.push(`The edges take ${(((ton + toff) * fsw) * 100).toFixed(0)} % of each PWM period: lower R_G or use a gate driver.`);
  if (Number.isFinite(igPk) && igPk > 25e-3 && rdrv >= 20) w.push(`The peak gate current ${fI(igPk)} exceeds what a typical MCU pin can source; add gate resistance or a driver.`);
  loadNotes(s, report, vOff);
  report.notes.push(
    'Edge times are first-order gate-charge estimates (Balogh, TI SLUA618): each edge is taken at the threshold that makes it slow (turn-on V_th,max, turn-off V_th,min) with the datasheet g_fs, and Q_gd is taken at the datasheet test voltage.',
    'Add a pull-down (10–100 kΩ) from gate to source so the MOSFET stays off while the driving pin is high-impedance at reset.',
  );
  report.summary = `MOSFET low-side switch · ${fI(il)} load from ${fV(vcc, 3)} · R_DS(on) ${fR(p.rds, 3)} at ${fV(vdrv, 3)} drive · ${fP(pq)}`;
  report.details = { il, vpl, vplLo, ton, toff, rTot, rgUse, rgExact, pCond, pSw, pGate, pq, params: p, vOff, vds };
  report.tables.push(rdsTable(s, vcc, vf, rl, vdrv));
  report.graphs = fetGraphs(s, p, il, vdrv, vpl, vplLo, rdrv, rgUse, vOff, fsw, pq);
  return report;
}

function rdsTable(s: SwitchState, vcc: number, vf: number, rl: number, vdrv: number): TableSpec {
  const p = FET_SWITCH[s.fetPart];
  const pts: [number, number][] = p ? p.rdson : [[vdrv, s.rdson]];
  const ptot = p ? p.ptot : s.ptotF;
  const rows = pts.map(([vgs, r]) => {
    const il = fetLoadCurrent(vcc, vf, rl, r);
    return { vgs, r, il, p: il * il * r };
  });
  return {
    id: 'rdson',
    title: p ? `${s.fetPart}: R_DS(on) specifications` : 'R_DS(on) entered',
    columns: [
      { key: 'vgs', label: 'V_GS', unit: 'V' },
      { key: 'r', label: 'R_DS(on) max', unit: 'Ω' },
      { key: 'il', label: 'I_L', unit: 'A' },
      { key: 'p', label: 'P_cond', unit: 'W' },
    ],
    rows,
    display: rows.map((x) => ({ vgs: fV(x.vgs, 3), r: fR(x.r, 3), il: fI(x.il), p: fP(x.p) })),
    rowTones: rows.map((x) => (x.vgs > vdrv * (1 + 1e-12) || x.p > ptot ? 'fail' : x.p > 0.5 * ptot ? 'warn' : 'pass')),
    note: 'Red: needs more gate drive than you have, or over the power rating. Yellow: over half the power rating.',
  };
}

function fetGraphs(s: SwitchState, p: FetParams, il: number, vdrv: number, vpl: number, vplLo: number, rdrv: number, rg: number, vOff: number, fsw: number | null, pq: number): GraphSpec[] {
  const xMax = Math.max(il * 2, 1e-9);
  const is = Array.from({ length: 201 }, (_, k) => (xMax * k) / 200);
  const pAt = (i: number) => {
    const v = plateau(p.vth, i, p.gfs);
    const r = rg + rdrv + p.rgInt;
    const sw = fsw != null && vdrv > v ? (s.load === 'relay' ? 0.5 : 1 / 6) * vOff * i * (tOn(p.qgd, r, vdrv, v) + tOff(p.qgd, r, plateau(p.vthLo, i, p.gfs))) * fsw : 0;
    return i * i * p.rds + sw;
  };
  const g1: GraphSpec = {
    id: 'power-load',
    title: 'Dissipation vs load current',
    subtitle: fsw != null ? `conduction + switching at ${si(fsw, 'Hz', 3)}` : 'conduction, I²·R_DS(on)',
    x: { label: 'Load current', unit: 'A' },
    y: [{ id: 'p', label: 'MOSFET power', unit: 'W', includeZero: true }],
    series: [{ label: 'P_Q', x: is, y: is.map(pAt), axis: 'p', width: 2.2 }],
    hlines: [{ value: p.ptot, label: `P_tot ${fP(p.ptot)}`, axis: 'p', color: '#8b1e1e', dash: [6, 4] }],
    markers: [{ x: il, y: pq, axis: 'p', label: fP(pq) }],
  };
  const rMax = Math.max(rg * 3, 200);
  const rs = Array.from({ length: 161 }, (_, k) => (rMax * k) / 160);
  const g2: GraphSpec = {
    id: 'edges-rg',
    title: 'Edge times vs gate resistor',
    subtitle: `R_drv ${fR(rdrv, 3)} + R_G,int ${fR(p.rgInt, 3)}, V_pl ${fV(vplLo, 3)} … ${fV(vpl, 3)}`,
    x: { label: 'Gate resistor R_G', unit: 'Ω' },
    y: [{ id: 't', label: 'Transition time', unit: 's', includeZero: true }],
    series: [
      { label: 't_on', x: rs, y: rs.map((r) => tOn(p.qgd, r + rdrv + p.rgInt, vdrv, vpl)), axis: 't', width: 2.2 },
      { label: 't_off', x: rs, y: rs.map((r) => tOff(p.qgd, r + rdrv + p.rgInt, vplLo)), axis: 't', width: 2.2, color: '#c47b17' },
    ],
    hlines: s.solveFor === 'rg' ? [{ value: s.tsw, label: `target ${fT(s.tsw)}`, axis: 't', color: '#9a8f7a', dash: [4, 3] }] : [],
    vlines: [{ value: rg, label: `R_G ${fR(rg, 3)}`, color: '#9a8f7a' }],
  };
  return [g1, g2];
}

export const def: CalcDef<SwitchState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Low-side switch. BJT: hard saturation with forced gain β_F, R_B = (V_drive − V_BE(sat))·β_F/I_L, checked against the datasheet minimum h_FE (Horowitz & Hill, AoE 3e §2.2.1). MOSFET: I_L·R_DS(on) at the drive voltage from the datasheet table, Miller-plateau edge times t = Q_gd·R_G,tot/I_G with V_pl ≈ V_th + I_L/g_fs, and switching loss ½·V·I·(t_on+t_off)·f (Balogh, TI SLUA618). Datasheet presets (onsemi 2N3904, P2N2222A; AOS AO3400A; Infineon IRLML2502, IRLZ44N); IEC 60063 values.',
  fields,
  defaults,
  solve: {
    default: 'rb',
    analysis: (s) => (s.device === 'mosfet' ? 'tsw' : 'betaF'),
    options: [
      { key: 'rb', label: 'BJT: base resistor for a forced gain' },
      { key: 'betaF', label: 'BJT: drive margin from a base resistor' },
      { key: 'rg', label: 'MOSFET: gate resistor for an edge time' },
      { key: 'tsw', label: 'MOSFET: edge time from a gate resistor' },
    ],
  },
  compute,
  sync: (s) => {
    // A solve option of the other device is not reachable from this one's fields: fall back to this device's analysis.
    if (s.device === 'bjt' && (s.solveFor === 'rg' || s.solveFor === 'tsw')) s.solveFor = 'betaF';
    if (s.device === 'mosfet' && (s.solveFor === 'rb' || s.solveFor === 'betaF')) s.solveFor = 'tsw';
  },
  examples: [
    { id: 'relay-2n2222', label: '5 V relay (70 Ω coil) from a 3.3 V pin with a 2N2222A', state: defaults() },
    { id: 'relay-12v-2n3904', label: '12 V relay (400 Ω coil) from 3.3 V with a 2N3904, β_F = 20', state: { ...defaults(), load: 'relay', vcc: 12, rl: 400, bjtPart: '2N3904 (200 mA)', betaF: 20, vdrv: 3.3 } },
    { id: 'led-strip-ao3400', label: '12 V LED strip, 1 A, AO3400A from 3.3 V at 20 kHz PWM', state: { ...defaults(), solveFor: 'tsw', device: 'mosfet', load: 'resistive', vcc: 12, rl: 12, vdrv: 3.3, fetPart: FET_DEFAULT, rg: 100, rdrv: 50, fsw: 20e3, fswUnit: 'kHz' } },
    { id: 'rg-for-100ns', label: 'Gate resistor for 100 ns edges: IRLML2502, 2 A from 5 V drive', state: { ...defaults(), solveFor: 'rg', device: 'mosfet', load: 'resistive', vcc: 12, rl: 6, vdrv: 5, fetPart: 'IRLML2502 (20 V, SOT-23)', rdrv: 10, tsw: 100e-9, tswUnit: 'ns' } },
    { id: 'irlz44n-3v3', label: 'IRLZ44N from 3.3 V logic: R_DS(on) not specified that low', state: { ...defaults(), solveFor: 'tsw', device: 'mosfet', load: 'resistive', vcc: 12, rl: 2, vdrv: 3.3, fetPart: 'IRLZ44N (55 V, TO-220)', rg: 47, rdrv: 50 } },
    { id: 'weak-drive', label: 'Too little base drive: 2N3904, 100 mA lamp, R_B 4.7k', state: { ...defaults(), solveFor: 'betaF', load: 'resistive', vcc: 5, rl: 47, bjtPart: '2N3904 (200 mA)', rb: 4.7e3, rbUnit: 'kΩ', vdrv: 3.3 } },
  ],
};
