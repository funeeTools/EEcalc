/** Radio link sketch: Tx and Rx antennas d apart at f, path loss, and (optionally) the Friis link budget. */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { FsplState } from './def';
import { C0 } from './model';

interface Details {
  fspl: number;
  lambda: number;
  fraunhofer: number;
  link: { eirpDbm: number; prDbm: number; marginDb: number } | null;
}

// 5 digits in km, as in the results (4 turned the GEO example's 35 786 km into "35790 km"); no e-notation
const fmtDist = (m: number) => (m < 1e3 ? si(m, 'm', 4) : m < 1e8 ? `${+(m / 1e3).toPrecision(5)} km` : `${Math.round(m / 1e3).toLocaleString('en-US')} km`);
const db = (v: number) => `${+v.toFixed(2)}`.replace('-', '−');

export function fsplDiagram(s: FsplState, r: CalcReport): SVGSVGElement | null {
  if (!(s.d > 0) || !(s.f > 0)) return null;
  const linkMode = !!s.link;
  const H = linkMode ? 252 : 206;
  const sch = new Schematic(440, H);
  const res = r.results.find((x) => x.key === s.solveFor && x.solved);
  const failed = !r.ok || (res != null && res.value == null);
  const tone = (k: string) => (k === s.solveFor ? (failed ? 'hl' : 'solved') : '');
  const shown = (k: string, txt: string) => (k === s.solveFor && failed ? '—' : txt);
  const det = r.ok && !failed ? (r.details as Details | undefined) : undefined;
  const lambda = C0 / s.f;

  // ── frequency
  sch.text(20, 22, `f = ${shown('f', si(s.f, 'Hz', 4))}`, `sch-label ${tone('f')}`.trim(), 'start');
  sch.text(420, 22, `λ = ${si(lambda, 'm', 3)}`, 'sch-hint', 'end');

  // ── antennas, radios and the path
  const xt = 70;
  const xr = 370;
  const yf = 112;
  const ctx = linkMode ? '' : 'muted';
  for (const [x, name] of [[xt, 'Tx'], [xr, 'Rx']] as const) {
    sch.antenna(x, yf);
    sch.wire([[x, yf], [x, 118]]);
    sch.block(x - 26, 118, 52, 26, { label: name, tone: ctx });
  }
  sch.arrow([104, 72], [336, 72], { dashed: true });
  const lfs = det ? det.fspl : s.fspl;
  sch.text(220, 60, `L_fs = ${shown('fspl', `${lfs.toFixed(2)} dB`)}`, `sch-label ${tone('fspl')}`.trim());
  if (linkMode) {
    sch.text(88, 100, `G_t = ${db(s.gt)} dBi`, 'sch-value', 'start');
    sch.text(352, 100, `G_r = ${db(s.gr)} dBi`, 'sch-value', 'end');
  }

  // ── distance
  const yd = 166;
  for (const x of [xt, xr]) sch.shape('line', { x1: x, y1: 148, x2: x, y2: yd + 4, class: 'sch-dim' });
  sch.dim([xt, yd], [xr, yd], `d = ${shown('d', fmtDist(s.d))}`, { tone: tone('d') });

  // ── link budget
  let y = yd + 26;
  if (linkMode) {
    const lk = det?.link;
    const short = lk != null && lk.marginDb < s.margin;
    const noLink = lk != null && lk.marginDb < 0;
    sch.text(20, y, `P_t = ${db(s.pt)} dBm`, 'sch-label', 'start');
    if (lk) sch.text(20, y + 14, `EIRP ${db(lk.eirpDbm)} dBm`, 'sch-value', 'start');
    sch.text(220, y, `L_o = ${db(s.loss)} dB`, 'sch-label');
    sch.text(220, y + 14, 'other losses', 'sch-hint');
    sch.text(420, y, `P_r = ${lk ? `${db(lk.prDbm)} dBm` : '—'}`, `sch-label ${noLink ? 'hl' : ''}`.trim(), 'end');
    sch.text(420, y + 14, `sensitivity ${db(s.sens)} dBm`, 'sch-value', 'end');
    sch.text(420, y + 28, `margin ${lk ? `${db(lk.marginDb)} dB` : '—'} (need ${db(s.margin)})`, `sch-value ${short ? 'hl' : ''}`.trim(), 'end');
    y += 50;
  }

  // ── far-field check
  const dl = s.d / lambda;
  if (det) {
    const ff = det.fraunhofer;
    if (dl < 10) sch.text(20, y, `d = ${dl.toPrecision(3)} λ: near field, Friis does not hold`, 'sch-value hl', 'start');
    else if (ff > 0) sch.text(20, y, `far field beyond 2D²/λ = ${fmtDist(ff)} (D = ${si(s.ant, 'm', 3)})`, s.d < ff ? 'sch-value hl' : 'sch-hint', 'start');
  }
  return sch.svg();
}
