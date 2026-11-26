/** Op-amp bandwidth (small-signal, full-power, cascades, phase margin) — calculator definition. DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { brent } from '@/core/calc/solve';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, withDefault } from '@/core/unitsets';
import { OPAMPS } from '@/calculators/opamp-gain/def';
import { type Amp, type Config, type Stage, cascadeBw, slewRise, fpbw, mag2, maxSlope, noiseGainOf, overshoot, peaking, riseTime, riseTime1, riseTimeErlang, secondPole, stage, step1, stepChain } from './model';

export const ID = 'general/opamp-bandwidth';

interface Preset {
  gbw: number;
  /** dB */
  a0: number;
  sr: number;
  /** Unity-gain phase margin (°), null = not stated (single-pole model) */
  pm: number | null;
  doc: string;
}

/** Op-amp presets: the opamp-gain list (TI data sheets, typical, 25 °C) plus three more, typical values. */
export const PRESETS: Record<string, Preset | null> = {
  Custom: null,
  ...Object.fromEntries(Object.entries(OPAMPS).filter(([, v]) => v).map(([k, v]) => [k, { gbw: v!.gbw, a0: v!.a0, sr: v!.sr, pm: null, doc: v!.doc }])),
  MCP6002: { gbw: 1e6, a0: 112, sr: 0.6e6, pm: 90, doc: 'Microchip DS20001733L (PM 90° at G = +1)' },
  TLV9002: { gbw: 1e6, a0: 117, sr: 2e6, pm: 78, doc: 'TI SBOS833R (V_S = 5 V; PM 78° at G = 1, 5.5 V)' },
  OPA350: { gbw: 38e6, a0: 122, sr: 22e6, pm: null, doc: 'TI SBOS099D (C_L = 100 pF)' },
};

export interface BwState {
  /** bw: bandwidths from the parts (analysis) · gbw: GBW for a target bandwidth · gain: largest gain · sr: slew rate for full power at that bandwidth */
  solveFor: 'bw' | 'gbw' | 'gain' | 'sr';
  config: Config;
  /** Signal gain magnitude per stage, V/V */
  gain: number;
  stages: number;
  opamp: string;
  gbw: number;
  gbwUnit: string;
  /** Open-loop DC gain, dB */
  a0: number;
  /** Unity-gain phase margin, °; null = single-pole */
  pm: number | null;
  sr: number;
  srUnit: string;
  /** Output amplitude (peak) of the last stage, V */
  vpk: number;
  /** Small-signal −3 dB bandwidth of the whole chain (answer, or the target when solving GBW / gain) */
  bw: number;
  bwUnit: string;
  /** Full-power bandwidth at V_pk (answer, or the target when solving the slew rate) */
  fp: number;
  fpUnit: string;
}

export const defaults = (): BwState => ({
  solveFor: 'bw',
  config: 'noninv',
  gain: 10,
  stages: 1,
  opamp: 'TLV9002',
  gbw: 1e6,
  gbwUnit: 'MHz',
  a0: 117,
  pm: 78,
  sr: 2e6,
  srUnit: 'V/µs',
  vpk: 2,
  bw: 100e3,
  bwUnit: 'kHz',
  fp: 159e3,
  fpUnit: 'kHz',
});

