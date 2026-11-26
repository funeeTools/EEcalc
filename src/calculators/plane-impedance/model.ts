/**
 * Power/ground plane pair — equations (pure, SI in / SI out).
 *
 * Static:
 *   C = ε0·εr·a·b / d                              parallel plates, fringing ignored
 *   L□ = μ0·d                                       sheet (loop) inductance per square of the pair
 *   L_edge = μ0·d·a/b                               uniform current from one b-edge to the other
 *   (E. Bogatin, Signal and Power Integrity — Simplified, 3rd ed., 2018, ch. 6, 14; L. D. Smith, E. Bogatin,
 *    Principles of Power Integrity for PDN Design, Prentice Hall, 2017, ch. 7.)
 *
 * Cavity resonances of a rectangular pair with open (magnetic-wall) edges:
 *   f_mn = c / (2√εr) · √((m/a)² + (n/b)²)
 *
 * Self-impedance at a square port of side w centred at (x, y) — cavity-model double series
 * (G. T. Lei, R. W. Techentin, B. K. Gilbert, “High-frequency characterization of power/ground-plane
 *  structures”, IEEE Trans. MTT 47(5), 1999, pp. 562–569; M. Swaminathan, A. E. Engin, Power Integrity
 *  Modeling and Design for Semiconductors and Systems, Prentice Hall, 2007, §2.4; T. Okoshi, Planar
 *  Circuits for Microwaves and Lightwaves, Springer, 1985):
 *
 *   Z(ω) = jωμ0·d/(a·b) · Σm Σn  χm² χn² · cos²(kxm·x) cos²(kyn·y) · sinc²(kxm·w/2) sinc²(kyn·w/2) / (kxm² + kyn² − k²)
 *
 *   kxm = mπ/a, kyn = nπ/b, χ0 = 1, χm>0 = √2, sinc(u) = sin(u)/u,
 *   k² = ω²·μ0·ε0·εr·(1 − j(tan δ + δs/d)), δs = √(2/(ω μ0 σ)) the conductor skin depth (both plates).
 *   Below the frequency where δs reaches the copper thickness t the plates' resistance stops falling, and the
 *   conductor term is taken at its DC value 2/(σ t ω μ0 d) (the same 2Rs/(ωμ0 d) with Rs = 1/(σ t)).
 *
 * The (0,0) term is the plate capacitance 1/(jωC) (with only the dielectric loss: the static mode carries no
 * plate current, so the δs/d term is applied to the other modes only); the rest give the resonances, and their low-frequency
 * sum is the port's spreading inductance L_sp = μ0 d/(ab) · Σ′ χ²χ²cos²cos²sinc²sinc²/(kxm² + kyn²).
 *
 * Numerics: modes up to 4× the highest frequency asked for are summed exactly; the far modes (up to
 * m = 2a/w, n = 2b/w, at most 400 — beyond that the port's sinc² factor leaves ≈ 0.15 % of the spreading
 * inductance, checked against 8a/w in the Python reference) through the expansion
 * 1/(K − k²) = 1/K + k²/K² + k⁴/K³ + …, whose truncation error is below (1/4)⁶ ≈ 2·10⁻⁴ of those terms.
 */

export const MU0 = 4e-7 * Math.PI;
export const EPS0 = 8.8541878128e-12;
export const C0 = 299_792_458;
export const SIGMA_CU = 5.8e7;

export interface PlaneIn {
  a: number;
  b: number;
  d: number;
  er: number;
  tanD: number;
  /** port centre */
  px: number;
  py: number;
  /** port side (square) */
  wp: number;
  /** plane copper thickness (limits the plate resistance at low frequency) */
  tCu: number;
  sigma?: number;
}

export const planeC = (a: number, b: number, d: number, er: number) => (EPS0 * er * a * b) / d;
export const modeF = (m: number, n: number, a: number, b: number, er: number) => (C0 / (2 * Math.sqrt(er))) * Math.hypot(m / a, n / b);

