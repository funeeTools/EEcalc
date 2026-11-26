/** Common-mode choke — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { abs, arg } from '@/core/math/complex';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_IND, U_OHM, withDefault } from '@/core/unitsets';
import { type ChokeParams, cmFlux, couplingFromLeak, insertionLoss, lcm, ldm, selfResonance, zcm, zdm } from './model';

export const ID = 'emc/common-mode-choke';

/** Source / load terminations. CISPR 17 measures filter insertion loss in 50 Ω, plus the 0.1 Ω / 100 Ω "approximate worst case". */
export const SYSTEMS: Record<string, { zsCm: number; zlCm: number; zsDm: number; zlDm: number } | null> = {
  Custom: null,
  '50 Ω / 50 Ω (CISPR 17)': { zsCm: 50, zlCm: 50, zsDm: 50, zlDm: 50 },
  '0.1 Ω / 100 Ω (CISPR 17 worst case)': { zsCm: 0.1, zlCm: 100, zsDm: 0.1, zlDm: 100 },
  '100 Ω / 0.1 Ω (CISPR 17 worst case)': { zsCm: 100, zlCm: 0.1, zsDm: 100, zlDm: 0.1 },
};

export interface ChokeState {
  solveFor: 'l' | 'n' | 'al';
  l: number;
  lUnit: string;
  n: number;
  al: number;
  alUnit: string;
  cp: number;
  cpUnit: string;
  /** Parallel loss resistance; null = lossless */
  rp: number | null;
  rpUnit: string;
  /** Leakage inductance, percent of L (one winding, other shorted) */
  leak: number;
  rdc: number;
  rdcUnit: string;
  system: string;
  zsCm: number;
  zlCm: number;
  zsDm: number;
  zlDm: number;
  f: number;
  fUnit: string;
  /** Differential (line) current, rms */
  idm: number;
  /** Peak common-mode current (null = skip the flux check) */
  icm: number | null;
  /** Core effective area (null = skip the flux check) */
  ae: number | null;
  aeUnit: string;
  bmax: number;
}

export const defaults = (): ChokeState => ({
  solveFor: 'n',
  l: 10e-3,
  lUnit: 'mH',
  n: 50,
  al: 4e-6,
  alUnit: 'µH/N²',
  cp: 10e-12,
  cpUnit: 'pF',
  rp: 20e3,
  rpUnit: 'kΩ',
  leak: 1,
  rdc: 0.1,
  rdcUnit: 'mΩ',
  system: '50 Ω / 50 Ω (CISPR 17)',
  zsCm: 50,
  zlCm: 50,
  zsDm: 50,
  zlDm: 50,
  f: 150e3,
  fUnit: 'kHz',
  idm: 2,
  icm: null,
  ae: null,
  aeUnit: 'mm²',
  bmax: 0.3,
});

