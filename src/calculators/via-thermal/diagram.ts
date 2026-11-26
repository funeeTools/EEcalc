/** Thermal vias: cross-section under an exposed-pad package (heat paths) and a top view of the via array. */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { VIA_PX, clampPx, viaBarrel, viaCopper, viaLaminate, viaLegend, viaMask, wallPx, type Span } from '@/calculators/via-calculator/viaKit';
import type { ThermalViaState } from './def';
import { arrayShape } from './model';

const fLen = (m: number) => si(m, 'm', 3);
const MAX_COLS = 9;

export function thermalDiagram(s: ThermalViaState, r: CalcReport): SVGSVGElement | null {
  if (!(s.d > 0) || !(s.padW > 0) || !(s.padL > 0) || !(s.h > 0) || !(s.n >= 1) || !(s.pitch > 0)) return null;
  const sch = new Schematic(460, 312);
  const failed = !r.ok;
  const tone = (k: string) => (s.solveFor === k ? (failed ? 'hl' : 'solved') : '');
  const res = (k: string) => (r.ok ? r.results.find((x) => x.key === k) : undefined);
  const cu = VIA_PX.cu;
  const fill = s.fill === 'cu' ? 'cu' : s.fill === 'none' ? 'none' : s.fill === 'solder' ? 'solder' : 'epoxy';
  const { cols, rows } = arrayShape(Math.round(s.n), s.padW, s.padL);

  // ── cross-section through one row of the array: the same horizontal scale as the pad (pitch and drill true to
  // the pad width), and the same scale vertically where the board thickness fits; thin layers drawn legibly.
  const x0 = 72;
  const x1 = 296;
  const cx = 182;
  const yTop = 118;
  const wPx = 130;
  const kx = wPx / s.padW;
  const hTrue = s.h * kx;
  const hPx = clampPx(hTrue, 56, 96);
  const yBot = yTop + hPx;
  const dTrue = s.d * kx;
  const dPx = clampPx(dTrue, 8, 36);
  const w = wallPx(s.t, kx, dPx);
  const pad: Span = [cx - wPx / 2, cx + wPx / 2];
  const nDraw = Math.min(cols, MAX_COLS);
  // pitch to scale, but never closer than a hole and a gap (dense arrays are drawn spread out)
  const sp = nDraw > 1 ? Math.min(Math.max(s.pitch * kx, dPx + 4), (wPx - dPx - 4) / (nDraw - 1)) : 0;
  const xs = Array.from({ length: nDraw }, (_, i) => cx + (i - (nDraw - 1) / 2) * sp);
  const holes: Span[] = xs.map((x) => [x - dPx / 2 + (fill === 'cu' ? dPx / 2 : w), x + dPx / 2 - (fill === 'cu' ? dPx / 2 : w)]);
  const lead: Span[] = [[pad[0] - 34, pad[0] - 14], [pad[1] + 14, pad[1] + 34]];

  viaLaminate(sch, x0, yTop, x1, yBot);
  // top: thermal pad and perimeter lead pads; inner planes and the bottom plane tie into every barrel
  viaCopper(sch, pad[0], pad[1], yTop - cu, holes);
  for (const l of lead) viaCopper(sch, l[0], l[1], yTop - cu);
  const inner = Math.max(0, Math.min(Math.round(s.nCu) - 2, 4));
  for (let i = 1; i <= inner; i++) viaCopper(sch, x0, x1, yTop + (hPx * i) / (inner + 1) - cu / 2, holes);
  if (s.nCu >= 2) viaCopper(sch, x0, x1, yBot, holes);
  for (const x of xs) viaBarrel(sch, x, yTop - cu, yBot + (s.nCu >= 2 ? cu : 0), dPx, w, { fill });
  viaMask(sch, x0, x1, yTop, 'top', [pad, ...lead], [[pad[0] - 4, pad[1] + 4], [lead[0][0] - 4, lead[0][1] + 4], [lead[1][0] - 4, lead[1][1] + 4]]);
  viaMask(sch, x0, x1, yBot, 'bottom', s.nCu >= 2 ? [[x0, x1]] : []);

  // solder joints and the package (exposed die paddle over the thermal pad)
  const ySol = yTop - cu - 4;
  const solderSpans: Span[] = fill === 'none' ? [[pad[0], holes[0][0]], ...holes.slice(0, -1).map((h, i) => [h[1], holes[i + 1][0]] as Span), [holes[holes.length - 1][1], pad[1]]] : [pad];
  for (const [a, b] of solderSpans) if (b - a > 0.5) pcbRect(sch, 'solder', a, ySol, b - a, 4);
  for (const l of lead) pcbRect(sch, 'solder', l[0], ySol, l[1] - l[0], 4);
  const yPkg = ySol - cu;
  pcbRect(sch, 'cu', pad[0], yPkg, wPx, cu);
  for (const l of lead) pcbRect(sch, 'cu', l[0], yPkg, l[1] - l[0], cu);
  pcbRect(sch, 'part', lead[0][0] - 4, yPkg - 26, lead[1][1] - lead[0][0] + 8, 26, { rx: 2 });
  sch.text(cx, yPkg - 9, 'exposed-pad package', 'sch-hint sch-halo');

  // heat paths: solid down the copper (the plating wall of an unfilled or resin-filled via, the core of a solid fill),
  // dashed through the laminate between the vias
  const arrowsAt = nDraw <= 5 ? xs : xs.filter((_, i) => i % 2 === 0);
  const wallPath = fill === 'none' || fill === 'epoxy';
  for (const x of arrowsAt) {
    const ax = wallPath ? x - dPx / 2 + w / 2 : x;
    sch.arrow([ax, yTop + 2], [ax, yBot - 2], { head: 6 });
  }
  const gaps = xs.slice(0, -1).map((x, i) => (x + xs[i + 1]) / 2).filter((_, i, a) => a.length <= 4 || i % 2 === 0);
  const lamX = gaps.length ? gaps : [pad[0] + 10, pad[1] - 10];
  for (const x of lamX) sch.arrow([x, yTop + 8], [x, yBot - 6], { head: 5, dashed: true });

  // thickness on the left; path values under the board
  sch.dim([x0 - 10, yTop - cu], [x0 - 10, yBot + cu], '', {});
  sch.text(x0 - 16, (yTop + yBot) / 2 - 3, 'h', 'sch-label', 'end');
  sch.text(x0 - 16, (yTop + yBot) / 2 + 12, fLen(s.h), 'sch-value', 'end');
  if (nDraw > 1) {
    const yp = yBot + cu + VIA_PX.mask + 9;
    sch.dim([xs[0], yp], [xs[1], yp], '', {});
    sch.text(xs[1] + 6, yp + 4, 'p', 'sch-label', 'start');
  }
  const tv = res('thetaVias');
  const tl = res('thetaLam');
  const notScale = [Math.abs(hPx - hTrue) > 1 ? 'h' : '', Math.abs(dPx - dTrue) > 0.5 ? 'holes' : ''].filter(Boolean).join(', ');
  const scaleNote = [nDraw < cols ? `${nDraw} of ${cols} columns` : '', notScale ? `${notScale} not to scale` : 'to scale across'].filter(Boolean).join(' · ');
  const yT = Math.max(yBot + 30, 236);
  sch.text(16, yT, `vias ↓ θ = ${tv ? tv.display : '—'}`, 'sch-value', 'start');
  sch.text(16, yT + 14, `laminate ⇣ θ = ${tl ? tl.display : '—'}`, 'sch-value', 'start');
  sch.text(16, yT + 28, `${Math.round(s.nCu)} Cu layers · ${scaleNote}`, 'sch-hint', 'start');
  sch.text(16, 56, 'Cross-section', 'sch-caption', 'start');

  // ── top view of the array
  const tvx = 378;
  const tvy = 150;
  const kt = 96 / Math.max(s.padW, s.padL);
  const pw = s.padW * kt;
  const pl = s.padL * kt;
  pcbRect(sch, 'mask', tvx - 60, tvy - 60, 120, 120, { layer: 'back' });
  pcbRect(sch, 'gold', tvx - pw / 2, tvy - pl / 2, pw, pl, { rx: 1.5 });
  const tdPx = clampPx(s.d * kt, 3, 30);
  const tsp = (n: number, len: number) => (n > 1 ? Math.min(s.pitch * kt, (len - tdPx - 2) / (n - 1)) : 0);
  const spx = tsp(cols, pw);
  const spy = tsp(rows, pl);
  const holeMat: PcbMat = s.fill === 'none' ? 'hole' : s.fill === 'cu' ? 'cu' : s.fill === 'solder' ? 'solder' : 'resin';
  const centres: [number, number][] = [];
  for (let i = 0; i < Math.round(s.n) && i < cols * rows; i++) {
    const c = i % cols;
    const rw = Math.floor(i / cols);
    centres.push([tvx + (c - (cols - 1) / 2) * spx, tvy + (rw - (rows - 1) / 2) * spy]);
  }
  const big = centres.length <= 400;
  for (const [x, y] of big ? centres : centres.slice(0, 400)) {
    pcbShape(sch, 'cu', 'circle', { cx: x, cy: y, r: tdPx / 2 });
    pcbShape(sch, holeMat, 'circle', { cx: x, cy: y, r: Math.max(tdPx / 2 - Math.max(s.t * kt, 0.8), 0.6) });
  }
  // W above the pad, pitch under it
  sch.dim([tvx - pw / 2, tvy - 68], [tvx + pw / 2, tvy - 68], `W = ${fLen(s.padW)}`, { off: 6 });
  if (cols > 1 && centres.length > 1) {
    sch.dim([centres[0][0], tvy + 68], [centres[1][0], tvy + 68], '', {});
    sch.text(centres[1][0] + 6, tvy + 72, 'p', 'sch-label', 'start');
  }
  // L along the right edge of the pad
  sch.dim([tvx + 66, tvy - pl / 2], [tvx + 66, tvy + pl / 2], '', {});
  sch.text(tvx + 70, tvy + 4, 'L', 'sch-label', 'start');
  sch.text(tvx, tvy + 84, `L = ${fLen(s.padL)}${cols > 1 ? ` · p = ${fLen(s.pitch)}` : ''}`, 'sch-value');
  sch.text(tvx, tvy + 98, `d = ${failed && s.solveFor === 'd' ? '—' : fLen(s.d)}`, `sch-value ${tone('d')}`.trim());
  sch.text(tvx, tvy + 112, `N = ${failed && s.solveFor === 'n' ? '—' : Math.round(s.n)} (${cols} × ${rows})`, `sch-value ${tone('n')}`.trim());
  sch.text(tvx - 60, 56, 'Top view', 'sch-caption', 'start');

  // headline
  const th = res(s.solveFor === 'theta' ? 'theta' : 'thetaAch');
  const dT = res('dT');
  sch.text(16, 18, `θ = ${th ? th.display : '—'}`, `sch-label ${s.solveFor === 'theta' ? tone('theta') : ''}`.trim(), 'start');
  if (s.solveFor !== 'theta') sch.text(150, 18, `target ${s.theta.toPrecision(4)} K/W`, 'sch-hint', 'start');
  sch.text(16, 34, `ΔT = ${dT ? dT.display : '—'} at ${si(s.p, 'W', 3)}`, 'sch-hint', 'start');

  const mats: PcbMat[] = ['mask', 'cu', 'gold', 'solder', 'fr4', 'part'];
  if (fill === 'none') mats.push('air', 'hole');
  if (fill === 'epoxy') mats.push('resin');
  viaLegend(sch, 16, 288, mats, { cols: 4, colW: 110, names: { part: 'Package', solder: 'Solder' } });
  return sch.svg();
}
