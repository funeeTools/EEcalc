/** Clock / data jitter — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec, NumberField } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ } from '@/core/unitsets';
import { type JitterTerm, bathtub, berFor, budget, dualDiracPdf, jitterSnr, periodFromTie, qAt } from './model';

export const ID = 'protocol/clock-jitter';

export type SolveKey = 'tj' | 'ber' | 'rj' | 'dj' | 'rate';

export interface JitterState {
  solveFor: SolveKey;
  /** 'direct': RJ and DJ typed; 'budget': summed from the list of sources */
  mode: 'direct' | 'budget';
  rj: number;
  dj: number;
  terms: JitterTerm[];
  ber: number;
  /** transition density ρ_T: 1 = AN-815 table convention, 0.5 = random NRZ data */
  rho: number;
  tj: number;
  rate: number;
  rateUnit: string;
  tsu: number;
  th: number;
  fin: number;
  finUnit: string;
  /**
   * Typed RJ, DJ, TJ and unknown saved when switching to a budget of sources (which writes its own RJ, DJ and
   * possibly TJ into those boxes), restored when switching back, so direct → budget → direct returns to the
   * same answer. Internal: not a form field.
   */
  directStash?: { rj: number; dj: number; tj: number; solveFor: SolveKey } | null;
}

/** A 1 Gb/s source-synchronous LVDS link: 5 ps rms random, 100 ps deterministic jitter, judged at 10⁻¹². */
export const defaults = (): JitterState => ({
  solveFor: 'tj',
  mode: 'direct',
  rj: 5e-12,
  dj: 100e-12,
  terms: [
    { name: 'Reference oscillator', kind: 'rj', value: 1e-12, count: 1 },
    { name: 'PLL / jitter cleaner', kind: 'rj', value: 2e-12, count: 1 },
    { name: 'Fanout buffer', kind: 'rj', value: 0.5e-12, count: 2 },
    { name: 'ISI + crosstalk', kind: 'dj', value: 40e-12, count: 1 },
  ],
  ber: 1e-12,
  rho: 1,
  tj: 170.345e-12,
  rate: 1e9,
  rateUnit: 'Gb/s',
  tsu: 200e-12,
  th: 100e-12,
  fin: 100e6,
  finUnit: 'MHz',
});

const U_RATE: Record<string, number> = { 'Gb/s': 1e9, 'Mb/s': 1e6, 'kb/s': 1e3, 'b/s': 1 };
const T_MAX = 1e-3;
const BER_MIN = 1e-18;
const RJ_MIN = 1e-16;
/** Covers every TJ the inputs can produce: DJ ≤ 1 ms plus 2Q·RJ ≤ 17.5 × 1 ms at BER 10⁻¹⁸. */
const TJ_MAX = 20 * T_MAX;
const BER_MAX = 0.1;

/**
 * Components-from switch. To the budget: save the typed values; a BER target the budget's RJ and DJ cannot
 * place on this page (outside 10⁻¹⁸ … 0.1) becomes an analysis of TJ instead of a red error, and an RJ or DJ
 * unknown (computed by the budget anyway) becomes TJ. Back to typed values: restore what was saved.
 */
function switchMode(v: string, s: any): void {
  if (v === 'budget') {
    s.directStash = { rj: s.rj, dj: s.dj, tj: s.tj, solveFor: s.solveFor };
    if (s.solveFor === 'rj' || s.solveFor === 'dj') s.solveFor = 'tj';
    if (s.solveFor === 'ber' && !compute(s).ok) s.solveFor = 'tj';
    return;
  }
  const d = s.directStash;
  s.directStash = null;
  if (!d) return;
  // TJ is restored only if the budget computed it (otherwise it was typed there and stays)
  if (s.solveFor === 'tj' || s.solveFor === 'rate') s.tj = d.tj;
  s.rj = d.rj;
  s.dj = d.dj;
  if (s.solveFor === 'tj' && d.solveFor !== 'tj') s.solveFor = d.solveFor;
}

