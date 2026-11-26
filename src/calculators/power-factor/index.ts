/** Power Factor — page module: definition + theory + a drawing of the correction circuit and power triangle. */

import type { CalcModule } from '@/core/calc/page';
import { def, type PfState } from './def';
import { pfDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: PfState, r) => pfDiagram(s, r) },
};

export default mod;
