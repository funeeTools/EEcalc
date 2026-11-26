/**
 * Audio power amplifier gain, swing and supply — equations only (pure, SI in/out).
 *
 * Sine-wave (continuous) rating into a resistive load R:
 *   V_out,rms = √(P·R),  V_pk = √2·V_out,rms,  I_pk = V_pk / R
 *   A_v = V_out,rms / V_in,rms            (voltage gain from the input sensitivity)
 * National Semiconductor / TI LM3886 datasheet (SNAS091C, 2013), “Generalized audio power amplifier
 * design”, eq. 7, 8 and 10.
 *
 * Supply rail: peak swing plus the output stage’s dropout (rail-to-output voltage at I_pk), then the
 * supply regulation (no-load rise) and high-line allowance:
 *   V_rail ≈ (V_pk + V_od)(1 + regulation)(1 + high line)     — LM3886 datasheet eq. 9
 * Generalised here to bridge-tied load (BTL: two halves in antiphase, each swinging V_pk/2, each with its
 * own dropout) and to single-supply (capacitor-coupled) operation.
 *
 * Ideal class-B supply power and dissipation (no quiescent current), sine drive:
 *   P_S = V_S·2·I_pk/π for each conducting rail pair,  P_D = P_S − P_out,  P_D,max = 2V²/(π²R)
 * A. S. Sedra, K. C. Smith, Microelectronic Circuits, 7th ed., Oxford 2015, §12.3 (class B output stage).
 *
 * Levels: dBu re √0.6 V = 0.7746 V (1 mW in 600 Ω), dBV re 1 V (IEC 60268-2 / AES conventions).
 */

/** 0 dBu reference voltage, √0.6 V (1 mW into 600 Ω). */
export const V_DBU = Math.sqrt(0.6);
/** Sine crest factor, √2 = 3.0103 dB. */
export const CF_SINE_DB = 20 * Math.log10(Math.SQRT2);

export const dbuToV = (dbu: number) => V_DBU * 10 ** (dbu / 20);
export const dbvToV = (dbv: number) => 10 ** (dbv / 20);
export const vToDbu = (v: number) => 20 * Math.log10(v / V_DBU);
export const vToDbv = (v: number) => 20 * Math.log10(v);

export type Topology = 'se' | 'btl';
export type Supply = 'split' | 'single';

/** Output-stage dropout counts once per conducting path: once single-ended, twice in a bridge. */
export const dropCount = (t: Topology) => (t === 'btl' ? 2 : 1);

/**
 * Ideal peak swing the supply has to provide at the load (V_pk plus the dropouts), expressed per topology:
 *   rail = the number a designer quotes: ±rail for split supplies, Vcc for single supplies.
 *   span = total voltage between the lowest and highest rail.
 */
export function rails(vpk: number, vdrop: number, t: Topology, s: Supply): { veff: number; rail: number; span: number } {
  const veff = vpk + dropCount(t) * vdrop;
  // SE split ±Veff; SE single Vcc = 2·Veff (output idles at Vcc/2); BTL single Vcc = Veff; BTL split ±Veff/2
  const rail = t === 'se' ? (s === 'split' ? veff : 2 * veff) : s === 'split' ? veff / 2 : veff;
  const span = t === 'se' ? 2 * veff : veff;
  return { veff, rail, span };
}

/**
 * Ideal class-B supply power at peak load voltage vp, for a total supply span `span`.
 * Single-ended: each half-cycle draws from one half of the span (V_span/2 · 2·I_pk/π);
 * bridge: the load current always flows across the whole span (V_span · 2·I_pk/π).
 */
export function supplyPower(vp: number, r: number, span: number, t: Topology): number {
  const vs = t === 'se' ? span / 2 : span;
  return (2 * vs * vp) / (Math.PI * r);
}

/**
 * Maximum class-B dissipation (all output devices of one channel) over sine drive levels up to the clip
 * peak vpMax, and where it occurs. Unconstrained it peaks at V_p = 2V_S/π with P_D = 2V_S²/(π²R); a large
 * dropout can put that point beyond the clip level, and then the maximum is at clipping.
 */
export function maxDissipation(r: number, span: number, t: Topology, vpMax = Infinity): { pd: number; vpAt: number } {
  const vs = t === 'se' ? span / 2 : span;
  const vpAt = Math.min((2 * vs) / Math.PI, vpMax);
  return { pd: supplyPower(vpAt, r, span, t) - (vpAt * vpAt) / (2 * r), vpAt };
}

export interface AmpPoint {
  vout: number;
  vpk: number;
  ipk: number;
  gain: number;
  gainDb: number;
}

/** Sine rating → output voltage, peak swing and current, and the gain from a given input. */
export function ampPoint(p: number, r: number, vin: number): AmpPoint {
  const vout = Math.sqrt(p * r);
  const vpk = Math.SQRT2 * vout;
  const gain = vout / vin;
  return { vout, vpk, ipk: vpk / r, gain, gainDb: 20 * Math.log10(gain) };
}

/**
 * Output power for an input of rms level vin at gain a, with the output clipping at peak vclip.
 * cf: crest factor (peak/rms, linear) of the drive signal. Returns the average output power.
 */
export function powerAt(vin: number, a: number, r: number, vclip: number, cf: number): number {
  const vrms = Math.min(a * vin, vclip / cf);
  return (vrms * vrms) / r;
}

/** Inverse of rails(): the largest clean sine (peak V_pk, power) a given loaded rail allows. */
export function maxCleanPower(rail: number, vdrop: number, r: number, t: Topology, s: Supply): { vpk: number; p: number } {
  const veff = t === 'se' ? (s === 'split' ? rail : rail / 2) : s === 'split' ? 2 * rail : rail;
  const vpk = veff - dropCount(t) * vdrop;
  return { vpk, p: vpk > 0 ? (vpk * vpk) / (2 * r) : 0 };
}

/** Total supply span (lowest to highest rail) for a quoted rail value (±V for split, Vcc for single). */
export const spanFromRail = (rail: number, s: Supply) => (s === 'split' ? 2 * rail : rail);
