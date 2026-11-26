/** LVDT sensitivity — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec, NumberField } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN, withDefault } from '@/core/unitsets';
import { MV_V_MIL, adcCode, demodGain, lvdtOut, lvdtSens, lvdtX } from './model';

export const ID = 'sensor/lvdt-sensitivity';

type Solve = 'vout' | 'x' | 'sens';

export interface LvdtState {
  solveFor: Solve;
  /** Sensitivity, V/V/m (numerically equal to mV/V/mm) */
  sens: number;
  sensUnit: string;
  /** Rated (linear) range, ± m */
  fs: number;
  fsUnit: string;
  /** Linearity error, % of full-range output */
  lin: number;
  /** Excitation, V rms */
  vex: number;
  /** Excitation frequency, Hz */
  fex: number;
  fexUnit: string;
  /** Core displacement from null, m (signed) */
  x: number;
  xUnit: string;
  /** Differential secondary output, V rms (signed: negative = antiphase) */
  vout: number;
  demod: 'avg' | 'rms';
  /** Demodulator reference phase error, degrees */
  phase: number;
  /** Gain after the demodulator, V/V */
  gain: number;
  bits: number;
  /** Bipolar ADC reference: input range ±vref */
  vref: number;
  /** Input-referred noise at the LVDT output in the measurement bandwidth, V rms */
  noise: number;
}

/** A general-purpose ±25 mm LVDT (mV/V/mm class of datasheets) on 3 V rms, 5 kHz, into a 16-bit ADC. */
export const defaults = (): LvdtState => ({
  solveFor: 'vout',
  sens: 4,
  sensUnit: '/mm',
  fs: 25e-3,
  fsUnit: 'mm',
  lin: 0.25,
  vex: 3,
  fex: 5e3,
  fexUnit: 'kHz',
  x: 10e-3,
  xUnit: 'mm',
  vout: 0.12,
  demod: 'avg',
  phase: 0,
  gain: 6,
  bits: 16,
  vref: 2.5,
  noise: 20e-6,
});

/** Sensitivity units, shown as “mV/V per …” (the label carries the mV/V so the dropdown stays short). */
export const U_SENS: Record<string, number> = { '/mm': 1, '/mil': MV_V_MIL, '/in': MV_V_MIL / 1000 };
/** Sensitivity unit key → its full name (“/mm” → “mV/V/mm”). Old saved keys fall back to /mm. */
export const sensUnitOf = (k: string) => (k in U_SENS ? k : '/mm');
const U_X = withDefault(U_LEN, 'mm');

