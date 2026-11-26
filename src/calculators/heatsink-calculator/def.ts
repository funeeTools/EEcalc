/** Heatsink calculator — thermal stack θJC + θCS + θSA. Calculator definition, DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSeries, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { type StackInputs, stack } from './model';

/**
 * Case-to-sink interface resistance θCS, °C/W. Package-specific measured values from onsemi AN1040
 * (Roehr), Table 1 (TO-3 6 in-lb, TO-220 8 in-lb, TO-126 6 in-lb; mica 2–3 mil) and Table 2 (silicone pads
 * on TO-3, 3-mil flatness: 0.37–0.79 °C/W). The soldered value follows TI SLVA118A §5.
 */
export const INTERFACES: Record<string, number | null> = {
  Custom: null,
  'TO-220 · dry metal (1.2)': 1.2,
  'TO-220 · grease (1.0)': 1.0,
  'TO-220 · mica + grease (1.6)': 1.6,
  'TO-220 · mica, dry (3.4)': 3.4,
  'TO-3 · dry metal (0.5)': 0.5,
  'TO-3 · grease (0.1)': 0.1,
  'TO-3 · mica + grease (0.36)': 0.36,
  'TO-3 · silicone pad (0.6)': 0.6,
  'TO-126 · grease (1.3)': 1.3,
  'TO-126 · mica + grease (3.3)': 3.3,
  'Soldered tab / pad (≈ 0)': 0,
};

export interface Layer {
  name: string;
  theta: number;
}

export type HsSolve = 'thetaSA' | 'p' | 'tj' | 'ta';

export interface HeatsinkState {
  solveFor: HsSolve;
  p: number;
  n: number;
  tj: number;
  tjMax: number;
  ta: number;
  thetaJC: number;
  tim: string;
  thetaCS: number;
  layers: Layer[];
  thetaSA: number;
  thetaJA0: number;
}

export const defaults = (): HeatsinkState => ({
  solveFor: 'thetaSA',
  p: 10,
  n: 1,
  tj: 125,
  tjMax: 150,
  ta: 40,
  thetaJC: 1.0,
  tim: 'TO-220 · mica + grease (1.6)',
  thetaCS: 1.6,
  layers: [],
  thetaSA: 5,
  thetaJA0: 62,
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'p', symbol: 'P', label: 'Power per device', unit: 'W', solvable: true, min: 1e-6, max: 1e5, help: 'Average power dissipated in each device. Use the hot-junction value (e.g. MOSFET R_DS(on) at 100 °C).' },
      { kind: 'number', key: 'n', symbol: 'n', label: 'Devices on heatsink', integer: true, min: 1, max: 100, help: 'Identical devices sharing one heatsink, each dissipating P through its own case and interface. The heatsink carries n·P.' },
      { kind: 'number', key: 'ta', symbol: 'T_A', label: 'Ambient temperature', suffix: '°C', solvable: true, min: -273, max: 500, help: 'Air temperature entering the heatsink (inside the enclosure).' },
      { kind: 'number', key: 'tj', symbol: 'T_J', label: 'Junction temperature', suffix: '°C', solvable: true, min: -273, max: 1e4, help: 'Calculated in analysis; when solving for θSA, P or Ta, the junction temperature to design to — usually derated 10–25 °C below the rating.' },
      { kind: 'number', key: 'tjMax', symbol: 'T_J,max', label: 'Max junction rating', suffix: '°C', min: -273, max: 1000 },
    ],
  },
  {
    kind: 'section',
    title: 'Thermal stack',
    note: 'Junction → case → interface → heatsink → air, all in series.',
    fields: [
      { kind: 'number', key: 'thetaJC', symbol: 'θ_JC', label: 'Junction–case', suffix: '°C/W', min: 0, max: 1000, help: 'From the device datasheet (use the maximum, not the typical, value).' },
      {
        kind: 'select',
        key: 'tim',
        label: 'Interface preset',
        options: Object.keys(INTERFACES),
        apply: (v, s) => {
          const t = INTERFACES[v];
          if (t != null) s.thetaCS = t;
        },
        help: 'Case-to-sink resistance measured by onsemi (AN1040, Table 1–2) at the recommended screw torque. Real values depend on flatness, torque and TIM thickness; dry joints vary widely.',
      },
      { kind: 'number', key: 'thetaCS', symbol: 'θ_CS', label: 'Case–sink interface', suffix: '°C/W', min: 0, max: 1000 },
      { kind: 'number', key: 'thetaSA', symbol: 'θ_SA', label: 'Heatsink–ambient', suffix: '°C/W', solvable: true, min: 1e-3, max: 1e4, help: 'From the heatsink datasheet at your airflow and power. Natural-convection heatsinks improve somewhat at higher temperature rise; vendors often give a curve.' },
      { kind: 'number', key: 'thetaJA0', symbol: 'θ_JA', label: 'Free-air θJA (no sink)', suffix: '°C/W', min: 0, max: 5000, zeroHint: 'not set', help: 'Optional: the device’s junction-to-ambient resistance with no heatsink, to check whether a heatsink is needed at all. 0 = skip.' },
    ],
  },
  {
    kind: 'section',
    title: 'Extra layers',
    collapsed: true,
    note: 'Additional series layers between case and heatsink, e.g. a copper spreader or a second insulator.',
    fields: [
      {
        kind: 'list',
        key: 'layers',
        addLabel: 'Add layer',
        minItems: 0,
        maxItems: 6,
        variant: 'sub',
        itemTitle: (l, i) => `${i + 1} · ${l.name || 'Layer'}`,
        create: (prev) => (prev ? { ...prev } : { name: 'Spreader', theta: 0.2 }),
        fields: [
          { kind: 'text', key: 'name', label: 'Name', maxLength: 32 },
          { kind: 'number', key: 'theta', symbol: 'θ', label: 'Thermal resistance', suffix: '°C/W', min: 0, max: 1000 },
        ],
      },
    ],
  },
];

