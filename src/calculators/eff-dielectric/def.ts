/** Effective dielectric constant — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphRef, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN, U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { MATERIALS, geometryError } from '../controlled-impedance/def';
import { ACCURACY } from '../controlled-impedance/model';
import { C0, type EffInputs, type EffResult, type Structure, bareMicrostrip, delayOf, effDielectric, eeffOfDelay } from './model';

export const ID = 'pcb/effective-dielectric-constant';

export const STRUCTURES: { value: Structure; label: string }[] = [
  { value: 'ms', label: 'Surface microstrip (bare)' },
  { value: 'mask', label: 'Microstrip under solder mask' },
  { value: 'emb', label: 'Embedded microstrip' },
  { value: 'sl', label: 'Symmetric stripline' },
  { value: 'cpwg', label: 'Grounded coplanar (CPWG)' },
];
const SNAME: Record<Structure, string> = { ms: 'surface microstrip', mask: 'coated microstrip', emb: 'embedded microstrip', sl: 'stripline', cpwg: 'CPWG' };

/** Delay per length: stored in s/m. */
export const U_DELAY: Record<string, number> = { 'ps/mm': 1e-9, 'ps/in': 1e-12 / 0.0254, 'ns/ft': 1e-9 / 0.3048, 'ns/m': 1e-9 };

export interface EffState {
  /** 'eeff' analysis · 'erE' εr from a measured εeff · 'erT' εr from a measured delay */
  solveFor: 'eeff' | 'erE' | 'erT';
  eeff: number;
  tpd: number;
  tpdUnit: string;
  structure: Structure;
  w: number;
  wUnit: string;
  h: number;
  hUnit: string;
  t: number;
  tUnit: string;
  g: number;
  gUnit: string;
  c: number;
  cUnit: string;
  erm: number;
  hc: number;
  hcUnit: string;
  erc: number;
  material: string;
  er: number;
  f: number;
  fUnit: string;
  len: number;
  lenUnit: string;
}

/** 50 Ω outer-layer microstrip of a 1.6 mm 4-layer FR-4 board: 0.2 mm prepreg, 1 oz copper, at 1 GHz. */
export const defaults = (): EffState => ({
  solveFor: 'eeff',
  eeff: 3.0805572829813066, // the computed values, so the first load is already consistent
  tpd: 5.854555690729684e-9,
  tpdUnit: 'ps/mm',
  structure: 'ms',
  w: 0.38e-3,
  wUnit: 'mm',
  h: 0.2e-3,
  hUnit: 'mm',
  t: 35e-6,
  tUnit: 'µm',
  g: 0.3e-3,
  gUnit: 'mm',
  c: 20e-6,
  cUnit: 'µm',
  erm: 3.5,
  hc: 0.1e-3,
  hcUnit: 'mm',
  erc: 4.2,
  material: 'FR-4 prepreg (~1 GHz)',
  er: 4.2,
  f: 1e9,
  fUnit: 'GHz',
  len: 0.1,
  lenUnit: 'mm',
});

/**
 * Last structure / material each live state was computed with (recorded in sync). A select's apply sees only the new
 * value, so this tells a real change from re-selecting the same option; a state never computed (a fresh API call)
 * has no record and counts as unchanged, so values given together with it are kept.
 */
const LAST = new WeakMap<object, { structure: string; material: string }>();
function changed(root: Record<string, unknown>, key: 'structure' | 'material', v: unknown): boolean {
  const last = LAST.get(root);
  return last != null && last[key] !== v;
}

