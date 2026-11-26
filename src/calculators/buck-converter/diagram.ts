/** Buck power stage, annotated with the live values (Circuit tab). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { BuckState } from './def';
import type { BuckInputs, BuckOutputs } from './model';

type Details = BuckOutputs & { inputs: BuckInputs };

const W = 460;
const TOP = 96;
const GND = 236;

export function buckCircuit(st: BuckState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as Details | undefined) : undefined;
  const inp = d?.inputs;
  const solved = st.solveFor;
  const tone = (k: string) => (solved === k ? 'solved' : '');
  // the solved unknown comes from the report; '—' when it could not be solved
  const val = (k: 'l' | 'fsw' | 'cout', unit: string) => (solved === k ? (inp ? si(inp[k], unit, 3) : '—') : si(st[k], unit, 3));
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));

  const s = new Schematic(W, GND + 30);
  const xs = 30; // V_in
  const xci = 76; // C_in
  const xsw = 184; // switch node
  const xco = 292; // C_out
  const xl = 396; // load

  // switching frequency and duty cycle across the top
  const dutyHl = warn(/^Duty cycle|^On-time/);
  s.text(W / 2 - 10, 22, `f_sw ${val('fsw', 'Hz')}`, `sch-label ${tone('fsw') || (dutyHl ? 'hl' : '')}`.trim(), 'end');
  const mode = d ? (d.mode === 'ccm' ? 'CCM' : d.mode === 'dcm' ? 'DCM' : 'CCM, I_L < 0') : '';
  s.text(W / 2 + 10, 22, d ? `D ${(d.d * 100).toFixed(1)} % · ${mode}` : 'D —', `sch-label ${dutyHl || (d && d.mode !== 'ccm') ? 'hl' : ''}`.trim(), 'start');

  // input: source and C_in
  s.source(xs, TOP, GND, { kind: 'dc' });
  s.text(xs, TOP - 22, 'V_in', 'sch-label').text(xs, TOP - 9, si(st.vin, 'V', 3), 'sch-value');
  s.capacitor([xci, TOP], [xci, GND], { label: 'C_in', value: [si(st.cin, 'F', 3), `ESR ${si(st.esrIn, 'Ω', 3)}`] });
  s.wire([[xs, TOP], [112, TOP]]).wire([[168, TOP], [xsw, TOP]]);
  // high-side switch (drawn right to left so the blade swings away from its labels)
  s.switch([168, TOP], [112, TOP], { label: 'HS', value: `R_on ${si(st.rHs, 'Ω', 3)}` });

  // low-side switch or diode (anode at ground, cathode at the switch node)
  if (st.rect === 'diode') s.diode([xsw, GND], [xsw, TOP], { kind: 'schottky', label: 'D', value: `V_F ${si(st.vf, 'V', 3)}` });
  else s.switch([xsw, GND], [xsw, TOP], { label: 'LS', value: `R_on ${si(st.rLs, 'Ω', 3)}`, body: 36 });
  s.text(xsw - 6, TOP + 16, 'SW', 'sch-hint', 'end');

  // inductor and its ripple
  s.inductor([xsw, TOP], [276, TOP], { label: 'L', value: [val('l', 'H'), `DCR ${si(st.dcr, 'Ω', 3)}`], tone: tone('l') });
  s.wire([[276, TOP], [xl, TOP]]);
  const ripTone = solved === 'ripplePct' ? 'solved' : d && d.mode !== 'ccm' ? 'hl' : '';
  const xr = (xsw + xco) / 2 + 4;
  s.text(xr, TOP + 18, d ? `ΔI_L ${si(d.dIL, 'A', 3)}` : 'ΔI_L —', `sch-label ${ripTone}`.trim());
  s.text(xr, TOP + 31, d ? `r = ${(d.rippleRatio * 100).toFixed(d.rippleRatio < 10 ? 1 : 0)} %` : '', `sch-value ${ripTone}`.trim());

  // output: C_out, V_out and the load
  const coutHl = warn(/^Cout = .* impractically/);
  s.capacitor([xco, TOP], [xco, GND], { label: 'C_out', value: [val('cout', 'F'), `ESR ${si(st.esr, 'Ω', 3)}`], tone: tone('cout') || (coutHl ? 'hl' : '') });
  s.text((xco + xl) / 2 + 4, TOP - 10, `V_out ${si(st.vout, 'V', 3)}`, 'sch-label');
  s.resistor([xl, TOP], [xl, GND], { label: 'I_out', value: si(st.iout, 'A', 3), tone: 'muted' });

  // return rail
  s.wire([[xs, GND], [xl, GND]]);
  for (const x of [xci, xsw, xco]) s.dot(x, TOP).dot(x, GND);
  s.wire([[130, GND], [130, GND + 8]]).ground(130, GND + 8);
  return s.svg();
}
