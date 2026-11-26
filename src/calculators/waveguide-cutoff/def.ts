/** Rectangular waveguide — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_COND, U_FREQ, U_LEN, withDefault } from '@/core/unitsets';
import {
  C0,
  FILLINGS,
  METALS,
  NP_TO_DB,
  WR_SIZES,
  alphaD,
  cutoffForGuideWavelength,
  freqForGuideWavelength,
  powerCapacityTE10,
  rectAlphaC,
  rectCutoff,
  rectModes,
  rectWave,
  skinDepth,
  surfaceResistance,
  validMode,
  widthForCutoff,
  type ModeType,
  type ModeWave,
  type RectMode,
} from './model';

export const ID = 'rf/waveguide-cutoff';
const INCH = 0.0254;

export type SolveKey = 'fc' | 'a' | 'f' | 'aLg';

export interface WgState {
  solveFor: SolveKey;
  wr: string;
  a: number;
  aUnit: string;
  b: number;
  bUnit: string;
  f: number;
  fUnit: string;
  /** cutoff of the selected mode: target (solve a) or result */
  fc: number;
  fcUnit: string;
  /** guide wavelength of the selected mode: target (solve f / a) or result */
  lg: number;
  lgUnit: string;
  modeType: ModeType;
  m: number;
  n: number;
  filling: string;
  er: number;
  tanD: number;
  metal: string;
  sigma: number;
  sigmaUnit: string;
  len: number;
  lenUnit: string;
  eBd: number;
  eBdUnit: string;
}

export const defaults = (): WgState => ({
  solveFor: 'fc',
  wr: 'WR-90',
  a: 0.9 * INCH,
  aUnit: 'mm',
  b: 0.4 * INCH,
  bUnit: 'mm',
  f: 10e9,
  fUnit: 'GHz',
  fc: 6.557e9,
  fcUnit: 'GHz',
  lg: 39.7e-3,
  lgUnit: 'mm',
  modeType: 'TE',
  m: 1,
  n: 0,
  filling: 'Air',
  er: 1,
  tanD: 0,
  metal: 'Copper',
  sigma: 5.813e7,
  sigmaUnit: 'MS/m',
  len: 1,
  lenUnit: 'm',
  eBd: 3e6,
  eBdUnit: 'MV/m',
});

const U_DIM = withDefault(U_LEN, 'mm');
const U_EBD: Record<string, number> = { 'MV/m': 1e6, 'kV/cm': 1e5, 'kV/mm': 1e6, 'V/m': 1 };
const LIM = { a: [1e-4, 10] as const, f: [1e6, 3e12] as const };
/**
 * Ranges of the always-calculated fc and λg boxes. fc of any valid mode (m, n ≤ 10, a ≥ 0.1 mm, b ≥ 10 µm,
 * εr ≤ 100) lies within 1.5 MHz … 0.15 PHz, so this range holds every analysis result. λg grows without
 * bound at cutoff: beyond LG_MAX it is reported but not written into the box.
 */
export const FC_LIM = [1e5, 1e15] as const;
export const LG_MAX = 1e6;
/** Relative tolerance for treating two cutoffs as degenerate (e.g. TE₁₀ and TE₀₁ of a square guide). */
export const DEGEN = 1e-6;

const SUBD = '₀₁₂₃₄₅₆₇₈₉';
const sub = (k: number) => String(k).replace(/\d/g, (d) => SUBD[+d]);
export const modeName = (t: ModeType, m: number, n: number) => (m > 9 || n > 9 ? `${t}${sub(m)},${sub(n)}` : `${t}${sub(m)}${sub(n)}`);

const applyWr = (v: string, s: Record<string, any>) => {
  const w = WR_SIZES[v];
  if (!w) return;
  s.a = w.a * INCH;
  s.b = w.b * INCH;
  if (s.solveFor === 'a' || s.solveFor === 'aLg') s.solveFor = 'fc';
};
/**
 * A mode-type switch must not land on a mode that does not exist (TE₁₀ → TM₁₀ would be a red error),
 * and a cutoff or λg target set for the old mode means something else for the new one: show the new
 * mode in the guide already entered.
 */
