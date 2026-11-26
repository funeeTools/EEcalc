/** PCB stack-up builder — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSeries, type GraphSpec, type ResultItem, type TableSpec, emptyReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { type Diel, type LineResult, type Role, type StackLayer, isPlane, isSignal, lineAt, symmetry, thickness } from './model';

export const ID = 'pcb/stackup-builder';

export interface LayerItem extends StackLayer {
  tUnit: string;
  hUnit: string;
}

export interface StackState {
  solveFor: 'total' | 'h';
  /** which dielectric (index of the copper layer above it) is solved for the target thickness */
  solveIdx: number;
  preset: string;
  /** computed board thickness over copper (an output row in the form) */
  total: number;
  totalUnit: string;
  target: number;
  targetUnit: string;
  tol: number;
  w: number;
  wUnit: string;
  z0t: number;
  mask: boolean;
  maskT: number;
  maskTUnit: string;
  maskEr: number;
  layers: LayerItem[];
}

const UM = 1e-6;
const MM = 1e-3;
const L = (role: Role, tUm: number, diel: Diel, hMm: number, er: number): LayerItem => ({ role, t: tUm * UM, tUnit: 'µm', diel, h: hMm * MM, hUnit: 'mm', er });

/**
 * Typical fabricator constructions (1 oz copper everywhere, 7628/2116-class prepreg εr 4.2, FR-4 core εr 4.4).
 * Dielectric thicknesses are pressed values that bring the board to the nominal thickness over copper.
 */
/**
 * The last layer has no dielectric under it, but it keeps a hidden one (a copy of the first) so that
 * duplicating or adding below it gives a valid layer instead of a zero-thickness dielectric.
 */
const finish = (layers: LayerItem[]): LayerItem[] => {
  const last = layers[layers.length - 1];
  if (!(last.h > 0)) Object.assign(last, { diel: layers[0].diel, h: layers[0].h, er: layers[0].er });
  return layers;
};

export const PRESETS: Record<string, { target: number; layers: LayerItem[] } | null> = {
  Custom: null,
  // two layers: routing with a ground pour on top, a ground plane on the bottom (balanced copper)
  '2-layer 1.6 mm': { target: 1.6, layers: finish([L('mixed', 35, 'core', 1.53, 4.4), L('gnd', 35, 'core', 0, 4.4)]) },
  '4-layer 1.6 mm': { target: 1.6, layers: finish([L('signal', 35, 'prepreg', 0.2, 4.2), L('gnd', 35, 'core', 1.065, 4.4), L('pwr', 35, 'prepreg', 0.2, 4.2), L('signal', 35, 'prepreg', 0, 4.2)]) },
  '6-layer 1.6 mm': {
    target: 1.6,
    layers: finish([L('signal', 35, 'prepreg', 0.1, 4.2), L('gnd', 35, 'core', 0.36, 4.4), L('signal', 35, 'prepreg', 0.47, 4.2), L('signal', 35, 'core', 0.36, 4.4), L('pwr', 35, 'prepreg', 0.1, 4.2), L('signal', 35, 'prepreg', 0, 4.2)]),
  },
  '8-layer 1.6 mm': {
    target: 1.6,
    layers: finish([L('signal', 35, 'prepreg', 0.1, 4.2), L('gnd', 35, 'core', 0.2, 4.4), L('signal', 35, 'prepreg', 0.2, 4.2), L('pwr', 35, 'core', 0.32, 4.4), L('gnd', 35, 'prepreg', 0.2, 4.2), L('signal', 35, 'core', 0.2, 4.4), L('gnd', 35, 'prepreg', 0.1, 4.2), L('signal', 35, 'prepreg', 0, 4.2)]),
  },
  '10-layer 1.6 mm': {
    target: 1.6,
    layers: finish([
      L('signal', 35, 'prepreg', 0.09, 4.2), L('gnd', 35, 'core', 0.15, 4.4), L('signal', 35, 'prepreg', 0.15, 4.2), L('signal', 35, 'core', 0.15, 4.4), L('gnd', 35, 'prepreg', 0.17, 4.2),
      L('pwr', 35, 'core', 0.15, 4.4), L('signal', 35, 'prepreg', 0.15, 4.2), L('signal', 35, 'core', 0.15, 4.4), L('gnd', 35, 'prepreg', 0.09, 4.2), L('signal', 35, 'prepreg', 0, 4.2),
    ]),
  },
  '12-layer 2.0 mm': {
    target: 2.0,
    layers: finish([
      L('signal', 35, 'prepreg', 0.1, 4.2), L('gnd', 35, 'core', 0.15, 4.4), L('signal', 35, 'prepreg', 0.15, 4.2), L('gnd', 35, 'core', 0.15, 4.4), L('signal', 35, 'prepreg', 0.15, 4.2), L('pwr', 35, 'core', 0.18, 4.4),
      L('gnd', 35, 'prepreg', 0.15, 4.2), L('signal', 35, 'core', 0.15, 4.4), L('gnd', 35, 'prepreg', 0.15, 4.2), L('signal', 35, 'core', 0.15, 4.4), L('gnd', 35, 'prepreg', 0.1, 4.2), L('signal', 35, 'prepreg', 0, 4.2),
    ]),
  },
};

