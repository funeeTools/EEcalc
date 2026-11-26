/**
 * Edge-coupled stripline cross-section: two planes, laminate, two traces W × t with gap S, centred in b.
 * Drawn with the shared PCB material kit in the same frame as the other PCB impedance drawings
 * (controlled-impedance/xs): planes, laminate, dimension style, caption row and legend spot.
 */

import type { CalcReport } from '@/core/calc/types';
import { pcbRect } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import { XS, caption, clamp, field, hDim, laminate, legend, newFrame, plane, vDim } from '../controlled-impedance/xs';
import type { StriplineDiffState } from './def';

const fLen = (m: number) => si(m, 'm', 3);

export function striplineDiagram(s: StriplineDiffState, r: CalcReport): SVGSVGElement | null {
  if (!(s.b > 0) || !(s.w > 0) || !(s.s > 0)) return null;
  const sch = newFrame();
  const solved = s.solveFor;
  const res = r.results.find((x) => x.key === solved && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === solved ? (failed ? 'hl' : 'solved') : '');
  const show = (k: 'w' | 's' | 'b', sym: string) => `${sym} = ${k === solved && failed ? '—' : fLen(s[k])}`;
  const { xL, xR, xDim } = XS;

  // ── scale: b is drawn 140 px tall (same plane spacing as the other stripline drawings); W and S follow b,
  // clamped so the drawing stays legible
  const yPlane = 200;
  const B = 140;
  const yTop = yPlane - B;
  const px = B / s.b;
  let wPx = clamp(s.w * px, 26, 120);
  let sPx = clamp(s.s * px, 22, 110);
  if (2 * wPx + sPx > 300) {
    const f = 300 / (2 * wPx + sPx); // keep the pair inside the board (ratio kept, b no longer to scale)
    wPx *= f;
    sPx *= f;
  }
  const tPx = s.t > 0 ? clamp(s.t * px, 3, 22) : 1.5;
  const cx = 205;
  const x1 = cx - sPx / 2 - wPx;
  const x2 = cx + sPx / 2;
  const yc = yTop + B / 2;
  const yT = yc - tPx / 2;

  laminate(sch, yTop, B);
  plane(sch, yPlane);
  pcbRect(sch, 'cu', xL, yTop - XS.plane, xR - xL, XS.plane, { layer: 'back' });
  pcbRect(sch, 'cu', x1, yT, wPx, tPx);
  pcbRect(sch, 'cu', x2, yT, wPx, tPx);
  sch.text(x1 - 7, yc + 5, '+', 'sch-label sch-halo', 'end');
  sch.text(x2 + wPx + 7, yc + 5, '−', 'sch-label sch-halo', 'start');

  // ── odd-mode field: across the gap and to both planes (clear of the W and S labels)
  if (sPx >= 26) field(sch, [x1 + wPx + 3, yc], [x2 - 3, yc]);
  // odd mode: field leaves the + trace for the planes and arrives at the − trace from them
  const xa = Math.max(x1 - 36, xL + 6); // keep the arrow ends on the board for a wide pair
  const xb = Math.min(x2 + wPx + 36, xR - 6);
  field(sch, [x1 + 2, yT - 2], [xa, yTop + 3]);
  field(sch, [x1 + 2, yT + tPx + 2], [xa, yPlane - 3]);
  field(sch, [xb, yTop + 3], [x2 + wPx - 2, yT - 2]);
  field(sch, [xb, yPlane - 3], [x2 + wPx - 2, yT + tPx + 2]);

  // ── dimensions: W above the left trace, S below the gap, b on the right, T beside the right trace
  hDim(sch, x1, x1 + wPx, yT - 14, yT, show('w', 'W'), tone('w'), { halo: true });
  hDim(sch, x1 + wPx, x2, yT + tPx + 14, yT + tPx, show('s', 'S'), tone('s'), { below: true, halo: true });
  vDim(sch, xDim, yTop, yPlane, 'b', solved === 'b' && failed ? '—' : fLen(s.b), tone('b'));
  // T beside the copper it measures; under the right trace when a wide pair leaves no room on its right
  if (s.t > 0) {
    if (x2 + wPx + 84 < xR) sch.text(x2 + wPx + 8, yT + tPx + 16, `T = ${fLen(s.t)}`, 'sch-value sch-halo', 'start');
    else sch.text(x2 + wPx, yT + tPx + 30, `T = ${fLen(s.t)}`, 'sch-value sch-halo', 'end');
  }
  sch.text(xL + 8, yPlane - 8, `ε_r = ${+s.er.toPrecision(4)}`, 'sch-label sch-halo', 'start');
  sch.text(xL, yPlane + XS.plane + 15, 'ground planes above and below · traces centred', 'sch-hint', 'start');

  // ── caption: impedances
  const zd = r.ok ? r.results.find((x) => x.key === 'zdiff') : undefined;
  const zc = r.ok ? r.results.find((x) => x.key === 'zcm') : undefined;
  caption(sch, [{ text: `Z_diff = ${zd ? zd.display : solved === 'zdiff' ? '—' : si(s.zdiff, 'Ω', 4)}`, tone: solved === 'zdiff' ? (r.ok ? 'solved' : 'hl') : '' }, ...(zc ? [{ text: `Z_cm = ${zc.display}` }] : [])]);
  legend(sch, ['cu', 'fr4']);
  return sch.svg();
}
