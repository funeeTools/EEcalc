/**
 * MOSFET DC operating point — equations only (pure, SI in/out).
 *
 * Square-law (Shichman–Hodges) model as in SPICE level 1 (H. Shichman, D. A. Hodges, "Modeling and simulation
 * of insulated-gate field-effect transistor switching circuits", IEEE JSSC 3(3), 1968; L. W. Nagel, SPICE2,
 * UCB/ERL M520, 1975; Sedra & Smith, Microelectronic Circuits 7e, §5.2–5.4), with overdrive V_ov = V_GS − V_th:
 *   cutoff     V_ov ≤ 0:          I_D = 0
 *   triode     0 ≤ V_DS < V_ov:   I_D = K·(V_ov·V_DS − V_DS²/2)·(1 + λV_DS)
 *   saturation V_DS ≥ V_ov:       I_D = (K/2)·V_ov²·(1 + λV_DS)
 * K = µC_ox·W/L (A/V²). Fits from a datasheet: one point (I_D1 at V_GS1) gives K = 2I_D1/(V_GS1 − V_th)²;
 * a forward transconductance g_fs at I_D1 gives K = g_fs²/(2I_D1) (from g_m = √(2K·I_D) in saturation).
 *
 * Bias circuit (NPN-style frame; a P-channel is solved with voltages measured down from V_DD):
 *   V_DD → R_D → drain; source → R_S → ground; gate at V_G (applied directly, or from an R1/R2 divider: no gate current).
 *   V_GS = V_G − I_D·R_S,  V_DS = V_DD − I_D·(R_D + R_S),  I_D = f(V_GS, V_DS)
 * is one equation in I_D whose residual is strictly decreasing on [0, V_DD/(R_D+R_S)], so Brent's method finds the
 * unique root.
 */

import { brent } from '@/core/calc/solve';

export type Region = 'cutoff' | 'triode' | 'saturation';

export interface Fet {
  vth: number;
  k: number;
  lambda: number;
}

export function idOf(vgs: number, vds: number, f: Fet): number {
  const vov = vgs - f.vth;
  if (vov <= 0 || vds <= 0) return 0;
  const cl = 1 + f.lambda * vds;
  return vds < vov ? f.k * (vov * vds - (vds * vds) / 2) * cl : (f.k / 2) * vov * vov * cl;
}

export function regionOf(vgs: number, vds: number, f: Fet): Region {
  const vov = vgs - f.vth;
  if (vov <= 0) return 'cutoff';
  return vds < vov ? 'triode' : 'saturation';
}

/** Small-signal g_m = ∂I_D/∂V_GS and g_ds = ∂I_D/∂V_DS at (vgs, vds). */
export function smallSignal(vgs: number, vds: number, f: Fet): { gm: number; gds: number } {
  const vov = vgs - f.vth;
  if (vov <= 0 || vds < 0) return { gm: 0, gds: 0 };
  const cl = 1 + f.lambda * vds;
  if (vds < vov) {
    return { gm: f.k * vds * cl, gds: f.k * (vov - vds) * cl + f.k * (vov * vds - (vds * vds) / 2) * f.lambda };
  }
  return { gm: f.k * vov * cl, gds: (f.k / 2) * vov * vov * f.lambda };
}

export interface Circuit {
  vdd: number;
  vg: number;
  rd: number;
  rs: number;
}

export interface OpPoint {
  id: number;
  vgs: number;
  vds: number;
  region: Region;
}

