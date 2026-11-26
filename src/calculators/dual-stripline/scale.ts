/**
 * One-scale layout for the stripline cross-sections on the dual-stripline and asymmetric edge-coupled pages
 * (style guide §7b): copper width and thickness share one factor k (px per metre), as large as fits — copper at
 * most T_MAX px thick, the conductors at most `spanMax` px across, the whole stack at most `avail` px tall — but
 * never thinner than T_MIN px. Dielectric heights use the same k when they fit and every layer stays at least
 * H_MIN px tall; otherwise they are shared out over the available height in proportion (clamped), and the hint
 * says so. A conductor span too wide at T_MIN runs past both edges of the board (`cut`).
 */

export const T_MAX = 40;
export const T_MIN = 5;
export const H_MIN = 16;

export interface StackScale {
  /** px per metre for widths and thicknesses */
  k: number;
  /** drawn copper thickness (px; 1.5 for zero-thickness copper) */
  tPx: number;
  /** drawn dielectric heights (px), same order as the input */
  hPx: number[];
  /** dielectric heights drawn with k */
  heightsToScale: boolean;
  /** the conductor span is wider than spanMax at the smallest legible thickness */
  cut: boolean;
}

/**
 * span: horizontal extent of the conductors (m); t: copper thickness (m); heights: dielectric layers (m);
 * nCu: copper layers inside the stack (their thickness adds to its height); avail: px between the planes.
 */
export function stackScale(span: number, t: number, heights: number[], nCu: number, avail: number, spanMax: number): StackScale {
  const total = heights.reduce((a, b) => a + b, 0) + nCu * t;
  let k = Math.min(spanMax / span, avail / total, t > 0 ? T_MAX / t : Infinity);
  if (t > 0 && k * t < T_MIN) k = T_MIN / t;
  const tPx = t > 0 ? k * t : 1.5;
  const cut = k * span > spanMax + 0.5;
  let hPx = heights.map((h) => k * h);
  const fits = hPx.every((h) => h >= H_MIN) && hPx.reduce((a, b) => a + b, 0) + nCu * tPx <= avail + 0.5;
  if (!fits) hPx = share(heights, Math.max(avail - nCu * tPx, heights.length * H_MIN));
  return { k, tPx, hPx, heightsToScale: fits, cut };
}

/** Split `px` over the layers in proportion to their thickness, none below H_MIN. */
function share(h: number[], px: number): number[] {
  const fixed = h.map(() => false);
  for (let pass = 0; pass < h.length; pass++) {
    const freePx = px - fixed.reduce((a, f) => a + (f ? H_MIN : 0), 0);
    const freeH = h.reduce((a, x, i) => a + (fixed[i] ? 0 : x), 0);
    let changed = false;
    h.forEach((x, i) => {
      if (!fixed[i] && (freePx * x) / freeH < H_MIN) {
        fixed[i] = true;
        changed = true;
      }
    });
    if (!changed) return h.map((x, i) => (fixed[i] ? H_MIN : (freePx * x) / freeH));
  }
  return h.map(() => px / h.length);
}

/** The hint line under a drawing: how the copper and the heights are drawn. */
export function scaleHint(sc: StackScale, narrow: boolean): string {
  const cu = sc.cut ? 'W and T to scale · runs past both edges' : narrow ? 'W widened to be visible' : 'W and T to scale';
  return `${cu} · ${sc.heightsToScale ? 'heights to scale' : 'heights not to scale'}`;
}
