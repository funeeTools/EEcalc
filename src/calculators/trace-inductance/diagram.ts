/**
 * Side view along the trace (left) with the current path, and the cross-section across it (right).
 * Isolated trace: copper bar in air, current along it, its return path somewhere else (dashed, muted).
 * Over a plane: laminate and plane under the trace, the return current in the plane right below, and the
 * current loop closed at the two ends (source and load).
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbLegend, pcbRect } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { TraceLState } from './def';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function inductanceDiagram(s: TraceLState, r: CalcReport): SVGSVGElement {
  const plane = s.topo === 'plane';
  const H = plane ? 262 : 228; // the isolated layout has nothing under the side view: no empty band above the legend
  const sch = new Schematic(460, H);
  const failed = !r.ok;
  const tone = (k: TraceLState['solveFor']) => (s.solveFor === k ? (failed ? 'hl' : 'solved') : '');
  const val = (k: TraceLState['solveFor'], txt: string) => (failed && s.solveFor === k ? '—' : txt);
  const mats: PcbMat[] = plane ? ['cu', 'fr4'] : ['cu'];

  // ── header
  const Lres = r.results.find((x) => x.key === 'L');
  const Ltxt = failed ? (s.solveFor === 'L' ? '—' : si(s.L, 'H', 4)) : Lres?.display ?? si(s.L, 'H', 4);
  sch.text(30, 20, `${plane ? 'L_loop' : 'L_partial'} ${s.solveFor === 'L' ? '=' : '≤'} ${Ltxt}`, `sch-caption ${tone('L')}`.trim(), 'start');
  sch.text(30, 37, plane ? 'trace + return current in the plane under it' : 'straight trace alone: the return path is not part of it', 'sch-hint', 'start');

  // ── side view (not to scale along ℓ)
  const x0 = 46;
  const x1 = 296;
  const tPx = 5;
  const yTr = 118; // top of the trace
  const hPx = plane ? clamp(30 * Math.sqrt(s.h / Math.max(s.w, 1e-9)) + 14, 18, 56) : 0;
  const yPl = yTr + tPx + hPx; // top of the plane
  sch.text(x0 - 16, 52, 'side view', 'sch-hint', 'start');
  if (plane) {
    pcbRect(sch, 'fr4', x0 - 16, yTr + tPx, x1 - x0 + 32, hPx, { layer: 'back' });
    pcbRect(sch, 'cu', x0 - 16, yPl, x1 - x0 + 32, 7, { layer: 'back' });
    // the loop closes through a via at each end of the trace
    pcbRect(sch, 'cu', x0, yTr, 5, yPl - yTr);
    pcbRect(sch, 'cu', x1 - 5, yTr, 5, yPl - yTr);
  }
  pcbRect(sch, 'cu', x0, yTr, x1 - x0, tPx);
  sch.dim([x0, yTr - 26], [x1, yTr - 26], `ℓ = ${val('len', si(s.len, 'm', 4))}`, { tone: tone('len') });
  sch.shape('line', { x1: x0, y1: yTr - 2, x2: x0, y2: yTr - 31, class: 'sch-dim' });
  sch.shape('line', { x1: x1, y1: yTr - 2, x2: x1, y2: yTr - 31, class: 'sch-dim' });
  // forward current on the trace
  sch.arrow([x0 + 70, yTr - 9], [x1 - 70, yTr - 9]);
  sch.text((x0 + x1) / 2, yTr - 13, 'I', 'sch-label', 'middle');
  if (plane) {
    // return current in the plane, ends closing the loop (source left, load right)
    const yRet = yPl + 3.5;
    sch.arrow([x1 - 70, yRet], [x0 + 70, yRet]);
    sch.text((x0 + x1) / 2, yPl + 22, 'return current in the plane', 'sch-hint', 'middle');
    sch.text(x0 + 2, yPl + 22, 'src', 'sch-pin', 'middle');
    sch.text(x1 - 2, yPl + 22, 'load', 'sch-pin', 'middle');
    if (hPx > 26) sch.text((x0 + x1) / 2, yTr + tPx + hPx / 2 + 4, 'loop area ≈ H·ℓ', 'sch-hint sch-halo', 'middle');
  } else {
    const yRet = yTr + 58;
    sch.arrow([x1 - 40, yRet], [x0 + 40, yRet], { dashed: true, tone: 'muted' });
    sch.text((x0 + x1) / 2, yRet + 16, 'return path: elsewhere, not included', 'sch-hint', 'middle');
    sch.text((x0 + x1) / 2, yTr + 24, 'air', 'sch-hint', 'middle');
  }

  // ── cross-section (to scale with clamped ratios)
  const cx = 374;
  sch.text(cx, 52, 'section', 'sch-hint', 'middle');
  // one scale for W, T (and H): a square bar stays square; fit within 80 px wide, 30 px thick, 60 px high
  const k = Math.min(80 / s.w, 30 / s.t, plane ? 60 / s.h : Infinity);
  const wPx = Math.max(s.w * k, 16);
  const tSec = Math.max(s.t * k, 2.5);
  // over a plane the section trace lines up with the side view; isolated, it is centred in its column
  const ySecTr = plane ? yTr + tPx - tSec : 140 - tSec / 2;
  if (plane) {
    const hSec = Math.max(s.h * k, 12);
    const ySub = ySecTr + tSec;
    pcbRect(sch, 'fr4', cx - 56, ySub, 112, hSec, { layer: 'back' });
    pcbRect(sch, 'cu', cx - 56, ySub + hSec, 112, 7, { layer: 'back' });
    sch.dim([cx + 63, ySub], [cx + 63, ySub + hSec], '', {});
    sch.text(cx + 69, ySub + hSec / 2 + 4, 'H', 'sch-label', 'start');
    sch.text(cx - 60, ySub + hSec + 22, `H = ${si(s.h, 'm', 3)}`, 'sch-value', 'start');
    sch.text(cx - 60, ySub + hSec + 38, `T = ${si(s.t, 'm', 3)}`, 'sch-value', 'start');
    // T dimension at the left edge of the trace
    const xT = cx - wPx / 2 - 9;
    sch.dim([xT, ySecTr], [xT, ySecTr + tSec], '', {});
    sch.text(xT - 5, ySecTr + tSec / 2 + 4, 'T', 'sch-label', 'end');
  }
  pcbRect(sch, 'cu', cx - wPx / 2, ySecTr, wPx, tSec);
  if (!plane) {
    // magnetic field circling the isolated trace (what its inductance stores)
    for (const [dx, dy] of [[9, 9], [22, 21]]) sch.shape('ellipse', { cx, cy: ySecTr + tSec / 2, rx: wPx / 2 + dx, ry: tSec / 2 + dy, class: 'sch-dim muted', fill: 'none', 'stroke-dasharray': '3 3' });
    sch.text(cx + wPx / 2 + 26, ySecTr + tSec / 2 + 4, 'B', 'sch-label muted', 'start');
    sch.text(cx, ySecTr + tSec + 44, `T = ${si(s.t, 'm', 3)}`, 'sch-value', 'middle');
  }
  const yW = plane ? ySecTr - 14 : ySecTr - 29;
  sch.dim([cx - wPx / 2, yW], [cx + wPx / 2, yW], `W = ${val('w', si(s.w, 'm', 3))}`, { tone: tone('w') });

  pcbLegend(sch, 30, H - 14, mats, plane ? { names: { fr4: 'Laminate' } } : {});
  return sch.svg();
}
