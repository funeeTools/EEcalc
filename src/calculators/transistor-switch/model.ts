/**
 * Low-side transistor switch — equations only (pure, SI in/out).
 *
 * Load (resistor, relay coil, or LED + series resistor) from V_CC to the collector/drain; emitter/source to ground.
 *   Load current:  BJT    I_L = (V_CC − V_F − V_CE(sat)) / R_L
 *                  MOSFET I_L = (V_CC − V_F) / (R_L + R_DS(on))
 * BJT in hard saturation (Horowitz & Hill, Art of Electronics 3e §2.2.1 "transistor switch"; Sedra & Smith 7e,
 * BJT saturation mode): a forced gain β_F = I_C/I_B well below the minimum h_FE; datasheets specify V_CE(sat) and V_BE(sat)
 * at I_C/I_B = 10.  I_B = I_L/β_F,  R_B = (V_drive − V_BE(sat)) / I_B,  overdrive = h_FE,min / β_F.
 * MOSFET switching from gate charge (L. Balogh, "Fundamentals of MOSFET and IGBT gate driver circuits",
 * TI SLUA618, 2017, §3): Miller plateau V_pl ≈ V_th + I_L/g_fs; the drain voltage transition lasts while the gate
 * driver moves Q_gd at I_G = (V_drv − V_pl)/R_G,tot (turn-on) or V_pl/R_G,tot (turn-off):
 *   t_on ≈ Q_gd·R_G,tot/(V_drv − V_pl),  t_off ≈ Q_gd·R_G,tot/V_pl
 * Each edge is evaluated at the threshold that makes it slow: turn-on at V_th,max (highest plateau), turn-off at
 * V_th,min (lowest plateau). Switching loss: clamped inductive load ½·V·I·(t_on + t_off)·f (SLUA618; the current-rise
 * interval is not included, so an underestimate); resistive load, where V and I ramp together, ∫v·i = V·I·t/6 per
 * edge. Gate-drive power P_G = Q_g·V_drv·f_sw.
 */

export interface SatPoint {
  /** Collector current of the datasheet test point (A) */
  ic: number;
  vceSat: number;
  vbeSat: number;
}

export interface BjtSwitchPreset {
  sat: SatPoint[];
  /** Forced gain I_C/I_B of the datasheet saturation points */
  bf: number;
  /** Minimum h_FE at each test current (A) */
  hfe: [number, number][];
  icMax: number;
  vceo: number;
  ptot: number;
  note: string;
}

/** The datasheet point at or above `i` (conservative); the last point with `beyond` set when i exceeds all of them. */
export function pointFor<T extends { ic: number }>(pts: T[], i: number): { p: T; beyond: boolean } {
  const p = pts.find((x) => x.ic >= i * (1 - 1e-12));
  return p ? { p, beyond: false } : { p: pts[pts.length - 1], beyond: true };
}

/** Minimum h_FE around current i: the smaller of the datasheet test points just below and just above i (no interpolation). */
export function hfeFor(hfe: [number, number][], i: number): { hfe: number; at: number; beyond: boolean } {
  const above = hfe.find(([ic]) => ic >= i * (1 - 1e-12));
  const below = [...hfe].reverse().find(([ic]) => ic <= i * (1 + 1e-12));
  if (!above) return { hfe: below![1], at: below![0], beyond: true };
  if (!below || above[1] <= below[1]) return { hfe: above[1], at: above[0], beyond: false };
  return { hfe: below[1], at: below[0], beyond: false };
}

export const BJT_SWITCH: Record<string, BjtSwitchPreset | null> = {
  Custom: null,
  // onsemi 2N3903/2N3904 datasheet: V_CE(sat), V_BE(sat) max at I_C/I_B = 10; h_FE min at V_CE = 1 V
  '2N3904 (200 mA)': { sat: [{ ic: 10e-3, vceSat: 0.2, vbeSat: 0.85 }, { ic: 50e-3, vceSat: 0.3, vbeSat: 0.95 }], bf: 10, hfe: [[0.1e-3, 40], [1e-3, 70], [10e-3, 100], [50e-3, 60], [100e-3, 30]], icMax: 0.2, vceo: 40, ptot: 0.625, note: 'V_CE(sat) ≤ 0.2 V at 10 mA, ≤ 0.3 V at 50 mA (I_C/I_B = 10)' },
  // onsemi P2N2222A datasheet: V_CE(sat), V_BE(sat) max at I_C/I_B = 10; h_FE min (150 mA at V_CE = 1 V, 500 mA at 10 V)
  '2N2222A (600 mA)': { sat: [{ ic: 150e-3, vceSat: 0.3, vbeSat: 1.2 }, { ic: 500e-3, vceSat: 1.0, vbeSat: 2.0 }], bf: 10, hfe: [[0.1e-3, 35], [1e-3, 50], [10e-3, 75], [150e-3, 50], [500e-3, 40]], icMax: 0.6, vceo: 40, ptot: 0.625, note: 'V_CE(sat) ≤ 0.3 V at 150 mA, ≤ 1.0 V at 500 mA (I_C/I_B = 10)' },
};

