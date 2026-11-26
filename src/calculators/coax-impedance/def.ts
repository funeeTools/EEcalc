/** Coaxial cable impedance — calculator definition (inputs, solve-for, report). DOM-free. */

import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_COND, U_FREQ, U_LEN, U_LEN_PCB, withDefault } from '@/core/unitsets';
import { NP_TO_DB, calcCoax, lineLoss, coaxDForZ0, coaxErForZ0, coaxZ0, coaxdForZ0 } from './model';

/**
 * Dielectric presets. Solid materials: Pozar, Microwave Engineering, appendix of dielectric constants
 * and loss tangents (εr and tan δ at 10 GHz). Foamed materials vary by manufacturer and foam density; the values
 * are derived from the velocity factor typical cable data sheets quote (εr = 1/VF²).
 */
export const DIELECTRICS: Record<string, { er: number; tanD: number } | null> = {
  Custom: null,
  'Solid PE (VF 0.66)': { er: 2.25, tanD: 0.0004 },
  'PTFE (VF 0.69)': { er: 2.08, tanD: 0.0004 },
  'Foam PE (VF 0.82)': { er: 1 / 0.82 ** 2, tanD: 0.0002 },
  'Foam PE (VF 0.85)': { er: 1 / 0.85 ** 2, tanD: 0.0002 },
  'Polystyrene (VF 0.63)': { er: 2.54, tanD: 0.00033 },
  'Air (VF 1.0)': { er: 1.0006, tanD: 0 },
};

/**
 * Cable presets: nominal dimensions as listed on typical manufacturer data sheets (Belden, Times
 * Microwave, Micro-Coax / MIL-DTL-17 style constructions). d = centre conductor (overall strand
 * diameter for stranded types), D = dielectric (core) diameter. Check your own cable's data sheet.
 */
export const CABLES: Record<string, { d: number; D: number; dielectric: string; nominal: number; stranded?: boolean } | null> = {
  Custom: null,
  'RG-58/U (solid centre)': { d: 0.81e-3, D: 2.95e-3, dielectric: 'Solid PE (VF 0.66)', nominal: 53.5 },
  'RG-58C/U (stranded)': { d: 0.9e-3, D: 2.95e-3, dielectric: 'Solid PE (VF 0.66)', nominal: 50, stranded: true },
  'RG-174/U (stranded)': { d: 0.48e-3, D: 1.52e-3, dielectric: 'Solid PE (VF 0.66)', nominal: 50, stranded: true },
  'RG-213/U (stranded)': { d: 2.25e-3, D: 7.24e-3, dielectric: 'Solid PE (VF 0.66)', nominal: 50, stranded: true },
  'LMR-400 style (foam)': { d: 2.74e-3, D: 7.24e-3, dielectric: 'Foam PE (VF 0.85)', nominal: 50 },
  'RG-59/U (solid PE)': { d: 0.58e-3, D: 3.71e-3, dielectric: 'Solid PE (VF 0.66)', nominal: 75 },
  'RG-6/U (foam)': { d: 1.02e-3, D: 4.57e-3, dielectric: 'Foam PE (VF 0.82)', nominal: 75 },
  'RG-402 / .141″ semi-rigid': { d: 0.912e-3, D: 2.985e-3, dielectric: 'PTFE (VF 0.69)', nominal: 50 },
  'RG-405 / .086″ semi-rigid': { d: 0.511e-3, D: 1.676e-3, dielectric: 'PTFE (VF 0.69)', nominal: 50 },
};

export interface CoaxState {
  solveFor: 'z0' | 'D' | 'd' | 'er';
  z0: number;
  D: number;
  DUnit: string;
  d: number;
  dUnit: string;
  cable: string;
  dielectric: string;
  er: number;
  tanD: number;
  f: number;
  fUnit: string;
  sigma: number;
  sigmaUnit: string;
  len: number;
  lenUnit: string;
}

export const defaults = (): CoaxState => ({
  solveFor: 'z0',
  z0: 50,
  D: 7.24e-3,
  DUnit: 'mm',
  d: 2.74e-3,
  dUnit: 'mm',
  cable: 'LMR-400 style (foam)',
  dielectric: 'Foam PE (VF 0.85)',
  er: 1 / 0.85 ** 2,
  tanD: 0.0002,
  f: 1e9,
  fUnit: 'GHz',
  sigma: 5.8e7,
  sigmaUnit: 'MS/m',
  len: 10,
  lenUnit: 'm',
});

