/** LC Resonance — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { nearestE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_IND } from '@/core/unitsets';
import { type LcCircuit, type Topology, band, cFor, f0Of, impedance, lFor, logspace, mag, parallelZeroPhase, phaseDeg, response, z0Of } from './model';

export interface LcState {
  solveFor: 'f0' | 'l' | 'c';
  f0: number;
  f0Unit: string;
  l: number;
  lUnit: string;
  c: number;
  cUnit: string;
  topology: Topology;
  /** Series topology: total series resistance */
  rs: number;
  /** Parallel topology: inductor series resistance (coil ESR) */
  rl: number;
  /** Parallel topology: shunt resistance; null = none */
  rp: number | null;
  eseries: 'E12' | 'E24' | 'E96' | 'none';
}

export const defaults = (): LcState => ({
  solveFor: 'f0',
  f0: 10.7e6,
  f0Unit: 'MHz',
  l: 1e-6,
  lUnit: 'µH',
  c: 220e-12,
  cUnit: 'pF',
  topology: 'series',
  rs: 2,
  rl: 0.5,
  rp: null,
  eseries: 'E12',
});

// L and C can be solved up to the field limits (1 kH, 10 F): H, mF and F keep such answers readable.
const U_L = { ...U_IND, H: 1 };
const U_C = { ...U_CAP, mF: 1e-3, F: 1 };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Resonator',
    note: 'Click ◎ to choose the unknown: f₀, L or C.',
    fields: [
      { kind: 'number', key: 'f0', symbol: 'f₀', label: 'Resonant frequency', units: U_FREQ, unitKey: 'f0Unit', solvable: true, min: 1e-3, max: 1e12, help: 'Undamped resonance 1/(2π√LC). With a lossy coil the parallel tank’s zero-phase frequency is slightly lower (see results).' },
      { kind: 'number', key: 'l', symbol: 'L', label: 'Inductance', units: U_L, unitKey: 'lUnit', solvable: true, min: 1e-15, max: 1e3 },
      { kind: 'number', key: 'c', symbol: 'C', label: 'Capacitance', units: U_C, unitKey: 'cUnit', solvable: true, min: 1e-18, max: 10, help: 'Include strays: pad, trace and the device input typically add 1–5 pF, which matters above a few MHz.' },
    ],
  },
  {
    kind: 'section',
    title: 'Losses & topology',
    fields: [
      {
        kind: 'select', key: 'topology', label: 'Topology',
        options: [
          { value: 'series', label: 'Series RLC' },
          { value: 'parallel', label: 'Parallel tank' },
        ],
        help: 'Series: L, C and R in one loop — impedance is minimum (R) at resonance. Parallel: L ‖ C — impedance is maximum.',
      },
      { kind: 'number', key: 'rs', symbol: 'R', label: 'Series resistance', unit: 'Ω', min: 0, max: 1e9, visible: (s) => s.topology === 'series', help: 'Total loop resistance: coil ESR + capacitor ESR + source and load resistance. 0 = lossless.' },
      { kind: 'number', key: 'rl', symbol: 'r_L', label: 'Inductor ESR', unit: 'Ω', min: 0, max: 1e9, visible: (s) => s.topology === 'parallel', help: 'Series loss resistance of the coil at f₀ (r_L = ω₀L/Q_L from the coil’s Q). 0 = ideal inductor.' },
      { kind: 'number', key: 'rp', symbol: 'R_p', label: 'Parallel resistance', unit: 'Ω', min: 1e-3, max: 1e15, optional: true, zeroHint: 'none', visible: (s) => s.topology === 'parallel', help: 'Resistance across the tank: load, source resistance of a current drive, or core loss. Blank = none.' },
      {
        kind: 'select', key: 'eseries', label: 'Standard values',
        options: [{ value: 'E12', label: 'E12' }, { value: 'E24', label: 'E24' }, { value: 'E96', label: 'E96' }, { value: 'none', label: 'Off' }],
        help: 'Nearest preferred values (IEC 60063) for L and C, and the f₀ each gives with the other part unchanged. Inductors are mostly sold in E12 (or E6) steps.',
      },
    ],
  },
];

