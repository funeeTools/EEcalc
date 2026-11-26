/** I²C pull-up resistor — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM, withDefault } from '@/core/unitsets';
import { eValues } from '@/core/eseries';
import { FM6, II_MAX, K_RISE, MODES, type Mode, type Sink, busWaveform, cbMaxFor, riseTime, rpMax, rpMaxLeak, rpMin, specSink } from './model';

export const ID = 'protocol/i2c-pullup';

export interface I2cState {
  solveFor: 'rp' | 'cb' | 'tr';
  mode: Mode;
  vdd: number;
  /** Supply tolerance, % (Rp(min) uses the highest VDD) */
  vddTol: number;
  cb: number;
  cbUnit: string;
  rp: number;
  rpUnit: string;
  /** Computed rise time (always an output) */
  tr: number;
  trUnit: string;
  /** Sink condition: UM10204 minimum for the mode, Fast-mode 6 mA at 0.6 V, or the values below */
  sink: Sink;
  /** Number of device pins on each line (input leakage, §7.4) */
  nDev: number;
  vol: number;
  iol: number;
  iolUnit: string;
  eseries: string;
  /** Resistor tolerance, % */
  rTol: number;
  /** Rise-time margin kept when recommending Rp, % */
  margin: number;
}

const U_R = withDefault(U_OHM, 'kΩ');
const U_T: Record<string, number> = { ns: 1e-9, 'µs': 1e-6 };
/** pF … µF: C_b runs from 1 pF to 1 µF (the shared table's fF is below the field minimum). */
const U_CB: Record<string, number> = { pF: 1e-12, nF: 1e-9, 'µF': 1e-6 };

/**
 * A setting switch (bus speed, sink condition, series) keeps the Rp design if one still exists; if the new
 * setting leaves no pull-up window, analyse the Rp already entered instead (status OUT OF SPEC with the reason)
 * rather than showing a red error.
 */
function keepOrAnalyse(s: any): void {
  if (s.solveFor === 'rp' && !compute(s).ok) s.solveFor = 'tr';
}
const U_I: Record<string, number> = { mA: 1e-3, 'µA': 1e-6, A: 1 };

