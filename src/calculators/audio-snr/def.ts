/** Audio SNR / dynamic range — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec, NumberField } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_OHM, withDefault } from '@/core/unitsets';
import { DBU_MINUS_DBV, type Weighting, chain, dbu2p, dbuToV, idealDr, johnson2, noiseBandwidth, p2dbu, quantNoise, weightDb, weightPow } from './model';

export const ID = 'audio/audio-snr';

type Solve = 'snr' | 'sig' | 'noise' | 'bits';
type SigAs = 'dbu' | 'dbv' | 'dbfs';
type NoiseAs = 'ein' | 'en';

export interface SnrState {
  solveFor: Solve;
  /** SNR, dB: the result, or the target when solving for something else */
  snr: number;
  sigAs: SigAs;
  sigDbu: number;
  sigDbv: number;
  sigDbfs: number;
  /** Clip level = 0 dBFS (full-scale sine), dBu at the output */
  lmax: number;
  noiseAs: NoiseAs;
  /** Equivalent input noise in the measurement band (and weighting), dBu */
  ein: number;
  /** Amplifier input voltage-noise density, V/√Hz */
  en: number;
  enUnit: string;
  /** Source resistance (thermal noise), Ω */
  rs: number;
  rsUnit: string;
  /** Temperature of the source resistance, °C */
  temp: number;
  /** Gain from the input to the output (where the levels are), dB */
  gainDb: number;
  flo: number;
  floUnit: string;
  fhi: number;
  fhiUnit: string;
  weighting: Weighting;
  adc: boolean;
  bits: number;
  fsamp: number;
  fsampUnit: string;
  dither: 'none' | 'tpdf';
}

/** Microphone preamp (EIN −127 dBu, 150 Ω, 50 dB gain) into a 24-bit interface aligned 0 dBu = −18 dBFS (EBU R68). */
export const defaults = (): SnrState => ({
  solveFor: 'snr',
  snr: 77,
  sigAs: 'dbu',
  sigDbu: 0,
  sigDbv: -DBU_MINUS_DBV,
  sigDbfs: -18,
  lmax: 18,
  noiseAs: 'ein',
  ein: -127,
  en: 1.5e-9,
  enUnit: 'nV/√Hz',
  rs: 150,
  rsUnit: 'Ω',
  temp: 25,
  gainDb: 50,
  flo: 20,
  floUnit: 'Hz',
  fhi: 20e3,
  fhiUnit: 'kHz',
  weighting: 'none',
  adc: true,
  bits: 24,
  fsamp: 48e3,
  fsampUnit: 'kHz',
  dither: 'none',
});

const sigSolved = (form: SigAs) => (_s: any, root: any) => root.solveFor === 'sig' || root.sigAs !== form;
const noiseSolved = (form: NoiseAs) => (_s: any, root: any) => root.solveFor === 'noise' || root.noiseAs !== form;
const sigField = (key: string, form: SigAs, extra: Omit<NumberField, 'kind' | 'key'>): NumberField => ({
  kind: 'number',
  key,
  solvable: true,
  solvedWhen: sigSolved(form),
  onSolve: (_s, root) => {
    root.solveFor = 'sig';
  },
  onUnsolve: (_s, root) => {
    if (root.solveFor === 'sig') root.solveFor = 'snr';
    root.sigAs = form;
  },
  ...extra,
});
const noiseField = (key: string, form: NoiseAs, extra: Omit<NumberField, 'kind' | 'key'>): NumberField => ({
  kind: 'number',
  key,
  solvable: true,
  solvedWhen: noiseSolved(form),
  onSolve: (_s, root) => {
    root.solveFor = 'noise';
  },
  onUnsolve: (_s, root) => {
    if (root.solveFor === 'noise') root.solveFor = 'snr';
    root.noiseAs = form;
  },
  ...extra,
});

