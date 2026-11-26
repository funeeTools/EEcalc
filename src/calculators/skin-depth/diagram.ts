/** Round-wire cross-section: the current-carrying skin of depth δ (to scale, clamped) around a low-current core. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { MATERIALS, type SkinState } from './def';

/** Which inputs are calculated in each mode (matches the green rows of the form). */
const SOLVED: Record<SkinState['solveFor'], string[]> = { delta: ['delta', 'ratio'], f: ['f', 'ratio'], fRatio: ['f', 'delta'] };
/** Plain number: toPrecision(d) switches to e-notation from 10^d up (a 25 mm rod at 10 THz has Rac/Rdc ≈ 3·10⁵). */
const num = (v: number, d: number) => (Math.abs(v) < 10 ** d - 0.5 ? v.toPrecision(d) : Math.round(v).toLocaleString('en-US'));

export function skinDiagram(s: SkinState, r: CalcReport): SVGSVGElement | null {
  if (!(s.d > 0)) return null;
  const sch = new Schematic(440, 252);
  const solved = SOLVED[s.solveFor] ?? [];
  const cls = (base: string, k: string) => (solved.includes(k) ? `${base} solved` : base);
  const val = (k: string, txt: string) => (solved.includes(k) && !r.ok ? '—' : txt);
  const det = r.ok ? (r.details as { delta: number; ratio: number; rac: number; rdc: number } | undefined) : undefined;
  const delta = det?.delta ?? s.delta;
  const a = s.d / 2;
  const whole = r.ok && delta >= a;

  // ── wire section
  const cx = 112;
  const cy = 136;
  const Rw = 84;
  const riRaw = Rw - (Rw * delta) / a;
  const ri = whole ? 0 : Math.min(Math.max(riRaw, 5), Rw - 4);
  const enlarged = !whole && Math.abs(ri - riRaw) > 0.5;
  const ring = (rad: number) => `M ${cx - rad} ${cy} a ${rad} ${rad} 0 1 0 ${2 * rad} 0 a ${rad} ${rad} 0 1 0 ${-2 * rad} 0 Z`;
  if (whole) sch.shape('circle', { cx, cy, r: Rw, class: 'xs-cu' }, 'back');
  else {
    sch.shape('path', { d: `${ring(Rw)} ${ring(ri)}`, 'fill-rule': 'evenodd', class: 'xs-cu' }, 'back');
    sch.shape('circle', { cx, cy, r: ri, class: 'xs-cu-soft' }, 'back');
    sch.shape('circle', { cx, cy, r: ri, class: 'xs-air' }, 'back');
    // δ: radial dimension at 3 o'clock, its label in the right-hand column
    sch.dim([cx + ri, cy], [cx + Rw, cy], '', { tone: solved.includes('delta') ? 'solved' : '' });
  }
  const x0 = 226;
  sch.shape('line', { x1: cx + Rw + 3, y1: cy, x2: x0 - 4, y2: cy, class: 'sch-dim' });

  // ── d across the top (extension lines tangent to the wire)
  const yD = cy - Rw - 14;
  for (const x of [cx - Rw, cx + Rw]) sch.shape('line', { x1: x, y1: cy, x2: x, y2: yD - 4, class: 'sch-dim' });
  sch.dim([cx - Rw, yD], [cx + Rw, yD], `d = ${si(s.d, 'm', 4)}`);

  // ── right column: material, f, δ, Rac/Rdc
  sch.text(x0, 34, MATERIALS[s.material] ? s.material : 'Custom conductor', 'sch-hint', 'start');
  sch.text(x0, 48, `σ = ${si(s.sigma, 'S/m', 3)} · μr = ${+s.mur.toPrecision(4)}`, 'sch-value', 'start');
  sch.text(x0, 80, `f = ${val('f', si(s.f, 'Hz', 4))}`, cls('sch-label', 'f'), 'start');
  sch.text(x0, cy + 4, `δ = ${val('delta', si(delta, 'm', 4))}`, cls('sch-label', 'delta'), 'start');
  sch.text(x0, cy + 18, whole ? 'δ ≥ d/2: the whole wire carries current' : enlarged ? 'skin (drawn thicker than to scale)' : 'skin: current within ~δ of the surface', 'sch-hint', 'start');
  sch.text(x0, 190, `Rac/Rdc = ${val('ratio', num(det?.ratio ?? s.ratio, 4))}`, cls('sch-label', 'ratio'), 'start');
  if (det) {
    const per = s.len > 0 ? `ℓ = ${si(s.len, 'm', 3)}: R_ac ${si(det.rac * s.len, 'Ω', 3)}` : `R_ac ${si(det.rac, 'Ω', 3)}/m`;
    sch.text(x0, 204, `${per} · d/δ = ${num(s.d / det.delta, 3)}`, 'sch-value', 'start');
  }

  // ── legend under the wire
  if (!whole) {
    const y = 236;
    sch.shape('rect', { x: 30, y: y - 9, width: 10, height: 10, class: 'xs-cu' }, 'back');
    sch.text(45, y, 'skin', 'sch-hint', 'start');
    sch.shape('rect', { x: 86, y: y - 9, width: 10, height: 10, class: 'xs-cu-soft' }, 'back');
    sch.text(101, y, 'low-current core', 'sch-hint', 'start');
  }
  return sch.svg();
}
