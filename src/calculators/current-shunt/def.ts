/** Current-sense shunt — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { bracketE, ratingFor } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { codeIdeal, codeInt, currentFromCode, errorBudget, gainFor, iClip, iMaxFor, lsbCurrent, shuntFor, type ErrorBudget, type ErrorInputs, type ShuntDesign } from './model';

export const ID = 'sensor/current-shunt';

export interface ShuntState {
  solveFor: 'r' | 'iMax' | 'gain';
  iMax: number;
  r: number;
  rUnit: string;
  g: number;
  vfs: number;
  bits: number;
  dir: 'uni' | 'bi';
  /** headroom kept below the end of the span at I_max, % */
  headroom: number;
  side: 'high' | 'low';
  vbus: number;
  /** measurement point given as a current or as an ADC reading */
  measForm: 'current' | 'code';
  iMeas: number;
  code: number;
  eseries: string;
  pRated: number;
  /** shunt tolerance, % */
  tolR: number;
  /** shunt TCR, ppm/K */
  tcr: number;
  temp: number;
  /** shunt thermal resistance to ambient, °C/W (null = unknown) */
  thetaR: number | null;
  vos: number;
  vosDrift: number;
  /** gain error, % */
  gainErr: number;
  /** gain drift, ppm/K */
  gainDrift: number;
  cmrr: number;
  vcmTest: number;
  psrr: number;
  vs: number;
  vsTest: number;
  /** ADC reference tolerance, % */
  refTol: number;
}

export const defaults = (): ShuntState => ({
  solveFor: 'r',
  iMax: 5,
  r: 11.88e-3,
  rUnit: 'mΩ',
  g: 50,
  vfs: 3.3,
  bits: 12,
  dir: 'uni',
  headroom: 10,
  side: 'high',
  vbus: 12,
  measForm: 'current',
  iMeas: 0.5,
  code: 0,
  eseries: 'E24',
  pRated: 1,
  tolR: 1,
  tcr: 75,
  temp: 25,
  thetaR: null,
  vos: 25e-6,
  vosDrift: 0.25e-6,
  gainErr: 0.2,
  gainDrift: 10,
  cmrr: 120,
  vcmTest: 12,
  psrr: 100,
  vs: 5,
  vsTest: 5,
  refTol: 0.5,
});

