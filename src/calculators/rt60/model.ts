/**
 * Room reverberation time (RT60) — equations and material data only (pure, SI in/out).
 *
 * Statistical (diffuse-field) reverberation formulas, with air absorption 4mV:
 *   Sabine:            T = (24 ln10 / c) · V / (A + 4mV),            A = Σ S_i α_i
 *   Eyring (Norris):   T = (24 ln10 / c) · V / (−S ln(1 − ᾱ) + 4mV), ᾱ = A / S
 *   Millington–Sette:  T = (24 ln10 / c) · V / (−Σ S_i ln(1 − α_i) + 4mV)
 * 24 ln10 / c = 0.161 s/m at 20 °C. H. Kuttruff, Room Acoustics, 6th ed., CRC Press 2016, ch. 5
 * (Sabine, Eyring and Millington–Sette formulas, air term 4mV); W. C. Sabine, Collected Papers on
 * Acoustics, 1922; C. F. Eyring, J. Acoust. Soc. Am. 1, 217 (1930); G. Millington, J. Acoust. Soc. Am. 4,
 * 69 (1932); W. J. Sette, J. Acoust. Soc. Am. 4, 193 (1933).
 *
 * Air absorption: ISO 9613-1:1993, eq. (3)–(5) and Annex B (saturation pressure): pure-tone attenuation α (dB/m) from temperature,
 * relative humidity and pressure; the energy attenuation coefficient is m = α / (10 lg e) (1/m).
 * Speed of sound c = 343.2 √(T / 293.15 K) m/s (ISO 9613-1 eq. 1 basis).
 *
 * Diffuse-field limits: Schroeder frequency f_s = 2000 √(T/V) (M. R. Schroeder, K. H. Kuttruff, J. Acoust.
 * Soc. Am. 34, 76 (1962); Kuttruff ch. 3); critical distance r_c = √(A/16π) ≈ 0.057 √(V/T) for an
 * omnidirectional source (Kuttruff ch. 5).
 */

export const BANDS = [125, 250, 500, 1000, 2000, 4000] as const;
export const BAND_KEYS = ['a125', 'a250', 'a500', 'a1k', 'a2k', 'a4k'] as const;
export type BandKey = (typeof BAND_KEYS)[number];

export interface Material {
  id: string;
  label: string;
  /** Short name for the drawing */
  short: string;
  a: [number, number, number, number, number, number];
  src: 'niosh' | 'oc' | 'arm';
}

/**
 * Random-incidence (Sabine) absorption coefficients, octave bands 125 Hz – 4 kHz.
 * niosh: R. A. Hedeen, Compendium of Materials for Noise Control, NIOSH Publication 80-116, 1980,
 *        Table 5 “Absorption coefficients of general building materials and furnishings” (AIMA data).
 * oc:    Owens Corning, Fiberglas™ 703 and 705 Series Insulation product data sheet, pub. 10021736,
 *        ASTM C423, Type A mounting (against a solid backing).
 * arm:   Armstrong World Industries, UL Classified Acoustical Performance Summary, ASTM C423, E-400 mounting:
 *        Fine Fissured (listed NRC 0.55; its band values average 0.585) and Ultima (NRC 0.75).
 */
