/** 555 Timer — page module: def + theory + a Circuit tab. */

import type { CalcModule } from '@/core/calc/page';
import { def } from './def';
import { timerCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s, r) => timerCircuit(s, r) },
};
export default mod;
