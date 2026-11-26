/** ADC SNR — block diagram showing where each noise term enters and the SNR limit it sets. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic, svgEl } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { AdcState } from './def';
import type { AdcResult } from './model';

const W = 460;
const Y = 112; // signal line

const fmtDb = (v: number | undefined) => (v == null ? '' : Number.isFinite(v) ? `${v.toFixed(1)} dB` : '∞');

export function adcDiagram(st: AdcState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as (AdcResult & { bw: number }) | undefined) : undefined;
  const has = d != null && typeof d.snrQ === 'number';
  const solved = (key: string): { v: number | null } | null => {
    if (st.solveFor !== key) return null;
    const it = r.results?.find((x) => x.key === key && x.solved);
    return { v: typeof it?.value === 'number' ? it.value : null };
  };
  const sN = solved('n');
  const sTj = solved('tjClk');
  const sFin = solved('fin');
  const tSolved = (x: { v: number | null } | null) => (x ? (x.v == null && r.status?.tone === 'fail' ? 'hl' : 'solved') : '');
  const n = sN ? sN.v : st.n;
  const tj = sTj ? sTj.v : st.tjClk;
  const fin = sFin ? sFin.v : st.fin;
  // the dominant noise term (largest share of the noise power)
  const dom = has ? (Object.entries(d!.share).sort((a, b) => b[1] - a[1])[0][0] as 'q' | 'th' | 'j' | 'thd') : null;
  const domTone = (k: string) => (dom === k ? 'hl' : '');
  const lab = (tone: string) => `sch-label ${tone}`.trim();
  const val = (tone: string) => (tone ? `sch-value ${tone}` : 'sch-value');

  const s = new Schematic(W, 246);
  const parts = s.svg().querySelector('g.sch-parts')!;

  // ── input sine
  const fTone = tSolved(sFin);
  s.source(52, Y, Y + 50, { kind: 'ac' });
  s.ground(52, Y + 50);
  s.text(52, Y - 30, `A_in ${String(st.ain).replace('-', '−')} dBFS`, 'sch-value');
  s.text(52, Y - 16, `f_in ${sFin && fin == null ? (r.status?.tone === 'pass' ? '∞' : '?') : si(fin!, 'Hz', 3)}`, fTone ? lab(fTone) : 'sch-value');

  // ── summing node: input-referred thermal noise v_n
  const sx = 122;
  const thTone = st.vn > 0 ? domTone('th') : 'muted';
  const g = svgEl('g', { class: 'sch-part' });
  g.append(
    svgEl('circle', { cx: sx, cy: Y, r: 10, class: 'sch-body', fill: 'var(--sch-fill)' }),
    svgEl('path', { d: `M ${sx - 5} ${Y} L ${sx + 5} ${Y} M ${sx} ${Y - 5} L ${sx} ${Y + 5}`, class: 'sch-line', fill: 'none' }),
  );
  parts.appendChild(g);
  s.wire([[52, Y], [sx - 10, Y]]);
  s.arrow([sx, 46], [sx, Y - 10], { tone: thTone === 'hl' ? 'hl' : '', dashed: !(st.vn > 0) });
  s.text(sx, 24, st.vn > 0 ? `v_n ${si(st.vn, 'V', 3)}` : 'v_n none', thTone === 'muted' ? 'sch-hint' : lab(thTone));
  if (has && st.vn > 0) s.text(sx, 38, `SNR_th ${fmtDb(d!.snrTh)}`, val(thTone));

  // ── sample-and-hold, clocked at f_s with clock + aperture jitter
  const hx = 160;
  const hw = 62;
  const hc = hx + hw / 2;
  s.wire([[sx + 10, Y], [hx, Y]]);
  s.block(hx, Y - 20, hw, 40, { label: 'S/H' });
  const jTone = (tj ?? 0) > 0 || st.tjAp > 0 ? domTone('j') : 'muted';
  const cy0 = Y + 74;
  s.block(hc - 45, cy0, 90, 26, { label: `f_s ${si(st.fs, 'Hz', 3)}` });
  s.arrow([hc, cy0], [hc, Y + 20], { tone: jTone === 'hl' ? 'hl' : '' });
  const tjTone = tSolved(sTj);
  s.text(hc - 8, Y + 38, `t_j ${sTj && tj == null ? '?' : si(tj ?? 0, 's', 3)}`, tjTone ? lab(tjTone) : val(jTone), 'end');
  s.text(hc - 8, Y + 51, `t_ap ${si(st.tjAp, 's', 3)}`, val(jTone), 'end');
  if (has) s.text(hc - 8, Y + 64, d!.tj > 0 ? `SNR_j ${fmtDb(d!.snrJ)}` : 'no jitter', d!.tj > 0 ? val(jTone) : 'sch-hint', 'end');

  // ── N-bit quantiser
  const qx = 250;
  const qw = 72;
  const qc = qx + qw / 2;
  s.wire([[hx + hw, Y], [qx, Y]]);
  const nTone = tSolved(sN) || domTone('q');
  s.block(qx, Y - 22, qw, 44, { label: `N = ${sN && n == null ? '?' : n}`, value: 'bits', tone: nTone });
  if (has) {
    s.text(qc, Y - 48, `q ${si(d!.lsb, 'V', 3)}`, 'sch-hint');
    s.text(qc, Y - 34, `SNR_q ${fmtDb(d!.snrQ)}`, val(domTone('q')));
  }
  if (st.thd != null) s.text(qc, Y + 38, `THD ${String(st.thd).replace('-', '−')} dBc`, val(domTone('thd')));

  // ── optional digital filter to BW (processing gain)
  let ox = qx + qw;
  if (st.bw > 0 && st.bw < st.fs / 2) {
    const fw = 56;
    const fx = 342;
    s.wire([[ox, Y], [fx, Y]]);
    s.block(fx, Y - 20, fw, 40, { label: 'BW', value: si(st.bw, 'Hz', 3) });
    if (has) s.text(fx + fw / 2, Y - 48, `PG +${d!.pg.toFixed(1)} dB`, 'sch-value');
    ox = fx + fw;
  }
  const tx = 438;
  s.wire([[ox, Y], [tx, Y]]).terminal(tx, Y, 'out', 'middle');

  // ── result and the limiting term
  const outTone = st.solveFor === 'snr' ? 'solved' : '';
  if (has) {
    s.text(W - 12, Y + 106, `SINAD ${fmtDb(d!.sinad)}`, lab(outTone), 'end');
    s.text(W - 12, Y + 120, `ENOB ${Number.isFinite(d!.enob) ? d!.enob.toFixed(2) : '∞'} bits`, lab(outTone), 'end');
    const names = { q: 'quantization', th: 'thermal noise', j: 'jitter', thd: 'THD' };
    s.text(12, Y + 120, `Limited by ${names[dom!]} (${(d!.share[dom!] * 100).toFixed(0)} %)`, 'sch-caption hl', 'start');
  } else if (r.ok && r.status?.tone === 'fail') s.text(W - 12, Y + 120, 'No solution — see warnings', 'sch-caption hl', 'end');
  return s.svg();
}
