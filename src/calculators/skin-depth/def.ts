/** Skin depth — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_COND, U_FREQ, U_LEN, U_LEN_PCB, withDefault } from '@/core/unitsets';
import { awgDiameterM } from '@/physics/awg';
import { EPS0 } from '@/physics/constants';
import { freqForDepth, racAnnulus, racAsymptote, racRatio, skinDepth, wireAc } from './model';

/**
 * Conductor presets: conductivity at 20 °C and a typical relative permeability.
 * Pure metals: CRC Handbook of Chemistry and Physics, "Electrical resistivity of pure metals" (293 K).
 * Annealed copper: IEC 60028 (International Annealed Copper Standard, 1.7241 µΩ·cm).
 * Alloys: ASM Metals Handbook typical values (% IACS / resistivity). Ferromagnetic μr is a typical
 * small-signal value and is highly uncertain (it depends on alloy, heat treatment, field and frequency).
 */
export const MATERIALS: Record<string, { sigma: number; mur: number } | null> = {
  Custom: null,
  'Copper (annealed, IACS)': { sigma: 5.8e7, mur: 1 },
  Silver: { sigma: 1 / 1.587e-8, mur: 1 },
  Gold: { sigma: 1 / 2.214e-8, mur: 1 },
  'Aluminium (pure)': { sigma: 1 / 2.65e-8, mur: 1 },
  'Aluminium 6061-T6': { sigma: 2.5e7, mur: 1 },
  'Brass (70/30)': { sigma: 1.6e7, mur: 1 },
  'Stainless steel 304': { sigma: 1 / 72e-8, mur: 1 },
  'Nickel (μr ≈ 100)': { sigma: 1 / 6.93e-8, mur: 100 },
  'Low-carbon steel (μr ≈ 100)': { sigma: 7.0e6, mur: 100 },
};

const AWG_OPTIONS = ['Custom', ...[8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40].map((n) => `AWG ${n}`)];
const awgOf = (name: string) => (name.startsWith('AWG ') ? awgDiameterM(Number(name.slice(4))) : null);

/** Skin-depth display units (no global preference: spans nm to cm). */
const U_DEPTH: Record<string, number> = { 'µm': 1e-6, nm: 1e-9, mm: 1e-3, mil: 25.4e-6, m: 1 };

export type SkinMode = 'delta' | 'f' | 'fRatio';

export interface SkinState {
  /** 'delta': δ (and Rac/Rdc) from f · 'f': f from a target δ · 'fRatio': f from a target Rac/Rdc */
  solveFor: SkinMode;
  f: number;
  fUnit: string;
  delta: number;
  deltaUnit: string;
  material: string;
  sigma: number;
  sigmaUnit: string;
  mur: number;
  wire: string;
  d: number;
  dUnit: string;
  ratio: number;
  len: number;
  lenUnit: string;
}

export const defaults = (): SkinState => ({
  solveFor: 'delta',
  f: 1e6,
  fUnit: 'MHz',
  delta: 66.085e-6,
  deltaUnit: 'µm',
  material: 'Copper (annealed, IACS)',
  sigma: 5.8e7,
  sigmaUnit: 'MS/m',
  mur: 1,
  wire: 'AWG 18',
  d: awgDiameterM(18),
  dUnit: 'mm',
  ratio: 4,
  len: 1,
  lenUnit: 'm',
});