const U_AL: Record<string, number> = { 'µH/N²': 1e-6, 'nH/N²': 1e-9 };
const U_AREA: Record<string, number> = { 'mm²': 1e-6, 'cm²': 1e-4 };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Winding',
    note: 'Two equal windings on one core. Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'l', symbol: 'L', label: 'Inductance', units: withDefault(U_IND, 'mH'), unitKey: 'lUnit', solvable: true, min: 1e-9, max: 10, help: 'Self-inductance of one winding, as the data sheet quotes it. For a well-coupled choke this is the common-mode inductance.' },
      { kind: 'number', key: 'n', symbol: 'N', label: 'Turns', solvable: true, min: 1, max: 10000, help: 'Turns on each winding (both windings equal). A solved N is usually fractional: round up and read the inductance in the results.' },
      { kind: 'number', key: 'al', symbol: 'A_L', label: 'A_L factor', units: U_AL, unitKey: 'alUnit', solvable: true, min: 1e-10, max: 1e-3, help: 'Inductance factor: core inductance per turn² from the core data sheet (L = A_L·N²). It falls with frequency above a few hundred kHz in high-µ ferrite.' },
    ],
  },
  {
    kind: 'section',
    title: 'Parasitics',
    fields: [
      { kind: 'number', key: 'cp', symbol: 'C_p', label: 'Winding C', units: U_CAP, unitKey: 'cpUnit', min: 0, max: 1e-6, help: 'Winding capacitance: effective capacitance across the common-mode impedance. From a data-sheet self-resonance f_r: C_p = 1/((2πf_r)²L). 0 = none.' },
      { kind: 'number', key: 'rp', symbol: 'R_p', label: 'Core loss R', units: withDefault(U_OHM, 'kΩ'), unitKey: 'rpUnit', optional: true, zeroHint: 'lossless', min: 1, max: 1e9, help: 'Core loss resistance: core loss as a resistor across L; it equals the peak |Z| at self-resonance on the data-sheet curve. Leave blank for a lossless choke.' },
      { kind: 'number', key: 'leak', symbol: 'L_lk/L', label: 'Leakage', suffix: '%', min: 0, max: 50, help: 'Leakage as data sheets measure it: one winding with the other shorted, as a percentage of L. About 0.5–2 % for sectional toroid windings, much less for bifilar.' },
      { kind: 'number', key: 'rdc', symbol: 'R_dc', label: 'DC resistance', units: withDefault(U_OHM, 'mΩ'), unitKey: 'rdcUnit', min: 0, max: 1e3 },
    ],
  },
  {
    kind: 'section',
    title: 'Test system',
    fields: [
      {
        kind: 'select',
        key: 'system',
        label: 'Source / load',
        options: Object.keys(SYSTEMS),
        apply: (v, s) => {
          const m = SYSTEMS[v];
          if (m) Object.assign(s, m);
        },
        help: 'CISPR 17 measures filter insertion loss between 50 Ω terminations, and in an “approximate worst case” with 0.1 Ω and 100 Ω swapped either way.',
      },
      { kind: 'number', key: 'zsCm', symbol: 'Z_s,CM', label: 'CM source', unit: 'Ω', min: 1e-3, max: 1e6, help: 'Common-mode source impedance, resistive. Common mode: both lines tied together at each end.' },
      { kind: 'number', key: 'zlCm', symbol: 'Z_l,CM', label: 'CM load', unit: 'Ω', min: 1e-3, max: 1e6, help: 'Common-mode load impedance. A two-line LISN presents 25 Ω to common mode (two 50 Ω in parallel).' },
      { kind: 'number', key: 'zsDm', symbol: 'Z_s,DM', label: 'DM source', unit: 'Ω', min: 1e-3, max: 1e6, help: 'Differential-mode source impedance, resistive.' },
      { kind: 'number', key: 'zlDm', symbol: 'Z_l,DM', label: 'DM load', unit: 'Ω', min: 1e-3, max: 1e6, help: 'Differential-mode load impedance. A two-line LISN presents 100 Ω between the lines.' },
    ],
  },
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e10, help: 'Conducted-emission bands start at 150 kHz (CISPR 32 / CISPR 25).' },
      { kind: 'number', key: 'idm', symbol: 'I_DM', label: 'Line current', unit: 'A', min: 0, max: 1e3, help: 'RMS differential (load) current through both windings, for copper loss and DC drop. It cancels in the core.' },
    ],
  },
  {
    kind: 'section',
    title: 'Core flux (optional)',
    collapsed: true,
    note: 'Peak flux from common-mode current; leave blank to skip.',
    fields: [
      { kind: 'number', key: 'icm', symbol: 'Î_CM', label: 'CM current', unit: 'A', optional: true, zeroHint: 'skip', min: 0, max: 100, help: 'Peak total common-mode current (both lines together).' },
      { kind: 'number', key: 'ae', symbol: 'A_e', label: 'Core area', units: U_AREA, unitKey: 'aeUnit', optional: true, zeroHint: 'skip', min: 1e-9, max: 1e-2, help: 'Effective magnetic cross-section A_e from the core data sheet.' },
      { kind: 'number', key: 'bmax', symbol: 'B_max', label: 'Flux limit', unit: 'T', min: 1e-3, max: 3, help: 'Allowed peak flux density. Keep well below saturation at the hottest temperature; MnZn ferrite saturates near 0.35–0.45 T at 100 °C.' },
    ],
  },
];