const U_GBW = { ...withDefault(U_FREQ, 'MHz'), mHz: 1e-3 };
const U_BW = { ...withDefault(U_FREQ, 'kHz'), mHz: 1e-3, 'µHz': 1e-6, nHz: 1e-9 };
const U_SR: Record<string, number> = { 'V/µs': 1e6, 'V/ns': 1e9, 'V/ms': 1e3, 'V/s': 1 };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Amplifier',
    note: 'Click ◎ to choose the unknown. Bandwidth is set by the noise gain, which is |G| + 1 for an inverting stage.',
    fields: [
      // an inverting gain below 1 has no non-inverting equivalent: the switch makes it the nearest one, a follower
      { kind: 'select', key: 'config', label: 'Configuration', options: [{ value: 'noninv', label: 'Non-inverting  NG = |G|' }, { value: 'inv', label: 'Inverting  NG = |G| + 1' }], help: 'For the same signal gain an inverting stage has one more unit of noise gain, so less bandwidth (half as much at |G| = 1).', apply: (v, s) => { if (v === 'noninv' && s.gain < 1) s.gain = 1; } },
      { kind: 'number', key: 'gain', symbol: '|G|', label: 'Gain per stage', suffix: 'V/V', solvable: true, min: 1e-6, max: 1e7, onUnsolve: (_s, r) => (r.solveFor = 'bw'), help: 'Signal gain magnitude of each stage (non-inverting: ≥ 1).' },
      { kind: 'number', key: 'stages', symbol: 'n', label: 'Identical stages', integer: true, min: 1, max: 10, help: 'Cascading n equal stages multiplies the gain and shrinks the bandwidth by √(2^{1/n} − 1) for single-pole stages.' },
      { kind: 'number', key: 'bw', symbol: 'f_−3dB', label: 'Small-signal bandwidth', units: U_BW, unitKey: 'bwUnit', unitFamily: 'none', solvable: true, min: 1e-15, max: 1e12, solvedWhen: (_s, r) => r.solveFor === 'bw' || r.solveFor === 'sr', onSolve: (_s, r) => (r.solveFor = 'bw'), onUnsolve: (_s, r) => (r.solveFor = 'gbw'), help: '−3 dB bandwidth of the whole chain. An answer in analysis; the bandwidth you need when solving for GBW or gain.' },
    ],
  },
  {
    kind: 'section',
    title: 'Op-amp',
    fields: [
      {
        kind: 'select', key: 'opamp', label: 'Op-amp preset',
        options: Object.keys(PRESETS),
        apply: (v, s) => {
          const p = PRESETS[v as string];
          if (!p) return;
          s.gbw = p.gbw;
          s.a0 = p.a0;
          s.sr = p.sr;
          s.pm = p.pm;
          // a part swap is a new analysis, not a GBW / slew-rate design target
          if (s.solveFor === 'gbw' || s.solveFor === 'sr') s.solveFor = 'bw';
        },
        help: 'Typical data-sheet values: LM358 (TI SLOS068), TL072H (SLOS080W), NE5532 (SLOS075K), OPA2134 (SBOS058), MCP6002 (Microchip DS20001733L), TLV9002 (TI SBOS833R), OPA350 (SBOS099D). They vary with supply, load and temperature.',
      },
      { kind: 'number', key: 'gbw', symbol: 'GBW', label: 'Gain-bandwidth product', units: U_GBW, unitKey: 'gbwUnit', unitFamily: 'none', solvable: true, min: 1, max: 1e11, onUnsolve: (_s, r) => (r.solveFor = 'bw') },
      { kind: 'number', key: 'a0', symbol: 'A_OL', label: 'Open-loop DC gain', suffix: 'dB', min: 20, max: 200, help: 'Sets the open-loop pole GBW/A_OL; only matters at very high closed-loop gain.' },
      { kind: 'number', key: 'pm', symbol: 'φ_m', label: 'Phase margin at G = 1', suffix: '°', optional: true, zeroHint: 'single-pole', min: 1, max: 90, help: 'Optional, from the data sheet. Adds a second open-loop pole that gives this margin at unity gain, so the page shows peaking, overshoot and the true bandwidth at low gain. Leave blank for the single-pole (90°) model.' },
      { kind: 'number', key: 'sr', symbol: 'SR', label: 'Slew rate', units: U_SR, unitKey: 'srUnit', solvable: true, min: 1e-3, max: 1e12, onUnsolve: (_s, r) => (r.solveFor = 'bw') },
      { kind: 'number', key: 'vpk', symbol: 'V_pk', label: 'Output amplitude (peak)', unit: 'V', min: 1e-6, max: 1e4, help: 'Peak sine amplitude at the output of the last stage, for the full-power (slew-rate) bandwidth.' },
      { kind: 'number', key: 'fp', symbol: 'f_FP', label: 'Full-power bandwidth', units: U_BW, unitKey: 'fpUnit', unitFamily: 'none', solvable: true, min: 1e-15, max: 1e18, solvedWhen: (_s, r) => r.solveFor !== 'sr', onSolve: (_s, r) => (r.solveFor = 'sr'), onUnsolve: (_s, r) => (r.solveFor = 'sr'), help: 'Highest frequency a V_pk sine passes without slew distortion, SR/(2π·V_pk). An answer, or the target when solving for the slew rate (◎ here or on SR).' },
    ],
  },
];

