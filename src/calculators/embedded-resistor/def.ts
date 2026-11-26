/** Embedded (buried) planar resistor — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB, U_OHM, withDefault } from '@/core/unitsets';
import { CORNER_SQ, MIL2, area, lengthFor, ohmegaSmallPd, powerRating, squares, tolerance, widthFor, widthForRating } from './model';

export const ID = 'pcb/embedded-resistor';

/** 'r' (analysis): resistance of the drawn element; 'l' / 'w': the length or width for a target R. */
export type ErSolve = 'r' | 'l' | 'w';
export type Tech = 'thin' | 'ptf';

export interface ErState {
  solveFor: ErSolve;
  r: number;
  rUnit: string;
  w: number;
  wUnit: string;
  l: number;
  lUnit: string;
  nc: number;
  mat: string;
  tech: Tech;
  rs: number;
  /** sheet resistance tolerance, percent */
  tol: number;
  /** ppm/°C */
  tcr: number;
  /** power density limit, W/m² */
  pd: number;
  pdUnit: string;
  p: number;
  tOp: number;
  etchP: number;
  etchPUnit: string;
  etchM: number;
  etchMUnit: string;
  ext: number;
  extUnit: string;
}

const MW_MIL2 = 1e-3 / MIL2; // 1 mW/mil² in W/m²
const W_IN2 = 1 / (0.0254 * 0.0254); // 1 W/in² in W/m²

/**
 * Material presets: [R_s Ω/□, sheet tolerance %, TCR ppm/°C, power density W/m², process].
 *  - OhmegaPly NiP: R_s, tolerance and RTC from the Quantic Ohmega Product Selection Guide (2023, v7) — the
 *    current document; the older Design Guide v18 lists ±3 % for 10 Ω/□, the 2023 guide ±5 %, which is used.
 *    The power density stored here is the Design Guide v18 large-element value at 25 °C; the rating itself comes
 *    from the guide's 25 / 80 °C tables at the ambient (model.ts), so the field is hidden for these presets.
 *  - Ticer TCR NiCr / NCAS / CrSiO: Quantic Ohmega Product Selection Guide (2023) — tolerance, RTC (“< 110” taken
 *    as +110) and maximum power at 40 °C.
 *  - Polymer thick-film carbon ink: Snogren (IPC) Table 2 — ±10 % sheet tolerance, TCR ±250 ppm/°C (10 Ω–10 kΩ)
 *    and ±750 ppm/°C (10 kΩ–1 MΩ). No published power density: Snogren notes the thin-film rules apply, so the
 *    Ohmega 100 Ω/□ large-element value is used and the page says so.
 */
export const MATERIALS: Record<string, [number, number, number, number, Tech]> = {
  'OhmegaPly NiP 10 Ω/□': [10, 5, 20, 0.187 * MW_MIL2, 'thin'],
  'OhmegaPly NiP 25 Ω/□': [25, 5, 50, 0.15 * MW_MIL2, 'thin'],
  'OhmegaPly NiP 50 Ω/□': [50, 5, 75, 0.138 * MW_MIL2, 'thin'],
  'OhmegaPly NiP 100 Ω/□': [100, 5, 100, 0.1 * MW_MIL2, 'thin'],
  'OhmegaPly NiP 250 Ω/□': [250, 10, 100, 0.09 * MW_MIL2, 'thin'],
  'Ticer TCR NiCr 25 Ω/□': [25, 5, 110, 250 * W_IN2, 'thin'],
  'Ticer TCR NiCr 50 Ω/□': [50, 5, 110, 200 * W_IN2, 'thin'],
  'Ticer TCR NiCr 100 Ω/□': [100, 5, 110, 150 * W_IN2, 'thin'],
  'Ticer TCR NCAS 100 Ω/□': [100, 5, -20, 150 * W_IN2, 'thin'],
  'Ticer TCR NCAS 250 Ω/□': [250, 5, -20, 75 * W_IN2, 'thin'],
  'Ticer TCR CrSiO 1 kΩ/□': [1000, 5, -300, 250 * W_IN2, 'thin'],
  'PTF carbon ink 100 Ω/□': [100, 10, 250, 0.1 * MW_MIL2, 'ptf'],
  'PTF carbon ink 10 kΩ/□': [10000, 10, 750, 0.1 * MW_MIL2, 'ptf'],
};
const isNiP = (m: string) => m.startsWith('OhmegaPly');
/** Sheet resistance for Ohmega's small-element curve: only for an unchanged OhmegaPly preset. */
const nipRs = (s: ErState): number | null => (isNiP(s.mat) ? s.rs : null);
const isPtfPreset = (m: string) => m.startsWith('PTF');
const isTicer = (m: string) => m.startsWith('Ticer');

