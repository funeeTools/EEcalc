/** Via voltage drop — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, U_ROUGH, U_THICK } from '@/core/unitsets';
import { MIL2, ipcRise } from '@/calculators/trace-width-current/model';
import { type DropInput, type DropResult, type ViaFill, runawayCurrent, viaDrop } from './model';

export const ID = 'pcb/via-voltage-drop';

export type DropSolve = 'v' | 'n' | 'i' | 'd' | 't';
export const N_MAX = 1000;
/** IPC-6012 minimum average hole-wall copper: Class 1–2 20 µm, Class 3 25 µm. */
const PLATING_MIN = { class2: 20e-6, class3: 25e-6 };

export interface DropState {
  solveFor: DropSolve;
  /** Voltage drop (V): computed, or the limit when solving for N, I, d or t */
  v: number;
  i: number;
  n: number;
  d: number;
  dUnit: string;
  t: number;
  tUnit: string;
  h: number;
  hUnit: string;
  fill: ViaFill;
  pads: boolean;
  pad: number;
  padUnit: string;
  tPad: number;
  tPadUnit: string;
  tOp: number;
  heat: 'self' | 'fixed';
  kCu: number;
}

export const defaults = (): DropState => ({
  solveFor: 'v',
  v: 0.7065e-3,
  i: 2,
  n: 4,
  d: 0.3e-3,
  dUnit: 'mm',
  t: 25e-6,
  tUnit: 'µm',
  h: 1.6e-3,
  hUnit: 'mm',
  fill: 'none',
  pads: true,
  pad: 0.6e-3,
  padUnit: 'mm',
  tPad: 35e-6,
  tPadUnit: 'µm',
  tOp: 25,
  heat: 'self',
  kCu: 385,
});

