/** PCB crosstalk — page module: definition + theory + a top view and cross-section. */

import type { CalcModule } from '@/core/calc/page';
import { def, type XtState } from './def';
import { xtDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: XtState, r) => xtDiagram(s, r) } };

export default mod;
