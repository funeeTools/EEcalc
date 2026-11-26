/**
 * Maximum pad diameter, top view: two neighbouring pads on the pitch with the N traces (under mask) between them,
 * everything along the centre line on one scale. Dimensions: p above, D and the first clearance / trace below. A
 * plated hole shows its drill and finished hole, and the IPC minimum land as a dashed circle on each pad (red when
 * the pad is smaller than it).
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type MaxPadState, holeMin } from './def';

const ORDER: PcbMat[] = ['mask', 'maskCu', 'cu', 'gold', 'fr4Bare', 'hole'];

export function maxPadDiagram(s: MaxPadState, r: CalcReport): SVGSVGElement | null {
  if (!(s.p > 0) || !(s.d > 0) || !(s.s > 0)) return null;
  const sch = new Schematic(460, 300);
  const failed = !r.ok;
  const tone = (k: MaxPadState['solveFor']) => (s.solveFor === k ? (failed ? 'hl' : 'solved') : '');
  const val = (k: MaxPadState['solveFor'], txt: string) => (failed && s.solveFor === k ? '—' : txt);
  const fmt = (m: number) => si(m, 'm', 3);
  const mats = new Set<PcbMat>(['mask']);
  const n = Math.max(0, Math.round(s.n));
  const hm = s.padType === 'pth' && s.fhs > 0 ? holeMin(s) : null;
  const below = !!hm && s.d < hm.dMin * (1 - 1e-9);

  // ── one scale along the centre line: two pads (with their mask openings) must fit the panel width
  const x0 = 16;
  const x1 = 444;
  const yT = 72;
  const yB = 214;
  const cy = (yT + yB) / 2;
  const open = s.d + 2 * Math.max(s.maskExp, 0);
  const outer = Math.max(open, hm ? hm.dMin : 0, s.d);
  const k = Math.min((x1 - x0 - 30) / (s.p + outer), (yB - yT - 18) / outer);
  const P = s.p * k;
  const xm = (x0 + x1) / 2;
  const xc = [xm - P / 2, xm + P / 2];
  const rPad0 = (s.d * k) / 2;
  const rPad = Math.max(rPad0, 4);
  const enlarged = rPad0 < 4;
  const rOpen = Math.max((open * k) / 2, rPad);

  pcbRect(sch, 'mask', x0, yT, x1 - x0, yB - yT, { layer: 'back' });
  // traces under mask through the gap (behind the openings, which they never reach when the rule is met)
  const xa = xc[0] + rPad;
  const wPx0 = s.w * k;
  const wPx = Math.max(wPx0, 1.5);
  const sPx = s.s * k;
  const lanes = Array.from({ length: Math.min(n, 12) }, (_, i) => xa + sPx + wPx0 / 2 + i * (wPx0 + sPx));
  for (const lx of lanes) {
    mats.add('maskCu');
    pcbRect(sch, 'maskCu', lx - wPx / 2, yT, wPx, yB - yT);
  }
  for (const cx of xc) {
    if (rOpen > rPad + 0.3) {
      mats.add('fr4Bare');
      pcbShape(sch, 'fr4Bare', 'circle', { cx, cy, r: rOpen });
    }
    mats.add('gold');
    pcbShape(sch, 'gold', 'circle', { cx, cy, r: rPad }, { tone: s.solveFor === 'd' && !failed ? 'solved' : below ? 'hl' : '' });
    if (hm) {
      const rDrill = Math.min(Math.max(((s.fhs + s.allow) * k) / 2, 2.5), rPad - 1);
      const rFin = Math.min(Math.max((s.fhs * k) / 2, 1.5), rDrill - 0.8);
      if (rDrill > 1.5) {
        mats.add('cu');
        pcbShape(sch, 'cu', 'circle', { cx, cy, r: rDrill });
      }
      mats.add('hole');
      pcbShape(sch, 'hole', 'circle', { cx, cy, r: Math.max(rFin, 1) });
      // IPC minimum land: dashed ring (red when the pad does not reach it)
      sch.shape('circle', { cx, cy, r: (hm.dMin * k) / 2, class: `sch-arrow dashed ${below ? 'hl' : ''}`.trim(), fill: 'none' });
    }
  }

  // ── dimensions: p above (between centre ticks), D and the first clearance / trace below
  const yP = yT - 10;
  for (const cx of xc) sch.shape('line', { x1: cx, y1: yT + 4, x2: cx, y2: yP - 4, class: 'sch-dim' });
  sch.dim([xc[0], yP], [xc[1], yP], `p = ${val('p', fmt(s.p))}`, { tone: tone('p') });
  const yD = yB + 14;
  for (const x of [xc[0] - rPad, xc[0] + rPad]) sch.shape('line', { x1: x, y1: cy, x2: x, y2: yD + 4, class: 'sch-dim' });
  sch.dim([xc[0] - rPad, yD], [xc[0] + rPad, yD], '', { tone: tone('d') });
  sch.text(xc[0], yD + 16, `D = ${val('d', fmt(s.d))}`, `sch-label ${tone('d')}`.trim(), 'middle');
  const xb = xc[1] - rPad;
  const gapPx = xb - xa;
  if (gapPx > 2) {
    sch.shape('line', { x1: xa, y1: yB, x2: xa, y2: yD + 4, class: 'sch-dim' });
    if (lanes.length) {
      const l0 = lanes[0];
      sch.shape('line', { x1: l0 - wPx / 2, y1: yB, x2: l0 - wPx / 2, y2: yD + 4, class: 'sch-dim' });
      sch.shape('line', { x1: l0 + wPx / 2, y1: yB, x2: l0 + wPx / 2, y2: yD + 4, class: 'sch-dim' });
      sch.dim([xa, yD], [l0 - wPx / 2, yD], '', { tone: tone('s') });
      sch.dim([l0 - wPx / 2, yD], [l0 + wPx / 2, yD], '', { tone: tone('w') });
    } else {
      sch.shape('line', { x1: xb, y1: yB, x2: xb, y2: yD + 4, class: 'sch-dim' });
      sch.dim([xa, yD], [xb, yD], '', { tone: tone('s') });
    }
  }
  // values of the gap dimensions on one line under the gap, clear of the D label
  const gx = Math.max((xa + xb) / 2, xc[0] + 58);
  const sTxt = `s = ${val('s', fmt(s.s))}`;
  sch.text(lanes.length ? gx - 4 : gx, yD + 32, sTxt, `sch-label ${tone('s')}`.trim(), lanes.length ? 'end' : 'middle');
  if (lanes.length) sch.text(gx + 4, yD + 32, `W = ${val('w', fmt(s.w))}`, `sch-label ${tone('w')}`.trim(), 'start');

  // ── header
  const solvedTxt: Record<MaxPadState['solveFor'], string> = {
    d: `D_max = ${val('d', fmt(s.d))}`,
    p: `p_min = ${val('p', fmt(s.p))}`,
    s: `s_max = ${val('s', fmt(s.s))}`,
    w: `W_max = ${val('w', fmt(s.w))}`,
  };
  sch.text(x0, 18, `${solvedTxt[s.solveFor]}  ·  ${n === 0 ? 'pad to pad' : `${n} trace${n > 1 ? 's' : ''} between`}`, `sch-caption ${tone(s.solveFor)}`.trim(), 'start');
  if (hm) sch.text(x0, 33, `dashed: IPC-2221 minimum land D_min = ${fmt(hm.dMin)} for the ${fmt(s.fhs)} hole${below ? ' (pad too small)' : ''}`, `sch-hint ${below ? 'hl' : ''}`.trim(), 'start');
  else sch.text(x0, 33, 'surface lands, mask openings shown around the pads', 'sch-hint', 'start');
  const scale = enlarged ? 'pads enlarged to be visible' : wPx0 < 1.5 && n > 0 ? 'to scale · traces widened' : 'to scale';
  sch.text(x1, 18, scale, 'sch-hint', 'end');

  const names: Partial<Record<PcbMat, string>> = { maskCu: 'Trace under mask', gold: 'Pad (ENIG)', cu: 'Hole plating', fr4Bare: 'Bare laminate' };
  const shown = ORDER.filter((m) => mats.has(m));
  pcbLegend(sch, x0, 278, shown, { cols: 3, colW: 146, names });
  return sch.svg();
}
