/** Battery life — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { CELLS } from '../regulator-dropout/def';
import { HOUR, type LifeInputs, type LoadPhase, MONTH, type Reg, avgLoad, batteryCurrent, life, selfDischargeLimit } from './model';

export type LifeSolve = 'tRun' | 'cap' | 'iMax';

export interface LifeState {
  solveFor: LifeSolve;
  chem: string;
  ns: number;
  cap: number;
  capUnit: string;
  vNom: number;
  vEnd: number;
  loads: LoadPhase[];
  reg: Reg;
  vLoad: number;
  eff: number;
  iq: number;
  dod: number;
  fTemp: number;
  fAge: number;
  sd: number;
  k: number;
  hRated: number;
  tRun: number;
  tRunUnit: string;
  iMax: number;
}

/** Capacity in coulombs (A·s); time in s. */
export const U_CAPY: Record<string, number> = { mAh: 3.6, Ah: 3600 };
export const U_TIME: Record<string, number> = { h: 3600, d: 86400, wk: 604800, yr: 31557600, min: 60, s: 1 };

interface Chem {
  label: string;
  /** per cell: nominal and end-of-discharge voltage */
  v: [number, number];
  cap: number;
  /** typical series cell count */
  ns: number;
  /** rated discharge time, h */
  h: number;
  k: number;
  /** self-discharge, %/month at 20 °C */
  sd: number;
  dod: number;
}
const cell = (key: string): [number, number] => [CELLS[key]![1], CELLS[key]![2]];
/**
 * Presets: typical values at 20–25 °C. Capacities are common parts (rated at the listed discharge time);
 * self-discharge from Linden & Reddy (4th ed.) chemistry chapters and maker handbooks (Energizer, Panasonic,
 * Yuasa NP) — typical figures, not limits. Voltages are shared with the regulator-dropout page, except alkaline, whose
 * rated capacity runs to 0.8 V (Energizer E91) where regulator-dropout uses a 0.9 V application cutoff. LSD NiMH
 * 0.4 %/month ≈ 5 %/yr is current Eneloop-class cells (first-generation LSD: 15–20 %/yr). The preset also
 * sets the cell count: the form writes the new chemistry before `apply`, so the old one cannot be checked.
 */
export const CHEMS: Record<string, Chem> = {
  liion: { label: 'Li-ion / LiPo', v: cell('Li-ion / LiPo (4.2 / 3.7 / 3.0 V)'), ns: 1, cap: 2000 * 3.6, h: 5, k: 1, sd: 2, dod: 100 },
  lfp: { label: 'LiFePO₄', v: cell('LiFePO₄ (3.65 / 3.2 / 2.5 V)'), ns: 1, cap: 1500 * 3.6, h: 5, k: 1, sd: 2, dod: 100 },
  nimh: { label: 'NiMH (standard)', v: cell('NiMH (1.4 / 1.2 / 1.0 V)'), ns: 2, cap: 2000 * 3.6, h: 5, k: 1, sd: 20, dod: 100 },
  lsd: { label: 'NiMH (low self-discharge)', v: cell('NiMH (1.4 / 1.2 / 1.0 V)'), ns: 2, cap: 1900 * 3.6, h: 5, k: 1, sd: 0.4, dod: 100 },
  alk: { label: 'Alkaline AA', v: [1.5, 0.8], ns: 2, cap: 2500 * 3.6, h: 100, k: 1, sd: 0.2, dod: 100 },
  lead: { label: 'Lead-acid (VRLA)', v: [2.0, 1.75], ns: 6, cap: 7 * 3600, h: 20, k: 1.2, sd: 3, dod: 50 },
  coin: { label: 'Coin cell CR2032', v: [3.0, 2.0], ns: 1, cap: 225 * 3.6, h: 1200, k: 1, sd: 0.08, dod: 100 },
};

const phase = (name: string, i: number, duty: number): LoadPhase => ({ name, i, duty });

