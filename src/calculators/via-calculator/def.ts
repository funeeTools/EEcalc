/** Via calculator — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, U_ROUGH } from '@/core/unitsets';
import { copperResistivity } from '@/physics/constants';
import { MIL2, type Layer } from '@/calculators/trace-width-current/model';
import { barrelArea, barrelR, barrelTheta, johnsonC, johnsonL, partialL, viaCurrent, viaDelay, zcoax } from './model';

export const ID = 'pcb/via-calculator';

/** Laminate presets (design Dk, manufacturer data sheets). */
export const MATERIALS: Record<string, number | null> = {
  Custom: null,
  'FR-4 (generic)': 4.4,
  'FR-4 (~1 GHz)': 4.0,
  RO4350B: 3.66,
  RO4003C: 3.55,
  'RT/duroid 5880': 2.2,
  'Polyimide (Kapton HN)': 3.4,
};

/** Aspect-ratio presets (board thickness : drill). Typical fabricator capabilities; check yours. */
export const AR_PRESETS: Record<string, number | null> = {
  Custom: null,
  'Basic / prototype (6:1)': 6,
  'Standard (8:1)': 8,
  'Advanced (10:1)': 10,
  'High-end (12:1)': 12,
};

/** IPC-6012 minimum average hole-wall copper (Table 3-2): Class 1 and 2 20 µm, Class 3 25 µm. */
export const PLATING_MIN = { class2: 20e-6, class3: 25e-6 };
/** Span of the IPC-2221 conductor charts the current fit was read from. */
export const CHART = { dTmin: 10, dTmax: 100, iMaxExt: 35, areaMax: 700 * MIL2 };

export type ViaSolve = 'iMax' | 'd' | 't' | 'Da';

export interface ViaState {
  solveFor: ViaSolve;
  /** Current capacity (A): computed, or the target when solving for d or t */
  iMax: number;
  /** Barrel impedance in its antipad (Ω): computed, or the target when solving for D_ap */
  z: number;
  d: number;
  dUnit: string;
  t: number;
  tUnit: string;
  pad: number;
  padUnit: string;
  Da: number;
  DaUnit: string;
  h: number;
  hUnit: string;
  material: string;
  er: number;
  fab: string;
  arMax: number;
  dT: number;
  ta: number;
  layer: Layer;
  kCu: number;
  mask: 'tented' | 'open';
}

export const defaults = (): ViaState => ({
  solveFor: 'iMax',
  iMax: 1.685,
  z: 34.41,
  d: 0.3e-3,
  dUnit: 'mm',
  t: 25e-6,
  tUnit: 'µm',
  pad: 0.6e-3,
  padUnit: 'mm',
  Da: 1.0e-3,
  DaUnit: 'mm',
  h: 1.6e-3,
  hUnit: 'mm',
  material: 'FR-4 (generic)',
  er: 4.4,
  fab: 'Standard (8:1)',
  arMax: 8,
  dT: 10,
  ta: 25,
  layer: 'external',
  kCu: 385,
  mask: 'tented',
});

