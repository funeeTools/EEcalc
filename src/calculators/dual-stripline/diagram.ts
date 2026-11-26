/**
 * Dual-stripline cross-section: two planes, layer 1 (H₁ above the lower plane) cut across a trace, and layer 2
 * (H₂ below the upper plane) running along the section — its traces cross layer 1 at right angles, so in this cut
 * one appears lengthwise. Materials from the shared PCB kit; W, T (and the heights where they fit) on one scale.
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbLegend, pcbRect } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import type { DualState } from './def';
import { scaleHint, stackScale } from './scale';

/** Frame shared by this page and the asymmetric edge-coupled pair. */
export const SF = {
  width: 460,
  height: 282,
  xL: 20,
  xR: 362,
  /** x of the right-hand height dimensions */
  xDim: 374,
  plane: 9,
  /** dielectric between the planes: at most this tall, centred on yMid */
  avail: 164,
  yMid: 126,
  yCaption: 20,
  yHint: 238,
  yLegend: 268,
} as const;

export const fLen = (m: number) => si(m, 'm', 3);
export type Tone = '' | 'solved' | 'hl';

/** Vertical dimension on the right; label and value stacked when the span allows, else on one line. */
export function vDimR(sch: Schematic, y0: number, y1: number, sym: string, val: string, tone: Tone): void {
  const x = SF.xDim;
  sch.dim([x, y0], [x, y1], '', { tone });
  const ym = (y0 + y1) / 2;
  const cls = (c: string) => `${c} ${tone}`.trim();
  if (y1 - y0 >= 34) {
    sch.text(x + 7, ym - 3, sym, cls('sch-label'), 'start');
    sch.text(x + 7, ym + 12, val, cls('sch-value'), 'start');
  } else sch.text(x + 7, ym + 4, `${sym} ${val}`, cls('sch-value'), 'start');
}

/** Horizontal dimension x0–x1 at y with extension lines from yRef; label above (or below) or beside it. */
export function hDimW(sch: Schematic, x0: number, x1: number, y: number, yRef: number, text: string, tone: Tone, place: 'above' | 'below' | 'right' | 'left' = 'above'): void {
  if (Math.abs(y - yRef) > 4)
    for (const x of [x0, x1]) sch.shape('line', { x1: x, y1: yRef + (y < yRef ? -1.5 : 1.5), x2: x, y2: y + (y < yRef ? -2 : 2), class: 'sch-dim' });
  sch.dim([x0, y], [x1, y], '', { tone });
  const cls = `sch-label sch-halo ${tone}`.trim();
  if (place === 'above') sch.text((x0 + x1) / 2, y - 6, text, cls, 'middle');
  else if (place === 'below') sch.text((x0 + x1) / 2, y + 14, text, cls, 'middle');
  else if (place === 'right') sch.text(x1 + 7, y + 4, text, cls, 'start');
  else sch.text(x0 - 7, y + 4, text, cls, 'end');
}

/** W of a conductor wider than the drawing: label in the middle, arrows out to both board edges. */
export function cutW(sch: Schematic, y: number, text: string, tone: Tone, x0: number = SF.xL, x1: number = SF.xR): void {
  const cx = (x0 + x1) / 2;
  const half = text.length * 3.3 + 8;
  sch.text(cx, y + 4, text, `sch-label sch-halo ${tone}`.trim(), 'middle');
  sch.arrow([cx - half, y], [x0 + 3, y], { head: 6, tone });
  sch.arrow([cx + half, y], [x1 - 3, y], { head: 6, tone });
}

/** Planes and laminate for a dielectric stack from yTop to yBot. */
export function planes(sch: Schematic, yTop: number, yBot: number): void {
  pcbRect(sch, 'fr4', SF.xL, yTop, SF.xR - SF.xL, yBot - yTop, { layer: 'back' });
  pcbRect(sch, 'cu', SF.xL, yTop - SF.plane, SF.xR - SF.xL, SF.plane, { layer: 'back' });
  pcbRect(sch, 'cu', SF.xL, yBot, SF.xR - SF.xL, SF.plane, { layer: 'back' });
}

