/**
 * Free-space path loss and the Friis link equation (pure, SI in / SI out).
 *
 *  - H. T. Friis, "A Note on a Simple Transmission Formula," Proc. IRE 34 (1946) 254–256:
 *      Pr/Pt = Gt Gr (λ / 4πd)²
 *  - ITU-R P.525-4 (2019), "Calculation of free-space attenuation": basic transmission loss between
 *    isotropic antennas Lbf = 20 log10(4πd/λ) dB = 32.45 + 20 log10 f[MHz] + 20 log10 d[km].
 *  - Far-field (Fraunhofer) distance 2D²/λ: C. A. Balanis, Antenna Theory, 4th ed., §2.2.4;
 *    IEEE Std 145-2013 (definitions of terms for antennas).
 */

import { C_LIGHT } from '@/physics/constants';

export const C0 = C_LIGHT;
/** Free-space wave impedance (Ω), μ0·c */
export const ETA0 = 4e-7 * Math.PI * C_LIGHT;

/** FSPL (dB) = 20 log10(4π d f / c) */
export const fsplDb = (d: number, f: number) => 20 * Math.log10((4 * Math.PI * d * f) / C0);
/** Distance (m) at which the FSPL equals L dB (exact inverse). */
export const distanceForFspl = (L: number, f: number) => (C0 / (4 * Math.PI * f)) * 10 ** (L / 20);
/** Frequency (Hz) at which the FSPL over d equals L dB (exact inverse). */
export const freqForFspl = (L: number, d: number) => (C0 / (4 * Math.PI * d)) * 10 ** (L / 20);

export const dbmToW = (dbm: number) => 1e-3 * 10 ** (dbm / 10);
export const wToDbm = (w: number) => 10 * Math.log10(w / 1e-3);

export interface LinkInputs {
  ptDbm: number;
  gtDbi: number;
  grDbi: number;
  /** Other losses (cables, connectors, polarisation, body) in dB */
  lossDb: number;
  sensDbm: number;
  /** Required fade margin above sensitivity (dB) */
  marginReqDb: number;
}

export interface LinkResult {
  eirpDbm: number;
  prDbm: number;
  marginDb: number;
  /** Largest distance that still leaves the required margin (m) */
  maxRange: number;
  /** Power flux density at the receiver (W/m²) */
  pfd: number;
  /** RMS electric field strength at the receiver (V/m), far field */
  eField: number;
  /** Effective aperture of the receive antenna (m²) */
  aeRx: number;
}

export function link(d: number, f: number, l: LinkInputs): LinkResult {
  const L = fsplDb(d, f);
  const eirpDbm = l.ptDbm + l.gtDbi;
  const prDbm = eirpDbm + l.grDbi - L - l.lossDb;
  const budget = eirpDbm + l.grDbi - l.lossDb - l.sensDbm - l.marginReqDb;
  const lambda = C0 / f;
  // Losses are lumped with the link; the field quantities use EIRP (transmit side) only.
  const eirpW = dbmToW(eirpDbm);
  const pfd = eirpW / (4 * Math.PI * d * d);
  return {
    eirpDbm,
    prDbm,
    marginDb: prDbm - l.sensDbm,
    maxRange: distanceForFspl(budget, f),
    pfd,
    eField: Math.sqrt(pfd * ETA0),
    aeRx: (10 ** (l.grDbi / 10) * lambda * lambda) / (4 * Math.PI),
  };
}
