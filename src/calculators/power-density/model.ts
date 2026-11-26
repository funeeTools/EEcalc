/**
 * RF power density and exposure limits — pure model (no DOM), SI in/out.
 *
 * Far-field power density of a transmitter (FCC OET Bulletin 65, Ed. 97-01, 1997, eqs. (3) and (6)):
 *   S = F · EIRP / (4π r²),  EIRP = P·G
 *   F = 1 in free space; F = 2.56 = 1.6² for ground reflection (field reflection factor 0.6 adding in phase, OET-65 eq. (6)).
 * Plane-wave fields: E = √(S·η₀), H = E/η₀, η₀ = µ₀c = 376.730 313 668 Ω (CODATA 2018).
 * Field zones (ICNIRP 2020, Appendix A, as a rough guide): reactive near field r < λ/2π, radiative near field
 *   λ/2π … 2D²/λ, far field r > 2D²/λ (D = largest antenna dimension).
 * Limits:
 *   FCC 47 CFR §1.1310(e)(1), Table 1 (limits for maximum permissible exposure, 0.3–100 000 MHz),
 *     (i) occupational/controlled (6 min average) and (ii) general population/uncontrolled (30 min average).
 *   ICNIRP, “Guidelines for limiting exposure to electromagnetic fields (100 kHz to 300 GHz)”,
 *     Health Phys. 118(5):483–524, 2020, Table 5 (whole-body reference levels averaged over 30 min).
 */

export const C0 = 299_792_458;
export const ETA0 = 376.730313668;
export const GROUND_FACTOR = 2.56;

export type Standard = 'fcc' | 'icnirp';
export type ExposureClass = 'general' | 'occupational';

export interface Limit {
  /** power density limit (or plane-wave equivalent), W/m²; null when the standard gives none in this band */
  s: number | null;
  /** E and H field limits, V/m and A/m; null when not given in this band */
  e: number | null;
  h: number | null;
  /** averaging time, minutes */
  avgMin: number;
  /** the table row, as printed */
  band: string;
  /** limit expressed as an equivalent plane-wave power density (the binding quantity), W/m² */
  sEff: number;
}

const mk = (s: number | null, e: number | null, h: number | null, avgMin: number, band: string): Limit => {
  const cands = [s, e != null ? (e * e) / ETA0 : null, h != null ? h * h * ETA0 : null].filter((v): v is number => v != null);
  // FCC lists S (plane-wave equivalent) in every band, so S governs; ICNIRP below 30 MHz gives only E and H, and both must be met.
  return { s, e, h, avgMin, band, sEff: s != null ? s : Math.min(...cands) };
};

/** FCC 47 CFR §1.1310 Table 1 at f (Hz). mW/cm² × 10 = W/m². Null outside 0.3 MHz–100 GHz. */
export function fccLimit(f: number, cls: ExposureClass): Limit | null {
  const fm = f / 1e6;
  if (!(fm >= 0.3 && fm <= 100_000)) return null;
  if (cls === 'occupational') {
    if (fm < 3) return mk(1000, 614, 1.63, 6, '0.3–3.0 MHz');
    if (fm < 30) return mk(9000 / (fm * fm), 1842 / fm, 4.89 / fm, 6, '3.0–30 MHz');
    if (fm < 300) return mk(10, 61.4, 0.163, 6, '30–300 MHz');
    if (fm < 1500) return mk(fm / 30, null, null, 6, '300–1500 MHz');
    return mk(50, null, null, 6, '1500–100 000 MHz');
  }
  if (fm < 1.34) return mk(1000, 614, 1.63, 30, '0.3–1.34 MHz');
  if (fm < 30) return mk(1800 / (fm * fm), 824 / fm, 2.19 / fm, 30, '1.34–30 MHz');
  if (fm < 300) return mk(2, 27.5, 0.073, 30, '30–300 MHz');
  if (fm < 1500) return mk(fm / 150, null, null, 30, '300–1500 MHz');
  return mk(10, null, null, 30, '1500–100 000 MHz');
}

/** ICNIRP 2020 Table 5 at f (Hz), W/m². Null outside 100 kHz–300 GHz. */
export function icnirpLimit(f: number, cls: ExposureClass): Limit | null {
  const fm = f / 1e6;
  if (!(fm >= 0.1 && fm <= 300_000)) return null;
  if (cls === 'occupational') {
    if (fm <= 30) return mk(null, 660 / fm ** 0.7, 4.9 / fm, 30, '0.1–30 MHz');
    if (fm <= 400) return mk(10, 61, 0.16, 30, '>30–400 MHz');
    if (fm <= 2000) return mk(fm / 40, 3 * fm ** 0.5, 0.008 * fm ** 0.5, 30, '>400–2000 MHz');
    return mk(50, null, null, 30, '>2–300 GHz');
  }
  if (fm <= 30) return mk(null, 300 / fm ** 0.7, 2.2 / fm, 30, '0.1–30 MHz');
  if (fm <= 400) return mk(2, 27.7, 0.073, 30, '>30–400 MHz');
  if (fm <= 2000) return mk(fm / 200, 1.375 * fm ** 0.5, 0.0037 * fm ** 0.5, 30, '>400–2000 MHz');
  return mk(10, null, null, 30, '>2–300 GHz');
}

export function limitOf(std: Standard, f: number, cls: ExposureClass): Limit | null {
  return std === 'fcc' ? fccLimit(f, cls) : icnirpLimit(f, cls);
}

/**
 * Exposure as a fraction of the limit (power ratio). FCC: S / S_lim (S is the plane-wave equivalent in every
 * band). ICNIRP: S / S_lim where an S level exists (far field: one quantity suffices, Table 5 note 5a/6a);
 * below 30 MHz both E and H must be met (note 4), so the larger of (E/E_lim)² and (H/H_lim)².
 */
export function exposureRatio(lim: Limit, s: number): number {
  if (lim.s != null) return s / lim.s;
  const e = Math.sqrt(s * ETA0);
  const h = e / ETA0;
  return Math.max(lim.e != null ? (e / lim.e) ** 2 : 0, lim.h != null ? (h / lim.h) ** 2 : 0);
}

/** Time-averaged power density at r, W/m². eirp in W, factor = 1 or 2.56, duty 0…1. */
export function density(eirp: number, r: number, factor: number, duty: number): number {
  return (factor * duty * eirp) / (4 * Math.PI * r * r);
}

/** Distance at which the density equals s. */
export function distanceFor(eirp: number, s: number, factor: number, duty: number): number {
  return Math.sqrt((factor * duty * eirp) / (4 * Math.PI * s));
}

/** EIRP that gives density s at r. */
export function eirpFor(s: number, r: number, factor: number, duty: number): number {
  return (s * 4 * Math.PI * r * r) / (factor * duty);
}

export const fieldsOf = (s: number) => {
  const e = Math.sqrt(s * ETA0);
  return { e, h: e / ETA0 };
};

export interface Zones {
  lambda: number;
  /** reactive near-field boundary λ/2π */
  reactive: number;
  /** Fraunhofer distance 2D²/λ (0 when D is not given) */
  fraunhofer: number;
}

export function zones(f: number, d: number): Zones {
  const lambda = C0 / f;
  return { lambda, reactive: lambda / (2 * Math.PI), fraunhofer: d > 0 ? (2 * d * d) / lambda : 0 };
}
