/**
 * Embedded resistor drawing.
 *  - Top: the inner layer seen from above (the prepreg over it removed): the resistive element (`film`) between
 *    two copper terminations, L and W on one scale. Thin film: the film also runs under the copper (dashed
 *    edge, the termination overlap). PTF: the printed ink overlaps onto the copper. A meander is drawn
 *    schematically with its corner count.
 *  - Bottom: the section along the element, on the same horizontal scale; thin layers (film, copper) are drawn
 *    at a legible thickness, not to scale.
 * Materials come from the shared PCB kit (core/schematic/pcb.ts).
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { ErState } from './def';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function resistorDiagram(s: ErState, r: CalcReport): SVGSVGElement | null {
  if (!(s.w > 0) || !(s.l > 0)) return null;
  const sch = new Schematic(460, 336);
  const res = r.results.find((x) => x.key === s.solveFor && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === s.solveFor ? (failed ? 'hl' : 'solved') : '');
  const eq = (sym: string, k: string, txt: string) => {
    const v = k === s.solveFor && failed ? (res?.display ?? '—') : txt;
    return /^[<>]/.test(v) ? `${sym} ${v}` : `${sym} = ${v}`;
  };
  const det = !failed ? (r.details as { n: number; pMax: number } | undefined) : undefined;
  const ptf = s.tech === 'ptf';
  const xL = 20;
  const xR = 440;
  const over = det != null && s.p > det.pMax;

  // ── header
  sch.text(xL, 20, eq('R', 'r', si(s.r, 'Ω', 4)), `sch-caption ${tone('r')}`.trim(), 'start');
  if (det) sch.text(xL + 120, 20, `${det.n.toPrecision(3)} squares × ${si(s.rs, 'Ω', 3)}/□`, 'sch-caption', 'start');
  sch.text(xR, 20, s.mat === 'Custom' ? (ptf ? 'printed ink (PTF)' : 'thin-film foil') : s.mat, 'sch-hint', 'end');

  // ── top view (inner layer, plan)
  const yT0 = 34;
  const yT1 = 168;
  const yc = (yT0 + yT1) / 2 + 6;
  pcbRect(sch, 'fr4', xL, yT0, xR - xL, yT1 - yT0, { layer: 'back' });
  const meander = s.nc > 0;
  let xa: number;
  let xb: number;
  let wPx: number;
  let extPx: number;
  let note: string;
  if (!meander) {
    // one scale k for L and W; the element and its overlaps at most 300 × 70 px
    const PAD = 40;
    const k = Math.min((xR - xL - 2 * PAD) / (s.l + 2 * s.ext), 70 / (s.w + 2 * s.ext));
    const widened = k * s.w < 4;
    const lPx = Math.max(k * s.l, 3);
    wPx = Math.max(k * s.w, 4);
    extPx = clamp(k * s.ext, 2, 30);
    note = widened ? 'W widened to be visible' : 'L and W to scale';
    if (k * s.l < 3) note = 'L widened to be visible';
    const cx = (xL + xR) / 2;
    xa = cx - lPx / 2;
    xb = cx + lPx / 2;
    const hPad = wPx + 2 * extPx;
    // copper terminations from the edges, wider than the element by the overlap
    pcbRect(sch, 'cu', xL, yc - hPad / 2, xa - xL, hPad);
    pcbRect(sch, 'cu', xb, yc - hPad / 2, xR - xb, hPad);
    if (ptf) pcbRect(sch, 'film', xa - extPx, yc - wPx / 2, xb - xa + 2 * extPx, wPx, { tone: over ? 'hl' : '' });
    // thin film: the resistive layer lies under all the copper of the first etch, hidden by it from above
    else pcbRect(sch, 'film', xa, yc - wPx / 2, xb - xa, wPx, { tone: over ? 'hl' : '' });
    // L above, W inside near the left end
    const yL = yc - hPad / 2 - 12;
    sch.shape('line', { x1: xa, y1: yc - wPx / 2, x2: xa, y2: yL - 4, class: 'sch-dim' });
    sch.shape('line', { x1: xb, y1: yc - wPx / 2, x2: xb, y2: yL - 4, class: 'sch-dim' });
    sch.dim([xa, yL], [xb, yL], '', { tone: tone('l') });
    sch.text((xa + xb) / 2, yL - 7, eq('L', 'l', si(s.l, 'm', 4)), `sch-label sch-halo ${tone('l')}`.trim(), 'middle');
    const wTxt = eq('W', 'w', si(s.w, 'm', 3));
    if (xb + 16 <= xR - 70) {
      // on the right termination, with extension lines from the element edges
      const xW = xR - 70;
      sch.dim([xW, yc - wPx / 2], [xW, yc + wPx / 2], '', { tone: tone('w') });
      sch.shape('line', { x1: xb, y1: yc - wPx / 2, x2: xW + 4, y2: yc - wPx / 2, class: 'sch-dim' });
      sch.shape('line', { x1: xb, y1: yc + wPx / 2, x2: xW + 4, y2: yc + wPx / 2, class: 'sch-dim' });
      sch.text(xW + 8, yc + 4, wTxt, `sch-label sch-halo ${tone('w')}`.trim(), 'start');
    } else {
      // a long element fills the drawing: mark W across it near the middle, label below
      const xW = (xa + xb) / 2 + 40;
      sch.dim([xW, yc - wPx / 2], [xW, yc + wPx / 2], '', { tone: tone('w') });
      sch.text(xW, yc + hPad / 2 + 16, wTxt, `sch-label sch-halo ${tone('w')}`.trim(), 'middle');
    }
  } else {
    // meander, drawn schematically: legs joined alternately at top and bottom
    const legs = clamp(Math.floor(s.nc / 2) + 1, 2, 9);
    const span = 250;
    wPx = clamp(span / (2 * legs - 1), 6, 16);
    const pitch = 2 * wPx;
    const h = 74;
    const x0 = (xL + xR) / 2 - ((2 * legs - 1) * wPx) / 2;
    const yTop = yc - h / 2;
    for (let i = 0; i < legs; i++) pcbRect(sch, 'film', x0 + i * pitch, yTop, wPx, h, { tone: over ? 'hl' : '' });
    for (let i = 0; i < legs - 1; i++) {
      const atTop = i % 2 === 0;
      pcbRect(sch, 'film', x0 + i * pitch, atTop ? yTop - wPx : yTop + h, pitch + wPx, wPx, { tone: over ? 'hl' : '' });
    }
    // terminations at the free ends (bottom of the first leg; top or bottom of the last)
    const lastTop = legs % 2 === 0;
    pcbRect(sch, 'cu', xL, yTop + h - 18, x0 - xL, 18);
    pcbRect(sch, 'cu', x0, yTop + h - 18, wPx, 18);
    const xe = x0 + (legs - 1) * pitch;
    pcbRect(sch, 'cu', xe, lastTop ? yTop : yTop + h - 18, xR - xe, 18);
    extPx = 0;
    xa = x0;
    xb = xe + wPx;
    sch.text(xL + 6, yT0 + 14, eq('L', 'l', si(s.l, 'm', 4)) + ' straight', `sch-label sch-halo ${tone('l')}`.trim(), 'start');
    sch.text(xR - 6, yT0 + 14, eq('W', 'w', si(s.w, 'm', 3)), `sch-label sch-halo ${tone('w')}`.trim(), 'end');
    note = `meander, schematic · ${s.nc} corners × 0.56 squares`;
  }
  // nothing to say about the scale when the length or width is the answer and none was found
  if (failed && s.solveFor !== 'r') note = 'drawn with the last width and length';
  sch.text(xL, yT1 + 14, note + (!ptf && !meander ? ' · film also under all the Cu' : ''), 'sch-hint', 'start');
  sch.text(xR, yT1 + 14, 'inner layer, plan view', 'sch-hint', 'end');

  // ── section along the element
  const yP = 196; // prepreg top
  const yF = 262; // core top
  const yB = 296;
  const cuT = 7;
  const fT = 3;
  const sa = meander ? 150 : xa;
  const sb = meander ? 310 : xb;
  const se = meander ? 10 : extPx;
  pcbRect(sch, 'fr4', xL, yF, xR - xL, yB - yF, { layer: 'back' });
  pcbRect(sch, 'fr4', xL, yP, xR - xL, yF - yP - (ptf ? 0 : fT), { layer: 'back' });
  if (ptf) {
    pcbRect(sch, 'cu', xL, yF - cuT, sa - xL, cuT);
    pcbRect(sch, 'cu', sb, yF - cuT, xR - sb, cuT);
    // ink between the terminations, lapping onto them
    const yI0 = yF - cuT - 3;
    pcbShape(sch, 'film', 'path', { d: `M ${sa - se} ${yI0} H ${sb + se} V ${yF - cuT} H ${sb} V ${yF} H ${sa} V ${yF - cuT} H ${sa - se} Z` }, { tone: over ? 'hl' : '' });
  } else {
    // film on the core under the element and under all the copper; copper on top at the ends
    pcbRect(sch, 'film', xL, yF - fT, xR - xL, fT, { tone: over ? 'hl' : '' });
    pcbRect(sch, 'cu', xL, yF - fT - cuT, sa - xL, cuT);
    pcbRect(sch, 'cu', sb, yF - fT - cuT, xR - sb, cuT);
  }
  // current path
  const yI = yF - 32;
  sch.arrow([sa + 10, yI], [sb - 10, yI], { head: 6, tone: over ? 'hl' : '' });
  sch.text((sa + sb) / 2, yI - 6, over ? `P > P_max (${si(det!.pMax, 'W', 3)})` : 'I through the film only', `sch-value sch-halo ${over ? 'hl' : ''}`.trim(), 'middle');
  sch.text(xL + 6, yP + 13, 'prepreg', 'sch-hint sch-halo', 'start');
  sch.text(xL + 6, yB - 6, 'core', 'sch-hint sch-halo', 'start');
  sch.text(xL + 6, yF - (ptf ? cuT : fT + cuT) - 5, 'Cu termination', 'sch-hint sch-halo', 'start');
  sch.text(xR, yB + 14, `section along the element · thicknesses not to scale${meander ? ' · lengths schematic' : ''}`, 'sch-hint', 'end');

  pcbLegend(sch, xL, 330, ['cu', 'fr4', 'film'], { cols: 3, colW: 130, names: { fr4: 'Laminate', film: ptf ? 'Resistive ink (PTF)' : 'Resistive film' } });
  return sch.svg();
}
