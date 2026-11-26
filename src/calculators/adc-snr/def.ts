/** ADC SNR — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ } from '@/core/unitsets';
import { DB_1P5, DB_PER_BIT, adcSnr, idealSnr, jitterSnr, type AdcInputs } from './model';

export interface AdcState {
  solveFor: 'snr' | 'n' | 'tjClk' | 'fin';
  /** which form of the target the user types when solving for N, jitter or f_in */
  targetAs: 'snr' | 'enob';
  snr: number;
  enob: number;
  n: number;
  vfs: number;
  vn: number;
  tjAp: number;
  thd: number | null;
  fs: number;
  fsUnit: string;
  bw: number;
  bwUnit: string;
  fin: number;
  finUnit: string;
  ain: number;
  tjClk: number;
}

/** A 14-bit, 250 MSPS pipeline ADC sampling a 70 MHz IF — typical of datasheet test conditions. */
export const defaults = (): AdcState => ({
  solveFor: 'snr',
  targetAs: 'snr',
  snr: 70,
  enob: 11.3,
  n: 14,
  vfs: 2,
  vn: 110e-6,
  tjAp: 80e-15,
  thd: null,
  fs: 250e6,
  fsUnit: 'MHz',
  bw: 0,
  bwUnit: 'MHz',
  fin: 70e6,
  finUnit: 'MHz',
  ain: -1,
  tjClk: 100e-15,
});

const targetIsSolved = (form: 'snr' | 'enob') => (_s: any, root: any) => root.solveFor === 'snr' || root.targetAs !== form;

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Performance',
    note: 'Analysis (◎ on SINAD) or a target for solving N, jitter or f_in. Give the target as SINAD or ENOB.',
    fields: [
      {
        // min covers every analysed SINAD (down to about −330 dB: 100 V noise on a 0.1 mV range at −200 dBFS)
        kind: 'number', key: 'snr', symbol: 'SINAD', label: 'SNR incl. distortion', suffix: 'dB', min: -500, max: 1000, solvable: true,
        solvedWhen: targetIsSolved('snr'),
        onSolve: (_s, root) => (root.solveFor = 'snr'),
        onUnsolve: (_s, root) => {
          if (root.solveFor === 'snr') root.solveFor = 'n';
          root.targetAs = 'snr';
        },
        help: 'Signal to noise-and-distortion ratio in dBc at the given input level, within the bandwidth BW. Equals the SNR when no THD is entered.',
      },
      {
        kind: 'number', key: 'enob', symbol: 'ENOB', label: 'Effective bits', suffix: 'bits', min: -100, max: 200, solvable: true,
        solvedWhen: targetIsSolved('enob'),
        onSolve: (_s, root) => (root.solveFor = 'snr'),
        onUnsolve: (_s, root) => {
          if (root.solveFor === 'snr') root.solveFor = 'n';
          root.targetAs = 'enob';
        },
        help: 'ENOB = (SINAD − 1.76 dB − A_in)/6.02, referred to a full-scale input (ADI MT-003).',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Converter',
    fields: [
      { kind: 'number', key: 'n', symbol: 'N', label: 'Resolution', suffix: 'bits', integer: true, min: 1, max: 32, solvable: true, help: 'When solved: the smallest whole number of bits that meets the target (the exact value is in the note).' },
      { kind: 'number', key: 'vfs', symbol: 'V_FS', label: 'Full-scale range (p-p)', unit: 'V', min: 1e-4, max: 1000, help: 'Peak-to-peak input range (differential for a differential ADC). Sets the size of the LSB and scales the thermal-noise term.' },
      { kind: 'number', key: 'vn', symbol: 'v_n', label: 'Input noise (rms)', unit: 'V', min: 0, max: 100, help: 'Input-referred thermal noise over DC…fs/2, from the datasheet or your front end. From “x LSB rms”: v_n = x·V_FS/2^N. 0 = none.' },
      { kind: 'number', key: 'tjAp', symbol: 't_ap', label: 'Aperture jitter (rms)', unit: 's', min: 0, max: 1e-6, help: 'The ADC’s own sampling-instant jitter (datasheet “aperture uncertainty”, typically 50–200 fs for high-speed ADCs). Adds RSS to the clock jitter.' },
      { kind: 'number', key: 'thd', symbol: 'THD', label: 'Total harmonic dist.', suffix: 'dBc', min: -200, max: 0, optional: true, zeroHint: 'none', help: 'Optional. Harmonic power relative to the carrier (e.g. −85 dBc). It adds to the noise in SINAD; processing gain does not reduce it. Leave blank to ignore.' },
    ],
  },
  {
    kind: 'section',
    title: 'Signal & clock',
    fields: [
      { kind: 'number', key: 'fs', symbol: 'f_s', label: 'Sample rate', units: U_FREQ, unitKey: 'fsUnit', min: 1, max: 1e12 },
      { kind: 'number', key: 'bw', symbol: 'BW', label: 'Signal bandwidth', units: U_FREQ, unitKey: 'bwUnit', min: 0, max: 1e12, zeroHint: 'fs/2', help: 'Bandwidth kept after digital filtering/decimation. Less than fs/2 gives processing gain 10·log10(fs/2BW). 0 = the full Nyquist band.' },
      { kind: 'number', key: 'fin', symbol: 'f_in', label: 'Input frequency', units: U_FREQ, unitKey: 'finUnit', min: 1e-3, max: 1e12, solvable: true, help: 'Analog input frequency (not the aliased one when undersampling). When solved: the highest input frequency that still meets the target.' },
      { kind: 'number', key: 'ain', symbol: 'A_in', label: 'Input level', suffix: 'dBFS', min: -200, max: 0, help: 'Sine amplitude relative to full scale. Datasheets test at −1 dBFS. Jitter noise scales with the signal, quantization and thermal noise do not.' },
      { kind: 'number', key: 'tjClk', symbol: 't_j', label: 'Clock jitter (rms)', unit: 's', min: 0, max: 1e-6, solvable: true, help: 'RMS jitter of the sampling clock, integrated over the bandwidth that matters (see ADI MT-008 to convert phase noise). When solved: the maximum allowed.' },
    ],
  },
];

