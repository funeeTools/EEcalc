/** Power-factor page drawing: the shunt-correction circuit (left) and the power triangle before/after (right). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { PfState } from './def';
import type { Correction, Load } from './model';

interface Details {
  load: Load;
  correction: Correction;
  cUnity: number;
  conn: 'delta' | 'wye';
}

const W = 460;
const H = 258;
const TOP = 74;
const BOT = 190;

export function pfDiagram(st: PfState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as Details | undefined) : undefined;
  const o = d?.correction;
  const s = new Schematic(W, H);
  const three = st.phase === 'three';
  const cTone = st.solveFor === 'c' ? 'solved' : o && o.after.side === 'lead' && o.qc > 0 ? 'hl' : '';

  // ── circuit: source, line current, capacitor bank, load
  const xs = 30;
  const xc = 112;
  const xl = 176;
  s.source(xs, TOP, BOT, { kind: 'ac', tone: 'muted' });
  s.text(8, TOP - 24, `${three ? 'V_L' : 'V'} ${si(st.v, 'V', 3)}`, 'sch-label', 'start').text(8, TOP - 9, si(st.f, 'Hz', 3), 'sch-value', 'start');
  s.wire([[xs, TOP], [xl, TOP], [xl, TOP + 26]]).wire([[xl, BOT - 26], [xl, BOT], [xs, BOT]]);
  s.block(xl - 24, TOP + 26, 48, BOT - TOP - 52, { label: 'Load', value: d ? si(d.load.p, 'W', 3) : undefined });
  const cVal = r.ok ? si(st.c, 'F', 3) : st.solveFor === 'c' ? '—' : si(st.c, 'F', 3);
  s.capacitor([xc, TOP], [xc, BOT], { label: three ? `C ×3 ${d?.conn === 'wye' ? 'Y' : 'Δ'}` : 'C', value: cVal, tone: cTone, flip: true });
  s.dot(xc, TOP).dot(xc, BOT);
  if (three) s.text(xs, BOT + 34, '3-phase balanced, one line shown', 'sch-hint', 'start');
  // line current before → after
  if (o) {
    s.arrow([48, TOP + 12], [86, TOP + 12]);
    s.text(67, TOP + 27, `I ${si(o.before.i, 'A', 3)}`, 'sch-value', 'middle');
    s.text(67, TOP + 40, `→ ${si(o.after.i, 'A', 3)}`, `sch-value ${st.solveFor === 'pfTarget' ? 'solved' : ''}`.trim(), 'middle');
    s.text(xl, BOT + 16, `θ_1 ${((o.before.theta * 180) / Math.PI).toFixed(1).replace('-', '−')}°`, 'sch-hint', 'middle');
  }

  // ── power triangle (P right, +Q lagging up), before and after correction
  if (!o) {
    s.text(330, H / 2, 'no solution', 'sch-hint', 'middle');
    return s.svg();
  }
  const p = o.before.p;
  const q1 = o.before.q1;
  const q2 = o.after.q1;
  const qTop = Math.max(0, q1, q2);
  const qBot = Math.min(0, q1, q2);
  const boxW = 124;
  const boxH = 146;
  const k = Math.min(boxW / p, boxH / Math.max(qTop - qBot, 1e-30 * p));
  const px = Math.max(40, p * k);
  const scaled = px > p * k + 0.5;
  const x0 = 232;
  const y0 = 34 + qTop * k;
  const yq1 = y0 - q1 * k;
  const yq2 = y0 - q2 * k;
  const x1 = x0 + px;
  s.arrow([x0, y0], [x1, y0]);
  s.text((x0 + x1) / 2, y0 + (qBot < 0 && q2 < 0 ? -6 : 15), `P ${si(p, 'W', 3)}`, 'sch-label', 'middle');
  if (Math.abs(yq1 - y0) > 3) s.arrow([x1, y0], [x1, yq1]);
  s.wire([[x0, y0], [x1, yq1]]);
  const tAfter = st.solveFor === 'pfTarget' ? 'solved' : o.after.side === 'lead' && o.qc > 0 ? 'hl' : '';
  s.wire([[x0, y0], [x1 + 0, yq2]], tAfter || 'muted');
  if (o.qc > 0 && Math.abs(yq2 - yq1) > 3) s.arrow([x1 + 12, yq1], [x1 + 12, yq2], { tone: cTone });
  // labels: Q₁ and Q_C to the right, S₁ above its hypotenuse, S₁' near its end
  // Q₁ beside its tip, Q_C beside the tip of its arrow, kept at least 15 px apart
  const right = x1 + 20;
  const yL1 = yq1 + 4;
  let yLc = yq2 + 4;
  if (Math.abs(yLc - yL1) < 15) yLc = yL1 + (yq2 >= yq1 ? 15 : -15);
  s.text(right, yL1, `Q_1 ${si(q1, 'var', 3)}`, 'sch-label', 'start');
  if (o.qc > 0) s.text(right, yLc, `Q_C ${si(o.qc, 'var', 3)}`, `sch-label ${cTone}`.trim(), 'start');
  const mid1 = [(x0 + x1) / 2, (y0 + yq1) / 2] as const;
  // S₁ on its hypotenuse only when the triangle is roomy; a flat or narrow one would push it onto P or the circuit
  if (Math.abs(yq1 - y0) >= 30 && px >= 100) s.text(mid1[0] - 8, mid1[1] + (q1 < 0 ? 16 : -6), `S_1 ${si(o.before.s1, 'VA', 3)}`, 'sch-label sch-halo', 'end');
  s.text(x0 - 6, 34 + boxH + 30, `PF ${o.before.pfd.toFixed(3)} → ${o.after.pfd.toFixed(3)}${o.after.side === 'lead' ? ' lead' : ''}`, `sch-label ${tAfter}`.trim(), 'start');
  const hint = [scaled ? 'P stretched to be visible' : '', o.before.thd > 0 ? `true PF ${o.before.pf.toFixed(3)} → ${o.after.pf.toFixed(3)} (THD)` : ''].filter(Boolean).join(' · ');
  s.text(x0 - 6, 34 + boxH + 44, `S_1 ${si(o.before.s1, 'VA', 3)} → ${si(o.after.s1, 'VA', 3)}`, 'sch-value', 'start');
  if (hint) s.text(x0 - 6, 34 + boxH + 58, hint, 'sch-hint', 'start');
  return s.svg();
}
