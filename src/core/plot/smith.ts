/**
 * Canvas Smith chart.
 *
 * Traces and points are given as reflection coefficients Γ = re + j·im. The grid can show impedance
 * (Z), admittance (Y) or both (Z+Y); the choice is a viewer preference kept in localStorage.
 * Major circles are labelled; lighter minor circles fill in between (clipped, as on a printed chart,
 * so they do not pile up at the open-circuit point).
 * Hovering draws the constant-|Γ| (VSWR) circle and the ∠Γ radial through the cursor and reads out
 * Γ, z, y, Z, VSWR and return loss. Points with a `dragId` can be dragged; `onDrag` reports the new Γ.
 */

import { h, storage } from '@/core/ui/dom';
import { themed } from '@/core/ui/theme';
import type { SmithPoint, SmithTrace } from '@/core/calc/types';
import { si } from '@/core/units';

export interface SmithData {
  z0: number;
  traces: SmithTrace[];
  points: SmithPoint[];
  /** Default grid when the viewer has not picked one: true → Z+Y */
  admittance?: boolean;
  title?: string;
}

export type SmithGrid = 'z' | 'y' | 'zy';

const GRID_KEY = 'eecalc:smith:grid';
const MAJOR = [0.2, 0.5, 1, 2, 5];
const MINOR = [0.1, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9, 1.2, 1.4, 1.6, 1.8, 3, 4, 10, 20];
/** How far a minor circle runs along the other family (r circles stop at |x| = lim, x arcs at r = lim). */
const minorLimit = (v: number) => (v < 1 ? 2 : v <= 2 ? 5 : 20);
const MAX_DRAG_MAG = 0.995;

/** Γ of the normalised impedance r + jx */
function gammaOf(r: number, x: number): [number, number] {
  const dr = r + 1;
  const den = dr * dr + x * x;
  return [((r - 1) * dr + x * x) / den, (2 * x) / den];
}

export class SmithChart {
  readonly el: HTMLElement;
  /** Called while a draggable point is dragged (Γ clamped to |Γ| ≤ 0.995). */
  onDrag: ((dragId: string, re: number, im: number) => void) | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readout: HTMLElement;
  private gridSeg: HTMLElement;
  private data: SmithData = { z0: 50, traces: [], points: [] };
  private grid: SmithGrid | null = storage.get<SmithGrid | null>(GRID_KEY, null);
  private ro: ResizeObserver;
  private raf = 0;
  private geo = { cx: 0, cy: 0, r: 1 };
  private hoverG: [number, number] | null = null;
  private dragging: string | null = null;

