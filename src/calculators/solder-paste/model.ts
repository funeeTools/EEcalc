/**
 * Stencil printing — pure model (no DOM, SI in/out).
 *
 * Area ratio and aspect ratio of a stencil aperture, and the IPC-7525 release guidelines:
 *   IPC-7525B, "Stencil Design Guidelines", IPC, 2011, §3.2.1:
 *     aspect ratio  = W / T              (smallest aperture opening over foil thickness) > 1.5
 *     area ratio    = A_open / A_walls = A / (P·T) > 0.66
 *   For a rectangle L × W: AR = L·W / (2(L+W)·T); a circle of diameter D: AR = D / (4T).
 *   A rounded rectangle (corner radius r) keeps the same formula with its true area and perimeter:
 *     A = L·W − (4−π)·r²,  P = 2(L+W) − (8−2π)·r.
 *
 * Paste and solder volume: V_paste = A·T·TE (transfer efficiency TE measured by solder-paste inspection).
 * Metal volume fraction from the weight fraction by the rule of mixtures (paste = alloy powder + flux vehicle):
 *   φ = (w/ρ_m) / (w/ρ_m + (1−w)/ρ_f)
 * as in Kester, "Calculating Solder Paste Volume Percent" (knowledge-base note), which works the same split
 * from measured paste and flux densities. Alloy densities: Indium Corporation, Solder Alloy Directory 97720.
 */

export type Shape = 'rect' | 'circle';

export interface Aperture {
  shape: Shape;
  /** Opening length and width (m). For a circle, w is the diameter and l is ignored. */
  l: number;
  w: number;
  /** Corner radius (m), rectangle only; ≤ min(L, W)/2 */
  r: number;
}

export function openingArea(a: Aperture): number {
  if (a.shape === 'circle') return (Math.PI * a.w * a.w) / 4;
  return a.l * a.w - (4 - Math.PI) * a.r * a.r;
}

export function openingPerimeter(a: Aperture): number {
  if (a.shape === 'circle') return Math.PI * a.w;
  return 2 * (a.l + a.w) - (8 - 2 * Math.PI) * a.r;
}

/** Smallest opening dimension (governs the aspect ratio). */
export function minOpening(a: Aperture): number {
  return a.shape === 'circle' ? a.w : Math.min(a.l, a.w);
}

/** Area ratio A / (P·T). */
export function areaRatio(a: Aperture, t: number): number {
  return openingArea(a) / (openingPerimeter(a) * t);
}

/** Aspect ratio W_min / T. */
export function aspectRatio(a: Aperture, t: number): number {
  return minOpening(a) / t;
}

/** Metal volume fraction of the paste from its metal weight fraction and the two densities. */
export function metalVolumeFraction(wt: number, rhoMetal: number, rhoFlux: number): number {
  const vm = wt / rhoMetal;
  const vf = (1 - wt) / rhoFlux;
  return vm / (vm + vf);
}

/** Bulk paste density from the mixture (kg/m³). */
export function pasteDensity(wt: number, rhoMetal: number, rhoFlux: number): number {
  return 1 / (wt / rhoMetal + (1 - wt) / rhoFlux);
}

export interface PrintResult {
  area: number;
  perimeter: number;
  areaRatio: number;
  aspectRatio: number;
  /** Aperture (stencil opening) volume A·T */
  vAperture: number;
  /** Paste actually deposited, A·T·TE */
  vPaste: number;
  phiMetal: number;
  /** Solder volume left after reflow (flux gone) */
  vSolder: number;
  pasteMass: number;
  solderMass: number;
  /** Largest foil thickness that still meets the two IPC-7525 limits */
  tMaxArea: number;
  tMaxAspect: number;
}

export function printModel(a: Aperture, t: number, te: number, wt: number, rhoMetal: number, rhoFlux: number, arMin = 0.66, aspMin = 1.5): PrintResult {
  const area = openingArea(a);
  const perimeter = openingPerimeter(a);
  const vAperture = area * t;
  const vPaste = vAperture * te;
  const phiMetal = metalVolumeFraction(wt, rhoMetal, rhoFlux);
  return {
    area,
    perimeter,
    areaRatio: area / (perimeter * t),
    aspectRatio: minOpening(a) / t,
    vAperture,
    vPaste,
    phiMetal,
    vSolder: vPaste * phiMetal,
    pasteMass: vPaste * pasteDensity(wt, rhoMetal, rhoFlux),
    solderMass: vPaste * phiMetal * rhoMetal,
    tMaxArea: area / (perimeter * arMin),
    tMaxAspect: minOpening(a) / aspMin,
  };
}
