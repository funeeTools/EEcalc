/** LDO Thermal — page module: definition + theory + a Circuit tab with the regulator and its thermal path. */

import type { CalcModule } from '@/core/calc/page';
import { def, type LdoState } from './def';
import { ldoCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: LdoState, r) => ldoCircuit(s, r) },
};

export default mod;
