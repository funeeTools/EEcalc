/**
 * Wire gauge — pure model (no DOM), SI in/out.
 *
 * American Wire Gauge (ASTM B258-18, Standard Specification for Standard Nominal Diameters and
 * Cross-Sectional Areas of AWG Sizes of Solid Round Wires Used as Electrical Conductors):
 *   d(n) = 0.005 in · 92^((36 − n)/39),   n = 0 for 1/0, −1 for 2/0, −2 for 3/0, −3 for 4/0.
 * (B258 tabulates these diameters rounded to 0.0001 in; this page uses the unrounded formula.)
 *
 * Resistivity at 20 °C and its temperature coefficient:
 *   annealed copper  ρ₂₀ = 1/58 Ω·mm²/m = 1.7241e-8 Ω·m, α₂₀ = 0.00393 /K   (IEC 60028, International
 *                    Annealed Copper Standard)
 *   aluminium 1350   ρ₂₀ = 0.028264 Ω·mm²/m (61.0 % IACS),  α₂₀ = 0.00403 /K   (IEC 60889 hard-drawn
 *                    aluminium wire; ASTM B230)
 *   ρ(T) = ρ₂₀·[1 + α₂₀·(T − 20 °C)]
 *
 * Metric sizes: IEC 60228 nominal cross-sections, with the standard’s maximum DC resistance at 20 °C of
 * class 2 (stranded) plain annealed copper conductors (Table 2 of IEC 60228:2004).
 *
 * Ampacity guide: NEC (NFPA 70-2017 Table 310.15(B)(16), renumbered 310.16 in NFPA 70-2020/2023), allowable
 * ampacities of insulated conductors rated up to 2000 V, not more than three current-carrying conductors in a
 * raceway, cable or earth, ambient 30 °C; 75 °C and 90 °C insulation columns, 14 AWG – 4/0 AWG only.
 */

export const INCH = 0.0254;

export function awgDiameter(n: number): number {
  return 0.005 * INCH * 92 ** ((36 - n) / 39);
}

export function awgFromDiameter(d: number): number {
  return 36 - (39 * Math.log(d / (0.005 * INCH))) / Math.log(92);
}

export const areaOf = (d: number) => (Math.PI * d * d) / 4;
export const diameterOf = (a: number) => Math.sqrt((4 * a) / Math.PI);
/** Circular mils: (d in mil)² */
export const cmil = (d: number) => (d / 25.4e-6) ** 2;

export type Material = 'cu' | 'al';
export const MATERIALS: Record<Material, { name: string; rho20: number; alpha: number }> = {
  cu: { name: 'Copper (annealed)', rho20: 1 / 58e6, alpha: 0.00393 },
  al: { name: 'Aluminium 1350', rho20: 0.028264e-6, alpha: 0.00403 },
};

export function resistivity(m: Material, tC: number): number {
  const p = MATERIALS[m];
  return p.rho20 * (1 + p.alpha * (tC - 20));
}

/** IEC 60228 nominal areas (mm²) and maximum DC resistance at 20 °C, class 2 plain copper (Ω/km). */
export const IEC60228: [number, number][] = [
  [0.5, 36.0], [0.75, 24.5], [1, 18.1], [1.5, 12.1], [2.5, 7.41], [4, 4.61], [6, 3.08], [10, 1.83], [16, 1.15],
  [25, 0.727], [35, 0.524], [50, 0.387], [70, 0.268], [95, 0.193], [120, 0.153], [150, 0.124], [185, 0.0991],
  [240, 0.0754], [300, 0.0601],
];
export const IEC_SIZES = IEC60228.map(([a]) => a);

/** AWG label: 0 → "1/0", −3 → "4/0", 12 → "12"; non-integers with one decimal. */
export function awgLabel(n: number): string {
  const k = Math.round(n);
  if (Math.abs(n - k) > 0.005) return n.toFixed(1).replace('-', '−');
  return k <= 0 && k >= -3 ? `${1 - k}/0` : String(k).replace('-', '−');
}

/**
 * NEC Table 310.16 allowable ampacity (A) for an integer AWG, [75 °C, 90 °C] columns, or null when the size
 * is outside the range carried here. Key: AWG number (1/0 = 0 … 4/0 = −3).
 */
const NEC_CU: Record<number, [number, number]> = {
  14: [20, 25], 12: [25, 30], 10: [35, 40], 8: [50, 55], 6: [65, 75], 4: [85, 95], 3: [100, 115], 2: [115, 130], 1: [130, 145],
  0: [150, 170], [-1]: [175, 195], [-2]: [200, 225], [-3]: [230, 260],
};
const NEC_AL: Record<number, [number, number]> = {
  12: [20, 25], 10: [30, 35], 8: [40, 45], 6: [50, 55], 4: [65, 75], 3: [75, 85], 2: [90, 100], 1: [100, 115],
  0: [120, 135], [-1]: [135, 150], [-2]: [155, 175], [-3]: [180, 205],
};
export function necAmpacity(m: Material, awg: number): [number, number] | null {
  if (!Number.isInteger(awg)) return null;
  return (m === 'cu' ? NEC_CU : NEC_AL)[awg] ?? null;
}
/** NEC 240.4(D): overcurrent-protection limit for small conductors (A), copper 14/12/10 AWG, aluminium 12/10 AWG. */
export function necSmallConductorLimit(m: Material, awg: number): number | null {
  const t: Record<number, number> = m === 'cu' ? { 14: 15, 12: 20, 10: 30 } : { 12: 15, 10: 25 };
  return t[awg] ?? null;
}

/** Resistance per metre of a round solid conductor of diameter d. */
export const rPerM = (m: Material, tC: number, d: number) => resistivity(m, tC) / areaOf(d);
