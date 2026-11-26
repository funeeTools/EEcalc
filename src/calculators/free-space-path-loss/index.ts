/** Free-Space Path Loss — page module: definition + theory + a link diagram tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type FsplState } from './def';
import { fsplDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: FsplState, r) => fsplDiagram(s, r) } };

export default mod;