export const defaults = (): StackState => ({
  solveFor: 'total',
  solveIdx: 1,
  preset: '4-layer 1.6 mm',
  total: 1.605e-3,
  totalUnit: 'mm',
  target: 1.6e-3,
  targetUnit: 'mm',
  tol: 10,
  w: 0.35e-3,
  wUnit: 'mm',
  z0t: 50,
  mask: true,
  maskT: 20e-6,
  maskTUnit: 'µm',
  maskEr: 3.5,
  layers: structuredClone(PRESETS['4-layer 1.6 mm']!.layers),
});

export const ROLE_NAME: Record<Role, string> = { signal: 'Signal', gnd: 'GND plane', pwr: 'Power plane', mixed: 'Signal + pour' };
const isLast = (item: any, root: any) => root.layers?.indexOf(item) === root.layers?.length - 1;
const isSolvedH = (item: any, root: any) => root.solveFor === 'h' && root.layers?.indexOf(item) === root.solveIdx;

const layerFields: FieldSpec[] = [
  { kind: 'select', key: 'role', label: 'Copper use', options: (Object.keys(ROLE_NAME) as Role[]).map((r) => ({ value: r, label: ROLE_NAME[r] })), help: 'Planes (GND or power) are the references for the signal layers next to them. “Signal + pour” is a routing layer with copper fill; it is not used as a reference.' },
  { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 1e-6, max: 0.5e-3, help: 'Finished copper: 1 oz/ft² ≈ 35 µm, ½ oz ≈ 18 µm. Outer layers are usually plated up from ½ oz foil to about 35–45 µm.' },
  { kind: 'select', key: 'diel', label: 'Dielectric below', options: [{ value: 'prepreg', label: 'Prepreg' }, { value: 'core', label: 'Core' }], visible: (s, root) => !isLast(s, root), help: 'Core: cured laminate with copper on both sides. Prepreg: the uncured glass-and-resin sheets that bond cores and foils together when the board is pressed.' },
  {
    kind: 'number', key: 'h', symbol: 'H', label: 'Dielectric thickness', units: U_LEN_PCB, unitKey: 'hUnit', min: 10e-6, max: 10e-3, visible: (s, root) => !isLast(s, root),
    solvable: true, solvedWhen: isSolvedH,
    onSolve: (s, root) => { root.solveFor = 'h'; root.solveIdx = root.layers.indexOf(s); },
    onUnsolve: (_s, root) => { root.solveFor = 'total'; },
    help: 'Pressed thickness between this copper layer and the next. Click ◎ to make this the dielectric that brings the board to the target thickness.',
  },
  { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Dielectric constant', min: 1, max: 20, visible: (s, root) => !isLast(s, root), help: 'At the frequency of interest. Generic FR-4: 4.2–4.6 at 1 GHz; resin-rich prepreg is lower than glass-rich core.' },
];

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Board',
    fields: [
      {
        kind: 'select',
        key: 'preset',
        label: 'Stack-up preset',
        structural: true,
        options: Object.keys(PRESETS),
        apply: (v, s) => {
          const p = PRESETS[v];
          if (!p) return;
          s.layers = structuredClone(p.layers);
          s.target = p.target * MM;
          // a new board: analyse it (the solved dielectric index belongs to the old stack)
          s.solveFor = 'total';
          s.solveIdx = 1;
        },
        help: 'Typical constructions with 1 oz copper, εr 4.2 prepreg and 4.4 core. Your fabricator’s standard stack-ups are the real reference: ask for their prepreg and core list.',
      },
      { kind: 'number', key: 'total', symbol: 'T_board', label: 'Board thickness', units: U_LEN_PCB, unitKey: 'totalUnit', output: true, min: 1e-6, max: 1, help: 'Copper plus dielectrics, over the outer copper (mask not included). Always computed from the layers.' },
      { kind: 'number', key: 'target', symbol: 'T_target', label: 'Target thickness', units: U_LEN_PCB, unitKey: 'targetUnit', min: 0.05e-3, max: 20e-3, help: 'Finished thickness over the outer copper (mask not included). Click ◎ on a dielectric thickness to make that layer fill the stack to this value.' },
      { kind: 'number', key: 'tol', symbol: '±', label: 'Thickness tolerance', suffix: '%', min: 0, max: 50, help: '±10 % is the usual fabrication tolerance for boards thicker than about 1 mm.' },
    ],
  },
  {
    kind: 'section',
    title: 'Traces',
    fields: [
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', min: 1e-6, max: 10e-3, help: 'Single-ended trace width used for the impedance of every signal layer.' },
      { kind: 'number', key: 'z0t', symbol: 'Z₀', label: 'Target impedance', unit: 'Ω', min: 5, max: 200, help: 'The results list the width each signal layer needs for this impedance.' },
    ],
  },
  {
    kind: 'section',
    title: 'Solder mask',
    fields: [
      { kind: 'toggle', key: 'mask', label: 'Solder mask', on: 'On', off: 'Off' },
      { kind: 'number', key: 'maskT', symbol: 'T_mask', label: 'Mask thickness', units: U_THICK, unitKey: 'maskTUnit', min: 1e-6, max: 0.2e-3, visible: (s) => s.mask, help: 'Over the laminate; thinner on top of traces. 15–25 µm is typical for liquid photo-imageable mask.' },
      { kind: 'number', key: 'maskEr', symbol: 'ε_mask', label: 'Mask εr', min: 1, max: 10, visible: (s) => s.mask, help: 'Used for the outer-layer (coated microstrip) impedance. Typically 3.3–4 for liquid photo-imageable mask.' },
    ],
  },
  {
    kind: 'section',
    title: 'Layers (top to bottom)',
    note: 'Each layer is a copper foil and the dielectric under it.',
    fields: [
      {
        kind: 'list',
        key: 'layers',
        addLabel: 'Add layer',
        minItems: 2,
        maxItems: 16,
        variant: 'sub',
        itemTitle: (it, i) => `L${i + 1} · ${ROLE_NAME[it.role as Role] ?? it.role}`,
        create: (prev) => (prev ? { ...structuredClone(prev), h: prev.h > 0 ? prev.h : 0.2e-3 } : L('signal', 35, 'prepreg', 0.2, 4.2)),
        fields: [{ kind: 'group', fields: layerFields }],
      },
    ],
  },
];

