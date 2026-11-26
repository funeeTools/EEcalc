/**
 * PCB trace resistance — equations (pure, SI in / SI out).
 *
 * DC:  R = ρ(T)·ℓ / (W·T),  ρ(T) = ρ20·[1 + α20·(T − 20 °C)]
 *      Annealed copper ρ20 = 1.7241e-8 Ω·m (1/58 Ω·mm²/m) and α20 = 0.00393 /°C (IEC 60028:1925, the
 *      International Annealed Copper Standard). The linear law holds to about ±2 % from −50 °C to +300 °C
 *      against the recommended copper data of R. A. Matula, J. Phys. Chem. Ref. Data 8 (1979) 1147.
 *      Sheet resistance R□ = ρ/T; the trace is ℓ/W squares long.
 *
 * AC (skin effect): δ = √(ρ / (π f μ0)) (Ramo, Whinnery & Van Duzer, Fields and Waves in Communication
 *      Electronics, 3rd ed., §3.16). The current is taken to flow uniformly in a layer one skin depth thick
 *      under every surface that carries it — the standard engineering estimate for rectangular conductors
 *      (H. Johnson & M. Graham, High-Speed Digital Design, 1993, §4.5; E. Bogatin, Signal and Power
 *      Integrity — Simplified, 3rd ed., 2018, ch. 9):
 *        - over a plane (microstrip): the face toward the plane only,   A = W·min(δ, T)
 *        - between two planes (stripline): both broad faces,           A = W·min(2δ, T)
 *        - no nearby plane (isolated):  the whole perimeter,           A = W·T − (W − 2δ)⁺·(T − 2δ)⁺
 *      Each area equals W·T (the DC value) once δ reaches the thickness it is spread over, so R(f) is
 *      continuous and equals Rdc at low frequency. Edge crowding and proximity to the return are ignored.
 *
 * Roughness: Hammerstad–Jensen factor K = 1 + (2/π)·atan(1.4·(Δ/δ)²), Δ the RMS roughness
 *      (E. Hammerstad & Ø. Jensen, “Accurate models for microstrip computer-aided design”, IEEE MTT-S
 *      Int. Microwave Symp. Digest, 1980, pp. 407–409). It saturates at 2.
 */

import { skinDepth } from '@/calculators/skin-depth/model';

export const RHO20_CU = 1 / 58e6; // 1.7241e-8 Ω·m
export const ALPHA20_CU = 0.00393;

export type ReturnPath = 'micro' | 'strip' | 'iso';

export const rhoAt = (rho20: number, alpha: number, tC: number) => rho20 * (1 + alpha * (tC - 20));

/** Cross-section that carries the current at skin depth δ (m²). */
export function acArea(w: number, t: number, delta: number, ret: ReturnPath): number {
  if (ret === 'micro') return w * Math.min(delta, t);
  if (ret === 'strip') return w * Math.min(2 * delta, t);
  return w * t - Math.max(w - 2 * delta, 0) * Math.max(t - 2 * delta, 0);
}

/** Hammerstad–Jensen roughness factor for RMS roughness Δ and skin depth δ. */
export const roughFactor = (rq: number, delta: number) => (rq > 0 ? 1 + (2 / Math.PI) * Math.atan(1.4 * (rq / delta) ** 2) : 1);

/** Frequency at which δ equals the depth the current spreads over at DC (T for microstrip, T/2 otherwise). */
export function skinOnset(t: number, rho: number, ret: ReturnPath): number {
  const d = ret === 'micro' ? t : t / 2;
  return rho / (Math.PI * 4e-7 * Math.PI * d * d);
}

export interface TraceR {
  rho: number;
  rdc: number;
  rdc20: number;
  /** skin depth (∞ at DC) */
  delta: number;
  /** Rac/Rdc from the skin layer alone */
  skin: number;
  /** roughness factor */
  kr: number;
  /** resistance at f (= rdc at DC) */
  r: number;
  sheet: number;
}

export interface TraceRIn {
  w: number;
  len: number;
  t: number;
  tC: number;
  f: number;
  ret: ReturnPath;
  rough: number;
  rho20: number;
  alpha: number;
}

export function traceR(p: TraceRIn): TraceR {
  const rho = rhoAt(p.rho20, p.alpha, p.tC);
  const area = p.w * p.t;
  const rdc = (rho * p.len) / area;
  const rdc20 = (p.rho20 * p.len) / area;
  if (!(p.f > 0)) return { rho, rdc, rdc20, delta: Infinity, skin: 1, kr: 1, r: rdc, sheet: rho / p.t };
  const delta = skinDepth(p.f, 1 / rho, 1);
  const skin = area / acArea(p.w, p.t, delta, p.ret);
  const kr = roughFactor(p.rough, delta);
  return { rho, rdc, rdc20, delta, skin, kr, r: rdc * skin * kr, sheet: rho / p.t };
}
