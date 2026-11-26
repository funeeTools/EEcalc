/** Heatsink Calculator — page module: definition + theory + a Diagram tab with the thermal ladder. */

import type { CalcModule } from '@/core/calc/page';
import { def, type HeatsinkState } from './def';
import { heatsinkDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: HeatsinkState, r) => heatsinkDiagram(s, r) },
};

export default mod;
