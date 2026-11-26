/** PCB trace inductance — page module: definition + theory + side view / section drawing. */

import type { CalcModule } from '@/core/calc/page';
import { def, type TraceLState } from './def';
import { inductanceDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: TraceLState, r) => inductanceDiagram(s, r) } };

export default mod;