const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const fmtF = (f: number) => si(f, 'Hz', 5);
const fmtQ = (q: number | null) => (q == null ? '—' : Number.isFinite(q) ? q.toPrecision(4) : '∞');

export function compute(st: LcState): CalcReport {
  const s: LcState = { ...st };
  for (const k of ['f0', 'l', 'c', 'rs', 'rl'] as const) if (!finite(s[k])) throw new Error(`${k} must be a finite number.`);
  if (s.rp != null && !(s.rp > 0)) throw new Error('Parallel resistance must be > 0 (leave it blank for none).');
  if (s.rs < 0 || s.rl < 0) throw new Error('Resistances must be ≥ 0.');
  const need = (k: 'f0' | 'l' | 'c', what: string) => {
    if (s.solveFor !== k && !(s[k] > 0)) throw new Error(`${what} must be > 0.`);
  };
  need('f0', 'Frequency');
  need('l', 'Inductance');
  need('c', 'Capacitance');

  // ── solve (closed-form exact inverses of f₀ = 1/2π√LC)
  if (s.solveFor === 'f0') s.f0 = f0Of(s.l, s.c);
  else if (s.solveFor === 'l') s.l = lFor(s.f0, s.c);
  else s.c = cFor(s.f0, s.l);

  const series = s.topology === 'series';
  const k: LcCircuit = { l: s.l, c: s.c, topology: s.topology, r: series ? s.rs : s.rl, rp: series ? null : s.rp };
  const f0 = s.f0;
  const w0 = 2 * Math.PI * f0;
  const z0 = z0Of(s.l, s.c);
  const warnings: string[] = [];
  const notes: string[] = [];
  const b0 = band(k);
  const fr = series ? f0 : parallelZeroPhase(s.l, s.c, s.rl);

  // Formula Q (energy definition at f₀): series Z₀/R; parallel 1/Q = r_L/Z₀ + Z₀/R_p.
  const qSeries = s.rs > 0 ? z0 / s.rs : Infinity;
  const qCoil = s.rl > 0 ? z0 / s.rl : Infinity;
  const qShunt = s.rp != null ? s.rp / z0 : Infinity;
  const qFormula = series ? qSeries : 1 / (1 / qCoil + 1 / qShunt);
  const zRes = series ? s.rs : fr != null ? 1 / ((s.rp != null ? 1 / s.rp : 0) + (s.rl * s.c) / s.l) : null;
  // No peak found (the search hit its floor) or no −3 dB point on either side: no resonance to measure.
  const noPeak = b0.fPeak < f0 * 1.01e-3 || (b0.f1 == null && b0.f2 == null);
  const b = noPeak ? { ...b0, f1: null, f2: null, bw: null, q: null } : b0;

  // ── validity
  if (Number.isFinite(qFormula) && qFormula < 0.5) notes.push(`Q = ${qFormula.toPrecision(3)} < 0.5: the circuit is overdamped (ζ = ${(1 / (2 * qFormula)).toPrecision(3)} > 1), so its step response does not ring. The frequency response is very broad${noPeak ? '' : ' but still has its maximum and −3 dB points as listed'}.${series ? ` R < 2·Z₀ = ${si(2 * z0, 'Ω', 3)} gives an underdamped circuit.` : ''}`);
  if (noPeak) warnings.push('The tank’s |Z| has no resonant maximum with −3 dB points near f₀ — the coil loss is too high. Q, f₁, f₂ and the bandwidth are undefined; use a coil with lower r_L (higher Q).');
  if (!series && fr == null) warnings.push(`r_L ≥ √(L/C) = ${si(z0, 'Ω', 3)}: the tank never looks purely resistive (no zero-phase resonance). Use a better coil or a higher L/C ratio.`);
  else if (!series && fr != null && Math.abs(fr / f0 - 1) > 0.005) notes.push(`The coil loss pulls the zero-phase resonance ${Math.abs(((fr - f0) / f0) * 100).toFixed(2)} % below f₀ (f_r = f₀·√(1 − r_L²C/L)).`);
  if (!noPeak && (b.f1 == null) !== (b.f2 == null)) warnings.push(`The response falls 3 dB only on the ${b.f1 == null ? 'high' : 'low'}-frequency side of its peak, so there is no −3 dB bandwidth (very low Q).`);
  if (f0 > 1e9) warnings.push(`f₀ = ${fmtF(f0)}: lumped L and C are dominated by parasitics here (pad capacitance, lead inductance, self-resonance). Check the parts’ self-resonant frequency, or use a distributed resonator.`);
  if (s.c < 2e-12) warnings.push(`C = ${si(s.c, 'F', 3)} is comparable to stray capacitance (1–5 pF from pads, traces and device inputs): the real f₀ will be lower. Add the strays to C or raise C.`);
  if (s.l < 2e-9) warnings.push(`L = ${si(s.l, 'H', 3)} is comparable to the inductance of a few millimetres of trace or a component lead (~1 nH/mm): the real f₀ will be lower.`);
  if (!Number.isFinite(qFormula) && (series || s.rp == null)) notes.push('Lossless circuit: Q and the impedance at resonance are unbounded and the bandwidth is zero. Enter a series or parallel resistance for a realistic Q.');

  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value: value != null && Number.isFinite(value) ? value : null, unit, display, ...extra });
  const primary: ResultItem[] = [];
  if (s.solveFor === 'f0') primary.push(item('f0', 'Resonant frequency', f0, 'Hz', fmtF(f0), { symbol: 'f₀', primary: true, solved: true, note: `ω₀ = ${si(w0, 'rad/s', 4)}` }));
  if (s.solveFor === 'l') primary.push(item('l', 'Inductance', s.l, 'H', si(s.l, 'H', 5), { symbol: 'L', primary: true, solved: true, note: `for ${fmtF(f0)} with C = ${si(s.c, 'F', 4)}` }));
  if (s.solveFor === 'c') primary.push(item('c', 'Capacitance', s.c, 'F', si(s.c, 'F', 5), { symbol: 'C', primary: true, solved: true, note: `for ${fmtF(f0)} with L = ${si(s.l, 'H', 4)}` }));
  primary.push(item('z0', 'Characteristic impedance', z0, 'Ω', si(z0, 'Ω', 4), { symbol: 'Z₀', primary: true, note: '√(L/C) = X_L = X_C at f₀' }));
  const qShown = b.q ?? (Number.isFinite(qFormula) ? qFormula : null);
  primary.push(item('q', 'Quality factor', b.q, '', fmtQ(b.q ?? (Number.isFinite(qFormula) ? null : Infinity)), { symbol: 'Q', primary: true, tone: qShown != null && qShown < 0.5 ? 'warn' : '', note: b.q != null && Number.isFinite(b.q) ? series ? 'f₀/BW from the half-power points' : 'f_peak/BW, measured on the computed |Z(f)|' : Number.isFinite(qFormula) ? `formula ${qFormula.toPrecision(3)}, no −3 dB band` : 'lossless' }));
  primary.push(item('bw', 'Bandwidth (−3 dB)', b.bw, 'Hz', b.bw == null ? '—' : b.bw === 0 ? '0 (lossless)' : si(b.bw, 'Hz', 4), { symbol: 'BW', primary: true, note: b.f1 != null && b.f2 != null && b.bw ? `${fmtF(b.f1)} … ${fmtF(b.f2)}` : '' }));

  const gr = 'At resonance';
  const more: ResultItem[] = [
    item('w0', 'Angular frequency', w0, 'rad/s', si(w0, 'rad/s', 5), { symbol: 'ω₀', group: gr }),
    item('xl', 'Reactance of L at f₀', z0, 'Ω', si(z0, 'Ω', 4), { symbol: 'X_L', group: gr, note: 'ω₀L' }),
    item('xc', 'Reactance of C at f₀', z0, 'Ω', si(z0, 'Ω', 4), { symbol: 'X_C', group: gr, note: '1/(ω₀C)' }),
    item('period', 'Period', 1 / f0, 's', si(1 / f0, 's', 4), { symbol: 'T₀', group: gr }),
  ];
  if (series) {
    more.push(item('zRes', 'Impedance at f₀ (minimum)', s.rs, 'Ω', si(s.rs, 'Ω', 4), { symbol: '|Z|min', group: gr, note: 'purely resistive' }));
    if (Number.isFinite(qSeries)) more.push(item('vGain', 'Voltage across L or C', qSeries, '× V_in', `${qSeries.toPrecision(4)} × V_in`, { group: gr, note: 'Q·V_in at f₀ — check the capacitor’s voltage rating' }));
  } else {
    more.push(item('fr', 'Zero-phase resonance', fr, 'Hz', fr == null ? '— (none)' : fmtF(fr), { symbol: 'f_r', group: gr, note: 'unity power factor: f₀·√(1 − r_L²C/L)' }));
    more.push(item('zRes', 'Impedance at f_r', zRes, 'Ω', zRes == null ? '—' : Number.isFinite(zRes) ? si(zRes, 'Ω', 4) : '∞ (lossless)', { symbol: 'R_D', group: gr, note: 'R_p ‖ L/(r_L·C) — the dynamic resistance' }));
    if (!noPeak) more.push(item('fPeak', 'Frequency of maximum |Z|', b.fPeak, 'Hz', fmtF(b.fPeak), { symbol: 'f_m', group: gr }));
  }
  const gb = 'Q & bandwidth';
  more.push(
    item('qFormula', series ? 'Q = Z₀/R' : 'Q from 1/Q = r_L/Z₀ + Z₀/R_p', qFormula, '', fmtQ(qFormula), { symbol: 'Q₀', group: gb, note: series ? 'equals f₀/BW exactly for series RLC' : 'energy definition at f₀; ≈ f/BW when Q ≫ 1' }),
    item('f1', 'Lower −3 dB frequency', b.f1, 'Hz', b.f1 == null ? '—' : fmtF(b.f1), { symbol: 'f₁', group: gb }),
    item('f2', 'Upper −3 dB frequency', b.f2, 'Hz', b.f2 == null ? '—' : fmtF(b.f2), { symbol: 'f₂', group: gb }),
    item('zeta', 'Damping ratio', Number.isFinite(qFormula) ? 1 / (2 * qFormula) : 0, '', Number.isFinite(qFormula) ? (1 / (2 * qFormula)).toPrecision(4) : '0', { symbol: 'ζ', group: gb, note: '1/(2Q)' }),
  );
  if (!series) {
    if (Number.isFinite(qCoil)) more.push(item('qCoil', 'Coil Q at f₀', qCoil, '', fmtQ(qCoil), { symbol: 'Q_L', group: gb, note: 'ω₀L/r_L' }));
    if (s.rp != null) more.push(item('qShunt', 'Q set by R_p alone', qShunt, '', fmtQ(qShunt), { symbol: 'Q_p', group: gb, note: 'R_p/(ω₀L)' }));
  }

  // ── standard values
  if (s.eseries !== 'none') {
    const cStd = nearestE(s.c, s.eseries);
    const lStd = nearestE(s.l, s.eseries);
    const ge = `Nearest ${s.eseries} values`;
    const dev = (f: number) => `${(((f - f0) / f0) * 100).toFixed(2)} %`;
    more.push(
      item('cStd', `Nearest ${s.eseries} capacitor`, cStd, 'F', si(cStd, 'F', 3), { symbol: 'C_E', group: ge }),
      item('f0CStd', 'f₀ with that C (same L)', f0Of(s.l, cStd), 'Hz', `${fmtF(f0Of(s.l, cStd))} (${dev(f0Of(s.l, cStd))})`, { group: ge }),
      item('lStd', `Nearest ${s.eseries} inductor`, lStd, 'H', si(lStd, 'H', 3), { symbol: 'L_E', group: ge }),
      item('f0LStd', 'f₀ with that L (same C)', f0Of(lStd, s.c), 'Hz', `${fmtF(f0Of(lStd, s.c))} (${dev(f0Of(lStd, s.c))})`, { group: ge }),
    );
  }
  const results = [...primary, ...more];
  if (!series && Number.isFinite(qFormula)) notes.push(`At resonance the current circulating in L and C is about Q ≈ ${qFormula.toPrecision(3)} times the current fed into the tank.`);
  if (series && Number.isFinite(qSeries) && qSeries > 1) notes.push(`At f₀ the voltage across L (and across C) is Q ≈ ${qSeries.toPrecision(3)} times the drive voltage — size the capacitor’s voltage rating for it.`);
  notes.push('Ideal L and C (no self-resonance, no frequency-dependent loss). Coil ESR rises with frequency (skin effect), so enter r_L or R at f₀.');

  return {
    calc: 'general/lc-resonance',
    ok: true,
    solveFor: s.solveFor,
    results,
    graphs: graphs(k, f0, z0, b, fr),
    tables: [],
    warnings,
    notes,
    summary: `${series ? 'Series RLC' : 'Parallel tank'} · f₀ = ${fmtF(f0)} · Z₀ = ${si(z0, 'Ω', 4)} · Q = ${fmtQ(qShown ?? Infinity)}`,
    details: { f0, w0, z0, qFormula: Number.isFinite(qFormula) ? qFormula : null, band: b, fr, zRes },
  };
}