// “Null” in the texts is the LVDT's electrical null (core centred, zero output), the standard term. The
// mode-switch harness's bad-text check (meant for a leaked JS null) flags the word: a false positive.
const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Sensor',
    note: 'Click ◎ to choose the unknown: the output, the displacement from a reading, or the sensitivity from a calibration point.',
    fields: [
      { kind: 'number', key: 'sens', symbol: 'S', label: 'Sens. (mV/V)', units: U_SENS, unitKey: 'sensUnit', unitFamily: 'none', solvable: true, min: 1e-4, max: 1e4, help: 'Sensitivity S in mV/V per mm, mil or inch: output (mV rms) per volt of excitation per unit of core travel. Long-stroke LVDTs are a few mV/V/mm; short-stroke gauging probes reach 100–200 mV/V/mm.' },
      { kind: 'number', key: 'fs', symbol: 'x_FS', label: 'Range (±)', units: U_X, unitKey: 'fsUnit', min: 1e-6, max: 2, help: 'Full-scale (linear) range from null: ±x_FS. The linearity error is specified over this range only.' },
      { kind: 'number', key: 'lin', symbol: 'ε_lin', label: 'Linearity', suffix: '% FS', min: 0, max: 20, help: 'Maximum deviation from the best straight line, in % of full-range output (typ. ±0.1 … ±0.5 %).' },
    ],
  },
  {
    kind: 'section',
    title: 'Excitation',
    fields: [
      { kind: 'number', key: 'vex', symbol: 'V_ex', label: 'Excitation', unit: 'V', min: 1e-3, max: 100, help: 'Primary drive voltage. The output is ratiometric, so drift in V_ex shows up directly unless the conditioner divides it out.' },
      { kind: 'number', key: 'fex', symbol: 'f_ex', label: 'Frequency', units: withDefault(U_FREQ, 'kHz'), unitKey: 'fexUnit', min: 10, max: 1e6, help: 'Carrier frequency. Sensitivity is specified at one frequency; core motion should stay below about f_ex/10.' },
    ],
  },
  {
    kind: 'section',
    title: 'Reading',
    fields: [
      { kind: 'number', key: 'x', symbol: 'x', label: 'Displacement', units: U_X, unitKey: 'xUnit', solvable: true, min: -2, max: 2, help: 'Core position from the electrical null; negative towards the second secondary (output in antiphase).' },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output', unit: 'V', solvable: true, min: -1000, max: 1000, help: 'Differential secondary voltage. Its sign stands for the phase: + in phase with the excitation, − in antiphase (core past null).' },
    ],
  },
  {
    kind: 'section',
    title: 'Conditioning & ADC',
    fields: [
      {
        kind: 'select', key: 'demod', label: 'Demodulator',
        options: [{ value: 'avg', label: 'Synchronous, averaging (0.900)' }, { value: 'rms', label: 'Scaled to rms (1.000)' }],
        help: 'A synchronous rectifier followed by a low-pass filter gives the average of the rectified sine: 2√2/π = 0.900 × V_rms. Some modules scale this to read rms.',
      },
      { kind: 'number', key: 'phase', symbol: 'Δφ', label: 'Phase error', suffix: '°', min: -89, max: 89, help: 'Phase between the LVDT output and the demodulator reference. The DC output scales with cos Δφ; datasheets list the LVDT’s phase lead so it can be compensated.' },
      { kind: 'number', key: 'gain', symbol: 'G', label: 'Gain', suffix: 'V/V', min: 1e-3, max: 1e6, help: 'DC gain between the demodulator and the ADC input.' },
      { kind: 'number', key: 'bits', symbol: 'N', label: 'ADC bits', suffix: 'bits', integer: true, min: 2, max: 32 },
      { kind: 'number', key: 'vref', symbol: 'V_ref', label: 'ADC range ±', unit: 'V', min: 1e-3, max: 100, help: 'Bipolar input range ±V_ref (a unipolar ADC with a mid-scale offset behaves the same).' },
      { kind: 'number', key: 'noise', symbol: 'v_n', label: 'Noise', unit: 'V', min: 0, max: 10, help: 'Input-referred rms noise of the conditioning, in the measurement bandwidth (after the demodulator filter), referred to the LVDT output.' },
    ],
  },
];

const fV = (v: number, d = 4) => si(v, 'V', d);
const fmm = (m: number, d = 4) => si(m, 'm', d);
const finite = (name: string, v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
};

