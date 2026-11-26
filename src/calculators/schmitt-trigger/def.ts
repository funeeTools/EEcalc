/** Schmitt trigger RC oscillator (logic-gate Schmitt inverter or op-amp Schmitt trigger) — calculator definition. DOM-free. */

import type { CalcDef, CalcReport, GraphSeries, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import { bracketE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { GATES, type GatePart, type GateThresholds, type OscIn, charge, gateThresholds, ioTestAt, kRange, opampThresholds, oscFactors, oscillate, tpdAt, validOsc } from './model';

export const ID = 'general/schmitt-trigger';

export interface SchmittState {
  /** f: frequency and duty from R, C (analysis) · r: R for a target f · c: C for a target f */
  solveFor: 'f' | 'r' | 'c';
  type: 'gate' | 'opamp';
  part: 'HC14' | 'LVC1G14' | 'custom';
  vcc: number;
  /** Custom gate thresholds */
  vtp: number;
  vtm: number;
  /** Op-amp saturation levels and threshold network */
  voh: number;
  vol: number;
  vref: number;
  r1: number;
  r1Unit: string;
  r2: number;
  r2Unit: string;
  /** Op-amp slew rate, V/s; null = not checked */
  sr: number | null;
  srUnit: string;
  r: number;
  rUnit: string;
  c: number;
  cUnit: string;
  f: number;
  fUnit: string;
  eseriesR: string;
  eseriesC: string;
}

export const defaults = (): SchmittState => ({
  solveFor: 'f',
  type: 'gate',
  part: 'HC14',
  vcc: 5,
  vtp: 2.7,
  vtm: 1.7,
  voh: 10.5,
  vol: -10.5,
  vref: 0,
  r1: 10e3,
  r1Unit: 'kΩ',
  r2: 10e3,
  r2Unit: 'kΩ',
  sr: null,
  srUnit: 'V/µs',
  r: 10e3,
  rUnit: 'kΩ',
  c: 10e-9,
  cUnit: 'nF',
  f: 11.8e3,
  fUnit: 'kHz',
  eseriesR: 'E24',
  eseriesC: 'E12',
});

const U_R: Record<string, number> = { ...withDefault(U_OHM, 'kΩ'), 'GΩ': 1e9 };
const U_C: Record<string, number> = { nF: 1e-9, pF: 1e-12, 'µF': 1e-6, mF: 1e-3, fF: 1e-15 };
const U_F: Record<string, number> = { kHz: 1e3, Hz: 1, MHz: 1e6, GHz: 1e9, THz: 1e12, mHz: 1e-3, 'µHz': 1e-6 };
const U_SR: Record<string, number> = { 'V/µs': 1e6, 'V/ns': 1e9, 'V/s': 1 };
const isGate = (s: any) => s.type === 'gate';
const isOp = (s: any) => s.type === 'opamp';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Schmitt trigger',
    fields: [
      { kind: 'select', key: 'type', label: 'Type', options: [{ value: 'gate', label: 'Logic Schmitt inverter' }, { value: 'opamp', label: 'Op-amp Schmitt trigger' }], help: 'Logic gate: a 74HC14 / 74LVC1G14 inverter whose input thresholds come from its data sheet. Op-amp: an inverting Schmitt trigger whose thresholds are set by R₁/R₂ and the output saturation levels.' },
      {
        kind: 'select', key: 'part', label: 'Gate', visible: isGate,
        options: [{ value: 'HC14', label: GATES.HC14.label }, { value: 'LVC1G14', label: GATES.LVC1G14.label }, { value: 'custom', label: 'Custom thresholds' }],
        // a supply outside the new part's recommended range is moved to the nearest end of it
        apply: (v, s) => {
          const p = GATES[v as string];
          if (p) s.vcc = Math.min(p.vMax, Math.max(p.vMin, s.vcc));
        },
        help: 'Thresholds from the TI data sheets (SN74HC14 SCLS085L; SN74LVC1G14 SCES218AA), interpolated linearly between the V_CC rows. The 74LVC1G17 buffer has the same kind of input but does not invert, so it cannot oscillate on its own.',
      },
      { kind: 'number', key: 'vcc', symbol: 'V_CC', label: 'Supply voltage', unit: 'V', min: 0.5, max: 20, visible: isGate, help: 'The output swings 0 … V_CC (light load), and the thresholds move with V_CC.' },
      { kind: 'number', key: 'vtp', symbol: 'V_T₊', label: 'Positive-going threshold', unit: 'V', min: 0, max: 20, visible: (s) => isGate(s) && s.part === 'custom' },
      { kind: 'number', key: 'vtm', symbol: 'V_T₋', label: 'Negative-going threshold', unit: 'V', min: 0, max: 20, visible: (s) => isGate(s) && s.part === 'custom' },
      { kind: 'number', key: 'voh', symbol: 'V_OH', label: 'Output high (saturation)', unit: 'V', min: -100, max: 100, visible: isOp, help: 'Positive saturation level: the supply for a rail-to-rail op-amp at light load, about 1–2 V below it for older parts (LM358, TL072).' },
      { kind: 'number', key: 'vol', symbol: 'V_OL', label: 'Output low (saturation)', unit: 'V', min: -100, max: 100, visible: isOp },
      { kind: 'number', key: 'vref', symbol: 'V_ref', label: 'Divider reference', unit: 'V', min: -100, max: 100, visible: isOp, help: 'Where R₁ returns: 0 V with split supplies, mid-rail (e.g. V_CC/2) with a single supply.' },
      { kind: 'number', key: 'r1', symbol: 'R₁', label: 'R₁ (+ input to V_ref)', units: U_R, unitKey: 'r1Unit', min: 1, max: 1e9, visible: isOp },
      { kind: 'number', key: 'r2', symbol: 'R₂', label: 'R₂ (output to + input)', units: U_R, unitKey: 'r2Unit', min: 1, max: 1e9, visible: isOp, help: 'β = R₁/(R₁+R₂) sets the thresholds; R₁ = R₂ gives f = 1/(2RC·ln3) with symmetric supplies.' },
      { kind: 'number', key: 'sr', symbol: 'SR', label: 'Op-amp slew rate', units: U_SR, unitKey: 'srUnit', optional: true, zeroHint: 'not checked', min: 1, max: 1e12, visible: isOp, help: 'Optional: the output takes (V_OH − V_OL)/SR to swing, which lengthens each half-period.' },
    ],
  },
  {
    kind: 'section',
    title: 'Timing',
    note: 'Click ◎ to choose the unknown. The duty cycle is set by the thresholds, not by R or C.',
    fields: [
      { kind: 'number', key: 'r', symbol: 'R', label: 'Timing resistor', units: U_R, unitKey: 'rUnit', solvable: true, min: 1, max: 1e9, onUnsolve: (_s, r) => (r.solveFor = 'f'), help: 'From the output back to the input.' },
      { kind: 'number', key: 'c', symbol: 'C', label: 'Timing capacitor', units: U_C, unitKey: 'cUnit', solvable: true, min: 1e-15, max: 1, onUnsolve: (_s, r) => (r.solveFor = 'f'), help: 'From the input to ground. Use C0G/NP0 or film for a stable frequency.' },
      // The analysis can reach any frequency (R and C at their minimum, thresholds almost equal), so the
      // range is wide open; the > 20 MHz warning says when the RC model stops meaning anything.
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_F, unitKey: 'fUnit', unitFamily: 'none', solvable: true, min: 1e-30, max: 1e30, onUnsolve: (_s, r) => (r.solveFor = 'r'), help: 'Output frequency; the target when solving for R or C.' },
      { kind: 'select', key: 'eseriesR', label: 'Resistor series', options: ['E12', 'E24', 'E96'] },
      { kind: 'select', key: 'eseriesC', label: 'Capacitor series', options: ['E6', 'E12', 'E24'] },
    ],
  },
];

