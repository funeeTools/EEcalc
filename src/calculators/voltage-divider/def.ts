/** Resistive voltage divider — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { nearestE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { type Pair, R_STD_MAX, R_STD_MIN, bestPairs, bracketE, chipFor, operatingPoint, par, ratingFor, rssSpread, vOut, worstCase } from './model';

export const ID = 'power/voltage-divider';

export interface DividerState {
  solveFor: 'vout' | 'vin' | 'r1' | 'r2';
  vin: number;
  vout: number;
  r1: number;
  r1Unit: string;
  r2: number;
  r2Unit: string;
  /** Load resistance; null = no load */
  rl: number | null;
  rlUnit: string;
  eseries: string;
  /** Resistor tolerance, percent */
  tol: number;
}

export const defaults = (): DividerState => ({
  solveFor: 'r1',
  vin: 12,
  vout: 3.3,
  r1: 26.364e3,
  r1Unit: 'kΩ',
  r2: 10e3,
  r2Unit: 'kΩ',
  rl: null,
  rlUnit: 'kΩ',
  eseries: 'E24',
  tol: 1,
});

// R₁/R₂ can be solved up to 1 TΩ: GΩ keeps such values readable.
const U_R = { ...withDefault(U_OHM, 'kΩ'), 'GΩ': 1e9 };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Divider',
    note: 'Click ◎ to choose the unknown. Vout is measured across R₂ (and the load, if one is given).',
    fields: [
      { kind: 'number', key: 'vin', symbol: 'V_in', label: 'Input voltage', unit: 'V', solvable: true, min: -1e6, max: 1e6, help: 'Voltage across the whole divider. Negative values work too: Vout then has the same sign.' },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output voltage', unit: 'V', solvable: true, min: -1e6, max: 1e6, help: 'Voltage across R₂. With a load R_L this is the loaded output, so solving for R₁, R₂ or Vin compensates for the load.' },
      { kind: 'number', key: 'r1', symbol: 'R₁', label: 'Top resistor', units: U_R, unitKey: 'r1Unit', solvable: true, min: 1e-3, max: 1e12 },
      { kind: 'number', key: 'r2', symbol: 'R₂', label: 'Bottom resistor', units: U_R, unitKey: 'r2Unit', solvable: true, min: 1e-3, max: 1e12 },
    ],
  },
  {
    kind: 'section',
    title: 'Load',
    fields: [
      { kind: 'number', key: 'rl', symbol: 'R_L', label: 'Load resistance', units: U_R, unitKey: 'rlUnit', optional: true, zeroHint: 'none (unloaded)', min: 1e-3, max: 1e15, help: 'Resistance connected across R₂ (ADC input, transistor base, meter…). Leave blank for an unloaded divider.' },
    ],
  },
  {
    kind: 'section',
    title: 'Standard parts',
    fields: [
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E48', 'E96'], help: 'IEC 60063 series searched for the best standard R₁/R₂ pair. E24 is the usual 1 % / 5 % stock; E96 is 1 %.' },
      { kind: 'number', key: 'tol', symbol: 'tol', label: 'Resistor tolerance', suffix: '%', min: 0, max: 50, help: 'Initial tolerance of each resistor, used for the worst-case output range (both resistors at opposite extremes).' },
    ],
  },
];

const LABEL: Record<DividerState['solveFor'], string> = { vout: 'Output voltage', vin: 'Input voltage', r1: 'Top resistor', r2: 'Bottom resistor' };
const SYM: Record<DividerState['solveFor'], string> = { vout: 'V_out', vin: 'V_in', r1: 'R₁', r2: 'R₂' };

