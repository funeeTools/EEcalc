/** Physical constants and copper geometry conversions. */

export const MU0 = 4e-7 * Math.PI;
export const EPS0 = 8.854187817e-12;
export const C_LIGHT = 299_792_458;

/** Annealed copper at 20 °C (IEC 60028) */
export const RHO_CU_20 = 1.724e-8;
export const TEMPCO_CU = 0.00393;

/** 1 oz/ft² electrodeposited copper ≈ 1.37 mil ≈ 34.8 µm */
export const COPPER_OZ_TO_M = 34.8e-6;

/** Typical FR-4 */
export const ER_FR4 = 4.5;

export function copperResistivity(tempC: number): number {
  return RHO_CU_20 * (1 + TEMPCO_CU * (tempC - 20));
}

export function copperThicknessM(ozPerFt2: number): number {
  return Math.max(ozPerFt2, 0) * COPPER_OZ_TO_M;
}

/** Copper skin depth. Returns a large value at DC so callers can skip AC correction. */
export function skinDepthM(freqHz: number, tempC = 25): number {
  const f = Math.max(freqHz, 0);
  if (f < 1) return 1e3;
  return Math.sqrt(copperResistivity(tempC) / (Math.PI * f * MU0));
}
