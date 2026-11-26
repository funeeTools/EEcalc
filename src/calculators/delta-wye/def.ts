/** Delta–wye conversion — calculator definition (resistors, or R–L–C impedances at one frequency). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec, NumberField } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_IND, U_OHM, withDefault } from '@/core/unitsets';
import { type C, type Delta, type Wye, abs, add, argDeg, mul, branchZ, deltaToWye, pairDelta, pairWye, seriesEquivalent, wyeToDelta } from './model';

export const ID = 'general/delta-wye-conversion';

export type Side = 'delta' | 'wye';
export type Br = 'AB' | 'BC' | 'CA' | 'A' | 'B' | 'C';
export const D_BR: Br[] = ['AB', 'BC', 'CA'];
export const Y_BR: Br[] = ['A', 'B', 'C'];

export interface DyState {
  /** The side you enter; the other is computed */
  given: Side;
  /** r: resistors · z: series R–L–C branches at frequency f */
  kind: 'r' | 'z';
  f: number;
  fUnit: string;
  [key: string]: any;
}

const sideOf = (b: Br): Side => (b.length === 2 ? 'delta' : 'wye');

export const defaults = (): DyState => {
  const s: DyState = { given: 'delta', kind: 'r', f: 1e3, fUnit: 'kHz' };
  const r: Record<Br, number> = { AB: 1e3, BC: 2.2e3, CA: 4.7e3, A: 0, B: 0, C: 0 };
  const sum = r.AB + r.BC + r.CA;
  r.A = (r.AB * r.CA) / sum;
  r.B = (r.AB * r.BC) / sum;
  r.C = (r.BC * r.CA) / sum;
  for (const b of [...D_BR, ...Y_BR]) {
    s[`r${b}`] = r[b];
    s[`r${b}Unit`] = 'Ω';
    s[`l${b}`] = 0;
    s[`l${b}Unit`] = 'mH';
    s[`c${b}`] = null;
    s[`c${b}Unit`] = 'µF';
  }
  for (const b of D_BR) s[`r${b}Unit`] = 'kΩ';
  return s;
};

const R_MAX = 1e13;
// Converted values can be far below a milliohm (a tiny branch against huge ones): prefixes down to fΩ keep them readable.
const U_R: Record<string, number> = { ...withDefault(U_OHM, 'Ω'), 'GΩ': 1e9, 'TΩ': 1e12, 'µΩ': 1e-6, nΩ: 1e-9, pΩ: 1e-12, fΩ: 1e-15 };
const U_L: Record<string, number> = { ...U_IND, H: 1 };
const U_F: Record<string, number> = { ...U_FREQ };
const NAME: Record<Br, string> = { AB: 'Branch A–B', BC: 'Branch B–C', CA: 'Branch C–A', A: 'Arm to A', B: 'Arm to B', C: 'Arm to C' };

/**
 * Convert the entered side and write the result into the other side's R (and L, C) boxes. Returns the
 * branches whose exact equivalent a box cannot hold (written clamped), or null when there is no equivalent.
 */
export function convertInto(s: DyState): Br[] | null {
  const clamped: Br[] = [];
  try {
    const conv = convert(s);
    const w = 2 * Math.PI * s.f;
    for (const b of s.given === 'delta' ? Y_BR : D_BR) {
      const z = conv.out[b];
      // An open delta branch (from a zero star arm) is entered as the largest resistance the box takes.
      if (!Number.isFinite(z.re)) {
        s[`r${b}`] = R_MAX;
        if (s.kind === 'z') (s[`l${b}`] = 0), (s[`c${b}`] = null);
        continue;
      }
      if (s.kind === 'r') {
        if (z.re > R_MAX) clamped.push(b);
        s[`r${b}`] = Math.min(z.re, R_MAX);
        continue;
      }
      const eq = seriesEquivalent(z, w);
      // Values a part box cannot hold (a negative real part from mixed L and C, L above 1 kH, C outside
      // 1 aF … 10 F) are clamped and reported, and takeSide() then refuses the switch.
      if (eq.r < -1e-9 * abs(z) || eq.r > R_MAX || (eq.l != null && eq.l > 1e3) || (eq.c != null && (eq.c < 1e-18 || eq.c > 10))) clamped.push(b);
      s[`r${b}`] = Math.min(Math.max(eq.r, 0), R_MAX);
      s[`l${b}`] = eq.l != null ? Math.min(eq.l, 1e3) : 0;
      s[`c${b}`] = eq.c != null ? Math.min(Math.max(eq.c, 1e-18), 10) : null;
      s[`l${b}Unit`] = readable(U_L, s[`l${b}`], s[`l${b}Unit`]);
      s[`c${b}Unit`] = readable(U_CAP, s[`c${b}`], s[`c${b}Unit`]);
    }
    for (const b of s.given === 'delta' ? Y_BR : D_BR) s[`r${b}Unit`] = readable(U_R, s[`r${b}`], s[`r${b}Unit`]);
    return clamped;
  } catch {
    return null; // no equivalent from the present values: keep the other side as it is
  }
}

