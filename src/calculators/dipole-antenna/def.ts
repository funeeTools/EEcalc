/** Dipole antenna — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent, invert } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_COND, U_FREQ, U_LEN, withDefault } from '@/core/unitsets';
import { C0, calcDipole, feedImpedance, hpbw, patternF, patternMax, radiationResistance, qIntegral } from './model';

/** Conductor presets (S/m at 20 °C, typical handbook values). */
export const MATERIALS: Record<string, number | null> = {
  Custom: null,
  Copper: 5.8e7,
  Aluminium: 3.5e7,
  Brass: 1.5e7,
  'Stainless steel': 1.4e6,
};

export interface DipoleState {
  solveFor: 'len' | 'f' | 'xin';
  f: number;
  fUnit: string;
  len: number;
  lenUnit: string;
  d: number;
  dUnit: string;
  /** feed reactance: target (len / f solve) or result (analysis) */
  xin: number;
  z0: number;
  material: string;
  sigma: number;
  sigmaUnit: string;
}

export const defaults = (): DipoleState => ({
  solveFor: 'len',
  f: 14.2e6,
  fUnit: 'MHz',
  len: 10,
  lenUnit: 'm',
  d: 2e-3,
  dUnit: 'mm',
  xin: 0,
  z0: 50,
  material: 'Copper',
  sigma: 5.8e7,
  sigmaUnit: 'MS/m',
});

// f and L limits: a solve keeps L·f near c/2 (0.2–0.75 c), so no pair of ranges can hold every solved value
// in both directions. These cover any practical dipole; a typed extreme (f = 1 kHz → L ≈ 148 km) gets the
// core's out-of-range report, which is the right answer for a number the user typed.
const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Dipole',
    note: 'Centre-fed straight wire in free space. Solve for L or f to find resonance (X = 0).',
    fields: [
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', solvable: true, onSolve: (_s, r) => solveFrom(r as DipoleState, 'f'), min: 1e3, max: 1e12, help: 'Operating frequency. When solved: the frequency at which a wire of length L has the target feed reactance (its first series resonance for X = 0).' },
      { kind: 'number', key: 'len', symbol: 'L', label: 'Total length', units: withDefault(U_LEN, 'm'), unitKey: 'lenUnit', solvable: true, onSolve: (_s, r) => solveFrom(r as DipoleState, 'len'), min: 1e-4, max: 1e5, help: 'Tip-to-tip length of both arms together. When solved: the length near λ/2 that gives the target feed reactance; for X = 0 this is the resonant length, slightly shorter than λ/2.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Wire diameter', units: withDefault(U_LEN, 'mm'), unitKey: 'dUnit', min: 1e-7, max: 10, help: 'Conductor diameter. A thicker wire resonates shorter and has a wider bandwidth. 12 AWG ≈ 2.05 mm, 14 AWG ≈ 1.63 mm.' },
      { kind: 'number', key: 'xin', symbol: 'X_in', label: 'Feed reactance', unit: 'Ω', solvable: true, min: -1e7, max: 1e7, help: 'Target reactance at the feed point when solving for L or f (0 = resonance). In analysis mode (◎ here) it is the calculated reactance of the given L at f.' },
    ],
  },
  {
    kind: 'section',
    title: 'Feed & conductor',
    fields: [
      { kind: 'number', key: 'z0', symbol: 'Z₀', label: 'Feed-line impedance', unit: 'Ω', min: 1, max: 1000, help: 'Reference for SWR and the SWR ≤ 2 bandwidth (50 Ω or 75 Ω coax). No balun loss is included.' },
      {
        kind: 'select',
        key: 'material',
        label: 'Conductor',
        options: Object.keys(MATERIALS),
        apply: (v, s) => {
          const m = MATERIALS[v];
          if (m) s.sigma = m;
        },
      },
      { kind: 'number', key: 'sigma', symbol: 'σ', label: 'Conductivity', units: U_COND, unitKey: 'sigmaUnit', min: 1e4, max: 1e9, help: 'Sets the skin-effect loss resistance and radiation efficiency.' },
    ],
  },
];

