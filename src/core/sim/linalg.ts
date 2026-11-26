/** Small dense linear algebra (row-major) for solvers and future MNA circuit sims. */

/** In-place LU with partial pivoting. Returns false if singular. */
export function luFactor(a: Float64Array, n: number, piv: Int32Array): boolean {
  for (let i = 0; i < n; i++) piv[i] = i;
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i * n + k]);
      if (v > max) {
        max = v;
        p = i;
      }
    }
    if (max === 0 || !Number.isFinite(max)) return false;
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = a[k * n + j];
        a[k * n + j] = a[p * n + j];
        a[p * n + j] = tmp;
      }
      const tp = piv[k];
      piv[k] = piv[p];
      piv[p] = tp;
    }
    const d = a[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const m = (a[i * n + k] /= d);
      if (m !== 0) for (let j = k + 1; j < n; j++) a[i * n + j] -= m * a[k * n + j];
    }
  }
  return true;
}

/** Solve LU x = b in place (b becomes x). */
export function luSolve(lu: Float64Array, n: number, piv: Int32Array, b: Float64Array): void {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = b[piv[i]];
  for (let i = 0; i < n; i++) {
    let s = x[i];
    for (let j = 0; j < i; j++) s -= lu[i * n + j] * x[j];
    x[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= lu[i * n + j] * x[j];
    x[i] = s / lu[i * n + i];
  }
  b.set(x);
}

/** Convenience: solve A x = b without destroying inputs. */
export function solve(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array | null {
  const n = b.length;
  const lu = Float64Array.from(a);
  const piv = new Int32Array(n);
  if (!luFactor(lu, n, piv)) return null;
  const x = Float64Array.from(b);
  luSolve(lu, n, piv, x);
  return x;
}
