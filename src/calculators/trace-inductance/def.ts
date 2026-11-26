/** PCB trace inductance — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_IND, U_LEN_PCB, U_THICK, withDefault } from '@/core/unitsets';

/** The shared inductance units plus fH: very short traces have partial inductances in the fH range. */
const U_L: Record<string, number> = { ...U_IND, fH: 1e-15 };
import { groverL, hammerstad75LPer, microstripLPer, partialSelfL, plateLPer } from './model';

export const ID = 'pcb/pcb-trace-inductance';

export type Topo = 'free' | 'plane';

export interface TraceLState {
  solveFor: 'L' | 'len' | 'w';
  L: number;
  LUnit: string;
  topo: Topo;
  len: number;
  lenUnit: string;
  w: number;
  wUnit: string;
  t: number;
  tUnit: string;
  h: number;
  hUnit: string;
  f: number;
  fUnit: string;
}

export const defaults = (): TraceLState => ({
  solveFor: 'L',
  L: 19.28e-9,
  LUnit: 'nH',
  topo: 'free',
  len: 20e-3,
  lenUnit: 'mm',
  w: 0.5e-3,
  wUnit: 'mm',
  t: 35e-6,
  tUnit: 'µm',
  h: 0.2e-3,
  hUnit: 'mm',
  f: 100e6,
  fUnit: 'MHz',
});