const U_R = withDefault(U_OHM, 'mΩ');
const codeGiven = (root: any) => root.measForm === 'code';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Range',
    note: 'Click ◎ to choose the unknown. I_max lands at (1 − headroom) of the ADC span.',
    fields: [
      { kind: 'number', key: 'iMax', symbol: 'I_max', label: 'Max current', unit: 'A', solvable: true, min: 1e-6, max: 1e4, help: 'Largest current that must be measured without clipping (for bidirectional sensing: in either direction).' },
      { kind: 'number', key: 'r', symbol: 'R_sh', label: 'Shunt resistance', units: U_R, unitKey: 'rUnit', solvable: true, min: 1e-6, max: 1e6 },
      {
        kind: 'number', key: 'g', symbol: 'G', label: 'Amplifier gain', suffix: 'V/V', min: 0.01, max: 1e5,
        // the field key is "g" but the solve option is "gain": map the ◎ button and the green state explicitly
        solvable: true, solvedWhen: (_s, root) => root.solveFor === 'gain', onSolve: (_s, root) => (root.solveFor = 'gain'),
        help: 'Gain of the current-sense amplifier (fixed-gain parts: 20, 25, 50, 100, 200, 500 V/V are common). Use 1 for a shunt read directly by the ADC.' },
      { kind: 'select', key: 'dir', label: 'Direction', options: [{ value: 'uni', label: 'Unidirectional (0 … I_max)' }, { value: 'bi', label: 'Bidirectional (mid-scale bias)' }], help: 'Bidirectional: the amplifier output sits at V_FS/2 at zero current, so each direction gets half the span.' },
      { kind: 'number', key: 'headroom', symbol: 'h', label: 'Headroom', suffix: '%', min: 0, max: 90, help: 'Margin kept below the end of the span, for amplifier output swing, overshoot and tolerances. 10 % is a common choice.' },
    ],
  },
  {
    kind: 'section',
    title: 'ADC',
    fields: [
      { kind: 'number', key: 'vfs', symbol: 'V_FS', label: 'ADC full scale', unit: 'V', min: 1e-3, max: 100, help: 'ADC reference / full-scale input voltage. The amplifier output must stay inside it.' },
      { kind: 'number', key: 'bits', symbol: 'N', label: 'ADC resolution', suffix: 'bit', integer: true, min: 1, max: 24 },
      { kind: 'number', key: 'refTol', symbol: 'ε_ref', label: 'Ref. tolerance', suffix: '%', min: 0, max: 20, help: 'Initial accuracy of the ADC reference; it scales every reading like a gain error.' },
    ],
  },
  {
    kind: 'section',
    title: 'Circuit & measurement',
    fields: [
      { kind: 'select', key: 'side', label: 'Shunt position', options: [{ value: 'high', label: 'High-side (in the supply line)' }, { value: 'low', label: 'Low-side (in the ground return)' }], help: 'High-side: the amplifier sees the bus voltage as common-mode. Low-side: common-mode ≈ 0 V, but the load is lifted off ground by the shunt drop.' },
      { kind: 'number', key: 'vbus', symbol: 'V_bus', label: 'Bus voltage', unit: 'V', min: -1000, max: 1000, visible: (s) => s.side === 'high', help: 'Common-mode voltage at the shunt for high-side sensing; used for the CMRR error term.' },
      {
        kind: 'number', key: 'iMeas', symbol: 'I', label: 'Current', unit: 'A', min: -1e4, max: 1e4, solvable: true,
        solvedWhen: (_s, root) => codeGiven(root), onSolve: (_s, root) => (root.measForm = 'current'), onUnsolve: (_s, root) => (root.measForm = 'code'),
        help: 'Operating point for the ADC reading and the error budget. Offset errors grow as the current falls, so check a low current too. Click ◎ on the reading to convert a reading into a current instead.',
      },
      {
        kind: 'number', key: 'code', symbol: 'code', label: 'ADC reading', suffix: 'LSB', min: 0, max: 2 ** 24, solvable: true,
        solvedWhen: (_s, root) => !codeGiven(root), onSolve: (_s, root) => (root.measForm = 'code'), onUnsolve: (_s, root) => (root.measForm = 'current'),
        help: 'ADC output code. When computed it is the exact (unrounded) value; the integer code is in the results.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Shunt resistor',
    fields: [
      { kind: 'select', key: 'eseries', label: 'Standard values', options: ['E6', 'E12', 'E24', 'E96'], help: 'Series searched for candidate shunt values around the exact R_sh. Low-ohm shunts mostly come in E6–E24 steps.' },
      { kind: 'number', key: 'pRated', symbol: 'P_rated', label: 'Rated power', unit: 'W', min: 1e-3, max: 1e4, help: 'Power rating of the part you plan to use (e.g. 1 W for a 2512 metal-strip chip). Candidates turn yellow above half of it and red above it.' },
      { kind: 'number', key: 'tolR', symbol: 'tol', label: 'Tolerance', suffix: '%', min: 0, max: 20 },
      { kind: 'number', key: 'tcr', symbol: 'TCR', label: 'Temp. coeff.', suffix: 'ppm/K', min: 0, max: 5000, help: 'Metal-strip shunts: 20–100 ppm/K. A PCB copper trace used as a shunt: about 3900 ppm/K.' },
      { kind: 'number', key: 'temp', symbol: 'T_A', label: 'Ambient', suffix: '°C', min: -60, max: 200, help: 'Temperature of the board. Drift terms use |T − 25 °C|.' },
      { kind: 'number', key: 'thetaR', symbol: 'θ_R', label: 'Thermal res.', suffix: '°C/W', optional: true, zeroHint: 'not set', min: 0, max: 1e4, help: 'Shunt-to-ambient thermal resistance from its datasheet or derating curve. When given, self-heating at I_max raises the shunt temperature for the TCR term. Leave blank to skip.' },
    ],
  },
  {
    kind: 'section',
    title: 'Amplifier errors (datasheet max)',
    collapsed: true,
    fields: [
      { kind: 'number', key: 'vos', symbol: 'V_os', label: 'Input offset', unit: 'V', min: 0, max: 0.1, help: 'Maximum input offset voltage at the datasheet test conditions.' },
      { kind: 'number', key: 'vosDrift', symbol: 'dV_os/dT', label: 'Offset drift', unit: 'V/K', min: 0, max: 1e-3 },
      { kind: 'number', key: 'gainErr', symbol: 'ε_G', label: 'Gain error', suffix: '%', min: 0, max: 20 },
      { kind: 'number', key: 'gainDrift', symbol: 'dG/dT', label: 'Gain drift', suffix: 'ppm/K', min: 0, max: 1e4 },
      { kind: 'number', key: 'cmrr', symbol: 'CMRR', label: 'CMRR', suffix: 'dB', min: 0, max: 200 },
      { kind: 'number', key: 'vcmTest', symbol: 'V_cm,test', label: 'Test CM', unit: 'V', min: -1000, max: 1000, help: 'Common-mode voltage at which the datasheet specifies V_os. The CMRR term uses the difference from the actual common-mode voltage.' },
      { kind: 'number', key: 'psrr', symbol: 'PSRR', label: 'PSRR', suffix: 'dB', min: 0, max: 200 },
      { kind: 'number', key: 'vs', symbol: 'V_S', label: 'Supply', unit: 'V', min: 0, max: 100 },
      { kind: 'number', key: 'vsTest', symbol: 'V_S,test', label: 'Test supply', unit: 'V', min: 0, max: 100 },
    ],
  },
];

const LABEL: Record<ShuntState['solveFor'], string> = { r: 'Shunt resistance', iMax: 'Full-scale current', gain: 'Amplifier gain' };

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fI = (i: number, d = 4) => si(i, 'A', d);
const fV = (v: number, d = 4) => si(v, 'V', d);
const fP = (p: number) => si(p, 'W', 3);
/** Percentages: 3 significant figures, plain integers above 1000 %, a cap for absurd values. */
const pc = (x: number, d = 3) => {
  const v = x * 100;
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1e6) return '> 10⁶ %';
  if (Math.abs(v) >= 1000) return `${Math.round(v).toLocaleString('en-US').replace(/,/g, ' ')} %`;
  return `${v.toPrecision(d)} %`;
};

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: ShuntState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function errInputs(s: ShuntState, i: number, r: number, lsbI: number): ErrorInputs {
  return {
    i, r, tolR: s.tolR / 100, tcr: s.tcr * 1e-6, temp: s.temp, thetaR: s.thetaR, iHeat: s.iMax,
    vos: s.vos, vosDrift: s.vosDrift, gainErr: s.gainErr / 100, gainDrift: s.gainDrift * 1e-6,
    cmrr: s.cmrr, vcm: s.side === 'high' ? s.vbus : 0, vcmTest: s.vcmTest, psrr: s.psrr, vs: s.vs, vsTest: s.vsTest,
    lsbI, refTol: s.refTol / 100,
  };
}

