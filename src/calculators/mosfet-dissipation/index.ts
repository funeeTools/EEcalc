/** MOSFET Power Dissipation — page module: definition, theory and a drawing of the half-bridge + thermal path. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type FetState } from './def';
import type { FetResult } from './model';
import { theory } from './theory';

const W = 460;
const H = 266;

function diagram(st: FetState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as (FetResult & { inputs: { rth: number } }) | undefined) : undefined;
  const solvedOk = d && !r.status?.text.startsWith('NO');
  const s = new Schematic(W, H);
  const sw = st.role === 'switch';
  const x = 150; // drain/source column of both FETs
  const yTop = 34;
  const ySw = 136;
  const yGnd = 236;

  // the leg: buck = control FET on top, rectifier below; boost = control FET below, rectifier on top
  const buck = st.topo !== 'boost';
  const anaTop = buck ? sw : !sw; // where the analysed FET sits
  const rectTop = !buck; // where the rectifier sits
  const diode = sw && st.rect === 'diode';
  s.wire([[x, yTop], [x, 62]]);
  s.text(x - 6, yTop - 4, `${buck ? 'V_in' : 'V_out'} ${si(st.v, 'V', 3)}`, 'sch-label', 'end');
  s.dot(x, yTop);
  const name = st.part === 'Custom' ? 'FET' : st.part.split(' · ')[0];
  const fetOpts = (top: boolean) =>
    top === anaTop
      ? { label: name, value: `${si(st.rds25, 'Ω', 3)} @25 °C` }
      : { label: top === rectTop ? 'Q_sync' : 'Q_ctrl', tone: 'muted' };
  const gates: [number, number, boolean][] = [];
  for (const top of [true, false]) {
    const yc = top ? 92 : 196;
    const yA = top ? 62 : ySw + 30; // upper lead end
    const yB = top ? ySw - 14 : yGnd - 10; // lower lead end
    if (diode && top === rectTop) {
      // Schottky rectifier: anode at the lower node, cathode at the upper one
      s.diode([x, yB], [x, yA], { kind: 'schottky', label: 'D', value: 'Schottky', tone: 'muted' });
    } else {
      const q = s.mosfet(x - 10, yc, fetOpts(top));
      gates.push([q.g[0], q.g[1], top === anaTop || (sw && top !== rectTop)]);
    }
  }
  s.wire([[x, ySw - 14], [x, ySw + 30]]).wire([[x, yGnd - 10], [x, yGnd]]).ground(x, yGnd);
  s.dot(x, ySw);
  s.inductor([x, ySw], [x + 74, ySw], { tone: st.solveFor === 'iL' ? 'solved' : '' });
  s.wire([[x + 74, ySw], [x + 84, ySw]]);
  s.text(x + 88, ySw + 4, buck ? 'V_out' : 'V_in', 'sch-hint', 'start');
  s.text(x + 10, ySw + 20, `I_L ${si(st.iL, 'A', 3)} ± ${si(st.dIL / 2, 'A', 2)}`, `sch-value ${st.solveFor === 'iL' ? 'solved' : ''}`.trim(), 'start');

  // gate drivers with the resistances that set the edges (the analysed FET's drive is drawn solid)
  for (const [gx, gy, on] of gates) {
    const rx = gx - 44;
    s.resistor([rx, gy], [gx, gy], { label: on ? 'R_G' : '', value: on ? `${si(st.rgExt + st.rgInt, 'Ω', 2)}` : undefined, body: 26, tone: on ? '' : 'muted' });
    s.block(rx - 40, gy - 11, 40, 22, { label: 'DRV', tone: on ? '' : 'muted' });
  }
  s.text(56, yGnd + 2, `V_drv ${si(st.vdrv, 'V', 3)}`, 'sch-value', 'middle');
  s.text(56, yGnd + 18, `${si(st.fsw, 'Hz', 3)} · D ${st.duty.toFixed(0)} %`, `sch-value ${st.solveFor === 'fsw' ? 'solved' : ''}`.trim(), 'middle');

  // thermal ladder: junction → (case → sink →) ambient
  const xt = 372;
  const tj = d ? d.tj : NaN;
  const hot = Number.isFinite(tj) && tj > st.tjMax;
  const tjTone = st.solveFor === 'tj' ? 'solved' : hot ? 'hl' : '';
  const yJ = 44;
  const yA = 220;
  s.dot(xt, yJ);
  s.text(xt + 8, yJ + 4, `T_J ${solvedOk ? `${tj.toFixed(0)} °C` : '—'}`, `sch-label ${tjTone}`.trim(), 'start');
  // heat flow from the analysed FET to the junction node
  // anchored on the analysed FET's lower lead, routed under its labels
  const fy = (anaTop ? 92 : 196) + 22;
  const xh = 332;
  s.dot(x, fy, hot ? 'hl' : '');
  s.shape('path', { d: `M ${x} ${fy} L ${xh} ${fy} L ${xh} ${yJ}`, class: `sch-arrow dashed ${hot ? 'hl' : ''}`.trim(), fill: 'none' }, 'back');
  s.arrow([xh, yJ], [xt - 4, yJ], { tone: hot ? 'hl' : '', dashed: true });
  s.text(xh - 8, yJ - 14, `P_D ${d ? si(d.loss.total, 'W', 3) : '—'}`, `sch-label ${hot ? 'hl' : ''}`.trim(), 'start');
  const rtone = (k: string) => (st.solveFor === k ? 'solved' : '');
  const fmt = (v: number) => (Number.isFinite(v) ? `${v.toPrecision(3)} °C/W` : '—');
  if (st.path === 'ja') {
    s.resistor([xt, yJ], [xt, yA], { label: 'R_θJA', value: fmt(st.solveFor === 'rthJA' ? (solvedOk ? st.rthJA : NaN) : st.rthJA), tone: rtone('rthJA') });
  } else {
    const y1 = yJ + (yA - yJ) / 3;
    const y2 = yJ + (2 * (yA - yJ)) / 3;
    const p = d?.loss.total ?? NaN;
    s.resistor([xt, yJ], [xt, y1], { label: 'R_θJC', value: fmt(st.rthJC), body: 30 });
    s.resistor([xt, y1], [xt, y2], { label: 'R_θCS', value: fmt(st.rthCS), body: 30 });
    s.resistor([xt, y2], [xt, yA], { label: 'R_θSA', value: fmt(st.solveFor === 'rthSA' ? (solvedOk ? st.rthSA : NaN) : st.rthSA), body: 30, tone: rtone('rthSA') });
    s.dot(xt, y1).dot(xt, y2);
    if (solvedOk) {
      s.text(xt + 8, y1 + 4, `T_C ${(tj - p * st.rthJC).toFixed(0)} °C`, 'sch-value', 'start');
      s.text(xt + 8, y2 + 4, `T_S ${(st.ta + p * st.rthSA).toFixed(0)} °C`, 'sch-value', 'start');
    }
  }
  s.wire([[xt, yA], [xt, yA + 8]]).ground(xt, yA + 8);
  s.text(xt + 8, yA + 4, `T_A ${st.ta.toFixed(0)} °C`, 'sch-label', 'start');
  return s.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: FetState, r) => diagram(s, r) },
};

export default mod;
