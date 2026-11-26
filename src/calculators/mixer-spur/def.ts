/** Mixer spur calculator — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ } from '@/core/unitsets';
import { type Conv, type Plan, type Product, type Response, type Side, type SpurHit, inFor, loFor, loLaw, outFor, outputSpurs, planProblem, prodFreq, productName, products, responses, sweep, wantedSign } from './model';

export const ID = 'rf/mixer-spur-calculator';

export interface MixState {
  solveFor: 'flo' | 'fout' | 'fin';
  conv: Conv;
  side: Side;
  plan: Plan;
  fin: number;
  finUnit: string;
  bin: number;
  binUnit: string;
  fout: number;
  foutUnit: string;
  bout: number;
  boutUnit: string;
  flo: number;
  floUnit: string;
  /** highest spur order m + n */
  order: number;
  /** near-band margin, Hz */
  margin: number;
  marginUnit: string;
}

/** 902–928 MHz ISM band block-converted to a 70 MHz IF with a high-side LO, spurs to 5th order. */
export const defaults = (): MixState => ({
  solveFor: 'flo',
  conv: 'down',
  side: 'high',
  plan: 'fixed',
  fin: 915e6,
  finUnit: 'MHz',
  bin: 26e6,
  binUnit: 'MHz',
  fout: 70e6,
  foutUnit: 'MHz',
  bout: 26e6,
  boutUnit: 'MHz',
  flo: 985e6,
  floUnit: 'MHz',
  order: 5,
  margin: 10e6,
  marginUnit: 'MHz',
});

const F_MIN = 1e3;
const F_MAX = 1e12;
const MAX_ROWS = 24;

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Conversion',
    fields: [
      { kind: 'select', key: 'conv', label: 'Direction', options: [{ value: 'down', label: 'Down (RF → IF)' }, { value: 'up', label: 'Up (IF → RF)' }], apply: (v, s) => switchDirection(s as MixState, v), help: 'Down: the input is the RF and the output the lower IF. Up: the input is the IF/baseband and the output the higher RF. Switching keeps the same RF, IF and LO: input and output trade places.' },
      { kind: 'select', key: 'side', label: 'LO injection', options: [{ value: 'high', label: 'High side' }, { value: 'low', label: 'Low side' }], apply: (_v, s) => { (s as MixState).solveFor = 'flo'; }, help: 'High side: LO above the RF (down) or above the output (up, spectrum inverted). Low side: LO below; an up-converter then uses the sum product. Switching keeps f_in and f_out and moves the LO to the other side.' },
      { kind: 'select', key: 'plan', label: 'LO plan', options: [{ value: 'fixed', label: 'Fixed (block)' }, { value: 'tuned', label: 'Tuned (channel)' }], help: 'Fixed: the whole input band is converted at once with one LO. Tuned: the LO follows one channel of width B_out across the input band, keeping the output at f_out (superheterodyne).' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequencies',
    note: 'Click ◎ to choose the unknown: f_LO, f_out or f_in.',
    fields: [
      { kind: 'number', key: 'fin', symbol: 'f_in', label: 'Input centre', units: U_FREQ, unitKey: 'finUnit', min: F_MIN, max: F_MAX, solvable: true, help: 'Centre of the input band: the RF for a down-converter, the IF for an up-converter.' },
      { kind: 'number', key: 'bin', symbol: 'B_in', label: 'Input BW', units: U_FREQ, unitKey: 'binUnit', min: 1, max: F_MAX, help: 'Fixed LO: width of the band present at the input. Tuned LO: the tuning range swept by the channel.' },
      { kind: 'number', key: 'fout', symbol: 'f_out', label: 'Output centre', units: U_FREQ, unitKey: 'foutUnit', min: F_MIN, max: F_MAX, solvable: true, help: 'Centre of the wanted output: the IF for a down-converter, the RF for an up-converter.' },
      { kind: 'number', key: 'bout', symbol: 'B_out', label: 'Output BW', units: U_FREQ, unitKey: 'boutUnit', min: 1, max: F_MAX, help: 'Passband of the filter after the mixer (IF filter). Tuned LO: the channel bandwidth.' },
      { kind: 'number', key: 'flo', symbol: 'f_LO', label: 'LO frequency', units: U_FREQ, unitKey: 'floUnit', min: F_MIN, max: F_MAX, solvable: true, help: 'Local oscillator. Tuned LO: the LO for the centre channel.' },
    ],
  },
  {
    kind: 'section',
    title: 'Spur search',
    fields: [
      { kind: 'number', key: 'order', symbol: 'N', label: 'Max order', integer: true, min: 2, max: 11, help: 'Products m·f_LO ± n·f_in with m + n ≤ N are checked. Mixer spur tables usually go to 5–7; higher orders are normally weak.' },
      { kind: 'number', key: 'margin', symbol: 'Δ', label: 'Edge margin', units: U_FREQ, unitKey: 'marginUnit', min: 0, max: F_MAX, help: 'A spur or response closer than this to the band edge is flagged yellow: it is hard to filter (filter skirt, drift).' },
    ],
  },
];

