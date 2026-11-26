/**
 * Doubly terminated LC ladder filters — pure model.
 *
 * Prototype g-values: Butterworth gₖ = 2 sin((2k−1)π/2n); Chebyshev type I from Matthaei, Young &
 * Jones (1964) §4.05 / Pozar 4e eqs. 8.73. Frequency/impedance transformations: Pozar Table 8.6.
 * The response is computed from the actual component values with ABCD matrices — so it checks the
 * synthesis, and shows what rounding to E-series values does.
 */

import { type Abcd, type Cx, abcdIdentity, abcdMul, abcdSeries, abcdShunt, abcdToS, abs, add, arg, cx, inv } from '@/core/math/complex';

export type Response = 'butterworth' | 'chebyshev';
export type Band = 'lowpass' | 'highpass' | 'bandpass' | 'bandstop';

/** Low-pass prototype g₁…gₙ and g_{n+1}. */
export function prototype(n: number, response: Response, rippleDb: number): number[] {
  const g: number[] = [];
  if (response === 'butterworth') {
    for (let k = 1; k <= n; k++) g.push(2 * Math.sin(((2 * k - 1) * Math.PI) / (2 * n)));
    g.push(1);
    return g;
  }
  // β = ln coth(L_Ar / 17.37), where 17.37 = 40 / ln 10
  const beta = Math.log(1 / Math.tanh(rippleDb / (40 / Math.LN10)));
  const gamma = Math.sinh(beta / (2 * n));
  const a = (k: number) => Math.sin(((2 * k - 1) * Math.PI) / (2 * n));
  const b = (k: number) => gamma * gamma + Math.sin((k * Math.PI) / n) ** 2;
  g.push((2 * a(1)) / gamma);
  for (let k = 2; k <= n; k++) g.push((4 * a(k - 1) * a(k)) / (b(k - 1) * g[k - 2]));
  g.push(n % 2 === 1 ? 1 : 1 / Math.tanh(beta / 4) ** 2);
  return g;
}

/** Normalised frequency Ω seen by the low-pass prototype. */
export function protoOmega(f: number, band: Band, fc: number, f0: number, bw: number): number {
  switch (band) {
    case 'lowpass':
      return f / fc;
    case 'highpass':
      return fc / f;
    case 'bandpass':
      return Math.abs(f / f0 - f0 / f) / (bw / f0);
    case 'bandstop': {
      const d = Math.abs(f / f0 - f0 / f);
      return d === 0 ? Infinity : bw / f0 / d;
    }
  }
}

/** Minimum order for attenuation `as` dB at prototype frequency Ω (> 1). */
export function minOrder(response: Response, rippleDb: number, as: number, omega: number): number {
  if (!(omega > 1)) return Infinity;
  if (response === 'butterworth') {
    // fc is the −3 dB point: |H|² = 1/(1+Ω^2n)
    return Math.max(1, Math.ceil(Math.log10(10 ** (as / 10) - 1) / (2 * Math.log10(omega)) - 1e-9));
  }
  const eps2 = 10 ** (rippleDb / 10) - 1;
  const ratio = (10 ** (as / 10) - 1) / eps2;
  if (ratio <= 1) return 1; // spec at or below the ripple: any order meets it
  return Math.max(1, Math.ceil(Math.acosh(Math.sqrt(ratio)) / Math.acosh(omega) - 1e-9));
}

/** Ideal prototype attenuation (dB) at normalised frequency Ω. */
export function protoAttenuation(response: Response, n: number, rippleDb: number, omega: number): number {
  if (response === 'butterworth') return 10 * Math.log10(1 + omega ** (2 * n));
  const eps2 = 10 ** (rippleDb / 10) - 1;
  const t = omega <= 1 ? Math.cos(n * Math.acos(omega)) : Math.cosh(n * Math.acosh(omega));
  return 10 * Math.log10(1 + eps2 * t * t);
}

export interface Part {
  ref: string;
  kind: 'L' | 'C';
  value: number;
}

/** One ladder position: series arm or shunt arm, made of 1 or 2 parts. */
export interface Arm {
  position: 'series' | 'shunt';
  /** How the parts in this arm connect: single part, LC in series, or LC in parallel */
  form: 'single' | 'seriesLC' | 'parallelLC';
  g: number;
  parts: Part[];
}

