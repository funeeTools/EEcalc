/** PCB trace resistance — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN, U_LEN_PCB, U_ROUGH, U_THICK, withDefault } from '@/core/unitsets';
import { ipcRise } from '@/calculators/trace-width-current/model';
import { ALPHA20_CU, RHO20_CU, type ReturnPath, skinOnset, traceR, type TraceRIn } from './model';

/**
 * Unknowns. 'r' analyses the trace (R and ΔV both calculated). 'w' / 'len' solve the width or length for a
 * target resistance R; 'wV' / 'lenV' for a target voltage drop ΔV at the current I.
 */
export type TrSolve = 'r' | 'w' | 'len' | 'wV' | 'lenV';

export interface TrState {
  solveFor: TrSolve;
  w: number;
  wUnit: string;
  len: number;
  lenUnit: string;
  cuWeight: string;
  t: number;
  tUnit: string;
  i: number;
  tC: number;
  f: number;
  fUnit: string;
  r: number;
  rUnit: string;
  vd: number;
  vdUnit: string;
  ret: ReturnPath;
  rough: number;
  roughUnit: string;
  rho20: number;
  rho20Unit: string;
  alpha: number;
}

export const OZ = 34.79e-6; // U_THICK's "oz" (1 oz/ft²)
const MIL = 25.4e-6;

const WEIGHTS: Record<string, number> = { '½ oz (17 µm)': 0.5, '1 oz (35 µm)': 1, '2 oz (70 µm)': 2, '3 oz (105 µm)': 3 };

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

export const defaults = (): TrState => ({
  solveFor: 'r',
  w: 0.5e-3,
  wUnit: 'mm',
  len: 100e-3,
  lenUnit: 'mm',
  cuWeight: '1 oz (35 µm)',
  t: OZ,
  tUnit: 'oz',
  i: 1,
  tC: 25,
  f: 0,
  fUnit: 'MHz',
  r: 0.1,
  rUnit: 'mΩ',
  vd: 0.1,
  vdUnit: 'mV',
  ret: 'micro',
  rough: 0,
  roughUnit: 'µm',
  rho20: RHO20_CU,
  rho20Unit: 'µΩ·cm',
  alpha: ALPHA20_CU,
});

const U_RES: Record<string, number> = { 'mΩ': 1e-3, 'Ω': 1, 'µΩ': 1e-6, 'kΩ': 1e3 };
const U_VOLT: Record<string, number> = { mV: 1e-3, V: 1, 'µV': 1e-6, kV: 1e3 };
const U_RHO: Record<string, number> = { 'µΩ·cm': 1e-8, 'nΩ·m': 1e-9 };

const solvedIn = (...m: TrSolve[]) => (_s: any, root: any) => m.includes(root.solveFor);
const byDrop = (root: any) => root.solveFor === 'wV' || root.solveFor === 'lenV';

