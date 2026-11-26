/** Printed spiral inductor — page module: definition + theory + a top-view drawing. */

import type { CalcModule } from '@/core/calc/page';
import { def, type SpiralState } from './def';
import { spiralDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: SpiralState, r) => spiralDiagram(s, r) } };

export default mod;
