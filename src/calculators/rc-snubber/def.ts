/** RC snubber from measured ringing — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { bracketE, ratingFor } from '@/core/eseries';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_IND, U_OHM, withDefault } from '@/core/unitsets';
import { type Parasitics, fromLC, fromTwoFreqs, peak, snubberPower, stepResponse } from './model';

export type SnubSolve = 'rs' | 'cs' | 'pr';
export type ParMethod = 'two' | 'lc';
export type Series = 'ideal' | 'E6' | 'E12' | 'E24' | 'E96';

export interface SnubState {
  solveFor: SnubSolve;
  method: ParMethod;
  f0: number;
  f0Unit: string;
  cAdd: number;
  cAddUnit: string;
  f1: number;
  f1Unit: string;
  lp: number;
  lpUnit: string;
  cp: number;
  cpUnit: string;
  v: number;
  fsw: number;
  fswUnit: string;
  tonMin: number;
  n: number;
  k: number;
  rs: number;
  rsUnit: string;
  cs: number;
  csUnit: string;
  pr: number;
  series: Series;
  edges: 'inductive' | 'both';
  dev: 'fet' | 'diode';
}

export const defaults = (): SnubState => ({
  solveFor: 'rs',
  method: 'two',
  f0: 180e6,
  f0Unit: 'MHz',
  cAdd: 1e-9,
  cAddUnit: 'nF',
  f1: 95e6,
  f1Unit: 'MHz',
  lp: 2e-9,
  lpUnit: 'nH',
  cp: 400e-12,
  cpUnit: 'pF',
  v: 12,
  fsw: 500e3,
  fswUnit: 'kHz',
  tonMin: 60e-9,
  n: 4,
  k: 1,
  rs: 2.2,
  rsUnit: 'Ω',
  cs: 1.5e-9,
  csUnit: 'nF',
  pr: 0.1,
  series: 'E24',
  edges: 'inductive',
  dev: 'fet',
});

const U_F_M = withDefault(U_FREQ, 'MHz');
const U_F_K: Record<string, number> = { kHz: 1e3, MHz: 1e6, Hz: 1 }; // no GHz: switching frequencies
const U_C_P = withDefault(U_CAP, 'pF');
const U_L_N = withDefault(U_IND, 'nH');

const is = (...k: SnubSolve[]) => (_s: any, root: any) => k.includes(root.solveFor);
const two = (s: any) => s.method === 'two';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Ringing measurement',
    fields: [
      {
        kind: 'select',
        key: 'method',
        // carry the parasitics across, so two-frequency → known L, C → two-frequency keeps the same circuit
        apply: (v: string, sc: any) => {
          if (v === 'lc' && sc.f1 > 0 && sc.f1 < sc.f0 && sc.cAdd > 0) {
            const p = fromTwoFreqs(sc.f0, sc.f1, sc.cAdd);
            Object.assign(sc, { lp: p.lp, cp: p.cp, lpUnit: 'nH', cpUnit: 'pF' });
          } else if (v === 'two' && sc.lp > 0 && sc.cp > 0 && sc.cAdd > 0) {
            const f0 = 1 / (2 * Math.PI * Math.sqrt(sc.lp * sc.cp));
            Object.assign(sc, { f0, f1: f0 / Math.sqrt(1 + sc.cAdd / sc.cp) });
          }
        },
        label: 'Parasitics from',
        options: [
          { value: 'two', label: 'Two ring frequencies (add a known C)' },
          { value: 'lc', label: 'Known L and C' },
        ],
        help: 'Two-frequency method (TI SLVA255, Todd SLUP100): measure the ringing frequency, solder a known low-ESL capacitor across the switch or diode, measure again. Or enter an estimated loop inductance and node capacitance (e.g. C_oss + diode C_j).',
      },
      { kind: 'number', key: 'f0', symbol: 'f₀', label: 'Ring frequency', units: U_F_M, unitKey: 'f0Unit', unitFamily: 'none', min: 1e3, max: 100e9, visible: two, help: 'Frequency of the ringing on the switch node as found (period between peaks on a scope with ≥ 2× this bandwidth and a short ground spring).' },
      { kind: 'number', key: 'cAdd', symbol: 'C_add', label: 'Added test capacitor', units: U_C_P, unitKey: 'cAddUnit', min: 1e-15, max: 1e-3, visible: two, help: 'A C0G capacitor placed directly across the ringing device. Aim to lower the frequency by about half (C_add ≈ 3·C_p): a small shift is hard to measure accurately.' },
      { kind: 'number', key: 'f1', symbol: 'f₁', label: 'Ring freq. with C_add', units: U_F_M, unitKey: 'f1Unit', unitFamily: 'none', min: 1e3, max: 100e9, visible: two },
      { kind: 'number', key: 'lp', symbol: 'L_p', label: 'Loop inductance', units: U_L_N, unitKey: 'lpUnit', min: 1e-13, max: 1e-2, visible: (s: any) => !two(s) },
      { kind: 'number', key: 'cp', symbol: 'C_p', label: 'Node capacitance', units: U_C_P, unitKey: 'cpUnit', min: 1e-15, max: 1e-3, visible: (s: any) => !two(s), help: 'Capacitance that resonates with the loop: switch C_oss plus rectifier capacitance at the off-state voltage.' },
    ],
  },
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'select', key: 'dev', label: 'Ringing device', options: [{ value: 'fet', label: 'Switch (MOSFET)' }, { value: 'diode', label: 'Rectifier diode' }], help: 'What the snubber sits across (drawing only).' },
      {
        kind: 'select',
        key: 'edges',
        label: 'Node edges',
        options: [
          { value: 'inductive', label: 'One hard edge (inductive node): ½·C·V²·f' },
          { value: 'both', label: 'Both edges hard / bound: C·V²·f' },
        ],
        help: 'On a hard-switched inductive node (buck/boost switch node) only the switch-driven edge steps C_s through R_s; the inductor commutates the other edge and returns most of the energy, so P_R ≈ ½·C_s·V²·f (TI SLVA255). C·V²·f is the bound when both edges are hard.',
      },
      { kind: 'number', key: 'v', symbol: 'V', label: 'Switched voltage', unit: 'V', min: 0.1, max: 5000, help: 'Voltage step the node makes each edge (Vin for a buck switch node, Vout + V_F for a boost). The snubber capacitor charges and discharges through this step every cycle.' },
      { kind: 'number', key: 'fsw', symbol: 'f_sw', label: 'Switching frequency', units: U_F_K, unitKey: 'fswUnit', unitFamily: 'none', min: 1, max: 100e6 },
      { kind: 'number', key: 'tonMin', symbol: 't_on,min', label: 'Shortest on/off time', unit: 's', min: 0, max: 1, help: 'Shortest time the node stays in one state. The snubber capacitor needs about 3·R_s·C_s to settle. 0 skips the check.' },
    ],
  },
  {
    kind: 'section',
    title: 'Snubber',
    fields: [
      {
        kind: 'number',
        key: 'n',
        symbol: 'n',
        label: 'C_s / C_p',
        suffix: '×',
        min: 1e-9,
        max: 1e12,
        solvable: true,
        solvedWhen: is('cs', 'pr'),
        onSolve: (_s, r) => (r.solveFor = 'cs'),
        onUnsolve: (_s, r) => (r.solveFor = 'rs'),
        help: 'Snubber capacitor as a multiple of the parasitic capacitance. 3–4 damps well; more only wastes power (Todd, SLUP100).',
      },
      {
        kind: 'number',
        key: 'k',
        symbol: 'k',
        label: 'R_s / Z₀',
        suffix: '×',
        min: 1e-9,
        max: 1e12,
        solvable: true,
        solvedWhen: is('pr'),
        onSolve: (_s, r) => (r.solveFor = 'pr'),
        onUnsolve: (_s, r) => (r.solveFor = 'rs'),
        help: 'Snubber resistor as a multiple of the characteristic impedance Z₀ = √(L_p/C_p). 1 is the usual choice; the overshoot graph shows the optimum for your n.',
      },
      {
        kind: 'number',
        key: 'rs',
        symbol: 'R_s',
        label: 'Snubber resistor',
        units: U_OHM,
        unitKey: 'rsUnit',
        min: 1e-4,
        max: 1e9,
        solvable: true,
        solvedWhen: is('rs', 'cs'),
        onSolve: (_s, r) => (r.solveFor = 'rs'),
        onUnsolve: (_s, r) => (r.solveFor = 'pr'),
        help: 'Designed as k·Z₀. Click ◎ to type your own part and analyse it.',
      },
      {
        kind: 'number',
        key: 'cs',
        symbol: 'C_s',
        label: 'Snubber capacitor',
        units: U_C_P,
        unitKey: 'csUnit',
        min: 1e-16,
        max: 1e-2,
        solvable: true,
        solvedWhen: is('rs', 'cs'),
        onSolve: (_s, r) => (r.solveFor = 'rs'),
        onUnsolve: (_s, r) => (r.solveFor = 'pr'),
        help: 'Designed as n·C_p, or from a power budget. Use C0G/NP0 rated above the peak voltage.',
      },
      {
        kind: 'number',
        key: 'pr',
        symbol: 'P_R',
        label: 'Resistor power',
        unit: 'W',
        min: 1e-12,
        max: 1e7,
        solvable: true,
        solvedWhen: is('rs', 'pr'),
        onSolve: (_s, r) => (r.solveFor = 'rs'),
        onUnsolve: (_s, r) => (r.solveFor = 'cs'),
        help: '½·C_s·V²·f_sw (or C_s·V²·f_sw with both edges hard). Click ◎ to type a power budget instead and solve for the largest C_s that meets it.',
      },
      {
        kind: 'select',
        key: 'series',
        label: 'Standard parts',
        options: [
          { value: 'ideal', label: 'Ideal values' },
          { value: 'E6', label: 'E6' },
          { value: 'E12', label: 'E12' },
          { value: 'E24', label: 'E24' },
          { value: 'E96', label: 'E96' },
        ],
        help: 'Series for the nearest standard R and C (Tables tab).',
      },
    ],
  },
];

const LABEL: Record<SnubSolve, string> = { rs: 'Snubber resistor', cs: 'Snubber capacitor', pr: 'Resistor power' };

export function parasitics(s: SnubState): Parasitics {
  return s.method === 'two' ? fromTwoFreqs(s.f0, s.f1, s.cAdd) : fromLC(s.lp, s.cp);
}

const pct = (x: number) => `${(x * 100).toFixed(0)} %`;

export function compute(st: SnubState): CalcReport {
  const num = ['f0', 'cAdd', 'f1', 'lp', 'cp', 'v', 'fsw', 'tonMin', 'n', 'k', 'rs', 'cs', 'pr'] as const;
  for (const key of num) if (typeof st[key] !== 'number' || !Number.isFinite(st[key])) throw new Error(`${key} must be a finite number.`);
  // Harness "error-after-edit" (medium) on typed f₀ ÷10 / f₁ max lands here: typed numbers that contradict the
  // measurement (f₁ ≥ f₀), which §5a says should be red. No setting switch can produce it.
  if (st.method === 'two') {
    if (!(st.f0 > 0) || !(st.f1 > 0) || !(st.cAdd > 0)) throw new Error('f₀, f₁ and C_add must be > 0.');
    if (!(st.f1 < st.f0)) throw new Error(`Adding capacitance must lower the ringing frequency: f₁ (${si(st.f1, 'Hz', 4)}) must be below f₀ (${si(st.f0, 'Hz', 4)}).`);
  } else if (!(st.lp > 0) || !(st.cp > 0)) throw new Error('L_p and C_p must be > 0.');
  if (!(st.v > 0) || !(st.fsw > 0)) throw new Error('Voltage and switching frequency must be > 0.');
  if (st.tonMin < 0) throw new Error('t_on,min must be ≥ 0.');

  const s: SnubState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'power/rc-snubber', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const par = parasitics(s);

  // ── solve (closed form)
  if (s.solveFor === 'rs') {
    if (!(s.n > 0) || !(s.k > 0)) throw new Error('n and k must be > 0.');
    s.rs = s.k * par.z0;
    s.cs = s.n * par.cp;
    s.pr = snubberPower(s.cs, s.v, s.fsw, s.edges);
  } else if (s.solveFor === 'cs') {
    if (!(s.pr > 0) || !(s.k > 0)) throw new Error('Power budget and k must be > 0.');
    s.cs = s.pr / snubberPower(1, s.v, s.fsw, s.edges);
    s.n = s.cs / par.cp;
    s.rs = s.k * par.z0;
  } else {
    if (!(s.rs > 0) || !(s.cs > 0)) throw new Error('R_s and C_s must be > 0.');
    s.pr = snubberPower(s.cs, s.v, s.fsw, s.edges);
    s.n = s.cs / par.cp;
    s.k = s.rs / par.z0;
  }
  const range = (key: 'rs' | 'cs' | 'n' | 'k' | 'pr', lo: number, hi: number, what: string) => {
    if (!(s[key] >= lo && s[key] <= hi)) {
      report.warnings.push(`${what} = ${key === 'rs' ? si(s[key], 'Ω', 3) : key === 'cs' ? si(s[key], 'F', 3) : key === 'pr' ? si(s[key], 'W', 3) : s[key].toPrecision(3)} is outside the range this page handles. Check the measurement.`);
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      report.results.push({ key: s.solveFor, label: LABEL[s.solveFor], value: null, display: '—', primary: true, solved: true });
      return false;
    }
    return true;
  };
  if (!range('rs', 1e-4, 1e9, 'R_s') || !range('cs', 1e-16, 1e-2, 'C_s') || !range('n', 1e-9, 1e12, 'n') || !range('k', 1e-9, 1e12, 'k') || !range('pr', 1e-12, 1e7, 'P_R')) return report;

  const pk = peak(s.k, s.n);
  const sr = stepResponse(s.k, s.n);
  const tau = s.rs * s.cs;
  const vPk = s.v * pk.peak;
  const iPk = s.v / s.rs;
  const fRing = (sr.wRing * par.f0) || 0;

  // ── checks
  if (s.method === 'two') {
    const r2 = (s.f0 / s.f1) ** 2 - 1;
    if (r2 < 0.5) warnings.push(`C_add raised the capacitance by only ${pct(r2)} (f₀/f₁ = ${(s.f0 / s.f1).toFixed(2)}): a small frequency shift makes C_p and L_p very sensitive to reading errors. Use a C_add that roughly halves the ringing frequency (≈ 3·C_p = ${si(3 * par.cp, 'F', 2)}).`);
    else if (r2 > 15) warnings.push(`C_add is ${r2.toFixed(0)}× the parasitic capacitance: the test capacitor’s own ESL may now set f₁. Use about 3·C_p = ${si(3 * par.cp, 'F', 2)}.`);
  }
  if (s.n < 2) warnings.push(`C_s is only ${s.n.toFixed(2)}× C_p: too small to damp the ring well (peak ${pct(pk.peak - 1)} overshoot). Use C_s ≥ 3·C_p if the power allows.`);
  else if (s.n > 10) notes.push(`C_s = ${s.n.toFixed(1)}× C_p damps little better than 4× but dissipates ${(s.n / 4).toFixed(1)}× the power and slows the edges.`);
  if (s.k < 0.3 || s.k > 3) warnings.push(`R_s is ${s.k.toPrecision(2)}× Z₀: ${s.k < 0.3 ? 'too small — C_s just adds to C_p and the node rings at a lower frequency' : 'too large — little current flows in the snubber and the ring is hardly damped'}. Choose R_s near Z₀ = ${si(par.z0, 'Ω', 3)} (see the overshoot-vs-R graph).`);
  if (s.tonMin > 0 && 3 * tau > s.tonMin) warnings.push(`3·R_s·C_s = ${si(3 * tau, 's', 3)} exceeds the ${si(s.tonMin, 's', 3)} minimum on/off time: C_s does not fully charge or discharge, the snubber works less well and the edge is slowed. Lower R_s or C_s, or accept less damping.`);
  const rating = ratingFor(2 * s.pr);
  if (s.pr > 3) warnings.push(`The snubber burns ${si(s.pr, 'W', 3)} (C_s·V²·f_sw), a large share for a dissipative snubber. Tighten the layout to cut L_p, lower n, or consider an RCD clamp or a lossless snubber.`);
  if (par.f0 > 1e9) notes.push(`Ringing above 1 GHz (${si(par.f0, 'Hz', 3)}) is near the limit of most probes: check the measurement bandwidth and ground lead.`);

  // ── results
  const item = (key: string, label: string, value: number | string, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const sv = s.solveFor;
  const results: ResultItem[] = [];
  const rsI = item('rs', 'Snubber resistor', s.rs, 'Ω', si(s.rs, 'Ω', 4), { symbol: 'R_s', primary: true, solved: sv !== 'pr', note: `${s.k.toPrecision(3)} × Z₀` });
  const csI = item('cs', 'Snubber capacitor', s.cs, 'F', si(s.cs, 'F', 4), { symbol: 'C_s', primary: true, solved: sv !== 'pr', note: `${s.n.toPrecision(3)} × C_p` });
  const prI = item('pr', 'Resistor power', s.pr, 'W', si(s.pr, 'W', 4), { symbol: 'P_R', primary: true, solved: sv !== 'cs', note: rating ? `rated ≥ ${rating} W (2 × P_R)` : 'more than 5 W: use a power resistor' });
  const ovI = item('overshoot', 'Peak overshoot', pk.peak - 1, '', pct(pk.peak - 1), { symbol: 'OS', primary: true, tone: pk.peak - 1 > 0.6 ? 'warn' : '', note: `V_pk ${si(vPk, 'V', 3)} for a ${si(s.v, 'V', 3)} step (100 % unsnubbed)` });
  if (sv === 'cs') results.push(csI, rsI, prI, ovI);
  else if (sv === 'pr') results.push(prI, ovI, rsI, csI);
  else results.push(rsI, csI, prI, ovI);
  const g1 = 'Parasitics';
  results.push(
    item('cpar', 'Parasitic capacitance', par.cp, 'F', si(par.cp, 'F', 4), { symbol: 'C_p', group: g1, note: s.method === 'two' ? 'C_add / ((f₀/f₁)² − 1)' : 'entered' }),
    item('lpar', 'Parasitic inductance', par.lp, 'H', si(par.lp, 'H', 4), { symbol: 'L_p', group: g1, note: s.method === 'two' ? '1/((2πf₀)²·C_p)' : 'entered' }),
    item('z0', 'Characteristic impedance', par.z0, 'Ω', si(par.z0, 'Ω', 4), { symbol: 'Z₀', group: g1, note: '√(L_p/C_p)' }),
    item('f0', 'Ring frequency (bare)', par.f0, 'Hz', si(par.f0, 'Hz', 4), { symbol: 'f₀', group: g1 }),
  );
  const g2 = 'Snubber';
  results.push(
    // keys are the state paths, so the solved ratios are written back (a later switch to design mode keeps them)
    item('n', 'C_s / C_p', s.n, '', `${s.n.toPrecision(4)}×`, { symbol: 'n', group: g2, solved: sv !== 'rs', tone: s.n < 2 ? 'warn' : '' }),
    item('k', 'R_s / Z₀', s.k, '', `${s.k.toPrecision(4)}×`, { symbol: 'k', group: g2, solved: sv === 'pr', tone: s.k < 0.3 || s.k > 3 ? 'warn' : '' }),
    item('tau', 'Time constant', tau, 's', si(tau, 's', 3), { symbol: 'τ', group: g2, tone: s.tonMin > 0 && 3 * tau > s.tonMin ? 'warn' : '', note: s.tonMin > 0 ? `3τ is ${pct((3 * tau) / s.tonMin)} of t_on,min` : 'R_s·C_s' }),
    item('zeta', 'Damping of the ring', sr.zeta, '', sr.wRing > 0 ? sr.zeta.toFixed(3) : 'no ringing', { symbol: 'ζ', group: g2, note: sr.wRing > 0 ? `remaining ring at ${si(fRing, 'Hz', 3)}` : 'all poles real' }),
    item('iPk', 'Peak snubber current', iPk, 'A', si(iPk, 'A', 3), { group: g2, note: `V/R_s at the edge; pulse ${si(s.v * iPk, 'W', 3)} for ≈ τ` }),
    item('eEdge', 'Energy per hard edge', 0.5 * s.cs * s.v * s.v, 'J', si(0.5 * s.cs * s.v * s.v, 'J', 3), { group: g2, note: '½·C_s·V², split between R_s and the switch' }),
    item('prBound', s.edges === 'inductive' ? 'Bound if both edges hard' : 'Inductive-node estimate', snubberPower(s.cs, s.v, s.fsw, s.edges === 'inductive' ? 'both' : 'inductive'), 'W', si(snubberPower(s.cs, s.v, s.fsw, s.edges === 'inductive' ? 'both' : 'inductive'), 'W', 3), { group: g2, note: s.edges === 'inductive' ? 'C_s·V²·f' : '½·C_s·V²·f (SLVA255)' }),
  );
  report.results = results;
  report.tables = [partsTable(s, par)];
  report.summary = `${s.method === 'two' ? `${si(s.f0, 'Hz', 3)} → ${si(s.f1, 'Hz', 3)} with ${si(s.cAdd, 'F', 3)}` : `L_p ${si(s.lp, 'H', 3)}, C_p ${si(s.cp, 'F', 3)}`} · Z₀ ${si(par.z0, 'Ω', 3)} · ${si(s.v, 'V', 3)} at ${si(s.fsw, 'Hz', 3)}`;
  notes.push(
    'Lossless L–C model of the ringing loop driven by an ideal voltage step; real circuits already have some damping, so the unsnubbed overshoot is below 100 %.',
    s.edges === 'inductive'
      ? 'P_R = ½·C_s·V²·f_sw: only the switch-driven edge is a hard step; the inductor recharges C_s on the other edge with little loss (SLVA255). C_s·V²·f_sw is shown as the bound.'
      : 'P_R = C_s·V²·f_sw: both edges step C_s through R_s (conservative bound for an inductive node).',
    'At the hard edge part of ½·C_s·V² is dissipated in the switch channel rather than R_s, adding to the switch’s turn-on loss; P_R counts all of it in R_s.',
  );
  report.details = { parasitics: par, state: s, peak: pk.peak, tauPeak: pk.tau, zeta: sr.zeta, fRing };
  report.graphs = graphs(s, par, pk.peak);
  return report;
}

function partsTable(s: SnubState, par: Parasitics): TableSpec {
  const ideal = s.series === 'ideal';
  const [r1, r2] = ideal ? [s.rs, s.rs] : bracketE(s.series, s.rs);
  const [c1, c2] = ideal ? [s.cs, s.cs] : bracketE(s.series, s.cs);
  const pairs: [number, number][] = [];
  for (const r of [r1, r2]) for (const c of [c1, c2]) if (!pairs.some(([a, b]) => a === r && b === c)) pairs.push([r, c]);
  const base = peak(s.k, s.n).peak - 1;
  const rows = pairs.map(([r, c]) => {
    const n = c / par.cp;
    const k = r / par.z0;
    const os = peak(k, n).peak - 1;
    const p = snubberPower(c, s.v, s.fsw, s.edges);
    return { r, c, n, k, os, p };
  });
  const budget = s.solveFor === 'cs' ? s.pr : Infinity;
  const tones = rows.map((x) => (x.p > budget * (1 + 1e-9) || x.os > base + 0.15 ? 'fail' : x.os > base + 0.05 ? 'warn' : 'pass') as 'pass' | 'warn' | 'fail');
  return {
    id: 'parts',
    title: ideal ? 'Snubber parts (ideal values)' : `Nearest ${s.series} parts`,
    columns: [
      { key: 'r', label: 'R_s', unit: 'Ω' },
      { key: 'c', label: 'C_s', unit: 'F' },
      { key: 'n', label: 'C_s/C_p' },
      { key: 'k', label: 'R_s/Z₀' },
      { key: 'os', label: 'Overshoot', unit: '%' },
      { key: 'p', label: 'P_R', unit: 'W' },
    ],
    rows: rows.map((x) => ({ r: x.r, c: x.c, n: x.n, k: x.k, os: x.os * 100, p: x.p })),
    display: rows.map((x) => ({ r: si(x.r, 'Ω', 3), c: si(x.c, 'F', 3), n: x.n.toPrecision(3), k: x.k.toPrecision(3), os: pct(x.os), p: si(x.p, 'W', 3) })),
    rowTones: ideal ? undefined : tones,
    note: ideal
      ? 'Pick standard parts near these values.'
      : `Green: overshoot within 5 points of the ideal design (${pct(base)}); yellow: within 15 points; red: worse${s.solveFor === 'cs' ? ', or above the power budget' : ''}.`,
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: SnubState, par: Parasitics, pkNow: number): GraphSpec[] {
  const w0 = 2 * Math.PI * par.f0;
  const sr = stepResponse(s.k, s.n);
  const span = 3 * 2 * Math.PI * Math.max(1, Math.sqrt(1 + s.n) * 0.75);
  const N = 300;
  const t = Array.from({ length: N + 1 }, (_, i) => (span * i) / N);
  const ts = t.map((x) => x / w0);
  const ring: GraphSpec = {
    id: 'ringing',
    title: 'Ringing',
    subtitle: 'Node voltage after an ideal V step through L_p: bare L–C vs with the snubber',
    x: { label: 'Time', unit: 's' },
    y: [{ id: 'v', label: 'Node voltage', unit: 'V', includeZero: true }],
    series: [
      { label: 'No snubber', x: ts, y: t.map((x) => s.v * (1 - Math.cos(x))), axis: 'v', color: '#9a8f7a', width: 1.2, dash: [4, 3] },
      { label: 'With R_s C_s', x: ts, y: t.map((x) => s.v * sr.y(x)), axis: 'v', color: '#1f4e5f', width: 2.2 },
    ],
    hlines: [{ value: s.v, label: `V = ${si(s.v, 'V', 3)}`, axis: 'v', color: '#c47b17', dash: [5, 3] }],
    legend: 'below',
  };
  const ks = logspace(0.05, 20, 40);
  const vsR: GraphSpec = {
    id: 'overshoot-vs-r',
    title: 'Overshoot vs R_s',
    subtitle: `C_s fixed at ${si(s.cs, 'F', 3)} (n = ${s.n.toPrecision(3)})`,
    x: { label: 'Snubber resistor R_s', unit: 'Ω', log: true },
    y: [{ id: 'o', label: 'Peak overshoot', unit: '%', includeZero: true }],
    series: [{ label: 'Overshoot', x: ks.map((k) => k * par.z0), y: ks.map((k) => (peak(k, s.n).peak - 1) * 100), axis: 'o', width: 2.2 }],
    vlines: [
      { value: s.rs, label: `R_s = ${si(s.rs, 'Ω', 3)}` },
      ...(Math.abs(s.rs / par.z0 - 1) > 0.15 ? [{ value: par.z0, label: `Z₀`, color: '#9a8f7a', dash: [3, 3] }] : []),
    ],
    markers: [{ x: s.rs, y: (pkNow - 1) * 100, axis: 'o', label: pct(pkNow - 1) }],
  };
  const ns = logspace(0.3, 30, 40);
  const vsC: GraphSpec = {
    id: 'overshoot-vs-c',
    title: 'Overshoot & power vs C_s',
    subtitle: `R_s fixed at ${si(s.rs, 'Ω', 3)} (k = ${s.k.toPrecision(3)})`,
    x: { label: 'Snubber capacitor C_s', unit: 'F', log: true },
    y: [
      { id: 'o', label: 'Peak overshoot', unit: '%', includeZero: true },
      { id: 'p', label: 'Resistor power', unit: 'W', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'Overshoot', x: ns.map((n) => n * par.cp), y: ns.map((n) => (peak(s.k, n).peak - 1) * 100), axis: 'o', width: 2.2 },
      { label: 'P_R', x: ns.map((n) => n * par.cp), y: ns.map((n) => snubberPower(n * par.cp, s.v, s.fsw, s.edges)), axis: 'p', color: '#c47b17', width: 1.6, dash: [5, 3] },
    ],
    vlines: [{ value: s.cs, label: `C_s = ${si(s.cs, 'F', 3)}` }],
    markers: [{ x: s.cs, y: (pkNow - 1) * 100, axis: 'o', label: pct(pkNow - 1) }],
  };
  return [ring, vsR, vsC];
}

export const def: CalcDef<SnubState> = {
  id: 'power/rc-snubber',
  version: '0.1.0',
  method:
    'RC snubber from the two-measurement method (TI SLVA255 eq. 1–3; Todd, Unitrode/TI SLUP100): C_p = C_add/((f₀/f₁)² − 1), L_p = 1/((2πf₀)²C_p), R_s = k·√(L_p/C_p), C_s = n·C_p, P_R = C_s·V²·f_sw; the overshoot is the exact step response of the L–C_p–(R_s+C_s) network (residues of its cubic), which depends only on k and n.',
  fields,
  defaults,
  solve: {
    default: 'rs',
    analysis: 'pr',
    options: [
      { key: 'rs', label: 'Design R_s and C_s from the ringing (R = k·Z₀, C = n·C_p)' },
      { key: 'cs', label: 'Largest C_s for a resistor power budget' },
      { key: 'pr', label: 'Analyse your R_s and C_s (power, damping)' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '12 V buck switch node: 180 MHz → 95 MHz with 1 nF added', state: defaults() },
    {
      id: 'slva255',
      label: 'TI SLVA255 boost: 217 MHz → 113 MHz with 300 pF (5 V out, 1 MHz assumed)',
      state: { ...defaults(), solveFor: 'rs', method: 'two', f0: 217e6, f0Unit: 'MHz', cAdd: 300e-12, cAddUnit: 'pF', f1: 113e6, f1Unit: 'MHz', v: 5.7, fsw: 1e6, fswUnit: 'MHz', tonMin: 0, n: 3, k: 1, series: 'E12', csUnit: 'pF' },
    },
    {
      id: 'budget-48v',
      label: '48 V buck at 400 kHz: largest C_s for 0.5 W in the resistor',
      state: { ...defaults(), solveFor: 'cs', method: 'two', f0: 120e6, f0Unit: 'MHz', cAdd: 470e-12, cAddUnit: 'pF', f1: 70e6, f1Unit: 'MHz', v: 48, fsw: 400e3, fswUnit: 'kHz', tonMin: 100e-9, pr: 0.5, k: 1, series: 'E12', csUnit: 'pF' },
    },
    {
      id: 'offline-400v',
      label: '400 V, 100 kHz rectifier diode, 82 Ω + 330 pF, both edges hard: snubber power',
      state: { ...defaults(), solveFor: 'pr', method: 'two', f0: 20e6, f0Unit: 'MHz', cAdd: 220e-12, cAddUnit: 'pF', f1: 11e6, f1Unit: 'MHz', v: 400, fsw: 100e3, fswUnit: 'kHz', tonMin: 500e-9, rs: 82, rsUnit: 'Ω', cs: 330e-12, csUnit: 'pF', series: 'E12', dev: 'diode', edges: 'both' },
    },
    {
      id: 'gan-lc',
      label: 'GaN half-bridge, 48 V at 1 MHz: 1 nH loop, 200 pF C_oss',
      state: { ...defaults(), solveFor: 'rs', method: 'lc', lp: 1e-9, lpUnit: 'nH', cp: 200e-12, cpUnit: 'pF', v: 48, fsw: 1e6, fswUnit: 'MHz', tonMin: 50e-9, n: 3, k: 1, series: 'E24', csUnit: 'pF' },
    },
    {
      id: 'small-c',
      label: 'Too little C_s: 1.2× C_p barely damps the 12 V node',
      state: { ...defaults(), solveFor: 'rs', n: 1.2, k: 1 },
    },
  ],
};
