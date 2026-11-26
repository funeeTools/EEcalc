/** Flyback converter power stage — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_IND, U_OHM, withDefault } from '@/core/unitsets';
import { type FlybackOp, analyzeFlyback, clampPower, clampResetTime, dBoundary, dDcm, designNL, flybackOutputRipple, lBoundary } from './model';

/**
 * Two independent pairs, one input each: turns ratio N ↔ duty D_max, and inductance L_p ↔ ripple factor K_RF.
 * solveFor names the combination:  'n' → N and L_p solved (design from D_max, K_RF);  'lp' → D_max and L_p
 * solved (N given);  'krf' → N and K_RF solved (L_p given);  'dmax' → D_max and K_RF solved (analysis).
 */
export type FlybackSolve = 'n' | 'lp' | 'krf' | 'dmax';

export interface FlybackState {
  solveFor: FlybackSolve;
  vinMin: number;
  vinMax: number;
  vout: number;
  iout: number;
  etaPct: number;
  fsw: number;
  fswUnit: string;
  dmaxPct: number;
  n: number;
  krf: number;
  lp: number;
  lpUnit: string;
  llk: number;
  llkUnit: string;
  vf: number;
  cout: number;
  coutUnit: string;
  esr: number;
  esrUnit: string;
  kClamp: number;
  vdss: number;
  rds: number;
  rdsUnit: string;
  tsw: number;
  qg: number;
  vg: number;
  rp: number;
  rpUnit: string;
  rs: number;
  rsUnit: string;
  pcore: number;
}

export const defaults = (): FlybackState => ({
  solveFor: 'n',
  vinMin: 36,
  vinMax: 72,
  vout: 12,
  iout: 2,
  etaPct: 88,
  fsw: 200e3,
  fswUnit: 'kHz',
  dmaxPct: 45,
  n: 2.356,
  krf: 0.5,
  lp: 48e-6,
  lpUnit: 'µH',
  llk: 0.5e-6,
  llkUnit: 'µH',
  vf: 0.5,
  cout: 100e-6,
  coutUnit: 'µF',
  esr: 10e-3,
  esrUnit: 'mΩ',
  kClamp: 1.7,
  vdss: 150,
  rds: 50e-3,
  rdsUnit: 'mΩ',
  tsw: 20e-9,
  qg: 15e-9,
  vg: 10,
  rp: 50e-3,
  rpUnit: 'mΩ',
  rs: 15e-3,
  rsUnit: 'mΩ',
  pcore: 0.15,
});

const U_MOHM = withDefault(U_OHM, 'mΩ');
const U_CAP_U = withDefault(U_CAP, 'µF');
const U_IND_U = withDefault(U_IND, 'µH');
const U_FREQ_K = withDefault(U_FREQ, 'kHz');

