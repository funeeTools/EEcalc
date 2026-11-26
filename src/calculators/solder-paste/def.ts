/** Solder paste / stencil aperture — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, withDefault } from '@/core/unitsets';
import { type Aperture, type PrintResult, type Shape, printModel } from './model';

export const ID = 'pcb/solder-paste-volume';

/** IPC-7525B §3.2.1 release guidelines. */
export const AR_MIN = 0.66;
export const ASPECT_MIN = 1.5;
/** Margin used for the "close to the limit" (warn) tone: within 10 % above a limit. */
const MARGIN = 1.1;

/** Alloy densities (kg/m³) from the Indium Corporation Solder Alloy Directory (97720). */
export const ALLOYS: Record<string, number | null> = {
  Custom: null,
  'SAC305 (96.5Sn 3.0Ag 0.5Cu)': 7400,
  'SAC387 (95.5Sn 3.8Ag 0.7Cu)': 7400,
  'Sn63Pb37': 8400,
  'Sn96.5Ag3.5': 7500,
  'Bi58Sn42 (low temp.)': 8560,
};

export interface SolderPasteState {
  solveFor: 'vpaste' | 't' | 'red';
  vpaste: number;
  vpasteUnit: string;
  shape: Shape;
  padL: number;
  padLUnit: string;
  padW: number;
  padWUnit: string;
  /** Aperture reduction, percent of each pad dimension */
  red: number;
  radius: number;
  radiusUnit: string;
  t: number;
  tUnit: string;
  /** Transfer efficiency, percent */
  te: number;
  alloy: string;
  /** Metal content, weight percent */
  wt: number;
  rhoM: number;
  rhoMUnit: string;
  rhoF: number;
  rhoFUnit: string;
}

export const defaults = (): SolderPasteState => ({
  solveFor: 'vpaste',
  vpaste: 0.1e-9,
  vpasteUnit: 'mm³',
  shape: 'rect',
  padL: 1.5e-3,
  padLUnit: 'mm',
  padW: 0.8e-3,
  padWUnit: 'mm',
  red: 10,
  radius: 0,
  radiusUnit: 'mm',
  t: 120e-6,
  tUnit: 'µm',
  te: 100,
  alloy: 'SAC305 (96.5Sn 3.0Ag 0.5Cu)',
  wt: 88.5,
  rhoM: 7400,
  rhoMUnit: 'g/cm³',
  rhoF: 1000,
  rhoFUnit: 'g/cm³',
});

/** Field limits that a solved value must respect. */
const T_MIN = 10e-6;
const T_MAX = 1e-3;
const V_MIN = 1e-15;
const V_MAX = 1e-6;
const U_FOIL: Record<string, number> = { 'µm': 1e-6, mil: 25.4e-6, mm: 1e-3 };
/**
 * mm³ is the unit SPI machines and stencil guides use. A deposit below 0.001 mm³ (a pad under ~0.1 mm, below
 * any printable aperture) shows as 0.000x mm³: choose nL (= 0.001 mm³) for those, since the core's
 * readable-unit switch only moves between prefixes of the same unit (mm³ ↔ nL is not one).
 */
