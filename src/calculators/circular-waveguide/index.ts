/** Circular waveguide — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type CwgState } from './def';
import { cwgDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: CwgState, r) => cwgDiagram(s, r) } };

export default mod;