/** Search span for the solved length / frequency, in L/λ (contains only the first series resonance). */
const LL_LO = 0.2;
const LL_HI = 0.75;

function solveLength(f: number, d: number, xTarget: number): number | null {
  const lambda = C0 / f;
  const r = invert((L) => feedImpedance(L, f, d).xin, xTarget, { lo: LL_LO * lambda, hi: LL_HI * lambda, samples: 220, log: false });
  if (!r.ok) return null;
  return r.roots.reduce((a, b) => (Math.abs(b - lambda / 2) < Math.abs(a - lambda / 2) ? b : a));
}

function solveFrequency(len: number, d: number, xTarget: number): number | null {
  const lo = (LL_LO * C0) / len;
  const hi = (LL_HI * C0) / len;
  const f0 = C0 / (2 * len);
  const r = invert((f) => feedImpedance(len, f, d).xin, xTarget, { lo, hi, samples: 220, log: false });
  if (!r.ok) return null;
  return r.roots.reduce((a, b) => (Math.abs(b - f0) < Math.abs(a - f0) ? b : a));
}

/**
 * ◎ L or ◎ f. The X_in box becomes the target. Coming from analysis it holds the reactance of the wire as
 * it was, which the first-resonance window cannot always reach (a short dipole's −8 kΩ, a near-full-wave
 * +9 kΩ): then target resonance (X = 0), the purpose of these solves, instead of showing NO SOLUTION.
 */
function solveFrom(s: DipoleState, key: 'len' | 'f'): void {
  s.solveFor = key;
  const ok = (x: number) => (key === 'len' ? s.f > 0 && solveLength(s.f, s.d, x) != null : s.len > 0 && solveFrequency(s.len, s.d, x) != null);
  if (s.d > 0 && Number.isFinite(s.xin) && s.xin !== 0 && !ok(s.xin)) s.xin = 0;
}

/** Range of X_in over a search window (scanned, so a non-monotonic span is still reported correctly). */
function xSpan(x: (v: number) => number, lo: number, hi: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i <= 80; i++) {
    const v = x(lo + ((hi - lo) * i) / 80);
    if (Number.isFinite(v)) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  return { min, max };
}

const swrOf = (r: number, x: number, z0: number): number => {
  const nr = r - z0;
  const dr = r + z0;
  const g = Math.sqrt((nr * nr + x * x) / (dr * dr + x * x));
  return g >= 1 ? Infinity : (1 + g) / (1 - g);
};

const fmtLen = (m: number) => si(m, 'm', 4);

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

