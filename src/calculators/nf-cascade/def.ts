/**
 * Cascaded noise figure, gain and IP3 (Friis) — pure definition.
 *
 * Noise:  F = F₁ + (F₂−1)/G₁ + (F₃−1)/(G₁G₂) + …   (Friis 1944), Te = T₀(F−1), T₀ = 290 K.
 * Passive lossy stage at physical temperature Tp: G = 1/L, F = 1 + (L−1)·Tp/T₀.
 * IP3:    1/IIP3 = Σ (G₁…G_{i−1}) / IIP3ᵢ  (linear powers; worst case — IM3 products add in phase).
 * Solve-for: the cascade NF (default), or the largest NF one stage may have for a target cascade NF.
 */

import type { CalcDef, CalcReport, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ } from '@/core/unitsets';

export const T0 = 290;
export const K_B = 1.380649e-23;

export type StageType = 'amp' | 'mixer' | 'passive';

export interface Stage {
  name: string;
  type: StageType;
  /** dB (active stages) */
  gain: number;
  /** dB (active stages) */
  nf: number;
  /** dB insertion loss (passive stages) */
  loss: number;
  /** K, physical temperature of a passive stage */
  tPhys: number;
  /** dBm output IP3, null = not specified (∞) */
  oip3: number | null;
}

export interface NfState {
  solveFor: 'nfTotal' | 'nfStage';
  /** Target cascade NF when solving for a stage NF (dB) */
  nfTotal: number;
  /** Index of the stage whose NF is solved */
  solveStage: number;
  bw: number;
  bwUnit: string;
  pin: number;
  snrReq: number;
  tSrc: number;
  stages: Stage[];
}

const stage = (name: string, type: StageType, gain: number, nf: number, oip3: number | null, loss = 0): Stage => ({ name, type, gain, nf, loss, tPhys: 290, oip3 });

export const defaults = (): NfState => ({
  solveFor: 'nfTotal',
  nfTotal: 3,
  solveStage: 1,
  bw: 1e6,
  bwUnit: 'MHz',
  pin: -90,
  snrReq: 10,
  tSrc: 290,
  stages: [
    stage('Preselect filter', 'passive', 0, 0, null, 1.5),
    stage('LNA', 'amp', 18, 1.2, 30),
    stage('Mixer', 'mixer', -7, 8, 15),
    stage('IF amplifier', 'amp', 20, 4, 35),
  ],
});

const dbToLin = (db: number) => 10 ** (db / 10);
const linToDb = (x: number) => 10 * Math.log10(x);

/** Effective gain (dB) and noise factor of one stage. */
export function stageGF(s: Stage): { gDb: number; f: number } {
  if (s.type === 'passive') {
    const l = dbToLin(s.loss);
    return { gDb: -s.loss, f: 1 + ((l - 1) * s.tPhys) / T0 };
  }
  return { gDb: s.gain, f: dbToLin(s.nf) };
}

/** Friis cascade of noise factors (linear). */
export function friis(fs: number[], gs: number[]): number {
  let f = 0;
  let g = 1;
  fs.forEach((fi, i) => {
    f += i === 0 ? fi : (fi - 1) / g;
    g *= gs[i];
  });
  return fs.length ? f : 1;
}

export interface CascadeRow {
  name: string;
  gDb: number;
  nfDb: number;
  cumGainDb: number;
  cumNfDb: number;
  cumTe: number;
  /** Share of the cascade's excess noise (F−1) caused by this stage, 0…1 */
  contrib: number;
  cumIip3: number | null;
  cumOip3: number | null;
  signal: number;
  noise: number;
  snr: number;
}