export interface FetSwitchPreset {
  /** Maximum R_DS(on) at each specified V_GS: [V_GS, R] */
  rdson: [number, number][];
  vthMax: number;
  /** Datasheet minimum V_GS(th): the turn-off edge is slowest at the lowest plateau */
  vthMin: number;
  gfs: number;
  qg: number;
  qgd: number;
  rgInt: number;
  vdsMax: number;
  vgsMax: number;
  idMax: number;
  ptot: number;
  note: string;
}

export const FET_SWITCH: Record<string, FetSwitchPreset | null> = {
  Custom: null,
  // Alpha & Omega AO3400A: R_DS(on) max, V_th max, g_fs typ, Q_g/Q_gd typ at 4.5 V, R_g typ, P_D at 25 °C
  'AO3400A (30 V, SOT-23)': { rdson: [[2.5, 0.048], [4.5, 0.032], [10, 0.0265]], vthMax: 1.45, vthMin: 0.65, gfs: 33, qg: 6e-9, qgd: 1.8e-9, rgInt: 3, vdsMax: 30, vgsMax: 12, idMax: 5.7, ptot: 1.4, note: 'R_DS(on) ≤ 48/32/26.5 mΩ at 2.5/4.5/10 V' },
  // Infineon IRLML2502: R_DS(on) max, V_th max, g_fs min, Q_g/Q_gd typ at 5 V
  'IRLML2502 (20 V, SOT-23)': { rdson: [[2.5, 0.08], [4.5, 0.045]], vthMax: 1.2, vthMin: 0.6, gfs: 5.8, qg: 8e-9, qgd: 1.7e-9, rgInt: 0, vdsMax: 20, vgsMax: 12, idMax: 4.2, ptot: 1.25, note: 'R_DS(on) ≤ 80/45 mΩ at 2.5/4.5 V' },
  // Infineon IRLZ44N: R_DS(on) max, V_th max, g_fs min, Q_g/Q_gd max at 5 V; P_D in free air = (175 − 25) °C / 62 °C/W
  'IRLZ44N (55 V, TO-220)': { rdson: [[4, 0.035], [5, 0.025], [10, 0.022]], vthMax: 2, vthMin: 1, gfs: 21, qg: 48e-9, qgd: 25e-9, rgInt: 0, vdsMax: 55, vgsMax: 16, idMax: 47, ptot: 2.4, note: 'R_DS(on) ≤ 35/25/22 mΩ at 4/5/10 V; 2.4 W without a heatsink' },
};

/** R_DS(on) specified at the highest V_GS not above the drive; `unspecified` when the drive is below every spec point. */
export function rdsonAt(table: [number, number][], vdrv: number): { r: number; vgs: number; unspecified: boolean } {
  const ok = table.filter(([v]) => v <= vdrv * (1 + 1e-12));
  if (ok.length) {
    const [vgs, r] = ok[ok.length - 1];
    return { r, vgs, unspecified: false };
  }
  return { r: table[0][1], vgs: table[0][0], unspecified: true };
}

export const bjtLoadCurrent = (vcc: number, vf: number, vceSat: number, rl: number) => (vcc - vf - vceSat) / rl;
export const fetLoadCurrent = (vcc: number, vf: number, rl: number, rds: number) => (vcc - vf) / (rl + rds);
export const baseResistor = (vdrv: number, vbeSat: number, il: number, betaF: number) => ((vdrv - vbeSat) * betaF) / il;
export const forcedBeta = (vdrv: number, vbeSat: number, il: number, rb: number) => (il * rb) / (vdrv - vbeSat);

export const plateau = (vth: number, il: number, gfs: number) => vth + il / gfs;
export const tOn = (qgd: number, rTot: number, vdrv: number, vpl: number) => (qgd * rTot) / (vdrv - vpl);
export const tOff = (qgd: number, rTot: number, vpl: number) => (qgd * rTot) / vpl;
