/** Ohm's law — page module: definition + theory + circuit drawing. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type OhmState, def, heldOf } from './def';
import { theory } from './theory';

/** Source driving a resistor: a voltage source when V is the held quantity, a current source when I is. */
function circuit(s: OhmState, r: CalcReport): SVGSVGElement {
  const d = (r.ok ? r.details : null) as { v: number; i: number; r: number; p: number; load: number; vOver: boolean } | null;
  const sch = new Schematic(380, 240);
  const xs = 90;
  const xr = 270;
  const top = 50;
  const bot = 190;
  const tone = (q: 'v' | 'i' | 'r' | 'p') => (s.given.includes(q) ? '' : 'solved');
  const held = heldOf(s.given);
  const val = (q: 'v' | 'i' | 'r' | 'p', unit: string) => (d ? si(d[q], unit, 4) : '—');
  if (held === 'v') {
    sch.source(xs, top, bot, { kind: 'dc', label: 'V', value: val('v', 'V'), tone: tone('v') });
  } else {
    // current source: circle with an upward arrow (current leaves at the top)
    sch.circleSym([xs, top], [xs, bot], '', { label: 'I', value: val('i', 'A'), tone: tone('i'), flip: true });
    sch.arrow([xs, (top + bot) / 2 + 9], [xs, (top + bot) / 2 - 9], { tone: tone('i') });
  }
  sch.wire([[xs, top], [xr, top]]).wire([[xs, bot], [xr, bot]]);
  const over = d != null && (!(d.load <= 1) || d.vOver); // above the power or voltage rating, or no listed part fits (load NaN)
  sch.resistor([xr, top], [xr, bot], { label: 'R', value: val('r', 'Ω'), tone: over ? 'hl' : tone('r') });
  sch.text(xr + 18, (top + bot) / 2 + 34, `P ${val('p', 'W')}`, `sch-label ${over ? 'hl' : tone('p')}`.trim(), 'start');
  // current arrow on the top wire with its value
  const iTone = tone('i');
  sch.arrow([150, top], [200, top], { tone: iTone });
  sch.text(175, top - 10, `I ${val('i', 'A')}`, `sch-label ${iTone}`.trim());
  // voltage across R, beside the source side of the resistor
  if (held === 'i') {
    sch.text(xr - 24, top + 30, '+', 'sch-sign');
    sch.text(xr - 24, bot - 22, '−', 'sch-sign');
    sch.text(xr - 30, (top + bot) / 2 + 4, `V ${val('v', 'V')}`, `sch-label ${tone('v')}`.trim(), 'end');
  }
  sch.ground((xs + xr) / 2, bot + 4);
  if (over) sch.text((xs + xr) / 2, 230, d!.vOver ? "over the part’s voltage limit" : Number.isFinite(d!.load) ? "over the part’s power rating" : "beyond 10 W parts: use a power resistor", "sch-hint hl");
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: OhmState, r) => circuit(s, r) },
};

export default mod;
