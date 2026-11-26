/** Zener Diode — page module: definition + theory + the shunt-regulator circuit. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type ZenerState } from './def';
import { theory } from './theory';

const range = (a: number, b: number, unit: string, d = 3) =>
  Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-12) ? si(a, unit, d) : `${a === 0 ? '0' : si(a, unit, d)} … ${si(b, unit, d)}`;

export function circuit(s: ZenerState, r: CalcReport): SVGSVGElement {
  const d = (r.ok ? r.details : null) as null | { rUse: number; ilMax: number; izLo: number; izHi: number; voutLo: number; voutHi: number; pzMax: number; pd: number; corners: { ir: number }[] };
  const sch = new Schematic(460, 250);
  const xs = 40;
  const xz = 250;
  const xl = 360;
  const top = 50;
  const gnd = 200;
  const solvedR = s.solveFor === 'r' ? 'solved' : '';
  const solvedL = s.solveFor === 'ilMax' ? 'solved' : '';
  sch.source(xs, top, gnd, { kind: 'dc' });
  sch.text(xs + 20, 120, 'V_in', 'sch-label', 'start');
  sch.text(xs + 20, 134, range(s.vinMin, s.vinMax, 'V'), 'sch-value', 'start');
  sch.wire([[xs, top], [95, top]]);
  sch.resistor([95, top], [185, top], { label: 'R', value: si(d?.rUse ?? s.r, 'Ω', 3), tone: solvedR });
  sch.wire([[185, top], [xl, top]]).dot(xz, top);
  // current through R, drawn on the wire
  sch.arrow([196, top], [226, top], { tone: solvedR });
  if (d) sch.text(211, top + 17, `I_R ≤ ${si(Math.max(...d.corners.map((c) => c.ir)), 'A', 3)}`, 'sch-value', 'middle');
  const hot = d != null && d.pzMax > d.pd;
  sch.diode([xz, 160], [xz, 90], { kind: 'zener', label: 'D_Z', value: [`${si(s.vz, 'V', 3)}${s.tol > 0 ? ` ±${+s.tol.toFixed(2)} %` : ''}`, d ? `P_Z ≤ ${si(d.pzMax, 'W', 3)}` : ''].filter(Boolean), tone: hot ? 'hl' : '' });
  sch.wire([[xz, top], [xz, 90]]).wire([[xz, 160], [xz, gnd]]);
  if (d) {
    // below the source label, beside the lower half of the zener branch
    const off = d.izLo <= 0 ? 'hl' : ''; // dropped out at some corner
    sch.arrow([xz - 14, 160], [xz - 14, 194], { tone: off });
    sch.text(xz - 22, 176, 'I_Z', `sch-label ${off}`.trim(), 'end');
    sch.text(xz - 22, 190, range(d.izLo, d.izHi, 'A', 3), `sch-value ${off}`.trim(), 'end');
  }
  sch.resistor([xl, top], [xl, gnd], { label: 'Load', value: `I_L ${range(s.ilMin, d?.ilMax ?? s.ilMax, 'A', 3)}`, tone: solvedL || 'muted' });
  sch.wire([[xs, gnd], [xl, gnd]]).dot(xz, gnd);
  sch.ground(150, gnd + 4);
  if (d) sch.text(300, top - 12, `V_out ${range(d.voutLo, d.voutHi, 'V')}`, 'sch-label', 'middle');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: ZenerState, r) => circuit(s, r) },
};

export default mod;
