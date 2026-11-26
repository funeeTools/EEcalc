/** Voltage-regulator dropout — page module: definition + theory + circuit with a headroom stack. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type DropState, def } from './def';
import type { Source } from './model';
import { theory } from './theory';

const W = 460;
const H = 270;

/** Spread label baselines so neighbours are at least `gap` apart (keeps the order, stays in [lo, hi]). */
function spread(ys: number[], gap: number, lo: number, hi: number): number[] {
  const idx = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
  const out = idx.map(([y]) => Math.min(Math.max(y, lo), hi));
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
  const over = out[out.length - 1] - hi;
  if (over > 0) for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], (i === out.length - 1 ? hi : out[i + 1] - gap));
  const res = new Array<number>(ys.length);
  idx.forEach(([, i], k) => (res[i] = out[k]));
  return res;
}

export function circuit(s: DropState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as { src: Source; vdoI: number; vReq: number; margin: number } | undefined) : undefined;
  const sch = new Schematic(W, H);
  const solved = s.solveFor;
  const num = (k: 'vout' | 'iout' | 'vin' | 'vEnd') => {
    if (solved !== k) return s[k];
    const v = r.results.find((x) => x.key === k)?.value;
    return r.ok && typeof v === 'number' ? v : NaN;
  };
  const dropout = d != null && d.margin < 0;
  const tone = (k: string, hl = false) => (solved === k ? 'solved' : hl ? 'hl' : '');
  const fV = (v: number) => (Number.isFinite(v) ? si(v, 'V', 3) : '—');
  const fA = (v: number) => (Number.isFinite(v) ? si(v, 'A', 3) : '—');
  const top = 80;
  const bot = 206;
  const xs = 50;
  const bx = 108;
  const bw = 100;
  const by = 64; // pins near the top edge, label and value below them
  const bh = 62;
  const xl = 268;

  // source: battery stack or DC supply
  const srcTone = tone(s.source === 'dc' ? 'vin' : 'vEnd', dropout);
  if (s.source === 'battery') {
    const yc = (top + bot) / 2;
    sch.wire([[xs, top], [xs, yc - 13]], srcTone).wire([[xs, yc + 13], [xs, bot]], srcTone);
    sch.shape('path', { d: `M ${xs - 14} ${yc - 13} L ${xs + 14} ${yc - 13} M ${xs - 14} ${yc + 3} L ${xs + 14} ${yc + 3}`, class: 'sch-body', fill: 'none' });
    sch.shape('path', { d: `M ${xs - 7} ${yc - 5} L ${xs + 7} ${yc - 5} M ${xs - 7} ${yc + 13} L ${xs + 7} ${yc + 13}`, class: 'sch-plate', fill: 'none' });
    sch.text(xs - 18, yc - 16, '+', 'sch-sign', 'middle');
    sch.text(xs, top - 37, `${s.cells} cell${s.cells > 1 ? 's' : ''}`, `sch-label ${srcTone}`.trim());
    sch.text(xs, top - 21, `end ${fV(num('vEnd'))}`, `sch-value ${srcTone}`.trim());
  } else {
    sch.source(xs, top, bot, { kind: s.ripple > 0 ? 'ac' : 'dc', tone: srcTone });
    sch.text(xs, top - 37, `V_in ${fV(num('vin'))}`, `sch-label ${srcTone}`.trim());
    sch.text(xs, top - 21, `±${+s.vinTol.toPrecision(3)} %${s.ripple > 0 ? `, ${fV(s.ripple)} pp` : ''}`, `sch-value ${srcTone}`.trim());
  }

  // regulator
  const model = s.model === 'rdson' ? `R_DS(on) ${si(s.vdo1 / s.i1, 'Ω', 3)}` : s.model === 'points' ? 'V_DO from 2 pts' : `V_DO ${fV(s.vdo)}`;
  sch.wire([[xs, top], [bx, top]]);
  sch.block(bx, by, bw, bh, { label: s.model === 'fixed' ? 'REG' : 'LDO', value: model, tone: dropout ? 'hl' : '' });
  sch.pin(bx, top, 'IN', 'left').pin(bx + bw, top, 'OUT', 'right').pin(bx + bw / 2, by + bh, 'GND', 'bottom');
  if (d) sch.text(bx + bw / 2, by - 10, `V_DO ${fV(d.vdoI)} at ${fA(num('iout'))}`, `sch-hint ${dropout ? 'hl' : ''}`.trim());
  sch.wire([[bx + bw / 2, by + bh], [bx + bw / 2, bot]]).dot(bx + bw / 2, bot);

  // output and load
  sch.wire([[bx + bw, top], [xl, top]]);
  sch.text((bx + bw + xl) / 2 + 4, top - 10, `V_out ${fV(num('vout'))}`, `sch-label ${tone('vout', dropout)}`.trim());
  sch.resistor([xl, top], [xl, bot], { label: 'I_out', value: fA(num('iout')), tone: tone('iout') || 'muted', flip: true });
  sch.wire([[xs, bot], [xl, bot]]);
  sch.wire([[bx + bw / 2, bot], [bx + bw / 2, bot + 8]]).ground(bx + bw / 2, bot + 8);

  // headroom stack: 0 → V_out → V_out + V_DO, against the input range
  if (d) {
    const x0 = 314;
    const bwid = 24;
    const yb = 238;
    const yt = 34;
    const vTop = Math.max(d.src.vMax, d.vReq, d.src.vMin) * 1.06;
    const Y = (v: number) => yb - (Math.max(v, 0) / vTop) * (yb - yt);
    const vout = num('vout');
    const rect = (a: number, b: number, cls: string) => {
      const y1 = Y(Math.max(a, b));
      const y2 = Y(Math.min(a, b));
      if (y2 - y1 > 0.3) sch.shape('rect', { x: x0, y: y1, width: bwid, height: y2 - y1, class: cls });
    };
    rect(0, vout, 'xs-cool');
    rect(vout, d.vReq, 'xs-hot');
    rect(d.src.vMin, d.vReq, d.margin >= 0 ? 'sch-fill-solved' : 'sch-fill-hl');
    sch.shape('rect', { x: x0 - 4, y: Y(d.src.vMax), width: bwid + 8, height: Math.max(Y(d.src.vMin) - Y(d.src.vMax), 0.5), class: 'xs-air' });
    sch.shape('rect', { x: x0, y: Y(Math.max(d.vReq, d.src.vMin, vout)), width: bwid, height: yb - Y(Math.max(d.vReq, d.src.vMin, vout)), class: 'sch-body', fill: 'none' });
    const marks: [number, string, string][] = [
      [vout, `V_out ${fV(vout)}`, ''],
      [d.vReq, `+V_DO = ${fV(d.vReq)}`, dropout ? 'hl' : ''],
      [d.src.vMin, `low ${fV(d.src.vMin)}`, dropout ? 'hl' : solved === 'margin' ? 'solved' : ''],
    ];
    if (d.src.vMax > d.src.vMin * 1.0001) marks.push([d.src.vMax, `high ${fV(d.src.vMax)}`, '']);
    const ys = spread(marks.map(([v]) => Y(v) + 4), 16, 16, yb + 4);
    marks.forEach(([v, t, c], i) => {
      sch.shape('path', { d: `M ${x0 + bwid} ${Y(v)} L ${x0 + bwid + 6} ${Y(v)} L ${x0 + bwid + 10} ${ys[i] - 4}`, class: 'sch-dim', fill: 'none' });
      sch.text(x0 + bwid + 13, ys[i], t, `sch-value ${c}`.trim(), 'start');
    });
    // bracket the margin (or the shortfall) beside the bar
    if (Math.abs(Y(d.src.vMin) - Y(d.vReq)) > 2) sch.dim([x0 - 8, Y(Math.max(d.src.vMin, d.vReq))], [x0 - 8, Y(Math.min(d.src.vMin, d.vReq))], '', { tone: dropout ? 'hl' : 'solved' });
    sch.text(x0 + bwid / 2, 22, 'headroom', 'sch-hint');
    sch.text(x0 + bwid / 2, yb + 14, `ΔV ${fV(d.margin)}`, `sch-label ${dropout ? 'hl' : solved === 'margin' ? 'solved' : ''}`.trim());
  }
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: DropState, r) => circuit(s, r) },
};

export default mod;