const fm = (m: number) => si(m, 'm', 4);
const fz = (z: number) => si(z, 'Ω', 4);
const refName = (layers: StackLayer[], idx: number) => `L${idx + 1}${layers[idx].role === 'pwr' ? ' PWR' : ' GND'}`;

type Mask = { t: number; er: number } | null;
/** The mask over the outer layers, as the impedance model takes it (null when the mask is off). */
export const maskOf = (st: Pick<StackState, 'mask' | 'maskT' | 'maskEr'>): Mask => (st.mask ? { t: st.maskT, er: st.maskEr } : null);
/** signed percentage, without a "−0.0 %" for values that round to zero */
export const pctSigned = (x: number) => {
  const v = Math.abs(x * 100);
  return v < 0.05 ? '±0.0 %' : `${x > 0 ? '+' : '−'}${v.toFixed(1)} %`;
};

/** Width for a target impedance on signal layer i (null when out of 1 µm … 10 mm). */
export function widthFor(layers: StackLayer[], i: number, z0: number, mask: Mask = null): number | null {
  const g = (w: number) => lineAt(layers, i, w, mask).z0 ?? NaN;
  const r = invert(g, z0, { lo: 1e-6, hi: 10e-3, log: true, samples: 60 });
  return r.ok ? r.roots[0] : null;
}