function oor(s: ShuntState, msg: string): CalcReport {
  return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'OUT OF RANGE', tone: 'warn' }, error: msg };
}

function run(st: ShuntState): CalcReport {
  const warnings0: string[] = [];
  /** the reading is pinned at an end of the ADC range: the error budget does not apply */
  let clipped = false;
  const s: ShuntState = { ...st };
  for (const k of ['vfs', 'bits', 'headroom', 'pRated', 'tolR', 'tcr', 'temp', 'vos', 'vosDrift', 'gainErr', 'gainDrift', 'cmrr', 'vcmTest', 'psrr', 'vs', 'vsTest', 'refTol', 'vbus'] as const) finite(k, s[k]);
  if (s.thetaR != null) finite('θ_R', s.thetaR);
  if (!(s.vfs > 0)) throw new Error('ADC full scale must be > 0.');
  if (!(s.bits >= 1 && s.bits <= 24)) throw new Error('ADC resolution must be 1 … 24 bits.');
  s.bits = Math.round(s.bits);
  if (!(s.headroom >= 0 && s.headroom < 100)) throw new Error('Headroom must be 0 … 99 %.');
  if (!(s.pRated > 0)) throw new Error('Rated power must be > 0.');
  if (s.thetaR != null && s.thetaR < 0) throw new Error('θ_R must be ≥ 0 (leave blank if unknown).');
  for (const k of ['tolR', 'tcr', 'vos', 'vosDrift', 'gainErr', 'gainDrift', 'refTol', 'cmrr', 'psrr'] as const) if (s[k] < 0) throw new Error(`${k} must be ≥ 0.`);
  const bidir = s.dir === 'bi';
  const h = s.headroom / 100;
  const need = (k: 'iMax' | 'r' | 'g') => (s.solveFor === (k === 'g' ? 'gain' : k) ? 0 : finite(k, s[k]));
  const iMax0 = need('iMax');
  const r0 = need('r');
  const g0 = need('g');
  if (s.solveFor !== 'iMax' && !(iMax0 > 0)) throw new Error('Full-scale current must be > 0.');
  if (s.solveFor !== 'r' && !(r0 > 0)) throw new Error('Shunt resistance must be > 0.');
  if (s.solveFor !== 'gain' && !(g0 > 0)) throw new Error('Gain must be > 0.');

  // ── solve (closed-form inverses of the one sizing equation G·R·I_max = (1 − h)·V_span)
  switch (s.solveFor) {
    case 'r':
      s.r = shuntFor(iMax0, g0, s.vfs, bidir, h);
      break;
    case 'iMax':
      s.iMax = iMaxFor(r0, g0, s.vfs, bidir, h);
      break;
    case 'gain':
      s.g = gainFor(r0, iMax0, s.vfs, bidir, h);
      break;
    default:
      throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }
  // the solved value must fit its input box: say what limits it, in the field's units
  const span = (1 - h) * (bidir ? s.vfs / 2 : s.vfs);
  if (s.solveFor === 'r' && (s.r < 1e-6 || s.r > 1e6))
    return oor(s, `R_sh would be ${fR(s.r, 3)}, outside the 1 µΩ … 1 MΩ this input accepts: ${fV(span, 3)} of output swing divided by G·I_max = ${(s.g * s.iMax).toPrecision(3)} A. Change the gain or the full-scale current.`);
  if (s.solveFor === 'iMax' && (s.iMax < 1e-6 || s.iMax > 1e4))
    return oor(s, `I_max would be ${fI(s.iMax, 3)}, outside the 1 µA … 10 kA this input accepts: ${fV(span, 3)} of output swing divided by G·R_sh. Change the shunt or the gain.`);
  if (s.solveFor === 'gain' && (s.g < 0.01 || s.g > 1e5))
    return oor(s, `The gain would be ${s.g.toPrecision(3)} V/V, outside the 0.01 … 100 000 V/V this input accepts: ${fV(span, 3)} of output swing over a ${fV(s.r * s.iMax, 3)} shunt voltage. Change R_sh or the full-scale current.`);
  const d: ShuntDesign = { r: s.r, g: s.g, vfs: s.vfs, bits: s.bits, bidir };
  const lsbI = lsbCurrent(d);
  const clip = iClip(d);

  // ── measurement point: current → reading, or reading → current
  const nCodes = 2 ** s.bits;
  if (codeGiven(s)) {
    const c = finite('ADC reading', s.code);
    if (c < 0 || c > nCodes - 1) throw new Error(`ADC reading must be 0 … ${nCodes - 1} for a ${s.bits}-bit ADC.`);
    s.iMeas = currentFromCode(d, c);
    if (Math.abs(s.iMeas) > 1e4) return oor(s, `This reading means ${fI(s.iMeas, 3)}, beyond the ±10 kA this input accepts. Check R_sh and the gain.`);
  } else {
    finite('Measured current', s.iMeas);
    const exact = codeIdeal(d, s.iMeas);
    // the ADC cannot report beyond its range: clamp the reading and say so
    s.code = Math.min(Math.max(exact, 0), nCodes - 1);
    clipped = exact < 0 || exact > nCodes - 1;
    if (exact < 0)
      warnings0.push(`${fI(s.iMeas, 3)} is below the measurable range (${bidir ? `−${fI(clip, 3)}` : '0 A'}): the ADC reads 0.${bidir ? '' : ' A unidirectional range cannot see reverse current; use a bidirectional (mid-scale) configuration.'}`);
    else if (exact > nCodes - 1) warnings0.push(`${fI(s.iMeas, 3)} is above the ADC’s full scale (${fI(currentFromCode(d, nCodes - 1), 4)}): the reading saturates at ${nCodes - 1}. Raise I_max or lower G·R_sh.`);
  }
  const iM = s.iMeas;

  const pMax = s.iMax * s.iMax * s.r;
  const pMeas = iM * iM * s.r;
  const eb = errorBudget(errInputs(s, iM, s.r, lsbI));
  const ebFs = errorBudget(errInputs(s, s.iMax, s.r, lsbI));
  const rating = ratingFor(2 * pMax);

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  warnings.push(...warnings0);
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  // ── headline
  const solvedKey = s.solveFor === 'gain' ? 'g' : s.solveFor;
  const solvedVal = s[solvedKey];
  const solvedDisp = s.solveFor === 'r' ? fR(s.r) : s.solveFor === 'iMax' ? fI(s.iMax) : `${s.g.toPrecision(4)} V/V`;
  const primary: ResultItem[] = [
    item(solvedKey, LABEL[s.solveFor], solvedVal, s.solveFor === 'r' ? 'Ω' : s.solveFor === 'iMax' ? 'A' : 'V/V', solvedDisp, {
      symbol: s.solveFor === 'r' ? 'R_sh' : s.solveFor === 'iMax' ? 'I_max' : 'G', solved: true, primary: true,
      note: `V_sh ${fV(s.iMax * s.r, 3)} at ${fI(s.iMax, 3)}`,
    }),
    item('pMax', 'Shunt power at I_max', pMax, 'W', fP(pMax), { symbol: 'P', primary: true, tone: pMax > s.pRated ? 'fail' : pMax > s.pRated / 2 ? 'warn' : '', note: rating ? `use ≥ ${si(rating, 'W')} (2× margin)` : 'above 10 W: use a power shunt' }),
    clipped
      ? item('errRss', `Error at ${fI(iM, 3)}`, null, '', 'n/a (clipped)', { symbol: 'ε', primary: true, tone: 'fail', note: 'the reading is pinned at the end of the ADC range' })
      : item('errRss', `Error at ${fI(iM, 3)}`, Number.isFinite(eb.rss) ? eb.rss : null, '', Number.isFinite(eb.rss) ? `±${pc(eb.rss)} RSS` : '—', { symbol: 'ε', primary: true, tone: eb.rss > 0.05 ? 'warn' : '', note: Number.isFinite(eb.worst) ? `worst case ±${pc(eb.worst)}` : 'zero current: relative error undefined' }),
    item('lsbI', 'Resolution', lsbI, 'A', `${fI(lsbI, 4)}/LSB`, { symbol: 'I_LSB', primary: true, note: `${s.bits} bit over ${fI(clip, 3)}${bidir ? ' each way' : ''}` }),
  ];
  if (codeGiven(s)) primary.splice(1, 0, item('iMeas', 'Measured current', iM, 'A', fI(iM, 5), { symbol: 'I', solved: true, primary: true, note: `from reading ${s.code}` }));
  else primary.splice(1, 0, item('code', 'ADC reading', s.code, '', `${codeInt(d, iM)}`, { symbol: 'code', solved: true, primary: true, note: `exact ${s.code.toFixed(2)} · 0x${codeInt(d, iM).toString(16).toUpperCase()}` }));

  const vout = (i: number) => (bidir ? s.vfs / 2 : 0) + s.g * s.r * i;
  const rest: ResultItem[] = [
    item('vshMax', 'Shunt voltage at I_max', s.iMax * s.r, 'V', fV(s.iMax * s.r), { symbol: 'V_sh', group: 'Range' }),
    item('voutMax', 'Amplifier output at I_max', vout(s.iMax), 'V', fV(vout(s.iMax)), { symbol: 'V_out', group: 'Range', note: `${pc(1 - h, 3)} of the span` }),
    item('iClip', 'Clipping current', clip, 'A', fI(clip), { symbol: 'I_clip', group: 'Range', note: 'output reaches the end of the span' }),
    item('fsCurrent', 'ADC full-scale current', s.vfs / (s.g * s.r), 'A', fI(s.vfs / (s.g * s.r)), { symbol: 'V_FS/(G·R)', group: 'Range', note: bidir ? 'whole span, from −I_clip' : undefined }),
    item('pMeas', 'Shunt power at I', pMeas, 'W', fP(pMeas), { symbol: 'P(I)', group: 'Power' }),
    item('rating', 'Recommended rating', rating, 'W', rating ? si(rating, 'W') : '> 10 W', { group: 'Power', note: '≥ 2 × P at I_max' }),
    item('vshMeas', 'Shunt voltage at I', iM * s.r, 'V', fV(iM * s.r), { symbol: 'V_sh', group: 'Measurement' }),
    item('voutMeas', 'Amplifier output at I', vout(iM), 'V', fV(vout(iM)), { symbol: 'V_out', group: 'Measurement', tone: Math.abs(iM) > clip ? 'fail' : '' }),
    item('codeInt', 'Integer code', codeInt(d, iM), '', `${codeInt(d, iM)} of ${nCodes - 1}`, { group: 'Measurement' }),
    item('errWorst', 'Worst-case error at I', Number.isFinite(eb.worst) ? eb.worst : null, '', Number.isFinite(eb.worst) ? `±${pc(eb.worst)}` : '—', { group: 'Error budget', note: 'Σ|eᵢ|' }),
    item('errAbs', 'RSS error in amperes', Number.isFinite(eb.rss) ? eb.rss * Math.abs(iM) : null, 'A', Number.isFinite(eb.rss) ? `±${fI(eb.rss * Math.abs(iM), 3)}` : '—', { group: 'Error budget' }),
    item('errRssFs', 'RSS error at I_max', ebFs.rss, '', `±${pc(ebFs.rss)}`, { group: 'Error budget', note: `worst case ±${pc(ebFs.worst)}` }),
  ];
  const dom = [...eb.terms].sort((a, b) => b.rel - a.rel)[0];
  if (Number.isFinite(eb.rss)) rest.push(item('dominant', 'Largest term', dom.rel, '', `${dom.label} ±${pc(dom.rel)}`, { group: 'Error budget' }));
  if (s.thetaR != null) {
    rest.push(
      item('dTself', 'Self-heating at I_max', eb.dTself, 'K', `${eb.dTself.toFixed(1)} K`, { symbol: 'ΔT', group: 'Power', note: 'P·θ_R' }),
      item('tShunt', 'Shunt temperature', eb.tShunt, '°C', `${eb.tShunt.toFixed(1)} °C`, { symbol: 'T_R', group: 'Power', tone: eb.tShunt > 155 ? 'warn' : '' }),
    );
  }
  report.results = [...primary, ...rest];

  // ── tables
  report.tables.push(budgetTable(eb, iM));
  if (clipped) notes.push('The error budget assumes the reading is inside the ADC range; at this current the reading is clipped, so the budget figures do not apply.');
  const cand = candidateTable(s, bidir, h);
  if (cand) report.tables.push(cand);

  // ── warnings & notes
  if (pMax > s.pRated) warnings.push(`The shunt dissipates ${fP(pMax)} at I_max, above its ${fP(s.pRated)} rating. Use a lower R_sh with more gain, or a higher-power part.`);
  else if (pMax > s.pRated / 2) warnings.push(`The shunt dissipates ${fP(pMax)} at I_max, more than half its ${fP(s.pRated)} rating: it runs hot and drifts through its TCR. Derate (2× margin), lower R_sh, or use a larger part.`);
  if (!clipped && Math.abs(iM) > clip) warnings.push(`The measured current ${fI(iM, 3)} is beyond the clipping current ${fI(clip, 3)}: the reading saturates. Raise I_max or lower G·R_sh.`);
  if (!clipped && Number.isFinite(eb.rss) && eb.rss > 0.05) warnings.push(`At ${fI(iM, 3)} the error is ±${pc(eb.rss)} (RSS), largest term: ${dom.label}. ${dom.kind === 'offset' ? 'Use a larger shunt voltage (higher R_sh) or a zero-drift amplifier, or calibrate the offset at zero current.' : dom.kind === 'adc' ? 'Use more ADC bits or a better reference, or oversample.' : 'Use a tighter-tolerance or lower-TCR part, or calibrate.'}`);
  if (s.r < 1e-3) warnings.push(`R_sh = ${fR(s.r, 3)} is below 1 mΩ: solder joints and copper (≈ 0.5 mΩ per square of 1 oz) are comparable. Use a 4-terminal (Kelvin) shunt and route the sense lines from its inner pads.`);
  if (s.iMax * s.r < 10e-3) notes.push(`Full-scale shunt voltage ${fV(s.iMax * s.r, 3)}: amplifier offset (${fV(s.vos, 2)} = ${pc(s.vos / (s.iMax * s.r), 2)} of full scale) limits the low end. Zero-drift amplifiers keep it small.`);
  if (s.solveFor === 'gain' && (s.g < 1 || s.g > 1000)) warnings.push(`A gain of ${s.g.toPrecision(3)} V/V is outside the usual 1 … 1000 V/V range of current-sense amplifiers. Change R_sh so a standard gain fits.`);
  if (s.side === 'low') notes.push('Low-side sensing: the load’s ground is lifted by I·R_sh, and a short from the load to ground bypasses the shunt (undetected).');
  else notes.push(`High-side sensing: the amplifier needs a common-mode range covering ${fV(s.vbus, 3)} (plus transients) and must tolerate the input going to 0 V when the load shorts.`);
  if (s.thetaR != null) notes.push('Self-heating is taken at I_max (worst case) for the TCR term at every current, since the shunt temperature follows the load history, not the present reading.');
  if (s.thetaR == null) notes.push('Self-heating is not included in the TCR term: enter θ_R (from the shunt’s datasheet) to add it.');
  notes.push(
    'Error terms are datasheet maxima referred to the reading. The worst case adds them all with the same sign; the RSS treats them as independent (TI SLAP178 method).',
    'Amplifier nonlinearity, noise, input bias current through the shunt, ADC INL/DNL and PCB copper in the sense path are not included.',
  );

  report.summary = `${fI(s.iMax, 3)} full scale · R_sh ${fR(s.r, 3)} · G ${s.g.toPrecision(3)} · ${s.bits}-bit ${fV(s.vfs, 3)} · ${s.side === 'high' ? 'high' : 'low'}-side`;
  report.details = { lsbI, clip, pMax, budget: eb, budgetFs: ebFs, solved: { r: s.r, iMax: s.iMax, g: s.g, iMeas: s.iMeas, code: s.code } };
  report.graphs = graphs(s, d, clip, lsbI);
  return report;
}

