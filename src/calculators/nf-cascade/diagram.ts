/** Cascaded noise figure — block diagram of the signal chain with per-stage and cumulative G / NF. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic, svgEl, type Pt } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { cascade, type CascadeRow, type NfState } from './def';

const W = 460;
const X0 = 70; // first stage slot starts here
const X1 = 440; // last stage slot ends here
const Y0 = 72; // first row's signal line
const ROW = 146; // row pitch
const MAX_SLOTS = 8;

type Slot = { kind: 'stage'; i: number } | { kind: 'gap'; from: number; to: number };

/** dB with up to d decimals, typographic minus. */
const db = (x: number, d = 1) => (Number.isFinite(x) ? String(+x.toFixed(d)).replace('-', '−') : x > 0 ? '∞' : '−∞');

/** Which stages to draw: all of them up to 8, else the head, the solved stage and the last one, with the rest folded. */
function slotsFor(n: number, solved: number): Slot[] {
  if (n <= MAX_SLOTS) return Array.from({ length: n }, (_, i) => ({ kind: 'stage', i }));
  const keep = new Set<number>();
  const midSolved = solved >= 6 && solved <= n - 2;
  for (let i = 0; i < (midSolved ? 4 : 6); i++) keep.add(i);
  if (midSolved) keep.add(solved);
  keep.add(n - 1);
  const idx = [...keep].sort((a, b) => a - b);
  const out: Slot[] = [];
  idx.forEach((i, j) => {
    // a single hidden stage takes no more room than its gap box: draw it
    if (j > 0 && i === idx[j - 1] + 2) out.push({ kind: 'stage', i: i - 1 });
    else if (j > 0 && i > idx[j - 1] + 2) out.push({ kind: 'gap', from: idx[j - 1] + 1, to: i - 1 });
    out.push({ kind: 'stage', i });
  });
  return out;
}

/** A part group (so the tone classes reach the outline) on the parts layer. */
function group(s: Schematic, tone: string, children: SVGElement[]): void {
  const g = svgEl('g', { class: `sch-part ${tone}`.trim() });
  g.append(...children);
  s.svg().querySelector('g.sch-parts')!.appendChild(g);
}

