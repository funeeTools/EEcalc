/** Common-mode choke — page module: definition + theory + a circuit tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type ChokeState } from './def';
import { chokeDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Circuit', draw: (s: ChokeState, r) => chokeDiagram(s, r) } };

export default mod;
