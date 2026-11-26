/** Schmitt Trigger — page module: def + theory + the RC oscillator drawn for a logic gate or an op-amp. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type SchmittState, def } from './def';
import { GATES } from './model';
import { theory } from './theory';

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** si() with a typographic minus */
const sv = (v: number, d = 3) => si(v, 'V', d).replace(/^-/, '−');

export function circuit(st: SchmittState, r: CalcReport): SVGSVGElement {
  const s: SchmittState = (r.ok && (r.details?.state as SchmittState)) || st;
  const d = (r.ok ? r.details : undefined) as { vth?: number; vtl?: number; duty?: number } | undefined;
  const fmt = (v: number, unit: string, solved: boolean) => ((solved && !r.ok) || !ok(v) ? '?' : si(v, unit, 3));
  const tR = s.solveFor === 'r' ? 'solved' : '';
  const tC = s.solveFor === 'c' ? 'solved' : '';
  const tF = s.solveFor === 'f' ? 'solved' : '';
  const sch = new Schematic(460, 270);
  const xo = 330; // output node (R returns here)
  const yo = 140;
  const thLabels = s.type === 'gate' ? ['V_T₊', 'V_T₋'] : ['V_TH', 'V_TL'];
  let xIn: number;
  let yIn: number;
  if (s.type === 'gate') {
    // Schmitt inverter: triangle, output bubble and the hysteresis glyph
    const p = sch.amp(240, yo, { size: 60 });
    sch.shape('circle', { cx: p.out[0] + 4, cy: yo, r: 4, class: 'sch-body', fill: 'var(--sch-fill)' });
    sch.shape('path', { d: `M 224 ${yo + 6} h 10 v -12 h 6 M 230 ${yo + 6} v -12 h 10`, class: 'sch-line', fill: 'none' });
    sch.wire([[p.out[0] + 8, yo], [420, yo]]);
    xIn = 150;
    yIn = yo;
    sch.wire([[xIn, yIn], [p.in[0], yo]]);
    const part = GATES[s.part];
    sch.text(240, yo + 50, part ? part.label.split(' ')[0] : 'Schmitt inverter', 'sch-label');
    sch.text(240, yo + 63, `V_CC ${sv(s.vcc)}`, 'sch-value');
  } else {
    const p = sch.amp(240, yo, { size: 70, opamp: true });
    sch.wire([[p.out[0], yo], [420, yo]]);
    xIn = 60;
    yIn = p.inN[1];
    sch.wire([[xIn, yIn], [p.inN[0], yIn]]);
    // threshold network on the + input: R₁ to V_ref, R₂ from the output
    const xP = 190;
    const yP = p.inP[1];
    sch.wire([[170, yP], [p.inP[0], yP]]).dot(xP, yP);
    sch.resistor([170, yP], [170, 245], { label: 'R₁', value: si(s.r1, 'Ω', 3), flip: true });
    if (Math.abs(s.vref) < 1e-12) sch.ground(170, 245);
    else sch.terminal(170, 245).text(178, 262, `V_ref ${sv(s.vref)}`, 'sch-label', 'start');
    sch.wire([[xP, yP], [xP, 222]]);
    sch.resistor([xP, 222], [xo, 222], { label: 'R₂', value: si(s.r2, 'Ω', 3) });
    sch.wire([[xo, 222], [xo, yo]]);
    sch.text(240, 101 - 14, `V_OH ${sv(s.voh)} / V_OL ${sv(s.vol)}`, 'sch-hint');
  }
  // timing network: R from the output back to the input, C from the input to ground
  const yR = 55;
  sch.wire([[xIn, yIn], [xIn, yR]]);
  sch.resistor([xIn, yR], [xo, yR], { label: 'R', value: fmt(s.r, 'Ω', !!tR), tone: tR });
  sch.wire([[xo, yR], [xo, yo]]).dot(xo, yo).dot(xIn, yIn);
  sch.capacitor([xIn, yIn], [xIn, 240], { label: 'C', value: fmt(s.c, 'F', !!tC), tone: tC, flip: s.type === 'gate' });
  sch.ground(xIn, 240);
  sch.terminal(420, yo).text(420, yo - 12, 'OUT', 'sch-label', 'end');
  // live answers: thresholds at the input, frequency at the output
  if (d && ok(d.vth) && ok(d.vtl)) {
    const x = 30;
    const y0 = 175;
    if (s.type === 'gate') {
      sch.text(x, y0, `${thLabels[0]} ${sv(d.vth)}`, 'sch-value', 'start');
      sch.text(x, y0 + 17, `${thLabels[1]} ${sv(d.vtl)}`, 'sch-value', 'start');
    } else {
      sch.text(345, 236, `${thLabels[0]} ${sv(d.vth)}`, 'sch-value', 'start');
      sch.text(345, 253, `${thLabels[1]} ${sv(d.vtl)}`, 'sch-value', 'start');
    }
  }
  const f = r.ok ? s.f : s.solveFor === 'f' ? NaN : s.f;
  sch.text(345, yo + 22, `f ${ok(f) ? si(f, 'Hz', 3) : '?'}`, `sch-value ${tF}`.trim(), 'start');
  if (d && ok(d.duty)) sch.text(345, yo + 36, `D ${(d.duty * 100).toFixed(1)} %`, `sch-value ${tF}`.trim(), 'start');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: SchmittState, r) => circuit(s, r) },
};

export default mod;