const fHz = (f: number, d = 4) => si(f, 'Hz', d);
const fSr = (sr: number) => `${+(sr / 1e6).toPrecision(4)} V/µs`;
const dB = (x: number) => 20 * Math.log10(x);

function num(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: BwState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

const ampOf = (gbw: number, a0dB: number, pm: number | null): Amp => {
  const a0 = 10 ** (a0dB / 20);
  return { gbw, a0, f2: pm == null ? Infinity : secondPole(gbw, a0, pm) };
};

function chainBw(s: BwState, gbw: number, gain: number): number {
  const st = stage(ampOf(gbw, s.a0, s.pm), noiseGainOf(s.config, gain), gain);
  return cascadeBw(st, s.stages);
}

function fail(s: BwState, msg: string): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

// Mode-switch harness: its remaining "error-after-edit" flags are typed numbers that make the answer impossible
// (a non-inverting gain below 1, targets no GBW or gain can reach, a solved SR outside the input range).
function run(st: BwState): CalcReport {
  const s: BwState = { ...st };
  num('A_OL', s.a0);
  num('V_pk', s.vpk);
  const n = Math.round(num('Stages', s.stages));
  if (!(n >= 1 && n <= 10)) throw new Error('Use 1 to 10 stages.');
  s.stages = n;
  if (s.pm != null && !(num('Phase margin', s.pm) > 0 && s.pm <= 90)) throw new Error('Phase margin must be between 0 and 90°.');
  if (!(s.vpk > 0)) throw new Error('Output amplitude must be > 0.');
  const gMin = s.config === 'noninv' ? 1 : 1e-6;
  if (s.solveFor !== 'gain') {
    num('Gain', s.gain);
    if (!(s.gain >= gMin)) throw new Error(s.config === 'noninv' ? 'A non-inverting stage has a gain of at least 1 (a follower).' : 'Gain must be > 0.');
  }
  if (s.solveFor !== 'gbw' && !(num('GBW', s.gbw) > 0)) throw new Error('GBW must be > 0.');
  if (s.solveFor !== 'sr' && !(num('Slew rate', s.sr) > 0)) throw new Error('Slew rate must be > 0.');
  if ((s.solveFor === 'gbw' || s.solveFor === 'gain') && !(num('Bandwidth', s.bw) > 0)) throw new Error('Enter the bandwidth you need (> 0).');
  if (s.solveFor === 'sr' && !(num('Full-power bandwidth', s.fp) > 0)) throw new Error('Enter the full-power bandwidth you need (> 0).');

  // ── solve
  if (s.solveFor === 'gbw') {
    const g = (lg: number) => Math.log(chainBw(s, 10 ** lg, s.gain) / s.bw);
    const lo = 0;
    const hi = 11;
    if (g(hi) < 0) return fail(s, `Even GBW = 100 GHz gives only ${fHz(chainBw(s, 1e11, s.gain), 3)} at this gain and phase margin.`);
    if (g(lo) > 0) return fail(s, `The target bandwidth is below what GBW = 1 Hz gives; lower the gain or check the target.`);
    s.gbw = 10 ** brent(g, lo, hi, 1e-14);
  } else if (s.solveFor === 'gain') {
    const gHi = 1e7;
    const g = (lg: number) => Math.log(chainBw(s, s.gbw, 10 ** lg) / s.bw);
    const lgLo = Math.log10(gMin);
    if (g(lgLo) < 0) return fail(s, `${fHz(s.bw, 3)} is out of reach: even at the lowest gain (${s.config === 'noninv' ? 'a follower' : '|G| → 0'}) ${n > 1 ? `${n} stages give` : 'the stage gives'} only ${fHz(chainBw(s, s.gbw, gMin), 3)}. Use a faster op-amp${n > 1 ? ' or fewer stages' : ''}.`);
    if (g(Math.log10(gHi)) > 0) return fail(s, `Any gain up to 10⁷ still gives more than ${fHz(s.bw, 3)}: a stage’s bandwidth never falls below the open-loop pole GBW/A_OL = ${fHz(s.gbw / 10 ** (s.a0 / 20), 3)}. Raise the target bandwidth.`);
    s.gain = 10 ** brent(g, lgLo, Math.log10(gHi), 1e-14);
  }
  const amp = ampOf(s.gbw, s.a0, s.pm);
  const ng = noiseGainOf(s.config, s.gain);
  const stg = stage(amp, ng, s.gain);
  const bwStage = cascadeBw(stg, 1);
  const bwChain = cascadeBw(stg, n);
  if (s.solveFor === 'sr') s.sr = 2 * Math.PI * s.fp * s.vpk;
  // the band that must pass at full swing: the target when one is given, else the small-signal bandwidth
  const target = s.solveFor === 'gbw' || s.solveFor === 'gain' ? st.bw : s.solveFor === 'sr' ? st.fp : null;
  s.bw = bwChain;
  const fFP = fpbw(s.sr, s.vpk);
  s.fp = fFP;
  const usable = Math.min(bwChain, fFP);
  const pk = peaking(stg);
  const os = overshoot(stg);
  const tr1 = riseTime1(stg);
  const trN = n === 1 ? tr1 : stg.order === 1 ? riseTimeErlang(stg.fc, n) : chainRise(stg, n, tr1);
  const vStep = 2 * s.vpk;
  const slope = maxSlope(stg);
  const vSlew = s.sr / slope;
  // no slewing: exactly t_r. Slewing: slew at SR, then settle with τ = t_r/ln9 (the single-pole τ that has this
  // stage's rise time), never faster than t_r
  const slewing = vStep > vSlew;
  const trLarge = slewing ? Math.max(tr1, slewRise(vStep, s.sr, tr1 / Math.log(9))) : tr1;
  const gTotal = s.gain ** n;

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const res: ResultItem[] = [];
  const solved = s.solveFor;
  if (solved === 'gbw') res.push(item('gbw', 'Required GBW', s.gbw, 'Hz', fHz(s.gbw), { symbol: 'GBW', solved: true, primary: true, note: `for ${fHz(target!, 3)} at NG = ${+ng.toPrecision(4)}${n > 1 ? `, ${n} stages` : ''}` }));
  if (solved === 'gain') res.push(item('gain', 'Largest gain per stage', s.gain, 'V/V', `${+s.gain.toPrecision(5)} V/V`, { symbol: '|G|', solved: true, primary: true, note: `${dB(s.gain).toFixed(2)} dB per stage` }));
  if (solved === 'sr') res.push(item('sr', 'Required slew rate', s.sr, 'V/s', fSr(s.sr), { symbol: 'SR', solved: true, primary: true, note: `2π·f·V_pk for ${fHz(target!, 3)} at ${si(s.vpk, 'V', 3)} pk` }));
  res.push(item('bw', n > 1 ? `Bandwidth of ${n} stages` : 'Small-signal bandwidth', bwChain, 'Hz', fHz(bwChain), { symbol: 'f_−3dB', solved: solved === 'bw' || solved === 'sr', primary: true, note: n > 1 ? `one stage: ${fHz(bwStage, 3)}` : `≈ GBW/NG = ${fHz(s.gbw / ng, 3)}` }));
  res.push(item('fp', `Full-power bandwidth at ${si(s.vpk, 'V', 3)} pk`, fFP, 'Hz', fHz(fFP), { symbol: 'f_FP', primary: true, solved: solved !== 'sr', note: 'SR/(2π·V_pk)', tone: fFP < bwChain ? 'warn' : '' }));
  res.push(item('usable', 'Usable bandwidth at this swing', usable, 'Hz', fHz(usable), { symbol: 'f_max', primary: solved !== 'sr', note: fFP < bwChain ? 'slew-rate limited' : 'small-signal limited' }));
  const gS = 'Per stage';
  res.push(
    item('noiseGain', 'Noise gain', ng, 'V/V', `${+ng.toPrecision(5)} V/V`, { symbol: 'NG = 1/β', group: gS, note: s.config === 'inv' ? '|G| + 1' : '= |G|' }),
    item('bwStage', 'Stage bandwidth', bwStage, 'Hz', fHz(bwStage), { symbol: 'f_−3dB,1', group: gS }),
    item('dcErr', 'DC gain error (finite A_OL)', stg.dcGain / s.gain - 1, '', `${((stg.dcGain / s.gain - 1) * 100).toPrecision(3)} %`, { group: gS, note: '≈ −NG/A_OL' }),
    item('tr1', 'Rise time (10–90 %)', tr1, 's', si(tr1, 's', 3), { symbol: 't_r', group: gS, note: stg.order === 1 ? '0.35/f₋₃dB' : 'second-order step' }),
  );
  if (stg.order === 2) {
    res.push(
      item('pmHere', 'Phase margin at this gain', Number.isFinite(stg.pm) ? stg.pm : null, '°', Number.isFinite(stg.pm) ? `${stg.pm.toFixed(1)}°` : 'n/a', { symbol: 'φ_m', group: gS, tone: stg.pm < 45 ? 'fail' : stg.pm < 60 ? 'warn' : '' }),
      item('q', 'Closed-loop Q', stg.q, '', stg.q.toPrecision(3), { symbol: 'Q', group: gS, note: '0.707 = maximally flat' }),
      item('peak', 'Peaking', dB(pk.mp), 'dB', pk.mp > 1 ? `${dB(pk.mp).toFixed(2)} dB at ${fHz(pk.fp, 3)}` : 'none', { group: gS }),
      item('overshoot', 'Step overshoot', os * 100, '%', `${(os * 100).toFixed(1)} %`, { group: gS }),
    );
  }
  const gC = 'Chain';
  res.push(item('gTotal', 'Total gain', gTotal, 'V/V', `${+gTotal.toPrecision(5)} V/V (${dB(gTotal).toFixed(1)} dB)`, { symbol: '|G|ⁿ', group: gC }));
  if (n > 1) {
    res.push(
      item('shrink', 'Bandwidth shrinkage', bwChain / bwStage, '', (bwChain / bwStage).toPrecision(4), { group: gC, note: stg.order === 1 ? '√(2^{1/n} − 1)' : 'exact for the second-order stages' }),
      item('trN', 'Chain rise time', trN, 's', si(trN, 's', 3), { symbol: 't_r,n', group: gC, note: stg.order === 1 ? 'exact (n equal poles)' : 'numerical step response' }),
      item('oneStage', 'One stage with the same total gain', cascadeBw(stage(amp, noiseGainOf(s.config, gTotal), gTotal), 1), 'Hz', fHz(cascadeBw(stage(amp, noiseGainOf(s.config, gTotal), gTotal), 1), 3), { group: gC, note: 'for comparison' }),
    );
  }
  const gL = 'Large signal (last stage)';
  res.push(
    item('vpkMax', `Largest undistorted sine at ${fHz(usable, 3)}`, s.sr / (2 * Math.PI * usable), 'V', si(s.sr / (2 * Math.PI * usable), 'V', 3), { symbol: 'V_pk,max', group: gL, note: 'SR/(2π·f)' }),
    item('vSlew', 'Step size where slewing starts', vSlew, 'V', si(vSlew, 'V', 3), { symbol: 'ΔV_slew', group: gL, note: 'SR / steepest small-signal slope' }),
    item('trLarge', `Rise time of a ${si(vStep, 'V', 3)} step`, trLarge, 's', si(trLarge, 's', 3), { group: gL, note: slewing ? `slews at SR, then settles with τ = t_r/ln9${stg.order === 2 && stg.q > Math.SQRT1_2 ? ' (approximation: the stage rings)' : ''}` : 'linear (small-signal) = t_r' }),
    item('srNeeded', `SR for full power at ${fHz(bwChain, 3)}`, 2 * Math.PI * bwChain * s.vpk, 'V/s', fSr(2 * Math.PI * bwChain * s.vpk), { group: gL }),
  );
  const gO = 'Open loop';
  res.push(item('f1', 'Dominant pole', amp.gbw / amp.a0, 'Hz', fHz(amp.gbw / amp.a0, 3), { symbol: 'f₁ = GBW/A_OL', group: gO }));
  if (Number.isFinite(amp.f2)) res.push(item('f2', 'Second pole (from φ_m)', amp.f2, 'Hz', fHz(amp.f2, 3), { symbol: 'f₂', group: gO, note: `${(amp.f2 / amp.gbw).toPrecision(3)} × GBW` }));
  report.results = res;

  // ── warnings & notes
  const need = solved === 'sr' ? target! : bwChain;
  if (fFP < need * (1 - 1e-9)) warnings.push(`Slew-rate limit: a ${si(s.vpk, 'V', 3)} peak sine distorts above ${fHz(fFP, 3)}, below the ${fHz(need, 3)} ${target != null ? 'you need' : 'small-signal bandwidth'}. For full swing over that band you need SR ≥ ${fSr(2 * Math.PI * need * s.vpk)}, or less output swing.`);
  if (solved === 'sr' && bwChain < need) warnings.push(`The small-signal bandwidth (${fHz(bwChain, 3)}) is below the ${fHz(need, 3)} target, so slew rate alone does not get there: raise GBW or lower the gain.`);
  if (stg.order === 2 && stg.pm < 45) warnings.push(`Phase margin is only ${stg.pm.toFixed(0)}° at a noise gain of ${+ng.toPrecision(3)}: ${dB(pk.mp).toFixed(1)} dB of peaking and ${(os * 100).toFixed(0)} % overshoot. Run at a higher noise gain, add a feedback capacitor, or choose an op-amp that is stable at this gain.`);
  else if (stg.order === 2 && stg.pm < 60) notes.push(`Phase margin ${stg.pm.toFixed(0)}°: expect about ${(os * 100).toFixed(0)} % overshoot and some peaking; 60° or more gives a clean step.`);
  if (Math.abs(stg.dcGain / s.gain - 1) > 0.01) warnings.push(`The loop gain at DC is only ${dB(amp.a0 / ng).toFixed(0)} dB, so the gain is ${(Math.abs(stg.dcGain / s.gain - 1) * 100).toFixed(1)} % low and the bandwidth no longer follows GBW/NG. Spread the gain over more stages.`);
  if (bwChain > 0.3 * s.gbw && stg.order === 1) notes.push('Close to unity noise gain the bandwidth is set by the op-amp’s higher poles, which the single-pole model ignores. Enter the data-sheet phase margin for a better estimate.');
  if (s.pm == null) notes.push('Single-pole model (no phase margin given): the stage response has no peaking. Real op-amps add poles near GBW; enter the unity-gain phase margin to include them.');
  if (s.gbw > 500e6) notes.push('Current-feedback amplifiers do not trade gain for bandwidth like this; their bandwidth is set mainly by the feedback resistor. The model is for voltage-feedback op-amps.');
  if (n > 1) notes.push(`The full-power check applies to the last stage, which carries the largest swing; earlier stages swing ${s.gain > 1 ? `${+s.gain.toPrecision(3)}× less per stage` : 'the same or more'}.`);
  notes.push('GBW, slew rate and phase margin vary with supply, load capacitance and temperature; the data-sheet typical values are a starting point. Load capacitance in particular lowers the phase margin.');

  report.summary = `${s.opamp !== 'Custom' ? s.opamp : 'Op-amp'} · NG ${+ng.toPrecision(4)} × ${n} · f₋₃dB ${fHz(bwChain, 3)} · f_FP ${fHz(fFP, 3)} at ${si(s.vpk, 'V', 3)} pk`;
  report.details = { ng, stage: stg, f2: amp.f2, bwStage, bwChain, fpbw: fFP, usable, tr1, trN, vSlew, state: s };
  report.graphs = [bode(amp, stg, n, bwStage, bwChain, fFP), bwVsGain(s, amp, n, fFP), stepGraph(stg, n, tr1)];
  return report;
}

function chainRise(stg: Stage, n: number, tr1: number): number {
  const tEnd = (3 * Math.sqrt(n) + 2) * tr1 + 8 * stg.q / (2 * Math.PI * stg.f0);
  const r = stepChain(stg, n, tEnd, 6000);
  return riseTime(r.t, r.y);
}

function logspace(a: number, b: number, k: number): number[] {
  return Array.from({ length: k }, (_, i) => a * (b / a) ** (i / (k - 1)));
}

function bode(amp: Amp, stg: Stage, n: number, bwStage: number, bwChain: number, fFP: number): GraphSpec {
  const lo = Math.min(bwChain, fFP, amp.gbw / amp.a0) / 30;
  const hi = Math.max(amp.gbw, Number.isFinite(amp.f2) ? amp.f2 : 0, bwStage) * 20;
  const fs = logspace(lo, hi, 320);
  const st1 = fs.map((f) => dB(stg.dcGain) + 10 * Math.log10(mag2(stg, f)));
  const ol = fs.map((f) => dB(amp.a0) - 10 * Math.log10((1 + (f / (amp.gbw / amp.a0)) ** 2) * (Number.isFinite(amp.f2) ? 1 + (f / amp.f2) ** 2 : 1)));
  const series = [
    { label: 'Open loop |A_OL|', x: fs, y: ol, axis: 'db', color: '#9a8f7a', width: 1.3, dash: [5, 3] },
    { label: n > 1 ? 'One stage' : 'Closed loop', x: fs, y: st1, axis: 'db', color: '#1f4e5f', width: 2.2 },
  ];
  if (n > 1) series.push({ label: `${n} stages`, x: fs, y: st1.map((v) => n * v), axis: 'db', color: '#c47b17', width: 2.2 });
  return {
    id: 'bode',
    title: 'Gain vs frequency',
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'db', label: 'Gain', unit: 'dB' }],
    series,
    vlines: [{ value: fFP, label: `f_FP ${fHz(fFP, 3)}`, color: '#8b1e1e', dash: [4, 4] }],
    markers: [
      { x: bwStage, y: dB(stg.dcGain) - 3.0103, axis: 'db', label: fHz(bwStage, 3) },
      ...(n > 1 ? [{ x: bwChain, y: n * dB(stg.dcGain) - 3.0103, axis: 'db', label: fHz(bwChain, 3), color: '#c47b17' }] : []),
    ],
  };
}

