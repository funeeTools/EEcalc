/**
 * Lightweight canvas plotter shared by every calculator.
 *
 *  - any number of y axes (left/right), linear or log; linear or log x (Bode plots)
 *  - SI-prefixed axes ("Time (µs)", "Current (kA)")
 *  - min/max decimation so 500k-point solver output draws instantly
 *  - hover / touch crosshair read-out, drag to zoom X, double-click (or ⟲ button) to reset
 *  - legend items toggle series visibility
 */

import { h } from '@/core/ui/dom';
import { themed } from '@/core/ui/theme';

export interface AxisSpec {
  id: string;
  label: string;
  unit: string;
  side?: 'left' | 'right';
  log?: boolean;
  includeZero?: boolean;
  /** false hides the darker zero line this axis gets on a linear scale (when 0 is arbitrary) */
  zeroLine?: boolean;
  min?: number;
  max?: number;
}

export interface XAxisSpec {
  label: string;
  unit: string;
  log?: boolean;
  /** Only whole-number ticks (e.g. stage index) */
  integer?: boolean;
  /** false hides the darker zero line this axis gets on a linear scale (when 0 is arbitrary) */
  zeroLine?: boolean;
}

export interface Series {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  label: string;
  color: string;
  axis?: string;
  width?: number;
  dash?: number[];
  /** Hidden from the crosshair read-out (e.g. reference traces). */
  noReadout?: boolean;
}

export interface RefLine {
  value: number;
  label: string;
  color: string;
  axis?: string;
  width?: number;
  dash?: number[];
}

export interface Marker {
  x: number;
  y: number;
  axis?: string;
  color: string;
  label?: string;
}

export interface PlotData {
  series: Series[];
  hlines?: RefLine[];
  vlines?: RefLine[];
  markers?: Marker[];
  title?: string;
  subtitle?: string;
  titleColor?: string;
  /** Fixed full-view X range (otherwise the span of all series) */
  xRange?: [number, number];
  /** Put the legend under the plot area (always done on narrow screens) when it would hide the traces */
  legendBelow?: boolean;
}

export interface PlotConfig {
  x: XAxisSpec;
  y: AxisSpec[];
  emptyText?: string;
}

const PREFIX: [number, string][] = [
  [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
];

function prefixFor(maxAbs: number): [number, string] {
  if (!(maxAbs > 0) || !Number.isFinite(maxAbs)) return [1, ''];
  for (const p of PREFIX) if (maxAbs >= p[0] * 0.9995) return p;
  return [1e-15, 'f'];
}

/** "Time (µs)"; log axes carry the prefix on each tick, so only the unit; no "()" for unitless. */
function axisTitle(label: string, prefix: string, unit: string): string {
  return prefix || unit ? `${label} (${prefix}${unit})` : label;
}

function niceStep(range: number, target: number): number {
  const raw = range / Math.max(target, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const nice = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return nice * mag;
}

function fmtTick(v: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(Math.abs(step)) + 1e-9));
  const s = v.toFixed(Math.min(decimals, 6));
  return s === '-0' ? '0' : s;
}