const inSolve = (...k: EffState['solveFor'][]) => (_: unknown, r: Record<string, unknown>) => k.includes(r.solveFor as EffState['solveFor']);

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Effective permittivity',
    note: 'Computed from εr, or type a measured εeff or delay and click ◎ on εr.',
    fields: [
      {
        kind: 'number', key: 'eeff', symbol: 'ε_eff', label: 'Effective permittivity', min: 1, max: 100, solvable: true,
        solvedWhen: inSolve('eeff', 'erT'), onSolve: (_s, r) => (r.solveFor = 'eeff'), onUnsolve: (_s, r) => (r.solveFor = 'erE'),
        help: 'The permittivity a wave on this line effectively sees: c/v squared. Computed from the geometry and εr, or type a measured value and solve for εr. Click ◎ while it is computed to enter a measured value.',
      },
      {
        kind: 'number', key: 'tpd', symbol: 't_pd', label: 'Delay per length', units: U_DELAY, unitKey: 'tpdUnit', unitFamily: 'none', min: 3.3e-9, max: 3.4e-8, solvable: true,
        solvedWhen: inSolve('eeff', 'erE'), onSolve: (_s, r) => (r.solveFor = 'eeff'), onUnsolve: (_s, r) => (r.solveFor = 'erT'),
        help: 'Propagation delay per unit length, √εeff/c (e.g. from a TDR or a VNA phase measurement over a known length). Click ◎ while it is computed to enter a measured value and solve for εr.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Line',
    fields: [
      {
        kind: 'select', key: 'structure', label: 'Structure', options: STRUCTURES,
        // a measured εeff or delay belongs to one line: a *different* structure is analysed from εr instead (§5a);
        // re-selecting the same one (or setting it with the measured value in one API call) keeps the solve
        apply: (v, s, root) => {
          if (changed(root, 'structure', v)) s.solveFor = 'eeff';
        },
        help: 'Surface microstrip includes dispersion (εeff rises with frequency). The coated, embedded and coplanar structures are quasi-static; stripline is pure TEM, so εeff = εr exactly.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', min: 1e-6, max: 0.05 },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Dielectric height', units: U_LEN_PCB, unitKey: 'hUnit', min: 1e-6, max: 0.05, help: 'Microstrip and CPWG: substrate between the trace and the ground below. Stripline: dielectric from the trace to each plane (the planes are 2H + T apart).' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 0.5e-3, help: '1 oz ≈ 35 µm outer copper (plated), ½ oz ≈ 17.5 µm inner. Choose "oz" to type ounces.' },
      { kind: 'number', key: 'g', symbol: 'G', label: 'Gap to ground pour', units: U_LEN_PCB, unitKey: 'gUnit', min: 1e-6, max: 0.05, visible: (s) => s.structure === 'cpwg', help: 'Edge of the trace to the edge of the coplanar ground copper on each side.' },
      { kind: 'number', key: 'c', symbol: 'C', label: 'Mask thickness', units: U_THICK, unitKey: 'cUnit', min: 1e-6, max: 0.2e-3, visible: (s) => s.structure === 'mask', help: 'Liquid photo-imageable mask: about 10–25 µm over the laminate, thinner over the trace.' },
      { kind: 'number', key: 'erm', symbol: 'ε_m', label: 'Mask permittivity', min: 1, max: 10, visible: (s) => s.structure === 'mask', help: 'Typically 3.3–4.0.' },
      { kind: 'number', key: 'hc', symbol: 'H_c', label: 'Cover above trace', units: U_LEN_PCB, unitKey: 'hcUnit', min: 1e-6, max: 0.05, visible: (s) => s.structure === 'emb', help: 'Dielectric from the top of the trace to the top of the cover (no plane above it).' },
      { kind: 'number', key: 'erc', symbol: 'ε_c', label: 'Cover permittivity', min: 1, max: 100, visible: (s) => s.structure === 'emb', help: 'Usually the prepreg on top of the trace.' },
    ],
  },
  {
    kind: 'section',
    title: 'Dielectric',
    fields: [
      {
        kind: 'select',
        key: 'material',
        label: 'Laminate preset',
        options: Object.keys(MATERIALS),
        apply: (v, s, root) => {
          const m = MATERIALS[v];
          // a newly picked laminate gives εr: analyse with it rather than keep solving εr from a measured value
          if (m != null && changed(root, 'material', v)) {
            s.er = m;
            s.solveFor = 'eeff';
          }
        },
        help: 'Fills εr with a typical design value (manufacturer data, ~1–10 GHz).',
      },
      {
        kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Substrate εr', min: 1, max: 100, solvable: true,
        solvedWhen: inSolve('erE', 'erT'), onSolve: (_s, r) => (r.solveFor = 'erT'), onUnsolve: (_s, r) => (r.solveFor = 'eeff'),
        help: 'Relative permittivity (Dk) of the substrate. Click ◎ to find it from a measured delay (or εeff).',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets the dispersion of a surface microstrip and the wavelength results.' },
      { kind: 'number', key: 'len', symbol: 'L', label: 'Line length', units: U_LEN, unitKey: 'lenUnit', unitFamily: 'none', min: 1e-6, max: 100, help: 'For the total delay and the electrical length.' },
    ],
  },
];

const fLen = (m: number) => si(m, 'm', 4);
/** Kirschning–Jansen stated range: H/λ₀ ≤ 0.13, i.e. f·H ≤ 0.13·c ≈ 39 GHz·mm. */
const FN_KJ = (0.13 * C0) / 1e6;
const f4 = (x: number) => String(+x.toPrecision(4));

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export const toInputs = (s: EffState): EffInputs => ({ structure: s.structure, w: s.w, h: s.h, t: s.t, er: s.er, c: s.c, erm: s.erm, hc: s.hc, erc: s.erc, g: s.g, f: s.f });

export function compute(st: EffState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness notes (style guide §12.3):
 *  • error-after-edit on a typed measured value (εeff or delay ×10, ÷10, at a field limit) is a genuine NO
 *    SOLUTION: no εr in 1–100 gives that value on this line, and the message gives the reachable range.
 */
function fail(msg: string, s: EffState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function run(st: EffState): CalcReport {
  const s: EffState = { ...st };
  const k = s.solveFor;
  for (const key of ['w', 'h'] as const) if (!(finite(key.toUpperCase(), s[key]) > 0)) throw new Error(`${key === 'w' ? 'Trace width' : 'Dielectric height'} must be > 0.`);
  if (!(finite('Copper thickness', s.t) >= 0)) throw new Error('Copper thickness must be ≥ 0.');
  if (!(finite('Frequency', s.f) > 0)) throw new Error('Frequency must be > 0.');
  if (!(finite('Line length', s.len) > 0)) throw new Error('Line length must be > 0.');
  if (s.structure === 'cpwg' && !(finite('Gap', s.g) > 0)) throw new Error('The gap to the ground pour must be > 0.');
  if (s.structure === 'mask' && !(finite('Mask thickness', s.c) > 0 && finite('Mask εr', s.erm) >= 1)) throw new Error('Mask thickness must be > 0 and its εr ≥ 1.');
  if (s.structure === 'emb' && !(finite('Cover', s.hc) > 0 && finite('Cover εr', s.erc) >= 1)) throw new Error('Cover thickness must be > 0 and its εr ≥ 1.');
  // a stripline’s εeff is εr whatever the geometry: copper the impedance model cannot take only loses Z₀ (a note)
  const ge = geometryError(toInputs(s));
  if (ge && s.structure !== 'sl') throw new Error(ge);

  if (k === 'eeff') {
    if (!(finite('εr', s.er) >= 1)) throw new Error('εr must be ≥ 1.');
  } else {
    // measured εeff (or delay) → εr: εeff rises monotonically with εr, so a bracketed Brent search on 1…100
    const target = k === 'erE' ? finite('Measured εeff', s.eeff) : eeffOfDelay(finite('Measured delay', s.tpd));
    if (!(target > 0)) throw new Error('The measured value must be > 0.');
    const g = (er: number) => effDielectric({ ...toInputs(s), er }).eeff;
    const lo = g(1);
    const hi = g(100);
    const what = k === 'erE' ? `ε_eff = ${f4(target)}` : `t_pd = ${si(s.tpd * 1e-3, 's', 4)}/mm (ε_eff = ${f4(target)})`;
    if (!(target >= lo * (1 - 1e-12) && target <= hi * (1 + 1e-12)))
      return fail(`No εr in 1–100 gives ${what} on this ${SNAME[s.structure]}: it reaches ε_eff = ${f4(lo)} … ${f4(hi)}${target < lo ? (lo > 1 + 1e-9 ? ' (the cover or mask alone already raises it above 1)' : '') : ''}. Check the measured value, its unit and the structure.`, s);
    s.er = Math.abs(target - lo) <= 1e-12 * lo ? 1 : Math.abs(target - hi) <= 1e-12 * hi ? 100 : brent((er) => g(er) - target, 1, 100, 1e-13);
  }
  const o = effDielectric(toInputs(s));
  if (k !== 'erE') s.eeff = o.eeff;
  if (k !== 'erT') s.tpd = delayOf(o.eeff);
  return report(s, o);
}

function report(s: EffState, o: EffResult): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const w = rep.warnings;
  const notes = rep.notes;
  const u = s.w / s.h;
  const ms = s.structure !== 'sl' && s.structure !== 'cpwg';

  // ── validity
  if (s.structure === 'ms') {
    const fn = (s.f / 1e9) * (s.h * 1e3);
    if (u < 0.1 || u > 100) w.push(`W/H = ${u.toPrecision(3)} is outside 0.1–100, the range Kirschning and Jansen state for their dispersion model. The static value still holds; treat the frequency dependence as approximate.`);
    if (s.er > 20) w.push(`εr = ${f4(s.er)} is above 20, the range of the Kirschning–Jansen dispersion model. Treat the frequency dependence as approximate.`);
    if (fn > FN_KJ) w.push(`f·H = ${fn.toPrecision(3)} GHz·mm is above ${FN_KJ.toFixed(0)} GHz·mm (H/λ₀ = 0.13), the stated limit of the Kirschning–Jansen model. Use a thinner substrate or a full-wave solver.`);
  }
  if (ms) {
    if (u < 0.05 || u > 20) w.push(`W/H = ${u.toPrecision(3)} is outside 0.05–20, where the microstrip and cover models were checked against a field solver. Confirm with a 2-D field solver.`);
    if (s.t / s.h > 0.35) w.push(`T/H = ${(s.t / s.h).toFixed(2)}: copper this thick relative to the dielectric is beyond the checked range of the Hammerstad–Jensen thickness correction. Use a field solver.`);
  }
  if (s.structure !== 'sl') {
    const fTE = C0 / (4 * s.h * Math.sqrt(Math.max(s.er - 1, 1e-9)));
    if (s.er > 1 && s.f > fTE) w.push(`f is above the TE₁ surface-wave onset ≈ ${si(fTE, 'Hz', 3)} of this substrate: the quasi-TEM εeff no longer describes the line. Use a thinner substrate.`);
  }
  if (s.structure === 'mask' && s.c / s.h > 0.25) w.push(`C/H = ${(s.c / s.h).toFixed(2)}: a mask this thick relative to the substrate is beyond the field-solver check (C/H ≤ 0.25).`);
  if (s.structure === 'emb' && (s.t + s.hc) / s.h > 3.2) w.push('The cover is more than 3.2× the substrate height: beyond the field-solver check, and the cover model reads high here.');
  if (s.structure === 'sl') {
    const b = 2 * s.h + s.t;
    const fPP = C0 / (2 * b * Math.sqrt(s.er));
    if (s.f > fPP) w.push(`f is above ${si(fPP, 'Hz', 3)}, where the plane spacing reaches half a wavelength and parallel-plate modes can propagate. Stitch the planes with ground vias.`);
  }
  if (s.structure === 'cpwg' && s.g > s.h) w.push(`G = ${(s.g / s.h).toPrecision(3)}·H: with the pours this far away the conformal map loses accuracy (Z₀ reads up to 4.7 % high at G = 3H). Keep G ≤ H or treat the line as a microstrip.`);

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const vp = C0 / Math.sqrt(o.eeff);
  const tpd = delayOf(o.eeff);
  const lam = vp / s.f;
  const prim: ResultItem[] = [];
  if (k !== 'eeff') prim.push(item('er', 'Substrate εr', s.er, '', f4(s.er), { symbol: 'εᵣ', solved: true, primary: true, note: `from the measured ${k === 'erE' ? 'εeff' : 'delay'} at ${si(s.f, 'Hz', 3)}` }));
  const dispNote = o.dispersive ? `at ${si(s.f, 'Hz', 3)} · static ${f4(o.eeff0)}` : s.structure === 'sl' ? 'TEM: equals εr' : 'quasi-static';
  prim.push(item('eeff', 'Effective permittivity', o.eeff, '', o.eeff.toPrecision(4), { symbol: 'ε_eff', primary: true, solved: k !== 'erE', note: dispNote }));
  prim.push(item('tpd', 'Delay per length', tpd, 's/m', `${si(tpd * 1e-3, 's', 4)}/mm`, { symbol: 't_pd', primary: true, solved: k !== 'erT', note: `${si(tpd * 0.0254, 's', 4)}/in · ${si(tpd * 0.3048, 's', 4)}/ft` }));
  prim.push(item('vp', 'Phase velocity', vp, 'm/s', `${(100 / Math.sqrt(o.eeff)).toFixed(2)} % of c`, { symbol: 'v_p', primary: true, note: si(vp, 'm/s', 4) }));
  prim.push(item('lambdaG', `Wavelength at ${si(s.f, 'Hz', 3)}`, lam, 'm', fLen(lam), { symbol: 'λ_g', primary: true, note: `λ/4 = ${fLen(lam / 4)}` }));

  const sec: ResultItem[] = [
    item('eeff0', 'Quasi-static εeff', o.eeff0, '', o.eeff0.toPrecision(5), { symbol: 'ε_eff,0', group: 'Field split', note: s.structure === 'sl' ? '= εr' : SNAME[s.structure] }),
  ];
  if (s.er > 1 + 1e-6 && s.structure !== 'sl') sec.push(item('q', 'Filling factor', o.q, '', `${(o.q * 100).toFixed(1)} %`, { symbol: 'q', group: 'Field split', note: '(εeff₀ − 1)/(εr − 1): share of the field in the substrate' }));
  if (o.dispersive) sec.push(item('dispersion', 'Rise from dispersion', o.eeff / o.eeff0 - 1, '', `${((o.eeff / o.eeff0 - 1) * 100).toFixed(2)} %`, { group: 'Field split', note: 'Kirschning–Jansen' }));
  if (Number.isFinite(o.z0)) sec.push(item('z0', 'Characteristic impedance', o.z0, 'Ω', si(o.z0, 'Ω', 4), { symbol: 'Z₀', group: 'Field split', note: `quasi-static · model ${ACCURACY[s.structure]}` }));
  else {
    sec.push({ key: 'z0', label: 'Characteristic impedance', value: null, unit: 'Ω', display: '—', symbol: 'Z₀', group: 'Field split', note: 'copper too thick for the stripline impedance model' });
    notes.push('The copper is too thick for Cohn’s stripline thickness correction, so no Z₀ is given; εeff = εr does not depend on it.');
  }
  const tLine = s.len * tpd;
  sec.push(
    item('delay', 'Delay of the line', tLine, 's', si(tLine, 's', 4), { symbol: 't_d', group: `Line of ${si(s.len, 'm', 4)}` }),
    item('elecLen', 'Electrical length', (360 * s.len) / lam, '°', `${((360 * s.len) / lam).toPrecision(4)}°`, { symbol: 'θ', group: `Line of ${si(s.len, 'm', 4)}`, note: `${(s.len / lam).toPrecision(3)} λ at ${si(s.f, 'Hz', 3)}` }),
  );
  rep.results = [...prim, ...sec];
  rep.summary = `${SNAME[s.structure]} · W/H ${u.toPrecision(3)} · εr ${f4(s.er)} · ${si(s.f, 'Hz', 3)}`;
  if (o.dispersive) notes.push('Static εeff from Hammerstad–Jensen (with copper thickness); frequency dependence from Kirschning–Jansen (0.6 % for W/H 0.1–100, εr ≤ 20, H/λ₀ ≤ 0.13, i.e. f·H ≤ 39 GHz·mm).');
  else if (s.structure === 'sl') notes.push('A stripline’s field lies wholly in the dielectric, so the line is pure TEM: εeff = εr at every frequency, whatever the geometry.');
  else notes.push(`Quasi-static εeff (${s.structure === 'cpwg' ? 'conformal mapping' : 'Hammerstad–Jensen with the Wan–Hoorfar cover increment'}); the page has no sourced dispersion model for this structure. Like a microstrip, its εeff rises towards εr at high frequency; the bare-microstrip curve on the graph shows the scale.`);
  if (k !== 'eeff') notes.push('εr found from the measurement assumes the geometry is exact: a 5 % error in W/H moves a 50 Ω microstrip’s εeff by about 0.5 %, and the extracted εr by a little more. Stripline extraction is geometry-free.');
  notes.push('Laminate Dk itself falls slowly with frequency (glass-resin dispersion), which this page does not model: enter the Dk at the frequency of interest.');
  rep.details = { ...o, inputs: toInputs(s) };
  rep.graphs = graphs(s, o);
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: EffState, o: EffResult): GraphSpec[] {
  const i = toInputs(s);
  const fLo = Math.max(Math.min(s.f / 100, 1e8), 1);
  const fHi = Math.min(Math.max(s.f * 10, 1e10), 1e12);
  const fs = [...logspace(fLo, fHi, 100), s.f].sort((a, b) => a - b);
  const ef = fs.map((f) => effDielectric({ ...i, f }).eeff);
  const series: GraphSpec['series'] = [{ label: SNAME[s.structure], x: fs, y: ef, axis: 'e', width: 2.4 }];
  if (s.structure !== 'ms') series.push({ label: 'bare microstrip, same W/H', x: fs, y: fs.map((f) => bareMicrostrip(s.w, s.h, s.t, s.er, f)), axis: 'e', width: 1.3, dash: [5, 3], color: '#9a8f7a' });
  // where the models stop: Kirschning–Jansen's stated range (surface microstrip) and the TE₁ surface-wave onset
  const limits: GraphRef[] = [];
  if (s.structure === 'ms') {
    const fKJ = (FN_KJ * 1e6) / s.h;
    if (fKJ < fHi) limits.push({ value: fKJ, label: 'K–J limit', color: '#8b1e1e', dash: [4, 3] });
  }
  if (s.structure !== 'sl' && s.er > 1) {
    const fTE = C0 / (4 * s.h * Math.sqrt(s.er - 1));
    if (fTE < fHi) limits.push({ value: fTE, label: 'TE₁ onset', color: '#8b1e1e', dash: [2, 3] });
  }
  const g1: GraphSpec = {
    id: 'eeff-vs-f',
    title: 'εeff vs frequency',
    subtitle: o.dispersive ? 'Kirschning–Jansen dispersion: the field moves into the substrate as f rises' : s.structure === 'sl' ? 'stripline: εeff = εr at every frequency' : 'quasi-static (no dispersion model for this structure)',
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'e', label: 'ε_eff', unit: '' }],
    series,
    hlines: [{ value: s.er, label: `ε_r = ${f4(s.er)}`, axis: 'e', color: '#8b1e1e', dash: [4, 3] }],
    vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz', 3)}`, color: '#9a8f7a' }, ...limits],
    markers: [{ x: s.f, y: o.eeff, axis: 'e', label: o.eeff.toPrecision(4) }],
  };
  // static εeff against W/H (the geometry dependence)
  const u0 = s.w / s.h;
  const us = [...logspace(Math.min(0.05, u0 / 2), Math.max(20, u0 * 2), 90), u0].sort((a, b) => a - b);
  const valid = (x: number) => s.structure === 'sl' || !geometryError({ ...i, w: x * s.h });
  const uu = us.filter(valid);
  const eu = uu.map((x) => effDielectric({ ...i, w: x * s.h }).eeff0);
  const s2: GraphSpec['series'] = [{ label: SNAME[s.structure], x: uu, y: eu, axis: 'e', width: 2.4 }];
  if (s.structure !== 'ms' && s.structure !== 'sl') s2.push({ label: 'bare microstrip', x: uu, y: uu.map((x) => effDielectric({ ...i, structure: 'ms', w: x * s.h }).eeff0), axis: 'e', width: 1.3, dash: [5, 3], color: '#9a8f7a' });
  const g2: GraphSpec = {
    id: 'eeff-vs-wh',
    title: 'εeff vs W/H',
    subtitle: s.structure === 'sl' ? 'stripline: independent of the geometry' : 'quasi-static: wider traces hold more of the field in the substrate',
    x: { label: 'W/H', unit: '', log: true },
    y: [{ id: 'e', label: 'ε_eff (static)', unit: '' }],
    series: s2,
    hlines: [
      { value: s.er, label: `ε_r = ${f4(s.er)}`, axis: 'e', color: '#8b1e1e', dash: [4, 3] },
      ...(s.structure === 'ms' ? [{ value: (s.er + 1) / 2, label: '(ε_r + 1)/2', axis: 'e', color: '#9a8f7a', dash: [2, 3] }] : []),
    ],
    vlines: [{ value: u0, label: `W/H = ${u0.toPrecision(3)}`, color: '#9a8f7a' }],
    markers: [{ x: u0, y: o.eeff0, axis: 'e', label: o.eeff0.toPrecision(4) }],
  };
  return [g1, g2];
}