/** The unit of `table` that shows `v` as 1 … 999 (the box keeps its unit for 0 or when none fits). */
function readable(table: Record<string, number>, v: number | null, cur: string): string {
  if (v == null || !(Math.abs(v) > 0)) return cur;
  return Object.keys(table).find((u) => Math.abs(v) / table[u] >= 1 && Math.abs(v) / table[u] < 1e3) ?? cur;
}

/** ◎ on a computed box makes its side the entered one (converting first, so the network is unchanged). */
function takeSide(root: DyState, side: Side): void {
  if (root.given === side) return;
  // Only switch when the other side, once filled in, is itself a valid network to convert back (e.g. not
  // a star with two zero arms): otherwise stay on the side that works rather than show an error (§5a).
  // Also stay when a branch would be clamped: the switch must never change the network. Either way a
  // one-shot note says why (shown by the next compute, cleared by sync() after it).
  const trial = structuredClone(root);
  const clamped = convertInto(trial);
  trial.given = side;
  const r = clamped && !clamped.length ? compute(trial) : null;
  const here = root.given === 'delta' ? 'Δ → Y' : 'Y → Δ';
  if (!r || !r.ok) {
    root.switchNote = clamped?.length
      ? `Stayed on ${here}: ${clamped.map((b) => `Z_${b}`).join(', ')} cannot be entered as part values (negative real part, or L or C beyond the box limits), so entering that side would change the network.`
      : `Stayed on ${here}: the other side has no equivalent to convert back${r?.error ? ` (${r.error.replace(/\.$/, '')})` : ''}.`;
    root.switchNoteAge = 0;
    return;
  }
  Object.assign(root, trial);
}

function branchFields(b: Br): NumberField[] {
  const side = sideOf(b);
  const isGiven = (r: any) => r.given === side;
  return [
    {
      kind: 'number', key: `r${b}`, symbol: `R_${b}`, label: NAME[b], units: U_R, unitKey: `r${b}Unit`, min: 0, max: R_MAX, digits: 12,
      visible: (_s, r) => r.kind === 'r' || isGiven(r),
      solvable: true,
      solvedWhen: (_s, r) => !isGiven(r),
      onSolve: (_s, r) => takeSide(r as DyState, side === 'delta' ? 'wye' : 'delta'),
      onUnsolve: (_s, r) => takeSide(r as DyState, side),
      help: side === 'delta' ? `Resistance (or the series resistance) of the delta branch between nodes ${b[0]} and ${b[1]}.` : `Resistance (or the series resistance) of the star arm from node ${b} to the centre.`,
    },
    { kind: 'number', key: `l${b}`, symbol: `L_${b}`, label: 'Series inductance', units: U_L, unitKey: `l${b}Unit`, min: 0, max: 1e3, visible: (_s, r) => r.kind === 'z' && isGiven(r), help: 'Inductance in series with R in this branch (0 for none).' },
    { kind: 'number', key: `c${b}`, symbol: `C_${b}`, label: 'Series capacitance', units: U_CAP, unitKey: `c${b}Unit`, min: 1e-18, max: 10, optional: true, zeroHint: 'none (short)', visible: (_s, r) => r.kind === 'z' && isGiven(r), help: 'Capacitance in series with R and L in this branch. Leave blank for no capacitor (a DC path).' },
  ];
}

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Conversion',
    note: 'Enter one network; the other is its exact equivalent at the three terminals. Click ◎ on a green value to enter that side instead.',
    fields: [
      {
        kind: 'select', key: 'given', label: 'Direction', structural: true,
        options: [{ value: 'delta', label: 'Δ → Y (enter the delta)' }, { value: 'wye', label: 'Y → Δ (enter the star)' }],
        // The network does not change with the direction: convert first so the side you now enter holds the equivalent.
        // The form has already set the new value; sync() keeps the previous one in prevGiven.
        apply: (v: Side, _s, root) => {
          const prev: Side = root.prevGiven === 'delta' || root.prevGiven === 'wye' ? root.prevGiven : v;
          root.given = prev;
          takeSide(root as DyState, v);
        },
      },
      { kind: 'select', key: 'kind', label: 'Branches', structural: true, options: [{ value: 'r', label: 'Resistors' }, { value: 'z', label: 'Impedances: R + L + C at f' }], help: 'Resistors, or each branch a series R–L–C combination evaluated at one frequency (complex impedances).' },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_F, unitKey: 'fUnit', min: 1e-3, max: 1e12, visible: (_s, r) => r.kind === 'z', help: 'The equivalence holds at this frequency only: a delta of R, L and C generally has no star equivalent made of fixed R, L and C.' },
    ],
  },
  { kind: 'section', title: 'Delta (Δ, Π)', visible: (_s, r) => r.kind === 'r' || r.given === 'delta', fields: D_BR.flatMap(branchFields) },
  { kind: 'section', title: 'Wye (Y, T, star)', visible: (_s, r) => r.kind === 'r' || r.given === 'wye', fields: Y_BR.flatMap(branchFields) },
];