export function compute(st: DipoleState): CalcReport {
  for (const k of ['f', 'len', 'd', 'xin', 'z0', 'sigma'] as const) {
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  }
  if (st.solveFor !== 'f' && !(st.f > 0)) throw new Error('Frequency must be > 0.');
  if (st.solveFor !== 'len' && !(st.len > 0)) throw new Error('Length must be > 0.');
  if (!(st.d > 0)) throw new Error('Wire diameter must be > 0.');
  if (!(st.sigma > 0) || !(st.z0 > 0)) throw new Error('Conductivity and feed-line impedance must be > 0.');

  const s: DipoleState = { ...st };
  const warnings: string[] = [];
  const notes: string[] = [];
  const report: CalcReport = { calc: 'antenna/dipole-antenna', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables: [], warnings, notes };

  if (s.solveFor === 'len') {
    const L = solveLength(s.f, s.d, s.xin);
    if (L == null) {
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      const lam = C0 / s.f;
      const span = xSpan((L) => feedImpedance(L, s.f, s.d).xin, LL_LO * lam, LL_HI * lam);
      warnings.push(`No length between ${LL_LO}λ and ${LL_HI}λ gives X_in = ${si(s.xin, 'Ω')}: with a ${si(s.d, 'm')} wire at ${si(s.f, 'Hz')}, X_in only spans ${si(span.min, 'Ω', 3)} to ${si(span.max, 'Ω', 3)} over that window (the first series resonance). Set X_in within that range.`);
      report.results.push({ key: 'len', label: 'Total length', value: null, display: '—', primary: true, solved: true });
      return report;
    }
    s.len = L;
  } else if (s.solveFor === 'f') {
    const f = solveFrequency(s.len, s.d, s.xin);
    if (f == null) {
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      const span = xSpan((f) => feedImpedance(s.len, f, s.d).xin, (LL_LO * C0) / s.len, (LL_HI * C0) / s.len);
      warnings.push(`No frequency with L between ${LL_LO}λ and ${LL_HI}λ gives X_in = ${si(s.xin, 'Ω')}: for this wire X_in only spans ${si(span.min, 'Ω', 3)} to ${si(span.max, 'Ω', 3)} over that window (the first series resonance). Set X_in within that range.`);
      report.results.push({ key: 'f', label: 'Frequency', value: null, display: '—', primary: true, solved: true });
      return report;
    }
    s.f = f;
  }

  const lOverLambda = (s.len * s.f) / C0;
  if (lOverLambda < 0.005 * (1 - 1e-9)) throw new Error(`L/λ = ${lOverLambda.toExponential(2)} is below 0.005 — too short for this model (and for any practical antenna). Check the units of L and f.`);
  if (lOverLambda > 5) throw new Error(`L/λ = ${lOverLambda.toFixed(2)} is above 5, outside this calculator’s range. Check the units of L and f.`);
  if (s.d >= s.len / 2) throw new Error('Wire diameter must be much smaller than the length.');

  const o = calcDipole({ len: s.len, f: s.f, d: s.d, sigma: s.sigma });
  if (lOverLambda > 0.5 && o.feedFactor < 1e-8) throw new Error(`L = ${lOverLambda.toFixed(4)} λ is a whole number of wavelengths: the centre feed sits where the ideal sinusoidal current is zero, so this model gives no feed impedance. Change L or f slightly, or feed off-centre.`);
  // Analysis of a length solved for resonance gives X_in ≈ 1e-14 Ω of solver residue: show it as 0, not
  // as "33 fΩ" (anything below 1e-9 of |Z_in| is below the model's precision anyway).
  if (s.solveFor === 'xin') s.xin = Math.abs(o.xin) < 1e-9 * Math.hypot(o.rin, o.xin) ? 0 : o.xin;
  const ld = s.len / s.d;
  const aOverLambda = s.d / 2 / o.lambda;
  const swr = swrOf(o.rin, o.xin, s.z0);
  const dBi = 10 * Math.log10(o.directivity);
  const gain = o.directivity * o.efficiency;
  const beam = hpbw(o.kl, o.fMax, o.thetaMax);
  const ae = (o.directivity * o.lambda * o.lambda) / (4 * Math.PI);

  // ── validity
  if (ld < 100 || aOverLambda > 0.01)
    warnings.push(`L/d = ${ld.toFixed(0)} (a/λ = ${aOverLambda.toPrecision(2)}): a thick dipole. The sinusoidal-current, induced-EMF model is a thin-wire result (L/d ≳ 100); expect the real resonant length to differ by a few percent and the impedance by 10 % or more. Use a moment-method (NEC) model for fat elements.`);
  // sin²(kL/2) < 0.1 ⇔ L within ~0.1 λ of a whole number of wavelengths; only an antiresonance for L/λ near 1, 2, …
  // (short dipoles also have a small sin²(kL/2), but there it is the ordinary small-dipole regime).
  if (lOverLambda > 0.5 && o.feedFactor < 0.1)
    warnings.push(`L/λ = ${lOverLambda.toFixed(3)} is near a ${Math.round(lOverLambda) === 1 ? 'full-wave' : `${Math.round(lOverLambda)}λ`} antiresonance, where the current at the feed nearly vanishes. Real feed resistance there is a few hundred to a few thousand ohms, set by the wire thickness; the ideal sinusoidal-current value (${si(o.rin, 'Ω', 3)}) is not reliable. Feed off-centre or use a moment-method model.`);
  if (Math.abs(o.thetaMax - Math.PI / 2) > 1e-3) notes.push(`The strongest lobe points ${((o.thetaMax * 180) / Math.PI).toFixed(1)}° from the wire axis, not broadside (this happens above L/λ ≈ 1.44); the directivity is for that lobe.`);
  if (o.skinDepth > s.d / 6) warnings.push(`Skin depth ${si(o.skinDepth, 'm', 3)} is not small compared with the wire radius; the loss resistance (skin-effect formula) is approximate.`);
  if (lOverLambda < 0.1) notes.push(`Electrically short dipole: R_in ≈ 20π²(L/λ)² = ${si(20 * Math.PI ** 2 * lOverLambda ** 2, 'Ω', 3)} (Balanis §4.3), with a large capacitive reactance; matching losses usually dominate.`);

  // ── SWR ≤ 2 bandwidth around f (fixed length)
  const swrAt = (f: number) => {
    const z = feedImpedance(s.len, f, s.d);
    return swrOf(z.rin, z.xin, s.z0);
  };
  let bwLo: number | null = null;
  let bwHi: number | null = null;
  if (swr <= 2) {
    const step = s.f * 0.0025;
    let a = s.f;
    while (a > 0.5 * s.f && swrAt(a - step) <= 2) a -= step;
    if (a - step > 0.5 * s.f) bwLo = brent((f) => swrAt(f) - 2, a - step, a, 1e-9);
    let b = s.f;
    while (b < 1.5 * s.f && swrAt(b + step) <= 2) b += step;
    if (b + step < 1.5 * s.f) bwHi = brent((f) => swrAt(f) - 2, b, b + step, 1e-9);
  }
  const bw = bwLo != null && bwHi != null ? bwHi - bwLo : null;

  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const shortening = s.len / (o.lambda / 2);
  const primary: ResultItem[] = [];
  if (s.solveFor === 'len')
    primary.push(item('len', 'Total length', s.len, 'm', fmtLen(s.len), { symbol: 'L', solved: true, primary: true, note: `each arm ${fmtLen(s.len / 2)} · ${(shortening * 100).toFixed(2)} % of λ/2` }));
  if (s.solveFor === 'f') primary.push(item('f', 'Frequency', s.f, 'Hz', si(s.f, 'Hz', 5), { symbol: 'f', solved: true, primary: true, note: `L = ${(shortening * 100).toFixed(2)} % of λ/2` }));
  primary.push(item('rin', 'Feed resistance', o.rin, 'Ω', si(o.rin, 'Ω', 4), { symbol: 'R_in', primary: true, note: `radiation only; + ${si(o.rLossIn, 'Ω', 3)} ohmic loss` }));
  // When L or f was solved, X_in equals the target to solver precision: show the target, not the 1e-14 Ω residual.
  const xShown = s.xin;
  primary.push(item('xin', 'Feed reactance', xShown, 'Ω', si(xShown, 'Ω', 4), { symbol: 'X_in', primary: true, solved: s.solveFor === 'xin', note: s.solveFor === 'xin' ? 'induced-EMF method' : s.xin === 0 ? 'target: resonance' : 'target' }));
  primary.push(item('dBi', 'Directivity', dBi, 'dBi', `${dBi.toFixed(2)} dBi`, { symbol: 'D', primary: true, note: `${(dBi - 2.15).toFixed(2)} dBd · gain ${(10 * Math.log10(gain)).toFixed(2)} dBi with loss` }));

  const rest: ResultItem[] = [
    item('lambda', 'Free-space wavelength', o.lambda, 'm', fmtLen(o.lambda), { symbol: 'λ', group: 'Electrical size' }),
    item('lOverLambda', 'Electrical length', lOverLambda, '', `${lOverLambda.toFixed(4)} λ`, { symbol: 'L/λ', group: 'Electrical size' }),
    item('shortening', 'Length / (λ/2)', shortening, '', shortening.toFixed(4), { symbol: 'K', group: 'Electrical size', note: 'end-effect shortening factor when solved for resonance' }),
    item('lOverD', 'Length / diameter', ld, '', ld.toPrecision(4), { symbol: 'L/d', group: 'Electrical size' }),
    item('rm', 'Radiation resistance (I max)', o.rm, 'Ω', si(o.rm, 'Ω', 4), { symbol: 'R_r', group: 'Impedance', note: 'referred to the current maximum' }),
    item('rLossIn', 'Ohmic loss resistance', o.rLossIn, 'Ω', si(o.rLossIn, 'Ω', 3), { symbol: 'R_L', group: 'Impedance', note: 'at the feed, skin effect' }),
    item('efficiency', 'Radiation efficiency', o.efficiency, '', `${(o.efficiency * 100).toFixed(2)} %`, { symbol: 'e_r', group: 'Impedance' }),
    item('swr', `SWR on ${si(s.z0, 'Ω')}`, Number.isFinite(swr) ? swr : null, '', Number.isFinite(swr) ? swr.toFixed(3) : '∞', { symbol: 'SWR', group: 'Impedance', tone: swr > 3 ? 'warn' : '' }),
    item('bwSwr2', 'SWR ≤ 2 bandwidth', bw, 'Hz', bw != null ? `${si(bw, 'Hz', 3)} (${((bw / s.f) * 100).toFixed(1)} %)` : swr > 2 ? '— (SWR > 2 at f)' : '— (> ±50 %)', { symbol: 'BW', group: 'Impedance', note: bwLo != null && bwHi != null ? `${si(bwLo, 'Hz', 4)} – ${si(bwHi, 'Hz', 4)}` : undefined }),
    item('directivity', 'Directivity (linear)', o.directivity, '', o.directivity.toFixed(4), { symbol: 'D₀', group: 'Pattern' }),
    item('gainDbi', 'Gain incl. ohmic loss', 10 * Math.log10(gain), 'dBi', `${(10 * Math.log10(gain)).toFixed(2)} dBi`, { symbol: 'G', group: 'Pattern' }),
    item('hpbw', 'Half-power beamwidth', beam == null ? null : (beam * 180) / Math.PI, '°', beam == null ? '— (split main lobe)' : `${((beam * 180) / Math.PI).toFixed(1)}°`, { symbol: 'HPBW', group: 'Pattern', note: 'E-plane' }),
    item('thetaMax', 'Main-lobe angle from axis', (o.thetaMax * 180) / Math.PI, '°', `${((o.thetaMax * 180) / Math.PI).toFixed(1)}°`, { symbol: 'θ_max', group: 'Pattern' }),
    item('ae', 'Max effective aperture', ae, 'm²', `${si(ae, 'm²', 3)}`, { symbol: 'A_em', group: 'Pattern', note: 'Dλ²/4π' }),
    item('skinDepth', 'Skin depth', o.skinDepth, 'm', si(o.skinDepth, 'm', 3), { symbol: 'δ', group: 'Conductor' }),
  ];
  report.results = [...primary, ...rest];
  report.summary = `L = ${fmtLen(s.len)} (${lOverLambda.toFixed(3)} λ) at ${si(s.f, 'Hz', 4)} · Z_in = ${si(o.rin, 'Ω', 3)} ${xShown >= 0 ? '+' : '−'} j${si(Math.abs(xShown), 'Ω', 3)} · ${dBi.toFixed(2)} dBi`;
  notes.push(
    'Ideal sinusoidal current on a thin straight wire in free space (Balanis §4.5): no ground, insulators, insulation, end-loading or nearby objects. Over real ground, at HF heights below ~λ/2, the feed resistance and pattern change considerably.',
    'Reactance and the resonant length come from the induced-EMF method (Carter 1932; Balanis §8.5), which uses the same sinusoidal current. It is good for thin wires near λ/2; it does not shift the current distribution, so it is less accurate for thick wires and near antiresonance.',
    'Practical wire dipoles are often cut a few percent shorter still (the familiar 468/f[MHz] ft rule is 0.951·λ/2) because of insulation, insulator end capacitance and ground. Cut long and trim.',
  );
  report.details = { ...o, lOverLambda, aOverLambda, swr, bwLo, bwHi };
  report.graphs = graphs(s, o.kl, lOverLambda);
  return report;
}

