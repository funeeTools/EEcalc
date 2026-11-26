/** Op-Amp Bandwidth — page module: def + theory + the stage schematic with its bandwidth figures and the cascade. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type BwState, def } from './def';
import { noiseGainOf } from './model';
import { theory } from './theory';

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function circuit(st: BwState, r: CalcReport): SVGSVGElement {
  const s: BwState = (r.ok && (r.details?.state as BwState)) || st;
  const d = r.ok ? (r.details as { fpbw: number; bwStage: number; stage: { pm: number; order: number } }) : null;
  const tone = (k: BwState['solveFor']) => (s.solveFor === k ? 'solved' : '');
  const q = (v: number, solved: boolean, f: (x: number) => string) => ((solved && !r.ok) || !ok(v) ? '?' : f(v));
  const g = (x: number) => `${+x.toPrecision(4)}`;
  const sch = new Schematic(460, 280);
  const inv = s.config === 'inv';
  const p = sch.amp(220, 120, { size: 70, opamp: true });
  const xN = 160;
  const yF = 50;
  const xO = 290;
  const ratio = inv ? s.gain : s.gain - 1;
  sch.wire([[xN, p.inN[1]], p.inN]).wire([[xN, p.inN[1]], [xN, yF]]);
  const follower = !inv && ok(ratio) && ratio === 0;
  if (follower) sch.wire([[xN, yF], [xO, yF]]).text((xN + xO) / 2, yF - 10, 'follower', 'sch-hint');
  else sch.resistor([xN, yF], [xO, yF], { label: 'R_f', value: ok(ratio) && (!tone('gain') || r.ok) ? `${g(ratio)}·R_in` : '?', tone: tone('gain') });
  sch.wire([[xO, yF], [xO, 120]]).wire([p.out, [315, 120]]).dot(xO, 120).dot(xN, p.inN[1]);
  sch.terminal(315, 120).text(315, 141, 'V_out', 'sch-label');
  if (inv) {
    sch.resistor([40, p.inN[1]], [xN, p.inN[1]], { label: 'R_in' });
    sch.terminal(40, p.inN[1]).text(40, p.inN[1] + 22, 'V_in', 'sch-label', 'start');
    sch.wire([[170, p.inP[1]], p.inP]).wire([[170, p.inP[1]], [170, p.inP[1] + 22]]).ground(170, p.inP[1] + 22);
  } else {
    if (!follower) {
      sch.resistor([xN, p.inN[1]], [70, p.inN[1]], { label: 'R_in' });
      sch.wire([[70, p.inN[1]], [70, p.inN[1] + 10]]).ground(70, p.inN[1] + 10);
    }
    sch.wire([[40, p.inP[1]], p.inP]).terminal(40, p.inP[1]).text(40, p.inP[1] + 22, 'V_in', 'sch-label', 'start');
  }
  sch.text(220, 182, `G = ${inv ? '−' : '+'}${q(s.gain, !!tone('gain'), g)} · NG = ${q(noiseGainOf(s.config, s.gain), !!tone('gain'), g)}`, `sch-value ${tone('gain')}`.trim());
  // figures that set the bandwidth, right column
  const x = 342;
  const lines: [string, string][] = [
    [`GBW ${q(s.gbw, !!tone('gbw'), (v) => si(v, 'Hz', 3))}`, tone('gbw')],
    [`SR ${q(s.sr, !!tone('sr'), (v) => `${+(v / 1e6).toPrecision(3)} V/µs`)}`, tone('sr')],
    [`f_−3dB ${q(s.bw, !!tone('bw'), (v) => si(v, 'Hz', 3))}`, tone('bw')],
    [`f_FP ${d && ok(d.fpbw) ? si(d.fpbw, 'Hz', 3) : '?'}`, d && d.fpbw < s.bw ? 'hl' : ''],
  ];
  if (d && d.stage.order === 2 && ok(d.stage.pm)) lines.push([`φ_m ${d.stage.pm.toFixed(0)}°`, d.stage.pm < 45 ? 'hl' : '']);
  lines.forEach(([t, c], i) => sch.text(x, 36 + i * 16, t, `sch-value ${c}`.trim(), 'start'));
  // cascade of n identical stages
  const n = Math.max(1, Math.round(s.stages));
  const shown = Math.min(n, 5);
  const y = 222;
  const x0 = 70;
  const dx = 64;
  if (n > 1) {
    sch.wire([[x0 - 34, y], [x0 + (shown - 1) * dx + (n > 5 ? 40 : 0) + 40, y]]);
    for (let i = 0; i < shown; i++) sch.amp(x0 + i * dx, y, { size: 30 });
    if (n > 5) sch.text(x0 + 5 * dx - 22, y - 8, '…', 'sch-label');
    sch.text(36, y - 26, `${n} stages in cascade`, 'sch-hint', 'start');
  }
  if (r.ok && d && n > 1) {
    const tot = s.gain ** n;
    sch.text(36, y + 33, `total gain ${(20 * Math.log10(tot)).toFixed(1)} dB${n > 1 ? ` (${n} × ${g(s.gain)} V/V)` : ''}`, 'sch-value', 'start');
    sch.text(36, y + 48, n > 1 ? `f_−3dB ${si(s.bw, 'Hz', 3)} (one stage: ${si(d.bwStage, 'Hz', 3)})` : `f_−3dB ${si(s.bw, 'Hz', 3)}`, `sch-value ${tone('bw')}`.trim(), 'start');
  }
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: BwState, r) => circuit(s, r) },
};

export default mod;
