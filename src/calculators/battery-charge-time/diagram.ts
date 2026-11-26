/** Input → charger → battery, with the charge profile annotated (Diagram tab). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { battery } from '../battery-life/diagram';
import { fCap } from '../battery-life/def';
import { type ChgState, fTime } from './def';

export function chargeDiagram(s: ChgState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as Record<string, number> | undefined) : undefined;
  const W = 440;
  const top = 70;
  const bot = 176;
  const sch = new Schematic(W, bot + 24);
  const cv = s.chem !== 'nimh' && s.chem !== 'nicd';
  const hl = (re: RegExp) => r.warnings.some((w) => re.test(w));
  const sv = (k: string) => (s.solveFor === k ? 'solved' : '');

  const xb = 352;
  // input source
  const xs = 40;
  sch.source(xs, top, bot, { kind: 'dc', tone: 'muted' });
  sch.text(xs, top - 28, 'V_in', 'sch-label').text(xs, top - 10, si(s.vIn, 'V', 3), 'sch-value');

  // charger block
  const bx = 120;
  const bw = 118;
  const by = 88;
  const chHl = hl(/linear charger|buck charger needs/);
  const prof = cv ? (s.chem === 'lead' ? 'bulk / abs. / float' : 'CC / CV') : 'constant current';
  sch.wire([[xs, top], [bx + 20, top], [bx + 20, by]]);
  sch.block(bx, by, bw, 62, { label: s.charger === 'linear' ? 'Linear charger' : 'Switching charger', value: [prof, s.charger === 'switching' ? `η ${s.effCh} %` : d ? `P_D ${si(d.pdMax, 'W', 3)}` : ''], tone: chHl ? 'hl' : '' });
  sch.wire([[bx + bw - 20, by], [bx + bw - 20, top], [xb, top]]);
  sch.wire([[bx + bw / 2, by + 62], [bx + bw / 2, bot]]).dot(bx + bw / 2, bot);
  sch.wire([[xs, bot], [xb, bot]]);

  // charge current arrow and setpoints
  const iTone = sv('iChg') || (hl(/C is above|exceeds the|is a fast charge/) ? 'hl' : '');
  sch.arrow([bx + bw + 10, top - 12], [bx + bw + 50, top - 12], { tone: iTone });
  sch.text(bx + bw + 54, top - 8, `I_chg ${d ? si(d.iChg, 'A', 3) : s.solveFor === 'iChg' ? '—' : si(s.iChg, 'A', 3)}`, `sch-label ${iTone}`.trim(), 'start');
  if (cv) sch.text(bx + bw + 54, top + 18, `V_CV ${si(s.ns * s.vCv, 'V', 3)}`, 'sch-value', 'start');

  // battery
  const cTone = sv('cap');
  battery(sch, xb, top, bot, cTone);
  sch.text(xb + 24, top + 26, `${s.ns} cell${s.ns > 1 ? 's' : ''}`, `sch-label ${cTone}`.trim(), 'start');
  sch.text(xb + 24, top + 40, s.solveFor === 'cap' ? (d ? fCap(d.cap) : '—') : fCap(s.cap), `sch-value ${cTone}`.trim(), 'start');
  sch.text(xb + 24, bot - 22, `${s.soc0} % →`, 'sch-value', 'start');
  sch.text(xb + 24, bot - 8, d ? `${+(d.sFinal * 100).toPrecision(3)} %` : '—', 'sch-value', 'start');

  // time
  sch.text(W - 8, 18, `t ${d ? fTime(d.t) : '—'}`, `sch-label ${sv('t')}`.trim(), 'end');
  return sch.svg();
}