const solvedIn = (...modes: SkinMode[]) => (_s: any, root: any) => modes.includes(root.solveFor);

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Skin depth',
    note: 'Give one of f, δ or Rac/Rdc; the green values are calculated (click ◎ to swap).',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1e-3, max: 1e13, solvable: true, solvedWhen: solvedIn('f', 'fRatio'), onSolve: (_s, r) => (r.solveFor = 'f'), onUnsolve: (_s, r) => (r.solveFor = 'delta') },
      { kind: 'number', key: 'delta', symbol: 'δ', label: 'Skin depth', units: U_DEPTH, unitKey: 'deltaUnit', min: 1e-10, max: 10, solvable: true, solvedWhen: solvedIn('delta', 'fRatio'), onSolve: (_s, r) => (r.solveFor = 'delta'), onUnsolve: (_s, r) => (r.solveFor = 'f'), help: 'Depth at which the current density has fallen to 1/e (37 %) of its surface value.' },
    ],
  },
  {
    kind: 'section',
    title: 'Conductor',
    fields: [
      {
        kind: 'select',
        key: 'material',
        label: 'Material preset',
        options: Object.keys(MATERIALS),
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m) {
            s.sigma = m.sigma;
            s.mur = m.mur;
          }
        },
        help: 'Conductivity at 20 °C (CRC Handbook for pure metals, IEC 60028 for annealed copper, ASM for alloys). Ferromagnetic μr is only a typical value — see the warning.',
      },
      { kind: 'number', key: 'sigma', symbol: 'σ', label: 'Conductivity', units: U_COND, unitKey: 'sigmaUnit', min: 1e3, max: 1e9 },
      { kind: 'number', key: 'mur', symbol: 'μᵣ', label: 'Relative permeability', min: 1, max: 1e5, help: '1 for copper, aluminium, gold, silver, brass and austenitic stainless steel.' },
    ],
  },
  {
    kind: 'section',
    title: 'Round wire',
    fields: [
      {
        kind: 'select',
        key: 'wire',
        label: 'Wire gauge',
        options: AWG_OPTIONS,
        apply: (v, s) => {
          const d = awgOf(v);
          if (d) s.d = d;
        },
        help: 'Fills the diameter from the AWG (ASTM B258) formula.',
      },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Wire diameter', units: withDefault(U_LEN_PCB, 'mm'), unitKey: 'dUnit', min: 1e-7, max: 1 },
      { kind: 'number', key: 'ratio', symbol: 'Rac/Rdc', label: 'AC/DC resistance', min: 1, max: 1e6, solvable: true, solvedWhen: solvedIn('delta', 'f'), onSolve: (_s, r) => (r.solveFor = 'delta'), onUnsolve: (_s, r) => {
          r.solveFor = 'fRatio';
          // At very low f the ratio written back is 1 to double precision: no frequency gives it, so making it
          // the target would be a red error caused by the ◎ click. Start from "where does R double?" instead.
          if (!(r.ratio > 1 + 1e-9)) r.ratio = 2;
        },
        help: 'Exact for an isolated straight round wire. Type a target (click ◎) to find the frequency at which the resistance rises by that factor.' },
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'Wire length', units: withDefault(U_LEN, 'm'), unitKey: 'lenUnit', min: 0, max: 1e7 },
    ],
  },
];

const fmtDepth = (m: number) => si(m, 'm', 4);
/** Plain number without e-notation (toPrecision(d) switches to "2.9907e+5" from 10^d up). */
const num = (v: number, d: number) => (Math.abs(v) < 10 ** d - 0.5 ? v.toPrecision(d) : Math.round(v).toLocaleString('en-US'));

