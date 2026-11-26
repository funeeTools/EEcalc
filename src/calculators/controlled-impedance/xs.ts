/**
 * Shared cross-section frame for the PCB impedance drawings (controlled impedance, differential pair,
 * asymmetric stripline, broadside pair, edge-coupled stripline). One family: the same canvas, board span,
 * plane thickness, right-hand height dimensions, caption row and legend spot, so flipping between the
 * pages shows the same board with different traces. Materials come from the shared kit (core/schematic/pcb).
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { type PcbMat, pcbLegend, pcbRect } from '@/core/schematic/pcb';
import { si } from '@/core/units';

/** Canvas and board span shared by every drawing in the family. */
export const XS = {
  width: 460,
  height: 270,
  /** board left / right edge */
  xL: 30,
  xR: 392,
  /** x of the right-hand height dimensions (first column); a second column sits 54 px further right */
  xDim: 404,
  /** drawn thickness of a reference plane */
  plane: 9,
  /** caption baseline */
  yCaption: 20,
  /** legend baseline */
  yLegend: 258,
} as const;

export const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
export const fLen = (m: number) => si(m, 'm', 3);

export type DimTone = '' | 'solved' | 'hl';

export function newFrame(): Schematic {
  return new Schematic(XS.width, XS.height);
}

/**
 * Vertical height dimension at x from y0 to y1 with the symbol and value to its right
 * (stacked when there is room, on one line when the span is short).
 */
export function vDim(sch: Schematic, x: number, y0: number, y1: number, sym: string, val: string, tone: DimTone = '', halo = false): void {
  const cls = (c: string) => `${c}${halo ? ' sch-halo' : ''} ${tone}`.trim();
  sch.dim([x, y0], [x, y1], '', { tone });
  const ym = (y0 + y1) / 2;
  if (y1 - y0 >= 12) {
    sch.text(x + 6, ym - 5, sym, cls('sch-label'), 'start');
    sch.text(x + 6, ym + 13, val, cls('sch-value'), 'start');
  } else sch.text(x + 6, ym + 4, `${sym} ${val}`, cls('sch-value'), 'start');
}

/**
 * Horizontal dimension between x0 and x1 at height y with extension lines from yRef (the feature edge).
 * The label sits above the line (or below with `below`), centred, with a halo when it lies over a material.
 */
export function hDim(sch: Schematic, x0: number, x1: number, y: number, yRef: number, text: string, tone: DimTone = '', o: { below?: boolean; halo?: boolean; anchor?: 'start' | 'middle' | 'end'; dx?: number } = {}): void {
  const ext = (x: number) => sch.shape('line', { x1: x, y1: yRef + (y < yRef ? -1.5 : 1.5), x2: x, y2: y + (y < yRef ? -2 : 2), class: 'sch-dim' });
  if (Math.abs(y - yRef) > 4) {
    ext(x0);
    ext(x1);
  }
  sch.dim([x0, y], [x1, y], '', { tone });
  const anchor = o.anchor ?? 'middle';
  const x = anchor === 'middle' ? (x0 + x1) / 2 : anchor === 'start' ? x1 + (o.dx ?? 6) : x0 - (o.dx ?? 6);
  const ty = anchor === 'middle' ? (o.below ? y + 14 : y - 6) : y + 4;
  sch.text(x, ty, text, `sch-label${o.halo ? ' sch-halo' : ''} ${tone}`.trim(), anchor);
}

/** A copper reference plane across the board. */
export function plane(sch: Schematic, y: number): void {
  pcbRect(sch, 'cu', XS.xL, y, XS.xR - XS.xL, XS.plane, { layer: 'back' });
}

/** A laminate layer across the board. */
export function laminate(sch: Schematic, y: number, h: number): void {
  pcbRect(sch, 'fr4', XS.xL, y, XS.xR - XS.xL, h, { layer: 'back' });
}

/** Caption row: impedance results, the solved one green (red when the solve failed). */
export function caption(sch: Schematic, items: { text: string; tone?: DimTone }[]): void {
  let x = XS.xL;
  for (const it of items) {
    sch.text(x, XS.yCaption, it.text, `sch-caption ${it.tone ?? ''}`.trim(), 'start');
    x += Math.max(120, it.text.length * 7.2 + 18);
  }
}

/** Legend of the materials drawn, at the family's fixed spot (bottom-left). */
export function legend(sch: Schematic, mats: PcbMat[], names?: Partial<Record<PcbMat, string>>): void {
  pcbLegend(sch, XS.xL, XS.yLegend, mats, { cols: 4, colW: 104, names });
}

/** E-field arrows (what the impedance is about): from a to b, dashed so they read as field, not as parts. */
export function field(sch: Schematic, a: [number, number], b: [number, number]): void {
  sch.arrow(a, b, { dashed: true, head: 5 });
}

/**
 * Solved-dimension helpers for a report: tone of a key ('solved' green, 'hl' red when the solve failed)
 * and its display value ('—' when the solve failed, so a stale number is never labelled).
 */
export function solveTones(solveFor: string, r?: CalcReport) {
  const failed = !!r && !r.ok;
  return {
    failed,
    tone: (k: string): DimTone => (k === solveFor ? (failed ? 'hl' : 'solved') : ''),
    val: (k: string, text: string) => (failed && k === solveFor ? '—' : text),
  };
}
