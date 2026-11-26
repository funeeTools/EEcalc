/** Embedded Resistor — page module: definition + theory + a plan/section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type ErState } from './def';
import { resistorDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: ErState, r) => resistorDiagram(s, r) } };

export default mod;
