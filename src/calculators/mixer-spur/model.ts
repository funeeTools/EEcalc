/**
 * Mixer spurious products — pure model (no DOM), frequencies in Hz.
 *
 * A mixer driven by an LO at f_LO and a signal at f_in produces every product
 *   f = |m·f_LO ± n·f_in|,  m, n = 0, 1, 2, …,  order m + n
 * of which one (m = n = 1, sum or difference) is wanted. Spurs whose frequency falls inside the output (IF)
 * band cannot be filtered after the mixer; input frequencies that produce an output in the IF band
 * (f = (m·f_LO ± f_IF)/n: the image, the half-IF response …) must be rejected before it.
 * Sources:
 *   B. C. Henderson and E. Camargo, Microwave Mixer Technology and Applications, Artech House, 2013
 *     (m×n spurious products, spur charts, frequency planning);
 *   D. M. Pozar, Microwave Engineering, 4th ed., Wiley, 2012, ch. 13 (mixer frequency relations, image response);
 *   U. L. Rohde, J. C. Whitaker, H. Zahnd, Communications Receivers, 4th ed., McGraw-Hill, 2017
 *     (spurious-response frequencies of the superheterodyne: image, half-IF, IF feedthrough).
 * Spur levels are not modelled: they depend on the particular mixer and its drive levels (use its m×n table).
 */

export type Conv = 'down' | 'up';
export type Side = 'low' | 'high';
export type Plan = 'fixed' | 'tuned';

/** Sign of the wanted (1×1) product: −1 difference, +1 sum (only up-conversion with low-side LO uses the sum). */
export const wantedSign = (conv: Conv, side: Side): 1 | -1 => (conv === 'up' && side === 'low' ? 1 : -1);

/** LO frequency for a wanted input → output conversion. */
export function loFor(conv: Conv, side: Side, fin: number, fout: number): number {
  if (conv === 'down') return side === 'low' ? fin - fout : fin + fout;
  return side === 'low' ? fout - fin : fout + fin;
}

/** Output frequency of the wanted product. */
export function outFor(conv: Conv, side: Side, fin: number, flo: number): number {
  if (conv === 'down') return side === 'low' ? fin - flo : flo - fin;
  return side === 'low' ? flo + fin : flo - fin;
}

/** Input frequency that converts to fout with this LO. */
export function inFor(conv: Conv, side: Side, fout: number, flo: number): number {
  if (conv === 'down') return side === 'low' ? flo + fout : flo - fout;
  return side === 'low' ? fout - flo : flo - fout;
}

/** Check that a frequency triple is consistent with the conversion and LO side; returns a reason or null. */
export function planProblem(conv: Conv, side: Side, fin: number, fout: number, flo: number): string | null {
  if (!(fin > 0) || !(fout > 0) || !(flo > 0)) return 'all three frequencies must be positive';
  if (conv === 'down' && !(fout < fin)) return 'a down-converter needs the output below the input (f_out < f_in)';
  if (conv === 'up' && !(fout > fin)) return 'an up-converter needs the output above the input (f_out > f_in)';
  if (side === 'low' && !(flo < (conv === 'down' ? fin : fout))) return `low-side injection puts the LO below the ${conv === 'down' ? 'input' : 'output'}`;
  if (side === 'high' && !(flo > (conv === 'down' ? fin : fout))) return `high-side injection puts the LO above the ${conv === 'down' ? 'input' : 'output'}`;
  return null;
}

export interface Product {
  m: number;
  n: number;
  /** +1: m·f_LO + n·f_in, −1: |m·f_LO − n·f_in| (sign is +1 when m or n is 0) */
  sign: 1 | -1;
  order: number;
}

/** All products of order 1…N except the wanted one. */
export function products(N: number, wanted: 1 | -1): Product[] {
  const out: Product[] = [];
  for (let order = 1; order <= N; order++) {
    for (let m = 0; m <= order; m++) {
      const n = order - m;
      const signs: (1 | -1)[] = m === 0 || n === 0 ? [1] : [-1, 1];
      for (const sign of signs) {
        if (m === 1 && n === 1 && sign === wanted) continue;
        out.push({ m, n, sign, order });
      }
    }
  }
  return out;
}

/**
 * LO as a function of the input channel: fixed, or (tuned plan) moving with the channel so that the wanted
 * output stays at f_out. Returns [κ, β] with f_LO(f) = κ·f + β.
 */
export function loLaw(plan: Plan, conv: Conv, side: Side, flo: number, fout: number): [number, number] {
  if (plan === 'fixed') return [0, flo];
  if (conv === 'down') return side === 'low' ? [1, -fout] : [1, fout];
  return side === 'low' ? [-1, fout] : [1, fout];
}

