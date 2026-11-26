/** Differential via pair — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_LEN_PCB } from '@/core/unitsets';
import { C0, type ReturnPath, johnsonC, johnsonL, partialL, stubResonance, viaIL, zcoax, zdiffVia } from './model';

export const ID = 'pcb/differential-via';

/** Stub insertion loss above which the page warns (a common channel-budget allowance for one via). */
export const IL_WARN_DB = 1;

export const MATERIALS: Record<string, { er: number; tanD: number } | null> = {
  Custom: null,
  'FR-4 (generic)': { er: 4.4, tanD: 0.02 },
  'FR-4 (~1 GHz)': { er: 4.0, tanD: 0.018 },
  RO4350B: { er: 3.66, tanD: 0.0037 },
  RO4003C: { er: 3.55, tanD: 0.0027 },
  'RT/duroid 5880': { er: 2.2, tanD: 0.0009 },
  'Polyimide (Kapton HN)': { er: 3.4, tanD: 0.0026 },
};

export const MODELS: { value: ReturnPath; label: string }[] = [
  { value: 'shared', label: 'Shared antipad / ground-via ring' },
  { value: 'separate', label: 'Separate antipads, dense planes' },
  { value: 'none', label: 'No nearby return (two wires)' },
];

export interface DiffViaState {
  solveFor: 'zdiff' | 'p' | 'D' | 'd';
  zdiff: number;
  model: ReturnPath;
  d: number;
  dUnit: string;
  D: number;
  DUnit: string;
  p: number;
  pUnit: string;
  pad: number;
  padUnit: string;
  h: number;
  hUnit: string;
  lUse: number;
  lUseUnit: string;
  /** Residual stub after back-drilling; null = not back-drilled (stub = h − ℓ_use) */
  backdrill: number | null;
  backdrillUnit: string;
  material: string;
  er: number;
  tanD: number;
  zLine: number;
  f: number;
  fUnit: string;
}

