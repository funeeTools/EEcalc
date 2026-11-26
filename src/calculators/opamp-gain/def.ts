/** Op-amp gain (inverting / non-inverting / difference) — calculator definition. DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_OHM, withDefault } from '@/core/unitsets';
// Shared E-series pair search lives with the divider (candidate for core/eseries.ts).
import { bracketE } from '@/core/eseries';
import { R_STD_MAX, R_STD_MIN } from '@/core/eseries';
import { bestPairs } from '@/calculators/voltage-divider/model';
import { type Config, closedLoop, closedLoopBandwidth, diffAmpCmrr, idealGain, noiseGain, openLoopMag, resistorNoiseOut } from './model';

export const ID = 'general/opamp-gain';

/** Typical op-amp parameters (TI datasheets, 25 °C typical values). */
export const OPAMPS: Record<string, { gbw: number; a0: number; sr: number; doc: string } | null> = {
  Custom: null,
  LM358: { gbw: 0.7e6, a0: 100, sr: 0.3e6, doc: 'TI SLOS068 (LM358/LM358A)' },
  TL072H: { gbw: 5.25e6, a0: 120, sr: 20e6, doc: 'TI SLOS080W (TL07xH); A_OL at R_L = 2 kΩ' },
  NE5532: { gbw: 12e6, a0: 100, sr: 5e6, doc: 'TI SLOS075K electrical table (older revisions: 10 MHz, 9 V/µs)' },
  OPA2134: { gbw: 8e6, a0: 120, sr: 20e6, doc: 'TI SBOS058' },
};

export interface OpampState {
  solveFor: 'gain' | 'rf' | 'rin';
  config: Config;
  gain: number;
  rf: number;
  rfUnit: string;
  rin: number;
  rinUnit: string;
  opamp: string;
  gbw: number;
  gbwUnit: string;
  /** Open-loop DC gain, dB */
  a0: number;
  /** Slew rate, V/s; null = not checked */
  sr: number | null;
  srUnit: string;
  /** Signal frequency for gain/phase readout; null = none */
  fsig: number | null;
  fsigUnit: string;
  /** Output peak amplitude for the slew-rate check; null = none */
  vpk: number | null;
  eseries: string;
  /** Resistor tolerance, % */
  tol: number;
}

const U_R = withDefault(U_OHM, 'kΩ');
const U_F = withDefault(U_FREQ, 'MHz');
const U_SR: Record<string, number> = { 'V/µs': 1e6, 'V/ns': 1e9, 'V/s': 1 };

export const defaults = (): OpampState => ({
  solveFor: 'rf',
  config: 'noninv',
  gain: 10,
  rf: 9e3,
  rfUnit: 'kΩ',
  rin: 1e3,
  rinUnit: 'kΩ',
  opamp: 'LM358',
  gbw: 0.7e6,
  gbwUnit: 'MHz',
  a0: 100,
  sr: 0.3e6,
  srUnit: 'V/µs',
  fsig: 1e3,
  fsigUnit: 'kHz',
  vpk: 1,
  eseries: 'E24',
  tol: 1,
});