function budgetTable(eb: ErrorBudget, i: number): TableSpec {
  const rows = eb.terms.map((t) => ({ term: t.label, vin: t.vin ?? null, rel: t.rel * 100, share: eb.rss > 0 && Number.isFinite(eb.rss) ? ((t.rel * t.rel) / (eb.rss * eb.rss)) * 100 : null }));
  rows.push({ term: 'Worst case Σ|eᵢ|', vin: null, rel: eb.worst * 100, share: null });
  rows.push({ term: 'RSS √Σeᵢ²', vin: null, rel: eb.rss * 100, share: 100 });
  return {
    id: 'budget',
    title: `Error budget at ${fI(i, 3)}`,
    columns: [
      { key: 'term', label: 'Source', align: 'left' },
      { key: 'vin', label: 'Input-referred', unit: 'V' },
      { key: 'rel', label: 'Error', unit: '%' },
      { key: 'share', label: 'Share of RSS²', unit: '%' },
    ],
    rows,
    display: rows.map((r) => ({
      term: r.term,
      vin: r.vin != null ? fV(r.vin, 3) : '',
      rel: Number.isFinite(r.rel) ? `±${r.rel.toPrecision(3)} %` : '—',
      share: r.share != null ? `${r.share.toFixed(1)} %` : '',
    })),
    note: 'Voltage-type terms are divided by the shunt voltage I·Rsh, so they grow as the current falls. Share = eᵢ²/Σe² (how much each term contributes to the RSS).',
  };
}