type S = FlybackSolve;
const swap = (m: Partial<Record<S, S>>) => (_s: any, root: any) => {
  const to = m[root.solveFor as S];
  if (to) root.solveFor = to;
};
// pair A: N ↔ D_max · pair B: L_p ↔ K_RF (see FlybackSolve)
const nSolved = (_s: any, r: any) => r.solveFor === 'n' || r.solveFor === 'krf';
const lpSolved = (_s: any, r: any) => r.solveFor === 'n' || r.solveFor === 'lp';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'vinMin', symbol: 'V_in,min', label: 'Min DC input', unit: 'V', min: 0.5, max: 2000, help: 'Lowest DC input (bulk-capacitor valley for an off-line supply). Sets the maximum duty cycle and the peak primary current.' },
      { kind: 'number', key: 'vinMax', symbol: 'V_in,max', label: 'Max DC input', unit: 'V', min: 0.5, max: 2000, help: 'Highest DC input (√2 × the highest RMS line for an off-line supply). Sets the switch and rectifier voltage stress.' },
      { kind: 'number', key: 'vout', symbol: 'V_out', label: 'Output voltage', unit: 'V', min: 0.5, max: 2000 },
      { kind: 'number', key: 'iout', symbol: 'I_out', label: 'Output current', unit: 'A', min: 1e-4, max: 500 },
      { kind: 'number', key: 'etaPct', symbol: 'η', label: 'Assumed efficiency', suffix: '%', min: 10, max: 100, help: 'Sizes the primary currents: P_in = P_out/η (AN-4137). The loss estimate (Losses group) reports its own efficiency; set η to it to close the loop.' },
      { kind: 'number', key: 'fsw', symbol: 'f_sw', label: 'Switching frequency', units: U_FREQ_K, unitKey: 'fswUnit', unitFamily: 'none', min: 1e3, max: 10e6 },
    ],
  },
  {
    kind: 'section',
    title: 'Transformer',
    fields: [
      {
        kind: 'number',
        key: 'dmaxPct',
        symbol: 'D_max',
        label: 'Max duty (V_in,min)',
        suffix: '%',
        min: 1e-9,
        max: 99.99999,
        solvable: true,
        solvedWhen: (_s, r) => !nSolved(_s, r),
        onSolve: swap({ n: 'lp', krf: 'dmax' }),
        onUnsolve: swap({ lp: 'n', dmax: 'krf' }),
        help: 'Duty cycle at the lowest input and full load. 40–50 % is the usual choice (AN-4137); above 50 % in CCM, peak-current control needs slope compensation. ◎ toggles between D_max and N as the input.',
      },
      {
        kind: 'number',
        key: 'n',
        symbol: 'N',
        label: 'Turns ratio N_p/N_s',
        min: 1e-3,
        max: 1e4,
        solvable: true,
        solvedWhen: nSolved,
        onSolve: swap({ lp: 'n', dmax: 'krf' }),
        onUnsolve: swap({ n: 'lp', krf: 'dmax' }),
        help: 'Primary to secondary turns. Sets the reflected voltage V_OR = N·(V_out + V_F): higher N means a longer duty, lower primary current and rectifier stress, but more switch voltage.',
      },
      {
        kind: 'number',
        key: 'krf',
        symbol: 'K_RF',
        label: 'Ripple factor',
        min: 1e-12,
        max: 1e18,
        solvable: true,
        solvedWhen: (_s, r) => !lpSolved(_s, r),
        onSolve: swap({ n: 'krf', lp: 'dmax' }),
        onUnsolve: swap({ krf: 'n', dmax: 'lp' }),
        help: 'AN-4137 K_RF = ΔI/(2·I_EDC) at V_in,min, full load: 1 = boundary (BCM); 0.25–0.6 is typical for CCM. Above 1 this page reads it as L_crit/L_p, the depth of DCM.',
      },
      {
        kind: 'number',
        key: 'lp',
        symbol: 'L_p',
        label: 'Primary inductance',
        units: U_IND_U,
        unitKey: 'lpUnit',
        min: 1e-9,
        max: 1,
        solvable: true,
        solvedWhen: lpSolved,
        onSolve: swap({ krf: 'n', dmax: 'lp' }),
        onUnsolve: swap({ n: 'krf', lp: 'dmax' }),
        help: 'Magnetizing inductance seen from the primary. Its tolerance is often ±10 %; check the design at the low end.',
      },
      { kind: 'number', key: 'llk', symbol: 'L_lk', label: 'Leakage inductance', units: U_IND_U, unitKey: 'llkUnit', min: 0, max: 0.1, help: 'Primary leakage (measured with the secondary shorted). Typically 1–3 % of L_p for a sandwiched winding, more for a simple layer winding.' },
    ],
  },
  {
    kind: 'section',
    title: 'Output',
    fields: [
      { kind: 'number', key: 'vf', symbol: 'V_F', label: 'Rectifier drop', unit: 'V', min: 0, max: 5, help: 'Forward voltage of the output diode at the peak current (≈0 for a synchronous rectifier).' },
      { kind: 'number', key: 'cout', symbol: 'C_out', label: 'Output capacitance', units: U_CAP_U, unitKey: 'coutUnit', min: 1e-9, max: 1 },
      { kind: 'number', key: 'esr', symbol: 'ESR', label: 'Output cap ESR', units: U_MOHM, unitKey: 'esrUnit', min: 0, max: 100, help: 'The flyback secondary current is pulsed, so the ESR term usually dominates the ripple.' },
    ],
  },
  {
    kind: 'section',
    title: 'Switch & clamp',
    fields: [
      { kind: 'number', key: 'kClamp', symbol: 'k_c', label: 'Clamp ratio V_cl/V_OR', min: 1.01, max: 20, help: 'Clamp (snubber-capacitor) voltage over the reflected voltage. Lower clamps waste more: the loss scales with k_c/(k_c − 1) (AN-4147). See the RCD Clamp calculator to size the parts.' },
      { kind: 'number', key: 'vdss', symbol: 'V_DSS', label: 'Switch rating', unit: 'V', min: 1, max: 5000, help: 'Drain–source breakdown rating of the MOSFET; keep the clamped peak below about 90 % of it.' },
    ],
  },
  {
    kind: 'section',
    title: 'Losses (estimate)',
    collapsed: true,
    note: 'Only feed the loss estimate; the design uses the assumed η.',
    fields: [
      { kind: 'number', key: 'rds', symbol: 'R_DS(on)', label: 'Switch on-resistance', units: U_MOHM, unitKey: 'rdsUnit', min: 0, max: 100 },
      { kind: 'number', key: 'tsw', symbol: 't_sw', label: 'Switch edge time', unit: 's', min: 0, max: 1e-5, help: 'Current/voltage overlap time per edge; used for the turn-off (and in CCM the turn-on) loss ½·V·I·t·f.' },
      { kind: 'number', key: 'qg', symbol: 'Q_g', label: 'Total gate charge', unit: 'C', min: 0, max: 1e-5 },
      { kind: 'number', key: 'vg', symbol: 'V_g', label: 'Gate drive voltage', unit: 'V', min: 0, max: 30 },
      { kind: 'number', key: 'rp', symbol: 'R_p', label: 'Primary winding R', units: U_MOHM, unitKey: 'rpUnit', min: 0, max: 100 },
      { kind: 'number', key: 'rs', symbol: 'R_s', label: 'Secondary winding R', units: U_MOHM, unitKey: 'rsUnit', min: 0, max: 100 },
      { kind: 'number', key: 'pcore', symbol: 'P_core', label: 'Core loss', unit: 'W', min: 0, max: 1000, help: 'From the core maker’s loss curves at the flux swing and frequency.' },
    ],
  },
];

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;
const LIM = { n: [1e-3, 1e4], lp: [1e-9, 1] } as const;

export interface FlybackDetails {
  lo: FlybackOp;
  hi: FlybackOp;
  vclamp: number;
  vdsMax: number;
  vRect: number;
  tReset: number;
  pClamp: number;
  dvOut: number;
  losses: Record<string, number>;
  etaEst: number;
  state: FlybackState;
}

