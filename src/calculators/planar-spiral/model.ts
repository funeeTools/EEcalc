/**
 * Printed (planar) spiral inductor — pure model (no DOM, SI in/out).
 *
 * Inductance: S. S. Mohan, M. del Mar Hershenson, S. P. Boyd and T. H. Lee, "Simple Accurate Expressions
 * for Planar Spiral Inductances", IEEE J. Solid-State Circuits 34(10), Oct. 1999, pp. 1419–1424.
 *   n turns, width w, spacing s, outer diameter d_out (across the flats), inner diameter
 *   d_in = d_out − 2n·w − 2(n − 1)·s (checked against their Table IV), d_avg = (d_out + d_in)/2,
 *   fill ratio ρ = (d_out − d_in)/(d_out + d_in).
 *   (1) modified Wheeler   L = K₁·μ₀·n²·d_avg/(1 + K₂·ρ)                    Table I (no circular entry)
 *   (2) current sheet      L = μ₀·n²·d_avg·c₁/2·[ln(c₂/ρ) + c₃ρ + c₄ρ²]      Table II
 *   (3) monomial           L[nH] = β·d_out^α₁·w^α₂·d_avg^α₃·n^α₄·s^α₅ (µm)   Table III (no circular entry)
 *   Against 19 000 ASITIC field-solver cases (d_out 100–480 µm, w 2 µm–0.3·d_out, s 2 µm–3w,
 *   d_in 0.1–0.9·d_out): typical error 1–2 %, most under 3 %; current sheet worst 8 % for s ≤ 3w.
 *   (1) and (2) are scale-free (L ∝ μ₀·length), so they carry over to PCB sizes; (3) is not quite:
 *   its length exponents sum to 1.007–1.013, so it drifts by a few % far outside the fitted sizes.
 * Copper: track length = n × perimeter at d_avg (regular N-gon across the flats: N·d·tan(π/N); circle π·d),
 *   R_dc = ρ_Cu·l/(w·t), ρ_Cu = 1/58 Ω·mm²/m (IEC 60028, annealed copper at 20 °C).
 * Skin effect: C. P. Yue and S. S. Wong, "Physical Modeling of Spiral Inductors on Silicon", IEEE Trans.
 *   Electron Devices 47(3), Mar. 2000, pp. 560–568: R = ρ·l/(w·δ·(1 − e^(−t/δ))), δ = √(ρ/(π f μ₀)).
 * Current crowding onset: W. B. Kuhn and N. M. Ibrahim, "Analysis of Current Crowding Effects in Multiturn
 *   Spiral Inductors", IEEE Trans. MTT-49(1), Jan. 2001, pp. 31–38: ω_crit = 3.1·(w + s)·R_sheet/(μ₀·w²),
 *   R_sheet = ρ/t. Above it the inner turns' resistance rises, so Q here is an upper bound.
 */

export const MU0 = 1.25663706212e-6;
/** Annealed copper at 20 °C, IEC 60028: 1/58 Ω·mm²/m. */
export const RHO_CU = 1 / 58e6;

export type Shape = 'square' | 'hexagonal' | 'octagonal' | 'circular';
export type Expr = 'sheet' | 'wheeler' | 'monomial';

export const SIDES: Record<Shape, number> = { square: 4, hexagonal: 6, octagonal: 8, circular: 0 };

/** Mohan Table I. */
export const WHEELER: Partial<Record<Shape, [number, number]>> = { square: [2.34, 2.75], hexagonal: [2.33, 3.82], octagonal: [2.25, 3.55] };
/** Mohan Table II. */
export const SHEET: Record<Shape, [number, number, number, number]> = {
  square: [1.27, 2.07, 0.18, 0.13],
  hexagonal: [1.09, 2.23, 0.0, 0.17],
  octagonal: [1.07, 2.29, 0.0, 0.19],
  circular: [1.0, 2.46, 0.0, 0.2],
};
/** Mohan Table III: β, α₁(d_out), α₂(w), α₃(d_avg), α₄(n), α₅(s); L in nH with lengths in µm. */
export const MONO: Partial<Record<Shape, [number, number, number, number, number, number]>> = {
  square: [1.62e-3, -1.21, -0.147, 2.4, 1.78, -0.03],
  hexagonal: [1.28e-3, -1.24, -0.174, 2.47, 1.77, -0.049],
  octagonal: [1.33e-3, -1.21, -0.163, 2.43, 1.75, -0.049],
};