const toInputs = (s: HeatsinkState): StackInputs => ({ p: s.p, ta: s.ta, thetaJC: s.thetaJC, thetaCS: s.thetaCS, extra: s.layers.map((l) => l.theta), thetaSA: s.thetaSA, n: s.n });

/** Solve ranges equal the input fields' limits, so a solved value is always one the form accepts. */
const SOLVE: Record<Exclude<HsSolve, 'tj'>, { lo: number; hi: number; log: boolean; label: string; fmt: (x: number) => string }> = {
  thetaSA: { lo: 1e-3, hi: 1e4, log: true, label: 'Required heatsink θSA', fmt: (x) => `${x} °C/W` },
  p: { lo: 1e-6, hi: 1e5, log: true, label: 'Maximum power', fmt: (x) => si(x, 'W', 3) },
  ta: { lo: -273, hi: 500, log: false, label: 'Maximum ambient', fmt: (x) => `${x} °C` },
};

const degC = (t: number, d = 1) => `${t.toFixed(d)} °C`;
const cw = (x: number) => `${x.toPrecision(3)} °C/W`;

export function compute(st: HeatsinkState): CalcReport {
  for (const k of ['p', 'n', 'tj', 'tjMax', 'ta', 'thetaJC', 'thetaCS', 'thetaSA', 'thetaJA0'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (!Array.isArray(st.layers)) throw new Error('layers must be a list.');
  for (const [i, l] of st.layers.entries()) if (typeof l.theta !== 'number' || !Number.isFinite(l.theta) || l.theta < 0) throw new Error(`Layer ${i + 1}: θ must be ≥ 0.`);
  const s: HeatsinkState = { ...st, n: Math.max(1, Math.round(st.n)) };
  if (s.solveFor !== 'p' && !(s.p > 0)) throw new Error('Power must be > 0.');
  if (s.thetaJC < 0 || s.thetaCS < 0 || s.thetaJA0 < 0) throw new Error('Thermal resistances must be ≥ 0.');
  if (s.solveFor !== 'thetaSA' && !(s.thetaSA > 0)) throw new Error('θSA must be > 0.');
  if ((s.solveFor === 'thetaSA' || s.solveFor === 'p') && !(s.tj > s.ta)) throw new Error(`The target Tj (${degC(s.tj)}) must be above the ambient (${degC(s.ta)}).`);

  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'thermal/heatsink-calculator', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };
  const names = s.layers.map((l) => l.name);

  if (s.solveFor !== 'tj') {
    const key = s.solveFor;
    const o = SOLVE[key];
    const g = (x: number) => stack(toInputs({ ...s, [key]: x }), names).tj;
    // No answer in the input range: ok stays true with a status badge and "—" in the solved box, so the page
    // keeps its warnings. The other boxes then hold the parts of a design that does not exist, so the harness
    // round-trip flags from such a state (e.g. "solveFor tj: 256 but the state has 125") are expected.
    const stop = (why: string, display: string, status: CalcReport['status']) => {
      report.warnings.push(why);
      report.status = status;
      report.results.push({ key, label: o.label, value: null, display, primary: true, solved: true });
      return report;
    };
    // Tj rises with θSA, P and Ta: check both ends of the input range before root finding.
    const gLo = g(o.lo);
    const gHi = g(o.hi);
    if (gLo > s.tj) {
      if (key === 'thetaSA') {
        const t0 = stack(toInputs({ ...s, thetaSA: 0 }), names);
        if (t0.tj > s.tj) {
          // still draw the graphs, for the best case θSA → 0 (shows the stack alone overshooting the target)
          const best = { ...s, thetaSA: o.lo };
          report.graphs = graphs(best, stack(toInputs(best), names).tj);
          return stop(`Even an ideal heatsink (θSA = 0) leaves Tj = ${degC(t0.tj)}: θJC + θCS${s.layers.length ? ' + layers' : ''} = ${cw(t0.thetaDev)} at ${si(s.p, 'W', 3)} already exceeds the ${degC(s.tj)} target. Lower the power, improve the interface (grease, no insulator) or choose a device with lower θJC.`, '—', { text: 'NO SOLUTION', tone: 'fail' });
        }
        return stop(`The target needs θSA below ${o.fmt(o.lo)}, beyond any practical heatsink (liquid cold plates reach roughly 0.01–0.05 °C/W). Lower the power or improve the device path.`, `< ${o.fmt(o.lo)}`, { text: 'NO SOLUTION', tone: 'fail' });
      }
      return stop(`No ${key === 'p' ? 'power' : 'ambient'} in the input range reaches Tj = ${degC(s.tj)} (at ${o.fmt(o.lo)} Tj is already ${degC(gLo)}).`, '—', { text: 'NO SOLUTION', tone: 'fail' });
    }
    if (gHi < s.tj) {
      if (key === 'thetaSA') {
        const free = s.thetaJA0 > 0 ? ` With no heatsink at all (free-air θJA ${cw(s.thetaJA0)}) Tj would be ${degC(s.ta + s.p * s.thetaJA0)}.` : '';
        return stop(`No heatsink needed for the target: even θSA = ${o.fmt(o.hi)} keeps Tj at ${degC(gHi)}, below ${degC(s.tj)}.${free}`, `> ${o.fmt(o.hi)}`, { text: 'NO HEATSINK NEEDED', tone: 'pass' });
      }
      return stop(`Not limiting within the input range: even at ${o.fmt(o.hi)} Tj is only ${degC(gHi)}, below the ${degC(s.tj)} target.`, `> ${o.fmt(o.hi)}`, { text: 'NOT LIMITING', tone: 'pass' });
    }
    const r = invert(g, s.tj, { lo: o.lo, hi: o.hi, log: o.log, samples: 60 });
    if (!r.ok) return stop(`No ${o.label.toLowerCase()} reaches Tj = ${degC(s.tj)}.`, '—', { text: 'NO SOLUTION', tone: 'fail' });
    s[key] = r.roots[0];
  }

  const o = stack(toInputs(s), names);
  if (s.solveFor === 'tj') s.tj = o.tj;
  const headroom = s.tjMax - o.tj;
  const overTemp = o.tj > s.tjMax + 1e-9;
  const analysis = s.solveFor === 'tj';
  // limits against the rating
  const pMax = (s.tjMax - s.ta) / o.thetaJA;
  const thetaSAreq = ((s.tjMax - s.ta) / s.p - o.thetaDev) / s.n;
  const taMax = s.tjMax - s.p * o.thetaJA;
  const tjNoSink = s.thetaJA0 > 0 ? s.ta + s.p * s.thetaJA0 : NaN;

  if (overTemp) warnings.push(`Tj = ${degC(o.tj)} exceeds the ${degC(s.tjMax)} rating. ${thetaSAreq > 0 ? `A heatsink of θSA ≤ ${cw(thetaSAreq)} would be needed` : 'No heatsink is good enough with this interface — reduce power or θJC + θCS'}.`);
  else if (analysis && headroom < 10) warnings.push(`Only ${degC(headroom)} margin to Tj,max; heatsink ratings and interface resistance easily vary by that much. Aim for 10–25 °C.`);
  if (!analysis && s.tj > s.tjMax) warnings.push(`The target Tj (${degC(s.tj)}) is above the ${degC(s.tjMax)} rating.`);
  if (s.solveFor === 'thetaSA' && s.thetaSA < 0.3) warnings.push(`θSA = ${cw(s.thetaSA)} is beyond typical natural-convection extrusions; it needs forced air, a large extrusion, liquid cooling or a heat pipe.`);
  if (o.thetaDev > 0 && (s.p * (s.thetaCS + s.layers.reduce((a, l) => a + l.theta, 0))) > 0.4 * (o.tj - s.ta) && o.tj > s.ta)
    notes.push('The interface and extra layers take more than 40 % of the temperature rise: a better TIM or removing the insulator (isolate the heatsink instead) gains more than a bigger heatsink.');
  if (s.thetaJA0 > 0 && s.solveFor !== 'p') {
    if (s.ta + s.p * s.thetaJA0 <= Math.min(s.tj, s.tjMax)) notes.push(`Without a heatsink (θJA = ${cw(s.thetaJA0)}) Tj would be ${degC(tjNoSink)} — a heatsink may not be needed.`);
  }
  if (s.thetaJA0 > 0 && o.thetaJA > s.thetaJA0) warnings.push(`The heatsink stack (${cw(o.thetaJA)}) is worse than the free-air θJA (${cw(s.thetaJA0)}); check the θSA value.`);
  if (s.n > 1) notes.push(`${s.n} devices share the heatsink: it carries ${si(s.n * s.p, 'W', 3)} and every device sees the same heatsink temperature. Devices that dissipate different powers need a per-device calculation.`);

  if (overTemp) report.status = { text: 'TOO HOT', tone: 'fail' };
  else if (analysis) report.status = headroom < 10 ? { text: 'MARGINAL', tone: 'warn' } : { text: 'PASS', tone: 'pass' };

  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const solved = s.solveFor;
  if (solved === 'thetaSA') results.push(item('thetaSA', 'Required heatsink θSA', s.thetaSA, '°C/W', cw(s.thetaSA), { symbol: 'θ_SA', solved: true, primary: true, note: `choose a heatsink at or below this for Tj = ${degC(s.tj, 0)}` }));
  if (solved === 'p') results.push(item('p', 'Maximum power per device', s.p, 'W', si(s.p, 'W', 4), { symbol: 'P', solved: true, primary: true, note: `for Tj = ${degC(s.tj, 0)}` }));
  if (solved === 'ta') results.push(item('ta', 'Maximum ambient', s.ta, '°C', degC(s.ta), { symbol: 'T_A', solved: true, primary: true, note: `for Tj = ${degC(s.tj, 0)}` }));
  results.push(
    item('tj', 'Junction temperature', o.tj, '°C', degC(o.tj), { symbol: 'T_J', solved: solved === 'tj', primary: true, tone: overTemp ? 'fail' : analysis && headroom < 10 ? 'warn' : '', note: analysis ? `rise ${degC(o.tj - s.ta)} over ambient` : 'target' }),
    item('ts', 'Heatsink temperature', o.ts, '°C', degC(o.ts), { symbol: 'T_S', primary: true, note: o.ts > 70 ? 'hot to the touch (> 70 °C)' : `n·P = ${si(s.n * s.p, 'W', 3)}` }),
    item('thetaJA', 'Total junction–ambient', o.thetaJA, '°C/W', cw(o.thetaJA), { symbol: 'θ_JA', primary: true, note: s.n > 1 ? `incl. ${s.n}× shared θSA` : 'θJC + θCS + θSA' }),
    item('headroom', 'Margin to Tj,max', headroom, '°C', degC(headroom), { symbol: 'ΔT', primary: analysis, tone: overTemp ? 'fail' : !analysis ? '' : headroom < 10 ? 'warn' : 'pass' }),
  );
  const gT = 'Temperatures';
  results.push(
    item('tc', 'Case temperature', o.tc, '°C', degC(o.tc), { symbol: 'T_C', group: gT }),
    item('dTjc', 'Rise junction → case', s.p * s.thetaJC, '°C', degC(s.p * s.thetaJC), { group: gT }),
    item('dTcs', 'Rise across interface + layers', o.tc - o.ts, '°C', degC(o.tc - o.ts), { group: gT }),
    item('dTsa', 'Rise heatsink → air', o.ts - s.ta, '°C', degC(o.ts - s.ta), { group: gT }),
  );
  if (s.thetaJA0 > 0) results.push(item('tjNoSink', 'Tj without heatsink', tjNoSink, '°C', degC(tjNoSink), { group: gT, tone: tjNoSink > s.tjMax ? 'fail' : '', note: `free-air θJA ${cw(s.thetaJA0)}` }));
  const gL = `Limits at Tj,max = ${degC(s.tjMax, 0)}`;
  results.push(
    item('thetaSAreq', 'Max θSA', thetaSAreq, '°C/W', thetaSAreq > 0 ? cw(thetaSAreq) : 'none (stack too hot)', { group: gL, tone: thetaSAreq <= 0 ? 'fail' : '', note: 'SLVA118 eq. 10' }),
    item('pMax', 'Max power per device', pMax, 'W', pMax > 0 ? si(pMax, 'W', 3) : '—', { group: gL }),
    item('taMax', 'Max ambient', taMax, '°C', degC(taMax), { group: gL }),
  );
  report.results = results;
  report.tables = [stackTable(o, s)];
  report.summary = `${si(s.p, 'W', 3)}${s.n > 1 ? ` × ${s.n}` : ''} · θJC ${cw(s.thetaJC)} + θCS ${cw(s.thetaCS)}${s.layers.length ? ` + ${s.layers.length} layer${s.layers.length > 1 ? 's' : ''}` : ''} + θSA ${cw(s.thetaSA)} · Ta ${degC(s.ta, 0)}`;
  notes.push(
    'Steady state, one-dimensional series path; heat leaving through the leads and the board is neglected (conservative for TO-220/TO-247 on a heatsink).',
    'θSA of real heatsinks depends on airflow, orientation, temperature rise and how close the device is to the heatsink’s centre; treat datasheet values as ±20 %.',
    'For pulsed power use the device’s transient thermal impedance Z_θJC(t); this page uses the average power.',
  );
  report.details = { ...o, pMax, thetaSAreq, taMax, tjNoSink: Number.isFinite(tjNoSink) ? tjNoSink : null };
  report.graphs = graphs(s, o.tj);
  return report;
}

function stackTable(o: ReturnType<typeof stack>, s: HeatsinkState): TableSpec {
  const rise = o.tj - s.ta;
  const rows = [...o.nodes].reverse();
  const share = (dT: number) => (rise > 0 ? (dT / rise) * 100 : 0);
  return {
    id: 'stack',
    title: 'Thermal stack (junction → ambient)',
    columns: [
      { key: 'node', label: 'Node', align: 'left' },
      { key: 't', label: 'Temperature', unit: '°C' },
      { key: 'theta', label: 'θ below node', unit: '°C/W' },
      { key: 'dT', label: 'ΔT', unit: '°C' },
      { key: 'share', label: 'Share of rise', unit: '%' },
    ],
    rows: rows.map((r) => ({ node: r.name, t: r.t, theta: r.theta, dT: r.dT, share: share(r.dT) })),
    display: rows.map((r) => ({ node: r.name, t: degC(r.t), theta: r.name === 'Ambient' ? '' : cw(r.theta), dT: r.name === 'Ambient' ? '' : degC(r.dT), share: r.name === 'Ambient' ? '' : `${share(r.dT).toFixed(1)} %` })),
    note: s.n > 1 ? `The heatsink ΔT includes all ${s.n} devices (n·P·θSA).` : 'Each θ is the resistance between that node and the one below it.',
  };
}

function noSink(ps: number[], s: HeatsinkState): GraphSeries {
  const tCap = Math.max(s.tjMax, s.tj) + 60;
  const pCap = (tCap - s.ta) / s.thetaJA0;
  const x = ps.filter((p) => p <= pCap);
  if (x.length < ps.length && pCap > 0) x.push(pCap);
  return { label: 'Junction, no heatsink', x, y: x.map((p) => s.ta + p * s.thetaJA0), axis: 't', color: '#9a8f7a', width: 1.2, dash: [5, 3] };
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: HeatsinkState, tj: number): GraphSpec[] {
  const base = toInputs(s);
  const names = s.layers.map((l) => l.name);
  const at = (patch: Partial<StackInputs>) => stack({ ...base, ...patch }, names);
  const pMax = (s.tjMax - s.ta) / at({}).thetaJA;
  const pTop = Math.max(s.p * 1.5, pMax > 0 ? pMax * 1.2 : 0);
  const ps = linspace(0, pTop, 101);
  const limits = [{ value: s.tjMax, label: `Tj,max ${s.tjMax.toFixed(0)} °C`, axis: 't', color: '#8b1e1e', dash: [6, 4] }];
  if (s.solveFor !== 'tj') limits.push({ value: s.tj, label: `target ${s.tj.toFixed(0)} °C`, axis: 't', color: '#c47b17', dash: [3, 3] });
  const tVsP: GraphSpec = {
    id: 'tj-vs-power',
    title: 'Temperatures vs power',
    x: { label: 'Power per device', unit: 'W' },
    y: [{ id: 't', label: 'Temperature', unit: '°C' }],
    series: [
      { label: 'Junction', x: ps, y: ps.map((p) => at({ p }).tj), axis: 't', width: 2.2 },
      { label: 'Case', x: ps, y: ps.map((p) => at({ p }).tc), axis: 't', color: '#4f8a8b', width: 1.4 },
      { label: 'Heatsink', x: ps, y: ps.map((p) => at({ p }).ts), axis: 't', color: '#c47b17', width: 1.4 },
      // free-air curve cut where it leaves the interesting range, so it does not squash the plot
      ...(s.thetaJA0 > 0 ? [noSink(ps, s)] : []),
    ],
    hlines: limits,
    vlines: [{ value: s.p, label: `P = ${si(s.p, 'W', 3)}` }, ...(pMax > 0 && pMax < pTop ? [{ value: pMax, label: `P_max ${si(pMax, 'W', 3)}`, color: '#8b1e1e', dash: [3, 3] }] : [])],
    markers: [{ x: s.p, y: tj, axis: 't', label: `${tj.toFixed(1)} °C` }],
  };

  // θSA span: from a very good heatsink up to where Tj passes Tj,max by ~60 °C
  const thAtHot = ((Math.max(s.tjMax, s.tj) + 60 - s.ta) / s.p - at({}).thetaDev) / s.n;
  const thLo = Math.min(0.05, s.thetaSA / 3);
  const thHi = Math.max(s.thetaSA * 3, Number.isFinite(thAtHot) && thAtHot > thLo * 10 ? thAtHot : thLo * 1000);
  const ths = logspace(thLo, thHi, 121);
  const tVsTheta: GraphSpec = {
    id: 'tj-vs-thetasa',
    title: 'Tj vs heatsink θSA',
    x: { label: 'Heatsink thermal resistance θSA', unit: '°C/W', log: true },
    y: [{ id: 't', label: 'Junction temperature', unit: '°C' }],
    series: [{ label: 'Tj', x: ths, y: ths.map((th) => at({ thetaSA: th }).tj), axis: 't', width: 2.2 }],
    hlines: limits,
    vlines: [{ value: s.thetaSA, label: `θSA ${cw(s.thetaSA)}` }],
    markers: [{ x: s.thetaSA, y: tj, axis: 't', label: `${tj.toFixed(1)} °C` }],
    subtitle: `Floor at θSA → 0: Tj = ${degC(at({ thetaSA: 0 }).tj)} (device + interface alone)`,
  };

  const tas = linspace(Math.min(-20, s.ta - 10), s.tjMax, 101);
  const derating: GraphSpec = {
    id: 'pmax-vs-ta',
    title: 'Max power vs ambient',
    x: { label: 'Ambient temperature', unit: '°C' },
    y: [{ id: 'p', label: 'Max power per device', unit: 'W', includeZero: true }],
    series: [
      { label: `P_max at Tj,max ${s.tjMax.toFixed(0)} °C`, x: tas, y: tas.map((t) => Math.max((s.tjMax - t) / at({}).thetaJA, 0)), axis: 'p', width: 2.2 },
      ...(s.solveFor !== 'tj' ? [{ label: `P_max at target ${s.tj.toFixed(0)} °C`, x: tas, y: tas.map((t) => Math.max((s.tj - t) / at({}).thetaJA, 0)), axis: 'p', color: '#c47b17', width: 1.4, dash: [5, 3] }] : []),
    ],
    hlines: [{ value: s.p, label: `P = ${si(s.p, 'W', 3)}`, axis: 'p', color: '#9a8f7a', dash: [3, 3] }],
    vlines: [{ value: s.ta, label: `Ta ${s.ta.toFixed(0)} °C` }],
  };
  return [tVsP, tVsTheta, derating];
}

export const def: CalcDef<HeatsinkState> = {
  id: 'thermal/heatsink-calculator',
  version: '0.1.0',
  method:
    'Series thermal stack Tj = Ta + P·(θJC + θCS + Σθlayers) + n·P·θSA (TI SLVA118A eq. 8–10; onsemi AN1040; θJA per JESD51-2A, θJC per JESD51-14). Interface presets from AN1040 Tables 1–2. θSA, P or Ta for a target Tj are found by root finding on the same forward model.',
  fields,
  defaults,
  solve: {
    default: 'thetaSA',
    analysis: 'tj',
    options: [
      { key: 'thetaSA', label: 'Required heatsink θSA for a target Tj' },
      { key: 'tj', label: 'Junction temperature (analysis)' },
      { key: 'p', label: 'Maximum power for a target Tj' },
      { key: 'ta', label: 'Maximum ambient for a target Tj' },
    ],
  },
  compute,
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const m = { ...d, ...(raw as object) } as HeatsinkState;
    if (!Array.isArray(m.layers)) m.layers = [];
    if (!['thetaSA', 'p', 'tj', 'ta'].includes(m.solveFor)) m.solveFor = d.solveFor;
    return m;
  },
  sync: (s) => {
    const t = INTERFACES[s.tim];
    if (t != null && Math.abs(t - s.thetaCS) > 1e-9) s.tim = 'Custom';
  },
  examples: [
    { id: 'default', label: 'TO-220, 10 W, mica + grease, 40 °C: required θSA for Tj 125 °C', state: defaults() },
    {
      id: 'to220-8w',
      label: 'TO-220 MOSFET, 8 W at 50 °C, greased, Tj 150 °C rated: θSA',
      state: { solveFor: 'thetaSA', p: 8, n: 1, tj: 130, tjMax: 150, ta: 50, thetaJC: 1.15, tim: 'TO-220 · grease (1.0)', thetaCS: 1.0, layers: [], thetaSA: 5, thetaJA0: 62 },
    },
    {
      id: 'to3-analysis',
      label: 'TO-3 regulator, 25 W on a 2 °C/W sink with mica: analyse',
      state: { solveFor: 'tj', p: 25, n: 1, tj: 125, tjMax: 150, ta: 45, thetaJC: 1.5, tim: 'TO-3 · mica + grease (0.36)', thetaCS: 0.36, layers: [], thetaSA: 2, thetaJA0: 35 },
    },
    {
      id: 'four-fets',
      label: 'Four TO-220 FETs at 6 W each on one 1 °C/W heatsink',
      state: { solveFor: 'tj', p: 6, n: 4, tj: 125, tjMax: 175, ta: 40, thetaJC: 0.8, tim: 'TO-220 · mica + grease (1.6)', thetaCS: 1.6, layers: [], thetaSA: 1, thetaJA0: 62 },
    },
    {
      id: 'max-power-dry-mica',
      label: 'Max power: TO-220 on dry mica + 0.5 mm spreader, 3 °C/W sink',
      state: { solveFor: 'p', p: 10, n: 1, tj: 125, tjMax: 150, ta: 55, thetaJC: 1.0, tim: 'TO-220 · mica, dry (3.4)', thetaCS: 3.4, layers: [{ name: 'Al spreader', theta: 0.15 }], thetaSA: 3, thetaJA0: 62 },
    },
    {
      id: 'no-solution',
      label: 'Too much power for the device: 60 W through θJC + mica',
      state: { solveFor: 'thetaSA', p: 60, n: 1, tj: 125, tjMax: 150, ta: 40, thetaJC: 1.0, tim: 'TO-220 · mica + grease (1.6)', thetaCS: 1.6, layers: [], thetaSA: 1, thetaJA0: 62 },
    },
  ],
};
