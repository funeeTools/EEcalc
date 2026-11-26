/** EIRP / ERP — page module: definition + theory + a transmit-chain diagram. */

import type { CalcModule } from '@/core/calc/page';
import { def, type EirpState } from './def';
import { eirpDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = { def, theory, diagram: { title: 'Diagram', draw: (s: EirpState, r) => eirpDiagram(s, r) } };

export default mod;
