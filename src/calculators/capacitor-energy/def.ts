/** Capacitor Energy — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { TIME_UNITS, si } from '@/core/units';
import { U_CAP, U_OHM } from '@/core/unitsets';
import { bankC, bankEsr, charge, energy, holdup, vcAfter, vTerminal, type Holdup } from './model';

export const ID = 'general/capacitor-energy';

export type CapSolve = 'e' | 'c' | 'v';

export interface CapState {
  /** e: energy and hold-up from C and V (analysis) · c / v: the part or voltage for a target */
  solveFor: CapSolve;
  /** Target when solving C or V: the stored energy E, or the hold-up time t_hold */
  target: 'energy' | 'holdup';
  c: number;
  cUnit: string;
  v: number;
  e: number;
  eUnit: string;
  vMin: number;
  pOut: number;
  eta: number;
  esr: number;
  esrUnit: string;
  tHold: number;
  tHoldUnit: string;
  ns: number;
  np: number;
  /** Rated voltage of one cell; null = not checked */
  vRated: number | null;
  /** Time to charge to V (for average current and power); null = not given */
  tCharge: number | null;
  tChargeUnit: string;
}

export const defaults = (): CapState => ({
  solveFor: 'e',
  target: 'holdup',
  c: 470e-6,
  cUnit: 'µF',
  v: 24,
  e: 0.13536,
  eUnit: 'mJ',
  vMin: 18,
  pOut: 5,
  eta: 90,
  esr: 0.05,
  esrUnit: 'mΩ',
  tHold: 10e-3,
  tHoldUnit: 'ms',
  ns: 1,
  np: 1,
  vRated: 35,
  tCharge: 100e-3,
  tChargeUnit: 'ms',
});

// Solved values can reach the field limits: give the core enough prefixes to show them readably.
const U_C = { ...U_CAP, F: 1, kF: 1e3 };
// Only SI prefixes the core can move between (it fits a solved value to a prefix of the unit shown). At the
// field minima (1 µV on 1 fF) E and t_hold fall below 1 fJ / 1 fs and read as "1.5e-9 fJ": the core has no atto
// prefix, and such values are not meant for reading (mode-switch harness: expected 'unreadable').
const U_E: Record<string, number> = { mJ: 1e-3, J: 1, 'µJ': 1e-6, nJ: 1e-9, pJ: 1e-12, fJ: 1e-15, kJ: 1e3, MJ: 1e6, GJ: 1e9, TJ: 1e12 };
const U_T: Record<string, number> = { ...TIME_UNITS, ps: 1e-12, fs: 1e-15, ks: 1e3, Ms: 1e6 };
const U_R = { ...U_OHM, 'µΩ': 1e-6 };

