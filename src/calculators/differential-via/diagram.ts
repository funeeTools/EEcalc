/**
 * Differential via: top view of the pair on a plane layer (barrels, pads, antipads / shared clearance) and a
 * cross-section of one barrel with its stub. Drawn with the shared PCB material kit and the via family of the
 * via pages (src/calculators/via-calculator/viaKit.ts), so the barrel, pads and planes look the same everywhere.
 */

import type { CalcReport } from '@/core/calc/types';
import { type PcbMat, pcbRect, pcbShape } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { VIA_PX, spansWithout, viaBarrel, viaCopper, viaLaminate, viaLegend, viaMask, type Span } from '@/calculators/via-calculator/viaKit';
import type { DiffViaState } from './def';

const fLen = (m: number) => si(m, 'm', 3);
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

export function viaDiagram(s: DiffViaState, r: CalcReport): SVGSVGElement | null {
  if (!(s.d > 0) || !(s.p > 0) || !(s.h > 0)) return null;
  const sch = new Schematic(460, 302);
  const solved = s.solveFor;
  const res = r.results.find((x) => x.key === solved && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === solved ? (failed ? 'hl' : 'solved') : '');
  const get = (k: string) => (r.ok ? r.results.find((x) => x.key === k) : undefined);

  // ── top view of a plane layer, centred at (cx, cy); the widest feature spans ≤ 130 px
  const cx = 118;
  const cy = 136;
  const span = Math.max(s.model === 'none' ? 0 : s.D, s.p + Math.max(s.pad, s.d), s.p * 1.4);
  const k = 130 / span;
  const pPx = clamp(s.p * k, 30, 110);
  const dPx = clamp(s.d * k, 5, pPx - 6);
  const padPx = clamp(s.pad * k, dPx + 4, pPx + 20);
  const xa = cx - pPx / 2;
  const xb = cx + pPx / 2;
  const plane = { x: cx - 100, y: cy - 64, w: 200, h: 128 };
  if (s.model === 'shared') {
    // one clearance (or ground-via ring) of diameter D around both barrels: the D geometry carries the solve tone
    const DPx = clamp(s.D * k, pPx + dPx + 4, 130);
    pcbRect(sch, 'cu', plane.x, plane.y, plane.w, plane.h, { rx: 3, layer: 'back' });
    pcbShape(sch, 'fr4Bare', 'circle', { cx, cy, r: DPx / 2 }, { tone: tone('D') as '' | 'solved' | 'hl', layer: 'back' });
  } else if (s.model === 'separate') {
    const DPx = clamp(s.D * k, padPx + 2, pPx - 2);
    pcbRect(sch, 'cu', plane.x, plane.y, plane.w, plane.h, { rx: 3, layer: 'back' });
    for (const x of [xa, xb]) pcbShape(sch, 'fr4Bare', 'circle', { cx: x, cy, r: DPx / 2 }, { tone: tone('D') as '' | 'solved' | 'hl', layer: 'back' });
  } else {
    pcbRect(sch, 'fr4Bare', plane.x, plane.y, plane.w, plane.h, { rx: 3, layer: 'back' });
  }
  for (const x of [xa, xb]) {
    pcbShape(sch, 'cu', 'circle', { cx: x, cy, r: padPx / 2 });
    pcbShape(sch, 'hole', 'circle', { cx: x, cy, r: Math.max(dPx / 2 - 1.4, 1.5) }, { tone: tone('d') as '' | 'solved' | 'hl' });
  }
  sch.text(xa, cy + 4, '+', 'sch-label sch-halo');
  sch.text(xb, cy + 4, '−', 'sch-label sch-halo');
  // dimensions: p above, d / D below
  const yP = 52;
  const ext = (x: number, y0: number, y1: number) => sch.shape('line', { x1: x, y1: y0, x2: x, y2: y1, class: 'sch-dim' });
  ext(xa, cy - padPx / 2 - 2, yP - 3);
  ext(xb, cy - padPx / 2 - 2, yP - 3);
  sch.dim([xa, yP], [xb, yP], `p = ${solved === 'p' && failed ? '—' : fLen(s.p)}`, { tone: tone('p'), off: 7 });
  const yBot = cy + 64 + 18;
  sch.text(cx, yBot, `d = ${solved === 'd' && failed ? '—' : fLen(s.d)} · pad ${fLen(s.pad)}`, `sch-value ${tone('d')}`.trim());
  if (s.model !== 'none') sch.text(cx, yBot + 15, `${s.model === 'shared' ? 'clearance / ring' : 'antipads'} D = ${solved === 'D' && failed ? '—' : fLen(s.D)}`, `sch-value ${tone('D')}`.trim());
  else sch.text(cx, yBot + 15, 'no plane or ground via nearby', 'sch-hint');
  sch.text(18, 22, 'Top view (plane layer)', 'sch-caption', 'start');

  // ── cross-section of one barrel: entry on top, exit at ℓ_use, stub below (back-drilled if set)
  const x0 = 268;
  const x1 = 394;
  const sx = 331;
  const yTop = 62;
  const Hpx = 156;
  const yB = yTop + Hpx;
  const scale = Hpx / s.h;
  const cu = VIA_PX.cu;
  const bPx = 14;
  const padS = 26;
  const apS = s.model === 'none' ? 0 : s.model === 'shared' ? 60 : 40;
  const yExit = yTop + clamp(s.lUse * scale, 0, Hpx);
  const stubFull = s.h - s.lUse;
  const stub = s.backdrill != null ? Math.min(s.backdrill, stubFull) : stubFull;
  const backdrilled = s.backdrill != null && stubFull - stub > 0;
  const yStubEnd = yExit + stub * scale;
  const hole: Span = [sx - bPx / 2, sx + bPx / 2];
  const pad: Span = [sx - padS / 2, sx + padS / 2];
  const ap: Span = [sx - apS / 2, sx + apS / 2];
  const bdGap: Span = [sx - bPx / 2 - 9, sx + bPx / 2 + 9];
  viaLaminate(sch, x0, yTop, x1, yB);
  // planes: five, evenly spaced, cleared around the barrel (none for the two-wire model)
  if (s.model !== 'none') {
    for (let i = 1; i < 6; i++) {
      const y = yTop + (Hpx * i) / 6 - cu / 2;
      if (Math.abs(y - yExit) < 5) continue;
      viaCopper(sch, x0, x1, y, [backdrilled && y > yStubEnd ? bdGap : ap]);
    }
  }
  viaCopper(sch, x0, pad[1], yTop - cu, [hole]);
  if (yExit > yTop + 1) viaCopper(sch, pad[0], x1, yExit - cu / 2, [hole]);
  if (!backdrilled && stub > 0) viaCopper(sch, pad[0], pad[1], yB, [hole]);
  const ilStub = get('ilStub');
  const stubBad = ilStub?.tone === 'warn';
  viaBarrel(sch, sx, yTop - cu, Math.max(yExit + cu / 2, yTop), bPx, VIA_PX.wallMin);
  if (stub > 0) viaBarrel(sch, sx, yExit + cu / 2, Math.min(yStubEnd, yB + cu), bPx, VIA_PX.wallMin, { tone: stubBad ? 'hl' : '' });
  if (backdrilled) pcbRect(sch, 'air', sx - bPx / 2 - 4, yStubEnd, bPx + 8, yB + cu - yStubEnd);
  viaMask(sch, x0, x1, yTop, 'top', [[x0, pad[1]]]);
  const botCu = [...(s.model === 'none' ? [] : spansWithout(x0, x1, [backdrilled ? bdGap : ap])), ...(!backdrilled && stub > 0 ? [pad] : [])];
  viaMask(sch, x0, x1, yB, 'bottom', botCu, backdrilled ? [[sx - bPx / 2 - 6, sx + bPx / 2 + 6]] : []);
  if (stub > 0 && yStubEnd - yExit > 6) sch.shape('rect', { x: sx - bPx / 2 - 4, y: yExit + cu / 2 + 1, width: bPx + 8, height: Math.max(yStubEnd - yExit - cu / 2, 2), rx: 3, class: `sch-arrow dashed ${stubBad ? 'hl' : ''}`.trim(), fill: 'none' });
  // a very shallow exit leaves no room for the dimension: its label would sit on the Z_diff headline
  if (yExit - yTop >= 30) {
    sch.dim([x0 - 8, yTop - cu], [x0 - 8, yExit], '', {});
    sch.text(x0 - 12, (yTop + yExit) / 2 - 5, 'ℓ_use', 'sch-label sch-halo', 'end');
    sch.text(x0 - 12, (yTop + yExit) / 2 + 14, fLen(s.lUse), 'sch-value sch-halo', 'end');
  } else if (yExit - yTop >= 14) {
    sch.dim([x0 - 8, yTop - cu], [x0 - 8, yExit], '', {});
    sch.text(x0 - 12, (yTop + yExit) / 2 + 4, `ℓ_use ${fLen(s.lUse)}`, 'sch-value sch-halo', 'end');
  }
  else sch.text(x0 - 4, yExit + 14, `ℓ_use = ${fLen(s.lUse)}`, 'sch-value', 'end');
  if (stub > 0) sch.text(x1 + 6, Math.max((yExit + yStubEnd) / 2 + 4, yExit + 18), 'stub', stubBad ? 'sch-label hl' : 'sch-label', 'start');
  if (stub > 0) sch.text(x1 + 6, Math.max((yExit + yStubEnd) / 2 + 4, yExit + 18) + 14, fLen(stub), stubBad ? 'sch-value hl' : 'sch-value', 'start');
  if (backdrilled) sch.text(x1 + 6, yB + cu + 2, 'back-drilled', 'sch-hint', 'start');
  sch.text(x1 + 6, yExit + 4, 'exit', 'sch-hint', 'start');
  sch.text(sx, yB + cu + VIA_PX.mask + 16, `H = ${fLen(s.h)}`, 'sch-value');
  const fr = get('fRes');
  if (fr) sch.text(sx, yB + cu + VIA_PX.mask + 31, `f_res ${fr.display}`, stubBad ? 'sch-value hl' : 'sch-hint');
  sch.text(252, 22, 'Cross-section', 'sch-caption', 'start');
  const z = get('zdiff');
  sch.text(252, 38, `Z_diff = ${z ? z.display : '—'}`, `sch-label ${solved === 'zdiff' ? (r.ok ? 'solved' : 'hl') : ''}`.trim(), 'start');

  const mats: PcbMat[] = ['mask', 'cu', 'fr4', 'fr4Bare', 'hole', 'air'];
  viaLegend(sch, 18, 280, mats, { cols: 3, colW: 146, names: { fr4Bare: s.model === 'none' ? 'Bare laminate (no plane)' : 'Clearance (laminate)' } });
  return sch.svg();
}
