/** RCD Clamp — page module: definition + theory + the flyback primary with its clamp (Circuit tab). */

import type { CalcModule } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import { si } from '@/core/units';
import { drawFlyback } from '../flyback-converter/diagram';
import { type RcdDetails, type RcdState, def } from './def';
import { theory } from './theory';

function circuit(st: RcdState, r: CalcReport): SVGSVGElement {
  const d = r.ok ? (r.details as RcdDetails | undefined) : undefined;
  const warn = (re: RegExp) => r.warnings.some((w) => re.test(w));
  const solvedR = st.solveFor === 'r';
  const vc = d ? d.state.vclamp : solvedR ? NaN : st.vclamp;
  const rv = d ? d.state.r : solvedR ? NaN : st.r;
  const fmt = (v: number, u: string) => (Number.isFinite(v) ? si(v, u, 3) : '—');
  const vdsHl = warn(/^Clamped drain peak/);
  return drawFlyback({
    header: d ? `V_clamp ${fmt(vc, 'V')} = ${(vc / st.vor).toFixed(2)} × V_OR · P_R ${si(d.op.p, 'W', 3)}` : `V_OR ${si(st.vor, 'V', 3)}`,
    headerTone: warn(/^V_clamp is only|^Clamp loss/) ? 'hl' : '',
    vin: `≤ ${si(st.vinMax, 'V', 3)}`,
    xfmr: [`V_OR ${si(st.vor, 'V', 3)}`, `L_lk ${si(st.llk, 'H', 3)}`, `I_pk ${si(st.ipk, 'A', 3)}`],
    cClamp: { label: 'C_cl', value: [d ? si(d.c, 'F', 3) : '—', `V_cl ${fmt(vc, 'V')}`], tone: !solvedR ? 'solved' : '' },
    rClamp: { label: 'R_cl', value: [fmt(rv, 'Ω'), d ? si(d.op.p, 'W', 3) : ''].filter(Boolean), tone: solvedR ? 'solved' : '' },
    dClamp: { label: 'D_cl', value: d ? [`t_s ${si(d.op.ts, 's', 3)}`] : [] },
    fet: { label: 'Q', value: d ? [`V_DS ${si(d.vds, 'V', 3)}`, `of ${si(st.vdss, 'V', 3)}`] : [], tone: vdsHl ? 'hl' : '' },
    dOut: { label: 'D_out', tone: 'muted' },
    cOut: { label: 'C_out', tone: 'muted' },
    out: 'output',
  });
}

const mod: CalcModule = {
  def,
  theory,
  diagram: { title: 'Circuit', draw: (s: RcdState, r) => circuit(s, r) },
};

export default mod;