const U_VOL: Record<string, number> = { 'mm³': 1e-9, 'mil³': 25.4e-6 ** 3, nL: 1e-12 };
const U_RHO: Record<string, number> = { 'g/cm³': 1000, 'kg/m³': 1 };
const isRect = (s: Record<string, any>) => s.shape !== 'circle';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Pad & aperture',
    note: 'The stencil opening is the pad shrunk by the reduction on each dimension.',
    fields: [
      // A new shape is a different aperture: a volume target set for the old one (solving T or the reduction)
      // may be out of reach (a Ø0.8 mm circle holds far less than a 1.5 × 0.8 mm rectangle), so go back to
      // analysis of the aperture now entered.
      { kind: 'select', key: 'shape', label: 'Shape', structural: true, options: [{ value: 'rect', label: 'Rectangle / square' }, { value: 'circle', label: 'Circle (BGA, round pad)' }], apply: (_v, s) => { s.solveFor = 'vpaste'; } },
      { kind: 'number', key: 'padL', symbol: 'L_pad', label: 'Pad length', units: U_LEN_PCB, unitKey: 'padLUnit', min: 1e-5, max: 0.1, visible: isRect },
      { kind: 'number', key: 'padW', symbol: 'W_pad', label: 'Pad width', units: U_LEN_PCB, unitKey: 'padWUnit', min: 1e-5, max: 0.1, visible: isRect, help: 'The narrower pad side usually; the aspect ratio uses the smaller opening dimension.' },
      { kind: 'number', key: 'padW', symbol: 'D_pad', label: 'Pad diameter', units: U_LEN_PCB, unitKey: 'padWUnit', min: 1e-5, max: 0.1, visible: (s) => !isRect(s) },
      { kind: 'number', key: 'red', symbol: 'red', label: 'Reduction', suffix: '%', solvable: true, min: 0, max: 90, help: 'Aperture reduction: opening = pad × (1 − reduction) on each dimension. 0 % = 1:1 aperture. Area shrinks by 1 − (1 − red)².' },
      { kind: 'number', key: 'radius', symbol: 'r', label: 'Corner radius', units: withDefault(U_LEN_PCB, 'mm'), unitKey: 'radiusUnit', min: 0, max: 0.05, visible: isRect, help: 'Radius of the aperture corners (0 = square corners). Rounded corners release paste better; at most half the smaller opening side.' },
    ],
  },
  {
    kind: 'section',
    title: 'Stencil & print',
    fields: [
      { kind: 'number', key: 't', symbol: 'T', label: 'Foil', units: U_FOIL, unitKey: 'tUnit', unitFamily: 'none', solvable: true, min: 10e-6, max: 1e-3, help: 'Stencil foil thickness. Common foils: 100, 120, 127 (5 mil), 150 µm. The finest-pitch aperture on the board usually sets the foil.' },
      { kind: 'number', key: 'te', symbol: 'TE', label: 'Transfer eff.', suffix: '%', min: 1, max: 150, help: 'Transfer efficiency: deposited paste volume ÷ aperture volume, as measured by solder-paste inspection (SPI). It falls as the area ratio falls. 100 % = ideal fill and release.' },
      { kind: 'number', key: 'vpaste', symbol: 'V_paste', label: 'Volume', units: U_VOL, unitKey: 'vpasteUnit', solvable: true, min: 1e-15, max: 1e-6, help: 'Paste volume: wet paste deposited per pad. Target value when solving for T or the reduction.' },
    ],
  },
  {
    kind: 'section',
    title: 'Paste',
    fields: [
      {
        kind: 'select',
        key: 'alloy',
        label: 'Alloy',
        options: Object.keys(ALLOYS),
        apply: (v, s) => {
          const m = ALLOYS[v];
          if (m != null) s.rhoM = m;
        },
        help: 'Fills the alloy density (Indium Corporation Solder Alloy Directory).',
      },
      { kind: 'number', key: 'wt', symbol: 'w_m', label: 'Metal content', suffix: 'wt %', min: 50, max: 99, help: 'Metal weight percent from the paste data sheet (printing pastes are typically 85–90 %).' },
      { kind: 'number', key: 'rhoM', symbol: 'ρ_m', label: 'Alloy density', units: U_RHO, unitKey: 'rhoMUnit', min: 1000, max: 20000 },
      { kind: 'number', key: 'rhoF', symbol: 'ρ_f', label: 'Flux density', units: U_RHO, unitKey: 'rhoFUnit', min: 500, max: 2000, help: 'Density of the flux/vehicle part of the paste, about 1.0 g/cm³ (Kester measured 1.013 g/ml for one paste flux).' },
    ],
  },
];