const applyModeType = (v: string, s: Record<string, any>) => {
  if (v === 'TM') {
    s.m = Math.max(s.m, 1);
    s.n = Math.max(s.n, 1);
  }
  s.solveFor = 'fc';
};
const applyFilling = (v: string, s: Record<string, any>) => {
  const m = FILLINGS[v];
  if (m) {
    s.er = m.er;
    s.tanD = m.tanD;
  }
};

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Guide',
    note: 'Inner dimensions, a ≥ b by convention (TE₁₀ dominant). ◎ picks the unknown.',
    fields: [
      { kind: 'select', key: 'wr', label: 'Standard size', options: Object.keys(WR_SIZES).map((k) => ({ value: k, label: WR_SIZES[k] ? `${k} (${WR_SIZES[k]!.lo}–${WR_SIZES[k]!.hi} GHz)` : k })), apply: applyWr, help: 'EIA WR sizes (inner a × b in inches; the number is a in hundredths of an inch). Fills a and b and switches to analysis.' },
      {
        kind: 'number', key: 'a', symbol: 'a', label: 'Broad wall', units: U_DIM, unitKey: 'aUnit', solvable: true, min: LIM.a[0], max: LIM.a[1],
        solvedWhen: (_s, r) => r.solveFor === 'a' || r.solveFor === 'aLg',
        onSolve: (_s, r) => { r.solveFor = r.solveFor === 'f' ? 'aLg' : 'a'; },
        help: 'Inner broad-wall width. Sets the TE₁₀ cutoff, f_c = c/(2a√εr). When solved: the width that gives the target cutoff (or, with λg as the target, the target guide wavelength at f).',
      },
      { kind: 'number', key: 'b', symbol: 'b', label: 'Narrow wall', units: U_DIM, unitKey: 'bUnit', min: 1e-5, max: 10, help: 'Inner narrow-wall height. Standard guides use b ≈ a/2, which puts TE₀₁ and TE₂₀ together at twice the TE₁₀ cutoff. Smaller b raises the loss and lowers the power rating.' },
    ],
  },
  {
    kind: 'section',
    title: 'Mode & frequency',
    fields: [
      { kind: 'select', key: 'modeType', label: 'Mode type', options: [{ value: 'TE', label: 'TE (transverse electric)' }, { value: 'TM', label: 'TM (transverse magnetic)' }], apply: applyModeType, help: 'TE modes need m + n ≥ 1; TM modes need m ≥ 1 and n ≥ 1 (switching to TM raises a 0 index to 1). TE_mn and TM_mn share the same cutoff.' },
      { kind: 'number', key: 'm', symbol: 'm', label: 'Index along a', integer: true, min: 0, max: 10, help: 'Number of half-wave field variations across the width a.' },
      { kind: 'number', key: 'n', symbol: 'n', label: 'Index along b', integer: true, min: 0, max: 10, help: 'Number of half-wave field variations across the height b.' },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', solvable: true, min: LIM.f[0], max: LIM.f[1], help: 'When solved: the frequency at which the selected mode has the target guide wavelength λg.' },
      {
        kind: 'number', key: 'fc', symbol: 'f_c', label: 'Cutoff', units: U_FREQ, unitKey: 'fcUnit', solvable: true, min: FC_LIM[0], max: FC_LIM[1],
        solvedWhen: (_s, r) => r.solveFor !== 'a',
        onSolve: (_s, r) => { r.solveFor = 'fc'; },
        onUnsolve: (_s, r) => { r.solveFor = 'a'; },
        help: 'Cutoff of the selected mode. Normally calculated (green); click ◎ to make it a target and solve the width a for it.',
      },
      {
        kind: 'number', key: 'lg', symbol: 'λ_g', label: 'Guide λ', units: U_DIM, unitKey: 'lgUnit', solvable: true, min: 1e-6, max: LG_MAX,
        solvedWhen: (_s, r) => r.solveFor !== 'f' && r.solveFor !== 'aLg',
        onSolve: (_s, r) => { r.solveFor = 'fc'; },
        onUnsolve: (_s, r) => { r.solveFor = 'f'; },
        help: 'Wavelength along the guide of the selected mode, 2π/β (longer than in free space). Normally calculated; click ◎ to make it a target and solve f (or the width a, by then clicking ◎ on a).',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Materials & length',
    fields: [
      { kind: 'select', key: 'filling', label: 'Filling', options: Object.keys(FILLINGS), apply: applyFilling, help: 'Dielectric that fills the guide (Pozar, Appendix G, ≈10 GHz). Filling lowers every cutoff by √εr.' },
      { kind: 'number', key: 'er', symbol: 'ε_r', label: 'Permittivity', min: 1, max: 100 },
      { kind: 'number', key: 'tanD', symbol: 'tan δ', label: 'Loss tangent', min: 0, max: 1 },
      { kind: 'select', key: 'metal', label: 'Wall metal', options: Object.keys(METALS).map((k) => ({ value: k, label: METALS[k] ? `${k} (${(METALS[k]! / 1e6).toFixed(2)} MS/m)` : k })), apply: (v, s) => { const c = METALS[v]; if (c) s.sigma = c; }, help: 'Bulk conductivity (Pozar, Appendix F). Plating, roughness and flange joints add loss that is not modelled.' },
      { kind: 'number', key: 'sigma', symbol: 'σ', label: 'Conductivity', units: U_COND, unitKey: 'sigmaUnit', min: 1e5, max: 1e9 },
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'Guide length', units: withDefault(U_LEN, 'm'), unitKey: 'lenUnit', unitFamily: 'none', min: 0, max: 1e5, help: 'Length for the total loss (or, below cutoff, the evanescent attenuation).' },
    ],
  },
  {
    kind: 'section',
    title: 'Power handling',
    collapsed: true,
    fields: [
      { kind: 'number', key: 'eBd', symbol: 'E_bd', label: 'Breakdown E', units: U_EBD, unitKey: 'eBdUnit', min: 1e3, max: 1e10, help: 'Field at which the filling breaks down. Dry air at sea level ≈ 3 MV/m; lower at altitude and with humidity. Used for the TE₁₀ peak power rating.' },
    ],
  },
];

const fHz = (v: number, d = 4) => si(v, 'Hz', d);
const fLen = (v: number, d = 4) => si(v, 'm', d);
const fDbm = (np: number) => `${(np * NP_TO_DB).toPrecision(3)} dB/m`;

/**
 * No answer is an error (style guide §5): the core then blanks the solved box and drops the graphs,
 * and nothing (round trips, the API) mistakes the stale input value for a result.
 */
