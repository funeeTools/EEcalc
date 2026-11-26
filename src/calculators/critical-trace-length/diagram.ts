/**
 * Top: the rising edge laid out in space at the moment its front reaches the receiver — a full-height ramp of
 * length l_edge = t_r/t_pd — with the trace length and L_crit = l_edge/k marked under it, so the reader sees what
 * fraction of the edge fits on the trace. Below: a top view of driver → trace → receiver with L and L_crit, and a
 * small cross-section of the routing layer. Materials from the shared PCB kit (core/schematic/pcb.ts).
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbLegend, pcbRect, pcbShape, type PcbMat } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { CtlState } from './def';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const fLen = (m: number) => si(m, 'm', 3);

export function ctlDiagram(s: CtlState, r: CalcReport): SVGSVGElement {
  const sch = new Schematic(460, 332);
  const d = r.details as { lcrit: number; ledge: number; eeff: number } | undefined;
  const ok = r.ok && d != null;
  const solved = s.solveFor;
  const tone = (k: string) => (k === solved ? (ok ? 'solved' : 'hl') : '');
  const len = s.len > 0 ? s.len : 1;
  const lc = ok ? d!.lcrit : len;
  const lEdge = ok ? d!.ledge : len * 6;
  const isLine = ok && len > lc * (1 + 1e-9);
  const strip = s.topo === 'stripline';
  const lcTone = solved === 'len' && Math.abs(s.ratio - 1) < 1e-12 ? tone('len') : '';
  const lTone = solved === 'len' ? tone('len') : isLine ? 'hl' : '';
  const ext = (x: number, y0: number, y1: number) => sch.shape('line', { x1: x, y1: y0, x2: x, y2: y1, class: 'sch-dim' });

  // ── header
  sch.text(16, 22, `t_r = ${solved === 'tr' && !ok ? '—' : si(s.tr, 's', 3)}`, `sch-caption ${tone('tr')}`.trim(), 'start');
  sch.text(120, 22, `k = ${+s.k.toPrecision(3)}`, 'sch-caption', 'start');
  if (ok) sch.text(190, 22, `t_pd = ${si((Math.sqrt(d!.eeff) / 299_792_458) * 1e-3, 's', 3)}/mm`, 'sch-caption', 'start');

  // ── the edge in space: the front is at RX (right); the voltage rises over l_edge behind it to the full swing.
  // Its own scale: the longer of l_edge and L spans the strip, so the whole ramp is always visible.
  const xF = 440;
  const span = 370;
  const ePxS = span / Math.max(lEdge, len);
  const eLen = lEdge * ePxS;
  const yV0 = 92;
  const yV1 = 56;
  sch.text(16, 42, 'the rising edge on the line as its front reaches RX', 'sch-hint', 'start');
  sch.shape('line', { x1: xF - span, y1: yV0, x2: xF, y2: yV0, class: 'sch-dim' });
  sch.shape('line', { x1: xF - span, y1: yV1, x2: xF, y2: yV1, class: 'sch-dim', 'stroke-dasharray': '4 3' });
  sch.text(xF - span - 4, yV1 + 4, 'V', 'sch-label', 'end');
  sch.text(xF - span - 4, yV0 + 4, '0', 'sch-value', 'end');
  sch.wire([[xF - span, yV1], [xF - eLen, yV1], [xF, yV0]], isLine ? 'hl' : '');
  const edgeTxt = `edge t_r/t_pd = ${ok ? fLen(lEdge) : '—'}`;
  if (eLen > 200) sch.text(xF - 0.72 * eLen, yV0 - 7, edgeTxt, 'sch-value', 'middle');
  else sch.text(xF - eLen - 6, yV1 + 15, edgeTxt, 'sch-value', 'end');
  // the trace and L_crit on the same scale, measured back from the front, on two rows
  const yR1 = yV0 + 14;
  const yR2 = yV0 + 28;
  const lS = Math.max(len * ePxS, 2);
  const lcS = Math.max(lc * ePxS, 2);
  pcbRect(sch, strip ? 'cuHidden' : 'maskCu', xF - lS, yR1 - 2.5, lS, 5, { tone: isLine ? 'hl' : '' });
  sch.text(xF - lS - 5, yR1 + 4, 'trace L', 'sch-hint', 'end');
  sch.dim([xF - lcS, yR2], [xF, yR2], '', { tone: lcTone });
  sch.text(xF - lcS - 6, yR2 + 4, `L_crit = l_edge/${+s.k.toPrecision(3)}`, `sch-hint ${lcTone}`.trim(), 'end');

  // ── board (top view)
  const yB0 = 146;
  const yB1 = 224;
  const yT = 185;
  const x0 = 96;
  const bSpan = 290;
  const px = bSpan / Math.max(len, lc);
  const lPx = clamp(len * px, 36, bSpan);
  const lcPx = clamp(lc * px, 36, bSpan);
  const xR = x0 + lPx;
  pcbRect(sch, 'mask', 16, yB0, 428, yB1 - yB0, { layer: 'back', rx: 3 });
  const partR = Math.min(60, 440 - (xR + 12));
  if (strip) {
    // inner-layer trace (seen through the board), reached from the driver and receiver pins by vias
    pcbRect(sch, 'cuHidden', x0, yT - 3, lPx, 6, { tone: isLine ? 'hl' : '' });
    for (const x of [x0, xR]) {
      pcbShape(sch, 'cu', 'circle', { cx: x, cy: yT, r: 5.5 });
      pcbShape(sch, 'hole', 'circle', { cx: x, cy: yT, r: 2.4 });
    }
  } else {
    pcbRect(sch, 'maskCu', x0, yT - 3, lPx, 6, { tone: isLine ? 'hl' : '' });
    pcbRect(sch, 'gold', x0 - 10, yT - 5, 12, 10, { rx: 1.5 });
    pcbRect(sch, 'gold', xR - 2, yT - 5, 12, 10, { rx: 1.5 });
  }
  pcbRect(sch, 'part', 24, yT - 20, strip ? 64 : 60, 40, { rx: 3 });
  pcbRect(sch, 'part', xR + (strip ? 8 : 12), yT - 20, partR, 40, { rx: 3 });
  sch.text(54, yT + 4, 'TX', 'sch-pin sch-halo', 'middle');
  sch.text(xR + (strip ? 8 : 12) + partR / 2, yT + 4, 'RX', 'sch-pin sch-halo', 'middle');
  // L_crit above the trace, L below it; labels outside the board
  const yLc = yB0 + 13;
  ext(x0, yT - 6, yLc - 4);
  ext(x0 + lcPx, yT - 6, yLc - 4);
  sch.dim([x0, yLc], [x0 + lcPx, yLc], '', { tone: lcTone });
  const yL = yB1 - 13;
  ext(x0, yT + 6, yL + 4);
  ext(xR, yT + 6, yL + 4);
  sch.dim([x0, yL], [xR, yL], '', { tone: lTone });
  sch.text(x0, yB0 - 6, `L_crit = t_r/(k·t_pd) = ${ok ? fLen(lc) : '—'}`, `sch-label ${lcTone}`.trim(), 'start');
  sch.text(x0, yB1 + 16, `L = ${solved === 'len' && !ok ? '—' : fLen(len)}`, `sch-label ${lTone}`.trim(), 'start');
  const verdict = !ok ? '' : isLine ? `${(len / lc).toPrecision(3)} × L_crit: transmission line — terminate` : `${(len / lc).toPrecision(3)} × L_crit: lumped`;
  if (verdict) sch.text(444, yB1 + 16, verdict, `sch-value ${solved === 'ratio' ? 'solved' : isLine ? 'hl' : ''}`.trim(), 'end');

  // ── cross-section of the routing layer (bottom right)
  const xs0 = 334;
  const xs1 = 444;
  const yS = 282;
  const eTxt = ok ? ` · εeff ${d!.eeff.toPrecision(3)}` : '';
  const mc = (xs0 + xs1) / 2;
  if (strip) {
    pcbRect(sch, 'cu', xs0, yS - 4, xs1 - xs0, 4, { layer: 'back' });
    pcbRect(sch, 'fr4', xs0, yS, xs1 - xs0, 34, { layer: 'back' });
    pcbRect(sch, 'cu', xs0, yS + 34, xs1 - xs0, 4, { layer: 'back' });
    pcbRect(sch, 'cu', mc - 10, yS + 15, 20, 4);
    sch.text(xs1, yS - 10, `stripline${eTxt}`, 'sch-hint', 'end');
  } else if (s.topo === 'microstrip') {
    // solder mask over the whole top surface, conformal over the trace
    pcbRect(sch, 'fr4', xs0, yS + 8, xs1 - xs0, 26, { layer: 'back' });
    pcbRect(sch, 'cu', xs0, yS + 34, xs1 - xs0, 4, { layer: 'back' });
    pcbShape(sch, 'mask', 'path', { d: `M ${xs0} ${yS + 8} L ${xs0} ${yS + 5.5} L ${mc - 12} ${yS + 5.5} L ${mc - 12} ${yS + 1.5} L ${mc + 12} ${yS + 1.5} L ${mc + 12} ${yS + 5.5} L ${xs1} ${yS + 5.5} L ${xs1} ${yS + 8} Z` });
    pcbRect(sch, 'cu', mc - 10, yS + 4, 20, 4);
    sch.text(xs1, yS - 10, `microstrip${eTxt}`, 'sch-hint', 'end');
  } else {
    sch.text(xs1, yS - 10, `known εeff${eTxt}`, 'sch-hint', 'end');
  }
  const mats: PcbMat[] = strip ? ['mask', 'cu', 'cuHidden', 'fr4', 'hole', 'part'] : s.topo === 'microstrip' ? ['mask', 'maskCu', 'cu', 'gold', 'fr4', 'part'] : ['mask', 'maskCu', 'gold', 'part'];
  pcbLegend(sch, 16, 288, mats, { cols: 2, colW: 150 });
  return sch.svg();
}
