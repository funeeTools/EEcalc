/**
 * Controlled-impedance cross-section: one board, five line types. Roughly to scale (H is 78 px; W, T, the
 * mask, cover and gap follow H with clamped ratios so extreme inputs still read). Materials from the PCB kit.
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbRect, pcbShape } from '@/core/schematic/pcb';
import type { CiState } from './def';
import { XS, caption, clamp, fLen, field, hDim, laminate, legend, newFrame, plane, solveTones, vDim } from './xs';

export function ciDiagram(s: CiState, r?: CalcReport): SVGSVGElement | null {
  if (!(s.h > 0) || !(s.w > 0)) return null;
  const sch = newFrame();
  const { tone, val } = solveTones(s.solveFor, r);
  const { xL, xR, xDim } = XS;
  const isSl = s.structure === 'sl';
  const isCpw = s.structure === 'cpwg';
  const hPx = isSl ? 56 : 78;
  const px = hPx / s.h;
  const tPx = s.t > 0 ? clamp(s.t * px, 3, 22) : 1.5;
  let gPx = isCpw ? clamp(s.g * px, 8, 90) : 0;
  let wPx = clamp(s.w * px, 14, isCpw ? 200 : 260);
  if (isCpw && wPx + 2 * gPx > 290) {
    const f = 290 / (wPx + 2 * gPx);
    wPx *= f;
    gPx *= f;
  }
  const cx = 205;
  const x0 = cx - wPx / 2;
  const x1 = cx + wPx / 2;
  const mats = new Set<PcbMat>(['cu', 'fr4']);

  // ── vertical stack (y grows downward): plane at the bottom
  const yPlane = 200;
  const ySub = yPlane - hPx; // top of the laminate under the trace
  const yT = ySub - tPx; // top of the trace

  laminate(sch, ySub, hPx);
  plane(sch, yPlane);
  let yTop = yT; // highest material edge (for the dimension above)

  if (isSl) {
    // upper dielectric and plane: H above the trace top
    const yUp = yT - hPx;
    laminate(sch, yUp, ySub - yUp + 0.5);
    pcbRect(sch, 'cu', xL, yUp - XS.plane, xR - xL, XS.plane, { layer: 'back' });
    yTop = yUp;
  }
  let yCover = 0;
  if (s.structure === 'emb') {
    const hcPx = s.hc > 0 ? clamp(s.hc * px, 8, 64) : 0;
    yCover = yT - hcPx;
    if (s.hc > 0) laminate(sch, yCover, ySub - yCover + 0.5);
    yTop = yCover;
  }

  // ── copper: trace, then the CPWG pours and stitching vias
  pcbRect(sch, 'cu', x0, yT, wPx, tPx);
  if (isCpw) {
    const pl = x0 - gPx;
    const pr = x1 + gPx;
    pcbRect(sch, 'cu', xL, yT, pl - xL, tPx);
    pcbRect(sch, 'cu', pr, yT, xR - pr, tPx);
    // plated stitching vias through the laminate (barrel walls copper, hole air)
    for (const vx of [Math.max(xL + 16, pl - 34), Math.min(xR - 30, pr + 20)]) {
      pcbRect(sch, 'cu', vx, yT, 14, yPlane - yT);
      pcbRect(sch, 'air', vx + 3, yT, 8, yPlane - yT);
    }
    mats.add('air');
  }

  // ── conformal solder mask over trace and laminate (drawn at ≥ 3 px)
  if (s.structure === 'mask' && s.c > 0) {
    const c = clamp(s.c * px, 3, 14);
    const d = [
      `M ${xL} ${ySub}`,
      `L ${xL} ${ySub - c}`,
      `L ${x0 - c} ${ySub - c}`,
      `L ${x0 - c} ${yT - c}`,
      `L ${x1 + c} ${yT - c}`,
      `L ${x1 + c} ${ySub - c}`,
      `L ${xR} ${ySub - c}`,
      `L ${xR} ${ySub}`,
      `L ${x1} ${ySub}`,
      `L ${x1} ${yT}`,
      `L ${x0} ${yT}`,
      `L ${x0} ${ySub}`,
      'Z',
    ].join(' ');
    pcbShape(sch, 'mask', 'path', { d });
    mats.add('mask');
    yTop = yT - c;
    // label in the air at the top right, with a leader down to the mask beyond the trace
    sch.text(xR, 60, `solder mask C = ${fLen(s.c)}, ε_m = ${+s.erm.toPrecision(3)}`, 'sch-value', 'end');
    if (x1 + c + 70 < xR - 12) sch.shape('line', { x1: xR - 12, y1: 67, x2: xR - 12, y2: ySub - c - 1, class: 'sch-dim' });
  }

  // ── E-field (what Z₀ is about): trace to its reference plane(s); on CPWG also across the gaps to the pours
  const ya = ySub + 4;
  const inset = isCpw ? 18 : 8; // keep the edge arrows clear of the gap arrows on CPWG
  field(sch, [cx, ya], [cx, yPlane - 3]);
  if (wPx > 40) {
    field(sch, [x0 + inset, ya], [x0 - 6, yPlane - 3]);
    field(sch, [x1 - inset, ya], [x1 + 6, yPlane - 3]);
  }
  if (isSl) {
    // upward field: the centre arrow starts above the W label; the edge arrows slant out far enough to clear it
    const labelHalf = (`W = ${fLen(s.w)}`.length * 7.2) / 2 + 4;
    const excess = Math.max(labelHalf - wPx / 2, 0);
    const dx = clamp(3.2 * (excess + 3), 18, 130);
    field(sch, [cx, yT - 32], [cx, yTop + 3]);
    field(sch, [x0 + 1, yT - 2], [x0 - dx, yTop + 3]);
    field(sch, [x1 - 1, yT - 2], [x1 + dx, yTop + 3]);
  }
  if (isCpw) {
    // coplanar field: from the trace edges across each gap to the pours, just under the surface
    const yg = ySub + 7;
    field(sch, [x0 + 6, yg], [x0 - gPx - 6, yg]);
    field(sch, [x1 - 6, yg], [x1 + gPx + 6, yg]);
  }

  // ── dimensions: W (and G) above the trace, heights on the right, T beside the trace
  const overMat = isSl || s.structure === 'emb';
  const yW = isCpw ? yT - 30 : s.structure === 'mask' ? yTop - 12 : yT - 14;
  hDim(sch, x0, x1, yW, yT, `W = ${val('w', fLen(s.w))}`, tone('w'), { halo: overMat });
  if (isCpw) {
    const pr = x1 + gPx;
    hDim(sch, x1, pr, yT - 12, yT, `G = ${val('g', fLen(s.g))}`, tone('g'), { anchor: 'start', dx: 4, halo: true });
  }
  vDim(sch, xDim, ySub, yPlane, 'H', val('h', fLen(s.h)), tone('h'));
  if (isSl) vDim(sch, xDim, yTop, yT, 'H', val('h', fLen(s.h)), tone('h'));
  if (s.structure === 'emb' && s.hc > 0) vDim(sch, xDim, yCover, yT, 'H_c', fLen(s.hc));
  if (s.t > 0) {
    const c = s.structure === 'mask' && s.c > 0 ? clamp(s.c * px, 3, 14) : 0;
    // beside the trace; with mask, in the air just above the mask so it does not straddle the mask step
    if (c > 0) sch.text(x1 + c + 6, ySub - c - 4, `T = ${fLen(s.t)}`, 'sch-value sch-halo', 'start');
    else if (!isCpw) sch.text(x1 + 6, yT + tPx / 2 + 4, `T = ${fLen(s.t)}`, 'sch-value sch-halo', 'start');
    else sch.text(xL + 6, yT - 7, `T = ${fLen(s.t)}`, 'sch-value', 'start'); // over the left pour, clear of the G label
  }

  // ── material labels
  sch.text(xL + 8, yPlane - 10, `ε_r = ${val('er', String(+s.er.toPrecision(4)))}`, `sch-label sch-halo ${tone('er')}`.trim(), 'start');
  if (s.structure === 'emb' && s.hc > 0 && yT - yCover >= 14) sch.text(xL + 8, yCover + 12, `cover ε_c = ${+s.erc.toPrecision(3)}`, 'sch-value sch-halo', 'start');
  if (!isSl && yTop > 62) sch.text(xL + 4, 44, 'air (ε_r = 1)', 'sch-hint', 'start');
  sch.text(xL, yPlane + XS.plane + 15, isSl ? 'reference planes above and below · trace centred' : isCpw ? 'ground pours stitched to the plane below' : 'ground plane', 'sch-hint', 'start');

  // ── caption
  const z0 = r?.results.find((x) => x.key === 'z0');
  const ee = r?.ok ? r.results.find((x) => x.key === 'epsEff') : undefined;
  caption(sch, [
    { text: `Z₀ = ${s.solveFor === 'z0' && r && !r.ok ? '—' : z0 ? z0.display : `${+s.z0.toPrecision(4)} Ω`}`, tone: tone('z0') },
    ...(ee ? [{ text: `ε_eff = ${ee.display}` }] : []),
  ]);
  legend(sch, (['mask', 'cu', 'fr4', 'air'] as PcbMat[]).filter((m) => mats.has(m)), { air: 'Air (via hole)' });
  return sch.svg();
}
