/** Battery charge time — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { CELLS } from '../regulator-dropout/def';
import { U_CAPY, fCap } from '../battery-life/def';
import { type ChargeInputs, type Profile, charge, stateAt } from './model';

export type ChgSolve = 't' | 'iChg' | 'cap';
type Chem = 'liion' | 'lfp' | 'nimh' | 'nicd' | 'lead';

export interface ChgState {
  solveFor: ChgSolve;
  chem: Chem;
  ns: number;
  cap: number;
  capUnit: string;
  vCv: number;
  v0: number;
  vFloat: number;
  vAvg: number;
  tau: number;
  tauUnit: string;
  eta: number;
  iChg: number;
  cTerm: number;
  soc0: number;
  target: 'full' | 'soc';
  socT: number;
  charger: 'linear' | 'switching';
  vIn: number;
  effCh: number;
  t: number;
  tUnit: string;
}

const H = 3600;
export const U_T: Record<string, number> = { h: 3600, min: 60, s: 1 };
/** NiMH/NiCd nominal cell voltage (stored energy in CC mode), shared with regulator-dropout. */
/** VRLA open-circuit voltage at full charge, V/cell (2.12–2.15 V: Linden & Reddy lead-acid chapter; Yuasa NP manual). */
const LEAD_OCV_FULL = 2.13;
const V_NIMH_NOM = CELLS['NiMH (1.4 / 1.2 / 1.0 V)']![1];
const profileOf = (c: Chem): Profile => (c === 'nimh' || c === 'nicd' ? 'cc' : 'cccv');

/**
 * Presets per cell. V_CV: Li-ion 4.2 V, LiFePO₄ 3.65 V (shared with regulator-dropout); VRLA cyclic absorption
 * 2.45 V and float 2.275 V/cell (Yuasa NP manual: 2.40–2.50 / 2.25–2.30 V). η_c and τ are typical values to
 * calibrate against the cell's charge curve (see NOTES.md): NiMH/NiCd η_c = 70 % gives a 14.3 h charge at 0.1 C
 * (the IEC 61951-2 rated charge is 0.1 It for 16 h, i.e. η ≈ 62.5 % with deliberate overcharge).
 * The preset also sets a typical cell count (the form writes the new chemistry before `apply`, so the old one
 * is unknown: the count is reset from the preset rather than adjusted).
 */
const PRESET: Record<Chem, Partial<ChgState>> = {
  liion: { ns: 1, vCv: CELLS['Li-ion / LiPo (4.2 / 3.7 / 3.0 V)']![0], v0: CELLS['Li-ion / LiPo (4.2 / 3.7 / 3.0 V)']![2], tau: 0.3 * H, eta: 99.5, cTerm: 5 },
  lfp: { ns: 4, vCv: CELLS['LiFePO₄ (3.65 / 3.2 / 2.5 V)']![0], v0: CELLS['LiFePO₄ (3.65 / 3.2 / 2.5 V)']![2], tau: 0.1 * H, eta: 99.5, cTerm: 5 },
  nimh: { ns: 4, vAvg: 1.45, eta: 70 },
  nicd: { ns: 4, vAvg: 1.4, eta: 70 },
  lead: { ns: 6, vCv: 2.45, v0: 1.95, vFloat: 2.275, tau: 1.2 * H, eta: 90, cTerm: 2 },
};

export const defaults = (): ChgState => ({
  solveFor: 't',
  chem: 'liion',
  ns: 1,
  cap: 3000 * 3.6,
  capUnit: 'mAh',
  vCv: 4.2,
  v0: 3.0,
  vFloat: 2.275,
  vAvg: 1.45,
  tau: 0.3 * H,
  tauUnit: 'h',
  eta: 99.5,
  iChg: 1.5,
  cTerm: 5,
  soc0: 20,
  target: 'full',
  socT: 80,
  charger: 'switching',
  vIn: 5,
  effCh: 90,
  t: 2 * H,
  tUnit: 'h',
});

/** SoC at CV termination: 1 − η_c·τ·I_term/C, independent of I and C (I_term is a share of the 1 C current). */
const sEndCV = (s: ChgState) => 1 - ((s.eta / 100) * s.tau * (s.cTerm / 100)) / H;

