/** Buck Converter — page module: definition + theory + a Circuit tab drawing the power stage. */

import type { CalcModule } from '@/core/calc/page';
import { def, type BuckState } from './def';
import { buckCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: BuckState, r) => buckCircuit(s, r) },
};

export default mod;