function bwVsGain(s: BwState, amp: Amp, n: number, fFP: number): GraphSpec {
  const gLo = s.config === 'noninv' ? 1 : 0.1;
  const gs = logspace(gLo, Math.max(1e4, s.gain * 3), 160);
  const one = gs.map((g) => cascadeBw(stage(amp, noiseGainOf(s.config, g), g), 1));
  const series = [{ label: n > 1 ? 'One stage' : 'f₋₃dB', x: gs, y: one, axis: 'f', color: '#1f4e5f', width: 2.2 }];
  if (n > 1) series.push({ label: `${n} stages`, x: gs, y: gs.map((g) => cascadeBw(stage(amp, noiseGainOf(s.config, g), g), n)), axis: 'f', color: '#c47b17', width: 2 });
  const bwNow = cascadeBw(stage(amp, noiseGainOf(s.config, s.gain), s.gain), n);
  return {
    id: 'bw-vs-gain',
    title: 'Bandwidth vs gain',
    subtitle: `${s.config === 'inv' ? 'Inverting' : 'Non-inverting'} stages; dashed: full-power bandwidth at ${si(s.vpk, 'V', 3)} pk`,
    x: { label: 'Gain per stage |G|', unit: 'V/V', log: true },
    y: [{ id: 'f', label: 'Bandwidth', unit: 'Hz', log: true }],
    series,
    hlines: [{ value: fFP, label: 'f_FP', axis: 'f', color: '#8b1e1e', dash: [4, 4] }],
    markers: [{ x: s.gain, y: bwNow, axis: 'f', label: fHz(bwNow, 3) }],
  };
}

