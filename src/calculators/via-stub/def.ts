/** Via stub resonance — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TableSpec, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_LEN_PCB } from '@/core/unitsets';
import { C0, type StubLine, nyquist, stubIL, stubResonances } from './model';

export const ID = 'pcb/via-stub-resonance';

/** Loss the stub may add at Nyquist before the page flags it (same allowance as the differential-via page). */
export const IL_WARN_DB = 1;

export const U_RATE: Record<string, number> = { 'Gb/s': 1e9, 'Mb/s': 1e6, 'Tb/s': 1e12 };

export const MATERIALS: Record<string, { er: number; tanD: number } | null> = {
  Custom: null,
  'FR-4 (generic)': { er: 4.4, tanD: 0.02 },
  'FR-4 (~1 GHz)': { er: 4.0, tanD: 0.018 },
  'Mid-loss (Megtron 4 class)': { er: 3.8, tanD: 0.005 },
  'Low-loss (Megtron 6 class)': { er: 3.4, tanD: 0.002 },
  RO4350B: { er: 3.66, tanD: 0.0037 },
};

/** Margin rules: required f_res / f_N. */
export const RULES: Record<string, number | null> = {
  Custom: null,
  '2× Nyquist (aggressive)': 2,
  '3× Nyquist': 3,
  '5× Nyquist': 5,
  '10× Nyquist (≈ 300 mil ÷ Gb/s rule)': 10,
};

export type StubSolve = 'kAch' | 'stub' | 'rate';

export interface StubState {
  solveFor: StubSolve;
  rate: number;
  rateUnit: string;
  mod: 'nrz' | 'pam4';
  rule: string;
  /** Required margin f_res / f_N (the design rule) */
  k: number;
  /** Margin this via achieves (always computed) */
  kAch: number;
  h: number;
  hUnit: string;
  nL: number;
  exit: number;
  /** Residual stub after back-drilling; null = not back-drilled (the full stub below the exit layer) */
  stub: number | null;
  stubUnit: string;
  material: string;
  er: number;
  tanD: number;
  zVia: number;
  z0: number;
  /** Capacitance loading the stub end (pad / plane); null = open end */
  cEnd: number | null;
  cEndUnit: string;
}

