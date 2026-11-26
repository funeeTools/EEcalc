/** BGA breakout width — page module: definition + theory + top view of the array corner. */

import type { CalcModule } from '@/core/calc/page';
import { def, type BgaState } from './def';
import { bgaDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: BgaState, r) => bgaDiagram(s, r) } };

export default mod;