const sinc = (u: number) => (Math.abs(u) < 1e-8 ? 1 : Math.sin(u) / u);

/** Port-coupling weights per index: χ² cos²(k x) sinc²(k w/2) (separable in m and n). */
function weights(n: number, len: number, pos: number, wp: number): Float64Array {
  const out = new Float64Array(n + 1);
  for (let m = 0; m <= n; m++) {
    const k = (m * Math.PI) / len;
    const c = Math.cos(k * pos);
    const s = sinc((k * wp) / 2);
    out[m] = (m === 0 ? 1 : 2) * c * c * s * s;
  }
  return out;
}

/**
 * Σn χn² cos²(kn y) sinc²(kn w/2) / (kx² + kn²) over n = 0…∞ (kn = nπ/b), in closed form. With
 * cos² = (1 + cos 2kn·y)/2 and sinc²(kn w/2) = 2(1 − cos kn·w)/(kn w)², each term is a combination of
 * cos(nθ)/(n²(n² + A²)) (A = kx b/π), summed with the classical Fourier series
 *   Σ cos nθ / n² = π²/6 − πθ/2 + θ²/4,   Σ cos nθ / (n² + A²) = (π/2A)·cosh A(π − θ)/sinh Aπ − 1/(2A²),
 *   Σ cos nθ / n⁴ = π⁴/90 − π²θ²/12 + πθ³/12 − θ⁴/48          (0 ≤ θ ≤ 2π; Gradshteyn & Ryzhik 1.443, 1.445).
 * For kx = 0 the n = 0 term (the static (0,0) mode) is left out.
 */
export function rowSum(kx: number, b: number, y: number, w: number): number {
  const TP = 2 * Math.PI;
  const red = (t: number) => {
    const r = Math.abs(t) % TP;
    return r;
  };
  const tA = (TP * y) / b;
  const tB = (Math.PI * w) / b;
  const terms: [number, number][] = [
    [1, 0],
    [-1, red(tB)],
    [1, red(tA)],
    [-0.5, red(tA + tB)],
    [-0.5, red(tA - tB)],
  ];
  const q = b / Math.PI;
  if (kx === 0) {
    const g4 = (t: number) => Math.PI ** 4 / 90 - (Math.PI ** 2 * t * t) / 12 + (Math.PI * t ** 3) / 12 - t ** 4 / 48;
    let sum = 0;
    for (const [c, t] of terms) sum += c * g4(t);
    return (2 / (w * w)) * q ** 4 * sum;
  }
  const A = kx * q;
  const e2 = Math.exp(-TP * A);
  // the constant parts (π²/6 and −1/2A²) cancel because the coefficients sum to zero
  const g2 = (t: number) => -(Math.PI * t) / 2 + (t * t) / 4;
  const g = (t: number) => ((Math.PI / (2 * A)) * (Math.exp(-A * t) + Math.exp(-A * (TP - t)))) / (1 - e2);
  let sum = 0;
  for (const [c, t] of terms) sum += c * (g2(t) - g(t));
  return 1 / (kx * kx) + (2 / (w * w)) * (q * q * sum) / (kx * kx);
}

/**
 * Σ′ over all modes (m, n) ≠ (0, 0) of the port weights / (kx² + ky²): the n-sum in closed form (rowSum),
 * the m-sum to m = 8a/w (at most 60 000), beyond which its terms (∝ 1/m³) leave ≈ 1·10⁻⁵ of the total, ≤ 3·10⁻⁴ for a 50 µm
 * port on a 1 m plane (checked against 64a/w). Converged even for
 * ports far smaller than the plane, where a truncated double sum falls short.
 */
