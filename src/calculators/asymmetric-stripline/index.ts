/** Asymmetric (offset) stripline — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type AsymState } from './def';
import { asymDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: AsymState, r) => asymDiagram(s, r) } };

export default mod;
