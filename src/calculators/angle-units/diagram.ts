/** Unit circle with the angle drawn, its cos/sin projections and the converted values beside it. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic, type Pt } from '@/core/schematic/schematic';
import { type AngleState, dmsText, fmtNum, inputDegrees } from './def';
import { norm360, toDms, trig } from './model';

export function angleDiagram(s: AngleState, r: CalcReport): SVGSVGElement | null {
  let deg: number;
  try {
    deg = inputDegrees(s);
  } catch {
    return null;
  }
  const W = 440;
  const H = 286;
  const sch = new Schematic(W, H);
  const cx = 140;
  const cy = 146;
  const R = 100;
  const a = norm360(deg);
  const t = trig(a);
  const px = cx + R * t.cos;
  const py = cy - R * t.sin;

  // axes and circle (on the wire layer: context, not parts)
  sch.wire([[cx - R - 18, cy], [cx + R + 18, cy]], 'muted');
  sch.wire([[cx, cy + R + 14], [cx, cy - R - 14]], 'muted');
  const circ: Pt[] = Array.from({ length: 145 }, (_, i) => [cx + R * Math.cos((i / 144) * 2 * Math.PI), cy - R * Math.sin((i / 144) * 2 * Math.PI)]);
  sch.wire(circ);
  sch.text(cx + R + 22, cy + 4, '0°', 'sch-hint', 'start');
  sch.text(cx + 6, cy - R - 6, '90°', 'sch-hint', 'start');
  sch.text(cx - R - 18, cy - 6, '180°', 'sch-hint', 'start');
  sch.text(cx + 6, cy + R + 14, '270°', 'sch-hint', 'start');

  // angle arc (from 0° counter-clockwise to θ)
  const ra = 26;
  if (a > 0) {
    const n = Math.max(2, Math.ceil(a / 4));
    const arc: Pt[] = Array.from({ length: n + 1 }, (_, i) => {
      const th = ((a * i) / n) * (Math.PI / 180);
      return [cx + ra * Math.cos(th), cy - ra * Math.sin(th)];
    });
    sch.wire(arc, 'solved');
  }

  // projections: cos along x, sin vertical from the axis to the point
  sch.shape('line', { x1: px, y1: cy, x2: px, y2: py, class: 'sch-dim', 'stroke-dasharray': '4 3' }, 'back');
  sch.shape('line', { x1: cx, y1: py, x2: px, y2: py, class: 'sch-dim', 'stroke-dasharray': '2 3' }, 'back');
  sch.wire([[cx, cy], [px, cy]], 'muted');
  // the ray
  sch.wire([[cx, cy], [px, py]], 'solved');
  sch.dot(px, py, 'solved');
  sch.dot(cx, cy);

  // θ label in the middle of the arc, pushed outside the arc
  const mid = ((a > 0 ? a : 0) / 2) * (Math.PI / 180);
  const lr = ra + 13;
  sch.text(cx + lr * Math.cos(mid), cy - lr * Math.sin(mid) + 4, 'θ', 'sch-label solved');

  // readout panel
  const x0 = 276;
  let y = 34;
  const line = (txt: string, cls: string) => {
    sch.text(x0, y, txt, cls, 'start');
    y += 18;
  };
  const dms = s.given === 'dms' ? { sign: s.dmsSign, d: s.dmsD, m: s.dmsM, s: s.dmsS } : toDms(deg);
  const solved = (k: string) => (s.given === k ? 'sch-label' : 'sch-value solved');
  line(`θ = ${fmtNum(deg, 8)}°`, solved('deg'));
  line(`= ${fmtNum((deg * Math.PI) / 180, 8)} rad`, solved('rad'));
  line(`= ${dmsText(dms).replace(/(\.\d{3})\d+″/, '$1″')}`, solved('dms'));
  line(`= ${fmtNum((deg / 360) * 6400, 7)} mil`, solved('mil'));
  if (a !== deg) line(`≡ ${fmtNum(a, 8) === '360' ? fmtNum(a, 15) : fmtNum(a, 8)}° (0–360)`, 'sch-hint');
  y += 6;
  line(`cos θ = ${fmtNum(t.cos, 6)}`, 'sch-value');
  line(`sin θ = ${fmtNum(t.sin, 6)}`, 'sch-value');
  line(t.tan == null ? 'tan θ not defined' : `tan θ = ${fmtNum(t.tan, 6)}`, 'sch-value');
  if (!r.ok) sch.text(x0, H - 12, r.error ?? 'input error', 'sch-hint hl', 'start');
  return sch.svg();
}
