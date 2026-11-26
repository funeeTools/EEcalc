/** MOSFET Operating Point — page module: definition + theory + the bias circuit (N or P channel). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type FetState } from './def';
import type { OpPoint } from './model';
import { theory } from './theory';

export function circuit(s: FetState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as { op: OpPoint; vg: number; rs: number; pd: number }) : null;
  const op = d?.op ?? null;
  const pch = s.type === 'p';
  const div = s.bias === 'divider';
  const R = (v: number) => (v > 0 ? si(v, 'Ω', 3) : '0 Ω');
  const sv = (k: FetState['solveFor']) => (s.solveFor === k ? 'solved' : '');
  const sch = new Schematic(420, 300);
  const top = 34;
  const gnd = 272;
  const yg = 152;
  const xd = 112;
  const xq = 250;
  const xl = xq + 10;
  const yUn = yg - 46;
  const yLn = yg + 46;
  sch.wire([[44, top], [xl, top]]);
  sch.text(44, top - 10, `V_DD ${si(s.vdd, 'V', 3)}`, 'sch-label', 'start');
  // the ground rail reaches the gate column only when something there returns to ground
  sch.wire([[div || !pch ? xd : (xd + xl) / 2 - 24, gnd], [xl, gnd]]);
  sch.ground((xd + xl) / 2, gnd + 4);
  const hot = op != null && (op.region === 'cutoff' || d!.pd > s.ptot);
  const pins = sch.mosfet(xq, yg, { type: s.type, label: 'M₁', value: s.part !== 'Custom' ? s.part.replace(/ \(.*\)$/, '') : pch ? 'P-ch' : 'N-ch', tone: hot ? 'hl' : '' });
  // R_D between the drain and its rail; R_S (divider bias only) between the source and its rail.
  const dTop = !pch;
  const rsOn = div && s.rs > 0;
  const rdEl = (a: [number, number], b: [number, number]) => (s.rd > 0 ? sch.resistor(a, b, { label: 'R_D', value: R(s.rd), tone: sv('rd') }) : sch.wire([a, b]));
  const rsEl = (a: [number, number], b: [number, number]) => (rsOn ? sch.resistor(a, b, { label: 'R_S', value: R(s.rs) }) : sch.wire([a, b]));
  if (dTop) {
    rdEl([xl, top], [xl, yUn]);
    rsEl([xl, yLn], [xl, gnd]);
  } else {
    rsEl([xl, top], [xl, yUn]);
    rdEl([xl, yLn], [xl, gnd]);
  }
  sch.wire([[xl, yUn], pins[dTop ? 'd' : 's']]).wire([pins[dTop ? 's' : 'd'], [xl, yLn]]);
  sch.dot(xl, top).dot(xl, gnd);
  if (s.rd === 0) sch.text(xl + 10, dTop ? (top + yUn) / 2 + 4 : (yLn + gnd) / 2 + 4, 'R_D = 0', 'sch-hint', 'start');
  // gate bias
  const xg = pins.g[0];
  if (div) {
    sch.resistor([xd, top], [xd, yg], { label: 'R₁', value: R(s.r1) });
    sch.resistor([xd, yg], [xd, gnd], { label: 'R₂', value: R(s.r2), tone: sv('gate') });
    sch.wire([[xd, yg], [xg, yg]]).dot(xd, yg).dot(xd, top).dot(xd, gnd);
  } else {
    // a fixed gate–source voltage: from the gate to the source rail (N: ground, P: V_DD)
    const lab = { label: pch ? 'V_SG' : 'V_GS', value: si(s.vgs, 'V', 3), tone: sv('gate') };
    if (pch) sch.sourceBetween([xd, top], [xd, yg], lab).dot(xd, top);
    else sch.sourceBetween([xd, yg], [xd, gnd], lab).dot(xd, gnd);
    sch.wire([[xd, yg], [xg, yg]]);
  }
  if (op) {
    const node = (v: number) => (pch ? s.vdd - v : v);
    const vS = node(op.id * d!.rs);
    const vD = node(op.id * d!.rs + op.vds);
    sch.text(xl - 8, (dTop ? yUn : yLn) + (dTop ? -4 : 14), `V_D ${si(vD, 'V', 3)}`, `sch-value ${sv('id') || sv('gate')}`.trim(), 'end');
    sch.text(xl - 8, (dTop ? yLn : yUn) + (dTop ? 14 : -4), `V_S ${si(vS, 'V', 3)}`, 'sch-value', 'end');
    if (div) sch.text((xd + xg) / 2 + 6, yg - 8, `V_G ${si(node(d!.vg), 'V', 3)}`, 'sch-value', 'middle');
    const xr = xl + 22;
    const idTone = s.solveFor === 'gate' ? '' : 'solved';
    sch.text(xr, yg + 28, `I_D ${si(op.id, 'A', 3)}`, `sch-label ${idTone}`.trim(), 'start');
    sch.text(xr, yg + 42, `${op.region} · V_DS ${si((pch ? -1 : 1) * op.vds, 'V', 3).replace(/^-/, '−')}`, `sch-value ${hot ? 'hl' : ''}`.trim(), 'start');
    // drain current flows down in both channel types: into the N drain from R_D, out of the P drain into R_D
    const ya = dTop ? yUn - 4 : yLn + 6;
    sch.arrow([xl + 12, ya], [xl + 12, ya + 18], {});
  }
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: FetState, r) => circuit(s, r) },
};

export default mod;
