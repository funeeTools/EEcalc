/** Trace Width vs Current — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type TraceState } from './def';
import { traceDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: TraceState, r) => traceDiagram(s, r) } };

export default mod;
