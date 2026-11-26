/**
 * Decoupling drawing: one mounted capacitor in cross-section — body, solder joints, pads, the pad-to-via
 * traces under mask, the two vias down to the power/ground plane pair — with the current loop that sets
 * the mounting inductance shaded. Materials come from the shared PCB kit (core/schematic/pcb.ts).
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import { type DecapState, PKG } from './def';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function decapDiagram(s: DecapState, r?: CalcReport): SVGSVGElement {
  const k = Math.min(Math.max(Math.round(Number(s.solveGroup) || 0), 0), s.groups.length - 1);
  const g = s.groups[k];
  const failed = !!r && (!r.ok || r.results.some((x) => x.solved && x.value == null));
  const get = (key: string) => r?.results.find((x) => x.key === key);
  const xL = 20;
  const xR = 440;

  // ── scale: px per metre, so the via pair and the part both fit
  const body = PKG[g.pkg]?.body ?? 1.0e-3;
  const kx = Math.min(130e3, 330 / (s.s + s.dv), 200 / body);
  const cx = 214;
  const bPx = clamp(body * kx, 40, 200);
  const sPx = clamp(s.s * kx, 30, 360);
  const vb = clamp(s.dv * kx, 6, 16);
  const padW = clamp(bPx * 0.42, 14, 60);
  const padOut = bPx / 2 + padW * 0.25; // pad reaches a little past the body end
  const padIn = padOut - padW;
  // vias outside the pads, or (side vias / via in pad) at the pad centres
  const viaOut = sPx / 2 > padOut + vb / 2 + 4;
  const xv = viaOut ? sPx / 2 : (padIn + padOut) / 2;
  const xv1 = cx - xv;
  const xv2 = cx + xv;

  const yS = 104;
  const tc = 5;
  const hPx = clamp(40 + 30 * Math.log10(s.h / 0.2e-3), 22, 80);
  const yG = yS + hPx;
  const tp = 6;
  const yP = yG + tp + 22;
  const yBot = yP + tp + 14;
  const xPl = 392;
  const yLeg = yBot + 52;
  const sch = new Schematic(460, yLeg + 22);

  // ── header: the answer
  const zMax = get('zMax');
  const lm = get('lMount');
  if (s.solveFor === 'n') sch.text(xL, 20, failed ? `N ${(get(`groups.${k}.n`)?.display ?? '= —').replace(/^(?![<>=])/, '= ')}` : `N = ${g.n} × ${si(g.c, 'F', 3)}`, `sch-caption ${failed ? 'hl' : 'solved'}`, 'start');
  else if (s.solveFor === 'dI') sch.text(xL, 20, `ΔI = ${failed ? '—' : si(s.dI, 'A', 4)}`, `sch-caption ${failed ? 'hl' : 'solved'}`, 'start');
  else if (zMax) sch.text(xL, 20, `|Z|max = ${zMax.display} ${zMax.tone === 'fail' ? '>' : '≤'} Z_t = ${si(s.zt, 'Ω', 3)}`, `sch-caption ${zMax.tone === 'fail' ? 'hl' : ''}`.trim(), 'start');
  sch.text(xR, 20, `group ${k + 1}: ${g.n} × ${si(g.c, 'F', 3)} ${g.pkg !== 'Custom' ? g.pkg : ''}`.trim(), 'sch-hint', 'end');
  sch.text(xR, 36, `per part: ESL ${si(g.esl, 'H', 3)} + L_mnt ${lm ? lm.display : '—'}`, 'sch-hint', 'end');


  // laminate, then the planes with clearances for the via they do not connect to
  pcbRect(sch, 'fr4', xL, yS, xPl - xL, yBot - yS, { layer: 'back' });
  pcbRect(sch, 'cu', xL, yG, xPl - xL, tp);
  pcbRect(sch, 'cu', xL, yP, xPl - xL, tp);
  pcbRect(sch, 'air', xv1 - vb / 2 - 5, yG, vb + 10, tp); // power via passes the ground plane
  pcbRect(sch, 'air', xv2 - vb / 2 - 5, yP, vb + 10, tp); // ground via passes the power plane
  // vias: copper barrels with an air core, top layer to the bottom of the section
  for (const x of [xv1, xv2]) {
    pcbRect(sch, 'cu', x - vb / 2, yS - tc, vb, yBot - yS + tc);
    pcbRect(sch, 'air', x - vb / 2 + 2, yS - tc, vb - 4, yBot - yS + tc);
  }
  // top copper: pads, and traces from the pads out to the vias
  for (const sgn of [-1, 1]) {
    const a = cx + sgn * padIn;
    const b = cx + sgn * padOut;
    pcbRect(sch, 'cu', Math.min(a, b), yS - tc, padW, tc);
    if (viaOut) {
      const t0 = cx + sgn * padOut;
      const t1 = cx + sgn * (xv + vb / 2 + 3);
      pcbRect(sch, 'cu', Math.min(t0, t1), yS - tc, Math.abs(t1 - t0), tc);
    } else pcbRect(sch, 'cu', cx + sgn * xv - vb / 2 - 3, yS - tc, vb + 6, tc);
  }
  // solder mask over the laminate and the traces, open over the pads
  const m = 3;
  const xm1 = cx - padOut - 2;
  const xm2 = cx + padOut + 2;
  pcbRect(sch, 'mask', xL, yS - tc - m, xm1 - xL, m + tc);
  pcbRect(sch, 'mask', xm2, yS - tc - m, xPl - xm2, m + tc);
  // the part: body on solder joints at each end
  const yBody = yS - tc - 3 - 22;
  for (const sgn of [-1, 1]) {
    const xe = cx + sgn * (bPx / 2);
    const xo = cx + sgn * padOut;
    pcbShape(sch, 'solder', 'polygon', { points: `${xe - sgn * 6},${yS - tc} ${xo},${yS - tc} ${xe},${yBody + 4} ${xe - sgn * 6},${yBody + 4}` });
  }
  pcbRect(sch, 'part', cx - bPx / 2, yBody, bPx, 22, { rx: 2 });

  // ── current loop: up the power via, through the part, down the ground via, back through the plane pair
  const yTop = yBody + 11;
  const loop: [number, number][] = [
    [xv1, yP + tp / 2],
    [xv1, yS - tc / 2],
    [cx - bPx / 2 + 6, yS - tc / 2],
    [cx - bPx / 2 + 6, yTop],
    [cx + bPx / 2 - 6, yTop],
    [cx + bPx / 2 - 6, yS - tc / 2],
    [xv2, yS - tc / 2],
    [xv2, yG + tp / 2],
    [xv1 + vb / 2 + 8, yG + tp / 2],
    [xv1 + vb / 2 + 8, yP + tp / 2],
  ];
  sch.shape('polygon', { points: loop.map((p) => p.join(',')).join(' '), class: 'xs-cool' });
  sch.shape('polygon', { points: loop.map((p) => p.join(',')).join(' '), class: 'sch-arrow dashed', fill: 'none' });
  sch.arrow([xv1, (yS + yG) / 2 + 6], [xv1, (yS + yG) / 2 - 6], { head: 6 });
  sch.arrow([cx - 8, yTop], [cx + 8, yTop], { head: 6 });
  sch.arrow([xv2, (yS + yG) / 2 - 6], [xv2, (yS + yG) / 2 + 6], { head: 6 });
  sch.text(cx, (yS + yG) / 2 + 4, 'current loop', 'sch-label sch-halo', 'middle');

  // ── dimensions
  const xh = xPl + 34;
  sch.dim([xh, yS], [xh, yG], '', {});
  sch.text(xR, yS - 14, `h = ${si(s.h, 'm', 3)}`, 'sch-value', 'end');
  sch.dim([xv1, yBot + 12], [xv2, yBot + 12], `s = ${si(s.s, 'm', 3)}`, { off: -6 });
  if (s.len > 0 && viaOut) sch.dim([cx + padOut, yBody - 8], [xv2, yBody - 8], `ℓ = ${si(s.len, 'm', 3)}`, { off: 6 });
  else sch.text(xR, yBody - 14, s.len > 0 ? `ℓ = ${si(s.len, 'm', 3)} (side vias)` : 'via in pad', 'sch-hint', 'end');
  sch.text(xPl + 4, yG + tp - 1, 'GND', 'sch-pin', 'start');
  sch.text(xPl + 4, yP + tp - 1, 'PWR', 'sch-pin', 'start');
  sch.text(xR, yBot + 30, `vias Ø ${si(s.dv, 'm', 3)}`, 'sch-hint', 'end');

  pcbLegend(sch, xL, yLeg, ['mask', 'cu', 'solder', 'fr4', 'air', 'part'], { cols: 3, colW: 140, names: { air: 'Via hole / clearance', part: 'Capacitor body' } });
  return sch.svg();
}
