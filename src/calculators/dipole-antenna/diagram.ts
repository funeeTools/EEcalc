/** Centre-fed dipole: two arms of total length L, the standing-wave current, λ/2 for comparison and Z_in. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { DipoleState } from './def';
import { C0 } from './model';

export function dipoleDiagram(s: DipoleState, r: CalcReport): SVGSVGElement | null {
  if (!(s.len > 0) || !(s.f > 0) || !(s.d > 0)) return null;
  const sch = new Schematic(440, 252);
  const res = r.results.find((x) => x.key === s.solveFor && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === s.solveFor ? (failed ? 'hl' : 'solved') : '');
  const shown = (k: string, txt: string) => (k === s.solveFor && failed ? '—' : txt);
  const det = r.ok && !failed ? (r.details as { rin: number; xin: number; lambda: number; swr: number } | undefined) : undefined;

  const lambda = C0 / s.f;
  const half = lambda / 2;
  const ratio = half / s.len; // (λ/2) / L
  // L and λ/2 to scale; a very short or very long dipole is clamped (and flagged "not to scale")
  const lPx = ratio > 1 ? Math.min(Math.max(380 / ratio, 140), 380) : 380;
  const hRaw = lPx * ratio;
  const hPx = Math.min(Math.max(hRaw, 30), 400);
  const toScale = Math.abs(hPx - hRaw) < 0.5;
  const cx = 220;
  const y0 = 120;
  const xa = cx - lPx / 2;
  const xb = cx + lPx / 2;

  // ── top: f and the half-wavelength it implies
  sch.text(20, 20, `f = ${shown('f', si(s.f, 'Hz', 4))}`, `sch-label ${tone('f')}`.trim(), 'start');
  sch.text(420, 20, `λ = ${si(lambda, 'm', 4)}`, 'sch-hint', 'end');
  sch.dim([cx - hPx / 2, 50], [cx + hPx / 2, 50], `λ/2 = ${si(half, 'm', 4)}${toScale ? '' : ' (not to scale)'}`);

  // ── standing-wave current I(z) = sin(k(L/2 − |z|)), normalised to its largest value
  const k = (2 * Math.PI) / lambda;
  const n = 160;
  const zs = Array.from({ length: n + 1 }, (_, i) => -s.len / 2 + (s.len * i) / n);
  const cur = zs.map((z) => Math.sin(k * (s.len / 2 - Math.abs(z))));
  const peak = Math.max(...cur.map(Math.abs)) || 1;
  const A = 32;
  const xOf = (i: number) => xa + (lPx * i) / n;
  for (const sign of [-1, 1]) {
    const d = cur.map((c, i) => `${i ? 'L' : 'M'} ${xOf(i).toFixed(1)} ${(y0 + (sign * A * c) / peak).toFixed(1)}`).join(' ');
    sch.shape('path', { d, class: 'sch-arrow dashed', fill: 'none' }, 'back');
  }
  // label the current over the largest lobe on the right arm
  let iMax = n / 2;
  for (let i = n / 2; i <= n; i++) if (Math.abs(cur[i]) > Math.abs(cur[iMax]) + 1e-9) iMax = i;
  const xLab = Math.max(xOf(iMax), cx + 26);
  sch.text(xLab + 4, y0 - (A * Math.abs(cur[iMax])) / peak - 5, 'I(z)', 'sch-hint', 'start');

  // ── arms (thickness clamped) and the source in the feed gap
  const tPx = Math.min(Math.max((lPx * s.d) / s.len, 3), 8);
  const gap = 17;
  sch.shape('rect', { x: xa, y: y0 - tPx / 2, width: cx - gap - xa, height: tPx, class: 'xs-cu' }, 'back');
  sch.shape('rect', { x: cx + gap, y: y0 - tPx / 2, width: xb - cx - gap, height: tPx, class: 'xs-cu' }, 'back');
  // source drawn locally: sourceBetween() puts its '+' on the lead, which here is the arm itself
  sch.shape('circle', { cx, cy: y0, r: gap, class: 'sch-body', fill: 'var(--sch-fill)' });
  sch.shape('path', { d: `M ${cx - 9} ${y0} C ${cx - 5} ${y0 - 10}, ${cx - 1} ${y0 - 10}, ${cx} ${y0} S ${cx + 5} ${y0 + 10}, ${cx + 9} ${y0}`, class: 'sch-body', fill: 'none' });

  // wire diameter, with a leader from the right arm's tip
  const xd = xb - 5;
  sch.shape('line', { x1: xd, y1: y0 + tPx / 2 + 2, x2: xd, y2: y0 + 40, class: 'sch-dim' });
  sch.text(xd + 4, y0 + 52, `d = ${si(s.d, 'm', 3)}`, 'sch-value', 'end');

  // ── overall length
  sch.dim([xa, 186], [xb, 186], s.solveFor === 'len' && failed ? 'L = —' : `L = ${si(s.len, 'm', 4)} (${((s.len * s.f) / C0).toFixed(3)} λ)`, { off: -10, tone: tone('len') });

  // ── feed impedance and line
  // when L or f was solved, X_in is the target (show it, not the solver residual)
  const x = det && s.solveFor === 'xin' ? det.xin : s.xin;
  const zTxt = det ? `Z_in = ${si(det.rin, 'Ω', 4)} ${x < 0 ? '−' : '+'} j${si(Math.abs(x), 'Ω', 3)}` : `Z_in = —`;
  sch.text(cx, 228, zTxt, `sch-label ${tone('xin')}`.trim());
  sch.text(cx, 243, `feed line Z₀ = ${si(s.z0, 'Ω', 3)}${det && Number.isFinite(det.swr) ? ` · SWR ${det.swr > 100 ? '> 100' : det.swr.toFixed(2)}` : ''}`, det && det.swr > 3 ? 'sch-value hl' : 'sch-value');
  return sch.svg();
}
