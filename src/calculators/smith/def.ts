/** Smith Chart & Matching — calculator definition (DOM-free). */

import { type Cx, abs, cx, inv } from '@/core/math/complex';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, SmithPoint, SmithTrace } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ } from '@/core/unitsets';
import { type Component, type LMatch, OPEN, gammaOf, lMatches, lineInput, linePath, matchInput, matchPath, matchSweep, polar, seriesPart, shuntPart, zOf } from './model';

export type SpecBy = 'z' | 'gamma' | 'vswr' | 'rl';

export interface SmithState {
  specBy: SpecBy;
  z0: number;
  r: number;
  x: number;
  gMag: number;
  gAng: number;
  vswr: number;
  rl: number;
  f: number;
  fUnit: string;
  lineDeg: number;
  zLine: number;
  showMatch: number;
}

export const defaults = (): SmithState => ({
  specBy: 'z',
  z0: 50,
  r: 25,
  x: -30,
  gMag: 0,
  gAng: 0,
  vswr: 1,
  rl: 0,
  f: 1e9,
  fUnit: 'GHz',
  lineDeg: 0,
  zLine: 50,
  showMatch: 1,
});

const computedUnless = (mode: SpecBy | SpecBy[]) => (_s: any, root: any) => !([] as SpecBy[]).concat(mode).includes(root.specBy);

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Load',
    note: 'Pick how the load is given (or click ◎ on a green value to type it instead); the other values are calculated. Positive X is inductive.',
    fields: [
      { kind: 'number', key: 'z0', symbol: 'Z₀', label: 'Reference impedance', unit: 'Ω', min: 1e-3, max: 1e6 },
      {
        kind: 'select',
        key: 'specBy',
        label: 'Load given as',
        options: [
          { value: 'z', label: 'Impedance R + jX' },
          { value: 'gamma', label: 'Reflection |Γ| ∠θ (S11)' },
          { value: 'vswr', label: 'VSWR and ∠Γ' },
          { value: 'rl', label: 'Return loss and ∠Γ' },
        ],
      },
      { kind: 'number', key: 'r', symbol: 'R', label: 'Resistance', unit: 'Ω', min: 0, max: 1e9, solvable: true, solvedWhen: computedUnless('z'), onSolve: (_s, root) => (root.specBy = 'gamma'), onUnsolve: (_s, root) => (root.specBy = 'z') },
      { kind: 'number', key: 'x', symbol: 'X', label: 'Reactance', unit: 'Ω', min: -1e9, max: 1e9, solvable: true, solvedWhen: computedUnless('z'), onSolve: (_s, root) => (root.specBy = 'gamma'), onUnsolve: (_s, root) => (root.specBy = 'z') },
      { kind: 'number', key: 'gMag', symbol: '|Γ|', label: 'Reflection magnitude', min: 0, max: 1, solvable: true, solvedWhen: computedUnless('gamma'), onSolve: (_s, root) => (root.specBy = 'z'), onUnsolve: (_s, root) => (root.specBy = 'gamma') },
      { kind: 'number', key: 'gAng', symbol: '∠Γ', label: 'Reflection angle', suffix: '°', min: -360, max: 360, solvable: true, solvedWhen: computedUnless(['gamma', 'vswr', 'rl']), onSolve: (_s, root) => (root.specBy = 'z'), onUnsolve: (_s, root) => (root.specBy = 'gamma') },
      { kind: 'number', key: 'vswr', symbol: 'S', label: 'VSWR', min: 1, max: 1e6, solvable: true, solvedWhen: computedUnless('vswr'), onSolve: (_s, root) => (root.specBy = 'z'), onUnsolve: (_s, root) => (root.specBy = 'vswr') },
      { kind: 'number', key: 'rl', symbol: 'RL', label: 'Return loss', suffix: 'dB', min: 0, max: 200, solvable: true, solvedWhen: computedUnless('rl'), onSolve: (_s, root) => (root.specBy = 'z'), onUnsolve: (_s, root) => (root.specBy = 'rl') },
    ],
  },
  {
    kind: 'section',
    title: 'Line & matching',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 1, max: 1e12, help: 'Sets the matching component values and the bandwidth sweep.' },
      { kind: 'number', key: 'lineDeg', symbol: 'θ', label: 'Line length (electrical)', suffix: '°', min: 0, max: 3600, help: 'Optional lossless line between the load and the matching network (360° = one wavelength). 0 = none. The match is designed at the line input.' },
      { kind: 'number', key: 'zLine', symbol: 'Z_line', label: 'Line impedance', unit: 'Ω', min: 1e-3, max: 1e6, visible: (s) => s.lineDeg > 0 },
      { kind: 'number', key: 'showMatch', symbol: '#', label: 'Matching solution on chart', integer: true, min: 1, max: 4, help: 'Which L-network solution (see the Tables tab) to draw on the chart.' },
    ],
  },
];

