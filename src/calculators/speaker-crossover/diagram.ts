/** Speaker crossover — the two passive branches as built: amp → low-pass → woofer, amp → high-pass (→ L-pad) → tweeter. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic, type Pt } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { CrossoverState } from './def';
import { PROTOS, lPad, sectionParts, type Part, type Polarity } from './model';

const W = 460;
const BUS = 60; // vertical feed from the amplifier
const SPAN = 76; // series element length
const DROP = 70; // shunt element length (rail → ground)
const YW = 64; // woofer rail
const YT = 200; // tweeter rail

export function crossoverCircuit(st: CrossoverState, r: CalcReport): SVGSVGElement | null {
  const proto = PROTOS[st.type];
  if (!proto) return null;
  const d = r.ok ? (r.details as { lp?: Part[]; hp?: Part[]; polarity?: Polarity } | undefined) : undefined;
  let lp = d?.lp;
  let hp = d?.hp;
  if (!lp || !hp) {
    if (!(st.fc > 0 && st.rW > 0 && st.rT > 0)) return null;
    lp = sectionParts(st.type, 'lp', st.fc, st.rW);
    hp = sectionParts(st.type, 'hp', st.fc, st.rT);
  }
  const polarity: Polarity = d?.polarity ?? (st.polarity === 'auto' ? proto.polarity : st.polarity);
  const wrong = polarity !== proto.polarity && !proto.eitherPolarity;
  const digits = st.eseries === 'ideal' ? 4 : 3;
  const s = new Schematic(W, YT + DROP + 30);

  // amplifier and the feed bus
  const ay = 118;
  s.source(24, ay, ay + 52, { kind: 'ac' });
  s.ground(24, ay + 52);
  s.text(24, ay + 76, 'amp', 'sch-hint');
  s.wire([[24, ay], [BUS, ay]]).wire([[BUS, YW], [BUS, YT]]).dot(BUS, ay);

  // room after the last element: a shunt's labels sit right of it, so the speaker cone must clear them
  let lastShunt = false;
  const gap = () => (lastShunt ? 96 : 56);
  /** One ladder branch on rail y; returns the x where it ends. */
  const branch = (parts: Part[], y: number, tone = ''): number => {
    lastShunt = false;
    let x = BUS;
    for (const p of parts) {
      const o = { label: p.ref, value: si(p.value, p.kind === 'L' ? 'H' : 'F', digits), tone };
      if (p.position === 'series') {
        const a: Pt = [x, y];
        const b: Pt = [x + SPAN, y];
        if (p.kind === 'L') s.inductor(a, b, o);
        else s.capacitor(a, b, o);
        x += SPAN;
      } else {
        const a: Pt = [x, y];
        const b: Pt = [x, y + DROP];
        if (p.kind === 'L') s.inductor(a, b, o);
        else s.capacitor(a, b, o);
        s.dot(x, y).ground(x, y + DROP);
      }
      lastShunt = p.position === 'shunt';
    }
    return x;
  };
  /** Speaker from rail y to ground at x, with its + / − terminals (swapped when inverted). */
  const driver = (x: number, y: number, label: string, value: string, inverted: boolean, tone = '') => {
    s.speaker([x, y], [x, y + DROP], { label, value, tone });
    s.ground(x, y + DROP);
    s.text(x + 7, y + 14, inverted ? '−' : '+', `sch-sign ${tone}`.trim(), 'start');
    s.text(x + 7, y + DROP - 4, inverted ? '+' : '−', `sch-sign ${tone}`.trim(), 'start');
  };

  // ── woofer: low-pass
  s.text(BUS + 8, YW - 44, `Woofer · low-pass, ${proto.order}${['st', 'nd', 'rd', 'th'][proto.order - 1]} order`, 'sch-caption', 'start');
  let xe = branch(lp, YW);
  const xw = Math.max(xe + gap(), 300);
  s.wire([[xe, YW], [xw, YW]]);
  driver(xw, YW, 'R_W', si(st.rW, 'Ω', 3), false);

  // ── tweeter: high-pass, optional L-pad
  const tTone = wrong ? 'hl' : '';
  const polText = wrong ? ` · ${polarity === 'inverted' ? 'inverted' : 'normal'}: should be ${proto.polarity}` : polarity === 'inverted' ? ' · inverted (+/− swapped)' : '';
  s.text(BUS + 8, YT - 44, `Tweeter · high-pass${polText}`, `sch-caption ${tTone}`.trim(), 'start');
  xe = branch(hp, YT);
  if (st.padDb > 0) {
    const pad = lPad(st.rT, st.padDb);
    s.resistor([xe, YT], [xe + SPAN, YT], { label: 'R_s', value: si(pad.rs, 'Ω', 3) });
    xe += SPAN;
    lastShunt = false;
    if (Number.isFinite(pad.rp)) {
      lastShunt = true;
      s.resistor([xe, YT], [xe, YT + DROP], { label: 'R_p', value: si(pad.rp, 'Ω', 3) });
      s.dot(xe, YT).ground(xe, YT + DROP);
    }
    s.text(xe - SPAN / 2 + 10, YT + DROP + 22, `L-pad −${+st.padDb.toFixed(2)} dB`, 'sch-hint');
  }
  const xt = Math.max(xe + gap(), 300);
  s.wire([[xe, YT], [xt, YT]]);
  driver(xt, YT, 'R_T', si(st.rT, 'Ω', 3), polarity === 'inverted', tTone);
  return s.svg();
}
