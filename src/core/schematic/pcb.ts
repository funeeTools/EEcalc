/**
 * PCB materials for diagrams: every cross-section, top view and stackup draws its materials through
 * these helpers, so each material looks the same on every calculator (colours: src/styles/pcb.css).
 *
 *   pcbRect(sch, 'fr4', x, y, w, h);                   // laminate, with its woven-glass texture
 *   pcbRect(sch, 'cu', x, y, w, t, { tone: 'solved' }); // copper, outlined as the solved part
 *   pcbShape(sch, 'mask', 'path', { d });               // any SVG primitive in a material
 *   pcbLegend(sch, x, y, ['mask', 'cu', 'fr4']);         // swatch key of the materials shown
 *
 * Textures are SVG patterns in one hidden <svg> shared by the whole document (ensurePcbDefs), so the
 * same diagram cloned elsewhere (hover cards) still finds them.
 */

import { Schematic, svgEl } from './schematic';

export type PcbMat = 'mask' | 'maskCu' | 'cu' | 'gold' | 'paste' | 'solder' | 'fr4' | 'fr4Bare' | 'silk' | 'hole' | 'air' | 'part' | 'cuHidden' | 'steel' | 'coat' | 'resin' | 'film';

/** Default legend names; diagrams may override them (e.g. 'Prepreg' / 'Core' for fr4). */
export const PCB_NAMES: Record<PcbMat, string> = {
  mask: 'Solder mask',
  maskCu: 'Mask over copper',
  cu: 'Copper',
  gold: 'Gold-plated copper',
  paste: 'Solder paste',
  solder: 'Solder',
  fr4: 'Laminate (FR-4)',
  fr4Bare: 'Bare laminate',
  silk: 'Silkscreen',
  hole: 'Drilled hole',
  air: 'Air',
  part: 'Component',
  cuHidden: 'Copper, other layer',
  steel: 'Stencil (steel)',
  coat: 'Conformal coat',
  resin: 'Via fill (epoxy)',
  film: 'Resistive film',
};

const CLASS: Record<PcbMat, string> = {
  mask: 'pcb-mask',
  maskCu: 'pcb-mask-cu',
  cu: 'pcb-cu',
  gold: 'pcb-gold',
  paste: 'pcb-paste',
  solder: 'pcb-solder',
  fr4: 'pcb-fr4',
  fr4Bare: 'pcb-fr4-bare',
  silk: 'pcb-silk',
  hole: 'pcb-hole',
  air: 'pcb-air',
  part: 'pcb-part',
  cuHidden: 'pcb-cu-hidden',
  steel: 'pcb-steel',
  coat: 'pcb-coat',
  resin: 'pcb-resin',
  film: 'pcb-film',
};

const TEXTURE: Partial<Record<PcbMat, string>> = { fr4: 'pcb-tex-weave', fr4Bare: 'pcb-tex-weave-bare', paste: 'pcb-tex-grain', steel: 'pcb-tex-brush' };

export const PCB_DEFS_ID = 'pcb-defs';