const CONFIG_LABEL: Record<Config, string> = { noninv: 'Non-inverting', inv: 'Inverting', diff: 'Difference' };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Amplifier',
    note: 'Click ◎ to choose the unknown. Gain is entered as a magnitude; the sign follows the configuration.',
    fields: [
      {
        kind: 'select',
        key: 'config',
        label: 'Configuration',
        options: [
          { value: 'noninv', label: 'Non-inverting  G = 1 + Rf/Rin' },
          { value: 'inv', label: 'Inverting  G = −Rf/Rin' },
          { value: 'diff', label: 'Difference  G = Rf/Rin' },
        ],
        help: 'Non-inverting: Rin from the − input to ground. Inverting: signal through Rin to the − input, + input grounded. Difference: Rin/Rf on both inputs (R3 = Rin, R4 = Rf from + input to ground).',
        // |G| keeps its meaning across configurations, so a resistor design keeps its target. The one exception:
        // a target the non-inverting stage cannot reach (|G| < 1, or Rin for |G| = 1) goes back to analysis of
        // the resistors already entered instead of a red error.
        apply: (v, s) => {
          if (v === 'noninv' && s.solveFor !== 'gain' && (s.gain < 1 || (s.gain === 1 && s.solveFor === 'rin'))) s.solveFor = 'gain';
          // Rf = 0 Ω (a follower) has no inverting or difference equivalent: size Rf for the present gain instead.
          if (v !== 'noninv' && s.solveFor !== 'rf' && !(s.rf > 0)) s.solveFor = 'rf';
        },
      },
            // The gain range covers every ratio of the resistor ranges (1 mΩ … 1 TΩ), so analysis never lands outside it.
      { kind: 'number', key: 'gain', symbol: '|G|', label: 'Gain magnitude', suffix: 'V/V', solvable: true, min: 1e-15, max: 1e16 },
      // Rf = 0 Ω is the unity-gain follower (non-inverting |G| = 1), so it is allowed.
      { kind: 'number', key: 'rf', symbol: 'R_f', label: 'Feedback resistor', units: U_R, unitKey: 'rfUnit', solvable: true, min: 0, max: 1e12 },
      { kind: 'number', key: 'rin', symbol: 'R_in', label: 'Input / ground resistor', units: U_R, unitKey: 'rinUnit', solvable: true, min: 1e-3, max: 1e12, help: 'Non-inverting: from the − input to ground (often called Rg). Inverting and difference: in series with the signal input.' },
    ],
  },
  {
    kind: 'section',
    title: 'Op-amp',
    fields: [
      {
        kind: 'select',
        key: 'opamp',
        label: 'Op-amp preset',
        options: Object.keys(OPAMPS),
        apply: (v, s) => {
          const o = OPAMPS[v];
          if (o) {
            s.gbw = o.gbw;
            s.a0 = o.a0;
            s.sr = o.sr;
          }
        },
        help: 'Typical values from TI datasheets at 25 °C: LM358 (SLOS068), TL072H (SLOS080W; A_OL 120 dB at R_L = 2 kΩ), NE5532 (SLOS075K table: 12 MHz, 5 V/µs; older revisions list 10 MHz, 9 V/µs), OPA2134 (SBOS058B). GBW and slew rate vary with supply, load and revision.',
      },
      { kind: 'number', key: 'gbw', symbol: 'GBW', label: 'Gain-bandwidth product', units: U_F, unitKey: 'gbwUnit', min: 1, max: 1e11, help: 'Unity-gain frequency of the open-loop response (single-pole model).' },
      { kind: 'number', key: 'a0', symbol: 'A_OL', label: 'Open-loop DC gain', suffix: 'dB', min: 20, max: 200, help: 'Datasheet A_OL (100 V/mV = 100 dB). Sets the DC gain error and the open-loop pole GBW/A_OL.' },
      { kind: 'number', key: 'sr', symbol: 'SR', label: 'Slew rate', units: U_SR, unitKey: 'srUnit', optional: true, zeroHint: 'not checked', min: 1, max: 1e12 },
    ],
  },
  {
    kind: 'section',
    title: 'Signal & parts',
    fields: [
      { kind: 'number', key: 'fsig', symbol: 'f', label: 'Signal frequency', units: withDefault(U_FREQ, 'kHz'), unitKey: 'fsigUnit', optional: true, zeroHint: 'none', min: 1e-3, max: 1e11, help: 'Optional: gain and phase are reported at this frequency and it is marked on the Bode plot.' },
      { kind: 'number', key: 'vpk', symbol: 'V_pk', label: 'Output amplitude (peak)', unit: 'V', optional: true, zeroHint: 'none', min: 1e-6, max: 1e4, help: 'Optional: with the slew rate, gives the full-power bandwidth SR/(2π·Vpk).' },
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E48', 'E96'] },
      { kind: 'number', key: 'tol', symbol: 'tol', label: 'Resistor tolerance', suffix: '%', min: 0, max: 20, help: 'Used for the gain range and, for the difference amplifier, the worst-case CMRR.' },
    ],
  },
];

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fHz = (f: number, d = 3) => si(f, 'Hz', d);
const dB = (x: number) => 20 * Math.log10(Math.abs(x));
const fG = (g: number, d = 5) => `${+g.toPrecision(d)} V/V`;
/** One decimal, no "-0.0", typographic minus. */
const fdB = (x: number) => (Math.abs(x) < 0.05 ? '0.0' : x.toFixed(1).replace('-', '−'));

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: OpampState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

interface PairG {
  rf: number;
  rin: number;
  g: number;
  err: number;
}