/** Termination overlap filled per process: Ohmega 5–10 mil (thin film), Snogren 100–200 µm (PTF). */
const EXT: Record<Tech, number> = { thin: 0.15e-3, ptf: 0.15e-3 };

export const LIM = { r: [1e-3, 1e9], w: [10e-6, 50e-3], l: [10e-6, 0.5] } as const;

/**
 * A solved length shown in mil or in can read "0.00051 in": the core rescales a solved value only within one
 * unit's SI prefixes, which imperial units lack. Move it to the imperial unit that shows it nearest 0.1…9999.
 */
const IMPERIAL: Record<string, number> = { mil: 25.4e-6, in: 0.0254 };
function fitImperial(st: Record<string, any>, key: string, unitKey: string): void {
  const v = st[key];
  if (!(st[unitKey] in IMPERIAL) || !(typeof v === 'number' && v > 0)) return;
  const mant = v / IMPERIAL[st[unitKey]];
  if (mant >= 0.1 && mant < 1e4) return;
  st[unitKey] = v / IMPERIAL.mil < 1e4 ? 'mil' : 'in';
}


const U_PD: Record<string, number> = { 'mW/mm²': 1e3, 'W/in²': W_IN2, 'mW/mil²': MW_MIL2, 'W/cm²': 1e4 };
const U_ETCH: Record<string, number> = { 'µm': 1e-6, mil: 25.4e-6, mm: 1e-3 };
const U_RES = { ...U_OHM, 'GΩ': 1e9 };

export const defaults = (): ErState => ({
  solveFor: 'l',
  r: 100,
  rUnit: 'Ω',
  w: 0.5e-3,
  wUnit: 'mm',
  l: 2e-3,
  lUnit: 'mm',
  nc: 0,
  mat: 'OhmegaPly NiP 25 Ω/□',
  tech: 'thin',
  rs: 25,
  tol: 5,
  tcr: 50,
  pd: 0.15 * MW_MIL2,
  pdUnit: 'mW/mm²',
  p: 50e-3,
  tOp: 70,
  etchP: 10e-6,
  etchPUnit: 'µm',
  etchM: 5e-6,
  etchMUnit: 'µm',
  ext: 0.15e-3,
  extUnit: 'mm',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Resistor',
    note: 'Click ◎ on R, W or L to choose what is solved.',
    fields: [
      { kind: 'number', key: 'r', symbol: 'R', label: 'Resistance', units: U_RES, unitKey: 'rUnit', min: LIM.r[0], max: LIM.r[1], solvable: true, help: 'Nominal resistance between the copper terminations, at 25 °C. As a target, the page sizes L or W for it.' },
      { kind: 'number', key: 'w', symbol: 'W', label: 'Element width', units: U_LEN_PCB, unitKey: 'wUnit', min: LIM.w[0], max: LIM.w[1], solvable: true, help: 'Width of the resistive element (set by the copper etch for thin film, by the print for ink). Wider is more accurate and handles more power.' },
      { kind: 'number', key: 'l', symbol: 'L', label: 'Element length', units: withDefault(U_LEN_PCB, 'mm'), unitKey: 'lUnit', min: LIM.l[0], max: LIM.l[1], solvable: true, help: 'Length between the copper terminations — the part that is not shorted by copper. For a meander, the straight length without the corner squares.' },
      { kind: 'number', key: 'nc', symbol: 'n_c', label: 'Meander corners', min: 0, max: 200, integer: true, help: 'Right-angle bends of a meander (0 = a straight bar). Each corner square counts as 0.56 squares (Ohmega design guide).' },
    ],
  },
  {
    kind: 'section',
    title: 'Material',
    fields: [
      {
        kind: 'select', key: 'mat', label: 'Resistive material', options: [...Object.keys(MATERIALS), 'Custom'],
        apply: (v: string, s) => {
          const m = MATERIALS[v];
          if (!m) return;
          [s.rs, s.tol, s.tcr, s.pd, s.tech] = m;
          s.ext = EXT[m[4]];
          s.extUnit = 'mm';
        },
        help: 'Fills R_s, tolerance, TCR and power density from vendor data: OhmegaPly (NiP) and Ticer TCR (NiCr, NCAS, CrSiO) thin-film foils, or a carbon polymer thick-film ink.',
      },
      {
        kind: 'select', key: 'tech', label: 'Process',
        options: [{ value: 'thin', label: 'Thin-film foil (etched)' }, { value: 'ptf', label: 'Polymer thick film (printed)' }],
        help: 'Thin film: the resistive layer is plated or sputtered on the copper foil and the element is etched out under it. PTF: carbon ink is screen-printed between the copper terminations and cured.',
      },
      { kind: 'number', key: 'rs', symbol: 'R_s', label: 'Sheet resistance', unit: 'Ω/□', min: 0.1, max: 1e6, help: 'Ohms per square: any square of the film, of any size, measures this between opposite edges.' },
      { kind: 'number', key: 'tol', symbol: 't_s', label: 'Sheet tolerance', suffix: '±%', min: 0, max: 50, help: 'Material tolerance of R_s from the supplier (±5 % for most thin-film foils). The etch adds to it.' },
      { kind: 'number', key: 'tcr', symbol: 'TCR', label: 'Temp. coefficient', suffix: 'ppm/°C', min: -2000, max: 2000, help: 'Resistance temperature characteristic, −55…125 °C (MIL-STD-202 method 304). Where the vendor gives a bound (“< 110”) the bound is used.' },
    ],
  },
  {
    kind: 'section',
    title: 'Power & temperature',
    fields: [
      { kind: 'number', key: 'p', symbol: 'P', label: 'Power dissipated', unit: 'W', min: 1e-9, max: 100, help: 'Power the resistor must dissipate in use (V²/R or I²R).' },
      { kind: 'number', key: 'pd', symbol: 'PD', label: 'Power density limit', units: U_PD, unitKey: 'pdUnit', unitFamily: 'none', min: 1, max: 1e8, visible: (st) => !isNiP(st.mat), help: 'Allowed dissipation per element area. Filled from the vendor data with the material; it depends on the stack-up and nearby planes, so treat it as a starting point.' },
      { kind: 'number', key: 'tOp', symbol: 'T_a', label: 'Ambient temp.', suffix: '°C', min: -65, max: 200, help: 'Board ambient. Sets the OhmegaPly power rating (design guide tables at 25 and 80 °C, linear between, held outside) and the TCR drift from 25 °C (self-heating not included).' },
    ],
  },
  {
    kind: 'section',
    title: 'Fabrication',
    collapsed: true,
    note: 'Etch tolerance of the copper that defines the element, and the termination overlap.',
    fields: [
      { kind: 'number', key: 'etchP', symbol: 'e⁺', label: 'Etch tolerance +', units: U_ETCH, unitKey: 'etchPUnit', unitFamily: 'none', min: 0, max: 100e-6, help: 'How much larger a feature can come out (½ oz copper: +10 µm, Snogren). Applied to W and to the gap L between terminations.' },
      { kind: 'number', key: 'etchM', symbol: 'e⁻', label: 'Etch tolerance −', units: U_ETCH, unitKey: 'etchMUnit', unitFamily: 'none', min: 0, max: 100e-6, help: 'How much smaller a feature can come out (½ oz copper: −5 µm).' },
      { kind: 'number', key: 'ext', symbol: 'e_t', label: 'Termination overlap', units: withDefault(U_LEN_PCB, 'mm'), unitKey: 'extUnit', min: 0, max: 5e-3, help: 'Thin film: the element runs this far under each copper termination and the terminations are this much wider than it (Ohmega: 5–10 mil) to absorb misregistration. PTF: the ink overlaps the terminations by this much (Snogren: 100–200 µm). It does not change R.' },
    ],
  },
];

