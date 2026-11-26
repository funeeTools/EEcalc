/** Fusing Current — page module: definition + theory + cross-section / pulse drawing. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { def, type FuseState } from './def';
import { fusingDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: FuseState, r: CalcReport) => fusingDiagram(s, r) } };

export default mod;
