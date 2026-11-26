/** NTC Thermistor — live divider drawing: V_S → (R_S over NTC, or NTC over R_S) → V_out → ADC. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { NtcState } from './def';

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function ntcCircuit(s: NtcState, r: CalcReport): SVGSVGElement {
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));
  const res = (k: string) => r.results.find((i) => i.key === k);
  // Whichever of T, R_T, V_out is typed is given; the other two are solved (same rule as the form).
  const given = s.solveFor === 'temp' ? 'r' : s.solveFor === 'tempFromV' ? 'vout' : 'temp';
  const val = (k: 'temp' | 'r' | 'vout'): number => (k === given ? s[k] : r.ok ? (res(k)?.value as number) : NaN);
  const tone = (k: 'temp' | 'r' | 'vout', hl = false) => (hl ? 'hl' : k !== given ? 'solved' : '');
  const T = val('temp');
  const R = val('r');
  const V = val('vout');

  const xs = 70;
  const xd = 180;
  const top = 40;
  const mid = 140;
  const gnd = 240;
  const sch = new Schematic(420, 282);

  sch.source(xs, top, gnd, { kind: 'dc', label: 'V_S', value: si(s.vs, 'V', 3) });
  sch.wire([[xs, top], [xd, top]]).wire([[xs, gnd], [xd, gnd]]);
  sch.wire([[(xs + xd) / 2, gnd], [(xs + xd) / 2, gnd + 8]]).ground((xs + xd) / 2, gnd + 8);

  // 'low': R_S on top, NTC to ground (model.ts vOut: V = V_S·R/(R + R_S)); 'high': NTC on top
  const ntcLow = s.divider === 'low';
  const [ntcA, ntcB] = ntcLow ? [mid, gnd] : [top, mid];
  const [rsA, rsB] = ntcLow ? [top, mid] : [mid, gnd];
  sch.resistor([xd, rsA], [xd, rsB], { label: 'R_S', value: si(s.rs, 'Ω', 3) });
  const selfHeat = warn(/^Self-heating/);
  sch.thermistor([xd, ntcA], [xd, ntcB], { tone: tone('r', selfHeat) });
  const ny = (ntcA + ntcB) / 2;
  sch.text(xd + 18, ny - 4, `R_T ${ok(R) ? si(R, 'Ω', 3) : '?'}`, `sch-label ${tone('r', selfHeat)}`.trim(), 'start');
  sch.text(xd + 18, ny + 13, `at ${ok(T) ? `${T.toFixed(1).replace('-', '−')} °C` : '?'}`, `sch-value ${tone('temp', warn(/^T = /))}`.trim(), 'start');

  // V_out node to the ADC (or an open terminal with no ADC)
  sch.dot(xd, mid);
  const vText = `Vout ${ok(V) ? si(V, 'V', 3) : '?'}`;
  const vTone = tone('vout');
  if (s.adcBits > 0) {
    const bx = 300;
    sch.wire([[xd, mid], [bx, mid]]);
    sch.text((xd + bx) / 2 + 4, mid - 9, vText, `sch-label ${vTone}`.trim());
    sch.block(bx, mid - 30, 84, 60, { label: 'ADC', value: `${s.adcBits}-bit` });
    sch.pin(bx, mid, 'IN', 'left');
    const code = r.ok ? res('adcCode') : undefined;
    if (code) sch.text(bx + 42, mid + 46, `code ${code.value}`, 'sch-hint');
    sch.text(bx + 42, mid - 40, 'ref = V_S', 'sch-hint');
  } else {
    const xo = 280;
    sch.wire([[xd, mid], [xo, mid]]).terminal(xo, mid);
    sch.text(xo + 8, mid + 4, vText, `sch-label ${vTone}`.trim(), 'start');
  }
  return sch.svg();
}
