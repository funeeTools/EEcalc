/**
 * Current-sense shunt + sense amplifier + ADC — equations only (pure, SI in/out).
 *
 *   I ──► R_sh ──►        V_sh = I·R_sh,  V_out = V_os,out + G·V_sh,  code = V_out/V_FS · 2^N
 *          │  │
 *          └ G ┘──► ADC (V_FS, N bits)
 *
 * Sizing: the amplifier output must reach (1 − headroom) of the usable ADC span at the full-scale current,
 *   R_sh = (1 − h)·V_span / (G·I_max),   V_span = V_FS (unidirectional) or V_FS/2 (bidirectional, mid-scale bias).
 *
 * Error budget (input-referred, as a fraction of the reading at current I), following the method of
 * TI SLAP178 (M. Lis, "Understanding current sensing applications & how to choose the right device", 2019,
 * slides 30–37): each datasheet maximum is turned into an equivalent input voltage or relative error, then
 * combined as a worst-case sum Σ|eᵢ| and as a root-sum-square √Σeᵢ² for uncorrelated sources.
 *   offset      e = V_os / (I·R)                    (V_os at the datasheet test conditions)
 *   offset drift e = (dV_os/dT)·|T − 25 °C| / (I·R)
 *   CMRR        e = 10^(−CMRR/20)·|V_cm − V_cm,test| / (I·R)
 *   PSRR        e = 10^(−PSRR/20)·|V_s − V_s,test| / (I·R)
 *   gain error  e = ε_G,  gain drift e = (ppm/K)·|T − 25 °C|
 *   shunt tolerance e = tol,  shunt TCR e = TCR·|T_R − 25 °C|, T_R = T + I_max²·R·θ_R (worst-case self-heating at
 *   full-scale current, only when θ_R is given)
 *   ADC         e = ½ LSB / reading,  reference e = tol_ref
 * Power P = I²R (Joule). Typical shunt practice is to keep P below half the rated power (2× margin).
 */

export interface ShuntDesign {
  /** shunt resistance, Ω */
  r: number;
  /** amplifier gain, V/V */
  g: number;
  /** ADC full-scale (reference) voltage, V */
  vfs: number;
  /** ADC resolution, bits */
  bits: number;
  bidir: boolean;
}

/** Usable output swing from zero current to full scale. */
export const span = (vfs: number, bidir: boolean): number => (bidir ? vfs / 2 : vfs);

/** Output bias at zero current (mid-scale for bidirectional). */
export const zeroOut = (vfs: number, bidir: boolean): number => (bidir ? vfs / 2 : 0);

/** Shunt resistance that puts I_max at (1 − headroom) of the usable span. */
export const shuntFor = (iMax: number, g: number, vfs: number, bidir: boolean, headroom: number): number => ((1 - headroom) * span(vfs, bidir)) / (g * iMax);

/** Full-scale current at which the output reaches (1 − headroom) of the span. */
export const iMaxFor = (r: number, g: number, vfs: number, bidir: boolean, headroom: number): number => ((1 - headroom) * span(vfs, bidir)) / (g * r);

/** Gain that puts I_max at (1 − headroom) of the span. */
export const gainFor = (r: number, iMax: number, vfs: number, bidir: boolean, headroom: number): number => ((1 - headroom) * span(vfs, bidir)) / (r * iMax);

/** Current at which the output reaches the end of the span (the ADC / amplifier clips beyond it). */
export const iClip = (d: ShuntDesign): number => span(d.vfs, d.bidir) / (d.g * d.r);

/** Current per ADC count. */
export const lsbCurrent = (d: ShuntDesign): number => d.vfs / (2 ** d.bits * d.g * d.r);

/** Ideal (unquantised) ADC reading for current i; the integer code is floor() of it, clamped. */
export const codeIdeal = (d: ShuntDesign, i: number): number => ((zeroOut(d.vfs, d.bidir) + d.g * d.r * i) / d.vfs) * 2 ** d.bits;

/** Current for an ADC reading (inverse of codeIdeal). */
export const currentFromCode = (d: ShuntDesign, code: number): number => ((code / 2 ** d.bits) * d.vfs - zeroOut(d.vfs, d.bidir)) / (d.g * d.r);

