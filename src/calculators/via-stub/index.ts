/** Via stub resonance — page module: definition + theory + cross-section of the via and its stub. */

import type { CalcModule } from '@/core/calc/page';
import { def, type StubState } from './def';
import { stubDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: StubState, r) => stubDiagram(s, r) } };

export default mod;
