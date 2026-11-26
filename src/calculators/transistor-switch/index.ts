/** Transistor Switch — page module: definition + theory + the low-side switch circuit. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type SwitchState } from './def';
import { theory } from './theory';

export function circuit(s: SwitchState, r: CalcReport): SVGSVGElement {
  const det = (r.ok ? r.details : null) as null | Record<string, any>;
  const bjt = s.device === 'bjt';
  const sch = new Schematic(420, 290);
  const top = 34;
  const gnd = 262;
  const xs = 80; // drive source
  const xq = 250;
  const xl = xq + 10; // load / collector column
  const yq = 156;
  const yN = yq - 30; // collector / drain node
  const R = (v: number) => si(v, 'Ω', 3);
  sch.wire([[xl - 70, top], [xl, top]]);
  sch.text(xl - 70, top - 10, `V_CC ${si(s.vcc, 'V', 3)}`, 'sch-label', 'start');
  // load
  if (s.load === 'relay') {
    const xD = xl + 50;
    sch.inductor([xl, top], [xl, yN], { label: 'Coil', value: R(s.rl), tone: 'muted', flip: true });
    sch.wire([[xl, top], [xD, top], [xD, top + 14]]).wire([[xD, yN - 14], [xD, yN], [xl, yN]]);
    sch.diode([xD, yN - 14], [xD, top + 14], { label: 'D', value: 'flyback', tone: '' });
    sch.dot(xl, top).dot(xl, yN);
  } else if (s.load === 'led') {
    const ym = top + 46;
    sch.diode([xl, top], [xl, ym], { kind: 'led', label: 'LED', value: `V_F ${si(s.vf, 'V', 3)}`, tone: 'muted' });
    sch.resistor([xl, ym], [xl, yN], { label: 'R_L', value: R(s.rl), tone: 'muted' });
  } else {
    sch.resistor([xl, top], [xl, yN], { label: 'R_L', value: R(s.rl), tone: 'muted' });
  }
  // switch
  const hot = det != null && (bjt ? !det.sat || det.pq > det.params.ptot : det.params.unspecified || det.pq > det.params.ptot);
  const part = bjt ? s.bjtPart : s.fetPart;
  const name = part === 'Custom' ? (bjt ? 'NPN' : 'N-ch') : part.replace(/ \(.*\)$/, '');
  const pins = bjt ? sch.bjt(xq, yq, { type: 'npn', label: 'Q₁', value: name, tone: hot ? 'hl' : '' }) : sch.mosfet(xq, yq, { type: 'n', label: 'Q₁', value: name, tone: hot ? 'hl' : '' });
  const up = bjt ? (pins as { c: [number, number] }).c : (pins as { d: [number, number] }).d;
  const dn = bjt ? (pins as { e: [number, number] }).e : (pins as { s: [number, number] }).s;
  const inp = bjt ? (pins as { b: [number, number] }).b : (pins as { g: [number, number] }).g;
  sch.wire([[xl, yN], up]).wire([dn, [xl, gnd]]);
  // drive
  sch.source(xs, yq, gnd, { kind: 'step', label: 'V_drive', value: si(s.vdrv, 'V', 3) });
  const solvedR = s.solveFor === 'rb' || s.solveFor === 'rg' ? 'solved' : '';
  const rVal = bjt ? (det ? det.rUse : s.rb) : det ? det.rgUse : s.rg;
  sch.wire([[xs, yq], [xs + 34, yq]]);
  if (bjt || rVal > 0) sch.resistor([xs + 34, yq], [inp[0] - 24, yq], { label: bjt ? 'R_B' : 'R_G', value: R(rVal), tone: solvedR });
  else sch.wire([[xs + 34, yq], [inp[0] - 24, yq]]);
  sch.wire([[inp[0] - 24, yq], inp]);
  sch.wire([[xs, gnd], [xl, gnd]]).dot(xl, gnd);
  sch.ground((xs + xl) / 2, gnd + 4);
  if (det) {
    const xr = xq + 26;
    if (bjt) {
      sch.arrow([inp[0] - 22, yq], [inp[0] - 4, yq], {});
      sch.text((xs + inp[0]) / 2 + 6, yq + 20, `I_B ${si(det.ib, 'A', 3)} · β_F ${det.bf.toFixed(1)}`, `sch-value ${s.solveFor === 'betaF' ? 'solved' : ''}`.trim(), 'middle');
      sch.text(xr, yq + 32, `I_L ${si(det.il, 'A', 3)}`, 'sch-label', 'start');
      sch.text(xr, yq + 46, det.sat ? 'saturated' : 'NOT saturated', `sch-value ${hot ? 'hl' : ''}`.trim(), 'start');
      sch.text(xr, yq + 60, `P_Q ${si(det.pq, 'W', 3)}`, `sch-value ${hot ? 'hl' : ''}`.trim(), 'start');
    } else {
      sch.text((xs + inp[0]) / 2 + 6, yq + 20, `t_sw ${si(Math.max(det.ton, det.toff), 's', 3)}`, `sch-value ${s.solveFor === 'tsw' ? 'solved' : ''}`.trim(), 'middle');
      sch.text(xr, yq + 32, `I_L ${si(det.il, 'A', 3)}`, 'sch-label', 'start');
      sch.text(xr, yq + 46, `R_DS(on) ${si(det.params.rds, 'Ω', 3)}`, `sch-value ${hot ? 'hl' : ''}`.trim(), 'start');
      sch.text(xr, yq + 60, `P_Q ${si(det.pq, 'W', 3)}`, `sch-value ${hot ? 'hl' : ''}`.trim(), 'start');
    }
    sch.arrow([xl - 12, yN - 20], [xl - 12, yN - 4], {});
  }
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: SwitchState, r) => circuit(s, r) },
};

export default mod;
