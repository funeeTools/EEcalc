/** Comparator with hysteresis — calculator definition (topology, output stage, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { R_STD_MAX, R_STD_MIN, eValues } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { type CompIn, type OutKind, type Thresholds, type Topo, currents, design, levels, outHigh, thresholds } from './model';

export const ID = 'general/comparator-hysteresis';

export interface CompState {
  /** vth: thresholds from the resistors (analysis) · r2: R₂ and R₃ for target thresholds, R₁ kept */
  solveFor: 'vth' | 'r2';
  topo: Topo;
  out: OutKind;
  vcc: number;
  vth: number;
  vtl: number;
  /** Peak-to-peak noise on the input; null = not checked */
  noise: number | null;
  vr: number;
  r1: number;
  r1Unit: string;
  r2: number;
  r2Unit: string;
  r3: number;
  r3Unit: string;
  r4: number;
  r4Unit: string;
  voh: number;
  vol: number;
  vpu: number;
  rp: number;
  rpUnit: string;
  eseries: string;
}

/** TI TIDU020A design: 5 V, TLV3201 push-pull, R_x = 100 kΩ kept, thresholds 2.7 V / 2.3 V. */
export const defaults = (): CompState => ({
  solveFor: 'r2',
  topo: 'inv',
  out: 'pushpull',
  vcc: 5,
  vth: 2.7,
  vtl: 2.3,
  noise: null,
  vr: 5,
  r1: 100e3,
  r1Unit: 'kΩ',
  r2: 100e3,
  r2Unit: 'kΩ',
  r3: 575e3,
  r3Unit: 'kΩ',
  r4: 10e3,
  r4Unit: 'kΩ',
  voh: 5,
  vol: 0,
  vpu: 5,
  rp: 10e3,
  rpUnit: 'kΩ',
  eseries: 'E96',
});

