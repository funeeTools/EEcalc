/**
 * Speaker crossover — calculator definition. DOM-free.
 *
 * This is a synthesis calculator (like the LC filter): every part follows directly from f_c and the driver
 * impedances, so there is no solve-for-X unknown. Instead the page reports the as-built response with the
 * parts rounded to a preferred-value series.
 */

import { brent } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { nearestE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { PROTOS, dB, evaluate, lPad, sectionParts, type Part, type Polarity, type XoverType } from './model';

export interface CrossoverState {
  type: XoverType;
  fc: number;
  fcUnit: string;
  polarity: 'auto' | Polarity;
  rW: number;
  rT: number;
  padDb: number;
  eseries: 'ideal' | 'E6' | 'E12' | 'E24';
}

export const defaults = (): CrossoverState => ({
  type: 'lr2',
  fc: 2500,
  fcUnit: 'kHz',
  polarity: 'auto',
  rW: 8,
  rT: 8,
  padDb: 0,
  eseries: 'ideal',
});

/** Audio crossover frequencies: kHz / Hz, no global (RF) frequency preference. */
const U_AUDIO_F: Record<string, number> = { kHz: 1e3, Hz: 1 };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Crossover',
    fields: [
      {
        kind: 'select',
        key: 'type',
        label: 'Alignment',
        options: (Object.keys(PROTOS) as XoverType[]).map((k) => ({ value: k, label: PROTOS[k].label })),
        help: 'Linkwitz–Riley sections are −6 dB at f_c and sum flat; Butterworth sections are −3 dB at f_c (2nd order sums to +3 dB on axis but flat in power).',
      },
      { kind: 'number', key: 'fc', symbol: 'f_c', label: 'Crossover frequency', units: U_AUDIO_F, unitKey: 'fcUnit', unitFamily: 'none', min: 20, max: 30e3, help: 'Typical two-way: 1.5–3.5 kHz. Keep it at least an octave above the tweeter’s resonance and below where the woofer beams or breaks up.' },
      {
        kind: 'select',
        key: 'polarity',
        label: 'Tweeter polarity',
        options: [
          { value: 'auto', label: 'Recommended' },
          { value: 'normal', label: 'Normal (+)' },
          { value: 'inverted', label: 'Inverted (−)' },
        ],
        help: 'Recommended: inverted for 2nd-order sections, normal for 1st and 4th order; 3rd-order Butterworth sums flat either way (normal is shown). Choosing the other one shows what goes wrong.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Drivers',
    note: 'Nominal impedances, treated as pure resistances.',
    fields: [
      { kind: 'number', key: 'rW', symbol: 'R_W', label: 'Woofer impedance', unit: 'Ω', min: 1, max: 100, help: 'Use the measured impedance around f_c if you have it (often above nominal because of voice-coil inductance — or add a Zobel network to flatten it).' },
      { kind: 'number', key: 'rT', symbol: 'R_T', label: 'Tweeter impedance', unit: 'Ω', min: 1, max: 100 },
      { kind: 'number', key: 'padDb', symbol: 'A_T', label: 'Tweeter L-pad', suffix: 'dB', min: 0, max: 30, help: 'Attenuation to level a more sensitive tweeter (difference in dB SPL/2.83 V). The L-pad presents R_T to the filter, so the filter values do not change. 0 = no pad.' },
    ],
  },
  {
    kind: 'section',
    title: 'Parts',
    fields: [
      { kind: 'select', key: 'eseries', label: 'Component values', options: [{ value: 'ideal', label: 'Ideal (exact)' }, 'E6', 'E12', 'E24'], help: 'Rounds every L and C to the nearest preferred value; graphs and the crossing frequency use the rounded parts. Film capacitors are commonly E6/E12; inductors can be wound to any value.' },
    ],
  },
];

function roundTo(v: number, series: CrossoverState['eseries']): number {
  return series === 'ideal' ? v : nearestE(v, series);
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

const unitOf = (p: Part) => (p.kind === 'L' ? 'H' : 'F');
/** dB with two decimals, never "-0.00"; very deep values shown as "< −100". */
const fmtDb = (v: number) => (v < -99.995 ? '< −100' : (Math.abs(v) < 0.005 ? 0 : v).toFixed(2).replace('-', '−'));

export function compute(st: CrossoverState): CalcReport {
  for (const k of ['fc', 'rW', 'rT', 'padDb'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  const proto = PROTOS[st.type];
  if (!proto) throw new Error(`Unknown alignment "${st.type}".`);
  if (!(st.fc > 0)) throw new Error('Crossover frequency must be > 0.');
  if (!(st.rW > 0) || !(st.rT > 0)) throw new Error('Driver impedances must be > 0.');
  if (st.padDb < 0) throw new Error('L-pad attenuation must be ≥ 0 dB.');

  const polarity: Polarity = st.polarity === 'auto' ? proto.polarity : st.polarity;
  const warnings: string[] = [];
  const notes: string[] = [];

  const lpIdeal = sectionParts(st.type, 'lp', st.fc, st.rW);
  const hpIdeal = sectionParts(st.type, 'hp', st.fc, st.rT);
  const lp = lpIdeal.map((p) => ({ ...p, value: roundTo(p.value, st.eseries) }));
  const hp = hpIdeal.map((p) => ({ ...p, value: roundTo(p.value, st.eseries) }));

  // ── response figures (as built)
  const at = (f: number) => evaluate(lp, hp, st.rW, st.rT, polarity, f);
  const atIdeal = (f: number) => evaluate(lpIdeal, hpIdeal, st.rW, st.rT, polarity, f);
  const pc = at(st.fc);
  // crossing frequency of the as-built sections: |LP| = |HP|
  const diff = (lf: number) => {
    const p = at(10 ** lf);
    return dB(p.lp) - dB(p.hp);
  };
  let fCross = st.fc;
  try {
    fCross = 10 ** brent(diff, Math.log10(st.fc / 4), Math.log10(st.fc * 4), 1e-12);
  } catch {
    /* keep fc */
  }
  const pCross = at(fCross);

  // sum deviation over two decades around fc
  const fsDev = logspace(st.fc / 10, st.fc * 10, 401);
  let sumMax = -Infinity;
  let sumMin = Infinity;
  let zMin = Infinity;
  let fzMin = st.fc;
  for (const f of logspace(st.fc / 100, Math.min(st.fc * 100, 1e6), 601)) {
    const zi = at(f).zin;
    const z = Math.hypot(zi.re, zi.im);
    if (z < zMin) {
      zMin = z;
      fzMin = f;
    }
  }
  for (const f of fsDev) {
    const v = dB(at(f).sum);
    sumMax = Math.max(sumMax, v);
    sumMin = Math.min(sumMin, v);
  }
  const sumFc = dB(pc.sum);
  // wrapped to (−180°, 180°], so 2nd-order sections read +180° rather than −180°
  const rawDiff = ((Math.atan2(pc.hp.im, pc.hp.re) - Math.atan2(pc.lp.im, pc.lp.re)) * 180) / Math.PI;
  let phaseDiff = ((rawDiff % 360) + 360) % 360;
  if (phaseDiff > 180 + 1e-9) phaseDiff -= 360;
  if (Math.abs(phaseDiff - 180) < 1e-6) phaseDiff = 180;

  // ── warnings
  if (polarity !== proto.polarity && !proto.eitherPolarity)
    warnings.push(`With the tweeter ${polarity === 'normal' ? 'in normal polarity' : 'inverted'}, the ${proto.label} sections cancel at f_c (sum ${sumFc < -60 ? 'a deep notch, below −60 dB' : `${sumFc.toFixed(1)} dB`}). Connect the tweeter ${proto.polarity === 'inverted' ? 'inverted (swap its + and − leads)' : 'in normal polarity'}.`);
  if (st.fc < 300) warnings.push(`f_c = ${si(st.fc, 'Hz', 3)} needs very large inductors (${si(lp[0].value, 'H', 3)}); their resistance eats woofer output and damping. Below ~300 Hz an active crossover is usually the better choice.`);
  if (st.fc > 8000) warnings.push(`f_c = ${si(st.fc, 'Hz', 3)} is unusually high for a two-way: most woofers beam and break up well below this. Check the drivers’ data.`);
  const lMax = Math.max(...lp.filter((p) => p.kind === 'L').map((p) => p.value));
  if (lMax > 4e-3 && st.fc >= 300) notes.push(`Largest inductor ${si(lMax, 'H', 3)}: use a low-DCR air-core or laminated-core part; its DCR adds in series with the woofer (keep it below ~5 % of R_W).`);
  if (zMin < 0.7 * Math.min(st.rW, st.rT)) warnings.push(`The amplifier load dips to ${si(zMin, 'Ω', 3)} at ${si(fzMin, 'Hz', 3)} — check that the amplifier is rated for it.`);
  if (st.eseries !== 'ideal' && Math.abs(fCross / st.fc - 1) > 0.05) warnings.push(`Rounding to ${st.eseries} moves the crossing point to ${si(fCross, 'Hz', 3)} (${((fCross / st.fc - 1) * 100).toFixed(1)} %). Use a finer series or parallel two capacitors.`);

  // ── results
  const r = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const polText = polarity === 'inverted' ? 'Inverted (−)' : 'Normal (+)';
  const results: ResultItem[] = [
    r('polarity', 'Tweeter polarity', polarity, '', polText, { primary: true, note: proto.eitherPolarity ? 'either polarity sums flat; this one shown' : polarity === proto.polarity ? 'as required by the alignment' : 'not the recommended polarity', tone: polarity !== proto.polarity && !proto.eitherPolarity ? 'fail' : '' }),
    r('sumAtFc', 'Summed level at f_c', sumFc, 'dB', `${fmtDb(sumFc)} dB`, { symbol: 'Σ(f_c)', primary: true, note: `range ${fmtDb(sumMin)} … ${fmtDb(sumMax)} dB over f_c/10–10 f_c` }),
    r('fCross', 'Crossing frequency', fCross, 'Hz', si(fCross, 'Hz', 4), { symbol: 'f_x', primary: true, note: `sections at ${fmtDb(dB(pCross.lp))} dB${st.eseries !== 'ideal' ? `, ${st.eseries} parts` : ''}` }),
    r('zMin', 'Minimum load impedance', zMin, 'Ω', si(zMin, 'Ω', 3), { symbol: '|Z|min', primary: true, note: `at ${si(fzMin, 'Hz', 3)}` }),
  ];
  const partItem = (p: Part, ideal: Part, group: string): ResultItem =>
    r(`${group === 'Woofer low-pass' ? 'lp' : 'hp'}.${p.ref}`, `${p.ref} (${p.position})`, p.value, unitOf(p), si(p.value, unitOf(p), st.eseries === 'ideal' ? 4 : 3), { group, symbol: p.ref, note: st.eseries === 'ideal' ? undefined : `ideal ${si(ideal.value, unitOf(p), 4)}` });
  lp.forEach((p, i) => results.push(partItem(p, lpIdeal[i], 'Woofer low-pass')));
  hp.forEach((p, i) => results.push(partItem(p, hpIdeal[i], 'Tweeter high-pass')));
  if (st.padDb > 0) {
    const pad = lPad(st.rT, st.padDb);
    results.push(r('padRs', 'L-pad series resistor', pad.rs, 'Ω', si(pad.rs, 'Ω', 3), { group: 'Tweeter L-pad', symbol: 'R_s', note: 'between filter and tweeter' }));
    results.push(r('padRp', 'L-pad parallel resistor', pad.rp, 'Ω', si(pad.rp, 'Ω', 3), { group: 'Tweeter L-pad', symbol: 'R_p', note: 'across the tweeter' }));
  }
  results.push(
    r('lpAtFc', 'Low-pass level at f_c', dB(pc.lp), 'dB', `${fmtDb(dB(pc.lp))} dB`, { group: 'Response at f_c', symbol: '|H_LP|' }),
    r('hpAtFc', 'High-pass level at f_c', dB(pc.hp), 'dB', `${fmtDb(dB(pc.hp))} dB`, { group: 'Response at f_c', symbol: '|H_HP|' }),
    r('phaseDiff', 'Phase HP − LP', phaseDiff, '°', `${phaseDiff.toFixed(1)}°`, { group: 'Response at f_c', symbol: 'Δφ', note: 'before any polarity inversion' }),
    r('slope', 'Ultimate slope', 6.0206 * proto.order, 'dB/oct', `${(6.0206 * proto.order).toFixed(0)} dB/octave`, { group: 'Response at f_c' }),
  );

  const table: TableSpec = {
    id: 'parts',
    title: 'Parts list (amplifier → driver)',
    columns: [
      { key: 'ref', label: 'Ref', align: 'left' },
      { key: 'section', label: 'Section', align: 'left' },
      { key: 'position', label: 'Position', align: 'left' },
      { key: 'ideal', label: 'Ideal' },
      { key: 'built', label: st.eseries === 'ideal' ? 'Value' : st.eseries },
      { key: 'error', label: 'Error' },
    ],
    rows: [],
    display: [],
  };
  const addRows = (parts: Part[], ideal: Part[], section: string) =>
    parts.forEach((p, i) => {
      const err = (p.value / ideal[i].value - 1) * 100;
      table.rows.push({ ref: p.ref, section, position: p.position, ideal: ideal[i].value, built: p.value, error: err });
      table.display!.push({ ref: p.ref, section, position: p.position, ideal: si(ideal[i].value, unitOf(p), 4), built: si(p.value, unitOf(p), 3), error: st.eseries === 'ideal' ? '—' : `${err >= 0 ? '+' : ''}${err.toFixed(1)} %` });
    });
  addRows(lp, lpIdeal, 'woofer LP');
  addRows(hp, hpIdeal, 'tweeter HP');
  if (st.padDb > 0) {
    const pad = lPad(st.rT, st.padDb);
    table.rows.push({ ref: 'Rs', section: 'tweeter pad', position: 'series', ideal: pad.rs, built: pad.rs, error: 0 });
    table.display!.push({ ref: 'Rs', section: 'tweeter pad', position: 'series', ideal: si(pad.rs, 'Ω', 3), built: si(pad.rs, 'Ω', 3), error: '—' });
    table.rows.push({ ref: 'Rp', section: 'tweeter pad', position: 'shunt', ideal: pad.rp, built: pad.rp, error: 0 });
    table.display!.push({ ref: 'Rp', section: 'tweeter pad', position: 'shunt', ideal: si(pad.rp, 'Ω', 3), built: si(pad.rp, 'Ω', 3), error: '—' });
  }
  table.note = 'Series parts are in line with the driver, shunt parts across it, in the order listed from the amplifier side.';

  notes.push(
    'Drivers are modelled as pure resistances equal to their nominal impedance, with flat, equal acoustic output and coincident acoustic centres. Real voice-coil inductance, the drivers’ own roll-offs and their offset change the acoustic result: use the electrical response as a starting point and measure.',
    'Ideal lossless L and C; inductor DCR adds series resistance and lowers the woofer level.',
    `Element values: Linkwitz–Riley and Butterworth all-pole ladders, voltage-driven, matched coefficient by coefficient (Linkwitz 1976; Bullock; Dickason).`,
  );
  if (st.padDb > 0) notes.push(`Graphs assume the ${st.padDb} dB L-pad exactly offsets the tweeter’s extra sensitivity.`);

  // ── graphs
  const fLo = Math.max(st.fc / 30, 2);
  const fHi = st.fc * 30;
  const fs = logspace(fLo, fHi, 361);
  const pts = fs.map(at);
  const clampDb = (v: number) => Math.max(v, -60);
  const otherLabel = polarity === 'normal' ? 'Sum, tweeter inverted' : 'Sum, tweeter normal';
  const g1: GraphSpec = {
    id: 'response',
    title: 'Response',
    subtitle: `resistive drivers, ${st.eseries === 'ideal' ? 'ideal parts' : `${st.eseries} parts`}`,
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'db', label: 'Level', unit: 'dB', min: -40, max: 6 }],
    series: [
      { label: 'Sum', x: fs, y: pts.map((p) => clampDb(dB(p.sum))), axis: 'db', color: '#1f4e5f', width: 2.4 },
      { label: 'Woofer (LP)', x: fs, y: pts.map((p) => clampDb(dB(p.lp))), axis: 'db', color: '#4f8a8b', width: 1.6 },
      { label: 'Tweeter (HP)', x: fs, y: pts.map((p) => clampDb(dB(p.hp))), axis: 'db', color: '#c47b17', width: 1.6 },
      { label: otherLabel, x: fs, y: pts.map((p) => clampDb(dB(p.sumOther))), axis: 'db', color: '#9a8f7a', width: 1.2, dash: [5, 3] },
      ...(st.eseries !== 'ideal' ? [{ label: 'Sum, ideal parts', x: fs, y: fs.map((f) => clampDb(dB(atIdeal(f).sum))), axis: 'db', color: '#6b5b95', width: 1.2, dash: [2, 3] }] : []),
    ],
    hlines: [
      { value: proto.levelAtFc, label: `${proto.levelAtFc.toFixed(0)} dB`, axis: 'db', color: '#9a8f7a', dash: [2, 3] },
    ],
    vlines: [{ value: st.fc, label: `f_c = ${si(st.fc, 'Hz', 3)}` }],
  };
  const g2: GraphSpec = {
    id: 'impedance',
    title: 'Amplifier load',
    subtitle: 'input impedance of both sections in parallel',
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [
      { id: 'z', label: '|Z|', unit: 'Ω', includeZero: true },
      { id: 'ph', label: 'Phase', unit: '°', side: 'right', min: -90, max: 90 },
    ],
    series: [
      { label: '|Z|', x: fs, y: pts.map((p) => Math.min(Math.hypot(p.zin.re, p.zin.im), 1e4)), axis: 'z', width: 2.2 },
      { label: 'Phase', x: fs, y: pts.map((p) => (Math.atan2(p.zin.im, p.zin.re) * 180) / Math.PI), axis: 'ph', color: '#c47b17', width: 1.4, dash: [5, 3] },
    ],
    vlines: [{ value: st.fc, label: `f_c` }],
    markers: [{ x: fzMin, y: zMin, axis: 'z', label: `min ${si(zMin, 'Ω', 3)}` }],
  };
  const g3: GraphSpec = {
    id: 'phase',
    title: 'Phase',
    subtitle: 'driver voltages relative to the amplifier, after the tweeter polarity',
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'ph', label: 'Phase', unit: '°', min: -180, max: 180 }],
    series: [
      { label: 'Woofer', x: fs, y: pts.map((p) => (Math.atan2(p.lp.im, p.lp.re) * 180) / Math.PI), axis: 'ph', color: '#4f8a8b', width: 1.6 },
      { label: 'Tweeter', x: fs, y: pts.map((p) => { const s = polarity === 'inverted' ? -1 : 1; return (Math.atan2(s * p.hp.im, s * p.hp.re) * 180) / Math.PI; }), axis: 'ph', color: '#c47b17', width: 1.6 },
      { label: 'Sum', x: fs, y: pts.map((p) => (Math.atan2(p.sum.im, p.sum.re) * 180) / Math.PI), axis: 'ph', color: '#1f4e5f', width: 2 },
    ],
    vlines: [{ value: st.fc, label: 'f_c' }],
  };

  return {
    calc: 'audio/speaker-crossover',
    ok: true,
    status: polarity !== proto.polarity && !proto.eitherPolarity ? { text: 'POLARITY', tone: 'fail' } : undefined,
    results,
    graphs: [g1, g2, g3],
    tables: [table],
    warnings,
    notes,
    summary: `${proto.label} at ${si(st.fc, 'Hz', 3)} · woofer ${si(st.rW, 'Ω')} / tweeter ${si(st.rT, 'Ω')} · tweeter ${polarity === 'inverted' ? 'inverted' : 'normal'} · sum ${fmtDb(sumMin)} … ${fmtDb(sumMax)} dB`,
    details: { lpIdeal, hpIdeal, lp, hp, g: proto.g, polarity, sumAtFc: sumFc, sumMin, sumMax, fCross, zMin, fzMin },
  };
}