/** Add the shared texture patterns to the document once (no-op without a DOM). */
export function ensurePcbDefs(): void {
  if (typeof document === 'undefined' || document.getElementById(PCB_DEFS_ID)) return;
  const svg = svgEl('svg', { id: PCB_DEFS_ID, width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' });
  const defs = svgEl('defs', {});
  // Woven glass: bundles alternate horizontal and vertical in a 12-unit basket weave.
  const weave = (id: string, ink: string) => {
    const p = svgEl('pattern', { id, width: 12, height: 12, patternUnits: 'userSpaceOnUse' });
    for (const [x, y, w, h] of [[0.5, 1, 5, 2.2], [6.5, 7, 5, 2.2], [7.9, 0.5, 2.2, 5], [1.9, 6.5, 2.2, 5]]) p.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 1, class: ink }));
    return p;
  };
  const grain = svgEl('pattern', { id: 'pcb-tex-grain', width: 7, height: 7, patternUnits: 'userSpaceOnUse' });
  for (const [cx, cy, r] of [[1.5, 1.8, 0.9], [5, 3.2, 0.8], [2.8, 5.6, 0.75], [6.2, 6.4, 0.6], [4.1, 0.6, 0.5]]) grain.appendChild(svgEl('circle', { cx, cy, r, class: 'pcb-ink-grain' }));
  // Brushed steel: fine broken horizontal streaks.
  const brush = svgEl('pattern', { id: 'pcb-tex-brush', width: 16, height: 4, patternUnits: 'userSpaceOnUse' });
  for (const [x, y, w] of [[0, 0.6, 9], [11, 0.6, 4], [4, 2.6, 10]]) brush.appendChild(svgEl('rect', { x, y, width: w, height: 0.7, class: 'pcb-ink-brush' }));
  defs.append(weave('pcb-tex-weave', 'pcb-ink-weave'), weave('pcb-tex-weave-bare', 'pcb-ink-weave-bare'), grain, brush);
  svg.appendChild(defs);
  (document.body ?? document.documentElement).appendChild(svg);
}

export interface PcbOpts {
  /** 'solved' (green outline: the unknown) or 'hl' (red outline: a limit is exceeded) */
  tone?: '' | 'solved' | 'hl';
  /** 'back' puts it behind wires and other shapes (default 'front': the parts layer) */
  layer?: 'back' | 'front';
  /** Extra classes */
  cls?: string;
}

/** CSS class for a material, for diagrams that build SVG by hand. */
export function pcbClass(m: PcbMat, tone: PcbOpts['tone'] = ''): string {
  return `pcb ${CLASS[m]}${tone ? ` pcb-${tone}` : ''}`;
}

/** Any SVG primitive filled with a material (plus its texture, if it has one). */
export function pcbShape(sch: Schematic, m: PcbMat, tag: string, attrs: Record<string, string | number>, o: PcbOpts = {}): Schematic {
  const layer = o.layer ?? 'front';
  sch.shape(tag, { ...attrs, class: `${pcbClass(m, o.tone)}${o.cls ? ` ${o.cls}` : ''}` }, layer);
  const tex = TEXTURE[m];
  if (tex) {
    ensurePcbDefs();
    sch.shape(tag, { ...attrs, class: 'pcb-tex', fill: `url(#${tex})` }, layer);
  }
  return sch;
}

/** Axis-aligned rectangle of a material (rx for rounded pads). */
export function pcbRect(sch: Schematic, m: PcbMat, x: number, y: number, w: number, h: number, o: PcbOpts & { rx?: number } = {}): Schematic {
  return pcbShape(sch, m, 'rect', { x, y, width: Math.max(w, 0), height: Math.max(h, 0), ...(o.rx ? { rx: o.rx } : {}) }, o);
}

/**
 * Key of the materials shown: small swatches with names, in rows of `cols`. Returns the height used.
 * Put it in a consistent spot (bottom-left of the drawing) and list only the materials drawn.
 */
export function pcbLegend(sch: Schematic, x: number, y: number, mats: PcbMat[], o: { cols?: number; colW?: number; names?: Partial<Record<PcbMat, string>> } = {}): number {
  const cols = o.cols ?? 4;
  const colW = o.colW ?? 108;
  const rowH = 15;
  mats.forEach((m, i) => {
    const cx = x + (i % cols) * colW;
    const cy = y + Math.floor(i / cols) * rowH;
    pcbRect(sch, m, cx, cy - 8, 14, 9, { rx: m === 'hole' ? 4.5 : 1.5 });
    sch.text(cx + 19, cy, o.names?.[m] ?? PCB_NAMES[m], 'pcb-legend-text', 'start');
  });
  return Math.ceil(mats.length / cols) * rowH;
}