const fmtR = (v: number) => si(v, 'Ω', 4);
const fmtL = (v: number) => si(v, 'm', 4);
const pctS = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 2 : 1)} %`;
/** “+6.59 % / −7.10 %” with the same number of decimals on both sides. */
const pmS = (plus: number, minus: number) => {
  const d = Math.max(plus, minus) < 0.1 ? 2 : 1;
  return `+${(plus * 100).toFixed(d)} % / −${(minus * 100).toFixed(d)} %`;
};

function noSolution(s: ErState, key: ErSolve, why: string, display: string): CalcReport {
  return {
    calc: ID, ok: true, solveFor: s.solveFor, warnings: [why], notes: [], graphs: [], tables: [],
    status: { text: 'NO SOLUTION', tone: 'fail' },
    results: [{ key, label: { r: 'Resistance', l: 'Element length', w: 'Element width' }[key], value: null, display, primary: true, solved: true }],
  };
}

export function compute(st: ErState): CalcReport {
  for (const k of ['r', 'w', 'l', 'nc', 'rs', 'tol', 'tcr', 'pd', 'p', 'tOp', 'etchP', 'etchM', 'ext'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!['r', 'l', 'w'].includes(st.solveFor)) throw new Error('solveFor must be r, l or w.');
  if (st.tech !== 'thin' && st.tech !== 'ptf') throw new Error('tech must be "thin" or "ptf".');
  const s: ErState = { ...st, nc: Math.max(0, Math.round(st.nc)) };
  if (!(s.rs > 0) || !(s.pd > 0) || !(s.p > 0)) throw new Error('Sheet resistance, power density and power must be > 0.');
  if (s.tol < 0 || s.tol >= 100) throw new Error('The sheet tolerance must be between 0 and 100 %.');
  if (s.etchP < 0 || s.etchM < 0 || s.ext < 0) throw new Error('Etch tolerances and overlap must be ≥ 0.');
  if (s.solveFor !== 'w' && !(s.w > 0)) throw new Error('Element width must be > 0.');
  if (s.solveFor !== 'l' && !(s.l > 0)) throw new Error('Element length must be > 0.');
  if (s.solveFor !== 'r' && !(s.r > 0)) throw new Error('The target resistance must be > 0.');

  // ── solve: R = R_s·(L/W + 0.56·n_c), linear in L and in 1/W
  const minN = CORNER_SQ * s.nc;
  if (s.solveFor !== 'r') {
    const n = s.r / s.rs;
    const k = s.solveFor;
    if (!(n > minN)) return noSolution(s, k, `${fmtR(s.r)} is ${n.toPrecision(3)} squares of ${si(s.rs, 'Ω', 3)}/□, but ${s.nc} meander corners alone are ${minN.toPrecision(3)} squares: use fewer corners or a lower sheet resistance.`, '—');
    const v = k === 'l' ? lengthFor(n, s.w, s.nc) : widthFor(n, s.l, s.nc);
    const [lo, hi] = LIM[k];
    const what = k === 'l' ? 'length' : 'width';
    if (v < lo) return noSolution(s, k, `${fmtR(s.r)} needs an element ${what} of ${si(v, 'm', 3)}, below the 10 µm this page accepts. ${k === 'l' ? 'Narrow the element or use a lower sheet resistance.' : 'Shorten the element or use a lower sheet resistance.'}`, '< 10 µm');
    if (v > hi) return noSolution(s, k, `${fmtR(s.r)} needs an element ${what} of ${si(v, 'm', 3)}, above the ${si(hi, 'm', 2)} this page accepts. Use a ${k === 'l' ? 'higher' : 'lower'} sheet resistance${k === 'l' ? ' or a meander' : ''}.`, `> ${si(hi, 'm', 2)}`);
    s[k] = v;
  }
  const n = squares(s.l, s.w, s.nc);
  const r = s.rs * n;
  if (s.solveFor === 'r') {
    if (r < LIM.r[0] || r > LIM.r[1]) return noSolution(s, 'r', `The element is ${n.toPrecision(3)} squares, ${fmtR(r)} — outside the 1 mΩ…1 GΩ this page accepts.`, r < LIM.r[0] ? '< 1 mΩ' : '> 1 GΩ');
    s.r = r;
  }
  const a = area(s.l, s.w, s.nc);
  const nip = nipRs(s);
  const pMax = powerRating(a, s.pd, nip, s.tOp);
  const tol = tolerance(s.l, s.w, s.nc, s.tol / 100, s.etchP, s.etchM);
  const wMinP = widthForRating(s.p, s.pd, nip, n, s.nc, s.tOp);
  const drift = (s.tcr * 1e-6) * (s.tOp - 25);
  const smallPd = nip != null && a < 1100 * MIL2 ? ohmegaSmallPd(nip, a, s.tOp) : null; // shown only where the guide gives the curve
  const pdUsed = pMax / a;
  const curve = smallPd != null && smallPd >= pdUsed * (1 - 1e-12);
  const use = s.p / pMax;

  // ── results
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const solvedNote = `${n.toPrecision(4)} squares of ${si(s.rs, 'Ω', 3)}/□`;
  if (s.solveFor === 'l') results.push(item('l', 'Element length', s.l, 'm', fmtL(s.l), { symbol: 'L', primary: true, solved: true, note: `${solvedNote} at W = ${si(s.w, 'm', 3)}` }));
  if (s.solveFor === 'w') results.push(item('w', 'Element width', s.w, 'm', fmtL(s.w), { symbol: 'W', primary: true, solved: true, note: `${solvedNote} over L = ${si(s.l, 'm', 3)}` }));
  results.push(item('r', 'Resistance', r, 'Ω', fmtR(r), { symbol: 'R', primary: true, solved: s.solveFor === 'r', note: s.solveFor === 'r' ? solvedNote : 'target' }));
  results.push(
    item('tolPlus', 'Untrimmed tolerance', tol ? tol.plus * 100 : null, '%', tol ? pmS(tol.plus, tol.minus) : '—', { symbol: 'ΔR/R', primary: true, tone: !tol ? 'fail' : tol.plus > 2 * (s.tol / 100) + 0.05 ? 'warn' : '', note: tol ? `sheet ±${s.tol} % + etch +${si(s.etchP, 'm', 2)}/−${si(s.etchM, 'm', 2)}` : 'element narrower than the etch tolerance' }),
    item('pMax', 'Power rating', pMax, 'W', si(pMax, 'W', 3), { symbol: 'P_max', primary: true, tone: use > 1 ? 'fail' : use > 0.8 ? 'warn' : 'pass', note: `${(use * 100).toFixed(0)} % used by P = ${si(s.p, 'W', 3)}${curve ? ' · Ohmega small-element curve' : ''}` }),
  );
  const gG = 'Geometry';
  results.push(
    item('n', 'Number of squares', n, '', n.toPrecision(4), { symbol: 'N', group: gG, note: s.nc ? `${(s.l / s.w).toPrecision(4)} straight + ${s.nc} × 0.56 corners` : 'L / W' }),
    item('area', 'Element area', a, 'm²', `${(a * 1e6).toPrecision(4)} mm² (${(a / MIL2).toPrecision(4)} mil²)`, { symbol: 'A', group: gG }),
    item('aspect', 'Aspect ratio L/W', s.l / s.w, '', (s.l / s.w).toPrecision(4), { group: gG }),
    item('footprint', 'Footprint with overlap', (s.l + 2 * s.ext) * (s.w + 2 * s.ext), 'm²', s.nc ? '—' : `${si(s.l + 2 * s.ext, 'm', 3)} × ${si(s.w + 2 * s.ext, 'm', 3)}`, { group: gG, note: s.nc ? 'bar only' : `element + ${si(s.ext, 'm', 2)} overlap each side` }),
  );
  const gT = 'Tolerance & temperature';
  if (tol) {
    results.push(
      item('rMax', 'Largest as made', r * (1 + tol.plus), 'Ω', fmtR(r * (1 + tol.plus)), { group: gT, note: 'narrowest, longest element, high sheet' }),
      item('rMin', 'Smallest as made', r * (1 - tol.minus), 'Ω', fmtR(r * (1 - tol.minus)), { group: gT, note: 'widest, shortest element, low sheet' }),
      item('etchOnly', 'Etch part of tolerance', tol.geoPlus * 100, '%', pmS(tol.geoPlus, tol.geoMinus), { group: gT, note: 'geometry alone' }),
      item('trimDesign', 'Draw for laser trim at', r / (1 + tol.plus), 'Ω', fmtR(r / (1 + tol.plus)), { group: gT, note: 'R/(1 + tol⁺): every part trims up to R' }),
    );
  }
  results.push(item('drift', `Drift at ${s.tOp} °C`, drift * 100, '%', `${drift >= 0 ? '+' : '−'}${pctS(Math.abs(drift))} (${si(r * (1 + drift), 'Ω', 4)})`, { group: gT, note: `TCR ${s.tcr} ppm/°C from 25 °C` }));
  const gP = 'Power';
  results.push(
    item('pd', 'Power density at P', s.p / a, 'W/m²', `${si((s.p / a) * 1e-6, 'W', 3)}/mm²`, { group: gP, note: `limit ${si(pdUsed * 1e-6, 'W', 3)}/mm²${nip != null ? ` (Ohmega, ${Math.min(Math.max(s.tOp, 25), 80)} °C)` : ''}` }),
    item('wMinP', 'Narrowest width for P', wMinP, 'm', fmtL(wMinP), { group: gP, note: `at ${n.toPrecision(3)} squares`, tone: s.w < wMinP ? 'fail' : '' }),
    item('i', 'Current at P', Math.sqrt(s.p / r), 'A', si(Math.sqrt(s.p / r), 'A', 3), { group: gP }),
    item('v', 'Voltage at P', Math.sqrt(s.p * r), 'V', si(Math.sqrt(s.p * r), 'V', 3), { group: gP }),
  );
  if (smallPd != null) results.push(item('pdSmall', 'Ohmega small-element density', smallPd, 'W/m²', `${(smallPd / MW_MIL2).toFixed(3)} mW/mil²`, { group: gP, note: `${(a / MIL2).toFixed(0)} mil² at ${Math.min(Math.max(s.tOp, 25), 80)} °C${curve ? ', used for P_max' : ''}` }));

  // ── material comparison at this width (candidate solutions judged against P)
  const rows = Object.entries(MATERIALS).map(([name, [rs, t, , pd]]) => {
    const nn = s.r / rs;
    const L = lengthFor(nn, s.w, s.nc);
    const ok = Number.isFinite(L) && L >= LIM.l[0] && L <= LIM.l[1];
    const A = ok ? area(L, s.w, s.nc) : NaN;
    const nipK = name.startsWith('OhmegaPly') ? rs : null;
    const tt = ok ? tolerance(L, s.w, s.nc, t / 100, s.etchP, s.etchM) : null;
    return { name, rs, L: ok ? L : null, pMax: ok ? powerRating(A, pd, nipK, s.tOp) : null, tol: tt ? tt.plus * 100 : null, tt };
  });
  const table: TableSpec = {
    id: 'materials',
    title: `Materials for ${fmtR(s.r)} at W = ${si(s.w, 'm', 3)}`,
    columns: [{ key: 'name', label: 'Material', align: 'left' }, { key: 'L', label: 'Length L', unit: 'm' }, { key: 'pMax', label: 'P_max', unit: 'W' }, { key: 'tol', label: 'Tolerance' }],
    rows: rows.map(({ name, L, pMax: pm, tol: tp }) => ({ name, L, pMax: pm, tol: tp })),
    display: rows.map((x) => ({ name: x.name, L: x.L != null ? si(x.L, 'm', 3) : 'out of range', pMax: x.pMax != null ? si(x.pMax, 'W', 3) : '—', tol: x.tt ? pmS(x.tt.plus, x.tt.minus) : '—' })),
    rowTones: rows.map((x) => (x.pMax == null ? 'fail' : s.p > x.pMax ? 'fail' : s.p > 0.8 * x.pMax ? 'warn' : 'pass')),
    note: `Same width, n_c and etch; pass when P = ${si(s.p, 'W', 3)} is under 80 % of P_max, warn up to 100 %, fail above or when L is out of range.`,
  };

  // ── checks
  const warnings: string[] = [];
  const notes: string[] = [];
  if (!tol) warnings.push(`The element (${si(Math.min(s.w, s.l), 'm', 3)}) is not larger than the etch shrink (${si(s.etchM, 'm', 3)}): it may not survive etching. Make it much larger than the etch tolerance.`);
  else if (tol.geoPlus > s.tol / 100) warnings.push(`The etch tolerance adds more (+${pctS(tol.geoPlus)}) than the material (±${s.tol} %): the element is small for the process. Make it larger (both W and L), or plan on laser trimming.`);
  if (use > 1) warnings.push(`P = ${si(s.p, 'W', 3)} exceeds the rating ${si(pMax, 'W', 3)}: widen the element to W ≥ ${si(wMinP, 'm', 3)} (same squares), use parallel elements, or put a plane next to it.`);
  else if (use > 0.8) warnings.push(`P is ${(use * 100).toFixed(0)} % of the rating: little margin; widen to ${si(wMinP / Math.sqrt(0.8), 'm', 3)} for 80 % use.`);
  if (s.tech === 'thin' && Math.min(s.w, s.l) < 10 * 25.4e-6) warnings.push(`The element is under 10 mil (${si(Math.min(s.w, s.l), 'm', 3)}) on its short side, where the etch model is optimistic: Ohmega measured 8 mil-wide 25 Ω/□ elements at a mean of 35 Ω for 25 Ω nominal and ±50 % (1 square) to ±10 % (4 squares) (design guide v18, etched resistor tolerances). Use artwork compensation from your fabricator's data, or a larger element.`);
  if (s.tOp < -55 || s.tOp > 125) warnings.push(`${s.tOp} °C is outside the −55…125 °C range the TCR is specified over (MIL-STD-202 method 304); measure the drift there.`);
  if (s.tech === 'ptf') warnings.push('PTF: untrimmed printed resistors hold about ±40 % in general and ±20 % at best in volume (Snogren) — the ink thickness varies, which this geometric estimate leaves out. Plan on laser trimming.');
  if (isPtfPreset(s.mat)) notes.push('No PTF power density is published; Snogren notes the thin-film rules apply, so the Ohmega 100 Ω/□ large-element value is used. Confirm with the ink supplier.');
  if (isTicer(s.mat)) notes.push('Ticer power density is the vendor’s maximum at 40 °C (element size not stated); larger elements dissipate less per unit area.');
  if (isNiP(s.mat)) notes.push(`OhmegaPly rating: design guide v18 tables at 25 and 80 °C ambient, interpolated to ${Math.min(Math.max(s.tOp, 25), 80)} °C${curve ? ', small-element curve' : ', large-element density'}.`);
  if (isNiP(s.mat) && s.tOp > 80) warnings.push(`${s.tOp} °C is above Ohmega’s highest rating table (80 °C); the 80 °C rating is used, so derate further or measure the temperature rise.`);
  if (isTicer(s.mat) && s.tOp > 40) notes.push(`Ticer’s maximum power density is stated at 40 °C; at ${s.tOp} °C ambient leave extra margin.`);
  if (s.nc === 0 && s.l / s.w > 10) notes.push(`A ${(s.l / s.w).toFixed(0)}:1 bar is long and thin; fold it into a meander (each corner counts 0.56 squares) to fit the space.`);
  if (s.l / s.w < 0.5 && s.nc === 0) notes.push('Partial-square element (L < W/2): the termination edges set the length, so registration and etch matter more.');
  notes.push(
    'R = R_s·(L/W + 0.56·n_c); the copper terminations short the film under them, so only the gap L between them counts.',
    'Keep the element at least 10 mil (0.25 mm) from plated through-holes and 5 mil from laser microvias (Ohmega thermal isolation).',
  );

  return {
    calc: ID, ok: true, solveFor: s.solveFor, results, tables: [table], warnings, notes,
    status: use > 1 ? { text: 'OVER POWER', tone: 'fail' } : undefined,
    graphs: graphs(s, n),
    summary: `${s.mat === 'Custom' ? `${si(s.rs, 'Ω', 3)}/□ ${s.tech === 'ptf' ? 'PTF ink' : 'thin film'}` : s.mat} · ${si(s.w, 'm', 3)} × ${si(s.l, 'm', 3)}${s.nc ? `, ${s.nc} corners` : ''} · P = ${si(s.p, 'W', 3)}`,
    details: { n, area: a, pMax, tol, wMinP, drift, smallPd },
  };
}