export function spreadSum(p: PlaneIn, mult = 8): number {
  // rowSum inlined: the θ-dependent constants once, then per m only the exponentials of the cosh series
  const TP = 2 * Math.PI;
  const red = (t: number) => Math.abs(t) % TP;
  const tA = (TP * p.py) / p.b;
  const tB = (Math.PI * p.wp) / p.b;
  const cs = [1, -1, 1, -0.5, -0.5];
  const ts = [0, red(tB), red(tA), red(tA + tB), red(tA - tB)];
  const q = p.b / Math.PI;
  const kw = (2 / (p.wp * p.wp)) * q * q;
  let c2 = 0;
  for (let j = 0; j < 5; j++) c2 += cs[j] * (-(Math.PI * ts[j]) / 2 + (ts[j] * ts[j]) / 4);
  const mMax = Math.min(Math.ceil((mult * p.a) / p.wp), 60000);
  let s = rowSum(0, p.b, p.py, p.wp); // m = 0 (X0 = 1)
  for (let m = 1; m <= mMax; m++) {
    const k = (m * Math.PI) / p.a;
    const c = Math.cos(k * p.px);
    const u = (k * p.wp) / 2;
    const sn = Math.sin(u) / u;
    const xm = 2 * c * c * sn * sn;
    if (xm === 0) continue;
    const A = k * q;
    const e2 = A * TP > 700 ? 0 : Math.exp(-TP * A);
    let g = 0;
    for (let j = 0; j < 5; j++) {
      const t = ts[j];
      const e1 = A * t > 700 ? 0 : Math.exp(-A * t);
      const e3 = A * (TP - t) > 700 ? 0 : Math.exp(-A * (TP - t));
      g += cs[j] * (e1 + e3);
    }
    g *= Math.PI / (2 * A) / (1 - e2);
    s += (xm * (1 + kw * (c2 - g))) / (k * k);
  }
  return s;
}

export interface Cx {
  re: number;
  im: number;
}

export interface PlaneZ {
  f: number[];
  z: Cx[];
  /** spreading inductance of the port (H) */
  lsp: number;
  modesExact: number;
  modesTail: number;
}

/** k² (complex) at angular frequency w. */
function k2(w: number, p: PlaneIn): Cx {
  const sigma = p.sigma ?? SIGMA_CU;
  const ds = Math.sqrt(2 / (w * MU0 * sigma));
  // conductor term 2Rs/(ωμ0 d) with Rs = 1/(σ·min(δs, t)): δs/d once the skin depth is below the copper
  // thickness (Lei et al.), the DC sheet resistance of the plates below that
  const xc = ds < p.tCu ? ds / p.d : (2 / (sigma * p.tCu * w * MU0)) / p.d;
  const kk = w * w * MU0 * EPS0 * p.er;
  return { re: kk, im: -kk * (p.tanD + xc) };
}