export function compute(st: StackState): CalcReport {
  if (!Array.isArray(st.layers) || st.layers.length < 2) throw new Error('A stack needs at least two copper layers.');
  for (const k of ['target', 'tol', 'w', 'z0t', 'maskT', 'maskEr'] as const) if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  const n = st.layers.length;
  st.layers.forEach((l, i) => {
    if (!(l.t > 0)) throw new Error(`L${i + 1}: copper thickness must be > 0.`);
    if (i < n - 1 && !(st.solveFor === 'h' && st.solveIdx === i) && !(l.h > 0)) throw new Error(`Dielectric under L${i + 1} must be thicker than 0.`);
    if (i < n - 1 && !(l.er >= 1)) throw new Error(`Dielectric under L${i + 1}: εr must be ≥ 1.`);
  });
  if (!(st.w > 0) || !(st.target > 0)) throw new Error('Trace width and target thickness must be > 0.');
  const layers: LayerItem[] = st.layers.map((l) => ({ ...l }));
  const maskT = st.mask ? st.maskT : 0;
  const solving = st.solveFor === 'h' && st.solveIdx >= 0 && st.solveIdx < n - 1;
  if (solving) {
    const others = thickness(layers, 0).total - layers[st.solveIdx].h;
    const h = st.target - others;
    if (!(h >= 10e-6)) {
      const why = h > 0
        ? `it would have to be ${fm(h)} thick, below the 10 µm minimum`
        : `the other layers already add up to ${fm(others)}`;
      return { ...emptyReport(ID), ok: false, solveFor: 'h', status: { text: 'NO SOLUTION', tone: 'fail' }, error: `The dielectric under L${st.solveIdx + 1} cannot bring the board to ${fm(st.target)}: ${why}. Raise the target or thin the other layers.` };
    }
    layers[st.solveIdx].h = h;
  }

  const th = thickness(layers, maskT);
  const dev = th.total / st.target - 1;
  const inTol = Math.abs(dev) <= st.tol / 100 + 1e-12;
  const sym = symmetry(layers);
  const bad = sym.filter((p) => p.issues.length);
  const mask = maskOf(st);
  const lines = layers.map((l, i) => (isSignal(l.role) ? lineAt(layers, i, st.w, mask) : null));
  const sigIdx = layers.map((l, i) => (isSignal(l.role) ? i : -1)).filter((i) => i >= 0);
  const widths = sigIdx.map((i) => ({ i, w: widthFor(layers, i, st.z0t, mask) }));

  const warnings: string[] = [];
  const notes: string[] = [];
  if (!inTol) warnings.push(`The stack is ${fm(th.total)}, ${Math.abs(dev * 100).toFixed(1)} % ${dev > 0 ? 'over' : 'under'} the ${fm(st.target)} target (±${st.tol} %). Adjust a core or prepreg, or click ◎ on one to fill the difference.`);
  if (bad.length) {
    const txt = bad.map((p) => (p.kind === 'copper' ? `L${p.a + 1}/L${p.b + 1}: ${p.issues.join(', ')}` : `dielectric L${p.a + 1}–L${p.a + 2} / L${p.b + 1}–L${p.b + 2}: ${p.issues.join(', ')}`)).join('; ');
    warnings.push(`The stack is not symmetric about its centre (${txt}). Unbalanced copper and dielectric bow and twist the board during lamination and reflow (IPC-6012 allows 0.75 % for SMT boards). Mirror the layer pairs.`);
  }
  for (const i of sigIdx) {
    const ln = lines[i]!;
    if (ln.structure === 'none') warnings.push(`L${i + 1} has no plane on either side: its traces have no defined return path or impedance. Put a GND plane next to it.`);
    if (ln.structure === 'embedded microstrip' && ln.cover && ln.z0Bare != null && ln.z0 != null) notes.push(`L${i + 1} has a plane on one side only: it is an embedded microstrip under ${fm(ln.cover.h)} of laminate (εr ${ln.cover.er.toFixed(2)}), ${si(ln.z0, 'Ω', 3)} against ${si(ln.z0Bare, 'Ω', 3)} bare. The cover model reads about 1.4–2.8 % high.`);
    const refs = [ln.above, ln.below].filter(Boolean) as NonNullable<LineResult['above']>[];
    if (refs.some((r) => layers[r.idx].role === 'pwr')) notes.push(`L${i + 1} is referenced to a power plane: its return current needs decoupling capacitors (or stitching) to reach ground where it changes layers.`);
    const between = refs.filter((r) => Math.abs(r.idx - i) > 1);
    if (between.length) notes.push(`L${i + 1} shares its reference with another signal layer in between (dual stripline): route the two layers orthogonally to limit crosstalk.`);
    const u = st.w / Math.min(...refs.map((r) => r.h), Infinity);
    if (refs.length && (u < 0.01 || u > 100)) warnings.push(`L${i + 1}: W/H = ${u.toPrecision(3)} is outside 0.01–100, where the impedance formulas were fitted.`);
    const tOverH = refs.length ? layers[i].t / Math.min(...refs.map((r) => r.h)) : 0;
    if (tOverH > 0.2) notes.push(`L${i + 1}: T/H = ${tOverH.toFixed(2)} — copper thick compared with its dielectric; the closed-form thickness corrections are fits for thin strips, so expect a few percent error and confirm critical lines with a field solver.`);
  }
  if (sigIdx.length === 0) warnings.push('No signal layer: mark at least one layer as Signal to see impedances.');
  const coated = sigIdx.map((i) => lines[i]!).find((l) => l.structure === 'coated microstrip');
  if (coated && coated.z0 != null && coated.z0Bare != null) notes.push(`Outer layers carry the ${fm(st.maskT)} mask (εr ${st.maskEr}) in their impedance: ${si(coated.z0, 'Ω', 3)} against ${si(coated.z0Bare, 'Ω', 3)} bare. The mask model reads about 0.5–2.1 % high (it has no mask down the trace sides).`);
  notes.push('Impedances: Hammerstad–Jensen microstrip with a cover-layer factor for mask and embedded lines (Controlled Impedance page), and the offset-stripline model of the Asymmetric Stripline page (Cohn’s broadside-coupled result, exact when centred, with Wadell’s image-method thickness terms); mixed dielectrics are reduced to one εr by the series mean. Prepreg thicknesses are pressed values: they shrink as resin fills the copper-free areas of the neighbouring layers.');

  // ── results
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  if (solving) {
    const i = st.solveIdx;
    results.push(item(`layers.${i}.h`, `Dielectric L${i + 1}–L${i + 2}`, layers[i].h, 'm', fm(layers[i].h), { symbol: 'H', solved: true, primary: true, note: `${layers[i].diel} · fills to ${fm(st.target)}` }));
  }
  results.push(item('total', 'Board thickness', th.total, 'm', fm(th.total), { symbol: 'T_board', primary: true, solved: true, tone: inTol ? '' : 'warn', note: `${pctSigned(dev)} vs ${fm(st.target)} target${st.mask ? ` · ${fm(th.withMask)} with mask` : ''}` }));
  results.push(item('symmetric', 'Symmetry', bad.length ? 'no' : 'yes', '', bad.length ? `${bad.length} unbalanced pair${bad.length > 1 ? 's' : ''}` : 'Symmetric', { primary: true, tone: bad.length ? 'warn' : '', note: `${n} copper layers · ${layers.filter((l) => isPlane(l.role)).length} planes` }));
  const firstOuter = sigIdx.find((i) => lines[i]!.structure === 'microstrip');
  const firstInner = sigIdx.find((i) => lines[i]!.structure.includes('stripline'));
  for (const i of [firstOuter, firstInner]) {
    if (i == null) continue;
    const ln = lines[i]!;
    results.push(item(`z0L${i + 1}`, `Z₀ on L${i + 1}`, ln.z0, 'Ω', ln.z0 == null ? '—' : fz(ln.z0), { symbol: `Z₀,L${i + 1}`, primary: true, note: `${ln.structure} · W = ${fm(st.w)}` }));
  }
  for (const i of sigIdx) {
    const ln = lines[i]!;
    const refs = [ln.above, ln.below].filter(Boolean).map((r) => refName(layers, r!.idx)).join(' / ') || 'none';
    if (i === firstOuter || i === firstInner) continue;
    results.push(item(`z0L${i + 1}`, `Z₀ on L${i + 1}`, ln.z0, 'Ω', ln.z0 == null ? '—' : fz(ln.z0), { group: `Impedance at W = ${fm(st.w)}`, note: `${ln.structure} · ref ${refs}` }));
  }
  for (const { i, w } of widths) results.push(item(`wL${i + 1}`, `Width for ${fz(st.z0t)} on L${i + 1}`, w, 'm', w == null ? '—' : `${fm(w)} (${(w / 25.4e-6).toPrecision(3)} mil)`, { group: `Width for Z₀ = ${fz(st.z0t)}` }));
  results.push(
    item('cuTotal', 'Copper', th.cu, 'm', fm(th.cu), { group: 'Thickness' }),
    item('dielTotal', 'Dielectrics', th.diel, 'm', fm(th.diel), { group: 'Thickness' }),
    item('withMask', 'Over solder mask', th.withMask, 'm', fm(th.withMask), { group: 'Thickness' }),
  );

  const report: CalcReport = { calc: ID, ok: true, solveFor: st.solveFor, results, graphs: [], tables: [], warnings, notes };
  report.status = { text: inTol ? (bad.length ? 'ASYMMETRIC' : 'OK') : 'THICKNESS OFF', tone: inTol && !bad.length ? 'pass' : 'warn' };
  report.summary = `${n} layers · ${fm(th.total)} (target ${fm(st.target)} ± ${st.tol} %) · ${sigIdx.length} signal, ${layers.filter((l) => isPlane(l.role)).length} plane${bad.length ? ` · ${bad.length} asymmetric pair${bad.length > 1 ? 's' : ''}` : ' · symmetric'}`;
  report.tables = [refTable(layers, lines, widths, st), symTable(layers, sym)];
  report.graphs = [graph(layers, sigIdx, st)];
  report.details = { lines: lines.map((l, i) => (l ? { layer: i + 1, ...l } : null)).filter(Boolean), thickness: th, symmetry: sym, layers };
  return report;
}

