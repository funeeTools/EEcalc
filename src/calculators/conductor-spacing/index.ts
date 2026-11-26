/** Minimum conductor spacing (IPC-2221B) — page module: definition + theory + top view and section. */

import type { CalcModule } from '@/core/calc/page';
import { def, type SpacingState } from './def';
import { spacingDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: SpacingState, r) => spacingDiagram(s, r) } };

export default mod;
