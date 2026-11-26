/**
 * Conductor-to-pad width, top view (one scale for everything shown). The trace comes up from the bottom under mask,
 * necks down to W, crosses the bare strip of the NSMD opening (exposed copper, gold) and joins the land. For a
 * rectangular land the other land of the two-terminal part sits beside it with its own connection: a trace, a
 * pour through relief spokes, or a pour joined directly (its whole opening then exposes copper). The spacing
 * between the two lands is illustrative.
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbLegend, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { CpwState } from './def';

const ORDER: PcbMat[] = ['mask', 'maskCu', 'gold', 'fr4Bare'];
const MM = 1e-3;

export function cpwDiagram(s: CpwState, r: CalcReport): SVGSVGElement | null {
  if (!(s.d > 0) || !(s.w > 0) || !(s.wr > 0) || !(s.e >= 0) || (s.shape === 'rect' && !(s.l > 0))) return null;
  const sch = new Schematic(460, 318);
  const failed = !r.ok;
  const fmt = (m: number) => si(m, 'm', 3);
  const tone = (k: CpwState['solveFor']) => (s.solveFor === k ? (failed ? 'hl' : 'solved') : '');
  const val = (k: CpwState['solveFor'], txt: string) => (failed && s.solveFor === k ? '—' : txt);
  const mats = new Set<PcbMat>(['mask']);
  const rect = s.shape === 'rect';
  const nsmd = s.padDef === 'nsmd';
  const two = rect && s.other !== 'none';
  const wAct = s.solveFor === 'w' ? Math.min(s.wr, s.w) : s.w;
  const over = r.ok && nsmd && r.status?.tone === 'fail';
  const lNeck = s.e + s.reg;

  // ── scale: lands across, land + opening down, routing width; illustrative land spacing G and relief gap
  const x0 = 14;
  const x1 = 446;
  const yT = 72;
  const yB = 236;
  const gRel = 0.25 * MM;
  // centre spacing: at least the illustrative gap, and enough that the routing trace clears the other land's
  // connection (its trace, or the pour round its relief) by 0.25 mm
  const bHalf = s.other === 'trace' ? s.wb / 2 : s.d / 2 + gRel + 0.15 * MM;
  const G = rect ? Math.max(s.l, s.d * 0.6, two ? s.wr / 2 + bHalf + 0.25 * MM - s.d : 0) : 0;
  const across = two ? 2 * (s.d + 2 * Math.max(s.e, s.other === 'spokes' ? gRel : 0)) + G : s.d + 2 * s.e;
  const down = (rect ? s.l : s.d) + 2 * s.e;
  const k = Math.min(300 / across, (rect ? 84 : 104) / down, 180 / Math.max(s.wr, s.d, s.w));
  const D = s.d * k;
  const L = (rect ? s.l : s.d) * k;
  const E = s.e * k;
  const xA = two ? (x0 + x1) / 2 - ((G + s.d) * k) / 2 : (x0 + x1) / 2;
  const xB = (x0 + x1) / 2 + ((G + s.d) * k) / 2;
  const yL0 = yT + 30; // land top
  const yEdge = yL0 + L; // land edge the trace joins (bottom)
  const cyR = yL0 + D / 2; // round land centre

  pcbRect(sch, 'mask', x0, yT, x1 - x0, yB - yT, { layer: 'back' });

  /** A trace from the land edge down to the panel bottom: wAt for the neck, wRun below it. */
  const traceDown = (cx: number, wAt: number, wRun: number, neckPx: number) => {
    mats.add('maskCu');
    const a = Math.max(wAt * k, 1.5);
    const b = Math.max(wRun * k, 1.5);
    const top = rect ? yEdge - 1 : cyR;
    if (Math.abs(a - b) < 0.5) pcbRect(sch, 'maskCu', cx - a / 2, top, a, yB - top);
    else {
      const yN = yEdge + neckPx;
      pcbShape(sch, 'maskCu', 'path', { d: `M ${cx - a / 2} ${top} L ${cx + a / 2} ${top} L ${cx + a / 2} ${yN} L ${cx + b / 2} ${yN + Math.min(Math.abs(b - a) / 2, 8)} L ${cx + b / 2} ${yB} L ${cx - b / 2} ${yB} L ${cx - b / 2} ${yN + Math.min(Math.abs(b - a) / 2, 8)} L ${cx - a / 2} ${yN} Z` });
    }
  };
  /** NSMD opening around a land (bare laminate), and the trace copper exposed inside it (gold). */
  const opening = (cx: number, wIn: number, exposedPour = false) => {
    if (!nsmd || E < 0.4) return;
    const m: PcbMat = exposedPour ? 'gold' : 'fr4Bare';
    mats.add(m);
    if (rect) pcbRect(sch, m, cx - D / 2 - E, yL0 - E, D + 2 * E, L + 2 * E, { rx: Math.min(E, 3) });
    else pcbShape(sch, m, 'circle', { cx, cy: cyR, r: D / 2 + E });
    if (exposedPour || !(wIn > 0)) return;
    mats.add('gold');
    const a = Math.max((wIn * k) / 2, 0.75);
    if (rect) pcbRect(sch, 'gold', cx - Math.min(a, D / 2 + E), yEdge, 2 * Math.min(a, D / 2 + E), E);
    else {
      const rho = D / 2 + E;
      const aa = Math.min(a, rho * 0.999);
      const yE = cyR + Math.sqrt(rho * rho - aa * aa);
      pcbShape(sch, 'gold', 'path', { d: `M ${cx - aa} ${cyR} L ${cx - aa} ${yE} A ${rho} ${rho} 0 0 0 ${cx + aa} ${yE} L ${cx + aa} ${cyR} Z` });
    }
  };
  const land = (cx: number, toneCls: '' | 'solved' | 'hl') => {
    mats.add('gold');
    if (!nsmd) {
      mats.add('maskCu');
      if (rect) pcbRect(sch, 'maskCu', cx - D / 2 - E, yL0 - E, D + 2 * E, L + 2 * E);
      else pcbShape(sch, 'maskCu', 'circle', { cx, cy: cyR, r: D / 2 + E });
    }
    if (rect) pcbRect(sch, 'gold', cx - D / 2, yL0, D, L, { tone: toneCls });
    else pcbShape(sch, 'gold', 'circle', { cx, cy: cyR, r: D / 2 }, { tone: toneCls });
  };

  // ── the other land first (its pour lies behind everything near it)
  if (two) {
    if (s.other === 'trace') {
      traceDown(xB, s.wb, s.wb, 0);
      opening(xB, s.wb);
      land(xB, '');
    } else {
      mats.add('maskCu');
      const R = gRel * k;
      const px0 = xB - D / 2 - R - Math.max(0.15 * MM * k, 8);
      pcbRect(sch, 'maskCu', px0, yT, x1 - px0, yB - yT);
      if (s.other === 'spokes') {
        // relief: copper cleared round the land (mask over bare laminate), crossed by the spokes
        pcbRect(sch, 'mask', xB - D / 2 - R, yL0 - R, D + 2 * R, L + 2 * R);
        const sw = Math.max(s.wsp * k, 1.5);
        const dirs: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (let i = 0; i < Math.min(s.ns, 8); i++) {
          const [dx, dy] = dirs[i % 4];
          const off = i >= 4 ? (i % 2 ? 1 : -1) * Math.min(D, L) * 0.25 : 0; // a second spoke per side, offset
          if (dx) pcbRect(sch, 'maskCu', dx > 0 ? xB + D / 2 - 1 : xB - D / 2 - R, yL0 + L / 2 - sw / 2 + off, R + 1, sw);
          else pcbRect(sch, 'maskCu', xB - sw / 2 + off, dy > 0 ? yEdge - 1 : yL0 - R, sw, R + 1);
        }
        opening(xB, 0);
      } else opening(xB, 0, true);
      land(xB, '');
    }
  }
  // ── this land and its trace
  const neckPx = Math.max(lNeck * k, 6);
  traceDown(xA, wAct, s.wr, neckPx);
  opening(xA, wAct);
  land(xA, s.solveFor === 'd' ? (failed ? 'hl' : 'solved') : over ? 'hl' : '');

  // ── dimensions
  const yD = yT - 12;
  const left = xA - D / 2;
  const right = xA + D / 2;
  for (const x of [left, right]) sch.shape('line', { x1: x, y1: rect ? yL0 : cyR, x2: x, y2: yD - 4, class: 'sch-dim' });
  sch.dim([left, yD], [right, yD], `D = ${val('d', fmt(s.d))}`, { tone: tone('d') });
  // W across the neck just past the opening, its label to the left (haloed over the mask)
  const yW = yEdge + E + Math.min(neckPx - E, 14) / 2 + 4;
  const aPx = Math.max(wAct * k, 1.5);
  // when W is the widest allowed but the routing trace is narrower, the trace drawn is W_r: label it plainly
  const wTone = over ? 'hl' : wAct < s.w * (1 - 1e-9) ? '' : tone('w');
  sch.dim([xA - aPx / 2, yW], [xA + aPx / 2, yW], '', { tone: wTone });
  const wTxt = `W = ${val('w', fmt(wAct))}`;
  const half = Math.max(aPx, s.wr * k) / 2;
  const necked = Math.abs(s.wr - wAct) > 1e-9 * s.wr && nsmd;
  const nTxt = `L_neck ≥ ${fmt(lNeck)}`;
  // labels left of the trace, away from the other land; a very wide routing trace leaves no room beside it, so they
  // move up beside the land, above the taper
  const leftOK = xA - half - 14 - Math.max(wTxt.length, necked ? nTxt.length : 0) * 6.4 > x0 + 4;
  const xLab = leftOK ? xA - half - 14 : xA - D / 2 - E - 10;
  const anchor = 'end';
  const yWl = leftOK ? yW + 4 : yEdge - 16;
  sch.text(xLab, yWl, wTxt, `sch-label sch-halo ${wTone}`.trim(), anchor);
  if (necked) {
    const xN = leftOK ? xA - half - 6 : xA - aPx / 2 - 6;
    sch.dim([xN, yEdge], [xN, yEdge + neckPx], '', {});
    sch.text(xLab, yWl + 16, nTxt, 'sch-label sch-halo', anchor);
  }
  // routing width at the bottom edge
  const bPx = Math.max(s.wr * k, 1.5);
  const yR = yB + 10;
  sch.dim([xA - bPx / 2, yR], [xA + bPx / 2, yR], '', {});
  sch.text(xA, yR + 15, `W_r = ${fmt(s.wr)}`, 'sch-label', 'middle');
  if (two) {
    const lab = s.other === 'trace' ? `W_b = ${fmt(s.wb)}` : s.other === 'spokes' ? `${s.ns} × ${fmt(s.wsp)} spokes` : 'pour, no relief';
    // a wide routing trace pulls the lands together: drop the other label a row if the two would touch
    const wrTxt = `W_r = ${fmt(s.wr)}`;
    const clash = xB - xA < ((wrTxt.length + lab.length) * 6.4) / 2 + 10;
    sch.text(xB, yR + (clash ? 30 : 15), lab, 'sch-label', 'middle');
    sch.text(xB, yD + 4, 'other land', 'sch-hint', 'middle');
  }

  // ── header
  const ratio = r.results.find((x) => x.key === 'ratio');
  const head = s.solveFor === 'w' ? `W_max = ${val('w', fmt(s.w))} at the land` : s.solveFor === 'd' ? `D_min = ${val('d', fmt(s.d))}` : `W/D = ${ratio && r.ok ? ratio.display : '—'}`;
  sch.text(x0, 16, `${head}  ·  limit ${(+s.k.toFixed(1))} %`, `sch-caption ${over ? 'hl' : tone(s.solveFor)}`.trim(), 'start');
  const bal = r.ok ? r.results.find((x) => x.key === 'balance') : undefined;
  sch.text(x0, 30, `${nsmd ? `NSMD, opening e = ${fmt(s.e)}` : 'SMD: mask covers the trace'}${bal ? ` · thermal balance ${bal.display}` : ''}${two ? ' · land spacing illustrative' : ''}`, `sch-hint ${bal && bal.tone === 'warn' ? 'hl' : ''}`.trim(), 'start');

  const names: Partial<Record<PcbMat, string>> = { maskCu: 'Copper under mask', gold: 'Exposed copper (ENIG)', fr4Bare: 'Bare laminate' };
  pcbLegend(sch, x0, 293, ORDER.filter((m) => mats.has(m)), { cols: 2, colW: 210, names });
  return sch.svg();
}
