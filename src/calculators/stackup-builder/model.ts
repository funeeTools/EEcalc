/**
 * PCB stack-up — pure model (no DOM, SI in/out).
 *
 * The stack is a list of copper layers, top to bottom, each with the dielectric (prepreg or core) under
 * it; the last layer has none. Solder mask (optional) covers both outer layers.
 *
 * Reference planes: for each signal layer, the nearest plane layer above and below it (other signal
 * layers in between are passed over and their copper counted as dielectric thickness, the usual
 * dual-stripline treatment).
 *
 * Impedance of a signal layer of trace width W and copper thickness T:
 *  • one plane (outer layer, or an inner layer with one reference): microstrip, Hammerstad & Jensen 1980
 *    with their thickness correction (microstrip/model.ts), H = distance to the plane, εr = the series
 *    (capacitance-weighted) mean of the dielectrics between them; the cover above the trace (solder mask
 *    on an outer layer, the laminate out to the board surface on an inner one) is added with the cover
 *    filling factor of the Controlled Impedance page (controlled-impedance/model.ts `analyse`, imported
 *    read-only: Wan & Hoorfar 2000 q₂ with the Bahl & Stuchly 1980 εeff increment; measured there against a
 *    2-D field solution as +0.5…2.1 % high for mask, +1.4…2.8 % high for embedded);
 *  • two planes, centred or off-centre: the offset-stripline model of the Asymmetric Stripline page
 *    (asymmetric-stripline/model.ts, imported read-only): Cohn's broadside-coupled thin-strip result with
 *    the exact centred-line correction and Wadell's image-method thickness increments; it reduces to the
 *    centred stripline for H₁ = H₂ and is within +0…2.6 % of a 2-D field solution over H₂/H₁ = 1.5–5.
 *    (The plain image method — two centred half-lines in parallel — was checked here against a 2-D
 *    finite-difference solution too and overestimates Z₀ by up to 7 % for narrow, strongly offset strips,
 *    so it is not used.)
 * Mixed dielectrics between the planes are reduced to one εr by the series mean Σh / Σ(h/εr), exact for
 * the parallel-plate field under a wide strip and an approximation for narrow ones.
 */

import { microstripStatic } from '../microstrip/model';
import { offsetStripline } from '../asymmetric-stripline/model';
import { analyse } from '../controlled-impedance/model';

export type Role = 'signal' | 'gnd' | 'pwr' | 'mixed';
export type Diel = 'prepreg' | 'core';

export interface StackLayer {
  role: Role;
  /** copper thickness (m) */
  t: number;
  /** dielectric under this copper layer (ignored on the last layer) */
  diel: Diel;
  h: number;
  er: number;
}

export const isPlane = (r: Role) => r === 'gnd' || r === 'pwr';
export const isSignal = (r: Role) => r === 'signal' || r === 'mixed';

export interface Ref {
  /** index of the reference plane */
  idx: number;
  /** dielectric distance between the copper faces (m), counting copper of signal layers in between */
  h: number;
  /** series-mean εr of the dielectrics in between */
  er: number;
}

/** Reference plane above (idx < i) or below (idx > i) a signal layer, nearest first; null when none. */
export function refPlane(layers: StackLayer[], i: number, dir: -1 | 1): Ref | null {
  let h = 0;
  let hOverEr = 0;
  for (let j = i + dir; j >= 0 && j < layers.length; j += dir) {
    const d = dir < 0 ? layers[j] : layers[j - 1]; // the dielectric between j and its neighbour towards i
    h += d.h;
    hOverEr += d.h / d.er;
    if (isPlane(layers[j].role)) return { idx: j, h, er: h / hOverEr };
    // a signal layer in between: its copper is counted as dielectric of the same εr as the band before it
    h += layers[j].t;
    hOverEr += layers[j].t / d.er;
  }
  return null;
}

export type Structure = 'microstrip' | 'coated microstrip' | 'stripline' | 'offset stripline' | 'embedded microstrip' | 'none';

export interface LineResult {
  structure: Structure;
  z0: number | null;
  above: Ref | null;
  below: Ref | null;
  /** εr used (substrate εr for the microstrips) */
  er: number;
  /** cover over a microstrip: mask on an outer layer, laminate on an inner one (thickness above the trace top, εr) */
  cover?: { h: number; er: number };
  /** the same line without its cover (bare microstrip), for comparison */
  z0Bare?: number;
}