function graphs(k: LcCircuit, f0: number, z0: number, b: ReturnType<typeof band>, fr: number | null): GraphSpec[] {
  const series = k.topology === 'series';
  const fc = series ? f0 : b.fPeak;
  // Wide log sweep (even count so f₀ itself is not sampled: a lossless circuit has |Z| = 0 or ∞ there),
  // plus dense points across the resonance so a high-Q peak is resolved.
  let fs = logspace(f0 / 10, f0 * 10, 400);
  const hasBand = b.bw != null && b.bw > 0 && b.f1 != null && b.f2 != null;
  if (hasBand && b.bw! < f0) {
    const span = 8 * b.bw!;
    const lo = Math.max(fc - span, f0 / 10);
    fs = fs.concat(Array.from({ length: 300 }, (_, i) => lo + ((fc + span - lo) * (i + 0.5)) / 300));
  } else if (!hasBand) {
    fs = fs.concat(Array.from({ length: 200 }, (_, i) => f0 * (1 + ((i - 99.5) / 100) * 0.02)));
  }
  fs = fs.filter((f) => f > 0).sort((a, c) => a - c);
  const zs = fs.map((f) => impedance(k, f));
  const zMag = zs.map(mag).map((v) => Math.min(Math.max(v, 1e-12), 1e18));
  const graphsOut: GraphSpec[] = [
    {
      id: 'impedance',
      title: series ? 'Impedance of the series RLC' : 'Impedance of the parallel tank',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [
        { id: 'z', label: '|Z|', unit: 'Ω', log: true },
        { id: 'ph', label: 'Phase', unit: '°', side: 'right', min: -90, max: 90 },
      ],
      series: [
        { label: '|Z|', x: fs, y: zMag, axis: 'z', width: 2.2, color: '#1f4e5f' },
        { label: 'Phase', x: fs, y: zs.map(phaseDeg), axis: 'ph', width: 1.3, color: '#c47b17', dash: [5, 3] },
      ],
      vlines: [{ value: f0, label: `f₀ = ${si(f0, 'Hz', 4)}` }, ...(!series && fr != null && Math.abs(fr / f0 - 1) > 1e-3 ? [{ value: fr, label: `f_r = ${si(fr, 'Hz', 4)}`, color: '#4f8a8b', dash: [3, 3] }] : [])],
      hlines: [{ value: z0, label: `Z₀ = ${si(z0, 'Ω', 3)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }],
      markers: hasBand
        ? [b.f1!, b.f2!].map((f) => ({ x: f, y: mag(impedance(k, f)), axis: 'z', label: `−3 dB ${si(f, 'Hz', 4)}`, color: '#8b1e1e' }))
        : [],
    },
  ];
  if (hasBand) {
    const span = Math.min(4 * b.bw!, fc * 0.999);
    const fz = Array.from({ length: 401 }, (_, i) => fc - span + (2 * span * i) / 400);
    graphsOut.push({
      id: 'zoom',
      title: 'Response near resonance',
      subtitle: series ? 'Current for a voltage drive, |Y|/|Y|max' : 'Voltage for a current drive, |Z|/|Z|max',
      x: { label: 'Frequency', unit: 'Hz' },
      y: [{ id: 'db', label: 'Relative response', unit: 'dB' }],
      series: [{ label: 'Response', x: fz, y: fz.map((f) => 20 * Math.log10(response(k, f) / b.peak)), axis: 'db', width: 2.2, color: '#1f4e5f' }],
      hlines: [{ value: -10 * Math.log10(2), label: '−3.01 dB', axis: 'db', color: '#8b1e1e', dash: [4, 3] }],
      vlines: [
        { value: b.f1!, label: `f₁ = ${si(b.f1!, 'Hz', 5)}` },
        { value: b.f2!, label: `f₂ = ${si(b.f2!, 'Hz', 5)}` },
      ],
    });
  }
  const fx = logspace(f0 / 100, f0 * 100, 200);
  graphsOut.push({
    id: 'reactance',
    title: 'Reactance chart',
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'x', label: 'Reactance', unit: 'Ω', log: true }],
    series: [
      { label: 'X_L = ωL', x: fx, y: fx.map((f) => 2 * Math.PI * f * k.l), axis: 'x', width: 2, color: '#1f4e5f' },
      { label: 'X_C = 1/ωC', x: fx, y: fx.map((f) => 1 / (2 * Math.PI * f * k.c)), axis: 'x', width: 2, color: '#c47b17' },
    ],
    markers: [{ x: f0, y: z0, axis: 'x', label: `f₀, ${si(z0, 'Ω', 3)}` }],
    vlines: [{ value: f0, label: `f₀ = ${si(f0, 'Hz', 4)}` }],
  });
  return graphsOut;
}

export const def: CalcDef<LcState> = {
  id: 'general/lc-resonance',
  version: '0.1.0',
  method: 'f₀ = 1/(2π√LC) and Z₀ = √(L/C); series RLC Q = Z₀/R with exact half-power frequencies (Pozar, Microwave Engineering 4e §6.1; Alexander & Sadiku ch. 14); parallel tank with coil ESR and shunt R from its exact admittance, zero-phase frequency f₀√(1 − r²C/L) (Boylestad). Q and −3 dB bandwidth are found numerically on |Z(f)|; f₀/L/C solve by exact closed-form inversion.',
  fields,
  defaults,
  solve: {
    default: 'f0',
    analysis: 'f0',
    options: [
      { key: 'f0', label: 'Resonant frequency from L and C' },
      { key: 'l', label: 'Inductance L for f₀, given C' },
      { key: 'c', label: 'Capacitance C for f₀, given L' },
    ],
  },
  compute,
  examples: [
    { id: 'series-default', label: 'Series 1 µH + 220 pF, R = 2 Ω (≈ 10.7 MHz)', state: { solveFor: 'f0', topology: 'series', l: 1e-6, c: 220e-12, rs: 2 } },
    { id: 'sadiku', label: 'Textbook series RLC: 2 Ω, 1 mH, 0.4 µF (Q = 25)', state: { solveFor: 'f0', topology: 'series', l: 1e-3, lUnit: 'mH', c: 0.4e-6, cUnit: 'µF', rs: 2, f0Unit: 'kHz' } },
    { id: 'if-tank', label: '455 kHz IF tank: C for 680 µH, coil Q ≈ 80', state: { solveFor: 'c', topology: 'parallel', f0: 455e3, f0Unit: 'kHz', l: 680e-6, rl: 24.3, rp: null, c: 180e-12 } },
    { id: 'crystal-load', label: '32.768 kHz: L for 10 nF with a 100 kΩ shunt', state: { solveFor: 'l', topology: 'parallel', f0: 32768, f0Unit: 'kHz', c: 10e-9, cUnit: 'nF', rl: 0, rp: 100e3 } },
    { id: 'lossy-coil', label: 'Edge case: very lossy coil in a tank (r_L near √(L/C))', state: { solveFor: 'f0', topology: 'parallel', l: 10e-6, c: 1e-9, cUnit: 'nF', rl: 80, rp: null } },
    { id: 'overdamped', label: 'Edge case: overdamped series circuit (R > 2√(L/C))', state: { solveFor: 'f0', topology: 'series', l: 1e-6, c: 220e-12, rs: 200 } },
  ],
};
