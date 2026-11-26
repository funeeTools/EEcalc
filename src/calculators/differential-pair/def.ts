/** Edge-coupled microstrip differential pair — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TableSpec, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { MATERIALS } from '../controlled-impedance/def';
import { C0, type CoupledMsResult, coupledMicrostrip } from './model';

export const ID = 'pcb/differential-pair';

export interface DiffPairState {
  solveFor: 'zdiff' | 'w' | 's' | 'h';
  zdiff: number;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
  h: number;
  hUnit: string;
  t: number;
  tUnit: string;
  material: string;
  er: number;
  f: number;
  fUnit: string;
}

/** Top-layer 100 Ω pair over 0.2 mm prepreg to the first plane of a 4-layer 1.6 mm board. */
export const defaults = (): DiffPairState => ({
  solveFor: 'w',
  zdiff: 100,
  w: 0.2e-3,
  wUnit: 'mm',
  s: 0.2e-3,
  sUnit: 'mm',
  h: 0.2e-3,
  hUnit: 'mm',
  t: 35e-6,
  tUnit: 'µm',
  material: 'FR-4 prepreg (~1 GHz)',
  er: 4.2,
  f: 5e9,
  fUnit: 'GHz',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Pair geometry',
    note: 'Two traces on the outer layer over one plane. Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'zdiff', symbol: 'Z_diff', label: 'Diff. impedance', unit: 'Ω', solvable: true, min: 1, max: 1000, help: 'Target Zdiff = 2·Z₀ₒ when solving for W, S or H; otherwise the calculated result.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: 1e-6, max: 0.05 },
      { kind: 'number', key: 's', symbol: 'S', label: 'Edge gap', units: U_LEN_PCB, unitKey: 'sUnit', solvable: true, min: 1e-6, max: 0.05, help: 'Spacing between the facing edges of the two traces (not the centre-to-centre pitch).' },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Dielectric height', units: U_LEN_PCB, unitKey: 'hUnit', solvable: true, min: 1e-6, max: 0.05, help: 'Laminate between the traces and the reference plane below.' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 0.5e-3, help: '½ oz ≈ 17.5 µm, 1 oz ≈ 35 µm (choose "oz" to type ounces). Plated outer layers finish thicker than the base foil.' },
    ],
  },
  {
    kind: 'section',
    title: 'Substrate',
    fields: [
      {
        kind: 'select',
        key: 'material',
        label: 'Laminate preset',
        options: Object.keys(MATERIALS),
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m != null) s.er = m;
        },
        help: 'Fills εr with a typical design value. Use your fabricator’s stack-up Dk for the actual glass style and resin content.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 18, help: 'Relative permittivity of the laminate. The Kirschning–Jansen equations are fitted for 1 ≤ εr ≤ 18.' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency',
    fields: [{ kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets the wavelength results and the surface-wave check; the impedances are static (quasi-TEM).' }],
  },
];

type Key = Exclude<DiffPairState['solveFor'], 'zdiff'>;
const LABEL: Record<DiffPairState['solveFor'], string> = { zdiff: 'Differential impedance', w: 'Trace width', s: 'Edge gap', h: 'Dielectric height' };
const SYM: Record<DiffPairState['solveFor'], string> = { zdiff: 'Z_diff', w: 'W', s: 'S', h: 'H' };
const DIM_MIN = 1e-6;
const DIM_MAX = 0.05;
/** Search limits in W/H and S/H (twice beyond the KJ fit range each way, which the page warns about). */
const U_MIN = 0.02;
const U_MAX = 50;

const fLen = (m: number) => si(m, 'm', 4);
const fZ = (z: number) => si(z, 'Ω', 4);
const mil = (m: number) => `${(m / 25.4e-6).toFixed(2)} mil`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

const run1 = (s: DiffPairState) => coupledMicrostrip(s.w, s.s, s.h, s.t, s.er);

function rangeFor(s: DiffPairState, k: Key): { lo: number; hi: number } {
  if (k === 'h') {
    const lo = Math.max(DIM_MIN, s.w / U_MAX, s.s / U_MAX);
    return { lo, hi: Math.min(DIM_MAX, s.w / U_MIN, s.s / U_MIN) };
  }
  return { lo: Math.max(DIM_MIN, U_MIN * s.h), hi: Math.min(DIM_MAX, U_MAX * s.h) };
}

export function solveKey(s: DiffPairState, k: Key, target: number): { ok: true; x: number } | { ok: false; lo: number; hi: number; zLo: number; zHi: number; closest: number; closestZ: number } {
  const r = rangeFor(s, k);
  if (!(r.hi > r.lo)) return { ok: false, ...r, zLo: NaN, zHi: NaN, closest: NaN, closestZ: NaN };
  const g = (x: number) => run1({ ...s, [k]: x }).zdiff;
  const inv = invert(g, target, { lo: r.lo, hi: r.hi, log: true, samples: 120 });
  for (const x of inv.roots) if (Math.abs(g(x) / target - 1) < 1e-9) return { ok: true, x };
  return { ok: false, ...r, zLo: g(r.lo), zHi: g(r.hi), closest: inv.closest, closestZ: inv.closestValue };
}

export function compute(st: DiffPairState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness notes (style guide §12.3):
 *  • error-after-edit on a typed number (target ×10, a dimension at its field min/max) is a genuine NO SOLUTION or
 *    out-of-model input: the user typed a value no geometry in range can meet, and the message says what to change.
 *  • "unreadable" with a unit the user picked (e.g. a solved 25 µm gap shown in inches): the inch entry has no
 *    prefixed forms for the core to move to; the value is right and the user chose the unit.
 *  • roundtrip after H is typed far below W and S (W/H, S/H ≈ 26): outside the Kirschning–Jansen fit (0.1–10,
 *    warned), where Zdiff(S) is no longer monotonic, so another S meets the same Zdiff.
 */
function fail(msg: string, s: DiffPairState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function run(st: DiffPairState): CalcReport {
  const s: DiffPairState = { ...st };
  const k = s.solveFor;
  for (const key of ['w', 's', 'h'] as const) if (key !== k && !(finite(LABEL[key], s[key]) > 0)) throw new Error(`${LABEL[key]} must be > 0.`);
  if (!(finite('εr', s.er) >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(finite('Copper thickness', s.t) >= 0)) throw new Error('Copper thickness must be ≥ 0.');
  if (!(finite('Frequency', s.f) > 0)) throw new Error('Frequency must be > 0.');
  if (k !== 'zdiff' && !(finite('Target Zdiff', s.zdiff) > 0)) throw new Error('Target Zdiff must be > 0.');
  const ratio = (key: 'w' | 's', v: number) => {
    if (v / s.h > U_MAX || v / s.h < U_MIN) throw new Error(`${LABEL[key]}/H = ${(v / s.h).toPrecision(3)} is outside ${U_MIN}–${U_MAX}: far outside the coupled-microstrip model (fitted for 0.1–10). Check the units.`);
  };
  if (k !== 'h') for (const key of ['w', 's'] as const) if (key !== k) ratio(key, s[key]);

  if (k !== 'zdiff') {
    const r = solveKey(s, k, s.zdiff);
    if (!r.ok) {
      const span = Number.isFinite(r.zLo) && Number.isFinite(r.zHi) ? ` (${SYM[k]} = ${fLen(r.lo)} … ${fLen(r.hi)} gives ${fZ(Math.min(r.zLo, r.zHi))} … ${fZ(Math.max(r.zLo, r.zHi))})` : '';
      const lever: Record<Key, string> = {
        w: 'Zdiff falls as the traces widen: change S, H or the target.',
        s: 'Zdiff rises with the gap towards 2·Z₀ of a single trace and cannot exceed it: widen H or narrow the traces.',
        h: 'Zdiff rises with the dielectric height: change W or S.',
      };
      return fail(`No ${SYM[k]} gives Zdiff = ${fZ(s.zdiff)}${span}. ${lever[k]}`, s);
    }
    s[k] = r.x;
  }
  const o = run1(s);
  if (k === 'zdiff') {
    if (!(o.zdiff >= 1 && o.zdiff <= 1000)) return fail(`Zdiff = ${fZ(o.zdiff)} is outside 1–1000 Ω, the range of the impedance field: check the dimensions and units.`, s);
    s.zdiff = o.zdiff;
  }
  return report(s, o);
}

function report(s: DiffPairState, o: CoupledMsResult): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const w = rep.warnings;
  const notes = rep.notes;
  const u = s.w / s.h;
  const g = s.s / s.h;

  // ── validity (Kirschning–Jansen 1984 fit range; thickness check range)
  if (u < 0.1 || u > 10) w.push(`W/H = ${u.toPrecision(3)} is outside 0.1–10, the range Kirschning and Jansen fitted. Confirm with a 2-D field solver.`);
  if (g < 0.1 || g > 10) w.push(`S/H = ${g.toPrecision(3)} is outside 0.1–10, the range Kirschning and Jansen fitted. Confirm with a 2-D field solver.`);
  if (s.t / s.h > 0.2) w.push(`T/H = ${(s.t / s.h).toFixed(2)}: copper this thick relative to the dielectric is beyond the field-solver check (T/H ≤ 0.175), where Zcm already reads up to 2.7 % low.`);
  if (s.t > 0 && s.s < 1.5 * s.t) w.push(`The gap is under 1.5× the copper thickness: Jansen’s side-wall term assumes S ≫ 2T and the field-solver check stops at S ≈ 1.7T. Etching will not hold this gap either.`);
  const fTE = C0 / (4 * s.h * Math.sqrt(Math.max(s.er - 1, 1e-9)));
  if (s.er > 1 && s.f > fTE) w.push(`f is above the TE₁ surface-wave onset ≈ ${si(fTE, 'Hz', 3)} of this substrate: the quasi-static impedances no longer hold. Use a thinner substrate.`);
  const weak = Math.abs(o.zdiff / (2 * o.z0) - 1);
  if (weak < 0.02) notes.push(`Loosely coupled: Zdiff is within ${(weak * 100).toFixed(1)} % of 2·Z₀, so the gap hardly matters. A tighter gap saves space and rejects common-mode noise better.`);
  if (o.zdiff < 70 || o.zdiff > 130) notes.push(`Zdiff = ${fZ(o.zdiff)} is outside the 85–100 Ω most serial links use (USB 90 Ω, PCIe 85 Ω, Ethernet/LVDS 100 Ω).`);

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k !== 'zdiff') prim.push(item(k, LABEL[k], s[k], 'm', fLen(s[k]), { symbol: SYM[k], solved: true, primary: true, note: `${mil(s[k])} · ${SYM[k]}/H = ${(s[k] / s.h).toPrecision(4)}` }));
  const thick = s.t > 0;
  prim.push(item('zdiff', 'Differential impedance', o.zdiff, 'Ω', fZ(o.zdiff), { symbol: 'Z_diff', primary: true, solved: k === 'zdiff', note: `${k === 'zdiff' ? '2·Z₀ₒ' : 'target, 2·Z₀ₒ'} · model ${thick ? '−0.9 … +2.0 %' : '±0.2 %'}` }));
  prim.push(item('zcm', 'Common-mode impedance', o.zcm, 'Ω', fZ(o.zcm), { symbol: 'Z_cm', primary: true, note: `Z₀ₑ/2 · model ${thick ? '−3.8 … +0.4 %' : '−0.2 … +0.4 %'}` }));
  prim.push(item('zodd', 'Odd-mode impedance', o.zo, 'Ω', fZ(o.zo), { symbol: 'Z₀ₒ', primary: true }));
  prim.push(item('zeven', 'Even-mode impedance', o.ze, 'Ω', fZ(o.ze), { symbol: 'Z₀ₑ', primary: true }));

  const tpo = Math.sqrt(o.eo) / C0;
  const tpe = Math.sqrt(o.ee) / C0;
  const lam = C0 / Math.sqrt(o.eo) / s.f;
  const sec: ResultItem[] = [
    item('z0', 'Single trace alone', o.z0, 'Ω', fZ(o.z0), { symbol: 'Z₀', group: 'Coupling', note: 'same trace without its partner (Hammerstad–Jensen)' }),
    item('kb', 'Coupling coefficient', o.kb, '', o.kb.toFixed(4), { symbol: 'k', group: 'Coupling', note: o.kb > 0 ? `(Z₀ₑ−Z₀ₒ)/(Z₀ₑ+Z₀ₒ) = ${(20 * Math.log10(o.kb)).toFixed(1)} dB backward coupling` : '(Z₀ₑ−Z₀ₒ)/(Z₀ₑ+Z₀ₒ): no measurable coupling' }),
    item('zdiffFrac', 'Zdiff vs uncoupled', o.zdiff / (2 * o.z0) - 1, '', `${((o.zdiff / (2 * o.z0) - 1) * 100).toFixed(2)} %`, { symbol: 'Z_diff/2Z₀', group: 'Coupling', note: 'how much the partner lowers Zdiff' }),
    item('eodd', 'Odd-mode εeff', o.eo, '', o.eo.toPrecision(4), { symbol: 'ε_eff,o', group: 'Modes' }),
    item('eeven', 'Even-mode εeff', o.ee, '', o.ee.toPrecision(4), { symbol: 'ε_eff,e', group: 'Modes' }),
    item('tpdOdd', 'Differential delay', tpo, 's/m', `${si(tpo * 1e-3, 's', 4)}/mm`, { symbol: 't_pd,o', group: 'Modes', note: `${si(tpo * 0.0254, 's', 4)}/in` }),
    item('modeSkew', 'Even − odd delay', tpe - tpo, 's/m', `${si((tpe - tpo) * 1e-3, 's', 3)}/mm`, { symbol: 'Δt_pd', group: 'Modes', note: 'unequal mode speeds cause far-end crosstalk and mode conversion' }),
    item('lambdaG', `Odd-mode wavelength at ${si(s.f, 'Hz')}`, lam, 'm', fLen(lam), { symbol: 'λ_g', group: 'Modes' }),
    item('wOverH', 'Width / height', u, '', u.toPrecision(4), { symbol: 'W/H', group: 'Geometry' }),
    item('sOverH', 'Gap / height', g, '', g.toPrecision(4), { symbol: 'S/H', group: 'Geometry' }),
    item('pitch', 'Centre-to-centre pitch', s.w + s.s, 'm', `${fLen(s.w + s.s)} (${mil(s.w + s.s)})`, { symbol: 'p', group: 'Geometry' }),
  ];
  rep.results = [...prim, ...sec];
  rep.summary = `W/H ${u.toPrecision(3)} · S/H ${g.toPrecision(3)} · εr ${+s.er.toPrecision(4)} · k = ${o.kb.toFixed(3)} · εeff odd ${o.eo.toPrecision(3)}, even ${o.ee.toPrecision(3)}`;
  notes.push(
    'Static even/odd impedances from Kirschning & Jansen (1984) for zero thickness; copper thickness from Jansen (1978), applied to the capacitances in air and dielectric. Checked against a 2-D field solution.',
    'Bare traces: solder mask over and between the traces lowers Zdiff by several ohms (more than for a single trace, because mask fills the gap where the odd-mode field is strongest). Not modelled — ask the fabricator to include the mask in their field-solver run.',
    'Dispersion not included: above a few GHz both εeff values rise towards εr and the impedances shift by a few percent.',
  );
  rep.details = { ...o, inputs: { w: s.w, s: s.s, h: s.h, t: s.t, er: s.er } };
  rep.graphs = graphs(s, o);
  rep.tables = [targetsTable(s)];
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: DiffPairState, o: CoupledMsResult): GraphSpec[] {
  const wr = rangeFor(s, 'w');
  const ws = [...logspace(Math.max(Math.min(0.1 * s.h, s.w / 3), wr.lo), Math.min(Math.max(5 * s.h, s.w * 3), wr.hi), 90), s.w].sort((a, b) => a - b);
  const zw = ws.map((x) => coupledMicrostrip(x, s.s, s.h, s.t, s.er));
  const ss = [...logspace(Math.max(Math.min(0.1 * s.h, s.s / 3), wr.lo), Math.min(Math.max(5 * s.h, s.s * 3), wr.hi), 90), s.s].sort((a, b) => a - b);
  const zs = ss.map((x) => coupledMicrostrip(s.w, x, s.h, s.t, s.er));
  const target = s.solveFor === 'zdiff' ? [] : [{ value: s.zdiff, label: `target ${fZ(s.zdiff)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }];
  return [
    {
      id: 'zdiff-vs-w',
      title: 'Zdiff vs width',
      subtitle: `S = ${fLen(s.s)}, H = ${fLen(s.h)}`,
      x: { label: 'Trace width W', unit: 'm', log: true },
      y: [{ id: 'z', label: 'Impedance', unit: 'Ω' }],
      series: [
        { label: 'Z_diff', x: ws, y: zw.map((r) => r.zdiff), axis: 'z', width: 2.2 },
        { label: '2·Z₀ single', x: ws, y: zw.map((r) => 2 * r.z0), axis: 'z', color: '#9a8f7a', width: 1.2, dash: [5, 3] },
        { label: 'Z_cm', x: ws, y: zw.map((r) => r.zcm), axis: 'z', color: '#c47b17', width: 1.4 },
      ],
      hlines: target,
      vlines: [{ value: s.w, label: `W = ${fLen(s.w)}`, color: '#9a8f7a' }],
      markers: [{ x: s.w, y: o.zdiff, axis: 'z', label: fZ(o.zdiff) }],
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
        { label: 'Z₀ₑ', x: ss, y: zs.map((r) => r.ze), axis: 'z', color: '#c47b17', width: 1.8 },
        { label: 'Z₀ₒ', x: ss, y: zs.map((r) => r.zo), axis: 'z', color: '#1f4e5f', width: 2.2 },
        { label: 'Z₀ single', x: [ss[0], ss[ss.length - 1]], y: [o.z0, o.z0], axis: 'z', color: '#9a8f7a', width: 1, dash: [4, 3] },
        { label: 'k (%)', x: ss, y: zs.map((r) => 100 * r.kb), axis: 'k', color: '#6b5b95', width: 1.4, dash: [6, 3] },
      ],
      vlines: [{ value: s.s, label: `S = ${fLen(s.s)}`, color: '#9a8f7a' }],
      markers: [{ x: s.s, y: o.zo, axis: 'z', label: fZ(o.zo) }],
    },
  ];
}

function targetsTable(s: DiffPairState): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  for (const [name, z] of [['PCIe / DDR5', 85], ['USB 2/3', 90], ['Ethernet, LVDS, HDMI', 100]] as const) {
    const r = solveKey(s, 'w', z);
    if (r.ok) {
      const o = coupledMicrostrip(r.x, s.s, s.h, s.t, s.er);
      rows.push({ use: name, zdiff: z, w: r.x, zcm: o.zcm, kb: o.kb });
      display.push({ use: name, zdiff: fZ(z), w: `${fLen(r.x)} (${mil(r.x)})`, zcm: fZ(o.zcm), kb: o.kb.toFixed(3) });
    } else {
      rows.push({ use: name, zdiff: z, w: null, zcm: null, kb: null });
      display.push({ use: name, zdiff: fZ(z), w: 'not reachable', zcm: '—', kb: '—' });
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
      { key: 'kb', label: 'k' },
    ],
    rows,
    display,
    note: `At S = ${fLen(s.s)}, H = ${fLen(s.h)}, T = ${fLen(s.t)}, εr = ${s.er}, bare traces. Interface impedances are nominal; check the specification for tolerance.`,
  };
}

export const def: CalcDef<DiffPairState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Kirschning & Jansen (1984) static even/odd-mode impedances and permittivities of coupled microstrip, with Jansen’s (1978) finite-thickness correction applied to the air and dielectric capacitances; single line by Hammerstad–Jensen. Zdiff = 2Z₀ₒ, Zcm = Z₀ₑ/2. Checked against a 2-D field solution. Solve-for uses bracketed Brent root finding on Zdiff(x).',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'zdiff',
    options: [
      { key: 'zdiff', label: 'Zdiff from geometry (analysis)' },
      { key: 'w', label: 'Trace width W for a target Zdiff' },
      { key: 's', label: 'Gap S for a target Zdiff' },
      { key: 'h', label: 'Dielectric height H for a target Zdiff' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: '100 Ω pair on 0.2 mm prepreg, 1 oz (solve W)', state: defaults() },
    { id: 'usb-90', label: 'USB 90 Ω on 0.1 mm prepreg (solve W)', state: { ...defaults(), zdiff: 90, s: 0.15e-3, h: 0.1e-3, t: 35e-6 } },
    { id: 'pcie-85-gap', label: 'PCIe 85 Ω: gap for 0.15 mm traces', state: { ...defaults(), solveFor: 's', zdiff: 85, w: 0.15e-3, s: 0.15e-3, h: 0.1e-3, t: 35e-6 } },
    { id: 'kj-thin', label: 'Kirschning–Jansen check: W = S = H, t = 0, εr 10', state: { ...defaults(), solveFor: 'zdiff', w: 0.635e-3, s: 0.635e-3, h: 0.635e-3, t: 0, material: 'Custom', er: 10, f: 1e9 } },
    { id: 'rogers-2layer', label: '100 Ω on 0.508 mm RO4350B (solve W)', state: { ...defaults(), s: 0.25e-3, h: 0.508e-3, t: 35e-6, material: 'RO4350B', er: 3.66, f: 10e9 } },
  ],
};
