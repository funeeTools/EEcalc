/** Controlled impedance — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type CiState } from './def';
import { ciDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: CiState, r) => ciDiagram(s, r) } };

export default mod;
