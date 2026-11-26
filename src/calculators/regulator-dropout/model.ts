/**
 * Linear-regulator headroom (dropout) check — equations only (pure, SI in/out).
 *
 * A linear regulator stays in regulation while its input exceeds the output by at least the dropout
 * voltage of its pass element at the present load current:
 *
 *   V_in,req = V_out + V_DO(I_out)                       (TI SLVA079 “Understanding the terms and definitions
 *                                                          of LDO voltage regulators”, dropout definition)
 *
 * Dropout models (SLVA079 §“Dropout voltage”; Horowitz & Hill, The Art of Electronics 3e, ch. 9 on LDO pass elements):
 *   fixed  — V_DO constant (NPN / Darlington-pass regulators such as the 78xx and LM317: about 2–3 V)
 *   rdson  — V_DO = R_DS(on)·I (PMOS / NMOS pass LDO in the linear region; R_DS(on) = V_DO,spec / I_spec)
 *   points — straight line through two data-sheet points (bipolar LDOs, whose V_CE(sat) rises with load)
 *
 * The worst-case input is the lowest instantaneous input: the ripple valley of a DC supply at low line
 * (V_in·(1 − tol) − V_pp/2), or a battery at its end-of-discharge voltage. Dissipation and efficiency come
 * from the LDO thermal model (SLVA118A): P_D = (V_in − V_out)·I_out + V_in·I_GND.
 */

export type DropModel = 'fixed' | 'rdson' | 'points';

export interface DropParams {
  model: DropModel;
  /** fixed: the dropout voltage */
  vdo: number;
  /** rdson: on-resistance of the pass device, Ω */
  ron: number;
  i1: number;
  vdo1: number;
  i2: number;
  vdo2: number;
}

/** Dropout at load current i (≥ 0). */
export function vdoAt(p: DropParams, i: number): number {
  switch (p.model) {
    case 'fixed':
      return p.vdo;
    case 'rdson':
      return p.ron * i;
    case 'points':
      return Math.max(p.vdo1 + ((i - p.i1) * (p.vdo2 - p.vdo1)) / (p.i2 - p.i1), 0);
  }
}

/** d V_DO / d I (0 for a fixed dropout). */
export function vdoSlope(p: DropParams): number {
  return p.model === 'fixed' ? 0 : p.model === 'rdson' ? p.ron : (p.vdo2 - p.vdo1) / (p.i2 - p.i1);
}

/**
 * Largest load current whose dropout is x (inverse of vdoAt on its rising branch). null when the dropout
 * does not depend on the load (fixed) or x is below the zero-current dropout.
 */
export function iForVdo(p: DropParams, x: number): number | null {
  if (p.model === 'fixed') return null;
  if (p.model === 'rdson') return p.ron > 0 && x >= 0 ? x / p.ron : null;
  const k = vdoSlope(p);
  if (!(k > 0)) return null;
  const i = p.i1 + (x - p.vdo1) / k;
  // the line is clamped at 0 V below its zero crossing: a target there is not reachable
  return i >= 0 && Math.abs(vdoAt(p, i) - x) <= 1e-9 * Math.max(1, Math.abs(x)) ? i : null;
}

export interface Source {
  /** Lowest instantaneous input (headroom check) */
  vMin: number;
  /** Typical input (efficiency) */
  vNom: number;
  /** Highest input (worst dissipation) */
  vMax: number;
}

/** DC supply: nominal (average) vin, ± tolerance (fraction), peak-to-peak ripple. */
export function dcSource(vin: number, tol: number, ripple: number): Source {
  return { vMin: vin * (1 - tol) - ripple / 2, vNom: vin, vMax: vin * (1 + tol) + ripple / 2 };
}

/** n cells in series: full, nominal and end-of-discharge voltages per cell. */
export function batterySource(n: number, vFull: number, vNom: number, vEnd: number): Source {
  return { vMin: n * vEnd, vNom: n * vNom, vMax: n * vFull };
}

/** Headroom margin: lowest input minus what the regulator needs. */
export function margin(vMin: number, vout: number, vdo: number): number {
  return vMin - vout - vdo;
}
