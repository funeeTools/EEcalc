/** Dual stripline — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { TB_MAX } from '../asymmetric-stripline/def';
import { offsetStripline } from '../asymmetric-stripline/model';
import { MATERIALS } from '../controlled-impedance/def';
import { C0 } from '../microstrip/model';
import { type DualResult, dualStripline, parallelRun } from './model';

export const ID = 'pcb/dual-stripline';

export interface DualState {
  /** 'z0' analysis (both impedances from the geometry); otherwise the unknown */
  solveFor: 'z0' | 'w' | 'h1' | 'h2' | 'er';
  z01: number;
  z02: number;
  w1: number;
  w1Unit: string;
  w2: number;
  w2Unit: string;
  t: number;
  tUnit: string;
  h1: number;
  h1Unit: string;
  d: number;
  dUnit: string;
  h2: number;
  h2Unit: string;
  material: string;
  er: number;
  f: number;
  fUnit: string;
}

/** 8-layer board, inner pair L3/L4: plane, 0.125 mm core, L3, 0.25 mm prepreg, L4, 0.125 mm core, plane (½ oz). */
export const defaults = (): DualState => ({
  solveFor: 'w',
  z01: 50,
  z02: 50,
  w1: 0.12e-3,
  w1Unit: 'mm',
  w2: 0.12e-3,
  w2Unit: 'mm',
  t: 17.5e-6,
  tUnit: 'µm',
  h1: 0.125e-3,
  h1Unit: 'mm',
  d: 0.25e-3,
  dUnit: 'mm',
  h2: 0.125e-3,
  h2Unit: 'mm',
  material: 'FR-4 prepreg (~1 GHz)',
  er: 4.2,
  f: 1e9,
  fUnit: 'GHz',
});