/** Signed (before |·|) product frequency at input f: m·f_LO(f) + sign·n·f. */
export function rawFreq(p: Product, f: number, law: [number, number]): number {
  return p.m * (law[0] * f + law[1]) + p.sign * p.n * f;
}

export const prodFreq = (p: Product, f: number, law: [number, number]): number => Math.abs(rawFreq(p, f, law));

/** Output-frequency interval [lo, hi] a product sweeps as the input runs over [a, b] (|·| of a linear function). */
export function sweep(p: Product, a: number, b: number, law: [number, number]): [number, number] {
  const ya = rawFreq(p, a, law);
  const yb = rawFreq(p, b, law);
  const lo = Math.min(ya, yb);
  const hi = Math.max(ya, yb);
  if (lo <= 0 && hi >= 0) return [0, Math.max(-lo, hi)];
  return lo > 0 ? [lo, hi] : [-hi, -lo];
}

/** Distance between intervals (0 when they overlap). */
export function gap(a: [number, number], b: [number, number]): number {
  if (a[0] <= b[1] && a[1] >= b[0]) return 0;
  return a[0] > b[1] ? a[0] - b[1] : b[0] - a[1];
}

export interface SpurHit {
  p: Product;
  /** output interval swept (including the spur’s own width in a tuned plan) */
  lo: number;
  hi: number;
  /** distance to the output band (0 = inside) */
  dist: number;
}

/**
 * Output spurs against the output band [c, d], for an input over [a, b].
 * Fixed LO: the whole input band is present at once, so a product sweeps |m·f_LO ± n·f| over [a, b].
 * Tuned LO: one channel of width B_ch at a time; its n-th harmonic is n·B_ch wide, so the swept interval is
 * widened by n·B_ch/2 each side (the in-band test refers the IF bandwidth to the input as ±B/(2n)).
 */
export function outputSpurs(N: number, wanted: 1 | -1, a: number, b: number, law: [number, number], c: number, d: number, chanBw: number): SpurHit[] {
  return products(N, wanted)
    .map((p) => {
      const [lo0, hi0] = sweep(p, a, b, law);
      const w = law[0] !== 0 ? (p.n * chanBw) / 2 : 0;
      const lo = Math.max(lo0 - w, 0);
      const hi = hi0 + w;
      return { p, lo, hi, dist: gap([lo, hi], [c, d]) };
    })
    .sort((x, y) => x.dist - y.dist || x.p.order - y.p.order);
}

export interface Response {
  p: Product;
  /** input-frequency interval that lands in the output band */
  lo: number;
  hi: number;
  /** distance to the input band (0 = inside) */
  dist: number;
  /** the wanted (1×1) response */
  wanted: boolean;
}

/**
 * Input-referred spurious responses with a fixed LO: all input frequencies f > 0 for which |m·f_LO ± n·f| lies in
 * the output band [c, d], n ≥ 1. Each (m, n, sign) branch gives one interval.
 */
export function responses(N: number, flo: number, c: number, d: number, a: number, b: number, fin: number, wantedSignV: 1 | -1): Response[] {
  const out: Response[] = [];
  for (let order = 1; order <= N; order++) {
    for (let m = 0; m < order; m++) {
      const n = order - m;
      const ivs: [number, number, 1 | -1][] = [];
      if (m === 0) ivs.push([c / n, d / n, 1]);
      else {
        // |m·f_LO − n·f| ∈ [c, d]: f above or below m·f_LO/n
        ivs.push([(m * flo + c) / n, (m * flo + d) / n, -1]);
        ivs.push([(m * flo - d) / n, (m * flo - c) / n, -1]);
        // m·f_LO + n·f ∈ [c, d]
        ivs.push([(c - m * flo) / n, (d - m * flo) / n, 1]);
      }
      for (const [u0, u1, sign] of ivs) {
        if (!(u1 > 0)) continue;
        const lo = Math.max(u0, 0);
        const p: Product = { m, n, sign, order };
        const wanted = m === 1 && n === 1 && sign === wantedSignV && fin >= lo * (1 - 1e-12) && fin <= u1 * (1 + 1e-12);
        out.push({ p, lo, hi: u1, dist: gap([lo, u1], [a, b]), wanted });
      }
    }
  }
  return out.sort((x, y) => Number(y.wanted) - Number(x.wanted) || x.dist - y.dist || x.p.order - y.p.order);
}

/** Text for a product: "2·LO − 3·IN", "LO", "3·IN". */
export function productName(p: Product): string {
  const t = (k: number, s: string) => (k === 1 ? s : `${k}·${s}`);
  if (p.n === 0) return t(p.m, 'LO');
  if (p.m === 0) return t(p.n, 'IN');
  return `${t(p.m, 'LO')} ${p.sign > 0 ? '+' : '−'} ${t(p.n, 'IN')}`;
}