function lowerBound(a: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface Scale {
  lo: number;
  hi: number;
  log: boolean;
  p0: number;
  p1: number;
}

function toPx(s: Scale, v: number): number {
  const a = s.log ? Math.log10(Math.max(s.lo, 1e-300)) : s.lo;
  const b = s.log ? Math.log10(Math.max(s.hi, 1e-300)) : s.hi;
  const x = s.log ? Math.log10(Math.max(v, 1e-300)) : v;
  return s.p0 + ((x - a) / (b - a || 1)) * (s.p1 - s.p0);
}

function fromPx(s: Scale, px: number): number {
  const a = s.log ? Math.log10(s.lo) : s.lo;
  const b = s.log ? Math.log10(s.hi) : s.hi;
  const x = a + ((px - s.p0) / (s.p1 - s.p0 || 1)) * (b - a);
  return s.log ? 10 ** x : x;
}

export class Plot {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readout: HTMLElement;
  private resetBtn: HTMLButtonElement;
  private data: PlotData = { series: [] };
  private hidden = new Set<string>();
  private zoom: [number, number] | null = null;
  private cursorPx: number | null = null;
  private dragStart: number | null = null;
  private dragNow: number | null = null;
  private w = 0;
  private hgt = 0;
  private xs: Scale | null = null;
  private ys = new Map<string, Scale>();
  private legendBoxes: { x: number; y: number; w: number; h: number; label: string }[] = [];
  private ro: ResizeObserver;
  private raf = 0;

  constructor(host: HTMLElement, private cfg: PlotConfig) {
    this.canvas = h('canvas', { class: 'plot-canvas' });
    this.readout = h('div', { class: 'plot-readout', hidden: true });
    this.resetBtn = h('button', { class: 'plot-reset', type: 'button', hidden: true, title: 'Reset zoom', onclick: () => this.resetZoom() }, '⟲ Reset zoom');
    this.el = h('div', { class: 'plot' }, this.canvas, this.readout, this.resetBtn);
    host.appendChild(this.el);
    this.ctx = this.canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.requestDraw());
    window.addEventListener('ee:theme', this.onTheme);
    this.ro.observe(this.el);
    this.bindPointer();
  }

  private onTheme = () => this.requestDraw();

  destroy(): void {
    window.removeEventListener('ee:theme', this.onTheme);
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }

  /** Swap axes (generic graph host showing different graphs). Keeps zoom only if the axes match. */
  setConfig(cfg: PlotConfig): void {
    const same = JSON.stringify(cfg) === JSON.stringify(this.cfg);
    this.cfg = cfg;
    if (!same) {
      this.zoom = null;
      this.resetBtn.hidden = true;
    }
    this.requestDraw();
  }

  setData(d: PlotData): void {
    this.data = d;
    this.requestDraw();
  }

  resetZoom(): void {
    this.zoom = null;
    this.resetBtn.hidden = true;
    this.requestDraw();
  }

  private requestDraw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  }

  private css(name: string, fallback: string): string {
    return getComputedStyle(this.el).getPropertyValue(name).trim() || fallback;
  }

  private visibleSeries(): Series[] {
    return this.data.series.filter((s) => !this.hidden.has(s.label) && s.x.length > 0);
  }

  private dataXRange(): [number, number] {
    if (this.data.xRange) return this.data.xRange;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of this.data.series) {
      if (!s.x.length) continue;
      lo = Math.min(lo, s.x[0]);
      hi = Math.max(hi, s.x[s.x.length - 1]);
    }
    if (!Number.isFinite(lo)) return [0, 1];
    if (lo === hi) hi = lo + 1;
    return [lo, hi];
  }

  private draw(): void {
    const rect = this.el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(rect.width, 50);
    this.hgt = Math.max(rect.height, 50);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.hgt * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.hgt}px`;
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ink = this.css('--plot-ink', '#2c2c2c');
    const muted = this.css('--plot-muted', '#7a7466');
    const grid = this.css('--plot-grid', 'rgba(0,0,0,0.09)');
    const bg = this.css('--plot-bg', '#fbfaf6');
    const frame = this.css('--plot-frame', '#cfc8b8');
    const zero = this.css('--plot-zero', 'rgba(45,40,30,0.5)');
    const font = this.css('--plot-font', '12px system-ui, sans-serif');
    // The 0 tick label on a linear axis is bold and 1.5 px larger, to go with the darker zero line.
    const zeroFont = `bold ${font.replace(/(\d+(?:\.\d+)?)px/, (_, n) => `${Number(n) + 1.5}px`)}`;
    const tickText = (t: { v: number; label: string }, log: boolean, x: number, y: number) => {
      if (log || t.v !== 0) return c.fillText(t.label, x, y);
      c.font = zeroFont;
      c.fillText(t.label, x, y);
      c.font = font;
    };
    const small = this.w < 520;

    c.clearRect(0, 0, this.w, this.hgt);
    const hasRight = this.cfg.y.some((a) => a.side === 'right');
    const titleH = this.data.title ? (this.data.subtitle ? 40 : 24) : 8;
    c.font = font;
    const below = small || !!this.data.legendBelow;
    const legendRows = below ? this.layoutLegend(this.w - 20) : [];
    const pad = { l: small ? 46 : 58, r: hasRight ? (small ? 46 : 58) : 14, t: titleH + 4, b: (small ? 34 : 40) + (legendRows.length ? legendRows.length * 17 + 8 : 0) };
    const px0 = pad.l;
    const px1 = this.w - pad.r;
    const py0 = this.hgt - pad.b;
    const py1 = pad.t;

    c.fillStyle = bg;
    c.fillRect(px0, py1, px1 - px0, py0 - py1);

    const series = this.visibleSeries();
    if (!this.data.series.some((s) => s.x.length)) {
      c.fillStyle = muted;
      c.font = font;
      c.textAlign = 'center';
      c.fillText(this.cfg.emptyText ?? 'No data', (px0 + px1) / 2, (py0 + py1) / 2);
      this.xs = null;
      return;
    }

    // X scale
    const [dx0, dx1] = this.zoom ?? this.dataXRange();
    const xs: Scale = { lo: dx0, hi: dx1, log: !!this.cfg.x.log, p0: px0, p1: px1 };
    this.xs = xs;

    // Y scales
    this.ys.clear();
    for (const ax of this.cfg.y) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of series) {
        if ((s.axis ?? this.cfg.y[0].id) !== ax.id) continue;
        const i0 = Math.max(lowerBound(s.x, dx0) - 1, 0);
        const i1 = Math.min(lowerBound(s.x, dx1) + 1, s.x.length);
        for (let i = i0; i < i1; i++) {
          const v = s.y[i];
          if (!Number.isFinite(v) || (ax.log && v <= 0)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      for (const l of this.data.hlines ?? []) {
        if ((l.axis ?? this.cfg.y[0].id) !== ax.id || this.hidden.has(l.label)) continue;
        lo = Math.min(lo, l.value);
        hi = Math.max(hi, l.value);
      }
      if (!Number.isFinite(lo)) {
        lo = 0;
        hi = 1;
      }
      if (ax.includeZero && !ax.log) {
        lo = Math.min(lo, 0);
        hi = Math.max(hi, 0);
      }
      if (ax.min != null) lo = ax.min;
      if (ax.max != null) hi = ax.max;
      if (hi === lo) {
        hi += Math.abs(hi) * 0.1 || 1;
        lo -= Math.abs(lo) * 0.1 || 1;
      }
      if (ax.log) {
        lo = 10 ** Math.floor(Math.log10(lo));
        hi = 10 ** Math.ceil(Math.log10(hi));
      } else {
        const span = hi - lo;
        hi += span * 0.06;
        lo -= span * 0.06;
      }
      this.ys.set(ax.id, { lo, hi, log: !!ax.log, p0: py0, p1: py1 });
    }

    c.font = font;
    c.lineWidth = 1;

    // Grid + ticks: X
    const xPrefix = prefixFor(Math.max(Math.abs(dx0), Math.abs(dx1)));
    const xTicks = this.ticks(xs, small ? 5 : 9, xPrefix[0], !!this.cfg.x.integer);
    c.strokeStyle = grid;
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (const t of xTicks) {
      const x = toPx(xs, t.v);
      c.beginPath();
      c.moveTo(x, py0);
      c.lineTo(x, py1);
      c.stroke();
      if (t.label) tickText(t, xs.log, x, py0 + 5);
    }
    c.fillStyle = ink;
    c.fillText(axisTitle(this.cfg.x.label, xs.log ? '' : xPrefix[1], this.cfg.x.unit), (px0 + px1) / 2, py0 + (small ? 18 : 22));

    // Grid + ticks: Y axes (grid only for the first axis)
    this.cfg.y.forEach((ax, idx) => {
      const ys = this.ys.get(ax.id)!;
      const pre = prefixFor(Math.max(Math.abs(ys.lo), Math.abs(ys.hi)));
      const ticks = this.ticks(ys, small ? 5 : 7, pre[0]);
      const right = ax.side === 'right';
      c.textAlign = right ? 'left' : 'right';
      c.textBaseline = 'middle';
      for (const t of ticks) {
        const y = toPx(ys, t.v);
        if (idx === 0) {
          c.strokeStyle = grid;
          c.beginPath();
          c.moveTo(px0, y);
          c.lineTo(px1, y);
          c.stroke();
        }
        c.fillStyle = ink;
        if (t.label) tickText(t, ys.log, right ? px1 + 5 : px0 - 5, y);
      }
      c.save();
      c.translate(right ? this.w - 10 : 11, (py0 + py1) / 2);
      c.rotate(right ? Math.PI / 2 : -Math.PI / 2);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = ink;
      c.fillText(axisTitle(ax.label, ys.log ? '' : pre[1], ax.unit), 0, 0);
      c.restore();
    });

    // Frame
    c.strokeStyle = frame;
    c.strokeRect(px0 + 0.5, py1 + 0.5, px1 - px0 - 1, py0 - py1 - 1);

    // Clip to plot area for data
    c.save();
    c.beginPath();
    c.rect(px0, py1, px1 - px0, py0 - py1);
    c.clip();

    // Zero lines: a darker x = 0 and y = 0 (first y axis, like the grid) wherever 0 is on a linear axis,
    // so the origin reads at a glance. Drawn under the data; at the plot edge it darkens that frame side.
    c.strokeStyle = zero;
    c.lineWidth = 1.25;
    if (!xs.log && this.cfg.x.zeroLine !== false && xs.lo <= 0 && xs.hi >= 0) {
      const x = Math.round(Math.min(Math.max(toPx(xs, 0), px0 + 0.5), px1 - 0.5)) + 0.5;
      c.beginPath();
      c.moveTo(x, py0);
      c.lineTo(x, py1);
      c.stroke();
    }
    const y0s = this.ys.get(this.cfg.y[0].id);
    if (y0s && !y0s.log && this.cfg.y[0].zeroLine !== false && y0s.lo <= 0 && y0s.hi >= 0) {
      const y = Math.round(Math.min(Math.max(toPx(y0s, 0), py1 + 0.5), py0 - 0.5)) + 0.5;
      c.beginPath();
      c.moveTo(px0, y);
      c.lineTo(px1, y);
      c.stroke();
    }
    c.lineWidth = 1;

    for (const l of this.data.hlines ?? []) {
      if (this.hidden.has(l.label)) continue;
      const ys = this.ys.get(l.axis ?? this.cfg.y[0].id);
      if (!ys) continue;
      const y = toPx(ys, l.value);
      c.strokeStyle = themed(l.color);
      c.lineWidth = l.width ?? 1.5;
      c.setLineDash(l.dash ?? []);
      c.beginPath();
      c.moveTo(px0, y);
      c.lineTo(px1, y);
      c.stroke();
    }
    for (const l of this.data.vlines ?? []) {
      const x = toPx(xs, l.value);
      c.strokeStyle = themed(l.color);
      c.lineWidth = l.width ?? 1;
      c.setLineDash(l.dash ?? [4, 4]);
      c.beginPath();
      c.moveTo(x, py0);
      c.lineTo(x, py1);
      c.stroke();
    }
    c.setLineDash([]);

    for (const s of series) this.drawSeries(s, xs, this.ys.get(s.axis ?? this.cfg.y[0].id)!);

    c.font = font;
    const legendRect = (() => {
      if (below) return null;
      const items = this.legendItems();
      if (!items.length) return null;
      const textW = Math.max(...items.map((i) => c.measureText(i.label).width));
      const boxW = Math.min(22 + 10 + textW + 12, (px1 - px0) * 0.6);
      return { x0: px1 - boxW - 8, x1: px1 - 8, y0: py1 + 8, y1: py1 + 8 + items.length * 17 + 8 };
    })();
    const markerRects: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const m of this.data.markers ?? []) {
      const ys = this.ys.get(m.axis ?? this.cfg.y[0].id);
      if (!ys) continue;
      const x = toPx(xs, m.x);
      const y = toPx(ys, m.y);
      c.fillStyle = themed(m.color);
      c.strokeStyle = bg;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 4.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      if (m.label) {
        c.font = font;
        const mw = c.measureText(m.label).width;
        type R = { x0: number; x1: number; y0: number; y1: number };
        const rectAt = (left: boolean, below: boolean): R => {
          const ly = below ? y + 4 : y - 4;
          return { x0: left ? x - 7 - mw : x + 7, x1: left ? x - 7 : x + 7 + mw, y0: below ? ly : ly - 14, y1: below ? ly + 14 : ly };
        };
        const clash = (r: R) =>
          r.x0 < px0 || r.x1 > px1 || r.y0 < py1 || r.y1 > py0 ||
          (!!legendRect && r.x0 < legendRect.x1 && r.x1 > legendRect.x0 && r.y0 < legendRect.y1 && r.y1 > legendRect.y0) ||
          markerRects.some((q) => r.x0 < q.x1 + 4 && r.x1 > q.x0 - 4 && r.y0 < q.y1 && r.y1 > q.y0);
        // above-right of the dot by default; otherwise the first spot clear of the plot edge, the inside
        // legend and earlier marker labels
        const tries: [boolean, boolean][] = [[false, false], [true, false], [false, true], [true, true]];
        const [left, below] = tries.find(([l, b]) => !clash(rectAt(l, b))) ?? [x > px1 - 90, y - 20 < py1];
        markerRects.push(rectAt(left, below));
        const ly = below ? y + 4 : y - 4;
        c.textAlign = left ? 'right' : 'left';
        c.textBaseline = below ? 'top' : 'bottom';
        const lx = x + (left ? -7 : 7);
        // background halo keeps the label readable where it crosses traces or grid lines
        c.lineJoin = 'round';
        c.lineWidth = 3;
        c.strokeStyle = bg;
        c.strokeText(m.label, lx, ly);
        c.fillStyle = ink; // text in the plot ink reads in both themes; the dot carries the colour
        c.fillText(m.label, lx, ly);
      }
    }

    // Reference-line labels ("C = 100 nF", "f₀"): at the top of the plot beside their line, on either side,
    // stacked in rows when they would collide with each other or with the inside legend; halo over traces.
    c.font = font;
    const placed: { x0: number; x1: number; y: number }[] = [];
    c.textBaseline = 'top';
    c.textAlign = 'left';
    for (const l of this.data.vlines ?? []) {
      if (!l.label) continue;
      const x = toPx(xs, l.value);
      if (!(x >= px0 && x <= px1)) continue;
      const w = c.measureText(l.label).width;
      const sides = x + 5 + w > px1 ? [x - 5 - w] : [x + 5, x - 5 - w];
      let spot: { a: number; y: number } | null = null;
      for (let row = 0; row < 12 && !spot; row++) {
        const y = py1 + 4 + row * 16;
        for (const a of sides) {
          if (a < px0 + 2) continue;
          const hitsLegend = legendRect && a < legendRect.x1 && a + w > legendRect.x0 && y < legendRect.y1 && y + 14 > legendRect.y0;
          const hitsLabel = placed.some((p) => p.y === y && a < p.x1 + 6 && a + w > p.x0 - 6) || markerRects.some((r) => a < r.x1 + 4 && a + w > r.x0 - 4 && y < r.y1 && y + 14 > r.y0);
          if (!hitsLegend && !hitsLabel) {
            spot = { a, y };
            break;
          }
        }
      }
      if (!spot) continue;
      placed.push({ x0: spot.a, x1: spot.a + w, y: spot.y });
      c.lineJoin = 'round';
      c.lineWidth = 3;
      c.strokeStyle = bg;
      c.strokeText(l.label, spot.a, spot.y);
      c.fillStyle = muted;
      c.fillText(l.label, spot.a, spot.y);
    }

    // Drag-to-zoom band
    if (this.dragStart != null && this.dragNow != null) {
      c.fillStyle = this.css('--plot-zoom', 'rgba(31,78,95,0.12)');
      const a = Math.min(this.dragStart, this.dragNow);
      c.fillRect(a, py1, Math.abs(this.dragNow - this.dragStart), py0 - py1);
    }

    // Crosshair
    if (this.cursorPx != null && this.cursorPx >= px0 && this.cursorPx <= px1) {
      c.strokeStyle = muted;
      c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.beginPath();
      c.moveTo(this.cursorPx + 0.5, py0);
      c.lineTo(this.cursorPx + 0.5, py1);
      c.stroke();
      c.setLineDash([]);
    }
    c.restore();

    // Title
    if (this.data.title) {
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.fillStyle = themed(this.data.titleColor) ?? ink;
      c.font = `600 ${font}`;
      c.fillText(this.data.title, (px0 + px1) / 2, 4, px1 - px0);
      if (this.data.subtitle) {
        c.font = font;
        c.fillStyle = themed(this.data.titleColor) ?? muted;
        c.fillText(this.data.subtitle, (px0 + px1) / 2, 21, px1 - px0);
      }
      c.font = font;
    }

    if (below) this.drawLegendBelow(legendRows, ink);
    else this.drawLegend(px0, px1, py1, font, ink, bg, frame);
    this.updateReadout();
  }

  private ticks(s: Scale, target: number, scale: number, integer = false): { v: number; label: string }[] {
    const out: { v: number; label: string }[] = [];
    if (s.log) {
      const a = Math.floor(Math.log10(s.lo));
      const b = Math.ceil(Math.log10(s.hi));
      const decades = b - a;
      for (let e = a; e <= b; e++) {
        for (const m of decades > 6 ? [1] : [1, 2, 5]) {
          const v = m * 10 ** e;
          if (v < s.lo * 0.999 || v > s.hi * 1.001) continue;
          const [ps, pn] = prefixFor(v);
          out.push({ v, label: m === 1 || decades <= 2 ? `${Number((v / ps).toPrecision(3))}${pn}` : '' });
        }
      }
      return out;
    }
    const step = integer ? Math.max(1, Math.round(niceStep(s.hi - s.lo, target))) : niceStep(s.hi - s.lo, target);
    const first = Math.ceil(s.lo / step) * step;
    for (let v = first; v <= s.hi + step * 1e-9; v += step) {
      const vv = Math.abs(v) < step * 1e-9 ? 0 : v;
      out.push({ v: vv, label: fmtTick(vv / scale, step / scale) });
    }
    return out;
  }

  private drawSeries(s: Series, xs: Scale, ys: Scale): void {
    const c = this.ctx;
    const n = s.x.length;
    let i0 = Math.max(lowerBound(s.x, xs.lo) - 1, 0);
    const i1 = Math.min(lowerBound(s.x, xs.hi) + 1, n);
    c.strokeStyle = themed(s.color);
    c.lineWidth = s.width ?? 1.6;
    c.lineJoin = 'round';
    c.setLineDash(s.dash ?? []);
    c.beginPath();
    const count = i1 - i0;
    const cols = Math.max(xs.p1 - xs.p0, 1);
    if (count <= cols * 3) {
      let started = false;
      for (let i = i0; i < i1; i++) {
        const y = s.y[i];
        if (!Number.isFinite(y) || (ys.log && y <= 0)) {
          started = false;
          continue;
        }
        const px = toPx(xs, s.x[i]);
        const py = toPx(ys, y);
        if (!started) c.moveTo(px, py);
        else c.lineTo(px, py);
        started = true;
      }
    } else {
      // Min/max per pixel column keeps every spike visible.
      let col = Math.floor(toPx(xs, s.x[i0]));
      let mn = Infinity;
      let mx = -Infinity;
      let first = s.y[i0];
      let last = first;
      let started = false;
      const flush = () => {
        if (mn === Infinity) return;
        const pf = toPx(ys, first);
        if (!started) {
          c.moveTo(col, pf);
          started = true;
        } else c.lineTo(col, pf);
        c.lineTo(col, toPx(ys, mn));
        c.lineTo(col, toPx(ys, mx));
        c.lineTo(col, toPx(ys, last));
      };
      for (; i0 < i1; i0++) {
        const y = s.y[i0];
        if (!Number.isFinite(y)) continue;
        const pc = Math.floor(toPx(xs, s.x[i0]));
        if (pc !== col) {
          flush();
          col = pc;
          mn = Infinity;
          mx = -Infinity;
          first = y;
        }
        if (y < mn) mn = y;
        if (y > mx) mx = y;
        last = y;
      }
      flush();
    }
    c.stroke();
    c.setLineDash([]);
  }

  private legendItems(): { label: string; color: string; dash?: number[]; width?: number }[] {
    return [
      ...this.data.series.filter((s) => s.x.length).map((s) => ({ label: s.label, color: s.color, dash: s.dash, width: s.width })),
      ...(this.data.hlines ?? []).map((l) => ({ label: l.label, color: l.color, dash: l.dash, width: l.width })),
    ];
  }

  /** Flow legend items into rows (narrow screens). */
  private layoutLegend(maxW: number): { label: string; color: string; dash?: number[]; width?: number; x: number; w: number }[][] {
    const rows: { label: string; color: string; dash?: number[]; width?: number; x: number; w: number }[][] = [];
    let row: (typeof rows)[number] = [];
    let x = 0;
    for (const it of this.legendItems()) {
      const w = 18 + 5 + this.ctx.measureText(it.label).width + 14;
      if (x + w > maxW && row.length) {
        rows.push(row);
        row = [];
        x = 0;
      }
      row.push({ ...it, x, w });
      x += w;
    }
    if (row.length) rows.push(row);
    return rows;
  }

  private drawLegendBelow(rows: ReturnType<Plot['layoutLegend']>, ink: string): void {
    const c = this.ctx;
    this.legendBoxes = [];
    const y0 = this.hgt - rows.length * 17 - 4;
    rows.forEach((row, r) => {
      const total = row.reduce((a, it) => a + it.w, 0);
      const off = (this.w - total) / 2;
      const yy = y0 + r * 17 + 8;
      for (const it of row) {
        const x = off + it.x;
        c.globalAlpha = this.hidden.has(it.label) ? 0.35 : 1;
        c.strokeStyle = themed(it.color);
        c.lineWidth = Math.max(it.width ?? 1.6, 1.4);
        c.setLineDash(it.dash ?? []);
        c.beginPath();
        c.moveTo(x, yy);
        c.lineTo(x + 18, yy);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = ink;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(it.label, x + 23, yy);
        c.globalAlpha = 1;
        this.legendBoxes.push({ x, y: yy - 8, w: it.w, h: 17, label: it.label });
      }
    });
  }

  private drawLegend(px0: number, px1: number, py1: number, font: string, ink: string, bg: string, frame: string): void {
    const c = this.ctx;
    const items = this.legendItems();
    this.legendBoxes = [];
    if (!items.length) return;
    c.font = font;
    const lineH = 17;
    const sw = 22;
    const textW = Math.max(...items.map((i) => c.measureText(i.label).width));
    const boxW = Math.min(sw + 10 + textW + 12, (px1 - px0) * 0.6);
    const boxH = items.length * lineH + 8;
    const x = px1 - boxW - 8;
    const y = py1 + 8;
    c.globalAlpha = 0.92;
    c.fillStyle = bg;
    c.fillRect(x, y, boxW, boxH);
    c.globalAlpha = 1;
    c.strokeStyle = frame;
    c.strokeRect(x + 0.5, y + 0.5, boxW, boxH);
    items.forEach((it, k) => {
      const yy = y + 4 + k * lineH + lineH / 2;
      const off = this.hidden.has(it.label);
      c.globalAlpha = off ? 0.35 : 1;
      c.strokeStyle = themed(it.color);
      c.lineWidth = Math.max(it.width ?? 1.6, 1.4);
      c.setLineDash(it.dash ?? []);
      c.beginPath();
      c.moveTo(x + 6, yy);
      c.lineTo(x + 6 + sw, yy);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = ink;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(it.label, x + sw + 12, yy, boxW - sw - 16);
      c.globalAlpha = 1;
      this.legendBoxes.push({ x, y: yy - lineH / 2, w: boxW, h: lineH, label: it.label });
    });
  }

  private updateReadout(): void {
    const xs = this.xs;
    if (!xs || this.cursorPx == null || this.cursorPx < xs.p0 || this.cursorPx > xs.p1 || this.dragStart != null) {
      this.readout.hidden = true;
      return;
    }
    const xv = fromPx(xs, this.cursorPx);
    const [xsScale, xsPre] = prefixFor(Math.max(Math.abs(xs.lo), Math.abs(xs.hi)));
    const rows: string[] = [`<b>${(xv / xsScale).toPrecision(4)} ${xsPre}${this.cfg.x.unit}</b>`];
    for (const s of this.visibleSeries()) {
      if (s.noReadout) continue;
      const i = Math.min(lowerBound(s.x, xv), s.x.length - 1);
      const j = i > 0 && Math.abs(s.x[i - 1] - xv) < Math.abs(s.x[i] - xv) ? i - 1 : i;
      const ax = this.cfg.y.find((a) => a.id === (s.axis ?? this.cfg.y[0].id))!;
      const v = s.y[j];
      const [ps, pn] = prefixFor(Math.abs(v));
      rows.push(`<span style="color:${themed(s.color)}">●</span> ${s.label}: ${(v / ps).toPrecision(4)} ${pn}${ax.unit}`);
    }
    this.readout.innerHTML = rows.join('<br>');
    this.readout.hidden = false;
    const left = this.cursorPx + 14;
    const flip = left + this.readout.offsetWidth > this.w - 4;
    this.readout.style.left = `${flip ? this.cursorPx - this.readout.offsetWidth - 14 : left}px`;
  }

  private bindPointer(): void {
    const cv = this.canvas;
    const localX = (e: PointerEvent) => e.clientX - cv.getBoundingClientRect().left;
    const localY = (e: PointerEvent) => e.clientY - cv.getBoundingClientRect().top;
    cv.addEventListener('pointermove', (e) => {
      this.cursorPx = localX(e);
      if (this.dragStart != null) this.dragNow = this.cursorPx;
      this.requestDraw();
    });
    cv.addEventListener('pointerleave', () => {
      if (this.dragStart == null) {
        this.cursorPx = null;
        this.requestDraw();
      }
    });
    cv.addEventListener('pointerdown', (e) => {
      const x = localX(e);
      const y = localY(e);
      const hit = this.legendBoxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (hit) {
        if (this.hidden.has(hit.label)) this.hidden.delete(hit.label);
        else this.hidden.add(hit.label);
        this.requestDraw();
        return;
      }
      if (!this.xs || x < this.xs.p0 || x > this.xs.p1) return;
      this.dragStart = x;
      this.dragNow = x;
      this.cursorPx = x;
      cv.setPointerCapture(e.pointerId);
      this.requestDraw();
    });
    const end = (e: PointerEvent) => {
      if (this.dragStart == null || !this.xs) return;
      const a = this.dragStart;
      const b = localX(e);
      this.dragStart = null;
      this.dragNow = null;
      if (Math.abs(b - a) > 12) {
        const lo = fromPx(this.xs, Math.max(Math.min(a, b), this.xs.p0));
        const hi = fromPx(this.xs, Math.min(Math.max(a, b), this.xs.p1));
        if (hi > lo) {
          this.zoom = [lo, hi];
          this.resetBtn.hidden = false;
        }
      }
      this.requestDraw();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', () => {
      this.dragStart = null;
      this.dragNow = null;
      this.requestDraw();
    });
    cv.addEventListener('dblclick', () => this.resetZoom());
  }
}
