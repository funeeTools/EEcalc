/**
 * Cross-section of the line whose εeff is computed, for each structure: bare, mask-coated or embedded microstrip,
 * symmetric stripline, grounded CPW. Materials from the shared PCB kit; W and T on one scale (§7b), the heights
 * too where they fit. Field arrows show what εeff is about: the share of the field in the substrate (q) against
 * the share in air.
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { type PcbMat, pcbLegend, pcbRect } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import { scaleHint, stackScale } from '../dual-stripline/scale';
import type { EffState } from './def';

const W = 460;
const H = 272;
const xL = 20;
const xR = 372;
const xDim = 384;
const Y_G = 196; // lowest top of the bottom ground plane (the drawing is centred upwards when it is short)
const PLANE = 9;
const fLen = (m: number) => si(m, 'm', 3);
type Tone = '' | 'solved' | 'hl';

function vDim(sch: Schematic, x: number, y0: number, y1: number, sym: string, val: string, tone: Tone = ''): void {
  sch.dim([x, y0], [x, y1], '', { tone });
  const ym = (y0 + y1) / 2;
  const cls = (c: string) => `${c} ${tone}`.trim();
  if (y1 - y0 >= 34) {
    sch.text(x + 7, ym - 3, sym, cls('sch-label'), 'start');
    sch.text(x + 7, ym + 12, val, cls('sch-value'), 'start');
  } else sch.text(x + 7, ym + 4, `${sym} ${val}`, cls('sch-value'), 'start');
}

function hDim(sch: Schematic, x0: number, x1: number, y: number, yRef: number, text: string, halo = false): void {
  if (Math.abs(y - yRef) > 4) for (const x of [x0, x1]) sch.shape('line', { x1: x, y1: yRef - 1.5, x2: x, y2: y - 2, class: 'sch-dim' });
  sch.dim([x0, y], [x1, y], '', {});
  sch.text((x0 + x1) / 2, y - 6, text, `sch-label${halo ? ' sch-halo' : ''}`, 'middle');
}

export function effDiagram(s: EffState, r?: CalcReport): SVGSVGElement | null {
  if (!(s.w > 0) || !(s.h > 0) || !(s.t >= 0)) return null;
  const sch = new Schematic(W, H);
  const st = s.structure;
  const failed = !!r && !r.ok;
  const erTone: Tone = s.solveFor !== 'eeff' ? (failed ? 'hl' : 'solved') : '';
  const sl = st === 'sl';
  const cpw = st === 'cpwg';
  const emb = st === 'emb';
  const mask = st === 'mask';

  // ── scale: copper W × T (CPWG: the gaps too); dielectric heights below (and above for stripline / embedded)
  const span = cpw ? s.w + 2 * s.g : s.w;
  const cover = emb ? s.t + s.hc : 0;
  const heights = sl ? [s.h, s.h] : emb ? [s.h, cover] : [s.h];
  // surface lines: the copper (and mask) sit on top of the substrate, so they count against the height left for
  // the W label and the caption above
  const avail = sl ? 150 : emb ? 136 : mask ? 108 : 118;
  const sc = stackScale(span, s.t, heights, sl || !emb ? 1 : 0, avail, cpw ? 330 : 300);
  const { k, tPx } = sc;
  const hPx = sc.hPx[0];
  // a short stack (wide traces drawn to scale) is centred in the space instead of sitting on the bottom
  const used = sc.hPx.reduce((a, b) => a + b, 0) + (sl || !emb ? sc.tPx : 0);
  const yG = Y_G - Math.max(0, avail - used) / 2;
  const yS = yG - hPx; // substrate top = trace bottom
  const yT = yS - tPx; // trace top
  const cx = (xL + xR) / 2;
  const narrow = !sc.cut && k * s.w < 3;
  // CPWG too wide for the drawing: everything stays to scale; the pours (and, wider still, the gaps) lie beyond
  // the board edges, and the strip itself runs past them when it alone does not fit
  const cut = cpw ? k * s.w > xR - xL : sc.cut;
  const wPx = cut ? xR - xL : Math.max(k * s.w, 3);
  const gPx = cpw ? k * s.g : 0;
  const gClip = cpw && !cut && cx + wPx / 2 + gPx > xR - 2;
  const x0 = cx - wPx / 2;
  const x1 = cx + wPx / 2;

  // ── materials, bottom up
  const mats: PcbMat[] = [];
  const yTopDiel = sl ? yS - sc.hPx[1] - tPx : emb ? yS - sc.hPx[1] : yS; // top of all dielectric
  if (sl) {
    pcbRect(sch, 'fr4', xL, yTopDiel, xR - xL, yG - yTopDiel, { layer: 'back' });
    pcbRect(sch, 'cu', xL, yTopDiel - PLANE, xR - xL, PLANE, { layer: 'back' });
  } else {
    pcbRect(sch, 'fr4', xL, yS, xR - xL, hPx, { layer: 'back' });
    if (emb) pcbRect(sch, 'fr4', xL, yTopDiel, xR - xL, yS - yTopDiel, { layer: 'back' });
  }
  pcbRect(sch, 'cu', xL, yG, xR - xL, PLANE, { layer: 'back' });
  if (cpw) {
    if (!cut && !gClip) {
      pcbRect(sch, 'cu', xL, yT, x0 - gPx - xL, tPx);
      pcbRect(sch, 'cu', x1 + gPx, yT, xR - x1 - gPx, tPx);
    }
  }
  let yMaskTop = yT;
  if (mask) {
    // conformal mask: about C thick on the same scale, at least 3 px, over the laminate and the trace
    const m = Math.min(Math.max(k * s.c, 3), 14);
    if (!cut) {
      pcbRect(sch, 'mask', xL, yS - m, x0 - m - xL, m);
      pcbRect(sch, 'mask', x1 + m, yS - m, xR - x1 - m, m);
    }
    pcbRect(sch, 'mask', cut ? xL : x0 - m, yT - m, cut ? xR - xL : wPx + 2 * m, tPx + m);
    yMaskTop = yT - m;
    mats.push('mask');
  }
  // the trace over the mask cap, so the coat reads as a conformal layer round the copper
  pcbRect(sch, 'cu', x0, yT, wPx, tPx);
  mats.push('cu', 'fr4');

  // ── field: into the substrate under the trace; fringing into air (or the cover) from the edges
  const fan = Math.min(wPx, 150);
  const arrowsDown = sl ? 2 : 3;
  if (hPx >= 16) for (let i = 0; i < arrowsDown; i++) {
    const f = -0.4 + (0.8 * i) / (arrowsDown - 1);
    sch.arrow([cx + f * fan, yS + 3], [cx + f * (fan + 24), yG - 3], { dashed: true, head: 5 });
  }
  if (sl) {
    const hTop = sc.hPx[1];
    const yUp = !cut && hTop >= 34 ? yT - 34 : yT - 3; // above the W label when it sits over the trace
    if (yUp - yTopDiel - 3 >= 12) for (const f of [-0.3, 0.3]) sch.arrow([cx + f * fan, yUp], [cx + f * (fan + 60), yTopDiel + 3], { dashed: true, head: 5 });
  } else if (!cut) {
    // fringing from the trace corners outwards over the dielectric surface (air, mask or cover)
    const up = Math.min(24, yT - 50);
    const ys = (cpw ? yT : yMaskTop) - 3;
    if (cpw) {
      sch.arrow([x0 - 2, ys], [Math.max(x0 - gPx + 2, xL + 4), ys], { dashed: true, head: 5 });
      sch.arrow([x1 + 2, ys], [Math.min(x1 + gPx - 2, xR - 4), ys], { dashed: true, head: 5 });
    } else if (up > 12 && wPx >= `W = ${fLen(s.w)}`.length * 6.2) {
      sch.arrow([x0 + 3, ys], [x0 - 26, ys - up], { dashed: true, head: 5 });
      sch.arrow([x1 - 3, ys], [x1 + 26, ys - up], { dashed: true, head: 5 });
    }
  }

  // ── dimensions and labels
  const wText = `W = ${fLen(s.w)}`;
  const yW = (mask ? yMaskTop : yT) - 12;
  if (cut) {
    const half = wText.length * 3.3 + 8;
    const yc = sl ? yT - Math.min(sc.hPx[1] / 2, 14) : yW;
    sch.text(cx, yc + 4, wText, 'sch-label sch-halo', 'middle');
    sch.arrow([cx - half, yc], [xL + 1, yc], { head: 6 });
    sch.arrow([cx + half, yc], [xR - 1, yc], { head: 6 });
  } else if (sl || emb) {
    const room = sc.hPx[1];
    if (room >= 30) hDim(sch, x0, x1, yT - 11, yT, wText, true);
    else sch.text(x1 + 8, yT + tPx / 2 + 4, wText, 'sch-label sch-halo', 'start');
  } else hDim(sch, x0, x1, yW, mask ? yMaskTop : yT, wText);
  if (cpw && gClip) {
    // the gap reaches past the edge: outward arrow from the strip to the board edge
    const yg = yT - 12;
    sch.arrow([x1 + 2, yg], [xR - 1, yg], { head: 6 });
    sch.text((x1 + xR) / 2, yg - 5, `G = ${fLen(s.g)}`, 'sch-label sch-halo', 'middle');
  } else if (cpw && !cut && gPx >= 8) {
    const yg = yT - 12;
    sch.shape('line', { x1: x1 + gPx, y1: yT - 1.5, x2: x1 + gPx, y2: yg - 2, class: 'sch-dim' });
    sch.dim([x1, yg], [x1 + gPx, yg], '', {});
    sch.text(x1 + gPx + 6, yg + 4, `G = ${fLen(s.g)}`, 'sch-label', 'start');
  }
  if (s.t > 0 && !cpw) {
    const tText = `T = ${fLen(s.t)}`;
    const mPx = mask ? yT - yMaskTop : 0;
    if (cut) sch.text(xR - 6, yS + 14, tText, 'sch-value sch-halo', 'end'); // under the copper, clear of the W arrows
    else sch.text(x0 - 8 - mPx, Math.min(yT + tPx / 2 + 4, yS - mPx - 3), tText, 'sch-value sch-halo', 'end');
  }
  vDim(sch, xDim, yS, yG, 'H', fLen(s.h));
  if (sl) vDim(sch, xDim, yTopDiel, yT, 'H', fLen(s.h));
  if (emb) {
    vDim(sch, xDim, yTopDiel, yT, 'H_c', fLen(s.hc));
  }
  if (hPx >= 16) sch.text(xL + 6, yG - 5, `ε_r = ${failed && erTone ? '—' : +s.er.toPrecision(4)}`, `sch-label sch-halo ${erTone}`.trim(), 'start');
  // air: just above the dielectric surface, left of the trace when there is room (else above the cover / mask)
  const ySurf = emb ? yTopDiel : mask ? yS - (yT - yMaskTop) : yS;
  if (!sl && (emb || (!cut && x0 - xL > 110))) sch.text(xL + 4, ySurf - 8, 'air (ε = 1)', 'sch-hint', 'start');

  // ── caption: εeff, delay, the field split
  const get = (key: string) => (r?.ok ? r.results.find((x) => x.key === key) : undefined);
  const e = get('eeff');
  const d = get('tpd');
  const q = get('q');
  const eTone: Tone = s.solveFor === 'erE' ? '' : 'solved';
  sch.text(xL, 20, `ε_eff = ${e ? e.display : '—'}`, `sch-caption ${e ? eTone : failed ? 'hl' : ''}`.trim(), 'start');
  sch.text(xL + 128, 20, `t_pd = ${d ? d.display : '—'}`, `sch-caption ${d && s.solveFor !== 'erT' ? 'solved' : ''}`.trim(), 'start');
  const split = sl ? 'all of the field in the dielectric' : q ? `${q.display} of the field in the substrate` : '';
  if (split) sch.text(xR + 80, 20, split, 'sch-hint', 'end');

  const hText = sc.heightsToScale ? 'heights to scale' : 'heights not to scale';
  const hint = !cpw ? scaleHint({ ...sc, cut }, narrow) : cut ? `W and T to scale · runs past both edges, gaps and pours beyond · ${hText}` : gClip ? `W, G and T to scale · pours beyond the edges · ${hText}` : `W, G and T to scale · ${hText}`;
  sch.text(xL, 228, hint, 'sch-hint', 'start');
  if (mask) sch.text(xR, 228, `mask ${fLen(s.c)}, ε_m = ${+s.erm.toPrecision(3)}`, 'sch-hint', 'end');
  if (emb) sch.text(xR, 228, `cover ε_c = ${+s.erc.toPrecision(4)}`, 'sch-hint', 'end');
  pcbLegend(sch, xL, 256, mats, { cols: 3, colW: 120, names: { fr4: emb ? 'Laminate, cover' : 'Laminate' } });
  return sch.svg();
}
