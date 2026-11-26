/** Microvia current capacity — calculator definition (inputs, solve-for, report). DOM-free. */

import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, U_ROUGH, U_THICK } from '@/core/unitsets';
import { type Layer, MIL2, ipcCurrent, ipcRise, mvArea, mvCapacity, mvMinDiameter, mvPhysics } from './model';

export const ID = 'pcb/microvia-current-capacity';

export type MvSolve = 'iMax' | 'n' | 'd' | 'dT';
export const N_MAX = 1000;
export const D_MIN = 25e-6;
export const D_MAX = 0.5e-3;
/** IPC-6012 blind/buried microvia plating, Class 2 (as reproduced by fabricators; check Class 3 in your copy). */
export const PLATING = { avg: 12e-6, min: 10e-6 };
/** Rule of thumb for DC current density in plated copper (electromigration, voids): not an IPC limit. */
export const J_WARN = 100e6;

export interface MvState {
  solveFor: MvSolve;
  /** IPC-2221 guardrail capacity of the array (A): always computed */
  iMax: number;
  i: number;
  dT: number;
  n: number;
  d: number;
  dUnit: string;
  t: number;
  tUnit: string;
  h: number;
  hUnit: string;
  fill: 'ring' | 'cu';
  padCap: number;
  padCapUnit: string;
  padTgt: number;
  padTgtUnit: string;
  viaLayer: Layer;
  w: number;
  wUnit: string;
  tCu: number;
  tCuUnit: string;
  traceLayer: Layer;
  ta: number;
}

export const defaults = (): MvState => ({
  solveFor: 'iMax',
  iMax: 0.193,
  i: 0.15,
  dT: 10,
  n: 1,
  d: 100e-6,
  dUnit: 'µm',
  t: 10e-6,
  tUnit: 'µm',
  h: 75e-6,
  hUnit: 'µm',
  fill: 'ring',
  padCap: 250e-6,
  padCapUnit: 'µm',
  padTgt: 300e-6,
  padTgtUnit: 'µm',
  viaLayer: 'internal',
  w: 100e-6,
  wUnit: 'µm',
  tCu: 35e-6,
  tCuUnit: 'µm',
  traceLayer: 'external',
  ta: 25,
});

