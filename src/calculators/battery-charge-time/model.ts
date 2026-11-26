/**
 * Battery charge time — CC/CV (Li-ion, LiFePO₄, lead-acid bulk/absorption) and constant-current (NiMH, NiCd).
 * DOM-free.
 *
 * CC/CV uses the first-order equivalent circuit (internal-resistance / Thevenin model, Plett, Battery
 * Management Systems vol. 1, ch. 2): terminal voltage V = OCV(SoC) + I·R, with the OCV taken linear from V₀
 * at empty to V_CV at full. The charger holds I until V reaches V_CV, then holds V_CV; the current then
 * decays exponentially:
 *   dSoC/dt = η_c·I/C,  I = (V_CV − OCV)/R   ⇒   I(t) = I_0·e^(−t/τ),  τ = R·C / (η_c·(V_CV − V₀)).
 * τ (the CV time constant) is the page's input; the SoC deficit at CV onset follows as d = η_c·I·τ/C, i.e.
 * CV starts at SoC = 1 − d, which scales with the C-rate — the behaviour of real Li-ion charge curves
 * (Linden & Reddy, Handbook of Batteries, Li-ion charge chapter; TI bq2404x / MCP73831 charge profiles).
 * The charge ends when I falls to the termination current I_term (SoC_end = 1 − d·I_term/I).
 * Constant current: t = ΔSoC·C / (η_c·I) — NiMH/NiCd at a C-rate (IEC 61951-2 rated charge: 0.1 It for 16 h).
 */

export type Profile = 'cccv' | 'cc';

export interface ChargeInputs {
  profile: Profile;
  /** capacity, C (A·s) */
  cap: number;
  /** charge (CC) current, A */
  i: number;
  /** coulombic (charge) efficiency 0…1 */
  eta: number;
  /** CV time constant, s */
  tau: number;
  /** termination current, A */
  iTerm: number;
  /** start / target SoC 0…1; target null = to termination (CC/CV) or 100 % (CC) */
  s0: number;
  sT: number | null;
}

export interface ChargeResult {
  /** time to the target, s */
  t: number;
  tCC: number;
  tCV: number;
  /** SoC at CV onset, SoC at termination, final SoC */
  sTr: number;
  sEnd: number;
  sFinal: number;
  /** current at CV onset (≤ i), A */
  iStart: number;
  /** SoC deficit at CV onset for this current (η·I·τ/C) */
  d: number;
}

export function charge(p: ChargeInputs): ChargeResult {
  const k = p.eta * p.i;
  if (p.profile === 'cc') {
    const sT = p.sT ?? 1;
    const t = ((sT - p.s0) * p.cap) / k;
    return { t, tCC: t, tCV: 0, sTr: sT, sEnd: 1, sFinal: sT, iStart: p.i, d: 0 };
  }
  const d = (k * p.tau) / p.cap;
  const sTr = Math.max(p.s0, 1 - d);
  const tCC = ((sTr - p.s0) * p.cap) / k;
  const iStart = d > 0 ? (p.i * (1 - sTr)) / d : p.i;
  const tFull = iStart > p.iTerm ? p.tau * Math.log(iStart / p.iTerm) : 0;
  const sEnd = iStart > p.iTerm ? 1 - (1 - sTr) * (p.iTerm / iStart) : sTr;
  if (p.sT == null) return { t: tCC + tFull, tCC, tCV: tFull, sTr, sEnd, sFinal: sEnd, iStart, d };
  if (p.sT <= sTr) {
    const t = ((p.sT - p.s0) * p.cap) / k;
    return { t, tCC: t, tCV: 0, sTr, sEnd, sFinal: p.sT, iStart, d };
  }
  const tCV = p.tau * Math.log((1 - sTr) / (1 - p.sT));
  return { t: tCC + tCV, tCC, tCV, sTr, sEnd, sFinal: p.sT, iStart, d };
}

/** Current and SoC at time t after the start (CC/CV or CC), clamped to the charge window. */
export function stateAt(p: ChargeInputs, r: ChargeResult, t: number): { i: number; s: number; cv: boolean } {
  if (t <= r.tCC || p.profile === 'cc') return { i: p.i, s: p.s0 + (p.eta * p.i * Math.min(t, r.tCC)) / p.cap, cv: false };
  const tc = t - r.tCC;
  const e = Math.exp(-tc / p.tau);
  return { i: r.iStart * e, s: 1 - (1 - r.sTr) * e, cv: true };
}