/** RJ/DJ are computed in budget mode, or when they are the unknown. */
const rjdj = (key: 'rj' | 'dj'): Pick<NumberField, 'solvable' | 'solvedWhen' | 'onUnsolve'> => ({
  solvable: true,
  solvedWhen: (_s, root) => root.mode === 'budget' || root.solveFor === key,
  onUnsolve: (_s, root) => {
    if (root.mode === 'budget') root.mode = 'direct';
    if (root.solveFor === key) root.solveFor = 'tj';
  },
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Jitter components',
    note: 'Random jitter (Gaussian, rms) adds in RSS; deterministic jitter (dual-Dirac δδ) adds linearly.',
    fields: [
      { kind: 'select', key: 'mode', label: 'Components from', structural: true, options: [{ value: 'direct', label: 'Typed RJ and DJ' }, { value: 'budget', label: 'Budget of sources' }], apply: switchMode, help: 'Type the total RJ and DJ, or build them from a list of sources (oscillator, PLL, buffers, ISI…).' },
      { kind: 'number', key: 'rj', symbol: 'RJ', label: 'Random (rms)', unit: 's', min: RJ_MIN, max: T_MAX, ...rjdj('rj'), help: 'Standard deviation σ of the Gaussian (unbounded) part of the time-interval error. When solved: the most RJ that still meets TJ at the BER.' },
      { kind: 'number', key: 'dj', symbol: 'DJ', label: 'Deterministic δδ', unit: 's', min: 0, max: T_MAX, ...rjdj('dj'), help: 'Dual-Dirac deterministic jitter DJ(δδ): bounded jitter from ISI, duty-cycle distortion, crosstalk and periodic sources, as fitted to the tails. It is smaller than the measured DJ peak-to-peak.' },
      {
        kind: 'list',
        key: 'terms',
        visible: (_s, root) => root.mode === 'budget',
        itemTitle: (it) => String(it.name || 'Source'),
        addLabel: '+ Add source',
        minItems: 1,
        maxItems: 12,
        variant: 'sub',
        create: (prev) => (prev ? { ...prev } : { name: 'Source', kind: 'rj', value: 1e-12, count: 1 }),
        fields: [
          { kind: 'text', key: 'name', label: 'Name', maxLength: 32 },
          { kind: 'select', key: 'kind', label: 'Type', options: [{ value: 'rj', label: 'Random (rms)' }, { value: 'dj', label: 'Deterministic (δδ)' }] },
          { kind: 'number', key: 'value', symbol: 'J', label: 'Per stage', unit: 's', min: 0, max: T_MAX, help: 'RMS value for a random source; dual-Dirac δδ for a deterministic one.' },
          { kind: 'number', key: 'count', symbol: 'n', label: 'Identical stages', integer: true, min: 1, max: 64, help: 'Number of identical stages in the path (e.g. two fanout buffers). Random: adds n·J²; deterministic: adds n·J.' },
        ],
      },
    ],
  },
  {
    kind: 'section',
    title: 'Total jitter',
    note: 'Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'ber', symbol: 'BER', label: 'Bit error ratio', min: 1e-18, max: 0.1, solvable: true, help: 'Error ratio at which the peak-to-peak jitter is quoted (10⁻¹² for most serial links). When solved: the BER at which the jitter reaches TJ.' },
      { kind: 'select', key: 'rho', label: 'Transition density', options: [{ value: 1, label: '1 (AN-815 tables)' }, { value: 0.5, label: '0.5 (NRZ data)' }], help: 'ρ_T: fraction of bits with an edge. 1 reproduces the usual rms→pk-pk multiplier tables (IDT/Renesas AN-815: 2Q = 14.069 at 10⁻¹²). 0.5 counts errors only at the transitions of random NRZ data, Q = Q⁻¹(BER/0.5): 2Q = 13.874 at 10⁻¹². Use the convention of the spec you are checking against.' },
      { kind: 'number', key: 'tj', symbol: 'TJ', label: 'Total pk-pk', unit: 's', min: 0, max: TJ_MAX, solvable: true, solvedWhen: (_s, root) => root.solveFor === 'tj' || root.solveFor === 'rate', help: 'TJ(BER) = DJ + 2·Q(BER)·RJ (dual-Dirac). Solved by default; type a limit here to solve for the BER, RJ or DJ.' },
    ],
  },
  {
    kind: 'section',
    title: 'Link timing',
    fields: [
      { kind: 'number', key: 'rate', symbol: 'R', label: 'Data rate', units: U_RATE, unitKey: 'rateUnit', min: 1, max: 1e12, solvable: true, help: 'Bit rate; one unit interval UI = 1/R. For a clock, use twice the clock frequency if data is sampled on both edges. When solved: the highest rate with zero timing margin.' },
      { kind: 'number', key: 'tsu', symbol: 't_su', label: 'Setup time', unit: 's', min: 0, max: T_MAX, help: 'Setup requirement of the sampling flip-flop or receiver (or half its eye-mask width).' },
      { kind: 'number', key: 'th', symbol: 't_h', label: 'Hold time', unit: 's', min: 0, max: T_MAX, help: 'Hold requirement. Setup + hold is the window the eye must stay open for: margin = UI − TJ − t_su − t_h.' },
    ],
  },
  {
    kind: 'section',
    title: 'Sampling clock (ADC)',
    fields: [
      { kind: 'number', key: 'fin', symbol: 'f_in', label: 'Input frequency', units: U_FREQ, unitKey: 'finUnit', min: 1, max: 1e12, help: 'Analog input frequency for the jitter-limited SNR −20·log₁₀(2π f_in RJ), using RJ as the rms sampling-clock jitter.' },
    ],
  },
];

