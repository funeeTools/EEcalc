/** Ohm's law — calculator definition (any two of V, I, R, P give the rest; part rating and E-series check). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { E_SERIES, bracketE, nearestE } from '@/core/eseries';
import type { FieldSpec, NumberField } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { DERATE, NoSolution, PAIRS, PARTS, type Pair, type PartRating, type Q, QS, type VIRP, autoPart, criticalResistance, pairOf, ratedVoltage, solve } from './model';

export const ID = 'general/ohms-law';

export interface OhmState {
  /** The two known quantities */
  given: Pair;
  /** The known kept when a computed value is made known by its ◎ (the most recently chosen one) */
  keep: Q;
  v: number;
  vUnit: string;
  i: number;
  iUnit: string;
  r: number;
  rUnit: string;
  p: number;
  pUnit: string;
  /** 'auto' or a PARTS id */
  part: string;
  eseries: string;
  /** Resistor tolerance, % */
  tol: number;
}

export const defaults = (): OhmState => ({
  given: 'vr',
  keep: 'r',
  v: 5,
  vUnit: 'V',
  i: 5e-3,
  iUnit: 'mA',
  r: 1e3,
  rUnit: 'kΩ',
  p: 25e-3,
  pUnit: 'mW',
  part: 'auto',
  eseries: 'E24',
  tol: 1,
});

// Prefix ranges wide enough that any solved value reads as 1–9999 somewhere (style guide §5a).
const U_V: Record<string, number> = { V: 1, mV: 1e-3, 'µV': 1e-6, nV: 1e-9, kV: 1e3 };
const U_I: Record<string, number> = { mA: 1e-3, A: 1, 'µA': 1e-6, nA: 1e-9, pA: 1e-12, fA: 1e-15, kA: 1e3 };
const U_R: Record<string, number> = { ...withDefault(U_OHM, 'kΩ'), 'GΩ': 1e9, 'TΩ': 1e12 };
const U_P: Record<string, number> = { mW: 1e-3, W: 1, 'µW': 1e-6, nW: 1e-9, pW: 1e-12, fW: 1e-15, kW: 1e3, MW: 1e6 };

const LIM = { v: [-1e6, 1e6], i: [-1e6, 1e6], r: [1e-4, 1e13], p: [0, 1e12] } as const;
const NAME: Record<Q, string> = { v: 'Voltage', i: 'Current', r: 'Resistance', p: 'Power' };
const SYM: Record<Q, string> = { v: 'V', i: 'I', r: 'R', p: 'P' };
const UNIT: Record<Q, string> = { v: 'V', i: 'A', r: 'Ω', p: 'W' };
const PAIR_LABEL: Record<Pair, string> = { vi: 'V and I', vr: 'V and R', vp: 'V and P', ir: 'I and R', ip: 'I and P', rp: 'R and P' };

const known = (s: { given: Pair }, q: Q) => s.given.includes(q);

/**
 * ◎ on a computed value makes it known, keeping the known chosen last; ◎ on a known value makes it
 * computed and brings in the first computed one (V, I, R, P order).
 */
function makeKnown(root: OhmState, q: Q): void {
  const keep = known(root, root.keep) && root.keep !== q ? root.keep : (root.given.split('') as Q[]).find((x) => x !== q)!;
  root.given = pairOf(q, keep);
  root.keep = q;
}
function makeComputed(root: OhmState, q: Q): void {
  const other = (root.given.split('') as Q[]).find((x) => x !== q)!;
  const bring = QS.find((x) => x !== q && !known(root, x))!;
  root.given = pairOf(other, bring);
  root.keep = bring;
}

