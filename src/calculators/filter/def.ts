/** LC ladder filter designer — calculator definition (DOM-free). */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { nearestE } from '@/core/eseries';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, U_OHM } from '@/core/unitsets';
import { type Band, type Design, type Response, groupDelayAt, minOrder, outerCrossing, protoAttenuation, protoOmega, response, synthesize } from './model';

export interface FilterState {
  solveFor: 'n' | 'as';
  response: Response;
  ripple: number;
  band: Band;
  fc: number;
  fcUnit: string;
  f0: number;
  f0Unit: string;
  bw: number;
  bwUnit: string;
  r0: number;
  r0Unit: string;
  first: 'shunt' | 'series';
  n: number;
  fs: number;
  fsUnit: string;
  as: number;
  eseries: string;
  qL: number | null;
}

export const defaults = (): FilterState => ({
  solveFor: 'n',
  response: 'butterworth',
  ripple: 0.5,
  band: 'lowpass',
  fc: 100e6,
  fcUnit: 'MHz',
  f0: 100e6,
  f0Unit: 'MHz',
  bw: 10e6,
  bwUnit: 'MHz',
  r0: 50,
  r0Unit: 'Ω',
  first: 'shunt',
  n: 5,
  fs: 200e6,
  fsUnit: 'MHz',
  as: 40,
  eseries: 'ideal',
  qL: null,
});

const isPass = (s: any) => s.band === 'bandpass' || s.band === 'bandstop';

/**
 * Filter type switch. The cutoff f_c (LP/HP) and the centre f₀ (BP/BS) are kept equal by `sync`, so the
 * design stays at the same frequency. f_s is only moved when it would fall inside the new passband
 * (a low-pass f_s above f_c is in a high-pass's passband): it is mirrored to the same normalised
 * stopband frequency Ω_s on the other side (same order, and switching back restores it), or set to
 * Ω_s = 2 when it sat on the band edge or at the notch centre.
 */