export interface SpiralGeom {
  shape: Shape;
  n: number;
  dout: number;
  w: number;
  s: number;
}

export function innerDiameter(g: SpiralGeom): number {
  return g.dout - 2 * g.n * g.w - 2 * (g.n - 1) * g.s;
}

/** Most turns that fit (d_in = 0). */
export function maxTurns(dout: number, w: number, s: number): number {
  return (dout + 2 * s) / (2 * (w + s));
}

export function lWheeler(g: SpiralGeom): number {
  const k = WHEELER[g.shape];
  if (!k) return NaN;
  const din = innerDiameter(g);
  const davg = (g.dout + din) / 2;
  const rho = (g.dout - din) / (g.dout + din);
  return (k[0] * MU0 * g.n * g.n * davg) / (1 + k[1] * rho);
}

export function lSheet(g: SpiralGeom): number {
  const [c1, c2, c3, c4] = SHEET[g.shape];
  const din = innerDiameter(g);
  const davg = (g.dout + din) / 2;
  const rho = (g.dout - din) / (g.dout + din);
  return ((MU0 * g.n * g.n * davg * c1) / 2) * (Math.log(c2 / rho) + c3 * rho + c4 * rho * rho);
}

export function lMonomial(g: SpiralGeom): number {
  const m = MONO[g.shape];
  if (!m) return NaN;
  const din = innerDiameter(g);
  const davg = (g.dout + din) / 2;
  const um = 1e6;
  return m[0] * (g.dout * um) ** m[1] * (g.w * um) ** m[2] * (davg * um) ** m[3] * g.n ** m[4] * (g.s * um) ** m[5] * 1e-9;
}

export function inductance(g: SpiralGeom, e: Expr): number {
  return e === 'sheet' ? lSheet(g) : e === 'wheeler' ? lWheeler(g) : lMonomial(g);
}

/** Perimeter of the shape at "diameter" d (across the flats). */
export function perimeter(shape: Shape, d: number): number {
  const N = SIDES[shape];
  return N ? N * d * Math.tan(Math.PI / N) : Math.PI * d;
}

/** Track length of the spiral: n × perimeter at d_avg. */
export function trackLength(g: SpiralGeom): number {
  const din = innerDiameter(g);
  return g.n * perimeter(g.shape, (g.dout + din) / 2);
}

/** Under-pass from the inner end to just outside the outer turn (crosses every turn). */
export function underpassLength(g: SpiralGeom): number {
  return (g.dout - innerDiameter(g)) / 2 + 2 * g.w;
}

export function skinDepth(f: number, rho = RHO_CU): number {
  return Math.sqrt(rho / (Math.PI * f * MU0));
}

/** Yue–Wong skin-effect resistance factor R_ac/R_dc = (t/δ)/(1 − e^(−t/δ)) (→ 1 at DC). */
export function skinFactor(t: number, f: number, rho = RHO_CU): number {
  if (!(f > 0)) return 1;
  const x = t / skinDepth(f, rho);
  return x < 1e-6 ? 1 + x / 2 : x / (1 - Math.exp(-x));
}

/** Kuhn–Ibrahim onset of current crowding, as a frequency (Hz). */
export function crowdingFreq(w: number, s: number, t: number, rho = RHO_CU): number {
  return (3.1 * (w + s) * (rho / t)) / (MU0 * w * w) / (2 * Math.PI);
}
