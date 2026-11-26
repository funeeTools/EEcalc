/** BJT Bias Point — page module: definition + theory + the bias circuit (all three networks, NPN and PNP). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { actual, def, type BjtState } from './def';
import type { BiasPoint } from './model';
import { theory } from './theory';

export function circuit(s: BjtState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as { pointStd: BiasPoint; std: null | Record<string, number>; pd: number }) : null;
  const q = d?.pointStd ?? null;
  // Standard parts are drawn when designing (the circuit you would build); the exact values are in the inputs.
  const val = (k: 'r1' | 'r2' | 'rb' | 'rc' | 're') => (d?.std ? d.std[k] : s[k]);
  const pnp = s.type === 'pnp';
  const design = s.solveFor === 'design';
  const tone = design ? 'solved' : '';
  const R = (v: number) => (v > 0 ? si(v, 'Ω', 3) : '0 Ω');
  const sch = new Schematic(420, 300);
  const top = 34;
  const gnd = 272;
  const yb = 152; // base line
  const xd = 112; // divider / base-resistor column
  const xq = 250; // transistor centre; C/E leads at xq + 10
  const xl = xq + 10;
  const yU = yb - 30; // upper lead end
  const yL = yb + 30; // lower lead end
  sch.wire([[44, top], [xl, top]]);
  sch.text(44, top - 10, `V_CC ${si(s.vcc, 'V', 3)}`, 'sch-label', 'start');
  // the ground rail reaches the base column only when something there returns to ground
  const leftGnd = s.topo === 'divider' || (s.topo === 'fixed' && pnp);
  sch.wire([[leftGnd ? xd : (xd + xl) / 2 - 24, gnd], [xl, gnd]]);
  sch.ground((xd + xl) / 2, gnd + 4);
  const hot = q != null && (q.region !== 'active' || d!.pd > s.ptot);
  const pins = sch.bjt(xq, yb, { type: s.type, label: 'Q₁', value: s.part !== 'Custom' ? s.part.replace(/ \(.*\)$/, '') : pnp ? 'PNP' : 'NPN', tone: hot ? 'hl' : '' });
  // upper element: R_C (NPN) or R_E (PNP); lower: R_E (NPN) or R_C (PNP)
  const upper = pnp ? { k: 're' as const, n: 'R_E' } : { k: 'rc' as const, n: 'R_C' };
  const lower = pnp ? { k: 'rc' as const, n: 'R_C' } : { k: 're' as const, n: 'R_E' };
  const yUn = yU - 16; // node between the upper resistor and the transistor
  const yLn = yL + 16;
  const fb = s.topo === 'feedback';
  if (val(upper.k) > 0 || upper.k === 'rc') sch.resistor([xl, top], [xl, yUn], { label: upper.n, value: R(val(upper.k)), tone });
  else {
    sch.wire([[xl, top], [xl, yUn]]);
    sch.text(xl + 12, (top + yUn) / 2 + 4, 'R_E = 0', 'sch-hint', 'start');
  }
  sch.wire([[xl, yUn], pins[pnp ? 'e' : 'c']]);
  if (val(lower.k) > 0 || lower.k === 'rc') sch.resistor([xl, yLn], [xl, gnd], { label: lower.n, value: R(val(lower.k)), tone });
  else {
    sch.wire([[xl, yLn], [xl, gnd]]);
    sch.text(xl + 12, (yLn + gnd) / 2 + 4, 'R_E = 0', 'sch-hint', 'start');
  }
  sch.wire([pins[pnp ? 'c' : 'e'], [xl, yLn]]);
  // base network
  const xb = pins.b[0];
  if (s.topo === 'divider') {
    sch.resistor([xd, top], [xd, yb], { label: 'R₁', value: R(val('r1')), tone });
    sch.resistor([xd, yb], [xd, gnd], { label: 'R₂', value: R(val('r2')), tone });
    sch.wire([[xd, yb], [xb, yb]]).dot(xd, yb).dot(xd, top).dot(xd, gnd);
  } else if (s.topo === 'fixed') {
    if (pnp) sch.resistor([xd, yb], [xd, gnd], { label: 'R_B', value: R(val('rb')), tone }).dot(xd, gnd);
    else sch.resistor([xd, top], [xd, yb], { label: 'R_B', value: R(val('rb')), tone }).dot(xd, top);
    sch.wire([[xd, yb], [xb, yb]]);
  } else {
    // collector feedback: R_B from the collector node to the base
    const yc = pnp ? yLn : yUn;
    sch.resistor([xl, yc], [xd + 40, yc], { label: 'R_B', value: R(val('rb')), tone, flip: pnp });
    sch.wire([[xd + 40, yc], [xd + 40, yb], [xb, yb]]).dot(xl, yc);
  }
  sch.dot(xl, top).dot(xl, gnd);
  if (q) {
    const vt = design ? '' : 'solved';
    const vColl = actual(s, q.vc);
    const vEm = actual(s, q.ve);
    const yC = pnp ? yLn : yUn;
    const yE = pnp ? yUn : yLn;
    if (fb) sch.text(xl + 10, yC + (pnp ? 14 : -6), `V_C ${si(vColl, 'V', 3)}`, 'sch-value', 'start');
    else sch.text(xl - 8, yC + (pnp ? 14 : -4), `V_C ${si(vColl, 'V', 3)}`, 'sch-value', 'end');
    sch.text(xl - 8, yE + (pnp ? -4 : 14), `V_E ${si(vEm, 'V', 3)}`, 'sch-value', 'end');
    const xbl = s.topo === 'feedback' ? (xd + 40 + xb) / 2 + 4 : (xd + xb) / 2 + 6;
    sch.text(xbl, yb - 8, `V_B ${si(actual(s, q.vb), 'V', 3)}`, 'sch-value', 'middle');
    // base current flows into an NPN base and out of a PNP base
    if (pnp) sch.arrow([xb - 8, yb], [xb - 30, yb], {});
    else sch.arrow([xb - 30, yb], [xb - 8, yb], {});
    sch.text(xbl, yb + 18, `I_B ${si(q.ib, 'A', 3)}`, 'sch-value', 'middle');
    const xr = xl + 26;
    sch.text(xr, yb + 26, `I_C ${si(q.ic, 'A', 3)}`, `sch-label ${vt}`.trim(), 'start');
    sch.text(xr, yb + 40, `${q.region} · V_CE ${si((pnp ? -1 : 1) * q.vce, 'V', 3).replace(/^-/, '−')}`, `sch-value ${hot ? 'hl' : vt}`.trim(), 'start');
  }
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: BjtState, r) => circuit(s, r) },
};

export default mod;
