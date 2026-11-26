/** Current Mirror — page module: def + theory + a schematic for each topology, drawn as a sink or (flipped) a source. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { type Pt, Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type MirrorState, def } from './def';
import { theory } from './theory';

const W = 460;
const H = 300;
const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function circuit(st: MirrorState, r: CalcReport): SVGSVGElement {
  const s: MirrorState = (r.ok && (r.details?.state as MirrorState)) || st;
  const src = s.polarity === 'source';
  const Y = (y: number) => (src ? H - y : y);
  const P = (x: number, y: number): Pt => [x, Y(y)];
  const sch = new Schematic(W, H);
  const wire = (...pts: [number, number][]) => sch.wire(pts.map(([x, y]) => P(x, y)));
  const dot = (x: number, y: number) => sch.dot(x, Y(y));
  // current arrows point along the current: down through R_ref and into the output for a sink, mirrored for a source
  const arrow = (x: number, y0: number, y1: number, tone = '') => (src ? sch.arrow(P(x, y1), P(x, y0), { tone }) : sch.arrow(P(x, y0), P(x, y1), { tone }));
  const fR = (v: number, solved: boolean) => ((solved && !r.ok) || !ok(v) ? '?' : si(v, 'Ω', 3));
  const fI = (v: number, solved: boolean) => ((solved && !r.ok) || !ok(v) ? '?' : si(v, 'A', 3));
  const sRref = s.solveFor === 'rref' || s.solveFor === 're';
  const sRw = s.solveFor === 're';
  const sIref = s.solveFor === 'iref';
  const sIout = s.solveFor !== 're';
  const bjt = s.topo.startsWith('bjt');
  const npn = src ? 'pnp' : 'npn';
  const part = bjt ? (s.bjtPart === 'q2n3904' ? '2N3904' : s.bjtPart === 'q2n3906' ? '2N3906' : '') : '';
  const fail = r.ok && ((r.details?.headroom as number) ?? 1) < 0;

  const yTop = 30; // supply rail of R_ref and the load (V_CC for a sink)
  const yBot = 272; // emitter / source rail (ground for a sink)
  const xL = 100; // reference column
  const xR = 260; // output column
  sch.wire([P(40, yTop), P(150, yTop)]);
  sch.wire([P(40, yBot), P(300, yBot)]);
  if (src) {
    sch.text(40, Y(yBot) - 8, `V_CC ${si(s.vcc, 'V', 3)}`, 'sch-label', 'start');
    sch.ground(95, Y(yTop));
  } else {
    sch.text(40, yTop - 8, `V_CC ${si(s.vcc, 'V', 3)}`, 'sch-label', 'start');
    sch.ground(180, yBot);
  }
  // reference resistor
  const yA = s.topo === 'mos-cascode' ? 92 : s.topo === 'bjt-wilson' ? 122 : 110;
  sch.resistor(P(xL, yTop), P(xL, yA), { label: 'R_ref', value: fR(s.rref, sRref), tone: sRref ? 'solved' : '' });
  arrow(xL - 22, yTop + 18, yTop + 58, sIref ? 'solved' : '');
  sch.text(xL - 30, Y(yTop + 42) + 4, 'I_ref', `sch-label ${sIref ? 'solved' : ''}`.trim(), 'end');
  sch.text(xL - 30, Y(yTop + 42) + 19, fI(s.iref, sIref), `sch-value ${sIref ? 'solved' : ''}`.trim(), 'end');

  let yOut: number; // top of the output device
  if (s.topo === 'mos-cascode') {
    const m3 = sch.mosfet(xL + 10, Y(122), { type: src ? 'p' : 'n', mirror: true, label: 'M₃' });
    const m1 = sch.mosfet(xL + 10, Y(214), { type: src ? 'p' : 'n', mirror: true, label: 'M₁' });
    const m4 = sch.mosfet(xR - 10, Y(122), { type: src ? 'p' : 'n', label: 'M₄' });
    const m2 = sch.mosfet(xR - 10, Y(214), { type: src ? 'p' : 'n', label: 'M₂', value: s.n !== 1 ? `×${+s.n.toPrecision(3)}` : undefined });
    sch.wire([m3.g, m4.g]).wire([m1.g, m2.g]);
    sch.wire([P(xL, yA), m3.d]);
    sch.wire([m3.s, m1.d]).wire([m4.s, m2.d]);
    wire([xL, 100], [176, 100], [176, 122]);
    dot(xL, 100);
    dot(176, 122);
    wire([xL, 168], [164, 168], [164, 214]);
    dot(xL, 168);
    dot(164, 214);
    wire([xL, 244], [xL, yBot]);
    wire([xR, 244], [xR, yBot]);
    yOut = 92;
  } else if (s.topo === 'bjt-wilson') {
    const q1 = sch.bjt(xL + 10, Y(212), { type: npn, mirror: true, label: 'Q₁', value: part || undefined });
    const q2 = sch.bjt(xR - 10, Y(212), { type: npn, label: 'Q₂' });
    const q3 = sch.bjt(xR - 10, Y(122), { type: npn, label: 'Q₃', value: part || undefined });
    sch.wire([q1.b, q2.b]);
    sch.wire([P(xL, yA), q1.c]).wire([P(xL, yA), q3.b]);
    dot(xL, yA);
    sch.wire([q3.e, q2.c]);
    wire([xR, 167], [190, 167], [190, 212]);
    dot(xR, 167);
    dot(190, 212);
    wire([xL, 242], [xL, yBot]);
    wire([xR, 242], [xR, yBot]);
    yOut = 92;
  } else {
    const mosT = !bjt;
    const yQ = 170;
    const re1 = s.topo === 'bjt-degen' ? si(s.re, 'Ω', 3) : null;
    const re2 = s.topo === 'bjt-degen' ? si(s.re / s.n, 'Ω', 3) : s.topo === 'bjt-widlar' ? fR(s.rw, sRw) : null;
    const n = s.n !== 1 ? `×${+s.n.toPrecision(3)}` : undefined;
    let p1: { c: Pt; e: Pt; b: Pt };
    let p2: { c: Pt; e: Pt; b: Pt };
    if (mosT) {
      const a = sch.mosfet(xL + 10, Y(yQ), { type: src ? 'p' : 'n', mirror: true, label: 'M₁' });
      const b = sch.mosfet(xR - 10, Y(yQ), { type: src ? 'p' : 'n', label: 'M₂', value: n });
      p1 = { c: a.d, e: a.s, b: a.g };
      p2 = { c: b.d, e: b.s, b: b.g };
    } else {
      p1 = sch.bjt(xL + 10, Y(yQ), { type: npn, mirror: true, label: 'Q₁', value: part || undefined });
      p2 = sch.bjt(xR - 10, Y(yQ), { type: npn, label: 'Q₂', value: n });
    }
    sch.wire([p1.b, p2.b]);
    sch.wire([P(xL, yA), p1.c]);
    wire([xL, 124], [180, 124], [180, yQ]);
    dot(xL, 124);
    dot(180, yQ);
    // emitters / sources
    if (re1) sch.resistor(P(xL, 200), P(xL, yBot), { label: 'R_E', value: re1, flip: true });
    else wire([xL, 200], [xL, yBot]);
    if (re2) sch.resistor(P(xR, 200), P(xR, yBot), { label: s.topo === 'bjt-widlar' ? 'R_E' : 'R_E/N', value: re2, tone: s.topo === 'bjt-widlar' && sRw ? 'solved' : '' });
    else wire([xR, 200], [xR, yBot]);
    yOut = 140;
  }
  dot(xL, yBot);
  dot(xR, yBot);
  // output node, load current and voltage
  const yT = 52;
  wire([xR, yOut], [xR, yT]);
  sch.terminal(xR, Y(yT));
  sch.text(xR + 10, Y(yT) + 4, `V_out ${si(s.vout, 'V', 3)}`, `sch-label ${fail ? 'hl' : ''}`.trim(), 'start');
  const toneOut = sIout ? 'solved' : '';
  arrow(xR + 22, yT + 14, yT + 44, toneOut);
  sch.text(xR + 32, Y(yT + 26) + (src ? -6 : 4), 'I_out', `sch-label ${toneOut}`.trim(), 'start');
  sch.text(xR + 32, Y(yT + 26) + (src ? 9 : 19), fI(s.iout, sIout), `sch-value ${toneOut}`.trim(), 'start');
  // compliance and output resistance, right column
  if (r.ok) {
    const lim = r.details?.vMinAbs as number;
    const ro = r.details?.ro as number;
    sch.text(330, Y(src ? 250 : 200), `${src ? 'V_out ≤' : 'V_out ≥'} ${si(lim, 'V', 3)}`, `sch-value ${fail ? 'hl' : ''}`.trim(), 'start');
    sch.text(330, Y(src ? 250 : 200) + 17, `R_out ${ok(ro) ? si(ro, 'Ω', 3) : '∞'}`, 'sch-value', 'start');
  }
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: MirrorState, r) => circuit(s, r) },
};

export default mod;
