/** Minimal complex arithmetic for network calculations (immutable {re, im}). */

export interface Cx {
  re: number;
  im: number;
}

export const cx = (re: number, im = 0): Cx => ({ re, im });
export const add = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const div = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
export const scale = (a: Cx, k: number): Cx => ({ re: a.re * k, im: a.im * k });
export const inv = (a: Cx): Cx => div(cx(1), a);
export const abs = (a: Cx): number => Math.hypot(a.re, a.im);
export const arg = (a: Cx): number => Math.atan2(a.im, a.re);
export const conj = (a: Cx): Cx => ({ re: a.re, im: -a.im });

/** 2×2 ABCD matrix */
export type Abcd = [Cx, Cx, Cx, Cx];

export const abcdIdentity = (): Abcd => [cx(1), cx(0), cx(0), cx(1)];
export const abcdSeries = (z: Cx): Abcd => [cx(1), z, cx(0), cx(1)];
export const abcdShunt = (y: Cx): Abcd => [cx(1), cx(0), y, cx(1)];
export function abcdMul(m: Abcd, n: Abcd): Abcd {
  const [a, b, c, d] = m;
  const [e, f, g, h] = n;
  return [add(mul(a, e), mul(b, g)), add(mul(a, f), mul(b, h)), add(mul(c, e), mul(d, g)), add(mul(c, f), mul(d, h))];
}

/** S21 and S11 of a two-port between real source Rs and load Rl (power waves, real references). */
export function abcdToS(m: Abcd, rs: number, rl: number): { s21: Cx; s11: Cx } {
  const [a, b, c, d] = m;
  const den = add(add(scale(a, rl), b), add(scale(c, rs * rl), scale(d, rs)));
  const s21 = div(cx(2 * Math.sqrt(rs * rl)), den);
  const num11 = sub(add(scale(a, rl), b), add(scale(c, rs * rl), scale(d, rs)));
  return { s21, s11: div(num11, den) };
}