export const def: CalcDef<EffState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Quasi-static εeff from the controlled-impedance models (Hammerstad–Jensen 1980 microstrip with thickness correction; Wan–Hoorfar 2000 cover filling factor for mask and embedded lines; εeff = εr for stripline; Ghione–Naldi conformal mapping for CPWG); surface-microstrip dispersion by Kirschning–Jansen (1982). t_pd = √εeff/c, λ_g = c/(f√εeff). εr from a measured εeff or delay by Brent root finding on the same forward model.',
  fields,
  defaults,
  solve: {
    default: 'eeff',
    analysis: 'eeff',
    options: [
      { key: 'eeff', label: 'εeff and delay from εr (analysis)' },
      { key: 'erT', label: 'εr from a measured delay per length' },
      { key: 'erE', label: 'εr from a measured εeff' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
    LAST.set(s, { structure: s.structure, material: s.material });
  },
  examples: [
    { id: 'default', label: '50 Ω outer-layer microstrip, 0.2 mm FR-4 prepreg, 1 GHz', state: defaults() },
    { id: 'dispersion', label: 'Two-layer 1.6 mm FR-4 at 10 GHz: dispersion raises εeff', state: { ...defaults(), w: 3e-3, h: 1.6e-3, material: 'FR-4 (generic)', er: 4.4, f: 10e9 } },
    { id: 'mask', label: 'The default line under 20 µm of solder mask', state: { ...defaults(), structure: 'mask' } },
    { id: 'stripline', label: 'Stripline: εeff = εr, delay set by the laminate alone', state: { ...defaults(), structure: 'sl', w: 0.13e-3, h: 0.2e-3, t: 17.5e-6 } },
    { id: 'tdr', label: 'Measured 6.0 ps/mm on the default line → εr', state: { ...defaults(), solveFor: 'erT', material: 'Custom', tpd: 6.0e-9, f: 2e9 } },
    { id: 'cpwg', label: 'CPWG on 0.254 mm RO4350B at 10 GHz', state: { ...defaults(), structure: 'cpwg', w: 0.45e-3, g: 0.2e-3, h: 0.254e-3, material: 'RO4350B', er: 3.66, f: 10e9, len: 0.02 } },
  ],
};
