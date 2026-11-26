/** Battery Charge Time — page module: definition + theory + a charger → battery diagram. */

import type { CalcModule } from '@/core/calc/page';
import { def, type ChgState } from './def';
import { chargeDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: ChgState, r) => chargeDiagram(s, r) },
};

export default mod;
