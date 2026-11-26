/** Conductor-to-pad width — page module: definition + theory + top view of the land and its trace. */

import type { CalcModule } from '@/core/calc/page';
import { def, type CpwState } from './def';
import { cpwDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Top view', draw: (s: CpwState, r) => cpwDiagram(s, r) } };

export default mod;
