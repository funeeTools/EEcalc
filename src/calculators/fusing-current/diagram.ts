/**
 * Fusing-current drawing: the conductor's cross-section glowing hot (a trace on the board, with its etch
 * profile, or a round wire in air) beside a sketch of the overload pulse (current I for time t).
 * Materials come from the shared PCB kit (core/schematic/pcb.ts).
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { type PcbMat, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import { type FuseState, OZ } from './def';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function fusingDiagram(s: FuseState, r?: CalcReport): SVGSVGElement {
  const sch = new Schematic(460, 250);
  const wire = s.conductor === 'wire';
  const key = wire && s.solveFor === 'w' ? 'd' : !wire && s.solveFor === 'd' ? 'w' : s.solveFor;
  const res = r?.results.find((x) => x.solved);
  const failed = !!r && (!r.ok || (res != null && res.value == null));
  const tone = (k: string) => (k === key ? (failed ? 'hl' : 'solved') : '');
  const eq = (sym: string, k: string, txt: string) => {
    const v = k === key && failed ? (res?.display ?? '—') : txt;
    return /^[<>]/.test(v) ? `${sym} ${v}` : `${sym} = ${v}`;
  };
  const melt = Math.abs(s.tm - 1083) < 0.5;
  const xL = 20;
  const xR = 440;

  // ── header
  sch.text(xL, 20, key === 'i' ? eq(melt ? 'I_fuse' : 'I', 'i', si(s.i, 'A', 4)) : key === 'dur' ? eq(melt ? 't_fuse' : 't', 'dur', si(s.dur, 's', 4)) : eq(key === 'w' ? 'W' : 'd', key, si(key === 'w' ? s.w : s.d, 'm', 4)), `sch-caption ${tone(key)}`.trim(), 'start');
  sch.text(xL, 36, `Onderdonk · ${+s.ta.toFixed(1)} °C → ${+s.tm.toFixed(1)} °C${melt ? ' (copper melts)' : ''}`, 'sch-hint', 'start');

  // ── pulse sketch, top right: current I held for time t
  const px0 = 290;
  const py0 = 102;
  const pw = 90;
  const ph = 48;
  sch.wire([[px0, py0], [px0 + 14, py0], [px0 + 14, py0 - ph], [px0 + 14 + pw, py0 - ph], [px0 + 14 + pw, py0], [xR - 6, py0]], tone('i') || tone('dur'));
  sch.arrow([px0 - 4, py0], [xR, py0], { head: 6 });
  sch.text(xR, py0 + 14, 'time', 'sch-hint', 'end');
  sch.text(px0 + 14 + pw / 2, py0 - ph - 8, eq('I', 'i', si(s.i, 'A', 3)), `sch-label ${tone('i')}`.trim(), 'middle');
  sch.dim([px0 + 14, py0 + 12], [px0 + 14 + pw, py0 + 12], eq('t', 'dur', si(s.dur, 's', 3)), { off: -6, tone: tone('dur') });

  // ── cross-section
  const mats: PcbMat[] = wire ? ['cu'] : ['mask', 'cu', 'fr4'];
  const ySurf = 186;
  if (wire) {
    const rPx = clamp(28 + 10 * Math.log10(Math.max(s.d, 1e-6) / 0.25e-3), 12, 46);
    const cx = 150;
    const cy = 150;
    // heat glow behind everything (a cue, not a material)
    sch.shape('circle', { cx, cy, r: rPx + 18, class: 'xs-hot' }, 'back');
    pcbShape(sch, 'cu', 'circle', { cx, cy, r: rPx });
    sch.dim([cx - rPx, cy + rPx + 14], [cx + rPx, cy + rPx + 14], eq('d', 'd', si(s.d, 'm', 4)), { off: -6, tone: tone('d') });
    sch.text(cx + rPx + 30, cy - 4, 'bare copper wire', 'sch-hint', 'start');
    sch.text(cx + rPx + 30, cy + 10, 'in air', 'sch-hint', 'start');
  } else {
    const q = s.w / s.t;
    const wPx = clamp(q * 14, 90, 220);
    const tPx = clamp(wPx / q, 14, 44);
    // etch undercut per side at the top, in px; a trace narrower than 2T/EF is a ridge that never reaches T
    const cut = s.ef > 0 ? (wPx / s.w) * (s.t / s.ef) : 0;
    const ridge = s.ef > 0 && s.w < (2 * s.t) / s.ef;
    const cutPx = ridge ? wPx / 2 : cut;
    const cx = 150;
    const xl = cx - wPx / 2;
    const xr = cx + wPx / 2;
    const yT = ySurf - (ridge ? tPx * Math.min(((s.w * s.ef) / 2) / s.t, 1) : tPx);
    pcbRect(sch, 'fr4', xL, ySurf, xR - xL, 32, { layer: 'back' });
    // heat spreading from the trace into the laminate and the air
    sch.shape('ellipse', { cx, cy: ySurf - tPx / 2, rx: wPx / 2 + 24, ry: tPx / 2 + 18, class: 'xs-hot' }, 'back');
    // conformal mask: strips either side, then a cap following the etched trace
    const m = 4;
    pcbRect(sch, 'mask', xL, ySurf - m, xl - xL, m);
    pcbRect(sch, 'mask', xr, ySurf - m, xR - xr, m);
    pcbShape(sch, 'mask', 'polygon', { points: `${xl - m},${ySurf} ${xl + cutPx - (ridge ? 0 : m)},${yT - m} ${xr - cutPx + (ridge ? 0 : m)},${yT - m} ${xr + m},${ySurf}` });
    pcbShape(sch, 'cu', 'polygon', { points: `${xl},${ySurf} ${xl + cutPx},${yT} ${xr - cutPx},${yT} ${xr},${ySurf}` });
    // W is the bottom width: extension lines from the bottom corners up to a dimension above the trace
    const yW = yT - m - 14;
    for (const x of [xl, xr]) sch.shape('line', { x1: x, y1: ySurf - 1, x2: x, y2: yW - 4, class: 'sch-dim', 'stroke-dasharray': '2 2' });
    sch.dim([xl, yW], [xr, yW], eq('W', 'w', si(s.w, 'm', 4)), { tone: tone('w') });
    sch.dim([xr + 16, yT], [xr + 16, ySurf], '', {});
    sch.text(xr + 24, yT + 6, `T = ${si(s.t, 'm', 3)}`, 'sch-value', 'start');
    if (s.ef > 0) sch.text(xr + 24, yT - 8, `etch ${s.ef}:1`, 'sch-hint', 'start');
    sch.text(xR, ySurf - 12, `${+(s.t / OZ).toFixed(2)} oz copper`, 'sch-hint', 'end');
  }
  pcbLegend(sch, xL, 241, mats, { cols: 3, colW: 140 });
  return sch.svg();
}
