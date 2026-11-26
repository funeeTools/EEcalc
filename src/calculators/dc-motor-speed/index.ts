/** DC Motor Speed — page module: definition + theory + a Circuit tab with the motor equivalent circuit. */

import type { CalcModule } from '@/core/calc/page';
import { def, type MotorState } from './def';
import { motorCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: MotorState, r) => motorCircuit(s, r) },
};
export default mod;
