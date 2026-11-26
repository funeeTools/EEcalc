/** LDO thermal — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { type LdoInputs, ldoPower, maxIout, maxTa, maxVin, voutActual } from './model';

/**
 * Typical θJA on a JEDEC high-K (2s2p, JESD51-7) test board, natural convection, rounded. Representative
 * of current manufacturer datasheets; TI SLVA118A fig. 5 shows how wide the spread is (e.g. SOIC-8
 * 97–178 °C/W, TO-263 23–38 °C/W). Always use the datasheet value — the board dominates.
 */
export const PACKAGES: Record<string, number | null> = {
  Custom: null,
  'SC-70-5 (≈ 280 °C/W)': 280,
  'SOT-23-5 (≈ 200 °C/W)': 200,
  'MSOP-8 (≈ 180 °C/W)': 180,
  'SOIC-8 (≈ 120 °C/W)': 120,
  'DFN/WSON 2×2 pad (≈ 70 °C/W)': 70,
  'SOT-223 (≈ 60 °C/W)': 60,
  'MSOP-8 PowerPAD (≈ 60 °C/W)': 60,
  'DFN/WSON 3×3 pad (≈ 50 °C/W)': 50,
  'TO-220, no heatsink (≈ 50 °C/W)': 50,
  'TO-252 DPAK (≈ 40 °C/W)': 40,
  'TO-263 D²PAK (≈ 30 °C/W)': 30,
};

export type LdoSolve = 'tj' | 'iout' | 'ta' | 'vin' | 'thetaJA';

export interface LdoState {
  solveFor: LdoSolve;
  vin: number;
  vout: number;
  iout: number;
  ignd: number;
  vdo: number;
  iRated: number;
  pkg: string;
  thetaJA: number;
  ta: number;
  tj: number;
  tjMax: number;
}

export const defaults = (): LdoState => ({
  solveFor: 'tj',
  vin: 5,
  vout: 3.3,
  iout: 0.5,
  ignd: 1e-3,
  vdo: 0.3,
  iRated: 1,
  pkg: 'SOT-223 (≈ 60 °C/W)',
  thetaJA: 60,
  ta: 50,
  tj: 100,
  tjMax: 125,
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Electrical',
    fields: [
      { kind: 'number', key: 'vin', symbol: 'V_in', label: 'Input voltage', unit: 'V', solvable: true, min: 0.1, max: 1000, help: 'Use the highest input voltage for the thermal check (SLVA118 applies + tolerance).' },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output voltage', unit: 'V', min: 0, max: 1000 },
      { kind: 'number', key: 'iout', symbol: 'I_out', label: 'Load current', unit: 'A', solvable: true, min: 0, max: 100, help: 'Steady-state (average) load current. Short pulses heat the junction less; see the theory notes.' },
      { kind: 'number', key: 'ignd', symbol: 'I_GND', label: 'Ground current', unit: 'A', min: 0, max: 1, help: 'Quiescent / ground-pin current at this load. Roughly constant for PMOS LDOs; for PNP/NPN-pass regulators it grows with load (see the datasheet curve).' },
      { kind: 'number', key: 'vdo', symbol: 'V_DO', label: 'Dropout voltage', unit: 'V', min: 0, max: 10, help: 'Datasheet dropout at this load and temperature (often specified at full load, worst at hot). 0 = skip the check.' },
      { kind: 'number', key: 'iRated', symbol: 'I_rated', label: 'Rated output current', unit: 'A', min: 0, max: 100, zeroHint: 'not set', help: 'The regulator’s rated continuous output current, for the check and graphs. 0 = not set.' },
    ],
  },
  {
    kind: 'section',
    title: 'Thermal',
    note: 'Presets are typical JEDEC high-K board values; your board’s copper area dominates.',
    fields: [
      {
        kind: 'select',
        key: 'pkg',
        label: 'Package preset',
        options: Object.keys(PACKAGES),
        apply: (v, s) => {
          const t = PACKAGES[v];
          if (t == null) return;
          s.thetaJA = t;
          // θJA is the unknown: picking a package means "how hot does this package run?", so go back to
          // analysis instead of overwriting the chosen θJA with the solved one (the select would bounce to Custom).
          if (s.solveFor === 'thetaJA') s.solveFor = 'tj';
        },
        help: 'Fills θJA with a rounded typical value measured on the JEDEC JESD51-7 high-K (4-layer) test board in still air. A real board with little copper can be 1.5–3× worse; a large ground plane or thermal vias can be better. Use the number from your regulator’s datasheet whenever you can.',
      },
      { kind: 'number', key: 'thetaJA', symbol: 'θ_JA', label: 'Junction–ambient', suffix: '°C/W', solvable: true, min: 0.1, max: 2000 },
      { kind: 'number', key: 'ta', symbol: 'T_A', label: 'Ambient temperature', suffix: '°C', solvable: true, min: -273, max: 500, help: 'Air temperature around the board (inside the enclosure), not the room.' },
      { kind: 'number', key: 'tj', symbol: 'T_J', label: 'Junction temperature', suffix: '°C', solvable: true, min: -273, max: 1e9 /* covers every analysed Tj (up to 1 kV × 100 A × 2000 °C/W) */, help: 'Calculated in analysis. When solving for another quantity this is the target junction temperature to design to (a derated value below the maximum rating, SLVA118 §7.3).' },
      { kind: 'number', key: 'tjMax', symbol: 'T_J,max', label: 'Max junction rating', suffix: '°C', min: -273, max: 500, help: 'Absolute-maximum or recommended operating junction temperature from the datasheet (often 125 °C or 150 °C). Thermal shutdown is typically near 150–165 °C.' },
    ],
  },
];

