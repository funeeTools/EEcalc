/**
 * Plated through via — pure model (no DOM, SI in/out).
 *
 * Geometry: drill diameter d, plating thickness t on the hole wall (finished hole d − 2t), via length h (board
 * thickness), pad diameter D_pad, antipad (plane clearance) diameter D_ap.
 *
 *  • Plated barrel cross-section (annulus between d/2 − t and d/2):  A = π·t·(d − t)
 *  • DC resistance:            R = ρ(T)·h / A, annealed copper ρ20 = 1.724e-8 Ω·m, α20 = 0.00393 /K (IEC 60028)
 *  • Barrel thermal resistance: θ = h / (k_Cu·A)  (1-D Fourier conduction; Y. Shen et al., "Thermal Modeling and
 *    Design Optimization of PCB Vias and Pads", IEEE Trans. Power Electron. 35(1), 882–900, 2020, eq. (2))
 *  • Current capacity: the barrel treated as a conductor of the same cross-section on the IPC-2221 chart,
 *      I = k·ΔT^0.44·A^0.725   (A in mil², k = 0.048 external / 0.024 internal; IPC-2221A Fig. 6-4)
 *    The charts have no via curve; treating the plating as a conductor of equal cross-section is the usual practice.
 *    D. Brooks & J. Adam ("PCB Trace and Via Currents and Temperatures: The Complete Analysis", 2nd ed., 2017)
 *    found that a via runs cooler than a trace of the same area, because it is short and heat-sunk by the copper
 *    it joins, so the chart value is on the safe side.
 *  • Impedance of the barrel in its antipad, coaxial approximation: Z = (η₀/2π√εr)·ln(D_ap/d) (Pozar, Microwave
 *    Engineering 4e, Table 2.1; H. Johnson, High-Speed Signal Propagation, 2003, §5.10).
 *  • Johnson & Graham single-via estimates (High-Speed Digital Design, 1993, §7.3–7.4, inches):
 *      C ≈ 1.41·εr·T·D_pad/(D_ap − D_pad) pF,    L ≈ 5.08·h·[ln(4h/d) + 1] nH (as printed)
 *    The barrel inductance shown first is the Rosa/Grover partial self-inductance 5.08·h·[ln(4h/d) − 1] nH (the
 *    printed "+1" overstates it; see the differential-via page). The C, L and Z functions are shared with that page.
 */

import { copperResistivity } from '@/physics/constants';
import { C0, johnsonC, johnsonL, partialL, zcoax } from '@/calculators/differential-via/model';
import { type Layer, ipcCurrent } from '@/calculators/trace-width-current/model';

export { C0, johnsonC, johnsonL, partialL, zcoax };

/** Plated barrel cross-section (m²): annulus of thickness t inside a drill d. */
export function barrelArea(d: number, t: number): number {
  return Math.PI * t * (d - t);
}

/** DC resistance of the barrel (Ω) at conductor temperature tc (°C). */
export function barrelR(d: number, t: number, h: number, tc: number): number {
  return (copperResistivity(tc) * h) / barrelArea(d, t);
}

/** Barrel conduction thermal resistance (K/W), copper conductivity k (W/m·K). */
export function barrelTheta(d: number, t: number, h: number, k: number): number {
  return h / (k * barrelArea(d, t));
}

/** Current for a temperature rise dT (°C), via-as-conductor on the IPC-2221 chart (A). */
export function viaCurrent(d: number, t: number, dT: number, layer: Layer): number {
  return ipcCurrent(barrelArea(d, t), dT, layer);
}

/** Propagation delay through the barrel (s), TEM in the dielectric. */
export function viaDelay(h: number, er: number): number {
  return (h * Math.sqrt(er)) / C0;
}
