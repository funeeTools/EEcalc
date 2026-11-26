/** Resistive attenuator designer — calculator definition (inputs, solve-for, report). DOM-free. */

import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TableSpec, emptyReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { nearestE } from '@/core/eseries';
import { si } from '@/core/units';
import { type PadValues, type Topology, analysePad, branches, designPad, minLossDb } from './model';

export interface AttenuatorState {
  /** 'res': resistors from the attenuation (design); 'atten': attenuation from the resistors (analysis) */
  solveFor: 'res' | 'atten';
  topology: Topology;
  z1: number;
  z2: number;
  atten: number;
  r1: number;
  r2: number;
  r3: number;
  eseries: string;
  pin: number;
}

export const defaults = (): AttenuatorState => ({
  solveFor: 'res',
  topology: 'pi',
  z1: 50,
  z2: 50,
  atten: 10,
  r1: 96.2475,
  r2: 71.1512,
  r3: 96.2475,
  eseries: 'E96',
  pin: 30,
});

const TOPO_NAME: Record<Topology, string> = { pi: 'Pi pad', t: 'T pad', bridgedT: 'Bridged-T pad', minloss: 'Minimum-loss L pad' };

const resSolved = (_s: any, root: any) => root.solveFor === 'res';

/**
 * Switching from analysis to design: the attenuation left by the analysis can be below what a matched
 * pad between unequal impedances can give (an unmatched network can lose less than the minimum-loss
 * pad), or 0. Designing for it would be a red error caused by a mode switch, so raise it the same way
 * the topology switch does.
 */
function toDesign(root: any): void {
  root.solveFor = 'res';
  if (root.topology === 'minloss') return;
  const amin = root.topology === 'bridgedT' ? 0 : minLossDb(root.z1, root.z2);
  if (!(root.atten > amin + 0.05)) root.atten = Math.ceil((amin + 1) * 10) / 10;
}
const resField = (key: 'r1' | 'r2' | 'r3', symbol: string, label: string, extra: Partial<FieldSpec> = {}): FieldSpec =>
  ({
    kind: 'number',
    key,
    symbol,
    label,
    unit: 'Ω',
    // wide enough for every designed value: a 120 dB T pad between 0.1 Ω ports needs a 0.2 µΩ shunt,
    // a 120 dB Pi pad between 1 MΩ ports a 0.5 TΩ series resistor
    min: 1e-7,
    max: 1e12,
    solvable: true,
    solvedWhen: resSolved,
    onSolve: (_s: any, root: any) => toDesign(root),
    onUnsolve: (_s: any, root: any) => (root.solveFor = 'atten'),
    ...extra,
  }) as FieldSpec;