const fT = (t: number, d = 4) => si(t, 's', d);
const sup = (n: string) => n.replace(/[-\d]/g, (c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]));
/** BER as 1×10⁻¹² (3 significant digits). */
export function fBer(b: number): string {
  if (b >= 1e-3) return String(+b.toPrecision(3));
  const [m, e] = b.toExponential(2).split('e');
  return `${+m}×10${sup(String(+e))}`;
}
const fRate = (r: number) => si(r, 'b/s', 4);
const MARGIN_WARN = 0.1;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: JitterState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}


function run(st: JitterState): CalcReport {
  const s: JitterState = { ...st, terms: (st.terms ?? []).map((t) => ({ ...t })) };
  if (!['tj', 'ber', 'rj', 'dj', 'rate'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  if (s.mode !== 'direct' && s.mode !== 'budget') throw new Error('mode must be "direct" or "budget".');
  if (s.mode === 'budget' && (s.solveFor === 'rj' || s.solveFor === 'dj')) throw new Error('With a budget of sources, RJ and DJ come from the list. Switch “Components from” to typed RJ and DJ to solve for one of them.');
  const solving = s.solveFor;
  const tsu = finite('Setup time', s.tsu);
  const th = finite('Hold time', s.th);
  const fin = finite('ADC input frequency', s.fin);
  if (tsu < 0 || th < 0) throw new Error('Setup and hold times must be ≥ 0.');
  if (!(fin > 0)) throw new Error('ADC input frequency must be > 0.');
  if (solving !== 'rate' && !(finite('Data rate', s.rate) > 0)) throw new Error('Data rate must be > 0.');

  // ── components
  if (s.mode === 'budget') {
    if (!s.terms.length) throw new Error('Add at least one jitter source.');
    for (const [i, t] of s.terms.entries()) {
      finite(`Source ${i + 1} jitter`, t.value);
      finite(`Source ${i + 1} stages`, t.count);
      if (t.value < 0) throw new Error(`Source ${i + 1}: jitter must be ≥ 0.`);
      if (!(t.count >= 1) || !Number.isInteger(t.count)) throw new Error(`Source ${i + 1}: stages must be a whole number ≥ 1.`);
      if (t.kind !== 'rj' && t.kind !== 'dj') throw new Error(`Source ${i + 1}: type must be rj or dj.`);
    }
    const b = budget(s.terms);
    if (!(b.rj > 0)) throw new Error('The budget has no random jitter: add a random (rms) source, or type RJ and DJ directly.');
    s.rj = b.rj;
    s.dj = b.dj;
  } else {
    if (solving !== 'rj' && !(finite('RJ', s.rj) > 0)) throw new Error('Random jitter must be > 0 (the dual-Dirac model needs a Gaussian part).');
    if (solving !== 'dj' && !(finite('DJ', s.dj) >= 0)) throw new Error('Deterministic jitter must be ≥ 0.');
  }
  const report: CalcReport = { ...emptyReport(ID), solveFor: solving };
  const noSolution = (why: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: why, solveFor: solving, status: { text: 'NO SOLUTION', tone: 'fail' } });

  // ── solve (closed-form inverses of TJ = DJ + 2·Q⁻¹(BER)·RJ and margin = 1/R − TJ − t_su − t_h)
  if (s.rho !== 1 && s.rho !== 0.5) throw new Error('Transition density must be 1 or 0.5.');
  if (solving !== 'ber') {
    const ber = finite('BER', s.ber);
    if (!(ber > 0 && ber < 0.5)) throw new Error('BER must be between 0 and 0.5.');
  }
  if (solving === 'ber' || solving === 'rj' || solving === 'dj') {
    const tj = finite('TJ', s.tj);
    if (!(tj > 0)) throw new Error('Total jitter must be > 0.');
    if (solving === 'ber') {
      if (!(tj > s.dj)) return noSolution(`TJ = ${fT(tj)} is not above DJ = ${fT(s.dj)}: no BER fits, since the deterministic part alone already spans TJ. Raise TJ or lower DJ.`);
      const ber = berFor(tj, s.rj, s.dj, s.rho);
      // never write a value outside the BER field range back into the input
      if (!(ber >= BER_MIN * (1 - 1e-9))) return noSolution(`TJ = ${fT(tj)} leaves ${((tj - s.dj) / (2 * s.rj)).toFixed(1)} RJ per side beyond DJ/2: the BER is ${ber > 0 ? fBer(ber) : 'below 10⁻³⁰⁰'}, under the 10⁻¹⁸ floor of this page. Any practical BER target is met.`);
      if (!(ber <= BER_MAX * (1 + 1e-9))) return noSolution(`TJ = ${fT(tj)} is barely above DJ = ${fT(s.dj)}: the BER would be ${fBer(ber)}, above 0.1, where the dual-Dirac tail model means nothing. Raise TJ or lower DJ.`);
      s.ber = ber;
    } else if (solving === 'rj') {
      if (!(tj > s.dj)) return noSolution(`TJ = ${fT(tj)} does not exceed DJ = ${fT(s.dj)}: there is no room left for random jitter. Lower DJ or raise the TJ limit.`);
      s.rj = (tj - s.dj) / (2 * qAt(s.ber, s.rho));
    } else {
      const dj = tj - 2 * qAt(s.ber, s.rho) * s.rj;
      if (!(dj >= 0)) return noSolution(`RJ alone gives ${fT(2 * qAt(s.ber, s.rho) * s.rj)} peak-to-peak at BER ${fBer(s.ber)}, more than TJ = ${fT(tj)}: no DJ ≥ 0 fits. Lower RJ or raise the TJ limit.`);
      s.dj = dj;
    }
  }
  const q = qAt(s.ber, s.rho);
  // Never write a computed value outside its field range (RJ 0.1 fs … 1 ms, DJ 0 … 1 ms, TJ 0 … 20 ms).
  const computedRj = s.mode === 'budget' || solving === 'rj';
  const computedDj = s.mode === 'budget' || solving === 'dj';
  // 1e-9 relative slack: a value typed at a field limit and solved back must not fail on round-off
  if (computedRj && !(s.rj >= RJ_MIN * (1 - 1e-9) && s.rj <= T_MAX * (1 + 1e-9))) return noSolution(`RJ would be ${fT(s.rj)}, outside the ${fT(RJ_MIN)} … ${fT(T_MAX)} range of the RJ field. ${s.mode === 'budget' ? 'Check the source values and stage counts.' : 'Change TJ, DJ or the BER.'}`);
  if (computedDj && !(s.dj >= 0 && s.dj <= T_MAX * (1 + 1e-9))) return noSolution(`DJ would be ${fT(s.dj)}, above the ${fT(T_MAX)} limit of the DJ field. ${s.mode === 'budget' ? 'Check the source values and stage counts.' : 'Lower TJ or raise RJ.'}`);
  const tj = s.dj + 2 * q * s.rj;
  if (solving !== 'ber' && solving !== 'rj' && solving !== 'dj') {
    if (!(tj <= TJ_MAX)) return noSolution(`TJ would be ${fT(tj)}, above the ${fT(TJ_MAX)} limit of the TJ field. Lower RJ or DJ, or use a higher BER.`);
    s.tj = tj;
  }
  if (solving === 'rate') {
    const need = tj + tsu + th;
    s.rate = 1 / need;
    if (!(s.rate >= 1 - 1e-9 && s.rate <= 1e12 * (1 + 1e-9))) return noSolution(`TJ + setup + hold = ${fT(need)} gives ${fRate(s.rate)}, outside 1 b/s … 1 Tb/s.`);
  }
  const ui = 1 / s.rate;
  const eye = ui - tj;
  // Solving for the rate puts the margin at exactly zero by construction (avoid a 1e-26 s round-off residue).
  const margin = solving === 'rate' ? 0 : eye - tsu - th;
  const per = periodFromTie(s.rj);
  const snr = jitterSnr(fin, s.rj);
  const rjPp = 2 * q * s.rj;
  const marginTone = solving === 'rate' ? '' : margin < 0 ? 'fail' : margin < MARGIN_WARN * ui ? 'warn' : 'pass';

  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const all: Record<SolveKey, ResultItem> = {
    tj: item('tj', 'Total jitter (pk-pk)', tj, 's', fT(tj), { symbol: 'TJ', note: `at BER ${fBer(s.ber)} · ${(tj / ui).toFixed(3)} UI` }),
    ber: item('ber', 'Bit error ratio', s.ber, '', fBer(s.ber), { symbol: 'BER', note: `Q = ${q.toFixed(3)} for TJ = ${fT(tj)}` }),
    rj: item('rj', 'Random jitter (rms)', s.rj, 's', fT(s.rj), { symbol: 'RJ', note: s.mode === 'budget' ? 'RSS of the random sources' : `${fT(rjPp)} pk-pk at the BER` }),
    dj: item('dj', 'Deterministic jitter (δδ)', s.dj, 's', fT(s.dj), { symbol: 'DJ', note: s.mode === 'budget' ? 'sum of the deterministic sources' : 'dual-Dirac' }),
    rate: item('rate', 'Max data rate', s.rate, 'b/s', fRate(s.rate), { symbol: 'R_max', note: `UI = ${fT(ui)} = TJ + t_su + t_h` }),
  };
  const results: ResultItem[] = [{ ...all[solving], solved: true, primary: true }];
  // With the rate as the unknown, TJ is computed too (it sets the rate), so it is written back and shown green.
  if (solving === 'rate') results.push({ ...all.tj, solved: true, primary: true });
  else if (solving !== 'tj') results.push({ ...all.tj, key: 'tjAt', primary: true });
  results.push(
    item('margin', 'Timing margin', margin, 's', fT(margin), { primary: true, tone: marginTone, symbol: 'M', note: `UI − TJ − t_su − t_h · ${(margin / ui * 100).toFixed(1)} % UI` }),
    item('snr', 'Jitter-limited SNR', snr, 'dB', `${snr.toFixed(2)} dB`, { primary: true, symbol: 'SNR_j', note: `full-scale sine at ${si(fin, 'Hz', 4)}` }),
  );
  if (s.mode === 'budget') {
    results.push({ ...all.rj, solved: true, group: 'Jitter' }, { ...all.dj, solved: true, group: 'Jitter' });
  } else {
    for (const k of ['rj', 'dj'] as const) if (k !== solving) results.push({ ...all[k], key: `${k}In`, group: 'Jitter' });
  }
  results.push(
    item('q', 'Q at the BER', q, '', q.toFixed(4), { symbol: 'Q_BER', group: 'Jitter', note: `TJ/RJ multiplier 2Q = ${(2 * q).toFixed(3)}` }),
    item('rjPp', 'RJ peak-to-peak at BER', rjPp, 's', fT(rjPp), { symbol: '2Q·RJ', group: 'Jitter' }),
    item('djShare', 'DJ share of TJ', tj > 0 ? s.dj / tj : 0, '', `${tj > 0 ? ((s.dj / tj) * 100).toFixed(1) : '0'} %`, { group: 'Jitter' }),
    item('ui', 'Unit interval', ui, 's', fT(ui), { symbol: 'UI', group: 'Link timing', note: `at ${fRate(s.rate)}` }),
    item('tjUi', 'TJ in UI', tj / ui, 'UI', `${(tj / ui).toFixed(4)} UI`, { group: 'Link timing', tone: tj > ui ? 'fail' : '' }),
    item('eye', 'Eye opening', eye, 's', fT(eye), { symbol: 'UI − TJ', group: 'Link timing', tone: eye <= 0 ? 'fail' : '' }),
    item('window', 'Setup + hold window', tsu + th, 's', fT(tsu + th), { symbol: 't_su + t_h', group: 'Link timing' }),
  );
  if (solving !== 'rate') results.push(item('rateMax', 'Max data rate', 1 / (tj + tsu + th), 'b/s', tj + tsu + th > 0 ? fRate(1 / (tj + tsu + th)) : '—', { symbol: 'R_max', group: 'Link timing', note: 'zero margin' }));
  results.push(
    item('enobJ', 'Jitter-limited ENOB', (snr - 1.7609) / 6.0206, 'bits', `${((snr - 1.7609) / 6.0206).toFixed(2)} bits`, { group: 'Sampling (ADC)', note: '(SNR − 1.76)/6.02' }),
    item('perJ', 'Period jitter (rms)', per.period, 's', fT(per.period), { symbol: 'σ_per', group: 'Period jitter (white RJ)', note: '√2·RJ' }),
    item('c2cJ', 'Cycle-to-cycle (rms)', per.c2c, 's', fT(per.c2c), { symbol: 'σ_c2c', group: 'Period jitter (white RJ)', note: '√6·RJ = √3·σ_per' }),
  );
  report.results = results;

  // ── status, warnings, notes
  report.status = solving === 'rate' ? { text: 'ZERO MARGIN', tone: 'warn' } : margin < 0 ? { text: 'EYE CLOSED', tone: 'fail' } : margin < MARGIN_WARN * ui ? { text: 'MARGINAL', tone: 'warn' } : { text: 'TIMING OK', tone: 'pass' };
  const W = report.warnings;
  if (solving === 'rate') report.notes.push(`R_max leaves no margin. Running at 90 % of it (${fRate(0.9 * s.rate)}) leaves ${fT(1 / (0.9 * s.rate) - tj - tsu - th)} (${(((1 / (0.9 * s.rate) - tj - tsu - th) * 0.9 * s.rate) * 100).toFixed(1)} % UI).`);
  else if (margin < 0) W.push(`TJ + setup + hold = ${fT(tj + tsu + th)} exceeds the ${fT(ui)} UI by ${fT(-margin)}. Cut the dominant term (${s.dj > rjPp ? 'DJ: equalise ISI, reduce crosstalk' : 'RJ: cleaner reference or PLL'}), or lower the rate below ${fRate(1 / (tj + tsu + th))}.`);
  else if (margin < MARGIN_WARN * ui) W.push(`Timing margin is only ${((margin / ui) * 100).toFixed(1)} % of a UI. Leave room for PVT drift and measurement error (aim for 10 % or more), or lower the rate.`);
  if (2 * Math.PI * fin * s.rj >= 1) W.push(`RJ = ${fT(s.rj)} is at least 1/(2π·f_in) = ${fT(1 / (2 * Math.PI * fin))}: the sampling error is as large as the signal, so the small-jitter SNR formula no longer applies (SNR ≤ 0 dB, negative ENOB). Lower f_in or the jitter.`);
  if (s.ber > 1e-4) W.push(`BER ${fBer(s.ber)} is outside the low-BER tail region where the dual-Dirac Gaussian fit applies: TJ here is only a rough figure. Quote TJ at 10⁻⁹ … 10⁻¹⁵ for link budgets.`);
  if (s.mode === 'budget') report.notes.push('Budget: random sources assumed independent (RSS); deterministic sources assumed to add in the worst case (linear).');
  report.notes.push(s.rho === 1 ? 'Q = Q⁻¹(BER), transition density 1: the convention of the AN-815 multiplier table (2Q = 14.069 at 10⁻¹²). Many link specs count errors only at data transitions (ρ_T = 0.5 for NRZ), which gives a slightly smaller TJ.' : 'Q = Q⁻¹(BER/ρ_T) with ρ_T = 0.5 (random NRZ data): 2Q = 13.874 at 10⁻¹², against 14.069 in the AN-815 table convention.');
  report.notes.push('Dual-Dirac DJ(δδ) is a tail-fit parameter and is smaller than a measured DJ peak-to-peak; do not mix the two.');
  report.notes.push('The ADC SNR uses RJ only, as the rms sampling-clock jitter; periodic jitter shows up as spurs, not as a noise floor.');
  report.notes.push('Period and cycle-to-cycle figures assume uncorrelated (white) edge errors; PLL-filtered or 1/f jitter gives smaller ratios.');

  report.summary = `RJ ${fT(s.rj, 3)} rms, DJ ${fT(s.dj, 3)} → TJ ${fT(tj)} at BER ${fBer(s.ber)} · ${(tj / ui).toFixed(3)} UI at ${fRate(s.rate)}`;
  report.details = { rj: s.rj, dj: s.dj, tj, q, ber: s.ber, ui, eye, margin, snr, rate: s.rate, period: per.period, c2c: per.c2c, mode: s.mode };
  report.tables = [berTable(s.rj, s.dj, ui, tsu, th, s.ber, s.rho)];
  if (s.mode === 'budget') report.tables.push(budgetTable(s.terms, s.rj, s.dj, q));
  report.graphs = graphs(s, tj, ui);
  return report;
}

const BERS = [1e-6, 1e-9, 1e-10, 1e-12, 1e-14, 1e-15, 1e-16];

function berTable(rj: number, dj: number, ui: number, tsu: number, th: number, ber: number, rho: number): TableSpec {
  const list = [...BERS];
  if (!list.some((b) => Math.abs(b / ber - 1) < 1e-9)) list.push(ber), list.sort((a, b) => b - a);
  const rows = list.map((b) => {
    const q = qAt(b, rho);
    const tj = dj + 2 * q * rj;
    return { ber: b, alpha: 2 * q, tj, tjUi: tj / ui, margin: ui - tj - tsu - th };
  });
  return {
    id: 'tj-vs-ber',
    title: 'Total jitter at common BERs',
    columns: [
      { key: 'ber', label: 'BER' },
      { key: 'alpha', label: '2Q (TJ/RJ)' },
      { key: 'tj', label: 'TJ', unit: 's' },
      { key: 'tjUi', label: 'TJ', unit: 'UI' },
      { key: 'margin', label: 'Margin', unit: 's' },
    ],
    rows,
    display: rows.map((r) => ({ ber: fBer(r.ber) + (Math.abs(r.ber / ber - 1) < 1e-9 ? ' ◀' : ''), alpha: r.alpha.toFixed(3), tj: fT(r.tj), tjUi: r.tjUi.toFixed(4), margin: fT(r.margin) })),
    rowTones: rows.map((r) => (r.margin < -1e-9 * ui ? 'fail' : r.margin < MARGIN_WARN * ui ? 'warn' : 'pass')),
    note: `Dual-Dirac TJ = DJ + 2Q·RJ with Q = Q⁻¹(BER/ρ_T), ρ_T = ${rho}. With ρ_T = 1 2Q reproduces IDT/Renesas AN-815 Table 1 (14.069 at 10⁻¹²). Green: margin ≥ 10 % UI; yellow: 0–10 % UI; red: eye closed. ◀ = the BER above.`,
  };
}

function budgetTable(terms: JitterTerm[], rj: number, dj: number, q: number): TableSpec {
  let v = 0;
  let d = 0;
  const rows = terms.map((t) => {
    const contrib = t.kind === 'rj' ? t.count * t.value * t.value : t.count * t.value;
    if (t.kind === 'rj') v += contrib;
    else d += contrib;
    return {
      name: t.name || 'Source',
      kind: t.kind === 'rj' ? 'random' : 'deterministic',
      value: t.value,
      count: t.count,
      share: t.kind === 'rj' ? (rj > 0 ? (contrib / (rj * rj)) * 100 : 0) : dj > 0 ? (contrib / dj) * 100 : 0,
      cum: d + 2 * q * Math.sqrt(v),
    };
  });
  return {
    id: 'budget',
    title: 'Jitter budget',
    columns: [
      { key: 'name', label: 'Source', align: 'left' },
      { key: 'kind', label: 'Type', align: 'left' },
      { key: 'value', label: 'Per stage', unit: 's' },
      { key: 'count', label: 'Stages' },
      { key: 'share', label: 'Share', unit: '%' },
      { key: 'cum', label: 'TJ so far', unit: 's' },
    ],
    rows,
    display: rows.map((r) => ({ name: r.name, kind: r.kind, value: fT(r.value, 3), count: String(r.count), share: `${r.share.toFixed(1)} %`, cum: fT(r.cum) })),
    note: 'Share: of RJ² (random rows) or of DJ (deterministic rows). TJ so far: DJ + 2Q·RJ of the chain up to and including the row, at the chosen BER.',
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: JitterState, tj: number, ui: number): GraphSpec[] {
  const { rj, dj } = s;
  // 1 — dual-Dirac edge distribution
  const half = Math.max(tj / 2 + 2 * rj, dj / 2 + 6 * rj);
  const xs = Array.from({ length: 401 }, (_, i) => -half + (2 * half * i) / 400);
  const peak = dualDiracPdf(dj / 2, rj, dj);
  const pdf: GraphSpec = {
    id: 'distribution',
    title: 'Edge distribution',
    subtitle: 'Dual-Dirac: two Gaussians of σ = RJ at ±DJ/2',
    x: { label: 'Edge time error', unit: 's' },
    y: [{ id: 'p', label: 'Probability density (relative)', unit: '', includeZero: true }],
    series: [
      { label: 'Dual-Dirac PDF', x: xs, y: xs.map((x) => dualDiracPdf(x, rj, dj) / peak), axis: 'p', width: 2.2, color: '#1f4e5f' },
      ...(dj > 0 ? [{ label: 'Gaussian at +DJ/2', x: xs, y: xs.map((x) => (0.5 * Math.exp(-0.5 * ((x - dj / 2) / rj) ** 2)) / (rj * Math.sqrt(2 * Math.PI)) / peak), axis: 'p', width: 1, color: '#9a8f7a', dash: [4, 3] }] : []),
    ],
    vlines: [
      { value: (-tj / 2), label: '−TJ/2', color: '#8b1e1e', dash: [6, 4] },
      { value: (tj / 2), label: `+TJ/2 (BER ${fBer(s.ber)})`, color: '#8b1e1e', dash: [6, 4] },
      ...(dj > 0 ? [{ value: (-dj / 2), label: '−DJ/2', color: '#c47b17', dash: [2, 3] }, { value: (dj / 2), label: '+DJ/2', color: '#c47b17', dash: [2, 3] }] : []),
    ],
    legend: 'below',
  };
  // 2 — bathtub across one UI
  const n = 301;
  const tt = Array.from({ length: n }, (_, i) => (ui * i) / (n - 1));
  const floor = 1e-18;
  const bt: GraphSpec = {
    id: 'bathtub',
    title: 'Bathtub',
    subtitle: 'BER vs sampling instant across one UI',
    x: { label: 'Sampling instant', unit: 's' },
    y: [{ id: 'b', label: 'BER', unit: '', log: true, min: floor, max: 1 }],
    series: [{ label: 'BER (dual-Dirac tails)', x: tt, y: tt.map((t) => Math.max(bathtub(t, ui, rj, dj, s.rho), floor)), axis: 'b', width: 2.2, color: '#1f4e5f' }],
    hlines: [{ value: s.ber, label: `target ${fBer(s.ber)}`, axis: 'b', color: '#8b1e1e', dash: [6, 4], width: 1.4 }],
    vlines: [
      ...(ui - tj > 0 ? [{ value: (tj / 2), label: 'eye opens', color: '#9a8f7a', dash: [2, 3] }, { value: (ui - tj / 2), label: '', color: '#9a8f7a', dash: [2, 3] }] : []),
      { value: (ui / 2), label: 'centre', color: '#4f8a8b' },
    ],
  };
  // 3 — jitter-limited ADC SNR vs input frequency
  const f0 = Math.min(s.fin / 100, 1e6);
  const f1 = Math.max(s.fin * 100, 1e9);
  const fs = logspace(f0, f1, 161);
  const snrAt = (f: number) => jitterSnr(f, rj);
  const adc: GraphSpec = {
    id: 'adc-snr',
    title: 'ADC SNR vs f_in',
    subtitle: `Jitter-limited SNR with RJ = ${fT(rj, 3)} rms`,
    x: { label: 'Input frequency f_in', unit: 'Hz', log: true },
    y: [{ id: 'snr', label: 'SNR', unit: 'dB' }],
    series: [{ label: 'SNR_j = −20 log₁₀(2π f RJ)', x: fs, y: fs.map(snrAt), axis: 'snr', width: 2.2, color: '#1f4e5f' }],
    hlines: [12, 14, 16].map((b) => ({ value: 6.0206 * b + 1.7609, label: `${b}-bit ideal`, axis: 'snr', color: '#9a8f7a', dash: [3, 3], width: 1 })),
    vlines: [{ value: s.fin, label: si(s.fin, 'Hz', 3), color: '#4f8a8b' }],
    markers: [{ x: s.fin, y: snrAt(s.fin), axis: 'snr', label: `${snrAt(s.fin).toFixed(1)} dB` }],
  };
  return [pdf, bt, adc];
}

export const def: CalcDef<JitterState> = {
  id: ID,
  version: '0.1.0',
  method: 'Dual-Dirac TJ(BER) = DJ(δδ) + 2·Q⁻¹(BER/ρ_T)·RJ (dual-Dirac model: Stephens, Agilent 2004); ρ_T = 1 reproduces IDT/Renesas AN-815 Table 1, ρ_T = 0.5 counts errors at NRZ transitions only; RJ adds RSS, DJ linearly; jitter-limited SNR −20·log₁₀(2π f_in RJ) (ADI MT-008); period √2·RJ and cycle-to-cycle √6·RJ for white TIE.',
  fields,
  defaults,
  // The rate solve is the highest rate with zero margin, not the inverse of the rate box, so the harness
  // round-trip flag "rate = 2.13 Gb/s but the state has 1 Gb/s" is expected.
  solve: {
    options: [
      { key: 'tj', label: 'Total jitter' },
      { key: 'ber', label: 'Bit error ratio' },
      { key: 'rj', label: 'Random jitter' },
      { key: 'dj', label: 'Deterministic jitter' },
      { key: 'rate', label: 'Max data rate' },
    ],
    default: 'tj',
    analysis: 'tj',
  },
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = { ...d, ...(raw as object) } as JitterState;
    if (!['tj', 'ber', 'rj', 'dj', 'rate'].includes(s.solveFor)) s.solveFor = 'tj';
    if (s.mode !== 'direct' && s.mode !== 'budget') s.mode = 'direct';
    if (s.rho !== 1 && s.rho !== 0.5) s.rho = 1;
    if (!Array.isArray(s.terms) || !s.terms.length) s.terms = d.terms;
    for (const k of Object.keys(d) as (keyof JitterState)[]) {
      if (typeof d[k] === 'number' && (typeof s[k] !== 'number' || !Number.isFinite(s[k] as number))) (s as any)[k] = d[k];
    }
    return s;
  },
  sync: (s) => {
    if (s.mode === 'budget' && (s.solveFor === 'rj' || s.solveFor === 'dj')) s.solveFor = 'tj';
  },
  compute,
  examples: [
    { id: 'default', label: '1 Gb/s LVDS: 5 ps rms + 100 ps DJ at 10⁻¹²', state: defaults() },
    { id: 'an815-rms-to-pp', label: 'AN-815: 4 ps rms → 56.3 ps pk-pk at 10⁻¹²', state: { solveFor: 'tj', mode: 'direct', rho: 1, rj: 4e-12, dj: 0, ber: 1e-12, rate: 1.25e9, rateUnit: 'Gb/s', tsu: 0, th: 0 } },
    { id: 'clock-tree', label: 'Clock tree budget: XO, PLL, 2 buffers, ISI', state: { solveFor: 'tj', mode: 'budget', ber: 1e-12, rate: 10.3125e9, rateUnit: 'Gb/s', tsu: 0, th: 0 } },
    { id: 'serdes-rj-limit', label: '10 Gb/s NRZ (ρ_T = 0.5): RJ allowed for TJ ≤ 0.3 UI at 10⁻¹⁵', state: { solveFor: 'rj', mode: 'direct', rho: 0.5, dj: 12e-12, tj: 30e-12, ber: 1e-15, rate: 10e9, rateUnit: 'Gb/s', tsu: 0, th: 0 } },
    { id: 'ber-from-eye', label: 'BER reached when TJ fills 60 % of a 5 Gb/s UI', state: { solveFor: 'ber', mode: 'direct', rj: 2e-12, dj: 90e-12, tj: 120e-12, rate: 5e9, rateUnit: 'Gb/s', tsu: 0, th: 0 } },
    { id: 'adc-if', label: 'ADC at 200 MHz IF with a 300 fs clock', state: { solveFor: 'tj', mode: 'direct', rj: 300e-15, dj: 0, ber: 1e-12, fin: 200e6, finUnit: 'MHz', rate: 1e9, rateUnit: 'Gb/s', tsu: 0, th: 0 } },
    { id: 'max-rate', label: 'Fastest rate: 20 ps rms, 150 ps DJ, 120/80 ps setup/hold', state: { solveFor: 'rate', mode: 'direct', rj: 20e-12, dj: 150e-12, ber: 1e-12, tsu: 120e-12, th: 80e-12 } },
  ],
};
