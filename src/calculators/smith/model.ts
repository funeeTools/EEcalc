/**
 * Smith chart & L-network matching — pure model.
 *
 * Γ = (Z − Z₀)/(Z + Z₀) for a real reference Z₀ (Pozar 4e §2.3–2.4).
 * Lossless line of impedance Zₗ and electrical length θ in front of the load:
 *   Z_in = Zₗ (Z_L + jZₗ tanθ)/(Zₗ + jZ_L tanθ)                     (Pozar eq. 2.44)
 * L-section matching, both topologies (Pozar §5.1, eqs. 5.3–5.6), all real solutions.
 */

import { type Cx, abs, add, arg, cx, div, inv, mul, scale, sub } from '@/core/math/complex';

export function gammaOf(z: Cx, z0: number): Cx {
  return div(sub(z, cx(z0)), add(z, cx(z0)));
}

/** Z from Γ. Returns null for Γ = 1 (open circuit). */
export function zOf(g: Cx, z0: number): Cx | null {
  const d = sub(cx(1), g);
  if (abs(d) < 1e-14) return null;
  return scale(div(add(cx(1), g), d), z0);
}

/** Stand-in for an open circuit in line transforms (finite so the algebra stays well defined). */
export const OPEN = cx(1e18, 0);

export function lineInput(zl: Cx, zLine: number, thetaRad: number): Cx {
  const t = Math.tan(thetaRad);
  if (!Number.isFinite(t) || Math.abs(t) > 1e15) return abs(zl) < 1e-300 ? OPEN : div(cx(zLine * zLine), zl); // quarter wave: Z² / Z_L
  const num = add(zl, cx(0, zLine * t));
  const den = add(cx(zLine), mul(cx(0, t), zl));
  return scale(div(num, den), zLine);
}

export interface LMatch {
  /** 'shunt-load': shunt element across the load, series element towards the source; 'series-load': the reverse. */
  topology: 'shunt-load' | 'series-load';
  /** Series reactance (Ω) and shunt susceptance (S) */
  x: number;
  b: number;
}

/** All L-section solutions matching z (Ω) to a real z0. */
export function lMatches(z: Cx, z0: number): LMatch[] {
  const R = z.re;
  const X = z.im;
  const out: LMatch[] = [];
  if (!(R > 0)) return out;
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
  // Shunt element next to the load (valid when R² + X² ≥ Z₀·R, i.e. on or outside the g = 1 circle).
  // B comes from the quadratic; X is then taken as exactly the reactance left after B (−Im of the
  // parallel combination), which avoids the cancelling closed form near the circles.
  let disc = R * R + X * X - z0 * R;
  if (Math.abs(disc) <= 1e-9 * (R * R + X * X)) disc = 0; // on the circle, up to rounding
  if (disc >= 0) {
    const y = inv(z);
    for (const sgn of disc === 0 ? [1] : [1, -1]) {
      const b = (X + sgn * Math.sqrt(R / z0) * Math.sqrt(disc)) / (R * R + X * X);
      const zp = inv(add(y, cx(0, b)));
      out.push({ topology: 'shunt-load', x: -zp.im, b });
    }
  }
  // Series element next to the load (valid when R ≤ Z₀)
  const rEff = near(R, z0) ? z0 : R;
  if (rEff <= z0) {
    for (const sgn of rEff === z0 ? [1] : [1, -1]) {
      const x = sgn * Math.sqrt(R * Math.max(z0 - rEff, 0)) - X;
      const ys = inv(add(z, cx(0, x)));
      out.push({ topology: 'series-load', x, b: -ys.im });
    }
  }
  // Snap numerically-zero elements (a load on the g = 1 or r = 1 circle needs only one part), keep only
  // networks that truly match, and drop duplicates (with one element zero both topologies are the same network).
  for (const m of out) {
    if (Math.abs(m.x) < 1e-9 * z0) m.x = 0;
    if (Math.abs(m.b) < 1e-9 / z0) m.b = 0;
  }
  const good = out.filter((m) => abs(gammaOf(matchInput(m, z), z0)) < 1e-6);
  const same = (o: LMatch, m: LMatch) =>
    (o.topology === m.topology || o.x === 0 || o.b === 0) && Math.abs(o.x - m.x) <= 1e-6 * (z0 + Math.abs(m.x)) && Math.abs(o.b - m.b) <= 1e-6 * (1 / z0 + Math.abs(m.b));
  return good.filter((m, i) => good.findIndex((o) => same(o, m)) === i);
}

