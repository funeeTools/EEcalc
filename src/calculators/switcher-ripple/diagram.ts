/** Converter with each capacitor drawn as its C + ESR + ESL equivalent, annotated with the ripple (Circuit tab). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { RippleState } from './def';
import type { Ripple } from './model';

const W = 460;
const TOP = 70;
const GND = 246;

type Side = 'Out' | 'In';

export function rippleCircuit(st: RippleState, r: CalcReport): SVGSVGElement {
  const det = r.ok ? (r.details as { out: Ripple; in: Ripple; state: RippleState } | undefined) : undefined;
  const s0 = det?.state ?? st; // solved values come from the report
  const sch = new Schematic(W, GND + 42);
  const solvedTone = (k: string) => (st.solveFor === k ? 'solved' : '');
  const noAnswer = !!r.status && r.status.tone === 'fail';
  const v = (k: 'cOut' | 'cIn' | 'esrOut' | 'esrIn', unit: string) => (st.solveFor === k && (noAnswer || !det) ? '—' : si(s0[k], unit, 3));

  // one capacitor bank: C, ESR and ESL in series from the rail to ground, labels on the right (or left)
  const bank = (x: number, side: Side, flip = false) => {
    const sub = side === 'Out' ? 'out' : 'in';
    const n = side === 'Out' ? st.nOut : st.nIn;
    const k = side === 'Out' ? st.biasOut : st.biasIn;
    const y1 = TOP + 58;
    const y2 = TOP + 118;
    sch.capacitor([x, TOP], [x, y1], { label: `C_${sub}`, value: `${n > 1 ? `${n} × ` : ''}${v(`c${side}`, 'F')}${k < 100 ? ` · ${k.toFixed(0)} %` : ''}`, tone: solvedTone(`c${side}`), flip });
    sch.resistor([x, y1], [x, y2], { label: 'ESR', value: v(`esr${side}`, 'Ω'), tone: solvedTone(`esr${side}`), body: 30, flip });
    sch.inductor([x, y2], [x, GND], { label: 'ESL', value: si(side === 'Out' ? st.eslOut : st.eslIn, 'H', 3), body: 30, flip });
    // the ripple across the bank
    const rp = det ? (side === 'Out' ? det.out : det.in) : undefined;
    const target = (side === 'Out' ? ['cOut', 'esrOut'] : ['cIn', 'esrIn']).includes(st.solveFor);
    const txt = rp ? `ΔV_${sub} ${si(rp.pp, 'V', 3)}` : `ΔV_${sub} —`;
    sch.text(x, GND + 20, txt, `sch-label ${target ? '' : 'solved'}`.trim());
    if (rp) {
      const parts = `C ${si(rp.ppC, 'V', 3)} · ESR ${si(rp.ppEsr, 'V', 3)} · ESL ${si(rp.ppEsl, 'V', 3)}`;
      if (side === 'In') sch.text(8, GND + 35, parts, 'sch-hint', 'start');
      else sch.text(W - 8, GND + 35, parts, 'sch-hint', 'end');
    }
  };

  const xs = 26;
  const xci = 78;
  const xco = 336;
  const xl = 394;
  sch.source(xs, TOP, GND, { kind: 'dc' });
  sch.text(xs, TOP - 22, 'V_in', 'sch-label').text(xs, TOP - 9, si(st.vin, 'V', 3), 'sch-value');
  bank(xci, 'In');
  const outName = st.topo === 'buckboost' ? '−V_out' : 'V_out';
  const lVal = si(st.l, 'H', 3);

  if (st.topo === 'buck') {
    const xsw = 214;
    sch.wire([[xs, TOP], [128, TOP]]);
    sch.switch([180, TOP], [128, TOP], { label: 'S' });
    sch.wire([[180, TOP], [xsw, TOP]]);
    sch.diode([xsw, GND], [xsw, TOP], { kind: 'schottky', label: 'D' });
    sch.inductor([xsw, TOP], [292, TOP], { label: 'L', value: lVal });
    sch.wire([[292, TOP], [xl, TOP]]);
    sch.dot(xsw, TOP).dot(xsw, GND);
  } else if (st.topo === 'boost') {
    const xsw = 214;
    sch.wire([[xs, TOP], [118, TOP]]);
    sch.inductor([118, TOP], [196, TOP], { label: 'L', value: lVal });
    sch.wire([[196, TOP], [xsw, TOP]]);
    sch.switch([xsw, GND], [xsw, TOP], { label: 'S', body: 36 });
    sch.diode([xsw, TOP], [296, TOP], { kind: 'schottky', label: 'D' });
    sch.wire([[296, TOP], [xl, TOP]]);
    sch.dot(xsw, TOP).dot(xsw, GND);
  } else {
    const xsw = 206;
    sch.wire([[xs, TOP], [124, TOP]]);
    sch.switch([176, TOP], [124, TOP], { label: 'S' });
    sch.wire([[176, TOP], [xsw, TOP]]);
    sch.inductor([xsw, TOP], [xsw, GND], { label: 'L', value: lVal, flip: true });
    // anode at the negative output, cathode at the switch node
    sch.diode([292, TOP], [xsw, TOP], { kind: 'schottky', label: 'D' });
    sch.wire([[292, TOP], [xl, TOP]]);
    sch.dot(xsw, TOP).dot(xsw, GND);
  }
  bank(xco, 'Out', true); // labels on the left, clear of the load
  sch.text(xl, TOP - 22, outName, 'sch-label').text(xl, TOP - 9, si(st.vout, 'V', 3), 'sch-value');
  sch.resistor([xl, TOP], [xl, GND], { label: 'I_out', value: si(st.iout, 'A', 3), tone: 'muted', flip: false });
  sch.wire([[xs, GND], [xl, GND]]);
  for (const x of [xci, xco]) sch.dot(x, TOP).dot(x, GND);
  sch.wire([[150, GND], [150, GND + 8]]).ground(150, GND + 8);
  return sch.svg();
}