function graphs(s: DipoleState, kl: number, lOverLambda: number): GraphSpec[] {
  // 1) Radiation resistance (current max and feed) and directivity vs L/λ, same wire L/d ratio.
  const lls = linspace(0.02, Math.max(2.5, lOverLambda * 1.1), 300);
  const rm: number[] = [];
  const rin: number[] = [];
  const dbi: number[] = [];
  for (const ll of lls) {
    const k = 2 * Math.PI * ll;
    const r = radiationResistance(k);
    rm.push(r);
    const sn = Math.sin(k / 2) ** 2;
    rin.push(Math.min(r / Math.max(sn, 1e-12), 1e5));
    dbi.push(10 * Math.log10((2 * patternMax(k, 240).fMax) / qIntegral(k)));
  }
  const g1: GraphSpec = {
    id: 'r-vs-length',
    title: 'Resistance & directivity vs L/λ',
    x: { label: 'Electrical length L/λ', unit: '' },
    y: [
      { id: 'r', label: 'Resistance', unit: 'Ω', log: true, min: 0.1, max: 1e5 },
      { id: 'd', label: 'Directivity', unit: 'dBi', side: 'right' },
    ],
    series: [
      { label: 'R_in at feed', x: lls, y: rin, axis: 'r', width: 2.2 },
      { label: 'R_r at current max', x: lls, y: rm, axis: 'r', color: '#4f8a8b', width: 1.6, dash: [5, 3] },
      { label: 'Directivity', x: lls, y: dbi, axis: 'd', color: '#c47b17', width: 1.6 },
    ],
    vlines: [{ value: lOverLambda, label: `L/λ = ${lOverLambda.toFixed(3)}` }],
    // the antiresonance peaks and the directivity curve fill the top of the frame
    legend: 'below',
    markers: [{ x: lOverLambda, y: Math.min(radiationResistance(kl) / Math.max(Math.sin(kl / 2) ** 2, 1e-12), 1e5), axis: 'r', label: si(radiationResistance(kl) / Math.max(Math.sin(kl / 2) ** 2, 1e-12), 'Ω', 3) }],
  };

  // 2) Feed impedance and SWR vs frequency for the actual wire.
  const fs = linspace(0.7 * s.f, 1.3 * s.f, 241);
  const zs = fs.map((f) => feedImpedance(s.len, f, s.d));
  const clamp = (v: number) => Math.max(-5000, Math.min(5000, v));
  const g2: GraphSpec = {
    id: 'z-vs-f',
    title: 'Feed impedance vs frequency',
    subtitle: `L = ${si(s.len, 'm', 4)}, d = ${si(s.d, 'm', 3)}`,
    x: { label: 'Frequency', unit: 'Hz' },
    y: [
      { id: 'z', label: 'Impedance', unit: 'Ω' },
      { id: 'swr', label: `SWR (${si(s.z0, 'Ω')})`, unit: '', side: 'right', min: 1, max: 10, log: true },
    ],
    series: [
      { label: 'R_in', x: fs, y: zs.map((z) => clamp(z.rin)), axis: 'z', width: 2.2 },
      { label: 'X_in', x: fs, y: zs.map((z) => clamp(z.xin)), axis: 'z', color: '#c47b17', width: 1.8 },
      { label: 'SWR', x: fs, y: zs.map((z) => Math.min(swrOf(z.rin, z.xin, s.z0), 1e3)), axis: 'swr', color: '#6b5b95', width: 1.4, dash: [5, 3] },
    ],
    hlines: [{ value: 0, label: 'X = 0', axis: 'z', color: '#9a8f7a', dash: [3, 3] }],
    vlines: [{ value: s.f, label: `f = ${si(s.f, 'Hz', 4)}` }],
  };

  // 3) E-plane pattern (normalised power, dB) vs θ from the wire axis.
  const th = linspace(0, 180, 361);
  const fMax = patternMax(kl).fMax;
  const db = (v: number) => Math.max(10 * Math.log10(Math.max(v, 1e-30)), -40);
  const g3: GraphSpec = {
    id: 'pattern',
    title: 'E-plane pattern',
    subtitle: 'normalised power, θ measured from the wire axis (90° = broadside)',
    x: { label: 'θ', unit: '°' },
    y: [{ id: 'p', label: 'Relative power', unit: 'dB', min: -40, max: 0 }],
    series: [
      { label: `L/λ = ${lOverLambda.toFixed(3)}`, x: th, y: th.map((t) => db(patternF(kl, (t * Math.PI) / 180) / fMax)), axis: 'p', width: 2.2 },
      { label: 'λ/2 dipole', x: th, y: th.map((t) => db(patternF(Math.PI, (t * Math.PI) / 180))), axis: 'p', color: '#9a8f7a', width: 1.2, dash: [5, 3] },
    ],
    hlines: [{ value: -3.0103, label: '−3 dB', axis: 'p', color: '#9a8f7a', dash: [2, 3] }],
  };
  return [g1, g2, g3];
}