function refTable(layers: StackLayer[], lines: (LineResult | null)[], widths: { i: number; w: number | null }[], st: StackState): TableSpec {
  const rows = widths.map(({ i, w }) => {
    const ln = lines[i]!;
    return {
      layer: `L${i + 1}`,
      structure: ln.structure,
      above: ln.above ? refName(layers, ln.above.idx) : '—',
      h1: ln.above?.h ?? null,
      below: ln.below ? refName(layers, ln.below.idx) : '—',
      h2: ln.below?.h ?? null,
      er: Number.isFinite(ln.er) ? ln.er : null,
      z0: ln.z0,
      w,
    };
  });
  return {
    id: 'refs',
    title: 'Signal layers and their reference planes',
    columns: [
      { key: 'layer', label: 'Layer', align: 'left' },
      { key: 'structure', label: 'Structure', align: 'left' },
      { key: 'above', label: 'Plane above', align: 'left' },
      { key: 'h1', label: 'H above', unit: 'm' },
      { key: 'below', label: 'Plane below', align: 'left' },
      { key: 'h2', label: 'H below', unit: 'm' },
      { key: 'er', label: 'εr' },
      { key: 'z0', label: `Z₀ at ${fm(st.w)}`, unit: 'Ω' },
      { key: 'w', label: `W for ${fz(st.z0t)}`, unit: 'm' },
    ],
    rows,
    display: rows.map((r) => ({
      layer: r.layer,
      structure: r.structure,
      above: r.above,
      h1: r.h1 == null ? '—' : fm(r.h1),
      below: r.below,
      h2: r.h2 == null ? '—' : fm(r.h2),
      er: r.er == null ? '—' : r.er.toFixed(2),
      z0: r.z0 == null ? '—' : fz(r.z0),
      w: r.w == null ? '—' : fm(r.w),
    })),
    rowTones: rows.map((r) => (r.z0 == null ? 'fail' : Math.abs(r.z0 / st.z0t - 1) <= 0.1 ? 'pass' : 'warn')),
    note: `Green: Z₀ at W = ${fm(st.w)} is within ±10 % (the usual fabrication tolerance) of ${fz(st.z0t)}; yellow: outside it (use the width column); red: no reference plane. H is measured between copper faces.`,
  };
}