const isCv = (_s: any, r: any) => profileOf(r.chem) === 'cccv';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Battery',
    fields: [
      {
        kind: 'select',
        key: 'chem',
        label: 'Chemistry',
        options: [
          { value: 'liion', label: 'Li-ion / LiPo (CC/CV)' },
          { value: 'lfp', label: 'LiFePO₄ (CC/CV)' },
          { value: 'nimh', label: 'NiMH (constant current)' },
          { value: 'nicd', label: 'NiCd (constant current)' },
          { value: 'lead', label: 'Lead-acid (bulk/absorption/float)' },
        ],
        apply: (v: Chem, _s, r) => {
          Object.assign(r, PRESET[v]);
          // NiMH/NiCd have no terminating CV phase: charge to 100 % unless the user sets a target
          if (profileOf(v) === 'cc') Object.assign(r, { target: 'soc', socT: 100 });
          // a CC/CV charge terminates below 100 %: a near-full target left over from NiMH means "full"
          else if (r.target === 'soc' && r.socT > 95) r.target = 'full';
          r.solveFor = 't'; // the old target time meant another profile
        },
        help: 'Picks the charge profile and fills typical per-cell values. Replace them with the cell and charger datasheet values.',
      },
      { kind: 'number', key: 'ns', symbol: 'N_s', label: 'Cells in series', min: 1, max: 100, integer: true },
      { kind: 'number', key: 'cap', symbol: 'C', label: 'Capacity', units: U_CAPY, unitKey: 'capUnit', min: 0.036, max: 3.6e9, solvable: true, help: 'Rated capacity (sum of parallel strings). The C-rate is I_chg / (C / 1 h).' },
      { kind: 'number', key: 'vCv', symbol: 'V_CV', label: 'CV / absorption voltage', unit: 'V', min: 1, max: 5, visible: isCv, help: 'Per cell. Li-ion 4.20 V (4.35–4.45 V for high-voltage cells), LiFePO₄ 3.6–3.65 V, VRLA cyclic 2.40–2.50 V (float use: charge at the float voltage).' },
      { kind: 'number', key: 'v0', symbol: 'V_0', label: 'Voltage at empty', unit: 'V', min: 0.5, max: 5, visible: isCv, help: 'Per cell, open circuit at 0 % SoC. Only shapes the voltage curve and the energy; the times depend on τ.' },
      { kind: 'number', key: 'vFloat', symbol: 'V_float', label: 'Float voltage', unit: 'V', min: 1, max: 5, visible: (_s, r) => r.chem === 'lead', help: 'Per cell, held after absorption (2.25–2.30 V at 20 °C for VRLA).' },
      { kind: 'number', key: 'vAvg', symbol: 'V_chg', label: 'Mean charge voltage', unit: 'V', min: 0.5, max: 5, visible: (_s, r) => !isCv(_s, r), help: 'Per cell, average over the charge (≈ 1.4–1.5 V for NiMH/NiCd). Only used for the energy and charger power.' },
      { kind: 'number', key: 'tau', symbol: 'τ_CV', label: 'CV time constant', units: U_T, unitKey: 'tauUnit', min: 1, max: 1e6, visible: isCv, help: 'How fast the current tapers in CV. Fit it to the datasheet charge curve: if CV starts at SoC_cv when charging at r C, τ = (1 − SoC_cv)/r hours. Typical: Li-ion 0.2–0.4 h, LiFePO₄ ≈ 0.1 h, VRLA 1–2 h (bulk ends near 70 % at 0.25 C).' },
      { kind: 'number', key: 'eta', symbol: 'η_c', label: 'Charge efficiency', suffix: '%', min: 10, max: 100, help: 'Coulombic efficiency: share of the charge input that is stored. Li-ion > 99 %; lead-acid 85–95 %; NiMH/NiCd ≈ 60–70 % at 0.1 C (makers recommend 14–16 h at 0.1 C; the IEC 61951-2 rated charge is 16 h, i.e. 62.5 %).' },
    ],
  },
  {
    kind: 'section',
    title: 'Charge',
    fields: [
      { kind: 'number', key: 'iChg', symbol: 'I_chg', label: 'Charge current', unit: 'A', min: 1e-6, max: 1e4, solvable: true, help: 'Constant-current (bulk) setting. Li-ion 0.5–1 C typical (check the datasheet maximum); NiMH standard 0.1 C; VRLA ≤ 0.25–0.3 C.' },
      { kind: 'number', key: 'cTerm', symbol: 'I_term', label: 'Termination current', suffix: '% of C', min: 0.1, max: 50, visible: isCv, help: 'CV ends when the current falls below this share of the 1 C current: C/10–C/20 for Li-ion chargers (10 %, 5 %); lead-acid switches to float near C/50.' },
      { kind: 'number', key: 'soc0', symbol: 'SoC_0', label: 'Start SoC', suffix: '%', min: 0, max: 99.9 },
      { kind: 'select', key: 'target', label: 'Charge to', options: [{ value: 'full', label: 'Full (charger terminates)' }, { value: 'soc', label: 'A target SoC' }], apply: (v, _s, r) => {
          if (v !== 'soc' || profileOf(r.chem) !== 'cccv') return;
          // a target carried over from a 100 % NiMH charge (or above the termination SoC) cannot be reached
          const se = 100 * sEndCV(r as ChgState);
          if (r.socT < se) return;
          const t = Math.min(80, Math.floor(se - 1));
          if (t > r.soc0) r.socT = t;
          else r.target = 'full'; // τ so slow that termination comes before any useful target
        } },
      { kind: 'number', key: 'socT', symbol: 'SoC_T', label: 'Target SoC', suffix: '%', min: 0.1, max: 100, visible: (_s, r) => r.target === 'soc' },
    ],
  },
  {
    kind: 'section',
    title: 'Charger',
    fields: [
      { kind: 'select', key: 'charger', label: 'Charger type', options: [{ value: 'switching', label: 'Switching (buck)' }, { value: 'linear', label: 'Linear' }] },
      { kind: 'number', key: 'vIn', symbol: 'V_in', label: 'Input voltage', unit: 'V', min: 0.5, max: 1000, help: 'USB 5 V, adapter or bus voltage feeding the charger.' },
      { kind: 'number', key: 'effCh', symbol: 'η_ch', label: 'Charger efficiency', suffix: '%', min: 10, max: 100, visible: (_s, r) => r.charger === 'switching' },
    ],
  },
  {
    kind: 'section',
    title: 'Time',
    fields: [{ kind: 'number', key: 't', symbol: 't', label: 'Charge time', units: U_T, unitKey: 'tUnit', min: 1, max: 1e8, solvable: true, help: 'Calculated, or the time available when solving for the current or the capacity.' }],
  },
];