/** R + jX with one SI prefix for both parts (from the larger), e.g. "52.94 + j0.7353 Ω", "−11.76 + j47.06 Ω". */
export const fmtZ = (z: C, d = 4): string => {
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) return 'open (∞)';
  const big = Math.max(Math.abs(z.re), Math.abs(z.im));
  if (!(big > 0)) return '0 Ω';
  const tiny = (x: number) => Math.abs(x) < 1e-12 * big;
  const re = tiny(z.re) ? 0 : z.re;
  const im = tiny(z.im) ? 0 : z.im;
  if (im === 0) return si(re, 'Ω', d);
  const PFX: Record<number, string> = { [-15]: 'f', [-12]: 'p', [-9]: 'n', [-6]: 'µ', [-3]: 'm', 0: '', 3: 'k', 6: 'M', 9: 'G', 12: 'T' };
  const e = Math.min(12, Math.max(-15, 3 * Math.floor(Math.log10(big) / 3)));
  const num = (x: number) => String(Number((Math.abs(x) / 10 ** e).toPrecision(d)));
  const reS = re === 0 ? '' : `${re < 0 ? '−' : ''}${num(re)}`;
  const sep = re === 0 ? (im < 0 ? '−' : '') : im < 0 ? ' − ' : ' + ';
  return `${reS}${sep}j${num(im)} ${PFX[e]}Ω`;
};

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

