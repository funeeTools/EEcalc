/** Audio power amplifier gain — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { nearestE } from '@/core/eseries';
import type { FieldSpec, NumberField } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { CF_SINE_DB, type Supply, type Topology, ampPoint, dbuToV, dbvToV, maxCleanPower, maxDissipation, powerAt, rails, spanFromRail, supplyPower, vToDbu, vToDbv } from './model';

export const ID = 'audio/power-amplifier-gain';

type Solve = 'gain' | 'pout' | 'vin';
type VinAs = 'v' | 'dbu' | 'dbv';
type GainAs = 'vv' | 'db';

export interface AmpState {
  solveFor: Solve;
  /** Rated continuous (sine) output power, W */
  pout: number;
  /** Nominal load impedance, Ω */
  rl: number;
  topology: Topology;
  /** Which form of the input sensitivity is typed */
  vinAs: VinAs;
  vin: number;
  vinDbu: number;
  vinDbv: number;
  /** Which form of the voltage gain is typed */
  gainAs: GainAs;
  gain: number;
  gainDb: number;
  supply: Supply;
  /** Output-stage dropout (rail minus clip level at I_pk), V */
  vdrop: number;
  /** Supply regulation: no-load rise above the loaded rail, % */
  reg: number;
  /** High-line mains allowance, % */
  highLine: number;
  /** Available loaded rail (±V or Vcc, as the supply type); null = not given */
  vsup: number | null;
  /** Programme crest factor (peak/rms), dB */
  cf: number;
  /** Feedback resistor of the (master) non-inverting stage, Ω */
  rf: number;
  rfUnit: string;
  eseries: string;
}

/** 100 W into 8 Ω from a +4 dBu (1.228 V) line input: a common pro/hi-fi rating. */
export const defaults = (): AmpState => ({
  solveFor: 'gain',
  pout: 100,
  rl: 8,
  topology: 'se',
  vinAs: 'dbu',
  vin: dbuToV(4),
  vinDbu: 4,
  vinDbv: vToDbv(dbuToV(4)),
  gainAs: 'db',
  gain: 23.03,
  gainDb: 27.25,
  supply: 'split',
  vdrop: 4,
  reg: 15,
  highLine: 10,
  vsup: null,
  cf: 18,
  rf: 22e3,
  rfUnit: 'kΩ',
  eseries: 'E24',
});