function stepGraph(stg: Stage, n: number, tr1: number): GraphSpec {
  const tEnd = (3 * Math.sqrt(n) + 2) * tr1 + (stg.order === 2 ? (6 * stg.q) / (2 * Math.PI * stg.f0) : 0);
  const ts = Array.from({ length: 301 }, (_, i) => (tEnd * i) / 300);
  const series = [{ label: n > 1 ? 'One stage' : 'Output', x: ts, y: ts.map((t) => step1(stg, t)), axis: 'y', color: '#1f4e5f', width: 2.2 }];
  if (n > 1) {
    const r = stepChain(stg, n, tEnd, 1500);
    const keep = r.t.map((_, i) => i).filter((i) => i % 5 === 0);
    series.push({ label: `${n} stages`, x: keep.map((i) => r.t[i]), y: keep.map((i) => r.y[i]), axis: 'y', color: '#c47b17', width: 2 });
  }
  return {
    id: 'step',
    title: 'Small-signal step',
    subtitle: 'Output normalised to its final value (no slewing)',
    legend: 'below',
    x: { label: 'Time', unit: 's' },
    y: [{ id: 'y', label: 'Output / final', unit: '', includeZero: true }],
    series,
    hlines: [{ value: 0.1, label: '10 %', axis: 'y', color: '#9a8f7a', dash: [2, 3] }, { value: 0.9, label: '90 %', axis: 'y', color: '#9a8f7a', dash: [2, 3] }],
  };
}