export function nfDiagram(st: NfState, r: CalcReport): SVGSVGElement | null {
  const n = st.stages?.length ?? 0;
  if (!n) return null;
  let rows = (r.ok ? (r.details as { rows?: CascadeRow[] } | undefined)?.rows : undefined) ?? undefined;
  if (!rows || rows.length !== n) {
    try {
      rows = cascade(st).rows;
    } catch {
      return null;
    }
  }
  const k = Math.min(Math.max(st.solveStage | 0, 0), n - 1);
  const solving = st.solveFor === 'nfStage' && st.stages[k].type !== 'passive';
  const infeasible = solving && r.status?.tone === 'fail';
  const slots = slotsFor(n, solving ? k : -1);
  const per = slots.length <= 4 ? slots.length : slots.length <= 6 ? 3 : 4;
  const nRows = Math.ceil(slots.length / per);
  const pitch = Math.min((X1 - X0) / per, 120);
  const H = Y0 + (nRows - 1) * ROW + 96;
  const s = new Schematic(W, H);
  const last = rows[n - 1];

  // Headline: the cascade figures (NF is the answer unless a stage NF is being solved).
  const nfTone = solving ? '' : 'solved';
  s.text(12, 18, solving ? `NF_sys ${db(st.nfTotal, 2)} dB (target)` : `NF_sys ${db(last.cumNfDb, 2)} dB`, `sch-label ${nfTone}`.trim(), 'start');
  s.text(W - 12, 18, `G ${db(last.cumGainDb)} dB · Te ${si(last.cumTe, 'K', 3)}`, 'sch-value', 'end');

  // Source (antenna at T_s)
  s.antenna(34, Y0, { size: 24 });
  s.text(10, Y0 + 36, `Tₛ ${si(st.tSrc, 'K', 3)}`, 'sch-value', 'start');

  let prevOut: Pt = [34, Y0];
  slots.forEach((slot, j) => {
    const row = Math.floor(j / per);
    const col = j % per;
    const y = Y0 + row * ROW;
    const x = X0 + pitch * (col + 0.5);
    const half = slot.kind === 'gap' ? 24 : 20;
    const inPt: Pt = [x - half, y];
    // signal wire from the previous output (wrapping back to the left between rows)
    if (col === 0 && row > 0) {
      const yr = y - ROW + 96;
      s.wire([prevOut, [W - 12, prevOut[1]], [W - 12, yr], [58, yr], [58, y], inPt]);
    } else s.wire([prevOut, inPt]);
    prevOut = [x + half, y];

    // row headers for the cumulative lines
    if (col === 0) s.text(12, y + 68, 'Σ G', 'sch-hint', 'start').text(12, y + 81, 'Σ NF', 'sch-hint', 'start');

    if (slot.kind === 'gap') {
      const m = slot.to - slot.from + 1;
      const g = rows!.slice(slot.from, slot.to + 1).reduce((a, rr) => a + rr.gDb, 0);
      s.box(x - 24, y - 15, 48, 30);
      s.text(x, y + 5, '⋯', 'sch-label');
      s.text(x, y - 30, `${slot.from + 1}–${slot.to + 1}`, 'sch-label');
      s.text(x, y + 36, `${m} stages`, 'sch-value').text(x, y + 49, `G ${db(g)} dB`, 'sch-value');
      const c = rows![slot.to];
      s.text(x, y + 68, `${db(c.cumGainDb)} dB`, 'sch-value').text(x, y + 81, `${db(c.cumNfDb, 2)} dB`, 'sch-value');
      return;
    }

    const i = slot.i;
    const stg = st.stages[i];
    const rr = rows![i];
    const isSolved = solving && i === k;
    const tone = isSolved ? (infeasible ? 'hl' : 'solved') : '';
    if (stg.type === 'amp') s.amp(x, y, { size: 40, tone });
    else if (stg.type === 'mixer') {
      const c = 17;
      const d = c * 0.62;
      group(s, tone, [
        svgEl('circle', { cx: x, cy: y, r: c, class: 'sch-body', fill: 'var(--sch-fill)' }),
        svgEl('path', { d: `M ${x - d} ${y - d} L ${x + d} ${y + d} M ${x - d} ${y + d} L ${x + d} ${y - d}`, class: 'sch-body', fill: 'none' }),
      ]);
    } else {
      // passive / lossy: a box with a resistor glyph
      let zz = `M ${x - 15} ${y}`;
      for (let q = 0; q < 6; q++) zz += ` L ${x - 15 + 5 * (q + 0.5)} ${y + (q % 2 ? 5 : -5)}`;
      zz += ` L ${x + 15} ${y}`;
      group(s, tone, [svgEl('rect', { x: x - 20, y: y - 14, width: 40, height: 28, rx: 3, class: 'sch-body', fill: 'var(--sch-fill)' }), svgEl('path', { d: zz, class: 'sch-body', fill: 'none' })]);
    }
    // name above (trimmed to the slot), G / NF under
    const maxCh = Math.max(4, Math.floor((pitch - 6) / 7));
    const name = stg.name || `Stage ${i + 1}`;
    s.text(x, y - 30, name.length > maxCh ? `${name.slice(0, maxCh - 1)}…` : name, `sch-label ${tone}`.trim());
    s.text(x, y + 36, stg.type === 'passive' ? `L ${db(stg.loss, 2)} dB` : `G ${db(rr.gDb, 2)} dB`, 'sch-value');
    const nfText = isSolved && infeasible ? 'NF —' : `NF ${db(rr.nfDb, 2)} dB`;
    s.text(x, y + 49, isSolved && !infeasible ? `NF ≤ ${db(rr.nfDb, 2)} dB` : nfText, isSolved ? `sch-label ${tone}` : 'sch-value');
    // cumulative to this stage's output
    const lastStage = i === n - 1;
    s.text(x, y + 68, `${db(rr.cumGainDb)} dB`, 'sch-value');
    s.text(x, y + 81, `${db(rr.cumNfDb, 2)} dB`, lastStage && !solving ? 'sch-label solved' : 'sch-value');
  });

  // output port
  const ox = Math.min(prevOut[0] + 26, W - 14);
  s.wire([prevOut, [ox, prevOut[1]]]).terminal(ox, prevOut[1], 'out', 'middle');
  return s.svg();
}
