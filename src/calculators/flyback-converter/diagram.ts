/**
 * Flyback power stage drawing, shared with the RCD Clamp page (which passes its own labels and tones).
 * The transformer is drawn locally (two facing coils, core bars, polarity dots): there is no shared symbol.
 */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { FlybackDetails, FlybackState } from './def';

export interface Lbl {
  label?: string;
  value?: string[];
  tone?: string;
}

export interface FlybackDrawing {
  header: string;
  headerTone?: string;
  vin: string;
  xfmr: string[];
  /** tone of the coils; xfmrTones (per text line) default to it */
  xfmrTone?: string;
  xfmrTones?: string[];
  cClamp: Lbl;
  rClamp: Lbl;
  dClamp: Lbl;
  fet: Lbl;
  dOut: Lbl;
  cOut: Lbl;
  out: string;
}

/**
 * Coupled-inductor transformer between two vertical windings: primary at xP (from yTop to yBot, coils bulging
 * right), secondary at xS (coils bulging left), two core bars between them. Flyback polarity: the primary dot
 * is at the top, the secondary dot at the bottom (the secondary conducts while the switch is off).
 * Candidate for a shared `transformer()` symbol.
 */
export function transformer(s: Schematic, xP: number, xS: number, yTop: number, yBot: number, o: { tone?: string; flyback?: boolean; body?: number } = {}): void {
  const body = o.body ?? 64;
  const tone = o.tone ?? '';
  s.inductor([xP, yTop], [xP, yBot], { body, tone });
  s.inductor([xS, yBot], [xS, yTop], { body, tone });
  const yc = (yTop + yBot) / 2;
  const xm = (xP + xS) / 2;
  for (const dx of [-4, 4]) s.shape('line', { x1: xm + dx, y1: yc - body / 2 - 4, x2: xm + dx, y2: yc + body / 2 + 4, class: `sch-plate ${tone}`.trim() });
  const yd = yc - body / 2 + 3;
  s.shape('circle', { cx: xP - 8, cy: yd, r: 2.8, class: 'sch-headfill' });
  s.shape('circle', { cx: xS + 8, cy: o.flyback === false ? yd : yc + body / 2 - 3, r: 2.8, class: 'sch-headfill' });
}

const W = 460;
const TOP = 76;
const KN = 150; // clamp node
const DRN = 182; // drain node
const GND = 246;
const SG = 184; // secondary return

export function drawFlyback(d: FlybackDrawing): SVGSVGElement {
  const s = new Schematic(W, GND + 22);
  const xs = 26;
  const xc = 112;
  const xr = 150;
  const xd = 131;
  const xP = 232;
  const xS = 276;
  const xdo = 330;
  const xco = 382;
  const xo = 446;

  s.text(W / 2, 18, d.header, `sch-label ${d.headerTone ?? ''}`.trim());
  // input
  s.source(xs, TOP, GND, { kind: 'dc' });
  s.text(xs - 6, TOP - 24, 'V_in', 'sch-label', 'start').text(xs - 6, TOP - 11, d.vin, 'sch-value', 'start');
  s.wire([[xs, TOP], [xP, TOP]]);
  // RCD clamp across the primary
  s.capacitor([xc, TOP], [xc, KN], { ...d.cClamp, flip: true });
  s.resistor([xr, TOP], [xr, KN], d.rClamp);
  s.wire([[xc, KN], [xr, KN]]);
  s.diode([xd, DRN], [xd, KN], d.dClamp);
  s.wire([[xd, DRN], [xP, DRN]]);
  // transformer
  transformer(s, xP, xS, TOP, DRN, { tone: d.xfmrTone });
  d.xfmr.forEach((t, i) => s.text(xP + 26, TOP - 10 - (d.xfmr.length - 1 - i) * 13, t, `${i === 0 ? 'sch-label' : 'sch-value'} ${d.xfmrTones?.[i] ?? d.xfmrTone ?? ''}`.trim(), 'end'));
  // switch
  const q = s.mosfet(xP - 10, DRN + 32, { type: 'n', ...d.fet });
  s.wire([[xP, DRN], q.d]);
  s.wire([q.s, [xP, GND]]);
  s.wire([q.g, [q.g[0] - 14, q.g[1]]]).terminal(q.g[0] - 18, q.g[1]);
  s.text(q.g[0] - 26, q.g[1] + 4, 'PWM', 'sch-hint', 'end');
  s.wire([[xs, GND], [xP, GND]]);
  s.wire([[110, GND], [110, GND + 6]]).ground(110, GND + 6);
  for (const x of [xc, xr]) s.dot(x, TOP);
  s.dot(xd, KN).dot(xd, DRN);
  // secondary
  s.wire([[xS, TOP], [xdo - 22, TOP]]);
  s.diode([xdo - 22, TOP], [xdo + 22, TOP], d.dOut);
  s.wire([[xdo + 22, TOP], [xo, TOP]]);
  s.capacitor([xco, TOP], [xco, SG], { ...d.cOut, flip: true });
  s.wire([[xS, DRN], [xS, SG], [xo, SG]]);
  s.dot(xco, TOP).dot(xco, SG);
  s.terminal(xo, TOP).terminal(xo, SG);
  s.text(xo + 2, TOP - 12, d.out, 'sch-label', 'end');
  s.wire([[300, SG], [300, SG + 6]]).ground(300, SG + 6);
  return s.svg();
}

