/** Printed spiral inductor — calculator definition (inputs, solve-for, report). DOM-free. */

import { invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_IND, U_LEN_PCB, U_THICK, withDefault } from '@/core/unitsets';
import {
  MONO,
  RHO_CU,
  WHEELER,
  crowdingFreq,
  inductance,
  innerDiameter,
  lMonomial,
  lSheet,
  lWheeler,
  maxTurns,
  skinDepth,
  skinFactor,
  trackLength,
  underpassLength,
  type Expr,
  type Shape,
  type SpiralGeom,
} from './model';

export const ID = 'pcb/planar-spiral-inductor';

export interface SpiralState {
  solveFor: 'l' | 'n' | 'dout';
  l: number;
  lUnit: string;
  shape: Shape;
  expr: Expr;
  n: number;
  dout: number;
  doutUnit: string;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
  t: number;
  tUnit: string;
  f: number;
  fUnit: string;
}

const U_L = withDefault(U_IND, 'µH');

export const defaults = (): SpiralState => ({
  solveFor: 'n',
  l: 1.5e-6,
  lUnit: 'µH',
  shape: 'square',
  expr: 'sheet',
  n: 6,
  dout: 25e-3,
  doutUnit: 'mm',
  w: 0.5e-3,
  wUnit: 'mm',
  s: 0.3e-3,
  sUnit: 'mm',
  t: 35e-6,
  tUnit: 'µm',
  f: 13.56e6,
  fUnit: 'MHz',
});

/** Field limits (every solved value stays inside them). */
const LIM = { l: [1e-12, 1e-2], n: [1, 200], dout: [50e-6, 1] } as const;

const EXPR_NAME: Record<Expr, string> = { sheet: 'current sheet', wheeler: 'modified Wheeler', monomial: 'monomial fit' };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Coil',
    note: 'Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'l', symbol: 'L', label: 'Inductance', units: U_L, unitKey: 'lUnit', solvable: true, min: LIM.l[0], max: LIM.l[1], help: 'Target inductance when solving for n or d_out; otherwise the result (low-frequency inductance, Mohan et al. 1999).' },
      {
        kind: 'select',
        key: 'shape',
        label: 'Shape',
        options: [
          { value: 'square', label: 'Square' },
          { value: 'hexagonal', label: 'Hexagonal' },
          { value: 'octagonal', label: 'Octagonal' },
          { value: 'circular', label: 'Circular' },
        ],
        apply: (v, s) => {
          // Wheeler and the monomial fit have no circular coefficients: fall back to the current sheet.
          if (v === 'circular') s.expr = 'sheet';
        },
        help: 'Outline of each turn. d_out and d_in are measured across the flats (side to side), as in Mohan et al.',
      },
      {
        kind: 'select',
        key: 'expr',
        label: 'Expression',
        options: [
          { value: 'sheet', label: 'Current sheet (Mohan eq. 2)' },
          { value: 'wheeler', label: 'Modified Wheeler (eq. 1)' },
          { value: 'monomial', label: 'Monomial fit (eq. 3)' },
        ],
        apply: (v, s) => {
          if (v !== 'sheet' && s.shape === 'circular') s.shape = 'square';
        },
        help: 'Which of Mohan’s three expressions sets L (all three are shown in the results). Current sheet: derived from geometry, covers every shape. Modified Wheeler: simplest. Monomial: a fit to on-chip sizes, drifts a few % at PCB sizes. Wheeler and monomial have no circular coefficients.',
      },
      { kind: 'number', key: 'n', symbol: 'n', label: 'Turns', solvable: true, min: LIM.n[0], max: LIM.n[1], help: 'Number of turns; fractions are allowed (quarter turns for a square spiral).' },
      { kind: 'number', key: 'dout', symbol: 'd_out', label: 'Outer diameter', units: U_LEN_PCB, unitKey: 'doutUnit', solvable: true, min: LIM.dout[0], max: LIM.dout[1], help: 'Outer edge to outer edge across the flats of the outermost turn.' },
      { kind: 'number', key: 'w', symbol: 'w', label: 'Track width', units: U_LEN_PCB, unitKey: 'wUnit', min: 1e-6, max: 0.05 },
      { kind: 'number', key: 's', symbol: 's', label: 'Track spacing', units: U_LEN_PCB, unitKey: 'sUnit', min: 1e-6, max: 0.05, help: 'Edge-to-edge gap between adjacent turns.' },
    ],
  },
  {
    kind: 'section',
    title: 'Copper and frequency',
    fields: [
      { kind: 'number', key: 't', symbol: 't', label: 'Copper thickness', units: U_THICK, unitKey: 'tUnit', min: 1e-6, max: 1e-3, help: '1 oz ≈ 35 µm. Sets the resistance; Mohan’s expressions ignore thickness for L.' },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency for Q', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e11, help: 'Frequency for the AC resistance and Q. L is the low-frequency value.' },
    ],
  },
];