/** Input limits; solved widths and lengths are searched over exactly these ranges. */
export const LIM = { w: [1e-6, 1], len: [1e-6, 100] } as const;

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Trace',
    fields: [
      {
        kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', min: LIM.w[0], max: LIM.w[1],
        solvable: true, solvedWhen: solvedIn('w', 'wV'), onSolve: (_s, r) => (r.solveFor = byDrop(r) ? 'wV' : 'w'), onUnsolve: (_s, r) => (r.solveFor = 'r'),
        help: 'Finished (etched) width. Click ◎ to find the width that meets the target R or ΔV.',
      },
      {
        kind: 'number', key: 'len', symbol: 'ℓ', label: 'Trace length', units: withDefault(U_LEN, 'mm'), unitKey: 'lenUnit', min: LIM.len[0], max: LIM.len[1],
        solvable: true, solvedWhen: solvedIn('len', 'lenV'), onSolve: (_s, r) => (r.solveFor = byDrop(r) ? 'lenV' : 'len'), onUnsolve: (_s, r) => (r.solveFor = 'r'),
        help: 'Routed length between the two ends. Click ◎ to find the longest trace that meets the target R or ΔV.',
      },
      {
        kind: 'select', key: 'cuWeight', label: 'Copper weight', options: [...Object.keys(WEIGHTS), 'Custom'],
        apply: (v: string, s) => {
          const n = WEIGHTS[v];
          if (n) {
            s.t = n * OZ;
            s.tUnit = 'oz';
          }
        },
        help: 'Fills the thickness: 1 oz/ft² of copper foil ≈ 35 µm. Outer layers are usually plated up, so a 1 oz start often finishes nearer 45–50 µm.',
      },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: withDefault(U_THICK, 'oz'), unitKey: 'tUnit', min: 1e-6, max: 1e-3, help: 'Finished copper thickness (“oz” = oz/ft², 1 oz ≈ 35 µm).' },
    ],
  },
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'i', symbol: 'I', label: 'Current', unit: 'A', min: 1e-6, max: 1e4, help: 'DC current, or the RMS value of an AC current at frequency f. Sets the voltage drop and the power.' },
      { kind: 'number', key: 'tC', symbol: 'T_c', label: 'Copper temperature', suffix: '°C', min: -100, max: 500, help: 'Temperature of the conductor itself: ambient plus its self-heating (see the IPC-2221 estimate in the results). Copper gains about 0.39 % resistance per °C.' },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 0, max: 1e11, help: '0 for DC. Above the frequency where the skin depth reaches the copper thickness the current crowds into the surface and the resistance rises roughly as √f.' },
    ],
  },
  {
    kind: 'section',
    title: 'Resistance & drop',
    note: 'Green values are calculated. Click ◎ on R or ΔV to make it the target for W or ℓ.',
    fields: [
      {
        kind: 'number', key: 'r', symbol: 'R', label: 'Resistance', units: U_RES, unitKey: 'rUnit', min: 1e-12, max: 1e12,
        solvable: true, solvedWhen: solvedIn('r', 'wV', 'lenV'), onSolve: (_s, r) => (r.solveFor = 'r'),
        onUnsolve: (_s, r) => (r.solveFor = r.solveFor === 'lenV' ? 'len' : 'w'),
        help: 'Resistance end to end at f and T_c (the DC value when f = 0). As a target it is the largest resistance you accept.',
      },
      {
        kind: 'number', key: 'vd', symbol: 'ΔV', label: 'Voltage drop', units: U_VOLT, unitKey: 'vdUnit', min: 1e-15, max: 1e12,
        solvable: true, solvedWhen: solvedIn('r', 'w', 'len'), onSolve: (_s, r) => (r.solveFor = 'r'),
        onUnsolve: (_s, r) => (r.solveFor = r.solveFor === 'len' ? 'lenV' : 'wV'),
        help: 'Resistive drop I·R along the trace (the inductive part of an AC drop is not included). As a target it is the largest drop you accept.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'High frequency & material',
    collapsed: true,
    fields: [
      {
        kind: 'select', key: 'ret', label: 'Return path',
        options: [
          { value: 'micro', label: 'Plane below (microstrip)' },
          { value: 'strip', label: 'Planes both sides (stripline)' },
          { value: 'iso', label: 'No nearby plane' },
        ],
        help: 'Where the AC current crowds: on the face toward a plane, on both faces between two planes, or round the whole perimeter of an isolated trace. Also picks the IPC-2221 external / internal curve for the heating estimate.',
      },
      { kind: 'number', key: 'rough', symbol: 'Δ_rms', label: 'Copper roughness', units: U_ROUGH, unitKey: 'roughUnit', min: 0, max: 20e-6, help: 'RMS surface roughness of the foil (0 = smooth). Standard ED foil ≈ 1–2 µm, reverse-treated ≈ 0.5–1 µm, VLP/HVLP ≈ 0.2–0.5 µm. Used only at AC (Hammerstad–Jensen).' },
      { kind: 'number', key: 'rho20', symbol: 'ρ₂₀', label: 'Resistivity at 20 °C', units: U_RHO, unitKey: 'rho20Unit', unitFamily: 'none', min: 1e-9, max: 1e-5, help: 'Annealed copper (IEC 60028): 1.7241 µΩ·cm. Electrodeposited PCB copper is typically a few percent higher.' },
      { kind: 'number', key: 'alpha', symbol: 'α₂₀', label: 'Tempco at 20 °C', suffix: '/°C', min: 0, max: 0.01, help: 'Resistance tempco at 20 °C: 0.00393 /°C for annealed copper (IEC 60028).' },
    ],
  },
];

const LABEL: Record<'w' | 'len', string> = { w: 'Trace width', len: 'Maximum length' };

const degC = (t: number, d = 1) => `${t.toFixed(d)} °C`;
const fmtW = (w: number) => `${si(w, 'm', 4)} (${(w / MIL).toPrecision(4)} mil)`;
const fmtF = (f: number) => (f > 0 ? si(f, 'Hz', 3) : 'DC');

export function inputsOf(s: TrState): TraceRIn {
  return { w: s.w, len: s.len, t: s.t, tC: s.tC, f: s.f, ret: s.ret, rough: s.rough, rho20: s.rho20, alpha: s.alpha };
}

export function compute(st: TrState): CalcReport {
  for (const k of ['w', 'len', 't', 'i', 'tC', 'f', 'r', 'vd', 'rough', 'rho20', 'alpha'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!['micro', 'strip', 'iso'].includes(st.ret)) throw new Error('Return path must be "micro", "strip" or "iso".');
  if (!['r', 'w', 'len', 'wV', 'lenV'].includes(st.solveFor)) throw new Error('solveFor must be r, w, len, wV or lenV.');
  const s: TrState = { ...st };
  if (!(s.t > 0)) throw new Error('Copper thickness must be > 0.');
  if (!(s.i > 0)) throw new Error('Current must be > 0.');
  if (!(s.rho20 > 0)) throw new Error('Resistivity must be > 0.');
  if (s.f < 0 || s.rough < 0 || s.alpha < 0) throw new Error('Frequency, roughness and tempco must be ≥ 0.');
  if (!(1 + s.alpha * (s.tC - 20) > 0)) throw new Error(`At ${degC(s.tC)} the linear tempco gives a resistivity ≤ 0: raise the temperature or lower α.`);
  const solveW = s.solveFor === 'w' || s.solveFor === 'wV';
  const solveL = s.solveFor === 'len' || s.solveFor === 'lenV';
  const byV = s.solveFor === 'wV' || s.solveFor === 'lenV';
  if (!solveW && !(s.w > 0)) throw new Error('Trace width must be > 0.');
  if (!solveL && !(s.len > 0)) throw new Error('Trace length must be > 0.');

  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'pcb/trace-resistance', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  // ── solve: the one forward model R(W, ℓ, …) inverted for W or ℓ
  if (solveW || solveL) {
    const key = solveW ? 'w' : 'len';
    const target = byV ? s.vd / s.i : s.r;
    const tgtText = byV ? `ΔV = ${si(s.vd, 'V', 3)} at ${si(s.i, 'A', 3)}` : `R = ${si(s.r, 'Ω', 3)}`;
    if (!(target > 0)) throw new Error(`The target ${byV ? 'drop' : 'resistance'} must be > 0.`);
    const g = (x: number) => traceR({ ...inputsOf(s), [key]: x }).r;
    const [lo, hi] = LIM[key];
    const stop = (why: string, display: string) => {
      warnings.push(why);
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      report.results.push({ key, label: LABEL[key], value: null, display, primary: true, solved: true });
      return report;
    };
    if (key === 'w') {
      // R falls as W grows
      if (g(hi) > target) return stop(`${tgtText} needs a trace wider than 1 m (1 m gives ${si(g(hi), 'Ω', 3)}). Use thicker copper, a shorter route, or a plane / several layers in parallel.`, '> 1 m');
      if (g(lo) < target) return stop(`Even a 1 µm trace stays within ${tgtText}; resistance does not set this width (use the fabricator’s minimum, or check the current capacity).`, '< 1 µm');
    } else {
      // R grows with ℓ
      if (g(lo) > target) return stop(`Even a 1 µm long trace exceeds ${tgtText} (${si(g(lo), 'Ω', 3)}). Widen the trace or use thicker copper.`, '< 1 µm');
      if (g(hi) < target) return stop(`A 100 m trace still stays within ${tgtText} (${si(g(hi), 'Ω', 3)}); length does not limit this design.`, '> 100 m');
    }
    const root = invert(g, target, { lo, hi, log: true, samples: 80 });
    if (!root.ok) return stop(`No ${key === 'w' ? 'width' : 'length'} in range gives ${tgtText}.`, '—');
    s[key] = root.roots[0];
  }

  const m = traceR(inputsOf(s));
  s.r = m.r;
  s.vd = s.i * m.r;
  const p = s.i * s.i * m.r;
  const layer = s.ret === 'strip' ? 'internal' : 'external';
  const area = s.w * s.t;
  const rise = ipcRise(s.i, area, layer);
  const fOn = skinOnset(s.t, m.rho, s.ret);

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const at = `${fmtF(s.f)}, ${degC(s.tC, 0)}`;
  const rItem = item('r', 'Resistance', m.r, 'Ω', si(m.r, 'Ω', 4), { symbol: 'R', primary: true, solved: !(s.solveFor === 'w' || s.solveFor === 'len'), note: s.f > 0 ? `${at} · DC ${si(m.rdc, 'Ω', 3)}` : `DC at ${degC(s.tC, 0)} · ${si(m.rdc20, 'Ω', 3)} at 20 °C` });
  const vItem = item('vd', 'Voltage drop', s.vd, 'V', si(s.vd, 'V', 4), { symbol: 'ΔV', primary: true, solved: !byV, note: `at I = ${si(s.i, 'A', 3)}${s.f > 0 ? ' RMS' : ''}` });
  const pItem = item('p', 'Power loss', p, 'W', si(p, 'W', 4), { symbol: 'P', primary: true, note: `I²R, ${(p / s.len / 1e3).toPrecision(3)} W/mm` });
  const results: ResultItem[] = [];
  if (solveW) results.push(item('w', 'Trace width', s.w, 'm', si(s.w, 'm', 4), { symbol: 'W', primary: true, solved: true, note: `${(s.w / MIL).toPrecision(4)} mil · for ${byV ? `ΔV ≤ ${si(s.vd, 'V', 3)}` : `R ≤ ${si(s.r, 'Ω', 3)}`}` }));
  if (solveL) results.push(item('len', 'Maximum length', s.len, 'm', si(s.len, 'm', 4), { symbol: 'ℓ', primary: true, solved: true, note: `for ${byV ? `ΔV ≤ ${si(s.vd, 'V', 3)}` : `R ≤ ${si(s.r, 'Ω', 3)}`}` }));
  results.push(rItem, vItem, pItem);

  const gD = 'DC resistance';
  results.push(
    item('rdc', `DC resistance at ${degC(s.tC, 0)}`, m.rdc, 'Ω', si(m.rdc, 'Ω', 4), { group: gD }),
    item('rdc20', 'DC resistance at 20 °C', m.rdc20, 'Ω', si(m.rdc20, 'Ω', 4), { group: gD }),
    item('rPerLen', 'Resistance per length', m.rdc / s.len, 'Ω/m', `${si(m.rdc / s.len / 1e3, 'Ω', 4)}/mm`, { group: gD }),
    item('sheet', 'Sheet resistance', m.sheet, 'Ω', `${si(m.sheet, 'Ω', 4)}/□`, { symbol: 'R□', group: gD, note: `× ${(s.len / s.w).toPrecision(4)} squares` }),
    item('rho', 'Resistivity', m.rho, 'Ω·m', `${(m.rho * 1e8).toFixed(4)} µΩ·cm`, { symbol: 'ρ', group: gD, note: `at ${degC(s.tC)}` }),
    item('area', 'Cross-section', area, 'm²', `${(area * 1e6).toPrecision(4)} mm² (${(area / MIL / MIL).toPrecision(4)} mil²)`, { symbol: 'A', group: gD }),
    item('widthOut', 'Width', s.w, 'm', fmtW(s.w), { group: gD }),
  );
  const gA = 'Skin effect';
  if (s.f > 0) {
    results.push(
      item('delta', 'Skin depth', m.delta, 'm', si(m.delta, 'm', 4), { symbol: 'δ', group: gA, note: `copper is ${si(s.t, 'm', 3)} thick` }),
      item('ratio', 'Rac/Rdc', m.skin * m.kr, '', (m.skin * m.kr).toFixed(3), { group: gA, note: m.kr > 1.0005 ? `skin ${m.skin.toFixed(3)} × roughness ${m.kr.toFixed(3)}` : 'smooth copper' }),
    );
  }
  results.push(item('fOnset', 'Skin effect sets in at', fOn, 'Hz', si(fOn, 'Hz', 3), { group: gA, note: s.ret === 'micro' ? 'δ = T (current on the face toward the plane)' : 'δ = T/2 (current on both faces)' }));
  const gH = 'Heating (IPC-2221 estimate)';
  results.push(
    item('riseIpc', 'Temperature rise at I', rise, '°C', rise < 1e4 ? degC(rise) : '> 10 000 °C', { symbol: 'ΔT', group: gH, tone: rise > 100 ? 'fail' : rise > 30 ? 'warn' : '', note: `IPC-2221 ${layer} curve, ${(area / MIL / MIL).toPrecision(3)} mil²` }),
    item('j', 'Current density', s.i / area, 'A/m²', `${(s.i / area / 1e6).toPrecision(3)} A/mm²`, { symbol: 'J', group: gH }),
  );
  report.results = results;

  // ── validity
  if (s.tC < -50 || s.tC > 300) warnings.push(`At ${degC(s.tC)} the linear tempco is outside its ±2 % range (−50…+300 °C, Matula 1979). Use measured resistivity data for this temperature.`);
  if (m.kr > 1.9) warnings.push(`The roughness factor has saturated (${m.kr.toFixed(2)}, the Hammerstad–Jensen limit is 2) because the roughness is well above the skin depth. Measured losses of very rough foil keep rising; use a Huray-type model or smoother (VLP/HVLP) foil.`);
  if (rise > 100) warnings.push(`At ${si(s.i, 'A', 3)} the IPC-2221 curve puts this trace about ${rise < 1e4 ? degC(rise, 0) : 'thousands of °C'} above ambient. That is beyond the charts and the laminate rating: widen the trace or use thicker copper (see the trace-width calculator).`);
  else if (rise > 10 && rise > 0.5 * Math.max(s.tC - 20, 0) + 10) notes.push(`Self-heating: about ${degC(rise, 0)} rise by IPC-2221, so the copper runs hotter than ambient. Set T_c to ambient + rise for the hot resistance.`);
  if (s.w < 0.1e-3) warnings.push(`W = ${fmtW(s.w)} is below typical fabrication minimums (≈ 0.1 mm / 4 mil); check with your fabricator.`);
  if (s.f > 0 && s.w < 4 * m.delta && m.skin > 1.05) warnings.push(`The trace is only ${(s.w / m.delta).toFixed(1)} skin depths wide, so current crowding at the edges matters as much as the faces; the skin-layer estimate is rough here.`);

  report.summary = `${(s.t / OZ).toFixed(2)} oz (${si(s.t, 'm', 3)}) · ${si(s.w, 'm', 3)} × ${si(s.len, 'm', 3)} · ${at}${s.f > 0 ? ` · ${{ micro: 'plane below', strip: 'planes both sides', iso: 'no plane' }[s.ret]}` : ''}`;
  notes.push(
    'R = ρ(T)·ℓ/(W·T) with ρ(T) = ρ₂₀·(1 + α₂₀·(T − 20 °C)); annealed copper ρ₂₀ = 1.7241 µΩ·cm, α₂₀ = 0.00393 /°C (IEC 60028).',
    'The cross-section is taken as a rectangle; real etched traces are slightly trapezoidal and plated outer layers are thicker than the base foil.',
  );
  if (s.f > 0) notes.push('AC: current in one skin depth under the faces that carry it (no edge crowding or proximity effect), times the Hammerstad–Jensen roughness factor. Treat it as an estimate within some tens of percent.');
  report.details = { ...m, fOnset: fOn, riseIpc: rise, layer };
  report.graphs = graphs(s, m.rdc);
  return report;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: TrState, rdc: number): GraphSpec[] {
  const base = inputsOf(s);
  const target = s.solveFor === 'w' || s.solveFor === 'len' ? s.r : s.solveFor === 'wV' || s.solveFor === 'lenV' ? s.vd / s.i : null;
  // 1. R vs frequency (smooth and, if given, rough)
  const fOn = skinOnset(s.t, base.rho20 * (1 + base.alpha * (s.tC - 20)), s.ret);
  const fLo = Math.min(1e3, fOn / 100);
  const fHi = Math.max(1e10, s.f * 10);
  const fs = logspace(fLo, fHi, 160);
  const rOf = (f: number, rough: number) => traceR({ ...base, f, rough }).r;
  const rf: GraphSpec = {
    id: 'r-vs-f',
    title: 'Resistance vs frequency',
    subtitle: `${si(s.w, 'm', 3)} × ${si(s.t, 'm', 3)} × ${si(s.len, 'm', 3)} · ${{ micro: 'plane below', strip: 'planes both sides', iso: 'no plane' }[s.ret]}`,
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'r', label: 'Resistance', unit: 'Ω', log: true }],
    series: [
      { label: s.rough > 0 ? 'Smooth copper' : 'R(f)', x: fs, y: fs.map((f) => rOf(f, 0)), axis: 'r', width: 2.2 },
      ...(s.rough > 0 ? [{ label: `Δ = ${si(s.rough, 'm', 3)} rough`, x: fs, y: fs.map((f) => rOf(f, s.rough)), axis: 'r', color: '#c47b17', width: 1.6, dash: [5, 3] }] : []),
    ],
    hlines: [{ value: rdc, label: `R_dc = ${si(rdc, 'Ω', 3)}`, axis: 'r', color: '#9a8f7a', dash: [3, 3] }],
    vlines: [{ value: fOn, label: 'δ = T' + (s.ret === 'micro' ? '' : '/2'), color: '#9a8f7a', dash: [2, 3] }, ...(s.f > 0 ? [{ value: s.f, label: `f = ${si(s.f, 'Hz', 3)}` }] : [])],
    markers: s.f > 0 ? [{ x: s.f, y: s.r, axis: 'r', label: si(s.r, 'Ω', 3) }] : [],
    legend: 'below',
  };
  // 2. R and drop vs width at this length, with the target as a limit
  const wLo = Math.max(LIM.w[0], s.w / 10);
  const wHi = Math.min(LIM.w[1], s.w * 10);
  const ws = logspace(wLo, wHi, 140);
  const rw: GraphSpec = {
    id: 'r-vs-w',
    title: 'Resistance vs width',
    subtitle: `ℓ = ${si(s.len, 'm', 3)}, ${fmtF(s.f)}, ${degC(s.tC, 0)} · ΔV at ${si(s.i, 'A', 3)}`,
    x: { label: 'Trace width', unit: 'm', log: true },
    y: [
      { id: 'r', label: 'Resistance', unit: 'Ω', log: true },
      { id: 'v', label: 'Voltage drop', unit: 'V', log: true, side: 'right' },
    ],
    series: [
      { label: 'R', x: ws, y: ws.map((w) => traceR({ ...base, w }).r), axis: 'r', width: 2.2 },
      { label: 'ΔV', x: ws, y: ws.map((w) => s.i * traceR({ ...base, w }).r), axis: 'v', color: '#c47b17', width: 1.3, dash: [5, 3] },
    ],
    hlines: target != null ? [{ value: target, label: `limit ${s.solveFor.endsWith('V') ? `ΔV ${si(s.vd, 'V', 3)}` : si(s.r, 'Ω', 3)}`, axis: 'r', color: '#8b1e1e', dash: [6, 4] }] : [],
    vlines: [{ value: s.w, label: `W = ${si(s.w, 'm', 3)}` }],
    markers: [{ x: s.w, y: s.r, axis: 'r', label: si(s.r, 'Ω', 3) }],
  };
  // 3. R vs temperature
  const tLo = Math.min(-40, s.tC);
  const tHi = Math.max(150, s.tC);
  const tsAll = Array.from({ length: 81 }, (_, k) => tLo + ((tHi - tLo) * k) / 80).filter((t) => 1 + base.alpha * (t - 20) > 0);
  const rt: GraphSpec = {
    id: 'r-vs-t',
    title: 'Resistance vs temperature',
    subtitle: `${fmtF(s.f)} · α₂₀ = ${s.alpha} /°C`,
    x: { label: 'Copper temperature', unit: '°C' },
    y: [{ id: 'r', label: 'Resistance', unit: 'Ω', includeZero: true }],
    series: [{ label: 'R(T)', x: tsAll, y: tsAll.map((tC) => traceR({ ...base, tC }).r), axis: 'r', width: 2.2 }],
    vlines: [{ value: s.tC, label: `T_c = ${degC(s.tC, 0)}` }],
    markers: [{ x: s.tC, y: s.r, axis: 'r', label: si(s.r, 'Ω', 3) }],
  };
  return [rf, rw, rt];
}

