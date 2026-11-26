/**
 * Cross-section of the whole stack, top to bottom. Each copper layer is a band of fixed height (not to
 * scale: a legible minimum), drawn as a solid plane, as traces in cross-section (signal), or as traces
 * plus a pour (mixed). Dielectric bands are scaled to their thickness with a minimum that fits their
 * label (“Prepreg 0.2 mm · εr 4.2”, written on the laminate). Mask covers the outer layers.
 * Left: layer name and copper thickness. Right: Z₀ at the entered width and the reference planes for
 * signal layers, “GND plane” / “PWR plane” for planes. Mirror pairs that break symmetry get a red ≠.
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type StackState, maskOf, pctSigned } from './def';
import { isPlane, isSignal, lineAt, symmetry, thickness } from './model';

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function stackDiagram(s: StackState, r: CalcReport): SVGSVGElement {
  const layers = s.layers.map((l) => ({ ...l }));
  const n = layers.length;
  const solving = s.solveFor === 'h' && s.solveIdx >= 0 && s.solveIdx < n - 1;
  const failed = !r.ok;
  if (solving && !failed) {
    const res = r.results.find((x) => x.key === `layers.${s.solveIdx}.h`);
    if (res && typeof res.value === 'number') layers[s.solveIdx].h = res.value;
  }
  const maskOn = s.mask;
  const th = thickness(layers, maskOn ? s.maskT : 0);

  // ── vertical layout
  const CU = 8; // copper band height (legible minimum, not to scale)
  const MASK = 5;
  const DMIN = 17; // smallest dielectric band (fits one label line)
  const nDiel = n - 1;
  const budget = Math.max(140, 21 * nDiel);
  const hSum = layers.slice(0, -1).reduce((a, l) => a + Math.max(l.h, 0), 0) || 1;
  const dPx = layers.slice(0, -1).map((l) => Math.max(DMIN, (Math.max(l.h, 0) / hSum) * budget));
  const top = 58;
  const xS0 = 98; // stack left
  const xS1 = 292; // stack right
  const ys: { cuTop: number; dTop: number }[] = [];
  let y = top + (maskOn ? MASK : 0);
  for (let i = 0; i < n; i++) {
    const cuTop = y;
    y += CU;
    ys.push({ cuTop, dTop: y });
    if (i < n - 1) y += dPx[i];
  }
  const yBot = y + (maskOn ? MASK : 0);
  const H = Math.ceil(yBot + 46);
  const sch = new Schematic(460, H);
  const mats = new Set<PcbMat>();

  // trace geometry: width roughly to the vertical scale of the dielectrics, clamped
  const kV = budget / hSum; // px per metre of dielectric
  const tw = clamp(s.w * kV, 7, 34);
  const traceXs = (count: number) => {
    const span = xS1 - xS0;
    return Array.from({ length: count }, (_, j) => xS0 + (span * (j + 0.5)) / count - tw / 2);
  };

  // ── dielectrics first (laminate), then copper, then mask
  for (let i = 0; i < n - 1; i++) {
    const solved = solving && i === s.solveIdx;
    mats.add('fr4');
    // laminate bands carry no edges of their own (one outline goes round the whole laminate), so a band and the
    // resin between the traces of an inner signal layer read as one dielectric
    if (solved) pcbRect(sch, 'fr4', xS0, ys[i].dTop, xS1 - xS0, dPx[i], { layer: 'back', tone: failed ? 'hl' : 'solved' });
    else pcbShape(sch, 'fr4', 'rect', { x: xS0, y: ys[i].dTop, width: xS1 - xS0, height: dPx[i], style: 'stroke: none' }, { layer: 'back' });
    const name = layers[i].diel === 'core' ? 'Core' : 'Prepreg';
    const hTxt = solved && failed ? '—' : si(layers[i].h, 'm', 3);
    sch.text(xS0 + 7, ys[i].dTop + dPx[i] / 2 + 4, `${name} ${hTxt} · ε_r ${+layers[i].er.toPrecision(3)}`, `sch-value sch-halo${solved ? (failed ? ' hl' : ' solved') : ''}`, 'start');
  }
  for (let i = 0; i < n; i++) {
    const l = layers[i];
    const yc = ys[i].cuTop;
    const outer = i === 0 || i === n - 1;
    if (isPlane(l.role)) {
      mats.add('cu');
      pcbRect(sch, 'cu', xS0, yc, xS1 - xS0, CU);
    } else {
      // between the traces: resin of the neighbouring prepreg (inner) or mask / air (outer)
      if (!outer) pcbShape(sch, 'fr4', 'rect', { x: xS0, y: yc - 0.5, width: xS1 - xS0, height: CU + 1, style: 'stroke: none' }, { layer: 'back' });
      else if (maskOn) {
        mats.add('mask');
        pcbRect(sch, 'mask', xS0, yc, xS1 - xS0, CU, { layer: 'back' });
      }
      const span = xS1 - xS0;
      const xs = l.role === 'mixed' ? [xS0 + span * 0.1, xS0 + span * 0.3] : traceXs(4);
      for (const x of xs) {
        mats.add('cu');
        pcbRect(sch, 'cu', x, yc, tw, CU);
      }
      if (l.role === 'mixed') pcbRect(sch, 'cu', xS0 + (xS1 - xS0) / 2 + 10, yc, (xS1 - xS0) / 2 - 10, CU);
    }
  }
  // outline of the laminate block
  sch.shape('rect', { x: xS0, y: ys[0].dTop, width: xS1 - xS0, height: ys[n - 1].cuTop - ys[0].dTop, class: 'pcb pcb-fr4', style: 'fill: none' }, 'back');
  if (maskOn) {
    mats.add('mask');
    pcbRect(sch, 'mask', xS0, top, xS1 - xS0, MASK);
    pcbRect(sch, 'mask', xS0, yBot - MASK, xS1 - xS0, MASK);
  }

  // ── left: layer names; right: Z₀ and references / plane names
  const sym = symmetry(layers);
  const badCu = new Set<number>();
  const badD = new Set<number>();
  for (const p of sym) if (p.issues.length) (p.kind === 'copper' ? badCu : badD).add(p.a).add(p.b);
  for (let i = 0; i < n; i++) {
    const yc = ys[i].cuTop + CU / 2 + 4;
    sch.text(10, yc, `L${i + 1}`, 'sch-label', 'start');
    sch.text(34, yc, si(layers[i].t, 'm', 2), 'sch-value', 'start');
    if (badCu.has(i)) sch.text(xS0 - 5, yc, '≠', 'sch-label hl', 'end');
    const l = layers[i];
    if (isSignal(l.role)) {
      const ln = lineAt(layers, i, s.w, maskOf(s));
      const refs = [ln.above, ln.below].filter(Boolean).map((q) => `L${q!.idx + 1}`).join('/');
      sch.text(xS1 + 8, yc, ln.z0 == null ? 'no reference' : `Z₀ ${si(ln.z0, 'Ω', 3)}`, ln.z0 == null ? 'sch-label hl' : 'sch-label', 'start');
      if (refs) sch.text(xS1 + 66, yc, `ref ${refs}`, 'sch-value', 'start');
    } else sch.text(xS1 + 8, yc, l.role === 'gnd' ? 'GND plane' : 'PWR plane', 'sch-hint', 'start');
  }
  for (let i = 0; i < n - 1; i++) if (badD.has(i)) sch.text(xS0 - 19, ys[i].dTop + dPx[i] / 2 + 4, '≠', 'sch-label hl', 'end');

  // centre of the stack (mirror axis): short ticks outside the stack edges
  const yMid = (top + yBot) / 2;
  sch.shape('line', { x1: xS0 - 14, y1: yMid, x2: xS0 - 2, y2: yMid, class: 'sch-dim', 'stroke-dasharray': '2 2' });
  sch.shape('line', { x1: xS1 + 2, y1: yMid, x2: xS1 + 14, y2: yMid, class: 'sch-dim', 'stroke-dasharray': '2 2' });

  // ── header: total against the target
  const dev = th.total / s.target - 1;
  const inTol = Math.abs(dev) <= s.tol / 100 + 1e-12;
  sch.text(10, 20, `${n}-layer stack · ${failed ? '—' : si(th.total, 'm', 4)}`, `sch-caption ${inTol ? '' : 'hl'}`.trim(), 'start');
  sch.text(10, 37, `target ${si(s.target, 'm', 3)} ± ${s.tol} %${failed ? '' : ` (${pctSigned(dev)})`}${sym.some((p) => p.issues.length) ? ' · ≠ breaks the mirror symmetry' : ' · symmetric'} · W = ${si(s.w, 'm', 3)}`, 'sch-hint', 'start');
  // total thickness dimension at the right edge of the stack column
  const xd = 452;
  sch.dim([xd, ys[0].cuTop], [xd, ys[n - 1].cuTop + CU], '', {});
  // its label on the dielectric band nearest the middle (no copper-row text there)
  let best = 0;
  for (let i = 0; i < n - 1; i++) if (Math.abs(ys[i].dTop + dPx[i] / 2 - yMid) < Math.abs(ys[best].dTop + dPx[best] / 2 - yMid)) best = i;
  sch.text(xd - 6, ys[best].dTop + dPx[best] / 2 + 4, failed ? '—' : si(th.total, 'm', 4), `sch-value ${inTol ? '' : 'hl'}`.trim(), 'end');

  const order: PcbMat[] = ['mask', 'cu', 'fr4'];
  pcbLegend(sch, 10, H - 12, order.filter((m) => mats.has(m)), { cols: 3, colW: 118, names: { fr4: 'Core / prepreg (FR-4)' } });
  return sch.svg();
}
