/** Voltage Divider, Basic version — page module: definition + theory + circuit. Imports only core/ (see def.ts). */

import type { CalcModule } from '@/core/calc/page';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type BasicDividerState } from './def';
import { theory } from './theory';

function circuit(s: BasicDividerState): SVGSVGElement {
  const sch = new Schematic(360, 270);
  const xs = 60;
  const xd = 200;
  const top = 40;
  const mid = 135;
  const gnd = 230;
  const tone = (k: BasicDividerState['solveFor']) => (s.solveFor === k ? 'solved' : '');
  sch.source(xs, top, gnd, { kind: 'dc', label: 'V_in', value: si(s.vin, 'V', 4), tone: tone('vin') });
  sch.wire([[xs, top], [xd, top]]);
  sch.resistor([xd, top], [xd, mid], { label: 'R₁', value: si(s.r1, 'Ω', 4), tone: tone('r1') });
  sch.resistor([xd, mid], [xd, gnd], { label: 'R₂', value: si(s.r2, 'Ω', 4), tone: tone('r2') });
  sch.wire([[xs, gnd], [xd, gnd]]);
  sch.wire([[xd, mid], [xd + 70, mid]]).dot(xd + 70, mid);
  sch.text(xd + 78, mid + 4, `V_out ${si(s.vout, 'V', 4)}`, `sch-label ${tone('vout')}`.trim(), 'start');
  sch.ground((xs + xd) / 2, gnd + 4);
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: BasicDividerState, r) => (r.ok ? circuit(s) : null) },
};

export default mod;
