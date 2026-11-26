/** Voltage Divider — page module: definition + theory + a circuit tab. */

import type { CalcModule } from '@/core/calc/page';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type DividerState } from './def';
import { theory } from './theory';

function circuit(s: DividerState, vout: number): SVGSVGElement {
  const sch = new Schematic(420, 270);
  const xs = 60;
  const xd = 200;
  const xl = 320;
  const top = 40;
  const mid = 135;
  const gnd = 230;
  const r = (v: number) => si(v, 'Ω', 4);
  const tone = (k: DividerState['solveFor']) => (s.solveFor === k ? 'solved' : '');
  sch.source(xs, top, gnd, { kind: 'dc', label: 'V_in', value: si(s.vin, 'V', 4), tone: tone('vin') });
  sch.wire([[xs, top], [xd, top]]);
  sch.resistor([xd, top], [xd, mid], { label: 'R₁', value: r(s.r1), tone: tone('r1') });
  sch.resistor([xd, mid], [xd, gnd], { label: 'R₂', value: r(s.r2), tone: tone('r2') });
  sch.wire([[xs, gnd], [xd, gnd]]).dot(xd, mid);
  if (s.rl != null) {
    sch.wire([[xd, mid], [xl, mid]]).dot(xd, gnd);
    sch.resistor([xl, mid], [xl, gnd], { label: 'R_L', value: r(s.rl) });
    sch.wire([[xd, gnd], [xl, gnd]]);
    sch.text(xl, mid - 10, `V_out ${si(vout, 'V', 4)}`, `sch-label ${tone('vout')}`.trim());
  } else {
    sch.wire([[xd, mid], [xd + 70, mid]]).dot(xd + 70, mid);
    sch.text(xd + 78, mid + 4, `V_out ${si(vout, 'V', 4)}`, `sch-label ${tone('vout')}`.trim(), 'start');
  }
  sch.ground((xs + xd) / 2, gnd + 4);
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: {
    title: 'Circuit',
    draw: (s: DividerState, r) => (r.ok ? circuit(s, (r.details as { vout?: number } | undefined)?.vout ?? 0) : null),
  },
};

export default mod;
