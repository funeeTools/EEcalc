/** Edge-coupled asymmetric stripline pair — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type AsymPairState } from './def';
import { asymPairDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: AsymPairState, r) => asymPairDiagram(s, r) } };

export default mod;
