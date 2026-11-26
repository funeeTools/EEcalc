/** Series / parallel resistors — calculator definition (R_eq, per-part V/I/P, tolerance, solve one resistor). DOM-free. */

import { chipFor } from '@/calculators/voltage-divider/model';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { E_SERIES, bracketE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { type Topo, operatingPoints, req, rssSpread, sensitivities, solveOne, worstCase } from './model';

export const ID = 'general/series-parallel-resistor';

export interface Part {
  r: number;
  rUnit: string;
  /** Tolerance, % */
  tol: number;
}

export interface SpState {
  solveFor: 'req' | 'rk';
  /** Index of the resistor solved for (solveFor = 'rk') */
  solveIdx: number;
  topo: Topo;
  req: number;
  reqUnit: string;
  parts: Part[];
  drive: 'v' | 'i';
  v: number;
  i: number;
  iUnit: string;
  eseries: string;
}

export const part = (r: number, tol = 1, rUnit = r >= 1e6 ? 'MΩ' : r >= 1e3 ? 'kΩ' : r >= 1 ? 'Ω' : 'mΩ'): Part => ({ r, rUnit, tol });

export const defaults = (): SpState => ({
  solveFor: 'req',
  solveIdx: 1,
  topo: 'parallel',
  req: 1 / (1 / 10e3 + 1 / 4.7e3),
  reqUnit: 'kΩ',
  parts: [part(10e3), part(4.7e3)],
  drive: 'v',
  v: 5,
  i: 1e-3,
  iUnit: 'mA',
  eseries: 'E24',
});

const R_MIN = 1e-4;
const R_MAX = 1e13;
const U_R: Record<string, number> = { ...withDefault(U_OHM, 'kΩ'), 'GΩ': 1e9, 'TΩ': 1e12 };
const U_I: Record<string, number> = { mA: 1e-3, A: 1, 'µA': 1e-6, nA: 1e-9, pA: 1e-12, kA: 1e3 };
const N_MAX = 8;

const isSolvedPart = (scope: any, root: any) => root.solveFor === 'rk' && root.parts?.indexOf(scope) === root.solveIdx;

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Network',
    note: 'R_eq is computed. Click ◎ on a resistor to find the value that gives a target R_eq.',
    fields: [
      {
        kind: 'select', key: 'topo', label: 'Connection',
        options: [{ value: 'series', label: 'Series (R_eq = ΣR)' }, { value: 'parallel', label: 'Parallel (1/R_eq = Σ1/R)' }],
        // A target R_eq means something else in the other connection: analyse the parts as entered (§5a).
        apply: (_v, _s, root) => (root.solveFor = 'req'),
        help: 'All resistors in one chain (series) or all across the same two nodes (parallel). Solve a mixed network one group at a time.',
      },
      { kind: 'number', key: 'req', symbol: 'R_eq', label: 'Equivalent resistance', units: U_R, unitKey: 'reqUnit', min: 1e-5, max: 1e14, solvable: true, help: 'Computed from the resistors, or the target when you solve for one resistor.' },
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: Object.keys(E_SERIES), help: 'IEC 60063 series for rounding a solved resistor.' },
    ],
  },
  {
    kind: 'section',
    title: 'Resistors',
    fields: [
      {
        kind: 'list',
        key: 'parts',
        addLabel: 'Add resistor',
        minItems: 1,
        maxItems: N_MAX,
        itemTitle: (_p, i) => `R${'₁₂₃₄₅₆₇₈'[i] ?? i + 1}`,
        create: (prev) => (prev ? { ...prev } : part(10e3)),
        variant: 'sub',
        fields: [
          {
            kind: 'number', key: 'r', symbol: 'R', label: 'Resistance', units: U_R, unitKey: 'rUnit', min: R_MIN, max: R_MAX,
            solvable: true, solvedWhen: isSolvedPart,
            onSolve: (s, root) => { root.solveFor = 'rk'; root.solveIdx = root.parts.indexOf(s); },
            onUnsolve: (_s, root) => (root.solveFor = 'req'),
            help: 'Click ◎ to solve this resistor for the target R_eq, the others fixed.',
          },
          { kind: 'number', key: 'tol', symbol: 'tol', label: 'Tolerance', suffix: '%', min: 0, max: 50, help: 'Initial tolerance, for the R_eq spread.' },
        ],
      },
    ],
  },
  {
    kind: 'section',
    title: 'Applied',
    fields: [
      { kind: 'select', key: 'drive', label: 'Network driven by', options: [{ value: 'v', label: 'Voltage across it' }, { value: 'i', label: 'Current through it' }], help: 'What sets the operating point, for the voltage, current and power in each resistor.' },
      { kind: 'number', key: 'v', symbol: 'V', label: 'Applied voltage', unit: 'V', min: -1e6, max: 1e6, visible: (_s, r) => r.drive === 'v' },
      { kind: 'number', key: 'i', symbol: 'I', label: 'Applied current', units: U_I, unitKey: 'iUnit', min: -1e5, max: 1e5, visible: (_s, r) => r.drive === 'i' },
    ],
  },
];

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const pct = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)} %`;
const sub = (i: number) => `R${'₁₂₃₄₅₆₇₈'[i] ?? i + 1}`;

function fail(msg: string, s: SpState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: SpState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: SpState): CalcReport {
  if (st.topo !== 'series' && st.topo !== 'parallel') throw new Error(`Connection must be series or parallel.`);
  if (!E_SERIES[st.eseries]) throw new Error(`Unknown series "${st.eseries}".`);
  if (!Array.isArray(st.parts) || !st.parts.length) throw new Error('Add at least one resistor.');
  if (st.parts.length > N_MAX) throw new Error(`At most ${N_MAX} resistors.`);
  const n = st.parts.length;
  const solving = st.solveFor === 'rk';
  const k = Math.min(Math.max(st.solveIdx | 0, 0), n - 1);
  const tols = st.parts.map((p, i) => {
    const t = finite(`${sub(i)} tolerance`, p.tol) / 100;
    if (t < 0 || t >= 1) throw new Error(`${sub(i)} tolerance must be between 0 and 100 %.`);
    return t;
  });
  const rs = st.parts.map((p, i) => (solving && i === k ? NaN : finite(sub(i), p.r)));
  rs.forEach((r, i) => {
    if (!(solving && i === k) && !(r > 0)) throw new Error(`${sub(i)} must be > 0.`);
  });
  const drive = st.drive === 'i' ? 'i' : 'v';
  const amount = drive === 'v' ? finite('Applied voltage', st.v) : finite('Applied current', st.i);

  // ── solve one resistor for the target (exact closed-form inverse of the forward R_eq)
  // Mode-switch harness: its "error-after-edit" flags are these NO SOLUTION messages after a typed target
  // or resistor (×10, min, max) that no positive R_k can meet; §5a wants typed numbers to report them.
  // Setting switches (connection, list edits) fall back to the R_eq analysis instead.
  let target = NaN;
  if (solving) {
    target = finite('Target R_eq', st.req);
    if (!(target > 0)) throw new Error('Target R_eq must be > 0.');
    const { r, limit } = solveOne(st.topo, rs, k, target);
    if (r == null) {
      return fail(
        st.topo === 'series'
          ? `The other resistors already add up to ${fR(limit)}: a series chain can only be larger. Lower the other resistors or raise the target above ${fR(limit, 3)}.`
          : `The other resistors in parallel already give ${fR(limit)}: adding ${sub(k)} in parallel can only lower R_eq. Raise the other resistors or lower the target below ${fR(limit, 3)}.`,
        st,
      );
    }
    if (r < R_MIN || r > R_MAX) {
      return fail(`${sub(k)} would have to be ${fR(r)}, outside 0.1 mΩ … 10 TΩ: the target is ${st.topo === 'parallel' ? 'too close to the parallel value of the others' : 'too close to the sum of the others'}.`, st);
    }
    rs[k] = r;
  }
  const rEq = req(st.topo, rs);
  const op = operatingPoints(st.topo, rs, drive, amount);
  const wc = worstCase(st.topo, rs, tols);
  const rss = rssSpread(st.topo, rs, tols);
  const sens = sensitivities(st.topo, rs);

  const report: CalcReport = { ...emptyReport(ID), solveFor: st.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  if (solving) {
    results.push(item(`parts.${k}.r`, `${sub(k)} for R_eq = ${fR(target, 4)}`, rs[k], 'Ω', fR(rs[k], 5), { symbol: sub(k), primary: true, solved: true, note: 'exact value' }));
  } else {
    results.push(item('req', 'Equivalent resistance', rEq, 'Ω', fR(rEq, 5), { symbol: 'R_eq', primary: true, solved: true, note: `${n} in ${st.topo}` }));
  }

  // E-series candidates for the solved resistor
  let cand: { r: number; req: number; err: number }[] = [];
  if (solving) {
    const [lo, hi] = bracketE(st.eseries, rs[k]);
    cand = [...new Set([lo, hi])].map((x) => {
      const rr = rs.slice();
      rr[k] = x;
      const q = req(st.topo, rr);
      return { r: x, req: q, err: q / target - 1 };
    });
    const best = cand.slice().sort((a, b) => Math.abs(a.err) - Math.abs(b.err))[0];
    const lim = Math.max(tols[k], 0.005);
    results.push(item('rkStd', `Best ${st.eseries} ${sub(k)}`, best.r, 'Ω', fR(best.r, 3), { primary: true, note: `R_eq ${fR(best.req, 4)} (${pct(best.err)})`, tone: Math.abs(best.err) > lim ? 'warn' : '' }));
    if (Math.abs(best.err) > lim) warnings.push(`The closest ${st.eseries} value for ${sub(k)} gives R_eq ${pct(best.err)} off target. Use a finer series (E96), or add a further small resistor to trim.`);
  }
  results.push(
    drive === 'v'
      ? item('iTotal', 'Total current', op.i, 'A', si(op.i, 'A', 4), { symbol: 'I', primary: true, note: `at ${si(op.v, 'V', 4)}` })
      : item('vTotal', 'Voltage across', op.v, 'V', si(op.v, 'V', 4), { symbol: 'V', primary: true, note: `at ${si(op.i, 'A', 4)}` }),
  );
  results.push(item('reqRange', 'Worst-case R_eq', wc.lo, 'Ω', `${fR(wc.lo, 4)} … ${fR(wc.hi, 4)}`, { primary: true, note: `±${((wc.hi - wc.lo) / 2 / rEq * 100).toFixed(2)} %, all parts at one extreme` }));
  if (solving) results.push(item('reqCheck', 'R_eq with the exact value', rEq, 'Ω', fR(rEq, 5), { group: 'Network', symbol: 'R_eq' }));
  const pTotal = op.v * op.i;
  results.push(
    item('g', 'Total conductance', 1 / rEq, 'S', si(1 / rEq, 'S', 4), { group: 'Network', symbol: 'G_eq' }),
    item('pTotal', 'Total power', pTotal, 'W', si(pTotal, 'W', 4), { group: 'Network', symbol: 'P' }),
    item('reqMin', 'R_eq minimum', wc.lo, 'Ω', fR(wc.lo, 5), { group: 'Tolerance', note: 'all parts at −tol' }),
    item('reqMax', 'R_eq maximum', wc.hi, 'Ω', fR(wc.hi, 5), { group: 'Tolerance', note: 'all parts at +tol' }),
    item('rss', 'Statistical spread (RSS)', rss, '', `±${(rss * 100).toFixed(3)} %`, { group: 'Tolerance', note: 'independent part errors' }),
  );
  // per-resistor operating points
  const chips = op.parts.map((p) => chipFor(p.p, p.v));
  const iMax = op.parts.reduce((m, p, i) => (p.p > op.parts[m].p ? i : m), 0);
  report.results = results;

  report.tables.push({
    id: 'parts',
    title: `Each resistor (${drive === 'v' ? si(op.v, 'V', 4) : si(op.i, 'A', 4)} applied)`,
    columns: [
      { key: 'name', label: '', align: 'left' },
      { key: 'r', label: 'R', unit: 'Ω' },
      { key: 'v', label: 'V', unit: 'V' },
      { key: 'i', label: 'I', unit: 'A' },
      { key: 'p', label: 'P', unit: 'W' },
      { key: 'share', label: 'Share', unit: '%' },
      { key: 'sens', label: 'Sensitivity', unit: '' },
      { key: 'chip', label: 'Smallest chip', align: 'left' },
    ],
    rows: op.parts.map((p, i) => ({ name: sub(i), r: rs[i], v: p.v, i: p.i, p: p.p, share: pTotal !== 0 ? (p.p / pTotal) * 100 : null, sens: sens[i], chip: chips[i] })),
    display: op.parts.map((p, i) => ({
      name: sub(i) + (solving && i === k ? ' (solved)' : ''),
      r: fR(rs[i], 4),
      v: si(p.v, 'V', 4),
      i: si(p.i, 'A', 4),
      p: si(p.p, 'W', 3),
      share: pTotal !== 0 ? `${((p.p / pTotal) * 100).toFixed(1)} %` : '—',
      sens: sens[i].toFixed(3),
      chip: chips[i] ?? 'leaded / power',
    })),
    note: `${st.topo === 'series' ? 'Series: one current, the voltage splits in proportion to R.' : 'Parallel: one voltage, the current splits in proportion to 1/R.'} Sensitivity = ∂ln R_eq/∂ln R (a 1 % change in that resistor moves R_eq by this many %). Smallest chip: Vishay CRCW thick film with 2× power margin and its voltage limit.`,
  });
  if (solving) {
    const lim = Math.max(tols[k], 0.005);
    report.tables.push({
      id: 'standard',
      title: `${st.eseries} values for ${sub(k)} (target R_eq ${fR(target, 4)})`,
      columns: [
        { key: 'r', label: sub(k), unit: 'Ω' },
        { key: 'req', label: 'R_eq', unit: 'Ω' },
        { key: 'err', label: 'Error', unit: '%' },
      ],
      rows: cand.map((c) => ({ r: c.r, req: c.req, err: c.err * 100 })),
      display: cand.map((c) => ({ r: fR(c.r, 3), req: fR(c.req, 5), err: pct(c.err, 3) })),
      rowTones: cand.map((c) => (Math.abs(c.err) > lim ? 'fail' : Math.abs(c.err) > lim / 2 ? 'warn' : 'pass')),
      note: `The preferred values just below and above the exact ${fR(rs[k], 4)}. Rows turn yellow above half of ${+(lim * 100).toPrecision(3)} % (the larger of ${sub(k)}’s tolerance and 0.5 %) and red above it.`,
    });
  }

  // ── warnings & notes
  op.parts.forEach((p, i) => {
    if (!chips[i]) warnings.push(`${sub(i)} dissipates ${si(p.p, 'W', 3)} with ${si(Math.abs(p.v), 'V', 3)} across it: beyond a 2512 chip at 2× margin. Use a leaded power or high-voltage resistor${st.topo === 'series' ? ', or split it into more resistors in series' : ''}.`);
  });
  if (st.topo === 'parallel' && n > 1) {
    const rmin = Math.min(...rs);
    const rmax = Math.max(...rs);
    if (rmax / rmin > 100) notes.push(`${sub(rs.indexOf(rmax))} is over 100× ${sub(rs.indexOf(rmin))}: it changes R_eq by under 1 %, so it mainly trims. Its own tolerance hardly matters.`);
  }
  if (st.topo === 'series' && n > 1) {
    const rmin = Math.min(...rs);
    const rmax = Math.max(...rs);
    if (rmax / rmin > 100) notes.push(`${sub(rs.indexOf(rmin))} is under 1 % of ${sub(rs.indexOf(rmax))}: in series it only trims R_eq.`);
  }
  if (pTotal !== 0 && n > 1) notes.push(`${sub(iMax)} takes the most power (${((op.parts[iMax].p / pTotal) * 100).toFixed(0)} % of the total): ${st.topo === 'series' ? 'the largest resistor in a series chain' : 'the smallest resistor in a parallel group'}.`);
  if (rEq < 0.1) notes.push('Below about 0.1 Ω, traces, solder joints and contacts add milliohms: lay out parallel shunts symmetrically and sense with Kelvin connections.');
  notes.push('Ideal resistors: no TCR, voltage coefficient or leakage. Parts from the same reel or network tend to err together, which is closer to the worst case than to RSS for R_eq.');

  report.summary = `${n} resistor${n > 1 ? 's' : ''} in ${st.topo} → R_eq ${fR(rEq, 4)} · ${drive === 'v' ? `${si(op.v, 'V', 3)} → ${si(op.i, 'A', 3)}` : `${si(op.i, 'A', 3)} → ${si(op.v, 'V', 3)}`} · ${si(pTotal, 'W', 3)}`;
  report.details = { rs, req: rEq, op, wc, rss, sens, cand };
  report.graphs = graphs(st, rs, tols, solving ? k : st.parts.length - 1, solving ? target : null);
  return report;
}

function logspace(a: number, b: number, m: number): number[] {
  return Array.from({ length: m }, (_, j) => a * (b / a) ** (j / (m - 1)));
}

function graphs(st: SpState, rs: number[], tols: number[], k: number, target: number | null): GraphSpec[] {
  const rEq = req(st.topo, rs);
  const xs = logspace(rs[k] / 100, rs[k] * 100, 161);
  if (!xs.includes(rs[k])) xs.push(rs[k]), xs.sort((a, b) => a - b);
  const sweep = (x: number) => {
    const rr = rs.slice();
    rr[k] = x;
    return req(st.topo, rr);
  };
  const others = rs.filter((_, j) => j !== k);
  const lim = others.length ? req(st.topo, others) : null;
  const g1: GraphSpec = {
    id: 'req-vs-rk',
    title: `R_eq vs ${sub(k)}`,
    subtitle: `${sub(k)} swept, the other ${others.length} fixed`,
    x: { label: `${sub(k)}`, unit: 'Ω', log: true },
    // headroom so the asymptote (parallel: the ceiling; series: the floor) is not on the frame edge
    y: [{ id: 'r', label: 'R_eq', unit: 'Ω', log: true, ...(lim != null ? (st.topo === 'parallel' ? { max: lim * 2 } : { min: lim / 2 }) : {}) }],
    series: [{ label: 'R_eq', x: xs, y: xs.map(sweep), axis: 'r', width: 2.2 }],
    hlines: [
      ...(lim != null ? [{ value: lim, label: st.topo === 'series' ? `others Σ ${fR(lim, 3)}` : `others ∥ ${fR(lim, 3)}`, axis: 'r', color: '#9a8f7a', dash: [3, 3] }] : []),
      ...(target != null ? [{ value: target, label: `target ${fR(target, 3)}`, axis: 'r', color: '#2f7d4f', dash: [6, 3] }] : []),
    ],
    // the part value goes on the marker, so the vline needs no label to cross the target line
    vlines: [{ value: rs[k], label: '', color: '#1f4e5f' }],
    markers: [{ x: rs[k], y: rEq, axis: 'r', label: `${sub(k)} ${fR(rs[k], 3)}` }],
  };
  const ts = logspace(1e-4, 0.2, 121);
  const tMax = Math.max(...tols);
  const tAxis = ts;
  const g2: GraphSpec = {
    id: 'req-vs-tol',
    title: 'R_eq vs tolerance',
    subtitle: 'All parts at the same tolerance',
    x: { label: 'Resistor tolerance', unit: '%', log: true },
    y: [{ id: 'r', label: 'R_eq', unit: 'Ω' }],
    series: [
      { label: 'Worst-case max', x: tAxis.map((t) => t * 100), y: tAxis.map((t) => worstCase(st.topo, rs, rs.map(() => t)).hi), axis: 'r', color: '#8b1e1e', width: 1.8 },
      { label: 'RSS max', x: tAxis.map((t) => t * 100), y: tAxis.map((t) => rEq * (1 + rssSpread(st.topo, rs, rs.map(() => t)))), axis: 'r', color: '#c47b17', width: 1.4, dash: [5, 3] },
      { label: 'Nominal', x: [ts[0] * 100, ts[ts.length - 1] * 100], y: [rEq, rEq], axis: 'r', color: '#1f4e5f', width: 1.4, noReadout: true },
      { label: 'RSS min', x: tAxis.map((t) => t * 100), y: tAxis.map((t) => rEq * (1 - rssSpread(st.topo, rs, rs.map(() => t)))), axis: 'r', color: '#c47b17', width: 1.4, dash: [5, 3] },
      { label: 'Worst-case min', x: tAxis.map((t) => t * 100), y: tAxis.map((t) => worstCase(st.topo, rs, rs.map(() => t)).lo), axis: 'r', color: '#8b1e1e', width: 1.8 },
    ],
    vlines: tMax > 0 && tMax < 0.2 ? [{ value: tMax * 100, label: `±${+(tMax * 100).toPrecision(3)} %`, color: '#9a8f7a' }] : [],
  };
  return [g1, g2];
}

/**
 * The solved resistor, by identity. solveIdx is an index: removing or adding a resistor above it would
 * otherwise move the unknown to a different resistor (same approach as the noise-figure cascade).
 */
const solvedPart = new WeakMap<SpState, { part: Part | undefined; index: number }>();

function followSolvedPart(s: SpState): void {
  const prev = solvedPart.get(s);
  if (s.solveFor !== 'rk' || !prev || !prev.part || prev.index !== s.solveIdx) return;
  if (s.parts[s.solveIdx] === prev.part) return;
  const at = s.parts.indexOf(prev.part);
  if (at >= 0) s.solveIdx = at;
  else s.solveFor = 'req'; // the solved resistor was removed: analyse what is left
}

export const def: CalcDef<SpState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Series R_eq = ΣR_i and parallel 1/R_eq = Σ1/R_i (Kirchhoff’s laws; Horowitz & Hill, Art of Electronics 3e §1.2.2), exact closed-form inverse for one resistor; worst case from all parts at one extreme (R_eq is monotonic and homogeneous), RSS from log sensitivities; Ohm’s law per part; IEC 60063 E-series; chip limits from Vishay CRCW e3 (doc. 20035).',
  fields,
  defaults,
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = { ...d, ...(raw as object) } as SpState;
    s.parts = (Array.isArray(s.parts) && s.parts.length ? s.parts.slice(0, N_MAX) : d.parts).map((x) => ({ ...part(10e3), ...x }));
    if (s.solveFor !== 'rk') s.solveFor = 'req';
    s.solveIdx = Math.min(Math.max(s.solveIdx | 0, 0), s.parts.length - 1);
    return s;
  },
  solve: {
    default: 'req',
    analysis: 'req',
    options: [
      { key: 'req', label: 'R_eq from the resistors (analysis)' },
      { key: 'rk', label: 'Resistor `solveIdx` (0-based) for a target R_eq' },
    ],
  },
  compute,
  controls: {
    solveIdx: (raw, s) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n >= s.parts.length) throw new Error(`must be an integer resistor index 0…${s.parts.length - 1}`);
      return n;
    },
  },
  sync: (s) => {
    if (s.solveFor !== 'rk' && s.solveFor !== 'req') s.solveFor = 'req';
    followSolvedPart(s);
    s.solveIdx = Math.min(Math.max(Math.round(Number(s.solveIdx) || 0), 0), s.parts.length - 1);
    solvedPart.set(s, { part: s.parts[s.solveIdx], index: s.solveIdx });
  },
  examples: [
    { id: 'default', label: '10 kΩ ∥ 4.7 kΩ across 5 V', state: defaults() },
    { id: 'trim-parallel', label: 'Make 8 kΩ: 10 kΩ ∥ R₂ (solve R₂, E96)', state: { solveFor: 'rk', solveIdx: 1, topo: 'parallel', req: 8e3, reqUnit: 'kΩ', parts: [part(10e3, 1), part(40e3, 1)], drive: 'v', v: 3.3, eseries: 'E96' } },
    { id: 'series-47', label: 'Make 47 Ω: 33 Ω + R₂ in series (solve R₂, E24)', state: { solveFor: 'rk', solveIdx: 1, topo: 'series', req: 47, reqUnit: 'Ω', parts: [part(33, 5), part(14, 5)], drive: 'i', i: 0.02, iUnit: 'mA', eseries: 'E24' } },
    { id: 'hv-string', label: '1 kV across four 1 MΩ in series (voltage per chip)', state: { solveFor: 'req', topo: 'series', reqUnit: 'MΩ', parts: [part(1e6), part(1e6), part(1e6), part(1e6)], drive: 'v', v: 1000, eseries: 'E24' } },
    { id: 'i2c-pullups', label: 'Two 10 kΩ I²C pull-ups on one line (5 kΩ)', state: { solveFor: 'req', topo: 'parallel', reqUnit: 'kΩ', parts: [part(10e3, 5), part(10e3, 5)], drive: 'v', v: 3.3, eseries: 'E24' } },
    { id: 'shunt-bank', label: 'Four 0.1 Ω shunts in parallel at 5 A', state: { solveFor: 'req', topo: 'parallel', reqUnit: 'mΩ', parts: [part(0.1, 1, 'mΩ'), part(0.1, 1, 'mΩ'), part(0.1, 1, 'mΩ'), part(0.1, 1, 'mΩ')], drive: 'i', i: 5, iUnit: 'A', eseries: 'E24' } },
  ],
};
