/** American Wire Gauge diameter and DC resistance. */

import { copperResistivity } from './constants';

/** ASTM B258: d(in) = 0.005 · 92^((36−n)/39). AWG 0000 is −3, 000 is −2, 00 is −1. */
export function awgDiameterM(awg: number): number {
  const n = Math.trunc(awg);
  return 0.005 * 92 ** ((36 - n) / 39) * 0.0254;
}

export function awgAreaM2(awg: number): number {
  const d = awgDiameterM(awg);
  return Math.PI * (d / 2) ** 2;
}

export function awgResistanceOhm(lengthM: number, awg: number, tempC = 25): number {
  const area = awgAreaM2(awg);
  if (area <= 0 || lengthM <= 0) return 0;
  return (copperResistivity(tempC) * lengthM) / area;
}

export function awgLabel(awg: number): string {
  const special: Record<number, string> = { [-3]: '4/0', [-2]: '3/0', [-1]: '2/0', 0: '1/0' };
  return special[awg] ?? String(awg);
}

export const AWG_CHOICES: number[] = Array.from({ length: 44 }, (_, i) => i - 3);