export const defaults = (): LifeState => ({
  solveFor: 'tRun',
  chem: 'alk',
  ns: 2,
  cap: 2500 * 3.6,
  capUnit: 'mAh',
  vNom: 1.5,
  vEnd: 0.8,
  loads: [phase('MCU active', 4e-3, 2), phase('Radio TX', 25e-3, 0.5), phase('Sleep', 8e-6, 97.5)],
  reg: 'none',
  vLoad: 3.3,
  eff: 90,
  iq: 1.6e-6,
  dod: 100,
  fTemp: 100,
  fAge: 100,
  sd: 0.2,
  k: 1,
  hRated: 100 * HOUR,
  tRun: 1000 * HOUR,
  tRunUnit: 'd',
  iMax: 1e-3,
});

const isReg = (_s: any, r: any) => r.reg !== 'none';
const isSw = (_s: any, r: any) => r.reg === 'switching';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Battery',
    fields: [
      {
        kind: 'select',
        key: 'chem',
        label: 'Chemistry',
        options: [...Object.entries(CHEMS).map(([value, c]) => ({ value, label: c.label })), { value: 'custom', label: 'Custom' }],
        apply: (v: string, _s, r) => {
          const c = CHEMS[v];
          if (!c) return;
          Object.assign(r, { vNom: c.v[0], vEnd: c.v[1], hRated: c.h * HOUR, k: c.k, sd: c.sd, dod: c.dod, ns: c.ns });
          if (r.solveFor !== 'cap') r.cap = c.cap;
        },
        help: 'Fills typical values (20–25 °C) for the cell voltages, rated discharge time, Peukert exponent, self-discharge and usable depth of discharge. Replace them with your cell’s datasheet values.',
      },
      { kind: 'number', key: 'ns', symbol: 'N_s', label: 'Cells in series', min: 1, max: 100, integer: true, help: 'Series cells add voltage, not capacity. For parallel strings enter the total capacity below.' },
      { kind: 'number', key: 'cap', symbol: 'C', label: 'Rated capacity', units: U_CAPY, unitKey: 'capUnit', min: 0.036, max: 3.6e9, solvable: true, help: 'Datasheet capacity of one series string (sum over parallel strings), rated at the discharge time below to the end voltage.' },
      { kind: 'number', key: 'hRated', symbol: 'H', label: 'Rated at (hours)', units: { h: 3600 }, unitKey: 'hUnit', defaultUnit: 'h', unitFamily: 'none', min: 360, max: 3.6e8, help: 'Discharge time at which C is specified: 20 h for lead-acid (C₂₀), 5 h (0.2 C) for Li-ion and NiMH (IEC 61960 / 61951-2). Sets the reference current C/H for the Peukert correction.' },
      { kind: 'number', key: 'vNom', symbol: 'V_nom', label: 'Nominal cell voltage', unit: 'V', min: 0.5, max: 5, help: 'Mid-discharge plateau: sets the battery current through a switching regulator.' },
      { kind: 'number', key: 'vEnd', symbol: 'V_end', label: 'End-of-discharge', unit: 'V', min: 0.1, max: 5, help: 'Cell voltage at which the rated capacity ends. Checked against the regulator’s input need.' },
    ],
  },
  {
    kind: 'section',
    title: 'Load profile',
    note: 'Currents on the load rail; duties should add up to 100 %.',
    fields: [
      {
        kind: 'list',
        key: 'loads',
        addLabel: 'Add phase',
        minItems: 1,
        maxItems: 8,
        variant: 'sub',
        itemTitle: (p, i) => p.name || `Phase ${i + 1}`,
        create: (prev) => (prev ? { ...prev, name: 'Phase' } : phase('Load', 1e-3, 100)),
        fields: [
          { kind: 'text', key: 'name', label: 'Name', maxLength: 24 },
          { kind: 'number', key: 'i', symbol: 'I', label: 'Current', unit: 'A', min: 0, max: 1000, help: 'Current in this phase (active, transmit, sleep…). Engineering notation works: 25m, 8u.' },
          { kind: 'number', key: 'duty', symbol: 'D', label: 'Duty', suffix: '%', min: 0, max: 100, help: 'Share of the time spent in this phase. For a burst of t_on every T: D = 100·t_on/T.' },
        ],
      },
    ],
  },
  {
    kind: 'section',
    title: 'Regulator',
    fields: [
      { kind: 'select', key: 'reg', label: 'Regulator', options: [{ value: 'none', label: 'None (load on the battery)' }, { value: 'linear', label: 'Linear (LDO)' }, { value: 'switching', label: 'Switching converter' }] },
      { kind: 'number', key: 'vLoad', symbol: 'V_load', label: 'Rail voltage', unit: 'V', min: 0.3, max: 1000, visible: isReg },
      { kind: 'number', key: 'eff', symbol: 'η', label: 'Efficiency', suffix: '%', min: 1, max: 100, visible: isSw, help: 'Converter efficiency at the average load. At µA loads use the light-load (PFM) figure from the datasheet curve.' },
      { kind: 'number', key: 'iq', symbol: 'I_q', label: 'Quiescent current', unit: 'A', min: 0, max: 1, visible: isReg, help: 'Ground / no-load input current of the regulator (e.g. MCP1700 1.6 µA, TPS7A02 25 nA). It flows all the time.' },
    ],
  },
  {
    kind: 'section',
    title: 'Derating',
    fields: [
      { kind: 'number', key: 'dod', symbol: 'DoD', label: 'Usable depth', suffix: '%', min: 1, max: 100, help: 'Share of the rated capacity you allow to be used: 100 % down to V_end; 50 % for long lead-acid cycle life; less if the system cuts off above V_end.' },
      { kind: 'number', key: 'fTemp', symbol: 'f_T', label: 'Capacity at temp.', suffix: '%', min: 1, max: 120, help: 'Capacity available at the operating temperature, from the datasheet temperature curve. Cold costs most: alkaline and lead-acid lose a large share near 0 °C and below.' },
      { kind: 'number', key: 'fAge', symbol: 'f_age', label: 'Capacity after ageing', suffix: '%', min: 1, max: 100, help: 'Remaining capacity at end of life. Rechargeable cells are usually rated to 80 % after their cycle life.' },
      { kind: 'number', key: 'sd', symbol: 'r_sd', label: 'Self-discharge', suffix: '%/mo', min: 0, max: 50, help: 'Loss per month at 20 °C, of the rated capacity; roughly doubles per 10 °C warmer. Matters for µA sleep loads.' },
      { kind: 'number', key: 'k', symbol: 'k', label: 'Peukert exponent', min: 1, max: 2, help: 'Lead-acid 1.1–1.3 (fit it from two datasheet points: k = ln(t₂/t₁)/ln(I₁/I₂)). Leave 1 for other chemistries and enter the capacity at your current instead.' },
    ],
  },
  {
    kind: 'section',
    title: 'Runtime',
    fields: [
      { kind: 'number', key: 'tRun', symbol: 't', label: 'Runtime', units: U_TIME, unitKey: 'tRunUnit', min: 1, max: 3.2e10, solvable: true, help: 'Calculated, or the target runtime when solving for C or the current budget.' },
      { kind: 'number', key: 'iMax', symbol: 'I_avg,max', label: 'Max average load', unit: 'A', min: 1e-15, max: 1e4, solvable: true, visible: (_s, r) => r.solveFor === 'iMax', help: 'Largest average load-rail current that still meets the runtime target.' },
    ],
  },
];

