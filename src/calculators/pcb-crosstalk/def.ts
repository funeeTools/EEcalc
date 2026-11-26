/** PCB crosstalk — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN, U_LEN_PCB, U_THICK, withDefault } from '@/core/unitsets';
import { TB_MAX } from '@/calculators/stripline-diff/model';
import { C0, STRIP_KB, coupling, fextOf, nextOf, satLength, waveforms, type Coupling, type Topo, type XtGeom } from './model';

export const ID = 'pcb/pcb-crosstalk';

export const MATERIALS: Record<string, number | null> = {
  Custom: null,
  'FR-4 (generic)': 4.3,
  'FR-4 high-Tg (IS410)': 4.0,
  'Megtron 6': 3.4,
  RO4350B: 3.66,
};

export interface XtState {
  solveFor: 'xt' | 's' | 'len';
  metric: 'next' | 'fext';
  xt: number;
  topo: Topo;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
  h: number;
  hUnit: string;
  t: number;
  tUnit: string;
  material: string;
  er: number;
  len: number;
  lenUnit: string;
  tr: number;
  trUnit: string;
  v: number;
}

const U_TR: Record<string, number> = { ns: 1e-9, ps: 1e-12, 'µs': 1e-6 };
const U_RUN: Record<string, number> = { ...withDefault(U_LEN, 'mm'), 'µm': 1e-6 }; // µm for the shortest solved runs

export const defaults = (): XtState => ({
  solveFor: 'xt',
  metric: 'next',
  xt: 2,
  topo: 'microstrip',
  w: 0.2e-3,
  wUnit: 'mm',
  s: 0.2e-3,
  sUnit: 'mm',
  h: 0.2e-3,
  hUnit: 'mm',
  t: 35e-6,
  tUnit: 'µm',
  material: 'FR-4 (generic)',
  er: 4.3,
  len: 0.05,
  lenUnit: 'mm',
  tr: 1e-9,
  trUnit: 'ns',
  v: 3.3,
});

const LIM = { xt: [0, 100], s: [1e-6, 0.05], len: [1e-6, 10] } as const;


const RATIO_MIN = 0.01;
const RATIO_MAX = 40;

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Crosstalk budget',
    note: 'Click ◎ to choose the unknown.',
    fields: [
      {
        kind: 'select',
        key: 'metric',
        label: 'Budget applies to',
        options: [
          { value: 'next', label: 'NEXT (near end, backward)' },
          { value: 'fext', label: 'FEXT (far end, forward)' },
        ],
        help: 'Which crosstalk the % box holds: as a result in the analysis, or as the limit when solving for the spacing or the coupled length.',
      },
      { kind: 'number', key: 'xt', symbol: 'X', label: 'Crosstalk', suffix: '% of V', solvable: true, min: LIM.xt[0], max: LIM.xt[1], help: 'Victim noise as a percentage of the aggressor swing, at the end chosen above. Typical budgets: 2–5 % for single-ended logic, 1 % or less for clocks and analogue.' },
    ],
  },
  {
    kind: 'section',
    title: 'Traces',
    fields: [
      {
        kind: 'select',
        key: 'topo',
        label: 'Routing layer',
        options: [
          { value: 'microstrip', label: 'Microstrip (outer layer)' },
          { value: 'stripline', label: 'Stripline (inner layer)' },
        ],
        help: 'Microstrip: the field is partly in air, so the two modes travel at different speeds and FEXT appears. Stripline: centred between two planes in one dielectric, FEXT is zero.',
      },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', min: 1e-6, max: 0.05 },
      { kind: 'number', key: 's', symbol: 'S', label: 'Edge gap', units: U_LEN_PCB, unitKey: 'sUnit', solvable: true, min: LIM.s[0], max: LIM.s[1], help: 'Edge-to-edge spacing. Solved: the smallest gap that keeps the chosen crosstalk within the budget.' },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Height to plane', units: U_LEN_PCB, unitKey: 'hUnit', min: 1e-6, max: 0.05, help: 'Dielectric between the traces and the reference plane (stripline: to each of the two planes; the traces are centred).' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 1e-3, help: '1 oz ≈ 35 µm, ½ oz ≈ 17.5 µm.' },
      {
        kind: 'select',
        key: 'material',
        label: 'Laminate',
        options: Object.keys(MATERIALS),
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m != null) s.er = m;
        },
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 18 },
    ],
  },
  {
    kind: 'section',
    title: 'Signal',
    fields: [
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'Coupled length', units: U_RUN, unitKey: 'lenUnit', solvable: true, min: LIM.len[0], max: LIM.len[1], help: 'Length over which the two traces run side by side. Solved: the longest parallel run within the budget.' },
      { kind: 'number', key: 'tr', symbol: 't_r', label: 'Rise time', units: U_TR, unitKey: 'trUnit', min: 1e-12, max: 1e-6, help: 'Aggressor edge (10–90 %), treated as a linear ramp of this duration.' },
      { kind: 'number', key: 'v', symbol: 'V', label: 'Aggressor swing', unit: 'V', min: 0.01, max: 1000, help: 'Only scales the noise voltages.' },
    ],
  },
];

const fLen = (m: number) => si(m, 'm', 4);
const fPct = (x: number) => `${(100 * x).toPrecision(3)} %`;
const dB = (x: number) => (x > 0 ? `${(20 * Math.log10(x)).toFixed(1)} dB` : '−∞ dB');

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: XtState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function fail(msg: string, s: XtState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

const geomOf = (s: XtState): XtGeom => ({ topo: s.topo, w: s.w, s: s.s, h: s.h, t: s.t, er: s.er });
const metricOf = (s: XtState, k: Coupling) => (s.metric === 'next' ? nextOf(k, s.len, s.tr) : fextOf(k, s.len, s.tr));

/*
 * Mode-switch harness notes: typed values outside the model (W/H, S/H, T/H, T/b) and budgets met at any gap are
 * red errors on purpose ("error-after-edit"). Round trips can legitimately return another value: a saturated NEXT
 * is reached at L_sat for any longer run, and on microstrip FEXT is not monotonic in S at small S/H (the solve
 * returns the gap beyond which the budget holds for every wider gap). When every gap meets the budget, the solve
 * returns the smallest gap in range with a pass note; the budget is then a limit, not the crosstalk at that gap, so
 * re-solving the crosstalk from there returns the actual (lower) value.
 */

