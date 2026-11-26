/**
 * Stencil cross-section: foil of thickness T with the aperture over the pad, paste in the opening, board below.
 * Board materials come from the PCB kit (core/schematic/pcb.ts): laminate, solder mask pulled back from the pad,
 * copper pad with its gold (ENIG) finish, grainy paste, and the brushed stainless-steel stencil foil (`steel`),
 * outlined red when an aperture ratio fails.
 */

import type { CalcReport } from '@/core/calc/types';
import { pcbLegend, pcbRect } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { SolderPasteState } from './def';

const fLen = (m: number) => si(m, 'm', 3);
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function pasteDiagram(s: SolderPasteState, r: CalcReport): SVGSVGElement | null {
  if (!(s.padW > 0) || !(s.t > 0)) return null;
  const sch = new Schematic(440, 282);
  const solved = s.solveFor;
  const res = r.results.find((x) => x.key === solved && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === solved ? (failed ? 'hl' : 'solved') : '');
  const get = (k: string) => r.results.find((x) => x.key === k);
  const arBad = get('areaRatio')?.tone === 'fail';
  const asBad = get('aspectRatio')?.tone === 'fail';

  // The section is cut across the pad width (the narrow side for the aspect ratio). Pad drawn 150 px wide.
  const k = 1 - clamp(s.red, 0, 99) / 100;
  const padPx = 150;
  const apPx = padPx * k;
  const px = padPx / s.padW;
  const tPx = clamp(s.t * px, 12, 60);
  const cx = 190;
  const yFoilTop = 92;
  const yFoilBot = yFoilTop + tPx;
  const cuPx = 6; // pad copper (legible minimum, not to scale)
  const auPx = 4; // gold finish (legible minimum, enough to read in the dark theme)
  const yBoard = yFoilBot + cuPx + auPx; // the foil rests on the pads
  const xL = 30;
  const xR = 350;

  // board: laminate, then the copper pad with its finish, then mask pulled back from the pad
  pcbRect(sch, 'fr4', xL, yBoard, xR - xL, 40, { layer: 'back' });
  pcbRect(sch, 'cu', cx - padPx / 2, yFoilBot + auPx, padPx, cuPx);
  pcbRect(sch, 'gold', cx - padPx / 2, yFoilBot, padPx, auPx);
  const mk = 5; // mask thinner than the pad, so the foil gaskets on the pad
  const gap = 6; // mask clearance around the pad
  pcbRect(sch, 'mask', xL, yBoard - mk, cx - padPx / 2 - gap - xL, mk);
  pcbRect(sch, 'mask', cx + padPx / 2 + gap, yBoard - mk, xR - (cx + padPx / 2 + gap), mk);
  // foil, two halves either side of the opening
  const ax0 = cx - apPx / 2;
  const ax1 = cx + apPx / 2;
  const foilTone = arBad || asBad ? 'hl' : '';
  pcbRect(sch, 'steel', xL, yFoilTop, ax0 - xL, tPx, { rx: 1, tone: foilTone });
  pcbRect(sch, 'steel', ax1, yFoilTop, xR - ax1, tPx, { rx: 1, tone: foilTone });
  // paste in the aperture (outlined green when its volume is the solved quantity)
  pcbRect(sch, 'paste', ax0 + 1, yFoilTop + 1, apPx - 2, tPx - 1, { tone: solved === 'vpaste' ? (failed ? 'hl' : 'solved') : '' });

  // dimensions: opening on top, pad below the board line, T at the right edge of the foil
  const yAp = yFoilTop - 16;
  const ext = (x: number, y0: number, y1: number) => sch.shape('line', { x1: x, y1: y0, x2: x, y2: y1, class: 'sch-dim' });
  ext(ax0, yFoilTop - 2, yAp - 4);
  ext(ax1, yFoilTop - 2, yAp - 4);
  const apW = s.padW * k;
  sch.dim([ax0, yAp], [ax1, yAp], `${s.shape === 'circle' ? 'D_ap' : 'W_ap'} = ${fLen(apW)}`, { tone: tone('red') });
  const yPad = yBoard + 54;
  ext(cx - padPx / 2, yBoard + 2, yPad + 4);
  ext(cx + padPx / 2, yBoard + 2, yPad + 4);
  sch.dim([cx - padPx / 2, yPad], [cx + padPx / 2, yPad], `${s.shape === 'circle' ? 'D_pad' : 'W_pad'} = ${fLen(s.padW)}`, { off: -12 });
  const xT = xR + 14;
  ext(xR, yFoilTop, yFoilTop);
  sch.dim([xT, yFoilTop], [xT, yFoilBot], '', { tone: tone('t') });
  sch.text(xT + 6, (yFoilTop + yFoilBot) / 2 - 2, 'T', `sch-label ${tone('t')}`.trim(), 'start');
  sch.text(xT + 6, (yFoilTop + yFoilBot) / 2 + 12, solved === 't' && failed ? '—' : `${(s.t * 1e6).toPrecision(3)} µm`, `sch-value ${tone('t')}`.trim(), 'start');

  // header: ratios and volume; labels
  const ar = get('areaRatio');
  const as = get('aspectRatio');
  const vp = get('vpaste');
  if (ar) sch.text(xL, 22, `AR = ${ar.display}`, `sch-label ${arBad ? 'hl' : ''}`.trim(), 'start');
  if (as) sch.text(xL + 110, 22, `W/T = ${as.display}`, `sch-label ${asBad ? 'hl' : ''}`.trim(), 'start');
  if (vp) sch.text(xL + 220, 22, `V = ${vp.display}`, `sch-label ${solved === 'vpaste' ? 'solved' : ''}`.trim(), 'start');
  sch.text(xL, 40, s.shape === 'circle' ? 'section through a round aperture' : `section across the width · L_ap = ${fLen(s.padL * k)}`, 'sch-hint', 'start');
  sch.text(xL + 4, yFoilTop - 4, 'stencil', 'sch-hint', 'start');

  // legend: kit materials in kit order, then the stencil foil
  const yLeg = 256;
  pcbLegend(sch, xL, yLeg, ['mask', 'cu', 'gold', 'paste', 'fr4', 'steel'], { cols: 4, colW: 100, names: { cu: 'Copper pad', gold: 'Gold finish', fr4: 'Laminate' } });
  return sch.svg();
}
