/**
 * 555 timer — pure model (no DOM), SI in/out.
 *
 * TI NE555 / TLC555 data sheets (SLFS022, SLFS043): the comparators switch at V_U = ⅔·V_CC (threshold) and
 * V_L = ⅓·V_CC (trigger); driving CONT with V_CV moves them to V_CV and V_CV/2.
 *
 * Astable (data-sheet figure "circuit for astable operation"): C charges through R_A + R_B towards V_CC and
 * discharges through R_B into the DISCH transistor:
 *   t_H = (R_A + R_B)·C·ln[(V_CC − V_L)/(V_CC − V_U)]  = ln2·(R_A + R_B)·C with the internal divider
 *   t_L = R_B·C·ln(V_U/V_L)                           = ln2·R_B·C
 * With a diode across R_B (charge through R_A and the diode only) the charge target is V_CC − V_F.
 * The first high period after power-up starts from 0 V: t_H1 = R·C·ln[V_CC/(V_CC − V_U)].
 * Monostable: C charges from ≈0 V to V_U through R_A: t_w = R_A·C·ln[V_CC/(V_CC − V_U)] = ln3·R_A·C ≈ 1.1·R_A·C.
 * The discharge transistor's saturation voltage, comparator delays and pin currents are neglected.
 */

export interface Thresholds {
  vu: number;
  vl: number;
}

export function thresholds(vcc: number, vcv: number | null): Thresholds {
  const vu = vcv ?? (2 * vcc) / 3;
  return { vu, vl: vu / 2 };
}

export interface AstableIn {
  vcc: number;
  vcv: number | null;
  ra: number;
  rb: number;
  c: number;
  /** Diode across R_B: charge through R_A only, towards V_CC − V_F */
  diode: boolean;
  vf: number;
}

/** Time factors so that t_H = kH·R_ch·C and t_L = kL·R_B·C. kH is NaN if the charge target never reaches V_U. */
export function astableFactors(i: Pick<AstableIn, 'vcc' | 'vcv' | 'diode' | 'vf'>): { kH: number; kL: number; kFirst: number; target: number; vu: number; vl: number } {
  const { vu, vl } = thresholds(i.vcc, i.vcv);
  const target = i.diode ? i.vcc - i.vf : i.vcc;
  const kH = target > vu ? Math.log((target - vl) / (target - vu)) : NaN;
  const kFirst = target > vu ? Math.log(target / (target - vu)) : NaN;
  return { kH, kL: Math.log(vu / vl), kFirst, target, vu, vl };
}

export interface AstableOut {
  tH: number;
  tL: number;
  period: number;
  f: number;
  /** Fraction of the period the output is high */
  duty: number;
  tFirst: number;
  rCharge: number;
  kH: number;
  kL: number;
  target: number;
  vu: number;
  vl: number;
}

export function astable(i: AstableIn): AstableOut {
  const k = astableFactors(i);
  const rCharge = i.diode ? i.ra : i.ra + i.rb;
  const tH = k.kH * rCharge * i.c;
  const tL = k.kL * i.rb * i.c;
  const period = tH + tL;
  return { tH, tL, period, f: 1 / period, duty: tH / period, tFirst: k.kFirst * rCharge * i.c, rCharge, ...k };
}

/** Monostable pulse-width factor: t_w = kM·R_A·C (ln 3 with the internal divider). */
export function monoFactor(vcc: number, vcv: number | null): number {
  const { vu } = thresholds(vcc, vcv);
  return vcc > vu ? Math.log(vcc / (vcc - vu)) : NaN;
}

/** Capacitor voltage charging from v0 towards target through τ, at time t. */
export const charge = (t: number, tau: number, v0: number, target: number) => target + (v0 - target) * Math.exp(-t / tau);

export function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}
