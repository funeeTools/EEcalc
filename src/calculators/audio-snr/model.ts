/**
 * Audio signal-to-noise ratio and dynamic range — equations only (pure, SI in/out; levels in dBu).
 *
 * Frequency weighting: IEC 61672-1:2013, eq. (E.1)–(E.6) and Table 3 (A and C weighting):
 *   C(f) = 20 lg[ f4²f² / ((f² + f1²)(f² + f4²)) ] − C1000
 *   A(f) = 20 lg[ f4²f⁴ / ((f² + f1²)(f² + f2²)^½(f² + f3²)^½(f² + f4²)) ] − A1000
 *   f1 = 20.598997 Hz, f2 = 107.65265 Hz, f3 = 737.86223 Hz, f4 = 12194.217 Hz,
 *   C1000 = −0.062 dB, A1000 = −2.000 dB.
 * White noise of density e (V/√Hz) measured over f_lo…f_hi through weighting W has the rms value
 *   v = e·√B_eff,  B_eff = ∫ |W(f)|² df   (equivalent noise bandwidth).
 *
 * Thermal (Johnson) noise of the source resistance: e² = 4kTR (J. B. Johnson, Phys. Rev. 32, 97, 1928;
 * H. Nyquist, Phys. Rev. 32, 110, 1928).
 *
 * Ideal N-bit quantiser, full-scale sine (peak = full scale): SNR = 10 lg(1.5·4^N) = 6.02N + 1.76 dB,
 * noise q²/12 spread evenly over 0…fs/2 (W. R. Bennett, “Spectra of quantized signals”, Bell Syst. Tech. J.
 * 27, 446, 1948; W. Kester, Analog Devices MT-001). TPDF dither of ±1 LSB adds q²/6, total q²/4 (+4.77 dB)
 * (S. P. Lipshitz, R. A. Wannamaker, J. Vanderkooy, “Quantization and dither: a theoretical survey”,
 * J. Audio Eng. Soc. 40(5), 355, 1992).
 *
 * Levels: 0 dBu = √0.6 V, 0 dBV = 1 V; 0 dBFS = the rms level of a full-scale sine (AES17).
 */

export const V_DBU = Math.sqrt(0.6);
export const K_BOLTZ = 1.380649e-23;
/** dBu − dBV for the same voltage: 20 lg(1/√0.6) = 2.2185 dB. */
export const DBU_MINUS_DBV = -20 * Math.log10(V_DBU);

export const F1 = 20.598997;
export const F2 = 107.65265;
export const F3 = 737.86223;
export const F4 = 12194.217;
export const A1000 = -2.0;
export const C1000 = -0.062;

export type Weighting = 'none' | 'A' | 'C';

/** Weighting in dB (IEC 61672-1). */
export function weightDb(w: Weighting, f: number): number {
  if (w === 'none') return 0;
  const f2 = f * f;
  if (w === 'C') return 20 * Math.log10((F4 * F4 * f2) / ((f2 + F1 * F1) * (f2 + F4 * F4))) - C1000;
  return 20 * Math.log10((F4 * F4 * f2 * f2) / ((f2 + F1 * F1) * Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) * (f2 + F4 * F4))) - A1000;
}

/** Power gain |W(f)|² of the weighting. */
export function weightPow(w: Weighting, f: number): number {
  return w === 'none' ? 1 : 10 ** (weightDb(w, f) / 10);
}

/** Equivalent noise bandwidth ∫|W|² df over [flo, fhi], Simpson’s rule in ln f (smooth integrand). */
export function noiseBandwidth(w: Weighting, flo: number, fhi: number, n = 4000): number {
  if (!(fhi > flo) || !(flo > 0)) return 0;
  if (w === 'none') return fhi - flo;
  const a = Math.log(flo);
  const b = Math.log(fhi);
  const h = (b - a) / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const u = a + i * h;
    const f = Math.exp(u);
    const y = weightPow(w, f) * f;
    s += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * y;
  }
  return (s * h) / 3;
}

export const dbuToV = (dbu: number) => V_DBU * 10 ** (dbu / 20);
export const vToDbu = (v: number) => 20 * Math.log10(v / V_DBU);
/** Power (V²) to dBu. */
export const p2dbu = (p: number) => 10 * Math.log10(p / 0.6);
export const dbu2p = (dbu: number) => 0.6 * 10 ** (dbu / 10);

/** Thermal noise density of a resistor, V²/Hz. */
export const johnson2 = (r: number, tempC: number) => 4 * K_BOLTZ * (tempC + 273.15) * r;

/** Ideal quantisation noise power (V²) over 0…fs/2 for a converter whose full-scale sine is lmaxDbu. */
export function quantNoise(lmaxDbu: number, bits: number, dither: 'none' | 'tpdf'): number {
  const pFs = dbu2p(lmaxDbu);
  return ((dither === 'tpdf' ? 3 : 1) * pFs) / (1.5 * 4 ** bits);
}

/** Ideal converter dynamic range, 6.02N + 1.76 dB (exact form). */
export const idealDr = (bits: number) => 10 * Math.log10(1.5 * 4 ** bits);

export interface ChainInputs {
  /** Signal level at the output / converter input, dBu */
  sigDbu: number;
  /** Clip level = 0 dBFS (full-scale sine), dBu */
  lmax: number;
  /** Total input-referred analog noise density, V²/Hz (amplifier + source) */
  eTot2: number;
  gainDb: number;
  /** Equivalent noise bandwidth of the measurement (with weighting), Hz */
  beff: number;
  adc: boolean;
  bits: number;
  fsamp: number;
  dither: 'none' | 'tpdf';
}

export interface ChainResult {
  /** Input-referred analog noise, V² (in band, weighted) */
  pIn: number;
  /** Analog noise at the output, V² */
  pAnalog: number;
  /** In-band, weighted quantisation noise, V² */
  pQ: number;
  pTot: number;
  noiseDbu: number;
  snr: number;
  dr: number;
}

export function chain(c: ChainInputs): ChainResult {
  const pIn = c.eTot2 * c.beff;
  const pAnalog = pIn * 10 ** (c.gainDb / 10);
  // quantisation noise is white over 0…fs/2: the measurement keeps the fraction B_eff/(fs/2)
  const pQ = c.adc ? (quantNoise(c.lmax, c.bits, c.dither) * c.beff) / (c.fsamp / 2) : 0;
  const pTot = pAnalog + pQ;
  const noiseDbu = p2dbu(pTot);
  return { pIn, pAnalog, pQ, pTot, noiseDbu, snr: c.sigDbu - noiseDbu, dr: c.lmax - noiseDbu };
}