const fV = (v: number, d = 4) => si(v, 'V', d);
const fT = (t: number) => si(t, 's', 4);
const fHz = (f: number, d = 4) => si(f, 'Hz', d);
const pct = (d: number) => `${(d * 100).toFixed(1)} %`;

function num(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: SchmittState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

interface Setup {
  osc: OscIn;
  part: GatePart | null;
  gt: GateThresholds | null;
}

function setup(s: SchmittState): Setup {
  if (s.type === 'gate') {
    const vcc = num('V_CC', s.vcc);
    if (!(vcc > 0)) throw new Error('V_CC must be > 0.');
    const part = GATES[s.part] ?? null;
    if (part) {
      if (vcc < part.vMin - 1e-9 || vcc > part.vMax + 1e-9) throw new Error(`V_CC = ${fV(vcc)} is outside the ${part.label.split(' ')[0]} recommended range ${part.vMin}–${part.vMax} V, where its data sheet gives no thresholds.`);
      const gt = gateThresholds(part, vcc);
      return { osc: { vth: gt.vtp, vtl: gt.vtm, voh: vcc, vol: 0 }, part, gt };
    }
    const vtp = num('V_T₊', s.vtp);
    const vtm = num('V_T₋', s.vtm);
    if (!(vtm > 0 && vtm < vtp && vtp < vcc)) throw new Error('Custom thresholds need 0 < V_T₋ < V_T₊ < V_CC.');
    return { osc: { vth: vtp, vtl: vtm, voh: vcc, vol: 0 }, part: null, gt: null };
  }
  const voh = num('V_OH', s.voh);
  const vol = num('V_OL', s.vol);
  const vref = num('V_ref', s.vref);
  const r1 = num('R₁', s.r1);
  const r2 = num('R₂', s.r2);
  if (!(voh > vol)) throw new Error('V_OH must be above V_OL.');
  if (!(r1 > 0 && r2 > 0)) throw new Error('R₁ and R₂ must be > 0.');
  if (!(vref > vol && vref < voh)) throw new Error(`V_ref = ${fV(vref)} must lie between V_OL and V_OH, or both thresholds sit on one side and the capacitor can never reach one of them.`);
  const t = opampThresholds(voh, vol, r1, r2, vref);
  return { osc: { vth: t.vth, vtl: t.vtl, voh, vol }, part: null, gt: null };
}

// Mode-switch harness: its remaining "error-after-edit" flags are typed numbers that make the answer impossible
// (V_CC outside the gate's data-sheet range, V_OH ≤ V_OL, V_ref outside the swing, or a target whose R / C would
// fall outside the inputs' range); those are meant to be red. Setting switches (gate, type) never produce one.
function run(st: SchmittState): CalcReport {
  const s: SchmittState = { ...st };
  const { osc, part, gt } = setup(s);
  if (!validOsc(osc)) throw new Error('The thresholds must lie strictly between the output levels.');
  const k = oscFactors(osc);
  if (s.solveFor === 'r') {
    num('C', s.c);
    num('f', s.f);
    if (!(s.c > 0 && s.f > 0)) throw new Error('Enter C > 0 and f > 0.');
    s.r = 1 / (s.f * s.c * k.k);
  } else if (s.solveFor === 'c') {
    num('R', s.r);
    num('f', s.f);
    if (!(s.r > 0 && s.f > 0)) throw new Error('Enter R > 0 and f > 0.');
    s.c = 1 / (s.f * s.r * k.k);
  } else {
    num('R', s.r);
    num('C', s.c);
    if (!(s.r > 0 && s.c > 0)) throw new Error('R and C must be > 0.');
  }
  const o = oscillate(osc, s.r, s.c);
  s.f = o.f;

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const res: ResultItem[] = [];
  const solved = s.solveFor;
  if (solved === 'r') res.push(item('r', 'Timing resistor', s.r, 'Ω', si(s.r, 'Ω', 4), { symbol: 'R', solved: true, primary: true, note: `for ${fHz(st.f)} with C = ${si(s.c, 'F', 3)}` }));
  if (solved === 'c') res.push(item('c', 'Timing capacitor', s.c, 'F', si(s.c, 'F', 4), { symbol: 'C', solved: true, primary: true, note: `for ${fHz(st.f)} with R = ${si(s.r, 'Ω', 3)}` }));
  res.push(item('f', 'Frequency', o.f, 'Hz', fHz(o.f), { symbol: 'f', solved: solved === 'f', primary: true, note: `period ${fT(o.period)} = ${k.k.toFixed(4)}·RC` }));
  res.push(item('duty', 'Duty cycle (output high)', o.duty * 100, '%', pct(o.duty), { symbol: 'D', primary: true, note: `t_H ${fT(o.tH)} / t_L ${fT(o.tL)}` }));
  let fMin = NaN;
  let fMax = NaN;
  if (gt && part) {
    const kr = kRange(gt, s.vcc);
    fMin = 1 / (kr.kMax * s.r * s.c);
    fMax = 1 / (kr.kMin * s.r * s.c);
    res.push(item('fRange', 'Over the data-sheet threshold spread', fMin, 'Hz', `${fHz(fMin, 3)} … ${fHz(fMax, 3)}`, { primary: true, note: `${((fMin / o.f - 1) * 100).toFixed(0)} % … +${((fMax / o.f - 1) * 100).toFixed(0)} % around nominal` }));
  }
  const gTh = 'Thresholds';
  const thNote = gt ? (gt.typical ? 'data-sheet typical' : 'middle of the min…max window') : s.type === 'opamp' ? 'V_ref + (V_out − V_ref)·β' : 'custom';
  res.push(
    item('vth', s.type === 'gate' ? 'Positive-going threshold' : 'Upper threshold', osc.vth, 'V', fV(osc.vth), { symbol: s.type === 'gate' ? 'V_T₊' : 'V_TH', group: gTh, note: thNote }),
    item('vtl', s.type === 'gate' ? 'Negative-going threshold' : 'Lower threshold', osc.vtl, 'V', fV(osc.vtl), { symbol: s.type === 'gate' ? 'V_T₋' : 'V_TL', group: gTh }),
    item('hyst', 'Hysteresis', osc.vth - osc.vtl, 'V', fV(osc.vth - osc.vtl, 3), { symbol: 'ΔV_T', group: gTh }),
  );
  if (gt) {
    res.push(item('vtpRange', 'V_T₊ min … max', gt.tpMin, 'V', `${fV(gt.tpMin, 3)} … ${fV(gt.tpMax, 3)}`, { group: gTh, note: part!.doc }));
    res.push(item('vtmRange', 'V_T₋ min … max', gt.tmMin, 'V', `${fV(gt.tmMin, 3)} … ${fV(gt.tmMax, 3)}`, { group: gTh }));
  }
  if (s.type === 'opamp') {
    const beta = s.r1 / (s.r1 + s.r2);
    res.push(item('beta', 'Feedback fraction', beta, '', beta.toPrecision(4), { symbol: 'β', group: gTh, note: 'R₁/(R₁+R₂)' }));
  }
  const gT = 'Timing';
  res.push(
    item('period', 'Period', o.period, 's', fT(o.period), { symbol: 'T', group: gT }),
    item('tH', 'Output high time', o.tH, 's', fT(o.tH), { symbol: 't_H', group: gT, note: `C charges ${fV(osc.vtl, 3)} → ${fV(osc.vth, 3)}` }),
    item('tL', 'Output low time', o.tL, 's', fT(o.tL), { symbol: 't_L', group: gT, note: `C discharges ${fV(osc.vth, 3)} → ${fV(osc.vtl, 3)}` }),
    item('rc', 'Time constant', s.r * s.c, 's', fT(s.r * s.c), { symbol: 'τ = RC', group: gT }),
  );
  if (Number.isFinite(k.kFirst)) res.push(item('tFirst', 'First high period after power-up', k.kFirst * s.r * s.c, 's', fT(k.kFirst * s.r * s.c), { symbol: 't_H1', group: gT, note: 'C starts from 0 V' }));
  // ── standard values: the solved part bracketed in its series; analysis: both rounded
  const ge = `Standard parts (${s.eseriesR} R, ${s.eseriesC} C)`;
  const fWith = (r: number, c: number) => oscillate(osc, r, c).f;
  const pctErr = (f: number) => `${f >= o.f ? '+' : '−'}${Math.abs((f / o.f - 1) * 100).toFixed(2)} %`;
  if (solved === 'c') {
    for (const c of uniq(bracketE(s.eseriesC, s.c))) res.push(item(`cStd${c}`, `C = ${si(c, 'F', 3)}`, fWith(s.r, c), 'Hz', `${fHz(fWith(s.r, c))} (${pctErr(fWith(s.r, c))})`, { group: ge }));
  } else if (solved === 'r') {
    for (const r of uniq(bracketE(s.eseriesR, s.r))) res.push(item(`rStd${r}`, `R = ${si(r, 'Ω', 3)}`, fWith(r, s.c), 'Hz', `${fHz(fWith(r, s.c))} (${pctErr(fWith(r, s.c))})`, { group: ge }));
  } else {
    const rE = nearest(s.eseriesR, s.r);
    const cE = nearest(s.eseriesC, s.c);
    res.push(item('stdPair', `${si(rE, 'Ω', 3)} with ${si(cE, 'F', 3)}`, fWith(rE, cE), 'Hz', `${fHz(fWith(rE, cE))} (${pctErr(fWith(rE, cE))})`, { group: ge, note: 'each rounded to the nearest value' }));
  }
  // ── drive and limits
  const iR = Math.max(osc.voh - osc.vtl, osc.vth - osc.vol) / s.r;
  const gD = 'Drive';
  if (s.type === 'opamp') {
    const iDiv = Math.max(osc.voh - s.vref, s.vref - osc.vol) / (s.r1 + s.r2);
    res.push(item('iPeak', 'Peak output current', iR + iDiv, 'A', si(iR + iDiv, 'A', 3), { symbol: 'I_out,pk', group: gD, note: 'into R (at a switching edge) plus R₁ + R₂' }));
    if (iR + iDiv > 10e-3) warnings.push(`The op-amp output supplies up to ${si(iR + iDiv, 'A', 3)}: beyond about 10 mA most general-purpose op-amps leave saturation levels well inside the rails and approach current limit. Raise R and R₁ + R₂.`);
    if (s.sr != null && s.sr > 0) {
      const tSlew = (osc.voh - osc.vol) / s.sr;
      res.push(item('tSlew', 'Output swing time', tSlew, 's', fT(tSlew), { symbol: '(V_OH−V_OL)/SR', group: gD }));
      if (tSlew > 0.02 * Math.min(o.tH, o.tL)) warnings.push(`The output needs ${fT(tSlew)} to swing (slew rate), ${((tSlew / Math.min(o.tH, o.tL)) * 100).toFixed(0)} % of the shorter half-period: the real frequency is lower and the edges are ramps. Use a faster op-amp or comparator, or a lower frequency.`);
    } else notes.push('Slew rate not checked: enter SR to see when the output edges start to stretch the period.');
    notes.push('Op-amp saturation levels depend on supply, load and temperature; use the data-sheet output swing at your load. An op-amp used as a comparator also recovers slowly from saturation, so for fast oscillators a comparator with push-pull output is better.');
  } else {
    res.push(item('iPeak', 'Peak output current', iR, 'A', si(iR, 'A', 3), { symbol: 'I_out,pk', group: gD, note: 'into R at a switching edge' }));
    if (part) {
      const io = ioTestAt(part, s.vcc);
      if (iR > io) warnings.push(`The gate drives up to ${si(iR, 'A', 3)} into R: above the ${si(io, 'A', 3)} at which the ${part.label.split(' ')[0]} data sheet specifies V_OH / V_OL, so the output levels sag and the frequency shifts. Use R ≥ ${si(Math.max(osc.voh - osc.vtl, osc.vth) / io, 'Ω', 3)}.`);
      const tpd = tpdAt(part, s.vcc);
      if (2 * tpd > 0.01 * o.period) warnings.push(`Propagation delay (≈ ${si(tpd, 's', 3)} each edge) is ${((2 * tpd / o.period) * 100).toFixed(1)} % of the period: the capacitor overshoots both thresholds, so the real frequency is lower than calculated. Keep the period above about 200 × t_pd, or trim on the bench.`);
      if (s.c < 30 * part.ci) warnings.push(`C = ${si(s.c, 'F', 3)} is not much larger than the gate’s input capacitance (≈ ${si(part.ci, 'F', 3)}) plus board strays: the frequency will come out lower. Prefer C ≥ 100 pF.`);
      // input leakage I_I flows in R: the charge targets move by ±I_I·R (C·dv/dt = (V_out − v)/R − I_I)
      const iLeak = s.part === 'HC14' ? 1e-6 : 5e-6;
      const dV = iLeak * s.r;
      const fLeak = [dV, -dV].map((x) => {
        const sh = { ...osc, voh: osc.voh - x, vol: osc.vol - x };
        return validOsc(sh) ? oscillate(sh, s.r, s.c).f : NaN;
      });
      const leakErr = Math.max(...fLeak.map((x) => (Number.isFinite(x) ? Math.abs(x / o.f - 1) : Infinity)));
      if (leakErr > 0.05) warnings.push(`R = ${si(s.r, 'Ω', 3)}: the data-sheet input leakage (up to ${si(iLeak, 'A', 3)} over temperature) flowing in R can move the frequency by ${Number.isFinite(leakErr) ? `up to ${(leakErr * 100).toFixed(0)} %` : 'enough to stop the oscillation'}. Use a smaller R and a larger C.`);
      if (!part.rows.some((r) => Math.abs(r.vcc - s.vcc) < 1e-9)) notes.push(`Thresholds interpolated linearly between the data-sheet rows at ${part.rows.map((r) => `${r.vcc} V`).join(', ')}.`);
      if (!gt!.typical) notes.push('The 74LVC1G14 data sheet gives only min and max thresholds; the nominal frequency uses the middle of each window, so read the spread as the real answer.');
    }
    notes.push('The output is taken as an ideal 0 … V_CC square wave (light load). Thresholds also drift with temperature and from part to part, so a Schmitt RC oscillator is good to roughly ±20–40 %; use a crystal or a calibrated timer when the frequency matters.');
  }
  if (s.c > 10e-6) notes.push(`C = ${si(s.c, 'F', 3)} is probably an electrolytic: its tolerance (±20 %) and leakage dominate the timing.`);
  if (o.f > 20e6) warnings.push(`f = ${fHz(o.f, 3)}: at this frequency delays and parasitics dominate, so the RC formula no longer applies.`);
  report.results = res;
  report.summary = `${s.type === 'gate' ? (part ? part.label.split(' ')[0] : 'Custom Schmitt gate') + ` at ${fV(s.vcc, 3)}` : 'Op-amp Schmitt trigger'} · f = ${fHz(o.f)} · D = ${pct(o.duty)} · thresholds ${fV(osc.vth, 3)} / ${fV(osc.vtl, 3)}`;
  report.details = { ...o, ...osc, k: k.k, kH: k.kH, kL: k.kL, kFirst: k.kFirst, fMin, fMax, thresholds: gt, state: s };
  report.graphs = [waveGraph(s, osc, o, k.kFirst), fVsR(s, osc, gt, o.f)];
  if (gt && part) report.graphs.push(thresholdGraph(part, s.vcc));
  return report;
}

const uniq = (a: number[]) => [...new Set(a)];
function nearest(series: string, x: number): number {
  const [a, b] = bracketE(series, x);
  return Math.abs(Math.log(a / x)) <= Math.abs(Math.log(b / x)) ? a : b;
}

function waveGraph(s: SchmittState, osc: OscIn, o: ReturnType<typeof oscillate>, kFirst: number): GraphSpec {
  const tau = s.r * s.c;
  const t: number[] = [];
  const vc: number[] = [];
  const out: number[] = [];
  const seg = (t0: number, dur: number, v0: number, target: number, level: number, n = 50) => {
    for (let i = 0; i <= n; i++) {
      const u = (dur * i) / n;
      t.push(t0 + u);
      vc.push(charge(u, tau, v0, target));
      out.push(level);
    }
  };
  let t0 = 0;
  if (Number.isFinite(kFirst)) {
    seg(0, kFirst * tau, 0, osc.voh, osc.voh);
    t0 = kFirst * tau;
  } else {
    seg(0, o.tH, osc.vtl, osc.voh, osc.voh);
    t0 = o.tH;
  }
  for (let k = 0; k < 3; k++) {
    seg(t0, o.tL, osc.vth, osc.vol, osc.vol);
    t0 += o.tL;
    seg(t0, o.tH, osc.vtl, osc.voh, osc.voh);
    t0 += o.tH;
  }
  return {
    id: 'waveform',
    title: 'Waveforms',
    subtitle: 'From power-up: C starts at 0 V, so the first high period is longer',
    legend: 'below',
    x: { label: 'Time', unit: 's' },
    y: [{ id: 'v', label: 'Voltage', unit: 'V', includeZero: true }],
    series: [
      { label: 'Output', x: t, y: out, axis: 'v', color: '#c47b17', width: 1.6 },
      { label: 'Capacitor (input)', x: t, y: vc, axis: 'v', color: '#1f4e5f', width: 2.2 },
    ],
    hlines: [
      { value: osc.vth, label: `${s.type === 'gate' ? 'V_T₊' : 'V_TH'} ${fV(osc.vth, 3)}`, axis: 'v', color: '#8b1e1e', dash: [4, 3] },
      { value: osc.vtl, label: `${s.type === 'gate' ? 'V_T₋' : 'V_TL'} ${fV(osc.vtl, 3)}`, axis: 'v', color: '#8b1e1e', dash: [4, 3] },
    ],
  };
}

function fVsR(s: SchmittState, osc: OscIn, gt: GateThresholds | null, f: number): GraphSpec {
  const n = 121;
  const rs = Array.from({ length: n }, (_, i) => s.r * 100 ** (2 * (i / (n - 1)) - 1)).filter((r) => r >= 1 && r <= 1e9);
  const k = oscFactors(osc).k;
  const series: GraphSeries[] = [{ label: 'Nominal', x: rs, y: rs.map((r) => 1 / (k * r * s.c)), axis: 'f', width: 2.2 }];
  if (gt) {
    const kr = kRange(gt, s.vcc);
    series.push(
      { label: 'Fastest part', x: rs, y: rs.map((r) => 1 / (kr.kMin * r * s.c)), axis: 'f', color: '#c47b17', width: 1.2, dash: [5, 3] },
      { label: 'Slowest part', x: rs, y: rs.map((r) => 1 / (kr.kMax * r * s.c)), axis: 'f', color: '#c47b17', width: 1.2, dash: [5, 3] },
    );
  }
  return {
    id: 'f-vs-r',
    title: 'Frequency vs R',
    subtitle: `C = ${si(s.c, 'F', 3)}${gt ? '; dashed: data-sheet threshold extremes' : ''}`,
    x: { label: 'Timing resistor R', unit: 'Ω', log: true },
    y: [{ id: 'f', label: 'Frequency', unit: 'Hz', log: true }],
    series,
    markers: [{ x: s.r, y: f, axis: 'f', label: fHz(f, 3) }],
  };
}

function thresholdGraph(part: GatePart, vcc: number): GraphSpec {
  const vs = part.rows.map((r) => r.vcc);
  const typ = part.rows.every((r) => r.tpTyp != null);
  const series: GraphSeries[] = [
    { label: typ ? 'V_T₊ typ' : 'V_T₊ mid', x: vs, y: part.rows.map((r) => (typ ? r.tpTyp! : (r.tpMin + r.tpMax) / 2)), axis: 'v', color: '#1f4e5f', width: 2 },
    { label: 'V_T₊ max', x: vs, y: part.rows.map((r) => r.tpMax), axis: 'v', color: '#1f4e5f', width: 1, dash: [5, 3] },
    { label: 'V_T₊ min', x: vs, y: part.rows.map((r) => r.tpMin), axis: 'v', color: '#1f4e5f', width: 1, dash: [2, 3] },
    { label: typ ? 'V_T₋ typ' : 'V_T₋ mid', x: vs, y: part.rows.map((r) => (typ ? r.tmTyp! : (r.tmMin + r.tmMax) / 2)), axis: 'v', color: '#c47b17', width: 2 },
    { label: 'V_T₋ max', x: vs, y: part.rows.map((r) => r.tmMax), axis: 'v', color: '#c47b17', width: 1, dash: [5, 3] },
    { label: 'V_T₋ min', x: vs, y: part.rows.map((r) => r.tmMin), axis: 'v', color: '#c47b17', width: 1, dash: [2, 3] },
    { label: 'V_CC', x: [vs[0], vs[vs.length - 1]], y: [vs[0], vs[vs.length - 1]], axis: 'v', color: '#9a8f7a', width: 1, dash: [2, 3] },
  ];
  return {
    id: 'thresholds',
    title: 'Thresholds vs V_CC',
    subtitle: `${part.doc}; lines join the data-sheet rows`,
    x: { label: 'Supply voltage V_CC', unit: 'V' },
    y: [{ id: 'v', label: 'Threshold', unit: 'V', includeZero: true }],
    series,
    vlines: [{ value: vcc, label: `V_CC = ${fV(vcc, 3)}`, color: '#2f7d4f' }],
  };
}

export const def: CalcDef<SchmittState> = {
  id: ID,
  version: '0.1.0',
  method:
    'RC charge between the Schmitt thresholds: t_H = RC·ln[(V_OH − V_TL)/(V_OH − V_TH)], t_L = RC·ln[(V_TH − V_OL)/(V_TL − V_OL)] (Horowitz & Hill AoE 3e; Fairchild AN-118; for the op-amp astable Sedra & Smith 7e ch. 18, T = 2RC·ln[(1+β)/(1−β)]); gate thresholds from TI SN74HC14 (SCLS085L) and SN74LVC1G14 (SCES218AA) data sheets, interpolated in V_CC, with the frequency spread over their min/max window; R and C solves are exact inverses.',
  fields,
  defaults,
  solve: {
    default: 'f',
    analysis: 'f',
    options: [
      { key: 'f', label: 'Frequency and duty from R and C (analysis)' },
      { key: 'r', label: 'R for a target frequency' },
      { key: 'c', label: 'C for a target frequency' },
    ],
  },
  compute,
  examples: [
    { id: 'hc14-5v', label: '74HC14 at 5 V, 10 kΩ, 10 nF (≈ 12 kHz)', state: defaults() },
    { id: 'hc14-1khz', label: '74HC14 at 4.5 V: C for 1 kHz with R = 100 kΩ', state: { ...defaults(), vcc: 4.5, solveFor: 'c', r: 100e3, f: 1e3, fUnit: 'kHz' } },
    { id: 'lvc-3v3', label: '74LVC1G14 at 3.3 V: R for 32.768 kHz with 1 nF', state: { ...defaults(), part: 'LVC1G14', vcc: 3.3, solveFor: 'r', c: 1e-9, cUnit: 'nF', f: 32.768e3, fUnit: 'kHz', eseriesR: 'E96' } },
    { id: 'opamp-pm12', label: 'Op-amp astable, ±12 V supply (±10.5 V swing), R₁ = R₂: f = 1/(2RC·ln3)', state: { ...defaults(), type: 'opamp', voh: 10.5, vol: -10.5, vref: 0, r1: 10e3, r2: 10e3, r: 47e3, c: 10e-9, sr: 0.5e6, srUnit: 'V/µs', solveFor: 'f' } },
    { id: 'opamp-single', label: 'Rail-to-rail op-amp on 5 V, mid-rail reference, 1 Hz blinker (solve C)', state: { ...defaults(), type: 'opamp', voh: 5, vol: 0, vref: 2.5, r1: 100e3, r2: 100e3, r: 1e6, rUnit: 'MΩ', solveFor: 'c', f: 1, fUnit: 'Hz', sr: null } },
    { id: 'hc14-fast', label: 'Edge case: 74HC14, 680 Ω and 47 pF (drive and delay warnings)', state: { ...defaults(), solveFor: 'f', r: 680, rUnit: 'Ω', c: 47e-12, cUnit: 'pF' } },
  ],
};
