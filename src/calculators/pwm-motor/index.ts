/** PWM Motor — page module: definition + theory + a Circuit tab (low-side switch or H-bridge driving R–L–E). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { RPM } from '../dc-motor-speed/model';
import { def, type PwmMotorState } from './def';
import { theory } from './theory';

function circuit(st: PwmMotorState, r: CalcReport): SVGSVGElement {
  const det = r.ok ? (r.details as { e: number; rHot: number; solved: { duty: number; tL: number; n: number } } | undefined) : undefined;
  const duty = det?.solved.duty ?? st.duty;
  const n = det?.solved.n ?? st.n;
  const tL = det?.solved.tL ?? st.tL;
  const stalled = r.status?.text === 'STALLED';
  const dTone = st.solveFor === 'duty' ? 'solved' : '';
  const nTone = st.solveFor === 'n' ? (stalled ? 'hl' : 'solved') : '';
  const tTone = st.solveFor === 'tL' ? 'solved' : '';
  const dText = r.ok || st.solveFor !== 'duty' ? `${duty.toPrecision(3)} %` : '—';
  const nText = r.ok || st.solveFor !== 'n' ? `${(n / RPM).toFixed(0)} rpm` : '—';
  const tText = r.ok || st.solveFor !== 'tL' ? si(tL, 'N·m', 3) : '—';
  const rHot = det?.rHot ?? st.r;
  const lTot = st.l + (st.lx || 0);
  const iAvg = r.results.find((x) => x.key === 'iAvg')?.value;

  const s = new Schematic(440, 292);
  const xs = 40;
  const top = 46;
  const bot = 262;
  // two-line labels by hand with 16 px leading (subscripts make the default 13 px boxes touch)
  const two = (x: number, y: number, a: string, b: string, tone = '', anchor: 'start' | 'middle' | 'end' = 'start') => {
    s.text(x, y, a, `sch-label ${tone}`.trim(), anchor);
    s.text(x, y + 16, b, `sch-value ${tone}`.trim(), anchor);
  };
  s.source(xs, top, bot, { kind: 'dc', tone: 'muted' });
  two(xs + 24, (top + bot) / 2 - 4, 'V_s', si(st.vs, 'V', 3), 'muted');

  if (st.drive === 'lowside') {
    const xm = 300;
    s.wire([[xs, top], [xm, top]]);
    // motor model R – L – E in a dashed box
    s.box(xm - 58, top + 10, 186, 164, 'motor');
    s.resistor([xm, top], [xm, top + 60], { label: 'R', value: si(rHot, 'Ω', 3) });
    s.inductor([xm, top + 60], [xm, top + 112], { label: 'L', value: si(lTot, 'H', 3) });
    s.circleSym([xm, top + 112], [xm, top + 168], 'M', { label: 'E = Kω', value: det ? si(det.e, 'V', 3) : '—' });
    // freewheel diode across the motor (cathode at the supply)
    const xd = 200;
    s.diode([xd, top + 190], [xd, top], { kind: 'schottky' });
    two(xd - 18, top + 92, 'D_F', si(st.vd, 'V', 3), '', 'end');
    s.wire([[xm, top + 168], [xm, top + 190], [xd, top + 190]]).dot(xd, top).dot(xm, top + 190);
    // low-side switch
    s.switch([xm, top + 190], [xm, bot], { label: 'S', value: [`D ${dText}`, si(st.f, 'Hz', 3)], tone: dTone });
    s.wire([[xs, bot], [xm, bot]]);
    s.ground(120, bot + 4);
    s.arrow([96, top - 10], [150, top - 10]);
    s.text(123, top - 17, `Ī ${typeof iAvg === 'number' ? si(iAvg, 'A', 3) : '—'}`, 'sch-label');
  } else {
    // H-bridge: legs at xa / xb, motor across the midpoints
    const xa = 140;
    const xb = 380;
    const ym = (top + bot) / 2;
    s.wire([[xs, top], [xb, top]]).wire([[xs, bot], [xb, bot]]).dot(xa, top).dot(xa, bot);
    const anti = st.drive === 'antiphase';
    const pwm = [`D ${dText}`];
    s.switch([xa, top], [xa, ym - 26], { label: 'S₁', value: pwm, tone: dTone });
    s.switch([xa, ym + 26], [xa, bot], { label: 'S₂', value: anti ? '1 − D' : '(1 − D)', tone: '' });
    s.switch([xb, top], [xb, ym - 26], { label: 'S₃', value: anti ? '1 − D' : 'off', flip: true });
    s.switch([xb, ym + 26], [xb, bot], { label: 'S₄', value: anti ? pwm : 'on', flip: true, tone: anti ? dTone : '' });
    s.wire([[xa, ym - 26], [xa, ym + 26]]).wire([[xb, ym - 26], [xb, ym + 26]]).dot(xa, ym).dot(xb, ym);
    s.box(xa + 14, ym - 52, xb - xa - 28, 78, 'motor');
    s.resistor([xa, ym], [xa + 80, ym], { label: 'R', value: si(rHot, 'Ω', 3), body: 30 });
    s.inductor([xa + 80, ym], [xa + 150, ym], { label: 'L', value: si(lTot, 'H', 3), body: 30 });
    s.circleSym([xa + 150, ym], [xb, ym], 'M', { label: det ? `E ${si(det.e, 'V', 3)}` : 'E', flip: true });
    s.ground(90, bot + 4);
    s.text((xa + xb) / 2, bot - 12, anti ? 'S₁S₄ on for D, S₂S₃ for 1 − D' : 'S₄ on; S₁ / S₂ complementary', 'sch-hint');
    s.text((xa + xb) / 2, top + 20, `f_PWM ${si(st.f, 'Hz', 3)} · Ī ${typeof iAvg === 'number' ? si(iAvg, 'A', 3) : '—'}`, 'sch-hint');
  }
  // shaft: speed and load
  s.text(420, 22, `n ${nText}`, `sch-label ${nTone}`.trim(), 'end');
  s.text(420, 284, `T_L ${tText}`, `sch-label ${tTone}`.trim(), 'end');
  return s.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: PwmMotorState, r) => circuit(s, r) },
};

export default mod;