function noSolution(report: CalcReport, keys: string[], msg: string): CalcReport {
  report.warnings.push(msg);
  report.status = { text: 'NO SOLUTION', tone: 'fail' };
  const label: Record<string, string> = { n: 'Turns ratio', lp: 'Primary inductance', dmaxPct: 'Max duty', krf: 'Ripple factor' };
  for (const k of keys) report.results.push({ key: k, label: label[k], value: null, display: '—', primary: true, solved: true });
  return report;
}

export function compute(st: FlybackState): CalcReport {
  const num = ['vinMin', 'vinMax', 'vout', 'iout', 'etaPct', 'fsw', 'dmaxPct', 'n', 'krf', 'lp', 'llk', 'vf', 'cout', 'esr', 'kClamp', 'vdss', 'rds', 'tsw', 'qg', 'vg', 'rp', 'rs', 'pcore'] as const;
  for (const k of num) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!(st.vinMin > 0) || !(st.vout > 0) || !(st.iout > 0) || !(st.fsw > 0)) throw new Error('Input voltage, output voltage, output current and frequency must be > 0.');
  if (!(st.etaPct > 0 && st.etaPct <= 100)) throw new Error('Efficiency must be in (0, 100] %.');
  if (!(st.cout > 0)) throw new Error('Output capacitance must be > 0.');
  if (!(st.kClamp > 1)) throw new Error('The clamp voltage must exceed the reflected voltage (k_c > 1), or the clamp would conduct the whole off-time.');
  for (const k of ['llk', 'vf', 'esr', 'rds', 'tsw', 'qg', 'vg', 'rp', 'rs', 'pcore'] as const) if (st[k] < 0) throw new Error(`${k} must be ≥ 0.`);
  const sv = st.solveFor;
  const nIn = sv === 'lp' || sv === 'dmax';
  const lpIn = sv === 'krf' || sv === 'dmax';
  if (nIn && !(st.n > 0)) throw new Error('Turns ratio must be > 0.');
  if (lpIn && !(st.lp > 0)) throw new Error('Primary inductance must be > 0.');
  if (!nIn && !(st.dmaxPct > 0 && st.dmaxPct < 100)) throw new Error('Target duty must be between 0 and 100 %.');
  if (!lpIn && !(st.krf > 0)) throw new Error('Ripple factor must be > 0.');

  const s: FlybackState = { ...st };
  const warnings: string[] = [];
  // A typed V_in,min above V_in,max (e.g. while editing the range) keeps the page alive: the stress is then
  // evaluated at V_in,min, with a warning, instead of a red error (mode-switch harness, 2026-11-26).
  const vinLow = st.vinMax < st.vinMin;
  if (vinLow) {
    warnings.push(`V_in,max (${si(st.vinMax, 'V', 3)}) is below V_in,min (${si(st.vinMin, 'V', 3)}): stress is evaluated at V_in,min. Correct the input range.`);
    s.vinMax = st.vinMin;
  }
  const notes: string[] = [];
  const report: CalcReport = { calc: 'power/flyback-converter', ok: true, solveFor: sv, results: [], graphs: [], tables: [], warnings, notes };
  const eta = s.etaPct / 100;
  const vs = s.vout + s.vf;
  const pin = (s.vout * s.iout) / eta;
  const D = s.dmaxPct / 100;
  const inRange = (k: 'n' | 'lp', v: number) => v >= LIM[k][0] && v <= LIM[k][1];
  const rangeMsg = (k: 'n' | 'lp', v: number) => `${k === 'n' ? `N = ${v.toPrecision(4)}` : `L_p = ${si(v, 'H', 4)}`} is outside ${k === 'n' ? '0.001 – 10 000' : '1 nH – 1 H'}.`;

  // ── solve (exact inverses of the forward model)
  if (sv === 'n') {
    const r = designNL(s.vinMin, vs, pin, s.fsw, D, s.krf);
    if (!r) return noSolution(report, ['n', 'lp'], `D_max·√K_RF = ${(D * Math.sqrt(s.krf)).toPrecision(3)} must stay below 1: in DCM the duty is D_bcm/√K_RF. Lower D_max or K_RF.`);
    if (!inRange('n', r.n)) return noSolution(report, ['n', 'lp'], rangeMsg('n', r.n));
    if (!inRange('lp', r.lp)) return noSolution(report, ['n', 'lp'], rangeMsg('lp', r.lp));
    s.n = r.n;
    s.lp = r.lp;
  } else if (sv === 'lp') {
    const dB = dBoundary(s.vinMin, s.n * vs);
    const lp = lBoundary(s.vinMin, dB, pin, s.fsw) / s.krf;
    if (!inRange('lp', lp)) return noSolution(report, ['dmaxPct', 'lp'], rangeMsg('lp', lp));
    s.lp = lp;
  } else if (sv === 'krf') {
    const dd = dDcm(s.vinMin, pin, s.fsw, s.lp);
    if (D < dd * (1 - 1e-9)) {
      const n = (s.vinMin * D) / (1 - D) / vs;
      if (!inRange('n', n)) return noSolution(report, ['n', 'krf'], rangeMsg('n', n));
      s.n = n;
    } else if (D <= dd * (1 + 1e-9)) {
      // In DCM the duty √(2·P_in·f·L_p)/V_in does not depend on N: every N above the boundary value gives it.
      // Keep the entered N when it is one of them (A → B → A round trip), otherwise take the boundary N.
      const nB = (s.vinMin * dd) / (1 - dd) / vs;
      if (!(s.n >= nB) || !inRange('n', s.n)) s.n = nB;
      if (!inRange('n', s.n)) return noSolution(report, ['n', 'krf'], rangeMsg('n', s.n));
      notes.push(`With L_p = ${si(s.lp, 'H', 3)} the converter is in DCM at V_in,min, where the duty does not depend on N: any N ≥ ${nB.toPrecision(4)} gives D_max = ${pct(dd, 2)}.`);
    } else {
      return noSolution(report, ['n', 'krf'], `L_p = ${si(s.lp, 'H', 3)} limits the duty to ${pct(dd, 2)} (the DCM value √(2·P_in·f_sw·L_p)/V_in,min): no N reaches ${pct(D, 2)}. Raise L_p or lower D_max.`);
    }
  }

  const pt = (vin: number) => analyzeFlyback({ vin, vout: s.vout, iout: s.iout, vf: s.vf, eta, fsw: s.fsw, n: s.n, lp: s.lp });
  const lo = pt(s.vinMin);
  const hi = pt(s.vinMax);
  if (sv === 'lp' || sv === 'dmax') s.dmaxPct = lo.d * 100;
  if (sv === 'krf' || sv === 'dmax') s.krf = lo.krf;

  // ── stress, clamp, ripple
  const vor = lo.vor;
  const vclamp = s.kClamp * vor;
  const vdsMax = s.vinMax + vclamp;
  const vdsPlateau = s.vinMax + vor;
  const vRect = s.vout + s.vinMax / s.n;
  const tReset = clampResetTime(s.llk, lo.ipPk, vclamp, vor);
  const pClamp = clampPower(s.llk, lo.ipPk, s.fsw, vclamp, vor);
  const rLo = flybackOutputRipple(lo, s.iout, s.cout, s.esr);
  const rHi = flybackOutputRipple(hi, s.iout, s.cout, s.esr);
  const dvOut = Math.max(rLo, rHi);
  const worstR = rHi > rLo ? hi : lo;
  const iCoutRms = Math.sqrt(Math.max(Math.max(lo.isRms, hi.isRms) ** 2 - s.iout ** 2, 0));
  const lsec = s.lp / (s.n * s.n);

  // ── loss estimate at V_in,min, full load
  const losses = {
    cond: lo.ipRms ** 2 * s.rds,
    sw: 0.5 * (s.vinMin + vor) * (lo.ipPk + lo.ipVal) * s.tsw * s.fsw,
    gate: s.qg * s.vg * s.fsw,
    rect: s.vf * s.iout,
    cu: lo.ipRms ** 2 * s.rp + lo.isRms ** 2 * s.rs,
    core: s.pcore,
    clamp: pClamp,
  };
  const pLoss = Object.values(losses).reduce((a, b) => a + b, 0);
  const etaEst = lo.pout / (lo.pout + pLoss);

  // ── checks
  const etaCap = s.vout / vs;
  if (eta > etaCap) warnings.push(`η = ${pct(eta)} is above V_out/(V_out + V_F) = ${pct(etaCap)}: the rectifier drop alone loses more than that. Lower η (or V_F, e.g. a synchronous rectifier).`);
  if (vdsMax > s.vdss) warnings.push(`Clamped drain peak ${si(vdsMax, 'V', 4)} (V_in,max + V_clamp) exceeds the switch rating V_DSS = ${si(s.vdss, 'V', 3)}. Use a higher-voltage switch, lower N (V_OR) or the clamp ratio.`);
  else if (vdsMax > 0.9 * s.vdss) warnings.push(`Clamped drain peak ${si(vdsMax, 'V', 4)} is ${pct(vdsMax / s.vdss, 0)} of V_DSS: leave ≥ 10 % margin for ringing and layout (derate to 80–90 %).`);
  if (lo.mode === 'ccm' && lo.d > 0.5) warnings.push(`D_max = ${pct(lo.d)} in CCM: with peak-current-mode control a duty above 50 % needs slope compensation against subharmonic oscillation (and the right-half-plane zero moves lower). Lower N or check the controller.`);
  if (lo.d > 0.8) warnings.push(`D_max = ${pct(lo.d)} is above what most flyback controllers allow (typically 70–80 %). Lower N.`);
  const tonMin = hi.d / s.fsw;
  if (tonMin < 200e-9) warnings.push(`On-time at V_in,max is only ${si(tonMin, 's', 3)}: below typical leading-edge blanking / minimum on-time (≈150–300 ns). Lower f_sw or raise N.`);
  if (s.llk > 0 && tReset > lo.d2 * lo.period) warnings.push(`Leakage reset time ${si(tReset, 's', 3)} is longer than the secondary conduction time ${si(lo.d2 * lo.period, 's', 3)}: the clamp eats most of the transfer. Reduce L_lk or raise k_c.`);
  if (pClamp > 0.05 * lo.pout) warnings.push(`Clamp dissipation ${si(pClamp, 'W', 3)} is ${pct(pClamp / lo.pout)} of P_out: reduce leakage (interleaved windings), raise k_c, or consider an active clamp.`);
  if (s.kClamp < 1.3) notes.push(`Clamp ratio k_c = ${s.kClamp.toPrecision(3)}: the clamp loss is ${(s.kClamp / (s.kClamp - 1)).toFixed(1)}× the bare leakage energy and the clamp diode starts to steal secondary current. AN-4147 designs typically use 1.5–2.5.`);
  if (lo.mode !== hi.mode) notes.push(`CCM at V_in,min, DCM at V_in,max: normal for a design sized for CCM at low line; the control loop sees both plants.`);
  if (Math.abs(etaEst - eta) > 0.03) notes.push(`The loss estimate gives η ≈ ${pct(etaEst)} vs the assumed ${pct(eta)}; set η to it so the primary currents follow.`);

  // ── results
  const it = (key: string, label: string, value: number | string, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const nS = sv === 'n' || sv === 'krf';
  const lS = sv === 'n' || sv === 'lp';
  const res: ResultItem[] = [];
  const rN = it('n', 'Turns ratio N_p/N_s', s.n, '', s.n.toPrecision(4), { symbol: 'N', solved: nS, primary: true, note: `V_OR = ${si(vor, 'V', 4)} · N_s/N_p = ${(1 / s.n).toPrecision(3)}` });
  const rL = it('lp', 'Primary inductance', s.lp, 'H', si(s.lp, 'H', 4), { symbol: 'L_p', solved: lS, primary: true, note: `L_crit = ${si(lo.lCrit, 'H', 3)} (BCM at V_in,min)` });
  const rD = it('dmaxPct', 'Max duty (V_in,min)', lo.d * 100, '%', pct(lo.d, 2), { symbol: 'D_max', solved: !nS, primary: true, note: `D_min = ${pct(hi.d, 1)} at V_in,max · ${lo.mode.toUpperCase()}` });
  const solvedFirst = [rN, rL, rD].sort((a, b) => Number(!!b.solved) - Number(!!a.solved));
  res.push(...solvedFirst);
  res.push(
    it('ipPk', 'Peak primary current', lo.ipPk, 'A', si(lo.ipPk, 'A', 4), { symbol: 'I_p,pk', primary: true, note: `at V_in,min · rms ${si(lo.ipRms, 'A', 3)} · core must not saturate` }),
    it('vdsMax', 'Peak drain voltage', vdsMax, 'V', si(vdsMax, 'V', 4), { symbol: 'V_DS,max', primary: true, tone: vdsMax > s.vdss ? 'fail' : vdsMax > 0.9 * s.vdss ? 'warn' : '', note: `V_in,max + k_c·V_OR · ${pct(vdsMax / s.vdss, 0)} of V_DSS` }),
  );
  const gP = 'Primary (V_in,min, full load)';
  res.push(
    it('krf', 'Ripple factor', lo.krf, '', lo.krf.toPrecision(4), { symbol: 'K_RF', solved: !lS, group: gP, note: lo.mode === 'ccm' ? 'ΔI/(2·I_EDC), AN-4137' : 'L_crit/L_p > 1: DCM' }),
    it('vor', 'Reflected voltage', vor, 'V', si(vor, 'V', 4), { symbol: 'V_OR', group: gP, note: 'N·(V_out + V_F)' }),
    it('iEdc', 'Mid-ramp current', lo.iEdc, 'A', si(lo.iEdc, 'A', 4), { symbol: 'I_EDC', group: gP, note: 'P_in/(V_in·D)' }),
    it('dIp', 'Ripple current (p-p)', lo.dIp, 'A', si(lo.dIp, 'A', 4), { symbol: 'ΔI_p', group: gP }),
    it('ipVal', 'Valley current', lo.ipVal, 'A', si(lo.ipVal, 'A', 4), { symbol: 'I_p,min', group: gP }),
    it('ipRms', 'Primary RMS current', lo.ipRms, 'A', si(lo.ipRms, 'A', 4), { symbol: 'I_p,rms', group: gP }),
    it('iin', 'Average input current', lo.ipAvg, 'A', si(lo.ipAvg, 'A', 4), { symbol: 'I_in', group: gP, note: `P_in = ${si(lo.pin, 'W', 3)}` }),
    it('ton', 'On-time', lo.d / s.fsw, 's', si(lo.d / s.fsw, 's', 3), { symbol: 't_on', group: gP, note: `at V_in,max ${si(tonMin, 's', 3)}` }),
  );
  const gH = 'At V_in,max';
  res.push(
    it('dMin', 'Duty at V_in,max', hi.d, '', pct(hi.d, 2), { symbol: 'D_min', group: gH }),
    it('ipPkHi', 'Peak primary current', hi.ipPk, 'A', si(hi.ipPk, 'A', 4), { group: gH }),
    it('modeHi', 'Conduction mode', hi.mode, '', hi.mode === 'ccm' ? `CCM (K_RF ${hi.krf.toPrecision(3)})` : `DCM (L_crit/L_p ${hi.krf.toPrecision(3)})`, { group: gH }),
    it('vdsPlateau', 'Drain plateau', vdsPlateau, 'V', si(vdsPlateau, 'V', 4), { group: gH, note: 'V_in,max + V_OR, after the clamp spike' }),
    it('vRect', 'Rectifier reverse voltage', vRect, 'V', si(vRect, 'V', 4), { symbol: 'V_R', group: gH, note: 'V_out + V_in,max/N, plus ringing: derate' }),
  );
  const gS = 'Secondary & output';
  res.push(
    it('isPk', 'Secondary peak current', s.n * lo.ipPk, 'A', si(s.n * lo.ipPk, 'A', 4), { symbol: 'I_s,pk', group: gS, note: 'N·I_p,pk at V_in,min: rate the rectifier for this' }),
    it('isRms', 'Secondary RMS current', lo.isRms, 'A', si(lo.isRms, 'A', 4), { symbol: 'I_s,rms', group: gS, note: 'waveform scaled to average I_out (AN-4137 step 9)' }),
    it('dvOut', 'Output ripple (p-p)', dvOut, 'V', si(dvOut, 'V', 3), { symbol: 'ΔV_out', group: gS, note: `worst at V_in,${worstR === hi ? 'max' : 'min'} · ESR part ${si(s.esr * worstR.isPk, 'V', 3)}` }),
    it('iCoutRms', 'Output cap RMS current', iCoutRms, 'A', si(iCoutRms, 'A', 3), { symbol: 'I_Cout,rms', group: gS, note: '√(I_s,rms² − I_out²)' }),
    it('lsec', 'Secondary inductance', lsec, 'H', si(lsec, 'H', 3), { symbol: 'L_s', group: gS, note: 'L_p/N²' }),
  );
  const gT = 'Transformer energy';
  res.push(
    it('ePk', 'Stored at peak', lo.ePk, 'J', si(lo.ePk, 'J', 3), { symbol: 'E_pk', group: gT, note: '½·L_p·I_p,pk²: what the gapped core must hold' }),
    it('eCycle', 'Transferred per cycle', lo.eCycle, 'J', si(lo.eCycle, 'J', 3), { symbol: 'E_cyc', group: gT, note: 'P_in/f_sw = ½·L_p·(I_pk² − I_min²)' }),
  );
  const gC = 'Clamp & leakage';
  res.push(
    it('vclamp', 'Clamp voltage', vclamp, 'V', si(vclamp, 'V', 4), { symbol: 'V_clamp', group: gC, note: 'above V_in (clamp-capacitor voltage)' }),
    it('tReset', 'Leakage reset time', tReset, 's', si(tReset, 's', 3), { symbol: 't_s', group: gC, note: 'L_lk·I_pk/(V_clamp − V_OR)' }),
    it('pClamp', 'Clamp dissipation', pClamp, 'W', si(pClamp, 'W', 3), { symbol: 'P_clamp', group: gC, tone: pClamp > 0.05 * lo.pout ? 'warn' : '', note: '½·L_lk·I_pk²·f·k_c/(k_c − 1), AN-4147' }),
  );
  res.push(
    it('pLoss', 'Total loss (estimate)', pLoss, 'W', si(pLoss, 'W', 3), { group: 'Losses', note: `η ≈ ${pct(etaEst)} (assumed ${pct(eta)})` }),
    it('etaEst', 'Efficiency (estimate)', etaEst, '', pct(etaEst), { symbol: 'η_est', group: 'Losses' }),
  );
  report.results = res;
  report.tables = [lossTable(losses, pLoss, lo.pout)];
  report.summary = `${si(s.vinMin, 'V', 3)}–${si(s.vinMax, 'V', 3)} → ${si(s.vout, 'V', 3)} at ${si(s.iout, 'A', 3)} (${si(lo.pout, 'W', 3)}) · f_sw ${si(s.fsw, 'Hz', 3)} · ${lo.mode.toUpperCase()} at V_in,min`;
  notes.push(
    'Steady state with ideal switch timing; magnetizing current sized from P_in = P_out/η (AN-4137), secondary current scaled to deliver I_out.',
    'L_p is the magnetizing inductance; leakage only enters the clamp loss and the drain spike. Ringing, C_oss and reverse recovery are not modelled.',
    'Duty, peak current, ripple factor and clamp loss are evaluated at V_in,min (worst for current); drain and rectifier stress at V_in,max.',
  );
  report.details = { lo, hi, vclamp, vdsMax, vRect, tReset, pClamp, dvOut, losses, etaEst, state: s } satisfies FlybackDetails;
  report.graphs = graphs(s, lo, vclamp, tReset);
  return report;
}