const qField = (q: Q, units: Record<string, number>, help: string): NumberField => ({
  kind: 'number',
  key: q,
  symbol: SYM[q],
  label: NAME[q],
  units,
  unitKey: `${q}Unit`,
  min: LIM[q][0],
  max: LIM[q][1],
  solvable: true,
  solvedWhen: (_s, root) => !known(root as OhmState, q),
  onSolve: (_s, root) => makeComputed(root as OhmState, q),
  onUnsolve: (_s, root) => makeKnown(root as OhmState, q),
  help,
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Ohm’s law',
    note: 'Enter two values; the other two are computed (green). Click ◎ on a green value to make it one of the two you give.',
    fields: [
      { kind: 'select', key: 'given', label: 'Known values', options: PAIRS.map((p) => ({ value: p, label: PAIR_LABEL[p] })), apply: (v: Pair, _s, root) => (root.keep = v[1]), help: 'Which two of V, I, R and P you know. The other two follow from V = I·R and P = V·I.' },
      qField('v', U_V, 'Voltage across the resistor (DC, or RMS for AC into a pure resistance). Negative values work: I then has the same sign.'),
      qField('i', U_I, 'Current through the resistor, same sign as V (passive sign convention).'),
      qField('r', U_R, 'Resistance, 0.1 mΩ to 10 TΩ.'),
      qField('p', U_P, 'Power dissipated as heat, P = V·I = I²R = V²/R. Always ≥ 0 in a resistor.'),
    ],
  },
  {
    kind: 'section',
    title: 'Part check',
    fields: [
      { kind: 'select', key: 'part', label: 'Resistor rating', options: [{ value: 'auto', label: 'Smallest that fits (≤ 50 % load)' }, ...PARTS.map((p) => ({ value: p.id, label: p.label }))], help: 'Package or power class to check the dissipation and voltage against. Chip ratings: Vishay CRCW e3 thick film at 70 °C (rated power, limiting element voltage). Leaded parts: power only; their voltage limits vary by series, so check the datasheet.' },
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: Object.keys(E_SERIES), help: 'IEC 60063 series for the nearest standard resistor.' },
      { kind: 'number', key: 'tol', symbol: 'tol', label: 'Resistor tolerance', suffix: '%', min: 0, max: 50, help: 'Initial tolerance, for the spread of current and power.' },
    ],
  },
];

