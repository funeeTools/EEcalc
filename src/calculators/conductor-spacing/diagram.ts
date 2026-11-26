/**
 * Two conductors at different voltages, drawn twice with the gap d lined up: a top view (above) and the
 * section A–A through them (below). The materials follow the IPC-2221B condition: inner layer (in the
 * laminate), outer layer bare, under solder mask, under conformal coat, or component leads.
 *
 * Conformal coat is the kit's translucent `coat` film; inner-layer conductors seen from above are `cuHidden`.
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type SpacingState, columnsFor } from './def';
import { ALT_LIMIT } from './model';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function spacingDiagram(s: SpacingState, r: CalcReport): SVGSVGElement {
  const sch = new Schematic(460, 304);
  const failed = !r.ok;
  const solvedD = s.solveFor === 'd';
  const tone = failed ? 'hl' : 'solved';
  const cond = s.cond;
  const leads = cond === 'A6' || cond === 'A7';
  const coat = cond === 'A5' || cond === 'A7';
  const internal = cond === 'B1';
  const masked = cond === 'B4';
  const cols = columnsFor(s);
  const colName = cols.length > 1 ? 'A6 + B3' : cols[0];

  // Gap: log-scaled so 0.05 mm … 1 m all read (0.25 mm ↔ 40 px); conductors 70 px wide.
  const g = clamp(40 + 45 * Math.log10(Math.max(s.d, 1e-9) / 0.25e-3), 18, 210);
  const cw = 70;
  const cx = 230;
  const xa0 = cx - g / 2 - cw; // left conductor
  const xa1 = cx - g / 2;
  const xb0 = cx + g / 2; // right conductor
  const xb1 = cx + g / 2 + cw;
  const xL = 30;
  const xR = 430;
  const dTxt = `d = ${failed && solvedD ? '—' : si(s.d, 'm', 3)}`;
  const vPk = s.v * (s.vKind === 'rms' ? Math.SQRT2 : 1);
  const vTxt = failed && !solvedD ? 'V = —' : `${si(s.v, 'V', 3)}${s.vKind === 'rms' ? ' RMS' : ''}`;
  const mats = new Set<PcbMat>();
  const put = (m: PcbMat, x: number, y: number, w: number, h: number, o: { rx?: number; layer?: 'back' | 'front' } = {}) => {
    mats.add(m);
    pcbRect(sch, m, x, y, w, h, o);
  };
  const film = (d: string) => {
    mats.add('coat');
    pcbShape(sch, 'coat', 'path', { d });
  };

  // ── header
  sch.text(xL, 20, `${solvedD ? dTxt.replace('d =', 'd ≥') : `V ≤ ${vTxt}`}`, `sch-caption ${tone}`, 'start');
  sch.text(xL + 128, 20, `${colName} · ${solvedD ? vTxt : dTxt}${s.vKind === 'rms' && !(failed && !solvedD) ? ` (${si(vPk, 'V', 3)} pk)` : ''}`, 'sch-label', 'start');
  const where = internal ? 'inner layer: the laminate insulates' : leads ? (coat ? 'component leads under conformal coat' : 'bare component leads in air') : masked ? 'outer layer under solder mask' : coat ? 'outer layer under conformal coat' : 'bare outer-layer copper in air';
  const alt = s.alt > ALT_LIMIT ? ` · ${si(s.alt, 'm', 3)} altitude` : '';
  sch.text(xL, 37, `${where}${alt}`, 'sch-hint', 'start');

  // ── top view
  const yT0 = 58;
  const yT1 = 132;
  sch.text(xL, 52, 'top view', 'sch-hint', 'start');
  put(leads || masked ? 'mask' : 'fr4Bare', xL, yT0, xR - xL, yT1 - yT0, { layer: 'back' });
  let yDimT = (yT0 + yT1) / 2;
  if (leads) {
    const lw = cw * 0.56;
    put('part', xa0 - 18, yT0 + 1, xb1 - xa0 + 36, 20, { rx: 2 });
    for (const x0 of [xa0, xb0]) {
      put('gold', x0, yT0 + 36, cw, yT1 - yT0 - 40, { rx: 2 });
      put('solder', x0 + (cw - lw) / 2, yT0 + 21, lw, yT1 - yT0 - 30, { rx: 3 });
    }
    yDimT = yT0 + 52;
    sch.text(cx, yT0 + 15, 'component body', 'sch-hint sch-halo', 'middle');
  } else {
    // inner-layer conductors are seen through the board: faded copper of another layer
    for (const x0 of [xa0, xb0]) put(internal ? 'cuHidden' : masked ? 'maskCu' : 'cu', x0, yT0, cw, yT1 - yT0);
  }
  if (coat) film(`M ${xL + 4} ${yT0 + 4} H ${xR - 4} V ${yT1 - 4} H ${xL + 4} Z`);
  // section line A–A
  sch.shape('line', { x1: xL - 6, y1: yT1 - 10, x2: xR + 6, y2: yT1 - 10, class: 'sch-dim', 'stroke-dasharray': '6 3' });
  sch.text(xR + 10, yT1 - 6, 'A', 'sch-hint', 'start');
  sch.text(xL - 12, yT1 - 6, 'A', 'sch-hint', 'middle');
  sch.dim([xa1, yDimT], [xb0, yDimT], '', { tone: solvedD ? tone : '' });
  sch.text(cx, yDimT - 7, dTxt, `sch-label sch-halo ${solvedD ? tone : ''}`.trim(), 'middle');
  sch.text(xa0 + cw / 2, yT1 - 16, 'V', 'sch-label sch-halo', 'middle');
  sch.text(xb0 + cw / 2, yT1 - 16, '0 V', 'sch-label sch-halo', 'middle');

  // ── section A–A
  sch.text(xL, 160, 'section A–A', 'sch-hint', 'start');
  const yB = 214; // board surface (top of the laminate under the conductors)
  const yBot = 252;
  const tc = 8;
  if (internal) {
    put('fr4', xL, 176, xR - xL, yBot - 176, { layer: 'back' });
    const yc = 214 - tc / 2;
    for (const x0 of [xa0, xb0]) put('cu', x0, yc, cw, tc);
    sch.dim([xa1, yc - 14], [xb0, yc - 14], '', { tone: solvedD ? tone : '' });
    sch.text(cx, yc - 21, dTxt, `sch-label sch-halo ${solvedD ? tone : ''}`.trim(), 'middle');
    sch.text(xR - 8, 190, 'laminate above and below', 'sch-hint sch-halo', 'end');
  } else {
    put('fr4', xL, yB, xR - xL, yBot - yB, { layer: 'back' });
    let top = yB - tc; // top of the conductors
    if (leads) {
      const mk = 4;
      // mask between and beside the pads, pulled back from the pad edges
      mats.add('mask');
      for (const [a, b] of [[xL, xa0 - 6], [xa1 + 6, xb0 - 6], [xb1 + 6, xR]]) if (b - a > 2) pcbRect(sch, 'mask', a, yB - mk, b - a, mk);
      for (const x0 of [xa0, xb0]) {
        put('cu', x0, yB - 6, cw, 6);
        put('gold', x0, yB - 8, cw, 2.5);
        // gull-wing foot on its solder fillet
        mats.add('solder');
        pcbShape(sch, 'solder', 'path', { d: `M ${x0 + 3} ${yB - 8} Q ${x0 + 8} ${yB - 21} ${x0 + cw / 2} ${yB - 22} Q ${x0 + cw - 8} ${yB - 21} ${x0 + cw - 3} ${yB - 8} Z` });
      }
      top = yB - 22;
    } else {
      for (const x0 of [xa0, xb0]) put('cu', x0, yB - tc, cw, tc);
      if (masked) {
        const m = 5;
        mats.add('mask');
        pcbShape(sch, 'mask', 'path', {
          d: `M ${xL} ${yB - m} L ${xa0 - 2} ${yB - m} L ${xa0 - 2} ${yB - tc - m} L ${xa1 + 2} ${yB - tc - m} L ${xa1 + 2} ${yB - m} L ${xb0 - 2} ${yB - m} L ${xb0 - 2} ${yB - tc - m} L ${xb1 + 2} ${yB - tc - m} L ${xb1 + 2} ${yB - m} L ${xR} ${yB - m} L ${xR} ${yB} L ${xb1} ${yB} L ${xb1} ${yB - tc} L ${xb0} ${yB - tc} L ${xb0} ${yB} L ${xa1} ${yB} L ${xa1} ${yB - tc} L ${xa0} ${yB - tc} L ${xa0} ${yB} L ${xL} ${yB} Z`,
        });
        top = yB - tc - m;
      }
    }
    if (coat) {
      const c = 7;
      film(`M ${xL} ${yB - c} L ${xa0 - 4} ${yB - c} Q ${xa0 - 4} ${top - c} ${xa0 + 8} ${top - c} L ${xa1 - 8} ${top - c} Q ${xa1 + 4} ${top - c} ${xa1 + 4} ${yB - c} L ${xb0 - 4} ${yB - c} Q ${xb0 - 4} ${top - c} ${xb0 + 8} ${top - c} L ${xb1 - 8} ${top - c} Q ${xb1 + 4} ${top - c} ${xb1 + 4} ${yB - c} L ${xR} ${yB - c} L ${xR} ${yB} L ${xL} ${yB} Z`);
      top -= c;
    }
    const yd = Math.min(top - 10, yB - tc - 12);
    sch.dim([xa1, yd], [xb0, yd], '', { tone: solvedD ? tone : '' });
    sch.text(cx, yd - 7, dTxt, `sch-label ${solvedD ? tone : ''}`.trim(), 'middle');
    if (!coat) sch.text(xR - 8, 176, masked ? 'mask fills the gap' : 'air', 'sch-hint', 'end');
    else sch.text(xR - 8, 176, 'coat fills the gap', 'sch-hint', 'end');
  }

  // ── legend (materials in kit order), then the conformal coat
  const order: PcbMat[] = ['mask', 'maskCu', 'cu', 'gold', 'paste', 'solder', 'fr4', 'fr4Bare', 'silk', 'hole', 'air', 'part', 'cuHidden', 'steel', 'coat', 'resin'];
  const shown = order.filter((m) => mats.has(m));
  const names: Partial<Record<PcbMat, string>> = { solder: 'Lead / solder', gold: 'Gold-plated pad', cuHidden: 'Inner-layer copper' };
  pcbLegend(sch, xL, 280, shown, { cols: 4, colW: 106, names });
  return sch.svg();
}
