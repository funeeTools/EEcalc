/** Microstrip Impedance — page module: definition + theory + a cross-section drawing tab. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbLegend, pcbRect } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import { def, type MicrostripState } from './def';
import { theory } from './theory';

/**
 * Proportional-ish cross-section (W and H clamped so extreme ratios still read). Materials come from the
 * shared PCB kit (core/schematic/pcb.ts): copper trace on laminate over a copper ground plane, in air.
 */
function crossSection(s: MicrostripState, report?: CalcReport): SVGSVGElement {
  const sch = new Schematic(460, 250);
  const u = Math.min(Math.max(s.w / s.h, 0.15), 8);
  const hPx = 70;
  const wPx = Math.min(Math.max(u * hPx, 12), 330);
  const tPx = Math.min(Math.max((s.t / s.h) * hPx, s.t > 0 ? 3 : 0), 30);
  const cx = 215;
  const xL = 30;
  const xR = 400;
  // No solution: the solved dimension in the state is stale, so do not label it with a number.
  const failed = !!report && !report.ok;
  const val = (k: MicrostripState['solveFor'], text: string) => (failed && s.solveFor === k ? '—' : text);
  const tone = (k: MicrostripState['solveFor']) => (s.solveFor === k ? (failed ? 'hl' : 'solved') : '');
  const yGround = 178;
  const ySub = yGround - hPx;
  const yTrace = ySub - Math.max(tPx, 1.5);

  pcbRect(sch, 'fr4', xL, ySub, xR - xL, hPx, { layer: 'back' });
  pcbRect(sch, 'cu', xL, yGround, xR - xL, 9, { layer: 'back' });
  pcbRect(sch, 'cu', cx - wPx / 2, yTrace, wPx, Math.max(tPx, 1.5));

  // W above the trace, H at the right edge, T beside the trace.
  sch.dim([cx - wPx / 2, yTrace - 14], [cx + wPx / 2, yTrace - 14], `W = ${val('w', si(s.w, 'm', 4))}`, { tone: tone('w') });
  sch.dim([xR + 16, ySub], [xR + 16, yGround], '', { tone: tone('h') });
  sch.text(xR + 22, (ySub + yGround) / 2 - 2, 'H', `sch-label ${tone('h')}`.trim(), 'start');
  sch.text(xR + 22, (ySub + yGround) / 2 + 12, val('h', si(s.h, 'm', 3)), `sch-value ${tone('h')}`.trim(), 'start');
  sch.text(cx + wPx / 2 + 8, yTrace - 3, `T = ${si(s.t, 'm', 3)}`, 'sch-value sch-halo', 'start');
  sch.text(xL + 10, ySub + 22, `ε_r = ${val('er', String(+s.er.toPrecision(4)))}   tan δ = ${s.tanD}`, `sch-label sch-halo ${tone('er')}`.trim(), 'start');
  sch.text(xL + 10, yGround + 24, 'ground plane', 'sch-hint', 'start');
  sch.text(xL + 10, ySub - 40, 'air (ε_r = 1)', 'sch-hint', 'start');
  const z0 = report?.results.find((r) => r.key === 'z0');
  if (z0) sch.text(xL, 22, `Z₀ = ${failed && s.solveFor === 'z0' ? '—' : z0.display}`, `sch-caption ${tone('z0')}`.trim(), 'start');
  pcbLegend(sch, xL, 236, ['cu', 'fr4']);
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Cross-section', draw: (s: MicrostripState, report: CalcReport) => crossSection(s, report) },
};

export default mod;