export function retarget(s: FilterState): void {
  const pass = isPass(s);
  if (pass && !(s.bw > 1e-3 * s.f0 && s.bw < 2 * s.f0)) {
    // a band-pass/stop entered from LP/HP keeps a bandwidth left from another design: 10 % of f₀
    s.bw = s.f0 / 10;
    s.bwUnit = s.f0Unit;
  }
  const om = protoOmega(s.fs, s.band, s.fc, s.f0, s.bw);
  if (om > 1) return;
  const target = om > 0 && om < 0.95 ? 1 / om : 2;
  const above = s.fs >= (pass ? s.f0 : s.fc);
  if (s.band === 'lowpass') s.fs = target * s.fc;
  else if (s.band === 'highpass') s.fs = s.fc / target;
  else {
    const d = s.bw / s.f0;
    const x = s.band === 'bandpass' ? target * d : d / target; // |f/f₀ − f₀/f| at Ω = target
    const k = x / 2 + Math.sqrt((x * x) / 4 + 1);
    s.fs = above ? s.f0 * k : s.f0 / k;
  }
}

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Specification',
    fields: [
      { kind: 'select', key: 'response', label: 'Response', structural: false, options: [{ value: 'butterworth', label: 'Butterworth (maximally flat)' }, { value: 'chebyshev', label: 'Chebyshev type I (equiripple)' }] },
      { kind: 'number', key: 'ripple', symbol: 'L_Ar', label: 'Passband ripple', suffix: 'dB', min: 0.001, max: 3, visible: (s) => s.response === 'chebyshev', help: 'Peak-to-peak passband ripple. 0.01–0.1 dB keeps the return loss high (≈ 26–16 dB); 0.5–1 dB gives a steeper skirt.' },
      { kind: 'select', key: 'band', label: 'Filter type', apply: (_v, s) => retarget(s as FilterState), options: [{ value: 'lowpass', label: 'Low-pass' }, { value: 'highpass', label: 'High-pass' }, { value: 'bandpass', label: 'Band-pass' }, { value: 'bandstop', label: 'Band-stop (notch)' }] },
      { kind: 'number', key: 'fc', symbol: 'f_c', label: 'Cutoff frequency', units: U_FREQ, unitKey: 'fcUnit', min: 1e-3, max: 1e12, visible: (s) => !isPass(s), help: 'Butterworth: the −3 dB point. Chebyshev: the edge of the ripple band (the −3 dB point lies a little beyond it).' },
      { kind: 'number', key: 'f0', symbol: 'f₀', label: 'Centre frequency', units: U_FREQ, unitKey: 'f0Unit', min: 1e-3, max: 1e12, visible: isPass, help: 'Geometric centre √(f₁·f₂) of the band edges.' },
      { kind: 'number', key: 'bw', symbol: 'BW', label: 'Bandwidth', units: U_FREQ, unitKey: 'bwUnit', min: 1e-3, max: 1e12, visible: isPass, help: 'Between the band edges (−3 dB for Butterworth, ripple edges for Chebyshev). Narrow fractional bandwidths (< ~5 %) give extreme L/C ratios — consider coupled-resonator topologies instead.' },
      { kind: 'number', key: 'r0', symbol: 'R₀', label: 'System impedance', units: U_OHM, unitKey: 'r0Unit', min: 1e-3, max: 1e9 },
      { kind: 'select', key: 'first', label: 'First element', options: [{ value: 'shunt', label: 'Shunt first (π)' }, { value: 'series', label: 'Series first (T)' }], help: 'Fewest inductors: shunt-first for a low-pass, series-first for a high-pass (odd orders).' },
    ],
  },
  {
    kind: 'section',
    title: 'Order & stopband',
    note: 'Click ◎ on the order to choose the smallest order that meets the stopband attenuation, or on the attenuation to see what a chosen order achieves.',
    fields: [
      { kind: 'number', key: 'n', symbol: 'n', label: 'Filter order', integer: true, min: 1, max: 15, solvable: true },
      { kind: 'number', key: 'fs', symbol: 'f_s', label: 'Stopband frequency', units: U_FREQ, unitKey: 'fsUnit', min: 1e-3, max: 1e12, help: 'Where the attenuation A_s is required: above f_c for a low-pass, below it for a high-pass, outside the band for a band-pass, inside the notch for a band-stop.' },
      { kind: 'number', key: 'as', symbol: 'A_s', label: 'Stopband attenuation', suffix: 'dB', min: 1, max: 200, solvable: true },
    ],
  },
  {
    kind: 'section',
    title: 'Build',
    fields: [
      { kind: 'select', key: 'eseries', label: 'Component values', options: [{ value: 'ideal', label: 'Ideal (exact)' }, 'E12', 'E24', 'E48', 'E96'], help: 'Rounds every L and C to the nearest preferred value; the "as built" curve and results use the rounded parts.' },
      { kind: 'number', key: 'qL', symbol: 'Q_L', label: 'Inductor Q', min: 0, max: 1e6, optional: true, zeroHint: '∞ (lossless)', help: 'Unloaded Q of every inductor at each frequency (series R = ωL/Q). Capacitors are taken as lossless.' },
    ],
  },
];

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

export function bandEdges(s: FilterState): { f1: number; f2: number } {
  const half = s.bw / 2;
  const c = Math.sqrt(half * half + s.f0 * s.f0);
  return { f1: c - half, f2: c + half };
}

