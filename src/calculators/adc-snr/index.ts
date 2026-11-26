/** ADC SNR — page module: def + theory + a block diagram of where each noise term enters. */

import type { CalcModule } from '@/core/calc/page';
import { def, type AdcState } from './def';
import { adcDiagram } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: AdcState, r) => adcDiagram(s, r) },
};
export default mod;
