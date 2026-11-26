/** LVDT sensitivity — page module: definition + theory + a circuit tab (transformer, core and read-out chain). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic, svgEl } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { U_LEN } from '@/core/unitsets';
import { U_SENS, def, sensUnitOf, type LvdtState } from './def';
import { theory } from './theory';

function circuit(s: LvdtState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as { clipped: boolean; fill: number; vdc: number } | undefined) : undefined;
  const sch = new Schematic(460, 260);
  const parts = sch.svg().querySelector('g.sch-parts')!;
  const tone = (k: LvdtState['solveFor']) => (s.solveFor === k ? 'solved' : '');
  const lab = (t: string) => `sch-label ${t}`.trim();
  const val = (t: string) => (t ? `sch-value ${t}` : 'sch-value');
  const out = Math.abs(s.x) > s.fs * (1 + 1e-12);

  // excitation source and primary winding
  const xs = 40;
  const xp = 104;
  const yT = 50;
  const yB = 200;
  sch.source(xs, 92, 158, { kind: 'ac' });
  sch.wire([[xs, 92], [xs, yT], [xp, yT]]).wire([[xs, 158], [xs, yB], [xp, yB]]);
  sch.inductor([xp, yT], [xp, yB], { body: 96 });
  sch.text(xs, 222, `V_ex ${si(s.vex, 'V', 3)}`, 'sch-value');
  sch.text(xs, 237, si(s.fex, 'Hz', 3), 'sch-hint');
  sch.text(xp - 12, 129, 'P', 'sch-label', 'end');

  // two secondaries in series opposition (dots at opposite ends), output across the outer ends
  const xq = 168;
  sch.inductor([xq, 30], [xq, 118], { body: 56 });
  sch.inductor([xq, 132], [xq, 220], { body: 56 });
  sch.wire([[xq, 118], [xq, 132]]);
  sch.dot(xq + 10, 52).dot(xq + 10, 198);
  sch.text(xq + 18, 80, 'S₁', 'sch-label', 'start');
  sch.text(xq + 18, 178, 'S₂', 'sch-label', 'start');

  // ferromagnetic core between the windings, shifted with x (±x_FS ↔ ±42 px)
  const shift = Math.max(-58, Math.min(58, (s.x / s.fs) * 42));
  const xTone = tone('x') || (out ? 'hl' : '');
  const coreCls = xTone === 'solved' ? 'sch-fill-solved' : xTone === 'hl' ? 'sch-fill-hl' : 'sch-block';
  parts.appendChild(svgEl('rect', { x: 128, y: 125 - 38 - shift, width: 14, height: 76, rx: 2, class: coreCls }));
  parts.appendChild(svgEl('path', { d: `M 122 ${125 - shift} L 148 ${125 - shift}`, class: 'sch-line', fill: 'none' }));
  // in the displacement box's unit when it is imperial (the E-100 example reads 0.1 in, not 2.54 mm)
  const imperial = ['in', 'mil', 'ft'].includes(s.xUnit);
  sch.text(128, 248, `core x ${imperial ? `${+(s.x / U_LEN[s.xUnit]).toPrecision(3)} ${s.xUnit}` : si(s.x, 'm', 3)}`, lab(xTone));

  // output pair into the synchronous demodulator
  const xw = 236;
  sch.wire([[xq, 30], [xw, 30], [xw, 108], [252, 108]]);
  sch.wire([[xq, 220], [xw, 220], [xw, 142], [252, 142]]);
  sch.text(202, 20, `V_out ${si(s.vout, 'V', 3)}`, lab(tone('vout')));
  const unit = sensUnitOf(s.sensUnit);
  sch.text(196, 248, `S ${(s.sens / U_SENS[unit]).toPrecision(3)} mV/V${unit}`, val(tone('sens')), 'start');
  sch.block(252, 96, 60, 58, { label: 'demod', value: s.demod === 'rms' ? '×1.00' : '×0.900' });
  sch.arrow([282, 192], [282, 156], { dashed: true });
  sch.text(282, 206, Math.abs(s.phase) > 0 ? `ref Δφ ${s.phase}°` : 'ref from V_ex', 'sch-hint');

  // gain and ADC
  sch.wire([[312, 125], [326, 125]]);
  sch.amp(342, 125, { size: 32 });
  sch.text(342, 157, `G ${Number(s.gain.toPrecision(3))}`, 'sch-value');
  sch.wire([[358, 125], [370, 125]]);
  const adcTone = d?.clipped || (d && d.fill > 1) ? 'hl' : '';
  sch.block(370, 98, 76, 54, { label: 'ADC', value: `${s.bits} bit`, tone: adcTone });
  sch.text(408, 168, `±${si(s.vref, 'V', 3)}`, val(adcTone));
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: LvdtState, r) => circuit(s, r) },
};

export default mod;
