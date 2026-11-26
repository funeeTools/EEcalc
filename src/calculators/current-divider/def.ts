/** Current divider — calculator definition (N parallel branches, current or voltage drive, solve a branch R). DOM-free. */

import { chipFor } from '@/calculators/voltage-divider/model';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { E_SERIES, bracketE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { type Drive, divide, rForCurrent, rForShare } from './model';

export const ID = 'general/current-divider';

export interface Branch {
  r: number;
  rUnit: string;
}

/** out: analyse the branches · rkShare: R of branch k for a target share · rkCurrent: R of branch k for a target current */
export type CdSolve = 'out' | 'rkShare' | 'rkCurrent';

export interface CdState {
  solveFor: CdSolve;
  /** The branch watched (out) or solved (rk…) */
  solveIdx: number;
  drive: Drive;
  i: number;
  iUnit: string;
  v: number;
  rs: number;
  rsUnit: string;
  branches: Branch[];
  /** Share of branch k, % */
  share: number;
  /** Current in branch k, A */
  ik: number;
  ikUnit: string;
  eseries: string;
}

export const branch = (r: number, rUnit = r >= 1e6 ? 'MΩ' : r >= 1e3 ? 'kΩ' : r >= 1 ? 'Ω' : 'mΩ'): Branch => ({ r, rUnit });

const DEF_R = [1e3, 2.2e3, 4.7e3];
const defShare = (1 / DEF_R[0] / DEF_R.reduce((a, r) => a + 1 / r, 0)) * 100;

export const defaults = (): CdState => ({
  solveFor: 'out',
  solveIdx: 0,
  drive: 'i',
  i: 10e-3,
  iUnit: 'mA',
  v: 12,
  rs: 0,
  rsUnit: 'Ω',
  branches: DEF_R.map((r) => branch(r)),
  share: defShare,
  ik: 10e-3 * defShare / 100,
  ikUnit: 'mA',
  eseries: 'E24',
});

const R_MIN = 1e-4;
const R_MAX = 1e13;
const N_MAX = 8;
const U_R: Record<string, number> = { ...withDefault(U_OHM, 'kΩ'), 'GΩ': 1e9, 'TΩ': 1e12 };
const U_I: Record<string, number> = { mA: 1e-3, A: 1, 'µA': 1e-6, nA: 1e-9, pA: 1e-12, fA: 1e-15, kA: 1e3 };
const sub = (i: number) => `R${'₁₂₃₄₅₆₇₈'[i] ?? i + 1}`;
const bname = (i: number) => `Branch ${i + 1}`;

/**
 * The solve mode that makes sense for this list, preferring `want`. A single branch always carries the
 * whole current: its share cannot be a target, and with a current source neither can its current.
 */
function solvableMode(s: CdState, want: 'rkShare' | 'rkCurrent'): 'rkShare' | 'rkCurrent' | null {
  if ((s.branches?.length ?? 0) >= 2) return want;
  return s.drive === 'v' ? 'rkCurrent' : null;
}

function seedTargets(s: CdState, j: number): void {
  const rs = s.branches.map((x) => x.r);
  if (!rs.every((r) => r > 0 && Number.isFinite(r))) return;
  const op = divide(rs, s.drive, s.drive === 'i' ? s.i : s.v, s.drive === 'v' ? s.rs : 0);
  if (Number.isFinite(op.share[j]) && Number.isFinite(op.i[j])) {
    s.share = op.share[j] * 100;
    s.ik = op.i[j];
  }
}

const isSolvedBranch = (scope: any, root: any) => (root.solveFor === 'rkShare' || root.solveFor === 'rkCurrent') && root.branches?.indexOf(scope) === root.solveIdx;

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Source',
    fields: [
      {
        kind: 'select', key: 'drive', label: 'Fed by',
        options: [{ value: 'i', label: 'Current source' }, { value: 'v', label: 'Voltage source + R_s' }],
        // A target current means something else with the other source: analyse the branches as entered (§5a).
        apply: (_v, _s, root) => { if (root.solveFor === 'rkCurrent') root.solveFor = 'out'; },
        help: 'An ideal current source sets the total current. A voltage source with source resistance R_s gives a total current that depends on the branches.',
      },
      { kind: 'number', key: 'i', symbol: 'I', label: 'Source current', units: U_I, unitKey: 'iUnit', min: -1e5, max: 1e5, visible: (_s, r) => r.drive === 'i' },
      { kind: 'number', key: 'v', symbol: 'V', label: 'Source voltage', unit: 'V', min: -1e6, max: 1e6, visible: (_s, r) => r.drive === 'v' },
      { kind: 'number', key: 'rs', symbol: 'R_s', label: 'Source resistance', units: withDefault(U_OHM, 'Ω'), unitKey: 'rsUnit', min: 0, max: 1e12, visible: (_s, r) => r.drive === 'v', help: 'Output resistance of the source plus wiring. 0 = ideal voltage source: every branch then simply draws V/R.' },
    ],
  },
  {
    kind: 'section',
    title: 'Branches (in parallel)',
    note: 'Click ◎ on a branch to solve its R for the share or current below.',
    fields: [
      {
        kind: 'list',
        key: 'branches',
        addLabel: 'Add branch',
        minItems: 1,
        maxItems: N_MAX,
        itemTitle: (_b, i) => bname(i),
        create: (prev) => (prev ? { ...prev } : branch(1e3)),
        variant: 'sub',
        fields: [
          {
            kind: 'number', key: 'r', symbol: 'R', label: 'Resistance', units: U_R, unitKey: 'rUnit', min: R_MIN, max: R_MAX,
            solvable: true, solvedWhen: isSolvedBranch,
            onSolve: (b, root) => {
              const mode = solvableMode(root as CdState, root.solveFor === 'rkCurrent' ? 'rkCurrent' : 'rkShare');
              if (!mode) return; // a lone branch on a current source carries all of it: nothing to solve
              const j = root.branches.indexOf(b);
              // Targets do not carry over (§5a): the share/current boxes held another branch's values, so
              // start from this branch's present share and current (the solve then returns its present R).
              if (j !== root.solveIdx || root.solveFor === 'out') seedTargets(root as CdState, j);
              root.solveFor = mode;
              root.solveIdx = j;
            },
            onUnsolve: (_b, root) => (root.solveFor = 'out'),
            help: 'Click ◎ to solve this branch for the target share or current, the other branches fixed.',
          },
        ],
      },
    ],
  },
  {
    kind: 'section',
    title: 'Branch of interest',
    note: 'The watched (or solved) branch: the last one whose ◎ you clicked.',
    fields: [
      {
        kind: 'number', key: 'share', symbol: 'I_k/I', label: 'Share of the current', suffix: '%', min: 0, max: 100,
        solvable: true, solvedWhen: (_s, r) => r.solveFor !== 'rkShare',
        onSolve: (_s, r) => (r.solveFor = 'out'),
        onUnsolve: (_s, r) => { if (solvableMode(r as CdState, 'rkShare') === 'rkShare') r.solveFor = 'rkShare'; },
        help: 'Fraction of the total current in the watched branch, G_k/ΣG. Click ◎ on it to make it the target for that branch’s R.',
      },
      {
        kind: 'number', key: 'ik', symbol: 'I_k', label: 'Branch current', units: U_I, unitKey: 'ikUnit', min: -1e5, max: 1e5,
        solvable: true, solvedWhen: (_s, r) => r.solveFor !== 'rkCurrent',
        onSolve: (_s, r) => (r.solveFor = 'out'),
        onUnsolve: (_s, r) => { if (solvableMode(r as CdState, 'rkCurrent') === 'rkCurrent') r.solveFor = 'rkCurrent'; },
        help: 'Current in the watched branch. Click ◎ on it to make it the target for that branch’s R.',
      },
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: Object.keys(E_SERIES), help: 'IEC 60063 series for rounding a solved branch resistor.' },
    ],
  },
];

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fI = (i: number, d = 4) => si(i, 'A', d);
const pct = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)} %`;

function fail(msg: string, s: CdState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: CdState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: CdState): CalcReport {
  if (!['out', 'rkShare', 'rkCurrent'].includes(st.solveFor)) throw new Error(`Unknown solve-for "${String(st.solveFor)}".`);
  if (st.drive !== 'i' && st.drive !== 'v') throw new Error('Source must be a current (i) or voltage (v) source.');
  if (!E_SERIES[st.eseries]) throw new Error(`Unknown series "${st.eseries}".`);
  if (!Array.isArray(st.branches) || !st.branches.length) throw new Error('Add at least one branch.');
  if (st.branches.length > N_MAX) throw new Error(`At most ${N_MAX} branches.`);
  const n = st.branches.length;
  const k = Math.min(Math.max(st.solveIdx | 0, 0), n - 1);
  const solving = st.solveFor !== 'out';
  const rs = st.branches.map((b, j) => (solving && j === k ? NaN : finite(sub(j), b.r)));
  rs.forEach((r, j) => {
    if (!(solving && j === k) && !(r > 0)) throw new Error(`${sub(j)} must be > 0.`);
  });
  const amount = st.drive === 'i' ? finite('Source current', st.i) : finite('Source voltage', st.v);
  const rsrc = st.drive === 'v' ? finite('Source resistance', st.rs) : 0;
  if (rsrc < 0) throw new Error('Source resistance must be ≥ 0.');
  const s: CdState = { ...st };

  // ── solve branch k (exact closed forms)
  // Mode-switch harness: "error-after-edit" flags are these NO SOLUTION messages after a typed source,
  // target or R_s (×10, min, max) that no positive R_k can meet; §5a wants typed numbers to report them.
  if (st.solveFor === 'rkShare') {
    const sh = finite('Target share', st.share) / 100;
    if (n < 2) return fail('With a single branch it carries all the current. Add a second branch to divide it.', s);
    if (!(sh > 0 && sh < 1)) return fail('A branch can take any share between 0 and 100 % (exclusive). Enter a share inside that range.', s);
    const r = rForShare(rs, k, sh)!;
    if (r < R_MIN || r > R_MAX) return fail(`${sub(k)} would have to be ${fR(r)}, outside 0.1 mΩ … 10 TΩ. Move the share away from ${sh < 0.5 ? '0' : '100'} % or change the other branches.`, s);
    rs[k] = r;
  } else if (st.solveFor === 'rkCurrent') {
    const ik = finite('Target branch current', st.ik);
    if (amount === 0) return fail(`With ${st.drive === 'i' ? 'I' : 'V'} = 0 no branch carries current. Enter a non-zero source.`, s);
    if (ik === 0) return fail('A branch current of 0 needs an open branch (R → ∞). Enter a non-zero target.', s);
    const r = rForCurrent(rs, k, ik, st.drive, amount, rsrc);
    if (r == null) {
      if (st.drive === 'i') {
        return fail(
          n < 2
            ? 'With a single branch it carries the whole source current. Add a branch, or set I_k equal to I.'
            : `A branch can only take part of the source current: I_k must lie between 0 and ${fI(amount)} (same sign).`,
          s,
        );
      }
      const iMax = rsrc > 0 ? amount / rsrc : Infinity;
      return fail(`A branch fed through R_s = ${fR(rsrc, 3)} from ${si(amount, 'V', 4)} can carry at most ${Number.isFinite(iMax) ? fI(iMax) : 'any'} (R_k → 0), and the same sign as V. Lower the target or R_s.`, s);
    }
    if (r < R_MIN || r > R_MAX) return fail(`${sub(k)} would have to be ${fR(r)}, outside 0.1 mΩ … 10 TΩ. Move the target current or change the other branches.`, s);
    rs[k] = r;
  }
  const op = divide(rs, st.drive, amount, rsrc);
  // The branch-current box accepts ±100 kA: a near-short branch on a stiff voltage source can exceed it.
  if (st.solveFor !== 'rkCurrent' && !(Math.abs(op.i[k]) <= 1e5)) return fail(`Branch ${k + 1} would carry ${fI(op.i[k])}, beyond the 100 kA this page handles. Raise its resistance or R_s.`, s);
  s.share = op.share[k] * 100;
  s.ik = op.i[k];

  const report: CalcReport = { ...emptyReport(ID), solveFor: st.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  if (solving) {
    results.push(item(`branches.${k}.r`, `${sub(k)} (branch ${k + 1})`, rs[k], 'Ω', fR(rs[k], 5), { symbol: sub(k), primary: true, solved: true, note: st.solveFor === 'rkShare' ? `for ${+(op.share[k] * 100).toPrecision(5)} % of the current` : `for I_k = ${fI(op.i[k])}` }));
  }
  results.push(
    item('share', `Share in branch ${k + 1}`, s.share, '%', `${s.share.toPrecision(5)} %`, { symbol: 'I_k/I', primary: true, solved: st.solveFor !== 'rkShare', note: `G_${k + 1}/ΣG` }),
    item('ik', `Current in branch ${k + 1}`, s.ik, 'A', fI(s.ik, 5), { symbol: 'I_k', primary: true, solved: st.solveFor !== 'rkCurrent' }),
  );
  results.push(item('vNode', 'Voltage across branches', op.vNode, 'V', si(op.vNode, 'V', 4), { symbol: 'V', primary: !solving, group: solving ? 'Divider' : undefined, note: `I_total ${fI(op.iTotal, 4)} into ${fR(op.rp, 4)}` }));
  results.push(
    item('iTotal', 'Total branch current', op.iTotal, 'A', fI(op.iTotal), { symbol: 'I_total', group: 'Divider' }),
    item('rp', 'Branches in parallel', op.rp, 'Ω', fR(op.rp), { symbol: 'R_p', group: 'Divider', note: '1/ΣG' }),
    item('pTotal', 'Power in the branches', op.p.reduce((a, x) => a + x, 0), 'W', si(op.p.reduce((a, x) => a + x, 0), 'W', 4), { symbol: 'P', group: 'Divider' }),
  );
  if (st.drive === 'v') {
    results.push(
      item('vRs', 'Drop across R_s', op.iTotal * rsrc, 'V', si(op.iTotal * rsrc, 'V', 4), { group: 'Source' }),
      item('pRs', 'Power in R_s', op.pRs, 'W', si(op.pRs, 'W', 4), { group: 'Source' }),
    );
  } else {
    results.push(item('compliance', 'Source compliance needed', op.vNode, 'V', si(Math.abs(op.vNode), 'V', 4), { group: 'Source', note: 'voltage the current source must reach' }));
  }

  // E-series for a solved branch
  if (solving) {
    const [lo, hi] = bracketE(st.eseries, rs[k]);
    const tgt = st.solveFor === 'rkShare' ? op.share[k] : op.i[k];
    const cand = [...new Set([lo, hi])].map((x) => {
      const rr = rs.slice();
      rr[k] = x;
      const o = divide(rr, st.drive, amount, rsrc);
      const got = st.solveFor === 'rkShare' ? o.share[k] : o.i[k];
      return { r: x, got, err: got / tgt - 1 };
    });
    const best = cand.slice().sort((a, b) => Math.abs(a.err) - Math.abs(b.err))[0];
    results.push(item('rkStd', `Best ${st.eseries} ${sub(k)}`, best.r, 'Ω', fR(best.r, 3), { primary: true, note: st.solveFor === 'rkShare' ? `${(best.got * 100).toPrecision(4)} % (${pct(best.err)})` : `${fI(best.got)} (${pct(best.err)})`, tone: Math.abs(best.err) > 0.01 ? 'warn' : '' }));
    report.tables.push({
      id: 'standard',
      title: `${st.eseries} values for ${sub(k)}`,
      columns: [
        { key: 'r', label: sub(k), unit: 'Ω' },
        { key: 'got', label: st.solveFor === 'rkShare' ? 'Share' : 'I_k', unit: st.solveFor === 'rkShare' ? '%' : 'A' },
        { key: 'err', label: 'Error', unit: '%' },
      ],
      rows: cand.map((c) => ({ r: c.r, got: st.solveFor === 'rkShare' ? c.got * 100 : c.got, err: c.err * 100 })),
      display: cand.map((c) => ({ r: fR(c.r, 3), got: st.solveFor === 'rkShare' ? `${(c.got * 100).toPrecision(5)} %` : fI(c.got, 5), err: pct(c.err, 3) })),
      rowTones: cand.map((c) => (Math.abs(c.err) > 0.01 ? 'fail' : Math.abs(c.err) > 0.005 ? 'warn' : 'pass')),
      note: `The preferred values just below and above the exact ${fR(rs[k], 4)}, with the ${st.solveFor === 'rkShare' ? 'share' : 'branch current'} each gives. Rows turn yellow above 0.5 % error and red above 1 %.`,
    });
    if (Math.abs(best.err) > 0.01) warnings.push(`The closest ${st.eseries} value for ${sub(k)} misses the target by ${pct(best.err)}. Use a finer series (E96) or trim with a second resistor in series with it.`);
  }

  const chips = rs.map((_r, j) => chipFor(op.p[j], op.vNode));
  report.tables.unshift({
    id: 'branches',
    title: `Branches (${st.drive === 'i' ? `${fI(amount, 4)} source` : `${si(amount, 'V', 4)} through ${fR(rsrc, 3)}`})`,
    columns: [
      { key: 'name', label: '', align: 'left' },
      { key: 'r', label: 'R', unit: 'Ω' },
      { key: 'i', label: 'I', unit: 'A' },
      { key: 'share', label: 'Share', unit: '%' },
      { key: 'p', label: 'P', unit: 'W' },
      { key: 'chip', label: 'Smallest chip', align: 'left' },
    ],
    rows: rs.map((r, j) => ({ name: bname(j), r, i: op.i[j], share: op.share[j] * 100, p: op.p[j], chip: chips[j] })),
    display: rs.map((r, j) => ({ name: bname(j) + (solving && j === k ? ' (solved)' : j === k ? ' (watched)' : ''), r: fR(r, 4), i: fI(op.i[j]), share: `${(op.share[j] * 100).toPrecision(4)} %`, p: si(op.p[j], 'W', 3), chip: chips[j] ?? 'leaded / power' })),
    note: 'Each branch takes current in proportion to its conductance 1/R: the smallest resistor takes the largest share. Smallest chip: Vishay CRCW thick film with 2× power margin and its voltage limit.',
  });

  // ── warnings & notes
  rs.forEach((_r, j) => {
    if (!chips[j]) warnings.push(`${bname(j)} dissipates ${si(op.p[j], 'W', 3)} at ${si(Math.abs(op.vNode), 'V', 3)}: beyond a 2512 chip at 2× margin. Use a leaded power or high-voltage resistor.`);
  });
  if (st.drive === 'i' && Math.abs(op.vNode) > 50) warnings.push(`The current source must drive ${si(Math.abs(op.vNode), 'V', 3)} across the branches. Check its compliance voltage; few bench or IC current sources reach this. Lower the branch resistances or the current.`);
  if (n === 1 && st.drive === 'i') notes.push('A single branch on a current source carries all of it, so its ◎ does nothing: add a branch to solve for a resistance.');
  if (st.drive === 'v' && rsrc === 0 && n > 1) notes.push('With an ideal voltage source (R_s = 0) the branches do not interact: each draws V/R regardless of the others. The shares still follow 1/R.');
  if (st.drive === 'v' && rsrc > 0 && op.iTotal * rsrc > 0.1 * Math.abs(amount)) notes.push(`R_s drops ${((op.iTotal * rsrc) / Math.abs(amount) * 100).toFixed(0)} % of the source voltage: adding or changing a branch also changes the current in every other branch.`);
  notes.push('Resistive branches at DC (or one frequency with equal phase). Wiring and contact resistance in each branch add to its R and matter for low-ohm shunts.');

  report.results = results;
  report.summary = `${n} branches · ${st.drive === 'i' ? `${fI(amount, 3)} in` : `${si(amount, 'V', 3)} via ${fR(rsrc, 3)}`} · branch ${k + 1}: ${fI(op.i[k], 3)} (${(op.share[k] * 100).toPrecision(3)} %)`;
  report.details = { rs, k, ...op };
  report.graphs = graphs(st, rs, k, amount, rsrc, solving ? (st.solveFor === 'rkShare' ? { share: op.share[k] } : { ik: op.i[k] }) : null);
  return report;
}

function logspace(a: number, b: number, m: number): number[] {
  return Array.from({ length: m }, (_, j) => a * (b / a) ** (j / (m - 1)));
}

// no target green (#2f7d4f) or limit red (#8b1e1e) among the branch colours
const OTHER = ['#1f4e5f', '#6b5b95', '#4f8a8b', '#9a8f7a', '#386a77'];

function graphs(st: CdState, rs: number[], k: number, amount: number, rsrc: number, target: { share?: number; ik?: number } | null): GraphSpec[] {
  const xs = logspace(rs[k] / 100, rs[k] * 100, 161);
  if (!xs.includes(rs[k])) xs.push(rs[k]), xs.sort((a, b) => a - b);
  const ops = xs.map((x) => {
    const rr = rs.slice();
    rr[k] = x;
    return divide(rr, st.drive, amount, rsrc);
  });
  const op = divide(rs, st.drive, amount, rsrc);
  const g1: GraphSpec = {
    id: 'currents',
    title: `Branch currents vs ${sub(k)}`,
    subtitle: `${sub(k)} swept, the other branches fixed`,
    x: { label: sub(k), unit: 'Ω', log: true },
    y: [{ id: 'i', label: 'Current', unit: 'A', includeZero: true }],
    // the swept branch in amber, the others in hues that stay apart in both themes
    series: rs.map((_r, j) => ({ label: `I${j + 1}`, x: xs, y: ops.map((o) => o.i[j]), axis: 'i', width: j === k ? 2.4 : 1.4, color: j === k ? '#c47b17' : OTHER[(j - (j > k ? 1 : 0)) % OTHER.length] })),
    hlines: target?.ik != null ? [{ value: target.ik, label: `target ${fI(target.ik, 3)}`, axis: 'i', color: '#2f7d4f', dash: [6, 3] }] : [],
    vlines: [{ value: rs[k], label: `${sub(k)} = ${fR(rs[k], 3)}`, color: '#9a8f7a' }],
    markers: [{ x: rs[k], y: op.i[k], axis: 'i', label: fI(op.i[k], 3) }],
  };
  const g2: GraphSpec = {
    id: 'share',
    title: `Share of branch ${k + 1}`,
    subtitle: 'I_k / I_total = G_k / ΣG',
    x: { label: sub(k), unit: 'Ω', log: true },
    y: [{ id: 's', label: 'Share', unit: '%', min: 0, max: 100 }],
    series: [{ label: `Branch ${k + 1}`, x: xs, y: ops.map((o) => o.share[k] * 100), axis: 's', width: 2.2 }],
    hlines: target?.share != null ? [{ value: target.share * 100, label: `target ${(target.share * 100).toPrecision(3)} %`, axis: 's', color: '#2f7d4f', dash: [6, 3] }] : [],
    vlines: [{ value: rs[k], label: `${sub(k)} = ${fR(rs[k], 3)}`, color: '#9a8f7a' }],
    markers: [{ x: rs[k], y: op.share[k] * 100, axis: 's', label: `${(op.share[k] * 100).toPrecision(3)} %` }],
  };
  return [g1, g2];
}

/** The solved/watched branch, by identity (same approach as the noise-figure cascade). */
const watched = new WeakMap<CdState, { b: Branch | undefined; index: number }>();

function followWatched(s: CdState): void {
  const prev = watched.get(s);
  if (!prev || !prev.b || prev.index !== s.solveIdx) return;
  if (s.branches[s.solveIdx] === prev.b) return;
  const at = s.branches.indexOf(prev.b);
  if (at >= 0) s.solveIdx = at;
  else if (s.solveFor !== 'out') s.solveFor = 'out'; // the solved branch was removed: analyse what is left
}

export const def: CalcDef<CdState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Current division I_k = I·G_k/ΣG over N parallel branches, fed by an ideal current source or by a voltage source through R_s (V_node = V/(1 + R_s·ΣG)); exact closed-form branch resistance for a target share or current (Alexander & Sadiku, Fundamentals of Electric Circuits 6e §2.6, §2.9; Horowitz & Hill 3e §1.2.2); IEC 60063 E-series; chip limits from Vishay CRCW e3 (doc. 20035).',
  fields,
  defaults,
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = { ...d, ...(raw as object) } as CdState;
    s.branches = (Array.isArray(s.branches) && s.branches.length ? s.branches.slice(0, N_MAX) : d.branches).map((x) => ({ ...branch(1e3), ...x }));
    if (!['out', 'rkShare', 'rkCurrent'].includes(s.solveFor)) s.solveFor = 'out';
    s.solveIdx = Math.min(Math.max(s.solveIdx | 0, 0), s.branches.length - 1);
    return s;
  },
  solve: {
    default: 'out',
    analysis: 'out',
    options: [
      { key: 'out', label: 'Branch currents and shares (analysis)' },
      { key: 'rkShare', label: 'R of branch `solveIdx` (0-based) for a target share' },
      { key: 'rkCurrent', label: 'R of branch `solveIdx` (0-based) for a target current I_k' },
    ],
  },
  compute,
  controls: {
    solveIdx: (raw, s) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n >= s.branches.length) throw new Error(`must be an integer branch index 0…${s.branches.length - 1}`);
      return n;
    },
  },
  sync: (s) => {
    if (!['out', 'rkShare', 'rkCurrent'].includes(s.solveFor)) s.solveFor = 'out';
    followWatched(s);
    if (s.solveFor !== 'out' && solvableMode(s, s.solveFor) !== s.solveFor) s.solveFor = 'out';
    s.solveIdx = Math.min(Math.max(Math.round(Number(s.solveIdx) || 0), 0), s.branches.length - 1);
    watched.set(s, { b: s.branches[s.solveIdx], index: s.solveIdx });
  },
  examples: [
    { id: 'default', label: '10 mA into 1 k ∥ 2.2 k ∥ 4.7 k', state: defaults() },
    {
      id: 'ammeter-shunt',
      label: 'Ammeter shunt: 1 mA / 1 kΩ meter on a 1 A range (solve shunt)',
      state: { solveFor: 'rkCurrent', solveIdx: 1, drive: 'i', i: 1, iUnit: 'A', branches: [branch(1e3), branch(1)], ik: 0.999, ikUnit: 'mA', share: 99.9, eseries: 'E96' },
    },
    {
      id: 'steer-25',
      label: 'Steer 25 % of 20 mA into branch 2 (solve R₂)',
      state: { solveFor: 'rkShare', solveIdx: 1, drive: 'i', i: 20e-3, iUnit: 'mA', branches: [branch(1e3), branch(3e3), branch(3.3e3)], share: 25, ik: 5e-3, ikUnit: 'mA', eseries: 'E24' },
    },
    {
      id: 'source-loading',
      label: '5 V through 10 Ω into 47 Ω ∥ 100 Ω (source loading)',
      state: { solveFor: 'out', solveIdx: 0, drive: 'v', v: 5, rs: 10, rsUnit: 'Ω', branches: [branch(47), branch(100)], share: 50, ik: 0.05, ikUnit: 'mA', eseries: 'E24' },
    },
    {
      id: 'set-20ma',
      label: 'Set 20 mA in branch 1 from 5 V through 10 Ω (solve R₁)',
      state: { solveFor: 'rkCurrent', solveIdx: 0, drive: 'v', v: 5, rs: 10, rsUnit: 'Ω', branches: [branch(220), branch(470)], ik: 0.02, ikUnit: 'mA', share: 50, eseries: 'E24' },
    },
    { id: 'compliance', label: '1 A into 1 kΩ ∥ 2 kΩ (compliance and power warnings)', state: { solveFor: 'out', solveIdx: 0, drive: 'i', i: 1, iUnit: 'A', branches: [branch(1e3), branch(2e3)], share: 50, ik: 0.5, ikUnit: 'A', eseries: 'E24' } },
  ],
};