const LAYERS = [
  { value: 'internal', label: 'Internal k = 0.024 (conservative)' },
  { value: 'external', label: 'External k = 0.048' },
];

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Current',
    note: 'Click ◎ on N or D to size the vias for I, or on ΔT for the rise at I.',
    fields: [
      { kind: 'number', key: 'iMax', symbol: 'I_max', label: 'Guardrail capacity', unit: 'A', output: true, min: 0, max: 1e6, help: 'IPC-2221 conductor fit applied to the combined plated area of the N vias at ΔT. A convention for plating and current density, not a temperature prediction: IPC has no via chart.' },
      { kind: 'number', key: 'i', symbol: 'I', label: 'Design current', unit: 'A', min: 1e-4, max: 100, help: 'Current through the via array. The target when solving for N, D or ΔT.' },
      { kind: 'number', key: 'dT', symbol: 'ΔT', label: 'Allowed rise', suffix: '°C', min: 1e-3, max: 1000, solvable: true, help: 'Temperature rise allowed on the IPC-2221 fit (the charts span 10–100 °C). Solving gives the rise at the design current.' },
    ],
  },
  {
    kind: 'section',
    title: 'Microvia',
    fields: [
      { kind: 'number', key: 'n', symbol: 'N', label: 'Microvias in parallel', min: 1, max: N_MAX, integer: true, solvable: true, help: 'Identical microvias sharing the current (a via-in-pad array or stitching). Solving gives the smallest whole number for I.' },
      { kind: 'number', key: 'd', symbol: 'D', label: 'Diameter (target end)', units: U_LEN_PCB, unitKey: 'dUnit', min: D_MIN, max: D_MAX, solvable: true, help: 'Laser-drilled diameter at its narrowest, the target-pad end of the tapered hole: the cross-section that limits the current.' },
      { kind: 'number', key: 't', symbol: 't_min', label: 'Plating (minimum)', units: U_ROUGH, unitKey: 'tUnit', min: 1e-6, max: 100e-6, visible: (_s, r) => r.fill !== 'cu', help: 'Design with the minimum wall plating, not the nominal. IPC-6012 blind/buried microvias, Class 2: 12 µm average, 10 µm minimum (thin areas).' },
      { kind: 'number', key: 'h', symbol: 'h', label: 'Depth (dielectric)', units: U_LEN_PCB, unitKey: 'hUnit', min: 10e-6, max: 1e-3, help: 'Capture pad to target pad: the dielectric thickness one microvia spans. IPC-T-50 microvias are at most 0.25 mm deep with aspect ratio ≤ 1:1.' },
      { kind: 'select', key: 'fill', label: 'Construction', options: [{ value: 'ring', label: 'Conformal plating (ring)' }, { value: 'cu', label: 'Copper filled (plug)' }], help: 'Copper-filled microvias (common when stacked) conduct through the whole hole, π·D²/4.' },
      { kind: 'number', key: 'padCap', symbol: 'D_cap', label: 'Capture pad', units: U_LEN_PCB, unitKey: 'padCapUnit', min: 30e-6, max: 2e-3, help: 'Land on the layer the laser enters. Drawing and pad check only: pads add no current area.' },
      { kind: 'number', key: 'padTgt', symbol: 'D_tgt', label: 'Target pad', units: U_LEN_PCB, unitKey: 'padTgtUnit', min: 30e-6, max: 2e-3, help: 'Land the laser stops on, one layer down.' },
      { kind: 'select', key: 'viaLayer', label: 'Guardrail curve', options: LAYERS, help: 'Which IPC-2221 curve sizes the barrel. The barrel sits inside the dielectric, so the internal curve is the cautious default; both are shown in the results.' },
    ],
  },
  {
    kind: 'section',
    title: 'Feeding trace',
    note: 'The trace into the via usually runs hotter than the via.',
    fields: [
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', min: 10e-6, max: 20e-3, help: 'Width of the trace that carries the current to the capture pad.' },
      { kind: 'number', key: 'tCu', symbol: 'T', label: 'Trace copper', units: U_THICK, unitKey: 'tCuUnit', min: 5e-6, max: 210e-6, help: 'Finished copper thickness of that trace (35 µm = 1 oz).' },
      { kind: 'select', key: 'traceLayer', label: 'Trace layer', options: [{ value: 'external', label: 'External (k = 0.048)' }, { value: 'internal', label: 'Internal (k = 0.024)' }] },
      { kind: 'number', key: 'ta', symbol: 'T_a', label: 'Ambient', suffix: '°C', min: -60, max: 150, help: 'Board temperature: sets the copper resistivity (at T_a + ΔT).' },
    ],
  },
];

const fL = (m: number) => si(m, 'm', 4);
const fA = (a: number) => si(a, 'A', 4);
const fDT = (x: number) => `${x.toPrecision(3)} °C`;

function num(name: string, v: unknown, positive = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (positive && !(v > 0)) throw new Error(`${name} must be > 0.`);
  return v;
}

