/** Antenna radiating to a point at distance r: EIRP, S/E/H at the point, field region and the limit check. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';

import { type PdState, pct, sx } from './def';
import { C0 } from './model';

interface Details {
  eirp: number;
  S: number;
  e: number;
  h: number;
  reactive: number;
  fraunhofer: number;
  zone: string;
  ratio: number | null;
  rc: number | null;
}

const fDist = (m: number) => (m >= 1e3 ? `${+(m / 1e3).toPrecision(4)} km` : sx(m, 'm', 3));

export function pdDiagram(s: PdState, r: CalcReport): SVGSVGElement | null {
  const W = 440;
  const H = 256;
  const sch = new Schematic(W, H);
  const det = r.ok ? (r.details as Details | undefined) : undefined;
  const tone = (k: string) => (k === s.solveFor ? (r.ok ? 'solved' : 'hl') : '');
  const over = det?.ratio != null && det.ratio > 1 + 1e-9;

  // ── header
  sch.text(16, 20, `f = ${sx(s.f, 'Hz', 4)} · λ = ${sx(C0 / s.f, 'm', 3)}`, 'sch-label', 'start');
  sch.text(W - 16, 20, s.ground === 'ground' ? 'ground reflection ×2.56' : 'free space', 'sch-hint', 'end');

  // ── antenna, wavefronts and the path
  const xa = 62;
  const ya = 104;
  const xp = 340;
  for (const rad of [22, 40, 58]) {
    const a = (34 * Math.PI) / 180;
    sch.shape('path', { d: `M ${xa + rad * Math.cos(a)} ${ya - 26 - rad * Math.sin(a)} A ${rad} ${rad} 0 0 1 ${xa + rad * Math.cos(a)} ${ya - 26 + rad * Math.sin(a)}`, class: 'sch-dim', fill: 'none' }, 'back');
  }
  sch.antenna(xa, ya, { tone: tone('p') });
  sch.wire([[xa, ya], [xa, 112]]);
  sch.block(xa - 30, 112, 60, 26, { label: 'Tx', tone: tone('p') });
  sch.text(xa, 154, `P_t = ${s.solveFor === 'p' && !r.ok ? '—' : sx(s.p, 'W', 3)}`, `sch-value ${tone('p')}`.trim());
  sch.text(xa, 171, `G = ${+s.g.toFixed(2)} dBi`.replace('-', '−'), 'sch-value');
  sch.arrow([128, ya - 26], [xp - 10, ya - 26], { dashed: true, tone: over ? 'hl' : '' });
  if (det) sch.text((128 + xp) / 2, ya - 34, `EIRP ${sx(det.eirp, 'W', 3)}${s.duty < 100 ? ` · δ ${+s.duty.toPrecision(3)} %` : ''}`, 'sch-value');
  sch.dot(xp, ya - 26, over ? 'hl' : '');

  // ── values at the point
  const sTone = over ? 'hl' : s.solveFor === 's' ? tone('s') : '';
  sch.text(xp, ya - 2, det ? `S = ${sx(det.S, 'W/m²', 3)}` : 'S = —', `sch-label ${sTone}`.trim());
  if (det) {
    sch.text(xp, ya + 14, `E = ${sx(det.e, 'V/m', 3)}`, 'sch-value');
    sch.text(xp, ya + 28, `H = ${sx(det.h, 'A/m', 3)}`, 'sch-value');
  }

  // ── distance
  const yd = 196;
  sch.shape('line', { x1: xa, y1: 178, x2: xa, y2: yd + 4, class: 'sch-dim' });
  sch.shape('line', { x1: xp, y1: ya + 36, x2: xp, y2: yd + 4, class: 'sch-dim' });
  sch.dim([xa, yd], [xp, yd], `r = ${s.solveFor === 'r' && !r.ok ? '—' : fDist(s.r)}`, { tone: tone('r') });

  // ── limit and field region
  if (det) {
    const zoneTxt = det.zone === 'far field' ? `far field${det.fraunhofer > 0 ? ` (beyond 2D²/λ = ${fDist(det.fraunhofer)})` : ''}` : `${det.zone}: far-field formula not valid`;
    sch.text(16, 222, det.ratio == null ? 'no exposure limit at this frequency' : `${pct(det.ratio)} of the limit · compliance distance r_c = ${fDist(det.rc!)}`, `sch-value ${over ? 'hl' : ''}`.trim(), 'start');
    sch.text(16, 240, zoneTxt, `sch-hint ${det.zone === 'far field' ? '' : 'hl'}`.trim(), 'start');
  } else if (r.error) sch.text(16, 222, 'no solution in range', 'sch-value hl', 'start');
  return sch.svg();
}
