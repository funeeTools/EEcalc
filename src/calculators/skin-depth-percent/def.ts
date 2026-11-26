/** Skin depth percentage — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB, U_THICK, withDefault } from '@/core/unitsets';
import { ALPHA20_CU, RHO20_CU, type ReturnPath, rhoAt } from '@/calculators/trace-resistance/model';
import { type AcModel, type Count, depthFor, freqFor, onsetFreq, profileExact, racRatio, shareWithin, skinDepth } from './model';

export const ID = 'pcb/skin-depth-percentage';

/**
 * Unknowns. 'p' (analysis) gives the share of the current within depth x at f; 'x' the depth that holds a
 * target share p at f; 'f' the frequency at which a target share p lies within x.
 */
export type SdpSolve = 'p' | 'x' | 'f';

export interface SdpState {
  solveFor: SdpSolve;
  f: number;
  fUnit: string;
  x: number;
  xUnit: string;
  count: Count;
  /** Share within depth x, percent */
  p: number;
  cuWeight: string;
  t: number;
  tUnit: string;
  w: number;
  wUnit: string;
  ret: ReturnPath;
  model: AcModel;
  metal: string;
  rho20: number;
  rho20Unit: string;
  alpha: number;
  tC: number;
}

export const OZ = 34.79e-6; // U_THICK's "oz" (1 oz/ft²)
const WEIGHTS: Record<string, number> = { '½ oz (17 µm)': 0.5, '1 oz (35 µm)': 1, '2 oz (70 µm)': 2, '3 oz (105 µm)': 3 };

/** ρ20 (Ω·m) and α20 (/°C): annealed copper IEC 60028; hard-drawn aluminium (61 % IACS) IEC 60889. */
export const METALS: Record<string, [number, number]> = {
  'Copper (annealed, IACS)': [RHO20_CU, ALPHA20_CU],
  'Aluminium (61 % IACS)': [2.8264e-8, 0.00403],
};

/** Input limits; solved depths and frequencies must land inside them. */
export const LIM = { f: [1e3, 1e12], x: [1e-8, 1e-2], p: [1e-4, 100] } as const;

const U_DEPTH: Record<string, number> = { 'µm': 1e-6, nm: 1e-9, mm: 1e-3, mil: 25.4e-6 };

/**
 * A solved length shown in mil or in can read "0.00051 in": the core rescales a solved value only within one
 * unit's SI prefixes, which imperial units lack. Move it to the imperial unit that shows it nearest 0.1…9999.
 */
const IMPERIAL: Record<string, number> = { mil: 25.4e-6 };
function fitImperial(st: Record<string, any>, key: string, unitKey: string): void {
  const v = st[key];
  if (!(st[unitKey] in IMPERIAL) || !(typeof v === 'number' && v > 0)) return;
  const mant = v / IMPERIAL[st[unitKey]];
  if (mant >= 0.1 && mant < 1e4) return;
  st[unitKey] = v < 1e-6 ? 'nm' : v < 1e-3 ? 'µm' : 'mm'; // only mil here: fall back to metric
}

const U_RHO: Record<string, number> = { 'µΩ·cm': 1e-8, 'nΩ·m': 1e-9 };

export const defaults = (): SdpState => ({
  solveFor: 'p',
  f: 1e9,
  fUnit: 'GHz',
  x: 5e-6,
  xUnit: 'µm',
  count: 'current',
  p: 90,
  cuWeight: '1 oz (35 µm)',
  t: OZ,
  tUnit: 'oz',
  w: 0.3e-3,
  wUnit: 'mm',
  ret: 'micro',
  model: 'layer',
  metal: 'Copper (annealed, IACS)',
  rho20: RHO20_CU,
  rho20Unit: 'µΩ·cm',
  alpha: ALPHA20_CU,
  tC: 25,
});

