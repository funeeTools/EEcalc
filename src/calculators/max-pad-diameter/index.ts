/** Maximum pad diameter — page module: definition + theory + top view of two pads on the pitch. */

import type { CalcModule } from '@/core/calc/page';
import { def, type MaxPadState } from './def';
import { maxPadDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Top view', draw: (s: MaxPadState, r) => maxPadDiagram(s, r) } };

export default mod;
