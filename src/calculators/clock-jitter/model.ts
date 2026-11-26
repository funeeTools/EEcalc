/**
 * Clock / data jitter — pure model (no DOM), times in seconds.
 *
 * Dual-Dirac total jitter at a bit error ratio (tail model):
 *   TJ(BER) = DJ(δδ) + 2·Q_BER·RJ,  Q_BER = Q⁻¹(BER/ρ_T), Q(x) = ½·erfc(x/√2)
 *   ρ_T = 1 reproduces IDT/Renesas AN-815 “Understanding Jitter Units” (Rev. A, 2014) Table 1, e.g. 2Q = 14.069 at
 *   10⁻¹²; ρ_T = 0.5 (errors only at the transitions of random NRZ data, as in the IEEE P802.3ae D3.2
 *   comment proposing Annex 48B, asanders_1_0901.pdf, 2001) gives 13.874. Background: Maxim HFAN-04.0.2 (rms ↔ pk-pk at a BER); R. Stephens, “Jitter analysis: the dual-Dirac model,
 *   RJ/DJ, and Q-scale”, Agilent Technologies white paper (2004); INCITS/T11 FC-MJSQ, Methodologies for
 *   Jitter and Signal Quality Specification (2004).
 * Combining sources: independent random (Gaussian) terms add in root-sum-square, dual-Dirac DJ terms add
 *   linearly (the δδ of a convolution is the sum of the δδ values) — Stephens 2004; FC-MJSQ.
 * Jitter-limited sampling SNR of a full-scale sine at f_in with rms clock jitter σ:
 *   SNR = −20·log10(2π·f_in·σ)   (W. Kester, ADI MT-008, 2008; B. Brannon, ADI AN-756, 2004).
 * Period and cycle-to-cycle jitter from TIE (definitions as in N. Da Dalt, A. Sheikholeslami, Understanding
 *   Jitter and Phase Noise, Cambridge Univ. Press, 2018): for uncorrelated (white) edge
 *   errors of rms σ, period P_n = x_{n+1} − x_n has σ√2 and C_n = P_{n+1} − P_n = x_{n+2} − 2x_{n+1} + x_n
 *   has σ√6 (variance of a linear combination of independent terms).
 *
 * erfc: power series for x < 2, Lentz continued fraction for x ≥ 2 (Abramowitz & Stegun 7.1.5 and 7.1.14;
 *   Numerical Recipes 3rd ed. §5.2, §6.2); relative accuracy ≈ 1e-15.
 */

const SQRT2 = Math.SQRT2;
const SQRT_PI = Math.sqrt(Math.PI);

/** Complementary error function, x ≥ 0 branch with reflection for x < 0. */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 2) {
    // erf(x) = 2/√π · Σ (−1)^n x^(2n+1) / (n! (2n+1))
    let term = x;
    let sum = x;
    const x2 = x * x;
    for (let n = 1; n < 200; n++) {
      term *= -x2 / n;
      const t = term / (2 * n + 1);
      sum += t;
      if (Math.abs(t) < 1e-17 * Math.abs(sum)) break;
    }
    return 1 - (2 / SQRT_PI) * sum;
  }
  if (x > 27) return 0;
  // erfc(x) = e^{−x²}/√π · 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + 2/(x + …))))), modified Lentz
  const tiny = 1e-300;
  let f = x;
  let C = x;
  let D = 0;
  for (let n = 1; n < 500; n++) {
    const a = n / 2;
    D = x + a * D;
    D = Math.abs(D) < tiny ? tiny : D;
    C = x + a / C;
    C = Math.abs(C) < tiny ? tiny : C;
    D = 1 / D;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (SQRT_PI * f);
}

/** Gaussian tail probability Q(x) = P(Z > x). */
export const qfunc = (x: number): number => 0.5 * erfc(x / SQRT2);

