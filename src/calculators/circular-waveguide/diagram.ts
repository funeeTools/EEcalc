/** Circular waveguide cross-section: wall, diameter, and the transverse E-field of the selected mode. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { modeName } from '../waveguide-cutoff/def';
import type { CwgState } from './def';
import { C0, circCutoff, circEField, validCircMode } from './model';

export function cwgDiagram(s: CwgState, r: CalcReport): SVGSVGElement | null {
  if (!(s.a > 0)) return null;
  const type = s.modeType === 'TM' ? 'TM' : 'TE';
  const okMode = validCircMode(s.n, s.m);
  const solvedRes = r.results.find((x) => x.solved && (x.key === 'a' || x.key === 'f'));
  const failed = !r.ok || (solvedRes != null && solvedRes.value == null);
  const solvedA = s.solveFor === 'a' || s.solveFor === 'aLg';

  const R = 84;
  const wall = 8;
  const cx = 245;
  const cy = 62 + R + wall;
  const sch = new Schematic(440, cy + R + wall + 58);
  sch.shape('circle', { cx, cy, r: R + wall, class: 'xs-cu' }, 'back');
  sch.shape('circle', { cx, cy, r: R, class: s.er > 1 ? 'xs-sub' : 'sch-body', fill: 'var(--sch-fill)', 'stroke-width': s.er > 1 ? 1 : 0 }, 'back');

  const fc = okMode ? circCutoff(type, s.a, s.n, s.m, s.er) : 0;
  const cut = okMode && !(s.f > fc);
  if (okMode) {
    const step = R / 4.2;
    const pts: { px: number; py: number; ex: number; ey: number }[] = [];
    let emax = 0;
    for (let i = -4; i <= 4; i++)
      for (let j = -4; j <= 4; j++) {
        const x = i * step;
        const y = j * step;
        const rho = Math.hypot(x, y);
        if (rho > R * 0.9) continue;
        const [ex, ey] = circEField(type, s.n, s.m, s.a, (rho / R) * s.a, Math.atan2(y, x));
        pts.push({ px: cx + x, py: cy - y, ex, ey });
        emax = Math.max(emax, Math.hypot(ex, ey));
      }
    for (const p of pts) {
      const mag = Math.hypot(p.ex, p.ey) / (emax || 1);
      if (mag < 0.15) continue;
      const len = Math.max(step * 0.85 * mag, 6);
      const ux = p.ex / Math.hypot(p.ex, p.ey);
      const uy = -p.ey / Math.hypot(p.ex, p.ey);
      sch.arrow([p.px - (ux * len) / 2, p.py - (uy * len) / 2], [p.px + (ux * len) / 2, p.py + (uy * len) / 2], { head: 5, tone: cut ? 'muted' : '' });
    }
  }

  const mn = okMode ? modeName(type, s.n, s.m) : `${type}?`;
  const fcTxt = solvedA && failed ? '—' : si(okMode ? fc : s.fc, 'Hz', 4);
  sch.text(20, 22, `${mn} · f_c = ${fcTxt}${cut ? ' (cut off)' : ''}`, `sch-label ${cut ? 'hl' : s.solveFor !== 'a' ? 'solved' : ''}`.trim(), 'start');
  const fTxt = s.solveFor === 'f' && failed ? '—' : si(s.f, 'Hz', 4);
  const lgRes = r.results.find((x) => x.key === 'lg');
  const lgTxt = s.solveFor === 'f' || s.solveFor === 'aLg' ? si(s.lg, 'm', 4) : lgRes && typeof lgRes.value === 'number' ? si(lgRes.value, 'm', 4) : '—';
  sch.text(20, 38, `f = ${fTxt}`, `sch-value ${s.solveFor === 'f' ? (failed ? 'hl' : 'solved') : ''}`.trim(), 'start');
  sch.text(130, 38, `λ_g = ${lgTxt}`, `sch-value ${s.solveFor === 'fc' || s.solveFor === 'a' ? (cut ? 'hl' : 'solved') : ''}`.trim(), 'start');
  sch.text(420, 22, `λ₀ = ${si(C0 / s.f, 'm', 3)}`, 'sch-hint', 'end');
  sch.text(420, 38, okMode ? 'E-field (transverse)' : 'invalid mode', 'sch-hint', 'end');

  // diameter below, with extension lines tangent to the bore
  const yDim = cy + R + wall + 16;
  for (const x of [cx - R, cx + R]) sch.shape('line', { x1: x, y1: cy, x2: x, y2: yDim + 4, class: 'sch-dim' });
  const aTxt = solvedA && failed ? '—' : si(s.a, 'm', 4);
  sch.dim([cx - R, yDim], [cx + R, yDim], `2a = ${solvedA && failed ? '—' : si(2 * s.a, 'm', 4)} (a = ${aTxt})`, { off: -10, tone: solvedA ? (failed ? 'hl' : 'solved') : '' });
  const fill = s.er > 1 ? `${s.filling !== 'Custom' ? s.filling : 'dielectric'} εr ${+s.er.toPrecision(4)}` : 'air-filled';
  sch.text(cx, yDim + 32, `${fill} · ${s.metal !== 'Custom' ? s.metal.toLowerCase() : `σ ${si(s.sigma, 'S/m', 3)}`} walls`, 'sch-hint');
  return sch.svg();
}