export function cascade(st: NfState): { rows: CascadeRow[]; f: number; gDb: number; iip3: number | null; noiseIn: number } {
  const gf = st.stages.map(stageGF);
  const fs = gf.map((x) => x.f);
  const gs = gf.map((x) => dbToLin(x.gDb));
  const fTot = friis(fs, gs);
  const kTB = linToDb(K_B * T0 * st.bw * 1e3); // dBm, at T0
  const rows: CascadeRow[] = [];
  let gCum = 1;
  let invIip3 = 0; // 1/mW
  let anyIp3 = false;
  st.stages.forEach((s, i) => {
    const gPre = gCum;
    gCum *= gs[i];
    if (s.oip3 != null) {
      const iip3 = dbToLin(s.oip3) / gs[i]; // mW referred to this stage's input
      invIip3 += gPre / iip3;
      anyIp3 = true;
    }
    const fCum = friis(fs.slice(0, i + 1), gs.slice(0, i + 1));
    const cumIip3 = anyIp3 ? linToDb(1 / invIip3) : null;
    const cumGainDb = linToDb(gCum);
    // Noise at this stage's output with the source at tSrc: k(Ts + Te)B·G
    const te = T0 * (fCum - 1);
    const noise = linToDb(K_B * (st.tSrc + te) * st.bw * 1e3) + cumGainDb;
    const signal = st.pin + cumGainDb;
    rows.push({
      name: s.name || `Stage ${i + 1}`,
      gDb: gf[i].gDb,
      nfDb: linToDb(fs[i]),
      cumGainDb,
      cumNfDb: linToDb(fCum),
      cumTe: te,
      contrib: fTot > 1 ? (i === 0 ? fs[0] - 1 : (fs[i] - 1) / gPre) / (fTot - 1) : 0,
      cumIip3,
      cumOip3: cumIip3 != null ? cumIip3 + cumGainDb : null,
      signal,
      noise,
      snr: signal - noise,
    });
  });
  return { rows, f: fTot, gDb: linToDb(gCum), iip3: anyIp3 ? linToDb(1 / invIip3) : null, noiseIn: kTB };
}

/** Largest noise factor stage k may have so the cascade meets fTarget (closed form). */
export function solveStageF(st: NfState, k: number, fTarget: number): number {
  const gf = st.stages.map(stageGF);
  const fs = gf.map((x) => x.f);
  const gs = gf.map((x) => dbToLin(x.gDb));
  const a = k > 0 ? friis(fs.slice(0, k), gs.slice(0, k)) : 0;
  const gPre = gs.slice(0, k).reduce((p, g) => p * g, 1);
  const rest = k + 1 < fs.length ? friis(fs.slice(k + 1), gs.slice(k + 1)) - 1 : 0;
  // F_target = A + (F_k − 1)/G_pre + rest/(G_pre·G_k)   (for k = 0: A = 0 and the first term is F₀ itself)
  return k === 0 ? fTarget - rest / gs[0] : 1 + gPre * (fTarget - a) - rest / gs[k];
}

const isSolvedStage = (scope: any, root: any) => root.solveFor === 'nfStage' && root.stages?.indexOf(scope) === root.solveStage;

