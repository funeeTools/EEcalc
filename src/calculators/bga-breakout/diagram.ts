/**
 * BGA breakout, top view. Left: a 4 × 4 corner of the array inside the package's silkscreen corner,
 * with the escape routing for the chosen channel — on the outer layer the lands (gold in their mask
 * openings), the traces under mask leaving between them and the fan-out vias of the deeper rows; on an
 * inner layer the via pads on bare laminate with the traces between them. Right: one channel magnified,
 * with the gap, trace width and clearance dimensioned.
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbClass, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic, svgEl } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { BgaState } from './def';
import { tracesInGap } from './model';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
let clipSeq = 0;
const ORDER: PcbMat[] = ['mask', 'maskCu', 'cu', 'gold', 'paste', 'solder', 'fr4', 'fr4Bare', 'silk', 'hole', 'air', 'part', 'cuHidden', 'steel', 'coat', 'resin'];

export function bgaDiagram(s: BgaState, r: CalcReport): SVGSVGElement {
  const sch = new Schematic(460, 312);
  const failed = !r.ok;
  const top = s.channel === 'pads';
  const mats = new Set<PcbMat>();
  const tone = (k: BgaState['solveFor']) => (s.solveFor === k ? (failed ? 'hl' : 'solved') : '');
  const fmt = (m: number) => si(m, 'm', 3);

  const nPad = tracesInGap(s.p - s.dPad, s.w, s.s);
  const nVia = tracesInGap(s.p - s.dVia, s.w, s.s);
  const nSel = top ? nPad : nVia;

  /** A trace along a polyline: an edge-coloured stroke under a fill-coloured one, so joints stay round. */
  const trace = (pts: [number, number][], wPx: number, m: PcbMat) => {
    mats.add(m);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
    sch.shape('path', { d, class: pcbClass(m), style: `fill: none; stroke-width: ${wPx + 1.6}px; stroke-linecap: butt; stroke-linejoin: round` });
    sch.shape('path', { d, fill: 'none', style: `stroke: var(--pcb-${m === 'cu' ? 'cu' : 'mask-cu'}); stroke-width: ${wPx}px; stroke-linecap: butt; stroke-linejoin: round` });
  };
  const disc = (m: PcbMat, cx: number, cy: number, rr: number) => {
    mats.add(m);
    pcbShape(sch, m, 'circle', { cx, cy, r: Math.max(rr, 0.6) });
  };
  /** A land on the outer layer: NSMD = gold land inside a bare-laminate ring; SMD = copper under mask, gold in the opening. */
  const land = (cx: number, cy: number, k: number) => {
    const rp = clamp((s.dPad * k) / 2, 1.5, 0.62 * 50);
    const rm = clamp((s.dMask * k) / 2, 1.5, 0.66 * 50);
    if (s.padDef === 'nsmd') {
      if (rm > rp) disc('fr4Bare', cx, cy, rm);
      disc('gold', cx, cy, rp);
    } else {
      disc('maskCu', cx, cy, rp);
      disc('gold', cx, cy, Math.min(rm, rp));
    }
  };
  const via = (cx: number, cy: number, k: number, ringMat: PcbMat) => {
    disc(ringMat, cx, cy, clamp((s.dVia * k) / 2, 1.5, 32));
    disc('hole', cx, cy, clamp((s.drill * k) / 2, 0.8, 30));
  };

  /** Clip everything drawn on the parts layer since `from` to a rectangle (the shapes stay where they are). */
  const clipSince = (from: number, x: number, y: number, w: number, h: number) => {
    const id = `bga-clip-${++clipSeq}`;
    sch.shape('clipPath', { id }, 'back');
    const cp = sch.svg().querySelector(`#${id}`);
    if (cp) cp.appendChild(svgEl('rect', { x, y, width: w, height: h }));
    const g = sch.svg().querySelector('g.sch-parts');
    if (g) for (let i = from; i < g.childNodes.length; i++) (g.childNodes[i] as SVGElement).setAttribute('clip-path', `url(#${id})`);
  };
  const partsCount = () => sch.svg().querySelector('g.sch-parts')?.childNodes.length ?? 0;

  // ── header
  const nTxt = failed && s.solveFor === 'n' ? '—' : String(nSel);
  sch.text(16, 20, `N = ${nTxt} trace${nSel === 1 ? '' : 's'} per channel`, `sch-caption ${tone('n')}`.trim(), 'start');
  sch.text(16, 36, `${top ? 'outer layer: escape between the lands' : 'inner layer: between the vias (lands above, faded)'} · p = ${si(s.p, 'm', 3)}`, 'sch-hint', 'start');

  // ── array corner (4 × 4), package corner at the top-left
  const P = 46; // px per pitch
  const k = P / s.p; // px per metre
  const x0 = 58;
  const y0 = 92;
  const cols = 4;
  const rowsN = 4;
  const xc = (c: number) => x0 + c * P;
  const yr = (r: number) => y0 + r * P;
  const xEdge = x0 - 0.8 * P;
  const yEdge = y0 - 0.8 * P;
  const panelR = 266;
  const panelB = 268;
  const wPx = clamp(s.w * k, 1.2, 20);
  const sPx = s.s * k;
  // background: mask over laminate on the outer layer, bare laminate on an inner layer
  // outer layer: mask over laminate; inner layer seen from above: bare laminate (§7b top views)
  const bg: PcbMat = top ? 'mask' : 'fr4Bare';
  const corner0 = partsCount();
  mats.add(bg);
  pcbRect(sch, bg, 10, 46, panelR - 10, panelB - 46, { layer: 'back' });
  const topRows = Math.min(rowsN, nPad + 1); // rows escaped on the outer layer (no via)
  const viaAt = (c: number, r: number): [number, number] => (s.fanout === 'vip' ? [xc(c), yr(r)] : [xc(c) + P / 2, yr(r) + P / 2]);
  /** Lane x positions in the channel to the right of column c, for gap edges a…b. */
  const lanes = (left: number, right: number, n: number) => Array.from({ length: n }, (_, i) => left + sPx + wPx / 2 + i * (s.w * k + sPx)).filter((x) => x <= right);

  if (top) {
    // escape traces under mask: row 0 straight up, rows 1…N through the channel right of their column
    const out = 52;
    for (let c = 0; c < cols; c++) {
      trace([[xc(c), yr(0)], [xc(c), out]], wPx, 'maskCu');
      const left = xc(c) + (s.dPad * k) / 2;
      const ls = lanes(left, xc(c + 1) - (s.dPad * k) / 2, nPad);
      ls.forEach((lx, i) => {
        const row = i + 1;
        if (row < rowsN) {
          const dy = lx - xc(c);
          trace([[xc(c), yr(row)], [lx, yr(row) - dy], [lx, out]], wPx, 'maskCu');
        } else trace([[lx, panelB - 2], [lx, out]], wPx, 'maskCu');
      });
    }
    // fan-out of the deeper rows
    for (let r = topRows; r < rowsN; r++)
      for (let c = 0; c < cols; c++) {
        const [vx, vy] = viaAt(c, r);
        if (s.fanout === 'dogbone') trace([[xc(c), yr(r)], [vx, vy]], wPx, 'maskCu');
      }
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) land(xc(c), yr(r), k);
    for (let r = topRows; r < rowsN; r++)
      for (let c = 0; c < cols; c++) {
        const [vx, vy] = viaAt(c, r);
        // a via in pad is filled and plated over: the land stays gold, the hole under it is only outlined
        if (s.fanout === 'vip') disc('cuHidden', vx, vy, Math.max((s.drill * k) / 2, 1));
        // dog-bone vias are tented on the outer layer: copper under mask, no open hole
        else if (vx < panelR - 4 && vy < panelB - 4) disc('maskCu', vx, vy, clamp((s.dVia * k) / 2, 1.5, 32));
      }
    // silkscreen corner of the package outline, with the pin-A1 chamfer
    mats.add('silk');
    const t = 2.4;
    const ch = 14;
    pcbShape(sch, 'silk', 'path', { d: `M ${xEdge} ${panelB - 6} L ${xEdge} ${yEdge + ch} L ${xEdge + ch} ${yEdge} L ${panelR - 6} ${yEdge} L ${panelR - 6} ${yEdge + t} L ${xEdge + ch + t * 0.41} ${yEdge + t} L ${xEdge + t} ${yEdge + ch + t * 0.41} L ${xEdge + t} ${panelB - 6} Z` });
  } else {
    // lands of the top layer as ghost outlines, for orientation
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) disc('cuHidden', xc(c), yr(r), (s.dPad * k) / 2);
    sch.shape('path', { d: `M ${xEdge} ${panelB - 6} L ${xEdge} ${yEdge} L ${panelR - 6} ${yEdge}`, class: 'xs-air', fill: 'none' });
    // via rows, outermost first: the first escapes straight up, the next ones through the channels
    const vRows = Array.from({ length: rowsN - topRows }, (_, i) => topRows + i);
    const out = 52;
    vRows.forEach((r, vi) => {
      for (let c = 0; c < cols; c++) {
        const [vx, vy] = viaAt(c, r);
        if (vi === 0) trace([[vx, vy], [vx, out]], wPx, 'cu');
      }
    });
    if (vRows.length) {
      const r0 = vRows[0];
      for (let c = 0; c < cols; c++) {
        const [vx] = viaAt(c, r0);
        const ls = lanes(vx + (s.dVia * k) / 2, vx + P - (s.dVia * k) / 2, nVia);
        ls.forEach((lx, i) => {
          if (i + 1 < vRows.length) {
            const [, vy] = viaAt(c, vRows[i + 1]);
            const dy = lx - vx;
            trace([[vx, vy], [lx, vy - dy], [lx, out]], wPx, 'cu');
          } else trace([[lx, panelB - 2], [lx, out]], wPx, 'cu');
        });
      }
    }
    for (const r of vRows)
      for (let c = 0; c < cols; c++) {
        const [vx, vy] = viaAt(c, r);
        if (vx < panelR - 4 && vy < panelB - 4) via(vx, vy, k, 'cu');
      }
  }
  clipSince(corner0, 10, 46, panelR - 10, panelB - 46);

  // ── channel detail (magnified), right
  const dx0 = 286;
  const dx1 = 450;
  const dy0 = 88;
  const dy1 = 214;
  const D = top ? s.dPad : s.dVia;
  const gap = s.p - D;
  const span = dx1 - dx0;
  // the channel takes ~60 % of the panel; obstacles are cut by the panel edges
  const kd = clamp((span * 0.6) / Math.max(gap, s.p * 0.1), 0, (span * 0.95) / Math.max(s.p - D * 0.2, 1e-9));
  const gPx = Math.max(gap * kd, 4);
  const xa = dx0 + (span - gPx) / 2; // right edge of the left obstacle
  const xb = xa + gPx; // left edge of the right obstacle
  const rO = (D * kd) / 2;
  const cyD = (dy0 + dy1) / 2;
  sch.text((dx0 + dx1) / 2, 50, 'one channel, magnified', 'sch-hint', 'middle');
  const dbg: PcbMat = top ? 'mask' : 'fr4Bare';
  pcbRect(sch, dbg, dx0, dy0, span, dy1 - dy0, { layer: 'back' });
  const det0 = partsCount();
  for (const cx of [xa - rO, xb + rO]) {
    if (top) {
      const rm = (s.dMask * kd) / 2;
      if (s.padDef === 'nsmd') {
        if (rm > rO) disc('fr4Bare', cx, cyD, rm);
        disc('gold', cx, cyD, rO);
      } else {
        disc('maskCu', cx, cyD, rO);
        disc('gold', cx, cyD, Math.min(rm, rO));
      }
    } else {
      disc('cu', cx, cyD, rO);
      disc('hole', cx, cyD, (s.drill * kd) / 2);
    }
  }
  const wD = Math.max(s.w * kd, 1.2);
  const sD = s.s * kd;
  const nDraw = Math.min(nSel, 8);
  const lx = Array.from({ length: nDraw }, (_, i) => xa + sD + wD / 2 + i * (wD + sD));
  for (const x of lx) trace([[x, dy0], [x, dy1]], wD, top ? 'maskCu' : 'cu');
  clipSince(det0, dx0, dy0, span, dy1 - dy0);
  // dimensions: gap on top, W and s at the bottom
  sch.dim([xa, dy0 - 8], [xb, dy0 - 8], `g = ${fmt(gap)}`, {});
  const yb = dy1 + 12;
  if (nDraw > 0) {
    sch.dim([lx[0] - wD / 2, yb], [lx[0] + wD / 2, yb], '', { tone: tone('w') });
    sch.dim([xa, yb + 16], [lx[0] - wD / 2, yb + 16], '', {});
    sch.text(lx[0] + wD / 2 + 4, yb + 4, `W = ${failed && s.solveFor === 'w' ? '—' : fmt(s.w)}`, `sch-label ${tone('w')}`.trim(), 'start');
    sch.text(lx[0] - wD / 2 + 4 + Math.max(0, 0), yb + 20, `s = ${fmt(s.s)}`, 'sch-label', 'start');
  } else {
    sch.text((dx0 + dx1) / 2, yb + 4, `W + 2s = ${fmt(s.w + 2 * s.s)} > g`, 'sch-label hl', 'middle');
  }
  const dKey: BgaState['solveFor'] = top ? 'dPad' : 'dVia';
  sch.text(dx0 + 4, cyD + 4, `${top ? 'D_land' : 'D_via'}`, `sch-label sch-halo ${tone(dKey)}`.trim(), 'start');
  sch.text(dx1 - 4, cyD + 4, failed && s.solveFor === dKey ? '—' : fmt(D), `sch-value sch-halo ${tone(dKey)}`.trim(), 'end');


  const names: Partial<Record<PcbMat, string>> = { maskCu: 'Copper under mask', cu: 'Copper', gold: 'Gold-plated land', silk: 'Silkscreen outline', cuHidden: top ? 'Via in pad, below' : 'Lands, outer layer' };
  const shown = ORDER.filter((m) => mats.has(m));
  // Three wide columns fit the longer names; a seventh entry needs the fourth column to stay on two rows.
  pcbLegend(sch, 16, 290, shown, shown.length > 6 ? { cols: 4, colW: 110, names } : { cols: 3, colW: 148, names });
  return sch.svg();
}
