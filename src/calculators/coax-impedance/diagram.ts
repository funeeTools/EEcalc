/** Coax cross-section: inner conductor d, dielectric εr, shield at D (to scale, clamped), plus a side view for ℓ. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic, type Pt } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { DIELECTRICS, type CoaxState } from './def';

const fmtLen = (m: number) => si(m, 'm', 4);

export function coaxDiagram(s: CoaxState, r: CalcReport): SVGSVGElement | null {
  if (!(s.D > 0) || !(s.d > 0)) return null;
  const sch = new Schematic(440, 272);
  const det = r.ok ? (r.details as { vf?: number; fcTe11?: number; ratio?: number } | undefined) : undefined;
  const solved = s.solveFor;
  // the solved quantity: green, or red "—" when the solve found no answer
  const res = r.results.find((x) => x.key === solved && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === solved ? (failed ? 'hl' : 'solved') : '');
  const bad = !(s.D > s.d); // D ≤ d: drawn clamped, dimensions flagged
  const show = (k: 'D' | 'd', v: number) => `${k} = ${k === solved && failed ? '—' : fmtLen(v)}`;

  // ── concentric section, to scale for D/d (inner conductor kept ≥ 5 px)
  const cx = 112;
  const cy = 136;
  const R = 82; // dielectric radius (D/2)
  const sh = 9; // shield wall
  const rd = Math.min(Math.max((R * s.d) / s.D, 5), R - 6);
  sch.shape('circle', { cx, cy, r: R + sh, class: 'xs-cu' }, 'back');
  sch.shape('circle', { cx, cy, r: R, class: 'xs-sub' }, 'back');
  sch.shape('circle', { cx, cy, r: rd, class: 'xs-cu' }, 'back');

  // ── D on top, d underneath (extension lines are tangent to the circles)
  const yD = cy - R - sh - 14;
  const yd = cy + R + sh + 14;
  const ext = (x: number, y0: number, y1: number) => sch.shape('line', { x1: x, y1: y0, x2: x, y2: y1, class: 'sch-dim' });
  ext(cx - R, cy, yD - 4);
  ext(cx + R, cy, yD - 4);
  ext(cx - rd, cy, yd + 4);
  ext(cx + rd, cy, yd + 4);
  sch.dim([cx - R, yD], [cx + R, yD], show('D', s.D), { tone: bad ? 'hl' : tone('D') });
  sch.dim([cx - rd, yd], [cx + rd, yd], show('d', s.d), { off: -10, tone: bad ? 'hl' : tone('d') });

  // ── right column: Z₀, then leaders to shield, dielectric and inner conductor
  const x0 = 226;
  const polar = (rad: number, deg: number): Pt => [cx + rad * Math.cos((deg * Math.PI) / 180), cy + rad * Math.sin((deg * Math.PI) / 180)];
  const leader = (from: Pt, y: number) => sch.shape('path', { d: `M ${from[0]} ${from[1]} L ${x0 - 14} ${y} L ${x0 - 4} ${y}`, class: 'sch-dim', fill: 'none' });

  sch.text(x0, 34, `Z₀ = ${r.ok || solved !== 'z0' ? si(s.z0, 'Ω', 4) : '—'}`, `sch-label ${solved === 'z0' ? (r.ok ? 'solved' : 'hl') : ''}`.trim(), 'start');
  sch.text(x0, 48, `D/d = ${(s.D / s.d).toPrecision(4)}${det?.vf ? ` · VF ${det.vf.toFixed(3)}` : ''}`, bad ? 'sch-value hl' : 'sch-value', 'start');

  leader(polar(R + sh / 2, -42), 84);
  sch.text(x0, 88, 'outer conductor (shield)', 'sch-hint', 'start');

  leader(polar((R + rd) / 2, -6), 122);
  const erShown = solved === 'er' && failed ? '—' : s.er.toPrecision(4);
  sch.text(x0, 126, `εᵣ = ${erShown}`, `sch-label ${tone('er')}`.trim(), 'start');
  const preset = DIELECTRICS[s.dielectric] ? s.dielectric : 'Custom dielectric';
  sch.text(x0, 140, `${preset} · tan δ ${+s.tanD.toPrecision(3)}`, 'sch-hint', 'start');

  leader(polar(rd, 35), 170);
  sch.text(x0, 174, 'inner conductor', 'sch-hint', 'start');

  if (det?.fcTe11) {
    const over = s.f >= det.fcTe11;
    sch.text(x0, 194, `f = ${si(s.f, 'Hz', 3)} · TE₁₁ cutoff ${si(det.fcTe11, 'Hz', 3)}`, over ? 'sch-value hl' : 'sch-hint', 'start');
  }

  // ── side view: a short piece of cable with its length ℓ
  if (s.len > 0) {
    const xa = x0;
    const xb = 420;
    const yc = 220;
    sch.shape('rect', { x: xa, y: yc - 7, width: xb - xa, height: 14, class: 'xs-cu' }, 'back');
    sch.shape('rect', { x: xa, y: yc - 4.5, width: xb - xa, height: 9, class: 'xs-sub' }, 'back');
    sch.shape('rect', { x: xa, y: yc - 1.5, width: xb - xa, height: 3, class: 'xs-cu' }, 'back');
    const il = r.ok ? r.results.find((x) => x.key === 'lineLoss')?.display : undefined;
    sch.dim([xa, yc + 18], [xb, yc + 18], `ℓ = ${si(s.len, 'm', 4)}${il ? ` · ${il}` : ''}`, { off: -10 });
  }
  return sch.svg();
}
