/** Comparator Hysteresis — page module: def + theory + a circuit drawing that follows the topology and output stage. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type CompState, def } from './def';
import { theory } from './theory';

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function circuit(st: CompState, r: CalcReport): SVGSVGElement {
  const s: CompState = (r.ok && (r.details?.state as CompState)) || st;
  const solvedR = s.solveFor === 'r2';
  const solvedV = s.solveFor === 'vth';
  const fR = (v: number, solved: boolean) => ((solved && !r.ok) || !ok(v) ? '?' : si(v, 'Ω', 3));
  const fV = (v: number, solved: boolean) => ((solved && !r.ok) || !ok(v) ? '?' : si(v, 'V', 4));
  const inv = s.topo === 'inv';
  const od = s.out === 'opendrain';
  const sch = new Schematic(460, 280);
  // comparator triangle drawn here so IN+ can sit on top (the shared amp() puts IN− on top)
  const xl = 220;
  const xo = 296;
  const yc = 160;
  const yP = 139;
  const yN = 181;
  sch.shape('path', { d: `M ${xl} ${yc - 46} L ${xl} ${yc + 46} L ${xo} ${yc} Z`, class: 'sch-body', fill: 'var(--sch-fill)' });
  sch.shape('path', { d: `M ${xl + 5} ${yP} l 10 0 M ${xl + 10} ${yP - 5} l 0 10 M ${xl + 5} ${yN} l 10 0`, class: 'sch-line', fill: 'none' });
  // feedback R₃ over the top, from IN+ to the output
  const xF = 200;
  const xT = 340;
  const yF = 85;
  sch.wire([[xF, yP], [xF, yF]]);
  sch.resistor([xF, yF], [xT, yF], { label: 'R₃', value: fR(s.r3, solvedR), tone: solvedR ? 'solved' : '' });
  sch.wire([[xT, yF], [xT, yc]]);
  sch.wire([[xo, yc], [420, yc]]).dot(xT, yc).dot(xF, yP);
  sch.terminal(420, yc).text(420, yc - 12, 'V_out', 'sch-label', 'end');
  if (od) {
    const xp = 388;
    sch.resistor([xp, 40], [xp, yc], { label: 'R_P', value: si(s.rp, 'Ω', 3) });
    sch.terminal(xp, 40).text(xp - 10, 44, `V_PU ${si(s.vpu, 'V', 3)}`, 'sch-label', 'end');
    sch.dot(xp, yc);
  }
  if (inv) {
    // divider R₁ (V_R → IN+) and R₂ (IN+ → ground); the input drives IN−
    const xd = 160;
    sch.terminal(xd, 30).text(xd - 10, 34, `V_R ${si(s.vr, 'V', 3)}`, 'sch-label', 'end');
    sch.resistor([xd, 30], [xd, yP], { label: 'R₁', value: si(s.r1, 'Ω', 3), flip: true });
    sch.resistor([xd, yP], [75, yP], { label: 'R₂', value: fR(s.r2, solvedR), tone: solvedR ? 'solved' : '' });
    sch.wire([[75, yP], [75, yP + 10]]).ground(75, yP + 10);
    sch.wire([[xd, yP], [xl, yP]]).dot(xd, yP);
    sch.wire([[30, yN], [xl, yN]]).terminal(30, yN);
    sch.text(30, yN + 20, 'V_in', 'sch-label', 'start');
  } else {
    // input through R₄ to IN+; IN− on the R₁/R₂ reference divider
    sch.terminal(30, yP).text(30, yP - 12, 'V_in', 'sch-label', 'start');
    sch.resistor([30, yP], [150, yP], { label: 'R₄', value: si(s.r4, 'Ω', 3) });
    sch.wire([[150, yP], [xl, yP]]);
    const xd = 160;
    sch.terminal(30, yN).text(24, yN - 12, `V_R ${si(s.vr, 'V', 3)}`, 'sch-label', 'start');
    sch.resistor([30, yN], [xd, yN], { label: 'R₁', value: si(s.r1, 'Ω', 3), flip: true });
    sch.wire([[xd, yN], [xl, yN]]).dot(xd, yN);
    sch.resistor([xd, yN], [xd, 262], { label: 'R₂', value: fR(s.r2, solvedR), tone: solvedR ? 'solved' : '' });
    sch.ground(xd, 262);
  }
  // thresholds (inputs when designing, answers in analysis)
  const tone = solvedV ? 'solved' : '';
  const x = 252;
  sch.text(x, 218, `V_TH ${fV(s.vth, solvedV)}`, `sch-value ${tone}`.trim(), 'start');
  sch.text(x, 234, `V_TL ${fV(s.vtl, solvedV)}`, `sch-value ${tone}`.trim(), 'start');
  const dv = s.vth - s.vtl;
  if (r.ok && ok(dv)) sch.text(x, 250, `ΔV ${si(dv, 'V', 3)}`, 'sch-value', 'start');
  sch.text(x, 268, inv ? 'input ↑ past V_TH → output low' : 'input ↑ past V_TH → output high', 'sch-hint', 'start');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: CompState, r) => circuit(s, r) },
};

export default mod;