  constructor(host: HTMLElement) {
    this.canvas = h('canvas', { class: 'plot-canvas' });
    this.readout = h('div', { class: 'plot-readout smith-readout', hidden: true });
    this.gridSeg = h('div', { class: 'seg smith-grid-seg', role: 'group', 'aria-label': 'Grid' });
    this.el = h('div', { class: 'plot smith' }, this.canvas, this.gridSeg, this.readout);
    host.appendChild(this.el);
    this.ctx = this.canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.requestDraw());
    this.ro.observe(this.el);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', (e) => this.up(e));
    this.canvas.addEventListener('pointerleave', () => {
      if (this.dragging) return;
      this.hoverG = null;
      this.readout.hidden = true;
      this.requestDraw();
    });
    window.addEventListener('ee:theme', this.onTheme);
    this.renderGridSeg();
  }

  private onTheme = () => this.requestDraw();

  destroy(): void {
    window.removeEventListener('ee:theme', this.onTheme);
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }

  setData(d: SmithData): void {
    this.data = d;
    this.renderGridSeg();
    this.requestDraw();
  }

  private gridMode(): SmithGrid {
    return this.grid ?? (this.data.admittance ? 'zy' : 'z');
  }

  private renderGridSeg(): void {
    const mode = this.gridMode();
    this.gridSeg.replaceChildren(
      ...(
        [
          ['z', 'Z', 'Impedance grid'],
          ['y', 'Y', 'Admittance grid'],
          ['zy', 'Z+Y', 'Both grids'],
        ] as const
      ).map(([m, label, title]) =>
        h('button', {
          type: 'button',
          class: `seg-btn${m === mode ? ' active' : ''}`,
          title,
          onclick: () => {
            this.grid = m;
            storage.set(GRID_KEY, m);
            this.renderGridSeg();
            this.requestDraw();
          },
        }, label),
      ),
    );
  }

  private requestDraw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.draw());
  }

  private css(name: string, fallback: string): string {
    return getComputedStyle(this.el).getPropertyValue(name).trim() || fallback;
  }

  private px(re: number, im: number): [number, number] {
    const { cx, cy, r } = this.geo;
    return [cx + re * r, cy - im * r];
  }

  private toGamma(e: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [(e.clientX - rect.left - this.geo.cx) / this.geo.r, -(e.clientY - rect.top - this.geo.cy) / this.geo.r];
  }

  private draw(): void {
    const rect = this.el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(rect.width, 50);
    const hgt = Math.max(rect.height, 50);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(hgt * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${hgt}px`;
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, hgt);

    const ink = this.css('--plot-ink', '#2c2c2c');
    const muted = this.css('--plot-muted', '#7a7466');
    const bg = this.css('--plot-bg', '#fbfaf6');
    const font = this.css('--plot-font', '12px system-ui, sans-serif');
    const mode = this.gridMode();

    // Layout: title on top, disc on the left, legend on the right when there is room.
    const titleH = this.data.title ? 22 : 4;
    const top = titleH + 30; // room for the Z / Y / Z+Y switch
    const rFit = Math.max((hgt - top - 22) / 2, 20);
    let legendW = Math.min(190, w - 2 * rFit - 44);
    let r = rFit;
    if (legendW < 130) {
      // Not enough room beside a full-height disc: shrink the disc for a legend, or drop the legend.
      legendW = w >= 420 ? 130 : 0;
      r = Math.max(Math.min(rFit, (w - legendW - 44) / 2), 20);
    }
    this.geo = { cx: legendW ? 22 + r : w / 2, cy: top + r, r };
    const { cx, cy } = this.geo;

    if (this.data.title) {
      c.font = `600 ${font}`;
      c.fillStyle = ink;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.fillText(this.data.title, w / 2, 3, w - 10);
    }

    c.fillStyle = bg;
    c.beginPath();
    c.arc(cx, cy, r, 0, 2 * Math.PI);
    c.fill();

    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, 2 * Math.PI);
    c.clip();
    c.lineWidth = 1;
    if (mode !== 'z') this.drawGrid(-1, this.css('--smith-grid-y', 'rgba(196,123,23,0.36)'), this.css('--smith-grid-y-minor', 'rgba(196,123,23,0.13)'));
    if (mode !== 'y') this.drawGrid(1, this.css('--smith-grid', 'rgba(60,50,30,0.26)'), this.css('--smith-grid-minor', 'rgba(60,50,30,0.09)'));
    c.strokeStyle = this.css(mode === 'y' ? '--smith-grid-y' : '--smith-grid', 'rgba(60,50,30,0.26)');
    c.beginPath();
    c.moveTo(cx - r, cy);
    c.lineTo(cx + r, cy);
    c.stroke();
    c.restore();

    c.strokeStyle = ink;
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(cx, cy, r, 0, 2 * Math.PI);
    c.stroke();

    this.drawLabels(mode === 'y' ? -1 : 1, muted, font);

    // traces
    for (const t of this.data.traces) {
      c.strokeStyle = themed(t.color) ?? ink;
      c.lineWidth = t.width ?? 2;
      c.setLineDash(t.dash ?? []);
      c.beginPath();
      t.re.forEach((re, i) => {
        const [x, y] = this.px(re, t.im[i]);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.stroke();
      c.setLineDash([]);
    }

    this.drawCursor(ink, muted, font);

    // points (draggable ones get a ring)
    c.textBaseline = 'bottom';
    c.textAlign = 'left';
    for (const p of this.data.points) {
      const [x, y] = this.px(p.re, p.im);
      const col = themed(p.color) ?? ink;
      c.fillStyle = col;
      c.beginPath();
      c.arc(x, y, p.dragId ? 5.5 : 4.5, 0, 2 * Math.PI);
      c.fill();
      if (p.dragId) {
        c.strokeStyle = col;
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(x, y, this.dragging === p.dragId ? 11 : 9, 0, 2 * Math.PI);
        c.stroke();
      }
      c.font = `600 ${font}`;
      c.fillText(p.label, x + (p.dragId ? 10 : 6), y - 4);
    }

    if (legendW) this.drawLegend(w - legendW + 4, titleH + 34, legendW, ink, muted, font, mode);
  }

  /** One coordinate grid: s = +1 impedance, −1 admittance (the impedance grid rotated by 180°). */
  private drawGrid(s: 1 | -1, major: string, minor: string): void {
    const c = this.ctx;
    c.strokeStyle = minor;
    c.lineWidth = 0.8;
    for (const v of MINOR) {
      this.polyline(s, (t) => gammaOf(v, t), -minorLimit(v), minorLimit(v));
      this.polyline(s, (t) => gammaOf(t, v), 0, minorLimit(v));
      this.polyline(s, (t) => gammaOf(t, -v), 0, minorLimit(v));
    }
    c.strokeStyle = major;
    c.lineWidth = 1;
    this.circle(0, 0, 1);
    for (const rr of MAJOR) this.circle((s * rr) / (1 + rr), 0, 1 / (1 + rr));
    for (const x of MAJOR) {
      this.circle(s, 1 / x, 1 / x);
      this.circle(s, -1 / x, 1 / x);
    }
  }

  /** Curve Γ(t) for t from a to b, sampled evenly in atan(t) so it stays smooth for large t. */
  private polyline(s: 1 | -1, f: (t: number) => [number, number], a: number, b: number): void {
    const c = this.ctx;
    const n = 90;
    const ta = Math.atan(a);
    const tb = Math.atan(b);
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const [gr, gi] = f(Math.tan(ta + ((tb - ta) * i) / n));
      const [x, y] = this.px(s * gr, s * gi);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }

  private drawLabels(s: 1 | -1, muted: string, font: string): void {
    const c = this.ctx;
    c.font = font;
    c.fillStyle = muted;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    const { cy } = this.geo;
    for (const rr of MAJOR) {
      const [x] = this.px((s * (rr - 1)) / (rr + 1), 0);
      c.fillText(String(rr), x + 9 * s, cy - 2);
    }
    c.textBaseline = 'middle';
    for (const x of MAJOR) {
      for (const sgn of [1, -1]) {
        const [gr, gi] = gammaOf(0, x * sgn);
        const [px, py] = this.px(s * gr * 1.075, s * gi * 1.075);
        c.fillText(`${sgn > 0 ? '+' : '−'}j${x}`, px, py);
      }
    }
  }

  /** Constant-|Γ| circle and ∠Γ radial through the cursor (or the point being dragged). */
  private drawCursor(ink: string, muted: string, font: string): void {
    if (!this.hoverG) return;
    const c = this.ctx;
    const [gr, gi] = this.hoverG;
    const mag = Math.hypot(gr, gi);
    const { cx, cy, r } = this.geo;
    const ang = Math.atan2(gi, gr);
    c.save();
    c.strokeStyle = muted;
    c.lineWidth = 1.2;
    c.setLineDash([3, 4]);
    c.beginPath();
    c.arc(cx, cy, mag * r, 0, 2 * Math.PI);
    c.stroke();
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(ang) * r, cy - Math.sin(ang) * r);
    c.stroke();
    c.setLineDash([]);
    // angle arc near the centre, from the +real axis to the radial
    const ar = Math.min(28, mag * r * 0.8);
    if (ar > 8) {
      c.beginPath();
      c.arc(cx, cy, ar, 0, -ang, ang > 0);
      c.stroke();
    }
    // ∠Γ tag on the rim
    const deg = (ang * 180) / Math.PI;
    const text = `∠ ${deg.toFixed(1)}°`;
    c.font = `600 ${font}`;
    const tw = c.measureText(text).width + 10;
    const tx = cx + Math.cos(ang) * (r + 4) + (Math.cos(ang) >= 0 ? 0 : -tw);
    const ty = cy - Math.sin(ang) * (r + 4) + (Math.sin(ang) >= 0 ? -16 : 2);
    c.fillStyle = this.css('--readout-bg', 'rgba(251,250,246,0.96)');
    c.strokeStyle = this.css('--border-strong', '#bfb6a3');
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(tx, ty, tw, 16, 4);
    c.fill();
    c.stroke();
    c.fillStyle = ink;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(text, tx + 5, ty + 8.5);
    c.restore();
  }

  private drawLegend(x0: number, y: number, legendW: number, ink: string, muted: string, font: string, mode: SmithGrid): void {
    const c = this.ctx;
    c.font = font;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    for (const t of this.data.traces) {
      c.strokeStyle = themed(t.color) ?? ink;
      c.lineWidth = t.width ?? 2;
      c.setLineDash(t.dash ?? []);
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x0 + 20, y);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = ink;
      c.fillText(t.label, x0 + 26, y, legendW - 30);
      y += 18;
    }
    for (const p of this.data.points) {
      c.fillStyle = themed(p.color) ?? ink;
      c.beginPath();
      c.arc(x0 + 10, y, 4, 0, 2 * Math.PI);
      c.fill();
      c.fillStyle = ink;
      c.fillText(p.dragId ? `${p.label} (drag)` : p.label, x0 + 26, y, legendW - 30);
      y += 18;
    }
    c.fillStyle = muted;
    c.fillText(`Z₀ = ${si(this.data.z0, 'Ω')}`, x0, y + 6);
    if (mode === 'zy') c.fillText('orange: admittance grid', x0, y + 24, legendW - 6);
  }

  /** Circle in Γ-plane coordinates */
  private circle(gx: number, gy: number, gr: number): void {
    const [x, y] = this.px(gx, gy);
    this.ctx.beginPath();
    this.ctx.arc(x, y, gr * this.geo.r, 0, 2 * Math.PI);
    this.ctx.stroke();
  }

  private hitPoint(e: PointerEvent): SmithPoint | undefined {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: SmithPoint | undefined;
    let bestD = e.pointerType === 'touch' ? 22 : 12;
    for (const p of this.data.points) {
      if (!p.dragId) continue;
      const [x, y] = this.px(p.re, p.im);
      const d = Math.hypot(x - mx, y - my);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private down(e: PointerEvent): void {
    const p = this.hitPoint(e);
    if (!p || !this.onDrag) return;
    e.preventDefault();
    this.dragging = p.dragId!;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = 'grabbing';
    this.move(e);
  }

  private up(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.canvas.style.cursor = '';
    this.requestDraw();
  }

  private move(e: PointerEvent): void {
    let [gr, gi] = this.toGamma(e);
    let mag = Math.hypot(gr, gi);
    if (this.dragging) {
      if (mag > MAX_DRAG_MAG) {
        gr *= MAX_DRAG_MAG / mag;
        gi *= MAX_DRAG_MAG / mag;
        mag = MAX_DRAG_MAG;
      }
      this.onDrag?.(this.dragging, gr, gi);
    } else this.canvas.style.cursor = this.onDrag && this.hitPoint(e) ? 'grab' : '';
    if (mag > 1) {
      this.hoverG = null;
      this.readout.hidden = true;
      this.requestDraw();
      return;
    }
    this.hoverG = [gr, gi];
    this.requestDraw();

    // z = (1 + Γ)/(1 − Γ), y = 1/z
    const dr = 1 - gr;
    const den = dr * dr + gi * gi;
    const zr = ((1 + gr) * dr - gi * gi) / den;
    const zi = ((1 + gr) * gi + gi * dr) / den;
    const zm = zr * zr + zi * zi;
    const z0 = this.data.z0;
    const vswr = (1 + mag) / (1 - mag);
    const rl = -20 * Math.log10(Math.max(mag, 1e-12));
    const cplx = (a: number, b: number, d = 3) => `${a.toFixed(d)} ${b >= 0 ? '+' : '−'} j${Math.abs(b).toFixed(d)}`;
    const lines = [
      `Γ = ${mag.toFixed(3)} ∠ ${((Math.atan2(gi, gr) * 180) / Math.PI).toFixed(1)}°`,
      `z = ${cplx(zr, zi)}`,
      `Z = ${si(zr * z0, 'Ω')} ${zi >= 0 ? '+' : '−'} j${si(Math.abs(zi) * z0, 'Ω')}`,
    ];
    if (this.gridMode() !== 'z' && zm > 0) lines.push(`y = ${cplx(zr / zm, -zi / zm)}`);
    lines.push(`VSWR ${vswr < 1e3 ? vswr.toFixed(2) : '∞'} · RL ${rl.toFixed(1)} dB`);
    this.readout.innerHTML = lines.join('<br>');
    this.readout.hidden = false;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    this.readout.style.left = `${x > rect.width / 2 ? x - this.readout.offsetWidth - 16 : x + 16}px`;
    this.readout.style.top = `${Math.min(Math.max(e.clientY - rect.top - 40, 4), rect.height - this.readout.offsetHeight - 4)}px`;
  }
}
