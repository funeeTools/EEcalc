/** Audio SNR — page module: definition + theory + a block diagram of the signal chain. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic, svgEl } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, type SnrState } from './def';
import { theory } from './theory';

const dB = (x: number, d = 1, u = 'dB') => (Number.isFinite(x) ? `${x < 0 ? '−' : x > 0 && u !== 'dB' ? '+' : ''}${Math.abs(x).toFixed(d)} ${u}` : '—');

function diagram(s: SnrState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as { snr: number; dr: number; noiseDbu: number; einDbu: number; limitedBy: string; share: number } | undefined) : undefined;
  const sch = new Schematic(460, 236);
  const parts = sch.svg().querySelector('g.sch-parts')!;
  const Y = 104;
  const tone = (k: SnrState['solveFor']) => (s.solveFor === k ? 'solved' : '');
  const lab = (t: string) => `sch-label ${t}`.trim();
  const val = (t: string) => (t ? `sch-value ${t}` : 'sch-value');
  const dom = d ? (d.share >= 0.5 ? 'analog' : 'q') : '';

  // source with its resistance
  const xs = 34;
  sch.source(xs, Y, Y + 58, { kind: 'ac', tone: tone('sig') });
  sch.ground(xs, Y + 62);
  sch.resistor([xs, Y], [96, Y], { label: 'R_s', value: si(s.rs, 'Ω', 3), tone: s.rs > 0 ? '' : 'muted' });
  sch.text(xs + 26, Y + 40, 'signal', 'sch-hint', 'start');
  sch.text(xs + 26, Y + 54, dB(s.sigDbu, 1, 'dBu'), val(tone('sig')), 'start');

  // summing node: amplifier input noise
  const sx = 118;
  const nTone = tone('noise') || (dom === 'analog' ? 'hl' : '');
  const g = svgEl('g', { class: 'sch-part' });
  g.append(
    svgEl('circle', { cx: sx, cy: Y, r: 10, class: 'sch-body', fill: 'var(--sch-fill)' }),
    svgEl('path', { d: `M ${sx - 5} ${Y} L ${sx + 5} ${Y} M ${sx} ${Y - 5} L ${sx} ${Y + 5}`, class: 'sch-line', fill: 'none' }),
  );
  parts.appendChild(g);
  sch.wire([[96, Y], [sx - 10, Y]]);
  sch.arrow([sx, 52], [sx, Y - 10], { tone: nTone === 'hl' ? 'hl' : '' });
  sch.text(sx, 24, s.noiseAs === 'en' && s.solveFor !== 'noise' ? `e_n ${si(s.en, 'V', 3)}/√Hz` : `EIN ${dB(d?.einDbu ?? s.ein, 1, 'dBu')}`, lab(nTone));
  sch.text(sx, 38, s.noiseAs === 'en' && s.solveFor !== 'noise' ? 'input noise' : 'input-referred', 'sch-hint');

  // gain
  sch.wire([[sx + 10, Y], [150, Y]]);
  sch.amp(170, Y, { size: 40 });
  sch.text(170, Y + 42, `G ${dB(s.gainDb, 0)}`, 'sch-value');

  // converter
  let x = 190;
  if (s.adc) {
    const qTone = tone('bits') || (dom === 'q' ? 'hl' : '');
    sch.wire([[x, Y], [214, Y]]);
    sch.block(214, Y - 24, 70, 48, { label: 'ADC', value: `${s.bits} bit`, tone: qTone });
    sch.text(249, Y + 42, `f_s ${si(s.fsamp, 'Hz', 3)}`, 'sch-value');
    if (s.dither === 'tpdf') sch.text(249, Y + 56, '+ TPDF dither', 'sch-hint');
    x = 284;
  }
  sch.text(s.adc ? 249 : 214, Y - 36, `0 dBFS = ${dB(s.lmax, 1, 'dBu')}`, 'sch-hint');

  // weighting filter / measurement band
  const wx = 300;
  sch.wire([[x, Y], [wx, Y]]);
  sch.block(wx, Y - 22, 84, 44, { label: s.weighting === 'none' ? 'band' : `${s.weighting}-wtg`, value: `${si(s.flo, 'Hz', 2)}–${si(s.fhi, 'Hz', 2)}` });
  sch.wire([[wx + 84, Y], [436, Y]]).terminal(436, Y);

  // results
  const rTone = tone('snr');
  if (d) {
    sch.text(448, Y + 40, `SNR ${dB(d.snr, 1)}`, lab(rTone), 'end');
    sch.text(448, Y + 54, `DR ${dB(d.dr, 1)}`, 'sch-value', 'end');
    sch.text(448, Y + 68, `noise ${dB(d.noiseDbu, 1, 'dBu')}`, 'sch-value', 'end');
    sch.text(12, 226, `Limited by ${d.limitedBy} (${((d.limitedBy === 'quantisation' ? 1 - d.share : d.share) * 100).toFixed(0)} % of the noise)`, 'sch-caption hl', 'start');
  } else sch.text(12, 226, r.error ? 'No result — see the message' : '', 'sch-caption hl', 'start');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s: SnrState, r) => diagram(s, r) },
};

export default mod;