const RET_TEXT: Record<ReturnPath, string> = { micro: 'plane below', strip: 'planes both sides', iso: 'no nearby plane' };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Frequency & depth',
    note: 'Pick the unknown with ◎: the share within x, the depth x, or the frequency f.',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: LIM.f[0], max: LIM.f[1], solvable: true, help: 'Signal frequency (for a digital edge, the knee frequency ≈ 0.5/t_r, Johnson & Graham). Click ◎ to find the frequency at which a share p of the current lies within depth x.' },
      { kind: 'number', key: 'x', symbol: 'x', label: 'Depth from surface', units: U_DEPTH, unitKey: 'xUnit', unitFamily: 'none', min: LIM.x[0], max: LIM.x[1], solvable: true, help: 'A depth below the conducting surface, e.g. the tooth height of the foil treatment (2–8 µm on standard ED foil), a plating thickness, or the copper thickness. Click ◎ to find the depth that holds a share p.' },
      {
        kind: 'select', key: 'count', label: 'Share of', options: [{ value: 'current', label: 'Current (|J|)' }, { value: 'loss', label: 'Loss (|J|², heat)' }],
        // p means something else after the switch, so analyse the depth and frequency already entered
        apply: (_v, s) => (s.solveFor = 'p'),
        help: 'Current: share of the current magnitude, 1 − e^(−x/δ) (63 % within one δ). Loss: share of the I²R heat, 1 − e^(−2x/δ) (86 % within one δ).',
      },
      { kind: 'number', key: 'p', symbol: 'p', label: 'Share within x', suffix: '%', min: LIM.p[0], max: LIM.p[1], solvable: true, help: 'Share of the current (or loss) that flows within depth x of the surface of a thick conductor. As a target it must be below 100 %.' },
    ],
  },
  {
    kind: 'section',
    title: 'Trace',
    fields: [
      {
        kind: 'select', key: 'cuWeight', label: 'Copper weight', options: [...Object.keys(WEIGHTS), 'Custom'],
        apply: (v: string, s) => {
          const n = WEIGHTS[v];
          if (n) {
            s.t = n * OZ;
            s.tUnit = 'oz';
          }
        },
        help: 'Fills the thickness: 1 oz/ft² of copper foil ≈ 35 µm. Plated outer layers usually finish thicker.',
      },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: withDefault(U_THICK, 'oz'), unitKey: 'tUnit', min: 1e-6, max: 1e-3, help: 'Finished copper thickness (“oz” = oz/ft², 1 oz ≈ 35 µm).' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', min: 10e-6, max: 0.1, help: 'Trace width. Sets the resistance per length; with no nearby plane the side edges also carry current.' },
      {
        kind: 'select', key: 'ret', label: 'Return path',
        options: [
          { value: 'micro', label: 'Plane below (microstrip)' },
          { value: 'strip', label: 'Planes both sides (stripline)' },
          { value: 'iso', label: 'No nearby plane' },
        ],
        help: 'Which faces carry the AC current: the face toward the plane, both broad faces between two planes, or the whole perimeter of an isolated trace.',
      },
      {
        kind: 'select', key: 'model', label: 'Rac model',
        options: [
          { value: 'layer', label: 'Uniform δ layer (as Trace Resistance)' },
          { value: 'exact', label: 'Exact 1-D (Dowell)' },
        ],
        help: 'Uniform δ layer: all current in one skin depth under each conducting face — the trace-resistance page’s model. Exact 1-D: the full solution for a wide flat conductor (Dowell 1966); it rounds the knee near δ ≈ T and ignores the side edges.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Conductor',
    collapsed: true,
    fields: [
      {
        kind: 'select', key: 'metal', label: 'Metal', options: [...Object.keys(METALS), 'Custom'],
        apply: (v: string, s) => {
          const m = METALS[v];
          if (m) [s.rho20, s.alpha] = m;
        },
        help: 'Fills ρ₂₀ and α₂₀. Non-magnetic metals only (μr = 1); nickel and steel need their permeability.',
      },
      { kind: 'number', key: 'rho20', symbol: 'ρ₂₀', label: 'Resistivity at 20 °C', units: U_RHO, unitKey: 'rho20Unit', unitFamily: 'none', min: 1e-9, max: 1e-6, help: 'Annealed copper (IEC 60028): 1.7241 µΩ·cm. Electrodeposited PCB copper is typically a few percent higher.' },
      { kind: 'number', key: 'alpha', symbol: 'α₂₀', label: 'Tempco at 20 °C', suffix: '/°C', min: 0, max: 0.01, help: 'Resistance tempco at 20 °C: 0.00393 /°C for annealed copper (IEC 60028).' },
      { kind: 'number', key: 'tC', symbol: 'T_c', label: 'Conductor temperature', suffix: '°C', min: -60, max: 300, help: 'A hotter conductor has a higher resistivity and a larger skin depth (δ ∝ √ρ).' },
    ],
  },
];

/** A share (0…1) as a percentage that stays readable close to 0 and 100 %. */
const pct = (v: number) => {
  const p = v * 100;
  if (p >= 99.9999) return v >= 1 ? '100 %' : '> 99.9999 %';
  if (p >= 99.99) return `${p.toFixed(4)} %`;
  return `${p >= 10 ? p.toFixed(2) : p >= 0.1 ? p.toPrecision(3) : p.toPrecision(2)} %`;
};
const fmtF = (f: number) => si(f, 'Hz', 4);
const fmtL = (m: number) => si(m, 'm', 4);

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function fail(s: SdpState, key: SdpSolve, why: string, display: string): CalcReport {
  return {
    calc: ID, ok: true, solveFor: s.solveFor, warnings: [why], notes: [], graphs: [], tables: [],
    status: { text: 'NO SOLUTION', tone: 'fail' },
    results: [{ key, label: { p: 'Share within x', x: 'Depth', f: 'Frequency' }[key], value: null, display, primary: true, solved: true }],
  };
}

export function compute(st: SdpState): CalcReport {
  for (const k of ['f', 'x', 'p', 't', 'w', 'rho20', 'alpha', 'tC'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!['p', 'x', 'f'].includes(st.solveFor)) throw new Error('solveFor must be p, x or f.');
  if (!['micro', 'strip', 'iso'].includes(st.ret)) throw new Error('Return path must be "micro", "strip" or "iso".');
  if (st.count !== 'current' && st.count !== 'loss') throw new Error('count must be "current" or "loss".');
  if (st.model !== 'layer' && st.model !== 'exact') throw new Error('model must be "layer" or "exact".');
  const s: SdpState = { ...st };
  if (!(s.t > 0) || !(s.w > 0)) throw new Error('Copper thickness and width must be > 0.');
  if (!(s.rho20 > 0)) throw new Error('Resistivity must be > 0.');
  if (s.alpha < 0) throw new Error('The tempco must be ≥ 0.');
  const rho = rhoAt(s.rho20, s.alpha, s.tC);
  if (!(rho > 0)) throw new Error(`At ${s.tC} °C the linear tempco gives a resistivity ≤ 0: raise the temperature or lower α.`);
  if (s.solveFor !== 'f' && !(s.f > 0)) throw new Error('Frequency must be > 0.');
  if (s.solveFor !== 'x' && !(s.x > 0)) throw new Error('Depth must be > 0.');
  const what = s.count === 'loss' ? 'loss' : 'current';

  // ── solve: closed-form inverses of p = 1 − e^(−m·x/δ(f))
  if (s.solveFor !== 'p') {
    if (!(s.p > 0)) throw new Error('The target share p must be above 0 %.');
    // 100 % is a legal value of p (the analysis reaches it in floating point at high f or deep x), but as a
    // target it needs an infinite depth or frequency. So a round trip from such a state reports no solution;
    // the mode-switch harness flags that as a low "roundtrip-error", which is expected here.
    if (s.p >= 100) return fail(s, s.solveFor, `All (100 %) of the ${what} is only reached at infinite ${s.solveFor === 'x' ? 'depth' : 'frequency'}: ask for a share below 100 %, e.g. 99.9 %.`, s.solveFor === 'x' ? '∞' : '∞');
    const p = s.p / 100;
    if (s.solveFor === 'x') {
      const x = depthFor(p, skinDepth(s.f, 1 / rho, 1), s.count);
      if (x < LIM.x[0]) return fail(s, 'x', `${s.p} % of the ${what} lies within ${si(x, 'm', 3)} at ${fmtF(s.f)}, below the 10 nm this page accepts. Ask for a larger share or a lower frequency.`, '< 10 nm');
      if (x > LIM.x[1]) return fail(s, 'x', `${s.p} % of the ${what} needs a depth of ${si(x, 'm', 3)} at ${fmtF(s.f)}, beyond the 10 mm this page accepts: at this frequency the current is spread through any PCB conductor.`, '> 10 mm');
      s.x = x;
    } else {
      const f = freqFor(p, s.x, s.count, rho);
      if (f < LIM.f[0]) return fail(s, 'f', `${s.p} % of the ${what} lies within ${si(s.x, 'm', 3)} already below 1 kHz (at ${si(f, 'Hz', 3)}). Every frequency from 1 kHz up meets it.`, '< 1 kHz');
      if (f > LIM.f[1]) return fail(s, 'f', `${s.p} % of the ${what} within ${si(s.x, 'm', 3)} needs ${si(f, 'Hz', 3)}, above the 1 THz this page accepts. Ask for a smaller share or a larger depth.`, '> 1 THz');
      s.f = f;
    }
  }

  const delta = skinDepth(s.f, 1 / rho, 1);
  const share = shareWithin(s.x, delta, s.count);
  if (s.solveFor === 'p') s.p = share * 100;
  const ratio = racRatio(s.w, s.t, delta, s.ret, s.model);
  const ratioLayer = racRatio(s.w, s.t, delta, s.ret, 'layer');
  const ratioExact = racRatio(s.w, s.t, delta, s.ret, 'exact');
  const used = 1 / ratio;
  const fOn = onsetFreq(s.t, rho, s.ret);
  const rdcLen = rho / (s.w * s.t);
  const modelName = s.model === 'layer' ? 'uniform δ layer' : 'exact 1-D';

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const shareItem = item('p', `${what === 'loss' ? 'Loss' : 'Current'} within x`, s.p, '%', pct(share), { symbol: 'p', primary: true, solved: s.solveFor === 'p', note: s.solveFor === 'p' ? `in the top ${si(s.x, 'm', 3)} of a thick conductor` : 'target' });
  const results: ResultItem[] = [];
  if (s.solveFor === 'x') results.push(item('x', `Depth for ${s.p} % of the ${what}`, s.x, 'm', fmtL(s.x), { symbol: 'x', primary: true, solved: true, note: `${(s.x / delta).toPrecision(3)} δ` }));
  if (s.solveFor === 'f') results.push(item('f', 'Frequency', s.f, 'Hz', fmtF(s.f), { symbol: 'f', primary: true, solved: true, note: `${s.p} % of the ${what} within ${si(s.x, 'm', 3)}` }));
  if (s.solveFor === 'p') results.push(shareItem);
  results.push(
    item('delta', 'Skin depth', delta, 'm', fmtL(delta), { symbol: 'δ', primary: true, note: `${(100 * delta / s.t).toPrecision(3)} % of T at ${si(s.f, 'Hz', 3)}` }),
    item('used', 'Copper carrying current', used * 100, '%', pct(used), { symbol: 'η', primary: true, note: `${modelName} · ${RET_TEXT[s.ret]}` }),
    item('ratio', 'AC / DC resistance', ratio, '', ratio.toPrecision(4), { symbol: 'R_ac/R_dc', primary: true, note: `${modelName}, smooth copper` }),
  );
  if (s.solveFor !== 'p') results.push({ ...shareItem, primary: false, group: 'Share within depth' });

  const gS = 'Skin depth';
  results.push(
    item('deltaPct', 'Skin depth / thickness', (100 * delta) / s.t, '%', `${((100 * delta) / s.t).toPrecision(4)} %`, { symbol: 'δ/T', group: gS }),
    item('xDelta', 'Depth in skin depths', s.x / delta, '', `${(s.x / delta).toPrecision(4)} δ`, { symbol: 'x/δ', group: gS }),
    item('rs', 'Surface resistance', rho / delta, 'Ω', `${si(rho / delta, 'Ω', 4)}/□`, { symbol: 'R_s', group: gS, note: 'ρ/δ, a thick conductor' }),
    item('fOnset', 'Skin effect sets in at', fOn, 'Hz', si(fOn, 'Hz', 3), { group: gS, note: s.ret === 'micro' ? 'δ = T (one conducting face)' : 'δ = T/2 (two conducting faces)' }),
    item('rho', 'Resistivity', rho, 'Ω·m', `${(rho * 1e8).toFixed(4)} µΩ·cm`, { symbol: 'ρ', group: gS, note: `at ${s.tC} °C` }),
  );
  const gT = 'Trace resistance';
  results.push(
    item('ratioLayer', 'Rac/Rdc, uniform δ layer', ratioLayer, '', ratioLayer.toPrecision(4), { group: gT, note: 'as on the Trace Resistance page' }),
    item('ratioExact', 'Rac/Rdc, exact 1-D', ratioExact, '', ratioExact.toPrecision(4), { group: gT, note: s.ret === 'iso' ? 'both broad faces, side edges ignored' : 'Dowell, wide flat conductor' }),
    item('tEff', 'Equivalent conducting thickness', s.t * used, 'm', fmtL(s.t * used), { symbol: 'T_eff', group: gT, note: 'T·Rdc/Rac' }),
    item('rdcLen', 'DC resistance per length', rdcLen, 'Ω/m', `${si(rdcLen / 1e3, 'Ω', 4)}/mm`, { group: gT }),
    item('racLen', 'AC resistance per length', rdcLen * ratio, 'Ω/m', `${si((rdcLen * ratio) / 1e3, 'Ω', 4)}/mm`, { group: gT }),
    item('sheetDc', 'Sheet resistance, DC', rho / s.t, 'Ω', `${si(rho / s.t, 'Ω', 4)}/□`, { symbol: 'R□', group: gT }),
    item('sheetAc', 'Sheet resistance at f', (rho / s.t) * ratio, 'Ω', `${si((rho / s.t) * ratio, 'Ω', 4)}/□`, { group: gT }),
  );

  // ── table: shares at round depths
  const depths: [string, number][] = [['δ', delta], ['2δ', 2 * delta], ['3δ', 3 * delta], ['5δ', 5 * delta], [`x = ${si(s.x, 'm', 3)}`, s.x], [`T = ${si(s.t, 'm', 3)}`, s.t]];
  const table: TableSpec = {
    id: 'shares',
    title: 'Share within depth (thick conductor)',
    columns: [{ key: 'at', label: 'Depth', align: 'left' }, { key: 'depth', label: 'Depth', unit: 'm' }, { key: 'current', label: 'Current' }, { key: 'loss', label: 'Loss (I²R)' }],
    rows: depths.map(([at, d]) => ({ at, depth: d, current: shareWithin(d, delta, 'current'), loss: shareWithin(d, delta, 'loss') })),
    display: depths.map(([at, d]) => ({ at, depth: si(d, 'm', 3), current: pct(shareWithin(d, delta, 'current')), loss: pct(shareWithin(d, delta, 'loss')) })),
    note: 'Half-space values, 1 − e^(−x/δ) for current and 1 − e^(−2x/δ) for loss. In a trace only T thick all of the current is within T.',
  };

  // ── validity and advice
  const warnings: string[] = [];
  const notes: string[] = [];
  if (s.x > s.t) notes.push(`x = ${si(s.x, 'm', 3)} is deeper than the copper (${si(s.t, 'm', 3)}): the share is the thick-conductor figure; in this trace all of the current is within T.`);
  if (s.t < 3 * delta && s.x <= s.t) warnings.push(`The copper is only ${(s.t / delta).toPrecision(2)} skin depths thick, so the current does not decay as in a thick conductor and the share within x is approximate. Use the R_ac/R_dc (exact 1-D model) for the trace itself.`);
  if (s.w < 4 * delta && ratio > 1.05) warnings.push(`The trace is only ${(s.w / delta).toPrecision(2)} skin depths wide, so the edges carry as much current as the faces and both models are rough here.`);
  if (s.tC < -50) warnings.push(`At ${s.tC} °C the linear tempco is outside its ±2 % range (−50…+300 °C); use measured resistivity data.`);
  if (delta < 3e-6 && ratio > 1.5) notes.push('At this skin depth the foil’s surface roughness adds loss (Hammerstad–Jensen, Huray); the trace-resistance page includes a roughness factor.');
  notes.push(
    'Thick-conductor current density falls as e^(−y/δ): 63 % of the current (86 % of the loss) lies within one skin depth and 99 % within 4.6 δ.',
    `Rac/Rdc is for an isolated straight trace with smooth copper; proximity to the return conductor and edge crowding raise it further. Non-magnetic metal (μr = 1).`,
  );

  const report: CalcReport = {
    calc: ID, ok: true, solveFor: s.solveFor, results, graphs: graphs(s, rho, delta, ratio), tables: [table], warnings, notes,
    summary: `${si(s.t, 'm', 3)} (${+(s.t / OZ).toFixed(2)} oz) ${RET_TEXT[s.ret]} · ${si(s.f, 'Hz', 4)} · δ = ${si(delta, 'm', 3)} · ${s.tC} °C`,
    details: { delta, rho, share, ratio, ratioLayer, ratioExact, used, fOnset: fOn },
  };
  return report;
}

function graphs(s: SdpState, rho: number, delta: number, ratio: number): GraphSpec[] {
  const fLo = Math.max(LIM.f[0], Math.min(s.f / 100, onsetFreq(s.t, rho, s.ret) / 30));
  const fHi = Math.min(LIM.f[1], Math.max(s.f * 100, 1e10));
  const fs = logspace(fLo, fHi, 181);
  const dOf = (f: number) => skinDepth(f, 1 / rho, 1);
  const target = s.solveFor !== 'p';
  // 1. share within x and the copper used, against frequency
  const pf: GraphSpec = {
    id: 'pct-vs-f',
    title: 'Share vs frequency',
    subtitle: `x = ${si(s.x, 'm', 3)} · ${si(s.t, 'm', 3)} copper, ${RET_TEXT[s.ret]}`,
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'pc', label: 'Share', unit: '%', min: 0, max: 100 }],
    series: [
      { label: `${s.count === 'loss' ? 'Loss' : 'Current'} within x`, x: fs, y: fs.map((f) => 100 * shareWithin(s.x, dOf(f), s.count)), axis: 'pc', width: 2.2 },
      { label: 'Copper carrying current', x: fs, y: fs.map((f) => 100 / racRatio(s.w, s.t, dOf(f), s.ret, s.model)), axis: 'pc', color: '#c47b17', width: 1.8, dash: [6, 3] },
    ],
    hlines: target ? [{ value: s.p, label: `p = ${+s.p.toPrecision(4)} %`, axis: 'pc', color: '#8b1e1e', dash: [6, 4] }] : [],
    vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz', 3)}` }],
    markers: [
      { x: s.f, y: 100 * shareWithin(s.x, delta, s.count), axis: 'pc', label: `${(100 * shareWithin(s.x, delta, s.count)).toPrecision(3)} %` },
      { x: s.f, y: 100 / ratio, axis: 'pc', label: `${(100 / ratio).toPrecision(3)} %`, color: '#c47b17' },
    ],
    legend: 'below',
  };
  // 2. Rac/Rdc against frequency, both models
  const rf: GraphSpec = {
    id: 'rac-vs-f',
    title: 'Rac/Rdc vs frequency',
    subtitle: `${si(s.w, 'm', 3)} × ${si(s.t, 'm', 3)}, ${RET_TEXT[s.ret]} · smooth copper`,
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'r', label: 'Rac/Rdc', unit: '', log: true }],
    series: [
      { label: 'Uniform δ layer', x: fs, y: fs.map((f) => racRatio(s.w, s.t, dOf(f), s.ret, 'layer')), axis: 'r', width: s.model === 'layer' ? 2.2 : 1.4 },
      { label: 'Exact 1-D (Dowell)', x: fs, y: fs.map((f) => racRatio(s.w, s.t, dOf(f), s.ret, 'exact')), axis: 'r', color: '#4f8a8b', width: s.model === 'exact' ? 2.2 : 1.4, dash: [6, 3] },
    ],
    vlines: [
      { value: onsetFreq(s.t, rho, s.ret), label: s.ret === 'micro' ? 'δ = T' : 'δ = T/2', color: '#9a8f7a', dash: [2, 3] },
      { value: s.f, label: `f = ${si(s.f, 'Hz', 3)}` },
    ],
    markers: [{ x: s.f, y: ratio, axis: 'r', label: ratio.toPrecision(3) }],
  };
  // 3. current density through the copper thickness at f
  const n = 121;
  const ys = Array.from({ length: n }, (_, i) => (s.t * i) / (n - 1));
  const jp: GraphSpec = {
    id: 'j-vs-depth',
    title: 'Current density vs depth',
    subtitle: `at ${si(s.f, 'Hz', 3)} · depth below the ${s.ret === 'micro' ? 'face toward the plane' : 'surface'}`,
    x: { label: 'Depth into the copper', unit: 'm' },
    y: [{ id: 'j', label: '|J| / |J at surface|', unit: '', min: 0, max: 1.05 }],
    series: [
      { label: 'Thick conductor e^(−y/δ)', x: ys, y: ys.map((y) => Math.exp(-y / delta)), axis: 'j', color: '#9a8f7a', width: 1.4, dash: [5, 3] },
      { label: `This trace (exact 1-D, ${s.ret === 'micro' ? 'one face' : 'both faces'})`, x: ys, y: ys.map((y) => profileExact(y, s.t, delta, s.ret)), axis: 'j', width: 2.2 },
    ],
    vlines: [
      ...(delta < s.t ? [{ value: delta, label: 'δ', color: '#4f8a8b', dash: [2, 3] }] : []),
      ...(s.x < s.t ? [{ value: s.x, label: `x = ${si(s.x, 'm', 3)}` }] : []),
    ],
    legend: 'below',
  };
  return [pf, rf, jp];
}