/**
 * The slew-rate units are not SI prefixes of one base unit, so the core cannot move a solved SR to a readable
 * one: do it here (V/µs, V/ns, V/ms or V/s, whichever shows the value as 1…9999).
 */
function sync(s: BwState): void {
  if (s.solveFor !== 'sr' || !(s.sr > 0) || !Number.isFinite(s.sr)) return;
  const shown = s.sr / (U_SR[s.srUnit] ?? 1);
  if (shown >= 0.1 && shown < 1e4) return;
  const off = (k: number) => {
    const v = Math.log10(s.sr / k);
    return v < 0 ? -v : v >= 4 ? v - 4 : 0;
  };
  s.srUnit = Object.entries(U_SR).reduce((a, b) => (off(b[1]) < off(a[1]) ? b : a))[0];
}

export const def: CalcDef<BwState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Voltage-feedback op-amp with a dominant pole f₁ = GBW/A_OL and an optional second pole set from the data-sheet unity-gain phase margin; closed-loop second-order response at noise gain NG (|G| non-inverting, |G|+1 inverting), exact −3 dB bandwidth of one or n identical stages, phase margin, peaking, overshoot and step response (Franco, Design with Op Amps 4e ch. 6 and 8; Sedra & Smith 7e §11.10); full-power bandwidth SR/(2πV_pk). GBW and gain solves invert the same forward model with Brent’s method.',
  fields,
  defaults,
  sync,
  solve: {
    default: 'bw',
    analysis: 'bw',
    options: [
      { key: 'bw', label: 'Bandwidths from GBW, gain, stages and slew rate (analysis)' },
      { key: 'gbw', label: 'GBW needed for a target bandwidth' },
      { key: 'gain', label: 'Largest gain per stage for a target bandwidth' },
      { key: 'sr', label: 'Slew rate for a target full-power bandwidth' },
    ],
  },
  compute,
  examples: [
    { id: 'tlv9002-g10', label: 'TLV9002, non-inverting ×10, 2 V pk', state: defaults() },
    { id: 'tl072-3stage', label: 'TL072H: three ×10 stages vs one ×1000 stage', state: { ...defaults(), opamp: 'TL072H', gbw: 5.25e6, a0: 120, sr: 20e6, pm: null, gain: 10, stages: 3, vpk: 5, solveFor: 'bw' } },
    { id: 'inv-gbw', label: 'GBW for 100 kHz at G = −20 (inverting)', state: { ...defaults(), opamp: 'Custom', config: 'inv', gain: 20, stages: 1, pm: null, solveFor: 'gbw', bw: 100e3, bwUnit: 'kHz' } },
    { id: 'audio-sr', label: 'Slew rate for 20 kHz at 10 V pk (audio line driver)', state: { ...defaults(), opamp: 'NE5532', gbw: 12e6, a0: 100, sr: 5e6, pm: null, gain: 5, vpk: 10, solveFor: 'sr', fp: 20e3, fpUnit: 'kHz' } },
    { id: 'opa350-gain', label: 'OPA350: largest gain for a 1 MHz bandwidth', state: { ...defaults(), opamp: 'OPA350', gbw: 38e6, a0: 122, sr: 22e6, pm: null, solveFor: 'gain', bw: 1e6, bwUnit: 'MHz', vpk: 1 } },
    { id: 'low-pm', label: 'Edge case: follower with a 40° phase margin (peaking)', state: { ...defaults(), opamp: 'Custom', gbw: 10e6, a0: 100, pm: 40, sr: 10e6, gain: 1, stages: 1, vpk: 0.5, solveFor: 'bw' } },
  ],
};
