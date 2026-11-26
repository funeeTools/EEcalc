/** Thermal via array — page module: definition + theory + cross-section / top-view drawing. */

import type { CalcModule } from '@/core/calc/page';
import { def, type ThermalViaState } from './def';
import { thermalDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: ThermalViaState, r) => thermalDiagram(s, r) } };

export default mod;
