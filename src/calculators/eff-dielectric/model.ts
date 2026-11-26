/**
 * Effective dielectric constant — pure model (no DOM, SI in/out).
 *
 * Quasi-static εeff of five PCB line structures, imported unchanged from the controlled-impedance page
 * (controlled-impedance/model.ts `analyse`):
 *   • surface microstrip — Hammerstad & Jensen, "Accurate Models for Microstrip Computer-Aided Design",
 *     IEEE MTT-S Digest 1980, pp. 407–409, with their strip-thickness correction (≈ 0.2 % in εeff);
 *   • microstrip under solder mask and embedded microstrip — the bare H&J line plus the cover’s filling-factor
 *     increment of C. Wan & A. Hoorfar, IEEE MGWL 10(6), 2000, pp. 223–224 (Bahl & Stuchly cover rule);
 *   • symmetric stripline — homogeneous dielectric, pure TEM: εeff = εr exactly;
 *   • grounded coplanar waveguide — conformal mapping, Ghione & Naldi, IEEE T-MTT 35(3), 1987, and
 *     R. N. Simons, Coplanar Waveguide Circuits, Components, and Systems, Wiley 2001, §2.4.
 * Frequency dependence (surface microstrip only): M. Kirschning & R. H. Jansen, "Accurate Model for Effective
 * Dielectric Constant of Microstrip with Validity up to Millimetre-Wave Frequencies", Electronics Letters 18(6),
 * 1982, pp. 272–273 (microstrip/model.ts `epsEffKJ`; stated accuracy 0.6 % for 0.1 ≤ W/H ≤ 100, 1 ≤ εr ≤ 20,
 * H/λ₀ ≤ 0.13, i.e. f·H ≤ 39 GHz·mm), applied to the thickness-corrected static value as on the microstrip page.
 * The covered and coplanar structures have no comparably sourced dispersion model here, so they are quasi-static.
 *
 * From εeff: phase velocity v = c/√εeff, delay per length t_pd = √εeff/c, guided wavelength λ_g = c/(f√εeff).
 */

import { type CiInputs, type Structure, analyse } from '../controlled-impedance/model';
import { C0, epsEffKJ, microstripStatic } from '../microstrip/model';

export { C0 };
export type { Structure };

export interface EffInputs extends CiInputs {
  f: number;
}

export interface EffResult {
  /** εeff at f (dispersive for surface microstrip, else the static value) */
  eeff: number;
  /** quasi-static εeff */
  eeff0: number;
  /** filling factor q = (εeff₀ − 1)/(εr − 1) (share of the field in the substrate, quasi-static) */
  q: number;
  z0: number;
  /** εeff includes frequency dependence */
  dispersive: boolean;
}

export const isDispersive = (s: Structure) => s === 'ms';

export function effDielectric(i: EffInputs): EffResult {
  // stripline: εeff = εr whatever the geometry; Z₀ only where Cohn’s thickness correction holds (T/(2H + T) ≤ 0.45, T ≤ 3W)
  if (i.structure === 'sl') {
    const zOk = i.t / (2 * i.h + i.t) <= 0.45 && i.t <= 3 * i.w;
    return { eeff: i.er, eeff0: i.er, q: 1, z0: zOk ? analyse(i).z0 : NaN, dispersive: false };
  }
  const a = analyse(i);
  const eeff0 = a.epsEff;
  const eeff = isDispersive(i.structure) ? epsEffKJ(eeff0, i.er, i.w / i.h, i.h, i.f) : eeff0;
  return { eeff, eeff0, q: i.er > 1 ? (eeff0 - 1) / (i.er - 1) : NaN, z0: a.z0, dispersive: isDispersive(i.structure) };
}

/** Bare microstrip of the same W, H, T, εr at f (reference curve for the other structures). */
export function bareMicrostrip(w: number, h: number, t: number, er: number, f: number): number {
  const s = microstripStatic(w, h, t, er);
  return epsEffKJ(s.epsEff, er, w / h, h, f);
}

export const delayOf = (eeff: number) => Math.sqrt(eeff) / C0;
export const eeffOfDelay = (tpd: number) => (tpd * C0) ** 2;
