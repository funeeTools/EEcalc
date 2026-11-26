/** Via voltage drop — page module: definition + theory + a cross-section drawing. */

import type { CalcModule } from '@/core/calc/page';
import { def, type DropState } from './def';
import { dropSection } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: DropState, r) => dropSection(s, r) } };

export default mod;
