/** Aperture Diagonal — page module: definition + theory + a top-view tab. */

import type { CalcModule } from '@/core/calc/page';
import { type ApState, def } from './def';
import { apertureDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: ApState, r) => apertureDiagram(s, r) } };

export default mod;
