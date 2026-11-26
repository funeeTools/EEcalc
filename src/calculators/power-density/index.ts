/** RF power density & MPE — page module: definition + theory + radiation diagram. */

import type { CalcModule } from '@/core/calc/page';
import { def, type PdState } from './def';
import { pdDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: PdState, r) => pdDiagram(s, r) } };

export default mod;