export const def: CalcDef<SdpState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Skin depth δ = √(ρ/(π f μ0)) (Ramo, Whinnery & Van Duzer §3.16) with ρ(T) from IEC 60028; share of the current within depth x of a thick conductor 1 − e^(−x/δ) (loss: 1 − e^(−2x/δ)), inverted in closed form for x or f; Rac/Rdc of the trace from the uniform one-δ layer of the trace-resistance page or the exact one-dimensional solution F(Δ) = Δ(sinh 2Δ + sin 2Δ)/(cosh 2Δ − cos 2Δ) (Dowell, Proc. IEE 1966).',
  fields,
  defaults,
  solve: {
    default: 'p',
    analysis: 'p',
    options: [
      { key: 'p', label: 'Share of the current within depth x at f' },
      { key: 'x', label: 'Depth that holds a share p at f' },
      { key: 'f', label: 'Frequency at which a share p lies within x' },
    ],
  },
  compute,
  sync: (s) => {
    if (s.solveFor === 'x') fitImperial(s, 'x', 'xUnit');
    const n = WEIGHTS[s.cuWeight];
    if (n && Math.abs(n * OZ - s.t) > 1e-9 * s.t) s.cuWeight = 'Custom';
    if (s.cuWeight === 'Custom') for (const [k, v] of Object.entries(WEIGHTS)) if (Math.abs(v * OZ - s.t) <= 1e-9 * s.t) s.cuWeight = k;
    const m = METALS[s.metal];
    const same = (a: [number, number]) => Math.abs(a[0] - s.rho20) <= 1e-9 * a[0] && Math.abs(a[1] - s.alpha) <= 1e-12;
    if (m && !same(m)) s.metal = 'Custom';
    if (s.metal === 'Custom') for (const [k, v] of Object.entries(METALS)) if (same(v)) s.metal = k;
  },
  examples: [
    { id: 'default', label: '1 oz microstrip at 1 GHz: current in the top 5 µm', state: defaults() },
    {
      id: 'plating-99',
      label: 'Depth that carries 99 % of the current at 2.4 GHz',
      state: { solveFor: 'x', f: 2.4e9, fUnit: 'GHz', p: 99, count: 'current', x: 5e-6, xUnit: 'µm', cuWeight: '½ oz (17 µm)', t: 0.5 * OZ, tUnit: 'oz', w: 0.2e-3, wUnit: 'mm', ret: 'micro', model: 'layer', metal: 'Copper (annealed, IACS)', rho20: RHO20_CU, alpha: ALPHA20_CU, tC: 25 },
    },
    {
      id: 'rough-f',
      label: 'Frequency where 90 % of the loss is in the top 3 µm (foil teeth)',
      state: { solveFor: 'f', x: 3e-6, xUnit: 'µm', p: 90, count: 'loss', f: 1e9, fUnit: 'GHz', cuWeight: '1 oz (35 µm)', t: OZ, tUnit: 'oz', w: 0.3e-3, wUnit: 'mm', ret: 'micro', model: 'layer', metal: 'Copper (annealed, IACS)', rho20: RHO20_CU, alpha: ALPHA20_CU, tC: 25 },
    },
    {
      id: 'buck-2oz',
      label: '2 oz power trace at 500 kHz, 60 °C: all the copper still conducts',
      state: { solveFor: 'p', f: 500e3, fUnit: 'kHz', x: 35e-6, xUnit: 'µm', count: 'current', cuWeight: '2 oz (70 µm)', t: 2 * OZ, tUnit: 'oz', w: 3e-3, wUnit: 'mm', ret: 'iso', model: 'exact', metal: 'Copper (annealed, IACS)', rho20: RHO20_CU, alpha: ALPHA20_CU, tC: 60 },
    },
    {
      id: 'strip-10g',
      label: '½ oz stripline at 10 GHz: under 8 % of the copper is used',
      state: { solveFor: 'p', f: 10e9, fUnit: 'GHz', x: 1e-6, xUnit: 'µm', count: 'current', cuWeight: '½ oz (17 µm)', t: 0.5 * OZ, tUnit: 'oz', w: 0.12e-3, wUnit: 'mm', ret: 'strip', model: 'layer', metal: 'Copper (annealed, IACS)', rho20: RHO20_CU, alpha: ALPHA20_CU, tC: 25 },
    },
    {
      id: 'thin-onset',
      label: '½ oz at 20 MHz, near the onset: layer vs exact 1-D',
      state: { solveFor: 'p', f: 20e6, fUnit: 'MHz', x: 10e-6, xUnit: 'µm', count: 'current', cuWeight: '½ oz (17 µm)', t: 0.5 * OZ, tUnit: 'oz', w: 0.5e-3, wUnit: 'mm', ret: 'micro', model: 'exact', metal: 'Copper (annealed, IACS)', rho20: RHO20_CU, alpha: ALPHA20_CU, tC: 25 },
    },
  ],
};