const fmtDb = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} dB` : '∞');

function inputsOf(s: AdcState): AdcInputs {
  return { n: s.n, fs: s.fs, bw: s.bw > 0 ? s.bw : s.fs / 2, fin: s.fin, ain: s.ain, vfs: s.vfs, vn: s.vn, tjClk: s.tjClk, tjAp: s.tjAp, thd: s.thd };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

export function compute(st: AdcState): CalcReport {
  for (const k of ['snr', 'enob', 'n', 'vfs', 'vn', 'tjAp', 'fs', 'bw', 'fin', 'ain', 'tjClk'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (st.thd != null && !Number.isFinite(st.thd)) throw new Error('THD must be a number or blank.');
  if (!(st.fs > 0)) throw new Error('Sample rate must be > 0.');
  if (st.bw < 0 || st.bw > st.fs / 2 * (1 + 1e-12)) throw new Error(`Signal bandwidth must be between 0 and fs/2 = ${si(st.fs / 2, 'Hz')} (0 = fs/2).`);
  if (!(st.vfs > 0)) throw new Error('Full-scale range must be > 0.');
  if (st.vn < 0 || st.tjAp < 0 || st.tjClk < 0) throw new Error('Noise and jitter must be ≥ 0.');
  if (st.ain > 0) throw new Error('Input level must be ≤ 0 dBFS (a larger sine clips).');
  if (st.solveFor !== 'n' && !(st.n >= 1)) throw new Error('Resolution must be ≥ 1 bit.');
  if (st.solveFor !== 'fin' && !(st.fin > 0)) throw new Error('Input frequency must be > 0.');

  const s: AdcState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'signal/adc-snr', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const solving = s.solveFor !== 'snr';
  // target SINAD (dBc at the given input level)
  const target = s.targetAs === 'enob' ? s.enob * DB_PER_BIT + DB_1P5 + s.ain : s.snr;
  const sinadWith = (patch: Partial<AdcInputs>) => adcSnr({ ...inputsOf(s), ...patch }).sinad;
  let nExact: number | null = null;
  let finUnlimited = false;
  const fail = (key: string, label: string, why: string): CalcReport => {
    report.status = { text: 'NO SOLUTION', tone: 'fail' };
    warnings.push(why);
    report.results.push({ key, label, value: null, display: '—', primary: true, solved: true });
    return report;
  };

  // The target typed as ENOB is shown as SINAD and vice versa: keep both inside their fields' ranges.
  if (solving) {
    const tEnob = (target - DB_1P5 - s.ain) / DB_PER_BIT;
    if (target < -500 || target > 1000 || tEnob < -100 || tEnob > 200)
      throw new Error(`The target (${target.toFixed(1)} dB SINAD, ${tEnob.toFixed(1)} bits ENOB at ${s.ain} dBFS) is outside the range this page handles (−500…1000 dB, −100…200 bits).`);
  }
  // Switching ◎ from analysis makes the analysed SINAD the target, so a target equal to the best achievable
  // value (to rounding) is met, at the limit, rather than "no solution".
  const tolDb = 1e-9 * Math.max(1, Math.abs(target));

  if (s.solveFor === 'n') {
    const ceiling = sinadWith({ n: 64 });
    if (ceiling <= target) {
      // Name what actually caps SINAD: with no other noise source the limit is the bit count itself.
      const cap = adcSnr({ ...inputsOf(s), n: 64 }).share;
      if (cap.q > 0.5) return fail('n', 'Resolution', `Target ${target.toFixed(2)} dB needs more than 64 bits — far beyond the 32 bits this page allows (and any real converter).`);
      const limits = [cap.j > 0.01 ? 'jitter' : '', cap.th > 0.01 ? 'thermal noise' : '', cap.thd > 0.01 ? 'THD' : ''].filter(Boolean).join(' and ');
      return fail('n', 'Resolution', `Target ${target.toFixed(2)} dB is out of reach at any resolution: ${limits} cap${limits.includes(' and ') ? '' : 's'} SINAD at ${fmtDb(ceiling)}. ${cap.thd > 0.5 ? 'Improve linearity (THD)' : 'Reduce jitter or input noise, lower f_in, or narrow BW'}.`);
    }
    if (sinadWith({ n: 1 }) >= target) nExact = 1;
    else {
      const r = invert((n) => sinadWith({ n }), target, { lo: 1, hi: 64, samples: 252, log: false });
      nExact = r.ok ? r.roots[0] : 64;
    }
    // N is rounded up to a whole bit, so the achieved SINAD beats the target. Solving jitter or f_in for the
    // same target from here therefore gives a larger value than the one in the box: not a round-trip error.
    s.n = Math.max(1, Math.ceil(nExact - 1e-9));
    if (s.n > 32) return fail('n', 'Resolution', `Needs ${nExact.toFixed(2)} bits — beyond the 32 bits this page allows.`);
  } else if (s.solveFor === 'tjClk') {
    const best = sinadWith({ tjClk: 0 });
    if (best < target - tolDb) return fail('tjClk', 'Clock jitter', `Even a perfect clock gives only ${fmtDb(best)} (aperture jitter, quantization${s.vn > 0 ? ', thermal noise' : ''}${s.thd != null ? ', THD' : ''}); the target is ${target.toFixed(2)} dB.`);
    if (best <= target + tolDb) {
      s.tjClk = 0;
      warnings.push(`The ${target.toFixed(2)} dB target is met only with a perfect clock (0 s): the other noise terms already use the whole budget.`);
    } else if (sinadWith({ tjClk: 1e-6 }) >= target) {
      s.tjClk = 1e-6;
      warnings.push('Clock jitter up to 1 µs still meets the target — jitter does not limit this design.');
    } else {
      const r = invert((t) => sinadWith({ tjClk: t }), target, { lo: 1e-19, hi: 1e-6, samples: 260, log: true });
      if (!r.ok) return fail('tjClk', 'Clock jitter', 'No clock jitter between 0.1 as and 1 µs meets the target.');
      s.tjClk = r.roots[0];
    }
  } else if (s.solveFor === 'fin') {
    // finUnlimited: the target holds at every input frequency (no jitter) — reported as ∞, not as a failure.
    const best = sinadWith({ fin: 1e-3 });
    if (best < target - tolDb) return fail('fin', 'Input frequency', `Even at low frequency SINAD is only ${fmtDb(best)}, below the ${target.toFixed(2)} dB target; jitter is not the limit. Add bits, cut input noise, or narrow BW.`);
    if (Math.hypot(s.tjClk, s.tjAp) === 0 || sinadWith({ fin: 1e12 }) >= target) {
      finUnlimited = true;
      report.status = { text: 'NO LIMIT', tone: 'pass' };
      warnings.push(`The ${target.toFixed(2)} dB target is met at every input frequency (up to 1 THz): ${Math.hypot(s.tjClk, s.tjAp) === 0 ? 'with no jitter entered, f_in does not limit SNR. Enter the clock and aperture jitter for a real limit.' : 'jitter is too small to matter.'} Results below are at the f_in you entered.`);
    } else {
      const r = invert((f) => sinadWith({ fin: f }), target, { lo: 1e-3, hi: 1e12, samples: 300, log: true });
      if (!r.ok) return fail('fin', 'Input frequency', 'No input frequency meets the target.');
      s.fin = r.roots[0];
    }
  }

  const bw = s.bw > 0 ? s.bw : s.fs / 2;
  const o = adcSnr(inputsOf(s));
  // ── validity
  if (s.fin > s.fs / 2) notes.push(`f_in is above fs/2 (undersampling, Nyquist zone ${Math.floor((2 * s.fin) / s.fs) + 1}): the jitter term uses the analog f_in. Check the ADC’s full-power analog bandwidth.`);
  if (s.ain < -40) notes.push('At very low input levels real converters’ SNR in dBc falls dB for dB, as here, but DNL and spurs (not modelled) become comparable to the signal.');
  if (bw < s.fs / 2 && o.share.q > 0.5 && s.vn === 0) notes.push('Processing gain on quantization noise assumes it is white; for low-level or periodic signals it is correlated with the input unless dither (noise) is present.');
  if (s.n >= 20 && s.vn === 0) warnings.push(`N = ${s.n} bits with no input noise: real ≥ 20-bit converters are limited by thermal noise. Enter the datasheet input-referred noise.`);

  const dominant = (() => {
    const e = Object.entries(o.share).sort((a, b) => b[1] - a[1])[0];
    const names: Record<string, string> = { q: 'Quantization', th: 'Thermal noise', j: 'Jitter', thd: 'Distortion (THD)' };
    return { name: names[e[0]], frac: e[1] };
  })();

  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const finiteOrNull = (v: number) => (Number.isFinite(v) ? v : null);
  const primary: ResultItem[] = [];
  if (s.solveFor === 'n') primary.push(item('n', 'Resolution', s.n, 'bit', `${s.n} bits`, { symbol: 'N', solved: true, primary: true, note: `exact ${nExact!.toFixed(2)} bits for ${target.toFixed(2)} dB` }));
  if (s.solveFor === 'tjClk') primary.push(item('tjClk', 'Max clock jitter', s.tjClk, 's', si(s.tjClk, 's', 4), { symbol: 't_j', solved: true, primary: true, note: `total with aperture ${si(o.tj, 's', 3)} rms` }));
  if (s.solveFor === 'fin')
    primary.push(
      finUnlimited
        ? item('fin', 'Max input frequency', null, 'Hz', '∞', { symbol: 'f_in', solved: true, primary: true, note: 'target met at every frequency' })
        : item('fin', 'Max input frequency', s.fin, 'Hz', si(s.fin, 'Hz', 4), { symbol: 'f_in', solved: true, primary: true, note: `for ${target.toFixed(2)} dB` }),
    );
  if (!solving) {
    primary.push(item('snr', 'SINAD', finiteOrNull(o.sinad), 'dB', fmtDb(o.sinad), { symbol: 'SINAD', solved: true, primary: true, note: `in ${si(bw, 'Hz', 3)} at ${s.ain} dBFS` }));
    primary.push(item('enob', 'ENOB', finiteOrNull(o.enob), 'bit', Number.isFinite(o.enob) ? `${o.enob.toFixed(2)} bits` : '∞', { symbol: 'ENOB', solved: true, primary: true }));
  } else {
    primary.push(item('sinad', 'SINAD achieved', finiteOrNull(o.sinad), 'dB', fmtDb(o.sinad), { symbol: 'SINAD', primary: true, note: `target ${target.toFixed(2)} dB` }));
    primary.push(item('enobAchieved', 'ENOB achieved', finiteOrNull(o.enob), 'bit', Number.isFinite(o.enob) ? `${o.enob.toFixed(2)} bits` : '∞', { symbol: 'ENOB', primary: true }));
  }
  primary.push(item('limitedBy', 'Limited by', dominant.name, '', dominant.name, { primary: true, note: `${(dominant.frac * 100).toFixed(0)} % of the noise power` }));

  const g1 = 'SNR terms (dBc, DC…fs/2)';
  // o.snr already includes the processing gain: refer back to the Nyquist band and to full scale (MT-001).
  const nsd = -(o.snr - o.pg - s.ain) - 10 * Math.log10(s.fs / 2);
  const rest: ResultItem[] = [];
  if (solving) {
    const tEnob = (target - DB_1P5 - s.ain) / DB_PER_BIT;
    rest.push(
      item('snr', 'Target SINAD', target, 'dB', `${target.toFixed(2)} dB`, { symbol: 'SINAD', group: 'Target', solved: s.targetAs !== 'snr' }),
      item('enob', 'Target ENOB', tEnob, 'bit', `${tEnob.toFixed(3)} bits`, { symbol: 'ENOB', group: 'Target', solved: s.targetAs !== 'enob' }),
    );
  }
  rest.push(
    item('snrQ', 'Quantization', finiteOrNull(o.snrQ), 'dB', fmtDb(o.snrQ), { symbol: 'SNR_q', group: g1, note: `6.02N + 1.76 dB${s.ain !== 0 ? ` + (${s.ain} dBFS)` : ''}` }),
    item('snrTh', 'Thermal noise', finiteOrNull(o.snrTh), 'dB', s.vn > 0 ? fmtDb(o.snrTh) : '— (none)', { symbol: 'SNR_th', group: g1 }),
    item('snrJ', 'Jitter', finiteOrNull(o.snrJ), 'dB', o.tj > 0 ? fmtDb(o.snrJ) : '— (none)', { symbol: 'SNR_j', group: g1, note: '−20·log10(2π f_in t_j)' }),
    item('pg', 'Processing gain', o.pg, 'dB', fmtDb(o.pg), { symbol: 'PG', group: g1, note: `fs/(2·BW) = ${(s.fs / (2 * bw)).toPrecision(4)}` }),
    item('snrTotal', 'SNR in BW (no THD)', finiteOrNull(o.snr), 'dB', fmtDb(o.snr), { symbol: 'SNR', group: 'In bandwidth BW' }),
    item('snrFs', 'SNR in BW', finiteOrNull(o.snrFs), 'dBFS', Number.isFinite(o.snrFs) ? `${o.snrFs.toFixed(2)} dBFS` : '∞', { symbol: 'SNR_FS', group: 'In bandwidth BW' }),
    item('nsd', 'Noise spectral density', finiteOrNull(nsd), 'dBFS/Hz', Number.isFinite(nsd) ? `${nsd.toFixed(1)} dBFS/Hz` : '—', { symbol: 'NSD', group: 'In bandwidth BW', note: 'white-noise floor over DC…fs/2, excluding THD; independent of BW' }),
    item('tj', 'Total jitter (RSS)', o.tj, 's', si(o.tj, 's', 4), { symbol: 't_j,tot', group: 'Converter & clock' }),
    item('lsb', 'LSB size', o.lsb, 'V', si(o.lsb, 'V', 4), { symbol: 'q', group: 'Converter & clock' }),
    item('shareQ', 'Quantization share', o.share.q, '', `${(o.share.q * 100).toFixed(1)} %`, { group: 'Noise budget (power)' }),
    item('shareTh', 'Thermal share', o.share.th, '', `${(o.share.th * 100).toFixed(1)} %`, { group: 'Noise budget (power)' }),
    item('shareJ', 'Jitter share', o.share.j, '', `${(o.share.j * 100).toFixed(1)} %`, { group: 'Noise budget (power)' }),
  );
  if (s.thd != null) rest.push(item('shareThd', 'THD share', o.share.thd, '', `${(o.share.thd * 100).toFixed(1)} %`, { group: 'Noise budget (power)' }));
  report.results = [...primary, ...rest];
  report.summary = `${s.n}-bit at ${si(s.fs, 'S/s', 4)}, f_in ${si(s.fin, 'Hz', 4)}, ${s.ain} dBFS · BW ${si(bw, 'Hz', 3)} · SINAD ${fmtDb(o.sinad)} · ENOB ${Number.isFinite(o.enob) ? o.enob.toFixed(2) : '∞'}`;
  notes.push(
    'Noise terms are independent and add in power (root-sum-square of RMS voltages): quantization q²/12, input-referred thermal noise, and jitter noise (2π f_in t_j)² relative to the signal.',
    'Processing gain assumes all three noise terms are white across DC…fs/2 and the output is ideally filtered to BW; THD is not reduced by it (harmonics are assumed to land in band).',
    'Ideal converter otherwise: DNL, spurs (SFDR) and clock phase-noise shape (close-in vs wideband) are not modelled — convert phase noise to RMS jitter over the relevant offset band first (ADI MT-008).',
  );
  report.details = { ...o, target: solving ? target : null, nExact, bw };
  report.graphs = graphs(s, bw, o.sinad, solving ? target : null);
  return report;
}

function graphs(s: AdcState, bw: number, sinad: number, target: number | null): GraphSpec[] {
  const ref = Math.max(s.fin, s.fs / 2);
  // start below f_in too, so the operating-point marker is on the graph (oversampled audio: f_in ≪ fs/2000)
  const fs = logspace(Math.max(Math.min(ref / 1e3, s.fin / 3), 1e-3), ref * 10, 241);
  const base = inputsOf(s);
  const pts = fs.map((f) => adcSnr({ ...base, fin: f }));
  const o0 = pts[0];
  const series: GraphSpec['series'] = [{ label: s.thd != null ? 'SINAD (total)' : 'SNR (total)', x: fs, y: pts.map((p) => p.sinad), axis: 'db', width: 2.4 }];
  series.push({ label: 'Quantization', x: fs, y: fs.map(() => o0.snrQ + o0.pg), axis: 'db', color: '#4f8a8b', width: 1.4, dash: [5, 3] });
  if (s.vn > 0) series.push({ label: 'Thermal', x: fs, y: fs.map(() => o0.snrTh + o0.pg), axis: 'db', color: '#6b5b95', width: 1.4, dash: [5, 3] });
  const tj = Math.hypot(s.tjClk, s.tjAp);
  if (tj > 0) series.push({ label: `Jitter ${si(tj, 's', 3)}`, x: fs, y: fs.map((f) => jitterSnr(f, tj) + o0.pg), axis: 'db', color: '#c47b17', width: 1.6 });
  for (const tr of [100e-15, 1e-12]) {
    if (tj > 0 && Math.abs(Math.log10(tr / tj)) < 0.15) continue;
    series.push({ label: `${si(tr, 's')} ref.`, x: fs, y: fs.map((f) => jitterSnr(f, tr) + o0.pg), axis: 'db', color: '#9a8f7a', width: 1, dash: [2, 3], noReadout: true });
  }
  const yMax = Math.min(Math.max(o0.snrQ + o0.pg, Number.isFinite(sinad) ? sinad : 0) + 15, 250);
  const g1: GraphSpec = {
    id: 'snr-vs-fin',
    title: 'SNR vs input frequency',
    subtitle: `${s.n} bits, ${s.ain} dBFS, BW ${si(bw, 'Hz', 3)}`,
    x: { label: 'Input frequency', unit: 'Hz', log: true },
    y: [{ id: 'db', label: 'SNR', unit: 'dB', min: Math.max(0, Math.floor((Math.min(...pts.map((p) => p.sinad)) - 10) / 10) * 10), max: yMax }],
    series,
    hlines: target != null ? [{ value: target, label: `target ${target.toFixed(1)} dB`, axis: 'db', color: '#8b1e1e', dash: [4, 3] }] : [],
    vlines: [{ value: s.fin, label: `f_in = ${si(s.fin, 'Hz', 3)}` }, { value: s.fs / 2, label: 'fs/2', color: '#9a8f7a', dash: [2, 3] }],
    markers: Number.isFinite(sinad) ? [{ x: s.fin, y: sinad, axis: 'db', label: `${sinad.toFixed(1)} dB` }] : [],
  };
  const ns = Array.from({ length: 28 }, (_, i) => i + 4);
  const g2: GraphSpec = {
    id: 'snr-vs-bits',
    title: 'SINAD vs resolution',
    subtitle: `f_in ${si(s.fin, 'Hz', 3)}: extra bits stop helping once jitter or thermal noise dominates`,
    x: { label: 'Resolution N', unit: 'bit', integer: true },
    y: [{ id: 'db', label: 'SINAD', unit: 'dB', max: Math.ceil((Math.max(...ns.map((n) => adcSnr({ ...base, n }).sinad).filter(Number.isFinite), 0) + 30) / 10) * 10 }],
    series: [
      { label: 'This design', x: ns, y: ns.map((n) => adcSnr({ ...base, n }).sinad), axis: 'db', width: 2.4 },
      { label: 'Ideal 6.02N + 1.76 + PG', x: ns, y: ns.map((n) => idealSnr(n) + s.ain + adcSnr(base).pg), axis: 'db', color: '#9a8f7a', width: 1.2, dash: [5, 3] },
    ],
    hlines: target != null ? [{ value: target, label: `target ${target.toFixed(1)} dB`, axis: 'db', color: '#8b1e1e', dash: [4, 3] }] : [],
    markers: Number.isFinite(sinad) ? [{ x: s.n, y: sinad, axis: 'db', label: `N = ${s.n}` }] : [],
  };
  return [g1, g2];
}

export const def: CalcDef<AdcState> = {
  id: 'signal/adc-snr',
  version: '0.1.0',
  method:
    'ADC noise budget: ideal quantization SNR 6.02N + 1.76 dB and oversampling processing gain 10·log10(fs/2BW) (ADI MT-001), jitter-limited SNR −20·log10(2π f_in t_j) with clock and aperture jitter added RSS (ADI MT-007/MT-008, AN-756), input-referred thermal noise, all combined as noise powers; SINAD with THD and ENOB = (SINAD − 1.76 − A_in)/6.02 (ADI MT-003). Solve-for uses bracketed Brent root finding on SINAD.',
  fields,
  defaults,
  solve: {
    default: 'snr',
    analysis: 'snr',
    options: [
      { key: 'snr', label: 'SINAD and ENOB (analysis)' },
      { key: 'n', label: 'Bits N needed for a target SINAD / ENOB' },
      { key: 'tjClk', label: 'Max clock jitter for a target' },
      { key: 'fin', label: 'Max input frequency for a target' },
    ],
  },
  compute,
  // set by the ◎ buttons rather than a form field; listed so the AI API can set it too (guide §10)
  controls: {
    targetAs: (raw) => {
      const v = String(raw);
      if (!['snr', 'enob'].includes(v)) throw new Error('targetAs must be one of "snr", "enob"');
      return v;
    },
  },
  sync: (s) => {
    // keep the typed target pair consistent when not analysing
    if (s.solveFor === 'snr') return;
    if (s.targetAs === 'enob') s.snr = s.enob * DB_PER_BIT + DB_1P5 + s.ain;
    else s.enob = (s.snr - DB_1P5 - s.ain) / DB_PER_BIT;
  },
  examples: [
    { id: 'if-sampling', label: '14-bit 250 MSPS, 70 MHz IF, 100 fs clock', state: defaults() },
    { id: 'ideal-12', label: 'Ideal 12-bit, full scale: 74.0 dB (MT-001)', state: { solveFor: 'snr', n: 12, vn: 0, tjAp: 0, tjClk: 0, thd: null, ain: 0, fs: 100e6, fsUnit: 'MHz', bw: 0, fin: 1e6, finUnit: 'MHz' } },
    { id: 'jitter-100m-1ps', label: '1 ps jitter at 100 MHz: 64 dB limit (MT-008)', state: { solveFor: 'snr', n: 16, vn: 0, tjAp: 0, tjClk: 1e-12, thd: null, ain: 0, fs: 250e6, fsUnit: 'MHz', bw: 0, fin: 100e6, finUnit: 'MHz' } },
    { id: 'max-jitter', label: 'Max clock jitter for 70 dB at 200 MHz (16-bit)', state: { solveFor: 'tjClk', targetAs: 'snr', snr: 70, n: 16, vfs: 2, vn: 60e-6, tjAp: 60e-15, thd: null, ain: -1, fs: 500e6, fsUnit: 'MHz', bw: 0, fin: 200e6, finUnit: 'MHz' } },
    { id: 'oversampled-audio', label: 'Bits for 16 ENOB in 20 kHz, 3.072 MSPS (oversampled)', state: { solveFor: 'n', targetAs: 'enob', enob: 16, n: 16, vfs: 5, vn: 0, tjAp: 0, tjClk: 1e-12, thd: null, ain: 0, fs: 3.072e6, fsUnit: 'MHz', bw: 20e3, bwUnit: 'kHz', fin: 1e3, finUnit: 'kHz' } },
    { id: 'max-fin', label: 'Highest f_in for 10 ENOB with 250 fs clock', state: { solveFor: 'fin', targetAs: 'enob', enob: 10, n: 12, vfs: 1.5, vn: 0, tjAp: 100e-15, tjClk: 250e-15, thd: -80, ain: -1, fs: 1e9, fsUnit: 'GHz', bw: 0, fin: 100e6, finUnit: 'MHz' } },
  ],
};