const vinSolved = (form: VinAs) => (_s: any, root: any) => root.solveFor === 'vin' || root.vinAs !== form;
const gainSolved = (form: GainAs) => (_s: any, root: any) => root.solveFor === 'gain' || root.gainAs !== form;
const vinField = (key: string, form: VinAs, extra: Omit<NumberField, 'kind' | 'key'>): NumberField => ({
  kind: 'number',
  key,
  solvable: true,
  solvedWhen: vinSolved(form),
  onSolve: (_s: any, root: any) => {
    root.solveFor = 'vin';
  },
  onUnsolve: (_s: any, root: any) => {
    if (root.solveFor === 'vin') root.solveFor = 'gain';
    root.vinAs = form;
  },
  ...extra,
});
const gainField = (key: string, form: GainAs, extra: Omit<NumberField, 'kind' | 'key'>): NumberField => ({
  kind: 'number',
  key,
  solvable: true,
  solvedWhen: gainSolved(form),
  onSolve: (_s: any, root: any) => {
    root.solveFor = 'gain';
  },
  onUnsolve: (_s: any, root: any) => {
    if (root.solveFor === 'gain') root.solveFor = 'vin';
    root.gainAs = form;
  },
  ...extra,
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Output',
    note: 'Click ◎ to choose the unknown. Power is the continuous sine rating into the nominal load.',
    fields: [
      { kind: 'number', key: 'pout', symbol: 'P_out', label: 'Rated power', unit: 'W', solvable: true, min: 1e-3, max: 1e5, help: 'Continuous (sine-wave) output power at the onset of clipping, as in a datasheet rating at 1 kHz.' },
      { kind: 'number', key: 'rl', symbol: 'R_L', label: 'Load', units: withDefault(U_OHM, 'Ω'), unitKey: 'rlUnit', min: 0.5, max: 1e4, help: 'Nominal (rated) speaker impedance. Treated as a resistor; real speakers dip to about 0.8 × nominal (IEC 60268-5).' },
      {
        kind: 'select', key: 'topology', label: 'Topology',
        options: [{ value: 'se', label: 'Single-ended' }, { value: 'btl', label: 'Bridge-tied load (BTL)' }],
        help: 'BTL drives the speaker from two amplifiers in antiphase: twice the voltage swing from the same rails, but each half sees half the load impedance.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Input sensitivity & gain',
    note: 'Type the sensitivity in any one form (V, dBu or dBV); the others follow. The same for the gain.',
    fields: [
      vinField('vin', 'v', { symbol: 'V_in', label: 'Sensitivity', unit: 'V', min: 1e-6, max: 1000, help: 'Input level (rms) that drives the amplifier to its rated power.' }),
      // dBu and dBV limits are the 1 µV … 1 kV range converted, not round numbers: a value typed as the
      // rounded limit (−117.782 dBu) is just outside it and is refused as typed (harness display-mismatch).
      vinField('vinDbu', 'dbu', { symbol: 'V_in', label: 'Sensitivity', suffix: 'dBu', min: vToDbu(1e-6), max: vToDbu(1000), help: 'dBu: re 0.7746 V (1 mW in 600 Ω). +4 dBu = 1.228 V is professional line level.' }),
      vinField('vinDbv', 'dbv', { symbol: 'V_in', label: 'Sensitivity', suffix: 'dBV', min: -120, max: 60, help: 'dBV: re 1 V. −10 dBV = 0.316 V is consumer line level.' }),
      gainField('gain', 'vv', { symbol: 'A_v', label: 'Gain', suffix: 'V/V', min: 1e-3, max: 1e6, help: 'Overall voltage gain from the input to the speaker terminals (both halves together for BTL).' }),
      gainField('gainDb', 'db', { symbol: 'A_v', label: 'Gain', suffix: 'dB', min: -60, max: 120, help: '20·log₁₀(A_v). Power amplifiers are usually 26–32 dB.' }),
    ],
  },
  {
    kind: 'section',
    title: 'Supply',
    fields: [
      { kind: 'select', key: 'supply', label: 'Supply', options: [{ value: 'split', label: 'Split rails (±V)' }, { value: 'single', label: 'Single supply (+V)' }], help: 'Single-supply single-ended amplifiers idle at Vcc/2 and need an output coupling capacitor.' },
      { kind: 'number', key: 'vdrop', symbol: 'V_od', label: 'Dropout', unit: 'V', min: 0, max: 50, help: 'Rail voltage minus the clip level at peak current (datasheet “output dropout” or saturation voltage). LM3886: about 4 V; discrete MOSFET stages 3–6 V; class-D bridges a few tenths of a volt.' },
      { kind: 'number', key: 'reg', symbol: 'reg', label: 'Regulation', suffix: '%', min: 0, max: 100, help: 'How far an unregulated supply rises when unloaded (transformer + rectifier: 10–20 %). Sets the idle rail the parts must withstand.' },
      { kind: 'number', key: 'highLine', symbol: 'HL', label: 'High line', suffix: '%', min: 0, max: 50, help: 'Mains over-voltage allowance; 10 % is usual.' },
      { kind: 'number', key: 'vsup', symbol: 'V_S', label: 'Available rail', unit: 'V', optional: true, zeroHint: 'not given', min: 0.1, max: 1000, help: 'Optional: the rail you actually have, under load (±V for split rails, Vcc for a single supply). The page then checks the rated power against the clip level it allows.' },
    ],
  },
  {
    kind: 'section',
    title: 'Programme & parts',
    fields: [
      { kind: 'number', key: 'cf', symbol: 'CF', label: 'Crest factor', suffix: 'dB', min: 0, max: 40, help: 'Peak-to-rms ratio of the signal. Sine 3.01 dB; heavily compressed music about 8–12 dB; dynamic acoustic music 15–20 dB. Sets the average power available before the peaks clip.' },
      { kind: 'number', key: 'rf', symbol: 'R_f', label: 'Feedback R', units: withDefault(U_OHM, 'kΩ'), unitKey: 'rfUnit', min: 100, max: 10e6, help: 'Top resistor of the non-inverting gain network (10–100 kΩ is usual). R_g follows from the gain.' },
      { kind: 'select', key: 'eseries', label: 'R_g series', options: ['E12', 'E24', 'E96'] },
    ],
  },
];

const fV = (v: number, d = 4) => si(v, 'V', d);
const fW = (p: number, d = 4) => si(p, 'W', d);
const fA = (i: number) => si(i, 'A', 3);
const fR = (r: number, d = 3) => si(r, 'Ω', d);
const fDb = (x: number, d = 2, u = 'dB') => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)} ${u}`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

const TOPO: Record<Topology, string> = { se: 'single-ended', btl: 'bridge (BTL)' };

export function compute(st: AmpState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: AmpState): CalcReport {
  const s: AmpState = { ...st };
  if (!['gain', 'pout', 'vin'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  const r = finite('Load impedance', s.rl);
  if (!(r > 0)) throw new Error('Load impedance must be > 0.');
  const topo: Topology = s.topology === 'btl' ? 'btl' : 'se';
  const sup: Supply = s.supply === 'single' ? 'single' : 'split';
  const vdrop = finite('Dropout', s.vdrop);
  const reg = finite('Regulation', s.reg) / 100;
  const hl = finite('High-line allowance', s.highLine) / 100;
  const cfDb = finite('Crest factor', s.cf);
  const rf = finite('R_f', s.rf);
  if (vdrop < 0 || reg < 0 || hl < 0 || cfDb < 0) throw new Error('Dropout, regulation, high line and crest factor must be ≥ 0.');
  if (!(rf > 0)) throw new Error('R_f must be > 0.');

  // ── read the typed forms
  const vinIn = () => {
    const v = s.vinAs === 'dbu' ? dbuToV(finite('Sensitivity (dBu)', s.vinDbu)) : s.vinAs === 'dbv' ? dbvToV(finite('Sensitivity (dBV)', s.vinDbv)) : finite('Sensitivity', s.vin);
    if (!(v > 0)) throw new Error('Input sensitivity must be > 0 V.');
    return v;
  };
  const gainIn = () => {
    const a = s.gainAs === 'db' ? 10 ** (finite('Gain (dB)', s.gainDb) / 20) : finite('Gain', s.gain);
    if (!(a > 0)) throw new Error('Voltage gain must be > 0.');
    return a;
  };

  // ── solve (closed-form inverses of V_out = A·V_in, P = V_out²/R; exact round trip)
  let vin: number;
  let a: number;
  let p: number;
  if (s.solveFor === 'gain') {
    p = finite('Output power', s.pout);
    vin = vinIn();
    if (!(p > 0)) throw new Error('Output power must be > 0.');
    a = Math.sqrt(p * r) / vin;
  } else if (s.solveFor === 'vin') {
    p = finite('Output power', s.pout);
    a = gainIn();
    if (!(p > 0)) throw new Error('Output power must be > 0.');
    vin = Math.sqrt(p * r) / a;
  } else {
    vin = vinIn();
    a = gainIn();
    const vo = a * vin;
    p = (vo * vo) / r;
  }
  s.pout = p;
  s.vin = vin;
  s.vinDbu = vToDbu(vin);
  s.vinDbv = vToDbv(vin);
  s.gain = a;
  s.gainDb = 20 * Math.log10(a);

  const op = ampPoint(p, r, vin);
  const rl = rails(op.vpk, vdrop, topo, sup);
  const railIdle = rl.rail * (1 + reg);
  const railMax = railIdle * (1 + hl);
  const spanMax = rl.span * (1 + reg) * (1 + hl);
  const railText = (v: number) => (sup === 'split' ? `±${fV(v, 3)}` : fV(v, 3));
  const vsup = s.vsup == null ? null : finite('Available rail', s.vsup);
  if (vsup != null && !(vsup > 0)) throw new Error('Available rail must be > 0 V (leave it blank if not given).');
  const avail = vsup != null ? maxCleanPower(vsup, vdrop, r, topo, sup) : null;
  // Supply-side figures use the rails actually present: the available rail when given (driven up to the
  // smaller of the rated swing and its clip level), otherwise the required loaded rails.
  const spanUsed = vsup != null ? spanFromRail(vsup, sup) : rl.span;
  const vpUsed = avail ? Math.min(op.vpk, Math.max(avail.vpk, 0)) : op.vpk;
  const pUsed = (vpUsed * vpUsed) / (2 * r);
  const railsUsed = vsup != null ? `available ${railText(vsup)}` : `required ${railText(rl.rail)}`;
  const ps = supplyPower(vpUsed, r, spanUsed, topo);
  // worst case over every drive level the rails allow (0 … clip), not just up to the rated power:
  // turning the volume up on generous rails reaches the class-B maximum 2V²/(π²R)
  const vpClip = avail ? Math.max(avail.vpk, 0) : op.vpk;
  const pdMax = maxDissipation(r, spanUsed, topo, vpClip);
  const eta = ps > 0 ? pUsed / ps : 0;
  const atRated = vpUsed >= op.vpk * (1 - 1e-12);
  const cfLin = 10 ** (cfDb / 20);
  const pProg = (op.vpk * op.vpk) / (cfLin * cfLin * r);
  const vinProg = op.vpk / (cfLin * a);
  const ipkMin = op.ipk / 0.8;
  const aHalf = topo === 'btl' ? a / 2 : a;
  const rgExact = aHalf > 1 ? rf / (aHalf - 1) : null;
  const rgStd = rgExact != null ? nearestE(rgExact, s.eseries) : null;
  const aHalfStd = rgStd != null ? 1 + rf / rgStd : null;
  const aStd = aHalfStd != null ? (topo === 'btl' ? 2 * aHalfStd : aHalfStd) : null;

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  // ── headline: the solved unknown first
  // Each headline card is keyed by the form the user types (V/V or dB, V or dBu or dBV); the other forms
  // follow in "Operating point" and are flagged solved so they are written back into their (green) inputs.
  const gainForms: Record<GainAs, ResultItem> = {
    vv: item('gain', 'Voltage gain', a, '', `${a.toPrecision(4)} V/V`, { symbol: 'A_v', note: fDb(s.gainDb) }),
    db: item('gainDb', 'Voltage gain', s.gainDb, 'dB', fDb(s.gainDb), { symbol: 'A_v', note: `${a.toPrecision(4)} V/V` }),
  };
  const vinForms: Record<VinAs, ResultItem> = {
    v: item('vin', 'Input sensitivity', vin, 'V', `${fV(vin, 4)} rms`, { symbol: 'V_in', note: `${fDb(s.vinDbu, 2, 'dBu')} · ${fDb(s.vinDbv, 2, 'dBV')}` }),
    dbu: item('vinDbu', 'Input sensitivity', s.vinDbu, 'dBu', fDb(s.vinDbu, 2, 'dBu'), { symbol: 'V_in', note: `${fV(vin, 4)} rms · ${fDb(s.vinDbv, 2, 'dBV')}` }),
    dbv: item('vinDbv', 'Input sensitivity', s.vinDbv, 'dBV', fDb(s.vinDbv, 2, 'dBV'), { symbol: 'V_in', note: `${fV(vin, 4)} rms · ${fDb(s.vinDbu, 2, 'dBu')}` }),
  };
  const gainAs: GainAs = s.gainAs === 'vv' ? 'vv' : 'db';
  const vinAs: VinAs = s.vinAs === 'v' || s.vinAs === 'dbv' ? s.vinAs : 'dbu';
  if (topo === 'btl') gainForms[gainAs].note += ` · ${aHalf.toPrecision(3)} V/V per half`;
  const cards: Record<Solve, ResultItem> = {
    gain: gainForms[gainAs],
    pout: item('pout', 'Output power', p, 'W', fW(p), { symbol: 'P_out', note: `${fV(op.vout, 4)} rms into ${fR(r)}` }),
    vin: vinForms[vinAs],
  };
  const order: Solve[] = [s.solveFor, ...(['gain', 'pout', 'vin'] as Solve[]).filter((k) => k !== s.solveFor)];
  const primary: ResultItem[] = order.map((k, i) => ({ ...cards[k], primary: i === 0 || k === 'gain', solved: i === 0, group: i === 0 || k === 'gain' ? undefined : 'Operating point' }));
  primary.push(item('rail', `Supply rail${sup === 'split' ? 's' : ''} (loaded)`, rl.rail, 'V', railText(rl.rail), { symbol: sup === 'split' ? '±V_S' : 'V_CC', primary: true, note: `idle ${railText(railIdle)} · high line ${railText(railMax)}` }));
  primary.push(item('ipk', 'Peak output current', op.ipk, 'A', fA(op.ipk), { symbol: 'I_pk', primary: true, note: `${fA(ipkMin)} at 0.8·R_L (impedance minimum)` }));

  const g = (name: string) => ({ group: name });
  const rest: ResultItem[] = [
    item('vout', 'Output voltage (rms)', op.vout, 'V', fV(op.vout, 4), { symbol: 'V_out', ...g('Operating point') }),
    item('vpk', 'Peak output voltage', op.vpk, 'V', fV(op.vpk, 4), { symbol: 'V_pk', ...g('Operating point'), note: topo === 'btl' ? `${fV(op.vpk / 2, 4)} from each half` : 'across the load' }),
    item('pdbw', 'Output power (dBW)', 10 * Math.log10(p), 'dBW', fDb(10 * Math.log10(p), 2, 'dBW'), { ...g('Operating point') }),
  ];
  for (const f of ['vv', 'db'] as GainAs[]) if (f !== gainAs) rest.push({ ...gainForms[f], label: f === 'db' ? 'Voltage gain (dB)' : 'Voltage gain (V/V)', ...g('Operating point'), solved: true });
  for (const f of ['v', 'dbu', 'dbv'] as VinAs[]) if (f !== vinAs) rest.push({ ...vinForms[f], label: { v: 'Sensitivity (V rms)', dbu: 'Sensitivity in dBu', dbv: 'Sensitivity in dBV' }[f], ...g('Operating point'), solved: true });

  rest.push(
    item('railIdle', 'Rail, unloaded', railIdle, 'V', railText(railIdle), { ...g('Supply'), note: `+${(reg * 100).toFixed(0)} % regulation` }),
    item('railMax', 'Rail, unloaded at high line', railMax, 'V', railText(railMax), { ...g('Supply'), note: 'what capacitors and the amplifier must withstand' }),
    item('span', 'Total supply span (high line)', spanMax, 'V', fV(spanMax, 3), { ...g('Supply'), note: 'lowest to highest rail' }),
    item('ps', atRated ? 'Supply power at rated output' : 'Supply power at clip', ps, 'W', fW(ps, 3), { ...g('Supply'), note: `ideal class B, ${railsUsed} rails${atRated ? '' : `, ${fW(pUsed, 3)} out`}` }),
    item('eta', atRated ? 'Efficiency at rated output' : 'Efficiency at clip', eta, '', `${(eta * 100).toFixed(1)} %`, { symbol: 'η', ...g('Supply'), note: 'class-B limit π/4 = 78.5 % at full swing' }),
    item('pdRated', atRated ? 'Dissipation at rated output' : 'Dissipation at clip', ps - pUsed, 'W', fW(ps - pUsed, 3), { symbol: 'P_D', ...g('Supply') }),
    item('pdMax', 'Worst-case dissipation', pdMax.pd, 'W', fW(pdMax.pd, 3), { symbol: 'P_D,max', ...g('Supply'), note: `at ${fW((pdMax.vpAt * pdMax.vpAt) / (2 * r), 3)} output (any level up to clipping), ${railsUsed} rails` }),
  );
  rest.push(
    item('cfLin', 'Crest factor', cfLin, '', `${cfLin.toFixed(2)} (${fDb(cfDb, 1)})`, { symbol: 'CF', ...g('Programme headroom') }),
    item('pProg', 'Average programme power at clip', pProg, 'W', fW(pProg, 3), { ...g('Programme headroom'), note: `peaks just reach ${fV(op.vpk, 3)}` }),
    item('vinProg', 'Programme input at clip (rms)', vinProg, 'V', `${fV(vinProg, 3)} (${fDb(vToDbu(vinProg), 1, 'dBu')})`, { ...g('Programme headroom') }),
    item('headroom', 'Headroom above sine rating', cfDb - CF_SINE_DB, 'dB', fDb(cfDb - CF_SINE_DB, 1), { ...g('Programme headroom'), note: 'programme rms below the sine sensitivity' }),
  );
  const gGroup = topo === 'btl' ? 'Gain network (master half)' : 'Gain network';
  rest.push(item('aHalf', topo === 'btl' ? 'Gain per half' : 'Gain of the stage', aHalf, '', `${aHalf.toPrecision(4)} V/V`, { ...g(gGroup), note: topo === 'btl' ? 'slave half inverts at −1' : 'non-inverting' }));
  if (rgExact != null && rgStd != null && aStd != null) {
    rest.push(
      item('rg', 'R_g, exact', rgExact, 'Ω', fR(rgExact, 4), { symbol: 'R_g', ...g(gGroup), note: `R_f/(A − 1), R_f = ${fR(rf)}` }),
      item('rgStd', `R_g, nearest ${s.eseries}`, rgStd, 'Ω', fR(rgStd), { symbol: 'R_g', ...g(gGroup) }),
      item('gainStd', 'Gain with that R_g', aStd, '', `${aStd.toPrecision(4)} V/V (${fDb(20 * Math.log10(aStd))})`, { ...g(gGroup), note: `sensitivity ${fV(Math.sqrt(p * r) / aStd, 3)}` }),
    );
  } else {
    // A non-inverting stage cannot go below 1: a follower gives exactly 1, so A_half < 1 needs an attenuator.
    rest.push(
      item('rg', 'R_g', null, 'Ω', aHalf < 1 - 1e-12 ? 'none: stage gain < 1' : 'open (unity-gain follower)', { symbol: 'R_g', ...g(gGroup) }),
      ...(aHalf < 1 - 1e-12 ? [item('atten', 'Input attenuation needed', 20 * Math.log10(aHalf), 'dB', fDb(20 * Math.log10(aHalf), 2), { ...g(gGroup), note: 'ahead of a unity-gain stage' })] : []),
    );
  }
  if (avail) {
    rest.push(
      item('pAvail', 'Max clean power on available rail', avail.p, 'W', avail.p > 0 ? fW(avail.p, 3) : 'none (dropout ≥ rail)', { ...g('Available supply'), note: `${railText(vsup!)} → V_pk ${fV(Math.max(avail.vpk, 0), 3)}`, tone: avail.p < p * (1 - 1e-9) ? 'fail' : '' }),
      item('railMargin', 'Rail margin', vsup! - rl.rail, 'V', `${vsup! - rl.rail >= 0 ? '+' : '−'}${fV(Math.abs(vsup! - rl.rail), 3)}`, { ...g('Available supply'), note: 'available minus required (loaded)', tone: vsup! < rl.rail * (1 - 1e-9) ? 'fail' : '' }),
    );
  }
  if (topo === 'btl') rest.push(item('rHalf', 'Load seen by each half', r / 2, 'Ω', fR(r / 2), { ...g(gGroup), note: 'each half supplies the full current at half the voltage' }));
  report.results = [...primary, ...rest];

  // ── warnings (each says what to do)
  if (avail && avail.p < p * (1 - 1e-9)) warnings.push(avail.p > 0 ? `The available rail (${railText(vsup!)}) clips at ${fW(avail.p, 3)}, below the rated ${fW(p, 3)}: it needs ${railText(rl.rail)} under load. Raise the rail, use a bridge (BTL) output or a lower-impedance load.` : `The available rail (${railText(vsup!)}) does not even cover the output dropout: no clean output is possible. Raise the rail.`);
  if (aHalf < 1 - 1e-12) warnings.push(`Each ${topo === 'btl' ? 'half' : 'stage'} would need a gain of ${aHalf.toPrecision(3)} V/V, below the 1 V/V a non-inverting stage can reach (a follower gives exactly 1, ${topo === 'btl' ? `so the bridge would give ${2} V/V` : 'too much'}). Put a ${fDb(-20 * Math.log10(aHalf), 1)} attenuator (pad or volume control) ahead of a unity-gain stage, or use a quieter source.`);
  if (aHalf > 200) warnings.push(`Gain ${aHalf.toPrecision(3)} V/V per stage is above the 20–200 range the LM3886 datasheet suggests: noise rises and loop gain (THD, power bandwidth) falls. Add a preamp stage or use a hotter source.`);
  if (aHalf >= 1 && aHalf < 10) notes.push(`Stage gain ${aHalf.toPrecision(3)} V/V: power op-amps such as the LM3886 are only specified stable above a closed-loop gain of 10. Check the datasheet, or attenuate the input and raise the gain.`);
  if (vin > dbuToV(24)) warnings.push(`A sensitivity of ${fDb(s.vinDbu, 1, 'dBu')} is above the +24 dBu maximum of most professional line outputs: no source can drive the amplifier to full power. Raise the gain.`);
  if (vin < dbuToV(-40)) warnings.push(`A sensitivity of ${fDb(s.vinDbu, 1, 'dBu')} is microphone-level: the power stage then amplifies its own input noise by ${fDb(s.gainDb, 0)}. Put the gain in a low-noise preamp instead.`);
  if (spanMax > 84) notes.push(`The supply span reaches ${fV(spanMax, 3)} at high line, beyond the 84 V operating limit of monolithic power amplifiers such as the LM3886: this design needs a discrete output stage, or a bridge on lower rails.`);
  if (topo === 'btl' && r / 2 < 2) warnings.push(`In a bridge each half sees R_L/2 = ${fR(r / 2)}: most amplifier halves are not rated below 2 Ω. Use a higher-impedance speaker or a single-ended output.`);
  else if (topo === 'se' && r < 2) warnings.push(`A ${fR(r)} load is below what most amplifiers are rated for (2 Ω): check the current limit and safe operating area, or use a higher-impedance speaker.`);
  if (cfDb < CF_SINE_DB - 1e-9) notes.push(`A crest factor below 3.01 dB (sine) means a compressed or square-like signal: its average power at clip exceeds the sine rating (${fW(pProg, 3)}), so check the thermal design.`);
  if (aHalfStd != null && Math.abs(aHalfStd / aHalf - 1) > 0.05) notes.push(`The nearest ${s.eseries} R_g changes the gain by ${(((aHalfStd / aHalf) - 1) * 100).toFixed(1)} %: use a finer series or adjust R_f.`);

  notes.push(
    'Sine rating into a resistive load: rails are sized so the output clips exactly at the rated power. Reactive speaker loads draw current out of phase with the voltage and stress the output stage more.',
    'Supply power and dissipation are for an ideal class-B stage (no bias current). Class AB is close to it at high output; class D dissipates far less.',
  );

  report.summary = `${fW(p, 3)} into ${fR(r)} · ${TOPO[topo]} · ${fV(vin, 3)} in (${fDb(s.vinDbu, 1, 'dBu')}) · gain ${fDb(s.gainDb, 1)} · rails ${railText(rl.rail)}`;
  report.details = { ...op, pAvail: avail?.p ?? null, aHalf, rgExact, rgStd, aStd, veff: rl.veff, rail: rl.rail, railIdle, railMax, span: rl.span, ps, pdMax: pdMax.pd, eta, pProg, vinProg, topology: topo, supply: sup };
  report.graphs = graphs(s, op.vpk, a, r, p, cfLin, rl.rail, sup, vdrop, topo, spanUsed, vpClip, railsUsed, avail?.p ?? null);
  const outside = solvedOutOfRange(fields, report.results);
  if (outside) return { ...emptyReport(ID), ok: false, error: outside, solveFor: s.solveFor, status: { text: 'OUT OF RANGE', tone: 'fail' } };
  return report;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: AmpState, vpk: number, a: number, r: number, p: number, cf: number, rail: number, sup: Supply, vdrop: number, topo: Topology, span: number, vpClip: number, railsUsed: string, pAvail: number | null): GraphSpec[] {
  // 1 — output power vs input level, sine and programme, with clipping
  const lo = s.vinDbu - 40;
  const hi = s.vinDbu + 12;
  const n = 209;
  const xs = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  const clipSine = s.vinDbu;
  const clipProg = vToDbu(vpk / (cf * a));
  const curve = (crest: number, clipAt: number) => {
    const lin = xs.filter((x) => x <= clipAt);
    const over = xs.filter((x) => x >= clipAt);
    return {
      lin: { x: [...lin, clipAt], y: [...lin, clipAt].map((x) => powerAt(dbuToV(x), a, r, vpk, crest)) },
      clip: { x: [clipAt, ...over], y: [clipAt, ...over].map((x) => powerAt(dbuToV(x), a, r, vpk, crest)) },
    };
  };
  const sine = curve(Math.SQRT2, clipSine);
  const prog = curve(cf, clipProg);
  const inOut: GraphSpec = {
    id: 'power-vs-input',
    title: 'Output vs input level',
    subtitle: 'Average output power; dashed beyond clipping (the output is distorted there)',
    legend: 'below',
    x: { label: 'Input level (rms)', unit: 'dBu' },
    y: [{ id: 'p', label: 'Output power', unit: 'W', log: true }],
    series: [
      { label: 'Sine', x: sine.lin.x, y: sine.lin.y, axis: 'p', color: '#1f4e5f', width: 2.2 },
      { label: 'Sine, clipped', x: sine.clip.x, y: sine.clip.y, axis: 'p', color: '#1f4e5f', width: 1.4, dash: [5, 4], noReadout: true },
      { label: `Programme (CF ${s.cf.toFixed(1)} dB)`, x: prog.lin.x, y: prog.lin.y, axis: 'p', color: '#c47b17', width: 2 },
      { label: 'Programme, peaks clipped', x: prog.clip.x, y: prog.clip.y, axis: 'p', color: '#c47b17', width: 1.3, dash: [5, 4], noReadout: true },
    ],
    hlines: [
      { value: p, label: `rated ${fW(p, 3)} (clipping)`, axis: 'p', color: '#8b1e1e', dash: [5, 4] },
      ...(pAvail != null && pAvail > 0 && Math.abs(pAvail / p - 1) > 0.02 ? [{ value: pAvail, label: `available rail clips at ${fW(pAvail, 3)}`, axis: 'p', color: '#c47b17', dash: [2, 3] }] : []),
    ],
    vlines: [{ value: s.vinDbu, label: `sensitivity ${fDb(s.vinDbu, 1, 'dBu')}`, color: '#9a8f7a' }],
    markers: [{ x: s.vinDbu, y: p, axis: 'p', label: fW(p, 3) }],
  };

  // 2 — required rail and peak current vs rated power (same load, topology and dropout)
  const ps = logspace(p / 100, p * 10, 161);
  if (!ps.includes(p)) ps.push(p), ps.sort((x, y) => x - y);
  const railVs = ps.map((q) => rails(Math.sqrt(2 * q * r), vdrop, topo, sup).rail);
  const railGraph: GraphSpec = {
    id: 'rail-vs-power',
    title: 'Rail & current vs power',
    subtitle: `${fW(p / 100, 2)} – ${fW(p * 10, 2)} into ${fR(r)}, ${TOPO[topo]}`,
    x: { label: 'Rated power', unit: 'W', log: true },
    y: [
      { id: 'v', label: sup === 'split' ? 'Loaded rail ±V' : 'Loaded supply V_CC', unit: 'V', log: true },
      { id: 'i', label: 'Peak current', unit: 'A', side: 'right', log: true },
    ],
    series: [
      { label: sup === 'split' ? 'Rail (±)' : 'V_CC', x: ps, y: railVs, axis: 'v', width: 2.2 },
      { label: 'I_pk', x: ps, y: ps.map((q) => Math.sqrt((2 * q) / r)), axis: 'i', color: '#c47b17', width: 1.8 },
    ],
    vlines: [{ value: p, label: `rated ${fW(p, 3)}`, color: '#9a8f7a' }],
    markers: [{ x: p, y: rail, axis: 'v', label: `${sup === 'split' ? '±' : ''}${fV(rail, 3)}` }],
  };

  // 3 — class-B dissipation and efficiency vs output power on the loaded rails
  const vps = Array.from({ length: 161 }, (_, i) => (vpClip * i) / 160);
  const pouts = vps.map((v) => (v * v) / (2 * r));
  const pd = vps.map((v) => supplyPower(v, r, span, topo) - (v * v) / (2 * r));
  const dmax = maxDissipation(r, span, topo, vpClip);
  const dissGraph: GraphSpec = {
    id: 'dissipation',
    title: 'Dissipation vs output',
    subtitle: `Ideal class B on the ${railsUsed} rails, sine drive from zero to their clip level`,
    x: { label: 'Output power', unit: 'W' },
    y: [
      { id: 'd', label: 'Dissipation', unit: 'W', includeZero: true },
      { id: 'e', label: 'Efficiency', unit: '%', side: 'right', includeZero: true, min: 0, max: 100 },
    ],
    series: [
      { label: 'Dissipation P_D', x: pouts, y: pd, axis: 'd', width: 2.2 },
      { label: 'Efficiency η', x: pouts.slice(1), y: vps.slice(1).map((v) => (100 * (v * v) / (2 * r)) / supplyPower(v, r, span, topo)), axis: 'e', color: '#c47b17', width: 1.8 },
    ],
    hlines: [{ value: dmax.pd, label: `max ${fW(dmax.pd, 3)}`, axis: 'd', color: '#8b1e1e', dash: [5, 4] }],
    vlines: vpClip >= vpk * (1 - 1e-12) ? [{ value: p, label: 'rated', color: '#9a8f7a' }] : [],
  };
  return vpClip > 0 ? [inOut, railGraph, dissGraph] : [inOut, railGraph];
}

const knownForms = <T extends string>(name: string, ok: readonly T[]) => (raw: unknown): T => {
  const v = String(raw) as T;
  if (!ok.includes(v)) throw new Error(`${name} must be one of ${ok.map((o) => JSON.stringify(o)).join(', ')}`);
  return v;
};

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
  if (f.units) {
    const [u, k] = Object.entries(f.units)[0];
    return `${Number((v / k).toPrecision(3))} ${u}`;
  }
  if (f.unit) return si(v, f.unit, 3).replace('-', '−');
  return `${Number(v.toPrecision(3))}${f.suffix ? ` ${f.suffix}` : ''}`.replace('-', '−');
}

export const def: CalcDef<AmpState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Sine rating V_out = √(P·R_L), V_pk = √2·V_out, A_v = V_out/V_in, rail = (V_pk + V_od)(1 + regulation)(1 + high line) after the LM3886 datasheet design procedure (TI SNAS091C, eq. 7–10), extended to BTL and single supply; ideal class-B supply power and dissipation from Sedra & Smith, Microelectronic Circuits §12.3; speaker impedance minimum 0.8 × rated per IEC 60268-5.',
  fields,
  defaults,
  solve: {
    default: 'gain',
    analysis: 'pout',
    options: [
      { key: 'gain', label: 'Gain for rated power from a given sensitivity' },
      { key: 'pout', label: 'Output power from gain and input level' },
      { key: 'vin', label: 'Input sensitivity for a given gain' },
    ],
  },
  controls: {
    vinAs: knownForms('vinAs', ['v', 'dbu', 'dbv'] as const),
    gainAs: knownForms('gainAs', ['vv', 'db'] as const),
  },
  compute,
  examples: [
    { id: 'pro-100w', label: '100 W / 8 Ω from +4 dBu line level (solve gain)', state: defaults() },
    { id: 'lm3886-40w', label: 'LM3886 datasheet: 40 W / 4 Ω, 1 V in (±21.9 V; datasheet prints ±21.0 V)', state: { solveFor: 'gain', pout: 40, rl: 4, topology: 'se', vinAs: 'v', vin: 1, supply: 'split', vdrop: 4, reg: 15, highLine: 10, cf: 18, rf: 100e3, eseries: 'E12' } },
    { id: 'consumer-sens', label: 'Fixed 26 dB amp: sensitivity for 200 W / 4 Ω (solve V_in)', state: { solveFor: 'vin', pout: 200, rl: 4, topology: 'se', gainAs: 'db', gainDb: 26, supply: 'split', vdrop: 4, reg: 15, highLine: 10, cf: 18, rf: 22e3, eseries: 'E24' } },
    { id: 'car-btl', label: 'Car-audio BTL on 14.4 V: 16 W / 4 Ω, sensitivity at 26 dB', state: { solveFor: 'vin', pout: 16, rl: 4, topology: 'btl', gainAs: 'db', gainDb: 26, supply: 'single', vdrop: 1.5, reg: 0, highLine: 0, vsup: 14.4, cf: 12, rf: 22e3, eseries: 'E24' } },
    { id: 'rail-short', label: '100 W / 8 Ω on ±35 V rails: not enough (warning)', state: { solveFor: 'gain', pout: 100, rl: 8, topology: 'se', vinAs: 'dbu', vinDbu: 4, supply: 'split', vdrop: 4, reg: 15, highLine: 10, vsup: 35, cf: 18, rf: 22e3, eseries: 'E24' } },
    { id: 'consumer-10dbv', label: 'Consumer −10 dBV source into 50 W / 8 Ω, music headroom', state: { solveFor: 'gain', pout: 50, rl: 8, topology: 'se', vinAs: 'dbv', vinDbv: -10, supply: 'split', vdrop: 3, reg: 10, highLine: 10, cf: 20, rf: 47e3, eseries: 'E24' } },
    { id: 'high-power', label: '2 kW into 4 Ω: discrete-stage rails, 39 A peaks', state: { solveFor: 'gain', pout: 2000, rl: 4, topology: 'se', vinAs: 'dbu', vinDbu: 4, supply: 'split', vdrop: 5, reg: 15, highLine: 10, vsup: null, cf: 12, rf: 22e3, eseries: 'E24' } },
  ],
};
