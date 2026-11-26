/** Via calculator: cross-section of a plated through via in a 4-layer board (pads, barrel, planes with antipads, mask). */

import type { CalcReport } from '@/core/calc/types';
import type { PcbMat } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { ViaSolve, ViaState } from './def';
import { VIA_PX, clampPx, viaBarrel, viaCopper, viaFinish, viaLaminate, viaLegend, viaMask, wallPx } from './viaKit';

const fLen = (m: number) => si(m, 'm', 3);

export function viaSection(s: ViaState, r: CalcReport): SVGSVGElement | null {
  if (!(s.d > 0) || !(s.h > 0) || !(s.pad > 0) || !(s.Da > 0) || !(s.t > 0)) return null;
  const sch = new Schematic(460, 282);
  const failed = !r.ok;
  const tone = (k: ViaSolve) => (s.solveFor === k ? (failed ? 'hl' : 'solved') : '');
  const val = (k: ViaSolve, text: string) => (failed && s.solveFor === k ? '—' : text);
  const res = (k: string) => (r.ok ? r.results.find((x) => x.key === k) : undefined);

  // geometry: board 132 px thick; true horizontal scale where it fits, compressed when the clearance is wide
  const x0 = 22;
  const x1 = 300;
  const yTop = 86;
  const hPx = 128;
  const yBot = yTop + hPx;
  const cu = VIA_PX.cu;
  const cx = 158;
  const kx = Math.min(hPx / s.h, 230 / Math.max(s.Da, s.pad));
  const dPx = clampPx(s.d * kx, 14, 120);
  const padPx = clampPx(s.pad * kx, dPx + 8, 236);
  const apPx = clampPx(s.Da * kx, dPx + 8, 262);
  const w = wallPx(s.t, kx, dPx);
  const half = (p: number): [number, number] => [cx - p / 2, cx + p / 2];
  const hole = half(dPx);
  const pad = half(padPx);
  const ap = half(apPx);

  // laminate, then copper: L1 trace + pad (from the left), L2/L3 planes with antipads, L4 pad + trace (to the right)
  viaLaminate(sch, x0, yTop, x1, yBot);
  const yL2 = yTop + hPx / 3 - cu / 2;
  const yL3 = yTop + (2 * hPx) / 3 - cu / 2;
  viaCopper(sch, x0, pad[1], yTop - cu, [hole]);
  viaCopper(sch, x0, x1, yL2, [ap]);
  viaCopper(sch, x0, x1, yL3, [ap]);
  viaCopper(sch, pad[0], x1, yBot, [hole]);
  // a barrel over the fab's aspect-ratio limit is outlined red (style guide §7b: exceeded limit → tone 'hl')
  const arFail = res('ar')?.tone === 'fail';
  viaBarrel(sch, cx, yTop - cu, yBot + cu, dPx, w, { tone: arFail ? 'hl' : '' });

  // finish and mask: tented covers the via on both faces; open exposes the pads (ENIG)
  const open = s.mask === 'open';
  const g = 5;
  const opening: [number, number] = [pad[0] - g, pad[1] + g];
  if (open) {
    viaFinish(sch, [[opening[0], hole[0]], [hole[1], pad[1]]], yTop - cu, 'top');
    viaFinish(sch, [[pad[0], hole[0]], [hole[1], opening[1]]], yBot + cu, 'bottom');
  }
  viaMask(sch, x0, x1, yTop, 'top', [[x0, pad[1]]], open ? [opening] : []);
  viaMask(sch, x0, x1, yBot, 'bottom', [[pad[0], x1]], open ? [opening] : []);

  // current path: in on L1 from the left, out on L4 to the right
  const yIn = yTop - cu - VIA_PX.mask - 12;
  if (pad[0] - 14 - (x0 + 26) > 24) {
    sch.arrow([x0 + 26, yIn], [pad[0] - 14, yIn]);
    sch.text(x0 + 8, yIn + 4, 'I', 'sch-label', 'start');
  }
  const yOut = yBot + cu + VIA_PX.mask + 12;
  if (x1 - 26 - (pad[1] + 14) > 24) {
    sch.arrow([pad[1] + 14, yOut], [x1 - 26, yOut]);
    sch.text(x1 - 8, yOut + 4, 'I', 'sch-label', 'end');
  }

  // dimensions: D_pad above, d across the hole, D_ap under L3, t at the left wall, T at the right
  const yPadDim = yTop - cu - VIA_PX.mask - 26;
  sch.shape('line', { x1: pad[0], y1: yTop - cu - 1, x2: pad[0], y2: yPadDim - 2, class: 'sch-dim' });
  sch.shape('line', { x1: pad[1], y1: yTop - cu - 1, x2: pad[1], y2: yPadDim - 2, class: 'sch-dim' });
  sch.dim([pad[0], yPadDim], [pad[1], yPadDim], `D_pad = ${fLen(s.pad)}`, { off: 9 });

  const yD = (yL2 + yL3 + cu) / 2;
  sch.dim([hole[0], yD], [hole[1], yD], '', { tone: tone('d') });
  sch.text(hole[1] + 8, yD + 4, `d = ${val('d', fLen(s.d))}`, `sch-label sch-halo ${tone('d')}`.trim(), 'start');

  const yAp = yL3 + cu + 9;
  sch.dim([ap[0], yAp], [ap[1], yAp], '', { tone: tone('Da') });
  const apText = `D_ap = ${val('Da', fLen(s.Da))}`;
  const apW = apText.length * 6.6;
  const apCls = `sch-label sch-halo ${tone('Da')}`.trim();
  if (ap[1] + 6 + apW <= x1 - 2) sch.text(ap[1] + 6, yAp + 4, apText, apCls, 'start');
  else if (ap[0] - 6 - apW >= x0 + 2) sch.text(ap[0] - 6, yAp + 4, apText, apCls, 'end');
  else sch.text(cx + dPx / 2 + 6, yAp + 18, apText, apCls, 'start');

  const yT = (yTop + yL2) / 2 + 2;
  sch.arrow([hole[0] - 30, yT], [hole[0] + w / 2, yT], { head: 6, tone: tone('t') });
  sch.text(hole[0] - 34, yT + 4, `t = ${val('t', si(s.t, 'm', 3))}`, `sch-label sch-halo ${tone('t')}`.trim(), 'end');

  // layer names, then the board thickness and aspect ratio on the right
  const lx = x1 + 6;
  sch.text(lx, yTop - cu + 3, 'L1', 'sch-hint', 'start');
  sch.text(lx, yL2 + 4, 'L2 plane', 'sch-hint', 'start');
  sch.text(lx, yL3 + 4, 'L3 plane', 'sch-hint', 'start');
  sch.text(lx, yBot + cu + 2, 'L4', 'sch-hint', 'start');
  const xT = 378;
  sch.dim([xT, yTop - cu], [xT, yBot + cu], '', {});
  sch.text(xT + 8, (yTop + yBot) / 2 - 6, 'T', 'sch-label', 'start');
  sch.text(xT + 8, (yTop + yBot) / 2 + 9, fLen(s.h), 'sch-value', 'start');
  const ar = res('ar');
  if (ar) sch.text(xT + 8, (yTop + yBot) / 2 + 24, `AR ${(s.h / s.d).toFixed(1)}:1`, ar.tone === 'fail' ? 'sch-value hl' : 'sch-value', 'start');

  // headline
  const iRes = res('iMax');
  const zRes = res('z');
  // computed values are green; a target (I_max when sizing d or t, Z_via when sizing D_ap) stays plain
  const iTone = !failed && (s.solveFor === 'iMax' || s.solveFor === 'Da') ? 'solved' : '';
  const zTone = !failed && s.solveFor !== 'Da' ? 'solved' : '';
  sch.text(16, 18, `I_max = ${iRes ? iRes.display : '—'}`, `sch-label ${iTone}`.trim(), 'start');
  sch.text(150, 18, `Z_via = ${zRes ? zRes.display : '—'}`, `sch-label ${zTone}`.trim(), 'start');
  sch.text(16, 34, `at ΔT = ${+s.dT.toPrecision(4)} °C`, 'sch-hint', 'start');

  const mats: PcbMat[] = ['mask', 'cu', 'fr4', 'air'];
  if (open) mats.push('gold');
  viaLegend(sch, 16, 258, mats, { cols: 3, colW: 128 });
  return sch.svg();
}
