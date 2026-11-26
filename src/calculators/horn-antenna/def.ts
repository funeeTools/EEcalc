/** Horn antenna (pyramidal / sectoral) — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN, withDefault } from '@/core/unitsets';
import { WR_SIZES } from '../waveguide-cutoff/model';
import {
  C0,
  apexDistance,
  balanisDesign,
  beamSplit,
  beamwidth,
  designOptimum,
  directivity,
  flareLength,
  lengthForDirectivity,
  patternE,
  patternH,
  phaseErrors,
  type HornGeom,
  type HornType,
} from './model';

export const ID = 'antenna/horn-antenna';
const INCH = 0.0254;
const DEG = 180 / Math.PI;
/** Free-space wavelength at 10 GHz (for examples given in wavelengths). */
const LAM10 = C0 / 10e9;

export type SolveKey = 'gain' | 'design' | 'len';

export interface HornState {
  solveFor: SolveKey;
  f: number;
  fUnit: string;
  /** gain, dBi: target (design / len) or result */
  gain: number;
  type: HornType;
  lenMode: 'L' | 'rho';
  wr: string;
  a: number;
  aUnit: string;
  b: number;
  bUnit: string;
  a1: number;
  a1Unit: string;
  b1: number;
  b1Unit: string;
  len: number;
  lenUnit: string;
  rho1: number;
  rho1Unit: string;
  rho2: number;
  rho2Unit: string;
}

export const defaults = (): HornState => ({
  solveFor: 'gain',
  f: 10e9,
  fUnit: 'GHz',
  gain: 18.8,
  type: 'pyramidal',
  lenMode: 'L',
  wr: 'WR-90',
  a: 0.9 * INCH,
  aUnit: 'mm',
  b: 0.4 * INCH,
  bUnit: 'mm',
  a1: 100e-3,
  a1Unit: 'mm',
  b1: 75e-3,
  b1Unit: 'mm',
  len: 150e-3,
  lenUnit: 'mm',
  rho1: 173.5e-3,
  rho1Unit: 'mm',
  rho2: 194.4e-3,
  rho2Unit: 'mm',
});

const U_DIM = withDefault(U_LEN, 'mm');
const LIM = { a1: [1e-4, 10] as const, len: [1e-5, 100] as const, rho: [1e-5, 1e6] as const };
/**
 * Gain box range. Within the input limits (f ≥ 100 MHz, a₁ ≥ 0.1 mm, b₁ ≥ 10 µm; a₁, b₁ ≤ 10 m, f ≤ 1 THz) the
 * aperture-model gain stays between about −90 and +101 dBi, so every analysis result fits.
 */
