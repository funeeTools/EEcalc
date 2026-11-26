/** LED series resistor — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM } from '@/core/unitsets';
import { bracketE, nearestE, ratingFor } from '@/core/eseries';
import { LED_PRESETS, ledCurrent, ledResistor, supplyFor } from './model';

export const ID = 'power/led-resistor';

export interface LedState {
  solveFor: 'r' | 'iF' | 'vs';
  vs: number;
  n: number;
  strings: number;
  led: string;
  vf: number;
  vfMax: number;
  iMax: number | null;
  iMaxUnit: string;
  iF: number;
  iFUnit: string;
  r: number;
  rUnit: string;
  eseries: string;
}

const U_I: Record<string, number> = { mA: 1e-3, 'µA': 1e-6, A: 1 };

export const defaults = (): LedState => ({
  solveFor: 'r',
  vs: 5,
  n: 1,
  strings: 1,
  led: 'Red 617 nm (GaAsP)',
  vf: 1.9,
  vfMax: 2.3,
  iMax: 30e-3,
  iMaxUnit: 'mA',
  iF: 10e-3,
  iFUnit: 'mA',
  r: 310,
  rUnit: 'Ω',
  eseries: 'E24',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Circuit',
    note: 'Supply → resistor → n LEDs in series. Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'vs', symbol: 'V_s', label: 'Supply voltage', unit: 'V', solvable: true, min: 0.1, max: 1000 },
      { kind: 'number', key: 'n', symbol: 'n', label: 'LEDs in series', integer: true, min: 1, max: 200 },
      { kind: 'number', key: 'iF', symbol: 'I_F', label: 'LED current', units: U_I, unitKey: 'iFUnit', solvable: true, min: 1e-6, max: 10, help: 'Forward current through the string. 5–10 mA is plenty for an indicator with a modern LED; datasheet Vf is quoted at 10 or 20 mA.' },
      { kind: 'number', key: 'r', symbol: 'R', label: 'Series resistor', units: U_OHM, unitKey: 'rUnit', solvable: true, min: 1e-3, max: 1e9 },
      { kind: 'number', key: 'strings', symbol: 'm', label: 'Parallel strings', integer: true, min: 1, max: 1000, help: 'Identical strings, each with its own resistor, on the same supply. Only totals (supply current, power) change.' },
    ],
  },
  {
    kind: 'section',
    title: 'LED',
    fields: [
      {
        kind: 'select',
        key: 'led',
        label: 'Colour preset',
        options: Object.keys(LED_PRESETS),
        apply: (v, s) => {
          const p = LED_PRESETS[v];
          if (p) {
            s.vf = p.vf;
            s.vfMax = p.vfMax;
            s.iMax = p.iMax;
          }
        },
        help: 'Typical and maximum Vf from Kingbright WP7113-series 5 mm LED datasheets (at their 10 or 20 mA test current). Vf varies by chemistry, maker and bin: use your LED’s datasheet when you have it.',
      },
      { kind: 'number', key: 'vf', symbol: 'V_F', label: 'Forward voltage (typ)', unit: 'V', min: 0.5, max: 100, help: 'Typical forward voltage per LED at about the design current.' },
      { kind: 'number', key: 'vfMax', symbol: 'V_F,max', label: 'Forward voltage (max)', unit: 'V', min: 0.5, max: 100, help: 'Datasheet maximum Vf: the lowest-current case. Set equal to the typical value to ignore the spread.' },
      { kind: 'number', key: 'iMax', symbol: 'I_F,max', label: 'Absolute max current', units: U_I, unitKey: 'iMaxUnit', optional: true, zeroHint: 'not checked', min: 1e-6, max: 100, help: 'Datasheet absolute maximum DC forward current. Leave blank to skip the check.' },
    ],
  },
  {
    kind: 'section',
    title: 'Standard part',
    fields: [{ kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E48', 'E96'], help: 'IEC 60063 series used to pick a standard resistor.' }],
  },
];

const LABEL = { r: 'Series resistor', iF: 'LED current', vs: 'Supply voltage' } as const;
const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fI = (i: number, d = 3) => si(i, 'A', d);
const fV = (v: number, d = 4) => si(v, 'V', d);
const fP = (p: number) => si(p, 'W', 3);

/** Most LEDs of forward voltage vf that a supply vs can still bias with some voltage left (strict). */
export function maxInSeries(vs: number, vf: number): number {
  return Math.max(Math.ceil((vs / vf) * (1 - 1e-12)) - 1, 0);
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: LedState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: LedState): CalcReport {
  const s: LedState = { ...st };
  const n = finite('Number of LEDs', s.n);
  const m = finite('Parallel strings', s.strings);
  const vf = finite('Forward voltage', s.vf);
  const vfMax = Math.max(finite('Maximum forward voltage', s.vfMax), vf);
  const iMax = s.iMax == null ? null : finite('Absolute maximum current', s.iMax);
  if (!(n >= 1) || !Number.isInteger(n)) throw new Error('Number of LEDs in series must be a whole number ≥ 1.');
  if (!(m >= 1) || !Number.isInteger(m)) throw new Error('Parallel strings must be a whole number ≥ 1.');
  if (!(vf > 0)) throw new Error('Forward voltage must be > 0.');
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });

  if (s.solveFor !== 'vs' && !(finite('Supply voltage', s.vs) > 0)) throw new Error('Supply voltage must be > 0.');
  if (s.solveFor !== 'iF' && !(finite('LED current', s.iF) > 0)) throw new Error('LED current must be > 0.');
  if (s.solveFor !== 'r' && !(finite('Resistor', s.r) > 0)) throw new Error('Resistor must be > 0.');

  const vLed = n * vf;
  // Zero headroom must fail even when float rounding leaves a residue (3 × 2.3 = 6.8999999999999995 < 6.9).
  if (s.solveFor !== 'vs' && s.vs - vLed <= 1e-9 * s.vs) {
    const most = maxInSeries(s.vs, vf);
    const fix = most > 0 ? `Use fewer LEDs in series (at most ${most}), a higher supply, or a boost LED driver.` : `Even one LED needs more than ${fV(s.vs)}: use a higher supply or a boost LED driver.`;
    return fail(`A ${fV(s.vs)} supply cannot forward-bias ${n} LED${n > 1 ? 's' : ''} × ${fV(vf, 3)} = ${fV(vLed, 3)} and still leave voltage for the resistor. ${fix}`);
  }
  switch (s.solveFor) {
    case 'r':
      s.r = ledResistor(s.vs, n, vf, s.iF);
      break;
    case 'iF':
      s.iF = ledCurrent(s.vs, n, vf, s.r);
      break;
    case 'vs':
      s.vs = supplyFor(n, vf, s.iF, s.r);
      break;
    default:
      throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }

  const vR = s.vs - vLed;
  // Standard part: when solving for R pick the next value up (current ≤ target); otherwise use R as entered.
  const [below, above] = bracketE(s.eseries, s.r);
  const rStd = s.solveFor === 'r' ? above : s.r;
  const rNear = nearestE(s.r, s.eseries);
  const iStd = ledCurrent(s.vs, n, vf, rStd);
  const iStdMin = ledCurrent(s.vs, n, vfMax, rStd);
  const pR = iStd * iStd * rStd;
  const rating = ratingFor(2 * pR);
  const pLed = vf * iStd;
  const eff = vLed / s.vs;
  const pTot = s.vs * iStd * m;
  const maxN = maxInSeries(s.vs, vfMax);
  const sens = (n * 0.1) / vR; // fractional current change for +0.1 V per LED

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const solved = s.solveFor;
  const sym = { r: 'R', iF: 'I_F', vs: 'V_s' }[solved];
  const solvedDisp = solved === 'r' ? fR(s.r) : solved === 'iF' ? fI(s.iF, 4) : fV(s.vs, 4);
  const results: ResultItem[] = [
    item(solved, LABEL[solved], s[solved], solved === 'r' ? 'Ω' : solved === 'iF' ? 'A' : 'V', solvedDisp, { symbol: sym, solved: true, primary: true, note: solved === 'r' ? 'exact value' : solved === 'iF' ? `at typical Vf ${fV(vf, 3)}` : `${fV(vR, 3)} across R` }),
  ];
  if (solved === 'r') {
    results.push(
      item('rStd', `${s.eseries} resistor`, rStd, 'Ω', fR(rStd, 3), { symbol: 'R', primary: true, note: `next value up · I = ${fI(iStd)}` }),
      item('iStd', 'Current with it', iStd, 'A', fI(iStd), { symbol: 'I_F', primary: true, note: `${fI(iStdMin)} at max Vf` }),
    );
  } else {
    results.push(item('iStdMin', 'Current at max Vf', iStdMin, 'A', fI(iStdMin), { symbol: 'I_F,min', primary: true, note: `Vf = ${fV(vfMax, 3)} per LED` }));
  }
  results.push(item('pR', 'Resistor power', pR, 'W', fP(pR), { symbol: 'P_R', primary: true, note: rating ? `use a ≥ ${si(rating, 'W')} part (2× margin)` : 'more than 10 W: use a driver', tone: pR > 0.5 ? 'warn' : '' }));

  const iTone = iMax != null && iStd > iMax ? 'fail' : '';
  results.push(
    item('vR', 'Voltage across R', vR, 'V', fV(vR, 4), { symbol: 'V_R', group: 'Operating point' }),
    item('vLed', 'Voltage across LEDs', vLed, 'V', fV(vLed, 4), { symbol: 'n·V_F', group: 'Operating point' }),
    item('iOp', 'LED current', iStd, 'A', fI(iStd, 4), { symbol: 'I_F', group: 'Operating point', tone: iTone, note: solved === 'r' ? `with ${fR(rStd, 3)}` : undefined }),
    item('iRange', 'Current, Vf typ … max', iStdMin, 'A', `${fI(iStdMin)} … ${fI(iStd)}`, { group: 'Operating point' }),
    item('sens', 'Current change per +0.1 V Vf', -sens, '', `−${(sens * 100).toFixed(1)} %`, { group: 'Operating point', note: 'per LED; headroom sensitivity' }),
    item('pLed', 'Power per LED', pLed, 'W', fP(pLed), { symbol: 'P_LED', group: 'Power' }),
    item('pRstd', 'Power in resistor', pR, 'W', fP(pR), { symbol: 'P_R', group: 'Power' }),
    item('eff', 'Efficiency', eff, '', `${(eff * 100).toFixed(1)} %`, { symbol: 'η', group: 'Power', note: 'n·Vf / Vs — power reaching the LEDs' }),
    item('iTotal', 'Total supply current', iStd * m, 'A', fI(iStd * m), { symbol: 'I_s', group: 'Power', note: m > 1 ? `${m} strings` : undefined }),
    item('pTotal', 'Total power', pTot, 'W', fP(pTot), { symbol: 'P_s', group: 'Power' }),
    item('rBelow', `${s.eseries} value below`, below, 'Ω', `${fR(below, 3)} → ${fI(ledCurrent(s.vs, n, vf, below))}`, { group: 'Standard values' }),
    item('rAbove', `${s.eseries} value above`, above, 'Ω', `${fR(above, 3)} → ${fI(ledCurrent(s.vs, n, vf, above))}`, { group: 'Standard values' }),
    item('rNear', `Nearest ${s.eseries}`, rNear, 'Ω', fR(rNear, 3), { group: 'Standard values' }),
    item('maxN', 'Max LEDs in series', maxN, '', String(maxN), { group: 'Standard values', note: `at Vf max ${fV(vfMax, 3)}` }),
  );
  report.results = results;

  // ── warnings
  if (iMax != null && iStd > iMax) warnings.push(`LED current ${fI(iStd)} exceeds the absolute maximum ${fI(iMax)}. Use a larger resistor.`);
  else if (iMax != null && iStd > 0.8 * iMax) warnings.push(`LED current ${fI(iStd)} is above 80 % of the absolute maximum ${fI(iMax)}: little margin for low-Vf parts, and LEDs are derated at high ambient temperature.`);
  if (vR < 0.2 * s.vs || vR < 0.5) warnings.push(`Only ${fV(vR, 3)} is left across the resistor, so the current depends strongly on Vf and supply (−${(sens * 100).toFixed(0)} % for +0.1 V of Vf per LED). Use fewer LEDs per string, a higher supply, or a constant-current driver.`);
  if (iStdMin <= 0) warnings.push(`With maximum-Vf LEDs (${n} × ${fV(vfMax, 3)} = ${fV(n * vfMax, 3)}) the supply cannot forward-bias the string, so some parts may not light at all. Use fewer LEDs per string or a higher supply.`);
  else if (iStdMin < 0.5 * iStd) warnings.push(`At maximum Vf the current falls to ${fI(iStdMin)} (${((iStdMin / iStd) * 100).toFixed(0)} % of typical): brightness will vary a lot from part to part.`);
  if (pR > 0.5) warnings.push(`The resistor dissipates ${fP(pR)}. A switching constant-current LED driver would waste far less (efficiency here is ${(eff * 100).toFixed(0)} %).`);
  if (rStd < 1 || rStd > 10e6) warnings.push(`R = ${fR(rStd, 3)} is outside the 1 Ω … 10 MΩ range of ordinary standard resistors. Check the current and supply values.`);
  if (s.iF > 0.1) notes.push('Above ~100 mA you are into power-LED territory: Vf rises with current and falls with temperature, so use a constant-current driver and a heatsink.');
  if (m > 1) notes.push('Do not share one resistor between parallel LEDs: Vf mismatch makes one LED hog the current. This page assumes one resistor per string.');
  notes.push(
    'LED modelled as a fixed forward voltage. In reality Vf rises a little with current (dynamic resistance of a few ohms) and falls about 2 mV/K as the junction warms.',
    'Datasheet Vf is quoted at the test current (often 10 or 20 mA). Well below it the real Vf is lower (around 0.1 V for red parts, more for InGaN blue/white; see the datasheet I–V curve), so the current comes out higher than calculated, by n·ΔVf/(Vs − n·Vf): a large effect when the headroom is small.',
  );

  report.summary = `${fV(s.vs)} → ${n} × ${fV(vf, 3)} LED${n > 1 ? 's' : ''} · R ${fR(rStd, 3)} · ${fI(iStd)} · η ${(eff * 100).toFixed(0)} %`;
  report.details = { vR, vLed, rExact: s.r, rStd, iStd, iStdMin, pR, eff, maxN, sens };
  report.tables.push(stdTable(s, n, vf, vfMax));
  report.graphs = graphs(s, n, vf, vfMax, iMax, rStd, iStd);
  return report;
}