const inputs = (s: LifeState): LifeInputs => ({
  cap: s.cap,
  hRated: s.hRated,
  k: s.k,
  dod: s.dod / 100,
  fTemp: s.fTemp / 100,
  fAge: s.fAge / 100,
  sd: s.sd / 100,
  reg: s.reg,
  vLoad: s.vLoad,
  vBat: s.ns * s.vNom,
  eff: s.eff / 100,
  iq: s.iq,
});

export const fCap = (c: number) => (c >= 3600 ? `${+(c / 3600).toPrecision(4)} Ah` : `${+(c / 3.6).toPrecision(4)} mAh`);
export const fT = (t: number) => (!Number.isFinite(t) ? '∞' : t < 2 * HOUR ? `${+(t / 60).toPrecision(4)} min` : t < 3 * 86400 ? `${(t / HOUR).toPrecision(4)} h` : t < 2 * 31557600 ? `${(t / 86400).toPrecision(4)} d` : `${(t / 31557600).toPrecision(4)} yr`);
const pct = (x: number) => `${(x * 100).toPrecision(3)} %`;

function noSolution(r: CalcReport, key: string, msg: string): CalcReport {
  return { ...r, ok: false, error: msg, status: { text: 'NO SOLUTION', tone: 'warn' }, solveFor: key };
}

