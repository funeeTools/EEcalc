/** Boost power stage, annotated with the live values (Circuit tab). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { BoostState } from './def';
import type { BoostInputs, BoostOutputs } from './model';

type Details = BoostOutputs & { inputs: BoostInputs };

const W = 460;
const TOP = 96;
const GND = 236;

export function boostCircuit(st: BoostState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as Details | undefined) : undefined;
  const inp = d?.inputs;
  const solved = st.solveFor;
  const tone = (k: string) => (solved === k ? 'solved' : '');
  const val = (k: 'l' | 'fsw' | 'cout', unit: string) => (solved === k ? (inp ? si(inp[k], unit, 3) : '—') : si(st[k], unit, 3));
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));

  const s = new Schematic(W, GND + 30);
  const xs = 30; // V_in
  const xci = 76; // C_in
  const xsw = 214; // switch node
  const xco = 306; // C_out
  const xl = 390; // load

  const dutyHl = warn(/^Duty cycle|^On-time/);
  s.text(W / 2 - 10, 22, `f_sw ${val('fsw', 'Hz')}`, `sch-label ${tone('fsw') || (dutyHl ? 'hl' : '')}`.trim(), 'end');
  const mode = d ? (d.mode === 'ccm' ? 'CCM' : d.mode === 'dcm' ? 'DCM' : 'CCM, I_L < 0') : '';
  s.text(W / 2 + 10, 22, d ? `D ${(d.d * 100).toFixed(1)} % · ${mode}` : 'D —', `sch-label ${dutyHl || (d && d.mode !== 'ccm') ? 'hl' : ''}`.trim(), 'start');

  // input: source and C_in
  s.source(xs, TOP, GND, { kind: 'dc' });
  s.text(xs, TOP - 22, 'V_in', 'sch-label').text(xs, TOP - 9, si(st.vin, 'V', 3), 'sch-value');
  s.capacitor([xci, TOP], [xci, GND], { label: 'C_in', value: [si(st.cin, 'F', 3), `ESR ${si(st.esrIn, 'Ω', 3)}`] });
  s.wire([[xs, TOP], [118, TOP]]);
  // inductor from the input to the switch node
  s.inductor([118, TOP], [xsw - 14, TOP], { label: 'L', value: [val('l', 'H'), `DCR ${si(st.dcr, 'Ω', 3)}`], tone: tone('l') });
  s.wire([[xsw - 14, TOP], [xsw, TOP]]);
  const ripTone = solved === 'ripplePct' ? 'solved' : d && d.mode !== 'ccm' ? 'hl' : '';
  const xr = 164;
  s.text(xr, TOP + 18, d ? `ΔI_L ${si(d.dIL, 'A', 3)}` : 'ΔI_L —', `sch-label ${ripTone}`.trim());
  s.text(xr, TOP + 32, d ? `r = ${(d.rippleRatio * 100).toFixed(d.rippleRatio < 10 ? 1 : 0)} %` : '', `sch-value ${ripTone}`.trim());
  const pkHl = warn(/near the peak of its gain/);
  const wm = (d as any)?.atVinMin as BoostOutputs | null | undefined;
  const wk = wm && d && wm.iPk >= d.iPk ? wm : undefined;
  s.text(xr, TOP + 49, d ? `I_pk ${si((wk ?? d).iPk, 'A', 3)}` : '', `sch-value ${pkHl ? 'hl' : ''}`.trim());
  if (wk) s.text(xr, TOP + 63, 'at V_in,min', 'sch-hint');

  // main switch from the switch node to ground
  s.switch([xsw, GND], [xsw, TOP], { label: 'SW', value: si(st.rSw, 'Ω', 3), body: 36 });

  // rectifier from the switch node to the output
  if (st.rect === 'diode') s.diode([xsw, TOP], [xco - 22, TOP], { kind: 'schottky', label: 'D', value: `V_F ${si(st.vf, 'V', 3)}` });
  else s.switch([xco - 22, TOP], [xsw, TOP], { label: 'SR', value: `R_on ${si(st.rRect, 'Ω', 3)}` });
  s.wire([[xco - 22, TOP], [xl, TOP]]);

  // output: C_out, V_out and the load
  const coutHl = warn(/^Cout = .* impractically/);
  s.capacitor([xco, TOP], [xco, GND], { label: 'C_out', value: [val('cout', 'F'), `ESR ${si(st.esr, 'Ω', 3)}`], tone: tone('cout') || (coutHl ? 'hl' : '') });
  s.text(xl, TOP - 26, 'V_out', 'sch-label').text(xl, TOP - 13, si(st.vout, 'V', 3), 'sch-value');
  s.resistor([xl, TOP], [xl, GND], { label: 'I_out', value: si(st.iout, 'A', 3), tone: 'muted' });

  s.wire([[xs, GND], [xl, GND]]);
  for (const x of [xci, xsw, xco]) s.dot(x, TOP).dot(x, GND);
  s.wire([[140, GND], [140, GND + 8]]).ground(140, GND + 8);
  return s.svg();
}
