/** Power Plane Impedance — page module: definition + theory + top view / cross-section drawing. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { def, type PlaneState } from './def';
import { planeDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Cross-section', draw: (s: PlaneState, r: CalcReport) => planeDiagram(s, r) } };

export default mod;