const U_EN: Record<string, number> = { 'nV/√Hz': 1e-9, 'µV/√Hz': 1e-6 };
const U_HZ = withDefault(U_FREQ, 'Hz');
const U_KHZ = withDefault(U_FREQ, 'kHz');

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Signal',
    note: 'Levels are at the output (converter input). Click ◎ to choose the unknown; SNR is then the target.',
    fields: [
      { kind: 'number', key: 'snr', symbol: 'SNR', label: 'S/N ratio', suffix: 'dB', solvable: true, min: -50, max: 250, help: 'Signal level minus the total noise level in the measurement band (with the weighting). When you solve for another quantity this is the target.' },
      // The three forms share one level, so their limits are the same range converted (not round numbers):
      // a value typed as the rounded limit (62.2185 dBu) is just above it and is refused as typed.
      sigField('sigDbu', 'dbu', { symbol: 'L_sig', label: 'Signal level', suffix: 'dBu', min: -200, max: 60 + DBU_MINUS_DBV, help: 'Rms signal level in dBu (re 0.7746 V). +4 dBu is professional line level.' }),
      sigField('sigDbv', 'dbv', { symbol: 'L_sig', label: 'Signal level', suffix: 'dBV', min: -200 - DBU_MINUS_DBV, max: 60, help: 'Rms signal level in dBV (re 1 V). −10 dBV is consumer line level.' }),
      sigField('sigDbfs', 'dbfs', { symbol: 'L_sig', label: 'Signal level', suffix: 'dBFS', min: -260, max: 120 + DBU_MINUS_DBV, help: 'Level relative to the clip level / full-scale sine (0 dBFS).' }),
      { kind: 'number', key: 'lmax', symbol: 'L_max', label: 'Clip = 0 dBFS', suffix: 'dBu', min: -60, max: 60, help: 'Largest undistorted sine (rms) at the output, or the converter’s full-scale level. Studio alignments: +18 dBu (EBU R68) or +24 dBu (SMPTE RP155). Consumer 2 V rms = +8.2 dBu.' },
    ],
  },
  {
    kind: 'section',
    title: 'Analog noise',
    note: 'Give the input noise as EIN (already integrated) or as a density; the other follows from the bandwidth.',
    fields: [
      noiseField('ein', 'ein', { symbol: 'EIN', label: 'Input noise', suffix: 'dBu', min: -200, max: 40, help: 'Input-referred noise in the measurement bandwidth and weighting below, including the source resistance (mic preamps are specified with 150 Ω).' }),
      noiseField('en', 'en', { symbol: 'e_n', label: 'Density', units: U_EN, unitKey: 'enUnit', unitFamily: 'none', min: 0, max: 1e-4, help: 'Amplifier input voltage-noise density (white). The source resistance’s thermal noise is added to it.' }),
      { kind: 'number', key: 'rs', symbol: 'R_s', label: 'Source R', units: withDefault(U_OHM, 'Ω'), unitKey: 'rsUnit', min: 0, max: 1e8, help: 'Thermal noise √(4kTR) of the source (150 Ω for a dynamic microphone, 0 for none).' },
      { kind: 'number', key: 'temp', symbol: 'T', label: 'Temperature', suffix: '°C', min: -55, max: 200 },
      { kind: 'number', key: 'gainDb', symbol: 'G', label: 'Gain', suffix: 'dB', min: -60, max: 120, help: 'Voltage gain from the input (where EIN is referred) to the output (where the signal and clip levels are).' },
    ],
  },
  {
    kind: 'section',
    title: 'Bandwidth & weighting',
    fields: [
      { kind: 'number', key: 'flo', symbol: 'f_lo', label: 'Band from', units: U_HZ, unitKey: 'floUnit', min: 0.1, max: 1e6 },
      { kind: 'number', key: 'fhi', symbol: 'f_hi', label: 'Band to', units: U_KHZ, unitKey: 'fhiUnit', min: 1, max: 1e7, help: 'Audio measurements use 20 Hz – 20 kHz (or 22 Hz – 22 kHz), brick-wall.' },
      { kind: 'select', key: 'weighting', label: 'Weighting', options: [{ value: 'none', label: 'None (unweighted)' }, { value: 'A', label: 'A-weighting (IEC 61672-1)' }, { value: 'C', label: 'C-weighting (IEC 61672-1)' }], help: 'A-weighting follows the ear’s sensitivity at low levels and is the usual choice for noise and dynamic-range specs.' },
    ],
  },
  {
    kind: 'section',
    title: 'Converter',
    fields: [
      { kind: 'toggle', key: 'adc', label: 'Converter', on: 'Yes', off: 'No' },
      { kind: 'number', key: 'bits', symbol: 'N', label: 'Resolution', suffix: 'bits', integer: true, min: 1, max: 32, solvable: true, visible: (s) => !!s.adc, help: 'Ideal quantiser: 6.02N + 1.76 dB for a full-scale sine over 0…fs/2.' },
      { kind: 'number', key: 'fsamp', symbol: 'f_s', label: 'Sample rate', units: U_KHZ, unitKey: 'fsampUnit', min: 100, max: 1e8, visible: (s) => !!s.adc, help: 'Quantisation noise spreads over 0…fs/2; the measurement band keeps only its share of it.' },
      { kind: 'select', key: 'dither', label: 'Dither', options: [{ value: 'none', label: 'None' }, { value: 'tpdf', label: 'TPDF ±1 LSB (+4.77 dB)' }], visible: (s) => !!s.adc, help: 'Triangular-PDF dither removes distortion and noise modulation at the cost of 4.77 dB more noise.' },
    ],
  },
];

