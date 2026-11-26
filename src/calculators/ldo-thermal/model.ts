/**
 * Linear (LDO) regulator thermal model. Pure, SI in / SI out (temperatures in °C).
 *
 * The pass element drops Vin − Vout at the load current; the ground (quiescent) current flows from the
 * input to ground through the regulator. Steady-state junction temperature with a single junction-to-
 * ambient thermal resistance:
 *
 *   Pd = (Vin − Vout)·Iout + Vin·Ignd          (TI SLVA118A eq. 3–5: PD = PI − PO, plus PQ = VI·IQ)
 *   Tj = Ta + Pd·θJA                           (SLVA118A eq. 6–7; θJA as defined in JESD51-2A / TI SPRA953)
 *   η  = Vout·Iout / (Vin·(Iout + Ignd))       (SLVA118A eq. 16)
 */

export interface LdoInputs {
  vin: number;
  vout: number;
  iout: number;
  /** Ground / quiescent current, A */
  ignd: number;
  /** Junction-to-ambient thermal resistance, °C/W */
  thetaJA: number;
  /** Ambient, °C */
  ta: number;
  /** Dropout voltage (optional): below Vout + V_DO the output follows Vin − V_DO */
  vdo?: number;
}

export interface LdoOutputs {
  pLoad: number;
  pGnd: number;
  pd: number;
  tj: number;
  pout: number;
  iin: number;
  eff: number;
}

/** Actual output voltage: the set point, or Vin − V_DO when the regulator is in dropout. */
export function voutActual(p: LdoInputs): number {
  return p.vdo && p.vdo > 0 ? Math.max(Math.min(p.vout, p.vin - p.vdo), 0) : p.vout;
}

export function ldoPower(p: LdoInputs): LdoOutputs {
  const vo = voutActual(p);
  const pLoad = (p.vin - vo) * p.iout;
  const pGnd = p.vin * p.ignd;
  const pd = pLoad + pGnd;
  const pout = vo * p.iout;
  const iin = p.iout + p.ignd;
  return { pLoad, pGnd, pd, tj: p.ta + pd * p.thetaJA, pout, iin, eff: iin > 0 ? pout / (p.vin * iin) : 0 };
}

/** Largest load current that keeps Tj ≤ tjLim (may be negative when the ground current alone is too much). */
export function maxIout(p: LdoInputs, tjLim: number): number {
  return ((tjLim - p.ta) / p.thetaJA - p.vin * p.ignd) / (p.vin - voutActual(p));
}

/** Highest ambient for Tj ≤ tjLim. */
export function maxTa(p: LdoInputs, tjLim: number): number {
  return tjLim - ldoPower(p).pd * p.thetaJA;
}

/** Highest input voltage for Tj ≤ tjLim: (Vin − Vout)·I + Vin·Ignd = (tjLim − Ta)/θJA (regulating, i.e. above dropout). */
export function maxVin(p: LdoInputs, tjLim: number): number {
  return ((tjLim - p.ta) / p.thetaJA + p.vout * p.iout) / (p.iout + p.ignd);
}