const LABEL: Record<ChokeState['solveFor'], string> = { l: 'Inductance per winding', n: 'Turns per winding', al: 'Inductance factor' };

const fL = (h: number) => si(h, 'H', 4);
const fZ = (z: number) => si(z, 'Ω', 4);
const fDb = (d: number) => `${d.toFixed(2)} dB`;
/** A_L in the units core data sheets use (nH/N² below 1 µH, else µH/N²). */
export const fAL = (al: number) => (al >= 1e-6 ? `${+(al * 1e6).toPrecision(4)} µH/N²` : `${+(al * 1e9).toPrecision(4)} nH/N²`);

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: ChokeState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

const paramsOf = (s: ChokeState): ChokeParams => ({ l: s.l, cp: s.cp, rp: s.rp, rdc: s.rdc, leak: s.leak / 100 });

function run(st: ChokeState): CalcReport {
  const s: ChokeState = { ...st };
  const k = s.solveFor;
  const pos = (name: string, v: unknown) => {
    if (!(finite(name, v) > 0)) throw new Error(`${name} must be > 0.`);
  };
  for (const key of ['l', 'n', 'al'] as const) if (key !== k) pos(LABEL[key], s[key]);
  if (!(finite('Winding capacitance', s.cp) >= 0)) throw new Error('Winding capacitance must be ≥ 0.');
  if (s.rp != null) pos('Parallel loss resistance', s.rp);
  if (!(finite('Leakage', s.leak) >= 0 && s.leak < 100)) throw new Error('Leakage must be 0 … <100 % of L.');
  if (!(finite('DC resistance', s.rdc) >= 0)) throw new Error('DC resistance must be ≥ 0.');
  for (const key of ['zsCm', 'zlCm', 'zsDm', 'zlDm'] as const) pos('Source and load impedances', s[key]);
  pos('Frequency', s.f);
  if (!(finite('Line current', s.idm) >= 0)) throw new Error('Line current must be ≥ 0.');
  if (s.icm != null && !(finite('CM current', s.icm) >= 0)) throw new Error('CM current must be ≥ 0.');
  if (s.ae != null) pos('Core area', s.ae);
  pos('Allowed flux density', s.bmax);

  // ── solve L = A_L·N² for the unknown (closed form, exact inverse)
  if (k === 'l') s.l = s.al * s.n * s.n;
  else if (k === 'n') s.n = Math.sqrt(s.l / s.al);
  else s.al = s.l / (s.n * s.n);
  // never write a solved value outside its field's limits
  const nope = (msg: string) => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: k, status: { text: 'NO SOLUTION', tone: 'fail' as const } });
  if (k === 'n' && !(s.n >= 1 - 1e-12 && s.n <= 1e4)) return nope(`L = ${fL(s.l)} on A_L = ${fAL(s.al)} needs N = ${s.n.toPrecision(3)} turns, outside 1–10 000. Choose a core with a different A_L.`);
  if (k === 'al' && !(s.al >= 1e-10 && s.al <= 1e-3)) return nope(`A_L = ${fAL(s.al)} is outside 0.1 nH … 1 mH per turn²: no practical core. Change N or L.`);
  if (k === 'l' && !(s.l >= 1e-9 && s.l <= 10)) return nope(`A_L = ${fAL(s.al)} with N = ${+s.n.toPrecision(4)} gives L = ${fL(s.l)}, outside the 1 nH – 10 H range of the inductance field. Check the turns and the A_L unit.`);
  return report(s);
}