const fDb = (x: number, d = 1, u = 'dB') => (Number.isFinite(x) ? `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)} ${u}` : `${x > 0 ? '∞' : '−∞'} ${u}`);
const sgn = (x: number, d = 1, u = 'dB') => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)} ${u}`;
const finite = (name: string, v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
};
const W_LABEL: Record<Weighting, string> = { none: 'unweighted', A: 'A-weighted', C: 'C-weighted' };

function fail(msg: string, s: SnrState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

export function compute(st: SnrState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: SnrState): CalcReport {
  const s: SnrState = { ...st };
  if (!['snr', 'sig', 'noise', 'bits'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  const w: Weighting = s.weighting === 'A' || s.weighting === 'C' ? s.weighting : 'none';
  const flo = finite('Lower band edge', s.flo);
  const fhi = finite('Upper band edge', s.fhi);
  const lmax = finite('Clip level', s.lmax);
  const g = finite('Gain', s.gainDb);
  const rs = finite('Source resistance', s.rs);
  const temp = finite('Temperature', s.temp);
  const adc = !!s.adc;
  const fsamp = finite('Sample rate', s.fsamp);
  const dither = s.dither === 'tpdf' ? 'tpdf' : 'none';
  if (!(flo > 0) || !(fhi > flo)) throw new Error('The band needs 0 < f_lo < f_hi.');
  if (rs < 0) throw new Error('Source resistance must be ≥ 0.');
  if (temp <= -273.15) throw new Error('Temperature must be above absolute zero.');
  if (adc && !(fsamp > 0)) throw new Error('Sample rate must be > 0.');
  if (adc && fhi > fsamp / 2 * (1 + 1e-12)) throw new Error(`The upper band edge ${si(fhi, 'Hz', 3)} is above fs/2 = ${si(fsamp / 2, 'Hz', 3)}: a sampled system has no content there. Lower f_hi or raise the sample rate.`);
  if (s.solveFor === 'bits' && !adc) throw new Error('Solving for bits needs a converter in the chain: switch “Converter” on.');
  let bits = adc ? Math.round(finite('Resolution', s.bits)) : 0;
  if (adc && s.solveFor !== 'bits' && (bits < 1 || bits > 32)) throw new Error('Resolution must be 1 … 32 bits.');

  const beff = noiseBandwidth(w, flo, fhi);
  const eth2 = johnson2(rs, temp);
  const sigAs: SigAs = s.sigAs === 'dbv' || s.sigAs === 'dbfs' ? s.sigAs : 'dbu';
  const noiseAs: NoiseAs = s.noiseAs === 'en' ? 'en' : 'ein';
  const readSig = () => (sigAs === 'dbv' ? finite('Signal level (dBV)', s.sigDbv) + DBU_MINUS_DBV : sigAs === 'dbfs' ? finite('Signal level (dBFS)', s.sigDbfs) + lmax : finite('Signal level', s.sigDbu));
  // total input density e_tot² = e_n² + 4kTR_s; EIN = e_tot²·B_eff
  const readNoise = (): { eTot2: number; en2: number } => {
    if (noiseAs === 'en') {
      const en = finite('Noise density', s.en);
      if (en < 0) throw new Error('Noise density must be ≥ 0.');
      return { eTot2: en * en + eth2, en2: en * en };
    }
    const pIn = dbu2p(finite('EIN', s.ein));
    const eTot2 = pIn / beff;
    const en2 = eTot2 - eth2;
    if (en2 < -1e-12 * eTot2) throw new Error(`EIN ${fDb(s.ein, 1, 'dBu')} is below the thermal noise of R_s = ${si(rs, 'Ω', 3)} alone (${fDb(p2dbu(eth2 * beff), 1, 'dBu')} ${W_LABEL[w]} in this band): no amplifier is that quiet. Check the EIN, its bandwidth and weighting, or R_s.`);
    return { eTot2, en2: Math.max(en2, 0) };
  };
  const target = () => finite('SNR target', s.snr);
  const base = { lmax, gainDb: g, beff, adc, bits, fsamp, dither: dither as 'none' | 'tpdf' };
  const warnings: string[] = [];
  const notes: string[] = [];

  let sig = 0;
  let nz = { eTot2: 0, en2: 0 };
  switch (s.solveFor) {
    case 'snr':
      sig = readSig();
      nz = readNoise();
      break;
    case 'sig': {
      nz = readNoise();
      const c0 = chain({ ...base, sigDbu: 0, eTot2: nz.eTot2 });
      if (!(c0.pTot > 0)) return fail('There is no noise in the chain (no EIN, density, source resistance or converter), so every signal level has infinite SNR.', s);
      sig = target() + c0.noiseDbu;
      break;
    }
    case 'noise': {
      sig = readSig();
      const pSig = dbu2p(sig);
      const pAllowed = pSig / 10 ** (target() / 10);
      const pQ = chain({ ...base, sigDbu: sig, eTot2: 0 }).pQ;
      const pAnalogMax = pAllowed - pQ;
      if (!(pAnalogMax > 0)) return fail(`The ${bits}-bit converter alone limits the SNR to ${fDb(sig - p2dbu(pQ), 1)}: no amount of analog quietness reaches ${fDb(target(), 1)}. Use more bits, raise the signal or narrow the band.`, s);
      const eTot2 = pAnalogMax / 10 ** (g / 10) / beff;
      // a target equal to the thermal-noise limit (e.g. ◎ on e_n from the noiseless-amp example) lands
      // on e_n = 0 up to rounding: allow that sliver instead of a red NO SOLUTION
      const en2 = eTot2 - eth2;
      if (en2 < -1e-9 * eth2) return fail(`The thermal noise of R_s = ${si(rs, 'Ω', 3)} alone (${fDb(p2dbu(eth2 * beff), 1, 'dBu')}) already exceeds the noise budget (EIN ≤ ${fDb(p2dbu(eTot2 * beff), 1, 'dBu')}). Raise the signal level or the gain before the noise, lower R_s, or relax the target.`, s);
      nz = { eTot2: Math.max(eTot2, eth2), en2: Math.max(en2, 0) };
      break;
    }
    case 'bits': {
      // N is a whole number: the smallest N that meets the target, so the achieved SNR (snrCheck) is
      // usually above the target in the SNR box, and solving for bits from an analysis state can return
      // fewer bits than entered when analog noise dominates. Round trips through bits are therefore not
      // exact; that is expected (mode-switch harness "roundtrip" flags on bits / from a bits state).
      sig = readSig();
      nz = readNoise();
      const t = target();
      const analogOnly = chain({ ...base, adc: false, sigDbu: sig, eTot2: nz.eTot2 });
      if (analogOnly.snr < t) return fail(`The analog noise alone limits the SNR to ${fDb(analogOnly.snr, 1)}: no converter reaches ${fDb(t, 1)}. Lower the input noise, raise the signal or narrow the band.`, s);
      bits = 0;
      for (let n = 1; n <= 32; n++) {
        if (chain({ ...base, bits: n, sigDbu: sig, eTot2: nz.eTot2 }).snr >= t - 1e-9) {
          bits = n;
          break;
        }
      }
      if (!bits) return fail(`Even 32 bits fall short of ${fDb(t, 1)} SNR at this signal level.`, s);
      base.bits = bits;
      break;
    }
  }
  const c = chain({ ...base, sigDbu: sig, eTot2: nz.eTot2 });
  if (!(c.pTot > 0)) throw new Error('There is no noise in the chain: give an EIN or noise density, a source resistance or a converter.');
  s.sigDbu = sig;
  s.sigDbv = sig - DBU_MINUS_DBV;
  s.sigDbfs = sig - lmax;
  s.snr = c.snr;
  s.bits = bits;
  const einDbu = p2dbu(nz.eTot2 * beff);
  s.ein = einDbu;
  s.en = Math.sqrt(nz.en2);
  const solved = s.solveFor;

  const report: CalcReport = { ...emptyReport(ID), solveFor: solved, warnings, notes };
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const nzFs = c.noiseDbu - lmax;
  const share = c.pAnalog / c.pTot;
  const limitedBy = !adc ? 'analog noise' : share >= 0.5 ? 'analog noise' : 'quantisation';
  const sigForms: Record<SigAs, ResultItem> = {
    dbu: item('sigDbu', 'Signal level', s.sigDbu, 'dBu', fDb(s.sigDbu, 2, 'dBu'), { symbol: 'L_sig' }),
    dbv: item('sigDbv', 'Signal level', s.sigDbv, 'dBV', fDb(s.sigDbv, 2, 'dBV'), { symbol: 'L_sig' }),
    dbfs: item('sigDbfs', 'Signal level', s.sigDbfs, 'dBFS', fDb(s.sigDbfs, 2, 'dBFS'), { symbol: 'L_sig' }),
  };
  const noiseForms: Record<NoiseAs, ResultItem> = {
    // no analog noise at all (e_n = 0, R_s = 0): EIN is −∞, which is shown but never written into the input
    ein: item('ein', 'Equivalent input noise', Number.isFinite(einDbu) ? einDbu : null, 'dBu', Number.isFinite(einDbu) ? fDb(einDbu, 1, 'dBu') : '−∞ dBu (no analog noise)', { symbol: 'EIN', note: `${W_LABEL[w]}, ${si(flo, 'Hz', 3)} – ${si(fhi, 'Hz', 3)}` }),
    en: item('en', 'Amp noise density', s.en, 'V/√Hz', `${si(s.en, 'V', 3)}/√Hz`, { symbol: 'e_n', note: rs > 0 ? `plus ${si(Math.sqrt(eth2), 'V', 3)}/√Hz from R_s` : 'white' }),
  };
  const primary: ResultItem[] = [];
  const snrCard = item('snr', 'Signal-to-noise', c.snr, 'dB', fDb(c.snr, 1), { symbol: 'SNR', note: `${W_LABEL[w]} · limited by ${limitedBy}` });
  const drCard = item('dr', 'Dynamic range', c.dr, 'dB', fDb(c.dr, 1), { symbol: 'DR', note: `clip ${sgn(lmax, 1, 'dBu')} to noise ${fDb(c.noiseDbu, 1, 'dBu')}` });
  if (solved === 'snr') primary.push({ ...snrCard, solved: true, primary: true }, { ...drCard, primary: true });
  else if (solved === 'sig') primary.push({ ...sigForms[sigAs], solved: true, primary: true, note: `headroom ${fDb(lmax - sig, 1)} to clip` }, { ...snrCard, key: 'snrCheck', primary: true }, { ...drCard, primary: true });
  else if (solved === 'noise') primary.push({ ...noiseForms[noiseAs], solved: true, primary: true, label: noiseAs === 'ein' ? 'Max equivalent input noise' : 'Max amp noise density' }, { ...snrCard, key: 'snrCheck', primary: true }, { ...drCard, primary: true });
  else primary.push(item('bits', 'Converter resolution', bits, 'bits', `${bits} bits`, { symbol: 'N', solved: true, primary: true, note: `ideal DR ${fDb(idealDr(bits), 2)}` }), { ...snrCard, key: 'snrCheck', primary: true }, { ...drCard, primary: true });
  primary.push(item('noise', 'Noise floor (output)', c.noiseDbu, 'dBu', fDb(c.noiseDbu, 1, 'dBu'), { primary: true, note: `${fDb(nzFs, 1, 'dBFS')} · ${W_LABEL[w]}` }));

  const grp = (name: string) => ({ group: name });
  const rest: ResultItem[] = [];
  for (const f of ['dbu', 'dbv', 'dbfs'] as SigAs[]) if (!(solved === 'sig' && f === sigAs)) rest.push({ ...sigForms[f], label: { dbu: 'Signal in dBu', dbv: 'Signal in dBV', dbfs: 'Signal in dBFS' }[f], ...grp('Levels'), solved: solved === 'sig' || f !== sigAs });
  rest.push(
    item('sigV', 'Signal (rms)', dbuToV(sig), 'V', si(dbuToV(sig), 'V', 4), { ...grp('Levels') }),
    item('headroom', 'Headroom to clip', lmax - sig, 'dB', fDb(lmax - sig, 1), { ...grp('Levels'), tone: sig > lmax + 1e-9 ? 'fail' : '' }),
  );
  for (const f of ['ein', 'en'] as NoiseAs[]) if (!(solved === 'noise' && f === noiseAs)) rest.push({ ...noiseForms[f], ...grp('Noise'), solved: solved === 'noise' || f !== noiseAs });
  rest.push(
    item('johnson', 'Source thermal noise', p2dbu(eth2 * beff), 'dBu', rs > 0 ? `${fDb(p2dbu(eth2 * beff), 1, 'dBu')} (${si(Math.sqrt(eth2), 'V', 3)}/√Hz)` : 'none (R_s = 0)', { ...grp('Noise'), note: rs > 0 ? `√(4kTR), ${si(rs, 'Ω', 3)} at ${temp} °C` : undefined }),
    item('nfAmp', 'Amplifier noise figure', rs > 0 ? 10 * Math.log10(nz.eTot2 / eth2) : null, 'dB', rs > 0 ? fDb(10 * Math.log10(nz.eTot2 / eth2), 2) : '—', { ...grp('Noise'), note: 'total vs source thermal noise' }),
    item('analogOut', 'Analog noise at output', p2dbu(c.pAnalog), 'dBu', fDb(p2dbu(c.pAnalog), 1, 'dBu'), { ...grp('Noise'), note: `EIN + G = ${fDb(einDbu, 1, 'dBu')} ${sgn(g, 1)}` }),
    item('beff', 'Noise bandwidth', beff, 'Hz', si(beff, 'Hz', 4), { symbol: 'B_eff', ...grp('Noise'), note: w === 'none' ? 'f_hi − f_lo' : `${sgn(10 * Math.log10(beff / (fhi - flo)), 2)} vs unweighted` }),
  );
  if (adc) {
    const pqFull = quantNoise(lmax, bits, dither);
    let n10 = 0;
    for (let n = 1; n <= 32; n++) {
      if ((quantNoise(lmax, n, dither) * beff) / (fsamp / 2) <= c.pAnalog / 10) {
        n10 = n;
        break;
      }
    }
    rest.push(
      ...(solved === 'bits' ? [] : [item('bits', 'Resolution', bits, 'bits', `${bits} bits`, { symbol: 'N', ...grp('Converter') })]),
      item('idealDr', 'Ideal converter DR', idealDr(bits), 'dB', fDb(idealDr(bits), 2), { ...grp('Converter'), note: '6.02N + 1.76 dB over 0…fs/2' }),
      item('qFull', 'Quantisation noise, 0…fs/2', p2dbu(pqFull), 'dBu', `${fDb(p2dbu(pqFull) - lmax, 1, 'dBFS')}`, { ...grp('Converter'), note: dither === 'tpdf' ? 'with TPDF dither (+4.77 dB)' : 'undithered' }),
      item('qBand', 'Quantisation noise in band', p2dbu(c.pQ), 'dBu', `${fDb(p2dbu(c.pQ) - lmax, 1, 'dBFS')}`, { ...grp('Converter'), note: `${W_LABEL[w]}, ${sgn(10 * Math.log10(beff / (fsamp / 2)), 2)} band share` }),
      item('bitsFor10', 'Bits for quantisation 10 dB under analog', n10 || null, 'bits', n10 ? `${n10} bits` : '> 32', { ...grp('Converter') }),
      item('analogShare', 'Analog share of the noise', share, '', `${(share * 100).toFixed(1)} %`, { ...grp('Converter') }),
    );
  }
  rest.push(item('eqBits', 'Equivalent resolution of the DR', (c.dr - 1.7609) / 6.0206, 'bits', `${((c.dr - 1.7609) / 6.0206).toFixed(2)} bits`, { ...grp('Converter'), note: '(DR − 1.76)/6.02' }));
  report.results = [...primary, ...rest];

  // ── warnings & notes
  if (sig > lmax + 1e-9) warnings.push(`The signal (${sgn(sig, 1, 'dBu')}) is ${fDb(sig - lmax, 1)} above the clip level: it clips. Lower the gain or the signal, or raise L_max.`);
  if (solved === 'bits' && share < 0.5) notes.push(`With ${bits} bits the converter still contributes ${((1 - share) * 100).toFixed(0)} % of the noise: one or two more bits put it well under the analog floor.`);
  if (adc && s.sigDbfs < -idealDr(bits) + 1.76)
    warnings.push(
      dither === 'tpdf'
        ? `The signal is below one LSB (${fDb(s.sigDbfs, 1, 'dBFS')}): the TPDF dither keeps it coded without distortion, but it sits under the converter’s noise floor. Add gain before the converter or use more bits.`
        : `The signal is below one LSB (${fDb(s.sigDbfs, 1, 'dBFS')}): undithered, it is distorted or lost rather than buried in noise. Add TPDF dither or more gain before the converter.`,
    );
  if (w !== 'none' && (flo < 10 || fhi > 20e3)) notes.push('IEC 61672-1 tabulates the weightings from 10 Hz to 20 kHz; outside that span the analytic curve is an extrapolation.');
  if (noiseAs === 'ein' && solved !== 'noise') notes.push(`EIN is taken as measured over the same band and weighting (${si(flo, 'Hz', 3)} – ${si(fhi, 'Hz', 3)}, ${W_LABEL[w]}). Datasheet EIN is usually unweighted over 20 Hz – 20 kHz or 22 Hz – 22 kHz with 150 Ω.`);
  if (g < 0 && noiseAs !== 'en') notes.push('Negative gain: the stage attenuates, so its own output noise (not modelled) can dominate. Give the output noise as EIN with G = 0 dB instead.');
  notes.push(
    'All noise sources are white; 1/f noise and hum are not included. Quantisation noise is the ideal q²/12 (or q²/4 with TPDF dither), spread evenly over 0…fs/2.',
    'SNR is the signal level minus the noise level in the band; dynamic range is the clip level minus the same noise.',
  );

  report.summary = `${fDb(c.snr, 1)} SNR · ${fDb(c.dr, 1)} DR · ${W_LABEL[w]} ${si(flo, 'Hz', 3)}–${si(fhi, 'Hz', 3)} · noise ${fDb(c.noiseDbu, 1, 'dBu')}${adc ? ` · ${bits}-bit` : ''}`;
  report.details = { ...c, beff, eTot2: nz.eTot2, en2: nz.en2, eth2, einDbu, sig, bits, limitedBy, share };
  report.graphs = graphs(s, w, flo, fhi, beff, nz.eTot2, g, lmax, sig, adc, bits, fsamp, dither, solved === 'snr' ? null : finite('SNR target', st.snr));
  const outside = solvedOutOfRange(fields, report.results);
  if (outside) return { ...emptyReport(ID), ok: false, error: outside, solveFor: s.solveFor, status: { text: 'OUT OF RANGE', tone: 'fail' } };
  return report;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: SnrState, w: Weighting, flo: number, fhi: number, beff: number, eTot2: number, g: number, lmax: number, sig: number, adc: boolean, bits: number, fsamp: number, dither: 'none' | 'tpdf', target: number | null): GraphSpec[] {
  // 1 — weighting curves (IEC 61672-1)
  const fTop = Math.max(20e3, Math.min(fhi, 100e3));
  const fBot = 10;
  const fw = logspace(fBot, fTop, 241);
  const wGraph: GraphSpec = {
    id: 'weighting',
    title: 'Weighting curves',
    subtitle: 'IEC 61672-1 frequency weightings; the measurement band is marked',
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'db', label: 'Relative response', unit: 'dB' }],
    series: [
      { label: 'A-weighting', x: fw, y: fw.map((f) => weightDb('A', f)), axis: 'db', color: '#1f4e5f', width: w === 'A' ? 2.6 : 1.3, dash: w === 'A' ? undefined : [5, 3] },
      { label: 'C-weighting', x: fw, y: fw.map((f) => weightDb('C', f)), axis: 'db', color: '#c47b17', width: w === 'C' ? 2.6 : 1.3, dash: w === 'C' ? undefined : [5, 3] },
    ],
    vlines: [
      ...(flo >= fBot ? [{ value: flo, label: `f_lo ${si(flo, 'Hz', 3)}`, color: '#9a8f7a' }] : []),
      ...(fhi <= fTop ? [{ value: fhi, label: `f_hi ${si(fhi, 'Hz', 3)}`, color: '#9a8f7a' }] : []),
    ],
    markers: w !== 'none' ? [{ x: 1000, y: 0, axis: 'db', label: '0 dB at 1 kHz' }] : [],
  };

  // 2 — output noise spectral density (weighted), analog and quantisation
  const fn = logspace(flo, fhi, 201);
  const dAnalog = eTot2 * 10 ** (g / 10);
  const dQ = adc ? quantNoise(lmax, bits, dither) / (fsamp / 2) : 0;
  const dens = (d: number, f: number) => 10 * Math.log10((d * weightPow(w, f)) / 0.6);
  const nGraph: GraphSpec = {
    id: 'noise-spectrum',
    title: 'Noise spectrum',
    subtitle: `Output noise density, ${W_LABEL[w]} (dBu in a 1 Hz band)`,
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'n', label: 'Noise density', unit: 'dBu/√Hz' }],
    series: [
      ...(dAnalog > 0 ? [{ label: 'Analog (EIN + gain)', x: fn, y: fn.map((f) => dens(dAnalog, f)), axis: 'n', color: '#1f4e5f', width: 1.6 }] : []),
      ...(dQ > 0 ? [{ label: `Quantisation (${bits} bit)`, x: fn, y: fn.map((f) => dens(dQ, f)), axis: 'n', color: '#c47b17', width: 1.6 }] : []),
      { label: 'Total', x: fn, y: fn.map((f) => dens(dAnalog + dQ, f)), axis: 'n', color: '#8b1e1e', width: 2.2 },
    ],
  };
  const out = [wGraph, nGraph];

  // 3 — SNR vs converter bits: where the converter stops mattering
  if (adc) {
    const ns = Array.from({ length: 25 }, (_, i) => i + 8);
    const at = (n: number) => chain({ sigDbu: sig, lmax, eTot2, gainDb: g, beff, adc: true, bits: n, fsamp, dither });
    const analog = chain({ sigDbu: sig, lmax, eTot2, gainDb: g, beff, adc: false, bits, fsamp, dither });
    const bGraph: GraphSpec = {
      id: 'snr-vs-bits',
      title: 'SNR vs bits',
      subtitle: 'Same signal and analog noise; the plateau is the analog limit',
      x: { label: 'Converter resolution', unit: 'bits', integer: true },
      y: [{ id: 'db', label: 'SNR / DR', unit: 'dB' }],
      series: [
        { label: 'SNR', x: ns, y: ns.map((n) => at(n).snr), axis: 'db', width: 2.2 },
        { label: 'Dynamic range', x: ns, y: ns.map((n) => at(n).dr), axis: 'db', color: '#c47b17', width: 1.6 },
      ],
      hlines: [
        ...(Number.isFinite(analog.snr) && eTot2 > 0 ? [{ value: analog.snr, label: `analog limit ${fDb(analog.snr, 1)}`, axis: 'db', color: '#9a8f7a', dash: [3, 3] }] : []),
        ...(target != null ? [{ value: target, label: `target ${fDb(target, 1)}`, axis: 'db', color: '#8b1e1e', dash: [5, 4] }] : []),
      ],
      vlines: [{ value: bits, label: `${bits} bits`, color: '#1f4e5f' }],
      markers: [{ x: bits, y: at(bits).snr, axis: 'db', label: fDb(at(bits).snr, 1) }],
    };
    out.push(bGraph);
  }
  void beff;
  void s;
  return out;
}

const oneOf = <T extends string>(name: string, ok: readonly T[]) => (raw: unknown): T => {
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

export const def: CalcDef<SnrState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Noise power budget: white input noise e² = e_n² + 4kTR_s (Johnson/Nyquist 1928) over the equivalent bandwidth B_eff = ∫|W(f)|²df with the IEC 61672-1:2013 A/C weightings, times the gain; ideal quantisation noise q²/12 (6.02N + 1.76 dB, Bennett 1948), ×3 with TPDF dither (Lipshitz–Wannamaker–Vanderkooy 1992), scaled by B_eff/(fs/2); SNR = L_sig − L_noise, DR = L_max − L_noise; levels re 0.7746 V (dBu), 1 V (dBV), full-scale sine (dBFS, AES17).',
  fields,
  defaults,
  solve: {
    default: 'snr',
    analysis: 'snr',
    options: [
      { key: 'snr', label: 'SNR and dynamic range (analysis)' },
      { key: 'sig', label: 'Signal level for a target SNR' },
      { key: 'noise', label: 'Max input noise for a target SNR' },
      { key: 'bits', label: 'Converter bits for a target SNR' },
    ],
  },
  controls: {
    sigAs: oneOf('sigAs', ['dbu', 'dbv', 'dbfs'] as const),
    noiseAs: oneOf('noiseAs', ['ein', 'en'] as const),
  },
  compute,
  // Switching the converter off hides the bits row: if it was the unknown, go back to analysis of the
  // chain as entered (the last solved N stays in the state for when the converter is switched back on).
  sync: (s) => {
    if (!s.adc && s.solveFor === 'bits') s.solveFor = 'snr';
  },
  examples: [
    { id: 'mic-pre', label: 'Mic preamp EIN −127 dBu, 50 dB gain, 24-bit ADC (EBU R68)', state: defaults() },
    { id: 'johnson-150', label: 'Noiseless amp on 150 Ω at 20 °C: thermal EIN limit −130.9 dBu', state: { ...defaults(), solveFor: 'snr', noiseAs: 'en', en: 0, rs: 150, temp: 20, gainDb: 0, adc: false, sigAs: 'dbu', sigDbu: 4, lmax: 24 } },
    { id: 'cd-16bit', label: '16-bit CD output, 2 V rms full scale, A-weighted, TPDF dither', state: { ...defaults(), solveFor: 'snr', sigAs: 'dbfs', sigDbfs: 0, lmax: 8.24, noiseAs: 'en', en: 5e-9, rs: 1e3, gainDb: 0, weighting: 'A', adc: true, bits: 16, fsamp: 44.1e3, dither: 'tpdf' } },
    { id: 'bits-110', label: 'How many bits for 110 dB(A) at full scale? (solve N)', state: { ...defaults(), solveFor: 'bits', snr: 110, sigAs: 'dbfs', sigDbfs: 0, lmax: 18, noiseAs: 'en', en: 3e-9, rs: 600, gainDb: 0, weighting: 'A', adc: true, fsamp: 48e3, dither: 'tpdf' } },
    { id: 'max-ein', label: 'Max EIN for 70 dB SNR at +4 dBu with 60 dB gain (solve EIN)', state: { ...defaults(), solveFor: 'noise', snr: 70, noiseAs: 'ein', sigAs: 'dbu', sigDbu: 4, lmax: 24, gainDb: 60, adc: false } },
    { id: 'consumer-line', label: 'Consumer −10 dBV line: level for 90 dB SNR (solve signal)', state: { ...defaults(), solveFor: 'sig', snr: 90, sigAs: 'dbv', noiseAs: 'en', en: 10e-9, rs: 10e3, gainDb: 0, lmax: 8.24, weighting: 'A', adc: false } },
  ],
};
