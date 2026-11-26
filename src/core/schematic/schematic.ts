/**
 * Minimal SVG schematic builder. Two-terminal parts are placed between two points
 * (any orientation); leads are drawn automatically to the symbol body.
 *
 *   const s = new Schematic(640, 300);
 *   s.source(40, 60, 240, { kind: 'step', label: 'Vs' });
 *   s.resistor([40, 60], [140, 60], { label: 'R', value: '50 mΩ' });
 *   el.appendChild(s.svg());
 *
 * Tones (PartOpts.tone, or the tone argument): '' normal · 'solved' (the solve-for unknown, green like
 * the solved input) · 'hl' (a limit is exceeded / worst case, red) · 'muted' (context, e.g. source and
 * load impedances that are not part of the design).
 *
 * The same class draws block diagrams, thermal networks and cross-sections: see block(), amp(),
 * arrow(), dim() and shape().
 */

const NS = 'http://www.w3.org/2000/svg';
export type Pt = [number, number];
export type SourceKind = 'dc' | 'step' | 'ac' | 'impulse' | 'ramp';

export interface PartOpts {
  label?: string;
  /** Extra lines under the label (values) */
  value?: string | string[];
  /** CSS class modifier, e.g. 'hl' (highlight) or 'muted' */
  tone?: string;
  /** Put the label on the other side */
  flip?: boolean;
  /** Body length in px (default 36) */
  body?: number;
}

export function svgEl(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
}

const SUB = /_([\p{L}\p{N}−]+(?:,[\p{L}\p{N}−]+)*)/gu;

/** Fill an SVG text element, turning `_xy` into a subscript tspan. */
export function subText(t: SVGElement, s: string): SVGElement {
  if (!s.includes('_')) {
    t.textContent = s;
    return t;
  }
  let last = 0;
  for (const m of s.matchAll(SUB)) {
    if (m.index! > last) t.appendChild(document.createTextNode(s.slice(last, m.index)));
    const sub = svgEl('tspan', { class: 'sch-sub', dy: 3 }, m[1]);
    t.append(sub, svgEl('tspan', { dy: -3 }, '\u200b'));
    last = m.index! + m[0].length;
  }
  if (last < s.length) t.appendChild(document.createTextNode(s.slice(last)));
  return t;
}

export class Schematic {
  private root: SVGSVGElement;
  private gWires: SVGElement;
  private gParts: SVGElement;
  private gText: SVGElement;

