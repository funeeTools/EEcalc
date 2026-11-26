/** LED Resistor — page module: definition + theory + a circuit tab. */

import type { CalcModule } from '@/core/calc/page';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type LedState } from './def';
import { theory } from './theory';

const NS = 'http://www.w3.org/2000/svg';

/** Vertical LED symbol (anode on top) centred at (x, y), with emission arrows. */
function led(svg: SVGSVGElement, x: number, y: number): void {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute(
    'd',
    `M ${x} ${y - 20} L ${x} ${y - 9} M ${x - 9} ${y - 9} L ${x + 9} ${y - 9} L ${x} ${y + 7} Z M ${x - 9} ${y + 7} L ${x + 9} ${y + 7} M ${x} ${y + 7} L ${x} ${y + 20}` +
      ` M ${x + 12} ${y - 4} L ${x + 21} ${y - 11} M ${x + 21} ${y - 11} L ${x + 16} ${y - 10} M ${x + 21} ${y - 11} L ${x + 20} ${y - 6}` +
      ` M ${x + 12} ${y + 4} L ${x + 21} ${y - 3} M ${x + 21} ${y - 3} L ${x + 16} ${y - 2} M ${x + 21} ${y - 3} L ${x + 20} ${y + 2}`,
  );
  p.setAttribute('class', 'sch-body');
  p.setAttribute('fill', 'none');
  svg.appendChild(p);
}

function circuit(s: LedState, rStd: number, iOp: number): SVGSVGElement {
  const shown = Math.min(s.n, 4);
  const top = 40;
  const pitch = 52;
  const ledTop = 120; // centre of the first LED; each symbol spans ±20 px
  const centres = Array.from({ length: shown }, (_, k) => ledTop + k * pitch);
  const last = centres[centres.length - 1];
  const gnd = last + 50;
  const sch = new Schematic(400, gnd + 30);
  const xs = 70;
  const xl = 250;
  sch.source(xs, top, gnd, { kind: 'dc', label: 'V_s', value: si(s.vs, 'V', 4), tone: s.solveFor === 'vs' ? 'solved' : '' });
  sch.wire([[xs, top], [xl, top]]);
  sch.resistor([xl, top], [xl, ledTop - 20], { label: 'R', value: si(rStd, 'Ω', 3), tone: s.solveFor === 'r' ? 'solved' : '' });
  // the string current, green when it is the unknown
  sch.text(xl - 14, (top + ledTop - 20) / 2 + 4, `I_F ${si(iOp, 'A', 3)}`, `sch-label ${s.solveFor === 'iF' ? 'solved' : ''}`.trim(), 'end');
  for (let k = 0; k + 1 < centres.length; k++) sch.wire([[xl, centres[k] + 20], [xl, centres[k + 1] - 20]]);
  sch.wire([[xl, last + 20], [xl, gnd], [xs, gnd]]);
  sch.ground((xs + xl) / 2, gnd + 4);
  sch.text(xl + 34, ledTop + 4, `${s.n} × LED`, 'sch-label', 'start');
  sch.text(xl + 34, ledTop + 20, `V_f ${si(s.vf, 'V', 3)} each`, 'sch-value', 'start');
  if (s.n > shown) sch.text(xl - 16, last + 4, `${shown} of ${s.n} drawn`, 'sch-hint', 'end');
  if (s.strings > 1) sch.text(xs + 10, top - 14, `× ${s.strings} parallel strings, one resistor each`, 'sch-hint', 'start');
  const svg = sch.svg();
  for (const c of centres) led(svg, xl, c);
  return svg;
}

const mod: CalcModule = {
  def,
  theory,
  diagram: {
    title: 'Circuit',
    draw(s: LedState, r) {
      if (!r.ok) return null;
      const d = r.details as { rStd: number; iStd: number };
      return circuit(s, d.rStd, d.iStd);
    },
  },
};

export default mod;
