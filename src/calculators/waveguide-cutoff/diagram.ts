/** Rectangular waveguide cross-section: walls, a and b dimensions, and the transverse E-field of the selected mode. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { modeName, type WgState } from './def';
import { C0, rectCutoff, rectEField, validMode } from './model';

export function wgDiagram(s: WgState, r: CalcReport): SVGSVGElement | null {
  if (!(s.a > 0) || !(s.b > 0)) return null;
  const type = s.modeType === 'TM' ? 'TM' : 'TE';
  const okMode = validMode(type, s.m, s.n);
  const solvedRes = r.results.find((x) => x.solved && (x.key === 'a' || x.key === 'f'));
  const failed = !r.ok || (solvedRes != null && solvedRes.value == null);
  const solvedA = s.solveFor === 'a' || s.solveFor === 'aLg';

  // ── geometry, to scale for b/a (clamped so a very flat or tall guide stays legible)
  const ratio = Math.min(Math.max(s.b / s.a, 0.15), 2);
  let W = 210;
  let H = W * ratio;
  if (H > 150) {
    H = 150;
    W = H / ratio;
  }
  H = Math.max(H, 34);
  const wall = 8;
  const top = 62;
  const x0 = 245 - W / 2;
  const sch = new Schematic(440, top + H + 2 * wall + 62);
  sch.shape('rect', { x: x0 - wall, y: top - wall, width: W + 2 * wall, height: H + 2 * wall, rx: 3, class: 'xs-cu' }, 'back');
  sch.shape('rect', { x: x0, y: top, width: W, height: H, class: s.er > 1 ? 'xs-sub' : 'sch-body', fill: 'var(--sch-fill)', 'stroke-width': s.er > 1 ? 1 : 0 }, 'back');

  // ── transverse E-field arrows of the selected mode
  const fcSel = okMode ? rectCutoff(s.a, s.b, s.m, s.n, s.er) : 0;
  const cut = okMode && !(s.f > fcSel);
  if (okMode) {
    const nx = Math.max(6, Math.min(12, Math.round(W / 22)));
    const ny = Math.max(2, Math.min(7, Math.round(H / 22)));
    const pts: { px: number; py: number; ex: number; ey: number }[] = [];
    let emax = 0;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const u = (i + 0.5) / nx;
        const v = (j + 0.5) / ny;
        const [ex, ey] = rectEField(type, s.a, s.b, s.m, s.n, u * s.a, v * s.b);
        // screen y grows downward; the guide's y = 0 is the bottom wall
        pts.push({ px: x0 + u * W, py: top + H - v * H, ex: ex / s.b, ey: ey / s.b });
        emax = Math.max(emax, Math.hypot(ex / s.b, ey / s.b));
      }
    const cell = Math.min(W / nx, H / ny) * 0.82;
    for (const p of pts) {
      const mag = Math.hypot(p.ex, p.ey) / (emax || 1);
      if (mag < 0.15) continue;
      const len = Math.max(cell * mag, 6);
      const ux = p.ex / Math.hypot(p.ex, p.ey);
      const uy = -p.ey / Math.hypot(p.ex, p.ey);
      sch.arrow([p.px - (ux * len) / 2, p.py - (uy * len) / 2], [p.px + (ux * len) / 2, p.py + (uy * len) / 2], { head: 5, tone: cut ? 'muted' : '' });
    }
  }

  // ── headline: mode, cutoff, frequency, λg
  const mn = okMode ? modeName(type, s.m, s.n) : `${type}?`;
  const fcTxt = solvedA && failed ? '—' : si(okMode ? fcSel : s.fc, 'Hz', 4);
  const fcTone = cut ? 'hl' : s.solveFor !== 'a' ? 'solved' : '';
  sch.text(20, 22, `${mn} · f_c = ${fcTxt}${cut ? ' (cut off)' : ''}`, `sch-label ${fcTone}`.trim(), 'start');
  const fTxt = s.solveFor === 'f' && failed ? '—' : si(s.f, 'Hz', 4);
  const lgRes = r.results.find((x) => x.key === 'lg');
  const lgTxt = s.solveFor === 'f' || s.solveFor === 'aLg' ? si(s.lg, 'm', 4) : lgRes && typeof lgRes.value === 'number' ? si(lgRes.value, 'm', 4) : '—';
  sch.text(20, 38, `f = ${fTxt}`, `sch-value ${s.solveFor === 'f' ? (failed ? 'hl' : 'solved') : ''}`.trim(), 'start');
  sch.text(130, 38, `λ_g = ${lgTxt}`, `sch-value ${s.solveFor === 'fc' || s.solveFor === 'a' ? (cut ? 'hl' : 'solved') : ''}`.trim(), 'start');
  sch.text(420, 22, `λ₀ = ${si(C0 / s.f, 'm', 3)}`, 'sch-hint', 'end');
  sch.text(420, 38, okMode ? 'E-field (transverse)' : 'invalid mode', 'sch-hint', 'end');

  // ── dimensions
  const yDim = top + H + wall + 16;
  for (const x of [x0, x0 + W]) sch.shape('line', { x1: x, y1: top + H + wall + 2, x2: x, y2: yDim + 4, class: 'sch-dim' });
  sch.dim([x0, yDim], [x0 + W, yDim], `a = ${solvedA && failed ? '—' : si(s.a, 'm', 4)}`, { off: -10, tone: solvedA ? (failed ? 'hl' : 'solved') : '' });
  const xDim = x0 - wall - 14;
  for (const y of [top, top + H]) sch.shape('line', { x1: x0 - wall - 2, y1: y, x2: xDim - 4, y2: y, class: 'sch-dim' });
  sch.dim([xDim, top], [xDim, top + H], `b = ${si(s.b, 'm', 4)}`, { off: 8, tone: s.b > s.a ? 'hl' : '' });

  // ── materials
  const fill = s.er > 1 ? `${s.filling !== 'Custom' ? s.filling : 'dielectric'} εr ${+s.er.toPrecision(4)}` : 'air-filled';
  sch.text(245, yDim + 32, `${fill} · ${s.metal !== 'Custom' ? s.metal.toLowerCase() : `σ ${si(s.sigma, 'S/m', 3)}`} walls${s.wr !== 'Custom' ? ` · ${s.wr}` : ''}`, 'sch-hint');
  return sch.svg();
}