function lossTable(l: Record<string, number>, total: number, pout: number): TableSpec {
  const rows: [string, number, string][] = [
    ['Switch conduction', l.cond, 'I_p,rms²·R_DS(on)'],
    ['Switching edges', l.sw, '½·(V_in + V_OR)·(I_pk + I_min)·t_sw·f'],
    ['Gate drive', l.gate, 'Q_g·V_g·f'],
    ['Rectifier', l.rect, 'V_F·I_out'],
    ['Windings', l.cu, 'I_p,rms²·R_p + I_s,rms²·R_s'],
    ['Core', l.core, 'entered'],
    ['RCD clamp', l.clamp, '½·L_lk·I_pk²·f·k_c/(k_c − 1)'],
    ['Total', total, ''],
  ];
  return {
    id: 'losses',
    title: 'Loss breakdown (V_in,min, full load)',
    columns: [
      { key: 'part', label: 'Loss', align: 'left' },
      { key: 'p', label: 'Power', unit: 'W' },
      { key: 'share', label: 'Share', unit: '%' },
      { key: 'formula', label: 'Formula', align: 'left' },
    ],
    rows: rows.map(([part, p, formula]) => ({ part, p, share: total > 0 ? (p / total) * 100 : 0, formula })),
    display: rows.map(([part, p, formula]) => ({ part, p: si(p, 'W', 3), share: total > 0 ? `${((p / total) * 100).toFixed(1)} %` : '—', formula })),
    note: `First-order estimate: η ≈ ${pct(pout / (pout + total))}. C_oss discharge, reverse recovery and controller supply are not included.`,
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: FlybackState, lo: FlybackOp, vclamp: number, tReset: number): GraphSpec[] {
  const T = lo.period;
  const D = lo.d;
  const t2 = (D + lo.d2) * T;
  // primary and secondary current, drain voltage; two periods at V_in,min
  const tp: number[] = [];
  const ip: number[] = [];
  const ts: number[] = [];
  const is: number[] = [];
  const tv: number[] = [];
  const vd: number[] = [];
  const ton = D * T;
  const tsp = Math.min(tReset, lo.d2 * T);
  for (let k = 0; k < 2; k++) {
    const o = k * T;
    tp.push(o, o, o + ton, o + ton, o + T);
    ip.push(0, lo.ipVal, lo.ipPk, 0, 0);
    ts.push(o, o + ton, o + ton, o + t2, o + t2, o + T);
    is.push(0, 0, lo.isPk, lo.isVal, 0, 0);
    tv.push(o, o + ton, o + ton, o + ton + tsp, o + ton + tsp, o + t2, o + t2, o + T);
    const vOff = lo.mode === 'dcm' ? s.vinMin : s.vinMin + lo.vor;
    vd.push(0, 0, s.vinMin + vclamp, s.vinMin + vclamp, s.vinMin + lo.vor, s.vinMin + lo.vor, vOff, vOff);
  }
  const waves: GraphSpec = {
    id: 'waveforms',
    title: 'Waveforms',
    subtitle: `At V_in,min, full load${lo.mode === 'dcm' ? ' · DCM: the drain rings around V_in once the secondary current stops (drawn flat)' : ''}`,
    x: { label: 'Time', unit: 's' },
    y: [
      { id: 'i', label: 'Current', unit: 'A', includeZero: true },
      { id: 'v', label: 'Drain voltage', unit: 'V', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'v_DS', x: tv, y: vd, axis: 'v', color: '#9a8f7a', width: 1.3 },
      { label: 'i_p', x: tp, y: ip, axis: 'i', color: '#1f4e5f', width: 2.2 },
      { label: 'i_s', x: ts, y: is, axis: 'i', color: '#c47b17', width: 1.8 },
    ],
    hlines: [{ value: s.vdss, label: `V_DSS ${si(s.vdss, 'V', 3)}`, axis: 'v', color: '#8b1e1e', dash: [5, 4] }],
    legend: 'below',
  };

  // Turns-ratio trade-off at the entered L_p: duty, drain peak and rectifier stress vs N
  const eta = s.etaPct / 100;
  const ns = logspace(s.n / 4, s.n * 4, 120);
  const pin = (s.vout * s.iout) / eta;
  const dd = dDcm(s.vinMin, pin, s.fsw, s.lp);
  const vs = s.vout + s.vf;
  const tradeoff: GraphSpec = {
    id: 'turns-ratio',
    title: 'Stress vs N',
    subtitle: `L_p = ${si(s.lp, 'H', 3)} held; D_max flattens where the design enters DCM`,
    x: { label: 'Turns ratio N_p/N_s', unit: '', log: true },
    y: [
      { id: 'v', label: 'Voltage', unit: 'V', includeZero: true },
      { id: 'd', label: 'D_max', unit: '%', side: 'right', min: 0, max: 100 },
    ],
    series: [
      { label: 'V_DS,max', x: ns, y: ns.map((n) => s.vinMax + s.kClamp * n * vs), axis: 'v', width: 2.2 },
      { label: 'V_R rectifier', x: ns, y: ns.map((n) => s.vout + s.vinMax / n), axis: 'v', color: '#4f8a8b', width: 1.6 },
      { label: 'D_max', x: ns, y: ns.map((n) => Math.min(dBoundary(s.vinMin, n * vs), dd) * 100), axis: 'd', color: '#c47b17', width: 1.6, dash: [5, 3] },
    ],
    hlines: [{ value: s.vdss, label: `V_DSS ${si(s.vdss, 'V', 3)}`, axis: 'v', color: '#8b1e1e', dash: [5, 4] }],
    vlines: [{ value: s.n, label: `N = ${s.n.toPrecision(3)}` }],
    markers: [{ x: s.n, y: s.vinMax + vclamp, axis: 'v', label: si(s.vinMax + vclamp, 'V', 3) }],
  };

  // Peak/valley current and stored energy vs L_p at the entered N
  const ls = logspace(s.lp / 10, s.lp * 10, 120);
  const sweep = ls.map((lp) => analyzeFlyback({ vin: s.vinMin, vout: s.vout, iout: s.iout, vf: s.vf, eta, fsw: s.fsw, n: s.n, lp }));
  const vl: GraphSpec['vlines'] = [{ value: s.lp, label: `L_p = ${si(s.lp, 'H', 3)}` }];
  if (lo.lCrit > ls[0] && lo.lCrit < ls[ls.length - 1]) vl.push({ value: lo.lCrit, label: 'BCM', color: '#8b1e1e', dash: [3, 3] });
  const vsL: GraphSpec = {
    id: 'current-vs-lp',
    title: 'Current vs L_p',
    subtitle: 'At V_in,min, full load, N held: left of BCM the design is DCM',
    x: { label: 'Primary inductance L_p', unit: 'H', log: true },
    y: [
      { id: 'i', label: 'Primary current', unit: 'A', includeZero: true },
      { id: 'e', label: 'Stored energy', unit: 'J', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'I_p,pk', x: ls, y: sweep.map((o) => o.ipPk), axis: 'i', width: 2.2 },
      { label: 'I_p,min', x: ls, y: sweep.map((o) => o.ipVal), axis: 'i', color: '#4f8a8b', width: 1.6 },
      { label: '½·L_p·I_pk²', x: ls, y: sweep.map((o) => o.ePk), axis: 'e', color: '#c47b17', width: 1.4, dash: [5, 3] },
    ],
    vlines: vl,
    markers: [{ x: s.lp, y: lo.ipPk, axis: 'i', label: si(lo.ipPk, 'A', 3) }],
  };
  return [waves, tradeoff, vsL];
}

export const def: CalcDef<FlybackState> = {
  id: 'power/flyback-converter',
  version: '0.1.0',
  method:
    'Steady-state single-output flyback (CCM/DCM) per Fairchild AN-4137 (P_in = P_out/η, V_RO, D_max, K_RF, L_m) and Erickson & Maksimović §6.3.4 / ch. 5 (volt-second balance, DCM); RCD clamp loss and leakage reset per Fairchild AN-4147; drain stress V_in,max + V_clamp and rectifier stress V_out + V_in,max/N (TI SLUP254). Output ripple evaluated exactly on the piecewise-linear secondary current (charge + ESR). N, L_p, D_max and K_RF are exact algebraic inverses of the forward model.',
  fields,
  defaults,
  solve: {
    default: 'n',
    analysis: 'dmax',
    options: [
      { key: 'n', label: 'Design: N and L_p from D_max and K_RF' },
      { key: 'lp', label: 'L_p for a ripple factor (N given)' },
      { key: 'krf', label: 'N for a max duty (L_p given)' },
      { key: 'dmax', label: 'Analyse a transformer: D_max and K_RF from N, L_p' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '36–72 V → 12 V, 2 A telecom at 200 kHz: design N and L_p (D 45 %, K_RF 0.5)', state: defaults() },
    {
      id: 'offline',
      label: 'Off-line 120–375 V DC → 12 V, 1 A at 65 kHz, 650 V switch (CCM, K_RF 0.5)',
      state: { solveFor: 'n', vinMin: 120, vinMax: 375, vout: 12, iout: 1, etaPct: 86, fsw: 65e3, fswUnit: 'kHz', dmaxPct: 45, krf: 0.5, lpUnit: 'mH', llk: 30e-6, llkUnit: 'µH', vf: 0.5, cout: 470e-6, coutUnit: 'µF', esr: 50e-3, esrUnit: 'mΩ', kClamp: 1.5, vdss: 650, rds: 2, rdsUnit: 'Ω', tsw: 30e-9, qg: 10e-9, vg: 12, rp: 1, rpUnit: 'Ω', rs: 20e-3, rsUnit: 'mΩ', pcore: 0.15 },
    },
    {
      id: 'analyse',
      label: 'Analyse a 2:1 transformer, L_p = 10 µH: 18–36 V → 5 V, 3 A at 250 kHz',
      state: { solveFor: 'dmax', vinMin: 18, vinMax: 36, vout: 5, iout: 3, etaPct: 85, fsw: 250e3, fswUnit: 'kHz', n: 2, lp: 10e-6, lpUnit: 'µH', llk: 0.1e-6, llkUnit: 'µH', vf: 0.5, cout: 220e-6, coutUnit: 'µF', esr: 5e-3, esrUnit: 'mΩ', kClamp: 1.8, vdss: 80, rds: 15e-3, rdsUnit: 'mΩ', tsw: 15e-9, qg: 20e-9, vg: 10, rp: 15e-3, rpUnit: 'mΩ', rs: 5e-3, rsUnit: 'mΩ', pcore: 0.2 },
    },
    {
      id: 'fixed-lp',
      label: 'Fixed L_p = 100 µH: N for D_max = 40 %, 36–72 V → 5 V — a 100 V switch is too small',
      state: { solveFor: 'krf', vinMin: 36, vinMax: 72, vout: 5, iout: 2, etaPct: 85, fsw: 200e3, fswUnit: 'kHz', dmaxPct: 40, lp: 100e-6, lpUnit: 'µH', llk: 1e-6, llkUnit: 'µH', vf: 0.4, cout: 150e-6, coutUnit: 'µF', esr: 10e-3, esrUnit: 'mΩ', kClamp: 1.5, vdss: 100, rds: 50e-3, rdsUnit: 'mΩ', tsw: 20e-9, qg: 15e-9, vg: 10, rp: 60e-3, rpUnit: 'mΩ', rs: 8e-3, rsUnit: 'mΩ', pcore: 0.1 },
    },
    {
      id: 'dcm-boost',
      label: 'DCM step-up: 9–18 V → 24 V, 0.25 A, K_RF = 1.3 (N < 1)',
      state: { solveFor: 'n', vinMin: 9, vinMax: 18, vout: 24, iout: 0.25, etaPct: 85, fsw: 150e3, fswUnit: 'kHz', dmaxPct: 45, krf: 1.3, lpUnit: 'µH', llk: 0.1e-6, llkUnit: 'µH', vf: 0.6, cout: 47e-6, coutUnit: 'µF', esr: 30e-3, esrUnit: 'mΩ', kClamp: 1.8, vdss: 60, rds: 30e-3, rdsUnit: 'mΩ', tsw: 15e-9, qg: 10e-9, vg: 10, rp: 20e-3, rpUnit: 'mΩ', rs: 150e-3, rsUnit: 'mΩ', pcore: 0.05 },
    },
  ],
};