export function compute(st: SkinState): CalcReport {
  for (const k of ['f', 'delta', 'sigma', 'mur', 'd', 'ratio', 'len'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (!(st.sigma > 0)) throw new Error('Conductivity must be > 0.');
  if (!(st.mur >= 1)) throw new Error('μr must be ≥ 1 (diamagnetic metals have μr ≈ 1).');
  if (!(st.d > 0)) throw new Error('Wire diameter must be > 0.');
  if (st.len < 0) throw new Error('Length must be ≥ 0.');
  const s: SkinState = { ...st };
  const a = s.d / 2;
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'rf/skin-depth', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  // ── solve
  if (s.solveFor === 'delta') {
    if (!(s.f > 0)) throw new Error('Frequency must be > 0.');
  } else if (s.solveFor === 'f') {
    if (!(s.delta > 0)) throw new Error('Skin depth must be > 0.');
    s.f = freqForDepth(s.delta, s.sigma, s.mur);
  } else {
    // Accept values written back from a low-frequency solve (e.g. 1.000000000075 at 1 Hz).
    if (!(s.ratio > 1 + 1e-14)) throw new Error('Target Rac/Rdc must be greater than 1 (the DC value).');
    // Rac/Rdc rises monotonically with x = a/δ: bracket and solve, then δ = a/x.
    let hi = 1;
    while (racRatio(hi) < s.ratio && hi < 1e8) hi *= 2;
    if (racRatio(hi) < s.ratio) throw new Error('Target Rac/Rdc is too large.');
    const x = brent((t) => racRatio(t) - s.ratio, 1e-6, hi, 1e-14);
    s.delta = a / x;
    s.f = freqForDepth(s.delta, s.sigma, s.mur);
  }
  if (!(s.f > 0) || !Number.isFinite(s.f)) throw new Error('No finite frequency gives that skin depth.');
  const w = wireAc(s.f, s.d, s.sigma, s.mur);
  s.delta = w.delta;
  s.ratio = w.ratio;

  // ── warnings
  if (s.mur > 1) warnings.push(`μr = ${s.mur}: the permeability of ferromagnetic metals depends strongly on alloy, field strength and frequency (it falls towards 1 in the GHz range), so δ and Rac are only estimates. Measure, or use μr ≈ 1 above a few GHz for a conservative (larger) δ.`);
  const sigmaEps = s.sigma / (2 * Math.PI * s.f * EPS0);
  if (sigmaEps < 100) warnings.push(`σ/ωε₀ = ${sigmaEps.toPrecision(3)}: the material is not a good conductor at ${si(s.f, 'Hz', 3)}, so the good-conductor formula δ = 1/√(πfμσ) underestimates δ (displacement current is no longer negligible). Use the general lossy-dielectric attenuation constant instead.`);
  if (s.f > 1e11) warnings.push('Above ~100 GHz surface roughness, the anomalous skin effect (at low temperature) and electron relaxation start to matter; the classical result is a lower bound on the loss.');
  if (s.f > 0 && s.f < 1) notes.push('Sub-hertz frequency: effectively DC.');

  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const mode = s.solveFor;
  const results: ResultItem[] = [
    item('delta', 'Skin depth', w.delta, 'm', fmtDepth(w.delta), { symbol: 'δ', primary: true, solved: mode !== 'f', note: `${num(w.delta / 25.4e-6, 4)} mil · 1/e current depth` }),
    item('f', 'Frequency', s.f, 'Hz', si(s.f, 'Hz', 5), { symbol: 'f', primary: mode !== 'delta', solved: mode !== 'delta' }),
    item('rs', 'Surface resistance', w.rs, 'Ω', `${si(w.rs, 'Ω', 4)}/□`, { symbol: 'R_s', primary: true, note: 'per square, thick conductor' }),
    item('ratio', 'AC/DC resistance ratio', w.ratio, '', num(w.ratio, 5), { symbol: 'Rac/Rdc', primary: true, solved: mode !== 'fRatio', note: `${si(s.d, 'm', 4)} wire · d/δ = ${num(s.d / w.delta, 4)}` }),
    item('delta3', '3δ (|J| down to 5 %)', 3 * w.delta, 'm', fmtDepth(3 * w.delta), { symbol: '3δ', group: 'Plating / sheet thickness', note: 'current density magnitude e⁻³ of its surface value; a layer this thick has Rs about 0.3 % above solid metal' }),
    item('delta5', '5δ (|J| down to 0.7 %)', 5 * w.delta, 'm', fmtDepth(5 * w.delta), { symbol: '5δ', group: 'Plating / sheet thickness', note: 'a layer this thick has Rs within about 0.013 % of solid metal' }),
    item('rdc', 'DC resistance', w.rdc, 'Ω/m', `${si(w.rdc, 'Ω', 4)}/m`, { symbol: "R'_dc", group: 'Round wire, per metre' }),
    item('rac', 'AC resistance', w.rac, 'Ω/m', `${si(w.rac, 'Ω', 4)}/m`, { symbol: "R'_ac", group: 'Round wire, per metre' }),
    item('li', 'Internal inductance', w.li, 'H/m', `${si(w.li, 'H', 4)}/m`, { symbol: "L'_i", group: 'Round wire, per metre', note: `DC value μ/8π = ${si(w.liDc, 'H', 3)}/m` }),
    item('xOverDelta', 'Radius / skin depth', w.x, '', num(w.x, 4), { symbol: 'a/δ', group: 'Round wire, per metre' }),
    item('ratioAnnulus', 'Rac/Rdc, one-δ annulus', racAnnulus(w.x), '', num(racAnnulus(w.x), 5), { symbol: '≈', group: 'Approximations', note: `${pct(racAnnulus(w.x), w.ratio)} vs exact` }),
    w.x >= 2
      ? item('ratioAsym', 'Rac/Rdc, a/2δ + 1/4 + 3δ/32a', racAsymptote(w.x), '', num(racAsymptote(w.x), 5), { symbol: '≈', group: 'Approximations', note: `${pct(racAsymptote(w.x), w.ratio)} vs exact` })
      : { key: 'ratioAsym', label: 'Rac/Rdc, a/2δ + 1/4 + 3δ/32a', value: null, unit: '', display: '—', symbol: '≈', group: 'Approximations', note: 'not valid for a < 2δ' },
  ];
  if (s.len > 0) {
    const lg = `Over ℓ = ${si(s.len, 'm', 4)}`;
    results.push(item('rdcTotal', 'DC resistance', w.rdc * s.len, 'Ω', si(w.rdc * s.len, 'Ω', 4), { symbol: 'R_dc', group: lg }), item('racTotal', 'AC resistance', w.rac * s.len, 'Ω', si(w.rac * s.len, 'Ω', 4), { symbol: 'R_ac', group: lg }));
  }
  report.results = results;
  report.summary = `σ ${si(s.sigma, 'S/m', 3)} · μr ${+s.mur.toPrecision(4)} · δ = ${fmtDepth(w.delta)} at ${si(s.f, 'Hz', 4)}`;
  notes.push(
    'δ = 1/√(π f μ σ): good conductor (σ ≫ ωε), plane surface, classical (local) conductivity.',
    'Rac/Rdc: exact Bessel-function solution for an isolated, straight, solid round wire. Nearby conductors (coils, bundles, return wires) add proximity loss that is not included; Litz and stranded wire behave differently.',
    'Conductivity is taken at 20 °C; copper’s rises about 0.39 %/K in resistance, so δ grows by about 0.2 %/K.',
  );
  if (w.x < 1) notes.push(`The wire radius is smaller than δ, so the current is still nearly uniform (Rac/Rdc = ${w.ratio.toPrecision(4)}).`);
  report.details = { ...w, sigma: s.sigma, mur: s.mur, f: s.f };
  report.graphs = graphs(s, w.delta, w.ratio);
  return report;
}

function pct(approx: number, exact: number): string {
  const e = (approx / exact - 1) * 100;
  return `${e >= 0 ? '+' : ''}${e.toFixed(Math.abs(e) < 1 ? 2 : 1)} %`;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: SkinState, delta: number, ratio: number): GraphSpec[] {
  const a = s.d / 2;
  const fA = freqForDepth(a, s.sigma, s.mur); // δ = radius
  const lo = Math.min(s.f / 1e3, fA / 100, 1e3);
  const hi = Math.max(s.f * 1e3, fA * 1e4, 1e9);
  const fLo = Math.max(lo, 1e-3);
  const fHi = Math.min(hi, 1e13);
  const fs = [...logspace(fLo, fHi, 241), s.f].sort((x, y) => x - y);
  const xs = fs.map((f) => a / skinDepth(f, s.sigma, s.mur));
  return [
    {
      id: 'delta-vs-f',
      title: 'Skin depth vs frequency',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'd', label: 'Skin depth δ', unit: 'm', log: true }],
      series: [{ label: `δ (σ = ${si(s.sigma, 'S/m', 3)}, μr = ${+s.mur.toPrecision(4)})`, x: fs, y: fs.map((f) => skinDepth(f, s.sigma, s.mur)), axis: 'd', width: 2.2 }],
      hlines: [{ value: a, label: `wire radius ${si(a, 'm', 3)}`, axis: 'd', color: '#9a8f7a', dash: [4, 3] }],
      vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz', 4)}`, color: '#9a8f7a' }],
      markers: [{ x: s.f, y: delta, axis: 'd', label: si(delta, 'm', 3) }],
    },
    {
      id: 'rac-vs-f',
      title: 'Rac/Rdc vs frequency',
      subtitle: `${si(s.d, 'm', 4)} round wire`,
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'r', label: 'Rac/Rdc', unit: '', log: true }],
      series: [
        { label: 'Exact (Bessel)', x: fs, y: xs.map(racRatio), axis: 'r', width: 2.2 },
        { label: 'One-δ annulus', x: fs, y: xs.map(racAnnulus), axis: 'r', color: '#c47b17', width: 1.3, dash: [5, 3] },
        { label: 'a/2δ + 1/4 + 3δ/32a', x: fs.filter((_, i) => xs[i] >= 2), y: xs.filter((x) => x >= 2).map(racAsymptote), axis: 'r', color: '#6b5b95', width: 1.2, dash: [2, 3] },
      ],
      vlines: [
        { value: s.f, label: `f = ${si(s.f, 'Hz', 4)}`, color: '#9a8f7a' },
        { value: fA, label: `δ = a at ${si(fA, 'Hz', 3)}`, color: '#4f8a8b', dash: [4, 3] },
      ],
      markers: [{ x: s.f, y: ratio, axis: 'r', label: num(ratio, 3) }],
    },
  ];
}

