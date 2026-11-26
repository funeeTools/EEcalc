/** Crystal load capacitance (Pierce oscillator) — calculator definition. DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_OHM, withDefault } from '@/core/unitsets';
import { type CapPair, bestPairs, c2For, driveLevel, equalFor, gmCrit, loadCap, loadRatio, pulling, sensitivity } from './model';

export const ID = 'general/crystal-load-capacitance';

export type XtalSolve = 'cload' | 'cl1' | 'cl2';

export interface XtalState {
  solveFor: XtalSolve;
  preset: string;
  f: number;
  fUnit: string;
  /** Load capacitance the crystal is specified at */
  cl: number;
  clUnit: string;
  c0: number;
  c0Unit: string;
  /** Motional capacitance; null = not known (no pulling figures) */
  cm: number | null;
  cmUnit: string;
  esr: number;
  esrUnit: string;
  /** Crystal initial tolerance, ± ppm (judges the pulling) */
  ftol: number;
  cl1: number;
  cl1Unit: string;
  cl2: number;
  cl2Unit: string;
  equal: boolean;
  cs: number;
  csUnit: string;
  /** Circuit load capacitance (always computed) */
  cload: number;
  cloadUnit: string;
  eseries: string;
  /** Oscillator transconductance (or the data sheet's maximum critical g_m) */
  gm: number;
  /** What gm is: the oscillator's G_m (margin ≥ 5) or the data sheet's maximum critical crystal gm (margin ≥ 1) */
  gmKind: 'gm' | 'gmCritMax';
  vpp: number | null;
  dlMax: number | null;
}

interface Preset {
  f: number;
  cl: number;
  c0: number;
  cm: number | null;
  esr: number;
  ftol: number;
  dlMax: number | null;
}

/**
 * AN826 Table 1–2 example crystal (C₀ 4.5 pF, C₁ 0.018 pF, ESR 100 Ω max). Abracon ABS07 (rev. 08-10-22):
 * ±20 ppm, C₀ 2.0 pF max, ESR 70 kΩ max (−40…85 °C), drive level 0.5 µW max; no motional C given.
 */
export const PRESETS: Record<string, Preset | null> = {
  'AN826 example: 8 MHz, C_L 13 pF': { f: 8e6, cl: 13e-12, c0: 4.5e-12, cm: 18e-15, esr: 100, ftol: 30, dlMax: null },
  'Abracon ABS07: 32.768 kHz, C_L 12.5 pF': { f: 32768, cl: 12.5e-12, c0: 2e-12, cm: null, esr: 70e3, ftol: 20, dlMax: 0.5e-6 },
  Custom: null,
};
const PKEYS = ['f', 'cl', 'c0', 'cm', 'esr', 'ftol', 'dlMax'] as const;

export const defaults = (): XtalState => ({
  solveFor: 'cl1',
  preset: 'AN826 example: 8 MHz, C_L 13 pF',
  f: 8e6,
  fUnit: 'MHz',
  cl: 13e-12,
  clUnit: 'pF',
  c0: 4.5e-12,
  c0Unit: 'pF',
  cm: 18e-15,
  cmUnit: 'fF',
  esr: 100,
  esrUnit: 'Ω',
  ftol: 30,
  cl1: 16e-12,
  cl1Unit: 'pF',
  cl2: 16e-12,
  cl2Unit: 'pF',
  equal: true,
  cs: 5e-12,
  csUnit: 'pF',
  cload: 13e-12,
  cloadUnit: 'pF',
  eseries: 'E12',
  gm: 5e-3,
  gmKind: 'gm',
  vpp: null,
  dlMax: null,
});

