/** Clock / data jitter — page module: definition + theory + eye sketch. */

import type { CalcModule } from '@/core/calc/page';
import { def, type JitterState } from './def';
import { eyeDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: JitterState, r) => eyeDiagram(s, r) } };

export default mod;
