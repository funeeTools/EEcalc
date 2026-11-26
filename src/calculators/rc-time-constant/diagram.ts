/** RC Time Constant — live circuit drawing: step source → R → v_C(t) node → C → ground. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { RcState } from './def';

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function rcCircuit(st: RcState, r: CalcReport): SVGSVGElement {
  const s: RcState = (r.ok && (r.details?.state as RcState)) || st;
  const solve = s.solveFor;
  const solvingRC = solve === 'r' || solve === 'c';
  const tauGiven = solvingRC && s.target === 'tau';
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));
  // the unknowns of this solve (the field rows shown green)
  const solved = { r: solve === 'r', c: solve === 'c', tau: !tauGiven, vth: solve === 'vth', t: solve === 't' || tauGiven };
  const fmt = (v: number, unit: string, isSolved: boolean, digits = 3) => (isSolved && !r.ok) || !ok(v) ? '?' : si(v, unit, digits);
  const tone = (isSolved: boolean, hl = false) => (hl ? 'hl' : isSolved ? 'solved' : '');
  const tauVal = r.ok ? (r.details?.tau as number) : solved.tau ? NaN : s.tau;
  const tItem = r.results.find((i) => i.key === 't');
  const never = r.ok && tItem != null && tItem.value == null;

  const xs = 60;
  const xc = 250;
  const xo = 330;
  const top = 70;
  const gnd = 210;
  const sch = new Schematic(415, 258);

  // step source: V₀ before t = 0, V∞ after
  sch.source(xs, top, gnd, { kind: 'step' });
  sch.text(xs + 28, (top + gnd) / 2 - 2, 'V₀ → V∞', 'sch-label', 'start');
  sch.text(xs + 28, (top + gnd) / 2 + 11, `${fmt(s.v0, 'V', false, 4)} → ${fmt(s.vInf, 'V', false, 4)}`, 'sch-value', 'start');

  sch.resistor([xs, top], [xc, top], { label: 'R', value: fmt(s.r, 'Ω', solved.r), tone: tone(solved.r, warn(/^R = /)), body: 44 });
  sch.capacitor([xc, top], [xc, gnd], { label: 'C', value: fmt(s.c, 'F', solved.c), tone: tone(solved.c) });
  sch.wire([[xs, gnd], [xc, gnd]]);
  sch.wire([[(xs + xc) / 2, gnd], [(xs + xc) / 2, gnd + 8]]).ground((xs + xc) / 2, gnd + 8);

  // capacitor node and what is read there
  sch.wire([[xc, top], [xo, top]]).dot(xc, top).terminal(xo, top);
  sch.text(xo + 8, top + 4, 'v_C(t)', 'sch-label', 'start');
  const vthHl = warn(/^V_th (is|=) /); // near the asymptote, or never reached
  const xa = xo - 10;
  sch.text(xa, top + 40, `τ ${fmt(tauVal, 's', solved.tau)}`, `sch-value ${tone(solved.tau)}`.trim(), 'start');
  sch.text(xa, top + 56, `V_th ${fmt(s.vth, 'V', solved.vth, 4)}`, `sch-value ${tone(solved.vth, vthHl)}`.trim(), 'start');
  sch.text(xa, top + 72, `t ${never ? 'never' : fmt(s.t, 's', solved.t)}`, `sch-value ${tone(solved.t, never)}`.trim(), 'start');
  sch.text(xa, top + 92, 'v_C(t) = V_th', 'sch-hint', 'start');
  sch.text(xa, top + 105, 'at time t', 'sch-hint', 'start');
  return sch.svg();
}