const solvingCV = (s: CapState) => s.solveFor === 'c' || s.solveFor === 'v';
/** Cut-off seen inside the bank and whether a hold-up target can be met by solving C (needs V₁ above it) or V₁. */
function holdupReach(s: CapState): { byC: boolean; byV: boolean } {
  const pIn = s.pOut / (s.eta / 100);
  const rB = bankEsr(s.esr, s.ns, s.np);
  if (!(pIn > 0) || (rB > 0 && s.vMin * s.vMin < pIn * rB)) return { byC: false, byV: false };
  const vcEnd = rB > 0 ? s.vMin + (pIn * rB) / s.vMin : s.vMin;
  return { byC: s.v > vcEnd, byV: true };
}
/** ◎ on C or V₁: keep a hold-up target only when it can be met, else design for the energy (no red error from a click). */
const solveCV = (key: 'c' | 'v') => (_s: unknown, root: Record<string, any>) => {
  root.solveFor = key;
  const reach = holdupReach(root as CapState);
  if (root.target === 'holdup' && (!(root.tHold > 0) || !(key === 'c' ? reach.byC : reach.byV))) root.target = 'energy';
};
const energyTarget = (s: CapState) => solvingCV(s) && s.target === 'energy';
const holdTarget = (s: CapState) => solvingCV(s) && s.target === 'holdup';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Capacitor',
    note: 'Click ◎ to pick the unknown. E and t_hold are computed unless one is the target.',
    fields: [
      { kind: 'number', key: 'c', symbol: 'C', label: 'Capacitance (cell)', units: U_C, unitKey: 'cUnit', solvable: true, min: 1e-15, max: 1e5, onSolve: solveCV('c'), help: 'Capacitance of one capacitor or cell. Use the value at the working voltage and temperature: class-2 ceramics lose much of theirs under DC bias, electrolytics are often −20 %.' },
      { kind: 'number', key: 'v', symbol: 'V₁', label: 'Charged voltage', unit: 'V', solvable: true, min: 1e-6, max: 1e6, onSolve: solveCV('v'), help: 'Voltage across the whole capacitor or bank when fully charged (the start of a hold-up).' },
      {
        kind: 'number', key: 'e', symbol: 'E', label: 'Stored energy', units: U_E, unitKey: 'eUnit', solvable: true, min: 1e-33, max: 1e21, // covers ½·C·V² over the whole C, V, n_s, n_p ranges
        solvedWhen: (_s, root) => !energyTarget(root as CapState),
        onSolve: (_s, root) => (root.solveFor = 'e'),
        onUnsolve: (_s, root) => {
          if (!solvingCV(root as CapState)) root.solveFor = 'c';
          root.target = 'energy';
        },
        help: 'E = ½·C·V₁² of the bank. Click ◎ on the green value to make it a target (then C or V₁ is solved for it).',
      },
      {
        kind: 'select', key: 'target', label: 'Design target', visible: (s) => solvingCV(s as CapState),
        options: [
          { value: 'energy', label: 'Stored energy E' },
          { value: 'holdup', label: 'Hold-up time t_hold' },
        ],
      },
    ],
  },
  {
    kind: 'section',
    title: 'Hold-up (constant-power load)',
    note: 'A DC/DC converter or regulator runs from the capacitor until its input falls to V₂.',
    fields: [
      { kind: 'number', key: 'vMin', symbol: 'V₂', label: 'Minimum voltage', unit: 'V', min: 0, max: 1e6, help: 'Lowest input voltage at which the load still works (converter UVLO or minimum input). Measured at the capacitor terminals, after the ESR drop.' },
      { kind: 'number', key: 'pOut', symbol: 'P', label: 'Load power', unit: 'W', min: 1e-9, max: 1e9, help: 'Power delivered by the converter to its load during the hold-up.' },
      { kind: 'number', key: 'eta', symbol: 'η', label: 'Converter efficiency', suffix: '%', min: 1, max: 100, help: 'The capacitor supplies P/η. Use 100 % when the load itself draws constant power straight from the capacitor.' },
      { kind: 'number', key: 'esr', symbol: 'ESR', label: 'ESR (cell)', units: U_R, unitKey: 'esrUnit', min: 0, max: 1e4, help: 'Equivalent series resistance of one cell, from the datasheet (DC or low-frequency value for a long hold-up). 0 for an ideal capacitor.' },
      {
        kind: 'number', key: 'tHold', symbol: 't_hold', label: 'Hold-up time', units: U_T, unitKey: 'tHoldUnit', solvable: true, min: 0, max: 1e40, // the computed hold-up can be absurdly long at µW loads on large banks
        solvedWhen: (_s, root) => !holdTarget(root as CapState),
        onSolve: (_s, root) => (root.solveFor = 'e'),
        onUnsolve: (_s, root) => {
          // Make the shown hold-up the target: solve C when the charged voltage clears the cut-off. When no hold-up
          // exists here (ESR limit, or V₁ below the cut-off) there is no visible value to target, so the page stays on
          // the analysis, whose warning says why (no hidden leftover target, no red error).
          const st = root as CapState;
          const reach = holdupReach(st);
          if (!solvingCV(st)) {
            if (!reach.byC) return;
            root.solveFor = 'c';
          } else if (!(st.solveFor === 'c' ? reach.byC : reach.byV)) return;
          root.target = 'holdup';
        },
        help: 'Time the load keeps running from V₁ down to V₂. Click ◎ on the green value to make it the target (then C or V₁ is solved for it).',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Bank & charging',
    collapsed: true,
    fields: [
      { kind: 'number', key: 'ns', symbol: 'n_s', label: 'Cells in series', integer: true, min: 1, max: 1000, help: 'Identical cells in series (e.g. supercapacitors): C/n_s, voltage shared n_s ways. Needs balancing in practice.' },
      { kind: 'number', key: 'np', symbol: 'n_p', label: 'Strings in parallel', integer: true, min: 1, max: 1000, help: 'Identical series strings in parallel: capacitance × n_p, ESR ÷ n_p.' },
      { kind: 'number', key: 'vRated', symbol: 'V_R', label: 'Cell rated voltage', unit: 'V', optional: true, zeroHint: 'not checked', min: 1e-3, max: 1e6, help: 'Datasheet rated voltage of one cell. Leave blank to skip the check.' },
      { kind: 'number', key: 'tCharge', symbol: 't_ch', label: 'Charge time', units: U_T, unitKey: 'tChargeUnit', optional: true, zeroHint: 'not given', min: 1e-12, max: 1e9, help: 'Time to charge from 0 V to V₁, for the average charging current and power.' },
    ],
  },
];

const fV = (v: number) => si(v, 'V', 4);
const fE = (e: number) => si(e, 'J', 4);
const fT = (t: number) => (t >= 3600 ? `${(t / 3600).toPrecision(4)} h` : t >= 120 ? `${(t / 60).toPrecision(4)} min` : si(t, 's', 4));
const fin = (name: string, v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
};

export function compute(st: CapState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: CapState): CalcReport {
  const s: CapState = { ...st };
  for (const [k, n] of [['c', 'Capacitance'], ['v', 'Voltage V₁'], ['e', 'Energy'], ['vMin', 'Minimum voltage V₂'], ['pOut', 'Load power'], ['eta', 'Efficiency'], ['esr', 'ESR'], ['tHold', 'Hold-up time'], ['ns', 'Cells in series'], ['np', 'Strings in parallel']] as const) fin(n, s[k]);
  if (!(s.ns >= 1 && Number.isInteger(s.ns)) || !(s.np >= 1 && Number.isInteger(s.np))) throw new Error('Cells in series and strings in parallel must be whole numbers ≥ 1.');
  if (!(s.eta > 0 && s.eta <= 100)) throw new Error('Efficiency must be between 1 and 100 %.');
  if (!(s.pOut > 0)) throw new Error('Load power must be > 0.');
  if (s.esr < 0) throw new Error('ESR must be ≥ 0.');
  if (s.vMin < 0) throw new Error('Minimum voltage must be ≥ 0.');
  const pIn = s.pOut / (s.eta / 100);
  const k = s.np / s.ns; // C_bank = k·C
  const rB = bankEsr(s.esr, s.ns, s.np);
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });

  if (s.solveFor !== 'c' && !(s.c > 0)) throw new Error('Capacitance must be > 0.');
  if (s.solveFor !== 'v' && !(s.v > 0)) throw new Error('Charged voltage V₁ must be > 0.');

  // ── the solved unknown
  if (energyTarget(s)) {
    if (!(s.e > 0)) throw new Error('Enter a target energy E > 0.');
    if (s.solveFor === 'c') s.c = (2 * s.e) / (s.v * s.v) / k;
    else s.v = Math.sqrt((2 * s.e) / (k * s.c));
  } else if (holdTarget(s)) {
    if (!(s.tHold > 0)) throw new Error('Enter a hold-up time t_hold > 0.');
    if (rB > 0 && s.vMin * s.vMin < pIn * rB) return fail(`With ESR ${si(rB, 'Ω', 3)} the capacitor cannot deliver ${si(pIn, 'W', 3)} at V₂ = ${fV(s.vMin)}: it needs V₂² ≥ P·ESR, i.e. V₂ ≥ ${fV(Math.sqrt(pIn * rB))}. Raise V₂, lower the ESR (more cells in parallel) or the power.`);
    if (s.solveFor === 'c') {
      const vcEnd = rB > 0 ? s.vMin + (pIn * rB) / s.vMin : s.vMin;
      if (!(s.v > vcEnd)) return fail(`V₁ = ${fV(s.v)} is not above the cut-off (${fV(vcEnd)} inside the capacitor, V₂ plus the ESR drop): no capacitance gives a hold-up. Raise V₁ or lower V₂.`);
      // t is proportional to C: one forward evaluation gives the exact C
      const per = holdup(1, s.v, s.vMin, pIn, rB)!.t; // seconds per farad of bank capacitance
      s.c = s.tHold / per / k;
    } else {
      // V₁ for the hold-up: t(V₁) increases monotonically from 0 at V_c,end; bisect on the closed form
      const cb = k * s.c;
      const tOf = (v1: number) => holdup(cb, v1, s.vMin, pIn, rB)!.t;
      const vcEnd = rB > 0 ? s.vMin + (pIn * rB) / s.vMin : s.vMin;
      let lo = Math.max(vcEnd, 1e-9);
      let hi = Math.max(2 * lo, 1);
      while (tOf(hi) < s.tHold && hi < 1e7) hi *= 2;
      if (tOf(hi) < s.tHold) return fail('The hold-up needs more than 10 MV: increase C.');
      for (let i = 0; i < 200 && hi - lo > 1e-15 * hi; i++) {
        const m = 0.5 * (lo + hi);
        if (tOf(m) < s.tHold) lo = m;
        else hi = m;
      }
      s.v = 0.5 * (lo + hi);
    }
  }
  const cb = bankC(s.c, s.ns, s.np);
  const E = energy(cb, s.v);
  const Q = charge(cb, s.v);
  s.e = E;
  const hu: Holdup | null = holdup(cb, s.v, s.vMin, pIn, rB);
  const hIdeal = holdup(cb, s.v, s.vMin, pIn, 0)!;
  if (!holdTarget(s) && hu && hu.t > 0) s.tHold = hu.t; // no hold-up: keep the last target time, never write 0

  const warnings: string[] = [];
  const notes: string[] = [];
  const vCell = s.v / s.ns;
  const overRated = s.vRated != null && vCell > s.vRated * (1 + 1e-9);
  if (overRated) warnings.push(`V_cell = ${fV(vCell)} exceeds the rated ${fV(s.vRated!)}: use more cells in series, a higher-rated part, or charge to at most ${fV(s.vRated! * s.ns)}.`);
  else if (s.vRated != null && vCell > 0.9 * s.vRated) notes.push(`The cells run at ${((vCell / s.vRated) * 100).toFixed(0)} % of their rated voltage: derating to about 80 % extends electrolytic and supercapacitor life.`);
  if (!hu) warnings.push(`ESR limit: at V₂ = ${fV(s.vMin)} the capacitor cannot deliver ${si(pIn, 'W', 3)} through ${si(rB, 'Ω', 3)} (needs V₂ ≥ ${fV(Math.sqrt(pIn * rB))}). The load drops out earlier, near the maximum-power point. Lower the ESR or raise V₂.`);
  else if (hu.t === 0) warnings.push(`No hold-up: V₁ = ${fV(s.v)} is not above the cut-off ${fV(hu.vcEnd)} (V₂ plus the ESR drop at the end). Charge higher or lower V₂.`);
  if (hu && hu.t > 0 && hu.eEsr > 0.1 * hu.eCap) warnings.push(`The ESR wastes ${((hu.eEsr / hu.eCap) * 100).toFixed(0)} % of the released energy and drops ${fV(hu.i2 * rB)} at the end: parallel more cells or pick a lower-ESR part.`);
  if (s.ns > 1) notes.push(`${s.ns} cells in series: balance resistors or an active balancer keep each cell below its rating; the page assumes equal sharing.`);
  if (s.vMin === 0) notes.push('V₂ = 0: the whole stored energy is used. Real converters stop well above 0 V.');

  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  if (s.solveFor === 'c') results.push(item('c', s.ns * s.np > 1 ? 'Capacitance per cell' : 'Capacitance', s.c, 'F', si(s.c, 'F', 4), { symbol: 'C', primary: true, solved: true, note: s.ns * s.np > 1 ? `bank ${si(cb, 'F', 4)}` : `for ${s.target === 'energy' ? `E = ${fE(s.e)}` : `t_hold = ${fT(s.tHold)}`}` }));
  if (s.solveFor === 'v') results.push(item('v', 'Charged voltage', s.v, 'V', fV(s.v), { symbol: 'V₁', primary: true, solved: true, note: `for ${s.target === 'energy' ? `E = ${fE(s.e)}` : `t_hold = ${fT(s.tHold)}`}`, tone: overRated ? 'fail' : '' }));
  results.push(item('e', 'Stored energy', E, 'J', fE(E), { symbol: 'E', primary: true, solved: !energyTarget(s), note: `½·C·V₁² at ${fV(s.v)}` }));
  results.push(item('tHold', 'Hold-up time', hu && hu.t > 0 ? hu.t : null, 's', hu ? (hu.t > 0 ? fT(hu.t) : '0 (V₁ below the cut-off)') : '— (ESR limit)', { symbol: 't_hold', primary: true, solved: !holdTarget(s), tone: !hu || hu.t === 0 ? 'warn' : '', note: `${fV(s.v)} → ${fV(s.vMin)} at ${si(s.pOut, 'W', 3)}${s.eta < 100 ? ` / ${s.eta} %` : ''}` }));
  results.push(item('q', 'Stored charge', Q, 'C', si(Q, 'C', 4), { symbol: 'Q', primary: true, note: 'C·V₁' }));

  const usable = 0.5 * cb * (s.v * s.v - s.vMin * s.vMin);
  const g1 = 'Energy';
  results.push(
    item('cBank', 'Bank capacitance', cb, 'F', si(cb, 'F', 4), { symbol: 'C_bank', group: g1, note: s.ns * s.np > 1 ? `${s.np} × ${si(s.c, 'F', 3)} / ${s.ns}` : 'single part' }),
    item('eUsable', 'Energy between V₁ and V₂', usable, 'J', fE(usable), { symbol: 'ΔE', group: g1, note: `${(Math.max(usable / E, 0) * 100).toFixed(1)} % of E: 1 − (V₂/V₁)²` }),
    item('eMin', 'Energy left at V₂', energy(cb, s.vMin), 'J', fE(energy(cb, s.vMin)), { symbol: 'E₂', group: g1 }),
    item('eDensityQ', 'Energy per coulomb', E / Q, 'V', fV(E / Q), { group: g1, note: 'E/Q = V₁/2' }),
  );
  const g2 = 'Hold-up';
  results.push(
    item('pIn', 'Power drawn from C', pIn, 'W', si(pIn, 'W', 4), { symbol: 'P/η', group: g2 }),
    item('tIdeal', 'Hold-up, ideal (no ESR)', hIdeal.t, 's', fT(hIdeal.t), { group: g2, note: 'C·(V₁² − V₂²)/(2P/η)' }),
  );
  if (hu && hu.t > 0) {
    const drop = hu.i2 * rB;
    results.push(
      item('i1', 'Current at start', hu.i1, 'A', si(hu.i1, 'A', 4), { symbol: 'I₁', group: g2 }),
      item('i2', 'Current at cut-off (peak)', Number.isFinite(hu.i2) ? hu.i2 : null, 'A', Number.isFinite(hu.i2) ? si(hu.i2, 'A', 4) : 'unbounded (V₂ = 0)', { symbol: 'I₂', group: g2, note: 'constant power: the current rises as V falls' }),
      item('dropEsr', 'ESR drop at cut-off', Number.isFinite(drop) ? drop : null, 'V', Number.isFinite(drop) ? fV(drop) : '—', { symbol: 'I₂·ESR', group: g2, tone: rB > 0 && drop > 0.1 * s.vMin ? 'warn' : '' }),
      item('eEsr', 'Energy lost in ESR', hu.eEsr, 'J', fE(hu.eEsr), { symbol: 'E_ESR', group: g2 }),
      item('eLoad', 'Energy to the load', hu.eLoad * (s.eta / 100), 'J', fE(hu.eLoad * (s.eta / 100)), { group: g2, note: 'P·t_hold' }),
    );
  }
  const g3 = 'Bank & charging';
  results.push(
    item('vCell', 'Voltage per cell', vCell, 'V', fV(vCell), { symbol: 'V_cell', group: g3, tone: overRated ? 'fail' : '', note: s.vRated != null ? `rated ${fV(s.vRated)}` : undefined }),
    item('esrBank', 'Bank ESR', rB, 'Ω', si(rB, 'Ω', 4), { symbol: 'ESR_bank', group: g3 }),
    item('iShort', 'Peak current into a short', rB > 0 ? s.v / rB : null, 'A', rB > 0 ? si(s.v / rB, 'A', 4) : '— (ESR = 0)', { symbol: 'V₁/ESR', group: g3, note: 'upper bound; wiring inductance and resistance reduce it' }),
  );
  if (s.tCharge != null && s.tCharge > 0) {
    results.push(
      item('iCharge', 'Average charging current', Q / s.tCharge, 'A', si(Q / s.tCharge, 'A', 4), { symbol: 'I_avg', group: g3, note: 'Q/t_ch (constant current)' }),
      item('pCharge', 'Average charging power', E / s.tCharge, 'W', si(E / s.tCharge, 'W', 4), { symbol: 'P_avg', group: g3, note: 'E/t_ch into the capacitor' }),
    );
  }

  notes.push('Charging from 0 V through a resistor from a fixed voltage V₁ dissipates another ½·C·V₁² in the resistor, whatever its value; constant-current or switched-mode chargers avoid most of that loss.');
  notes.push('Hold-up assumes a constant-power load cut off at V₂ (measured at the capacitor terminals), a constant capacitance and ESR, and no leakage.');

  const tones = !hu || hu.t === 0;
  return {
    ...emptyReport(ID),
    ok: true,
    solveFor: s.solveFor,
    status: overRated ? { text: 'OVER RATED VOLTAGE', tone: 'fail' } : undefined,
    results,
    graphs: graphs(s, cb, pIn, rB, hu),
    warnings,
    notes,
    summary: `${si(cb, 'F', 4)} at ${fV(s.v)}: E = ${fE(E)}${tones ? '' : ` · ${fT(hu!.t)} of hold-up at ${si(s.pOut, 'W', 3)} to ${fV(s.vMin)}`}`,
    details: { state: s, cBank: cb, pIn, esrBank: rB, holdup: hu, holdupIdeal: hIdeal },
  };
}

