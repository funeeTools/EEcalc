/** Padstack & annular ring — page module: definition + theory + top view / cross-section drawing. */

import type { CalcModule } from '@/core/calc/page';
import { def, type RingState } from './def';
import { ringDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Top view', draw: (s: RingState, r) => ringDiagram(s, r) } };

export default mod;
