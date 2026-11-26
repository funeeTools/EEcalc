/** BLDC Efficiency — page module: definition + theory + a power-flow Diagram (DC in → inverter → motor → shaft, losses out). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { RPM } from '../dc-motor-speed/model';
import { def, paramsOf, type BldcState } from './def';
import { point, type BldcPoint } from './model';
import { theory } from './theory';

function flow(st: BldcState, r: CalcReport): SVGSVGElement {
  const solved = (r.ok ? (r.details as { solved?: { i: number; tq: number; n: number } } | undefined)?.solved : undefined) ?? { i: st.i, tq: st.tq, n: st.n };
  let op: BldcPoint | null = r.ok ? (r.details as unknown as BldcPoint) : null;
  if (!op) {
    try {
      op = point(paramsOf(st), st.n, st.tq);
    } catch {
      op = null;
    }
  }
  const W = (p: number | undefined) => (p != null && Number.isFinite(p) ? si(p, 'W', 3) : '—');
  const pct = (p: number | undefined) => (op && p != null && op.pDc > 0 ? ` (${((p / op.pDc) * 100).toFixed(1)} %)` : '');
  const over = r.status?.text === 'VOLTAGE LIMIT';
  const s = new Schematic(440, 232);
  const y = 70;

  // DC input
  s.text(14, y - 30, `DC in ${si(st.vdc, 'V', 3)}`, 'sch-label', 'start');
  s.text(14, y + 18, W(op?.pDc), 'sch-value', 'start');
  s.arrow([14, y], [84, y]);
  // inverter
  s.block(84, y - 24, 92, 48, { label: 'Inverter', value: op && op.etaInv > 0 ? `η ${(op.etaInv * 100).toFixed(1)} %` : 'η —', tone: over ? 'hl' : '' });
  s.arrow([176, y], [232, y]);
  s.text(204, y - 9, W(op?.pMotorIn), 'sch-hint');
  // motor
  const iTone = st.solveFor === 'i' ? 'solved' : '';
  s.block(232, y - 24, 92, 48, { label: 'Motor', value: op && op.etaMotor > 0 ? `η ${(op.etaMotor * 100).toFixed(1)} %` : 'η —' });
  s.text(278, y - 32, `I ${si(solved.i, 'A', 3)}`, `sch-value ${iTone}`.trim());
  // shaft out
  s.arrow([324, y], [426, y], { tone: st.solveFor === 'tq' || st.solveFor === 'n' ? 'solved' : '' });
  s.text(426, y - 24, 'shaft', 'sch-label', 'end');
  s.text(426, y - 10, W(op?.pShaft), 'sch-value', 'end');
  s.text(426, y + 18, `${(solved.n / RPM).toFixed(0)} rpm`, `sch-value ${st.solveFor === 'n' ? (over ? 'hl' : 'solved') : ''}`.trim(), 'end');
  s.text(426, y + 31, si(solved.tq, 'N·m', 3), `sch-value ${st.solveFor === 'tq' ? 'solved' : ''}`.trim(), 'end');

  // loss arrows
  const yl = y + 24;
  const yEnd = 136;
  const inv: [string, number | undefined][] = [
    ['conduction', op?.pCond],
    ['switching', op?.pSw],
    ['control', op?.pCtrl],
  ];
  const mot: [string, number | undefined][] =
    st.lossForm === 'coeff'
      ? [
          ['copper', op?.pCu],
          ['iron', op?.pFe],
          ['friction', op?.pFw],
        ]
      : [
          ['copper', op?.pCu],
          ['iron + friction', op?.pNoLoad],
        ];
  const all = [...inv, ...mot].map(([, p]) => p ?? 0);
  const big = Math.max(...all);
  const draw = (x0: number, items: [string, number | undefined][], xText: number) => {
    items.forEach(([name, p], k) => {
      const x = x0 + k * 22;
      const tone = p != null && p > 0 && p === big ? 'hl' : 'muted';
      s.arrow([x, yl], [x, yEnd], { tone });
      s.text(xText, 156 + k * 15, `${name} ${W(p)}${pct(p)}`, `sch-value ${tone === 'hl' ? 'hl' : ''}`.trim(), 'start');
    });
  };
  draw(108, inv, 24);
  draw(256, mot, 232);
  s.text(24, 220, `losses ${W(op?.pLoss)} · largest in red`, 'sch-hint', 'start');
  return s.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: BldcState, r) => flow(s, r) },
};

export default mod;
