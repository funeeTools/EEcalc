/** LM317 / LM337 resistors — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { bracketE } from '@/core/eseries';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { type Pair, bestPairs, operatingPoint, r1For, r2For, ratingFor, vOut, worstCase } from './model';

export const ID = 'general/lm317-resistors';

export interface PartData {
  neg: boolean;
  vref: number;
  /** ± fraction */
  vrefTol: number;
  iadj: number;
  iadjMax: number;
  imin: number;
  vdo: number;
  vdiffMax: number;
  imax: number;
}

/** Data-sheet values over the full operating temperature range (see model.ts header for the tables). */
export const PARTS: Record<string, PartData | { neg: boolean; custom: true }> = {
  'LM317 (positive)': { neg: false, vref: 1.25, vrefTol: 4, iadj: 50e-6, iadjMax: 100e-6, imin: 10e-3, vdo: 3, vdiffMax: 40, imax: 1.5 },
  'LM337 (negative)': { neg: true, vref: 1.25, vrefTol: 4, iadj: 65e-6, iadjMax: 100e-6, imin: 10e-3, vdo: 3, vdiffMax: 40, imax: 1.5 },
  'Custom positive': { neg: false, custom: true },
  'Custom negative': { neg: true, custom: true },
};
const PRESET_KEYS = ['vref', 'vrefTol', 'iadj', 'iadjMax', 'imin', 'vdo', 'vdiffMax', 'imax'] as const;

export type Lm317Solve = 'vout' | 'r1' | 'r2';

export interface Lm317State {
  solveFor: Lm317Solve;
  part: string;
  vout: number;
  r1: number;
  r1Unit: string;
  r2: number;
  r2Unit: string;
  vref: number;
  iadj: number;
  vin: number;
  iload: number;
  ilmin: number;
  eseries: string;
  /** Resistor tolerance, % */
  tol: number;
  /** V_REF tolerance, ± % */
  vrefTol: number;
  iadjMax: number;
  imin: number;
  vdo: number;
  vdiffMax: number;
  imax: number;
}

export const defaults = (): Lm317State => ({
  solveFor: 'r2',
  part: 'LM317 (positive)',
  vout: 5,
  r1: 120,
  r1Unit: 'Ω',
  r2: 358.28,
  r2Unit: 'Ω',
  vref: 1.25,
  iadj: 50e-6,
  vin: 9,
  iload: 0.2,
  ilmin: 0,
  eseries: 'E24',
  tol: 1,
  vrefTol: 4,
  iadjMax: 100e-6,
  imin: 10e-3,
  vdo: 3,
  vdiffMax: 40,
  imax: 1.5,
});

const U_R = withDefault(U_OHM, 'Ω');
const isNeg = (s: { part: string }) => PARTS[s.part]?.neg ?? false;

