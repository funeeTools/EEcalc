/** Thermal-resistance ladder junction → case → interface (+ layers) → heatsink → ambient (Diagram tab). */

import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import type { HeatsinkState } from './def';
import type { StackOutputs } from './model';

const W = 400;
const COL = 150;
const Y0 = 66;
/** Up to this many extra layers are drawn one by one; more are summed into one resistor. */
const MAX_LAYERS = 4;

const degC = (t: number) => `${t.toFixed(1)} °C`;
const cw = (x: number) => `${x.toPrecision(3)} °C/W`;
const short = (t: string, n = 14) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

interface Row {
  sym: string;
  theta: number | null;
  /** extra text after ΔT */
  note?: string;
  tone?: string;
  /** label override (e.g. "θ_SA > 1e4 °C/W") */
  text?: string;
}

export function heatsinkDiagram(st: HeatsinkState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as StackOutputs | undefined) : undefined;
  const solved = st.solveFor;
  const res = r.results.find((x) => x.key === solved && x.solved);
  const solvedNum = typeof res?.value === 'number' ? res.value : NaN;
  const n = Math.max(1, Math.round(st.n));
  const p = solved === 'p' ? solvedNum : st.p;
  const thetaSA = solved === 'thetaSA' ? solvedNum : st.thetaSA;
  const over = d != null && d.tj > st.tjMax + 1e-9;
  const noSink = r.status?.text === 'NO HEATSINK NEEDED';

  // node temperatures from the junction down (details.nodes runs from the ambient up)
  const temps = d ? [...d.nodes].reverse().map((x) => x.t) : [];
  const dTs = d ? [...d.nodes].reverse().map((x) => x.dT) : [];

  // series resistors, top to bottom
  const rows: Row[] = [
    { sym: 'θ_JC', theta: st.thetaJC },
    { sym: 'θ_CS', theta: st.thetaCS, note: 'interface' },
  ];
  const nl = st.layers.length;
  let nodeIdx: number[]; // which detail node sits above each drawn row (+ ambient at the end)
  if (nl <= MAX_LAYERS) {
    st.layers.forEach((l) => rows.push({ sym: 'θ', theta: l.theta, note: short(l.name || 'layer') }));
    nodeIdx = rows.map((_, i) => i);
  } else {
    rows.push({ sym: 'Σθ', theta: st.layers.reduce((a, l) => a + l.theta, 0), note: `${nl} layers` });
    nodeIdx = [0, 1, 2];
  }
  const saTone = solved === 'thetaSA' ? (noSink ? 'muted' : 'solved') : '';
  const saText = solved === 'thetaSA' && !Number.isFinite(thetaSA) ? `θ_SA ${res?.display ?? '—'}` : undefined;
  rows.push({ sym: 'θ_SA', theta: Number.isFinite(thetaSA) ? thetaSA : null, tone: saTone, text: saText, note: noSink ? 'no heatsink needed' : n > 1 ? `n·P ${Number.isFinite(p) ? si(n * p, 'W', 3) : '—'}` : 'heatsink' });
  nodeIdx.push(temps.length - 2); // heatsink node above θSA
  const last = temps.length - 1;

  // ΔT across a drawn row: sum of the detail rows it covers
  const dTof = (k: number): number | null => {
    if (!d) return null;
    if (k === rows.length - 1) return dTs[last - 1];
    if (nl > MAX_LAYERS && k === 2) return dTs.slice(2, 2 + nl).reduce((a, b) => a + b, 0);
    return dTs[nodeIdx[k]];
  };

  const R = rows.length;
  const pitch = R <= 4 ? 58 : 48;
  const yA = Y0 + R * pitch;
  const s = new Schematic(W, yA + 34);

  // heat source at the junction
  const pTone = solved === 'p' ? 'solved' : '';
  const pText = solved === 'p' ? (Number.isFinite(p) ? si(p, 'W', 3) : (res?.display ?? '—')) : si(st.p, 'W', 3);
  s.block(COL - 62, 10, 124, 28, { label: `P ${pText}${n > 1 ? ` × ${n}` : ''}`, tone: pTone });
  s.arrow([COL, 38], [COL, Y0 - 4], { tone: pTone });

  // the ladder
  rows.forEach((row, k) => {
    const y1 = Y0 + k * pitch;
    const y2 = y1 + pitch;
    const dT = dTof(k);
    const label = row.text ?? `${row.sym} ${row.theta != null ? cw(row.theta) : '—'}`;
    const value = [dT != null ? `ΔT ${degC(dT)}` : '', row.note].filter(Boolean).join(' · ');
    s.resistor([COL, y1], [COL, y2], { label, value, tone: row.tone, body: Math.min(36, pitch - 16) });
  });

  // node temperatures on the left
  const tjTone = solved === 'tj' ? 'solved' : over ? 'hl' : '';
  const nodeText = (k: number): [string, string, string] => {
    const t = (i: number) => (d ? degC(temps[i]) : '—');
    if (k === 0) return ['T_J', solved === 'tj' ? t(0) : degC(st.tj), tjTone];
    if (k === 1) return ['T_C', t(1), ''];
    if (k === R) {
      const ta = solved === 'ta' ? (Number.isFinite(solvedNum) ? degC(solvedNum) : (res?.display ?? '—')) : degC(st.ta);
      return ['T_A', ta, solved === 'ta' ? 'solved' : ''];
    }
    if (k === R - 1) return ['T_S', d ? degC(temps[last - 1]) : '—', ''];
    return ['', d ? degC(temps[nodeIdx[k]]) : '—', ''];
  };
  for (let k = 0; k <= R; k++) {
    const y = Y0 + k * pitch;
    const [name, t, tone] = nodeText(k);
    if (k < R) s.dot(COL, y);
    s.text(COL - 14, y + 4, name ? `${name} ${t}` : t, `${name ? 'sch-label' : 'sch-value'} ${tone}`.trim(), 'end');
  }
  s.wire([[COL, yA], [COL, yA + 8]]).ground(COL, yA + 8);
  if (over) s.text(COL - 14, Y0 + 19, `> T_J,max ${st.tjMax.toFixed(0)} °C`, 'sch-value hl', 'end');
  else if (solved !== 'tj') s.text(COL - 14, Y0 + 19, 'target', 'sch-hint', 'end');

  // heat flow
  const xh = W - 26;
  s.arrow([xh, Y0], [xh, yA], { dashed: true });
  s.text(xh, Y0 - 10, 'heat', 'sch-hint');
  return s.svg();
}
