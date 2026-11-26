/** Switching regulator ripple — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { bracketE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_IND, U_OHM, withDefault } from '@/core/unitsets';
import { type CapNet, type Converter, type Ripple, type Topology, capRipple, converter, rippleWave } from './model';

export type RippleSolve = 'dvOut' | 'cOut' | 'esrOut' | 'cIn' | 'esrIn';

export interface RippleState {
  solveFor: RippleSolve;
  topo: Topology;
  vin: number;
  vout: number;
  iout: number;
  fsw: number;
  fswUnit: string;
  l: number;
  lUnit: string;
  tr: number;
  cOut: number;
  cOutUnit: string;
  nOut: number;
  biasOut: number;
  esrOut: number;
  esrOutUnit: string;
  eslOut: number;
  dvOut: number;
  cIn: number;
  cInUnit: string;
  nIn: number;
  biasIn: number;
  esrIn: number;
  esrInUnit: string;
  eslIn: number;
  dvIn: number;
  /** last Vout used with each topology (not a form field) */
  voutMem?: Partial<Record<Topology, number>>;
}

export const defaults = (): RippleState => ({
  solveFor: 'dvOut',
  topo: 'buck',
  vin: 12,
  vout: 3.3,
  iout: 3,
  fsw: 500e3,
  fswUnit: 'kHz',
  l: 4.7e-6,
  lUnit: 'µH',
  tr: 10e-9,
  cOut: 22e-6,
  cOutUnit: 'µF',
  nOut: 2,
  biasOut: 60,
  esrOut: 3e-3,
  esrOutUnit: 'mΩ',
  eslOut: 0.5e-9,
  dvOut: 10e-3,
  cIn: 10e-6,
  cInUnit: 'µF',
  nIn: 2,
  biasIn: 50,
  esrIn: 5e-3,
  esrInUnit: 'mΩ',
  eslIn: 0.5e-9,
  dvIn: 0.1,
});

const U_MOHM = withDefault(U_OHM, 'mΩ');
const U_CAP_U = withDefault(U_CAP, 'µF');
const U_IND_U = withDefault(U_IND, 'µH');
const U_FREQ_K = withDefault(U_FREQ, 'kHz');

const OUT_SOLVES = ['cOut', 'esrOut'];
const IN_SOLVES = ['cIn', 'esrIn'];

