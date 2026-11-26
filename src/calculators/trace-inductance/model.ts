/**
 * PCB trace inductance — pure model (no DOM, SI in/out).
 *
 * 1. Partial self-inductance of a straight rectangular bar (w × t × ℓ) carrying uniform (DC) current,
 *    in free space — exact. Self-inductance is the mutual inductance of the bar with itself, i.e. the
 *    filament-pair mutual inductance averaged over every pair of points in the cross-section
 *    (A. E. Ruehli, "Inductance calculations in a complex integrated circuit environment", IBM J. Res.
 *    Dev. 16(5), 1972, pp. 470–481; C. Hoer & C. Love, "Exact inductance equations for rectangular
 *    conductors…", J. Res. NBS 69C(2), 1965, pp. 127–137 give the same quantity in closed form, which
 *    loses all its digits to cancellation for long thin traces, so it is not used for evaluation).
 *    The filament formula (Grover, Inductance Calculations, 1946, ch. 3; Rosa 1908)
 *      M(ρ) = μ₀/2π · [ℓ·asinh(ℓ/ρ) − √(ℓ²+ρ²) + ρ]
 *    is split as  μ₀/2π · [ℓ·ln(2ℓ) − ℓ·ln ρ + ρ + h(ρ)]  with h smooth in ρ². The averages of ln ρ and ρ
 *    are known exactly (Maxwell's geometric mean distance of a rectangle; the mean distance of a
 *    rectangle, Ghosh 1951), and ⟨h⟩ is integrated by Gauss–Legendre quadrature over the distribution of
 *    point-pair offsets, (w−|u|)(t−|v|)/(w²t²). The result is exact to quadrature precision (≈1e-12).
 * 2. Grover's long-bar approximation (Grover 1946, eq. for a bar of rectangular section, ℓ ≫ w+t):
 *      L ≈ μ₀ℓ/2π · [ln(2ℓ/(w+t)) + ½ + 0.2235·(w+t)/ℓ]
 * 3. Loop inductance of a trace over a ground plane (microstrip, return current in the plane):
 *      L′ = Z₀·√εeff / c = Z₀,air(u₁)/c      (independent of εr)
 *    with Hammerstad–Jensen's Z₀,air and thickness correction (microstrip/model.ts), plus Hammerstad's
 *    1975 two-branch logarithmic formulas (±1 %) for comparison:
 *      w/h ≤ 1: L′ = μ₀/2π · ln(8h/w + w/4h);   w/h ≥ 1: L′ = μ₀ / [w/h + 1.393 + 0.667·ln(w/h + 1.444)].
 */

import { C0, MU0, microstripStatic } from '../microstrip/model';

export { C0, MU0 };

/** ln of Maxwell's geometric mean distance of a rectangle a × b from itself (exact). b = 0 → ln a − 3/2. */
export function lnGmdRect(a: number, b: number): number {
  const big = Math.max(a, b);
  const r = Math.min(a, b) / big; // ≤ 1
  if (r === 0) return Math.log(big) - 1.5;
  const r2 = r * r;
  return (
    Math.log(big) + 0.5 * Math.log1p(r2) - Math.log1p(r2) / (12 * r2) - (r2 / 12) * Math.log1p(1 / r2) + (2 / 3) * (Math.atan(r) / r) + (2 / 3) * r * Math.atan(1 / r) - 25 / 12
  );
}

/** Mean distance between two random points of an a × b rectangle (exact; written without cancellation). */
export function amdRect(a: number, b: number): number {
  if (b === 0) return a / 3;
  if (a === 0) return b / 3;
  const d = Math.hypot(a, b);
  const t1 = (3 * d - (a * a) / (a + d) - (b * b) / (b + d)) / 15;
  // (b²/a)·ln((a+d)/b) + (a²/b)·ln((b+d)/a), each log as log1p of its small part
  const la = Math.log1p((a + (a * a) / (d + b)) / b); // ln((a+d)/b), d − b = a²/(d+b)
  const lb = Math.log1p((b + (b * b) / (d + a)) / a); // ln((b+d)/a), d − a = b²/(d+a)
  return t1 + ((b * b) / a * la + (a * a) / b * lb) / 6;
}

