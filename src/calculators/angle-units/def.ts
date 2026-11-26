/** Angle unit converter — calculator definition (inputs, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec, NumberField } from '@/core/form/form';
import { type AngleUnit, convert, fromDms, norm180, norm360, quadrant, referenceAngle, toDms, trig } from './model';

export const ID = 'unit-conversion/angle-units';

export type Given = AngleUnit | 'dms';

export interface AngleState {
  /** Which unit the user typed (the input); every other unit is computed. */
  given: Given;
  deg: number;
  /** radians (SI); radUnit picks rad, mrad or µrad for display */
  rad: number;
  radUnit: string;
  grad: number;
  turn: number;
  arcmin: number;
  arcsec: number;
  mil: number;
  dmsSign: 1 | -1;
  dmsD: number;
  dmsM: number;
  dmsS: number;
}

export const defaults = (): AngleState => ({
  given: 'deg',
  deg: 30,
  rad: Math.PI / 6,
  radUnit: 'rad',
  grad: 100 / 3,
  turn: 1 / 12,
  arcmin: 1800,
  arcsec: 108000,
  mil: 1600 / 3,
  dmsSign: 1,
  dmsD: 30,
  dmsM: 0,
  dmsS: 0,
});

const UNITS: AngleUnit[] = ['deg', 'rad', 'grad', 'turn', 'arcmin', 'arcsec', 'mil'];
const NAME: Record<AngleUnit, string> = { deg: 'Degrees', rad: 'Radians', grad: 'Gradians (gon)', turn: 'Turns', arcmin: 'Arcminutes', arcsec: 'Arcseconds', mil: 'NATO mils' };
const SYM: Record<AngleUnit, string> = { deg: '°', rad: 'rad', grad: 'gon', turn: 'tr', arcmin: '′', arcsec: '″', mil: 'mil' };
/** Radian display units (the state holds radians). µrad so that arcsecond-sized angles read as 4.848 µrad. */
const RAD_UNITS: Record<string, number> = { rad: 1, mrad: 1e-3, 'µrad': 1e-6 };
/**
 * The unit the radians box will show. When radians are computed, the core (fitSolvedUnit in
 * core/calc/page.ts) moves the box to a readable prefix after this compute; the result card must use
 * the same unit or it would say “mrad” next to a box in µrad. Same rule: keep the current unit while
 * it shows 0.1 … 9999, else the largest unit showing 1 … 9999, else the one closest to 10.
 * A huge angle (±10⁶ turns ≈ ±6.3 Mrad) stays in rad with an exponent: there is no krad.
 */
export function radDisplayUnit(rad: number, cur: string): string {
  const u = RAD_UNITS[cur] ? cur : 'rad';
  const mant = (k: string) => Math.abs(rad / RAD_UNITS[k]);
  if (rad === 0 || (mant(u) >= 0.1 && mant(u) < 1e4)) return u;
  const keys = Object.keys(RAD_UNITS).sort((a, b) => RAD_UNITS[b] - RAD_UNITS[a]);
  return keys.find((k) => mant(k) >= 1 && mant(k) < 1e4) ?? keys.sort((a, b) => Math.abs(Math.log10(mant(a)) - 1) - Math.abs(Math.log10(mant(b)) - 1))[0];
}
/** Input limits: ±10⁶ turns in every unit. */
const LIM = 1e6;

/** Make `key` the input when its ◎ is clicked while computed; clicking the input’s own ◎ hands over to degrees (or radians). */
const asInput = (key: Given): Pick<NumberField, 'solvable' | 'solvedWhen' | 'onSolve' | 'onUnsolve' | 'digits'> => ({
  solvable: true,
  // the computed rows are the answer of a converter: show them to 12 significant digits
  digits: 12,
  solvedWhen: (_s, root) => root.given !== key,
  onSolve: (_s, root) => (root.given = key === 'deg' ? 'rad' : 'deg'),
  onUnsolve: (_s, root) => (root.given = key),
});

