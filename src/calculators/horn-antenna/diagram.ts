/** Horn sketch: H-plane (top) and E-plane (side) views of the feed and flare, with aperture and length dimensions. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { HornState } from './def';
import { apexDistance, flareLength } from './model';

const fLen = (v: number) => si(v, 'm', 4);

export function hornDiagram(s: HornState, r: CalcReport): SVGSVGElement | null {
  if (!(s.a > 0) || !(s.b > 0)) return null;
  const det = r.ok ? (r.details as { geom?: { a1: number; b1: number; rho1: number; rho2: number }; G?: number; hpbwE?: number | null; hpbwH?: number | null } | undefined) : undefined;
  const failed = !r.ok || r.results.some((x) => x.solved && x.value == null);
  const design = s.solveFor === 'design';
  const lenSolve = s.solveFor === 'design' || s.solveFor === 'len';
  const a1 = s.type === 'e-sectoral' ? s.a : det?.geom?.a1 ?? s.a1;
  const b1 = s.type === 'h-sectoral' ? s.b : det?.geom?.b1 ?? s.b1;
  if (!(a1 > 0) || !(b1 > 0)) return null;
  // axial lengths of the two flares (equal for a real horn; may differ in apex-distance mode)
  let pH: number;
  let pE: number;
  if (s.lenMode === 'rho' && !lenSolve) {
    pH = s.type === 'e-sectoral' ? NaN : flareLength(a1, s.a, s.rho2);
    pE = s.type === 'h-sectoral' ? NaN : flareLength(b1, s.b, s.rho1);
    if (!Number.isFinite(pH)) pH = pE;
    if (!Number.isFinite(pE)) pE = pH;
  } else {
    pH = s.len;
    pE = s.len;
  }
  if (!(pH > 0) || !(pE > 0)) return null;
  const mismatch = Math.abs(pE - pH) / Math.max(pE, pH) > 0.01;

  const Lmax = Math.max(pH, pE);
  // the feed too: a typed feed wider than the aperture (an error state, still drawn) must not overflow its box
  const k = Math.min(250 / Lmax, 84 / Math.max(a1, b1, s.a, s.b));
  const px = (v: number, min: number) => Math.max(v * k, min);
  const x0 = 34;
  const feedLen = 34;
  const xf = x0 + feedLen;
  const sch = new Schematic(440, 360);

  // headline
  const G = det?.G;
  const gTone = s.solveFor === 'gain' ? (r.ok ? 'solved' : 'hl') : '';
  const hp = (v: number | null | undefined) => (v == null ? '—' : `${((v * 180) / Math.PI).toFixed(1)}°`);
  sch.text(20, 20, `G = ${G != null ? `${G.toFixed(2)} dBi` : '—'}`, `sch-label ${gTone}`.trim(), 'start');
  sch.text(150, 20, `θ_E ${hp(det?.hpbwE)} · θ_H ${hp(det?.hpbwH)} (−3 dB)`, 'sch-value', 'start');
  sch.text(420, 20, `f = ${si(s.f, 'Hz', 4)}`, 'sch-hint', 'end');

  const view = (cy: number, caption: string, rhoTxt: string, rhoTone: string, w: number, w1: number, p: number, sym: string, solvedW: boolean, lenTone: string) => {
    const wpx = px(w, 6);
    const w1px = Math.max(px(w1, 6), wpx);
    const lpx = px(p, 50);
    sch.box(x0 - 14, cy - 64, 440 - x0 - 2, 142, caption);
    sch.text(416, cy - 52, rhoTxt, `${rhoTone ? 'sch-value' : 'sch-hint'} ${rhoTone}`.trim(), 'end');
    // feed guide stub and flare
    sch.shape('rect', { x: x0, y: cy - wpx / 2, width: feedLen, height: wpx, class: 'sch-block' });
    sch.shape('polygon', { points: `${xf},${cy - wpx / 2} ${xf + lpx},${cy - w1px / 2} ${xf + lpx},${cy + w1px / 2} ${xf},${cy + wpx / 2}`, class: 'sch-block' });
    sch.shape('line', { x1: x0 - 8, y1: cy, x2: xf + lpx + 8, y2: cy, class: 'sch-dim', 'stroke-dasharray': '6 3 1 3' });
    // aperture dimension on the right, label beside it
    const xd = xf + lpx + 16;
    sch.shape('line', { x1: xf + lpx + 2, y1: cy - w1px / 2, x2: xd + 4, y2: cy - w1px / 2, class: 'sch-dim' });
    sch.shape('line', { x1: xf + lpx + 2, y1: cy + w1px / 2, x2: xd + 4, y2: cy + w1px / 2, class: 'sch-dim' });
    sch.dim([xd, cy - w1px / 2], [xd, cy + w1px / 2], `${sym}₁ = ${solvedW && failed ? '—' : fLen(w1)}`, { off: -8, anchor: 'start', tone: solvedW ? (failed ? 'hl' : 'solved') : '' });
    // axial length below
    const yl = cy + Math.max(w1px / 2, wpx / 2) + 14;
    sch.shape('line', { x1: xf, y1: cy + wpx / 2 + 2, x2: xf, y2: yl + 4, class: 'sch-dim' });
    sch.shape('line', { x1: xf + lpx, y1: cy + w1px / 2 + 2, x2: xf + lpx, y2: yl + 4, class: 'sch-dim' });
    const lLabel = s.lenMode === 'rho' && !lenSolve ? `p_${sym === 'a' ? 'h' : 'e'} = ${fLen(p)}` : `L = ${lenSolve && failed ? '—' : fLen(p)}`;
    sch.dim([xf, yl], [xf + lpx, yl], lLabel, { off: -10, tone: lenTone });
  };
  const lenTone = mismatch ? 'hl' : lenSolve ? (failed ? 'hl' : 'solved') : '';
  const fr = (rho: number, sym: string) => (Number.isFinite(rho) ? `${sym} = ${fLen(rho)}` : 'not flared');
  // apex distances are solved (green) in design and length mode, as in the form
  const rhoTone = (rho: number) => (lenSolve && Number.isFinite(rho) ? (failed ? 'hl' : 'solved') : '');
  const rho2 = det?.geom ? det.geom.rho2 : s.type === 'e-sectoral' ? Infinity : s.lenMode === 'rho' ? s.rho2 : apexDistance(a1, s.a, s.len);
  const rho1 = det?.geom ? det.geom.rho1 : s.type === 'h-sectoral' ? Infinity : s.lenMode === 'rho' ? s.rho1 : apexDistance(b1, s.b, s.len);
  view(114, `H-plane (top) · feed a = ${fLen(s.a)}`, fr(rho2, 'ρ₂'), rhoTone(rho2), s.a, a1, pH, 'a', design && s.type !== 'e-sectoral', lenTone);
  view(276, `E-plane (side) · feed b = ${fLen(s.b)}`, fr(rho1, 'ρ₁'), rhoTone(rho1), s.b, b1, pE, 'b', design && s.type !== 'h-sectoral', lenTone);
  return sch.svg();
}