/**
 * Direction switch: when the frequencies are in the order of the old direction, the RF and IF trade the
 * input and output boxes (with their bandwidths, units and the ◎ unknown), so the same frequency plan is
 * described the other way round. The wanted-product relation gives
 * the same LO for either direction and side (down high: f_RF + f_IF = up high: f_out + f_in, and likewise
 * for low side), so the plan stays valid instead of turning into a down-converter with f_out > f_in.
 */
export function switchDirection(s: MixState, conv: Conv): void {
  // already in the order the new direction needs (e.g. typed the wrong way round for the old one): keep
  if (conv === 'up' ? s.fout > s.fin : s.fout < s.fin) return;
  [s.fin, s.fout] = [s.fout, s.fin];
  [s.finUnit, s.foutUnit] = [s.foutUnit, s.finUnit];
  [s.bin, s.bout] = [s.bout, s.bin];
  [s.binUnit, s.boutUnit] = [s.boutUnit, s.binUnit];
  if (s.solveFor === 'fin') s.solveFor = 'fout';
  else if (s.solveFor === 'fout') s.solveFor = 'fin';
}

const fF = (f: number, d = 5) => si(f, 'Hz', d);
type Tone3 = 'pass' | 'warn' | 'fail';

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: MixState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

const NAME: Record<MixState['solveFor'], [string, string]> = { flo: ['LO frequency', 'f_LO'], fout: ['Output centre', 'f_out'], fin: ['Input centre', 'f_in'] };