const ROLE_NOTE: Record<Topology, string> = {
  pi: 'Pi: R1 shunt at port 1 · R2 series · R3 shunt at port 2.',
  t: 'T: R1 series at port 1 · R2 shunt to ground · R3 series at port 2.',
  bridgedT: 'Bridged-T: R1 bridge (port 1 → port 2) · R2 shunt · R3 each of the two arms (= Z₀ when designed).',
  minloss: 'L pad: R1 series on the higher-impedance side · R2 shunt at the lower-impedance port.',
};

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Pad',
    fields: [
      {
        kind: 'select',
        key: 'topology',
        label: 'Topology',
        options: [
          { value: 'pi', label: 'Pi (π)' },
          { value: 't', label: 'T' },
          { value: 'bridgedT', label: 'Bridged-T (equal Z)' },
          { value: 'minloss', label: 'Minimum-loss L (Z₁ ≠ Z₂)' },
        ],
        apply: (v, s) => {
          if (v === 'minloss' && s.z1 === s.z2) s.z2 = s.z1 === 75 ? 50 : 75;
          if (v === 'bridgedT') s.z2 = s.z1;
          // Leaving the L pad: its loss (= the minimum) was written into A; a Pi/T needs more than that.
          if (v !== 'minloss') {
            const amin = v === 'bridgedT' ? 0 : minLossDb(s.z1, s.z2);
            if (!(s.atten > amin + 0.05)) s.atten = Math.ceil((amin + 1) * 10) / 10;
          }
          s.solveFor = 'res';
        },
        help: 'Pi and T pads work for equal or unequal impedances (unequal needs at least the minimum loss). Bridged-T needs equal impedances; the minimum-loss L pad only matches unequal ones.',
      },
      { kind: 'number', key: 'z1', symbol: 'Z₁', label: 'Source impedance', unit: 'Ω', min: 0.1, max: 1e6, help: 'Impedance the pad sees at port 1 (and presents back to it when matched).' },
      { kind: 'number', key: 'z2', symbol: 'Z₂', label: 'Load impedance', unit: 'Ω', min: 0.1, max: 1e6, visible: (_s, root) => root.topology !== 'bridgedT', help: 'Impedance at port 2. Set equal to Z₁ for an ordinary pad.' },
      {
        kind: 'number',
        key: 'atten',
        symbol: 'A',
        label: 'Attenuation',
        suffix: 'dB',
        min: 0,
        // an analysed pad can lose far more than anyone designs for (a 0.1 µΩ shunt: ~180 dB)
        max: 400,
        solvable: true,
        solvedWhen: (_s, root) => root.solveFor === 'atten' || root.topology === 'minloss',
        onSolve: (_s, root) => (root.solveFor = 'atten'),
        onUnsolve: (_s, root) => toDesign(root),
        help: 'Transducer loss: available source power ÷ power in the load. Fixed by Z₁/Z₂ for the minimum-loss pad.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Resistors',
    fields: [
      { kind: 'note', text: (_s, root) => ROLE_NOTE[root.topology as Topology] },
      resField('r1', 'R₁', 'Resistor 1'),
      resField('r2', 'R₂', 'Resistor 2'),
      resField('r3', 'R₃', 'Resistor 3', { visible: (_s: any, root: any) => root.topology !== 'minloss' }),
      { kind: 'select', key: 'eseries', label: 'Build with', visible: (_s, root) => root.solveFor === 'res', options: [{ value: 'ideal', label: 'Ideal values' }, 'E12', 'E24', 'E48', 'E96'], help: 'Rounds the designed resistors to the nearest preferred value and reports the attenuation and match you actually get.' },
    ],
  },
  {
    kind: 'section',
    title: 'Power',
    fields: [{ kind: 'number', key: 'pin', symbol: 'P_in', label: 'Input power', suffix: 'dBm', min: -200, max: 100, help: 'Available power of the source (the power a matched pad absorbs). 30 dBm = 1 W.' }],
  },
];

const fmtR = (r: number) => (Number.isFinite(r) ? si(r, 'Ω', 4) : '∞');
const fmtP = (w: number) => si(w, 'W', 3);
const dbm = (w: number) => 10 * Math.log10(w / 1e-3);
const fmtRL = (rl: number) => (Number.isFinite(rl) ? `${rl.toFixed(1)} dB` : '∞ (perfect)');

