/** Edge-coupled symmetric stripline — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { C0, TB_MAX, accuracyBand, coupledStripline, type CoupledResult } from './model';

export const ID = 'pcb/edge-coupled-internal-symmetric';

/** Laminate presets: design Dk from manufacturer data sheets (same list as the microstrip page). */
export const MATERIALS: Record<string, number | null> = {
  Custom: null,
  'FR-4 (generic)': 4.4,
  'FR-4 (stripline, ~1 GHz)': 4.0,
  RO4350B: 3.66,
  RO4003C: 3.55,
  RO3003: 3.0,
  'RT/duroid 5880': 2.2,
  'Polyimide (Kapton HN)': 3.4,
  'PTFE (unfilled)': 2.1,
};

export interface StriplineDiffState {
  solveFor: 'zdiff' | 'w' | 's' | 'b';
  zdiff: number;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
  b: number;
  bUnit: string;
  t: number;
  tUnit: string;
  material: string;
  er: number;
  f: number;
  fUnit: string;
}

export const defaults = (): StriplineDiffState => ({
  solveFor: 'w',
  zdiff: 100,
  w: 0.1e-3,
  wUnit: 'mm',
  s: 0.2e-3,
  sUnit: 'mm',
  b: 0.4e-3,
  bUnit: 'mm',
  t: 17.5e-6,
  tUnit: 'µm',
  material: 'FR-4 (stripline, ~1 GHz)',
  er: 4.0,
  f: 5e9,
  fUnit: 'GHz',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Pair geometry',
    note: 'Both traces centred between two ground planes. Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'zdiff', symbol: 'Z_diff', label: 'Diff. impedance', unit: 'Ω', solvable: true, min: 1, max: 1000, help: 'Target Zdiff = 2·Z₀ₒ when solving for W, S or b; otherwise the calculated result.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: 1e-6, max: 0.05 },
      { kind: 'number', key: 's', symbol: 'S', label: 'Edge gap', units: U_LEN_PCB, unitKey: 'sUnit', solvable: true, min: 1e-6, max: 0.05, help: 'Spacing between the facing edges of the two traces (not centre-to-centre pitch).' },
      { kind: 'number', key: 'b', symbol: 'b', label: 'Plane spacing', units: U_LEN_PCB, unitKey: 'bUnit', solvable: true, min: 1e-6, max: 0.05, help: 'Total dielectric between the two reference planes, including the copper layer of the traces. The traces sit half-way.' },
      { kind: 'number', key: 't', symbol: 't', label: 'Thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 1e-3, help: 'Copper thickness of the traces. ½ oz ≈ 17.5 µm, 1 oz ≈ 35 µm (choose "oz" to type ounces). 0 gives Cohn’s exact zero-thickness result.' },
    ],
  },
  {
    kind: 'section',
    title: 'Dielectric',
    fields: [
      {
        kind: 'select',
        key: 'material',
        label: 'Material preset',
        options: Object.keys(MATERIALS),
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m != null) s.er = m;
        },
        help: 'Fills εr with a typical design value. Use your fabricator’s stack-up Dk for the prepreg/core actually used; FR-4 glass styles range about 3.6–4.6.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 100, help: 'Relative permittivity (Dk). Assumed the same above and below the traces (homogeneous), so the line is pure TEM and εeff = εr.' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency',
    fields: [{ kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Only sets the wavelength results and the parallel-plate mode check; the impedances are static (TEM).' }],
  },
];

const LABEL: Record<StriplineDiffState['solveFor'], string> = { zdiff: 'Differential impedance', w: 'Trace width', s: 'Edge-to-edge gap', b: 'Plane-to-plane spacing' };
const SYM: Record<StriplineDiffState['solveFor'], string> = { zdiff: 'Z_diff', w: 'W', s: 'S', b: 'b' };

/** Model range: W/b and S/b up to 100 (exponentials stay finite); W, S down to 10⁻⁴·b. */
const RATIO_MAX = 100;
const RATIO_MIN = 1e-4;
/** Field limits of W, S, b and Zdiff: a solved value is never written outside them. */
const DIM_MIN = 1e-6;
const DIM_MAX = 0.05;
const Z_MIN = 1;
const Z_MAX = 1000;

const fLen = (m: number) => si(m, 'm', 4);
const fZ = (z: number) => si(z, 'Ω', 4);
const mil = (m: number) => `${(m / 25.4e-6).toFixed(2)} mil`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: StriplineDiffState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function fail(msg: string, s: StriplineDiffState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

/** Search range for the unknown, from the other dimensions (keeps W/b and S/b inside the model range). */
function rangeFor(s: StriplineDiffState): { lo: number; hi: number } {
  switch (s.solveFor) {
    // never search outside the input fields' own limits (1 µm … 50 mm), nor beyond t/b = TB_MAX
    case 'w':
    case 's':
      return { lo: Math.max(RATIO_MIN * s.b, DIM_MIN), hi: Math.min(RATIO_MAX * s.b, DIM_MAX) };
    default:
      return { lo: Math.max(s.t / TB_MAX, Math.max(s.w, s.s) / RATIO_MAX, DIM_MIN), hi: Math.min(Math.min(s.w, s.s) / RATIO_MIN, DIM_MAX) };
  }
}

const zdOf = (s: StriplineDiffState, key: 'w' | 's' | 'b', x: number) => coupledStripline(key === 'w' ? x : s.w, key === 's' ? x : s.s, key === 'b' ? x : s.b, s.t, s.er).zdiff;

/**
 * Solve Zdiff(x) = target; the S = 5t branch switch is a small step, so a bracket that only spans the step is rejected.
 * Far apart (S ≫ b) Zdiff is flat at 2·Z₀ to machine precision, so solving S for a gap that wide returns the first
 * S where it reaches that value, not the gap entered: any wider gap gives the same Zdiff (expected round-trip miss).
 */
export function solveDim(s: StriplineDiffState, key: 'w' | 's' | 'b', target: number): { ok: true; x: number } | { ok: false; closest: number; closestZ: number; lo: number; hi: number } {
  const r = rangeFor({ ...s, solveFor: key });
  if (!(r.hi > r.lo)) return { ok: false, closest: NaN, closestZ: NaN, lo: r.lo, hi: r.hi };
  const g = (x: number) => zdOf(s, key, x);
  const inv = invert(g, target, { ...r, log: true, samples: 240 });
  for (const x of inv.roots) if (Math.abs(g(x) / target - 1) < 1e-9) return { ok: true, x };
  return { ok: false, closest: inv.closest, closestZ: inv.closestValue, lo: r.lo, hi: r.hi };
}

function run(st: StriplineDiffState): CalcReport {
  const s: StriplineDiffState = { ...st };
  const k = s.solveFor;
  const t = finite('Copper thickness', s.t);
  const er = finite('εr', s.er);
  const f = finite('Frequency', s.f);
  if (t < 0) throw new Error('Copper thickness must be ≥ 0.');
  if (!(er >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(f > 0)) throw new Error('Frequency must be > 0.');
  for (const key of ['w', 's', 'b'] as const) {
    if (key === k) continue;
    if (!(finite(LABEL[key], s[key]) > 0)) throw new Error(`${LABEL[key]} must be > 0.`);
  }
  if (k !== 'zdiff' && !(finite('Target Zdiff', s.zdiff) > 0)) throw new Error('Target Zdiff must be > 0.');
  if (k !== 'b' && !(s.b > t)) throw new Error(`The copper (t = ${fLen(t)}) must be thinner than the plane spacing b = ${fLen(s.b)}.`);
  if (k !== 'b' && t / s.b > TB_MAX)
    throw new Error(`t/b = ${(t / s.b).toFixed(3)} is above ${TB_MAX}: Cohn’s thickness correction is a thin-strip approximation (stated for t/b ≲ 0.1) and has only been checked against a field solver up to t/b = ${TB_MAX}; towards t = b it gives meaningless results. Use a 2-D field solver for copper this thick.`);
  const ratioCheck = (key: 'w' | 's', v: number) => {
    if (v / s.b > RATIO_MAX) throw new Error(`${LABEL[key]} is more than ${RATIO_MAX}× the plane spacing: outside the model range. Check the units.`);
    if (v / s.b < RATIO_MIN) throw new Error(`${LABEL[key]} is less than ${RATIO_MIN}× the plane spacing: outside the model range. Check the units.`);
  };
  if (k !== 'b') for (const key of ['w', 's'] as const) if (key !== k) ratioCheck(key, s[key]);
  if (k === 'b') {
    if (Math.max(s.w, s.s) / Math.min(s.w, s.s) > RATIO_MAX / RATIO_MIN) throw new Error('W and S differ by more than 10⁶×: outside the model range.');
  }

  // ── solve
  let step: { target: number; zBelow: number; zAt: number } | null = null;
  if (k !== 'zdiff') {
    const r = solveDim(s, k, s.zdiff);
    if (!r.ok && k === 's' && t > 0) {
      const zBelow = zdOf(s, 's', 5 * t * (1 - 1e-9));
      const zAt = zdOf(s, 's', 5 * t);
      // The target lies in the model's step at S = 5t (a few %, inside the stated model error). No gap
      // gives it exactly, but S = 5t is the answer to within the model's accuracy: give it, from the side
      // nearer the target, with a warning instead of a red error. Changing εr or W by a preset or an
      // example can land a target here, so a NO SOLUTION would be a red error after a switch.
      // (A round trip from this state does not return the target exactly: the mismatch is the step.)
      if (s.zdiff > Math.min(zBelow, zAt) && s.zdiff < Math.max(zBelow, zAt)) {
        step = { target: s.zdiff, zBelow, zAt };
        s.s = Math.abs(zBelow - s.zdiff) <= Math.abs(zAt - s.zdiff) ? 5 * t * (1 - 1e-9) : 5 * t;
      }
    }
    if (step) {
      // answer set above
    } else if (!r.ok) {
      if (k === 's' && Number.isFinite(r.closestZ) && Math.abs(r.closestZ / s.zdiff - 1) < 1e-6)
        return fail(`Zdiff = ${fZ(s.zdiff)} is the uncoupled limit 2·Z₀ of these traces: beyond S ≈ ${fLen(r.closest)} the partner no longer changes Zdiff, so the gap is not determined. Any wide gap works; choose it for crosstalk instead.`, s);
      const how =
        Number.isFinite(r.closestZ) && r.closestZ > 0
          ? ` The closest is ${fZ(r.closestZ)} at ${SYM[k]} = ${fLen(r.closest)}.`
          : '';
      const lever =
        k === 'w'
          ? 'Zdiff falls as W grows and is limited by S and b: change S or b.'
          : k === 's'
            ? 'Zdiff rises with S towards 2·Z₀ of a single trace and cannot exceed it: widen the plane spacing or narrow the traces.'
            : 'Zdiff rises with b: change W or S.';
      return fail(`No ${SYM[k]} between ${fLen(r.lo)} and ${fLen(r.hi)} gives Zdiff = ${fZ(s.zdiff)}.${how} ${lever}`, s);
    } else s[k] = r.x;
  }
  if (!(s.b > t)) return fail(`The solved plane spacing would not exceed the copper thickness t = ${fLen(t)}.`, s);
  const o = coupledStripline(s.w, s.s, s.b, t, er);
  if (k === 'zdiff') {
    if (!(o.zdiff >= Z_MIN && o.zdiff <= Z_MAX)) return fail(`Zdiff = ${fZ(o.zdiff)} is outside ${Z_MIN}–${Z_MAX} Ω, the range of the impedance field: check the dimensions and units.`, s);
    s.zdiff = o.zdiff;
  }
  const rep = report(s, o, step != null);
  if (step) {
    rep.status = { text: 'IN MODEL STEP', tone: 'warn' };
    rep.warnings.unshift(`Zdiff = ${fZ(step.target)} falls in the step at S = 5t = ${fLen(5 * t)}, where Cohn’s closely-spaced and wide-gap formulas meet (${fZ(step.zBelow)} just below, ${fZ(step.zAt)} at 5t). S ≈ ${fLen(5 * t)} is the answer to within the model error; this model gives ${fZ(o.zdiff)} there. Confirm with a field solver, or change W for a target off the step.`);
  }
  rep.details = { ...rep.details, step };
  return rep;
}

function report(s: StriplineDiffState, o: CoupledResult, inStep = false): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const warnings = rep.warnings;
  const notes = rep.notes;
  const tb = s.t / s.b;

  // ── validity (Cohn 1955, Cohn 1954, Wheeler 1978) and plausibility
  const band = accuracyBand(s.w, s.s, s.b, s.t);
  const pct = (r: [number, number]) => `${r[0] >= 0 ? '+' : '−'}${Math.abs(r[0])} … ${r[1] >= 0 ? '+' : '−'}${Math.abs(r[1])} %`;
  if (s.t > 0 && tb > 0.1) warnings.push(`t/b = ${tb.toFixed(3)} > 0.1: beyond the range Cohn states for his thickness correction. The page accepts up to t/b = ${TB_MAX}, the limit of its field-solver check; confirm critical designs with a 2-D field solver.`);
  if (band && !band.checked) warnings.push(`W/b = ${(s.w / s.b).toFixed(3)} is narrower than the field-solver check (W/b ≥ 0.15): the thickness correction’s error is unknown here and grows as traces narrow. Use a 2-D field solver.`);
  else if (band && Math.max(Math.abs(band.zdiff[0]), Math.abs(band.zdiff[1]), Math.abs(band.zcm[0])) > 2.5)
    warnings.push(`Accuracy for this geometry (${band.group === 'narrow' ? 'W/(b−t) < 0.35, ' : ''}${s.s < 5 * s.t ? 'S < 5t' : s.s < 8 * s.t ? '5t ≤ S < 8t' : 'S ≥ 8t'}): against a 2-D field solution Cohn’s thickness correction reads Zdiff ${pct(band.zdiff)} and Zcm ${pct(band.zcm)}. Allow for that in the tolerance or confirm with a field solver.`);
  if (s.t > 0 && o.branch === 'close') notes.push(`S < 5t: odd mode from Cohn’s closely-spaced formula (22), which adds the side-wall capacitance between the traces. It does not join the S ≥ 5t formula at S = 5t, so Zdiff steps there (see the Coupling vs gap graph).`);
  if (s.t > 0 && s.t > s.s) warnings.push('The gap is narrower than the copper is thick: etching will not reproduce this geometry, and side-wall coupling dominates. Use a field solver.');
  const fPP = C0 / (2 * s.b * Math.sqrt(s.er));
  if (s.f > fPP) warnings.push(`f is above ${si(fPP, 'Hz', 3)}, where b reaches half a wavelength and parallel-plate modes can propagate between the planes. Stitch the planes with ground vias and keep b < λ/2.`);
  const weak = Math.abs(o.zdiff / (2 * o.zs) - 1);
  if (weak < 0.02) notes.push(`Loosely coupled: Zdiff is within ${(weak * 100).toFixed(1)} % of 2·Z₀ of a single trace, so the gap hardly matters. A tighter gap saves routing space for the same Zdiff.`);
  if (o.zdiff < 70 || o.zdiff > 130) notes.push(`Zdiff = ${fZ(o.zdiff)} is outside the 85–100 Ω used by most serial links (USB 90 Ω, PCIe 85 Ω, Ethernet/LVDS 100 Ω).`);

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k === 'w' || k === 's' || k === 'b') {
    const v = s[k];
    prim.push(item(k, LABEL[k], v, 'm', fLen(v), { symbol: SYM[k], solved: true, primary: true, note: `${mil(v)} · ${SYM[k]}/b = ${(v / s.b).toPrecision(4)}` }));
  }
  const bandNote = (r: [number, number] | undefined) => (band ? (band.checked ? ` · model error ${pct(r!)}` : ' · error not checked') : ' · exact (t = 0)');
  prim.push(item('zdiff', 'Differential impedance', o.zdiff, 'Ω', fZ(o.zdiff), { symbol: 'Z_diff', primary: true, solved: k === 'zdiff', note: `${k === 'zdiff' ? '2·Z₀ₒ' : inStep ? `model value at S = 5t; target ${fZ(s.zdiff)}` : 'target, 2·Z₀ₒ'}${bandNote(band?.zdiff)}` }));
  prim.push(item('zcm', 'Common-mode impedance', o.zcm, 'Ω', fZ(o.zcm), { symbol: 'Z_cm', primary: true, note: `Z₀ₑ/2${bandNote(band?.zcm)}` }));
  prim.push(item('zodd', 'Odd-mode impedance', o.zo, 'Ω', fZ(o.zo), { symbol: 'Z₀ₒ', primary: true }));
  prim.push(item('zeven', 'Even-mode impedance', o.ze, 'Ω', fZ(o.ze), { symbol: 'Z₀ₑ', primary: true }));
  const vp = C0 / Math.sqrt(s.er);
  const lam = vp / s.f;
  const sec: ResultItem[] = [
    item('zsingle', 'Single trace alone', o.zs, 'Ω', fZ(o.zs), { symbol: 'Z₀', group: 'Coupling', note: 'same trace without its partner' }),
    item('kb', 'Coupling coefficient', o.kb, '', o.kb.toFixed(4), { symbol: 'k', group: 'Coupling', note: o.kb > 0 ? `(Z₀ₑ−Z₀ₒ)/(Z₀ₑ+Z₀ₒ) = ${(20 * Math.log10(o.kb)).toFixed(1)} dB backward coupling` : '(Z₀ₑ−Z₀ₒ)/(Z₀ₑ+Z₀ₒ): no measurable coupling at this gap' }),
    item('zgeo', 'Coupler impedance √(Z₀ₑZ₀ₒ)', o.z0, 'Ω', fZ(o.z0), { symbol: '√(Z₀ₑZ₀ₒ)', group: 'Coupling' }),
    item('zdiffFrac', 'Zdiff vs uncoupled', o.zdiff / (2 * o.zs) - 1, '', `${((o.zdiff / (2 * o.zs) - 1) * 100).toFixed(2)} %`, { symbol: 'Z_diff/2Z₀', group: 'Coupling', note: 'how much the partner lowers Zdiff' }),
    item('tpd', 'Propagation delay', Math.sqrt(s.er) / C0, 's/m', `${si((Math.sqrt(s.er) / C0) * 1e-3, 's', 4)}/mm`, { symbol: 't_pd', group: 'Wave', note: `${si((Math.sqrt(s.er) / C0) * 0.0254, 's', 4)}/in · same for both modes` }),
    item('vp', 'Phase velocity', vp, 'm/s', `${si(vp, 'm/s', 4)} (${(100 / Math.sqrt(s.er)).toFixed(1)} % c)`, { symbol: 'v_p', group: 'Wave' }),
    item('lambdaG', `Wavelength at ${si(s.f, 'Hz')}`, lam, 'm', fLen(lam), { symbol: 'λ_g', group: 'Wave' }),
    item('quarterWave', 'Quarter wavelength', lam / 4, 'm', fLen(lam / 4), { symbol: 'λ_g/4', group: 'Wave' }),
    item('wOverB', 'Width / plane spacing', s.w / s.b, '', (s.w / s.b).toPrecision(4), { symbol: 'W/b', group: 'Ratios' }),
    item('sOverB', 'Gap / plane spacing', s.s / s.b, '', (s.s / s.b).toPrecision(4), { symbol: 'S/b', group: 'Ratios' }),
    item('tOverB', 'Thickness / plane spacing', tb, '', tb.toPrecision(3), { symbol: 't/b', group: 'Ratios', tone: tb > 0.1 ? 'warn' : '' }),
    item('pitch', 'Centre-to-centre pitch', s.w + s.s, 'm', fLen(s.w + s.s), { symbol: 'p', group: 'Ratios' }),
  ];
  rep.results = [...prim, ...sec];
  rep.summary = `W/b ${(s.w / s.b).toPrecision(3)} · S/b ${(s.s / s.b).toPrecision(3)} · t/b ${tb.toPrecision(2)} · εr ${s.er} · k = ${o.kb.toFixed(3)}`;
  notes.push(
    s.t > 0
      ? `Zero-thickness even/odd impedances from Cohn’s exact conformal mapping (1955); copper thickness by Cohn’s fringing-capacitance correction with Wheeler’s (1978) thick single strip. “Model error” is the band measured against a 2-D field solution over 140 cross-sections (t/b 0.05–0.2, W/b 0.15–1, S = 1.5t–12t); see Accuracy in the theory.`
      : 't = 0: Cohn’s conformal-mapping result is exact for infinitely thin traces.',
    'Homogeneous dielectric: both modes travel at c/√εr, so there is no far-end crosstalk and no mode-conversion skew from the cross-section itself.',
    'Not modelled: trapezoidal etch, different Dk in core and prepreg, resin-rich layers around the traces, and an off-centre trace layer.',
  );
  rep.details = { ...o, fParallelPlate: fPP, inputs: { w: s.w, s: s.s, b: s.b, t: s.t, er: s.er } };
  rep.graphs = graphs(s, o);
  rep.tables = [targetsTable(s)];
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: StriplineDiffState, o: CoupledResult): GraphSpec[] {
  const wLo = Math.max(Math.min(0.05 * s.b, s.w / 3), RATIO_MIN * s.b);
  const wHi = Math.min(Math.max(3 * s.b, s.w * 3), RATIO_MAX * s.b);
  const ws = [...logspace(wLo, wHi, 140), s.w].sort((a, b) => a - b);
  const zw = ws.map((w) => coupledStripline(w, s.s, s.b, s.t, s.er));
  const sLo = Math.max(Math.min(0.05 * s.b, s.s / 3), RATIO_MIN * s.b);
  const sHi = Math.min(Math.max(4 * s.b, s.s * 3), RATIO_MAX * s.b);
  const ss = [...logspace(sLo, sHi, 140), s.s, ...(s.t > 0 && 5 * s.t > sLo && 5 * s.t < sHi ? [5 * s.t * (1 - 1e-9), 5 * s.t] : [])].sort((a, b) => a - b);
  const zs = ss.map((g) => coupledStripline(s.w, g, s.b, s.t, s.er));
  const target = s.solveFor === 'zdiff' ? [] : [{ value: s.zdiff, label: `target ${fZ(s.zdiff)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }];
  return [
    {
      id: 'zdiff-vs-w',
      title: 'Zdiff vs width',
      x: { label: 'Trace width W', unit: 'm', log: true },
      y: [{ id: 'z', label: 'Impedance', unit: 'Ω' }],
      series: [
        { label: 'Z_diff', x: ws, y: zw.map((r) => r.zdiff), axis: 'z', width: 2.2 },
        { label: '2·Z₀ single', x: ws, y: zw.map((r) => 2 * r.zs), axis: 'z', color: '#9a8f7a', width: 1.2, dash: [5, 3] },
        { label: 'Z_cm', x: ws, y: zw.map((r) => r.zcm), axis: 'z', color: '#c47b17', width: 1.4 },
      ],
      hlines: target,
      vlines: [{ value: s.w, label: `W = ${fLen(s.w)}`, color: '#9a8f7a' }],
      markers: [{ x: s.w, y: o.zdiff, axis: 'z', label: fZ(o.zdiff) }],
    },
    {
      id: 'modes-vs-s',
      title: 'Coupling vs gap',
      subtitle: `W = ${fLen(s.w)}, b = ${fLen(s.b)}`,
      x: { label: 'Edge gap S', unit: 'm', log: true },
      y: [
        { id: 'z', label: 'Impedance', unit: 'Ω' },
        { id: 'k', label: 'Coupling k', unit: '%', side: 'right', includeZero: true },
      ],
      series: [
        { label: 'Z₀ₑ', x: ss, y: zs.map((r) => r.ze), axis: 'z', color: '#c47b17', width: 1.8 },
        { label: 'Z₀ₒ', x: ss, y: zs.map((r) => r.zo), axis: 'z', color: '#1f4e5f', width: 2.2 },
        { label: 'Z₀ single', x: [ss[0], ss[ss.length - 1]], y: [o.zs, o.zs], axis: 'z', color: '#9a8f7a', width: 1, dash: [4, 3] },
        { label: 'k (%)', x: ss, y: zs.map((r) => 100 * r.kb), axis: 'k', color: '#6b5b95', width: 1.4, dash: [6, 3] },
      ],
      vlines: [{ value: s.s, label: `S = ${fLen(s.s)}`, color: '#9a8f7a' }, ...(s.t > 0 && 5 * s.t > sLo && 5 * s.t < sHi ? [{ value: 5 * s.t, label: 'S = 5t', color: '#9a8f7a', dash: [2, 3] }] : [])],
      markers: [{ x: s.s, y: o.zo, axis: 'z', label: fZ(o.zo) }],
    },
  ];
}

/** Widths for the common serial-link targets at the present S, b, t, εr. */
function targetsTable(s: StriplineDiffState): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  for (const [name, z] of [['PCIe / DDR5', 85], ['USB 2/3', 90], ['Ethernet, LVDS, HDMI', 100]] as const) {
    const r = solveDim(s, 'w', z);
    if (r.ok) {
      const o = coupledStripline(r.x, s.s, s.b, s.t, s.er);
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
    note: `At S = ${fLen(s.s)}, b = ${fLen(s.b)}, t = ${fLen(s.t)}, εr = ${s.er}. Interface impedances are nominal; check the specification for tolerance.`,
  };
}

export const def: CalcDef<StriplineDiffState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Cohn (1955) exact zero-thickness even/odd impedances via complete elliptic integrals (AGM), with Cohn’s finite-thickness correction (eqs. 18, 20, 22; fringing capacitance from Cohn 1954) using Wheeler’s (1978) thick single stripline. Zdiff = 2Z₀ₒ, Zcm = Z₀ₑ/2. Solve-for uses bracketed Brent root finding on Zdiff(x).',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'zdiff',
    options: [
      { key: 'zdiff', label: 'Zdiff from geometry (analysis)' },
      { key: 'w', label: 'Trace width W for a target Zdiff' },
      { key: 's', label: 'Gap S for a target Zdiff' },
      { key: 'b', label: 'Plane spacing b for a target Zdiff' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: '100 Ω pair, b = 0.4 mm FR-4 (solve W)', state: defaults() },
    { id: 'usb-90', label: 'USB 90 Ω, b = 0.5 mm FR-4 (solve W)', state: { solveFor: 'w', zdiff: 90, s: 0.2e-3, b: 0.5e-3, t: 17.5e-6, material: 'FR-4 (generic)', er: 4.4, f: 5e9 } },
    { id: 'pcie-85', label: 'PCIe 85 Ω: gap for 0.15 mm traces', state: { solveFor: 's', zdiff: 85, w: 0.15e-3, b: 0.5e-3, t: 17.5e-6, material: 'FR-4 (generic)', er: 4.4, f: 8e9 } },
    { id: 'cohn-thin', label: 'Cohn exact: t = 0, W = S = b/2 (air)', state: { solveFor: 'zdiff', w: 1e-3, s: 1e-3, b: 2e-3, t: 0, material: 'Custom', er: 1, f: 1e9 } },
    { id: 'analyse-rf', label: 'Analyse: W 150 µm, S 200 µm, b 600 µm, 1 oz', state: { solveFor: 'zdiff', w: 150e-6, s: 200e-6, b: 600e-6, t: 35e-6, material: 'Custom', er: 4.2, f: 10e9 } },
    { id: 'thick-close', label: 'Thick copper, tight gap (S < 5t, t/b > 0.1)', state: { solveFor: 'zdiff', w: 0.15e-3, s: 0.1e-3, b: 0.3e-3, t: 35e-6, material: 'RO4350B', er: 3.66, f: 10e9 } },
  ],
};
