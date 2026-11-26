/** Frequency ppm tolerance — calculator definition (converter + error budget + link check). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, withDefault } from '@/core/unitsets';
import { type Interval, ageing, fToPpm, hzToPpm, minPerYear, parabolic, parabolicRange, pctToPpm, ppmToF, ppmToHz, ppmToPct, secPerDay, sumRss, sumWorst, uartMaxMismatch } from './model';

export const ID = 'general/frequency-ppm-tolerance';

export type Given = 'offPpm' | 'offHz' | 'offPct' | 'fMeas';
export type TempModel = 'range' | 'parabolic' | 'none';
export type Link = 'none' | 'uart' | 'usbLs' | 'usbFs' | 'usbHs' | 'custom';

export interface PpmState {
  f0: number;
  f0Unit: string;
  given: Given;
  offPpm: number;
  offHz: number;
  offHzUnit: string;
  offPct: number;
  fMeas: number;
  fMeasUnit: string;
  init: number;
  tempModel: TempModel;
  tempPpm: number;
  beta: number;
  t0: number;
  tmin: number;
  tmax: number;
  aging1: number;
  agingN: number;
  years: number;
  link: Link;
  /** ± ppm of the other end of the link */
  other: number;
  /** custom limit on the total mismatch, ± ppm */
  limit: number;
}

export const defaults = (): PpmState => ({
  f0: 16e6,
  f0Unit: 'MHz',
  given: 'offPpm',
  offPpm: 50,
  offHz: 800,
  offHzUnit: 'Hz',
  offPct: 0.005,
  fMeas: 16.0008e6,
  fMeasUnit: 'MHz',
  init: 20,
  tempModel: 'range',
  tempPpm: 30,
  beta: 0.034,
  t0: 25,
  tmin: -40,
  tmax: 85,
  aging1: 3,
  agingN: 1,
  years: 5,
  link: 'uart',
  other: 10000,
  limit: 100,
});

const U_F = { ...withDefault(U_FREQ, 'MHz') };
const U_DF: Record<string, number> = { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9, mHz: 1e-3, 'µHz': 1e-6 };
const U_FM: Record<string, number> = { MHz: 1e6, kHz: 1e3, Hz: 1, GHz: 1e9 };

/** Field limits; the USB figures are USB 2.0 §7.1.11 data-rate tolerances (per device). */
export const LINKS: { value: Link; label: string }[] = [
  { value: 'none', label: 'No link check' },
  { value: 'uart', label: 'UART 8N1, 16× sampling (both ends)' },
  { value: 'usbLs', label: 'USB low-speed device (±1.5 %)' },
  { value: 'usbFs', label: 'USB full-speed device (±0.25 %)' },
  { value: 'usbHs', label: 'USB high speed (±500 ppm)' },
  { value: 'custom', label: 'Custom mismatch limit' },
];
const USB: Partial<Record<Link, number>> = { usbLs: 15000, usbFs: 2500, usbHs: 500 };

const conv = (key: Given, sym: string, label: string, extra: Record<string, unknown>, help: string): FieldSpec =>
  ({
    kind: 'number',
    key,
    symbol: sym,
    label,
    solvable: true,
    digits: 12,
    solvedWhen: (_s: unknown, r: Record<string, any>) => r.given !== key,
    onSolve: (_s: unknown, r: Record<string, any>) => (r.given = key === 'offPpm' ? 'offHz' : 'offPpm'),
    onUnsolve: (_s: unknown, r: Record<string, any>) => (r.given = key),
    help,
    ...extra,
  }) as FieldSpec;