const U_C = withDefault(U_CAP, 'pF');
const U_CM = withDefault(U_CAP, 'fF');
const U_F = { ...withDefault(U_FREQ, 'MHz') };
const U_R = withDefault(U_OHM, 'Ω');

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Crystal',
    fields: [
      {
        kind: 'select',
        key: 'preset',
        label: 'Crystal',
        options: Object.keys(PRESETS),
        apply: (v, s) => {
          const p = PRESETS[v];
          if (!p) return;
          for (const k of PKEYS) (s as any)[k] = p[k];
          s.fUnit = p.f < 1e6 ? 'kHz' : 'MHz';
          s.esrUnit = p.esr >= 1e3 ? 'kΩ' : 'Ω';
        },
        help: 'Fills the crystal data. AN826 is Microchip’s worked example crystal (its rounded L₁/C₁ put f_s at 7 997 837 Hz, 244 ppm from the 7 995 889 Hz that C₁, C₀ and 8 MHz at 13 pF imply; this page uses the latter); ABS07 values are data-sheet maxima (C₀, ESR), with no motional capacitance given.',
      },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_F, unitKey: 'fUnit', unitFamily: 'none', min: 1e3, max: 300e6, help: 'Nominal frequency, i.e. the load-resonance frequency at the specified C_L.' },
      { kind: 'number', key: 'cl', symbol: 'C_L', label: 'Specified load', units: U_C, unitKey: 'clUnit', min: 1e-12, max: 100e-12, help: 'The load capacitance the crystal is calibrated at (data sheet / part number: 6, 7, 9, 12.5, 18, 20 pF …). The circuit should present exactly this.' },
      { kind: 'number', key: 'c0', symbol: 'C₀', label: 'Shunt capacitance', units: U_C, unitKey: 'c0Unit', min: 0.1e-12, max: 50e-12, help: 'Electrode and holder capacitance (data sheet, often a maximum): 1–2 pF for 32 kHz tuning forks, 3–7 pF for MHz crystals. Use the maximum: AN2867 computes g_m,crit with the worst-case C₀.' },
      { kind: 'number', key: 'cm', symbol: 'C_m', label: 'Motional capacitance', units: U_CM, unitKey: 'cmUnit', optional: true, zeroHint: 'not known', min: 0.01e-15, max: 1e-12, help: 'C₁ of the equivalent circuit (a few fF). Rarely in the data sheet: ask the maker or measure it. Without it the frequency pulling is not computed.' },
      { kind: 'number', key: 'esr', symbol: 'ESR', label: 'Series resistance', units: U_R, unitKey: 'esrUnit', min: 1, max: 1e6, help: 'Maximum ESR from the data sheet: 30–100 Ω for MHz crystals, 35–90 kΩ for 32.768 kHz.' },
      { kind: 'number', key: 'ftol', symbol: 'Δf/f', label: 'Crystal tolerance', suffix: 'ppm', min: 0, max: 1000, help: 'Initial (calibration) tolerance, ±ppm. The table judges each capacitor pair’s pulling against it.' },
    ],
  },
  {
    kind: 'section',
    title: 'Load capacitors',
    note: 'Click ◎ on C_L1 or C_L2 to size the capacitors for the specified load.',
    fields: [
      { kind: 'number', key: 'cload', symbol: 'C_L,circ', label: 'Circuit load', units: U_C, unitKey: 'cloadUnit', output: true, min: 0, max: 1e-6, help: 'What the crystal sees: C_L1·C_L2/(C_L1 + C_L2) + C_s. In analysis it is calculated from the capacitors; when solving it equals the specified C_L.' },
      { kind: 'number', key: 'cl1', symbol: 'C_L1', label: 'XIN capacitor', units: U_C, unitKey: 'cl1Unit', solvable: true, min: 0.1e-12, max: 10e-9, onUnsolve: (_s, r) => (r.solveFor = 'cload'), help: 'Capacitor from the oscillator input (XIN / OSC_IN) to ground. With “equal” on, both capacitors take this value.' },
      { kind: 'toggle', key: 'equal', label: 'Equal capacitors', on: 'C_L1 = C_L2', off: 'separate', apply: (v, _s, r) => {
        // equal on: the pair is one unknown (C_L1); off again: C_L2 for the entered C_L1 gives the same values (2x each)
        if (v && r.solveFor === 'cl2') r.solveFor = 'cl1';
        else if (!v && r.solveFor === 'cl1') r.solveFor = 'cl2';
      } },
      { kind: 'number', key: 'cl2', symbol: 'C_L2', label: 'XOUT capacitor', units: U_C, unitKey: 'cl2Unit', solvable: true, min: 0.1e-12, max: 10e-9, visible: (_s, r) => !r.equal, onUnsolve: (_s, r) => (r.solveFor = 'cload'), help: 'Capacitor from the oscillator output (XOUT / OSC_OUT) to ground. A larger C_L2 than C_L1 lowers the drive level a little.' },
      { kind: 'number', key: 'cs', symbol: 'C_s', label: 'Stray capacitance', units: U_C, unitKey: 'csUnit', min: 0, max: 50e-12, help: 'Pin capacitance of both oscillator pins in series plus PCB traces, as it appears across the crystal: typically 2–5 pF (AN826); see the MCU data sheet for the pin capacitance.' },
      { kind: 'select', key: 'eseries', label: 'Capacitor values', options: ['E6', 'E12', 'E24'], help: 'IEC 60063 series for the standard-value search (C0G/NP0 capacitors come in E12 and often E24).' },
    ],
  },
  {
    kind: 'section',
    title: 'Oscillator',
    fields: [
      {
        kind: 'select',
        key: 'gmKind',
        label: 'MCU data sheet gives',
        options: [
          { value: 'gm', label: 'Oscillator G_m (margin ≥ 5)' },
          { value: 'gmCritMax', label: 'Max crystal g_m,crit (≥ 1)' },
        ],
        help: 'Older MCU data sheets give the oscillator transconductance G_m: AN2867 asks for G_m ≥ 5 × g_m,crit. Newer ones give the largest crystal g_m,crit the oscillator supports (it already includes the margin): the crystal’s g_m,crit must simply stay below it.',
      },
      { kind: 'number', key: 'gm', symbol: 'G_m', label: 'Oscillator gm', unit: 'A/V', min: 1e-9, max: 1, help: 'The value from the MCU data sheet, as chosen above (HSE/LSE “Gm” or “Gm_crit_max”).' },
      { kind: 'number', key: 'vpp', symbol: 'V_pp', label: 'Swing at XIN', unit: 'V', optional: true, zeroHint: 'not measured', min: 0, max: 10, help: 'Peak-to-peak voltage measured at the C_L1 pin with a low-capacitance probe. Gives the drive level.' },
      { kind: 'number', key: 'dlMax', symbol: 'DL_max', label: 'Max drive level', unit: 'W', optional: true, zeroHint: 'not set', min: 1e-9, max: 0.1, help: 'Crystal’s maximum drive level from its data sheet (e.g. 0.5 µW for ABS07, 100–300 µW for MHz crystals).' },
    ],
  },
];