export function captionRow(sch: Schematic, items: { text: string; tone?: Tone }[]): void {
  let x = SF.xL;
  for (const it of items) {
    sch.text(x, SF.yCaption, it.text, `sch-caption ${it.tone ?? ''}`.trim(), 'start');
    x += Math.max(112, it.text.length * 7.2 + 18);
  }
}

export function legendRow(sch: Schematic): void {
  pcbLegend(sch, SF.xL, SF.yLegend, ['cu', 'fr4'], { cols: 2, colW: 110, names: { fr4: 'Laminate (core, prepreg)' } });
}

export function dualDiagram(s: DualState, r?: CalcReport): SVGSVGElement | null {
  if (!(s.h1 > 0) || !(s.h2 > 0) || !(s.d > 0) || !(s.w1 > 0) || !(s.w2 > 0) || !(s.t >= 0)) return null;
  const sch = new Schematic(SF.width, SF.height);
  const failed = !!r && !r.ok;
  const k = s.solveFor;
  const tone = (key: string): Tone => (key === k || (k === 'w' && (key === 'w1' || key === 'w2')) ? (failed ? 'hl' : 'solved') : '');
  const val = (key: string, text: string) => (failed && tone(key) ? '—' : text);

  // ── scale: layer-1 trace W₁ × T; heights H₁, D, H₂; two copper layers in the stack
  const sc = stackScale(s.w1, s.t, [s.h1, s.d, s.h2], 2, SF.avail, 300);
  const { tPx } = sc;
  const [h1Px, dPx, h2Px] = sc.hPx;
  const stack = h1Px + dPx + h2Px + 2 * tPx;
  const yTop = SF.yMid - stack / 2; // bottom of the upper plane
  const yBot = yTop + stack; // top of the lower plane
  const yL1b = yBot - h1Px;
  const yL1t = yL1b - tPx;
  const yL2b = yL1t - dPx;
  const yL2t = yL2b - tPx;
  const narrow = !sc.cut && sc.k * s.w1 < 3;
  const wPx = sc.cut ? SF.xR - SF.xL : Math.max(sc.k * s.w1, 3);
  const cx = sc.cut ? (SF.xL + SF.xR) / 2 : 176;
  const x0 = cx - wPx / 2;
  const x1 = cx + wPx / 2;

  planes(sch, yTop, yBot);
  // layer 2: a trace crossing at right angles, seen lengthwise (stops short of the board edges)
  const l2x0 = SF.xL + 34;
  const l2x1 = SF.xR - 34;
  pcbRect(sch, 'cu', l2x0, yL2t, l2x1 - l2x0, tPx);
  pcbRect(sch, 'cu', x0, yL1t, wPx, tPx);

  // ── field of the layer-1 trace: mostly to the near plane, some up to the crossing layer-2 trace
  const share = (r?.ok ? (r.details as { l1?: { lowerShare: number } } | undefined)?.l1?.lowerShare : undefined) ?? 0.6;
  const nDown = Math.min(Math.max(Math.round(share * 5), 1), 4);
  const nUp = 5 - nDown;
  const spread = (n: number) => (n === 1 ? [0] : Array.from({ length: n }, (_, i) => -0.42 + (0.84 * i) / (n - 1)));
  const fan = Math.min(wPx, 120);
  // ── W₁: in the taller of the two neighbouring layers (D above, H₁ below), beside the trace if both are thin
  const wText = `W₁ = ${val('w1', fLen(s.w1))}`;
  const wAbove = dPx >= h1Px;
  const room = Math.max(dPx, h1Px);
  // field down to the near plane, starting below the W label when that sits under the trace
  const yDown = !sc.cut && room >= 30 && !wAbove ? yL1b + 30 : yL1b + 3;
  if (yBot - 3 - yDown >= 12) for (const f of spread(nDown)) sch.arrow([cx + f * fan, yDown], [cx + f * (fan + 26), yBot - 3], { dashed: true, head: 5 });
  if (sc.cut) cutW(sch, wAbove ? yL1t - Math.min(dPx / 2, 14) : yL1b + Math.min(h1Px / 2, 14), wText, tone('w1'));
  else if (room >= 30) {
    if (wAbove) hDimW(sch, x0, x1, yL1t - 11, yL1t, wText, tone('w1'), 'above');
    else hDimW(sch, x0, x1, yL1b + 11, yL1b, wText, tone('w1'), 'below');
  } else hDimW(sch, x0, x1, wAbove ? yL1t - 6 : yL1b + 6, wAbove ? yL1t : yL1b, wText, tone('w1'), 'right');
  // field up to layer 2, where it does not run through the W label
  if (!sc.cut && dPx >= 14 && !(room >= 30 && wAbove)) for (const f of spread(nUp)) sch.arrow([cx + f * fan * 0.8, yL1t - 3], [cx + f * fan, yL2b + 3], { dashed: true, head: 5 });

  // ── labels: T left of the trace, layer 2 above its bar, εr in the lower layer
  if (!sc.cut && s.t > 0) sch.text(x0 - 8, yL1b - tPx / 2 + 4, `T = ${fLen(s.t)}`, 'sch-value sch-halo', 'end');
  sch.text(l2x0 + 4, yL2t - 5, `layer 2: W₂ = ${val('w2', fLen(s.w2))} trace crossing at 90°`, `sch-value sch-halo ${tone('w2')}`.trim(), 'start');
  if (!sc.cut) sch.text(SF.xR - 6, yL1b - tPx / 2 + 4, 'layer 1', 'sch-value sch-halo', 'end');
  // εr at the left of the lower layer, or mid-way up the layer gap when H₁ is drawn thin
  const erText = `ε_r = ${val('er', String(+s.er.toPrecision(4)))}`;
  const erCls = `sch-label sch-halo ${tone('er')}`.trim();
  if (h1Px >= 20) sch.text(SF.xL + 6, yBot - 5, erText, erCls, 'start');
  else if (dPx >= 34) sch.text(SF.xL + 6, (yL2b + yL1t) / 2 + 4, erText, erCls, 'start');

  // ── heights on the right
  vDimR(sch, yL1b, yBot, 'H₁', val('h1', fLen(s.h1)), tone('h1'));
  vDimR(sch, yL2b, yL1t, 'D', fLen(s.d), '');
  vDimR(sch, yTop, yL2t, 'H₂', val('h2', fLen(s.h2)), tone('h2'));

  // ── caption and hint
  // each impedance: green when computed, plain when it is a target; a target is shown as entered, a failed
  // computation as '—'
  const zText = (key: 'z01' | 'z02', computed: boolean) => {
    const it = r?.ok ? r.results.find((x) => x.key === key) : undefined;
    if (it) return it.display;
    return computed ? '—' : `${+s[key].toPrecision(4)} Ω`;
  };
  const c1 = k === 'z0' || k === 'h2';
  const c2 = k === 'z0' || k === 'h1' || k === 'er';
  const ct = (c: boolean): Tone => (c ? (failed ? 'hl' : 'solved') : '');
  captionRow(sch, [
    { text: `Z₀₁ = ${zText('z01', c1)}`, tone: ct(c1) },
    { text: `Z₀₂ = ${zText('z02', c2)}`, tone: ct(c2) },
    { text: `planes ${fLen(s.h1 + s.d + s.h2 + 2 * s.t)} apart` },
  ]);
  if (!(failed && k === 'w')) sch.text(SF.xL, SF.yHint, scaleHint(sc, narrow), 'sch-hint', 'start');
  legendRow(sch);
  return sch.svg();
}