// 8-point Gauss–Legendre nodes / weights on [−1, 1]
const GL_X = [-0.9602898564975363, -0.7966664774136268, -0.525532409916329, -0.18343464249564978, 0.18343464249564978, 0.525532409916329, 0.7966664774136268, 0.9602898564975363];
const GL_W = [0.10122853629037679, 0.22238103445337445, 0.3137066458778874, 0.362683783378362, 0.362683783378362, 0.3137066458778874, 0.22238103445337445, 0.10122853629037679];

/**
 * Gauss–Legendre nodes on [0, L] over panels graded away from 0: [0, ℓ/2], then each panel twice the last.
 * The integrand's nearest complex singularity sits about ℓ from the origin, so every panel stays well
 * inside its convergence ellipse (≈1e-13 with 8 points) and wide plates need only log₂(L/ℓ) panels.
 */
function nodes(L: number, l: number): [number, number][] {
  const out: [number, number][] = [];
  let a = 0;
  let b = Math.min(L, l / 2);
  for (;;) {
    const c = (a + b) / 2;
    const hw = (b - a) / 2;
    for (let i = 0; i < GL_X.length; i++) out.push([c + hw * GL_X[i], hw * GL_W[i]]);
    if (b >= L) break;
    a = b;
    b = Math.min(L, 2 * b);
  }
  return out;
}

/**
 * Partial self-inductance (H) of a straight rectangular bar w × t × ℓ with uniform current, in free space.
 * Exact (to quadrature precision): see the header.
 */
export function partialSelfL(w: number, t: number, l: number): number {
  // ⟨g⟩ with g(ρ) = h(ρ)/ℓ + 1 = ln((1+s)/2) − (s − 1),  s = √(1+q),  q = ρ²/ℓ²  (g → 0 as ρ → 0)
  const g = (q: number) => {
    const sp1 = Math.sqrt(1 + q) + 1;
    return Math.log1p(q / (2 * sp1)) - q / sp1;
  };
  const U = nodes(w, l);
  const V = nodes(t, l);
  let acc = 0;
  for (const [u, wu] of U) {
    const fu = (w - u) * wu;
    for (const [v, wv] of V) acc += fu * (t - v) * wv * g((u * u + v * v) / (l * l));
  }
  const gAvg = (4 * acc) / (w * w * t * t);
  return (MU0 / (2 * Math.PI)) * (l * Math.log(2 * l) - l * lnGmdRect(w, t) + amdRect(w, t) - l + l * gAvg);
}

/** Grover's long-bar approximation (H), valid for ℓ ≫ w + t. */
export function groverL(w: number, t: number, l: number): number {
  const p = w + t;
  return ((MU0 * l) / (2 * Math.PI)) * (Math.log((2 * l) / p) + 0.5 + (0.2235 * p) / l);
}

/** Loop inductance per length (H/m) of a strip w × t at height h over a plane: Hammerstad–Jensen Z₀,air(u₁)/c. */
export function microstripLPer(w: number, h: number, t: number): number {
  return microstripStatic(w, h, t, 1).z0AirU1 / C0;
}

/** Hammerstad (1975) two-branch closed forms for the same L′ (zero thickness, ±1 %). */
export function hammerstad75LPer(w: number, h: number): number {
  const u = w / h;
  return u <= 1 ? (MU0 / (2 * Math.PI)) * Math.log(8 / u + u / 4) : MU0 / (u + 1.393 + 0.667 * Math.log(u + 1.444));
}

/** Parallel-plate limit (no fringing): L′ = μ₀h/w. */
export const plateLPer = (w: number, h: number) => (MU0 * h) / w;