export function solveOp(c: Circuit, f: Fet): OpPoint {
  const rt = c.rd + c.rs;
  const at = (id: number): OpPoint => {
    const vgs = c.vg - id * c.rs;
    const vds = c.vdd - id * rt;
    return { id, vgs, vds, region: regionOf(vgs, vds, f) };
  };
  if (!(rt > 0)) return at(idOf(c.vg, c.vdd, f));
  const g = (id: number) => idOf(c.vg - id * c.rs, c.vdd - id * rt, f) - id;
  if (g(0) <= 0) return at(0);
  // The root also has V_GS > V_th, i.e. I_D < (V_G − V_th)/R_S: a tight bracket keeps Brent's absolute tolerance relative.
  const hi = c.rs > 0 ? Math.min(c.vdd / rt, (c.vg - f.vth) / c.rs) : c.vdd / rt;
  const id = brent(g, 0, hi, hi * 1e-14);
  return at(id);
}

/** Overdrive V_ov ≥ 0 at which the device carries `id` with `vds` across it (vds > 0, id > 0). */
export function vovFor(id: number, vds: number, f: Fet): number {
  const hi = id / (f.k * vds * (1 + f.lambda * vds)) + vds + Math.sqrt((2 * id) / f.k) + 1;
  return brent((v) => idOf(f.vth + v, vds, f) - id, 0, hi, hi * 1e-15);
}

/**
 * Drain current when V_DS is held at `vds` and the gate sits at vg above a source resistor rs
 * (root of I = f(vg − I·rs, vds)); 0 when the gate is below threshold.
 */
export function idAtVds(vg: number, rs: number, vds: number, f: Fet): number {
  const top = idOf(vg, vds, f);
  if (!(top > 0)) return 0;
  if (!(rs > 0)) return top;
  const hi = Math.min(top, (vg - f.vth) / rs);
  return brent((i) => idOf(vg - i * rs, vds, f) - i, 0, hi, hi * 1e-14);
}

export const kFromPoint = (id1: number, vgs1: number, vth: number) => (2 * id1) / (vgs1 - vth) ** 2;
export const kFromGfs = (gfs: number, id1: number) => (gfs * gfs) / (2 * id1);

export interface FetPreset {
  type: 'n' | 'p';
  vth: number;
  vthMin: number;
  vthMax: number;
  gfs: number;
  idG: number;
  vdsMax: number;
  vgsMax: number;
  idMax: number;
  ptot: number;
  note: string;
}

/**
 * Datasheet values: onsemi 2N7000/2N7002/NDS7002A (rev. 13), Alpha & Omega AO3400A, Infineon IRLML2502 and
 * IRLZ44N. g_fs is the typical value where given, else the minimum; V_th is the typical value, or the
 * midpoint of min and max when no typical is given.
 */
export const FET_PRESETS: Record<string, FetPreset | null> = {
  Custom: null,
  '2N7000 (TO-92)': { type: 'n', vth: 2.1, vthMin: 0.8, vthMax: 3, gfs: 0.32, idG: 0.2, vdsMax: 60, vgsMax: 20, idMax: 0.2, ptot: 0.4, note: 'g_fs 320 mS typ at 200 mA; V_th 0.8/2.1/3.0 V' },
  'AO3400A (SOT-23)': { type: 'n', vth: 1.05, vthMin: 0.65, vthMax: 1.45, gfs: 33, idG: 5.7, vdsMax: 30, vgsMax: 12, idMax: 5.7, ptot: 1.4, note: 'g_fs 33 S typ at 5.7 A; V_th 0.65/1.05/1.45 V' },
  'IRLML2502 (SOT-23)': { type: 'n', vth: 0.9, vthMin: 0.6, vthMax: 1.2, gfs: 5.8, idG: 4, vdsMax: 20, vgsMax: 12, idMax: 4.2, ptot: 1.25, note: 'g_fs ≥ 5.8 S at 4 A (minimum); V_th 0.6–1.2 V' },
  'IRLZ44N (TO-220)': { type: 'n', vth: 1.5, vthMin: 1, vthMax: 2, gfs: 21, idG: 25, vdsMax: 55, vgsMax: 16, idMax: 47, ptot: 110, note: 'g_fs ≥ 21 S at 25 A (minimum); V_th 1.0–2.0 V; 110 W at T_C = 25 °C' },
};