function graphs(s: CapState, cb: number, pIn: number, rB: number, hu: Holdup | null): GraphSpec[] {
  const vTop = Math.max(s.v * 1.25, s.vRated != null ? s.vRated * s.ns * 1.05 : 0);
  const N = 200;
  const vs = Array.from({ length: N + 1 }, (_, i) => (vTop * i) / N);
  const eGraph: GraphSpec = {
    id: 'energy',
    title: 'Stored energy vs voltage',
    subtitle: 'E = ½·C·V² · the band between V₂ and V₁ is the hold-up energy',
    x: { label: 'Voltage', unit: 'V' },
    y: [{ id: 'e', label: 'Energy', unit: 'J', includeZero: true }],
    series: [{ label: 'E(V)', x: vs, y: vs.map((v) => energy(cb, v)), axis: 'e', width: 2.2, color: '#1f4e5f' }],
    vlines: [
      { value: s.v, label: `V₁ = ${fV(s.v)}`, color: '#c47b17' },
      { value: s.vMin, label: `V₂ = ${fV(s.vMin)}`, color: '#9a8f7a', dash: [4, 3] },
      ...(s.vRated != null ? [{ value: s.vRated * s.ns, label: `rated ${fV(s.vRated * s.ns)}`, color: '#8b1e1e', dash: [5, 4] }] : []),
    ],
    markers: [{ x: s.v, y: energy(cb, s.v), axis: 'e', label: `E = ${fE(energy(cb, s.v))}`, color: '#c47b17' }],
  };
  const out: GraphSpec[] = [eGraph];
  if (hu && hu.t > 0) {
    const M = 200;
    const ts = Array.from({ length: M + 1 }, (_, i) => (hu.t * i) / M);
    const vc = ts.map((t) => vcAfter(cb, s.v, pIn, rB, t));
    const vt = vc.map((v) => vTerminal(v, pIn, rB));
    out.push({
      id: 'holdup',
      title: 'Hold-up discharge at constant power',
      subtitle: `${si(s.pOut, 'W', 3)} load · capacitor voltage and the converter’s input`,
      x: { label: 'Time', unit: 's' },
      y: [
        { id: 'v', label: 'Voltage', unit: 'V', includeZero: true },
        { id: 'i', label: 'Current', unit: 'A', side: 'right', includeZero: true },
      ],
      series: [
        { label: 'v_C (internal)', x: ts, y: vc, axis: 'v', width: 2.2, color: '#1f4e5f' },
        ...(rB > 0 ? [{ label: 'v at terminals', x: ts, y: vt, axis: 'v', width: 1.6, color: '#4f8a8b', dash: [5, 3] }] : []),
        // the current is unbounded at V₂ = 0 (constant power into 0 V): drawn only for a non-zero cut-off
        ...(s.vMin > 0 ? [{ label: 'i(t)', x: ts, y: vt.map((v) => pIn / v), axis: 'i', width: 1.3, color: '#c47b17', dash: [2, 3] }] : []),
      ],
      hlines: [{ value: s.vMin, label: `V₂ = ${fV(s.vMin)}`, axis: 'v', color: '#8b1e1e', dash: [5, 4] }],
      markers: [{ x: hu.t, y: s.vMin, axis: 'v', label: `t_hold = ${fT(hu.t)}`, color: '#c47b17' }],
      legend: 'below',
    });
  }
  return out;
}

