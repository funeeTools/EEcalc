/** Battery → regulator → load block diagram with the live currents (also used by battery-charge-time). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { LifeState } from './def';
import { fCap, fT } from './def';

/** Battery stack glyph between (x, top) and (x, bot): long plate = +. Same drawing as regulator-dropout. */
export function battery(sch: Schematic, x: number, top: number, bot: number, tone = ''): number {
  const yc = (top + bot) / 2;
  sch.wire([[x, top], [x, yc - 13]], tone).wire([[x, yc + 13], [x, bot]], tone);
  sch.shape('path', { d: `M ${x - 14} ${yc - 13} L ${x + 14} ${yc - 13} M ${x - 14} ${yc + 3} L ${x + 14} ${yc + 3}`, class: `sch-body ${tone}`.trim(), fill: 'none' });
  sch.shape('path', { d: `M ${x - 7} ${yc - 5} L ${x + 7} ${yc - 5} M ${x - 7} ${yc + 13} L ${x + 7} ${yc + 13}`, class: `sch-plate ${tone}`.trim(), fill: 'none' });
  sch.text(x - 18, yc - 16, '+', 'sch-sign', 'middle');
  return yc;
}

export function lifeDiagram(s: LifeState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as Record<string, number> | undefined) : undefined;
  const W = 440;
  const top = 74;
  const bot = 184;
  const sch = new Schematic(W, bot + 30);
  const xb = 56;
  const solved = s.solveFor;
  const hl = (re: RegExp) => r.warnings.some((w) => re.test(w));

  // battery
  const capTone = solved === 'cap' ? 'solved' : '';
  battery(sch, xb, top, bot, capTone);
  sch.text(xb, top - 38, `${s.ns} × ${s.chem === 'custom' ? 'cell' : s.chem === 'coin' ? 'CR2032' : s.chem === 'lead' ? 'Pb' : s.chem === 'alk' ? 'alkaline' : s.chem === 'lfp' ? 'LiFePO₄' : s.chem.startsWith('n') || s.chem === 'lsd' ? 'NiMH' : 'Li-ion'}`, `sch-label ${capTone}`.trim());
  sch.text(xb, top - 23, solved === 'cap' ? (d ? fCap(d.cap) : '—') : fCap(s.cap), `sch-value ${capTone}`.trim());
  sch.text(xb + 22, (top + bot) / 2 + 4, si(s.ns * s.vNom, 'V', 3), 'sch-value', 'start');
  if (d) sch.text(xb, bot + 18, `I_sd ${si(d.iSd, 'A', 3)}`, 'sch-hint');

  // regulator (optional)
  const xL = 282;
  const bwL = 150;
  const xc = xL + bwL / 2;
  const by = 92;
  if (s.reg !== 'none') {
    const bx = 136;
    const bw = 96;
    const ldoHl = hl(/LDO drops out|linear regulator cannot/);
    sch.wire([[xb, top], [bx, top], [bx, by + 18]]);
    sch.block(bx, by, bw, 56, { label: s.reg === 'linear' ? 'LDO' : 'DC-DC', value: s.reg === 'linear' ? `I_q ${si(s.iq, 'A', 3)}` : [`η ${s.eff} %`, `I_q ${si(s.iq, 'A', 3)}`], tone: ldoHl ? 'hl' : '' });
    sch.wire([[bx + bw, by + 18], [bx + bw + 14, by + 18], [bx + bw + 14, top], [xc, top]]);
    sch.text(bx + bw + 20, top - 8, `V_load ${si(s.vLoad, 'V', 3)}`, 'sch-label');
    sch.wire([[bx + bw / 2, by + 56], [bx + bw / 2, bot]]).dot(bx + bw / 2, bot);
  } else sch.wire([[xb, top], [xc, top]]);
  sch.wire([[xb, bot], [xc, bot]]);

  // battery current arrow
  if (d) {
    sch.arrow([xb + 30, top - 10], [xb + 70, top - 10]);
    sch.text(xb + 74, top - 6, `I_bat ${si(d.iBat, 'A', 3)}`, 'sch-label', 'start');
  }

  // load block: the phases
  const lines = s.loads.slice(0, 4).map((p) => `${(p.name || 'Phase').slice(0, 11)} ${si(p.i, 'A', 3)}, ${+p.duty.toPrecision(3)} %`);
  if (s.loads.length > 4) lines.push(`+ ${s.loads.length - 4} more`);
  const ldTone = solved === 'iMax' ? 'solved' : '';
  sch.block(xL, top + 8, bwL, bot - top - 16, { label: solved === 'iMax' ? `Max avg ${d ? si(d.iMax, 'A', 3) : '—'}` : `Load avg ${d ? si(d.iProfile, 'A', 3) : '—'}`, value: lines, tone: ldTone });
  sch.wire([[xc, top], [xc, top + 8]]).wire([[xc, bot - 8], [xc, bot]]);

  // runtime across the top right
  const tTone = solved === 'tRun' ? 'solved' : '';
  sch.text(W - 8, 20, `t ${d ? fT(solved === 'tRun' ? d.t : d.tRun) : '—'}`, `sch-label ${tTone}`.trim(), 'end');
  return sch.svg();
}
