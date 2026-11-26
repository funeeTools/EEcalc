/**
 * BGA land pad. Left: top view of a 3 × 2 corner of lands on the pitch (NSMD: gold land inside a bare-laminate
 * mask opening; SMD: copper under mask with the gold opening), with the traces that fit between the columns.
 * Right: section through one joint — laminate, copper land, mask (clearing the land for NSMD, overlapping it for
 * SMD) and the reflowed ball between the land and the package. Each panel has its own scale; both are to scale
 * within the panel.
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type LandState, landGeom } from './def';
import { tracesInGap } from './model';

const ORDER: PcbMat[] = ['mask', 'maskCu', 'cu', 'gold', 'solder', 'fr4', 'fr4Bare', 'part'];

export function landDiagram(s: LandState, r: CalcReport): SVGSVGElement | null {
  if (!(s.p > 0) || !(s.ball > 0) || !(s.land > 0) || !(s.maskClr >= 0)) return null;
  const sch = new Schematic(460, 320);
  const failed = !r.ok;
  const mats = new Set<PcbMat>();
  const fmt = (m: number) => si(m, 'm', 3);
  const landTone = s.solveFor === 'land' ? (failed ? 'hl' : 'solved') : r.status?.tone === 'fail' ? 'hl' : '';
  const landTxt = failed && s.solveFor === 'land' ? '—' : fmt(s.land);
  const g = landGeom(s, s.land);
  const nFit = tracesInGap(s.p - g.cu, s.w, s.s);
  const short = nFit < s.n;
  const disc = (m: PcbMat, cx: number, cy: number, rr: number) => {
    mats.add(m);
    pcbShape(sch, m, 'circle', { cx, cy, r: Math.max(rr, 0.8) });
  };

  // ── header
  const pctRes = r.results.find((x) => x.key === 'pct');
  sch.text(14, 16, `D_land = ${landTxt}${pctRes && !failed ? `  ·  ${pctRes.display} than the ball` : ''}`, `sch-caption ${landTone}`.trim(), 'start');
  sch.text(14, 30, `${s.padDef === 'nsmd' ? 'NSMD' : 'SMD'} · ${s.ballType === 'collapse' ? 'collapsing' : 'non-collapsing'} ${fmt(s.ball)} ball · mask ${s.padDef === 'nsmd' ? 'opening' : 'overlap'} ${fmt(s.maskClr)} per side`, 'sch-hint', 'start');

  // ── top view, 3 × 2 lands
  const tx0 = 14;
  const tx1 = 246;
  const ty0 = 62;
  const ty1 = 206;
  const outer = Math.max(g.cu, g.open);
  const k = Math.min((tx1 - tx0 - 16) / (2 * s.p + outer), (ty1 - ty0 - 16) / (s.p + outer));
  const P = s.p * k;
  const xc = (c: number) => (tx0 + tx1) / 2 + (c - 1) * P;
  const yr = (rw: number) => (ty0 + ty1) / 2 + (rw - 0.5) * P;
  mats.add('mask');
  pcbRect(sch, 'mask', tx0, ty0, tx1 - tx0, ty1 - ty0, { layer: 'back' });
  const rCu = Math.max((g.cu * k) / 2, 1.5);
  const rOpen = Math.max((g.open * k) / 2, 1.5);
  const wPx = Math.max(s.w * k, 1.2);
  // traces that fit between the columns, under mask, centred in the channel as a group
  const nDraw = Math.min(nFit, 6);
  const groupW = nDraw * s.w * k + Math.max(nDraw - 1, 0) * s.s * k;
  for (const c of [0, 1])
    for (let i = 0; i < nDraw; i++) {
      const lx = (xc(c) + xc(c + 1)) / 2 - groupW / 2 + (s.w * k) / 2 + i * (s.w + s.s) * k;
      mats.add('maskCu');
      pcbRect(sch, 'maskCu', lx - wPx / 2, ty0, wPx, ty1 - ty0);
    }
  for (let rw = 0; rw < 2; rw++)
    for (let c = 0; c < 3; c++) {
      const cx = xc(c);
      const cy = yr(rw);
      if (s.padDef === 'nsmd') {
        if (rOpen > rCu + 0.3) disc('fr4Bare', cx, cy, rOpen);
        disc('gold', cx, cy, rCu);
      } else {
        disc('maskCu', cx, cy, rCu);
        disc('gold', cx, cy, Math.min(rOpen, rCu));
      }
    }
  // p above the top row, D_land below the bottom-left land
  const yP = ty0 - 8;
  for (const c of [0, 1]) sch.shape('line', { x1: xc(c), y1: yr(0), x2: xc(c), y2: yP - 4, class: 'sch-dim' });
  sch.dim([xc(0), yP], [xc(1), yP], `p = ${fmt(s.p)}`, {});
  const rLand = ((s.land * k) / 2);
  const yD = ty1 + 12;
  for (const x of [xc(0) - rLand, xc(0) + rLand]) sch.shape('line', { x1: x, y1: yr(1), x2: x, y2: yD + 4, class: 'sch-dim' });
  sch.dim([xc(0) - rLand, yD], [xc(0) + rLand, yD], '', { tone: landTone });
  sch.text(xc(0) - rLand, yD + 15, `D_land ${landTxt}`, `sch-label ${landTone}`.trim(), 'start');
  sch.text(tx0, yD + 30, `${nFit} trace${nFit === 1 ? '' : 's'} between${short ? ` (${s.n} needed)` : ''} · W/s ${fmt(s.w)}/${fmt(s.s)}`, `sch-value ${short ? 'hl' : ''}`.trim(), 'start');
  sch.text(tx0, yD + 44, 'top view, to scale', 'sch-hint', 'start');

  // ── section through one joint (own scale)
  const sx0 = 262;
  const sx1 = 448;
  const scx = (sx0 + sx1) / 2;
  const widest = Math.max(s.ball, g.cu, g.open);
  const k2 = Math.min(84 / widest, 1e9);
  const yCu = 200; // top of the copper land
  const tCu = 6;
  const yLam = yCu + tCu;
  mats.add('fr4');
  pcbRect(sch, 'fr4', sx0, yLam, sx1 - sx0, 24, { layer: 'back' });
  const cuPx = Math.max(g.cu * k2, 3);
  const openPx = Math.max(g.open * k2, 3);
  // mask (top 4 px above the copper): on the laminate outside the opening (NSMD) or outside the copper, then over
  // the copper edge up to the opening (SMD)
  const yMaskTop = yCu - 4;
  const mOut = Math.max(openPx, cuPx) / 2;
  pcbRect(sch, 'mask', sx0, yMaskTop, scx - mOut - sx0, yLam - yMaskTop);
  pcbRect(sch, 'mask', scx + mOut, yMaskTop, sx1 - scx - mOut, yLam - yMaskTop);
  mats.add('cu');
  pcbRect(sch, 'cu', scx - cuPx / 2, yCu, cuPx, tCu);
  // ENIG finish on the copper exposed in the opening (under the joint), as on the top view
  mats.add('gold');
  pcbRect(sch, 'gold', scx - Math.min(cuPx, openPx) / 2, yCu - 2, Math.min(cuPx, openPx), 2);
  if (cuPx > openPx + 0.5) {
    pcbRect(sch, 'mask', scx - cuPx / 2, yMaskTop, (cuPx - openPx) / 2, 4);
    pcbRect(sch, 'mask', scx + openPx / 2, yMaskTop, (cuPx - openPx) / 2, 4);
  }
  // the joint: a collapsing ball is a sphere of the nominal diameter truncated by the land and the package pad; a
  // non-collapsing ball keeps its sphere and sits in a solder fillet on the land
  const R = (s.ball * k2) / 2;
  const landPx = s.land * k2;
  const yJ = yCu; // the joint wets the copper inside the opening
  mats.add('solder');
  let yc: number;
  let yTop: number;
  if (s.ballType === 'collapse') {
    const ab = Math.min(landPx / 2, 0.96 * R);
    const at = 0.8 * R;
    yc = yJ - Math.sqrt(R * R - ab * ab);
    yTop = yc - Math.sqrt(R * R - at * at);
    pcbShape(sch, 'solder', 'path', { d: `M ${scx - ab} ${yJ} A ${R} ${R} 0 0 1 ${scx - at} ${yTop} L ${scx + at} ${yTop} A ${R} ${R} 0 0 1 ${scx + ab} ${yJ} Z` });
  } else {
    yc = yJ - 0.92 * R;
    const at = 0.6 * R;
    yTop = yc - Math.sqrt(R * R - at * at);
    const ys = yc + 0.55 * R;
    const xs = Math.sqrt(1 - 0.55 * 0.55) * R;
    const lh = Math.max(landPx / 2, xs);
    pcbShape(sch, 'solder', 'path', { d: `M ${scx - lh} ${yJ} Q ${scx - xs} ${yJ - 2} ${scx - xs} ${ys} L ${scx + xs} ${ys} Q ${scx + xs} ${yJ - 2} ${scx + lh} ${yJ} Z` });
    const ab = Math.sqrt(R * R - (yJ - yc) ** 2);
    pcbShape(sch, 'solder', 'path', { d: `M ${scx - ab} ${yJ} A ${R} ${R} 0 0 1 ${scx - at} ${yTop} L ${scx + at} ${yTop} A ${R} ${R} 0 0 1 ${scx + ab} ${yJ} Z` });
  }
  mats.add('part');
  pcbRect(sch, 'part', scx - R - 4, yTop - 12, 2 * R + 8, 12);
  sch.text(scx, yTop - 18, 'package', 'sch-hint', 'middle');
  // D_ball across the widest point, its label beside the ball
  sch.dim([scx - R, yc], [scx + R, yc], '', {});
  const yLab = Math.min(yc, yMaskTop - 26);
  if (yLab < yc - 2) sch.shape('line', { x1: scx + R, y1: yc, x2: scx + R + 4, y2: yLab + 6, class: 'sch-dim' });
  sch.text(scx + R + 9, yLab - 2, 'D_ball', 'sch-label', 'start');
  sch.text(scx + R + 9, yLab + 15, fmt(s.ball), 'sch-value', 'start');
  // land below the laminate
  const yDl = yLam + 24 + 12;
  for (const x of [scx - landPx / 2, scx + landPx / 2]) sch.shape('line', { x1: x, y1: yCu + tCu / 2, x2: x, y2: yDl + 4, class: 'sch-dim' });
  sch.dim([scx - landPx / 2, yDl], [scx + landPx / 2, yDl], '', { tone: landTone });
  sch.text(scx, yDl + 15, `${s.padDef === 'nsmd' ? 'copper' : 'opening'} ${landTxt}`, `sch-label ${landTone}`.trim(), 'middle');
  sch.text(sx0, 62, `Section, ${s.padDef === 'nsmd' ? 'NSMD' : 'SMD'} (own scale)`, 'sch-caption', 'start');
  sch.text(sx0, 76, `${s.padDef === 'nsmd' ? `mask opening ${fmt(g.open)}` : `copper ${fmt(g.cu)} under the mask`}`, 'sch-hint', 'start');

  const names: Partial<Record<PcbMat, string>> = { maskCu: s.padDef === 'smd' ? 'Copper under mask' : 'Trace under mask', gold: 'Land (ENIG)', solder: 'Solder ball', fr4: 'Laminate', fr4Bare: 'Bare laminate', part: 'Package' };
  const shown = ORDER.filter((m) => mats.has(m));
  pcbLegend(sch, 14, 285, shown, { cols: 3, colW: 146, names });
  return sch.svg();
}
