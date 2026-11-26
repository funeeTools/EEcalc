/** 555 Timer — calculator definition (astable / monostable, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSeries, GraphSpec, ResultItem } from '@/core/calc/types';
import { nearestE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { TIME_UNITS, si } from '@/core/units';
import { U_FREQ, U_OHM, withDefault } from '@/core/unitsets';
import { type AstableOut, astable, astableFactors, charge, logspace, monoFactor, thresholds } from './model';

export type Mode = 'astable' | 'monostable';
export type TimerSolve = 'f' | 'ra' | 'c' | 'tw';
/** TLC555 = C grade (0–70 °C); TLC555I / TLC555M are the I and M/Q temperature grades. */
export type Device = 'NE555' | 'TLC555' | 'TLC555I' | 'TLC555M';

export interface TimerState {
  mode: Mode;
  /** f: frequency & duty (astable analysis) · tw: pulse width (monostable analysis) · ra: resistor(s) · c: capacitor */
  solveFor: TimerSolve;
  device: Device;
  vcc: number;
  ra: number;
  raUnit: string;
  rb: number;
  rbUnit: string;
  c: number;
  cUnit: string;
  f: number;
  fUnit: string;
  /** Output-high duty cycle in % */
  duty: number;
  tw: number;
  twUnit: string;
  diode: boolean;
  vf: number;
  /** CONT pin voltage; null = internal divider (⅔·V_CC) */
  vcv: number | null;
  eseriesR: 'E12' | 'E24' | 'E96';
  eseriesC: 'E12' | 'E24';
}

export const defaults = (): TimerState => ({
  mode: 'astable',
  solveFor: 'f',
  device: 'NE555',
  vcc: 5,
  ra: 1e3,
  raUnit: 'kΩ',
  rb: 6.8e3,
  rbUnit: 'kΩ',
  c: 100e-9,
  cUnit: 'nF',
  f: 1e3,
  fUnit: 'kHz',
  duty: 53,
  tw: 1e-3,
  twUnit: 'ms',
  diode: false,
  vf: 0.6,
  vcv: null,
  eseriesR: 'E24',
  eseriesC: 'E12',
});

/** Supply range (recommended operating conditions) of each device, TI data sheets SLFS022 / SLFS043. */
const DEVICES: Record<Device, { vMin: number; vMax: number; label: string }> = {
  NE555: { vMin: 4.5, vMax: 16, label: 'NE555 (bipolar)' },
  TLC555: { vMin: 2, vMax: 15, label: 'TLC555C (CMOS, 2–15 V)' },
  TLC555I: { vMin: 3, vMax: 15, label: 'TLC555I (CMOS, 3–15 V)' },
  TLC555M: { vMin: 5, vMax: 15, label: 'TLC555M/Q (CMOS, 5–15 V)' },
};