/** Laminate on the side of an inner layer that has no plane: thickness out to the board surface and its series εr. */
export function coverOf(layers: StackLayer[], i: number, dir: -1 | 1): { h: number; er: number } | null {
  let h = 0;
  let hOverEr = 0;
  for (let j = i + dir; j >= 0 && j < layers.length; j += dir) {
    const d = dir < 0 ? layers[j] : layers[j - 1];
    h += d.h + layers[j].t; // the passed copper layers are sparse signal layers: count them as laminate
    hOverEr += (d.h + layers[j].t) / d.er;
  }
  return h > 0 ? { h, er: h / hOverEr } : null;
}

/** Stripline between two planes, the trace H₁ below the upper plane and H₂ above the lower one (any offset). */
export const zStrip = (w: number, h1: number, h2: number, t: number, er: number) => offsetStripline(w, t, h2, h1, er).z0;

/** Impedance of signal layer i at trace width w. */
export function lineAt(layers: StackLayer[], i: number, w: number, mask: { t: number; er: number } | null = null): LineResult {
  const above = refPlane(layers, i, -1);
  const below = refPlane(layers, i, 1);
  const t = layers[i].t;
  if (above && below) {
    const er = (above.h + below.h) / (above.h / above.er + below.h / below.er);
    const sym = Math.abs(above.h - below.h) <= 1e-3 * Math.max(above.h, below.h);
    const z0 = zStrip(w, above.h, below.h, t, er);
    return { structure: sym ? 'stripline' : 'offset stripline', z0, above, below, er };
  }
  const ref = above ?? below;
  if (!ref) return { structure: 'none', z0: null, above, below, er: NaN };
  const outer = i === 0 || i === layers.length - 1;
  // One plane: H&J microstrip, plus the cover above it (solder mask on an outer layer, the laminate out to
  // the board surface on an inner one) by the Wan–Hoorfar / Bahl–Stuchly cover factor of the Controlled
  // Impedance page (imported read-only; measured there +0.5…2.1 % high for mask, +1.4…2.8 % for embedded).
  const cover = outer ? (mask && mask.t > 0 ? { h: mask.t, er: mask.er } : null) : coverOf(layers, i, above ? 1 : -1);
  const bare = microstripStatic(w, ref.h, t, ref.er).z0;
  if (!cover) return { structure: 'microstrip', z0: bare, above, below, er: ref.er };
  const r = analyse({ structure: outer ? 'mask' : 'emb', w, h: ref.h, t, er: ref.er, c: cover.h, erm: cover.er, hc: cover.h, erc: cover.er, g: 0 });
  return { structure: outer ? 'coated microstrip' : 'embedded microstrip', z0: r.z0, above, below, er: ref.er, cover, z0Bare: bare };
}

/** Total thickness over the outer copper (m), and with the mask on both sides. */
export function thickness(layers: StackLayer[], maskT: number): { cu: number; diel: number; total: number; withMask: number } {
  const cu = layers.reduce((a, l) => a + l.t, 0);
  const diel = layers.slice(0, -1).reduce((a, l) => a + l.h, 0);
  return { cu, diel, total: cu + diel, withMask: cu + diel + 2 * maskT };
}

export interface PairCheck {
  /** upper index (copper i ↔ n−1−i, or dielectric under i ↔ dielectric under n−2−i) */
  a: number;
  b: number;
  kind: 'copper' | 'dielectric';
  issues: string[];
}

const near = (x: number, y: number, rel = 0.02) => Math.abs(x - y) <= rel * Math.max(Math.abs(x), Math.abs(y));

/** Mirror checks about the centre of the stack: copper weight and plane/signal balance, dielectric thickness, εr and type. */
export function symmetry(layers: StackLayer[]): PairCheck[] {
  const n = layers.length;
  const out: PairCheck[] = [];
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const a = layers[i];
    const b = layers[n - 1 - i];
    const issues: string[] = [];
    if (!near(a.t, b.t)) issues.push('copper thickness');
    // copper balance: a plane or a poured signal layer is copper-heavy, a plain signal layer is sparse
    const heavy = (r: Role) => r !== 'signal';
    if (heavy(a.role) !== heavy(b.role)) issues.push('plane vs signal (copper balance)');
    out.push({ a: i, b: n - 1 - i, kind: 'copper', issues });
  }
  for (let i = 0; i < Math.floor((n - 1) / 2); i++) {
    const a = layers[i];
    const b = layers[n - 2 - i];
    const issues: string[] = [];
    if (!near(a.h, b.h)) issues.push('thickness');
    if (!near(a.er, b.er, 0.01)) issues.push('εr');
    if (a.diel !== b.diel) issues.push('core vs prepreg');
    out.push({ a: i, b: n - 2 - i, kind: 'dielectric', issues });
  }
  return out;
}
