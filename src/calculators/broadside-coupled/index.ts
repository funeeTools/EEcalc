/** Broadside-coupled stripline pair — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type BroadsideState } from './def';
import { broadsideDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: BroadsideState, r) => broadsideDiagram(s, r) } };

export default mod;
