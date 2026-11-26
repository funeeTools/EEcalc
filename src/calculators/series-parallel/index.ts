/** Series / parallel resistors — page module: definition + theory + network drawing. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { si } from '@/core/units';
import { type SpState, def } from './def';
import { type Rung, parallelDrawing, seriesDrawing } from './diagram';
import type { PartOp } from './model';
import { theory } from './theory';

const sub = (i: number) => `R${'₁₂₃₄₅₆₇₈'[i] ?? i + 1}`;

function circuit(s: SpState, r: CalcReport): SVGSVGElement {
  const d = (r.ok ? r.details : null) as { rs: number[]; req: number; op: { v: number; i: number; parts: PartOp[] } } | null;
  const solving = s.solveFor === 'rk';
  const k = Math.min(Math.max(s.solveIdx | 0, 0), s.parts.length - 1);
  // A series row of 4 leaves about 72 px per part: show only its voltage there.
  const crowded = s.topo === 'series' && s.parts.length > 3;
  const rungs: Rung[] = s.parts.map((p, i) => {
    const op = d?.op.parts[i];
    const rv = d ? d.rs[i] : p.r;
    const hot = op ? !(Math.abs(op.p) <= 0.5 && Math.abs(op.v) <= 500) : false; // beyond a 2512 chip at 2× margin
    return {
      name: sub(i),
      value: solving && i === k && !d ? '?' : si(rv, 'Ω', 3),
      side: op ? (s.topo === 'series' ? (crowded ? si(op.v, 'V', 3) : `${si(op.v, 'V', 3)} · ${si(op.p, 'W', 3)}`) : `${si(op.i, 'A', 3)} · ${si(op.p, 'W', 3)}`) : '',
      tone: solving && i === k ? 'solved' : hot ? 'hl' : '',
    };
  });
  const src = s.drive === 'v' ? { kind: 'v' as const, label: 'V', value: si(s.v, 'V', 4) } : { kind: 'i' as const, label: 'I', value: si(s.i, 'A', 4) };
  const reqTxt = d ? `R_eq = ${si(d.req, 'Ω', 4)}` : 'R_eq = —';
  if (s.topo === 'series') {
    return seriesDrawing(rungs, src, { text: d ? `I ${si(d.op.i, 'A', 3)}` : 'I', tone: '' }, reqTxt, solving ? '' : 'solved');
  }
  return parallelDrawing(rungs, src, { caption: `${reqTxt}${d ? ` · V ${si(d.op.v, 'V', 3)}` : ''}`, captionTone: solving ? '' : 'solved' });
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: SpState, r) => circuit(s, r) },
};

export default mod;