const RANGE = { len: { lo: 1e-6, hi: 10 }, w: { lo: 1e-6, hi: 1 } };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Trace',
    fields: [
      { kind: 'number', key: 'L', symbol: 'L', label: 'Inductance', units: U_L, unitKey: 'LUnit', solvable: true, min: 1e-21, max: 1e-2, help: 'Result by default. Click ◎ on the length or width to make this the target (the largest inductance the trace may have).' },
      {
        kind: 'select',
        key: 'topo',
        label: 'Return path',
        options: [{ value: 'free', label: 'None — isolated trace (partial L)' }, { value: 'plane', label: 'Ground plane under the trace (loop L)' }],
        // partial and loop inductance are different quantities: a target set for one must not size the other
        apply: (_v, s) => {
          s.solveFor = 'L';
        },
        help: 'Isolated: the partial self-inductance of the straight trace alone, the number a loop is built from. Over a plane: the inductance of the loop the trace forms with its return current in the plane directly underneath.',
      },
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'Trace length', units: withDefault(U_LEN_PCB, 'mm'), unitKey: 'lenUnit', solvable: true, min: RANGE.len.lo, max: RANGE.len.hi, help: 'Click ◎ for the longest trace that stays below the inductance entered above.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: RANGE.w.lo, max: RANGE.w.hi },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 1e-7, max: 1e-3, help: '1 oz/ft² ≈ 35 µm (choose "oz" to type ounces).' },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Height above plane', units: U_LEN_PCB, unitKey: 'hUnit', min: 1e-6, max: 0.1, visible: (s) => s.topo === 'plane', help: 'Dielectric thickness from the trace to the plane carrying the return current. εr does not matter: inductance depends on geometry only.' },
    ],
  },
  {
    kind: 'section',
    title: 'Reactance',
    fields: [{ kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Only for X_L = 2πfL. The inductance itself is computed for the current distribution stated in the notes.' }],
  },
];

/** Inductance (H) of the trace for the current return-path option. */
export function inductance(topo: Topo, w: number, t: number, len: number, h: number): number {
  return topo === 'plane' ? microstripLPer(w, h, t) * len : partialSelfL(w, t, len);
}

const fL = (x: number) => si(x, 'H', 4);
const fm = (x: number) => si(x, 'm', 4);

export function compute(st: TraceLState): CalcReport {
  for (const k of ['L', 'len', 'w', 't', 'h', 'f'] as const) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (st.solveFor !== 'len' && !(st.len > 0)) throw new Error('Length must be > 0.');
  if (st.solveFor !== 'w' && !(st.w > 0)) throw new Error('Width must be > 0.');
  if (!(st.t > 0) || !(st.h > 0) || !(st.f > 0)) throw new Error('Thickness, height and frequency must be > 0.');
  if (st.solveFor !== 'L' && !(st.L > 0)) throw new Error('Target inductance must be > 0.');
  const s: TraceLState = { ...st };
  const plane = s.topo === 'plane';
  const g = (key: 'len' | 'w', x: number) => inductance(s.topo, key === 'w' ? x : s.w, s.t, key === 'len' ? x : s.len, s.h);

  if (s.solveFor === 'len' || s.solveFor === 'w') {
    const key = s.solveFor;
    const { lo, hi } = RANGE[key];
    const r = invert((x) => g(key, x), s.L, { lo, hi, log: true, samples: 60 });
    if (!r.ok) {
      const a = g(key, lo);
      const b = g(key, hi);
      const [mn, mx] = [Math.min(a, b), Math.max(a, b)];
      const name = key === 'len' ? 'length ℓ' : 'width W';
      const why = s.L < mn
        ? key === 'len' ? `even ℓ = ${fm(lo)} has ${fL(mn)}` : `even W = ${fm(hi)} has ${fL(mn)}`
        : key === 'len' ? `even ℓ = ${fm(hi)} has only ${fL(mx)}` : `even W = ${fm(lo)} has only ${fL(mx)}`;
      return { ...emptyReport(ID), ok: false, solveFor: key, status: { text: 'NO SOLUTION', tone: 'fail' }, error: `No ${name} gives L = ${fL(s.L)}: ${why} with the other inputs. Change the target or the other dimensions.` };
    }
    s[key] = r.roots[0];
  }

  const L = inductance(s.topo, s.w, s.t, s.len, s.h);
  if (s.solveFor === 'L') s.L = L;
  const warnings: string[] = [];
  const notes: string[] = [];
  const lFree = partialSelfL(s.w, s.t, s.len);
  const lGrover = groverL(s.w, s.t, s.len);
  const u = s.w / s.h;
  const lPer = L / s.len;
  const xl = 2 * Math.PI * s.f * L;

  if (plane) {
    if (u < 0.01 || u > 100) warnings.push(`W/H = ${u.toPrecision(3)} is outside 0.01–100, the range of the Hammerstad–Jensen fit used for L′. Treat the result as an estimate.`);
    if (s.t / s.h > 0.2) warnings.push(`T/H = ${(s.t / s.h).toFixed(2)}: the strip-thickness correction is meant for thin copper; expect a few percent error.`);
    if (s.len < 5 * s.h) warnings.push(`ℓ = ${fm(s.len)} is less than 5 H: the ends (vias, pads, where the current turns down to the plane) carry a large share of the loop inductance, and L′·ℓ underestimates it. Add the via inductance.`);
    notes.push('Loop inductance L = L′·ℓ with L′ = Z₀·√εeff/c = Z₀,air/c (Hammerstad–Jensen 1980, with the copper-thickness correction): the return current flows in the plane under the trace. It holds at frequencies where the current has moved to the facing surfaces (the usual case above ~1 MHz on a plane) and does not depend on εr.');
    notes.push('The vertical parts of the loop at each end (vias or pads down to the plane) are not included.');
  } else {
    notes.push('Partial self-inductance: the exact value for a straight rectangular bar carrying uniform (DC/low-frequency) current, with its return path not included. A real loop inductance is the sum of the partial inductances of its segments minus their mutual inductances, so this number is meaningful only as part of a loop.');
    if (s.len < s.w) notes.push(`ℓ < W: this is a short, wide plate rather than a trace; the value is still exact for uniform current along ℓ.`);
    if (s.w > 1e4 * s.len) notes.push('W is over 10 000 times ℓ: rounding in the exact formula limits the result to about 5 significant digits.');
    notes.push('At high frequency the current crowds to the edges and the internal inductance vanishes, which lowers L by a few percent for typical traces.');
  }
  const groverErr = lGrover / lFree - 1;
  if (!plane && s.len < 3 * (s.w + s.t)) notes.push(`Grover’s approximation assumes ℓ ≫ W + T; here it is ${(groverErr * 100).toFixed(1)} % off the exact value.`);

  const solved = s.solveFor;
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const primary: ResultItem[] = [];
  if (solved === 'len') primary.push(item('len', 'Maximum trace length', s.len, 'm', fm(s.len), { symbol: 'ℓ', solved: true, primary: true, note: `${(s.len / 25.4e-3).toPrecision(4)} in · L ≤ ${fL(s.L)}` }));
  if (solved === 'w') primary.push(item('w', 'Trace width', s.w, 'm', fm(s.w), { symbol: 'W', solved: true, primary: true, note: `${(s.w / 25.4e-6).toPrecision(4)} mil${plane ? ` · W/H = ${u.toPrecision(3)}` : ''}` }));
  primary.push(item('L', plane ? 'Loop inductance' : 'Partial self-inductance', L, 'H', fL(L), { symbol: 'L', solved: solved === 'L', primary: true, note: solved === 'L' ? (plane ? 'trace + return in the plane' : 'exact, uniform current') : 'target' }));
  primary.push(item('lPerMm', 'Per unit length', lPer, 'H/m', `${si(lPer * 1e-3, 'H', 4)}/mm`, { symbol: "L/ℓ", primary: true, note: `${si(lPer * 25.4e-3, 'H', 3)}/in` }));
  primary.push(item('xl', `Reactance at ${si(s.f, 'Hz')}`, xl, 'Ω', si(xl, 'Ω', 4), { symbol: 'X_L', primary: true }));

  const cmp: ResultItem[] = plane
    ? [
        item('lHam75', 'Hammerstad 1975 formula', hammerstad75LPer(s.w, s.h) * s.len, 'H', `${fL(hammerstad75LPer(s.w, s.h) * s.len)} (${pct(hammerstad75LPer(s.w, s.h) * s.len, L)})`, { group: 'Other models', note: 'zero thickness, ±1 %' }),
        item('lPlate', 'Parallel-plate limit μ₀H/W', plateLPer(s.w, s.h) * s.len, 'H', `${fL(plateLPer(s.w, s.h) * s.len)} (${pct(plateLPer(s.w, s.h) * s.len, L)})`, { group: 'Other models', note: 'no fringing: only for W ≫ H' }),
        item('lFree', 'Same trace with no plane', lFree, 'H', fL(lFree), { group: 'Other models', note: `partial L · the plane cuts it by ${((1 - L / lFree) * 100).toFixed(0)} %` }),
        item('z0air', 'Z₀ in air (Z₀·√εeff)', L / s.len * 299_792_458, 'Ω', si((L / s.len) * 299_792_458, 'Ω', 4), { group: 'Line', symbol: 'Z₀,air' }),
        item('u', 'W/H', u, '', u.toPrecision(4), { group: 'Line' }),
      ]
    : [
        item('lGrover', 'Grover long-bar formula', lGrover, 'H', `${fL(lGrover)} (${pct(lGrover, L)})`, { group: 'Other models', note: 'valid for ℓ ≫ W + T' }),
        item('nhPerMmRule', 'Rule of thumb 1 nH/mm', s.len * 1e-6, 'H', `${fL(s.len * 1e-6)} (${pct(s.len * 1e-6, L)})`, { group: 'Other models', note: 'rough figure for thin traces, not a model' }),
      ];
  const report: CalcReport = { calc: ID, ok: true, solveFor: solved, results: [...primary, ...cmp], graphs: [], tables: [], warnings, notes };
  report.summary = `${plane ? `Loop over a plane at H = ${fm(s.h)}` : 'Isolated straight trace'} · ${fm(s.w)} × ${si(s.t, 'm', 3)} × ${fm(s.len)} → ${fL(L)}`;
  report.graphs = graphs(s, L);
  report.details = { lFree, lGrover, lPer, u, hammerstad75: plane ? hammerstad75LPer(s.w, s.h) * s.len : null };
  return report;
}

const pct = (x: number, ref: number) => `${x >= ref ? '+' : '−'}${Math.abs((x / ref - 1) * 100).toFixed(1)} %`;

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: TraceLState, L: number): GraphSpec[] {
  const plane = s.topo === 'plane';
  const ls = logspace(Math.max(s.len / 100, RANGE.len.lo), Math.min(s.len * 100, RANGE.len.hi), 90);
  const ws = logspace(Math.max(s.w / 30, RANGE.w.lo), Math.min(s.w * 30, RANGE.w.hi), 90);
  const byLen = {
    id: 'l-vs-len',
    title: 'L vs length',
    x: { label: 'Trace length ℓ', unit: 'm', log: true },
    y: [{ id: 'L', label: 'Inductance', unit: 'H', log: true }],
    series: plane
      ? [
          { label: `Loop over plane (H = ${fm(s.h)})`, x: ls, y: ls.map((x) => microstripLPer(s.w, s.h, s.t) * x), width: 2.2 },
          { label: 'Isolated trace (partial L)', x: ls, y: ls.map((x) => partialSelfL(s.w, s.t, x)), color: '#c47b17', width: 1.4, dash: [5, 3] },
        ]
      : [
          { label: 'Exact partial L', x: ls, y: ls.map((x) => partialSelfL(s.w, s.t, x)), width: 2.2 },
          { label: 'Grover (ℓ ≫ W+T)', x: ls, y: ls.map((x) => groverL(s.w, s.t, x)), color: '#c47b17', width: 1.4, dash: [5, 3] },
        ],
    vlines: [{ value: s.len, label: `ℓ = ${fm(s.len)}`, color: '#9a8f7a' }],
    hlines: s.solveFor !== 'L' ? [{ value: s.L, label: `L max = ${fL(s.L)}`, color: '#8b1e1e', dash: [5, 4] }] : [],
    markers: [{ x: s.len, y: L, label: fL(L) }],
  } as GraphSpec;
  const byW: GraphSpec = {
    id: 'l-vs-w',
    title: 'L vs width',
    x: { label: 'Trace width W', unit: 'm', log: true },
    y: [{ id: 'L', label: 'Inductance', unit: 'H' }],
    series: [{ label: plane ? 'Loop over plane' : 'Exact partial L', x: ws, y: ws.map((x) => inductance(s.topo, x, s.t, s.len, s.h)), width: 2.2 }],
    vlines: [{ value: s.w, label: `W = ${fm(s.w)}`, color: '#9a8f7a' }],
    hlines: s.solveFor !== 'L' ? [{ value: s.L, label: `L max = ${fL(s.L)}`, color: '#8b1e1e', dash: [5, 4] }] : [],
    markers: [{ x: s.w, y: L, label: fL(L) }],
  };
  return [byLen, byW];
}

