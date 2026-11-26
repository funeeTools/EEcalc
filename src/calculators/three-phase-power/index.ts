/** Three Phase Power — page module: definition + theory + a drawing of the Y/Δ load and its phasors. */

import type { CalcModule } from '@/core/calc/page';
import { def, type TpState } from './def';
import { tpDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: TpState, r) => tpDiagram(s, r) },
};

export default mod;
