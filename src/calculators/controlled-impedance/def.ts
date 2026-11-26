/** Controlled impedance — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TableSpec, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB, U_THICK } from '@/core/unitsets';
import { ACCURACY, C0, type CiInputs, type CiResult, type Structure, analyse } from './model';

export const ID = 'pcb/controlled-impedance';

export const STRUCTURES: { value: Structure; label: string }[] = [
  { value: 'mask', label: 'Microstrip under solder mask' },
  { value: 'ms', label: 'Surface microstrip (bare)' },
  { value: 'emb', label: 'Embedded microstrip' },
  { value: 'sl', label: 'Symmetric stripline' },
  { value: 'cpwg', label: 'Grounded coplanar (CPWG)' },
];
const SNAME: Record<Structure, string> = { mask: 'Coated microstrip', ms: 'Surface microstrip', emb: 'Embedded microstrip', sl: 'Stripline', cpwg: 'CPWG' };

/** Laminate presets: typical design Dk (manufacturer data sheets, ~1–10 GHz). */
export const MATERIALS: Record<string, number | null> = {
  Custom: null,
  'FR-4 (generic)': 4.4,
  'FR-4 prepreg (~1 GHz)': 4.2,
  RO4350B: 3.66,
  RO4003C: 3.55,
  RO3003: 3.0,
  'RT/duroid 5880': 2.2,
  'Polyimide (Kapton HN)': 3.4,
  'PTFE (unfilled)': 2.1,
  'Alumina 99.6 %': 9.9,
};

export interface CiState {
  solveFor: 'z0' | 'w' | 'h' | 'er' | 'g';
  structure: Structure;
  z0: number;
  w: number;
  wUnit: string;
  g: number;
  gUnit: string;
  h: number;
  hUnit: string;
  t: number;
  tUnit: string;
  c: number;
  cUnit: string;
  erm: number;
  hc: number;
  hcUnit: string;
  erc: number;
  material: string;
  er: number;
  f: number;
  fUnit: string;
}

export const defaults = (): CiState => ({
  solveFor: 'w',
  structure: 'mask',
  z0: 50,
  w: 0.35e-3,
  wUnit: 'mm',
  g: 0.2e-3,
  gUnit: 'mm',
  h: 0.2e-3,
  hUnit: 'mm',
  t: 35e-6,
  tUnit: 'µm',
  c: 20e-6,
  cUnit: 'µm',
  erm: 3.5,
  hc: 0.1e-3,
  hcUnit: 'mm',
  erc: 4.2,
  material: 'FR-4 prepreg (~1 GHz)',
  er: 4.2,
  f: 1e9,
  fUnit: 'GHz',
});

