/** BGA land pad — page module: definition + theory + top view and joint section. */

import type { CalcModule } from '@/core/calc/page';
import { def, type LandState } from './def';
import { landDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: LandState, r) => landDiagram(s, r) } };

export default mod;