const fVol = (v: number) => `${(v * 1e9).toPrecision(4)} mm³`;
const fLen = (m: number) => si(m, 'm', 4);
const um = (m: number) => `${(m * 1e6).toPrecision(4)} µm (${(m / 25.4e-6).toFixed(2)} mil)`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

function apertureOf(s: SolderPasteState): Aperture {
  const k = 1 - s.red / 100;
  return { shape: s.shape, l: s.shape === 'circle' ? s.padW * k : s.padL * k, w: s.padW * k, r: s.shape === 'circle' ? 0 : s.radius };
}

const modelOf = (s: SolderPasteState): PrintResult => printModel(apertureOf(s), s.t, s.te / 100, s.wt / 100, s.rhoM, s.rhoF, AR_MIN, ASPECT_MIN);

export function compute(st: SolderPasteState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function fail(msg: string, s: SolderPasteState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function run(st: SolderPasteState): CalcReport {
  const s: SolderPasteState = { ...st };
  if (s.shape !== 'rect' && s.shape !== 'circle') throw new Error('Shape must be rect or circle.');
  const pos = (name: string, v: unknown) => {
    if (!(finite(name, v) > 0)) throw new Error(`${name} must be > 0.`);
  };
  pos('Pad width', s.padW);
  if (s.shape === 'rect') pos('Pad length', s.padL);
  if (s.solveFor !== 't') pos('Foil thickness', s.t);
  if (s.solveFor !== 'vpaste') pos('Target paste volume', s.vpaste);
  if (s.solveFor !== 'red') {
    finite('Aperture reduction', s.red);
    if (s.red < 0 || s.red >= 100) throw new Error('Aperture reduction must be 0 … <100 %.');
  }
  pos('Transfer efficiency', s.te);
  if (!(finite('Metal content', s.wt) > 0 && s.wt < 100)) throw new Error('Metal content must be between 0 and 100 wt %.');
  pos('Alloy density', s.rhoM);
  pos('Flux density', s.rhoF);
  if (s.shape === 'rect') {
    if (!(finite('Corner radius', s.radius) >= 0)) throw new Error('Corner radius must be ≥ 0.');
  }

  // ── solve (V = A·T·TE is linear in T; the reduction is found numerically on the same forward model)
  if (s.solveFor === 't') {
    const a = modelOf({ ...s, t: 1 });
    s.t = s.vpaste / a.vPaste;
    if (!(s.t >= T_MIN && s.t <= T_MAX)) return fail(`Paste volume ${fVol(s.vpaste)} needs a ${um(s.t)} foil, outside the 10–1000 µm range of the foil field. Change the aperture or the target.`, s);
  } else if (s.solveFor === 'red') {
    const g = (red: number) => modelOf({ ...s, red }).vPaste;
    const hiRed = s.shape === 'rect' && s.radius > 0 ? Math.min(90, 100 * (1 - (2 * s.radius) / Math.min(s.padL, s.padW))) : 90;
    if (!(hiRed > 0)) return fail('The corner radius already fills the whole pad width: no reduction leaves room for it.', s);
    const vMax = g(0);
    if (s.vpaste > vMax * (1 + 1e-12)) return fail(`Even a 1:1 aperture (no reduction) gives only ${fVol(vMax)} of paste at T = ${um(s.t)}. Use a thicker foil or an overprint (aperture larger than the pad), or lower the target.`, s);
    const r = invert(g, s.vpaste, { lo: 0, hi: hiRed, log: false, samples: 200 });
    if (!r.ok) return fail(`No reduction between 0 and ${hiRed.toFixed(1)} % gives ${fVol(s.vpaste)}: the smallest deposit is ${fVol(g(hiRed))}. Use a thinner foil.`, s);
    s.red = r.roots[0];
  }
  const ap = apertureOf(s);
  if (s.shape === 'rect' && s.radius > Math.min(ap.l, ap.w) / 2 * (1 + 1e-12)) throw new Error(`Corner radius ${fLen(s.radius)} is more than half the smaller opening side (${fLen(Math.min(ap.l, ap.w))}).`);
  const o = modelOf(s);
  if (s.solveFor === 'vpaste') {
    if (!(o.vPaste >= V_MIN && o.vPaste <= V_MAX)) return fail(`The deposit ${fVol(o.vPaste)} is outside the ${fVol(V_MIN)} – ${fVol(V_MAX)} range of the volume field: check the pad size and units.`, s);
    s.vpaste = o.vPaste;
  }
  return report(s, ap, o);
}

function tone(v: number, lim: number): 'pass' | 'warn' | 'fail' {
  return v < lim ? 'fail' : v < lim * MARGIN ? 'warn' : 'pass';
}

function report(s: SolderPasteState, ap: Aperture, o: PrintResult): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const arT = tone(o.areaRatio, AR_MIN);
  const asT = tone(o.aspectRatio, ASPECT_MIN);
  const padArea = s.shape === 'circle' ? (Math.PI * s.padW * s.padW) / 4 : s.padL * s.padW;
  const worst = arT === 'fail' || asT === 'fail' ? 'fail' : arT === 'warn' || asT === 'warn' ? 'warn' : 'pass';
  rep.status = { text: worst === 'fail' ? 'RELEASE RISK' : worst === 'warn' ? 'MARGINAL' : 'MEETS IPC-7525', tone: worst };

  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k === 't') prim.push(item('t', 'Foil thickness', s.t, 'm', um(s.t), { symbol: 'T', primary: true, solved: true, note: `for ${fVol(s.vpaste)} of paste` }));
  if (k === 'red') prim.push(item('red', 'Aperture reduction', s.red, '%', `${s.red.toFixed(2)} %`, { symbol: 'red', primary: true, solved: true, note: `opening ${fLen(ap.shape === 'circle' ? ap.w : ap.l)}${ap.shape === 'circle' ? ' dia.' : ` × ${fLen(ap.w)}`}` }));
  prim.push(item('vpaste', 'Paste volume', o.vPaste, 'm³', fVol(o.vPaste), { symbol: 'V_paste', primary: true, solved: k === 'vpaste', note: k === 'vpaste' ? `A·T × TE ${s.te} %` : 'target' }));
  prim.push(item('areaRatio', 'Area ratio', o.areaRatio, '', o.areaRatio.toFixed(3), { symbol: 'AR', primary: true, tone: arT, note: `IPC-7525: > ${AR_MIN}` }));
  prim.push(item('aspectRatio', 'Aspect ratio', o.aspectRatio, '', o.aspectRatio.toFixed(2), { symbol: 'W/T', primary: true, tone: asT, note: `IPC-7525: > ${ASPECT_MIN}` }));
  prim.push(item('vSolder', 'Solder after reflow', o.vSolder, 'm³', fVol(o.vSolder), { symbol: 'V_solder', primary: true, note: `${(o.phiMetal * 100).toFixed(1)} vol % of the paste` }));

  const sec: ResultItem[] = [
    item('apL', s.shape === 'circle' ? 'Opening diameter' : 'Opening length', s.shape === 'circle' ? ap.w : ap.l, 'm', fLen(s.shape === 'circle' ? ap.w : ap.l), { symbol: s.shape === 'circle' ? 'D_ap' : 'L_ap', group: 'Aperture' }),
    ...(s.shape === 'circle' ? [] : [item('apW', 'Opening width', ap.w, 'm', fLen(ap.w), { symbol: 'W_ap', group: 'Aperture' })]),
    item('area', 'Opening area', o.area, 'm²', `${(o.area * 1e6).toPrecision(4)} mm²`, { symbol: 'A', group: 'Aperture' }),
    item('perimeter', 'Wall perimeter', o.perimeter, 'm', fLen(o.perimeter), { symbol: 'P', group: 'Aperture' }),
    item('areaVsPad', 'Opening / pad area', o.area / padArea, '', `${((o.area / padArea) * 100).toFixed(1)} %`, { symbol: 'A/A_pad', group: 'Aperture' }),
    item('tMaxArea', 'Thickest foil, area-ratio rule', o.tMaxArea, 'm', um(o.tMaxArea), { symbol: 'T_max,AR', group: 'Foil limits', tone: s.t > o.tMaxArea ? 'fail' : '', note: `A/(${AR_MIN}·P)` }),
    item('tMaxAspect', 'Thickest foil, aspect rule', o.tMaxAspect, 'm', um(o.tMaxAspect), { symbol: 'T_max,AS', group: 'Foil limits', tone: s.t > o.tMaxAspect ? 'fail' : '', note: `W_min/${ASPECT_MIN}` }),
    item('vAperture', 'Aperture volume', o.vAperture, 'm³', fVol(o.vAperture), { symbol: 'A·T', group: 'Paste & solder' }),
    item('phiMetal', 'Metal volume fraction', o.phiMetal, '', `${(o.phiMetal * 100).toFixed(2)} %`, { symbol: 'φ_m', group: 'Paste & solder', note: `from ${s.wt} wt %` }),
    item('pasteMass', 'Paste mass', o.pasteMass, 'kg', si(o.pasteMass * 1000, 'g', 4), { symbol: 'm_paste', group: 'Paste & solder' }),
    item('solderMass', 'Solder mass', o.solderMass, 'kg', si(o.solderMass * 1000, 'g', 4), { symbol: 'm_solder', group: 'Paste & solder' }),
    item('hAvg', 'Solder height if spread on pad', o.vSolder / padArea, 'm', um(o.vSolder / padArea), { symbol: 'h̄', group: 'Paste & solder', note: 'volume ÷ pad area (before the part sits on it)' }),
  ];
  rep.results = [...prim, ...sec];

  if (arT === 'fail') rep.warnings.push(`Area ratio ${o.areaRatio.toFixed(3)} < ${AR_MIN}: paste tends to stay in the aperture. Use a foil ≤ ${um(o.tMaxArea)}, a larger opening, a step-down stencil, or an electroformed / nano-coated foil.`);
  else if (arT === 'warn') rep.warnings.push(`Area ratio ${o.areaRatio.toFixed(3)} is within 10 % of the ${AR_MIN} limit: expect lower and more variable transfer efficiency. Check with SPI.`);
  if (asT === 'fail') rep.warnings.push(`Aspect ratio ${o.aspectRatio.toFixed(2)} < ${ASPECT_MIN}: the opening is too narrow for this foil. Use a foil ≤ ${um(o.tMaxAspect)} or widen the opening.`);
  if (s.te > 100) rep.notes.push('Transfer efficiency above 100 % means the deposit is larger than the opening (gasketing or smear); real joints get that extra paste.');
  if (s.shape === 'rect' && Math.max(ap.l, ap.w) > 5 * Math.min(ap.l, ap.w)) rep.notes.push('Long, narrow opening (L > 5W): its area ratio approaches the aspect ratio / 2, so the aspect-ratio rule governs.');
  rep.notes.push(
    'Area and aspect ratio are the IPC-7525 release guidelines; they predict whether paste leaves the aperture, not joint quality.',
    'Metal volume after reflow uses the rule of mixtures on the metal weight fraction; voids, flux residue and solder lost to vias are not included.',
  );
  rep.summary = `${s.shape === 'circle' ? `Ø${fLen(ap.w)}` : `${fLen(ap.l)} × ${fLen(ap.w)}`} opening in a ${um(s.t)} foil · paste ${(o.phiMetal * 100).toFixed(1)} vol % metal`;
  rep.details = { ...o, aperture: ap, padArea };
  rep.graphs = graphs(s, o);
  rep.tables = [foilTable(s)];
  return rep;
}