const stageFields: FieldSpec[] = [
  { kind: 'text', key: 'name', label: 'Name', maxLength: 32 },
  { kind: 'select', key: 'type', label: 'Type', structural: true, options: [{ value: 'amp', label: 'Amplifier' }, { value: 'mixer', label: 'Mixer / active' }, { value: 'passive', label: 'Passive / lossy (filter, cable, attenuator)' }] },
  { kind: 'number', key: 'gain', symbol: 'G', label: 'Gain', suffix: 'dB', min: -100, max: 100, visible: (s) => s.type !== 'passive' },
  {
    kind: 'number', key: 'nf', symbol: 'NF', label: 'Noise figure', suffix: 'dB', min: 0, max: 60, visible: (s) => s.type !== 'passive',
    solvable: true, solvedWhen: isSolvedStage,
    onSolve: (s, root) => { root.solveFor = 'nfStage'; root.solveStage = root.stages.indexOf(s); },
    help: 'Click ◎ to find the largest NF this stage may have for the target cascade NF.',
  },
  { kind: 'number', key: 'loss', symbol: 'L', label: 'Insertion loss', suffix: 'dB', min: 0, max: 100, visible: (s) => s.type === 'passive', help: 'A matched passive stage at physical temperature Tp has G = 1/L and F = 1 + (L − 1)·Tp/290 K (= L at 290 K).' },
  { kind: 'number', key: 'tPhys', symbol: 'Tp', label: 'Physical temperature', suffix: 'K', min: 0, max: 2000, visible: (s) => s.type === 'passive' },
  { kind: 'number', key: 'oip3', symbol: 'OIP3', label: 'Output IP3', suffix: 'dBm', min: -100, max: 100, optional: true, zeroHint: '∞ (not given)', help: 'Leave blank for a linear stage (passives usually).' },
];

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'System',
    fields: [
      { kind: 'number', key: 'nfTotal', symbol: 'NF_sys', label: 'Cascade noise figure', suffix: 'dB', min: 0, max: 60, solvable: true, help: 'Result by default. Click ◎ on a stage’s NF to make this the target instead.' },
      { kind: 'number', key: 'bw', symbol: 'B', label: 'Noise bandwidth', units: U_FREQ, unitKey: 'bwUnit', min: 1, max: 1e12 },
      { kind: 'number', key: 'pin', symbol: 'P_in', label: 'Input signal power', suffix: 'dBm', min: -250, max: 100, help: 'Used for the level diagram and per-stage SNR.' },
      { kind: 'number', key: 'snrReq', symbol: 'SNR', label: 'Required SNR', suffix: 'dB', min: -50, max: 100, help: 'Sensitivity = noise floor + NF + required SNR.' },
      { kind: 'number', key: 'tSrc', symbol: 'Tₛ', label: 'Source (antenna) temperature', suffix: 'K', min: 0, max: 1e10, help: 'NF is defined with a 290 K source. A cold sky (tens of K) lowers the noise floor; HF antennas see external noise of 10⁵–10⁸ K (ITU-R P.372), which then dominates.' },
    ],
  },
  {
    kind: 'section',
    title: 'Stages (input → output)',
    fields: [
      {
        kind: 'list',
        key: 'stages',
        addLabel: 'Add stage',
        maxItems: 16,
        itemTitle: (s, i) => `${i + 1} · ${s.name || 'Stage'}`,
        create: (prev) => (prev ? { ...structuredClone(prev), name: `Stage` } : stage('Stage', 'amp', 0, 0, null)),
        fields: [{ kind: 'group', fields: stageFields }],
      },
    ],
  },
];

