/** Attenuator Designer — page module: def + theory + a Circuit tab drawing the pad as built. */

import type { CalcModule } from '@/core/calc/page';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type AttenuatorState } from './def';
import type { PadValues } from './model';
import { theory } from './theory';

type Pt = [number, number];

function padCircuit(st: AttenuatorState, ideal: PadValues, built: PadValues): SVGSVGElement {
  // the bridged-T needs room above the arms for the bridge resistor and its three-line label
  const bridged = st.topology === 'bridgedT';
  const TOP = bridged ? 150 : 90;
  const GND = TOP + 160;
  const s = new Schematic(600, GND + 40);
  const rounded = st.solveFor === 'res' && st.eseries !== 'ideal';
  const val = (id: keyof PadValues) => (rounded ? [si(built[id], 'Ω', 3), `(${si(ideal[id], 'Ω', 4)})`] : si(built[id], 'Ω', 4));
  const z2 = st.topology === 'bridgedT' ? st.z1 : st.z2;
  const tone = st.solveFor === 'res' ? 'solved' : '';
  // source with its internal impedance, and the load
  s.source(40, TOP, GND, { kind: 'ac', label: 'V_s' });
  s.resistor([40, TOP], [150, TOP], { label: 'Z₁', value: si(st.z1, 'Ω', 4), tone: 'muted' });
  const x1 = 190;
  const x2 = 430;
  const xl = 530;
  s.wire([[150, TOP], [x1, TOP]]).wire([[x2, TOP], [xl, TOP]]);
  s.resistor([xl, TOP], [xl, GND], { label: 'Z₂', value: si(z2, 'Ω', 4), tone: 'muted' });
  s.wire([[40, GND], [xl, GND]]);
  s.ground(300, GND);
  // inside the bridge loop the arm labels sit above the line, so the port captions go below it
  if (bridged) s.text(x1, TOP + 22, 'port 1', 'sch-caption').text(x2, TOP + 22, 'port 2', 'sch-caption');
  else s.text(x1, TOP - 14, 'port 1', 'sch-caption').text(x2, TOP - 14, 'port 2', 'sch-caption');
  const shunt = (x: number, id: keyof PadValues, label: string) => {
    s.resistor([x, TOP], [x, GND], { label, value: val(id), tone });
    s.dot(x, TOP).dot(x, GND);
  };
  const series = (a: number, b: number, id: keyof PadValues, label: string, y = TOP) => s.resistor([a, y] as Pt, [b, y] as Pt, { label, value: val(id), tone });
  const xm = (x1 + x2) / 2;
  switch (st.topology) {
    case 'pi':
      shunt(x1, 'r1', 'R1');
      series(x1, x2, 'r2', 'R2');
      shunt(x2, 'r3', 'R3');
      break;
    case 't':
      series(x1, xm, 'r1', 'R1');
      series(xm, x2, 'r3', 'R3');
      shunt(xm, 'r2', 'R2');
      break;
    case 'bridgedT': {
      const yb = TOP - 75;
      series(x1, xm, 'r3', 'R3');
      series(xm, x2, 'r3', 'R4');
      shunt(xm, 'r2', 'R2');
      s.wire([[x1, TOP], [x1, yb]]).wire([[x2, TOP], [x2, yb]]).dot(x1, TOP).dot(x2, TOP);
      series(x1, x2, 'r1', 'R1', yb);
      break;
    }
    case 'minloss':
      if (st.z1 >= st.z2) {
        series(x1, x2, 'r1', 'R1');
        shunt(x2, 'r2', 'R2');
      } else {
        shunt(x1, 'r2', 'R2');
        series(x1, x2, 'r1', 'R1');
      }
      break;
  }
  return s.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: {
    title: 'Circuit',
    draw(st: AttenuatorState, r) {
      const d = r.details as { ideal?: PadValues; built?: PadValues } | undefined;
      return r.ok && d?.ideal && d.built ? padCircuit(st, d.ideal, d.built) : null;
    },
  },
};

export default mod;