function symTable(layers: StackLayer[], sym: ReturnType<typeof symmetry>): TableSpec {
  const rows = sym.map((p) => ({
    pair: p.kind === 'copper' ? `L${p.a + 1} ↔ L${p.b + 1}` : `L${p.a + 1}–L${p.a + 2} ↔ L${p.b + 1}–L${p.b + 2}`,
    kind: p.kind === 'copper' ? 'Copper' : 'Dielectric',
    upper: p.kind === 'copper' ? `${si(layers[p.a].t, 'm', 3)} ${ROLE_NAME[layers[p.a].role]}` : `${layers[p.a].diel} ${si(layers[p.a].h, 'm', 3)} εr ${layers[p.a].er}`,
    lower: p.kind === 'copper' ? `${si(layers[p.b].t, 'm', 3)} ${ROLE_NAME[layers[p.b].role]}` : `${layers[p.b].diel} ${si(layers[p.b].h, 'm', 3)} εr ${layers[p.b].er}`,
    issue: p.issues.join(', ') || 'mirrored',
  }));
  return {
    id: 'symmetry',
    title: 'Symmetry about the centre',
    columns: [
      { key: 'pair', label: 'Pair', align: 'left' },
      { key: 'kind', label: 'Kind', align: 'left' },
      { key: 'upper', label: 'Upper half', align: 'left' },
      { key: 'lower', label: 'Lower half', align: 'left' },
      { key: 'issue', label: 'Check', align: 'left' },
    ],
    rows,
    rowTones: sym.map((p) => (p.issues.length ? 'warn' : 'pass')),
    note: 'Each layer is compared with its mirror image: copper thickness within 2 %, copper-heavy (plane or pour) against copper-heavy, dielectric thickness within 2 %, εr within 1 % and the same material type.',
  };
}

