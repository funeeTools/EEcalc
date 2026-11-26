/** Three-phase page drawing: the Y or Δ load (left) and its phasor diagram (right). */

import type { CalcReport } from '@/core/calc/types';
import { type Pt, Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { TpState } from './def';
import { type Balanced, type Unbalanced, SQ3, thetaOf } from './model';

const W = 460;
const H = 252;
const YA = 60;
const YB = 125;
const YC = 190;
const CX = 334;
const CY = 124;
const RV = 70;

export function tpDiagram(st: TpState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as { balanced: Balanced; state: { vl: number; il: number; pf: number }; unbalanced: Unbalanced | null } | undefined) : undefined;
  const b = d?.balanced;
  const s = new Schematic(W, H);
  const sv = st.solveFor;
  const vl = d ? d.state.vl : st.vl;
  const il = d ? d.state.il : st.il;
  const theta = b ? b.theta : thetaOf(st.pf, st.side);
  const ub = d?.unbalanced ?? null;
  const val = (key: 'vl' | 'il', v: number, unit: string) => (sv === key && !d ? '—' : si(v, unit, 3));
  const tone = (k: string) => (sv === k ? 'solved' : '');
  const zText = b ? `${si(b.z, 'Ω', 3)} ∠${((theta * 180) / Math.PI).toFixed(1).replace('-', '−')}°` : '';

  // ── load
  for (const [y, n] of [[YA, 'A'], [YB, 'B'], [YC, 'C']] as const) s.text(14, y + 4, n, 'sch-label', 'middle');
  if (st.conn === 'wye') {
    for (const y of [YA, YB, YC]) s.wire([[24, y], [66, y]]).resistor([66, y], [126, y], y === YA ? { label: 'Z_ph', value: zText, flip: true } : {}).wire([[126, y], [156, y]]);
    s.wire([[156, YA], [156, YC]]).dot(156, YB);
    if (ub) {
      s.wire([[156, YC], [156, 230], [24, 230]]);
      s.text(14, 234, 'N', 'sch-label', 'middle');
      s.arrow([130, 230], [92, 230], { tone: 'hl' });
      s.text(112, 244, `I_N ${si(ub.inMag, 'A', 3)}`, 'sch-label hl', 'middle');
    } else s.text(164, YB + 4, 'N', 'sch-hint', 'start');
  } else {
    const a: Pt = [120, YA];
    const bb: Pt = [120, YC];
    const c: Pt = [52, YB];
    s.wire([[24, YA], a]).wire([[24, YC], bb]).wire([[24, YB], c]);
    s.resistor(a, bb, { label: 'Z_ph', value: zText });
    s.resistor(bb, c).resistor(c, a);
    s.dot(a[0], a[1]).dot(bb[0], bb[1]).dot(c[0], c[1]);
  }
  // line current and voltages
  s.arrow([28, YA - 8], [58, YA - 8], { tone: tone('il') });
  s.text(24, YA - 16, `I_L ${val('il', il, 'A')}`, `sch-label ${tone('il')}`.trim(), 'start');
  const vx = st.conn === 'wye' ? 30 : 24;
  const vy = st.conn === 'wye' ? YB + 28 : YC + 26;
  s.text(vx, vy, `V_L ${val('vl', vl, 'V')}`, `sch-label ${tone('vl')}`.trim(), 'start');
  if (b) {
    s.text(vx, vy + 15, `V_ph ${si(b.vph, 'V', 3)}`, 'sch-value', 'start');
    s.text(vx, vy + 29, `I_ph ${si(b.iph, 'A', 3)}`, 'sch-value', 'start');
  }

  // ── phasors (V and I on separate scales)
  const deg = (x: number) => (x * Math.PI) / 180;
  const tip = (ang: number, len: number): Pt => [CX + len * Math.cos(ang), CY - len * Math.sin(ang)];
  // Greedy label placement (review 2026-11-26): each label tries spots beyond the tip, beside the tip,
  // beside the middle of its arrow and further out, and takes the first whose estimated box is free.
  type Box = { x: number; y: number; w: number; h: number };
  const placed: Box[] = [];
  const anchor = (a: number): 'start' | 'end' | 'middle' => (Math.cos(a) > 0.35 ? 'start' : Math.cos(a) < -0.35 ? 'end' : 'middle');
  const boxOf = (x: number, y: number, label: string, an: 'start' | 'end' | 'middle'): Box => {
    const w = 7 * label.replace(/_/g, '').length + 2;
    return { x: an === 'start' ? x : an === 'end' ? x - w : x - w / 2, y: y - 10, w, h: 15 };
  };
  const free = (b: Box) => !placed.some((p) => b.x < p.x + p.w && p.x < b.x + b.w && b.y < p.y + p.h && p.y < b.y + b.h);
  const put = (cands: [number, number, 'start' | 'end' | 'middle'][], label: string, cls: string) => {
    const pick = cands.find(([x, y, an]) => free(boxOf(x, y, label, an))) ?? cands[0];
    s.text(pick[0], pick[1], label, `${cls} sch-halo`, pick[2]);
    placed.push(boxOf(pick[0], pick[1], label, pick[2]));
  };
  const around = (ang: number, r: number): [number, number, 'start' | 'end' | 'middle'][] => {
    const c: [number, number, 'start' | 'end' | 'middle'][] = [];
    const [x0, y0] = tip(ang, r + 13);
    c.push([x0, y0 + 4, anchor(ang)]);
    for (const f of [1, 0.55])
      for (const sd of [1, -1]) {
        const pa = ang + sd * (Math.PI / 2);
        const [mx, my] = tip(ang, f * r);
        c.push([mx + 14 * Math.cos(pa), my - 14 * Math.sin(pa) + 4, anchor(pa)]);
      }
    const [x2, y2] = tip(ang, r + 28);
    c.push([x2, y2 + 4, anchor(ang)]);
    return c;
  };
  const vec = (ang: number, len: number, label: string, cls: string, aTone = '', dashed = false) => {
    if (len < 2) return;
    s.arrow([CX, CY], tip(ang, len), { tone: aTone, dashed });
    if (label) put(around(ang, len), label, cls);
  };
  s.dot(CX, CY);
  const vTone = sv === 'vl' ? 'solved' : 'muted';
  const iTone = sv === 'il' ? 'solved' : '';
  if (ub) {
    // unbalanced: phase voltages for reference, the three line currents to scale and their sum I_N
    const imax = Math.max(st.ia, st.ib, st.ic, ub.inMag, 1e-30);
    ['V_an', 'V_bn', 'V_cn'].forEach((n, k) => vec(deg(-120 * k), RV, n, 'sch-hint', 'muted'));
    const cur: [number, number, string][] = [[st.ia, st.aDeg, 'I_a'], [st.ib, st.bDeg, 'I_b'], [st.ic, st.cDeg, 'I_c']];
    for (const [m, a, n] of cur) vec(deg(a), (0.72 * RV * m) / imax, n, 'sch-label');
    if (ub.inMag > 1e-9 * imax) vec(deg(ub.inDeg), (0.72 * RV * ub.inMag) / imax, 'I_N', 'sch-label hl', 'hl');
    s.text(W - 6, H - 6, 'currents to scale; V for reference', 'sch-hint', 'end');
    return s.svg();
  }
  if (st.conn === 'wye') {
    ['V_an', 'V_bn', 'V_cn'].forEach((n, k) => vec(deg(-120 * k), RV, n, `sch-label ${sv === 'vl' ? 'solved' : ''}`.trim(), vTone));
    arc(s, 0, -theta, sv === 'pf', put);
    ['I_a', 'I_b', 'I_c'].forEach((n, k) => vec(deg(-120 * k) - theta, 0.6 * RV, n, `sch-label ${iTone}`.trim(), iTone));
  } else {
    // line voltages lead the phase-to-neutral reference by 30°; phase currents lag them by θ; line current I_a = √3·I_ab∠−30°
    ['V_ab', 'V_bc', 'V_ca'].forEach((n, k) => vec(deg(30 - 120 * k), RV, n, `sch-label ${sv === 'vl' ? 'solved' : ''}`.trim(), vTone));
    arc(s, deg(30), deg(30) - theta, sv === 'pf', put);
    ['I_ab', 'I_bc', 'I_ca'].forEach((n, k) => vec(deg(30 - 120 * k) - theta, 0.55 * RV, n, 'sch-value', ''));
    vec(-theta, 0.55 * SQ3 * RV, 'I_a', `sch-label ${iTone}`.trim(), iTone, true);
  }
  s.text(W - 6, H - 6, 'V and I on separate scales', 'sch-hint', 'end');
  return s.svg();
}

