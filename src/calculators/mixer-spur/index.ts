/** Mixer spur calculator — page module: definition + theory + block diagram. */

import type { CalcModule } from '@/core/calc/page';
import { def, type MixState } from './def';
import { mixerDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: MixState, r) => mixerDiagram(s, r) } };

export default mod;