const U_TIME = withDefault(TIME_UNITS, 'ms');
/** Slow oscillators reach mHz and µHz (f down to 1 µHz), so the list goes below Hz. */
const U_F555: Record<string, number> = { ...U_FREQ, mHz: 1e-3, 'µHz': 1e-6 };
/** pF … mF: C runs from 1 pF to 1 F (fF is below the field minimum). */
const U_C555: Record<string, number> = { pF: 1e-12, nF: 1e-9, 'µF': 1e-6, mF: 1e-3 };
/** Lowest duty reachable without the R_B diode: t_H/(t_H + t_L) as R_A → 0 (50 % with the internal divider). */
const dutyMinStd = (s: any): number => {
  const k = astableFactors({ vcc: s.vcc, vcv: s.vcv, diode: false, vf: 0 });
  return k.kH / (k.kH + k.kL);
};
const isAstable = (s: any) => s.mode === 'astable';
const analysisKey = (s: any): TimerSolve => (isAstable(s) ? 'f' : 'tw');

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Circuit',
    fields: [
      {
        kind: 'select', key: 'mode', label: 'Mode',
        options: [
          { value: 'astable', label: 'Astable (oscillator)' },
          { value: 'monostable', label: 'Monostable (one-shot)' },
        ],
        // The targets of the other mode (f and duty ↔ t_w) do not carry over, so a mode switch
        // analyses the parts already entered instead of solving for a stale target.
        apply: (_v, s) => {
          s.solveFor = analysisKey(s);
        },
      },
      { kind: 'select', key: 'device', label: 'Device', options: Object.entries(DEVICES).map(([value, d]) => ({ value, label: d.label })), help: 'Timing equations are the same; the device sets the supply range (the TLC555 range depends on its temperature grade) and the limits checked below.' },
      { kind: 'number', key: 'vcc', symbol: 'V_CC', label: 'Supply voltage', unit: 'V', min: 0.5, max: 30, help: 'Sets the thresholds (⅔ and ⅓ V_CC). With CONT open and no R_B diode the timing does not depend on V_CC.' },
    ],
  },
  {
    kind: 'section',
    title: 'Timing parts',
    note: 'Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'ra', symbol: 'R_A', label: 'Resistor R_A', units: U_OHM, unitKey: 'raUnit', solvable: true, min: 1, max: 1e9, onUnsolve: (_s, root) => (root.solveFor = analysisKey(root)), help: 'Between V_CC and DISCH (pin 7). In monostable mode, the timing resistor.' },
      { kind: 'number', key: 'rb', symbol: 'R_B', label: 'Resistor R_B', units: U_OHM, unitKey: 'rbUnit', solvable: true, min: 1, max: 1e9, visible: isAstable, solvedWhen: (_s, root) => root.solveFor === 'ra', onSolve: (_s, root) => (root.solveFor = 'ra'), onUnsolve: (_s, root) => (root.solveFor = 'f'), help: 'Between DISCH (pin 7) and THRES/TRIG (pins 6, 2). C discharges through it.' },
      { kind: 'number', key: 'c', symbol: 'C', label: 'Timing capacitor', units: U_C555, unitKey: 'cUnit', solvable: true, min: 1e-12, max: 1, onUnsolve: (_s, root) => (root.solveFor = analysisKey(root)), help: 'Use a stable, low-leakage type (C0G, film) for accurate timing; electrolytics leak and drift.' },
    ],
  },
  {
    kind: 'section',
    title: 'Timing',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_F555, unitKey: 'fUnit', unitFamily: 'none', solvable: true, min: 1e-6, max: 1e8, visible: isAstable, onUnsolve: (_s, root) => (root.solveFor = 'ra'), help: 'Output frequency. Target when solving for R or C.' },
      { kind: 'number', key: 'duty', symbol: 'D', label: 'Duty cycle (high)', suffix: '%', solvable: true, min: 0, max: 100, visible: isAstable, solvedWhen: (_s, root) => root.solveFor === 'f' || root.solveFor === 'c', onSolve: (_s, root) => (root.solveFor = 'c'), onUnsolve: (_s, root) => (root.solveFor = 'ra'), help: 'Fraction of the period the output is high. The standard circuit always gives > 50 %; enable the R_B diode for any duty.' },
      { kind: 'number', key: 'tw', symbol: 't_w', label: 'Pulse width', units: U_TIME, unitKey: 'twUnit', solvable: true, min: 1e-9, max: 1e6, visible: (s) => !isAstable(s), onUnsolve: (_s, root) => (root.solveFor = 'ra'), help: 'Output high time after a trigger.' },
    ],
  },
  {
    kind: 'section',
    title: 'Options',
    collapsed: true,
    fields: [
      // Switching the diode off: a resistor design for a duty the standard circuit cannot reach (≤ 50 %) goes
      // back to analysis of the parts already entered instead of showing a red error.
      {
        kind: 'toggle', key: 'diode', label: 'Diode across R_B', on: 'Yes', off: 'No',
        visible: isAstable,
        apply: (v, s) => {
          if (!v && s.solveFor === 'ra' && !(s.duty / 100 > dutyMinStd(s))) s.solveFor = 'f';
        },
        help: 'C then charges through R_A and the diode only, so t_H and t_L are set separately and the duty can be below 50 %.',
      },
      { kind: 'number', key: 'vf', symbol: 'V_F', label: 'Diode forward drop', unit: 'V', min: 0, max: 2, visible: (s) => isAstable(s) && s.diode, help: '≈ 0.6–0.7 V silicon, 0.3 V Schottky. Lowers the charge target to V_CC − V_F.' },
      { kind: 'number', key: 'vcv', symbol: 'V_CV', label: 'CONT pin voltage', unit: 'V', min: 0.1, max: 30, optional: true, zeroHint: '⅔·V_CC', help: 'Leave blank for the internal divider (⅔·V_CC). A voltage on CONT (pin 5) moves the thresholds to V_CV and V_CV/2.' },
      { kind: 'select', key: 'eseriesR', label: 'Resistor series', options: ['E12', 'E24', 'E96'] },
      { kind: 'select', key: 'eseriesC', label: 'Capacitor series', options: ['E12', 'E24'] },
    ],
  },
];