const toInputs = (s: LdoState): LdoInputs => ({ vin: s.vin, vout: s.vout, iout: s.iout, ignd: s.ignd, thetaJA: s.thetaJA, ta: s.ta, vdo: s.vdo });

/**
 * Solve ranges equal the input fields' limits, so a solved value is always one the form accepts.
 * A solve does not always land on the target Tj: Iout is clipped to the rated current, and a quantity that is
 * not thermally limiting (or has no solution) is shown as "> limit", "∞" or "—" while the state keeps the last
 * number. From such a state, solving for another unknown does not give back the box's value; that is
 * expected (the mode-switch harness reports it as a round-trip flag).
 */
const SOLVE: Record<Exclude<LdoSolve, 'tj'>, { lo: (s: LdoState) => number; hi: (s: LdoState) => number; log: boolean; label: string; fmt: (x: number) => string }> = {
  iout: { lo: () => 0, hi: () => 100, log: false, label: 'Maximum load current', fmt: (x) => si(x, 'A', 3) },
  ta: { lo: () => -273, hi: () => 500, log: false, label: 'Maximum ambient', fmt: (x) => `${x.toFixed(0)} °C` },
  vin: { lo: (s) => Math.max(s.vout, 0.1), hi: () => 1000, log: false, label: 'Maximum input voltage', fmt: (x) => si(x, 'V', 3) },
  thetaJA: { lo: () => 0.1, hi: () => 2000, log: true, label: 'Maximum θJA', fmt: (x) => `${x} °C/W` },
};

const degC = (t: number, d = 1) => `${t.toFixed(d)} °C`;
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

