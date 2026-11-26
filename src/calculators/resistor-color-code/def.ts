/** Resistor Color Code — calculator definition (decode / encode / SMD, report). DOM-free. */

import type { CalcDef, CalcReport, GraphRef, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM } from '@/core/unitsets';
import {
  DIGIT_COLORS, MULT_COLORS, SERIES, SERIES_NAMES, TCR, TOL, decodeBands, decodeSmd, encodeValue, nearestIn, seriesOf, smd3, smd4, smdEia96, tcrColor, tolColor,
  type ColorName,
} from './model';

export const ID = 'general/resistor-color-code';

export type Mode = 'decode' | 'encode' | 'smd';

export interface RccState {
  /** decode: bands → value · encode: value → bands · smd: printed code → value */
  mode: Mode;
  bands: 3 | 4 | 5 | 6;
  d1: number;
  d2: number;
  d3: number;
  /** Multiplier exponent (−3 … 9) */
  mult: number;
  /** Tolerance, % */
  tol: number;
  /** Temperature coefficient, ppm/K (6-band) */
  tcr: number;
  r: number;
  rUnit: string;
  code: string;
  eseries: string;
  /** Value before rounding to fewer bands (set by a band-count switch in decode; warns while it still applies) */
  roundedFrom: number | null;
}