const fmt = (q: Q, x: number, d = 4) => si(x, UNIT[q], d);
const pct = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)} %`;

function fail(msg: string, s: OhmState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, status: { text: 'NO SOLUTION', tone: 'fail' }, details: { given: s.given } };
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

/** The quantity held fixed when R changes (E-series snapping, tolerance): the source that drives the resistor. */
export function heldOf(given: Pair): 'v' | 'i' {
  return given.includes('v') ? 'v' : given.includes('i') ? 'i' : 'v';
}

export function partFor(s: OhmState, x: VIRP): { part: PartRating | null; auto: boolean } {
  if (s.part === 'auto') return { part: autoPart(x.p, x.v), auto: true };
  const part = PARTS.find((p) => p.id === s.part);
  if (!part) throw new Error(`Unknown resistor rating "${s.part}".`);
  return { part, auto: false };
}

export function compute(st: OhmState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    if (e instanceof NoSolution) return fail(e.message, st);
    return errorReport(ID, e);
  }
}

function run(s: OhmState): CalcReport {
  if (!PAIRS.includes(s.given)) throw new Error(`Known values must be one of ${PAIRS.join(', ')}.`);
  if (!E_SERIES[s.eseries]) throw new Error(`Unknown series "${s.eseries}".`);
  const tol = finite('Tolerance', s.tol) / 100;
  if (tol < 0 || tol >= 1) throw new Error('Tolerance must be between 0 and 100 %.');
  const inp: Partial<VIRP> = {};
  for (const q of s.given.split('') as Q[]) {
    inp[q] = finite(NAME[q], s[q]);
    if (inp[q]! < LIM[q][0] || inp[q]! > LIM[q][1]) throw new Error(`${NAME[q]} must be between ${fmt(q, LIM[q][0], 3)} and ${fmt(q, LIM[q][1], 3)}.`);
  }
  const x = solve(s.given, inp, typeof s.v === 'number' && s.v < 0 ? -1 : 1);
  // A computed value must stay inside its input's range (style guide §4): say what limits it.
  // Mode-switch harness: "error-after-edit" flags from typing a min/max (V = −1 MV against I > 0, P = 0 W,
  // I = 1 MA into 5 V…) are these messages and the open/short/active-part ones in solve(): typed numbers
  // that describe no resistor, which §5a says must report their own error. Setting switches never hit them
  // because all four values stay consistent after every compute.
  for (const q of QS) {
    if (known(s, q)) continue;
    const [lo, hi] = LIM[q];
    if (!(x[q] >= lo - 1e-12 * Math.abs(lo) && x[q] <= hi + 1e-12 * Math.abs(hi))) {
      const r = x[q];
      if (q === 'r') return fail(`These values need R = ${si(r, 'Ω', 4)}, outside 0.1 mΩ … 10 TΩ: ${r < 1 ? 'the current is too large for the voltage' : 'the current is too small for the voltage'}.`, s);
      return fail(`These values need ${SYM[q]} = ${fmt(q, r)}, beyond the ${fmt(q, hi, 3)} this page handles.`, s);
    }
  }

  const report: CalcReport = { ...emptyReport(ID) };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const unknowns = QS.filter((q) => !known(s, q));
  const NOTE: Record<Q, string> = { v: 'V = I·R', i: 'I = V/R', r: 'R = V/I', p: 'P = V·I' };
  const primary = [...unknowns, ...(s.given.split('') as Q[])].map((q) =>
    item(q, NAME[q], x[q], UNIT[q], fmt(q, x[q], 5), { symbol: SYM[q], primary: true, solved: !known(s, q), note: known(s, q) ? 'given' : NOTE[q] }),
  );

  // ── part rating (IEC 60115-1: rated power at 70 °C; rated voltage √(P·R) capped at the element limit)
  const { part, auto } = partFor(s, x);
  const rest: ResultItem[] = [];
  let load = NaN;
  let vOver = false;
  if (part) {
    load = x.p / part.p;
    const uR = ratedVoltage(part, x.r);
    vOver = part.vMax != null && Math.abs(x.v) > part.vMax * (1 + 1e-12);
    const tone = load > 1 || vOver ? 'fail' : load > DERATE ? 'warn' : 'pass';
    rest.push(
      item('part', auto ? 'Smallest suitable part' : 'Part checked', part.id, '', part.label, { group: 'Part check', tone }),
      item('load', 'Load (P / rating)', load, '', `${(load * 100).toFixed(1)} %`, { group: 'Part check', tone: load > 1 ? 'fail' : load > DERATE ? 'warn' : '', note: `${si(x.p, 'W', 3)} of ${si(part.p, 'W', 3)} at 70 °C` }),
      item('uRated', 'Rated voltage at this R', uR, 'V', si(uR, 'V', 3), { group: 'Part check', tone: Math.abs(x.v) > uR * (1 + 1e-9) ? 'fail' : '', note: part.vMax != null ? `min(√(P_r·R), ${part.vMax} V)` : '√(P_r·R); voltage limit: see datasheet' }),
    );
    const rc = criticalResistance(part);
    if (rc != null) rest.push(item('rCrit', 'Critical resistance', rc, 'Ω', si(rc, 'Ω', 3), { group: 'Part check', note: 'above it the voltage limit, not power, sets V_max' }));
    if (load > 1) warnings.push(`${si(x.p, 'W', 3)} is ${(load).toFixed(2)}× the ${si(part.p, 'W', 3)} rating of ${part.id.startsWith('w') ? 'this part' : `an ${part.id} chip`}: it will overheat. Use a part rated at least ${si(2 * x.p, 'W', 3)} (2× margin), or raise R (at fixed V) or lower it (at fixed I).`);
    else if (load > DERATE) warnings.push(`The resistor runs at ${(load * 100).toFixed(0)} % of its rating. Common derating practice is ≤ 50 % (and the rating itself falls above 70 °C ambient): pick the next size up for margin.`);
    if (vOver) warnings.push(`${si(Math.abs(x.v), 'V', 3)} exceeds the ${part.vMax} V limiting element voltage of ${part.id} chips. Use a high-voltage part or several resistors in series.`);
  } else {
    rest.push(item('part', 'Smallest suitable part', null, '', 'none ≤ 10 W', { group: 'Part check', tone: 'warn' }));
    warnings.push(`${si(x.p, 'W', 3)} is beyond the 10 W parts in this list (at ≤ 50 % load). Use a chassis-mount or wirewound power resistor on a heatsink, or spread the power over several resistors.`);
  }
  if (auto && part && part.vMax == null && Math.abs(x.v) > 500) notes.push('Leaded parts are checked for power only: confirm the limiting element voltage in the datasheet.');

  // ── nearest standard value, with the source quantity held
  const held = heldOf(s.given);
  const at = (r: number) => (held === 'v' ? { i: x.v / r, p: (x.v * x.v) / r } : { i: x.i, p: x.i * x.i * r, v: x.i * r });
  const [below, above] = bracketE(s.eseries, x.r);
  const near = nearestE(x.r, s.eseries);
  const cands = [...new Set([below, near, above])].sort((a, b) => a - b);
  const heldTxt = held === 'v' ? `V = ${fmt('v', x.v, 4)}` : `I = ${fmt('i', x.i, 4)}`;
  rest.push(
    item('rStd', `Nearest ${s.eseries} value`, near, 'Ω', si(near, 'Ω', 3), { group: 'Standard value', note: `${pct(near / x.r - 1)} from R` }),
    item(held === 'v' ? 'iStd' : 'vStd', held === 'v' ? 'Current with it' : 'Voltage with it', held === 'v' ? at(near).i : at(near).v!, held === 'v' ? 'A' : 'V', held === 'v' ? fmt('i', at(near).i) : fmt('v', at(near).v!), { group: 'Standard value', note: `at the same ${heldTxt}` }),
    item('pStd', 'Power with it', at(near).p, 'W', si(at(near).p, 'W', 4), { group: 'Standard value' }),
  );

  // ── tolerance spread (same held quantity)
  const lo = at(x.r * (1 - tol));
  const hi = at(x.r * (1 + tol));
  if (held === 'v') {
    rest.push(item('iRange', 'Current range', lo.i, 'A', `${fmt('i', hi.i, 4)} … ${fmt('i', lo.i, 4)}`, { group: `At ±${+(tol * 100).toPrecision(3)} %`, note: `R from ${si(x.r * (1 - tol), 'Ω', 4)} to ${si(x.r * (1 + tol), 'Ω', 4)}` }));
    rest.push(item('pMax', 'Worst-case power', lo.p, 'W', si(lo.p, 'W', 4), { group: `At ±${+(tol * 100).toPrecision(3)} %`, note: 'lowest R at fixed V' }));
  } else {
    rest.push(item('vRange', 'Voltage range', lo.v!, 'V', `${fmt('v', lo.v!, 4)} … ${fmt('v', hi.v!, 4)}`, { group: `At ±${+(tol * 100).toPrecision(3)} %`, note: `R from ${si(x.r * (1 - tol), 'Ω', 4)} to ${si(x.r * (1 + tol), 'Ω', 4)}` }));
    rest.push(item('pMax', 'Worst-case power', hi.p, 'W', si(hi.p, 'W', 4), { group: `At ±${+(tol * 100).toPrecision(3)} %`, note: 'highest R at fixed I' }));
  }
  rest.push(item('g', 'Conductance', 1 / x.r, 'S', si(1 / x.r, 'S', 4), { symbol: 'G', group: 'Other forms', note: 'G = 1/R = I/V' }));
  if (x.r < 0.1) notes.push('Below about 0.1 Ω, PCB traces, solder joints and contact resistance (milliohms each) add noticeably: use a 4-terminal (Kelvin) shunt and layout.');
  if (x.r > 1e8) notes.push('Above about 100 MΩ, board leakage, humidity and the input resistance of meters become comparable to R.');
  notes.push('Ideal linear resistor: V/I is the same at every operating point. For lamps, heaters and diodes the values hold only at the point entered. For AC use RMS values; reactance is not modelled.');
  if (x.r < 1 && part && !part.id.startsWith('w')) notes.push('The chip ratings here are for CRCW thick film, which starts at 1 Ω. Below 1 Ω use a current-sense series (metal element or metal strip) and its own power and pulse ratings.');
  if (part) notes.push('Ratings are at 70 °C ambient (IEC 60115-1); chip resistors derate linearly to zero at about 155 °C and need the PCB copper the datasheet assumes.');

  report.results = [...primary, ...rest];
  report.tables = [stdTable(s, x, cands, near, held, at, tol, part)];
  report.graphs = graphs(x, held, part);
  report.summary = `${fmt('v', x.v, 4)} · ${fmt('i', x.i, 4)} · ${si(x.r, 'Ω', 4)} · ${si(x.p, 'W', 4)} — given ${PAIR_LABEL[s.given]}`;
  report.status = part ? { text: load > 1 || vOver ? 'OVER RATING' : load > DERATE ? 'ABOVE 50 %' : 'WITHIN RATING', tone: load > 1 || vOver ? 'fail' : load > DERATE ? 'warn' : 'pass' } : { text: 'OVER 10 W', tone: 'warn' };
  report.details = { ...x, held, part: part?.id ?? null, load, vOver, below, above, near };
  return report;
}

function stdTable(s: OhmState, x: VIRP, cands: number[], near: number, held: 'v' | 'i', at: (r: number) => { i: number; p: number; v?: number }, tol: number, part: PartRating | null): TableSpec {
  const prow = (r: number) => {
    const a = at(r);
    return { r, err: (r / x.r - 1) * 100, i: a.i, v: a.v ?? x.v, p: a.p, load: part ? (a.p / part.p) * 100 : null };
  };
  const rows = cands.map(prow);
  return {
    id: 'standard',
    title: `${s.eseries} values around R = ${si(x.r, 'Ω', 4)} (${held === 'v' ? 'V' : 'I'} held)`,
    columns: [
      { key: 'r', label: 'R', unit: 'Ω' },
      { key: 'err', label: 'R error', unit: '%' },
      { key: 'i', label: 'I', unit: 'A' },
      { key: 'v', label: 'V', unit: 'V' },
      { key: 'p', label: 'P', unit: 'W' },
      { key: 'load', label: part ? `Load (${part.id})` : 'Load', unit: '%' },
    ],
    rows,
    display: rows.map((r) => ({
      r: si(r.r, 'Ω', 3) + (r.r === near ? ' ·nearest' : ''),
      err: pct(r.err / 100, 2),
      i: fmt('i', r.i, 4),
      v: fmt('v', r.v, 4),
      p: si(r.p, 'W', 4),
      load: r.load == null ? '—' : `${r.load.toFixed(1)} %`,
    })),
    // Rows are candidate parts: judged on the power rating (fail > 100 %, warn > 50 %) — style guide §6.
    rowTones: part ? rows.map((r) => (r.load! > 100 ? 'fail' : r.load! > DERATE * 100 ? 'warn' : 'pass')) : undefined,
    note: `The preferred values just below and above R, and the nearest one, with ${held === 'v' ? `the voltage held at ${fmt('v', x.v, 4)}` : `the current held at ${fmt('i', x.i, 4)}`}. ${part ? `Rows turn yellow above ${DERATE * 100} % of the ${part.id} rating and red above 100 %.` : ''} Tolerance ±${+(tol * 100).toPrecision(3)} % not included.`,
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, k) => a * (b / a) ** (k / (n - 1)));
}

function graphs(x: VIRP, held: 'v' | 'i', part: PartRating | null): GraphSpec[] {
  const out: GraphSpec[] = [];
  // 1 — power vs resistance with the source held: where the rating is crossed
  const rs = logspace(x.r / 100, x.r * 100, 161);
  const pOf = (r: number) => (held === 'v' ? (x.v * x.v) / r : x.i * x.i * r);
  const lim = part ? [{ value: part.p, label: `${part.id.replace(/^w/, '')}${part.id.startsWith('w') ? ' W' : ''} rating`, axis: 'p', color: '#8b1e1e', dash: [6, 4] }, { value: part.p * DERATE, label: '50 %', axis: 'p', color: '#c47b17', dash: [3, 3], width: 1 }] : [];
  if (x.p > 0) {
    out.push({
      id: 'p-vs-r',
      title: 'Power vs resistance',
      subtitle: held === 'v' ? `At V = ${fmt('v', x.v, 4)} (P = V²/R)` : `At I = ${fmt('i', x.i, 4)} (P = I²R)`,
      x: { label: 'Resistance R', unit: 'Ω', log: true },
      y: [{ id: 'p', label: 'Power', unit: 'W', log: true }],
      series: [{ label: 'P', x: rs, y: rs.map(pOf), axis: 'p', width: 2.2 }],
      hlines: lim,
      vlines: [{ value: x.r, label: `R = ${si(x.r, 'Ω', 3)}`, color: '#9a8f7a' }],
      markers: [{ x: x.r, y: x.p, axis: 'p', label: si(x.p, 'W', 3) }],
    });
  }
  // 2 — the I–V line of this resistor and the power parabola, out to twice the operating point
  const vMax = Math.abs(x.v) > 0 ? 2 * Math.abs(x.v) : 1;
  const vs = Array.from({ length: 121 }, (_, k) => (Math.sign(x.v || 1) * vMax * k) / 120);
  out.push({
    id: 'iv',
    title: 'I–V line',
    subtitle: `R = ${si(x.r, 'Ω', 4)}: I = V/R, P = V²/R`,
    x: { label: 'Voltage V', unit: 'V' },
    y: [
      { id: 'i', label: 'Current', unit: 'A', includeZero: true },
      { id: 'p', label: 'Power', unit: 'W', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'I', x: vs, y: vs.map((v) => v / x.r), axis: 'i', width: 2.2 },
      { label: 'P', x: vs, y: vs.map((v) => (v * v) / x.r), axis: 'p', color: '#c47b17', width: 1.6, dash: [5, 3] },
    ],
    hlines: part && part.p < (4 * x.p || Infinity) ? [{ value: part.p, label: 'rating', axis: 'p', color: '#8b1e1e', dash: [6, 4] }] : [],
    markers: [{ x: x.v, y: x.i, axis: 'i', label: fmt('i', x.i, 3) }],
  });
  return out;
}

export const def: CalcDef<OhmState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Ohm’s law V = I·R and Joule heating P = V·I = I²R = V²/R, solved in closed form from any two of V, I, R, P (Horowitz & Hill, Art of Electronics 3e §1.2); rated voltage √(P_r·R) capped by the limiting element voltage per IEC 60115-1; chip ratings from Vishay CRCW e3 (doc. 20035); IEC 60063 E-series.',
  fields,
  defaults,
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = { ...d, ...(raw as object) } as OhmState;
    if (!PAIRS.includes(s.given)) s.given = d.given;
    if (!QS.includes(s.keep)) s.keep = s.given[1] as Q;
    return s;
  },
  compute,
  controls: {
    keep: (raw) => {
      if (!QS.includes(raw as Q)) throw new Error('keep must be v, i, r or p');
      return raw;
    },
  },
  examples: [
    { id: 'default', label: '5 V across 1 kΩ (V and R known)', state: defaults() },
    { id: 'usb-load', label: 'USB 2.0 load test: 5 V at 500 mA (V and I known)', state: { given: 'vi', keep: 'i', v: 5, vUnit: 'V', i: 0.5, iUnit: 'mA', part: 'auto', eseries: 'E24', tol: 5 } },
    { id: 'quarter-watt', label: 'Smallest R a ¼ W part takes across 5 V (V and P known)', state: { given: 'vp', keep: 'p', v: 5, vUnit: 'V', p: 0.25, pUnit: 'W', part: 'w0.25', eseries: 'E24', tol: 5 } },
    { id: 'gpio-330', label: '3.3 V GPIO into 330 Ω, 0402 chip', state: { given: 'vr', keep: 'r', v: 3.3, vUnit: 'V', r: 330, rUnit: 'Ω', part: '0402', eseries: 'E24', tol: 1 } },
    { id: 'shunt', label: '10 A through a 5 mΩ shunt (I and R known)', state: { given: 'ir', keep: 'r', i: 10, iUnit: 'A', r: 5e-3, rUnit: 'mΩ', part: 'auto', eseries: 'E24', tol: 1 } },
    { id: 'mains-lamp', label: '60 W lamp on 230 V mains, hot filament (V and P, over rating)', state: { given: 'vp', keep: 'p', v: 230, vUnit: 'V', p: 60, pUnit: 'W', part: 'auto', eseries: 'E24', tol: 5 } },
  ],
};
