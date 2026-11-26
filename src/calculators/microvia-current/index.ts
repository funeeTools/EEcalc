/** Microvia current capacity — page module: definition + theory + cross-section and top view. */

import type { CalcModule } from '@/core/calc/page';
import { def, type MvState } from './def';
import { microviaDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: MvState, r) => microviaDiagram(s, r) } };

export default mod;
