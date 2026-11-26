/** Thermal via array — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, U_ROUGH } from '@/core/unitsets';
import { type Fill, K_AIR, type ThermalViaGeom, arrayShape, maxFit, thermalVias } from './model';

export const ID = 'pcb/via-thermal-resistance';

export const FILLS: { value: Fill; label: string; k: number | null }[] = [
  { value: 'none', label: 'Unfilled (air)', k: K_AIR },
  { value: 'epoxy', label: 'Non-conductive epoxy plug', k: 0.35 },
  { value: 'solder', label: 'Solder-filled (SnAgCu)', k: 57.3 },
  { value: 'cu', label: 'Copper-filled (plated shut)', k: null },
  { value: 'custom', label: 'Other fill (enter k)', k: null },
];

export const N_MAX = 2000;

export interface ThermalViaState {
  solveFor: 'theta' | 'n' | 'd';
  theta: number;
  p: number;
  n: number;
  d: number;
  dUnit: string;
  t: number;
  tUnit: string;
  pitch: number;
  pitchUnit: string;
  fill: Fill;
  kFill: number;
  padW: number;
  padWUnit: string;
  padL: number;
  padLUnit: string;
  h: number;
  hUnit: string;
  kLam: number;
  nCu: number;
  tCu: number;
  tCuUnit: string;
  kCu: number;
}

export const defaults = (): ThermalViaState => ({
  solveFor: 'theta',
  theta: 20.48,
  p: 1,
  n: 9,
  d: 0.3e-3,
  dUnit: 'mm',
  t: 25e-6,
  tUnit: 'µm',
  pitch: 1.0e-3,
  pitchUnit: 'mm',
  fill: 'none',
  kFill: K_AIR,
  padW: 3.3e-3,
  padWUnit: 'mm',
  padL: 3.3e-3,
  padLUnit: 'mm',
  h: 1.6e-3,
  hUnit: 'mm',
  kLam: 0.29,
  nCu: 4,
  tCu: 35e-6,
  tCuUnit: 'µm',
  kCu: 385,
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Thermal path',
    note: 'Click ◎ on N or d to meet a target θ.',
    fields: [
      { kind: 'number', key: 'theta', symbol: 'θ', label: 'Board thermal resistance', suffix: 'K/W', min: 1e-4, max: 1e7, solvable: true, help: 'Top pad to bottom copper through the vias and the laminate under the pad, in parallel. The target when solving for N or d.' },
      { kind: 'number', key: 'p', symbol: 'P', label: 'Power through the pad', unit: 'W', min: 0, max: 1e4, help: 'Heat flowing from the device into the pad and through the board; gives the temperature drop across the board.' },
    ],
  },
  {
    kind: 'section',
    title: 'Vias',
    fields: [
      { kind: 'number', key: 'n', symbol: 'N', label: 'Number of vias', min: 1, max: N_MAX, integer: true, solvable: true, help: 'Thermal vias inside the pad. Solving gives the smallest whole number that meets the target θ, up to as many as fit the pad at the pitch.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Drill diameter', units: U_LEN_PCB, unitKey: 'dUnit', min: 50e-6, max: 6e-3, solvable: true, onSolve: (_s, r) => solveDrill(r as ThermalViaState), help: 'Drilled hole: the outside of the plating.' },
      { kind: 'number', key: 't', symbol: 't', label: 'Plating thickness', units: U_ROUGH, unitKey: 'tUnit', min: 1e-6, max: 150e-6, help: 'Copper on the hole wall. IPC-6012: at least 20 µm average (Class 1–2), 25 µm (Class 3).' },
      { kind: 'number', key: 'pitch', symbol: 'p', label: 'Via pitch', units: U_LEN_PCB, unitKey: 'pitchUnit', min: 0.1e-3, max: 50e-3, help: 'Centre-to-centre spacing of the grid; used to check that the vias fit in the pad and to draw the array.' },
      { kind: 'select', key: 'fill', label: 'Via fill', options: FILLS.map(({ value, label }) => ({ value, label })), apply: (v, s) => setFill(s as ThermalViaState, v) },
      { kind: 'number', key: 'kFill', symbol: 'k_fill', label: 'Fill conductivity', suffix: 'W/m·K', min: 0.01, max: 500, visible: (s) => s.fill !== 'cu', help: 'Air 0.026; non-conductive plugging epoxy about 0.3–0.5 (see its data sheet); SnAgCu solder 57.3. A copper fill uses k_Cu.' },
    ],
  },
  {
    kind: 'section',
    title: 'Pad & board',
    fields: [
      { kind: 'number', key: 'padW', symbol: 'W', label: 'Pad width', units: U_LEN_PCB, unitKey: 'padWUnit', min: 0.1e-3, max: 100e-3, help: 'Exposed (thermal) pad size, e.g. the land under a QFN’s die paddle.' },
      { kind: 'number', key: 'padL', symbol: 'L', label: 'Pad length', units: U_LEN_PCB, unitKey: 'padLUnit', min: 0.1e-3, max: 100e-3 },
      { kind: 'number', key: 'h', symbol: 'h', label: 'Board thickness', units: U_LEN_PCB, unitKey: 'hUnit', min: 0.1e-3, max: 10e-3, help: 'Via length, from the top pad to the bottom copper.' },
      { kind: 'number', key: 'kLam', symbol: 'k_lam', label: 'Laminate k (through)', suffix: 'W/m·K', min: 0.05, max: 50, help: 'Through-plane thermal conductivity of the laminate. FR-4 ≈ 0.29 (0.81 in-plane); ceramic-filled RF laminates 0.6–0.7.' },
      { kind: 'number', key: 'nCu', symbol: 'N_Cu', label: 'Copper layers', min: 0, max: 60, integer: true, help: 'Copper layers stacked under the pad (all of them, including the outer two). They add a little copper to the laminate path.' },
      { kind: 'number', key: 'tCu', symbol: 't_Cu', label: 'Copper per layer', units: U_ROUGH, unitKey: 'tCuUnit', min: 0, max: 500e-6, help: '35 µm = 1 oz/ft².' },
      { kind: 'number', key: 'kCu', symbol: 'k_Cu', label: 'Copper conductivity', suffix: 'W/m·K', min: 50, max: 420, help: 'Pure copper ≈ 390–400 W/m·K; electroplated copper a little lower.' },
    ],
  },
];

/**
 * ◎ on the drill. After an N solve the θ box still holds the target, which the whole-number N only undercuts; carry the
 * θ actually achieved instead, so the drill solve starts from the array on screen rather than from an unreachable target.
 */
