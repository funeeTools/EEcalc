/** Edge-coupled embedded microstrip pair — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { ACCURACY, C0, CHECKED, coupledPair, singleStrip, type PairInputs, type PairResult } from './model';

export const ID = 'pcb/edge-coupled-embedded';

/** Substrate presets: design Dk from manufacturer data sheets (~1 GHz). */
export const MATERIALS: Record<string, number | null> = {
  Custom: null,
  'FR-4 (generic)': 4.3,
  'FR-4 high-Tg (IS410)': 4.0,
  'Megtron 6': 3.4,
  RO4350B: 3.66,
  RO4003C: 3.55,
  'Polyimide (Kapton HN)': 3.4,
};

/** Cover presets: 'same' follows the substrate εr. */
export const COVERS: Record<string, number | null> = {
  'Same as substrate': null,
  'FR-4 prepreg (4.2)': 4.2,
  'LPI solder mask (3.5)': 3.5,
  Custom: null,
};

export interface EceState {
  solveFor: 'zdiff' | 'w' | 's';
  zdiff: number;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
  h: number;
  hUnit: string;
  h2: number;
  h2Unit: string;
  t: number;
  tUnit: string;
  material: string;
  er: number;
  cover: string;
  erc: number;
  f: number;
  fUnit: string;
}

export const defaults = (): EceState => ({
  solveFor: 'w',
  zdiff: 100,
  w: 0.15e-3,
  wUnit: 'mm',
  s: 0.2e-3,
  sUnit: 'mm',
  h: 0.2e-3,
  hUnit: 'mm',
  h2: 0.1e-3,
  h2Unit: 'mm',
  t: 17.5e-6,
  tUnit: 'µm',
  material: 'FR-4 (generic)',
  er: 4.3,
  cover: 'Same as substrate',
  erc: 4.3,
  f: 5e9,
  fUnit: 'GHz',
});

