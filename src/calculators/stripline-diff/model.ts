/**
 * Edge-coupled symmetric stripline — pure model (no DOM, SI in/out).
 *
 * Two strips of width W, edge gap S, centred between ground planes b apart, in a homogeneous
 * dielectric εr (so the line is pure TEM and εeff = εr exactly).
 *
 * Zero thickness — exact conformal mapping:
 *   S. B. Cohn, "Shielded Coupled-Strip Transmission Line", IRE Trans. MTT-3(5), Oct. 1955, pp. 29–38,
 *   eqs. (2)–(7):  Z₀ₑ,₀ₒ = η₀/(4√εr) · K(k′)/K(k),
 *   kₑ = tanh(πW/2b)·tanh(π(W+S)/2b),  kₒ = tanh(πW/2b)·coth(π(W+S)/2b).
 *   Isolated strip (same paper / Cohn 1954): Z₀ = η₀/(4√εr) · K(sech(πW/2b))/K(tanh(πW/2b)).
 *
 * Finite thickness — Cohn 1955 eqs. (18), (20) (S ≥ 5t) and (22) (S < 5t), written here as
 * capacitances normalised to ε (C/ε = η₀/(√εr·Z), dimensionless), with
 *   • the fringing capacitance of one edge to one plane, C′f(t)/ε, from S. B. Cohn, "Characteristic
 *     Impedance of the Shielded-Strip Transmission Line", IRE Trans. MTT-2, July 1954, pp. 52–57, eq. (2);
 *     C′f(0)/ε = 2 ln2 / π;
 *   • the isolated thick strip from H. A. Wheeler, "Transmission-Line Properties of a Strip Line Between
 *     Parallel Planes", IEEE Trans. MTT-26(11), Nov. 1978, pp. 866–876 (≈0.5 % for W/(b−t) < 10).
 * Using Wheeler for both Z₀(t) and Z₀(0) inside the correction makes it reduce exactly to Cohn's zero-thickness
 * result at t = 0 (Wheeler's own small error cancels to first order). The isolated-strip Z₀ reported is the
 * S → ∞ limit of (18)/(20): C/ε = Cw(t) − r·(Cw(0) − C₀), r = C′f(t)/C′f(0).
 *
 * Note on eq. (22): wcalc and KiCad transcribe it as 1/Z₀ₒ(0) + … − (2/η₀)(C′f(t)−C′f(0))/ε₀ + 2t/(η₀S) with
 * C′f containing εr; that mixes admittances in the dielectric with air values, so it is only right for εr = 1.
 * In normalised-capacitance form every term carries the same √εr/η₀ factor, which is what is used here.
 */

export const C0 = 299_792_458;
export const MU0 = 1.25663706212e-6;
export const ETA0 = MU0 * C0; // 376.730… Ω

/** Arithmetic–geometric mean. */
function agm(a: number, b: number): number {
  for (let i = 0; i < 60; i++) {
    const an = (a + b) / 2;
    const bn = Math.sqrt(a * b);
    if (Math.abs(an - bn) <= 1e-16 * an) return an;
    a = an;
    b = bn;
  }
  return (a + b) / 2;
}

/** K(k)/K(k′) given k and k′ = √(1−k²) separately (so both stay accurate near 0 and 1). K(k) = π/(2·agm(1,k′)). */
export function kRatio(k: number, kp: number): number {
  return agm(1, k) / agm(1, kp);
}

/** Zero-thickness normalised capacitances C/ε: even mode, odd mode and the isolated strip (exact, Cohn). */
export function zeroThickness(w: number, s: number, b: number): { ce: number; co: number; cs: number; ke: number; ko: number } {
  // u = e^(−πW/b), v = e^(−π(W+S)/b); tanh(x) = (1−e^(−2x))/(1+e^(−2x)). Complementary moduli in closed form, no cancellation.
  const a1 = (Math.PI * w) / (2 * b);
  const a2 = (Math.PI * (w + s)) / (2 * b);
  const u = Math.exp(-2 * a1);
  const v = Math.exp(-2 * a2);
  const ke = ((1 - u) * (1 - v)) / ((1 + u) * (1 + v));
  const kep = (2 * Math.sqrt((u + v) * (1 + u * v))) / ((1 + u) * (1 + v));
  const omv = -Math.expm1(-2 * a2); // 1 − v
  const umv = u * -Math.expm1(-2 * (a2 - a1)); // u − v ≥ 0
  const ko = ((1 - u) * (1 + v)) / ((1 + u) * omv);
  const kop = (2 * Math.sqrt(umv * (1 - u * v))) / ((1 + u) * omv);
  const ks = (1 - u) / (1 + u); // tanh(πW/2b)
  const ksp = (2 * Math.sqrt(u)) / (1 + u); // sech(πW/2b)
  return { ce: 4 * kRatio(ke, kep), co: 4 * kRatio(ko, kop), cs: 4 * kRatio(ks, ksp), ke, ko };
}

/** Cohn 1954 eq. (2): fringing capacitance of one strip edge to one ground plane, C′f/ε, for x = t/b. */
export function fringeCap(x: number): number {
  if (x <= 0) return (2 * Math.LN2) / Math.PI;
  const y = 1 / (1 - x);
  return (2 * y * Math.log(y + 1) - (y - 1) * Math.log(y * y - 1)) / Math.PI;
}

