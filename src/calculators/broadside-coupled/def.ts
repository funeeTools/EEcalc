/** Broadside-coupled stripline pair — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TableSpec, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { MATERIALS } from '../controlled-impedance/def';
import { C0 } from '../microstrip/model';
import { offsetStripline } from '../asymmetric-stripline/model';
import { type BroadsideResult, broadside } from './model';

export const ID = 'pcb/broadside-coupled-pair';

export interface BroadsideState {
  solveFor: 'zdiff' | 'w' | 's' | 'h';
  zdiff: number;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
  h: number;
  hUnit: string;
  t: number;
  tUnit: string;
  material: string;
  er: number;
  f: number;
  fUnit: string;
}

/** 100 Ω pair across a 0.2 mm core, 0.3 mm prepreg to each plane, ½ oz copper. */
export const defaults = (): BroadsideState => ({
  solveFor: 'w',
  zdiff: 100,
  w: 0.115e-3,
  wUnit: 'mm',
  s: 0.2e-3,
  sUnit: 'mm',
  h: 0.3e-3,
  hUnit: 'mm',
  t: 17.5e-6,
  tUnit: 'µm',
  material: 'FR-4 prepreg (~1 GHz)',
  er: 4.2,
  f: 5e9,
  fUnit: 'GHz',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Pair geometry',
    note: 'Traces stacked on two layers, centred between two planes. Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'zdiff', symbol: 'Z_diff', label: 'Diff. impedance', unit: 'Ω', solvable: true, min: 1, max: 1000, help: 'Target Zdiff = 2·Z₀ₒ when solving for W, S or H; otherwise the calculated result.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: 1e-6, max: 0.05, help: 'Width of each trace (both the same, directly above one another).' },
      { kind: 'number', key: 's', symbol: 'S', label: 'Gap between traces', units: U_LEN_PCB, unitKey: 'sUnit', solvable: true, min: 1e-6, max: 0.05, help: 'Dielectric between the facing surfaces of the two traces (usually one core).' },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Dielectric to plane', units: U_LEN_PCB, unitKey: 'hUnit', solvable: true, min: 1e-6, max: 0.05, help: 'From the outer face of each trace to its plane (the same above and below). Plane spacing b = 2H + 2T + S.' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 0.5e-3, help: 'Inner layers are usually ½ oz ≈ 17.5 µm or 1 oz ≈ 35 µm (choose "oz" to type ounces).' },
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
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m != null) s.er = m;
        },
        help: 'Fills εr with a typical design value. The model assumes one permittivity for the core between the traces and the prepreg outside them.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 100, help: 'Relative permittivity of the dielectric between the planes (homogeneous: both modes travel at c/√εr).' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency',
    fields: [{ kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets the wavelength results and the parallel-plate mode check; the impedances are static (TEM).' }],
  },
];

type Key = Exclude<BroadsideState['solveFor'], 'zdiff'>;
const LABEL: Record<BroadsideState['solveFor'], string> = { zdiff: 'Differential impedance', w: 'Trace width', s: 'Gap between traces', h: 'Dielectric to plane' };
const SYM: Record<BroadsideState['solveFor'], string> = { zdiff: 'Z_diff', w: 'W', s: 'S', h: 'H' };
const DIM_MIN = 1e-6;
const DIM_MAX = 0.05;
/** Largest T/(2D + T) for each face’s virtual centred line (Cohn’s thin-strip thickness correction). */
const TB_MAX = 0.45; // field-checked (offset/centred stripline) to −1.1 … +0.6 % up to 0.45

const fLen = (m: number) => si(m, 'm', 4);
const fZ = (z: number) => si(z, 'Ω', 4);
const mil = (m: number) => `${(m / 25.4e-6).toFixed(2)} mil`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

const run1 = (s: BroadsideState) => broadside(s.w, s.s, s.h, s.t, s.er);

/** Copper too thick for the gap or the outer dielectric? */
function thickError(s: BroadsideState): string | null {
  if (!(s.t > 0)) return null;
  const tbS = s.t / (s.s + s.t);
  const tbH = s.t / (2 * s.h + s.t);
  if (tbS > TB_MAX + 1e-12 || tbH > TB_MAX + 1e-12)
    return `The copper (T = ${fLen(s.t)}) is too thick for ${tbS > tbH ? `the gap S = ${fLen(s.s)}` : `the dielectric H = ${fLen(s.h)}`}: Cohn’s thin-strip thickness correction stops being meaningful there (T/(${tbS > tbH ? 'S' : '2H'} + T) must stay under ${TB_MAX}). Use a 2-D field solver.`;
  return null;
}