function run(st: OpampState): CalcReport {
  const s: OpampState = { ...st };
  const cfg = s.config;
  if (!['noninv', 'inv', 'diff'].includes(cfg)) throw new Error(`Unknown configuration "${String(cfg)}".`);
  const gbw = finite('GBW', s.gbw);
  const a0dB = finite('Open-loop gain', s.a0);
  const tol = finite('Tolerance', s.tol) / 100;
  if (!(gbw > 0)) throw new Error('GBW must be > 0.');
  if (tol < 0 || tol >= 0.5) throw new Error('Tolerance must be between 0 and 50 %.');
  const a0 = 10 ** (a0dB / 20);
  const sr = s.sr == null ? null : finite('Slew rate', s.sr);
  const fsig = s.fsig == null ? null : finite('Signal frequency', s.fsig);
  const vpk = s.vpk == null ? null : finite('Output amplitude', s.vpk);
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });
  if (s.solveFor !== 'gain' && !(finite('Gain', s.gain) > 0)) throw new Error('Gain magnitude must be > 0.');
  if (s.solveFor !== 'rf' && !(finite('Rf', s.rf) > 0 || (cfg === 'noninv' && s.rf === 0))) throw new Error(cfg === 'noninv' ? 'Rf must be ≥ 0 (0 Ω is a follower).' : 'Rf must be > 0.');
  if (s.solveFor !== 'rin' && !(finite('Rin', s.rin) > 0)) throw new Error('Rin must be > 0.');

  // ── solve (exact inverses of idealGain)
  switch (s.solveFor) {
    case 'gain':
      s.gain = Math.abs(idealGain(cfg, s.rf, s.rin));
      break;
    case 'rf':
      if (cfg === 'noninv' && s.gain < 1) return fail(`A non-inverting amplifier has |G| ≥ 1; ${+s.gain.toPrecision(4)} is not reachable. Use the inverting configuration or a divider before a buffer.`);
      s.rf = cfg === 'noninv' ? s.rin * (s.gain - 1) : s.rin * s.gain;
      // the Rf box accepts 0 (follower), so the lower limit for any other value is checked here
      if (s.rf > 0 && s.rf < 1e-3) return fail(`Rf would be ${fR(s.rf, 3)}, below the 1 mΩ this input accepts. Raise Rin or the gain.`);
      break;
    case 'rin':
      if (cfg === 'noninv' && s.gain < 1) return fail(`A non-inverting amplifier has |G| ≥ 1; ${+s.gain.toPrecision(4)} is not reachable.`);
      if (cfg === 'noninv' && s.gain === 1) return fail('Unity gain needs Rin = ∞ (leave it open) with any Rf, often 0 Ω: a voltage follower. Choose a gain above 1 to size Rin.');
      s.rin = cfg === 'noninv' ? s.rf / (s.gain - 1) : s.rf / s.gain;
      break;
    default:
      throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }

  const g = idealGain(cfg, s.rf, s.rin);
  const ng = noiseGain(s.rf, s.rin);
  const beta = 1 / ng;
  const loopDc = a0 * beta;
  const dcRe = closedLoop(cfg, s.rf, s.rin, a0, gbw, 0).re;
  const dcErr = dcRe / g - 1;
  const fc = closedLoopBandwidth(s.rf, s.rin, a0, gbw);
  const tr = 0.35 / fc;
  const fpbw = sr != null && vpk != null && vpk > 0 ? sr / (2 * Math.PI * vpk) : null;
  // Bandwidth needed for |G(f)| ≥ 0.99·G(0): f/fc ≤ √(1/0.99² − 1) = 0.1425 → fc ≥ 7.02·f; invert fc = GBW(1/A_OL + 1/NG).
  const gbwFor1pct = fsig != null ? fsig / Math.sqrt(1 / 0.99 ** 2 - 1) / (1 / a0 + 1 / ng) : null;

  // gain range from resistor tolerance (ratio extremes)
  const ratioHi = (s.rf * (1 + tol)) / (s.rin * (1 - tol));
  const ratioLo = (s.rf * (1 - tol)) / (s.rin * (1 + tol));
  const gHi = cfg === 'noninv' ? 1 + ratioHi : ratioHi;
  const gLo = cfg === 'noninv' ? 1 + ratioLo : ratioLo;

  // ── E-series pair
  let pair: PairG | null = null;
  let pairs: PairG[] = [];
  if (s.rf > 0 && Math.abs(g) > (cfg === 'noninv' ? 1 + 1e-9 : 0)) {
    const k = cfg === 'noninv' ? 1 / Math.abs(g) : 1 / (1 + Math.abs(g)); // Rin/(Rf+Rin)
    pairs = bestPairs(s.eseries, 1, k, null, s.rf + s.rin, 16).map((p) => {
      const gp = Math.abs(idealGain(cfg, p.r1, p.r2));
      return { rf: p.r1, rin: p.r2, g: gp, err: gp / Math.abs(g) - 1 };
    });
    pairs.sort((a, b) => Math.abs(a.err) - Math.abs(b.err));
    pairs = pairs.slice(0, 8);
    pair = pairs[0] ?? null;
  }

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const solved = s.solveFor;
  const results: ResultItem[] = [];
  if (solved === 'gain') results.push(item('gain', 'Gain magnitude', s.gain, 'V/V', fG(s.gain), { symbol: '|G|', solved: true, primary: true, note: `${dB(s.gain).toFixed(2)} dB · G = ${g < 0 ? '−' : '+'}${+Math.abs(g).toPrecision(5)}` }));
  else results.push(item(solved, solved === 'rf' ? 'Feedback resistor' : 'Input / ground resistor', s[solved], 'Ω', fR(s[solved]), { symbol: solved === 'rf' ? 'R_f' : 'R_in', solved: true, primary: true, note: solved === 'rf' && s.rf === 0 ? 'unity-gain follower' : 'exact value' }));
  if (solved !== 'gain') results.push(item('gainSigned', 'Signal gain', g, 'V/V', `${g < 0 ? '−' : '+'}${fG(Math.abs(g))}`, { symbol: 'G', primary: true, note: `${dB(g).toFixed(2)} dB` }));
  results.push(item('f3db', 'Closed-loop bandwidth', fc, 'Hz', fHz(fc, 4), { symbol: 'f_−3dB', primary: true, note: `≈ GBW / NG = ${fHz(gbw / ng)}` }));
  if (pair) results.push(item('pairGain', `Best ${s.eseries} pair`, pair.g, 'V/V', `${fR(pair.rf, 3)} / ${fR(pair.rin, 3)}`, { primary: true, note: `Rf / Rin → ${+pair.g.toPrecision(5)} V/V (${pair.err >= 0 ? '+' : '−'}${Math.abs(pair.err * 100).toFixed(2)} %)`, tone: Math.abs(pair.err) > Math.max(tol, 0.005) ? 'warn' : '' }));
  else if (cfg === 'noninv') results.push(item('pairGain', 'Standard parts', 1, 'V/V', 'follower: Rf = 0 Ω, Rin open', { primary: true }));

  results.push(
    item('gainDb', 'Gain', dB(g), 'dB', `${dB(g).toFixed(3)} dB`, { group: 'Gain' }),
    item('noiseGain', 'Noise gain', ng, 'V/V', fG(ng), { symbol: 'NG = 1/β', group: 'Gain', note: '1 + Rf/Rin, sets the bandwidth' }),
    item('loopGain', 'Loop gain at DC', dB(loopDc), 'dB', `${fdB(dB(loopDc))} dB`, { symbol: 'A_OL·β', group: 'Gain' }),
    item('dcGainActual', 'DC gain with finite A_OL', dcRe, 'V/V', fG(Math.abs(dcRe), 7), { group: 'Gain' }),
    item('dcGainErr', 'DC gain error', dcErr, '', `${dcErr < 0 ? '−' : '+'}${Math.abs(dcErr * 100).toPrecision(3)} %`, { group: 'Gain', note: '≈ −NG / A_OL', tone: Math.abs(dcErr) > 0.01 ? 'warn' : '' }),
    item('gainRange', `Gain at ±${+(tol * 100).toPrecision(3)} % resistors`, gLo, 'V/V', `${+gLo.toPrecision(5)} … ${+gHi.toPrecision(5)} V/V`, { group: 'Gain' }),
    item('riseTime', 'Small-signal rise time', tr, 's', si(tr, 's', 3), { symbol: 't_r', group: 'Frequency', note: '10–90 %, 0.35 / f₋₃dB' }),
    item('openLoopPole', 'Open-loop pole', gbw / a0, 'Hz', fHz(gbw / a0), { symbol: 'f_p', group: 'Frequency', note: 'GBW / A_OL' }),
  );
  if (fsig != null) {
    const h = closedLoop(cfg, s.rf, s.rin, a0, gbw, fsig);
    const mag = Math.hypot(h.re, h.im);
    const ph = (Math.atan2(h.im, h.re) * 180) / Math.PI;
    const err = mag / Math.abs(g) - 1;
    const bwErr = mag / Math.abs(dcRe) - 1; // bandwidth part only (DC error excluded)
    results.push(
      item('gainAtF', `|G| at ${fHz(fsig)}`, mag, 'V/V', `${fG(mag)} (${err < 0 ? '−' : '+'}${Math.abs(err * 100).toPrecision(3)} %)`, { group: 'Frequency', tone: Math.abs(err) > 0.01 ? 'warn' : '' }),
      item('phaseAtF', `Phase at ${fHz(fsig)}`, ph, '°', `${ph.toFixed(2)}°`, { group: 'Frequency' }),
      item('gbwFor1pct', 'GBW for ≤ 1 % error at f', gbwFor1pct!, 'Hz', fHz(gbwFor1pct!), { group: 'Frequency', note: '≈ 7.0 · f · NG (bandwidth error only)' }),
    );
    if (Math.abs(bwErr) > 0.01) warnings.push(`At ${fHz(fsig)} the gain is ${(-bwErr * 100).toFixed(1)} % below its DC value (bandwidth ${fHz(fc)}). For < 1 % error choose an op-amp with GBW ≥ ${fHz(gbwFor1pct!)}.`);
  }
  if (fpbw != null) {
    results.push(item('fpbw', `Full-power bandwidth at ${si(vpk!, 'V', 3)} pk`, fpbw, 'Hz', fHz(fpbw), { symbol: 'f_FP', group: 'Frequency', note: 'SR / (2π·Vpk)', tone: fsig != null && fpbw < fsig ? 'fail' : '' }));
    if (fsig != null && fpbw < fsig) warnings.push(`Slew-rate limit: a ${si(vpk!, 'V', 3)} peak sine is only undistorted up to ${fHz(fpbw)}, below the ${fHz(fsig)} signal. Use a faster op-amp (SR ≥ ${si(2 * Math.PI * fsig * vpk!, 'V/s', 3)}) or less output swing.`);
    else if (fpbw < fc) notes.push(`For large signals the slew rate, not GBW, limits the bandwidth (${fHz(fpbw)} at ${si(vpk!, 'V', 3)} peak).`);
  }

  // input impedance and bias / noise
  const rbal = s.rf > 0 ? (s.rf * s.rin) / (s.rf + s.rin) : 0;
  if (cfg === 'noninv') results.push(item('zin', 'Input impedance', null, 'Ω', 'op-amp input (very high)', { symbol: 'Z_in', group: 'Impedances & noise', note: 'signal drives the + input directly' }));
  else if (cfg === 'inv') results.push(item('zin', 'Input impedance', s.rin, 'Ω', fR(s.rin), { symbol: 'Z_in', group: 'Impedances & noise', note: '− input is a virtual ground' }));
  else
    results.push(
      item('zin', 'Differential input resistance', 2 * s.rin, 'Ω', fR(2 * s.rin), { symbol: 'R_diff', group: 'Impedances & noise' }),
      item('zinPlus', 'Input resistance at V₂ (+)', s.rin + s.rf, 'Ω', fR(s.rin + s.rf), { group: 'Impedances & noise', note: 'R3 + R4' }),
      item('zinMinus', 'Input resistance at V₁ (−)', s.rin, 'Ω', fR(s.rin), { group: 'Impedances & noise', note: 'with V₂ grounded; depends on V₂ otherwise' }),
    );
  if (cfg !== 'diff') results.push(item('rBias', 'Bias-balance resistor', rbal, 'Ω', fR(rbal, 3), { group: 'Impedances & noise', note: 'Rf ∥ Rin in series with the + input (bipolar inputs)' }));
  const en = resistorNoiseOut(cfg, s.rf, s.rin);
  results.push(
    item('noiseOut', 'Resistor noise at output', en, 'V/√Hz', `${si(en, 'V', 3)}/√Hz`, { group: 'Impedances & noise', note: 'thermal, 25 °C, op-amp noise excluded' }),
    item('noiseIn', 'Referred to input', en / Math.abs(g), 'V/√Hz', `${si(en / Math.abs(g), 'V', 3)}/√Hz`, { group: 'Impedances & noise' }),
  );
  if (cfg === 'diff') {
    const cmrr = diffAmpCmrr(Math.abs(g), tol);
    results.push(item('cmrr', `Worst-case CMRR, ±${+(tol * 100).toPrecision(3)} % resistors`, Number.isFinite(cmrr) ? dB(cmrr) : null, 'dB', Number.isFinite(cmrr) ? `${dB(cmrr).toFixed(1)} dB` : '∞ (ideal match)', { symbol: 'CMRR', group: 'Difference amplifier', note: '≈ (1 + G)/(4·tol), resistor mismatch only' }));
    if (Number.isFinite(cmrr) && dB(cmrr) < 60) notes.push(`Resistor matching limits CMRR to ${dB(cmrr).toFixed(0)} dB. A matched resistor network or an integrated difference amplifier gives 80 dB or more.`);
  }
  if (pair) {
    results.push(
      item('pairRf', `${s.eseries} Rf`, pair.rf, 'Ω', fR(pair.rf, 3), { group: `Best ${s.eseries} pair`, symbol: 'R_f' }),
      item('pairRin', `${s.eseries} Rin`, pair.rin, 'Ω', fR(pair.rin, 3), { group: `Best ${s.eseries} pair`, symbol: 'R_in' }),
      item('pairErr', 'Gain error', pair.err, '', `${pair.err >= 0 ? '+' : '−'}${Math.abs(pair.err * 100).toFixed(3)} %`, { group: `Best ${s.eseries} pair` }),
    );
    report.tables.push(pairTable(s, pairs, cfg, tol));
  }
  // Hand-design alternative: keep the resistor that was entered, round the solved one to the better neighbour.
  if ((solved === 'rf' || solved === 'rin') && s[solved] > 0) {
    const other = solved === 'rf' ? s.rin : s.rf;
    const cands = bracketE(s.eseries, s[solved])
      .filter((x) => x >= R_STD_MIN && x <= R_STD_MAX)
      .map((x) => {
        const gp = Math.abs(solved === 'rf' ? idealGain(cfg, x, other) : idealGain(cfg, other, x));
        return { x, gp, err: gp / Math.abs(g) - 1 };
      });
    cands.sort((a, b) => Math.abs(a.err) - Math.abs(b.err));
    const c = cands[0];
    if (!c)
      results.push(item('keepPick', `Keeping ${solved === 'rf' ? 'Rin' : 'Rf'} = ${fR(other, 3)}`, null, 'Ω', `no practical resistor (${fR(s[solved], 3)} is outside ${fR(R_STD_MIN, 1)} … ${fR(R_STD_MAX, 2)})`, { group: `Best ${s.eseries} pair`, tone: 'warn' }));
    else results.push(
      item('keepPick', `Keeping ${solved === 'rf' ? 'Rin' : 'Rf'} = ${fR(other, 3)}`, c.x, 'Ω', `${solved === 'rf' ? 'Rf' : 'Rin'} = ${fR(c.x, 3)} → ${+c.gp.toPrecision(5)} V/V (${c.err >= 0 ? '+' : '−'}${Math.abs(c.err * 100).toFixed(2)} %)`, { group: `Best ${s.eseries} pair`, note: 'for comparison' }),
    );
  }
  report.results = results;

  // ── warnings & notes
  if (ng < 2) notes.push('Low noise gain: the single-pole model is optimistic here. Real op-amps have further poles that cause peaking near unity gain, and decompensated parts are not stable at all. Check the datasheet’s minimum stable gain.');
  if (Math.abs(dcErr) > 0.01) warnings.push(`Loop gain A_OL·β is only ${fdB(dB(loopDc))} dB, so the DC gain is ${Math.abs(dcErr * 100).toFixed(1)} % below the ideal value. Lower the gain per stage or use an op-amp with higher A_OL.`);
  if (s.rf > 0 && (s.rf < R_STD_MIN || s.rf > R_STD_MAX || s.rin < R_STD_MIN || s.rin > R_STD_MAX)) warnings.push(`A gain resistor is outside the ${fR(R_STD_MIN, 1)} … ${fR(R_STD_MAX, 2)} range of practical parts. Change the other resistor or the gain.`);
  if (s.rf > 1e6 || s.rin > 1e6) warnings.push('Resistors above 1 MΩ: input bias current, leakage and stray capacitance (a few pF across Rf makes a pole) become significant. Scale both resistors down.');
  if ((s.rf > 0 && s.rf < 500) || (cfg !== 'noninv' && s.rin < 500)) notes.push('Feedback resistors below ~500 Ω load the op-amp output (and, for the inverting stage, the signal source).');
  if (pair && Math.abs(pair.err) > Math.max(tol, 0.005)) warnings.push(`The closest ${s.eseries} pair is ${(pair.err * 100).toFixed(2)} % off: use a finer series or a series/parallel combination.`);
  notes.push(
    'Single-pole op-amp model A(s) = A_OL/(1 + s/ω_p). It ignores output swing limits, offset, the second pole and output impedance.',
    cfg === 'diff' ? 'Difference amplifier assumes R3 = Rin and R4 = Rf (matched pairs) and a low-impedance source on both inputs.' : 'Source impedance adds to Rin in the inverting configuration and changes the gain.',
  );
  report.summary = `${CONFIG_LABEL[cfg]} · G = ${g < 0 ? '−' : ''}${+Math.abs(g).toPrecision(4)} (${dB(g).toFixed(1)} dB) · NG ${+ng.toPrecision(4)} · f₋₃dB ${fHz(fc)} with GBW ${fHz(gbw)}`;
  report.details = { g, ng, beta, a0, fc, fp: gbw / a0, dcGain: dcRe, fpbw, pairs };
  report.graphs = graphs(s, cfg, a0, gbw, fc, fsig, g);
  return report;
}

