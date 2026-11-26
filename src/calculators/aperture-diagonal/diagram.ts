/**
 * Aperture diagonal drawing: two top views on one scale.
 *  - Left: the covering drilled hole (on the fabricator's grid) round the rectangle, with its diagonal; for a
 *    lead, the hole is plated and sits in a gold (ENIG) pad.
 *  - Right: the routed opening, grown so a square-cornered rectangle clears the cutter-radius fillets.
 * Board materials come from the shared PCB kit (core/schematic/pcb.ts): mask over the board, gold pads, the
 * hole you look through (`hole`), a pin or tab as tin-plated metal (`solder`), any other part to clear as `part`.
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { type PcbMat, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { ApState } from './def';
import { aperture } from './model';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function apertureDiagram(s: ApState, r: CalcReport): SVGSVGElement | null {
  if (!(s.l > 0) || !(s.w > 0) || !(s.dr > 0) || !(s.step > 0)) return null;
  const sch = new Schematic(460, 304);
  const res = r.results.find((x) => x.key === s.solveFor && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === s.solveFor ? (failed ? 'hl' : 'solved') : '');
  const lead = s.fit !== 'clear';
  const o = aperture(s.l, s.w, s.c, s.step, s.dMin, s.dMax, s.dr);
  const holeOk = Number.isFinite(o.hole);
  const dHole = holeOk ? o.hole : o.dReq;
  const xL = 20;
  const xR = 440;

  // ── header
  // the diagonal is calculated in analysis and is the target otherwise (also when no side meets it)
  const dTxt = s.solveFor === 'd' ? (failed ? '—' : si(o.d, 'm', 4)) : si(s.d, 'm', 4);
  sch.text(xL, 20, `d = ${dTxt}`, `sch-caption ${tone('d')}`.trim(), 'start');
  const side = s.solveFor === 'l' || s.solveFor === 'w' ? `${s.solveFor === 'l' ? 'L' : 'W'} = ${failed ? (res?.display ?? '—') : si(s[s.solveFor], 'm', 4)}` : '';
  if (side) sch.text(xL + 130, 20, side, `sch-caption ${tone(s.solveFor)}`.trim(), 'start');
  sch.text(xR, 20, lead ? `lead · c = ${si(s.c, 'm', 3)} over the diagonal` : 'opening only, no clearance', 'sch-hint', 'end');

  // ── one scale k (px per metre) for both panels
  const ring = lead ? 7 : 0; // pad ring, a legible width (not to scale)
  const span = Math.max(dHole, o.lo, o.wo);
  const k = Math.min((140 - 2 * ring) / span, (124 - 2 * ring) / Math.max(dHole, o.wo));
  const y0 = 46;
  const y1 = 236;
  const cy = (y0 + y1) / 2 - 4;
  const pL = { x0: xL, x1: 222, cx: 121 };
  const pR = { x0: 238, x1: xR, cx: 339 };
  for (const p of [pL, pR]) pcbRect(sch, 'mask', p.x0, y0, p.x1 - p.x0, y1 - y0, { layer: 'back' });
  const lPx = Math.max(k * s.l, 2);
  const wPx = Math.max(k * s.w, 2);

  // ── left: drilled hole
  const rH = (k * dHole) / 2;
  if (lead) pcbShape(sch, 'gold', 'circle', { cx: pL.cx, cy, r: rH + ring });
  if (holeOk) pcbShape(sch, 'hole', 'circle', { cx: pL.cx, cy, r: rH });
  else pcbShape(sch, 'air', 'circle', { cx: pL.cx, cy, r: rH }, { tone: 'hl' });
  const thing = lead ? 'solder' : 'part';
  // a dark `part` on a dark `hole` needs its edge marked: dashed outline (as for air / clearance)
  const outline = (cx: number) => { if (!lead) sch.shape('rect', { x: cx - lPx / 2, y: cy - wPx / 2, width: lPx, height: wPx, class: 'xs-air' }); };
  pcbRect(sch, thing, pL.cx - lPx / 2, cy - wPx / 2, lPx, wPx);
  outline(pL.cx);
  // diagonal corner to corner
  const a: [number, number] = [pL.cx - lPx / 2, cy + wPx / 2];
  const b: [number, number] = [pL.cx + lPx / 2, cy - wPx / 2];
  sch.shape('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: `sch-dim ${tone('d')}`.trim() });
  for (const p of [a, b]) sch.shape('circle', { cx: p[0], cy: p[1], r: 2, class: `sch-dot`.trim() });
  sch.text(pL.cx - 8, cy - 5, 'd', `sch-label sch-halo ${tone('d')}`.trim(), 'end');
  // the part's L above it, W under it (inside the hole)
  const yPl = cy - wPx / 2 - 7;
  sch.dim([pL.cx - lPx / 2, yPl], [pL.cx + lPx / 2, yPl], '', { tone: tone('l') });
  sch.text(pL.cx, yPl - 7, `L = ${s.solveFor === 'l' && failed ? (res?.display ?? '—') : si(s.l, 'm', 3)}`, `sch-label sch-halo ${tone('l')}`.trim(), 'middle');
  // under the part, or on it when the part nearly fills the hole (the D label sits below the hole)
  const yWl = cy + wPx / 2 + 15 < cy + rH + ring - 2 ? cy + wPx / 2 + 15 : cy + Math.min(wPx / 4, 40) + 8;
  sch.text(pL.cx, yWl, `W = ${s.solveFor === 'w' && failed ? (res?.display ?? '—') : si(s.w, 'm', 3)}`, `sch-label sch-halo ${tone('w')}`.trim(), 'middle');
  // hole diameter under it
  const yD = cy + rH + ring + 12;
  sch.dim([pL.cx - rH, yD], [pL.cx + rH, yD], '', { tone: holeOk ? '' : 'hl' });
  sch.text(pL.cx, yD + 15, holeOk ? `D = ${si(o.hole, 'm', 3)}` : `D > ${si(s.dMax, 'm', 3)}`, `sch-label sch-halo ${holeOk ? '' : 'hl'}`.trim(), 'middle');
  sch.text(pL.cx, y1 + 16, holeOk ? `${lead ? 'finished hole' : 'hole'}, ${si(s.step, 'm', 2)} grid` : `no drill ≤ ${si(s.dMax, 'm', 3)}`, `sch-label ${holeOk ? '' : 'hl'}`.trim(), 'middle');
  sch.text(pL.cx, y1 + 30, holeOk ? `needs d + c = ${si(o.dReq, 'm', 3)}` : `needs ${si(o.dReq, 'm', 3)}: route it`, 'sch-hint', 'middle');
  sch.text(pL.x0 + 5, y0 + 13, 'drilled', 'sch-hint sch-halo', 'start');

  // ── right: routed opening
  const loPx = k * o.lo;
  const woPx = k * o.wo;
  const rr = clamp(k * o.r, 0, Math.min(loPx, woPx) / 2);
  const cutterBad = s.dr > Math.min(o.lo, o.wo) * (1 + 1e-9);
  const ox = pR.cx - loPx / 2;
  const oy = cy - woPx / 2;
  if (lead) pcbRect(sch, 'gold', ox - ring, oy - ring, loPx + 2 * ring, woPx + 2 * ring, { rx: rr + ring });
  pcbRect(sch, 'hole', ox, oy, loPx, woPx, { rx: rr, tone: cutterBad ? 'hl' : '' });
  pcbRect(sch, thing, pR.cx - lPx / 2, cy - wPx / 2, lPx, wPx);
  outline(pR.cx);
  // dimensions: L_o above, W_o at the right, r pointed at the top-right fillet
  const yLo = oy - ring - 10;
  sch.dim([ox, yLo], [ox + loPx, yLo], '');
  // centred over the opening, but ending left of the "r" label at the top-right fillet (≈ 6.6 px per character)
  const loTxt = `L_o = ${si(o.lo, 'm', 3)}`;
  const rLabelX = ox + loPx - rr * (1 - Math.SQRT1_2) + ring + 18;
  const loEnd = Math.min(pR.cx + (loTxt.length * 6.6) / 2, rr > 1.5 ? rLabelX - 8 : Infinity);
  sch.text(loEnd, yLo - 6, loTxt, 'sch-label sch-halo', 'end');
  const xWo = ox + loPx + ring + 10;
  sch.dim([xWo, oy], [xWo, oy + woPx], '');
  sch.text(xWo + 5, cy + 4, 'W_o', 'sch-label sch-halo', 'start');
  if (rr > 1.5) {
    const fx = ox + loPx - rr * (1 - Math.SQRT1_2);
    const fy = oy + rr * (1 - Math.SQRT1_2);
    // from outside the corner, over the mask, onto the fillet
    const out = ring + 16;
    sch.arrow([fx + out, fy - out], [fx + 1, fy - 1], { head: 6, tone: cutterBad ? 'hl' : '' });
    sch.text(fx + out + 2, fy - out - 3, 'r', `sch-label sch-halo ${cutterBad ? 'hl' : ''}`.trim(), 'start');
  }
  sch.text(pR.cx, oy + woPx + ring + 16, `W_o = ${si(o.wo, 'm', 3)}`, 'sch-label sch-halo', 'middle');
  sch.text(pR.cx, y1 + 16, `r = ${si(o.r, 'm', 3)} (cutter ${si(s.dr, 'm', 3)})`, `sch-label ${cutterBad ? 'hl' : ''}`.trim(), 'middle');
  sch.text(pR.cx, y1 + 30, `+${si(o.g, 'm', 3)} per side${s.c > 0 ? ', c/2 at the corners' : ''}`, `sch-hint ${cutterBad ? 'hl' : ''}`.trim(), 'middle');
  sch.text(pR.x0 + 5, y0 + 13, 'routed', 'sch-hint sch-halo', 'start');

  const mats: PcbMat[] = lead ? ['mask', 'gold', 'solder', 'hole'] : ['mask', 'hole', 'part'];
  pcbLegend(sch, xL, 296, mats, { cols: 4, colW: 108, names: { gold: 'Plated pad (ENIG)', solder: 'Pin (tin-plated)', hole: 'Hole / cutout', part: 'Part to clear' } });
  return sch.svg();
}