/** Arc for the load angle θ between a voltage and its current, with the label. */
function arc(s: Schematic, a0: number, a1: number, solved: boolean, put: (c: [number, number, 'start' | 'end' | 'middle'][], label: string, cls: string) => void) {
  const dth = a1 - a0;
  if (Math.abs(dth) < (4 * Math.PI) / 180) return;
  const rr = 20;
  const p = (a: number): Pt => [CX + rr * Math.cos(a), CY - rr * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const sweep = dth < 0 ? 1 : 0;
  s.shape('path', { d: `M ${x0} ${y0} A ${rr} ${rr} 0 0 ${sweep} ${x1} ${y1}`, class: `sch-dim ${solved ? 'solved' : ''}`.trim(), fill: 'none' }, 'back');
  // label just outside the arc, registered first so the current labels step aside from it (review 2026-11-26)
  const txt = `θ ${((-dth * 180) / Math.PI).toFixed(1).replace('-', '−')}°`;
  const sg = Math.sign(dth);
  const cands: [number, number, 'start' | 'end' | 'middle'][] = [];
  for (const [a, r] of [[a0 - sg * 0.21, 30], [a1 + sg * 0.21, 30], [(a0 + a1) / 2, 30], [a0 - sg * 0.21, 46], [a1 + sg * 0.21, 46]] as const) {
    cands.push([CX + r * Math.cos(a), CY - r * Math.sin(a) + 4, Math.cos(a) >= 0 ? 'start' : 'end']);
  }
  put(cands, txt, `sch-value ${solved ? 'solved' : ''}`.trim());
}