const unitField = (u: AngleUnit, label: string, help: string, extra: Partial<NumberField> = {}): NumberField => ({
  kind: 'number',
  key: u,
  symbol: `θ_${u === 'arcmin' ? 'min' : u === 'arcsec' ? 'sec' : u}`,
  label,
  min: -LIM * convert(1, 'turn', u),
  max: LIM * convert(1, 'turn', u),
  help,
  ...asInput(u),
  ...extra,
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Angle',
    note: 'One unit is the input (white); click ◎ on any green row to type in that unit instead.',
    fields: [
      unitField('deg', 'Degrees', '360° in a turn. 1° = π/180 rad exactly (BIPM SI Brochure, Table 8).', { suffix: '°' }),
      unitField('rad', 'Radians', 'SI coherent unit: 2π rad in a turn. When radians are computed, a very small or large value moves to mrad or µrad so it stays readable; when you type radians, pick the unit yourself (1 mrad = 0.0573°).', { units: RAD_UNITS, unitKey: 'radUnit', unitFamily: 'none' }),
      unitField('grad', 'Gradians (gon)', '400 gon in a turn, so a right angle is 100 gon. Used in surveying (ISO 80000-3 “gon”).', { suffix: 'gon' }),
      unitField('turn', 'Turns', 'Revolutions: 1 turn = 360°.', { suffix: 'tr' }),
      unitField('arcmin', 'Arcminutes', '1′ = 1/60° (21 600′ in a turn).', { suffix: '′' }),
      unitField('arcsec', 'Arcseconds', '1″ = 1/60′ = 1/3600° ≈ 4.848 µrad.', { suffix: '″' }),
      unitField('mil', 'NATO mils', 'NATO mil: 6400 mils in a turn (1° ≈ 17.78 mil). Not the 6000 (Warsaw Pact) or 6300 (Swedish) mil, and not the true milliradian (use radians → mrad for that).', { suffix: 'mil' }),
    ],
  },
  {
    kind: 'section',
    title: 'Degrees, minutes, seconds',
    note: 'Sign, whole degrees, whole minutes, decimal seconds.',
    fields: [
      { kind: 'select', key: 'dmsSign', label: 'Sign', options: [{ value: 1, label: '+ (positive)' }, { value: -1, label: '− (negative)' }], enabled: (_s, root) => root.given === 'dms', help: 'Sign of the whole angle (so −0° 30′ can be written). Editable when DMS is the input.' },
      { kind: 'number', key: 'dmsD', symbol: 'D', label: 'Degrees', suffix: '°', integer: true, min: 0, max: LIM * 360, ...asInput('dms'), help: 'Whole degrees (no sign; use the Sign row).' },
      { kind: 'number', key: 'dmsM', symbol: 'M', label: 'Minutes', suffix: '′', integer: true, min: 0, max: 59, ...asInput('dms'), help: 'Whole arcminutes, 0–59.' },
      { kind: 'number', key: 'dmsS', symbol: 'S', label: 'Seconds', suffix: '″', min: 0, max: 59.999999999, ...asInput('dms'), help: 'Arcseconds, 0 to just under 60, decimals allowed.' },
    ],
  },
];

/** Plain number with up to 10 significant digits and a real minus sign. */
export function fmtNum(v: number, digits = 10): string {
  if (v === 0 || Object.is(v, -0)) return '0';
  const a = Math.abs(v);
  const s = a < 1e-5 || a >= 1e10 ? v.toExponential(digits - 1).replace(/\.?0+e/, 'e') : String(Number(v.toPrecision(digits)));
  return s.replace(/-/g, '−');
}

/** D° MM′ SS.ssssss″: the seconds are rounded to 6 decimals first and then carried, so 60″ never appears; a zero angle has no sign. */
export function dmsText(d: { sign: number; d: number; m: number; s: number }): string {
  let deg = d.d;
  let min = d.m;
  let sec = Math.round(d.s * 1e6) / 1e6;
  if (sec >= 60) {
    sec = 0;
    min += 1;
  }
  if (min >= 60) {
    min -= 60;
    deg += 1;
  }
  const zero = deg === 0 && min === 0 && sec === 0;
  return `${d.sign < 0 && !zero ? '−' : ''}${deg}° ${String(min).padStart(2, '0')}′ ${sec < 10 ? '0' : ''}${sec}″`;
}

/** A 0–360° value just below 360 would print as “360” at 10 digits: show up to 15 digits instead. */
const deg360 = (v: number) => [10, 15, 17].map((d) => fmtNum(v, d)).find((t) => t !== '360') ?? '359.99999999999994';

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

/** The input angle in degrees, from whichever unit is given. */
export function inputDegrees(s: AngleState): number {
  if (s.given === 'dms') {
    const d = finite('DMS degrees', s.dmsD);
    const m = finite('DMS minutes', s.dmsM);
    const sec = finite('DMS seconds', s.dmsS);
    if (d < 0 || m < 0 || sec < 0) throw new Error('Degrees, minutes and seconds must be ≥ 0; set the sign with the Sign row.');
    if (m >= 60) throw new Error('Minutes must be below 60 (carry 60′ into the degrees).');
    if (sec >= 60) throw new Error('Seconds must be below 60 (carry 60″ into the minutes).');
    if (s.dmsSign !== 1 && s.dmsSign !== -1) throw new Error('DMS sign must be +1 or −1.');
    return fromDms({ sign: s.dmsSign, d, m, s: sec });
  }
  if (!UNITS.includes(s.given)) throw new Error(`Unknown input unit "${String(s.given)}".`);
  return convert(finite(NAME[s.given], s[s.given]), s.given, 'deg');
}