function graphs(s: SolderPasteState, o: PrintResult): GraphSpec[] {
  const tHi = Math.max(300e-6, s.t * 1.5);
  const ts = Array.from({ length: 141 }, (_, i) => 20e-6 + ((tHi - 20e-6) * i) / 140);
  if (!ts.includes(s.t)) ts.push(s.t);
  ts.sort((a, b) => a - b);
  const m = ts.map((t) => modelOf({ ...s, t }));
  return [
    {
      id: 'ratios',
      title: 'Release ratios vs foil',
      // One axis: both ratios fall as 1/T, so on two auto-scaled axes the curves always lay on top of each other.
      subtitle: s.shape === 'circle' ? 'Round aperture: aspect = 4 × area ratio' : undefined,
      x: { label: 'Foil thickness T', unit: 'm' },
      y: [{ id: 'ar', label: 'Ratio', unit: '', includeZero: true, max: Math.min(12, 3 * Math.max(o.aspectRatio, ASPECT_MIN)) }],
      series: [
        { label: 'Area ratio', x: ts, y: m.map((r) => r.areaRatio), axis: 'ar', width: 2.2 },
        { label: 'Aspect ratio', x: ts, y: m.map((r) => r.aspectRatio), axis: 'ar', color: '#c47b17', width: 1.6, dash: [6, 3] },
      ],
      hlines: [
        { value: AR_MIN, label: `AR ${AR_MIN}`, axis: 'ar', color: '#8b1e1e', dash: [5, 4] },
        { value: ASPECT_MIN, label: `aspect ${ASPECT_MIN}`, axis: 'ar', color: '#c47b17', dash: [2, 3] },
      ],
      vlines: [{ value: s.t, label: `T = ${(s.t * 1e6).toPrecision(3)} µm` }],
      markers: [
        { x: s.t, y: o.areaRatio, axis: 'ar', label: `AR ${o.areaRatio.toFixed(2)}` },
        { x: s.t, y: o.aspectRatio, axis: 'ar', label: `W/T ${o.aspectRatio.toFixed(2)}`, color: '#c47b17' },
      ],
    },
    {
      id: 'volume',
      title: 'Volume vs foil',
      x: { label: 'Foil thickness T', unit: 'm' },
      // litres, so the axis prefixes read naturally (1 mm³ = 1 µL)
      y: [{ id: 'v', label: 'Volume', unit: 'L', includeZero: true }],
      series: [
        { label: 'Paste (wet)', x: ts, y: m.map((r) => r.vPaste * 1000), axis: 'v', width: 2.2 },
        { label: 'Solder after reflow', x: ts, y: m.map((r) => r.vSolder * 1000), axis: 'v', color: '#4f8a8b', width: 1.6 },
      ],
      vlines: [
        { value: s.t, label: `T = ${(s.t * 1e6).toPrecision(3)} µm` },
        { value: o.tMaxArea, label: `AR limit ${(o.tMaxArea * 1e6).toPrecision(3)} µm`, color: '#8b1e1e', dash: [5, 4] },
      ],
      markers: [{ x: s.t, y: o.vPaste * 1000, axis: 'v', label: fVol(o.vPaste) }],
    },
  ];
}