const DIM_MIN = 1e-6;
const DIM_MAX = 0.05;
const Z_MIN = 1;
const Z_MAX = 1000;
/** Search span for W and S, relative to H (the model stays finite well past Kirschning–Jansen’s 0.1–10). */
const RATIO_MIN = 0.01;
const RATIO_MAX = 40;

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Pair geometry',
    note: 'Pair on a substrate over one plane, buried under a dielectric cover. Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'zdiff', symbol: 'Z_diff', label: 'Diff. impedance', unit: 'Ω', solvable: true, min: Z_MIN, max: Z_MAX, help: 'Target Zdiff = 2·Z₀ₒ when solving for W or S; otherwise the calculated result.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: DIM_MIN, max: DIM_MAX },
      { kind: 'number', key: 's', symbol: 'S', label: 'Edge gap', units: U_LEN_PCB, unitKey: 'sUnit', solvable: true, min: DIM_MIN, max: DIM_MAX, help: 'Spacing between the facing edges of the two traces (not the centre-to-centre pitch).' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 1e-3, help: '½ oz ≈ 17.5 µm, 1 oz ≈ 35 µm (choose "oz" to type ounces).' },
    ],
  },
  {
    kind: 'section',
    title: 'Dielectrics',
    fields: [
      { kind: 'number', key: 'h', symbol: 'H', label: 'Height to plane', units: U_LEN_PCB, unitKey: 'hUnit', min: DIM_MIN, max: DIM_MAX, help: 'Substrate (core or prepreg) between the bottom of the traces and the reference plane.' },
      {
        kind: 'select',
        key: 'material',
        label: 'Substrate',
        options: Object.keys(MATERIALS),
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m != null) s.er = m;
          if (s.cover === 'Same as substrate') s.erc = s.er;
        },
        help: 'Fills εr with a typical design Dk. Use the value from your fabricator’s stack-up.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Substrate εr', min: 1, max: 18, help: 'Relative permittivity (Dk) below the traces.' },
      { kind: 'number', key: 'h2', symbol: 'H₂', label: 'Cover above copper', units: U_LEN_PCB, unitKey: 'h2Unit', min: 0, max: DIM_MAX, help: 'Dielectric over the top of the traces (it also fills the gap between them). 0 = cover only up to the copper top. Air is above the cover.' },
      {
        kind: 'select',
        key: 'cover',
        label: 'Cover',
        options: Object.keys(COVERS),
        apply: (v, s) => {
          const c = COVERS[v];
          if (v === 'Same as substrate') s.erc = s.er;
          else if (c != null) s.erc = c;
        },
        help: 'Same as substrate: a trace buried in one dielectric (prepreg over core of the same Dk). Solder mask is really conformal; the model treats it as a flat layer.',
      },
      { kind: 'number', key: 'erc', symbol: 'ε_rc', label: 'Cover εr', min: 1, max: 18, help: 'Relative permittivity of the cover. Typing a value selects Custom.' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency',
    collapsed: true,
    fields: [{ kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Only sets the wavelength results; the impedances are static (quasi-TEM).' }],
  },
];

const LABEL: Record<EceState['solveFor'], string> = { zdiff: 'Differential impedance', w: 'Trace width', s: 'Edge-to-edge gap' };
const SYM: Record<EceState['solveFor'], string> = { zdiff: 'Z_diff', w: 'W', s: 'S' };
const fLen = (m: number) => si(m, 'm', 4);
const fZ = (z: number) => si(z, 'Ω', 4);
const mil = (m: number) => `${(m / 25.4e-6).toFixed(2)} mil`;
const pct = (r: readonly [number, number]) => `${r[0] >= 0 ? '+' : '−'}${Math.abs(r[0]).toFixed(1)} … ${r[1] >= 0 ? '+' : '−'}${Math.abs(r[1]).toFixed(1)} %`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: EceState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function fail(msg: string, s: EceState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

export const inputsOf = (s: EceState): PairInputs => ({ w: s.w, s: s.s, h: s.h, t: s.t, er: s.er, h2: s.h2, erc: s.erc });

/*
 * Mode-switch harness: its "error-after-edit" flags are all typed numbers (×10, ÷10, min, max) that leave the model
 * range (W/H, S/H outside 0.01–40, T > H) or ask for an impossible Zdiff (above 2·Z₀ of a single trace when solving S);
 * those are red errors on purpose and say what to change. Setting switches and examples produce none.
 */
function rangeFor(s: EceState): { lo: number; hi: number } {
  return { lo: Math.max(RATIO_MIN * s.h, DIM_MIN), hi: Math.min(RATIO_MAX * s.h, DIM_MAX) };
}

/** Solve Zdiff(x) = target for x = W or S (Zdiff falls with W, rises with S). */
export function solveDim(s: EceState, key: 'w' | 's', target: number): { ok: true; x: number } | { ok: false; closest: number; closestZ: number; lo: number; hi: number } {
  const r = rangeFor(s);
  const g = (x: number) => coupledPair({ ...inputsOf(s), [key]: x }).zdiff;
  const inv = invert(g, target, { ...r, log: true, samples: 70 });
  for (const x of inv.roots) if (Math.abs(g(x) / target - 1) < 1e-9) return { ok: true, x };
  return { ok: false, closest: inv.closest, closestZ: inv.closestValue, ...r };
}

function run(st: EceState): CalcReport {
  const s: EceState = { ...st };
  const k = s.solveFor;
  if (s.cover === 'Same as substrate') s.erc = s.er;
  const t = finite('Copper thickness', s.t);
  const h = finite('Height to plane', s.h);
  const h2 = finite('Cover thickness', s.h2);
  const er = finite('Substrate εr', s.er);
  const erc = finite('Cover εr', s.erc);
  finite('Frequency', s.f);
  if (!(h > 0)) throw new Error('Height to plane must be > 0.');
  if (t < 0 || h2 < 0) throw new Error('Copper and cover thickness must be ≥ 0.');
  if (!(er >= 1) || !(erc >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(s.f > 0)) throw new Error('Frequency must be > 0.');
  for (const key of ['w', 's'] as const) if (key !== k && !(finite(LABEL[key], s[key]) > 0)) throw new Error(`${LABEL[key]} must be > 0.`);
  if (k !== 'zdiff' && !(finite('Target Zdiff', s.zdiff) > 0)) throw new Error('Target Zdiff must be > 0.');
  for (const key of ['w', 's'] as const) {
    if (key === k) continue;
    const u = s[key] / h;
    if (u > RATIO_MAX || u < RATIO_MIN) throw new Error(`${LABEL[key]} is ${u > 1 ? 'more' : 'less'} than ${u > 1 ? RATIO_MAX : RATIO_MIN}× the height to the plane: outside the model range. Check the units.`);
  }
  if (t / h > 1) throw new Error(`T/H = ${(t / h).toFixed(2)}: copper thicker than the substrate is outside the model range (the thickness correction is a thin-strip approximation).`);

  if (k !== 'zdiff') {
    const r = solveDim(s, k, s.zdiff);
    if (!r.ok) {
      const how = Number.isFinite(r.closestZ) && r.closestZ > 0 ? ` The closest is ${fZ(r.closestZ)} at ${SYM[k]} = ${fLen(r.closest)}.` : '';
      if (k === 's' && Number.isFinite(r.closestZ) && r.closestZ < s.zdiff && Math.abs(r.closestZ / (2 * singleStrip(inputsOf(s)).z) - 1) < 0.01)
        return fail(`Zdiff = ${fZ(s.zdiff)} is above 2·Z₀ of a single trace (${fZ(2 * singleStrip(inputsOf(s)).z)}), the limit as the gap opens: no gap reaches it. Narrow the traces or raise H.${how}`, s);
      const lever = k === 'w' ? 'Zdiff falls as W grows: change S, H or the cover.' : 'Zdiff rises with S towards 2·Z₀ of a single trace and cannot exceed it: narrow the traces or raise H.';
      return fail(`No ${SYM[k]} between ${fLen(r.lo)} and ${fLen(r.hi)} gives Zdiff = ${fZ(s.zdiff)}.${how} ${lever}`, s);
    }
    s[k] = r.x;
  }
  const o = coupledPair(inputsOf(s));
  if (k === 'zdiff') {
    if (!(o.zdiff >= Z_MIN && o.zdiff <= Z_MAX)) return fail(`Zdiff = ${fZ(o.zdiff)} is outside ${Z_MIN}–${Z_MAX} Ω, the range of the impedance field: check the dimensions and units.`, s);
    s.zdiff = o.zdiff;
  }
  return report(s, o);
}

function inChecked(s: EceState): boolean {
  const u = s.w / s.h;
  const g = s.s / s.h;
  return u >= CHECKED.uMin && u <= CHECKED.uMax && g >= CHECKED.gMin && g <= CHECKED.gMax && s.t / s.h <= CHECKED.tMax && s.h2 / s.h <= CHECKED.h2Max;
}

function report(s: EceState, o: PairResult): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const u = s.w / s.h;
  const g = s.s / s.h;
  const single = singleStrip(inputsOf(s));
  const bare = coupledPair({ ...inputsOf(s), h2: 0, erc: 1 });
  const checked = inChecked(s);
  const w = rep.warnings;

  // ── validity: Kirschning–Jansen range, the field-solver check range, geometry plausibility
  if (checked && !(g >= ACCURACY.core.gMin && s.t / s.h <= ACCURACY.core.tMax))
    rep.notes.push(`${g < ACCURACY.core.gMin ? `S < ${ACCURACY.core.gMin}H` : `T > ${ACCURACY.core.tMax}H`}: outside the model’s best region, so its error band is wider (Zdiff ${pct(ACCURACY.all.zdiff)}). Confirm critical designs with a field solver.`);
  if (u < 0.1 || u > 10 || g < 0.1 || g > 10) w.push(`W/H = ${u.toPrecision(3)}, S/H = ${g.toPrecision(3)}: outside the Kirschning–Jansen range (0.1–10 for both). The page extrapolates; confirm with a 2-D field solver.`);
  else if (!checked) w.push(`Outside the range checked against a field solver (W/H ${CHECKED.uMin}–${CHECKED.uMax}, S/H ${CHECKED.gMin}–${CHECKED.gMax}, T/H ≤ ${CHECKED.tMax}, H₂/H ≤ ${CHECKED.h2Max}): the error band below is not guaranteed here.`);
  if (s.er > 18 || s.erc > 18) w.push('εr above 18 is outside the Kirschning–Jansen range.');
  if (s.t > 0 && s.t > s.s) w.push('The gap is narrower than the copper is thick: etching will not reproduce it, and the side-wall coupling dominates. Use a field solver.');
  if (s.cover === 'LPI solder mask (3.5)' || (s.h2 > 0 && s.h2 < 0.05e-3 && s.erc < 3.8 && s.erc > 3)) rep.notes.push('Solder mask is conformal: thinner on top of the traces and thicker in the gap than a flat layer. The flat-cover model is a first estimate; mask typically lowers Zdiff by 2–8 Ω.');
  const weak = Math.abs(o.zdiff / (2 * single.z) - 1);
  if (weak < 0.02) rep.notes.push(`Loosely coupled: Zdiff is within ${(weak * 100).toFixed(1)} % of 2·Z₀ of a single trace, so the gap hardly matters.`);
  if (o.zdiff < 70 || o.zdiff > 130) rep.notes.push(`Zdiff = ${fZ(o.zdiff)} is outside the 85–100 Ω used by most serial links.`);

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const core = checked && g >= ACCURACY.core.gMin && s.t / s.h <= ACCURACY.core.tMax;
  const acc = core ? ACCURACY.core : ACCURACY.all;
  const band = checked ? ` · ${pct(acc.zdiff)} vs field solver` : '';
  const prim: ResultItem[] = [];
  if (k === 'w' || k === 's') prim.push(item(k, LABEL[k], s[k], 'm', fLen(s[k]), { symbol: SYM[k], solved: true, primary: true, note: `${mil(s[k])} · ${SYM[k]}/H = ${(s[k] / s.h).toPrecision(4)}` }));
  prim.push(item('zdiff', 'Differential impedance', o.zdiff, 'Ω', fZ(o.zdiff), { symbol: 'Z_diff', primary: true, solved: k === 'zdiff', note: `2·Z₀ₒ${band}` }));
  prim.push(item('zcm', 'Common-mode impedance', o.zcm, 'Ω', fZ(o.zcm), { symbol: 'Z_cm', primary: true, note: `Z₀ₑ/2${checked ? ` · ${pct(acc.zcm)}` : ''}` }));
  prim.push(item('zodd', 'Odd-mode impedance', o.zo, 'Ω', fZ(o.zo), { symbol: 'Z₀ₒ', primary: true }));
  prim.push(item('zeven', 'Even-mode impedance', o.ze, 'Ω', fZ(o.ze), { symbol: 'Z₀ₑ', primary: true }));
  const tpdO = Math.sqrt(o.eo) / C0;
  const tpdE = Math.sqrt(o.ee) / C0;
  const lam = 1 / (tpdO * s.f);
  const sec: ResultItem[] = [
    item('eeffOdd', 'Odd-mode εeff', o.eo, '', o.eo.toFixed(4), { symbol: 'ε_eff,o', group: 'Modes', note: `bare pair ${o.eoBare.toFixed(3)}` }),
    item('eeffEven', 'Even-mode εeff', o.ee, '', o.ee.toFixed(4), { symbol: 'ε_eff,e', group: 'Modes', note: `bare pair ${o.eeBare.toFixed(3)}` }),
    item('tpdOdd', 'Delay, odd mode', tpdO, 's/m', `${si(tpdO * 1e-3, 's', 4)}/mm`, { symbol: 't_pd,o', group: 'Modes', note: 'the differential signal' }),
    item('tpdEven', 'Delay, even mode', tpdE, 's/m', `${si(tpdE * 1e-3, 's', 4)}/mm`, { symbol: 't_pd,e', group: 'Modes', note: 'common-mode noise' }),
    item('modeSkew', 'Mode velocity mismatch', tpdE - tpdO, 's/m', `${si(Math.abs(tpdE - tpdO) * 1e-3, 's', 3)}/mm`, { symbol: 'Δt_pd', group: 'Modes', note: Math.abs(o.ee - o.eo) / o.ee < 0.01 ? 'modes nearly matched: little far-end crosstalk' : 'unequal modes cause far-end crosstalk and mode conversion' }),
    item('zsingle', 'Single trace alone', single.z, 'Ω', fZ(single.z), { symbol: 'Z₀', group: 'Coupling', note: `same trace without its partner · εeff ${single.eeff.toFixed(3)}` }),
    item('kb', 'Coupling coefficient', o.k, '', o.k.toFixed(4), { symbol: 'k', group: 'Coupling', note: '(Z₀ₑ − Z₀ₒ)/(Z₀ₑ + Z₀ₒ)' }),
    item('zdiffBare', 'Zdiff without cover', bare.zdiff, 'Ω', fZ(bare.zdiff), { symbol: 'Z_diff,bare', group: 'Cover', note: `the cover lowers Zdiff by ${fZ(bare.zdiff - o.zdiff)}` }),
    item('qc', 'Cover filling factor', o.qc, '', o.qc.toFixed(4), { symbol: 'q_c', group: 'Cover', note: '1 − exp(−2(H₂ + T)/H): share of the air field the cover takes' }),
    item('lambdaG', `Wavelength at ${si(s.f, 'Hz')}`, lam, 'm', fLen(lam), { symbol: 'λ_g', group: 'Cover', note: `odd mode · λ/4 = ${fLen(lam / 4)}` }),
    item('pitch', 'Centre-to-centre pitch', s.w + s.s, 'm', fLen(s.w + s.s), { symbol: 'p', group: 'Ratios' }),
    item('wOverH', 'Width / height', u, '', u.toPrecision(4), { symbol: 'W/H', group: 'Ratios' }),
    item('sOverH', 'Gap / height', g, '', g.toPrecision(4), { symbol: 'S/H', group: 'Ratios' }),
    item('h2OverH', 'Cover / height', s.h2 / s.h, '', (s.h2 / s.h).toPrecision(4), { symbol: 'H₂/H', group: 'Ratios' }),
  ];
  rep.results = [...prim, ...sec];
  rep.summary = `W/H ${u.toPrecision(3)} · S/H ${g.toPrecision(3)} · H₂/H ${(s.h2 / s.h).toPrecision(3)} · εr ${s.er} / cover ${s.erc} · k = ${o.k.toFixed(3)}`;
  rep.notes.push(
    `Static (quasi-TEM): Kirschning–Jansen coupled microstrip with Jansen’s even-mode and Cohn’s odd-mode thickness terms and the embedded-microstrip (Wadell) cover correction applied per mode. Against a 2-D field solution over ${ACCURACY.cases} cross-sections (see Accuracy in the theory): Zdiff ${pct(ACCURACY.core.zdiff)} for S ≥ ${ACCURACY.core.gMin}H and T ≤ ${ACCURACY.core.tMax}H, ${pct(ACCURACY.all.zdiff)} over the whole checked range.`,
    'Not modelled: trapezoidal etch, resin-rich layers around the traces, glass-weave skew, and frequency dispersion (the mode εeff rise slowly with frequency).',
  );
  rep.details = { ...o, single, bare, checked, inputs: inputsOf(s) };
  rep.graphs = graphs(s, o);
  rep.tables = [targetsTable(s)];
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: EceState, o: PairResult): GraphSpec[] {
  const p = inputsOf(s);
  const r = rangeFor(s);
  const ws = [...logspace(Math.max(Math.min(0.1 * s.h, s.w / 3), r.lo), Math.min(Math.max(3 * s.h, s.w * 3), r.hi), 90), s.w].sort((a, b) => a - b);
  const zw = ws.map((w) => coupledPair({ ...p, w }));
  const sw = ws.map((w) => singleStrip({ ...p, w }).z);
  const hs = Array.from({ length: 81 }, (_, i) => (i / 80) * Math.max(3 * s.h, 1.5 * s.h2));
  if (!hs.includes(s.h2)) hs.push(s.h2);
  hs.sort((a, b) => a - b);
  const zh = hs.map((h2) => coupledPair({ ...p, h2 }));
  const ss = [...logspace(Math.max(Math.min(0.1 * s.h, s.s / 3), r.lo), Math.min(Math.max(5 * s.h, s.s * 3), r.hi), 90), s.s].sort((a, b) => a - b);
  const zs = ss.map((g) => coupledPair({ ...p, s: g }));
  const target = s.solveFor === 'zdiff' ? [] : [{ value: s.zdiff, label: `target ${fZ(s.zdiff)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }];
  return [
    {
      id: 'zdiff-vs-w',
      title: 'Zdiff vs width',
      x: { label: 'Trace width W', unit: 'm', log: true },
      y: [{ id: 'z', label: 'Impedance', unit: 'Ω' }],
      series: [
        { label: 'Z_diff', x: ws, y: zw.map((q) => q.zdiff), axis: 'z', width: 2.2 },
        { label: '2·Z₀ single', x: ws, y: sw.map((z) => 2 * z), axis: 'z', color: '#9a8f7a', width: 1.2, dash: [5, 3] },
        { label: 'Z_cm', x: ws, y: zw.map((q) => q.zcm), axis: 'z', color: '#c47b17', width: 1.4 },
      ],
      hlines: target,
      vlines: [{ value: s.w, label: `W = ${fLen(s.w)}`, color: '#9a8f7a' }],
      markers: [{ x: s.w, y: o.zdiff, axis: 'z', label: fZ(o.zdiff) }],
    },
    {
      id: 'cover',
      title: 'Effect of the cover',
      subtitle: `cover εr = ${s.erc} · H₂ = 0 still fills the gap up to the copper top`,
      x: { label: 'Cover above copper H₂', unit: 'm' },
      y: [
        { id: 'z', label: 'Impedance', unit: 'Ω' },
        { id: 'e', label: 'εeff', unit: '', side: 'right' },
      ],
      series: [
        { label: 'Z_diff', x: hs, y: zh.map((q) => q.zdiff), axis: 'z', width: 2.2 },
        { label: 'εeff odd', x: hs, y: zh.map((q) => q.eo), axis: 'e', color: '#1f4e5f', width: 1.3, dash: [5, 3] },
        { label: 'εeff even', x: hs, y: zh.map((q) => q.ee), axis: 'e', color: '#c47b17', width: 1.3, dash: [5, 3] },
      ],
      hlines: target,
      vlines: [{ value: s.h2, label: `H₂ = ${fLen(s.h2)}`, color: '#9a8f7a' }],
      markers: [{ x: s.h2, y: o.zdiff, axis: 'z', label: fZ(o.zdiff) }],
    },
    {
      id: 'modes-vs-s',
      title: 'Coupling vs gap',
      subtitle: `W = ${fLen(s.w)}, H = ${fLen(s.h)}`,
      x: { label: 'Edge gap S', unit: 'm', log: true },
      y: [
        { id: 'z', label: 'Impedance', unit: 'Ω' },
        { id: 'k', label: 'Coupling k', unit: '%', side: 'right', includeZero: true },
      ],
      series: [
        { label: 'Z₀ₑ', x: ss, y: zs.map((q) => q.ze), axis: 'z', color: '#c47b17', width: 1.8 },
        { label: 'Z₀ₒ', x: ss, y: zs.map((q) => q.zo), axis: 'z', color: '#1f4e5f', width: 2.2 },
        { label: 'k (%)', x: ss, y: zs.map((q) => 100 * q.k), axis: 'k', color: '#6b5b95', width: 1.4, dash: [6, 3] },
      ],
      vlines: [{ value: s.s, label: `S = ${fLen(s.s)}`, color: '#9a8f7a' }],
      markers: [{ x: s.s, y: o.zo, axis: 'z', label: fZ(o.zo) }],
    },
  ];
}

function targetsTable(s: EceState): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  for (const [name, z] of [['PCIe / DDR5', 85], ['USB 2/3', 90], ['Ethernet, LVDS, HDMI', 100]] as const) {
    const r = solveDim(s, 'w', z);
    if (r.ok) {
      const o = coupledPair({ ...inputsOf(s), w: r.x });
      rows.push({ use: name, zdiff: z, w: r.x, zcm: o.zcm, k: o.k });
      display.push({ use: name, zdiff: fZ(z), w: `${fLen(r.x)} (${mil(r.x)})`, zcm: fZ(o.zcm), k: o.k.toFixed(3) });
    } else {
      rows.push({ use: name, zdiff: z, w: null, zcm: null, k: null });
      display.push({ use: name, zdiff: fZ(z), w: 'not reachable', zcm: '—', k: '—' });
    }
  }
  return {
    id: 'targets',
    title: 'Trace width for common targets',
    columns: [
      { key: 'use', label: 'Interface', align: 'left' },
      { key: 'zdiff', label: 'Z_diff', unit: 'Ω' },
      { key: 'w', label: 'W', unit: 'm' },
      { key: 'zcm', label: 'Z_cm', unit: 'Ω' },
      { key: 'k', label: 'k' },
    ],
    rows,
    display,
    note: `At S = ${fLen(s.s)}, H = ${fLen(s.h)}, H₂ = ${fLen(s.h2)}, T = ${fLen(s.t)}, εr = ${s.er}, cover εr = ${s.erc}. Interface impedances are nominal; check the specification for tolerance.`,
  };
}

export const def: CalcDef<EceState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Kirschning & Jansen (1984) static coupled-microstrip even/odd εeff and impedances with Hammerstad–Jensen (1980) single-strip functions; thickness by Jansen’s (1978) even-mode widening and Cohn’s (1955) odd-mode gap capacitance 2εT/S; the embedded-microstrip burial correction attributed to Wadell (1991, as restated in pcb-toolkit) in filling-factor form per mode. Accuracy stated from a 2-D field-solver comparison (400 cross-sections). Zdiff = 2Z₀ₒ, Zcm = Z₀ₑ/2; solve-for by bracketed Brent root finding.',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'zdiff',
    options: [
      { key: 'zdiff', label: 'Zdiff from geometry (analysis)' },
      { key: 'w', label: 'Trace width W for a target Zdiff' },
      { key: 's', label: 'Gap S for a target Zdiff' },
    ],
  },
  compute,
  sync: (s) => {
    // A solved W or S below 0.01 in would read "0.00065 in" ('in' has no prefixes): show it in mil instead.
    for (const k of ['w', 's'] as const) {
      const uk = `${k}Unit` as 'wUnit' | 'sUnit';
      if (s.solveFor === k && s[uk] === 'in' && s[k] < 0.01 * 0.0254) s[uk] = 'mil';
    }
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
    if (s.cover === 'Same as substrate') s.erc = s.er;
    else {
      const c = COVERS[s.cover];
      if (c != null && Math.abs(c - s.erc) > 1e-9) s.cover = 'Custom';
    }
    if (!(s.cover in COVERS)) s.cover = 'Custom';
  },
  examples: [
    { id: 'default', label: '100 Ω pair buried 0.1 mm under FR-4 prepreg (solve W)', state: defaults() },
    { id: 'bare', label: 'Same pair, no cover (H₂ = 0, air): bare microstrip', state: { ...defaults(), solveFor: 'zdiff', w: 0.15e-3, h2: 0, cover: 'Custom', erc: 1 } },
    { id: 'mask', label: 'Outer-layer USB 90 Ω under 25 µm solder mask (solve W)', state: { ...defaults(), solveFor: 'w', zdiff: 90, s: 0.15e-3, h: 0.1e-3, h2: 25e-6, t: 35e-6, material: 'FR-4 (generic)', er: 4.3, cover: 'LPI solder mask (3.5)', erc: 3.5 } },
    { id: 'pcie-gap', label: 'PCIe 85 Ω: gap for 0.12 mm traces, Megtron 6 (solve S)', state: { ...defaults(), solveFor: 's', zdiff: 85, w: 0.12e-3, h: 0.1e-3, h2: 0.08e-3, t: 17.5e-6, material: 'Megtron 6', er: 3.4, cover: 'Same as substrate', erc: 3.4, f: 8e9 } },
    { id: 'analyse-200', label: 'Analyse: W = S = H = 200 µm, 1 oz, 25 µm cover εr 3.5', state: { ...defaults(), solveFor: 'zdiff', w: 200e-6, wUnit: 'µm', s: 200e-6, sUnit: 'µm', h: 200e-6, hUnit: 'µm', h2: 25e-6, h2Unit: 'µm', t: 35e-6, material: 'Custom', er: 4.2, cover: 'Custom', erc: 3.5 } },
    { id: 'deep', label: 'Deeply buried (H₂ = 3H): close to a stripline with one plane', state: { ...defaults(), solveFor: 'zdiff', w: 0.15e-3, h2: 0.6e-3 } },
  ],
};
