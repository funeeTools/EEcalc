/** PCB trace / wire fusing current (Onderdonk, Preece) — calculator definition. DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, U_THICK, withDefault } from '@/core/unitsets';
import { awgDiameterM } from '@/physics/awg';
import { CMIL, onderdonkI, onderdonkT, preeceI, T_MELT_CU, tempTerm, traceArea } from './model';

export type FuseSolve = 'i' | 'dur' | 'w' | 'd';
export type Conductor = 'trace' | 'wire';

export interface FuseState {
  solveFor: FuseSolve;
  conductor: Conductor;
  w: number;
  wUnit: string;
  cuWeight: string;
  t: number;
  tUnit: string;
  ef: number;
  gauge: string;
  d: number;
  dUnit: string;
  dur: number;
  durUnit: string;
  i: number;
  ta: number;
  tm: number;
}

export const OZ = 34.79e-6;
const MIL = 25.4e-6;
const WEIGHTS: Record<string, number> = { '½ oz (17 µm)': 0.5, '1 oz (35 µm)': 1, '2 oz (70 µm)': 2, '3 oz (105 µm)': 3 };
const GAUGES = ['Custom', ...[10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40].map((n) => `AWG ${n}`)];
const awgOf = (name: string) => (name.startsWith('AWG ') ? awgDiameterM(Number(name.slice(4))) : null);
// seconds and its prefixes only, so a solved time can always be shown readably
const U_TIME: Record<string, number> = { ms: 1e-3, s: 1, 'µs': 1e-6 };
/** Brooks & Adam: Onderdonk holds on a board for pulses up to about 1–1.5 s. */
export const T_VALID = 1.5;

/**
 * A solved length shown in mil, in or ft can become unreadable ("2.5e+6 mil"): the core rescales only within one
 * unit's SI prefixes, which these units lack. Move it to the imperial unit that shows it nearest 1…9999 instead.
 */
const IMPERIAL: Record<string, number> = { mil: 25.4e-6, in: 0.0254, ft: 0.3048 };
function fitImperial(st: Record<string, any>, key: string, unitKey: string, table: Record<string, number>): void {
  const u = st[unitKey];
  const v = st[key];
  if (!(u in IMPERIAL) || !table[u] || !(typeof v === 'number' && v > 0)) return;
  const mant = v / table[u];
  if (mant >= 0.1 && mant < 1e4) return;
  // the imperial unit whose mantissa is nearest 1…9999 (log distance), the largest unit on a tie
  const off = (k: string) => {
    const l = Math.log10(v / table[k]);
    return l < 0 ? -l : l >= 4 ? l - 4 + 1e-9 : 0;
  };
  const fit = Object.keys(IMPERIAL).filter((k) => table[k]).sort((a, b) => off(a) - off(b) || table[b] - table[a]);
  if (fit.length) st[unitKey] = fit[0];
}

export const defaults = (): FuseState => ({
  solveFor: 'i',
  conductor: 'trace',
  w: 0.25e-3,
  wUnit: 'mm',
  cuWeight: '1 oz (35 µm)',
  t: OZ,
  tUnit: 'oz',
  ef: 0,
  gauge: 'AWG 30',
  d: awgDiameterM(30),
  dUnit: 'mm',
  dur: 0.1,
  durUnit: 'ms',
  i: 10,
  ta: 25,
  tm: T_MELT_CU,
});

