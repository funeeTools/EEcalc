/**
 * Offset stripline cross-section (same frame as the other PCB impedance drawings): two planes, the trace H₁
 * above the lower one, and in dual-stripline mode the second signal layer’s crossing trace. The field arrows
 * split between the planes in proportion to the return current each carries.
 */

import type { CalcReport } from '@/core/calc/types';
import { pcbRect } from '@/core/schematic/pcb';
import { XS, caption, clamp, fLen, field, hDim, laminate, legend, newFrame, plane, solveTones, vDim } from '../controlled-impedance/xs';
import type { AsymState } from './def';

export function asymDiagram(s: AsymState, r?: CalcReport): SVGSVGElement | null {
  if (!(s.h1 > 0) || !(s.h2 > 0) || !(s.w > 0)) return null;
  const sch = newFrame();
  const { tone, val } = solveTones(s.solveFor, r);
  const { xL, xR, xDim } = XS;
  const yPlane = 200;
  const total = 140; // dielectric + trace between the planes, px
  const b = s.h1 + s.t + s.h2;
  const tPx = s.t > 0 ? clamp((s.t / b) * total, 3, 16) : 1.5;
  const avail = total - tPx;
  const h1Px = clamp((s.h1 / (s.h1 + s.h2)) * avail, 18, avail - 18);
  const h2Px = avail - h1Px;
  const px = h1Px / s.h1; // horizontal scale follows H₁
  const wPx = clamp(s.w * px, 14, 240);
  const cx = 205;
  const x0 = cx - wPx / 2;
  const x1 = cx + wPx / 2;
  const yTop = yPlane - total; // bottom of the upper plane
  const yTb = yPlane - h1Px; // trace bottom
  const yTt = yTb - tPx; // trace top

  laminate(sch, yTop, total);
  plane(sch, yPlane);
  pcbRect(sch, 'cu', xL, yTop - XS.plane, xR - xL, XS.plane, { layer: 'back' });
  pcbRect(sch, 'cu', x0, yTt, wPx, tPx);

  // ── second signal layer: a trace crossing at right angles appears cut lengthwise
  let yL2 = 0;
  const fit = s.dual && s.h2 > s.d + s.t;
  if (fit) {
    const dPx = clamp((s.d / s.h2) * h2Px, 8, h2Px - tPx - 8);
    yL2 = yTt - dPx - tPx;
    pcbRect(sch, 'cu', xL + 46, yL2, xR - xL - 92, tPx);
    sch.text(xR - 52, yL2 - 5, 'layer 2: trace crossing at 90°', 'sch-value sch-halo', 'end');
    vDim(sch, x1 + 22, yL2 + tPx, yTt, 'D', fLen(s.d), '', true);
  }

  // ── return-current split: arrows to each plane in proportion to its share
  const share = (r?.ok ? (r.results.find((x) => x.key === 'lowerShare')?.value as number) : NaN) || 0.5;
  const nDown = clamp(Math.round(share * 5), 1, 4);
  const nUp = clamp(5 - nDown, 1, 4);
  const spread = (n: number) => (n === 1 ? [0] : Array.from({ length: n }, (_, i) => -0.45 + (0.9 * i) / (n - 1)));
  const below = fit && yTt - (yL2 + tPx) < 30; // no room for the W dimension between the trace and layer 2
  for (const f of spread(nDown)) field(sch, [cx + f * wPx, yTb + 3], [cx + f * (wPx + 30), yPlane - 3]);
  const yUpEnd = fit ? yL2 + tPx + 3 : yTop + 3;
  const yUpStart = below ? yTt - 3 : yTt - 26; // start above the W label
  if (yUpStart - yUpEnd > 12) for (const f of spread(nUp)) field(sch, [cx + f * wPx, yUpStart], [cx + f * (wPx + 30), yUpEnd]);
  if (r?.ok) {
    const lo = `${Math.round(share * 100)} %`;
    const up = `${Math.round((1 - share) * 100)} %`;
    // when the W dimension sits under the trace there is no room by the planes: the split goes in the hint row
    if (!below) {
      sch.text(xL + 8, yPlane - 7, `${lo} of return current`, 'sch-hint sch-halo', 'start');
      sch.text(xL + 8, yTop + 15, `${up} of return current`, 'sch-hint sch-halo', 'start');
    }
  }

  // ── dimensions
  // layer 2 close above: W dimension under the trace with its label to the left (under the T label)
  if (below) hDim(sch, x0, x1, yTb + 12, yTb, `W = ${val('w', fLen(s.w))}`, tone('w'), { anchor: 'end', dx: 12, halo: true });
  else hDim(sch, x0, x1, yTt - 12, yTt, `W = ${val('w', fLen(s.w))}`, tone('w'), { halo: true });
  vDim(sch, xDim, yTb, yPlane, 'H₁', val('h1', fLen(s.h1)), tone('h1'));
  vDim(sch, xDim, yTop, yTt, 'H₂', val('h2', fLen(s.h2)), tone('h2'));
  if (s.t > 0) sch.text(x0 - 8, yTb - 1, `T = ${fLen(s.t)}`, 'sch-value sch-halo', 'end'); // left of the trace: the D and H dimensions are on the right
  sch.text(xR - 6, yPlane - 7, `ε_r = ${val('er', String(+s.er.toPrecision(4)))}`, `sch-label sch-halo ${tone('er')}`.trim(), 'end');
  const split = below && r?.ok ? ` · return ${Math.round((1 - share) * 100)} % upper / ${Math.round(share * 100)} % lower` : '';
  sch.text(xL, yPlane + XS.plane + 15, `planes ${fLen(b)} apart · ${split ? '' : 'trace off-centre '}(H₂/H₁ = ${(s.h2 / s.h1).toPrecision(3)})${split}`, 'sch-hint', 'start');

  const z0 = r?.results.find((x) => x.key === 'z0');
  caption(sch, [{ text: `Z₀ = ${s.solveFor === 'z0' && r && !r.ok ? '—' : z0 ? z0.display : `${+s.z0.toPrecision(4)} Ω`}`, tone: tone('z0') }, ...(r?.ok ? [{ text: `ε_eff = ${+s.er.toPrecision(4)}` }] : [])]);
  legend(sch, ['cu', 'fr4']);
  return sch.svg();
}