function solveDrill(s: ThermalViaState): void {
  if (s.solveFor === 'n' && s.d > 2 * s.t) {
    const th = thermalVias(geom(s)).theta;
    if (Number.isFinite(th) && th > 0) s.theta = th;
  }
  s.solveFor = 'd';
}

function setFill(s: ThermalViaState, v: Fill): void {
  const f = FILLS.find((x) => x.value === v);
  if (f?.k != null) s.kFill = f.k;
}

const fLen = (m: number) => si(m, 'm', 4);
const fTh = (x: number) => (Number.isFinite(x) ? `${x.toPrecision(4)} K/W` : '∞ (no path)');

function num(name: string, v: unknown, min = 0, strict = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (strict ? !(v > min) : !(v >= min)) throw new Error(`${name} must be ${strict ? '>' : '≥'} ${min}.`);
  return v;
}

function fail(msg: string, s: ThermalViaState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

const geom = (s: ThermalViaState): ThermalViaGeom => ({ n: s.n, d: s.d, t: s.t, h: s.h, padW: s.padW, padL: s.padL, kCu: s.kCu, kFill: s.kFill, fill: s.fill, kLam: s.kLam, nCu: s.nCu, tCu: s.tCu });

export function compute(st: ThermalViaState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness (§12.3) triage: "error-after-edit" flags are typed numbers that make the array impossible
 * (holes overlapping or not fitting the pad, plating filling the drill, copper layers as thick as the board) or a target θ out of
 * reach; each message says what limits it. "roundtrip" flags after an N solve are the whole-number rounding (see run).
 * "big-jump" (low) on a fill switch is physics: an air core and a copper core differ by four orders of magnitude.
 */
function run(st: ThermalViaState): CalcReport {
  const s: ThermalViaState = { ...st };
  const k = s.solveFor;
  if (!['theta', 'n', 'd'].includes(k)) throw new Error('solveFor must be theta, n or d.');
  if (!FILLS.some((f) => f.value === s.fill)) throw new Error('Unknown via fill.');
  if (k !== 'n' && !(Number.isInteger(num('Number of vias', s.n)) && s.n >= 1)) throw new Error('Number of vias must be a whole number ≥ 1.');
  if (k !== 'd') num('Drill diameter', s.d);
  num('Plating thickness', s.t);
  num('Via pitch', s.pitch);
  num('Fill conductivity', s.kFill);
  num('Pad width', s.padW);
  num('Pad length', s.padL);
  num('Board thickness', s.h);
  num('Laminate conductivity', s.kLam);
  num('Copper layers', s.nCu, 0, false);
  num('Copper per layer', s.tCu, 0, false);
  num('Copper conductivity', s.kCu);
  num('Power', s.p, 0, false);
  if (k !== 'theta') num('Target θ', s.theta);
  if (s.nCu * s.tCu >= s.h) throw new Error(`${s.nCu} copper layers of ${fLen(s.tCu)} are as thick as the ${fLen(s.h)} board.`);

  let altNote = '';
  if (k === 'n') {
    // Smallest whole N that meets the target, by a plain scan (θ normally falls with every via added, but not when the
    // laminate conducts better per area than the vias that replace it, e.g. a ceramic-filled or metal-core dielectric).
    // Integer answer: θ achieved is at or just below the target. Mode-switch harness: from this state a solve for d or
    // an analysis returns θ(N), not the target, so it flags a "roundtrip" medium; that is the rounding, not a bug.
    if (!(s.d > 2 * s.t)) throw new Error(`Plating ${fLen(s.t)} fills a ${fLen(s.d)} drill.`);
    const th = (n: number) => thermalVias({ ...geom(s), n }).theta;
    // the scan stops at the most vias of this drill that fit the pad at this pitch
    const fit = Math.min(N_MAX, maxFit(s.d, s.pitch, s.padW, s.padL));
    if (fit < 1) return fail(`A ${fLen(s.d)} drill at ${fLen(s.pitch)} pitch does not fit the ${fLen(s.padW)} × ${fLen(s.padL)} pad.`, s);
    let n = 0;
    for (let i = 1; i <= fit; i++) {
      if (th(i) <= s.theta * (1 + 1e-9)) {
        n = i;
        break;
      }
    }
    if (!n) return fail(`θ = ${fTh(s.theta)} is out of reach within this pad: at most ${fit} vias of ${fLen(s.d)} fit at ${fLen(s.pitch)} pitch, giving θ = ${fTh(th(fit))}. Fill the vias, use a larger pad, a thinner board or a tighter pitch.`, s);
    if (n === 1) altNote = `One via already meets θ = ${fTh(s.theta)}: the laminate under the pad and a single via do it.`;
    s.n = n;
  } else if (k === 'd') {
    const lo = Math.max(2 * s.t * (1 + 1e-6), 50e-6);
    const hi = Math.min(6e-3, s.padW, s.padL, s.pitch);
    if (!(hi > lo)) return fail(`No drill fits: it must exceed twice the plating (${fLen(2 * s.t)}) and stay within the ${fLen(Math.min(s.padW, s.padL, s.pitch))} pad / pitch.`, s);
    const g = (d: number) => thermalVias({ ...geom(s), d }).theta - s.theta;
    const a = g(lo);
    const b = g(hi);
    if (!(a * b <= 0)) return fail(`No drill between ${fLen(lo)} and ${fLen(hi)} (the pitch or pad limit) gives θ = ${fTh(s.theta)} with ${s.n} vias: the range is ${fTh(Math.min(a, b) + s.theta)} … ${fTh(Math.max(a, b) + s.theta)}. Add vias, fill them, or change the target.`, s);
    s.d = brent(g, lo, hi, 1e-15);
  }
  if (!(s.d > 2 * s.t)) throw new Error(`Plating ${fLen(s.t)} fills a ${fLen(s.d)} drill: it must be thinner than half the drill.`);
  // The array must fit the pad on its square grid: the N solve is limited to the vias that fit, so analysis holds the
  // same rule (an array the solve could never return is an input error, not a warning).
  if (!(s.pitch > s.d)) {
    const msg = `Pitch ${fLen(s.pitch)} is not larger than the ${fLen(s.d)} drill: neighbouring holes would overlap.`;
    if (k === 'd') return fail(`${msg} No drill below the pitch meets θ = ${fTh(s.theta)}.`, s);
    throw new Error(msg);
  }
  const fitN = maxFit(s.d, s.pitch, s.padW, s.padL);
  if (fitN < s.n) {
    const msg = `${s.n} vias of ${fLen(s.d)} at ${fLen(s.pitch)} pitch do not fit the ${fLen(s.padW)} × ${fLen(s.padL)} pad: at most ${fitN} do on a square grid. Reduce the pitch, the drill or the via count.`;
    if (k === 'd') return fail(`The ${fLen(s.d)} drill that meets θ = ${fTh(s.theta)} is too large: ${msg}`, s);
    throw new Error(msg);
  }
  const r = thermalVias(geom(s));
  if (!(r.lamArea > 0)) {
    if (k !== 'theta') return fail(`${s.n} holes of ${fLen(s.d)} cover more than the whole ${fLen(s.padW)} × ${fLen(s.padL)} pad.`, s);
    throw new Error(`${s.n} holes of ${fLen(s.d)} cover more than the whole ${fLen(s.padW)} × ${fLen(s.padL)} pad.`);
  }
  if (k === 'theta') {
    if (!(r.theta >= 1e-4 && r.theta <= 1e7)) return fail(`θ = ${fTh(r.theta)} is outside the field range.`, s);
    s.theta = r.theta;
  }
  const rep = report(s, r);
  if (altNote) rep.notes.unshift(altNote);
  return rep;
}

function report(s: ThermalViaState, r: ReturnType<typeof thermalVias>): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const fit = maxFit(s.d, s.pitch, s.padW, s.padL);
  const { cols, rows } = arrayShape(s.n, s.padW, s.padL);
  const dT = s.p * r.theta;
  const fillLabel = FILLS.find((f) => f.value === s.fill)!.label;
  const target = k !== 'theta';
  const prim: ResultItem[] = [];
  if (k === 'n') prim.push(item('n', 'Number of vias', s.n, '', `${s.n}`, { symbol: 'N', primary: true, solved: true, note: `smallest N for θ ≤ ${fTh(s.theta)}` }));
  if (k === 'd') prim.push(item('d', 'Drill diameter', s.d, 'm', fLen(s.d), { symbol: 'd', primary: true, solved: true, note: `${(s.d / 25.4e-6).toFixed(1)} mil · for θ = ${fTh(s.theta)}` }));
  prim.push(item(target ? 'thetaAch' : 'theta', target ? 'Board thermal resistance (achieved)' : 'Board thermal resistance', r.theta, 'K/W', fTh(r.theta), { symbol: 'θ', primary: true, solved: !target, note: target ? `target ${fTh(s.theta)}` : `${s.n} vias ∥ laminate` }));
  prim.push(item('dT', 'Temperature drop', dT, 'K', `${dT.toPrecision(4)} K`, { symbol: 'ΔT', primary: true, note: `at P = ${si(s.p, 'W', 3)}` }));
  prim.push(item('thetaVia', 'One via', r.thetaVia, 'K/W', fTh(r.thetaVia), { symbol: 'θ_via', primary: true, note: fillLabel }));
  const sec: ResultItem[] = [
    item('thetaPlate', 'Plating of one via', r.thetaPlate, 'K/W', fTh(r.thetaPlate), { symbol: 'θ_b', group: 'Paths', note: 'h / (k_Cu·π·t·(d − t))' }),
    item('thetaFill', 'Fill of one via', Number.isFinite(r.thetaFill) ? r.thetaFill : null, 'K/W', fTh(r.thetaFill), { symbol: 'θ_f', group: 'Paths', note: 'h / (k_fill·π·(d/2 − t)²)' }),
    item('thetaVias', `All ${s.n} vias`, r.thetaVias, 'K/W', fTh(r.thetaVias), { symbol: 'θ_vias', group: 'Paths', note: 'θ_via / N' }),
    item('thetaLam', 'Laminate under the pad', Number.isFinite(r.thetaLam) ? r.thetaLam : null, 'K/W', fTh(r.thetaLam), { symbol: 'θ_lam', group: 'Paths', note: `${s.nCu} Cu layers + laminate, area minus holes` }),
    item('viaShare', 'Heat carried by the vias', r.viaShare, '', `${(r.viaShare * 100).toFixed(1)} %`, { symbol: 'q_v/q', group: 'Paths' }),
    item('fit', 'Vias that fit the pad', fit, '', `${fit} at ${fLen(s.pitch)} pitch`, { symbol: 'N_fit', group: 'Layout', note: 'square grid, holes inside the pad' }),
    item('array', 'Array drawn', cols * rows, '', `${cols} × ${rows}${cols * rows > s.n ? ` (${s.n} used)` : ''}`, { group: 'Layout' }),
    item('holeFrac', 'Pad area drilled', 1 - r.lamArea / (s.padW * s.padL), '', `${((1 - r.lamArea / (s.padW * s.padL)) * 100).toFixed(1)} %`, { symbol: 'A_holes/A', group: 'Layout' }),
  ];
  rep.results = [...prim, ...sec];

  if (s.pitch < s.d * 1.5) rep.warnings.push(`Pitch ${fLen(s.pitch)} is under 1.5× the drill: the web of laminate between holes is thin and may crack in drilling. Keep at least the fabricator’s hole-to-hole spacing.`);
  if (s.h / s.d > 10) rep.warnings.push(`Aspect ratio ${(s.h / s.d).toFixed(1)}:1 is high for plating a thermal via evenly. Use a larger drill or check the fabricator’s limit.`);
  if (s.t < 20e-6 * (1 - 1e-9)) rep.warnings.push(`Plating ${si(s.t, 'm', 3)} is below the IPC-6012 minimum average of 20 µm.`);
  if (Math.min(s.padW, s.padL) < 2 * s.h) rep.notes.push(`The pad is small against the board thickness (${fLen(Math.min(s.padW, s.padL))} vs ${fLen(s.h)}): heat spreads sideways in the copper layers, which this 1-D model ignores, so the real θ is somewhat lower.`);
  if (s.fill === 'none') rep.notes.push('Unfilled vias in a soldered pad wick solder away from the joint. Tent, plug or fill them (IPC-4761), or keep them small (≤ 0.3 mm) as most QFN layout notes advise.');
  rep.notes.push(
    'One-dimensional model: heat flows straight down through the board under the pad. Spreading into the planes, the solder joint and the interface to a heatsink are outside it.',
    'The laminate under the pad is in parallel with the vias; its copper layers are added in series through the thickness (Shen et al. 2020).',
  );
  rep.summary = `${s.n} × ${fLen(s.d)} vias, ${si(s.t, 'm', 3)} plating, ${fillLabel.toLowerCase()} · ${fLen(s.padW)} × ${fLen(s.padL)} pad on ${fLen(s.h)} · θ ${fTh(r.theta)}`;
  rep.details = { ...r, fit, cols, rows };
  rep.graphs = graphs(s, r);
  return rep;
}

function graphs(s: ThermalViaState, r: ReturnType<typeof thermalVias>): GraphSpec[] {
  const nMax = Math.min(N_MAX, Math.max(25, 2 * s.n, maxFit(s.d, s.pitch, s.padW, s.padL)));
  const ns = Array.from({ length: nMax }, (_, i) => i + 1).filter((n) => thermalVias({ ...geom(s), n }).lamArea > 0);
  const th = ns.map((n) => thermalVias({ ...geom(s), n }).theta);
  const fit = maxFit(s.d, s.pitch, s.padW, s.padL);
  const dLo = Math.max(2.2 * s.t, 50e-6);
  const dHi = Math.max(3 * s.d, 0.8e-3);
  const ds = Array.from({ length: 121 }, (_, i) => dLo * (dHi / dLo) ** (i / 120));
  const colors: Record<Fill, string> = { none: '#4f8a8b', epoxy: '#9a8f7a', solder: '#6b5b95', cu: '#c47b17', custom: '#2f7d4f' };
  const fills = FILLS.filter((f) => f.value !== 'custom' || s.fill === 'custom');
  const target = s.solveFor !== 'theta';
  return [
    {
      id: 'theta-vs-n',
      title: 'θ vs number of vias',
      subtitle: `${fLen(s.d)} drill, ${FILLS.find((f) => f.value === s.fill)!.label.toLowerCase()}`,
      x: { label: 'Number of vias N', unit: '', integer: true },
      y: [{ id: 't', label: 'θ', unit: 'K/W', log: true }],
      series: [{ label: 'θ (vias ∥ laminate)', x: ns, y: th, width: 2.2 }],
      hlines: target ? [{ value: s.theta, label: `target ${s.theta.toPrecision(3)} K/W`, dash: [5, 4] }] : [],
      vlines: fit >= 1 && fit <= nMax ? [{ value: fit, label: `${fit} fit`, color: '#8b1e1e', dash: [5, 4] }] : [],
      markers: [{ x: s.n, y: r.theta, label: `${r.theta.toPrecision(3)} K/W` }],
    },
    {
      id: 'via-vs-d',
      title: 'One via vs drill and fill',
      subtitle: `t = ${si(s.t, 'm', 3)}, h = ${fLen(s.h)}`,
      x: { label: 'Drill diameter d', unit: 'm', log: true },
      y: [{ id: 'v', label: 'θ_via', unit: 'K/W', log: true }],
      legend: 'below',
      series: fills.map((f) => {
        const x = ds.filter((d) => d > 2.05 * s.t);
        const kf = f.value === 'custom' ? s.kFill : f.k ?? s.kCu;
        return { label: f.label, x, y: x.map((d) => thermalVias({ ...geom(s), d, n: 1, fill: f.value, kFill: kf }).thetaVia), color: colors[f.value], width: f.value === s.fill ? 2.4 : 1.2, dash: f.value === s.fill ? undefined : [5, 3] };
      }),
      vlines: [{ value: s.d, label: `d = ${fLen(s.d)}` }],
      markers: [{ x: s.d, y: r.thetaVia, label: `${r.thetaVia.toPrecision(3)} K/W` }],
    },
  ];
}

export const def: CalcDef<ThermalViaState> = {
  id: ID,
  version: '0.1.0',
  method:
    'One-dimensional conduction through the board under a pad: each via is its plating annulus h/(k_Cu·π·t·(d − t)) in parallel with its fill h/(k_fill·π·(d/2 − t)²); N vias in parallel with the remaining laminate (copper layers in series with the laminate through the thickness). Shen, Wang, Blaabjerg, Zhao, Long, IEEE Trans. Power Electron. 35(1) 2020, eqs. (2)–(4), with Fourier’s law (Incropera §3.1). The via count is the smallest whole number meeting the target θ; the drill is found by Brent root finding.',
  fields,
  defaults,
  solve: {
    default: 'theta',
    analysis: 'theta',
    options: [
      { key: 'theta', label: 'θ of the via array (analysis)' },
      { key: 'n', label: 'Number of vias N for a target θ' },
      { key: 'd', label: 'Drill diameter d for a target θ' },
    ],
  },
  compute,
  sync: (s) => {
    const f = FILLS.find((x) => x.value === s.fill);
    if (f && f.k != null && Math.abs(f.k - s.kFill) > 1e-12) s.fill = 'custom';
  },
  examples: [
    { id: 'default', label: 'QFN 3.3 mm pad, 3 × 3 unfilled 0.3 mm vias', state: defaults() },
    { id: 'qfn-target', label: 'Same pad: how many vias for 10 K/W?', state: { ...defaults(), solveFor: 'n', theta: 10, pitch: 0.65e-3, p: 2 } },
    { id: 'via-in-pad-cu', label: 'Via-in-pad: 4 × 4 copper-filled 0.25 mm vias', state: { ...defaults(), n: 16, d: 0.25e-3, pitch: 0.8e-3, fill: 'cu', kFill: K_AIR, padW: 3.5e-3, padL: 3.5e-3, p: 3 } },
    { id: 'dpak', label: 'DPAK tab, 5 × 5 solder-filled 0.4 mm vias', state: { ...defaults(), n: 25, d: 0.4e-3, pitch: 1.2e-3, fill: 'solder', kFill: 57.3, padW: 6.4e-3, padL: 6.2e-3, p: 2 } },
    { id: 'drill-for', label: '2 × 2 vias in a 2 mm pad: drill for 40 K/W', state: { ...defaults(), solveFor: 'd', theta: 40, n: 4, pitch: 0.9e-3, padW: 2e-3, padL: 2e-3 } },
  ],
};
