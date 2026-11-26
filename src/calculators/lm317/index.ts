/** LM317 / LM337 resistors — page module: definition + theory + the regulator circuit. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type Lm317State, PARTS, def } from './def';
import { operatingPoint, vOut } from './model';
import { theory } from './theory';

const W = 460;
const H = 270;

export function circuit(s: Lm317State, r: CalcReport): SVGSVGElement {
  const neg = PARTS[s.part]?.neg ?? false;
  const sg = neg ? -1 : 1;
  // Solved boxes come back through the report (the state may still hold the old number when !ok).
  const val = (k: 'vout' | 'r1' | 'r2') => {
    if (s.solveFor !== k) return s[k];
    const v = r.results.find((x) => x.key === k)?.value;
    return r.ok && typeof v === 'number' ? Math.abs(v) : NaN;
  };
  const r1 = val('r1');
  const r2 = val('r2');
  const ok = Number.isFinite(r1) && Number.isFinite(r2) && r1 > 0;
  const vout = ok ? vOut(s.vref, s.iadj, r1, r2) : NaN;
  const op = ok ? operatingPoint(s.vref, s.iadj, r1, r2, s.vin, s.iload, s.vdo) : null;
  const dropout = op != null && op.margin < 0;
  const lightLoad = op != null && op.iR1 + s.ilmin < s.imin;
  const tone = (k: string) => (s.solveFor === k ? 'solved' : '');
  const fV = (v: number) => (Number.isFinite(v) ? si(sg * v, 'V', 4) : '—');
  const fR = (v: number) => (Number.isFinite(v) ? si(v, 'Ω', 4) : '—');

  const sch = new Schematic(W, H);
  const top = 72;
  const gnd = 236;
  const xs = 44;
  const bx = 120;
  const bw = 130;
  const by = 48;
  const bh = 58;
  const xa = bx + bw / 2; // ADJ pin
  const xr = 280; // R1 / R2 column
  const ym = 156; // ADJ node
  const xl = 384; // load

  // input source: + on top for the LM317; for the LM337 the top rail is negative (+ at ground)
  if (neg) sch.sourceBetween([xs, gnd], [xs, top], { kind: 'dc', tone: dropout ? 'hl' : '' });
  else sch.source(xs, top, gnd, { kind: 'dc', tone: dropout ? 'hl' : '' });
  sch.text(xs, top - 37, 'V_in', `sch-label ${dropout ? 'hl' : ''}`.trim()).text(xs, top - 21, fV(s.vin), `sch-value ${dropout ? 'hl' : ''}`.trim());

  // regulator
  sch.wire([[xs, top], [bx, top]]);
  sch.block(bx, by, bw, bh, { label: neg ? 'LM337' : s.part.startsWith('LM317') ? 'LM317' : 'ADJ REG', value: op && !dropout ? `P_D ${si(op.pd, 'W', 3)}` : dropout ? 'dropout' : '', tone: dropout ? 'hl' : '' });
  sch.pin(bx, top, 'IN', 'left').pin(bx + bw, top, 'OUT', 'right').pin(xa, by + bh, 'ADJ', 'bottom');
  const head = op ? `V_in − V_out ${si(s.vin - vout, 'V', 3)} (needs ${si(s.vdo, 'V', 3)})` : '';
  if (head) sch.text(bx + bw / 2, by - 12, head, `sch-hint ${dropout ? 'hl' : ''}`.trim());

  // output rail, R1 from OUT to ADJ node, R2 to ground
  sch.wire([[bx + bw, top], [xl, top]]).dot(xr, top);
  sch.resistor([xr, top], [xr, ym], { label: 'R₁', value: fR(r1), tone: tone('r1') || (lightLoad ? 'hl' : '') });
  sch.resistor([xr, ym], [xr, gnd], { label: 'R₂', value: fR(r2), tone: tone('r2') });
  sch.wire([[xa, by + bh], [xa, ym], [xr, ym]]).dot(xr, ym);
  sch.text((xr + xl) / 2, top - 10, `V_out ${fV(vout)}`, `sch-label ${tone('vout')}`.trim());
  if (op) {
    // conventional current: down through R₁/R₂ and out of ADJ for the LM317, reversed for the negative LM337
    const [a1, b1]: [number, number] = neg ? [top + 62, top + 34] : [top + 34, top + 62];
    sch.arrow([xr - 12, a1], [xr - 12, b1], { tone: lightLoad ? 'hl' : '' });
    sch.text(xr - 18, top + 52, `I_R1 ${si(op.iR1, 'A', 3)}`, `sch-value ${lightLoad ? 'hl' : ''}`.trim(), 'end');
    sch.arrow(neg ? [xr - 26, ym + 12] : [xa + 20, ym + 12], neg ? [xa + 20, ym + 12] : [xr - 26, ym + 12]);
    sch.text((xa + xr) / 2 - 3, ym + 28, `I_ADJ ${si(s.iadj, 'A', 2)}`, 'sch-value');
  }

  // load
  sch.resistor([xl, top], [xl, gnd], { label: 'Load', value: si(s.iload, 'A', 3), tone: s.iload > s.imax ? 'hl' : 'muted' });
  sch.wire([[xs, gnd], [xl, gnd]]).dot(xr, gnd);
  sch.wire([[(xs + bx) / 2 + 20, gnd], [(xs + bx) / 2 + 20, gnd + 8]]).ground((xs + bx) / 2 + 20, gnd + 8);
  sch.text(W - 10, H - 8, neg ? 'negative regulator: all voltages below ground' : `V_REF ${si(s.vref, 'V', 3)} across R₁`, 'sch-hint', 'end');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: Lm317State, r) => circuit(s, r) },
};

export default mod;
