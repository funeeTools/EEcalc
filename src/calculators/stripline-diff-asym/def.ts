/** Edge-coupled asymmetric (offset) stripline pair — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { MATERIALS } from '../controlled-impedance/def';
import { C0 } from '../microstrip/model';
import { TB_MAX, coupledStripline } from '../stripline-diff/model';
import { type AsymPairResult, accuracyBand, asymPair } from './model';

export const ID = 'pcb/edge-coupled-internal-asymmetric';

export interface AsymPairState {
  solveFor: 'zdiff' | 'w' | 's' | 'h1' | 'h2';
  zdiff: number;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
  h1: number;
  h1Unit: string;
  h2: number;
  h2Unit: string;
  t: number;
  tUnit: string;
  material: string;
  er: number;
  f: number;
  fUnit: string;
}

/** 100 Ω pair on L3 of a 6-layer board: 0.125 mm core below, 0.2 mm prepreg + L4 + 0.125 mm core above (½ oz). */
export const defaults = (): AsymPairState => ({
  solveFor: 'w',
  zdiff: 100,
  w: 0.1e-3,
  wUnit: 'mm',
  s: 0.15e-3,
  sUnit: 'mm',
  h1: 0.125e-3,
  h1Unit: 'mm',
  h2: 0.3425e-3,
  h2Unit: 'mm',
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
    note: 'Both traces on one layer, off-centre between two planes. Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'zdiff', symbol: 'Z_diff', label: 'Diff. impedance', unit: 'Ω', solvable: true, min: 1, max: 1000, help: 'Target Zdiff = 2·Z₀ₒ when solving for W, S, H₁ or H₂; otherwise the calculated result.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: 1e-6, max: 0.05 },
      { kind: 'number', key: 's', symbol: 'S', label: 'Edge gap', units: U_LEN_PCB, unitKey: 'sUnit', solvable: true, min: 1e-6, max: 0.05, help: 'Spacing between the facing edges of the two traces (not the centre-to-centre pitch).' },
      { kind: 'number', key: 'h1', symbol: 'H₁', label: 'Dielectric below', units: U_LEN_PCB, unitKey: 'h1Unit', solvable: true, min: 1e-6, max: 0.05, help: 'From the bottom of the traces to the plane below (usually the core they are etched on).' },
      { kind: 'number', key: 'h2', symbol: 'H₂', label: 'Dielectric above', units: U_LEN_PCB, unitKey: 'h2Unit', solvable: true, min: 1e-6, max: 0.05, help: 'From the top of the traces to the plane above, including any other signal layer in between (counted as dielectric).' },
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
        help: 'Fills εr with a typical design value. Core and prepreg usually differ slightly; this model assumes one permittivity above and below the traces.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 100, help: 'Relative permittivity of the dielectric between the planes (homogeneous: the line is pure TEM and εeff = εr).' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency',
    fields: [{ kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets the wavelength results and the parallel-plate mode check; the impedances are static (TEM).' }],
  },
];

type Key = Exclude<AsymPairState['solveFor'], 'zdiff'>;
const LABEL: Record<AsymPairState['solveFor'], string> = { zdiff: 'Differential impedance', w: 'Trace width', s: 'Edge gap', h1: 'Dielectric below', h2: 'Dielectric above' };
const SYM: Record<AsymPairState['solveFor'], string> = { zdiff: 'Z_diff', w: 'W', s: 'S', h1: 'H₁', h2: 'H₂' };
/** Cohn’s coupled-line exponentials stay finite for W/b, S/b in 1e-4 … 100 (checked on b = 2H₁ + T and 2H₂ + T, which bracket every spacing the model uses). */
const RATIO_MAX = 100;
const RATIO_MIN = 1e-4;
const DIM_MIN = 1e-6;
const DIM_MAX = 0.05;

const fLen = (m: number) => si(m, 'm', 4);
const fZ = (z: number) => si(z, 'Ω', 4);
const mil = (m: number) => `${(m / 25.4e-6).toFixed(2)} mil`;
const pm = (b: [number, number]) => `${b[0] > 0 ? '+' : b[0] < 0 ? '−' : ''}${Math.abs(b[0])} … ${b[1] > 0 ? '+' : b[1] < 0 ? '−' : ''}${Math.abs(b[1])} %`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

const pairOf = (s: AsymPairState) => asymPair(s.w, s.s, s.t, s.h1, s.h2, s.er);

/** Search range of the unknown: field limits, the model’s W/b, S/b range (both 2Hᵢ + T), and t/b ≤ TB_MAX. */
function rangeFor(s: AsymPairState, k: Key): { lo: number; hi: number } {
  const b1 = 2 * s.h1 + s.t;
  const b2 = 2 * s.h2 + s.t;
  if (k === 'w' || k === 's') return { lo: Math.max(DIM_MIN, RATIO_MIN * Math.max(b1, b2)), hi: Math.min(DIM_MAX, RATIO_MAX * Math.min(b1, b2)) };
  // height: 2H + T ≥ T/TB_MAX and within the W, S ratio range
  const bLo = Math.max(s.t / TB_MAX, Math.max(s.w, s.s) / RATIO_MAX);
  const bHi = Math.min(s.w, s.s) / RATIO_MIN;
  return { lo: Math.max(DIM_MIN, (bLo - s.t) / 2), hi: Math.min(DIM_MAX, (bHi - s.t) / 2) };
}

const zdOf = (s: AsymPairState, k: Key, x: number) => asymPair(k === 'w' ? x : s.w, k === 's' ? x : s.s, s.t, k === 'h1' ? x : s.h1, k === 'h2' ? x : s.h2, s.er, true).zdiff;

/** Solve Zdiff(x) = target; a bracket that only spans Cohn’s S = 5T branch step is rejected (see run). */
export function solveKey(s: AsymPairState, k: Key, target: number): { ok: true; x: number } | { ok: false; lo: number; hi: number; closest: number; closestZ: number } {
  const r = rangeFor(s, k);
  if (!(r.hi > r.lo)) return { ok: false, ...r, closest: NaN, closestZ: NaN };
  const g = (x: number) => zdOf(s, k, x);
  const inv = invert(g, target, { ...r, log: true, samples: 100 });
  for (const x of inv.roots) if (Math.abs(g(x) / target - 1) < 1e-9) return { ok: true, x };
  return { ok: false, ...r, closest: inv.closest, closestZ: inv.closestValue };
}

export function compute(st: AsymPairState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness notes (style guide §12.3):
 *  • error-after-edit on a typed number (target ×10, a dimension at its field min/max) is a genuine NO SOLUTION or
 *    out-of-model input; the message says what limits the answer.
 *  • round trip of S in the "IN MODEL STEP" state: the target sits in Cohn’s S = 5T step, so the answer is S = 5T
 *    and a round trip returns the model value there, not the target (same as the edge-coupled stripline page).
 *  • round trip of S far apart (S ≫ b): Zdiff is flat at 2·Z₀ to machine precision, so the first S reaching it
 *    is returned rather than the gap entered (expected).
 */
function fail(msg: string, s: AsymPairState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

/** Why the geometry is outside the model (null when it is inside). */
function geometryError(s: AsymPairState): string | null {
  for (const [h, name] of [[s.h1, 'below'], [s.h2, 'above']] as const) {
    const b = 2 * h + s.t;
    if (s.t / b > TB_MAX + 1e-12)
      return `The copper (T = ${fLen(s.t)}) is too thick for the dielectric ${name} the traces (${fLen(h)}): T/(2H + T) = ${(s.t / b).toFixed(3)} is above ${TB_MAX}, beyond the field-solver check of Cohn’s coupled-strip thickness correction. Use a thicker dielectric, thinner copper or a 2-D field solver.`;
    for (const [v, nm] of [[s.w, 'trace width'], [s.s, 'gap']] as const) {
      if (v / b > RATIO_MAX) return `The ${nm} is more than ${RATIO_MAX}× the dielectric ${name} the traces: outside the model range. Check the units.`;
      if (v / b < RATIO_MIN) return `The ${nm} is less than ${RATIO_MIN}× the dielectric ${name} the traces: outside the model range. Check the units.`;
    }
  }
  return null;
}

function run(st: AsymPairState): CalcReport {
  const s: AsymPairState = { ...st };
  const k = s.solveFor;
  for (const key of ['w', 's', 'h1', 'h2'] as const) if (key !== k && !(finite(LABEL[key], s[key]) > 0)) throw new Error(`${LABEL[key]} must be > 0.`);
  if (!(finite('εr', s.er) >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(finite('Copper thickness', s.t) >= 0)) throw new Error('Copper thickness must be ≥ 0.');
  if (!(finite('Frequency', s.f) > 0)) throw new Error('Frequency must be > 0.');
  if (k !== 'zdiff' && !(finite('Target Zdiff', s.zdiff) > 0)) throw new Error('Target Zdiff must be > 0.');
  if (k === 'zdiff') {
    const e = geometryError(s);
    if (e) throw new Error(e);
  }

  let step: { target: number; zBelow: number; zAt: number } | null = null;
  if (k !== 'zdiff') {
    const r = solveKey(s, k, s.zdiff);
    if (!r.ok && k === 's' && s.t > 0) {
      // Target inside the model's step at S = 5T (Cohn's close-gap and wide-gap odd-mode formulas do not meet):
      // S = 5T is the answer to within the model error, given with a warning (as on the symmetric page).
      const zBelow = zdOf(s, 's', 5 * s.t * (1 - 1e-9));
      const zAt = zdOf(s, 's', 5 * s.t);
      if (s.zdiff > Math.min(zBelow, zAt) && s.zdiff < Math.max(zBelow, zAt)) {
        step = { target: s.zdiff, zBelow, zAt };
        s.s = Math.abs(zBelow - s.zdiff) <= Math.abs(zAt - s.zdiff) ? 5 * s.t * (1 - 1e-9) : 5 * s.t;
      }
    }
    if (!step && !r.ok) {
      if (k === 's' && Number.isFinite(r.closestZ) && Math.abs(r.closestZ / s.zdiff - 1) < 1e-6)
        return fail(`Zdiff = ${fZ(s.zdiff)} is the uncoupled limit 2·Z₀ of these traces: beyond S ≈ ${fLen(r.closest)} the partner no longer changes Zdiff, so the gap is not determined. Any wide gap works; choose it for crosstalk instead.`, s);
      const how = Number.isFinite(r.closestZ) && r.closestZ > 0 ? ` The closest is ${fZ(r.closestZ)} at ${SYM[k]} = ${fLen(r.closest)}.` : '';
      const lever: Record<Key, string> = {
        w: 'Zdiff falls as the traces widen and is limited by S and the heights: change S, H₁ or H₂.',
        s: 'Zdiff rises with S towards 2·Z₀ of one trace and cannot exceed it: narrow the traces or move the planes apart.',
        h1: 'Zdiff rises with H₁ but is capped by the plane above: change W, S or H₂.',
        h2: 'Zdiff rises with H₂ but is capped by the plane below: change W, S or H₁.',
      };
      return fail(`No ${SYM[k]} between ${fLen(r.lo)} and ${fLen(r.hi)} gives Zdiff = ${fZ(s.zdiff)}.${how} ${lever[k]}`, s);
    }
    if (!step && r.ok) s[k] = r.x;
    const e = geometryError(s);
    if (e) return fail(e, s);
  }
  const o = pairOf(s);
  if (k === 'zdiff') {
    if (!(o.zdiff >= 1 && o.zdiff <= 1000)) return fail(`Zdiff = ${fZ(o.zdiff)} is outside 1–1000 Ω, the range of the impedance field: check the dimensions and units.`, s);
    s.zdiff = o.zdiff;
  }
  const rep = report(s, o);
  if (step) {
    rep.status = { text: 'IN MODEL STEP', tone: 'warn' };
    rep.warnings.unshift(`Zdiff = ${fZ(step.target)} falls in the step at S = 5T = ${fLen(5 * s.t)}, where Cohn’s close-gap and wide-gap thickness formulas meet (${fZ(step.zBelow)} just below, ${fZ(step.zAt)} at 5T). S ≈ ${fLen(5 * s.t)} is the answer to within the model error; this model gives ${fZ(o.zdiff)} there. Confirm with a field solver, or change W for a target off the step.`);
    rep.details = { ...rep.details, step };
  }
  return rep;
}

function report(s: AsymPairState, o: AsymPairResult): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const w = rep.warnings;
  const notes = rep.notes;
  const near = Math.min(s.h1, s.h2);
  const far = Math.max(s.h1, s.h2);
  const ratio = far / near;
  const band = accuracyBand(s.w, s.s, s.t, s.h1, s.h2);

  // ── validity
  if (ratio > 5) w.push(`H_far/H_near = ${ratio.toPrecision(3)}: the pair is far off-centre, beyond the field-solver check (≤ 5). At 5 the model already reads Zdiff up to +3.5 % high with thin copper and up to +11 % for narrow traces with S just above 5T, and the error grows further off-centre (+11 % measured at 8). Confirm with a field solver.`);
  if (s.w < near / 4) w.push(`W is under a quarter of the nearer dielectric (${fLen(near)}): narrower than the field-solver check. Use a field solver.`);
  if (s.s < near / 4 || s.s > 4 * near) w.push(`S/H_near = ${(s.s / near).toPrecision(3)} is outside 0.25–4, the range checked against a field solver. ${s.s > 4 * near ? 'The traces are barely coupled: Zdiff ≈ 2·Z₀ of one trace.' : 'Confirm with a field solver.'}`);
  if (s.t > near / 4) w.push(`T = ${fLen(s.t)} is more than a quarter of the nearer dielectric: beyond the field-solver check of the thickness corrections. Confirm with a field solver.`);
  if (s.t > 0 && s.s >= 5 * s.t && s.s < 8 * s.t && s.w < near / 2) w.push(`Narrow traces with S between 5T and 8T: Cohn’s wide-gap thickness formula reads Zdiff ${pm(band.zdiff)} here against a field solver. Confirm with a field solver before ordering.`);
  if (s.t > 0 && s.s < 5 * s.t) notes.push(`S < 5T: odd mode from Cohn’s close-gap formula (eq. 22). It does not join the wide-gap formula at S = 5T, so Zdiff steps there (see the gap graph).`);
  const fPP = C0 / (2 * o.b * Math.sqrt(s.er));
  if (s.f > fPP) w.push(`f is above ${si(fPP, 'Hz', 3)}, where the plane spacing reaches half a wavelength and parallel-plate modes can propagate. Stitch the planes with ground vias.`);

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k !== 'zdiff') prim.push(item(k, LABEL[k], s[k], 'm', fLen(s[k]), { symbol: SYM[k], solved: true, primary: true, note: `${mil(s[k])}${k === 'w' ? ` · W/H_near = ${(s.w / near).toPrecision(3)}` : k === 's' ? ` · pitch ${fLen(s.w + s.s)}` : ''}` }));
  const acc = band.checked ? '' : ' (outside the check)';
  prim.push(item('zdiff', 'Differential impedance', o.zdiff, 'Ω', fZ(o.zdiff), { symbol: 'Z_diff', primary: true, solved: k === 'zdiff', note: `${k === 'zdiff' ? '2·Z₀ₒ' : 'target'} · model ${pm(band.zdiff)}${acc}` }));
  prim.push(item('zcm', 'Common-mode impedance', o.zcm, 'Ω', fZ(o.zcm), { symbol: 'Z_cm', primary: true, note: `Z₀ₑ/2 · model ${pm(band.zcm)}${acc}` }));
  prim.push(item('z0', 'Single trace (uncoupled)', o.zs, 'Ω', fZ(o.zs), { symbol: 'Z₀', primary: true, note: 'offset stripline, S → ∞' }));
  const tpd = Math.sqrt(s.er) / C0;
  prim.push(item('tpd', 'Propagation delay', tpd, 's/m', `${si(tpd * 1e-3, 's', 4)}/mm`, { symbol: 't_pd', primary: true, note: `${si(tpd * 0.0254, 's', 4)}/in · both modes (TEM)` }));

  const lam = C0 / Math.sqrt(s.er) / s.f;
  const sec: ResultItem[] = [
    item('zo', 'Odd-mode impedance', o.zo, 'Ω', fZ(o.zo), { symbol: 'Z₀ₒ', group: 'Modes' }),
    item('ze', 'Even-mode impedance', o.ze, 'Ω', fZ(o.ze), { symbol: 'Z₀ₑ', group: 'Modes' }),
    item('kb', 'Backward coupling', o.kb, '', `${(o.kb * 100).toFixed(2)} %`, { symbol: 'k_b', group: 'Modes', note: '(Z₀ₑ − Z₀ₒ)/(Z₀ₑ + Z₀ₒ)' }),
    item('zdiffSym', 'Same pair centred (same planes)', o.zdiffSym, 'Ω', fZ(o.zdiffSym), { symbol: 'Z_diff,sym', group: 'Comparison', note: 'edge-coupled symmetric stripline, b unchanged' }),
    item('zdiffImage', 'Plain image-method estimate', o.zdiffImage, 'Ω', fZ(o.zdiffImage), { symbol: 'Z_diff,img', group: 'Comparison', note: 'Wadell image method alone: reads high off-centre' }),
    item('bEq', 'Equivalent centred spacing', o.bEq, 'm', fLen(o.bEq), { symbol: 'b_eq', group: 'Comparison', note: 'centred pair coupling like this one' }),
    item('b', 'Plane spacing', o.b, 'm', `${fLen(o.b)} (${mil(o.b)})`, { symbol: 'b', group: 'Geometry', note: 'b = H₁ + T + H₂' }),
    item('ratio', 'Offset ratio', s.h2 / s.h1, '', (s.h2 / s.h1).toPrecision(4), { symbol: 'H₂/H₁', group: 'Geometry' }),
    item('pitch', 'Centre-to-centre pitch', s.w + s.s, 'm', fLen(s.w + s.s), { symbol: 'P', group: 'Geometry' }),
    item('lambdaG', `Wavelength at ${si(s.f, 'Hz')}`, lam, 'm', fLen(lam), { symbol: 'λ_g', group: 'Line' }),
    item('fPP', 'Parallel-plate mode onset', fPP, 'Hz', si(fPP, 'Hz', 3), { symbol: 'f_PP', group: 'Line', note: 'plane spacing = λ/2' }),
  ];
  rep.results = [...prim, ...sec];
  rep.summary = `H₂/H₁ ${(s.h2 / s.h1).toPrecision(3)} · W ${fLen(s.w)} · S ${fLen(s.s)} · b ${fLen(o.b)} · εr ${+s.er.toPrecision(4)}`;
  notes.push(
    `Model: the single trace is the offset stripline of the Asymmetric Stripline page; the pair couples like Cohn’s (1955) centred pair whose single trace has the same capacitance (equivalent plane spacing ${fLen(o.bEq)}). Exact for H₁ = H₂ and as S → ∞; monotonic in every dimension.`,
    `Accuracy against a 2-D field solution on 300 cross-sections: Zdiff ${pm(band.zdiff)}, Zcm ${pm(band.zcm)} for this offset, width and copper group.`,
    'Homogeneous dielectric assumed above and below the traces; with different core and prepreg Dk use a field solver.',
  );
  rep.details = { ...o, band, inputs: { w: s.w, s: s.s, t: s.t, h1: s.h1, h2: s.h2, er: s.er } };
  rep.graphs = graphs(s, o);
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: AsymPairState, o: AsymPairResult): GraphSpec[] {
  const near = Math.min(s.h1, s.h2);
  const target = s.solveFor === 'zdiff' ? [] : [{ value: s.zdiff, label: `target ${fZ(s.zdiff)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }];
  const inRange = (w: number, sp: number, h1: number, h2: number) => !geometryError({ ...s, w, s: sp, h1, h2 });
  // Zdiff vs W
  const ws = [...logspace(Math.max(Math.min(near / 5, s.w / 3), 1e-6), Math.min(Math.max(near * 5, s.w * 3), 0.05), 90), s.w].sort((a, b) => a - b).filter((x) => inRange(x, s.s, s.h1, s.h2));
  const pw = ws.map((x) => asymPair(x, s.s, s.t, s.h1, s.h2, s.er, true));
  const bSym = s.h1 + s.t + s.h2;
  // modes vs S (the step at S = 5T shows as a jump)
  const ss = [...logspace(Math.max(Math.min(near / 5, s.s / 3), 1e-6), Math.min(Math.max(near * 6, s.s * 3), 0.05), 120), s.s].sort((a, b) => a - b).filter((x) => inRange(s.w, x, s.h1, s.h2));
  const ps = ss.map((x) => asymPair(s.w, x, s.t, s.h1, s.h2, s.er, true));
  // trace position between the planes, b fixed
  const span = s.h1 + s.h2;
  const hMin = Math.max((s.t / TB_MAX - s.t) / 2, span * 0.04);
  const hs = [...Array.from({ length: 60 }, (_, i) => hMin + ((span - 2 * hMin) * i) / 59), s.h1].sort((a, b) => a - b).filter((h) => inRange(s.w, s.s, h, span - h));
  const ph = hs.map((h) => asymPair(s.w, s.s, s.t, h, span - h, s.er, true));
  return [
    {
      id: 'zdiff-vs-w',
      title: 'Zdiff vs width',
      subtitle: `S = ${fLen(s.s)}, H₁ = ${fLen(s.h1)}, H₂ = ${fLen(s.h2)}`,
      x: { label: 'Trace width W', unit: 'm', log: true },
      y: [{ id: 'z', label: 'Impedance', unit: 'Ω' }],
      series: [
        { label: 'Z_diff (this pair)', x: ws, y: pw.map((r) => r.zdiff), axis: 'z', width: 2.4 },
        { label: 'Z_diff centred, same b', x: ws, y: ws.map((x) => coupledStripline(x, s.s, bSym, s.t, s.er).zdiff), axis: 'z', width: 1.2, dash: [5, 3], color: '#9a8f7a' },
        { label: 'Z_cm', x: ws, y: pw.map((r) => r.zcm), axis: 'z', width: 1.8, color: '#c47b17' },
      ],
      hlines: target,
      vlines: [{ value: s.w, label: `W = ${fLen(s.w)}`, color: '#9a8f7a' }],
      markers: [{ x: s.w, y: o.zdiff, axis: 'z', label: fZ(o.zdiff) }],
    },
    {
      id: 'modes-vs-s',
      title: 'Coupling vs gap',
      subtitle: `W = ${fLen(s.w)}: Zdiff rises towards 2·Z₀ as the traces part${s.t > 0 ? ` · step at S = 5T = ${fLen(5 * s.t)} (Cohn’s two thickness formulas)` : ''}`,
      x: { label: 'Edge gap S', unit: 'm', log: true },
      y: [
        { id: 'z', label: 'Impedance', unit: 'Ω' },
        { id: 'k', label: 'Coupling k_b', unit: '%', side: 'right', includeZero: true },
      ],
      series: [
        { label: 'Z_diff', x: ss, y: ps.map((r) => r.zdiff), axis: 'z', width: 2.4 },
        { label: '2·Z₀ (uncoupled)', x: ss, y: ss.map(() => 2 * o.zs), axis: 'z', width: 1.2, dash: [5, 3], color: '#9a8f7a' },
        { label: 'k_b', x: ss, y: ps.map((r) => r.kb * 100), axis: 'k', width: 1.8, color: '#c47b17' },
      ],
      hlines: target,
      vlines: [{ value: s.s, label: `S = ${fLen(s.s)}`, color: '#9a8f7a' }],
      markers: [{ x: s.s, y: o.zdiff, axis: 'z', label: fZ(o.zdiff) }],
    },
    {
      id: 'zdiff-vs-position',
      title: 'Zdiff vs pair position',
      subtitle: `b = ${fLen(o.b)} fixed: move the pair between the planes`,
      x: { label: 'Dielectric below H₁', unit: 'm' },
      y: [{ id: 'z', label: 'Impedance', unit: 'Ω' }],
      series: [
        { label: 'Z_diff', x: hs, y: ph.map((r) => r.zdiff), axis: 'z', width: 2.4 },
        { label: 'Z_cm', x: hs, y: ph.map((r) => r.zcm), axis: 'z', width: 1.8, color: '#c47b17' },
      ],
      hlines: target,
      vlines: [
        { value: s.h1, label: `H₁ = ${fLen(s.h1)}`, color: '#9a8f7a' },
        { value: span / 2, label: 'centred', color: '#9a8f7a', dash: [2, 3] },
      ],
      markers: [{ x: s.h1, y: o.zdiff, axis: 'z', label: fZ(o.zdiff) }],
    },
  ];
}

export const def: CalcDef<AsymPairState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Single offset trace from Cohn’s broadside odd-mode formula (1960) with the narrow-strip correction and Wadell’s image-method thickness increments (§3.6.3), as on the Asymmetric Stripline page; the pair’s even and odd modes from Cohn’s coupled stripline (1955, thickness eqs. 18/20/22) at the centred plane spacing that gives the same single-trace capacitance. Checked against a 2-D field solution; stated band per geometry. Solve-for uses bracketed Brent root finding.',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'zdiff',
    options: [
      { key: 'zdiff', label: 'Zdiff from geometry (analysis)' },
      { key: 'w', label: 'Trace width W for a target Zdiff' },
      { key: 's', label: 'Edge gap S for a target Zdiff' },
      { key: 'h1', label: 'Dielectric below H₁ for a target Zdiff' },
      { key: 'h2', label: 'Dielectric above H₂ for a target Zdiff' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: '100 Ω pair on L3 of a 6-layer board (solve W)', state: defaults() },
    { id: 'usb', label: 'USB 90 Ω: 0.1 mm core below, 0.3 mm above (solve S)', state: { ...defaults(), solveFor: 's', zdiff: 90, w: 0.12e-3, s: 0.15e-3, h1: 0.1e-3, h2: 0.3e-3 } },
    { id: 'analysis', label: 'Check a routed pair: 0.1 / 0.15 mm on 0.15 / 0.35 mm FR-4', state: { ...defaults(), solveFor: 'zdiff', w: 0.1e-3, s: 0.15e-3, h1: 0.15e-3, h2: 0.35e-3, material: 'FR-4 (generic)', er: 4.4 } },
    { id: 'centred', label: 'Centred check: H₁ = H₂ equals the symmetric pair', state: { ...defaults(), solveFor: 'zdiff', w: 0.1e-3, s: 0.2e-3, h1: 0.19125e-3, h2: 0.19125e-3, material: 'Custom', er: 4.0 } },
    { id: 'solve-h2', label: '85 Ω PCIe pair: prepreg above for fixed 0.12 / 0.12 mm', state: { ...defaults(), solveFor: 'h2', zdiff: 85, w: 0.12e-3, s: 0.12e-3, h1: 0.1e-3, h2: 0.25e-3 } },
    { id: 'rogers', label: 'RF: 100 Ω pair in RO4350B, 1 oz, H₂ = 2H₁', state: { ...defaults(), t: 35e-6, w: 0.2e-3, s: 0.25e-3, h1: 0.254e-3, h2: 0.508e-3, material: 'RO4350B', er: 3.66, f: 10e9 } },
  ],
};
