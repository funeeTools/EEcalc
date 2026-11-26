/** Smith chart — circuit of the selected L-network: port Z₀ → network → (optional line) → load R + jX. */

import type { CalcReport } from '@/core/calc/types';
import { type Cx, abs, cx } from '@/core/math/complex';
import { Schematic, type Pt } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { SmithState } from './def';
import { type Component, type LMatch, gammaOf, seriesPart, shuntPart } from './model';

const W = 460;
const TOP = 74;
const GND = 200;
const XS = 30; // source
const X1 = 118; // network, source side
const X2 = 208; // network, load side
const LX = 356; // load

const sgn = (v: number) => (v < 0 ? '−' : '+');
const impractical = (c: Component) => (c.kind === 'C' && c.value < 0.5e-12) || (c.kind === 'L' && c.value < 1e-9);

export function smithCircuit(st: SmithState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as { z: Cx | null; zIn: Cx | null; matches: LMatch[] } | undefined) : undefined;
  const w = 2 * Math.PI * st.f;
  // The load: from the report, or straight from R + jX when the report failed.
  const known = d != null || st.specBy === 'z';
  const z: Cx | null = d ? d.z : st.specBy === 'z' ? cx(st.r, st.x) : null;
  const matches = d?.matches ?? [];
  const sel = Math.min(Math.max(Math.round(st.showMatch) - 1, 0), Math.max(matches.length - 1, 0));
  const m = matches[sel];
  const lineOn = st.lineDeg > 0;

  const s = new Schematic(W, GND + 40);
  // source with its reference impedance (context)
  s.source(XS, TOP, GND, { kind: 'ac', tone: 'muted' });
  s.resistor([XS, TOP], [92, TOP], { label: 'Z₀', value: si(st.z0, 'Ω', 4), tone: 'muted' });
  s.wire([[92, TOP], [X1, TOP]]);

  // ── matching network
  if (m) {
    const sp = seriesPart(m.x, w);
    const sh = shuntPart(m.b, w);
    // the box title sits above the tallest part label (a series capacitor's "C" reaches TOP − 40)
    s.box(X1 - 14, TOP - 66, X2 - X1 + 90, GND - TOP + 74, `Match #${sel + 1} of ${matches.length} · ${si(st.f, 'Hz', 4)}`);
    const unit = (c: Component) => (c.kind === 'L' ? 'H' : 'F');
    const opts = (c: Component) => ({ label: c.kind, value: si(c.value, unit(c), 4), tone: impractical(c) ? 'hl' : '' });
    const two = (c: Component, a: Pt, b: Pt) => {
      if (c.kind === 'L') s.inductor(a, b, opts(c));
      else if (c.kind === 'C') s.capacitor(a, b, opts(c));
      else s.wire([a, b]);
    };
    // series element always spans X1 → X2; the shunt sits at the load side (shunt-load) or the source side
    two(sp, [X1, TOP], [X2, TOP]);
    const xs = m.topology === 'shunt-load' ? X2 : X1;
    if (sh.kind !== 'none') {
      two(sh, [xs, TOP], [xs, GND]);
      s.dot(xs, TOP).dot(xs, GND);
    }
    const topo = sp.kind === 'none' ? 'single shunt element' : sh.kind === 'none' ? 'single series element' : m.topology === 'shunt-load' ? 'shunt at the load side, series toward the source' : 'series at the load side, shunt toward the source';
    s.text((XS + LX) / 2 + 20, GND + 30, `${topo}${matches.length > 1 ? ' · all in Tables' : ''}`, 'sch-hint');
  } else {
    s.wire([[X1, TOP], [X2, TOP]]);
    let why = 'no L-section solution';
    if (!known) why = 'load not evaluated';
    else if (!z) why = 'open load: nothing to match';
    else if (z.re <= 0) why = 'lossless load (R = 0) cannot be matched';
    else if (d) {
      const zi = d.zIn ?? z;
      if (abs(zi) < 1e15 && abs(gammaOf(zi, st.z0)) < 1e-4) why = `${lineOn ? 'line input' : 'load'} already matched to Z₀`;
    }
    s.text((X1 + X2) / 2 + 30, (TOP + GND) / 2, 'No matching network', 'sch-caption', 'middle');
    s.text((X1 + X2) / 2 + 30, (TOP + GND) / 2 + 15, why, 'sch-hint', 'middle');
  }

  // ── optional lossless line in front of the load
  if (lineOn) {
    const a = 288;
    const b = 330;
    s.wire([[X2, TOP], [a, TOP]]).wire([[b, TOP], [LX, TOP]]);
    // coax-style cylinder
    s.shape('path', { d: `M ${a} ${TOP - 7} L ${b} ${TOP - 7} A 3.5 7 0 0 1 ${b} ${TOP + 7} L ${a} ${TOP + 7}`, class: 'sch-body', fill: 'var(--sch-fill)' });
    s.shape('ellipse', { cx: a, cy: TOP, rx: 3.5, ry: 7, class: 'sch-body', fill: 'var(--sch-fill)' });
    s.text((a + b) / 2, TOP - 27, `θ ${+st.lineDeg.toFixed(1)}°`, 'sch-label');
    s.text((a + b) / 2, TOP - 14, si(st.zLine, 'Ω', 3), 'sch-value');
  } else s.wire([[X2, TOP], [LX, TOP]]);

  // ── load R + jX (context)
  s.text(LX, TOP - 14, 'Z_L', 'sch-label muted');
  const mid = (TOP + GND) / 2;
  const reac = (a: Pt, b: Pt, x: number) => {
    const o = { label: `X ${sgn(x)}${si(Math.abs(x), 'Ω', 3)}`, value: x > 0 ? si(x / w, 'H', 3) : si(-1 / (w * x), 'F', 3), tone: 'muted' };
    if (x > 0) s.inductor(a, b, o);
    else s.capacitor(a, b, o);
  };
  if (!known) {
    s.wire([[LX, TOP], [LX, TOP + 20]]).wire([[LX, GND - 20], [LX, GND]]);
    s.block(LX - 18, TOP + 20, 36, GND - TOP - 40, { label: 'Z_L', tone: 'muted' });
  } else if (!z) {
    s.wire([[LX, TOP], [LX, mid - 14]]).wire([[LX, mid + 14], [LX, GND]]);
    s.terminal(LX, mid - 14).terminal(LX, mid + 14);
    s.text(LX + 12, mid + 4, 'open', 'sch-label muted', 'start');
  } else if (abs(z) === 0) {
    s.wire([[LX, TOP], [LX, GND]]);
    s.text(LX + 10, mid + 4, 'short', 'sch-label muted', 'start');
  } else {
    const hasR = z.re > 0;
    const hasX = Math.abs(z.im) > 1e-12 * abs(z);
    if (hasR && hasX) {
      s.resistor([LX, TOP], [LX, mid], { label: 'R', value: si(z.re, 'Ω', 4), tone: 'muted' });
      reac([LX, mid], [LX, GND], z.im);
    } else if (hasR) s.resistor([LX, TOP], [LX, GND], { label: 'R', value: si(z.re, 'Ω', 4), tone: 'muted' });
    else reac([LX, TOP], [LX, GND], z.im);
  }
  s.wire([[XS, GND], [LX, GND]]);
  s.wire([[XS, GND], [XS, GND + 6]]).ground(XS, GND + 6);
  return s.svg();
}