const G_LIM = [-150, 150] as const;
const TYPES: { value: HornType; label: string }[] = [
  { value: 'pyramidal', label: 'Pyramidal (both planes flared)' },
  { value: 'e-sectoral', label: 'E-plane sectoral (b flared)' },
  { value: 'h-sectoral', label: 'H-plane sectoral (a flared)' },
];
const isDesign = (r: Record<string, any>) => r.solveFor === 'design';
const lenSolved = (r: Record<string, any>) => r.solveFor === 'design' || r.solveFor === 'len';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Operating point',
    note: 'Analyse a horn, or ◎ the aperture for an optimum-gain design, or ◎ the length for a target gain.',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1e8, max: 1e12 },
      { kind: 'number', key: 'gain', symbol: 'G', label: 'Gain', suffix: 'dBi', solvable: true, min: G_LIM[0], max: G_LIM[1], help: 'Boresight gain of a lossless horn (= directivity). Calculated in analysis; the target when designing an optimum horn or solving the length.' },
    ],
  },
  {
    kind: 'section',
    title: 'Feed waveguide',
    fields: [
      { kind: 'select', key: 'wr', label: 'Standard size', options: Object.keys(WR_SIZES).map((k) => ({ value: k, label: WR_SIZES[k] ? `${k} (${WR_SIZES[k]!.lo}–${WR_SIZES[k]!.hi} GHz)` : k })), apply: (v, s) => setFeed(s as HornState, v), help: 'Rectangular feed guide carrying TE₁₀ (inner a × b). A feed larger than the aperture scales the horn up with it.' },
      { kind: 'number', key: 'a', symbol: 'a', label: 'Feed width', units: U_DIM, unitKey: 'aUnit', min: 1e-4, max: 2 },
      { kind: 'number', key: 'b', symbol: 'b', label: 'Feed height', units: U_DIM, unitKey: 'bUnit', min: 1e-5, max: 2 },
    ],
  },
  {
    kind: 'section',
    title: 'Horn',
    fields: [
      // A different horn type is a different antenna: a gain target set for the old one (design / length
      // solve) may be out of reach for the new one, so go back to analysis of the dimensions entered.
      { kind: 'select', key: 'type', label: 'Horn type', options: TYPES, structural: true, apply: (_v, s) => { s.solveFor = 'gain'; }, help: 'A sectoral horn flares in one plane only; the other aperture dimension stays equal to the feed.' },
      { kind: 'select', key: 'lenMode', label: 'Length given as', options: [{ value: 'L', label: 'Axial length L (physical horn)' }, { value: 'rho', label: 'Apex distances ρ₁, ρ₂ (Balanis)' }], structural: true, help: 'A real pyramidal horn has one axial length L. Giving the two apex distances separately (as in Balanis) may describe a horn that cannot be built; the page then checks p_e = p_h.' },
      {
        kind: 'number', key: 'a1', symbol: 'a₁', label: 'Aperture (H)', units: U_DIM, unitKey: 'a1Unit', solvable: true, min: LIM.a1[0], max: LIM.a1[1],
        visible: (s) => s.type !== 'e-sectoral', solvedWhen: (_s, r) => isDesign(r), onSolve: (_s, r) => { r.solveFor = 'design'; }, onUnsolve: (_s, r) => { r.solveFor = 'gain'; },
        help: 'Aperture dimension in the H-plane (parallel to the feed’s broad wall). ◎ designs an optimum-gain horn for the target gain: a₁, b₁ and L are then solved.',
      },
      {
        kind: 'number', key: 'b1', symbol: 'b₁', label: 'Aperture (E)', units: U_DIM, unitKey: 'b1Unit', solvable: true, min: LIM.a1[0], max: LIM.a1[1],
        visible: (s) => s.type !== 'h-sectoral', solvedWhen: (_s, r) => isDesign(r), onSolve: (_s, r) => { r.solveFor = 'design'; }, onUnsolve: (_s, r) => { r.solveFor = 'gain'; },
        help: 'Aperture dimension in the E-plane (parallel to the feed’s narrow wall, along the E-field).',
      },
      {
        kind: 'number', key: 'len', symbol: 'L', label: 'Flare length', units: U_DIM, unitKey: 'lenUnit', solvable: true, min: LIM.len[0], max: LIM.len[1],
        visible: (_s, r) => r.lenMode !== 'rho', solvedWhen: (_s, r) => lenSolved(r), onSolve: (_s, r) => { r.solveFor = 'len'; }, onUnsolve: (_s, r) => { r.solveFor = 'gain'; },
        help: 'Length of the flared section along the axis, from the end of the feed guide to the aperture (Balanis p_e = p_h). ◎ solves the length that gives the target gain with the aperture held.',
      },
      {
        kind: 'number', key: 'rho1', symbol: 'ρ₁', label: 'E apex dist.', units: U_DIM, unitKey: 'rho1Unit', solvable: true, min: LIM.rho[0], max: LIM.rho[1],
        visible: (s, r) => r.lenMode === 'rho' && s.type !== 'h-sectoral', solvedWhen: (_s, r) => lenSolved(r), onSolve: (_s, r) => { r.solveFor = 'len'; }, onUnsolve: (_s, r) => { r.solveFor = 'gain'; },
        help: 'Axial distance from the apex of the E-plane flare (where its walls would meet) to the aperture.',
      },
      {
        kind: 'number', key: 'rho2', symbol: 'ρ₂', label: 'H apex dist.', units: U_DIM, unitKey: 'rho2Unit', solvable: true, min: LIM.rho[0], max: LIM.rho[1],
        visible: (s, r) => r.lenMode === 'rho' && s.type !== 'e-sectoral', solvedWhen: (_s, r) => lenSolved(r), onSolve: (_s, r) => { r.solveFor = 'len'; }, onUnsolve: (_s, r) => { r.solveFor = 'gain'; },
        help: 'Axial distance from the apex of the H-plane flare to the aperture.',
      },
    ],
  },
];

/**
 * Standard feed sizes. A feed larger than the aperture (WR-90 → WR-650 under a 100 mm mouth) would be a red
 * error after a switch: then scale the aperture and the length by the feed's growth, so the horn keeps its
 * proportions around the new feed. A feed that fits leaves the horn as it is.
 */
export function setFeed(s: HornState, wr: string): void {
  const w = WR_SIZES[wr];
  if (!w) return;
  const a = w.a * INCH;
  const b = w.b * INCH;
  const fitsA = s.type === 'e-sectoral' || s.a1 >= a * (s.type === 'h-sectoral' ? 1.000001 : 1);
  const fitsB = s.type === 'h-sectoral' || s.b1 >= b * (s.type === 'e-sectoral' ? 1.000001 : 1);
  const k = Math.max(a / s.a, b / s.b);
  if (!(fitsA && fitsB) && Number.isFinite(k) && k > 1) {
    s.a1 *= k;
    s.b1 *= k;
    s.len *= k;
    s.rho1 *= k;
    s.rho2 *= k;
  }
  s.a = a;
  s.b = b;
}

const fLen = (v: number, d = 4) => si(v, 'm', d);
const fDeg = (r: number | null) => (r == null ? '> 180°' : `${(r * DEG).toFixed(1)}°`);
const dB = (x: number) => 10 * Math.log10(x);

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

function fail(s: HornState, msg: string, keys: string[]): CalcReport {
  const r: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
  r.warnings.push(msg);
  const label: Record<string, string> = { a1: 'Aperture width (H)', b1: 'Aperture height (E)', len: 'Axial flare length' };
  for (const k of keys) r.results.push({ key: k, label: label[k] ?? k, value: null, display: '—', primary: true, solved: true });
  return r;
}