const solvedIn = (...k: ViaSolve[]) => (_s: unknown, r: Record<string, any>) => k.includes(r.solveFor);

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Via',
    note: 'Click ◎ on the drill or plating to size them for a current, or on D_ap for an impedance.',
    fields: [
      { kind: 'number', key: 'iMax', symbol: 'I_max', label: 'Current capacity', unit: 'A', min: 1e-3, max: 1000, solvable: true, solvedWhen: solvedIn('iMax', 'Da'), onSolve: (_s, r) => (r.solveFor = 'iMax'), onUnsolve: (_s, r) => (r.solveFor = 'd'), help: 'Current that raises the barrel by ΔT on the IPC-2221 chart (via plating treated as a conductor of the same cross-section). Becomes the target when you solve for the drill or the plating.' },
      { kind: 'number', key: 'z', symbol: 'Z_via', label: 'Via impedance', unit: 'Ω', min: 1e-3, max: 500, solvable: true, solvedWhen: solvedIn('iMax', 'd', 't'), onSolve: (_s, r) => (r.solveFor = 'iMax'), onUnsolve: (_s, r) => (r.solveFor = 'Da'), help: 'Coaxial estimate of the barrel inside its antipad: (η₀/2π√εr)·ln(D_ap/d). Becomes the target when you solve for the antipad.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Drill diameter', units: U_LEN_PCB, unitKey: 'dUnit', min: 50e-6, max: 6e-3, solvable: true, help: 'Drilled hole diameter: the outside of the plating. The finished hole is d − 2t.' },
      { kind: 'number', key: 't', symbol: 't', label: 'Plating thickness', units: U_ROUGH, unitKey: 'tUnit', min: 1e-6, max: 150e-6, solvable: true, help: 'Copper on the hole wall. IPC-6012 minimum average: 20 µm (Class 1 and 2), 25 µm (Class 3).' },
      { kind: 'number', key: 'pad', symbol: 'D_pad', label: 'Pad diameter', units: U_LEN_PCB, unitKey: 'padUnit', min: 0.1e-3, max: 10e-3, help: 'Land around the hole on the signal layers. Used in Johnson’s capacitance estimate.' },
      { kind: 'number', key: 'Da', symbol: 'D_ap', label: 'Antipad diameter', units: U_LEN_PCB, unitKey: 'DaUnit', min: 50e-6, max: 20e-3, solvable: true, help: 'Clearance hole in the reference planes around the via.' },
      { kind: 'number', key: 'h', symbol: 'T', label: 'Board thickness', units: U_LEN_PCB, unitKey: 'hUnit', min: 0.1e-3, max: 10e-3, help: 'Via length: a through via spans the whole board.' },
    ],
  },
  {
    kind: 'section',
    title: 'Board & fab',
    fields: [
      { kind: 'select', key: 'material', label: 'Laminate', options: Object.keys(MATERIALS), apply: (v, s) => setMaterial(s as ViaState, v) },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 20, help: 'Relative permittivity (Dk) of the laminate around the barrel.' },
      { kind: 'select', key: 'fab', label: 'Fab capability', options: Object.keys(AR_PRESETS), apply: (v, s) => { const a = AR_PRESETS[v]; if (a) (s as ViaState).arMax = a; }, help: 'Largest board-thickness-to-drill ratio the fabricator plates reliably. Ask yours: it depends on the plating line.' },
      { kind: 'number', key: 'arMax', symbol: 'AR_max', label: 'Max aspect ratio', suffix: ': 1', min: 1, max: 40 },
      { kind: 'select', key: 'mask', label: 'Solder mask', options: [{ value: 'tented', label: 'Tented (covers the via)' }, { value: 'open', label: 'Open, ENIG pads' }], help: 'Drawing only: tenting does not change the electrical or thermal results.' },
    ],
  },
  {
    kind: 'section',
    title: 'Current & heat',
    fields: [
      { kind: 'number', key: 'dT', symbol: 'ΔT', label: 'Temperature rise', suffix: '°C', min: 1, max: 150, help: 'Allowed rise of the barrel above ambient. The IPC-2221 charts span 10–100 °C.' },
      { kind: 'number', key: 'ta', symbol: 'T_a', label: 'Ambient', suffix: '°C', min: -60, max: 200, help: 'Sets the copper resistivity at the conductor temperature T_a + ΔT.' },
      { kind: 'select', key: 'layer', label: 'IPC-2221 chart', options: [{ value: 'external', label: 'External (k = 0.048)' }, { value: 'internal', label: 'Internal (k = 0.024), conservative' }], help: 'The via has no chart of its own. The external curve is the usual choice; the internal curve halves the current for a buried via or a cautious rating.' },
      { kind: 'number', key: 'kCu', symbol: 'k_Cu', label: 'Copper conductivity', suffix: 'W/m·K', min: 50, max: 420, help: 'Thermal conductivity of the plated copper. Pure copper ≈ 390–400 W/m·K; electroplated copper is a little lower.' },
    ],
  },
];

function setMaterial(s: ViaState, v: string): void {
  const er = MATERIALS[v];
  if (er) s.er = er;
}

const fLen = (m: number) => si(m, 'm', 4);

function num(name: string, v: unknown, positive = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (positive && !(v > 0)) throw new Error(`${name} must be > 0.`);
  return v;
}

