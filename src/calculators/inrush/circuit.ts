/** Live, annotated equivalent circuit for the inrush calculator. */

import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { InrushOutputs } from './model';
import type { InrushState } from './state';

const MAX_COLS = 4;

/** Values shared by both layouts. */
function values(s: InrushState, out: InrushOutputs | null) {
  const part = (name: string) => out?.feed.parts.filter((p) => p.name === name || p.name.startsWith(name)) ?? [];
  const sumL = (name: string) => part(name).reduce((a, p) => a + p.L, 0);
  const sumR = (name: string) => part(name).reduce((a, p) => a + p.R, 0);
  const waveKind: 'step' | 'ramp' | 'impulse' = s.waveform.startsWith('Step (') ? 'step' : s.waveform.includes('rise') ? 'ramp' : 'impulse';
  return {
    rLump: s.rSrc + s.rDamp + s.rConn + s.rExtra,
    leadL: out ? si(sumL('leads'), 'H') : '',
    leadR: out ? si(sumR('leads'), 'Ω') : '',
    serL: out ? si(sumL('series trace') + s.lExtra, 'H') : '',
    serR: out ? si(sumR('series trace'), 'Ω') : '',
    waveKind,
    srcValue: [si(s.v, 'V'), waveKind === 'ramp' ? `tr ${si(s.rise, 's')}` : waveKind === 'step' ? 'step' : s.waveform.split(' ')[0]],
    leadCaption: `${(s.lead.length * 1e3).toFixed(0)} mm · ${s.lead.awg} AWG${s.lead.pair ? ' pair' : ''}`,
    capText: (k: number) => {
      const caps = s.groups[k].caps;
      const t = caps.map((c) => `${c.qty}×${si(c.c, 'F')}`).join(' + ');
      return t.length > 18 ? `${caps.length} types` : t;
    },
    tone: (k: number) => (out && ((out.worstGroup === k && s.groups.length > 1) || out.groups[k]?.exceeded) ? 'hl' : ''),
  };
}

export function inrushCircuit(s: InrushState, out: InrushOutputs | null, compact = false): SVGSVGElement {
  return compact ? portrait(s, out) : landscape(s, out);
}

/** Phone layout: feed runs down the left, groups hang across to a return rail on the right. */
function portrait(s: InrushState, out: InrushOutputs | null): SVGSVGElement {
  const v = values(s, out);
  const n = s.groups.length;
  const FX = 64;
  const RX = 372;
  const top = 58;
  const split = 400;
  const pitch = 92;
  const ys = s.groups.map((_, k) => split + 50 + k * pitch);
  const lastY = ys[ys.length - 1];
  const sch = new Schematic(400, lastY + 52, 'portrait');

  sch.sourceBetween([FX, top], [RX, top], { kind: v.waveKind, label: 'V_s', value: v.srcValue.join(' · ') });
  sch.resistor([FX, top], [FX, 124], { label: 'R src+damp', value: si(v.rLump, 'Ω') });
  sch.box(FX - 18, 132, 300, 124, undefined, 'box-lead');
  sch.text(FX + 128, 176, 'Leads', 'sch-caption', 'start').text(FX + 128, 192, v.leadCaption, 'sch-hint', 'start');
  sch.inductor([FX, 124], [FX, 190], { label: 'L', value: v.leadL });
  sch.resistor([FX, 190], [FX, 256], { label: 'R', value: v.leadR });
  sch.box(FX - 18, 264, 300, 124, undefined, 'box-trace');
  sch.text(FX + 128, 308, 'Series trace', 'sch-caption', 'start').text(FX + 128, 324, `${(s.series.length * 1e3).toFixed(0)} mm`, 'sch-hint', 'start');
  sch.inductor([FX, 256], [FX, 322], { label: s.lExtra > 0 ? 'L (+extra)' : 'L', value: v.serL });
  sch.resistor([FX, 322], [FX, split - 8], { label: 'R', value: v.serR });
  sch.wire([[FX, split - 8], [FX, lastY]]);
  sch.wire([[RX, top], [RX, lastY]]);

  ys.forEach((y, k) => {
    const g = out?.groups[k];
    const tone = v.tone(k);
    sch.inductor([FX, y], [FX + 96, y], { label: 'L', value: g ? si(g.lBranch, 'H') : '', tone });
    sch.resistor([FX + 96, y], [FX + 196, y], { label: 'R', value: g ? si(g.rBranch, 'Ω') : '', tone });
    sch.capacitor([FX + 196, y], [RX, y], {
      label: g ? `C ${si(g.cap.cEffF, 'F')}` : 'C',
      value: [v.capText(k), g ? `Vpk ${si(g.vPeak, 'V')}` : ''].filter(Boolean),
      tone,
      polarized: s.groups[k].caps.every((c) => c.kind === 'electrolytic'),
    });
    sch.text(FX + 8, y + 22, `Group ${k + 1} · ${(s.groups[k].trace.length * 1e3).toFixed(0)} mm trace`, `sch-caption ${tone}`.trim(), 'start');
    if (k < n - 1) sch.dot(FX, y).dot(RX, y);
  });
  sch.wire([[RX, lastY], [RX, lastY + 12]]).ground(RX, lastY + 12);
  return sch.svg();
}

