/** Via step response — page module: definition + theory + cross-section with its lumped model. */

import type { CalcModule } from '@/core/calc/page';
import { def, type StepState } from './def';
import { stepDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: StepState, r) => stepDiagram(s, r) } };

export default mod;
