/**
 * Decoupling capacitor bank — equations (pure, SI in / SI out).
 *
 * Target impedance  Z_t = V · ripple / ΔI
 *   (L. D. Smith, R. E. Anderson, D. W. Forehand, T. J. Pelc, T. Roy, “Power distribution system design
 *    methodology and capacitor selection for modern CMOS technology”, IEEE Trans. Adv. Packaging 22(3), 1999.)
 *
 * One mounted capacitor: a series R-L-C,  Z = ESR + jω(ESL + L_mnt) + 1/(jωC); N alike in parallel: Z/N.
 * The bank is every group in parallel, reaching the load through a spreading inductance L_sp, with the
 * plane capacitance C_p at the load:  Z = [ (Σ N_i/Z_i)⁻¹ + jωL_sp ] ∥ 1/(jωC_p).
 * (Smith et al. 1999; L. D. Smith, E. Bogatin, Principles of Power Integrity for PDN Design, 2017, ch. 7–9.)
 *
 * Mounting inductance — the loop from the capacitor pads down to the plane pair, split as in Smith & Bogatin
 * (2017, ch. 7) into the surface traces and the via pair:
 *   - each pad-to-via trace is a microstrip over the nearest plane at height h; its loop inductance per length
 *     is Z0,air/c, with Z0,air the Hammerstad–Jensen impedance of the strip in air (E. Hammerstad,
 *     Ø. Jensen, IEEE MTT-S Digest 1980, eq. 1)  →  L_tr = 2 · ℓ · Z0,air(w/h) / c
 *   - the two vias of length h, diameter d_v, centre spacing s form a two-wire loop
 *     L_via = (μ0 h / π) · acosh(s / d_v)       (C. R. Paul, Inductance: Loop and Partial, Wiley 2010, §5.4;
 *     Smith & Bogatin's “10 pH/mil · h · ln(s/r)” rule is its s ≫ d_v form)
 *   L_mnt = L_tr + L_via. The capacitor's own ESL (body and terminations) comes from its datasheet.
 */

import { C0, MU0, z0Air } from '@/calculators/microstrip/model';

export interface CapGroup {
  n: number;
  c: number;
  esr: number;
  esl: number;
}

export interface Mount {
  /** height of the surface layer above the plane pair = via length (m) */
  h: number;
  /** via (barrel) diameter */
  dv: number;
  /** via centre spacing */
  s: number;
  /** pad-to-via trace length (each side) */
  len: number;
  /** trace width */
  w: number;
}

export interface Cx {
  re: number;
  im: number;
}

export const targetZ = (v: number, ripplePct: number, dI: number) => (v * ripplePct) / 100 / dI;

export function viaPairL(h: number, s: number, dv: number): number {
  return ((MU0 * h) / Math.PI) * Math.acosh(Math.max(s / dv, 1));
}

export function traceL(len: number, w: number, h: number): number {
  if (!(len > 0)) return 0;
  return (2 * len * z0Air(w / h)) / C0;
}

export function mountL(m: Mount): { lTrace: number; lVia: number; total: number } {
  const lTrace = traceL(m.len, m.w, m.h);
  const lVia = viaPairL(m.h, m.s, m.dv);
  return { lTrace, lVia, total: lTrace + lVia };
}

/** Admittance of one group (N capacitors) at angular frequency w. */
function groupY(g: CapGroup, lm: number, w: number): Cx {
  const re = g.esr;
  const im = w * (g.esl + lm) - 1 / (w * g.c);
  const d = re * re + im * im;
  return { re: (g.n * re) / d, im: (-g.n * im) / d };
}

/** Impedance of one group. */
export function groupZ(g: CapGroup, lm: number, f: number): Cx {
  const w = 2 * Math.PI * f;
  return { re: g.esr / g.n, im: (w * (g.esl + lm) - 1 / (w * g.c)) / g.n };
}

/** Impedance seen at the load (Ω, complex). */
export function bankZ(groups: CapGroup[], lm: number, lsp: number, cp: number, f: number): Cx {
  const w = 2 * Math.PI * f;
  let yr = 0;
  let yi = 0;
  for (const g of groups) {
    if (!(g.n > 0)) continue;
    const y = groupY(g, lm, w);
    yr += y.re;
    yi += y.im;
  }
  // caps in parallel, then the spreading inductance in series
  const dy = yr * yr + yi * yi;
  let zr = dy > 0 ? yr / dy : Infinity;
  let zi = dy > 0 ? -yi / dy + w * lsp : Infinity;
  if (!(cp > 0)) return { re: zr, im: zi };
  if (!Number.isFinite(zr)) return { re: 0, im: -1 / (w * cp) };
  // ∥ plane capacitance
  const dz = zr * zr + zi * zi;
  const ar = zr / dz;
  const ai = -zi / dz + w * cp;
  const da = ar * ar + ai * ai;
  zr = ar / da;
  zi = -ai / da;
  return { re: zr, im: zi };
}