function validate(st: AttenuatorState): void {
  for (const k of ['z1', 'z2', 'atten', 'r1', 'r2', 'r3', 'pin'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (!(st.z1 > 0) || !(st.z2 > 0)) throw new Error('Both port impedances must be > 0.');
}

export function compute(st: AttenuatorState): CalcReport {
  validate(st);
  const s: AttenuatorState = { ...st };
  const top = s.topology;
  if (top === 'bridgedT') s.z2 = s.z1;
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'rf/attenuator-designer', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const amin = minLossDb(s.z1, s.z2);
  const unequal = Math.abs(s.z1 - s.z2) > 1e-9 * s.z1;
  const design = s.solveFor === 'res';

  if (top === 'minloss' && !unequal) throw new Error('The minimum-loss L pad matches two different impedances — set Z₂ ≠ Z₁ (for equal impedances use a Pi or T pad).');

  // ── the resistor set: designed (ideal + rounded) or as given
  let ideal: PadValues;
  if (design) {
    if (top !== 'minloss' && !(s.atten > 0)) throw new Error('Attenuation must be > 0 dB to design a pad.');
    const v = designPad(top, s.atten, s.z1, s.z2);
    // No answer is an error (style guide §5): the core then blanks every solved resistor box instead
    // of leaving R2 and R3 from the last design, and nothing reads the stale values as a result.
    if (!v)
      return {
        ...emptyReport('rf/attenuator-designer'),
        ok: false,
        solveFor: s.solveFor,
        status: { text: 'NO SOLUTION', tone: 'fail' },
        error: `Matching ${si(s.z1, 'Ω', 4)} to ${si(s.z2, 'Ω', 4)} with a resistive ${top === 'pi' ? 'Pi' : 'T'} pad needs more than ${amin.toFixed(3)} dB (the minimum-loss pad). Raise A above that, or choose the minimum-loss L pad.`,
      };
    ideal = v;
  } else {
    if (top !== 'minloss' && !(s.r3 > 0)) throw new Error('R3 must be > 0.');
    if (!(s.r1 > 0) || !(s.r2 > 0)) throw new Error('R1 and R2 must be > 0.');
    ideal = { r1: s.r1, r2: s.r2, r3: top === 'minloss' ? NaN : s.r3 };
  }
  const round = design && s.eseries !== 'ideal';
  const built: PadValues = round ? { r1: nearestE(ideal.r1, s.eseries), r2: nearestE(ideal.r2, s.eseries), r3: Number.isFinite(ideal.r3) ? nearestE(ideal.r3, s.eseries) : NaN } : ideal;
  const brIdeal = branches(top, ideal, s.z1, s.z2);
  const brBuilt = branches(top, built, s.z1, s.z2);
  const aIdeal = analysePad(brIdeal, s.z1, s.z2);
  const a = analysePad(brBuilt, s.z1, s.z2);

  // ── power
  const pAvail = 1e-3 * 10 ** (s.pin / 10);
  const dissipated = brBuilt.map((b) => ({ b, p: a.branchFrac[b.id] * pAvail }));
  const pLoad = a.loadFrac * pAvail;
  const pAbsorbed = pAvail * (1 - a.reflFrac);

  // ── results
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const role = (id: string) => brBuilt.find((b) => b.id === id)?.role ?? '';
  const rIds = top === 'minloss' ? (['r1', 'r2'] as const) : (['r1', 'r2', 'r3'] as const);
  if (design) {
    for (const id of rIds) {
      const v = ideal[id];
      const note = `${role(id)}${round ? ` · ${s.eseries}: ${fmtR(built[id])}` : ''}`;
      results.push(item(id, `R${id[1]}${top === 'bridgedT' && id === 'r3' ? ' (each arm)' : ''}`, v, 'Ω', fmtR(v), { symbol: `R${'₁₂₃'[+id[1] - 1]}`, primary: true, solved: true, note }));
    }
    if (top === 'minloss') {
      results.push(item('atten', 'Minimum loss', amin, 'dB', `${amin.toFixed(3)} dB`, { symbol: 'A', primary: true, solved: true, note: `${si(s.z1, 'Ω', 4)} → ${si(s.z2, 'Ω', 4)}` }));
      if (round) results.push(item('attenBuilt', `Attenuation as built (${s.eseries})`, a.lossDb, 'dB', `${a.lossDb.toFixed(3)} dB`, { symbol: 'A_b', primary: true }));
    } else results.push(item('atten', round ? `Attenuation as built (${s.eseries})` : 'Attenuation', round ? a.lossDb : aIdeal.lossDb, 'dB', `${(round ? a.lossDb : aIdeal.lossDb).toFixed(3)} dB`, { symbol: 'A', primary: true, note: round ? `design ${aIdeal.lossDb.toFixed(3)} dB` : `${si(s.z1, 'Ω', 4)} → ${si(s.z2, 'Ω', 4)}` }));
  } else {
    results.push(item('atten', 'Attenuation', a.lossDb, 'dB', `${a.lossDb.toFixed(3)} dB`, { symbol: 'A', primary: true, solved: true, note: 'transducer loss between Z₁ and Z₂' }));
  }
  const rlTone = (rl: number) => (rl < 15 ? 'warn' : '');
  results.push(
    item('rlIn', 'Input return loss', Number.isFinite(a.rlIn) ? a.rlIn : null, 'dB', fmtRL(a.rlIn), { symbol: 'RL₁', primary: !design || round, group: 'Match', tone: rlTone(a.rlIn), note: `Z_in = ${fmtR(a.zin)}` }),
    item('rlOut', 'Output return loss', Number.isFinite(a.rlOut) ? a.rlOut : null, 'dB', fmtRL(a.rlOut), { symbol: 'RL₂', group: 'Match', tone: rlTone(a.rlOut), note: `Z_out = ${fmtR(a.zout)}` }),
    item('zin', 'Input impedance', a.zin, 'Ω', fmtR(a.zin), { symbol: 'Z_in', group: 'Match', note: `with Z₂ = ${si(s.z2, 'Ω', 4)} at port 2` }),
    item('zout', 'Output impedance', a.zout, 'Ω', fmtR(a.zout), { symbol: 'Z_out', group: 'Match', note: `with Z₁ = ${si(s.z1, 'Ω', 4)} at port 1` }),
    item('kVoltage', 'Voltage ratio V₁/V₂', a.v1 / a.v2, '', (a.v1 / a.v2).toPrecision(5), { symbol: 'K_v', group: 'Match', note: 'port voltages, source Z₁ and load Z₂ connected' }),
  );
  if (unequal) results.push(item('aMin', 'Minimum possible loss', amin, 'dB', `${amin.toFixed(3)} dB`, { symbol: 'A_min', group: 'Match', note: `for ${si(s.z1, 'Ω', 4)} ↔ ${si(s.z2, 'Ω', 4)}` }));
  const pg = `Power (P_in = ${s.pin} dBm = ${fmtP(pAvail)})`;
  for (const { b, p } of dissipated) results.push(item(`p_${b.id}`, `P in R${b.id[1]}${b.id === 'r4' ? ' (arm 2)' : ''}`, p, 'W', fmtP(p), { group: pg, note: `${((p / pAvail) * 100).toFixed(1)} % · ${b.role}` }));
  results.push(
    item('pLoad', 'Power to load', pLoad, 'W', `${fmtP(pLoad)} (${dbm(pLoad).toFixed(2)} dBm)`, { group: pg }),
    item('pDiss', 'Total dissipated', pAbsorbed - pLoad, 'W', fmtP(pAbsorbed - pLoad), { group: pg }),
  );
  report.results = results;

  // ── checks
  if (!design && Math.min(a.rlIn, a.rlOut) < 20)
    warnings.push(
      top === 'minloss'
        ? `These resistors do not match ${si(s.z1, 'Ω', 4)}/${si(s.z2, 'Ω', 4)} well (return loss ${Math.min(a.rlIn, a.rlOut).toFixed(1)} dB). Click ◎ on a resistor to get the matched minimum-loss values.`
        : `These resistors do not match ${si(s.z1, 'Ω', 4)}/${si(s.z2, 'Ω', 4)} well (return loss ${Math.min(a.rlIn, a.rlOut).toFixed(1)} dB). Click ◎ on a resistor to design a matched pad for A = ${a.lossDb.toFixed(2)} dB.`,
    );
  if (design) {
    const rs = (top === 'minloss' ? [ideal.r1, ideal.r2] : [ideal.r1, ideal.r2, ideal.r3]).filter(Number.isFinite);
    const zLo = Math.min(s.z1, s.z2);
    const zHi = Math.max(s.z1, s.z2);
    if (Math.min(...rs) < 1e-3 * zLo || Math.max(...rs) > 1e3 * zHi)
      warnings.push(`The design needs ${fmtR(Math.min(...rs))} and ${fmtR(Math.max(...rs))} — not buildable${unequal && top !== 'minloss' ? `, because A is so close to the ${amin.toFixed(3)} dB minimum` : ''}. ${unequal && top !== 'minloss' ? 'Raise A, or use the minimum-loss L pad.' : 'Choose a less extreme attenuation.'}`);
  }
  if (round && Math.min(a.rlIn, a.rlOut) < 25) warnings.push(`${s.eseries} rounding limits the return loss to ${Math.min(a.rlIn, a.rlOut).toFixed(1)} dB. Use a finer series (E96) or series/parallel combinations if the match matters.`);
  if (design && top !== 'minloss' && s.atten > 40) notes.push('Above ~40 dB a single pad is limited by leakage and stray capacitance across the series resistor; cascade two pads in a shielded enclosure.');
  if (design && s.atten < 1 && top !== 'minloss') notes.push('Small attenuations need very large shunt and very small series values; resistor tolerance then dominates the match.');
  const hot = dissipated.reduce((m, d) => (d.p > m.p ? d : m), dissipated[0]);
  if (hot && hot.p > 0.25) notes.push(`R${hot.b.id[1]} dissipates ${fmtP(hot.p)}: choose a part rated at least ${fmtP(2 * hot.p)} (2× derating) and check its high-frequency behaviour.`);
  if (unequal && top !== 'minloss' && design && s.atten - amin < 0.5) notes.push(`A is only ${(s.atten - amin).toFixed(2)} dB above the minimum loss, so one resistor is extreme. The minimum-loss L pad does the same job with two resistors.`);
  notes.push(
    'Ideal resistors: values are frequency-independent. At RF, parasitic inductance and capacitance of real parts (and pad layout) limit the usable bandwidth.',
    'Attenuation is the transducer loss: available power from the source (Z₁) ÷ power delivered to Z₂. For a matched pad it equals the insertion loss.',
  );
  report.status = design ? undefined : Math.min(a.rlIn, a.rlOut) >= 20 ? { text: 'MATCHED', tone: 'pass' } : { text: 'MISMATCHED', tone: 'warn' };
  report.summary = `${TOPO_NAME[top]} · ${si(s.z1, 'Ω', 4)}${unequal ? ` → ${si(s.z2, 'Ω', 4)}` : ''} · ${a.lossDb.toFixed(2)} dB${round ? ` with ${s.eseries} parts` : ''}`;

  // ── parts table
  const tRows = brBuilt.map((b) => {
    const idealR = brIdeal.find((x) => x.id === b.id)!.r;
    const p = a.branchFrac[b.id] * pAvail;
    return { ref: `R${b.id[1]}`, role: b.role, ideal: idealR, built: b.r, error: round ? ((b.r - idealR) / idealR) * 100 : 0, power: p };
  });
  const table: TableSpec = {
    id: 'parts',
    title: 'Parts',
    columns: [
      { key: 'ref', label: 'Ref', align: 'left' },
      { key: 'role', label: 'Position', align: 'left' },
      { key: 'ideal', label: design ? 'Ideal' : 'Value', unit: 'Ω' },
      { key: 'built', label: round ? s.eseries : 'Built', unit: 'Ω' },
      { key: 'error', label: 'Error', unit: '%' },
      { key: 'power', label: 'Dissipation', unit: 'W' },
    ],
    rows: tRows,
    display: tRows.map((r) => ({ ref: r.ref, role: r.role, ideal: fmtR(r.ideal), built: fmtR(r.built), error: round ? `${r.error >= 0.005 ? '+' : ''}${(Math.abs(r.error) < 0.005 ? 0 : r.error).toFixed(2)} %` : '—', power: fmtP(r.power) })),
    note: top === 'bridgedT' ? 'R3 and R4 are the two arm resistors (equal).' : undefined,
  };
  report.tables = [table];
  report.details = { ideal, built, idealAnalysis: aIdeal, builtAnalysis: a, minLossDb: amin, branches: brBuilt };
  report.graphs = graphs(s, a.lossDb);
  return report;
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

const COLORS = ['#1f4e5f', '#c47b17', '#4f8a8b', '#6b5b95'];

/** Design curves: resistor values and power split against attenuation (or Z ratio for the L pad). */
function graphs(s: AttenuatorState, aNow: number | null): GraphSpec[] {
  const top = s.topology;
  if (top === 'minloss') {
    const lo = Math.min(s.z1, s.z2);
    const hi = Math.max(s.z1, s.z2);
    const qNow = hi / lo;
    const qs = [...Array.from({ length: 160 }, (_, i) => 1.02 * (Math.max(10, qNow * 1.5) / 1.02) ** (i / 159)), qNow].sort((x, y) => x - y);
    const des = qs.map((q) => designPad('minloss', 0, lo * q, lo)!);
    const an = qs.map((q, i) => analysePad(branches('minloss', des[i], lo * q, lo), lo * q, lo));
    return [
      {
        id: 'r-vs-ratio',
        title: 'L pad vs impedance ratio',
        subtitle: `Z_low = ${si(lo, 'Ω', 4)}`,
        x: { label: 'Impedance ratio Z_high/Z_low', unit: '', log: true },
        y: [
          { id: 'r', label: 'Resistance', unit: 'Ω', log: true },
          { id: 'a', label: 'Minimum loss', unit: 'dB', side: 'right', includeZero: true },
        ],
        series: [
          { label: 'R1 series', x: qs, y: des.map((d) => d.r1), axis: 'r', width: 2, color: COLORS[0] },
          { label: 'R2 shunt', x: qs, y: des.map((d) => d.r2), axis: 'r', width: 2, color: COLORS[1] },
          { label: 'Minimum loss', x: qs, y: an.map((x) => x.lossDb), axis: 'a', width: 1.4, dash: [5, 3], color: COLORS[2] },
        ],
        vlines: [{ value: qNow, label: `${qNow.toPrecision(4)} : 1`, color: '#9a8f7a' }],
      },
    ];
  }
  const amin = minLossDb(s.z1, s.z2);
  const a0 = Math.max(amin + 0.05, 0.25);
  const a1 = Math.max(40, (aNow ?? 0) * 1.25, a0 + 10);
  const as = [...linspace(a0, a1, 200), ...(aNow != null && aNow > a0 ? [aNow] : [])].sort((x, y) => x - y);
  const des = as.map((A) => designPad(top, A, s.z1, s.z2));
  const ok = as.map((_, i) => des[i] != null);
  const ax = as.filter((_, i) => ok[i]);
  const dv = des.filter((d): d is PadValues => d != null);
  const ids = ['r1', 'r2', 'r3'] as const;
  const names = top === 'pi' ? ['R1 shunt', 'R2 series', 'R3 shunt'] : top === 't' ? ['R1 series', 'R2 shunt', 'R3 series'] : ['R1 bridge', 'R2 shunt', 'R3 arms'];
  const sameShunts = !(Math.abs(s.z1 - s.z2) > 1e-9 * s.z1) && top !== 'bridgedT';
  const show = ids.filter((id) => !(sameShunts && id === 'r3'));
  const br = dv.map((d) => branches(top, d, s.z1, s.z2));
  const an = br.map((b) => analysePad(b, s.z1, s.z2));
  const vl = aNow != null ? [{ value: aNow, label: `A = ${aNow.toFixed(2)} dB`, color: '#9a8f7a' }] : [];
  const brIds = top === 'bridgedT' ? (['r1', 'r2', 'r3', 'r4'] as const) : ids;
  const brNames: Record<string, string> = { r1: names[0], r2: names[1], r3: top === 'bridgedT' ? 'R3 arm 1' : names[2], r4: 'R4 arm 2' };
  return [
    {
      id: 'r-vs-a',
      title: 'Resistors vs attenuation',
      subtitle: `${TOPO_NAME[top]}, ${si(s.z1, 'Ω', 4)}${sameShunts || top === 'bridgedT' ? '' : ` → ${si(s.z2, 'Ω', 4)}`}${sameShunts && top === 'pi' ? ' (R3 = R1)' : sameShunts && top === 't' ? ' (R3 = R1)' : ''}`,
      x: { label: 'Attenuation', unit: 'dB' },
      y: [{ id: 'r', label: 'Resistance', unit: 'Ω', log: true }],
      series: show.map((id, k) => ({ label: names[ids.indexOf(id)], x: ax, y: dv.map((d) => d[id]), axis: 'r', width: 2, color: COLORS[k] })),
      vlines: vl,
      hlines: [{ value: s.z1, label: `Z₁ = ${si(s.z1, 'Ω', 4)}`, axis: 'r', color: '#9a8f7a', dash: [3, 3] }],
    },
    {
      id: 'power-vs-a',
      title: 'Power split vs attenuation',
      subtitle: 'share of the available input power',
      x: { label: 'Attenuation', unit: 'dB' },
      y: [{ id: 'p', label: 'Share of P_in', unit: '%', includeZero: true, max: 100 }],
      series: [
        ...brIds.map((id, k) => ({ label: `${brNames[id]}`, x: ax, y: an.map((x) => x.branchFrac[id] * 100), axis: 'p', width: 2, color: COLORS[k] })),
        { label: 'Load', x: ax, y: an.map((x) => x.loadFrac * 100), axis: 'p', width: 1.4, dash: [5, 3], color: '#2f7d4f' },
      ],
      vlines: vl,
    },
  ];
}

export const def: CalcDef<AttenuatorState> = {
  id: 'rf/attenuator-designer',
  version: '0.1.0',
  method: 'Matched Pi, T and bridged-T pads for equal or unequal terminations and the minimum-loss L pad (Reference Data for Engineers, 9th ed., ch. 11 "Attenuators"); every pad, ideal or E-series-rounded, is then solved by nodal analysis between Z₁ and Z₂ for transducer loss, return loss and resistor dissipation.',
  fields,
  defaults,
  solve: {
    default: 'res',
    analysis: 'atten',
    options: [
      { key: 'res', label: 'Resistors for a target attenuation (design)' },
      { key: 'atten', label: 'Attenuation and match from given resistors (analysis)' },
    ],
  },
  compute,
  examples: [
    { id: 'pi-10db-50', label: '10 dB Pi pad, 50 Ω, E96, 1 W in', state: defaults() },
    { id: 't-6db-50', label: '6 dB T pad, 50 Ω, E24', state: { solveFor: 'res', topology: 't', z1: 50, z2: 50, atten: 6, eseries: 'E24', pin: 20 } },
    { id: 'pi-20db-75', label: '20 dB Pi pad for 75 Ω video, E12', state: { solveFor: 'res', topology: 'pi', z1: 75, z2: 75, atten: 20, eseries: 'E12', pin: 10 } },
    { id: 'minloss-75-50', label: 'Minimum-loss pad 75 Ω → 50 Ω (5.72 dB)', state: { solveFor: 'res', topology: 'minloss', z1: 75, z2: 50, eseries: 'E96', pin: 0 } },
    { id: 'bridged-t-3db', label: '3 dB bridged-T, 600 Ω audio', state: { solveFor: 'res', topology: 'bridgedT', z1: 600, z2: 600, atten: 3, eseries: 'E24', pin: 10 } },
    // E12 parts are not a matched pad, so designing for the analysed 9.63 dB gives 99.3 / 67.5 / 99.3 Ω, not
    // 100 / 68 / 100: the mode-switch harness flags this "round trip"; it is expected.
    { id: 'analyse-e12', label: 'Analyse: Pi of 100 / 68 / 100 Ω in 50 Ω', state: { solveFor: 'atten', topology: 'pi', z1: 50, z2: 50, r1: 100, r2: 68, r3: 100, pin: 30 } },
  ],
};
