/** Microstrip impedance — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_COND, U_FREQ, U_LEN_PCB, U_ROUGH, U_THICK, withDefault } from '@/core/unitsets';
import { C0, NP_TO_DB, calcMicrostrip, fillingFactor, conductorLoss, dielectricLoss, epsEffKJ, microstripStatic, type MicrostripInputs } from './model';

/** Laminate presets: design Dk and typical loss tangent (manufacturer data sheets, ~10 GHz). */
export const MATERIALS: Record<string, { er: number; tanD: number } | null> = {
  Custom: null,
  'FR-4 (generic)': { er: 4.4, tanD: 0.02 },
  'RO4350B': { er: 3.66, tanD: 0.0037 },
  'RO4003C': { er: 3.55, tanD: 0.0027 },
  'RO3003': { er: 3.0, tanD: 0.001 },
  'RT/duroid 5880': { er: 2.2, tanD: 0.0009 },
  'PTFE (unfilled)': { er: 2.1, tanD: 0.0002 },
  'Alumina 99.6 %': { er: 9.9, tanD: 0.0001 },
};

export interface MicrostripState {
  solveFor: 'z0' | 'w' | 'h' | 'er';
  z0: number;
  w: number;
  wUnit: string;
  h: number;
  hUnit: string;
  t: number;
  tUnit: string;
  material: string;
  er: number;
  tanD: number;
  f: number;
  fUnit: string;
  sigma: number;
  sigmaUnit: string;
  rough: number;
  roughUnit: string;
  len: number;
  lenUnit: string;
}

export const defaults = (): MicrostripState => ({
  solveFor: 'w',
  z0: 50,
  w: 3.0e-3,
  wUnit: 'mm',
  h: 1.6e-3,
  hUnit: 'mm',
  t: 35e-6,
  tUnit: 'µm',
  material: 'FR-4 (generic)',
  er: 4.4,
  tanD: 0.02,
  f: 1e9,
  fUnit: 'GHz',
  sigma: 5.8e7,
  sigmaUnit: 'MS/m',
  rough: 0,
  roughUnit: 'µm',
  len: 50e-3,
  lenUnit: 'mm',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Line geometry',
    fields: [
      { kind: 'number', key: 'z0', symbol: 'Z₀', label: 'Characteristic impedance', unit: 'Ω', solvable: true, min: 1, max: 500, help: 'Target impedance when solving for W, H or εr; otherwise the calculated result.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: 1e-7, max: 1 },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Substrate height', units: U_LEN_PCB, unitKey: 'hUnit', solvable: true, min: 1e-7, max: 1, help: 'Dielectric thickness between the trace and its reference plane.' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 1e-3, help: '1 oz/ft² ≈ 35 µm (choose "oz" to type ounces). 0 = infinitely thin strip.' },
    ],
  },
  {
    kind: 'section',
    title: 'Substrate',
    fields: [
      {
        kind: 'select',
        key: 'material',
        label: 'Material preset',
        options: Object.keys(MATERIALS),
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m) {
            s.er = m.er;
            s.tanD = m.tanD;
            // Picking a laminate fixes εr: if εr was the unknown, the solve would overwrite the preset
            // and sync would bounce the dropdown back to Custom. Analyse the entered geometry instead.
            if (s.solveFor === 'er') s.solveFor = 'z0';
          }
        },
        help: 'Fills εr and tan δ with typical design values. Check your fabricator’s stack-up — FR-4 varies from about 3.8 to 4.6.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Relative permittivity', solvable: true, min: 1, max: 200 },
      { kind: 'number', key: 'tanD', symbol: 'tan δ', label: 'Loss tangent', min: 0, max: 1 },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency & loss',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets εeff(f) dispersion, wavelength and loss. Z₀ shown is the static (quasi-TEM) value.' },
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'Line length', units: withDefault(U_LEN_PCB, 'mm'), unitKey: 'lenUnit', min: 0, max: 100 },
      { kind: 'number', key: 'sigma', symbol: 'σ', label: 'Conductivity', units: U_COND, unitKey: 'sigmaUnit', min: 1e3, max: 1e9, help: 'Annealed copper 58 MS/m; electro-deposited PCB copper is typically 5–10 % lower.' },
      { kind: 'number', key: 'rough', symbol: 'Δ', label: 'RMS roughness', units: U_ROUGH, unitKey: 'roughUnit', min: 0, max: 50e-6, help: 'Hammerstad roughness factor K = 1 + (2/π)·atan(1.4·(Δ/δ)²). 0 = smooth copper.' },
    ],
  },
];

