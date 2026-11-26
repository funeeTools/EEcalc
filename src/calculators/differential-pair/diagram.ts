/**
 * Edge-coupled microstrip pair cross-section (same frame as the other PCB impedance drawings): two traces on
 * the laminate over one plane, with the odd-mode field drawn — across the gap (the coupling) and down to
 * the plane. Roughly to scale with clamped ratios.
 */

import type { CalcReport } from '@/core/calc/types';
import { pcbRect } from '@/core/schematic/pcb';
import { XS, caption, clamp, fLen, field, hDim, laminate, legend, newFrame, plane, solveTones, vDim } from '../controlled-impedance/xs';
import type { DiffPairState } from './def';

export function diffPairDiagram(s: DiffPairState, r?: CalcReport): SVGSVGElement | null {
  if (!(s.h > 0) || !(s.w > 0) || !(s.s > 0)) return null;
  const sch = newFrame();
  const { tone, val } = solveTones(s.solveFor, r);
  const { xL, xR, xDim } = XS;
  const hPx = 78;
  const px = hPx / s.h;
  let wPx = clamp(s.w * px, 16, 120);
  let sPx = clamp(s.s * px, 14, 110);
  if (2 * wPx + sPx > 300) {
    const f = 300 / (2 * wPx + sPx);
    wPx *= f;
    sPx *= f;
  }
  const tPx = s.t > 0 ? clamp(s.t * px, 3, 20) : 1.5;
  const cx = 205;
  const xa = cx - sPx / 2 - wPx; // left trace
  const xb = cx + sPx / 2; // right trace
  const yPlane = 200;
  const ySub = yPlane - hPx;
  const yT = ySub - tPx;

  laminate(sch, ySub, hPx);
  plane(sch, yPlane);
  pcbRect(sch, 'cu', xa, yT, wPx, tPx);
  pcbRect(sch, 'cu', xb, yT, wPx, tPx);
  sch.text(xa - 7, yT + tPx / 2 + 5, '+', 'sch-label', 'end');
  sch.text(xb + wPx + 7, yT + tPx / 2 + 5, '−', 'sch-label', 'start');

  // ── odd-mode field runs from + to −: straight across the gap, and through the laminate via the plane
  // (down from the + trace into the plane, up from the plane into the − trace)
  if (sPx >= 22) field(sch, [xa + wPx + 3, yT + tPx / 2], [xb - 3, yT + tPx / 2]);
  for (const f of [0.3, 0.7]) {
    field(sch, [xa + f * wPx, ySub + 4], [xa + f * wPx, yPlane - 3]);
    field(sch, [xb + f * wPx, yPlane - 3], [xb + f * wPx, ySub + 4]);
  }

  // ── dimensions: W over the left trace, S under the gap (halo: over laminate), H at the right
  hDim(sch, xa, xa + wPx, yT - 14, yT, `W = ${val('w', fLen(s.w))}`, tone('w'));
  hDim(sch, xa + wPx, xb, ySub + 46, ySub, `S = ${val('s', fLen(s.s))}`, tone('s'), { below: true, halo: true });
  vDim(sch, xDim, ySub, yPlane, 'H', val('h', fLen(s.h)), tone('h'));
  if (s.t > 0) sch.text(xR, yT - 6, `T = ${fLen(s.t)}`, 'sch-value', 'end');
  sch.text(xL + 8, yPlane - 10, `ε_r = ${+s.er.toPrecision(4)}`, 'sch-label sch-halo', 'start');
  sch.text(xL + 4, 44, 'air (ε_r = 1)', 'sch-hint', 'start');
  sch.text(xL, yPlane + XS.plane + 15, 'ground plane · traces driven + and − (odd mode)', 'sch-hint', 'start');

  const zd = r?.results.find((x) => x.key === 'zdiff');
  const zc = r?.ok ? r.results.find((x) => x.key === 'zcm') : undefined;
  caption(sch, [
    { text: `Z_diff = ${s.solveFor === 'zdiff' && r && !r.ok ? '—' : zd ? zd.display : `${+s.zdiff.toPrecision(4)} Ω`}`, tone: tone('zdiff') },
    ...(zc ? [{ text: `Z_cm = ${zc.display}` }] : []),
  ]);
  legend(sch, ['cu', 'fr4']);
  return sch.svg();
}