function report(s: ChokeState): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const p = paramsOf(s);
  const kc = couplingFromLeak(p.leak);
  const Lcm = lcm(p);
  const Ldm = ldm(p);
  const Lsc = s.l * p.leak;
  const zc = zcm(p, s.f);
  // lossless model exactly at self-resonance: the impedance is unbounded (capped at Q = 10¹² in the model)
  const unbounded = s.rp == null && abs(zc) > 1e6 * 2 * Math.PI * s.f * lcm(p);
  const zd = zdm(p, s.f);
  const ilC = insertionLoss(zc, s.zsCm, s.zlCm);
  const ilD = insertionLoss(zd, s.zsDm, s.zlDm);
  const fr = selfResonance(Lcm, s.cp);
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  const prim: ResultItem[] = [];
  if (k === 'l') prim.push(item('l', 'Inductance per winding', s.l, 'H', fL(s.l), { symbol: 'L', primary: true, solved: true, note: `A_L·N² · L_CM ${fL(Lcm)}` }));
  if (k === 'n') {
    const nUp = Math.ceil(s.n - 1e-9);
    prim.push(item('n', 'Turns per winding', s.n, '', s.n.toFixed(2), { symbol: 'N', primary: true, solved: true, note: `round up to ${nUp} → L = ${fL(s.al * nUp * nUp)}` }));
  }
  if (k === 'al') prim.push(item('al', 'Inductance factor', s.al, 'H', fAL(s.al), { symbol: 'A_L', primary: true, solved: true, note: 'core needed for L at N turns' }));
  if (unbounded) {
    prim.push(item('zcm', `CM impedance at ${si(s.f, 'Hz')}`, null, 'Ω', '∞ (lossless at f_r)', { symbol: '|Z_CM|', primary: true, tone: 'warn', note: 'enter R_p for a finite peak' }));
    prim.push(item('ilCm', 'CM insertion loss', null, 'dB', '∞ (lossless at f_r)', { symbol: 'IL_CM', primary: true, tone: 'warn', note: `${s.zsCm} Ω → ${s.zlCm} Ω` }));
    rep.warnings.push('Lossless choke exactly at its self-resonance: the model’s impedance is unbounded, which no real choke reaches. Enter the core loss resistance R_p (the peak |Z| on the data-sheet curve) to get a finite value.');
  } else {
    prim.push(item('zcm', `CM impedance at ${si(s.f, 'Hz')}`, abs(zc), 'Ω', fZ(abs(zc)), { symbol: '|Z_CM|', primary: true, note: s.f > fr ? 'above self-resonance: capacitive' : 'inductive' }));
    prim.push(item('ilCm', 'CM insertion loss', ilC, 'dB', fDb(ilC), { symbol: 'IL_CM', primary: true, note: `${s.zsCm} Ω → ${s.zlCm} Ω` }));
  }
  prim.push(item('ilDm', 'DM insertion loss', ilD, 'dB', fDb(ilD), { symbol: 'IL_DM', primary: true, note: `from leakage, ${s.zsDm} Ω → ${s.zlDm} Ω` }));
  if (Number.isFinite(fr)) prim.push(item('fr', 'Self-resonance', fr, 'Hz', si(fr, 'Hz', 4), { symbol: 'f_r', primary: true, note: `|Z| peak ${s.rp != null ? fZ(abs(zcm(p, fr))) : '∞ (lossless)'}` }));

  const nUp = Math.ceil(s.n - 1e-9);
  const sec: ResultItem[] = [
    ...(k !== 'l' ? [item('l', 'Inductance per winding', s.l, 'H', fL(s.l), { symbol: 'L', group: 'Windings' })] : []),
    ...(k !== 'n' ? [item('n', 'Turns per winding', s.n, '', `${+s.n.toPrecision(6)}`, { symbol: 'N', group: 'Windings' })] : []),
    ...(k !== 'al' ? [item('al', 'Inductance factor', s.al, 'H', fAL(s.al), { symbol: 'A_L', group: 'Windings' })] : []),
    item('lcm', 'Common-mode inductance', Lcm, 'H', fL(Lcm), { symbol: 'L_CM', group: 'Windings', note: 'L(1+k)/2, windings in parallel' }),
    item('k', 'Coupling coefficient', kc, '', kc.toFixed(5), { symbol: 'k', group: 'Windings', note: '√(1 − L_lk/L)' }),
    item('lsc', 'Leakage (other shorted)', Lsc, 'H', fL(Lsc), { symbol: 'L_lk', group: 'Windings' }),
    ...(k === 'n' ? [item('lRounded', `L with N = ${nUp}`, s.al * nUp * nUp, 'H', fL(s.al * nUp * nUp), { symbol: 'L(N↑)', group: 'Windings' })] : []),
    item('zcmRe', 'CM resistance', zc.re, 'Ω', fZ(zc.re), { symbol: 'R_CM', group: `Common mode at ${si(s.f, 'Hz')}` }),
    item('zcmIm', 'CM reactance', zc.im, 'Ω', fZ(zc.im), { symbol: 'X_CM', group: `Common mode at ${si(s.f, 'Hz')}` }),
    item('zcmPhase', 'CM impedance phase', (arg(zc) * 180) / Math.PI, '°', `${((arg(zc) * 180) / Math.PI).toFixed(1)}°`, { symbol: '∠Z_CM', group: `Common mode at ${si(s.f, 'Hz')}` }),
    item('ldm', 'DM (leakage) inductance', Ldm, 'H', fL(Ldm), { symbol: 'L_DM', group: `Differential mode at ${si(s.f, 'Hz')}`, note: '2L(1−k), round the line loop' }),
    item('zdm', 'DM impedance', abs(zd), 'Ω', fZ(abs(zd)), { symbol: '|Z_DM|', group: `Differential mode at ${si(s.f, 'Hz')}` }),
    item('pcu', 'Copper loss', 2 * s.idm * s.idm * s.rdc, 'W', si(2 * s.idm * s.idm * s.rdc, 'W', 3), { symbol: 'P_cu', group: 'Line current', note: `I_DM² · 2R_dc at ${si(s.idm, 'A')}` }),
    item('vdrop', 'DC drop round the loop', 2 * s.idm * s.rdc, 'V', si(2 * s.idm * s.rdc, 'V', 3), { symbol: 'ΔV', group: 'Line current' }),
  ];
  if (s.icm != null && s.ae != null) {
    const b = cmFlux(s.al, s.n, s.icm, s.ae);
    sec.push(item('bcm', 'Peak flux from CM current', b, 'T', si(b, 'T', 3), { symbol: 'B̂', group: 'Core flux', tone: b > s.bmax ? 'fail' : b > 0.8 * s.bmax ? 'warn' : 'pass', note: `A_L·N·Î/A_e, limit ${si(s.bmax, 'T')}` }));
    if (b > s.bmax) rep.warnings.push(`Common-mode flux ${si(b, 'T', 3)} exceeds ${si(s.bmax, 'T')}: the core saturates and the CM impedance collapses. Use a larger core (more A_e) or fewer turns on a higher-A_L core.`);
    rep.status = b > s.bmax ? { text: 'CORE SATURATES', tone: 'fail' } : undefined;
  }
  rep.results = [...prim, ...sec];

  if (s.f > fr) rep.warnings.push(`f is above the self-resonance ${si(fr, 'Hz', 3)}: the winding capacitance now dominates and |Z_CM| falls as 1/(2πfC_p). For higher frequencies use a choke with fewer turns, a sectioned winding or a second, small choke in series.`);
  if (k === 'n' && Math.abs(s.n - Math.round(s.n)) > 1e-6) rep.notes.push(`N = ${s.n.toFixed(3)} is not whole: wind ${nUp} turns for at least the target L.`);
  if (s.leak === 0) rep.notes.push('Leakage 0 %: perfect coupling, so the choke gives no differential-mode attenuation.');
  if (s.leak > 10) rep.warnings.push(`Leakage ${s.leak} % is unusually high for a common-mode choke: the coupling-coefficient model still applies, but check the measurement (one winding with the other shorted).`);
  rep.notes.push(
    'Parallel R–L–C model of one choke: real ferrite impedance curves also fall because µ′ drops with frequency, so above a few MHz use the manufacturer’s |Z|(f) data.',
    'A choke alone is a series element, so its insertion loss depends only on Z_s + Z_l: the CISPR 17 0.1 Ω / 100 Ω worst case gives almost the same loss as 50 Ω / 50 Ω (both ≈ 100 Ω). The worst-case setups matter for filters with shunt capacitors.',
    'Insertion loss uses resistive terminations (CISPR 17 method). In a real product the noise-source and LISN impedances are reactive and the loss can be much lower.',
    'Differential current cancels in the core only ideally: leakage flux from large line currents can still saturate parts of the core, which this page does not model.',
  );
  rep.summary = `L_CM ${fL(Lcm)} · L_DM ${fL(Ldm)} · f_r ${Number.isFinite(fr) ? si(fr, 'Hz', 3) : '—'} · at ${si(s.f, 'Hz')}: IL_CM ${unbounded ? '∞ (lossless at f_r)' : `${ilC.toFixed(1)} dB`}`;
  rep.details = { zcm: zc, zdm: zd, lcm: Lcm, ldm: Ldm, k: kc, fr };
  rep.graphs = graphs(s, p, fr, zc, zd, ilC, ilD);
  return rep;
}

