/** PCB Trace Resistance — page module: definition + theory + plan view / cross-section drawing. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { def, type TrState } from './def';
import { traceResistanceDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: TrState, r: CalcReport) => traceResistanceDiagram(s, r) } };

export default mod;