export const MATERIALS: Material[] = [
  { id: 'concrete', label: 'Concrete or terrazzo floor', short: 'concrete', a: [0.01, 0.01, 0.015, 0.02, 0.02, 0.02], src: 'niosh' },
  { id: 'vinyl', label: 'Linoleum / vinyl / cork tile on concrete', short: 'vinyl tile', a: [0.02, 0.03, 0.03, 0.03, 0.03, 0.02], src: 'niosh' },
  { id: 'woodFloor', label: 'Wood floor', short: 'wood floor', a: [0.15, 0.11, 0.1, 0.07, 0.06, 0.07], src: 'niosh' },
  { id: 'parquet', label: 'Wood parquet in asphalt on concrete', short: 'parquet', a: [0.04, 0.04, 0.07, 0.06, 0.06, 0.07], src: 'niosh' },
  { id: 'carpet', label: 'Carpet, heavy, on concrete', short: 'carpet', a: [0.02, 0.06, 0.14, 0.37, 0.6, 0.65], src: 'niosh' },
  { id: 'carpetPad', label: 'Carpet on foam rubber / hair-felt pad', short: 'carpet on pad', a: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73], src: 'niosh' },
  { id: 'marble', label: 'Marble or glazed tile', short: 'glazed tile', a: [0.01, 0.01, 0.01, 0.01, 0.02, 0.02], src: 'niosh' },
  { id: 'brick', label: 'Brick, unglazed', short: 'brick', a: [0.03, 0.03, 0.03, 0.04, 0.05, 0.07], src: 'niosh' },
  { id: 'brickPainted', label: 'Brick, unglazed, painted', short: 'painted brick', a: [0.01, 0.01, 0.02, 0.02, 0.02, 0.03], src: 'niosh' },
  { id: 'blockCoarse', label: 'Concrete block, coarse', short: 'coarse block', a: [0.36, 0.44, 0.31, 0.29, 0.39, 0.25], src: 'niosh' },
  { id: 'blockPainted', label: 'Concrete block, painted', short: 'painted block', a: [0.1, 0.05, 0.06, 0.07, 0.09, 0.08], src: 'niosh' },
  { id: 'plasterSmooth', label: 'Plaster, smooth, on brick or tile', short: 'plaster', a: [0.013, 0.015, 0.02, 0.03, 0.04, 0.05], src: 'niosh' },
  { id: 'plasterLath', label: 'Plaster, rough, on lath', short: 'plaster on lath', a: [0.14, 0.1, 0.06, 0.05, 0.04, 0.03], src: 'niosh' },
  { id: 'gypsum', label: 'Gypsum board ½″ on studs 16″ o.c.', short: 'plasterboard', a: [0.29, 0.1, 0.05, 0.04, 0.07, 0.09], src: 'niosh' },
  { id: 'plywood', label: 'Plywood panelling ⅜″', short: 'plywood', a: [0.28, 0.22, 0.17, 0.09, 0.1, 0.11], src: 'niosh' },
  { id: 'glass', label: 'Ordinary window glass', short: 'window glass', a: [0.35, 0.25, 0.18, 0.12, 0.07, 0.04], src: 'niosh' },
  { id: 'plateGlass', label: 'Large panes of heavy plate glass', short: 'plate glass', a: [0.18, 0.06, 0.04, 0.03, 0.02, 0.02], src: 'niosh' },
  { id: 'velourLight', label: 'Light velour, flat against wall', short: 'light curtain', a: [0.03, 0.04, 0.11, 0.17, 0.24, 0.35], src: 'niosh' },
  { id: 'velourMedium', label: 'Medium velour, draped to half area', short: 'draped curtain', a: [0.07, 0.31, 0.49, 0.75, 0.7, 0.6], src: 'niosh' },
  { id: 'velourHeavy', label: 'Heavy velour, draped to half area', short: 'heavy curtain', a: [0.14, 0.35, 0.55, 0.72, 0.7, 0.65], src: 'niosh' },
  { id: 'audience', label: 'Audience in upholstered seats (seating area)', short: 'audience', a: [0.6, 0.74, 0.88, 0.96, 0.93, 0.85], src: 'niosh' },
  { id: 'seatsEmpty', label: 'Empty cloth-upholstered seats (seating area)', short: 'empty seats', a: [0.49, 0.66, 0.8, 0.88, 0.82, 0.7], src: 'niosh' },
  { id: 'water', label: 'Water surface (pool)', short: 'water', a: [0.008, 0.008, 0.013, 0.015, 0.02, 0.025], src: 'niosh' },
  { id: 'tileFF', label: 'Mineral-fibre tile (Armstrong Fine Fissured)', short: 'ceiling tile', a: [0.3, 0.35, 0.59, 0.71, 0.69, 0.58], src: 'arm' },
  { id: 'tileHi', label: 'Mineral-fibre tile (Armstrong Ultima)', short: 'hi-NRC tile', a: [0.32, 0.33, 0.67, 0.97, 0.96, 0.93], src: 'arm' },
  { id: 'gf25', label: 'Glass-fibre board 25 mm (OC 703), on wall', short: '25 mm glass fibre', a: [0.05, 0.26, 0.63, 0.88, 0.97, 0.94], src: 'oc' },
  { id: 'gf50', label: 'Glass-fibre board 50 mm (OC 703), on wall', short: '50 mm glass fibre', a: [0.15, 0.71, 1.14, 1.16, 1.02, 1.0], src: 'oc' },
];

