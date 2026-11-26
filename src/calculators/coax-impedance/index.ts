/** Coaxial Cable Impedance — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type CoaxState } from './def';
import { coaxDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: CoaxState, r) => coaxDiagram(s, r) } };

export default mod;