export const codeInt = (d: ShuntDesign, i: number): number => Math.min(Math.max(Math.floor(codeIdeal(d, i) + 1e-9), 0), 2 ** d.bits - 1);

export interface ErrorInputs {
  /** measurement current, A (magnitude used) */
  i: number;
  r: number;
  /** shunt tolerance, fraction */
  tolR: number;
  /** shunt TCR, 1/K */
  tcr: number;
  /** ambient / board temperature, °C */
  temp: number;
  /** shunt self-heating thermal resistance (°C/W) or null when not known */
  thetaR: number | null;
  /** current used for self-heating (normally I_max), A */
  iHeat: number;
  /** amplifier input offset, V */
  vos: number;
  /** offset drift, V/K */
  vosDrift: number;
  /** gain error, fraction */
  gainErr: number;
  /** gain drift, 1/K */
  gainDrift: number;
  /** CMRR, dB, and the common-mode voltages (actual and datasheet test) */
  cmrr: number;
  vcm: number;
  vcmTest: number;
  /** PSRR, dB, and the supply voltages (actual and datasheet test) */
  psrr: number;
  vs: number;
  vsTest: number;
  /** ADC: LSB current (A) and reference tolerance (fraction) */
  lsbI: number;
  refTol: number;
}

export interface ErrorTerm {
  key: string;
  label: string;
  /** relative error (fraction of the reading), ≥ 0 */
  rel: number;
  /** equivalent input voltage, V (for the voltage-type terms) */
  vin?: number;
  kind: 'offset' | 'gain' | 'shunt' | 'adc';
}

export interface ErrorBudget {
  terms: ErrorTerm[];
  worst: number;
  rss: number;
  /** shunt temperature, °C */
  tShunt: number;
  /** self-heating rise, K (0 when θ_R is not given) */
  dTself: number;
}

export function errorBudget(e: ErrorInputs): ErrorBudget {
  const vsh = Math.abs(e.i) * e.r;
  const dT = Math.abs(e.temp - 25);
  const dTself = e.thetaR != null ? e.iHeat * e.iHeat * e.r * e.thetaR : 0;
  const tShunt = e.temp + dTself;
  const rel = (v: number) => (vsh > 0 ? v / vsh : Infinity);
  const vCm = 10 ** (-e.cmrr / 20) * Math.abs(e.vcm - e.vcmTest);
  const vPs = 10 ** (-e.psrr / 20) * Math.abs(e.vs - e.vsTest);
  const terms: ErrorTerm[] = [
    { key: 'vos', label: 'Amplifier offset V_os', rel: rel(Math.abs(e.vos)), vin: Math.abs(e.vos), kind: 'offset' },
    { key: 'vosDrift', label: 'Offset drift', rel: rel(Math.abs(e.vosDrift) * dT), vin: Math.abs(e.vosDrift) * dT, kind: 'offset' },
    { key: 'cmrr', label: 'Common-mode (CMRR)', rel: rel(vCm), vin: vCm, kind: 'offset' },
    { key: 'psrr', label: 'Supply (PSRR)', rel: rel(vPs), vin: vPs, kind: 'offset' },
    { key: 'gain', label: 'Gain error', rel: Math.abs(e.gainErr), kind: 'gain' },
    { key: 'gainDrift', label: 'Gain drift', rel: Math.abs(e.gainDrift) * dT, kind: 'gain' },
    { key: 'tol', label: 'Shunt tolerance', rel: Math.abs(e.tolR), kind: 'shunt' },
    { key: 'tcr', label: e.thetaR != null ? 'Shunt TCR (hot at I_max)' : 'Shunt TCR', rel: Math.abs(e.tcr) * Math.abs(tShunt - 25), kind: 'shunt' },
    { key: 'quant', label: 'ADC ½ LSB', rel: Math.abs(e.i) > 0 ? (0.5 * e.lsbI) / Math.abs(e.i) : Infinity, kind: 'adc' },
    { key: 'ref', label: 'ADC reference', rel: Math.abs(e.refTol), kind: 'adc' },
  ];
  const worst = terms.reduce((a, t) => a + t.rel, 0);
  const rss = Math.sqrt(terms.reduce((a, t) => a + t.rel * t.rel, 0));
  return { terms, worst, rss, tShunt, dTself };
}