export function compute(st: FilterState): CalcReport {
  const warnings: string[] = [];
  const notes: string[] = [];
  const pass = isPass(st);
  const omegaS = protoOmega(st.fs, st.band, st.fc, st.f0, st.bw);
  let n = Math.round(st.n);
  const solvingN = st.solveFor === 'n';
  const fsInPass = !(omegaS > 1);
  if (fsInPass) warnings.push('The stopband frequency f_s lies inside the passband — move it into the stopband.');
  let capped = false;
  // f_s exactly at a band-stop centre (Ω_s = ∞): every order nulls it, so the minimum order is 1 (solving n
  // from the notch example therefore gives 1, not the example's 3; expected).
  if (solvingN) {
    const nMin = minOrder(st.response, st.ripple, st.as, omegaS);
    if (!Number.isFinite(nMin)) {
      n = Math.min(Math.max(n, 1), 15);
    } else if (nMin > 15) {
      capped = true;
      warnings.push(`This needs order ${nMin}; the calculator stops at 15. Relax the stopband spec${st.response === 'butterworth' ? ' or use a Chebyshev response' : ' or allow more ripple'}.`);
      n = 15;
    } else n = nMin;
  }
  n = Math.min(Math.max(n, 1), 15);
  // Even-order Chebyshev ladders need unequal terminations; between equal R₀ ends use the next odd order.
  if (solvingN && st.response === 'chebyshev' && n % 2 === 0 && n < 15) {
    n += 1;
    notes.push(`Order rounded up from ${n - 1} to ${n}: even-order Chebyshev ladders need a load ≠ R₀, so an odd order is used for equal terminations.`);
  }

  const base = { n, response: st.response, rippleDb: st.ripple, band: st.band, fc: st.fc, f0: st.f0, bw: st.bw, r0: st.r0, first: st.first };
  const ideal = synthesize(base);
  const built: Design = st.eseries === 'ideal' ? ideal : { ...ideal, arms: ideal.arms.map((a) => ({ ...a, parts: a.parts.map((p) => ({ ...p, value: nearestE(p.value, st.eseries) })) })) };
  const qL = st.qL && st.qL > 0 ? st.qL : null;
  const asIdeal = protoAttenuation(st.response, n, st.ripple, omegaS);

  // Frequency sweep
  const span = pass ? Math.min(10, 1 + 6 * (st.bw / st.f0)) : 1;
  let fa: number;
  let fb: number;
  if (st.band === 'lowpass') [fa, fb] = [st.fc / 100, Math.max(st.fc * 10, st.fs * 2)];
  else if (st.band === 'highpass') [fa, fb] = [Math.min(st.fc / 10, st.fs / 2), st.fc * 100];
  else [fa, fb] = [Math.min(st.f0 / span, st.fs / 1.2), Math.max(st.f0 * span, st.fs * 1.2)];
  // Log sweep plus a dense sweep across the passband so narrow bands are resolved.
  const { f1, f2 } = bandEdges(st);
  const [pa, pb] = st.band === 'lowpass' ? [st.fc / 3, st.fc * 1.5] : st.band === 'highpass' ? [st.fc / 1.5, st.fc * 3] : [f1 - 0.6 * st.bw, f2 + 0.6 * st.bw];
  const freqs = [...logspace(fa, fb, 600), ...logspace(Math.max(pa, fa), Math.min(pb, fb), 400)].sort((a, b) => a - b).filter((f, i, a) => i === 0 || f > a[i - 1]);
  const rIdeal = response(ideal, freqs);
  const rBuilt = response(built, freqs, qL);
  // Group delay only where it is defined and interesting: around the passband (deep in the stopband |S21|
  // is below −150 dB and the delay is undefined, which would leave most of a wide sweep empty).
  const [ga, gb] = st.band === 'lowpass' ? [fa, st.fc * 3] : st.band === 'highpass' ? [st.fc / 3, fb] : [f1 - 2 * st.bw, f2 + 2 * st.bw];
  const gdFreqs = freqs.filter((f) => f >= ga && f <= gb);
  const gd = groupDelayAt(built, gdFreqs, qL);

  // As-built figures
  const s21At = (d: Design, f: number, q: number | null) => response(d, [f], q)[0].s21db;
  const asBuilt = -s21At(built, st.fs, qL);
  // Prototype −3 dB frequency Ω₃ (1 for Butterworth; cosh(acosh(1/ε)/n) for Chebyshev) bounds the search.
  const eps = Math.sqrt(10 ** (st.ripple / 10) - 1);
  const om3 = st.response === 'butterworth' ? 1 : Math.cosh(Math.acosh(Math.max(1 / eps, 1)) / n);
  const far = Math.max(20, 4 * om3);
  // Edges are measured 3 dB below the passband peak, so lossy (finite-Q) designs still report a bandwidth.
  const peakDb = Math.max(...response(built, [...freqs, ...logspace(fa, fb, 1500)], qL).map((p) => p.s21db));
  const lvl = peakDb - 3.0103;
  let edges: { label: string; f: number | null }[] = [];
  if (st.band === 'lowpass') edges = [{ label: 'f₋₃dB', f: outerCrossing(built, lvl, st.fc * far, st.fc / 100, qL) }];
  else if (st.band === 'highpass') edges = [{ label: 'f₋₃dB', f: outerCrossing(built, lvl, st.fc / far, st.fc * 100, qL) }];
  else if (st.band === 'bandpass') {
    const k = 1 + far * (st.bw / st.f0);
    edges = [{ label: 'f₁ (−3 dB)', f: outerCrossing(built, lvl, st.f0 / k, st.f0 * 0.999999, qL) }, { label: 'f₂ (−3 dB)', f: outerCrossing(built, lvl, st.f0 * k, st.f0 * 1.000001, qL) }];
  } else {
    // band-stop: the passbands are outside; search outwards from the notch
    const k = 1 + far * (st.bw / st.f0);
    edges = [{ label: 'f₁ (−3 dB)', f: outerCrossing(built, lvl, st.f0 * 0.999999, st.f0 / k, qL) }, { label: 'f₂ (−3 dB)', f: outerCrossing(built, lvl, st.f0 * 1.000001, st.f0 * k, qL) }];
  }

  // Passband loss (as built): worst loss inside the design passband
  const inPass = (f: number) => (st.band === 'lowpass' ? f <= st.fc : st.band === 'highpass' ? f >= st.fc : st.band === 'bandpass' ? f >= f1 && f <= f2 : f <= f1 || f >= f2);
  const edgeFs = st.band === 'lowpass' || st.band === 'highpass' ? [st.fc] : [f1, f2];
  const passPts = [...logspace(fa, fb, 3000).filter(inPass), ...edgeFs];
  const finiteMax = (xs: number[]) => Math.max(...xs.filter(Number.isFinite));
  const passLoss = finiteMax(response(built, passPts, qL).map((p) => -p.s21db));
  const minLoss = Math.max(-peakDb, 0);
  // Return loss over the inner passband (Ω ≤ 0.8) — at the edge it is ~3 dB for any Butterworth.
  const dl = st.bw / st.f0;
  const om08 = (o: number) => {
    // frequencies where the prototype Ω equals o
    if (st.band === 'lowpass') return [o * st.fc];
    if (st.band === 'highpass') return [st.fc / o];
    const x = st.band === 'bandpass' ? o * dl : dl / o; // |f/f0 − f0/f| = x
    const r = Math.sqrt(x * x / 4 + 1);
    return [st.f0 * (r - x / 2), st.f0 * (r + x / 2)];
  };
  const innerPts = [...logspace(fa, fb, 3000).filter((f) => protoOmega(f, st.band, st.fc, st.f0, st.bw) <= 0.8), ...om08(0.8)];
  const worstRl = innerPts.length ? finiteMax(response(built, innerPts, qL).map((p) => p.s11db)) : NaN;

  // Component table
  const rows: Record<string, number | string | null>[] = [];
  const disp: Record<string, string>[] = [];
  let maxErr = 0;
  ideal.arms.forEach((arm, i) => {
    arm.parts.forEach((p, j) => {
      const b = built.arms[i].parts[j].value;
      const err = (b / p.value - 1) * 100;
      maxErr = Math.max(maxErr, Math.abs(err));
      const where = `${arm.position}${arm.form === 'single' ? '' : arm.form === 'seriesLC' ? ' (series LC)' : ' (parallel LC)'}`;
      rows.push({ ref: p.ref, position: where, g: arm.g, ideal: p.value, built: b, error: err });
      disp.push({ ref: p.ref, position: where, g: arm.g.toFixed(4), ideal: si(p.value, p.kind === 'L' ? 'H' : 'F', 4), built: si(b, p.kind === 'L' ? 'H' : 'F', 3), error: st.eseries === 'ideal' ? '—' : `${err >= 0 ? '+' : ''}${err.toFixed(1)} %` });
    });
  });

  if (Math.abs(ideal.rl - st.r0) / st.r0 > 1e-6) warnings.push(`An even-order Chebyshev ladder needs a load of ${si(ideal.rl, 'Ω', 4)} (not ${si(st.r0, 'Ω')}). Terminating it in ${si(st.r0, 'Ω')} raises the ripple; use an odd order for equal terminations.`);
  if (pass && st.bw / st.f0 < 0.05) warnings.push(`Fractional bandwidth ${(100 * st.bw / st.f0).toFixed(1)} %: lumped ladder values become extreme and very sensitive to tolerance${st.band === 'bandpass' ? '. Coupled-resonator designs are preferred below ~5–10 %' : ', and the notch depth depends strongly on resonator Q'}.`);
  const vals = ideal.arms.flatMap((a) => a.parts);
  const maxL = Math.max(...vals.filter((p) => p.kind === 'L').map((p) => p.value), 0);
  const minL = Math.min(...vals.filter((p) => p.kind === 'L').map((p) => p.value), Infinity);
  const minC = Math.min(...vals.filter((p) => p.kind === 'C').map((p) => p.value), Infinity);
  if (minC < 0.5e-12) warnings.push(`Smallest capacitor is ${si(minC, 'F')} — comparable to PCB and pad parasitics.`);
  if (minL < 1e-9) warnings.push(`An inductor of ${si(minL, 'H')} is smaller than a typical trace or via parasitic.`);
  if (Number.isFinite(minL) && maxL / minL > 300) notes.push(`Inductor values span ${si(minL, 'H')} to ${si(maxL, 'H')} (×${(maxL / minL).toFixed(0)}): check that the largest inductor's self-resonance is well above ${si(pass ? st.f0 : st.fc, 'Hz')}.`);
  if (minLoss > 1) warnings.push(`Passband insertion loss is ${minLoss.toFixed(1)} dB at its best point — the inductor Q is too low for this ${pass ? 'bandwidth' : 'design'}${pass ? ` (rule of thumb: Q_u ≫ g·f₀/BW ≈ ${(Math.max(...ideal.g.slice(0, n)) * st.f0 / st.bw).toFixed(0)})` : ''}.`);
  if (solvingN && !capped && !fsInPass && asBuilt < st.as - 0.05) warnings.push(`As built (${st.eseries !== 'ideal' ? `${st.eseries} values` : ''}${st.eseries !== 'ideal' && qL ? ', ' : ''}${qL ? `Q_L = ${qL}` : ''}) the attenuation at f_s is ${asBuilt.toFixed(1)} dB — below the ${+st.as.toFixed(2)} dB target. Use one order more or tighter parts.`);
  if (st.band === 'bandstop' && asBuilt > 80) notes.push('The notch depth shown is for ideal components; real notches are limited to roughly 40–60 dB by component loss, tolerance and coupling.');
  notes.push('Ideal lossless L and C unless an inductor Q is given; real parts add loss (rounding the passband corners), self-resonance and parasitic coupling, which limit the ultimate stopband.');
  notes.push('Element values from the low-pass prototype (Butterworth closed form; Chebyshev per Matthaei, Young & Jones), transformed per Pozar Table 8.6. The response curves are computed from the actual parts with ABCD matrices.');

  const r = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [
    r('n', 'Filter order', n, '', String(n), { symbol: 'n', primary: true, solved: solvingN, tone: solvingN && (capped || fsInPass) ? 'warn' : '', note: solvingN ? (capped ? 'capped at 15 — spec not met' : fsInPass ? 'f_s is in the passband' : `smallest order with ≥ ${st.as} dB at ${si(st.fs, 'Hz')}`) : `${ideal.arms.flatMap((a) => a.parts).length} components` }),
    // Written back rounded DOWN to 0.01 dB: rounding up (18.129 → 18.13) would make "solve n" for this value
    // need one order more, so A_s → n → A_s would not return. When n is the unknown it is rounded up to a whole
    // order, so A(f_s) exceeds the target and solving A_s from there gives the larger value (not a round-trip error).
    r('as', `Attenuation at ${si(st.fs, 'Hz')}`, fsInPass ? null : Number.isFinite(asIdeal) ? Math.min(Math.max(Math.floor(asIdeal * 100 + 1e-6) / 100, 1), 200) : null, 'dB', fsInPass ? '— (f_s in passband)' : Number.isFinite(asIdeal) ? `${asIdeal.toFixed(1)} dB` : '∞', { symbol: 'A(f_s)', primary: true, solved: !solvingN, note: Number.isFinite(asBuilt) && asBuilt < 300 ? `${asBuilt.toFixed(1)} dB as built` : '∞ as built', tone: solvingN && (asIdeal < st.as || asBuilt < st.as - 0.05) ? 'warn' : '' }),
    ...edges.map((e, i) => r(i === 0 ? 'f3db' : 'f3db2', `${e.label} as built`, e.f, 'Hz', e.f ? si(e.f, 'Hz', 4) : '—', { symbol: e.label.split(' ')[0], primary: true })),
    r('minLoss', 'Minimum (midband) insertion loss', minLoss, 'dB', `${minLoss.toFixed(3)} dB`, { group: 'As built', symbol: 'IL_min', tone: minLoss > 1 ? 'warn' : '' }),
    r('passLoss', 'Loss at the band edge (worst in passband)', Number.isFinite(passLoss) ? passLoss : null, 'dB', Number.isFinite(passLoss) ? `${passLoss.toFixed(3)} dB` : '—', { group: 'As built', note: st.response === 'butterworth' ? '≈ 3 dB by definition for Butterworth' : 'ripple + loss' }),
    r('returnLoss', 'Worst return loss for Ω ≤ 0.8', -worstRl, 'dB', Number.isFinite(worstRl) ? `${(-worstRl).toFixed(1)} dB` : '—', { group: 'As built', symbol: 'RL', note: st.response === 'butterworth' ? 'Butterworth: this is the RL at Ω = 0.8; it improves quickly further inside the band' : 'equiripple: set by the ripple' }),
    r('asBuilt', `Attenuation at ${si(st.fs, 'Hz')} (as built)`, asBuilt > 300 ? Infinity : asBuilt, 'dB', asBuilt > 300 ? '∞ (transmission zero)' : `${asBuilt.toFixed(2)} dB`, { group: 'As built' }),
    r('maxError', 'Largest rounding error', st.eseries === 'ideal' ? 0 : maxErr, '%', st.eseries === 'ideal' ? '— (ideal values)' : `${maxErr.toFixed(1)} %`, { group: 'As built' }),
    r('rLoad', 'Load resistance', ideal.rl, 'Ω', si(ideal.rl, 'Ω', 4), { group: 'Network', symbol: 'R_L' }),
    r('omegaS', 'Normalised stopband frequency', omegaS, '', Number.isFinite(omegaS) ? omegaS.toPrecision(4) : '∞', { group: 'Network', symbol: 'Ω_s' }),
  ];
  if (pass) {
    results.push(r('f1', 'Band edge f₁', f1, 'Hz', si(f1, 'Hz', 4), { group: 'Network' }), r('f2', 'Band edge f₂', f2, 'Hz', si(f2, 'Hz', 4), { group: 'Network' }), r('q', 'Loaded Q (f₀/BW)', st.f0 / st.bw, '', (st.f0 / st.bw).toPrecision(3), { group: 'Network' }));
  }

  const marker = { x: st.fs, y: Math.max(-asBuilt, -Math.max(st.as * 1.6, 60)), axis: 'db', label: asBuilt > 300 ? '−∞ dB' : `${(-asBuilt).toFixed(1)} dB` };
  const graphs: GraphSpec[] = [
    {
      id: 'response',
      title: 'Response',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'db', label: 'Magnitude', unit: 'dB', min: -Math.max(st.as * 1.6, 60), max: 3 }],
      series: [
        { label: '|S21| as built', x: freqs, y: rBuilt.map((p) => p.s21db), axis: 'db', width: 2.2 },
        ...(st.eseries !== 'ideal' || qL ? [{ label: '|S21| ideal', x: freqs, y: rIdeal.map((p) => p.s21db), axis: 'db', color: '#9a8f7a', dash: [5, 3], width: 1.3 }] : []),
        { label: '|S11| as built', x: freqs, y: rBuilt.map((p) => p.s11db), axis: 'db', color: '#c47b17', width: 1.3 },
      ],
      hlines: [{ value: -st.as, label: `−${+st.as.toFixed(1)} dB`, axis: 'db', color: '#8b1e1e', dash: [3, 3] }],
      vlines: [{ value: st.fs, label: `f_s ${si(st.fs, 'Hz')}`, color: '#8b1e1e' }],
      markers: [marker],
    },
    {
      id: 'passband',
      title: 'Passband detail',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'db', label: '|S21|', unit: 'dB', min: Math.min(-minLoss, 0) - (st.response === 'chebyshev' ? Math.max(st.ripple * 2.5, 0.05) : 4), max: Math.min(-minLoss, 0) + 0.2 }],
      xRange: st.band === 'lowpass' ? [Math.max(fa, st.fc / 20), st.fc * 1.5] : st.band === 'highpass' ? [st.fc / 1.5, Math.min(fb, st.fc * 20)] : [Math.max(fa, f1 - 0.5 * st.bw), Math.min(fb, f2 + 0.5 * st.bw)],
      series: [
        { label: '|S21| as built', x: freqs, y: rBuilt.map((p) => p.s21db), axis: 'db', width: 2.2 },
        ...(st.eseries !== 'ideal' || qL ? [{ label: '|S21| ideal', x: freqs, y: rIdeal.map((p) => p.s21db), axis: 'db', color: '#9a8f7a', dash: [5, 3], width: 1.3 }] : []),
      ],
      hlines: [{ value: -3.0103, label: '−3 dB', axis: 'db', color: '#9a8f7a', dash: [2, 3] }],
    },
    {
      id: 'delay',
      title: 'Group delay',
      x: { label: 'Frequency', unit: 'Hz', log: true },
      y: [{ id: 'gd', label: 'Group delay', unit: 's', includeZero: true }],
      series: [{ label: 'Group delay (as built)', x: gdFreqs, y: gd, axis: 'gd', width: 2 }],
    },
  ];
  // A band far narrower than the 1e-7·f difference step (BW of a few Hz at MHz) leaves no defined delay: drop the tab.
  if (!gd.some(Number.isFinite)) graphs.pop();

  return {
    calc: 'signal/filter-designer',
    ok: true,
    solveFor: st.solveFor,
    summary: `${st.response === 'chebyshev' ? `Chebyshev ${st.ripple} dB` : 'Butterworth'} ${st.band} · n = ${n} · ${si(st.r0, 'Ω')} → ${si(ideal.rl, 'Ω', 4)} load`,
    results,
    warnings,
    notes,
    graphs,
    tables: [
      {
        id: 'components',
        title: 'Components (source → load)',
        columns: [
          { key: 'ref', label: 'Ref', align: 'left' },
          { key: 'position', label: 'Position', align: 'left' },
          { key: 'g', label: 'gₖ' },
          { key: 'ideal', label: 'Ideal' },
          { key: 'built', label: st.eseries === 'ideal' ? 'Value' : st.eseries },
          { key: 'error', label: 'Error' },
        ],
        rows,
        display: disp,
        note: `Prototype g-values g₁…g${n} = ${ideal.g.slice(0, n).map((x) => x.toFixed(4)).join(', ')}; g${n + 1} = ${ideal.g[n].toFixed(4)}.`,
      },
    ],
    details: { g: ideal.g, rs: ideal.rs, rl: ideal.rl, omegaS, idealArms: ideal.arms, builtArms: built.arms },
  };
}