const fmtZ = (z: Cx | null) => (z == null || abs(z) > 1e15 ? 'open (∞)' : `${si(z.re, 'Ω', 4)} ${z.im >= 0 ? '+' : '−'} j${si(Math.abs(z.im), 'Ω', 4)}`);
const fmtY = (y: Cx) => `${si(y.re, 'S', 4)} ${y.im >= 0 ? '+' : '−'} j${si(Math.abs(y.im), 'S', 4)}`;
const vswrOf = (m: number) => (m >= 1 ? Infinity : (1 + m) / (1 - m));
const rlOf = (m: number) => (m <= 0 ? Infinity : -20 * Math.log10(m));
const SUP: Record<string, string> = { '-': '⁻', '+': '', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
/** 4.1×10⁻¹² rather than 4.1e-12 */
const sci = (v: number) => {
  const [m, e] = v.toExponential(1).split('e');
  return `${m}×10${[...e].map((c) => SUP[c] ?? c).join('')}`;
};
const fmtNum = (v: number, d = 4) => (Number.isFinite(v) ? String(+v.toPrecision(d)) : '∞');

export function compute(st: SmithState): CalcReport {
  const warnings: string[] = [];
  const notes: string[] = [];
  const z0 = st.z0;
  // ── resolve the load from whichever pair was given
  let g: Cx;
  let z: Cx | null;
  const need = (k: keyof SmithState) => {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k] as number)) throw new Error(`Enter a finite value for ${k}.`);
  };
  if (st.specBy === 'z') {
    need('r');
    need('x');
    if (st.r < 0) throw new Error('R < 0 is an active (negative-resistance) load — not supported.');
    z = cx(st.r, st.x);
    g = gammaOf(z, z0);
  } else {
    need('gAng');
    need(st.specBy === 'gamma' ? 'gMag' : st.specBy === 'vswr' ? 'vswr' : 'rl');
    let mag = st.gMag;
    if (st.specBy === 'vswr') mag = (st.vswr - 1) / (st.vswr + 1);
    if (st.specBy === 'rl') mag = 10 ** (-st.rl / 20);
    if (mag > 1) throw new Error('|Γ| > 1 is an active (negative-resistance) load — not supported.');
    const th = (st.gAng * Math.PI) / 180;
    g = cx(mag * Math.cos(th), mag * Math.sin(th));
    z = zOf(g, z0);
  }
  // A lossless load (|Γ| = 1, R = 0) must stay lossless despite rounding.
  if (abs(g) > 1 - 1e-12) {
    const m = abs(g);
    g = cx(g.re / m, g.im / m);
    if (z) z = cx(0, z.im);
  }
  if (z && Math.abs(z.re) < 1e-12 * abs(z)) z = cx(0, z.im);
  if (z && abs(z) < 1e-12 * z0) z = cx(0, 0); // short
  const p = polar(g);
  const vswr = vswrOf(p.mag);
  const rl = rlOf(p.mag);
  const ml = p.mag < 1 ? -10 * Math.log10(1 - p.mag * p.mag) : Infinity;
  const isShort = z != null && abs(z) === 0;
  const y = z && !isShort ? inv(z) : cx(0, 0);
  const solvedOf = (key: string, modes: SpecBy[]) => !modes.includes(st.specBy) && key !== '';

  const r = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [
    r('zLoad', 'Load impedance', null, 'Ω', fmtZ(z), { symbol: 'Z_L', primary: true, note: z ? `z = ${fmtNum(z.re / z0)} ${z.im >= 0 ? '+' : '−'} j${fmtNum(Math.abs(z.im) / z0)}` : '' }),
    r('gamma', 'Reflection coefficient', p.mag, '', `${p.mag.toFixed(4)} ∠ ${p.deg.toFixed(2)}°`, { symbol: 'Γ', primary: true, note: `${g.re.toFixed(4)} ${g.im >= 0 ? '+' : '−'} j${Math.abs(g.im).toFixed(4)}` }),
    r('vswrOut', 'VSWR', vswr, '', `${fmtNum(vswr)} : 1`, { symbol: 'S', primary: true }),
    r('rlOut', 'Return loss', rl, 'dB', Number.isFinite(rl) ? `${rl.toFixed(2)} dB` : '∞', { symbol: 'RL', primary: true, note: `mismatch loss ${Number.isFinite(ml) ? ml.toFixed(3) : '∞'} dB` }),
    // values written back into the computed input boxes
    r('r', 'Resistance', z ? Math.min(z.re, 1e9) : 1e9, 'Ω', z ? si(z.re, 'Ω', 4) : '∞', { group: 'Load', symbol: 'R', solved: solvedOf('r', ['z']) }),
    r('x', 'Reactance', z ? z.im : 0, 'Ω', z ? si(z.im, 'Ω', 4) : '—', { group: 'Load', symbol: 'X', solved: solvedOf('x', ['z']) }),
    r('gMag', '|Γ|', p.mag, '', p.mag.toFixed(5), { group: 'Load', symbol: '|Γ|', solved: solvedOf('gMag', ['gamma']) }),
    r('gAng', '∠Γ', p.deg, '°', `${p.deg.toFixed(3)}°`, { group: 'Load', symbol: '∠Γ', solved: solvedOf('gAng', ['gamma', 'vswr', 'rl']) }),
    r('vswr', 'VSWR', Math.min(vswr, 1e6), '', fmtNum(vswr, 6), { group: 'Load', solved: solvedOf('vswr', ['vswr']) }),
    r('rl', 'Return loss', Math.min(rl, 200), 'dB', Number.isFinite(rl) ? rl.toFixed(3) : '∞', { group: 'Load', solved: solvedOf('rl', ['rl']) }),
    r('mismatchLoss', 'Mismatch loss', ml, 'dB', Number.isFinite(ml) ? `${ml.toFixed(4)} dB` : '∞', { group: 'Load', symbol: 'ML', note: '−10·log(1 − |Γ|²)' }),
    r('powerDelivered', 'Power delivered to load', (1 - p.mag * p.mag) * 100, '%', `${((1 - p.mag * p.mag) * 100).toFixed(2)} %`, { group: 'Load' }),
    r('yLoad', 'Load admittance', null, 'S', isShort ? '∞ (short)' : z ? fmtY(y) : '0', { group: 'Load', symbol: 'Y_L' }),
    r('qLoad', 'Load Q (|X|/R)', z && z.re > 0 ? Math.abs(z.im) / z.re : null, '', z && z.re > 0 ? (Math.abs(z.im) / z.re).toPrecision(4) : '—', { group: 'Load', symbol: 'Q' }),
  ];

  // ── optional line in front of the load
  const lineOn = st.lineDeg > 0;
  const zIn = lineOn ? lineInput(z ?? OPEN, st.zLine, (st.lineDeg * Math.PI) / 180) : z;
  if (lineOn) {
    const gi = polar(gammaOf(zIn!, z0));
    results.push(
      r('zIn', `Impedance at line input (θ = ${st.lineDeg}°)`, null, 'Ω', fmtZ(zIn && (!z || z.re <= 0) ? cx(0, zIn.im) : zIn), { group: 'After the line', symbol: 'Z_in' }),
      r('gammaIn', 'Γ at line input', gi.mag, '', `${gi.mag.toFixed(4)} ∠ ${gi.deg.toFixed(2)}°`, { group: 'After the line' }),
      r('lineLambda', 'Line length', st.lineDeg / 360, 'λ', `${(st.lineDeg / 360).toFixed(4)} λ`, { group: 'After the line' }),
    );
    if (Math.abs(st.zLine - z0) > 1e-9) notes.push(`The line (${si(st.zLine, 'Ω')}) differs from the reference ${si(z0, 'Ω')}: it transforms the impedance as well as rotating it — a quarter-wave transformer when θ = 90°.`);
  }

  // ── L-network matching at the (line-transformed) load
  const w = 2 * Math.PI * st.f;
  const lossless = !z || z.re <= 0;
  // A lossless load stays lossless through a lossless line: snap the stand-in's rounding residue.
  const zInC = zIn && lossless ? cx(0, zIn.im) : zIn;
  const gIn = zInC && abs(zInC) < 1e15 ? abs(gammaOf(zInC, z0)) : 1;
  const matched = gIn < 1e-4; // return loss > 80 dB: nothing worth matching
  const matches: LMatch[] = !lossless && zInC && zInC.re > 0 && !matched && abs(zInC) < 1e15 ? lMatches(zInC, z0) : [];
  if (!z) warnings.push('Open circuit (lossless): no match possible.');
  else if (z.re <= 0) warnings.push('A lossless load (R = 0, |Γ| = 1) cannot be matched by a lossless network.');
  if (matched) notes.push(`${lineOn ? 'The line input' : 'The load'} is ${gIn < 1e-9 ? '' : 'essentially '}matched (|Γ| = ${gIn.toExponential(1)}); no network needed.`);
  const qIn = zInC && zInC.re > 0 ? Math.abs(zInC.im) / zInC.re : 0;
  if (matches.length && qIn > 10) warnings.push(`High-Q load (|X|/R = ${qIn.toPrecision(3)}): the match is narrow and real component Q (loss) will dominate — expect insertion loss and a shifted centre frequency.`);
  const sel = Math.min(Math.max(Math.round(st.showMatch) - 1, 0), Math.max(matches.length - 1, 0));
  const sweepOpts = (m: LMatch) => ({ load: z!, f0: st.f, z0, m, zLine: st.zLine, thetaDeg: lineOn ? st.lineDeg : 0 });
  const gAt = (m: LMatch, f: number) => matchSweep(sweepOpts(m), [f])[0];
  // VSWR ≤ 2 band edges by stepping outward geometrically, then bisection (independent of any plot grid).
  const LIM = 0.5;
  const edge = (m: LMatch, dir: 1 | -1): { f: number; clipped: boolean } => {
    let inside = st.f;
    let d = 1e-7;
    for (;;) {
      const fTry = st.f * (1 + dir * Math.min(d, LIM));
      if (gAt(m, fTry) > 1 / 3) {
        let a = inside;
        let b = fTry;
        for (let k = 0; k < 60; k++) {
          const mid = (a + b) / 2;
          if (gAt(m, mid) <= 1 / 3) a = mid;
          else b = mid;
        }
        return { f: (a + b) / 2, clipped: false };
      }
      inside = fTry;
      if (d >= LIM) return { f: fTry, clipped: true };
      d *= 1.5;
    }
  };
  const bands = matches.map((m) => (gAt(m, st.f) <= 1 / 3 ? { lo: edge(m, -1), hi: edge(m, 1) } : null));
  const bwOf = (i: number) => (bands[i] ? bands[i]!.hi.f - bands[i]!.lo.f : 0);
  const best = matches.length ? bands.reduce((bi, _, i) => (bwOf(i) > bwOf(bi) ? i : bi), 0) : -1;
  // Plot span follows the widest band (at least ±1 %, at most ±50 %).
  const span = Math.min(LIM, Math.max(0.01, (2 * Math.max(0, ...matches.map((_, i) => bwOf(i)))) / st.f));
  const NF = 801;
  const freqs = Array.from({ length: NF }, (_, i) => st.f * (1 - span + (2 * span * i) / (NF - 1)));
  const sweeps = matches.map((m) => matchSweep(sweepOpts(m), freqs));
  const rows: Record<string, string | number | null>[] = [];
  const disp: Record<string, string>[] = [];
  const impractical = (c: Component) => (c.kind === 'C' && c.value < 0.5e-12) || (c.kind === 'L' && c.value < 1e-9);
  const part = (c: Component) => (c.kind === 'none' ? '—' : `${c.kind === 'L' ? 'L' : 'C'} = ${si(c.value, c.kind === 'L' ? 'H' : 'F', 4)}${impractical(c) ? ' ⚠' : ''}`);
  matches.forEach((m, i) => {
    const sp = seriesPart(m.x, w);
    const sh = shuntPart(m.b, w);
    const band = bands[i];
    const resid = abs(gammaOf(matchInput(m, zInC!), z0));
    rows.push({ n: i + 1, topology: m.topology === 'shunt-load' ? 'shunt at load, series at source' : 'series at load, shunt at source', seriesX: m.x, shuntB: m.b, series: part(sp), shunt: part(sh), bwVswr2: bwOf(i), fLo: band?.lo.f ?? null, fHi: band?.hi.f ?? null, residual: resid });
    disp.push({
      n: `${i + 1}${i === best && matches.length > 1 ? ' ★' : ''}`,
      topology: m.topology === 'shunt-load' ? 'Shunt ‖ load → series' : 'Series + load → shunt',
      seriesX: si(m.x, 'Ω', 4),
      shuntB: si(m.b, 'S', 4),
      series: part(sp),
      shunt: part(sh),
      bwVswr2: band ? si(bwOf(i), 'Hz', 3) : '—',
      fLo: band ? `${band.lo.clipped ? '≤ ' : ''}${si(band.lo.f, 'Hz', 4)}` : '—',
      fHi: band ? `${band.hi.clipped ? '≥ ' : ''}${si(band.hi.f, 'Hz', 4)}` : '—',
      // float residue (~1e-16) is not information; e-notation ran into the next row's # ("1.4e-162")
      residual: resid < 1e-12 ? '< 10⁻¹²' : sci(resid),
    });
  });
  if (matches.length) {
    const m = matches[sel];
    const sp = seriesPart(m.x, w);
    const sh = shuntPart(m.b, w);
    const txt = (c: Component) => `${c.where} ${c.kind} ${si(c.value, c.kind === 'L' ? 'H' : 'F', 4)}`;
    const [first, second] = m.topology === 'shunt-load' ? [sh, sp] : [sp, sh];
    const text = first.kind === 'none' ? `${txt(second)} only` : second.kind === 'none' ? `${txt(first)} only` : `${txt(first)} → ${txt(second)}`;
    results.splice(4, 0, r('match', `Match #${sel + 1} at ${si(st.f, 'Hz')}`, null, '', text, { symbol: 'L-net', primary: true, note: `${first.kind === 'none' || second.kind === 'none' ? 'single element at the load' : 'listed from the load towards the source'}${sel === best && matches.length > 1 ? ' · widest VSWR ≤ 2 band ★' : ''}` }));
    if (impractical(sp) || impractical(sh)) warnings.push(`Match #${sel + 1} needs a part below ~0.5 pF / 1 nH, which parasitics dominate — consider another solution (marked ⚠ in the Tables tab).`);
  } else if (!lossless && zInC && zInC.re > 0 && !matched && abs(zInC) < 1e15) warnings.push('No L-section solution found within numerical precision — the load is extremely reactive (very high Q) or extremely far from Z₀.');
  if (matches.length && Math.round(st.showMatch) > matches.length) notes.push(`Only ${matches.length} solution${matches.length === 1 ? '' : 's'} exist; showing #${sel + 1}.`);
  if (matches.length > 1) notes.push('Solutions are numbered in the order found, not by merit; ★ marks the widest VSWR ≤ 2 bandwidth. A series C also blocks DC, a shunt L gives a DC return.');

  // ── chart content
  const traces: SmithTrace[] = [];
  const points: SmithPoint[] = [{ re: g.re, im: g.im, label: 'Z_L', color: '#8b1e1e', dragId: 'load' }];
  if (Number.isFinite(vswr) && p.mag > 1e-6) {
    const circ = Array.from({ length: 181 }, (_, i) => (i / 180) * 2 * Math.PI);
    traces.push({ label: `VSWR ${fmtNum(vswr, 3)} circle`, re: circ.map((t) => p.mag * Math.cos(t)), im: circ.map((t) => p.mag * Math.sin(t)), color: '#9a8f7a', dash: [4, 4], width: 1 });
  }
  if (lineOn) {
    const lp = linePath(z ?? OPEN, st.zLine, z0, st.lineDeg);
    traces.push({ label: `Line ${st.lineDeg}° (${si(st.zLine, 'Ω')})`, ...lp, color: '#4f8a8b', width: 2 });
    const gi = gammaOf(zInC!, z0);
    points.push({ re: gi.re, im: gi.im, label: 'Z_in', color: '#4f8a8b' });
  }
  if (matches.length) {
    const mp = matchPath(zInC!, z0, matches[sel]);
    traces.push({ label: `Match #${sel + 1} path`, ...mp, color: '#6b3fa0', width: 2.4 });
    points.push({ re: 0, im: 0, label: 'matched', color: '#1b5e3b' });
  }

  return {
    calc: 'rf/smith-chart',
    ok: true,
    summary: `${matches.length} L-network solution${matches.length === 1 ? '' : 's'} at ${si(st.f, 'Hz')} · reference ${si(z0, 'Ω')}`,
    results,
    warnings,
    notes: [
      ...notes,
      'Γ uses a real reference impedance Z₀ (the power-wave and travelling-wave definitions of Γ coincide only then).',
      'Matching components are ideal and lossless. The bandwidth sweep keeps them at their design values and models the load as R in series with a fixed L or C — real loads (antennas) vary differently with frequency.',
    ],
    graphs: [
      { id: 'smith', title: 'Smith chart', kind: 'smith', subtitle: `Load ${fmtZ(z)}`, smith: { z0, traces, points, admittance: true }, beside: sweeps.length ? 'match-bw' : undefined },
      ...(sweeps.length ? [{
        id: 'match-bw',
        title: 'Match bandwidth',
        x: { label: 'Frequency', unit: 'Hz' },
        y: [{ id: 'rl', label: 'Return loss', unit: 'dB', min: 0 }],
        series: sweeps.map((gm, i) => ({ label: `Match #${i + 1}`, x: freqs, y: gm.map((v) => Math.min(rlOf(v), 60)), axis: 'rl', width: i === sel ? 2.4 : 1.3 })),
        hlines: [{ value: 9.54, label: 'VSWR 2 (9.5 dB)', axis: 'rl', color: '#9a8f7a', dash: [3, 3] }],
        vlines: [{ value: st.f, label: `f₀ ${si(st.f, 'Hz')}`, color: '#9a8f7a' }],
      } as GraphSpec] : []),
    ],
    tables: matches.length
      ? [
          {
            id: 'matches',
            title: `L-network solutions at ${si(st.f, 'Hz')}`,
            columns: [
              { key: 'n', label: '#', align: 'left' },
              { key: 'topology', label: 'Topology', align: 'left' },
              { key: 'seriesX', label: 'Series X' },
              { key: 'shuntB', label: 'Shunt B' },
              { key: 'series', label: 'Series part', align: 'left' },
              { key: 'shunt', label: 'Shunt part', align: 'left' },
              { key: 'bwVswr2', label: 'BW (VSWR ≤ 2)' },
              { key: 'fLo', label: 'from' },
              { key: 'fHi', label: 'to' },
              { key: 'residual', label: 'Check |Γ_in|' },
            ],
            rows,
            display: disp,
            note: '“Shunt ‖ load → series”: the shunt part sits across the load and the series part connects towards the source. Band edges are found by bisection within ±50 % of f (≤ / ≥ = edge beyond that window). ⚠ = part below ~0.5 pF / 1 nH.',
          },
        ]
      : [],
    details: { gamma: g, z, y: z ? y : null, zIn, matches },
  };
}

