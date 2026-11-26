/** Rectangular waveguide — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type WgState } from './def';
import { wgDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: WgState, r) => wgDiagram(s, r) } };

export default mod;