const unboundedAt = (s: ChokeState, p: ChokeParams, zc: ReturnType<typeof zcm>) => s.rp == null && abs(zc) > 1e6 * 2 * Math.PI * s.f * lcm(p);

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: ChokeState, p: ChokeParams, fr: number, zc: ReturnType<typeof zcm>, zd: ReturnType<typeof zdm>, ilC: number, ilD: number): GraphSpec[] {
  const centre = Number.isFinite(fr) ? Math.sqrt(fr * s.f) : s.f;
  const lo = Math.max(1, Math.min(s.f, Number.isFinite(fr) ? fr : s.f, centre) / 100);
  const hi = Math.min(1e11, Math.max(s.f, Number.isFinite(fr) ? fr : s.f, centre) * 100);
  // the exact f_r point is added only with a loss resistance (a lossless peak there would be unbounded)
  const fs = [...logspace(lo, hi, 240), ...(Math.abs(s.f / fr - 1) > 1e-6 || s.rp != null ? [s.f] : []), ...(s.rp != null && Number.isFinite(fr) && fr > lo && fr < hi ? [fr] : [])].sort((a, b) => a - b);
  const zC = fs.map((f) => zcm(p, f));
  const zD = fs.map((f) => zdm(p, f));
  const vl = [{ value: s.f, label: `f = ${si(s.f, 'Hz')}` }, ...(Number.isFinite(fr) && fr > lo && fr < hi ? [{ value: fr, label: `f_r ${si(fr, 'Hz', 3)}`, dash: [2, 3] }] : [])];
  return [
    {
      id: 'impedance',
      title: '|Z| vs frequency',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'z', label: '|Z|', unit: 'Ω', log: true }],
      series: [
        { label: 'Common mode |Z_CM|', x: fs, y: zC.map((z) => Math.max(abs(z), 1e-6)), axis: 'z', width: 2.2 },
        { label: 'Differential |Z_DM|', x: fs, y: zD.map((z) => Math.max(abs(z), 1e-6)), axis: 'z', color: '#c47b17', width: 1.6 },
      ],
      vlines: vl,
      markers: [
        ...(unboundedAt(s, p, zc) ? [] : [{ x: s.f, y: Math.max(abs(zc), 1e-6), axis: 'z', label: fZ(abs(zc)) }]),
        { x: s.f, y: Math.max(abs(zd), 1e-6), axis: 'z', label: fZ(abs(zd)), color: '#c47b17' },
      ],
    },
    {
      id: 'insertion-loss',
      title: 'Insertion loss',
      subtitle: `CM ${s.zsCm} Ω → ${s.zlCm} Ω · DM ${s.zsDm} Ω → ${s.zlDm} Ω`,
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'il', label: 'Insertion loss', unit: 'dB', includeZero: true }],
      series: [
        { label: 'Common mode', x: fs, y: zC.map((z) => insertionLoss(z, s.zsCm, s.zlCm)), axis: 'il', width: 2.2 },
        { label: 'Differential mode', x: fs, y: zD.map((z) => insertionLoss(z, s.zsDm, s.zlDm)), axis: 'il', color: '#c47b17', width: 1.6 },
      ],
      vlines: vl,
      markers: [
        ...(unboundedAt(s, p, zc) ? [] : [{ x: s.f, y: ilC, axis: 'il', label: fDb(ilC) }]),
        { x: s.f, y: ilD, axis: 'il', label: fDb(ilD), color: '#c47b17' },
      ],
    },
  ];
}