  constructor(readonly width: number, readonly height: number, cls = '') {
    this.root = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: `schematic ${cls}`.trim(), role: 'img', preserveAspectRatio: 'xMidYMid meet' }) as SVGSVGElement;
    this.gWires = svgEl('g', { class: 'sch-wires' });
    this.gParts = svgEl('g', { class: 'sch-parts' });
    this.gText = svgEl('g', { class: 'sch-text' });
    this.root.append(this.gWires, this.gParts, this.gText);
  }

  svg(): SVGSVGElement {
    return this.root;
  }

  wire(points: Pt[], tone = ''): this {
    this.gWires.appendChild(svgEl('polyline', { points: points.map((p) => p.join(',')).join(' '), class: `sch-line ${tone}`.trim(), fill: 'none' }));
    return this;
  }

  dot(x: number, y: number, tone = ''): this {
    this.gWires.appendChild(svgEl('circle', { cx: x, cy: y, r: 3.2, class: `sch-dot ${tone}`.trim() }));
    return this;
  }

  /** Text; `_` starts a subscript running over letters, digits and commas (V_in, R_on, I_L,pk), as in field symbols. */
  text(x: number, y: number, s: string, cls = 'sch-label', anchor: 'start' | 'middle' | 'end' = 'middle'): this {
    this.gText.appendChild(subText(svgEl('text', { x, y, class: cls, 'text-anchor': anchor }), s));
    return this;
  }

  /** Dashed group box with a caption at top-left. */
  box(x: number, y: number, w: number, hgt: number, caption?: string, tone = ''): this {
    this.gWires.appendChild(svgEl('rect', { x, y, width: w, height: hgt, rx: 6, class: `sch-box ${tone}`.trim() }));
    if (caption) this.text(x + 6, y + 12, caption, `sch-caption ${tone}`.trim(), 'start');
    return this;
  }

  resistor(a: Pt, b: Pt, o: PartOpts = {}): this {
    const L = (o.body ?? 36) / 2;
    const n = 6;
    const step = (2 * L) / n;
    let d = `M ${-L} 0`;
    for (let i = 0; i < n; i++) d += ` L ${-L + step * (i + 0.5)} ${i % 2 ? 6 : -6}`;
    d += ` L ${L} 0`;
    return this.twoTerminal(a, b, L, [svgEl('path', { d, class: 'sch-body', fill: 'none' })], o);
  }

  inductor(a: Pt, b: Pt, o: PartOpts = {}): this {
    const L = (o.body ?? 36) / 2;
    const n = 4;
    const r = L / n;
    let d = `M ${-L} 0`;
    for (let i = 0; i < n; i++) d += ` a ${r} ${r} 0 0 1 ${2 * r} 0`;
    return this.twoTerminal(a, b, L, [svgEl('path', { d, class: 'sch-body', fill: 'none' })], o);
  }

  capacitor(a: Pt, b: Pt, o: PartOpts & { polarized?: boolean } = {}): this {
    const g = 4;
    const p = 12;
    const parts: SVGElement[] = [svgEl('line', { x1: -g, y1: -p, x2: -g, y2: p, class: 'sch-plate' })];
    if (o.polarized) {
      parts.push(svgEl('path', { d: `M ${g + 4} ${-p} Q ${g - 1} 0 ${g + 4} ${p}`, class: 'sch-plate', fill: 'none' }));
      parts.push(svgEl('text', { x: -g - 7, y: p + 9, class: 'sch-sign', 'text-anchor': 'middle' }, '+'));
    } else {
      parts.push(svgEl('line', { x1: g, y1: -p, x2: g, y2: p, class: 'sch-plate' }));
    }
    return this.twoTerminal(a, b, g, parts, o, 18);
  }

  /** Voltage source between top (+) and bottom (−) on a vertical line. */
  source(x: number, yTop: number, yBot: number, o: PartOpts & { kind?: SourceKind } = {}): this {
    return this.sourceBetween([x, yTop], [x, yBot], o);
  }

  /** Voltage source between a (+) and b (−), any orientation; glyph stays upright. */
  sourceBetween(a: Pt, b: Pt, o: PartOpts & { kind?: SourceKind } = {}): this {
    const r = 17;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    this.wire([a, [cx - ux * r, cy - uy * r]]).wire([[cx + ux * r, cy + uy * r], b]);
    const g = svgEl('g', { transform: `translate(${cx},${cy})`, class: `sch-part ${o.tone ?? ''}`.trim() });
    g.appendChild(svgEl('circle', { cx: 0, cy: 0, r, class: 'sch-body', fill: 'var(--sch-fill)' }));
    const glyph: Record<string, string> = {
      dc: 'M -7 -3 L 7 -3 M -7 3 L -3 3 M 0 3 L 3 3 M 5 3 L 7 3',
      step: 'M -9 6 L -2 6 L -2 -6 L 9 -6',
      ramp: 'M -9 6 L -3 6 L 3 -6 L 9 -6',
      ac: 'M -9 0 C -5 -10, -1 -10, 0 0 S 5 10, 9 0',
      impulse: 'M -9 6 L -5 6 L -3 -7 C 0 -4, 3 2, 9 4',
    };
    g.appendChild(svgEl('path', { d: glyph[o.kind ?? 'dc'], class: 'sch-body', fill: 'none' }));
    const vertical = Math.abs(uy) >= Math.abs(ux);
    // "+" beside the positive lead (left of a vertical source, above a horizontal one), clear of the wire
    g.appendChild(svgEl('text', { x: vertical ? -9 : -ux * (r + 6), y: vertical ? -uy * (r + 2) + (uy > 0 ? 0 : 8) : -5, class: 'sch-sign', 'text-anchor': 'middle' }, '+'));
    this.gParts.appendChild(g);
    if (vertical) this.labels(cx - r - 8, cy, 'end', o);
    else this.labels(cx, cy - r - 8, 'middle', o, true);
    return this;
  }

  ground(x: number, y: number): this {
    this.gWires.appendChild(svgEl('path', { d: `M ${x - 11} ${y} L ${x + 11} ${y} M ${x - 7} ${y + 4} L ${x + 7} ${y + 4} M ${x - 3} ${y + 8} L ${x + 3} ${y + 8}`, class: 'sch-line' }));
    return this;
  }

  /** Diode from anode a to cathode b. kind: 'led' adds emission arrows, 'zener' / 'schottky' bend the bar. */
  diode(a: Pt, b: Pt, o: PartOpts & { kind?: 'diode' | 'led' | 'zener' | 'schottky' } = {}): this {
    const w = 8;
    const parts: SVGElement[] = [svgEl('path', { d: `M ${-w} ${-w} L ${w} 0 L ${-w} ${w} Z`, class: 'sch-body', fill: 'var(--sch-fill)' })];
    const bar = o.kind === 'zener' ? `M ${w - 4} ${-w - 3} L ${w} ${-w} L ${w} ${w} L ${w + 4} ${w + 3}` : o.kind === 'schottky' ? `M ${w + 4} ${-w + 3} L ${w + 4} ${-w} L ${w} ${-w} L ${w} ${w} L ${w - 4} ${w} L ${w - 4} ${w - 3}` : `M ${w} ${-w} L ${w} ${w}`;
    parts.push(svgEl('path', { d: bar, class: 'sch-body', fill: 'none' }));
    if (o.kind === 'led') {
      // emission arrows on the side opposite the label (below a horizontal diode, left of a vertical one)
      for (const dx of [-4, 3]) parts.push(svgEl('path', { d: `M ${dx} ${w + 3} l 6 8 m 0 0 l -0.4 -4.5 m 0.4 4.5 l -4.5 -0.6`, class: 'sch-line', fill: 'none' }));
    }
    return this.twoTerminal(a, b, w, parts, o);
  }

  /** Thermistor / variable resistor: a resistor with a diagonal bar (and a "t°" tag for thermistors). */
  thermistor(a: Pt, b: Pt, o: PartOpts & { tag?: string } = {}): this {
    const L = (o.body ?? 36) / 2;
    const parts: SVGElement[] = [
      svgEl('rect', { x: -L, y: -6, width: 2 * L, height: 12, class: 'sch-body', fill: 'var(--sch-fill)' }),
      svgEl('path', { d: `M ${-L + 2} 12 L ${-L + 8} 12 L ${L - 4} -12`, class: 'sch-line', fill: 'none' }),
    ];
    const g = this.twoTerminal(a, b, L, parts, o);
    if (o.tag !== '') {
      const cx = (a[0] + b[0]) / 2;
      const cy = (a[1] + b[1]) / 2;
      const vertical = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
      this.text(vertical ? cx - 16 : cx + L + 4, vertical ? cy + 4 : cy + 22, o.tag ?? '−t°', 'sch-hint', vertical ? 'end' : 'start');
    }
    return g;
  }

  /** SPST switch from a to b (open unless closed: true). */
  switch(a: Pt, b: Pt, o: PartOpts & { closed?: boolean } = {}): this {
    const L = (o.body ?? 30) / 2;
    const parts: SVGElement[] = [
      svgEl('circle', { cx: -L, cy: 0, r: 2.4, class: 'sch-body', fill: 'var(--sch-fill)' }),
      svgEl('circle', { cx: L, cy: 0, r: 2.4, class: 'sch-body', fill: 'var(--sch-fill)' }),
      svgEl('line', { x1: -L + 2, y1: -1, x2: L - 2, y2: o.closed ? -2 : -13, class: 'sch-body' }),
    ];
    return this.twoTerminal(a, b, L, parts, o);
  }

  /** Loudspeaker between a and b (body drawn beside the line, cone pointing away). */
  speaker(a: Pt, b: Pt, o: PartOpts = {}): this {
    const parts: SVGElement[] = [
      svgEl('rect', { x: -9, y: -6, width: 18, height: 12, class: 'sch-body', fill: 'var(--sch-fill)' }),
      // cone opposite the label (below a horizontal speaker, left of a vertical one)
      svgEl('path', { d: 'M -9 6 L -16 18 L 16 18 L 9 6', class: 'sch-body', fill: 'var(--sch-fill)' }),
    ];
    return this.twoTerminal(a, b, 9, parts, o);
  }

  /** Circle symbol with a letter in it (motor 'M', generator 'G', meter 'V'/'A') between a and b. */
  circleSym(a: Pt, b: Pt, letter: string, o: PartOpts = {}): this {
    const r = 15;
    return this.twoTerminal(a, b, r, [svgEl('circle', { cx: 0, cy: 0, r, class: 'sch-body', fill: 'var(--sch-fill)' })], o).letter(a, b, letter, o.tone);
  }

  private letter(a: Pt, b: Pt, s: string, tone = ''): this {
    return this.text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 5, s, `sch-sym ${tone}`.trim());
  }

  /**
   * Triangle amplifier / op-amp pointing right, centred at (x, y). Returns pin coordinates.
   * opamp: true draws − (top) and + (bottom) inputs; otherwise a single input on the left.
   */
  amp(x: number, y: number, o: { size?: number; opamp?: boolean; label?: string; value?: string | string[]; tone?: string; inside?: string } = {}): { in: Pt; inN: Pt; inP: Pt; out: Pt } {
    const s = o.size ?? 60;
    const xl = x - s / 2;
    const xr = x + s / 2;
    const hh = s * 0.6;
    const tone = o.tone ?? '';
    const g = svgEl('g', { class: `sch-part ${tone}`.trim() });
    g.appendChild(svgEl('path', { d: `M ${xl} ${y - hh} L ${xl} ${y + hh} L ${xr} ${y} Z`, class: 'sch-body', fill: 'var(--sch-fill)' }));
    const d = hh * 0.5;
    if (o.opamp) {
      g.appendChild(svgEl('path', { d: `M ${xl + 5} ${y - d} l 9 0 M ${xl + 5} ${y + d} l 9 0 M ${xl + 9.5} ${y + d - 4.5} l 0 9`, class: 'sch-line', fill: 'none' }));
    }
    this.gParts.appendChild(g);
    if (o.inside) this.text(x - s * 0.12, y + 4, o.inside, `sch-value ${tone}`.trim());
    const lines = [o.label, ...(Array.isArray(o.value) ? o.value : o.value ? [o.value] : [])].filter(Boolean) as string[];
    lines.forEach((t, i) => this.text(x, y + hh + 15 + i * 13, t, i === 0 && o.label ? `sch-label ${tone}`.trim() : `sch-value ${tone}`.trim()));
    return { in: [xl, y], inN: [xl, y - d], inP: [xl, y + d], out: [xr, y] };
  }

  /**
   * Solid labelled box (IC, ADC, regulator, heat source…). Pin names can be printed inside the edge
   * with pin(); the label sits in the middle, value lines under it.
   */
  block(x: number, y: number, w: number, hgt: number, o: { label?: string; value?: string | string[]; tone?: string; rx?: number } = {}): this {
    const tone = o.tone ?? '';
    this.gParts.appendChild(svgEl('rect', { x, y, width: w, height: hgt, rx: o.rx ?? 4, class: `sch-block ${tone}`.trim() }));
    const lines = [o.label, ...(Array.isArray(o.value) ? o.value : o.value ? [o.value] : [])].filter(Boolean) as string[];
    const y0 = y + hgt / 2 - ((lines.length - 1) * 13) / 2 + 4;
    lines.forEach((t, i) => this.text(x + w / 2, y0 + i * 13, t, i === 0 && o.label ? `sch-label ${tone}`.trim() : `sch-value ${tone}`.trim()));
    return this;
  }

  /** Pin name just inside a block edge at (x, y); side is the edge the pin leaves from. */
  pin(x: number, y: number, name: string, side: 'left' | 'right' | 'top' | 'bottom'): this {
    const dx = side === 'left' ? 4 : side === 'right' ? -4 : 0;
    const dy = side === 'top' ? 12 : side === 'bottom' ? -5 : 4;
    return this.text(x + dx, y + dy, name, 'sch-pin', side === 'left' ? 'start' : side === 'right' ? 'end' : 'middle');
  }

  /** Arrow from a to b (signal flow, heat flow, current direction, radiation). Drawn on top of parts. */
  arrow(a: Pt, b: Pt, o: { tone?: string; dashed?: boolean; head?: number } = {}): this {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const hd = o.head ?? 7;
    const cls = `sch-arrow ${o.tone ?? ''} ${o.dashed ? 'dashed' : ''}`.replace(/\s+/g, ' ').trim();
    this.gText.appendChild(svgEl('line', { x1: a[0], y1: a[1], x2: b[0] - ux * hd * 0.6, y2: b[1] - uy * hd * 0.6, class: cls }));
    const px = -uy;
    const py = ux;
    const p1: Pt = [b[0] - ux * hd + px * hd * 0.45, b[1] - uy * hd + py * hd * 0.45];
    const p2: Pt = [b[0] - ux * hd - px * hd * 0.45, b[1] - uy * hd - py * hd * 0.45];
    this.gText.appendChild(svgEl('path', { d: `M ${b[0]} ${b[1]} L ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} Z`, class: `sch-arrowhead ${o.tone ?? ''}`.trim() }));
    return this;
  }

  /**
   * Dimension line between a and b with end ticks and a label (cross-sections, lengths).
   * The label sits at the midpoint, offset by `off` px perpendicular to the line (default: above / left).
   * Drawn on top of parts and shapes, so it stays visible over filled cross-sections.
   */
  dim(a: Pt, b: Pt, label: string, o: { off?: number; anchor?: 'start' | 'middle' | 'end'; tone?: string } = {}): this {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const t = 5;
    const tone = o.tone ?? '';
    this.gText.appendChild(svgEl('path', { d: `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} M ${a[0] - uy * t} ${a[1] + ux * t} L ${a[0] + uy * t} ${a[1] - ux * t} M ${b[0] - uy * t} ${b[1] + ux * t} L ${b[0] + uy * t} ${b[1] - ux * t}`, class: `sch-dim ${tone}`.trim(), fill: 'none' }));
    const off = o.off ?? 10;
    const vertical = Math.abs(uy) > Math.abs(ux);
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (vertical) this.text(mx - off, my + 4, label, `sch-label ${tone}`.trim(), o.anchor ?? 'end');
    else this.text(mx, my - off + (off < 0 ? 8 : 0), label, `sch-label ${tone}`.trim(), o.anchor ?? 'middle');
    return this;
  }

  /**
   * Any SVG primitive (rect, circle, ellipse, path, polygon…) on the parts layer, or behind the wires
   * with layer 'back'. Use the shared classes: sch-body (outline), sch-block (filled box), xs-sub
   * (dielectric), xs-cu (copper), xs-air, xs-hot / xs-cool (heat), sch-fill-solved / sch-fill-hl.
   */
  shape(tag: string, attrs: Record<string, string | number>, layer: 'back' | 'front' = 'front'): this {
    const e = svgEl(tag, attrs);
    if (layer === 'back') this.root.insertBefore(e, this.gWires);
    else this.gParts.appendChild(e);
    return this;
  }

  /** Antenna symbol whose feed point is (x, y); the mast goes up. */
  antenna(x: number, y: number, o: { size?: number; tone?: string } = {}): this {
    const s = o.size ?? 26;
    const g = svgEl('g', { class: `sch-part ${o.tone ?? ''}`.trim() });
    this.gParts.appendChild(g);
    g.appendChild(svgEl('path', { d: `M ${x} ${y} L ${x} ${y - s} M ${x} ${y - s * 0.55} L ${x - s * 0.5} ${y - s * 1.15} M ${x} ${y - s * 0.55} L ${x + s * 0.5} ${y - s * 1.15} M ${x - s * 0.5} ${y - s * 1.15} L ${x + s * 0.5} ${y - s * 1.15}`, class: 'sch-body', fill: 'none' }));
    return this;
  }

  /**
   * Bipolar transistor centred at (x, y), base lead to the left (right when mirror). Returns the pin
   * ends: base, collector and emitter. NPN has the collector on top; PNP has the emitter on top, so
   * either one reads with the supply above it. Labels go on the side away from the base.
   */
  bjt(x: number, y: number, o: PartOpts & { type?: 'npn' | 'pnp'; mirror?: boolean } = {}): { b: Pt; c: Pt; e: Pt } {
    const m = o.mirror ? -1 : 1;
    const pnp = o.type === 'pnp';
    const tone = o.tone ?? '';
    const g = svgEl('g', { transform: `translate(${x},${y}) scale(${m},1)`, class: `sch-part ${tone}`.trim() });
    g.appendChild(svgEl('circle', { cx: 2, cy: 0, r: 19, class: 'sch-body', fill: 'var(--sch-fill)' }));
    g.appendChild(svgEl('path', { d: 'M -26 0 L -7 0 M -7 -12 L -7 12 M -7 -6 L 10 -17 L 10 -30 M -7 6 L 10 17 L 10 30', class: 'sch-body', fill: 'none' }));
    // Emitter arrow: out of the base for NPN (bottom leg), into the base for PNP (top leg).
    const head = pnp ? 'M -1 -9.9 L 6.5 -11.1 L 3.2 -16.2 Z' : 'M 8.6 16.1 L 1.1 14.8 L 4.4 9.8 Z';
    g.appendChild(svgEl('path', { d: head, class: 'sch-headfill' }));
    this.gParts.appendChild(g);
    this.labels(x + m * 26, y, o.mirror ? 'end' : 'start', o);
    const top: Pt = [x + m * 10, y - 30];
    const bot: Pt = [x + m * 10, y + 30];
    return { b: [x - m * 26, y], c: pnp ? bot : top, e: pnp ? top : bot };
  }

  /**
   * Enhancement MOSFET centred at (x, y), gate lead to the left (right when mirror), body tied to the
   * source. Returns gate, drain and source pin ends: N-channel has the drain on top, P-channel the source.
   */
  mosfet(x: number, y: number, o: PartOpts & { type?: 'n' | 'p'; mirror?: boolean } = {}): { g: Pt; d: Pt; s: Pt } {
    const m = o.mirror ? -1 : 1;
    const p = o.type === 'p';
    const tone = o.tone ?? '';
    const g = svgEl('g', { transform: `translate(${x},${y}) scale(${m},1)`, class: `sch-part ${tone}`.trim() });
    // The body is strapped to the source: the bottom lead for N-channel, the top one for P-channel.
    g.appendChild(svgEl('path', {
      d: `M -26 0 L -11 0 M -11 -13 L -11 13 M -5 -15 L -5 -7 M -5 -4 L -5 4 M -5 7 L -5 15 M -5 -11 L 10 -11 L 10 -30 M -5 11 L 10 11 L 10 30 M -5 0 L 10 0 L 10 ${p ? -11 : 11}`,
      class: 'sch-body',
      fill: 'none',
    }));
    // Body arrow on the middle segment: into the channel for N, out of it for P.
    g.appendChild(svgEl('path', { d: p ? 'M 8 0 L 1 -3.6 L 1 3.6 Z' : 'M -4 0 L 3 -3.6 L 3 3.6 Z', class: 'sch-headfill' }));
    this.gParts.appendChild(g);
    this.labels(x + m * 18, y, o.mirror ? 'end' : 'start', o);
    const top: Pt = [x + m * 10, y - 30];
    const bot: Pt = [x + m * 10, y + 30];
    return { g: [x - m * 26, y], d: p ? bot : top, s: p ? top : bot };
  }

  /** Quartz crystal from a to b: a plate between two electrodes. */
  crystal(a: Pt, b: Pt, o: PartOpts = {}): this {
    const parts: SVGElement[] = [
      svgEl('line', { x1: -8, y1: -10, x2: -8, y2: 10, class: 'sch-plate' }),
      svgEl('line', { x1: 8, y1: -10, x2: 8, y2: 10, class: 'sch-plate' }),
      svgEl('rect', { x: -4, y: -13, width: 8, height: 26, class: 'sch-body', fill: 'var(--sch-fill)' }),
    ];
    return this.twoTerminal(a, b, 8, parts, o, 18);
  }

  /** Small open circle marking a terminal / port, with an optional label to one side. */
  terminal(x: number, y: number, label?: string, anchor: 'start' | 'middle' | 'end' = 'end'): this {
    this.gParts.appendChild(svgEl('circle', { cx: x, cy: y, r: 3.4, class: 'sch-body', fill: 'var(--sch-fill)' }));
    if (label) this.text(anchor === 'end' ? x - 8 : anchor === 'start' ? x + 8 : x, anchor === 'middle' ? y - 9 : y + 4, label, 'sch-label', anchor);
    return this;
  }

  /** gap: distance from the line to the label baseline of a horizontal part (taller bodies need more) */
  private twoTerminal(a: Pt, b: Pt, halfLen: number, body: SVGElement[], o: PartOpts, gap = 14): this {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    const tone = o.tone ?? '';
    this.wire([a, [cx - ux * halfLen, cy - uy * halfLen]], tone);
    this.wire([[cx + ux * halfLen, cy + uy * halfLen], b], tone);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const g = svgEl('g', { transform: `translate(${cx},${cy}) rotate(${ang})`, class: `sch-part ${tone}`.trim() });
    g.append(...body);
    this.gParts.appendChild(g);
    // Labels: above horizontal parts, right of vertical parts.
    const vertical = Math.abs(uy) > Math.abs(ux);
    if (vertical) this.labels(cx + (o.flip ? -18 : 18), cy, o.flip ? 'end' : 'start', o);
    else this.labels(cx, o.flip ? cy + gap + 8 : cy - gap, 'middle', o, !o.flip);
    return this;
  }

  private labels(x: number, y: number, anchor: 'start' | 'middle' | 'end', o: PartOpts, above = false): void {
    const lines = [o.label, ...(Array.isArray(o.value) ? o.value : o.value ? [o.value] : [])].filter(Boolean) as string[];
    if (!lines.length) return;
    const lh = 13;
    const tone = o.tone ? ` ${o.tone}` : '';
    let y0 = above ? y - (lines.length - 1) * lh : y - ((lines.length - 1) * lh) / 2 + 4;
    lines.forEach((s, i) => {
      this.text(x, y0, s, i === 0 && o.label ? `sch-label${tone}` : `sch-value${tone}`, anchor);
      y0 += lh;
    });
  }
}
