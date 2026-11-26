/** RC Snubber — page module: definition, theory and the ringing loop with the snubber across the switch. */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { Schematic } from '@/core/schematic/schematic';
import { si } from '@/core/units';
import { def, parasitics, type SnubState } from './def';
import type { Parasitics } from './model';
import { theory } from './theory';

const W = 460;
const H = 250;

function diagram(st: SnubState, r: CalcReport): SVGSVGElement {
  const det = r.ok ? (r.details as { parasitics: Parasitics; state: SnubState; peak: number } | undefined) : undefined;
  let par: Parasitics | undefined = det?.parasitics;
  if (!par) {
    try {
      const p = parasitics(st);
      par = Number.isFinite(p.z0) && p.z0 > 0 ? p : undefined;
    } catch {
      par = undefined;
    }
  }
  const ss = det?.state;
  const sv = st.solveFor;
  const sch = new Schematic(W, H);
  const yT = 62;
  const yB = 214;
  const xS = 36;
  const xN = 214; // switch node column
  const xCp = 292;
  const xSn = 368;

  // source and the loop inductance
  sch.source(xS, yT, yB, { kind: 'step', tone: 'muted' });
  sch.text(xS, yT - 10, `V ${si(st.v, 'V', 3)}`, 'sch-label');
  sch.wire([[xS, yT], [92, yT]]);
  sch.inductor([92, yT], [168, yT], { label: 'L_p', value: par ? si(par.lp, 'H', 3) : '—' });
  sch.wire([[168, yT], [xSn, yT]]);
  sch.text(xN - 4, yT - 10, det ? `V_pk ${si(st.v * det.peak, 'V', 3)}` : 'V_pk —', `sch-label ${det && det.peak - 1 > 0.6 ? 'hl' : ''}`.trim(), 'middle');

  // the ringing switch and its capacitance
  if (st.dev === 'diode') {
    sch.diode([xN, 160], [xN, 116], { label: 'D', tone: 'muted' });
    sch.wire([[xN, yT], [xN, 116]]).wire([[xN, 160], [xN, yB]]);
  } else {
    const q = sch.mosfet(xN - 10, 138, { tone: 'muted' });
    sch.wire([[xN, yT], q.d]).wire([q.s, [xN, yB]]);
  }
  sch.capacitor([xCp, yT], [xCp, yB], { label: 'C_p', value: par ? si(par.cp, 'F', 3) : '—', tone: 'muted' });
  sch.dot(xN, yT).dot(xCp, yT);

  // the snubber: R_s in series with C_s
  const tR = sv === 'pr' ? '' : 'solved';
  const tC = sv === 'pr' ? '' : 'solved';
  const rs = ss ? ss.rs : sv === 'pr' ? st.rs : NaN;
  const cs = ss ? ss.cs : sv === 'pr' ? st.cs : NaN;
  const yM = (yT + yB) / 2;
  sch.resistor([xSn, yT], [xSn, yM], { label: 'R_s', value: Number.isFinite(rs) ? si(rs, 'Ω', 3) : '—', tone: tR });
  sch.capacitor([xSn, yM], [xSn, yB], { label: 'C_s', value: Number.isFinite(cs) ? si(cs, 'F', 3) : '—', tone: tC });
  sch.wire([[xS, yB], [xSn, yB]]);
  sch.dot(xN, yB).dot(xCp, yB);
  sch.wire([[120, yB], [120, yB + 8]]).ground(120, yB + 8);

  // what the measurement gave
  const z0 = par ? `Z₀ ${si(par.z0, 'Ω', 3)}` : 'Z₀ —';
  const meas = st.method === 'two' ? `f₀ ${si(st.f0, 'Hz', 3)} → ${si(st.f1, 'Hz', 3)} with C_add ${si(st.cAdd, 'F', 3)}` : `f₀ ${par ? si(par.f0, 'Hz', 3) : '—'}`;
  sch.text(W / 2, 20, `${meas} · ${z0}`, 'sch-hint', 'middle');
  const pTone = sv === 'cs' ? '' : 'solved';
  sch.text(xSn - 14, yB + 26, ss ? `P_R ${si(ss.pr, 'W', 3)}` : 'P_R —', `sch-label ${pTone}`.trim(), 'middle');
  return sch.svg();
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: SnubState, r) => diagram(s, r) },
};

export default mod;
