/** Frequency ppm tolerance — page module: definition + theory + the frequency window on an axis. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type PpmState, budget, def } from './def';
import { ppmToF, uartMaxMismatch } from './model';

import { theory } from './theory';

const W = 460;
const H = 252;

/** 1, 2, 5 × 10ⁿ at or above x. */
function nice(x: number): number {
  const e = 10 ** Math.floor(Math.log10(x));
  const m = x / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
}
const pp = (x: number) => {
  const a = Math.abs(x);
  const t = a >= 1e4 ? `${+(a / 1e3).toPrecision(3)}k` : a >= 10 ? a.toFixed(0) : a >= 1 ? a.toFixed(1) : a === 0 ? '0' : a.toPrecision(2);
  return `${x < 0 ? '−' : x > 0 ? '+' : '±'}${t}`;
};

export function windowDrawing(s: PpmState, r: CalcReport): SVGSVGElement {
  const sch = new Schematic(W, H);
  let b: ReturnType<typeof budget>;
  try {
    b = budget(s);
  } catch {
    return sch.svg();
  }
  const usb = s.link === 'usbLs' ? 15000 : s.link === 'usbFs' ? 2500 : s.link === 'usbHs' ? 500 : null;
  const mismatch = s.link === 'uart' ? uartMaxMismatch(10, 16) * 1e6 : s.link === 'custom' ? s.limit : null;
  // what this clock alone may use: the USB tolerance, or the link budget minus the other end
  const lim = usb ?? (mismatch != null ? Math.max(mismatch - s.other, 0) : null);
  const ext = Math.max(Math.abs(b.worst.lo), Math.abs(b.worst.hi), 1e-6);
  const limShown = lim != null && lim > 0 && lim <= 4 * ext;
  const S = nice(Math.max(ext, limShown ? lim! : 0) * 1.08);
  const xL = 104;
  const xR = 340; // values in a column to the right of the bars
  const X = (p: number) => xL + ((p + S) / (2 * S)) * (xR - xL);
  const fail = r.status?.tone === 'fail';

  const rows: { name: string; lo: number; hi: number; cls: string }[] = [
    ...b.parts.map((p) => ({ name: p.name, lo: p.iv.lo, hi: p.iv.hi, cls: 'xs-sub' })),
    { name: 'Worst case', lo: b.worst.lo, hi: b.worst.hi, cls: fail ? 'sch-fill-hl' : 'sch-block' },
    { name: 'RSS', lo: b.rss.lo, hi: b.rss.hi, cls: 'xs-air' },
  ];
  const y0 = 40;
  const dy = 29;
  sch.text(8, 14, `f₀ = ${si(s.f0, 'Hz', 6)} · errors in ppm`, 'sch-hint', 'start');
  rows.forEach((row, i) => {
    const y = y0 + i * dy;
    const strong = row.name === 'Worst case';
    sch.text(xL - 8, y + 4, row.name, strong ? `sch-label ${fail ? 'hl' : ''}`.trim() : 'sch-value', 'end');
    const w = X(row.hi) - X(row.lo);
    if (w < 1) sch.shape('line', { x1: X(row.lo), y1: y - 6, x2: X(row.lo), y2: y + 6, class: 'sch-body' });
    else sch.shape('rect', { x: X(row.lo), y: y - (strong ? 7 : 5), width: w, height: strong ? 14 : 10, rx: 2, class: row.cls });
    const txt = row.lo === -row.hi ? `±${pp(row.hi).slice(1)}` : `${pp(row.lo)} … ${pp(row.hi)}`;
    sch.text(xR + 12, y + 4, txt, strong ? `sch-label ${fail ? 'hl' : ''}`.trim() : 'sch-value', 'start');
  });

  // axis with ticks
  const ya = y0 + rows.length * dy + 4;
  sch.shape('line', { x1: xL, y1: ya, x2: xR, y2: ya, class: 'sch-body' });
  for (const t of [-S, -S / 2, 0, S / 2, S]) {
    sch.shape('line', { x1: X(t), y1: ya - 4, x2: X(t), y2: ya + 4, class: 'sch-body' });
    sch.text(X(t), ya + 16, pp(t), 'sch-hint');
  }
  sch.shape('line', { x1: X(0), y1: y0 - 12, x2: X(0), y2: ya, class: 'sch-dim', 'stroke-dasharray': '2 3' });
  // the window in hertz under the axis
  const fmin = ppmToF(b.worst.lo, s.f0);
  const fmax = ppmToF(b.worst.hi, s.f0);
  sch.text(8, ya + 34, `f_min ${si(fmin, 'Hz', 9)}`, `sch-label ${fail ? 'hl' : ''}`.trim(), 'start');
  sch.text(W - 8, ya + 34, `f_max ${si(fmax, 'Hz', 9)}`, `sch-label ${fail ? 'hl' : ''}`.trim(), 'end');

  // limit for this clock
  if (lim != null) {
    if (limShown) {
      for (const v of [-lim, lim]) sch.shape('line', { x1: X(v), y1: y0 - 12, x2: X(v), y2: ya, class: 'sch-dim hl', 'stroke-dasharray': '4 3' });
      sch.text(X(lim) - 3, y0 - 16, `limit ±${pp(lim).slice(1)}`, 'sch-hint hl', 'end');
    } else sch.text(W - 8, y0 - 16, lim > 0 ? `limit ±${pp(lim).slice(1)} ppm (off scale)` : 'no budget left for this clock', `sch-hint ${lim > 0 ? '' : 'hl'}`.trim(), 'end');
  }
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: PpmState, r) => windowDrawing(s, r) },
};

export default mod;