const isTarget = (k: DropSolve) => k !== 'v';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Drop & current',
    note: 'Click ◎ on N, I, d or t to size the vias for a drop limit V.',
    fields: [
      { kind: 'number', key: 'v', symbol: 'V', label: 'Voltage drop', unit: 'V', min: 1e-9, max: 100, solvable: true, solvedWhen: (_s, r) => r.solveFor === 'v', onSolve: (_s, r) => (r.solveFor = 'v'), onUnsolve: (_s, r) => (r.solveFor = 'n'), help: 'Drop across the via array, pad to pad. Becomes the limit when you solve for the via count, the current, the drill or the plating.' },
      { kind: 'number', key: 'i', symbol: 'I', label: 'Total current', unit: 'A', min: 1e-4, max: 1000, solvable: true, help: 'Current shared by all the vias. Solving gives the most current that keeps the drop at or below V.' },
      { kind: 'number', key: 'n', symbol: 'N', label: 'Vias in parallel', min: 1, max: N_MAX, integer: true, solvable: true, help: 'Identical vias side by side, each carrying I/N. Solving gives the smallest whole number that meets the drop limit.' },
    ],
  },
  {
    kind: 'section',
    title: 'Via',
    fields: [
      { kind: 'number', key: 'd', symbol: 'd', label: 'Drill diameter', units: U_LEN_PCB, unitKey: 'dUnit', min: 50e-6, max: 6e-3, solvable: true, help: 'Drilled hole: the outside of the plating.' },
      { kind: 'number', key: 't', symbol: 't', label: 'Plating thickness', units: U_ROUGH, unitKey: 'tUnit', min: 1e-6, max: 150e-6, solvable: true, visible: (_s, r) => r.fill !== 'cu', help: 'Copper on the hole wall. IPC-6012 minimum average: 20 µm (Class 1 and 2), 25 µm (Class 3).' },
      { kind: 'number', key: 'h', symbol: 'h', label: 'Via length', units: U_LEN_PCB, unitKey: 'hUnit', min: 25e-6, max: 10e-3, help: 'Length of barrel the current flows through: the board thickness for a through via, the layer span for a blind or buried one.' },
      {
        kind: 'select',
        key: 'fill',
        label: 'Hole fill',
        options: [
          { value: 'none', label: 'Open (plated only)' },
          { value: 'resin', label: 'Resin plugged (non-conductive)' },
          { value: 'cu', label: 'Copper filled (solid)' },
        ],
        // the plating stops mattering in a solid copper via, so its unknown moves back to the analysis; back to an open
        // or plugged hole, a plating that was hidden (and may now fill the drill) is reset to a buildable 25 µm or d/4
        apply: (v, _s, r) => {
          if (v === 'cu' && r.solveFor === 't') r.solveFor = 'v';
          if (v !== 'cu' && !(r.t < r.d / 2)) r.t = Math.min(25e-6, r.d / 4);
        },
        help: 'A resin plug carries no current. A copper-filled (electroplated solid) via conducts through its whole drill area.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Pads',
    fields: [
      // switching the pads on with a pad no larger than the drill (possible while they were off) widens it to 2·d
      { kind: 'toggle', key: 'pads', label: 'Pad spreading', on: 'Include (top + bottom)', off: 'Barrel only', apply: (v, _s, r) => { if (v && !(r.pad > r.d)) r.pad = Math.min(20e-3, 2 * r.d); }, help: 'Adds the radial resistance of the pad at each end, from the drill edge out to the pad edge where the pour or plane takes over.' },
      { kind: 'number', key: 'pad', symbol: 'D_pad', label: 'Pad diameter', units: U_LEN_PCB, unitKey: 'padUnit', min: 0.1e-3, max: 20e-3, help: 'Land around the hole on the layers the current enters and leaves.' },
      { kind: 'number', key: 'tPad', symbol: 't_pad', label: 'Pad copper', units: U_THICK, unitKey: 'tPadUnit', min: 5e-6, max: 210e-6, visible: (_s, r) => !!r.pads, help: 'Copper thickness of the pads: base foil plus plating on outer layers (35 µm = 1 oz).' },
    ],
  },
  {
    kind: 'section',
    title: 'Temperature',
    fields: [
      { kind: 'number', key: 'tOp', symbol: 'T_op', label: 'Board temperature', suffix: '°C', min: -60, max: 200, help: 'Temperature of the board and the pads at each end of the via. Copper resistivity rises 0.393 %/K above 20 °C.' },
      { kind: 'select', key: 'heat', label: 'Barrel temperature', options: [{ value: 'self', label: 'T_op + self-heating' }, { value: 'fixed', label: 'T_op only' }], help: 'Self-heating evaluates the barrel at its mean temperature: T_op plus the rise from its own I²R, conducted out to both pads.' },
      { kind: 'number', key: 'kCu', symbol: 'k_Cu', label: 'Copper conductivity', suffix: 'W/m·K', min: 50, max: 420, help: 'Thermal conductivity of the plated copper (pure copper ≈ 390–400 W/m·K, electroplated a little lower).' },
    ],
  },
];

const fLen = (m: number) => si(m, 'm', 4);
const fV = (v: number) => si(v, 'V', 4);
const fR = (r: number) => si(r, 'Ω', 4);

function num(name: string, v: unknown, positive = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (positive && !(v > 0)) throw new Error(`${name} must be > 0.`);
  return v;
}

function fail(msg: string, s: DropState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

export const input = (s: DropState): DropInput => ({ i: s.i, n: s.n, d: s.d, t: s.t, h: s.h, fill: s.fill, pads: s.pads, pad: s.pad, tPad: s.tPad, tOp: s.tOp, selfHeat: s.heat === 'self', kCu: s.kCu });

/** Drop for the state with one value replaced; a runaway barrel counts as an enormous drop (keeps the solves monotonic). */
const dropWith = (s: DropState, p: Partial<DropInput>) => {
  const r = viaDrop({ ...input(s), ...p });
  return r.runaway ? 1e30 : r.v;
};

/** Root of log V(x) = log target on [lo, hi] for a monotonic V; null when the target is outside the range there. */
function solveLog(g: (x: number) => number, target: number, lo: number, hi: number): number | null {
  const f = (x: number) => Math.log(g(x)) - Math.log(target);
  const a = f(lo);
  const b = f(hi);
  if (!(Number.isFinite(a) && Number.isFinite(b)) || a * b > 0) return null;
  if (a === 0) return lo;
  if (b === 0) return hi;
  return brent(f, lo, hi, 1e-15 * hi);
}

export function compute(st: DropState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness (§12.3) triage:
 *  • Solving for N gives a whole number: the drop achieved is at or just below the limit, so a later analysis or a
 *    solve for d / t / I from that state returns the achieved drop, not the limit ("roundtrip" medium). That is the
 *    rounding, not a bug.
 *  • A loose limit that every value meets returns the cheapest end of the range (smallest drill, thinnest plating,
 *    largest current); from there a solve for N gives the smallest count that meets the limit (e.g. 1 instead of 2).
 *    The drop is a ≤ limit, so that "roundtrip" medium is the intended answer.
 *  • "error-after-edit" mediums are typed numbers that make the via impossible (plating ≥ half the drill, a pad no
 *    larger than the drill) or a limit no drill, plating, current or count in range reaches; each message says what
 *    limits the answer (§5a), and currents above the self-heating runaway current, which say so. Setting switches
 *    (fill, pads, barrel temperature, ◎, examples) never error.
 */
function run(st: DropState): CalcReport {
  const s: DropState = { ...st };
  const k = s.solveFor;
  if (!['v', 'n', 'i', 'd', 't'].includes(k)) throw new Error('solveFor must be v, n, i, d or t.');
  if (!['none', 'resin', 'cu'].includes(s.fill)) throw new Error('Fill must be none, resin or cu.');
  if (s.heat !== 'self' && s.heat !== 'fixed') throw new Error('Barrel temperature must be self or fixed.');
  if (k !== 'i') num('Current', s.i);
  if (k !== 'n') {
    num('Number of vias', s.n);
    s.n = Math.max(1, Math.round(s.n));
  }
  if (k !== 'd') num('Drill diameter', s.d);
  if (k !== 't' && s.fill !== 'cu') num('Plating thickness', s.t);
  num('Via length', s.h);
  num('Pad diameter', s.pad);
  if (s.pads) num('Pad copper thickness', s.tPad);
  num('Board temperature', s.tOp, false);
  if (s.tOp < -200) throw new Error('Board temperature must be above −200 °C.');
  num('Copper conductivity', s.kCu);
  if (isTarget(k)) num('Voltage drop limit', s.v);
  const self = s.heat === 'self';
  const plated = s.fill !== 'cu';

  // ── solve for the unknown on the forward equations. The drop is a limit (V ≤ limit): when every value in range
  // meets it, the end of the range that is cheapest (smallest drill or plating, largest current) is returned with a note.
  let solvedNote: string | null = null;
  if (k === 'n') {
    // smallest whole N whose drop is at or below the limit (the drop falls with every via added)
    let n = 0;
    for (let c = 1; c <= N_MAX; c++) {
      if (dropWith(s, { n: c }) <= s.v * (1 + 1e-9)) {
        n = c;
        break;
      }
    }
    if (!n) return fail(`Even ${N_MAX} vias drop ${fV(dropWith(s, { n: N_MAX }))} at ${si(s.i, 'A', 4)}, above the ${fV(s.v)} limit. Use a larger drill, thicker plating, copper fill, or a shorter path.`, s);
    s.n = n;
  } else if (k === 'i') {
    const hi = Math.min(1000, runawayCurrent(input(s)) * (1 - 1e-9));
    const lo = 1e-4;
    let r = hi > lo ? solveLog((i) => dropWith(s, { i }), s.v, lo, hi) : null;
    if (r == null && hi > lo && dropWith(s, { i: hi }) <= s.v) {
      r = hi;
      solvedNote = hi < 1000 ? 'the limit is met right up to thermal runaway' : 'every current up to 1 kA meets the limit';
    }
    if (r == null) return fail(`No current between 0.1 mA and ${si(hi, 'A', 3)} gives a drop of ${fV(s.v)} through ${s.n} × ${fLen(s.d)} via${s.n > 1 ? 's' : ''} (range ${fV(dropWith(s, { i: lo }))} … ${fV(dropWith(s, { i: hi }))}).`, s);
    s.i = r;
  } else if (k === 'd') {
    const lo = plated ? Math.max(2 * s.t * (1 + 1e-9), 50e-6) : 50e-6;
    const hi = 6e-3;
    if (!(hi > lo)) return fail(`Plating ${fLen(s.t)} leaves no drill size up to 6 mm with an open hole.`, s);
    let r = solveLog((d) => dropWith(s, { d }), s.v, lo, hi);
    if (r == null && dropWith(s, { d: lo }) <= s.v) {
      r = lo;
      solvedNote = 'every drill in range meets the limit: the smallest is shown';
    }
    if (r == null) return fail(`No drill between ${fLen(lo)} and 6 mm keeps the drop at ${fV(s.v)} with ${s.n} via${s.n > 1 ? 's' : ''} at ${si(s.i, 'A', 4)} (range ${fV(dropWith(s, { d: hi }))} … ${fV(dropWith(s, { d: lo }))}). Add vias, use thicker plating or copper fill, or allow a larger drop.`, s);
    s.d = r;
  } else if (k === 't') {
    if (!plated) return fail('The plating does not set the resistance of a copper-filled via: solve for the drill or the via count instead.', s);
    const hi = Math.min(150e-6, (s.d / 2) * (1 - 1e-9));
    const lo = 1e-6;
    if (!(hi > lo)) return fail(`A ${fLen(s.d)} drill leaves no room for plating.`, s);
    let r = solveLog((t) => dropWith(s, { t }), s.v, lo, hi);
    if (r == null && dropWith(s, { t: lo }) <= s.v) {
      r = lo;
      solvedNote = 'every plating in range meets the limit: the thinnest is shown';
    }
    if (r == null) return fail(`No plating between 1 µm and ${fLen(hi)} keeps the drop at ${fV(s.v)} with ${s.n} × ${fLen(s.d)} via${s.n > 1 ? 's' : ''} at ${si(s.i, 'A', 4)} (range ${fV(dropWith(s, { t: hi }))} … ${fV(dropWith(s, { t: lo }))}). Use a larger drill, copper fill or more vias.`, s);
    s.t = r;
  }

  // ── geometry checks (typed values the via cannot have)
  if (plated && !(s.d > 2 * s.t)) throw new Error(`Plating ${fLen(s.t)} fills a ${fLen(s.d)} drill: the plating must be thinner than half the drill (or choose a copper-filled via).`);
  if (s.pads && !(s.pad > s.d)) {
    if (k === 'd') return fail(`The drop limit needs a ${fLen(s.d)} drill, which does not fit the ${fLen(s.pad)} pad. Enlarge the pad, add vias or plate thicker.`, s);
    throw new Error(`Pad ${fLen(s.pad)} must be larger than the drill ${fLen(s.d)}.`);
  }

  const r = viaDrop(input(s));
  if (r.runaway) {
    const iRun = runawayCurrent(input(s));
    if (k === 'v') throw new Error(`${si(s.i, 'A', 4)} through ${s.n} × ${fLen(s.d)} via${s.n > 1 ? 's' : ''} has no steady state: the barrel heats faster than it conducts heat to the pads (runaway above ${si(iRun, 'A', 3)}). Add vias or use a larger drill.`);
    return fail(`No steady state: the barrel runs away thermally above ${si(iRun, 'A', 3)}.`, s);
  }
  if (k === 'v') {
    if (!(r.v >= 1e-9 && r.v <= 100)) return fail(`V = ${fV(r.v)} is outside the 1 nV – 100 V range of the field.`, s);
    s.v = r.v;
  }
  return report(s, r, self, solvedNote);
}

function report(s: DropState, r: DropResult, self: boolean, solvedNote: string | null = null): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const plural = s.n > 1 ? 's' : '';
  const ipcDT = ipcRise(r.iVia, r.area, 'external');
  const tMax = s.tOp + r.dTmax;
  const tIpc = s.tOp + ipcDT;
  const barrelHot = self && tMax > 105;
  const hot = tIpc > 105 || barrelHot;
  const forV = solvedNote ?? `for V = ${fV(s.v)}`;

  const prim: ResultItem[] = [];
  if (k === 'n') prim.push(item('n', 'Vias in parallel', s.n, '', `${s.n}`, { symbol: 'N', primary: true, solved: true, note: `smallest N for V ≤ ${fV(s.v)}` }));
  if (k === 'i') prim.push(item('i', 'Total current', s.i, 'A', si(s.i, 'A', 4), { symbol: 'I', primary: true, solved: true, note: forV }));
  if (k === 'd') prim.push(item('d', 'Drill diameter', s.d, 'm', fLen(s.d), { symbol: 'd', primary: true, solved: true, note: `${(s.d / 25.4e-6).toFixed(1)} mil · ${forV}` }));
  if (k === 't') prim.push(item('t', 'Plating thickness', s.t, 'm', si(s.t, 'm', 4), { symbol: 't', primary: true, solved: true, note: `${(s.t / 25.4e-6).toFixed(2)} mil · ${forV}` }));
  // the achieved drop: equal to the limit except when N is rounded up to a whole number
  if (k === 'v') prim.push(item('v', 'Voltage drop', r.v, 'V', fV(r.v), { symbol: 'V', primary: true, solved: true, note: `${si(s.i, 'A', 3)} through ${s.n} via${plural}` }));
  else prim.push(item('vAch', 'Voltage drop (achieved)', r.v, 'V', fV(r.v), { symbol: 'V', primary: true, note: `limit ${fV(s.v)}` }));
  prim.push(item('r', 'Total resistance', r.r, 'Ω', fR(r.r), { symbol: 'R', primary: true, note: `${s.n} via${plural} in parallel${s.pads ? ', with pads' : ''}` }));
  prim.push(item('p', 'Power dissipated', r.p, 'W', si(r.p, 'W', 4), { symbol: 'P', primary: true, note: 'I²·R, all vias' }));
  prim.push(item('ipcDT', 'Temperature rise (IPC-2221)', ipcDT, 'K', `${ipcDT.toPrecision(3)} °C`, { symbol: 'ΔT_IPC', primary: true, tone: hot ? 'fail' : '', note: 'via as a conductor of equal area: conservative' }));

  const sec: ResultItem[] = [
    item('iVia', 'Current per via', r.iVia, 'A', si(r.iVia, 'A', 4), { symbol: 'I/N', group: 'Per via' }),
    item('rVia', 'Resistance per via', r.rVia, 'Ω', fR(r.rVia), { symbol: 'R_via', group: 'Per via', note: s.pads ? 'barrel + 2 pads' : 'barrel only' }),
    item('rb', 'Barrel resistance', r.rb, 'Ω', fR(r.rb), { symbol: 'R_b', group: 'Per via', note: `ρ·h/A at ${r.tc.toFixed(1)} °C` }),
    item('rb20', 'Barrel resistance at 20 °C', r.rb20, 'Ω', fR(r.rb20), { symbol: 'R_b,20', group: 'Per via' }),
    item('rPad', 'Pad spreading (each)', s.pads ? r.rPad : null, 'Ω', s.pads ? fR(r.rPad) : 'off', { symbol: 'R_pad', group: 'Per via', note: 'ρ·ln(D_pad/d)/(2π·t_pad)' }),
    item('area', 'Copper cross-section', r.area, 'm²', `${(r.area * 1e6).toPrecision(4)} mm² (${(r.area / MIL2).toPrecision(4)} mil²)`, { symbol: 'A', group: 'Per via', note: s.fill === 'cu' ? 'π·d²/4, solid copper' : 'π·t·(d − t)' }),
    item('j', 'Current density', r.j, 'A/m²', `${(r.j * 1e-6).toPrecision(4)} A/mm²`, { symbol: 'J', group: 'Per via' }),
    item('pVia', 'Barrel power per via', r.pVia, 'W', si(r.pVia, 'W', 4), { symbol: 'P_via', group: 'Per via' }),
    item('rho', 'Copper resistivity', r.rho, 'Ω·m', `${(r.rho * 1e8).toPrecision(4)} µΩ·cm`, { symbol: 'ρ', group: 'Copper & heat', note: `at ${r.tc.toFixed(1)} °C${self ? ' (mean barrel)' : ''}` }),
    item('tc', 'Barrel temperature', r.tc, '°C', `${r.tc.toFixed(2)} °C`, { symbol: 'T_c', group: 'Copper & heat', note: self ? 'T_op + mean rise' : 'set to T_op' }),
    item('tMax', 'Hottest point of the barrel', tMax, '°C', `${tMax.toPrecision(4)} °C`, { symbol: 'T_max', group: 'Copper & heat', tone: barrelHot ? 'fail' : '', note: 'mid-length' }),
    item('dTmax', 'Barrel rise above the pads', r.dTmax, 'K', `${r.dTmax.toPrecision(3)} °C`, { symbol: 'ΔT_b', group: 'Copper & heat', note: 'peak at mid-length, pads at T_op' }),
    item('dTmean', 'Mean barrel rise', r.dTmean, 'K', `${r.dTmean.toPrecision(3)} °C`, { symbol: 'ΔT_avg', group: 'Copper & heat', note: '⅔ of the peak' }),
    item('theta', 'Thermal resistance per via', r.theta, 'K/W', `${r.theta.toPrecision(4)} K/W`, { symbol: 'θ', group: 'Copper & heat', note: 'h/(k·A), pad to pad' }),
    item('tIpc', 'Via temperature (IPC-2221)', tIpc, '°C', `${tIpc.toFixed(1)} °C`, { symbol: 'T_IPC', group: 'Copper & heat', tone: hot ? 'fail' : '', note: 'T_op + ΔT_IPC' }),
  ];
  rep.results = [...prim, ...sec];

  // ── warnings at the limits of the model and the fab
  if (barrelHot) rep.warnings.push(`The barrel’s own self-heating takes its middle to ${tMax.toPrecision(3)} °C (pads at ${+s.tOp.toPrecision(4)} °C), above the ~105–130 °C rating of typical FR-4${tMax > 1000 ? ' and far beyond anything copper plating survives' : ''}. The runaway current of this via array is ${si(runawayCurrent(input(s)), 'A', 3)}: add vias or use a larger drill.`);
  if (solvedNote) rep.notes.push(`The drop is a limit, not a target: ${solvedNote}.`);
  if (tIpc > 105) rep.warnings.push(`The IPC-2221 chart puts the via at ${tIpc.toFixed(0)} °C, above the ~105–130 °C rating (UL RTI) of typical FR-4. Add vias, use a larger drill or copper fill, or confirm with a thermal simulation.`);
  if (s.fill !== 'cu' && s.t < PLATING_MIN.class2 * (1 - 1e-9)) rep.warnings.push(`Plating ${si(s.t, 'm', 3)} is below the IPC-6012 minimum average of 20 µm (Class 1 and 2): the drop will be higher than planned where the plating is thin. Specify at least 20 µm, or 25 µm for Class 3.`);
  const out: string[] = [];
  if (ipcDT < 10 || ipcDT > 100) out.push(`ΔT ${ipcDT.toPrecision(3)} °C (charts: 10–100 °C)`);
  if (r.iVia > 35) out.push(`I/N ${si(r.iVia, 'A', 3)} (charts: up to 35 A)`);
  if (r.area > 700 * MIL2) out.push(`A ${(r.area / MIL2).toFixed(0)} mil² (charts: up to 700 mil²)`);
  if (out.length) rep.notes.push(`The IPC-2221 rise is read off the chart fit outside its range (${out.join('; ')}).`);
  if (s.pads && s.pad / s.d > 20) rep.notes.push('The pad is more than 20× the drill: the radial pad resistance assumes the current leaves the whole pad edge evenly.');
  if (s.fill === 'cu') rep.notes.push('Copper-filled via: the whole drill area conducts (π·d²/4). Voids in the fill raise the resistance.');
  if (self && r.dTmean > 0.01) rep.notes.push(`Self-heating raises the barrel resistance by ${(((r.rb / (r.rb20 * (1 + 0.00393 * (s.tOp - 20)))) - 1) * 100).toPrecision(2)} % (exact rod solution, mean temperature ${r.tc.toPrecision(4)} °C).`);
  rep.notes.push(
    'Resistance uses annealed copper (1.724 µΩ·cm at 20 °C, +0.393 %/K); electroplated copper is a few per cent more resistive.',
    'Two heating figures: the barrel’s own rise above its pads (conduction to pads held at T_op, the best case) and the IPC-2221 chart rise for a conductor of the same area, which includes the heating of the copper around the via (conservative).',
  );
  rep.status = { text: `${fV(r.v)} drop`, tone: hot ? 'fail' : 'pass' };
  rep.summary = `${si(s.i, 'A', 3)} through ${s.n} × ${fLen(s.d)} via${plural}, ${fLen(s.h)} long${s.fill === 'cu' ? ', copper filled' : `, ${si(s.t, 'm', 3)} plating`} · R = ${fR(r.r)} · V = ${fV(r.v)} · ΔT_IPC ${ipcDT.toPrecision(3)} °C`;
  rep.details = { ...r, tMax, ipcDT, tIpc, runawayCurrent: runawayCurrent(input(s)) };
  rep.graphs = graphs(s, r);
  return rep;
}

function graphs(s: DropState, r: DropResult): GraphSpec[] {
  const lim = isTarget(s.solveFor) ? [{ value: s.v, label: `limit ${si(s.v, 'V', 3)}`, color: '#8b1e1e', dash: [6, 4] }] : [];
  const iRun = runawayCurrent(input(s));
  const iHi = Math.min(Math.max(2 * s.i, 1e-3), 0.95 * iRun, 1000);
  const is = Array.from({ length: 121 }, (_, k) => (iHi * k) / 120);
  const vOf = (p: Partial<DropInput>) => {
    const q = viaDrop({ ...input(s), ...p });
    return q.runaway ? NaN : q.v;
  };
  const nHi = Math.max(10, Math.min(N_MAX, 2 * s.n));
  const ns = Array.from({ length: nHi }, (_, k) => k + 1).filter((n) => Number.isFinite(vOf({ n })));
  const dLo = s.fill === 'cu' ? 50e-6 : Math.max(2.2 * s.t, 50e-6);
  const dHi = Math.max(3 * s.d, 1e-3);
  const ds = Array.from({ length: 141 }, (_, k) => dLo * (dHi / dLo) ** (k / 140)).filter((d) => Number.isFinite(vOf({ d })));
  return [
    {
      id: 'v-vs-i',
      title: 'Drop vs current',
      subtitle: `${s.n} × ${si(s.d, 'm', 3)} via${s.n > 1 ? 's' : ''}, ${s.heat === 'self' ? 'self-heated' : `copper at ${s.tOp} °C`}`,
      x: { label: 'Total current I', unit: 'A' },
      y: [{ id: 'v', label: 'Voltage drop V', unit: 'V', includeZero: true }],
      legend: 'below',
      series: [{ label: 'V(I)', x: is, y: is.map((i) => vOf({ i })), width: 2.2 }],
      hlines: lim,
      vlines: [{ value: s.i, label: `I = ${si(s.i, 'A', 3)}` }],
      markers: [{ x: s.i, y: r.v, label: si(r.v, 'V', 3) }],
    },
    {
      id: 'v-vs-n',
      title: 'Drop vs via count',
      subtitle: `${si(s.i, 'A', 3)} total`,
      x: { label: 'Vias in parallel N', unit: '', integer: true },
      y: [{ id: 'v', label: 'Voltage drop V', unit: 'V', log: true }],
      series: [{ label: 'V(N)', x: ns, y: ns.map((n) => vOf({ n })), width: 2.2 }],
      hlines: lim,
      markers: [{ x: s.n, y: r.v, label: `N = ${s.n}` }],
    },
    {
      id: 'v-vs-d',
      title: 'Drop vs drill',
      subtitle: s.fill === 'cu' ? 'copper filled' : `t = ${si(s.t, 'm', 3)}`,
      x: { label: 'Drill diameter d', unit: 'm', log: true },
      y: [{ id: 'v', label: 'Voltage drop V', unit: 'V', log: true }],
      series: [{ label: 'V(d)', x: ds, y: ds.map((d) => vOf({ d })), width: 2.2 }],
      hlines: lim,
      vlines: [{ value: s.d, label: `d = ${si(s.d, 'm', 3)}` }],
      markers: [{ x: s.d, y: r.v, label: si(r.v, 'V', 3) }],
    },
  ];
}

export const def: CalcDef<DropState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Copper cross-section π·t·(d − t) (or π·d²/4 copper filled); R = ρ(T)·h/A with IEC 60028 annealed copper (ρ20 = 1.724 µΩ·cm, α = 0.00393 /K); optional radial pad resistance ρ·ln(D_pad/d)/(2π·t_pad) (Griffiths §7.1); N vias in parallel; barrel rise P·h/(8kA) from 1-D conduction with uniform heating to isothermal pads (Incropera §3.5), with the exact self-heated rod solution R_op·tan(u)/u (ρ linear in T); IPC-2221A chart rise as a second opinion. N by scan, I, d and t by Brent root finding on the same equations.',
  fields,
  defaults,
  solve: {
    default: 'v',
    analysis: 'v',
    options: [
      { key: 'v', label: 'Voltage drop from the vias (analysis)' },
      { key: 'n', label: 'Number of vias N for a drop limit' },
      { key: 'i', label: 'Largest current I for a drop limit' },
      { key: 'd', label: 'Drill diameter d for a drop limit' },
      { key: 't', label: 'Plating thickness t for a drop limit' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '2 A through four 0.3 mm vias, 1.6 mm board', state: defaults() },
    { id: 'single', label: 'One 0.3 mm via at 1 A, barrel only, 25 °C', state: { ...defaults(), i: 1, n: 1, pads: false, heat: 'fixed' } },
    { id: 'array', label: 'Vias for 10 A within 1 mV (0.4 mm drill)', state: { ...defaults(), solveFor: 'n', v: 1e-3, i: 10, d: 0.4e-3, pad: 0.8e-3 } },
    { id: 'drill', label: 'Drill for 3 A through two vias within 2 mV', state: { ...defaults(), solveFor: 'd', v: 2e-3, i: 3, n: 2, pad: 1.2e-3 } },
    { id: 'filled', label: 'Copper-filled 0.2 mm via in pad: current for 0.5 mV', state: { ...defaults(), solveFor: 'i', v: 0.5e-3, n: 1, d: 0.2e-3, fill: 'cu', pad: 0.45e-3 } },
    { id: 'hot', label: 'One thin-plated via at 3 A on a 70 °C board: too hot', state: { ...defaults(), i: 3, n: 1, t: 15e-6, tOp: 70 } },
  ],
};
