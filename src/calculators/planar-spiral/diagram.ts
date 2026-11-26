/**
 * Top view of the printed spiral: bare copper on bare laminate, drawn to scale from n, d_out, w and s, with
 * the via at the inner end and the under-pass on the other layer (dashed edges, under the turns) back out to
 * terminal 2. Materials from the shared PCB kit (core/schematic/pcb.ts).
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { SpiralState } from './def';
import { SIDES, innerDiameter } from './model';

type P = [number, number];
const fLen = (m: number) => si(m, 'm', 3);
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const pts = (a: P[]) => a.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');

/** Intersection of the lines n₁·x = a₁ and n₂·x = a₂ (unit normals at angles φ₁, φ₂). */
function meet(f1: number, a1: number, f2: number, a2: number): P {
  const c1 = Math.cos(f1);
  const s1 = Math.sin(f1);
  const c2 = Math.cos(f2);
  const s2 = Math.sin(f2);
  const det = c1 * s2 - s1 * c2;
  return [(a1 * s2 - a2 * s1) / det, (c1 * a2 - c2 * a1) / det];
}

/**
 * Outline of a polygonal spiral track (centre at the origin, screen y down, clockwise from the top side).
 * Side j lies on the line with outward normal angle φ_j = −π/2 + 2πj/N at apothem a_j = a₀ − p·j/N (the
 * centre line), so every full turn steps in by the pitch p. Offsetting each line by ±w/2 and intersecting
 * neighbours gives exact mitred edges. Returns the polygon, the start point on side 0 and the inner end.
 */
function polySpiral(N: number, sides: number, a0: number, p: number, w: number, lead: number): { poly: P[]; start: P; end: P } {
  const phi = (j: number) => -Math.PI / 2 + (2 * Math.PI * j) / N;
  // inward step per side: the pitch over a full turn, but never past the centre (a spacing much larger than d_out
  // with about one turn would otherwise step the last sides through the middle)
  const step = Math.min(p / N, (a0 - Math.max(w, 2)) / Math.max(sides - 1, 1));
  const a = (j: number, off: number) => a0 - step * j + off;
  // start: side 0 extended back (to the left) past its outer corner with side −1 by `lead`; both edges of the
  // lead end at the same x, so a wide track gets a square end, not a slanted one
  const xStart = Math.max(meet(phi(-1), a(-1, w / 2), phi(0), a(0, w / 2))[0] - lead, -160);
  const edge = (off: number) => {
    const out: P[] = [];
    out.push([xStart, -a(0, off)]);
    for (let j = 0; j < sides - 1; j++) out.push(meet(phi(j), a(j, off), phi(j + 1), a(j + 1, off)));
    // end: a square cap across the last side, at its centre-line corner with the (virtual) next side
    const c = meet(phi(sides - 1), a(sides - 1, 0), phi(sides), a(sides, 0));
    const f = phi(sides - 1);
    out.push([c[0] + off * Math.cos(f), c[1] + off * Math.sin(f)]);
    return out;
  };
  const outer = edge(w / 2);
  const inner = edge(-w / 2);
  const mid = edge(0);
  return { poly: [...outer, ...inner.reverse()], start: mid[0], end: mid[mid.length - 1] };
}

/** Archimedean spiral track (circular coil), clockwise from the top, with a straight lead to the left. */
function circSpiral(turns: number, r0: number, p: number, w: number, lead: number): { poly: P[]; start: P; end: P } {
  p = Math.min(p, (r0 - Math.max(w, 2)) / Math.max(turns, 1e-9)); // never spiral through the centre
  const steps = Math.max(24, Math.round(72 * turns));
  const outer: P[] = [];
  const inner: P[] = [];
  const mid: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const th = (2 * Math.PI * turns * i) / steps; // 0 at the top, clockwise
    const r = r0 - (p * th) / (2 * Math.PI);
    const ux = Math.sin(th);
    const uy = -Math.cos(th);
    mid.push([r * ux, r * uy]);
    outer.push([(r + w / 2) * ux, (r + w / 2) * uy]);
    inner.push([(r - w / 2) * ux, (r - w / 2) * uy]);
  }
  outer.unshift([outer[0][0] - lead, outer[0][1]]);
  inner.unshift([inner[0][0] - lead, inner[0][1]]);
  mid.unshift([mid[0][0] - lead, mid[0][1]]);
  return { poly: [...outer, ...inner.reverse()], start: mid[0], end: mid[mid.length - 1] };
}

