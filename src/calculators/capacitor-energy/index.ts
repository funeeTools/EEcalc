/** Capacitor Energy — page module: def + theory + a hold-up circuit drawing. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type CapState } from './def';
import { theory } from './theory';

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Capacitor (bank) with its ESR feeding a DC/DC converter that draws constant power down to V₂. */
function circuit(st: CapState, r: CalcReport): SVGSVGElement {
  const s: CapState = (r.ok && (r.details?.state as CapState)) || st;
  const res = (k: string) => r.results.find((i) => i.key === k)?.value;
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));
  const solved = { c: s.solveFor === 'c', v: s.solveFor === 'v', e: !(s.solveFor !== 'e' && s.target === 'energy'), t: !(s.solveFor !== 'e' && s.target === 'holdup') };
  const fmt = (v: unknown, unit: string, isSolved: boolean, d = 3) => ((isSolved && !r.ok) || !ok(v) ? '?' : si(v, unit, d));
  const tone = (isSolved: boolean, hl = false) => (hl ? 'hl' : isSolved ? 'solved' : '');
  const over = warn(/^V_cell = /);
  const esrHl = warn(/^ESR limit|^The ESR wastes/);

  const W = 450;
  const sch = new Schematic(W, 262);
  const xc = 120;
  const top = 58;
  const gnd = 212;
  const xb = 318; // converter block centre
  const bank = s.ns * s.np > 1;

  // ESR in series with C (one cell drawn; the bank is named in the label)
  sch.resistor([xc, top], [xc, 118], { label: 'ESR', value: si(s.esr, 'Ω', 3), tone: esrHl ? 'hl' : '', flip: true, body: 34 });
  const cLines = [fmt(s.c, 'F', solved.c, 4)];
  if (bank) cLines.push(`${s.ns} s × ${s.np} p`, `= ${fmt(res('cBank'), 'F', true)}`);
  sch.capacitor([xc, 118], [xc, gnd], { label: 'C', value: cLines, tone: tone(solved.c, over), flip: true });
  sch.wire([[xc, top], [xb, top], [xb, 98]]);
  sch.wire([[xc, gnd], [xb, gnd], [xb, 166]]);
  sch.dot(xc, top).dot(xc, gnd);
  sch.wire([[(xc + xb) / 2, gnd], [(xc + xb) / 2, gnd + 8]]).ground((xc + xb) / 2, gnd + 8);

  // converter and its load
  sch.block(xb - 44, 98, 88, 68, { label: 'DC/DC', value: [`η ${s.eta} %`] });
  sch.arrow([xb + 44, 132], [W - 14, 132]);
  sch.text(W - 14, 122, 'P', 'sch-label', 'end');
  sch.text(W - 14, 150, si(s.pOut, 'W', 3), 'sch-value', 'end');

  // current into the converter (peak at the cut-off)
  const i2 = res('i2');
  sch.arrow([178, top - 12], [250, top - 12]);
  sch.text(214, top - 20, `I ${ok(i2) ? `→ ${si(i2, 'A', 3)}` : '?'}`, 'sch-value', 'middle');

  // what the capacitor holds and how long it lasts
  const xa = 150;
  sch.text(xa, 94, `V₁ ${fmt(s.v, 'V', solved.v, 4)}`, `sch-label ${tone(solved.v, over)}`.trim(), 'start');
  sch.text(xa, 110, `V₂ ${si(s.vMin, 'V', 4)}`, 'sch-value', 'start');
  sch.text(xa, 134, `E ${fmt(res('e'), 'J', solved.e)}`, `sch-label ${tone(solved.e)}`.trim(), 'start');
  sch.text(xa, 150, `ΔE ${fmt(res('eUsable'), 'J', true)}`, 'sch-value', 'start');
  const tH = res('tHold');
  const tTxt = r.ok && tH == null ? 'ESR limit' : fmt(tH, 's', solved.t);
  sch.text(xa, 174, `t_hold ${tTxt}`, `sch-label ${tone(solved.t, r.ok && (tH == null || tH === 0))}`.trim(), 'start');
  sch.text(xa, 190, 'V₁ → V₂ at P/η', 'sch-hint', 'start');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s, r) => circuit(s as CapState, r) },
};
export default mod;