function stdTable(s: LedState, n: number, vf: number, vfMax: number): TableSpec {
  // Preferred values from 3 steps below to 3 steps above the exact resistor
  const vals: number[] = [];
  let x = s.r;
  for (let k = 0; k < 3; k++) {
    const [b] = bracketE(s.eseries, x * 0.999);
    vals.unshift(b);
    x = b;
  }
  x = s.r;
  for (let k = 0; k < 3; k++) {
    const [, a] = bracketE(s.eseries, x * 1.001);
    vals.push(a);
    x = a;
  }
  const uniq = [...new Set(vals)].sort((a, b) => a - b);
  const rows = uniq.map((r) => {
    const i = ledCurrent(s.vs, n, vf, r);
    return { r, i, iMin: ledCurrent(s.vs, n, vfMax, r), p: i * i * r };
  });
  return {
    id: 'standard',
    title: `${s.eseries} resistors around ${fR(s.r, 4)}`,
    columns: [
      { key: 'r', label: 'R', unit: 'Ω' },
      { key: 'i', label: 'I (typ Vf)', unit: 'A' },
      { key: 'iMin', label: 'I (max Vf)', unit: 'A' },
      { key: 'p', label: 'P_R', unit: 'W' },
    ],
    rows,
    // the same limits as the warnings: absolute maximum current (80 % margin) and dim / unlit parts at max Vf
    rowTones: rows.map((r) => {
      if ((s.iMax != null && r.i > s.iMax) || r.iMin <= 0) return 'fail';
      if ((s.iMax != null && r.i > 0.8 * s.iMax) || r.iMin < 0.5 * r.i) return 'warn';
      return 'pass';
    }),
    display: rows.map((r) => ({ r: fR(r.r, 3), i: fI(r.i), iMin: fI(r.iMin), p: fP(r.p) })),
    note:
      s.iMax != null
        ? 'Red: above the absolute maximum current, or max-Vf parts may not light. Yellow: above 80 % of the maximum, or max-Vf parts get under half the typical current.'
        : 'Red: max-Vf parts may not light. Yellow: max-Vf parts get under half the typical current. Enter the absolute maximum current to check it too.',
  };
}

