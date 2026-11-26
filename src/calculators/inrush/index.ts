/** Inrush Current & Overshoot — page module: def + theory + Circuit / Breakdown tabs. */

import type { CalcModule } from '@/core/calc/page';
import { h, clear } from '@/core/ui/dom';
import { type KvRow, block, kvTable, noteList } from '@/core/ui/results';
import { si } from '@/core/units';
import { inrushCircuit } from './circuit';
import { RAW, def } from './def';
import type { InrushState } from './state';
import { theoryIntro, theorySections } from './theory';

const mod: CalcModule = {
  def,
  theory: { intro: theoryIntro, sections: theorySections },
  diagram: { title: 'Circuit', draw: (s: InrushState, r, compact) => inrushCircuit(s, RAW.get(r) ?? null, compact) },
  view: {
    setup(ctl) {
      const breakdownPane = ctl.slots.info.add('breakdown', 'Breakdown');
      ctl.onReport((report) => {
        const out = RAW.get(report);
        clear(breakdownPane);
        if (!out) return;
        const r = out.result;
        const lin = r.linear;
        const n = out.groups.length;
        const worstN = out.worstGroup + 1;
        const feedRows: KvRow[] = out.feed.parts.filter((p) => p.L > 0 || p.R > 0).map((p) => [p.name, p.L > 0 ? `${si(p.L, 'H')} · ${si(p.R, 'Ω')}` : si(p.R, 'Ω')]);
        const grid = h(
          'div',
          { class: 'breakdown-grid' },
          block('Equivalent (common mode)', kvTable([
            ['Shared L (leads + series + extra)', si(out.lSeries, 'H')],
            ['Shared R (copper + source + damping)', si(out.rSeries, 'Ω')],
            ['Equivalent L', si(out.lEq, 'H')],
            ['Equivalent R', si(out.rEq, 'Ω')],
            ['Total C (at applied bias)', si(out.cap.cEffF, 'F')],
            ...(out.cap.isVoltageDependent ? [['Estimated C range', `${si(out.cap.cLowF, 'F')} – ${si(out.cap.cHighF, 'F')}`] as KvRow] : []),
            ['Damping ζ / Q', `${lin.zeta.toPrecision(3)} / ${lin.q.toPrecision(3)}`],
            ['Ring frequency estimate used for ESR / skin', si(out.fGuess, 'Hz')],
          ])),
          block('Shared feed parts (L · R)', kvTable(feedRows)),
        );
        for (const g of out.groups) {
          const rows: KvRow[] = [
            ['Peak capacitor voltage', `${si(g.vPeak, 'V')} at ${si(g.tVpeak, 's')}`, g.exceeded ? 'fail' : ''],
            ['Peak branch current', `${si(g.iPeak, 'A')} at ${si(g.tIpeak, 's')}`],
            ...(g.vRatedMin > 0 ? [['Voltage rating', `${si(g.vRatedMin, 'V')}${g.exceeded ? ' — EXCEEDED' : ''}`, g.exceeded ? 'fail' : ''] as KvRow] : []),
            ['C at applied bias', si(g.cap.cEffF, 'F')],
            ...(g.cap.isVoltageDependent ? [['Estimated C range', `${si(g.cap.cLowF, 'F')} – ${si(g.cap.cHighF, 'F')}`] as KvRow] : []),
            ['Capacitor ESR / ESL', `${si(g.cap.esrOhm, 'Ω')} / ${si(g.cap.eslH, 'H')}`],
            ['Trace L / R', `${si(g.cond.L, 'H')} / ${si(g.cond.R, 'Ω')}`],
            ['Branch L / R total', `${si(g.lBranch, 'H')} / ${si(g.rBranch, 'Ω')}`],
            ['Energy ½·C·Vpk²', si(g.energyJ, 'J')],
          ];
          const capNotes = [...g.cap.notes, ...g.cap.groups.flatMap((m) => m.notes)].filter((v, i, a) => a.indexOf(v) === i);
          grid.appendChild(block(`Group ${g.index}${n > 1 && g.index === worstN ? ' — worst voltage' : ''}`, kvTable(rows), capNotes.length ? noteList(capNotes) : null));
        }
        grid.appendChild(block('Solver', kvTable([
          ['Method', r.solver.method === 'dopri5' ? 'Dormand–Prince 5(4), adaptive' : 'Rosenbrock 2(3), stiff'],
          ['Steps (rejected)', `${r.solver.steps.toLocaleString()} (${r.solver.rejected.toLocaleString()})`],
          ['Simulated window', si(r.wave.t[r.wave.t.length - 1], 's')],
          ['Compute time', `${r.solver.ms.toFixed(0)} ms`],
        ])));
        breakdownPane.appendChild(grid);
      });
    },
  },
};

export default mod;