export const def: CalcDef<ChokeState> = {
  id: ID,
  version: '0.1.0',
  method:
    'L = A_L·N² per winding; coupled-inductor relations L_CM = L(1+k)/2, L_DM = 2L(1−k) with k from the shorted-winding leakage L(1−k²); common-mode impedance as a parallel R–L–C (self-resonance from the winding capacitance); insertion loss of a series impedance between resistive terminations (CISPR 17 definition); CM flux A_L·N·I/A_e. Solve-for in closed form.',
  fields,
  defaults,
  solve: {
    default: 'n',
    analysis: 'l',
    options: [
      { key: 'l', label: 'Inductance from A_L and N (analysis)' },
      { key: 'n', label: 'Turns N for a target L' },
      { key: 'al', label: 'Core A_L for a target L' },
    ],
  },
  compute,
  sync: (s) => {
    const m = SYSTEMS[s.system];
    if (m && (['zsCm', 'zlCm', 'zsDm', 'zlDm'] as const).some((k) => Math.abs(m[k] - s[k]) > 1e-12)) s.system = 'Custom';
  },
  examples: [
    { id: 'default', label: 'Mains filter: 10 mH, turns on A_L 4 µH/N²', state: defaults() },
    { id: 'analyse-27t', label: 'Analyse: 27 turns on A_L 6 µH, 1 MHz', state: { solveFor: 'l', n: 27, al: 6e-6, cp: 8e-12, rp: 15e3, leak: 0.8, rdc: 0.05, f: 1e6, fUnit: 'MHz', system: '50 Ω / 50 Ω (CISPR 17)', zsCm: 50, zlCm: 50, zsDm: 50, zlDm: 50, idm: 3 } },
    { id: 'dcdc', label: 'DC-DC input choke 1 mH at 2 MHz (above f_r)', state: { solveFor: 'n', l: 1e-3, al: 2.5e-6, cp: 6e-12, rp: 5e3, leak: 1.5, rdc: 0.02, f: 2e6, fUnit: 'MHz', idm: 5 } },
    { id: 'usb', label: 'Data-line choke: 3 turns (0.45 µH) at 100 MHz', state: { solveFor: 'l', n: 3, al: 50e-9, alUnit: 'nH/N²', cp: 1.5e-12, rp: 1e3, leak: 0.2, rdc: 0.3, f: 100e6, fUnit: 'MHz', idm: 0.5 } },
    { id: 'lisn-30m', label: 'Same choke at 30 MHz into a LISN (25 Ω CM): capacitive', state: { ...defaults(), system: 'Custom', zsCm: 50, zlCm: 25, zsDm: 50, zlDm: 100, f: 30e6, fUnit: 'MHz' } },
    { id: 'saturation', label: 'Flux check: 200 mA CM on a small core (saturates)', state: { ...defaults(), icm: 0.2, ae: 10e-6, bmax: 0.3 } },
  ],
};
