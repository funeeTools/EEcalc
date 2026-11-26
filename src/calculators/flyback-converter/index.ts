/** Flyback Converter — page module: definition + theory + a Circuit tab drawing the power stage. */

import type { CalcModule } from '@/core/calc/page';
import { def, type FlybackState } from './def';
import { flybackCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: FlybackState, r) => flybackCircuit(s, r) },
};

export default mod;
