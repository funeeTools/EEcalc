/**
 * Asymmetric edge-coupled stripline cross-section: two planes, the pair H₁ above the lower plane and H₂ below the
 * upper one, gap S. Same frame and helpers as the dual-stripline drawing; W, S and T on one scale (§7b), the
 * heights too where they fit. Odd-mode field: across the gap and to both planes, more to the nearer one.
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbRect } from '@/core/schematic/pcb';
import { SF, type Tone, captionRow, cutW, fLen, hDimW, legendRow, planes, vDimR } from '../dual-stripline/diagram';
import { scaleHint, stackScale } from '../dual-stripline/scale';
import type { AsymPairState } from './def';

/** Widest the pair (W + S + W) is drawn before it runs past the board edges. */
const SPAN_MAX = 300;

export function asymPairDiagram(s: AsymPairState, r?: CalcReport): SVGSVGElement | null {
  if (!(s.h1 > 0) || !(s.h2 > 0) || !(s.w > 0) || !(s.s > 0) || !(s.t >= 0)) return null;
  const sch = new Schematic(SF.width, SF.height);
  const k = s.solveFor;
  const failed = !!r && !r.ok;
  const tone = (key: string): Tone => (key === k ? (failed ? 'hl' : 'solved') : '');
  const val = (key: string, text: string) => (failed && key === k ? '—' : text);

  const sc = stackScale(2 * s.w + s.s, s.t, [s.h1, s.h2], 1, SF.avail, SPAN_MAX);
  const { k: px, tPx } = sc;
  const [h1Px, h2Px] = sc.hPx;
  const stack = h1Px + h2Px + tPx;
  const yTop = SF.yMid - stack / 2;
  const yBot = yTop + stack;
  const yTb = yBot - h1Px;
  const yTt = yTb - tPx;
  const yc = yTb - tPx / 2;
  const cx = (SF.xL + SF.xR) / 2;
  // gap to scale. When the pair runs past the edges, 150 px of the left trace stay in view for its W label and at
  // least 30 px of the right one; a gap wider than what is left is shortened (and the hint says so)
  const CUT_LEFT = 150;
  const sMaxCut = SF.xR - SF.xL - CUT_LEFT - 30;
  let sPx = s.s * px;
  let wPx = s.w * px;
  const narrow = !sc.cut && wPx < 3;
  if (narrow) wPx = 3;
  const sShort = sc.cut && sPx > sMaxCut;
  if (sShort) sPx = sMaxCut;
  const xg0 = sc.cut ? SF.xL + CUT_LEFT : cx - sPx / 2; // inner edges
  const xg1 = xg0 + sPx;
  const xa = sc.cut ? SF.xL : xg0 - wPx; // outer edges (board edges when cut)
  const xb = sc.cut ? SF.xR : xg1 + wPx;

  planes(sch, yTop, yBot);
  pcbRect(sch, 'cu', xa, yTt, xg0 - xa, tPx);
  pcbRect(sch, 'cu', xg1, yTt, xb - xg1, tPx);

  // ── odd-mode field: + trace to − trace across the gap, and each trace to the planes (more to the nearer one)
  const arrow = (a: [number, number], b: [number, number]) => sch.arrow(a, b, { dashed: true, head: 5 });
  if (sPx >= 24) arrow([xg0 + 3, yc], [xg1 - 3, yc]);
  // cut: field arrows near the gap, clear of the W arrows and the εr label at the board edges
  const xo0 = sc.cut ? xg0 - 26 : SF.xL + 22 > xa ? SF.xL + 22 : xa;
  const xo1 = sc.cut ? Math.min(xg1 + 26, SF.xR - 22) : SF.xR - 22 < xb ? SF.xR - 22 : xb;
  // W (and T) sit in the taller of the two layers, S on the other side or stacked beyond W; the field arrows start
  // clear of those labels
  const above = h2Px >= h1Px;
  const roomA = h2Px;
  const roomB = h1Px;
  const wRoom = above ? roomA : roomB;
  const sRoom = above ? roomB : roomA;
  const labelled = !sc.cut && wRoom >= 30;
  const sStacked = !sc.cut && sRoom < 30 && wRoom >= 52;
  const clear = sStacked ? 56 : 32;
  const yUp = labelled && above ? yTt - clear : yTt - 3;
  const yDn = labelled && !above ? yTb + clear - 2 : yTb + 3;
  // from the + trace to each plane, and from each plane into the − trace (where the layer is tall enough); when
  // the pair is cut the W arrows run along the W side, so only the other layer gets field arrows
  if (yBot - 3 - yDn >= 12 && !(sc.cut && !above)) {
    arrow([xo0 + 4, yDn], [xo0 - 14, yBot - 3]);
    arrow([xo1 + 14, yBot - 3], [xo1 - 4, yDn]);
  }
  if (yUp - yTop - 3 >= 12 && !(sc.cut && above)) {
    arrow([xo0 + 4, yUp], [xo0 - 14, yTop + 3]);
    arrow([xo1 + 14, yTop + 3], [xo1 - 4, yUp]);
  }
  if (!sc.cut) {
    sch.text(xa - 7, yc + 5, '+', 'sch-label sch-halo', 'end');
    sch.text(xb + 7, yc + 5, '−', 'sch-label sch-halo', 'start');
  }

  // ── W and S: W over the left trace in the taller layer next to it, S on the other side of the gap
  const wText = `W = ${val('w', fLen(s.w))}`;
  const sText = `S = ${val('s', fLen(s.s))}`;
  if (sc.cut) {
    cutW(sch, above ? yTt - Math.min(roomA / 2, 16) : yTb + Math.min(roomB / 2, 16), wText, tone('w'), SF.xL, xg0 - 4);
  } else if ((above ? roomA : roomB) >= 30) {
    if (above) hDimW(sch, xa, xg0, yTt - 11, yTt, wText, tone('w'), 'above');
    else hDimW(sch, xa, xg0, yTb + 11, yTb, wText, tone('w'), 'below');
  } else hDimW(sch, xa, xg0, above ? yTt - 6 : yTb + 6, above ? yTt : yTb, wText, tone('w'), 'left');
  // S on the side away from W
  const sAbove = !above;
  if (sRoom >= 30) hDimW(sch, xg0, xg1, sAbove ? yTt - 11 : yTb + 11, sAbove ? yTt : yTb, sText, tone('s'), sAbove ? 'above' : 'below');
  // that side too thin: stack S beyond W on the W side, or (both thin) under the gap with a halo over the copper
  else if (sStacked) hDimW(sch, xg0, xg1, above ? yTt - 34 : yTb + 34, above ? yTt : yTb, sText, tone('s'), above ? 'above' : 'below');
  else hDimW(sch, xg0, xg1, sAbove ? yTt - 6 : yTb + 6, sAbove ? yTt : yTb, sText, tone('s'), sAbove ? 'above' : 'below');

  // ── T beside the right trace (inside the board when cut), εr in the lower layer
  if (s.t > 0) {
    // over the right trace on the W side when it clears the W label; else on the S side, right of the S label
    const tText = `T = ${fLen(s.t)}`;
    const cw = 6.2; // px per character, roughly
    const xRight = sc.cut ? Math.min((xg1 + SF.xR) / 2 - 10, SF.xR - (tText.length * cw) / 2 - 2) : (xg1 + xb) / 2;
    const xWlab = sc.cut ? (SF.xL + xg0) / 2 : (xa + xg0) / 2;
    const clear = xRight - xWlab >= ((wText.length + tText.length) * cw) / 2 + 10;
    if (clear && (labelled || sc.cut)) sch.text(xRight, above ? yTt - 7 : yTb + 15, tText, 'sch-value sch-halo', 'middle');
    else {
      const x = Math.min(Math.max(xRight, cx + (sText.length * cw) / 2 + (tText.length * cw) / 2 + 10, xb + 20 + (tText.length * cw) / 2), SF.xR - (tText.length * cw) / 2 - 4);
      sch.text(x, above ? yTb + 15 : yTt - 7, tText, 'sch-value sch-halo', 'middle');
    }
  }
  if (h1Px >= 18) sch.text(SF.xL + 6, yBot - 5, `ε_r = ${+s.er.toPrecision(4)}`, 'sch-label sch-halo', 'start');

  // ── heights on the right
  vDimR(sch, yTb, yBot, 'H₁', val('h1', fLen(s.h1)), tone('h1'));
  vDimR(sch, yTop, yTt, 'H₂', val('h2', fLen(s.h2)), tone('h2'));

  // ── caption and hint
  const zd = r?.ok ? r.results.find((x) => x.key === 'zdiff') : undefined;
  const zc = r?.ok ? r.results.find((x) => x.key === 'zcm') : undefined;
  captionRow(sch, [{ text: `Z_diff = ${zd ? zd.display : k === 'zdiff' ? '—' : `${+s.zdiff.toPrecision(4)} Ω`}`, tone: k === 'zdiff' ? (failed ? 'hl' : 'solved') : '' }, ...(zc ? [{ text: `Z_cm = ${zc.display}` }] : []), { text: `H₂/H₁ = ${(s.h2 / s.h1).toPrecision(3)}` }]);
  if (!(failed && (k === 'w' || k === 's'))) sch.text(SF.xL, SF.yHint, `${scaleHint(sc, narrow)}${sShort ? ' · S shortened' : ''}`, 'sch-hint', 'start');
  legendRow(sch);
  return sch.svg();
}
