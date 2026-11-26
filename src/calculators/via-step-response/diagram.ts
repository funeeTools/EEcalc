/**
 * Via step response: cross-section of the via in a 4-layer board (signal in on L1, out on L4, planes with antipads)
 * beside the lumped model it becomes (π, T, C only or L only), drawn at the same heights so pad ↔ capacitance and
 * barrel ↔ inductance line up.
 */

import type { CalcReport } from '@/core/calc/types';
import type { PcbMat } from '@/core/schematic/pcb';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { VIA_PX, clampPx, viaBarrel, viaCopper, viaLaminate, viaLegend, viaMask, wallPx } from '@/calculators/via-calculator/viaKit';
import type { StepState } from './def';

/** A length in the unit its input row shows (mil and in stay imperial, metric gets an SI prefix). */
const fU = (m: number, unit: string) => (unit === 'mil' ? `${+(m / 25.4e-6).toPrecision(3)} mil` : unit === 'in' ? `${+(m / 0.0254).toPrecision(3)} in` : si(m, 'm', 3));

export function stepDiagram(s: StepState, r: CalcReport): SVGSVGElement | null {
  if (!(s.d > 0) || !(s.h > 0) || !(s.pad > 0) || !(s.Da > 0)) return null;
  const sch = new Schematic(460, 318);
  const failed = !r.ok;
  const res = (k: string) => (r.ok ? r.results.find((x) => x.key === k) : undefined);
  const daTone = s.solveFor === 'Da' ? (failed ? 'hl' : 'solved') : '';
  const cu = VIA_PX.cu;

  // ── cross-section: one scale for the board and the pads where it fits (like the Via calculator page)
  const x0 = 16;
  const x1 = 232;
  const cx = 124;
  // one scale k for h, d and the pads (style guide §7b); h is clamped to 70–140 px and centred in its band
  const kx = Math.min(140 / s.h, 196 / Math.max(s.Da, s.pad));
  const hTrue = s.h * kx;
  const hPx = clampPx(hTrue, 70, 140);
  const yTop = 104 + (140 - hPx) / 2;
  const yBot = yTop + hPx;
  const dPx = clampPx(s.d * kx, 12, 100);
  const padPx = clampPx(s.pad * kx, dPx + 8, 180);
  const apPx = clampPx(s.Da * kx, padPx + 6, 204);
  const pairs: [string, number, number][] = [['h', hPx, hTrue], ['d', dPx, s.d * kx], ['D_pad', padPx, s.pad * kx], ['D_ap', apPx, s.Da * kx]];
  const up = pairs.filter(([, px, tru]) => px > tru + 0.5).map(([n]) => n);
  const down = pairs.filter(([, px, tru]) => px < tru - 0.5).map(([n]) => n);
  const off = [up.length ? `${up.join(', ')} enlarged to be visible` : '', down.length ? `${down.join(', ')} reduced to fit` : ''].filter(Boolean);
  sch.text(x1, 286, off.length ? off.join(' · ') : 'h, d, D_pad and D_ap to scale', 'sch-hint', 'end');
  const w = wallPx(25e-6, kx, dPx);
  const half = (p: number): [number, number] => [cx - p / 2, cx + p / 2];
  const hole = half(dPx);
  const pad = half(padPx);
  const ap = half(apPx);

  viaLaminate(sch, x0, yTop, x1, yBot);
  const yL2 = yTop + hPx / 3 - cu / 2;
  const yL3 = yTop + (2 * hPx) / 3 - cu / 2;
  viaCopper(sch, x0, pad[1], yTop - cu, [hole]);
  viaCopper(sch, x0, x1, yL2, [ap]);
  viaCopper(sch, x0, x1, yL3, [ap]);
  viaCopper(sch, pad[0], x1, yBot, [hole]);
  viaBarrel(sch, cx, yTop - cu, yBot + cu, dPx, w);
  viaMask(sch, x0, x1, yTop, 'top', [[x0, pad[1]]]);
  viaMask(sch, x0, x1, yBot, 'bottom', [[pad[0], x1]]);

  // the edge: in along L1 from the left, out along L4 to the right
  const yIn = yTop - cu - VIA_PX.mask - 12;
  if (pad[0] - 10 - (x0 + 22) > 18) {
    sch.arrow([x0 + 22, yIn], [pad[0] - 10, yIn]);
    sch.text(x0 + 2, yIn + 4, 'in', 'sch-hint', 'start');
  }
  const yOut = yBot + cu + VIA_PX.mask + 12;
  if (x1 - 26 - (pad[1] + 10) > 18) {
    sch.arrow([pad[1] + 10, yOut], [x1 - 26, yOut]);
    sch.text(x1 - 2, yOut + 4, 'out', 'sch-hint', 'end');
  }

  // dimensions: D_pad above, d across the hole, D_ap under L3
  const yPadDim = yIn - 14;
  sch.shape('line', { x1: pad[0], y1: yTop - cu - 1, x2: pad[0], y2: yPadDim - 2, class: 'sch-dim' });
  sch.shape('line', { x1: pad[1], y1: yTop - cu - 1, x2: pad[1], y2: yPadDim - 2, class: 'sch-dim' });
  sch.dim([pad[0], yPadDim], [pad[1], yPadDim], `D_pad = ${fU(s.pad, s.padUnit)}`, { off: 9 });
  const yD = (yL2 + yL3 + cu) / 2;
  sch.dim([hole[0], yD], [hole[1], yD], '');
  sch.text(hole[1] + 6, yD + 4, `d = ${fU(s.d, s.dUnit)}`, 'sch-label sch-halo', 'start');
  const yAp = yL3 + cu + 10;
  sch.dim([ap[0], yAp], [ap[1], yAp], '', { tone: daTone });
  const apText = `D_ap = ${failed && s.solveFor === 'Da' ? '—' : fU(s.Da, s.DaUnit)}`;
  const apCls = `sch-label sch-halo ${daTone}`.trim();
  const apW = apText.length * 6.6;
  if (ap[1] + 6 + apW <= x1 - 2) sch.text(ap[1] + 6, yAp + 4, apText, apCls, 'start');
  else if (ap[0] - 6 - apW >= x0 + 2) sch.text(ap[0] - 6, yAp + 4, apText, apCls, 'end');
  else sch.text(cx, yAp + 18, apText, apCls);

  // via length between the section and the model
  const xh = 246;
  sch.dim([xh, yTop - cu], [xh, yBot + cu], '');
  sch.text(xh + 6, (yTop + yBot) / 2 - 3, 'h', 'sch-label', 'start');
  sch.text(xh + 6, (yTop + yBot) / 2 + 12, fU(s.h, s.hUnit), 'sch-value', 'start');

  // ── lumped model on a vertical spine: port 1 at the top pad, port 2 at the bottom pad, return rail on the right
  const sx = 318;
  const rail = 406;
  // the model keeps its own fixed height (pads ↔ C/2 line up exactly when h is drawn full height)
  const yA = 104 - 22;
  const yB = 244 + 22;
  const cRes = res('c');
  const lRes = res('l');
  const cTxt = (k: number) => (cRes && typeof cRes.value === 'number' ? si(cRes.value * k, 'F', 3) : '—');
  const lTxt = (k: number) => (lRes && typeof lRes.value === 'number' ? si(lRes.value * k, 'H', 3) : '—');
  sch.terminal(sx, yA, '');
  sch.terminal(sx, yB, '');
  sch.text(sx + 8, yA - 4, 'Z₀ in', 'sch-hint', 'start');
  sch.text(sx + 8, yB + 12, 'Z₀ out', 'sch-hint', 'start');
  // labels go towards the middle of the spine, clear of the ports
  const shuntC = (y: number, label: string, k: number, below: boolean) => {
    sch.capacitor([sx, y], [rail, y], { label, value: cTxt(k), flip: below });
    sch.dot(sx, y);
  };
  const top = s.topology;
  if (top === 'pi') {
    const n1 = yA + 26;
    const n2 = yB - 26;
    sch.wire([[sx, yA], [sx, n1]]);
    sch.wire([[sx, n2], [sx, yB]]);
    sch.inductor([sx, n1], [sx, n2], { label: 'L', value: lTxt(1), body: 44 });
    shuntC(n1, 'C/2', 0.5, true);
    shuntC(n2, 'C/2', 0.5, false);
    sch.wire([[rail, n1], [rail, n2 + 14]]);
    sch.ground(rail, n2 + 14);
    sch.text(rail + 6, n1 + 4, 'planes', 'sch-hint', 'start');
  } else if (top === 'tee') {
    const mid = (yA + yB) / 2;
    // the half-inductance labels go left of the spine, so the shunt C keeps the right side to itself
    sch.inductor([sx, yA], [sx, mid], { label: 'L/2', value: lTxt(0.5), body: 36, flip: true });
    sch.inductor([sx, mid], [sx, yB], { label: 'L/2', value: lTxt(0.5), body: 36, flip: true });
    shuntC(mid, 'C', 1, false);
    sch.wire([[rail, mid], [rail, mid + 30]]);
    sch.ground(rail, mid + 30);
    sch.text(rail + 6, mid + 4, 'planes', 'sch-hint', 'start');
  } else if (top === 'c') {
    const mid = (yA + yB) / 2;
    sch.wire([[sx, yA], [sx, yB]]);
    shuntC(mid, 'C', 1, false);
    sch.wire([[rail, mid], [rail, mid + 30]]);
    sch.ground(rail, mid + 30);
    sch.text(rail + 6, mid + 4, 'planes', 'sch-hint', 'start');
  } else {
    sch.inductor([sx, yA], [sx, yB], { label: 'L', value: lTxt(1), body: 52 });
  }
  sch.text(sx - 14, 58, 'Lumped model', 'sch-caption', 'start');

  // headline: the slowdown (green: always computed) and its budget, then the edge
  const slow = res('slow');
  const trOut = res('trOut');
  const solvedTr = s.solveFor === 'tr';
  const verdict = slow ? (slow.tone === 'fail' ? 'hl' : 'solved') : '';
  sch.text(16, 18, `slowdown ${slow ? slow.display : '—'}`, `sch-label ${verdict}`.trim(), 'start');
  sch.text(178, 18, `budget ${+s.budget.toPrecision(4)} %`, 'sch-hint', 'start');
  const zv = res('zVia2');
  sch.text(16, 34, `t_r = ${failed && solvedTr ? '—' : si(s.tr, 's', 3)} → ${trOut ? trOut.display : '—'}`, `sch-hint ${solvedTr ? (failed ? 'hl' : 'solved') : ''}`.trim(), 'start');
  sch.text(178, 34, `Z_via = ${zv ? zv.display : '—'} · Z₀ = ${si(s.z0, 'Ω', 3)}`, 'sch-hint', 'start');

  const mats: PcbMat[] = ['mask', 'cu', 'fr4', 'air'];
  viaLegend(sch, 16, 308, mats, { cols: 4, colW: 110 });
  return sch.svg();
}