function fail(msg: string, s: ViaState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

/** Root of a monotonic g on [lo, hi]; null when the target is outside g's range there. */
function solveMono(g: (x: number) => number, target: number, lo: number, hi: number): number | null {
  const a = g(lo) - target;
  const b = g(hi) - target;
  if (!(Number.isFinite(a) && Number.isFinite(b)) || a * b > 0) return null;
  return brent((x) => g(x) - target, lo, hi, 1e-14 * hi);
}

export function compute(st: ViaState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness (§12.3) triage: the medium "error-after-edit" flags are all typed numbers that make the via
 * impossible (a pad or antipad smaller than the drill, plating thicker than half the drill) or a target current /
 * impedance that no drill, plating or antipad in range reaches. Those are the user's own numbers (§5a), and every
 * message says what limits the answer. Setting switches (laminate, chart, fab, mask, ◎, examples) never error.
 */
function run(st: ViaState): CalcReport {
  const s: ViaState = { ...st };
  const k = s.solveFor;
  if (!['iMax', 'd', 't', 'Da'].includes(k)) throw new Error('solveFor must be iMax, d, t or Da.');
  if (s.layer !== 'external' && s.layer !== 'internal') throw new Error('IPC chart must be external or internal.');
  if (k !== 'd') num('Drill diameter', s.d);
  if (k !== 't') num('Plating thickness', s.t);
  if (k !== 'Da') num('Antipad diameter', s.Da);
  num('Pad diameter', s.pad);
  num('Board thickness', s.h);
  if (num('εr', s.er) < 1) throw new Error('εr must be ≥ 1.');
  num('Max aspect ratio', s.arMax);
  num('Temperature rise', s.dT);
  num('Ambient temperature', s.ta, false);
  num('Copper conductivity', s.kCu);
  if (k === 'd' || k === 't') num('Target current', s.iMax);
  if (k === 'Da') num('Target impedance', s.z);

  // ── solve for the unknown on the forward equations
  if (k === 'd') {
    const lo = Math.max(2 * s.t * (1 + 1e-9), 50e-6);
    const hi = 6e-3;
    if (!(hi > lo)) return fail(`Plating ${fLen(s.t)} leaves no drill size up to 6 mm with an open hole.`, s);
    const r = solveMono((d) => viaCurrent(d, s.t, s.dT, s.layer), s.iMax, lo, hi);
    if (r == null) return fail(`No drill between ${fLen(lo)} and 6 mm carries ${si(s.iMax, 'A', 4)} with ${fLen(s.t)} plating at ΔT = ${+s.dT.toPrecision(4)} °C (range ${si(viaCurrent(lo, s.t, s.dT, s.layer), 'A', 3)} … ${si(viaCurrent(hi, s.t, s.dT, s.layer), 'A', 3)}). Use thicker plating, several vias in parallel, or allow a larger rise.`, s);
    s.d = r;
  } else if (k === 't') {
    const hi = Math.min(150e-6, (s.d / 2) * (1 - 1e-9));
    const lo = 1e-6;
    if (!(hi > lo)) return fail(`A ${fLen(s.d)} drill leaves no room for plating.`, s);
    const r = solveMono((t) => viaCurrent(s.d, t, s.dT, s.layer), s.iMax, lo, hi);
    if (r == null) return fail(`No plating between 1 µm and ${fLen(hi)} lets a ${fLen(s.d)} via carry ${si(s.iMax, 'A', 4)} at ΔT = ${+s.dT.toPrecision(4)} °C (range ${si(viaCurrent(s.d, lo, s.dT, s.layer), 'A', 3)} … ${si(viaCurrent(s.d, hi, s.dT, s.layer), 'A', 3)}). Use a larger drill or several vias in parallel.`, s);
    s.t = r;
  } else if (k === 'Da') {
    const lo = Math.max(s.d * (1 + 1e-9), 50e-6);
    const hi = 20e-3;
    const r = lo < hi ? solveMono((D) => zcoax(s.d, D, s.er), s.z, lo, hi) : null;
    if (r == null) return fail(`No antipad up to 20 mm gives Z_via = ${si(s.z, 'Ω', 4)} around a ${fLen(s.d)} drill in εr = ${+s.er.toPrecision(4)} (range 0 … ${si(zcoax(s.d, hi, s.er), 'Ω', 3)}).`, s);
    s.Da = r;
  }

  // ── geometry checks (typed values the via cannot have)
  if (!(s.d > 2 * s.t)) throw new Error(`Plating ${fLen(s.t)} fills a ${fLen(s.d)} drill: the plating must be thinner than half the drill.`);
  if (!(s.pad > s.d)) {
    if (k === 'd') return fail(`${si(s.iMax, 'A', 4)} needs a ${fLen(s.d)} drill, which does not fit the ${fLen(s.pad)} pad. Enlarge the pad, plate thicker, or use several vias.`, s);
    throw new Error(`Pad ${fLen(s.pad)} must be larger than the drill ${fLen(s.d)}.`);
  }
  if (!(s.Da > s.d)) throw new Error(`Antipad ${fLen(s.Da)} must be larger than the drill ${fLen(s.d)}.`);

  const i = viaCurrent(s.d, s.t, s.dT, s.layer);
  const z = zcoax(s.d, s.Da, s.er);
  if (k !== 'd' && k !== 't') {
    if (!(i >= 1e-3 && i <= 1000)) return fail(`I_max = ${si(i, 'A', 3)} is outside the 1 mA – 1 kA range of the field.`, s);
    s.iMax = i;
  }
  if (k !== 'Da') {
    if (!(z >= 1e-3 && z <= 500)) return fail(`Z_via = ${si(z, 'Ω', 3)} is outside the field range: the antipad is almost the drill size.`, s);
    s.z = z;
  }
  return report(s, i, z);
}

function report(s: ViaState, iCap: number, z: number): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const A = barrelArea(s.d, s.t);
  const tc = s.ta + s.dT;
  const r20 = barrelR(s.d, s.t, s.h, 20);
  const rT = barrelR(s.d, s.t, s.h, tc);
  const theta = barrelTheta(s.d, s.t, s.h, s.kCu);
  const ar = s.h / s.d;
  const arOk = ar <= s.arMax * (1 + 1e-12);
  const iUse = k === 'd' || k === 't' ? s.iMax : iCap;
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const capOk = s.Da > s.pad;
  const cJ = capOk ? johnsonC(s.er, s.h, s.pad, s.Da) : null;
  const longVia = s.h / s.d >= 2;
  const lP = longVia ? partialL(s.h, s.d) : null;
  const lJ = longVia ? johnsonL(s.h, s.d) : null;
  const td = viaDelay(s.h, s.er);

  const prim: ResultItem[] = [];
  if (k === 'd') prim.push(item('d', 'Drill diameter', s.d, 'm', fLen(s.d), { symbol: 'd', primary: true, solved: true, note: `${(s.d / 25.4e-6).toFixed(1)} mil · for ${si(s.iMax, 'A', 4)}` }));
  if (k === 't') prim.push(item('t', 'Plating thickness', s.t, 'm', si(s.t, 'm', 4), { symbol: 't', primary: true, solved: true, note: `${(s.t / 25.4e-6).toFixed(2)} mil · for ${si(s.iMax, 'A', 4)}` }));
  if (k === 'Da') prim.push(item('Da', 'Antipad diameter', s.Da, 'm', fLen(s.Da), { symbol: 'D_ap', primary: true, solved: true, note: `${(s.Da / 25.4e-6).toFixed(1)} mil · for ${si(s.z, 'Ω', 4)}` }));
  prim.push(item('iMax', 'Current capacity', iCap, 'A', si(iCap, 'A', 4), { symbol: 'I_max', primary: true, solved: k === 'iMax' || k === 'Da', note: k === 'd' || k === 't' ? 'target' : `ΔT = ${+s.dT.toPrecision(4)} °C, IPC-2221 ${s.layer}` }));
  prim.push(item('z', 'Via impedance', z, 'Ω', si(z, 'Ω', 4), { symbol: 'Z_via', primary: true, solved: k !== 'Da', note: k === 'Da' ? 'target' : 'coaxial, in the antipad' }));
  prim.push(item('ar', 'Aspect ratio', ar, '', `${ar.toFixed(2)} : 1`, { symbol: 'AR', primary: true, tone: arOk ? 'pass' : 'fail', note: `limit ${+s.arMax.toPrecision(4)} : 1` }));
  prim.push(item('r', 'DC resistance', rT, 'Ω', si(rT, 'Ω', 3), { symbol: 'R_dc', primary: true, note: `at ${tc.toFixed(0)} °C` }));

  const sec: ResultItem[] = [
    item('area', 'Plated cross-section', A, 'm²', `${(A * 1e6).toFixed(4)} mm² (${(A / MIL2).toFixed(1)} mil²)`, { symbol: 'A', group: 'Barrel', note: 'π·t·(d − t)' }),
    item('finished', 'Finished hole', s.d - 2 * s.t, 'm', fLen(s.d - 2 * s.t), { symbol: 'd − 2t', group: 'Barrel' }),
    item('r20', 'Resistance at 20 °C', r20, 'Ω', si(r20, 'Ω', 3), { symbol: 'R_20', group: 'Barrel' }),
    item('theta', 'Thermal resistance', theta, 'K/W', `${theta.toPrecision(4)} K/W`, { symbol: 'θ_via', group: 'Barrel', note: `plating only, k_Cu = ${+s.kCu.toPrecision(4)} W/m·K` }),
    item('vDrop', `Voltage drop at ${si(iUse, 'A', 3)}`, iUse * rT, 'V', si(iUse * rT, 'V', 3), { symbol: 'V', group: 'Barrel' }),
    item('pLoss', `Power at ${si(iUse, 'A', 3)}`, iUse * iUse * rT, 'W', si(iUse * iUse * rT, 'W', 3), { symbol: 'P', group: 'Barrel', note: 'I²R in the barrel' }),
    item('cJ', 'Pad-to-plane capacitance', cJ, 'F', cJ != null ? si(cJ, 'F', 3) : 'n/a (D_ap ≤ D_pad)', { symbol: 'C_via', group: 'Signal', note: 'Johnson & Graham: 1.41·εr·T·D_pad/(D_ap − D_pad) pF, inches' }),
    item('lPartial', 'Barrel inductance', lP, 'H', lP != null ? si(lP, 'H', 3) : 'n/a (T < 2d)', { symbol: 'L_via', group: 'Signal', note: 'Rosa/Grover partial: 5.08·T·[ln(4T/d) − 1] nH' }),
    item('lJohnson', 'Same, Johnson’s book form', lJ, 'H', lJ != null ? si(lJ, 'H', 3) : 'n/a (T < 2d)', { symbol: 'L_J', group: 'Signal', note: '5.08·T·[ln(4T/d) + 1] nH as printed' }),
    item('delay', 'Delay through the via', td, 's', si(td, 's', 3), { symbol: 't_d', group: 'Signal', note: 'T·√εr / c' }),
    item('ring', 'Annular ring (nominal)', (s.pad - s.d) / 2, 'm', fLen((s.pad - s.d) / 2), { symbol: 'AR_ring', group: 'Pad & clearance', note: '(D_pad − d)/2, before drill wander' }),
    item('clear', 'Pad-to-plane clearance', (s.Da - s.pad) / 2, 'm', fLen((s.Da - s.pad) / 2), { symbol: 'c', group: 'Pad & clearance', note: '(D_ap − D_pad)/2' }),
    item('dMinAr', 'Smallest drill for the AR limit', s.h / s.arMax, 'm', fLen(s.h / s.arMax), { symbol: 'd_min', group: 'Pad & clearance', note: `T / ${+s.arMax.toPrecision(4)}` }),
  ];
  rep.results = [...prim, ...sec];
  rep.status = arOk ? { text: `AR ${ar.toFixed(1)}:1 OK`, tone: 'pass' } : { text: `AR ${ar.toFixed(1)}:1 > ${+s.arMax.toPrecision(4)}:1`, tone: 'fail' };

  // ── warnings at the limits of the models and the fab
  if (!arOk) rep.warnings.push(`Aspect ratio ${ar.toFixed(2)}:1 exceeds the ${+s.arMax.toPrecision(4)}:1 limit: plating thins towards the middle of a deep, narrow hole. Use a drill of at least ${fLen(s.h / s.arMax)}, a thinner board, or confirm the capability with your fabricator.`);
  if (s.t < PLATING_MIN.class2 * (1 - 1e-9)) rep.warnings.push(`Plating ${si(s.t, 'm', 3)} is below the IPC-6012 minimum average of 20 µm (Class 1 and 2). Specify at least 20 µm, or 25 µm for Class 3.`);
  else if (s.t < PLATING_MIN.class3 * (1 - 1e-9)) rep.notes.push(`Plating ${si(s.t, 'm', 3)} meets IPC-6012 Class 1–2 (20 µm average) but not Class 3 (25 µm).`);
  const outside: string[] = [];
  if (s.dT < CHART.dTmin - 1e-9 || s.dT > CHART.dTmax + 1e-9) outside.push(`ΔT = ${+s.dT.toPrecision(4)} °C (charts: 10–100 °C)`);
  const iChart = s.layer === 'external' ? CHART.iMaxExt : CHART.iMaxExt / 2;
  if (iCap > iChart * (1 + 1e-9)) outside.push(`I = ${si(iCap, 'A', 3)} (charts: up to ${iChart} A)`);
  if (A > CHART.areaMax * (1 + 1e-9)) outside.push(`A = ${(A / MIL2).toFixed(0)} mil² (charts: up to 700 mil²)`);
  if (outside.length) rep.warnings.push(`Outside the IPC-2221 chart range: ${outside.join('; ')}. The current fit is extrapolated; spread the current over several vias or check with a thermal simulation.`);
  if (tc > 105) rep.warnings.push(`Barrel temperature ${tc.toFixed(0)} °C exceeds the ~105–130 °C rating (UL RTI) of typical FR-4. Allow a smaller rise or use several vias.`);
  if (!capOk) rep.warnings.push(`Antipad ${fLen(s.Da)} is no larger than the pad ${fLen(s.pad)}: Johnson’s capacitance formula needs D_ap > D_pad. Enlarge the antipad so the plane clears the pad, or remove the non-functional pads on the plane layers.`);
  if (!longVia) rep.warnings.push(`The via is short for its diameter (T/d = ${(s.h / s.d).toFixed(2)} < 2): the thin-wire inductance formulas do not apply, so L is not shown.`);
  if (s.Da / s.d < 1.5) rep.notes.push('Antipad less than 1.5× the drill: the coaxial impedance is very low, and real pads and plane edges dominate.');
  if ((s.pad - s.d) / 2 < 0.1e-3) rep.notes.push(`Nominal annular ring ${fLen((s.pad - s.d) / 2)}: check it against drill wander and your IPC class with the Padstack & Annular Ring calculator.`);
  rep.notes.push(
    'Current: the plating is rated as a conductor of the same cross-section on the IPC-2221 chart. Vias run cooler than traces of equal area, because they are short and heat-sunk, so this is on the safe side.',
    'Impedance treats the barrel as the centre of a coaxial line whose outer conductor is the antipad edge: a fair estimate with a dense plane stack, rough with only two planes.',
    'Resistance uses annealed copper (1.724 µΩ·cm at 20 °C); electroplated copper is a few per cent more resistive.',
  );
  rep.summary = `${fLen(s.d)} drill, ${si(s.t, 'm', 3)} plating, ${fLen(s.h)} board · AR ${ar.toFixed(1)}:1 · ${si(iCap, 'A', 3)} at ΔT ${+s.dT.toPrecision(4)} °C · Z ${si(z, 'Ω', 3)}`;
  rep.details = { area: A, tc, rho: copperResistivity(tc), theta, ar, cJ, lP, lJ, td };
  rep.graphs = graphs(s, iCap, z);
  return rep;
}

function graphs(s: ViaState, iCap: number, z: number): GraphSpec[] {
  const dLo = Math.max(2.2 * s.t, 50e-6);
  const dHi = Math.max(4 * s.d, 1e-3);
  const ds = Array.from({ length: 161 }, (_, i) => dLo * (dHi / dLo) ** (i / 160));
  const ts = [...new Set([20e-6, 25e-6, 35e-6, s.t])].sort((a, b) => a - b);
  const pal = ['#4f8a8b', '#c47b17', '#6b5b95'];
  let pi = 0;
  const series = ts.map((t) => {
    const x = ds.filter((d) => d > 2.05 * t);
    const mine = t === s.t;
    return { label: `t = ${si(t, 'm', 3)}${mine ? ' (this via)' : ''}`, x, y: x.map((d) => viaCurrent(d, t, s.dT, s.layer)), color: mine ? '#1f4e5f' : pal[pi++ % pal.length], width: mine ? 2.4 : 1.2, dash: mine ? undefined : [5, 3] };
  });
  const dMin = s.h / s.arMax;
  const Das = Array.from({ length: 161 }, (_, i) => s.d * (1.05 + ((Math.max(8, (3 * s.Da) / s.d) - 1.05) * i) / 160));
  return [
    {
      id: 'i-vs-d',
      title: 'Current capacity vs drill',
      subtitle: `ΔT = ${+s.dT.toPrecision(4)} °C, IPC-2221 ${s.layer}`,
      x: { label: 'Drill diameter d', unit: 'm', log: true },
      y: [{ id: 'i', label: 'I_max', unit: 'A', log: true }],
      legend: 'below',
      series,
      vlines: [{ value: s.d, label: `d = ${fLen(s.d)}` }, ...(dMin >= dLo && dMin <= dHi ? [{ value: dMin, label: `AR ${+s.arMax.toPrecision(4)}:1`, color: '#8b1e1e', dash: [5, 4] }] : [])],
      markers: [{ x: s.d, y: iCap, label: si(iCap, 'A', 3) }],
    },
    {
      id: 'z-vs-da',
      title: 'Via impedance vs antipad',
      subtitle: `d = ${fLen(s.d)}, εr = ${+s.er.toPrecision(4)}`,
      x: { label: 'Antipad diameter D_ap', unit: 'm' },
      y: [{ id: 'z', label: 'Z_via', unit: 'Ω' }],
      series: [{ label: 'Z_via (coaxial)', x: Das, y: Das.map((D) => zcoax(s.d, D, s.er)), width: 2.2 }],
      vlines: [{ value: s.Da, label: `D_ap = ${fLen(s.Da)}` }, { value: s.pad, label: 'D_pad', dash: [2, 3] }],
      markers: [{ x: s.Da, y: z, label: si(z, 'Ω', 3) }],
    },
  ];
}

export const def: CalcDef<ViaState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Plated barrel A = π·t·(d − t); DC resistance ρ(T)·h/A (IEC 60028 copper); thermal resistance h/(k·A) (1-D conduction, Shen et al., IEEE TPEL 2020); current capacity from the IPC-2221A Fig. 6-4 fit with the barrel as a conductor of equal area; coaxial barrel impedance (Pozar Table 2.1); Johnson & Graham (High-Speed Digital Design §7) pad capacitance and Rosa/Grover partial inductance. Drill, plating and antipad solved by Brent root finding on the same forward equations.',
  fields,
  defaults,
  solve: {
    default: 'iMax',
    analysis: 'iMax',
    options: [
      { key: 'iMax', label: 'Current, impedance and AR from the via (analysis)' },
      { key: 'd', label: 'Drill diameter d for a target current' },
      { key: 't', label: 'Plating thickness t for a target current' },
      { key: 'Da', label: 'Antipad D_ap for a target impedance' },
    ],
  },
  compute,
  sync: (s) => {
    const er = MATERIALS[s.material];
    if (er != null && Math.abs(er - s.er) > 1e-9) s.material = 'Custom';
    const ar = AR_PRESETS[s.fab];
    if (ar != null && Math.abs(ar - s.arMax) > 1e-9) s.fab = 'Custom';
  },
  examples: [
    { id: 'default', label: '0.3 mm via in 1.6 mm FR-4 (analysis)', state: defaults() },
    { id: 'power', label: 'Power via: drill for 3 A at 10 °C rise', state: { ...defaults(), solveFor: 'd', iMax: 3, t: 25e-6, pad: 1.6e-3, Da: 2.2e-3, mask: 'open' } },
    { id: 'rf50', label: '50 Ω RF via on 1.524 mm RO4350B: antipad', state: { ...defaults(), solveFor: 'Da', z: 50, d: 0.3e-3, pad: 0.6e-3, h: 1.524e-3, material: 'RO4350B', er: 3.66, mask: 'open' } },
    { id: 'backplane', label: '0.25 mm drill in a 3.2 mm backplane: AR too high', state: { ...defaults(), d: 0.25e-3, pad: 0.55e-3, Da: 0.95e-3, h: 3.2e-3, fab: 'Advanced (10:1)', arMax: 10 } },
    { id: 'thin-plating', label: 'Plating for 1 A in a 0.2 mm via, 0.8 mm board', state: { ...defaults(), solveFor: 't', iMax: 1, d: 0.2e-3, pad: 0.45e-3, Da: 0.8e-3, h: 0.8e-3 } },
  ],
};
