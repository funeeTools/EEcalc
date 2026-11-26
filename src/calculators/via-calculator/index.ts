/** Via calculator — page module: definition + theory + a cross-section drawing. */

import type { CalcModule } from '@/core/calc/page';
import { def, type ViaState } from './def';
import { viaSection } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: ViaState, r) => viaSection(s, r) } };

export default mod;