const applyDielectric = (name: string, s: Record<string, any>) => {
  const m = DIELECTRICS[name];
  if (m) {
    s.er = m.er;
    s.tanD = m.tanD;
  }
};

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Line',
    fields: [
      { kind: 'number', key: 'z0', symbol: 'Z₀', label: 'Characteristic impedance', unit: 'Ω', solvable: true, min: 1, max: 1000, help: 'Target impedance when solving for D, d or εr; otherwise the calculated result.' },
      { kind: 'number', key: 'D', symbol: 'D', label: 'Outer conductor ID', units: U_LEN_PCB, unitKey: 'DUnit', solvable: true, min: 1e-6, max: 1, help: 'Inside diameter of the shield = outside diameter of the dielectric core.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Inner conductor OD', units: U_LEN_PCB, unitKey: 'dUnit', solvable: true, min: 1e-6, max: 1, help: 'Outside diameter of the centre conductor. A stranded conductor behaves like a slightly smaller solid wire.' },
      {
        kind: 'select',
        key: 'cable',
        label: 'Cable preset',
        options: Object.keys(CABLES),
        apply: (v, s) => {
          const c = CABLES[v];
          if (!c) return;
          s.d = c.d;
          s.D = c.D;
          s.dielectric = c.dielectric;
          applyDielectric(c.dielectric, s);
          if (s.solveFor !== 'z0') s.solveFor = 'z0';
        },
        help: 'Nominal dimensions from typical data sheets (switches to analysis). Real cables differ by maker; check the data sheet.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Dielectric',
    fields: [
      {
        kind: 'select',
        key: 'dielectric',
        label: 'Dielectric preset',
        options: Object.keys(DIELECTRICS),
        apply: (v, s) => {
          applyDielectric(v, s);
          // A preset fixes εr: if εr was the unknown the solve would overwrite it and sync would bounce
          // the dropdown back to Custom. Analyse the entered diameters instead.
          if (DIELECTRICS[v] && s.solveFor === 'er') s.solveFor = 'z0';
        },
        help: 'Solid materials: Pozar, Microwave Engineering, dielectric-constant appendix (10 GHz). Foams vary by maker — εr here is 1/VF² for the stated velocity factor.' },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Relative permittivity', solvable: true, min: 1, max: 100 },
      { kind: 'number', key: 'tanD', symbol: 'tan δ', label: 'Loss tangent', min: 0, max: 1 },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency & loss',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets wavelength and loss, and is checked against the TE₁₁ cutoff.' },
      { kind: 'number', key: 'sigma', symbol: 'σ', label: 'Conductor conductivity', units: U_COND, unitKey: 'sigmaUnit', min: 1e5, max: 1e9, help: 'Both conductors, smooth and solid. Copper 58 MS/m, aluminium ≈ 35 MS/m. Braid, plating and stranding add loss that is not modelled.' },
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'Cable length', units: withDefault(U_LEN, 'm'), unitKey: 'lenUnit', min: 0, max: 1e6 },
    ],
  },
];

const fmtLen = (m: number) => si(m, 'm', 4);
/** Solved values must stay inside the input fields' limits. */
const ER_MAX = 100;
const DIA_MIN = 1e-6;
const DIA_MAX = 1;
const LABELS: Record<string, string> = { z0: 'Characteristic impedance', D: 'Outer conductor ID', d: 'Inner conductor OD', er: 'Relative permittivity' };

/**
 * No answer is an error (style guide §5): the core then shows "—" in the solved box and drops the
 * graphs, and nothing (round trips, the API) mistakes the stale input value for a result.
 */
const noSolution = (s: CoaxState, msg: string): CalcReport => ({ ...emptyReport('rf/coax-impedance'), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });

