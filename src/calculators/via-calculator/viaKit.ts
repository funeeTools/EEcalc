/**
 * Via drawing family: the board, copper layers, barrel, pads, mask and finish of a plated via, drawn the same way on
 * every via page (via calculator, thermal vias, via stub, annular ring, differential via). Everything goes through the
 * shared PCB material kit (core/schematic/pcb.ts), so the colours are the site-wide material colours; this file only
 * fixes the proportions, so the same via looks identical on each page.
 *
 *   Cross-section (y grows downwards):
 *     viaLaminate → viaCopper (planes with antipad gaps, pads, traces) → viaBarrel (walls + hole interior / fill)
 *     → viaFinish (gold on exposed copper) → viaMask (conformal mask with openings, or a tent over the hole)
 *   Top view: viaPadTop (pad ring + drilled hole), on a mask / laminate background.
 */

import type { Schematic } from '@/core/schematic/schematic';
import { type PcbMat, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';

/** Pixel thickness of the thin layers: drawn at a legible minimum, not to scale (style guide §7b). */
export const VIA_PX = { cu: 3.2, mask: 3, gold: 1.6, wallMin: 2.6, wallMax: 7 } as const;

export type Span = [number, number];
export type ViaFill = 'none' | 'epoxy' | 'solder' | 'cu';
type Tone = '' | 'solved' | 'hl';

/** Laminate block (FR-4 core / prepreg). */
export function viaLaminate(sch: Schematic, x0: number, y0: number, x1: number, y1: number): void {
  pcbRect(sch, 'fr4', x0, y0, x1 - x0, y1 - y0, { layer: 'back' });
}

/** Subtract the gaps from [x0, x1] (gaps may overlap or stick out). */
export function spansWithout(x0: number, x1: number, gaps: Span[]): Span[] {
  const g = gaps.map(([a, b]) => [Math.max(a, x0), Math.min(b, x1)] as Span).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const out: Span[] = [];
  let x = x0;
  for (const [a, b] of g) {
    if (a > x) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (x1 > x) out.push([x, x1]);
  return out;
}

/** A copper layer (plane, pad or trace) from x0 to x1 at top y, broken by the gaps (antipads, holes). */
export function viaCopper(sch: Schematic, x0: number, x1: number, y: number, gaps: Span[] = [], o: { th?: number; tone?: Tone } = {}): void {
  for (const [a, b] of spansWithout(x0, x1, gaps)) pcbRect(sch, 'cu', a, y, b - a, o.th ?? VIA_PX.cu, { tone: o.tone ?? '' });
}

/** Barrel wall thickness in px for a plating t, at the drawing's horizontal scale kx (px per metre). */
export function wallPx(t: number, kx: number, dPx: number): number {
  return Math.min(Math.max(t * kx, VIA_PX.wallMin), VIA_PX.wallMax, dPx / 3);
}

/**
 * Plated barrel from y0 to y1 centred on cx: two copper walls of width w inside a drill of dPx, and the hole interior
 * (air with a dashed edge, epoxy or solder fill, or solid copper fill). Returns the interior span.
 */
export function viaBarrel(sch: Schematic, cx: number, y0: number, y1: number, dPx: number, w: number, o: { fill?: ViaFill; tone?: Tone } = {}): Span {
  const xl = cx - dPx / 2;
  const xr = cx + dPx / 2;
  const fill = o.fill ?? 'none';
  if (fill === 'cu') {
    pcbRect(sch, 'cu', xl, y0, dPx, y1 - y0, { tone: o.tone ?? '' });
  } else {
    pcbRect(sch, 'cu', xl, y0, w, y1 - y0, { tone: o.tone ?? '' });
    pcbRect(sch, 'cu', xr - w, y0, w, y1 - y0, { tone: o.tone ?? '' });
    pcbRect(sch, fill === 'epoxy' ? 'resin' : fill === 'solder' ? 'solder' : 'air', xl + w, y0, dPx - 2 * w, y1 - y0);
  }
  return [xl + w, xr - w];
}

/** Gold (ENIG) finish on the exposed face of a copper feature; side 'top' sits on y, 'bottom' hangs below y. */
export function viaFinish(sch: Schematic, spans: Span[], y: number, side: 'top' | 'bottom'): void {
  for (const [a, b] of spans) if (b - a > 0.5) pcbRect(sch, 'gold', a, side === 'top' ? y - VIA_PX.gold : y, b - a, VIA_PX.gold);
}

/**
 * Conformal solder mask over one face. `surf` is the laminate surface y; `raised` are spans where copper sits on the
 * surface (the mask rides over them); `open` are mask openings. side 'top': mask above the surface, 'bottom': below.
 */
export function viaMask(sch: Schematic, x0: number, x1: number, surf: number, side: 'top' | 'bottom', raised: Span[], open: Span[] = []): void {
  const cuts = [...raised.flat(), ...open.flat()].filter((x) => x > x0 && x < x1);
  const xs = [x0, ...cuts, x1].sort((a, b) => a - b);
  const m = VIA_PX.mask;
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    if (b - a < 0.2) continue;
    const mid = (a + b) / 2;
    if (open.some(([p, q]) => mid > p && mid < q)) continue;
    const up = raised.some(([p, q]) => mid > p && mid < q) ? VIA_PX.cu : 0;
    pcbRect(sch, 'mask', a, side === 'top' ? surf - up - m : surf + up, b - a, m);
  }
}

/** Top view of a round pad (gold if exposed, cu if bare, maskCu under mask) with its drilled hole. */
export function viaPadTop(sch: Schematic, cx: number, cy: number, padPx: number, holePx: number, o: { mat?: PcbMat; tone?: Tone; plated?: boolean } = {}): void {
  pcbShape(sch, o.mat ?? 'gold', 'circle', { cx, cy, r: padPx / 2 }, { tone: o.tone ?? '' });
  if (holePx > 0) pcbShape(sch, 'hole', 'circle', { cx, cy, r: holePx / 2 });
}

/** The legend names used by every via drawing (kit colours, via-specific wording). */
export const VIA_NAMES: Partial<Record<PcbMat, string>> = { cu: 'Copper', gold: 'ENIG finish', air: 'Hole (air)', part: 'Package', hole: 'Drilled hole', fr4: 'Laminate (FR-4)', mask: 'Solder mask' };

/** Legend at the bottom-left, kit order, only the materials passed. Returns the height used. */
export function viaLegend(sch: Schematic, x: number, y: number, mats: PcbMat[], o: { cols?: number; colW?: number; names?: Partial<Record<PcbMat, string>> } = {}): number {
  const ORDER: PcbMat[] = ['mask', 'maskCu', 'cu', 'gold', 'paste', 'solder', 'fr4', 'fr4Bare', 'silk', 'hole', 'air', 'resin', 'part'];
  const uniq = ORDER.filter((m) => mats.includes(m));
  return pcbLegend(sch, x, y, uniq, { cols: o.cols ?? 4, colW: o.colW ?? 104, names: { ...VIA_NAMES, ...o.names } });
}

export const clampPx = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