const LABEL: Record<SpiralState['solveFor'], string> = { l: 'Inductance', n: 'Turns', dout: 'Outer diameter' };
const fLen = (m: number) => si(m, 'm', 4);
const fL = (h: number) => si(h, 'H', 4);
const fR = (r: number) => si(r, 'Ω', 4);

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: SpiralState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function fail(msg: string, s: SpiralState): CalcReport {
  return { ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
}

const geom = (s: SpiralState): SpiralGeom => ({ shape: s.shape, n: s.n, dout: s.dout, w: s.w, s: s.s });

/*
 * Mode-switch harness: "error-after-edit" flags on typed numbers (×10, min, max of n, d_out, w, s or the target L)
 * are intended: those values make the coil impossible (turns that do not fit, L beyond what fits) and the error says
 * which way to go. Setting switches (shape, expression, examples) never produce one.
 */

/** Search ranges: n up to a turn short of filling the coil (d_in > 0), d_out from just fitting the turns. */
function rangeFor(s: SpiralState, key: 'n' | 'dout'): { lo: number; hi: number } {
  if (key === 'n') return { lo: LIM.n[0], hi: Math.min(LIM.n[1], maxTurns(s.dout, s.w, s.s) * (1 - 1e-9)) };
  const dmin = 2 * s.n * s.w + 2 * (s.n - 1) * s.s;
  return { lo: Math.max(LIM.dout[0], dmin * (1 + 1e-9)), hi: LIM.dout[1] };
}

function run(st: SpiralState): CalcReport {
  const s: SpiralState = { ...st };
  let other: number | undefined;
  const k = s.solveFor;
  if (!['square', 'hexagonal', 'octagonal', 'circular'].includes(s.shape)) throw new Error('Unknown shape.');
  if (s.expr !== 'sheet' && s.shape === 'circular') s.expr = 'sheet';
  for (const [key, name] of [['w', 'Track width'], ['s', 'Track spacing'], ['t', 'Copper thickness'], ['f', 'Frequency']] as const)
    if (!(finite(name, s[key]) > 0)) throw new Error(`${name} must be > 0.`);
  if (k !== 'n' && !(finite('Turns', s.n) >= 1)) throw new Error('Turns must be ≥ 1.');
  if (k !== 'dout' && !(finite('Outer diameter', s.dout) > 0)) throw new Error('Outer diameter must be > 0.');
  if (k !== 'l' && !(finite('Inductance', s.l) > 0)) throw new Error('Target inductance must be > 0.');

  if (k === 'l') {
    if (!(innerDiameter(geom(s)) > 0)) {
      const nmax = maxTurns(s.dout, s.w, s.s);
      return fail(`${+s.n.toPrecision(4)} turns of ${fLen(s.w)} track at ${fLen(s.s)} spacing do not fit in d_out = ${fLen(s.dout)}: the inner diameter would be ${fLen(innerDiameter(geom(s)))}. At most ${nmax.toFixed(2)} turns fit; reduce n, w or s, or enlarge d_out.`, s);
    }
  } else {
    const r = rangeFor(s, k);
    if (!(r.hi > r.lo)) return fail(k === 'n' ? `Not even one turn of ${fLen(s.w)} track fits in d_out = ${fLen(s.dout)}.` : 'No outer diameter fits these turns.', s);
    const g = (x: number) => inductance({ ...geom(s), [k]: x }, s.expr);
    const inv = invert(g, s.l, { lo: r.lo, hi: r.hi, log: true, samples: 200 });
    // Near a full coil L(n) peaks and dips, so a target can have two turn counts: take the smaller (the hollower
    // coil, better Q, inside Mohan's d_in ≥ 0.1·d_out range) and mention the other. A round trip from a state on the
    // far side of the peak therefore returns the smaller n (expected, see the note).
    const valid = inv.roots.filter((x) => Math.abs(g(x) / s.l - 1) < 1e-9);
    const root = valid[0];
    if (valid.length > 1) other = valid[valid.length - 1];
    if (root == null) {
      const lo = g(r.lo);
      const hi = g(r.hi);
      const max = Math.max(lo, hi);
      const min = Math.min(lo, hi);
      if (k === 'n')
        return fail(
          s.l > max
            ? `L = ${fL(s.l)} needs more turns than fit in d_out = ${fLen(s.dout)} (at most ${fL(max)} with ${r.hi.toFixed(2)} turns). Enlarge d_out or use a narrower track and spacing.`
            : `L = ${fL(s.l)} is below one turn (${fL(min)}): shrink d_out instead.`,
          s,
        );
      return fail(s.l > max ? `L = ${fL(s.l)} needs d_out above ${fLen(r.hi)}.` : `L = ${fL(s.l)} needs a smaller coil than ${+s.n.toPrecision(4)} turns of this track can make (minimum ${fL(min)} at d_out = ${fLen(r.lo)}): reduce n.`, s);
    }
    s[k] = root;
  }
  const lim = LIM[k];
  const v = k === 'l' ? inductance(geom(s), s.expr) : s[k];
  if (!(v >= lim[0] && v <= lim[1])) return fail(`${LABEL[k]} = ${k === 'l' ? fL(v) : k === 'n' ? v.toPrecision(4) : fLen(v)} is outside the field range: check the units.`, s);
  if (k === 'l') s.l = v;
  const rep = report(s);
  if (other != null) rep.notes.unshift(`A second solution exists: ${k === 'n' ? `n = ${other.toPrecision(4)} turns` : `d_out = ${fLen(other)}`} gives the same L with a fuller coil (L peaks as the turns reach the centre). The page shows the hollower one, which has the better Q.`);
  return rep;
}

function report(s: SpiralState): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const g = geom(s);
  const k = s.solveFor;
  const din = innerDiameter(g);
  const davg = (s.dout + din) / 2;
  const rho = (s.dout - din) / (s.dout + din);
  const L = inductance(g, s.expr);
  const lw = lWheeler(g);
  const lg = lSheet(g);
  const lm = lMonomial(g);
  const len = trackLength(g);
  const lu = underpassLength(g);
  const rdc = (RHO_CU * (len + lu)) / (s.w * s.t);
  const kac = skinFactor(s.t, s.f);
  const rac = rdc * kac;
  const xl = 2 * Math.PI * s.f * L;
  const q = xl / rac;
  const delta = skinDepth(s.f);
  const fcr = crowdingFreq(s.w, s.s, s.t);
  const lam = 299_792_458 / s.f;

  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const prim: ResultItem[] = [];
  if (k === 'n') prim.push(item('n', 'Turns', s.n, '', s.n.toPrecision(4), { symbol: 'n', solved: true, primary: true, note: `round to ${(Math.round(s.n * 4) / 4).toFixed(2)} (quarter turn) and re-check L` }));
  if (k === 'dout') prim.push(item('dout', 'Outer diameter', s.dout, 'm', fLen(s.dout), { symbol: 'd_out', solved: true, primary: true, note: `d_in = ${fLen(din)}` }));
  prim.push(item('l', 'Inductance', L, 'H', fL(L), { symbol: 'L', primary: true, solved: k === 'l', note: `${EXPR_NAME[s.expr]} · typ. error 1–3 % vs field solver` }));
  prim.push(item('q', `Q at ${si(s.f, 'Hz', 3)}`, q, '', q.toPrecision(3), { symbol: 'Q', primary: true, note: 'skin effect only: an upper bound' }));
  prim.push(item('rdc', 'DC resistance', rdc, 'Ω', fR(rdc), { symbol: 'R_dc', primary: true, note: `spiral ${fR((RHO_CU * len) / (s.w * s.t))} + under-pass ${fR((RHO_CU * lu) / (s.w * s.t))}` }));

  const pct = (x: number) => (Number.isFinite(x) ? `${x >= L ? '+' : '−'}${Math.abs((x / L - 1) * 100).toFixed(1)} %` : '');
  const noC = s.shape === 'circular' ? 'no circular coefficients' : '';
  const sec: ResultItem[] = [
    item('lSheet', 'Current sheet (eq. 2)', lg, 'H', fL(lg), { symbol: 'L_gmd', group: 'Inductance, Mohan et al. 1999', note: s.expr === 'sheet' ? 'used' : pct(lg) }),
    item('lWheeler', 'Modified Wheeler (eq. 1)', Number.isFinite(lw) ? lw : null, 'H', Number.isFinite(lw) ? fL(lw) : '—', { symbol: 'L_mw', group: 'Inductance, Mohan et al. 1999', note: s.expr === 'wheeler' ? 'used' : noC || pct(lw) }),
    item('lMono', 'Monomial fit (eq. 3)', Number.isFinite(lm) ? lm : null, 'H', Number.isFinite(lm) ? fL(lm) : '—', { symbol: 'L_mon', group: 'Inductance, Mohan et al. 1999', note: s.expr === 'monomial' ? 'used' : noC || pct(lm) }),
    item('din', 'Inner diameter', din, 'm', fLen(din), { symbol: 'd_in', group: 'Geometry', note: `d_out − 2n·w − 2(n − 1)·s · d_in/d_out = ${(din / s.dout).toFixed(3)}` }),
    item('davg', 'Average diameter', davg, 'm', fLen(davg), { symbol: 'd_avg', group: 'Geometry' }),
    item('fill', 'Fill ratio', rho, '', rho.toFixed(4), { symbol: 'ρ', group: 'Geometry', note: '(d_out − d_in)/(d_out + d_in): 0 hollow, 1 full' }),
    item('len', 'Track length', len, 'm', fLen(len), { symbol: 'l', group: 'Geometry', note: `n × perimeter at d_avg · under-pass ≈ ${fLen(lu)}` }),
    item('delta', 'Skin depth', delta, 'm', fLen(delta), { symbol: 'δ', group: `At ${si(s.f, 'Hz', 3)}`, note: `t/δ = ${(s.t / delta).toPrecision(3)}` }),
    item('rac', 'AC resistance', rac, 'Ω', fR(rac), { symbol: 'R_ac', group: `At ${si(s.f, 'Hz', 3)}`, note: `${kac.toPrecision(3)} × R_dc (Yue–Wong skin factor)` }),
    item('xl', 'Reactance', xl, 'Ω', fR(xl), { symbol: 'X_L', group: `At ${si(s.f, 'Hz', 3)}` }),
    item('fcrowd', 'Current-crowding onset', fcr, 'Hz', si(fcr, 'Hz', 3), { symbol: 'f_crit', group: `At ${si(s.f, 'Hz', 3)}`, note: 'Kuhn & Ibrahim: inner turns lose Q above this', tone: s.f > fcr ? 'warn' : '' }),
  ];
  rep.results = [...prim, ...sec];
  rep.summary = `${s.shape} spiral · n = ${s.n.toPrecision(3)} · d_out ${fLen(s.dout)} · w/s ${fLen(s.w)}/${fLen(s.s)} · ρ = ${rho.toFixed(2)}`;

  // ── validity (Mohan's database: d_in 0.1–0.9 d_out, w ≤ 0.3 d_out, s ≤ 3w) and loss caveats
  const w = rep.warnings;
  if (din / s.dout < 0.1) w.push(`d_in/d_out = ${(din / s.dout).toFixed(3)} is below 0.1, the fullest coil in Mohan’s field-solver set: the inner turns add little inductance and much resistance, and the error is unchecked here. Leave the centre open (d_in ≳ 0.2 d_out) for a better Q.`);
  if (din / s.dout > 0.9) w.push(`d_in/d_out = ${(din / s.dout).toFixed(3)} is above 0.9, outside Mohan’s range: a very hollow coil. Check with a field solver.`);
  if (s.w > 0.3 * s.dout) w.push(`w is more than 0.3·d_out, outside Mohan’s field-solver range.`);
  if (s.s > 3 * s.w) w.push(`s = ${(s.s / s.w).toFixed(2)}·w is above 3w: the current-sheet expression loses accuracy (worst 8 % at s = 3w, more beyond). Use the modified Wheeler or a field solver.`);
  if (s.n < 2) w.push('Fewer than 2 turns: the expressions were validated on multi-turn spirals (Table IV starts at n = 2); expect larger errors.');
  if (s.expr === 'monomial' && (s.dout > 480e-6 || s.dout < 100e-6)) {
    const m = MONO[s.shape]!;
    const drift = ((s.dout / 300e-6) ** (m[1] + m[2] + m[3] + m[5] - 1) - 1) * 100;
    w.push(`The monomial was fitted to on-chip coils (d_out 100–480 µm) and is not scale-free: at d_out = ${fLen(s.dout)} it is extrapolated, roughly ${drift >= 0 ? '+' : '−'}${Math.abs(drift).toFixed(1)} % from scaling alone. Prefer the current-sheet or Wheeler expression for PCB coils.`);
  }
  if (s.f > fcr) w.push(`f is above the current-crowding onset (${si(fcr, 'Hz', 3)}): eddy currents push the current to the edges of the inner turns, so the real R is higher and Q lower than shown. Wider spacing or a hollow coil helps.`);
  if (len + lu > lam / 10) w.push(`The track (${fLen(len + lu)}) is more than λ/10 at f: the coil is near or past self-resonance, where it no longer acts as an inductor. Self-resonance (turn-to-turn and under-pass capacitance) is not modelled; use a lower f or a field solver.`);
  rep.notes.push('L is the low-frequency (DC) inductance in free space. A copper pour or plane under or near the coil cuts L and Q: keep a clearance of at least the coil diameter, or account for it with a field solver.');
  rep.notes.push('Q uses skin effect only (Yue–Wong); proximity/current crowding, dielectric loss and self-resonance lower it.');
  rep.notes.push(`Copper resistivity 1/58 Ω·mm²/m (annealed, 20 °C); R rises about 0.39 %/K. The under-pass is taken as ≈ ${fLen(lu)} of the same track on the other layer.`);

  rep.graphs = graphs(s, L);
  rep.tables = [turnsTable(s)];
  rep.details = { din, davg, rho, lSheet: lg, lWheeler: lw, lMono: lm, trackLength: len, underpass: lu, rdc, rac, q, skinDepth: delta, fCrowd: fcr };
  return rep;
}