function graphs(s: LedState, n: number, vf: number, vfMax: number, iMax: number | null, r: number, iOp: number): GraphSpec[] {
  const lim = iMax != null ? [{ value: iMax, label: `abs max ${fI(iMax)}`, axis: 'i', color: '#8b1e1e', dash: [6, 4] }] : [];
  const tgt = s.solveFor === 'iF' ? [] : [{ value: s.iF, label: `target ${fI(s.iF)}`, axis: 'i', color: '#9a8f7a', dash: [3, 3] }];
  // 1 — current vs supply voltage
  const v0 = n * vf * 0.95;
  const v1 = Math.max(s.vs * 1.6, n * vfMax * 1.3);
  const vs = Array.from({ length: 201 }, (_, k) => v0 + ((v1 - v0) * k) / 200);
  const g1: GraphSpec = {
    id: 'i-vs-supply',
    title: 'Current vs supply',
    subtitle: `R = ${fR(r, 3)}`,
    x: { label: 'Supply voltage', unit: 'V' },
    y: [{ id: 'i', label: 'LED current', unit: 'A', includeZero: true }],
    series: [
      { label: `Vf typ ${fV(vf, 3)}`, x: vs, y: vs.map((v) => ledCurrent(v, n, vf, r)), axis: 'i', width: 2.2 },
      ...(vfMax > vf ? [{ label: `Vf max ${fV(vfMax, 3)}`, x: vs, y: vs.map((v) => ledCurrent(v, n, vfMax, r)), axis: 'i', color: '#c47b17', width: 1.5, dash: [5, 3] }] : []),
    ],
    hlines: [...tgt, ...lim],
    vlines: [{ value: s.vs, label: `Vs = ${fV(s.vs, 3)}`, color: '#9a8f7a' }],
    markers: [{ x: s.vs, y: iOp, axis: 'i', label: fI(iOp) }],
  };
  // 2 — current vs forward voltage (part-to-part spread)
  const f0 = vf * 0.85;
  const f1 = Math.min(Math.max(vfMax * 1.1, vf * 1.2), s.vs / n);
  const fs = Array.from({ length: 161 }, (_, k) => f0 + ((f1 - f0) * k) / 160);
  const g2: GraphSpec = {
    id: 'i-vs-vf',
    title: 'Current vs Vf spread',
    subtitle: `Vs = ${fV(s.vs, 3)}, R = ${fR(r, 3)}`,
    x: { label: 'Forward voltage per LED', unit: 'V' },
    y: [{ id: 'i', label: 'LED current', unit: 'A', includeZero: true }],
    series: [{ label: 'I_F', x: fs, y: fs.map((v) => ledCurrent(s.vs, n, v, r)), axis: 'i', width: 2.2 }],
    hlines: [...tgt, ...lim],
    vlines: [{ value: vf, label: 'typ', color: '#9a8f7a' }, ...(vfMax > vf ? [{ value: vfMax, label: 'max', color: '#c47b17', dash: [4, 3] }] : [])],
  };
  return [g1, g2];
}