/** The entered branches as impedances, and the converted ones. */
export function convert(s: DyState): { inp: Record<Br, C>; out: Record<Br, C>; sum: C | null; prod: C | null } {
  const w = 2 * Math.PI * s.f;
  const zOf = (b: Br): C => {
    const r = finite(`R_${b}`, s[`r${b}`]);
    if (r < 0) throw new Error(`R_${b} must be ≥ 0.`);
    if (s.kind === 'r') return { re: r, im: 0 };
    const l = finite(`L_${b}`, s[`l${b}`]);
    if (l < 0) throw new Error(`L_${b} must be ≥ 0.`);
    const c = s[`c${b}`] == null ? null : finite(`C_${b}`, s[`c${b}`]);
    if (c != null && !(c > 0)) throw new Error(`C_${b} must be > 0 (leave it blank for none).`);
    return branchZ(r, l, c, w);
  };
  const inp = {} as Record<Br, C>;
  const out = {} as Record<Br, C>;
  if (s.given === 'delta') {
    const d: Delta = { ab: zOf('AB'), bc: zOf('BC'), ca: zOf('CA') };
    Object.assign(inp, { AB: d.ab, BC: d.bc, CA: d.ca });
    const { y, sum } = deltaToWye(d);
    Object.assign(out, { A: y.a, B: y.b, C: y.c });
    // Round-off from a near-open branch (10 TΩ is written for an open one) leaves pΩ-scale residues: snap
    // arms below 1e-12 of the largest branch to 0, so Y(zero arm) → Δ → Y gives the 0 back.
    const big = Math.max(abs(d.ab), abs(d.bc), abs(d.ca));
    for (const b of Y_BR) if (abs(out[b]) < 1e-12 * big) out[b] = { re: 0, im: 0 };
    return { inp, out, sum, prod: null };
  }
  const y: Wye = { a: zOf('A'), b: zOf('B'), c: zOf('C') };
  Object.assign(inp, { A: y.a, B: y.b, C: y.c });
  // One zero arm: that node is the star point. The two delta branches at it equal the other two arms and
  // the branch opposite it is open (Π/0). Two or more zero arms leave the delta undetermined (model throws).
  const arms = [['A', y.a], ['B', y.b], ['C', y.c]] as const;
  const scale = Math.max(abs(y.a), abs(y.b), abs(y.c));
  const zero = arms.filter(([, z]) => abs(z) <= 1e-12 * scale);
  if (zero.length === 1 && scale > 0) {
    const OPEN: C = { re: Infinity, im: 0 };
    const k = zero[0][0];
    if (k === 'A') Object.assign(out, { AB: y.b, BC: OPEN, CA: y.c });
    if (k === 'B') Object.assign(out, { AB: y.a, BC: y.c, CA: OPEN });
    if (k === 'C') Object.assign(out, { AB: OPEN, BC: y.b, CA: y.a });
    return { inp, out, sum: null, prod: add(add(mul(y.a, y.b), mul(y.b, y.c)), mul(y.c, y.a)) };
  }
  if (zero.length >= 2) throw new RangeError(`Arms ${zero.map(([k]) => `Z_${k}`).join(' and ')} are zero: those nodes are joined at the star point, and the delta between them is not unique. Give each arm a non-zero value.`);
  const { d, prod } = wyeToDelta(y);
  Object.assign(out, { AB: d.ab, BC: d.bc, CA: d.ca });
  return { inp, out, sum: null, prod };
}

function fail(msg: string, s: DyState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, status: { text: 'NO SOLUTION', tone: 'fail' }, details: { given: s.given } };
}

export function compute(st: DyState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    if (e instanceof RangeError) return fail(e.message, st);
    return errorReport(ID, e);
  }
}

const near = (a: C, b: C) => abs({ re: a.re - b.re, im: a.im - b.im }) <= 1e-9 * Math.max(abs(a), abs(b), 1e-300);

