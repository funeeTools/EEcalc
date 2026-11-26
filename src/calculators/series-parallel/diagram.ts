/**
 * Drawings for resistor networks: a series loop and parallel rungs between two rails.
 * The parallel layout is shared with the current-divider page.
 */

import { Schematic } from '@/core/schematic/schematic';

export interface Rung {
  /** e.g. "R₁" */
  name: string;
  /** e.g. "10 kΩ" */
  value: string;
  /** Operating values beside the part, e.g. "1.06 mA · 5.3 mW" */
  side: string;
  tone?: string;
  /** Tone of the side text (e.g. the solved share) */
  sideTone?: string;
}

export interface SourceSpec {
  kind: 'v' | 'i';
  label: string;
  value: string;
  tone?: string;
}

function source(sch: Schematic, x: number, yT: number, yB: number, src: SourceSpec): void {
  if (src.kind === 'v') {
    sch.source(x, yT, yB, { kind: 'dc', label: src.label, value: src.value, tone: src.tone });
  } else {
    sch.circleSym([x, yT], [x, yB], '', { label: src.label, value: src.value, tone: src.tone, flip: true });
    const cy = (yT + yB) / 2;
    sch.arrow([x, cy + 9], [x, cy - 9], { tone: src.tone });
  }
}

/** Parallel rungs: horizontal resistors between a left and a right rail, height grows with the count. */
export function parallelDrawing(rungs: Rung[], src: SourceSpec, o: { rs?: { name: string; value: string; tone?: string }; arrows?: boolean; caption?: string; captionTone?: string } = {}): SVGSVGElement {
  const n = rungs.length;
  const rowH = 40;
  const y0 = 46;
  const yLast = y0 + (n - 1) * rowH;
  const yB = Math.max(yLast + 32, y0 + 100);
  const H = yB + (o.caption ? 34 : 16);
  const xs = 84;
  const xl = 170;
  const xr = 310;
  const sch = new Schematic(460, H);
  source(sch, xs, y0, yB, src);
  if (o.rs) {
    sch.resistor([xs, y0], [xl, y0], { label: `${o.rs.name} ${o.rs.value}`, tone: o.rs.tone ?? 'muted', body: 30 });
  } else sch.wire([[xs, y0], [xl, y0]]);
  sch.wire([[xl, y0], [xl, yLast]]);
  sch.wire([[xr, y0], [xr, yB]]);
  sch.wire([[xs, yB], [xr, yB]]);
  rungs.forEach((g, i) => {
    const y = y0 + i * rowH;
    sch.resistor([xl, y], [xr, y], { label: `${g.name}  ${g.value}`, tone: g.tone });
    if (o.arrows) sch.arrow([xl + 10, y], [xl + 34, y], { tone: g.sideTone ?? g.tone });
    sch.text(xr + 10, y + 4, g.side, `sch-value ${g.sideTone ?? g.tone ?? ''}`.trim(), 'start');
    if (i > 0) sch.dot(xl, y);
    if (i < n - 1 || n === 1) sch.dot(xr, y);
  });
  if (n > 1) sch.dot(xl, y0);
  sch.ground((xs + xr) / 2, yB + 4);
  if (o.caption) sch.text(230, H - 10, o.caption, `sch-hint ${o.captionTone ?? ''}`.trim());
  return sch.svg();
}

/**
 * Series loop: source on the left, resistors along the top (and back along the bottom when there are more
 * than four). `side` is drawn under each part's name; keep it short (one value) when a row holds 4 parts.
 */
export function seriesDrawing(parts: Rung[], src: SourceSpec, current: { text: string; tone?: string }, caption?: string, captionTone = ''): SVGSVGElement {
  const n = parts.length;
  const nTop = n <= 4 ? n : Math.ceil(n / 2);
  const nBot = n - nTop;
  const yT = 62;
  const yB = nBot ? 206 : 186;
  const H = yB + (nBot ? 50 : 22) + (caption ? 22 : 0);
  const xs = 70;
  const xR = 404;
  const x0 = 104;
  const sch = new Schematic(460, H);
  source(sch, xs, yT, yB, src);
  const place = (list: Rung[], y: number, rightToLeft: boolean) => {
    const m = list.length;
    const slot = (xR - 10 - x0) / Math.max(m, 1);
    let prev = rightToLeft ? xR : xs;
    list.forEach((g, j) => {
      const cx = rightToLeft ? xR - 10 - slot * (j + 0.5) : x0 + slot * (j + 0.5);
      const a = rightToLeft ? cx + 26 : cx - 26;
      const b = rightToLeft ? cx - 26 : cx + 26;
      sch.wire([[prev, y], [a, y]]);
      sch.resistor([a, y], [b, y], { label: `${g.name}  ${g.value}`, value: g.side, tone: g.tone, flip: rightToLeft });
      prev = b;
    });
    sch.wire([[prev, y], [rightToLeft ? xs : xR, y]]);
  };
  place(parts.slice(0, nTop), yT, false);
  if (nBot) place(parts.slice(nTop), yB, true);
  else sch.wire([[xs, yB], [xR, yB]]);
  sch.wire([[xR, yT], [xR, yB]]);
  const cy = (yT + yB) / 2;
  sch.arrow([xR, cy - 18], [xR, cy + 18], { tone: current.tone });
  sch.text(xR - 10, cy + 4, current.text, `sch-label ${current.tone ?? ''}`.trim(), 'end');
  sch.ground(xs, yB + 4);
  if (caption) sch.text(230, H - 10, caption, `sch-hint ${captionTone}`.trim());
  return sch.svg();
}