function graphs(s: ErState, n: number): GraphSpec[] {
  const wLo = Math.max(LIM.w[0], s.w / 10, 1.5 * s.etchM);
  const wHi = Math.min(LIM.w[1], s.w * 10);
  const ws = Array.from({ length: 151 }, (_, i) => wLo * (wHi / wLo) ** (i / 150));
  const lOf = (w: number) => lengthFor(n, w, s.nc);
  const tolOf = (w: number) => tolerance(lOf(w), w, s.nc, s.tol / 100, s.etchP, s.etchM);
  const okW = ws.filter((w) => tolOf(w) != null);
  const t0 = tolerance(s.l, s.w, s.nc, s.tol / 100, s.etchP, s.etchM);
  // 1. untrimmed tolerance vs width at this resistance (L follows W)
  const tw: GraphSpec = {
    id: 'tol-vs-w',
    title: 'Tolerance vs width',
    subtitle: `${n.toPrecision(3)} squares (L follows W) · sheet ±${s.tol} % · etch +${si(s.etchP, 'm', 2)}/−${si(s.etchM, 'm', 2)}`,
    x: { label: 'Element width W', unit: 'm', log: true },
    y: [{ id: 't', label: 'Untrimmed tolerance', unit: '%', includeZero: true }],
    series: [
      { label: '+ (high)', x: okW, y: okW.map((w) => 100 * tolOf(w)!.plus), axis: 't', width: 2.2 },
      { label: '− (low)', x: okW, y: okW.map((w) => 100 * tolOf(w)!.minus), axis: 't', color: '#c47b17', width: 1.6, dash: [6, 3] },
    ],
    hlines: [{ value: s.tol, label: `sheet ±${s.tol} %`, axis: 't', color: '#9a8f7a', dash: [3, 3] }],
    vlines: [{ value: s.w, label: `W = ${si(s.w, 'm', 3)}` }],
    markers: t0 ? [{ x: s.w, y: 100 * t0.plus, axis: 't', label: `+${(100 * t0.plus).toFixed(1)} %` }] : [],
  };
  // 2. power rating vs width at this resistance
  const pw: GraphSpec = {
    id: 'pmax-vs-w',
    title: 'Power rating vs width',
    subtitle: `${n.toPrecision(3)} squares · ${nipRs(s) != null ? `Ohmega tables at ${s.tOp} °C ambient` : `PD = ${si(s.pd * 1e-6, 'W', 3)}/mm²`}`,
    x: { label: 'Element width W', unit: 'm', log: true },
    y: [{ id: 'p', label: 'P_max', unit: 'W', log: true }],
    series: [{ label: 'P_max', x: ws, y: ws.map((w) => powerRating(area(lOf(w), w, s.nc), s.pd, nipRs(s), s.tOp)), axis: 'p', width: 2.2 }],
    hlines: [{ value: s.p, label: `P = ${si(s.p, 'W', 3)}`, axis: 'p', color: '#8b1e1e', dash: [6, 4] }],
    vlines: [{ value: s.w, label: `W = ${si(s.w, 'm', 3)}` }],
    markers: [{ x: s.w, y: powerRating(area(s.l, s.w, s.nc), s.pd, nipRs(s), s.tOp), axis: 'p', label: si(powerRating(area(s.l, s.w, s.nc), s.pd, nipRs(s), s.tOp), 'W', 3) }],
  };
  return okW.length > 1 ? [tw, pw] : [pw];
}

