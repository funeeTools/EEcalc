/** Eye sketch: one UI between two crossings, the TJ spread at each crossing, DJ edges and the setup/hold window. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { fBer, type JitterState } from './def';

interface Details {
  rj: number;
  dj: number;
  tj: number;
  ber: number;
  ui: number;
  margin: number;
  rate: number;
}

export function eyeDiagram(s: JitterState, r: CalcReport): SVGSVGElement | null {
  const det = r.ok ? (r.details as Details | undefined) : undefined;
  const W = 440;
  const H = 236;
  const sch = new Schematic(W, H);
  const tone = (k: string) => (k === s.solveFor ? (r.ok ? 'solved' : 'hl') : '');
  const rj = det?.rj ?? s.rj;
  const dj = det?.dj ?? s.dj;
  const tj = det?.tj ?? s.tj;
  const ui = det?.ui ?? 1 / s.rate;
  if (!(ui > 0) || !(tj >= 0)) return null;
  const closed = det ? det.margin < -1e-9 * ui : false;

  const xL = 72;
  const xR = 368;
  const uiPx = xR - xL;
  const top = 58;
  const bot = 134;
  const mid = (top + bot) / 2;
  const px = (t: number) => Math.min((t / ui) * uiPx, 1.4 * uiPx);
  const sTJ = px(tj);
  const sDJ = px(dj);
  const wT = 20;

  // jitter zones (behind everything)
  for (const c of [xL, xR]) {
    const x0 = Math.max(c - sTJ / 2, 14);
    const x1 = Math.min(c + sTJ / 2, W - 14);
    if (x1 > x0) sch.shape('rect', { x: x0, y: top, width: x1 - x0, height: bot - top, class: closed ? 'xs-hot' : 'xs-cool' }, 'back');
  }
  // rails
  sch.wire([[14, top], [W - 14, top]]);
  sch.wire([[14, bot], [W - 14, bot]]);
  // edges at −TJ/2, −DJ/2, +DJ/2, +TJ/2 around each crossing
  const offs = [-sTJ / 2, -sDJ / 2, sDJ / 2, sTJ / 2];
  for (const c of [xL, xR]) {
    for (const o of offs) {
      const x = c + o;
      if (x - wT < 14 || x + wT > W - 14) continue;
      sch.wire([[x - wT, bot], [x + wT, top]], closed ? 'hl' : '');
      sch.wire([[x - wT, top], [x + wT, bot]], closed ? 'hl' : '');
    }
  }
  // receiver setup + hold window, centred in the eye
  const win = px(s.tsu + s.th);
  if (win > 0) sch.shape('rect', { x: (xL + xR) / 2 - win / 2, y: mid - 16, width: win, height: 32, class: closed ? 'sch-fill-hl' : 'sch-box', rx: 3 });
  sch.text((xL + xR) / 2, bot + 18, `t_su + t_h = ${si(s.tsu + s.th, 's', 3)}`, 'sch-hint');

  // TJ dimension over the left crossing
  const tjTxt = `TJ = ${s.solveFor === 'tj' || det ? si(tj, 's', 4) : '—'}`;
  if (sTJ > 4) sch.dim([xL - sTJ / 2, top - 12], [xL + sTJ / 2, top - 12], '', { tone: tone('tj') });
  sch.text(Math.max(xL, 50), top - 22, tjTxt, `sch-label ${tone('tj')}`.trim());
  // margin
  if (det) sch.text(W - 16, top - 22, `margin ${si(det.margin, 's', 3)}`, `sch-value ${closed ? 'hl' : ''}`.trim(), 'end');

  // UI dimension
  const yd = 184;
  for (const x of [xL, xR]) sch.shape('line', { x1: x, y1: bot + 4, x2: x, y2: yd + 4, class: 'sch-dim' }, 'back');
  sch.dim([xL, yd], [xR, yd], `UI = ${si(ui, 's', 4)} (${si(1 / ui, 'b/s', 4)})`, { tone: tone('rate') });

  // components
  const comp = (k: 'rj' | 'dj') => (s.mode === 'budget' || s.solveFor === k ? (r.ok ? 'solved' : 'hl') : '');
  sch.text(16, 220, `RJ = ${si(rj, 's', 3)} rms`, `sch-value ${comp('rj')}`.trim(), 'start');
  sch.text(160, 220, `DJ = ${si(dj, 's', 3)} (δδ)`, `sch-value ${comp('dj')}`.trim(), 'start');
  sch.text(W - 16, 220, `BER ${fBer(det?.ber ?? s.ber)}`, `sch-value ${tone('ber')}`.trim(), 'end');
  return sch.svg();
}
