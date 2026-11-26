/** Common-mode choke circuit: source and load terminations, two coupled windings with dots, winding capacitance. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type ChokeState, fAL } from './def';

export function chokeDiagram(s: ChokeState, r: CalcReport): SVGSVGElement {
  const sch = new Schematic(440, 236);
  const solved = s.solveFor;
  const res = r.results.find((x) => x.key === solved && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const wTone = failed ? 'hl' : 'solved';
  const get = (k: string) => (r.ok ? r.results.find((x) => x.key === k) : undefined);
  const sat = get('bcm')?.tone === 'fail';

  const y1 = 96;
  const y2 = 164;
  const xa = 188;
  const xb = 252;
  const xs = 96;
  const xl = 344;
  // terminations (context, muted)
  sch.block(16, 72, xs - 16, 116, { label: 'Source', value: [`CM ${si(s.zsCm, 'Ω', 3)}`, `DM ${si(s.zsDm, 'Ω', 3)}`], tone: 'muted' });
  sch.block(xl, 72, 424 - xl, 116, { label: 'Load', value: [`CM ${si(s.zlCm, 'Ω', 3)}`, `DM ${si(s.zlDm, 'Ω', 3)}`], tone: 'muted' });
  sch.wire([[xs, y1], [xa, y1]]).wire([[xb, y1], [xl, y1]]);
  sch.wire([[xs, y2], [xa, y2]]).wire([[xb, y2], [xl, y2]]);
  // windings: green when L, N or A_L is the unknown (all three describe the winding)
  sch.inductor([xa, y1], [xb, y1], { body: 56, tone: wTone });
  sch.inductor([xa, y2], [xb, y2], { body: 56, tone: wTone });
  // core: two bars between the windings (red when the CM flux exceeds the limit)
  sch.shape('line', { x1: xa + 2, y1: 124, x2: xb - 2, y2: 124, class: sat ? 'sch-line hl' : 'sch-body' });
  sch.shape('line', { x1: xa + 2, y1: 132, x2: xb - 2, y2: 132, class: sat ? 'sch-line hl' : 'sch-body' });
  // polarity dots at the same end of both windings
  sch.shape('circle', { cx: xa + 6, cy: y1 - 12, r: 3, class: 'sch-dot' });
  sch.shape('circle', { cx: xa + 6, cy: y2 + 13, r: 3, class: 'sch-dot' });
  // winding capacitance bridging the upper winding
  if (s.cp > 0) {
    const yc = 50;
    sch.wire([[xa - 8, y1], [xa - 8, yc], [204, yc]], 'muted');
    sch.wire([[236, yc], [xb + 8, yc], [xb + 8, y1]], 'muted');
    sch.capacitor([204, yc], [236, yc], { tone: 'muted' });
    sch.dot(xa - 8, y1).dot(xb + 8, y1);
    sch.text(244, yc - 8, `C_p ${si(s.cp, 'F', 3)}`, 'sch-value', 'start');
  }
  sch.text(xs + 8, y1 - 6, 'line 1', 'sch-hint', 'start');
  sch.text(xs + 8, y2 - 6, 'line 2', 'sch-hint', 'start');
  sch.text(300, y1 - 6, 'line 1', 'sch-hint', 'start');
  sch.text(300, y2 - 6, 'line 2', 'sch-hint', 'start');

  const sym = (k: 'l' | 'n' | 'al', txt: string) => `sch-label ${solved === k ? wTone : ''}`.trim() + '|' + txt;
  const parts = [
    sym('l', `L = ${solved === 'l' && failed ? '—' : si(s.l, 'H', 4)}`),
    sym('n', `N = ${solved === 'n' && failed ? '—' : +s.n.toPrecision(4)}`),
    sym('al', `A_L = ${solved === 'al' && failed ? '—' : fAL(s.al)}`),
  ];
  const xsList = [124, 220, 316];
  parts.forEach((p, i) => {
    const [cls, txt] = p.split('|');
    sch.text(xsList[i], 202, txt, cls);
  });
  sch.text(220, 220, `leakage ${s.leak} % · R_dc ${si(s.rdc, 'Ω', 3)} per winding`, 'sch-hint');
  const ilc = get('ilCm');
  const ild = get('ilDm');
  if (ilc && ild) sch.text(16, 22, `at ${si(s.f, 'Hz')}: IL_CM ${ilc.display} · IL_DM ${ild.display}`, 'sch-label', 'start');
  return sch.svg();
}