export const def: CalcDef<FilterState> = {
  id: 'signal/filter-designer',
  version: '0.1.0',
  method: 'Doubly terminated LC ladder from Butterworth / Chebyshev low-pass prototypes, frequency-transformed (LP/HP/BP/BS); response and group delay computed from the actual (optionally E-series rounded, finite-Q) components with ABCD matrices.',
  fields,
  defaults,
  solve: { default: 'n', analysis: 'as', options: [{ key: 'n', label: 'Minimum order meeting A_s at f_s' }, { key: 'as', label: 'Attenuation at f_s for the chosen order' }] },
  compute,
  // f_c and f₀ are one design frequency seen two ways: keep the hidden one equal so a filter-type switch
  // stays at the same frequency instead of jumping to a value left over from the defaults.
  sync: (s) => {
    if (isPass(s)) {
      s.fc = s.f0;
      s.fcUnit = s.f0Unit;
    } else {
      s.f0 = s.fc;
      s.f0Unit = s.fcUnit;
    }
  },
  examples: [
    { id: 'lp-100m', label: '100 MHz harmonic low-pass, 40 dB at 200 MHz', state: defaults() },
    { id: 'cheb-hp', label: '3 MHz Chebyshev 0.1 dB high-pass, E24', state: { response: 'chebyshev', ripple: 0.1, band: 'highpass', fc: 3e6, fs: 1.5e6, as: 40, eseries: 'E24', solveFor: 'n' } },
    { id: 'bp-10m7', label: '10.7 MHz band-pass, 1 MHz wide, 5th order', state: { band: 'bandpass', f0: 10.7e6, bw: 1e6, fs: 13e6, n: 5, solveFor: 'as', response: 'butterworth' } },
    { id: 'audio-lp', label: '20 kHz audio low-pass, 600 Ω, E12', state: { band: 'lowpass', fc: 20e3, fcUnit: 'kHz', fs: 40e3, fsUnit: 'kHz', r0: 600, n: 3, solveFor: 'as', eseries: 'E12' } },
    { id: 'notch', label: '50 MHz band-stop notch', state: { band: 'bandstop', f0: 50e6, bw: 10e6, fs: 50e6, n: 3, solveFor: 'as' } },
  ],
};
