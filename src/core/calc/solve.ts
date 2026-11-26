/**
 * Numeric inversion for solve-for-X calculators.
 *
 * A calculator only writes its forward equations (inputs → outputs). To solve for any input,
 * `invert` scans the allowed range for a sign change of f(x) − target (log-spaced when the
 * range spans decades), then polishes every bracket with Brent's method. All roots are
 * returned so the caller can pick or report multiple solutions.
 */

export interface InvertOptions {
  lo: number;
  hi: number;
  /** Log-spaced scan (default: true when lo > 0 and hi/lo > 20) */
  log?: boolean;
  /** Scan points (default 160) */
  samples?: number;
  /** Relative tolerance on x (default 1e-12) */
  rtol?: number;
}

export interface InvertResult {
  ok: boolean;
  roots: number[];
  /** Best x when no root exists (closest approach) */
  closest: number;
  closestValue: number;
  reason?: string;
}

/** Brent's method on a bracketing interval [a, b] with f(a)·f(b) ≤ 0; `tol` is an absolute x tolerance. */
export function brent(f: (x: number) => number, a: number, b: number, tol = 1e-12, maxIter = 200): number {
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) throw new Error('brent: root not bracketed');
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let mflag = true;
  for (let i = 0; i < maxIter; i++) {
    let s: number;
    if (fa !== fc && fb !== fc) {
      s = (a * fb * fc) / ((fa - fb) * (fa - fc)) + (b * fa * fc) / ((fb - fa) * (fb - fc)) + (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      s = b - (fb * (b - a)) / (fb - fa);
    }
    const q = (3 * a + b) / 4;
    const cond1 = !((s > Math.min(q, b) && s < Math.max(q, b)));
    const cond2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
    const cond3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
    const cond4 = mflag && Math.abs(b - c) < tol;
    const cond5 = !mflag && Math.abs(c - d) < tol;
    if (cond1 || cond2 || cond3 || cond4 || cond5) {
      s = (a + b) / 2;
      mflag = true;
    } else mflag = false;
    const fs = f(s);
    d = c;
    c = b;
    fc = fb;
    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }
    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
    // `tol` is absolute; the epsilon floor stops large-|x| roots iterating on float spacing.
    if (fb === 0 || Math.abs(b - a) <= Math.max(tol, 4 * Number.EPSILON * Math.abs(b))) return b;
  }
  return b;
}

/** Find all x in [lo, hi] with g(x) = target. */
export function invert(g: (x: number) => number, target: number, o: InvertOptions): InvertResult {
  const n = o.samples ?? 160;
  const log = o.log ?? (o.lo > 0 && o.hi / o.lo > 20);
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    xs.push(log ? o.lo * (o.hi / o.lo) ** t : o.lo + (o.hi - o.lo) * t);
  }
  const f = (x: number) => g(x) - target;
  const fs = xs.map(f);
  const roots: number[] = [];
  let closest = xs[0];
  let closestValue = g(xs[0]);
  let best = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const v = fs[i];
    if (Number.isFinite(v) && Math.abs(v) < best) {
      best = Math.abs(v);
      closest = xs[i];
      closestValue = v + target;
    }
    if (i === 0) continue;
    const a = fs[i - 1];
    if (!Number.isFinite(a) || !Number.isFinite(v)) continue;
    if (a === 0) {
      if (!roots.length || roots[roots.length - 1] !== xs[i - 1]) roots.push(xs[i - 1]);
      continue;
    }
    if (a * v < 0) {
      const tol = (o.rtol ?? 1e-12) * Math.max(Math.abs(xs[i]), 1e-300);
      roots.push(brent(f, xs[i - 1], xs[i], tol));
    } else if (v === 0 && i === xs.length - 1) roots.push(xs[i]);
  }
  if (roots.length) return { ok: true, roots, closest: roots[0], closestValue: target };
  return { ok: false, roots, closest, closestValue, reason: 'No solution in the allowed range' };
}