function run(s: DyState): CalcReport {
  if (s.given !== 'delta' && s.given !== 'wye') throw new Error('Direction must be delta or wye.');
  if (s.kind !== 'r' && s.kind !== 'z') throw new Error('Branches must be r (resistors) or z (impedances).');
  if (s.kind === 'z') {
    finite('Frequency', s.f);
    if (!(s.f > 0)) throw new Error('Frequency must be > 0.');
  }
  const { inp, out, sum, prod } = convert(s);
  const outBr = s.given === 'delta' ? Y_BR : D_BR;
  const inBr = s.given === 'delta' ? D_BR : Y_BR;
  const w = 2 * Math.PI * s.f;
  const isOpen = (b: Br) => !Number.isFinite(out[b].re);
  // Mode-switch harness: "error-after-edit" flags here are typed values (an arm at its min or max, or
  // values 10¹⁰ apart) whose equivalent exceeds 10 TΩ, or two zero arms; §5a wants typed numbers to say so.
  for (const b of outBr) {
    if (!isOpen(b) && !(abs(out[b]) <= R_MAX * (1 + 1e-9))) return fail(`The equivalent ${s.given === 'delta' ? 'arm' : 'branch'} ${b} would be ${fmtZ(out[b], 4)}, beyond the 10 TΩ this page handles: one entered value is tiny compared with the others.`, s);
  }

  const report: CalcReport = { ...emptyReport(ID) };
  const { warnings, notes } = report;
  if (typeof s.switchNote === 'string') notes.push(s.switchNote);
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const sym = (b: Br) => (s.kind === 'r' ? `R_${b}` : `Z_${b}`);
  const results: ResultItem[] = [];
  if (s.kind === 'r') {
    // An open branch has no finite value: null leaves its box showing "—" (never ∞ written into an input).
    for (const b of outBr) results.push(item(`r${b}`, NAME[b], isOpen(b) ? null : out[b].re, 'Ω', isOpen(b) ? 'open (∞)' : si(out[b].re, 'Ω', 6), { symbol: sym(b), primary: true, solved: true, note: isOpen(b) ? 'opposite the zero arm' : undefined }));
  } else {
    for (const b of outBr) {
      results.push(item(`z${b}`, NAME[b], fmtZ(out[b], 4), 'Ω', fmtZ(out[b], 4), { symbol: sym(b), primary: true, tone: 'solved', note: isOpen(b) ? 'opposite the zero arm' : `|Z| ${si(abs(out[b]), 'Ω', 4)} ∠ ${argDeg(out[b]).toFixed(2)}°` }));
    }
    for (const b of outBr) {
      results.push(
        item(`re${b}`, `Re ${sym(b)}`, isOpen(b) ? null : out[b].re, 'Ω', isOpen(b) ? 'open' : si(out[b].re, 'Ω', 5), { group: 'Equivalent (rectangular)', tone: !isOpen(b) && out[b].re < -1e-12 * abs(out[b]) ? 'warn' : '' }),
        item(`im${b}`, `Im ${sym(b)}`, isOpen(b) ? null : out[b].im, 'Ω', isOpen(b) ? 'open' : si(out[b].im, 'Ω', 5), { group: 'Equivalent (rectangular)' }),
      );
    }
  }

  // Balanced check: Z_Y = Z_Δ / 3
  const ins = inBr.map((b) => inp[b]);
  const balanced = near(ins[0], ins[1]) && near(ins[1], ins[2]);
  if (balanced) {
    const zy = s.given === 'delta' ? { re: ins[0].re / 3, im: ins[0].im / 3 } : ins[0];
    const zd = s.given === 'delta' ? ins[0] : { re: ins[0].re * 3, im: ins[0].im * 3 };
    results.push(item('balanced', 'Balanced network', 'yes', '', `Z_Y = Z_Δ/3: ${fmtZ(zy, 4)} = ${fmtZ(zd, 4)} / 3`, { group: 'Check', tone: 'pass' }));
    report.status = { text: 'BALANCED', tone: 'pass' };
  } else {
    results.push(item('balanced', 'Balanced network', 'no', '', 'no (branches differ)', { group: 'Check' }));
  }
  // Terminal-pair impedance with the third terminal open: identical for both networks (that is what equivalence means)
  const d: Delta = s.given === 'delta' ? { ab: inp.AB, bc: inp.BC, ca: inp.CA } : { ab: out.AB, bc: out.BC, ca: out.CA };
  const y: Wye = s.given === 'delta' ? { a: out.A, b: out.B, c: out.C } : { a: inp.A, b: inp.B, c: inp.C };
  const pd = pairDelta(d);
  const py = pairWye(y);
  for (const [k, lbl] of [['ab', 'A–B'], ['bc', 'B–C'], ['ca', 'C–A']] as const) {
    const v = py[k];
    results.push(item(`pair${k.toUpperCase()}`, `Between ${lbl} (third open)`, s.kind === 'r' ? v.re : fmtZ(v, 4), 'Ω', fmtZ(v, 5), { group: 'Check', note: near(pd[k], py[k]) ? 'Δ and Y agree' : 'MISMATCH', tone: near(pd[k], py[k]) ? '' : 'fail' }));
  }
  results.push(
    s.given === 'delta'
      ? item('sumDelta', 'Sum of delta branches', s.kind === 'r' ? sum!.re : fmtZ(sum!, 4), 'Ω', fmtZ(sum!, 4), { symbol: 'ΣΔ', group: 'Intermediate' })
      : item('prodWye', 'Sum of arm products', s.kind === 'r' ? prod!.re : `${prod!.re} + j${prod!.im}`, 'Ω²', s.kind === 'r' ? si(prod!.re, 'Ω²', 4) : `${si(prod!.re, '', 4)} ${prod!.im < 0 ? '−' : '+'} j${si(Math.abs(prod!.im), '', 4)} Ω²`, { symbol: 'Π', group: 'Intermediate' }),
  );
  report.results = results;

  // Complex mode: table of both sides with series equivalents
  if (s.kind === 'z') {
    const rows = [...inBr, ...outBr].map((b) => {
      const z = inBr.includes(b) ? inp[b] : out[b];
      if (!Number.isFinite(z.re)) return { b, side: 'equivalent', re: null, im: null, mag: null, ang: null, eq: null, eqKind: 'open' };
      const eq = seriesEquivalent(z, w);
      return { b, side: inBr.includes(b) ? 'entered' : 'equivalent', re: z.re, im: z.im, mag: abs(z), ang: argDeg(z), eq: eq.l != null ? eq.l : eq.c != null ? eq.c : null, eqKind: eq.l != null ? 'L' : eq.c != null ? 'C' : '—' };
    });
    report.tables.push({
      id: 'impedances',
      title: `Branch impedances at ${si(s.f, 'Hz', 4)}`,
      columns: [
        { key: 'b', label: 'Branch', align: 'left' },
        { key: 'side', label: '', align: 'left' },
        { key: 're', label: 'R', unit: 'Ω' },
        { key: 'im', label: 'X', unit: 'Ω' },
        { key: 'mag', label: '|Z|', unit: 'Ω' },
        { key: 'ang', label: '∠Z', unit: '°' },
        { key: 'eq', label: 'Series L or C', align: 'left' },
      ],
      rows: rows.map((r) => ({ b: sym(r.b), side: r.side, re: r.re, im: r.im, mag: r.mag, ang: r.ang, eq: r.eq })),
      display: rows.map((r) =>
        r.re == null
          ? { b: sym(r.b), side: r.side, re: 'open', im: '—', mag: '∞', ang: '—', eq: 'open circuit' }
          : {
              b: sym(r.b),
              side: r.side,
              re: si(r.re, 'Ω', 4),
              im: si(r.im!, 'Ω', 4),
              mag: si(r.mag!, 'Ω', 4),
              ang: `${r.ang!.toFixed(2)}°`,
              eq: r.eqKind === 'L' ? `L ${si(r.eq!, 'H', 4)}` : r.eqKind === 'C' ? `C ${si(r.eq!, 'F', 4)}` : 'none (X = 0)',
            },
      ),
      note: 'Series equivalent of each branch at this frequency only: R plus an inductance (X > 0) or a capacitance (X < 0). A negative R is a valid equivalent for analysis but cannot be built from passive parts.',
    });
    const neg = outBr.filter((b) => !isOpen(b) && out[b].re < -1e-9 * abs(out[b]));
    if (neg.length) warnings.push(`${neg.map(sym).join(', ')} ${neg.length > 1 ? 'have' : 'has'} a negative real part. The equivalent is exact for analysis at ${si(s.f, 'Hz', 4)}, but cannot be built from passive R, L and C: keep the original network in hardware.`);
    notes.push(`The conversion holds at ${si(s.f, 'Hz', 4)} only. A Δ of mixed R, L and C usually has no star of fixed parts that matches at every frequency; the graphs show how the equivalent moves with frequency.`);
    if (balanced) notes.push('Balanced three-phase loads convert as Z_Y = Z_Δ/3: same power factor angle, one third of the impedance.');
  } else {
    if (inBr.some((b) => inp[b].re === 0)) notes.push(`A zero-ohm delta branch shorts two terminals: the two arms at those nodes become zero.`);
    const vals = outBr.filter((b) => !isOpen(b)).map((b) => out[b].re);
    if (outBr.some(isOpen)) notes.push('A zero star arm puts that terminal at the star point: the delta branch opposite it is open, and the other two equal the remaining arms.');
    const spread = Math.max(...vals) / Math.min(...vals);
    if (Number.isFinite(spread) && spread > 1e3) notes.push('The converted values span more than three decades: one branch dominates, and small errors in the others matter little.');
    if (balanced) notes.push('Balanced: each star arm is one third of a delta branch (R_Y = R_Δ/3), each delta branch three times an arm.');
  }
  notes.push('Equivalent only as seen from the three terminals A, B, C. Currents and powers inside the two networks differ.');

  report.summary = `${s.given === 'delta' ? 'Δ → Y' : 'Y → Δ'}${s.kind === 'z' ? ` at ${si(s.f, 'Hz', 4)}` : ''}: ${outBr.map((b) => `${sym(b)} ${fmtZ(out[b], 4)}`).join(' · ')}`;
  report.details = { inp, out, balanced, pairs: py };
  report.graphs = graphs(s, inBr, outBr);
  return report;
}

