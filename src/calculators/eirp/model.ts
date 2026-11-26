/**
 * EIRP / ERP and transmit-power limits — pure model, dB units.
 *
 * EIRP = P_t − L_feed + G_i (dBm, dB, dBi); ERP = EIRP − 2.15 dB, since ERP is referred to a half-wave
 *   dipole whose gain is 1.64 = 2.15 dBi (ITU Radio Regulations, Article 1 definitions; dipole gain:
 *   C. A. Balanis, Antenna Theory, 3rd ed., §4.6, D₀ = 1.643). dBd = dBi − 2.15.
 * Regulatory limits (rule text quoted in the theory section):
 *   47 CFR 15.247(b)(3): digitally modulated systems in 902–928, 2400–2483.5 and 5725–5850 MHz, 1 W
 *     maximum conducted output power; (b)(4): reduce it by the amount the antenna’s directional gain
 *     exceeds 6 dBi; (c)(1)(i): 2.4 GHz fixed point-to-point, 1 dB per 3 dB above 6 dBi; (c)(1)(ii):
 *     5.8 GHz fixed point-to-point, no reduction; (b)(1): FHSS in 2.4 GHz with < 75 channels, 0.125 W.
 *   47 CFR 15.247(b)(2): FHSS in 902–928 MHz, 1 W with ≥ 50 channels, 0.25 W with 25–49 channels.
 *   ETSI EN 300 328 V2.2.2 (2019-07) §4.3.1.2.3 / §4.3.2.2.3: 2.4 GHz wideband data equipment, RF output
 *     power (mean e.i.r.p.) ≤ 20 dBm; §4.3.2.3.3: non-FHSS PSD ≤ 10 dBm per MHz e.i.r.p.
 */

export const DIPOLE_DBI = 2.15;

export const dbmToW = (dbm: number) => 10 ** ((dbm - 30) / 10);
export const wToDbm = (w: number) => 10 * Math.log10(w) + 30;

export type LimitId = 'user-eirp' | 'user-erp' | 'fcc-dts' | 'fcc-p2p-24' | 'fcc-p2p-58' | 'fcc-fhss-900' | 'fcc-fhss-24' | 'fcc-fhss-24-p2p' | 'etsi-328' | 'etsi-328-fhss';

/** Options a limit may need: the user-entered limit (dBm) and the occupied bandwidth (Hz, for PSD limits). */
export interface LimitOpts {
  user: number;
  bw: number;
}

export interface LimitRule {
  label: string;
  /** what the limit applies to */
  ref: 'conducted' | 'eirp' | 'erp';
  /** short citation */
  cite: string;
  /** conducted rules: power at G ≤ 6 dBi (dBm) and the dB reduction per dB of gain above 6 dBi */
  base?: number;
  slope?: number;
  /** maximum allowed value (dBm) of `ref`, given the antenna gain in dBi */
  max(gDbi: number, o: LimitOpts): number;
}

/** 47 CFR 15.247(b)(4) / (c)(1): conducted limit with a reduction for directional gain above 6 dBi. */
function conducted(label: string, cite: string, base: number, slope: number): LimitRule {
  return { label, ref: 'conducted', cite, base, slope, max: (g) => base - slope * Math.max(0, g - 6) };
}

/** ETSI EN 300 328 non-FHSS: 20 dBm e.i.r.p. and 10 dBm/MHz PSD; with a flat spectrum over B the PSD cap is 10 + 10·log(B/1 MHz). */
export function etsiNonFhssMax(bw: number): number {
  return Math.min(20, 10 + 10 * Math.log10(Math.max(bw, 1e6) / 1e6));
}

export const LIMITS: Record<LimitId, LimitRule> = {
  'user-eirp': { label: 'User EIRP limit', ref: 'eirp', cite: 'user-entered', max: (_g, o) => o.user },
  'user-erp': { label: 'User ERP limit', ref: 'erp', cite: 'user-entered', max: (_g, o) => o.user },
  'fcc-dts': conducted('FCC 15.247 1 W (digital mod.; FHSS 902 MHz ≥ 50 ch, 2.4 GHz ≥ 75 ch, 5.8 GHz)', '47 CFR 15.247(b)(1)–(b)(4)', 30, 1),
  'fcc-p2p-24': conducted('FCC 15.247 2.4 GHz fixed point-to-point, 1 W', '47 CFR 15.247(b)(3), (c)(1)(i)', 30, 1 / 3),
  'fcc-p2p-58': conducted('FCC 15.247 5.8 GHz fixed point-to-point', '47 CFR 15.247(b)(3), (c)(1)(ii)', 30, 0),
  'fcc-fhss-900': conducted('FCC 15.247 902 MHz FHSS, 25–49 channels (0.25 W)', '47 CFR 15.247(b)(2), (b)(4)', wToDbm(0.25), 1),
  'fcc-fhss-24': conducted('FCC 15.247 2.4 GHz FHSS, < 75 channels (0.125 W)', '47 CFR 15.247(b)(1), (b)(4)', wToDbm(0.125), 1),
  'fcc-fhss-24-p2p': conducted('FCC 15.247 2.4 GHz FHSS < 75 ch, fixed point-to-point', '47 CFR 15.247(b)(1), (c)(1)(i)', wToDbm(0.125), 1 / 3),
  'etsi-328': { label: 'ETSI EN 300 328 2.4 GHz non-FHSS (20 dBm, 10 dBm/MHz)', ref: 'eirp', cite: 'ETSI EN 300 328 V2.2.2 §4.3.2.2.3, §4.3.2.3.3', max: (_g, o) => etsiNonFhssMax(o.bw) },
  'etsi-328-fhss': { label: 'ETSI EN 300 328 2.4 GHz FHSS (20 dBm)', ref: 'eirp', cite: 'ETSI EN 300 328 V2.2.2 §4.3.1.2.3', max: () => 20 },
};

export interface Chain {
  /** transmitter output, dBm */
  pt: number;
  /** cable loss, dB */
  lc: number;
  /** connector and other losses, dB */
  lo: number;
  /** antenna gain, dBi */
  g: number;
}

export function eirpDbm(c: Chain): number {
  return c.pt - c.lc - c.lo + c.g;
}

/** Margin (dB) of the chain against a limit rule: positive = compliant. */
export function margin(c: Chain, id: LimitId, o: LimitOpts): number {
  const rule = LIMITS[id];
  const lim = rule.max(c.g, o);
  const v = rule.ref === 'conducted' ? c.pt : rule.ref === 'eirp' ? eirpDbm(c) : eirpDbm(c) - DIPOLE_DBI;
  return lim - v;
}

/** Highest transmitter power (dBm) the limit allows with this antenna and feed. */
export function maxPt(c: Chain, id: LimitId, o: LimitOpts): number {
  return c.pt + margin(c, id, o);
}

/**
 * Highest antenna gain (dBi) the limit allows at this transmitter power; Infinity when the limit does not
 * depend on gain (5.8 GHz point-to-point) and the power is within it; null if no gain is compliant.
 */
export function maxGain(c: Chain, id: LimitId, o: LimitOpts): number | null {
  const rule = LIMITS[id];
  if (rule.ref !== 'conducted') return c.g + margin(c, id, o);
  // conducted limits are non-increasing in G: the largest G with base − slope·(G − 6) ≥ P_t
  const base = rule.base!;
  const slope = rule.slope!;
  if (c.pt > base) return null;
  return slope === 0 ? Infinity : 6 + (base - c.pt) / slope;
}