function graph(layers: StackLayer[], sigIdx: number[], st: StackState): GraphSpec {
  const ws = Array.from({ length: 120 }, (_, i) => Math.max(st.w / 6, 10e-6) * ((st.w * 4) / Math.max(st.w / 6, 10e-6)) ** (i / 119));
  const palette = ['#1f4e5f', '#c47b17', '#4f8a8b', '#6b5b95', '#2f7d4f', '#8b1e1e', '#9a8f7a', '#386a77'];
  const series: GraphSeries[] = [];
  // one curve per distinct line (mirror-image layers give the same curve: label them together)
  const seen = new Map<string, GraphSeries>();
  for (const i of sigIdx) {
    const ys = ws.map((w) => lineAt(layers, i, w, maskOf(st)).z0);
    if (ys.some((y) => y == null || !Number.isFinite(y))) continue;
    const sig = ys.map((y) => y!.toPrecision(8)).join(',');
    const prev = seen.get(sig);
    if (prev) {
      prev.label += `, L${i + 1}`;
      continue;
    }
    const s: GraphSeries = { label: `L${i + 1}`, x: ws, y: ys as number[], color: palette[series.length % palette.length], width: 2 };
    seen.set(sig, s);
    series.push(s);
  }
  for (const s of series) s.label += ` (${lineAt(layers, Number(s.label.slice(1).split(',')[0]) - 1, st.w, maskOf(st)).structure})`;
  return {
    id: 'z0-vs-w',
    title: 'Z₀ vs trace width per layer',
    x: { label: 'Trace width W', unit: 'm', log: true },
    y: [{ id: 'z', label: 'Z₀', unit: 'Ω' }],
    series,
    hlines: [{ value: st.z0t, label: `target ${fz(st.z0t)}`, color: '#9a8f7a', dash: [3, 3] }],
    vlines: [{ value: st.w, label: `W = ${fm(st.w)}`, color: '#9a8f7a' }],
  };
}

