/** Audio power amplifier gain — page module: definition + theory + a circuit tab (single-ended or BTL). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type AmpState } from './def';
import { theory } from './theory';

interface Details {
  aHalf: number;
  rgStd: number | null;
  rgExact: number | null;
  rail: number;
  vpk: number;
  ipk: number;
  pAvail: number | null;
}

function circuit(s: AmpState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as unknown as Details) : null;
  const btl = s.topology === 'btl';
  const sch = new Schematic(460, 262);
  const tone = (k: AmpState['solveFor']) => (s.solveFor === k ? 'solved' : '');
  const lab = (t: string) => `sch-label ${t}`.trim();
  const val = (t: string) => (t ? `sch-value ${t}` : 'sch-value');
  const yA = 130; // master amplifier centre line
  const amp = sch.amp(210, yA, { opamp: true, size: 70, tone: tone('gain') });
  const xN = 140; // feedback / − node column
  const yF = 56; // feedback rail
  const xO = 300; // output node

  // input source into the + pin
  const xs = 60;
  sch.source(xs, amp.inP[1], 232, { kind: 'ac', tone: tone('vin') });
  sch.ground(xs, 236);
  sch.wire([[xs, amp.inP[1]], amp.inP]);
  sch.text(xs + 26, 214, 'V_in', lab(tone('vin')), 'start');
  sch.text(xs + 26, 227, `${si(s.vin, 'V', 3)} rms`, val(tone('vin')), 'start');

  // gain network: R_f from the output to the − node, R_g from the − node to ground
  const gTone = tone('gain');
  sch.wire([amp.inN, [xN, amp.inN[1]], [xN, yF]]).dot(xN, yF);
  sch.resistor([xN, yF], [xO, yF], { label: 'R_f', value: si(s.rf, 'Ω', 3), tone: gTone });
  sch.wire([[xO, yF], [xO, yA]]);
  const rgText = d ? (d.rgStd != null ? si(d.rgStd, 'Ω', 3) : 'open') : '—';
  const subUnity = !!d && d.aHalf < 1 - 1e-12;
  sch.resistor([xN, yF], [72, yF], { label: 'R_g', value: rgText, tone: gTone });
  sch.wire([[72, yF], [72, yF + 22]]).ground(72, yF + 26);

  // output to the speaker
  const xL = 386;
  const yBot = 214;
  sch.wire([amp.out, [xL, yA]]).dot(xO, yA);
  const pTone = tone('pout');
  sch.speaker([xL, yA], [xL, yBot], { label: 'R_L', value: [si(s.rl, 'Ω', 3), si(s.pout, 'W', 3)], tone: pTone });

  // gain and rails under the amplifier
  const aText = btl ? `A_v/2 = ${d ? d.aHalf.toPrecision(3) : '—'}` : `A_v = ${d ? d.aHalf.toPrecision(3) : '—'}`;
  const railTone = d && d.pAvail != null && d.pAvail < s.pout * (1 - 1e-9) ? 'hl' : '';
  const rails = d ? (s.supply === 'split' ? `±${si(d.rail, 'V', 3)}` : `V_CC ${si(d.rail, 'V', 3)}`) : '';
  sch.text(212, 196, aText, lab(subUnity ? 'hl' : gTone));
  sch.text(212, 210, rails, val(railTone));
  if (!btl) {
    sch.wire([[xL, yBot], [xL, yBot + 6]]).ground(xL, yBot + 10);
  } else {
    // slave half: unity-gain inverter fed from the master output, driving the speaker's other terminal
    const xS = 262; // tap on the master output
    const slave = sch.amp(306, yBot, { size: 44, inside: '−1' });
    sch.wire([[xS, yA], [xS, yBot], slave.in]).dot(xS, yA);
    sch.wire([slave.out, [xL, yBot]]);
    sch.text(306, yBot + 40, 'slave, gain −1', 'sch-hint');
    sch.text(xL - 12, yA - 8, '+', 'sch-label');
    sch.text(xL - 12, yBot - 8, '−', 'sch-label');
  }
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: AmpState, r) => circuit(s, r) },
};

export default mod;
