/**
 * Crosstalk drawing: a top view of the aggressor and victim over the coupled length (driver, receivers,
 * terminations; NEXT travelling back to the victim's near end, FEXT forward to its far end) above the
 * cross-section of the pair (microstrip or stripline) with W, S, H. Materials from the shared PCB kit.
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbLegend, pcbRect, pcbShape, type PcbMat } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { XtState } from './def';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const fLen = (m: number) => si(m, 'm', 3);

const strip0 = (s: XtState) => s.topo === 'stripline';

export function xtDiagram(s: XtState, r: CalcReport): SVGSVGElement | null {
  if (!(s.w > 0) || !(s.s > 0) || !(s.h > 0)) return null;
  const sch = new Schematic(460, strip0(s) ? 358 : 344);
  const solved = s.solveFor;
  const ok = r.ok;
  const tone = (k: string) => (k === solved ? (ok ? 'solved' : 'hl') : '');
  const get = (k: string) => (ok ? r.results.find((x) => x.key === k) : undefined);
  const next = get('next');
  const fext = get('fext');
  const strip = s.topo === 'stripline';
  const isFext = s.metric === 'fext';

  // ── top view: aggressor and victim on the layer, coupled over ℓ
  const yB0 = 54;
  const yB1 = 158;
  pcbRect(sch, 'fr4Bare', 14, yB0, 432, yB1 - yB0, { layer: 'back', rx: 3 });
  const wTop = clamp((s.w / s.h) * 8, 4, 9);
  const gTop = clamp((s.s / s.w) * wTop, 6, 30);
  const yA = 92;
  const yV = yA + wTop + gTop;
  const xa0 = 92;
  const xa1 = 366;
  // microstrip: the traces are on the surface (bare copper); stripline: on an inner layer, reached by vias
  pcbRect(sch, strip ? 'cuHidden' : 'cu', xa0, yA, xa1 - xa0, wTop);
  pcbRect(sch, strip ? 'cuHidden' : 'cu', xa0, yV, xa1 - xa0, wTop);
  if (strip)
    for (const x of [xa0, xa1])
      for (const y of [yA + wTop / 2, yV + wTop / 2]) {
        pcbShape(sch, 'cu', 'circle', { cx: x, cy: y, r: 4.6 });
        pcbShape(sch, 'hole', 'circle', { cx: x, cy: y, r: 2 });
      }
  // driver and receiver on the aggressor; terminations at both victim ends
  pcbRect(sch, 'part', 34, yA - 12, 52, wTop + 14, { rx: 2 });
  pcbRect(sch, 'part', 372, yA - 12, 52, wTop + 14, { rx: 2 });
  pcbRect(sch, 'part', 60, yV - 3, 26, wTop + 6, { rx: 2 });
  pcbRect(sch, 'part', 372, yV - 3, 26, wTop + 6, { rx: 2 });
  sch.text(60, yA - 17, 'driver', 'sch-hint sch-halo', 'middle');
  sch.text(398, yA - 17, 'receiver', 'sch-hint sch-halo', 'middle');
  sch.text(55, yV + wTop / 2 + 4, 'Z₀', 'sch-value sch-halo', 'end');
  sch.text(403, yV + wTop / 2 + 4, 'Z₀', 'sch-value sch-halo', 'start');
  sch.text(xa0 + 8, yA - 6, 'aggressor', 'sch-hint sch-halo', 'start');
  sch.text(xa0 + 8, yV + wTop + 13, 'victim', 'sch-hint sch-halo', 'start');
  // the edge travelling on the aggressor
  sch.arrow([150, yA - 9], [196, yA - 9], { head: 6 });
  sch.text(200, yA - 5, `t_r = ${si(s.tr, 's', 3)}`, 'sch-value sch-halo', 'start');
  // coupled length above the board
  const ext = (x: number, y0: number, y1: number) => sch.shape('line', { x1: x, y1: y0, x2: x, y2: y1, class: 'sch-dim' });
  ext(xa0, yA - 2, yB0 - 12);
  ext(xa1, yA - 2, yB0 - 12);
  sch.dim([xa0, yB0 - 8], [xa1, yB0 - 8], `ℓ = ${solved === 'len' && !ok ? '—' : fLen(s.len)}`, { tone: tone('len'), off: 6 });
  // NEXT back to the near end, FEXT forward to the far end (labels below the board)
  const yArr = yV + wTop + 24;
  sch.arrow([150, yArr], [100, yArr], { head: 6, tone: !isFext && solved === 'xt' ? (ok ? 'solved' : 'hl') : '' });
  sch.arrow([306, yArr], [356, yArr], { head: 6, tone: isFext && solved === 'xt' ? (ok ? 'solved' : 'hl') : '', dashed: strip });
  const nTone = !isFext && solved === 'xt' ? tone('xt') : '';
  const fTone = isFext && solved === 'xt' ? tone('xt') : '';
  sch.text(92, yB1 + 16, `NEXT ${next ? next.display.split(' · ')[0] : '—'}`, `sch-label ${nTone}`.trim(), 'start');
  sch.text(92, yB1 + 30, 'near end, backward', 'sch-hint', 'start');
  sch.text(366, yB1 + 16, `FEXT ${strip ? '0' : fext ? fext.display.split(' · ')[0] : '—'}`, `sch-label ${fTone}`.trim(), 'end');
  sch.text(366, yB1 + 30, strip ? 'far end: none in stripline' : 'far end, forward', 'sch-hint', 'end');

  // ── cross-section
  const yPl = 294;
  const hPx = strip ? 32 : 46;
  let wPx = clamp((s.w / s.h) * hPx, 12, 80);
  let sPx = clamp((s.s / s.h) * hPx, 10, 110);
  if (2 * wPx + sPx > 230) {
    const f = 230 / (2 * wPx + sPx);
    wPx *= f;
    sPx *= f;
  }
  const tPx = s.t > 0 ? clamp((s.t / s.h) * hPx, 2.5, 12) : 1.5;
  const xL = 60;
  const xR = 360;
  const cx = (xL + xR) / 2;
  const x1 = cx - sPx / 2 - wPx;
  const x2 = cx + sPx / 2;
  let yTr: number;
  let ySub: number;
  if (strip) {
    ySub = yPl - 2 * hPx - tPx;
    yTr = ySub + hPx;
    pcbRect(sch, 'fr4', xL, ySub, xR - xL, 2 * hPx + tPx, { layer: 'back' });
    pcbRect(sch, 'cu', xL, ySub - 6, xR - xL, 6, { layer: 'back' });
  } else {
    ySub = yPl - hPx;
    yTr = ySub - tPx;
    pcbRect(sch, 'fr4', xL, ySub, xR - xL, hPx, { layer: 'back' });
  }
  pcbRect(sch, 'cu', xL, yPl, xR - xL, 6, { layer: 'back' });
  pcbRect(sch, 'cu', x1, yTr, wPx, tPx);
  pcbRect(sch, 'cu', x2, yTr, wPx, tPx);
  // coupling: mutual C and L between the traces
  if (sPx >= 24) sch.arrow([x1 + wPx + 3, yTr + tPx / 2], [x2 - 3, yTr + tPx / 2], { head: 5 });
  sch.text(cx, yTr - 17, 'coupling C_m, L_m', 'sch-hint sch-halo', 'middle');
  // W and S as a chain under the traces (as on the embedded-pair page), A / V above them, H at the right
  const yC = yTr + tPx + 8;
  ext(x1, yTr + tPx + 2, yC + 4);
  ext(x1 + wPx, yTr + tPx + 2, yC + 4);
  ext(x2, yTr + tPx + 2, yC + 4);
  sch.dim([x1, yC], [x1 + wPx, yC], '', {});
  sch.dim([x1 + wPx, yC], [x2, yC], '', { tone: tone('s') });
  sch.text(x1 + wPx - 3, yC + 15, `W = ${fLen(s.w)}`, 'sch-label sch-halo', 'end');
  sch.text(x1 + wPx + 3, yC + 15, `S = ${solved === 's' && !ok ? '—' : fLen(s.s)}`, `sch-label sch-halo ${tone('s')}`.trim(), 'start');
  sch.text(x1 + wPx / 2, yTr - 4, 'A', 'sch-pin sch-halo', 'middle');
  sch.text(x2 + wPx / 2, yTr - 4, 'V', 'sch-pin sch-halo', 'middle');
  const xd = xR + 12;
  sch.dim([xd, yTr + tPx], [xd, yPl], '', {});
  sch.text(xd + 6, (yTr + tPx + yPl) / 2 + 4, `H = ${fLen(s.h)}`, 'sch-value', 'start');
  sch.text(xL - 6, yPl - 4, `εᵣ ${+s.er.toPrecision(3)}`, 'sch-value', 'end');
  sch.text(xL - 6, yPl - 18, strip ? 'stripline' : 'microstrip', 'sch-hint', 'end');

  // ── header
  sch.text(14, 20, `${isFext ? 'FEXT' : 'NEXT'} ${solved === 'xt' ? '=' : '≤'} ${solved === 'xt' && !ok ? '—' : `${(+s.xt).toPrecision(3)} %`}`, `sch-caption ${tone('xt')}`.trim(), 'start');
  const kb = get('kb');
  if (kb) sch.text(170, 20, `K_b = ${kb.display}`, 'sch-caption', 'start');
  const mats: PcbMat[] = strip ? ['cu', 'cuHidden', 'fr4', 'fr4Bare', 'hole', 'part'] : ['cu', 'fr4', 'fr4Bare', 'part'];
  pcbLegend(sch, 14, 334, mats, strip ? { cols: 3, colW: 146 } : { colW: 108 });
  return sch.svg();
}