export const defaults = (): RccState => ({
  mode: 'decode',
  bands: 4,
  d1: 4,
  d2: 7,
  d3: 0,
  mult: 2,
  tol: 5,
  tcr: 100,
  r: 4700,
  rUnit: 'kΩ',
  code: '472',
  eseries: 'E24',
  roundedFrom: null,
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MULT_TXT: Record<number, string> = { [-3]: '×0.001', [-2]: '×0.01', [-1]: '×0.1', 0: '×1', 1: '×10', 2: '×100', 3: '×1k', 4: '×10k', 5: '×100k', 6: '×1M', 7: '×10M', 8: '×100M', 9: '×1G' };
export const multText = (e: number) => MULT_TXT[e] ?? `×10^${e}`;
const pctText = (p: number) => `±${p} %`;
const U_R = { ...U_OHM, 'GΩ': 1e9 };
const nDigits = (b: number) => (b >= 5 ? 3 : 2);

// Mode-switch harness: changing a band colour or the band count in decode mode changes the value by design (the
// reading changes), so its 'big-jump' flags are expected.

/**
 * Set the band selects from the value (switching into decode, or changing the band count there). A value with more
 * significant digits than the chosen bands can show is rounded, never silently moved to another band count: the
 * unrounded value is kept in `roundedFrom` so compute can warn, and going back to 5/6 bands restores it.
 */
function bandsFromValue(root: Record<string, any>): void {
  let r = root.r as number;
  if (!(r > 0)) return;
  const n = nDigits(root.bands) as 2 | 3;
  const prev = root.roundedFrom as number | null | undefined;
  if (n === 3 && prev != null && prev > 0) {
    const back = encodeValue(prev, 2);
    if (back && Math.abs(back.value - r) <= 1e-9 * r) r = prev; // 5 → 4 → 5 bands returns to the original value
  }
  const e = encodeValue(r, n);
  if (!e) return; // out of the band range: the bands stay; compute says why
  root.roundedFrom = n === 2 && Math.abs(e.value - r) > 1e-9 * r ? r : null;
  root.d1 = e.digits[0];
  root.d2 = e.digits[1];
  if (n === 3) root.d3 = e.digits[2];
  root.mult = e.exp;
}
/** Code to show when switching into SMD mode: of the value as the bands code it, 3 characters when 2 digits suffice, else 4. */
function codeFromValue(root: Record<string, any>): void {
  const r = root.r as number;
  const coded = root.mode === 'encode' ? encodeValue(r, nDigits(root.bands) as 2 | 3)?.value ?? r : r;
  // a value with no marking (below R10 / above the code range) clears the code: never keep a stale one
  root.code = smd3(coded) ?? smd4(coded) ?? smd4(encodeValue(coded, 3)?.value ?? coded) ?? '';
}

const digitOpts = DIGIT_COLORS.map((c, i) => ({ value: i, label: `${cap(c)} · ${i}` }));
const decode = (s: Record<string, any>) => s.mode === 'decode';
const banded = (s: Record<string, any>) => s.mode !== 'smd';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Mode',
    fields: [
      {
        kind: 'select', key: 'mode', label: 'Read or make', structural: true,
        options: [
          { value: 'decode', label: 'Colour bands → value' },
          { value: 'encode', label: 'Value → colour bands' },
          { value: 'smd', label: 'SMD code → value' },
        ],
        apply: (v, _s, root) => {
          if (v === 'decode') bandsFromValue(root);
          if (v === 'smd') codeFromValue(root);
        },
        help: 'Decode a banded resistor, find the bands for a value, or read an SMD resistor’s printed code (3-digit, 4-digit or EIA-96).',
      },
      {
        kind: 'select', key: 'bands', label: 'Number of bands', visible: banded,
        options: [
          { value: 3, label: '3 bands (±20 %)' },
          { value: 4, label: '4 bands' },
          { value: 5, label: '5 bands (3 digits)' },
          { value: 6, label: '6 bands (+ TCR)' },
        ],
        apply: (_v, _s, root) => {
          if (root.mode === 'decode') bandsFromValue(root);
        },
        help: '3 and 4 bands give two significant digits (E6–E24 values); 5 and 6 bands give three (E48–E192). The 6th band is the temperature coefficient.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Bands',
    note: 'Read from the end with the bands bunched together; the tolerance band is set apart.',
    visible: banded,
    fields: [
      { kind: 'select', key: 'd1', label: '1st digit', visible: decode, options: digitOpts },
      { kind: 'select', key: 'd2', label: '2nd digit', visible: decode, options: digitOpts },
      { kind: 'select', key: 'd3', label: '3rd digit', visible: (s) => decode(s) && s.bands >= 5, options: digitOpts },
      { kind: 'select', key: 'mult', label: 'Multiplier', visible: decode, options: Object.entries(MULT_COLORS).map(([e, c]) => ({ value: Number(e), label: `${cap(c)} · ${multText(Number(e))}` })).sort((a, b) => a.value - b.value) },
      { kind: 'select', key: 'tol', label: 'Tolerance', visible: (s) => s.bands >= 4, options: TOL.filter((t) => t.pct !== 20).map((t) => ({ value: t.pct, label: `${cap(t.color)} · ${pctText(t.pct)}` })), help: 'IEC 60062 tolerance colours. In 3-band parts there is no tolerance band (±20 %).' },
      { kind: 'select', key: 'tcr', label: 'Temp. coefficient', visible: (s) => s.bands === 6, options: TCR.map((t) => ({ value: t.ppm, label: `${cap(t.color)} · ${t.ppm} ppm/K` })) },
    ],
  },
  {
    kind: 'section',
    title: 'Value',
    fields: [
      {
        kind: 'number', key: 'r', symbol: 'R', label: 'Resistance', units: U_R, unitKey: 'rUnit', solvable: true, min: 0, max: 1e12, digits: 6,
        solvedWhen: (_s, root) => root.mode !== 'encode',
        onSolve: (_s, root) => {
          root.mode = 'decode';
          bandsFromValue(root);
        },
        onUnsolve: (_s, root) => (root.mode = 'encode'),
        help: 'Decoded from the bands or the code (green), or typed to find its bands: click ◎ to switch.',
      },
      { kind: 'text', key: 'code', label: 'SMD code', visible: (s) => s.mode === 'smd', maxLength: 6, help: '3 digits (472 = 4.7 kΩ), 4 digits (4702 = 47 kΩ), R as the decimal point (4R7, R47, 10R0), or EIA-96: two digits and a letter (01C = 10 kΩ).' },
      { kind: 'select', key: 'eseries', label: 'Compare with series', options: SERIES_NAMES.map((n) => ({ value: n, label: n })), help: 'IEC 60063 preferred-value series used for the nearest standard value.' },
    ],
  },
];

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const BAD_FIN = (v: unknown) => typeof v !== 'number' || !Number.isFinite(v);

export function compute(st: RccState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e) };
  }
}

interface Coding {
  colors: ColorName[];
  labels: string[];
  value: number;
}