function candidateTable(s: ShuntState, bidir: boolean, h: number): TableSpec | null {
  // E-series values around the exact shunt for the full-scale current at this gain (the sizing answer).
  const exact = shuntFor(s.iMax, s.g, s.vfs, bidir, h);
  if (!(exact > 0) || !Number.isFinite(exact)) return null;
  const vals = new Set<number>();
  let lo = exact;
  let hi = exact;
  for (let k = 0; k < 3; k++) {
    const [b] = bracketE(s.eseries, lo * (1 - 1e-6));
    const [, a] = bracketE(s.eseries, hi * (1 + 1e-6));
    vals.add(b).add(a);
    lo = b;
    hi = a;
  }
  const exactE = bracketE(s.eseries, exact);
  vals.add(exactE[0]).add(exactE[1]);
  const list = [...vals].filter((v) => v > 0 && Number.isFinite(v)).sort((a, b) => a - b);
  const rows = list.map((r) => {
    const d: ShuntDesign = { r, g: s.g, vfs: s.vfs, bits: s.bits, bidir };
    const clip = iClip(d);
    return { r, vsh: s.iMax * r, clip, use: s.iMax / clip, p: s.iMax * s.iMax * r, margin: s.pRated / (s.iMax * s.iMax * r), lsb: lsbCurrent(d) };
  });
  const tone = (x: (typeof rows)[number]): 'pass' | 'warn' | 'fail' =>
    x.clip < s.iMax * (1 - 1e-9) || x.p > s.pRated ? 'fail' : x.use > 1 - h / 2 || x.p > s.pRated / 2 || x.use < 0.5 ? 'warn' : 'pass';
  return {
    id: 'candidates',
    title: `${s.eseries} shunt values at G = ${s.g.toPrecision(3)}`,
    columns: [
      { key: 'r', label: 'Rsh', unit: 'Ω' },
      { key: 'vsh', label: 'Vsh at Imax', unit: 'V' },
      { key: 'clip', label: 'Clips at', unit: 'A' },
      { key: 'use', label: 'Span used', unit: '%' },
      { key: 'p', label: 'P at Imax', unit: 'W' },
      { key: 'margin', label: 'Power margin', unit: '×' },
      { key: 'lsb', label: 'A/LSB', unit: 'A' },
    ],
    rows: rows.map((x) => ({ ...x, use: x.use * 100 })),
    rowTones: rows.map(tone),
    display: rows.map((x) => ({
      r: fR(x.r, 3),
      vsh: fV(x.vsh, 3),
      clip: fI(x.clip, 4),
      use: `${(x.use * 100).toFixed(1)} %`,
      p: fP(x.p),
      margin: `${x.margin.toPrecision(3)}×`,
      lsb: fI(x.lsb, 3),
    })),
    note: `Red: clips below Imax or dissipates more than Prated (${fP(s.pRated)}). Yellow: less than half the headroom left (span used > ${(100 - s.headroom / 2).toFixed(1)} %), under 50 % of the span used, or above half the rated power. Green: fits.`,
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: ShuntState, d: ShuntDesign, clip: number, lsbI: number): GraphSpec[] {
  const bidir = d.bidir;
  const h = s.headroom / 100;
  // 1 — error vs current
  const iLo = s.iMax / 1000;
  const is = logspace(iLo, s.iMax, 161);
  const aM = Math.abs(s.iMeas);
  if (aM > iLo && aM < s.iMax) is.push(aM), is.sort((a, b) => a - b);
  const bud = is.map((i) => errorBudget(errInputs(s, i, d.r, lsbI)));
  const offsetOnly = bud.map((b) => Math.hypot(...b.terms.filter((t) => t.kind === 'offset').map((t) => t.rel)) * 100);
  const ebM = errorBudget(errInputs(s, s.iMeas, d.r, lsbI));
  const errGraph: GraphSpec = {
    id: 'error',
    title: 'Error vs current',
    x: { label: 'Measured current |I|', unit: 'A', log: true },
    y: [{ id: 'e', label: 'Error', unit: '%', log: true }],
    series: [
      { label: 'Worst case', x: is, y: bud.map((b) => b.worst * 100), axis: 'e', color: '#8b1e1e', width: 1.8 },
      { label: 'RSS', x: is, y: bud.map((b) => b.rss * 100), axis: 'e', color: '#1f4e5f', width: 2.2 },
      { label: 'Offset terms only', x: is, y: offsetOnly, axis: 'e', color: '#c47b17', width: 1.3, dash: [5, 3] },
    ],
    vlines: [{ value: s.iMax, label: `Imax ${fI(s.iMax, 3)}`, color: '#9a8f7a' }],
    markers: aM > iLo && aM <= s.iMax && Number.isFinite(ebM.rss) ? [{ x: aM, y: ebM.rss * 100, axis: 'e', label: `±${(ebM.rss * 100).toPrecision(3)} %` }] : [],
  };

  // 2 — transfer: amplifier output and ADC code vs current
  const xMax = Math.max(1.25 * s.iMax, 1.05 * clip);
  const xMin = bidir ? -xMax : 0;
  const n = 241;
  const xs = Array.from({ length: n }, (_, k) => xMin + ((xMax - xMin) * k) / (n - 1));
  const z = bidir ? d.vfs / 2 : 0;
  const vo = (i: number) => Math.min(Math.max(z + d.g * d.r * i, 0), d.vfs);
  const xfer: GraphSpec = {
    id: 'transfer',
    title: 'Transfer curve',
    x: { label: 'Current I', unit: 'A' },
    y: [
      { id: 'v', label: 'Amplifier output', unit: 'V', includeZero: true },
      { id: 'c', label: 'ADC code', unit: 'LSB', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'Vout (clipped at the span)', x: xs, y: xs.map(vo), axis: 'v', width: 2.2 },
      { label: 'ADC code', x: xs, y: xs.map((i) => Math.min(Math.max(Math.floor((vo(i) / d.vfs) * 2 ** d.bits), 0), 2 ** d.bits - 1)), axis: 'c', color: '#c47b17', width: 1.2, dash: [4, 3] },
    ],
    hlines: [{ value: d.vfs, label: `VFS ${fV(d.vfs, 3)}`, axis: 'v', color: '#8b1e1e', dash: [4, 4] }],
    vlines: [
      { value: s.iMax, label: 'Imax', color: '#9a8f7a' },
      ...(bidir ? [{ value: -s.iMax, label: '−Imax', color: '#9a8f7a' }] : []),
      { value: clip, label: 'clip', color: '#8b1e1e', dash: [4, 4] },
    ],
    markers: Math.abs(s.iMeas) <= xMax ? [{ x: s.iMeas, y: vo(s.iMeas), axis: 'v', label: fV(vo(s.iMeas), 3) }] : [],
  };

  // 3 — choice of R: dissipation vs low-current accuracy, gain rescaled to keep the same full scale
  const r0 = d.r;
  const rs = logspace(r0 / 30, r0 * 30, 121);
  const iRef = aM > 0 ? aM : s.iMax / 10;
  const trade: GraphSpec = {
    id: 'tradeoff',
    title: 'Choosing Rsh',
    subtitle: `Gain rescaled to keep Imax = ${fI(s.iMax, 3)} at ${(100 - s.headroom).toFixed(0)} % of the span`,
    x: { label: 'Shunt resistance Rsh', unit: 'Ω', log: true },
    y: [
      { id: 'p', label: 'Power at Imax', unit: 'W', log: true },
      { id: 'e', label: `RSS error at ${fI(iRef, 3)}`, unit: '%', side: 'right', log: true },
    ],
    series: [
      { label: 'Power at Imax', x: rs, y: rs.map((r) => s.iMax * s.iMax * r), axis: 'p', width: 2.2 },
      {
        label: `RSS error at ${fI(iRef, 3)}`,
        x: rs,
        y: rs.map((r) => {
          const g = gainFor(r, s.iMax, d.vfs, bidir, h);
          return errorBudget(errInputs(s, iRef, r, lsbCurrent({ ...d, r, g }))).rss * 100;
        }),
        axis: 'e',
        color: '#c47b17',
        width: 1.8,
      },
    ],
    hlines: [{ value: s.pRated, label: `Prated ${fP(s.pRated)}`, axis: 'p', color: '#8b1e1e', dash: [4, 4] }],
    vlines: [{ value: r0, label: `Rsh ${fR(r0, 3)}`, color: '#1f4e5f' }],
  };
  return [errGraph, xfer, trade];
}

/** Settable non-field keys (window.eeCalc / URL inputs): validate against the allowed values. */
const oneOf = <T extends string>(name: string, ok: readonly T[]) => (raw: unknown): T => {
  const v = String(raw) as T;
  if (!ok.includes(v)) throw new Error(`${name} must be one of ${ok.map((o) => JSON.stringify(o)).join(', ')}`);
  return v;
};

export const def: CalcDef<ShuntState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Shunt sizing G·R·I_max = (1 − h)·V_span with exact inverses for R, I_max and G; ADC code = (V_zero + G·R·I)/V_FS·2^N; error budget of datasheet maxima (offset, drift, CMRR, PSRR, gain, shunt tolerance and TCR, ½ LSB, reference) as worst-case sum and RSS following TI SLAP178 (Lis, 2019); P = I²R; IEC 60063 E-series candidates.',
  fields,
  defaults,
  solve: {
    default: 'r',
    analysis: 'iMax',
    options: [
      { key: 'r', label: 'R_sh for a full-scale current' },
      { key: 'iMax', label: 'Full-scale current of a shunt' },
      { key: 'gain', label: 'Gain for a shunt and range' },
    ],
  },
  compute,
  controls: { measForm: oneOf('measForm', ['current', 'code'] as const) },
  examples: [
    { id: 'default-5a', label: '5 A high-side, G = 50 into a 3.3 V 12-bit ADC (solve R_sh)', state: defaults() },
    {
      id: 'ti-slap178',
      label: 'TI SLAP178: 1 mΩ at 5 A, V_os 1 mV, CMRR & PSRR terms (ideal 24-bit ADC)',
      state: { solveFor: 'gain', r: 1e-3, iMax: 5, vfs: 3.3, bits: 24, dir: 'uni', headroom: 10, side: 'high', vbus: 50, measForm: 'current', iMeas: 5, tolR: 0, tcr: 0, temp: 25, thetaR: null, vos: 1e-3, vosDrift: 0, gainErr: 0, gainDrift: 0, cmrr: 100, vcmTest: 12, psrr: 100, vs: 30, vsTest: 5, refTol: 0, pRated: 1, eseries: 'E24' },
    },
    { id: 'motor-bidir', label: '±20 A motor phase, bidirectional, 0.5 mΩ Kelvin shunt (solve G)', state: { solveFor: 'gain', r: 0.5e-3, iMax: 20, vfs: 3.3, bits: 12, dir: 'bi', headroom: 10, side: 'high', vbus: 48, measForm: 'current', iMeas: 2, tolR: 1, tcr: 50, temp: 85, thetaR: 40, pRated: 3, eseries: 'E24' } },
    { id: 'battery-lowside', label: 'Battery gauge 2 A low-side, G = 100, 16-bit ADC, 10 mA reading', state: { solveFor: 'r', iMax: 2, g: 100, vfs: 2.048, bits: 16, dir: 'uni', headroom: 5, side: 'low', measForm: 'current', iMeas: 0.01, tolR: 0.5, tcr: 50, temp: 40, thetaR: null, vos: 10e-6, vosDrift: 0.05e-6, gainErr: 0, gainDrift: 0, cmrr: 120, vcmTest: 0, psrr: 100, vs: 3.3, vsTest: 3.3, refTol: 0.1, pRated: 1, eseries: 'E24' } },
    { id: 'reading', label: 'Convert an ADC reading of 1500 back to amperes', state: { ...defaults(), solveFor: 'iMax', r: 12e-3, measForm: 'code', code: 1500 } },
    { id: 'overload', label: 'Too much shunt: 30 A through 10 mΩ on a 1 W part', state: { ...defaults(), solveFor: 'gain', r: 10e-3, iMax: 30, iMeas: 3 } },
  ],
};