function logspace(a: number, b: number, m: number): number[] {
  return Array.from({ length: m }, (_, j) => a * (b / a) ** (j / (m - 1)));
}

const COLORS = ['#1f4e5f', '#c47b17', '#6b5b95'];

/**
 * One trace per converted branch, keeping only finite points. A log axis is used when every kept value is
 * positive; a branch that is zero everywhere (a shorted delta branch zeroes two arms) is then left out.
 */
function traces(xs: number[], pts: (Record<Br, C> | null)[], outBr: Br[], label: (b: Br) => string, val: (z: C) => number, logWanted: boolean): { series: GraphSpec['series']; log: boolean } {
  const per = outBr.map((b, k) => {
    const keep = xs.map((_, j) => pts[j] != null && Number.isFinite(val(pts[j]![b])));
    return { b, k, x: xs.filter((_, j) => keep[j]), y: pts.filter((_, j) => keep[j]).map((p) => val(p![b])) };
  });
  const positive = per.filter((t) => t.y.length && t.y.every((v) => v > 0));
  const log = logWanted && positive.length > 0;
  const use = log ? positive : per.filter((t) => t.y.length);
  return { log, series: use.map((t) => ({ label: label(t.b), x: t.x, y: t.y, axis: 'z', color: COLORS[t.k], width: 2 })) };
}

