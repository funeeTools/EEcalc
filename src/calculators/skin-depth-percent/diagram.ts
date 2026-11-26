/**
 * Skin depth percentage drawing.
 *
 *  - Top: the trace cross-section W × T on one scale (as trace-width-current), with its return plane(s) and
 *    the skin layer — a tinted band one δ deep under each face that carries the current (dashed edge).
 *  - Bottom right: a zoom on the conducting face, shaded by the exact one-dimensional current density
 *    |J(y)|, with δ and the depth x marked and the share p within x.
 *  - Bottom left: two bars, the share within x and the share of the copper that carries the current.
 *
 * Materials come from the shared PCB kit (core/schematic/pcb.ts); the current shading is a tint over the
 * copper (xs-hot), not a material.
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { type PcbMat, pcbLegend, pcbRect } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { SdpState } from './def';
import { profileExact } from './model';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function skinPctDiagram(s: SdpState, r: CalcReport): SVGSVGElement | null {
  if (!(s.w > 0) || !(s.t > 0)) return null;
  const sch = new Schematic(460, 332);
  const det = r.ok ? (r.details as { delta: number; share: number; ratio: number; used: number } | undefined) : undefined;
  const res = r.results.find((x) => x.key === s.solveFor && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === s.solveFor ? (failed ? 'hl' : 'solved') : '');
  const eq = (sym: string, k: string, txt: string) => {
    const v = k === s.solveFor && failed ? (res?.display ?? '—') : txt;
    return /^[<>]/.test(v) ? `${sym} ${v}` : `${sym} = ${v}`;
  };
  const delta = det?.delta;
  const xL = 20;
  const xR = 440;
  const micro = s.ret === 'micro';
  const strip = s.ret === 'strip';
  const outer = !strip; // micro and "no plane" are outer-layer traces under solder mask

  // ── header: frequency and skin depth
  sch.text(xL, 20, eq('f', 'f', si(s.f, 'Hz', 4)), `sch-caption ${tone('f')}`.trim(), 'start');
  sch.text(xL + 120, 20, delta ? `δ = ${si(delta, 'm', 3)}` : 'δ = —', 'sch-caption', 'start');
  sch.text(xR, 20, `${+(s.t / 34.79e-6).toFixed(2)} oz · ${s.tC} °C · ${{ micro: 'plane below', strip: 'planes both sides', iso: 'no nearby plane' }[s.ret]}`, 'sch-hint', 'end');

  // ── cross-section, W and T on one scale k (px per metre)
  const W_MAX = 300;
  const T_MAX = 40;
  const T_MIN = 5;
  let k = Math.min(T_MAX / s.t, W_MAX / s.w);
  if (k * s.t < T_MIN) k = T_MIN / s.t;
  const tPx = k * s.t;
  const cut = k * s.w > W_MAX + 0.5;
  const narrow = !cut && k * s.w < 3;
  const wPx = cut ? xR - xL : Math.max(k * s.w, 3);
  const cx = cut ? (xL + xR) / 2 : 210;
  const xl = cx - wPx / 2;
  const xr = cx + wPx / 2;
  const subBot = 172;
  const subTop = strip ? 58 : 122;
  const plane = 7;
  const yBot = strip ? (subTop + plane + subBot - plane) / 2 + tPx / 2 : subTop;
  const yTop = yBot - tPx;
  const m = 4; // solder mask, a legible minimum

  pcbRect(sch, 'fr4', xL, subTop, xR - xL, subBot - subTop, { layer: 'back' });
  if (micro || strip) pcbRect(sch, 'cu', xL, subBot - plane, xR - xL, plane, { layer: 'back' });
  if (strip) pcbRect(sch, 'cu', xL, subTop, xR - xL, plane, { layer: 'back' });
  if (outer) {
    if (!cut) {
      pcbRect(sch, 'mask', xL, subTop - m, xl - m - xL, m);
      pcbRect(sch, 'mask', xr + m, subTop - m, xR - xr - m, m);
    }
    pcbRect(sch, 'mask', cut ? xL : xl - m, yTop - m, cut ? xR - xL : wPx + 2 * m, tPx + m);
  }
  pcbRect(sch, 'cu', xl, yTop, wPx, tPx);

  // skin layer: one δ under each conducting face, on the same scale (at least 2 px)
  if (delta) {
    const lim = micro ? tPx : tPx / 2;
    const h = clamp(k * delta, 2, lim);
    const full = k * delta >= lim;
    const band = (y: number, hh: number) => sch.shape('rect', { x: xl, y, width: wPx, height: hh, class: 'xs-hot' });
    const line = (x1: number, y1: number, x2: number, y2: number) => sch.shape('line', { x1, y1, x2, y2, class: 'sch-arrow dashed' });
    if (full) band(yTop, tPx);
    else if (micro) {
      band(yBot - h, h);
      line(xl, yBot - h, xr, yBot - h);
    } else if (strip || cut) {
      band(yTop, h);
      band(yBot - h, h);
      line(xl, yTop + h, xr, yTop + h);
      line(xl, yBot - h, xr, yBot - h);
    } else {
      const hx = Math.min(h, wPx / 2);
      sch.shape('path', { d: `M ${xl} ${yTop} h ${wPx} v ${tPx} h ${-wPx} Z M ${xl + hx} ${yTop + h} v ${tPx - 2 * h} h ${wPx - 2 * hx} v ${-(tPx - 2 * h)} Z`, class: 'xs-hot', 'fill-rule': 'evenodd' });
      sch.shape('rect', { x: xl + hx, y: yTop + h, width: Math.max(wPx - 2 * hx, 0), height: Math.max(tPx - 2 * h, 0), class: 'sch-arrow dashed', fill: 'none' });
    }
    const dTxt = full ? (micro ? 'δ ≥ T: current fills the copper' : 'δ ≥ T/2: current fills the copper') : `δ = ${si(delta, 'm', 3)}${k * delta < 2 ? ' (drawn 2 px)' : ''}`;
    sch.text(Math.max(xl, xL) + 4, yBot + 15, dTxt, 'sch-value sch-halo', 'start');
  }

  // W above the trace, T beside it
  const yW = yTop - (outer ? m : 0) - (cut ? 20 : 12);
  const wLabel = `W = ${si(s.w, 'm', 4)}`;
  if (cut) {
    const half = wLabel.length * 3.4 + 8;
    sch.text(cx, yW + 4, wLabel, 'sch-label sch-halo', 'middle');
    sch.arrow([cx - half, yW], [xL, yW], { head: 6 });
    sch.arrow([cx + half, yW], [xR, yW], { head: 6 });
  } else if (outer) sch.dim([xl, yW], [xr, yW], wLabel);
  else {
    sch.dim([xl, yW], [xr, yW], '');
    sch.text(cx, yW - 10, wLabel, 'sch-label sch-halo', 'middle');
  }
  const xT = cut ? xR - 92 : xr + (outer ? m : 0) + 10;
  sch.dim([xT, yTop], [xT, yBot], '');
  if (outer && !cut) sch.text(xT + 8, Math.min(yTop + 6, subTop - m - 4), `T = ${si(s.t, 'm', 3)}`, 'sch-label', 'start');
  // thin drawn copper running off the edges: above it, clear of the skin line
  else if (outer && tPx < 14) sch.text(xT + 8, yTop - m - 5, `T = ${si(s.t, 'm', 3)}`, 'sch-label sch-halo', 'start');
  else sch.text(xT + 8, yBot - tPx / 2 + 4, `T = ${si(s.t, 'm', 3)}`, 'sch-label sch-halo', 'start');
  if (outer) sch.text(xL + 4, subTop - m - 8, 'air', 'sch-hint', 'start');
  const scale = cut ? 'to scale · runs past both edges' : narrow ? 'W widened to be visible' : 'W and T to scale';
  sch.text(xL, subBot + 14, scale, 'sch-hint', 'start'); // left: the zoom leader runs down on the right

  // ── zoom on the conducting (bottom) face
  const xZ0 = 262;
  const xZ1 = 340;
  const yZ0 = 206;
  const yF = 290; // the conducting face
  const yZ1 = 304;
  if (delta) {
    const xVal = s.solveFor === 'x' && failed ? NaN : s.x;
    const want = Math.max(4 * delta, Number.isFinite(xVal) && xVal <= s.t ? 1.25 * xVal : 0); // x deeper than T: show the skin and point x off the top
    const D = Math.min(s.t, want); // depth window shown
    const ends = D >= s.t; // the copper ends inside the window
    const hz = yF - yZ0 - (ends ? 12 : 0);
    const z = hz / D;
    const yC = yF - hz; // top of the copper in the zoom
    pcbRect(sch, 'fr4', xZ0, yF, xZ1 - xZ0, yZ1 - yF, { layer: 'back' });
    if (ends) pcbRect(sch, strip ? 'fr4' : 'mask', xZ0, yZ0, xZ1 - xZ0, yC - yZ0, { layer: 'back' });
    pcbRect(sch, 'cu', xZ0, yC, xZ1 - xZ0, hz);
    // current density, exact 1-D profile, as the opacity of thin slices
    const N = 36;
    for (let i = 0; i < N; i++) {
      const y0 = (D * i) / N;
      const j = profileExact(y0 + D / (2 * N), s.t, delta, s.ret);
      if (j < 0.02) continue;
      sch.shape('rect', { x: xZ0, y: yF - z * (y0 + D / N), width: xZ1 - xZ0, height: z * D / N + 0.4, class: 'xs-hot', style: `fill-opacity:${(0.6 * j).toFixed(3)}` });
    }
    if (delta < D) {
      const yd = yF - z * delta;
      sch.shape('line', { x1: xZ0, y1: yd, x2: xZ1, y2: yd, class: 'sch-arrow dashed' });
      // above its line, or below when the x line sits just above it
      const yxLine = Number.isFinite(xVal) ? yF - z * Math.min(xVal, D) : NaN;
      const below = yxLine < yd && yd - yxLine < 16 && yd + 14 < yF;
      sch.text(xZ0 + 4, below ? yd + 13 : yd - 4, 'δ', 'sch-label sch-halo', 'start');
    }
    // x on the right of the zoom, with the share
    const xd = xZ1 + 8;
    const xTop = Number.isFinite(xVal) ? yF - z * Math.min(xVal, D) : yF;
    if (Number.isFinite(xVal)) {
      sch.shape('line', { x1: xZ0, y1: xTop, x2: xZ1 + 2, y2: xTop, class: `sch-dim ${tone('x')}`.trim() });
      sch.dim([xd, yF], [xd, xTop], '', { tone: tone('x') });
    }
    const yx = clamp((yF + xTop) / 2 - 4, yZ0 + 10, yF - 20);
    sch.text(xd + 8, yx, eq('x', 'x', si(s.x, 'm', 3)) + (s.x > s.t ? ' > T' : ''), `sch-label ${tone('x')}`.trim(), 'start');
    sch.text(xd + 8, yx + 15, `${s.count === 'loss' ? 'loss' : 'current'} ${pctText(det!.share)}`, `sch-value ${tone('p')}`.trim(), 'start');
    sch.text(xd + 8, yZ1 - 2, 'tint ∝ |J|', 'sch-hint', 'start');
    sch.text(xZ0, yZ0 - 6, `conducting face, zoom ×${Math.round(z / k)}`, 'sch-hint', 'start');
    // where the zoom sits on the section
    const hm = clamp(k * D, 3, tPx);
    const xm = cut ? cx + 30 : clamp(cx + wPx * 0.3, xl + 2, xr - 14);
    sch.shape('rect', { x: xm, y: yBot - hm, width: 12, height: hm, class: 'xs-air' });
    sch.shape('line', { x1: xm + 6, y1: yBot, x2: (xZ0 + xZ1) / 2, y2: yZ0 - 16, class: 'sch-dim', 'stroke-dasharray': '3 3' });
  }

  // ── bars: share within x, copper used
  const bx = xL;
  const bw = 200;
  const bar = (y: number, label: string, v: number | null, cls: string, lt: string) => {
    sch.text(bx, y, label, `sch-value ${lt}`.trim(), 'start');
    sch.shape('rect', { x: bx, y: y + 6, width: bw, height: 11, class: 'xs-air' });
    if (v != null) sch.shape('rect', { x: bx, y: y + 6, width: Math.max(bw * clamp(v, 0, 1), 1), height: 11, class: cls });
  };
  // the share is calculated in analysis; otherwise it is the target, drawn even when no answer exists
  const isTarget = s.solveFor !== 'p';
  const pTxt = isTarget ? `${+s.p.toPrecision(4)} % (target)` : det ? pctText(det.share) : '—';
  bar(220, `${s.count === 'loss' ? 'Loss' : 'Current'} within x: ${pTxt}`, isTarget ? s.p / 100 : (det?.share ?? null), 'xs-hot', tone('p'));
  bar(256, `Copper carrying current: ${det ? pctText(det.used) : '—'}`, det?.used ?? null, 'xs-cu-soft', '');
  sch.text(bx, 298, det ? `R_ac/R_dc = ${det.ratio.toPrecision(3)} (${s.model === 'layer' ? 'uniform δ layer' : 'exact 1-D'})` : '', 'sch-hint', 'start');

  const mats: PcbMat[] = outer ? ['mask', 'cu', 'fr4'] : ['cu', 'fr4'];
  pcbLegend(sch, xL, 324, mats, { cols: 3, colW: 120 });
  return sch.svg();
}

function pctText(v: number): string {
  const p = v * 100;
  if (p >= 99.95) return v >= 1 ? '100 %' : '> 99.9 %';
  return `${p >= 10 ? p.toFixed(1) : p.toPrecision(2)} %`;
}