export const absC = (z: Cx) => Math.hypot(z.re, z.im);

export const srf = (c: number, l: number) => 1 / (2 * Math.PI * Math.sqrt(l * c));

/** Golden-section search for the maximum of zf on [fa, fb] (log scale). */
function refineMax(zf: (f: number) => number, fa: number, fb: number): { f: number; z: number } {
  let a = Math.log(fa);
  let b = Math.log(fb);
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = zf(Math.exp(c));
  let fd = zf(Math.exp(d));
  for (let i = 0; i < 48; i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = zf(Math.exp(c));
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = zf(Math.exp(d));
    }
  }
  const fm = Math.exp((a + b) / 2);
  return { f: fm, z: zf(fm) };
}

/**
 * Analytic guesses for where |Z| peaks: each group's mounted SRF, and the parallel resonance of every group's
 * inductance (with the spreading inductance) against every other group's capacitance and the plane
 * capacitance, f ≈ 1/(2π√(L_i/N_i · N_j C_j)). Narrow, high-Q anti-resonances can fall between the points
 * of a coarse grid; the search samples densely around these.
 */
export function peakSeeds(groups: CapGroup[], lm: number, lsp: number, cp: number): number[] {
  const out: number[] = [];
  const gs = groups.filter((g) => g.n > 0);
  for (const gi of gs) {
    const li = (gi.esl + lm) / gi.n;
    out.push(srf(gi.c, gi.esl + lm));
    for (const gj of gs) if (gj !== gi) out.push(1 / (2 * Math.PI * Math.sqrt(li * gj.n * gj.c)));
    if (cp > 0) out.push(1 / (2 * Math.PI * Math.sqrt((li + lsp) * cp)));
  }
  return out.filter(Number.isFinite);
}

/**
 * Largest |Z| over [f1, f2]: a log grid plus dense clusters round the analytic peak estimates (seeds); every
 * local maximum of that sampling is then refined by a golden-section search between its neighbours.
 */
export function worstInBand(zf: (f: number) => number, f1: number, f2: number, n = 240, seeds: number[] = []): { f: number; z: number } {
  const fs: number[] = [];
  for (let k = 0; k < n; k++) fs.push(f1 * (f2 / f1) ** (k / (n - 1)));
  for (const sd of seeds) for (let k = -12; k <= 12; k++) {
    const f = sd * Math.exp((0.4 * k) / 12);
    if (f > f1 && f < f2) fs.push(f);
  }
  fs.sort((x, y) => x - y);
  const zs = fs.map(zf);
  let best = { f: fs[0], z: zs[0] };
  if (zs[zs.length - 1] > best.z) best = { f: fs[fs.length - 1], z: zs[zs.length - 1] };
  for (let k = 1; k < fs.length - 1; k++) {
    if (!(zs[k] >= zs[k - 1] && zs[k] >= zs[k + 1])) continue;
    const r = refineMax(zf, fs[k - 1], fs[k + 1]);
    const top = r.z > zs[k] ? r : { f: fs[k], z: zs[k] };
    if (top.z > best.z) best = top;
  }
  return best;
}

/** Local maxima (anti-resonances) of |Z| on a log grid between f1 and f2, each refined. */
export function peaks(zf: (f: number) => number, f1: number, f2: number, n = 400, seeds: number[] = []): { f: number; z: number }[] {
  const fs = Array.from({ length: n }, (_, k) => f1 * (f2 / f1) ** (k / (n - 1)));
  for (const sd of seeds) for (let k = -12; k <= 12; k++) {
    const f = sd * Math.exp((0.4 * k) / 12);
    if (f > f1 && f < f2) fs.push(f);
  }
  fs.sort((x, y) => x - y);
  const zs = fs.map(zf);
  const out: { f: number; z: number }[] = [];
  for (let k = 1; k < fs.length - 1; k++) {
    if (!(zs[k] > zs[k - 1] && zs[k] >= zs[k + 1])) continue;
    const r = refineMax(zf, fs[k - 1], fs[k + 1]);
    // the same peak reached from two sample points: keep one
    if (out.length && Math.abs(Math.log(r.f / out[out.length - 1].f)) < 1e-6) continue;
    out.push(r);
  }
  return out;
}
