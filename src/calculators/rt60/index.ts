/** Room RT60 — page module: definition + theory + a room sketch with the surfaces labelled. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic, type Pt } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type Rt60State } from './def';
import { MATERIAL } from './model';
import { theory } from './theory';

const poly = (pts: Pt[]) => pts.map((p) => p.join(',')).join(' ');
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

function room(s: Rt60State, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as { tm: number; ta: number; freeArea: number; v: number } | undefined) : undefined;
  const sch = new Schematic(460, 256);
  const L = Math.max(s.length, 1e-3);
  const W = Math.max(s.width, 1e-3);
  const H = Math.max(s.height, 1e-3);
  // cabinet projection: depth at half scale, 35°; each drawn edge clamped to ≥ 34 px so thin rooms stay legible
  const ca = Math.cos((35 * Math.PI) / 180) * 0.5;
  const sa = Math.sin((35 * Math.PI) / 180) * 0.5;
  const k = Math.min(196 / (L + W * ca), 160 / (H + W * sa));
  const Lp = Math.max(k * L, 34);
  const Hp = Math.max(k * H, 34);
  const Wp = Math.max(k * W, 34 / 0.5);
  const dv: Pt = [Wp * ca, -Wp * sa];
  const x0 = 84;
  const yb = 214;
  const P0: Pt = [x0, yb];
  const P1: Pt = [x0 + Lp, yb];
  const P2 = add(P1, dv);
  const P3 = add(P0, dv);
  const up = (p: Pt): Pt => [p[0], p[1] - Hp];
  const solvedT = s.solveFor === 'treatArea';

  // floor, back wall (behind), treatment patch, then the outline edges
  sch.shape('polygon', { points: poly([P0, P1, P2, P3]), class: 'xs-sub' }, 'back');
  sch.shape('polygon', { points: poly([P3, P2, up(P2), up(P3)]), class: 'xs-air' }, 'back');
  // windows / patches on walls: one strip on the back wall sized by their share of the wall area
  const wallArea = 2 * (L + W) * H;
  const patchArea = s.surfaces.filter((x) => x.on === 'walls' && x.cover === 'area').reduce((t, x) => t + (Number(x.area) || 0), 0);
  if (patchArea > 0) {
    const fr = Math.min(patchArea / (L * H), 0.9);
    const pw = (P2[0] - P3[0]) * Math.min(Math.sqrt(fr), 0.9);
    const ph = Hp * Math.min(Math.sqrt(fr), 0.9);
    const cx = (P2[0] + P3[0]) / 2;
    const cy = P3[1] - Hp / 2;
    sch.shape('rect', { x: cx - pw / 2, y: cy - ph / 2, width: pw, height: ph, class: 'sch-body', fill: 'none', 'stroke-dasharray': '4 3' });
  }
  // treatment: on the right-hand side wall (P1-P2) or as a strip on the ceiling
  const ta = d?.ta ?? s.treatArea;
  if (ta > 0) {
    const cls = solvedT ? 'sch-fill-solved' : 'xs-cool';
    if (s.treatOn === 'walls') {
      const fr = Math.min(ta / (W * H), 0.85);
      const h = Hp * Math.sqrt(fr);
      const w0 = 0.5 - Math.sqrt(fr) / 2;
      const w1 = 0.5 + Math.sqrt(fr) / 2;
      const a: Pt = add(P1, [dv[0] * w0, dv[1] * w0]);
      const b: Pt = add(P1, [dv[0] * w1, dv[1] * w1]);
      const ym = -Hp / 2 + h / 2;
      sch.shape('polygon', { points: poly([add(a, [0, ym]), add(b, [0, ym]), add(b, [0, ym - h]), add(a, [0, ym - h])]), class: cls });
    } else {
      const fr = Math.min(ta / (L * W), 0.9);
      const f = Math.sqrt(fr);
      const c0 = up(P0);
      const lx = Lp * f;
      const dd: Pt = [dv[0] * f, dv[1] * f];
      const o: Pt = [c0[0] + (Lp - lx) / 2 + (dv[0] * (1 - f)) / 2, c0[1] + (dv[1] * (1 - f)) / 2];
      sch.shape('polygon', { points: poly([o, add(o, [lx, 0]), add(add(o, [lx, 0]), dd), add(o, dd)]), class: cls });
    }
  }
  sch.wire([P0, P1, P2]).wire([up(P0), up(P1), up(P2), up(P3), up(P0)]).wire([P0, up(P0)]).wire([P1, up(P1)]).wire([P2, up(P2)]);
  sch.shape('polyline', { points: poly([P0, P3, P2]), class: 'sch-body', fill: 'none', 'stroke-dasharray': '3 3' }, 'back');
  sch.shape('line', { x1: P3[0], y1: P3[1], x2: up(P3)[0], y2: up(P3)[1], class: 'sch-body', 'stroke-dasharray': '3 3' }, 'back');

  // dimensions
  sch.dim([P0[0], yb + 12], [P1[0], yb + 12], `L ${si(s.length, 'm', 3)}`, { off: -16 });
  sch.dim([x0 - 12, yb], [x0 - 12, yb - Hp], `H ${si(s.height, 'm', 3)}`, { off: 6, anchor: 'end' });
  sch.text(P1[0] + 12, 250, `W ${si(s.width, 'm', 3)} deep`, 'sch-label', 'start');

  // legend: surfaces and the result
  const lx = 306;
  let y = 30;
  const line = (t: string, cls = 'sch-value') => {
    sch.text(lx, y, t, cls, 'start');
    y += 14;
  };
  const shown = s.surfaces.slice(0, 6);
  for (const x of shown) {
    const name = MATERIAL[x.material]?.short ?? 'custom α';
    line(x.cover === 'rest' ? `${x.on}: ${name}` : `+ ${+Number(x.area).toPrecision(3)} m² ${name}`, x.cover === 'rest' ? 'sch-value' : 'sch-hint');
  }
  if (s.surfaces.length > shown.length) line(`+ ${s.surfaces.length - shown.length} more`, 'sch-hint');
  y += 4;
  line(`treatment ${+Number(ta).toPrecision(3)} m²`, `sch-label${solvedT ? ' solved' : ''}`);
  line(MATERIAL[s.treatMat]?.short ?? '', solvedT ? 'sch-value solved' : 'sch-value');
  line(`on the ${s.treatOn}`, solvedT ? 'sch-value solved' : 'sch-value');
  y += 4;
  if (d) {
    // red when the target cannot be met on this surface (the area is clamped at the whole free area)
    const short = r.status?.text === 'TARGET NOT MET';
    line(`RT60 ${si(d.tm, 's', 3)}`, `sch-label${short ? ' hl' : s.solveFor === 'rt60' ? ' solved' : ''}`);
    if (short) line(`target ${si(s.rt60, 's', 3)} not met`, 'sch-value hl');
    line(`V ${+d.v.toPrecision(3)} m³`, 'sch-value');
  } else if (r.error) line('no solution', 'sch-caption hl');
  void wallArea;
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: Rt60State, r) => room(s, r) },
};

export default mod;
