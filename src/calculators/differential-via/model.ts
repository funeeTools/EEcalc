/**
 * Differential via pair — pure model (no DOM, SI in/out).
 *
 * There is no exact closed form for a via pair passing through a stack of planes. This page uses the three TEM
 * cross-sections that bound how the return current can flow, each exact (or thin-wire exact) for its own geometry:
 *
 *  • 'separate' — dense ground planes, each barrel in its own round antipad (antipads do not overlap). Each barrel is
 *    treated as a coaxial line with the antipad edge as outer conductor (the usual "coaxial via" approximation), and
 *    the planes screen the two barrels from each other, so Z_odd = Z_coax:
 *      Z_diff = 2·(η₀/2π√εr)·ln(D/d)                 (coaxial line: Pozar, Microwave Engineering 4e, Table 2.1)
 *  • 'shared'   — one round antipad (or a ring of ground vias) of diameter D around both barrels: a balanced pair
 *    inside a circular shield, thin-wire image solution ("balanced shielded line", Reference Data for Engineers,
 *    8th ed., Sams 1993; B. C. Wadell, Transmission Line Design Handbook, Artech House 1991):
 *      Z_diff = (η₀/π√εr)·ln[ (2p/d)·(1−σ²)/(1+σ²) ],  σ = p/D   (d ≪ p, D)
 *  • 'none'     — no nearby return (planes far away or cleared): two parallel round conductors, exact:
 *      Z_diff = (η₀/π√εr)·arccosh(p/d)                 (two-wire line: Pozar, Table 2.1)
 *
 * H. Johnson, M. Graham, "High-Speed Digital Design", Prentice Hall 1993, ch. 7 (vias), single-via estimates:
 *      C ≈ 1.41·εr·T·D₁/(D₂ − D₁)  pF  (inches: T board thickness, D₁ pad, D₂ antipad)
 *      L ≈ 5.08·h·[ln(4h/d) + 1]   nH  (as printed; Rosa/Grover's partial self-inductance has −1, used as primary)
 *
 * Stub: the unused barrel below the exit layer is an open-circuited line. Quarter-wave resonance f = c/(4ℓ√εr) is the
 * upper bound (pad and plane capacitance lower it). Insertion loss: ABCD cascade of the through segment (length ℓ_use)
 * and a shunt open stub (length ℓ_stub), both of impedance Z_via, between Z_line terminations, with dielectric loss
 * α_d = π f √εr tanδ / c (Pozar ch. 2 lossy lines and open-stub input impedance; §4.4 ABCD matrices).
 */

import { type Abcd, type Cx, abcdMul, abcdToS, abs, cx, scale } from '@/core/math/complex';

export const C0 = 299_792_458;
export const MU0 = 1.25663706212e-6;
export const ETA0 = MU0 * C0;

export type ReturnPath = 'separate' | 'shared' | 'none';

/** Differential impedance of the via pair (Ω). d barrel, D antipad, p pitch (centre to centre). */
export function zdiffVia(model: ReturnPath, d: number, D: number, p: number, er: number): number {
  const k = ETA0 / (Math.PI * Math.sqrt(er));
  if (model === 'separate') return k * Math.log(D / d);
  if (model === 'shared') {
    const sg = p / D;
    return k * Math.log(((2 * p) / d) * ((1 - sg * sg) / (1 + sg * sg)));
  }
  return k * Math.acosh(p / d);
}

/** Single-ended coax impedance of one barrel in its antipad (Ω). */
export function zcoax(d: number, D: number, er: number): number {
  return (ETA0 / (2 * Math.PI * Math.sqrt(er))) * Math.log(D / d);
}

const IN = 0.0254;

/** Johnson's pad-to-plane capacitance estimate (F). t board thickness, d1 pad, d2 antipad (m). */
export function johnsonC(er: number, t: number, d1: number, d2: number): number {
  return ((1.41 * er * (t / IN) * (d1 / IN)) / ((d2 - d1) / IN)) * 1e-12;
}

/**
 * Partial self-inductance of a straight round conductor with its current on the surface (high frequency):
 * L = (µ₀h/2π)·[ln(4h/d) − 1] = 5.08·h·[ln(4h/d) − 1] nH (h, d in inches). E. B. Rosa, "The self and mutual
 * inductances of linear conductors", Bull. Bureau of Standards 4(2), 1908, p. 301; F. W. Grover, "Inductance
 * Calculations", Van Nostrand 1946. Valid for h ≫ d.
 */
export function partialL(h: number, d: number): number {
  return ((MU0 * h) / (2 * Math.PI)) * (Math.log((4 * h) / d) - 1);
}

/** Johnson's via inductance as printed in the book (H): 5.08·h·[ln(4h/d) + 1] nH — 2·(µ₀h/2π) larger than Rosa. */
export function johnsonL(h: number, d: number): number {
  return 5.08 * (h / IN) * (Math.log((4 * h) / d) + 1) * 1e-9;
}

/** Quarter-wave resonance of an open stub (Hz). */
export function stubResonance(len: number, er: number): number {
  return C0 / (4 * len * Math.sqrt(er));
}

/** Complex tanh for z = x + jy. */
function ctanh(x: number, y: number): Cx {
  // tanh(x+jy) = (sinh 2x + j sin 2y)/(cosh 2x + cos 2y); stable form for large x
  if (Math.abs(x) > 20) return cx(Math.sign(x), 0);
  const den = Math.max(Math.cosh(2 * x) + Math.cos(2 * y), 1e-300);
  return cx(Math.sinh(2 * x) / den, Math.sin(2 * y) / den);
}

/** S21 (complex) of: Z_line → via segment ℓ_use → shunt open stub ℓ_stub → Z_line. */
export function viaS21(f: number, zVia: number, zLine: number, er: number, tanD: number, lUse: number, lStub: number): Cx {
  const beta = (2 * Math.PI * f * Math.sqrt(er)) / C0;
  const alpha = (beta * tanD) / 2; // α_d = π f √εr tanδ / c
  // through segment: A = cosh γℓ, B = Z sinh γℓ, C = sinh γℓ / Z, D = cosh γℓ
  const g = (l: number) => ({ re: alpha * l, im: beta * l });
  const ch = (z: Cx): Cx => cx(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im));
  const sh = (z: Cx): Cx => cx(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im));
  let m: Abcd = [cx(1), cx(0), cx(0), cx(1)];
  if (lUse > 0) {
    const gl = g(lUse);
    if (gl.re > 300) return cx(0, 0);
    const c = ch(gl);
    const sn = sh(gl);
    m = [c, scale(sn, zVia), scale(sn, 1 / zVia), c];
  }
  if (lStub > 0) {
    // open stub input admittance: Y = tanh(γℓ)/Z_via
    const gl = g(lStub);
    const y = scale(ctanh(gl.re, gl.im), 1 / zVia);
    m = abcdMul(m, [cx(1), cx(0), y, cx(1)]);
  }
  return abcdToS(m, zLine, zLine).s21;
}

export function viaIL(f: number, zVia: number, zLine: number, er: number, tanD: number, lUse: number, lStub: number): number {
  const s = abs(viaS21(f, zVia, zLine, er, tanD, lUse, lStub));
  return -20 * Math.log10(Math.max(s, 1e-30));
}
