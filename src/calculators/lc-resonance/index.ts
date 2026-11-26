/** LC Resonance — page module: def + theory + a Circuit tab. */

import type { CalcModule } from '@/core/calc/page';
import { def } from './def';
import { lcCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s, r) => lcCircuit(s, r) },
};
export default mod;