export const defaults = (): DiffViaState => ({
  solveFor: 'D',
  zdiff: 85,
  model: 'shared',
  d: 0.25e-3,
  dUnit: 'mm',
  D: 1.77e-3,
  DUnit: 'mm',
  p: 1.0e-3,
  pUnit: 'mm',
  pad: 0.5e-3,
  padUnit: 'mm',
  h: 1.6e-3,
  hUnit: 'mm',
  lUse: 0.6e-3,
  lUseUnit: 'mm',
  backdrill: null,
  backdrillUnit: 'mm',
  material: 'FR-4 (~1 GHz)',
  er: 4.0,
  tanD: 0.018,
  zLine: 100,
  f: 14e9,
  fUnit: 'GHz',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Via pair',
    note: 'Click ◎ to choose the unknown. The return-path model decides which dimensions matter.',
    fields: [
      { kind: 'number', key: 'zdiff', symbol: 'Z_diff', label: 'Impedance', unit: 'Ω', solvable: true, min: 1, max: 1000, help: 'Differential impedance of the barrel section. Target when solving for a dimension; otherwise the computed TEM estimate of the barrel section.' },
      { kind: 'select', key: 'model', label: 'Return path', options: MODELS, apply: (v, s) => switchModel(s as DiffViaState, v), help: 'Shared: one round antipad or a ring of ground vias of diameter D around both barrels. Separate: each barrel in its own antipad D with ground planes on many layers. Two wires: no nearby return, D unused.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Barrel dia.', units: U_LEN_PCB, unitKey: 'dUnit', solvable: true, min: 10e-6, max: 5e-3, help: 'Barrel diameter: plated barrel outer diameter, about the drill size.' },
      { kind: 'number', key: 'D', symbol: 'D', label: 'Antipad', units: U_LEN_PCB, unitKey: 'DUnit', solvable: true, min: 20e-6, max: 20e-3, visible: (s) => s.model !== 'none', help: 'Antipad or ground-via ring diameter. Clearance diameter in the planes (separate), or the diameter of the shared antipad / ground-via ring around both barrels (shared).' },
      { kind: 'number', key: 'p', symbol: 'p', label: 'Pitch', units: U_LEN_PCB, unitKey: 'pUnit', solvable: true, min: 20e-6, max: 20e-3, visible: (s) => s.model !== 'separate', help: 'Centre-to-centre distance between the two barrels.' },
      // separate antipads: Zdiff does not depend on the pitch, so it is not offered as an unknown (◎) there
      { kind: 'number', key: 'p', symbol: 'p', label: 'Pitch', units: U_LEN_PCB, unitKey: 'pUnit', min: 20e-6, max: 20e-3, visible: (s) => s.model === 'separate', help: 'Centre-to-centre distance between the two barrels. With separate antipads it only has to clear them (D < p); Zdiff does not depend on it.' },
      { kind: 'number', key: 'pad', symbol: 'D_pad', label: 'Pad diameter', units: U_LEN_PCB, unitKey: 'padUnit', min: 10e-6, max: 10e-3, help: 'Used only for Johnson’s pad-capacitance estimate.' },
    ],
  },
  {
    kind: 'section',
    title: 'Board & stub',
    fields: [
      { kind: 'number', key: 'h', symbol: 'H', label: 'Board thickness', units: U_LEN_PCB, unitKey: 'hUnit', min: 50e-6, max: 20e-3 },
      { kind: 'number', key: 'lUse', symbol: 'ℓ_use', label: 'Exit depth', units: U_LEN_PCB, unitKey: 'lUseUnit', min: 0, max: 20e-3, help: 'Depth of the exit layer: the barrel length the signal uses, from the entry layer to the layer where it leaves. The rest down to the far side is the stub.' },
      { kind: 'number', key: 'backdrill', symbol: 'ℓ_bd', label: 'Residual stub', units: U_LEN_PCB, unitKey: 'backdrillUnit', optional: true, zeroHint: 'not back-drilled', min: 0, max: 20e-3, help: 'Stub left after back-drilling (typically 0.1–0.25 mm). Leave blank for a full stub H − ℓ_use.' },
      {
        kind: 'select',
        key: 'material',
        label: 'Material preset',
        options: Object.keys(MATERIALS),
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m) {
            s.er = m.er;
            s.tanD = m.tanD;
          }
        },
      },
      { kind: 'number', key: 'er', symbol: 'εᵣ', label: 'Permittivity', min: 1, max: 20, help: 'Relative permittivity (Dk) of the board dielectric.' },
      { kind: 'number', key: 'tanD', symbol: 'tan δ', label: 'Loss tangent', min: 1e-5, max: 0.2 },
    ],
  },
  {
    kind: 'section',
    title: 'Channel',
    fields: [
      { kind: 'number', key: 'zLine', symbol: 'Z_line', label: 'Trace Zdiff', unit: 'Ω', min: 10, max: 300, help: 'Differential impedance of the traces on both sides; the stub loss is computed between these terminations.' },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1e6, max: 300e9, help: 'Usually the Nyquist frequency: half the bit rate for NRZ (28 Gb/s → 14 GHz), a quarter for PAM4.' },
    ],
  },
];

const LABEL: Record<DiffViaState['solveFor'], string> = { zdiff: 'Differential impedance', p: 'Pitch', D: 'Antipad / ring diameter', d: 'Barrel diameter' };
const SYM: Record<DiffViaState['solveFor'], string> = { zdiff: 'Z_diff', p: 'p', D: 'D', d: 'd' };

const fLen = (m: number) => si(m, 'm', 4);
const fZ = (z: number) => si(z, 'Ω', 4);

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