function applyPart(v: string, s: Lm317State): void {
  const p = PARTS[v];
  if (!p || 'custom' in p) return;
  for (const k of PRESET_KEYS) s[k] = p[k];
}

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Regulator',
    note: 'Click ◎ to choose the unknown. Voltages are magnitudes; the LM337 output is negative.',
    fields: [
      {
        kind: 'select',
        key: 'part',
        label: 'Regulator',
        options: Object.keys(PARTS),
        apply: (v, s) => applyPart(v, s as Lm317State),
        help: 'Fills V_REF, I_ADJ and the data-sheet limits from the TI LM317 (SLVS044Z) or LM337 (SLVS047L) electrical characteristics. Pin-compatible second sources (ON Semi, ST) are within the same limits; check yours.',
      },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output voltage', unit: 'V', solvable: true, min: 0, max: 1e9, help: 'Output magnitude (OUT to GND). The LM317 can be set from 1.25 V to 37 V; the LM337 from −1.25 V to −37 V.' },
      { kind: 'number', key: 'r1', symbol: 'R₁', label: 'OUT → ADJ resistor', units: U_R, unitKey: 'r1Unit', solvable: true, min: 1, max: 1e6, help: 'Sets the divider current V_REF/R₁. TI uses 240 Ω (LM317, 5.2 mA) or 120 Ω (LM337, 10.4 mA); 120 Ω meets the 10 mA guaranteed minimum load by itself.' },
      { kind: 'number', key: 'r2', symbol: 'R₂', label: 'ADJ → GND resistor', units: U_R, unitKey: 'r2Unit', solvable: true, min: 0, max: 1e8, help: 'Sets the output: V_out = V_REF(1 + R₂/R₁) + I_ADJ·R₂. R₂ = 0 gives V_out = V_REF.' },
      { kind: 'number', key: 'vref', symbol: 'V_REF', label: 'Reference voltage', unit: 'V', min: 0.5, max: 5, help: 'Voltage held between OUT and ADJ: 1.25 V typical for both parts (1.2–1.3 V over line, load and temperature).' },
      { kind: 'number', key: 'iadj', symbol: 'I_ADJ', label: 'ADJ pin current', unit: 'A', min: 0, max: 1e-3, help: 'Current out of the ADJ pin, through R₂: 50 µA typical (LM317), 65 µA (LM337). It raises the output by I_ADJ·R₂.' },
    ],
  },
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'vin', symbol: 'V_in', label: 'Input voltage (min)', unit: 'V', min: 0, max: 1000, help: 'Lowest input magnitude (ripple valley, low line): the headroom check uses it. The dissipation also uses it; for the thermal worst case enter the highest input on the LDO thermal page.' },
      { kind: 'number', key: 'iload', symbol: 'I_L', label: 'Load current', unit: 'A', min: 0, max: 100, help: 'Current drawn by the load at full load (not counting the R₁/R₂ divider).' },
      { kind: 'number', key: 'ilmin', symbol: 'I_L,min', label: 'Minimum load current', unit: 'A', min: 0, max: 100, help: 'Smallest current the load ever draws (0 if it can be unplugged or switched off). With the divider current it must meet the regulator’s minimum load.' },
    ],
  },
  {
    kind: 'section',
    title: 'Standard parts',
    fields: [
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E48', 'E96'], help: 'IEC 60063 series searched for the best standard R₁/R₂ pair (R₁ within about ×/÷ 2 of the present value).' },
      { kind: 'number', key: 'tol', symbol: 'tol', label: 'Resistor tolerance', suffix: '%', min: 0, max: 20, help: 'Initial tolerance of each resistor, for the worst-case output.' },
    ],
  },
  {
    kind: 'section',
    title: 'Data-sheet limits',
    collapsed: true,
    note: 'Filled by the regulator preset; values over the full temperature range.',
    fields: [
      { kind: 'number', key: 'vrefTol', symbol: 'ΔV_REF', label: 'V_REF tolerance', suffix: '%', min: 0, max: 20, help: '±4 % covers the 1.2–1.3 V data-sheet range of both parts (3 V ≤ Vin − Vout ≤ 40 V, 10 mA to 1.5 A).' },
      { kind: 'number', key: 'iadjMax', symbol: 'I_ADJ,max', label: 'ADJ current max', unit: 'A', min: 0, max: 1e-3, help: '100 µA maximum for both parts. The data sheets give no minimum, so the worst case uses 0 … I_ADJ,max.' },
      { kind: 'number', key: 'imin', symbol: 'I_min', label: 'Minimum load', unit: 'A', min: 0, max: 1, help: 'Minimum output current to stay in regulation: 10 mA maximum (3.5 mA typical LM317, 2.5 mA LM337) at 40 V differential; less at lower differential.' },
      { kind: 'number', key: 'vdo', symbol: 'V_DO', label: 'Headroom (dropout)', unit: 'V', min: 0, max: 20, help: 'Input–output difference needed to regulate. TI specifies the LM317/LM337 from 3 V and says it “requires up to 3 V headroom”; typical dropout is lower at light load and high temperature.' },
      { kind: 'number', key: 'vdiffMax', symbol: 'ΔV_max', label: 'Max Vin − Vout', unit: 'V', min: 1, max: 1000, help: 'Absolute-maximum input–output differential: 40 V for both parts.' },
      { kind: 'number', key: 'imax', symbol: 'I_max', label: 'Rated output current', unit: 'A', min: 1e-3, max: 100, help: '1.5 A minimum current limit for Vin − Vout ≤ 15 V (KCS/KTT/TO-220 parts). It falls to 0.15 A minimum at 40 V.' },
    ],
  },
];