export function compute(st: LvdtState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function fail(msg: string, s: LvdtState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function run(st: LvdtState): CalcReport {
  const s: LvdtState = { ...st };
  if (!['vout', 'x', 'sens'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  const fs = finite('Rated range', s.fs);
  const vex = finite('Excitation', s.vex);
  const fex = finite('Excitation frequency', s.fex);
  const lin = finite('Linearity error', s.lin) / 100;
  const phaseDeg = finite('Phase error', s.phase);
  const gain = finite('Gain', s.gain);
  const bits = Math.round(finite('ADC bits', s.bits));
  const vref = finite('ADC range', s.vref);
  const noise = finite('Noise', s.noise);
  if (!(fs > 0)) throw new Error('Rated range must be > 0.');
  if (!(vex > 0)) throw new Error('Excitation must be > 0 V.');
  if (!(fex > 0)) throw new Error('Excitation frequency must be > 0.');
  if (!(gain > 0)) throw new Error('Gain must be > 0.');
  if (!(vref > 0)) throw new Error('ADC range must be > 0 V.');
  if (bits < 2 || bits > 32) throw new Error('ADC resolution must be 2 … 32 bits.');
  if (lin < 0 || noise < 0) throw new Error('Linearity error and noise must be ≥ 0.');
  if (Math.abs(phaseDeg) >= 90) throw new Error('Phase error must be within ±90°: at 90° a synchronous demodulator outputs nothing.');

  switch (s.solveFor) {
    case 'vout': {
      const sens = finite('Sensitivity', s.sens);
      if (!(sens > 0)) throw new Error('Sensitivity must be > 0.');
      s.vout = lvdtOut(sens, vex, finite('Displacement', s.x));
      break;
    }
    case 'x': {
      const sens = finite('Sensitivity', s.sens);
      if (!(sens > 0)) throw new Error('Sensitivity must be > 0.');
      s.x = lvdtX(sens, vex, finite('Output', s.vout));
      break;
    }
    case 'sens': {
      const x = finite('Displacement', s.x);
      const vo = finite('Output', s.vout);
      if (x === 0) return fail('The calibration point is at null (x = 0): it carries no information about the sensitivity. Use a point near full scale.', s);
      if (vo === 0) return fail('The calibration reading is 0 V: a zero output carries no information about the sensitivity. Enter the output measured at that displacement.', s);
      const sens = lvdtSens(vex, x, vo);
      if (!(sens > 0)) return fail('Output and displacement have opposite signs: either the secondaries are swapped or the reading is in antiphase. Flip the sign of V_out.', s);
      s.sens = sens;
      break;
    }
  }
  const sens = s.sens;
  const x = s.x;
  const vout = s.vout;
  const phi = (phaseDeg * Math.PI) / 180;
  const kd = demodGain(s.demod === 'rms' ? 'rms' : 'avg', phi);
  const fso = sens * vex * fs;
  const vdc = kd * gain * vout;
  const adc = adcCode(vdc, vref, bits);
  const vdcFs = kd * gain * fso;
  const fill = vdcFs / vref;
  const gFull = vref / (kd * fso);
  const dxQ = adc.lsb / (kd * gain * sens * vex);
  const dxN = noise / (sens * vex);
  const dxRms = Math.hypot(dxN, dxQ / Math.sqrt(12));
  const linX = lin * fs;
  const pos = x / fs;
  const sensUnit = sensUnitOf(s.sensUnit);
  const sensText = (v: number) => `${(v / U_SENS[sensUnit]).toPrecision(4)} mV/V${sensUnit}`;

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const cards: Record<Solve, ResultItem> = {
    vout: item('vout', 'Output (rms)', vout, 'V', fV(vout), { symbol: 'V_out', note: vout === 0 ? 'at null' : vout > 0 ? 'in phase with V_ex' : 'antiphase (180°)' }),
    x: item('x', 'Core displacement', x, 'm', fmm(x), { symbol: 'x', note: `${(pos * 100).toFixed(2)} % of the ±${fmm(fs, 3)} range` }),
    sens: item('sens', 'Sensitivity', sens, 'V/V/m', sensText(sens), { symbol: 'S', note: `${si(sens * vex * 1e-3, 'V', 4)}/mm at ${fV(vex, 3)}` }),
  };
  const order: Solve[] = [s.solveFor, ...(['vout', 'x', 'sens'] as Solve[]).filter((k) => k !== s.solveFor)];
  const primary: ResultItem[] = [{ ...cards[s.solveFor], solved: true, primary: true }];
  if (s.solveFor !== 'vout') primary.push({ ...cards.vout, key: 'voutCheck', primary: true });
  primary.push(
    item('fso', 'Full-scale output', fso, 'V', `±${fV(fso)}`, { symbol: 'V_FS', primary: true, note: `at ±${fmm(fs, 3)}` }),
    item('resolution', 'Resolution (rms)', dxRms, 'm', fmm(dxRms, 3), { symbol: 'Δx', primary: true, note: `ADC ${fmm(dxQ, 3)}/LSB · noise ${fmm(dxN, 3)} rms` }),
    item('code', 'ADC code', adc.code, '', `${adc.code}`, { symbol: 'code', primary: true, note: `${hex(adc.code, bits)} · ${fV(vdc, 4)} DC`, tone: adc.clipped ? 'fail' : '' }),
  );
  const g = (name: string) => ({ group: name });
  const rest: ResultItem[] = [
    ...order.slice(1).filter((k) => k !== 'vout').map((k) => ({ ...cards[k], ...g('Sensor') })),
    item('sensPerMm', 'Output per mm', sens * vex * 1e-3, 'V/mm', `${si(sens * vex * 1e-3, 'V', 4)}/mm`, { symbol: 'S·V_ex', ...g('Sensor') }),
    item('sensMil', 'Sensitivity per mil', sens / MV_V_MIL, 'mV/V/mil', `${(sens / MV_V_MIL).toPrecision(4)} mV/V/mil`, { ...g('Sensor') }),
    item('position', 'Position in range', pos, '', `${(pos * 100).toFixed(2)} %`, { ...g('Sensor'), tone: Math.abs(pos) > 1 + 1e-12 ? 'fail' : '' }),
    item('linV', 'Linearity band', lin * fso, 'V', `±${fV(lin * fso, 3)}`, { symbol: 'ε·V_FS', ...g('Sensor') }),
    item('linX', 'Linearity band (position)', linX, 'm', `±${fmm(linX, 3)}`, { symbol: 'ε·x_FS', ...g('Sensor') }),
    item('kd', 'Demodulator gain', kd, '', `${kd.toFixed(4)} V DC / V rms`, { symbol: 'k_d', ...g('Demodulated & digitised'), note: Math.abs(phaseDeg) > 0 ? `includes cos ${phaseDeg}° = ${Math.cos(phi).toFixed(4)}` : s.demod === 'rms' ? 'rms-scaled' : '2√2/π' }),
    item('vdc', 'DC at the ADC', vdc, 'V', fV(vdc), { symbol: 'V_DC', ...g('Demodulated & digitised'), tone: adc.clipped ? 'fail' : '' }),
    item('vdcFs', 'DC at full scale', vdcFs, 'V', `±${fV(vdcFs)}`, { ...g('Demodulated & digitised'), tone: fill > 1 ? 'fail' : '' }),
    item('fill', 'ADC range used at ±FS', fill, '', `${(fill * 100).toFixed(1)} %`, { ...g('Demodulated & digitised'), tone: fill > 1 ? 'fail' : fill < 0.25 ? 'warn' : '' }),
    item('gainFull', 'Gain for full ADC range', gFull, '', `${gFull.toPrecision(4)} V/V`, { symbol: 'G_FS', ...g('Demodulated & digitised'), note: 'FS → ±V_ref exactly' }),
    item('lsb', 'LSB', adc.lsb, 'V', fV(adc.lsb, 3), { ...g('Demodulated & digitised') }),
    item('dxQ', 'ADC step', dxQ, 'm', `${fmm(dxQ, 3)}/LSB`, { symbol: 'Δx_q', ...g('Resolution') }),
    item('dxN', 'Noise-limited (rms)', dxN, 'm', fmm(dxN, 3), { symbol: 'Δx_n', ...g('Resolution'), note: noise > 0 ? `p-p ≈ 6.6× rms: ${fmm(6.6 * dxN, 3)}` : 'no noise given' }),
    item('dxRms', 'Combined (rms)', dxRms, 'm', fmm(dxRms, 3), { ...g('Resolution'), note: 'noise ⊕ quantisation LSB/√12' }),
    item('bwMax', 'Max core-motion bandwidth', fex / 10, 'Hz', `≈ ${si(fex / 10, 'Hz', 3)}`, { ...g('Resolution'), note: 'carrier ≥ 10 × signal frequency' }),
  ];
  report.results = [...primary, ...rest];

  // ── warnings
  if (Math.abs(x) > fs * (1 + 1e-12)) {
    warnings.push(
      s.solveFor === 'x'
        ? `The reading corresponds to ${fmm(x, 3)}, beyond the rated ±${fmm(fs, 3)}: outside the linear range the output bends over, so the true position is uncertain. Check the reading or use a longer-stroke LVDT.`
        : `The core is at ${(pos * 100).toFixed(0)} % of the rated range: beyond ±${fmm(fs, 3)} the output is no longer linear (the linearity spec does not apply). Keep the core inside the range or use a longer-stroke LVDT.`,
    );
  }
  if (fill > 1) warnings.push(`Full scale drives the ADC to ±${fV(vdcFs, 3)}, beyond ±${fV(vref, 3)}: the ends of the stroke clip. Lower the gain to ≤ ${gFull.toPrecision(3)} V/V.`);
  else if (fill < 0.25) warnings.push(`Full scale uses only ${(fill * 100).toFixed(0)} % of the ADC range, wasting ${Math.log2(1 / fill).toFixed(1)} bits. Raise the gain towards ${(0.9 * gFull).toPrecision(3)} V/V (90 % of range).`);
  if (1 - Math.cos(phi) > 0.01) warnings.push(`A ${Math.abs(phaseDeg)}° reference phase error costs ${((1 - Math.cos(phi)) * 100).toFixed(1)} % of the output and lets quadrature (null) voltage through. Compensate the LVDT’s phase lead with an RC network or calibrate the gain.`);
  if (s.solveFor === 'sens' && Math.abs(pos) < 0.1) warnings.push(`The calibration point is only ${(Math.abs(pos) * 100).toFixed(1)} % of full scale: the residual null voltage and noise weigh heavily there. Calibrate near full scale, or fit a line through several points.`);
  if (dxRms > linX && lin > 0) notes.push(`Resolution (${fmm(dxRms, 3)} rms) is coarser than the linearity band (±${fmm(linX, 3)}): the electronics, not the sensor, limit the accuracy.`);
  if (vex > 10 || vex < 0.5) notes.push(`Excitation ${fV(vex, 3)} is outside the 0.5–10 V rms most LVDTs are specified at: check the datasheet’s drive limits (primary current, heating).`);
  if (fex < 50 || fex > 20e3) notes.push(`Excitation at ${si(fex, 'Hz', 3)} is outside the 50 Hz – 20 kHz span most LVDTs are calibrated over: sensitivity and phase change with frequency.`);
  notes.push(
    'The output is taken as exactly proportional to x inside the rated range; the linearity error is a bound (± band), not a modelled curve.',
    'Ratiometric conditioners (AD598/AD698 style) divide by V_ex or by the secondary sum, so excitation drift cancels; a plain demodulator does not.',
  );

  report.summary = `${sensText(sens)} · ${fV(vex, 3)} at ${si(fex, 'Hz', 3)} · x ${fmm(x, 3)} → ${fV(vout, 4)} · ${bits}-bit ADC, ${fmm(dxRms, 3)} rms resolution`;
  report.details = { kd, fso, vdc, vdcFs, fill, gFull, lsb: adc.lsb, code: adc.code, clipped: adc.clipped, dxQ, dxN, dxRms, linX, pos, sens, x, vout };
  report.graphs = graphs(s, sens, vex, fs, lin, kd, gain, vref, dxRms);
  const outside = solvedOutOfRange(fields, report.results);
  if (outside) return { ...emptyReport(ID), ok: false, error: outside, solveFor: s.solveFor, status: { text: 'OUT OF RANGE', tone: 'fail' } };
  return report;
}

function hex(code: number, bits: number): string {
  const n = code < 0 ? 2 ** bits + code : code;
  return `0x${n.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0')}`;
}

function graphs(s: LvdtState, sens: number, vex: number, fs: number, lin: number, kd: number, gain: number, vref: number, dxRms: number): GraphSpec[] {
  const ext = Math.max(1.5 * fs, Math.abs(s.x) * 1.1);
  const n = 241;
  const xs = Array.from({ length: n }, (_, i) => -ext + (2 * ext * i) / (n - 1));
  const mm = (m: number) => m * 1e3;
  const inside = xs.filter((x) => Math.abs(x) <= fs);
  const inX = [-fs, ...inside, fs];
  const out: GraphSpec = {
    id: 'output-vs-x',
    title: 'Output vs displacement',
    subtitle: `Rated range ±${fmm(fs, 3)}; dashed: extrapolated beyond the rated range (real LVDTs bend over)`,
    legend: 'below',
    x: { label: 'Core displacement', unit: 'mm' },
    y: [{ id: 'v', label: 'Output (signed rms)', unit: 'V' }],
    series: [
      // one dashed line over the whole span; inside the range the solid trace covers it
      { label: 'Extrapolated (not rated)', x: xs.map(mm), y: xs.map((x) => lvdtOut(sens, vex, x)), axis: 'v', color: '#9a8f7a', width: 1.4, dash: [3, 4], noReadout: true },
      { label: 'V_out (linear range)', x: inX.map(mm), y: inX.map((x) => lvdtOut(sens, vex, x)), axis: 'v', width: 2.2 },
    ],
    vlines: [
      { value: mm(-fs), label: `−x_FS`, color: '#8b1e1e', dash: [5, 4] },
      { value: mm(fs), label: `+x_FS`, color: '#8b1e1e', dash: [5, 4] },
    ],
    markers: [{ x: mm(s.x), y: s.vout, axis: 'v', label: fV(s.vout, 3) }],
  };
  const acMax = 1.05 * Math.max(...xs.map((x) => Math.abs(lvdtOut(sens, vex, x))));
  const dcMax = 1.05 * Math.max(vref, kd * gain * acMax / 1.05);
  const demod: GraphSpec = {
    id: 'demodulation',
    title: 'Why phase-sensitive',
    subtitle: 'An AC voltmeter reads |V_out| (no direction); the synchronous demodulator keeps the sign',
    legend: 'below',
    x: { label: 'Core displacement', unit: 'mm' },
    y: [
      // both axes symmetric about zero so null lines up on the two scales
      { id: 'ac', label: '|V_out| (AC magnitude)', unit: 'V', min: -acMax, max: acMax },
      { id: 'dc', label: 'Demodulated DC at ADC', unit: 'V', side: 'right', min: -dcMax, max: dcMax },
    ],
    series: [
      { label: '|V_out| rms', x: xs.map(mm), y: xs.map((x) => Math.abs(lvdtOut(sens, vex, x))), axis: 'ac', color: '#9a8f7a', width: 1.8 },
      { label: 'DC out (signed)', x: xs.map(mm), y: xs.map((x) => kd * gain * lvdtOut(sens, vex, x)), axis: 'dc', width: 2.2 },
    ],
    hlines: [
      { value: vref, label: '+V_ref', axis: 'dc', color: '#8b1e1e', dash: [5, 4] },
      { value: -vref, label: '−V_ref', axis: 'dc', color: '#8b1e1e', dash: [5, 4] },
    ],
    vlines: [{ value: mm(s.x), label: `x = ${fmm(s.x, 3)}`, color: '#1f4e5f' }],
  };
  // 3 — error budget over the stroke: the ± linearity band and 3σ resolution are fixed in position, so the
  // error relative to the reading grows towards null
  const n3 = 121;
  const xe = Array.from({ length: n3 }, (_, i) => fs * 10 ** (-2 + (2 * i) / (n3 - 1)));
  const linX = lin * fs;
  const res3 = 3 * dxRms;
  const errGraph: GraphSpec = {
    id: 'error-budget',
    title: 'Error vs position',
    subtitle: `Worst case ±(linearity ${(lin * 100).toPrecision(2)} % FS + 3σ resolution), absolute and as % of the reading`,
    x: { label: 'Core displacement from null', unit: 'mm', log: true },
    y: [
      { id: 'abs', label: 'Error bound (±)', unit: 'm', includeZero: true },
      { id: 'rel', label: 'Error bound / reading', unit: '%', side: 'right', log: true },
    ],
    series: [
      { label: 'Linearity ±ε·x_FS', x: xe.map(mm), y: xe.map(() => linX), axis: 'abs', color: '#c47b17', width: 1.6 },
      { label: 'Resolution 3σ', x: xe.map(mm), y: xe.map(() => res3), axis: 'abs', color: '#4f8a8b', width: 1.6, dash: [5, 3] },
      { label: 'Sum (absolute)', x: xe.map(mm), y: xe.map(() => linX + res3), axis: 'abs', width: 2.2 },
      ...(linX + res3 > 0 ? [{ label: 'Sum, % of reading', x: xe.map(mm), y: xe.map((x) => (100 * (linX + res3)) / x), axis: 'rel', color: '#8b1e1e', width: 1.8 }] : []),
    ],
    vlines: [{ value: mm(Math.abs(s.x)) || mm(fs), label: Math.abs(s.x) > 0 ? `|x| = ${fmm(Math.abs(s.x), 3)}` : 'x_FS', color: '#1f4e5f' }],
    legend: 'below',
  };
  return [out, demod, errGraph];
}

/**
 * A solved value is written back into its input box, so it must respect that field's min/max.
 * Returns a message naming the first solved result outside its field's range, or null.
 */
function solvedOutOfRange(spec: FieldSpec[], results: ResultItem[]): string | null {
  const find = (fs: FieldSpec[], key: string): NumberField | null => {
    for (const f of fs) {
      if (f.kind === 'number' && f.key === key) return f;
      if (f.kind === 'section' || f.kind === 'group') {
        const hit = find(f.fields, key);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const r of results) {
    if (!r.solved || typeof r.value !== 'number') continue;
    const f = find(spec, r.key);
    if (!f) continue;
    const tol = (x: number) => 1e-9 * Math.max(Math.abs(x), 1e-30);
    const lo = f.min ?? -Infinity;
    const hi = f.max ?? Infinity;
    if (!Number.isFinite(r.value) || r.value < lo - tol(lo) || r.value > hi + tol(hi)) {
      const shown = r.display.trim();
      return `The computed ${f.symbol ?? f.label} = ${shown} is outside the range its input accepts (${fmtLim(f, lo)} … ${fmtLim(f, hi)}), so it is not a usable design. Change the target or the other inputs.`;
    }
  }
  return null;
}
function fmtLim(f: NumberField, v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  // sensitivity: its SI value (V/V/m) equals mV/V/mm, the unit the limits are set in
  if (f.key === 'sens') return `${Number(v.toPrecision(3))} mV/V/mm`;
  if (f.units) {
    const [u, k] = Object.entries(f.units)[0];
    return `${Number((v / k).toPrecision(3))} ${u}`;
  }
  if (f.unit) return si(v, f.unit, 3).replace('-', '−');
  return `${Number(v.toPrecision(3))}${f.suffix ? ` ${f.suffix}` : ''}`.replace('-', '−');
}

export const def: CalcDef<LvdtState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Ratiometric LVDT transfer V_out = S·V_ex·x inside the rated range (Schaevitz 1947; TE/Measurement Specialties E-series datasheet units mV/V/mil), linearity as ± % of full-range output; synchronous averaging demodulation 2√2/π·cos Δφ (Pallás-Areny & Webster, Sensors and Signal Conditioning §3.5); bipolar N-bit ADC, LSB = 2V_ref/2^N, resolution = noise ⊕ LSB/√12 referred to displacement.',
  fields,
  defaults,
  solve: {
    default: 'vout',
    analysis: 'vout',
    options: [
      { key: 'vout', label: 'Output for a displacement' },
      { key: 'x', label: 'Displacement from a reading' },
      { key: 'sens', label: 'Sensitivity from a calibration point' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '±25 mm LVDT, 4 mV/V/mm on 3 V, 16-bit ADC', state: defaults() },
    { id: 'probe-192', label: 'Gauging probe 192 mV/V/mm on 5 V: 1 mm → 960 mV (Azimi, Quality 2025)', state: { solveFor: 'vout', sens: 192, sensUnit: '/mm', fs: 2e-3, fsUnit: 'mm', lin: 0.3, vex: 5, fex: 13e3, x: 1e-3, demod: 'avg', phase: 0, gain: 0.5, bits: 16, vref: 2.5, noise: 20e-6 } },
    { id: 'e100', label: 'MEAS E-100: 2.4 mV/V/mil, ±0.1 in, 3 V — full-scale output', state: { solveFor: 'vout', sens: 2.4 * MV_V_MIL, sensUnit: '/mil', fs: 2.54e-3, fsUnit: 'in', lin: 0.5, vex: 3, fex: 2.5e3, x: 2.54e-3, xUnit: 'in', demod: 'avg', phase: 0, gain: 3, bits: 12, vref: 2.5, noise: 50e-6 } },
    { id: 'read-x', label: 'Position from a reading of −85 mV (solve x)', state: { ...defaults(), solveFor: 'x', vout: -0.085 } },
    { id: 'calibrate', label: 'Calibrate: 20 mm gave 241 mV on 3 V (solve S)', state: { ...defaults(), solveFor: 'sens', x: 20e-3, vout: 0.241 } },
    { id: 'clipping', label: 'Too much gain and 15° phase error (warnings)', state: { ...defaults(), gain: 12, phase: 15 } },
  ],
};