const inputs = (s: ChgState): ChargeInputs => {
  const profile = profileOf(s.chem);
  return {
    profile,
    cap: s.cap,
    i: s.iChg,
    eta: s.eta / 100,
    tau: s.tau,
    iTerm: ((s.cTerm / 100) * s.cap) / H,
    s0: s.soc0 / 100,
    sT: s.target === 'soc' ? s.socT / 100 : profile === 'cc' ? 1 : null,
  };
};

export const fTime = (t: number) => (t < 120 ? `${t.toFixed(0)} s` : t < 2 * H ? `${(t / 60).toFixed(1)} min` : `${Math.floor(t / H)} h ${Math.round((t % H) / 60).toString().padStart(2, '0')} min`);
const pct = (x: number, dg = 3) => `${+(x * 100).toPrecision(dg)} %`;

function noSolution(r: CalcReport, key: string, msg: string): CalcReport {
  return { ...r, ok: false, error: msg, status: { text: 'NO SOLUTION', tone: 'warn' }, solveFor: key };
}

/** Terminal voltage of the pack at SoC s while charging at current i (CC/CV model; capped at V_CV). */
function vTerm(s: ChgState, p: ChargeInputs, st: { i: number; s: number; cv: boolean }): number {
  if (p.profile === 'cc') return s.ns * s.vAvg;
  if (st.cv) return s.ns * s.vCv;
  const slope = s.vCv - s.v0;
  const r = (p.eta * p.tau * slope) / p.cap; // per cell, Ω (τ = R·C/(η·slope))
  return s.ns * Math.min(s.vCv, s.v0 + slope * st.s + st.i * r);
}

