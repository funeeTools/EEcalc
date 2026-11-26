/**
 * Broadside-coupled pair cross-section (same frame as the other PCB impedance drawings): two planes, the two
 * traces stacked with gap S between them, H to each plane. The odd-mode field runs mostly straight across
 * the gap (the coupling) and the rest to the planes. Roughly to scale with clamped ratios.
 */

import type { CalcReport } from '@/core/calc/types';
import { pcbRect } from '@/core/schematic/pcb';
import { XS, caption, clamp, fLen, field, hDim, laminate, legend, newFrame, plane, solveTones, vDim } from '../controlled-impedance/xs';
import type { BroadsideState } from './def';

export function broadsideDiagram(s: BroadsideState, r?: CalcReport): SVGSVGElement | null {
  if (!(s.h > 0) || !(s.w > 0) || !(s.s > 0)) return null;
  const sch = newFrame();
  const { tone, val } = solveTones(s.solveFor, r);
  const { xL, xR, xDim } = XS;
  const yPlane = 200;
  const total = 140;
  const b = 2 * s.h + 2 * s.t + s.s;
  const tPx = s.t > 0 ? clamp((s.t / b) * total, 6, 14) : 3; // thin copper drawn at ≥ 6 px so it reads at hover-card size
  const avail = total - 2 * tPx;
  const sPx = clamp((s.s / (2 * s.h + s.s)) * avail, 22, avail - 44);
  const hPx = (avail - sPx) / 2;
  const px = (sPx + hPx) / (s.s + s.h);
  const wPx = clamp(s.w * px, 40, 260);
  const cx = 205;
  const x0 = cx - wPx / 2;
  const yTop = yPlane - total;
  const yLowTop = yPlane - hPx - tPx; // lower trace top face
  const yUpBot = yLowTop - sPx; // upper trace bottom face
  const yUpTop = yUpBot - tPx;

  laminate(sch, yTop, total);
  plane(sch, yPlane);
  pcbRect(sch, 'cu', xL, yTop - XS.plane, xR - xL, XS.plane, { layer: 'back' });
  pcbRect(sch, 'cu', x0, yUpTop, wPx, tPx);
  pcbRect(sch, 'cu', x0, yLowTop, wPx, tPx);
  sch.text(x0 - 7, yUpTop + tPx / 2 + 5, '+', 'sch-label sch-halo', 'end');
  sch.text(x0 - 7, yLowTop + tPx / 2 + 5, '−', 'sch-label sch-halo', 'end');

  // ── odd-mode field: straight across the gap, fringing at the edges, and to the planes
  const spread = wPx > 60 ? [-0.25, 0.25] : [0];
  for (const f of spread) field(sch, [cx + f * wPx, yUpBot + 3], [cx + f * wPx, yLowTop - 3]);
  field(sch, [x0 + 2, yUpBot + 2], [x0 + 2, yLowTop - 2]);
  field(sch, [x0 + wPx - 2, yUpBot + 2], [x0 + wPx - 2, yLowTop - 2]);
  if (hPx > 26) {
    // to the planes from the left edges (the W label sits on the right)
    field(sch, [x0 - 3, yUpTop - 2], [x0 - 38, yTop + 3]);
    field(sch, [x0 - 38, yPlane - 3], [x0 - 3, yLowTop + tPx + 2]); // the plane’s field ends on the − trace
  }

  // ── dimensions: W beside the upper trace, heights on the right
  // centred over a wide trace; beside (to the right of) a narrow one
  const wLabelAbove = hPx >= 30;
  if (wLabelAbove) hDim(sch, x0, x0 + wPx, yUpTop - 11, yUpTop, `W = ${val('w', fLen(s.w))}`, tone('w'), { halo: true, ...(wPx < 100 ? { anchor: 'start' as const, dx: 6 } : {}) });
  else sch.text(x0 + wPx + 8, yUpTop + tPx / 2 + 4, `W = ${val('w', fLen(s.w))}`, `sch-label sch-halo ${tone('w')}`.trim(), 'start');
  vDim(sch, xDim, yTop, yUpTop, 'H', val('h', fLen(s.h)), tone('h'));
  vDim(sch, xDim, yUpBot, yLowTop, 'S', val('s', fLen(s.s)), tone('s'));
  vDim(sch, xDim, yLowTop + tPx, yPlane, 'H', val('h', fLen(s.h)), tone('h'));
  if (s.t > 0) sch.text(x0 + wPx + 8, yLowTop + tPx / 2 + 4, `T = ${fLen(s.t)}`, 'sch-value sch-halo', 'start'); // beside the copper it measures
  sch.text(xL + 8, yPlane - 7, `ε_r = ${+s.er.toPrecision(4)}`, 'sch-label sch-halo', 'start');
  sch.text(xL, yPlane + XS.plane + 15, `planes ${fLen(b)} apart · traces stacked, driven + and −`, 'sch-hint', 'start');

  const zd = r?.results.find((x) => x.key === 'zdiff');
  const zc = r?.ok ? r.results.find((x) => x.key === 'zcm') : undefined;
  caption(sch, [
    { text: `Z_diff = ${s.solveFor === 'zdiff' && r && !r.ok ? '—' : zd ? zd.display : `${+s.zdiff.toPrecision(4)} Ω`}`, tone: tone('zdiff') },
    ...(zc ? [{ text: `Z_cm = ${zc.display}` }] : []),
  ]);
  legend(sch, ['cu', 'fr4']);
  return sch.svg();
}