function graphs(s: DyState, inBr: Br[], outBr: Br[]): GraphSpec[] {
  const sym = (b: Br) => (s.kind === 'r' ? `R_${b}` : `Z_${b}`);
  const conv = (st: DyState) => {
    try {
      return convert(st).out;
    } catch {
      return null;
    }
  };
  if (s.kind === 'r') {
    // Each converted value as the first entered branch is swept (the others fixed)
    const b0 = inBr[0];
    const r0 = s[`r${b0}`] as number;
    const base = r0 > 0 ? r0 : Math.max(...inBr.map((b) => s[`r${b}`] as number), 1);
    const xs = logspace(base / 100, base * 100, 161);
    if (r0 > 0 && !xs.includes(r0)) xs.push(r0), xs.sort((a, b) => a - b);
    const pts = xs.map((x) => conv({ ...s, [`r${b0}`]: x }));
    const t = traces(xs, pts, outBr, sym, (z) => z.re, true);
    const cur = conv(s);
    return [
      {
        id: 'sweep',
        title: `Equivalent vs R_${b0}`,
        subtitle: `R_${b0} swept, the other two fixed`,
        x: { label: `R_${b0}`, unit: 'Ω', log: true },
        y: [{ id: 'z', label: 'Converted resistance', unit: 'Ω', log: t.log }],
        series: t.series,
        vlines: r0 > 0 ? [{ value: r0, label: `R_${b0} = ${si(r0, 'Ω', 3)}`, color: '#9a8f7a' }] : [],
        markers: r0 > 0 && cur ? outBr.filter((b) => Number.isFinite(cur[b].re) && (!t.log || cur[b].re > 0)).map((b) => ({ x: r0, y: cur[b].re, axis: 'z', label: '' })) : [],
      },
    ];
  }
  // Impedances: |Z| and Re Z of the equivalent across frequency
  const fs = logspace(s.f / 100, s.f * 100, 161);
  if (!fs.includes(s.f)) fs.push(s.f), fs.sort((a, b) => a - b);
  const pts = fs.map((f) => conv({ ...s, f }));
  const mag = traces(fs, pts, outBr, (b) => `|${sym(b)}|`, (z) => (Number.isFinite(z.re) ? abs(z) : NaN), true);
  const re = traces(fs, pts, outBr, (b) => `Re ${sym(b)}`, (z) => z.re, false);
  return [
    {
      id: 'mag',
      title: '|Z| of the equivalent vs frequency',
      subtitle: 'Entered parts fixed; the equivalent is recomputed at each frequency',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'z', label: '|Z|', unit: 'Ω', log: mag.log }],
      series: mag.series,
      vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz', 3)}`, color: '#9a8f7a' }],
    },
    {
      id: 'real',
      title: 'Real part vs frequency',
      subtitle: 'Below zero: not buildable from passive parts',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'z', label: 'Re Z', unit: 'Ω' }],
      series: re.series,
      hlines: [{ value: 0, label: '', axis: 'z', color: '#8b1e1e', dash: [4, 4], width: 1 }],
      vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz', 3)}`, color: '#9a8f7a' }],
    },
  ];
}