export function compute(st: ChgState): CalcReport {
  for (const k of ['ns', 'cap', 'vCv', 'v0', 'vFloat', 'vAvg', 'tau', 'eta', 'iChg', 'cTerm', 'soc0', 'socT', 'vIn', 'effCh', 't'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  const s: ChgState = { ...st };
  const profile = profileOf(s.chem);
  if (!(s.ns >= 1) || !(s.eta > 0 && s.eta <= 100)) throw new Error('Cell count must be ≥ 1 and the charge efficiency 10–100 %.');
  if (s.solveFor !== 'cap' && !(s.cap > 0)) throw new Error('Capacity must be > 0.');
  if (s.solveFor !== 'iChg' && !(s.iChg > 0)) throw new Error('Charge current must be > 0.');
  if (profile === 'cccv' && !(s.vCv > s.v0)) throw new Error(`V_CV (${s.vCv} V) must be above the voltage at empty (${s.v0} V).`);
  if (profile === 'cccv' && !(s.tau > 0)) throw new Error('The CV time constant must be > 0.');
  if (s.soc0 < 0 || s.soc0 >= 100) throw new Error('Start SoC must be 0–99.9 %.');
  if (s.target === 'soc' && !(s.socT > s.soc0)) throw new Error(`Target SoC (${s.socT} %) must be above the start SoC (${s.soc0} %).`);
  if (s.charger === 'switching' && !(s.effCh > 0)) throw new Error('Charger efficiency must be > 0.');
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'power/battery-charge-time', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  // the target SoC must lie below the termination SoC (which depends on I and C, so check after solving)
  const unreachable = (x: ChgState) => {
    const p = inputs(x);
    const r = charge(p);
    return p.sT != null && p.profile === 'cccv' && p.sT > r.sEnd + 1e-12 ? r.sEnd : null;
  };
  const time = (x: ChgState) => charge(inputs(x)).t;

  if (s.solveFor === 'iChg' || s.solveFor === 'cap') {
    if (!(s.t > 0)) throw new Error('The available time must be > 0.');
    const key = s.solveFor;
    const se = sEndCV(s);
    if (profile === 'cccv' && s.target === 'soc' && s.socT / 100 > se + 1e-12)
      return noSolution(report, key, `With termination at ${s.cTerm} % of C the charge stops at ${se > 0 ? pct(se, 4) : '0 %'} SoC whatever the current or capacity: the ${s.socT} % target is never reached. Lower the termination current or the target.`);
    const lo = key === 'iChg' ? 1e-6 : 0.036;
    const hi = key === 'iChg' ? 1e4 : 3.6e9;
    const g = (x: number) => {
      const y = { ...s, [key]: x };
      return unreachable(y) != null ? NaN : time(y);
    };
    // time is monotonic in I (non-increasing) and in C (non-decreasing); the CV taper sets a floor
    const r = invert(g, s.t, { lo, hi, log: true, samples: 200 });
    // a root sitting exactly on a bracket end (e.g. 1 µA) is still an answer
    for (const end of [lo, hi]) if (!r.ok && Math.abs(g(end) / s.t - 1) < 1e-9) Object.assign(r, { ok: true, roots: [end] });
    if (!r.ok) {
      const fast = key === 'iChg' ? g(hi) : g(lo);
      const what = key === 'iChg' ? 'charge current' : 'capacity';
      return noSolution(report, key, Number.isFinite(fast) && fast > s.t ? `Even at the ${key === 'iChg' ? 'highest current' : 'smallest capacity'} the charge takes ${fTime(fast)}: ${profile === 'cccv' ? 'the CV taper alone (τ·ln(I_0/I_term)) sets this floor. Allow more time, a lower target SoC or a higher termination current.' : 'allow more time.'}` : `No ${what} gives ${fTime(s.t)} with this target.`);
    }
    // on a flat stretch (CV-limited) several values give the same time: take the smallest current / largest capacity
    s[key] = key === 'iChg' ? Math.min(...r.roots) : Math.max(...r.roots);
  }
  const p = inputs(s);
  const un = unreachable(s);
  if (un != null) return { ...report, ok: false, error: `With termination at ${s.cTerm} % of C the charge stops at ${pct(un, 4)} SoC: the ${s.socT} % target is never reached. Lower the termination current or the target.`, status: { text: 'UNREACHABLE', tone: 'warn' } };
  const o = charge(p);
  if (!(o.t >= 1)) return { ...report, ok: false, error: profile === 'cc' ? `The charge would take under a second: ${si(s.iChg, 'A', 3)} is far too much for ${fCap(s.cap)}.` : `Nothing left to charge: at ${s.soc0} % the CV current is already at or below the termination current (${si(p.iTerm, 'A', 3)}).`, status: { text: 'ALREADY FULL', tone: 'warn' } };
  if (o.t > 1e8) return { ...report, ok: false, error: `The charge would take ${(o.t / 31557600).toPrecision(3)} years: raise the charge current.`, status: { text: 'TOO SLOW', tone: 'warn' } };
  if (s.solveFor === 't') s.t = o.t;
  const cRate = (s.iChg * H) / s.cap;

  // ── time samples (current, voltage, SoC, power)
  const tEnd = o.t * (s.chem === 'lead' && s.target === 'full' ? 1.15 : 1);
  const N = 240;
  const ts: number[] = [];
  const is: number[] = [];
  const vs: number[] = [];
  const ss: number[] = [];
  const pIn: number[] = [];
  const pd: number[] = [];
  let eBat = 0;
  let eStored = 0;
  let eIn = 0;
  const grid = Array.from({ length: N + 1 }, (_, j) => (tEnd * j) / N);
  if (o.tCC > 0 && o.tCC < o.t) grid.push(o.tCC * (1 - 1e-9), o.tCC);
  grid.sort((a, b) => a - b);
  let prev: { t: number; pb: number; ps: number; pi: number } | null = null;
  for (const t of grid) {
    const float = t > o.t;
    const x = float ? { i: 0, s: o.sFinal, cv: true } : stateAt(p, o, t);
    const v = float ? s.ns * s.vFloat : vTerm(s, p, x);
    const pb = v * x.i;
    // stored energy at the real OCV: for lead-acid the model's V_CV is the absorption voltage, but a full VRLA cell rests near 2.13 V
    const vFullOc = s.chem === 'lead' ? Math.min(s.vCv, LEAD_OCV_FULL) : s.vCv;
    const ocv = profile === 'cc' ? s.ns * V_NIMH_NOM : s.ns * (s.v0 + (vFullOc - s.v0) * x.s);
    const ps = ocv * p.eta * x.i;
    const pi = s.charger === 'linear' ? s.vIn * x.i : pb / (s.effCh / 100);
    ts.push(t / H);
    is.push(x.i);
    vs.push(v);
    ss.push(x.s * 100);
    pIn.push(pi);
    pd.push(pi - pb);
    if (prev && !float) {
      const dt = t - prev.t;
      eBat += ((pb + prev.pb) / 2) * dt;
      eStored += ((ps + prev.ps) / 2) * dt;
      eIn += ((pi + prev.pi) / 2) * dt;
    }
    prev = { t, pb, ps, pi };
  }
  const pdMax = Math.max(...pd);
  const vMinPack = vs[0];

  // ── checks
  if (s.charger === 'linear' && s.vIn < s.ns * (profile === 'cccv' ? s.vCv : s.vAvg) + 0.1)
    warnings.push(`A linear charger needs V_in above the charge voltage plus its dropout (${si(s.ns * (profile === 'cccv' ? s.vCv : s.vAvg), 'V', 3)} + ~0.1–0.3 V). Raise V_in or use a buck-boost charger.`);
  if (s.charger === 'switching' && s.vIn < s.ns * (profile === 'cccv' ? s.vCv : s.vAvg)) warnings.push('A buck charger needs V_in above the battery voltage; for a lower input use a boost or buck-boost charger.');
  if (s.charger === 'linear' && pdMax > 1) warnings.push(`The linear charger dissipates up to ${si(pdMax, 'W', 3)} at the start of CC. A small package (SOT-23, DFN) manages about 0.5–1 W: lower I_chg, lower V_in, or use a switching charger. Most linear chargers fold back the current thermally, which lengthens the charge.`);
  if (profile === 'cccv' && s.chem !== 'lead' && cRate > 1) warnings.push(`${cRate.toFixed(2)} C is above the 0.5–1 C standard charge of most Li-ion cells. Check the datasheet maximum (fast-charge cells allow 2–3 C); heating and plating risk rise, especially below 10 °C.`);
  if (s.chem === 'lead' && cRate > 0.3) warnings.push(`${cRate.toFixed(2)} C exceeds the 0.25–0.3 C initial current most VRLA makers allow (Yuasa NP: 0.25 C). Limit I_chg.`);
  if (profile === 'cc' && cRate > 0.3 && cRate <= 0.5) warnings.push(`${cRate.toFixed(2)} C needs a termination method (−ΔV, dT/dt or a timer): only ≤ 0.1 C tolerates continuous overcharge in NiMH/NiCd.`);
  if (profile === 'cc' && cRate > 0.5) warnings.push(`${cRate.toFixed(2)} C is a fast charge: charge efficiency is higher than at 0.1 C until near full, then heat rises sharply. Use −ΔV/dT/dt termination and a fast-charge-rated cell; the time here uses the entered η_c.`);
  if (profile === 'cccv' && o.sTr <= p.s0 + 1e-12 && o.tCC === 0) notes.push('The cell is already above the CV-onset SoC at this current: the charge starts in CV.');
  if (profile === 'cc') notes.push('Constant-current charge: the voltage curve is not modelled (NiMH/NiCd voltage peaks and falls slightly at full, which −ΔV chargers detect). Energy uses the mean charge voltage.');
  if (profile === 'cccv') notes.push(`First-order model: CV starts at ${pct(o.sTr, 4)} SoC at this current. Compare with the datasheet charge curve and adjust τ if it differs.`);
  if (s.chem === 'lead' && s.target === 'full') notes.push(`After absorption the charger drops to float (${si(s.ns * s.vFloat, 'V', 3)}); the graph shows the first part of float.`);

  // ── results
  const solved = s.solveFor;
  const res: ResultItem[] = [];
  const iRes: ResultItem = { key: 'iChg', label: 'Charge current', symbol: 'I_chg', value: s.iChg, unit: 'A', display: si(s.iChg, 'A', 4), primary: true, solved: solved === 'iChg', note: `${+cRate.toPrecision(3)} C` };
  const cRes: ResultItem = { key: 'cap', label: 'Capacity', symbol: 'C', value: s.cap, unit: 'C', display: fCap(s.cap), primary: true, solved: true, note: `${+cRate.toPrecision(3)} C charge` };
  const tRes: ResultItem = { key: 't', label: solved === 't' ? 'Charge time' : 'Charge time (available)', symbol: 't', value: o.t, unit: 's', display: fTime(o.t), primary: true, solved: solved === 't', note: `to ${pct(o.sFinal, 4)} SoC` };
  if (solved === 'iChg') res.push(iRes, tRes);
  else if (solved === 'cap') res.push(cRes, tRes);
  else res.push(tRes, iRes);
  if (profile === 'cccv') {
    res.push({ key: 'tCC', label: s.chem === 'lead' ? 'Bulk (CC) time' : 'CC time', symbol: 't_CC', value: o.tCC, unit: 's', display: fTime(o.tCC), primary: true });
    res.push({ key: 'tCV', label: s.chem === 'lead' ? 'Absorption (CV) time' : 'CV time', symbol: 't_CV', value: o.tCV, unit: 's', display: fTime(o.tCV), group: 'Phases' });
    res.push({ key: 'sTr', label: 'SoC at CV onset', symbol: 'SoC_cv', value: o.sTr, unit: '', display: pct(o.sTr, 4), group: 'Phases' });
    res.push({ key: 'sEnd', label: 'SoC at termination', symbol: 'SoC_end', value: o.sEnd, unit: '', display: pct(o.sEnd, 4), group: 'Phases', note: `I_term ${si(p.iTerm, 'A', 3)}` });
  }
  res.push({ key: 'eIn', label: 'Energy from the input', symbol: 'E_in', value: eIn, unit: 'J', display: `${+(eIn / H).toPrecision(4)} Wh`, group: 'Energy' });
  res.push({ key: 'eStored', label: 'Energy stored', symbol: 'E_st', value: eStored, unit: 'J', display: `${+(eStored / H).toPrecision(4)} Wh`, group: 'Energy' });
  res.push({ key: 'effAll', label: 'Overall efficiency', symbol: 'η', value: eIn > 0 ? eStored / eIn : null, unit: '', display: eIn > 0 ? pct(eStored / eIn) : '—', group: 'Energy', note: 'stored / drawn from V_in' });
  res.push({ key: 'pIn', label: 'Peak input power', symbol: 'P_in', value: Math.max(...pIn), unit: 'W', display: si(Math.max(...pIn), 'W', 3), group: 'Charger', note: `${si(Math.max(...pIn) / s.vIn, 'A', 3)} from V_in` });
  res.push({ key: 'pd', label: 'Charger dissipation (max)', symbol: 'P_D', value: pdMax, unit: 'W', display: si(pdMax, 'W', 3), group: 'Charger', tone: s.charger === 'linear' && pdMax > 1 ? 'warn' : '' });
  report.results = res;
  report.summary = `${s.ns} × ${s.chem === 'lfp' ? 'LiFePO₄' : s.chem === 'liion' ? 'Li-ion' : s.chem === 'lead' ? 'lead-acid' : s.chem === 'nimh' ? 'NiMH' : 'NiCd'} · ${fCap(s.cap)} · ${si(s.iChg, 'A', 3)} (${+cRate.toPrecision(3)} C) · ${s.soc0} % → ${pct(o.sFinal, 4)}`;

  // ── graphs
  const vlines = profile === 'cccv' && o.tCC > 0 && o.tCC < o.t ? [{ value: o.tCC / H, label: s.chem === 'lead' ? 'absorption' : 'CV' }] : [];
  if (s.chem === 'lead' && tEnd > o.t) vlines.push({ value: o.t / H, label: 'float' });
  const gIV: GraphSpec = {
    id: 'profile',
    title: 'Charge current and voltage',
    x: { label: 'Time', unit: 'h' },
    y: [
      { id: 'i', label: 'Current', unit: 'A', includeZero: true },
      ...(profile === 'cccv' ? [{ id: 'v', label: 'Battery voltage', unit: 'V', side: 'right' as const, zeroLine: false }] : []),
    ],
    series: [
      { label: 'I', x: ts, y: is, axis: 'i', width: 2.2 },
      ...(profile === 'cccv' ? [{ label: 'V', x: ts, y: vs, axis: 'v', color: '#c47b17', width: 1.6 }] : []),
    ],
    hlines: profile === 'cccv' ? [{ value: p.iTerm, label: 'I_term', axis: 'i', color: '#8b1e1e', dash: [5, 4] }] : [],
    vlines,
    legend: 'below',
  };
  const gS: GraphSpec = {
    id: 'soc',
    title: 'State of charge',
    x: { label: 'Time', unit: 'h' },
    y: [{ id: 's', label: 'SoC', unit: '%', min: 0, max: 100 }],
    series: [{ label: 'SoC', x: ts, y: ss, axis: 's', width: 2.2 }],
    hlines: s.target === 'soc' ? [{ value: s.socT, label: `target ${s.socT} %`, axis: 's', color: '#2f7d4f', dash: [3, 3] }] : [],
    vlines,
    markers: [{ x: o.t / H, y: o.sFinal * 100, axis: 's', label: fTime(o.t) }],
  };
  report.graphs = [gIV, gS];

  // ── table: the same charge at standard C-rates
  const rates = [0.1, 0.2, 0.5, 1, 2];
  if (!rates.some((c) => Math.abs(c - cRate) < 1e-3)) rates.push(cRate);
  rates.sort((a, b) => a - b);
  const rows: Record<string, number | string | null>[] = [];
  const disp: Record<string, string>[] = [];
  const tones: ('pass' | 'warn' | 'fail' | '')[] = [];
  for (const c of rates) {
    const x = { ...s, iChg: (c * s.cap) / H };
    if (unreachable(x) != null) continue;
    const r = charge(inputs(x));
    rows.push({ c, i: x.iChg, t: r.t, tCC: r.tCC, sTr: r.sTr });
    disp.push({ c: `${+c.toPrecision(3)} C${Math.abs(c - cRate) < 1e-3 ? ' ◀' : ''}`, i: si(x.iChg, 'A', 3), t: fTime(r.t), tCC: fTime(r.tCC), sTr: profile === 'cccv' ? pct(r.sTr, 3) : '—' });
    tones.push(solved === 't' ? '' : r.t <= s.t * (1 + 1e-9) ? 'pass' : 'fail');
  }
  const table: TableSpec = {
    id: 'rates',
    title: 'Charge time at standard C-rates',
    columns: [
      { key: 'c', label: 'Rate', align: 'left' },
      { key: 'i', label: 'Current', unit: 'A' },
      { key: 't', label: 'Total time', unit: 's' },
      { key: 'tCC', label: 'CC time', unit: 's' },
      { key: 'sTr', label: 'CV onset SoC' },
    ],
    rows,
    display: disp,
    note: solved === 't' ? 'Same cell, start and target; ◀ marks the entered current.' : `Green: done within the available ${fTime(s.t)}; red: too slow.`,
    ...(solved === 't' ? {} : { rowTones: tones }),
  };
  report.tables = [table];
  report.details = { ...o, cRate, eIn, eStored, eBat, pdMax, vMinPack, iTerm: p.iTerm, iChg: s.iChg, cap: s.cap };
  return report;
}

export const def: CalcDef<ChgState> = {
  id: 'power/battery-charge-time',
  version: '0.1.0',
  method:
    'CC/CV charge on a first-order internal-resistance model (Plett, Battery Management Systems vol. 1): linear OCV from V₀ to V_CV, CV current decays as I₀·e^(−t/τ) to the termination current, CV onset SoC = 1 − η_c·I·τ/C; lead-acid bulk/absorption/float on the same model; NiMH/NiCd constant current t = ΔSoC·C/(η_c·I). Charger loss from a linear (V_in·I) or switching (P/η) stage, energies integrated over the profile. Current and capacity are solved by Brent root finding on the same model.',
  fields,
  defaults,
  solve: {
    default: 't',
    analysis: 't',
    options: [
      { key: 't', label: 'Charge time (analysis)' },
      { key: 'iChg', label: 'Charge current for the available time' },
      { key: 'cap', label: 'Capacity that charges in the available time' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '3000 mAh 18650 at 0.5 C, 20 % → full, buck charger', state: defaults() },
    { id: 'usb-linear', label: '1000 mAh LiPo on a 500 mA linear USB charger (MCP73831-style)', state: { ...defaults(), cap: 1000 * 3.6, iChg: 0.5, cTerm: 10, soc0: 0, charger: 'linear', vIn: 5 } },
    { id: 'fast-80', label: 'Phone cell 4000 mAh: current for 20 → 80 % in 30 min', state: { ...defaults(), solveFor: 'iChg', cap: 4000 * 3.6, soc0: 20, target: 'soc', socT: 80, t: 1800, tUnit: 'min', vIn: 9, effCh: 92 } },
    { id: 'nimh-std', label: '4 × AA NiMH 2000 mAh, 0.1 C standard charge from empty', state: { ...defaults(), chem: 'nimh', ns: 4, cap: 2000 * 3.6, ...PRESET.nimh, iChg: 0.2, soc0: 0, target: 'soc', socT: 100, charger: 'switching', vIn: 12, effCh: 85 } },
    { id: 'sla', label: '12 V 7 Ah VRLA at 1.75 A from 50 %: bulk, absorption, float', state: { ...defaults(), chem: 'lead', ns: 6, cap: 7 * 3600, capUnit: 'Ah', ...PRESET.lead, iChg: 1.75, soc0: 50, target: 'full', charger: 'switching', vIn: 19, effCh: 88 } },
    { id: 'lfp-overnight', label: 'LiFePO₄ 4S at 2 A: largest pack that charges in 8 h', state: { ...defaults(), solveFor: 'cap', chem: 'lfp', ns: 4, ...PRESET.lfp, cap: 10 * 3600, capUnit: 'Ah', iChg: 2, soc0: 0, target: 'full', charger: 'switching', vIn: 24, effCh: 92, t: 8 * H } },
  ],
};
