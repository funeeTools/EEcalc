/** RC Time Constant — page module: def + theory + a Circuit tab. */

import type { CalcModule } from '@/core/calc/page';
import { def } from './def';
import { rcCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s, r) => rcCircuit(s, r) },
};
export default mod;