/** Self-impedance at the port over the frequencies fs (Hz, all > 0). */
export function planeZ(p: PlaneIn, fs: number[], mult = 2, maxExact = 5000, spreadMult = 8): PlaneZ {
  const fTop = Math.max(...fs);
  const mMax = Math.min(Math.ceil((mult * p.a) / p.wp), 300);
  const nMax = Math.min(Math.ceil((mult * p.b) / p.wp), 300);
  const ky2 = Float64Array.from({ length: nMax + 1 }, (_, n) => ((n * Math.PI) / p.b) ** 2);
  const X = weights(mMax, p.a, p.px, p.wp);
  const Y = weights(nMax, p.b, p.py, p.wp);
  // modes below the exact-sum cutoff (4 × fTop), capped in number for speed
  let kCut = (2 * Math.PI * 4 * fTop * Math.sqrt(p.er)) / C0;
  const count = (kc: number) => {
    let c = 0;
    for (let m = 0; m <= mMax; m++) {
      const kx = (m * Math.PI) / p.a;
      if (kx > kc) break;
      c += Math.min(nMax, Math.floor((Math.sqrt(kc * kc - kx * kx) * p.b) / Math.PI)) + 1;
    }
    return c;
  };
  while (count(kCut) > maxExact && kCut > (2 * Math.PI * 1.5 * fTop * Math.sqrt(p.er)) / C0) kCut *= 0.85;
  const exK: number[] = [];
  const exC: number[] = [];
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let lsum = 0;
  let tail = 0;
  const kc2 = kCut * kCut;
  for (let m = 0; m <= mMax; m++) {
    const kx2 = ((m * Math.PI) / p.a) ** 2;
    const xm = X[m];
    if (xm === 0) continue;
    for (let n = m === 0 ? 1 : 0; n <= nMax; n++) {
      const c = xm * Y[n];
      const K = kx2 + ky2[n];
      const iv = 1 / K;
      const ci = c * iv;
      lsum += ci;
      if (K <= kc2) {
        exK.push(K);
        exC.push(c);
      } else {
        s1 += ci;
        const ci2 = ci * iv;
        s2 += ci2;
        s3 += ci2 * iv;
        tail++;
      }
    }
  }
  // the 1/K part of the tail exactly: all modes in closed form, less the ones summed exactly below
  const lAll = spreadSum(p, spreadMult);
  let lEx = 0;
  for (let i = 0; i < exK.length; i++) lEx += exC[i] / exK[i];
  s1 = lAll - lEx;
  lsum = lAll;
  const pre = (MU0 * p.d) / (p.a * p.b);
  const z: Cx[] = fs.map((f) => {
    const w = 2 * Math.PI * f;
    const kk = k2(w, p);
    // the (0,0) term −1/k²: a uniform voltage drives no current along the plates, so only the dielectric
    // loss applies to it (with the plate-loss term too, the low-frequency |Z| would fall below 1/ωC)
    const k0re = w * w * MU0 * EPS0 * p.er;
    const k0im = -k0re * p.tanD;
    const d0 = k0re * k0re + k0im * k0im;
    let re = -k0re / d0;
    let im = k0im / d0;
    for (let i = 0; i < exK.length; i++) {
      const dr = exK[i] - kk.re;
      const di = -kk.im;
      const den = dr * dr + di * di;
      re += (exC[i] * dr) / den;
      im -= (exC[i] * di) / den;
    }
    // tail: s1 + k² s2 + k⁴ s3
    const k4re = kk.re * kk.re - kk.im * kk.im;
    const k4im = 2 * kk.re * kk.im;
    re += s1 + kk.re * s2 + k4re * s3;
    im += kk.im * s2 + k4im * s3;
    // Z = jω·pre·S
    return { re: -w * pre * im, im: w * pre * re };
  });
  return { f: fs, z, lsp: pre * lsum, modesExact: exK.length, modesTail: tail };
}

export const absC = (z: Cx) => Math.hypot(z.re, z.im);

export interface Mode {
  m: number;
  n: number;
  f: number;
  /** port coupling cos²(mπx/a)·cos²(nπy/b): 1 where the mode's voltage peaks, 0 on a nodal line */
  coupling: number;
}

/** Cavity modes below fMax (excluding (0,0)), lowest first, at most `limit`. */
export function modesBelow(p: PlaneIn, fMax: number, limit = 40): Mode[] {
  const out: Mode[] = [];
  const mTop = Math.floor((2 * fMax * Math.sqrt(p.er) * p.a) / C0);
  const nTop = Math.floor((2 * fMax * Math.sqrt(p.er) * p.b) / C0);
  for (let m = 0; m <= Math.min(mTop, 400); m++)
    for (let n = 0; n <= Math.min(nTop, 400); n++) {
      if (m === 0 && n === 0) continue;
      const f = modeF(m, n, p.a, p.b, p.er);
      if (f > fMax) continue;
      const cx = Math.cos((m * Math.PI * p.px) / p.a);
      const cy = Math.cos((n * Math.PI * p.py) / p.b);
      out.push({ m, n, f, coupling: cx * cx * cy * cy });
    }
  out.sort((x, y) => x.f - y.f || x.m - y.m);
  return out.slice(0, limit);
}

/** Target impedance Z_t = V · ripple / ΔI (L. D. Smith et al., “Power distribution system design methodology and capacitor selection for modern CMOS technology”, IEEE Trans. Adv. Packaging 22(3), 1999). */
export const targetZ = (v: number, ripplePct: number, dI: number) => (v * ripplePct) / 100 / dI;
