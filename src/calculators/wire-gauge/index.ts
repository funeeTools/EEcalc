/** Wire Gauge — page module: def + theory + a to-scale conductor cross-section. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { pcbShape } from '@/core/schematic/pcb';
import { si } from '@/core/units';
import { def, type WireState } from './def';
import { IEC_SIZES, areaOf, awgDiameter, awgFromDiameter, awgLabel, diameterOf } from './model';
import { theory } from './theory';

/**
 * The conductor with a thinner and a thicker standard neighbour, all on one scale, plus a scale bar.
 * Copper uses the shared copper material; aluminium the plain silver-grey ('solder') fill of the same kit.
 */
function section(st: WireState, r: CalcReport): SVGSVGElement {
  const s: WireState = (r.ok && (r.details?.state as WireState)) || st;
  const d = (r.ok ? (r.details?.d as number) : NaN) || (s.given === 'awg' ? awgDiameter(s.awg) : s.given === 'mm2' ? diameterOf(s.area) : s.d);
  const W = 440;
  const H = 262;
  const sch = new Schematic(W, H);
  if (!(d > 0) || !Number.isFinite(d)) {
    sch.text(W / 2, H / 2, 'enter a size', 'sch-hint');
    return sch.svg();
  }

  // neighbours: ±2 AWG, the adjacent IEC 60228 sizes, or the AWG sizes bracketing a typed diameter. Only real sizes:
  // above 4/0 the next one is 250 kcmil; past 56 AWG or outside 0.5 … 300 mm² the neighbour is left out.
  type Nb = { d: number; name: string } | null;
  const KCMIL250 = Math.sqrt(250e3) * 25.4e-6; // 250 kcmil: (d/mil)² = 250 000
  const awgNb = (n: number): Nb => (n < -3 ? (KCMIL250 > d * 1.001 ? { d: KCMIL250, name: '250 kcmil' } : null) : n > 56 ? null : { d: awgDiameter(n), name: `${awgLabel(n)} AWG` });
  let thin: Nb;
  let thick: Nb;
  const name = s.given === 'awg' ? `${awgLabel(s.awg)} AWG` : s.given === 'mm2' ? `${Number((areaOf(d) * 1e6).toPrecision(3))} mm²` : `⌀ ${si(d, 'm', 3)}`;
  if (s.given === 'awg') {
    thin = awgNb(s.awg + 2);
    thick = awgNb(s.awg - 2);
  } else if (s.given === 'mm2') {
    const a = areaOf(d) * 1e6;
    const lo = [...IEC_SIZES].reverse().find((x) => x < a * (1 - 1e-6));
    const hi = IEC_SIZES.find((x) => x > a * (1 + 1e-6));
    thin = lo != null ? { d: diameterOf(lo * 1e-6), name: `${lo} mm²` } : null;
    thick = hi != null ? { d: diameterOf(hi * 1e-6), name: `${hi} mm²` } : null;
  } else {
    const n = awgFromDiameter(d);
    thin = awgNb(Math.floor(n + 1e-9) + 1);
    thick = awgNb(Math.ceil(n - 1e-9) - 1);
  }

  // one scale for all: the thickest drawn is 130 px across
  const k = 130 / Math.max(d, thick?.d ?? 0, thin?.d ?? 0); // px per metre
  const cy = 112;
  const mat = s.material === 'al' ? 'solder' : 'cu';
  const solved = s.solveFor === 'size';
  const fail = r.ok && r.warnings.some((w) => /exceeds the NEC|cannot get this current/.test(w));
  const xs = [72, 206, 350];
  const items = [thin ? { ...thin, main: false } : null, { d, name, main: true }, thick ? { ...thick, main: false } : null];
  items.forEach((it, i) => {
    if (!it) return;
    const rad = Math.max((it.d * k) / 2, 1.5);
    const x = xs[i];
    pcbShape(sch, mat, 'circle', { cx: x, cy, r: rad }, { tone: it.main ? (fail ? 'hl' : solved ? 'solved' : '') : '' });
    const ty = cy + 65 + 18;
    const t = it.main ? (fail ? 'hl' : solved ? 'solved' : '') : 'muted';
    sch.text(x, ty, it.name, `sch-label ${t}`.trim());
    sch.text(x, ty + 14, `⌀ ${si(it.d, 'm', 3)}`, `sch-value ${it.main ? '' : 'muted'}`.trim());
    const third = s.given === 'mm2' ? `≈ ${awgLabel(Number(awgFromDiameter(it.d).toFixed(1)))} AWG` : `${Number((areaOf(it.d) * 1e6).toPrecision(3))} mm²`;
    sch.text(x, ty + 28, third, `sch-value ${it.main ? '' : 'muted'}`.trim());
  });
  // diameter dimension over the main conductor
  const rm = (d * k) / 2;
  sch.dim([xs[1] - rm, cy - rm - 12], [xs[1] + rm, cy - rm - 12], `d ${si(d, 'm', 4)}`, { tone: solved ? 'solved' : '' });

  // scale bar: a round length 50–110 px long
  const target = 80 / k;
  const p = 10 ** Math.floor(Math.log10(target));
  const len = [1, 2, 5, 10].map((m) => m * p).find((v) => v * k >= 50) ?? 10 * p;
  const bx = W - 16 - len * k;
  const by = H - 14;
  sch.shape('path', { d: `M ${bx} ${by - 4} L ${bx} ${by} L ${bx + len * k} ${by} L ${bx + len * k} ${by - 4}`, class: 'sch-dim', fill: 'none' });
  sch.text(bx + (len * k) / 2, by - 7, si(len, 'm', 3), 'sch-hint');
  sch.text(12, H - 12, `${s.material === 'al' ? 'Aluminium' : 'Copper'} · to scale`, 'sch-hint', 'start');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Cross-section', draw: (s, r) => section(s as WireState, r) },
};
export default mod;
