/** Speaker Crossover — page module: def + theory + the two-way crossover as built. */

import type { CalcModule } from '@/core/calc/page';
import { def, type CrossoverState } from './def';
import { crossoverCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: CrossoverState, r) => crossoverCircuit(s, r) },
};
export default mod;
