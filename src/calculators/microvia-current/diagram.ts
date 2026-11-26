/**
 * Microvia current capacity: cross-section of one laser microvia (feeding trace and capture pad on top, the dielectric
 * it spans, the target pad below, conformal plating or a copper plug) beside a top view of the trace and the N vias.
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { VIA_PX, clampPx, viaBarrel, viaCopper, viaLaminate, viaLegend } from '@/calculators/via-calculator/viaKit';
import type { MvSolve, MvState } from './def';

/** A length in the unit its input row shows. */
const fU = (m: number, unit: string) => (unit === 'mil' ? `${+(m / 25.4e-6).toPrecision(3)} mil` : unit === 'in' ? `${+(m / 0.0254).toPrecision(3)} in` : si(m, 'm', 3));

export function microviaDiagram(s: MvState, r: CalcReport): SVGSVGElement | null {
  if (!(s.d > 0) || !(s.h > 0) || !(s.padCap > 0) || !(s.padTgt > 0) || !(s.w > 0) || !(s.n >= 1)) return null;
  const sch = new Schematic(460, 328);
  const failed = !r.ok;
  const k = s.solveFor;
  const res = (key: string) => (r.ok ? r.results.find((x) => x.key === key) : undefined);
  // the solved value is green, or red when it is only the closest the range allows
  const tone = (q: MvSolve) => (k === q ? (failed || res(q)?.tone === 'fail' ? 'hl' : 'solved') : '');
  const filled = s.fill === 'cu';

  // ── cross-section: one scale k for depth, diameter, pads, plating and copper (the real proportions of an HDI layer)
  const x0 = 12;
  const x1 = 262;
  const cx = 122;
  const kx = Math.min(100 / s.h, 150 / Math.max(s.padCap, s.padTgt));
  const hTrue = s.h * kx;
  const hPx = clampPx(hTrue, 30, 100);
  const cuTrue = s.tCu * kx;
  const cuPx = clampPx(cuTrue, VIA_PX.cu, 20);
  const yTop = 120;
  const yBot = yTop + hPx;
  const dTrue = s.d * kx;
  const dPx = clampPx(dTrue, 12, 120);
  const capPx = clampPx(s.padCap * kx, dPx + 6, 200);
  const tgtPx = clampPx(s.padTgt * kx, dPx + 6, 200);
  const tTrue = s.t * kx;
  const w = filled ? dPx / 2 : clampPx(tTrue, 2.6, dPx / 3);
  const coreBot = yBot + cuPx + 46;

  viaLaminate(sch, x0, yTop, x1, coreBot);
  // capture pad + feeding trace on top (from the left); target pad + its plane/trace below (to the right)
  const cap: [number, number] = [cx - capPx / 2, cx + capPx / 2];
  const tgt: [number, number] = [cx - tgtPx / 2, cx + tgtPx / 2];
  const hole: [number, number] = [cx - dPx / 2 + w, cx + dPx / 2 - w];
  viaCopper(sch, x0, cap[1], yTop - cuPx, filled ? [] : [hole], { th: cuPx });
  // the target land on the next layer (it joins that layer’s trace or plane outside the section)
  viaCopper(sch, tgt[0], tgt[1], yBot, [], { th: cuPx });
  // the barrel through the capture copper and the dielectric down to the target pad; conformal plating also lines
  // the bottom of the hole (the target pad face)
  viaBarrel(sch, cx, yTop - cuPx, yBot, dPx, w, { fill: filled ? 'cu' : 'none', tone: tone('d') as '' | 'solved' | 'hl' });
  if (!filled) pcbRect(sch, 'cu', hole[0], yBot - w, hole[1] - hole[0], w);
  // solder mask over the outer layer: on the trace and capture pad (open over a conformal via's dimple), then on the
  // bare dielectric beyond the pad
  const m = VIA_PX.mask;
  // a filled via-in-pad is a mask-open land: mask on the trace up to a small clearance, then on the bare dielectric
  if (filled) {
    pcbRect(sch, 'mask', x0, yTop - cuPx - m, Math.max(cap[0] - 4 - x0, 0), m);
    pcbRect(sch, 'mask', cap[1] + 4, yTop - m, x1 - cap[1] - 4, m);
  } else {
    for (const [a, b] of [[x0, hole[0] - w], [hole[1] + w, cap[1]]]) pcbRect(sch, 'mask', a, yTop - cuPx - m, b - a, m);
    pcbRect(sch, 'mask', cap[1], yTop - m, x1 - cap[1], m);
  }

  // current path: along the trace, down the barrel, out along the target layer
  const yIn = yTop - cuPx - VIA_PX.mask - 12;
  if (cap[0] - 6 - (x0 + 14) > 12) sch.arrow([x0 + 14, yIn], [cap[0] - 6, yIn]);
  sch.text(x0 + 2, yIn + 4, 'I', 'sch-label', 'start');
  // in a wide open hole the t label sits inside it on the left, so the current arrow moves right
  const ax = !filled && dPx > 80 ? cx + dPx / 4 : cx;
  sch.arrow([ax, yTop - cuPx + 4], [ax, yBot - w - 3], { head: 6 });

  // dimensions: D across the hole bottom (green when solved), D_cap above, D_tgt below, h at the right, t on the wall
  const yCapDim = yIn - 14;
  sch.shape('line', { x1: cap[0], y1: yTop - cuPx - 1, x2: cap[0], y2: yCapDim - 2, class: 'sch-dim' });
  sch.shape('line', { x1: cap[1], y1: yTop - cuPx - 1, x2: cap[1], y2: yCapDim - 2, class: 'sch-dim' });
  sch.dim([cap[0], yCapDim], [cap[1], yCapDim], `D_cap = ${fU(s.padCap, s.padCapUnit)}`, { off: 9 });
  // D and D_tgt are dimensioned under the target land, extension lines down from the hole walls and the land edges
  const yD = yBot + cuPx + 14;
  const yTg = yBot + cuPx + 34;
  for (const x of [cx - dPx / 2, cx + dPx / 2]) sch.shape('line', { x1: x, y1: yBot - 1, x2: x, y2: yD + 3, class: `sch-dim ${tone('d')}`.trim() });
  for (const x of tgt) sch.shape('line', { x1: x, y1: yBot + cuPx + 1, x2: x, y2: yTg + 3, class: 'sch-dim' });
  sch.dim([cx - dPx / 2, yD], [cx + dPx / 2, yD], '', { tone: tone('d') });
  sch.text(cx + dPx / 2 + 6, yD + 4, `D = ${failed && k === 'd' ? '—' : fU(s.d, s.dUnit)}`, `sch-label sch-halo ${tone('d')}`.trim(), 'start');
  sch.dim([tgt[0], yTg], [tgt[1], yTg], '');
  sch.text(tgt[1] + 6, yTg + 4, `D_tgt = ${fU(s.padTgt, s.padTgtUnit)}`, 'sch-label sch-halo', 'start');
  if (!filled) {
    const yt = yTop + hPx * 0.3;
    // label in the dielectric left of the hole, with a leader to the wall
    const tt = `t = ${fU(s.t, s.tUnit)}`;
    const tw = tt.length * 6.4;
    const wallX = cx - dPx / 2 + w / 2;
    if (wallX - (x0 + 4 + tw + 4) > 6) {
      sch.arrow([x0 + 4 + tw + 4, yt], [wallX, yt], { head: 5 });
      sch.text(x0 + 4, yt + 4, tt, 'sch-label sch-halo', 'start');
    } else {
      // no room in the dielectric: label inside the open hole, leader to the wall
      sch.arrow([hole[0] + 14, yt], [wallX, yt], { head: 5 });
      sch.text(hole[0] + 16, yt + 4, tt, 'sch-label sch-halo', 'start');
    }
  }
  const xh = x1 + 12;
  sch.dim([xh, yTop], [xh, yBot], '');
  sch.text(xh + 6, (yTop + yBot) / 2 + 4, `h = ${fU(s.h, s.hUnit)}`, 'sch-value', 'start');
  const ar = res('ar');
  if (ar) sch.text(xh + 6, (yTop + yBot) / 2 + 19, `AR ${ar.display}`, `sch-value ${ar.tone === 'fail' ? 'hl' : ''}`.trim(), 'start');

  // ── top view: the feeding trace (W) into a pour holding the N capture pads, its own scale
  const tvx = 410;
  const tvy = 214;
  const shown = Math.min(s.n, 9);
  const cols = Math.ceil(Math.sqrt(shown));
  const rows = Math.ceil(shown / cols);
  const pitch = s.padCap * 1.25;
  const ext = Math.max(cols, rows) * pitch;
  const kt = Math.min(60 / ext, 60 / Math.max(s.w, s.padCap));
  const pp = s.padCap * kt;
  const pourW = cols * pitch * kt;
  const pourH = rows * pitch * kt;
  const wTrue = s.w * kt;
  const wPx = clampPx(wTrue, 3, 60);
  pcbRect(sch, 'mask', tvx - 56, tvy - 46, 102, 92, { layer: 'back' });
  pcbRect(sch, 'maskCu', tvx - 56, tvy - wPx / 2, 56 - pourW / 2 + 2, wPx);
  if (s.n > 1) pcbRect(sch, 'maskCu', tvx - pourW / 2, tvy - pourH / 2, pourW, pourH, { rx: 2 });
  for (let i = 0; i < shown; i++) {
    const c = i % cols;
    const rw = Math.floor(i / cols);
    const x = tvx + (c - (cols - 1) / 2) * pitch * kt;
    const y = tvy + (rw - (rows - 1) / 2) * pitch * kt;
    // a filled via-in-pad is a mask-open land, as in the section
    pcbShape(sch, filled ? 'cu' : 'maskCu', 'circle', { cx: x, cy: y, r: pp / 2 });
    pcbShape(sch, filled ? 'cu' : 'hole', 'circle', { cx: x, cy: y, r: Math.max(Math.min(s.d * kt, pp - 2) / 2, 1) });
  }
  sch.dim([tvx - 50, tvy - wPx / 2], [tvx - 50, tvy + wPx / 2], '');
  sch.text(tvx - 46, tvy + 4, 'W', 'sch-label sch-halo', 'start');
  sch.text(tvx - 56, tvy - 54, `W = ${fU(s.w, s.wUnit)}`, 'sch-value', 'start');
  sch.text(tvx - 4, tvy + 62, `N = ${failed && k === 'n' ? '—' : s.n}${shown < s.n ? ` (${shown} drawn)` : ''}`, `sch-label ${tone('n')}`.trim());
  sch.text(tvx - 56, tvy - 70, 'Top view', 'sch-caption', 'start');

  // headline: capacity (green: always computed), the design current, which limits first
  const im = res('iMax');
  const tr = res('iTrace');
  const lim = res('limit');
  sch.text(16, 18, `I_max = ${im ? im.display : '—'}`, `sch-label ${failed ? '' : 'solved'}`.trim(), 'start');
  sch.text(170, 18, `trace ${tr ? tr.display : '—'}`, `sch-label ${tr?.tone === 'fail' ? 'hl' : ''}`.trim(), 'start');
  const dT = res('dTvia');
  sch.text(16, 34, `I = ${si(s.i, 'A', 3)} · ΔT ${k === 'dT' ? (failed ? '—' : `${s.dT.toPrecision(3)} °C`) : `${+s.dT.toPrecision(4)} °C`}${lim ? ` · ${lim.display} limits first` : ''}`, `sch-hint ${tone('dT')}`.trim(), 'start');
  if (dT && k !== 'dT') sch.text(16, 50, `guardrail rise at I: ${dT.display}`, 'sch-hint', 'start');

  // scale note and legend
  const pairs: [string, number, number][] = [['h', hPx, hTrue], ['D', dPx, dTrue], ['copper', cuPx, cuTrue], ['pads', Math.min(capPx, tgtPx), Math.min(s.padCap, s.padTgt) * kx], ...(filled ? [] : [['t', w, tTrue] as [string, number, number]])];
  const up = pairs.filter(([, px, tr0]) => px > tr0 + 0.5).map(([nm]) => nm);
  const down = pairs.filter(([, px, tr0]) => px < tr0 - 0.5).map(([nm]) => nm);
  const note = [up.length ? `${up.join(', ')} enlarged` : '', down.length ? `${down.join(', ')} reduced` : ''].filter(Boolean).join(' · ');
  sch.text(16, 286, `section: ${note || 'to scale'} · top view: own scale${wPx > wTrue + 0.5 ? ', W widened' : ''}`, 'sch-hint', 'start');
  const mats: PcbMat[] = ['mask', 'maskCu', 'cu', 'fr4', filled ? 'cu' : 'air', ...(filled ? [] : ['hole' as PcbMat])];
  viaLegend(sch, 16, 306, mats, { cols: 4, colW: 110, names: { fr4: 'Dielectric', hole: 'Laser hole' } });
  return sch.svg();
}
