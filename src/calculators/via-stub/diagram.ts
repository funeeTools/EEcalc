/** Via stub: cross-section with the signal entering on L1, leaving on the exit layer, the stub below it and any back-drill. */

import type { CalcReport } from '@/core/calc/types';
import { pcbRect } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { VIA_PX, spansWithout, viaBarrel, viaCopper, viaLaminate, viaLegend, viaMask, type Span } from '@/calculators/via-calculator/viaKit';
import type { StubState } from './def';

const fLen = (m: number) => si(m, 'm', 3);
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const MAX_DRAWN = 24;

export function stubDiagram(s: StubState, r: CalcReport): SVGSVGElement | null {
  if (!(s.h > 0) || !(s.nL >= 2) || !(s.exit >= 1) || s.exit > s.nL) return null;
  const sch = new Schematic(460, 292);
  const failed = !r.ok;
  const res = (k: string) => (r.ok ? r.results.find((x) => x.key === k) : undefined);
  const cu = VIA_PX.cu;
  const x0 = 34;
  const x1 = 296;
  const cx = 178;
  const yTop = 74;
  const hPx = 156;
  const yBot = yTop + hPx;
  const k = hPx / s.h;
  // no drill input here: a generic via, the same proportions as the other via pages
  const dPx = 16;
  const w = VIA_PX.wallMin;
  const padPx = 30;
  const apPx = 46;
  const bdPx = dPx + 8;
  const nL = Math.round(s.nL);
  const exit = Math.round(s.exit);
  const yLayer = (i: number) => (i === 1 ? yTop - cu : i === nL ? yBot : yTop + ((i - 1) * hPx) / (nL - 1) - cu / 2);
  const depth = (s.h * (exit - 1)) / (nL - 1);
  const full = s.h - depth;
  const resid = s.stub != null && s.stub < full ? s.stub : full;
  const backdrilled = resid < full - 1e-12;
  const yExit = yLayer(exit);
  const yStubEnd = exit === nL ? yBot + cu : Math.min(yExit + cu + resid * k, yBot + cu);
  const hole: Span = [cx - dPx / 2, cx + dPx / 2];
  const pad: Span = [cx - padPx / 2, cx + padPx / 2];
  const ap: Span = [cx - apPx / 2, cx + apPx / 2];
  const bdGap: Span = [cx - bdPx / 2 - 5, cx + bdPx / 2 + 5];

  viaLaminate(sch, x0, yTop, x1, yBot);
  // copper: L1 entry trace + pad, planes with antipads, the exit trace + pad, the bottom pad (gone if back-drilled)
  for (let i = 1; i <= nL; i++) {
    const y = yLayer(i);
    if (i === exit) {
      if (i === 1) viaCopper(sch, x0, x1, y, [hole]);
      else viaCopper(sch, pad[0], x1, y, [hole]);
      continue;
    }
    if (i === 1) viaCopper(sch, x0, pad[1], y, [hole]);
    else if (i === nL) viaCopper(sch, x0, x1, y, [backdrilled ? bdGap : ap]);
    else if (nL <= MAX_DRAWN) viaCopper(sch, x0, x1, y, [backdrilled && y > yStubEnd ? bdGap : ap]);
  }
  if (exit !== nL && !backdrilled) viaCopper(sch, pad[0], pad[1], yBot, [hole]);

  // barrel: used part, stub (red outline when the margin fails), back-drilled bore below the residual stub
  const st = r.ok ? r.status?.tone : '';
  const stubTone = st === 'fail' || st === 'warn' ? 'hl' : '';
  viaBarrel(sch, cx, yTop - cu, yExit + cu, dPx, w);
  if (yStubEnd > yExit + cu + 0.5) viaBarrel(sch, cx, yExit + cu, yStubEnd, dPx, w, { tone: stubTone });
  if (backdrilled) pcbRect(sch, 'air', cx - bdPx / 2, yStubEnd, bdPx, yBot + cu - yStubEnd);

  // tented top; bottom mask with an opening at a back-drilled hole
  viaMask(sch, x0, x1, yTop, 'top', [[x0, exit === 1 ? x1 : pad[1]]]);
  const botCu = exit === nL ? [[pad[0], x1] as Span, ...spansWithout(x0, x1, [ap])] : [...spansWithout(x0, x1, [backdrilled ? bdGap : ap]), ...(backdrilled ? [] : [pad])];
  viaMask(sch, x0, x1, yBot, 'bottom', botCu, backdrilled ? [[cx - bdPx / 2 - 3, cx + bdPx / 2 + 3]] : []);

  // signal path: in on L1, down the barrel, out on the exit layer; the stub reflects
  const yIn = yTop - cu - VIA_PX.mask - 12;
  sch.arrow([x0 + 22, yIn], [pad[0] - 10, yIn]);
  sch.text(x0 + 4, yIn + 4, 'in', 'sch-hint', 'start');
  if (yExit - yTop > 22) sch.arrow([cx, yTop + 4], [cx, yExit - 4], { head: 6 });
  const yOut = exit === 1 ? yIn : Math.min(yExit + cu + 12, yBot - 6);
  if (exit === 1) sch.arrow([pad[1] + 10, yIn], [x1 - 26, yIn]);
  else sch.arrow([pad[1] + 8, yOut], [x1 - 28, yOut]);
  sch.text(x1 - 6, yOut + 4, 'out', 'sch-hint sch-halo', 'end');
  if (yStubEnd - yExit > 26) sch.arrow([cx, yExit + cu + 4], [cx, yStubEnd - 4], { head: 6, dashed: true, tone: stubTone });

  // stub length on the left of the barrel; back-drill depth below it
  const xs = cx - dPx / 2 - 12;
  const stubTxt = failed && s.solveFor === 'stub' ? '—' : fLen(resid);
  const solvedTone = s.solveFor === 'stub' ? (failed ? 'hl' : 'solved') : stubTone;
  if (yStubEnd - yExit > 4) {
    // the stub, ringed: dashed outline in the tone of its verdict (green when it is the solved unknown)
    sch.shape('rect', { x: cx - dPx / 2 - 4, y: yExit + cu + 1, width: dPx + 8, height: Math.max(yStubEnd - yExit - cu, 2), rx: 3, class: `sch-arrow dashed ${solvedTone}`.trim(), fill: 'none' });
    sch.dim([xs, yExit + cu], [xs, yStubEnd], '', { tone: solvedTone });
    const ym = Math.max((yExit + cu + yStubEnd) / 2, yExit + 14);
    sch.text(xs - 6, ym - 2, 'stub ℓ', `sch-label sch-halo ${solvedTone}`.trim(), 'end');
    sch.text(xs - 6, ym + 12, stubTxt, `sch-value sch-halo ${solvedTone}`.trim(), 'end');
  }
  if (backdrilled) {
    const xb = cx + bdPx / 2 + 12;
    sch.dim([xb, yStubEnd], [xb, yBot + cu], '', {});
    if (yBot - yStubEnd > 36) {
      const yb = (yStubEnd + yBot) / 2;
      sch.text(xb + 6, yb - 2, 'back-drill', 'sch-label sch-halo', 'start');
      sch.text(xb + 6, yb + 12, fLen(full - resid), 'sch-value sch-halo', 'start');
    } else sch.text(xb + 6, yBot + cu + VIA_PX.mask + 15, `back-drill ${fLen(full - resid)}`, 'sch-label', 'start');
  }

  // layer names and the board thickness on the right
  const lx = x1 + 6;
  sch.text(lx, yTop - cu + 3, 'L1', 'sch-hint', 'start');
  // keep the exit label clear of the L1 / bottom names when the exit layer is close to either face
  if (exit !== 1 && exit !== nL) sch.text(lx, clamp(yExit + 4, yTop + 16, yBot - 10), `L${exit} exit`, 'sch-label', 'start');
  if (exit === 1) sch.text(lx + 18, yTop - cu + 3, 'exit', 'sch-label', 'start');
  sch.text(lx, yBot + cu + 2, `L${nL}${exit === nL ? ' exit' : ''}`, exit === nL ? 'sch-label' : 'sch-hint', 'start');
  if (nL > MAX_DRAWN) sch.text(lx, (yTop + yBot) / 2 + 30, `${nL - 2} inner layers, not drawn`, 'sch-hint', 'start');
  const xH = 400;
  sch.dim([xH, yTop - cu], [xH, yBot + cu], '', {});
  sch.text(xH + 8, (yTop + yBot) / 2 - 4, 'H', 'sch-label', 'start');
  sch.text(xH + 8, (yTop + yBot) / 2 + 11, fLen(s.h), 'sch-value', 'start');

  // headline
  const fr = res('fres');
  const ka = res('kAch');
  const fN = res('fN');
  // one verdict for the headline: both red when the stub fails or misses its margin, else the computed margin green
  const kTone = !r.ok ? '' : stubTone === 'hl' ? 'hl' : 'solved';
  const fTxt = `f_res = ${fr ? fr.display : '—'}`;
  sch.text(16, 18, fTxt, `sch-label ${stubTone}`.trim(), 'start');
  sch.text(16 + fTxt.replace('_', '').length * 6.6 + 10, 18, `= ${ka ? ka.display : '—'}`, `sch-label ${kTone}`.trim(), 'start');
  const rateTxt = failed && s.solveFor === 'rate' ? '—' : si(s.rate, 'b/s', 4);
  sch.text(16, 34, `${rateTxt} ${s.mod === 'pam4' ? 'PAM4' : 'NRZ'} → f_N = ${fN ? fN.display : '—'}${s.cEnd ? ` · stub end loaded by C_end = ${si(s.cEnd, 'F', 3)}` : ''}`, `sch-hint ${s.solveFor === 'rate' && !failed ? 'solved' : ''}`.trim(), 'start');

  viaLegend(sch, 16, 266, ['mask', 'cu', 'fr4', 'air'], { cols: 4, colW: 108 });
  return sch.svg();
}