function graphs(s: SpiralState, L: number): GraphSpec[] {
  const nmax = Math.min(maxTurns(s.dout, s.w, s.s) * 0.999, LIM.n[1]);
  const n0 = 1;
  const ns: number[] = [];
  for (let i = 0; i <= 160; i++) ns.push(n0 + ((nmax - n0) * i) / 160);
  const at = (e: Expr) => ns.map((n) => inductance({ ...geom(s), n }, e));
  const series: NonNullable<GraphSpec['series']> = [{ label: 'Current sheet', x: ns, y: at('sheet'), axis: 'l', width: s.expr === 'sheet' ? 2.4 : 1.3, color: '#1f4e5f' }];
  if (WHEELER[s.shape]) series.push({ label: 'Mod. Wheeler', x: ns, y: at('wheeler'), axis: 'l', width: s.expr === 'wheeler' ? 2.4 : 1.3, color: '#c47b17', dash: s.expr === 'wheeler' ? undefined : [5, 3] });
  if (MONO[s.shape]) series.push({ label: 'Monomial', x: ns, y: at('monomial'), axis: 'l', width: s.expr === 'monomial' ? 2.4 : 1.3, color: '#6b5b95', dash: s.expr === 'monomial' ? undefined : [2, 3] });
  // Q vs frequency (skin effect only), a decade and a half either side of f
  const fs: number[] = [];
  for (let i = 0; i <= 160; i++) fs.push((s.f / 100) * 1e4 ** (i / 160));
  const g = geom(s);
  const rdc = (RHO_CU * (trackLength(g) + underpassLength(g))) / (s.w * s.t);
  const qs = fs.map((f) => (2 * Math.PI * f * L) / (rdc * skinFactor(s.t, f)));
  const fcr = crowdingFreq(s.w, s.s, s.t);
  const qf = (2 * Math.PI * s.f * L) / (rdc * skinFactor(s.t, s.f));
  return [
    {
      id: 'l-vs-n',
      title: 'Inductance vs turns',
      subtitle: `d_out = ${fLen(s.dout)}, w = ${fLen(s.w)}, s = ${fLen(s.s)} · up to the fullest coil`,
      x: { label: 'Turns n', unit: '' },
      y: [{ id: 'l', label: 'Inductance', unit: 'H' }],
      series,
      hlines: s.solveFor === 'l' ? [] : [{ value: s.l, label: `target ${fL(s.l)}`, axis: 'l', color: '#9a8f7a', dash: [3, 3] }],
      vlines: [{ value: s.n, label: `n = ${s.n.toPrecision(3)}`, color: '#9a8f7a' }],
      markers: [{ x: s.n, y: L, axis: 'l', label: fL(L) }],
    },
    {
      id: 'q-vs-f',
      title: 'Q vs frequency',
      subtitle: 'skin effect only (upper bound); no self-resonance',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'q', label: 'Q', unit: '', includeZero: true }],
      series: [{ label: 'Q (skin effect)', x: fs, y: qs, axis: 'q', width: 2.2 }],
      vlines: [
        { value: s.f, label: `f = ${si(s.f, 'Hz', 3)}`, color: '#9a8f7a' },
        ...(fcr > fs[0] && fcr < fs[fs.length - 1] ? [{ value: fcr, label: 'crowding onset', color: '#8b1e1e', dash: [5, 3] }] : []),
      ],
      markers: [{ x: s.f, y: qf, axis: 'q', label: qf.toPrecision(3) }],
    },
  ];
}