function run(st: MixState): CalcReport {
  const s: MixState = { ...st };
  if (!['flo', 'fout', 'fin'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  if (!['down', 'up'].includes(s.conv) || !['low', 'high'].includes(s.side) || !['fixed', 'tuned'].includes(s.plan)) throw new Error('Unknown direction, LO side or LO plan.');
  const need = (k: 'fin' | 'fout' | 'flo') => (s.solveFor === k ? 0 : finite(NAME[k][0], s[k]));
  const fin0 = need('fin');
  const fout0 = need('fout');
  const flo0 = need('flo');
  const bin = finite('Input bandwidth', s.bin);
  const bout = finite('Output bandwidth', s.bout);
  const N = finite('Order', s.order);
  const margin = finite('Margin', s.margin);
  if (!(bin > 0) || !(bout > 0)) throw new Error('Bandwidths must be > 0.');
  if (!Number.isInteger(N) || N < 2 || N > 11) throw new Error('The highest order must be a whole number from 2 to 11.');
  if (margin < 0) throw new Error('The near-band margin must be ≥ 0.');
  const noSolution = (why: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: why, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });

  // ── solve (exact inverses of the wanted-product relation)
  if (s.solveFor === 'flo') s.flo = loFor(s.conv, s.side, fin0, fout0);
  else if (s.solveFor === 'fout') s.fout = outFor(s.conv, s.side, fin0, flo0);
  else s.fin = inFor(s.conv, s.side, fout0, flo0);
  const bad = planProblem(s.conv, s.side, s.fin, s.fout, s.flo);
  if (bad) {
    const v = s[s.solveFor];
    return noSolution(`${NAME[s.solveFor][1]} would be ${fF(v)}, but ${bad}. Change the frequencies, the direction or the LO side.`);
  }
  for (const k of ['fin', 'fout', 'flo'] as const) if (!(s[k] >= F_MIN && s[k] <= F_MAX)) return noSolution(`${NAME[k][1]} = ${fF(s[k])} is outside 1 kHz … 1 THz.`);
  const a = s.fin - bin / 2;
  const b = s.fin + bin / 2;
  const c = s.fout - bout / 2;
  const d = s.fout + bout / 2;
  if (!(a > 0)) throw new Error(`The input band reaches ${fF(a)}: make B_in smaller than 2·f_in.`);
  if (!(c > 0)) throw new Error(`The output band reaches ${fF(c)}: make B_out smaller than 2·f_out.`);

  const ws = wantedSign(s.conv, s.side);
  const law = loLaw(s.plan, s.conv, s.side, s.flo, s.fout);
  if (s.plan === 'tuned' && !(Math.min(law[0] * a + law[1], law[0] * b + law[1]) > 0)) return noSolution(`Tuning across ${fF(a, 4)} … ${fF(b, 4)} would need a negative LO frequency. Narrow B_in or change the LO side.`);
  const spurs = outputSpurs(N, ws, a, b, law, c, d, s.plan === 'tuned' ? bout : 0);
  const tone = (dist: number): Tone3 => (dist === 0 ? 'fail' : dist < margin ? 'warn' : 'pass');
  const inBand = spurs.filter((x) => x.dist === 0);
  const near = spurs.filter((x) => x.dist > 0 && x.dist < margin);
  const resp = responses(N, s.flo, c, d, a, b, s.fin, ws);
  const respOther = resp.filter((r) => !r.wanted);

  // Wanted output band (fixed LO: image of the input band; tuned: f_out)
  const wantedBand = sweep({ m: 1, n: 1, sign: ws, order: 2 }, a, b, law);
  const lowest = inBand.length ? inBand.reduce((x, y) => (y.p.order < x.p.order ? y : x)) : null;
  const nearest = spurs[0];
  // Every reported frequency is folded to a physical (positive) one: with a low-side LO below the IF
  // (f_LO < f_out) the image comes from the sum product at |f_LO − f_out|.
  const imageIn = s.conv === 'down' ? Math.abs(s.side === 'low' ? s.flo - s.fout : s.flo + s.fout) : null;
  const otherSideband = Math.abs(s.flo - ws * s.fin);
  const halfIf = s.conv === 'down' ? Math.abs(s.side === 'low' ? s.fin - s.fout / 2 : s.fin + s.fout / 2) : null;
  const sbOffset = Math.abs(otherSideband - s.fout);
  const loA = law[0] * a + law[1];
  const loB = law[0] * b + law[1];
  const loGap = Math.max(0, s.flo < a ? a - s.flo : s.flo > b ? s.flo - b : 0);

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const [sl, ss] = NAME[s.solveFor];
  report.results = [
    item(s.solveFor, sl, s[s.solveFor], 'Hz', fF(s[s.solveFor], 6), { symbol: ss, solved: true, primary: true, note: s.solveFor === 'flo' ? `${s.side}-side, ${s.conv}-conversion` : `${productName({ m: 1, n: 1, sign: ws, order: 2 })}` }),
    item('inBand', 'Spurs in the output band', inBand.length, '', String(inBand.length), {
      primary: true,
      tone: inBand.length ? 'fail' : 'pass',
      note: lowest ? `lowest: ${productName(lowest.p)} (order ${lowest.p.order})` : `none up to order ${N}`,
    }),
    item('nearest', 'Nearest spur', nearest ? nearest.dist : null, 'Hz', nearest ? (nearest.dist === 0 ? 'in band' : `${fF(nearest.dist, 4)} away`) : '—', {
      primary: true,
      tone: nearest ? tone(nearest.dist) : '',
      note: nearest ? `${productName(nearest.p)}: ${fF(nearest.lo, 4)} … ${fF(nearest.hi, 4)}` : '',
    }),
    s.conv === 'down'
      ? item('image', 'Image frequency', imageIn, 'Hz', fF(imageIn!, 5), { primary: true, symbol: 'f_im', note: `${fF(Math.abs(imageIn! - s.fin), 4)} from f_in · reject before the mixer` })
      : item('otherSideband', 'Other sideband', otherSideband, 'Hz', fF(otherSideband, 5), { primary: true, symbol: 'f_LO ∓ f_in', note: `${fF(Math.abs(otherSideband - s.fout), 4)} from f_out · reject after the mixer` }),
    item('nearCount', 'Spurs near the band', near.length, '', String(near.length), { group: 'Output spurs', tone: near.length ? 'warn' : '', note: `within Δ = ${fF(margin, 3)}` }),
    item('total', 'Products checked', spurs.length, '', String(spurs.length), { group: 'Output spurs', note: `m + n ≤ ${N}, excluding the wanted 1×1` }),
    item('respInBand', 'Responses inside input band', respOther.filter((r) => r.dist === 0).length, '', String(respOther.filter((r) => r.dist === 0).length), { group: 'Input-referred responses', note: 'cannot be filtered before the mixer' }),
    item('respNear', 'Responses near input band', respOther.filter((r) => r.dist > 0 && r.dist < margin).length, '', String(respOther.filter((r) => r.dist > 0 && r.dist < margin).length), { group: 'Input-referred responses' }),
  ];
  if (halfIf != null) report.results.push(item('halfIf', 'Half-IF response', halfIf, 'Hz', fF(halfIf, 5), { group: 'Input-referred responses', symbol: '2×2', note: `${fF(Math.abs(halfIf - s.fin), 4)} from f_in` }));
  if (s.conv === 'up') report.results.push(item('otherSideNote', 'Other sideband offset', sbOffset, 'Hz', fF(sbOffset, 4), { group: 'Frequency plan', note: Math.abs(sbOffset - 2 * s.fin) <= 1e-9 * s.fout ? '= 2·f_in' : '= 2·f_LO (LO below the input)' }));
  report.results.push(
    item('inLo', 'Input band', a, 'Hz', `${fF(a, 5)} … ${fF(b, 5)}`, { group: 'Frequency plan' }),
    item('outLo', 'Output band', c, 'Hz', `${fF(c, 5)} … ${fF(d, 5)}`, { group: 'Frequency plan', note: s.plan === 'fixed' ? `wanted product covers ${fF(wantedBand[0], 4)} … ${fF(wantedBand[1], 4)}` : 'one channel, LO tuned' }),
    item('loRange', s.plan === 'tuned' ? 'LO tuning range' : 'LO frequency', s.flo, 'Hz', s.plan === 'tuned' ? `${fF(Math.min(loA, loB), 5)} … ${fF(Math.max(loA, loB), 5)}` : fF(s.flo, 6), { group: 'Frequency plan' }),
    item('loGap', 'LO to input band', loGap, 'Hz', loGap === 0 ? 'inside the band' : fF(loGap, 4), { group: 'Frequency plan', tone: loGap === 0 ? 'warn' : '', note: 'LO leakage out of the input port' }),
    item('lo2', '2nd LO harmonic', 2 * s.flo, 'Hz', fF(2 * s.flo, 5), { group: 'Frequency plan' }),
  );

  // ── status, warnings, notes
  report.status = inBand.length ? { text: `${inBand.length} IN BAND`, tone: 'fail' } : near.length ? { text: 'CHECK', tone: 'warn' } : { text: 'CLEAR', tone: 'pass' };
  const W = report.warnings;
  if (inBand.length) W.push(`${inBand.length} product${inBand.length > 1 ? 's' : ''} of order ≤ ${N} ${inBand.length > 1 ? 'fall' : 'falls'} in the output band (lowest: ${productName(lowest!.p)}, order ${lowest!.p.order}). Move f_out or switch the LO side, or check the mixer’s m×n table that these orders are weak enough.`);
  if (s.plan === 'fixed' && bout < wantedBand[1] - wantedBand[0] - 1e-6 * s.fout) W.push(`The output bandwidth (${fF(bout, 4)}) is narrower than the converted input band (${fF(wantedBand[1] - wantedBand[0], 4)}): part of the wanted signal is filtered off. Widen B_out or narrow B_in.`);
  if (s.plan === 'fixed' && Math.max(wantedBand[0], c) > Math.min(wantedBand[1], d)) W.push('The wanted product misses the output band. Check f_out against the conversion and LO side.');
  if (imageIn != null && imageIn + bin / 2 > a - margin && imageIn - bin / 2 < b + margin) W.push(`The image band (around ${fF(imageIn, 4)}) overlaps or comes within Δ of the input band: no fixed filter can separate them. Move the plan so the image (now ${fF(Math.abs(imageIn - s.fin), 4)} from f_in) is more than B_in + Δ away, or use an image-reject (IQ) mixer.`);
  if (loGap === 0 && s.plan === 'fixed') W.push('The LO lies inside the input band: LO leakage and reciprocal mixing land on wanted signals. Move the LO out of band.');
  if (N < 5) report.notes.push(`Only orders up to ${N} are checked; mixer spur tables usually list up to 5–7.`);
  report.notes.push('Frequencies only: spur levels depend on the mixer and its drive. An m×n spur’s level relative to the wanted output changes by about (n − 1) dB per dB of input level, so lower input drive suppresses high-n spurs.');
  if (s.plan === 'tuned') report.notes.push('Tuned plan: each spur is checked for the channel’s own signal as it tunes across B_in; its n-th harmonic is taken as n·B_out wide.');
  report.summary = `${fF(s.fin, 5)} ± ${fF(bin / 2, 3)} → ${fF(s.fout, 5)} with ${s.side}-side LO ${fF(s.flo, 6)} · ${inBand.length} in-band, ${near.length} near (order ≤ ${N})`;
  report.details = { a, b, c, d, wantedSign: ws, law, imageIn, halfIf, otherSideband, inBand: inBand.map((x) => productName(x.p)), near: near.map((x) => productName(x.p)), spurs: spurs.map((x) => ({ m: x.p.m, n: x.p.n, sign: x.p.sign, lo: x.lo, hi: x.hi, dist: x.dist })), responses: resp.map((x) => ({ m: x.p.m, n: x.p.n, sign: x.p.sign, lo: x.lo, hi: x.hi, dist: x.dist, wanted: x.wanted })) };
  report.tables = [spurTable(spurs, tone, N, margin), respTable(resp, tone, margin, halfIf)];
  report.graphs = graphs(s, N, ws, law, a, b, c, d, spurs, resp, margin);
  return report;
}

function label(p: Product): string {
  if (p.m === 1 && p.n === 0) return 'LO leakage';
  if (p.m === 0 && p.n === 1) return 'input feedthrough';
  if (p.n === 0) return 'LO harmonic';
  if (p.m === 0) return 'input harmonic';
  if (p.m === 1 && p.n === 1) return 'other sideband';
  return '';
}

function spurTable(spurs: SpurHit[], tone: (d: number) => Tone3, N: number, margin: number): TableSpec {
  const rows = spurs.slice(0, MAX_ROWS);
  return {
    id: 'output-spurs',
    title: `Output spurs nearest the band (${rows.length} of ${spurs.length})`,
    columns: [
      { key: 'product', label: 'Product', align: 'left' },
      { key: 'order', label: 'Order' },
      { key: 'lo', label: 'From', unit: 'Hz' },
      { key: 'hi', label: 'To', unit: 'Hz' },
      { key: 'dist', label: 'Distance to band', unit: 'Hz' },
      { key: 'note', label: 'Note', align: 'left' },
    ],
    rows: rows.map((x) => ({ product: productName(x.p), m: x.p.m, n: x.p.n, order: x.p.order, lo: x.lo, hi: x.hi, dist: x.dist, note: label(x.p) })),
    display: rows.map((x) => ({ product: productName(x.p), order: String(x.p.order), lo: fF(x.lo, 5), hi: fF(x.hi, 5), dist: x.dist === 0 ? 'in band' : fF(x.dist, 4), note: label(x.p) })),
    rowTones: rows.map((x) => tone(x.dist)),
    note: `Frequencies |m·f_LO ± n·f_in| swept over the input band, m + n ≤ ${N}. Red: lands in the output band (cannot be filtered); yellow: within Δ = ${fF(margin, 3)} of a band edge; green: clear.`,
  };
}

function respTable(resp: Response[], tone: (d: number) => Tone3, margin: number, halfIf: number | null): TableSpec {
  const rows = resp.slice(0, MAX_ROWS);
  const name = (r: Response) => {
    if (r.wanted) return 'wanted';
    if (r.p.m === 1 && r.p.n === 1) return 'image';
    if (r.p.m === 0 && r.p.n === 1) return 'IF feedthrough';
    if (r.p.m === 2 && r.p.n === 2 && r.p.sign < 0 && halfIf != null && Math.abs((r.lo + r.hi) / 2 - halfIf) < 1e-9 * halfIf) return 'half-IF';
    return '';
  };
  return {
    id: 'input-responses',
    title: `Input frequencies that reach the output band (${rows.length} of ${resp.length})`,
    columns: [
      { key: 'product', label: 'Product', align: 'left' },
      { key: 'order', label: 'Order' },
      { key: 'lo', label: 'Input from', unit: 'Hz' },
      { key: 'hi', label: 'Input to', unit: 'Hz' },
      { key: 'dist', label: 'Distance to input band', unit: 'Hz' },
      { key: 'note', label: 'Note', align: 'left' },
    ],
    rows: rows.map((r) => ({ product: productName(r.p), order: r.p.order, lo: r.lo, hi: r.hi, dist: r.dist, note: name(r) })),
    display: rows.map((r) => ({ product: productName(r.p), order: String(r.p.order), lo: fF(r.lo, 5), hi: fF(r.hi, 5), dist: r.dist === 0 ? 'in band' : fF(r.dist, 4), note: name(r) })),
    rowTones: rows.map((r) => (r.wanted ? '' : tone(r.dist))),
    note: `Inputs f with |m·f_LO ± n·f| in the output band, at the centre-channel LO. These must be rejected by the filter before the mixer. Red: inside the input band; yellow: within Δ = ${fF(margin, 3)} of it; green: clear. The wanted response is not toned.`,
  };
}

function graphs(s: MixState, N: number, ws: 1 | -1, law: [number, number], a: number, b: number, c: number, d: number, spurs: SpurHit[], resp: Response[], margin: number): GraphSpec[] {
  const bin = b - a;
  const bout = d - c;
  // 1 — spur chart: product frequency vs input frequency, output band as limits
  const x0 = Math.max(a - 0.25 * bin, a * 0.5);
  const x1 = b + 0.25 * bin;
  const xs = Array.from({ length: 121 }, (_, i) => x0 + ((x1 - x0) * i) / 120);
  // window: the band, its margin, and at least the nearest spur (up to one f_out away)
  const win = Math.max(3 * bout, 2 * margin, 0.05 * s.fout, spurs.length ? Math.min(1.3 * spurs[0].dist + bout, s.fout) : 0);
  const y0 = Math.max(c - win, 0);
  const y1 = d + win;
  const wanted: Product = { m: 1, n: 1, sign: ws, order: 2 };
  const visible = spurs
    .filter((h) => {
      const [lo, hi] = sweep(h.p, x0, x1, law);
      return lo <= y1 && hi >= y0;
    })
    .slice(0, 10);
  const chart: GraphSpec = {
    id: 'spur-chart',
    title: 'Spur chart',
    subtitle: s.plan === 'fixed' ? `Fixed LO ${fF(s.flo, 5)}: products vs input frequency` : 'LO tuned with the channel: products vs channel frequency',
    x: { label: s.plan === 'fixed' ? 'Input frequency' : 'Channel frequency', unit: 'Hz' },
    y: [{ id: 'f', label: 'Product frequency', unit: 'Hz', min: y0, max: y1 }],
    series: [
      { label: `wanted ${productName(wanted)}`, x: xs, y: xs.map((x) => prodFreq(wanted, x, law)), axis: 'f', width: 3, color: '#1f4e5f' },
      ...visible.map((h) => ({ label: `${productName(h.p)} (${h.p.order})`, x: xs, y: xs.map((x) => prodFreq(h.p, x, law)), axis: 'f', width: h.dist === 0 ? 2 : 1.3 })),
    ],
    hlines: [
      { value: c, label: 'band low', axis: 'f', color: '#8b1e1e', dash: [6, 4], width: 1.3 },
      { value: d, label: 'band high', axis: 'f', color: '#8b1e1e', dash: [6, 4], width: 1.3 },
    ],
    vlines: [
      { value: a, label: 'input band', color: '#9a8f7a', dash: [3, 3] },
      { value: b, label: '', color: '#9a8f7a', dash: [3, 3] },
    ],
    markers: [{ x: s.fin, y: s.fout, axis: 'f', label: fF(s.fout, 4) }],
    xRange: [x0, x1],
  };

  // 2 — output spectrum at the band-centre input (stems; height = N + 1 − order so low orders stand tallest)
  const all = products(N, ws).map((p) => ({ p, f: prodFreq(p, s.fin, law) })).filter((x) => x.f > 0);
  const fmax = Math.max(...all.map((x) => x.f), s.fout) * 1.05;
  const stems = (pts: { f: number; h: number }[]) => {
    const sorted = [...pts].sort((u, v) => u.f - v.f);
    const x: number[] = [0];
    const y: number[] = [0];
    for (const p of sorted) x.push(p.f, p.f, p.f), y.push(0, p.h, 0);
    x.push(fmax), y.push(0);
    return { x, y };
  };
  const spec: GraphSpec = {
    id: 'output-spectrum',
    title: 'Output spectrum',
    subtitle: `Products at f_in = ${fF(s.fin, 5)} near the output band; stem height N + 1 − order (low orders tallest, levels not modelled)`,
    x: { label: 'Output frequency', unit: 'Hz' },
    y: [{ id: 'h', label: 'N + 1 − order', unit: '', min: 0, max: N + 0.5 }],
    series: [
      { label: 'wanted', ...stems([{ f: s.fout, h: N - 1 }]), axis: 'h', width: 3, color: '#1f4e5f' },
      ...Array.from({ length: N }, (_, i) => i + 1)
        .map((o) => ({ o, pts: all.filter((x) => x.p.order === o).map((x) => ({ f: x.f, h: N + 1 - o })) }))
        .filter((g) => g.pts.length)
        .map((g) => ({ label: `order ${g.o}`, ...stems(g.pts), axis: 'h', width: 1.4 })),
    ],
    vlines: [
      { value: c, label: 'output band', color: '#8b1e1e', dash: [6, 4] },
      { value: d, label: '', color: '#8b1e1e', dash: [6, 4] },
    ],
    // open on the neighbourhood of the output band, where spurs matter; the CSV and hover keep the rest
    xRange: [0, Math.min(fmax, Math.max(3 * d, d + 10 * bout))],
  };

  // 3 — input-referred responses (stems at the centre of each response)
  const rs = resp.map((r) => ({ f: (r.lo + r.hi) / 2, h: N + 1 - r.p.order, wanted: r.wanted }));
  const rmax = Math.max(...rs.map((x) => x.f), b) * 1.05;
  const rstems = (pts: { f: number; h: number }[]) => {
    const sorted = [...pts].sort((u, v) => u.f - v.f);
    const x: number[] = [0];
    const y: number[] = [0];
    for (const p of sorted) x.push(p.f, p.f, p.f), y.push(0, p.h, 0);
    x.push(rmax), y.push(0);
    return { x, y };
  };
  const inp: GraphSpec = {
    id: 'input-responses',
    title: 'Input responses',
    subtitle: 'Input frequencies converted into the output band; stem height N + 1 − order',
    x: { label: 'Input frequency', unit: 'Hz' },
    y: [{ id: 'h', label: 'N + 1 − order', unit: '', min: 0, max: N + 0.5 }],
    series: [
      { label: 'wanted', ...rstems(rs.filter((x) => x.wanted)), axis: 'h', width: 3, color: '#1f4e5f' },
      { label: 'spurious responses', ...rstems(rs.filter((x) => !x.wanted)), axis: 'h', width: 1.4, color: '#c47b17' },
    ],
    vlines: [
      { value: a, label: 'input band', color: '#8b1e1e', dash: [6, 4] },
      { value: b, label: '', color: '#8b1e1e', dash: [6, 4] },
      { value: s.flo, label: 'LO', color: '#9a8f7a', dash: [2, 3] },
    ],
    xRange: [0, rmax],
  };
  return [chart, spec, inp];
}

export const def: CalcDef<MixState> = {
  id: ID,
  version: '0.1.0',
  method: 'All products |m·f_LO ± n·f_in| with m + n ≤ N, swept over the input band (fixed LO) or with the LO tracking the channel (tuned), checked against the output band; input-referred responses f = (m·f_LO ± f_out)/n (Henderson & Camargo 2013; Pozar 4th ed. ch. 13; Rohde et al., Communications Receivers, 2017). Frequencies only, no spur levels.',
  fields,
  defaults,
  solve: { options: [{ key: 'flo', label: 'LO frequency' }, { key: 'fout', label: 'Output centre' }, { key: 'fin', label: 'Input centre' }], default: 'flo' },
  compute,
  examples: [
    { id: 'default', label: '902–928 MHz ISM to 70 MHz IF, high-side LO', state: defaults() },
    { id: 'ism-low-if', label: '2.4 GHz ISM block to a 100 MHz IF: 2×2 lands in band', state: { solveFor: 'flo', conv: 'down', side: 'low', plan: 'fixed', fin: 2.44175e9, finUnit: 'GHz', bin: 83.5e6, binUnit: 'MHz', fout: 100e6, foutUnit: 'MHz', bout: 83.5e6, boutUnit: 'MHz', order: 7, margin: 10e6 } },
    { id: 'fm-broadcast', label: 'FM receiver 88–108 MHz, 10.7 MHz IF (tuned LO)', state: { solveFor: 'flo', conv: 'down', side: 'high', plan: 'tuned', fin: 98e6, finUnit: 'MHz', bin: 20e6, binUnit: 'MHz', fout: 10.7e6, foutUnit: 'MHz', bout: 200e3, boutUnit: 'kHz', order: 5, margin: 1e6 } },
    { id: 'upconvert', label: 'Up-convert 140 MHz IF to 2.45 GHz, high-side LO', state: { solveFor: 'flo', conv: 'up', side: 'high', plan: 'fixed', fin: 140e6, finUnit: 'MHz', bin: 20e6, binUnit: 'MHz', fout: 2.45e9, foutUnit: 'GHz', bout: 20e6, boutUnit: 'MHz', order: 5, margin: 20e6 } },
    { id: 'solve-if', label: 'GPS L1 with a 1.4 GHz LO: what IF? (low-side)', state: { solveFor: 'fout', conv: 'down', side: 'low', plan: 'fixed', fin: 1575.42e6, finUnit: 'MHz', bin: 2.046e6, binUnit: 'MHz', flo: 1.4e9, floUnit: 'GHz', bout: 2.046e6, boutUnit: 'MHz', order: 7, margin: 2e6 } },
  ],
};