export const def: CalcDef<SmithState> = {
  id: 'rf/smith-chart',
  version: '0.1.0',
  method: 'Γ = (Z − Z₀)/(Z + Z₀) with a real reference; optional lossless line rotation (Pozar eq. 2.44); analytic L-section matching, both topologies (Pozar §5.1); bandwidth from a lumped frequency sweep.',
  fields,
  defaults,
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = { ...d, ...(raw as object) } as SmithState;
    if (!['z', 'gamma', 'vswr', 'rl'].includes(s.specBy)) s.specBy = 'z';
    for (const k of Object.keys(d) as (keyof SmithState)[]) {
      if (typeof d[k] === 'number' && (typeof s[k] !== 'number' || !Number.isFinite(s[k] as number))) (s as any)[k] = d[k];
    }
    return s;
  },
  compute,
  // Dragging Z_L on the chart rewrites the load in whichever form it is being entered.
  onDrag: (st, _graph, dragId, at) => {
    if (dragId !== 'load') return;
    const mag = Math.min(Math.hypot(at.re, at.im), 0.995);
    const ang = (Math.atan2(at.im, at.re) * 180) / Math.PI;
    const sig = (v: number, d = 4) => +v.toPrecision(d);
    if (st.specBy === 'z') {
      const z = zOf(cx(at.re, at.im), st.z0)!;
      st.r = Math.max(sig(z.re), 0);
      st.x = sig(z.im);
      return;
    }
    st.gAng = +ang.toFixed(2);
    if (st.specBy === 'gamma') st.gMag = +mag.toFixed(4);
    else if (st.specBy === 'vswr') st.vswr = sig((1 + mag) / (1 - mag));
    else st.rl = +Math.min(-20 * Math.log10(Math.max(mag, 1e-6)), 120).toFixed(2);
  },
  examples: [
    { id: 'rc-load', label: 'Match 25 − j30 Ω to 50 Ω at 1 GHz', state: defaults() },
    { id: 'pozar-5-1', label: 'Pozar ex. 5.1: 200 − j100 Ω to 100 Ω at 500 MHz', state: { specBy: 'z', z0: 100, r: 200, x: -100, f: 500e6 } },
    { id: 'vna-s11', label: 'VNA reading S11 = 0.3 ∠ 45°', state: { specBy: 'gamma', gMag: 0.3, gAng: 45 } },
    { id: 'antenna-vswr', label: 'Antenna VSWR 3 at −60°, behind 30° of cable', state: { specBy: 'vswr', vswr: 3, gAng: -60, lineDeg: 30, zLine: 50 } },
    { id: 'qwt', label: 'Quarter-wave transformer: 100 Ω through 70.71 Ω λ/4', state: { specBy: 'z', r: 100, x: 0, lineDeg: 90, zLine: 70.7107 } },
  ],
};