const sameLayers = (a: LayerItem[], b: LayerItem[]) =>
  a.length === b.length && a.every((x, i) => x.role === b[i].role && Math.abs(x.t - b[i].t) < 1e-12 && (i === a.length - 1 || (x.diel === b[i].diel && Math.abs(x.h - b[i].h) < 1e-12 && Math.abs(x.er - b[i].er) < 1e-9)));

export const def: CalcDef<StackState> = {
  id: ID,
  version: '0.1.0',
  method: 'Editable copper/dielectric stack: thickness sum against a target (one dielectric can be solved to fill it), mirror-symmetry and copper-balance checks, nearest plane above and below each signal layer. Impedance at a trace width: Hammerstad–Jensen (1980) microstrip with the Wan–Hoorfar (2000) / Bahl–Stuchly (1980) cover factor for solder mask and embedded lines (controlled-impedance model); striplines centred or offset by the asymmetric-stripline model (Cohn 1960 broadside-coupled thin strip, exact centred correction from Cohn 1954, Wadell 1991 image-method thickness terms); mixed dielectrics by the series-mean εr. Widths for a target Z₀ by bracketed Brent root finding.',
  fields,
  defaults,
  // Mode-switch harness note: in the 'total' analysis the target is only a check value, so a round trip
  // "solve h from here" legitimately moves h, and with it the computed total (medium "roundtrip: total =
  // target but the state has …" flags), or has no answer (low roundtrip-error flags) whenever the stack is
  // not already exactly on target, as the 1.605 mm default is not on its 1.6 mm target. Both are expected.
  solve: {
    default: 'total',
    analysis: 'total',
    options: [
      { key: 'total', label: 'Thickness from the layers (analysis)' },
      { key: 'h', label: 'One dielectric thickness for the target (◎ on that layer)' },
    ],
  },
  compute,
  controls: { solveIdx: (raw) => Math.max(0, Math.round(Number(raw)) || 0) },
  sync: (s) => {
    if (s.solveFor === 'h' && !(s.solveIdx >= 0 && s.solveIdx < s.layers.length - 1)) s.solveFor = 'total';
    const p = PRESETS[s.preset];
    if (p && !sameLayers(p.layers, s.layers)) s.preset = 'Custom';
  },
  examples: [
    { id: 'default', label: '4-layer 1.6 mm: S / GND / PWR / S', state: { ...defaults() } },
    { id: 'six-layer', label: '6-layer 1.6 mm with a dual stripline in the middle', state: { ...defaults(), preset: '6-layer 1.6 mm', layers: structuredClone(PRESETS['6-layer 1.6 mm']!.layers), target: 1.6e-3, w: 0.15e-3 } },
    { id: 'eight-layer', label: '8-layer 1.6 mm, every signal next to a plane', state: { ...defaults(), preset: '8-layer 1.6 mm', layers: structuredClone(PRESETS['8-layer 1.6 mm']!.layers), target: 1.6e-3, w: 0.12e-3 } },
    {
      id: 'fill-core',
      label: '4-layer 1.0 mm: solve the core for the target',
      state: { ...defaults(), preset: 'Custom', target: 1.0e-3, solveFor: 'h', solveIdx: 1, w: 0.2e-3, layers: finish([L('signal', 35, 'prepreg', 0.12, 4.2), L('gnd', 35, 'core', 0.6, 4.4), L('pwr', 35, 'prepreg', 0.12, 4.2), L('signal', 35, 'prepreg', 0, 4.2)]) },
    },
    {
      id: 'unbalanced',
      label: 'Unbalanced 6-layer: two planes on one side (warns)',
      state: { ...defaults(), preset: 'Custom', w: 0.15e-3, layers: finish([L('signal', 35, 'prepreg', 0.1, 4.2), L('gnd', 35, 'core', 0.2, 4.4), L('pwr', 35, 'prepreg', 0.5, 4.2), L('signal', 35, 'core', 0.5, 4.4), L('signal', 18, 'prepreg', 0.2, 4.2), L('signal', 35, 'prepreg', 0, 4.2)]) },
    },
    { id: 'twelve', label: '12-layer 2.0 mm, alternating signal and plane', state: { ...defaults(), preset: '12-layer 2.0 mm', layers: structuredClone(PRESETS['12-layer 2.0 mm']!.layers), target: 2.0e-3, w: 0.1e-3 } },
  ],
};
