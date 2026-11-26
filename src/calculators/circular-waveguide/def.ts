/** Circular waveguide — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_COND, U_FREQ, U_LEN, withDefault } from '@/core/unitsets';
import { FC_LIM, LG_MAX, SINGLE_MODE_NOTE, attScale, modeName, singleModeTone } from '../waveguide-cutoff/def';
import { FILLINGS, METALS, NP_TO_DB, alphaD, cutoffForGuideWavelength, freqForGuideWavelength, skinDepth, surfaceResistance, type ModeType, type ModeWave } from '../waveguide-cutoff/model';
import { C0, M_MAX, N_MAX, P_COMPLETE, P_TE, P_TM, besselZero, circAlphaC, circCutoff, circModes, circWave, radiusForCutoff, validCircMode, type CircMode } from './model';

export const ID = 'rf/circular-waveguide';

export type SolveKey = 'fc' | 'a' | 'f' | 'aLg';

export interface CwgState {
  solveFor: SolveKey;
  /** inner radius */
  a: number;
  aUnit: string;
  f: number;
  fUnit: string;
  fc: number;
  fcUnit: string;
  lg: number;
  lgUnit: string;
  modeType: ModeType;
  n: number;
  m: number;
  filling: string;
  er: number;
  tanD: number;
  metal: string;
  sigma: number;
  sigmaUnit: string;
  len: number;
  lenUnit: string;
}

export const defaults = (): CwgState => ({
  solveFor: 'fc',
  a: 10.5e-3,
  aUnit: 'mm',
  f: 10e9,
  fUnit: 'GHz',
  fc: 8.37e9,
  fcUnit: 'GHz',
  lg: 49.9e-3,
  lgUnit: 'mm',
  modeType: 'TE',
  n: 1,
  m: 1,
  filling: 'Air',
  er: 1,
  tanD: 0,
  metal: 'Copper',
  sigma: 5.813e7,
  sigmaUnit: 'MS/m',
  len: 1,
  lenUnit: 'm',
});

