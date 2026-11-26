/** Smith Chart & Matching — page module: def + theory + the selected matching network as a circuit. */

import type { CalcModule } from '@/core/calc/page';
import { def, type SmithState } from './def';
import { smithCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: SmithState, r) => smithCircuit(s, r) },
};
export default mod;
