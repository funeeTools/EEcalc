/** Filter Designer — page module: def + theory + ladder schematic tab. */

import type { CalcModule } from '@/core/calc/page';
import { ladderCircuit } from './circuit';
import { def } from './def';
import type { Design } from './model';
import { theory } from './theory';

const mod: CalcModule = {
  def,
  theory,
  diagram: {
    title: 'Circuit',
    scroll: true,
    draw(_s, r) {
      const d = r.details as { builtArms?: Design['arms']; rs?: number; rl?: number; g?: number[] } | undefined;
      return r.ok && d?.builtArms ? ladderCircuit({ arms: d.builtArms, rs: d.rs!, rl: d.rl!, g: d.g! }) : null;
    },
  },
};

export default mod;
