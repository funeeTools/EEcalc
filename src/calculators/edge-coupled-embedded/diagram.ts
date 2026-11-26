/**
 * Cross-section of the embedded pair: ground plane, substrate H, two traces W × T with gap S, and the cover
 * reaching H₂ above the copper (prepreg, solder mask, or none), air above. Roughly to scale with clamped ratios.
 * Materials from the shared PCB kit (core/schematic/pcb.ts); same conventions as the microstrip cross-section.
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbLegend, pcbRect, type PcbMat } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { EceState } from './def';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const fLen = (m: number) => si(m, 'm', 3);

export function eceDiagram(s: EceState, r: CalcReport): SVGSVGElement | null {
  if (!(s.h > 0) || !(s.w > 0) || !(s.s > 0)) return null;
  const sch = new Schematic(460, 262);
  const solved = s.solveFor;
  const failed = !r.ok;
  const tone = (k: string) => (k === solved ? (failed ? 'hl' : 'solved') : '');
  const show = (k: 'w' | 's', sym: string) => `${sym} = ${k === solved && failed ? '—' : fLen(s[k])}`;

  // ── scale: H drawn 58–100 px so the stack (H + T + H₂) fills the space under the header; W, S, T and H₂
  // follow H, clamped so extreme ratios still read
  const hPx = clamp(136 / (1 + Math.min(s.erc > 1 + 1e-9 ? s.h2 / s.h : 0, 3)) - 4, 58, 118);
  let wPx = clamp((s.w / s.h) * hPx, 16, 120);
  let sPx = clamp((s.s / s.h) * hPx, 12, 120);
  if (2 * wPx + sPx > 290) {
    const f = 290 / (2 * wPx + sPx);
    wPx *= f;
    sPx *= f;
  }
  const tPx = s.t > 0 ? clamp((s.t / s.h) * hPx, 2.5, 22) : 1.5;
  const hasCover = s.erc > 1 + 1e-9;
  const h2Px = hasCover ? (s.h2 > 0 ? clamp((s.h2 / s.h) * hPx, 5, 70) : 0) : 0;
  const coverMat: PcbMat = s.cover === 'LPI solder mask (3.5)' ? 'mask' : 'fr4';

  const xL = 24;
  const xR = 372;
  const cx = 198;
  const yPlane = 206;
  const ySub = yPlane - hPx;
  const yTr = ySub - tPx;
  const yCov = yTr - h2Px;
  const x1 = cx - sPx / 2 - wPx;
  const x2 = cx + sPx / 2;

  // ── materials: plane, substrate, cover (fills the gap and reaches H₂ above the copper), traces
  pcbRect(sch, 'fr4', xL, ySub, xR - xL, hPx, { layer: 'back' });
  pcbRect(sch, 'cu', xL, yPlane, xR - xL, 9, { layer: 'back' });
  if (hasCover) pcbRect(sch, coverMat, xL, yCov, xR - xL, ySub - yCov, { layer: 'back' });
  pcbRect(sch, 'cu', x1, yTr, wPx, tPx);
  pcbRect(sch, 'cu', x2, yTr, wPx, tPx);

  // ── odd-mode polarity and the field across the gap
  sch.text(x1 + wPx / 2, ySub + 14, '+', 'sch-sign sch-halo', 'middle');
  sch.text(x2 + wPx / 2, ySub + 14, '−', 'sch-sign sch-halo', 'middle');
  if (sPx >= 26) {
    sch.arrow([x1 + wPx + 3, yTr + tPx / 2], [x2 - 3, yTr + tPx / 2], { head: 5 });
    sch.text(cx, yTr - 7, sPx >= 70 ? 'E field, odd mode' : 'E', 'sch-hint sch-halo', 'middle');
  }

  // ── dimensions: W and S as a chain under the traces (labels meet at the W/S boundary), T beside the
  // right trace, H and H₂ on the right
  const ext = (x: number, y0: number, y1: number) => sch.shape('line', { x1: x, y1: y0, x2: x, y2: y1, class: 'sch-dim' });
  const yS = ySub + 26;
  ext(x1, ySub + 2, yS + 4);
  ext(x1 + wPx, ySub + 2, yS + 4);
  ext(x2, ySub + 2, yS + 4);
  sch.dim([x1, yS], [x1 + wPx, yS], '', { tone: tone('w') });
  sch.dim([x1 + wPx, yS], [x2, yS], '', { tone: tone('s') });
  sch.text(x1 + wPx - 3, yS + 17, show('w', 'W'), `sch-label sch-halo ${tone('w')}`.trim(), 'end');
  sch.text(x1 + wPx + 3, yS + 17, show('s', 'S'), `sch-label sch-halo ${tone('s')}`.trim(), 'start');
  if (s.t > 0) {
    const tTxt = `T = ${fLen(s.t)}`;
    if (x2 + wPx + 92 < xR) sch.text(x2 + wPx + 6, yTr + tPx / 2 + 4, tTxt, 'sch-value sch-halo', 'start');
    else sch.text(x2 + wPx, yTr - 6, tTxt, 'sch-value sch-halo', 'end');
  }
  const xd = xR + 14;
  sch.dim([xd, ySub], [xd, yPlane], '', {});
  sch.text(xd + 6, (ySub + yPlane) / 2 - 2, 'H', 'sch-label', 'start');
  sch.text(xd + 6, (ySub + yPlane) / 2 + 12, fLen(s.h), 'sch-value', 'start');
  if (hasCover && h2Px > 0) {
    sch.dim([xd, yCov], [xd, yTr], '', {});
    sch.text(xd + 6, Math.min((yCov + yTr) / 2 + 2, ySub - 18), 'H₂', 'sch-label', 'start');
    sch.text(xd + 6, Math.min((yCov + yTr) / 2 + 16, ySub - 4), fLen(s.h2), 'sch-value', 'start');
  }

  // ── permittivities, air, plane
  sch.text(xL + 8, yPlane - 10, `εᵣ = ${+s.er.toPrecision(4)}`, 'sch-label sch-halo', 'start');
  const inside = h2Px + tPx >= 18;
  if (hasCover) sch.text(xL + 8, inside ? yCov + 14 : yCov - 6, `ε_rc = ${+s.erc.toPrecision(4)}${coverMat === 'mask' ? ' (mask)' : ''}`, `sch-label ${inside ? 'sch-halo' : ''}`.trim(), 'start');
  sch.text(xR, (hasCover ? yCov : yTr) - 8, 'air', 'sch-hint', 'end');
  sch.text(xL + 8, yPlane + 24, 'ground plane', 'sch-hint', 'start');

  // ── header: impedances
  const zd = r.ok ? r.results.find((x) => x.key === 'zdiff') : undefined;
  const zc = r.ok ? r.results.find((x) => x.key === 'zcm') : undefined;
  sch.text(xL, 22, `Z_diff = ${zd ? zd.display : solved === 'zdiff' ? '—' : si(s.zdiff, 'Ω', 4)}`, `sch-caption ${solved === 'zdiff' ? (r.ok ? 'solved' : 'hl') : ''}`.trim(), 'start');
  if (zc) sch.text(xL + 170, 22, `Z_cm = ${zc.display}`, 'sch-caption', 'start');

  // ── legend: copper, then the substrate and (if any) the cover as named laminate / mask entries
  // one laminate entry when the cover is the substrate's own material; otherwise name the cover for what it is
  const same = hasCover && coverMat === 'fr4' && s.cover === 'Same as substrate';
  if (!hasCover || same) pcbLegend(sch, xL, 248, ['cu', 'fr4'], { colW: 92, names: { fr4: same ? 'Core / prepreg' : 'Substrate' } });
  else {
    pcbLegend(sch, xL, 248, ['cu', 'fr4'], { colW: 92, names: { fr4: 'Substrate' } });
    const coverName = coverMat === 'mask' ? 'Cover (solder mask)' : s.cover === 'FR-4 prepreg (4.2)' ? 'Cover (prepreg)' : `Cover (εr ${+s.erc.toPrecision(3)})`;
    pcbLegend(sch, xL + 184, 248, [coverMat], { names: { [coverMat]: coverName } });
  }
  return sch.svg();
}
