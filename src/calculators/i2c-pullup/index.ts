/** I²C Pull-up — page module: definition + theory + a bus-line circuit tab. */

import type { CalcModule } from '@/core/calc/page';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type I2cState } from './def';
import { theory } from './theory';

function circuit(s: I2cState): SVGSVGElement {
  const sch = new Schematic(440, 250);
  const top = 30;
  const bus = 120;
  const gnd = 215;
  const xr = 90;
  sch.text(xr, top - 8, `V_DD ${si(s.vdd, 'V', 3)}`, 'sch-label');
  sch.wire([[xr - 20, top], [xr + 20, top]]);
  sch.resistor([xr, top], [xr, bus], { label: 'R_p', value: si(s.rp, 'Ω', 3), tone: s.solveFor === 'rp' ? 'solved' : '' });
  sch.wire([[xr, bus], [370, bus]]).dot(xr, bus);
  sch.text(376, bus + 4, 'SDA/SCL', 'sch-label', 'start');
  // lumped bus capacitance
  sch.dot(170, bus).capacitor([170, bus], [170, gnd], { label: 'C_b', value: si(s.cb, 'F', 3), tone: s.solveFor === 'cb' ? 'solved' : '' });
  sch.ground(170, gnd + 2);
  // open-drain drivers (switch to ground)
  for (const [x, name] of [[245, 'device 1'], [320, 'device n']] as [number, string][]) {
    sch.dot(x, bus).wire([[x, bus], [x, bus + 30]]);
    sch.wire([[x, bus + 30], [x + 14, bus + 56]]);
    sch.wire([[x, bus + 60], [x, gnd]]).ground(x, gnd + 2);
    sch.text(x + 18, bus + 50, name, 'sch-hint', 'start');
  }
  sch.text(280, 85, `t_r = 0.8473·R_p·C_b = ${si(s.tr, 's', 3)}`, s.solveFor === 'tr' ? 'sch-value solved' : 'sch-value');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: I2cState, r) => (r.ok ? circuit(s) : null) },
};

export default mod;