const FOILS = [75e-6, 100e-6, 120e-6, 127e-6, 150e-6, 200e-6];

function foilTable(s: SolderPasteState): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  const rowTones: ('pass' | 'warn' | 'fail')[] = [];
  for (const t of FOILS) {
    const r = modelOf({ ...s, t });
    const a = tone(r.areaRatio, AR_MIN);
    const b = tone(r.aspectRatio, ASPECT_MIN);
    const v = a === 'fail' || b === 'fail' ? 'fail' : a === 'warn' || b === 'warn' ? 'warn' : 'pass';
    rows.push({ t, areaRatio: r.areaRatio, aspectRatio: r.aspectRatio, vPaste: r.vPaste, vSolder: r.vSolder });
    display.push({ t: `${(t * 1e6).toFixed(0)} µm (${(t / 25.4e-6).toFixed(1)} mil)`, areaRatio: r.areaRatio.toFixed(3), aspectRatio: r.aspectRatio.toFixed(2), vPaste: fVol(r.vPaste), vSolder: fVol(r.vSolder) });
    rowTones.push(v);
  }
  return {
    id: 'foils',
    title: 'Standard foil thicknesses',
    columns: [
      { key: 't', label: 'Foil T', unit: 'm', align: 'left' },
      { key: 'areaRatio', label: 'Area ratio' },
      { key: 'aspectRatio', label: 'Aspect' },
      { key: 'vPaste', label: 'Paste', unit: 'm³' },
      { key: 'vSolder', label: 'Solder', unit: 'm³' },
    ],
    rows,
    display,
    rowTones,
    note: `This opening in each foil, TE ${s.te} %. Green: area ratio ≥ ${(AR_MIN * MARGIN).toFixed(3)} and aspect ≥ ${(ASPECT_MIN * MARGIN).toFixed(2)}; yellow: within 10 % above a limit; red: below ${AR_MIN} or ${ASPECT_MIN} (IPC-7525).`,
  };
}

