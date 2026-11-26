/** Skin Depth Percentage — page module: definition + theory + a cross-section tab. */

import type { CalcModule } from '@/core/calc/page';
import { def, type SdpState } from './def';
import { skinPctDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: SdpState, r) => skinPctDiagram(s, r) } };

export default mod;
