/**
 * Zener shunt regulator — equations only (pure, SI in/out).
 *
 * Piecewise-linear zener model (Sedra & Smith, Microelectronic Circuits 7th ed., §4.4 "Operation in the
 * reverse breakdown region — zener diodes": in breakdown the zener is a battery V_Z0 in series with its
 * incremental resistance r_z):
 *   V_Z = V_Z0 + r_z·I_Z,   V_Z0 = V_ZT − r_z·I_ZT   (V_ZT is the datasheet voltage at the test current I_ZT)
 * Shunt regulator: Vin → R → node Vout; the zener and a load sinking I_L hang from the node.
 *   KCL: (Vin − Vout)/R = I_Z + I_L  →  I_Z = (Vin − V_Z0 − R·I_L)/(R + r_z)   while I_Z ≥ 0,
 *   otherwise the zener is off and Vout = Vin − R·I_L (the regulator has dropped out).
 * Line regulation ∂Vout/∂Vin = r_z/(R + r_z); load regulation ∂Vout/∂I_L = −R·r_z/(R + r_z).
 * Design (Sedra & Smith §4.4, shunt-regulator design; Horowitz & Hill, Art of Electronics 3e, zener regulators in ch. 1 and 9): R is the largest value that
 * still gives I_Z,min at the worst corner (lowest Vin, highest load, highest V_Z of the tolerance band):
 *   R = (Vin,min − V_Z,hi(I_Z,min)) / (I_Z,min + I_L,max)
 * and the zener's worst dissipation is at the highest Vin and lightest load.
 * Presets: Vishay 1N4728A–1N4761A datasheet (doc 85816, rev 2.7) and onsemi BZX84C2V4LT1 series (rev 24).
 */

export interface ZenerParams {
  /** Nominal zener voltage at the test current (V) */
  vz: number;
  /** Test current I_ZT (A) */
  izt: number;
  /** Dynamic resistance at I_ZT (Ω) */
  rz: number;
  /** Voltage tolerance (fraction, e.g. 0.05) */
  tol: number;
}

export interface OpPoint {
  iz: number;
  vout: number;
  ir: number;
  /** Zener conducting (in breakdown) */
  on: boolean;
}

/** Battery voltage V_Z0 of the linear model for a zener whose V_ZT is scaled by (1 + k·tol). */
export function vz0(p: ZenerParams, k: -1 | 0 | 1): number {
  return p.vz * (1 + k * p.tol) - p.rz * p.izt;
}

/** Operating point for a given input voltage, load current and series resistor. */
export function opPoint(vin: number, il: number, r: number, v0: number, rz: number): OpPoint {
  const iz = (vin - v0 - r * il) / (r + rz);
  if (iz >= 0) {
    const vout = v0 + rz * iz;
    return { iz, vout, ir: iz + il, on: true };
  }
  // Zener off: the resistor alone carries the load. A current-sink load cannot pull Vout below 0.
  const vout = Math.max(vin - r * il, 0);
  return { iz: 0, vout, ir: (vin - vout) / r, on: false };
}

/** Largest R that keeps I_Z ≥ izMin at (vinMin, ilMax) for the battery voltage v0. Non-positive: impossible. */
export function rForIzMin(vinMin: number, ilMax: number, izMin: number, v0: number, rz: number): number {
  return (vinMin - v0 - rz * izMin) / (izMin + ilMax);
}

/** Largest load current that keeps I_Z ≥ izMin at vinMin with resistor r. */
export function ilMaxFor(vinMin: number, r: number, izMin: number, v0: number, rz: number): number {
  return (vinMin - v0 - rz * izMin) / r - izMin;
}

export const lineReg = (r: number, rz: number) => rz / (r + rz);
export const outputResistance = (r: number, rz: number) => (r * rz) / (r + rz);

export interface ZenerPreset {
  vz: number;
  izt: number;
  rz: number;
  tol: number;
  pd: number;
  izk: number;
  part: string;
}

/** 1N47xxA (DO-41): V_Z, I_ZT, Z_ZT max, I_ZK from Vishay doc 85816; ±5 %; Ptot 1.3 W with leads at ambient 4 mm from the body. */
const n47 = (vz: number, izt: number, rz: number, izk: number, part: string): ZenerPreset => ({ vz, izt: izt * 1e-3, rz, tol: 0.05, pd: 1.3, izk: izk * 1e-3, part });
/** BZX84C (SOT-23): onsemi; I_ZT = 5 mA, Z_ZT max at 5 mA, knee point 1 mA; tolerance from the V_Z min/max columns; 250 mW on FR-5. */
const bzx = (vz: number, vmin: number, vmax: number, rz: number, part: string): ZenerPreset => ({ vz, izt: 5e-3, rz, tol: Math.round((Math.max(vmax - vz, vz - vmin) / vz) * 1e4) / 1e4, pd: 0.25, izk: 1e-3, part });

export const ZENER_PRESETS: Record<string, ZenerPreset | null> = {
  Custom: null,
  '1N4728A 3.3 V': n47(3.3, 76, 10, 1, '1N4728A'),
  '1N4730A 3.9 V': n47(3.9, 64, 9, 1, '1N4730A'),
  '1N4732A 4.7 V': n47(4.7, 53, 8, 1, '1N4732A'),
  '1N4733A 5.1 V': n47(5.1, 49, 7, 1, '1N4733A'),
  '1N4734A 5.6 V': n47(5.6, 45, 5, 1, '1N4734A'),
  '1N4735A 6.2 V': n47(6.2, 41, 2, 1, '1N4735A'),
  '1N4736A 6.8 V': n47(6.8, 37, 3.5, 1, '1N4736A'),
  '1N4738A 8.2 V': n47(8.2, 31, 4.5, 0.5, '1N4738A'),
  '1N4739A 9.1 V': n47(9.1, 28, 5, 0.5, '1N4739A'),
  '1N4740A 10 V': n47(10, 25, 7, 0.25, '1N4740A'),
  '1N4742A 12 V': n47(12, 21, 9, 0.25, '1N4742A'),
  '1N4744A 15 V': n47(15, 17, 14, 0.25, '1N4744A'),
  '1N4746A 18 V': n47(18, 14, 20, 0.25, '1N4746A'),
  '1N4749A 24 V': n47(24, 10.5, 25, 0.25, '1N4749A'),
  'BZX84C3V3 SOT-23': bzx(3.3, 3.1, 3.5, 95, 'BZX84C3V3'),
  'BZX84C5V1 SOT-23': bzx(5.1, 4.8, 5.4, 60, 'BZX84C5V1'),
  'BZX84C6V2 SOT-23': bzx(6.2, 5.8, 6.6, 10, 'BZX84C6V2'),
  'BZX84C12 SOT-23': bzx(12, 11.4, 12.7, 25, 'BZX84C12'),
};
