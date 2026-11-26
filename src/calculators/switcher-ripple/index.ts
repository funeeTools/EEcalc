/** Switching Regulator Ripple — page module: definition + theory + a Circuit tab with the capacitor equivalents. */

import type { CalcModule } from '@/core/calc/page';
import { def, type RippleState } from './def';
import { rippleCircuit } from './diagram';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: RippleState, r) => rippleCircuit(s, r) },
};

export default mod;