export function compute(st: MvState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness (§12.3) triage:
 *  • "roundtrip" mediums: the design current I is the designer’s spec, not the capacity, so solving for N, D or ΔT from
 *    an analysis state moves them until the capacity equals I; N is whole and D is floored at h (AR ≤ 1:1), so those
 *    capacities can be ≥ I.
 *  • "error-after-edit" mediums: typed plating of half the diameter or more. Pads smaller than the hole and currents no
 *    N, D or ΔT in range reaches are red warnings with the closest answer, so settings and ◎ never end in an error.
 *  • low "unreadable": a D shown in inches reads 0.00098 in (that unit has no smaller prefix).
 */
function run(st: MvState): CalcReport {
  const s: MvState = { ...st };
  const k = s.solveFor;
  if (!['iMax', 'n', 'd', 'dT'].includes(k)) throw new Error('solveFor must be iMax, n, d or dT.');
  for (const [nm, l] of [['Guardrail curve', s.viaLayer], ['Trace layer', s.traceLayer]] as const) if (l !== 'internal' && l !== 'external') throw new Error(`${nm} must be internal or external.`);
  if (s.fill !== 'ring' && s.fill !== 'cu') throw new Error('Construction must be ring or cu.');
  const filled = s.fill === 'cu';
  num('Design current', s.i);
  if (k !== 'dT') num('Allowed rise', s.dT);
  if (k !== 'n') s.n = Math.max(1, Math.round(num('Number of vias', s.n)));
  if (k !== 'd') num('Diameter', s.d);
  if (!filled) num('Plating', s.t);
  num('Depth', s.h);
  num('Capture pad', s.padCap);
  num('Target pad', s.padTgt);
  num('Trace width', s.w);
  num('Trace copper', s.tCu);
  num('Ambient', s.ta, false);

  // A design current no N, D or ΔT in range meets is shown as the closest the range gets, in red, with the reason
  // (a ◎ click from a working page must not end in a red error, §5a).
  let shortfall: string | null = null;
  let solvedNote: string | null = null;
  if (k === 'n') {
    // smallest whole N whose combined area meets I on the guardrail (capacity grows as N^0.725)
    let n = 0;
    for (let c = 1; c <= N_MAX; c++) {
      if (mvCapacity(c, s.d, s.t, filled, s.dT, s.viaLayer) >= s.i * (1 - 1e-12)) {
        n = c;
        break;
      }
    }
    if (!n) {
      n = N_MAX;
      shortfall = `Even ${N_MAX} microvias of ${fL(s.d)} carry only ${fA(mvCapacity(N_MAX, s.d, s.t, filled, s.dT, s.viaLayer))} at ΔT = ${+s.dT.toPrecision(4)} °C on the guardrail, below ${fA(s.i)}. Use larger or copper-filled vias, allow a larger rise, or use a through via.`;
    }
    s.n = n;
  } else if (k === 'd') {
    const d = mvMinDiameter(s.i, s.n, s.t, filled, s.dT, s.viaLayer);
    if (!(d <= D_MAX)) {
      s.d = D_MAX;
      shortfall = `${fA(s.i)} through ${s.n} microvia${s.n > 1 ? 's' : ''} needs D = ${fL(d)} on the guardrail, beyond the ${fL(D_MAX)} of a laser microvia; the largest is shown. Add vias, fill them with copper, or allow a larger rise.`;
    } else if (s.h > d && s.h >= D_MIN) {
      // the current needs less, but a microvia may not be deeper than it is wide (aspect ratio ≤ 1:1)
      s.d = Math.min(s.h, D_MAX);
      solvedNote = `D is set by the 1:1 aspect-ratio limit (D ≥ h = ${fL(s.h)}); the current alone needs only ${fL(Math.max(d, D_MIN))}`;
    } else s.d = Math.max(d, D_MIN);
  } else if (k === 'dT') {
    const dT = ipcRise(s.i, s.n * mvArea(s.d, s.t, filled), s.viaLayer);
    if (dT < 1e-3) {
      s.dT = 1e-3;
      solvedNote = `the rise at ${fA(s.i)} is below 0.001 °C: the vias are far larger than this current needs`;
    } else if (dT > 1000) {
      s.dT = 1000;
      shortfall = `The guardrail rise at ${fA(s.i)} is ${fDT(dT)}, beyond 1000 °C: the vias are far too small for this current. Add vias or use larger ones.`;
    } else s.dT = dT;
  }
  if (!filled && !(s.d > 2 * s.t)) {
    if (k === 'd') s.d = 2 * s.t * (1 + 1e-6);
    else throw new Error(`Plating ${fL(s.t)} closes a ${fL(s.d)} hole: the wall plating must be thinner than half the diameter (or choose copper filled).`);
  }
  // pads no larger than the hole: a red warning, not an error. The pads do not enter the current model, and a solved
  // diameter can outgrow them; the designer enlarges them (and no later switch then turns that state into an error).
  const padSmall = !(s.padCap > s.d) || !(s.padTgt > s.d);
  const padWarn = !padSmall ? null : (`The capture (${fL(s.padCap)}) and target (${fL(s.padTgt)}) pads must be larger than the ${fL(s.d)} hole: enlarge them to at least D plus twice the annular ring your fabricator needs.`);

  const iMax = mvCapacity(s.n, s.d, s.t, filled, s.dT, s.viaLayer);
  s.iMax = iMax;
  return report(s, iMax, shortfall, solvedNote, padWarn);
}

function report(s: MvState, iMax: number, shortfall: string | null, solvedNote: string | null, padWarn: string | null): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const filled = s.fill === 'cu';
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const A = mvArea(s.d, s.t, filled);
  const aTr = s.w * s.tCu;
  const ph = mvPhysics(s.i, s.n, s.d, s.t, s.h, filled, s.ta + s.dT);
  const iInt = mvCapacity(s.n, s.d, s.t, filled, s.dT, 'internal');
  const iExt = mvCapacity(s.n, s.d, s.t, filled, s.dT, 'external');
  const iTrace = ipcCurrent(aTr, s.dT, s.traceLayer);
  const dTvia = ipcRise(s.i, s.n * A, s.viaLayer);
  const dTtrace = ipcRise(s.i, aTr, s.traceLayer);
  const traceLimits = iTrace < iMax;
  const ar = s.h / s.d;
  const okAr = ar <= 1 + 1e-12;
  const plural = s.n > 1 ? 's' : '';

  const prim: ResultItem[] = [];
  if (k === 'n') prim.push(item('n', 'Microvias needed', s.n, '', `${s.n}`, { symbol: 'N', primary: true, solved: true, tone: shortfall ? 'fail' : '', note: shortfall ? 'closest in range' : `smallest N for ${fA(s.i)}` }));
  if (k === 'd') prim.push(item('d', 'Minimum diameter', s.d, 'm', fL(s.d), { symbol: 'D', primary: true, solved: true, tone: shortfall ? 'fail' : '', note: `${(s.d / 25.4e-6).toFixed(2)} mil · ${shortfall ? 'closest in range' : solvedNote ? 'set by AR ≤ 1:1' : `for ${fA(s.i)}`}` }));
  if (k === 'dT') prim.push(item('dT', 'Guardrail rise at I', s.dT, '°C', fDT(s.dT), { symbol: 'ΔT', primary: true, solved: true, tone: shortfall ? 'fail' : '', note: shortfall || (k === 'dT' && solvedNote) ? 'clamped to the field range' : `${s.n} via${plural}, ${s.viaLayer} curve` }));
  prim.push(item('iMax', 'Guardrail capacity', iMax, 'A', fA(iMax), { symbol: 'I_max', primary: true, solved: true, tone: s.i > iMax * (1 + 1e-9) ? 'fail' : '', note: `${s.n} via${plural} at ΔT ${+s.dT.toPrecision(4)} °C, IPC-2221 ${s.viaLayer}` }));
  prim.push(item('iTrace', 'Feeding trace capacity', iTrace, 'A', fA(iTrace), { symbol: 'I_trace', primary: true, tone: s.i > iTrace * (1 + 1e-9) ? 'fail' : traceLimits ? 'warn' : '', note: traceLimits ? 'limits first' : `trace rise ${fDT(dTtrace)} at I` }));
  prim.push(item('j', 'Current density', ph.j, 'A/m²', `${(ph.j * 1e-6).toPrecision(3)} A/mm²`, { symbol: 'J', primary: true, tone: ph.j > J_WARN ? 'warn' : '', note: 'rule of thumb ≤ 100 A/mm²' }));
  prim.push(item('ar', 'Aspect ratio', ar, '', `${ar.toFixed(2)} : 1`, { symbol: 'AR', primary: true, tone: ar > 1 + 1e-12 ? 'fail' : ar > 0.75 + 1e-12 ? 'warn' : 'pass', note: 'depth : diameter, ≤ 1 (≤ 0.75 preferred)' }));

  const sec: ResultItem[] = [
    item('area', 'Copper area per via', A, 'm²', `${(A * 1e6).toPrecision(4)} mm² (${(A / MIL2).toPrecision(4)} mil²)`, { symbol: 'A', group: 'Guardrail (IPC-2221 convention)', note: filled ? 'π·D²/4' : 'π·t·(D − t)' }),
    item('iInt', 'Capacity, internal curve', iInt, 'A', fA(iInt), { symbol: 'I_int', group: 'Guardrail (IPC-2221 convention)', note: 'k = 0.024' }),
    item('iExt', 'Capacity, external curve', iExt, 'A', fA(iExt), { symbol: 'I_ext', group: 'Guardrail (IPC-2221 convention)', note: 'k = 0.048' }),
    item('iOne', 'One via alone', mvCapacity(1, s.d, s.t, filled, s.dT, s.viaLayer), 'A', fA(mvCapacity(1, s.d, s.t, filled, s.dT, s.viaLayer)), { symbol: 'I_1', group: 'Guardrail (IPC-2221 convention)', note: `array = N^0.725 × this` }),
    item('dTvia', 'Guardrail rise at I', dTvia, '°C', fDT(dTvia), { symbol: 'ΔT_via', group: 'Guardrail (IPC-2221 convention)' }),
    item('dTtrace', 'Trace rise at I', dTtrace, '°C', fDT(dTtrace), { symbol: 'ΔT_trace', group: 'Feeding trace', note: `${fL(s.w)} × ${si(s.tCu, 'm', 3)}, IPC-2221 ${s.traceLayer}` }),
    item('limit', 'Limits first', null, '', traceLimits ? 'feeding trace' : 'microvia barrel', { group: 'Feeding trace', note: `trace ${fA(iTrace)} vs vias ${fA(iMax)} at ΔT ${+s.dT.toPrecision(4)} °C` }),
    item('r', 'Resistance (all vias)', ph.r, 'Ω', si(ph.r, 'Ω', 4), { symbol: 'R', group: 'At the design current', note: `ρ at ${(s.ta + s.dT).toFixed(0)} °C` }),
    item('v', 'Voltage drop', ph.v, 'V', si(ph.v, 'V', 4), { symbol: 'V', group: 'At the design current' }),
    item('p', 'Power in the vias', ph.p, 'W', si(ph.p, 'W', 4), { symbol: 'P', group: 'At the design current' }),
    item('dTcond', 'Barrel conduction rise', ph.dTcond, '°C', fDT(ph.dTcond), { symbol: 'ΔT_b', group: 'At the design current', note: 'P·θ/8, pads held at ambient' }),
    item('theta', 'Thermal resistance per via', ph.theta, 'K/W', `${ph.theta.toPrecision(4)} K/W`, { symbol: 'θ', group: 'At the design current', note: 'h/(k_Cu·A)' }),
  ];
  rep.results = [...prim, ...sec];
  // status names the worst problem: fails (cannot be built or over capacity), then warnings, else OK
  const fails = [shortfall ? 'not met in range' : '', s.i > iMax * (1 + 1e-9) ? 'over via capacity' : '', s.i > iTrace * (1 + 1e-9) ? 'trace over capacity' : '', !okAr ? `AR ${ar.toFixed(2)} > 1` : '', padWarn ? 'pads smaller than hole' : ''].filter(Boolean);
  const warns = [!filled && s.t < PLATING.min * (1 - 1e-9) ? 'thin plating' : '', ph.j > J_WARN ? 'J > 100 A/mm²' : '', s.h > 0.25e-3 + 1e-12 ? 'not a microvia (h > 0.25 mm)' : ''].filter(Boolean);
  rep.status = fails.length ? { text: fails.join(', '), tone: 'fail' } : warns.length ? { text: warns.join(', '), tone: 'warn' } : { text: `${fA(s.i)} OK`, tone: 'pass' };

  if (shortfall) rep.warnings.push(shortfall);
  if (padWarn) rep.warnings.push(padWarn);
  if (solvedNote) rep.notes.push(`${k === 'dT' ? 'ΔT' : 'D'}: ${solvedNote}.`);
  if (!shortfall && s.i > iMax * (1 + 1e-9)) rep.warnings.push(`${fA(s.i)} exceeds the guardrail capacity of ${s.n} microvia${plural} (${fA(iMax)}). Add microvias, use copper-filled ones, or allow a larger rise.`);
  // (not when ΔT was clamped at the field limit: that rise is not a real result)
  if (s.i > iTrace * (1 + 1e-9) && !(k === 'dT' && shortfall)) rep.warnings.push(`The ${fL(s.w)} feeding trace carries only ${fA(iTrace)} at ΔT ${+s.dT.toPrecision(4)} °C: widen it, it limits before the microvias.`);
  if (ar > 1 + 1e-12) rep.warnings.push(`Aspect ratio ${ar.toFixed(2)}:1 exceeds the 1:1 microvia limit (IPC-T-50 / IPC-2226): plating will not reach the bottom of the hole. Use a wider hole or a thinner dielectric, or stack two microvias.`);
  else if (ar > 0.75 + 1e-12) rep.notes.push(`Aspect ratio ${ar.toFixed(2)}:1 is within 1:1 but above the 0.75:1 most fabricators prefer for reliable fill and plating.`);
  if (s.h > 0.25e-3 + 1e-12) rep.warnings.push(`Depth ${fL(s.h)} exceeds 0.25 mm: by the IPC-T-50 definition this is a blind via, not a microvia. Treat it on the Via calculator page.`);
  if (!filled && s.t < PLATING.min * (1 - 1e-9)) rep.warnings.push(`Plating ${si(s.t, 'm', 3)} is below the IPC-6012 microvia minimum of 10 µm (Class 2 thin areas). Specify more plating or copper fill.`);
  if (ph.j > J_WARN) rep.warnings.push(`Current density ${(ph.j * 1e-6).toPrecision(3)} A/mm² is above the ~100 A/mm² rule of thumb for plated copper (electromigration, voids, hot spots at thin plating). Add vias or fill them.`);
  const out: string[] = [];
  if (s.dT < 10 || s.dT > 100) out.push(`ΔT ${+s.dT.toPrecision(4)} °C (charts: 10–100 °C)`);
  const chartMax = s.viaLayer === 'internal' ? 17.5 : 35;
  if (iMax > chartMax) out.push(`I above the ${chartMax} A ${s.viaLayer} chart`);
  if (out.length) rep.notes.push(`The IPC-2221 fit is used outside its chart range: ${out.join('; ')}.`);
  rep.notes.push(
    'The guardrail capacity is a convention: IPC-2221 has no via chart, and a microvia this short is cooled by its pads. Treat it as a limit on plating and current density, not as a temperature.',
    'Rating N vias by their combined area gives N^0.725 times one via: conservative, since vias side by side heat each other less than one conductor of the same area.',
  );
  rep.summary = `${s.n} × ${fL(s.d)} microvia${plural}, ${fL(s.h)} deep, ${filled ? 'copper filled' : `${si(s.t, 'm', 3)} plating`} · ${fA(iMax)} guardrail · trace ${fA(iTrace)} · at ${fA(s.i)}: J ${(ph.j * 1e-6).toPrecision(3)} A/mm²`;
  rep.details = { ...ph, iInt, iExt, iTrace, dTvia, dTtrace, ar };
  rep.graphs = graphs(s, iMax, iTrace);
  return rep;
}