/**
 * Smallest gap that keeps the budget metric at `target` (crosstalk falls as S grows). A root at the stripline
 * model's S = 5T step (Cohn's eq. 20/22 switch) is accepted: there the budget is met at S = 5T within the model error.
 */
export function solveGap(s: XtState, target: number): { ok: true; x: number } | { ok: false; reason: string; any?: boolean } {
  const isFext = s.metric === 'fext';
  const lo = Math.max(RATIO_MIN * s.h, LIM.s[0]);
  const hi = Math.min(RATIO_MAX * s.h, LIM.s[1]);
  if (isFext && s.topo === 'stripline') return { ok: false, any: true, reason: 'FEXT is zero in a homogeneous stripline at any spacing: the budget is met for every gap.' };
  const g = (x: number) => metricOf(s, coupling({ ...geomOf(s), s: x }));
  const atHi = g(hi);
  // the largest crosstalk over the whole gap range (FEXT on microstrip is not monotonic at small S/H)
  let peak = 0;
  let atPeak = lo;
  for (let i = 0; i <= 80; i++) {
    const x = lo * (hi / lo) ** (i / 80);
    const v = g(x);
    if (v > peak) [peak, atPeak] = [v, x];
  }
  if (target >= peak) return { ok: false, any: true, reason: `${isFext ? 'FEXT' : 'NEXT'} is at most ${fPct(peak)} (at S = ${fLen(atPeak)}): any gap meets a ${fPct(target)} budget.` };
  if (target <= atHi) return { ok: false, reason: `${isFext ? 'FEXT' : 'NEXT'} is still ${fPct(atHi)} at S = ${fLen(hi)} (${RATIO_MAX}·H): no gap in range meets ${fPct(target)}. Shorten the coupled run, slow the edge, or move the traces closer to their plane.` };
  const inv = invert(g, target, { lo, hi, log: true, samples: 80 });
  if (!inv.roots.length) return { ok: false, reason: `No gap between ${fLen(lo)} and ${fLen(hi)} gives ${fPct(target)}.` };
  return { ok: true, x: Math.max(...inv.roots) };
}