export const def: CalcDef<TrState> = {
  id: 'pcb/trace-resistance',
  version: '0.1.0',
  method:
    'R = ρ(T)·ℓ/(W·T) with annealed-copper ρ₂₀ = 1.7241 µΩ·cm and α₂₀ = 0.00393 /°C (IEC 60028); AC resistance from a one-skin-depth current layer on the faces that carry the current (Johnson & Graham 1993; Bogatin 2018) times the Hammerstad–Jensen (1980) roughness factor; width or length solved by Brent root finding on that model; heating estimate from the IPC-2221 curve.',
  fields,
  defaults,
  solve: {
    default: 'r',
    analysis: 'r',
    options: [
      { key: 'r', label: 'Resistance, drop and loss of the trace' },
      { key: 'w', label: 'Minimum width for a maximum resistance R' },
      { key: 'len', label: 'Maximum length for a maximum resistance R' },
      { key: 'wV', label: 'Minimum width for a maximum drop ΔV at I' },
      { key: 'lenV', label: 'Maximum length for a maximum drop ΔV at I' },
    ],
  },
  compute,
  sync: (s) => {
    for (const [k, uk, table, on] of [['w', 'wUnit', U_LEN_PCB, s.solveFor === 'w' || s.solveFor === 'wV'], ['len', 'lenUnit', U_LEN, s.solveFor === 'len' || s.solveFor === 'lenV']] as const) if (on) fitImperial(s, k, uk, table);
    const n = WEIGHTS[s.cuWeight];
    if (n && Math.abs(n * OZ - s.t) > 1e-9 * s.t) s.cuWeight = 'Custom';
    if (s.cuWeight === 'Custom') for (const [k, v] of Object.entries(WEIGHTS)) if (Math.abs(v * OZ - s.t) <= 1e-9 * s.t) s.cuWeight = k;
  },
  examples: [
    { id: 'default', label: '0.5 mm × 100 mm, 1 oz outer trace at 1 A (DC)', state: defaults() },
    {
      id: 'sense-drop',
      label: 'Longest 0.25 mm, ½ oz trace for a 50 mV drop at 0.5 A',
      state: { solveFor: 'lenV', w: 0.25e-3, wUnit: 'mm', cuWeight: '½ oz (17 µm)', t: 0.5 * OZ, tUnit: 'oz', i: 0.5, tC: 40, f: 0, vd: 50e-3, vdUnit: 'mV', len: 50e-3, lenUnit: 'mm', ret: 'micro', rough: 0 },
    },
    {
      id: 'rail-width',
      label: '5 A rail, 2 oz, 80 mm: width for 50 mV drop at 60 °C',
      state: { solveFor: 'wV', len: 80e-3, lenUnit: 'mm', cuWeight: '2 oz (70 µm)', t: 2 * OZ, tUnit: 'oz', i: 5, tC: 60, f: 0, vd: 50e-3, vdUnit: 'mV', w: 3e-3, wUnit: 'mm', ret: 'micro', rough: 0 },
    },
    {
      id: 'buck-ac',
      label: 'Buck switch node at 2 MHz: skin effect in 2 oz copper',
      state: { solveFor: 'r', w: 2e-3, wUnit: 'mm', len: 20e-3, lenUnit: 'mm', cuWeight: '2 oz (70 µm)', t: 2 * OZ, tUnit: 'oz', i: 3, tC: 70, f: 2e6, fUnit: 'MHz', ret: 'micro', rough: 1e-6, roughUnit: 'µm' },
    },
    {
      id: 'rf-rough',
      label: '5 GHz stripline: skin depth and copper roughness',
      state: { solveFor: 'r', w: 0.15e-3, wUnit: 'mm', len: 50e-3, lenUnit: 'mm', cuWeight: '½ oz (17 µm)', t: 0.5 * OZ, tUnit: 'oz', i: 0.02, tC: 25, f: 5e9, fUnit: 'GHz', ret: 'strip', rough: 1.5e-6, roughUnit: 'µm' },
    },
    {
      id: 'shunt-r',
      label: 'Width for a 10 mΩ, 30 mm current-sense trace (1 oz)',
      state: { solveFor: 'w', len: 30e-3, lenUnit: 'mm', cuWeight: '1 oz (35 µm)', t: OZ, tUnit: 'oz', i: 2, tC: 25, f: 0, r: 10e-3, rUnit: 'mΩ', w: 1e-3, wUnit: 'mm', ret: 'micro', rough: 0 },
    },
  ],
};
