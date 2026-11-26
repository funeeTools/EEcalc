/**
 * Trace resistance drawing: a plan view of the trace between its two end pads (length, current, drop) above
 * a cross-section of it (width, thickness, return planes and — at AC — the skin layer the current crowds into).
 * Materials come from the shared PCB kit (core/schematic/pcb.ts).
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { type PcbMat, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import { OZ, type TrState } from './def';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function traceResistanceDiagram(s: TrState, r?: CalcReport): SVGSVGElement {
  const sch = new Schematic(460, 320);
  const solved = r?.results.find((x) => x.solved && (x.key === 'w' || x.key === 'len'));
  const failed = !!r && (!r.ok || (solved != null && solved.value == null));
  const solveW = s.solveFor === 'w' || s.solveFor === 'wV';
  const solveL = s.solveFor === 'len' || s.solveFor === 'lenV';
  const byV = s.solveFor === 'wV' || s.solveFor === 'lenV';
  const tone = (on: boolean) => (on ? (failed ? 'hl' : 'solved') : '');
  // "W = 1.2 mm", or the solver's verdict ("W > 1 m", "W = —") when it found no answer
  const eq = (sym: string, on: boolean, txt: string) => {
    const v = on && failed ? (solved?.display ?? '—') : txt;
    return /^[<>]/.test(v) ? `${sym} ${v}` : `${sym} = ${v}`;
  };
  const inner = s.ret === 'strip';
  const xL = 20;
  const xR = 440;
  const det = r?.ok && !failed ? (r.details as { delta: number; skin: number } | undefined) : undefined;

  // ── header: the answer and the conditions
  // R is calculated in analysis and when ΔV is the target; with no solution that value is stale
  sch.text(xL, 20, `R = ${failed && (s.solveFor === 'r' || byV) ? '—' : si(s.r, 'Ω', 4)}`, `sch-caption ${tone(s.solveFor === 'r')}`.trim(), 'start');
  sch.text(xR, 20, `${+(s.t / OZ).toFixed(2)} oz · ${+s.tC.toFixed(1)} °C · ${s.f > 0 ? si(s.f, 'Hz', 3) : 'DC'}`, 'sch-hint', 'end');

  // ── plan view: the trace between two end pads
  const yB0 = 34;
  const yB1 = 104;
  const yc = (yB0 + yB1) / 2;
  const pad = 22;
  const xA = 50;
  const xB = 410;
  const wTop = clamp((s.w / Math.max(s.len, 1e-9)) * (xB - xA), 5, 22);
  if (inner) {
    // inner layer seen from above with the laminate over it removed: copper on laminate, vias at the ends
    pcbRect(sch, 'fr4', xL, yB0, xR - xL, yB1 - yB0, { layer: 'back' });
    pcbRect(sch, 'cu', xA, yc - wTop / 2, xB - xA, wTop);
    for (const x of [xA, xB]) {
      pcbShape(sch, 'cu', 'circle', { cx: x, cy: yc, r: pad / 2 });
      pcbShape(sch, 'hole', 'circle', { cx: x, cy: yc, r: pad / 4.4 });
    }
  } else {
    pcbRect(sch, 'mask', xL, yB0, xR - xL, yB1 - yB0, { layer: 'back' });
    pcbRect(sch, 'maskCu', xA, yc - wTop / 2, xB - xA, wTop);
    for (const x of [xA, xB]) pcbRect(sch, 'gold', x - pad / 2, yc - pad / 2, pad, pad, { rx: 2 });
  }
  // current along the trace, drop between the ends
  const yArr = yc - Math.max(wTop / 2, pad / 2) - 8;
  sch.arrow([170, yArr], [290, yArr], { head: 8 });
  sch.text(298, yArr + 4, `I = ${si(s.i, 'A', 3)}`, 'sch-label sch-halo', 'start');
  sch.text(xA - pad / 2 - 6, yc + 4, '+', 'sch-sign sch-halo', 'end');
  sch.text(xB + pad / 2 + 6, yc + 4, '−', 'sch-sign sch-halo', 'start');
  // ΔV is calculated unless it is the target; with no solution there is no calculated value to show
  sch.text((xA + xB) / 2, yc + Math.max(wTop / 2, pad / 2) + 12, `ΔV = ${failed && !byV ? '—' : si(s.vd, 'V', 4)}`, `sch-label sch-halo ${byV ? '' : tone(s.solveFor === 'r')}`.trim(), 'middle');
  // length under the board
  sch.dim([xA, yB1 + 10], [xB, yB1 + 10], eq('ℓ', solveL, si(s.len, 'm', 4)), { off: -6, tone: tone(solveL) });
  sch.text(xL, yB1 + 24, inner ? 'inner layer, plan' : 'top view', 'sch-hint', 'start');

  // ── cross-section
  const q = s.w / s.t;
  const wPx = clamp(q * 14, 44, 250);
  const tPx = clamp(wPx / q, s.f > 0 ? 16 : 12, 28);
  const cx = 222;
  const xl = cx - wPx / 2;
  const xr = cx + wPx / 2;
  const mats: PcbMat[] = inner ? ['cu', 'fr4', 'hole'] : ['mask', 'maskCu', 'cu', 'gold', 'fr4'];
  const yBot = 262;
  let yT: number;
  let yTb: number;
  if (inner) {
    const yP1 = 156;
    pcbRect(sch, 'fr4', xL, yP1 + 8, xR - xL, yBot - yP1 - 16, { layer: 'back' });
    pcbRect(sch, 'cu', xL, yP1, xR - xL, 8, { layer: 'back' });
    pcbRect(sch, 'cu', xL, yBot - 8, xR - xL, 8, { layer: 'back' });
    yTb = 214 + tPx / 2;
    yT = yTb - tPx;
    pcbRect(sch, 'cu', xl, yT, wPx, tPx);
    sch.text(xR - 6, yP1 - 6, 'planes above and below', 'sch-hint', 'end');
  } else {
    const ySurf = 202;
    const plane = s.ret === 'micro';
    pcbRect(sch, 'fr4', xL, ySurf, xR - xL, (plane ? yBot - 8 : yBot) - ySurf, { layer: 'back' });
    if (plane) pcbRect(sch, 'cu', xL, yBot - 8, xR - xL, 8, { layer: 'back' });
    yTb = ySurf;
    yT = ySurf - tPx;
    // conformal solder mask over the laminate and the trace (strips either side, then a cap over the trace;
    // separate rectangles keep each shape's box tight for the label-overlap check)
    const m = 4;
    pcbRect(sch, 'mask', xL, ySurf - m, xl - xL, m);
    pcbRect(sch, 'mask', xr, ySurf - m, xR - xr, m);
    pcbRect(sch, 'mask', xl - m, yT - m, wPx + 2 * m, tPx + m);
    pcbRect(sch, 'cu', xl, yT, wPx, tPx);
    sch.text(xR - 6, yBot + (plane ? 14 : -6) + (plane ? 0 : 0), plane ? 'plane below' : 'no nearby plane', 'sch-hint', 'end');
  }

  // skin layer: where the AC current flows (dashed boundary, tinted band)
  if (det && s.f > 0 && det.skin > 1.001) {
    const dv = (k: number) => Math.max(tPx * Math.min(det.delta / s.t, k), 3);
    const band = (y: number, h: number) => sch.shape('rect', { x: xl, y, width: wPx, height: h, class: 'xs-hot' });
    const line = (y: number) => sch.shape('line', { x1: xl, y1: y, x2: xr, y2: y, class: 'sch-arrow dashed' });
    let yLab: number;
    if (s.ret === 'micro') {
      const h = dv(1);
      band(yTb - h, h);
      line(yTb - h);
      yLab = yTb - h / 2;
    } else if (s.ret === 'strip') {
      const h = dv(0.5);
      band(yT, h);
      band(yTb - h, h);
      line(yT + h);
      line(yTb - h);
      yLab = yTb - h / 2;
    } else {
      const h = dv(0.5);
      const hx = Math.min(h, wPx / 2);
      sch.shape('path', { d: `M ${xl} ${yT} h ${wPx} v ${tPx} h ${-wPx} Z M ${xl + hx} ${yT + h} v ${tPx - 2 * h} h ${wPx - 2 * hx} v ${-(tPx - 2 * h)} Z`, class: 'xs-hot', 'fill-rule': 'evenodd' });
      sch.shape('rect', { x: xl + hx, y: yT + h, width: wPx - 2 * hx, height: Math.max(tPx - 2 * h, 0), class: 'sch-arrow dashed', fill: 'none' });
      yLab = yTb - h / 2;
    }
    sch.text(xl - 8, yLab + 4, `δ = ${si(det.delta, 'm', 3)}`, 'sch-value sch-halo', 'end');
  } else if (s.f === 0 || (det && det.skin <= 1.001)) {
    // below the section, left (the plane / no-plane hints sit on the right)
    sch.text(xL, yBot + 14, s.f > 0 ? 'δ > T: current fills the copper' : 'DC: current fills the copper', 'sch-hint', 'start');
  }

  // W over the trace, T beside it
  const yW = yT - (inner ? 9 : 13);
  if (!inner) sch.dim([xl, yW], [xr, yW], eq('W', solveW, si(s.w, 'm', 4)), { tone: tone(solveW) });
  else {
    // inside the laminate: the same dimension, with its label haloed over the material
    sch.dim([xl, yW], [xr, yW], '', { tone: tone(solveW) });
    sch.text(cx, yW - 10, eq('W', solveW, si(s.w, 'm', 4)), `sch-label sch-halo ${tone(solveW)}`.trim(), 'middle');
  }
  const xT = xr + (inner ? 10 : 12);
  sch.dim([xT, yT], [xT, yTb], '', {});
  // outer layer: beside the top of the trace, clear of the mask; inner: over the laminate with a halo
  if (inner) sch.text(xT + 8, (yT + yTb) / 2 + 4, `T = ${si(s.t, 'm', 3)}`, 'sch-value sch-halo', 'start');
  else sch.text(xT + 8, yT + 6, `T = ${si(s.t, 'm', 3)}`, 'sch-value', 'start');

  pcbLegend(sch, xL, 298, mats, { cols: mats.length > 3 ? 3 : 3, colW: 140 });
  return sch.svg();
}
