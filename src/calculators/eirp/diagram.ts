/** Transmit chain block diagram: Tx → cable → connectors → antenna, with levels and the limit verdict. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import type { EirpState } from './def';
import { LIMITS } from './model';

const db = (v: number, d = 2) => `${v.toFixed(d)}`.replace('-', '−');

export function eirpDiagram(s: EirpState, r: CalcReport): SVGSVGElement | null {
  const d = r.ok ? (r.details as { pt: number; lc: number; lo: number; g: number; gd: number; eirp: number; erp: number; pAnt: number; margin: number; limitValue: number } | undefined) : undefined;
  const failed = !r.ok || r.results.some((x) => x.solved && x.value == null);
  const pt = d?.pt ?? s.pt;
  const lc = d?.lc ?? s.lc;
  const lo = d?.lo ?? s.lo;
  const g = d?.g ?? s.g;
  if (![pt, lc, lo, g].every(Number.isFinite)) return null;
  const tone = (k: string) => (s.solveFor === k ? (failed ? 'hl' : 'solved') : '');
  const show = (k: string, txt: string) => (s.solveFor === k && failed ? '—' : txt);
  const over = d != null && d.margin < -1e-9;
  const rule = LIMITS[s.limit];

  const sch = new Schematic(440, 214);
  const y = 96;
  // Tx block
  sch.block(18, y - 24, 74, 48, { label: 'Tx', value: show('pt', `${db(pt, 1)} dBm`), tone: tone('pt') });
  // cable
  sch.wire([[92, y], [170, y]], tone('lc'));
  sch.text(131, y - 22, 'cable', 'sch-hint');
  sch.text(131, y - 8, `L_c ${show('lc', `${db(lc, 1)} dB`)}`, `sch-value ${tone('lc')}`.trim());
  // connectors / other losses
  sch.block(170, y - 16, 70, 32, { label: `L_o ${db(lo, 1)} dB` });
  sch.text(205, y - 22, 'connectors', 'sch-hint');
  sch.wire([[240, y], [300, y], [300, y - 4]]);
  // antenna
  sch.antenna(300, y - 4, { size: 34, tone: tone('g') });
  sch.text(300, y + 24, `G ${show('g', `${db(g, 1)} dBi`)}`, `sch-label ${tone('g')}`.trim());
  sch.text(300, y + 38, `${show('g', `${db(g - 2.15, 1)} dBd`)}`, `sch-value ${tone('g')}`.trim());
  // radiated
  sch.arrow([330, y - 30], [420, y - 30], { tone: over ? 'hl' : tone('eirp') });
  const eTone = over ? 'hl' : tone('eirp');
  sch.text(420, y - 52, `EIRP ${d ? `${db(d.eirp)} dBm` : '—'}`, `sch-label ${eTone}`.trim(), 'end');
  sch.text(420, y - 10, `ERP ${d ? `${db(d.erp)} dBm` : '—'}`, `sch-value ${over && rule.ref === 'erp' ? 'hl' : ''}`.trim(), 'end');

  // level ruler under the chain
  const yl = y + 64;
  sch.shape('line', { x1: 55, y1: yl - 8, x2: 300, y2: yl - 8, class: 'sch-dim' });
  for (const [x, v, cap] of [[55, pt, 'Tx out'], [170, pt - lc, 'after cable'], [300, pt - lc - lo, 'into antenna']] as const) {
    sch.shape('line', { x1: x, y1: yl - 12, x2: x, y2: yl - 4, class: 'sch-dim' });
    sch.text(x, yl + 8, `${db(v, 1)} dBm`, 'sch-value');
    sch.text(x, yl + 21, cap, 'sch-hint');
  }
  // verdict
  if (d) {
    const lim = `${rule.ref === 'conducted' ? 'conducted' : rule.ref.toUpperCase()} ≤ ${db(d.limitValue, 1)} dBm`;
    // preset names carry their scope in brackets; the drawing only has room for the rule itself
    sch.text(20, 22, `${rule.label.replace(/\s*\(.*$/, '')}: ${lim}`, 'sch-hint', 'start');
    sch.text(20, 38, `margin ${d.margin >= -1e-9 ? '+' : '−'}${Math.abs(d.margin).toFixed(2)} dB`, `sch-label ${over ? 'hl' : ''}`.trim(), 'start');
  }
  return sch.svg();
}
