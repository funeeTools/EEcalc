/** Horn antenna — page module: definition + theory + a dimensioned sketch. */

import type { CalcModule } from '@/core/calc/page';
import { def, type HornState } from './def';
import { hornDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: HornState, r) => hornDiagram(s, r) } };

export default mod;