export const defaults = (): StubState => ({
  solveFor: 'stub',
  rate: 25e9,
  rateUnit: 'Gb/s',
  mod: 'nrz',
  rule: '3× Nyquist',
  k: 3,
  kAch: 3,
  h: 1.6e-3,
  hUnit: 'mm',
  nL: 8,
  exit: 3,
  stub: 0.9993e-3,
  stubUnit: 'mm',
  material: 'FR-4 (~1 GHz)',
  er: 4.0,
  tanD: 0.018,
  zVia: 40,
  z0: 50,
  cEnd: null,
  cEndUnit: 'pF',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Link',
    note: 'Click ◎ on the stub or the rate to size it for the margin; click the achieved margin to check the via as entered.',
    fields: [
      { kind: 'number', key: 'rate', symbol: 'R_b', label: 'Data rate', units: U_RATE, unitKey: 'rateUnit', unitFamily: 'none', min: 1e6, max: 1e15, solvable: true, help: 'Bit rate of the link. Solving gives the fastest rate the stub allows at the chosen margin.' },
      { kind: 'select', key: 'mod', label: 'Signalling', options: [{ value: 'nrz', label: 'NRZ (f_N = R_b/2)' }, { value: 'pam4', label: 'PAM4 (f_N = R_b/4)' }] },
      { kind: 'select', key: 'rule', label: 'Margin rule', options: Object.keys(RULES), apply: (v, s) => setRule(s as StubState, v), help: 'How far above Nyquist the stub resonance must sit. Published rules range from about 2× to Bogatin’s “stub under 300 mil per Gb/s”, which is ≈10× Nyquist at Dk 4.' },
      { kind: 'number', key: 'k', symbol: 'k', label: 'Required margin', suffix: '× f_N', min: 1, max: 100, help: 'How far above the Nyquist frequency the stub resonance must sit: the design rule the stub and the rate are sized for.' },
      { kind: 'number', key: 'kAch', symbol: 'k_via', label: 'Margin achieved', suffix: '× f_N', min: 1e-4, max: 1e8, solvable: true, solvedWhen: () => true, onSolve: (_s, r) => (r.solveFor = 'kAch'), onUnsolve: (_s, r) => (r.solveFor = 'kAch'), help: 'f_res / f_N of the via as it is (always computed). Click ◎ to analyse the via with the stub and the rate as entered.' },
    ],
  },
  {
    kind: 'section',
    title: 'Via & board',
    fields: [
      { kind: 'number', key: 'h', symbol: 'H', label: 'Board thickness', units: U_LEN_PCB, unitKey: 'hUnit', min: 0.1e-3, max: 10e-3 },
      { kind: 'number', key: 'nL', symbol: 'N_L', label: 'Copper layers', min: 2, max: 60, integer: true, help: 'Layers are taken as evenly spaced: L1 on top, the last on the bottom.' },
      { kind: 'number', key: 'exit', symbol: 'L_exit', label: 'Exit layer', min: 1, max: 60, integer: true, help: 'Layer where the signal leaves the via (it enters on L1). The barrel below it is the stub.' },
      { kind: 'number', key: 'stub', symbol: 'ℓ_stub', label: 'Residual stub', units: U_LEN_PCB, unitKey: 'stubUnit', optional: true, zeroHint: 'full stub (no back-drill)', min: 10e-6, max: 10e-3, solvable: true, help: 'Stub left after back-drilling. Blank: not back-drilled, the whole barrel below the exit layer. Solving gives the longest stub the margin allows, which is the back-drill target.' },
    ],
  },
  {
    kind: 'section',
    title: 'Stub as a line',
    fields: [
      { kind: 'select', key: 'material', label: 'Laminate', options: Object.keys(MATERIALS), apply: (v, s) => setMaterial(s as StubState, v) },
      { kind: 'number', key: 'er', symbol: 'ε_eff', label: 'Effective εr', min: 1, max: 20, help: 'The stub’s field lies almost entirely in the laminate, so its effective permittivity is close to the laminate Dk at the frequency of interest.' },
      { kind: 'number', key: 'tanD', symbol: 'tan δ', label: 'Loss tangent', min: 0, max: 0.2, help: 'Sets how deep the loss notch is; it does not move the resonance.' },
      { kind: 'number', key: 'zVia', symbol: 'Z_via', label: 'Via impedance', unit: 'Ω', min: 5, max: 200, help: 'Impedance of the barrel in its antipads (the Via Calculator estimates it). Affects the notch width and the loss, not the resonance of an open stub.' },
      { kind: 'number', key: 'z0', symbol: 'Z₀', label: 'Trace impedance', unit: 'Ω', min: 10, max: 200, help: 'Reference impedance on both sides. For a differential pair use the pair values (e.g. 85 and 100 Ω) throughout.' },
      { kind: 'number', key: 'cEnd', symbol: 'C_end', label: 'End capacitance', units: U_CAP, unitKey: 'cEndUnit', optional: true, zeroHint: 'open end', min: 0, max: 10e-12, help: 'Pad or plane capacitance at the bottom of the stub; it lowers the resonance below the quarter-wave value. Blank: open end.' },
    ],
  },
];

function setRule(s: StubState, v: string): void {
  const k = RULES[v];
  if (k == null) return;
  s.k = k;
}

function setMaterial(s: StubState, v: string): void {
  const m = MATERIALS[v];
  if (!m) return;
  s.er = m.er;
  s.tanD = m.tanD;
}

const fLen = (m: number) => si(m, 'm', 4);
const fF = (f: number) => si(f, 'Hz', 4);
const fRate = (r: number) => si(r, 'b/s', 4);
/** Loss in dB; a lossless stub notches to the 1e-30 |S21| floor (600 dB), which is shown as deep rather than as a number. */
const fDb = (x: number, digits: number) => (x > 100 ? '> 100 dB (deep notch)' : `${x.toFixed(digits)} dB`);

function num(name: string, v: unknown, min = 0, strict = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (strict ? !(v > min) : !(v >= min)) throw new Error(`${name} must be ${strict ? '>' : '≥'} ${min}.`);
  return v;
}