const capSection = (side: 'Out' | 'In'): FieldSpec => {
  const o = side === 'Out';
  const sub = o ? 'out' : 'in';
  return {
    kind: 'section',
    title: o ? 'Output capacitors' : 'Input capacitors',
    collapsed: !o,
    note: o ? undefined : 'Cin supplies the AC part of the converter’s input current; the source is taken as stiff at fsw.',
    fields: [
      { kind: 'number', key: `c${side}`, symbol: `C_${sub}`, label: 'Capacitance each', units: U_CAP_U, unitKey: `c${side}Unit`, solvable: true, min: 1e-12, max: 1, help: 'Rated (nominal) value of one capacitor. The effective bank is n·C·(DC-bias retention).' },
      { kind: 'number', key: `n${side}`, symbol: `n_${sub}`, label: 'Number in parallel', min: 1, max: 1000, integer: true, help: 'Identical parts in parallel: C adds, ESR and ESL divide (if each part has its own low-inductance path to the plane).' },
      { kind: 'number', key: `bias${side}`, symbol: `k_DC`, label: 'Retained at DC bias', suffix: '%', min: 1, max: 100, help: `Share of the rated capacitance left at ${o ? 'Vout' : 'Vin'}, read from the maker’s DC-bias curve (Murata SimSurfing, TDK, Samsung, KEMET tools). Class-II ceramics (X5R/X7R) in small cases often keep only 30–70 % at half their rated voltage; film, polymer and C0G parts ≈ 100 %.` },
      { kind: 'number', key: `esr${side}`, symbol: `ESR_${sub}`, label: 'ESR each', units: U_MOHM, unitKey: `esr${side}Unit`, solvable: true, min: 0, max: 100, help: 'At the switching frequency (from the impedance/ESR curve). MLCC: a few mΩ; polymer: 5–40 mΩ; wet aluminium: 20 mΩ – 2 Ω.' },
      { kind: 'number', key: `esl${side}`, symbol: `ESL_${sub}`, label: 'ESL each', unit: 'H', min: 0, max: 1e-6, help: 'Series inductance including the mounting (pads, vias). 0402–1206 MLCC: about 0.3–1.2 nH mounted; SMD polymer/aluminium: 1–5 nH.' },
      {
        kind: 'number',
        key: `dv${side}`,
        symbol: `ΔV_${sub}`,
        label: o ? 'Output ripple (p-p)' : 'Input ripple (p-p)',
        unit: 'V',
        min: 1e-15,
        max: 1e6,
        solvable: true,
        solvedWhen: (_s, root) => !(o ? OUT_SOLVES : IN_SOLVES).includes(root.solveFor),
        onSolve: (_s, root) => (root.solveFor = 'dvOut'),
        onUnsolve: (_s, root) => (root.solveFor = o ? 'cOut' : 'cIn'),
        help: 'Calculated (exact peak-to-peak of the sum). Click ◎ to type a target and solve for C (or click ◎ on ESR to solve for the largest ESR that meets it).',
      },
    ],
  };
};

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Converter',
    fields: [
      {
        kind: 'select',
        key: 'topo',
        label: 'Topology',
        options: [
          { value: 'buck', label: 'Buck (step-down)' },
          { value: 'boost', label: 'Boost (step-up)' },
          { value: 'buckboost', label: 'Buck-boost (inverting)' },
        ],
        // a different topology changes what the ripple targets mean: back to analysis of the entered parts
        // Vout is remembered per topology (def.sync) so buck → boost → buck restores it (A → B → A).
        apply: (v: Topology, s: any) => {
          s.solveFor = 'dvOut';
          const ok = (x: number) => x > 0 && (v === 'buck' ? x < s.vin : v === 'boost' ? x > s.vin : true);
          const mem = s.voutMem?.[v];
          if (typeof mem === 'number' && ok(mem)) s.vout = mem;
          else if (!ok(s.vout)) s.vout = Number((s.vin * (v === 'buck' ? 0.4 : 2)).toPrecision(3));
        },
      },
      { kind: 'number', key: 'vin', symbol: 'V_in', label: 'Input voltage', unit: 'V', min: 0.1, max: 1000, help: 'Worst case for the output ripple: highest Vin for a buck, lowest Vin for the boost and buck-boost output charge term.' },
      { kind: 'number', key: 'vout', symbol: '|V_out|', label: 'Output voltage', unit: 'V', min: 0.05, max: 2000, help: 'Magnitude; the inverting buck-boost output is negative.' },
      { kind: 'number', key: 'iout', symbol: 'I_out', label: 'Output current', unit: 'A', min: 1e-6, max: 1000 },
      { kind: 'number', key: 'fsw', symbol: 'f_sw', label: 'Switching frequency', units: U_FREQ_K, unitKey: 'fswUnit', unitFamily: 'none', min: 1e3, max: 100e6 },
      { kind: 'number', key: 'l', symbol: 'L', label: 'Inductance', units: U_IND_U, unitKey: 'lUnit', min: 1e-9, max: 1 },
      { kind: 'number', key: 'tr', symbol: 't_tr', label: 'Current transition time', unit: 's', min: 1e-10, max: 1e-6, help: 'Time the switch and rectifier take to hand the inductor current over (≈ the switch-node rise/fall time). It sets the height of the ESL spikes on a pulsed capacitor current: ESL·ΔI/t_tr.' },
    ],
  },
  capSection('Out'),
  capSection('In'),
];

export const capNet = (s: RippleState, side: 'Out' | 'In'): CapNet => {
  const n = side === 'Out' ? s.nOut : s.nIn;
  const k = (side === 'Out' ? s.biasOut : s.biasIn) / 100;
  return { c: n * k * (side === 'Out' ? s.cOut : s.cIn), esr: (side === 'Out' ? s.esrOut : s.esrIn) / n, esl: (side === 'Out' ? s.eslOut : s.eslIn) / n };
};

