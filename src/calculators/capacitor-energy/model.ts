/**
 * Capacitor energy — pure model (no DOM), SI in/out.
 *
 * Stored energy and charge of an ideal capacitor (Alexander & Sadiku, Fundamentals of Electric
 * Circuits, 6th ed., §6.2; Horowitz & Hill, The Art of Electronics 3e, §1.4.1):
 *   Q = C·V,  E = ½·C·V² = Q²/(2C)
 * Energy released between two voltages: ΔE = ½·C·(V₁² − V₂²).
 *
 * Hold-up at constant power through an ESR R (derived here from Kirchhoff’s laws; R = 0 gives the
 * familiar t = C(V₁² − V₂²)/2P used in supercapacitor sizing notes, e.g. Maxwell/Eaton application notes):
 * the load (a DC/DC converter) draws a constant power P from the capacitor terminals, v_t = v_c − i·R, so
 *   P = (v_c − iR)·i  →  i(v_c) = (v_c − √(v_c² − 4RP)) / 2R        (the stable, low-current root)
 *   dt = −C·dv_c / i  →  t = (C/2P)·[F(V₁) − F(V_c,end)],  F(v) = v²/2 + (v·s − a·ln(v + s))/2,
 *   with a = 4RP, s = √(v² − a).
 * The converter stops when the terminal voltage falls to V₂; the capacitor’s internal voltage is then
 * V_c,end = V₂ + P·R/V₂. The capacitor can deliver P at all only while v_t ≥ v_c/2 (maximum power transfer),
 * i.e. V₂² ≥ P·R.
 *
 * Bank of identical cells: n_s in series × n_p in parallel gives C_bank = n_p·C/n_s and ESR_bank = n_s·ESR/n_p
 * (assumes balanced cell voltages).
 */

export const energy = (c: number, v: number) => 0.5 * c * v * v;
export const charge = (c: number, v: number) => c * v;

export const bankC = (cCell: number, ns: number, np: number) => (np * cCell) / ns;
export const bankEsr = (esrCell: number, ns: number, np: number) => (ns * esrCell) / np;

/** Antiderivative F(v) with ∫ C dv / i(v) = (C/2P)·F. a = 4RP. */
function F(v: number, a: number): number {
  const s = Math.sqrt(Math.max(v * v - a, 0));
  return 0.5 * v * v + 0.5 * (v * s - (a > 0 ? a * Math.log((v + s) / Math.sqrt(a)) : 0));
}
// (the ln argument is divided by √a, a constant that cancels in F(V₁) − F(V₂) and keeps it well scaled)

export interface Holdup {
  /** Hold-up time, s (0 when the start is already at or below the cut-off) */
  t: number;
  /** Capacitor internal voltage when the load drops out, V */
  vcEnd: number;
  /** Terminal voltage at the start, under load, V */
  vt1: number;
  /** Current at the start and at the end, A */
  i1: number;
  i2: number;
  /** Energy taken out of the capacitor, J */
  eCap: number;
  /** Energy delivered to the load terminals (P·t), J */
  eLoad: number;
  /** Energy dissipated in the ESR, J */
  eEsr: number;
}

/**
 * Constant-power discharge from internal voltage v1 until the terminal voltage reaches v2.
 * Returns null when the ESR cannot deliver P at the cut-off (V₂² < P·R).
 */
export function holdup(c: number, v1: number, v2: number, p: number, r: number): Holdup | null {
  if (r > 0 && v2 * v2 < p * r) return null;
  const vcEnd = r > 0 ? v2 + (p * r) / v2 : v2;
  const a = 4 * r * p;
  const iOf = (vc: number) => (r > 0 ? (2 * p) / (vc + Math.sqrt(vc * vc - a)) : p / vc); // = (vc − s)/2R, rationalised
  if (!(v1 > vcEnd)) {
    const i1 = v1 * v1 >= a ? iOf(v1) : iOf(vcEnd); // below the maximum-power point the load cannot start at all
    return { t: 0, vcEnd, vt1: v1 - i1 * r, i1, i2: iOf(vcEnd), eCap: 0, eLoad: 0, eEsr: 0 };
  }
  const t = (c / (2 * p)) * (F(v1, a) - F(vcEnd, a));
  const i1 = iOf(v1);
  const eCap = 0.5 * c * (v1 * v1 - vcEnd * vcEnd);
  const eLoad = p * t;
  return { t, vcEnd, vt1: v1 - i1 * r, i1, i2: iOf(vcEnd), eCap, eLoad, eEsr: Math.max(eCap - eLoad, 0) };
}

/** Internal capacitor voltage v_c after time t of the constant-power discharge (inverse of holdup()), by bisection on F. */
export function vcAfter(c: number, v1: number, p: number, r: number, t: number): number {
  const a = 4 * r * p;
  const target = F(v1, a) - (2 * p * t) / c;
  let lo = Math.sqrt(a);
  let hi = v1;
  for (let k = 0; k < 100; k++) {
    const m = 0.5 * (lo + hi);
    if (F(m, a) > target) hi = m;
    else lo = m;
  }
  return 0.5 * (lo + hi);
}

/** Terminal voltage for internal voltage vc while P is drawn through R. */
export function vTerminal(vc: number, p: number, r: number): number {
  if (!(r > 0)) return vc;
  return 0.5 * (vc + Math.sqrt(Math.max(vc * vc - 4 * r * p, 0)));
}