function landscape(s: InrushState, out: InrushOutputs | null): SVGSVGElement {
  const n = s.groups.length;
  const cols = Math.min(n, MAX_COLS);
  const colW = 150;
  const splitX = 600;
  const W = Math.max(splitX + 40 + cols * colW + (n > MAX_COLS ? 60 : 0), 820);
  const H = 330;
  const top = 92;
  const bot = 296;
  const sch = new Schematic(W, H);
  // source x: far enough right that its right-aligned value lines ("1.2/50", "tr 50 ns") stay inside
  const XS = 78;

  const part = (name: string) => out?.feed.parts.filter((p) => p.name === name || p.name.startsWith(name)) ?? [];
  const sumL = (name: string) => part(name).reduce((a, p) => a + p.L, 0);
  const sumR = (name: string) => part(name).reduce((a, p) => a + p.R, 0);
  const rLump = s.rSrc + s.rDamp + s.rConn + s.rExtra;

  // Source
  const waveKind = s.waveform.startsWith('Step (') ? 'step' : s.waveform.includes('rise') ? 'ramp' : 'impulse';
  sch.source(XS, top, bot, { kind: waveKind, label: 'V_s', value: [si(s.v, 'V'), waveKind === 'ramp' ? `tr ${si(s.rise, 's')}` : waveKind === 'step' ? 'step' : s.waveform.split(' ')[0]] });

  // Lumped R (source + damping + connector + extra)
  sch.resistor([XS, top], [150, top], { label: 'R src+damp', value: si(rLump, 'Ω') });

  // Leads
  sch.box(158, top - 62, 190, 90, `Leads · ${(s.lead.length * 1e3).toFixed(0)} mm · ${s.lead.awg} AWG${s.lead.pair ? ' pair' : ''}`, 'box-lead');
  sch.inductor([150, top], [255, top], { label: 'L', value: out ? si(sumL('leads'), 'H') : '' });
  sch.resistor([255, top], [350, top], { label: 'R', value: out ? si(sumR('leads'), 'Ω') : '' });

  // Series trace (+ any extra lumped L)
  sch.box(360, top - 62, 196, 90, `Series trace · ${(s.series.length * 1e3).toFixed(0)} mm`, 'box-trace');
  const lSeries = sumL('series trace') + s.lExtra;
  sch.inductor([350, top], [460, top], { label: s.lExtra > 0 ? 'L (+extra)' : 'L', value: out ? si(lSeries, 'H') : '' });
  sch.resistor([460, top], [splitX - 40, top], { label: 'R', value: out ? si(sumR('series trace'), 'Ω') : '' });
  sch.wire([[splitX - 40, top], [splitX, top]]);
  sch.text(splitX - 20, top + 44, 'shared feed →', 'sch-hint'); // below the series-trace box

  // Branches
  const xs: number[] = [];
  for (let k = 0; k < cols; k++) {
    const x = splitX + 30 + k * colW;
    xs.push(x);
    const g = out?.groups[k];
    const worst = out != null && out.worstGroup === k && n > 1;
    const tone = worst ? 'hl' : out && g?.exceeded ? 'hl' : '';
    sch.text(x, top - 30, `Group ${k + 1}`, `sch-caption ${tone}`.trim());
    const tr = s.groups[k].trace;
    sch.text(x, top - 16, `${(tr.length * 1e3).toFixed(0)} mm trace`, 'sch-hint');
    sch.inductor([x, top], [x, top + 70], { label: 'L', value: g ? si(g.lBranch, 'H') : '', tone });
    sch.resistor([x, top + 70], [x, top + 140], { label: 'R', value: g ? si(g.rBranch, 'Ω') : '', tone });
    const caps = s.groups[k].caps;
    const capLabel = caps.map((c) => `${c.qty}×${si(c.c, 'F')}`).join(' + ');
    sch.capacitor([x, top + 140], [x, bot], {
      label: g ? `C ${si(g.cap.cEffF, 'F')}` : 'C',
      value: [capLabel.length > 18 ? `${caps.length} types` : capLabel, g ? `Vpk ${si(g.vPeak, 'V')}` : ''],
      tone,
      polarized: caps.every((c) => c.kind === 'electrolytic'),
    });
  }
  const lastX = xs[xs.length - 1];
  sch.wire([[splitX, top], [lastX, top]]);
  for (const x of xs.slice(0, -1)) sch.dot(x, top);
  if (n > 1) sch.dot(splitX, top);
  if (n > MAX_COLS) sch.text(lastX + 64, (top + bot) / 2, `+${n - MAX_COLS} more`, 'sch-caption', 'middle');

  // Return rail
  sch.wire([[XS, bot], [lastX, bot]]);
  for (const x of xs.slice(0, -1)) sch.dot(x, bot);
  sch.ground(XS, bot + 8).wire([[XS, bot], [XS, bot + 8]]);
  sch.text((XS + lastX) / 2, bot + 22, 'return (ideal; lead/trace L and R above are loop values)', 'sch-hint');

  return sch.svg();
}
