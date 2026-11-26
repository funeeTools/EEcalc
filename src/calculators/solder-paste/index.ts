/** Solder paste volume / stencil aperture — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type SolderPasteState } from './def';
import { pasteDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: SolderPasteState, r) => pasteDiagram(s, r) } };

export default mod;