function fail(msg: string, s: StubState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

export function compute(st: StubState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

const RANGE = { kAch: [1e-4, 1e8], rate: [1e6, 1e15], stub: [10e-6, 10e-3] } as const;

/*
 * Mode-switch harness (§12.3) triage: "roundtrip" mediums from an analysed state are the margin rule at work (see the
 * note in run): the stub / rate solves answer for the required k, not the k the via happens to achieve.
 * "error-after-edit" mediums are typed numbers with no answer (an exit layer above the layer count, a stub that would
 * have to be shorter than back-drilling can leave, a data rate that drives f_res/f_N out of range); each says why.
 */
function run(st: StubState): CalcReport {
  const s: StubState = { ...st };
  const k = s.solveFor;
  if (!['kAch', 'stub', 'rate'].includes(k)) throw new Error('solveFor must be kAch, stub or rate.');
  if (s.mod !== 'nrz' && s.mod !== 'pam4') throw new Error('Signalling must be NRZ or PAM4.');
  if (k !== 'rate') num('Data rate', s.rate);
  num('Required margin', s.k);
  num('Board thickness', s.h);
  if (!Number.isInteger(s.nL) || s.nL < 2) throw new Error('Copper layers must be a whole number ≥ 2.');
  if (!Number.isInteger(s.exit) || s.exit < 1) throw new Error('Exit layer must be a whole number ≥ 1.');
  if (s.exit > s.nL) throw new Error(`Exit layer L${s.exit} does not exist on a ${s.nL}-layer board.`);
  if (num('Effective εr', s.er) < 1) throw new Error('Effective εr must be ≥ 1.');
  num('Loss tangent', s.tanD, 0, false);
  num('Via impedance', s.zVia);
  num('Trace impedance', s.z0);
  if (s.cEnd != null) num('End capacitance', s.cEnd, 0, false);
  if (k !== 'stub' && s.stub != null) num('Residual stub', s.stub);
  const cEnd = s.cEnd ?? 0;
  const depth = (s.h * (s.exit - 1)) / (s.nL - 1);
  const full = s.h - depth;
  if (!(full > 1e-12)) return fail(`The signal leaves on the bottom layer (L${s.exit} of ${s.nL}): the via has no stub, so there is nothing to resonate. Pick a higher exit layer to study a stub.`, s);

  const f1 = (len: number) => stubResonances(len, s.er, s.zVia, cEnd, 1)[0];
  const mult = s.mod === 'pam4' ? 4 : 2;
  let lMax: number | null = null;
  // Mode-switch harness note: the required margin k is a design rule, not a property of the via. In analysis
  // (kAch) the via usually achieves a different margin, so solving for the stub or the rate from an analysed state
  // returns the back-drill target / fastest rate for k, not the stub or rate entered. That round-trip difference
  // is the intended answer, not a bug.
  if (k === 'stub') {
    // longest stub whose resonance sits at k·f_N; f_res falls monotonically with length
    const fT = s.k * nyquist(s.rate, s.mod);
    const g = (len: number) => f1(len) - fT;
    const [lo, hi] = [1e-7, 1];
    if (g(lo) < 0) return fail(`Even a ${fLen(lo)} stub resonates below ${fF(fT)} (${+s.k.toPrecision(4)}× Nyquist) with this end capacitance: reduce C_end or the margin.`, s);
    lMax = g(hi) > 0 ? hi : brent(g, lo, hi, 1e-16);
    if (lMax < RANGE.stub[0]) return fail(`${fRate(s.rate)} at ${+s.k.toPrecision(4)}× Nyquist needs a stub shorter than ${fLen(lMax)}, below what back-drilling can leave. Exit on a deeper layer, use a blind via, or relax the margin.`, s);
    // the residual stub is the stub this via will have: the back-drill target, or the full stub when it already fits.
    // A full stub shorter than ℓ_max then sits above the margin, so a later solve for R_b from this state returns a
    // higher rate than the one entered (mode-switch harness: legitimate round-trip difference, the answer is clamped).
    s.stub = Math.min(lMax, full);
  }
  const resid = s.stub != null && s.stub < full ? s.stub : full;
  const fres = f1(resid);
  if (k === 'rate') {
    const r = (mult * fres) / s.k;
    if (!(r >= RANGE.rate[0] && r <= RANGE.rate[1])) return fail(`The fastest rate at ${+s.k.toPrecision(4)}× Nyquist would be ${fRate(r)}, outside the field’s ${fRate(RANGE.rate[0])} – ${fRate(RANGE.rate[1])}.`, s);
    s.rate = r;
  }
  const fN = nyquist(s.rate, s.mod);
  const kk = fres / fN;
  if (!(kk >= RANGE.kAch[0] && kk <= RANGE.kAch[1])) return fail(`f_res / f_N = ${kk.toPrecision(3)} is outside the field’s range: check the data rate and the stub.`, s);
  s.kAch = kk;
  const rep = report(s, { depth, full, resid, fres, fN, lMax, cEnd, mult });
  if (st.stub != null && st.stub > full && k !== 'stub') rep.notes.unshift(`The residual stub entered (${fLen(st.stub)}) is longer than the barrel below L${s.exit} (${fLen(full)}): no back-drill, the full stub is used.`);
  return rep;
}

interface Derived {
  depth: number;
  full: number;
  resid: number;
  fres: number;
  fN: number;
  lMax: number | null;
  cEnd: number;
  mult: number;
}

function report(s: StubState, v: Derived): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const { depth, full, resid, fres, fN, cEnd, mult } = v;
  const line: StubLine = { zVia: s.zVia, z0: s.z0, er: s.er, tanD: s.tanD, lUse: depth, lStub: resid, cEnd };
  const ilN = stubIL(fN, line);
  const ilThru = stubIL(fN, { ...line, lStub: 0 });
  const dIL = ilN - ilThru;
  // longest stub the margin allows (the answer of the 'stub' solve, also reported in the other modes)
  const fT = s.k * fN;
  const lMax = v.lMax ?? (() => {
    const g = (len: number) => stubResonances(len, s.er, s.zVia, cEnd, 1)[0] - fT;
    return g(1e-7) < 0 ? 0 : g(1) > 0 ? 1 : brent(g, 1e-7, 1, 1e-16);
  })();
  const bd = full - lMax > 1e-9 ? full - lMax : 0;
  const backdrilled = resid < full - 1e-12;
  const harm = stubResonances(resid, s.er, s.zVia, cEnd, 3);
  // notch: deepest point of |S21| near the fundamental
  const fs = Array.from({ length: 401 }, (_, i) => fres * (0.6 + (0.8 * i) / 400));
  const ils = fs.map((f) => stubIL(f, line));
  const iMax = ils.reduce((b, x, i) => (x > ils[b] ? i : b), 0);
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k === 'stub') prim.push(item('stub', 'Residual stub', resid, 'm', fLen(resid), { symbol: 'ℓ_stub', primary: true, solved: true, note: bd > 0 ? `back-drill ${fLen(bd)} from the bottom` : `full stub already ≤ ℓ_max ${fLen(lMax)}` }));
  if (k === 'rate') prim.push(item('rate', 'Fastest data rate', s.rate, 'b/s', fRate(s.rate), { symbol: 'R_b', primary: true, solved: true, note: `${s.mod.toUpperCase()}, f_res = ${+s.k.toPrecision(4)}× f_N` }));
  prim.push(item('kAch', 'Margin achieved', s.kAch, '', `${s.kAch.toPrecision(4)} × f_N`, { symbol: 'k_via', primary: true, solved: true, tone: s.kAch <= 1 ? 'fail' : s.kAch < s.k * (1 - 1e-9) ? 'warn' : 'pass', note: `required ${+s.k.toPrecision(4)}×` }));
  prim.push(item('fres', 'Stub resonance', fres, 'Hz', fF(fres), { symbol: 'f_res', primary: true, note: cEnd > 0 ? `with C_end ${si(cEnd, 'F', 3)}` : 'quarter-wave, open end' }));
  prim.push(item('fN', 'Nyquist frequency', fN, 'Hz', fF(fN), { symbol: 'f_N', primary: true, note: `${fRate(s.rate)} ${s.mod.toUpperCase()}` }));
  // a notch at or below Nyquist fails the via whatever the loss at f_N itself happens to be (it can sit between notches)
  const inBand = fres <= fN;
  prim.push(item('dIL', 'Loss added at f_N', dIL, 'dB', fDb(dIL, 2), { symbol: 'ΔIL', primary: true, tone: inBand || dIL > IL_WARN_DB ? 'fail' : dIL > IL_WARN_DB / 2 ? 'warn' : 'pass', note: inBand ? `notch at ${fF(fres)} is inside the band` : `stub ${fLen(resid)} vs none` }));
  const sec: ResultItem[] = [
    item('depth', 'Exit depth', depth, 'm', fLen(depth), { symbol: 'ℓ_use', group: 'Stub', note: `L${s.exit} of ${s.nL}, layers evenly spaced` }),
    item('full', 'Stub without back-drill', full, 'm', fLen(full), { symbol: 'ℓ_full', group: 'Stub', note: `H − ℓ_use → f_res ${fF(stubResonances(full, s.er, s.zVia, cEnd, 1)[0])}` }),
    item('lMax', 'Longest stub for the margin', lMax, 'm', fLen(lMax), { symbol: 'ℓ_max', group: 'Stub', note: `f_res = ${s.k.toPrecision(3)}× f_N = ${fF(fT)}` }),
    item('backdrill', 'Back-drill depth needed', Math.max(bd, 0), 'm', bd > 0 ? fLen(bd) : 'none', { symbol: 'ℓ_bd', group: 'Stub', tone: resid > lMax * (1 + 1e-9) ? 'warn' : '', note: bd > 0 ? 'from the bottom, to leave ℓ_max' : 'the full stub meets the margin' }),
    item('f3', 'Third-harmonic resonance', harm[1], 'Hz', fF(harm[1]), { symbol: 'f_3', group: 'Stub' }),
    item('rateMax', 'Fastest rate at this margin', (mult * fres) / s.k, 'b/s', fRate((mult * fres) / s.k), { symbol: 'R_b,max', group: 'Stub', note: `${s.mod.toUpperCase()}, for the residual stub` }),
    item('il', 'Via loss at f_N', ilN, 'dB', fDb(ilN, 2), { symbol: 'IL', group: 'Loss', note: 'barrel + stub between Z₀' }),
    item('ilThru', 'Barrel alone at f_N', ilThru, 'dB', `${ilThru.toFixed(2)} dB`, { symbol: 'IL_0', group: 'Loss', note: 'mismatch + dielectric loss' }),
    item('notch', 'Notch depth', ils[iMax], 'dB', `${fDb(ils[iMax], 1)} at ${fF(fs[iMax])}`, { symbol: 'IL_max', group: 'Loss', note: s.tanD === 0 ? 'lossless stub: the notch is unbounded' : 'deepest point of the stub resonance' }),
    item('lambda4', 'Quarter wave at f_N', C0 / (4 * fN * Math.sqrt(s.er)), 'm', fLen(C0 / (4 * fN * Math.sqrt(s.er))), { symbol: 'λ/4', group: 'Loss', note: 'a stub this long notches f_N itself' }),
  ];
  rep.results = [...prim, ...sec];
  rep.tables = [resTable(harm, fN, fT)];
  const okMargin = fres >= fT * (1 - 1e-9);
  rep.status = fres <= fN ? { text: 'NOTCH IN BAND', tone: 'fail' } : dIL > IL_WARN_DB ? { text: `STUB COSTS ${dIL.toFixed(1)} dB`, tone: 'fail' } : okMargin ? { text: 'MARGIN MET', tone: 'pass' } : { text: `BELOW ${+s.k.toPrecision(3)}× f_N`, tone: 'warn' };

  if (fres <= fN) rep.warnings.push(`The stub resonates at ${fF(fres)}, at or below the Nyquist frequency ${fF(fN)}: the notch sits inside the signal band. Back-drill to at most ${fLen(lMax)}, exit on a deeper layer, or use blind vias.`);
  else if (dIL > IL_WARN_DB) rep.warnings.push(`The stub adds ${dIL.toFixed(2)} dB at Nyquist (more than ${IL_WARN_DB} dB): its resonance at ${fF(fres)} is too close. Back-drill to ${fLen(lMax)} or less.`);
  if (k !== 'stub' && !okMargin && fres > fN) rep.notes.push(`f_res is ${(fres / fN).toFixed(2)}× Nyquist, short of the ${+s.k.toPrecision(4)}× target: back-drill ${fLen(Math.max(bd, 0))} to meet it.`);
  if (backdrilled && resid < 0.1e-3) rep.notes.push(`A residual stub of ${fLen(resid)} is below what back-drilling usually holds (about 0.1–0.25 mm with depth tolerance): ask your fabricator, or plan for the longer stub.`);
  if (k === 'stub' && bd > 0 && lMax < 0.1e-3) rep.warnings.push(`The margin needs a stub under 0.1 mm, tighter than typical back-drill depth control. Exit on a deeper layer or use blind / buried vias.`);
  if (s.exit === 1) rep.notes.push('Exit on L1: the signal never uses the barrel, so the whole via is a stub.');
  rep.notes.push(
    'The quarter-wave value is an upper bound: pads, non-functional pads and plane edges load the stub end and pull the resonance lower. Enter C_end to include that load.',
    `Loss is for a single-ended via between ${s.z0} Ω traces with dielectric loss only; copper loss and the antipad transitions are left out.`,
  );
  rep.summary = `${fLen(s.h)} board, exit L${s.exit}/${s.nL} · stub ${fLen(resid)}${backdrilled ? ' (back-drilled)' : ''} → f_res ${fF(fres)} = ${(fres / fN).toFixed(2)}× f_N`;
  rep.details = { depth, full, resid, fres, fN, lMax, harm, ilN, ilThru };
  rep.graphs = graphs(s, line, v, lMax, fT);
  return rep;
}