/** L at quarter-turn steps around n (the turn count you would actually lay out). */
function turnsTable(s: SpiralState): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  const tones: ('pass' | 'warn' | 'fail' | '')[] = [];
  const nmax = maxTurns(s.dout, s.w, s.s);
  const c = Math.round(s.n * 4) / 4;
  for (let i = -4; i <= 4; i++) {
    const n = c + i * 0.25;
    if (n < 1 || n >= nmax) continue;
    const g = { ...geom(s), n };
    const L = inductance(g, s.expr);
    const din = innerDiameter(g);
    const rdc = (RHO_CU * (trackLength(g) + underpassLength(g))) / (s.w * s.t);
    const q = (2 * Math.PI * s.f * L) / (rdc * skinFactor(s.t, s.f));
    const err = L / s.l - 1;
    rows.push({ n, l: L, err: s.solveFor === 'l' ? null : err, din, rdc, q });
    display.push({ n: n.toFixed(2), l: fL(L), err: s.solveFor === 'l' ? '—' : `${err >= 0 ? '+' : '−'}${Math.abs(err * 100).toFixed(1)} %`, din: fLen(din), rdc: fR(rdc), q: q.toPrecision(3) });
    tones.push(s.solveFor === 'l' ? '' : Math.abs(err) <= 0.03 ? 'pass' : Math.abs(err) <= 0.1 ? 'warn' : 'fail');
  }
  return {
    id: 'turns',
    title: 'Quarter-turn layouts near n',
    columns: [
      { key: 'n', label: 'n' },
      { key: 'l', label: 'L', unit: 'H' },
      { key: 'err', label: 'vs target' },
      { key: 'din', label: 'd_in', unit: 'm' },
      { key: 'rdc', label: 'R_dc', unit: 'Ω' },
      { key: 'q', label: `Q @ ${si(s.f, 'Hz', 3)}` },
    ],
    rows,
    display,
    ...(s.solveFor === 'l' ? {} : { rowTones: tones }),
    note:
      s.solveFor === 'l'
        ? `Same d_out, w and s; ${EXPR_NAME[s.expr]} expression.`
        : `Same d_out, w and s; ${EXPR_NAME[s.expr]} expression. Green: within 3 % of the target L (the model’s own accuracy); yellow: within 10 %; red: further off.`,
  };
}

