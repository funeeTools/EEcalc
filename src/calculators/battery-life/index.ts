/** Battery Life — page module: definition + theory + a battery → regulator → load diagram. */

import type { CalcModule } from '@/core/calc/page';
import { def, type LifeState } from './def';
import { lifeDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: LifeState, r) => lifeDiagram(s, r) },
};

export default mod;
