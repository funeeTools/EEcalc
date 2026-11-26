/** 555 Timer — live circuit drawing (astable with optional R_B diode, or monostable). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { TimerState } from './def';

const W = 460;
const H = 322;
// timing column, VCC rail, ground rail
const XC = 110;
const YV = 30;
const YG = 295;
// 555 block and its pins
const BX = 240;
const BY = 70;
const BW = 100;
const BH = 170;
const Y_DIS = 105;
const Y_THR = 170;
const Y_TRIG = 210;
const Y_OUT = 110;
const X_P1 = 265; // VCC (top) / GND (bottom)
const X_P2 = 315; // RST (top) / CV (bottom)
const X_BUS = 205;

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function timerCircuit(st: TimerState, r: CalcReport): SVGSVGElement {
  // Solved values live in details.state; when the inputs fail, draw the typed state and '?' for the unknown.
  const s: TimerState = (r.ok && (r.details?.state as TimerState)) || st;
  const astable = s.mode === 'astable';
  const solve = s.solveFor;
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));
  const fmt = (v: number, unit: string, solved: boolean) => (solved && !r.ok) || !ok(v) ? '?' : si(v, unit, 3);
  const tone = (solved: boolean, hl: boolean) => (hl ? 'hl' : solved ? 'solved' : '');
  const chargeHl = warn(/^Charging resistance/);

  const sch = new Schematic(W, H);

  // ── 555 block with its eight pins
  sch.block(BX, BY, BW, BH, { label: s.device === 'NE555' ? 'NE555' : s.device });
  sch.pin(BX, Y_DIS, 'DIS 7', 'left').pin(BX, Y_THR, 'THR 6', 'left').pin(BX, Y_TRIG, 'TRIG 2', 'left');
  sch.pin(BX + BW, Y_OUT, 'OUT 3', 'right');
  sch.pin(X_P1, BY, 'VCC 8', 'top').pin(X_P2, BY, 'RST 4', 'top');
  sch.pin(X_P1, BY + BH, 'GND 1', 'bottom').pin(X_P2, BY + BH, 'CV 5', 'bottom');

  // ── supply rail: VCC and RST tied to V_CC
  sch.wire([[60, YV], [X_P2, YV], [X_P2, BY]]).wire([[X_P1, YV], [X_P1, BY]]);
  sch.dot(XC, YV).dot(X_P1, YV);
  sch.terminal(60, YV);
  sch.text(60, YV - 10, `V_CC ${fmt(s.vcc, 'V', false)}`, `sch-label ${warn(/^V_CC =/) ? 'hl' : ''}`.trim());

  // ── timing network
  const raSolved = solve === 'ra';
  const cSolved = solve === 'c';
  const raTone = tone(raSolved, warn(/^R_A =/) || chargeHl);
  const cTone = tone(cSolved, warn(/^C =/));
  if (astable) {
    const yN = 190; // THR/TRIG node
    sch.resistor([XC, YV], [XC, Y_DIS], { label: 'R_A', value: fmt(s.ra, 'Ω', raSolved), tone: raTone, flip: true });
    sch.resistor([XC, Y_DIS], [XC, yN], { label: 'R_B', value: fmt(s.rb, 'Ω', raSolved), tone: tone(raSolved, chargeHl && !s.diode), flip: true });
    sch.capacitor([XC, yN], [XC, YG], { label: 'C', value: fmt(s.c, 'F', cSolved), tone: cTone, flip: true });
    sch.wire([[XC, Y_DIS], [BX, Y_DIS]]).dot(XC, Y_DIS);
    sch.wire([[XC, yN], [X_BUS, yN]]).dot(XC, yN).dot(X_BUS, yN);
    sch.wire([[BX, Y_THR], [X_BUS, Y_THR], [X_BUS, Y_TRIG], [BX, Y_TRIG]]);
    if (s.diode) {
      const xd = 185;
      sch.diode([xd, Y_DIS], [xd, yN], { value: ok(s.vf) ? si(s.vf, 'V', 3) : '', flip: true });
      sch.dot(xd, Y_DIS).dot(xd, yN);
    }
  } else {
    const yN = 140; // DIS/THR node
    sch.resistor([XC, YV], [XC, yN], { label: 'R_A', value: fmt(s.ra, 'Ω', raSolved), tone: raTone, flip: true });
    sch.capacitor([XC, yN], [XC, YG], { label: 'C', value: fmt(s.c, 'F', cSolved), tone: cTone, flip: true });
    sch.wire([[XC, yN], [X_BUS, yN]]).dot(XC, yN).dot(X_BUS, yN);
    sch.wire([[BX, Y_DIS], [X_BUS, Y_DIS], [X_BUS, Y_THR], [BX, Y_THR]]);
    // trigger input (active-low pulse)
    sch.wire([[180, Y_TRIG], [BX, Y_TRIG]]).terminal(180, Y_TRIG);
    sch.text(180, Y_TRIG + 20, 'trigger', 'sch-hint');
  }

  // ── ground rail
  sch.wire([[XC, YG], [X_P2, YG]]).wire([[X_P1, BY + BH], [X_P1, YG]]).dot(X_P1, YG);
  sch.wire([[190, YG], [190, YG + 8]]).ground(190, YG + 8);

  // ── CONT pin straight down to ground: decoupling cap, or the external control voltage
  if (s.vcv == null) {
    sch.capacitor([X_P2, BY + BH], [X_P2, YG], { value: '10 nF', tone: 'muted' });
  } else {
    const t = warn(/^V_CV =/) ? 'hl' : '';
    const yc = (BY + BH + YG) / 2;
    sch.source(X_P2, BY + BH, YG, { kind: 'dc', tone: t });
    sch.text(X_P2 + 25, yc - 2, 'V_CV', `sch-label ${t}`.trim(), 'start');
    sch.text(X_P2 + 25, yc + 11, ok(s.vcv) ? si(s.vcv, 'V', 3) : '?', `sch-value ${t}`.trim(), 'start');
  }

  // ── output with the timing it produces
  const xo = 412;
  sch.wire([[BX + BW, Y_OUT], [xo, Y_OUT]]).terminal(xo, Y_OUT);
  sch.text(xo + 8, Y_OUT + 4, 'OUT', 'sch-label', 'start');
  if (astable) {
    // f and D are answers in the analysis solve (D also when solving C), inputs otherwise
    const f = r.ok ? (r.details?.f as number) : solve === 'f' ? NaN : s.f;
    const d = r.ok ? (r.details?.duty as number) : solve === 'f' || solve === 'c' ? NaN : s.duty / 100;
    const fTone = tone(solve === 'f', warn(/^f = /));
    const dTone = tone(solve === 'f' || solve === 'c', false);
    sch.text(BX + BW + 10, Y_OUT + 22, `f ${ok(f) ? si(f, 'Hz', 3) : '?'}`, `sch-value ${fTone}`.trim(), 'start');
    sch.text(BX + BW + 10, Y_OUT + 36, `D ${ok(d) ? `${(d * 100).toFixed(1)} %` : '?'}`, `sch-value ${dTone}`.trim(), 'start');
  } else {
    const tw = r.ok || solve !== 'tw' ? s.tw : NaN;
    sch.text(BX + BW + 10, Y_OUT + 22, `t_w ${ok(tw) ? si(tw, 's', 3) : '?'}`, `sch-value ${tone(solve === 'tw', warn(/^t_w = /))}`.trim(), 'start');
  }
  return sch.svg();
}