function run(st: RccState): CalcReport {
  const s: RccState = { ...st };
  if (![3, 4, 5, 6].includes(Number(s.bands))) throw new Error('Number of bands must be 3, 4, 5 or 6.');
  s.bands = Number(s.bands) as RccState['bands'];
  const n = nDigits(s.bands);
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, status: { text: 'NO CODE', tone: 'fail' } });
  const warnings: string[] = [];
  const notes: string[] = [];
  const tolPct = s.bands === 3 ? 20 : s.tol;
  if (!TOL.some((t) => t.pct === tolPct)) throw new Error('Unknown tolerance.');
  if (s.bands === 6 && !TCR.some((t) => t.ppm === s.tcr)) throw new Error('Unknown temperature coefficient.');

  let value = s.r;
  let coding: Coding | null = null;
  let smdKind = '';
  let noCode = '';
  const bandsOf = (digits: number[], exp: number, nb: number = s.bands, tp: number = tolPct): Coding => {
    const colors: ColorName[] = [...digits.map((d) => DIGIT_COLORS[d]), MULT_COLORS[exp]];
    const labels = [...digits.map(String), multText(exp)];
    if (nb >= 4) {
      colors.push(tolColor(tp));
      labels.push(pctText(tp));
    }
    if (nb === 6) {
      colors.push(tcrColor(s.tcr));
      labels.push(`${s.tcr} ppm/K`);
    }
    return { colors, labels, value: decodeBands(digits, exp) };
  };

  if (s.mode === 'decode') {
    for (const k of ['d1', 'd2', 'd3', 'mult'] as const) if (BAD_FIN(s[k])) throw new Error('Pick a colour for every band.');
    const digits = n === 3 ? [s.d1, s.d2, s.d3] : [s.d1, s.d2];
    if (digits.some((d) => !Number.isInteger(d) || d < 0 || d > 9) || !MULT_COLORS[s.mult]) throw new Error('Pick a colour for every band.');
    coding = bandsOf(digits, s.mult);
    value = coding.value;
    s.r = value;
    if (n === 2 && s.roundedFrom != null && s.roundedFrom > 0 && Math.abs(s.roundedFrom - value) > 1e-9 * value && encodeValue(s.roundedFrom, 2)?.value === value) warnings.push(`${fR(s.roundedFrom, 6)} needs three significant digits: ${s.bands} bands show it rounded to ${fR(value, 4)}. Use 5 or 6 bands to keep the value.`);
    if (s.d1 === 0 && value > 0) warnings.push('The first band is black (0), which makers do not use: you are probably reading the resistor backwards. Start from the other end (the tolerance band is usually gold, silver or set apart).');
  } else if (s.mode === 'encode') {
    if (BAD_FIN(s.r) || s.r < 0) throw new Error('Enter a resistance ≥ 0.');
    if (s.r === 0) {
      value = 0;
      coding = { colors: ['black'], labels: ['0 Ω'], value: 0 };
      notes.push('A zero-ohm jumper is marked with a single black band.');
    } else {
      const e = encodeValue(s.r, n as 2 | 3);
      // Out of the band range: a warning, not an error, so switching the band count never turns the page red
      if (!e) {
        value = s.r;
        noCode = `${fR(s.r)} cannot be coded with ${n} digits: the multiplier runs from pink (×0.001) to white (×1G), so ${n}-digit codes cover ${fR(n === 2 ? 0.01 : 0.1)} … ${fR(n === 2 ? 99e9 : 999e9)}.${n === 2 && s.r >= 0.1 && s.r <= 999e9 ? ' Use 5 bands.' : n === 3 && s.r >= 0.01 && s.r < 0.1 ? ' Use 4 bands.' : ''}`;
        warnings.push(noCode);
      } else {
        coding = bandsOf(e.digits, e.exp);
        value = e.value;
      }
      if (coding && Math.abs(value - s.r) > 1e-9 * s.r) {
        const e3 = n === 2 ? encodeValue(s.r, 3) : null;
        const fix = e3 && Math.abs(e3.value - s.r) <= 1e-9 * s.r ? ' Use 5 bands (three digits) to code it exactly.' : '';
        warnings.push(`${fR(s.r, 6)} has more significant digits than ${s.bands} bands can show: the bands code ${fR(value, 4)} (${(((value - s.r) / s.r) * 100).toFixed(2)} %).${fix}`);
      }
    }
  } else {
    let dec: ReturnType<typeof decodeSmd> | null = null;
    if (!String(s.code ?? '').trim()) {
      // no code (e.g. switched here from a value no marking can show): keep the value, say so, no red error
      value = s.r;
      noCode = `${fR(s.r)} has no SMD marking: the codes cover R100 (0.1 Ω) to 9999 (999 GΩ). Type a code to read one.`;
      warnings.push(noCode);
    } else try {
      dec = decodeSmd(s.code);
    } catch (err) {
      return fail((err as Error).message);
    }
    if (dec) {
      value = dec.value;
      s.r = value;
      smdKind = dec.description;
      if (dec.alt != null) warnings.push(`“${String(s.code).trim().toUpperCase()}” is ambiguous: read as ${fR(value)} (R as the decimal point), but as an EIA-96 code (R = ×0.01) it would be ${fR(dec.alt)}. EIA-96 parts normally use Y for ×0.01; check the part’s size and series.`);
      if (value > 0) {
        const e2 = encodeValue(value, 2);
        // 3-character codes are 2-digit (E24) parts; 4-character and EIA-96 codes are 3-digit precision parts
        const two = (dec.kind === '3-digit' || dec.kind === 'R-3') && e2 && Math.abs(e2.value - value) <= 1e-9 * value;
        const e = two ? e2! : encodeValue(value, 3);
        // equivalent banded part: 4 bands ±5 % for a 2-digit value, 5 bands ±1 % for a 3-digit one
        if (e) coding = two ? bandsOf(e.digits, e.exp, 4, 5) : bandsOf(e.digits, e.exp, 5, 1);
      } else coding = { colors: ['black'], labels: ['0 Ω'], value: 0 };
      if (dec.kind === '3-digit' || dec.kind === 'R-3') notes.push('3-character codes are used on E24 parts, usually ±5 % (sometimes ±1 % on E24 values); the marking itself carries no tolerance.');
      else if (dec.kind === '4-digit' || dec.kind === 'R-4' || dec.kind === 'EIA-96') notes.push('4-character and EIA-96 codes mark precision parts, usually ±1 % or better; the marking itself carries no tolerance.');
      if (dec.kind === 'EIA-96') notes.push('EIA-96 letters: Z ×0.001, Y or R ×0.01, X or S ×0.1, A ×1, B or H ×10, C ×100, D ×1k, E ×10k, F ×100k.');
    }
  }

  const t = s.mode === 'smd' || value === 0 ? null : tolPct;
  const results: ResultItem[] = [];
  const item = (key: string, label: string, v: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value: v, unit, display, ...extra });
  const colorTxt = coding ? coding.colors.map(cap).join(' · ') : '—';
  // the value judged: what the bands or code say, or (encode) the value typed, before any rounding
  const ref = s.mode === 'encode' ? s.r : value;
  const inSeries = seriesOf(ref);
  const near = ref > 0 ? nearestIn(ref, s.eseries) : null;
  const isStd = inSeries.length > 0;

  results.push(item(s.mode === 'encode' ? 'coded' : 'r', s.mode === 'encode' ? 'Value coded' : 'Resistance', noCode ? null : value, 'Ω', noCode ? '— (no code)' : fR(value, 6), {
    symbol: 'R', primary: true, solved: s.mode !== 'encode',
    note: s.mode === 'smd' ? smdKind : t != null ? `${pctText(t)}${s.bands === 6 ? ` · ${s.tcr} ppm/K` : ''}` : undefined,
  }));
  // in encode mode R is the typed input: give the bands their own key so the API reads them
  results.push(item('colors', s.mode === 'smd' ? 'Equivalent colour bands' : 'Colour bands', colorTxt, '', colorTxt, { primary: true, note: coding ? coding.labels.join(' · ') : undefined }));
  if (t != null) results.push(item('range', 'Tolerance range', value * (1 - t / 100), 'Ω', `${fR(value * (1 - t / 100))} … ${fR(value * (1 + t / 100))}`, { primary: true, note: pctText(t) }));
  results.push(item('standard', 'Standard value?', inSeries.join(' '), '', ref === 0 ? 'jumper' : isStd ? `yes: ${inSeries.join(', ')}` : 'no', {
    primary: true, tone: ref === 0 ? '' : isStd ? 'pass' : 'warn',
    note: near && !inSeries.includes(s.eseries) ? `nearest ${s.eseries}: ${fR(near.near, 3)} (${(((near.near - ref) / ref) * 100).toFixed(2)} %)` : s.mode === 'encode' && ref !== value ? `for ${fR(ref, 6)} as typed` : undefined,
  }));
  if (ref > 0 && !isStd) warnings.push(`${fR(ref, 6)} is not in any IEC 60063 series (E6 … E192): ${s.mode === 'encode' ? 'it will be a special-order part' : 'check the reading, or expect a special-order part'}. Nearest ${s.eseries}: ${fR(near!.near, 3)}.`);
  if (t != null && ref > 0 && isStd) {
    // a tolerance tighter than its series step is normal; a series finer than the tolerance suggests a misread band
    const coarsest = inSeries[0];
    const stepPct = { E6: 20, E12: 10, E24: 5, E48: 2, E96: 1, E192: 0.5 }[coarsest] ?? 0;
    if (stepPct < t && coarsest !== 'E24' && t >= 5) notes.push(`${coarsest} values are normally sold at ±${stepPct} % or better; ${pctText(t)} on a ${coarsest} value is unusual.`);
  }

  const g = 'Details';
  if (ref > 0 && near) {
    results.push(
      item('nearest', `Nearest ${s.eseries}`, near.near, 'Ω', fR(near.near, 3), { group: g, note: `${(((near.near - ref) / ref) * 100).toFixed(2)} % · below ${fR(near.below, 3)}, above ${fR(near.above, 3)}` }),
    );
  }
  if (t != null) results.push(item('tolPct', 'Tolerance', t, '%', `${pctText(t)} (${TOL.find((x) => x.pct === t)?.letter ?? ''})`, { group: g, note: 'IEC 60062 letter code' }));
  if (s.mode !== 'smd' && s.bands === 6) results.push(item('tcrPpm', 'Temperature coefficient', s.tcr, 'ppm/K', `${s.tcr} ppm/K`, { group: g, note: `ΔR ≈ ${fR((value * s.tcr * 100) / 1e6, 3)} per 100 K` }));
  const c3 = smd3(ref);
  const c4 = smd4(ref);
  const c96 = smdEia96(ref);
  results.push(item('smd', 'SMD markings', [c3, c4, c96].filter(Boolean).join(' '), '', [c3 && `${c3} (3-digit)`, c4 && `${c4} (4-digit)`, c96 && `${c96} (EIA-96)`].filter(Boolean).join(' · ') || '— (needs more digits)', { group: 'SMD code' }));
  if (value > 0 && value < 1 && s.mode !== 'smd') notes.push('Below 1 Ω the multiplier is gold (×0.1), silver (×0.01) or pink (×0.001, added in IEC 60062:2016 and rarely seen).');
  if (coding?.colors.includes('pink')) notes.push('Pink (×0.001) was added in IEC 60062:2016; older charts do not list it.');

  // table: the colour scheme for reference (data only, no verdicts)
  const rows: Record<string, number | string | null>[] = [];
  const disp: Record<string, string>[] = [];
  const order: ColorName[] = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white', 'gold', 'silver', 'pink', 'none'];
  for (const c of order) {
    const di = DIGIT_COLORS.indexOf(c);
    const me = Object.entries(MULT_COLORS).find(([, v]) => v === c);
    const to = TOL.find((x) => x.color === c);
    const tc = TCR.find((x) => x.color === c);
    rows.push({ color: c, digit: di >= 0 ? di : null, mult: me ? 10 ** Number(me[0]) : null, tol: to ? to.pct : null, tcr: tc ? tc.ppm : null });
    disp.push({ color: cap(c), digit: di >= 0 ? String(di) : '—', mult: me ? multText(Number(me[0])) : '—', tol: to ? `${pctText(to.pct)} ${to.letter}` : '—', tcr: tc ? `${tc.ppm}` : '—' });
  }
  const tables: TableSpec[] = [
    {
      id: 'iec60062',
      title: 'IEC 60062:2016 colour code',
      columns: [
        { key: 'color', label: 'Colour', align: 'left' },
        { key: 'digit', label: 'Digit' },
        { key: 'mult', label: 'Multiplier' },
        { key: 'tol', label: 'Tolerance', unit: '%' },
        { key: 'tcr', label: 'TCR', unit: 'ppm/K' },
      ],
      rows,
      display: disp,
      note: '“None” means no tolerance band (3-band parts, ±20 %).',
    },
  ];

  notes.push('Band colours on the drawing are approximate: real paints vary, and brown/red/orange or blue/violet/grey are easy to confuse under poor light. Measure when in doubt.');

  return {
    ...emptyReport(ID),
    ok: true,
    status: noCode ? { text: 'NO CODE', tone: 'warn' } : undefined,
    results,
    graphs: [ladder(ref, t, near?.near ?? null, s.eseries)],
    tables,
    warnings,
    notes,
    summary: `${fR(value, 6)}${t != null ? ` ${pctText(t)}` : ''} · ${colorTxt}`,
    details: { state: s, coding, series: inSeries },
  };
}

