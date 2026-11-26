/** Decoupling Capacitor — page module: definition + theory + mounted-capacitor cross-section. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { def, type DecapState } from './def';
import { decapDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: DecapState, r: CalcReport) => decapDiagram(s, r) } };

export default mod;
