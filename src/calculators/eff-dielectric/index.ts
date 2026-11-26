/** Effective dielectric constant — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type EffState } from './def';
import { effDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: EffState, r) => effDiagram(s, r) } };

export default mod;