function run(st: XtState): CalcReport {
  const s: XtState = { ...st };
  let satNote = false;
  let passNote = '';
  const key = s.solveFor;
  for (const [k, name] of [['w', 'Trace width'], ['h', 'Height'], ['er', 'εr'], ['tr', 'Rise time'], ['v', 'Swing']] as const) if (!(finite(name, s[k]) > 0)) throw new Error(`${name} must be > 0.`);
  if (!(finite('Copper thickness', s.t) >= 0)) throw new Error('Copper thickness must be ≥ 0.');
  if (s.er < 1) throw new Error('εr must be ≥ 1.');
  if (key !== 's' && !(finite('Edge gap', s.s) > 0)) throw new Error('Edge gap must be > 0.');
  if (key !== 'len' && !(finite('Coupled length', s.len) > 0)) throw new Error('Coupled length must be > 0.');
  if (key !== 'xt' && !(finite('Crosstalk budget', s.xt) > 0)) throw new Error('The crosstalk budget must be > 0 %.');
  const u = s.w / s.h;
  if (u < RATIO_MIN || u > RATIO_MAX) throw new Error(`W/H = ${u.toPrecision(3)} is outside the model range (${RATIO_MIN}–${RATIO_MAX}). Check the units.`);
  if (s.topo === 'stripline' && s.t / (2 * s.h + s.t) > TB_MAX) throw new Error(`T/b = ${(s.t / (2 * s.h + s.t)).toFixed(3)} is above ${TB_MAX}, the limit of the stripline thickness correction: copper this thick next to its planes needs a field solver.`);
  if (s.topo === 'microstrip' && s.t / s.h > 1) throw new Error('Copper thicker than the dielectric height is outside the model range.');
  if (key !== 's' && (s.s / s.h < RATIO_MIN || s.s / s.h > RATIO_MAX)) throw new Error(`S/H = ${(s.s / s.h).toPrecision(3)} is outside the model range (${RATIO_MIN}–${RATIO_MAX}). Check the units.`);
  const target = s.xt / 100;
  const isFext = s.metric === 'fext';

  if (key === 's') {
    const r = solveGap(s, target);
    if (!r.ok && !r.any) return fail(r.reason, s);
    // Budget met at every gap: answer the smallest gap in the model range, with a pass note (not a red error).
    if (r.ok) s.s = r.x;
    else {
      s.s = Math.max(RATIO_MIN * s.h, LIM.s[0]);
      passNote = r.reason;
    }
  } else if (key === 'len') {
    const k = coupling(geomOf(s));
    if (isFext) {
      if (k.kf === 0) return fail('FEXT is zero in a homogeneous stripline: any coupled length meets the budget. Solve for NEXT instead.', s);
      if (target >= 0.5) return fail('FEXT cannot exceed 50 % of the swing (the even and odd modes fully separated): any coupled length meets this budget.', s);
      s.len = (target * s.tr) / (Math.abs(k.kf) * k.tpd);
    } else {
      // A budget exactly at the saturated NEXT (as an analysis of a long run leaves it) is reached at L_sat and
      // never exceeded: answer L_sat with a note rather than an error. Any length ≥ L_sat gives the same NEXT, so a
      // round trip from a saturated state returns L_sat, not the run entered (expected; harness "roundtrip").
      if (target > k.kb * (1 + 1e-9)) return fail(`NEXT saturates at K_b = ${fPct(k.kb)} at this spacing, below the ${fPct(target)} budget: any coupled length meets it.`, s);
      if (target >= k.kb) satNote = true;
      s.len = (Math.min(target, k.kb) * s.tr) / (2 * k.kb * k.tpd);
    }
    if (!(s.len >= LIM.len[0] && s.len <= LIM.len[1])) return fail(`The coupled length would be ${fLen(s.len)}, outside ${fLen(LIM.len[0])} … ${fLen(LIM.len[1])}.`, s);
  }
  const k = coupling(geomOf(s));
  const val = metricOf(s, k);
  if (key === 'xt') s.xt = 100 * val;
  const rep = report(s, k);
  if (passNote) {
    rep.status = { text: 'ANY GAP PASSES', tone: 'pass' };
    rep.notes.unshift(`${passNote} The gap shown is the smallest the model covers (${RATIO_MIN}·H); set it from your fab’s minimum spacing.`);
  }
  if (satNote) rep.notes.unshift(`The budget equals the saturated NEXT (K_b = ${fPct(k.kb)}): NEXT reaches it at L_sat = ${fLen(s.len)} and stays there for any longer run, so the run length is not limited by NEXT.`);
  return rep;
}

