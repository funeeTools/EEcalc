/**
 * Permanent-magnet brushed DC motor, steady state — pure model (no DOM), SI in/out.
 *
 *   V = I·R + K·ω        (armature circuit, inductance irrelevant in steady state)
 *   T = K·(I − I₀)       (shaft torque; I₀ = no-load current, i.e. friction and iron loss as a constant torque K·I₀)
 *   K = K_t = K_e        in SI units (N·m/A = V·s/rad), K_v = 1/K (rad/s/V) = 60/(2π·K) rpm/V
 *
 * Sources: maxon motor, "Key information — maxon DC motor" (motor data and formulae: speed–torque line,
 * max efficiency η_max = (1 − √(I₀/I_A))², I_A = V/R); A. Hughes & B. Drury, Electric Motors and Drives,
 * 4th ed., Newnes 2013, ch. 3 (d.c. motor steady-state equations).
 */

export const RPM = (2 * Math.PI) / 60; // rad/s per rpm
export const ALPHA_CU = 0.00393; // copper resistance tempco referred to 20 °C (IEC 60028), 1/K

/** Terminal resistance at winding temperature tW (°C) from the datasheet value at 25 °C (α referred to 20 °C). */
export const windingResistance = (r25: number, tW: number): number => (r25 * (1 + ALPHA_CU * (tW - 20))) / (1 + ALPHA_CU * 5);

export interface MotorParams {
  /** supply (terminal) voltage, V */
  v: number;
  /** terminal resistance at the winding temperature, Ω */
  r: number;
  /** torque / back-EMF constant, N·m/A = V·s/rad */
  k: number;
  /** no-load current, A */
  i0: number;
}

export interface OperatingPoint {
  /** forward / backward rotation, or held at standstill by friction */
  regime: 'forward' | 'backward' | 'held';
  torque: number;
  current: number;
  /** rad/s */
  speed: number;
  pOut: number;
  pIn: number;
  pCu: number;
  efficiency: number;
}

export const currentAt = (m: MotorParams, torque: number): number => m.i0 + torque / m.k;
export const speedAt = (m: MotorParams, torque: number): number => (m.v - m.r * currentAt(m, torque)) / m.k;

/**
 * Operating point with Coulomb friction: the friction torque K·I₀ always opposes the motion, so it cannot drive
 * the shaft. Forward (ω > 0): I = I₀ + T/K. Backward (ω < 0, load overpowering the motor): I = −I₀ + T/K. If neither
 * branch is self-consistent, friction holds the shaft: ω = 0 and I = V/R.
 */
export function operatingPoint(m: MotorParams, torque: number): OperatingPoint {
  let regime: OperatingPoint['regime'] = 'forward';
  let current = currentAt(m, torque);
  let speed = speedAt(m, torque);
  if (!(speed > 0)) {
    const iBack = -m.i0 + torque / m.k;
    const wBack = (m.v - m.r * iBack) / m.k;
    if (wBack < 0) {
      regime = 'backward';
      current = iBack;
      speed = wBack;
    } else {
      regime = 'held';
      current = m.v / m.r;
      speed = 0;
    }
  }
  const pOut = torque * speed;
  const pIn = m.v * current;
  return { regime, torque, current, speed, pOut, pIn, pCu: current * current * m.r, efficiency: pIn > 0 && pOut > 0 ? pOut / pIn : 0 };
}

export interface MotorFigures {
  /** false when V ≤ I₀·R: the motor cannot overcome its own friction, so there is no characteristic */
  valid: boolean;
  /** no-load speed (rad/s), with I₀ */
  noLoadSpeed: number;
  /** stall (starting) current V/R */
  stallCurrent: number;
  /** stall torque at the shaft, K·(V/R − I₀) */
  stallTorque: number;
  /** speed–torque gradient R/K² (rad/s per N·m) */
  gradient: number;
  /** maximum output power and the torque where it occurs (half the stall torque) */
  maxPower: number;
  maxPowerTorque: number;
  /** maximum efficiency and its operating point (I = √(I₀·I_A)) */
  maxEfficiency: number;
  maxEffTorque: number;
  maxEffCurrent: number;
}

export function motorFigures(m: MotorParams): MotorFigures {
  const noLoadSpeed = (m.v - m.i0 * m.r) / m.k;
  const stallCurrent = m.v / m.r;
  const stallTorque = m.k * (stallCurrent - m.i0);
  const maxEffCurrent = Math.sqrt(m.i0 * stallCurrent);
  const ratio = m.i0 / stallCurrent;
  const valid = m.v > m.i0 * m.r && stallCurrent > 0;
  if (!valid)
    return { valid, noLoadSpeed: 0, stallCurrent: Math.max(stallCurrent, 0), stallTorque: 0, gradient: m.r / (m.k * m.k), maxPower: 0, maxPowerTorque: 0, maxEfficiency: 0, maxEffTorque: 0, maxEffCurrent: 0 };
  return {
    valid,
    noLoadSpeed,
    stallCurrent,
    stallTorque,
    gradient: m.r / (m.k * m.k),
    maxPower: (noLoadSpeed * stallTorque) / 4,
    maxPowerTorque: stallTorque / 2,
    maxEfficiency: ratio < 1 ? (1 - Math.sqrt(ratio)) ** 2 : 0,
    maxEffTorque: m.k * (maxEffCurrent - m.i0),
    maxEffCurrent,
  };
}

/** Friction sign: it opposes the motion (forward for ω ≥ 0, so ω = 0 gives the voltage/torque that just starts it). */
const fric = (speed: number) => (speed < 0 ? -1 : 1);

/** Terminal voltage needed for speed ω at shaft torque T (exact inverse of operatingPoint's moving branches). */
export const voltageFor = (k: number, r: number, i0: number, speed: number, torque: number): number => k * speed + r * (fric(speed) * i0 + torque / k);

/** Shaft torque at which the motor runs at speed ω on voltage V (exact inverse of the moving branches). */
export const torqueFor = (m: MotorParams, speed: number): number => m.k * ((m.v - m.k * speed) / m.r - fric(speed) * m.i0);
