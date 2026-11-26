/**
 * Microvia current capacity — pure model (no DOM, SI in/out).
 *
 * There is no IPC chart for vias, let alone microvias. This page combines a convention with physics:
 *
 *  • Conductor: the plated barrel as a thin ring, A = π·t·(D − t) (D the drilled diameter at its narrowest, the target
 *    end of a tapered laser via; t the plating), or a copper-filled via, A = π·D²/4. Pads add no area.
 *  • IPC-2221 guardrail (convention, not a temperature prediction): the barrel rated as a conductor of the same area on
 *    the IPC-2221A Fig. 6-4 fit, I = k·ΔT^0.44·A^0.725 (A in mil², k = 0.048 external / 0.024 internal). N vias are rated
 *    by their combined area (the chart’s rule for parallel conductors), so capacity grows as N^0.725: conservative.
 *    The fit is shared with the Trace width (IPC-2221) page (trace-width-current/model.ts).
 *  • DC resistance ρ(T)·h/A per via (IEC 60028 annealed copper, ρ20 = 1.724 µΩ·cm, α = 0.00393 /K), N in parallel.
 *  • Barrel conduction rise: uniform Joule heating, both ends held at the pads: peak at mid-length
 *    ΔT = P_via·θ/8, θ = h/(k_Cu·A) (F. P. Incropera et al., Fundamentals of Heat and Mass Transfer, 7th ed., §3.5).
 *  • Feeding trace: the trace that brings the current, rated on the same IPC-2221 fit (the model of the Trace width
 *    page), usually the real limit for a microvia.
 */

import { RHO_CU_20, copperResistivity } from '@/physics/constants';
import { type Layer, MIL2, ipcArea, ipcCurrent, ipcRise } from '@/calculators/trace-width-current/model';

export { type Layer, MIL2, ipcArea, ipcCurrent, ipcRise, RHO_CU_20, copperResistivity };

export const K_CU = 385;

/** Copper cross-section of one microvia (m²). */
export function mvArea(d: number, t: number, filled: boolean): number {
  return filled ? (Math.PI * d * d) / 4 : Math.PI * t * (d - t);
}

/** IPC-2221 guardrail capacity of N microvias rated by their combined area (A). */
export function mvCapacity(n: number, d: number, t: number, filled: boolean, dT: number, layer: Layer): number {
  return ipcCurrent(n * mvArea(d, t, filled), dT, layer);
}

/** Smallest drill whose N vias carry i at dT on the guardrail (closed-form inverse of the area). */
export function mvMinDiameter(i: number, n: number, t: number, filled: boolean, dT: number, layer: Layer): number {
  const a = ipcArea(i, dT, layer) / n;
  return filled ? Math.sqrt((4 * a) / Math.PI) : a / (Math.PI * t) + t;
}

export interface MvPhysics {
  area: number;
  r: number;
  rVia: number;
  v: number;
  p: number;
  pVia: number;
  theta: number;
  dTcond: number;
  j: number;
}

/** DC resistance, drop, power and barrel conduction rise at current i through N vias, copper at tc (°C). */
export function mvPhysics(i: number, n: number, d: number, t: number, h: number, filled: boolean, tc: number): MvPhysics {
  const area = mvArea(d, t, filled);
  const rVia = (copperResistivity(tc) * h) / area;
  const iv = i / n;
  const pVia = iv * iv * rVia;
  const theta = h / (K_CU * area);
  return { area, rVia, r: rVia / n, v: i * (rVia / n), p: i * i * (rVia / n), pVia, theta, dTcond: (pVia * theta) / 8, j: iv / area };
}
