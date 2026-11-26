/** PCB stack-up builder — page module: definition + theory + the stack cross-section. */

import type { CalcModule } from '@/core/calc/page';
import { def, type StackState } from './def';
import { stackDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: StackState, r) => stackDiagram(s, r) } };

export default mod;