const fV = (v: number, d = 4) => si(v, 'V', d);
const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fI = (i: number) => si(i, 'A', 3);
const fP = (p: number) => si(p, 'W', 3);
const pct = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)} %`;

function fail(msg: string, s: DividerState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: DividerState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: DividerState): CalcReport {
  const s: DividerState = { ...st };
  const rl = s.rl == null ? null : finite('R_L', s.rl);
  if (rl != null && !(rl > 0)) throw new Error('Load resistance must be > 0 (leave it blank for no load).');
  const tol = finite('Tolerance', s.tol) / 100;
  if (tol < 0 || tol >= 1) throw new Error('Tolerance must be between 0 and 100 %.');
  const need = (k: 'vin' | 'vout' | 'r1' | 'r2') => (s.solveFor === k ? 0 : finite(LABEL[k], s[k]));
  const vin = need('vin');
  const vout = need('vout');
  const r1 = need('r1');
  const r2 = need('r2');
  if (s.solveFor !== 'r1' && !(r1 > 0)) throw new Error('R₁ must be > 0.');
  if (s.solveFor !== 'r2' && !(r2 > 0)) throw new Error('R₂ must be > 0.');

  // ── solve (closed-form inverses of the single forward equation vOut(); exact, so a solved value round-trips)
  switch (s.solveFor) {
    case 'vout':
      s.vout = vOut(vin, r1, r2, rl);
      break;
    case 'vin': {
      if (vout === 0) return fail('Vout = 0 V gives no information about Vin. Enter a non-zero output voltage.', s);
      const r2e = par(r2, rl);
      s.vin = (vout * (r1 + r2e)) / r2e;
      break;
    }
    case 'r1':
    case 'r2': {
      if (vin === 0) return fail('Vin = 0 V: every divider gives 0 V. Enter a non-zero input voltage.', s);
      const k = vout / vin;
      if (!(k > 0 && k < 1)) return fail(`A resistive divider can only give 0 < Vout/Vin < 1 (same sign as Vin, smaller in magnitude); Vout/Vin = ${k.toPrecision(4)}.`, s);
      if (s.solveFor === 'r1') {
        s.r1 = par(r2, rl) * (1 / k - 1);
      } else {
        const r2e = (r1 * k) / (1 - k);
        if (rl != null && r2e >= rl * (1 - 1e-12)) {
          const vMax = vOut(vin, r1, Infinity, rl);
          return fail(`The load R_L = ${fR(rl)} limits the output to ${fV(vMax)} even with R₂ open (R₁ and R_L alone form the divider). Lower R₁ or the target Vout.`, s);
        }
        s.r2 = rl != null ? (r2e * rl) / (rl - r2e) : r2e;
      }
      break;
    }
    default:
      throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }

  const op = operatingPoint(s.vin, s.r1, s.r2, rl);
  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const solved = s.solveFor;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  // ── headline
  const primary: ResultItem[] = [];
  const solvedVal = s[solved];
  primary.push(
    item(solved, LABEL[solved], solvedVal, solved.startsWith('r') ? 'Ω' : 'V', solved.startsWith('r') ? fR(solvedVal) : fV(solvedVal, 5), {
      symbol: SYM[solved],
      solved: true,
      primary: true,
      note: solved === 'vout' ? `ratio ${op.ratio.toPrecision(4)}` : solved.startsWith('r') ? 'exact value' : `for ${fV(s.vout)} out`,
    }),
  );
  if (solved !== 'vout') primary.push(item('voutCheck', 'Output voltage', op.vout, 'V', fV(op.vout, 5), { symbol: 'V_out', primary: true, note: `ratio ${op.ratio.toPrecision(4)}` }));

  // E-series pair (target = the output this divider is meant to produce)
  const pairs = bestPairs(s.eseries, s.vin, op.vout, rl, s.r1 + s.r2);
  const best: Pair | undefined = pairs[0];
  const nearest = simplePick(s, rl, op.vout);
  if (best) {
    primary.push(
      item('pairVout', `Best ${s.eseries} pair`, best.vout, 'V', `${fR(best.r1, 3)} / ${fR(best.r2, 3)}`, {
        primary: true,
        note: `Vout ${fV(best.vout, 4)} (${pct(best.err)})`,
        tone: Math.abs(best.err) > Math.max(tol, 0.005) ? 'warn' : '',
      }),
    );
  }
  const wc = worstCase(s.vin, s.r1, s.r2, rl, tol);
  primary.push(item('voutRange', `Worst case at ±${+(tol * 100).toPrecision(3)} %`, wc.lo, 'V', `${fV(wc.lo, 4)} … ${fV(wc.hi, 4)}`, { primary: true, symbol: 'V_out', note: `±${((op.vout !== 0 ? (wc.hi - wc.lo) / 2 / Math.abs(op.vout) : 0) * 100).toFixed(2)} % of Vout` }));

  // ── tables of key/value results
  const rated1 = ratingFor(2 * op.p1);
  const rated2 = ratingFor(2 * op.p2);
  const rest: ResultItem[] = [
    item('ratio', 'Division ratio', op.ratio, '', op.ratio.toPrecision(5), { symbol: 'Vout/Vin', group: 'Divider' }),
    item('vth', 'Unloaded output', op.vth, 'V', fV(op.vth, 5), { symbol: 'V_th', group: 'Divider', note: 'Thévenin voltage' }),
    item('rth', 'Output resistance', op.rth, 'Ω', fR(op.rth), { symbol: 'R_th', group: 'Divider', note: 'R₁ ∥ R₂ — what the load sees' }),
    item('rTotal', 'Total resistance', s.r1 + s.r2, 'Ω', fR(s.r1 + s.r2), { symbol: 'R₁+R₂', group: 'Divider' }),
    item('rl1pct', 'Load for ≤ 1 % droop', 99 * op.rth, 'Ω', `≥ ${fR(99 * op.rth, 3)}`, { symbol: 'R_L', group: 'Divider', note: '99 × R_th' }),
    item('i1', 'Input current', op.i1, 'A', fI(op.i1), { symbol: 'I_in', group: 'Currents & power', note: 'through R₁' }),
    item('i2', 'Current in R₂', op.i2, 'A', fI(op.i2), { symbol: 'I₂', group: 'Currents & power' }),
    item('p1', 'Power in R₁', op.p1, 'W', fP(op.p1), { symbol: 'P₁', group: 'Currents & power', note: rated1 ? `use ≥ ${si(rated1, 'W')} (2× margin)` : 'above 10 W' }),
    item('p2', 'Power in R₂', op.p2, 'W', fP(op.p2), { symbol: 'P₂', group: 'Currents & power', note: rated2 ? `use ≥ ${si(rated2, 'W')} (2× margin)` : 'above 10 W' }),
    item('pTotal', 'Total power from Vin', s.vin * op.i1, 'W', fP(s.vin * op.i1), { symbol: 'P', group: 'Currents & power' }),
  ];
  if (rl != null) {
    rest.push(
      item('il', 'Load current', op.il, 'A', fI(op.il), { symbol: 'I_L', group: 'Load' }),
      item('pl', 'Power in load', op.pl, 'W', fP(op.pl), { symbol: 'P_L', group: 'Load' }),
      item('loadErr', 'Loading error', op.loadErr, '', pct(op.loadErr), { symbol: 'ΔV/V', group: 'Load', tone: Math.abs(op.loadErr) > 0.01 ? 'warn' : '', note: 'loaded vs unloaded output, same resistors' }),
    );
  }
  const chip1 = chipFor(op.p1, s.vin - op.vout);
  const chip2 = chipFor(op.p2, op.vout);
  rest.push(
    item('chipR1', 'Chip size for R₁', chip1, '', chip1 ?? 'through-hole / power', { group: 'Parts', note: `${si(Math.abs(s.vin - op.vout), 'V', 3)} across it` }),
    item('chipR2', 'Chip size for R₂', chip2, '', chip2 ?? 'through-hole / power', { group: 'Parts', note: `${si(Math.abs(op.vout), 'V', 3)} across it` }),
  );
  if (best) {
    rest.push(
      item('pairR1', `${s.eseries} R₁`, best.r1, 'Ω', fR(best.r1, 3), { group: `Best ${s.eseries} pair`, symbol: 'R₁' }),
      item('pairR2', `${s.eseries} R₂`, best.r2, 'Ω', fR(best.r2, 3), { group: `Best ${s.eseries} pair`, symbol: 'R₂' }),
      item('pairErr', 'Output error', best.err, '', pct(best.err, 3), { group: `Best ${s.eseries} pair` }),
    );
    const wcp = worstCase(s.vin, best.r1, best.r2, rl, tol);
    rest.push(item('pairWorst', `With ±${+(tol * 100).toPrecision(3)} % parts`, wcp.lo, 'V', `${fV(wcp.lo, 4)} … ${fV(wcp.hi, 4)}`, { group: `Best ${s.eseries} pair` }));
  }
  if (nearest) {
    rest.push(item('simplePick', nearest.label, nearest.vout, 'V', `${fR(nearest.r1, 3)} / ${fR(nearest.r2, 3)} → ${fV(nearest.vout, 4)} (${pct(nearest.err)})`, { group: `Best ${s.eseries} pair`, note: 'for comparison' }));
  }
  const rss = rssSpread(s.r1, s.r2, rl, tol);
  rest.push(item('rss', 'Statistical spread (RSS)', rss, '', `±${(rss * 100).toFixed(3)} %`, { group: 'Tolerance', note: 'root-sum-square of independent errors' }));
  rest.push(item('voutMax', 'Worst-case maximum', wc.hi, 'V', fV(wc.hi, 5), { group: 'Tolerance' }));
  rest.push(item('voutMin', 'Worst-case minimum', wc.lo, 'V', fV(wc.lo, 5), { group: 'Tolerance' }));
  report.results = [...primary, ...rest];

  // ── tables
  if (pairs.length) report.tables.push(pairTable(s, pairs, rl, tol));

  // ── warnings & notes
  if (rl != null && Math.abs(op.loadErr) > 0.01) {
    warnings.push(
      solved === 'vout'
        ? `The load pulls Vout down by ${Math.abs(op.loadErr * 100).toFixed(1)} % from the unloaded value. Keep R_th = R₁∥R₂ below R_L/99 for < 1 % error, or buffer the output.`
        : `The load shifts Vout by ${pct(op.loadErr, 1)}; the solution compensates for it, but the output now depends on R_L. If R_L varies, lower R₁∥R₂ (≤ R_L/99 for < 1 %) or buffer.`,
    );
  }
  if (best && Math.abs(best.err) > Math.max(tol, 0.005)) warnings.push(`The closest ${s.eseries} pair is ${pct(best.err, 2)} off target. Use a finer series (E48/E96) or trim with a series resistor.`);
  if (op.rth > 1e6) warnings.push(`Output resistance ${fR(op.rth, 3)}: leakage, op-amp bias current and ADC sampling capacitors will cause errors, and the node picks up noise. Lower the resistor values or buffer the output.`);
  else if (op.rth > 1e5) notes.push(`R_th = ${fR(op.rth, 3)}: check the input leakage / bias current of whatever reads Vout (1 µA × R_th = ${fV(1e-6 * op.rth, 3)} error) and the ADC’s maximum source impedance.`);
  if (Math.max(op.p1, op.p2) > 0.25) warnings.push(`A resistor dissipates ${fP(Math.max(op.p1, op.p2))}: use larger resistor values or power-rated parts, and allow for self-heating drift (TCR).`);
  for (const [name, v] of [['R₁', Math.abs(s.vin - op.vout)], ['R₂', Math.abs(op.vout)]] as [string, number][]) {
    if (v > 150) warnings.push(`${name} has ${si(v, 'V', 3)} across it: above the 150 V working voltage of 0805 chips. Use a high-voltage part or several resistors in series.`);
  }
  if (!best && op.vout !== 0 && op.ratio > 0 && op.ratio < 1) notes.push(`No ${s.eseries} pair between ${fR(R_STD_MIN, 1)} and ${fR(R_STD_MAX, 2)} fits within half a decade of R₁ + R₂ = ${fR(s.r1 + s.r2, 3)}: the ratio or the impedance level is outside what standard parts cover.`);
  if (!inStdRange(s.r1) || !inStdRange(s.r2)) warnings.push(`A resistor is outside the ${fR(R_STD_MIN, 1)} … ${fR(R_STD_MAX, 2)} range of standard parts. Change the other resistor or the target so both land in a practical range.`);
  if (s.r1 + s.r2 < 100) notes.push('Very low total resistance: PCB trace and contact resistance (tens of mΩ) start to matter.');
  if (s.r1 > 22e6 || s.r2 > 22e6) notes.push('Values above ~22 MΩ are uncommon and leakage-sensitive (board contamination, humidity).');
  notes.push(
    'Resistors are ideal (no TCR, voltage coefficient or leakage). Both resistors from the same thin-film network track far better than the independent ±tol used for the worst case.',
    'The best pair keeps R₁ + R₂ within about ½ decade of the present total, so current and output resistance stay similar.',
  );

  report.summary = `${fV(s.vin)} → ${fV(op.vout)} · R_th ${fR(op.rth, 3)} · ${fI(op.i1)} · ${rl != null ? `load ${fR(rl, 3)}` : 'unloaded'}`;
  report.details = { ...op, vin: s.vin, r1: s.r1, r2: s.r2, rl, pairs, nearest };
  report.graphs = graphs(s, rl, tol, op.vout, op.rth);
  return report;
}

/**
 * The hand-design alternative to the pair search: when solving for one resistor, keep the other as
 * entered and take the better of the two preferred values around the exact answer; otherwise round
 * both resistors to their nearest preferred values.
 */
const inStdRange = (r: number) => r >= R_STD_MIN * (1 - 1e-9) && r <= R_STD_MAX * (1 + 1e-9);

function simplePick(s: DividerState, rl: number | null, target: number): (Pair & { label: string }) | null {
  if (target === 0) return null;
  const ev = (r1: number, r2: number) => {
    const v = vOut(s.vin, r1, r2, rl);
    return { r1, r2, vout: v, err: v / target - 1 };
  };
  if (s.solveFor === 'r1' || s.solveFor === 'r2') {
    const cands = bracketE(s.eseries, s[s.solveFor])
      .filter(inStdRange)
      .map((x) => (s.solveFor === 'r1' ? ev(x, s.r2) : ev(s.r1, x)));
    if (!cands.length) return null;
    cands.sort((a, b) => Math.abs(a.err) - Math.abs(b.err));
    const keep = s.solveFor === 'r1' ? `R₂ = ${fR(s.r2, 3)}` : `R₁ = ${fR(s.r1, 3)}`;
    return { ...cands[0], label: `Keeping ${keep}` };
  }
  const r1 = nearestE(s.r1, s.eseries);
  const r2 = nearestE(s.r2, s.eseries);
  if (!inStdRange(r1) || !inStdRange(r2)) return null;
  return { ...ev(r1, r2), label: 'Each rounded to nearest' };
}

function pairTable(s: DividerState, pairs: Pair[], rl: number | null, tol: number): TableSpec {
  const rows = pairs.map((p) => {
    const wc = worstCase(s.vin, p.r1, p.r2, rl, tol);
    return { r1: p.r1, r2: p.r2, vout: p.vout, err: p.err * 100, iin: (s.vin - p.vout) / p.r1, lo: wc.lo, hi: wc.hi };
  });
  return {
    id: 'pairs',
    title: `Best ${s.eseries} pairs near R₁ + R₂ = ${fR(s.r1 + s.r2, 3)}`,
    columns: [
      { key: 'r1', label: 'R₁', unit: 'Ω' },
      { key: 'r2', label: 'R₂', unit: 'Ω' },
      { key: 'vout', label: 'Vout', unit: 'V' },
      { key: 'err', label: 'Error', unit: '%' },
      { key: 'iin', label: 'I_in', unit: 'A' },
      { key: 'lo', label: `Min (±${+(tol * 100).toPrecision(3)} %)`, unit: 'V' },
      { key: 'hi', label: 'Max', unit: 'V' },
    ],
    rows,
    rowTones: rows.map((r) => errTone(r.err / 100, tol)),
    display: rows.map((r) => ({
      r1: fR(r.r1, 3),
      r2: fR(r.r2, 3),
      vout: fV(r.vout, 5),
      err: `${r.err >= 0 ? '+' : '−'}${Math.abs(r.err).toFixed(3)} %`,
      iin: fI(r.iin),
      lo: fV(r.lo, 4),
      hi: fV(r.hi, 4),
    })),
    note: `Sorted by output error; ties go to the pair whose total resistance is closest to the present design. Worst case uses the tolerance above. Rows turn yellow above half of ${pctLimit(tol)} error and red above it.`,
  };
}

/** Ratio error against the resistor tolerance (at least 0.5 %): the same limit as the "pair is off target" warning. */
function errTone(err: number, tol: number): 'pass' | 'warn' | 'fail' {
  const lim = Math.max(tol, 0.005);
  return Math.abs(err) > lim ? 'fail' : Math.abs(err) > lim / 2 ? 'warn' : 'pass';
}

const pctLimit = (tol: number) => `${+(Math.max(tol, 0.005) * 100).toPrecision(3)} %`;

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: DividerState, rl: number | null, tol: number, vout: number, rth: number): GraphSpec[] {
  // 1 — Vout vs load resistance
  const lo = Math.max(rth / 100, 1e-2);
  const hi = Math.max(rth * 1e5, (rl ?? 0) * 10);
  const rls = logspace(lo, hi, 181);
  if (rl != null) rls.push(rl), rls.sort((a, b) => a - b);
  const vth = vOut(s.vin, s.r1, s.r2, null);
  const loadGraph: GraphSpec = {
    id: 'vout-vs-load',
    title: 'Vout vs load',
    x: { label: 'Load resistance R_L', unit: 'Ω', log: true },
    y: [{ id: 'v', label: 'Vout', unit: 'V', includeZero: true }],
    series: [
      { label: 'Vout (nominal)', x: rls, y: rls.map((r) => vOut(s.vin, s.r1, s.r2, r)), axis: 'v', width: 2.2 },
      ...(tol > 0
        ? [
            { label: `Max (±${+(tol * 100).toPrecision(3)} %)`, x: rls, y: rls.map((r) => worstCase(s.vin, s.r1, s.r2, r, tol).hi), axis: 'v', color: '#c47b17', width: 1.3, dash: [5, 3] },
            { label: `Min (±${+(tol * 100).toPrecision(3)} %)`, x: rls, y: rls.map((r) => worstCase(s.vin, s.r1, s.r2, r, tol).lo), axis: 'v', color: '#c47b17', width: 1.3, dash: [5, 3] },
          ]
        : []),
    ],
    hlines: [{ value: vth, label: `unloaded ${fV(vth)}`, axis: 'v', color: '#9a8f7a', dash: [3, 3] }, { value: 0.99 * vth, label: '−1 %', axis: 'v', color: '#8b1e1e', dash: [4, 4], width: 1 }],
    vlines: [{ value: 99 * rth, label: '99·R_th', color: '#9a8f7a', dash: [2, 3] }, ...(rl != null ? [{ value: rl, label: `R_L = ${fR(rl, 3)}`, color: '#1f4e5f' }] : [])],
    markers: rl != null ? [{ x: rl, y: vout, axis: 'v', label: fV(vout, 3) }] : [],
  };

  // 2 — output spread vs resistor tolerance
  const ts = logspace(1e-4, 0.2, 121);
  // The RSS figure is a linearisation; at large tolerances keep it inside the exact worst-case envelope.
  const clip = (v: number, t: number) => {
    const w = worstCase(s.vin, s.r1, s.r2, rl, t);
    return Math.min(Math.max(v, w.lo), w.hi);
  };
  if (tol > 0 && tol < 0.2) ts.push(tol), ts.sort((a, b) => a - b);
  const tolGraph: GraphSpec = {
    id: 'vout-vs-tolerance',
    title: 'Vout vs tolerance',
    x: { label: 'Resistor tolerance', unit: '%', log: true },
    y: [{ id: 'v', label: 'Vout', unit: 'V' }],
    series: [
      { label: 'Worst-case max', x: ts.map((t) => t * 100), y: ts.map((t) => worstCase(s.vin, s.r1, s.r2, rl, t).hi), axis: 'v', color: '#8b1e1e', width: 1.8 },
      { label: 'RSS max', x: ts.map((t) => t * 100), y: ts.map((t) => clip(vout * (1 + Math.sign(vout) * rssSpread(s.r1, s.r2, rl, t)), t)), axis: 'v', color: '#c47b17', width: 1.4, dash: [5, 3] },
      { label: 'Nominal', x: [ts[0] * 100, ts[ts.length - 1] * 100], y: [vout, vout], axis: 'v', color: '#1f4e5f', width: 1.4, noReadout: true },
      { label: 'RSS min', x: ts.map((t) => t * 100), y: ts.map((t) => clip(vout * (1 - Math.sign(vout) * rssSpread(s.r1, s.r2, rl, t)), t)), axis: 'v', color: '#c47b17', width: 1.4, dash: [5, 3] },
      { label: 'Worst-case min', x: ts.map((t) => t * 100), y: ts.map((t) => worstCase(s.vin, s.r1, s.r2, rl, t).lo), axis: 'v', color: '#8b1e1e', width: 1.8 },
    ],
    vlines: tol > 0 ? [{ value: tol * 100, label: `±${+(tol * 100).toPrecision(3)} %`, color: '#9a8f7a' }] : [],
  };

  // 3 — scaling both resistors (same ratio): current drawn vs output resistance
  const tot = s.r1 + s.r2;
  const scales = logspace(1e-3, 1e3, 121);
  const tots = scales.map((k) => k * tot);
  const tradeGraph: GraphSpec = {
    id: 'scaling',
    title: 'Current vs impedance',
    subtitle: 'Both resistors scaled together (same ratio)',
    x: { label: 'Total resistance R₁ + R₂', unit: 'Ω', log: true },
    y: [
      { id: 'i', label: 'Input current', unit: 'A', log: true },
      { id: 'e', label: rl != null ? 'Loading error' : 'Output resistance', unit: rl != null ? '%' : 'Ω', side: 'right', log: true },
    ],
    series: [
      { label: 'Input current', x: tots, y: scales.map((k) => Math.abs(operatingPoint(s.vin, s.r1 * k, s.r2 * k, rl).i1)), axis: 'i', width: 2.2 },
      rl != null
        ? { label: 'Loading error', x: tots, y: scales.map((k) => Math.abs(operatingPoint(s.vin, s.r1 * k, s.r2 * k, rl).loadErr) * 100), axis: 'e', color: '#c47b17', width: 1.8 }
        : { label: 'R_th = R₁∥R₂', x: tots, y: scales.map((k) => par(s.r1 * k, s.r2 * k)), axis: 'e', color: '#c47b17', width: 1.8 },
    ],
    vlines: [{ value: tot, label: `now ${fR(tot, 3)}`, color: '#9a8f7a' }],
  };
  // With Vin = 0 every current is zero and the log-scale trade-off plot is empty: leave it out.
  return s.vin !== 0 ? [loadGraph, tolGraph, tradeGraph] : [loadGraph, tolGraph];
}

export const def: CalcDef<DividerState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Ohm/Kirchhoff divider Vout = Vin·R₂∥R_L/(R₁ + R₂∥R_L) with exact closed-form inverses for Vin, R₁, R₂; Thévenin output R₁∥R₂ (Horowitz & Hill, Art of Electronics 3e §1.2); worst case from opposite tolerance extremes, RSS from log sensitivities; IEC 60063 E-series pair search; chip-size limits from Vishay CRCW e3 datasheet (doc. 20035).',
  fields,
  defaults,
  solve: {
    default: 'r1',
    analysis: 'vout',
    options: [
      { key: 'vout', label: 'Vout from Vin, R₁, R₂ (analysis)' },
      { key: 'r1', label: 'R₁ for a target Vout' },
      { key: 'r2', label: 'R₂ for a target Vout' },
      { key: 'vin', label: 'Vin that gives Vout' },
    ],
  },
  compute,
  examples: [
    { id: 'adc-12v', label: '12 V rail → 3.3 V ADC input (solve R₁)', state: defaults() },
    { id: 'fb-ldo', label: 'Regulator feedback: 1.25 V ref, 5 V out (solve R₁, E96)', state: { solveFor: 'r1', vin: 5, vout: 1.25, r2: 10e3, rl: null, eseries: 'E96', tol: 1 } },
    { id: 'batt-sense', label: 'Li-ion sense 470k/680k into a 50 kΩ ADC input (loading)', state: { solveFor: 'vout', vin: 4.2, r1: 470e3, r2: 680e3, rl: 50e3, eseries: 'E24', tol: 1 } },
    { id: 'level-5v-3v3', label: '5 V logic → 3.3 V (solve R₂ with R₁ = 1 kΩ)', state: { solveFor: 'r2', vin: 5, vout: 3.3, r1: 1e3, rl: null, eseries: 'E12', tol: 5 } },
    { id: 'hv-sense', label: '400 V DC bus sense to 2.5 V (high-voltage R₁)', state: { solveFor: 'r1', vin: 400, vout: 2.5, r2: 10e3, rl: null, eseries: 'E96', tol: 0.5 } },
    { id: 'vin-from-vout', label: 'What input gives 2.5 V out of 30k / 10k?', state: { solveFor: 'vin', vout: 2.5, r1: 30e3, r2: 10e3, rl: null, eseries: 'E24', tol: 1 } },
  ],
};
