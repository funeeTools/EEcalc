/** Power/ground plane pair impedance — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_LEN_PCB, U_OHM, U_THICK, withDefault } from '@/core/unitsets';
import { absC, C0, MU0, modeF, modesBelow, type PlaneIn, planeC, planeZ, targetZ } from './model';

export type PlaneSolve = 'c' | 'd';

export interface PlaneState {
  solveFor: PlaneSolve;
  a: number;
  aUnit: string;
  b: number;
  bUnit: string;
  d: number;
  dUnit: string;
  er: number;
  tanD: number;
  c: number;
  cUnit: string;
  px: number;
  pxUnit: string;
  py: number;
  pyUnit: string;
  wp: number;
  wpUnit: string;
  v: number;
  ripple: number;
  dI: number;
  zt: number;
  ztUnit: string;
  f: number;
  fUnit: string;
  fMax: number;
  fMaxUnit: string;
  tCu: number;
  tCuUnit: string;
}

export const defaults = (): PlaneState => ({
  solveFor: 'c',
  a: 100e-3,
  aUnit: 'mm',
  b: 80e-3,
  bUnit: 'mm',
  d: 100e-6,
  dUnit: 'µm',
  er: 4.3,
  tanD: 0.02,
  c: 3.045e-9,
  cUnit: 'nF',
  px: 25e-3,
  pxUnit: 'mm',
  py: 20e-3,
  pyUnit: 'mm',
  wp: 0.5e-3,
  wpUnit: 'mm',
  v: 3.3,
  ripple: 5,
  dI: 1,
  zt: 0.165,
  ztUnit: 'mΩ',
  f: 100e6,
  fUnit: 'MHz',
  fMax: 3e9,
  fMaxUnit: 'GHz',
  tCu: 34.79e-6,
  tCuUnit: 'oz',
});

export const LIM = { a: [1e-3, 1], d: [1e-6, 5e-3], c: [1e-15, 1e-3] } as const;
const U_DIEL = withDefault(U_LEN_PCB, 'µm');
const U_F = { ...U_FREQ };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Plane pair',
    fields: [
      { kind: 'number', key: 'a', symbol: 'a', label: 'Plane length', units: U_LEN_PCB, unitKey: 'aUnit', min: LIM.a[0], max: LIM.a[1], help: 'Overlap of the power and ground planes along x.' },
      { kind: 'number', key: 'b', symbol: 'b', label: 'Plane width', units: U_LEN_PCB, unitKey: 'bUnit', min: LIM.a[0], max: LIM.a[1], help: 'Overlap of the planes along y.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Dielectric thickness', units: U_DIEL, unitKey: 'dUnit', min: LIM.d[0], max: LIM.d[1], solvable: true, help: 'Laminate between the two planes. Thinner is better on every count: more capacitance, less spreading inductance. 50–100 µm is common; embedded-capacitance laminates go down to 8–25 µm.' },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Relative permittivity', min: 1, max: 100, help: 'FR-4 ≈ 4.0–4.6; ceramic-filled embedded-capacitance films ≈ 10–30.' },
      { kind: 'number', key: 'tanD', symbol: 'tan δ', label: 'Loss tangent', min: 0, max: 0.5, help: 'FR-4 ≈ 0.015–0.02. Dielectric loss damps the cavity resonances.' },
      {
        kind: 'number', key: 'c', symbol: 'C', label: 'Plane capacitance', units: U_CAP, unitKey: 'cUnit', min: LIM.c[0], max: LIM.c[1], solvable: true,
        solvedWhen: (_s, r) => r.solveFor !== 'd', onSolve: (_s, r) => (r.solveFor = 'c'), onUnsolve: (_s, r) => (r.solveFor = 'd'),
        help: 'Calculated from the geometry (green). Click ◎ to make it a target and solve the dielectric thickness for it.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Port (where the load connects)',
    fields: [
      { kind: 'number', key: 'px', symbol: 'x_p', label: 'Port x from corner', units: U_LEN_PCB, unitKey: 'pxUnit', min: 0, max: 1, help: 'Position of the IC’s power via (or the measurement port) along the length, from the left edge.' },
      { kind: 'number', key: 'py', symbol: 'y_p', label: 'Port y from corner', units: U_LEN_PCB, unitKey: 'pyUnit', min: 0, max: 1 },
      { kind: 'number', key: 'wp', symbol: 'w_p', label: 'Port size', units: U_LEN_PCB, unitKey: 'wpUnit', min: 50e-6, max: 20e-3, help: 'Side of the square contact area (a via pad, or a cluster of vias). It sets the spreading inductance: smaller ports see more.' },
    ],
  },
  {
    kind: 'section',
    title: 'Target impedance',
    fields: [
      { kind: 'number', key: 'v', symbol: 'V', label: 'Supply voltage', unit: 'V', min: 0.1, max: 1000 },
      { kind: 'number', key: 'ripple', symbol: 'r', label: 'Allowed ripple', suffix: '%', min: 0.01, max: 50, help: 'Allowed supply noise as a percentage of V (often 2–5 %).' },
      { kind: 'number', key: 'dI', symbol: 'ΔI', label: 'Transient current', unit: 'A', min: 1e-6, max: 1e4, help: 'Largest current step the load draws (often half its maximum current).' },
      { kind: 'number', key: 'zt', symbol: 'Z_t', label: 'Target impedance', units: U_OHM, unitKey: 'ztUnit', output: true, min: 0, max: 1e12, help: 'Z_t = V · ripple / ΔI (calculated).' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency of interest', units: U_F, unitKey: 'fUnit', min: 1e5, max: 5e10, help: 'The page reports |Z| here and marks it on the graph.' },
      { kind: 'number', key: 'fMax', symbol: 'f_max', label: 'Graph up to', units: U_F, unitKey: 'fMaxUnit', min: 1e7, max: 5e10, help: 'Upper end of the impedance graph and of the mode table.' },
    ],
  },
  {
    kind: 'section',
    title: 'Copper',
    collapsed: true,
    fields: [{ kind: 'number', key: 'tCu', symbol: 'T', label: 'Plane copper thickness', units: withDefault(U_THICK, 'oz'), unitKey: 'tCuUnit', min: 1e-6, max: 1e-3, help: 'Sets the plane resistance at low frequency; above a few MHz the skin depth takes over.' }],
  },
];

const fmtZ = (z: number) => si(z, 'Ω', 4);

export function planeInputs(s: PlaneState): PlaneIn {
  return { a: s.a, b: s.b, d: s.d, er: s.er, tanD: s.tanD, px: s.px, py: s.py, wp: s.wp, tCu: s.tCu };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

export function compute(st: PlaneState): CalcReport {
  for (const k of ['a', 'b', 'd', 'er', 'tanD', 'c', 'px', 'py', 'wp', 'v', 'ripple', 'dI', 'f', 'fMax', 'tCu'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (st.solveFor !== 'c' && st.solveFor !== 'd') throw new Error('solveFor must be "c" or "d".');
  const s: PlaneState = { ...st };
  if (!(s.a > 0 && s.b > 0)) throw new Error('Plane length and width must be > 0.');
  if (!(s.er >= 1)) throw new Error('εr must be ≥ 1.');
  if (s.tanD < 0) throw new Error('Loss tangent must be ≥ 0.');
  if (!(s.wp > 0) || !(s.tCu > 0)) throw new Error('Port size and copper thickness must be > 0.');
  // A port off the plane (e.g. after the plane was typed smaller) is moved onto it, with a warning, rather than
  // stopping the page: the least surprising valid state. Likewise a port larger than half the plane.
  const moved: string[] = [];
  if (s.wp > Math.min(s.a, s.b) / 2) {
    moved.push(`The port (${si(s.wp, 'm', 3)}) is larger than half the plane; it is taken as ${si(Math.min(s.a, s.b) / 2, 'm', 3)}.`);
    s.wp = Math.min(s.a, s.b) / 2;
  }
  for (const [k, len, name] of [['px', s.a, 'x'], ['py', s.b, 'y']] as const) {
    const v = Math.min(Math.max(s[k], 0), len);
    if (v !== s[k]) moved.push(`The port ${name} (${si(s[k], 'm', 3)}) is off the plane (0 … ${si(len, 'm', 3)}); it is taken at the edge, ${name} = ${si(v, 'm', 3)}. Move it onto the plane.`);
    s[k] = v;
  }
  if (!(s.v > 0 && s.ripple > 0 && s.dI > 0)) throw new Error('V, ripple and ΔI must be > 0.');
  if (!(s.f > 0 && s.fMax > 0)) throw new Error('Frequencies must be > 0.');

  const warnings: string[] = [...moved];
  const notes: string[] = [];
  const tables: TableSpec[] = [];
  const report: CalcReport = { calc: 'pcb/power-plane-impedance', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables, warnings, notes };

  // ── solve: dielectric thickness for a target capacitance (forward C(d), inverted)
  if (s.solveFor === 'd') {
    if (!(s.c > 0)) throw new Error('The target capacitance must be > 0.');
    const g = (d: number) => planeC(s.a, s.b, d, s.er);
    const [lo, hi] = LIM.d;
    const stop = (why: string, display: string) => {
      warnings.push(why);
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      report.results.push({ key: 'd', label: 'Dielectric thickness', value: null, display, primary: true, solved: true });
      return report;
    };
    if (g(lo) < s.c) return stop(`${si(s.c, 'F', 3)} needs a dielectric thinner than 1 µm on ${si(s.a, 'm', 3)} × ${si(s.b, 'm', 3)} with εr = ${s.er} (1 µm gives ${si(g(lo), 'F', 3)}). Use a larger area, a high-εr embedded-capacitance film, or discrete capacitors.`, '< 1 µm');
    if (g(hi) > s.c) return stop(`Even a 5 mm dielectric gives ${si(g(hi), 'F', 3)}, more than ${si(s.c, 'F', 3)}; any practical thickness meets this target.`, '> 5 mm');
    const r = invert(g, s.c, { lo, hi, log: true, samples: 60 });
    if (!r.ok) return stop('No thickness in range gives that capacitance.', '—');
    s.d = r.roots[0];
  }
  const p = planeInputs(s);
  s.c = planeC(s.a, s.b, s.d, s.er);
  s.zt = targetZ(s.v, s.ripple, s.dI);
  const lSq = MU0 * s.d;
  const lEdge = lSq * (s.a / s.b);
  const f10 = modeF(1, 0, s.a, s.b, s.er);
  const f01 = modeF(0, 1, s.a, s.b, s.er);
  const f1 = Math.min(f10, f01);
  const fC = 1 / (2 * Math.PI * s.c * s.zt);

  // ── impedance at the port across the band
  // Above f_N the plane has more than ~2000 cavity modes: the sum gets slow and the idealised cavity (no
  // radiation, perfect rectangle) tells little there, so the graph stops at f_N.
  const fN = (C0 / (2 * Math.sqrt(s.er))) * Math.sqrt((4 * 2000) / (Math.PI * s.a * s.b));
  const fLo = Math.min(1e6, s.f / 2, s.fMax / 100);
  const fHi = Math.min(Math.max(s.fMax, s.f * 1.2), fN);
  const fOk = s.f <= fN;
  const modes = modesBelow(p, fHi, 400);
  // a log grid plus every resonance frequency, so the plotted peaks are not cut short between grid points
  const fs = [...new Set([...logspace(fLo, fHi, 240), ...modes.slice(0, 200).map((m) => m.f)])].sort((x, y) => x - y);
  const fsAll = [...fs, ...(fOk ? [s.f] : []), ...modes.slice(0, 12).map((m) => m.f)];
  const zz = planeZ(p, fsAll);
  const zAbs = zz.z.map(absC);
  const iM = fs.length + (fOk ? 1 : 0); // index of the first mode frequency
  const zf = fOk ? zz.z[fs.length] : null;
  const zfAbs = fOk ? zAbs[fs.length] : NaN;
  // where the plane pair alone stays at or below the target
  const curve = fs.map((f, i) => ({ f, z: zAbs[i] }));
  // the grid plus the mode frequencies themselves, so a sharp resonance peak is not missed between points
  const above = [...curve, ...modes.slice(0, 12).map((m, i) => ({ f: m.f, z: zAbs[iM + i] }))].filter((q) => q.f >= fC && q.f <= s.fMax);
  const peak = above.reduce((m, q) => (q.z > m.z ? q : m), { f: NaN, z: 0 });

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  if (s.solveFor === 'd') results.push(item('d', 'Dielectric thickness', s.d, 'm', si(s.d, 'm', 4), { symbol: 'd', primary: true, solved: true, note: `${(s.d / 25.4e-6).toPrecision(3)} mil for C = ${si(s.c, 'F', 3)}` }));
  results.push(
    item('c', 'Plane capacitance', s.c, 'F', si(s.c, 'F', 4), { symbol: 'C', primary: true, solved: s.solveFor === 'c', note: `${si((s.c / (s.a * s.b)) * 1e-4, 'F', 3)}/cm²` }),
    item('f1', 'First cavity resonance', f1, 'Hz', si(f1, 'Hz', 4), { symbol: f10 <= f01 ? 'f₁₀' : 'f₀₁', primary: true, note: `half a wavelength across ${si(f10 <= f01 ? s.a : s.b, 'm', 3)}` }),
    zf
      ? item('zf', `|Z| at ${si(s.f, 'Hz', 3)}`, zfAbs, 'Ω', fmtZ(zfAbs), { symbol: '|Z|', primary: true, tone: zfAbs > s.zt ? 'warn' : '', note: `${zfAbs > s.zt ? 'above' : 'within'} Z_t = ${fmtZ(s.zt)} · ${zf.im >= 0 ? 'inductive' : 'capacitive'}` })
      : { key: 'zf', label: `|Z| at ${si(s.f, 'Hz', 3)}`, value: null, display: '—', symbol: '|Z|', primary: true, note: `above ${si(fN, 'Hz', 3)}, see warning` },
    item('lsp', 'Spreading inductance', zz.lsp, 'H', si(zz.lsp, 'H', 4), { symbol: 'L_sp', primary: true, note: `port ${si(s.wp, 'm', 3)} at (${si(s.px, 'm', 3)}, ${si(s.py, 'm', 3)})` }),
    item('zt', 'Target impedance', s.zt, 'Ω', fmtZ(s.zt), { symbol: 'Z_t', solved: true, group: 'Target', note: `${s.v} V × ${s.ripple} % ÷ ${si(s.dI, 'A', 3)}` }),
  );
  const gT = 'Target';
  results.push(
    item('fC', 'Plane alone meets Z_t above', fC, 'Hz', si(fC, 'Hz', 4), { group: gT, note: '1/(2πf C) = Z_t' }),
    item('peak', 'Worst |Z| above that, to f_max', peak.z, 'Ω', Number.isFinite(peak.f) ? `${fmtZ(peak.z)} at ${si(peak.f, 'Hz', 3)}` : `— (f_C above ${si(s.fMax, 'Hz', 3)})`, { group: gT, tone: peak.z > s.zt ? 'fail' : Number.isFinite(peak.f) ? 'pass' : '', note: peak.z > s.zt ? `${(peak.z / s.zt).toFixed(1)}× the target: resonances need decoupling or damping` : '' }),
  );
  const gP = 'Plane pair';
  results.push(
    item('cArea', 'Capacitance per area', s.c / (s.a * s.b), 'F/m²', `${si((s.c / (s.a * s.b)) * 1e-4, 'F', 4)}/cm²`, { group: gP }),
    item('lSq', 'Sheet inductance', lSq, 'H', `${si(lSq, 'H', 4)}/□`, { symbol: 'μ₀d', group: gP }),
    item('lEdge', 'Edge-to-edge inductance', lEdge, 'H', si(lEdge, 'H', 4), { group: gP, note: `μ₀d·a/b, current across the length; X_L = ${fmtZ(2 * Math.PI * s.f * lEdge)} at f` }),
    item('f10', 'TM₁₀ resonance', f10, 'Hz', si(f10, 'Hz', 4), { group: gP }),
    item('f01', 'TM₀₁ resonance', f01, 'Hz', si(f01, 'Hz', 4), { group: gP }),
    item('dOut', 'Dielectric thickness', s.d, 'm', `${si(s.d, 'm', 4)} (${(s.d / 25.4e-6).toPrecision(3)} mil)`, { group: gP }),
  );
  report.results = results;

  // ── mode table
  const rows = modes.slice(0, 12).filter((m) => m.f <= s.fMax);
  if (rows.length) {
    const zAt = rows.map((_, i) => zAbs[iM + i]);
    tables.push({
      id: 'modes',
      title: 'Cavity resonances up to f_max',
      columns: [
        { key: 'mode', label: 'Mode', align: 'left' },
        { key: 'f', label: 'f_mn', unit: 'Hz' },
        { key: 'coupling', label: 'Port coupling' },
        { key: 'z', label: '|Z| at f_mn', unit: 'Ω' },
      ],
      rows: rows.map((m, i) => ({ mode: `TM${m.m},${m.n}`, f: m.f, coupling: m.coupling, z: zAt[i] })),
      display: rows.map((m, i) => ({ mode: `TM ${m.m},${m.n}`, f: si(m.f, 'Hz', 4), coupling: m.coupling < 1e-6 ? 'node (0 %)' : `${(m.coupling * 100).toFixed(0)} %`, z: fmtZ(zAt[i]) })),
      rowTones: zAt.map((z) => (z > s.zt ? 'fail' : z > 0.8 * s.zt ? 'warn' : 'pass')),
      note: `Each mode’s peak at this port, judged against Z_t = ${fmtZ(s.zt)} (red above it, yellow within 20 %). Port coupling is cos²(mπx/a)·cos²(nπy/b): 100 % where the mode’s voltage peaks (corners, and edges for the modes along them), 0 % on a nodal line, where the port does not see that mode.`,
    });
  }

  // ── validity
  const lamMin = C0 / (fHi * Math.sqrt(s.er));
  if (s.d > Math.min(s.a, s.b) / 10) warnings.push(`The dielectric (${si(s.d, 'm', 3)}) is not thin compared with the planes (${si(Math.min(s.a, s.b), 'm', 3)}): fringing fields add capacitance and the cavity model loses accuracy. Use a field solver.`);
  if (s.d > lamMin / 20) warnings.push(`At ${si(fHi, 'Hz', 3)} the dielectric is ${(s.d / lamMin).toFixed(2)} wavelengths thick; the cavity model needs d ≪ λ (below about λ/20).`);
  const edge = Math.min(s.px, s.a - s.px, s.py, s.b - s.py);
  if (!moved.length && edge < s.wp / 2) warnings.push(`The port overhangs the plane edge (it is ${si(edge, 'm', 3)} from it, half its size is ${si(s.wp / 2, 'm', 3)}). Move it inward.`);
  if (!fOk) warnings.push(`At ${si(s.f, 'Hz', 3)} this plane has more than 2000 cavity modes (above ${si(fN, 'Hz', 3)}); the ideal-cavity model says little there and |Z| is not computed. Lower f, or use a field solver.`);
  else if (fHi < Math.max(s.fMax, s.f * 1.2)) notes.push(`The graph stops at ${si(fN, 'Hz', 3)}, where this plane reaches 2000 cavity modes.`);
  if (zz.modesExact >= 5000) notes.push(`Very many modes fall below f_max; the exact sum was limited to ${zz.modesExact} modes and the rest taken in a series expansion, which smooths the highest resonances.`);
  if (s.f > s.fMax) notes.push('The frequency of interest is above f_max: the graph is extended to include it.');

  report.summary = `${si(s.a, 'm', 3)} × ${si(s.b, 'm', 3)} planes · d = ${si(s.d, 'm', 3)} · εr ${s.er} · C = ${si(s.c, 'F', 3)} · Z_t = ${fmtZ(s.zt)}`;
  notes.push(
    'C = ε₀εᵣab/d with no fringing. Resonances and |Z| from the cavity model (Lei, Techentin & Gilbert 1999): open edges, uniform field through the thickness, dielectric and plate losses included, no radiation loss.',
    'The impedance is that of the bare plane pair at the port. Decoupling capacitors, the VRM and vias are not included (see the decoupling calculator).',
    'tan δ and εᵣ are taken constant with frequency; FR-4’s εᵣ falls by a few percent per decade, which shifts the higher resonances.',
  );
  report.details = { lsp: zz.lsp, f10, f01, fC, fN, modesExact: zz.modesExact, modesTail: zz.modesTail, zf };

  // ── graphs
  const lines = curve.map((q) => 1 / (2 * Math.PI * q.f * s.c));
  const zg: GraphSpec = {
    id: 'z-vs-f',
    title: 'Plane-pair impedance at the port',
    subtitle: `port (${si(s.px, 'm', 3)}, ${si(s.py, 'm', 3)}), ${si(s.wp, 'm', 3)}`,
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'z', label: '|Z|', unit: 'Ω', log: true }],
    series: [
      { label: '|Z| plane pair', x: fs, y: zAbs.slice(0, fs.length), axis: 'z', width: 2.2 },
      { label: 'Ideal C', x: fs, y: lines, axis: 'z', color: '#9a8f7a', width: 1.2, dash: [4, 3] },
    ],
    hlines: [{ value: s.zt, label: `Z_t = ${fmtZ(s.zt)}`, axis: 'z', color: '#8b1e1e', dash: [6, 4] }],
    vlines: [{ value: f1, label: `f₁ = ${si(f1, 'Hz', 3)}`, color: '#9a8f7a', dash: [2, 3] }, ...(fOk ? [{ value: s.f, label: `f = ${si(s.f, 'Hz', 3)}` }] : [])],
    markers: fOk ? [{ x: s.f, y: zfAbs, axis: 'z', label: fmtZ(zfAbs) }] : [],
    legend: 'below',
  };
  const fs2 = fs;
  // coarser cut-offs (≈ 0.05 % on L_sp) are plenty for this comparison
  const at = (px: number, py: number) => planeZ({ ...p, px, py }, fs2, 1.5, 1500, 2).z.map(absC);
  const inset = Math.max(s.wp / 2, Math.min(s.a, s.b) * 0.01);
  const pos: GraphSpec = {
    id: 'z-position',
    title: 'Effect of the port position',
    subtitle: 'Same planes, port moved',
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'z', label: '|Z|', unit: 'Ω', log: true }],
    series: [
      { label: 'Your port', x: fs2, y: zAbs.slice(0, fs.length), axis: 'z', width: 2.2 },
      { label: 'Plane centre', x: fs2, y: at(s.a / 2, s.b / 2), axis: 'z', color: '#2f7d4f', width: 1.4 },
      { label: 'Near a corner', x: fs2, y: at(inset, inset), axis: 'z', color: '#c47b17', width: 1.4, dash: [5, 3] },
    ],
    hlines: [{ value: s.zt, label: 'Z_t', axis: 'z', color: '#8b1e1e', dash: [6, 4] }],
    legend: 'below',
  };
  report.graphs = [zg, pos];
  return report;
}

export const def: CalcDef<PlaneState> = {
  id: 'pcb/power-plane-impedance',
  version: '0.1.0',
  method:
    'Parallel-plate C = ε₀εᵣab/d; sheet inductance μ₀d (Bogatin 2018; Smith & Bogatin 2017); cavity resonances f_mn = c/(2√εᵣ)·√((m/a)² + (n/b)²); port self-impedance from the cavity-model double series with dielectric and conductor loss (Lei, Techentin & Gilbert, IEEE T-MTT 1999; Swaminathan & Engin 2007), its non-resonant part giving the spreading inductance; target impedance Z_t = V·ripple/ΔI (Smith et al. 1999); dielectric thickness solved by Brent root finding on C(d).',
  fields,
  defaults,
  solve: {
    default: 'c',
    analysis: 'c',
    options: [
      { key: 'c', label: 'Capacitance, resonances and impedance of the planes' },
      { key: 'd', label: 'Dielectric thickness for a target capacitance C' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '100 × 80 mm planes on 100 µm FR-4, 3.3 V rail', state: defaults() },
    {
      id: 'embedded',
      label: 'Embedded-capacitance film: 14 µm, εr 16 (same board)',
      state: { solveFor: 'c', a: 100e-3, b: 80e-3, d: 14e-6, dUnit: 'µm', er: 16, tanD: 0.015, px: 25e-3, py: 20e-3, wp: 0.5e-3, v: 1.0, ripple: 3, dI: 2, f: 500e6, fUnit: 'MHz', fMax: 3e9 },
    },
    {
      id: 'phone',
      label: 'Phone board: 60 × 40 mm, 76 µm prepreg, 1.8 V',
      state: { solveFor: 'c', a: 60e-3, b: 40e-3, d: 76e-6, dUnit: 'µm', er: 4.2, tanD: 0.018, px: 18e-3, py: 12e-3, wp: 0.4e-3, v: 1.8, ripple: 3, dI: 0.5, f: 1e9, fUnit: 'GHz', fMax: 6e9 },
    },
    {
      id: 'centre-port',
      label: 'Port at the centre: odd modes vanish',
      state: { solveFor: 'c', a: 100e-3, b: 80e-3, d: 100e-6, dUnit: 'µm', er: 4.3, tanD: 0.02, px: 50e-3, py: 40e-3, wp: 0.5e-3, v: 3.3, ripple: 5, dI: 1, f: 100e6, fUnit: 'MHz', fMax: 3e9 },
    },
    {
      id: 'thick-core',
      label: '4-layer board: planes 1.0 mm apart in the core',
      state: { solveFor: 'c', a: 160e-3, b: 100e-3, d: 1.0e-3, dUnit: 'mm', er: 4.5, tanD: 0.02, px: 40e-3, py: 30e-3, wp: 0.6e-3, v: 3.3, ripple: 5, dI: 1, f: 100e6, fUnit: 'MHz', fMax: 2e9 },
    },
    {
      id: 'target-c',
      label: 'Dielectric thickness for 10 nF on 100 × 80 mm (εr 4.3)',
      state: { solveFor: 'd', c: 10e-9, cUnit: 'nF', a: 100e-3, b: 80e-3, er: 4.3, tanD: 0.02, px: 25e-3, py: 20e-3, wp: 0.5e-3, f: 100e6, fUnit: 'MHz', fMax: 3e9 },
    },
  ],
};
