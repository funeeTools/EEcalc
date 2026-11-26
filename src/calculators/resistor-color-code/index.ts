/** Resistor Color Code — page module: def + theory + a drawing of the banded resistor (or the SMD chip). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbRect } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import { def, type RccState } from './def';
import { BAND_RGB, BODY_RGB, type ColorName } from './model';
import { theory } from './theory';

// beige carbon-film body for 3/4 bands, blue metal-film for 5/6 (colours are data, in model.ts)
const BODY = BODY_RGB;

function drawing(st: RccState, r: CalcReport): SVGSVGElement {
  const s: RccState = (r.ok && (r.details?.state as RccState)) || st;
  const coding = r.ok ? (r.details?.coding as { colors: ColorName[]; labels: string[] } | null) : null;
  const res = (k: string) => r.results.find((i) => i.key === k);
  const W = 440;
  const H = 262;
  const sch = new Schematic(W, H);
  const cy = 110;
  const valTone = s.mode === 'encode' ? '' : 'solved';
  const headline = r.ok ? `${(res('r') ?? res('coded'))?.display ?? ''}${res('tolPct') ? ` ${String(res('tolPct')!.display).split(' (')[0]}` : ''}` : '?';
  sch.text(W / 2, 36, headline, `sch-label ${r.ok ? valTone : 'hl'}`.trim());

  if (s.mode === 'smd') {
    // chip resistor: dark body, tinned end caps, printed code
    pcbRect(sch, 'solder', 128, cy - 26, 22, 52, { rx: 3 });
    pcbRect(sch, 'solder', 290, cy - 26, 22, 52, { rx: 3 });
    pcbRect(sch, 'part', 148, cy - 28, 144, 56, { rx: 2 });
    sch.text(220, cy + 7, String(s.code ?? '').toUpperCase() || '?', `sch-label sch-halo smd-code ${r.ok ? '' : 'hl'}`.trim());
    sch.text(220, cy + 48, 'chip resistor (code as printed)', 'sch-hint');
  } else {
    const n = coding?.colors.length ?? 0;
    const fiveUp = s.bands >= 5;
    sch.wire([[20, cy], [100, cy]]).wire([[340, cy], [W - 20, cy]]);
    const body = 'M 116 80 H 150 Q 156 80 160 86 H 280 Q 284 80 290 80 H 324 Q 340 80 340 96 V 124 Q 340 140 324 140 H 290 Q 284 140 280 134 H 160 Q 156 140 150 140 H 116 Q 100 140 100 124 V 96 Q 100 80 116 80 Z';
    sch.shape('path', { d: body, class: 'sch-body', style: `fill:${fiveUp ? BODY.metal : BODY.carbon}` });
    if (coding && n > 0) {
      // x of each band: digits + multiplier bunched at the left, tolerance (and TCR) apart at the right
      const lead = coding.colors.length === 1 ? [213] : fiveUp ? [120, 168, 196, 224] : [120, 172, 204];
      const nLead = fiveUp ? 4 : 3;
      const xs = [...lead.slice(0, Math.min(nLead, n))];
      if (n > nLead) xs.push(s.bands === 6 ? 292 : 302);
      if (n > nLead + 1) xs.push(314);
      const bw = 14;
      coding.colors.forEach((c, i) => {
        const x = xs[i];
        if (x == null || c === 'none') return;
        const onCap = x < 150 || x + bw > 290;
        sch.shape('rect', { x, y: onCap ? 80 : 86, width: bw, height: onCap ? 60 : 48, class: 'sch-body', style: `fill:${BAND_RGB[c]};stroke-width:1` });
      });
      // labels: digits and tolerance on the first row, multiplier and TCR on the second
      coding.labels.forEach((lab, i) => {
        const x = xs[i];
        if (x == null) return;
        const row2 = (i === nLead - 1 && n > 1) || i === nLead + 1;
        sch.text(x + bw / 2, row2 ? 176 : 160, lab, 'sch-value');
      });
    }
  }
  if (coding) sch.text(W / 2, 204, (s.mode === 'smd' ? 'as bands: ' : '') + coding.colors.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' · '), 'sch-label');
  const std = res('standard');
  if (std) {
    const isStd = std.tone === 'pass';
    const near = res('nearest');
    const txt = std.display === 'jumper' ? 'zero-ohm jumper' : isStd ? `standard value: ${String(std.value).split(' ').join(', ')}` : `not a standard value · nearest ${s.eseries} ${near ? si(near.value as number, 'Ω', 3) : ''}`;
    sch.text(W / 2, 226, txt, `sch-hint ${isStd || std.display === 'jumper' ? '' : 'hl'}`.trim());
  }
  if (!r.ok) sch.text(W / 2, 226, 'no valid code', 'sch-hint hl');
  const svg = sch.svg();
  // the printed SMD code reads larger than ordinary labels
  svg.querySelectorAll('text.smd-code').forEach((t) => t.setAttribute('style', 'font-size:22px;letter-spacing:1px'));
  return svg;
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Diagram', draw: (s, r) => drawing(s as RccState, r) },
};
export default mod;
