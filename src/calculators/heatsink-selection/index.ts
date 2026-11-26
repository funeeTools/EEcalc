/** Heatsink Selection — page module: definition + theory + a Diagram (thermal chain with the heatsink block and its fin cross-section). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type HeatsinkSelState } from './def';
import { theory } from './theory';

const cw = (x: number) => `${Math.abs(x) >= 1000 ? Math.round(x) : x.toPrecision(3)} °C/W`;
const degC = (t: number) => `${t.toFixed(0)} °C`;

function diagram(st: HeatsinkSelState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as { tSink: number; tCase: number; theta: number; req: number; solved: { len: number; p: number; tj: number; n: number } } | undefined) : undefined;
  const p = d?.solved.p ?? st.p;
  const len = d?.solved.len ?? st.len;
  const n = Math.max(2, Math.round(d?.solved.n ?? st.n));
  const tj = d?.solved.tj ?? st.tj;
  const fails = d != null && d.req > 0 && d.theta > d.req * (1 + 1e-9);
  const s = new Schematic(440, 300);

  // ── thermal chain (left to right)
  const y = 62;
  const pTone = st.solveFor === 'p' ? 'solved' : '';
  s.block(8, y - 18, 58, 36, { label: 'P', value: r.ok || st.solveFor !== 'p' ? si(p, 'W', 3) : '—', tone: pTone });
  s.wire([[66, y], [84, y]]);
  const nodes: [number, string, string, string][] = [
    [84, 'T_J', r.ok || st.solveFor !== 'tj' ? degC(tj) : '—', st.solveFor === 'tj' ? (r.status?.text === 'TOO HOT' ? 'hl' : 'solved') : ''],
    [172, 'T_C', d ? degC(d.tCase) : '—', ''],
    [260, 'T_S', d ? degC(d.tSink) : '—', ''],
    [400, 'T_A', degC(st.ta), 'muted'],
  ];
  // labels by hand with 16 px leading (subscripted symbols make 13 px boxes touch)
  const two = (x: number, yy: number, a: string, b: string | undefined, tone = '') => {
    s.text(x, yy, a, `sch-label ${tone}`.trim());
    if (b) s.text(x, yy + 16, b, `sch-value ${tone}`.trim());
  };
  s.resistor([84, y], [172, y], { body: 32 });
  two(128, y - 30, 'θ_JC', cw(st.thetaJC));
  s.resistor([172, y], [260, y], { body: 32 });
  two(216, y - 30, 'θ_CS', cw(st.thetaCS));
  // heatsink block: θSA (the part this page designs)
  const hsTone = fails ? 'hl' : 'solved';
  s.box(282, y - 34, 108, 82, 'heatsink', hsTone);
  s.resistor([260, y], [400, y], { tone: hsTone, body: 32 });
  two(330, y + 24, d ? `θ_SA ${cw(d.theta)}` : 'θ_SA', d && d.req > 0 ? `need ≤ ${cw(d.req)}` : undefined, hsTone);
  for (const [x, name, t, tone] of nodes) {
    s.dot(x, y, tone === 'muted' ? 'muted' : '');
    s.text(x, y - 46, name, `sch-label ${tone}`.trim());
    s.text(x, y - 30, t, `sch-value ${tone}`.trim());
  }
  s.wire([[400, y], [400, y + 18]]).ground(400, y + 22);

  // ── cross-section of the fins (looking along the air flow), roughly to scale
  const x0 = 80;
  const wPx = 260;
  const yBase = 252;
  const sc = wPx / st.w;
  const hPx = Math.min(Math.max(st.h * sc, 24), 110);
  const tbPx = Math.min(Math.max(st.tb * sc, 4), 18);
  const finPx = Math.max(st.t * sc, 1.2);
  const gap = n > 1 ? (wPx - n * finPx) / (n - 1) : 0;
  s.shape('rect', { x: x0, y: yBase - tbPx, width: wPx, height: tbPx, class: `xs-cu ${fails ? 'sch-fill-hl' : ''}`.trim() });
  if (gap > 0) for (let i = 0; i < n; i++) s.shape('rect', { x: x0 + i * (finPx + gap), y: yBase - tbPx - hPx, width: finPx, height: hPx, class: 'xs-cu' });
  s.dim([x0, yBase + 12], [x0 + wPx, yBase + 12], `W ${si(st.w, 'm', 3)} · ${n} fins${st.nMode === 'opt' ? ' (best)' : ''}`, { off: -14 });
  s.dim([x0 + wPx + 14, yBase - tbPx - hPx], [x0 + wPx + 14, yBase - tbPx], `H ${si(st.h, 'm', 3)}`, { off: -8, anchor: 'start' });
  const lTone = st.solveFor === 'len' ? 'solved' : '';
  s.text(x0 - 8, yBase - tbPx - hPx / 2, `L ${r.ok || st.solveFor !== 'len' ? si(len, 'm', 3) : '—'}`, `sch-label ${lTone}`.trim(), 'end');
  s.text(x0 - 8, yBase - tbPx - hPx / 2 + 13, 'into page', 'sch-hint', 'end');
  s.text(x0 + wPx / 2, yBase - tbPx - hPx - 10, st.mode === 'natural' ? 'air rises along L (fins vertical)' : `air ${st.v} m/s along L`, 'sch-hint');
  return s.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: HeatsinkSelState, r) => diagram(s, r) },
};

export default mod;