function rangeFor(s: BroadsideState, k: Key): { lo: number; hi: number } {
  const tMin = s.t > 0 ? s.t * (1 / TB_MAX - 1) : 0; // S and 2H ≥ T(1/TB_MAX − 1)
  if (k === 's') return { lo: Math.max(DIM_MIN, tMin * 1.000001), hi: DIM_MAX };
  if (k === 'h') return { lo: Math.max(DIM_MIN, (tMin / 2) * 1.000001), hi: DIM_MAX };
  return { lo: DIM_MIN, hi: DIM_MAX };
}

export function solveKey(s: BroadsideState, k: Key, target: number): { ok: true; x: number } | { ok: false; lo: number; hi: number; zLo: number; zHi: number; closestZ: number } {
  const r = rangeFor(s, k);
  const g = (x: number) => run1({ ...s, [k]: x }).zdiff;
  const inv = invert(g, target, { lo: r.lo, hi: r.hi, log: true, samples: 120 });
  for (const x of inv.roots) if (Math.abs(g(x) / target - 1) < 1e-9) return { ok: true, x };
  return { ok: false, ...r, zLo: g(r.lo), zHi: g(r.hi), closestZ: inv.closestValue };
}

export function compute(st: BroadsideState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness notes (style guide §12.3):
 *  • error-after-edit on a typed number (target ×10, a dimension at its field min/max) is a genuine NO SOLUTION or
 *    out-of-model input: the user typed a value no geometry in range can meet, and the message says what to change.
 *  • "unreadable" with a unit the user picked (e.g. a solved 25 µm gap shown in inches): the inch entry has no
 *    prefixed forms for the core to move to; the value is right and the user chose the unit.
 */
function fail(msg: string, s: BroadsideState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function run(st: BroadsideState): CalcReport {
  const s: BroadsideState = { ...st };
  const k = s.solveFor;
  for (const key of ['w', 's', 'h'] as const) if (key !== k && !(finite(LABEL[key], s[key]) > 0)) throw new Error(`${LABEL[key]} must be > 0.`);
  if (!(finite('εr', s.er) >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(finite('Copper thickness', s.t) >= 0)) throw new Error('Copper thickness must be ≥ 0.');
  if (!(finite('Frequency', s.f) > 0)) throw new Error('Frequency must be > 0.');
  if (k !== 'zdiff' && !(finite('Target Zdiff', s.zdiff) > 0)) throw new Error('Target Zdiff must be > 0.');
  if (k !== 's' && k !== 'h') {
    const e = thickError(s);
    if (e) throw new Error(e);
  }
  if (k !== 'zdiff') {
    const r = solveKey(s, k, s.zdiff);
    if (!r.ok) {
      const span = Number.isFinite(r.zLo) && Number.isFinite(r.zHi) ? ` (${SYM[k]} = ${fLen(r.lo)} … ${fLen(r.hi)} gives ${fZ(Math.min(r.zLo, r.zHi))} … ${fZ(Math.max(r.zLo, r.zHi))})` : '';
      const lever: Record<Key, string> = {
        w: 'Zdiff falls as the traces widen: change S, H or the target.',
        s: 'Zdiff rises with the gap towards 2·Z₀ of a single trace and cannot exceed it: thicken H or narrow the traces.',
        h: 'Zdiff rises with the outer dielectric and levels off once the planes stop mattering: change W or S.',
      };
      return fail(`No ${SYM[k]} gives Zdiff = ${fZ(s.zdiff)}${span}. ${lever[k]}`, s);
    }
    s[k] = r.x;
    const e = thickError(s);
    if (e) return fail(e, s);
  }
  const o = run1(s);
  if (k === 'zdiff') {
    if (!(o.zdiff >= 1 && o.zdiff <= 1000)) return fail(`Zdiff = ${fZ(o.zdiff)} is outside 1–1000 Ω, the range of the impedance field: check the dimensions and units.`, s);
    s.zdiff = o.zdiff;
  }
  return report(s, o);
}

function report(s: BroadsideState, o: BroadsideResult): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const w = rep.warnings;
  const notes = rep.notes;
  const single = offsetStripline(s.w, s.t, s.h, s.h + s.t + s.s, s.er).z0;

  // ── validity
  const loose = s.w < s.s;
  const narrow = s.w / (o.b - s.s) < 0.2; // traces narrow against the dielectric to the planes
  if (s.w < 0.25 * s.s) w.push(`W is under a quarter of the gap: loosely coupled, beyond the field-solver check, where Cohn’s even-mode formula (derived for close coupling) already reads Zcm 7 % low. Use a field solver for Zcm.`);
  else if (s.w < 0.5 * s.s) w.push(`W < S/2: loosely coupled. Cohn’s even-mode formula was derived for close coupling and reads Zcm low here (−2.5 … −7 % against a field solution); Zdiff stays within 1.2 %.`);
  else if (!loose && narrow) notes.push(`W/(b − S) = ${(s.w / (o.b - s.s)).toFixed(3)}: traces narrow against the plane spacing, where Cohn’s even-mode formula reads Zcm up to 1.8 % low (field-solver checks at 0.09–0.12); Zdiff stays within 1.2 %.`);
  else if (loose) notes.push(`W < S: Cohn’s even-mode formula reads Zcm up to 2.6 % low at W = S/2 (field-solver check); Zdiff is unaffected.`);
  const tb = Math.max(s.t / (s.s + s.t), s.t / (2 * s.h + s.t));
  if (tb > 0.1) w.push(`The copper is thick relative to ${s.t / (s.s + s.t) > s.t / (2 * s.h + s.t) ? 'the gap' : 'the outer dielectric'} (T/(2D+T) = ${tb.toFixed(3)} > 0.1): beyond the range Cohn states for his thickness correction. Against 2-D field solutions it holds to ±0.5 % up to 0.26 and −1.1 … +0.6 % up to 0.45; confirm critical designs with a field solver.`);
  if (s.w < Math.min(s.h, s.s / 2) / 4) w.push('The traces are very narrow compared with the dielectric around them: beyond the field-solver check. Use a field solver.');
  const fPP = C0 / (2 * o.b * Math.sqrt(s.er));
  if (s.f > fPP) w.push(`f is above ${si(fPP, 'Hz', 3)}, where the plane spacing reaches half a wavelength and parallel-plate modes can propagate. Stitch the planes with ground vias.`);
  if (o.zdiff < 70 || o.zdiff > 130) notes.push(`Zdiff = ${fZ(o.zdiff)} is outside the 85–100 Ω most serial links use (USB 90 Ω, PCIe 85 Ω, Ethernet/LVDS 100 Ω).`);

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k !== 'zdiff') prim.push(item(k, LABEL[k], s[k], 'm', fLen(s[k]), { symbol: SYM[k], solved: true, primary: true, note: `${mil(s[k])}` }));
  prim.push(item('zdiff', 'Differential impedance', o.zdiff, 'Ω', fZ(o.zdiff), { symbol: 'Z_diff', primary: true, solved: k === 'zdiff', note: `${k === 'zdiff' ? '2·Z₀ₒ' : 'target, 2·Z₀ₒ'} · model −0.1 … +1.2 %` }));
  prim.push(item('zcm', 'Common-mode impedance', o.zcm, 'Ω', fZ(o.zcm), { symbol: 'Z_cm', primary: true, note: `Z₀ₑ/2 · model ${s.w < 0.5 * s.s ? '−7.2 … 0 %' : loose ? '−2.6 … 0 %' : narrow ? '−1.8 … 0 %' : '−0.65 … 0 %'}` }));
  prim.push(item('zodd', 'Odd-mode impedance', o.zo, 'Ω', fZ(o.zo), { symbol: 'Z₀ₒ', primary: true }));
  prim.push(item('zeven', 'Even-mode impedance', o.ze, 'Ω', fZ(o.ze), { symbol: 'Z₀ₑ', primary: true }));
  const vp = C0 / Math.sqrt(s.er);
  const lam = vp / s.f;
  const sec: ResultItem[] = [
    item('zsingle', 'Single trace alone', single, 'Ω', fZ(single), { symbol: 'Z₀', group: 'Coupling', note: 'one trace with its partner removed (offset stripline)' }),
    item('kb', 'Coupling coefficient', o.kb, '', o.kb.toFixed(4), { symbol: 'k', group: 'Coupling', note: o.kb > 0 ? `(Z₀ₑ−Z₀ₒ)/(Z₀ₑ+Z₀ₒ) = ${(20 * Math.log10(o.kb)).toFixed(1)} dB backward coupling` : 'no measurable coupling' }),
    item('zgeo', 'Coupler impedance √(Z₀ₑZ₀ₒ)', o.z0, 'Ω', fZ(o.z0), { symbol: '√(Z₀ₑZ₀ₒ)', group: 'Coupling' }),
    item('zdiffFrac', 'Zdiff vs uncoupled', o.zdiff / (2 * single) - 1, '', `${((o.zdiff / (2 * single) - 1) * 100).toFixed(1)} %`, { symbol: 'Z_diff/2Z₀', group: 'Coupling', note: 'how much the partner lowers Zdiff' }),
    item('tpd', 'Propagation delay', Math.sqrt(s.er) / C0, 's/m', `${si((Math.sqrt(s.er) / C0) * 1e-3, 's', 4)}/mm`, { symbol: 't_pd', group: 'Wave', note: 'same for both modes (homogeneous dielectric)' }),
    item('lambdaG', `Wavelength at ${si(s.f, 'Hz')}`, lam, 'm', fLen(lam), { symbol: 'λ_g', group: 'Wave' }),
    item('quarterWave', 'Quarter wavelength', lam / 4, 'm', fLen(lam / 4), { symbol: 'λ_g/4', group: 'Wave', note: 'length of a broadside directional coupler' }),
    item('b', 'Plane spacing', o.b, 'm', `${fLen(o.b)} (${mil(o.b)})`, { symbol: 'b', group: 'Geometry', note: 'b = 2H + 2T + S' }),
    item('wOverS', 'Width / gap', s.w / s.s, '', (s.w / s.s).toPrecision(4), { symbol: 'W/S', group: 'Geometry', note: 'above 1: close coupling' }),
  ];
  rep.results = [...prim, ...sec];
  rep.summary = `W/S ${(s.w / s.s).toPrecision(3)} · S/b ${(s.s / o.b).toPrecision(3)} · εr ${+s.er.toPrecision(4)} · k = ${o.kb.toFixed(3)}`;
  notes.push(
    'Zero-thickness even/odd impedances from Cohn (1960); the odd mode is solved as an offset stripline against the mid-plane (same model as the Asymmetric Stripline page), copper thickness by the image method. Checked against a 2-D field solution.',
    'Traces exactly above one another. A lateral offset between the layers (registration error, or a deliberate offset to weaken the coupling) raises Zdiff; it is not modelled here.',
    'Homogeneous dielectric: core and prepreg are taken to have the same εr, so there is no far-end crosstalk from the cross-section itself.',
  );
  rep.details = { ...o, zsingle: single, inputs: { w: s.w, s: s.s, h: s.h, t: s.t, er: s.er } };
  rep.graphs = graphs(s, o);
  rep.tables = [targetsTable(s)];
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: BroadsideState, o: BroadsideResult): GraphSpec[] {
  const ws = [...logspace(Math.max(Math.min(s.s / 5, s.w / 3), DIM_MIN), Math.min(Math.max(s.s * 6, s.w * 3), DIM_MAX), 80), s.w].sort((a, b) => a - b);
  const zw = ws.map((x) => broadside(x, s.s, s.h, s.t, s.er));
  const zsw = ws.map((x) => offsetStripline(x, s.t, s.h, s.h + s.t + s.s, s.er).z0);
  const sLo = Math.max(rangeFor(s, 's').lo, Math.min(s.w / 5, s.s / 3));
  const ss = [...logspace(sLo, Math.min(Math.max(s.w * 5, s.s * 3), DIM_MAX), 80), s.s].sort((a, b) => a - b);
  const zs = ss.map((x) => broadside(s.w, x, s.h, s.t, s.er));
  const target = s.solveFor === 'zdiff' ? [] : [{ value: s.zdiff, label: `target ${fZ(s.zdiff)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }];
  return [
    {
      id: 'zdiff-vs-w',
      title: 'Zdiff vs width',
      subtitle: `S = ${fLen(s.s)}, H = ${fLen(s.h)}`,
      x: { label: 'Trace width W', unit: 'm', log: true },
      y: [{ id: 'z', label: 'Impedance', unit: 'Ω' }],
      series: [
        { label: 'Z_diff', x: ws, y: zw.map((r) => r.zdiff), axis: 'z', width: 2.2 },
        { label: '2·Z₀ single', x: ws, y: zsw.map((z) => 2 * z), axis: 'z', color: '#9a8f7a', width: 1.2, dash: [5, 3] },
        { label: 'Z_cm', x: ws, y: zw.map((r) => r.zcm), axis: 'z', color: '#c47b17', width: 1.4 },
      ],
      hlines: target,
      vlines: [{ value: s.w, label: `W = ${fLen(s.w)}`, color: '#9a8f7a' }],
      markers: [{ x: s.w, y: o.zdiff, axis: 'z', label: fZ(o.zdiff) }],
    },
    {
      id: 'modes-vs-s',
      title: 'Coupling vs gap',
      subtitle: `W = ${fLen(s.w)}, H = ${fLen(s.h)} (planes move apart as S grows)`,
      x: { label: 'Gap between traces S', unit: 'm', log: true },
      y: [
        { id: 'z', label: 'Impedance', unit: 'Ω' },
        { id: 'k', label: 'Coupling k', unit: '%', side: 'right', includeZero: true },
      ],
      series: [
        { label: 'Z₀ₑ', x: ss, y: zs.map((r) => r.ze), axis: 'z', color: '#c47b17', width: 1.8 },
        { label: 'Z₀ₒ', x: ss, y: zs.map((r) => r.zo), axis: 'z', color: '#1f4e5f', width: 2.2 },
        { label: 'k (%)', x: ss, y: zs.map((r) => 100 * r.kb), axis: 'k', color: '#6b5b95', width: 1.4, dash: [6, 3] },
      ],
      vlines: [{ value: s.s, label: `S = ${fLen(s.s)}`, color: '#9a8f7a' }],
      markers: [{ x: s.s, y: o.zo, axis: 'z', label: fZ(o.zo) }],
    },
  ];
}

function targetsTable(s: BroadsideState): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  for (const [name, z] of [['PCIe / DDR5', 85], ['USB 2/3', 90], ['Ethernet, LVDS, HDMI', 100]] as const) {
    const r = solveKey(s, 'w', z);
    if (r.ok) {
      const o = broadside(r.x, s.s, s.h, s.t, s.er);
      rows.push({ use: name, zdiff: z, w: r.x, zcm: o.zcm, kb: o.kb });
      display.push({ use: name, zdiff: fZ(z), w: `${fLen(r.x)} (${mil(r.x)})`, zcm: fZ(o.zcm), kb: o.kb.toFixed(3) });
    } else {
      rows.push({ use: name, zdiff: z, w: null, zcm: null, kb: null });
      display.push({ use: name, zdiff: fZ(z), w: 'not reachable', zcm: '—', kb: '—' });
    }
  }
  return {
    id: 'targets',
    title: 'Trace width for common targets',
    columns: [
      { key: 'use', label: 'Interface', align: 'left' },
      { key: 'zdiff', label: 'Z_diff', unit: 'Ω' },
      { key: 'w', label: 'W', unit: 'm' },
      { key: 'zcm', label: 'Z_cm', unit: 'Ω' },
      { key: 'kb', label: 'k' },
    ],
    rows,
    display,
    note: `At S = ${fLen(s.s)}, H = ${fLen(s.h)}, T = ${fLen(s.t)}, εr = ${s.er}. Interface impedances are nominal; check the specification for tolerance.`,
  };
}

export const def: CalcDef<BroadsideState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Cohn (1960) broadside-coupled strips (exact-to-0.3 % conformal mapping for close coupling); odd mode solved as an offset stripline against the mid-plane with the narrow-strip deficit restored from Cohn’s exact centred stripline; copper thickness by the image method (Wadell §3.6.3) with Cohn/Wheeler thick-strip increments. Zdiff = 2Z₀ₒ, Zcm = Z₀ₑ/2. Checked against a 2-D field solution. Solve-for uses bracketed Brent root finding on Zdiff(x).',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'zdiff',
    options: [
      { key: 'zdiff', label: 'Zdiff from geometry (analysis)' },
      { key: 'w', label: 'Trace width W for a target Zdiff' },
      { key: 's', label: 'Gap S for a target Zdiff' },
      { key: 'h', label: 'Dielectric H for a target Zdiff' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: '100 Ω across a 0.2 mm core (solve W)', state: defaults() },
    { id: 'rogers-5880', label: 'Rogers design note: 5880, 0.005″ centre board, 0.2″ lines', state: { ...defaults(), solveFor: 'zdiff', w: 0.2 * 0.0254, s: 0.005 * 0.0254, h: 0.031 * 0.0254, t: 0, wUnit: 'in', sUnit: 'in', hUnit: 'in', material: 'RT/duroid 5880', er: 2.2, f: 1e9 } },
    { id: 'usb-90-gap', label: 'USB 90 Ω: core thickness for 0.1 mm traces', state: { ...defaults(), solveFor: 's', zdiff: 90, w: 0.1e-3, h: 0.15e-3, t: 17.5e-6 } },
    { id: 'tight-3db', label: 'Tight coupler: thin 0.1 mm core, wide traces (analyse)', state: { ...defaults(), solveFor: 'zdiff', w: 1.2e-3, s: 0.1e-3, h: 0.5e-3, t: 17.5e-6, material: 'RO4350B', er: 3.66, f: 2.4e9 } },
  ],
};
