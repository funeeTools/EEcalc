/** Block diagram: input → input filter → mixer ← LO, → output (IF) filter → out, with the frequency plan. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { MixState } from './def';

const fF = (f: number) => si(f, 'Hz', 5);

export function mixerDiagram(s: MixState, r: CalcReport): SVGSVGElement | null {
  const W = 440;
  const H = 224;
  const sch = new Schematic(W, H);
  const tone = (k: string) => (k === s.solveFor ? (r.ok ? 'solved' : 'hl') : '');
  const shown = (k: 'fin' | 'fout' | 'flo') => (k === s.solveFor && !r.ok ? '—' : fF(s[k]));
  const inBand = Number(r.results.find((x) => x.key === 'inBand')?.value ?? 0);
  const respIn = Number(r.results.find((x) => x.key === 'respInBand')?.value ?? 0);
  const y = 92;

  sch.text(16, 20, `${s.conv === 'down' ? 'Down-conversion' : 'Up-conversion'} · ${s.side}-side LO · ${s.plan === 'fixed' ? 'fixed LO' : 'tuned LO'}`, 'sch-label', 'start');

  // signal path
  sch.terminal(20, y);
  sch.wire([[20, y], [46, y]]);
  sch.block(46, y - 17, 58, 34, { label: 'BPF', tone: r.ok && respIn > 0 ? 'hl' : '' });
  sch.wire([[104, y], [156, y]]);
  sch.circleSym([156, y], [204, y], '×');
  sch.wire([[204, y], [252, y]]);
  sch.block(252, y - 17, 58, 34, { label: 'BPF', tone: r.ok && inBand > 0 ? 'hl' : '' });
  sch.wire([[310, y], [400, y]]);
  sch.terminal(400, y);
  sch.arrow([330, y - 10], [380, y - 10]);

  // labels
  sch.text(75, y + 34, `f_in = ${shown('fin')}`, `sch-label ${tone('fin')}`.trim());
  sch.text(75, y + 51, `B_in = ${si(s.bin, 'Hz', 4)}`, 'sch-value');
  sch.text(281, y + 34, `f_out = ${shown('fout')}`, `sch-label ${tone('fout')}`.trim());
  sch.text(281, y + 51, `B_out = ${si(s.bout, 'Hz', 4)}`, 'sch-value');
  sch.text(75, y - 26, s.conv === 'down' ? 'RF filter' : 'IF filter', 'sch-hint');
  sch.text(281, y - 26, s.conv === 'down' ? 'IF filter' : 'RF filter', 'sch-hint');
  sch.text(180, y - 26, `N ≤ ${s.order}`, 'sch-hint');
  sch.text(404, y - 12, 'out', 'sch-hint', 'start');

  // LO
  sch.wire([[180, y + 15], [180, 150]]);
  sch.circleSym([180, 150], [180, 190], '~', { tone: tone('flo') });
  sch.text(202, 174, `f_LO = ${shown('flo')}`, `sch-label ${tone('flo')}`.trim(), 'start');

  // verdict
  if (r.ok) {
    const txt = inBand > 0 ? `${inBand} spur${inBand > 1 ? 's land' : ' lands'} in the output band` : `no spur of order ≤ ${s.order} in the output band`;
    sch.text(16, 212, txt, `sch-value ${inBand > 0 ? 'hl' : ''}`.trim(), 'start');
    if (respIn > 0) sch.text(W - 16, 212, `${respIn} response${respIn > 1 ? 's' : ''} inside input band`, 'sch-value hl', 'end');
  } else sch.text(16, 212, r.error ? 'no valid frequency plan' : '', 'sch-value hl', 'start');
  return sch.svg();
}