/** Wheeler (1978) isolated stripline impedance in air (Ω), strip W × t centred between planes b apart. */
export function wheelerZair(w: number, b: number, t: number): number {
  const x = t / b;
  let dw = 0;
  if (x > 0) {
    const m = 6 / (3 + (2 * x) / (1 - x));
    dw = (t / Math.PI) * (1 - 0.5 * Math.log((x / (2 - x)) ** 2 + ((0.0796 * x) / (w / b + 1.1 * x)) ** m));
  }
  const A = (4 * (b - t)) / (Math.PI * (w + dw)); // 4/(π W′)
  return 30 * Math.log(1 + A * (2 * A + Math.sqrt(4 * A * A + 6.27)));
}

export interface CoupledResult {
  /** Even / odd mode impedances (Ω) */
  ze: number;
  zo: number;
  /** Isolated single strip (Ω) */
  zs: number;
  zdiff: number;
  zcm: number;
  /** Backward (voltage) coupling coefficient (Ze−Zo)/(Ze+Zo) */
  kb: number;
  /** √(Ze·Zo), the coupler / filter design impedance */
  z0: number;
  /** Normalised capacitances C/ε used */
  ce: number;
  co: number;
  cs: number;
  /** Which odd-mode thickness branch: 'exact' (t = 0), 'wide' (S ≥ 5t, eq. 20), 'close' (S < 5t, eq. 22) */
  branch: 'exact' | 'wide' | 'close';
  /** Zero-thickness (exact) values for reference */
  ze0: number;
  zo0: number;
  zs0: number;
}

export function coupledStripline(w: number, s: number, b: number, t: number, er: number): CoupledResult {
  const z = zeroThickness(w, s, b);
  const k = ETA0 / Math.sqrt(er);
  let ce = z.ce;
  let co = z.co;
  let cs = z.cs;
  let branch: CoupledResult['branch'] = 'exact';
  if (t > 0) {
    const csT = ETA0 / wheelerZair(w, b, t);
    const csW0 = ETA0 / wheelerZair(w, b, 0);
    const cf0 = fringeCap(0);
    const cfT = fringeCap(t / b);
    const r = cfT / cf0;
    ce = csT - r * (csW0 - z.ce); // Cohn (18)
    if (s >= 5 * t) {
      co = csT + r * (z.co - csW0); // Cohn (20)
      branch = 'wide';
    } else {
      co = z.co + (csT - csW0) - 2 * (cfT - cf0) + (2 * t) / s; // Cohn (22), normalised capacitances
      branch = 'close';
    }
    // Isolated strip: the S → ∞ limit of (18) and (20), so Z₀ₑ, Z₀ₒ → Z₀ as the pair separates.
    cs = csT - r * (csW0 - z.cs);
  }
  const ze = k / ce;
  const zo = k / co;
  return {
    ze,
    zo,
    zs: k / cs,
    zdiff: 2 * zo,
    zcm: ze / 2,
    kb: (ze - zo) / (ze + zo),
    z0: Math.sqrt(ze * zo),
    ce,
    co,
    cs,
    branch,
    ze0: k / z.ce,
    zo0: k / z.co,
    zs0: k / z.cs,
  };
}

/**
 * Error band of the thickness correction, measured against a 2-D finite-difference Laplace solution
 * (3-grid Richardson extrapolation; exact at t = 0, thick isolated strip within 0.3 %) on 140 cross-sections:
 * t/b 0.05–0.2, W/b 0.15–1, S = 1.5t–12t. Band = (this model − field solution)/field solution, in percent,
 * extremes of each group widened outward to the next 0.5 %. "narrow" is W/(b−t) < 0.35 (outside Cohn's stated range).
 */
const BANDS: Record<'wide' | 'narrow', { sMax: number; zdiff: [number, number]; zcm: [number, number] }[]> = {
  wide: [
    { sMax: 5, zdiff: [-1.5, 3.5], zcm: [-3.5, 0.5] }, // measured −0.98…+2.82, −2.77…−0.27
    { sMax: 8, zdiff: [-0.5, 4], zcm: [-1.5, 0.5] }, // −0.11…+3.52, −1.13…−0.36
    { sMax: Infinity, zdiff: [-0.5, 2], zcm: [-1, 0.5] }, // −0.25…+1.65, −0.82…−0.06
  ],
  narrow: [
    { sMax: 5, zdiff: [-1, 4.5], zcm: [-6.5, 0.5] }, // −0.53…+3.89, −5.93…−0.87
    { sMax: 8, zdiff: [-0.5, 6.5], zcm: [-3.5, 0.5] }, // +0.33…+5.73, −2.86…−0.37
    { sMax: Infinity, zdiff: [-0.5, 3.5], zcm: [-2.5, 0.5] }, // −0.09…+2.87, −2.01…−0.03
  ],
};

/** Largest t/b the page accepts: the field-solver check covers t/b ≤ 0.2. */
export const TB_MAX = 0.2;

export interface AccuracyBand {
  zdiff: [number, number];
  zcm: [number, number];
  /** false when W/b < 0.15 (narrower than the checked grid) */
  checked: boolean;
  group: 'wide' | 'narrow';
}

/** Measured error band (percent) of Zdiff and Zcm for this geometry; null when t = 0 (exact). */
export function accuracyBand(w: number, s: number, b: number, t: number): AccuracyBand | null {
  if (!(t > 0)) return null;
  const group = w / (b - t) >= 0.35 ? 'wide' : 'narrow';
  const row = BANDS[group].find((r) => s < r.sMax * t)!;
  return { zdiff: row.zdiff, zcm: row.zcm, checked: w / b >= 0.15 && t / b <= TB_MAX, group };
}
