/** Inductor Energy — page module: def + theory + an RL ramp circuit drawing. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type IndState } from './def';
import { theory } from './theory';

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Step source → switch → R → L (with the turn-off clamp across L when one is given). */
function circuit(st: IndState, r: CalcReport): SVGSVGElement {
  const s: IndState = (r.ok && (r.details?.state as IndState)) || st;
  const res = (k: string) => r.results.find((i) => i.key === k)?.value;
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));
  const lOrI = s.solveFor === 'l' || s.solveFor === 'i';
  const solved = { l: s.solveFor === 'l', i: s.solveFor === 'i', v: s.solveFor === 'v', e: !(lOrI && s.target === 'energy'), t: !(s.solveFor === 'v' || (lOrI && s.target === 'time')) };
  const fmt = (v: unknown, unit: string, isSolved: boolean, d = 3) => ((isSolved && !r.ok) || !ok(v) ? '?' : si(v, unit, d));
  const tone = (isSolved: boolean, hl = false) => (hl ? 'hl' : isSolved ? 'solved' : '');
  const sat = warn(/above I_sat/);
  const never = warn(/is never reached/);
  const clamp = s.vClamp != null;

  // Clamp across the coil: high-side switch, diode (+ zener in series) across L. Zener across the switch: low-side
  // switch with the zener/TVS from the switch node to ground, so the supply stays in the decay loop.
  const ground = clamp && s.clampType === 'ground';
  const sch = new Schematic(440, 262);
  const xs = 56;
  const xl = 300;
  const top = ground ? 54 : 64;
  const gnd = ground ? 180 : 208;
  sch.source(xs, top, gnd, { kind: 'step', label: 'V', value: fmt(s.v, 'V', solved.v, 4), tone: tone(solved.v) });
  if (ground) {
    sch.resistor([xs, top], [220, top], { label: 'R', value: si(s.r, 'Ω', 3), body: 40 });
  } else {
    sch.switch([xs, top], [126, top], { closed: true });
    sch.text(91, top - 16, 't = 0', 'sch-hint');
    sch.resistor([126, top], [220, top], { label: 'R', value: si(s.r, 'Ω', 3), body: 40 });
  }
  sch.wire([[220, top], [xl, top]]);
  sch.inductor([xl, top], [xl, gnd], { label: 'L', value: fmt(s.l, 'H', solved.l, 4), tone: tone(solved.l, sat), flip: true });
  if (ground) {
    // low-side switch on the return, zener across it (cathode on the coil side)
    const xa = 160;
    const xb = 236;
    const yz = gnd + 36;
    sch.wire([[xl, gnd], [xb, gnd]]).wire([[xa, gnd], [xs, gnd]]);
    sch.switch([xb, gnd], [xa, gnd], { closed: true });
    sch.text((xa + xb) / 2, gnd + 18, 't = 0', 'sch-hint'); // inside the switch/zener loop, clear of the text block
    sch.wire([[xb, gnd], [xb, yz]]).wire([[xa, gnd], [xa, yz]]).dot(xb, gnd).dot(xa, gnd);
    sch.diode([xa, yz], [xb, yz], { kind: 'zener', label: `V_Z ${si(s.vClamp as number, 'V', 3)}`, flip: true });
    sch.wire([[xs, gnd], [xs, gnd + 8]]).ground(xs, gnd + 8);
  } else {
    sch.wire([[xs, gnd], [xl, gnd]]);
    sch.wire([[(xs + xl) / 2, gnd], [(xs + xl) / 2, gnd + 8]]).ground((xs + xl) / 2, gnd + 8);
  }

  // current arrow along the top wire
  sch.arrow([232, top - 14], [286, top - 14], { tone: sat ? 'hl' : '' });
  sch.text(259, top - 22, `I ${fmt(s.i, 'A', solved.i)}`, `sch-label ${tone(solved.i, sat)}`.trim());

  // clamp across the coil: a diode (cathode to the supply end), plus a zener in series for a fast clamp
  if (clamp && !ground) {
    const xd = 372;
    const ym = (top + gnd) / 2;
    sch.wire([[xl, top], [xd, top]]).wire([[xl, gnd], [xd, gnd]]).dot(xl, top).dot(xl, gnd);
    if ((s.vClamp as number) > 2) {
      sch.diode([xd, gnd], [xd, ym], {});
      sch.diode([xd, top], [xd, ym], { kind: 'zener', label: 'clamp', value: si(s.vClamp as number, 'V', 3) });
    } else sch.diode([xd, gnd], [xd, top], { label: 'clamp', value: si(s.vClamp as number, 'V', 3) });
  }

  // what the coil holds (inside the loop, left of L)
  const xa = 120;
  const y0 = ground ? 96 : 112;
  sch.text(xa, y0, `E ${fmt(res('e'), 'J', solved.e)}`, `sch-label ${tone(solved.e, sat)}`.trim(), 'start');
  sch.text(xa, y0 + 16, `λ ${fmt(res('lambda'), 'Wb', true)}`, 'sch-value', 'start');
  sch.text(xa, y0 + 38, `t ${never ? 'never' : fmt(s.t, 's', solved.t)}`, `sch-label ${tone(solved.t, never)}`.trim(), 'start');
  sch.text(xa, y0 + 54, `τ ${ok(res('tau')) ? si(res('tau') as number, 's', 3) : '∞'}`, 'sch-value', 'start');
  if (s.iSat != null) sch.text(xa, y0 + 76, `I_sat ${si(s.iSat, 'A', 3)}`, `sch-value ${sat ? 'hl' : ''}`.trim(), 'start');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s, r) => circuit(s as IndState, r) },
};
export default mod;
