/** Via voltage drop: cross-section of the via array between the two copper layers it joins, with the current path. */

import type { CalcReport } from '@/core/calc/types';
import type { PcbMat } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { VIA_PX, clampPx, viaBarrel, viaCopper, viaLaminate, viaLegend, viaMask, wallPx, type Span } from '@/calculators/via-calculator/viaKit';
import type { DropSolve, DropState } from './def';

const fLen = (m: number) => si(m, 'm', 3);
const MAX_DRAW = 4;

export function dropSection(s: DropState, r: CalcReport): SVGSVGElement | null {
  if (!(s.d > 0) || !(s.h > 0) || !(s.pad > 0) || !(s.n >= 1)) return null;
  const failed = !r.ok;
  const k = s.solveFor;
  const tone = (q: DropSolve) => (k === q ? (failed ? 'hl' : 'solved') : '');
  const val = (q: DropSolve, text: string) => (failed && k === q ? '—' : text);
  const res = (key: string) => (r.ok ? r.results.find((x) => x.key === key) : undefined);
  const cu = VIA_PX.cu;
  const n = Math.max(1, Math.round(s.n));
  const nDraw = Math.min(n, MAX_DRAW);
  const filled = s.fill === 'cu';

  // one scale for drill, pad and length where it fits; the board is clamped to a legible height, holes to a visible
  // size. The drawn vias sit in [70, 232] so the current arrow fits on the left and the d / t labels on the right.
  const x0 = 20;
  const x1 = 316;
  const yTop = 110;
  const span = 162;
  const pMax = Math.min(110, span / (1.5 * (nDraw - 1) + 1));
  const kx = Math.min(120 / s.h, pMax / Math.max(s.pad, s.d));
  const hTrue = s.h * kx;
  const hPx = clampPx(hTrue, 50, 120);
  const yBot = yTop + hPx;
  const dTrue = s.d * kx;
  const dPx = clampPx(dTrue, 12, Math.min(70, pMax - 8));
  // with the pads off there is no pad to dimension: the layers just meet the barrel (a minimal land is drawn)
  const padTrue = Math.max(s.pad, s.d) * kx;
  const padPx = s.pads ? clampPx(padTrue, dPx + 8, pMax) : dPx + 8;
  const w = filled ? dPx / 2 : wallPx(s.t, kx, dPx);
  const pitch = nDraw > 1 ? Math.min(Math.max(1.5 * padPx, padPx + 14), (span - padPx) / (nDraw - 1)) : 0;
  const cx0 = 151;
  const xs = Array.from({ length: nDraw }, (_, i) => cx0 + (i - (nDraw - 1) / 2) * pitch);
  const holes: Span[] = filled ? [] : xs.map((x) => [x - dPx / 2 + w, x + dPx / 2 - w]);
  const padL = xs[0] - padPx / 2;
  const padR = xs[nDraw - 1] + padPx / 2;
  // height follows the board: scale note and legend sit just under the bottom layer
  const yHint = yBot + 40;
  const yLeg = yHint + 22;
  const sch = new Schematic(460, yLeg + 8);

  // laminate; current in on the top layer from the left, out on the bottom layer to the right; barrels; tented mask
  viaLaminate(sch, x0, yTop, x1, yBot);
  viaCopper(sch, x0, padR, yTop - cu, holes);
  viaCopper(sch, padL, x1, yBot, holes);
  for (const x of xs) viaBarrel(sch, x, yTop - cu, yBot + cu, dPx, w, { fill: filled ? 'cu' : s.fill === 'resin' ? 'epoxy' : 'none' });
  viaMask(sch, x0, x1, yTop, 'top', [[x0, padR]]);
  viaMask(sch, x0, x1, yBot, 'bottom', [[padL, x1]]);

  // current path: I in along the top, I/N down each barrel, I out along the bottom
  const yIn = yTop - cu - VIA_PX.mask - 12;
  sch.arrow([x0 + 18, yIn], [padL - 8, yIn]);
  sch.text(x0 + 4, yIn + 4, 'I', 'sch-label', 'start');
  const yOut = yBot + cu + VIA_PX.mask + 12;
  sch.arrow([padR + 8, yOut], [x1 - 18, yOut]);
  sch.text(x1 - 4, yOut + 4, 'I', 'sch-label', 'end');
  for (const x of xs) sch.arrow([x, yTop + 10], [x, yBot - 10], { head: 6 });
  const iVia = res('iVia');
  sch.text(xs[0] - padPx / 2 - 6, yTop + hPx * 0.3 + 4, 'I/N', 'sch-label sch-halo', 'end');

  // D_pad over the first via; h and V on the right
  if (s.pads) {
    const yPadDim = yIn - 14;
    sch.shape('line', { x1: padL, y1: yTop - cu - 1, x2: padL, y2: yPadDim - 2, class: 'sch-dim' });
    sch.shape('line', { x1: padL + padPx, y1: yTop - cu - 1, x2: padL + padPx, y2: yPadDim - 2, class: 'sch-dim' });
    sch.dim([padL, yPadDim], [padL + padPx, yPadDim], `D_pad = ${fLen(s.pad)}`, { off: 9 });
  }

  // d across the last hole and t at its right wall, both labelled in the laminate to the right of the last pad
  const xl = xs[nDraw - 1];
  const xLab = padR + 6;
  const yD = yTop + hPx * (filled ? 0.5 : 0.7);
  sch.dim([xl - dPx / 2, yD], [xl + dPx / 2, yD], '', { tone: tone('d') });
  sch.text(xLab, yD + 4, `d = ${val('d', fLen(s.d))}`, `sch-label sch-halo ${tone('d')}`.trim(), 'start');
  if (!filled) {
    const yt = yTop + hPx * 0.3;
    sch.arrow([xLab - 2, yt], [xl + dPx / 2 - w / 2, yt], { head: 5, tone: tone('t') });
    sch.text(xLab, yt + 4, `t = ${val('t', si(s.t, 'm', 3))}`, `sch-label sch-halo ${tone('t')}`.trim(), 'start');
  }

  const xh = 334;
  sch.dim([xh, yTop - cu], [xh, yBot + cu], '', {});
  sch.text(xh + 7, (yTop + yBot) / 2 - 3, 'h', 'sch-label', 'start');
  sch.text(xh + 7, (yTop + yBot) / 2 + 12, fLen(s.h), 'sch-value', 'start');
  const vRes = res(k === 'v' ? 'v' : 'vAch');
  const vTone = failed ? (k === 'v' ? 'hl' : '') : k === 'v' ? 'solved' : '';
  const xv = 398;
  sch.dim([xv, yTop - cu], [xv, yBot + cu], '', { tone: vTone });
  sch.text(xv, yTop - cu - 6, '+', `sch-label ${vTone}`.trim());
  sch.text(xv, yBot + cu + 15, '−', `sch-label ${vTone}`.trim());
  sch.text(xv + 7, (yTop + yBot) / 2 - 3, 'V', `sch-label ${vTone}`.trim(), 'start');
  sch.text(xv + 7, (yTop + yBot) / 2 + 12, vRes ? vRes.display : '—', `sch-value ${vTone}`.trim(), 'start');

  // headline
  const rRes = res('r');
  const dT = res('ipcDT');
  sch.text(16, 18, `V = ${vRes ? vRes.display : '—'}`, `sch-label ${vTone}`.trim(), 'start');
  // second headline: the solved unknown when it is not the drop, else the resistance
  const solvedRes = k !== 'v' ? res(k) : undefined;
  const sym = { v: 'V', n: 'N', i: 'I', d: 'd', t: 't' }[k];
  if (k !== 'v') sch.text(160, 18, `${sym} = ${solvedRes ? solvedRes.display : '—'}`, `sch-label ${tone(k)}`.trim(), 'start');
  else sch.text(160, 18, `R = ${rRes ? rRes.display : '—'}`, 'sch-label', 'start');
  const iTxt = failed && k === 'i' ? '—' : si(s.i, 'A', 3);
  const nTxt = failed && k === 'n' ? '—' : `${n}`;
  sch.text(16, 34, `I = ${iTxt} through N = ${nTxt} via${n > 1 ? 's' : ''}${iVia && n > 1 ? `, ${iVia.display} each` : ''}`, `sch-hint ${k === 'i' || k === 'n' ? tone(k) : ''}`.trim(), 'start');
  sch.text(16, 48, `${dT ? `ΔT_IPC ${dT.display}` : ''}${k !== 'v' ? `${dT ? ' · ' : ''}limit ${si(s.v, 'V', 3)}` : ''}`, 'sch-hint', 'start');

  // scale note and legend
  const adj = (px: number, tru: number, up: string, down: string) => (px > tru + 0.5 ? up : px < tru - 0.5 ? down : '');
  const off = [adj(hPx, hTrue, 'h stretched', 'h shortened'), adj(dPx, dTrue, 'holes widened to be visible', 'holes narrowed to fit'), s.pads ? adj(padPx, padTrue, 'pads widened', 'pads narrowed') : ''].filter(Boolean);
  const scale = off.length ? off.join(' · ') : s.pads ? 'd, D_pad and h to scale' : 'd and h to scale';
  sch.text(x1, yHint, `${nDraw < n ? `${nDraw} of ${n} vias drawn · ` : ''}${scale}`, 'sch-hint', 'end');
  const mats: PcbMat[] = ['mask', 'cu', 'fr4'];
  if (s.fill === 'none') mats.push('air');
  if (s.fill === 'resin') mats.push('resin');
  viaLegend(sch, 16, yLeg, mats, { cols: 4, colW: 110, names: { air: 'Hole (air)' } });
  return sch.svg();
}
