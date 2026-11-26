/** Free-space path loss & Friis link budget — calculator definition. DOM-free. */

import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN } from '@/core/unitsets';
import { C0, dbmToW, distanceForFspl, freqForFspl, fsplDb, link } from './model';

/**
 * Link distances: km first. No global unit preference (the "length" family is mm-scale). Gm lets a solved
 * deep-space distance (up to the 10¹³ m limit) read as 2386 Gm instead of 2.386e+9 km.
 */
const U_DIST: Record<string, number> = { km: 1e3, m: 1, mi: 1609.344, nmi: 1852, ft: 0.3048, Gm: 1e9 };

export interface FsplState {
  solveFor: 'fspl' | 'd' | 'f';
  fspl: number;
  d: number;
  dUnit: string;
  f: number;
  fUnit: string;
  link: boolean;
  pt: number;
  gt: number;
  gr: number;
  loss: number;
  sens: number;
  margin: number;
  ant: number;
  antUnit: string;
}

export const defaults = (): FsplState => ({
  solveFor: 'fspl',
  fspl: 80.23,
  d: 100,
  dUnit: 'm',
  f: 2.45e9,
  fUnit: 'GHz',
  link: true,
  pt: 20,
  gt: 2,
  gr: 2,
  loss: 2,
  sens: -82,
  margin: 15,
  ant: 0,
  antUnit: 'cm',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Path',
    fields: [
      // range covers every result: d = 1 µm … 10¹³ m and f = 1 Hz … 10¹⁵ Hz give L = −267.5 … 412.4 dB
      { kind: 'number', key: 'fspl', symbol: 'L_fs', label: 'Free-space path loss', suffix: 'dB', solvable: true, min: -300, max: 450, help: 'Loss between two isotropic antennas in free space, 20·log10(4πd/λ). Target value when solving for distance or frequency.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Distance', units: U_DIST, unitKey: 'dUnit', solvable: true, min: 1e-6, max: 1e13 },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', solvable: true, min: 1, max: 1e15 },
      { kind: 'number', key: 'ant', symbol: 'D_ant', label: 'Largest antenna size', units: { cm: 1e-2, ...U_LEN }, unitKey: 'antUnit', unitFamily: 'none', min: 0, max: 1e4, zeroHint: 'unknown', help: 'Largest dimension of either antenna (dish diameter, array length). Used only for the far-field check d > 2D²/λ. 0 = not checked.' },
    ],
  },
  {
    kind: 'section',
    title: 'Link budget',
    fields: [
      { kind: 'toggle', key: 'link', label: 'Calculate link budget', on: 'On', off: 'Off' },
      { kind: 'number', key: 'pt', symbol: 'P_t', label: 'Transmit power', suffix: 'dBm', min: -200, max: 120, visible: (_s, r) => r.link, help: '30 dBm = 1 W, 0 dBm = 1 mW.' },
      { kind: 'number', key: 'gt', symbol: 'G_t', label: 'Transmit antenna gain', suffix: 'dBi', min: -100, max: 100, visible: (_s, r) => r.link },
      { kind: 'number', key: 'gr', symbol: 'G_r', label: 'Receive antenna gain', suffix: 'dBi', min: -100, max: 100, visible: (_s, r) => r.link },
      { kind: 'number', key: 'loss', symbol: 'L_o', label: 'Other losses', suffix: 'dB', min: 0, max: 300, visible: (_s, r) => r.link, help: 'Cables, connectors, polarisation mismatch, radome, body loss… everything except the path loss.' },
      { kind: 'number', key: 'sens', symbol: 'P_min', label: 'Receiver sensitivity', suffix: 'dBm', min: -250, max: 100, visible: (_s, r) => r.link, help: 'Lowest input power at which the receiver meets its error-rate target (from its data sheet, for the modulation and bandwidth used).' },
      { kind: 'number', key: 'margin', symbol: 'M_req', label: 'Required fade margin', suffix: 'dB', min: 0, max: 200, visible: (_s, r) => r.link, help: 'Allowance for fading, obstructions and ageing. 10–20 dB is common for terrestrial links; real paths are rarely free space.' },
    ],
  },
];