/** Input impedance of an L-match terminated in z. */
export function matchInput(m: LMatch, z: Cx): Cx {
  if (m.topology === 'shunt-load') {
    const zp = inv(add(inv(z), cx(0, m.b)));
    return add(zp, cx(0, m.x));
  }
  return inv(add(inv(add(z, cx(0, m.x))), cx(0, m.b)));
}

export interface Component {
  kind: 'L' | 'C' | 'none';
  value: number;
  where: 'series' | 'shunt';
}

export function seriesPart(x: number, w: number): Component {
  if (Math.abs(x) < 1e-12) return { kind: 'none', value: 0, where: 'series' };
  return x > 0 ? { kind: 'L', value: x / w, where: 'series' } : { kind: 'C', value: -1 / (w * x), where: 'series' };
}

export function shuntPart(b: number, w: number): Component {
  if (Math.abs(b) < 1e-15) return { kind: 'none', value: 0, where: 'shunt' };
  return b > 0 ? { kind: 'C', value: b / w, where: 'shunt' } : { kind: 'L', value: -1 / (w * b), where: 'shunt' };
}

/** Reactance of a fixed component at angular frequency w. */
function compX(c: Component, w: number): number {
  if (c.kind === 'L') return w * c.value;
  if (c.kind === 'C') return -1 / (w * c.value);
  return 0;
}

/**
 * Γ at the match input versus frequency, with the components fixed at their design values and
 * the load modelled as R in series with a fixed L (X > 0) or C (X < 0) — the usual assumption
 * when only Z at one frequency is known. The optional line is lossless and non-dispersive.
 */
export function matchSweep(o: { load: Cx; f0: number; z0: number; m: LMatch; zLine: number; thetaDeg: number }, freqs: number[]): number[] {
  const w0 = 2 * Math.PI * o.f0;
  const ser = seriesPart(o.m.x, w0);
  const sh = shuntPart(o.m.b, w0);
  const loadPart: Component = o.load.im >= 0 ? { kind: 'L', value: o.load.im / w0, where: 'series' } : { kind: 'C', value: -1 / (w0 * o.load.im), where: 'series' };
  return freqs.map((f) => {
    const w = 2 * Math.PI * f;
    const zl = cx(o.load.re, o.load.im === 0 ? 0 : compX(loadPart, w));
    const z = o.thetaDeg ? lineInput(zl, o.zLine, ((o.thetaDeg * Math.PI) / 180) * (f / o.f0)) : zl;
    const mm: LMatch = { ...o.m, x: compX(ser, w), b: sh.kind === 'none' ? 0 : -1 / compX(sh, w) };
    return abs(gammaOf(matchInput(mm, z), o.z0));
  });
}

/** Points along the matching path for plotting on the chart (element value swept 0 → final). */
export function matchPath(z: Cx, z0: number, m: LMatch, steps = 60): { re: number[]; im: number[] } {
  const re: number[] = [];
  const im: number[] = [];
  const push = (zz: Cx) => {
    const g = gammaOf(zz, z0);
    re.push(g.re);
    im.push(g.im);
  };
  if (m.topology === 'shunt-load') {
    const y = inv(z);
    for (let i = 0; i <= steps; i++) push(inv(add(y, cx(0, (m.b * i) / steps))));
    const zp = inv(add(y, cx(0, m.b)));
    for (let i = 0; i <= steps; i++) push(add(zp, cx(0, (m.x * i) / steps)));
  } else {
    for (let i = 0; i <= steps; i++) push(add(z, cx(0, (m.x * i) / steps)));
    const ys = inv(add(z, cx(0, m.x)));
    for (let i = 0; i <= steps; i++) push(inv(add(ys, cx(0, (m.b * i) / steps))));
  }
  return { re, im };
}

/** Rotation along a lossless line of impedance zLine (towards the generator), sampled. */
export function linePath(zl: Cx, zLine: number, z0: number, thetaDeg: number, steps = Math.max(90, Math.ceil(thetaDeg))): { re: number[]; im: number[] } {
  const re: number[] = [];
  const im: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const g = gammaOf(lineInput(zl, zLine, (((thetaDeg * i) / steps) * Math.PI) / 180), z0);
    re.push(g.re);
    im.push(g.im);
  }
  return { re, im };
}

export const polar = (g: Cx) => ({ mag: abs(g), deg: (arg(g) * 180) / Math.PI });
