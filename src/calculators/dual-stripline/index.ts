/** Dual stripline — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type DualState } from './def';
import { dualDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: DualState, r) => dualDiagram(s, r) } };

export default mod;