export interface Design {
  g: number[];
  arms: Arm[];
  rs: number;
  rl: number;
}

/**
 * Build the ladder. `first` = 'shunt' starts with a shunt element (minimum-inductor for
 * low-pass), 'series' starts with a series element.
 */
export function synthesize(o: { n: number; response: Response; rippleDb: number; band: Band; fc: number; f0: number; bw: number; r0: number; first: 'shunt' | 'series' }): Design {
  const g = prototype(o.n, o.response, o.rippleDb);
  const wc = 2 * Math.PI * o.fc;
  const w0 = 2 * Math.PI * o.f0;
  const delta = o.bw / o.f0;
  const R = o.r0;
  const arms: Arm[] = [];
  let nL = 0;
  let nC = 0;
  const L = (value: number): Part => ({ ref: `L${++nL}`, kind: 'L', value });
  const C = (value: number): Part => ({ ref: `C${++nC}`, kind: 'C', value });
  for (let k = 0; k < o.n; k++) {
    const gk = g[k];
    const shunt = (k % 2 === 0) === (o.first === 'shunt');
    let arm: Arm;
    if (shunt) {
      // prototype shunt capacitor gk
      switch (o.band) {
        case 'lowpass':
          arm = { position: 'shunt', form: 'single', g: gk, parts: [C(gk / (wc * R))] };
          break;
        case 'highpass':
          arm = { position: 'shunt', form: 'single', g: gk, parts: [L(R / (wc * gk))] };
          break;
        case 'bandpass':
          arm = { position: 'shunt', form: 'parallelLC', g: gk, parts: [L((delta * R) / (w0 * gk)), C(gk / (w0 * delta * R))] };
          break;
        case 'bandstop':
          arm = { position: 'shunt', form: 'seriesLC', g: gk, parts: [L(R / (w0 * delta * gk)), C((gk * delta) / (w0 * R))] };
          break;
      }
    } else {
      // prototype series inductor gk
      switch (o.band) {
        case 'lowpass':
          arm = { position: 'series', form: 'single', g: gk, parts: [L((gk * R) / wc)] };
          break;
        case 'highpass':
          arm = { position: 'series', form: 'single', g: gk, parts: [C(1 / (wc * gk * R))] };
          break;
        case 'bandpass':
          arm = { position: 'series', form: 'seriesLC', g: gk, parts: [L((gk * R) / (w0 * delta)), C(delta / (w0 * gk * R))] };
          break;
        case 'bandstop':
          arm = { position: 'series', form: 'parallelLC', g: gk, parts: [L((gk * delta * R) / w0), C(1 / (w0 * delta * gk * R))] };
          break;
      }
    }
    arms.push(arm);
  }
  // g_{n+1}: a load resistance if the last element is shunt, a load conductance if series.
  const gl = g[o.n];
  const lastShunt = arms[arms.length - 1].position === 'shunt';
  return { g, arms, rs: R, rl: lastShunt ? gl * R : R / gl };
}

/** Impedance of one part at angular frequency w; inductors optionally with finite Q. */
function partZ(p: Part, w: number, qL: number | null): Cx {
  if (p.kind === 'L') return cx(qL ? (w * p.value) / qL : 0, w * p.value);
  return cx(0, -1 / (w * p.value));
}

/** 1/a that stays finite at an exact (lossless) resonance, where a is exactly 0. */
function invSafe(a: Cx): Cx {
  return a.re === 0 && a.im === 0 ? cx(1e300, 0) : inv(a);
}

/** Series arms need an impedance, shunt arms an admittance — computed directly, never as 1/(1/x). */
function armZ(a: Arm, w: number, qL: number | null): Cx {
  const zs = a.parts.map((p) => partZ(p, w, qL));
  if (a.form === 'single') return zs[0];
  if (a.form === 'seriesLC') return add(zs[0], zs[1]);
  return invSafe(add(inv(zs[0]), inv(zs[1])));
}

function armY(a: Arm, w: number, qL: number | null): Cx {
  const zs = a.parts.map((p) => partZ(p, w, qL));
  if (a.form === 'single') return inv(zs[0]);
  if (a.form === 'parallelLC') return add(inv(zs[0]), inv(zs[1]));
  return invSafe(add(zs[0], zs[1]));
}

