/** Edge-coupled symmetric stripline — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type StriplineDiffState } from './def';
import { striplineDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: StriplineDiffState, r) => striplineDiagram(s, r) } };

export default mod;