/** Geometry that the chosen model can represent; returns a message when it cannot. */
export function geometryProblem(model: ReturnPath, d: number, D: number, p: number): string | null {
  if (!(p > d)) return `Pitch ${fLen(p)} must exceed the barrel diameter ${fLen(d)} (the barrels would touch).`;
  if (model === 'separate') {
    if (!(D > d)) return `Antipad ${fLen(D)} must be larger than the barrel ${fLen(d)}.`;
    if (!(D < p)) return `Separate antipads of ${fLen(D)} overlap at ${fLen(p)} pitch: they form one shared opening. Choose the shared-antipad model.`;
  }
  if (model === 'shared' && !(D >= p + d)) return `A shared antipad / ring of ${fLen(D)} does not clear both barrels at ${fLen(p)} pitch (needs D ≥ p + d = ${fLen(p + d)}).`;
  return null;
}

/**
 * Return-path switch. D means a different thing in each model (a shared antipad / ring around both barrels,
 * which must clear p + d, or each barrel's own antipad, which must stay below p), and so does a Zdiff
 * target. So: go back to analysis of the via entered (no target carried into the new model), and when D
 * does not fit the new model, convert it keeping the distance from each barrel centre to its return: the
 * nearest ring wall is D_ring/2 − p/2 away, an own antipad's wall D_antipad/2, so D_ring = D_antipad + p.
 * A value that still does not fit falls back to the middle of the allowed range.
 */
export function switchModel(s: DiffViaState, model: ReturnPath): void {
  s.solveFor = 'zdiff';
  const { d, p } = s;
  if (model === 'none' || !(p > d) || !geometryProblem(model, d, s.D, p)) return;
  if (model === 'separate') {
    const D = s.D - p;
    s.D = D > d && D < p ? D : (d + p) / 2;
  } else {
    const D = s.D + p;
    s.D = D >= p + d ? D : 1.5 * (p + d);
  }
}

