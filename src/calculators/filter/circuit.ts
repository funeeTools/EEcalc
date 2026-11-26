/** Ladder schematic for the filter designer: source + Rs, arms left → right, load. */

import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { Arm, Design } from './model';

const PITCH = 104;
const TOP = 70;
const GND = 250;

const val = (p: { kind: 'L' | 'C'; value: number }) => si(p.value, p.kind === 'L' ? 'H' : 'F', 4);

function part(s: Schematic, p: Arm['parts'][number], a: [number, number], b: [number, number], flip = false) {
  if (p.kind === 'L') s.inductor(a, b, { label: p.ref, value: val(p), flip });
  else s.capacitor(a, b, { label: p.ref, value: val(p), flip });
}

export function ladderCircuit(d: Design): SVGSVGElement {
  const n = d.arms.length;
  const width = 170 + n * PITCH + 120;
  const s = new Schematic(width, GND + 40);
  const xs0 = 50;
  // source and Rs
  s.source(xs0, TOP, GND, { kind: 'ac', label: 'V_s' });
  s.resistor([xs0, TOP], [xs0 + 100, TOP], { label: 'R_s', value: si(d.rs, 'Ω', 4) });
  let x = xs0 + 100;
  for (const arm of d.arms) {
    const xn = x + PITCH;
    if (arm.position === 'series') {
      if (arm.form === 'single') part(s, arm.parts[0], [x, TOP], [xn, TOP]);
      else if (arm.form === 'seriesLC') {
        const xm = (x + xn) / 2;
        part(s, arm.parts[0], [x, TOP], [xm, TOP]);
        part(s, arm.parts[1], [xm, TOP], [xn, TOP], true);
      } else {
        // parallel LC in the series path
        s.wire([[x + 10, TOP - 22], [x + 10, TOP + 22]]).wire([[xn - 10, TOP - 22], [xn - 10, TOP + 22]]).wire([[x, TOP], [x + 10, TOP]]).wire([[xn - 10, TOP], [xn, TOP]]);
        part(s, arm.parts[0], [x + 10, TOP - 22], [xn - 10, TOP - 22]);
        part(s, arm.parts[1], [x + 10, TOP + 22], [xn - 10, TOP + 22], true);
      }
      x = xn;
    } else {
      const xc = x + PITCH / 2;
      s.wire([[x, TOP], [xn, TOP]]).dot(xc, TOP);
      if (arm.form === 'single') part(s, arm.parts[0], [xc, TOP], [xc, GND]);
      else if (arm.form === 'seriesLC') {
        const ym = (TOP + GND) / 2;
        part(s, arm.parts[0], [xc, TOP], [xc, ym]);
        part(s, arm.parts[1], [xc, ym], [xc, GND]);
      } else {
        s.wire([[xc - 22, TOP + 20], [xc + 22, TOP + 20]]).wire([[xc, TOP], [xc, TOP + 20]]).wire([[xc - 22, GND - 10], [xc + 22, GND - 10]]).wire([[xc, GND - 10], [xc, GND]]);
        part(s, arm.parts[0], [xc - 22, TOP + 20], [xc - 22, GND - 10], true);
        part(s, arm.parts[1], [xc + 22, TOP + 20], [xc + 22, GND - 10]);
      }
      s.dot(xc, GND);
      x = xn;
    }
  }
  const xl = x + 60;
  s.wire([[x, TOP], [xl, TOP]]);
  s.resistor([xl, TOP], [xl, GND], { label: 'R_L', value: si(d.rl, 'Ω', 4) });
  s.wire([[xs0, GND], [xl, GND]]);
  s.ground(xl - 30, GND + 6);
  return s.svg();
}