function report(s: XtState, k: Coupling): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const key = s.solveFor;
  const next = nextOf(k, s.len, s.tr);
  const fext = fextOf(k, s.len, s.tr);
  const td = s.len * k.tpd;
  const lsat = satLength(k, s.tr);
  const isFext = s.metric === 'fext';
  const budget = s.xt / 100;
  const val = isFext ? fext : next;
  const item = (key2: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key: key2, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (key === 's') prim.push(item('s', 'Minimum edge gap', s.s, 'm', fLen(s.s), { symbol: 'S', solved: true, primary: true, note: `pitch ${fLen(s.s + s.w)} = ${((s.s + s.w) / s.w).toFixed(2)}·W · S/H = ${(s.s / s.h).toPrecision(3)}` }));
  if (key === 'len') prim.push(item('len', 'Longest coupled run', s.len, 'm', fLen(s.len), { symbol: 'ℓ', solved: true, primary: true, note: `${(s.len / 0.0254).toPrecision(3)} in` }));
  const nextItem = item('next', 'Near-end crosstalk', next, '', `${fPct(next)} · ${si(next * s.v, 'V', 3)}`, { symbol: 'NEXT', note: `${dB(next)} · ${td * 2 >= s.tr ? 'saturated (ℓ ≥ L_sat)' : `${((100 * 2 * td) / s.tr).toFixed(0)} % of saturation`}` });
  const fextItem = item('fext', 'Far-end crosstalk', fext, '', s.topo === 'stripline' ? '0 (stripline)' : `${fPct(fext)} · ${si(fext * s.v, 'V', 3)}`, { symbol: 'FEXT', note: s.topo === 'stripline' ? 'both modes travel at c/√εr' : `${dB(fext)} · negative-going pulse` });
  const kbItem = item('kb', 'Backward coefficient', k.kb, '', k.kb.toFixed(4), { symbol: 'K_b', note: `¼(L_m/L + C_m/C) = saturated NEXT · ${dB(k.kb)}` });
  const lsatItem = item('lsat', 'Saturation length', lsat, 'm', fLen(lsat), { symbol: 'L_sat', note: 't_r/(2·t_pd): NEXT stops growing beyond it' });
  if (key === 'xt') {
    prim.push(item('xt', isFext ? 'Far-end crosstalk (FEXT)' : 'Near-end crosstalk (NEXT)', s.xt, '%', `${s.xt.toPrecision(4)} %`, { symbol: 'X', solved: true, primary: true, note: `${si((s.xt / 100) * s.v, 'V', 3)} on a ${si(s.v, 'V', 3)} swing · ${dB(s.xt / 100)}` }));
    prim.push({ ...(isFext ? nextItem : fextItem), primary: true }, { ...kbItem, primary: true }, { ...lsatItem, primary: true });
    prim.push({ ...(isFext ? fextItem : nextItem), group: 'Crosstalk' });
  } else {
    prim.push({ ...nextItem, primary: true }, { ...fextItem, primary: true }, { ...kbItem, primary: true });
    prim.push(item('xt', `Budget (${isFext ? 'FEXT' : 'NEXT'})`, s.xt, '%', `${s.xt.toPrecision(4)} %`, { symbol: 'X', group: 'Crosstalk', note: 'the target the solve meets' }), { ...lsatItem, group: 'Timing' });
  }
  const sec: ResultItem[] = [
    item('td', 'Coupled-run delay', td, 's', si(td, 's', 4), { symbol: 'TD', group: 'Timing', note: `NEXT lasts 2TD = ${si(2 * td, 's', 3)}` }),
    item('tpd', 'Propagation delay', k.tpd, 's/m', `${si(k.tpd * 1e-3, 's', 4)}/mm`, { symbol: 't_pd', group: 'Timing' }),
    item('modeDelta', 'Even–odd arrival difference', s.len * Math.abs(Math.sqrt(k.ee) - Math.sqrt(k.eo)) / C0, 's', si((s.len * Math.abs(Math.sqrt(k.ee) - Math.sqrt(k.eo))) / C0, 's', 3), { symbol: 'Δt_eo', group: 'Timing', note: 'width scale of the FEXT pulse once it exceeds t_r' }),
    item('lmL', 'Inductive coupling', k.lm / k.l, '', (k.lm / k.l).toFixed(4), { symbol: 'L_m/L', group: 'Coupled line' }),
    item('cmC', 'Capacitive coupling', k.cm / k.c, '', (k.cm / k.c).toFixed(4), { symbol: 'C_m/C', group: 'Coupled line', note: s.topo === 'stripline' ? 'equal to L_m/L: homogeneous' : 'smaller than L_m/L on microstrip' }),
    item('kf', 'Forward coefficient', k.kf, '', k.kf.toFixed(4), { symbol: 'K_f', group: 'Coupled line', note: '½(C_m/C − L_m/L); FEXT = K_f·TD/t_r' }),
    item('z0', 'Trace impedance (with neighbour)', k.z0, 'Ω', si(k.z0, 'Ω', 4), { symbol: 'Z₀', group: 'Coupled line', note: `√(L/C) · Z₀ₑ ${si(k.ze, 'Ω', 3)}, Z₀ₒ ${si(k.zo, 'Ω', 3)}` }),
    item('rot', 'Rule of thumb 1/(1+(D/H)²)', 1 / (1 + ((s.w + s.s) / s.h) ** 2), '', (1 / (1 + ((s.w + s.s) / s.h) ** 2)).toFixed(4), { symbol: 'RoT', group: 'Coupled line', note: 'Johnson & Graham shape factor, D = pitch: compare trends, not values' }),
  ];
  rep.results = [...prim, ...sec];
  const over = val > budget * (1 + 1e-9);
  rep.summary = `${s.topo} · W ${fLen(s.w)} · S ${fLen(s.s)} · H ${fLen(s.h)} · ℓ ${fLen(s.len)} · t_r ${si(s.tr, 's', 3)} · L_sat ${fLen(lsat)}`;

  // ── warnings and notes
  const w = rep.warnings;
  if (key !== 'xt' && over) w.push(`${isFext ? 'FEXT' : 'NEXT'} is above the budget.`);
  if (s.topo === 'microstrip') {
    const u = s.w / s.h;
    const g = s.s / s.h;
    if (u < 0.1 || u > 10 || g < 0.1 || g > 10) w.push(`W/H = ${u.toPrecision(3)}, S/H = ${g.toPrecision(3)}: outside the Kirschning–Jansen range (0.1–10). Confirm with a field solver.`);
    const dte = (s.len * Math.abs(Math.sqrt(k.ee) - Math.sqrt(k.eo))) / C0;
    if (dte > s.tr / 2) w.push(`The even and odd modes arrive ${si(dte, 's', 3)} apart, more than half the rise time: the far-end pulse spreads out and grows more slowly than the linear formula, so the real FEXT is lower than shown. Slow edges or long runs on microstrip: consider stripline.`);
    rep.notes.push('Bare microstrip: solder mask over the traces fills the gap with dielectric, which lowers FEXT (often by 20–50 %) and raises NEXT a little. Treat FEXT here as the upper value.');
  } else {
    const b = 2 * s.h + s.t;
    if (k.branch === 'close') rep.notes.push(`S < 5T: Cohn’s closely-spaced odd-mode formula; it steps at S = 5T (${fLen(5 * s.t)}), so crosstalk jumps slightly there.`);
    if (s.t > 0) {
      const band = s.w / b < 0.15 ? STRIP_KB.narrow : STRIP_KB.wide;
      w.push(`Stripline with copper thickness: Cohn’s thickness correction underestimates the coupling. Against a 2-D field solution K_b (and NEXT) reads ${band[0]} … ${band[1] >= 0 ? '+' : '−'}${Math.abs(band[1])} % for W/b ${s.w / b < 0.15 ? '< 0.15' : '≥ 0.15'} — the unsafe side. Keep margin in the budget, or confirm with a field solver.`);
    }
  }
  if (s.s < s.w && s.metric === 'next') rep.notes.push('Gap narrower than the trace width: the 3W rule (centre-to-centre ≥ 3W, i.e. S ≥ 2W) is the usual floor for single-ended nets.');
  if (k.kb > 0.15) w.push(`Strong coupling (K_b = ${k.kb.toFixed(3)}): the weak-coupling formulas overestimate the noise and ignore the aggressor’s own distortion. Widen the gap or simulate the pair.`);
  rep.notes.push('Both traces terminated in their characteristic impedance at both ends. A low-impedance driver at the victim’s near end reflects NEXT towards its far end; an open far end doubles FEXT.');
  rep.notes.push(
    s.topo === 'microstrip'
      ? 'Coupling from Kirschning–Jansen even/odd modes (bare pair). Against a 2-D field solution: K_b −3 … +12 % for S < 2H and −9 … +51 % for wider gaps (weak coupling is mostly overestimated, the safe side); K_f −3 … +27 % (160 cross-sections).'
      : `Coupling from Cohn’s coupled stripline: exact for zero-thickness copper (within ${STRIP_KB.zero[0]} … +${STRIP_KB.zero[1]} % of the field solution); with copper thickness K_b reads low, ${STRIP_KB.wide[0]} … +${STRIP_KB.wide[1]} % for W/b ≥ 0.15 and ${STRIP_KB.narrow[0]} … ${STRIP_KB.narrow[1]} % below (${STRIP_KB.cases} cross-sections, T/b up to 0.2).`,
  );
  rep.graphs = graphs(s, k);
  rep.tables = [budgetTable(s)];
  rep.details = { ...k, next, fext, td, lsat };
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: XtState, k: Coupling): GraphSpec[] {
  const g0 = geomOf(s);
  const ss = [...logspace(Math.max(Math.min(0.1 * s.h, s.s / 3), RATIO_MIN * s.h, 1e-6), Math.min(Math.max(8 * s.h, s.s * 3), RATIO_MAX * s.h, 0.05), 120), s.s].sort((a, b) => a - b);
  const ks = ss.map((x) => coupling({ ...g0, s: x }));
  // crosstalk graphs in dB of the swing (decades of % read badly on a log axis); floor at −120 dB for FEXT = 0
  const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-6));
  const next = ks.map((q) => db(nextOf(q, s.len, s.tr)));
  const fext = ks.map((q) => db(fextOf(q, s.len, s.tr)));
  const n0f = nextOf(k, s.len, s.tr);
  const n0 = db(n0f);
  const rot = (x: number) => 1 / (1 + ((s.w + x) / s.h) ** 2);
  const scale = n0f / rot(s.s);
  const budget = s.xt;
  const series: NonNullable<GraphSpec['series']> = [{ label: 'NEXT', x: ss, y: next, axis: 'x', width: 2.2, color: '#1f4e5f' }];
  if (s.topo === 'microstrip') series.push({ label: '|FEXT|', x: ss, y: fext, axis: 'x', width: 1.8, color: '#c47b17' });
  series.push({ label: 'rule of thumb ∝ 1/(1+(D/H)²)', x: ss, y: ss.map((x) => db(scale * rot(x))), axis: 'x', width: 1.1, color: '#9a8f7a', dash: [4, 3] });
  // victim waveforms
  const td = s.len * k.tpd;
  const tEnd = Math.max(2 * td + 2 * s.tr, td + 3 * s.tr);
  const ts: number[] = [];
  for (let i = 0; i <= 400; i++) ts.push((tEnd * i) / 400);
  for (const c of [s.tr, 2 * td, 2 * td + s.tr, td, td + s.tr]) for (const d of [-1e-6, 1e-6]) ts.push(c * (1 + d));
  ts.sort((a, b) => a - b);
  const wf = ts.map((t) => waveforms(k, s.len, s.tr, t));
  const mv = s.v;
  const lens = logspace(Math.min(s.len, satLength(k, s.tr)) / 20, Math.max(s.len, satLength(k, s.tr)) * 5, 140);
  const lsat = satLength(k, s.tr);
  return [
    {
      id: 'xt-vs-s',
      title: 'Crosstalk vs spacing',
      subtitle: `ℓ = ${fLen(s.len)}, t_r = ${si(s.tr, 's', 3)}`,
      x: { label: 'Edge gap S', unit: 'm', log: true },
      y: [{ id: 'x', label: 'Crosstalk', unit: 'dB' }],
      series,
      hlines: s.solveFor === 'xt' || !(budget > 0) ? [] : [{ value: db(budget / 100), label: `budget ${budget.toPrecision(3)} %`, axis: 'x', color: '#8b1e1e', dash: [6, 4] }],
      vlines: [{ value: s.s, label: `S = ${fLen(s.s)}`, color: '#9a8f7a' }],
      markers: [{ x: s.s, y: n0, axis: 'x', label: `NEXT ${fPct(n0f)}` }],
    },
    {
      id: 'waveforms',
      title: 'Victim noise vs time',
      subtitle: 'aggressor edge launched at t = 0; matched terminations',
      x: { label: 'Time', unit: 's' },
      y: [{ id: 'v', label: 'Victim voltage', unit: 'V' }],
      series: [
        { label: 'near end (NEXT)', x: ts, y: wf.map((p) => p.ne * mv), axis: 'v', width: 2.2, color: '#1f4e5f' },
        ...(s.topo === 'microstrip' ? [{ label: 'far end (FEXT)', x: ts, y: wf.map((p) => p.fe * mv), axis: 'v', width: 1.8, color: '#c47b17' }] : []),
      ],
      vlines: [
        { value: 2 * td, label: '2TD', color: '#9a8f7a', dash: [3, 3] },
        { value: td, label: 'TD', color: '#9a8f7a', dash: [3, 3] },
      ],
      legend: 'below',
    },
    {
      id: 'xt-vs-len',
      title: 'Crosstalk vs coupled length',
      x: { label: 'Coupled length ℓ', unit: 'm', log: true },
      y: [{ id: 'x', label: 'Crosstalk', unit: 'dB' }],
      series: [
        { label: 'NEXT', x: lens, y: lens.map((l) => db(nextOf(k, l, s.tr))), axis: 'x', width: 2.2, color: '#1f4e5f' },
        ...(s.topo === 'microstrip' ? [{ label: '|FEXT|', x: lens, y: lens.map((l) => db(fextOf(k, l, s.tr))), axis: 'x', width: 1.8, color: '#c47b17' }] : []),
      ],
      hlines: s.solveFor === 'xt' || !(budget > 0) ? [] : [{ value: db(budget / 100), label: `budget ${budget.toPrecision(3)} %`, axis: 'x', color: '#8b1e1e', dash: [6, 4] }],
      vlines: [
        { value: s.len, label: `ℓ = ${fLen(s.len)}`, color: '#9a8f7a' },
        { value: lsat, label: 'L_sat', color: '#9a8f7a', dash: [3, 3] },
      ],
      markers: [{ x: s.len, y: db(nextOf(k, s.len, s.tr)), axis: 'x', label: `NEXT ${fPct(nextOf(k, s.len, s.tr))}` }],
    },
  ];
}

