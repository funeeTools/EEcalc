/**
 * Via stub resonance — pure model (no DOM, SI in/out).
 *
 * The barrel below the exit layer is an open-circuited transmission-line stub of length ℓ hanging off the signal
 * path. Its input impedance (Pozar, Microwave Engineering 4e, §2.3–2.7):
 *
 *   open end:          Z_in = Z_v·coth(γℓ)                     → series resonance (Z_in = 0) at βℓ = π/2 + mπ
 *   end capacitance C: Z_in = Z_v·(Z_L + Z_v·tanh γℓ)/(Z_v + Z_L·tanh γℓ),  Z_L = 1/(jωC)
 *                      → lossless resonance where tan(βℓ) = 1/(ωC·Z_v)  (a pad or plane load pulls it lower)
 *
 *   quarter-wave (open end):  f_res = c / (4ℓ√εr),  odd harmonics 3f_res, 5f_res …
 *   (E. Bogatin, Signal and Power Integrity — Simplified, 3rd ed., Prentice Hall 2018, on via stubs; H. Johnson,
 *    High-Speed Signal Propagation, Prentice Hall 2003, on vias.)
 *
 * Insertion loss: ABCD cascade of the used barrel (length ℓ_use, impedance Z_v) and the shunt stub admittance
 * 1/Z_in, between Z₀ terminations; dielectric loss α_d = π f √εr tanδ / c (Pozar §2.7, §4.4).
 * Nyquist frequency: f_N = R_b/2 for NRZ, R_b/4 for PAM4 (two bits per symbol).
 */

import { type Abcd, type Cx, abcdMul, abcdToS, abs, add, cx, div, mul, scale } from '@/core/math/complex';
import { brent } from '@/core/calc/solve';

export const C0 = 299_792_458;

/** Quarter-wave resonance of an open stub (Hz). */
export function quarterWave(len: number, er: number): number {
  return C0 / (4 * len * Math.sqrt(er));
}

/**
 * Resonances (Hz) of a stub with end capacitance c (F): the m-th root of tan(βℓ)·ωCZ = 1 lies between the
 * open-stub frequencies 2m·f₀ and (2m+1)·f₀. With c = 0 they are the odd multiples of f₀.
 */
export function stubResonances(len: number, er: number, zVia: number, c: number, count = 3): number[] {
  const f0 = quarterWave(len, er);
  if (!(c > 0)) return Array.from({ length: count }, (_, m) => (2 * m + 1) * f0);
  const k = (2 * Math.PI * len * Math.sqrt(er)) / C0;
  const out: number[] = [];
  for (let m = 0; m < count; m++) {
    const lo = 2 * m * f0;
    const hi = (2 * m + 1) * f0;
    const g = (f: number) => Math.tan(k * f) * 2 * Math.PI * f * c * zVia - 1;
    const a = lo + hi * 1e-9;
    const b = hi * (1 - 1e-12);
    out.push(brent(g, a, b, hi * 1e-14));
  }
  return out;
}

/** Fundamental resonance of the stub (Hz). */
export function stubF1(len: number, er: number, zVia: number, c: number): number {
  return stubResonances(len, er, zVia, c, 1)[0];
}

const ch = (z: Cx): Cx => cx(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im));
const sh = (z: Cx): Cx => cx(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im));
function ctanh(z: Cx): Cx {
  if (Math.abs(z.re) > 20) return cx(Math.sign(z.re), 0);
  const den = Math.max(Math.cosh(2 * z.re) + Math.cos(2 * z.im), 1e-300);
  return cx(Math.sinh(2 * z.re) / den, Math.sin(2 * z.im) / den);
}

export interface StubLine {
  zVia: number;
  z0: number;
  er: number;
  tanD: number;
  lUse: number;
  lStub: number;
  cEnd: number;
}

/** S21 of Z₀ → barrel ℓ_use → shunt stub ℓ_stub (end capacitance cEnd) → Z₀. */
export function stubS21(f: number, p: StubLine): Cx {
  const beta = (2 * Math.PI * f * Math.sqrt(p.er)) / C0;
  const alpha = (beta * p.tanD) / 2;
  let m: Abcd = [cx(1), cx(0), cx(0), cx(1)];
  if (p.lUse > 0) {
    const gl = cx(alpha * p.lUse, beta * p.lUse);
    if (gl.re > 300) return cx(0, 0);
    const c = ch(gl);
    const sn = sh(gl);
    m = [c, scale(sn, p.zVia), scale(sn, 1 / p.zVia), c];
  }
  if (p.lStub > 0) {
    // Y_stub = (1/Z_v)·(Y_L·Z_v + T)/(1 + Y_L·Z_v·T), T = tanh γℓ, Y_L = jωC (open end: Y = T/Z_v)
    const T = ctanh(cx(alpha * p.lStub, beta * p.lStub));
    const yz = cx(0, 2 * Math.PI * f * p.cEnd * p.zVia);
    const y = scale(div(add(yz, T), add(cx(1), mul(yz, T))), 1 / p.zVia);
    m = abcdMul(m, [cx(1), cx(0), y, cx(1)]);
  }
  return abcdToS(m, p.z0, p.z0).s21;
}

export function stubIL(f: number, p: StubLine): number {
  return -20 * Math.log10(Math.max(abs(stubS21(f, p)), 1e-30));
}

/** Nyquist frequency of a bit rate (Hz). */
export const nyquist = (rate: number, mod: 'nrz' | 'pam4') => rate / (mod === 'pam4' ? 4 : 2);