export const def: CalcDef<ErState> = {
  id: ID,
  version: '0.1.0',
  method:
    'R = R_s·(L/W + 0.56·n_c) with 0.56 squares per meander corner (Ohmega design guide); worst-case untrimmed tolerance from the copper etch on W and L plus the sheet tolerance (Snogren, IPC, “Designing Resistors to Embed”); TCR drift from 25 °C; power rating = vendor power density × element area. Material data: Quantic Ohmega Product Selection Guide 2023 (OhmegaPly NiP, Ticer TCR NiCr/NCAS/CrSiO), Ohmega design guide v18 power densities, Snogren Table 2 for polymer thick film. L and W solved in closed form.',
  fields,
  defaults,
  solve: {
    default: 'l',
    analysis: 'r',
    options: [
      { key: 'r', label: 'Resistance, tolerance and power of a drawn element' },
      { key: 'l', label: 'Element length for a target R' },
      { key: 'w', label: 'Element width for a target R' },
    ],
  },
  compute,
  sync: (s) => {
    if (s.solveFor === 'l') fitImperial(s, 'l', 'lUnit');
    if (s.solveFor === 'w') fitImperial(s, 'w', 'wUnit');
    const m = MATERIALS[s.mat];
    const same = (v: [number, number, number, number, Tech]) =>
      Math.abs(v[0] - s.rs) <= 1e-9 * v[0] && Math.abs(v[1] - s.tol) <= 1e-9 && Math.abs(v[2] - s.tcr) <= 1e-9 && Math.abs(v[3] - s.pd) <= 1e-9 * v[3] && v[4] === s.tech;
    if (m && !same(m)) s.mat = 'Custom';
    if (s.mat === 'Custom') for (const [k, v] of Object.entries(MATERIALS)) if (same(v)) s.mat = k;
  },
  examples: [
    { id: 'default', label: '100 Ω in 25 Ω/□ OhmegaPly, 0.5 mm wide: length', state: defaults() },
    {
      id: 'term-50',
      label: '50 Ω series terminations under a BGA, 0.25 mm wide, 50 Ω/□',
      state: { solveFor: 'l', r: 50, rUnit: 'Ω', w: 0.25e-3, wUnit: 'mm', l: 0.25e-3, lUnit: 'mm', nc: 0, mat: 'OhmegaPly NiP 50 Ω/□', tech: 'thin', rs: 50, tol: 5, tcr: 75, pd: 0.138 * MW_MIL2, pdUnit: 'mW/mm²', p: 10e-3, tOp: 70, etchP: 10e-6, etchM: 5e-6, ext: 0.15e-3, extUnit: 'mm' },
    },
    {
      id: 'meander-4k6',
      label: 'Ohmega meander: 37 squares + 16 corners of 100 Ω/□ ≈ 4.6 kΩ',
      state: { solveFor: 'r', w: 0.1e-3, wUnit: 'mm', l: 3.7e-3, lUnit: 'mm', nc: 16, mat: 'OhmegaPly NiP 100 Ω/□', tech: 'thin', rs: 100, tol: 5, tcr: 100, pd: 0.1 * MW_MIL2, pdUnit: 'mW/mm²', p: 5e-3, tOp: 70, etchP: 10e-6, etchM: 5e-6, ext: 0.15e-3, extUnit: 'mm', r: 4600, rUnit: 'kΩ' },
    },
    {
      id: 'pullup-crsio',
      label: '10 kΩ pull-up in Ticer CrSiO 1 kΩ/□, 0.2 mm wide',
      state: { solveFor: 'l', r: 10e3, rUnit: 'kΩ', w: 0.2e-3, wUnit: 'mm', l: 2e-3, lUnit: 'mm', nc: 0, mat: 'Ticer TCR CrSiO 1 kΩ/□', tech: 'thin', rs: 1000, tol: 5, tcr: -300, pd: 250 * W_IN2, pdUnit: 'W/in²', p: 1e-3, tOp: 40, etchP: 10e-6, etchM: 5e-6, ext: 0.15e-3, extUnit: 'mm' },
    },
    {
      id: 'ptf-1k',
      label: '1 kΩ in carbon PTF ink, 1 mm long: width (±40 % class)',
      state: { solveFor: 'w', r: 1000, rUnit: 'kΩ', l: 1e-3, lUnit: 'mm', w: 0.5e-3, wUnit: 'mm', nc: 0, mat: 'PTF carbon ink 100 Ω/□', tech: 'ptf', rs: 100, tol: 10, tcr: 250, pd: 0.1 * MW_MIL2, pdUnit: 'mW/mm²', p: 5e-3, tOp: 70, etchP: 10e-6, etchM: 5e-6, ext: 0.15e-3, extUnit: 'mm' },
    },
    {
      id: 'power-fail',
      label: '25 Ω, 0.25 W in 25 Ω/□ — too small for the power',
      state: { solveFor: 'l', r: 25, rUnit: 'Ω', w: 0.3e-3, wUnit: 'mm', l: 0.3e-3, lUnit: 'mm', nc: 0, mat: 'OhmegaPly NiP 25 Ω/□', tech: 'thin', rs: 25, tol: 5, tcr: 50, pd: 0.15 * MW_MIL2, pdUnit: 'mW/mm²', p: 0.25, tOp: 70, etchP: 10e-6, etchM: 5e-6, ext: 0.15e-3, extUnit: 'mm' },
    },
  ],
};