const fmtDist = (m: number) => {
  if (m < 1e3) return si(m, 'm', 4);
  const km = m / 1e3;
  return km < 1e5 ? `${+km.toPrecision(5)} km` : km < 1e12 ? `${Math.round(km).toLocaleString('en-US')} km` : `${km.toExponential(3)} km`;
};
const fmtArea = (a: number) => (a >= 1e-2 ? `${+a.toPrecision(4)} m²` : `${+(a * 1e4).toPrecision(4)} cm²`);
const dbmW = (dbm: number) => si(dbmToW(dbm), 'W', 3);
const LABELS: Record<string, string> = { fspl: 'Free-space path loss', d: 'Distance', f: 'Frequency' };
/** Field limits for the solvable inputs (solved values outside them are rejected). */
const LIMITS: Record<'d' | 'f', [number, number]> = { d: [1e-6, 1e13], f: [1, 1e15] };

export function compute(st: FsplState): CalcReport {
  for (const k of ['fspl', 'd', 'f', 'pt', 'gt', 'gr', 'loss', 'sens', 'margin', 'ant'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  const s: FsplState = { ...st };
  if (s.solveFor !== 'd' && !(s.d > 0)) throw new Error('Distance must be > 0.');
  if (s.solveFor !== 'f' && !(s.f > 0)) throw new Error('Frequency must be > 0.');
  if (s.ant < 0) throw new Error('Antenna size must be ≥ 0.');
  if (s.solveFor === 'd') s.d = distanceForFspl(s.fspl, s.f);
  else if (s.solveFor === 'f') s.f = freqForFspl(s.fspl, s.d);
  if (!(s.d > 0) || !Number.isFinite(s.d) || !(s.f > 0) || !Number.isFinite(s.f)) throw new Error(`No finite ${LABELS[s.solveFor].toLowerCase()} gives ${s.fspl} dB.`);
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'rf/free-space-path-loss', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  // A solved value must stay inside its input field's limits (never write back e.g. 2e33 Hz).
  if (s.solveFor !== 'fspl') {
    const k = s.solveFor;
    const [lo, hi] = LIMITS[k];
    // the exact inverse of a value typed at a field limit can land a rounding error outside it
    if (s[k] >= lo * (1 - 1e-9) && s[k] <= hi * (1 + 1e-9)) s[k] = Math.min(Math.max(s[k], lo), hi);
    // No answer is an error (style guide §5): the core blanks the solved box and drops the graphs.
    if (!(s[k] >= lo && s[k] <= hi))
      return {
        ...emptyReport('rf/free-space-path-loss'),
        ok: false,
        solveFor: s.solveFor,
        status: { text: 'NO SOLUTION', tone: 'fail' },
        error: `L = ${s.fspl} dB would need ${k === 'd' ? `d = ${s.d.toExponential(3)} m` : `f = ${s.f.toExponential(3)} Hz`}, outside the ${k === 'd' ? '1 µm – 10¹³ m' : '1 Hz – 1000 THz'} range of this calculator. Change the target loss or the ${k === 'd' ? 'frequency' : 'distance'}.`,
      };
  }
  const L = fsplDb(s.d, s.f);
  const lambda = C0 / s.f;

  // ── far-field validity
  const dOverL = s.d / lambda;
  const fraunhofer = s.ant > 0 ? (2 * s.ant * s.ant) / lambda : 0;
  if (L <= 1e-9) warnings.push(`d = ${fmtDist(s.d)} is ≤ λ/4π (${si(lambda / (4 * Math.PI), 'm', 3)}): the "path loss" is ≤ 0 dB, which is meaningless — the antennas are deep in each other’s reactive near field. Use coupling measurements or a field solver.`);
  else if (dOverL < 10) warnings.push(`d is only ${dOverL.toPrecision(3)} λ: Friis assumes the far field (d ≫ λ and d > 2D²/λ). Below about 10 λ the antennas couple through their near fields and the real loss can differ by several dB.`);
  if (fraunhofer > 0 && s.d < fraunhofer) warnings.push(`d < 2D²/λ = ${fmtDist(fraunhofer)} for a ${si(s.ant, 'm', 3)} antenna: the receiver is in the radiating near field (Fresnel region), where the antenna gain is not yet fully realised. Expect lower received power than calculated.`);

  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const solved = s.solveFor;
  const primary: ResultItem[] = [];
  if (solved === 'd') primary.push(item('d', LABELS.d, s.d, 'm', fmtDist(s.d), { symbol: 'd', primary: true, solved: true, note: `${(s.d / 1609.344).toPrecision(4)} mi · ${dOverL.toPrecision(3)} λ` }));
  if (solved === 'f') primary.push(item('f', LABELS.f, s.f, 'Hz', si(s.f, 'Hz', 5), { symbol: 'f', primary: true, solved: true, note: `λ = ${si(lambda, 'm', 4)}` }));
  primary.push(item('fspl', LABELS.fspl, L, 'dB', `${L.toFixed(2)} dB`, { symbol: 'L_fs', primary: true, solved: solved === 'fspl', note: solved === 'fspl' ? `${fmtDist(s.d)} at ${si(s.f, 'Hz', 4)}` : 'target' }));

  const rest: ResultItem[] = [
    item('lambda', 'Wavelength', lambda, 'm', si(lambda, 'm', 4), { symbol: 'λ', group: 'Path' }),
    item('dLambda', 'Distance in wavelengths', dOverL, '', dOverL.toPrecision(4), { symbol: 'd/λ', group: 'Path' }),
    item('ratio', 'Path gain (linear)', 10 ** (-L / 10), '', (10 ** (-L / 10)).toExponential(3), { symbol: '(λ/4πd)²', group: 'Path' }),
    item('slope', 'Loss per doubling of d', 20 * Math.log10(2), 'dB', '6.02 dB (20 dB/decade)', { symbol: 'ΔL', group: 'Path' }),
  ];
  if (fraunhofer > 0) rest.push(item('dFar', 'Far-field distance 2D²/λ', fraunhofer, 'm', fmtDist(fraunhofer), { symbol: 'd_ff', group: 'Path', tone: s.d < fraunhofer ? 'warn' : '' }));

  let lk: ReturnType<typeof link> | null = null;
  let farRange = false;
  if (s.link) {
    lk = link(s.d, s.f, { ptDbm: s.pt, gtDbi: s.gt, grDbi: s.gr, lossDb: s.loss, sensDbm: s.sens, marginReqDb: s.margin });
    const pass = lk.marginDb >= s.margin;
    const closes = lk.marginDb >= 0;
    // The range only means something where Friis is valid (far field: ≥ 10 λ and ≥ 2D²/λ).
    const dFarMin = Math.max(10 * lambda, fraunhofer);
    farRange = lk.maxRange >= dFarMin;
    primary.push(
      item('pr', 'Received power', lk.prDbm, 'dBm', `${lk.prDbm.toFixed(2)} dBm`, { symbol: 'P_r', primary: true, note: dbmW(lk.prDbm) }),
      item('linkMargin', 'Link margin', lk.marginDb, 'dB', `${lk.marginDb.toFixed(2)} dB`, { symbol: 'M', primary: true, tone: pass ? 'pass' : closes ? 'warn' : 'fail', note: `above ${s.sens} dBm sensitivity · need ${s.margin} dB` }),
      farRange
        ? item('maxRange', 'Range at required margin', lk.maxRange, 'm', fmtDist(lk.maxRange), { symbol: 'd_max', primary: true, note: 'free-space upper bound' })
        : { key: 'maxRange', label: 'Range at required margin', value: null, unit: 'm', display: '— (no far-field link)', symbol: 'd_max', primary: true, tone: 'fail', note: `would need d = ${fmtDist(lk.maxRange)}, inside the near field (< ${fmtDist(dFarMin)})` },
    );
    const g = 'Link';
    rest.push(
      item('eirp', 'EIRP', lk.eirpDbm, 'dBm', `${lk.eirpDbm.toFixed(2)} dBm (${dbmW(lk.eirpDbm)})`, { symbol: 'EIRP', group: g }),
      item('prW', 'Received power', dbmToW(lk.prDbm), 'W', dbmW(lk.prDbm), { symbol: 'P_r', group: g }),
      item('pfd', 'Power flux density', lk.pfd, 'W/m²', `${si(lk.pfd, 'W', 3)}/m²`, { symbol: 'S', group: g, note: `${(10 * Math.log10(lk.pfd)).toFixed(1)} dBW/m²` }),
      item('eField', 'Field strength (RMS)', lk.eField, 'V/m', `${si(lk.eField, 'V', 4)}/m`, { symbol: 'E', group: g, note: `${(20 * Math.log10(lk.eField / 1e-6)).toFixed(1)} dBµV/m` }),
      item('aeRx', 'Rx effective aperture', lk.aeRx, 'm²', fmtArea(lk.aeRx), { symbol: 'A_e', group: g, note: 'G_r λ²/4π' }),
    );
    report.status = L <= 1e-9 ? { text: 'NEAR FIELD', tone: 'warn' } : pass ? { text: 'LINK OK', tone: 'pass' } : closes ? { text: 'LOW MARGIN', tone: 'warn' } : { text: 'NO LINK', tone: 'fail' };
    if (!closes)
      warnings.push(
        farRange
          ? `Received power ${lk.prDbm.toFixed(1)} dBm is ${(-lk.marginDb).toFixed(1)} dB below the sensitivity. Add antenna gain or power, or shorten the path to ${fmtDist(lk.maxRange)}.`
          : `Received power ${lk.prDbm.toFixed(1)} dBm is ${(-lk.marginDb).toFixed(1)} dB below the sensitivity, and the link cannot close in the far field at all: it would need d = ${fmtDist(lk.maxRange)}, closer than ${fmtDist(dFarMin)} where Friis no longer applies. Add power or gain.`,
      );
    else if (!farRange) warnings.push(`With the required ${s.margin} dB margin the link only closes inside the near field (d < ${fmtDist(dFarMin)}), where Friis does not apply.`);
    else if (!pass) warnings.push(`Margin ${lk.marginDb.toFixed(1)} dB is less than the ${s.margin} dB you asked for; free space is the best case, so a real path will usually be worse.`);
  }
  report.results = [...primary, ...rest];
  report.summary = `${fmtDist(s.d)} at ${si(s.f, 'Hz', 4)} · λ = ${si(lambda, 'm', 3)}${lk ? ` · P_r ${lk.prDbm.toFixed(1)} dBm` : ''}`;
  notes.push(
    'Free space only: no ground reflection, atmospheric absorption, rain, foliage or obstruction. Terrestrial links usually lose more (two-ray, Fresnel-zone clearance, ITU-R P.676/P.838/P.526).',
    'FSPL is defined between isotropic antennas; the antenna gains enter the link budget separately. The "loss" grows with frequency only because an isotropic antenna’s capture area λ²/4π shrinks.',
    'Antennas are assumed polarisation-matched and pointed at each other; add mismatch to “Other losses”.',
  );
  report.details = { fspl: L, d: s.d, f: s.f, lambda, fraunhofer, link: lk };
  report.graphs = graphs(s, L, lk, farRange);
  return report;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: FsplState, L: number, lk: ReturnType<typeof link> | null, farRange: boolean): GraphSpec[] {
  const dMax = lk && farRange ? lk.maxRange : s.d;
  const lambda = C0 / s.f;
  // start no closer than λ/4π (where the formula reaches 0 dB) unless the operating point itself is closer
  const d0 = Math.max(Math.min(s.d, dMax) / 100, Math.min(s.d, lambda / (4 * Math.PI)));
  const d1 = Math.max(s.d, dMax) * 10;
  const ds = [...logspace(d0, d1, 241), s.d].sort((a, b) => a - b);
  const lossOf = (d: number) => fsplDb(d, s.f);
  const y: GraphSpec['y'] = [{ id: 'l', label: 'Path loss', unit: 'dB' }];
  const series: NonNullable<GraphSpec['series']> = [{ label: 'FSPL', x: ds, y: ds.map(lossOf), axis: 'l', width: 2.2 }];
  const hlines: NonNullable<GraphSpec['hlines']> = [];
  const vlines: NonNullable<GraphSpec['vlines']> = [{ value: s.d, label: `d = ${fmtDist(s.d)}`, color: '#9a8f7a' }];
  if (lk) {
    y.push({ id: 'p', label: 'Received power', unit: 'dBm', side: 'right' });
    const k = s.pt + s.gt + s.gr - s.loss;
    series.push({ label: 'P_r', x: ds, y: ds.map((d) => k - lossOf(d)), axis: 'p', width: 1.8, color: '#c47b17' });
    hlines.push({ value: s.sens, label: `sensitivity ${s.sens} dBm`, axis: 'p', color: '#8b1e1e', dash: [5, 4] });
    if (s.margin > 0) hlines.push({ value: s.sens + s.margin, label: `+ ${s.margin} dB margin`, axis: 'p', color: '#c47b17', dash: [2, 4] });
    if (farRange) vlines.push({ value: lk.maxRange, label: `d_max = ${fmtDist(lk.maxRange)}`, color: '#8b1e1e', dash: [5, 4] });
  }
  const fs = logspace(Math.max(s.f / 100, 1e3, Math.min(s.f, C0 / (4 * Math.PI * s.d))), Math.min(s.f * 100, 1e15), 201);
  return [
    {
      id: 'loss-vs-d',
      title: lk ? 'Path loss and received power vs distance' : 'Path loss vs distance',
      x: { label: 'Distance', unit: 'm', log: true },
      y,
      series,
      hlines,
      vlines,
      markers: [{ x: s.d, y: L, axis: 'l', label: `${L.toFixed(1)} dB` }],
    },
    {
      id: 'loss-vs-f',
      title: 'Path loss vs frequency',
      subtitle: `at ${fmtDist(s.d)}`,
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'l', label: 'Path loss', unit: 'dB' }],
      series: [{ label: 'FSPL', x: fs, y: fs.map((f) => fsplDb(s.d, f)), axis: 'l', width: 2.2 }],
      vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz', 4)}`, color: '#9a8f7a' }],
    },
  ];
}

