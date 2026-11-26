/** Padstack & annular ring: top view of the land with the worst-case drill position, and a small cross-section. */

import type { CalcReport } from '@/core/calc/types';
import { pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { VIA_PX, clampPx, viaBarrel, viaCopper, viaFinish, viaLaminate, viaLegend, viaMask, type Span } from '@/calculators/via-calculator/viaKit';
import { type RingState, minPads, requirement } from './def';
import { breakout, worstRing } from './model';

const fLen = (m: number) => (m === 0 ? '0' : si(m, 'm', 3));

export function ringDiagram(s: RingState, r: CalcReport): SVGSVGElement | null {
  if (!(s.fhs > 0) || !(s.pad > 0) || !(s.h > 0) || !(s.c >= 0)) return null;
  const sch = new Schematic(460, 300);
  const failed = !r.ok;
  const res = (k: string) => (r.ok ? r.results.find((x) => x.key === k) : undefined);
  const tone = (k: string) => (s.solveFor === k ? (failed ? 'hl' : 'solved') : '');
  const rq = requirement(s);
  const mp = minPads(s.fhs, s.tol, s.allow, rq, s.c);
  const e = s.c / 2;
  const drill = s.fhs + s.allow;
  // the layer shown at its worst case: the one furthest below its minimum (ties: the narrower ring)
  const rE = s.pad / mp.ext;
  const rI = s.pad / mp.int;
  const extGov = Math.abs(rE - rI) > 1e-9 ? rE < rI : worstRing(s.pad, mp.aExt, e) <= worstRing(s.pad, mp.aInt, e);
  const aGov = extGov ? mp.aExt : mp.aInt;
  const wc0 = worstRing(s.pad, aGov, e);
  const wc = Math.abs(wc0) < 1e-12 ? 0 : wc0;
  const bo = breakout(s.pad, aGov, e);
  const bad = !!r.ok && r.status?.tone === 'fail';

  // ── top view: drawing on the left, its labels in a margin column on the right with leaders to what they name
  const cx = 98;
  const cy = 150;
  const ext = Math.max(s.pad / 2 + s.maskExp, e + Math.max(mp.aExt, mp.aInt) / 2, drill / 2);
  const k = 66 / ext;
  pcbRect(sch, 'mask', cx - 80, cy - 78, 160, 156, { layer: 'back' });
  pcbShape(sch, 'fr4Bare', 'circle', { cx, cy, r: (s.pad / 2 + s.maskExp) * k }, { layer: 'back' });
  pcbShape(sch, 'gold', 'circle', { cx, cy, r: (s.pad / 2) * k }, { tone: tone('pad') === 'solved' ? 'solved' : '' });
  const rDrill = Math.max((drill / 2) * k, 2);
  const rFin = Math.max((s.fhs / 2) * k, 1.2);
  pcbShape(sch, 'cu', 'circle', { cx, cy, r: rDrill });
  pcbShape(sch, 'hole', 'circle', { cx, cy, r: rFin });
  // worst-case position of the governing hole: c/2 off centre
  const hx = cx + e * k;
  const hr = (aGov / 2) * k;
  sch.shape('circle', { cx: hx, cy, r: hr, class: `sch-arrow dashed ${bad ? 'hl' : ''}`.trim(), fill: 'none' });
  if (e * k > 10) sch.arrow([cx, cy], [hx, cy], { head: 5, tone: bad ? 'hl' : '' });
  // the narrowest ring: at the pad edge the hole moved towards; two arrows point at it from either side
  const xPadR = cx + (s.pad / 2) * k;
  const xHoleR = hx + hr;
  const um = (x: number) => (Math.abs(x) < 1e-3 ? `${(x * 1e6).toFixed(Math.abs(x) < 10e-6 ? 1 : 0)} µm` : fLen(x));
  const yTick = cy - 26;
  if (wc > 0) {
    for (const x of [xHoleR, xPadR]) sch.shape('line', { x1: x, y1: cy - 4, x2: x, y2: yTick - 4, class: `sch-dim ${bad ? 'hl' : ''}`.trim() });
    sch.arrow([xHoleR - 13, yTick], [xHoleR, yTick], { head: 5, tone: bad ? 'hl' : '' });
    sch.arrow([xPadR + 13, yTick], [xPadR, yTick], { head: 5, tone: bad ? 'hl' : '' });
    sch.text(xPadR + 16, yTick + 4, `b_wc ${um(wc)}`, `sch-label sch-halo ${bad ? 'hl' : ''}`.trim(), 'start');
  }
  // margin labels with leaders
  const lx = cx + 92;
  const leader = (y: number, tx: number, ty: number) => sch.shape('polyline', { points: `${lx - 3},${y - 4} ${lx - 10},${y - 4} ${tx},${ty}`, class: 'sch-dim', fill: 'none' });
  const pAt = (r0: number, deg: number, x0 = cx): [number, number] => [x0 + r0 * Math.cos((deg * Math.PI) / 180), cy + r0 * Math.sin((deg * Math.PI) / 180)];
  const lab = (y: number, text: string, cls: string, target: [number, number]) => {
    leader(y, target[0], target[1]);
    sch.text(lx, y, text, cls, 'start');
  };
  lab(cy - 62, `drill ${fLen(drill)}`, 'sch-value', pAt(rDrill - 1, -125));
  lab(cy - 46, `d_fin ${failed && s.solveFor === 'fhs' ? '—' : fLen(s.fhs)}`, `sch-value ${tone('fhs')}`.trim(), pAt(Math.max(rFin - 2, 0), -145));
  if (wc < 0) lab(cy - 14, `breakout ${((bo * 180) / Math.PI).toFixed(0)}°`, `sch-label ${bad ? 'hl' : ''}`.trim(), [Math.min(xPadR, hx + hr), cy]);
  lab(cy + 44, `wander e = ${fLen(e)}`, 'sch-value', [cx + (e * k) / 2, cy]);
  lab(cy + 60, `${extGov ? 'external' : 'internal'} worst case`, `sch-hint ${bad ? 'hl' : ''}`.trim(), pAt(hr, 60, hx));
  // pad diameter below
  const yD = cy + 78 + 12;
  for (const x of [cx - (s.pad / 2) * k, cx + (s.pad / 2) * k]) sch.shape('line', { x1: x, y1: cy, x2: x, y2: yD + 3, class: 'sch-dim' });
  sch.dim([cx - (s.pad / 2) * k, yD], [cx + (s.pad / 2) * k, yD], `D = ${failed && s.solveFor === 'pad' ? '—' : fLen(s.pad)}`, { tone: tone('pad'), off: -8 });
  sch.text(cx - 80, 54, 'Top view', 'sch-caption', 'start');

  // ── cross-section (same horizontal scale where it fits); rings drawn and labelled at their nominal value
  const sx0 = 300;
  const sx1 = 448;
  const scx = (sx0 + sx1) / 2;
  const yTop = 96;
  const hPx = 114;
  const yBot = yTop + hPx;
  const ks = Math.min(k, 100 / Math.max(s.pad + 2 * s.maskExp, drill));
  const padPx = clampPx(s.pad * ks, 14, 120);
  const dPx = clampPx(drill * ks, 8, padPx - 4);
  const finPx = clampPx(s.fhs * ks, 3, dPx - 2 * VIA_PX.wallMin);
  const w = (dPx - finPx) / 2;
  const half = (p: number): Span => [scx - p / 2, scx + p / 2];
  const pad = half(padPx);
  const hole = half(dPx);
  const open = half(padPx + 2 * Math.max(s.maskExp * ks, 2));
  viaLaminate(sch, sx0, yTop, sx1, yBot);
  viaCopper(sch, pad[0], pad[1], yTop - VIA_PX.cu, [hole]);
  for (const f of [1 / 3, 2 / 3]) viaCopper(sch, pad[0], pad[1], yTop + hPx * f - VIA_PX.cu / 2, [hole]);
  viaCopper(sch, pad[0], pad[1], yBot, [hole]);
  viaBarrel(sch, scx, yTop - VIA_PX.cu, yBot + VIA_PX.cu, dPx, w);
  viaFinish(sch, [[pad[0], hole[0]], [hole[1], pad[1]]], yTop - VIA_PX.cu, 'top');
  viaFinish(sch, [[pad[0], hole[0]], [hole[1], pad[1]]], yBot + VIA_PX.cu, 'bottom');
  viaMask(sch, sx0, sx1, yTop, 'top', [], [open]);
  viaMask(sch, sx0, sx1, yBot, 'bottom', [], [open]);
  // ring on the top pad (from the finished hole) and on an inner pad (from the drill)
  const yR = yTop - VIA_PX.cu - VIA_PX.mask - 9;
  sch.dim([scx + finPx / 2, yR], [pad[1], yR], '', {});
  sch.text(Math.min((scx + finPx / 2 + pad[1]) / 2, sx1 - 34), yR - 7, `b_ext ${um((s.pad - s.fhs) / 2)}`, 'sch-label', 'middle');
  const yI = yTop + hPx / 3 + 11;
  sch.dim([hole[1], yI], [pad[1], yI], '', {});
  sch.text(Math.min((hole[1] + pad[1]) / 2, sx1 - 34), yI + 16, `b_int ${um((s.pad - drill) / 2)}`, 'sch-label sch-halo', 'middle');
  sch.text(sx0, yBot + 26, `H ${fLen(s.h)} · rings at nominal`, 'sch-hint', 'start');
  sch.text(sx0, 54, 'Cross-section', 'sch-caption', 'start');

  // headline
  const ratio = res('ratio');
  const minG = Math.max(mp.ext, mp.int);
  sch.text(16, 18, `D_min = ${r.ok ? fLen(minG) : '—'}`, 'sch-label', 'start');
  const dTxt = `D_min = ${r.ok ? fLen(minG) : '—'}`;
  sch.text(16 + dTxt.replace('_', '').length * 6.6 + 12, 18, `pad ${ratio ? ratio.display : '—'} of minimum`, `sch-label ${bad ? 'hl' : s.solveFor === 'ratio' && r.ok ? 'solved' : ''}`.trim(), 'start');
  sch.text(16, 32, `${{ c3: 'IPC-2221 / Class 3 ring', c2t: 'Class 2, tangency', c2: 'Class 2, ≤ 90° breakout', c1: 'Class 1, ≤ 180° breakout', custom: 'custom ring' }[s.req]} · c = ${fLen(s.c)}`, 'sch-hint', 'start');

  viaLegend(sch, 16, 280, ['mask', 'cu', 'gold', 'fr4', 'fr4Bare', 'hole', 'air'], { cols: 4, colW: 110, names: { fr4Bare: 'Bare laminate', gold: 'ENIG pad' } });
  return sch.svg();
}
