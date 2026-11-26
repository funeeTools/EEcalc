/** Op-Amp Gain — page module: definition + theory + a circuit tab for the chosen configuration. */

import type { CalcModule } from '@/core/calc/page';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type OpampState } from './def';
import { theory } from './theory';

const NS = 'http://www.w3.org/2000/svg';

function path(svg: SVGSVGElement, d: string, cls = 'sch-body'): void {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('class', cls);
  p.setAttribute('fill', 'none');
  svg.appendChild(p);
}

function circuit(s: OpampState): SVGSVGElement {
  const sch = new Schematic(440, 280);
  const r = (v: number) => si(v, 'Ω', 4);
  const xL = 210; // triangle left edge
  const xO = 290; // output apex
  const yM = 125; // − input
  const yP = 175; // + input
  const yC = 150;
  const xN = 175; // − node
  const yF = 60; // feedback rail
  const xOut = 340;
  sch.wire([[xN, yM], [xL, yM]]);
  sch.wire([[xN, yM], [xN, yF]]);
  sch.resistor([xN, yF], [xOut, yF], { label: 'R_f', value: r(s.rf), tone: s.solveFor === 'rf' ? 'solved' : '' });
  sch.wire([[xOut, yF], [xOut, yC]]);
  sch.wire([[xO, yC], [xOut + 40, yC]]).dot(xOut, yC).dot(xN, yM);
  sch.text(xOut + 44, yC + 4, 'V_out', 'sch-label', 'start');
  if (s.config === 'noninv') {
    sch.resistor([xN, yM], [80, yM], { label: 'R_in', value: r(s.rin), flip: true, tone: s.solveFor === 'rin' ? 'solved' : '' });
    sch.wire([[80, yM], [80, yM + 20]]).ground(80, yM + 20);
    sch.wire([[185, 245], [185, yP], [xL, yP]]);
    sch.text(185, 262, 'V_in', 'sch-label');
  } else if (s.config === 'inv') {
    sch.resistor([50, yM], [xN, yM], { label: 'R_in', value: r(s.rin), tone: s.solveFor === 'rin' ? 'solved' : '' });
    sch.text(44, yM + 4, 'V_in', 'sch-label', 'end');
    sch.wire([[185, yP], [xL, yP]]).wire([[185, yP], [185, yP + 25]]).ground(185, yP + 25);
  } else {
    sch.resistor([50, yM], [xN, yM], { label: 'R_in', value: r(s.rin), tone: s.solveFor === 'rin' ? 'solved' : '' });
    sch.text(44, yM + 4, 'V₁', 'sch-label', 'end');
    sch.resistor([50, yP], [150, yP], { label: 'R₃', value: r(s.rin), flip: true });
    sch.text(44, yP + 4, 'V₂', 'sch-label', 'end');
    sch.wire([[150, yP], [xL, yP]]).dot(150, yP);
    sch.resistor([150, yP], [150, 250], { label: 'R₄', value: r(s.rf) });
    sch.ground(150, 254);
  }
  const svg = sch.svg();
  path(svg, `M ${xL} ${yC - 50} L ${xL} ${yC + 50} L ${xO} ${yC} Z`);
  path(svg, `M ${xL + 6} ${yM} L ${xL + 16} ${yM} M ${xL + 6} ${yP} L ${xL + 16} ${yP} M ${xL + 11} ${yP - 5} L ${xL + 11} ${yP + 5}`, 'sch-line');
  return svg;
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: OpampState, r) => (r.ok ? circuit(s) : null) },
};

export default mod;
