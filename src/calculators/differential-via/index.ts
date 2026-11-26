/** Differential via pair — page module: definition + theory + a top/side-view drawing. */

import type { CalcModule } from '@/core/calc/page';
import { def, type DiffViaState } from './def';
import { viaDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: DiffViaState, r) => viaDiagram(s, r) } };

export default mod;