const EX_DEFAULT = defaults();

export const def: CalcDef<CapState> = {
  id: ID,
  version: '0.1.0',
  method: 'E = ½CV², Q = CV (Alexander & Sadiku, Fundamentals of Electric Circuits, §6.2); hold-up of a constant-power load solved in closed form from i = (v − √(v² − 4·ESR·P))/(2·ESR), reducing to t = C(V₁² − V₂²)/(2P) for ESR = 0. C for a hold-up target is exact (t ∝ C); V₁ is found by bisection of the same closed form.',
  fields,
  defaults,
  solve: {
    default: 'e',
    analysis: 'e',
    options: [
      { key: 'e', label: 'Energy and hold-up from C and V₁' },
      { key: 'c', label: 'C for a target (E, or t_hold)' },
      { key: 'v', label: 'V₁ for a target (E, or t_hold)' },
    ],
  },
  compute,
  examples: [
    { id: 'bulk', label: '24 V bulk cap: 470 µF hold-up for a 5 W load down to 18 V', state: { ...EX_DEFAULT } },
    { id: 'sadiku-6-1', label: 'Alexander & Sadiku ex. 6.1: 3 pF at 20 V → 60 pC, 600 pJ', state: { ...EX_DEFAULT, solveFor: 'e', c: 3e-12, cUnit: 'pF', v: 20, eUnit: 'pJ', vMin: 0, pOut: 1e-3, eta: 100, esr: 0, ns: 1, np: 1, vRated: null, tCharge: null, tHoldUnit: 'ms' } },
    { id: 'sadiku-pp-6-1', label: 'A&S practice 6.1: 4.5 µF storing 1.6 mJ → V = 26.67 V (Q = 0.12 mC)', state: { ...EX_DEFAULT, solveFor: 'v', target: 'energy', c: 4.5e-6, cUnit: 'µF', e: 1.6e-3, eUnit: 'mJ', vMin: 0, pOut: 1, eta: 100, esr: 0, ns: 1, np: 1, vRated: null, tCharge: null } },
    { id: 'supercap', label: 'Supercap hold-up: C per cell for 1 W over 10 s, 2 cells in series (2.7 V), 5 → 2 V boost', state: { ...EX_DEFAULT, solveFor: 'c', target: 'holdup', c: 10, cUnit: 'F', v: 5, eUnit: 'J', vMin: 2, pOut: 1, eta: 85, esr: 0.03, esrUnit: 'mΩ', tHold: 10, tHoldUnit: 's', ns: 2, np: 1, vRated: 2.7, tCharge: 60, tChargeUnit: 's' } },
    { id: 'flash', label: 'Photoflash: C for 10 J at 300 V', state: { ...EX_DEFAULT, solveFor: 'c', target: 'energy', c: 220e-6, cUnit: 'µF', v: 300, e: 10, eUnit: 'J', vMin: 50, pOut: 1000, eta: 100, esr: 0.5, esrUnit: 'Ω', ns: 1, np: 1, vRated: 330, tCharge: 3, tChargeUnit: 's' } },
    { id: 'esr-limit', label: 'Edge case: ESR too high for 20 W at 3 V', state: { ...EX_DEFAULT, solveFor: 'e', c: 1, cUnit: 'F', v: 5, eUnit: 'J', vMin: 3, pOut: 20, eta: 100, esr: 0.5, esrUnit: 'Ω', ns: 1, np: 1, vRated: 5.5, tCharge: null } },
  ],
};