const U_DIM = withDefault(U_LEN, 'mm');
const LIM = { a: [5e-5, 5] as const, f: [1e6, 3e12] as const };

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
    note: 'Round metal pipe of inner radius a. ◎ picks the unknown.',
    fields: [
      {
        kind: 'number', key: 'a', symbol: 'a', label: 'Inner radius', units: U_DIM, unitKey: 'aUnit', solvable: true, min: LIM.a[0], max: LIM.a[1],
        solvedWhen: (_s, r) => r.solveFor === 'a' || r.solveFor === 'aLg',
        onSolve: (_s, r) => { r.solveFor = r.solveFor === 'f' ? 'aLg' : 'a'; },
        help: 'Inside radius (half the bore diameter). TE₁₁ cuts off at f_c = 1.8412·c/(2πa√εr). When solved: the radius that gives the target cutoff of the selected mode (or the target λg at f).',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Mode & frequency',
    fields: [
      // a cutoff or λg target set for the old mode means something else for the new one: show the new
      // mode in the guide already entered (every TE/TM n, m with m ≥ 1 exists, so no index fix-up)
      { kind: 'select', key: 'modeType', label: 'Mode type', options: [{ value: 'TE', label: 'TE (transverse electric)' }, { value: 'TM', label: 'TM (transverse magnetic)' }], apply: (_v, s) => { s.solveFor = 'fc'; }, help: 'TE₁₁ is the dominant mode; TM₀₁ is the next one (used in rotary joints); TE₀₁ has the lowest wall loss at high frequency.' },
      { kind: 'number', key: 'n', symbol: 'n', label: 'Index around', integer: true, min: 0, max: N_MAX, help: 'Number of full-period variations around the circumference (cos nφ).' },
      { kind: 'number', key: 'm', symbol: 'm', label: 'Index radial', integer: true, min: 1, max: M_MAX, help: 'Which zero of the Bessel function, or of its derivative for TE, sets the cutoff: the number of radial field variations.' },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', solvable: true, min: LIM.f[0], max: LIM.f[1], help: 'When solved: the frequency at which the selected mode has the target guide wavelength λg.' },
      {
        kind: 'number', key: 'fc', symbol: 'f_c', label: 'Cutoff', units: U_FREQ, unitKey: 'fcUnit', solvable: true, min: FC_LIM[0], max: FC_LIM[1],
        solvedWhen: (_s, r) => r.solveFor !== 'a',
        onSolve: (_s, r) => { r.solveFor = 'fc'; },
        onUnsolve: (_s, r) => { r.solveFor = 'a'; },
        help: 'Cutoff of the selected mode. Normally calculated (green); click ◎ to make it a target and solve the radius for it.',
      },
      {
        kind: 'number', key: 'lg', symbol: 'λ_g', label: 'Guide λ', units: U_DIM, unitKey: 'lgUnit', solvable: true, min: 1e-6, max: LG_MAX,
        solvedWhen: (_s, r) => r.solveFor !== 'f' && r.solveFor !== 'aLg',
        onSolve: (_s, r) => { r.solveFor = 'fc'; },
        onUnsolve: (_s, r) => { r.solveFor = 'f'; },
        help: 'Wavelength along the guide of the selected mode, 2π/β. Normally calculated; click ◎ to make it a target and solve f (or the radius, by then clicking ◎ on a).',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Materials & length',
    fields: [
      { kind: 'select', key: 'filling', label: 'Filling', options: Object.keys(FILLINGS), apply: applyFilling, help: 'Dielectric that fills the pipe (Pozar, Appendix G, ≈10 GHz). Filling lowers every cutoff by √εr.' },
      { kind: 'number', key: 'er', symbol: 'ε_r', label: 'Permittivity', min: 1, max: 100 },
      { kind: 'number', key: 'tanD', symbol: 'tan δ', label: 'Loss tangent', min: 0, max: 1 },
      { kind: 'select', key: 'metal', label: 'Wall metal', options: Object.keys(METALS).map((k) => ({ value: k, label: METALS[k] ? `${k} (${(METALS[k]! / 1e6).toFixed(2)} MS/m)` : k })), apply: (v, s) => { const c = METALS[v]; if (c) s.sigma = c; }, help: 'Bulk conductivity (Pozar, Appendix F). Plating and roughness add loss that is not modelled.' },
      { kind: 'number', key: 'sigma', symbol: 'σ', label: 'Conductivity', units: U_COND, unitKey: 'sigmaUnit', min: 1e5, max: 1e9 },
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'Guide length', units: withDefault(U_LEN, 'm'), unitKey: 'lenUnit', unitFamily: 'none', min: 0, max: 1e5, help: 'Length for the total loss (or, below cutoff, the evanescent attenuation).' },
    ],
  },
];

const fHz = (v: number, d = 4) => si(v, 'Hz', d);
const fLen = (v: number, d = 4) => si(v, 'm', d);
const fDbm = (np: number) => `${(np * NP_TO_DB).toPrecision(3)} dB/m`;
const mname = (t: ModeType, n: number, m: number) => modeName(t, n, m);

/**
 * No answer is an error (style guide §5): the core then blanks the solved box and drops the graphs,
 * and nothing (round trips, the API) mistakes the stale input value for a result.
 */
function fail(s: CwgState, msg: string): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: CwgState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: CwgState): CalcReport {
  const s: CwgState = { ...st };
  if (!['fc', 'a', 'f', 'aLg'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  for (const [k, name] of [['er', 'εr'], ['tanD', 'tan δ'], ['sigma', 'Conductivity'], ['len', 'Length'], ['m', 'Index m'], ['n', 'Index n']] as const) finite(name, s[k]);
  if (s.solveFor !== 'a' && s.solveFor !== 'aLg' && !(finite('Radius a', s.a) > 0)) throw new Error('Radius a must be > 0.');
  if (s.solveFor !== 'f' && !(finite('Frequency', s.f) > 0)) throw new Error('Frequency must be > 0.');
  if (!(s.er >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(s.tanD >= 0)) throw new Error('tan δ must be ≥ 0.');
  if (!(s.sigma > 0)) throw new Error('Wall conductivity must be > 0.');
  if (!(s.len >= 0)) throw new Error('Length must be ≥ 0.');
  const type: ModeType = s.modeType === 'TM' ? 'TM' : 'TE';
  const { n, m } = s;
  if (!validCircMode(n, m)) throw new Error(`Mode indices must be integers with 0 ≤ n ≤ ${N_MAX} and 1 ≤ m ≤ ${M_MAX}.`);
  const mn = mname(type, n, m);
  const p = besselZero(type, n, m);

  // ── solve (exact closed-form inverses)
  // a value typed at a field limit must survive its own exact inverse, which can round just outside it
  const range = (k: 'a' | 'f', v: number) => v >= LIM[k][0] * (1 - 1e-9) && v <= LIM[k][1] * (1 + 1e-9);
  const clampTo = (k: 'a' | 'f', v: number) => Math.min(Math.max(v, LIM[k][0]), LIM[k][1]);
  if (s.solveFor === 'a') {
    if (!(finite('Target cutoff', s.fc) > 0)) throw new Error('Target cutoff must be > 0.');
    const a = radiusForCutoff(type, n, m, s.fc, s.er);
    if (!range('a', a)) return fail(s, `A ${mn} cutoff of ${fHz(s.fc)} needs a = ${fLen(a)}, outside 50 µm … 5 m.`);
    s.a = clampTo('a', a);
  } else if (s.solveFor === 'f' || s.solveFor === 'aLg') {
    if (!(finite('Target λg', s.lg) > 0)) throw new Error('Target guide wavelength must be > 0.');
    if (s.solveFor === 'f') {
      const f = freqForGuideWavelength(circCutoff(type, s.a, n, m, s.er), s.lg, s.er);
      if (!range('f', f)) return fail(s, `λg = ${fLen(s.lg)} needs f = ${fHz(f)}, outside 1 MHz … 3 THz.`);
      s.f = clampTo('f', f);
    } else {
      const fcNeed = cutoffForGuideWavelength(s.f, s.lg, s.er);
      if (fcNeed == null) return fail(s, `λg must be longer than the wavelength in the filling (λ = ${fLen(C0 / Math.sqrt(s.er) / s.f)} at ${fHz(s.f)}); ${fLen(s.lg)} is not.`);
      const a = radiusForCutoff(type, n, m, fcNeed, s.er);
      if (!range('a', a)) return fail(s, `λg = ${fLen(s.lg)} needs a = ${fLen(a)}, outside 50 µm … 5 m.`);
      s.a = clampTo('a', a);
    }
  }

  // ── forward
  const { a, er, f } = s;
  const fc = circCutoff(type, a, n, m, er);
  const wv = circWave(type, a, n, m, er, f);
  if (s.solveFor !== 'a') s.fc = fc;
  // fc of any tabulated mode lies inside FC_LIM (≤ 24.9·c/(2π·50 µm) ≈ 24 THz); λg → ∞ at cutoff is shown but not written
  const lgShown = wv.lg != null && wv.lg <= LG_MAX;
  // below cutoff the λg box shows "—" and keeps a stale value: see the same note in waveguide-cutoff
  if (s.solveFor !== 'f' && s.solveFor !== 'aLg' && lgShown) s.lg = wv.lg!;
  const lam0 = C0 / f;
  const lam = lam0 / Math.sqrt(er);
  const ac = circAlphaC(type, a, n, m, er, f, s.sigma);
  const ad = alphaD(wv, s.tanD);
  const aTot = ac != null && ad != null ? ac + ad : null;
  const rs = surfaceResistance(f, s.sigma);
  const ds = skinDepth(f, s.sigma);
  const fcOf = (x: { p: number }) => (x.p * C0) / (2 * Math.PI * a * Math.sqrt(er));
  const modes = circModes();
  const fcComplete = fcOf({ p: P_COMPLETE });
  const propagating = modes.filter((x) => fcOf(x) < f);
  const listComplete = f <= fcComplete;
  const fc11 = fcOf({ p: P_TE[1][0] });
  const fc01 = fcOf({ p: P_TM[0][0] });
  const fcTE01 = fcOf({ p: P_TE[0][0] });

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const solvedA = s.solveFor === 'a' || s.solveFor === 'aLg';
  const lgSolved = s.solveFor !== 'f' && s.solveFor !== 'aLg';

  // ── headline
  const primary: ResultItem[] = [];
  if (solvedA) primary.push(item('a', 'Inner radius', a, 'm', fLen(a, 5), { symbol: 'a', primary: true, solved: true, note: `diameter ${fLen(2 * a, 5)}` }));
  if (s.solveFor === 'f') primary.push(item('f', 'Operating frequency', f, 'Hz', fHz(f, 5), { symbol: 'f', primary: true, solved: true, note: `f/f_c = ${(f / fc).toPrecision(4)}` }));
  primary.push(item('fc', `Cutoff of ${mn}`, fc, 'Hz', fHz(fc, 5), { symbol: 'f_c', primary: true, solved: s.solveFor !== 'a', note: s.solveFor === 'a' ? 'target' : `${type === 'TE' ? 'p′' : 'p'} = ${p.toFixed(4)} · λ_c = ${fLen((2 * Math.PI * a) / p)}` }));
  primary.push(
    wv.lg != null
      ? item('lg', 'Guide wavelength', lgShown ? wv.lg : null, 'm', fLen(wv.lg, 5), { symbol: 'λ_g', primary: true, solved: lgSolved, note: !lgShown ? 'beyond the λg box range: f is at cutoff' : lgSolved ? `${(wv.lg / lam).toPrecision(4)} × λ in the filling` : 'target' })
      : item('lg', 'Guide wavelength', null, 'm', '— (cut off)', { symbol: 'λ_g', primary: true, solved: lgSolved, tone: 'fail', note: `${mn} does not propagate at ${fHz(f)}` }),
  );
  if (aTot != null) primary.push(item('alphaTot', 'Attenuation', aTot * NP_TO_DB, 'dB/m', fDbm(aTot), { symbol: 'α', primary: true, note: `${(aTot * NP_TO_DB * s.len).toPrecision(3)} dB over ${fLen(s.len, 3)}` }));
  else if (wv.alphaEv != null) primary.push(item('alphaEv', 'Evanescent decay', wv.alphaEv * NP_TO_DB, 'dB/m', `${(wv.alphaEv * NP_TO_DB).toPrecision(4)} dB/m`, { symbol: 'α_ev', primary: true, tone: 'fail', note: `${(wv.alphaEv * NP_TO_DB * 1e-3).toPrecision(3)} dB per mm` }));
  if (primary.length < 5) primary.push(item('singleBand', 'Single-mode band', fc11, 'Hz', `${fHz(fc11, 4)} – ${fHz(fc01, 4)}`, { primary: true, note: 'TE₁₁ only · up to TM₀₁ (ratio 1.306)' }));

  const g1 = `Mode ${mn}`;
  const rest: ResultItem[] = [
    item('fOverFc', 'Frequency / cutoff', f / fc, '', (f / fc).toPrecision(4), { symbol: 'f/f_c', group: g1, tone: f <= fc ? 'fail' : f < 1.05 * fc ? 'warn' : '' }),
    item('p', type === 'TE' ? 'Bessel zero p′' : 'Bessel zero p', p, '', p.toFixed(6), { symbol: type === 'TE' ? `p′_${n}${m}` : `p_${n}${m}`, group: g1, note: type === 'TE' ? `zero of J′${n}` : `zero of J${n}` }),
    item('lambda', 'Wavelength in filling', lam, 'm', fLen(lam), { symbol: 'λ', group: g1, note: er !== 1 ? `free space ${fLen(lam0)}` : undefined }),
    item('beta', 'Phase constant', wv.beta, 'rad/m', wv.beta != null ? `${wv.beta.toPrecision(5)} rad/m` : '— (cut off)', { symbol: 'β', group: g1 }),
    item('vp', 'Phase velocity', wv.vp != null ? wv.vp / C0 : null, 'c', wv.vp != null ? `${(wv.vp / C0).toPrecision(4)} c` : '—', { symbol: 'v_p', group: g1 }),
    item('vg', 'Group velocity', wv.vg != null ? wv.vg / C0 : null, 'c', wv.vg != null ? `${(wv.vg / C0).toPrecision(4)} c` : '—', { symbol: 'v_g', group: g1, note: wv.vg != null ? `delay ${si(1 / wv.vg, 's', 3)}/m` : undefined }),
    wv.zw != null
      ? item('zw', 'Wave impedance', wv.zw, 'Ω', si(wv.zw, 'Ω', 4), { symbol: `Z_${type}`, group: g1, note: `η = ${si(wv.eta, 'Ω', 4)}` })
      : item('zw', 'Wave impedance', null, 'Ω', wv.zwIm != null ? `j·${si(wv.zwIm, 'Ω', 3)} (reactive)` : 'at cutoff (Z_TE → ∞, Z_TM → 0)', { symbol: `Z_${type}`, group: g1, note: type === 'TE' ? 'inductive below cutoff' : 'capacitive below cutoff' }),
  ];
  if (wv.alphaEv != null) rest.push(item('alphaEvNp', 'Evanescent attenuation', wv.alphaEv, 'Np/m', `${wv.alphaEv.toPrecision(4)} Np/m`, { symbol: 'α', group: g1, note: `${(wv.alphaEv * NP_TO_DB * s.len).toPrecision(4)} dB over ${fLen(s.len, 3)}` }));
  const g2 = 'Loss';
  rest.push(
    item('rs', 'Surface resistance', rs, 'Ω', si(rs, 'Ω', 4), { symbol: 'R_s', group: g2, note: `skin depth ${si(ds, 'm', 3)}` }),
    item('alphaC', 'Conductor loss', ac != null ? ac * NP_TO_DB : null, 'dB/m', ac != null ? fDbm(ac) : '—', { symbol: 'α_c', group: g2 }),
    item('alphaD', 'Dielectric loss', ad != null ? ad * NP_TO_DB : null, 'dB/m', ad != null ? fDbm(ad) : '—', { symbol: 'α_d', group: g2 }),
    item('lossLen', 'Loss over length', aTot != null ? aTot * NP_TO_DB * s.len : wv.alphaEv != null ? wv.alphaEv * NP_TO_DB * s.len : null, 'dB', aTot != null ? `${(aTot * NP_TO_DB * s.len).toPrecision(4)} dB` : wv.alphaEv != null ? `${(wv.alphaEv * NP_TO_DB * s.len).toPrecision(4)} dB (evanescent)` : '—', { symbol: 'L', group: g2, note: `ℓ = ${fLen(s.len, 3)}` }),
  );
  const acTE11 = circAlphaC('TE', a, 1, 1, er, f, s.sigma);
  const acTE01 = circAlphaC('TE', a, 0, 1, er, f, s.sigma);
  if (acTE11 != null) rest.push(item('alphaTE11', 'TE₁₁ conductor loss', acTE11 * NP_TO_DB, 'dB/m', fDbm(acTE11), { group: 'Mode comparison (same pipe)', note: 'dominant mode' }));
  rest.push(item('alphaTE01', 'TE₀₁ conductor loss', acTE01 != null ? acTE01 * NP_TO_DB : null, 'dB/m', acTE01 != null ? fDbm(acTE01) : `— (cuts in at ${fHz(fcTE01)})`, { group: 'Mode comparison (same pipe)', note: acTE01 != null ? 'falls as f^−3/2 far above cutoff' : undefined }));
  const g3 = 'Guide';
  rest.push(
    item('diameter', 'Inner diameter', 2 * a, 'm', fLen(2 * a, 5), { symbol: '2a', group: g3 }),
    item('fcTE11', 'TE₁₁ cutoff (dominant)', fc11, 'Hz', fHz(fc11), { group: g3 }),
    item('fcTM01', 'TM₀₁ cutoff (2nd mode)', fc01, 'Hz', fHz(fc01), { group: g3 }),
    item('fcTE01', 'TE₀₁ / TM₁₁ cutoff', fcTE01, 'Hz', fHz(fcTE01), { group: g3, note: 'degenerate pair' }),
    item('nProp', 'Propagating modes', propagating.length, '', listComplete ? String(propagating.length) : `≥ ${propagating.length}`, { group: g3, tone: propagating.length > 1 ? 'warn' : propagating.length === 0 ? 'fail' : '', note: propagating.length ? propagating.slice(0, 6).map((x) => mname(x.type, x.n, x.m)).join(', ') + (propagating.length > 6 ? ' …' : '') : 'none: everything is cut off' }),
  );
  report.results = [...primary, ...rest];
  report.tables.push(modeTable(s, modes, type, fcOf, fcComplete));

  // ── status and warnings
  const multi = propagating.length > 1;
  report.status = !wv.propagating ? { text: `${mn} CUT OFF`, tone: 'fail' } : multi ? { text: 'MULTIMODE', tone: 'warn' } : { text: 'SINGLE MODE', tone: 'pass' };
  if (!wv.propagating) warnings.push(`${mn} is cut off at ${fHz(f)} (f_c = ${fHz(fc)}): it decays by ${(wv.alphaEv! * NP_TO_DB * 1e-3).toPrecision(3)} dB per mm. Raise f above f_c or enlarge the pipe.`);
  else if (f < 1.05 * fc) warnings.push(`f is within 5 % of the ${mn} cutoff: the group velocity is tiny, dispersion is extreme and the perturbation loss formula is no longer valid. Operate further above cutoff.`);
  if (multi && wv.propagating) {
    const others = propagating.filter((x) => !(x.type === type && x.n === n && x.m === m));
    warnings.push(`${listComplete ? propagating.length : `At least ${propagating.length}`} modes propagate at ${fHz(f)} (${others.slice(0, 4).map((x) => mname(x.type, x.n, x.m)).join(', ')}${others.length > 4 ? ' …' : ''} besides ${mn}). Bends, ellipticity and transitions convert power between them${type === 'TE' && n === 1 && m === 1 ? `; stay below the TM₀₁ cutoff ${fHz(fc01)} or use a smaller pipe` : '; use mode filters or launch the mode cleanly'}.`);
  }
  if (type === 'TE' && n === 1 && m === 1 && wv.propagating && !multi && f > 0.95 * fc01) warnings.push(`f is within 5 % of the TM₀₁ cutoff (${fHz(fc01)}): tolerances or a slight dielectric load can let TM₀₁ propagate. Use a slightly smaller radius.`);
  if (!listComplete) warnings.push(`The pipe is ${((2 * Math.PI * a * Math.sqrt(er)) / lam0).toFixed(1)} rad in k·a: modes beyond n = ${N_MAX} or m = ${M_MAX} also propagate and are not listed. Such an overmoded guide needs careful mode control.`);
  if (s.tanD > 0.05) warnings.push(`tan δ = ${s.tanD} is large: α_d = k² tan δ/2β assumes a low-loss filling (tan δ ≪ 1). Use a lower-loss material or a full complex-β model.`);
  if (wv.propagating && ds > 0.01 * a) warnings.push(`Skin depth ${si(ds, 'm', 3)} exceeds 1 % of the radius: the surface-impedance loss model loses accuracy. Use a better conductor or a larger pipe.`);
  if (type === 'TE' && n === 0) notes.push('TE₀m modes have no axial wall current, so their conductor loss falls as f^−3/2 far above cutoff. TE₀₁ is degenerate with TM₁₁, so any bend or out-of-roundness couples the two: long TE₀₁ runs need mode filters and very straight pipe.');
  if (type === 'TM' && n === 0) notes.push('TM₀₁ is rotationally symmetric, which is why rotary joints use it. TE₁₁ propagates as well and must be suppressed by the transitions.');
  if (n > 0) notes.push(`Modes with n ≥ 1 come in two polarisations (cos nφ and sin nφ) with the same cutoff; ellipticity of the pipe splits them and rotates the polarisation.`);
  notes.push(
    'Conductor loss by the perturbation method with smooth walls (bulk σ). Roughness and plating add loss in practice.',
    `Bessel zeros p′_nm and p_nm are tabulated for n ≤ ${N_MAX}, m ≤ ${M_MAX} (15 significant digits).`,
  );
  report.summary = `⌀ ${fLen(2 * a, 4)}${er !== 1 ? ` · εr ${er}` : ''} · ${mn} at ${fHz(f)} · f_c ${fHz(fc)} · TE₁₁ ${fHz(fc11, 3)} / TM₀₁ ${fHz(fc01, 3)}`;
  report.details = { a, f, fc, p, wave: wv, alphaC: ac, alphaD: ad, rs, skinDepth: ds, fcTE11: fc11, fcTM01: fc01, fcTE01, listComplete };
  report.graphs = graphs(s, type, modes, fc, wv, fcOf);
  return report;
}

function modesAt(modes: CircMode[], p: number): string {
  return modes
    .filter((x) => Math.abs(x.p / p - 1) < 1e-9)
    .map((x) => mname(x.type, x.n, x.m))
    .join(' / ');
}

function modeTable(s: CwgState, modes: CircMode[], type: ModeType, fcOf: (x: { p: number }) => number, fcComplete: number): TableSpec {
  const fmax = Math.min(Math.max(2.2 * s.f, 2.2 * fcOf(modes[0])), fcComplete);
  const isSel = (x: CircMode) => x.type === type && x.n === s.n && x.m === s.m;
  let list = modes.filter((x) => fcOf(x) <= fmax).slice(0, 16);
  if (!list.some(isSel)) {
    const sel = modes.find(isSel);
    if (sel) list = [...list.slice(0, 15), sel];
  }
  const rows = list.map((x) => {
    const w = circWave(x.type, s.a, x.n, x.m, s.er, s.f);
    const ac = circAlphaC(x.type, s.a, x.n, x.m, s.er, s.f, s.sigma);
    const ad = alphaD(w, s.tanD);
    return { mode: mname(x.type, x.n, x.m), p: x.p, fc: fcOf(x), ratio: s.f / fcOf(x), lg: w.lg, att: w.propagating ? (ac != null && ad != null ? (ac + ad) * NP_TO_DB : null) : w.alphaEv! * NP_TO_DB, zw: w.zw, sel: isSel(x) };
  });
  return {
    id: 'modes',
    title: `Modes up to ${fHz(fmax, 3)} at f = ${fHz(s.f)}`,
    columns: [
      { key: 'mode', label: 'Mode', align: 'left' },
      { key: 'p', label: 'p / p′' },
      { key: 'fc', label: 'fc', unit: 'Hz' },
      { key: 'ratio', label: 'f/f_c' },
      { key: 'lg', label: 'λg', unit: 'm' },
      { key: 'att', label: 'Loss / decay', unit: 'dB/m' },
      { key: 'zw', label: 'Zw', unit: 'Ω' },
    ],
    rows: rows.map((r) => ({ mode: r.mode, p: r.p, fc: r.fc, ratio: r.ratio, lg: r.lg, att: r.att, zw: r.zw })),
    display: rows.map((r) => ({
      mode: `${r.mode}${r.sel ? ' ◂' : ''}`,
      p: r.p.toFixed(4),
      fc: fHz(r.fc, 4),
      ratio: r.ratio.toFixed(3),
      lg: r.lg != null ? fLen(r.lg, 4) : 'cut off',
      att: r.att == null ? '—' : r.ratio > 1 ? `${r.att.toPrecision(3)} (loss)` : `${r.att.toPrecision(4)} (decay)`,
      zw: r.zw != null ? si(r.zw, 'Ω', 4) : 'reactive',
    })),
    rowTones: rows.map((r, i) => singleModeTone(i === 0, r.ratio)),
    note: `${SINGLE_MODE_NOTE} p / p′ is the Bessel zero (Pozar Tables 3.4/3.5).`,
  };
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

function graphs(s: CwgState, type: ModeType, modes: CircMode[], fc: number, wv: ModeWave, fcOf: (x: { p: number }) => number): GraphSpec[] {
  const out: GraphSpec[] = [];
  // 1 — dispersion of the lowest distinct modes
  const distinct: CircMode[] = [];
  for (const x of modes) if (!distinct.some((y) => Math.abs(y.p / x.p - 1) < 1e-9)) distinct.push(x);
  const fTop = Math.max(1.4 * s.f, 2.2 * fcOf(modes[0]), 1.15 * fc);
  const pal = ['#1f4e5f', '#c47b17', '#4f8a8b', '#6b5b95', '#2f7d4f', '#386a77'];
  const series: NonNullable<GraphSpec['series']> = distinct
    .slice(0, 6)
    .filter((x) => fcOf(x) < fTop)
    .map((x, i) => {
      const fx = fcOf(x);
      const fs = linspace(0, 1, 90).map((t) => fx + (fTop - fx) * t * t);
      return { label: modesAt(modes, x.p), x: fs, y: fs.map((ff) => circWave(x.type, s.a, x.n, x.m, s.er, ff).beta ?? 0), color: pal[i % pal.length], width: Math.abs(fx / fc - 1) < 1e-9 ? 2.4 : 1.5 };
    });
  series.push({ label: 'light line k', x: [0, fTop], y: [0, (2 * Math.PI * fTop * Math.sqrt(s.er)) / C0], color: '#9a8f7a', width: 1, dash: [4, 3] });
  out.push({
    id: 'dispersion',
    title: 'Mode dispersion',
    subtitle: 'β = √(k² − kc²) for the lowest modes; a mode propagates right of its cutoff',
    x: { label: 'Frequency', unit: 'Hz' },
    y: [{ id: 'b', label: 'Phase constant β', unit: 'rad/m', includeZero: true }],
    series,
    vlines: [{ value: s.f, label: `f = ${fHz(s.f, 3)}`, color: '#8b1e1e', dash: [5, 4] }],
    markers: wv.beta != null ? [{ x: s.f, y: wv.beta, axis: 'b', label: mname(type, s.n, s.m) }] : [],
    xRange: [0, fTop],
  });

  // 2 — conductor loss of TE11, TM01, TE01 (and the selected mode) vs frequency
  const fc11 = fcOf({ p: P_TE[1][0] });
  const f1 = Math.max(6 * fc11, 1.3 * s.f, 1.5 * fc);
  const curves: { label: string; t: ModeType; n: number; m: number; color: string; dash?: number[] }[] = [
    { label: 'TE₁₁', t: 'TE', n: 1, m: 1, color: '#1f4e5f' },
    { label: 'TM₀₁', t: 'TM', n: 0, m: 1, color: '#c47b17', dash: [6, 3] },
    { label: 'TE₀₁', t: 'TE', n: 0, m: 1, color: '#2f7d4f', dash: [2, 3] },
  ];
  if (!curves.some((c) => c.t === type && c.n === s.n && c.m === s.m)) curves.push({ label: mname(type, s.n, s.m), t: type, n: s.n, m: s.m, color: '#6b5b95' });
  const raw = curves.map((c) => {
    const fcx = circCutoff(c.t, s.a, c.n, c.m, s.er);
    const f0 = 1.1 * fcx;
    if (f0 >= f1) return null;
    const fs = linspace(0, 1, 140).map((t) => f0 * (f1 / f0) ** t);
    return { c, fs, ys: fs.map((ff) => (circAlphaC(c.t, s.a, c.n, c.m, s.er, ff, s.sigma) ?? 0) * NP_TO_DB) };
  });
  // cap the axis at the TE11 loss just above cutoff so the curves' minima stay readable
  const capRef = (circAlphaC('TE', s.a, 1, 1, s.er, 1.25 * fc11, s.sigma) ?? 0) * NP_TO_DB * 1.6;
  const opAc = wv.propagating ? (circAlphaC(type, s.a, s.n, s.m, s.er, s.f, s.sigma) ?? 0) * NP_TO_DB : null;
  const cap = Math.max(capRef, (opAc ?? 0) * 1.3);
  const sc = attScale(cap);
  out.push({
    id: 'loss',
    title: 'Conductor loss by mode',
    subtitle: 'Smooth walls; each curve starts at 1.1 fc. TE₀₁ is the only one that keeps falling with frequency.',
    x: { label: 'Frequency', unit: 'Hz' },
    y: [{ id: 'y', label: 'Conductor loss αc', unit: sc.unit, min: 0, max: cap * sc.k }],
    series: raw.filter((r): r is NonNullable<typeof r> => r != null).map((r) => ({ label: r.c.label, x: r.fs, y: r.ys.map((v) => Math.min(v, cap * 1.5) * sc.k), color: r.c.color, width: r.c.t === type && r.c.n === s.n && r.c.m === s.m ? 2.4 : 1.5, dash: r.c.dash })),
    vlines: [{ value: s.f, label: `f = ${fHz(s.f, 3)}`, color: '#9a8f7a' }],
    markers: opAc != null ? [{ x: s.f, y: Math.min(opAc, cap * 1.5) * sc.k, axis: 'y', label: `${(opAc * sc.k).toPrecision(3)} ${sc.unit}` }] : [],
  });

  // 3 — λg and wave impedance of the selected mode
  const fs3 = linspace(0, 1, 160).map((t) => 1.02 * fc * (Math.max(3 * fc, 1.3 * s.f) / (1.02 * fc)) ** t);
  const ws = fs3.map((ff) => circWave(type, s.a, s.n, s.m, s.er, ff));
  out.push({
    id: 'lg',
    title: 'λg and impedance',
    subtitle: `${mname(type, s.n, s.m)} above cutoff`,
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

export const def: CalcDef<CwgState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Circular-guide TE/TM modes: f_c = p·c/(2πa√εr) with p′_nm, p_nm the zeros of J_n′, J_n (tabulated to 15 digits, checked against Abramowitz & Stegun Table 9.5 and Pozar Tables 3.4/3.5), β, λg, Z_TE = kη/β, Z_TM = βη/k (Pozar, Microwave Engineering 4e, §3.1, §3.4); conductor loss α_c(TE) = R_s/(aη√(1−(f_c/f)²))·[(f_c/f)² + n²/(p′²−n²)], α_c(TM) = R_s/(aη√(1−(f_c/f)²)) (Marcuvitz, Waveguide Handbook §2.3; Pozar eq. 3.133 for TE₁₁); dielectric loss k²tanδ/2β. Radius and frequency are solved with exact closed-form inverses.',
  fields,
  defaults,
  solve: {
    default: 'fc',
    analysis: 'fc',
    options: [
      { key: 'fc', label: 'Cutoff and λg from a, f (analysis)' },
      { key: 'a', label: 'Radius a for a target cutoff' },
      { key: 'f', label: 'Frequency for a target λg' },
      { key: 'aLg', label: 'Radius a for a target λg at f' },
    ],
  },
  compute,
  sync: (s) => {
    const m = FILLINGS[s.filling];
    if (m && (Math.abs(m.er - s.er) > 1e-12 || Math.abs(m.tanD - s.tanD) > 1e-12)) s.filling = 'Custom';
    const c = METALS[s.metal];
    if (c && Math.abs(c - s.sigma) > 1e-3) s.metal = 'Custom';
  },
  examples: [
    { id: 'te11-21mm', label: '21 mm copper pipe at 10 GHz, TE₁₁', state: defaults() },
    { id: 'pozar-3-2', label: 'Pozar ex. 3.2: PTFE-filled, a = 5 mm, gold, 14 GHz, 30 cm', state: { solveFor: 'fc', a: 5e-3, f: 14e9, modeType: 'TE', n: 1, m: 1, filling: 'PTFE (Teflon)', er: 2.08, tanD: 0.0004, metal: 'Gold', sigma: 4.098e7, len: 0.3 } },
    { id: 'tm01-rotary', label: 'Rotary joint: TM₀₁ at 9.4 GHz, a = 13.5 mm (TE₁₁ also propagates)', state: { solveFor: 'fc', a: 13.5e-3, f: 9.4e9, modeType: 'TM', n: 0, m: 1, filling: 'Air', er: 1, tanD: 0, metal: 'Aluminium', sigma: 3.816e7, len: 0.2 } },
    { id: 'te01-60g', label: 'Low-loss TE₀₁ at 60 GHz in a 12 mm copper pipe', state: { solveFor: 'fc', a: 6e-3, f: 60e9, modeType: 'TE', n: 0, m: 1, filling: 'Air', er: 1, tanD: 0, metal: 'Copper', sigma: 5.813e7, len: 10 } },
    { id: 'design-3g', label: 'Design: radius for a 3 GHz TE₁₁ cutoff', state: { solveFor: 'a', fc: 3e9, f: 3.5e9, modeType: 'TE', n: 1, m: 1, filling: 'Air', er: 1, tanD: 0, metal: 'Aluminium', sigma: 3.816e7, len: 1 } },
    { id: 'vent-cell', label: 'Below cutoff: 6 mm honeycomb cell, 15 mm deep, at 10 GHz', state: { solveFor: 'fc', a: 3e-3, f: 10e9, modeType: 'TE', n: 1, m: 1, filling: 'Air', er: 1, tanD: 0, metal: 'Aluminium', sigma: 3.816e7, len: 15e-3 } },
  ],
};