export const def: CalcDef<TraceLState> = {
  id: ID,
  version: '0.1.0',
  method: 'Isolated trace: exact partial self-inductance of a rectangular bar with uniform current (Ruehli 1972; Hoer & Love 1965), evaluated as the filament mutual inductance (Grover 1946) averaged over the cross-section with Maxwell’s exact GMD, the exact mean distance and Gauss–Legendre quadrature; Grover’s long-bar formula for comparison. Over a plane: loop inductance L′·ℓ with L′ = Z₀,air/c from Hammerstad–Jensen (1980) incl. thickness correction; Hammerstad (1975) and the parallel-plate limit for comparison. Solve-for uses bracketed Brent root finding.',
  fields,
  defaults,
  // Mode-switch harness notes (reviewed): error-after-edit flags come from typed targets the geometry cannot
  // reach (the message gives the inductance at the end of the range); "unreadable" solved widths or lengths
  // occur only in unprefixed units (in, mil) that the core cannot rescale.
  solve: {
    default: 'L',
    analysis: 'L',
    options: [
      { key: 'L', label: 'Inductance L from the geometry (analysis)' },
      { key: 'len', label: 'Longest trace ℓ for a maximum L' },
      { key: 'w', label: 'Trace width W for a target L' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: 'Isolated 20 mm × 0.5 mm trace (partial L)', state: { ...defaults() } },
    { id: 'over-plane', label: 'Same trace over a plane 0.2 mm below (loop L)', state: { ...defaults(), topo: 'plane', solveFor: 'L' } },
    { id: 'max-len', label: 'Longest 0.2 mm trace over a plane for 5 nH', state: { ...defaults(), topo: 'plane', solveFor: 'len', L: 5e-9, LUnit: 'nH', w: 0.2e-3, h: 0.2e-3, hUnit: 'mm' } },
    { id: 'gate-loop', label: 'Gate-drive trace: 10 mm, no plane, ≤ 8 nH → width', state: { ...defaults(), topo: 'free', solveFor: 'w', L: 8e-9, LUnit: 'nH', len: 10e-3 } },
    { id: 'wide-bar', label: 'Square bus bar 1 mm × 1 mm × 100 mm (exact vs Grover)', state: { ...defaults(), topo: 'free', solveFor: 'L', w: 1e-3, t: 1e-3, tUnit: 'mm', len: 100e-3 } },
  ],
};