export const def: CalcDef<DipoleState> = {
  id: 'antenna/dipole-antenna',
  version: '0.1.0',
  method:
    'Sinusoidal-current thin-wire dipole: radiation resistance, directivity and pattern from Balanis, Antenna Theory §4.5–4.6 (Si/Ci closed forms evaluated numerically); feed reactance by the induced-EMF method (Carter 1932; Balanis §8.5), so the resonant (X = 0) length and its L/d-dependent shortening come from the same model; R_in = R_r/sin²(kl/2); skin-effect loss. Solve-for uses bracketed Brent root finding on X_in.',
  fields,
  defaults,
  solve: {
    default: 'len',
    analysis: 'xin',
    options: [
      { key: 'len', label: 'Resonant length L for frequency f' },
      { key: 'f', label: 'Resonant frequency f of length L' },
      { key: 'xin', label: 'Impedance of a given L at f (analysis)' },
    ],
  },
  compute,
  sync: (s) => {
    const m = MATERIALS[s.material];
    if (m != null && Math.abs(m - s.sigma) > 1) s.material = 'Custom';
  },
  examples: [
    { id: 'hf-20m', label: '20 m band wire dipole (14.2 MHz, 2 mm Cu)', state: { solveFor: 'len', f: 14.2e6, fUnit: 'MHz', d: 2e-3, dUnit: 'mm', xin: 0, z0: 50, material: 'Copper', sigma: 5.8e7 } },
    { id: 'ideal-half-wave', label: 'Exactly λ/2: 73 + j42.5 Ω, 2.15 dBi (Balanis)', state: { solveFor: 'xin', f: 300e6, fUnit: 'MHz', len: C0 / 300e6 / 2, lenUnit: 'mm', d: 1e-3, dUnit: 'mm', z0: 75 } },
    { id: 'vhf-2m', label: '2 m band, 6 mm aluminium tube (146 MHz)', state: { solveFor: 'len', f: 146e6, fUnit: 'MHz', d: 6e-3, dUnit: 'mm', lenUnit: 'mm', xin: 0, z0: 50, material: 'Aluminium', sigma: 3.5e7 } },
    { id: 'resonance-of-wire', label: 'Where does a 10 m wire resonate?', state: { solveFor: 'f', len: 10, lenUnit: 'm', d: 1.6e-3, dUnit: 'mm', xin: 0, fUnit: 'MHz' } },
    { id: 'full-wave', label: 'Edge case: near full-wave (antiresonance)', state: { solveFor: 'xin', f: 300e6, fUnit: 'MHz', len: 0.95, lenUnit: 'm', d: 2e-3, dUnit: 'mm' } },
    { id: 'short', label: 'Short dipole: 1 m at 7 MHz (L/λ ≈ 0.023)', state: { solveFor: 'xin', f: 7e6, fUnit: 'MHz', len: 1, lenUnit: 'm', d: 2e-3, dUnit: 'mm' } },
  ],
};
