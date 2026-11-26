/** Asymmetric (offset) stripline — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { MATERIALS } from '../controlled-impedance/def';
import { C0 } from '../microstrip/model';
import { type OffsetResult, offsetStripline } from './model';

export const ID = 'pcb/asymmetric-stripline';

export interface AsymState {
  solveFor: 'z0' | 'w' | 'h1' | 'h2' | 'er';
  z0: number;
  w: number;
  wUnit: string;
  h1: number;
  h1Unit: string;
  h2: number;
  h2Unit: string;
  t: number;
  tUnit: string;
  dual: boolean;
  d: number;
  dUnit: string;
  material: string;
  er: number;
  f: number;
  fUnit: string;
}

/** 6-layer board: plane, 0.125 mm core, L3, 0.2 mm prepreg, L4, 0.125 mm core, plane (½ oz inner copper). */
export const defaults = (): AsymState => ({
  solveFor: 'w',
  z0: 50,
  w: 0.13e-3,
  wUnit: 'mm',
  h1: 0.125e-3,
  h1Unit: 'mm',
  h2: 0.3425e-3,
  h2Unit: 'mm',
  t: 17.5e-6,
  tUnit: 'µm',
  dual: true,
  d: 0.2e-3,
  dUnit: 'mm',
  material: 'FR-4 prepreg (~1 GHz)',
  er: 4.2,
  f: 1e9,
  fUnit: 'GHz',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Trace and planes',
    note: 'H₁ and H₂ are measured from the trace faces to the two planes. Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'z0', symbol: 'Z₀', label: 'Impedance', unit: 'Ω', solvable: true, min: 1, max: 500, help: 'Target impedance when solving for W, H₁, H₂ or εr; otherwise the calculated result.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: 1e-6, max: 0.05 },
      { kind: 'number', key: 'h1', symbol: 'H₁', label: 'Dielectric below', units: U_LEN_PCB, unitKey: 'h1Unit', solvable: true, min: 1e-6, max: 0.05, help: 'From the bottom of the trace to the plane below (usually the core the trace is etched on).' },
      { kind: 'number', key: 'h2', symbol: 'H₂', label: 'Dielectric above', units: U_LEN_PCB, unitKey: 'h2Unit', solvable: true, min: 1e-6, max: 0.05, help: 'From the top of the trace to the plane above, including any second signal layer and the material around it.' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 0.5e-3, help: 'Inner layers are usually ½ oz ≈ 17.5 µm or 1 oz ≈ 35 µm (choose "oz" to type ounces).' },
    ],
  },
  {
    kind: 'section',
    title: 'Dual stripline',
    fields: [
      {
        kind: 'toggle',
        key: 'dual',
        label: 'Second signal layer',
        on: 'Shown',
        off: 'None',
        apply: (v: boolean, s) => {
          // make room for the second layer inside H₂ rather than turning a working page into an error
          if (v && !(s.h2 > s.d + s.t * 1.001)) s.d = Math.max((s.h2 - s.t) / 2, 1e-6);
        },
        help: 'Two signal layers between the same pair of planes (a dual stripline). The second layer’s traces are assumed to run at right angles to this one, so they barely change its impedance; the page also gives the impedance of a trace on the second layer.',
      },
      { kind: 'number', key: 'd', symbol: 'D', label: 'Gap to layer 2', units: U_LEN_PCB, unitKey: 'dUnit', min: 1e-6, max: 0.05, visible: (s) => s.dual, help: 'Dielectric between the top of this trace and the bottom of the second layer’s copper. Must leave room for that copper inside H₂.' },
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
          if (m != null) {
            s.er = m;
            if (s.solveFor === 'er') s.solveFor = 'z0';
          }
        },
        help: 'Fills εr with a typical design value. Core and prepreg usually differ slightly; this model assumes one permittivity above and below the trace.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', solvable: true, min: 1, max: 100, help: 'Relative permittivity of the dielectric between the planes (homogeneous: εeff = εr).' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency',
    fields: [{ kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets the wavelength results and the parallel-plate mode check; the impedance is static (TEM).' }],
  },
];

type Key = Exclude<AsymState['solveFor'], 'z0'>;
const LABEL: Record<AsymState['solveFor'], string> = { z0: 'Impedance', w: 'Trace width', h1: 'Dielectric below', h2: 'Dielectric above', er: 'Permittivity' };
const SYM: Record<AsymState['solveFor'], string> = { z0: 'Z₀', w: 'W', h1: 'H₁', h2: 'H₂', er: 'εr' };
const DIM_MIN = 1e-6;
const DIM_MAX = 0.05;
/**
 * Largest T/(2·H_near + T) accepted. Cohn states his thickness correction for ≲ 0.1; against 2-D field solutions
 * (builder and reviewer) it holds to −1.1 … +0.6 % up to 0.45 (offset −0.15 … +0.51 % at 0.26, +0.28 % at 0.375).
 */
export const TB_MAX = 0.45;

const fLen = (m: number) => si(m, 'm', 4);
const fZ = (z: number) => si(z, 'Ω', 4);
const mil = (m: number) => `${(m / 25.4e-6).toFixed(2)} mil`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

const zOf = (s: AsymState) => offsetStripline(s.w, s.t, s.h1, s.h2, s.er).z0;

/** Search range of an unknown: field limits, and room for the copper (T/b_near) and the second layer. */
function rangeFor(s: AsymState, k: Key): { lo: number; hi: number } {
  if (k === 'er') return { lo: 1, hi: 100 };
  if (k === 'w') return { lo: DIM_MIN, hi: DIM_MAX };
  const tMin = s.t > 0 ? (s.t * (1 / TB_MAX - 1)) / 2 : 0; // 2H + T ≥ T/TB_MAX
  const lo = Math.max(DIM_MIN, tMin, k === 'h2' && s.dual ? s.d + s.t * 1.001 + 1e-9 : 0);
  return { lo, hi: DIM_MAX };
}

export function solveKey(s: AsymState, k: Key, target: number): { ok: true; x: number } | { ok: false; lo: number; hi: number; zLo: number; zHi: number } {
  const r = rangeFor(s, k);
  const g = (x: number) => zOf({ ...s, [k]: x });
  if (!(r.hi > r.lo)) return { ok: false, ...r, zLo: NaN, zHi: NaN };
  const inv = invert(g, target, { lo: r.lo, hi: r.hi, log: true, samples: 120 });
  for (const x of inv.roots) if (Math.abs(g(x) / target - 1) < 1e-9) return { ok: true, x };
  return { ok: false, ...r, zLo: g(r.lo), zHi: g(r.hi) };
}

export function compute(st: AsymState): CalcReport {
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
function fail(msg: string, s: AsymState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

/** Second-layer trace geometry: its distances to the two planes. */
function layer2(s: AsymState): { below: number; above: number } {
  return { below: s.h1 + s.t + s.d, above: s.h2 - s.d - s.t };
}

function run(st: AsymState): CalcReport {
  const s: AsymState = { ...st };
  const k = s.solveFor;
  for (const key of ['w', 'h1', 'h2'] as const) if (key !== k && !(finite(LABEL[key], s[key]) > 0)) throw new Error(`${LABEL[key]} must be > 0.`);
  if (k !== 'er' && !(finite('εr', s.er) >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(finite('Copper thickness', s.t) >= 0)) throw new Error('Copper thickness must be ≥ 0.');
  if (!(finite('Frequency', s.f) > 0)) throw new Error('Frequency must be > 0.');
  if (s.dual && !(finite('Gap to layer 2', s.d) > 0)) throw new Error('The gap to layer 2 must be > 0.');
  if (k !== 'z0' && !(finite('Target Z₀', s.z0) > 0)) throw new Error('Target Z₀ must be > 0.');
  const thickCheck = (x: AsymState) => {
    const near = Math.min(x.h1, x.h2);
    const tb = x.t / (2 * near + x.t);
    if (tb > TB_MAX + 1e-12)
      return `The copper (T = ${fLen(x.t)}) is too thick for the nearer dielectric (${fLen(near)}): T/(2H + T) = ${tb.toFixed(3)} is above ${TB_MAX}, where Cohn’s thin-strip thickness correction stops being meaningful. Use a 2-D field solver.`;
    if (x.dual && !(x.h2 > x.d + x.t)) return `The second layer does not fit: H₂ = ${fLen(x.h2)} must exceed D + T = ${fLen(x.d + x.t)} (gap plus the layer-2 copper). Increase H₂ or reduce D.`;
    return null;
  };
  if (k !== 'h1' && k !== 'h2') {
    const e = thickCheck(s);
    if (e) throw new Error(e);
  }

  if (k !== 'z0') {
    const r = solveKey(s, k, s.z0);
    if (!r.ok) {
      const fx = (x: number) => (k === 'er' ? String(+x.toPrecision(4)) : fLen(x));
      const span = Number.isFinite(r.zLo) && Number.isFinite(r.zHi) ? ` (${SYM[k]} = ${fx(r.lo)} … ${fx(r.hi)} gives ${fZ(Math.min(r.zLo, r.zHi))} … ${fZ(Math.max(r.zLo, r.zHi))})` : '';
      const lever: Record<Key, string> = {
        w: 'Z₀ falls as the trace widens: change H₁, H₂ or the target.',
        h1: 'Z₀ rises with the dielectric below and is capped by the plane above: change W or H₂.',
        h2: 'Z₀ rises with the dielectric above and is capped by the plane below: change W or H₁.',
        er: 'Z₀ falls as εr rises: change the geometry or the target.',
      };
      return fail(`No ${SYM[k]} gives Z₀ = ${fZ(s.z0)}${span}. ${lever[k]}`, s);
    }
    s[k] = r.x;
    const e = thickCheck(s);
    if (e) return fail(e, s);
  }
  const o = offsetStripline(s.w, s.t, s.h1, s.h2, s.er);
  if (k === 'z0') {
    if (!(o.z0 >= 1 && o.z0 <= 500)) return fail(`Z₀ = ${fZ(o.z0)} is outside 1–500 Ω, the range of the impedance field: check the dimensions and units.`, s);
    s.z0 = o.z0;
  }
  return report(s, o);
}

function report(s: AsymState, o: OffsetResult): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const w = rep.warnings;
  const notes = rep.notes;
  const near = Math.min(s.h1, s.h2);
  const far = Math.max(s.h1, s.h2);
  const ratio = far / near;

  // ── validity
  const tb = s.t / (2 * near + s.t);
  if (tb > 0.2) w.push(`T/(2H_near + T) = ${tb.toFixed(3)} > 0.2: well beyond the ≲ 0.1 Cohn states for his thickness correction. Against 2-D field solutions it still holds to −1.1 … +0.6 % up to 0.45; allow for that or confirm with a field solver.`);
  else if (tb > 0.1) w.push(`T/(2H_near + T) = ${tb.toFixed(3)} > 0.1: beyond the range Cohn states for his thickness correction (field-checked to ±0.5 % up to 0.26). Confirm critical designs with a field solver.`);
  if (ratio > 5.5) w.push(`H₂/H₁ = ${(s.h2 / s.h1).toPrecision(3)}: the trace is far off-centre, beyond the field-solver check (ratio ≤ 5). It is approaching a microstrip under a distant plane; confirm with a field solver.`);
  if (s.w < near / 4) w.push(`W is under a quarter of the nearer dielectric (${fLen(near)}): narrower than the field-solver check, where the model already reads up to 2.6 % high. Use a field solver.`);
  else if (s.w < near) notes.push(`W < H_near: model error grows for narrow traces, up to +1.2 % (thin copper) or +2.6 % (thick copper, far-off-centre) at W = H_near/4.`);
  const fPP = C0 / (2 * o.b * Math.sqrt(s.er));
  if (s.f > fPP) w.push(`f is above ${si(fPP, 'Hz', 3)}, where the plane spacing reaches half a wavelength and parallel-plate modes can propagate. Stitch the planes with ground vias.`);

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k === 'w' || k === 'h1' || k === 'h2') prim.push(item(k, LABEL[k], s[k], 'm', fLen(s[k]), { symbol: SYM[k], solved: true, primary: true, note: `${mil(s[k])}${k === 'w' ? ` · W/H₁ = ${(s.w / s.h1).toPrecision(3)}` : ''}` }));
  if (k === 'er') prim.push(item('er', LABEL.er, s.er, '', s.er.toPrecision(4), { symbol: 'εᵣ', solved: true, primary: true }));
  const band = s.w >= near ? '+0 … +0.9 %' : '+0 … +2.6 %';
  prim.push(item('z0', 'Characteristic impedance', o.z0, 'Ω', fZ(o.z0), { symbol: 'Z₀', primary: true, solved: k === 'z0', note: `${k === 'z0' ? 'offset stripline' : 'target'} · model ${band}` }));
  const tpd = Math.sqrt(s.er) / C0;
  prim.push(item('tpd', 'Propagation delay', tpd, 's/m', `${si(tpd * 1e-3, 's', 4)}/mm`, { symbol: 't_pd', primary: true, note: `${si(tpd * 0.0254, 's', 4)}/in · εeff = εr` }));
  prim.push(item('lowerShare', 'Return current in lower plane', o.lowerShare, '', `${(o.lowerShare * 100).toFixed(0)} %`, { symbol: 'I_ret,1', primary: true, note: `upper plane ${((1 - o.lowerShare) * 100).toFixed(0)} % (image estimate)` }));

  const vp = C0 / Math.sqrt(s.er);
  const lam = vp / s.f;
  const sec: ResultItem[] = [
    item('zSym', 'Same trace centred (same b)', o.zSym, 'Ω', fZ(o.zSym), { symbol: 'Z₀,sym', group: 'Comparison', note: 'symmetric stripline with H₁ = H₂' }),
    item('zImage', 'Image-method estimate', o.zImage, 'Ω', fZ(o.zImage), { symbol: 'Z₀,img', group: 'Comparison', note: 'Wadell eq. 3.6.3.22 alone: reads high off-centre' }),
    item('b', 'Plane spacing', o.b, 'm', `${fLen(o.b)} (${mil(o.b)})`, { symbol: 'b', group: 'Geometry', note: 'b = H₁ + T + H₂' }),
    item('ratio', 'Offset ratio', s.h2 / s.h1, '', (s.h2 / s.h1).toPrecision(4), { symbol: 'H₂/H₁', group: 'Geometry' }),
    item('lPer', 'Inductance per length', (o.z0 * Math.sqrt(s.er)) / C0, 'H/m', `${si(((o.z0 * Math.sqrt(s.er)) / C0) * 1e-3, 'H', 4)}/mm`, { symbol: "L'", group: 'Line' }),
    item('cPer', 'Capacitance per length', Math.sqrt(s.er) / (C0 * o.z0), 'F/m', `${si((Math.sqrt(s.er) / (C0 * o.z0)) * 1e-3, 'F', 4)}/mm`, { symbol: "C'", group: 'Line' }),
    item('lambdaG', `Wavelength at ${si(s.f, 'Hz')}`, lam, 'm', fLen(lam), { symbol: 'λ_g', group: 'Line' }),
  ];
  if (s.dual) {
    const l2 = layer2(s);
    const z2 = offsetStripline(s.w, s.t, l2.above, l2.below, s.er).z0;
    const s2 = { ...s, h1: l2.above, h2: l2.below };
    const w2 = solveKey(s2, 'w', s.z0);
    sec.push(
      item('z0L2', 'Layer-2 trace, same W', z2, 'Ω', fZ(z2), { symbol: 'Z₀,2', group: 'Second signal layer', note: `${fLen(l2.above)} to its near plane, ${fLen(l2.below)} to the far one` }),
      w2.ok
        ? item('wL2', `Layer-2 width for ${fZ(s.z0)}`, w2.x, 'm', `${fLen(w2.x)} (${mil(w2.x)})`, { symbol: 'W₂', group: 'Second signal layer' })
        : { key: 'wL2', label: `Layer-2 width for ${fZ(s.z0)}`, value: null, unit: 'm', display: 'not reachable', symbol: 'W₂', group: 'Second signal layer' },
    );
    notes.push(`Dual stripline: the second layer’s traces are assumed to cross at right angles, so this trace’s impedance ignores them. Where two traces run parallel on the two layers they couple broadside (gap D = ${fLen(s.d)}); see the Broadside-Coupled Pair page.`);
  }
  rep.results = [...prim, ...sec];
  rep.summary = `H₂/H₁ ${(s.h2 / s.h1).toPrecision(3)} · W/H₁ ${(s.w / s.h1).toPrecision(3)} · b ${fLen(o.b)} · εr ${+s.er.toPrecision(4)}`;
  notes.push(
    'Model: one trace of a broadside pair in odd mode is an offset stripline, so Cohn’s (1960) broadside formula gives it; the narrow-strip deficit of that formula is restored from Cohn’s exact centred stripline, and copper thickness is added by the image method (Wadell §3.6.3). Checked against a 2-D field solution: +0 … +0.9 % for W ≥ H_near.',
    'Homogeneous dielectric assumed above and below the trace; with different core and prepreg Dk use a field solver or an average weighted towards the nearer layer.',
  );
  rep.details = { ...o, inputs: { w: s.w, t: s.t, h1: s.h1, h2: s.h2, er: s.er } };
  rep.graphs = graphs(s, o);
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: AsymState, o: OffsetResult): GraphSpec[] {
  const near = Math.min(s.h1, s.h2);
  const ws = [...logspace(Math.max(Math.min(near / 5, s.w / 3), 1e-6), Math.min(Math.max(near * 6, s.w * 3), 0.05), 90), s.w].sort((a, b) => a - b);
  const zw = ws.map((x) => offsetStripline(x, s.t, s.h1, s.h2, s.er));
  // trace position at fixed plane spacing: H₁ from its thickness limit to (b − T) minus that limit
  const span = s.h1 + s.h2;
  const hMin = Math.max(s.t > 0 ? (s.t * (1 / TB_MAX - 1)) / 2 : 0, span * 0.03);
  const ps = [...Array.from({ length: 90 }, (_, i) => hMin + ((span - 2 * hMin) * i) / 89), s.h1].sort((a, b) => a - b);
  const zp = ps.map((h1) => offsetStripline(s.w, s.t, h1, span - h1, s.er).z0);
  const target = s.solveFor === 'z0' ? [] : [{ value: s.z0, label: `target ${fZ(s.z0)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }];
  return [
    {
      id: 'z0-vs-w',
      title: 'Z₀ vs width',
      subtitle: `H₁ = ${fLen(s.h1)}, H₂ = ${fLen(s.h2)}`,
      x: { label: 'Trace width W', unit: 'm', log: true },
      y: [{ id: 'z', label: 'Z₀', unit: 'Ω' }],
      series: [
        { label: 'Offset (this trace)', x: ws, y: zw.map((r) => r.z0), axis: 'z', width: 2.4 },
        { label: 'Centred, same b', x: ws, y: zw.map((r) => r.zSym), axis: 'z', width: 1.2, dash: [5, 3], color: '#9a8f7a' },
      ],
      hlines: target,
      vlines: [{ value: s.w, label: `W = ${fLen(s.w)}`, color: '#9a8f7a' }],
      markers: [{ x: s.w, y: o.z0, axis: 'z', label: fZ(o.z0) }],
    },
    {
      id: 'z0-vs-position',
      title: 'Z₀ vs trace position',
      subtitle: `b = ${fLen(o.b)} fixed, W = ${fLen(s.w)}: move the trace between the planes`,
      x: { label: 'Dielectric below H₁', unit: 'm' },
      y: [{ id: 'z', label: 'Z₀', unit: 'Ω' }],
      series: [{ label: 'Z₀', x: ps, y: zp, axis: 'z', width: 2.2 }],
      hlines: target,
      vlines: [
        { value: s.h1, label: `H₁ = ${fLen(s.h1)}`, color: '#9a8f7a' },
        { value: span / 2, label: 'centred', color: '#9a8f7a', dash: [2, 3] },
      ],
      markers: [{ x: s.h1, y: o.z0, axis: 'z', label: fZ(o.z0) }],
    },
  ];
}

export const def: CalcDef<AsymState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Offset stripline as one trace of a broadside pair in odd mode: Cohn (1960) broadside formulas with the narrow-strip deficit restored from Cohn’s exact centred stripline (1954), copper thickness by Wadell’s image method (§3.6.3) with Cohn/Wheeler thick-strip increments. Checked against a 2-D field solution. Solve-for uses bracketed Brent root finding on Z₀(x).',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'z0',
    options: [
      { key: 'z0', label: 'Z₀ from geometry (analysis)' },
      { key: 'w', label: 'Trace width W for a target Z₀' },
      { key: 'h1', label: 'Dielectric below H₁ for a target Z₀' },
      { key: 'h2', label: 'Dielectric above H₂ for a target Z₀' },
      { key: 'er', label: 'εr for a target Z₀' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: 'Dual stripline, 6-layer board: 50 Ω on L3 (solve W)', state: defaults() },
    { id: 'single-offset', label: 'Single offset layer: 0.1 mm core, 0.2 mm prepreg', state: { ...defaults(), dual: false, h1: 0.1e-3, h2: 0.2e-3, t: 35e-6, material: 'FR-4 (generic)', er: 4.4 } },
    { id: 'centred', label: 'Centred check: H₁ = H₂ equals the symmetric stripline', state: { ...defaults(), solveFor: 'z0', dual: false, w: 0.15e-3, h1: 0.2e-3, h2: 0.2e-3, t: 17.5e-6 } },
    { id: 'solve-h2', label: 'Prepreg above for 50 Ω with 0.1 mm traces', state: { ...defaults(), solveFor: 'h2', dual: false, w: 0.1e-3, h1: 0.1e-3, h2: 0.3e-3, t: 17.5e-6 } },
    { id: 'rogers-rf', label: 'RF: 50 Ω offset line in RO4350B, H₂ = 2H₁', state: { ...defaults(), dual: false, h1: 0.254e-3, h2: 0.508e-3, t: 35e-6, material: 'RO4350B', er: 3.66, f: 5e9 } },
  ],
};
