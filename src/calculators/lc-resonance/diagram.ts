/** LC Resonance — live circuit drawing: series RLC loop, or parallel tank (L + r_L ‖ C ‖ R_p). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { LcState } from './def';

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function lcCircuit(s: LcState, r: CalcReport): SVGSVGElement {
  const series = s.topology === 'series';
  const solve = s.solveFor;
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));
  const res = (k: string) => r.results.find((i) => i.key === k);
  // the solved L or C is only in the results; when the inputs fail, the unknown is shown as '?'
  const valueOf = (k: 'f0' | 'l' | 'c'): number => (solve === k ? (r.ok ? (k === 'f0' ? (r.details?.f0 as number) : (res(k)?.value as number)) : NaN) : s[k]);
  const fmt = (v: number, unit: string) => (ok(v) ? si(v, unit, 4) : '?');
  const tone = (k: string, hl = false) => (hl ? 'hl' : solve === k ? 'solved' : '');
  const lossyHl = warn(/^r_L ≥/) || warn(/no resonant maximum/);

  const W = 430;
  const top = 60;
  const gnd = 200;
  const xs = 60;
  const sch = new Schematic(W, 262);

  if (series) {
    const xc = 330;
    sch.source(xs, top, gnd, { kind: 'ac', label: 'V_in' });
    sch.resistor([xs, top], [170, top], { label: 'R', value: si(s.rs, 'Ω', 3) });
    sch.inductor([170, top], [xc, top], { label: 'L', value: fmt(valueOf('l'), 'H'), tone: tone('l', warn(/^L = /)) });
    sch.capacitor([xc, top], [xc, gnd], { label: 'C', value: fmt(valueOf('c'), 'F'), tone: tone('c', warn(/^C = /)) });
    sch.wire([[xs, gnd], [xc, gnd]]);
    sch.text((xs + xc) / 2, (top + gnd) / 2 + 4, 'series loop: |Z| = R at f₀', 'sch-hint');
  } else {
    const xl = 170;
    const xc = 260;
    const xp = 350;
    const hasRp = s.rp != null;
    const xr = hasRp ? xp : xc;
    sch.source(xs, top, gnd, { kind: 'ac', label: 'I' });
    sch.text(xs - 26, (top + gnd) / 2 + 17, 'drive', 'sch-hint', 'end');
    sch.wire([[xs, top], [xr, top]]).wire([[xs, gnd], [xr, gnd]]);
    const ym = (top + gnd) / 2;
    sch.inductor([xl, top], [xl, ym], { label: 'L', value: fmt(valueOf('l'), 'H'), tone: tone('l', warn(/^L = /)) });
    sch.resistor([xl, ym], [xl, gnd], { label: 'r_L', value: si(s.rl, 'Ω', 3), tone: lossyHl ? 'hl' : '' });
    sch.capacitor([xc, top], [xc, gnd], { label: 'C', value: fmt(valueOf('c'), 'F'), tone: tone('c', warn(/^C = /)) });
    sch.dot(xl, top).dot(xl, gnd);
    if (hasRp) {
      sch.resistor([xp, top], [xp, gnd], { label: 'R_p', value: si(s.rp!, 'Ω', 3) });
      sch.dot(xc, top).dot(xc, gnd);
    }
  }
  sch.wire([[xs, gnd], [xs, gnd + 6]]).ground(xs, gnd + 6);

  // f₀ and Q from the report
  const f0 = valueOf('f0');
  const q = res('q');
  const xa = series ? 215 : 245;
  sch.text(xa, gnd + 30, `f₀ ${fmt(f0, 'Hz')}`, `sch-label ${tone('f0', warn(/^f₀ = /))}`.trim(), 'end');
  sch.text(xa + 16, gnd + 30, `Q ${r.ok && q ? q.display : '?'}`, `sch-label ${lossyHl ? 'hl' : ''}`.trim(), 'start');
  const z0 = r.ok ? (r.details?.z0 as number) : NaN;
  if (ok(z0)) sch.text(xa + 16, gnd + 45, `Z₀ ${si(z0, 'Ω', 3)}`, 'sch-value', 'start');
  return sch.svg();
}
