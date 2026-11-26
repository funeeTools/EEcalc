/** Delta–wye conversion — page module: definition + theory + the two networks side by side. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { type Pt, Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { type Br, type DyState, def, fmtZ } from './def';
import type { C } from './model';
import { theory } from './theory';

/** Short value text: 3 significant digits, so complex values fit beside the branches. */
function short(z: C | null, kind: 'r' | 'z'): string {
  if (!z) return '—';
  if (!Number.isFinite(z.re)) return 'open';
  return kind === 'r' ? si(z.re, 'Ω', 4) : fmtZ(z, 3);
}

function circuit(s: DyState, r: CalcReport): SVGSVGElement {
  const d = (r.ok ? r.details : null) as { inp: Record<Br, C>; out: Record<Br, C> } | null;
  const sch = new Schematic(460, 252);
  const zOf = (b: Br): C | null => (d ? (d.inp[b] ?? d.out[b]) : s.kind === 'r' && typeof s[`r${b}`] === 'number' ? { re: s[`r${b}`], im: 0 } : null);
  const toneOf = (b: Br) => {
    const given = (b.length === 2) === (s.given === 'delta');
    if (given) return '';
    const z = zOf(b);
    return d && z && z.re < -1e-9 * Math.hypot(z.re, z.im) ? 'hl' : 'solved';
  };
  const part = (a: Pt, b: Pt, br: Br) => {
    const tone = toneOf(br);
    const z = zOf(br);
    if (z && !Number.isFinite(z.re)) {
      // open branch (opposite a zero star arm): two stubs with a gap
      const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      sch.wire([a, at(0.4)], tone).wire([at(0.6), b], tone);
      return;
    }
    if (s.kind === 'r') {
      sch.resistor(a, b, { tone });
      return;
    }
    // generic impedance: a box along the branch
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const cx = (a[0] + b[0]) / 2;
    const cy = (a[1] + b[1]) / 2;
    const h = 17;
    sch.wire([a, [cx - ux * h, cy - uy * h]], tone).wire([[cx + ux * h, cy + uy * h], b], tone);
    sch.shape('rect', { x: -h, y: -6.5, width: 2 * h, height: 13, rx: 1.5, class: `sch-block ${tone}`.trim(), transform: `translate(${cx},${cy}) rotate(${(Math.atan2(uy, ux) * 180) / Math.PI})` });
  };
  const label = (x: number, y: number, br: Br, anchor: 'start' | 'middle' | 'end') => {
    const tone = toneOf(br);
    sch.text(x, y, `${s.kind === 'r' ? 'R' : 'Z'}_${br}`, `sch-label ${tone}`.trim(), anchor);
    sch.text(x, y + 16, short(zOf(br), s.kind), `sch-value ${tone}`.trim(), anchor);
  };

  // ── delta: A top, B bottom-left, C bottom-right
  const A: Pt = [130, 40];
  const B: Pt = [58, 182];
  const Cn: Pt = [202, 182];
  part(A, B, 'AB');
  part(Cn, A, 'CA');
  part(B, Cn, 'BC');
  label(78, 100, 'AB', 'end');
  label(182, 100, 'CA', 'start');
  label(130, 206, 'BC', 'middle');
  // ── wye: A top, B bottom-left, C bottom-right, star point N
  const yA: Pt = [352, 40];
  const yB: Pt = [282, 182];
  const yC: Pt = [422, 182];
  const N: Pt = [352, 128];
  part(N, yA, 'A');
  part(N, yB, 'B');
  part(N, yC, 'C');
  sch.dot(N[0], N[1]);
  sch.text(N[0] + 10, N[1] + 4, 'N', 'sch-pin', 'start');
  label(366, 76, 'A', 'start');
  label(282, 206, 'B', 'middle');
  label(452, 206, 'C', 'end');

  // node terminals with their letters
  for (const [p, t, anchor, dx, dy] of [
    [A, 'A', 'middle', 0, -10],
    [B, 'B', 'end', -9, 4],
    [Cn, 'C', 'start', 9, 4],
    [yA, 'A', 'middle', 0, -10],
    [yB, 'B', 'end', -9, 4],
    [yC, 'C', 'start', 9, 4],
  ] as [Pt, string, 'start' | 'middle' | 'end', number, number][]) {
    sch.terminal(p[0], p[1]);
    sch.text(p[0] + dx, p[1] + dy, t, 'sch-label', anchor);
  }

  // direction arrow between the networks
  const fwd = s.given === 'delta';
  sch.arrow(fwd ? [228, 44] : [262, 44], fwd ? [262, 44] : [228, 44], { tone: 'solved' });
  sch.text(245, 30, fwd ? 'Δ → Y' : 'Y → Δ', 'sch-caption', 'middle');
  sch.text(130, 244, 'Delta (Δ)', 'sch-hint');
  sch.text(352, 244, s.kind === 'z' ? `Wye (Y) · at ${si(s.f, 'Hz', 3)}` : 'Wye (Y)', 'sch-hint');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: DyState, r) => circuit(s, r) },
};

export default mod;