export function compute(st: NfState): CalcReport {
  const warnings: string[] = [];
  const notes: string[] = [];
  if (!st.stages.length) throw new Error('Add at least one stage.');
  const solving = st.solveFor === 'nfStage';
  const k = Math.min(Math.max(st.solveStage | 0, 0), st.stages.length - 1);
  const work: NfState = structuredClone(st);
  let solvedNf: number | null = null;
  let feasible = true;
  if (solving && work.stages[k].type === 'passive') {
    warnings.push(`Stage ${k + 1} is passive — its NF is set by its loss, so it cannot be solved for. Showing the cascade NF instead; pick an active stage.`);
  }
  const solvable = solving && work.stages[k].type !== 'passive';
  if (solvable) {
    let fk = solveStageF(work, k, dbToLin(st.nfTotal));
    if (fk < 1 && fk > 1 - 1e-9) fk = 1; // exactly at the noiseless limit
    if (!(fk >= 1)) {
      // Stays ok: the page is a verdict (NOT ACHIEVABLE) on the cascade as it stands, with the solved NF
      // box blank and the graphs of the current stages, rather than a red error.
      feasible = false;
      warnings.push(`Not achievable: even a noiseless stage ${k + 1} (NF = 0 dB) gives a cascade NF above ${+st.nfTotal.toFixed(3)} dB with its current gain. Increase this stage's gain, reduce loss before it, or reduce the noise of later stages.`);
    } else {
      solvedNf = linToDb(fk);
      work.stages[k].nf = solvedNf;
    }
  }
  const c = cascade(work);
  const nfDb = linToDb(c.f);
  const te = T0 * (c.f - 1);
  const floor = linToDb(K_B * T0 * st.bw * 1e3);
  const mds = floor + nfDb; // input-referred noise floor with the standard 290 K source
  // With the actual source temperature: N = k(Ts + Te)B (equals kT₀B·F when Ts = 290 K)
  const floorTs = linToDb(K_B * (st.tSrc + te) * st.bw * 1e3);
  const sens = floorTs + st.snrReq;
  const sfdr = c.iip3 != null && Number.isFinite(floorTs) ? (2 / 3) * (c.iip3 - floorTs) : null;
  const dbm = (x: number, d = 1) => (Number.isFinite(x) ? `${x.toFixed(d)} dBm` : x < 0 ? '−∞ (no noise)' : '∞');
  const db = (x: number, d = 1) => (Number.isFinite(x) ? `${x.toFixed(d)} dB` : x > 0 ? '∞' : '−∞');
  const last = c.rows[c.rows.length - 1];

  const r = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  if (solvable) {
    const big = solvedNf != null && solvedNf > 60;
    results.push(r(`stages.${k}.nf`, `Max NF of stage ${k + 1} (${st.stages[k].name})`, solvedNf, 'dB', solvedNf != null ? `${solvedNf.toFixed(2)} dB` : '—', { symbol: `NF${k + 1}`, primary: true, solved: true, tone: feasible ? '' : 'fail', note: feasible ? (big ? 'any realistic NF meets the target' : `for cascade NF = ${+st.nfTotal.toFixed(3)} dB`) : 'not achievable' }));
  }
  results.push(
    solvable && !feasible
      ? r('nfTotal', 'Cascade noise figure (target)', st.nfTotal, 'dB', `${st.nfTotal.toFixed(2)} dB`, { symbol: 'NF', primary: true, tone: 'fail', note: `not met — ${nfDb.toFixed(2)} dB with the current stage ${k + 1} NF` })
      : r('nfTotal', 'Cascade noise figure', nfDb, 'dB', `${nfDb.toFixed(2)} dB`, { symbol: 'NF', primary: true, solved: !solvable, note: solvable ? 'target' : `F = ${c.f.toFixed(3)}` }),
    r('gain', 'Cascade gain', c.gDb, 'dB', `${c.gDb.toFixed(2)} dB`, { symbol: 'G', primary: true }),
    r('te', 'Noise temperature', te, 'K', `${te.toFixed(1)} K`, { symbol: 'Te', primary: true }),
    r('iip3', 'Input IP3', c.iip3, 'dBm', c.iip3 != null ? `${c.iip3.toFixed(1)} dBm` : '—', { symbol: 'IIP3', primary: true, note: c.iip3 != null ? `OIP3 ${(c.iip3 + c.gDb).toFixed(1)} dBm` : 'no stage has an IP3' }),
    r('sensitivity', 'Sensitivity', sens, 'dBm', dbm(sens), { symbol: 'S_min', primary: true, note: `SNR ${st.snrReq} dB in ${si(st.bw, 'Hz')}, source ${si(st.tSrc, 'K', 4)}${st.tSrc !== T0 ? ` (${(mds + st.snrReq).toFixed(1)} dBm at 290 K)` : ''}` }),
    r('tSys', 'System noise temperature Tₛ + Te', st.tSrc + te, 'K', si(st.tSrc + te, 'K', 4), { group: 'Noise', symbol: 'T_sys' }),
    r('noiseFloor', 'Thermal noise kT₀B', floor, 'dBm', `${floor.toFixed(1)} dBm`, { group: 'Noise', symbol: 'kT₀B' }),
    r('mds', 'Noise floor at input, 290 K source (kT₀B + NF)', mds, 'dBm', dbm(mds), { group: 'Noise', symbol: 'MDS' }),
    r('floorTs', `Noise floor at input, source at ${st.tSrc} K`, floorTs, 'dBm', dbm(floorTs), { group: 'Noise', symbol: 'N_in', note: 'k(Ts + Te)B' }),
    r('outNoise', `Output noise (source at ${st.tSrc} K)`, last.noise, 'dBm', dbm(last.noise), { group: 'Noise' }),
    r('sfdr', 'Spurious-free dynamic range', sfdr, 'dB', sfdr != null ? `${sfdr.toFixed(1)} dB` : '—', { group: 'Linearity', symbol: 'SFDR', note: '⅔·(IIP3 − noise floor)' }),
    r('oip3', 'Output IP3', c.iip3 != null ? c.iip3 + c.gDb : null, 'dBm', c.iip3 != null ? `${(c.iip3 + c.gDb).toFixed(1)} dBm` : '—', { group: 'Linearity', symbol: 'OIP3' }),
    r('outSignal', 'Output signal', last.signal, 'dBm', dbm(last.signal), { group: 'Signal', symbol: 'P_out' }),
    r('outSnr', 'Output SNR', last.snr, 'dB', db(last.snr), { group: 'Signal', symbol: 'SNR_out', tone: last.snr < st.snrReq - 1e-9 ? 'warn' : '' }),
  );
  if (c.iip3 != null && st.pin >= c.iip3) warnings.push(`Input ${st.pin} dBm is at or above the cascade IIP3 (${c.iip3.toFixed(1)} dBm): the chain is deep in compression and the small-signal results do not apply.`);
  else if (c.iip3 != null && st.pin > c.iip3 - 10) warnings.push(`Input ${st.pin} dBm is within 10 dB of the cascade IIP3 (${c.iip3.toFixed(1)} dBm): third-order products are only ${(2 * (c.iip3 - st.pin)).toFixed(0)} dB below the signal.`);
  const worst = c.rows.reduce((a, b) => (b.contrib > a.contrib ? b : a), c.rows[0]);
  if (c.f > 1) notes.push(`Largest noise contributor: ${worst.name} (${(worst.contrib * 100).toFixed(0)} % of the excess noise F − 1).`);
  notes.push('NF is referred to the standard source temperature T₀ = 290 K. Stages are assumed impedance-matched: mismatch between stages changes both gain and noise and is not modelled.');
  notes.push('Cascaded IP3 assumes the third-order products of all stages add in phase (worst case); a power-sum (incoherent) model gives a higher IIP3.');
  notes.push('Compression (P1dB) is not modelled: check that the output level stays well below each stage’s P1dB.');
  notes.push('Mixers: datasheet NF is usually the DSB figure; for a single-sideband signal use SSB ≈ DSB + 3 dB. Without an image filter between the LNA and the mixer, the LNA’s image-band noise also folds in (roughly +3 dB on everything ahead of the mixer), which a single-NF Friis cascade does not capture.');
  if (st.tSrc > 3 * te && st.tSrc > T0) notes.push(`Externally noise-limited: the source contributes ${si(st.tSrc, 'K', 3)} against the receiver's ${si(te, 'K', 3)}, so a lower NF gains at most ${(10 * Math.log10((st.tSrc + te) / st.tSrc)).toFixed(2)} dB of sensitivity.`);
  if (solvable && feasible && solvedNf != null && solvedNf < 0.3) warnings.push(`The required NF of ${solvedNf.toFixed(2)} dB is below what practical amplifiers reach (≈ 0.3 dB at room temperature, frequency-dependent). Increase the stage's gain or cut loss before it.`);

  const n = st.stages.length;
  const xs = Array.from({ length: n + 1 }, (_, i) => i);
  const pts = (f: (row: CascadeRow) => number, start: number) => [start, ...c.rows.map(f)];
  const fmt = (x: number | null, d = 2) => (x == null ? '—' : x.toFixed(d));
  return {
    calc: 'rf/noise-figure-cascade',
    ok: true,
    solveFor: st.solveFor,
    status: solvable ? (feasible ? { text: 'FEASIBLE', tone: 'pass' } : { text: 'NOT ACHIEVABLE', tone: 'fail' }) : undefined,
    summary: `${n} stages · noise in ${si(st.bw, 'Hz')} · largest contributor: ${worst.name}`,
    results,
    warnings,
    notes,
    graphs: [
      {
        id: 'levels',
        title: 'Level diagram',
        // the OIP3 trace runs along the top of the frame, where a corner legend hid it
        legend: 'below',
        x: { label: 'Stage output (0 = input)', unit: '', integer: true },
        y: [{ id: 'p', label: 'Power', unit: 'dBm' }],
        series: [
          { label: 'Signal', x: xs, y: pts((r) => r.signal, st.pin), axis: 'p', width: 2.2 },
          { label: 'Noise in B', x: xs, y: pts((r) => r.noise, linToDb(K_B * st.tSrc * st.bw * 1e3)), axis: 'p', color: '#8b1e1e', width: 1.8 },
          ...(c.iip3 != null ? [{ label: 'Cumulative OIP3', x: xs.slice(1), y: c.rows.map((r) => r.cumOip3 ?? NaN), axis: 'p', color: '#c47b17', dash: [5, 3], width: 1.4 }] : []),
        ],
        markers: c.rows.map((r, i) => ({ x: i + 1, y: r.signal, axis: 'p', label: '' })),
      },
      {
        id: 'cumulative',
        title: 'Cumulative NF & gain',
        x: { label: 'Stage output (0 = input)', unit: '', integer: true },
        y: [
          { id: 'nf', label: 'NF', unit: 'dB', includeZero: true },
          { id: 'g', label: 'Gain', unit: 'dB', side: 'right' },
        ],
        series: [
          { label: 'Cumulative NF', x: xs, y: pts((r) => r.cumNfDb, 0), axis: 'nf', width: 2.2 },
          { label: 'Cumulative gain', x: xs, y: pts((r) => r.cumGainDb, 0), axis: 'g', color: '#c47b17', width: 1.8 },
        ],
      },
    ],
    tables: [
      {
        id: 'cascade',
        title: 'Stage-by-stage cascade',
        columns: [
          { key: 'stage', label: '#', align: 'left' },
          { key: 'name', label: 'Stage', align: 'left' },
          { key: 'gDb', label: 'G', unit: 'dB' },
          { key: 'nfDb', label: 'NF', unit: 'dB' },
          { key: 'cumGainDb', label: 'Σ G', unit: 'dB' },
          { key: 'cumNfDb', label: 'Σ NF', unit: 'dB' },
          { key: 'cumTe', label: 'Σ Te', unit: 'K' },
          { key: 'contrib', label: 'Noise share', unit: '%' },
          { key: 'cumIip3', label: 'Σ IIP3', unit: 'dBm' },
          { key: 'signal', label: 'Signal', unit: 'dBm' },
          { key: 'noise', label: 'Noise', unit: 'dBm' },
          { key: 'snr', label: 'SNR', unit: 'dB' },
        ],
        rows: c.rows.map((row, i) => ({ stage: i + 1, name: row.name, gDb: row.gDb, nfDb: row.nfDb, cumGainDb: row.cumGainDb, cumNfDb: row.cumNfDb, cumTe: row.cumTe, contrib: row.contrib * 100, cumIip3: row.cumIip3, signal: row.signal, noise: row.noise, snr: row.snr })),
        display: c.rows.map((row, i) => ({ stage: String(i + 1), name: row.name, gDb: fmt(row.gDb), nfDb: fmt(row.nfDb), cumGainDb: fmt(row.cumGainDb), cumNfDb: fmt(row.cumNfDb), cumTe: fmt(row.cumTe, 1), contrib: fmt(row.contrib * 100, 1), cumIip3: fmt(row.cumIip3, 1), signal: fmt(row.signal, 1), noise: fmt(row.noise, 1), snr: fmt(row.snr, 1) })),
        note: 'Σ columns are cumulative from the input to that stage’s output. Noise share is each stage’s part of the cascade excess noise F − 1.',
      },
    ],
    details: { noiseFactor: c.f, kT0B_dBm: floor, rows: c.rows, T0 },
  };
}