/** Gap needed for common budgets at this length and edge (NEXT, or FEXT when that is the metric). */
function budgetTable(s: XtState): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  const isFext = s.metric === 'fext';
  for (const b of [0.5, 1, 2, 5, 10]) {
    const r = solveGap(s, b / 100);
    const gap = r.ok ? r.x : null;
    rows.push({ budget: b, s: gap, pitch: gap != null ? gap + s.w : null });
    display.push({ budget: `${b} %`, s: gap != null ? fLen(gap) : !r.ok && r.any ? 'any gap' : 'not reachable', pitch: gap != null ? `${fLen(gap + s.w)} (${((gap + s.w) / s.w).toFixed(2)}·W)` : '—' });
  }
  return {
    id: 'budgets',
    title: `Gap for common ${isFext ? 'FEXT' : 'NEXT'} budgets`,
    columns: [
      { key: 'budget', label: `${isFext ? 'FEXT' : 'NEXT'} budget`, unit: '%' },
      { key: 's', label: 'Minimum gap S', unit: 'm' },
      { key: 'pitch', label: 'Pitch' },
    ],
    rows,
    display,
    note: `At W = ${fLen(s.w)}, H = ${fLen(s.h)}, ℓ = ${fLen(s.len)}, t_r = ${si(s.tr, 's', 3)} (${s.topo}).`,
  };
}