export function compute(st: LdoState): CalcReport {
  for (const k of ['vin', 'vout', 'iout', 'ignd', 'vdo', 'iRated', 'thetaJA', 'ta', 'tj', 'tjMax'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  const s: LdoState = { ...st };
  if (s.solveFor !== 'vin' && !(s.vin > s.vout)) throw new Error(`Vin (${si(s.vin, 'V', 3)}) must be above Vout (${si(s.vout, 'V', 3)}) for a linear regulator.`);
  if (!(s.vout >= 0)) throw new Error('Vout must be ≥ 0.');
  if (s.solveFor !== 'iout' && !(s.iout >= 0)) throw new Error('Load current must be ≥ 0.');
  if (s.solveFor !== 'thetaJA' && !(s.thetaJA > 0)) throw new Error('θJA must be > 0.');
  if (s.ignd < 0 || s.vdo < 0 || s.iRated < 0) throw new Error('Ground current, dropout and rated current must be ≥ 0.');
  // Tj = Ta is reachable from analysis (no load, no ground current), so only a target below the ambient is an input error.
  if (s.solveFor !== 'tj' && s.solveFor !== 'ta' && s.tj < s.ta - 1e-9 * Math.max(1, Math.abs(s.ta))) throw new Error(`The target Tj (${degC(s.tj)}) must be above the ambient (${degC(s.ta)}) — a regulator that dissipates power runs hotter than its surroundings.`);

  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'power/ldo-thermal', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  // ── solve (one forward model Tj(x), numeric inversion)
  if (s.solveFor !== 'tj') {
    const key = s.solveFor;
    const o = SOLVE[key];
    const g = (x: number) => ldoPower(toInputs({ ...s, [key]: x })).tj;
    const lo = o.lo(s);
    const hi = o.hi(s);
    const gLo = g(lo);
    const gHi = g(hi);
    const stop = (why: string, display: string, status: CalcReport['status']) => {
      report.warnings.push(why);
      report.status = status;
      report.results.push({ key, label: o.label, value: null, display, primary: true, solved: true });
      return report;
    };
    // With no load and no ground current nothing is dissipated: Vin and θJA cannot change Tj.
    const pd = ldoPower(toInputs(s)).pd;
    if ((key === 'vin' && !(s.iout + s.ignd > 0)) || (key === 'thetaJA' && !(pd > 0)))
      return stop(`With ${key === 'vin' ? 'no load or ground current' : 'zero dissipation'} the regulator dissipates nothing, so Tj stays at the ambient for any ${key === 'vin' ? 'input voltage' : 'θJA'}: it is not limiting (∞).`, '∞', { text: 'NOT LIMITING', tone: 'pass' });
    // Tj rises with every unknown, so check both ends of the range before root finding.
    if (gLo > s.tj + 1e-12 * Math.max(1, Math.abs(s.tj))) {
      const atZero = ldoPower(toInputs({ ...s, iout: 0 }));
      if (key === 'iout') return stop(`With no load the ground current alone (Vin·I_GND = ${si(atZero.pGnd, 'W', 3)}) already gives Tj = ${degC(atZero.tj)}, above the ${degC(s.tj)} target. Lower Vin, θJA or the ambient.`, '—', { text: 'NO SOLUTION', tone: 'fail' });
      if (key === 'vin') return stop(`Even at Vin = ${si(lo, 'V', 3)} the regulator dissipates enough for Tj = ${degC(gLo)}, above the ${degC(s.tj)} target; no input voltage works. Lower the load, θJA or the ambient.`, '—', { text: 'NO SOLUTION', tone: 'fail' });
      if (key === 'thetaJA') return stop(`Even θJA = ${o.fmt(lo)} gives Tj = ${degC(gLo)}: Pd = ${si(ldoPower(toInputs(s)).pd, 'W', 3)} needs a heatsink or a lower dissipation.`, '< 0.1 °C/W', { text: 'NO SOLUTION', tone: 'fail' });
      return stop(`No ambient in the input range meets Tj = ${degC(s.tj)}.`, '—', { text: 'NO SOLUTION', tone: 'fail' });
    }
    let limitNote = '';
    if (gHi < s.tj) {
      // The thermal limit lies beyond the input range: the quantity is not thermally limiting.
      if (key === 'iout' && s.iRated > 0) {
        s.iout = s.iRated;
        limitNote = `rated current limits; thermally > ${o.fmt(hi)}`;
      } else {
        return stop(`Not thermally limiting: even at ${o.fmt(hi)} (the input limit) Tj is only ${degC(gHi)}, below the ${degC(s.tj)} target.`, `> ${o.fmt(hi)}`, { text: 'NOT LIMITING', tone: 'pass' });
      }
    } else if (Math.abs(gLo - s.tj) <= 1e-12 * Math.max(1, Math.abs(s.tj))) {
      // the target is met exactly at the bottom of the range (e.g. Tj = Ta with no load: I_out = 0)
      s[key] = lo;
      if (key === 'iout') limitNote = 'thermal limit';
    } else {
      const r = invert(g, s.tj, { lo, hi, log: o.log, samples: 40 });
      if (!r.ok) return stop(`No ${key === 'thetaJA' ? 'θJA' : o.label.toLowerCase()} meets Tj = ${degC(s.tj)} (closest Tj ${degC(r.closestValue)}).`, '—', { text: 'NO SOLUTION', tone: 'fail' });
      s[key] = r.roots[0];
      if (key === 'iout') {
        if (s.iRated > 0 && s.iout > s.iRated) {
          limitNote = `rated current limits; thermal limit ${si(s.iout, 'A', 3)}`;
          s.iout = s.iRated;
        } else limitNote = `thermal limit${s.iRated > 0 ? ` · rated ${si(s.iRated, 'A', 3)}` : ''}`;
      }
    }
    if (limitNote) report.notes.push(`Maximum load current: ${limitNote}.`);
  }

  const inp = toInputs(s);
  const o = ldoPower(inp);
  if (s.solveFor === 'tj') s.tj = o.tj;
  const headroom = s.tjMax - o.tj;
  const vinMinDo = s.vout + s.vdo;
  const iMaxThermal = s.vin > voutActual(inp) ? maxIout(inp, s.tjMax) : Infinity;
  const taMax = maxTa(inp, s.tjMax);
  const vinMaxThermal = s.iout + s.ignd > 0 ? maxVin({ ...inp, vdo: 0 }, s.tjMax) : Infinity;
  const thetaNeeded = o.pd > 0 ? (s.tjMax - s.ta) / o.pd : Infinity;
  const pdMax = (s.tjMax - s.ta) / s.thetaJA;

  // ── checks
  const overTemp = o.tj > s.tjMax + 1e-9;
  const dropout = s.vdo > 0 && s.vin - s.vout < s.vdo - 1e-12;
  const overCurrent = s.iRated > 0 && s.iout > s.iRated * (1 + 1e-12);
  if (overTemp) warnings.push(`Tj = ${degC(o.tj)} exceeds the ${degC(s.tjMax)} rating by ${degC(-headroom)}. Reduce Vin − Vout (pre-regulate, or drop voltage in a series resistor), use a package or board with lower θJA, or switch to a switching regulator.`);
  else if (s.solveFor === 'tj' && headroom < 10) warnings.push(`Only ${degC(headroom)} of margin to Tj,max; θJA tolerance and board differences easily take that. Aim for 10–25 °C margin.`);
  if (dropout) warnings.push(`Vin − Vout = ${si(s.vin - s.vout, 'V', 3)} is below the ${si(s.vdo, 'V', 3)} dropout: the regulator is out of regulation and Vout follows Vin − V_DO ≈ ${si(voutActual(inp), 'V', 3)} (dissipation and efficiency use that). Vin must be at least ${si(vinMinDo, 'V', 3)}.`);
  if (overCurrent) warnings.push(`I_out = ${si(s.iout, 'A', 3)} exceeds the regulator’s ${si(s.iRated, 'A', 3)} rating; choose a higher-current part.`);
  if (s.solveFor === 'tj' && o.tj > 150) warnings.push('Above about 150–165 °C most LDOs enter thermal shutdown and cycle on and off.');
  if (s.solveFor !== 'tj' && s.tj > s.tjMax) warnings.push(`The target Tj (${degC(s.tj)}) is above the ${degC(s.tjMax)} rating.`);
  if (o.pGnd > 0.1 * o.pd && o.pd > 0) notes.push(`Ground-current loss is ${pct(o.pGnd / o.pd)} of the total — significant, so check whether I_GND grows with load for this part.`);
  if (s.thetaJA < 15) notes.push('θJA below ~15 °C/W normally implies a heatsink; use the heatsink calculator to build it from θJC + θCS + θSA.');

  // Pass/fail verdict on the operating point. When solving, Tj is the user's own target, so only the
  // independent checks (dropout, rated current, target above the rating) can fail.
  const analysis = s.solveFor === 'tj';
  if (overTemp) report.status = { text: 'TOO HOT', tone: 'fail' };
  else if (dropout) report.status = { text: 'DROPOUT', tone: 'fail' };
  else if (overCurrent) report.status = { text: 'OVER RATED I', tone: 'fail' };
  else if (analysis) report.status = headroom < 10 ? { text: 'MARGINAL', tone: 'warn' } : { text: 'PASS', tone: 'pass' };

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const solved = s.solveFor;
  const reached = Math.abs(o.tj - s.tj) < 1e-6;
  if (solved === 'iout') results.push(item('iout', 'Maximum load current', s.iout, 'A', si(s.iout, 'A', 4), { symbol: 'I_out', solved: true, primary: true, note: reached ? `for Tj = ${degC(s.tj)} · thermal limit` : `rated current limits (Tj ${degC(o.tj)} < target)` }));
  if (solved === 'ta') results.push(item('ta', 'Maximum ambient', s.ta, '°C', degC(s.ta), { symbol: 'T_A', solved: true, primary: true, note: `for Tj = ${degC(s.tj)}` }));
  if (solved === 'vin') results.push(item('vin', 'Maximum input voltage', s.vin, 'V', si(s.vin, 'V', 4), { symbol: 'V_in', solved: true, primary: true, note: `for Tj = ${degC(s.tj)} · dropout needs ≥ ${si(vinMinDo, 'V', 3)}`, tone: dropout ? 'fail' : '' }));
  if (solved === 'thetaJA') results.push(item('thetaJA', 'Maximum θJA', s.thetaJA, '°C/W', `${s.thetaJA.toPrecision(4)} °C/W`, { symbol: 'θ_JA', solved: true, primary: true, note: `for Tj = ${degC(s.tj)} (SLVA118 eq. 7)` }));
  results.push(
    item('tj', 'Junction temperature', o.tj, '°C', degC(o.tj), { symbol: 'T_J', solved: solved === 'tj', primary: true, tone: overTemp ? 'fail' : analysis && headroom < 10 ? 'warn' : '', note: solved === 'tj' ? `rise ${degC(o.tj - s.ta)} over ambient` : reached ? 'target' : `target ${degC(s.tj)} not reached` }),
    item('pd', 'Power dissipation', o.pd, 'W', si(o.pd, 'W', 4), { symbol: 'P_D', primary: true, note: `max ${si(Math.max(pdMax, 0), 'W', 3)} at Tj,max` }),
    item('headroom', 'Margin to Tj,max', headroom, '°C', degC(headroom), { symbol: 'ΔT', primary: true, tone: overTemp ? 'fail' : !analysis ? '' : headroom < 10 ? 'warn' : 'pass', note: `Tj,max ${degC(s.tjMax, 0)}` }),
    item('eff', 'Efficiency', o.eff, '', pct(o.eff), { symbol: 'η', primary: true, note: `Vout/Vin = ${pct(s.vout / s.vin)}` }),
  );
  const gP = 'Power';
  results.push(
    item('pLoad', 'Pass-element loss', o.pLoad, 'W', si(o.pLoad, 'W', 3), { symbol: 'P_pass', group: gP }),
    item('pGnd', 'Ground-current loss', o.pGnd, 'W', si(o.pGnd, 'W', 3), { symbol: 'P_Q', group: gP }),
    item('pout', 'Output power', o.pout, 'W', si(o.pout, 'W', 3), { symbol: 'P_out', group: gP }),
    item('iin', 'Input current', o.iin, 'A', si(o.iin, 'A', 3), { symbol: 'I_in', group: gP }),
    item('vHead', 'Input–output difference', s.vin - s.vout, 'V', si(s.vin - s.vout, 'V', 3), { symbol: 'V_hdrm', group: gP, tone: dropout ? 'fail' : '', note: s.vdo > 0 ? `dropout ${si(s.vdo, 'V', 3)}${dropout ? ' — IN DROPOUT' : ''}` : '' }),
  );
  const gL = `Limits at Tj,max = ${degC(s.tjMax, 0)}`;
  results.push(
    item('iMax', 'Max load current', iMaxThermal, 'A', iMaxThermal > 0 ? si(iMaxThermal, 'A', 3) : 'none (ground current alone too hot)', { group: gL, tone: iMaxThermal < s.iout ? 'fail' : '', note: s.iRated > 0 ? `rated ${si(s.iRated, 'A', 3)}` : '' }),
    item('taMax', 'Max ambient', taMax, '°C', degC(taMax), { group: gL }),
    item('vinMax', 'Max input voltage (thermal)', vinMaxThermal, 'V', Number.isFinite(vinMaxThermal) ? si(vinMaxThermal, 'V', 3) : '∞', { group: gL }),
    item('vinMin', 'Min input voltage (dropout)', vinMinDo, 'V', si(vinMinDo, 'V', 3), { group: gL, note: 'Vout + V_DO' }),
    item('thetaNeeded', 'Max θJA for this load', thetaNeeded, '°C/W', Number.isFinite(thetaNeeded) ? `${thetaNeeded.toPrecision(4)} °C/W` : '∞', { group: gL, note: 'SLVA118 eq. 7' }),
  );
  report.results = results;
  report.summary = `${si(s.vin, 'V', 3)} → ${si(s.vout, 'V', 3)} at ${si(s.iout, 'A', 3)} · θJA ${s.thetaJA.toPrecision(3)} °C/W · Ta ${degC(s.ta, 0)} · usable Vin ${si(vinMinDo, 'V', 3)}–${Number.isFinite(vinMaxThermal) ? si(vinMaxThermal, 'V', 3) : '∞'}`;
  notes.push(
    'Steady state, one thermal resistance from junction to ambient. θJA is a property of the package on a specific test board (JESD51), not of the package alone.',
    'Pulsed loads: the thermal time constant of a board-mounted package is seconds to minutes, so use the average dissipation for loads that change faster than that (SLVA118 §3).',
    'Dropout, ground current and θJA all vary with temperature and from part to part; use worst-case datasheet values for a final check.',
  );
  report.details = { ...o, iMaxThermal, taMax, vinMaxThermal, thetaNeeded, pdMax, vinMinDropout: vinMinDo };
  report.graphs = graphs(s, inp, o.tj);
  return report;
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

function graphs(s: LdoState, inp: LdoInputs, tj: number): GraphSpec[] {
  const iMax = s.vin > s.vout ? maxIout(inp, s.tjMax) : 0;
  const iTop = Math.max(s.iout * 1.5, Number.isFinite(iMax) && iMax > 0 ? iMax * 1.2 : 0, s.iRated, 1e-3);
  const is = linspace(0, iTop, 121);
  const limits = [{ value: s.tjMax, label: `Tj,max ${s.tjMax.toFixed(0)} °C`, axis: 't', color: '#8b1e1e', dash: [6, 4] }];
  if (s.solveFor !== 'tj') limits.push({ value: s.tj, label: `target ${s.tj.toFixed(0)} °C`, axis: 't', color: '#c47b17', dash: [3, 3] });
  const vlI = [{ value: s.iout, label: `Iout ${si(s.iout, 'A', 3)}` } as { value: number; label: string; color?: string; dash?: number[] }];
  if (iMax > 0 && iMax < iTop) vlI.push({ value: iMax, label: `thermal limit ${si(iMax, 'A', 3)}`, color: '#8b1e1e', dash: [3, 3] });
  if (s.iRated > 0 && s.iRated <= iTop) vlI.push({ value: s.iRated, label: `rated ${si(s.iRated, 'A', 3)}`, color: '#6b5b95', dash: [2, 3] });
  const tjVsI: GraphSpec = {
    id: 'tj-vs-iout',
    title: 'Tj vs load current',
    x: { label: 'Load current', unit: 'A' },
    y: [
      { id: 't', label: 'Junction temperature', unit: '°C' },
      { id: 'p', label: 'Dissipation', unit: 'W', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'Tj', x: is, y: is.map((i) => ldoPower({ ...inp, iout: i }).tj), axis: 't', width: 2.2 },
      { label: 'Pd', x: is, y: is.map((i) => ldoPower({ ...inp, iout: i }).pd), axis: 'p', color: '#4f8a8b', width: 1.2, dash: [5, 3] },
    ],
    hlines: limits,
    vlines: vlI,
    markers: [{ x: s.iout, y: tj, axis: 't', label: `${tj.toFixed(1)} °C` }],
  };

  // Derating: maximum load current vs ambient
  const taLo = Math.min(-40, s.ta - 10);
  const taHi = s.tjMax;
  const tas = linspace(taLo, taHi, 121);
  const imaxs = tas.map((t) => Math.max(maxIout({ ...inp, ta: t }, s.tjMax), 0));
  const derating: GraphSpec = {
    id: 'derating',
    title: 'Max current vs ambient',
    x: { label: 'Ambient temperature', unit: '°C' },
    y: [{ id: 'i', label: 'Max load current', unit: 'A', includeZero: true }],
    series: [
      { label: `I_max at Tj,max ${s.tjMax.toFixed(0)} °C`, x: tas, y: s.iRated > 0 ? imaxs.map((v) => Math.min(v, s.iRated)) : imaxs, axis: 'i', width: 2.2 },
      ...(s.solveFor !== 'tj' ? [{ label: `I_max at target ${s.tj.toFixed(0)} °C`, x: tas, y: tas.map((t) => Math.min(Math.max(maxIout({ ...inp, ta: t }, s.tj), 0), s.iRated > 0 ? s.iRated : Infinity)), axis: 'i', color: '#c47b17', width: 1.4, dash: [5, 3] }] : []),
    ],
    hlines: [{ value: s.iout, label: `Iout ${si(s.iout, 'A', 3)}`, axis: 'i', color: '#9a8f7a', dash: [3, 3] }, ...(s.iRated > 0 ? [{ value: s.iRated, label: `rated ${si(s.iRated, 'A', 3)}`, axis: 'i', color: '#6b5b95', dash: [2, 3] }] : [])],
    vlines: [{ value: s.ta, label: `Ta ${s.ta.toFixed(0)} °C` }],
    subtitle: s.iRated > 0 ? 'Clipped at the rated current' : undefined,
  };

  // Tj and efficiency vs input voltage
  const vLo = s.vout + Math.max(s.vdo, 0);
  const vHi = Math.max(s.vin * 1.6, vLo + 2, maxVin(inp, s.tjMax) * 1.1 > vLo ? Math.min(maxVin(inp, s.tjMax) * 1.1, s.vin * 4) : 0);
  const vs = linspace(vLo, vHi, 121);
  const vinGraph: GraphSpec = {
    id: 'tj-vs-vin',
    title: 'Tj & efficiency vs Vin',
    x: { label: 'Input voltage', unit: 'V' },
    y: [
      { id: 't', label: 'Junction temperature', unit: '°C' },
      { id: 'e', label: 'Efficiency', unit: '%', side: 'right', includeZero: true, max: 100 },
    ],
    series: [
      { label: 'Tj', x: vs, y: vs.map((v) => ldoPower({ ...inp, vin: v }).tj), axis: 't', width: 2.2 },
      { label: 'η', x: vs, y: vs.map((v) => ldoPower({ ...inp, vin: v }).eff * 100), axis: 'e', color: '#2f7d4f', width: 1.4, dash: [5, 3] },
    ],
    hlines: limits,
    vlines: [{ value: s.vin, label: `Vin ${si(s.vin, 'V', 3)}` }, ...(s.vdo > 0 ? [{ value: vLo, label: `dropout limit ${si(vLo, 'V', 3)}`, color: '#8b1e1e', dash: [3, 3] }] : [])],
    markers: [{ x: s.vin, y: tj, axis: 't', label: `${tj.toFixed(1)} °C` }],
  };
  return [tjVsI, derating, vinGraph];
}

export const def: CalcDef<LdoState> = {
  id: 'power/ldo-thermal',
  version: '0.1.0',
  method:
    'Pd = (Vin − Vout)·Iout + Vin·I_GND and Tj = Ta + Pd·θJA (TI SLVA118A eq. 3–7, 16; θJA per JESD51-2A, TI SPRA953). Max load, max ambient, max Vin or max θJA for a target Tj are found by root finding on the same forward model.',
  fields,
  defaults,
  solve: {
    default: 'tj',
    analysis: 'tj',
    options: [
      { key: 'tj', label: 'Junction temperature (analysis)' },
      { key: 'iout', label: 'Maximum load current for a target Tj' },
      { key: 'ta', label: 'Maximum ambient for a target Tj' },
      { key: 'vin', label: 'Maximum input voltage for a target Tj' },
      { key: 'thetaJA', label: 'Maximum θJA (package/board) for a target Tj' },
    ],
  },
  compute,
  sync: (s) => {
    const t = PACKAGES[s.pkg];
    if (t != null && Math.abs(t - s.thetaJA) > 1e-9) s.pkg = 'Custom';
  },
  examples: [
    { id: 'default', label: '5 V → 3.3 V, 0.5 A in SOT-223 at 50 °C', state: defaults() },
    {
      id: 'slva118-ex1',
      label: 'SLVA118 ex. 1: 5 V → 1.8 V, 100 mA at 70 °C — max θJA',
      state: { solveFor: 'thetaJA', vin: 5, vout: 1.8, iout: 0.1, ignd: 0, vdo: 0, iRated: 0.1, pkg: 'Custom', thetaJA: 200, ta: 70, tj: 125, tjMax: 125 },
    },
    {
      id: 'slva118-ex2',
      label: 'SLVA118 ex. 2: 5.25 V → 3.234 V, 0.95 A, Tj derated to 115 °C',
      state: { solveFor: 'thetaJA', vin: 5.25, vout: 3.234, iout: 0.95, ignd: 0, vdo: 0.23, iRated: 1, pkg: 'Custom', thetaJA: 32.6, ta: 50, tj: 115, tjMax: 125 },
    },
    {
      id: 'sot23-max-i',
      label: '3.6 V Li-ion → 3.0 V in SOT-23-5: max current at 85 °C',
      state: { solveFor: 'iout', vin: 4.2, vout: 3.0, ignd: 50e-6, vdo: 0.2, iRated: 0.3, pkg: 'SOT-23-5 (≈ 200 °C/W)', thetaJA: 200, ta: 85, tj: 125, tjMax: 125 },
    },
    {
      id: '12v-to-5v-hot',
      label: '12 V → 5 V, 0.4 A in SOT-223 — too hot',
      state: { solveFor: 'tj', vin: 12, vout: 5, iout: 0.4, ignd: 5e-3, vdo: 1.1, iRated: 0.8, pkg: 'SOT-223 (≈ 60 °C/W)', thetaJA: 60, ta: 60, tj: 100, tjMax: 125 },
    },
    {
      id: 'dropout',
      label: '3.3 V → 3.0 V at 300 mA with 400 mV dropout',
      state: { solveFor: 'tj', vin: 3.3, vout: 3.0, iout: 0.3, ignd: 0.2e-3, vdo: 0.4, iRated: 0.5, pkg: 'SOT-23-5 (≈ 200 °C/W)', thetaJA: 200, ta: 40, tj: 100, tjMax: 125 },
    },
  ],
};
