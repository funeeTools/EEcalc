/** Edge-coupled microstrip differential pair — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type DiffPairState } from './def';
import { diffPairDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: DiffPairState, r) => diffPairDiagram(s, r) } };

export default mod;