export const def: CalcDef<SolderPasteState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Stencil area ratio A/(P·T) and aspect ratio W/T checked against IPC-7525B §3.2.1 (> 0.66, > 1.5); paste volume A·T·TE; metal volume fraction by the rule of mixtures from the metal weight fraction and the alloy (Indium Solder Alloy Directory) and flux densities. Solve-for: T in closed form, the aperture reduction by Brent root finding on V(reduction).',
  fields,
  defaults,
  solve: {
    default: 'vpaste',
    analysis: 'vpaste',
    options: [
      { key: 'vpaste', label: 'Paste volume from the aperture (analysis)' },
      { key: 't', label: 'Foil thickness T for a target volume' },
      { key: 'red', label: 'Aperture reduction for a target volume' },
    ],
  },
  compute,
  sync: (s) => {
    const m = ALLOYS[s.alloy];
    if (m != null && Math.abs(m - s.rhoM) > 1e-9) s.alloy = 'Custom';
  },
  examples: [
    { id: 'default', label: '1.5 × 0.8 mm pad, 10 % reduction, 120 µm foil', state: defaults() },
    { id: '0402', label: '0402 chip pad 0.5 × 0.55 mm, 100 µm foil', state: { solveFor: 'vpaste', shape: 'rect', padL: 0.5e-3, padW: 0.55e-3, red: 10, radius: 0.05e-3, t: 100e-6, te: 100 } },
    { id: 'bga05', label: '0.5 mm-pitch BGA, Ø0.25 mm, 100 µm foil (fails AR)', state: { solveFor: 'vpaste', shape: 'circle', padW: 0.25e-3, red: 0, t: 100e-6, te: 85 } },
    { id: 'qfn-fine', label: '0.4 mm-pitch QFN lead 0.2 × 0.6 mm, 127 µm foil (fails)', state: { solveFor: 'vpaste', shape: 'rect', padL: 0.6e-3, padW: 0.2e-3, red: 0, radius: 0, t: 127e-6, te: 100 } },
    { id: 'solve-t', label: 'Foil for 0.12 mm³ on a 1.5 × 0.8 mm pad', state: { solveFor: 't', vpaste: 0.12e-9, shape: 'rect', padL: 1.5e-3, padW: 0.8e-3, red: 10, radius: 0, te: 100 } },
    { id: 'snpb', label: 'Sn63Pb37 paste, 90 wt %: solder volume', state: { solveFor: 'vpaste', alloy: 'Sn63Pb37', rhoM: 8400, wt: 90, shape: 'rect', padL: 1.5e-3, padW: 0.8e-3, red: 10, radius: 0, t: 120e-6, te: 100 } },
  ],
};
