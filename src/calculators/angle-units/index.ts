/** Angle unit converter — page module: definition + theory + unit-circle diagram. */

import type { CalcModule } from '@/core/calc/page';
import { def, type AngleState } from './def';
import { angleDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: AngleState, r) => angleDiagram(s, r) },
};

export default mod;