export const LIM = { w: [1e-6, 0.1], d: [1e-6, 0.1], dur: [1e-6, 3600], i: [1e-6, 1e7] } as const;
const isTrace = (_s: any, r: any) => r.conductor !== 'wire';
const isWire = (_s: any, r: any) => r.conductor === 'wire';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Conductor',
    fields: [
      {
        kind: 'select', key: 'conductor', label: 'Conductor', structural: true,
        options: [{ value: 'trace', label: 'PCB trace' }, { value: 'wire', label: 'Round wire' }],
        // the size unknown follows the conductor (width ↔ diameter): same question, other shape
        apply: (v: Conductor, _s, r) => {
          if (v === 'wire' && r.solveFor === 'w') r.solveFor = 'd';
          if (v === 'trace' && r.solveFor === 'd') r.solveFor = 'w';
        },
      },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', min: LIM.w[0], max: LIM.w[1], solvable: true, visible: isTrace, help: 'Width at the bottom of the trace (the drawn width). Click ◎ to find the width that fuses at I in time t, for a deliberate fusible link.' },
      {
        kind: 'select', key: 'cuWeight', label: 'Copper weight', options: [...Object.keys(WEIGHTS), 'Custom'], visible: isTrace,
        apply: (v: string, s) => {
          const n = WEIGHTS[v];
          if (n) {
            s.t = n * OZ;
            s.tUnit = 'oz';
          }
        },
      },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: withDefault(U_THICK, 'oz'), unitKey: 'tUnit', min: 1e-6, max: 1e-3, visible: isTrace, help: 'Finished thickness, including plating on outer layers (“oz” = oz/ft², 1 oz ≈ 35 µm).' },
      {
        kind: 'select', key: 'ef', label: 'Etch profile', visible: isTrace,
        options: [{ value: 0, label: 'Vertical walls' }, { value: 3, label: 'Etch factor 3:1' }, { value: 2, label: 'Etch factor 2:1' }, { value: 1, label: 'Etch factor 1:1' }],
        help: 'Etch factor = thickness ÷ undercut per side. Each sidewall loses T/EF of width at the top, so the mean width is W − T/EF. Matters for thick copper on narrow traces.',
      },
      {
        kind: 'select', key: 'gauge', label: 'Wire gauge', options: GAUGES, visible: isWire,
        apply: (v: string, s) => {
          const d = awgOf(v);
          if (d) s.d = d;
        },
        help: 'Fills the diameter from the AWG formula (ASTM B258).',
      },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Wire diameter', units: withDefault(U_LEN_PCB, 'mm'), unitKey: 'dUnit', min: LIM.d[0], max: LIM.d[1], solvable: true, visible: isWire, help: 'Bare copper diameter (a jumper wire or bond wire). Click ◎ to find the diameter that fuses at I in time t.' },
    ],
  },
  {
    kind: 'section',
    title: 'Overload pulse',
    fields: [
      { kind: 'number', key: 'i', symbol: 'I', label: 'Current', unit: 'A', min: LIM.i[0], max: LIM.i[1], solvable: true, help: 'Constant current during the pulse. Solved: the current that melts the conductor in time t. Given: the fault current for the time-to-fuse or size solve.' },
      { kind: 'number', key: 'dur', symbol: 't', label: 'Pulse duration', units: U_TIME, unitKey: 'durUnit', min: LIM.dur[0], max: LIM.dur[1], solvable: true, help: 'How long the current flows (a rectangular pulse). Solved: the time for I to melt the conductor.' },
      { kind: 'number', key: 'ta', symbol: 'T_a', label: 'Starting temperature', suffix: '°C', min: -100, max: 500, help: 'Temperature of the copper when the overload starts (ambient plus normal self-heating).' },
      { kind: 'number', key: 'tm', symbol: 'T_m', label: 'Melting / limit temp.', suffix: '°C', min: 50, max: T_MELT_CU, help: 'Copper melts at 1083 °C, the highest value accepted: the model has no latent heat or liquid copper beyond it. Set a lower limit to find when the conductor reaches it instead, e.g. ≈ 250–300 °C where FR-4 starts to char and delaminate.' },
    ],
  },
];

const LABEL: Record<FuseSolve, string> = { i: 'Fusing current', dur: 'Time to fuse', w: 'Trace width to fuse', d: 'Wire diameter to fuse' };
const fmtT = (t: number) => si(t, 's', 4);

