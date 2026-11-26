/** Boost Converter — page module: definition + theory + a Circuit tab drawing the power stage. */

import type { CalcModule } from '@/core/calc/page';
import { def, type BoostState } from './def';
import { boostCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: BoostState, r) => boostCircuit(s, r) },
};

export default mod;