const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const fmtT = (t: number) => si(t, 's', 4);
const pct = (d: number) => `${(d * 100).toFixed(2)} %`;

/** Keep solveFor consistent with the mode (f ↔ tw). */
function syncMode(s: TimerState): void {
  if (s.mode === 'monostable' && s.solveFor === 'f') s.solveFor = 'tw';
  if (s.mode === 'astable' && s.solveFor === 'tw') s.solveFor = 'f';
}

export function compute(st: TimerState): CalcReport {
  const s: TimerState = { ...st };
  syncMode(s);
  for (const k of ['vcc', 'ra', 'rb', 'c', 'f', 'duty', 'tw', 'vf'] as const) if (!finite(s[k])) throw new Error(`${k} must be a finite number.`);
  if (!(s.vcc > 0)) throw new Error('Supply voltage must be > 0.');
  // Only typed numbers reach this (V_CV or V_CC); no setting switch changes either.
  if (s.vcv != null && !(s.vcv > 0 && s.vcv < s.vcc)) throw new Error(`CONT voltage must be between 0 and V_CC (${si(s.vcc, 'V')}).`);
  const dev = DEVICES[s.device] ?? DEVICES.NE555;
  const warnings: string[] = [];
  const notes: string[] = [];
  const { vu, vl } = thresholds(s.vcc, s.vcv);
  if (s.vcc < dev.vMin || s.vcc > dev.vMax) warnings.push(`V_CC = ${si(s.vcc, 'V')} is outside the ${s.device} recommended supply range ${dev.vMin}–${dev.vMax} V.${s.device === 'NE555' && s.vcc < dev.vMin ? ' For low-voltage operation use a CMOS part (TLC555C, 2–15 V).' : ''}`);
  if (s.vcv != null) {
    if (s.device !== 'NE555' && s.vcv < 1) warnings.push(`V_CV = ${si(s.vcv, 'V')} is below the 1 V minimum TI recommends for the TLC555 CONT input.`);
    if (s.vcv < 0.1 * s.vcc || s.vcv > 0.8 * s.vcc) warnings.push(`V_CV = ${si(s.vcv, 'V')} is ${((s.vcv / s.vcc) * 100).toFixed(0)} % of V_CC: outside about 10–80 % the comparators work near their input limits and the timing becomes very sensitive to V_CV and V_CC. Keep CONT between roughly 0.1 and 0.8·V_CC.`);
  }
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const report: CalcReport = { calc: 'general/555-timer', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  if (s.mode === 'astable') {
    if (s.diode && !(s.vf >= 0 && s.vf < s.vcc)) throw new Error('Diode drop must be ≥ 0 and below V_CC.');
    const k = astableFactors(s);
    if (!Number.isFinite(k.kH)) throw new Error(`The capacitor charges towards ${si(k.target, 'V')}, which never reaches the upper threshold ${si(vu, 'V')}. Lower V_CV or the diode drop, or raise V_CC.`);
    // ── solve (the model is linear in C and in each R, so the inverses are exact)
    if (s.solveFor === 'ra') {
      if (!(s.c > 0) || !(s.f > 0) || !(s.duty > 0 && s.duty < 100)) throw new Error('Enter C > 0, f > 0 and 0 < D < 100 %.');
      const T = 1 / s.f;
      const tH = (s.duty / 100) * T;
      const tL = T - tH;
      s.rb = tL / (k.kL * s.c);
      const rCh = tH / (k.kH * s.c);
      s.ra = s.diode ? rCh : rCh - s.rb;
      if (!(s.ra > 0)) {
        const dMin = k.kH / (k.kH + k.kL);
        throw new Error(`D = ${s.duty} % needs R_A ≤ 0: in the standard astable the output-high time includes the R_B charge, so D > ${(dMin * 100).toFixed(1)} %. Enable “Diode across R_B” (Options) for any duty, or use the inverted output (D → ${(100 - s.duty).toFixed(1)} %).`);
      }
    } else {
      if (!(s.ra > 0) || !(s.rb > 0)) throw new Error('R_A and R_B must be > 0.');
      if (s.solveFor === 'c') {
        if (!(s.f > 0)) throw new Error('Enter a target frequency > 0.');
        s.c = 1 / (s.f * ((s.diode ? s.ra : s.ra + s.rb) * k.kH + s.rb * k.kL));
      } else if (!(s.c > 0)) throw new Error('Capacitance must be > 0.');
    }
    const o = astable(s);
    s.f = o.f;
    s.duty = o.duty * 100;
    const solved = s.solveFor;
    const r: ResultItem[] = [];
    if (solved === 'ra') {
      r.push(item('ra', 'Resistor R_A', s.ra, 'Ω', si(s.ra, 'Ω', 4), { symbol: 'R_A', primary: true, solved: true }));
      r.push(item('rb', 'Resistor R_B', s.rb, 'Ω', si(s.rb, 'Ω', 4), { symbol: 'R_B', primary: true, solved: true }));
    }
    if (solved === 'c') r.push(item('c', 'Timing capacitor', s.c, 'F', si(s.c, 'F', 4), { symbol: 'C', primary: true, solved: true }));
    r.push(item('f', 'Frequency', o.f, 'Hz', si(o.f, 'Hz', 4), { symbol: 'f', primary: true, solved: solved === 'f', note: `period ${fmtT(o.period)}` }));
    r.push(item('duty', 'Duty cycle (high)', o.duty * 100, '%', pct(o.duty), { symbol: 'D', primary: true, solved: solved === 'f' || solved === 'c', note: `low ${pct(1 - o.duty)}` }));
    if (solved !== 'ra') r.push(item('tH', 'Output high time', o.tH, 's', fmtT(o.tH), { symbol: 't_H', primary: true, note: s.diode ? 'R_A·C·ln[(V_CC−V_F−V_L)/(V_CC−V_F−V_U)]' : `${o.kH.toFixed(4)}·(R_A + R_B)·C` }));
    const g = 'Timing';
    r.push(
      item('period', 'Period', o.period, 's', fmtT(o.period), { symbol: 'T', group: g }),
      item('tHigh', 'High time', o.tH, 's', fmtT(o.tH), { symbol: 't_H', group: g, note: 'C charges from V_L to V_U' }),
      item('tLow', 'Low time', o.tL, 's', fmtT(o.tL), { symbol: 't_L', group: g, note: `${o.kL.toFixed(4)}·R_B·C` }),
      item('tFirst', 'First high period after power-up', o.tFirst, 's', fmtT(o.tFirst), { symbol: 't_H1', group: g, note: 'C starts from 0 V, not V_L' }),
      item('vu', 'Upper threshold', vu, 'V', si(vu, 'V', 4), { symbol: 'V_U', group: 'Thresholds', note: s.vcv == null ? '⅔·V_CC' : 'V_CV' }),
      item('vl', 'Lower threshold', vl, 'V', si(vl, 'V', 4), { symbol: 'V_L', group: 'Thresholds', note: s.vcv == null ? '⅓·V_CC' : 'V_CV/2' }),
      item('iDis', 'Peak discharge-pin current', s.vcc / s.ra + vu / s.rb, 'A', si(s.vcc / s.ra + vu / s.rb, 'A', 3), { symbol: 'I_DIS', group: 'Thresholds', note: 'V_CC/R_A + V_U/R_B at the start of t_L (R_A current plus C discharging through R_B)' }),
    );
    // ── standard values
    const raE = nearestE(s.ra, s.eseriesR);
    const rbE = nearestE(s.rb, s.eseriesR);
    const cE = nearestE(s.c, s.eseriesC);
    const oE = astable({ ...s, ra: raE, rb: rbE, c: cE });
    const ge = `Nearest ${s.eseriesR} R / ${s.eseriesC} C`;
    r.push(
      item('raStd', 'R_A', raE, 'Ω', si(raE, 'Ω', 3), { group: ge }),
      item('rbStd', 'R_B', rbE, 'Ω', si(rbE, 'Ω', 3), { group: ge }),
      item('cStd', 'C', cE, 'F', si(cE, 'F', 3), { group: ge }),
      item('fStd', 'Frequency', oE.f, 'Hz', `${si(oE.f, 'Hz', 4)} (${(((oE.f - o.f) / o.f) * 100).toFixed(2)} %)`, { group: ge }),
      item('dutyStd', 'Duty cycle', oE.duty * 100, '%', pct(oE.duty), { group: ge }),
    );
    report.results = r;
    checkResistors(s, s.diode ? s.ra : s.ra + s.rb, vu, k.target, warnings);
    if (o.f > 100e3) warnings.push(`f = ${si(o.f, 'Hz', 3)}: the NE555 and TLC555 data sheets give the astable timing equations only below 100 kHz. Above that, comparator and flip-flop delays add to every half-cycle and the real frequency comes out lower${s.device === 'NE555' ? '' : ' (the TLC555’s maximum astable frequency is 1.2 MHz min, 2.1 MHz typ, under the data-sheet test conditions)'}. Trim on the bench.`);
    if (!s.diode && o.duty > 0.95) notes.push('D > 95 %: R_B is small compared with R_A, so the discharge transistor’s saturation voltage and on-resistance shorten t_L noticeably.');
    if (s.diode) notes.push(`Diode mode: t_H uses a charge target of V_CC − V_F = ${si(k.target, 'V')}; the diode drop varies with current and temperature, so the duty is less accurate than with the standard circuit.`);
    if (!s.diode && s.vcv == null) notes.push('With the internal divider the thresholds track V_CC, so the timing is independent of supply voltage (to first order).');
    else notes.push(`${s.diode ? 'The diode drop' : 'A fixed V_CV'} makes the timing depend on V_CC: recheck it at the supply extremes.`);
    notes.push('Neglected: discharge-transistor saturation, comparator delays and pin leakage currents. Expect a few % from the ideal values, more at high frequency.');
    report.summary = `Astable · ${si(o.f, 'Hz', 4)} · ${pct(o.duty)} high · t_H ${fmtT(o.tH)} / t_L ${fmtT(o.tL)}`;
    report.graphs = [astableWave(s, o), designChart(s, o.f)];
    report.details = { ...o, state: s };
  } else {
    const kM = monoFactor(s.vcc, s.vcv);
    if (!Number.isFinite(kM)) throw new Error('The upper threshold must be below V_CC.');
    if (s.solveFor === 'ra') {
      if (!(s.tw > 0) || !(s.c > 0)) throw new Error('Enter t_w > 0 and C > 0.');
      s.ra = s.tw / (kM * s.c);
    } else if (s.solveFor === 'c') {
      if (!(s.tw > 0) || !(s.ra > 0)) throw new Error('Enter t_w > 0 and R_A > 0.');
      s.c = s.tw / (kM * s.ra);
    } else {
      if (!(s.ra > 0) || !(s.c > 0)) throw new Error('R_A and C must be > 0.');
      s.tw = kM * s.ra * s.c;
    }
    const r: ResultItem[] = [];
    if (s.solveFor === 'ra') r.push(item('ra', 'Resistor R_A', s.ra, 'Ω', si(s.ra, 'Ω', 4), { symbol: 'R_A', primary: true, solved: true }));
    if (s.solveFor === 'c') r.push(item('c', 'Timing capacitor', s.c, 'F', si(s.c, 'F', 4), { symbol: 'C', primary: true, solved: true }));
    r.push(item('tw', 'Pulse width', s.tw, 's', fmtT(s.tw), { symbol: 't_w', primary: true, solved: s.solveFor === 'tw', note: `${kM.toFixed(4)}·R_A·C${s.vcv == null ? ' (ln 3 ≈ 1.1)' : ''}` }));
    r.push(item('rc', 'R_A·C', s.ra * s.c, 's', fmtT(s.ra * s.c), { symbol: 'τ', primary: true }));
    const raE = nearestE(s.ra, s.eseriesR);
    const cE = nearestE(s.c, s.eseriesC);
    const twE = kM * raE * cE;
    const ge = `Nearest ${s.eseriesR} R / ${s.eseriesC} C`;
    r.push(
      item('vu', 'Upper threshold', vu, 'V', si(vu, 'V', 4), { symbol: 'V_U', group: 'Thresholds', note: s.vcv == null ? '⅔·V_CC' : 'V_CV' }),
      item('vl', 'Trigger threshold', vl, 'V', si(vl, 'V', 4), { symbol: 'V_L', group: 'Thresholds', note: 'TRIG must go below this to fire' }),
      item('iDis', 'Discharge-pin current', s.vcc / s.ra, 'A', si(s.vcc / s.ra, 'A', 3), { symbol: 'I_DIS', group: 'Thresholds', note: 'V_CC/R_A while idle' }),
      item('raStd', 'R_A', raE, 'Ω', si(raE, 'Ω', 3), { group: ge }),
      item('cStd', 'C', cE, 'F', si(cE, 'F', 3), { group: ge }),
      item('twStd', 'Pulse width', twE, 's', `${fmtT(twE)} (${(((twE - s.tw) / s.tw) * 100).toFixed(2)} %)`, { group: ge }),
    );
    report.results = r;
    checkResistors(s, s.ra, vu, s.vcc, warnings);
    const twMin = s.device === 'NE555' ? 10e-6 : 1e-6;
    if (s.tw < twMin) warnings.push(`t_w = ${fmtT(s.tw)} is below the ${s.device === 'NE555' ? '10 µs minimum monostable pulse width the NE555 data sheet states' : '≈ 1 µs where TLC555 internal delays dominate'}: the real pulse will be longer than calculated. Use a faster one-shot (e.g. a 74HC123-class part) for short pulses.`);
    notes.push('The trigger pulse must end (TRIG back above V_L) before t_w expires, or the output stays high. AC-couple a long trigger through a small RC.', 'A trigger during the pulse is ignored (non-retriggerable); RESET low ends the pulse early.');
    report.summary = `Monostable · t_w = ${fmtT(s.tw)} · R_A = ${si(s.ra, 'Ω', 4)}, C = ${si(s.c, 'F', 4)}`;
    report.graphs = [monoWave(s, kM), designChart(s, 1 / s.tw)];
    report.details = { kM, vu, vl, state: s };
  }
  if (s.c < 1e-9) warnings.push(`C = ${si(s.c, 'F', 3)}: pin and board capacitance (several pF) and internal delays become a noticeable part of the timing. Prefer C ≥ 1 nF.`);
  if (s.c > 10e-6) notes.push(`C = ${si(s.c, 'F', 3)} is probably an electrolytic: its tolerance (±20 %) and leakage current dominate the timing error.`);
  return report;
}

/** Resistor limits: discharge current (R_A small) and the threshold-current limit on the total (R large). */
function checkResistors(s: TimerState, rTotal: number, vu: number, target: number, warnings: string[]): void {
  if (s.ra < 1e3) warnings.push(`R_A = ${si(s.ra, 'Ω', 3)}: the discharge transistor sinks V_CC/R_A = ${si(s.vcc / s.ra, 'A', 3)}${s.mode === 'astable' ? ' throughout t_L' : ' continuously while idle'}, which wastes power and raises its saturation voltage. Keep R_A ≥ 1 kΩ.`);
  if (s.device === 'NE555') {
    // NE555 data sheet, threshold-current footnote: R_A + R_B ≈ 3.4 MΩ max at 5 V, 10 MΩ at 15 V,
    // i.e. the charging current at the threshold, (V_target − V_U)/R, must stay above about 0.5 µA
    // (V_target = V_CC, or V_CC − V_F with the R_B diode).
    const rMax = (target - vu) / 0.5e-6;
    if (rTotal > rMax) warnings.push(`Charging resistance ${si(rTotal, 'Ω', 3)} exceeds ≈ ${si(rMax, 'Ω', 2)}: the NE555 threshold input current (up to 250 nA) would stall or shift the timing. Use a larger C, or a CMOS TLC555 (pA input currents).`);
  } else if (rTotal > 20e6) warnings.push(`Charging resistance ${si(rTotal, 'Ω', 3)}: capacitor and board leakage now matter more than the TLC555’s pA input currents. Prefer a larger C.`);
}

const C_CAP = '#1f4e5f';
const C_OUT = '#c47b17';

function astableWave(s: TimerState, o: AstableOut): GraphSpec {
  const t: number[] = [];
  const vc: number[] = [];
  const out: number[] = [];
  const tauH = o.rCharge * s.c;
  const tauL = s.rb * s.c;
  const seg = (t0: number, dur: number, f: (u: number) => number, level: number, n = 60) => {
    for (let i = 0; i <= n; i++) {
      const u = (dur * i) / n;
      t.push(t0 + u);
      vc.push(f(u));
      out.push(level);
    }
  };
  // Power-up: C charges from 0 V to V_U (output high), then cycles V_U → V_L → V_U.
  let t0 = 0;
  seg(t0, o.tFirst, (u) => charge(u, tauH, 0, o.target), s.vcc);
  t0 += o.tFirst;
  for (let k = 0; k < 3; k++) {
    seg(t0, o.tL, (u) => charge(u, tauL, o.vu, 0), 0);
    t0 += o.tL;
    seg(t0, o.tH, (u) => charge(u, tauH, o.vl, o.target), s.vcc);
    t0 += o.tH;
  }
  return {
    id: 'waveform',
    title: 'Astable waveforms',
    subtitle: 'From power-up: the first high period is longer because C starts at 0 V',
    // the traces fill the frame: keep the legend off them
    legend: 'below',
    x: { label: 'Time', unit: 's' },
    y: [{ id: 'v', label: 'Voltage', unit: 'V', includeZero: true }],
    series: [
      { label: 'Output (pin 3)', x: t, y: out, axis: 'v', color: C_OUT, width: 1.6 },
      { label: 'Capacitor (pins 2, 6)', x: t, y: vc, axis: 'v', color: C_CAP, width: 2.2 },
    ],
    hlines: [
      { value: o.vu, label: `V_U = ${si(o.vu, 'V', 3)}`, axis: 'v', color: '#8b1e1e', dash: [4, 3] },
      { value: o.vl, label: `V_L = ${si(o.vl, 'V', 3)}`, axis: 'v', color: '#8b1e1e', dash: [4, 3] },
    ],
  };
}

function monoWave(s: TimerState, kM: number): GraphSpec {
  const { vu, vl } = thresholds(s.vcc, s.vcv);
  const tw = kM * s.ra * s.c;
  const t0 = 0.15 * tw;
  const tTrig = 0.05 * tw;
  const tEnd = t0 + 1.4 * tw;
  const tau = s.ra * s.c;
  const t: number[] = [0, t0];
  const vc: number[] = [0, 0];
  const out: number[] = [0, 0];
  for (let i = 0; i <= 120; i++) {
    const u = (tw * i) / 120;
    t.push(t0 + u);
    vc.push(charge(u, tau, 0, s.vcc));
    out.push(s.vcc);
  }
  t.push(t0 + tw, tEnd);
  vc.push(0, 0);
  out.push(0, 0);
  const trig: GraphSeries = { label: 'Trigger (pin 2)', x: [0, t0, t0, t0 + tTrig, t0 + tTrig, tEnd], y: [s.vcc, s.vcc, 0, 0, s.vcc, s.vcc], axis: 'v', color: '#9a8f7a', width: 1.1, dash: [4, 3] };
  return {
    id: 'waveform',
    title: 'Monostable waveforms',
    legend: 'below',
    x: { label: 'Time', unit: 's' },
    y: [{ id: 'v', label: 'Voltage', unit: 'V', includeZero: true }],
    series: [trig, { label: 'Output (pin 3)', x: t, y: out, axis: 'v', color: C_OUT, width: 1.6 }, { label: 'Capacitor (pin 6)', x: t, y: vc, axis: 'v', color: C_CAP, width: 2.2 }],
    hlines: [
      { value: vu, label: `V_U = ${si(vu, 'V', 3)}`, axis: 'v', color: '#8b1e1e', dash: [4, 3] },
      { value: vl, label: `trigger V_L = ${si(vl, 'V', 3)}`, axis: 'v', color: '#9a8f7a', dash: [2, 3] },
    ],
  };
}

/** The data-sheet style design chart: f (astable) or t_w (monostable) against C for a family of resistances. */
function designChart(s: TimerState, f: number): GraphSpec {
  const cLo = Math.min(s.c / 30, 1e-9);
  const cHi = Math.max(s.c * 30, 100e-6);
  const cs = logspace(cLo, cHi, 120);
  const family = [1e3, 10e3, 100e3, 1e6, 10e6];
  const astab = s.mode === 'astable';
  const series: GraphSeries[] = family.map((r, i) => ({
    label: `${astab ? 'R_A + 2R_B' : 'R_A'} = ${si(r, 'Ω')}`,
    x: cs,
    y: cs.map((c) => (astab ? 1 / (Math.LN2 * r * c) : Math.log(3) * r * c)),
    axis: 'y',
    color: ['#9a8f7a', '#4f8a8b', '#6b5b95', '#2f7d4f', '#8b1e1e'][i],
    width: 1,
  }));
  const val = astab ? f : 1 / f;
  return {
    id: 'design-chart',
    title: astab ? 'Frequency vs C' : 'Pulse width vs C',
    subtitle: astab ? 'Lines: standard astable, f = 1/(ln2·(R_A + 2R_B)·C)' : 'Lines: t_w = ln3·R_A·C',
    x: { label: 'Timing capacitance', unit: 'F', log: true },
    y: [{ id: 'y', label: astab ? 'Frequency' : 'Pulse width', unit: astab ? 'Hz' : 's', log: true }],
    series,
    markers: [{ x: s.c, y: val, axis: 'y', label: astab ? si(f, 'Hz', 3) : si(val, 's', 3), color: '#c47b17' }],
    vlines: [{ value: s.c, label: `C = ${si(s.c, 'F', 3)}`, color: '#c47b17', dash: [3, 3] }],
  };
}

export const def: CalcDef<TimerState> = {
  id: 'general/555-timer',
  version: '0.1.0',
  method: 'NE555 / TLC555 data-sheet timing (TI SLFS022, SLFS043): astable t_H = ln2·(R_A + R_B)·C, t_L = ln2·R_B·C; monostable t_w = ln3·R_A·C ≈ 1.1·R_A·C — evaluated exactly from the ⅓/⅔·V_CC (or V_CV) thresholds, with an optional diode across R_B. R and C solves are exact closed-form inverses.',
  fields,
  defaults,
  solve: {
    default: 'f',
    analysis: (s) => (s.mode === 'monostable' ? 'tw' : 'f'),
    options: [
      { key: 'f', label: 'Astable: frequency and duty from R_A, R_B, C' },
      { key: 'tw', label: 'Monostable: pulse width from R_A and C' },
      { key: 'ra', label: 'Resistors: R_A and R_B for f and duty (astable) or R_A for t_w (monostable), given C' },
      { key: 'c', label: 'Capacitor C for f (astable, duty follows from R_A/R_B) or t_w (monostable)' },
    ],
  },
  compute,
  sync: syncMode,
  examples: [
    { id: 'astable-1k', label: 'Astable: 1 kΩ, 6.8 kΩ, 100 nF (≈ 1 kHz)', state: { mode: 'astable', solveFor: 'f', ra: 1e3, rb: 6.8e3, c: 100e-9 } },
    { id: 'design-1hz', label: 'Design: 1 Hz, 60 % duty LED flasher with 10 µF', state: { mode: 'astable', solveFor: 'ra', f: 1, fUnit: 'Hz', duty: 60, c: 10e-6, cUnit: 'µF', vcc: 9 } },
    { id: 'design-25', label: 'Design: 38 kHz, 25 % duty with the R_B diode (TLC555, 3.3 V)', state: { mode: 'astable', solveFor: 'ra', device: 'TLC555', vcc: 3.3, f: 38e3, fUnit: 'kHz', duty: 25, c: 1e-9, cUnit: 'nF', diode: true, vf: 0.3 } },
    { id: 'c-for-f', label: 'C for 440 Hz with R_A = 10 kΩ, R_B = 47 kΩ', state: { mode: 'astable', solveFor: 'c', ra: 10e3, rb: 47e3, f: 440, fUnit: 'Hz' } },
    { id: 'mono-1s', label: 'Monostable: R for a 1 s pulse with 100 µF', state: { mode: 'monostable', solveFor: 'ra', tw: 1, twUnit: 's', c: 100e-6, cUnit: 'µF' } },
    { id: 'ne555-limits', label: 'Edge case: NE555 at 3.3 V, 200 kHz, 470 Ω (warnings)', state: { mode: 'astable', solveFor: 'f', device: 'NE555', vcc: 3.3, ra: 470, rb: 3.3e3, c: 1e-9, cUnit: 'nF' } },
  ],
};