const tempVisible = (_s: unknown, r: Record<string, any>) => r.tempModel !== 'none';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Convert',
    note: 'Type an offset in any form; ◎ marks the ones computed from it.',
    fields: [
      { kind: 'number', key: 'f0', symbol: 'f₀', label: 'Nominal frequency', units: U_F, unitKey: 'f0Unit', unitFamily: 'none', min: 1, max: 300e9 },
      conv('offPpm', 'Δf/f', 'Offset in ppm', { suffix: 'ppm', min: -1e6, max: 1e21 /* f up to 1 PHz on f₀ = 1 Hz */ }, 'Parts per million of f₀: 1 ppm = 0.0001 % = 1 µs per second.'),
      conv('offHz', 'Δf', 'Offset in hertz', { units: U_DF, unitKey: 'offHzUnit', unitFamily: 'none', min: -300e9, max: 1e15 }, 'Δf = f − f₀.'),
      conv('offPct', 'Δf/f', 'Offset in percent', { suffix: '%', min: -100, max: 1e17 }, '1 % = 10 000 ppm.'),
      conv('fMeas', 'f', 'Actual frequency', { units: U_FM, unitKey: 'fMeasUnit', unitFamily: 'none', min: 0, max: 1e15 }, 'Measured or expected frequency: type a counter reading here to get its ppm error.'),
    ],
  },
  {
    kind: 'section',
    title: 'Error budget',
    fields: [
      { kind: 'number', key: 'init', symbol: 'a', label: 'Initial tolerance', suffix: '± ppm', min: 0, max: 1e6, help: 'Calibration tolerance at 25 °C (crystal data sheet: ±10, ±20, ±30 ppm …; TCXO ±0.5–2 ppm; RC oscillators ±1–3 % = 10 000–30 000 ppm).' },
      {
        kind: 'select',
        key: 'tempModel',
        label: 'Temperature',
        options: [
          { value: 'range', label: '± ppm over a range (AT-cut, oscillator)' },
          { value: 'parabolic', label: 'Tuning fork −β(T − T₀)² (32 kHz)' },
          { value: 'none', label: 'Not included' },
        ],
        help: 'MHz AT-cut crystals and oscillators specify a ± stability over the operating range. 32.768 kHz tuning forks follow a downward parabola about the turnover temperature T₀: always slow away from it.',
      },
      { kind: 'number', key: 'tempPpm', symbol: 'b', label: 'Stability over range', suffix: '± ppm', min: 0, max: 1e6, visible: (_s, r) => r.tempModel === 'range', help: 'Frequency stability over the operating temperature range, relative to 25 °C (data sheet).' },
      { kind: 'number', key: 'beta', symbol: 'β', label: 'Parabolic coefficient', suffix: 'ppm/°C²', min: 0, max: 1, visible: (_s, r) => r.tempModel === 'parabolic', help: 'Magnitude of the tuning-fork coefficient: 0.034 ppm/°C² is the common figure; Abracon ABS07 gives 0.036 typical, 0.040 maximum.' },
      { kind: 'number', key: 't0', symbol: 'T₀', label: 'Turnover temperature', suffix: '°C', min: -100, max: 200, visible: (_s, r) => r.tempModel === 'parabolic', help: 'Peak of the parabola: 25 ± 5 °C for most tuning forks.' },
      { kind: 'number', key: 'tmin', symbol: 'T_min', label: 'Lowest temperature', suffix: '°C', min: -273, max: 500, visible: tempVisible },
      { kind: 'number', key: 'tmax', symbol: 'T_max', label: 'Highest temperature', suffix: '°C', min: -273, max: 500, visible: tempVisible },
      { kind: 'number', key: 'aging1', symbol: 'A₁', label: 'Ageing, first year', suffix: '± ppm', min: 0, max: 1e4, help: 'Data-sheet ageing in the first year (±3 ppm is typical for crystals, ±1 ppm for TCXOs).' },
      { kind: 'number', key: 'agingN', symbol: 'A_n', label: 'Ageing, per later year', suffix: '± ppm', min: 0, max: 1e4, help: 'Ageing per year after the first; ageing slows down, so this is usually a third to half of A₁. Enter 0 to ignore. Within each year the page interpolates linearly (real ageing is roughly logarithmic in time).' },
      { kind: 'number', key: 'years', symbol: 't', label: 'Service life', suffix: 'years', min: 0, max: 100 },
    ],
  },
  {
    kind: 'section',
    title: 'Link check',
    fields: [
      { kind: 'select', key: 'link', label: 'Interface', options: LINKS, help: 'UART: the two ends together must stay within (½ − 1/16)/9.5 = 4.6 % (8N1, 16× oversampling). USB: each device’s own clock must meet the data-rate tolerance of USB 2.0 §7.1.11 (low/full-speed device values; hosts and hubs need ±0.05 % = 500 ppm). Custom: a limit on the total mismatch of both ends.' },
      { kind: 'number', key: 'other', symbol: 'b_2', label: 'Other end', suffix: '± ppm', min: 0, max: 1e6, visible: (_s, r) => r.link === 'uart' || r.link === 'custom', help: 'Worst-case error of the other side’s clock (e.g. ±10 000 ppm for an MCU internal RC oscillator, ±50 ppm for a crystal).' },
      { kind: 'number', key: 'limit', symbol: 'δ_max', label: 'Allowed mismatch', suffix: '± ppm', min: 0, max: 1e6, visible: (_s, r) => r.link === 'custom', help: 'Largest total frequency difference between the two ends that the link tolerates (from the interface standard or the receiver data sheet).' },
    ],
  },
];