export function compute(st: FuseState): CalcReport {
  for (const k of ['w', 't', 'd', 'dur', 'i', 'ta', 'tm', 'ef'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (st.conductor !== 'trace' && st.conductor !== 'wire') throw new Error('Conductor must be "trace" or "wire".');
  if (!['i', 'dur', 'w', 'd'].includes(st.solveFor)) throw new Error('solveFor must be i, dur, w or d.');
  const s: FuseState = { ...st };
  const wire = s.conductor === 'wire';
  // a size unknown always names the size of the conductor shown
  if (wire && s.solveFor === 'w') s.solveFor = 'd';
  if (!wire && s.solveFor === 'd') s.solveFor = 'w';
  if (s.ef < 0) throw new Error('Etch factor must be ≥ 0.');
  if (!wire && !(s.t > 0)) throw new Error('Copper thickness must be > 0.');
  if (!(s.tm > s.ta)) throw new Error(`The melting / limit temperature (${s.tm} °C) must be above the starting temperature (${s.ta} °C).`);
  if (!(s.ta > -234)) throw new Error('Starting temperature must be above −234 °C.');
  if (s.tm > T_MELT_CU + 1e-9) throw new Error(`T_m = ${s.tm} °C is above copper’s melting point (1083 °C); the model has no latent heat or liquid copper beyond it.`);
  if (s.solveFor !== 'i' && !(s.i > 0)) throw new Error('Current must be > 0.');
  if (s.solveFor !== 'dur' && !(s.dur > 0)) throw new Error('Pulse duration must be > 0.');
  if (s.solveFor !== 'w' && !wire && !(s.w > 0)) throw new Error('Trace width must be > 0.');
  // A typed T_m ≤ T_a is a red error on purpose: the mode-switch harness reports it as "error-after-edit" for its
  // max / ×10 number steps, which are typed values.
  // A solved width shown in inches after the user picked 'in' (e.g. "7.9e-5 in") is flagged "unreadable": the core
  // only rescales within one unit's SI prefixes, and inches have none; the user's unit choice is kept on purpose.
  if (s.solveFor !== 'd' && wire && !(s.d > 0)) throw new Error('Wire diameter must be > 0.');
  const cut = !wire && s.ef > 0 ? s.t / s.ef : 0;

  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'pcb/fusing-current', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const areaOf = (x: number) => (wire ? (Math.PI / 4) * x * x : traceArea(x, s.t, s.ef).area);

  // ── solve: one forward equation I(A, t), inverted
  if (s.solveFor === 'dur') s.dur = onderdonkT(areaOf(wire ? s.d : s.w), s.i, s.ta, s.tm);
  else if (s.solveFor === 'i') s.i = onderdonkI(areaOf(wire ? s.d : s.w), s.dur, s.ta, s.tm);
  else {
    const key = s.solveFor;
    const lo = LIM[key][0];
    const hi = LIM[key][1];
    const g = (x: number) => onderdonkI(areaOf(x), s.dur, s.ta, s.tm);
    const stop = (why: string, display: string) => {
      warnings.push(why);
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      report.results.push({ key, label: LABEL[key], value: null, display, primary: true, solved: true });
      return report;
    };
    const what = key === 'w' ? 'trace' : 'wire';
    if (g(lo) > s.i) return stop(`Even the thinnest ${what} the page allows (${si(lo, 'm', 3)}) carries ${si(s.i, 'A', 3)} for ${fmtT(s.dur)} without melting (it fuses at ${si(g(lo), 'A', 3)}). Use a shorter-lived fault, thinner copper, or a real fuse.`, `< ${si(lo, 'm', 3)}`);
    if (g(hi) < s.i) return stop(`${si(s.i, 'A', 3)} for ${fmtT(s.dur)} melts even a ${si(hi, 'm', 3)} ${key === 'w' ? 'wide trace' : 'diameter wire'} (it fuses at ${si(g(hi), 'A', 3)}).`, `> ${si(hi, 'm', 3)}`);
    const r = invert(g, s.i, { lo, hi, log: true, samples: 80 });
    if (!r.ok) return stop(`No ${what} size in range fuses at ${si(s.i, 'A', 3)}.`, '—');
    s[key] = r.roots[0];
  }
  if (s.solveFor === 'i' && !(s.i >= LIM.i[0] && s.i <= LIM.i[1])) {
    const big = s.i > LIM.i[1];
    warnings.push(big
      ? `This conductor would need more than 10 MA to melt in ${fmtT(s.dur)} (${si(s.i, 'A', 3)}): far beyond any real fault: in practice it will not fuse.`
      : `It melts at under 1 µA in ${fmtT(s.dur)} (${si(s.i, 'A', 3)}): check the size and time entered.`);
    report.status = { text: 'NO SOLUTION', tone: 'fail' };
    report.results.push({ key: 'i', label: LABEL.i, value: null, display: big ? '> 10 MA' : '< 1 µA', primary: true, solved: true });
    return report;
  }
  if (s.solveFor === 'dur' && !(s.dur >= LIM.dur[0] && s.dur <= LIM.dur[1])) {
    const long = s.dur > LIM.dur[1];
    warnings.push(long
      ? `${si(s.i, 'A', 3)} would need more than an hour to bring this conductor to ${s.tm} °C even with no cooling — in practice it reaches a steady temperature and never fuses. Use IPC-2152 / the trace-width calculator for continuous current.`
      : `${si(s.i, 'A', 3)} melts this conductor in under 1 µs (${si(s.dur, 's', 3)} by Onderdonk); at such speeds the current distribution and the melt dynamics are outside the model.`);
    report.status = { text: 'NO SOLUTION', tone: 'fail' };
    report.results.push({ key: 'dur', label: LABEL.dur, value: null, display: long ? '> 1 h' : '< 1 µs', primary: true, solved: true });
    return report;
  }

  const size = wire ? s.d : s.w;
  const tr = wire ? null : traceArea(s.w, s.t, s.ef);
  const area = areaOf(size);
  const cmil = area / CMIL;
  const i2t = s.i * s.i * s.dur;
  const term = tempTerm(s.ta, s.tm);
  const melt = Math.abs(s.tm - T_MELT_CU) < 0.5;

  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const reach = melt ? 'melts' : `reaches ${s.tm} °C`;
  if (s.solveFor === 'i') results.push(item('i', melt ? 'Fusing current' : `Current to reach ${s.tm} °C`, s.i, 'A', si(s.i, 'A', 4), { symbol: 'I_fuse', primary: true, solved: true, note: `${reach} in ${fmtT(s.dur)}` }));
  if (s.solveFor === 'dur') results.push(item('dur', melt ? 'Time to fuse' : `Time to reach ${s.tm} °C`, s.dur, 's', fmtT(s.dur), { symbol: 't', primary: true, solved: true, note: `at ${si(s.i, 'A', 3)} from ${s.ta} °C` }));
  if (s.solveFor === 'w') results.push(item('w', 'Trace width', s.w, 'm', si(s.w, 'm', 4), { symbol: 'W', primary: true, solved: true, note: `${(s.w / MIL).toPrecision(4)} mil · ${reach} at ${si(s.i, 'A', 3)} in ${fmtT(s.dur)}` }));
  if (s.solveFor === 'd') results.push(item('d', 'Wire diameter', s.d, 'm', si(s.d, 'm', 4), { symbol: 'd', primary: true, solved: true, note: `${(s.d / MIL).toPrecision(4)} mil · ${reach} at ${si(s.i, 'A', 3)} in ${fmtT(s.dur)}` }));
  results.push(
    item('cmil', 'Cross-section', cmil, 'cmil', `${cmil.toPrecision(4)} cmil`, { symbol: 'A', primary: true, note: `${(area * 1e6).toPrecision(3)} mm² · ${(area / MIL / MIL).toPrecision(3)} mil²` }),
    item('i2t', 'Melting integral', i2t, 'A²s', `${i2t >= 1e-3 && i2t < 1e6 ? +i2t.toPrecision(4) : i2t.toExponential(3)} A²s`, { symbol: 'I²t', primary: true, note: 'compare with a fuse’s I²t' }),
    item('j', 'Current density', s.i / area, 'A/m²', `${(s.i / area / 1e6).toPrecision(4)} A/mm²`, { symbol: 'J', primary: true }),
  );
  const gX = 'Cross-section';
  if (tr) {
    results.push(
      item('area', 'Area', area, 'm²', `${(area * 1e6).toPrecision(4)} mm²`, { group: gX }),
      item('wMean', 'Mean width', tr.mean, 'm', si(tr.mean, 'm', 4), { group: gX, note: s.ef > 0 ? (tr.top > 0 ? `top ${si(tr.top, 'm', 3)}, etch ${s.ef}:1` : `triangular ridge, etch ${s.ef}:1`) : 'vertical walls' }),
      item('tOut', 'Thickness', s.t, 'm', `${si(s.t, 'm', 3)} (${(s.t / OZ).toFixed(2)} oz)`, { group: gX }),
    );
  } else results.push(item('area', 'Area', area, 'm²', `${(area * 1e6).toPrecision(4)} mm²`, { group: gX }), item('dMil', 'Diameter', s.d, 'm', `${si(s.d, 'm', 4)} (${(s.d / MIL).toPrecision(4)} mil)`, { group: gX }));
  const gO = 'Onderdonk';
  const ref = (t: number) => onderdonkI(area, t, s.ta, s.tm);
  results.push(
    item('term', 'Temperature term', term, '', term.toFixed(4), { group: gO, note: `log₁₀[(T_m − T_a)/(234 + T_a) + 1]` }),
    item('i10ms', 'Fusing current, 10 ms', ref(0.01), 'A', si(ref(0.01), 'A', 4), { group: gO }),
    item('i100ms', 'Fusing current, 100 ms', ref(0.1), 'A', si(ref(0.1), 'A', 4), { group: gO }),
    item('i1s', 'Fusing current, 1 s', ref(1), 'A', si(ref(1), 'A', 4), { group: gO, note: 'about the limit of the model on a board' }),
  );
  if (wire) {
    const ip = preeceI(s.d);
    results.push(item('preece', 'Preece steady fusing current', ip, 'A', si(ip, 'A', 4), { group: 'Preece (bare wire in air)', note: 'I = 10244·d^1.5 (d in inches), no time dependence' }));
  }
  report.results = results;

  // ── validity
  if (s.dur > T_VALID) warnings.push(`t = ${fmtT(s.dur)} is longer than the ~1–1.5 s for which Onderdonk’s no-cooling assumption holds on a board (Brooks & Adam). Heat flows into the laminate and the planes, so the real conductor survives longer or needs more current: the figure is a lower bound for fusing, not a rating. For continuous current use IPC-2152.`);
  if (wire && s.dur > T_VALID) notes.push('For long overloads of a bare wire in still air Preece’s steady fusing current is the better guide (it ignores time).');
  if (!melt) notes.push(`T_m = ${s.tm} °C: the results are for reaching that temperature, not for melting the copper (1083 °C).`);
  if (!wire && s.tm > 300) notes.push('Long before the copper melts the laminate under it chars and delaminates (FR-4 from ≈ 250–300 °C), so a board is damaged at well below the fusing current.');
  if (tr && tr.top <= 0) warnings.push(`With a ${s.ef}:1 etch this ${si(s.t, 'm', 3)} thick trace is narrower than ${si(2 * cut, 'm', 3)}: its sides meet in a ridge ${si(tr.height, 'm', 3)} high and it never reaches full thickness. Use thinner copper for so narrow a trace.`);
  if (!wire && s.w < 0.1e-3) warnings.push(`W = ${si(s.w, 'm', 3)} is below typical fabrication minimums (≈ 0.1 mm / 4 mil).`);
  if (s.ta > 150) warnings.push(`Starting at ${s.ta} °C is above the rating of standard laminates; check the board, not just the copper.`);

  report.summary = `${wire ? `Round wire Ø ${si(s.d, 'm', 3)}` : `Trace ${si(s.w, 'm', 3)} × ${si(s.t, 'm', 3)}`} · ${si(s.i, 'A', 3)} for ${fmtT(s.dur)} · ${s.ta} → ${s.tm} °C · Onderdonk`;
  notes.push(
    'Onderdonk: I = A·√(log₁₀[(T_m − T_a)/(234 + T_a) + 1]/(33·t)), A in circular mils (Stauffacher, GE Review 1928). Adiabatic: all I²R heat stays in the copper.',
    'T_m is where the copper starts to melt; actually opening also needs the latent heat of fusion, so the true fusing time is a little longer.',
  );
  report.details = { area, cmil, term, i2t, ...(tr ?? {}) };
  report.graphs = graphs(s, area);
  return report;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: FuseState, area: number): GraphSpec[] {
  const wire = s.conductor === 'wire';
  const tLo = Math.min(1e-4, s.dur / 10);
  const tHi = Math.max(100, s.dur * 10);
  const tsIn = logspace(tLo, Math.min(T_VALID, tHi), 80);
  const tsOut = logspace(T_VALID, tHi, 60);
  const iOf = (t: number) => onderdonkI(area, t, s.ta, s.tm);
  const ip = wire ? preeceI(s.d) : 0;
  const it: GraphSpec = {
    id: 'i-vs-t',
    title: 'Fusing current vs time',
    subtitle: wire ? `Ø ${si(s.d, 'm', 3)} copper wire, from ${s.ta} °C` : `${si(s.w, 'm', 3)} × ${si(s.t, 'm', 3)} trace, from ${s.ta} °C`,
    x: { label: 'Pulse duration', unit: 's', log: true },
    y: [{ id: 'i', label: 'Fusing current', unit: 'A', log: true }],
    series: [
      { label: 'Onderdonk', x: tsIn, y: tsIn.map(iOf), axis: 'i', width: 2.2 },
      { label: 'Onderdonk, past ~1.5 s', x: tsOut, y: tsOut.map(iOf), axis: 'i', color: '#9a8f7a', width: 1.6, dash: [5, 4] },
    ],
    hlines: wire ? [{ value: ip, label: `Preece ${si(ip, 'A', 3)}`, axis: 'i', color: '#c47b17', dash: [6, 4] }] : [],
    vlines: [{ value: s.dur, label: `t = ${fmtT(s.dur)}` }],
    markers: [{ x: s.dur, y: s.i, axis: 'i', label: si(s.i, 'A', 3) }],
  };
  const size = wire ? s.d : s.w;
  const lo = wire ? LIM.d[0] : LIM.w[0];
  const xs = logspace(Math.max(lo, size / 10), Math.min(0.1, size * 10), 120);
  const aOf = (x: number) => (wire ? (Math.PI / 4) * x * x : traceArea(x, s.t, s.ef).area);
  const TIMES = [0.001, 0.01, 0.1, 1];
  const COLORS = ['#6b5b95', '#4f8a8b', '#1f4e5f', '#c47b17'];
  const iw: GraphSpec = {
    id: 'i-vs-size',
    title: wire ? 'Fusing current vs diameter' : 'Fusing current vs width',
    subtitle: wire ? 'Onderdonk, copper wire' : `Onderdonk, ${si(s.t, 'm', 3)} copper`,
    x: { label: wire ? 'Wire diameter' : 'Trace width', unit: 'm', log: true },
    y: [{ id: 'i', label: 'Fusing current', unit: 'A', log: true }],
    series: [
      ...TIMES.map((t, k) => ({ label: `t = ${fmtT(t)}`, x: xs, y: xs.map((x) => onderdonkI(aOf(x), t, s.ta, s.tm)), axis: 'i', color: COLORS[k], width: 1.4 })),
      ...(TIMES.some((t) => Math.abs(t - s.dur) < 1e-9 * t) ? [] : [{ label: `t = ${fmtT(s.dur)} (yours)`, x: xs, y: xs.map((x) => onderdonkI(aOf(x), s.dur, s.ta, s.tm)), axis: 'i', color: '#9a8f7a', width: 2.2, dash: [5, 3] }]),
      ...(wire ? [{ label: 'Preece (steady)', x: xs, y: xs.map(preeceI), axis: 'i', color: '#8b1e1e', width: 1.4, dash: [2, 3] }] : []),
    ],
    vlines: [{ value: size, label: `${wire ? 'd' : 'W'} = ${si(size, 'm', 3)}` }],
    markers: [{ x: size, y: s.i, axis: 'i', label: si(s.i, 'A', 3) }],
    legend: 'below',
  };
  return [it, iw];
}

export const def: CalcDef<FuseState> = {
  id: 'pcb/fusing-current',
  version: '0.1.0',
  method:
    'Onderdonk’s adiabatic fusing equation I = A·√(log₁₀[(T_m − T_a)/(234 + T_a) + 1]/(33·t)) with A in circular mils (Stauffacher, GE Review 1928; Brooks, PCD&F 2023; same relation as IEEE Std 80 eq. 37), applied to the trace’s mean cross-section (etch factor) or a round wire; current, time or size solved on that equation; Preece’s I = 10244·d^1.5 (1884) shown for bare wires. Validity on boards ≈ 1–1.5 s (Brooks & Adam).',
  fields,
  defaults,
  solve: {
    default: 'i',
    analysis: 'i',
    options: [
      { key: 'i', label: 'Fusing current for a pulse of duration t' },
      { key: 'dur', label: 'Time to fuse at current I' },
      { key: 'w', label: 'Trace width that fuses at I in time t' },
      { key: 'd', label: 'Wire diameter that fuses at I in time t' },
    ],
  },
  compute,
  sync: (s) => {
    for (const [k, uk, table, on] of [['w', 'wUnit', U_LEN_PCB, s.solveFor === 'w'], ['d', 'dUnit', U_LEN_PCB, s.solveFor === 'd']] as const) if (on) fitImperial(s, k, uk, table);
    if (s.conductor === 'wire' && s.solveFor === 'w') s.solveFor = 'd';
    if (s.conductor !== 'wire' && s.solveFor === 'd') s.solveFor = 'w';
    const n = WEIGHTS[s.cuWeight];
    if (n && Math.abs(n * OZ - s.t) > 1e-9 * s.t) s.cuWeight = 'Custom';
    if (s.cuWeight === 'Custom') for (const [k, v] of Object.entries(WEIGHTS)) if (Math.abs(v * OZ - s.t) <= 1e-9 * s.t) s.cuWeight = k;
    const d = awgOf(s.gauge);
    if (d && Math.abs(d - s.d) > 1e-9 * d) s.gauge = 'Custom';
    if (s.gauge === 'Custom') for (const g of GAUGES) if (awgOf(g) && Math.abs(awgOf(g)! - s.d) <= 1e-9 * s.d) s.gauge = g;
  },
  examples: [
    { id: 'default', label: '0.25 mm, 1 oz trace: current that melts it in 100 ms', state: defaults() },
    { id: 'short-1s', label: 'Time to fuse: 20 A short into a 0.5 mm, 1 oz trace', state: { solveFor: 'dur', conductor: 'trace', w: 0.5e-3, wUnit: 'mm', cuWeight: '1 oz (35 µm)', t: OZ, tUnit: 'oz', ef: 0, i: 20, dur: 0.1, durUnit: 'ms', ta: 25, tm: T_MELT_CU } },
    { id: 'fuse-link', label: 'Fusible link: width that opens at 10 A in 10 ms (½ oz)', state: { solveFor: 'w', conductor: 'trace', w: 0.1e-3, wUnit: 'mm', cuWeight: '½ oz (17 µm)', t: 0.5 * OZ, tUnit: 'oz', ef: 0, i: 10, dur: 0.01, durUnit: 'ms', ta: 25, tm: T_MELT_CU } },
    { id: 'thick-etch', label: '3 oz, 0.3 mm trace with a 1:1 etch: 1 ms surge', state: { solveFor: 'i', conductor: 'trace', w: 0.3e-3, wUnit: 'mm', cuWeight: '3 oz (105 µm)', t: 3 * OZ, tUnit: 'oz', ef: 1, dur: 0.001, durUnit: 'ms', ta: 40, tm: T_MELT_CU } },
    { id: 'laminate-limit', label: 'Time for 15 A to bring a 0.5 mm trace to 300 °C (laminate damage)', state: { solveFor: 'dur', conductor: 'trace', w: 0.5e-3, wUnit: 'mm', cuWeight: '1 oz (35 µm)', t: OZ, tUnit: 'oz', ef: 0, i: 15, dur: 0.1, durUnit: 'ms', ta: 25, tm: 300 } },
    { id: 'awg30-wire', label: 'AWG 30 jumper wire: 1 s fusing current vs Preece', state: { solveFor: 'i', conductor: 'wire', gauge: 'AWG 30', d: awgDiameterM(30), dUnit: 'mm', dur: 1, durUnit: 's', ta: 25, tm: T_MELT_CU } },
  ],
};