export const def: CalcDef<SpiralState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Mohan, Hershenson, Boyd & Lee (IEEE JSSC 1999): modified Wheeler, current-sheet and monomial expressions for square, hexagonal, octagonal and circular spirals (typ. 1–3 % vs field solver). R_dc from n × mean perimeter; skin effect by Yue & Wong (2000); current-crowding onset by Kuhn & Ibrahim (2001). Solve-for by bracketed Brent root finding.',
  fields,
  defaults,
  solve: {
    default: 'n',
    analysis: 'l',
    options: [
      { key: 'l', label: 'Inductance from the layout (analysis)' },
      { key: 'n', label: 'Turns for a target L' },
      { key: 'dout', label: 'Outer diameter for a target L' },
    ],
  },
  compute,
  sync: (s) => {
    if (s.shape === 'circular' && s.expr !== 'sheet') s.expr = 'sheet';
  },
  examples: [
    { id: 'default', label: 'NFC antenna 1.5 µH, 25 mm square, 13.56 MHz (solve n)', state: defaults() },
    { id: 'mohan-1', label: 'Mohan Table IV #1: on-chip 2.75 turns, 344 µm (3.20 nH measured)', state: { ...defaults(), solveFor: 'l', shape: 'square', expr: 'monomial', n: 2.75, dout: 344e-6, doutUnit: 'µm', w: 29.7e-6, wUnit: 'µm', s: 1.9e-6, sUnit: 'µm', t: 2e-6, tUnit: 'µm', l: 3.2e-9, lUnit: 'nH', f: 1e9, fUnit: 'GHz' } },
    { id: 'mohan-56', label: 'Mohan Table IV #56: octagonal, 5 turns, 346 µm (7.50 nH)', state: { ...defaults(), solveFor: 'l', shape: 'octagonal', expr: 'wheeler', n: 5, dout: 346e-6, doutUnit: 'µm', w: 18e-6, wUnit: 'µm', s: 2e-6, sUnit: 'µm', t: 2e-6, tUnit: 'µm', l: 7.5e-9, lUnit: 'nH', f: 1e9, fUnit: 'GHz' } },
    { id: 'match-22n', label: '22 nH matching coil at 433 MHz, 3 turns (solve d_out)', state: { ...defaults(), solveFor: 'dout', shape: 'square', expr: 'sheet', l: 22e-9, lUnit: 'nH', n: 3, w: 0.15e-3, s: 0.15e-3, t: 35e-6, f: 433e6, fUnit: 'MHz' } },
    { id: 'circ-20', label: '20 mm circular coil, 8 turns, 0.3/0.2 mm (analysis)', state: { ...defaults(), solveFor: 'l', shape: 'circular', expr: 'sheet', n: 8, dout: 20e-3, w: 0.3e-3, s: 0.2e-3, t: 35e-6, f: 1e6, fUnit: 'MHz' } },
    { id: 'wpt-hex', label: 'Wireless-power hexagon, 40 mm, 2 oz, 6.78 MHz (solve n for 1 µH)', state: { ...defaults(), solveFor: 'n', shape: 'hexagonal', expr: 'wheeler', l: 1e-6, lUnit: 'µH', dout: 40e-3, w: 1.5e-3, s: 0.5e-3, t: 70e-6, f: 6.78e6, fUnit: 'MHz' } },
  ],
};
