/**
 * Plane-pair drawing: a top view of the plane (a × b) with the port and the nodal line of the TM₁₀ cavity
 * mode, above a cross-section along the length (thin dielectric between two copper planes, the port via
 * through a clearance in the top plane, and the TM₁₀ standing-wave field between the planes).
 * Materials come from the shared PCB kit (core/schematic/pcb.ts).
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { PlaneState } from './def';
import { modeF } from './model';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function planeDiagram(s: PlaneState, r?: CalcReport): SVGSVGElement {
  const sch = new Schematic(460, 310);
  const failed = !!r && (!r.ok || r.results.some((x) => x.solved && x.value == null));
  const tone = (k: string) => (k === s.solveFor ? (failed ? 'hl' : 'solved') : '');
  const ok = r?.ok && !failed;
  const val = (k: string, txt: string) => (failed && s.solveFor === k ? '—' : txt);
  const xL = 20;
  const xR = 440;

  // ── header
  sch.text(xL, 20, `C = ${val('c', si(s.c, 'F', 4))}`, `sch-caption ${s.solveFor === 'c' ? tone('c') : ''}`.trim(), 'start');
  const lsp = r?.results.find((x) => x.key === 'lsp');
  sch.text(xR, 20, `Z_t = ${si(s.zt, 'Ω', 3)}${ok && lsp ? ` · L_sp = ${lsp.display}` : ''}`, 'sch-hint', 'end');

  // ── top view, x to scale with the cross-section below
  const ratio = clamp(s.b / s.a, 0.2, 1.6);
  const x0 = 40;
  const boxW = 300;
  const boxH = 100;
  const wpx = Math.min(boxW, boxH / ratio);
  const hpx = wpx * ratio;
  const y0 = 44 + (boxH - hpx) / 2;
  pcbRect(sch, 'cu', x0, y0, wpx, hpx, { layer: 'back' });
  // TM10: voltage ∝ cos(πx/a) — node along the middle, opposite signs at the two ends
  const xm = x0 + wpx / 2;
  sch.shape('line', { x1: xm, y1: y0 + 3, x2: xm, y2: y0 + hpx - 3, class: 'sch-arrow dashed' });
  // the port: a square contact of side w_p (to scale, within legible limits) in a clearance of the top plane,
  // with the via at its centre
  const ppx = x0 + clamp(s.px / s.a, 0, 1) * wpx;
  const ppy = y0 + clamp(s.py / s.b, 0, 1) * hpx;
  const psz = clamp((s.wp / s.a) * wpx, 7, 36);
  pcbRect(sch, 'air', ppx - psz / 2 - 3, ppy - psz / 2 - 3, psz + 6, psz + 6, { rx: 2 });
  pcbRect(sch, 'cu', ppx - psz / 2, ppy - psz / 2, psz, psz, { rx: 1 });
  pcbShape(sch, 'hole', 'circle', { cx: ppx, cy: ppy, r: Math.min(2.4, psz / 3) });
  const right = ppx > x0 + wpx * 0.6;
  sch.text(ppx + (right ? -1 : 1) * (psz / 2 + 7), ppy + 4, 'port', 'sch-label sch-halo', right ? 'end' : 'start');
  // TM10 voltage signs at the two ends, on the half of the height away from the port
  const ySign = ppy < y0 + hpx / 2 ? y0 + hpx * 0.76 : y0 + hpx * 0.26;
  sch.text(x0 + 12, ySign + 5, '+', 'sch-sign sch-halo', 'middle');
  sch.text(x0 + wpx - 12, ySign + 5, '−', 'sch-sign sch-halo', 'middle');
  // a below, b to the right
  sch.dim([x0, y0 + hpx + 10], [x0 + wpx, y0 + hpx + 10], `a = ${si(s.a, 'm', 4)}`, { off: -6 });
  sch.dim([x0 + wpx + 12, y0], [x0 + wpx + 12, y0 + hpx], `b = ${si(s.b, 'm', 4)}`, { off: -8, anchor: 'start' });
  const f10 = modeF(1, 0, s.a, s.b, s.er);
  sch.text(xR, 36, `top view · dashed: TM₁₀ node (${si(f10, 'Hz', 3)})`, 'sch-hint', 'end');

  // ── cross-section along the length
  // the section runs along the length at full drawing width (its own scale)
  const yC = 200;
  const cw = boxW;
  const cpx = x0 + clamp(s.px / s.a, 0, 1) * cw;
  const tp = 7;
  const dPx = clamp(26 + 9 * Math.log10(s.d / 100e-6), 18, 44);
  const yD = yC + tp;
  const yB = yD + dPx;
  pcbRect(sch, 'fr4', x0, yD, cw, dPx, { layer: 'back' });
  pcbRect(sch, 'cu', x0, yC, cw, tp);
  pcbRect(sch, 'cu', x0, yB, cw, tp);
  // port via: barrel from the top surface into the bottom plane, through an air clearance in the top plane
  const bw = 8;
  pcbRect(sch, 'air', cpx - bw / 2 - 4, yC, bw + 8, tp);
  pcbRect(sch, 'cu', cpx - bw / 2, yC - 4, bw, yB + tp - (yC - 4));
  pcbRect(sch, 'air', cpx - 2, yC - 4, 4, yB + tp - (yC - 4));
  // TM10 field between the planes: up on one half, down on the other, length ∝ |cos(πx/a)|
  for (let k = 0; k <= 10; k++) {
    const u = (k + 0.5) / 11;
    const xa = x0 + u * cw;
    if (Math.abs(xa - cpx) < 10) continue;
    const c = Math.cos(Math.PI * u);
    if (Math.abs(c) < 0.2) continue;
    const half = ((dPx - 6) / 2) * Math.abs(c);
    const ym = (yD + yB) / 2;
    sch.arrow([xa, c > 0 ? ym + half : ym - half], [xa, c > 0 ? ym - half : ym + half], { head: 5 });
  }
  sch.text(x0 - 6, yC - 6, 'power plane (section along a)', 'sch-hint', 'start');
  sch.text(x0 - 6, yB + tp + 14, 'ground plane', 'sch-hint', 'start');
  const xd = x0 + cw + 14;
  sch.dim([xd, yD], [xd, yB], '', { tone: tone('d') });
  sch.text(xd + 8, (yD + yB) / 2 - 2, 'd', `sch-label ${tone('d')}`.trim(), 'start');
  sch.text(xd + 8, (yD + yB) / 2 + 12, val('d', si(s.d, 'm', 3)), `sch-value ${tone('d')}`.trim(), 'start');
  sch.text(xR, yB + tp + 14, `ε_r = ${s.er} · tan δ = ${s.tanD}`, 'sch-hint', 'end');
  sch.text(xR, yC - 6, 'arrows: TM₁₀ field', 'sch-hint', 'end');

  // FR-4-like laminates (εr ≈ 3.5–5) keep the FR-4 name; others (e.g. ceramic-filled films) show their εr
  const diel = s.er >= 3.5 && s.er <= 5 ? 'Dielectric (FR-4)' : `Dielectric (ε_r ${+s.er.toPrecision(3)})`;
  pcbLegend(sch, xL, 300, ['cu', 'fr4', 'hole', 'air'], { names: { fr4: diel, air: 'Clearance / air' } });
  return sch.svg();
}