export function ladderAbcd(d: Design, f: number, qL: number | null = null): Abcd {
  const w = 2 * Math.PI * f;
  let m = abcdIdentity();
  for (const a of d.arms) m = abcdMul(m, a.position === 'series' ? abcdSeries(armZ(a, w, qL)) : abcdShunt(armY(a, w, qL)));
  return m;
}

export interface ResponsePoint {
  f: number;
  s21db: number;
  s11db: number;
  phase: number;
}

export function response(d: Design, freqs: number[], qL: number | null = null): ResponsePoint[] {
  return freqs.map((f) => {
    let { s21, s11 } = abcdToS(ladderAbcd(d, f, qL), d.rs, d.rl);
    // Exactly at a lossless resonance the arithmetic can overflow; step off by 1 ppb.
    if (!Number.isFinite(s21.re + s21.im + s11.re + s11.im)) ({ s21, s11 } = abcdToS(ladderAbcd(d, f * (1 + 1e-9), qL), d.rs, d.rl));
    return { f, s21db: 20 * Math.log10(Math.max(abs(s21), 1e-300)), s11db: 20 * Math.log10(Math.max(abs(s11), 1e-300)), phase: arg(s21) };
  });
}

/**
 * Group delay −dφ/dω at each frequency by a local central difference of the S21 phase (step ±1e-7·f,
 * phase difference taken as arg(S21⁺/S21⁻) so no unwrapping is needed). NaN where |S21| is below
 * −150 dB (at a lossless transmission zero the phase steps by π and the delay is undefined).
 */
export function groupDelayAt(d: Design, freqs: number[], qL: number | null = null): number[] {
  return freqs.map((f) => {
    const h = 1e-7 * f;
    const a = abcdToS(ladderAbcd(d, f - h, qL), d.rs, d.rl).s21;
    const b = abcdToS(ladderAbcd(d, f + h, qL), d.rs, d.rl).s21;
    if (abs(a) < 3e-8 || abs(b) < 3e-8) return NaN;
    const dphi = Math.atan2(a.re * b.im - a.im * b.re, a.re * b.re + a.im * b.im);
    return -dphi / (2 * Math.PI * 2 * h);
  });
}

/** Group delay −dφ/dω from a phase sweep (phase unwrapped). Kept for reference; see groupDelayAt. */
export function groupDelay(pts: ResponsePoint[]): number[] {
  const ph = pts.map((p) => p.phase);
  for (let i = 1; i < ph.length; i++) {
    while (ph[i] - ph[i - 1] > Math.PI) ph[i] -= 2 * Math.PI;
    while (ph[i] - ph[i - 1] < -Math.PI) ph[i] += 2 * Math.PI;
  }
  return pts.map((_, i) => {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, pts.length - 1);
    return -(ph[b] - ph[a]) / (2 * Math.PI * (pts[b].f - pts[a].f));
  });
}

/**
 * Outermost crossing of `levelDb`, searching from the stopband end `fFrom` towards the passband end `fTo`
 * on a log grid, then bisecting the first sign change (so ripple dips inside the passband are ignored).
 */
export function outerCrossing(d: Design, levelDb: number, fFrom: number, fTo: number, qL: number | null = null): number | null {
  const n = 800;
  const g = (f: number) => response(d, [f], qL)[0].s21db - levelDb;
  let fPrev = fFrom;
  let gPrev = g(fFrom);
  for (let i = 1; i <= n; i++) {
    const f = fFrom * (fTo / fFrom) ** (i / n);
    const gi = g(f);
    if (gPrev < 0 && gi >= 0) return crossing(d, levelDb, Math.min(fPrev, f), Math.max(fPrev, f), qL);
    fPrev = f;
    gPrev = gi;
  }
  return null;
}

/** Find where |S21| crosses `levelDb` between f1 and f2 (bisection on a monotone segment). */
export function crossing(d: Design, levelDb: number, f1: number, f2: number, qL: number | null = null): number | null {
  const g = (f: number) => response(d, [f], qL)[0].s21db - levelDb;
  let a = f1;
  let b = f2;
  let ga = g(a);
  const gb = g(b);
  if (ga * gb > 0) return null;
  for (let i = 0; i < 100; i++) {
    const m = Math.sqrt(a * b);
    const gm = g(m);
    if (ga * gm <= 0) b = m;
    else {
      a = m;
      ga = gm;
    }
    if (b / a - 1 < 1e-10) break;
  }
  return Math.sqrt(a * b);
}