function graphs(s: MvState, iMax: number, iTrace: number): GraphSpec[] {
  const filled = s.fill === 'cu';
  const nHi = Math.max(10, Math.min(N_MAX, 2 * s.n));
  const ns = Array.from({ length: nHi }, (_, i) => i + 1);
  return [
    {
      id: 'i-vs-n',
      title: 'Capacity vs microvia count',
      subtitle: `D = ${si(s.d, 'm', 3)}, ΔT = ${+s.dT.toPrecision(4)} °C`,
      x: { label: 'Microvias in parallel N', unit: '', integer: true },
      y: [{ id: 'i', label: 'Current', unit: 'A', includeZero: true }],
      legend: 'below',
      series: [
        { label: 'Guardrail, internal', x: ns, y: ns.map((n) => mvCapacity(n, s.d, s.t, filled, s.dT, 'internal')), color: '#1f4e5f', width: s.viaLayer === 'internal' ? 2.4 : 1.4 },
        { label: 'Guardrail, external', x: ns, y: ns.map((n) => mvCapacity(n, s.d, s.t, filled, s.dT, 'external')), color: '#4f8a8b', width: s.viaLayer === 'external' ? 2.4 : 1.4, dash: [5, 3] },
        { label: 'Feeding trace', x: ns, y: ns.map(() => iTrace), color: '#c47b17', width: 1.6, dash: [2, 3] },
      ],
      hlines: [{ value: s.i, label: `I = ${si(s.i, 'A', 3)}`, color: '#8b1e1e', dash: [6, 4] }],
      markers: [{ x: s.n, y: iMax, label: `N = ${s.n}` }],
    },
  ];
}