export function compute(st: LifeState): CalcReport {
  for (const k of ['ns', 'cap', 'vNom', 'vEnd', 'vLoad', 'eff', 'iq', 'dod', 'fTemp', 'fAge', 'sd', 'k', 'hRated', 'tRun', 'iMax'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!Array.isArray(st.loads) || !st.loads.length) throw new Error('Add at least one load phase.');
  for (const p of st.loads) if (!(p.i >= 0) || !(p.duty >= 0) || !(p.duty <= 100)) throw new Error('Phase currents must be ≥ 0 and duties 0–100 %.');
  if (st.solveFor !== 'cap' && !(st.cap > 0)) throw new Error('Capacity must be > 0.');
  if (!(st.hRated > 0) || !(st.k >= 1) || !(st.ns >= 1) || !(st.vNom > 0)) throw new Error('Rated time, Peukert k ≥ 1, cell count and voltage must be positive.');
  if (!(st.dod > 0) || !(st.fTemp > 0) || !(st.fAge > 0) || st.sd < 0 || st.iq < 0) throw new Error('Derating factors must be > 0 and self-discharge, I_q ≥ 0.');
  if (st.reg === 'switching' && !(st.eff > 0 && st.eff <= 100)) throw new Error('Efficiency must be 1–100 %.');

  const s: LifeState = { ...st, loads: st.loads.map((p) => ({ ...p })) };
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'power/battery-life', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const iProfile = avgLoad(s.loads);
  const dutySum = s.loads.reduce((a, p) => a + p.duty, 0);

  // ── solve
  if (s.solveFor === 'cap') {
    if (!(s.tRun > 0)) throw new Error('Target runtime must be > 0.');
    const tMax = selfDischargeLimit(inputs({ ...s, cap: 1 }));
    if (s.tRun >= tMax * (1 - 1e-9)) return noSolution(report, 'cap', `Self-discharge alone (${s.sd} %/month) empties any size of this cell in ${fT(tMax)}: no capacity reaches ${fT(s.tRun)}. Choose a chemistry with lower self-discharge.`);
    const r = invert((c) => life(iProfile, inputs({ ...s, cap: c })).t, s.tRun, { lo: 0.036, hi: 3.6e9, log: true, samples: 160 });
    if (!r.ok) return noSolution(report, 'cap', `No capacity from 0.01 mAh to 1 GAh gives ${fT(s.tRun)} (closest ${fT(r.closestValue)}).`);
    s.cap = r.roots[0];
  } else if (s.solveFor === 'iMax') {
    if (!(s.tRun > 0)) throw new Error('Target runtime must be > 0.');
    const t0 = life(0, inputs(s)).t;
    if (s.tRun >= t0 * (1 - 1e-9)) return noSolution(report, 'iMax', `Even with no load the cell lasts only ${fT(t0)} (self-discharge${s.reg !== 'none' ? ' and regulator I_q' : ''}): ${fT(s.tRun)} is out of reach.`);
    const r = invert((i) => life(i, inputs(s)).t, s.tRun, { lo: 1e-15, hi: 1e4, log: true, samples: 200 });
    if (!r.ok) return noSolution(report, 'iMax', `No average current from 1 fA to 10 kA gives ${fT(s.tRun)}.`);
    s.iMax = r.roots[0];
  }
  const p = inputs(s);
  const iUse = s.solveFor === 'iMax' ? s.iMax : iProfile;
  const o = life(iUse, p);
  if (s.solveFor !== 'iMax') {
    if (!Number.isFinite(o.t)) return { ...report, ok: false, error: 'Nothing drains the battery (zero load, no I_q and no self-discharge): the runtime is unbounded.', status: { text: 'NO DRAIN', tone: 'warn' } };
    if (s.solveFor === 'tRun' && !(o.t >= 1 && o.t <= 3.2e10)) return { ...report, ok: false, error: o.t < 1 ? 'The battery would last under a second: check the load currents and the capacity.' : 'Runtime beyond 1000 years: the drain is negligible against any real shelf life.', status: { text: 'OUT OF RANGE', tone: 'warn' } };
    if (s.solveFor === 'tRun') s.tRun = o.t;
  }
  const oProfile = life(iProfile, p);

  // ── checks
  const vBat = s.ns * s.vNom;
  const vEndPack = s.ns * s.vEnd;
  if (Math.abs(dutySum - 100) > 0.01) {
    if (dutySum > 100) warnings.push(`Phase duties add up to ${dutySum.toPrecision(4)} %: more than all of the time. Correct the duties (they are shares of one period).`);
    else notes.push(`Duties add up to ${dutySum.toPrecision(4)} %; the remaining ${(100 - dutySum).toPrecision(3)} % draws no current. Add a sleep phase if the circuit draws anything then.`);
  }
  if (s.reg === 'linear' && vEndPack < s.vLoad) warnings.push(`The LDO drops out before the battery is empty: ${s.ns} × V_end = ${si(vEndPack, 'V', 3)} is below the ${si(s.vLoad, 'V', 3)} rail (plus its dropout). Lower the usable depth to where the cell still gives V_load + V_DO (regulator-dropout page), add a cell, or use a buck-boost.`);
  if (s.reg === 'linear' && vBat < s.vLoad) warnings.push(`A linear regulator cannot make ${si(s.vLoad, 'V', 3)} from a ${si(vBat, 'V', 3)} nominal pack. Add cells or use a boost converter.`);
  const peak = Math.max(...s.loads.map((q) => batteryCurrent(q.i, p)));
  if (peak > 10 * o.iRef && s.k === 1) warnings.push(`Peak battery current ${si(peak, 'A', 3)} is over 10× the rated current C/H = ${si(o.iRef, 'A', 3)}. Most cells deliver less than rated capacity (and sag) at such pulses: use the datasheet capacity at that current, a Peukert k, or a buffer capacitor${s.chem === 'coin' ? ' (coin cells: see the maker’s pulse-load curves)' : ''}.`);
  if (o.fP < 1) notes.push(`Peukert: at I_bat = ${si(o.iBat, 'A', 3)} (> C/H = ${si(o.iRef, 'A', 3)}) the cell gives ${pct(o.fP)} of its rated capacity (k = ${s.k}).`);
  if (s.k > 1 && o.iBat < o.iRef) notes.push('Below the rated current Peukert’s law would credit extra capacity; the page keeps the rated value (conservative).');
  if (s.k > 1 && s.loads.length > 1) notes.push('Peukert is applied to the average current; strong pulses cost somewhat more than this.');
  const sdShare = o.iSd / (o.iBat + o.iSd);
  if (sdShare > 0.25) notes.push(`Self-discharge is ${pct(sdShare)} of the total drain: the sleep current is not the limit, the cell’s shelf life is.`);
  if (s.reg !== 'none' && o.iBat > 0 && s.iq / o.iBat > 0.25) warnings.push(`Regulator I_q is ${pct(s.iq / o.iBat)} of the battery current. Pick a lower-I_q regulator or switch it off between bursts.`);
  if (s.tRun > 10 * 31557600) warnings.push('Over 10 years: calendar ageing, passivation and seal life dominate and the linear self-discharge model is optimistic. Check the maker’s shelf-life data.');
  if (s.reg === 'switching') notes.push('Switching converter: battery current from power balance at the nominal pack voltage; it rises as the cells discharge.');

  // ── results
  const solved = s.solveFor;
  const res: ResultItem[] = [];
  if (solved === 'cap') res.push({ key: 'cap', label: 'Capacity needed', symbol: 'C', value: s.cap, unit: 'C', display: fCap(s.cap), primary: true, solved: true });
  if (solved === 'iMax') {
    res.push({ key: 'iMax', label: 'Max average load', symbol: 'I_avg,max', value: s.iMax, unit: 'A', display: si(s.iMax, 'A', 4), primary: true, solved: true });
    const okBudget = iProfile <= s.iMax;
    res.push({ key: 'profileUse', label: 'Profile uses', value: iProfile / s.iMax, unit: '', display: `${pct(iProfile / s.iMax)} of the budget`, primary: true, tone: okBudget ? 'pass' : 'fail', note: `profile average ${si(iProfile, 'A', 3)}` });
    report.status = okBudget ? { text: 'MEETS TARGET', tone: 'pass' } : { text: 'TOO SHORT', tone: 'fail' };
  }
  // In iMax mode the profile need not use the whole budget, so its own runtime is a separate row ('tProfile'):
  // 'tRun' stays the target. Solving C from such a state then gives a smaller C than entered (the harness
  // "roundtrip" flag from the coin-budget example is legitimate: the state is a budget, not a fixed design).
  if (solved === 'iMax') res.push({ key: 'tProfile', label: 'Runtime with this profile', symbol: 't', value: oProfile.t, unit: 's', display: fT(oProfile.t), primary: true, note: `target ${fT(s.tRun)}` });
  else res.push({ key: 'tRun', label: solved === 'cap' ? 'Runtime (target)' : 'Runtime', symbol: 't', value: o.t, unit: 's', display: fT(o.t), primary: true, solved: solved === 'tRun', note: `${(o.t / HOUR).toPrecision(4)} h` });
  // the current budget for this runtime is the profile average itself (keeps the hidden iMax box consistent)
  if (solved !== 'iMax') res.push({ key: 'iMax', label: 'Max average load', symbol: 'I_avg,max', value: iProfile, unit: 'A', display: si(iProfile, 'A', 4), group: 'Drain', note: 'for this runtime' });
  res.push({ key: 'iBat', label: 'Average battery current', symbol: 'I_bat', value: oProfile.iBat, unit: 'A', display: si(oProfile.iBat, 'A', 4), primary: true, note: s.reg === 'none' ? 'load average' : `load average ${si(iProfile, 'A', 3)}` });
  res.push({ key: 'capUsable', label: 'Usable capacity', symbol: 'C_u', value: o.capUsable, unit: 'C', display: fCap(o.capUsable), group: 'Capacity', note: `${pct(o.capUsable / s.cap)} of rated` });
  res.push({ key: 'fP', label: 'Peukert factor', symbol: 'f_P', value: o.fP, unit: '', display: o.fP.toFixed(4), group: 'Capacity' });
  res.push({ key: 'iRef', label: 'Rated current C/H', symbol: 'I_ref', value: o.iRef, unit: 'A', display: si(o.iRef, 'A', 3), group: 'Capacity' });
  res.push({ key: 'iSd', label: 'Self-discharge drain', symbol: 'I_sd', value: o.iSd, unit: 'A', display: si(o.iSd, 'A', 3), group: 'Drain', note: `${pct(sdShare)} of the total` });
  res.push({ key: 'iLoad', label: 'Average load current', symbol: 'I_load', value: iProfile, unit: 'A', display: si(iProfile, 'A', 4), group: 'Drain' });
  res.push({ key: 'peak', label: 'Peak battery current', symbol: 'I_pk', value: peak, unit: 'A', display: si(peak, 'A', 3), group: 'Drain' });
  res.push({ key: 'energy', label: 'Usable energy', symbol: 'E', value: o.capUsable * vBat, unit: 'J', display: `${((o.capUsable * vBat) / 3600).toPrecision(4)} Wh`, group: 'Capacity' });
  res.push({ key: 'tShelf', label: 'Self-discharge limit', symbol: 't_sd', value: selfDischargeLimit(p), unit: 's', display: fT(selfDischargeLimit(p)), group: 'Drain', note: 'runtime with zero load' });
  report.results = res;
  report.summary = `${s.ns} × ${CHEMS[s.chem]?.label ?? 'custom cell'} · ${fCap(s.cap)} · ${s.reg === 'none' ? 'no regulator' : s.reg === 'linear' ? `LDO to ${si(s.vLoad, 'V', 3)}` : `converter to ${si(s.vLoad, 'V', 3)}, η ${s.eff} %`}`;

  // ── table: where the charge goes
  const rows: Record<string, number | string | null>[] = [];
  const disp: Record<string, string>[] = [];
  const total = oProfile.iBat + oProfile.iSd;
  const gain = s.reg === 'switching' ? s.vLoad / (p.eff * vBat) : 1;
  const add = (name: string, i: number | null, duty: number | null, avg: number) => {
    rows.push({ name, i, duty, avg, share: avg / total });
    disp.push({ name, i: i == null ? '' : si(i, 'A', 3), duty: duty == null ? '' : `${+duty.toPrecision(4)} %`, avg: si(avg, 'A', 3), share: pct(avg / total) });
  };
  for (const q of s.loads) add(q.name || 'Phase', q.i, q.duty, (q.i * q.duty * gain) / 100);
  if (s.reg !== 'none' && s.iq > 0) add('Regulator I_q', s.iq, 100, s.iq);
  if (o.iSd > 0) add('Self-discharge', null, null, oProfile.iSd);
  const table: TableSpec = {
    id: 'budget',
    title: 'Charge budget',
    columns: [
      { key: 'name', label: 'Drain', align: 'left' },
      { key: 'i', label: 'Current', unit: 'A' },
      { key: 'duty', label: 'Duty', unit: '%' },
      { key: 'avg', label: 'Avg at battery', unit: 'A' },
      { key: 'share', label: 'Share' },
    ],
    rows,
    display: disp,
    note: s.reg === 'switching' ? `Load phases referred to the battery through V_load/(η·V_bat) = ${gain.toFixed(3)}.` : 'Load currents flow straight from the battery.',
  };
  report.tables = [table];

  // ── graph: runtime vs average load current
  const lo = Math.max(iUse / 300, 1e-12);
  const xs = Array.from({ length: 121 }, (_, j) => lo * Math.pow(1e4, j / 120));
  const ts = xs.map((i) => life(i, p).t / HOUR);
  const ideal = xs.map((i) => s.cap / batteryCurrent(i, p) / HOUR);
  const tsd = selfDischargeLimit(p) / HOUR;
  const g: GraphSpec = {
    id: 'runtime',
    title: 'Runtime vs average load current',
    x: { label: 'Average load current', unit: 'A', log: true },
    y: [{ id: 't', label: 'Runtime', unit: 'h', log: true }],
    series: [
      { label: 'With derating and self-discharge', x: xs, y: ts, axis: 't', width: 2.2 },
      { label: 'Rated C / I_bat', x: xs, y: ideal, axis: 't', color: '#9a8f7a', width: 1.2, dash: [5, 4] },
    ],
    hlines: [
      ...(Number.isFinite(tsd) && tsd < ts[0] * 30 ? [{ value: tsd, label: 'self-discharge limit', axis: 't', color: '#8b1e1e', dash: [5, 4] }] : []),
      ...(solved !== 'tRun' ? [{ value: s.tRun / HOUR, label: 'target', axis: 't', color: '#2f7d4f', dash: [3, 3] }] : []),
    ],
    vlines: [{ value: iProfile, label: `I_avg ${si(iProfile, 'A', 3)}` }, ...(solved === 'iMax' ? [{ value: s.iMax, label: 'max', color: '#2f7d4f', dash: [3, 3] }] : [])],
    markers: [{ x: iUse, y: o.t / HOUR, axis: 't', label: fT(o.t) }],
  };
  report.graphs = [g];
  report.details = { ...o, iProfile, vBat, vEndPack, cap: s.cap, iMax: s.iMax, tRun: s.tRun, MONTH };
  return report;
}

export const def: CalcDef<LifeState> = {
  id: 'power/battery-life',
  version: '0.1.0',
  method:
    'Runtime t = C·DoD·f_T·f_age·f_P / (I_bat + I_sd): duty-weighted average load, referred to the battery through a linear (I + I_q) or switching (power balance, η) regulator; Peukert factor f_P = (I_ref/I)^(k−1) above the rated current C/H (Peukert 1897; Linden & Reddy, Handbook of Batteries); self-discharge as a constant drain of the rated capacity per month. Capacity and the maximum average current are solved by Brent root finding on the same model.',
  fields,
  defaults,
  solve: {
    default: 'tRun',
    analysis: 'tRun',
    options: [
      { key: 'tRun', label: 'Runtime of this battery and load (analysis)' },
      { key: 'cap', label: 'Capacity for a target runtime' },
      { key: 'iMax', label: 'Max average load current for a target runtime' },
    ],
  },
  compute,
  sync: (s) => {
    const c = CHEMS[s.chem];
    if (c && (s.vNom !== c.v[0] || s.vEnd !== c.v[1] || s.k !== c.k || s.sd !== c.sd || s.hRated !== c.h * HOUR)) s.chem = 'custom';
  },
  examples: [
    { id: 'default', label: '2 × AA alkaline sensor node, no regulator: runtime', state: defaults() },
    {
      id: 'ble-coin',
      label: 'BLE beacon on a CR2032, 1 s advertising: runtime',
      state: { ...defaults(), chem: 'coin', ns: 1, cap: 225 * 3.6, vNom: 3.0, vEnd: 2.0, hRated: 1200 * HOUR, k: 1, sd: 0.08, dod: 100, loads: [phase('Advertising', 8e-3, 0.3), phase('Sleep', 1.5e-6, 99.7)], reg: 'none', tRunUnit: 'd' },
    },
    {
      id: 'sla-peukert',
      label: '12 V 7 Ah SLA, 1.2 A alarm load, 50 % DoD: Peukert',
      state: { ...defaults(), chem: 'lead', ns: 6, cap: 7 * 3600, capUnit: 'Ah', vNom: 2.0, vEnd: 1.75, hRated: 20 * HOUR, k: 1.2, sd: 3, dod: 50, loads: [phase('Alarm panel', 1.2, 100)], reg: 'none', tRunUnit: 'h' },
    },
    {
      id: 'tracker-cap',
      label: 'LTE-M tracker via buck-boost: LiPo capacity for 30 days',
      state: { ...defaults(), solveFor: 'cap', chem: 'liion', ns: 1, cap: 2000 * 3.6, vNom: 3.7, vEnd: 3.0, hRated: 5 * HOUR, k: 1, sd: 2, dod: 100, fAge: 80, loads: [phase('LTE-M TX', 120e-3, 0.5), phase('GNSS fix', 25e-3, 2), phase('MCU', 2e-3, 5), phase('Sleep', 15e-6, 92.5)], reg: 'switching', vLoad: 3.3, eff: 88, iq: 1e-6, tRun: 30 * 86400, tRunUnit: 'd' },
    },
    {
      id: 'nimh-self',
      label: '2 × AA NiMH remote at 50 µA: self-discharge dominates',
      state: { ...defaults(), chem: 'nimh', ns: 2, cap: 2000 * 3.6, vNom: 1.2, vEnd: 1.0, hRated: 5 * HOUR, k: 1, sd: 20, dod: 100, loads: [phase('Idle', 50e-6, 100)], reg: 'none', tRunUnit: 'd' },
    },
    {
      id: 'coin-budget',
      label: 'CR2032 + LDO, 1 year: max average current',
      state: { ...defaults(), solveFor: 'iMax', chem: 'coin', ns: 1, cap: 225 * 3.6, vNom: 3.0, vEnd: 2.0, hRated: 1200 * HOUR, k: 1, sd: 0.08, dod: 100, loads: [phase('Active', 3e-3, 0.5), phase('Sleep', 2e-6, 99.5)], reg: 'linear', vLoad: 1.8, iq: 25e-9, tRun: 31557600, tRunUnit: 'yr' },
    },
  ],
};
