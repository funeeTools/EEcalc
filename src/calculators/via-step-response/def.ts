/** Via step response — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB } from '@/core/unitsets';
import { C0, type LForm, type StepMetrics, type Topology, LN9, johnsonC, jgRiseC, jgRiseL, stepResponse, viaL, zOfRho } from './model';

export const ID = 'pcb/via-step-response';

/** Edge times: ps first (via edges are tens to hundreds of ps). */
const U_TIME: Record<string, number> = { ps: 1e-12, ns: 1e-9, fs: 1e-15 };

/** Laminate presets (design Dk, manufacturer data sheets), as on the Via calculator page. */
export const MATERIALS: Record<string, number | null> = {
  Custom: null,
  'FR-4 (generic)': 4.4,
  'FR-4 (~1 GHz)': 4.0,
  RO4350B: 3.66,
  RO4003C: 3.55,
  'Megtron 6': 3.4,
  'RT/duroid 5880': 2.2,
};

export const TR_MIN = 1e-12;
export const TR_MAX = 10e-9;
export const DA_MAX = 20e-3;
/** Shortest via, as a fraction of its drill, the inductance formulas are used for. */
export const H_D_MIN = 0.7;

export type StepSolve = 'slow' | 'tr' | 'Da';

export interface StepState {
  solveFor: StepSolve;
  /** Edge slowdown budget (%): the pass/fail limit, and the target when solving for t_r or D_ap */
  budget: number;
  /** Edge slowdown (%): always computed (equal to the budget when solving for t_r or D_ap) */
  slow: number;
  z0: number;
  tr: number;
  trUnit: string;
  h: number;
  hUnit: string;
  d: number;
  dUnit: string;
  pad: number;
  padUnit: string;
  Da: number;
  DaUnit: string;
  material: string;
  er: number;
  topology: Topology;
  lForm: LForm;
}

export const defaults = (): StepState => ({
  solveFor: 'slow',
  budget: 10,
  slow: 0,
  z0: 50,
  tr: 100e-12,
  trUnit: 'ps',
  h: 1.6e-3,
  hUnit: 'mm',
  d: 0.3e-3,
  dUnit: 'mm',
  pad: 0.6e-3,
  padUnit: 'mm',
  Da: 1.0e-3,
  DaUnit: 'mm',
  material: 'FR-4 (generic)',
  er: 4.4,
  topology: 'pi',
  lForm: 'johnson',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Line & edge',
    note: 'Click ◎ on t_r or D_ap to meet the slowdown budget.',
    fields: [
      { kind: 'number', key: 'z0', symbol: 'Z₀', label: 'Line impedance', unit: 'Ω', min: 10, max: 200, help: 'Characteristic impedance of the traces on both sides of the via; the source and the load are matched to it.' },
      { kind: 'number', key: 'tr', symbol: 't_r', label: 'Input rise time', units: U_TIME, unitKey: 'trUnit', min: TR_MIN, max: TR_MAX, solvable: true, help: '10–90 % rise time of the incident edge (a linear ramp). Solving gives the fastest edge whose slowdown stays within the budget.' },
      { kind: 'number', key: 'budget', symbol: 'ε_max', label: 'Slowdown budget', suffix: '%', min: 0.01, max: 1000, help: 'Allowed increase of the 10–90 % rise time through the via, (t_r,out − t_r)/t_r. The pass/fail limit, and the target when solving for t_r or D_ap.' },
      { kind: 'number', key: 'slow', symbol: 'ε', label: 'Edge slowdown', suffix: '%', output: true, min: -100, max: 1e6, help: 'Simulated increase of the 10–90 % rise time through the via. Always computed; equal to the budget when solving for t_r or D_ap.' },
    ],
  },
  {
    kind: 'section',
    title: 'Via',
    fields: [
      { kind: 'number', key: 'h', symbol: 'h', label: 'Via length (board)', units: U_LEN_PCB, unitKey: 'hUnit', min: 50e-6, max: 10e-3, help: 'Barrel length; for a through via the board thickness, which is also T in Johnson’s capacitance formula.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Drill diameter', units: U_LEN_PCB, unitKey: 'dUnit', min: 50e-6, max: 6e-3, help: 'Barrel diameter in the inductance formula.' },
      { kind: 'number', key: 'pad', symbol: 'D_pad', label: 'Pad diameter (D₁)', units: U_LEN_PCB, unitKey: 'padUnit', min: 0.1e-3, max: 10e-3, help: 'Pad on the signal layers: D₁ in Johnson’s capacitance formula.' },
      { kind: 'number', key: 'Da', symbol: 'D_ap', label: 'Antipad (D₂)', units: U_LEN_PCB, unitKey: 'DaUnit', min: 0.1e-3, max: DA_MAX, solvable: true, help: 'Clearance hole in the planes: D₂ in Johnson’s capacitance formula. Solving gives the smallest antipad that meets the slowdown budget.' },
      { kind: 'select', key: 'material', label: 'Laminate', options: Object.keys(MATERIALS), apply: (v, s) => setMaterial(s as StepState, v) },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 20, help: 'Relative permittivity (Dk) of the laminate around the via.' },
    ],
  },
  {
    kind: 'section',
    title: 'Model',
    fields: [
      {
        kind: 'select',
        key: 'topology',
        label: 'Lumped model',
        options: [
          { value: 'pi', label: 'π: C/2 – L – C/2' },
          { value: 'tee', label: 'T: L/2 – C – L/2' },
          { value: 'c', label: 'C only (Johnson §7.3)' },
          { value: 'l', label: 'L only (Johnson §7.4)' },
        ],
        // the antipad does not enter the L-only model, so its unknown moves back to the analysis
        apply: (v, _s, r) => {
          if (v === 'l' && r.solveFor === 'Da') r.solveFor = 'slow';
        },
        help: 'How the via capacitance and inductance are arranged. π puts half the capacitance at each pad, which matches where it physically sits; C only and L only reproduce Johnson & Graham’s separate estimates.',
      },
      { kind: 'select', key: 'lForm', label: 'Inductance formula', options: [{ value: 'johnson', label: 'Johnson & Graham (+1)' }, { value: 'rosa', label: 'Rosa/Grover partial (−1)' }], help: 'Johnson & Graham print 5.08·h·[ln(4h/d) + 1] nH. The partial self-inductance of a straight wire (Rosa) has −1 and is about half as large for a typical via; the truth depends on where the return current flows.' },
    ],
  },
];