export const def: CalcDef<MvState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Plated ring A = π·t·(D − t) (or π·D²/4 copper filled) rated on the IPC-2221A Fig. 6-4 fit I = k·ΔT^0.44·A^0.725 (k = 0.024 internal / 0.048 external), N vias by their combined area, as a plating and current-density guardrail; DC resistance ρ(T)·h/A (IEC 60028); barrel conduction rise P·θ/8 (Incropera §3.5); feeding trace on the same IPC-2221 fit; IPC-T-50 / IPC-2226 aspect ratio ≤ 1:1 and depth ≤ 0.25 mm; IPC-6012 microvia plating (Class 2: 12 µm average, 10 µm minimum). N by scan, D and ΔT by closed-form inverses.',
  fields,
  defaults,
  solve: {
    default: 'iMax',
    analysis: 'iMax',
    options: [
      { key: 'iMax', label: 'Capacity of the microvias (analysis)' },
      { key: 'n', label: 'Microvias N for the design current' },
      { key: 'd', label: 'Minimum diameter D for the design current' },
      { key: 'dT', label: 'Guardrail rise ΔT at the design current' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '100 µm microvia, 10 µm minimum plating, 75 µm dielectric', state: defaults() },
    { id: 'one-via', label: '100 µm, 18 µm plating, 75 µm deep, 10 °C: capacity of one via', state: { ...defaults(), t: 18e-6 } },
    { id: 'array', label: 'Microvias for 1 A at 10 °C (18 µm plating)', state: { ...defaults(), solveFor: 'n', i: 1, t: 18e-6, padCap: 0.25e-3, w: 0.5e-3 } },
    { id: 'filled', label: 'Copper-filled via-in-pad: minimum diameter for 0.5 A', state: { ...defaults(), solveFor: 'd', i: 0.5, fill: 'cu', w: 0.3e-3 } },
    { id: 'thin-trace', label: '0.3 A through two microvias fed by a 75 µm trace: trace limits', state: { ...defaults(), i: 0.3, n: 2, w: 75e-6, tCu: 18e-6 } },
    { id: 'deep', label: '150 µm deep in a 125 µm hole: aspect ratio too high', state: { ...defaults(), h: 150e-6, d: 125e-6, padCap: 300e-6, padTgt: 350e-6 } },
  ],
};
