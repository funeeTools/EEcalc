/** Current Shunt — page module: definition + theory + a Circuit tab (high- or low-side shunt with sense amplifier and ADC). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type ShuntState } from './def';
import { theory } from './theory';

function circuit(st: ShuntState, r: CalcReport): SVGSVGElement {
  const solved = (r.ok ? (r.details as { solved?: Partial<ShuntState> } | undefined)?.solved : undefined) ?? {};
  const val = <K extends keyof ShuntState>(k: K): ShuntState[K] => ((solved as any)[k] ?? st[k]) as ShuntState[K];
  const pMax = r.results.find((x) => x.key === 'pMax')?.value;
  const over = typeof pMax === 'number' && pMax > st.pRated;
  const s = new Schematic(440, 262);
  const xs = 40;
  const top = 50;
  const bot = 210;
  const xl = 410;
  const ax = 215;
  const ay = 130;
  const high = st.side === 'high';
  const rTone = st.solveFor === 'r' ? 'solved' : over ? 'hl' : '';
  const rText = r.ok || st.solveFor !== 'r' ? si(val('r'), 'Ω', 3) : '—';
  // two-line labels drawn by hand with 16 px leading (the default 13 px lets 12 px text boxes touch)
  const two = (x: number, y: number, a: string, b: string | undefined, tone = '', anchor: 'start' | 'middle' | 'end' = 'middle') => {
    s.text(x, y, a, `sch-label ${tone}`.trim(), anchor);
    if (b) s.text(x, y + 16, b, `sch-value ${tone}`.trim(), anchor);
  };

  s.source(xs, top, bot, { kind: 'dc', tone: 'muted' });
  two(xs + 24, (top + bot) / 2 - 2, high ? 'V_bus' : 'V', high ? si(st.vbus, 'V', 3) : undefined, 'muted', 'start');
  // load on the right
  s.resistor([xl, top], [xl, bot], { flip: true, tone: 'muted' });
  s.text(xl - 18, (top + bot) / 2 - 2, 'Load', 'sch-label muted', 'end');
  const iTone = st.solveFor === 'iMax' ? 'solved' : '';
  s.text(xl - 18, (top + bot) / 2 + 14, `I_max ${r.ok || st.solveFor !== 'iMax' ? si(val('iMax'), 'A', 3) : '—'}`, `sch-value ${iTone}`.trim(), 'end');

  let plus: [number, number];
  let minus: [number, number];
  if (high) {
    s.wire([[xs, top], [120, top]]);
    s.resistor([120, top], [200, top], { tone: rTone });
    two(160, top - 29, 'R_sh', rText, rTone);
    s.wire([[200, top], [xl, top]]);
    s.wire([[xs, bot], [xl, bot]]);
    s.ground(250, bot + 4);
    plus = [120, top];
    minus = [200, top];
    s.arrow([300, top - 10], [350, top - 10]);
    s.text(325, top - 17, `I ${si(val('iMeas'), 'A', 3)}`, `sch-label ${st.measForm === 'code' ? 'solved' : ''}`.trim());
  } else {
    s.wire([[xs, top], [xl, top]]);
    s.wire([[xl, bot], [200, bot]]);
    s.resistor([200, bot], [120, bot], { tone: rTone });
    two(160, bot + 24, 'R_sh', rText, rTone);
    s.wire([[120, bot], [xs, bot]]);
    s.ground(70, bot + 4);
    plus = [200, bot];
    minus = [120, bot];
    s.arrow([350, bot + 10], [300, bot + 10]);
    s.text(325, bot + 25, `I ${si(val('iMeas'), 'A', 3)}`, `sch-label ${st.measForm === 'code' ? 'solved' : ''}`.trim());
  }
  s.dot(plus[0], plus[1]).dot(minus[0], minus[1]);

  // sense amplifier
  const gTone = st.solveFor === 'gain' ? 'solved' : '';
  const amp = s.amp(ax, ay, { size: 54, opamp: true, tone: gTone, label: `G ${r.ok || st.solveFor !== 'gain' ? val('g').toPrecision(3) : '—'}` });
  if (high) {
    s.wire([plus, [plus[0], amp.inP[1]], amp.inP]);
    s.wire([minus, [minus[0], top + 30], [165, top + 30], [165, amp.inN[1]], amp.inN]);
  } else {
    s.wire([plus, [plus[0], bot - 18], [165, bot - 18], [165, amp.inP[1]], amp.inP]);
    s.wire([minus, [minus[0], amp.inN[1]], amp.inN]);
  }
  // ADC
  // ADC: kept clear of the right-aligned “I_max …” label beside the load (≈ 70 px for “I_max 1.23 kA”)
  const adcX = 256;
  const adcW = 64;
  s.wire([amp.out, [adcX, ay]]);
  s.block(adcX, ay - 22, adcW, 44, { label: 'ADC', value: `${Math.round(st.bits)} bit` });
  s.text(adcX + adcW / 2, ay + 36, `V_FS ${si(st.vfs, 'V', 3)}`, 'sch-hint');
  if (r.ok) {
    const code = r.results.find((x) => x.key === 'codeInt')?.value;
    if (typeof code === 'number') s.text(adcX + adcW / 2, ay - 30, `code ${code}`, `sch-value ${st.measForm === 'code' ? '' : 'solved'}`.trim());
  }
  return s.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: ShuntState, r) => circuit(s, r) },
};

export default mod;