const LABEL: Record<string, string> = { cOut: 'Output capacitance each', esrOut: 'Output ESR each', cIn: 'Input capacitance each', esrIn: 'Input ESR each' };
const TOPO: Record<Topology, string> = { buck: 'buck', boost: 'boost', buckboost: 'inverting buck-boost' };

export function compute(st: RippleState): CalcReport {
  const num = ['vin', 'vout', 'iout', 'fsw', 'l', 'tr', 'cOut', 'nOut', 'biasOut', 'esrOut', 'eslOut', 'dvOut', 'cIn', 'nIn', 'biasIn', 'esrIn', 'eslIn', 'dvIn'] as const;
  for (const k of num) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!(st.vin > 0) || !(st.vout > 0) || !(st.iout > 0) || !(st.fsw > 0) || !(st.l > 0) || !(st.tr > 0)) throw new Error('Vin, |Vout|, Iout, fsw, L and t_tr must be > 0.');
  if (st.topo === 'buck' && st.vout >= st.vin) throw new Error(`A buck steps down: Vout (${si(st.vout, 'V', 3)}) must be below Vin (${si(st.vin, 'V', 3)}).`);
  if (st.topo === 'boost' && st.vout <= st.vin) throw new Error(`A boost steps up: Vout (${si(st.vout, 'V', 3)}) must be above Vin (${si(st.vin, 'V', 3)}).`);
  for (const k of ['nOut', 'nIn'] as const) if (!(st[k] >= 1)) throw new Error('The capacitor count must be ≥ 1.');
  for (const k of ['biasOut', 'biasIn'] as const) if (!(st[k] > 0 && st[k] <= 100)) throw new Error('DC-bias retention must be in 1–100 %.');
  for (const k of ['esrOut', 'esrIn', 'eslOut', 'eslIn'] as const) if (st[k] < 0) throw new Error(`${k} must be ≥ 0.`);
  if (!OUT_SOLVES.includes(st.solveFor) && !IN_SOLVES.includes(st.solveFor) && st.solveFor !== 'dvOut') throw new Error('Unknown solve-for option.');
  if (st.solveFor !== 'cOut' && !(st.cOut > 0)) throw new Error('Output capacitance must be > 0.');
  if (st.solveFor !== 'cIn' && !(st.cIn > 0)) throw new Error('Input capacitance must be > 0.');
  if (OUT_SOLVES.includes(st.solveFor) && !(st.dvOut > 0)) throw new Error('Target output ripple must be > 0.');
  if (IN_SOLVES.includes(st.solveFor) && !(st.dvIn > 0)) throw new Error('Target input ripple must be > 0.');

  const s: RippleState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];
  const cv = converter({ topo: s.topo, vin: s.vin, vout: s.vout, iout: s.iout, fsw: s.fsw, l: s.l, tr: s.tr });
  const report: CalcReport = { calc: 'power/switching-regulator-ripple', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const rip = (side: 'Out' | 'In', patch: Partial<RippleState> = {}) => {
    const x = { ...s, ...patch };
    return capRipple(side === 'Out' ? cv.out : cv.in, cv.T, capNet(x, side));
  };

  // ── solve
  if (s.solveFor !== 'dvOut') {
    const side: 'Out' | 'In' = OUT_SOLVES.includes(s.solveFor) ? 'Out' : 'In';
    const target = side === 'Out' ? s.dvOut : s.dvIn;
    const key = s.solveFor as 'cOut' | 'esrOut' | 'cIn' | 'esrIn';
    const g = (x: number) => rip(side, { [key]: x }).pp;
    if (key === 'cOut' || key === 'cIn') {
      // p-p is convex in 1/C, so the C that meet the target form one interval: report its smallest C.
      // Mode-switch harness note: when the ripple has a minimum at finite C (ESR/ESL-dominated, e.g. the polymer
      // example) ◎ C returns the low end of that interval, not the C in the state. Legitimate round-trip "failure".
      const r = invert(g, target, { lo: 1e-12, hi: 1, log: true, samples: 160 });
      const roots = r.roots.filter((x) => Math.abs(g(x) - target) <= 1e-7 * target);
      if (!roots.length) {
        const floor = g(1e9); // C → ∞: ESR and ESL only
        if (target <= floor * (1 + 1e-6)) return noSolution(report, key, `The ESR and ESL alone give ${si(floor, 'V', 3)} of ${side === 'Out' ? 'output' : 'input'} ripple. Lower the ESR/ESL (more parts in parallel, a lower-ESR type) to get below that.`);
        return noSolution(report, key, `No capacitance in 1 pF – 1 F gives ${si(target, 'V', 3)} (closest ${si(r.closestValue, 'V', 3)}).`);
      }
      s[key] = Math.min(...roots);
    } else {
      // p-p is convex in ESR: the allowed ESR is an interval; report its largest value (the most lenient part).
      // As for C, ◎ ESR from an analysis state can return a larger ESR than the state's when the ripple first falls
      // with ESR (the ESR term partly cancels the ESL/charge peaks): legitimate round-trip "failure".
      // The ripple can dip below its zero-ESR value (ESR partly cancels the ESL/charge peaks), so the floor is the
      // minimum over ESR, not g(0) (review 2026-11-26).
      const grid = [0, ...Array.from({ length: 161 }, (_, k) => 1e-9 * 1e11 ** (k / 160))];
      const gs = grid.map(g);
      let kMin = 0;
      gs.forEach((v, k) => v < gs[kMin] && (kMin = k));
      let gMin = gs[kMin];
      if (kMin > 0) {
        // refine the minimum (convex) by golden-section between the neighbouring grid points
        let a = grid[kMin - 1];
        let b = grid[Math.min(kMin + 1, grid.length - 1)];
        for (let it = 0; it < 100; it++) {
          const c = b - 0.618034 * (b - a);
          const d = a + 0.618034 * (b - a);
          if (g(c) < g(d)) b = d;
          else a = c;
        }
        gMin = Math.min(gMin, g((a + b) / 2));
      }
      if (target < gMin * (1 - 1e-9)) return noSolution(report, key, `No ESR gets below ${si(gMin, 'V', 3)} of ripple (the capacitance and ESL set that floor${kMin > 0 ? `, lowest near ${si(grid[kMin], 'Ω', 2)} per part` : ' at zero ESR'}). Add capacitance (or lower the ESL) to reach ${si(target, 'V', 3)}.`);
      const r = invert(g, target, { lo: 1e-9, hi: 100, log: true, samples: 160 });
      const roots = r.roots.filter((x) => Math.abs(g(x) - target) <= 1e-7 * target);
      if (!roots.length) {
        if (g(100) <= target) return noSolution(report, key, `Any ESR up to 100 Ω meets ${si(target, 'V', 3)}; the ESR does not limit this design.`);
        s[key] = 0; // the target is met only at (or numerically just above) zero ESR
      } else s[key] = Math.max(...roots);
    }
  }

  const ro = rip('Out');
  const ri = rip('In');
  if (s.solveFor === 'dvOut' || IN_SOLVES.includes(s.solveFor)) s.dvOut = ro.pp;
  if (!IN_SOLVES.includes(s.solveFor)) s.dvIn = ri.pp;
  if (ro.pp > 1e6 || ri.pp > 1e6) throw new Error('The computed ripple exceeds 1 MV: the capacitance is far too small for this converter.');

  // ── warnings
  if (cv.dIL / 2 > cv.iLavg)
    warnings.push(`ΔIL/2 = ${si(cv.dIL / 2, 'A', 3)} exceeds the average inductor current ${si(cv.iLavg, 'A', 3)}: with a diode rectifier the converter runs in DCM, which this page does not model. Results are for forced-PWM (synchronous) CCM with negative inductor current; use the ${s.topo === 'boost' ? 'Boost' : 'Buck'} Converter page for DCM.`);
  if (cv.trClamped) warnings.push(`t_tr = ${si(s.tr, 's', 3)} is longer than a quarter of the shorter switching interval; ${si(cv.tr, 's', 3)} is used. The ESL spike estimate is rough here.`);
  const kOut = s.biasOut / 100;
  if (kOut < 0.3) notes.push(`Only ${s.biasOut.toFixed(0)} % of the rated output capacitance is left at DC bias: a higher-voltage rating or a larger case recovers much of it.`);
  for (const [side, r, v] of [['output', ro, s.vout], ['input', ri, s.vin]] as const)
    if (r.pp > 0.05 * v) warnings.push(`The ${side} ripple (${si(r.pp, 'V', 3)}) is over 5 % of ${side === 'output' ? '|Vout|' : 'Vin'}: the small-ripple assumption (constant capacitor voltage while computing the currents) is getting weak. Add capacitance.`);
  if (s.topo !== 'buck' && ro.ppEsl > ro.ppC + ro.ppEsr)
    notes.push('The ESL spikes dominate the output ripple: they are a few ns wide, so a 20 MHz scope bandwidth limit hides most of them. Lower them with parallel small MLCCs close to the rectifier, a tight hot loop, or a small LC post-filter.');

  // ── results
  const item = (key: string, label: string, value: ResultItem['value'], unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const solved = s.solveFor;
  const solvedUnit = solved === 'cOut' || solved === 'cIn' ? 'F' : 'Ω';
  if (solved !== 'dvOut') {
    const v = s[solved];
    const side = OUT_SOLVES.includes(solved) ? 'out' : 'in';
    results.push(
      item(solved, LABEL[solved], v, solvedUnit, solvedUnit === 'F' ? si(v, 'F', 4) : v === 0 ? '0 Ω' : si(v, 'Ω', 4), {
        symbol: solvedUnit === 'F' ? `C_${side}` : `ESR_${side}`,
        solved: true,
        primary: true,
        note: solvedUnit === 'F' ? `each (bank ${si(capNet(s, side === 'out' ? 'Out' : 'In').c, 'F', 3)} eff.) · next E6 ${si(bracketE('E6', v)[1], 'F', 2)} → ${si(rip(side === 'out' ? 'Out' : 'In', { [solved]: bracketE('E6', v)[1] }).pp, 'V', 3)}` : `largest per part for ΔV_${side} = ${si(side === 'out' ? s.dvOut : s.dvIn, 'V', 3)}`,
      }),
    );
  }
  results.push(
    item('dvOut', 'Output ripple (p-p)', ro.pp, 'V', si(ro.pp, 'V', 3), { symbol: 'ΔV_out', primary: true, solved: !OUT_SOLVES.includes(solved), note: `${((ro.pp / s.vout) * 100).toFixed(2)} % of |Vout| · simple sum ${si(ro.sum, 'V', 3)}` }),
    item('dvIn', 'Input ripple (p-p)', ri.pp, 'V', si(ri.pp, 'V', 3), { symbol: 'ΔV_in', primary: true, solved: !IN_SOLVES.includes(solved), note: `${((ri.pp / s.vin) * 100).toFixed(2)} % of Vin · simple sum ${si(ri.sum, 'V', 3)}` }),
    item('dIL', 'Inductor ripple (p-p)', cv.dIL, 'A', si(cv.dIL, 'A', 3), { symbol: 'ΔI_L', primary: true, note: `D = ${(cv.d * 100).toFixed(1)} % · ${((cv.dIL / cv.iLavg) * 100).toFixed(0)} % of I_L` }),
  );
  const group = (side: 'Out' | 'In', r: Ripple, kind: string) => {
    const g = side === 'Out' ? 'Output ripple parts' : 'Input ripple parts';
    const net = capNet(s, side);
    const lower = side.toLowerCase();
    const cNote = kind === 'triangle' ? 'ΔIL/(8·fsw·C)' : side === 'Out' ? 'Iout·D/(fsw·C) (+ edge charge)' : 'I·D(1 − D)/(fsw·C)';
    const escNote = kind === 'triangle' ? 'ESR·ΔIL' : 'ESR·I_pk (current step)';
    const eslNote = kind === 'triangle' ? `ESL·Vin/L square wave` : `spikes ≈ ESL·I/t_tr`;
    results.push(
      item(`ceff${side}`, 'Effective capacitance', net.c, 'F', si(net.c, 'F', 3), { symbol: `C_${lower},eff`, group: g, note: `${side === 'Out' ? s.nOut : s.nIn} × ${si(side === 'Out' ? s.cOut : s.cIn, 'F', 3)} × ${(side === 'Out' ? s.biasOut : s.biasIn).toFixed(0)} %` }),
      item(`dvC${side}`, 'Capacitive part', r.ppC, 'V', si(r.ppC, 'V', 3), { symbol: 'ΔV_C', group: g, note: cNote }),
      item(`dvEsr${side}`, 'ESR part', r.ppEsr, 'V', si(r.ppEsr, 'V', 3), { symbol: 'ΔV_ESR', group: g, note: `${escNote}, ESR ${si(net.esr, 'Ω', 3)}` }),
      item(`dvEsl${side}`, 'ESL part', r.ppEsl, 'V', si(r.ppEsl, 'V', 3), { symbol: 'ΔV_ESL', group: g, note: `${eslNote}, ESL ${si(net.esl, 'H', 3)}` }),
      item(`dvSum${side}`, 'Simple sum (bound)', r.sum, 'V', si(r.sum, 'V', 3), { group: g, note: 'peaks assumed to line up' }),
      item(`dvRss${side}`, 'Quadrature (RSS)', r.rss, 'V', si(r.rss, 'V', 3), { group: g, note: r.rss < r.pp ? 'underestimates here' : 'no physical basis for these waveforms' }),
      item(`irms${side}`, 'Capacitor RMS current', r.irms, 'A', si(r.irms, 'A', 3), { symbol: `I_C${lower},rms`, group: g, note: `whole bank · ${si(r.irms / (side === 'Out' ? s.nOut : s.nIn), 'A', 3)} per part` }),
    );
  };
  group('Out', ro, cv.outKind);
  group('In', ri, cv.inKind);
  const g = 'Converter';
  results.push(
    item('duty', 'Duty cycle (ideal)', cv.d, '', `${(cv.d * 100).toFixed(2)} %`, { symbol: 'D', group: g, note: s.topo === 'buck' ? 'Vout/Vin' : s.topo === 'boost' ? '1 − Vin/Vout' : '|Vout|/(Vin + |Vout|)' }),
    item('iLavg', 'Average inductor current', cv.iLavg, 'A', si(cv.iLavg, 'A', 3), { symbol: 'I_L', group: g }),
    item('iPk', 'Peak inductor current', cv.iPk, 'A', si(cv.iPk, 'A', 3), { symbol: 'I_L,pk', group: g }),
    item('outKind', 'Output capacitor current', cv.outKind, '', cv.outKind === 'triangle' ? 'continuous (triangle)' : 'pulsed (steps)', { group: g }),
    item('inKind', 'Input capacitor current', cv.inKind, '', cv.inKind === 'triangle' ? 'continuous (triangle)' : 'pulsed (steps)', { group: g }),
  );
  report.results = results;
  report.summary = `${TOPO[s.topo]} ${si(s.vin, 'V', 3)} → ${s.topo === 'buckboost' ? '−' : ''}${si(s.vout, 'V', 3)} at ${si(s.iout, 'A', 3)}, ${si(s.fsw, 'Hz', 3)} · ΔVout ${si(ro.pp, 'V', 3)} · ΔVin ${si(ri.pp, 'V', 3)}`;
  notes.push(
    'Ideal CCM waveforms (lossless duty cycle, linear inductor current); the capacitors are C_eff + ESR + ESL in series and the ripple is the exact peak-to-peak of their sum.',
    'The simple sum is an upper bound; RSS (quadrature) has no physical basis for these waveforms and can understate the ripple, most of all with pulsed currents.',
    'Measured ESL spikes depend on layout and on the probe and scope bandwidth; use a short ground spring at the capacitor.',
  );
  report.details = { converter: cv, out: ro, in: ri, netOut: capNet(s, 'Out'), netIn: capNet(s, 'In'), state: s };
  report.graphs = graphs(s, cv, ro);
  return report;
}

function noSolution(report: CalcReport, key: string, msg: string): CalcReport {
  report.warnings.push(msg);
  report.status = { text: 'NO SOLUTION', tone: 'fail' };
  report.results.push({ key, label: LABEL[key] ?? key, value: null, display: '—', primary: true, solved: true });
  return report;
}

function waveGraph(id: string, title: string, s: RippleState, cv: Converter, side: 'Out' | 'In'): GraphSpec {
  const w = rippleWave(side === 'Out' ? cv.out : cv.in, cv.T, capNet(s, side));
  return {
    id,
    title,
    subtitle: `${side === 'Out' ? (cv.outKind === 'triangle' ? 'continuous' : 'pulsed') : cv.inKind === 'triangle' ? 'continuous' : 'pulsed'} capacitor current · each part centred on zero`,
    x: { label: 'Time', unit: 's' },
    y: [
      { id: 'v', label: 'Ripple', unit: 'V' },
      { id: 'i', label: 'Capacitor current', unit: 'A', side: 'right' },
    ],
    series: [
      { label: 'i_C', x: w.t, y: w.ic, axis: 'i', color: '#9a8f7a', width: 1, dash: [8, 4] },
      { label: 'C part', x: w.t, y: w.vC, axis: 'v', color: '#2f7d4f', width: 1.4 },
      { label: 'ESR part', x: w.t, y: w.vR, axis: 'v', color: '#c47b17', width: 1.2, dash: [5, 3] },
      { label: 'ESL part', x: w.t, y: w.vL, axis: 'v', color: '#6b5b95', width: 1.6, dash: [1.5, 2.5] },
      { label: 'total', x: w.t, y: w.tot, axis: 'v', color: '#1f4e5f', width: 2.2 },
    ],
    legend: 'below',
  };
}

function graphs(s: RippleState, cv: Converter, ro: Ripple): GraphSpec[] {
  const out = waveGraph('wave-out', 'Output ripple', s, cv, 'Out');
  const inn = waveGraph('wave-in', 'Input ripple', s, cv, 'In');
  const c0 = s.cOut;
  const cs = Array.from({ length: 100 }, (_, k) => (c0 / 10) * 100 ** (k / 99));
  const rs = cs.map((c) => capRipple(cv.out, cv.T, capNet({ ...s, cOut: c }, 'Out')));
  const vsC: GraphSpec = {
    id: 'ripple-vs-c',
    title: 'Output ripple vs C',
    x: { label: 'Capacitance each (rated)', unit: 'F', log: true },
    y: [{ id: 'v', label: 'Output ripple (p-p)', unit: 'V', log: true }],
    series: [
      { label: 'exact', x: cs, y: rs.map((r) => r.pp), width: 2.4, color: '#1f4e5f' },
      { label: 'simple sum', x: cs, y: rs.map((r) => r.sum), color: '#8b1e1e', dash: [5, 3], width: 1.3 },
      { label: 'RSS', x: cs, y: rs.map((r) => r.rss), color: '#9a8f7a', dash: [2, 3], width: 1.3 },
      { label: 'C part', x: cs, y: rs.map((r) => Math.max(r.ppC, 1e-15)), color: '#4f8a8b', width: 1.1 },
      ...(ro.ppEsr > 0 ? [{ label: 'ESR part', x: cs, y: rs.map((r) => r.ppEsr), color: '#c47b17', width: 1.1 }] : []),
      ...(ro.ppEsl > 0 ? [{ label: 'ESL part', x: cs, y: rs.map((r) => r.ppEsl), color: '#6b5b95', width: 1.1 }] : []),
    ],
    vlines: [{ value: c0, label: `C = ${si(c0, 'F', 3)}` }],
    hlines: OUT_SOLVES.includes(s.solveFor) ? [{ value: s.dvOut, label: 'target', color: '#8b1e1e', dash: [5, 4] }] : [],
    markers: [{ x: c0, y: ro.pp, label: si(ro.pp, 'V', 3) }],
  };
  return [out, inn, vsC];
}

export const def: CalcDef<RippleState> = {
  id: 'power/switching-regulator-ripple',
  version: '0.1.0',
  method:
    'Ideal CCM buck, boost and inverting buck-boost (Erickson & Maksimović ch. 2) with the capacitor as C_eff + ESR + ESL: the input and output capacitor currents are piecewise linear (finite current transition time), and the ripple v = q/C + ESR·i + ESL·di/dt is evaluated exactly per piece; the capacitive, ESR and ESL parts match TI SLVA477/SLVA372/SLVA630. C_eff = n·C·(DC-bias retention). C and ESR are solved by root finding on the exact ripple.',
  fields,
  defaults,
  sync: (s: RippleState) => {
    if (s.topo && Number.isFinite(s.vout)) s.voutMem = { ...(s.voutMem ?? {}), [s.topo]: s.vout };
  },
  solve: {
    default: 'dvOut',
    analysis: 'dvOut',
    options: [
      { key: 'dvOut', label: 'Ripple of the entered capacitors (analysis)' },
      { key: 'cOut', label: 'Output capacitance for a target ΔVout' },
      { key: 'esrOut', label: 'Largest output ESR for a target ΔVout' },
      { key: 'cIn', label: 'Input capacitance for a target ΔVin' },
      { key: 'esrIn', label: 'Largest input ESR for a target ΔVin' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: 'Buck 12 V → 3.3 V, 3 A, 500 kHz: 2 × 22 µF MLCC at 60 % (analysis)', state: defaults() },
    {
      id: 'buck-polymer',
      label: 'Buck 12 V → 5 V, 2 A with one 100 µF / 20 mΩ polymer: ESR-dominated',
      state: { solveFor: 'dvOut', topo: 'buck', vin: 12, vout: 5, iout: 2, fsw: 500e3, fswUnit: 'kHz', l: 10e-6, lUnit: 'µH', tr: 10e-9, cOut: 100e-6, cOutUnit: 'µF', nOut: 1, biasOut: 100, esrOut: 20e-3, esrOutUnit: 'mΩ', eslOut: 2e-9, cIn: 10e-6, cInUnit: 'µF', nIn: 2, biasIn: 50, esrIn: 5e-3, esrInUnit: 'mΩ', eslIn: 1e-9 },
    },
    {
      id: 'boost-spikes',
      label: 'Boost 5 V → 12 V, 1 A: ESL spikes on the pulsed output current',
      state: { solveFor: 'dvOut', topo: 'boost', vin: 5, vout: 12, iout: 1, fsw: 1e6, fswUnit: 'MHz', l: 4.7e-6, lUnit: 'µH', tr: 5e-9, cOut: 22e-6, cOutUnit: 'µF', nOut: 2, biasOut: 40, esrOut: 3e-3, esrOutUnit: 'mΩ', eslOut: 1e-9, cIn: 10e-6, cInUnit: 'µF', nIn: 1, biasIn: 70, esrIn: 5e-3, esrInUnit: 'mΩ', eslIn: 1e-9 },
    },
    {
      id: 'cout-10mv',
      label: 'Buck 5 V → 1.2 V, 6 A at 1 MHz: MLCC bank C for 10 mV',
      state: { solveFor: 'cOut', topo: 'buck', vin: 5, vout: 1.2, iout: 6, fsw: 1e6, fswUnit: 'MHz', l: 0.47e-6, lUnit: 'µH', tr: 10e-9, cOutUnit: 'µF', nOut: 4, biasOut: 80, esrOut: 3e-3, esrOutUnit: 'mΩ', eslOut: 0.5e-9, dvOut: 10e-3, cIn: 22e-6, cInUnit: 'µF', nIn: 4, biasIn: 60, esrIn: 3e-3, esrInUnit: 'mΩ', eslIn: 0.3e-9 },
    },
    {
      id: 'bb-esr',
      label: 'Inverting buck-boost 12 V → −12 V, 0.5 A: largest output ESR for 100 mV',
      state: { solveFor: 'esrOut', topo: 'buckboost', vin: 12, vout: 12, iout: 0.5, fsw: 400e3, fswUnit: 'kHz', l: 22e-6, lUnit: 'µH', tr: 20e-9, cOut: 47e-6, cOutUnit: 'µF', nOut: 2, biasOut: 100, esrOutUnit: 'mΩ', eslOut: 1e-9, dvOut: 0.1, cIn: 10e-6, cInUnit: 'µF', nIn: 2, biasIn: 50, esrIn: 5e-3, esrInUnit: 'mΩ', eslIn: 1e-9 },
    },
    {
      id: 'cin-buck',
      label: 'Buck 12 V → 3.3 V, 3 A: input C for 150 mV ripple',
      state: { ...defaults(), solveFor: 'cIn', dvIn: 0.15 },
    },
  ],
};