function setMaterial(s: StepState, v: string): void {
  const er = MATERIALS[v];
  if (er) s.er = er;
}

const fLen = (m: number) => si(m, 'm', 4);
const fT = (t: number) => si(t, 's', 4);
const pct = (x: number) => `${(x * 100).toPrecision(3)} %`;

function num(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (!(v > 0)) throw new Error(`${name} must be > 0.`);
  return v;
}

function fail(msg: string, s: StepState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

export interface ViaLC {
  c: number;
  l: number;
}
export function viaLC(s: StepState): ViaLC {
  return { c: johnsonC(s.er, s.h, s.pad, s.Da), l: viaL(s.h, s.d, s.lForm) };
}

/** Edge slowdown (fraction) of the simulated transmitted wave. */
function slowdown(s: StepState, p: Partial<StepState>): number {
  const q = { ...s, ...p };
  const { c, l } = viaLC(q);
  const m = stepResponse(q.topology, l, c, q.z0, q.tr);
  return m.trOut / q.tr - 1;
}

const TOPS: Topology[] = ['pi', 'tee', 'c', 'l'];

export function compute(st: StepState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness (§12.3) triage:
 *  • "error-after-edit" mediums are typed numbers that break the geometry (an antipad no larger than the pad, a pad no
 *    larger than the drill, a via too short for the Rosa form); each message says what limits the answer (§5a).
 *  • A budget no edge or antipad meets is shown as the closest approach with a red warning, not an error, so a ◎ click
 *    from a working page never ends in red. Settings (model, inductance formula, laminate, examples) never error.
 *  • "roundtrip" mediums from a solved state: the budget is the designer’s limit, not the slowdown of the current
 *    via, so solving for t_r or D_ap from an analysis state moves them to where the slowdown equals the budget (and the
 *    analysis of a solved state gives the budget back). A closest-approach answer also misses the budget by design.
 */
function run(st: StepState): CalcReport {
  const s: StepState = { ...st };
  const k = s.solveFor;
  if (!['slow', 'tr', 'Da'].includes(k)) throw new Error('solveFor must be slow, tr or Da.');
  if (!TOPS.includes(s.topology)) throw new Error('Lumped model must be pi, tee, c or l.');
  if (s.lForm !== 'johnson' && s.lForm !== 'rosa') throw new Error('Inductance formula must be johnson or rosa.');
  num('Line impedance', s.z0);
  if (k !== 'tr') num('Rise time', s.tr);
  num('Slowdown budget', s.budget);
  num('Via length', s.h);
  num('Drill diameter', s.d);
  num('Pad diameter', s.pad);
  if (k !== 'Da') num('Antipad diameter', s.Da);
  if (num('εr', s.er) < 1) throw new Error('εr must be ≥ 1.');
  if (!(s.pad > s.d)) throw new Error(`Pad ${fLen(s.pad)} must be larger than the drill ${fLen(s.d)}.`);
  // both thin-wire inductance forms need a barrel longer than it is wide: Rosa’s goes to zero at h/d ≈ 0.68 and Johnson’s
  // at 1/(4e) ≈ 0.09. One common floor (0.7) means switching the formula never turns a working page into an error.
  if (!(s.h / s.d >= H_D_MIN)) throw new Error(`The via is too short for its drill (h/d = ${(s.h / s.d).toPrecision(3)} < ${H_D_MIN}): the thin-wire inductance formulas do not apply (Rosa’s reaches zero at h/d ≈ 0.68, Johnson’s at 0.09). Use a longer via or a smaller drill, or model it as a pad capacitance only.`);
  const eps = s.budget / 100;

  // ── solve for the unknown on the simulated slowdown. A budget no edge or antipad in range meets is not an error
  // (a ◎ click from a working page must not end in red, §5a): the page shows the closest it gets, in red, and says why.
  let shortfall: string | null = null;
  let solvedNote: string | null = null;
  if (k === 'tr') {
    // fastest edge for the budget: scan downwards from the slowest edge to the first one over budget, then refine
    // 28 steps over four decades (×1.39 each), fine enough to catch an overshoot bump in the slowdown curve
    const N = 28;
    const grid = Array.from({ length: N + 1 }, (_, i) => TR_MAX * (TR_MIN / TR_MAX) ** (i / N));
    const g = (tr: number) => slowdown(s, { tr }) - eps;
    let prev = grid[0];
    const g0 = g(prev);
    let root: number | null = null;
    if (g0 > 0) {
      root = TR_MAX;
      shortfall = `Even a ${fT(TR_MAX)} edge slows by ${pct(g0 + eps)}, over the ${+s.budget.toPrecision(4)} % budget, so the slowest edge in range is shown. The via is far too large for this line: reduce the pad, enlarge the antipad or allow a larger slowdown.`;
    } else {
      for (let i = 1; i <= N; i++) {
        const tr = grid[i];
        if (g(tr) > 0) {
          root = Math.exp(brent((x) => g(Math.exp(x)), Math.log(tr), Math.log(prev), 1e-11));
          break;
        }
        prev = tr;
      }
      if (root == null) {
        root = TR_MIN;
        solvedNote = `every edge down to ${fT(TR_MIN)} is within the budget`;
      }
    }
    s.tr = root;
  } else if (k === 'Da') {
    if (s.topology === 'l') {
      // the antipad does not enter an inductance-only model: keep it, say so
      if (!(s.Da > s.pad)) s.Da = Math.min(DA_MAX, 2 * s.pad);
      solvedNote = 'the antipad does not enter the L-only model';
      if (slowdown(s, {}) > eps) shortfall = `The barrel inductance alone slows the edge by ${pct(slowdown(s, {}))}, over the ${+s.budget.toPrecision(4)} % budget, whatever the antipad. Use a shorter via (back-drill), a larger drill, or a slower edge.`;
    } else {
      // smallest antipad that meets the budget: the slowdown falls as the antipad opens and the capacitance drops (it
      // may rise again once the via turns inductive, so the first crossing is the answer)
      const lo = s.pad * (1 + 1e-6);
      if (!(DA_MAX > lo)) return fail(`The ${fLen(s.pad)} pad leaves no antipad size up to ${fLen(DA_MAX)}.`, s);
      const N = 16;
      const grid = Array.from({ length: N + 1 }, (_, i) => lo * (DA_MAX / lo) ** (i / N));
      const g = (Da: number) => slowdown(s, { Da }) - eps;
      const gs = [g(grid[0])];
      let root: number | null = null;
      for (let i = 1; i <= N && root == null; i++) {
        gs.push(g(grid[i]));
        if (gs[i] <= 0 && gs[i - 1] > 0) root = Math.exp(brent((x) => g(Math.exp(x)), Math.log(grid[i - 1]), Math.log(grid[i]), 1e-11));
      }
      if (root == null) {
        // closest approach: golden-section search around the best grid point
        let ib = 0;
        for (let i = 1; i < gs.length; i++) if (gs[i] < gs[ib]) ib = i;
        let a = Math.log(grid[Math.max(ib - 1, 0)]);
        let b = Math.log(grid[Math.min(ib + 1, N)]);
        const r = (Math.sqrt(5) - 1) / 2;
        for (let it = 0; it < 30; it++) {
          const c1 = b - r * (b - a);
          const c2 = a + r * (b - a);
          if (g(Math.exp(c1)) < g(Math.exp(c2))) b = c2;
          else a = c1;
        }
        root = Math.exp((a + b) / 2);
        shortfall = `No antipad up to ${fLen(DA_MAX)} brings the slowdown within ${+s.budget.toPrecision(4)} % at t_r = ${fT(s.tr)}; the antipad shown comes closest (${pct(g(root) + eps)}). The barrel inductance limits it: use a shorter via (back-drill), a larger drill, or a slower edge.`;
      }
      s.Da = root;
    }
  }
  if (!(s.Da > s.pad)) throw new Error(`Antipad ${fLen(s.Da)} must be larger than the pad ${fLen(s.pad)}: Johnson’s capacitance needs D₂ > D₁.`);

  const { c, l } = viaLC(s);
  const m = stepResponse(s.topology, l, c, s.z0, s.tr);
  if (!Number.isFinite(m.trOut)) throw new Error('The transmitted edge did not settle in the simulated window.');
  return report(s, c, l, m, shortfall, solvedNote);
}

function report(s: StepState, c: number, l: number, m: StepMetrics, shortfall: string | null, solvedNote: string | null): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const top = s.topology;
  const useC = top !== 'l';
  const useL = top !== 'c';
  const slow = m.trOut / s.tr - 1;
  const ok = slow <= (s.budget / 100) * (1 + 1e-9);
  const tC = useC ? jgRiseC(c, s.z0) : 0;
  const tL = useL ? jgRiseL(l, s.z0) : 0;
  const tJG = Math.sqrt(s.tr ** 2 + tC ** 2 + tL ** 2);
  const tauNet = (useC ? (c * s.z0) / 2 : 0) - (useL ? l / (2 * s.z0) : 0);
  const tNet = Math.sqrt(s.tr ** 2 + (LN9 * tauNet) ** 2);
  const zVia = Math.sqrt(l / c);
  const f0 = 1 / (2 * Math.PI * Math.sqrt(l * c));
  const fKnee = 0.5 / s.tr;
  const td = (s.h * Math.sqrt(s.er)) / C0;
  const lAlt = viaL(s.h, s.d, s.lForm === 'rosa' ? 'johnson' : 'rosa');
  // antipad at which √(L/C) = Z₀ (C = L/Z₀²), closed form from Johnson’s C
  const cBal = l / s.z0 ** 2;
  const IN = 0.0254;
  const daBal = s.pad + ((1.41 * s.er * (s.h / IN) * (s.pad / IN)) / (cBal * 1e12)) * IN;
  const rhoPk = Math.abs(m.rhoMin.y) >= Math.abs(m.rhoMax.y) ? m.rhoMin.y : m.rhoMax.y;
  const zMin = zOfRho(m.rhoMin.y, s.z0);
  const zMax = zOfRho(m.rhoMax.y, s.z0);

  const prim: ResultItem[] = [];
  const sNote = shortfall ? 'closest to the budget' : solvedNote ?? `slowdown = ${+s.budget.toPrecision(4)} %`;
  if (k === 'tr') prim.push(item('tr', 'Fastest input edge', s.tr, 's', fT(s.tr), { symbol: 't_r', primary: true, solved: true, tone: shortfall ? 'fail' : '', note: sNote }));
  if (k === 'Da') prim.push(item('Da', 'Antipad diameter', s.Da, 'm', fLen(s.Da), { symbol: 'D_ap', primary: true, solved: true, tone: shortfall ? 'fail' : '', note: `${(s.Da / 25.4e-6).toFixed(1)} mil · ${sNote}` }));
  prim.push(item('slow', 'Edge slowdown', slow * 100, '%', pct(slow), { symbol: 'ε', primary: true, solved: true, tone: ok ? 'pass' : 'fail', note: `budget ${+s.budget.toPrecision(4)} %` }));
  prim.push(item('trOut', 'Output rise time', m.trOut, 's', fT(m.trOut), { symbol: 't_r,out', primary: true, note: `10–90 %, ${top === 'pi' ? 'π' : top === 'tee' ? 'T' : top === 'c' ? 'C-only' : 'L-only'} model, simulated` }));
  prim.push(item('rhoPk', 'Peak reflection', rhoPk * 100, '%', `${(rhoPk * 100).toPrecision(3)} %`, { symbol: 'ρ_pk', primary: true, note: `TDR ${si(zMin, 'Ω', 3)} … ${si(zMax, 'Ω', 3)}` }));
  // √(L/C) and the balancing antipad only mean something when the model holds both L and C
  const both = top === 'pi' || top === 'tee';
  const na = 'n/a (L or C only)';
  if (k === 'slow') prim.push(item('zVia', 'Via impedance', both ? zVia : null, 'Ω', both ? si(zVia, 'Ω', 4) : na, { symbol: 'Z_via', primary: true, note: '√(L/C)' }));

  const sec: ResultItem[] = [
    item('c', 'Via capacitance', c, 'F', si(c, 'F', 4), { symbol: 'C', group: 'Lumped via', note: '1.41·εr·h·D₁/(D₂ − D₁) pF, inches' }),
    item('l', 'Via inductance', l, 'H', si(l, 'H', 4), { symbol: 'L', group: 'Lumped via', note: s.lForm === 'rosa' ? '5.08·h·[ln(4h/d) − 1] nH (Rosa)' : '5.08·h·[ln(4h/d) + 1] nH (J&G)' }),
    item('lAlt', s.lForm === 'rosa' ? 'Same, Johnson’s form' : 'Same, Rosa partial form', lAlt > 0 ? lAlt : null, 'H', lAlt > 0 ? si(lAlt, 'H', 4) : 'n/a (h/d too small)', { symbol: 'L_alt', group: 'Lumped via' }),
    item('zVia2', 'Via impedance', both ? zVia : null, 'Ω', both ? si(zVia, 'Ω', 4) : na, { symbol: 'Z_via', group: 'Lumped via', note: '√(L/C); equal to Z₀ for a transparent via' }),
    item('cNet', 'Net excess capacitance', c - l / s.z0 ** 2, 'F', si(c - l / s.z0 ** 2, 'F', 3), { symbol: 'C_net', group: 'Lumped via', note: 'C − L/Z₀²; negative: net inductive' }),
    item('daBal', 'Antipad for Z_via = Z₀', both ? daBal : null, 'm', !both ? na : daBal <= DA_MAX ? fLen(daBal) : `> ${fLen(DA_MAX)}`, { symbol: 'D_ap,bal', group: 'Lumped via', note: 'C = L/Z₀² with Johnson’s C' }),
    item('f0', 'LC resonance', f0, 'Hz', si(f0, 'Hz', 3), { symbol: 'f₀', group: 'Lumped via', note: '1/(2π√(LC))' }),
    item('td', 'Delay through the via', td, 's', fT(td), { symbol: 't_d', group: 'Lumped via', note: 'h·√εr / c' }),
    item('tC', 'J&G rise, capacitance', useC ? tC : null, 's', useC ? fT(tC) : 'off (L-only model)', { symbol: 't_C', group: 'Rise time', note: '2.2·C·Z₀/2' }),
    item('tL', 'J&G rise, inductance', useL ? tL : null, 's', useL ? fT(tL) : 'off (C-only model)', { symbol: 't_L', group: 'Rise time', note: '2.2·L/(2Z₀)' }),
    item('tJG', 'J&G output estimate', tJG, 's', fT(tJG), { symbol: 't_r,JG', group: 'Rise time', note: `√(t_r² + t_C² + t_L²): ${pct(tJG / s.tr - 1)} slower` }),
    item('tNet', 'Net-excess estimate', tNet, 's', fT(tNet), { symbol: 't_r,net', group: 'Rise time', note: `2.2·|C·Z₀/2 − L/2Z₀| in quadrature: ${pct(tNet / s.tr - 1)}` }),
    item('delay', 'Added delay (50 %)', m.delay, 's', fT(m.delay), { symbol: 't_pd', group: 'Rise time', note: 'transmitted vs incident 50 % point' }),
    item('overshoot', 'Overshoot', m.overshoot * 100, '%', `${(m.overshoot * 100).toPrecision(3)} %`, { symbol: 'OS', group: 'Rise time' }),
    item('fKnee', 'Knee frequency', fKnee, 'Hz', si(fKnee, 'Hz', 3), { symbol: 'f_knee', group: 'Rise time', note: '0.5/t_r' }),
    item('rhoMin', 'TDR dip', m.rhoMin.y * 100, '%', `${(m.rhoMin.y * 100).toPrecision(3)} % (${si(zMin, 'Ω', 4)})`, { symbol: 'ρ_min', group: 'TDR', note: `at ${fT(m.rhoMin.t)}` }),
    item('rhoMax', 'TDR peak', m.rhoMax.y * 100, '%', `${(m.rhoMax.y * 100).toPrecision(3)} % (${si(zMax, 'Ω', 4)})`, { symbol: 'ρ_max', group: 'TDR', note: `at ${fT(m.rhoMax.t)}` }),
    item('area', 'Reflection area', l / (2 * s.z0) * (useL ? 1 : 0) - (useC ? (c * s.z0) / 2 : 0), 's', fT((useL ? l / (2 * s.z0) : 0) - (useC ? (c * s.z0) / 2 : 0)), { symbol: '∫ρ dt', group: 'TDR', note: 'L/(2Z₀) − C·Z₀/2: < 0 capacitive' }),
  ];
  rep.results = [...prim, ...sec];
  rep.status = ok ? { text: `slowdown ${pct(slow)} ≤ ${+s.budget.toPrecision(4)} %`, tone: 'pass' } : { text: `slowdown ${pct(slow)} > ${+s.budget.toPrecision(4)} %`, tone: 'fail' };

  // ── warnings at the limits of the models
  if (shortfall) rep.warnings.push(shortfall);
  else if (!ok) rep.warnings.push(`The via slows the edge by ${pct(slow)}, over the ${+s.budget.toPrecision(4)} % budget. ${tauNet > 0 ? 'It is net capacitive: enlarge the antipad, shrink the pads or remove non-functional pads on the planes.' : 'It is net inductive: shorten the via (back-drill), use a larger drill, or add ground vias close by.'}`);
  if (td > s.tr / 6) rep.warnings.push(`The via delay (${fT(td)}) is more than a sixth of the rise time: it is not electrically short, so the lumped model is only a rough guide. Treat the barrel as a short transmission line or use a field solver.`);
  if (m.overshoot > 0.05) rep.warnings.push(`The transmitted edge overshoots by ${(m.overshoot * 100).toPrecision(3)} %: the via’s LC resonance (${si(f0, 'Hz', 3)}) is within reach of the edge (knee ${si(fKnee, 'Hz', 3)}), so it rings and the single-pole estimates do not apply. Bring √(L/C) closer to Z₀ (antipad ≈ ${daBal <= DA_MAX ? fLen(daBal) : 'larger'}).`);
  if (slow < -0.005) rep.notes.push(`The output edge is ${pct(-slow)} faster than the input: the via’s small overshoot steepens the 10–90 % section. Its rise time is effectively unchanged.`);
  if (s.h / s.d < 2) rep.warnings.push(`The via is short for its diameter (h/d = ${(s.h / s.d).toFixed(2)} < 2): the thin-wire inductance formulas are rough here.`);
  if (s.Da / s.pad < 1.15) rep.notes.push('The antipad barely clears the pad: Johnson’s capacitance formula (a parallel-plate estimate across the gap) is crude for such small gaps.');
  rep.notes.push(
    'Johnson & Graham’s formulas are rough estimates (their own words); a 3-D field solver or a measured TDR of a test coupon is the reference for a real stack-up.',
    'Rise times use a linear-ramp edge through ideal Z₀ lines on both sides; the TDR trace is the reflection seen at the via, without the round-trip delay to the instrument.',
  );
  rep.summary = `${fLen(s.d)} via, ${fLen(s.h)} long, D₁ ${fLen(s.pad)}, D₂ ${fLen(s.Da)} in a ${si(s.z0, 'Ω', 3)} line · C ${si(c, 'F', 3)}, L ${si(l, 'H', 3)} · ${fT(s.tr)} → ${fT(m.trOut)} (${pct(slow)})`;
  rep.details = { c, l, tC, tL, tJG, tNet, tauNet, zVia, f0, fKnee, td, daBal, m: { trOut: m.trOut, delay: m.delay, overshoot: m.overshoot, rhoMin: m.rhoMin, rhoMax: m.rhoMax } };
  rep.graphs = graphs(s, l, m, slow);
  return rep;
}

function thin(a: ArrayLike<number>, n: number): number[] {
  if (a.length <= n) return Array.from(a);
  const step = (a.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => a[Math.round(i * step)]);
}

function graphs(s: StepState, l: number, m: StepMetrics, slow: number): GraphSpec[] {
  const w = m.wave;
  // show the edge and the transients, not the long settled tail of the simulation window
  let last = 0;
  for (let i = 0; i < w.t.length; i++) if (Math.abs(w.rho[i]) > 2e-3 || Math.abs(w.v2[i] - w.u[i]) > 2e-3) last = i;
  const tRamp = s.tr / 0.8;
  const tShow = Math.min(w.t[w.t.length - 1], Math.max(1.25 * w.t[last], 1.6 * tRamp));
  let nShow = w.t.length;
  while (nShow > 2 && w.t[nShow - 1] > tShow) nShow--;
  const cut = (y: ArrayLike<number>) => Array.prototype.slice.call(y, 0, nShow) as number[];
  const t = thin(cut(w.t), 500);
  const pick = (y: ArrayLike<number>) => thin(cut(y), 500);
  const z = pick(w.rho).map((r) => zOfRho(Math.max(-0.999999, Math.min(0.999999, r)), s.z0));
  // slowdown against the antipad, simulated, with Johnson’s quadrature estimate for comparison
  const daLo = Math.max(s.pad * 1.02, Math.min(s.pad * 1.2, s.Da * 0.95));
  const daHi = Math.max(3 * s.Da, 3 * s.pad);
  const das = Array.from({ length: 17 }, (_, i) => daLo * (daHi / daLo) ** (i / 16));
  const useL = s.topology !== 'c';
  const useC = s.topology !== 'l';
  const sim = das.map((Da) => {
    const cc = johnsonC(s.er, s.h, s.pad, Da);
    return (stepResponse(s.topology, l, cc, s.z0, s.tr).trOut / s.tr - 1) * 100;
  });
  const jg = das.map((Da) => {
    const tC = useC ? jgRiseC(johnsonC(s.er, s.h, s.pad, Da), s.z0) : 0;
    const tL = useL ? jgRiseL(l, s.z0) : 0;
    return (Math.sqrt(s.tr ** 2 + tC ** 2 + tL ** 2) / s.tr - 1) * 100;
  });
  return [
    {
      id: 'tdr',
      title: 'TDR at the via',
      subtitle: `t_r = ${fT(s.tr)}, Z₀ = ${si(s.z0, 'Ω', 3)}`,
      x: { label: 'Time t', unit: 's' },
      y: [{ id: 'z', label: 'Impedance seen', unit: 'Ω' }],
      legend: 'below',
      series: [{ label: 'Z(t) = Z₀(1 + ρ)/(1 − ρ)', x: t, y: z, width: 2.2 }],
      hlines: [{ value: s.z0, label: `Z₀ ${si(s.z0, 'Ω', 3)}`, color: '#9a8f7a', dash: [4, 4] }],
      markers: [
        { x: m.rhoMin.t, y: zOfRho(m.rhoMin.y, s.z0), label: si(zOfRho(m.rhoMin.y, s.z0), 'Ω', 3) },
        ...(m.rhoMax.y > 1e-4 ? [{ x: m.rhoMax.t, y: zOfRho(m.rhoMax.y, s.z0), label: si(zOfRho(m.rhoMax.y, s.z0), 'Ω', 3) }] : []),
      ],
    },
    {
      id: 'step',
      title: 'Step through the via',
      subtitle: `${fT(s.tr)} in → ${fT(m.trOut)} out (${pct(slow)})`,
      x: { label: 'Time t', unit: 's' },
      y: [{ id: 'v', label: 'Fraction of the step', unit: '', includeZero: true }],
      legend: 'below',
      series: [
        { label: 'Incident', x: t, y: pick(w.u), color: '#9a8f7a', width: 1.4, dash: [2, 3] },
        { label: 'Transmitted', x: t, y: pick(w.v2), color: '#1f4e5f', width: 2.4 },
        { label: 'Reflected ρ', x: t, y: pick(w.rho), color: '#c47b17', width: 1.6 },
      ],
      hlines: [
        { value: 0.1, label: '10 %', color: '#9a8f7a', dash: [2, 4] },
        { value: 0.9, label: '90 %', color: '#9a8f7a', dash: [2, 4] },
      ],
    },
    {
      id: 'slow-vs-da',
      title: 'Slowdown vs antipad',
      subtitle: `t_r = ${fT(s.tr)}, D₁ = ${fLen(s.pad)}`,
      x: { label: 'Antipad diameter D_ap', unit: 'm', log: true },
      // clipped above: a nearly closed antipad sends the slowdown to hundreds of per cent and flattens the useful part
      y: [{ id: 's', label: 'Edge slowdown', unit: '%', max: Math.max(3 * s.budget, 1.5 * slow * 100 + s.budget, 10) }],
      series: [
        { label: 'Simulated', x: das, y: sim, width: 2.2 },
        { label: 'Johnson & Graham, √(t_r² + t_C² + t_L²)', x: das, y: jg, color: '#c47b17', width: 1.4, dash: [5, 3] },
      ],
      hlines: [{ value: s.budget, label: `budget ${+s.budget.toPrecision(4)} %`, color: '#8b1e1e', dash: [6, 4] }],
      vlines: [{ value: s.Da, label: `D_ap = ${si(s.Da, 'm', 3)}` }],
      markers: [{ x: s.Da, y: slow * 100, label: pct(slow) }],
    },
  ];
}

export const def: CalcDef<StepState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Johnson & Graham (High-Speed Digital Design §7.3–7.4) via capacitance 1.41·εr·h·D₁/(D₂ − D₁) pF and inductance 5.08·h·[ln(4h/d) ± 1] nH (or the Rosa/Grover partial form), single-pole rise estimates 2.2·C·Z₀/2 and 2.2·L/(2Z₀) added in quadrature; the lumped π, T, C or L network between matched Z₀ lines driven by a linear ramp, solved exactly as a state-space system (matrix exponential with first-order hold) for the transmitted edge and the TDR reflection; TDR area L/(2Z₀) − C·Z₀/2 (Agilent AN 1304-2). Fastest edge and smallest antipad for a slowdown budget by scan plus Brent on the simulated slowdown.',
  fields,
  defaults,
  solve: {
    default: 'slow',
    analysis: 'slow',
    options: [
      { key: 'slow', label: 'Slowdown, TDR and step from the via (analysis)' },
      { key: 'tr', label: 'Fastest input edge t_r for the budget' },
      { key: 'Da', label: 'Smallest antipad D_ap for the budget' },
    ],
  },
  compute,
  sync: (s) => {
    const er = MATERIALS[s.material];
    if (er != null && Math.abs(er - s.er) > 1e-9) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: '0.3 mm via in 1.6 mm FR-4, 100 ps edge (π model)', state: defaults() },
    { id: 'jg-c', label: 'Johnson & Graham §7.3: 0.41 pF via, capacitance only', state: { ...defaults(), topology: 'c', h: 0.063 * 0.0254, pad: 0.028 * 0.0254, Da: 0.055 * 0.0254, d: 0.016 * 0.0254, padUnit: 'mil', DaUnit: 'mil', dUnit: 'mil', hUnit: 'mil' } },
    { id: 'fastest', label: 'Fastest edge this via passes within 10 %', state: { ...defaults(), solveFor: 'tr', budget: 10 } },
    { id: 'antipad', label: 'Antipad for 5 % slowdown of a 35 ps edge (Megtron 6)', state: { ...defaults(), solveFor: 'Da', budget: 5, tr: 35e-12, h: 1.0e-3, d: 0.25e-3, pad: 0.5e-3, Da: 0.9e-3, material: 'Megtron 6', er: 3.4 } },
    { id: 'backplane', label: '3.2 mm backplane via, 40 ps edge: inductive and not lumped', state: { ...defaults(), tr: 40e-12, h: 3.2e-3, d: 0.35e-3, pad: 0.65e-3, Da: 1.4e-3, topology: 'tee' } },
    { id: 'rosa', label: 'Default via with the Rosa partial inductance', state: { ...defaults(), lForm: 'rosa' } },
  ],
};