function pairTable(s: OpampState, pairs: PairG[], cfg: Config, tol: number): TableSpec {
  const lim = Math.max(tol, 0.005); // same limit as the "pair is off" warning
  return {
    id: 'pairs',
    title: `Best ${s.eseries} Rf / Rin pairs (${cfg === 'noninv' ? 'G = 1 + Rf/Rin' : 'G = Rf/Rin'})`,
    columns: [
      { key: 'rf', label: 'Rf', unit: 'Ω' },
      { key: 'rin', label: 'Rin', unit: 'Ω' },
      { key: 'g', label: '|G|', unit: 'V/V' },
      { key: 'err', label: 'Error', unit: '%' },
    ],
    rows: pairs.map((p) => ({ rf: p.rf, rin: p.rin, g: p.g, err: p.err * 100 })),
    rowTones: pairs.map((p) => (Math.abs(p.err) > lim ? 'fail' : Math.abs(p.err) > lim / 2 ? 'warn' : 'pass')),
    display: pairs.map((p) => ({ rf: fR(p.rf, 3), rin: fR(p.rin, 3), g: String(+p.g.toPrecision(6)), err: `${p.err >= 0 ? '+' : '−'}${Math.abs(p.err * 100).toFixed(3)} %` })),
    note: `Resistor values within about half a decade of the present Rf + Rin, sorted by gain error. Rows turn yellow above half of ${+(lim * 100).toPrecision(3)} % gain error and red above it.`,
  };
}

