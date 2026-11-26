/** Current divider — page module: definition + theory + circuit drawing (parallel rungs shared with series-parallel). */

import { parallelDrawing } from '@/calculators/series-parallel/diagram';
import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { si } from '@/core/units';
import { type CdState, def } from './def';
import type { DividerOp } from './model';
import { theory } from './theory';

const sub = (i: number) => `R${'₁₂₃₄₅₆₇₈'[i] ?? i + 1}`;

function circuit(s: CdState, r: CalcReport): SVGSVGElement {
  const d = (r.ok ? r.details : null) as (DividerOp & { rs: number[]; k: number }) | null;
  const solving = s.solveFor !== 'out';
  const k = Math.min(Math.max(s.solveIdx | 0, 0), s.branches.length - 1);
  const rungs = s.branches.map((b, j) => {
    const hot = d ? !(d.p[j] <= 0.5 && Math.abs(d.vNode) <= 500) : false; // beyond a 2512 chip at 2× margin
    return {
      name: sub(j),
      value: d ? si(d.rs[j], 'Ω', 3) : solving && j === k ? '?' : si(b.r, 'Ω', 3),
      side: d ? `${si(d.i[j], 'A', 3)} · ${(d.share[j] * 100).toPrecision(3)} %` : '',
      tone: solving && j === k ? 'solved' : hot ? 'hl' : '',
      // the watched branch's current and share are computed (green) unless one of them is the target
      sideTone: j === k && !solving ? 'solved' : undefined,
    };
  });
  const src = s.drive === 'i' ? { kind: 'i' as const, label: 'I', value: si(s.i, 'A', 4) } : { kind: 'v' as const, label: 'V', value: si(s.v, 'V', 4) };
  const caption = d ? `V = ${si(d.vNode, 'V', 4)} across the branches · I_total ${si(d.iTotal, 'A', 4)}` : '';
  return parallelDrawing(rungs, src, { arrows: true, caption, rs: s.drive === 'v' ? { name: 'R_s', value: si(s.rs, 'Ω', 3) } : undefined });
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: CdState, r) => circuit(s, r) },
};

export default mod;