export const def: CalcDef<FsplState> = {
  id: 'rf/free-space-path-loss',
  version: '0.1.0',
  method: 'Free-space basic transmission loss 20·log10(4πd/λ) (ITU-R P.525-4; Friis, Proc. IRE 1946) with the Friis link budget Pr = Pt + Gt + Gr − L − losses, margin against receiver sensitivity and the range at a required margin; far-field check d ≫ λ and d > 2D²/λ (Balanis, Antenna Theory §2.2.4). Solve-for uses the exact closed-form inverse.',
  fields,
  defaults,
  solve: {
    default: 'fspl',
    analysis: 'fspl',
    options: [
      { key: 'fspl', label: 'Path loss from distance and frequency' },
      { key: 'd', label: 'Distance for a given path loss' },
      { key: 'f', label: 'Frequency for a given path loss' },
    ],
  },
  compute,
  examples: [
    { id: 'wifi-100m', label: '2.4 GHz Wi-Fi, 100 m, 20 dBm, −82 dBm sensitivity', state: defaults() },
    { id: 'itu-p525', label: 'ITU-R P.525 check: 1 GHz over 1 km = 92.45 dB', state: { solveFor: 'fspl', d: 1e3, dUnit: 'km', f: 1e9, fUnit: 'GHz', link: false, ant: 0 } },
    { id: 'lora-868', label: 'LoRa 868 MHz, 14 dBm, SF12 −137 dBm: free-space range', state: { solveFor: 'fspl', d: 10e3, dUnit: 'km', f: 868e6, fUnit: 'MHz', link: true, pt: 14, gt: 2.15, gr: 2.15, loss: 1, sens: -137, margin: 20, ant: 0 } },
    { id: 'geo-ku', label: 'GEO Ku-band downlink, 12 GHz over 35 786 km', state: { solveFor: 'fspl', d: 35786e3, dUnit: 'km', f: 12e9, fUnit: 'GHz', link: true, pt: 50, gt: 30, gr: 37, loss: 3, sens: -120, margin: 5, ant: 0.9, antUnit: 'm' } },
    { id: 'dist-100db', label: 'Distance for 100 dB at 5.8 GHz', state: { solveFor: 'd', fspl: 100, f: 5.8e9, fUnit: 'GHz', dUnit: 'km', link: false } },
    { id: 'near-field', label: 'Near-field check: 2.4 GHz at 5 cm, 30 cm array', state: { solveFor: 'fspl', d: 0.05, dUnit: 'm', f: 2.4e9, fUnit: 'GHz', link: false, ant: 0.3, antUnit: 'm' } },
  ],
};