/** Where the value sits among the preferred values of every series (a comb per series), with its tolerance window. */
function ladder(value: number, t: number | null, near: number | null, series: string): GraphSpec {
  const c = value > 0 ? value : 3.16;
  const lo = c / 1.45;
  const hi = c * 1.45;
  const series_ = SERIES_NAMES.map((name, i) => {
    const xs: number[] = [];
    const ys: number[] = [];
    const y = i + 1;
    const d0 = Math.floor(Math.log10(lo));
    for (let d = d0; d <= d0 + 2; d++) for (const m of SERIES[name]) {
      const v = Number((m * 10 ** d).toPrecision(3));
      if (v < lo || v > hi) continue;
      xs.push(v, v, v);
      ys.push(y, y + 0.32, y);
    }
    // close the comb at the window edges so every series draws as a baseline with ticks
    return { label: name, x: [lo, ...xs, hi], y: [y, ...ys, y], width: name === series ? 1.8 : 1.1, color: name === series ? '#1f4e5f' : '#9a8f7a', noReadout: true };
  });
  const vlines: GraphRef[] = value > 0 ? [{ value, label: `R = ${fR(value, 4)}`, color: '#c47b17' }] : [];
  if (value > 0 && t != null) vlines.push({ value: value * (1 - t / 100), label: '', color: '#c47b17', dash: [4, 3] }, { value: value * (1 + t / 100), label: `±${t} %`, color: '#c47b17', dash: [4, 3] });
  return {
    id: 'ladder',
    title: 'Preferred values around R',
    subtitle: 'Ticks: E6 (bottom) … E192 (top) · dashed: tolerance window',
    x: { label: 'Resistance', unit: 'Ω', log: true },
    y: [{ id: 'y', label: 'Series (1 = E6 … 6 = E192)', unit: '', min: 0.5, max: 6.8 }],
    series: series_,
    vlines,
    markers: near != null && value > 0 ? [{ x: near, y: SERIES_NAMES.indexOf(series) + 1.32, label: `${series} ${fR(near, 3)}`, color: '#2f7d4f' }] : [],
    xRange: [lo, hi],
    legend: 'below',
  };
}