function graphs(s: OpampState, cfg: Config, a0: number, gbw: number, fc: number, fsig: number | null, g: number): GraphSpec[] {
  const fp = gbw / a0;
  const lo = Math.max(Math.min(fp / 10, fc / 1e3, fsig ? fsig / 10 : Infinity), 1e-3);
  const hi = Math.max(gbw * 10, fsig ? fsig * 10 : 0);
  const n = 241;
  const fs = Array.from({ length: n }, (_, k) => lo * (hi / lo) ** (k / (n - 1)));
  if (fsig) fs.push(fsig);
  fs.push(fc);
  fs.sort((a, b) => a - b);
  const h = fs.map((f) => closedLoop(cfg, s.rf, s.rin, a0, gbw, f));
  const ng = noiseGain(s.rf, s.rin);
  const vls = [{ value: fc, label: `f₋₃dB ${fHz(fc)}`, color: '#9a8f7a' }, ...(fsig ? [{ value: fsig, label: `f = ${fHz(fsig)}`, color: '#1f4e5f', dash: [4, 3] }] : [])];
  // phase: unwrap the inverting 180° so the curve is continuous
  const phase = h.map((x) => {
    let p = (Math.atan2(x.im, x.re) * 180) / Math.PI;
    if (cfg === 'inv' && p < 0) p += 360;
    return p;
  });
  return [
    {
      id: 'bode-mag',
      title: 'Bode magnitude',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'db', label: 'Gain', unit: 'dB' }],
      series: [
        { label: 'Closed-loop |G|', x: fs, y: h.map((x) => 20 * Math.log10(Math.hypot(x.re, x.im))), axis: 'db', width: 2.4 },
        { label: 'Open-loop |A_OL|', x: fs, y: fs.map((f) => 20 * Math.log10(openLoopMag(a0, gbw, f))), axis: 'db', color: '#c47b17', width: 1.4, dash: [5, 3] },
        { label: 'Noise gain', x: [fs[0], fs[fs.length - 1]], y: [dB(ng), dB(ng)], axis: 'db', color: '#9a8f7a', width: 1, dash: [2, 3] },
      ],
      hlines: [{ value: dB(g) - 3.0103, label: '−3 dB', axis: 'db', color: '#8b1e1e', dash: [4, 4], width: 1 }],
      vlines: vls,
      markers: [{ x: fc, y: dB(closedLoop(cfg, s.rf, s.rin, a0, gbw, 0).re) - 3.0103, axis: 'db', label: fHz(fc) }],
    },
    {
      id: 'bode-phase',
      title: 'Bode phase',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'ph', label: 'Phase', unit: '°' }],
      series: [{ label: 'Closed-loop phase', x: fs, y: phase, axis: 'ph', width: 2.2 }],
      vlines: vls,
    },
  ];
}