export function compute(st: HornState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function geometryOf(s: HornState, lambda: number): HornGeom & { L: number | null; pe: number | null; ph: number | null } {
  const a1 = s.type === 'e-sectoral' ? s.a : s.a1;
  const b1 = s.type === 'h-sectoral' ? s.b : s.b1;
  let rho1: number;
  let rho2: number;
  if (s.lenMode === 'rho') {
    rho1 = s.type === 'h-sectoral' ? Infinity : s.rho1;
    rho2 = s.type === 'e-sectoral' ? Infinity : s.rho2;
  } else {
    rho1 = s.type === 'h-sectoral' ? Infinity : apexDistance(b1, s.b, s.len);
    rho2 = s.type === 'e-sectoral' ? Infinity : apexDistance(a1, s.a, s.len);
  }
  const pe = Number.isFinite(rho1) ? flareLength(b1, s.b, rho1) : null;
  const ph = Number.isFinite(rho2) ? flareLength(a1, s.a, rho2) : null;
  const L = s.lenMode === 'rho' ? (pe != null && ph != null ? Math.max(pe, ph) : pe ?? ph) : s.len;
  return { a1, b1, rho1, rho2, lambda, L, pe, ph };
}

function run(st: HornState): CalcReport {
  const s: HornState = { ...st };
  if (!['gain', 'design', 'len'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  if (!['pyramidal', 'e-sectoral', 'h-sectoral'].includes(s.type)) throw new Error(`Unknown horn type "${String(s.type)}".`);
  for (const [k, name] of [['f', 'Frequency'], ['a', 'Feed width a'], ['b', 'Feed height b']] as const) if (!(finite(name, s[k]) > 0)) throw new Error(`${name} must be > 0.`);
  const lambda = C0 / s.f;
  const { a, b, type } = s;
  const solveDesign = s.solveFor === 'design';
  const solveLen = s.solveFor === 'len';
  if (solveDesign || solveLen) {
    finite('Target gain', s.gain); // any value: too low or too high a target gets a specific "no solution" message
  }
  if (!solveDesign) {
    if (type !== 'e-sectoral' && !(finite('Aperture width a₁', s.a1) > 0)) throw new Error('Aperture width a₁ must be > 0.');
    if (type !== 'h-sectoral' && !(finite('Aperture height b₁', s.b1) > 0)) throw new Error('Aperture height b₁ must be > 0.');
    if (type !== 'e-sectoral' && s.a1 < a) throw new Error(`The aperture width a₁ (${fLen(s.a1)}) must be at least the feed width a (${fLen(a)}).`);
    if (type !== 'h-sectoral' && s.b1 < b) throw new Error(`The aperture height b₁ (${fLen(s.b1)}) must be at least the feed height b (${fLen(b)}).`);
    if (type === 'pyramidal' && s.a1 <= a && s.b1 <= b) throw new Error('The aperture equals the feed: this is an open-ended waveguide, not a horn. Make a₁ > a or b₁ > b.');
    if (type === 'e-sectoral' && !(s.b1 > b)) throw new Error('An E-plane sectoral horn needs b₁ > b.');
    if (type === 'h-sectoral' && !(s.a1 > a)) throw new Error('An H-plane sectoral horn needs a₁ > a.');
  }
  if (!solveDesign && !solveLen) {
    if (s.lenMode === 'rho') {
      if (type !== 'h-sectoral' && !(finite('ρ₁', s.rho1) > 0)) throw new Error('ρ₁ must be > 0.');
      if (type !== 'e-sectoral' && !(finite('ρ₂', s.rho2) > 0)) throw new Error('ρ₂ must be > 0.');
    } else if (!(finite('Length L', s.len) > 0)) throw new Error('Axial length L must be > 0.');
  }

  // ── solve
  const d0 = 10 ** (s.gain / 10);
  if (solveDesign) {
    const xMax = Math.min(LIM.a1[1], 400 * lambda);
    const res = designOptimum(type, d0, a, b, lambda, xMax);
    if ('error' in res) {
      const keys = type === 'e-sectoral' ? ['b1', 'len'] : type === 'h-sectoral' ? ['a1', 'len'] : ['a1', 'b1', 'len'];
      return fail(s, s.gain < dB(res.dMin) ? `An optimum horn on this ${fLen(a, 3)} × ${fLen(b, 3)} feed starts at about ${dB(res.dMin).toFixed(1)} dBi (the bare flare). Ask for more gain, or use a smaller feed / lower frequency.` : `${s.gain} dBi needs an aperture beyond ${fLen(xMax, 3)} (${(xMax / lambda).toFixed(0)} λ). Lower the target or use a reflector antenna.`, keys);
    }
    const g = res.geom;
    if (g.a1 > LIM.a1[1] || g.b1 > LIM.a1[1] || g.L > LIM.len[1]) return fail(s, `The optimum horn for ${s.gain} dBi is too large for this page (aperture ${fLen(g.a1, 3)} × ${fLen(g.b1, 3)}, length ${fLen(g.L, 3)}; limits 10 m and 100 m).`, ['a1', 'b1', 'len']);
    if (g.L < LIM.len[0]) return fail(s, `The optimum horn for ${s.gain} dBi is barely wider than the feed (flare length ${fLen(g.L, 3)}, below 10 µm). Ask for more gain.`, ['a1', 'b1', 'len']);
    if (type !== 'e-sectoral') s.a1 = g.a1;
    if (type !== 'h-sectoral') s.b1 = g.b1;
    s.len = g.L;
    if (Number.isFinite(g.rho1)) s.rho1 = g.rho1;
    if (Number.isFinite(g.rho2)) s.rho2 = g.rho2;
  } else if (solveLen) {
    const a1 = type === 'e-sectoral' ? a : s.a1;
    const b1 = type === 'h-sectoral' ? b : s.b1;
    const lMax = Math.min(LIM.len[1], 2e4 * lambda);
    const res = lengthForDirectivity(type, d0, a1, b1, a, b, lambda, lMax);
    if ('error' in res) {
      return fail(s, s.gain >= dB(res.dInf) ? `Even an infinitely long horn with this ${fLen(a1, 3)} × ${fLen(b1, 3)} aperture gives only ${dB(res.dInf).toFixed(2)} dBi (no phase error, 81 % taper efficiency). Enlarge the aperture or lower the target.` : `No length between ${fLen(lambda * 1e-3, 2)} and ${fLen(lMax, 3)} gives ${s.gain} dBi with this aperture.`, ['len']);
    }
    s.len = res.L;
    if (type !== 'h-sectoral') s.rho1 = apexDistance(b1, b, res.L);
    if (type !== 'e-sectoral') s.rho2 = apexDistance(a1, a, res.L);
    if (res.L < LIM.len[0]) return fail(s, `${s.gain} dBi needs a flare only ${fLen(res.L, 3)} long (below 10 µm): the aperture alone almost gives the target. Lower the aperture or raise the target.`, ['len']);
    const rhoMax = Math.max(type !== 'h-sectoral' ? s.rho1 : 0, type !== 'e-sectoral' ? s.rho2 : 0);
    if (rhoMax > LIM.rho[1]) return fail(s, `The solved length puts the flare apex ${fLen(rhoMax, 3)} away (limit 1000 km): the aperture is barely wider than the feed. Widen the aperture.`, ['len']);
  }

  // ── forward (in "rho" mode the solved / designed horn is described by its apex distances)
  const geomState: HornState = solveDesign || solveLen ? { ...s, lenMode: 'L' } : s;
  const geo = geometryOf(geomState, lambda);
  const D = directivity(geo);
  const G = dB(D);
  const gInBox = G >= G_LIM[0] && G <= G_LIM[1];
  if (s.solveFor === 'gain' && gInBox) s.gain = G;
  const pe = phaseErrors(geo);
  const patE = (th: number) => patternE(geo, th);
  const patH = (th: number) => patternH(geo, th);
  const hpE = beamwidth(patE, -3.0103);
  const hpH = beamwidth(patH, -3.0103);
  const bw10E = beamwidth(patE, -10);
  const bw10H = beamwidth(patH, -10);
  const area = geo.a1 * geo.b1;
  const eap = (D * lambda * lambda) / (4 * Math.PI * area);
  const ae = (D * lambda * lambda) / (4 * Math.PI);
  const diag = Math.hypot(geo.a1, geo.b1);
  const rff = (2 * diag * diag) / lambda;
  const fcFeed = C0 / (2 * a);
  const fcFeed2 = Math.min(C0 / a, C0 / (2 * b));
  const rhoE = Number.isFinite(geo.rho1) ? Math.hypot(geo.rho1, geo.b1 / 2) : null;
  const rhoH = Number.isFinite(geo.rho2) ? Math.hypot(geo.rho2, geo.a1 / 2) : null;
  const psiE = Number.isFinite(geo.rho1) ? Math.atan(geo.b1 / 2 / geo.rho1) : 0;
  const psiH = Number.isFinite(geo.rho2) ? Math.atan(geo.a1 / 2 / geo.rho2) : 0;

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | boolean | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  // ── headline
  const primary: ResultItem[] = [];
  if (solveDesign) {
    if (type !== 'e-sectoral') primary.push(item('a1', 'Aperture width (H)', geo.a1, 'm', fLen(geo.a1), { symbol: 'a₁', primary: true, solved: true, note: `${(geo.a1 / lambda).toFixed(3)} λ` }));
    if (type !== 'h-sectoral') primary.push(item('b1', 'Aperture height (E)', geo.b1, 'm', fLen(geo.b1), { symbol: 'b₁', primary: true, solved: true, note: `${(geo.b1 / lambda).toFixed(3)} λ` }));
  }
  if (solveDesign || solveLen) primary.push(item('len', 'Axial flare length', s.len, 'm', fLen(s.len), { symbol: 'L', primary: true, solved: true, note: `${(s.len / lambda).toFixed(3)} λ (p_e = p_h)` }));
  primary.push(item('gain', 'Gain', gInBox ? G : null, 'dBi', `${G.toFixed(2)} dBi`, { symbol: 'G', primary: true, solved: s.solveFor === 'gain', note: !gInBox ? 'outside the ±150 dBi box range' : s.solveFor === 'gain' ? `${D.toPrecision(4)} × isotropic` : 'target (met exactly)' }));
  // beamwidths and efficiency are cards while there is room (at most 5 cards), otherwise table rows
  const extras: ResultItem[] = [
    item('hpbwE', 'E-plane beamwidth', hpE != null ? hpE * DEG : null, '°', fDeg(hpE), { symbol: 'θ_E', note: '−3 dB, full width', group: 'Pattern' }),
    item('hpbwH', 'H-plane beamwidth', hpH != null ? hpH * DEG : null, '°', fDeg(hpH), { symbol: 'θ_H', note: '−3 dB, full width', group: 'Pattern' }),
    item('eap', 'Aperture efficiency', eap, '', `${(eap * 100).toFixed(1)} %`, { symbol: 'ε_ap', note: 'G λ²/(4π a₁b₁); optimum horns ≈ 50 %', group: 'Aperture' }),
  ];
  const extraRows: ResultItem[] = [];
  for (const x of extras) {
    if (primary.length < 5) primary.push({ ...x, primary: true, group: undefined });
    else extraRows.push(x);
  }

  const gA = 'Aperture';
  const rest: ResultItem[] = [...extraRows];
  if (!solveDesign) {
    if (type !== 'e-sectoral') rest.push(item('a1', 'Aperture width (H)', geo.a1, 'm', fLen(geo.a1), { symbol: 'a₁', group: gA, note: `${(geo.a1 / lambda).toFixed(3)} λ` }));
    if (type !== 'h-sectoral') rest.push(item('b1', 'Aperture height (E)', geo.b1, 'm', fLen(geo.b1), { symbol: 'b₁', group: gA, note: `${(geo.b1 / lambda).toFixed(3)} λ` }));
  }
  rest.push(
    item('lambda', 'Wavelength', lambda, 'm', fLen(lambda), { symbol: 'λ', group: gA }),
    item('ae', 'Effective area', ae, 'm²', ae >= 1e-2 ? `${ae.toPrecision(4)} m²` : `${(ae * 1e4).toPrecision(4)} cm²`, { symbol: 'A_e', group: gA }),
    item('rff', 'Far-field distance', rff, 'm', fLen(rff), { symbol: '2D²/λ', group: gA, note: `D = diagonal ${fLen(diag, 3)}` }),
  );
  const gF = 'Flare geometry';
  rest.push(
    item('s', 'E-plane phase error', pe.s, 'λ', `s = ${pe.s.toFixed(4)} (${(pe.s * 360).toFixed(1)}°)`, { group: gF, note: 'optimum 1/4', tone: pe.s > 0.5 ? 'warn' : '' }),
    item('t', 'H-plane phase error', pe.t, 'λ', `t = ${pe.t.toFixed(4)} (${(pe.t * 360).toFixed(1)}°)`, { group: gF, note: 'optimum 3/8', tone: pe.t > 0.75 ? 'warn' : '' }),
  );
  const rhoItem = (key: 'rho1' | 'rho2', label: string, v: number) =>
    item(key, label, Number.isFinite(v) ? v : null, 'm', Number.isFinite(v) ? fLen(v) : '∞ (not flared)', { symbol: key === 'rho1' ? 'ρ₁' : 'ρ₂', group: gF, solved: (solveDesign || solveLen) && Number.isFinite(v) });
  rest.push(rhoItem('rho1', 'E-plane apex distance', geo.rho1), rhoItem('rho2', 'H-plane apex distance', geo.rho2));
  if (rhoE != null) rest.push(item('rhoE', 'E-plane slant length', rhoE, 'm', fLen(rhoE), { symbol: 'ρ_e', group: gF, note: `half-angle ${(psiE * DEG).toFixed(1)}°` }));
  if (rhoH != null) rest.push(item('rhoH', 'H-plane slant length', rhoH, 'm', fLen(rhoH), { symbol: 'ρ_h', group: gF, note: `half-angle ${(psiH * DEG).toFixed(1)}°` }));
  let realizable = true;
  if (s.lenMode === 'rho' && !solveDesign && !solveLen && type === 'pyramidal' && geo.pe != null && geo.ph != null) {
    const mis = Math.abs(geo.pe - geo.ph) / Math.max(geo.pe, geo.ph);
    realizable = mis <= 0.01;
    rest.push(
      item('pe', 'E-plane flare length', geo.pe, 'm', fLen(geo.pe), { symbol: 'p_e', group: 'Realisability (pe = ph)' }),
      item('ph', 'H-plane flare length', geo.ph, 'm', fLen(geo.ph), { symbol: 'p_h', group: 'Realisability (pe = ph)' }),
      item('realizable', 'Buildable as one horn', realizable, '', realizable ? 'yes' : `no (differ by ${(mis * 100).toFixed(1)} %)`, { group: 'Realisability (pe = ph)', tone: realizable ? 'pass' : mis <= 0.05 ? 'warn' : 'fail' }),
    );
  } else if (!(solveDesign || solveLen) && s.lenMode !== 'rho') {
    // nothing: one axial length is buildable by construction
  }
  rest.push(
    item('bw10E', 'E-plane −10 dB width', bw10E != null ? bw10E * DEG : null, '°', fDeg(bw10E), { group: 'Pattern' }),
    item('bw10H', 'H-plane −10 dB width', bw10H != null ? bw10H * DEG : null, '°', fDeg(bw10H), { group: 'Pattern', note: 'edge taper for a reflector feed' }),
    item('fcFeed', 'Feed TE₁₀ cutoff', fcFeed, 'Hz', si(fcFeed, 'Hz', 4), { group: 'Feed', tone: s.f <= fcFeed ? 'fail' : '' }),
    item('fFeedMax', 'Feed single-mode limit', fcFeed2, 'Hz', si(fcFeed2, 'Hz', 4), { group: 'Feed', note: 'TE₂₀ / TE₀₁ cutoff', tone: s.f >= fcFeed2 ? 'warn' : '' }),
  );

  // Balanis’ closed-form procedure, for comparison with the exact solve
  if (solveDesign && type === 'pyramidal') {
    const bd = balanisDesign(d0, lambda, a, b);
    if (bd) {
      const L = (bd.pe + bd.ph) / 2;
      const gBal = dB(directivity({ a1: bd.a1, b1: bd.b1, rho1: apexDistance(bd.b1, b, L), rho2: apexDistance(bd.a1, a, L), lambda }));
      const g = 'Balanis closed-form design (ε_ap = 0.51)';
      rest.push(
        item('balChi', 'χ (eq. 13-56)', bd.chi, '', bd.chi.toFixed(4), { group: g }),
        item('balA1', 'a₁', bd.a1, 'm', `${fLen(bd.a1)} (${(bd.a1 / lambda).toFixed(4)} λ)`, { group: g }),
        item('balB1', 'b₁', bd.b1, 'm', `${fLen(bd.b1)} (${(bd.b1 / lambda).toFixed(4)} λ)`, { group: g }),
        item('balPe', 'p_e = p_h', bd.pe, 'm', `${fLen(bd.pe)} / ${fLen(bd.ph)}`, { group: g }),
        item('balGain', 'Its gain (aperture model)', gBal, 'dBi', `${gBal.toFixed(2)} dBi`, { group: g, note: `target ${s.gain} dBi` }),
      );
    }
  }
  report.results = [...primary, ...rest];

  // ── warnings
  if (s.f <= fcFeed) warnings.push(`The feed guide is below its TE₁₀ cutoff (${si(fcFeed, 'Hz', 4)}): nothing reaches the horn. Use a larger feed or a higher frequency.`);
  else if (s.f < 1.25 * fcFeed) warnings.push(`f is only ${(s.f / fcFeed).toFixed(2)} × the feed cutoff: the feed is lossy and dispersive there. Use the feed inside its recommended band (1.25–1.9 f_c).`);
  if (s.f >= fcFeed2) warnings.push(`The feed is overmoded at this frequency (TE₂₀/TE₀₁ cut in at ${si(fcFeed2, 'Hz', 4)}); the horn pattern will be distorted by higher modes. Use a smaller feed.`);
  const flaredSmall = (type !== 'e-sectoral' && geo.a1 < lambda) || (type !== 'h-sectoral' && geo.b1 < lambda);
  if (flaredSmall) warnings.push(`A flared aperture dimension is under one wavelength (λ = ${fLen(lambda, 3)}): the aperture-field model ignores edge diffraction and reflections at the mouth, and can be off by more than 1 dB. Treat the result as approximate or enlarge the aperture.`);
  if (pe.s > 0.5 || pe.t > 0.75) warnings.push(`Phase error is more than twice the optimum (s = ${pe.s.toFixed(2)}, t = ${pe.t.toFixed(2)}; optimum 0.25 / 0.375): the horn is too short for its aperture, so the gain is below its peak and the beam broadens. Lengthen the horn or reduce the aperture.`);
  if (beamSplit(patE) || beamSplit(patH)) warnings.push('The pattern rises off boresight: the phase error is so large that the main beam splits. Lengthen the horn.');
  if (!realizable) warnings.push(`p_e = ${fLen(geo.pe!)} and p_h = ${fLen(geo.ph!)} differ: no single pyramidal horn has these apex distances (Balanis §13.3). Adjust ρ₁ or ρ₂ until p_e = p_h, or enter the axial length instead.`);
  if (hpE == null || hpH == null) notes.push('The pattern does not fall to −3 dB within ±90° in one plane: the aperture is too small to form a beam there.');
  notes.push(
    'Aperture model of Balanis ch. 13: TE₁₀ amplitude with a quadratic phase across the mouth and the Huygens factor (1 + cos θ)/2. It is accurate for the main beam and first sidelobes; back lobes and the E-plane edge diffraction are not modelled.',
    'Gain equals directivity: wall loss of a horn is usually below 0.1 dB, and the feed is assumed matched.',
  );
  if (solveDesign) notes.push(type === 'pyramidal' ? 'Optimum design: t = 3/8 and s = 1/4 exactly, with p_e = p_h; the aperture is sized so that the full aperture-model gain hits the target (Balanis’ closed form, shown below, assumes ε_ap = 0.51).' : `Optimum sectoral horn: ${type === 'e-sectoral' ? 's = 1/4 (b₁ = √(2λρ₁))' : 't = 3/8 (a₁ = √(3λρ₂))'}, sized for the target gain.`);
  if (solveLen) notes.push('Length solve: the longest length that gives the target with this aperture (beyond it the gain only rises toward the zero-phase-error limit).');

  report.status = s.f <= fcFeed ? { text: 'FEED CUT OFF', tone: 'fail' } : !realizable ? { text: 'NOT BUILDABLE', tone: 'fail' } : undefined;
  report.summary = `${TYPES.find((t) => t.value === type)!.label.split(' (')[0]} horn · ${fLen(geo.a1, 3)} × ${fLen(geo.b1, 3)} aperture · L ${geo.L != null ? fLen(geo.L, 3) : '—'} · ${si(s.f, 'Hz', 4)} · ${G.toFixed(2)} dBi`;
  report.details = { geom: geo, D, G, s: pe.s, t: pe.t, hpbwE: hpE, hpbwH: hpH, eap, lambda };
  report.graphs = graphs(s, geo, G, hpE, hpH, fcFeed);
  return report;
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

function graphs(s: HornState, geo: HornGeom, G: number, hpE: number | null, hpH: number | null, fcFeed: number): GraphSpec[] {
  const out: GraphSpec[] = [];
  const th = linspace(-90, 90, 361);
  const toDb = (v: number) => Math.max(20 * Math.log10(Math.max(v, 1e-6)), -60);
  out.push({
    id: 'pattern',
    title: 'Radiation pattern',
    subtitle: `Normalised field, aperture model · −3 dB widths: E ${hpE != null ? `${(hpE * DEG).toFixed(1)}°` : '> 180°'}, H ${hpH != null ? `${(hpH * DEG).toFixed(1)}°` : '> 180°'}`,
    x: { label: 'Angle from boresight θ', unit: '°' },
    y: [{ id: 'p', label: 'Relative level', unit: 'dB', min: -40, max: 0 }],
    series: [
      { label: 'E-plane', x: th, y: th.map((d) => toDb(patternE(geo, Math.abs(d) / DEG))), width: 2, color: '#1f4e5f' },
      { label: 'H-plane', x: th, y: th.map((d) => toDb(patternH(geo, Math.abs(d) / DEG))), width: 2, color: '#c47b17', dash: [6, 3] },
    ],
    hlines: [{ value: -3.0103, label: '−3 dB', color: '#9a8f7a', dash: [3, 3] }],
    markers: [...(hpE != null ? [{ x: (hpE * DEG) / 2, y: -3.0103, axis: 'p', color: '#1f4e5f' }] : []), ...(hpH != null ? [{ x: (-hpH * DEG) / 2, y: -3.0103, axis: 'p', color: '#c47b17' }] : [])],
    xRange: [-90, 90],
  });

  // gain and aperture efficiency vs frequency, same physical horn
  const f0 = Math.max(0.6 * s.f, 1.05 * fcFeed);
  const f1 = Math.max(1.6 * s.f, 1.2 * f0);
  const fs = linspace(f0, f1, 121);
  const gs = fs.map((ff) => directivity({ ...geo, lambda: C0 / ff }));
  out.push({
    id: 'gain-f',
    title: 'Gain vs frequency',
    subtitle: 'Same horn; dimensions fixed',
    x: { label: 'Frequency', unit: 'Hz' },
    y: [
      { id: 'g', label: 'Gain', unit: 'dBi' },
      { id: 'e', label: 'Aperture efficiency', unit: '%', side: 'right', min: 0, max: 100 },
    ],
    series: [
      { label: 'Gain', x: fs, y: gs.map(dB), axis: 'g', width: 2.2, color: '#1f4e5f' },
      { label: 'εap', x: fs, y: gs.map((d, i) => (100 * d * (C0 / fs[i]) ** 2) / (4 * Math.PI * geo.a1 * geo.b1)), axis: 'e', width: 1.5, color: '#c47b17', dash: [5, 3] },
    ],
    vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz', 3)}`, color: '#9a8f7a' }],
    markers: [{ x: s.f, y: G, axis: 'g', label: `${G.toFixed(2)} dBi` }],
  });

  // directivity vs aperture size with the apex distance fixed (Balanis Figs. 13.8 / 13.15 style)
  const lam = geo.lambda;
  const series: NonNullable<GraphSpec['series']> = [];
  const markers: NonNullable<GraphSpec['markers']> = [];
  if (Number.isFinite(geo.rho1)) {
    const xs = linspace(Math.max(s.b / lam, 0.3), Math.max(3 * Math.sqrt((2 * geo.rho1) / lam), 1.3 * (geo.b1 / lam)), 160);
    series.push({ label: `vary b₁ (ρ₁ = ${(geo.rho1 / lam).toFixed(1)} λ)`, x: xs, y: xs.map((x) => dB(directivity({ ...geo, b1: x * lam }))), width: 2, color: '#1f4e5f' });
    markers.push({ x: geo.b1 / lam, y: G, label: 'b₁', color: '#1f4e5f' });
  }
  if (Number.isFinite(geo.rho2)) {
    const xs = linspace(Math.max(s.a / lam, 0.3), Math.max(3 * Math.sqrt((3 * geo.rho2) / lam), 1.3 * (geo.a1 / lam)), 160);
    series.push({ label: `vary a₁ (ρ₂ = ${(geo.rho2 / lam).toFixed(1)} λ)`, x: xs, y: xs.map((x) => dB(directivity({ ...geo, a1: x * lam }))), width: 2, color: '#c47b17', dash: [6, 3] });
    markers.push({ x: geo.a1 / lam, y: G, label: 'a₁', color: '#c47b17' });
  }
  const vl: NonNullable<GraphSpec['vlines']> = [];
  if (Number.isFinite(geo.rho1)) vl.push({ value: Math.sqrt((2 * geo.rho1) / lam), label: 'b₁ opt', color: '#1f4e5f', dash: [2, 3] });
  if (Number.isFinite(geo.rho2)) vl.push({ value: Math.sqrt((3 * geo.rho2) / lam), label: 'a₁ opt', color: '#c47b17', dash: [2, 3] });
  out.push({
    id: 'gain-aperture',
    title: 'Gain vs aperture',
    subtitle: 'Apex distances held: the peak is the optimum (s = 1/4, t = 3/8)',
    x: { label: 'Aperture dimension / λ', unit: '' },
    y: [{ id: 'y', label: 'Gain', unit: 'dBi' }],
    series,
    vlines: vl,
    markers,
  });
  return out;
}

export const def: CalcDef<HornState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Balanis aperture model (Antenna Theory, ch. 13): TE₁₀ amplitude with quadratic phase k(x²/2ρ₂ + y²/2ρ₁) across the mouth, far field via Fresnel integrals with the (1 + cos θ)/2 Huygens factor; directivity 4π|∫E|²/(λ²∫|E|²) = Balanis eq. 13-52; HPBW from the computed patterns; optimum-gain design with s = 1/4, t = 3/8 and p_e = p_h solved exactly for the target gain, plus Balanis’ closed-form procedure (eqs. 13-56 … 13-58) for comparison; Fresnel integrals per Numerical Recipes §6.8.',
  fields,
  defaults,
  // Round trips from an analysed horn are not expected to return its dimensions: "design" builds the
  // optimum horn for that gain (a different horn unless the analysed one was optimum), and ρ₁, ρ₂ (or L in
  // the ρ mode) are outputs there that the analysis does not write back, so the state keeps older values.
  solve: {
    default: 'gain',
    analysis: 'gain',
    options: [
      { key: 'gain', label: 'Gain and beamwidths from the dimensions (analysis)' },
      { key: 'design', label: 'Optimum-gain horn for a target gain' },
      { key: 'len', label: 'Axial length for a target gain (aperture held)' },
    ],
  },
  compute,
  sync: (s) => {
    const w = WR_SIZES[s.wr];
    if (w && (Math.abs(w.a * INCH - s.a) > 1e-9 || Math.abs(w.b * INCH - s.b) > 1e-9)) s.wr = 'Custom';
  },
  examples: [
    { id: 'x-band-19dbi', label: 'X-band pyramidal horn on WR-90 at 10 GHz', state: defaults() },
    { id: 'balanis-13-6', label: 'Balanis ex. 13.6: optimum 22.6 dBi horn at 11 GHz on WR-90', state: { solveFor: 'design', f: 11e9, gain: 22.6, type: 'pyramidal', lenMode: 'L', wr: 'WR-90', a: 0.9 * INCH, b: 0.4 * INCH } },
    { id: 'e-sectoral', label: 'E-plane sectoral horn, b₁ = 60 mm, L = 100 mm', state: { solveFor: 'gain', f: 10e9, type: 'e-sectoral', lenMode: 'L', wr: 'WR-90', a: 0.9 * INCH, b: 0.4 * INCH, b1: 60e-3, len: 100e-3 } },
    { id: 'h-sectoral-design', label: 'Design: optimum 13 dBi H-plane sectoral horn at 5.8 GHz', state: { solveFor: 'design', f: 5.8e9, gain: 13, type: 'h-sectoral', lenMode: 'L', wr: 'WR-159', a: 1.59 * INCH, b: 0.795 * INCH } },
    { id: 'len-for-gain', label: 'Length for 22 dBi with a 150 × 120 mm aperture (10 GHz)', state: { solveFor: 'len', f: 10e9, gain: 22, type: 'pyramidal', lenMode: 'L', wr: 'WR-90', a: 0.9 * INCH, b: 0.4 * INCH, a1: 150e-3, b1: 120e-3 } },
    { id: 'rho-unbuildable', label: 'Apex distances ρ₁ = 5λ, ρ₂ = 7λ (10 GHz): not buildable', state: { solveFor: 'gain', f: 10e9, type: 'pyramidal', lenMode: 'rho', wr: 'WR-90', a: 0.9 * INCH, b: 0.4 * INCH, a1: 5.5 * LAM10, b1: 2.75 * LAM10, rho1: 5 * LAM10, rho2: 7 * LAM10 } },
  ],
};