export const defaults = (): I2cState => ({
  solveFor: 'rp',
  mode: 'fm',
  vdd: 3.3,
  vddTol: 5,
  cb: 100e-12,
  cbUnit: 'pF',
  rp: 2.2e3,
  rpUnit: 'kΩ',
  tr: 0,
  trUnit: 'ns',
  sink: 'spec',
  nDev: 4,
  vol: 0.4,
  iol: 3e-3,
  iolUnit: 'mA',
  eseries: 'E12',
  rTol: 5,
  margin: 20,
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Bus',
    note: 'Click ◎ on Rp, Cb or t_r to choose what is calculated. Values are per line (SDA and SCL are identical).',
    fields: [
      {
        kind: 'select',
        key: 'mode',
        label: 'Bus speed',
        options: (Object.keys(MODES) as Mode[]).map((k) => ({ value: k, label: MODES[k].label })),
        apply: (v, s) => {
          // the 6 mA at 0.6 V condition exists for Fast-mode only
          if (v !== 'fm' && s.sink === 'fm6') s.sink = 'spec';
          keepOrAnalyse(s);
        },
        help: 'Sets the maximum rise time (1000 / 300 / 120 ns), the bus-capacitance limit and the minimum sink current of UM10204.',
      },
      { kind: 'number', key: 'vdd', symbol: 'V_DD', label: 'Pull-up supply', unit: 'V', min: 0.8, max: 20 },
      { kind: 'number', key: 'vddTol', symbol: '±', label: 'Supply tolerance', suffix: '%', min: 0, max: 50, help: 'Rp(min) is computed at the highest supply, VDD·(1 + tol); the spec example uses 5 V ± 10 %.' },
      { kind: 'number', key: 'cb', symbol: 'C_b', label: 'Bus capacitance', units: U_CB, unitKey: 'cbUnit', unitFamily: 'none', solvable: true, min: 1e-12, max: 1e-6, help: 'Total per line: up to 10 pF per device pin (UM10204 Table 10) plus wiring, roughly 0.5–1 pF/cm of PCB trace and 50–100 pF/m of cable. Measure the rise time to check.' },
      { kind: 'number', key: 'rp', symbol: 'R_p', label: 'Pull-up resistor', units: U_R, unitKey: 'rpUnit', solvable: true, min: 1, max: 1e7 },
      {
        kind: 'number',
        key: 'tr',
        symbol: 't_r',
        label: 'Rise time (30–70 %)',
        units: U_T,
        unitKey: 'trUnit',
        solvable: true,
        solvedWhen: () => true,
        onUnsolve: (_s, root) => (root.solveFor = 'tr'),
        min: 0,
        max: 1,
        help: 'Always calculated: 0.8473·Rp·Cb. Click ◎ to analyse a given Rp and Cb.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Driver (open-drain sink)',
    fields: [
      {
        kind: 'select',
        key: 'sink',
        label: 'Sink condition',
        options: [
          { value: 'spec', label: 'UM10204 minimum (0.4 V at 3 / 20 mA)' },
          { value: 'fm6', label: 'Fast-mode 6 mA at 0.6 V' },
          { value: 'custom', label: 'Custom (datasheet)' },
        ],
        apply: (v, s) => {
          // a Fast-mode-only condition: choosing it selects Fast-mode
          if (v === 'fm6') s.mode = 'fm';
          keepOrAnalyse(s);
        },
        help: 'UM10204 Table 10: VOL ≤ 0.4 V at 3 mA (Sm, Fm) or 20 mA (Fm+); for VDD ≤ 2 V, VOL ≤ 0.2·VDD at 2 mA. Fast-mode devices that sink 6 mA at 0.6 V (needed for a full 400 pF bus, note [4]) allow a smaller Rp. Custom: your weakest device’s values.',
      },
      { kind: 'number', key: 'vol', symbol: 'V_OL', label: 'Low-level output', unit: 'V', min: 0, max: 5, enabled: (s) => s.sink === 'custom' },
      { kind: 'number', key: 'iol', symbol: 'I_OL', label: 'Sink current at V_OL', units: U_I, unitKey: 'iolUnit', min: 1e-6, max: 1, enabled: (s) => s.sink === 'custom' },
      { kind: 'number', key: 'nDev', symbol: 'N', label: 'Devices on the bus', integer: true, min: 1, max: 1000, help: 'I/O pins on each line. Each may leak up to 10 µA when high (Table 10); §7.4 limits Rp so the line still reaches 0.9·VDD. Typical CMOS parts leak far less.' },
    ],
  },
  {
    kind: 'section',
    title: 'Recommendation',
    fields: [
      { kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E48', 'E96'], apply: (_v, s) => keepOrAnalyse(s) },
      { kind: 'number', key: 'rTol', symbol: 'tol', label: 'Resistor tolerance', suffix: '%', min: 0, max: 20 },
      { kind: 'number', key: 'margin', symbol: 'm', label: 'Rise-time margin', suffix: '%', min: 0, max: 90, help: 'The recommended Rp keeps t_r at least this far below the limit, to cover uncertainty in Cb. The spec suggests the high end of the Rp range when supply current matters.' },
    ],
  },
];

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fC = (c: number, d = 3) => si(c, 'F', d);
const fT = (t: number, d = 3) => si(t, 's', d);
const fI = (i: number, d = 3) => si(i, 'A', d);

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: I2cState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

interface Window {
  lo: number;
  hi: number;
}

/** Largest (or smallest) preferred value whose tolerance band fits inside [lo, hi]. */
function pickE(series: string, w: Window, tol: number, largest = true): number | null {
  const vals = eValues(series, Math.max(w.lo, 1e-3), Math.max(w.hi, 1e-3)).filter((v) => v * (1 - tol) >= w.lo && v * (1 + tol) <= w.hi);
  if (!vals.length) return null;
  return largest ? vals[vals.length - 1] : vals[0];
}

function run(st: I2cState): CalcReport {
  const s: I2cState = { ...st };
  const spec = MODES[s.mode];
  if (!spec) throw new Error(`Unknown bus mode "${String(s.mode)}".`);
  const vdd = finite('VDD', s.vdd);
  if (!(vdd > 0)) throw new Error('VDD must be > 0.');
  const vddMax = vdd * (1 + finite('Supply tolerance', s.vddTol) / 100);
  const rTol = finite('Resistor tolerance', s.rTol) / 100;
  const margin = finite('Margin', s.margin) / 100;
  if (rTol < 0 || rTol >= 0.5 || margin < 0 || margin >= 1) throw new Error('Tolerance must be 0–50 % and margin 0–99 %.');
  if (!['spec', 'fm6', 'custom'].includes(s.sink)) throw new Error(`Unknown sink condition "${String(s.sink)}".`);
  if (s.sink === 'fm6' && s.mode !== 'fm') throw new Error('The 6 mA at 0.6 V sink condition is defined for Fast-mode only (UM10204 Table 10). Choose Fast-mode or another sink condition.');
  const sink = s.sink === 'spec' ? specSink(s.mode, vdd) : s.sink === 'fm6' ? { ...FM6 } : { vol: finite('VOL', s.vol), iol: finite('IOL', s.iol) };
  const nDev = finite('Number of devices', s.nDev);
  if (!(nDev >= 1) || !Number.isInteger(nDev)) throw new Error('Number of devices must be a whole number ≥ 1.');
  const vddMin = vdd * (1 - finite('Supply tolerance', s.vddTol) / 100);
  const leak = rpMaxLeak(vddMin, nDev);
  if (!(sink.iol > 0)) throw new Error('Sink current must be > 0.');
  if (!(sink.vol >= 0) || sink.vol >= vddMax) throw new Error('VOL must be between 0 and VDD.');
  if (s.solveFor !== 'cb' && !(finite('Bus capacitance', s.cb) > 0)) throw new Error('Bus capacitance must be > 0.');
  if (s.solveFor !== 'rp' && !(finite('Rp', s.rp) > 0)) throw new Error('Rp must be > 0.');
  s.vol = sink.vol;
  s.iol = sink.iol;

  const lo = rpMin(vddMax, sink.vol, sink.iol);
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' }, results: sinkResults(s) });
  let recommendedNote = '';
  let noFitWarning = '';
  switch (s.solveFor) {
    case 'rp': {
      const hiT = rpMax(spec.trMax, s.cb);
      const hi = Math.min(hiT, leak);
      if (lo > hi) {
        const cbLim = cbMaxFor(spec.trMax, lo);
        const tips = ['reduce the capacitance', 'split the bus with a buffer', 'use a current-source pull-up'];
        if (s.mode === 'fm' && s.sink === 'spec') tips.push('use the Fast-mode 6 mA at 0.6 V sink condition if all devices meet it');
        if (s.mode !== 'fmp' && vdd > 2) tips.push('use Fm+ (20 mA) drivers');
        if (s.mode !== 'sm') tips.push('run slower');
        const why =
          leak < hiT
            ? `Rp(min) = ${fR(lo, 3)} (sink current) is above the input-leakage limit ${fR(leak, 3)} for ${nDev} devices (§7.4)`
            : `Rp(min) = ${fR(lo, 3)} (sink current) is above Rp(max) = ${fR(hiT, 3)} (rise time). At this supply the bus can carry at most ${fC(cbLim)}`;
        return fail(`No pull-up meets ${spec.label} with C_b = ${fC(s.cb)}: ${why}. Options: ${tips.join(', ')}.`);
      }
      let v = pickE(s.eseries, { lo, hi: Math.min(hiT * (1 - margin), leak) }, rTol);
      if (v == null) {
        // margin unreachable: take the fastest edge that still respects Rp(min)
        v = pickE(s.eseries, { lo, hi }, rTol, false);
        if (v != null) recommendedNote = hi / lo < 1.5 ? 'narrow' : 'margin';
      }
      if (v == null) {
        // No standard part fits the spec window: say so and suggest a series / tolerance that does.
        let tip = '';
        for (const t of [rTol, 0.01, 0.001].filter((x) => x <= rTol)) {
          for (const ser of ['E12', 'E24', 'E48', 'E96']) {
            const w = pickE(ser, { lo, hi }, t);
            if (w != null) {
              tip = ` ${ser} ${fR(w, 3)} ±${+(t * 100).toPrecision(2)} % fits.`;
              break;
            }
          }
          if (tip) break;
        }
        // A window exists, so show the nearest usable part with a warning rather than no answer: a value inside
        // the window when its tolerance is ignored, else the smallest one the drivers can still pull low.
        const inside = pickE(s.eseries, { lo, hi }, 0);
        v = inside ?? eValues(s.eseries, lo, lo * 10).find((x) => x >= lo) ?? lo;
        recommendedNote = 'nofit';
        noFitWarning = `No ${s.eseries} value with ±${+(rTol * 100).toPrecision(3)} % tolerance fits the window ${fR(lo, 4)} … ${fR(hi, 4)}; ${fR(v, 3)} is the nearest${inside == null ? ' that the drivers can pull low (its rise time is over the limit)' : ', but its tolerance band leaves the window'}.${tip || ' Even 0.1 % E96 parts do not fit: widen the window (less capacitance, stronger drivers).'}`;
      }
      s.rp = v;
      break;
    }
    case 'cb':
      s.cb = cbMaxFor(spec.trMax, s.rp);
      break;
    case 'tr':
      break;
    default:
      throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }
  const hiT = rpMax(spec.trMax, s.cb);
  const hi = Math.min(hiT, leak);
  const tr = riseTime(s.rp, s.cb);
  s.tr = tr;
  const trWorst = riseTime(s.rp * (1 + rTol), s.cb);
  const iSink = (vddMax - sink.vol) / s.rp; // current the driver must sink to reach VOL
  const ron = sink.vol / sink.iol; // driver modelled as a resistor through (VOL, IOL)
  const volActual = (vddMax * ron) / (ron + s.rp);
  const pLow = (vdd * vdd) / (s.rp + ron);
  const rpOk = s.rp * (1 - rTol) >= lo * (1 - 1e-9);
  const trOk = tr <= spec.trMax * (1 + 1e-9);
  const cbOk = s.cb <= spec.cbMax * (1 + 1e-9);
  const leakOk = s.rp * (1 + rTol) <= leak * (1 + 1e-9);
  const pass = rpOk && trOk && cbOk && leakOk;

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  report.status = pass ? { text: `MEETS ${s.mode === 'sm' ? 'Sm' : s.mode === 'fm' ? 'Fm' : 'Fm+'}`, tone: 'pass' } : { text: 'OUT OF SPEC', tone: 'fail' };
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  if (s.solveFor === 'rp') results.push(item('rp', `Recommended ${s.eseries} pull-up`, s.rp, 'Ω', fR(s.rp, 3), { symbol: 'R_p', solved: true, primary: true, note: recommendedNote === 'nofit' ? 'nearest standard value, outside the spec window' : recommendedNote ? `less than ${Math.round(margin * 100)} % t_r margin possible` : `largest value with ${Math.round(margin * 100)} % t_r margin`, tone: recommendedNote ? 'warn' : '' }));
  if (s.solveFor === 'cb') results.push(item('cb', 'Maximum bus capacitance', s.cb, 'F', fC(s.cb), { symbol: 'C_b,max', solved: true, primary: true, note: s.cb > spec.cbMax ? `but the spec caps C_b at ${fC(spec.cbMax)}` : `t_r = ${fT(spec.trMax)} at Rp = ${fR(s.rp, 3)}`, tone: s.cb > spec.cbMax ? 'warn' : '' }));
  results.push(item('tr', 'Rise time (30–70 %)', tr, 's', fT(tr), { symbol: 't_r', solved: true, primary: true, note: `limit ${fT(spec.trMax)} · ${((tr / spec.trMax) * 100).toFixed(0)} % used`, tone: trOk ? 'pass' : 'fail' }));
  results.push(item('rpWindow', 'Allowed Rp range', lo, 'Ω', `${fR(lo, 3)} … ${fR(hi, 3)}`, { symbol: 'R_p', primary: true, note: `Rp(min) from sink current · Rp(max) from ${leak < hiT ? 'input leakage' : 'rise time'}`, tone: lo > hi ? 'fail' : '' }));
  results.push(
    item('rpMin', 'Rp(min)', lo, 'Ω', fR(lo, 4), { group: 'UM10204 limits', note: `(${si(vddMax, 'V', 3)} − ${si(sink.vol, 'V', 3)}) / ${fI(sink.iol)}`, tone: rpOk ? '' : 'fail' }),
    item('rpMax', 'Rp(max), rise time', hiT, 'Ω', fR(hiT, 4), { group: 'UM10204 limits', note: `${fT(spec.trMax)} / (0.8473·${fC(s.cb)})`, tone: trOk ? '' : 'fail' }),
    item('rpMaxLeak', 'Rp(max), input leakage', leak, 'Ω', fR(leak, 4), { group: 'UM10204 limits', note: `0.1·${si(vddMin, 'V', 3)} / (${nDev} × ${fI(II_MAX, 2)}) — §7.4`, tone: leakOk ? '' : 'fail' }),
    item('trMax', 'Maximum rise time', spec.trMax, 's', fT(spec.trMax), { group: 'UM10204 limits', symbol: 't_r,max' }),
    item('cbMax', 'Maximum bus capacitance', spec.cbMax, 'F', fC(spec.cbMax), { group: 'UM10204 limits', symbol: 'C_b,max', tone: cbOk ? '' : 'fail' }),
    item('cbAtRp', `C_b allowed with ${fR(s.rp, 3)}`, cbMaxFor(spec.trMax, s.rp), 'F', fC(cbMaxFor(spec.trMax, s.rp)), { group: 'UM10204 limits' }),
    ...sinkResults(s),
    item('trWorst', `t_r with Rp +${+(rTol * 100).toPrecision(3)} %`, trWorst, 's', fT(trWorst), { group: 'At this pull-up', tone: trWorst > spec.trMax ? 'warn' : '' }),
    item('iSink', 'Sink current when low', iSink, 'A', fI(iSink), { group: 'At this pull-up', note: `at ${si(sink.vol, 'V', 3)} and VDD max`, tone: iSink > sink.iol * (1 + 1e-9) ? 'fail' : '' }),
    item('volEst', 'Estimated V_OL', volActual, 'V', si(volActual, 'V', 3), { group: 'At this pull-up', note: `driver ≈ ${fR(ron, 3)} (V_OL/I_OL); V_IL(max) = ${si(0.3 * vdd, 'V', 3)}` }),
    item('pLow', 'Power per line while low', pLow, 'W', si(pLow, 'W', 3), { group: 'At this pull-up', note: 'about half this on average' }),
    item('tau', 'Time constant Rp·Cb', s.rp * s.cb, 's', fT(s.rp * s.cb), { group: 'At this pull-up', symbol: 'τ' }),
  );
  report.results = results;
  report.tables.push(table(s, lo, hi, leak));
  if (!leakOk) warnings.push(`Rp = ${fR(s.rp, 3)} is above the §7.4 input-leakage limit ${fR(leak, 3)}: ${nDev} pins × 10 µA would pull the high level below 0.9·VDD (VIH + the 0.2·VDD noise margin). Use a smaller resistor, or check that your devices leak much less than the 10 µA maximum.`);
  if (sink.vol > 0.2 * vdd * (1 + 1e-9)) warnings.push(`VOL = ${si(sink.vol, 'V', 3)} exceeds 0.2·VDD = ${si(0.2 * vdd, 'V', 3)}: less than the 0.1·VDD low-level noise margin below VIL = 0.3·VDD (UM10204 Table 11).`);

  if (!rpOk) warnings.push(`Rp = ${fR(s.rp, 3)} (−${+(rTol * 100).toPrecision(3)} %) is below Rp(min) = ${fR(lo, 3)}: a spec-minimum driver cannot pull the line below ${si(sink.vol, 'V', 3)}. Use a larger resistor${s.mode !== 'fmp' ? ' or Fm+ (20 mA) drivers' : ''}.`);
  if (!trOk) warnings.push(`Rise time ${fT(tr)} exceeds the ${fT(spec.trMax)} limit of ${spec.label}. Use a smaller Rp (≥ ${fR(lo, 3)}), reduce bus capacitance, or slow the bus.`);
  else if (trWorst > spec.trMax) warnings.push(`At the top of its tolerance (+${+(rTol * 100).toPrecision(3)} %) this resistor gives ${fT(trWorst)}, over the limit. Pick the next value down.`);
  if (!cbOk) warnings.push(`C_b = ${fC(s.cb)} is above the ${fC(spec.cbMax)} that ${spec.label} allows per line. Split the bus with a buffer (UM10204 §7.2) or reduce wiring.`);
  if (noFitWarning) warnings.push(noFitWarning);
  else if (s.solveFor === 'rp' && recommendedNote === 'narrow') warnings.push(`The spec window ${fR(lo, 3)} … ${fR(hi, 3)} is narrow, so the ${Math.round(margin * 100)} % rise-time margin cannot be kept; the fastest valid value is used. Measure C_b and the rise time on the real bus, or use a buffer or current-source pull-up.`);
  else if (s.solveFor === 'rp' && recommendedNote === 'margin') warnings.push(`No ${s.eseries} value keeps a ${Math.round(margin * 100)} % rise-time margin inside ${fR(lo, 3)} … ${fR(hi, 3)}; the fastest valid value is used. Lower the margin or use a finer series.`);
  if (vdd <= 2 && s.sink === 'spec') notes.push('VDD ≤ 2 V: UM10204 specifies VOL ≤ 0.2·VDD at 2 mA. The resistor that gives 3 mA at 3 V gives the same RC time constant at the lower supply.');
  if (s.mode === 'sm' && vdd <= 2 && s.sink === 'spec') notes.push('UM10204 gives no VOL2 limit for Standard-mode at VDD ≤ 2 V; the Fast-mode value is used.');
  notes.push(
    'Rise time is the RC charge from 0.3·VDD to 0.7·VDD: t_r = ln(7/3)·Rp·Cb = 0.8473·Rp·Cb (UM10204 §7.1). It assumes a lumped capacitance and no series resistors.',
    'Every device on the bus must be able to sink (VDD − VOL)/Rp. If any part has a weaker driver than the spec minimum, switch the sink condition to Custom and enter its values.',
    `Input leakage uses the 10 µA per-pin maximum of Table 10 for ${nDev} devices; real CMOS inputs usually leak well under 1 µA, so this limit is conservative.`,
  );
  report.summary = `${spec.label} · VDD ${si(vdd, 'V', 3)} ±${s.vddTol}% · C_b ${fC(s.cb)} · Rp ${fR(lo, 3)} … ${fR(hi, 3)} → ${fR(s.rp, 3)}, t_r ${fT(tr)}`;
  report.details = { rpMin: lo, rpMax: hi, rpMaxRise: hiT, rpMaxLeak: leak, nDev, tr, trMax: spec.trMax, cbMax: spec.cbMax, vddMax, vol: sink.vol, iol: sink.iol, kRise: K_RISE, ron };
  report.graphs = graphs(s, lo, hi, tr, leak);
  return report;
}

function sinkResults(s: I2cState): ResultItem[] {
  return [
    // solved: true writes the spec values back into the (disabled) VOL / IOL inputs
    { key: 'vol', label: 'V_OL used', value: s.vol, unit: 'V', display: si(s.vol, 'V', 3), group: 'Driver', solved: s.sink !== 'custom', note: s.sink === 'custom' ? 'custom' : 'UM10204 Table 10' },
    { key: 'iol', label: 'I_OL used', value: s.iol, unit: 'A', display: fI(s.iol), group: 'Driver', solved: s.sink !== 'custom', note: s.sink === 'custom' ? 'custom' : 'UM10204 Table 10' },
  ];
}

function table(s: I2cState, lo: number, hi: number, leak: number): TableSpec {
  const spec = MODES[s.mode];
  const vals = eValues(s.eseries, Math.max(lo / 2, 1), Math.min(Math.max(hi * 1.5, lo * 2), 1e7));
  const pick = vals.length > 14 ? vals.filter((_, k) => k % Math.ceil(vals.length / 14) === 0) : vals;
  const rows = pick.map((r) => ({ rp: r, tr: riseTime(r, s.cb), cbMax: cbMaxFor(spec.trMax, r), ok: r * (1 - s.rTol / 100) >= lo && r * (1 + s.rTol / 100) <= hi ? 'yes' : r * (1 - s.rTol / 100) < lo ? 'Rp < min' : r * (1 + s.rTol / 100) > leak ? 'leakage limit' : 't_r too long' }));
  // in spec, but at the top of its tolerance the rise time eats into the chosen margin
  const tight = (rp: number) => riseTime(rp * (1 + s.rTol / 100), s.cb) > spec.trMax * (1 - s.margin / 100);
  return {
    id: 'values',
    title: `${s.eseries} pull-ups at C_b = ${fC(s.cb)}`,
    columns: [
      { key: 'rp', label: 'Rp', unit: 'Ω' },
      { key: 'tr', label: 't_r', unit: 's' },
      { key: 'cbMax', label: 'Max C_b', unit: 'F' },
      { key: 'ok', label: `Within spec (±${s.rTol} %)`, align: 'left' },
    ],
    rows,
    rowTones: rows.map((r) => (r.ok !== 'yes' ? 'fail' : tight(r.rp) ? 'warn' : 'pass')),
    display: rows.map((r) => ({ rp: fR(r.rp, 3), tr: fT(r.tr), cbMax: fC(r.cbMax), ok: r.ok === 'yes' && tight(r.rp) ? 'yes, inside margin' : r.ok })),
    note: `Yellow: within spec, but at +${s.rTol} % tolerance the rise time is inside the ${s.margin} % margin. Red: outside the spec window.`,
  };
}

function graphs(s: I2cState, lo: number, hi: number, tr: number, leak: number): GraphSpec[] {
  const spec = MODES[s.mode];
  const a = Math.max(Math.min(lo, s.rp, hi) / 3, 1);
  const b = Math.max(lo, s.rp, hi) * 3;
  const rs = Array.from({ length: 161 }, (_, k) => a * (b / a) ** (k / 160));
  rs.push(s.rp);
  rs.sort((x, y) => x - y);
  const g1: GraphSpec = {
    id: 'tr-vs-rp',
    title: 'Rise time vs Rp',
    subtitle: `C_b = ${fC(s.cb)}`,
    x: { label: 'Pull-up resistance Rp', unit: 'Ω', log: true },
    y: [{ id: 't', label: 'Rise time 30–70 %', unit: 's', includeZero: true }],
    series: [
      { label: `t_r at ${fC(s.cb)}`, x: rs, y: rs.map((r) => riseTime(r, s.cb)), axis: 't', width: 2.2 },
      ...(s.cb < spec.cbMax ? [{ label: `t_r at C_b,max ${fC(spec.cbMax)}`, x: rs, y: rs.map((r) => riseTime(r, spec.cbMax)), axis: 't', color: '#9a8f7a', width: 1.2, dash: [5, 3] }] : []),
    ],
    hlines: [
      { value: spec.trMax, label: `t_r,max ${fT(spec.trMax)}`, axis: 't', color: '#8b1e1e', dash: [6, 4] },
      ...(s.margin > 0 ? [{ value: spec.trMax * (1 - s.margin / 100), label: `${s.margin} % margin`, axis: 't', color: '#c47b17', dash: [3, 3], width: 1 }] : []),
    ],
    vlines: [
      { value: lo, label: `Rp(min) ${fR(lo, 3)}`, color: '#8b1e1e', dash: [6, 4] },
      { value: rpMax(spec.trMax, s.cb), label: `Rp(max) ${fR(rpMax(spec.trMax, s.cb), 3)}`, color: '#9a8f7a', dash: [3, 3] },
      ...(leak < 3 * Math.max(lo, s.rp, hi) ? [{ value: leak, label: `leakage limit ${fR(leak, 3)}`, color: '#8b1e1e', dash: [2, 3] }] : []),
    ],
    markers: [{ x: s.rp, y: tr, axis: 't', label: `${fR(s.rp, 3)} · ${fT(tr)}` }],
  };
  const cMax = Math.max(spec.cbMax * 1.4, s.cb * 1.3);
  const cs = Array.from({ length: 161 }, (_, k) => 5e-12 * (cMax / 5e-12) ** (k / 160));
  const others = (Object.keys(MODES) as Mode[]).filter((m) => m !== s.mode);
  const g2: GraphSpec = {
    id: 'rp-window',
    title: 'Rp window vs C_b',
    subtitle: 'Valid pull-ups lie between Rp(min) and the Rp(max) curve',
    x: { label: 'Bus capacitance C_b', unit: 'F', log: true },
    y: [{ id: 'r', label: 'Pull-up resistance', unit: 'Ω', log: true }],
    series: [
      { label: `Rp(max) ${spec.label}`, x: cs, y: cs.map((c) => rpMax(spec.trMax, c)), axis: 'r', width: 2.2 },
      ...others.map((m, i) => ({ label: `Rp(max) ${MODES[m].label}`, x: cs, y: cs.map((c) => rpMax(MODES[m].trMax, c)), axis: 'r', color: i ? '#6b5b95' : '#4f8a8b', width: 1.1, dash: [4, 3] })),
      { label: 'Rp(min)', x: [cs[0], cs[cs.length - 1]], y: [lo, lo], axis: 'r', color: '#8b1e1e', width: 1.6, dash: [6, 4] },
      { label: `Leakage limit (${s.nDev} devices)`, x: [cs[0], cs[cs.length - 1]], y: [leak, leak], axis: 'r', color: '#8b1e1e', width: 1.2, dash: [2, 3] },
    ],
    vlines: [{ value: spec.cbMax, label: `C_b,max ${fC(spec.cbMax)}`, color: '#8b1e1e', dash: [2, 3] }, { value: s.cb, label: `C_b ${fC(s.cb)}`, color: '#9a8f7a' }],
    markers: [{ x: s.cb, y: s.rp, axis: 'r', label: fR(s.rp, 3) }],
  };
  return [waveform(s, tr), g1, g2];
}

/** Example clock on one line: the actual RC edges, the driven logic level, and the slowest edge the spec allows. */
function waveform(s: I2cState, tr: number): GraphSpec {
  const spec = MODES[s.mode];
  const period = 1 / spec.fScl;
  const tLow = Math.max(spec.tLow, period / 2);
  const tHigh = period - tLow;
  const ron = s.vol / s.iol;
  const opts = { vdd: s.vdd, cb: s.cb, ron, tLow, tHigh, cycles: 3, lead: 0.3 * period };
  const w = busWaveform({ ...opts, rp: s.rp });
  const rLim = rpMax(spec.trMax, s.cb);
  const lim = busWaveform({ ...opts, rp: rLim });
  // driven level: what the line would do with no capacitance
  const ix = [0];
  const iy = [s.vdd];
  for (const e of w.edges) ix.push(e.t0, e.t0), iy.push(iy[iy.length - 1], e.low ? 0 : s.vdd);
  ix.push(w.t[w.t.length - 1]), iy.push(s.vdd);
  // 30 % and 70 % crossings of the first rising edge: t = τ·ln((VDD − v0)/(VDD − v))
  const tau = s.rp * s.cb;
  const rise = w.edges.find((e) => !e.low)!;
  const v0 = w.v[w.t.lastIndexOf(rise.t0)];
  const cross = (f: number) => rise.t0 + tau * Math.log((s.vdd - v0) / (s.vdd - f * s.vdd));
  const markers = v0 < 0.3 * s.vdd && cross(0.7) < rise.t0 + tHigh ? [{ x: cross(0.3), y: 0.3 * s.vdd, axis: 'v' }, { x: cross(0.7), y: 0.7 * s.vdd, axis: 'v', label: `t_r ${fT(tr)}` }] : [];
  return {
    id: 'waveform',
    title: 'Bus waveform',
    subtitle: `Example clock at ${si(spec.fScl, 'Hz', 3)} (LOW ${fT(tLow)}, HIGH ${fT(tHigh)}) · Rp = ${fR(s.rp, 3)}, C_b = ${fC(s.cb)}`,
    x: { label: 'Time', unit: 's' },
    y: [{ id: 'v', label: 'Line voltage', unit: 'V', includeZero: true }],
    legend: 'below',
    series: [
      { label: 'Driven level', x: ix, y: iy, axis: 'v', color: '#7a7466', width: 1.4, dash: [2, 3] },
      { label: `Slowest edge allowed (t_r,max ${fT(spec.trMax)})`, x: lim.t, y: lim.v, axis: 'v', color: '#8b1e1e', width: 1.1, dash: [6, 4] },
      { label: `Line voltage, Rp = ${fR(s.rp, 3)}`, x: w.t, y: w.v, axis: 'v', color: '#1f4e5f', width: 2.2 },
    ],
    hlines: [
      { value: 0.7 * s.vdd, label: 'V_IH 0.7·VDD', axis: 'v', color: '#9a8f7a', dash: [4, 3], width: 1 },
      { value: 0.3 * s.vdd, label: 'V_IL 0.3·VDD', axis: 'v', color: '#9a8f7a', dash: [4, 3], width: 1 },
    ],
    markers,
  };
}

export const def: CalcDef<I2cState> = {
  id: ID,
  version: '0.1.0',
  method:
    'NXP UM10204 Rev. 7.0 §7.1: Rp(max) = t_r/(0.8473·C_b) (30→70 % RC charge), Rp(min) = (VDD_max − VOL)/IOL, with t_r, C_b, VOL and IOL limits from Tables 10–11 for Standard, Fast and Fast-mode Plus; the recommendation is the largest IEC 60063 value whose tolerance band keeps a chosen rise-time margin.',
  fields,
  defaults,
  // Rp, C_b and t_r are not inverses of one another, so the harness round-trip flags here are expected: the Rp
  // solve recommends the largest standard value that keeps the rise-time margin (not the Rp that gives the C_b
  // or t_r in the boxes), and the C_b solve gives the most capacitance the entered Rp allows at t_r,max.
  solve: {
    default: 'rp',
    analysis: 'tr',
    options: [
      { key: 'rp', label: 'Recommend Rp for the bus capacitance' },
      { key: 'cb', label: 'Maximum C_b for a given Rp' },
      { key: 'tr', label: 'Rise time and spec check for Rp and C_b' },
    ],
  },
  compute,
  examples: [
    { id: 'fm-3v3', label: 'Fast-mode, 3.3 V, 100 pF', state: defaults() },
    { id: 'um10204-5v', label: 'UM10204 §7.2.4: 5 V ±10 %, Rp(min) = 1.7 kΩ → max C_b at 400 kHz', state: { solveFor: 'cb', mode: 'fm', vdd: 5, vddTol: 10, rp: 1.7e3, sink: 'spec', eseries: 'E24', rTol: 0, margin: 20 } },
    { id: 'sm-long', label: 'Standard-mode, 5 V, 350 pF cable run', state: { solveFor: 'rp', mode: 'sm', vdd: 5, vddTol: 5, cb: 350e-12, sink: 'spec', eseries: 'E12', rTol: 5, margin: 20 } },
    { id: 'fmp-1v8', label: 'Fast-mode Plus at 1.8 V, 150 pF', state: { solveFor: 'rp', mode: 'fmp', vdd: 1.8, vddTol: 5, cb: 150e-12, sink: 'spec', eseries: 'E24', rTol: 1, margin: 20 } },
    { id: 'check-10k', label: 'Check: 10 kΩ on a 200 pF Fast-mode bus (too slow)', state: { solveFor: 'tr', mode: 'fm', vdd: 3.3, vddTol: 5, cb: 200e-12, rp: 10e3, sink: 'spec', eseries: 'E12', rTol: 5, margin: 20 } },
  ],
};