const exState = (given: Side, kind: 'r' | 'z', vals: Partial<Record<Br, number>>, extra: Record<string, unknown> = {}): Partial<DyState> => {
  const s: Record<string, unknown> = { given, kind, ...extra };
  for (const [b, v] of Object.entries(vals)) s[`r${b}`] = v;
  for (const b of given === 'delta' ? D_BR : Y_BR) {
    if (!(`l${b}` in s)) s[`l${b}`] = 0;
    if (!(`c${b}` in s)) s[`c${b}`] = null;
  }
  return s as Partial<DyState>;
};

const L60 = 9 / (2 * Math.PI * 60); // 9 Ω of reactance at 60 Hz
const L10M = 100 / (2 * Math.PI * 10e6); // 100 Ω at 10 MHz

export const def: CalcDef<DyState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Kennelly’s Δ–Y transformation (Electrical World and Engineer 34, 1899): Z_A = Z_AB·Z_CA/ΣΔ etc. and Z_AB = (Z_AZ_B + Z_BZ_C + Z_CZ_A)/Z_C etc., exact for resistors and for complex R–L–C impedances at one frequency (Alexander & Sadiku, Fundamentals of Electric Circuits 6e §2.7); checked by the terminal-pair impedance with the third terminal open; balanced Z_Y = Z_Δ/3.',
  fields,
  defaults,
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = { ...d, ...(raw as object) } as DyState;
    if (s.given !== 'delta' && s.given !== 'wye') s.given = 'delta';
    if (s.kind !== 'r' && s.kind !== 'z') s.kind = 'r';
    return s;
  },
  compute,
  sync: (s) => {
    s.prevGiven = s.given;
    // switchNote: set by a refused direction switch, shown by one compute (sync runs before and after it)
    if (s.switchNote != null) {
      s.switchNoteAge = (s.switchNoteAge ?? 0) + 1;
      if (s.switchNoteAge > 2) delete s.switchNote, delete s.switchNoteAge;
    }
  },
  examples: [
    { id: 'default', label: 'Δ 1 k / 2.2 k / 4.7 k → Y', state: defaults() },
    { id: 'balanced', label: 'Balanced Δ of 30 Ω → Y of 10 Ω', state: exState('delta', 'r', { AB: 30, BC: 30, CA: 30 }, { rABUnit: 'Ω', rBCUnit: 'Ω', rCAUnit: 'Ω', rAUnit: 'Ω', rBUnit: 'Ω', rCUnit: 'Ω' }) },
    { id: 'y-to-delta', label: 'Star 10 / 20 / 30 Ω → Δ', state: exState('wye', 'r', { A: 10, B: 20, C: 30 }, { rABUnit: 'Ω', rBCUnit: 'Ω', rCAUnit: 'Ω', rAUnit: 'Ω', rBUnit: 'Ω', rCUnit: 'Ω' }) },
    {
      id: 'three-phase',
      label: 'Balanced 3-phase Δ load 12 + j9 Ω at 60 Hz → Y',
      state: exState('delta', 'z', { AB: 12, BC: 12, CA: 12 }, { f: 60, fUnit: 'Hz', lAB: L60, lBC: L60, lCA: L60, lABUnit: 'mH', lBCUnit: 'mH', lCAUnit: 'mH', rABUnit: 'Ω', rBCUnit: 'Ω', rCAUnit: 'Ω' }),
    },
    {
      id: 'rf-negative',
      label: 'Δ of j100, j100 and 50 Ω at 10 MHz (negative-R star)',
      state: exState('delta', 'z', { AB: 0, BC: 50, CA: 0 }, { f: 10e6, fUnit: 'MHz', lAB: L10M, lBC: 0, lCA: L10M, lABUnit: 'µH', lBCUnit: 'µH', lCAUnit: 'µH', rABUnit: 'Ω', rBCUnit: 'Ω', rCAUnit: 'Ω' }),
    },
  ],
};