export const def: CalcDef<LedState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Kirchhoff loop Vs = n·Vf + I·R with a constant-forward-voltage LED model (Horowitz & Hill, Art of Electronics 3e, ch. 1 & ch. 12 LED indicators), solved exactly for R, I_F or Vs; typical/maximum Vf presets from Kingbright WP7113-series datasheets; IEC 60063 preferred values; resistor rating with 2× power margin.',
  fields,
  defaults,
  solve: {
    default: 'r',
    analysis: 'iF',
    options: [
      { key: 'r', label: 'Resistor for a target current' },
      { key: 'iF', label: 'Current from a given resistor' },
      { key: 'vs', label: 'Supply needed for R and I_F' },
    ],
  },
  compute,
  sync: (s) => {
    const p = LED_PRESETS[s.led];
    if (p && (Math.abs(p.vf - s.vf) > 1e-9 || Math.abs(p.vfMax - s.vfMax) > 1e-9 || s.iMax == null || Math.abs(p.iMax - s.iMax) > 1e-12)) s.led = 'Custom';
  },
  examples: [
    { id: 'red-5v', label: 'Red indicator LED on 5 V at 10 mA', state: defaults() },
    { id: 'white-5v', label: 'White LED on 5 V USB at 5 mA (Vf spread matters)', state: { solveFor: 'r', vs: 5, n: 1, strings: 1, led: 'White (InGaN + phosphor)', vf: 3.3, vfMax: 4.0, iMax: 30e-3, iF: 5e-3, eseries: 'E24' } },
    { id: 'white-12v-3', label: '3 white LEDs in series on 12 V, 20 mA', state: { solveFor: 'r', vs: 12, n: 3, strings: 1, led: 'White (InGaN + phosphor)', vf: 3.3, vfMax: 4.0, iMax: 30e-3, iF: 20e-3, eseries: 'E24' } },
    { id: 'strip-24v', label: '24 V panel: 10 strings of 6 green (GaP) LEDs', state: { solveFor: 'r', vs: 24, n: 6, strings: 10, led: 'Green 568 nm (GaP)', vf: 2.0, vfMax: 2.4, iMax: 25e-3, iF: 15e-3, eseries: 'E24' } },
    { id: 'given-r', label: 'What current does 1 kΩ give a red LED on 12 V?', state: { solveFor: 'iF', vs: 12, n: 1, strings: 1, led: 'Red 617 nm (GaAsP)', vf: 1.9, vfMax: 2.3, iMax: 30e-3, r: 1e3, eseries: 'E24' } },
    { id: 'ir-pulse', label: 'IR emitter at its 50 mA limit from 5 V (margin warning)', state: { solveFor: 'r', vs: 5, n: 1, strings: 1, led: 'Infrared 880 nm peak', vf: 1.3, vfMax: 1.6, iMax: 50e-3, iF: 50e-3, eseries: 'E12' } },
  ],
};