const inMode = (...m: DualState['solveFor'][]) => (_: unknown, r: Record<string, unknown>) => m.includes(r.solveFor as DualState['solveFor']);
const solvedW = inMode('w');

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Traces',
    note: 'Two signal layers between one pair of planes, routed at right angles. Click ◎ to choose the unknown.',
    fields: [
      {
        kind: 'number', key: 'z01', symbol: 'Z₀₁', label: 'Layer-1 impedance', unit: 'Ω', solvable: true, min: 1, max: 500,
        solvedWhen: inMode('z0', 'h2'), onSolve: (_s, r) => (r.solveFor = 'z0'), onUnsolve: (_s, r) => (r.solveFor = 'w'),
        help: 'Target for a trace on layer 1 when solving the widths, H₁ or εr; computed otherwise. Click ◎ while it is computed to make it a target (solves the widths).',
      },
      {
        kind: 'number', key: 'z02', symbol: 'Z₀₂', label: 'Layer-2 impedance', unit: 'Ω', solvable: true, min: 1, max: 500,
        solvedWhen: inMode('z0', 'h1', 'er'), onSolve: (_s, r) => (r.solveFor = 'z0'), onUnsolve: (_s, r) => (r.solveFor = 'w'),
        help: 'Target for a trace on layer 2 when solving the widths or H₂; computed otherwise.',
      },
      {
        kind: 'number', key: 'w1', symbol: 'W₁', label: 'Layer-1 width', units: U_LEN_PCB, unitKey: 'w1Unit', solvable: true, min: 1e-6, max: 0.05,
        solvedWhen: solvedW, onSolve: (_s, r) => (r.solveFor = 'w'), onUnsolve: (_s, r) => (r.solveFor = 'z0'),
        help: 'Width of a trace on layer 1 (the layer H₁ above the lower plane). Solving for the width solves both layers, each for its own target.',
      },
      {
        kind: 'number', key: 'w2', symbol: 'W₂', label: 'Layer-2 width', units: U_LEN_PCB, unitKey: 'w2Unit', solvable: true, min: 1e-6, max: 0.05,
        solvedWhen: solvedW, onSolve: (_s, r) => (r.solveFor = 'w'), onUnsolve: (_s, r) => (r.solveFor = 'z0'),
        help: 'Width of a trace on layer 2 (the layer H₂ below the upper plane). Usually the same as W₁ when the stack is symmetric.',
      },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 0.5e-3, help: 'Both signal layers. Inner layers are usually ½ oz ≈ 17.5 µm or 1 oz ≈ 35 µm (choose "oz" to type ounces).' },
    ],
  },
  {
    kind: 'section',
    title: 'Stack-up, bottom to top',
    note: 'Dielectric thicknesses between copper faces.',
    fields: [
      { kind: 'number', key: 'h1', symbol: 'H₁', label: 'Plane to layer 1', units: U_LEN_PCB, unitKey: 'h1Unit', solvable: true, min: 1e-6, max: 0.05, help: 'Dielectric from the lower plane to the bottom of the layer-1 traces (usually the core they are etched on).' },
      { kind: 'number', key: 'd', symbol: 'D', label: 'Layer 1 to layer 2', units: U_LEN_PCB, unitKey: 'dUnit', min: 1e-6, max: 0.05, help: 'Dielectric between the top of the layer-1 copper and the bottom of the layer-2 copper (usually a prepreg). The larger it is, the less two parallel traces on the layers couple.' },
      { kind: 'number', key: 'h2', symbol: 'H₂', label: 'Layer 2 to plane', units: U_LEN_PCB, unitKey: 'h2Unit', solvable: true, min: 1e-6, max: 0.05, help: 'Dielectric from the top of the layer-2 traces to the upper plane.' },
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
        help: 'Fills εr with a typical design value. Core and prepreg usually differ slightly; this model assumes one permittivity throughout.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', solvable: true, min: 1, max: 100, help: 'Relative permittivity of all the dielectric between the planes (homogeneous: εeff = εr). Solved for the target Z₀₁.' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency',
    fields: [{ kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets the wavelength result and the parallel-plate mode check; the impedances are static (TEM).' }],
  },
];

type Key = 'w1' | 'w2' | 'h1' | 'h2' | 'er';
type Layer = 1 | 2;
const LABEL: Record<Key, string> = { w1: 'Layer-1 width', w2: 'Layer-2 width', h1: 'Plane to layer 1', h2: 'Layer 2 to plane', er: 'Permittivity' };
const SYM: Record<Key, string> = { w1: 'W₁', w2: 'W₂', h1: 'H₁', h2: 'H₂', er: 'εr' };
const DIM_MIN = 1e-6;
const DIM_MAX = 0.05;

const fLen = (m: number) => si(m, 'm', 4);
const fZ = (z: number) => si(z, 'Ω', 4);
const mil = (m: number) => `${(m / 25.4e-6).toFixed(2)} mil`;
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

const dualOf = (s: DualState) => dualStripline(s.w1, s.w2, s.t, s.h1, s.d, s.h2, s.er);
/** Impedance of one layer’s trace (only that layer is evaluated: cheap for root finding). */
function zLayer(s: DualState, layer: Layer): number {
  return layer === 1 ? offsetStripline(s.w1, s.t, s.h1, s.d + s.t + s.h2, s.er).z0 : offsetStripline(s.w2, s.t, s.d + s.t + s.h1, s.h2, s.er).z0;
}

/** Nearer dielectric of each layer’s trace. */
const nearOf = (s: DualState, layer: Layer) => (layer === 1 ? Math.min(s.h1, s.d + s.t + s.h2) : Math.min(s.h2, s.d + s.t + s.h1));

/** Search range: field limits, and the copper limit T/(2H + T) ≤ TB_MAX on the height being solved. */
function rangeFor(s: DualState, k: Key): { lo: number; hi: number } {
  if (k === 'er') return { lo: 1, hi: 100 };
  if (k === 'w1' || k === 'w2') return { lo: DIM_MIN, hi: DIM_MAX };
  const tMin = s.t > 0 ? (s.t * (1 / TB_MAX - 1)) / 2 : 0;
  return { lo: Math.max(DIM_MIN, tMin), hi: DIM_MAX };
}

const layerOf = (k: Key): Layer => (k === 'w2' || k === 'h2' ? 2 : 1);

export function solveKey(s: DualState, k: Key, target: number): { ok: true; x: number } | { ok: false; lo: number; hi: number; zLo: number; zHi: number } {
  const r = rangeFor(s, k);
  const L = layerOf(k);
  const g = (x: number) => zLayer({ ...s, [k]: x }, L);
  if (!(r.hi > r.lo)) return { ok: false, ...r, zLo: NaN, zHi: NaN };
  const inv = invert(g, target, { lo: r.lo, hi: r.hi, log: true, samples: 120 });
  for (const x of inv.roots) if (Math.abs(g(x) / target - 1) < 1e-9) return { ok: true, x };
  return { ok: false, ...r, zLo: g(r.lo), zHi: g(r.hi) };
}

export function compute(st: DualState): CalcReport {
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
 *  • "unreadable" with a unit the user picked (a solved 25 µm height shown in inches): the inch entry has no
 *    prefixed forms for the core to move to; the value is right and the user chose the unit.
 */
function fail(msg: string, s: DualState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

/** Copper too thick for the nearer dielectric of either layer (Cohn’s thin-strip correction checked to 0.45). */
function thickCheck(s: DualState): string | null {
  for (const L of [1, 2] as const) {
    const near = nearOf(s, L);
    const tb = s.t / (2 * near + s.t);
    if (tb > TB_MAX + 1e-12)
      return `The copper (T = ${fLen(s.t)}) is too thick for the dielectric next to layer ${L} (${fLen(near)}): T/(2H + T) = ${tb.toFixed(3)} is above ${TB_MAX}, where Cohn’s thin-strip thickness correction stops being meaningful. Use a thicker dielectric or a 2-D field solver.`;
  }
  return null;
}

function run(st: DualState): CalcReport {
  const s: DualState = { ...st };
  const k = s.solveFor;
  for (const key of ['w1', 'w2', 'h1', 'h2'] as const) if (!(k === 'w' && (key === 'w1' || key === 'w2')) && key !== k && !(finite(LABEL[key], s[key]) > 0)) throw new Error(`${LABEL[key]} must be > 0.`);
  if (!(finite('Layer 1 to layer 2', s.d) > 0)) throw new Error('The dielectric between the layers must be > 0.');
  if (k !== 'er' && !(finite('εr', s.er) >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(finite('Copper thickness', s.t) >= 0)) throw new Error('Copper thickness must be ≥ 0.');
  if (!(finite('Frequency', s.f) > 0)) throw new Error('Frequency must be > 0.');
  if ((k === 'w' || k === 'h1' || k === 'er') && !(finite('Target Z₀₁', s.z01) > 0)) throw new Error('Target Z₀₁ must be > 0.');
  if ((k === 'w' || k === 'h2') && !(finite('Target Z₀₂', s.z02) > 0)) throw new Error('Target Z₀₂ must be > 0.');
  if (k !== 'h1' && k !== 'h2') {
    const e = thickCheck(s);
    if (e) throw new Error(e);
  }

  const keys: Key[] = k === 'w' ? ['w1', 'w2'] : k === 'z0' ? [] : [k];
  for (const key of keys) {
    const target = layerOf(key) === 1 ? s.z01 : s.z02;
    const r = solveKey(s, key, target);
    if (!r.ok) {
      const fx = (x: number) => (key === 'er' ? String(+x.toPrecision(4)) : fLen(x));
      const span = Number.isFinite(r.zLo) && Number.isFinite(r.zHi) ? ` (${SYM[key]} = ${fx(r.lo)} … ${fx(r.hi)} gives ${fZ(Math.min(r.zLo, r.zHi))} … ${fZ(Math.max(r.zLo, r.zHi))})` : '';
      const lever: Record<Key, string> = {
        w1: 'Z₀ falls as the trace widens: change H₁, D or the target.',
        w2: 'Z₀ falls as the trace widens: change H₂, D or the target.',
        h1: 'Z₀ rises with H₁ but is capped by the far plane: change W₁ or the target.',
        h2: 'Z₀ rises with H₂ but is capped by the far plane: change W₂ or the target.',
        er: 'Z₀ falls as εr rises: change the geometry or the target.',
      };
      return fail(`No ${SYM[key]} gives Z₀${layerOf(key) === 1 ? '₁' : '₂'} = ${fZ(target)}${span}. ${lever[key]}`, s);
    }
    s[key] = r.x;
  }
  if (k === 'h1' || k === 'h2') {
    const e = thickCheck(s);
    if (e) return fail(e, s);
  }
  const o = dualOf(s);
  // write back the computed impedances (never outside the field range)
  const computed: [1 | 2, number][] = [];
  if (k === 'z0' || k === 'h2') computed.push([1, o.l1.z0]);
  if (k === 'z0' || k === 'h1' || k === 'er') computed.push([2, o.l2.z0]);
  for (const [L, z] of computed) {
    if (!(z >= 1 && z <= 500)) return fail(`Z₀${L === 1 ? '₁' : '₂'} = ${fZ(z)} is outside 1–500 Ω, the range of the impedance fields: check the dimensions and units.`, s);
    if (L === 1) s.z01 = z;
    else s.z02 = z;
  }
  return report(s, o);
}

function report(s: DualState, o: DualResult): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const w = rep.warnings;
  const notes = rep.notes;

  // ── validity, per layer
  for (const L of [1, 2] as const) {
    const near = nearOf(s, L);
    const far = L === 1 ? o.far1 : o.far2;
    const wid = L === 1 ? s.w1 : s.w2;
    const tb = s.t / (2 * near + s.t);
    if (tb > 0.2) w.push(`Layer ${L}: T/(2H + T) = ${tb.toFixed(3)} > 0.2, well beyond the ≲ 0.1 Cohn states for his thickness correction (field-checked to −1.1 … +0.6 % up to 0.45). Allow for that or confirm with a field solver.`);
    else if (tb > 0.1) w.push(`Layer ${L}: T/(2H + T) = ${tb.toFixed(3)} > 0.1, beyond the range Cohn states for his thickness correction (field-checked to ±0.5 % up to 0.26). Confirm critical designs with a field solver.`);
    if (far / near > 5) w.push(`Layer ${L}: the far plane is ${(far / near).toPrecision(3)}× further than the near one, beyond the offset-stripline field check (≤ 5). The trace behaves almost like a microstrip under a distant plane; confirm with a field solver.`);
    if (wid < near / 4) w.push(`Layer ${L}: W is under a quarter of the nearer dielectric (${fLen(near)}), narrower than the field check, where the model already reads up to 2.6 % high. Use a field solver.`);
  }
  const fPP = C0 / (2 * o.b * Math.sqrt(s.er));
  if (s.f > fPP) w.push(`f is above ${si(fPP, 'Hz', 3)}, where the plane spacing reaches half a wavelength and parallel-plate modes can propagate. Stitch the planes with ground vias.`);

  // ── parallel runs: broadside coupling
  const wPar = (s.w1 + s.w2) / 2;
  const par = parallelRun(wPar, s.t, s.h1, s.d, s.h2, s.er);
  const sameW = Math.abs(s.w1 - s.w2) <= 0.01 * wPar;
  const estimate = !par.exact || !sameW;
  if (!par.valid) notes.push(`Parallel runs on the two layers still couple broadside, but with W this small against D = ${fLen(s.d)} the broadside model is out of range, so no k_b is given; use a field solver if they must run parallel.`);
  else if (par.kb > 0.05)
    w.push(`Where a layer-1 and a layer-2 trace run parallel on top of each other they couple broadside: k_b ≈ ${pct(par.kb)} over D = ${fLen(s.d)}. Route the two layers at right angles (this page assumes it), keep parallel overlaps short or offset them sideways; to design an intentional stacked pair use the Broadside-Coupled Pair page.`);
  else notes.push(`Parallel runs on the two layers would couple broadside with k_b ≈ ${pct(par.kb)} (gap D = ${fLen(s.d)}); see the Broadside-Coupled Pair page for stacked pairs.`);
  if (par.valid && par.loose) notes.push('W < D/2: loosely coupled, where Cohn’s broadside even-mode formula reads low, so k_b is an underestimate.');

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  const near1 = nearOf(s, 1);
  const near2 = nearOf(s, 2);
  if (k === 'w') {
    prim.push(item('w1', 'Layer-1 width', s.w1, 'm', fLen(s.w1), { symbol: 'W₁', solved: true, primary: true, note: `${mil(s.w1)} · W/H₁ = ${(s.w1 / s.h1).toPrecision(3)}` }));
    prim.push(item('w2', 'Layer-2 width', s.w2, 'm', fLen(s.w2), { symbol: 'W₂', solved: true, primary: true, note: `${mil(s.w2)} · W/H₂ = ${(s.w2 / s.h2).toPrecision(3)}` }));
  }
  if (k === 'h1' || k === 'h2') prim.push(item(k, LABEL[k], s[k], 'm', fLen(s[k]), { symbol: SYM[k], solved: true, primary: true, note: `${mil(s[k])} · for Z₀${layerOf(k) === 1 ? '₁' : '₂'}` }));
  if (k === 'er') prim.push(item('er', LABEL.er, s.er, '', s.er.toPrecision(4), { symbol: 'εᵣ', solved: true, primary: true, note: 'for Z₀₁' }));
  const band = (wid: number, near: number) => (wid >= near ? '+0 … +0.9 %' : '+0 … +2.6 %');
  const c1 = k === 'z0' || k === 'h2';
  const c2 = k === 'z0' || k === 'h1' || k === 'er';
  prim.push(item('z01', 'Layer-1 impedance', o.l1.z0, 'Ω', fZ(o.l1.z0), { symbol: 'Z₀₁', primary: true, solved: c1, note: `${c1 ? '' : 'target · '}model ${band(s.w1, near1)}` }));
  prim.push(item('z02', 'Layer-2 impedance', o.l2.z0, 'Ω', fZ(o.l2.z0), { symbol: 'Z₀₂', primary: true, solved: c2, note: `${c2 ? '' : 'target · '}model ${band(s.w2, near2)}` }));
  const tpd = Math.sqrt(s.er) / C0;
  prim.push(item('tpd', 'Propagation delay', tpd, 's/m', `${si(tpd * 1e-3, 's', 4)}/mm`, { symbol: 't_pd', primary: true, note: `${si(tpd * 0.0254, 's', 4)}/in · both layers (εeff = εr)` }));

  const vp = C0 / Math.sqrt(s.er);
  const lam = vp / s.f;
  const sec: ResultItem[] = [
    item('b', 'Plane spacing', o.b, 'm', `${fLen(o.b)} (${mil(o.b)})`, { symbol: 'b', group: 'Stack-up', note: 'b = H₁ + T + D + T + H₂' }),
    item('layerPitch', 'Layer 1 to layer 2, centre to centre', s.d + s.t, 'm', fLen(s.d + s.t), { symbol: 'D + T', group: 'Stack-up' }),
    item('far1', 'Layer 1: to the far plane', o.far1, 'm', fLen(o.far1), { symbol: 'H_far,1', group: 'Stack-up', note: 'D + T + H₂' }),
    item('far2', 'Layer 2: to the far plane', o.far2, 'm', fLen(o.far2), { symbol: 'H_far,2', group: 'Stack-up', note: 'D + T + H₁' }),
    item('share1', 'Layer 1: return current in the lower plane', o.l1.lowerShare, '', `${(o.l1.lowerShare * 100).toFixed(0)} %`, { group: 'Return current', note: 'image estimate' }),
    item('share2', 'Layer 2: return current in the upper plane', 1 - o.l2.lowerShare, '', `${((1 - o.l2.lowerShare) * 100).toFixed(0)} %`, { group: 'Return current', note: 'image estimate' }),
    item('vp', 'Phase velocity', vp, 'm/s', `${si(vp, 'm/s', 4)} (${(100 / Math.sqrt(s.er)).toFixed(1)} % of c)`, { symbol: 'v_p', group: 'Line' }),
    item('lambdaG', `Wavelength at ${si(s.f, 'Hz')}`, lam, 'm', fLen(lam), { symbol: 'λ_g', group: 'Line' }),
    item('fPP', 'Parallel-plate mode onset', fPP, 'Hz', si(fPP, 'Hz', 3), { symbol: 'f_PP', group: 'Line', note: 'plane spacing = λ/2' }),
  ];
  const gPar = 'If traces on the two layers run parallel';
  if (par.valid)
    sec.push(
      item('kbPar', 'Broadside coupling', par.kb, '', pct(par.kb), { symbol: 'k_b', group: gPar, tone: par.kb > 0.05 ? 'warn' : undefined, note: estimate ? `estimate: symmetric pair, H = ${fLen(par.h)}, W = ${fLen(wPar)}` : '(Ze − Zo)/(Ze + Zo)' }),
      item('zoPar', 'Odd-mode impedance', par.zo, 'Ω', fZ(par.zo), { symbol: 'Z₀ₒ', group: gPar }),
      item('zePar', 'Even-mode impedance', par.ze, 'Ω', fZ(par.ze), { symbol: 'Z₀ₑ', group: gPar }),
      item('zdiffPar', 'Differential impedance', par.zdiff, 'Ω', fZ(par.zdiff), { symbol: 'Z_diff', group: gPar }),
    );
  else sec.push({ key: 'kbPar', label: 'Broadside coupling', value: null, unit: '', display: 'not computed', symbol: 'k_b', group: gPar, note: 'W ≪ D: beyond the broadside model’s range' });
  rep.results = [...prim, ...sec];
  rep.summary = `Layer 1 ${fZ(o.l1.z0)} · layer 2 ${fZ(o.l2.z0)} · b ${fLen(o.b)} · εr ${+s.er.toPrecision(4)}`;
  notes.push(
    'Each trace is an offset stripline with the other signal layer counted as dielectric, which holds when the layers are routed at right angles: the crossings are short and add only a little capacitance at each one.',
    'Offset-stripline model as on the Asymmetric Stripline page (Cohn’s broadside odd mode with the narrow-strip and copper-thickness corrections); checked against a 2-D field solution: +0 … +0.9 % for W ≥ the nearer dielectric.',
    'Homogeneous dielectric assumed; with different core and prepreg Dk use a field solver or an average weighted towards each trace’s nearer layer.',
  );
  if (estimate) notes.push('The parallel-run figures assume a symmetric stack (the broadside model); here they use the mean H and W, so read them as an estimate.');
  rep.details = { l1: o.l1, l2: o.l2, parallel: par, inputs: { w1: s.w1, w2: s.w2, t: s.t, h1: s.h1, d: s.d, h2: s.h2, er: s.er } };
  rep.graphs = graphs(s, o);
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: DualState, o: DualResult): GraphSpec[] {
  const near = Math.min(s.h1, s.h2);
  const wMin = Math.max(Math.min(near / 5, s.w1 / 3, s.w2 / 3), 1e-6);
  const wMax = Math.min(Math.max(near * 6, s.w1 * 3, s.w2 * 3), 0.05);
  const ws = [...logspace(wMin, wMax, 90), s.w1, s.w2].sort((a, b) => a - b);
  const z1 = ws.map((x) => offsetStripline(x, s.t, s.h1, o.far1, s.er).z0);
  const z2 = ws.map((x) => offsetStripline(x, s.t, o.far2, s.h2, s.er).z0);
  const k = s.solveFor;
  const target = [
    ...(k === 'w' || k === 'h1' || k === 'er' ? [{ value: s.z01, label: `target L1 ${fZ(s.z01)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }] : []),
    ...((k === 'w' || k === 'h2') && Math.abs(s.z02 - s.z01) > 1e-9 * s.z01 ? [{ value: s.z02, label: `target L2 ${fZ(s.z02)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }] : []),
  ];
  // layer spacing D: both impedances and the broadside coupling of a parallel run
  const dMin = Math.max(Math.min(s.d / 4, near / 4), 1e-6);
  const dMax = Math.min(Math.max(s.d * 4, near * 6), 0.05);
  const ds = [...logspace(dMin, dMax, 80), s.d].sort((a, b) => a - b);
  const wPar = (s.w1 + s.w2) / 2;
  const dz1 = ds.map((d) => offsetStripline(s.w1, s.t, s.h1, d + s.t + s.h2, s.er).z0);
  const dz2 = ds.map((d) => offsetStripline(s.w2, s.t, d + s.t + s.h1, s.h2, s.er).z0);
  // k_b only where the broadside model holds (W ≥ D/4, k_b > 0)
  const dk = ds.filter((d) => parallelRun(wPar, s.t, s.h1, d, s.h2, s.er).valid);
  const kb = dk.map((d) => parallelRun(wPar, s.t, s.h1, d, s.h2, s.er).kb * 100);
  const now = parallelRun(wPar, s.t, s.h1, s.d, s.h2, s.er);
  return [
    {
      id: 'z0-vs-w',
      title: 'Z₀ vs width',
      subtitle: `both layers · H₁ = ${fLen(s.h1)}, D = ${fLen(s.d)}, H₂ = ${fLen(s.h2)}`,
      x: { label: 'Trace width W', unit: 'm', log: true },
      y: [{ id: 'z', label: 'Z₀', unit: 'Ω' }],
      series: [
        { label: 'Layer 1', x: ws, y: z1, axis: 'z', width: 2.4 },
        { label: 'Layer 2', x: ws, y: z2, axis: 'z', width: 2.4, dash: [6, 3] },
      ],
      hlines: target,
      markers: [
        { x: s.w1, y: o.l1.z0, axis: 'z', label: `L1 ${fZ(o.l1.z0)}` },
        { x: s.w2, y: o.l2.z0, axis: 'z', label: `L2 ${fZ(o.l2.z0)}` },
      ],
    },
    {
      id: 'vs-layer-gap',
      title: 'Layer spacing D',
      subtitle: `W₁ = ${fLen(s.w1)}, W₂ = ${fLen(s.w2)}: impedance, and the coupling if traces ran parallel (where the broadside model holds)`,
      x: { label: 'Layer 1 to layer 2, D', unit: 'm', log: true },
      y: [
        { id: 'z', label: 'Z₀', unit: 'Ω' },
        { id: 'k', label: 'Broadside k_b (parallel run)', unit: '%', side: 'right', includeZero: true },
      ],
      series: [
        { label: 'Z₀ layer 1', x: ds, y: dz1, axis: 'z', width: 2.2 },
        { label: 'Z₀ layer 2', x: ds, y: dz2, axis: 'z', width: 2.2, dash: [6, 3] },
        ...(dk.length > 1 ? [{ label: 'k_b if parallel', x: dk, y: kb, axis: 'k', width: 1.8, color: '#6b5b95' }] : []),
      ],
      hlines: [...target, { value: 5, label: 'k_b 5 %', axis: 'k', color: '#8b1e1e', dash: [4, 3] }],
      vlines: [{ value: s.d, label: `D = ${fLen(s.d)}`, color: '#9a8f7a' }],
      markers: now.valid ? [{ x: s.d, y: now.kb * 100, axis: 'k', label: `${(now.kb * 100).toFixed(1)} %` }] : [{ x: s.d, y: o.l1.z0, axis: 'z', label: `L1 ${fZ(o.l1.z0)}` }],
    },
  ];
}

export const def: CalcDef<DualState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Each layer’s trace as an offset stripline with the other signal layer counted as dielectric (orthogonal routing): Cohn (1960) broadside odd-mode formula with the narrow-strip deficit restored from Cohn’s exact centred stripline (1954) and Wadell’s image-method thickness increments (§3.6.3), as on the Asymmetric Stripline page; parallel-run coupling from Cohn’s broadside-coupled pair. Solve-for uses bracketed Brent root finding.',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'z0',
    options: [
      { key: 'z0', label: 'Z₀₁, Z₀₂ from geometry (analysis)' },
      { key: 'w', label: 'Widths W₁, W₂ for targets Z₀₁, Z₀₂' },
      { key: 'h1', label: 'H₁ for a target Z₀₁' },
      { key: 'h2', label: 'H₂ for a target Z₀₂' },
      { key: 'er', label: 'εr for a target Z₀₁' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: '8-layer board, L3/L4 pair: 50 Ω on both layers (solve widths)', state: defaults() },
    { id: 'asym', label: 'Unequal cores (0.1 / 0.2 mm): each layer needs its own width', state: { ...defaults(), h1: 0.1e-3, h2: 0.2e-3, d: 0.2e-3 } },
    { id: 'analysis', label: 'Same width on both layers of an unequal stack: check both Z₀', state: { ...defaults(), solveFor: 'z0', w1: 0.127e-3, w2: 0.127e-3, h1: 0.1e-3, d: 0.3e-3, h2: 0.15e-3 } },
    { id: 'thin-gap', label: 'Thin prepreg between the layers: strong broadside coupling', state: { ...defaults(), solveFor: 'z0', w1: 0.1e-3, w2: 0.1e-3, d: 0.075e-3, h1: 0.1e-3, h2: 0.1e-3 } },
    { id: 'solve-h2', label: 'Core above layer 2 for 50 Ω with 0.1 mm traces', state: { ...defaults(), solveFor: 'h2', w1: 0.1e-3, w2: 0.1e-3, h1: 0.1e-3, h2: 0.15e-3, d: 0.2e-3 } },
    { id: 'rogers', label: 'RF: 50 Ω dual stripline in RO4350B, 1 oz', state: { ...defaults(), t: 35e-6, h1: 0.254e-3, d: 0.508e-3, h2: 0.254e-3, w1: 0.25e-3, w2: 0.25e-3, material: 'RO4350B', er: 3.66, f: 5e9 } },
  ],
};