/**
 * The stage whose NF is solved, by identity, per page state. solveStage is an index, and removing or
 * duplicating a stage above it shifts the list under it: without this the unknown would silently
 * move to a different stage (or to the next stage when the solved one is removed).
 */
const solvedStage = new WeakMap<NfState, { stage: Stage | undefined; index: number }>();

function followSolvedStage(s: NfState): void {
  const prev = solvedStage.get(s);
  if (s.solveFor !== 'nfStage' || !prev || !prev.stage || prev.index !== s.solveStage) return; // a new choice (◎, API, example) wins
  if (s.stages[s.solveStage] === prev.stage) return;
  const at = s.stages.indexOf(prev.stage);
  if (at >= 0) s.solveStage = at;
  else s.solveFor = 'nfTotal'; // the solved stage was removed: analyse what is left
}

export const def: CalcDef<NfState> = {
  id: 'rf/noise-figure-cascade',
  version: '0.1.0',
  method: 'Friis noise cascade with T₀ = 290 K; passive stages F = 1 + (L−1)Tp/T₀; worst-case (coherent) IP3 cascade; closed-form solve for one stage’s maximum NF.',
  fields,
  defaults,
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = { ...d, ...(raw as object) } as NfState;
    s.stages = (Array.isArray(s.stages) && s.stages.length ? s.stages : d.stages).map((x) => ({ ...stage('Stage', 'amp', 0, 0, null), ...x }));
    if (s.solveFor !== 'nfStage') s.solveFor = 'nfTotal';
    s.solveStage = Math.min(Math.max(s.solveStage | 0, 0), s.stages.length - 1);
    return s;
  },
  solve: {
    default: 'nfTotal',
    analysis: 'nfTotal',
    options: [
      { key: 'nfTotal', label: 'Cascade NF from the stages' },
      { key: 'nfStage', label: 'Max NF of stage `solveStage` (0-based) for the target nfTotal' },
    ],
  },
  compute,
  controls: {
    solveStage: (raw, s) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n >= s.stages.length) throw new Error(`must be an integer stage index 0…${s.stages.length - 1}`);
      return n;
    },
  },
  sync: (s) => {
    if (s.solveFor !== 'nfStage' && s.solveFor !== 'nfTotal') s.solveFor = 'nfTotal';
    followSolvedStage(s);
    s.solveStage = Math.min(Math.max(Math.round(Number(s.solveStage) || 0), 0), s.stages.length - 1);
    // A passive stage has no NF box (its NF is set by its loss), so it cannot stay the unknown:
    // go back to analysing the cascade rather than leave no visible unknown.
    if (s.solveFor === 'nfStage' && s.stages[s.solveStage]?.type === 'passive') s.solveFor = 'nfTotal';
    solvedStage.set(s, { stage: s.stages[s.solveStage], index: s.solveStage });
  },
  examples: [
    { id: 'rx-default', label: 'Superhet receiver (filter → LNA → mixer → IF)', state: defaults() },
    {
      id: 'lossy-first',
      label: 'Lossy cable before the LNA (why the LNA goes at the antenna)',
      state: { stages: [stage('Cable 10 m', 'passive', 0, 0, null, 3), stage('LNA', 'amp', 20, 0.8, 28), stage('Receiver', 'amp', 30, 6, 20)] },
    },
    {
      id: 'lna-budget',
      label: 'Solve: LNA NF needed for a 2 dB system',
      state: { solveFor: 'nfStage', solveStage: 1, nfTotal: 2, stages: [stage('Filter', 'passive', 0, 0, null, 0.8), stage('LNA', 'amp', 16, 1, 30), stage('Mixer', 'mixer', -7, 9, 18), stage('IF amp', 'amp', 25, 3, 35)] },
    },
  ],
};