function fail(s: WgState, msg: string): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: WgState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: WgState): CalcReport {
  const s: WgState = { ...st };
  if (!['fc', 'a', 'f', 'aLg'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  for (const [k, name] of [['b', 'Height b'], ['er', 'εr'], ['tanD', 'tan δ'], ['sigma', 'Conductivity'], ['len', 'Length'], ['eBd', 'Breakdown field'], ['m', 'Index m'], ['n', 'Index n']] as const) finite(name, s[k]);
  if (s.solveFor !== 'a' && s.solveFor !== 'aLg' && !(finite('Width a', s.a) > 0)) throw new Error('Width a must be > 0.');
  if (s.solveFor !== 'f' && !(finite('Frequency', s.f) > 0)) throw new Error('Frequency must be > 0.');
  if (!(s.b > 0)) throw new Error('Height b must be > 0.');
  if (!(s.er >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(s.tanD >= 0)) throw new Error('tan δ must be ≥ 0.');
  if (!(s.sigma > 0)) throw new Error('Wall conductivity must be > 0.');
  if (!(s.len >= 0)) throw new Error('Length must be ≥ 0.');
  if (!(s.eBd > 0)) throw new Error('Breakdown field must be > 0.');
  const type = s.modeType === 'TM' ? 'TM' : 'TE';
  const { m, n } = s;
  if (!validMode(type, m, n)) throw new Error(type === 'TE' ? 'TE modes need integer m, n ≥ 0, not both 0 (there is no TE₀₀ mode).' : 'TM modes need m ≥ 1 and n ≥ 1 (TM₀ₙ and TMₘ₀ have no field).');
  const mn = modeName(type, m, n);

  // ── solve
  // a value typed at a field limit must survive its own exact inverse, which can round just outside it
  const range = (k: 'a' | 'f', v: number) => v >= LIM[k][0] * (1 - 1e-9) && v <= LIM[k][1] * (1 + 1e-9);
  const clampTo = (k: 'a' | 'f', v: number) => Math.min(Math.max(v, LIM[k][0]), LIM[k][1]);
  if (s.solveFor === 'a') {
    if (!(finite('Target cutoff', s.fc) > 0)) throw new Error('Target cutoff must be > 0.');
    if (m === 0) return fail(s, `The ${mn} cutoff depends only on b, not on a. Pick a mode with m ≥ 1 (e.g. TE₁₀) or change b.`);
    const a = widthForCutoff(s.fc, s.b, m, n, s.er);
    if (a == null) return fail(s, `${mn} can’t have a cutoff as low as ${fHz(s.fc)} with b = ${fLen(s.b)}: the b part alone gives ${fHz(rectCutoff(1e30, s.b, 0, n, s.er))}. Raise the target or increase b.`);
    if (!range('a', a)) return fail(s, `The cutoff ${fHz(s.fc)} needs a = ${fLen(a)}, outside 0.1 mm … 10 m.`);
    s.a = clampTo('a', a);
  } else if (s.solveFor === 'aLg' || s.solveFor === 'f') {
    if (!(finite('Target λg', s.lg) > 0)) throw new Error('Target guide wavelength must be > 0.');
    if (s.solveFor === 'f') {
      const fc0 = rectCutoff(s.a, s.b, m, n, s.er);
      const f = freqForGuideWavelength(fc0, s.lg, s.er);
      if (!range('f', f)) return fail(s, `λg = ${fLen(s.lg)} needs f = ${fHz(f)}, outside 1 MHz … 3 THz.`);
      s.f = clampTo('f', f);
    } else {
      if (m === 0) return fail(s, `The ${mn} cutoff (and so λg) does not depend on a. Pick a mode with m ≥ 1.`);
      const lam = C0 / Math.sqrt(s.er) / s.f;
      const fcNeed = cutoffForGuideWavelength(s.f, s.lg, s.er);
      if (fcNeed == null) return fail(s, `λg must be longer than the wavelength in the filling (λ = ${fLen(lam)} at ${fHz(s.f)}); ${fLen(s.lg)} is not.`);
      const a = widthForCutoff(fcNeed, s.b, m, n, s.er);
      if (a == null) return fail(s, `λg = ${fLen(s.lg)} needs a ${mn} cutoff of ${fHz(fcNeed)}, below what b = ${fLen(s.b)} allows. Increase b or the target λg.`);
      if (!range('a', a)) return fail(s, `λg = ${fLen(s.lg)} needs a = ${fLen(a)}, outside 0.1 mm … 10 m.`);
      s.a = clampTo('a', a);
    }
  }

  // ── forward
  const { a, b, er, f } = s;
  const fc = rectCutoff(a, b, m, n, er);
  const wv = rectWave(type, a, b, m, n, er, f);
  if (s.solveFor !== 'a') s.fc = fc;
  const lgShown = wv.lg != null && wv.lg <= LG_MAX;
  // Below cutoff there is no λg: the solved λg box shows "—" and keeps its last value in the state. So a
  // round trip "solve f (or a) for that λg" from a cut-off state does not return f: the target is stale,
  // not a property of this guide (the mode-switch harness flags it; it is expected).
  if (s.solveFor !== 'f' && s.solveFor !== 'aLg' && lgShown) s.lg = wv.lg!;
  const lam0 = C0 / f;
  const lam = lam0 / Math.sqrt(er);
  const ac = rectAlphaC(type, a, b, m, n, er, f, s.sigma);
  const ad = alphaD(wv, s.tanD);
  const aTot = ac != null && ad != null ? ac + ad : null;
  const rs = surfaceResistance(f, s.sigma);
  const ds = skinDepth(f, s.sigma);
  const modes = rectModes(a, b, er);
  const dom = modes[0];
  // next mode (may share the dominant cutoff, e.g. TE₀₁ in a square guide) and the next distinct cutoff
  const second = modes[1];
  const degenerate = second != null && Math.abs(second.fc / dom.fc - 1) < DEGEN;
  const nextUp = modes.find((x) => x.fc > dom.fc * (1 + DEGEN));
  const propagating = modes.filter((x) => x.fc < f);
  const fc10 = rectCutoff(a, b, 1, 0, er);
  const pMax = powerCapacityTE10(a, b, er, f, s.eBd);
  const isTE10 = type === 'TE' && m === 1 && n === 0;

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const solvedA = s.solveFor === 'a' || s.solveFor === 'aLg';
  const lgSolved = s.solveFor !== 'f' && s.solveFor !== 'aLg';

  // ── headline
  const primary: ResultItem[] = [];
  if (solvedA) primary.push(item('a', 'Width', a, 'm', fLen(a, 5), { symbol: 'a', primary: true, solved: true, note: `${(a / INCH).toPrecision(4)} in · b/a = ${(b / a).toPrecision(3)}` }));
  if (s.solveFor === 'f') primary.push(item('f', 'Operating frequency', f, 'Hz', fHz(f, 5), { symbol: 'f', primary: true, solved: true, note: `f/f_c = ${(f / fc).toPrecision(4)}` }));
  primary.push(item('fc', `Cutoff of ${mn}`, fc, 'Hz', fHz(fc, 5), { symbol: 'f_c', primary: true, solved: s.solveFor !== 'a', note: s.solveFor === 'a' ? 'target' : `λ_c = ${fLen(C0 / Math.sqrt(er) / fc)}` }));
  primary.push(
    wv.lg != null
      ? item('lg', 'Guide wavelength', lgShown ? wv.lg : null, 'm', fLen(wv.lg, 5), { symbol: 'λ_g', primary: true, solved: lgSolved, note: !lgShown ? 'beyond the λg box range: f is at cutoff' : lgSolved ? `${(wv.lg / lam).toPrecision(4)} × λ in the filling` : 'target' })
      : item('lg', 'Guide wavelength', null, 'm', '— (cut off)', { symbol: 'λ_g', primary: true, solved: lgSolved, tone: 'fail', note: `${mn} does not propagate at ${fHz(f)}` }),
  );
  if (aTot != null) primary.push(item('alphaTot', 'Attenuation', aTot * NP_TO_DB, 'dB/m', fDbm(aTot), { symbol: 'α', primary: true, note: `${(aTot * NP_TO_DB * s.len).toPrecision(3)} dB over ${fLen(s.len, 3)}` }));
  else if (wv.alphaEv != null) primary.push(item('alphaEv', 'Evanescent decay', wv.alphaEv * NP_TO_DB, 'dB/m', `${(wv.alphaEv * NP_TO_DB).toPrecision(4)} dB/m`, { symbol: 'α_ev', primary: true, tone: 'fail', note: `${(wv.alphaEv * NP_TO_DB * 1e-3).toPrecision(3)} dB per mm` }));
  if (primary.length < 5 && second) {
    primary.push(
      degenerate
        ? item('singleBand', 'Single-mode band', null, 'Hz', 'none', { primary: true, tone: 'warn', note: `${modesAt(modes, dom.fc)} share the cutoff ${fHz(dom.fc, 4)}` })
        : item('singleBand', 'Single-mode band', dom.fc, 'Hz', `${fHz(dom.fc, 4)} – ${fHz(second.fc, 4)}`, { primary: true, note: `${modeName(dom.type, dom.m, dom.n)} only · up to ${modeName(second.type, second.m, second.n)}` }),
    );
  }

  // ── mode details
  const g1 = `Mode ${mn}`;
  const rest: ResultItem[] = [
    item('fOverFc', 'Frequency / cutoff', f / fc, '', (f / fc).toPrecision(4), { symbol: 'f/f_c', group: g1, tone: f <= fc ? 'fail' : f < 1.05 * fc ? 'warn' : '' }),
    item('lambda', 'Wavelength in filling', lam, 'm', fLen(lam), { symbol: 'λ', group: g1, note: er !== 1 ? `free space ${fLen(lam0)}` : undefined }),
    item('beta', 'Phase constant', wv.beta, 'rad/m', wv.beta != null ? `${wv.beta.toPrecision(5)} rad/m` : '— (cut off)', { symbol: 'β', group: g1, note: wv.beta != null ? `${((wv.beta * 180) / Math.PI).toPrecision(4)} °/m` : undefined }),
    item('vp', 'Phase velocity', wv.vp != null ? wv.vp / C0 : null, 'c', wv.vp != null ? `${(wv.vp / C0).toPrecision(4)} c` : '—', { symbol: 'v_p', group: g1 }),
    item('vg', 'Group velocity', wv.vg != null ? wv.vg / C0 : null, 'c', wv.vg != null ? `${(wv.vg / C0).toPrecision(4)} c` : '—', { symbol: 'v_g', group: g1, note: wv.vg != null ? `delay ${si(1 / wv.vg, 's', 3)}/m` : undefined }),
    wv.zw != null
      ? item('zw', 'Wave impedance', wv.zw, 'Ω', si(wv.zw, 'Ω', 4), { symbol: `Z_${type}`, group: g1, note: `η = ${si(wv.eta, 'Ω', 4)}` })
      : item('zw', 'Wave impedance', null, 'Ω', wv.zwIm != null ? `j·${si(wv.zwIm, 'Ω', 3)} (reactive)` : 'at cutoff (Z_TE → ∞, Z_TM → 0)', { symbol: `Z_${type}`, group: g1, note: type === 'TE' ? 'inductive below cutoff' : 'capacitive below cutoff' }),
  ];
  if (wv.alphaEv != null && aTot == null) rest.push(item('alphaEvNp', 'Evanescent attenuation', wv.alphaEv, 'Np/m', `${wv.alphaEv.toPrecision(4)} Np/m`, { symbol: 'α', group: g1, note: `${(wv.alphaEv * NP_TO_DB * s.len).toPrecision(4)} dB over ${fLen(s.len, 3)}` }));

  const g2 = 'Loss';
  rest.push(
    item('rs', 'Surface resistance', rs, 'Ω', si(rs, 'Ω', 4), { symbol: 'R_s', group: g2, note: `skin depth ${si(ds, 'm', 3)}` }),
    item('alphaC', 'Conductor loss', ac != null ? ac * NP_TO_DB : null, 'dB/m', ac != null ? fDbm(ac) : '—', { symbol: 'α_c', group: g2 }),
    item('alphaD', 'Dielectric loss', ad != null ? ad * NP_TO_DB : null, 'dB/m', ad != null ? fDbm(ad) : '—', { symbol: 'α_d', group: g2 }),
    item('lossLen', 'Loss over length', aTot != null ? aTot * NP_TO_DB * s.len : wv.alphaEv != null ? wv.alphaEv * NP_TO_DB * s.len : null, 'dB', aTot != null ? `${(aTot * NP_TO_DB * s.len).toPrecision(4)} dB` : wv.alphaEv != null ? `${(wv.alphaEv * NP_TO_DB * s.len).toPrecision(4)} dB (evanescent)` : '—', { symbol: 'L', group: g2, note: `ℓ = ${fLen(s.len, 3)}` }),
  );

  const g3 = 'Guide';
  rest.push(
    item('dominant', 'Dominant mode', dom.fc, 'Hz', `${modeName(dom.type, dom.m, dom.n)} at ${fHz(dom.fc)}`, { group: g3 }),
    item('nextMode', 'Next mode', nextUp ? nextUp.fc : null, 'Hz', nextUp ? `${modesAt(modes, nextUp.fc)} at ${fHz(nextUp.fc)}` : '—', { group: g3, note: nextUp ? `${(nextUp.fc / dom.fc).toPrecision(3)} × the dominant cutoff` : undefined }),
    item('nProp', 'Propagating modes', propagating.length, '', String(propagating.length), { group: g3, tone: propagating.length > 1 ? 'warn' : propagating.length === 0 ? 'fail' : '', note: propagating.length ? propagating.slice(0, 6).map((x) => modeName(x.type, x.m, x.n)).join(', ') + (propagating.length > 6 ? ' …' : '') : 'none: everything is cut off' }),
    item('bandRec', 'Recommended TE₁₀ band', 1.25 * fc10, 'Hz', `${fHz(1.25 * fc10, 3)} – ${fHz(1.9 * fc10, 3)}`, { group: g3, note: '1.25 … 1.9 × f_c,TE₁₀', tone: isTE10 && (f < 1.25 * fc10 || f > 1.9 * fc10) ? 'warn' : '' }),
  );
  const wr = WR_SIZES[s.wr];
  if (wr) rest.push(item('bandStd', `${s.wr} standard band`, wr.lo * 1e9, 'Hz', `${wr.lo} – ${wr.hi} GHz`, { group: g3, note: `${wr.a} × ${wr.b} in${wr.band ? ` · ${wr.band} band` : ''}`, tone: f < wr.lo * 1e9 * 0.999 || f > wr.hi * 1e9 * 1.001 ? 'warn' : '' }));
  if (pMax != null) rest.push(item('pMax', 'TE₁₀ breakdown power', pMax, 'W', si(pMax, 'W', 3), { symbol: 'P_max', group: 'Power (TE₁₀, matched)', note: `peak field ${si(s.eBd, 'V/m', 3)} at the centre; derate ≥ 2× in practice` }));
  report.results = [...primary, ...rest];

  // ── mode table
  report.tables.push(modeTable(s, modes, type));

  // ── status and warnings
  const multi = propagating.length > 1;
  report.status = !wv.propagating ? { text: `${mn} CUT OFF`, tone: 'fail' } : multi ? { text: 'MULTIMODE', tone: 'warn' } : { text: 'SINGLE MODE', tone: 'pass' };
  if (!wv.propagating) warnings.push(`${mn} is cut off at ${fHz(f)} (f_c = ${fHz(fc)}): it decays by ${(wv.alphaEv! * NP_TO_DB * 1e-3).toPrecision(3)} dB per mm instead of propagating. Raise f above f_c or enlarge the guide${s.wr !== 'Custom' ? ' (or pick a larger WR size)' : ''}.`);
  else if (f < 1.05 * fc) warnings.push(`f is within 5 % of the ${mn} cutoff: group velocity is tiny, dispersion is extreme and the perturbation loss formula is no longer valid (it rises without limit at cutoff). Operate above about 1.25 f_c.`);
  if (multi && wv.propagating) {
    const others = propagating.filter((x) => !(x.type === type && x.m === m && x.n === n));
    warnings.push(`${propagating.length} modes propagate at ${fHz(f)} (${others.slice(0, 4).map((x) => modeName(x.type, x.m, x.n)).join(', ')}${others.length > 4 ? ' …' : ''} besides ${mn}). Bends, steps and probes will convert power into them. ${degenerate ? `${modesAt(modes, dom.fc)} share one cutoff here, so there is no single-mode band: make a ≠ b (standard guides use b ≈ a/2).` : `Stay below ${fHz(second!.fc)} or use a smaller guide.`}`);
  }
  if (isTE10 && wv.propagating && f >= 1.05 * fc && f < 1.25 * fc10) warnings.push(`f = ${(f / fc10).toFixed(4)} f_c is below the recommended 1.25 f_c: loss and dispersion rise quickly toward cutoff. Use a larger guide if you can.`);
  if (isTE10 && f > 1.9 * fc10 && second && !degenerate && f < second.fc) warnings.push(`f = ${(f / fc10).toFixed(4)} f_c is above the recommended 1.9 f_c, close to the ${modesAt(modes, second.fc)} cutoff at ${fHz(second.fc)}. Small dimensional errors or a dielectric insert may let it propagate; use a smaller guide.`);
  if (b > a) warnings.push(`b > a: the broad wall is b, so TE₀₁ (not TE₁₀) is the dominant mode. Swap a and b to follow the usual convention.`);
  else if (b > a / 2 * 1.001) notes.push(`b > a/2: TE₀₁ cuts in at ${fHz(rectCutoff(a, b, 0, 1, er))}, below 2 f_c,TE₁₀, so the single-mode band is narrower than in a standard guide.`);
  if (wr && (f < wr.lo * 1e9 * 0.999 || f > wr.hi * 1e9 * 1.001)) warnings.push(`${fHz(f)} is outside the ${s.wr} standard band (${wr.lo}–${wr.hi} GHz). Pick the WR size whose band contains f.`);
  if (s.tanD > 0.05) warnings.push(`tan δ = ${s.tanD} is large: α_d = k² tan δ/2β assumes a low-loss filling (tan δ ≪ 1) and becomes inaccurate. Use a lower-loss material or a full complex-β model.`);
  if (wv.propagating && ds > 0.01 * Math.min(a, b)) warnings.push(`Skin depth ${si(ds, 'm', 3)} exceeds 1 % of the smallest dimension: the surface-impedance loss model loses accuracy. Use a better conductor or larger guide.`);
  if (er > 1) notes.push(`Dielectric filling: every cutoff is √εr = ${Math.sqrt(er).toPrecision(4)} times lower than for air, and Z_TE scales with η = η₀/√εr.`);
  notes.push(
    'Conductor loss by the perturbation method with smooth walls (bulk σ). Surface roughness, plating and flange joints typically add 10–50 % in practice.',
    'Single-mode: of the listed modes only the dominant one propagates between its cutoff and the next mode’s cutoff. TE_mn and TM_mn with the same m, n are degenerate (same f_c).',
  );
  if (pMax != null) notes.push('The TE₁₀ power rating is the theoretical value for a matched, dry guide. Reflections (VSWR), humidity, altitude and pulse length all reduce it.');

  report.summary = `${s.wr !== 'Custom' ? `${s.wr} · ` : ''}${fLen(a, 4)} × ${fLen(b, 4)}${er !== 1 ? ` · εr ${er}` : ''} · ${mn} at ${fHz(f)} · f_c ${fHz(fc)}`;
  report.details = { a, b, f, fc, wave: wv, alphaC: ac, alphaD: ad, rs, skinDepth: ds, modes: modes.slice(0, 20), fc10, pMax };
  report.graphs = graphs(s, type, modes, fc, wv);
  return report;
}

function modesAt(modes: RectMode[], fc: number): string {
  return modes
    .filter((x) => Math.abs(x.fc / fc - 1) < DEGEN)
    .map((x) => modeName(x.type, x.m, x.n))
    .join(' / ');
}

/**
 * Row tone judged against single-mode operation: the dominant (first) mode should propagate comfortably,
 * every higher mode should be cut off with margin.
 */
export function singleModeTone(dominant: boolean, ratio: number): 'pass' | 'warn' | 'fail' | '' {
  if (dominant) return ratio >= 1.1 ? 'pass' : ratio >= 0.9 ? 'warn' : 'fail';
  return ratio > 1 ? 'fail' : ratio >= 1 / 1.1 ? 'warn' : '';
}
export const SINGLE_MODE_NOTE =
  'Tones judge single-mode operation. Dominant mode (first row): green when it propagates comfortably (f ≥ 1.1 f_c), yellow within ±10 % of its cutoff, red when cut off. Higher modes: red when they also propagate (multimode), yellow when their cutoff is less than 10 % above f, no tone when safely cut off. ◂ marks the selected mode. Loss is α_c + α_d for propagating modes; decay is the evanescent attenuation.';

/** Modes table (rows in order of cutoff, so the first row is the dominant mode). */
function modeTable(s: WgState, modes: RectMode[], type: ModeType): TableSpec {
  const fmax = Math.max(2.2 * s.f, 2.2 * modes[0].fc);
  let list = modes.filter((x) => x.fc <= fmax).slice(0, 16);
  if (!list.some((x) => x.type === type && x.m === s.m && x.n === s.n)) {
    const sel = modes.find((x) => x.type === type && x.m === s.m && x.n === s.n);
    if (sel) list = [...list.slice(0, 15), sel];
  }
  const rows = list.map((x) => {
    const w = rectWave(x.type, s.a, s.b, x.m, x.n, s.er, s.f);
    const ac = rectAlphaC(x.type, s.a, s.b, x.m, x.n, s.er, s.f, s.sigma);
    const ad = alphaD(w, s.tanD);
    return { mode: modeName(x.type, x.m, x.n), fc: x.fc, ratio: s.f / x.fc, lg: w.lg, att: w.propagating ? (ac != null && ad != null ? (ac + ad) * NP_TO_DB : null) : w.alphaEv! * NP_TO_DB, zw: w.zw, sel: x.type === type && x.m === s.m && x.n === s.n };
  });
  return {
    id: 'modes',
    title: `Modes up to ${fHz(fmax, 3)} at f = ${fHz(s.f)}`,
    columns: [
      { key: 'mode', label: 'Mode', align: 'left' },
      { key: 'fc', label: 'fc', unit: 'Hz' },
      { key: 'ratio', label: 'f/f_c' },
      { key: 'lg', label: 'λg', unit: 'm' },
      { key: 'att', label: 'Loss / decay', unit: 'dB/m' },
      { key: 'zw', label: 'Zw', unit: 'Ω' },
    ],
    rows: rows.map((r) => ({ mode: r.mode, fc: r.fc, ratio: r.ratio, lg: r.lg, att: r.att, zw: r.zw })),
    display: rows.map((r) => ({
      mode: `${r.mode}${r.sel ? ' ◂' : ''}`,
      fc: fHz(r.fc, 4),
      ratio: r.ratio.toFixed(3),
      lg: r.lg != null ? fLen(r.lg, 4) : 'cut off',
      att: r.att == null ? '—' : r.ratio > 1 ? `${r.att.toPrecision(3)} (loss)` : `${r.att.toPrecision(4)} (decay)`,
      zw: r.zw != null ? si(r.zw, 'Ω', 4) : 'reactive',
    })),
    rowTones: rows.map((r, i) => singleModeTone(i === 0, r.ratio)),
    note: SINGLE_MODE_NOTE,
  };
}

/** Pick a dB-per-length unit so that the axis reads 1…1000 (the plot adds SI prefixes to any unit). */
export function attScale(maxDbPerM: number): { k: number; unit: string } {
  if (maxDbPerM >= 1) return { k: 1, unit: 'dB/m' };
  if (maxDbPerM >= 0.01) return { k: 100, unit: 'dB/100 m' };
  return { k: 1000, unit: 'dB/km' };
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

function graphs(s: WgState, type: ModeType, modes: RectMode[], fc: number, wv: ModeWave): GraphSpec[] {
  const out: GraphSpec[] = [];
  // 1 — dispersion diagram of the lowest modes
  const distinct: RectMode[] = [];
  for (const x of modes) if (!distinct.some((y) => Math.abs(y.fc / x.fc - 1) < 1e-9)) distinct.push(x);
  const show = distinct.slice(0, 6);
  const fTop = Math.max(1.4 * s.f, 2.2 * modes[0].fc, 1.15 * fc);
  const pal = ['#1f4e5f', '#c47b17', '#4f8a8b', '#6b5b95', '#2f7d4f', '#386a77'];
  const series: NonNullable<GraphSpec['series']> = show
    .filter((x) => x.fc < fTop)
    .map((x, i) => {
      // dense near cutoff where β rises like √(f − f_c)
      const fs = linspace(0, 1, 90).map((t) => x.fc + (fTop - x.fc) * t * t);
      return { label: modesAt(modes, x.fc), x: fs, y: fs.map((ff) => rectWave(x.type, s.a, s.b, x.m, x.n, s.er, ff).beta ?? 0), color: pal[i % pal.length], width: Math.abs(x.fc / fc - 1) < 1e-9 ? 2.4 : 1.5 };
    });
  const kLine = [0, fTop];
  series.push({ label: 'light line k', x: kLine, y: kLine.map((ff) => (2 * Math.PI * ff * Math.sqrt(s.er)) / C0), color: '#9a8f7a', width: 1, dash: [4, 3] });
  out.push({
    id: 'dispersion',
    title: 'Mode dispersion',
    subtitle: 'β = √(k² − kc²) for the lowest modes; a mode propagates right of its cutoff',
    x: { label: 'Frequency', unit: 'Hz' },
    y: [{ id: 'b', label: 'Phase constant β', unit: 'rad/m', includeZero: true }],
    series,
    vlines: [{ value: s.f, label: `f = ${fHz(s.f, 3)}`, color: '#8b1e1e', dash: [5, 4] }],
    markers: wv.beta != null ? [{ x: s.f, y: wv.beta, axis: 'b', label: modeName(type, s.m, s.n) }] : [],
    xRange: [0, fTop],
  });

  // 2 — attenuation of the selected mode vs frequency
  const f0 = 1.03 * fc;
  const f1 = Math.max(2.6 * fc, 1.3 * s.f);
  const fs = linspace(0, 1, 160).map((t) => f0 * (f1 / f0) ** t);
  const acs = fs.map((ff) => (rectAlphaC(type, s.a, s.b, s.m, s.n, s.er, ff, s.sigma) ?? 0) * NP_TO_DB);
  const ads = fs.map((ff) => (alphaD(rectWave(type, s.a, s.b, s.m, s.n, s.er, ff), s.tanD) ?? 0) * NP_TO_DB);
  const tot = acs.map((v, i) => v + ads[i]);
  const sc = attScale(Math.max(...tot));
  const lossSeries: NonNullable<GraphSpec['series']> = [{ label: 'Total', x: fs, y: tot.map((v) => v * sc.k), width: 2.2, color: '#1f4e5f' }, { label: 'Conductor αc', x: fs, y: acs.map((v) => v * sc.k), width: 1.4, color: '#c47b17', dash: [5, 3] }];
  if (s.tanD > 0) lossSeries.push({ label: 'Dielectric αd', x: fs, y: ads.map((v) => v * sc.k), width: 1.4, color: '#4f8a8b', dash: [2, 3] });
  const vl: NonNullable<GraphSpec['vlines']> = [];
  const next = modes.find((x) => x.fc > fc * (1 + 1e-9));
  if (next && next.fc < f1) vl.push({ value: next.fc, label: `${modesAt(modes, next.fc)} cutoff`, color: '#8b1e1e', dash: [4, 4] });
  const opAtt = wv.propagating ? ((rectAlphaC(type, s.a, s.b, s.m, s.n, s.er, s.f, s.sigma) ?? 0) + (alphaD(wv, s.tanD) ?? 0)) * NP_TO_DB : null;
  out.push({
    id: 'loss',
    title: 'Attenuation vs frequency',
    subtitle: `${modeName(type, s.m, s.n)}, from 1.03 fc (the perturbation formula diverges at cutoff)`,
    x: { label: 'Frequency', unit: 'Hz' },
    y: [{ id: 'y', label: 'Attenuation', unit: sc.unit, includeZero: true }],
    series: lossSeries,
    vlines: [...vl, ...(s.f >= f0 && s.f <= f1 ? [{ value: s.f, label: `f = ${fHz(s.f, 3)}`, color: '#9a8f7a' }] : [])],
    markers: opAtt != null && s.f >= f0 ? [{ x: s.f, y: opAtt * sc.k, axis: 'y', label: `${(opAtt * sc.k).toPrecision(3)} ${sc.unit}` }] : [],
  });

  // 3 — guide wavelength and wave impedance vs frequency
  const fs3 = linspace(0, 1, 160).map((t) => 1.02 * fc * ((Math.max(3 * fc, 1.3 * s.f)) / (1.02 * fc)) ** t);
  const ws = fs3.map((ff) => rectWave(type, s.a, s.b, s.m, s.n, s.er, ff));
  out.push({
    id: 'lg',
    title: 'λg and impedance',
    subtitle: `${modeName(type, s.m, s.n)} above cutoff`,
    x: { label: 'Frequency', unit: 'Hz' },
    y: [
      { id: 'l', label: 'Guide wavelength λg', unit: 'm', includeZero: true },
      { id: 'z', label: `Wave impedance Z (${type})`, unit: 'Ω', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'λg', x: fs3, y: ws.map((w) => w.lg ?? 0), axis: 'l', width: 2.2, color: '#1f4e5f' },
      { label: 'λ in filling', x: fs3, y: fs3.map((ff) => C0 / Math.sqrt(s.er) / ff), axis: 'l', width: 1.2, color: '#9a8f7a', dash: [4, 3] },
      { label: `Z (${type})`, x: fs3, y: ws.map((w) => w.zw ?? 0), axis: 'z', width: 1.8, color: '#c47b17' },
    ],
    vlines: s.f > 1.02 * fc ? [{ value: s.f, label: `f = ${fHz(s.f, 3)}`, color: '#9a8f7a' }] : [],
    markers: wv.lg != null && s.f > 1.02 * fc ? [{ x: s.f, y: wv.lg, axis: 'l', label: fLen(wv.lg, 3) }] : [],
  });
  return out;
}

export const def: CalcDef<WgState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Rectangular-guide TE/TM modes: f_c = c/(2√εr)·√((m/a)² + (n/b)²), β = √(k² − kc²), Z_TE = kη/β, Z_TM = βη/k (Pozar, Microwave Engineering 4e, §3.1, §3.3); conductor loss by the perturbation method with closed-form wall integrals (equals Pozar eq. 3.96 for TE₁₀ and the Ramo–Whinnery–Van Duzer TM_mn formula), dielectric loss k²tanδ/2β (Pozar eq. 3.29); TE₁₀ power capacity abE²/4Z_TE; EIA WR sizes. Width and frequency are solved with the exact closed-form inverses.',
  fields,
  defaults,
  solve: {
    default: 'fc',
    analysis: 'fc',
    options: [
      { key: 'fc', label: 'Cutoff and λg from a, b, f (analysis)' },
      { key: 'a', label: 'Width a for a target cutoff' },
      { key: 'f', label: 'Frequency for a target λg' },
      { key: 'aLg', label: 'Width a for a target λg at f' },
    ],
  },
  compute,
  sync: (s) => {
    const w = WR_SIZES[s.wr];
    if (w && (Math.abs(w.a * INCH - s.a) > 1e-9 || Math.abs(w.b * INCH - s.b) > 1e-9)) s.wr = 'Custom';
    const m = FILLINGS[s.filling];
    if (m && (Math.abs(m.er - s.er) > 1e-12 || Math.abs(m.tanD - s.tanD) > 1e-12)) s.filling = 'Custom';
    const c = METALS[s.metal];
    if (c && Math.abs(c - s.sigma) > 1e-3) s.metal = 'Custom';
  },
  examples: [
    { id: 'wr90-10g', label: 'WR-90 at 10 GHz, TE₁₀ (X band)', state: defaults() },
    { id: 'pozar-3-1', label: 'Pozar ex. 3.1: PTFE-filled K-band guide at 15 GHz', state: { solveFor: 'fc', wr: 'Custom', a: 1.07e-2, b: 0.43e-2, f: 15e9, modeType: 'TE', m: 1, n: 0, filling: 'PTFE (Teflon)', er: 2.08, tanD: 0.0004, metal: 'Copper', sigma: 5.813e7, len: 1 } },
    { id: 'design-6g5', label: 'Design: width for a 6.5 GHz TE₁₀ cutoff (b = 15 mm)', state: { solveFor: 'a', wr: 'Custom', fc: 6.5e9, b: 15e-3, f: 9e9, modeType: 'TE', m: 1, n: 0, filling: 'Air', er: 1, tanD: 0, metal: 'Aluminium', sigma: 3.816e7, len: 1 } },
    { id: 'slot-array', label: 'Slot array: frequency for λg = 40 mm in WR-90', state: { solveFor: 'f', wr: 'WR-90', a: 0.9 * INCH, b: 0.4 * INCH, lg: 40e-3, modeType: 'TE', m: 1, n: 0, filling: 'Air', er: 1, tanD: 0, metal: 'Copper', sigma: 5.813e7, len: 1 } },
    { id: 'multimode', label: 'WR-90 at 16 GHz: TE₂₀ also propagates', state: { solveFor: 'fc', wr: 'WR-90', a: 0.9 * INCH, b: 0.4 * INCH, f: 16e9, modeType: 'TE', m: 1, n: 0, filling: 'Air', er: 1, tanD: 0, metal: 'Copper', sigma: 5.813e7, len: 1 } },
    { id: 'below-cutoff', label: 'Below cutoff: 2.45 GHz in a 25 mm vent (TE₁₀ decay)', state: { solveFor: 'fc', wr: 'Custom', a: 25e-3, b: 25e-3, f: 2.45e9, modeType: 'TE', m: 1, n: 0, filling: 'Air', er: 1, tanD: 0, metal: 'Aluminium', sigma: 3.816e7, len: 0.05 } },
  ],
};
