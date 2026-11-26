/** Critical trace length — page module: definition + theory + a top-view drawing. */

import type { CalcModule } from '@/core/calc/page';
import { def, type CtlState } from './def';
import { ctlDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: CtlState, r) => ctlDiagram(s, r) } };

export default mod;