/** Inverse of Q for 0 < p < 1 (Newton on ln Q from an asymptotic start; ~1e-14 relative). */
export function qinv(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error('Q⁻¹ needs 0 < p < 1.');
  if (p > 0.5) return -qinv(1 - p);
  if (p === 0.5) return 0;
  // start: x ≈ √(−2 ln p − ln(−2π ln p)) for small p, or a linear guess near 0.5
  const L = -2 * Math.log(p);
  let x = p < 0.3 ? Math.sqrt(Math.max(L - Math.log(Math.PI * L), 0.01)) : (0.5 - p) * Math.sqrt(2 * Math.PI);
  const lp = Math.log(p);
  for (let i = 0; i < 60; i++) {
    const q = qfunc(x);
    const phi = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    // g(x) = ln Q(x) − ln p,  g′(x) = −φ(x)/Q(x)
    const g = Math.log(q) - lp;
    const step = g / (-phi / q);
    x -= step;
    if (Math.abs(step) < 1e-15 * Math.max(1, Math.abs(x))) break;
  }
  return x;
}

/**
 * Q at a BER with transition density ρ_T: Q = Q⁻¹(BER/ρ_T). ρ_T = 1 reproduces the published rms→pk-pk
 * multipliers of IDT/Renesas AN-815 Table 1 (2Q = 14.069 at 10⁻¹²); ρ_T = 0.5 counts errors only on the
 * transitions of random NRZ data (2Q = 13.874 at 10⁻¹²).
 */
export const qAt = (ber: number, rho = 1): number => qinv(ber / rho);

/** Dual-Dirac total jitter at a BER. */
export const totalJitter = (rj: number, dj: number, ber: number, rho = 1): number => dj + 2 * qAt(ber, rho) * rj;

/** BER at which the dual-Dirac model gives total jitter tj (tj > dj, rj > 0). */
export const berFor = (tj: number, rj: number, dj: number, rho = 1): number => rho * qfunc((tj - dj) / (2 * rj));

export interface JitterTerm {
  name: string;
  kind: 'rj' | 'dj';
  /** rms (RJ) or dual-Dirac δδ peak-to-peak (DJ), s */
  value: number;
  /** how many identical stages contribute this term */
  count: number;
}

/** RJ adds in root-sum-square (each of n stages contributes σ²), DJ adds linearly. */
export function budget(terms: JitterTerm[]): { rj: number; dj: number } {
  let v = 0;
  let dj = 0;
  for (const t of terms) {
    if (t.kind === 'rj') v += t.count * t.value * t.value;
    else dj += t.count * t.value;
  }
  return { rj: Math.sqrt(v), dj };
}

/** Jitter-limited SNR (dB) of a sine at fin sampled with rms jitter sigma. */
export const jitterSnr = (fin: number, sigma: number): number => -20 * Math.log10(2 * Math.PI * fin * sigma);

/** rms jitter that limits SNR to snrDb at fin. */
export const jitterForSnr = (fin: number, snrDb: number): number => 10 ** (-snrDb / 20) / (2 * Math.PI * fin);

/** Period and cycle-to-cycle rms jitter for white (uncorrelated) TIE of rms sigma. */
export const periodFromTie = (sigma: number) => ({ period: SQRT2 * sigma, c2c: Math.sqrt(6) * sigma });

/** Dual-Dirac edge PDF: two Gaussians of rms rj at ±dj/2, weight ½ each. */
export function dualDiracPdf(t: number, rj: number, dj: number): number {
  const g = (u: number) => Math.exp(-0.5 * (u / rj) ** 2) / (rj * Math.sqrt(2 * Math.PI));
  return 0.5 * (g(t - dj / 2) + g(t + dj / 2));
}

/**
 * Bathtub: BER when sampling at t inside a UI whose edges sit at 0 and ui, in the same tail convention as
 * TJ(BER): each edge contributes ρ_T·Q((distance − DJ/2)/RJ). Capped at 0.5.
 */
export function bathtub(t: number, ui: number, rj: number, dj: number, rho = 1): number {
  const tail = (d: number) => qfunc((d - dj / 2) / rj);
  return Math.min(0.5, rho * (tail(t) + tail(ui - t)));
}