export const def: CalcDef<SkinState> = {
  id: 'rf/skin-depth',
  version: '0.1.0',
  method: 'Skin depth δ = 1/√(π f μ σ) and surface resistance Rs = 1/(σδ) (Ramo, Whinnery & Van Duzer §3.16); round-wire Rac/Rdc and internal inductance from the exact Bessel-function internal impedance Z = k J0(ka)/(2πaσ J1(ka)) (RWV §5.12; Schelkunoff 1934), by power series up to a/δ = 30 and the Hankel asymptotic expansion above. Solving for f inverts δ exactly, or Rac/Rdc by Brent root finding.',
  fields,
  defaults,
  solve: {
    default: 'delta',
    analysis: 'delta',
    options: [
      { key: 'delta', label: 'Skin depth and Rac/Rdc from frequency' },
      { key: 'f', label: 'Frequency for a target skin depth' },
      { key: 'fRatio', label: 'Frequency for a target Rac/Rdc' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m && (Math.abs(m.sigma - s.sigma) > 1e-6 * m.sigma || m.mur !== s.mur)) s.material = 'Custom';
    const d = awgOf(s.wire);
    if (d != null && Math.abs(d - s.d) > 1e-9 * d) s.wire = 'Custom';
  },
  examples: [
    { id: 'cu-1mhz-awg18', label: 'Copper AWG 18 at 1 MHz', state: defaults() },
    { id: 'cu-60hz-busbar', label: 'Copper at 60 Hz (δ ≈ 8.5 mm) — 25 mm bus rod', state: { solveFor: 'delta', f: 60, fUnit: 'Hz', material: 'Copper (annealed, IACS)', sigma: 5.8e7, mur: 1, wire: 'Custom', d: 25e-3, len: 1 } },
    { id: 'plating-gold-10ghz', label: 'Gold plating at 10 GHz: how thick? (3δ)', state: { solveFor: 'delta', f: 10e9, fUnit: 'GHz', material: 'Gold', sigma: 1 / 2.214e-8, mur: 1, wire: 'AWG 30', d: awgDiameterM(30) } },
    { id: 'awg24-double', label: 'Where does AWG 24 copper double its resistance?', state: { solveFor: 'fRatio', ratio: 2, material: 'Copper (annealed, IACS)', sigma: 5.8e7, mur: 1, wire: 'AWG 24', d: awgDiameterM(24) } },
    { id: 'depth-1um-al', label: 'Aluminium: frequency for δ = 1 µm', state: { solveFor: 'f', delta: 1e-6, deltaUnit: 'µm', material: 'Aluminium (pure)', sigma: 1 / 2.65e-8, mur: 1 } },
    { id: 'steel-50khz', label: 'Low-carbon steel at 50 kHz (μr ≈ 100) — warning', state: { solveFor: 'delta', f: 50e3, fUnit: 'kHz', material: 'Low-carbon steel (μr ≈ 100)', sigma: 7.0e6, mur: 100, wire: 'AWG 12', d: awgDiameterM(12) } },
  ],
};
