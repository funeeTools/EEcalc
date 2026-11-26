/** Edge-coupled embedded microstrip — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type EceState } from './def';
import { eceDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: EceState, r) => eceDiagram(s, r) } };

export default mod;