const isMs = (s: CiState) => s.structure === 'ms' || s.structure === 'mask' || s.structure === 'emb';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Structure',
    fields: [
      {
        kind: 'select',
        key: 'structure',
        label: 'Line type',
        options: STRUCTURES,
        apply: (v: Structure, s) => {
          // the gap only exists on CPWG: keep the unknown visible
          if (v !== 'cpwg' && s.solveFor === 'g') s.solveFor = 'z0';
        },
        help: 'Outer-layer traces are microstrip (most boards cover them with solder mask); inner-layer traces between two planes are stripline; CPWG adds coplanar ground pours beside the trace.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Geometry',
    note: 'Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'z0', symbol: 'Z₀', label: 'Impedance', unit: 'Ω', solvable: true, min: 1, max: 500, help: 'Target single-ended impedance when solving for W, H, εr or G; otherwise the calculated result.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', solvable: true, min: 1e-6, max: 0.05 },
      { kind: 'number', key: 'g', symbol: 'G', label: 'Gap to ground pour', units: U_LEN_PCB, unitKey: 'gUnit', solvable: true, min: 1e-6, max: 0.05, visible: (s) => s.structure === 'cpwg', help: 'Edge-to-edge spacing from the trace to the coplanar ground copper on each side. The pours are taken as wide and stitched to the plane below.' },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Dielectric height', units: U_LEN_PCB, unitKey: 'hUnit', solvable: true, min: 1e-6, max: 0.05, help: 'Microstrip and CPWG: laminate between the trace and the plane below. Stripline: dielectric from the trace to each plane (plane spacing b = 2H + T).' },
      { kind: 'number', key: 't', symbol: 'T', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 0, max: 0.5e-3, help: '½ oz ≈ 17.5 µm, 1 oz ≈ 35 µm (choose "oz" to type ounces). Outer layers gain plating: finished 1 oz outer copper is often 45–50 µm.' },
    ],
  },
  {
    kind: 'section',
    title: 'Solder mask',
    visible: (s) => s.structure === 'mask',
    fields: [
      { kind: 'number', key: 'c', symbol: 'C', label: 'Mask thickness', units: U_THICK, unitKey: 'cUnit', min: 0, max: 0.2e-3, help: 'Conformal liquid photo-imageable mask: typically 10–25 µm over copper and 20–35 µm over bare laminate. Enter the thickness over the trace.' },
      { kind: 'number', key: 'erm', symbol: 'ε_m', label: 'Mask permittivity', min: 1, max: 10, help: 'LPI solder masks are about 3.3–4.0 (check the mask data sheet).' },
    ],
  },
  {
    kind: 'section',
    title: 'Cover dielectric',
    visible: (s) => s.structure === 'emb',
    fields: [
      { kind: 'number', key: 'hc', symbol: 'H_c', label: 'Cover above trace', units: U_LEN_PCB, unitKey: 'hcUnit', min: 0, max: 0.05, help: 'Dielectric from the top of the trace to the top of the cover (prepreg or a laminated cover layer), with air above it.' },
      { kind: 'number', key: 'erc', symbol: 'ε_c', label: 'Cover permittivity', min: 1, max: 20, help: 'Permittivity of the cover layer; usually the same prepreg as the substrate.' },
    ],
  },
  {
    kind: 'section',
    title: 'Dielectric',
    fields: [
      {
        kind: 'select',
        key: 'material',
        label: 'Laminate preset',
        options: Object.keys(MATERIALS),
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m != null) {
            s.er = m;
            // a preset fixes εr: if εr was the unknown, analyse the entered geometry instead
            if (s.solveFor === 'er') s.solveFor = 'z0';
          }
        },
        help: 'Fills εr with a typical design value. Use your fabricator’s stack-up Dk for the actual glass style and resin content: FR-4 ranges about 3.6–4.6.',
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', solvable: true, min: 1, max: 100, help: 'Relative permittivity (Dk) of the laminate between the trace and its plane(s).' },
    ],
  },
  {
    kind: 'section',
    title: 'Frequency',
    fields: [{ kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets the wavelength results and the higher-order-mode checks. The impedance is the static (quasi-TEM) value.' }],
  },
];

type Key = Exclude<CiState['solveFor'], 'z0'>;
const LABEL: Record<CiState['solveFor'], string> = { z0: 'Impedance', w: 'Trace width', h: 'Dielectric height', er: 'Permittivity', g: 'Gap to ground pour' };
const SYM: Record<CiState['solveFor'], string> = { z0: 'Z₀', w: 'W', h: 'H', er: 'εr', g: 'G' };
/** Field limits: a solved value never leaves them. */
const RANGE: Record<Key, { lo: number; hi: number }> = { w: { lo: 1e-6, hi: 0.05 }, h: { lo: 1e-6, hi: 0.05 }, er: { lo: 1, hi: 100 }, g: { lo: 1e-6, hi: 0.05 } };

const fLen = (m: number) => si(m, 'm', 4);
const fZ = (z: number) => si(z, 'Ω', 4);
const mil = (m: number) => `${(m / 25.4e-6).toFixed(2)} mil`;

export const toInputs = (s: CiState): CiInputs => ({ structure: s.structure, w: s.w, h: s.h, t: s.t, er: s.er, c: s.c, erm: s.erm, hc: s.hc, erc: s.erc, g: s.g });

/**
 * Largest stripline T/b accepted. Cohn states his thickness correction for T/b ≲ 0.1; against 2-D field solutions
 * (builder and reviewer) the centred line reads −0.14 … −0.44 % at T/b 0.26, −0.84 … −0.98 % at 0.375 and
 * −1.1 % at 0.44 (offset lines −0.15 … +0.51 % at 0.26): warned above 0.2, refused above 0.45.
 */
export const SL_TB_MAX = 0.45;

const tbError = (i: CiInputs) =>
  `The copper is too thick for the dielectric: T/b = ${(i.t / (2 * i.h + i.t)).toFixed(3)} is above ${SL_TB_MAX} (b = 2H + T; here H must be at least ${fLen((i.t * (1 / SL_TB_MAX - 1)) / 2)} for T = ${fLen(i.t)}). Cohn’s thickness correction is a thin-strip result, checked against a field solver only to T/b = 0.45. Use a thicker dielectric, thinner copper, or a 2-D field solver.`;

/** Why the inputs cannot be analysed (null when they can). */
export function geometryError(i: CiInputs): string | null {
  if (i.t > i.w * 3) return `The copper (T = ${fLen(i.t)}) is more than three times as thick as the trace is wide: no closed-form strip model covers that shape.`;
  if (i.structure === 'sl' && i.t / (2 * i.h + i.t) > SL_TB_MAX) return tbError(i);
  return null;
}

function z0Of(s: CiState, key: Key | null, x: number): number {
  const i = toInputs(s);
  if (key) i[key] = x;
  if (geometryError(i)) return NaN;
  return analyse(i).z0;
}

/** Solve Z₀(x) = target over the field range; null when out of reach. */
export function solveFor(s: CiState, key: Key, target: number, samples = 160): { ok: true; x: number } | { ok: false; zLo: number; zHi: number; closest: number; closestZ: number } {
  const r = RANGE[key];
  const g = (x: number) => z0Of(s, key, x);
  const inv = invert(g, target, { lo: r.lo, hi: r.hi, log: true, samples });
  for (const x of inv.roots) if (Math.abs(g(x) / target - 1) < 1e-9) return { ok: true, x };
  return { ok: false, zLo: g(r.lo), zHi: g(r.hi), closest: inv.closest, closestZ: inv.closestValue };
}

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: CiState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness notes (style guide §12.3):
 *  • error-after-edit on a typed number (Z₀ ×10, W max, …) is a genuine NO SOLUTION: the user typed a target
 *    or dimension no geometry in range can meet, and the message says which way to move (§5a).
 *  • roundtrip-error "solveFor g from here" on a non-CPWG state: G is hidden there (◎ unreachable in the UI);
 *    the API is told why.
 *  • roundtrip on solving H after T = max (0.5 mm on 0.2 mm): copper 2.5× thicker than the dielectric makes the
 *    Hammerstad–Jensen thickness term non-monotonic in H, so a second H meets the same Z₀. That state is far
 *    outside the model (warned: T/H > 0.35).
 */
function fail(msg: string, s: CiState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

function run(st: CiState): CalcReport {
  const s: CiState = { ...st };
  const k = s.solveFor;
  if (!STRUCTURES.some((o) => o.value === s.structure)) throw new Error(`Unknown line type “${s.structure}”.`);
  for (const key of ['w', 'h', 'g'] as const) if (key !== k && !(finite(LABEL[key], s[key]) > 0)) throw new Error(`${LABEL[key]} must be > 0.`);
  if (k !== 'er' && !(finite('εr', s.er) >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(finite('Copper thickness', s.t) >= 0)) throw new Error('Copper thickness must be ≥ 0.');
  if (!(finite('Mask thickness', s.c) >= 0) || !(finite('Cover thickness', s.hc) >= 0)) throw new Error('Mask and cover thickness must be ≥ 0.');
  if (!(finite('Mask permittivity', s.erm) >= 1) || !(finite('Cover permittivity', s.erc) >= 1)) throw new Error('Mask and cover permittivity must be ≥ 1.');
  if (!(finite('Frequency', s.f) > 0)) throw new Error('Frequency must be > 0.');
  if (k !== 'z0' && !(finite('Target Z₀', s.z0) > 0)) throw new Error('Target Z₀ must be > 0.');
  if (k === 'g' && s.structure !== 'cpwg') throw new Error('The gap G is only an input of the CPWG line type.');

  // the stripline copper limit does not depend on W, εr or G: report it as itself, not as an unreachable target
  if (s.structure === 'sl' && k !== 'h' && s.t / (2 * s.h + s.t) > SL_TB_MAX) return { ...errorReport(ID, new Error(tbError(toInputs(s)))), solveFor: k };
  if (k !== 'z0') {
    const r = solveFor(s, k, s.z0);
    if (!r.ok) {
      const lo = RANGE[k].lo;
      const hi = RANGE[k].hi;
      const fx = (x: number) => (k === 'er' ? String(+x.toPrecision(4)) : fLen(x));
      const span = Number.isFinite(r.zLo) && Number.isFinite(r.zHi) ? ` (${SYM[k]} = ${fx(lo)} … ${fx(hi)} gives ${fZ(Math.min(r.zLo, r.zHi))} … ${fZ(Math.max(r.zLo, r.zHi))})` : '';
      const lever: Record<Key, string> = {
        w: 'Z₀ falls as the trace widens: change H, εr or the target.',
        h: 'Z₀ rises with the dielectric height: change W, εr or the target.',
        er: 'Z₀ falls as εr rises: change the geometry or the target.',
        g: 'Z₀ rises with the gap and levels off at the plain microstrip value: change W or H.',
      };
      const limit = s.structure === 'sl' && k === 'h' ? ` (H is limited to ≥ ${fLen((s.t * (1 / SL_TB_MAX - 1)) / 2)} by the copper thickness, T/b ≤ ${SL_TB_MAX}.)` : '';
      return fail(`No ${SYM[k]} gives Z₀ = ${fZ(s.z0)} on this ${SNAME[s.structure].toLowerCase()}${span}. ${lever[k]}${limit}`, s);
    }
    s[k] = r.x;
  }
  const i = toInputs(s);
  const gErr = geometryError(i);
  if (gErr) return { ...errorReport(ID, new Error(gErr)), solveFor: k };
  const o = analyse(i);
  if (k === 'z0') {
    if (!(o.z0 >= 1 && o.z0 <= 500)) return fail(`Z₀ = ${fZ(o.z0)} is outside 1–500 Ω, the range of the impedance field: check the dimensions and units.`, s);
    s.z0 = o.z0;
  }
  return report(s, o);
}

function report(s: CiState, o: CiResult): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const w = rep.warnings;
  const notes = rep.notes;
  const u = s.w / s.h;

  // ── validity
  if (isMs(s)) {
    if (u < 0.05 || u > 20) w.push(`W/H = ${u.toPrecision(3)} is outside 0.05–20, where the microstrip and cover models were checked against a field solver. Confirm with a 2-D field solver.`);
    if (s.t / s.h > 0.35) w.push(`T/H = ${(s.t / s.h).toFixed(2)}: copper this thick relative to the dielectric is beyond the checked range of the Hammerstad–Jensen thickness correction. Use a field solver.`);
    const fTE = C0 / (4 * s.h * Math.sqrt(Math.max(s.er - 1, 1e-9)));
    if (s.er > 1 && s.f > fTE) w.push(`f is above the TE₁ surface-wave onset ≈ ${si(fTE, 'Hz', 3)} of this substrate: the quasi-TEM impedance no longer describes the line. Use a thinner substrate.`);
  }
  if (s.structure === 'mask') {
    if (s.c / s.h > 0.25) w.push(`C/H = ${(s.c / s.h).toFixed(2)}: a mask this thick relative to the substrate is beyond the field-solver check (C/H ≤ 0.25).`);
    if (s.erm > 5) w.push(`ε_m = ${s.erm} is unusually high for solder mask (3.3–4.0 is typical). Check the value.`);
  }
  if (s.structure === 'emb' && (s.t + s.hc) / s.h > 3.2) w.push(`The cover is more than 3.2× the substrate height: beyond the field-solver check, and the line is approaching a stripline without a top plane. The cover model reads high here.`);
  if (s.structure === 'sl') {
    const tb = s.t / o.b;
    if (tb > 0.2) w.push(`T/b = ${tb.toFixed(3)} > 0.2: well beyond the T/b ≲ 0.1 Cohn states for his thickness correction. Against 2-D field solutions it still holds to −1.1 … +0.6 % up to T/b = 0.45; allow for that or confirm with a field solver.`);
    else if (tb > 0.1) w.push(`T/b = ${tb.toFixed(3)} > 0.1: beyond the range Cohn states for his thickness correction; against field solutions it holds to ±0.5 % up to T/b = 0.26. Confirm critical designs with a field solver.`);
    const fPP = C0 / (2 * o.b * Math.sqrt(s.er));
    if (s.f > fPP) w.push(`f is above ${si(fPP, 'Hz', 3)}, where the plane spacing reaches half a wavelength and parallel-plate modes can propagate. Stitch the planes with ground vias.`);
  }
  if (s.structure === 'cpwg') {
    if (s.t > s.g) w.push(`The gap (${fLen(s.g)}) is narrower than the copper is thick: side-wall coupling dominates, beyond the field-solver check (T ≤ 1.2 G). Etching will not hold this gap either; widen it.`);
    if (s.g / s.h < 0.1 || s.w / s.h < 0.2) notes.push('Very narrow CPWG features relative to H: the copper side-wall term grows relative to the conformal-map capacitance; allow the stated model error (+0.1 … +2.4 %).');
    if (s.g > s.h) w.push(`G = ${(s.g / s.h).toPrecision(3)}·H: with the pours this far away the conformal map loses the field that wraps from the trace top round to the plane, and Z₀ reads high (+1.9 % at G = 1.5H, +4.7 % at 3H against a field solver). Keep G ≤ H for a true CPWG, or treat it as a microstrip.`);
  }
  if (s.t > s.w) w.push('The copper is thicker than the trace is wide: etching cannot produce that profile and the strip models lose accuracy.');

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k === 'w' || k === 'h' || k === 'g') prim.push(item(k, LABEL[k], s[k], 'm', fLen(s[k]), { symbol: SYM[k], solved: true, primary: true, note: `${mil(s[k])} · ${k === 'h' ? `W/H = ${u.toPrecision(4)}` : `${SYM[k]}/H = ${(s[k] / s.h).toPrecision(4)}`}` }));
  if (k === 'er') prim.push(item('er', LABEL.er, s.er, '', s.er.toPrecision(4), { symbol: 'εᵣ', solved: true, primary: true }));
  prim.push(item('z0', 'Characteristic impedance', o.z0, 'Ω', fZ(o.z0), { symbol: 'Z₀', primary: true, solved: k === 'z0', note: `${k === 'z0' ? SNAME[s.structure] : 'target'} · model ${ACCURACY[s.structure]}` }));
  prim.push(item('epsEff', 'Effective permittivity', o.epsEff, '', o.epsEff.toPrecision(4), { symbol: 'εeff', primary: true, note: s.structure === 'sl' ? 'pure TEM: εeff = εr' : 'static (quasi-TEM)' }));
  const tpd = Math.sqrt(o.epsEff) / C0;
  prim.push(item('tpd', 'Propagation delay', tpd, 's/m', `${si(tpd * 1e-3, 's', 4)}/mm`, { symbol: 't_pd', primary: true, note: `${si(tpd * 0.0254, 's', 4)}/in` }));

  const vp = C0 / Math.sqrt(o.epsEff);
  const lam = vp / s.f;
  const sec: ResultItem[] = [
    item('lPer', 'Inductance per length', o.zAir / C0, 'H/m', `${si((o.zAir / C0) * 1e-3, 'H', 4)}/mm`, { symbol: "L'", group: 'Line' }),
    item('cPer', 'Capacitance per length', Math.sqrt(o.epsEff) / (C0 * o.z0), 'F/m', `${si((Math.sqrt(o.epsEff) / (C0 * o.z0)) * 1e-3, 'F', 4)}/mm`, { symbol: "C'", group: 'Line' }),
    item('vp', 'Phase velocity', vp, 'm/s', `${si(vp, 'm/s', 4)} (${((vp / C0) * 100).toFixed(1)} % c)`, { symbol: 'v_p', group: 'Line' }),
    item('lambdaG', `Wavelength at ${si(s.f, 'Hz')}`, lam, 'm', fLen(lam), { symbol: 'λ_g', group: 'Line' }),
    item('quarterWave', 'Quarter wavelength', lam / 4, 'm', fLen(lam / 4), { symbol: 'λ_g/4', group: 'Line' }),
  ];
  if (s.structure === 'mask' || s.structure === 'emb') {
    const what = s.structure === 'mask' ? 'mask' : 'cover';
    sec.push(
      item('z0Bare', `Same trace without ${what}`, o.z0Bare, 'Ω', fZ(o.z0Bare), { symbol: 'Z₀,bare', group: s.structure === 'mask' ? 'Solder mask' : 'Cover' }),
      item('dz', `Change due to the ${what}`, o.z0 - o.z0Bare, 'Ω', `${(o.z0 - o.z0Bare).toFixed(2)} Ω (${(((o.z0 - o.z0Bare) / o.z0Bare) * 100).toFixed(1)} %)`, { symbol: 'ΔZ₀', group: s.structure === 'mask' ? 'Solder mask' : 'Cover', note: s.structure === 'mask' ? 'a field solver gives 1.2–3× this drop (see the theory)' : 'a field solver gives a somewhat larger drop' }),
      item('dq', 'Cover filling factor', o.dq, '', o.dq.toFixed(4), { symbol: 'Δq', group: s.structure === 'mask' ? 'Solder mask' : 'Cover', note: 'share of the air field the cover takes over' }),
    );
  }
  sec.push(item('wOverH', 'Width / height', u, '', u.toPrecision(4), { symbol: 'W/H', group: 'Geometry' }));
  if (s.structure === 'sl') sec.push(item('b', 'Plane spacing', o.b, 'm', `${fLen(o.b)} (${mil(o.b)})`, { symbol: 'b', group: 'Geometry', note: 'b = 2H + T' }));
  if (s.structure === 'cpwg') sec.push(item('pitch', 'Trace + both gaps', s.w + 2 * s.g, 'm', fLen(s.w + 2 * s.g), { symbol: 'W+2G', group: 'Geometry', note: 'clearance cut in the ground pour' }));
  sec.push(item('wMil', 'Trace width', s.w, 'm', `${fLen(s.w)} = ${mil(s.w)}`, { symbol: 'W', group: 'Geometry' }));
  rep.results = [...prim, ...sec];

  rep.summary = `${SNAME[s.structure]} · W/H ${u.toPrecision(3)} · εr ${+s.er.toPrecision(4)} · εeff ${o.epsEff.toPrecision(4)}`;
  const method: Record<Structure, string> = {
    ms: 'Hammerstad–Jensen (1980) quasi-static microstrip with their copper-thickness correction; air above the trace.',
    mask: 'Hammerstad–Jensen bare microstrip, plus the solder mask as a cover layer (Wan–Hoorfar 2000 filling factor, Bahl–Stuchly air-replacement). The cover model has no mask on the trace side walls, so it under-states the mask’s effect: against 2-D field solutions Z₀ reads 0.35–2.1 % high. The Wan–Hoorfar wide/narrow branches are blended over W/H 0.91–1.1, where the published pair does not meet.',
    emb: 'Hammerstad–Jensen microstrip plus a planar cover layer (Wan–Hoorfar 2000 filling factor, Bahl–Stuchly air-replacement). Against a 2-D field solution Z₀ reads 1.1–2.8 % high.',
    sl: 'Cohn’s exact zero-thickness stripline with his fringing-capacitance thickness correction (Wheeler 1978 thick strip). Homogeneous dielectric: pure TEM.',
    cpwg: 'Conductor-backed CPW by conformal mapping (Ghione–Naldi 1987), copper thickness as the parallel-plate capacitance of the gap side walls. Wide ground pours, densely stitched to the plane below.',
  };
  notes.push(method[s.structure], 'Not modelled: trapezoidal etch, resin-rich layers next to the copper, glass-weave Dk variation and surface roughness. Fabricators hold impedance to ±10 % (±5 % on request).');
  rep.details = { ...o, inputs: toInputs(s) };
  rep.graphs = graphs(s, o);
  rep.tables = [compareTable(s)];
  return rep;
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

const OTHER_COLOR: Record<Structure, string> = { mask: '#2f7d4f', ms: '#c47b17', emb: '#6b5b95', sl: '#4f8a8b', cpwg: '#8b1e1e' };

function zCurve(s: CiState, key: 'w' | 'h' | 'c' | 'hc', xs: number[], structure = s.structure): number[] {
  return xs.map((x) => {
    const i = toInputs({ ...s, structure, [key]: x });
    return geometryError(i) ? NaN : analyse(i).z0;
  });
}

/** Drop NaN points (geometry not analysable) so every series stays finite. */
function clean(x: number[], y: number[]): { x: number[]; y: number[] } {
  const xo: number[] = [];
  const yo: number[] = [];
  x.forEach((v, i) => {
    if (Number.isFinite(y[i])) {
      xo.push(v);
      yo.push(y[i]);
    }
  });
  return { x: xo, y: yo };
}

function graphs(s: CiState, o: CiResult): GraphSpec[] {
  const ws = [...logspace(Math.max(Math.min(0.1 * s.h, s.w / 3), 1e-6), Math.min(Math.max(8 * s.h, s.w * 3), 0.05), 90), s.w].sort((a, b) => a - b);
  const target = s.solveFor === 'z0' ? [] : [{ value: s.z0, label: `target ${fZ(s.z0)}`, axis: 'z', color: '#9a8f7a', dash: [3, 3] }];
  const series = [
    { label: SNAME[s.structure], ...clean(ws, zCurve(s, 'w', ws)), axis: 'z', width: 2.4, color: '#1f4e5f' },
    ...STRUCTURES.filter((x) => x.value !== s.structure).map((x) => ({ label: SNAME[x.value], ...clean(ws, zCurve(s, 'w', ws, x.value)), axis: 'z', width: 1.2, dash: [5, 3], color: OTHER_COLOR[x.value] })),
  ];
  const hs = [...logspace(Math.max(s.h / 6, 1e-6), Math.min(s.h * 6, 0.05), 120), s.h].sort((a, b) => a - b);
  const out: GraphSpec[] = [
    {
      id: 'z0-vs-w',
      title: 'Z₀ vs width',
      subtitle: `H = ${fLen(s.h)}, T = ${fLen(s.t)}, εr = ${+s.er.toPrecision(4)}; other line types dashed`,
      x: { label: 'Trace width W', unit: 'm', log: true },
      y: [{ id: 'z', label: 'Z₀', unit: 'Ω' }],
      series: series.filter((x) => x.x.length > 1),
      hlines: target,
      vlines: [{ value: s.w, label: `W = ${fLen(s.w)}`, color: '#9a8f7a' }],
      markers: [{ x: s.w, y: o.z0, axis: 'z', label: fZ(o.z0) }],
    },
    {
      id: 'z0-vs-h',
      title: 'Z₀ vs height',
      subtitle: `${SNAME[s.structure]}, W = ${fLen(s.w)}`,
      x: { label: 'Dielectric height H', unit: 'm', log: true },
      y: [{ id: 'z', label: 'Z₀', unit: 'Ω' }],
      series: [{ label: 'Z₀', ...clean(hs, zCurve(s, 'h', hs)), axis: 'z', width: 2.2 }],
      hlines: target,
      vlines: [{ value: s.h, label: `H = ${fLen(s.h)}`, color: '#9a8f7a' }],
      markers: [{ x: s.h, y: o.z0, axis: 'z', label: fZ(o.z0) }],
    },
  ];
  if (s.structure === 'mask' || s.structure === 'emb') {
    const key = s.structure === 'mask' ? 'c' : 'hc';
    const cur = s[key];
    const top = s.structure === 'mask' ? Math.max(60e-6, 2 * cur) : Math.max(3 * s.h, 2 * cur);
    const xs = [...Array.from({ length: 100 }, (_, i) => (top * i) / 99), cur].sort((a, b) => a - b);
    out.push({
      id: 'z0-vs-cover',
      title: s.structure === 'mask' ? 'Z₀ vs mask thickness' : 'Z₀ vs cover thickness',
      subtitle: `W = ${fLen(s.w)}, H = ${fLen(s.h)}, ${s.structure === 'mask' ? `ε_m = ${s.erm}` : `ε_c = ${s.erc}`}`,
      x: { label: s.structure === 'mask' ? 'Mask thickness C' : 'Cover above trace H_c', unit: 'm' },
      y: [{ id: 'z', label: 'Z₀', unit: 'Ω' }],
      series: [{ label: 'Z₀', ...clean(xs, zCurve(s, key, xs)), axis: 'z', width: 2.2 }],
      vlines: [{ value: cur, label: `${s.structure === 'mask' ? 'C' : 'H_c'} = ${fLen(cur)}`, color: '#9a8f7a' }],
      markers: [{ x: cur, y: o.z0, axis: 'z', label: fZ(o.z0) }],
    });
  }
  return out;
}

/** The same stack-up as every line type: Z₀ at the entered width, and the width for the target. */
function compareTable(s: CiState): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  const target = s.z0;
  for (const st of STRUCTURES) {
    const ss = { ...s, structure: st.value };
    const i = toInputs(ss);
    const z = geometryError(i) ? null : analyse(i).z0;
    const r = solveFor(ss, 'w', target, 60);
    rows.push({ type: st.label, z0: z, w: r.ok ? r.x : null });
    display.push({ type: `${st.label}${st.value === s.structure ? ' ◂' : ''}`, z0: z == null ? '—' : fZ(z), w: r.ok ? `${fLen(r.x)} (${mil(r.x)})` : 'not reachable' });
  }
  return {
    id: 'compare',
    title: 'Same stack-up, every line type',
    columns: [
      { key: 'type', label: 'Line type', align: 'left' },
      { key: 'z0', label: `Z₀ at W = ${fLen(s.w)}`, unit: 'Ω' },
      { key: 'w', label: `W for ${fZ(target)}`, unit: 'm' },
    ],
    rows,
    display,
    note: `H = ${fLen(s.h)}, T = ${fLen(s.t)}, εr = ${+s.er.toPrecision(4)}; mask ${fLen(s.c)} (ε ${s.erm}), cover ${fLen(s.hc)} (ε ${s.erc}), CPWG gap ${fLen(s.g)}. For stripline H is the dielectric on each side of the trace.`,
  };
}

export const def: CalcDef<CiState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Five single-ended PCB lines: Hammerstad–Jensen (1980) microstrip with thickness correction; solder mask and embedded covers by the Wan–Hoorfar (2000) multilayer filling factor with Bahl–Stuchly (1980) air replacement; symmetric stripline by Cohn’s exact K/K′ with his thickness correction (Wheeler 1978); grounded CPW by Ghione–Naldi (1987) conformal mapping with a side-wall thickness term. Accuracy of each checked against a 2-D field solution. Solve-for uses bracketed Brent root finding on Z₀(x).',
  fields,
  defaults,
  solve: {
    default: 'w',
    analysis: 'z0',
    options: [
      { key: 'z0', label: 'Z₀ from geometry (analysis)' },
      { key: 'w', label: 'Trace width W for a target Z₀' },
      { key: 'h', label: 'Dielectric height H for a target Z₀' },
      { key: 'er', label: 'εr for a target Z₀' },
      { key: 'g', label: 'CPWG gap G for a target Z₀' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.er) > 1e-9) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: '50 Ω under solder mask, 0.2 mm prepreg (solve W)', state: defaults() },
    { id: 'bare', label: 'Same line without mask (bare microstrip)', state: { ...defaults(), structure: 'ms' } },
    { id: 'embedded', label: 'Embedded: 50 Ω under 0.1 mm of prepreg', state: { ...defaults(), structure: 'emb', hc: 0.1e-3, erc: 4.2 } },
    { id: 'stripline', label: 'Stripline 50 Ω, 0.2 mm each side, ½ oz', state: { ...defaults(), structure: 'sl', t: 17.5e-6, h: 0.2e-3, material: 'FR-4 prepreg (~1 GHz)', er: 4.2 } },
    { id: 'cpwg-2layer', label: 'CPWG 50 Ω on 1.6 mm 2-layer FR-4 (solve gap)', state: { ...defaults(), structure: 'cpwg', solveFor: 'g', w: 1.0e-3, h: 1.6e-3, g: 0.2e-3, material: 'FR-4 (generic)', er: 4.4 } },
    { id: 'pozar-3-5', label: 'Pozar Ex. 3.5: 50 Ω stripline, b = 3.2 mm, εr 2.2', state: { ...defaults(), structure: 'sl', solveFor: 'w', z0: 50, h: 1.6e-3, t: 0, material: 'RT/duroid 5880', er: 2.2, f: 4e9 } },
  ],
};
