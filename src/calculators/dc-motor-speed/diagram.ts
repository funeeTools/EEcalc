/** DC motor equivalent circuit (supply, armature R, back-EMF) with the shaft and load (Circuit tab). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { MotorState } from './def';
import { RPM, windingResistance, type OperatingPoint } from './model';

const W = 460;
const TOP = 84;
const BOT = 204;

const rpm = (w: number) => `${(w / RPM).toFixed(Math.abs(w / RPM) < 100 ? 2 : 0)} rpm`;

export function motorCircuit(st: MotorState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as (OperatingPoint & { k: number; rHot: number }) | undefined) : undefined;
  const solved = st.solveFor;
  const res = (k: string) => r.results.find((x) => x.key === k);
  const solvedText = (k: string, f: (v: number) => string) => {
    const it = res(k);
    return typeof it?.value === 'number' ? f(it.value) : (it?.display ?? '—');
  };
  const tone = (k: string, hl = false) => (solved === k ? 'solved' : hl ? 'hl' : '');
  const stalled = r.status?.text === 'STALLED';
  const overI = d != null && st.iMax != null && st.iMax > 0 && Math.abs(d.current) > st.iMax;
  const rHot = d?.rHot ?? windingResistance(st.r, st.tW);

  const s = new Schematic(W, BOT + 30);
  const xs = 40;
  const xm = 280;

  // supply
  const vTone = tone('v');
  s.source(xs, TOP, BOT, { kind: 'dc', tone: vTone });
  s.text(xs, TOP - 28, 'V', `sch-label ${vTone}`.trim()).text(xs, TOP - 15, solved === 'v' ? solvedText('v', (v) => si(v, 'V', 4)) : si(st.v, 'V', 3), `sch-value ${vTone}`.trim());

  // armature resistance at the winding temperature
  s.resistor([xs, TOP], [160, TOP], { label: 'R', value: st.tW !== 25 ? [si(rHot, 'Ω', 3), `at ${st.tW} °C`] : si(rHot, 'Ω', 3) });

  // armature current
  const iTone = overI ? 'hl' : '';
  s.wire([[160, TOP], [xm, TOP]]);
  s.arrow([186, TOP - 10], [232, TOP - 10], { tone: iTone });
  s.text(209, TOP - 18, d ? `I ${si(d.current, 'A', 3)}` : 'I —', `sch-label ${iTone}`.trim());
  s.text(209, TOP + 18, `I₀ ${si(st.i0, 'A', 3)} no-load`, 'sch-hint');

  // back-EMF inside the motor symbol (labels to the left, the shaft leaves to the right)
  s.circleSym([xm, TOP], [xm, BOT], 'M', { label: 'E = K·ω', value: d ? si(d.k * d.speed, 'V', 3) : '—', flip: true });
  s.wire([[xs, BOT], [xm, BOT]]).dot(160, BOT);
  s.wire([[160, BOT], [160, BOT + 8]]).ground(160, BOT + 8);

  // shaft, rotation and load torque
  const yc = (TOP + BOT) / 2;
  const xl = 372;
  s.shape('rect', { x: xm + 15, y: yc - 4, width: xl - xm - 15, height: 8, class: 'sch-block' });
  const nTone = tone('n', stalled);
  s.shape('path', { d: `M 318 ${yc - 12} Q 332 ${yc - 26} 346 ${yc - 12}`, class: `sch-arrow ${nTone}`.trim(), fill: 'none' });
  s.arrow([342, yc - 16], [347, yc - 11], { head: 6, tone: nTone });
  const nText = solved === 'n' ? (d ? rpm(d.speed) : '—') : rpm(st.n);
  s.text(332, yc - 32, `n ${nText}`, `sch-label ${nTone}`.trim());
  const tlTone = tone('tL');
  const tlText = solved === 'tL' ? solvedText('tL', (v) => si(v, 'N·m', 3)) : si(st.tL, 'N·m', 3);
  s.block(xl, yc - 26, 76, 52, { label: 'T_L', value: tlText, tone: tlTone });
  if (stalled) s.text(332, yc + 30, 'stalled', 'sch-value hl');
  return s.svg();
}
