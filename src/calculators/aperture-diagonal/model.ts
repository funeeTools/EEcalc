/**
 * Rectangular aperture made with round tools — equations (pure, SI in / SI out).
 *
 * A rectangle L × W fits inside a circle only if the circle's diameter is at least the rectangle's diagonal
 * (the circumscribed circle), d = √(L² + W²) (Euclid, Elements III.31: the angle in a semicircle is a right
 * angle, so the diagonal of an inscribed rectangle is a diameter).
 *
 * Drilled hole for a rectangular lead: IPC-7251 draft 1 (Generic Requirements for Through-Hole Design and Land
 * Pattern Standard, 2008) sizes a plated hole as the maximum lead diameter plus 0.25 / 0.20 / 0.15 mm for density levels
 * A / B / C (most / nominal / least material). For a square or rectangular lead the largest cross-section
 * dimension — the one that must pass through the round hole — is the diagonal, so D ≥ d + c.
 * Fabricators stock finished hole sizes on a grid (typically 0.05 mm steps); the covering hole is the next
 * grid size at or above d + c.
 *
 * Routed opening: a router cutter of diameter d_r leaves inside corners of radius r = d_r/2. A square-cornered
 * part L × W centred in a routed opening grown by g on every side has its corner on the fillet centre's
 * diagonal, √2·(r − g) from that centre, so its gap to the fillet arc is r − √2·(r − g). Keeping the same
 * clearance c/2 there as at the flat sides needs
 *     r − √2·(r − g) ≥ c/2   ⇔   g ≥ r − (r − c/2)/√2      (= r(1 − 1/√2) ≈ 0.293 r for c = 0)
 * so g = max(c/2, r − (r − c/2)/√2). The alternative is a “dog-bone” relief:
 * plunge the cutter at each corner with its centre r/√2 in from both edges, so the circle passes through the
 * sharp corner. A pocket with radius-r corners has (4 − π)·r² less area than the sharp rectangle.
 */

export const diagonal = (l: number, w: number) => Math.hypot(l, w);

/** Side for a target diagonal given the other side (NaN when the diagonal is not longer than it). */
export const sideFor = (d: number, other: number) => (d > other ? Math.sqrt((d - other) * (d + other)) : NaN);

/** Next size on the grid at or above v (sizes start at `min` and rise in `step`); relative 1e-9 slack. */
export function gridUp(v: number, step: number, min: number): number {
  if (v <= min) return min;
  const n = Math.ceil((v - min) / step - 1e-9);
  return min + n * step;
}

/** Growth per side that leaves clearance c/2 at the corners of a sharp rectangle in an opening with corner radius r. */
export const cornerGrowth = (r: number, c = 0) => r - (r - c / 2) * Math.SQRT1_2;

/** Growth per side: c/2 at the flats and at the corners. */
export const growth = (r: number, c: number) => Math.max(c / 2, cornerGrowth(r, c));

export interface ApertureOut {
  d: number;
  /** finished hole needed, d + c */
  dReq: number;
  /** stocked hole, or NaN above the largest size */
  hole: number;
  r: number;
  /** growth per side of the routed opening */
  g: number;
  lo: number;
  wo: number;
  /** area lost to the corner fillets of the routed opening */
  lostArea: number;
  /** dog-bone relief centre inset from each edge */
  dogInset: number;
}

export function aperture(l: number, w: number, c: number, step: number, dMin: number, dMax: number, dr: number): ApertureOut {
  const d = diagonal(l, w);
  const dReq = d + c;
  const h = gridUp(dReq, step, dMin);
  const r = dr / 2;
  const g = growth(r, c);
  return { d, dReq, hole: h <= dMax * (1 + 1e-9) ? h : NaN, r, g, lo: l + 2 * g, wo: w + 2 * g, lostArea: (4 - Math.PI) * r * r, dogInset: r * Math.SQRT1_2 };
}
