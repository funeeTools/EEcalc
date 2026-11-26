/** Crystal load capacitance — page module: definition + theory + the Pierce oscillator circuit. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type XtalState, def } from './def';
import { loadCap } from './model';
import { theory } from './theory';

const W = 440;
const H = 276;

export function circuit(s: XtalState, r: CalcReport): SVGSVGElement {
  const val = (k: 'cl1' | 'cl2') => {
    const kk = k === 'cl2' && s.equal ? 'cl1' : k;
    if (s.solveFor !== kk) return s[kk];
    const v = r.results.find((x) => x.key === kk)?.value;
    return r.ok && typeof v === 'number' ? v : NaN;
  };
  const c1 = val('cl1');
  const c2 = val('cl2');
  const cload = Number.isFinite(c1) && Number.isFinite(c2) ? loadCap(c1, c2, s.cs) : NaN;
  const margin = r.ok ? (r.details as { margin?: number } | undefined)?.margin : undefined;
  const weak = margin != null && margin < 5;
  const pull = r.ok ? ((r.details as { pull?: number | null } | undefined)?.pull ?? null) : null;
  const fC = (c: number) => (Number.isFinite(c) ? si(c, 'F', 3) : '—');
  const tone = (k: string) => (s.solveFor === k ? 'solved' : '');
  const t1 = s.equal ? tone('cl1') : tone('cl1');
  const t2 = s.equal ? tone('cl1') : tone('cl2');

  const sch = new Schematic(W, H);
  const xi = 120; // XIN
  const xo = 320; // XOUT
  const ya = 58; // amplifier row
  const yf = 24; // feedback resistor
  const yx = 150; // crystal row
  const yg = 236; // ground

  // MCU: inverting amplifier with its bias resistor
  sch.box(xi - 30, 4, xo - xi + 60, 96, 'MCU', weak ? 'hl' : '');
  const a = sch.amp((xi + xo) / 2, ya, { size: 44, tone: weak ? 'hl' : '' });
  sch.shape('circle', { cx: a.out[0] + 4, cy: ya, r: 4, class: 'sch-body', fill: 'var(--sch-fill)' });
  sch.wire([[xi, ya], a.in]).wire([[a.out[0] + 8, ya], [xo, ya]]);
  sch.resistor([xi + 40, yf], [xo - 40, yf], { body: 30 });
  sch.wire([[xi, ya], [xi, yf], [xi + 40, yf]]).wire([[xo - 40, yf], [xo, yf], [xo, ya]]);
  sch.text(xo - 34, yf - 8, 'R_F', 'sch-hint', 'start');
  sch.text((xi + xo) / 2, 96, margin != null ? `gain margin ${margin.toFixed(1)}` : '', `sch-hint ${weak ? 'hl' : ''}`.trim());
  sch.text(xi + 6, 96, 'XIN', 'sch-pin', 'start').text(xo - 6, 96, 'XOUT', 'sch-pin', 'end');

  // crystal between the pins, load capacitors to ground
  sch.wire([[xi, ya], [xi, yx]]).wire([[xo, ya], [xo, yx]]);
  sch.crystal([xi, yx], [xo, yx], { label: `${si(s.f, 'Hz', 6)}`, value: `spec C_L ${fC(s.cl)}` });
  sch.dot(xi, yx).dot(xo, yx);
  sch.capacitor([xi, yx], [xi, yg], { label: 'C_L1', value: fC(c1), tone: t1, flip: true });
  sch.capacitor([xo, yx], [xo, yg], { label: 'C_L2', value: fC(c2), tone: t2 });
  sch.wire([[xi, yg], [xo, yg]]);
  sch.ground((xi + xo) / 2, yg);

  // stray capacitance (pins + traces) drawn dashed across the crystal
  const ys = yx + 30; // on the capacitor leads: the same nodes as the crystal pins
  sch.shape('path', { d: `M ${xi} ${ys} L ${(xi + xo) / 2 - 4} ${ys} M ${(xi + xo) / 2 - 4} ${ys - 8} L ${(xi + xo) / 2 - 4} ${ys + 8} M ${(xi + xo) / 2 + 4} ${ys - 8} L ${(xi + xo) / 2 + 4} ${ys + 8} M ${(xi + xo) / 2 + 4} ${ys} L ${xo} ${ys}`, class: 'sch-body xs-air', fill: 'none' });
  sch.text((xi + xo) / 2, ys + 20, `C_s ${fC(s.cs)} (pins + traces)`, 'sch-hint');
  const off = pull != null ? ` · ${pull >= 0 ? '+' : '−'}${Math.abs(pull * 1e6).toFixed(1)} ppm` : '';
  sch.text(W / 2, H - 8, `C_L,circ = C_L1·C_L2/(C_L1 + C_L2) + C_s = ${fC(cload)}${off}`, `sch-label ${tone('cload')}`.trim());
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: XtalState, r) => circuit(s, r) },
};

export default mod;
