/** Cascaded Noise Figure — page module: def + theory + a block diagram of the chain. */

import type { CalcModule } from '@/core/calc/page';
import { def, type NfState } from './def';
import { nfDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: NfState, r) => nfDiagram(s, r) },
};
export default mod;