export function compute(st: AngleState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return errorReport(ID, e);
  }
}

function run(s: AngleState): CalcReport {
  const deg = inputDegrees(s);
  const turns = deg / 360;
  if (Math.abs(turns) > LIM * (1 + 1e-12)) throw new Error(`The angle is limited to ±${LIM.toExponential(0)} turns.`);
  // Convert from the given unit directly (one exact ratio), not via degrees, so 1 rad → 57.29577951…° and back is exact.
  const val = (u: AngleUnit) => (s.given === 'dms' ? convert(deg, 'deg', u) : convert(s[s.given], s.given, u));
  const v = Object.fromEntries(UNITS.map((u) => [u, s.given === u ? s[u] : val(u)])) as Record<AngleUnit, number>;
  const dms = s.given === 'dms' ? { sign: s.dmsSign, d: s.dmsD, m: s.dmsM, s: s.dmsS } : toDms(v.deg);
  const n360 = norm360(v.deg);
  const n180 = norm180(v.deg);
  const t = trig(v.deg);
  const q = quadrant(n360);
  // whole turns k with θ = θ₀₋₃₆₀ + 360°·k, taken from the same reduction as θ₀₋₃₆₀ so the two always agree
  const kTurns = Math.round((v.deg - n360) / 360) || 0;

  const report: CalcReport = { ...emptyReport(ID) };
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const solved = (u: Given) => s.given !== u;
  const radUnit = s.given === 'rad' ? (RAD_UNITS[s.radUnit] ? s.radUnit : 'rad') : radDisplayUnit(v.rad, s.radUnit);
  const unitItem = (u: AngleUnit, extra: Partial<ResultItem> = {}) =>
    item(u, NAME[u], v[u], u === 'rad' ? 'rad' : SYM[u], u === 'rad' && radUnit !== 'rad' ? `${fmtNum(v.rad / RAD_UNITS[radUnit])} ${radUnit}` : `${fmtNum(v[u])} ${SYM[u]}`.replace(' °', '°').replace(' ′', '′').replace(' ″', '″'), {
      solved: solved(u),
      group: 'All units',
      ...extra,
    });

  const dmsStr = dmsText(dms);
  report.results = [
    unitItem('deg', { primary: true, symbol: 'θ', group: undefined, note: s.given === 'deg' ? 'input' : undefined }),
    unitItem('rad', { primary: true, symbol: 'θ', group: undefined, note: `${fmtNum(v.rad / Math.PI, 8)}·π rad` }),
    item('dms', 'Degrees, minutes, seconds', dmsStr, '', dmsStr, { primary: true, tone: s.given === 'dms' ? '' : 'solved', note: s.given === 'dms' ? 'input' : 'D° M′ S″' }),
    item('norm180', 'Normalised ±180°', n180, '°', `${fmtNum(n180)}°`, { primary: true, symbol: 'θ_n', note: `${deg360(n360)}° on 0–360°` }),
    unitItem('grad'),
    unitItem('turn'),
    unitItem('arcmin'),
    unitItem('arcsec'),
    unitItem('mil', { note: '6400 per turn' }),
    item('norm360', 'Normalised 0–360°', n360, '°', `${deg360(n360)}°`, { group: 'Normalised', symbol: 'θ mod 360°' }),
    item('wholeTurns', 'Whole turns removed', kTurns, 'tr', `${fmtNum(kTurns)}`, { group: 'Normalised', note: 'θ = θ₀₋₃₆₀ + 360°·k' }),
    item('quadrant', 'Quadrant', q, '', q === 0 ? 'on an axis' : ['I', 'II', 'III', 'IV'][q - 1], { group: 'Normalised' }),
    item('refAngle', 'Reference angle', referenceAngle(v.deg), '°', `${fmtNum(referenceAngle(v.deg))}°`, { group: 'Normalised', note: 'acute angle to the x axis' }),
    item('sin', 'sin θ', t.sin, '', fmtNum(t.sin, 12), { group: 'Trigonometry', symbol: 'sin' }),
    item('cos', 'cos θ', t.cos, '', fmtNum(t.cos, 12), { group: 'Trigonometry', symbol: 'cos' }),
    item('tan', 'tan θ', t.tan, '', t.tan == null ? 'not defined (cos θ = 0)' : fmtNum(t.tan, 12), { group: 'Trigonometry', symbol: 'tan' }),
  ];
  report.summary = `${fmtNum(v.deg)}° = ${fmtNum(v.rad)} rad = ${dmsStr} · input in ${s.given === 'dms' ? 'DMS' : NAME[s.given].toLowerCase()}`;
  if (Math.abs(turns) > 1e4) report.warnings.push(`The angle is ${fmtNum(Math.abs(turns), 4)} turns: reducing it to 0–360° costs about ${Math.max(1, Math.round(Math.log10(Math.abs(turns))))} significant digits of the input. Enter the angle already reduced if you need the last digits of the normalised value.`);
  if (t.tan == null) report.notes.push('tan θ is undefined at odd multiples of 90° (cos θ = 0).');
  if (s.given !== 'dms' && dms.s !== Number(dms.s.toFixed(6))) report.notes.push('Seconds are shown to 6 decimals (≈ 5 pico-degrees); the full value is in the Seconds field.');
  report.notes.push('Mils are NATO mils (6400 per turn). One true milliradian is 1/1000 rad (6283.19 per turn): use radians in mrad for that.');
  report.details = { turns, ...v, dms, norm360: n360, norm180: n180, ...t };
  report.graphs = [trigGraph(n360, t)];
  return report;
}