export const MATERIAL = Object.fromEntries(MATERIALS.map((m) => [m.id, m])) as Record<string, Material>;

export const SRC_NOTE: Record<Material['src'], string> = {
  niosh: 'NIOSH Compendium of Materials for Noise Control (1980), Table 5',
  oc: 'Owens Corning 703 data sheet, ASTM C423 Type A',
  arm: 'Armstrong acoustical summary, ASTM C423 E-400',
};

// ── air and sound speed ──────────────────────────────────────────────────────────

const T0 = 293.15;
const T01 = 273.16;
const PR = 101.325;

/** Pure-tone atmospheric attenuation, dB/m (ISO 9613-1:1993 eq. 3–5, Annex B). */
export function airAttenuation(f: number, tempC: number, rh: number, pKpa = PR): number {
  const T = tempC + 273.15;
  const pa = pKpa / PR;
  const psat = 10 ** (-6.8346 * (T01 / T) ** 1.261 + 4.6151);
  const h = (rh * psat) / pa;
  const frO = pa * (24 + (4.04e4 * h * (0.02 + h)) / (0.391 + h));
  const frN = pa * (T / T0) ** -0.5 * (9 + 280 * h * Math.exp(-4.17 * ((T / T0) ** (-1 / 3) - 1)));
  const f2 = f * f;
  return (
    8.686 *
    f2 *
    (1.84e-11 * (1 / pa) * (T / T0) ** 0.5 +
      (T / T0) ** -2.5 * ((0.01275 * Math.exp(-2239.1 / T)) / (frO + f2 / frO) + (0.1068 * Math.exp(-3352.0 / T)) / (frN + f2 / frN)))
  );
}

/** Energy attenuation coefficient m (1/m) from α in dB/m: m = α / (10 lg e). */
export const energyAtten = (alphaDb: number) => alphaDb / (10 * Math.LOG10E);

export const soundSpeed = (tempC: number) => 343.2 * Math.sqrt((tempC + 273.15) / T0);

/** 24 ln 10 / c: the “0.161” of Sabine’s formula. */
export const sabineK = (c: number) => (24 * Math.LN10) / c;

/** Largest α used inside a logarithm (Sabine coefficients above 1 are measurement artefacts there). */
export const ALPHA_LOG_MAX = 0.99;

export interface Patch {
  area: number;
  alpha: number;
}

export interface BandRt {
  /** Σ S·α, m² (Sabine absorption, coefficients as given) */
  a: number;
  /** ᾱ = A/S */
  abar: number;
  /** 4mV, m² */
  air: number;
  sabine: number;
  eyring: number;
  ms: number;
}

/** All three formulas for one band. */
export function bandRt(v: number, patches: Patch[], m: number, c: number): BandRt {
  const k = sabineK(c);
  const s = patches.reduce((t, p) => t + p.area, 0);
  const a = patches.reduce((t, p) => t + p.area * p.alpha, 0);
  const abar = a / s;
  const air = 4 * m * v;
  const sab = (k * v) / (a + air);
  const eyr = (k * v) / (-s * Math.log(1 - Math.min(abar, ALPHA_LOG_MAX)) + air);
  const msA = patches.reduce((t, p) => t - p.area * Math.log(1 - Math.min(p.alpha, ALPHA_LOG_MAX)), 0);
  const ms = (k * v) / (msA + air);
  return { a, abar, air, sabine: sab, eyring: eyr, ms };
}

export const schroederFreq = (t: number, v: number) => 2000 * Math.sqrt(t / v);
/** Critical distance for an omnidirectional source, from the Sabine absorption area A (incl. air). */
export const criticalDistance = (aTot: number) => Math.sqrt(aTot / (16 * Math.PI));