export const def: CalcDef<CrossoverState> = {
  id: 'audio/speaker-crossover',
  version: '0.1.0',
  method:
    'Passive two-way crossover: voltage-driven LC ladders into resistive drivers, element values matched to Butterworth and Linkwitz–Riley denominators (Linkwitz, JAES 1976; Bullock; Dickason, Loudspeaker Design Cookbook). Responses, sum (with the tweeter polarity) and amplifier load are computed from the actual (optionally E-series-rounded) parts with ABCD matrices.',
  fields,
  defaults,
  compute,
  examples: [
    { id: 'lr2-2k5', label: '2nd-order Linkwitz–Riley, 2.5 kHz, 8 Ω/8 Ω', state: { type: 'lr2', fc: 2500, fcUnit: 'kHz', polarity: 'auto', rW: 8, rT: 8, padDb: 0, eseries: 'ideal' } },
    { id: 'lr4-e12', label: '4th-order LR, 2 kHz, 6 Ω woofer / 4 Ω tweeter, E12', state: { type: 'lr4', fc: 2000, fcUnit: 'kHz', polarity: 'auto', rW: 6, rT: 4, padDb: 0, eseries: 'E12' } },
    { id: 'bw1-3k', label: '1st-order, 3 kHz, tweeter padded 4 dB', state: { type: 'bw1', fc: 3000, fcUnit: 'kHz', polarity: 'auto', rW: 8, rT: 8, padDb: 4, eseries: 'E6' } },
    { id: 'bw2-peak', label: '2nd-order Butterworth: +3 dB bump at f_c', state: { type: 'bw2', fc: 2500, fcUnit: 'kHz', polarity: 'auto', rW: 8, rT: 8, padDb: 0, eseries: 'ideal' } },
    { id: 'lr2-wrong', label: 'Edge case: LR2 with tweeter not inverted (notch at f_c)', state: { type: 'lr2', fc: 2500, fcUnit: 'kHz', polarity: 'normal', rW: 8, rT: 8, padDb: 0, eseries: 'ideal' } },
    { id: 'bw3-3k5', label: '3rd-order Butterworth, 3.5 kHz, 4 Ω', state: { type: 'bw3', fc: 3500, fcUnit: 'kHz', polarity: 'auto', rW: 4, rT: 4, padDb: 0, eseries: 'E24' } },
  ],
};
