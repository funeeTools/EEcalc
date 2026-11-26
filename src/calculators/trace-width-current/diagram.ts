/**
 * PCB cross-section: trace W × T on an outer layer (under solder mask, in air) or buried in the laminate,
 * with I, ΔT and ambient. Materials come from the shared PCB kit (core/schematic/pcb.ts); the heated zone
 * round the conductor is a tint behind the materials, not a material.
 *
 * W and T share one scale, so the copper keeps its true proportions. A trace too wide for the drawing at
 * a visible thickness runs past both edges (the mask edges are cut off) and its W dimension becomes
 * outward arrows to the edges.
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { type PcbMat, pcbLegend, pcbRect } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { TraceState } from './def';

const OZ = 34.79e-6;

export function traceDiagram(s: TraceState, r: CalcReport): SVGSVGElement | null {
  if (!(s.w > 0) || !(s.t > 0)) return null;
  const sch = new Schematic(460, 262);
  const external = s.layer !== 'internal';
  const res = r.results.find((x) => x.key === s.solveFor && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === s.solveFor ? (failed ? 'hl' : 'solved') : '');
  // "W = 1.2 mm", or the solver's verdict ("W > 1 m", "W = —") when it found no answer
  const eq = (sym: string, k: string, txt: string) => {
    const v = k === s.solveFor && failed ? (res?.display ?? '—') : txt;
    return /^[<>]/.test(v) ? `${sym} ${v}` : `${sym} = ${v}`;
  };
  const det = r.ok && !failed ? (r.details as { tCond: number; outsideChart: string[] } | undefined) : undefined;
  const xL = 20;
  const xR = 440;

  // ── geometry: one scale k (px per metre) for W and T. The copper is at most T_MAX thick and W_MAX
  // wide; if fitting the width would leave it thinner than T_MIN, keep T_MIN and let the width run off.
  const W_MAX = 300;
  const T_MAX = 40;
  const T_MIN = 5;
  let k = Math.min(T_MAX / s.t, W_MAX / s.w);
  if (k * s.t < T_MIN) k = T_MIN / s.t;
  const tPx = k * s.t;
  const cut = k * s.w > W_MAX + 0.5;
  const narrow = !cut && k * s.w < 3; // thicker than wide beyond what fits: widen it just enough to see
  const wPx = cut ? xR - xL : Math.max(k * s.w, 3);
  const cx = cut ? (xL + xR) / 2 : 200;
  const xl = cx - wPx / 2;
  const xr = cx + wPx / 2;
  const subTop = external ? 150 : 100;
  const subBot = 210;
  const yBot = external ? subTop : (subTop + subBot) / 2 + tPx / 2;
  const yTop = yBot - tPx;
  const hot = det != null && det.tCond > 105;
  // solder mask about 20 µm, on the same scale where that stays legible
  const m = Math.min(Math.max(k * 20e-6, 3), 8);

  pcbRect(sch, 'fr4', xL, subTop, xR - xL, subBot - subTop, { layer: 'back' });
  // heated zone round the conductor, behind the copper and mask
  sch.shape('ellipse', { cx, cy: yBot - tPx / 2, rx: Math.min(wPx / 2 + 22, (xR - xL) / 2), ry: tPx / 2 + 16, class: 'xs-hot' }, 'back');
  if (external) {
    // conformal solder mask: strips either side, then a cap over the trace (only the cap when cut)
    if (!cut) {
      pcbRect(sch, 'mask', xL, subTop - m, xl - m - xL, m);
      pcbRect(sch, 'mask', xr + m, subTop - m, xR - xr - m, m);
    }
    pcbRect(sch, 'mask', cut ? xL : xl - m, yTop - m, cut ? xR - xL : wPx + 2 * m, tPx + m);
  }
  pcbRect(sch, 'cu', xl, yTop, wPx, tPx);

  // W above the trace (and its mask), T to its right (inside the drawing when the trace is cut)
  const yW = yTop - (external ? m : 0) - (cut ? 20 : 12); // cut: the arrow ends clear of the 'air' note
  const wLabel = eq('W', 'w', si(s.w, 'm', 4));
  if (cut) {
    // wider than the drawing: arrows from the label out to both edges
    const half = wLabel.length * 3.4 + 8;
    sch.text(cx, yW + 4, wLabel, `sch-label sch-halo ${tone('w')}`.trim(), 'middle');
    sch.arrow([cx - half, yW], [xL, yW], { head: 6, tone: tone('w') });
    sch.arrow([cx + half, yW], [xR, yW], { head: 6, tone: tone('w') });
  } else if (external) sch.dim([xl, yW], [xr, yW], wLabel, { tone: tone('w') });
  else {
    // inside the laminate: the same dimension, with its label haloed over the material
    sch.dim([xl, yW], [xr, yW], '', { tone: tone('w') });
    sch.text(cx, yW - 10, wLabel, `sch-label sch-halo ${tone('w')}`.trim(), 'middle');
  }
  const xT = cut ? xR - 92 : xr + (external ? m : 0) + 10;
  sch.dim([xT, yTop], [xT, yBot], '', {});
  // outer layer: beside the top of the trace, clear of the mask; inner (or cut): haloed over the material
  if (external && !cut) sch.text(xT + 8, Math.min(yTop + 6, subTop - m - 4), `T = ${si(s.t, 'm', 3)}`, 'sch-label', 'start');
  else sch.text(xT + 8, yBot - tPx / 2 + 4, `T = ${si(s.t, 'm', 3)}`, 'sch-label sch-halo', 'start');
  // how the copper is drawn (nothing to say when the width is the answer and none was found)
  if (!(failed && s.solveFor === 'w')) {
    const scale = cut ? 'to scale · runs past both edges' : narrow ? 'W widened to be visible' : 'W and T to scale';
    sch.text(xL, subBot + 16, scale, 'sch-hint', 'start');
  }

  // ── current (out of the page) and temperatures across the top
  sch.shape('circle', { cx: 28, cy: 46, r: 7, class: 'sch-body', fill: 'var(--sch-fill)' });
  sch.shape('circle', { cx: 28, cy: 46, r: 1.8, class: 'sch-dot' });
  sch.text(42, 50, eq('I', 'i', si(s.i, 'A', 4)), `sch-label ${tone('i')}`.trim(), 'start');
  sch.text(xL, 22, `Ambient T_A = ${+s.ta.toPrecision(4)} °C`, 'sch-hint', 'start');
  sch.text(xR, 22, `IPC-2221 · ${external ? 'external' : 'internal'} layer · ${+(s.t / OZ).toFixed(2)} oz`, 'sch-hint', 'end');
  sch.text(xR, 50, eq('ΔT', 'dT', `${+s.dT.toPrecision(3)} °C`), `sch-label ${tone('dT')}`.trim(), 'end');
  if (det) sch.text(xR, 64, `conductor ${det.tCond.toFixed(1)} °C`, hot ? 'sch-value hl' : 'sch-value', 'end');

  // ── surroundings and verdicts
  if (external) sch.text(xL + 4, subTop - m - 8, 'air', 'sch-hint', 'start');
  else sch.text(xL + 4, subTop - 8, 'trace on an inner layer, laminate all round', 'sch-hint', 'start');
  if (det?.outsideChart.length) sch.text(xR, subBot + 16, 'outside the IPC-2221 chart range', 'sch-value hl', 'end');
  else if (hot) sch.text(xR, subBot + 16, 'above the FR-4 temperature rating', 'sch-value hl', 'end');
  const mats: PcbMat[] = external ? ['mask', 'cu', 'fr4'] : ['cu', 'fr4'];
  pcbLegend(sch, xL, 250, mats, { cols: 3, colW: 140 });
  return sch.svg();
}