const SOLVE_RANGE: Record<string, { lo: number; hi: number; log: boolean }> = {
  w: { lo: 1e-7, hi: 1, log: true },
  h: { lo: 1e-7, hi: 1, log: true },
  er: { lo: 1, hi: 200, log: true },
};

const toInputs = (s: MicrostripState): MicrostripInputs => ({ w: s.w, h: s.h, t: s.t, er: s.er, f: s.f, tanD: s.tanD, sigma: s.sigma, rough: s.rough, len: s.len });

const fmtLen = (m: number) => si(m, 'm', 4);

export function compute(st: MicrostripState): CalcReport {
  for (const k of ['w', 'h', 't', 'er', 'f', 'tanD', 'sigma', 'rough', 'len', 'z0'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (st.solveFor !== 'w' && !(st.w > 0)) throw new Error('Trace width must be > 0.');
  if (st.solveFor !== 'h' && !(st.h > 0)) throw new Error('Substrate height must be > 0.');
  if (st.solveFor !== 'er' && !(st.er >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(st.f > 0) || !(st.sigma > 0) || st.t < 0) throw new Error('Frequency and conductivity must be > 0, thickness ≥ 0.');
  const warnings: string[] = [];
  const s: MicrostripState = { ...st };

  if (s.solveFor !== 'z0') {
    const key = s.solveFor;
    const range = SOLVE_RANGE[key];
    const g = (x: number) => microstripStatic(key === 'w' ? x : s.w, key === 'h' ? x : s.h, s.t, key === 'er' ? x : s.er).z0;
    const r = invert(g, s.z0, { ...range, samples: 200 });
    // No answer is an error (style guide §5): the core then blanks the solved box and drops the
    // graphs, and nothing downstream (round trips, the API) mistakes the stale input for a result.
    if (!r.ok) return { ...emptyReport(ID), ok: false, error: noSolution(key, st.z0, g(range.lo), g(range.hi), r.closestValue), solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
    s[key] = r.roots[0];
  }

  const report: CalcReport = { calc: ID, ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes: [] };

  const o = calcMicrostrip(toInputs(s));
  if (s.solveFor === 'z0') s.z0 = o.z0;

  // ── validity
  if (o.u < 0.01 || o.u > 100) warnings.push(`W/H = ${o.u.toPrecision(3)} is outside 0.01–100, the range Hammerstad–Jensen fitted (εeff within 0.2 %).`);
  if (s.er > 128) warnings.push('εr above 128 is outside the Hammerstad–Jensen fit.');
  if (s.t / s.h > 0.2) warnings.push(`T/H = ${(s.t / s.h).toFixed(2)}: the thickness correction is an empirical fit intended for thin strips; prefer a field solver.`);
  if (s.t > s.w) warnings.push('Copper thicker than it is wide — the strip model no longer applies.');
  const hOverL = (s.h * s.f) / C0;
  if (hOverL > 0.13) warnings.push(`H/λ₀ = ${hOverL.toFixed(3)} > 0.13: beyond the Kirschning–Jansen dispersion range; higher-order modes and radiation are likely.`);
  if (o.u >= 0.1 && o.u <= 100 && s.er <= 20) {
    /* inside KJ range */
  } else if (o.u < 0.1 || s.er > 20) report.notes.push('Dispersion is extrapolated (Kirschning–Jansen valid for 0.1 ≤ W/H ≤ 100, εr ≤ 20).');
  const fTE = C0 / (4 * s.h * Math.sqrt(s.er - 1 || 1e-9)); // lowest surface-wave (TE₁) onset, Pozar / Edwards
  if (s.er > 1 && s.f > fTE) warnings.push(`f is above the TE₁ surface-wave onset ≈ ${si(fTE, 'Hz')} for this substrate.`);

  const solved = s.solveFor;
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  const primary: ResultItem[] = [];
  if (solved === 'w') primary.push(item('w', 'Trace width', s.w, 'm', fmtLen(s.w), { symbol: 'W', solved: true, primary: true, note: `${(s.w / 25.4e-6).toFixed(2)} mil · W/H = ${o.u.toPrecision(4)}` }));
  if (solved === 'h') primary.push(item('h', 'Substrate height', s.h, 'm', fmtLen(s.h), { symbol: 'H', solved: true, primary: true, note: `${(s.h / 25.4e-6).toFixed(2)} mil · W/H = ${o.u.toPrecision(4)}` }));
  if (solved === 'er') primary.push(item('er', 'Relative permittivity', s.er, '', s.er.toPrecision(4), { symbol: 'εᵣ', solved: true, primary: true }));
  primary.push(item('z0', 'Characteristic impedance', o.z0, 'Ω', si(o.z0, 'Ω', 4), { symbol: 'Z₀', solved: solved === 'z0', primary: true, note: solved === 'z0' ? 'static, quasi-TEM' : 'target' }));
  primary.push(item('epsEff', 'Effective permittivity', o.epsEff, '', o.epsEff.toPrecision(4), { symbol: 'εeff', primary: true, note: `${o.epsEffF.toPrecision(4)} at ${si(s.f, 'Hz')}` }));
  primary.push(item('delay', 'Propagation delay', o.delay, 's/m', `${si(o.delay * 1e-3, 's', 4)}/mm`, { symbol: 'tpd', primary: true, note: `${si(o.delay * 0.0254, 's', 4)}/in at ${si(s.f, 'Hz')}` }));

  const line: ResultItem[] = [
    item('epsEffF', `εeff at ${si(s.f, 'Hz')}`, o.epsEffF, '', o.epsEffF.toPrecision(5), { symbol: 'εeff(f)', group: 'Wave' }),
    item('vp', 'Phase velocity', o.vp, 'm/s', `${si(o.vp, 'm/s', 4)} (${((o.vp / C0) * 100).toFixed(1)} % c)`, { symbol: 'vp', group: 'Wave' }),
    item('lambdaG', 'Guided wavelength', o.lambdaG, 'm', fmtLen(o.lambdaG), { symbol: 'λg', group: 'Wave' }),
    item('quarterWave', 'Quarter wavelength at f', o.lambdaG / 4, 'm', fmtLen(o.lambdaG / 4), { symbol: 'λg/4', group: 'Wave' }),
    item('lambda0', 'Free-space wavelength', o.lambda0, 'm', fmtLen(o.lambda0), { symbol: 'λ₀', group: 'Wave' }),
    item('lPer', 'Inductance per length', o.lPer, 'H/m', `${si(o.lPer * 1e-3, 'H', 4)}/mm`, { symbol: "L'", group: 'Per unit length' }),
    item('cPer', 'Capacitance per length', o.cPer, 'F/m', `${si(o.cPer * 1e-3, 'F', 4)}/mm`, { symbol: "C'", group: 'Per unit length' }),
    item('alphaD', 'Dielectric loss', o.alphaD * NP_TO_DB, 'dB/m', `${si(o.alphaD * NP_TO_DB * 1e-3, 'dB', 3)}/mm`, { symbol: 'αd', group: 'Per unit length' }),
    Number.isFinite(o.alphaC)
      ? item('alphaC', 'Conductor loss', o.alphaC * NP_TO_DB, 'dB/m', `${si(o.alphaC * NP_TO_DB * 1e-3, 'dB', 3)}/mm`, { symbol: 'αc', group: 'Per unit length', note: 'Wheeler incremental inductance × roughness K' })
      : { key: 'alphaC', label: 'Conductor loss', value: null, unit: 'dB/m', display: '— (needs T > 0)', symbol: 'αc', group: 'Per unit length', note: 'undefined for a zero-thickness strip' },
    item('elecLen', 'Electrical length', o.elecLenDeg, '°', `${o.elecLenDeg.toFixed(2)}°`, { symbol: 'θ', group: `Over ℓ = ${fmtLen(s.len)}` }),
    item('lineDelay', 'Delay', o.lineDelay, 's', si(o.lineDelay, 's', 4), { symbol: 'τ', group: `Over ℓ = ${fmtLen(s.len)}` }),
    item('lossDb', 'Insertion loss', o.lossDb, 'dB', `${o.lossDb.toFixed(3)} dB`, { symbol: 'IL', group: `Over ℓ = ${fmtLen(s.len)}` }),
    item('skinDepth', 'Skin depth', o.skinDepth, 'm', fmtLen(o.skinDepth), { symbol: 'δ', group: 'Conductor' }),
    item('rs', 'Surface resistance', o.rs, 'Ω', si(o.rs, 'Ω', 3), { symbol: 'Rs', group: 'Conductor' }),
    item('roughFactor', 'Roughness factor', o.roughFactor, '', o.roughFactor.toFixed(3), { symbol: 'K', group: 'Conductor' }),
  ];
  if (!(s.t > 0)) warnings.push('Copper thickness T = 0: conductor loss is undefined for an infinitely thin strip and is left out of the insertion loss. Enter the real thickness.');
  if (s.t > 0 && s.t < 3 * o.skinDepth) report.notes.push(`Copper is only ${(s.t / o.skinDepth).toFixed(1)} skin depths thick at ${si(s.f, 'Hz')}: the conductor-loss estimate (which assumes ≫ δ) is optimistic.`);
  report.results = [...primary, ...line];
  report.summary = `W/H ${o.u.toPrecision(3)} · u_eff ${o.ur.toPrecision(4)} · εeff ${o.epsEff.toPrecision(4)} → ${o.epsEffF.toPrecision(4)} at ${si(s.f, 'Hz')}`;
  report.notes.push(
    'Z₀ and εeff: Hammerstad & Jensen (1980) closed forms with their strip-thickness correction; quasi-static, bare microstrip (air above, no solder mask).',
    'εeff(f): Kirschning & Jansen (1982) dispersion. Z₀ is reported at its static value; its frequency dependence is small below a few GHz on thin substrates and depends on which Z₀ definition is used.',
    'Conductor loss: Wheeler’s incremental-inductance rule on the H&J equations (current on all strip faces and the ground plane), times the Hammerstad roughness factor. It assumes copper many skin depths thick; real copper profile and plating add loss.',
    'Solder mask lowers Z₀ by a few ohms and raises εeff — not modelled.',
  );
  report.details = { ...o, inputs: toInputs(s), fTE1: fTE, hOverLambda0: hOverL };
  report.graphs = graphs(s, o.z0, o.epsEff);
  return report;
}

const ID = 'rf/microstrip-impedance';

/** Why a target Z₀ is out of reach: Z₀ is monotonic in W (falling), H (rising) and εr (falling). */
function noSolution(key: 'w' | 'h' | 'er', z0: number, zLo: number, zHi: number, closest: number): string {
  const { lo, hi } = SOLVE_RANGE[key];
  const name = key === 'er' ? 'εr' : key.toUpperCase();
  const fx = (x: number) => (key === 'er' ? String(x) : si(x, 'm'));
  const zMin = Math.min(zLo, zHi);
  const zMax = Math.max(zLo, zHi);
  const span = `${name} = ${fx(lo)} … ${fx(hi)} gives Z₀ = ${si(zMin, 'Ω', 4)} … ${si(zMax, 'Ω', 4)}`;
  if (!(z0 > zMax) && !(z0 < zMin)) return `No ${name} gives Z₀ = ${si(z0, 'Ω', 4)} (closest ${si(closest, 'Ω', 4)}). Change the target or the other inputs.`;
  // the end of the range the target lies beyond
  const end = z0 > zMax === zLo > zHi ? 'lo' : 'hi';
  const what = key === 'er' ? 'with this geometry' : key === 'w' ? 'on this substrate' : 'with this trace';
  return `Z₀ = ${si(z0, 'Ω', 4)} needs ${name} ${end === 'lo' ? '<' : '>'} ${fx(end === 'lo' ? lo : hi)} ${what} (${span}). Change the target Z₀ or the other inputs.`;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: MicrostripState, z0: number, epsEff: number): GraphSpec[] {
  // Z₀ and εeff against width (W/H from 0.05 to 20, plus the current point)
  const ws = logspace(Math.min(0.05 * s.h, s.w / 2), Math.max(20 * s.h, s.w * 2), 160);
  const z = ws.map((w) => microstripStatic(w, s.h, s.t, s.er));
  const fLo = Math.max(Math.min(s.f / 100, 1e8), 1);
  const fs = [...logspace(fLo, Math.min(Math.max(s.f * 10, 20e9), 1e12), 160), s.f].sort((a, b) => a - b);
  const u = s.w / s.h;
  const fill = fillingFactor(s.w, s.h, s.t, s.er);
  const ad = fs.map((f) => dielectricLoss(s.er, epsEffKJ(epsEff, s.er, u, s.h, f), s.tanD, f, fill) * NP_TO_DB);
  const ac = fs.map((f) => conductorLoss(z0, s.w, s.h, s.t, f, s.sigma, s.rough).alpha * NP_TO_DB);
  return [
    {
      id: 'z0-vs-w',
      title: 'Z₀ vs width',
      x: { label: 'Trace width W', unit: 'm', log: true },
      y: [
        { id: 'z', label: 'Z₀', unit: 'Ω' },
        { id: 'e', label: 'εeff', unit: '', side: 'right' },
      ],
      series: [
        { label: 'Z₀', x: ws, y: z.map((r) => r.z0), axis: 'z', width: 2.2 },
        { label: 'εeff (static)', x: ws, y: z.map((r) => r.epsEff), axis: 'e', color: '#c47b17', width: 1.4, dash: [5, 3] },
      ],
      hlines: [{ value: z0, label: `Z₀ = ${si(z0, 'Ω', 4)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }],
      vlines: [{ value: s.w, label: `W = ${si(s.w, 'm', 4)}`, color: '#9a8f7a' }],
      markers: [{ x: s.w, y: z0, axis: 'z', label: `${si(z0, 'Ω', 3)}` }],
    },
    {
      id: 'dispersion',
      title: 'εeff vs frequency',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'e', label: 'εeff', unit: '' }],
      series: [
        { label: 'εeff(f) Kirschning–Jansen', x: fs, y: fs.map((f) => epsEffKJ(epsEff, s.er, u, s.h, f)), axis: 'e', width: 2.2 },
        { label: 'εr', x: [fs[0], fs[fs.length - 1]], y: [s.er, s.er], axis: 'e', color: '#9a8f7a', dash: [4, 3], width: 1, noReadout: true },
      ],
      vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz')}`, color: '#9a8f7a' }],
    },
    {
      id: 'loss',
      title: 'Loss vs frequency',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'a', label: 'Loss', unit: 'dB/m', includeZero: true }],
      series: [
        { label: 'Total', x: fs, y: fs.map((_, i) => ad[i] + (Number.isFinite(ac[i]) ? ac[i] : 0)), axis: 'a', width: 2.2 },
        { label: 'Dielectric αd', x: fs, y: ad, axis: 'a', color: '#c47b17', width: 1.4 },
        { label: 'Conductor αc', x: fs, y: ac, axis: 'a', color: '#4f8a8b', width: 1.4 },
      ],
      vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz')}`, color: '#9a8f7a' }],
    },
  ];
}

export const def: CalcDef<MicrostripState> = {
  id: ID,
  version: '0.1.0',
  method: 'Hammerstad–Jensen (1980) static Z₀/εeff with thickness correction; Kirschning–Jansen (1982) εeff dispersion; Pozar dielectric loss; conductor loss by Wheeler’s incremental-inductance rule on the H&J equations, times the Hammerstad roughness factor. Solve-for uses bracketed Brent root finding on Z₀(x).',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'z0',
    options: [
      { key: 'z0', label: 'Z₀ from geometry (analysis)' },
      { key: 'w', label: 'Trace width W for a target Z₀' },
      { key: 'h', label: 'Substrate height H for a target Z₀' },
      { key: 'er', label: 'εr for a target Z₀' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m && (Math.abs(m.er - s.er) > 1e-9 || Math.abs(m.tanD - s.tanD) > 1e-12)) s.material = 'Custom';
  },
  examples: [
    { id: 'ro4350b-50', label: '50 Ω on 0.508 mm RO4350B (2.4 GHz)', state: { solveFor: 'w', z0: 50, h: 0.508e-3, t: 35e-6, material: 'RO4350B', er: 3.66, tanD: 0.0037, f: 2.4e9 } },
    { id: 'fr4-2layer', label: '50 Ω on 1.6 mm 2-layer FR-4', state: { solveFor: 'w', z0: 50, h: 1.6e-3, t: 35e-6, material: 'FR-4 (generic)', er: 4.4, tanD: 0.02, f: 1e9 } },
    { id: 'fr4-prepreg', label: '50 Ω on 0.2 mm FR-4 prepreg', state: { solveFor: 'w', z0: 50, h: 0.2e-3, t: 35e-6, material: 'FR-4 (generic)', er: 4.4, tanD: 0.02, f: 5e9 } },
    { id: 'alumina-50', label: '50 Ω thin film on 0.635 mm alumina', state: { solveFor: 'w', z0: 50, h: 0.635e-3, t: 5e-6, material: 'Alumina 99.6 %', er: 9.9, tanD: 0.0001, f: 10e9 } },
    { id: 'analyse-1mm', label: 'Analyse: 1 mm trace on 0.8 mm FR-4', state: { solveFor: 'z0', w: 1e-3, h: 0.8e-3, t: 35e-6, material: 'FR-4 (generic)', er: 4.4, tanD: 0.02, f: 1e9 } },
  ],
};
