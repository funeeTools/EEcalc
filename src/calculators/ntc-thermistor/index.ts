/** NTC Thermistor — page module: def + theory + a Circuit tab. */

import type { CalcModule } from '@/core/calc/page';
import { def } from './def';
import { ntcCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s, r) => ntcCircuit(s, r) },
};
export default mod;