const U_R: Record<string, number> = { ...withDefault(U_OHM, 'kΩ'), 'GΩ': 1e9 };
const isNon = (s: any) => s.topo === 'noninv';
const isOD = (s: any) => s.out === 'opendrain';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Circuit',
    fields: [
      {
        kind: 'select', key: 'topo', label: 'Configuration',
        options: [
          { value: 'inv', label: 'Inverting (input on IN−)' },
          { value: 'noninv', label: 'Non-inverting (input via R₄ on IN+)' },
        ],
        help: 'Inverting: the input drives IN−, IN+ sits on the R₁/R₂ divider and R₃ feeds back from the output; the output goes low above V_TH. Non-inverting: the input drives IN+ through R₄, R₃ feeds back to IN+, IN− is the R₁/R₂ reference; the output goes high above V_TH.',
      },
      { kind: 'select', key: 'out', label: 'Output stage', options: [{ value: 'pushpull', label: 'Push-pull' }, { value: 'opendrain', label: 'Open-drain + pull-up' }], help: 'Push-pull (TLV3201, TLV7011, LMV7291) drives both levels. Open-drain / open-collector (LM393, LM339, TLV1702) only pulls low; the high level comes from the pull-up R_P, which then sits in series with R₃.' },
      { kind: 'number', key: 'vcc', symbol: 'V_CC', label: 'Comparator supply', unit: 'V', min: 0.5, max: 60, help: 'Used to check that both thresholds stay inside the supply rails (input common-mode range).' },
    ],
  },
  {
    kind: 'section',
    title: 'Thresholds',
    note: 'Click ◎ to choose the unknown: the thresholds, or R₂ and R₃ for target thresholds.',
    fields: [
      // ±1e18 V: a non-inverting stage with R₄ ≫ R₃ really does put its thresholds far outside the rails, and an
      // analysis must never be refused for that (the warning about the input range covers it).
      { kind: 'number', key: 'vth', symbol: 'V_TH', label: 'Upper (rising) threshold', unit: 'V', solvable: true, min: -1e18, max: 1e18, solvedWhen: (_s, r) => r.solveFor === 'vth', onSolve: (_s, r) => (r.solveFor = 'vth'), onUnsolve: (_s, r) => (r.solveFor = 'r2'), help: 'Input voltage at which the output switches while the input rises.' },
      { kind: 'number', key: 'vtl', symbol: 'V_TL', label: 'Lower (falling) threshold', unit: 'V', solvable: true, min: -1e18, max: 1e18, solvedWhen: (_s, r) => r.solveFor === 'vth', onSolve: (_s, r) => (r.solveFor = 'vth'), onUnsolve: (_s, r) => (r.solveFor = 'r2'), help: 'Input voltage at which the output switches back while the input falls.' },
      { kind: 'number', key: 'noise', symbol: 'v_n,pp', label: 'Input noise (pk-pk)', unit: 'V', optional: true, zeroHint: 'not checked', min: 0, max: 1e3, help: 'Optional: peak-to-peak noise riding on the input. The hysteresis must be wider than this, or the output chatters.' },
    ],
  },
  {
    kind: 'section',
    title: 'Resistors',
    fields: [
      { kind: 'number', key: 'vr', symbol: 'V_R', label: 'Divider supply', unit: 'V', min: 1e-3, max: 1e3, help: 'Top of the R₁/R₂ divider: usually V_CC, or a reference (TL431, LM4040) when the thresholds must not move with the supply.' },
      { kind: 'number', key: 'r1', symbol: 'R₁', label: 'Divider top', units: U_R, unitKey: 'r1Unit', min: 1, max: 1e10, help: 'From V_R to the reference node. Kept fixed when solving; it sets the impedance level (TI TIDU020A picks 100 kΩ for low current).' },
      { kind: 'number', key: 'r2', symbol: 'R₂', label: 'Divider bottom', units: U_R, unitKey: 'r2Unit', solvable: true, min: 1e-2, max: 1e12, onUnsolve: (_s, r) => (r.solveFor = 'vth'), help: 'From the reference node to ground. Solved together with R₃.' },
      { kind: 'number', key: 'r3', symbol: 'R₃', label: 'Feedback (hysteresis)', units: U_R, unitKey: 'r3Unit', solvable: true, min: 1e-2, max: 1e12, solvedWhen: (_s, r) => r.solveFor === 'r2', onSolve: (_s, r) => (r.solveFor = 'r2'), onUnsolve: (_s, r) => (r.solveFor = 'vth'), help: 'From the output to IN+. Smaller R₃ = more hysteresis.' },
      { kind: 'number', key: 'r4', symbol: 'R₄', label: 'Input resistor', units: U_R, unitKey: 'r4Unit', min: 1, max: 1e10, visible: isNon, help: 'Signal source to IN+ (include the source resistance). The hysteresis is (V_H − V_L)·R₄/R₃, so the source impedance matters.' },
    ],
  },
  {
    kind: 'section',
    title: 'Output stage',
    fields: [
      { kind: 'number', key: 'voh', symbol: 'V_OH', label: 'Output high level', unit: 'V', min: -1e3, max: 1e3, visible: (s) => !isOD(s), help: 'Push-pull high level, V_CC for a rail-to-rail output at light load.' },
      { kind: 'number', key: 'vol', symbol: 'V_OL', label: 'Output low level', unit: 'V', min: -1e3, max: 1e3, help: '0 V for a rail-to-rail output; an open-collector stage sits around 0.1–0.4 V when sinking a few mA.' },
      { kind: 'number', key: 'vpu', symbol: 'V_PU', label: 'Pull-up voltage', unit: 'V', min: -1e3, max: 1e3, visible: isOD },
      { kind: 'number', key: 'rp', symbol: 'R_P', label: 'Pull-up resistor', units: U_R, unitKey: 'rpUnit', min: 1, max: 1e9, visible: isOD, help: 'In the high state R_P is in series with R₃, so the upper and lower thresholds shift by different amounts. Keep R_P ≪ R₃ (TI TIDU020A: R₃ > 100·R_P for open-collector parts).' },
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E48', 'E96'], help: 'IEC 60063 series searched for the standard R₂/R₃ pair closest to both targets.' },
    ],
  },
];