function trigGraph(n360: number, t: { sin: number; cos: number }): GraphSpec {
  const xs = Array.from({ length: 361 }, (_, i) => i);
  const tr = xs.map((x) => trig(x));
  return {
    id: 'trig',
    title: 'sin θ and cos θ',
    x: { label: 'Angle θ (normalised)', unit: '°' },
    y: [{ id: 'y', label: 'Value', unit: '', min: -1.1, max: 1.1 }],
    series: [
      { label: 'sin θ', x: xs, y: tr.map((v) => v.sin), axis: 'y', color: '#1f4e5f', width: 2 },
      { label: 'cos θ', x: xs, y: tr.map((v) => v.cos), axis: 'y', color: '#c47b17', width: 2 },
    ],
    vlines: [{ value: n360, label: `θ = ${fmtNum(n360, 6)}°`, color: '#4f8a8b' }],
    // no marker labels: at 45° and 225° they would sit on top of each other (values are in the readout and the Results tab)
    markers: [
      { x: n360, y: t.sin, axis: 'y', color: '#1f4e5f' },
      { x: n360, y: t.cos, axis: 'y', color: '#c47b17' },
    ],
    xRange: [0, 360],
  };
}

/** Write the DMS parts back when DMS is not the input (they are three inputs, not one result key). */
function sync(s: AngleState): void {
  if (s.given === 'dms') return;
  try {
    const d = toDms(inputDegrees(s));
    s.dmsSign = d.sign;
    s.dmsD = d.d;
    s.dmsM = d.m;
    s.dmsS = d.s;
  } catch {
    /* invalid input: leave the parts as they were */
  }
}

export const def: CalcDef<AngleState> = {
  id: ID,
  version: '0.1.0',
  method: 'Each unit is an exact fraction of a turn (360°, 2π rad, 400 gon, 21 600′, 1 296 000″, 6400 NATO mil): BIPM SI Brochure 9th ed. Table 8; ISO 80000-3:2019; US Army FM 3-25.26 ch. 6 (mils).',
  fields,
  defaults,
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = { ...d, ...(raw as object) } as AngleState;
    if (![...UNITS, 'dms'].includes(s.given)) s.given = 'deg';
    for (const k of Object.keys(d) as (keyof AngleState)[]) {
      if (typeof d[k] === 'number' && (typeof s[k] !== 'number' || !Number.isFinite(s[k] as number))) (s as any)[k] = d[k];
    }
    return s;
  },
  sync,
  compute,
  controls: { given: (raw) => {
    if (![...UNITS, 'dms'].includes(raw as string)) throw new Error(`given must be one of ${[...UNITS, 'dms'].join(', ')}`);
    return raw;
  } },
  examples: [
    { id: 'default', label: '30° in every unit', state: defaults() },
    { id: 'one-radian', label: '1 rad = 57.2958° (radians in)', state: { given: 'rad', rad: 1, radUnit: 'rad' } },
    { id: 'survey-dms', label: 'Bearing 123° 45′ 30″ (DMS in)', state: { given: 'dms', dmsSign: 1, dmsD: 123, dmsM: 45, dmsS: 30 } },
    { id: 'nato-mils', label: 'Azimuth 4800 NATO mil = 270°', state: { given: 'mil', mil: 4800 } },
    { id: 'normalise', label: 'Normalise −450° (wraps to −90°)', state: { given: 'deg', deg: -450 } },
    { id: 'arcsec', label: '1 arcsecond = 4.848 µrad', state: { given: 'arcsec', arcsec: 1, radUnit: 'µrad' } },
  ],
};