const D = defaults();

export const def: CalcDef<RccState> = {
  id: ID,
  version: '0.1.0',
  method: 'IEC 60062:2016 colour code (digits, multiplier pink ×0.001 … white ×10⁹, tolerance and TCR bands) and SMD markings (3-digit, 4-digit with R as decimal point, EIA-96 index + multiplier letter); standard values checked against the IEC 60063:2015 E6–E192 series.',
  fields,
  defaults,
  compute,
  examples: [
    { id: 'yvrg', label: 'Yellow-violet-red-gold: 4.7 kΩ ±5 %', state: { ...D } },
    { id: 'five', label: '5-band brown-black-black-red-brown: 10.0 kΩ ±1 %', state: { ...D, mode: 'decode', bands: 5, d1: 1, d2: 0, d3: 0, mult: 2, tol: 1, rUnit: 'kΩ' } },
    { id: 'six', label: '6-band 49.9 Ω ±0.1 %, 25 ppm/K (yellow-white-white-gold-violet-yellow)', state: { ...D, mode: 'decode', bands: 6, d1: 4, d2: 9, d3: 9, mult: -1, tol: 0.1, tcr: 25, rUnit: 'Ω' } },
    { id: 'encode', label: 'Bands for 2.2 Ω, 4 bands ±5 % (gold multiplier)', state: { ...D, mode: 'encode', bands: 4, r: 2.2, rUnit: 'Ω', tol: 5 } },
    { id: 'smd-eia', label: 'SMD EIA-96 code 01C = 10.0 kΩ', state: { ...D, mode: 'smd', code: '01C', r: 10e3, rUnit: 'kΩ', eseries: 'E96' } },
    { id: 'nonstd', label: 'Edge case: blue-blue-red-gold = 6.6 kΩ, not a standard value (misread?)', state: { ...D, mode: 'decode', bands: 4, d1: 6, d2: 6, d3: 0, mult: 2, tol: 5, rUnit: 'kΩ' } },
  ],
};