const fV = (v: number, d = 4) => si(v, 'V', d);
const fR = (r: number, d = 4) => si(r, 'Ω', d);
const mv = (v: number) => si(v, 'V', 3);

function modelIn(s: CompState): CompIn {
  return { topo: s.topo, out: s.out, vr: s.vr, r1: s.r1, r2: s.r2, r3: s.r3, r4: s.r4, voh: s.voh, vol: s.vol, vpu: s.vpu, rp: s.rp };
}

export function compute(st: CompState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function num(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

interface Cand {
  r2: number;
  r3: number;
  vth: number;
  vtl: number;
  err: number;
}

function run(st: CompState): CalcReport {
  const s: CompState = { ...st };
  for (const [k, n] of [['vcc', 'V_CC'], ['vr', 'V_R'], ['r1', 'R₁'], ['vol', 'V_OL']] as const) num(n, s[k]);
  if (s.topo === 'noninv') num('R₄', s.r4);
  if (s.out === 'opendrain') (num('V_PU', s.vpu), num('R_P', s.rp));
  else num('V_OH', s.voh);
  if (!(s.r1 > 0) || (s.topo === 'noninv' && !(s.r4 > 0)) || (s.out === 'opendrain' && !(s.rp > 0))) throw new Error('Resistors must be > 0.');
  if (!(s.vr > 0)) throw new Error('The divider supply V_R must be > 0.');
  const vHigh = s.out === 'opendrain' ? s.vpu : s.voh;
  if (!(vHigh > s.vol)) throw new Error(`The output high level (${fV(vHigh)}) must be above V_OL (${fV(s.vol)}).`);

  // Mode-switch harness: the remaining "error-after-edit" flags are typed numbers that make the answer
  // impossible (V_OH ≤ V_OL, V_TH ≤ V_TL, targets the divider cannot reach): those are meant to be red.
  if (s.solveFor === 'r2') {
    num('V_TH', s.vth);
    num('V_TL', s.vtl);
    const d = design(modelIn(s), s.vth, s.vtl);
    if (!d.ok) return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, error: d.reason, status: { text: 'NO SOLUTION', tone: 'fail' } };
    s.r2 = d.r2;
    s.r3 = d.r3;
  } else {
    num('R₂', s.r2);
    num('R₃', s.r3);
    if (!(s.r2 > 0) || !(s.r3 > 0)) throw new Error('Resistors must be > 0.');
  }
  const mi = modelIn(s);
  const t = thresholds(mi);
  s.vth = t.vth;
  s.vtl = t.vtl;
  const dv = t.vth - t.vtl;
  const cur = currents(mi, t);
  const lv = levels(mi);
  const vNodeHigh = s.topo === 'inv' ? t.vth : t.vref;
  const vOutHigh = outHigh(mi, vNodeHigh);

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const design_ = s.solveFor === 'r2';
  const res: ResultItem[] = [];
  if (design_) {
    res.push(item('r2', 'Divider bottom', s.r2, 'Ω', fR(s.r2), { symbol: 'R₂', solved: true, primary: true, note: `with R₁ = ${fR(s.r1, 3)}` }));
    res.push(item('r3', 'Feedback resistor', s.r3, 'Ω', fR(s.r3), { symbol: 'R₃', solved: true, primary: true, note: 'sets the hysteresis' }));
  } else {
    res.push(item('vth', 'Upper threshold', t.vth, 'V', fV(t.vth, 5), { symbol: 'V_TH', solved: true, primary: true, note: s.topo === 'inv' ? 'input rising: output goes low' : 'input rising: output goes high' }));
    res.push(item('vtl', 'Lower threshold', t.vtl, 'V', fV(t.vtl, 5), { symbol: 'V_TL', solved: true, primary: true, note: s.topo === 'inv' ? 'input falling: output goes high' : 'input falling: output goes low' }));
  }
  res.push(item('hyst', 'Hysteresis', dv, 'V', mv(dv), { symbol: 'ΔV', primary: true, note: `centre ${fV((t.vth + t.vtl) / 2)}` }));

  // ── standard parts: every E-series R₂ × R₃ within ±15 % of the exact values, ranked by the worse threshold error
  const cands = stdPairs(s, mi);
  const best = cands[0];
  if (best) {
    const rel = best.err / Math.max(dv, 1e-12);
    res.push(item('pair', `Best ${s.eseries} R₂ / R₃`, best.err, 'V', `${fR(best.r2, 3)} / ${fR(best.r3, 3)}`, { primary: design_, group: design_ ? undefined : `Nearest ${s.eseries} parts`, note: `V_TH ${fV(best.vth)}, V_TL ${fV(best.vtl)}`, tone: rel > 0.2 ? 'warn' : '' }));
  }
  const g = 'Thresholds';
  res.push(
    item('centre', 'Centre', (t.vth + t.vtl) / 2, 'V', fV((t.vth + t.vtl) / 2), { symbol: 'V_C', group: g }),
    item('vref', s.topo === 'inv' ? 'Divider voltage (no feedback)' : 'Reference at IN−', t.vref, 'V', fV(t.vref), { symbol: 'V_ref', group: g, note: 'V_R·R₂/(R₁+R₂)' }),
    item('hystPct', 'Hysteresis / V_R', dv / s.vr, '', `${((dv / s.vr) * 100).toFixed(2)} %`, { group: g }),
  );
  if (design_) {
    res.push(item('vthChk', 'Upper threshold', t.vth, 'V', fV(t.vth, 5), { symbol: 'V_TH', group: g, note: 'from the solved R₂, R₃' }));
    res.push(item('vtlChk', 'Lower threshold', t.vtl, 'V', fV(t.vtl, 5), { symbol: 'V_TL', group: g }));
  }
  const go = 'Output & currents';
  res.push(
    item('vOutHigh', 'Output high level', vOutHigh, 'V', fV(vOutHigh), { symbol: 'V_out,H', group: go, note: s.out === 'opendrain' ? 'pull-up loaded by R₃ at the threshold' : 'V_OH' }),
    item('iDiv', 'Divider current', cur.iDiv, 'A', si(cur.iDiv, 'A', 3), { symbol: 'I_div', group: go, note: 'V_R/(R₁+R₂)' }),
    item('iSink', 'Output sink current (low)', cur.iSinkLow, 'A', si(cur.iSinkLow, 'A', 3), { symbol: 'I_OL', group: go, note: s.out === 'opendrain' ? 'pull-up + feedback current' : 'feedback current' }),
  );
  if (s.out === 'pushpull') res.push(item('iSource', 'Output source current (high)', cur.iSourceHigh, 'A', si(cur.iSourceHigh, 'A', 3), { symbol: 'I_OH', group: go, note: 'into R₃' }));
  const rNode = s.topo === 'inv' ? 1 / (1 / s.r1 + 1 / s.r2 + 1 / s.r3) : 1 / (1 / s.r4 + 1 / s.r3);
  res.push(item('rNode', 'Resistance at IN+', rNode, 'Ω', fR(rNode, 3), { symbol: 'R_IN+', group: go, note: 'bias current × this = threshold error' }));
  report.results = res;
  if (cands.length) report.tables.push(pairTable(s, cands, dv));

  // ── warnings
  if (s.noise != null && s.noise > 0) {
    if (s.noise >= dv) warnings.push(`The hysteresis (${mv(dv)}) is not wider than the ${mv(s.noise)} pk-pk input noise: the output can still chatter at each crossing. Lower R₃ (more hysteresis) or filter the input.`);
    else if (s.noise > 0.5 * dv) notes.push(`Noise ${mv(s.noise)} pk-pk uses ${((s.noise / dv) * 100).toFixed(0)} % of the hysteresis: little margin for noise growth or resistor tolerance.`);
  }
  if (s.topo === 'inv' && (t.vtl < 0 || t.vth > s.vcc)) warnings.push(`A threshold lies outside the comparator supply 0 … ${fV(s.vcc)}: the input drives IN− directly, so it can never reach it inside the common-mode range. Move the thresholds inside the rails (and check the part’s input range: many inputs only reach V_CC − 1.5 V).`);
  else if (s.topo === 'noninv' && (t.vtl < 0 || t.vth > s.vcc)) notes.push(`A threshold lies outside 0 … ${fV(s.vcc)}: fine for the non-inverting circuit (IN+ stays at V_ref when it switches), but the source must swing that far and IN+ must stay within the input range while it does.`);
  if (s.out === 'opendrain' && vOutHigh < s.vpu - 0.1 * (s.vpu - s.vol)) warnings.push(`R₃ loads the pull-up: the output only reaches ${fV(vOutHigh)} instead of ${fV(s.vpu)}. Use R₃ > 100·R_P (TI TIDU020A’s rule for open-collector parts), or a push-pull comparator, if the output drives logic.`);
  if (s.out === 'opendrain') notes.push(`Open-drain: R_P adds to R₃ in the high state, so V_TH and V_TL are not shifted symmetrically from the reference (${s.topo === 'inv' ? 'V_TH' : 'V_TL'} uses R₃ + R_P = ${fR(s.r3 + s.rp, 3)}).`);
  if (cur.iSinkLow > 4e-3) warnings.push(`The output sinks ${si(cur.iSinkLow, 'A', 3)} when low: above the 4 mA at which comparator data sheets usually specify V_OL (e.g. LM393: V_OL ≤ 400 mV at 4 mA), so V_OL and the lower threshold rise. Raise R_P / R₃.`);
  const rs = [s.r1, s.r2, s.r3, ...(s.topo === 'noninv' ? [s.r4] : [])];
  if (rNode > 1e6) warnings.push(`IN+ sees ${fR(rNode, 3)}: input bias / leakage current flowing in it shifts the thresholds (10 nA × R_IN+ = ${mv(10e-9 * rNode)}). Scale the resistors down, or use a CMOS-input comparator.`);
  else if (Math.max(...rs) > 10e6) notes.push('A resistor is above 10 MΩ: board leakage (humidity, flux residue) can matter; keep that node short and clean.');
  if (Math.min(...rs) < 100) warnings.push('A resistor is below 100 Ω: the divider and feedback currents become large and the comparator’s output resistance (tens of Ω) is no longer negligible. Scale the resistors up.');
  if (dv < 1e-3) notes.push(`ΔV = ${mv(dv)} is comparable to typical comparator input offsets (≈ 1–5 mV): the real thresholds will move by about that much.`);
  if (s.topo === 'noninv') notes.push('Non-inverting: the source impedance adds to R₄ and so changes the hysteresis. Drive R₄ from a low-impedance source.');
  notes.push('Neglected: comparator offset and internal hysteresis, input bias current, output resistance of the push-pull stage and the load on the output.');
  if (design_) notes.push(`Solved with R₁ = ${fR(s.r1, 3)}${s.topo === 'noninv' ? ` and R₄ = ${fR(s.r4, 3)}` : ''} kept; scale all resistors together to change the current without moving the thresholds${s.out === 'opendrain' ? ' (except R_P)' : ''}.`);

  report.summary = `${s.topo === 'inv' ? 'Inverting' : 'Non-inverting'} · ${s.out === 'opendrain' ? 'open-drain' : 'push-pull'} · V_TH ${fV(t.vth)} / V_TL ${fV(t.vtl)} · ΔV ${mv(dv)}`;
  report.details = { ...t, dv, levels: lv, vOutHigh, ...cur, state: s, best };
  report.graphs = [loopGraph(s, t, vOutHigh), r3Graph(s, st)];
  return report;
}

function stdPairs(s: CompState, mi: CompIn): Cand[] {
  const near = (x: number) => eValues(s.eseries, x / 1.15, x * 1.15).filter((v) => v >= R_STD_MIN && v <= R_STD_MAX);
  const r2s = near(s.r2);
  const r3s = near(s.r3);
  const out: Cand[] = [];
  const target = { vth: s.vth, vtl: s.vtl };
  for (const r2 of r2s)
    for (const r3 of r3s) {
      const t = thresholds({ ...mi, r2, r3 });
      out.push({ r2, r3, vth: t.vth, vtl: t.vtl, err: Math.max(Math.abs(t.vth - target.vth), Math.abs(t.vtl - target.vtl)) });
    }
  out.sort((a, b) => a.err - b.err);
  return out.slice(0, 8);
}

/** Row verdict: worse threshold error against the hysteresis width (≤ 5 % pass, ≤ 20 % warn). */
function tone(err: number, dv: number): 'pass' | 'warn' | 'fail' {
  const r = err / Math.max(dv, 1e-12);
  return r <= 0.05 ? 'pass' : r <= 0.2 ? 'warn' : 'fail';
}

function pairTable(s: CompState, cands: Cand[], dv: number): TableSpec {
  const rows = cands.map((c) => ({ r2: c.r2, r3: c.r3, vth: c.vth, vtl: c.vtl, dv: c.vth - c.vtl, err: c.err }));
  return {
    id: 'pairs',
    title: `${s.eseries} R₂ / R₃ pairs near ${fR(s.r2, 3)} / ${fR(s.r3, 3)}`,
    columns: [
      { key: 'r2', label: 'R₂', unit: 'Ω' },
      { key: 'r3', label: 'R₃', unit: 'Ω' },
      { key: 'vth', label: 'V_TH', unit: 'V' },
      { key: 'vtl', label: 'V_TL', unit: 'V' },
      { key: 'dv', label: 'ΔV', unit: 'V' },
      { key: 'err', label: 'Worst error', unit: 'V' },
    ],
    rows,
    rowTones: rows.map((r) => tone(r.err, dv)),
    display: rows.map((r) => ({ r2: fR(r.r2, 3), r3: fR(r.r3, 3), vth: fV(r.vth, 5), vtl: fV(r.vtl, 5), dv: mv(r.dv), err: mv(r.err) })),
    note: 'Every pair of standard values within ±15 % of the exact R₂ and R₃, ranked by the larger of the two threshold errors (R₁ kept). Green: error ≤ 5 % of the hysteresis width; yellow ≤ 20 %; red above.',
  };
}

function loopGraph(s: CompState, t: Thresholds, vOutHigh: number): GraphSpec {
  const dv = t.vth - t.vtl;
  const m = Math.max(dv, 0.05 * Math.max(Math.abs(t.vth), Math.abs(t.vtl), 0.01));
  const x0 = t.vtl - m;
  const x1 = t.vth + m;
  const hi = vOutHigh;
  const lo = s.vol;
  const inv = s.topo === 'inv';
  // rising: starts in the low-input state; falling: starts in the high-input state
  const startRise = inv ? hi : lo;
  const endRise = inv ? lo : hi;
  return {
    id: 'loop',
    title: 'Transfer curve',
    subtitle: 'Output vs input: the path depends on the direction (hysteresis loop)',
    x: { label: 'Input voltage V_in', unit: 'V' },
    y: [{ id: 'v', label: 'Output', unit: 'V', includeZero: true }],
    series: [
      { label: 'Input rising', x: [x0, t.vth, t.vth, x1], y: [startRise, startRise, endRise, endRise], axis: 'v', color: '#1f4e5f', width: 2.4 },
      { label: 'Input falling', x: [x1, t.vtl, t.vtl, x0], y: [endRise, endRise, startRise, startRise], axis: 'v', color: '#c47b17', width: 1.6, dash: [6, 3] },
    ],
    vlines: [
      { value: t.vtl, label: `V_TL ${fV(t.vtl, 3)}`, color: '#8b1e1e', dash: [4, 3] },
      { value: t.vth, label: `V_TH ${fV(t.vth, 3)}`, color: '#8b1e1e', dash: [4, 3] },
    ],
  };
}

function r3Graph(s: CompState, st: CompState): GraphSpec {
  const mi = modelIn(s);
  const n = 121;
  const xs = Array.from({ length: n }, (_, i) => s.r3 * 30 ** (2 * (i / (n - 1)) - 1));
  const th = xs.map((r3) => thresholds({ ...mi, r3 }));
  const design_ = s.solveFor === 'r2';
  return {
    id: 'vs-r3',
    title: 'Thresholds vs R₃',
    subtitle: design_ ? 'R₁, R₂ held at the solved values; dashed: targets' : 'All other parts held',
    x: { label: 'Feedback resistor R₃', unit: 'Ω', log: true },
    y: [{ id: 'v', label: 'Threshold', unit: 'V' }],
    series: [
      { label: 'V_TH', x: xs, y: th.map((t) => t.vth), axis: 'v', color: '#1f4e5f', width: 2 },
      { label: 'V_TL', x: xs, y: th.map((t) => t.vtl), axis: 'v', color: '#c47b17', width: 2 },
    ],
    hlines: design_ ? [{ value: st.vth, label: 'target', axis: 'v', color: '#9a8f7a', dash: [3, 3] }, { value: st.vtl, label: 'target', axis: 'v', color: '#9a8f7a', dash: [3, 3] }] : [],
    vlines: [{ value: s.r3, label: `R₃ = ${fR(s.r3, 3)}`, color: '#2f7d4f' }],
  };
}

export const def: CalcDef<CompState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Superposition at the comparator’s IN+ node with the output as a Thévenin source in each state (push-pull V_OH/V_OL; open-drain V_PU through R_P): inverting and non-inverting thresholds as in TI TIDU020A (Comparator with Hysteresis Reference Design, 2014), Maxim AN3616 and ADI MT-083; R₂ and R₃ for target thresholds by exact inversion of the low-state equation plus a bracketed root search on the other threshold; IEC 60063 E-series pair search.',
  fields,
  defaults,
  solve: {
    default: 'r2',
    analysis: 'vth',
    options: [
      { key: 'vth', label: 'Thresholds V_TH, V_TL from the resistors (analysis)' },
      { key: 'r2', label: 'R₂ and R₃ for target V_TH, V_TL (R₁ kept)' },
    ],
  },
  compute,
  examples: [
    { id: 'tidu020', label: 'TI TIDU020A: 5 V, 2.7 V / 2.3 V, R₁ = 100 kΩ (solve R₂, R₃)', state: defaults() },
    { id: 'tidu020-built', label: 'TIDU020A as built: 100k / 100k / 576k (analysis)', state: { ...defaults(), solveFor: 'vth', r2: 100e3, r3: 576e3 } },
    { id: 'lm393-od', label: 'Open-drain (LM393 style), 10 kΩ pull-up: asymmetric shift', state: { ...defaults(), solveFor: 'vth', out: 'opendrain', vol: 0.2, vpu: 5, rp: 10e3, r1: 100e3, r2: 100e3, r3: 1e6, r3Unit: 'MΩ', eseries: 'E24' } },
    { id: 'noninv', label: 'Non-inverting, 3 V rising / 2 V falling, R₄ = 10 kΩ (solve)', state: { ...defaults(), topo: 'noninv', solveFor: 'r2', vth: 3, vtl: 2, r1: 100e3, r4: 10e3, eseries: 'E24' } },
    { id: 'ref-2v5', label: '3.3 V supply, 2.5 V reference divider, 1.2 V ± 25 mV (solve)', state: { ...defaults(), vcc: 3.3, vr: 2.5, voh: 3.3, solveFor: 'r2', vth: 1.225, vtl: 1.175, r1: 47e3, eseries: 'E96', noise: 30e-3 } },
    { id: 'chatter', label: 'Edge case: 20 mV hysteresis, 50 mV noise (warning)', state: { ...defaults(), solveFor: 'vth', r1: 100e3, r2: 100e3, r3: 12e6, r3Unit: 'MΩ', noise: 50e-3, eseries: 'E24' } },
  ],
};