export function flybackCircuit(st: FlybackState, r: CalcReport): SVGSVGElement {
  const det = r.ok ? (r.details as FlybackDetails | undefined) : undefined;
  const sv = st.solveFor;
  const nS = sv === 'n' || sv === 'krf';
  const lS = sv === 'n' || sv === 'lp';
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));
  const s = det?.state;
  const lo = det?.lo;
  const nTxt = s ? `N ${s.n.toPrecision(4)} : 1` : nS ? 'N —' : `N ${st.n.toPrecision(4)} : 1`;
  const lTxt = s ? `L_p ${si(s.lp, 'H', 3)}` : lS ? 'L_p —' : `L_p ${si(st.lp, 'H', 3)}`;
  const vdsHl = warn(/^Clamped drain peak/);
  const header = lo ? `f_sw ${si(st.fsw, 'Hz', 3)} · D_max ${(lo.d * 100).toFixed(1)} % · ${lo.mode.toUpperCase()} at V_in,min` : `f_sw ${si(st.fsw, 'Hz', 3)}`;
  return drawFlyback({
    header,
    headerTone: warn(/^D_max/) ? 'hl' : !nS ? 'solved' : '',
    vin: `${si(st.vinMin, 'V', 3)}–${si(st.vinMax, 'V', 3)}`,
    xfmr: [nTxt, lTxt, `L_lk ${si(st.llk, 'H', 3)}`],
    xfmrTone: nS || lS ? 'solved' : '',
    xfmrTones: [nS ? 'solved' : '', lS ? 'solved' : '', ''],
    cClamp: { label: 'C_cl', value: det ? [`${si(det.vclamp, 'V', 3)}`] : [] },
    rClamp: { label: 'R_cl', value: det ? [si(det.pClamp, 'W', 3)] : [], tone: warn(/^Clamp dissipation/) ? 'hl' : '' },
    dClamp: { label: 'D_cl' },
    fet: { label: 'Q', value: det ? [`I_pk ${si(det.lo.ipPk, 'A', 3)}`, `V_DS ${si(det.vdsMax, 'V', 3)}`] : [], tone: vdsHl ? 'hl' : '' },
    dOut: { label: 'D_out', value: det ? [`V_R ${si(det.vRect, 'V', 3)}`] : [] },
    cOut: { label: 'C_out', value: [si(st.cout, 'F', 3), det ? `ΔV ${si(det.dvOut, 'V', 3)}` : ''].filter(Boolean) },
    out: `${si(st.vout, 'V', 3)} · ${si(st.iout, 'A', 3)}`,
  });
}