const LABEL: Record<Lm317Solve, string> = { vout: 'Output voltage', r1: 'R₁ (OUT → ADJ)', r2: 'R₂ (ADJ → GND)' };
const SYM: Record<Lm317Solve, string> = { vout: 'V_out', r1: 'R₁', r2: 'R₂' };

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fI = (i: number) => si(i, 'A', 3);
const fP = (p: number) => si(p, 'W', 3);
const pct = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)} %`;

function fail(msg: string, s: Lm317State): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: Lm317State): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: Lm317State): CalcReport {
  const s: Lm317State = { ...st };
  for (const k of ['vref', 'iadj', 'vin', 'iload', 'ilmin', 'tol', 'vrefTol', 'iadjMax', 'imin', 'vdo', 'vdiffMax', 'imax'] as const) finite(k, s[k]);
  if (!(s.vref > 0)) throw new Error('V_REF must be > 0.');
  if (s.iadj < 0 || s.iadjMax < 0 || s.iload < 0 || s.ilmin < 0 || s.vin < 0) throw new Error('Currents and the input voltage are magnitudes (≥ 0).');
  if (s.tol < 0 || s.tol >= 100 || s.vrefTol < 0 || s.vrefTol >= 100) throw new Error('Tolerances must be between 0 and 100 %.');
  const sgn = isNeg(s) ? -1 : 1;
  const fV = (v: number, d = 4) => si(sgn * v, 'V', d);
  const need = (k: Lm317Solve) => (s.solveFor === k ? 0 : finite(LABEL[k], s[k]));
  const vout = need('vout');
  const r1 = need('r1');
  const r2 = need('r2');
  if (s.solveFor !== 'r1' && !(r1 > 0)) throw new Error('R₁ must be > 0.');
  if (s.solveFor !== 'r2' && !(r2 >= 0)) throw new Error('R₂ must be ≥ 0.');

  // ── solve: closed-form inverses of the single forward equation vOut(), so a solved value round-trips exactly.
  // Mode-switch harness: the remaining medium flags are "error-after-edit" from typed numbers that make the
  // target impossible (V_out below V_REF, R outside the field range, I_ADJ·R₂ ≥ V_out − V_REF); those errors
  // are the intended answer. Setting switches fall back to the analysis (solve.analysis = 'vout').
  switch (s.solveFor) {
    case 'vout':
      s.vout = vOut(s.vref, s.iadj, r1, r2);
      break;
    case 'r2': {
      if (!(vout >= s.vref)) return fail(`The output cannot be below V_REF = ${fV(s.vref, 3)} (that is R₂ = 0). Raise the target V_out.`, s);
      const x = r2For(vout, s.vref, s.iadj, r1);
      if (x > 1e8) return fail(`This needs R₂ = ${fR(x, 3)}, above the 100 MΩ the page accepts. Lower R₁ or V_out.`, s);
      s.r2 = x;
      break;
    }
    case 'r1': {
      if (!(vout > s.vref)) return fail(`With a finite R₁ the output is above V_REF = ${fV(s.vref, 3)}. Raise the target V_out.`, s);
      const x = r1For(vout, s.vref, s.iadj, r2);
      if (!(x > 0)) return fail(`I_ADJ·R₂ = ${fV(s.iadj * r2, 3)} alone already lifts the output to ${fV(s.vref + s.iadj * r2, 3)} or more: lower R₂ (or raise V_out).`, s);
      if (x < 1 || x > 1e6) return fail(`This needs R₁ = ${fR(x, 3)}, outside 1 Ω … 1 MΩ. Change R₂ so R₁ lands near 100–250 Ω.`, s);
      s.r1 = x;
      break;
    }
    default:
      throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }

  const tol = s.tol / 100;
  const vt = s.vrefTol / 100;
  const op = operatingPoint(s.vref, s.iadj, s.r1, s.r2, s.vin, s.iload, s.vdo);
  const wc = worstCase(s.vref, vt, s.iadjMax, s.r1, s.r2, tol);
  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const solved = s.solveFor;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const dropout = op.margin < 0;
  const vinNeed = op.vout + s.vdo;

  // ── headline
  const sv = s[solved];
  const primary: ResultItem[] = [
    item(solved, LABEL[solved], sv, solved === 'vout' ? 'V' : 'Ω', solved === 'vout' ? fV(sv, 5) : fR(sv), {
      symbol: SYM[solved],
      solved: true,
      primary: true,
      note: solved === 'vout' ? `I_ADJ adds ${fV(s.iadj * s.r2, 3)}` : 'exact value',
    }),
  ];
  if (solved !== 'vout') primary.push(item('voutCheck', 'Output voltage', sgn * op.vout, 'V', fV(op.vout, 5), { symbol: 'V_out', primary: true, note: `I_ADJ adds ${fV(s.iadj * s.r2, 3)}` }));
  // Pairs whose R₁ is above V_REF/(I_min − I_L,min) fail the minimum load: they are ranked after the passing ones.
  const r1Cap = s.imin > s.ilmin ? (s.vref / (s.imin - s.ilmin)) * (1 + 1e-9) : Infinity;
  const pairs = bestPairs(s.eseries, op.vout, s.vref, s.iadj, s.r1, r1Cap);
  const best: Pair | undefined = pairs[0];
  const keep = keepPick(s, op.vout);
  if (best) {
    primary.push(item('pairVout', `Best ${s.eseries} pair`, sgn * best.vout, 'V', `${fR(best.r1, 3)} / ${fR(best.r2, 3)}`, { primary: true, note: `V_out ${fV(best.vout, 4)} (${pct(best.err)})`, tone: Math.abs(best.err) > Math.max(tol, 0.005) ? 'warn' : '' }));
  }
  primary.push(item('voutRange', 'Worst-case output', sgn * wc.lo, 'V', `${fV(sgn > 0 ? wc.lo : wc.hi, 4)} … ${fV(sgn > 0 ? wc.hi : wc.lo, 4)}`, { primary: true, symbol: 'V_out', note: `V_REF ±${+s.vrefTol.toPrecision(3)} %, R ±${+s.tol.toPrecision(3)} %, I_ADJ 0…${si(s.iadjMax, 'A', 2)}` }));
  primary.push(item('vinMin', 'Minimum input', sgn * vinNeed, 'V', fV(vinNeed, 4), { symbol: 'V_in,min', primary: true, tone: dropout ? 'fail' : '', note: `V_out + ${si(s.vdo, 'V', 3)} headroom · margin ${si(op.margin, 'V', 3)}` }));

  // ── grouped results
  const iMinTotal = op.iR1 + s.ilmin;
  const r1ForImin = s.imin > 0 ? s.vref / Math.max(s.imin - s.ilmin, 0) : Infinity;
  const rated1 = ratingFor(2 * op.pR1);
  const rated2 = ratingFor(2 * op.pR2);
  const rest: ResultItem[] = [
    item('iR1', 'Divider current', op.iR1, 'A', fI(op.iR1), { symbol: 'I_R1', group: 'Divider', note: 'V_REF/R₁' }),
    item('iR2', 'Current in R₂', op.iR2, 'A', fI(op.iR2), { symbol: 'I_R2', group: 'Divider', note: 'I_R1 + I_ADJ' }),
    item('adjShift', 'Output lift from I_ADJ', sgn * s.iadj * s.r2, 'V', fV(s.iadj * s.r2, 3), { symbol: 'I_ADJ·R₂', group: 'Divider', note: op.vout > 0 ? `${((s.iadj * s.r2) / op.vout * 100).toFixed(2)} % of V_out` : '' }),
    item('pR1', 'Power in R₁', op.pR1, 'W', fP(op.pR1), { symbol: 'P_R1', group: 'Divider', note: rated1 ? `use ≥ ${si(rated1, 'W')} (2× margin)` : 'above 10 W' }),
    item('pR2', 'Power in R₂', op.pR2, 'W', fP(op.pR2), { symbol: 'P_R2', group: 'Divider', note: rated2 ? `use ≥ ${si(rated2, 'W')} (2× margin)` : 'above 10 W' }),
    item('minLoad', 'Lightest regulator load', iMinTotal, 'A', fI(iMinTotal), { symbol: 'I_R1 + I_L,min', group: 'Minimum load', tone: iMinTotal < s.imin ? 'warn' : '', note: `needs ≥ ${fI(s.imin)}` }),
    item('r1MaxImin', 'R₁ for the minimum load', Number.isFinite(r1ForImin) ? r1ForImin : null, 'Ω', s.ilmin >= s.imin ? 'any (load suffices)' : `≤ ${fR(r1ForImin, 3)}`, { symbol: 'R₁,max', group: 'Minimum load' }),
    item('headroom', 'Input–output difference', s.vin - op.vout, 'V', si(s.vin - op.vout, 'V', 4), { symbol: 'V_in − V_out', group: 'Headroom & power', tone: dropout || s.vin - op.vout > s.vdiffMax ? 'fail' : '', note: `needs ${si(s.vdo, 'V', 3)} … ${si(s.vdiffMax, 'V', 3)}` }),
    item('margin', 'Headroom margin', op.margin, 'V', si(op.margin, 'V', 4), { symbol: 'ΔV', group: 'Headroom & power', tone: dropout ? 'fail' : '' }),
    item('pd', 'Regulator dissipation', dropout ? null : op.pd, 'W', dropout ? '—' : fP(op.pd), { symbol: 'P_D', group: 'Headroom & power', note: dropout ? 'in dropout (see warning)' : `at V_in ${fV(s.vin, 3)}, I_L ${fI(s.iload)}` }),
    item('iin', 'Input current', op.iin, 'A', fI(op.iin), { symbol: 'I_in', group: 'Headroom & power', note: 'load + divider + I_ADJ' }),
    item('eff', 'Efficiency', dropout ? null : op.eff, '', dropout ? '—' : `${(op.eff * 100).toFixed(1)} %`, { symbol: 'η', group: 'Headroom & power', note: dropout ? 'in dropout' : 'load power / input power' }),
    item('voutMin', 'Worst-case minimum', sgn * wc.lo, 'V', fV(wc.lo, 5), { group: 'Tolerance' }),
    item('voutMax', 'Worst-case maximum', sgn * wc.hi, 'V', fV(wc.hi, 5), { group: 'Tolerance' }),
    item('dVref', 'From V_REF', wc.dVref, 'V', `±${si(wc.dVref, 'V', 3)}`, { group: 'Tolerance', note: `±${+s.vrefTol.toPrecision(3)} % × (1 + R₂/R₁)` }),
    item('dRes', 'From the resistors', wc.dRes, 'V', `±${si(wc.dRes, 'V', 3)}`, { group: 'Tolerance', note: `R₁, R₂ at ±${+s.tol.toPrecision(3)} %` }),
    item('dIadj', 'From I_ADJ', wc.dIadj, 'V', `±${si(wc.dIadj, 'V', 3)}`, { group: 'Tolerance', note: `0 … ${si(s.iadjMax, 'A', 2)} × R₂` }),
  ];
  if (best) {
    const wcp = worstCase(s.vref, vt, s.iadjMax, best.r1, best.r2, tol);
    rest.push(
      item('pairR1', `${s.eseries} R₁`, best.r1, 'Ω', fR(best.r1, 3), { group: `Best ${s.eseries} pair`, symbol: 'R₁' }),
      item('pairR2', `${s.eseries} R₂`, best.r2, 'Ω', fR(best.r2, 3), { group: `Best ${s.eseries} pair`, symbol: 'R₂' }),
      item('pairErr', 'Output error', best.err, '', pct(best.err, 3), { group: `Best ${s.eseries} pair` }),
      item('pairWorst', 'Worst case with these', sgn * wcp.lo, 'V', `${fV(sgn > 0 ? wcp.lo : wcp.hi, 4)} … ${fV(sgn > 0 ? wcp.hi : wcp.lo, 4)}`, { group: `Best ${s.eseries} pair` }),
    );
  }
  if (keep) rest.push(item('keepPick', keep.label, sgn * keep.vout, 'V', `${fR(keep.r1, 3)} / ${fR(keep.r2, 3)} → ${fV(keep.vout, 4)} (${pct(keep.err)})`, { group: `Best ${s.eseries} pair`, note: 'for comparison' }));
  report.results = [...primary, ...rest];
  if (pairs.length) report.tables.push(pairTable(s, pairs, tol, vt, fV));

  // ── warnings & notes
  if (dropout) {
    report.status = { text: 'DROPOUT', tone: 'fail' };
    warnings.push(`V_in − V_out = ${si(s.vin - op.vout, 'V', 3)} is below the ${si(s.vdo, 'V', 3)} headroom: the output will sag to about V_in − V_DO and pass input ripple (dissipation and efficiency are then not meaningful). Raise the minimum input to ${fV(vinNeed, 3)} or use an LDO.`);
  }
  if (s.vin - op.vout > s.vdiffMax) warnings.push(`V_in − V_out = ${si(s.vin - op.vout, 'V', 3)} exceeds the ${si(s.vdiffMax, 'V', 3)} absolute maximum. Pre-regulate, or use a high-voltage part.`);
  else if (s.vin > s.vdiffMax) notes.push(`V_in ${fV(s.vin, 3)} is above ${si(s.vdiffMax, 'V', 3)}: a shorted output (or start-up into a large output capacitor) puts the full input across the regulator.`);
  if (iMinTotal < s.imin) warnings.push(`With the lightest load the regulator delivers only ${fI(iMinTotal)} (divider ${fI(op.iR1)} + load ${fI(s.ilmin)}), below the ${fI(s.imin)} minimum load: the output may rise. Use R₁ ≤ ${fR(r1ForImin, 3)} or add a bleeder.`);
  if (s.iload > s.imax) warnings.push(`Load current ${fI(s.iload)} exceeds the ${fI(s.imax)} rating: the current limit will act. Use a higher-current part (LM338/LM350 class) or a switcher.`);
  else if (s.vin - op.vout > 15 && s.iload > 0.15) notes.push('Above 15 V input–output difference the current limit falls (LM317/LM337: 0.15 A minimum at 40 V). Check the data-sheet current-limit curve.');
  if (!dropout && op.pd > 1) warnings.push(`The regulator dissipates ${fP(op.pd)} at this minimum input; at high line it is more. Check the junction temperature (LDO thermal page) and the heatsink.`);
  if (op.vout > 37 && op.vout - s.vref > 0) notes.push(`V_out ${fV(op.vout, 3)} is above the 37 V adjustment range of the LM317/LM337.`);
  if (best && Math.abs(best.err) > Math.max(tol, 0.005)) warnings.push(`The closest ${s.eseries} pair is ${pct(best.err, 2)} off. Use a finer series (E48/E96) or a trimmer.`);
  if (s.iadj * s.r2 > 0.02 * op.vout) notes.push(`I_ADJ·R₂ is ${((s.iadj * s.r2) / op.vout * 100).toFixed(1)} % of V_out and I_ADJ varies by part and temperature: lower R₁ and R₂ to make it negligible.`);
  if (Math.max(op.pR1, op.pR2) > 0.25) warnings.push(`A divider resistor dissipates ${fP(Math.max(op.pR1, op.pR2))}: use a power-rated part or raise R₁.`);
  notes.push(
    'Fit 0.1 µF at the input and 1 µF (or more) at the output; 10 µF from ADJ to GND improves ripple rejection (add the protection diodes the data sheet shows when it is used).',
    'Worst case: V_REF, both resistors and I_ADJ at their limits together; line/load regulation and thermal drift are not included.',
  );

  report.summary = `${s.part.split(' ')[0]} · ${fV(op.vout, 4)} from ${fR(s.r1, 3)} / ${fR(s.r2, 3)} · I_R1 ${fI(op.iR1)} · V_in ≥ ${fV(vinNeed, 3)}`;
  report.details = { ...op, sign: sgn, r1: s.r1, r2: s.r2, wc, pairs, vinNeed };
  report.graphs = graphs(s, op.vout, vinNeed, tol, vt, sgn, fV);
  return report;
}

/**
 * The hand-design alternative to the pair search: when solving for one resistor, keep the other as entered
 * and take the better of the two preferred values around the exact answer.
 */
function keepPick(s: Lm317State, target: number): (Pair & { label: string }) | null {
  if (s.solveFor === 'vout' || !(target > 0)) return null;
  const x = s[s.solveFor];
  if (!(x > 0)) return null;
  const cands = bracketE(s.eseries, x)
    .filter((v) => v >= 1 && v <= 10e6)
    .map((v) => {
      const r1 = s.solveFor === 'r1' ? v : s.r1;
      const r2 = s.solveFor === 'r2' ? v : s.r2;
      const vo = vOut(s.vref, s.iadj, r1, r2);
      return { r1, r2, vout: vo, err: vo / target - 1 };
    });
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs(a.err) - Math.abs(b.err));
  return { ...cands[0], label: s.solveFor === 'r2' ? `Keeping R₁ = ${si(s.r1, 'Ω', 3)}` : `Keeping R₂ = ${si(s.r2, 'Ω', 3)}` };
}

/** Output error against the resistor tolerance (≥ 0.5 %); rows that leave too little load current turn yellow. */
function pairTable(s: Lm317State, pairs: Pair[], tol: number, vt: number, fV: (v: number, d?: number) => string): TableSpec {
  const lim = Math.max(tol, 0.005);
  const rows = pairs.map((p) => {
    const w = worstCase(s.vref, vt, s.iadjMax, p.r1, p.r2, tol);
    return { r1: p.r1, r2: p.r2, vout: p.vout, err: p.err * 100, iR1: s.vref / p.r1, lo: w.lo, hi: w.hi };
  });
  return {
    id: 'pairs',
    title: `Best ${s.eseries} pairs for V_out = ${fV(pairs[0] ? pairs[0].vout / (1 + pairs[0].err) : 0, 4)}`,
    columns: [
      { key: 'r1', label: 'R₁', unit: 'Ω' },
      { key: 'r2', label: 'R₂', unit: 'Ω' },
      { key: 'vout', label: 'V_out', unit: 'V' },
      { key: 'err', label: 'Error', unit: '%' },
      { key: 'iR1', label: 'I_R1', unit: 'A' },
      { key: 'lo', label: 'Worst min', unit: 'V' },
      { key: 'hi', label: 'Worst max', unit: 'V' },
    ],
    rows,
    rowTones: rows.map((r) => (Math.abs(r.err / 100) > lim ? 'fail' : Math.abs(r.err / 100) > lim / 2 || r.iR1 + s.ilmin < s.imin ? 'warn' : 'pass')), // min-load failures sort last
    display: rows.map((r) => ({
      r1: si(r.r1, 'Ω', 3),
      r2: si(r.r2, 'Ω', 3),
      vout: fV(r.vout, 5),
      err: `${r.err >= 0 ? '+' : '−'}${Math.abs(r.err).toFixed(3)} %`,
      iR1: si(r.iR1, 'A', 3),
      lo: fV(r.lo, 4),
      hi: fV(r.hi, 4),
    })),
    note: `R₁ within about ×/÷ 2 of ${si(s.r1, 'Ω', 3)} ; pairs meeting the minimum load first, then by error by error (I_ADJ included). Red above ${+(lim * 100).toPrecision(3)} % error, yellow above half of it or when I_R1 + I_L,min is below the ${si(s.imin, 'A', 3)} minimum load.`,
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: Lm317State, vout: number, vinNeed: number, tol: number, vt: number, sgn: number, fV: (v: number, d?: number) => string): GraphSpec[] {
  // 1 — output vs R2 with the worst-case band; the operating point and the dropout ceiling Vin − V_DO
  const r2c = s.r2 > 0 ? s.r2 : s.r1;
  const xs = logspace(r2c / 10, r2c * 10, 161);
  if (s.r2 > 0) xs.push(s.r2), xs.sort((a, b) => a - b);
  const ceiling = s.vin - s.vdo;
  const vGraph: GraphSpec = {
    id: 'vout-vs-r2',
    title: 'V_out vs R₂',
    subtitle: `R₁ = ${si(s.r1, 'Ω', 3)}; magnitudes`,
    x: { label: 'R₂', unit: 'Ω', log: true },
    y: [{ id: 'v', label: '|V_out|', unit: 'V', includeZero: true }],
    series: [
      { label: 'Nominal', x: xs, y: xs.map((r) => vOut(s.vref, s.iadj, s.r1, r)), axis: 'v', width: 2.2 },
      { label: 'Worst-case max', x: xs, y: xs.map((r) => worstCase(s.vref, vt, s.iadjMax, s.r1, r, tol).hi), axis: 'v', color: '#c47b17', width: 1.3, dash: [5, 3] },
      { label: 'Worst-case min', x: xs, y: xs.map((r) => worstCase(s.vref, vt, s.iadjMax, s.r1, r, tol).lo), axis: 'v', color: '#c47b17', width: 1.3, dash: [5, 3] },
    ],
    hlines: ceiling > 0 ? [{ value: ceiling, label: `V_in − V_DO = ${si(ceiling, 'V', 3)}`, axis: 'v', color: '#8b1e1e', dash: [4, 4], width: 1.2 }] : [],
    markers: s.r2 > 0 ? [{ x: s.r2, y: vout, axis: 'v', label: fV(vout, 4) }] : [],
  };
  // 2 — regulator dissipation vs load current at the entered input
  const iMax = Math.max(s.imax, s.iload) * 1.15;
  const is = Array.from({ length: 121 }, (_, i) => (iMax * i) / 120);
  const pd = (i: number) => operatingPoint(s.vref, s.iadj, s.r1, s.r2, s.vin, i, s.vdo).pd;
  const pGraph: GraphSpec = {
    id: 'pd-vs-load',
    title: 'Dissipation vs load',
    subtitle: `at V_in ${fV(s.vin, 3)} (needs ≥ ${fV(vinNeed, 3)})`,
    x: { label: 'Load current I_L', unit: 'A' },
    y: [{ id: 'p', label: 'Regulator dissipation', unit: 'W', includeZero: true }],
    series: [{ label: 'P_D', x: is, y: is.map((i) => Math.max(pd(i), 0)), axis: 'p', width: 2.2 }],
    vlines: [{ value: s.imax, label: `I_max ${si(s.imax, 'A', 3)}`, color: '#8b1e1e', dash: [4, 4], width: 1.2 }],
    markers: [{ x: s.iload, y: Math.max(pd(s.iload), 0), axis: 'p', label: si(Math.max(pd(s.iload), 0), 'W', 3) }],
  };
  void sgn;
  return [vGraph, pGraph];
}

export const def: CalcDef<Lm317State> = {
  id: ID,
  version: '0.1.0',
  method:
    'V_out = V_REF(1 + R₂/R₁) + I_ADJ·R₂ with exact closed-form inverses for R₁ and R₂ (TI LM317 data sheet SLVS044Z eq. 1–2; LM337 SLVS047L for the negative part); worst case from V_REF, I_ADJ and resistor limits; headroom, minimum-load and dissipation checks against the data-sheet limits; IEC 60063 E-series pair search.',
  fields,
  defaults,
  solve: {
    default: 'r2',
    analysis: 'vout',
    options: [
      { key: 'vout', label: 'V_out from R₁, R₂ (analysis)' },
      { key: 'r2', label: 'R₂ for a target V_out' },
      { key: 'r1', label: 'R₁ for a target V_out' },
    ],
  },
  compute,
  sync: (s) => {
    const p = PARTS[s.part];
    if (!p || 'custom' in p) return;
    if (PRESET_KEYS.some((k) => Math.abs(p[k] - s[k]) > 1e-12 * Math.max(1, Math.abs(p[k])))) s.part = p.neg ? 'Custom negative' : 'Custom positive';
  },
  examples: [
    { id: 'default', label: 'LM317 5 V, R₁ = 120 Ω (solve R₂, E24)', state: defaults() },
    { id: 'ti-240-720', label: 'TI Fig. 8-1 R₁ = 240 Ω with R₂ = 720 Ω (analysis)', state: { ...defaults(), solveFor: 'vout', r1: 240, r2: 720, vin: 10, iload: 0.1, ilmin: 0.01, eseries: 'E24' } },
    { id: 'lm337-12', label: 'LM337 −12 V from −18 V, R₁ = 120 Ω (E96)', state: { ...defaults(), part: 'LM337 (negative)', iadj: 65e-6, solveFor: 'r2', vout: 12, r1: 120, vin: 18, iload: 0.3, ilmin: 0, eseries: 'E96' } },
    { id: 'r1-for-r2', label: '3.3 V with a fixed 390 Ω R₂ (solve R₁)', state: { ...defaults(), solveFor: 'r1', vout: 3.3, r2: 390, vin: 7, iload: 0.2, ilmin: 0, eseries: 'E24' } },
    { id: 'dropout', label: '9 V from a 10 V input: dropout', state: { ...defaults(), solveFor: 'r2', vout: 9, r1: 120, vin: 10, iload: 1, ilmin: 0, eseries: 'E24' } },
    { id: 'high-r', label: '24 V with R₁ = 1 kΩ: minimum load and I_ADJ error', state: { ...defaults(), solveFor: 'r2', vout: 24, r1: 1e3, r1Unit: 'kΩ', r2Unit: 'kΩ', vin: 30, iload: 0.05, ilmin: 0, eseries: 'E96' } },
  ],
};