export const def: CalcDef<XtState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Weak-coupling crosstalk from the per-unit-length L and C matrices (Hall & Heck 2009; Bogatin 2009): K_b = ¼(L_m/L + C_m/C), NEXT = K_b·min(1, 2TD/t_r), FEXT = ½(C_m/C − L_m/L)·TD/t_r. Even/odd modes from Kirschning–Jansen coupled microstrip (with Jansen’s thickness rules) or Cohn’s coupled stripline (FEXT = 0). Solve-for by bracketed Brent root finding (gap) or in closed form (length).',
  fields,
  defaults,
  solve: {
    default: 'xt',
    analysis: 'xt',
    options: [
      { key: 'xt', label: 'Crosstalk from the layout (analysis)' },
      { key: 's', label: 'Minimum gap S for the budget' },
      { key: 'len', label: 'Longest coupled run for the budget' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: 'Two 0.2 mm microstrips, 0.2 mm apart, 50 mm, 1 ns edge', state: defaults() },
    { id: 'gap-2pct', label: 'Gap for 2 % NEXT, same traces (solve S)', state: { ...defaults(), solveFor: 's', metric: 'next', xt: 2 } },
    { id: 'stripline', label: 'Same traces on an inner layer (stripline): FEXT = 0', state: { ...defaults(), topo: 'stripline', h: 0.15e-3, t: 17.5e-6 } },
    { id: 'fext-run', label: 'Longest microstrip run for 1 % FEXT, 200 ps edge (solve ℓ)', state: { ...defaults(), solveFor: 'len', metric: 'fext', xt: 1, tr: 200e-12, trUnit: 'ps', s: 0.3e-3 } },
    { id: 'short-run', label: 'Short 5 mm run with a 2 ns edge: NEXT far from saturation', state: { ...defaults(), len: 5e-3, tr: 2e-9 } },
    { id: '3w', label: '3W rule: 0.15 mm traces at 0.3 mm gap, 100 mm, DDR edge', state: { ...defaults(), w: 0.15e-3, s: 0.3e-3, h: 0.1e-3, len: 0.1, tr: 300e-12, trUnit: 'ps', v: 1.2 } },
  ],
};

export { STRIP_KB };
