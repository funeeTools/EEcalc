/**
 * Thermal via array under a pad — pure model (no DOM, SI in/out).
 *
 * One-dimensional (vertical) conduction through the board under a pad of W × L, after Y. Shen, H. Wang,
 * F. Blaabjerg, H. Zhao, T. Long, "Thermal Modeling and Design Optimization of PCB Vias and Pads",
 * IEEE Trans. Power Electronics 35(1), 882–900, 2020, eqs. (2)–(4). Three parallel paths per via:
 *
 *   plating (barrel)   θ_b = h / (k_Cu · π·t·(d − t))
 *   fill               θ_f = h / (k_fill · π·(d/2 − t)²)          (air, resin, solder; solid copper fill: k_fill = k_Cu)
 *   laminate + copper  θ_l = [N_Cu·t_Cu/k_Cu + (h − N_Cu·t_Cu)/k_lam] / (W·L − N·π·d²/4)
 *
 * N vias in parallel with the laminate that is left: 1/θ = N·(1/θ_b + 1/θ_f) + 1/θ_l. Shen et al. use the same
 * paths per via unit cell; summing the cells over the pad gives this form. Material data (Shen Table I, 25 °C):
 * Cu 393, SnAgCu 57.3, FR-4 0.29 through-plane / 0.81 in-plane, air 0.026 W/(m·K).
 *
 * Fourier's law for a slab, θ = L/(k·A): F. P. Incropera et al., Fundamentals of Heat and Mass Transfer, 7th ed.,
 * §3.1. Practical layout guidance: TI SLMA002 (PowerPAD thermally enhanced package) and SLUA271 (QFN layout).
 */

export type Fill = 'none' | 'epoxy' | 'solder' | 'cu' | 'custom';

export const K_AIR = 0.026;

export interface ThermalViaGeom {
  n: number;
  d: number;
  t: number;
  h: number;
  padW: number;
  padL: number;
  kCu: number;
  /** Fill conductivity (ignored for a copper fill, which uses kCu) */
  kFill: number;
  fill: Fill;
  kLam: number;
  nCu: number;
  tCu: number;
}

export interface ThermalViaResult {
  thetaPlate: number;
  thetaFill: number;
  thetaVia: number;
  thetaVias: number;
  thetaLam: number;
  theta: number;
  /** share of the heat carried by the vias */
  viaShare: number;
  lamArea: number;
}

export function platingTheta(d: number, t: number, h: number, kCu: number): number {
  return h / (kCu * Math.PI * t * (d - t));
}

export function fillTheta(d: number, t: number, h: number, kFill: number): number {
  const r = d / 2 - t;
  return r > 0 && kFill > 0 ? h / (kFill * Math.PI * r * r) : Infinity;
}

/** Laminate + copper-layer path per unit area (K·m²/W). */
export function laminateRA(h: number, kLam: number, nCu: number, tCu: number, kCu: number): number {
  const cu = Math.min(nCu * tCu, h);
  return cu / kCu + (h - cu) / kLam;
}

export function thermalVias(g: ThermalViaGeom): ThermalViaResult {
  const thetaPlate = platingTheta(g.d, g.t, g.h, g.kCu);
  const thetaFill = fillTheta(g.d, g.t, g.h, g.fill === 'cu' ? g.kCu : g.kFill);
  const gVia = 1 / thetaPlate + (Number.isFinite(thetaFill) ? 1 / thetaFill : 0);
  const thetaVia = 1 / gVia;
  const thetaVias = thetaVia / g.n;
  const lamArea = g.padW * g.padL - (g.n * Math.PI * g.d * g.d) / 4;
  const gLam = lamArea > 0 ? lamArea / laminateRA(g.h, g.kLam, g.nCu, g.tCu, g.kCu) : 0;
  const gTot = g.n * gVia + gLam;
  return { thetaPlate, thetaFill, thetaVia, thetaVias, thetaLam: gLam > 0 ? 1 / gLam : Infinity, theta: 1 / gTot, viaShare: (g.n * gVia) / gTot, lamArea };
}

/** Rows × columns of a near-square array of n vias in a W × L pad (columns along W). */
export function arrayShape(n: number, padW: number, padL: number): { cols: number; rows: number } {
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * padW) / padL)) || 1));
  return { cols, rows: Math.ceil(n / cols) };
}

/** Most vias of drill d that fit a W × L pad on a square grid of pitch p (all holes inside the pad). */
export function maxFit(d: number, p: number, padW: number, padL: number): number {
  if (d > padW || d > padL) return 0;
  return (Math.floor((padW - d) / p + 1e-9) + 1) * (Math.floor((padL - d) / p + 1e-9) + 1);
}
