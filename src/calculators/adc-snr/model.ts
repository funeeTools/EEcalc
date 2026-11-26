/**
 * ADC signal-to-noise budget — pure model (no DOM), SI in/out, levels in dB.
 *
 * Quantization: SNR = 6.02·N + 1.76 dB for a full-scale sine, noise q²/12 spread uniformly over DC…fs/2
 *   (W. Kester, ADI MT-001, "Taking the mystery out of the infamous formula SNR = 6.02N + 1.76 dB", 2009).
 * Oversampling / processing gain: 10·log10(fs/(2·BW)) when the noise is white and the output is filtered to BW
 *   (MT-001).
 * Aperture / clock jitter: SNR = −20·log10(2π·f_in·t_j) for a sine at f_in and RMS jitter t_j, independent of
 *   amplitude; jitter sources add as root-sum-square (W. Kester, ADI MT-007 and MT-008, 2008/2009;
 *   B. Brannon, ADI AN-756, 2004).
 * ENOB: (SINAD − 1.76 dB + 20·log10(full scale / signal amplitude)) / 6.02 (W. Kester, ADI MT-003, 2009).
 * Combination: independent noise powers add (root-sum-square of RMS noise voltages).
 */

export interface AdcInputs {
  /** resolution, bits (may be fractional when solving) */
  n: number;
  /** sample rate, Hz */
  fs: number;
  /** signal bandwidth after digital filtering, Hz (≤ fs/2) */
  bw: number;
  /** input frequency, Hz */
  fin: number;
  /** input amplitude relative to full scale, dBFS (≤ 0) */
  ain: number;
  /** full-scale input range, V peak-to-peak */
  vfs: number;
  /** input-referred thermal noise over DC…fs/2, V rms (0 = none) */
  vn: number;
  /** clock and ADC aperture jitter, s rms */
  tjClk: number;
  tjAp: number;
  /** total harmonic distortion, dBc (null = not included) */
  thd: number | null;
}

export interface AdcResult {
  /** each SNR term in dBc at the given amplitude, before processing gain (Infinity when absent) */
  snrQ: number;
  snrTh: number;
  snrJ: number;
  /** processing gain, dB */
  pg: number;
  /** total SNR in the bandwidth BW, dBc and dBFS */
  snr: number;
  snrFs: number;
  /** SINAD (SNR with THD), dBc */
  sinad: number;
  enob: number;
  tj: number;
  /** noise contributions as fractions of the total noise power in BW */
  share: { q: number; th: number; j: number; thd: number };
  /** LSB size, V */
  lsb: number;
}

export const DB_PER_BIT = 20 * Math.log10(2); // 6.0206 dB
export const DB_1P5 = 10 * Math.log10(1.5); // 1.7609 dB

/** SNR (dB) from a noise-to-signal power ratio; no noise → +∞. */
const snrOf = (nsr: number) => (nsr > 0 ? -10 * Math.log10(nsr) : Infinity);

export function adcSnr(i: AdcInputs): AdcResult {
  const a = 10 ** (i.ain / 20); // amplitude as a fraction of full scale
  const vSig = (a * i.vfs) / (2 * Math.SQRT2); // V rms of the sine
  // Noise-to-signal power ratios over the Nyquist band DC…fs/2
  const nq = 1 / (1.5 * 4 ** i.n * a * a); // (q²/12)/(vSig²) with q = Vfs/2^N  →  10^(−(6.02N+1.76)/10)/a²
  const nth = i.vn > 0 ? (i.vn / vSig) ** 2 : 0;
  const tj = Math.hypot(i.tjClk, i.tjAp);
  const nj = (2 * Math.PI * i.fin * tj) ** 2;
  const bwRatio = (2 * i.bw) / i.fs; // fraction of the Nyquist band kept
  const nInBw = (nq + nth + nj) * bwRatio;
  const nThd = i.thd == null ? 0 : 10 ** (i.thd / 10);
  const snr = snrOf(nInBw);
  const sinad = snrOf(nInBw + nThd);
  const total = nInBw + nThd;
  return {
    snrQ: snrOf(nq),
    snrTh: snrOf(nth),
    snrJ: snrOf(nj),
    pg: 10 * Math.log10(1 / bwRatio),
    snr,
    snrFs: snr - i.ain,
    sinad,
    // MT-003 rounds the constants to 1.76 and 6.02; the exact 10·log10(1.5) and 20·log10(2) make an ideal
    // N-bit converter come out at exactly N effective bits.
    enob: (sinad - DB_1P5 - i.ain) / DB_PER_BIT,
    tj,
    share: { q: (nq * bwRatio) / total, th: (nth * bwRatio) / total, j: (nj * bwRatio) / total, thd: nThd / total },
    lsb: i.vfs / 2 ** i.n,
  };
}

/** Ideal quantization-limited SNR of a full-scale sine (MT-001), dB. */
export const idealSnr = (n: number) => DB_PER_BIT * n + DB_1P5;

/** Jitter-limited SNR (MT-008), dB. */
export const jitterSnr = (fin: number, tj: number) => -20 * Math.log10(2 * Math.PI * fin * tj);