export function compute(st: DiffViaState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function fail(msg: string, s: DiffViaState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

const RANGE: Record<'p' | 'D' | 'd', [number, number]> = { p: [20e-6, 20e-3], D: [20e-6, 20e-3], d: [10e-6, 5e-3] };

function run(st: DiffViaState): CalcReport {
  const s: DiffViaState = { ...st };
  let altRoots: number[] = [];
  const k = s.solveFor;
  if (!MODELS.some((m) => m.value === s.model)) throw new Error('Return path must be shared, separate or none.');
  const pos = (name: string, v: unknown) => {
    if (!(finite(name, v) > 0)) throw new Error(`${name} must be > 0.`);
  };
  for (const key of ['d', 'D', 'p'] as const) if (key !== k) pos(LABEL[key], s[key]);
  if (k !== 'zdiff') pos('Target Zdiff', s.zdiff);
  pos('Pad diameter', s.pad);
  pos('Board thickness', s.h);
  if (!(finite('Depth to exit layer', s.lUse) >= 0)) throw new Error('Depth to exit layer must be ≥ 0.');
  if (s.lUse > s.h * (1 + 1e-12)) throw new Error(`The exit layer (${fLen(s.lUse)} deep) is below the far side of a ${fLen(s.h)} board.`);
  if (s.backdrill != null && !(finite('Back-drill stub', s.backdrill) >= 0)) throw new Error('Back-drill stub must be ≥ 0.');
  if (!(finite('εr', s.er) >= 1)) throw new Error('εr must be ≥ 1.');
  if (!(finite('tan δ', s.tanD) >= 0)) throw new Error('tan δ must be ≥ 0.');
  pos('Trace Zdiff', s.zLine);
  pos('Frequency', s.f);

  // ── solve Zdiff(x) = target on the one forward model
  if (k !== 'zdiff') {
    if (s.model === 'separate' && k === 'p') return fail('With separate antipads the planes screen the barrels from each other, so Zdiff does not depend on the pitch. Solve for D or d instead.', s);
    if (s.model === 'none' && k === 'D') return fail('With no nearby return the antipad does not enter the two-wire model. Solve for the pitch or the barrel diameter.', s);
    const g = (x: number) => zdiffVia(s.model, k === 'd' ? x : s.d, k === 'D' ? x : s.D, k === 'p' ? x : s.p, s.er);
    // admissible interval for the unknown, from the geometry rules
    let [lo, hi] = RANGE[k];
    if (k === 'p') lo = Math.max(lo, s.model === 'shared' ? s.d * (1 + 1e-9) : s.d * (1 + 1e-9));
    if (k === 'p' && s.model === 'shared') hi = Math.min(hi, s.D - s.d);
    if (k === 'D' && s.model === 'shared') lo = Math.max(lo, s.p + s.d);
    if (k === 'D' && s.model === 'separate') [lo, hi] = [Math.max(lo, s.d * (1 + 1e-9)), Math.min(hi, s.p * (1 - 1e-9))];
    if (k === 'd') hi = Math.min(hi, s.model === 'shared' ? s.D - s.p : s.model === 'separate' ? Math.min(s.D, s.p) * (1 - 1e-9) : s.p * (1 - 1e-9));
    if (!(hi > lo)) return fail(`No room for ${SYM[k]}: ${geometryProblem(s.model, s.d, s.D, s.p) ?? 'the other dimensions leave no valid range.'}`, s);
    const r = invert(g, s.zdiff, { lo, hi, log: true, samples: 240 });
    const roots = r.roots.filter((x) => Math.abs(g(x) / s.zdiff - 1) < 1e-9);
    if (!roots.length) {
      const zs = Array.from({ length: 241 }, (_, i) => g(lo * (hi / lo) ** ((i + 0.5) / 241))).filter((z) => Number.isFinite(z) && z > 0);
      const range = zs.length ? `${fZ(Math.min(...zs))} … ${fZ(Math.max(...zs))}` : 'empty';
      return fail(`No ${SYM[k]} between ${fLen(lo)} and ${fLen(hi)} gives Zdiff = ${fZ(s.zdiff)} with this return path: the reachable range is ${range}. Change another dimension or the return-path model.`, s);
    }
    // several roots (shared ring: Zdiff peaks in p): take the one nearest the present value
    const cur = st[k];
    const near = (x: number) => (typeof cur === 'number' && cur > 0 ? Math.abs(Math.log(x / cur)) : x);
    const root = [...roots].sort((a, b) => near(a) - near(b))[0];
    altRoots = roots.filter((x) => x !== root);
    s[k] = root;
  }
  const bad = geometryProblem(s.model, s.d, s.D, s.p);
  if (bad) throw new Error(bad);
  const z = zdiffVia(s.model, s.d, s.D, s.p, s.er);
  if (!(z > 0) || !Number.isFinite(z)) throw new Error('These dimensions give no positive impedance in this model.');
  if (k === 'zdiff') {
    if (!(z >= 1 && z <= 1000)) return fail(`Zdiff = ${fZ(z)} is outside 1–1000 Ω, the range of the impedance field: check the dimensions and units.`, s);
    s.zdiff = z;
  }
  const rep = report(s, z);
  if (altRoots.length && k !== 'zdiff') rep.notes.unshift(`Two values of ${SYM[k]} give this Zdiff (the shielded-pair impedance peaks as the barrels approach the ring): ${fLen(s[k])} (shown, nearest the previous value) and ${altRoots.map(fLen).join(', ')}.`);
  return rep;
}

function report(s: DiffViaState, z: number): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const k = s.solveFor;
  const stub = s.backdrill != null ? Math.min(s.backdrill, s.h - s.lUse) : s.h - s.lUse;
  const fRes = stub > 0 ? stubResonance(stub, s.er) : Infinity;
  const il = viaIL(s.f, z, s.zLine, s.er, s.tanD, s.lUse, stub);
  const ilThru = viaIL(s.f, z, s.zLine, s.er, s.tanD, s.lUse, 0);
  const gamma = (z - s.zLine) / (z + s.zLine);
  const vp = C0 / Math.sqrt(s.er);
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  const prim: ResultItem[] = [];
  if (k !== 'zdiff') prim.push(item(k, LABEL[k], s[k], 'm', fLen(s[k]), { symbol: SYM[k], primary: true, solved: true, note: `${(s[k] / 25.4e-6).toFixed(2)} mil` }));
  prim.push(item('zdiff', 'Differential impedance', z, 'Ω', fZ(z), { symbol: 'Z_diff', primary: true, solved: k === 'zdiff', note: k === 'zdiff' ? MODELS.find((m) => m.value === s.model)?.label : 'target' }));
  prim.push(item('fRes', 'Stub resonance', Number.isFinite(fRes) ? fRes : null, 'Hz', Number.isFinite(fRes) ? si(fRes, 'Hz', 4) : 'no stub', { symbol: 'f_res', primary: true, note: 'quarter-wave, upper bound' }));
  prim.push(item('il', `Via loss at ${si(s.f, 'Hz')}`, il, 'dB', `${il.toFixed(2)} dB`, { symbol: 'IL', primary: true, tone: il > IL_WARN_DB ? 'warn' : '', note: `barrel + stub ${fLen(stub)}, ${s.zLine} Ω traces` }));

  const zc = s.model === 'none' ? null : zcoax(s.d, s.D, s.er);
  const others = MODELS.filter((m) => m.value !== s.model)
    .map((m) => ({ m, bad: geometryProblem(m.value, s.d, s.D, s.p), zz: zdiffVia(m.value, s.d, s.D, s.p, s.er) }))
    .map(({ m, bad, zz }) => item(`zdiff_${m.value}`, m.label, bad || !(zz > 0) ? null : zz, 'Ω', bad || !(zz > 0) ? 'n/a for this geometry' : fZ(zz), { symbol: 'Z_diff', group: 'Other return paths' }));
  const lUseDelay = (s.lUse * Math.sqrt(s.er)) / C0;
  const sec: ResultItem[] = [
    item('zodd', 'Odd-mode impedance', z / 2, 'Ω', fZ(z / 2), { symbol: 'Z_odd', group: 'Pair' }),
    item('gamma', 'Reflection vs traces', gamma, '', `${gamma >= 0 ? '+' : ''}${(gamma * 100).toFixed(1)} %`, { symbol: 'Γ', group: 'Pair', note: `(Z_diff − Z_line)/(Z_diff + Z_line), long-via limit` }),
    ...(zc != null ? [item('zcoax', 'One barrel as coax in D', zc, 'Ω', fZ(zc), { symbol: 'Z_coax', group: 'Pair', note: 'single-ended' })] : []),
    ...others,
    item('stub', 'Stub length', stub, 'm', fLen(stub), { symbol: 'ℓ_stub', group: 'Stub', note: s.backdrill != null ? 'after back-drill' : 'H − ℓ_use' }),
    item('ilStub', 'Loss added by the stub', il - ilThru, 'dB', `${(il - ilThru).toFixed(2)} dB`, { symbol: 'ΔIL', group: 'Stub', tone: il - ilThru > IL_WARN_DB ? 'warn' : '', note: `barrel section alone ${ilThru.toFixed(2)} dB` }),
    item('stubAtF', 'Stub that resonates at f', vp / (4 * s.f), 'm', fLen(vp / (4 * s.f)), { symbol: 'λ/4', group: 'Stub', note: 'keep the stub well below this' }),
    item('delay', 'Delay through ℓ_use', lUseDelay, 's', si(lUseDelay, 's', 3), { symbol: 't_d', group: 'Barrel section (TEM)' }),
    item('lLoop', 'Pair loop inductance', (z * Math.sqrt(s.er) * s.lUse) / C0, 'H', si((z * Math.sqrt(s.er) * s.lUse) / C0, 'H', 3), { symbol: 'L_diff', group: 'Barrel section (TEM)', note: 'Z_diff·t_d over ℓ_use' }),
    item('cDiff', 'Pair capacitance', (Math.sqrt(s.er) * s.lUse) / (C0 * z), 'F', si((Math.sqrt(s.er) * s.lUse) / (C0 * z), 'F', 3), { symbol: 'C_diff', group: 'Barrel section (TEM)', note: 't_d/Z_diff over ℓ_use' }),
  ];
  // Johnson's pad capacitance needs a real per-via antipad: only the separate-antipad model has one
  if (s.model === 'separate' && s.D > s.pad) {
    const cj = johnsonC(s.er, s.h, s.pad, s.D);
    sec.push(item('cJohnson', 'Pad-to-plane capacitance', cj, 'F', si(cj, 'F', 3), { symbol: 'C_via', group: 'Single-via estimates', note: 'Johnson & Graham: 1.41·εr·T·D_pad/(D − D_pad) pF, inches' }));
  }
  const lr = partialL(s.h, s.d);
  const lj = johnsonL(s.h, s.d);
  sec.push(item('lPartial', 'Barrel partial inductance', lr, 'H', si(lr, 'H', 3), { symbol: 'L_via', group: 'Single-via estimates', note: 'Rosa/Grover: 5.08·h·[ln(4h/d) − 1] nH, full board' }));
  sec.push(item('lJohnson', 'Same, Johnson’s book form', lj, 'H', si(lj, 'H', 3), { symbol: 'L_J', group: 'Single-via estimates', note: '5.08·h·[ln(4h/d) + 1] nH as printed; see theory' }));
  rep.results = [...prim, ...sec];

  // ── validity and design warnings
  if (s.model === 'shared' && s.p / s.d < 3) rep.warnings.push(`p/d = ${(s.p / s.d).toFixed(2)} < 3: the shielded-pair formula assumes thin barrels and reads high (ln(2p/d) exceeds the exact two-wire arccosh(p/d) by ${((Math.log((2 * s.p) / s.d) / Math.acosh(s.p / s.d) - 1) * 100).toFixed(1)} % here). Treat Zdiff as an upper estimate.`);
  if (s.model === 'shared' && s.D / s.p < 1.6) rep.warnings.push(`The ring diameter is only ${(s.D / s.p).toFixed(2)}× the pitch: barrels this close to the return dominate the field, and the thin-wire image solution loses accuracy. Confirm with a 3-D solver.`);
  if (s.model === 'none' && s.p / s.d < 1.2) rep.warnings.push('Barrels nearly touching: proximity effect concentrates current on the facing walls, and pad and antipad details dominate.');
  if (il - ilThru > IL_WARN_DB) rep.warnings.push(`The stub adds ${(il - ilThru).toFixed(2)} dB at ${si(s.f, 'Hz')} (more than ${IL_WARN_DB} dB): its resonance at ${si(fRes, 'Hz', 3)} is too close. Back-drill, exit on a deeper layer, or use a thinner board.`);
  if (ilThru > IL_WARN_DB) rep.warnings.push(`The barrel section alone costs ${ilThru.toFixed(2)} dB at ${si(s.f, 'Hz')}: Zdiff ${fZ(z)} against ${s.zLine} Ω traces over ${fLen(s.lUse)} is a large mismatch. Bring Zdiff closer to the trace impedance (antipad, pitch, ground-via ring).`);
  if (stub > 0 && fRes < 3 * s.f && il - ilThru <= IL_WARN_DB) rep.notes.push(`The stub resonance ${si(fRes, 'Hz', 3)} is within 3× of f: pad capacitance pulls it lower than this quarter-wave bound, so leave margin.`);
  if (Math.abs(gamma) > 0.1) rep.notes.push(`The barrel section is ${Math.abs(gamma * 100).toFixed(0)} % ${gamma > 0 ? 'above' : 'below'} the trace impedance; on a short via this shows as a ${gamma > 0 ? 'inductive' : 'capacitive'} bump in TDR rather than a full reflection.`);
  if (s.backdrill != null && s.backdrill > s.h - s.lUse) rep.notes.push('Back-drill stub is longer than the stub itself: no back-drill needed.');
  rep.notes.push(
    'Accuracy: each formula is an exact (or thin-wire exact) 2-D TEM solution for its idealised return path. A real via returns its current only at the plane layers and through nearby ground vias, so expect the true value between the models and confirm with a 3-D field solver or a TDR coupon. No published bound covers the general case.',
    'Pads, non-functional pads and the trace-to-via transitions add capacitance that lowers the impedance and the stub resonance; they are not in the TEM model.',
    'Single-via L and C are rough lumped estimates that assume a via much longer than its diameter; the pair values from Z_diff are consistent with the impedance model. Pad capacitance is shown only for separate antipads, the one model with a per-via antipad.',
  );
  rep.summary = `${MODELS.find((m) => m.value === s.model)?.label} · p/d ${(s.p / s.d).toFixed(2)}${s.model !== 'none' ? ` · D/d ${(s.D / s.d).toFixed(2)}` : ''} · stub ${fLen(stub)} → f_res ${Number.isFinite(fRes) ? si(fRes, 'Hz', 3) : '—'}`;
  rep.details = { z, stub, fRes, il, ilThru, gamma };
  rep.graphs = graphs(s, z, stub, fRes, il);
  return rep;
}

function graphs(s: DiffViaState, z: number, stub: number, fRes: number, il: number): GraphSpec[] {
  const fMax = Math.min(Math.max(2 * s.f, Number.isFinite(fRes) ? 1.3 * fRes : 0, 1e9), 500e9);
  const fs = Array.from({ length: 321 }, (_, i) => (fMax * i) / 320).slice(1);
  fs.push(s.f);
  if (Number.isFinite(fRes) && fRes < fMax) fs.push(fRes);
  fs.sort((a, b) => a - b);
  const ils = fs.map((f) => Math.min(viaIL(f, z, s.zLine, s.er, s.tanD, s.lUse, stub), 80));
  const ps = Array.from({ length: 161 }, (_, i) => s.d * (1.05 + (Math.max(10, (2 * s.p) / s.d) - 1.05) * (i / 160)));
  const curve = (m: ReturnPath) => {
    const x: number[] = [];
    const y: number[] = [];
    for (const p of ps) {
      if (geometryProblem(m, s.d, s.D, p)) continue;
      const v = zdiffVia(m, s.d, s.D, p, s.er);
      if (v > 0 && Number.isFinite(v)) {
        x.push(p);
        y.push(v);
      }
    }
    return { x, y };
  };
  const colors: Record<ReturnPath, string> = { shared: '#1f4e5f', separate: '#c47b17', none: '#4f8a8b' };
  const series = MODELS.map((m) => ({ m, c: curve(m.value) }))
    .filter(({ c }) => c.x.length > 1)
    .map(({ m, c }) => ({ label: m.label, x: c.x, y: c.y, color: colors[m.value], width: m.value === s.model ? 2.4 : 1.2, dash: m.value === s.model ? undefined : [5, 3] }));
  return [
    {
      id: 'stub-loss',
      title: 'Via loss vs frequency',
      x: { label: 'Frequency', unit: 'Hz' },
      y: [{ id: 'il', label: 'Insertion loss', unit: 'dB', includeZero: true }],
      // the resonance peak often sits in the top-right corner: keep the legend off the plot
      legend: 'below',
      series: [{ label: `IL, stub ${fLen(stub)}`, x: fs, y: ils, width: 2.2 }],
      hlines: [{ value: IL_WARN_DB, label: `${IL_WARN_DB} dB`, dash: [5, 4] }],
      vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz')}` }, ...(Number.isFinite(fRes) && fRes < fMax ? [{ value: fRes, label: `f_res ${si(fRes, 'Hz', 3)}`, dash: [2, 3] }] : [])],
      markers: [{ x: s.f, y: Math.min(il, 80), label: `${il.toFixed(2)} dB` }],
    },
    {
      id: 'zdiff-vs-pitch',
      title: 'Zdiff vs pitch',
      subtitle: `d = ${fLen(s.d)}${s.model !== 'none' ? `, D = ${fLen(s.D)}` : ''}, εr = ${s.er}`,
      x: { label: 'Pitch p', unit: 'm' },
      y: [{ id: 'z', label: 'Z_diff', unit: 'Ω' }],
      series,
      hlines: [{ value: s.zLine, label: `traces ${s.zLine} Ω`, color: '#9a8f7a', dash: [3, 3] }],
      vlines: [{ value: s.p, label: `p = ${fLen(s.p)}` }],
      markers: [{ x: s.p, y: z, label: fZ(z) }],
    },
  ];
}

export const def: CalcDef<DiffViaState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Barrel-section Zdiff from three TEM cross-sections: coaxial via in its own antipad (Zdiff = 2Z_coax), balanced pair in a circular shield (Reference Data for Engineers thin-wire formula) or bare two-wire line (exact arccosh). Stub as an open lossy line (quarter-wave resonance, ABCD insertion loss between the trace impedance); Johnson & Graham single-via L and C estimates. Solve-for by Brent root finding on Zdiff(x). Accuracy against a real 3-D via is not bounded; verify with a field solver.',
  fields,
  defaults,
  solve: {
    default: 'D',
    analysis: 'zdiff',
    options: [
      { key: 'zdiff', label: 'Zdiff from the geometry (analysis)' },
      { key: 'D', label: 'Antipad / ring diameter D for a target Zdiff' },
      { key: 'p', label: 'Pitch p for a target Zdiff' },
      { key: 'd', label: 'Barrel diameter d for a target Zdiff' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m && (Math.abs(m.er - s.er) > 1e-9 || Math.abs(m.tanD - s.tanD) > 1e-12)) s.material = 'Custom';
  },
  examples: [
    { id: 'default', label: '85 Ω pair, ground-via ring: solve D (1.6 mm board)', state: defaults() },
    { id: 'separate', label: 'Separate 0.65 mm antipads, dense planes (analysis)', state: { solveFor: 'zdiff', model: 'separate', d: 0.25e-3, D: 0.65e-3, p: 1.0e-3, pad: 0.5e-3, h: 1.6e-3, lUse: 1.4e-3, backdrill: null, material: 'FR-4 (~1 GHz)', er: 4.0, tanD: 0.018, f: 14e9 } },
    { id: 'thick-stub', label: '3 mm backplane, layer-3 exit: stub resonance at 28 Gb/s', state: { solveFor: 'zdiff', model: 'shared', d: 0.3e-3, D: 2.0e-3, p: 1.0e-3, pad: 0.55e-3, h: 3.0e-3, lUse: 0.4e-3, backdrill: null, material: 'FR-4 (~1 GHz)', er: 4.0, tanD: 0.018, f: 14e9 } },
    { id: 'backdrill', label: 'Same backplane, back-drilled to 0.2 mm', state: { solveFor: 'zdiff', model: 'shared', d: 0.3e-3, D: 2.0e-3, p: 1.0e-3, pad: 0.55e-3, h: 3.0e-3, lUse: 0.4e-3, backdrill: 0.2e-3, material: 'FR-4 (~1 GHz)', er: 4.0, tanD: 0.018, f: 14e9 } },
    { id: 'two-wire', label: 'No planes: pitch for 100 Ω two-wire pair', state: { solveFor: 'p', zdiff: 100, model: 'none', d: 0.25e-3, pad: 0.5e-3, h: 1.6e-3, lUse: 1.6e-3, backdrill: null, material: 'RO4350B', er: 3.66, tanD: 0.0037, f: 10e9 } },
  ],
};