const fC = (c: number, d = 4) => si(c, 'F', d);
const ppmStr = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 1e6).toFixed(d)} ppm`;

function fail(msg: string, s: XtalState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

export function compute(st: XtalState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: XtalState): CalcReport {
  const s: XtalState = { ...st };
  for (const k of ['f', 'cl', 'c0', 'esr', 'ftol', 'cl1', 'cl2', 'cs', 'gm'] as const) {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (!(s.f > 0 && s.cl > 0 && s.c0 > 0 && s.esr > 0 && s.gm > 0)) throw new Error('Frequency, C_L, C₀, ESR and G_m must be > 0.');
  if (s.cs < 0) throw new Error('Stray capacitance must be ≥ 0.');
  if (s.cm != null && !(s.cm > 0)) throw new Error('C_m must be > 0 (leave it blank if unknown).');
  if (s.equal && s.solveFor === 'cl2') s.solveFor = 'cl1';
  const x = s.cl - s.cs;

  // ── solve: the series-capacitor equation has exact inverses.
  // Mode-switch harness notes: (1) a ◎ on C_L1/C_L2 when the stray alone already exceeds the specified C_L is
  // reported as an error on purpose (no capacitor can lower the load; §5a: ◎ clicks report their own errors).
  // (2) "roundtrip" flags from the analysis examples are expected: solving targets the crystal's specified C_L,
  // not the circuit load the entered capacitors happen to give, so a mismatched design solves to different caps.
  switch (s.solveFor) {
    case 'cload':
      break;
    case 'cl1': {
      if (!(x > 0)) return fail(`The stray capacitance (${fC(s.cs, 3)}) already reaches the specified load (${fC(s.cl, 3)}): no external capacitors can lower it. Choose a crystal with a larger C_L, or reduce the stray.`, s);
      const v = s.equal ? equalFor(s.cl, s.cs) : c2For(s.cl, s.cl2, s.cs);
      if (!Number.isFinite(v)) return fail(`C_L2 = ${fC(s.cl2, 3)} is too small: with C_L1 → ∞ the load only reaches ${fC(s.cl2 + s.cs, 3)}. Raise C_L2 above ${fC(x, 3)}.`, s);
      if (v < 0.1e-12 || v > 10e-9) return fail(`This needs C_L1 = ${fC(v, 3)}, outside 0.1 pF … 10 nF. Change C_L2.`, s);
      s.cl1 = v;
      break;
    }
    case 'cl2': {
      if (!(x > 0)) return fail(`The stray capacitance (${fC(s.cs, 3)}) already reaches the specified load (${fC(s.cl, 3)}). Choose a crystal with a larger C_L, or reduce the stray.`, s);
      const v = c2For(s.cl, s.cl1, s.cs);
      if (!Number.isFinite(v)) return fail(`C_L1 = ${fC(s.cl1, 3)} is too small: with C_L2 → ∞ the load only reaches ${fC(s.cl1 + s.cs, 3)}. Raise C_L1 above ${fC(x, 3)}.`, s);
      if (v < 0.1e-12 || v > 10e-9) return fail(`This needs C_L2 = ${fC(v, 3)}, outside 0.1 pF … 10 nF. Change C_L1.`, s);
      s.cl2 = v;
      break;
    }
    default:
      throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }
  if (s.equal) s.cl2 = s.cl1;
  const cload = loadCap(s.cl1, s.cl2, s.cs);
  s.cload = cload;
  const dcl = cload - s.cl;
  const cm = s.cm;
  const pull = cm != null ? pulling(cm, s.c0, s.cl, cload) : null;
  const fs = cm != null ? s.f / loadRatio(cm, s.c0, s.cl) : null;
  const gmc = gmCrit(s.esr, s.f, s.c0, cload);
  const gmcSpec = gmCrit(s.esr, s.f, s.c0, s.cl);
  const margin = s.gm / gmc;
  const solved = s.solveFor;
  const report: CalcReport = { ...emptyReport(ID), solveFor: solved };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const tol = s.ftol * 1e-6;
  // same thresholds as the pair table: yellow above a quarter of the crystal tolerance, red above half
  const pullTone = pull == null ? '' : tol > 0 && Math.abs(pull) > tol / 2 ? 'fail' : tol > 0 && Math.abs(pull) > tol / 4 ? 'warn' : '';
  const need = s.gmKind === 'gmCritMax' ? 1 : 5;

  // ── headline
  const primary: ResultItem[] = [];
  if (solved === 'cload') primary.push(item('cload', 'Circuit load capacitance', cload, 'F', fC(cload), { symbol: 'C_L,circ', solved: true, primary: true, note: `${dcl >= 0 ? '+' : '−'}${fC(Math.abs(dcl), 3)} vs specified ${fC(s.cl, 3)}` }));
  else {
    primary.push(item(solved, solved === 'cl1' ? (s.equal ? 'Load capacitors (each)' : 'XIN capacitor') : 'XOUT capacitor', s[solved], 'F', fC(s[solved]), { symbol: solved === 'cl1' ? (s.equal ? 'C_L1 = C_L2' : 'C_L1') : 'C_L2', solved: true, primary: true, note: `for C_L = ${fC(s.cl, 3)} with C_s = ${fC(s.cs, 3)}` }));
    // the circuit load equals the specification here; keep the input box in step with it
    report.results.push(item('cload', 'Circuit load capacitance', cload, 'F', fC(cload), { symbol: 'C_L,circ', solved: true, group: 'Load' }));
  }
  const pairs = bestPairs(s.eseries, s.cl, s.cs, cm, s.c0);
  const best: CapPair | undefined = pairs[0];
  if (best) primary.push(item('pairBest', `Best ${s.eseries} pair`, best.cl, 'F', best.c1 === best.c2 ? `2 × ${fC(best.c1, 3)}` : `${fC(best.c1, 3)} + ${fC(best.c2, 3)}`, { primary: true, note: `C_L ${fC(best.cl, 3)}${best.ppm != null ? ` · ${ppmStr(best.ppm)}` : ''}` }));
  primary.push(
    item('pull', 'Frequency offset', pull, 'ppm', pull != null ? ppmStr(pull, 2) : 'needs C_m', { symbol: 'Δf/f', primary: true, tone: pullTone, note: pull != null ? `${dcl >= 0 ? '+' : '−'}${fC(Math.abs(dcl), 3)} load error · ${si((pull ?? 0) * s.f, 'Hz', 3)}` : 'enter the motional capacitance' }),
    item('gainMargin', 'Gain margin', margin, '', margin.toFixed(1), { symbol: 'G_m/g_m,crit', primary: true, tone: margin < 1 ? 'fail' : margin < need ? 'warn' : 'pass', note: `g_m,crit ${si(gmc, 'A/V', 3)} · aim ≥ ${need}` }),
  );

  // ── grouped results
  const rest: ResultItem[] = [
    item('cser', 'Series of C_L1, C_L2', cload - s.cs, 'F', fC(cload - s.cs), { group: 'Load', note: 'C_L1·C_L2/(C_L1 + C_L2)' }),
    item('dcl', 'Load error', dcl, 'F', `${dcl >= 0 ? '+' : '−'}${fC(Math.abs(dcl), 3)}`, { symbol: 'ΔC_L', group: 'Load', note: `${((dcl / s.cl) * 100).toFixed(1)} % of C_L` }),
    item('cEqual', 'Equal caps for C_L', x > 0 ? equalFor(s.cl, s.cs) : null, 'F', x > 0 ? fC(equalFor(s.cl, s.cs)) : 'not possible', { group: 'Load', note: '2(C_L − C_s)' }),
  ];
  if (cm != null && fs != null && pull != null) {
    const sens = sensitivity(cm, s.c0, cload);
    rest.push(
      item('fs', 'Series resonance', fs, 'Hz', si(fs, 'Hz', 8), { symbol: 'f_s', group: 'Pulling', note: `${ppmStr(s.f / fs - 1)} below f` }),
      item('fa', 'Anti-resonance', fs * loadRatio(cm, s.c0, 0), 'Hz', si(fs * loadRatio(cm, s.c0, 0), 'Hz', 8), { symbol: 'f_a', group: 'Pulling', note: 'f_s·√(1 + C_m/C₀)' }),
      item('fAct', 'Running frequency', s.f * (1 + pull), 'Hz', si(s.f * (1 + pull), 'Hz', 9), { symbol: 'f_L', group: 'Pulling', note: `${si(pull * s.f, 'Hz', 3)} from nominal` }),
      item('sens', 'Trim sensitivity', sens * 1e-12, 'ppm/pF', `${(sens * 1e-12 * 1e6).toFixed(2)} ppm/pF`, { symbol: 'S', group: 'Pulling', note: `at C_L = ${fC(cload, 3)}` }),
    );
  }
  rest.push(
    item('gmc', 'Critical gm', gmc, 'A/V', si(gmc, 'A/V', 3), { symbol: 'g_m,crit', group: 'Oscillator', note: '4·ESR·(2πf)²·(C₀ + C_L)²' }),
    item('gmcSpec', 'Critical gm at specified C_L', gmcSpec, 'A/V', si(gmcSpec, 'A/V', 3), { group: 'Oscillator' }),
    item('rneg', 'Required negative resistance', 5 * s.esr, 'Ω', `≥ ${si(5 * s.esr, 'Ω', 3)}`, { symbol: '|R_neg|', group: 'Oscillator', note: '5 × ESR (industry rule of thumb)' }),
  );
  let dl: number | null = null;
  if (s.vpp != null && s.vpp > 0) {
    dl = driveLevel(s.esr, s.f, s.cl1 + s.cs / 2, s.vpp);
    rest.push(item('dl', 'Drive level', dl, 'W', si(dl, 'W', 3), { symbol: 'DL', group: 'Oscillator', tone: s.dlMax != null && dl > s.dlMax ? 'fail' : '', note: `C_tot = C_L1 + C_s/2 = ${fC(s.cl1 + s.cs / 2, 3)}` }));
  }
  report.results = [...primary, ...report.results, ...rest];
  if (pairs.length) report.tables.push(pairTable(s, pairs, tol));

  // ── verdict, warnings, notes
  report.status = margin < 1 ? { text: 'MAY NOT START', tone: 'fail' } : margin < need ? { text: 'LOW GAIN MARGIN', tone: 'warn' } : undefined;
  if (margin < need) warnings.push(`${s.gmKind === 'gm' ? `Gain margin ${margin.toFixed(1)} is below 5 (ST AN2867)` : `The crystal’s g_m,crit (${si(gmc, 'A/V', 3)}) exceeds the oscillator’s maximum (${si(s.gm, 'A/V', 3)})`}: start-up is not guaranteed over temperature and parts. Use a crystal with lower ESR or a smaller C_L, or an oscillator with higher drive (G_m).`);
  if (pull != null && pullTone === 'fail') warnings.push(`The load error pulls the frequency ${ppmStr(pull, 1)}, more than half the crystal’s ±${s.ftol} ppm tolerance. Adjust C_L1/C_L2 (best pair in the table) or measure the stray capacitance.`);
  if (x <= 0) warnings.push(`The stray capacitance ${fC(s.cs, 3)} is at least the specified load ${fC(s.cl, 3)}: the crystal will run slow whatever capacitors you fit. Use a crystal with a larger C_L.`);
  if (dl != null && s.dlMax != null && dl > s.dlMax) warnings.push(`Drive level ${si(dl, 'W', 3)} exceeds the crystal’s ${si(s.dlMax, 'W', 3)}: overdriving ages and can crack tuning forks. Add a series resistor at XOUT or choose a lower-drive oscillator setting.`);
  if (s.cl1 + s.cs / 2 > 0 && Math.min(s.cl1, s.cl2) < 2e-12) notes.push('Load capacitors below about 2 pF are comparable to the pin and trace capacitance: the result depends on the layout. Measure the frequency on the board.');
  if (cm == null) notes.push('Without the motional capacitance C_m the frequency pulling cannot be computed: ask the crystal maker for C₁ (or C_m), or measure the offset on the board.');
  notes.push('C_s is everything in parallel with the crystal besides C_L1, C_L2: the two pin capacitances in series plus the trace capacitance. If the crystal runs slow, the true stray is larger than assumed.');

  report.summary = `${si(s.f, 'Hz', 6)} crystal, C_L ${fC(s.cl, 3)} · circuit ${fC(cload, 4)} (${fC(s.cl1, 3)} / ${fC(s.cl2, 3)} + ${fC(s.cs, 2)} stray)${pull != null ? ` · ${ppmStr(pull, 1)}` : ''}`;
  report.details = { cload, dcl, pull, fs, gmCrit: gmc, margin, pairs, dl };
  report.graphs = graphs(s, cload, pull, gmc, margin);
  return report;
}

function pairTable(s: XtalState, pairs: CapPair[], tol: number): TableSpec {
  const withPpm = pairs[0]?.ppm != null;
  const rows = pairs.map((p) => ({ c1: p.c1, c2: p.c2, cl: p.cl, dcl: p.dcl, ppm: p.ppm != null ? p.ppm * 1e6 : null }));
  return {
    id: 'pairs',
    title: `${s.eseries} capacitor pairs for C_L = ${si(s.cl, 'F', 3)}`,
    columns: [
      { key: 'c1', label: 'C_L1', unit: 'F' },
      { key: 'c2', label: 'C_L2', unit: 'F' },
      { key: 'cl', label: 'C_L,circ', unit: 'F' },
      { key: 'dcl', label: 'ΔC_L', unit: 'F' },
      ...(withPpm ? [{ key: 'ppm', label: 'Offset', unit: 'ppm' }] : []),
    ],
    rows,
    rowTones: withPpm && tol > 0 ? rows.map((r) => (Math.abs(r.ppm! * 1e-6) > tol / 2 ? 'fail' : Math.abs(r.ppm! * 1e-6) > tol / 4 ? 'warn' : 'pass')) : undefined,
    display: rows.map((r) => ({
      c1: si(r.c1, 'F', 3),
      c2: si(r.c2, 'F', 3),
      cl: si(r.cl, 'F', 4),
      dcl: `${r.dcl >= 0 ? '+' : '−'}${si(Math.abs(r.dcl), 'F', 3)}`,
      ppm: r.ppm != null ? `${r.ppm >= 0 ? '+' : '−'}${Math.abs(r.ppm).toFixed(2)}` : '',
    })),
    note: withPpm && tol > 0 ? `Sorted by load error. Green: offset within a quarter of the ±${s.ftol} ppm crystal tolerance; yellow up to half; red beyond (the pulling then eats most of the tolerance budget).` : 'Sorted by load error. Enter C_m (and the crystal tolerance) to see the frequency offset of each pair.',
  };
}

function graphs(s: XtalState, cload: number, pull: number | null, gmc: number, margin: number): GraphSpec[] {
  const lo = Math.max(s.cl * 0.4, 0.5e-12);
  const hi = s.cl * 2.2;
  const cs = Array.from({ length: 141 }, (_, i) => lo + ((hi - lo) * i) / 140);
  if (cload > lo && cload < hi) cs.push(cload), cs.sort((a, b) => a - b);
  const pF = (c: number) => c * 1e12;
  const out: GraphSpec[] = [];
  if (s.cm != null && pull != null) {
    const cm = s.cm;
    out.push({
      id: 'pulling',
      title: 'Offset vs load',
      subtitle: `C_m ${si(cm, 'F', 3)}, C₀ ${si(s.c0, 'F', 3)}`,
      x: { label: 'Circuit load capacitance C_L,circ', unit: 'pF' },
      y: [{ id: 'p', label: 'Frequency offset', unit: 'ppm' }],
      series: [{ label: 'Δf/f', x: cs.map(pF), y: cs.map((c) => pulling(cm, s.c0, s.cl, c) * 1e6), axis: 'p', width: 2.2 }],
      hlines: s.ftol > 0 ? [{ value: s.ftol, label: `+${s.ftol} ppm`, axis: 'p', color: '#8b1e1e', dash: [4, 4], width: 1 }, { value: -s.ftol, label: `−${s.ftol} ppm`, axis: 'p', color: '#8b1e1e', dash: [4, 4], width: 1 }] : [],
      vlines: [{ value: pF(s.cl), label: `spec ${si(s.cl, 'F', 3)}`, color: '#9a8f7a', dash: [3, 3] }],
      markers: [{ x: pF(cload), y: pull * 1e6, axis: 'p', label: `${(pull * 1e6).toFixed(1)} ppm` }],
    });
  }
  out.push({
    id: 'gain-margin',
    title: 'Gain margin vs load',
    subtitle: `G_m ${si(s.gm, 'A/V', 3)}, ESR ${si(s.esr, 'Ω', 3)}`,
    x: { label: 'Load capacitance C_L', unit: 'pF' },
    y: [{ id: 'g', label: 'Gain margin G_m/g_m,crit', unit: '', log: true }],
    series: [{ label: 'Gain margin', x: cs.map(pF), y: cs.map((c) => s.gm / gmCrit(s.esr, s.f, s.c0, c)), axis: 'g', width: 2.2 }],
    hlines: [{ value: s.gmKind === 'gmCritMax' ? 1 : 5, label: s.gmKind === 'gmCritMax' ? 'minimum 1' : 'minimum 5', axis: 'g', color: '#8b1e1e', dash: [4, 4], width: 1.2 }],
    markers: [{ x: pF(cload), y: margin, axis: 'g', label: margin.toFixed(1) }],
  });
  void gmc;
  return out;
}

export const def: CalcDef<XtalState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Pierce load C_L = C_L1·C_L2/(C_L1 + C_L2) + C_s with exact inverses (Microchip AN826); frequency pulling from the Butterworth–Van Dyke model f_L = f_s√(1 + C_m/(C₀ + C_L)) (first order as AN826); critical transconductance g_m,crit = 4·ESR·(2πf)²(C₀ + C_L)², gain margin ≥ 5 and drive level ESR(πfC_totV_pp)²/2 (ST AN2867); IEC 60063 capacitor pair search.',
  fields,
  defaults,
  solve: {
    default: 'cl1',
    analysis: 'cload',
    options: [
      { key: 'cload', label: 'Circuit load from the capacitors (analysis)' },
      { key: 'cl1', label: 'C_L1 (or both) for the specified C_L' },
      { key: 'cl2', label: 'C_L2 for the specified C_L' },
    ],
  },
  compute,
  sync: (s) => {
    if (s.equal) s.cl2 = s.cl1;
    const p = PRESETS[s.preset];
    if (!p) return;
    const differs = PKEYS.some((k) => {
      const a = p[k];
      const b = s[k];
      if (a == null || b == null) return a !== b;
      return Math.abs(a - b) > 1e-9 * Math.abs(a);
    });
    if (differs) s.preset = 'Custom';
  },
  examples: [
    { id: 'default', label: 'AN826 8 MHz crystal, C_L 13 pF, 5 pF stray (solve the caps)', state: defaults() },
    { id: 'abs07', label: '32.768 kHz ABS07, C_L 12.5 pF on an MCU (gain margin)', state: { ...defaults(), preset: 'Abracon ABS07: 32.768 kHz, C_L 12.5 pF', f: 32768, fUnit: 'kHz', cl: 12.5e-12, c0: 2e-12, cm: null, esr: 70e3, esrUnit: 'kΩ', ftol: 20, dlMax: 0.5e-6, cs: 3e-12, gm: 10e-6, solveFor: 'cl1', equal: true, eseries: 'E12' } },
    { id: 'mismatch', label: '22 pF caps on a 12.5 pF crystal: running fast or slow?', state: { ...defaults(), solveFor: 'cload', cl: 12.5e-12, cl1: 22e-12, cl2: 22e-12, equal: true, cs: 4e-12, eseries: 'E12' } },
    { id: 'unequal', label: 'Unequal caps: C_L2 for C_L1 = 15 pF (E24)', state: { ...defaults(), solveFor: 'cl2', equal: false, cl1: 15e-12, cl: 13e-12, cs: 5e-12, eseries: 'E24' } },
    { id: 'low-gm', label: 'High-ESR 8 MHz crystal on a weak oscillator: start-up risk', state: { ...defaults(), solveFor: 'cl1', esr: 150, cl: 20e-12, c0: 7e-12, gm: 1e-3, cs: 5e-12, vpp: 1.5, dlMax: 100e-6 } },
  ],
};