export function spiralDiagram(s: SpiralState, r: CalcReport): SVGSVGElement | null {
  const sch = new Schematic(460, 330);
  const solved = s.solveFor;
  const ok = r.ok;
  const tone = (k: string) => (k === solved ? (ok ? 'solved' : 'hl') : '');
  const n = Math.max(s.n, 1);
  const din = innerDiameter({ shape: s.shape, n, dout: s.dout, w: s.w, s: s.s });
  const drawable = s.dout > 0 && s.w > 0 && s.s > 0 && din > 0;

  // ── layout: the coil is D px across the flats, centred on (cx, cy); flat sides at top and bottom
  const D = 196;
  const cx = 192;
  const cy = 170;
  const k = D / s.dout;
  // turn pitch and width in px, to scale (so d_in drawn matches d_in labelled); a very fine track is drawn at least
  // 0.6 px wide inside its pitch, and dense coils read as a block of copper, as they do on the board
  const pPx = (s.w + s.s) * k;
  const wPx = Math.min(Math.max(s.w * k, 0.6), pPx * 0.85);
  const N = SIDES[s.shape];
  const sides = N ? Math.max(1, Math.round(n * N)) : 0;
  const leadPx = 40;
  const halfX = N ? D / 2 / Math.cos(Math.PI / N) : D / 2; // horizontal half-extent (hexagon: to the vertex)
  const xRight = cx + (N === 4 || N === 8 || N === 0 ? D / 2 : halfX);

  // board: bare laminate
  pcbRect(sch, 'fr4Bare', 14, 30, 432, 262, { layer: 'back', rx: 3 });

  if (drawable) {
    const a0 = D / 2 - wPx / 2;
    const sp = N ? polySpiral(N, sides, a0, pPx, wPx, leadPx) : circSpiral(n, a0, pPx, wPx, leadPx);
    const tr = (q: P): P => [cx + q[0], cy + q[1]];
    const end = tr(sp.end);
    const start = tr(sp.start);
    // under-pass on the other layer (faded copper, dashed edge): from the inner via straight left to a via outside
    // the coil. Vias are clamped to a legible size whatever the track width.
    const viaR = clamp(wPx * 0.6, 3.5, 8);
    const xOut = Math.max(cx - halfX - 22, 14 + viaR + 18);
    const yU = end[1];
    const uw = clamp(wPx, 3, 2 * viaR);
    pcbRect(sch, 'cuHidden', xOut, yU - uw / 2, end[0] - xOut, uw);
    // the spiral on top of it
    pcbShape(sch, 'cu', 'polygon', { points: pts(sp.poly.map(tr)) });
    // vias (copper ring + drill) at both ends of the under-pass; pad for terminal 1 at the end of the lead
    for (const [x, y] of [end, [xOut, yU] as P]) {
      pcbShape(sch, 'cu', 'circle', { cx: x, cy: y, r: viaR });
      pcbShape(sch, 'hole', 'circle', { cx: x, cy: y, r: viaR * 0.45 });
    }
    const padH = clamp(wPx + 4, 12, 2 * viaR + 6);
    pcbRect(sch, 'cu', start[0] - 12, start[1] - padH / 2, 14, padH, { rx: 1.5 });
    sch.text(start[0] - 16, start[1] + 4, '1', 'sch-label sch-halo', 'end');
    sch.text(xOut - viaR - 4, yU + 4, '2', 'sch-label sch-halo', 'end');
    sch.text(xOut - 6, yU + uw / 2 + 16, 'under-pass', 'sch-hint sch-halo', 'start');

    // ── w and s: labels above the coil, arrows down to the top side of the outer turn and the first gap. Both land
    // on the flat top side of every shape (an octagon's top flat spans ±0.21·D); positions clear of the end via.
    const yTop = cy - D / 2;
    const clear = (x: number) => Math.abs(x - end[0]) > viaR + 6 || Math.abs(end[1] - (yTop + pPx)) > viaR + pPx;
    const cand = [-0.14, 0.14, -0.04, 0.06, -0.19, 0.19].map((f) => cx + f * D).filter(clear);
    const [xa, xb] = cand.length >= 2 ? [Math.min(cand[0], cand[1]), Math.max(cand[0], cand[1])] : [cx - 0.14 * D, cx + 0.14 * D];
    const xw = xa;
    const xs = xb;
    sch.arrow([xw, 44], [xw, yTop + wPx / 2], { head: 6 });
    sch.text(xw - 5, 48, `w = ${fLen(s.w)}`, 'sch-label sch-halo', 'end');
    const yGap = Math.min(yTop + wPx + (pPx - wPx) / 2, cy - 12); // (a spacing wider than the coil: stop at the centre)
    sch.arrow([xs, 44], [xs, yGap], { head: 6 });
    sch.text(xs + 5, 48, `s = ${fLen(s.s)}`, 'sch-label sch-halo', 'start');
    // ── d_out: vertical dimension right of the coil, flat to flat; d_in across the hole if there is room
    const xD = xRight + 16;
    const xCorner = cx + (N ? (D / 2) * Math.tan(Math.PI / N) : 0);
    sch.shape('line', { x1: xCorner + 2, y1: yTop, x2: xD + 4, y2: yTop, class: 'sch-dim' });
    sch.shape('line', { x1: xCorner + 2, y1: yTop + D, x2: xD + 4, y2: yTop + D, class: 'sch-dim' });
    sch.dim([xD, yTop], [xD, yTop + D], '', { tone: tone('dout') });
    sch.text(xD + 8, cy - 2, 'd_out', `sch-label sch-halo ${tone('dout')}`.trim(), 'start');
    sch.text(xD + 8, cy + 15, solved === 'dout' && !ok ? '—' : fLen(s.dout), `sch-value sch-halo ${tone('dout')}`.trim(), 'start');
    const dinPx = din * k;
    if (dinPx > 46) {
      // across the hole, at a height clear of the inner via
      const yd = [cy + 8, cy - 22, cy + 30].find((y) => Math.abs(y - end[1]) > viaR + 4 && Math.abs(y + 16 - end[1]) > viaR + 6) ?? cy + 8;
      sch.dim([cx - dinPx / 2 + 3, yd], [cx + dinPx / 2 - 3, yd], '', {});
      sch.text(cx, yd + 16, `d_in = ${fLen(din)}`, 'sch-value sch-halo', 'middle');
    }
    // ── right column: turns and copper
    const xc = 352;
    sch.text(xc, 84, `n = ${solved === 'n' && !ok ? '—' : n.toPrecision(3)}`, `sch-label sch-halo ${tone('n')}`.trim(), 'start');
    sch.text(xc, 98, 'turns', `sch-value sch-halo ${tone('n')}`.trim(), 'start');
    sch.text(xc, 244, `t = ${fLen(s.t)}`, 'sch-value sch-halo', 'start');
    sch.text(xc, 258, `${s.shape} spiral`, 'sch-hint sch-halo', 'start');
  } else {
    sch.text(230, 160, 'the turns do not fit in d_out', 'sch-label hl sch-halo', 'middle');
  }

  // ── header: L (and Q)
  const L = r.results.find((x) => x.key === 'l');
  const Q = r.results.find((x) => x.key === 'q');
  sch.text(14, 20, `L = ${ok && L ? L.display : solved === 'l' ? '—' : si(s.l, 'H', 4)}`, `sch-caption ${tone('l')}`.trim(), 'start');
  if (ok && Q) sch.text(150, 20, `Q ≈ ${Q.display} at ${si(s.f, 'Hz', 3)}`, 'sch-caption', 'start');
  pcbLegend(sch, 14, 306, ['cu', 'cuHidden', 'fr4Bare', 'hole'], { cols: 2, colW: 190, names: { cu: 'Copper' } });
  return sch.svg();
}