function resTable(harm: number[], fN: number, fT: number): TableSpec {
  const rows = harm.map((f, i) => ({ n: 2 * i + 1, f, ratio: f / fN }));
  return {
    id: 'resonances',
    title: 'Stub resonances',
    columns: [{ key: 'n', label: 'Order' }, { key: 'f', label: 'Frequency', unit: 'Hz', align: 'right' }, { key: 'ratio', label: '÷ f_N', align: 'right' }],
    rows,
    display: rows.map((r) => ({ n: r.n === 1 ? '1 (fundamental)' : String(r.n), f: fF(r.f), ratio: `${r.ratio.toPrecision(3)} ×` })),
    rowTones: rows.map((r) => (r.f <= fN ? 'fail' : r.f < fT * (1 - 1e-9) ? 'warn' : 'pass')),
    note: 'Red: inside the signal band (≤ f_N). Yellow: above f_N but below the margin target. Green: above the target.',
  };
}

function graphs(s: StubState, line: StubLine, v: Derived, lMax: number, fT: number): GraphSpec[] {
  const { fres, fN, full, resid, cEnd } = v;
  const fMax = Math.min(Math.max(1.4 * fres, 3 * fN, 1.2 * fT), 1e13);
  const fs = Array.from({ length: 400 }, (_, i) => (fMax * (i + 1)) / 400);
  for (const f of [fN, fres]) if (f < fMax) fs.push(f);
  fs.sort((a, b) => a - b);
  const cap = (x: number) => Math.min(x, 60);
  const backdrilled = resid < full - 1e-12;
  const series = [{ label: `stub ${fLen(resid)}`, x: fs, y: fs.map((f) => cap(stubIL(f, line))), width: 2.2 }];
  if (backdrilled) series.push({ label: `no back-drill (${fLen(full)})`, x: fs, y: fs.map((f) => cap(stubIL(f, { ...line, lStub: full }))), width: 1.2, dash: [5, 3], color: '#9a8f7a' } as (typeof series)[number]);
  const lHi = Math.max(2 * full, 1.5 * lMax, 1e-3);
  const ls = Array.from({ length: 160 }, (_, i) => 20e-6 * (lHi / 20e-6) ** (i / 159));
  const fr = ls.map((l) => stubResonances(l, s.er, s.zVia, cEnd, 1)[0]);
  return [
    {
      id: 'il',
      title: 'Insertion loss vs frequency',
      x: { label: 'Frequency', unit: 'Hz' },
      y: [{ id: 'il', label: 'Insertion loss', unit: 'dB', includeZero: true }],
      legend: 'below',
      series,
      hlines: [{ value: IL_WARN_DB, label: `${IL_WARN_DB} dB`, dash: [5, 4] }],
      vlines: [{ value: fN, label: `f_N ${si(fN, 'Hz', 3)}` }, ...(fT < fMax && Math.abs(fT / fres - 1) > 0.03 ? [{ value: fT, label: `${s.k.toPrecision(3)}× f_N`, dash: [2, 3] }] : []), ...(fres < fMax ? [{ value: fres, label: `f_res ${si(fres, 'Hz', 3)}`, color: '#8b1e1e', dash: [4, 3] }] : [])],
      markers: [{ x: fN, y: cap(stubIL(fN, line)), label: `${stubIL(fN, line).toFixed(2)} dB` }],
    },
    {
      id: 'fres-vs-stub',
      title: 'Resonance vs stub length',
      subtitle: `ε_eff = ${+s.er.toPrecision(4)}${cEnd > 0 ? `, C_end = ${si(cEnd, 'F', 3)}` : ', open end'}`,
      x: { label: 'Stub length', unit: 'm', log: true },
      y: [{ id: 'f', label: 'f_res', unit: 'Hz', log: true }],
      series: [{ label: 'f_res (fundamental)', x: ls, y: fr, width: 2.2 }],
      hlines: [{ value: fT, label: `${s.k.toPrecision(3)}× f_N`, dash: [5, 4] }, { value: fN, label: 'f_N', color: '#9a8f7a', dash: [2, 3] }],
      vlines: [{ value: full, label: `full ${fLen(full)}`, dash: [2, 3] }],
      markers: [{ x: resid, y: fres, label: si(fres, 'Hz', 3) }],
    },
  ];
}

