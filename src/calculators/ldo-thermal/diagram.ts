/** LDO regulator with its dissipation and the junction-to-ambient thermal path (Circuit tab). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { LdoState } from './def';
import { type LdoOutputs, voutActual } from './model';

const W = 460;
const TOP = 80;
const BOT = 175;
const TY = 252; // thermal row

const degC = (t: number) => `${t.toFixed(1)} °C`;

export function ldoCircuit(st: LdoState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as LdoOutputs | undefined) : undefined;
  const solved = st.solveFor;
  // value shown for an input: the solved number from the report when it is the unknown
  const res = (k: string) => r.results.find((x) => x.key === k);
  const num = (k: 'vin' | 'iout' | 'ta' | 'thetaJA'): number => {
    if (solved !== k) return st[k];
    const v = res(k)?.value;
    return typeof v === 'number' ? v : NaN;
  };
  const show = (k: 'vin' | 'iout' | 'ta' | 'thetaJA', f: (x: number) => string) => (solved === k ? (Number.isFinite(num(k)) ? f(num(k)) : (res(k)?.display ?? '—')) : f(st[k]));
  const vin = num('vin');
  const iout = num('iout');
  const tj = d?.tj ?? NaN;
  const over = d != null && tj > st.tjMax + 1e-9;
  const dropout = Number.isFinite(vin) && st.vdo > 0 && vin - st.vout < st.vdo - 1e-12;
  const overI = Number.isFinite(iout) && st.iRated > 0 && iout > st.iRated * (1 + 1e-12);
  const tone = (k: string, hl = false) => (solved === k ? 'solved' : hl ? 'hl' : '');

  const s = new Schematic(W, 296);
  s.text(W / 2, 24, 'P_D = (V_in − V_out)·I_out + V_in·I_GND', 'sch-hint');

  // input source
  const xs = 40;
  const vinTone = tone('vin', dropout);
  s.source(xs, TOP, BOT, { kind: 'dc', tone: vinTone });
  s.text(xs, TOP - 28, 'V_in', `sch-label ${vinTone}`.trim()).text(xs, TOP - 15, show('vin', (v) => si(v, 'V', 3)), `sch-value ${vinTone}`.trim());

  // regulator block
  const bx = 150;
  const bw = 120;
  const by = 58;
  const bh = 70;
  const xg = bx + bw / 2;
  s.wire([[xs, TOP], [bx, TOP]]);
  s.block(bx, by, bw, bh, { label: 'LDO', value: `P_D ${d ? si(d.pd, 'W', 3) : '—'}`, tone: over ? 'hl' : '' });
  s.pin(bx, TOP, 'IN', 'left').pin(bx + bw, TOP, 'OUT', 'right').pin(xg, by + bh, 'GND', 'bottom');

  // output and load
  const xo = 320;
  const xl = 390;
  s.wire([[bx + bw, TOP], [xl, TOP]]);
  s.text(xo, TOP - 12, `V_out ${si(st.vout, 'V', 3)}`, `sch-label ${dropout ? 'hl' : ''}`.trim());
  if (dropout && Number.isFinite(vin)) s.text(xo, TOP + 18, `dropout → ${si(voutActual({ vin, vout: st.vout, iout: 0, ignd: 0, thetaJA: 1, ta: 0, vdo: st.vdo }), 'V', 3)}`, 'sch-value hl');
  s.resistor([xl, TOP], [xl, BOT], { label: 'I_out', value: show('iout', (v) => si(v, 'A', 3)), tone: tone('iout', overI) || 'muted' });

  // ground pin and its current
  s.wire([[xg, by + bh], [xg, BOT]]);
  s.arrow([xg + 12, by + bh + 8], [xg + 12, BOT - 8]);
  s.text(xg + 20, (by + bh + BOT) / 2 + 4, `I_GND ${si(st.ignd, 'A', 3)}`, 'sch-value', 'start');
  s.wire([[xs, BOT], [xl, BOT]]).dot(xg, BOT);
  s.wire([[xg, BOT], [xg, BOT + 8]]).ground(xg, BOT + 8);

  // thermal path: P_D flows from the junction through θJA to the ambient
  s.box(12, 198, W - 24, 90, 'Thermal path');
  s.text(W - 20, 210, `T_J,max ${st.tjMax.toFixed(0)} °C`, 'sch-hint', 'end');
  const xj = 110;
  const xa = 300;
  s.arrow([40, TY], [xj - 4, TY], { tone: over ? 'hl' : '' });
  s.text((40 + xj) / 2, TY - 10, d ? `P_D ${si(d.pd, 'W', 3)}` : 'P_D', `sch-value ${over ? 'hl' : ''}`.trim());
  s.resistor([xj, TY], [xa, TY], { label: 'θ_JA', value: show('thetaJA', (v) => `${v.toPrecision(3)} °C/W`), tone: tone('thetaJA') });
  s.dot(xj, TY);
  const tjTone = tone('tj', over);
  // in solve modes T_J is the target the user designs to
  const tjText = solved === 'tj' ? (d ? degC(tj) : '—') : degC(st.tj);
  s.text(xj, TY + 20, `T_J ${tjText}`, `sch-label ${tjTone}`.trim());
  s.terminal(xa, TY);
  s.text(xa, TY + 20, `T_A ${show('ta', (v) => `${v.toFixed(1)} °C`)}`, `sch-label ${tone('ta')}`.trim());
  s.text(xa + 12, TY + 4, 'ambient', 'sch-hint', 'start');
  return s.svg();
}