export const def: CalcDef<OpampState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Ideal feedback gain (1 + Rf/Rin, −Rf/Rin, Rf/Rin) with exact inverses for Rf and Rin; closed-loop response A/(1 + Aβ) of a single-pole op-amp A(s) = A_OL/(1 + s/ω_p), giving f₋₃dB = (GBW/A_OL)(1 + A_OL/NG); difference-amp CMRR from worst-case resistor ratios; resistor thermal noise 4kTR (S. Franco, Design with Operational Amplifiers, 4th ed., ch. 1, 2, 6). Op-amp presets from TI datasheets.',
  fields,
  defaults,
  solve: {
    default: 'rf',
    analysis: 'gain',
    options: [
      { key: 'gain', label: 'Gain from Rf and Rin (analysis)' },
      { key: 'rf', label: 'Rf for a target gain' },
      { key: 'rin', label: 'Rin for a target gain' },
    ],
  },
  compute,
  sync: (s) => {
    const o = OPAMPS[s.opamp];
    if (o && (Math.abs(o.gbw - s.gbw) > 1e-6 || Math.abs(o.a0 - s.a0) > 1e-9 || s.sr == null || Math.abs(o.sr - s.sr) > 1e-6)) s.opamp = 'Custom';
  },
  examples: [
    { id: 'noninv-10', label: 'Non-inverting ×10 with an LM358 (1 kHz, 1 V pk)', state: defaults() },
    { id: 'inv-mic', label: 'Inverting ×−47 mic preamp, NE5532, 20 kHz', state: { solveFor: 'rf', config: 'inv', gain: 47, rin: 2.2e3, opamp: 'NE5532', gbw: 12e6, a0: 100, sr: 5e6, fsig: 20e3, vpk: 3, eseries: 'E24', tol: 1 } },
    { id: 'analyse-100', label: 'Analyse 100k / 1k non-inverting with a TL072H', state: { solveFor: 'gain', config: 'noninv', rf: 100e3, rin: 1e3, opamp: 'TL072H', gbw: 5.25e6, a0: 120, sr: 20e6, fsig: 20e3, vpk: 5, eseries: 'E24', tol: 1 } },
    { id: 'diff-shunt', label: 'Difference amp ×20 for a current shunt (CMRR from 1 % parts)', state: { solveFor: 'rf', config: 'diff', gain: 20, rin: 1e3, opamp: 'OPA2134', gbw: 8e6, a0: 120, sr: 20e6, fsig: 1e3, vpk: 2, eseries: 'E96', tol: 1 } },
    { id: 'gbw-limit', label: 'Gain ×1000 in one LM358 stage (bandwidth too low)', state: { solveFor: 'rin', config: 'noninv', gain: 1000, rf: 1e6, opamp: 'LM358', gbw: 0.7e6, a0: 100, sr: 0.3e6, fsig: 5e3, vpk: 1, eseries: 'E24', tol: 1 } },
    { id: 'inv-unity', label: 'Inverting unity-gain buffer (10k / 10k)', state: { solveFor: 'gain', config: 'inv', rf: 10e3, rin: 10e3, opamp: 'TL072H', gbw: 5.25e6, a0: 120, sr: 20e6, fsig: 100e3, vpk: 10, eseries: 'E24', tol: 0.1 } },
  ],
};
