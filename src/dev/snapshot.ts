/**
 * Dev only: picture the open calculator's diagram or graph as a PNG and post it to a local
 * collector, for reviewing pages in a browser that cannot take screenshots (hidden or headless
 * windows). The collector receives { name, png: dataURL }.
 *   const s = await import('/src/dev/snapshot.ts');
 *   await s.shotDiagram('555-astable');  await s.shotGraph('555-astable');
 */

const SINK = 'http://127.0.0.1:5198/';
const PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'paint-order', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'visibility', 'display', 'letter-spacing',
];

async function post(name: string, png: string, sink: string): Promise<string> {
  const r = await fetch(sink, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, png }) });
  return r.text();
}

/** In a hidden window requestAnimationFrame never fires, so canvases are never redrawn: use a timer instead. */
export function fixRaf(): void {
  if ((window as any).__rafFixed) return;
  (window as any).__rafFixed = true;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

/** The diagram tab's SVG with computed styles inlined (so it renders outside the page), at 2× scale. */
export async function shotDiagram(name: string, sink = SINK): Promise<string> {
  const svg = document.querySelector<SVGSVGElement>('.info-pane[data-tab="diagram"] svg');
  if (!svg) return 'no diagram';
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    // A pattern fill (fill="url(#…)") computes to an absolute URL that the standalone image cannot resolve: keep the attribute.
    const props = el.getAttribute('fill')?.startsWith('url(') ? PROPS.filter((p) => p !== 'fill') : PROPS;
    dst[i].setAttribute('style', props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  });
  // PCB textures live in one shared <svg> (core/schematic/pcb.ts): copy them in, styles inlined too.
  const defs = document.getElementById('pcb-defs')?.querySelector('defs');
  if (defs && new XMLSerializer().serializeToString(svg).includes('url(#pcb-')) {
    const dc = defs.cloneNode(true) as SVGDefsElement;
    const ds = [...defs.querySelectorAll('*')];
    [...dc.querySelectorAll('*')].forEach((el, i) => {
      const cs = getComputedStyle(ds[i]);
      el.setAttribute('style', PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
    });
    clone.insertBefore(dc, clone.firstChild);
  }
  const vb = svg.viewBox?.baseVal;
  const box = svg.getBoundingClientRect();
  const w = vb && vb.width ? vb.width : box.width || 600;
  const h = vb && vb.height ? vb.height : box.height || 400;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w * 2));
  clone.setAttribute('height', String(h * 2));
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const g = c.getContext('2d')!;
  g.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  return post(name, c.toDataURL('image/png'), sink);
}

/** The main graph canvas (and the companion graph, if any), redrawn first. */
export async function shotGraph(name: string, sink = SINK): Promise<string> {
  fixRaf();
  const ctl = (window as any).__eeShell?.controller;
  ctl?.run();
  await new Promise((r) => setTimeout(r, 150));
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.graph-host canvas')].filter((c) => c.width > 0 && c.offsetParent !== null);
  if (!canvases.length) return 'no graph canvas';
  const W = canvases.reduce((n, c) => n + c.width, 0);
  const H = Math.max(...canvases.map((c) => c.height));
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g = out.getContext('2d')!;
  g.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
  g.fillRect(0, 0, W, H);
  let x = 0;
  for (const c of canvases) {
    g.drawImage(c, x, 0);
    x += c.width;
  }
  return post(name, out.toDataURL('image/png'), sink);
}