export const def: CalcDef<StubState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Open-circuited stub below the exit layer: quarter-wave resonance c/(4ℓ√εeff), or the root of tan(βℓ) = 1/(ωC·Z_via) with an end capacitance (Pozar ch. 2). Nyquist R_b/2 (NRZ) or R_b/4 (PAM4); longest stub and back-drill depth for f_res = k·f_N. Insertion loss from the ABCD cascade of the used barrel and the shunt stub between Z₀ (Pozar §4.4), dielectric loss only. Stub length and data rate solved on the same equations (Brent).',
  fields,
  defaults,
  solve: {
    default: 'stub',
    analysis: 'kAch',
    options: [
      { key: 'kAch', label: 'Margin f_res / f_N of this via (analysis)' },
      { key: 'stub', label: 'Longest residual stub (back-drill target) for the data rate' },
      { key: 'rate', label: 'Fastest data rate for this stub' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m && (Math.abs(m.er - s.er) > 1e-9 || Math.abs(m.tanD - s.tanD) > 1e-12)) s.material = 'Custom';
    const k = RULES[s.rule];
    if (k != null && Math.abs(k - s.k) > 1e-9) s.rule = 'Custom';
  },
  examples: [
    { id: 'default', label: '25 Gb/s NRZ, 1.6 mm 8-layer board, exit L3: back-drill target', state: defaults() },
    { id: 'pcie5', label: 'PCIe 5.0 (32 GT/s), 2.36 mm 12-layer, exit L3 (margin)', state: { ...defaults(), solveFor: 'kAch', rate: 32e9, mod: 'nrz', h: 2.36e-3, nL: 12, exit: 3, stub: null, material: 'Mid-loss (Megtron 4 class)', er: 3.8, tanD: 0.005, rule: '3× Nyquist', k: 3 } },
    { id: 'backplane', label: '112 Gb/s PAM4, 3 mm 24-layer backplane, exit L4 (no back-drill)', state: { ...defaults(), solveFor: 'kAch', rate: 112e9, mod: 'pam4', h: 3e-3, nL: 24, exit: 4, stub: null, material: 'Low-loss (Megtron 6 class)', er: 3.4, tanD: 0.002, rule: '3× Nyquist', k: 3 } },
    { id: 'backplane-bd', label: 'Same backplane back-drilled to 0.2 mm', state: { ...defaults(), solveFor: 'kAch', rate: 112e9, mod: 'pam4', h: 3e-3, nL: 24, exit: 4, stub: 0.2e-3, material: 'Low-loss (Megtron 6 class)', er: 3.4, tanD: 0.002, rule: '3× Nyquist', k: 3 } },
    { id: 'max-rate', label: 'Fastest NRZ rate: 6-layer 1.6 mm, exit L3, 5× Nyquist, 0.3 pF end load', state: { ...defaults(), solveFor: 'rate', mod: 'nrz', h: 1.6e-3, nL: 6, exit: 3, stub: null, rule: '5× Nyquist', k: 5, cEnd: 0.3e-12 } },
  ],
};
