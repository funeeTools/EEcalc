/**
 * PCB trace current capacity — IPC-2221 empirical curve, plus DC resistance. Pure; SI in/out except where
 * noted (the IPC fit itself works in mil² and °C).
 *
 *   I = k · ΔT^0.44 · A^0.725         A in mil², ΔT in °C, I in A
 *   k = 0.048 (external conductors), 0.024 (internal conductors)
 *
 * IPC-2221A §6.2, Fig. 6-4 (conductor sizing charts, originally NBS report 4283, 1956, via MIL-STD-275 and
 * IPC-D-275; internal curves are the external ones derated by half). History and the IPC-2152 comparison:
 * D. Brooks, J. Adam, “Trace Currents and Temperatures Revisited”, UltraCAD, 2015.
 *
 * Resistance: R = ρ(T)·L/(W·t), ρ(T) = ρ20·(1 + α20·(T − 20 °C)) with annealed-copper ρ20 = 1.724e-8 Ω·m,
 * α20 = 0.00393 /°C (IEC 60028), evaluated at the conductor temperature T = Ta + ΔT.
 */

import { copperResistivity } from '@/physics/constants';

export const K_EXT = 0.048;
export const K_INT = 0.024;
export const B_DT = 0.44;
export const C_AREA = 0.725;
/** m² per mil² */
export const MIL2 = 25.4e-6 * 25.4e-6;

export type Layer = 'external' | 'internal';

export const kOf = (layer: Layer) => (layer === 'internal' ? K_INT : K_EXT);

/** Current (A) for a cross-section (m²) and temperature rise (°C). */
export function ipcCurrent(area: number, dT: number, layer: Layer): number {
  return kOf(layer) * dT ** B_DT * (area / MIL2) ** C_AREA;
}

/** Closed-form inverses — used by tests as an independent check of the numeric solve. */
export function ipcArea(i: number, dT: number, layer: Layer): number {
  return (i / (kOf(layer) * dT ** B_DT)) ** (1 / C_AREA) * MIL2;
}
export function ipcRise(i: number, area: number, layer: Layer): number {
  return (i / (kOf(layer) * (area / MIL2) ** C_AREA)) ** (1 / B_DT);
}

export interface TraceDc {
  tCond: number;
  rho: number;
  r: number;
  r20: number;
  vDrop: number;
  pLoss: number;
  /** current density A/m² */
  j: number;
}

export function traceDc(i: number, w: number, t: number, len: number, ta: number, dT: number): TraceDc {
  const area = w * t;
  const tCond = ta + dT;
  const rho = copperResistivity(tCond);
  const r = (rho * len) / area;
  const r20 = (copperResistivity(20) * len) / area;
  return { tCond, rho, r, r20, vDrop: i * r, pLoss: i * i * r, j: i / area };
}