export function compute(st: CoaxState): CalcReport {
  for (const k of ['z0', 'D', 'd', 'er', 'tanD', 'f', 'sigma', 'len'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (st.solveFor !== 'D' && !(st.D > 0)) throw new Error('Outer diameter D must be > 0.');
  if (st.solveFor !== 'd' && !(st.d > 0)) throw new Error('Inner diameter d must be > 0.');
  if (st.solveFor !== 'er' && !(st.er >= 1)) throw new Error('εr must be ≥ 1.');
  if (st.solveFor !== 'z0' && !(st.z0 > 0)) throw new Error('Target Z₀ must be > 0.');
  if (!(st.f > 0) || !(st.sigma > 0) || st.tanD < 0 || st.len < 0) throw new Error('Frequency and conductivity must be > 0; tan δ and length ≥ 0.');
  if ((st.solveFor === 'z0' || st.solveFor === 'er') && !(st.D > st.d)) throw new Error(`The outer diameter D (${fmtLen(st.D)}) must be larger than the inner diameter d (${fmtLen(st.d)}).`);

  const s: CoaxState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'rf/coax-impedance', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  // ── solve (closed-form inverses of the single forward equation; exact)
  if (s.solveFor === 'D') s.D = coaxDForZ0(s.z0, s.d, s.er);
  else if (s.solveFor === 'd') s.d = coaxdForZ0(s.z0, s.D, s.er);
  else if (s.solveFor === 'er') {
    const er = coaxErForZ0(s.z0, s.D, s.d);
    if (er < 1) {
      const zAir = coaxZ0(s.D, s.d, 1);
      return noSolution(s, `Z₀ = ${si(s.z0, 'Ω', 4)} needs εr < 1 with D/d = ${(s.D / s.d).toPrecision(4)}: even air gives only ${si(zAir, 'Ω', 4)}. Increase D/d or lower the target.`);
    }
    s.er = er;
  }
  // A solved value must stay inside its input field's limits (never write back an absurd value).
  const outOfRange =
    s.solveFor === 'er'
      ? !(s.er <= ER_MAX) && `Z₀ = ${si(s.z0, 'Ω', 4)} would need εr = ${s.er.toPrecision(4)}, above the ${ER_MAX} limit of this calculator. Use a larger target Z₀ or a smaller D/d.`
      : s.solveFor === 'D' || s.solveFor === 'd'
        ? !(s[s.solveFor] >= DIA_MIN && s[s.solveFor] <= DIA_MAX) &&
          `Z₀ = ${si(s.z0, 'Ω', 4)} would need ${s.solveFor} = ${Number.isFinite(s[s.solveFor]) ? fmtLen(s[s.solveFor]) : '∞'} (D/d = ${Number.isFinite(s.D / s.d) ? (s.D / s.d).toPrecision(4) : '∞'}), outside ${si(DIA_MIN, 'm')}–${si(DIA_MAX, 'm')}. Practical coax is roughly 10–150 Ω; check the target Z₀ and εr.`
        : false;
  if (outOfRange) return noSolution(s, outOfRange);

  const o = calcCoax(s.D, s.d, s.er, s.f, s.sigma, s.tanD);
  if (s.solveFor === 'z0') s.z0 = o.z0;

  // ── validity and practical warnings
  if (o.ratio < 1.05) warnings.push(`D/d = ${o.ratio.toPrecision(4)} is barely above 1: the dielectric is extremely thin, Z₀ is very sensitive to concentricity and the breakdown voltage is low.`);
  if (s.f >= o.fcTe11) warnings.push(`f = ${si(s.f, 'Hz')} is above the TE₁₁ cutoff ${si(o.fcTe11, 'Hz', 4)}: the line is no longer single-mode, so Z₀ and the loss figures lose meaning. Use a smaller cable (smaller D + d) or a lower frequency.`);
  else if (s.f > 0.9 * o.fcTe11) warnings.push(`f is within 10 % of the TE₁₁ cutoff (${si(o.fcTe11, 'Hz', 4)}). Connectors and bends can already excite the TE₁₁ mode; keep a margin.`);
  const lowF = o.skinDepth * 3 > s.d / 2;
  const rcLike = o.rPer > 0.1 * 2 * Math.PI * s.f * o.lPer;
  if (lowF || rcLike)
    warnings.push(
      `At ${si(s.f, 'Hz')} the skin depth (${fmtLen(o.skinDepth)}) is not small next to the conductors${rcLike ? ` and R′ is ${((o.rPer / (2 * Math.PI * s.f * o.lPer)) * 100).toFixed(0)} % of ωL′` : ''}. Loss uses the exact inner-wire resistance and the exact γ, but the shield is modelled as a thick wall, so the real shield resistance (set by its thickness) makes the loss higher — treat it as a lower bound.${rcLike ? ` Z₀ shown is the high-frequency value; the lossy line’s |Zc| here is ${si(o.zcMag, 'Ω', 4)}.` : ''}`,
    );
  const cable = CABLES[s.cable];
  if (s.solveFor === 'er' && s.dielectric === 'Custom') notes.push(`tan δ = ${s.tanD} is still the value from before the solve — set the loss tangent of the material you intend to use.`);
  if (cable?.stranded && (s.solveFor === 'z0' || s.solveFor === 'er')) notes.push(`${s.cable}: the centre conductor is stranded; using its overall diameter gives Z₀ a few ohms below the nominal ${cable.nominal} Ω, because a stranded conductor acts like a somewhat smaller solid wire.`);

  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const solved = s.solveFor;
  const primary: ResultItem[] = [];
  if (solved === 'D') primary.push(item('D', LABELS.D, s.D, 'm', fmtLen(s.D), { symbol: 'D', solved: true, primary: true, note: `${(s.D / 0.0254).toFixed(4)} in · D/d = ${o.ratio.toPrecision(4)}` }));
  if (solved === 'd') primary.push(item('d', LABELS.d, s.d, 'm', fmtLen(s.d), { symbol: 'd', solved: true, primary: true, note: `${(s.d / 0.0254).toFixed(4)} in · D/d = ${o.ratio.toPrecision(4)}` }));
  if (solved === 'er') primary.push(item('er', LABELS.er, s.er, '', s.er.toPrecision(4), { symbol: 'εᵣ', solved: true, primary: true, note: `velocity factor ${o.vf.toFixed(3)}` }));
  primary.push(item('z0', LABELS.z0, o.z0, 'Ω', si(o.z0, 'Ω', 4), { symbol: 'Z₀', solved: solved === 'z0', primary: true, note: solved === 'z0' ? `D/d = ${o.ratio.toPrecision(4)}${cable ? ` · nominal ${cable.nominal} Ω` : ''}` : 'target' }));
  primary.push(item('vf', 'Velocity factor', o.vf, '', o.vf.toFixed(4), { symbol: 'VF', primary: true, note: `${si(o.delay, 's', 4)}/m delay` }));
  primary.push(item('fcTe11', 'TE₁₁ cutoff', o.fcTe11, 'Hz', si(o.fcTe11, 'Hz', 4), { symbol: 'f_c', primary: true, tone: s.f >= o.fcTe11 ? 'fail' : s.f > 0.9 * o.fcTe11 ? 'warn' : '', note: 'highest single-mode frequency' }));

  const aC = o.alphaC * NP_TO_DB;
  const aD = o.alphaD * NP_TO_DB;
  const aT = o.alpha * NP_TO_DB;
  const per100 = (x: number) => `${(x * 100).toPrecision(3)} dB/100 m`;
  const lenGroup = `Over ℓ = ${si(s.len, 'm', 4)}`;
  const rest: ResultItem[] = [
    item('ratio', 'Diameter ratio', o.ratio, '', o.ratio.toPrecision(5), { symbol: 'D/d', group: 'Line' }),
    item('cPer', 'Capacitance per metre', o.cPer, 'F/m', `${si(o.cPer, 'F', 4)}/m`, { symbol: "C'", group: 'Line', note: `${si(o.cPer * 0.3048, 'F', 3)}/ft` }),
    item('lPer', 'Inductance per metre', o.lPer, 'H/m', `${si(o.lPer, 'H', 4)}/m`, { symbol: "L'", group: 'Line', note: 'external (high-frequency) value' }),
    item('delay', 'Propagation delay', o.delay, 's/m', `${si(o.delay, 's', 4)}/m`, { symbol: 'τ′', group: 'Line', note: `${si(o.delay * 0.3048, 's', 4)}/ft` }),
    item('vp', 'Phase velocity', o.vp, 'm/s', si(o.vp, 'm/s', 4), { symbol: 'v_p', group: 'Line' }),
    item('lambdaG', `Wavelength at ${si(s.f, 'Hz')}`, o.lambdaG, 'm', fmtLen(o.lambdaG), { symbol: 'λ', group: 'Line', note: `λ/4 = ${fmtLen(o.lambdaG / 4)}` }),
    item('fcTe11Approx', 'TE₁₁ cutoff, 2/(a+b) estimate', o.fcTe11Approx, 'Hz', si(o.fcTe11Approx, 'Hz', 4), { symbol: 'f_c≈', group: 'Line', note: `estimate is ${Math.abs((o.fcTe11Approx / o.fcTe11 - 1) * 100).toFixed(1)} % ${o.fcTe11Approx > o.fcTe11 ? 'high' : 'low'}` }),
    item('alphaC', 'Conductor loss', aC, 'dB/m', per100(aC), { symbol: 'α_c', group: `Loss at ${si(s.f, 'Hz')}` }),
    item('alphaD', 'Dielectric loss', aD, 'dB/m', per100(aD), { symbol: 'α_d', group: `Loss at ${si(s.f, 'Hz')}` }),
    item('alpha', 'Total loss', aT, 'dB/m', per100(aT), { symbol: 'α', group: `Loss at ${si(s.f, 'Hz')}`, note: 'smooth solid conductors — real cables are higher' }),
    item('skinDepth', 'Skin depth', o.skinDepth, 'm', fmtLen(o.skinDepth), { symbol: 'δ', group: `Loss at ${si(s.f, 'Hz')}` }),
    item('rs', 'Surface resistance', o.rs, 'Ω', si(o.rs, 'Ω', 3), { symbol: 'R_s', group: `Loss at ${si(s.f, 'Hz')}` }),
    item('lineLoss', 'Insertion loss', aT * s.len, 'dB', `${(aT * s.len).toPrecision(4)} dB`, { symbol: 'IL', group: lenGroup }),
    item('lineDelay', 'Delay', o.delay * s.len, 's', si(o.delay * s.len, 's', 4), { symbol: 'τ', group: lenGroup }),
    item('lineC', 'Total capacitance', o.cPer * s.len, 'F', si(o.cPer * s.len, 'F', 4), { symbol: 'C', group: lenGroup }),
    item('elecLen', 'Electrical length', (s.len / o.lambdaG) * 360, '°', `${((s.len / o.lambdaG) * 360).toPrecision(5)}° (${(s.len / o.lambdaG).toPrecision(4)} λ)`, { symbol: 'θ', group: lenGroup }),
  ];
  report.results = [...primary, ...rest];
  report.summary = `D/d ${o.ratio.toPrecision(4)} · εr ${s.er.toPrecision(4)} · single-mode below ${si(o.fcTe11, 'Hz', 3)}`;
  notes.push(
    'Ideal TEM coax: perfectly concentric round conductors, homogeneous dielectric, μr = 1.',
    'Z₀ and C′ do not depend on frequency; L′ is the external inductance (skin effect pushes the current to the surfaces at RF).',
    'TE₁₁ cutoff: exact root of the Bessel cross-product equation; the common 2/(a+b) estimate is shown for comparison.',
    'Loss: exact γ = √((R′+jX′)(G′+jωC′)) with the exact inner-wire impedance, a thick-wall shield and G′ = ωC′tanδ (→ Rs-based α_c and k·tanδ/2 at RF). Braided shields, stranding, plating and roughness typically add 10–50 % — use the data sheet for real cables.',
  );
  report.details = { ...o, solved: { D: s.D, d: s.d, er: s.er, z0: o.z0 } };
  report.graphs = graphs(s, o.z0, o.fcTe11);
  return report;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: CoaxState, z0: number, fc: number): GraphSpec[] {
  const ratio = s.D / s.d;
  const rs = [...logspace(Math.min(1.1, ratio), Math.max(20, ratio * 1.5), 200), ratio].sort((a, b) => a - b);
  const fLo = Math.max(Math.min(s.f / 100, 1e6), 1);
  const fHi = Math.min(Math.max(fc * 1.5, s.f * 2), 1e12);
  const fs = [...logspace(fLo, fHi, 200), s.f].sort((a, b) => a - b);
  const ll = fs.map((f) => lineLoss(f, s.D, s.d, s.er, s.sigma, s.tanD));
  const ac = ll.map((x) => x.alphaC * NP_TO_DB * 100);
  const ad = ll.map((x) => x.alphaD * NP_TO_DB * 100);
  return [
    {
      id: 'z0-vs-ratio',
      title: 'Z₀ vs D/d',
      x: { label: 'Diameter ratio D/d', unit: '', log: true },
      y: [{ id: 'z', label: 'Z₀', unit: 'Ω', includeZero: true }],
      series: [
        { label: `Z₀ (εr = ${+s.er.toPrecision(4)})`, x: rs, y: rs.map((r) => coaxZ0(r, 1, s.er)), axis: 'z', width: 2.2 },
        { label: 'Z₀ (air)', x: rs, y: rs.map((r) => coaxZ0(r, 1, 1)), axis: 'z', color: '#9a8f7a', width: 1.2, dash: [5, 3] },
      ],
      hlines: [{ value: z0, label: `Z₀ = ${si(z0, 'Ω', 4)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }],
      vlines: [
        { value: ratio, label: `D/d = ${ratio.toPrecision(4)}`, color: '#1f4e5f' },
        { value: 1.6487, label: 'max power (√e)', color: '#c47b17', dash: [2, 4], width: 1 },
        { value: Math.E, label: 'max voltage (e)', color: '#6b5b95', dash: [2, 4], width: 1 },
        { value: 3.5911, label: 'min loss (3.59)', color: '#2f7d4f', dash: [2, 4], width: 1 },
      ],
      markers: [{ x: ratio, y: z0, axis: 'z', label: si(z0, 'Ω', 3) }],
    },
    {
      id: 'loss',
      title: 'Loss vs frequency',
      subtitle: 'smooth solid conductors',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'a', label: 'Attenuation', unit: 'dB/100 m', log: true }],
      series: [
        { label: 'Total', x: fs, y: ll.map((x) => x.alpha * NP_TO_DB * 100), axis: 'a', width: 2.2 },
        { label: 'Conductor α_c', x: fs, y: ac, axis: 'a', color: '#4f8a8b', width: 1.4 },
        ...(s.tanD > 0 ? [{ label: 'Dielectric α_d', x: fs, y: ad, axis: 'a', color: '#c47b17', width: 1.4 }] : []),
      ],
      vlines: [
        { value: s.f, label: `f = ${si(s.f, 'Hz')}`, color: '#9a8f7a' },
        { value: fc, label: `TE₁₁ ${si(fc, 'Hz', 3)}`, color: '#8b1e1e', dash: [5, 4] },
      ],
    },
  ];
}

export const def: CalcDef<CoaxState> = {
  id: 'rf/coax-impedance',
  version: '0.1.0',
  method: 'TEM coax Z₀ = η0/(2π√εr)·ln(D/d), L′, C′ (Pozar, Microwave Engineering, §2.1); loss from the exact γ = √((R′+jX′)(G′+jωC′)) with the exact Bessel internal impedance of the inner wire and a thick-wall surface impedance for the shield, reducing to Pozar §2.7 (R′/2Z₀, k·tanδ/2) at RF; TE₁₁ cutoff from the exact Bessel cross-product root (Ramo–Whinnery–Van Duzer §8.10, Marcuvitz §2.4) with A&S 9.4 Bessel approximations. Solve-for uses the exact closed-form inverse.',
  fields,
  defaults,
  solve: {
    default: 'z0',
    analysis: 'z0',
    options: [
      { key: 'z0', label: 'Z₀ from diameters (analysis)' },
      { key: 'D', label: 'Outer diameter D for a target Z₀' },
      { key: 'd', label: 'Inner diameter d for a target Z₀' },
      { key: 'er', label: 'εr for a target Z₀' },
    ],
  },
  compute,
  sync: (s) => {
    const m = DIELECTRICS[s.dielectric];
    if (m && (Math.abs(m.er - s.er) > 1e-9 || Math.abs(m.tanD - s.tanD) > 1e-12)) s.dielectric = 'Custom';
    const c = CABLES[s.cable];
    if (c && (Math.abs(c.d - s.d) > 1e-12 || Math.abs(c.D - s.D) > 1e-12 || s.dielectric !== c.dielectric)) s.cable = 'Custom';
  },
  examples: [
    { id: 'lmr400', label: 'LMR-400-style foam cable at 1 GHz', state: defaults() },
    { id: 'rg58', label: 'RG-58/U: Z₀, C′ and loss at 100 MHz', state: { solveFor: 'z0', cable: 'RG-58/U (solid centre)', d: 0.81e-3, D: 2.95e-3, dielectric: 'Solid PE (VF 0.66)', er: 2.25, tanD: 0.0004, f: 100e6, fUnit: 'MHz', len: 30 } },
    { id: 'ptfe-50-D', label: 'Design: 50 Ω PTFE line, 1.27 mm centre pin → D', state: { solveFor: 'D', z0: 50, d: 1.27e-3, cable: 'Custom', dielectric: 'PTFE (VF 0.69)', er: 2.08, tanD: 0.0004, f: 10e9, len: 0.3 } },
    { id: 'air-75', label: 'Design: 75 Ω air line, D = 7 mm → d', state: { solveFor: 'd', z0: 75, D: 7e-3, cable: 'Custom', dielectric: 'Air (VF 1.0)', er: 1.0006, tanD: 0, f: 3e9, len: 1 } },
    { id: 'semirigid-te11', label: '.141″ semi-rigid at 40 GHz — above TE₁₁', state: { solveFor: 'z0', cable: 'RG-402 / .141″ semi-rigid', d: 0.912e-3, D: 2.985e-3, dielectric: 'PTFE (VF 0.69)', er: 2.08, tanD: 0.0004, f: 40e9, len: 0.5 } },
  ],
};
