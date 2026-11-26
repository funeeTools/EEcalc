/** Skin Depth — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type SkinState } from './def';
import { skinDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: SkinState, r) => skinDiagram(s, r) } };

export default mod;