const fF = (f: number, d = 9) => si(f, 'Hz', d);
const sppm = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${fmt(Math.abs(x), d)} ppm`;
function fmt(x: number, d: number): string {
  if (x === 0) return '0';
  if (x >= 1e4) return x.toLocaleString('en-US', { maximumFractionDigits: 0 }).replace(/,/g, ' ');
  return x >= 100 ? x.toFixed(Math.max(d - 2, 0)) : x >= 1 ? x.toFixed(d) : x.toPrecision(3);
}
const sTime = (sec: number) => (Math.abs(sec) >= 60 ? `${(sec / 60).toFixed(2)} min` : `${sec.toFixed(3)} s`);
/** Signed, with a typographic minus: +1.234 s, −0.073 s */
const sgn = (x: number) => (x < 0 ? '−' : '+');
const sTimeS = (sec: number) => `${sgn(sec)}${sTime(Math.abs(sec))}`;
const sMinYr = (ppm: number) => `${sgn(minPerYear(ppm))}${Math.abs(minPerYear(ppm)).toFixed(2)} min/year`;

export function compute(st: PpmState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return errorReport(ID, e);
  }
}

export function budget(s: PpmState): { parts: { name: string; iv: Interval }[]; worst: Interval; rss: Interval; age: number; temp: Interval } {
  const temp: Interval = s.tempModel === 'range' ? { lo: -s.tempPpm, hi: s.tempPpm } : s.tempModel === 'parabolic' ? parabolicRange(s.beta, s.t0, s.tmin, s.tmax) : { lo: 0, hi: 0 };
  const age = ageing(s.aging1, s.agingN, s.years);
  const parts = [
    { name: 'Initial', iv: { lo: -s.init, hi: s.init } },
    { name: 'Temperature', iv: temp },
    { name: 'Ageing', iv: { lo: -age, hi: age } },
  ];
  return { parts, worst: sumWorst(parts.map((p) => p.iv)), rss: sumRss(parts.map((p) => p.iv)), age, temp };
}

function run(st: PpmState): CalcReport {
  const s: PpmState = { ...st };
  for (const k of ['f0', 'offPpm', 'offHz', 'offPct', 'fMeas', 'init', 'tempPpm', 'beta', 't0', 'tmin', 'tmax', 'aging1', 'agingN', 'years', 'other', 'limit'] as const) {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (!(s.f0 > 0)) throw new Error('The nominal frequency must be > 0.');
  if (s.tempModel !== 'none' && s.tmax < s.tmin) throw new Error('T_max must be at least T_min.');
  for (const k of ['init', 'tempPpm', 'beta', 'aging1', 'agingN', 'years', 'other', 'limit'] as const) if (s[k] < 0) throw new Error(`${k} must be ≥ 0.`);

  // ── converter: everything follows from the given form
  const ppm = s.given === 'offPpm' ? s.offPpm : s.given === 'offHz' ? hzToPpm(s.offHz, s.f0) : s.given === 'offPct' ? pctToPpm(s.offPct) : fToPpm(s.fMeas, s.f0);
  // Only a negative frequency is impossible; the ranges above cover every f₀ / f pair the boxes accept.
  // (Mode-switch harness: the remaining error-after-edit flags are typed T_max < T_min, which is an input error.)
  if (ppm < -1e6 * (1 + 1e-12)) throw new Error(`An offset of ${sppm(ppm)} would make the frequency negative (below −f₀). Check the sign and the units.`);
  const report: CalcReport = { ...emptyReport(ID) };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const conv: ResultItem[] = [
    item('offPpm', 'Offset in ppm', ppm, 'ppm', sppm(ppm, 3), { symbol: 'Δf/f', group: 'Converter' }),
    item('offHz', 'Offset in hertz', ppmToHz(ppm, s.f0), 'Hz', `${ppm >= 0 ? '+' : '−'}${si(Math.abs(ppmToHz(ppm, s.f0)), 'Hz', 6)}`, { symbol: 'Δf', group: 'Converter' }),
    item('offPct', 'Offset in percent', ppmToPct(ppm), '%', `${ppm >= 0 ? '+' : '−'}${Math.abs(ppmToPct(ppm)).toPrecision(6)} %`, { symbol: 'Δf/f', group: 'Converter' }),
    item('fMeas', 'Actual frequency', ppmToF(ppm, s.f0), 'Hz', fF(ppmToF(ppm, s.f0), 10), { symbol: 'f', group: 'Converter' }),
  ].map((r) => (r.key === s.given ? r : { ...r, solved: true }));
  conv.push(item('convDrift', 'Clock error', secPerDay(ppm), 's/day', `${ppm >= 0 ? 'gains' : 'loses'} ${sTime(Math.abs(secPerDay(ppm)))}/day`, { group: 'Converter', note: `${Math.abs(minPerYear(ppm)).toFixed(2)} min/year` }));

  // ── error budget
  const b = budget(s);
  const w = b.worst;
  const wMax = Math.max(Math.abs(w.lo), Math.abs(w.hi));
  const fmin = ppmToF(w.lo, s.f0);
  const fmax = ppmToF(w.hi, s.f0);
  const primary: ResultItem[] = [
    item('worst', 'Worst-case error', wMax, 'ppm', `${sppm(w.lo)} … ${sppm(w.hi)}`, { symbol: 'Δf/f', primary: true, note: `RSS ${sppm(b.rss.lo)} … ${sppm(b.rss.hi)}` }),
    item('fRange', 'Frequency window', fmin, 'Hz', `${fF(fmin, 9)} … ${fF(fmax, 9)}`, { symbol: 'f', primary: true, note: `span ${si(fmax - fmin, 'Hz', 4)}` }),
    item('drift', 'Clock drift (worst)', secPerDay(wMax), 's/day', `±${sTime(secPerDay(wMax))}/day`, { primary: true, note: `${minPerYear(wMax).toFixed(2)} min/year` }),
  ];
  const rest: ResultItem[] = [
    ...b.parts.map((p) => item(`part${p.name}`, p.name, (p.iv.hi - p.iv.lo) / 2, 'ppm', `${sppm(p.iv.lo)} … ${sppm(p.iv.hi)}`, { group: 'Budget' })),
    item('worstLo', 'Worst-case low', w.lo, 'ppm', sppm(w.lo), { group: 'Budget' }),
    item('worstHi', 'Worst-case high', w.hi, 'ppm', sppm(w.hi), { group: 'Budget' }),
    item('rssLo', 'RSS low', b.rss.lo, 'ppm', sppm(b.rss.lo), { group: 'Budget', note: 'independent errors' }),
    item('rssHi', 'RSS high', b.rss.hi, 'ppm', sppm(b.rss.hi), { group: 'Budget' }),
    item('fmin', 'Lowest frequency', fmin, 'Hz', fF(fmin, 10), { symbol: 'f_min', group: 'Frequency' }),
    item('fmax', 'Highest frequency', fmax, 'Hz', fF(fmax, 10), { symbol: 'f_max', group: 'Frequency' }),
    item('dfLo', 'Deviation low', ppmToHz(w.lo, s.f0), 'Hz', si(ppmToHz(w.lo, s.f0), 'Hz', 4), { group: 'Frequency' }),
    item('dfHi', 'Deviation high', ppmToHz(w.hi, s.f0), 'Hz', si(ppmToHz(w.hi, s.f0), 'Hz', 4), { group: 'Frequency' }),
    item('slowDay', 'Slowest clock', secPerDay(w.lo), 's/day', `${sTimeS(secPerDay(w.lo))}/day`, { group: 'Timekeeping', note: sMinYr(w.lo) }),
    item('fastDay', 'Fastest clock', secPerDay(w.hi), 's/day', `${sTimeS(secPerDay(w.hi))}/day`, { group: 'Timekeeping', note: sMinYr(w.hi) }),
  ];

  // ── link check
  let status: CalcReport['status'];
  if (s.link !== 'none') {
    const usb = USB[s.link];
    let lim: number;
    let used: number;
    let what: string;
    if (usb != null) {
      lim = usb;
      used = wMax;
      what = `this clock vs the USB 2.0 data-rate tolerance ±${fmt(usb, 0)} ppm`;
    } else {
      lim = s.link === 'uart' ? uartMaxMismatch(10, 16) * 1e6 : s.limit;
      used = wMax + s.other;
      what = `mismatch: this clock ${fmt(wMax, 1)} + other end ${fmt(s.other, 1)} ppm`;
    }
    const pass = used <= lim * (1 + 1e-12);
    status = pass ? { text: 'LINK OK', tone: 'pass' } : { text: 'LINK FAILS', tone: 'fail' };
    primary.push(item('linkMargin', 'Link budget', lim > 0 ? used / lim : null, '', lim > 0 ? `${((used / lim) * 100).toFixed(1)} % used` : 'no limit', { primary: true, tone: pass ? 'pass' : 'fail', note: `${fmt(used, 1)} of ±${fmt(lim, 1)} ppm` }));
    rest.push(item('linkLimit', 'Allowed', lim, 'ppm', `±${fmt(lim, 1)} ppm`, { group: 'Link', note: s.link === 'uart' ? '(½ − 1/16)/9.5 bit periods' : usb != null ? 'USB 2.0 §7.1.11' : 'custom' }), item('linkUsed', 'Worst case', used, 'ppm', `±${fmt(used, 1)} ppm`, { group: 'Link', note: what }));
    if (!pass) warnings.push(s.link === 'uart' || s.link === 'custom' ? `The two clocks can differ by ${fmt(used, 0)} ppm, more than the ±${fmt(lim, 0)} ppm the link tolerates: use a crystal on at least one end, or calibrate/trim the RC oscillator.` : `This clock can be off by ${fmt(used, 0)} ppm; USB requires ±${fmt(lim, 0)} ppm. Use a crystal (or the MCU’s USB clock-recovery from SOF packets, where available).`);
  }
  report.status = status;
  report.results = [...primary, ...rest, ...conv];

  if (s.tempModel === 'parabolic' && (s.tmin < s.t0 - 60 || s.tmax > s.t0 + 60)) notes.push('Far from T₀ the tuning-fork parabola underestimates the error (a small cubic term appears); use the data-sheet curve at the extremes.');
  if (s.tempModel === 'parabolic') notes.push(`Tuning forks run slow on both sides of T₀ = ${s.t0} °C: at ${s.tmin} °C ${sppm(parabolic(s.beta, s.t0, s.tmin), 1)}, at ${s.tmax} °C ${sppm(parabolic(s.beta, s.t0, s.tmax), 1)}. A load-capacitance mismatch shifts the whole window (crystal load capacitance page).`);
  if (s.years > 0 && s.agingN === 0 && s.years > 1) notes.push('Ageing after the first year is set to 0: real crystals keep ageing, more slowly.');
  notes.push('The worst case assumes every term at its limit with the worst sign; the RSS figure treats them as independent and is the likelier spread.');

  report.summary = `${fF(s.f0, 6)} · worst ${sppm(w.lo, 1)} … ${sppm(w.hi, 1)} · ±${sTime(secPerDay(wMax))}/day`;
  report.details = { ppm, ...b };
  report.graphs = graphs(s, b);
  return report;
}

function graphs(s: PpmState, b: ReturnType<typeof budget>): GraphSpec[] {
  const out: GraphSpec[] = [];
  const lim = USB[s.link];
  const limLines = lim != null ? [{ value: lim, label: `+${fmt(lim, 0)} ppm`, axis: 'p', color: '#8b1e1e', dash: [4, 4], width: 1.2 }, { value: -lim, label: `−${fmt(lim, 0)} ppm`, axis: 'p', color: '#8b1e1e', dash: [4, 4], width: 1.2 }] : [];
  // 1 — error window vs temperature (initial + ageing around the temperature curve)
  if (s.tempModel !== 'none') {
    const t1 = s.tmin;
    const t2 = Math.max(s.tmax, s.tmin + 1);
    const ts = Array.from({ length: 121 }, (_, i) => t1 + ((t2 - t1) * i) / 120);
    const tc = (t: number) => (s.tempModel === 'parabolic' ? parabolic(s.beta, s.t0, t) : 0);
    const band = s.tempModel === 'range' ? s.tempPpm : 0;
    const extra = s.init + b.age;
    out.push({
      id: 'vs-temperature',
      title: 'Error vs temperature',
      subtitle: s.tempModel === 'range' ? 'stability spec as a flat band (the real curve lies inside)' : `−${s.beta}·(T − ${s.t0})² ppm`,
      x: { label: 'Temperature', unit: '°C' },
      y: [{ id: 'p', label: 'Frequency error', unit: 'ppm' }],
      series: [
        { label: 'Worst high', x: ts, y: ts.map((t) => tc(t) + band + extra), axis: 'p', color: '#c47b17', width: 1.6, dash: [5, 3] },
        { label: s.tempModel === 'parabolic' ? 'Temperature curve' : 'Nominal', x: ts, y: ts.map(tc), axis: 'p', width: 2.2 },
        { label: 'Worst low', x: ts, y: ts.map((t) => tc(t) - band - extra), axis: 'p', color: '#c47b17', width: 1.6, dash: [5, 3] },
      ],
      hlines: limLines,
      vlines: s.tempModel === 'parabolic' && s.t0 > t1 && s.t0 < t2 ? [{ value: s.t0, label: `T₀ ${s.t0} °C`, color: '#9a8f7a', dash: [3, 3] }] : [],
    });
  }
  // 2 — the window over the service life (ageing)
  const yEnd = Math.max(s.years * 1.5, 2);
  const ys = Array.from({ length: 101 }, (_, i) => (yEnd * i) / 100);
  const base = { lo: -s.init + b.temp.lo, hi: s.init + b.temp.hi };
  out.push({
    id: 'vs-time',
    title: 'Error vs years',
    x: { label: 'Time in service', unit: 'years' },
    y: [{ id: 'p', label: 'Frequency error', unit: 'ppm' }],
    series: [
      { label: 'Worst high', x: ys, y: ys.map((y) => base.hi + ageing(s.aging1, s.agingN, y)), axis: 'p', color: '#c47b17', width: 1.8 },
      { label: 'Worst low', x: ys, y: ys.map((y) => base.lo - ageing(s.aging1, s.agingN, y)), axis: 'p', color: '#1f4e5f', width: 1.8 },
    ],
    hlines: limLines,
    vlines: [{ value: s.years, label: `${s.years} y`, color: '#9a8f7a', dash: [3, 3] }],
  });
  return out;
}

export const def: CalcDef<PpmState> = {
  id: ID,
  version: '0.1.0',
  method:
    'ppm = Δf/f₀·10⁶ conversions; worst-case and RSS sums of initial tolerance, temperature (± spec or tuning-fork parabola −β(T − T₀)², Abracon ABS07 data) and first-year/later ageing; timekeeping drift over 86 400 s/day; UART mismatch limit (½ − 1/OS)/(N − ½) from the sampling geometry and USB 2.0 §7.1.11 data-rate tolerances.',
  fields,
  defaults,
  compute,
  examples: [
    { id: 'default', label: '16 MHz MCU crystal ±20/±30 ppm, UART to a ±1 % RC clock', state: defaults() },
    { id: 'rtc-abs07', label: 'ABS07 32.768 kHz RTC crystal, −20…70 °C: seconds per day', state: { ...defaults(), f0: 32768, f0Unit: 'kHz', given: 'offPpm', offPpm: -20, init: 20, tempModel: 'parabolic', beta: 0.036, t0: 25, tmin: -20, tmax: 70, aging1: 3, agingN: 1, years: 2, link: 'none' } },
    { id: 'counter', label: 'Counter reads 25.000 61 MHz on a 25 MHz part: how many ppm?', state: { ...defaults(), f0: 25e6, given: 'fMeas', fMeas: 25.00061e6, fMeasUnit: 'MHz', init: 30, tempModel: 'range', tempPpm: 30, tmin: -40, tmax: 85, aging1: 3, agingN: 1, years: 5, link: 'custom', other: 100, limit: 200 } },
    { id: 'usb-rc', label: '48 MHz ±1 % RC oscillator for USB full speed', state: { ...defaults(), f0: 48e6, given: 'offPpm', offPpm: 2500, init: 10000, tempModel: 'none', aging1: 0, agingN: 0, years: 0, link: 'usbFs' } },
    { id: 'tcxo', label: '26 MHz TCXO ±0.5 ppm with ageing over 10 years', state: { ...defaults(), f0: 26e6, given: 'offPpm', offPpm: 1, init: 1, tempModel: 'range', tempPpm: 0.5, tmin: -30, tmax: 85, aging1: 1, agingN: 0.5, years: 10, link: 'none' } },
    { id: 'uart-rc-rc', label: 'UART between two ±2.5 % RC oscillators', state: { ...defaults(), f0: 8e6, given: 'offPct', offPct: 2.5, init: 25000, tempModel: 'none', aging1: 0, agingN: 0, years: 0, link: 'uart', other: 25000 } },
  ],
};
