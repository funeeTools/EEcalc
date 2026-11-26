/**
 * Pierce crystal oscillator load capacitance — equations only (pure, SI in/out).
 *
 *        ┌──[ inverter ]──┐            The crystal sees the two load capacitors in series, plus the
 *   XIN ─┤                ├─ XOUT      stray capacitance of pins and traces in parallel:
 *        └──── XTAL ──────┘
 *       C_L1             C_L2            C_L = C_L1·C_L2/(C_L1 + C_L2) + C_s         (Microchip AN826, p. 9;
 *        ⏚                ⏚                                                            ST AN2867)
 *
 * Crystal model (Butterworth–Van Dyke): motional C_m, L_m, R_m in parallel with the shunt capacitance C₀.
 * With a series load C_L the lossless circuit resonates at
 *
 *   f_L = f_s·√(1 + C_m/(C₀ + C_L)) ≈ f_s·(1 + C_m/(2(C₀ + C_L)))      (first order: AN826 p. 7)
 *
 * so a load different from the specified one pulls the frequency by f_L(C_circ)/f_L(C_spec) − 1, and the
 * slope (trim sensitivity) is ∂(Δf/f)/∂C_L ≈ −C_m/(2(C₀ + C_L)²) (AN826 "ppm/pF").
 *
 * Start-up (ST AN2867, “gain margin of the oscillator”): the crystal's critical transconductance
 *   g_m,crit = 4·ESR·(2πf)²·(C₀ + C_L)²
 * must be well below the oscillator's G_m: gain margin G_m/g_m,crit ≥ 5.
 * Drive level (AN2867, “drive level”): DL = ESR·(π f C_tot V_pp)²/2 with C_tot = C_L1 + C_s/2 and V_pp measured
 * at that pin — the crystal current is the current into that capacitor, I_rms = 2πf·C_tot·V_pp/(2√2).
 */

import { bracketE, eValues } from '@/core/eseries';

/** Load capacitance the crystal sees. */
export function loadCap(c1: number, c2: number, cs: number): number {
  return (c1 * c2) / (c1 + c2) + cs;
}

/** C_L2 that gives the target load with C_L1 given; non-positive / non-finite when impossible. */
export function c2For(cl: number, c1: number, cs: number): number {
  const x = cl - cs;
  return x > 0 && c1 > x ? (c1 * x) / (c1 - x) : NaN;
}

/** Equal capacitors for the target load: 2(C_L − C_s). */
export function equalFor(cl: number, cs: number): number {
  return 2 * (cl - cs);
}

/** Load-resonance frequency relative to series resonance: f_L/f_s = √(1 + C_m/(C₀ + C_L)). */
export function loadRatio(cm: number, c0: number, cl: number): number {
  return Math.sqrt(1 + cm / (c0 + cl));
}

/** Frequency offset (fraction) of a crystal specified at clSpec when it runs with clAct. */
export function pulling(cm: number, c0: number, clSpec: number, clAct: number): number {
  return loadRatio(cm, c0, clAct) / loadRatio(cm, c0, clSpec) - 1;
}

/** Trim sensitivity d(Δf/f)/dC_L at load cl (per farad, negative). Exact derivative of the √ form. */
export function sensitivity(cm: number, c0: number, cl: number): number {
  const u = c0 + cl;
  return -cm / (2 * u * u * (1 + cm / u));
}

/** Critical transconductance of the crystal (A/V), ST AN2867. */
export function gmCrit(esr: number, f: number, c0: number, cl: number): number {
  const w = 2 * Math.PI * f;
  return 4 * esr * w * w * (c0 + cl) ** 2;
}

/** Drive level (W) from the peak-to-peak voltage on the pin whose capacitor is cPin (+ half the stray). */
export function driveLevel(esr: number, f: number, cTot: number, vpp: number): number {
  return (esr * (Math.PI * f * cTot * vpp) ** 2) / 2;
}

export interface CapPair {
  c1: number;
  c2: number;
  cl: number;
  /** C_L(circuit) − C_L(spec) */
  dcl: number;
  /** Frequency offset (fraction); null without C_m */
  ppm: number | null;
}

/**
 * Standard capacitor pairs for the target load: every series value C_L1 from 1.4(C_L − C_s) to 3(C_L − C_s)
 * with the two values bracketing its exact C_L2, keeping pairs within 2.2 : 1 (a Pierce stage wants
 * similar capacitors; very unequal pairs shift the loop gain and drive level). Each pair appears once
 * (C_L1 ≤ C_L2). Sorted by |ΔC_L| in 0.02 pF steps, then by closeness of the two values.
 */
export function bestPairs(series: string, clSpec: number, cs: number, cm: number | null, c0: number, n = 8): CapPair[] {
  const x = clSpec - cs;
  if (!(x > 0)) return [];
  const out: CapPair[] = [];
  const seen = new Set<string>();
  for (const c1 of eValues(series, x * 1.4, 3 * x)) {
    const exact = c2For(clSpec, c1, cs);
    if (!Number.isFinite(exact)) continue;
    for (const c2v of bracketE(series, exact)) {
      const [a, b] = c1 <= c2v ? [c1, c2v] : [c2v, c1];
      const key = `${a}/${b}`;
      if (seen.has(key) || a <= 0 || b / a > 2.2) continue;
      seen.add(key);
      const cl = loadCap(a, b, cs);
      out.push({ c1: a, c2: b, cl, dcl: cl - clSpec, ppm: cm != null ? pulling(cm, c0, clSpec, cl) : null });
    }
  }
  const step = (p: CapPair) => Math.round(Math.abs(p.dcl) / 0.02e-12);
  out.sort((p, q) => step(p) - step(q) || p.c2 / p.c1 - q.c2 / q.c1 || Math.abs(p.dcl) - Math.abs(q.dcl));
  return out.slice(0, n);
}
