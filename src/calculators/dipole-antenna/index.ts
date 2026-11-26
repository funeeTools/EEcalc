/** Dipole Antenna — page module: definition + theory + a diagram tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type DipoleState } from './def';
import { dipoleDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: DipoleState, r) => dipoleDiagram(s, r) } };
export default mod;
