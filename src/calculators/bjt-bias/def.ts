/** BJT bias point — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM } from '@/core/unitsets';
import { nearestE } from '@/core/eseries';
import { BJT_PRESETS, DVBE_DT, dIcdVbe, design, sBeta, solveBias, type Bias, type BiasPoint, type Bjt, type Topology } from './model';

export const ID = 'general/bjt-bias-point';

export interface BjtState {
  solveFor: 'ic' | 'design';
  type: 'npn' | 'pnp';
  topo: Topology;
  vcc: number;
  r1: number;
  r1Unit: string;
  r2: number;
  r2Unit: string;
  rb: number;
  rbUnit: string;
  rc: number;
  rcUnit: string;
  re: number;
  reUnit: string;
  ic: number;
  icUnit: string;
  vce: number;
  ve: number;
  k: number;
  part: string;
  beta: number;
  betaMin: number;
  betaMax: number;
  vbe: number;
  vceSat: number;
  vceo: number;
  icMax: number;
  icMaxUnit: string;
  ptot: number;
  eseries: string;
  /** Polarity at the last compute (kept by sync): lets an NPN↔PNP switch keep the bias */
  prevType?: 'npn' | 'pnp';
}

const U_I: Record<string, number> = { mA: 1e-3, 'µA': 1e-6, A: 1 };
const DEFAULT_PART = '2N3904 (NPN)';

export const defaults = (): BjtState => ({
  solveFor: 'ic',
  type: 'npn',
  topo: 'divider',
  vcc: 12,
  r1: 160e3,
  r1Unit: 'kΩ',
  r2: 33e3,
  r2Unit: 'kΩ',
  rb: 1.5e6,
  rbUnit: 'MΩ',
  rc: 5.6e3,
  rcUnit: 'kΩ',
  re: 1.2e3,
  reUnit: 'kΩ',
  ic: 1e-3,
  icUnit: 'mA',
  vce: 5,
  ve: 1.2,
  k: 10,
  part: DEFAULT_PART,
  beta: 173,
  betaMin: 100,
  betaMax: 300,
  vbe: 0.65,
  vceSat: 0.2,
  vceo: 40,
  icMax: 0.2,
  icMaxUnit: 'mA',
  ptot: 0.625,
  eseries: 'E24',
});

/**
 * An NPN↔PNP switch keeps the bias point: in the NPN frame (model.ts) a PNP exchanges R1 and R2, so they are swapped
 * here and the same currents result (R_C and R_E keep their roles; the drawing mirrors).
 */
function mirror(s: Record<string, any>, to: 'npn' | 'pnp'): void {
  if (s.prevType != null && s.prevType !== to) [s.r1, s.r2, s.r1Unit, s.r2Unit] = [s.r2, s.r1, s.r2Unit, s.r1Unit];
  s.prevType = to;
}

const isDesign = (_s: unknown, r: Record<string, any>) => r.solveFor === 'design';
const isDiv = (_s: unknown, r: Record<string, any>) => r.topo === 'divider';
const rField = (key: string, symbol: string, label: string, min: number, help: string, visible?: (s: any, r: any) => boolean): FieldSpec => ({
  kind: 'number', key, symbol, label, units: U_OHM, unitKey: `${key}Unit`, min, max: 1e9, solvable: true, visible,
  solvedWhen: isDesign, onSolve: (_s, r) => (r.solveFor = 'design'), onUnsolve: (_s, r) => (r.solveFor = 'ic'), help,
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Circuit',
    note: 'Click ◎ on I_C or V_CE to analyse the resistors, or on a resistor to design them for a target.',
    fields: [
      {
        kind: 'select', key: 'type', label: 'Transistor type', options: [{ value: 'npn', label: 'NPN' }, { value: 'pnp', label: 'PNP' }],
        apply: (v, s) => { const p = BJT_PRESETS[s.part]; if (p && p.type !== v) s.part = 'Custom'; mirror(s, v); },
        help: 'PNP is drawn upside down (emitter towards V_CC). Enter magnitudes; the page shows the PNP node voltages and V_CE with their real signs.',
      },
      {
        kind: 'select', key: 'topo', label: 'Bias network',
        options: [{ value: 'divider', label: 'Voltage divider + R_E' }, { value: 'fixed', label: 'Fixed base resistor' }, { value: 'feedback', label: 'Collector feedback' }],
        help: 'Voltage divider: the standard four-resistor bias, stable against β. Fixed: one resistor from V_CC to the base, I_C ∝ β. Collector feedback: R_B from collector to base, which can never saturate.',
      },
      { kind: 'number', key: 'vcc', symbol: 'V_CC', label: 'Supply voltage', unit: 'V', min: 0.5, max: 1000 },
      rField('r1', 'R₁', 'Base resistor to V_CC', 1, 'Upper divider resistor, from the base to the V_CC rail.', isDiv),
      rField('r2', 'R₂', 'Base resistor to ground', 1, 'Lower divider resistor, from the base to ground.', isDiv),
      rField('rb', 'R_B', 'Base resistor', 1, 'Fixed bias: from V_CC (PNP: ground) to the base. Collector feedback: from the collector to the base.', (_s, r) => r.topo !== 'divider'),
      rField('rc', 'R_C', 'Collector resistor', 0, 'Between the collector and the rail opposite the emitter.'),
      rField('re', 'R_E', 'Emitter resistor', 0, 'Emitter degeneration. 0 for none (poor bias stability).'),
    ],
  },
  {
    kind: 'section',
    title: 'Operating point',
    fields: [
      { kind: 'number', key: 'ic', symbol: 'I_C', label: 'Collector current', units: U_I, unitKey: 'icUnit', solvable: true, min: 0, max: 100, onUnsolve: (_s, r) => (r.solveFor = 'design'), help: 'Result of the analysis, or the target when designing the resistors.' },
      { kind: 'number', key: 'vce', symbol: 'V_CE', label: 'Collector–emitter', unit: 'V', solvable: true, min: 0, max: 1000, solvedWhen: (_s, r) => r.solveFor === 'ic', onSolve: (_s, r) => (r.solveFor = 'ic'), onUnsolve: (_s, r) => (r.solveFor = 'design'), help: 'Magnitude (V_EC for a PNP). Mid-supply leaves the most room for signal swing.' },
      { kind: 'number', key: 've', symbol: 'V_E', label: 'Emitter voltage', unit: 'V', min: 0, max: 1000, visible: isDesign, help: 'Design choice: the drop across R_E. About 10 % of V_CC (≥ 1 V) makes I_C nearly independent of V_BE drift. 0 → no R_E.' },
      { kind: 'number', key: 'k', symbol: 'k', label: 'Divider current / I_B', min: 1, max: 1000, visible: (_s, r) => r.solveFor === 'design' && r.topo === 'divider', help: 'Current in the lower divider resistor as a multiple of the base current. 10 is the usual rule; larger is stiffer but loads the signal source more.' },
    ],
  },
  {
    kind: 'section',
    title: 'Transistor',
    fields: [
      {
        kind: 'select', key: 'part', label: 'Part preset', options: Object.keys(BJT_PRESETS),
        apply: (v, s) => {
          const p = BJT_PRESETS[v];
          if (p) mirror(s, p.type);
          if (p) Object.assign(s, { type: p.type, beta: p.beta, betaMin: p.betaMin, betaMax: p.betaMax, vbe: p.vbe, vceSat: p.vceSat, vceo: p.vceo, icMax: p.icMax, ptot: p.ptot });
        },
        help: 'onsemi datasheets. h_FE min/max are the datasheet values at its test current (2N3904/2N3906: 100–300 at 10 mA; at 1 mA the minimum is only 70/80; BC547B/BC557B at 2 mA; 2N2222A: ≥ 75 at 10 mA, ≤ 300 at 150 mA). β (design) is the datasheet typical h_FE where given, else the geometric mean of min and max. V_BE ≈ 0.65 V at about 1 mA (BC557B: 0.62 V typical).',
      },
      { kind: 'number', key: 'beta', symbol: 'β', label: 'Current gain (design)', min: 1, max: 1e5, help: 'h_FE used for the bias point and the design.' },
      { kind: 'number', key: 'betaMin', symbol: 'β_min', label: 'Current gain, min', min: 1, max: 1e5, help: 'Datasheet minimum h_FE: the low end of the spread checked.' },
      { kind: 'number', key: 'betaMax', symbol: 'β_max', label: 'Current gain, max', min: 1, max: 1e5 },
      { kind: 'number', key: 'vbe', symbol: 'V_BE', label: 'Base–emitter voltage', unit: 'V', min: 0.1, max: 2, help: 'Constant forward drop when conducting. Falls about 2 mV/°C.' },
      { kind: 'number', key: 'vceSat', symbol: 'V_CE(sat)', label: 'Saturation voltage', unit: 'V', min: 0, max: 5 },
    ],
  },
  {
    kind: 'section',
    title: 'Ratings',
    collapsed: true,
    fields: [
      { kind: 'number', key: 'vceo', symbol: 'V_CEO', label: 'C–E breakdown', unit: 'V', min: 1, max: 5000 },
      { kind: 'number', key: 'icMax', symbol: 'I_C,max', label: 'Max collector current', units: U_I, unitKey: 'icMaxUnit', min: 1e-6, max: 1000 },
      { kind: 'number', key: 'ptot', symbol: 'P_tot', label: 'Power rating (25 °C)', unit: 'W', min: 1e-3, max: 1000 },
    ],
  },
  {
    kind: 'section',
    title: 'Standard parts',
    fields: [{ kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E48', 'E96'], help: 'IEC 60063 series for the designed resistors (nearest value of each).' }],
  },
];

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fI = (i: number, d = 3) => si(i, 'A', d);
const fV = (v: number, d = 4) => si(v, 'V', d).replace(/^-/, '−');
const fP = (p: number) => si(p, 'W', 3);
const TOPO_NAME: Record<Topology, string> = { divider: 'voltage-divider bias', fixed: 'fixed bias', feedback: 'collector-feedback bias' };

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

/** Circuit in the NPN frame (see model.ts): a PNP exchanges the divider resistors. */
export function frame(s: Pick<BjtState, 'type' | 'topo' | 'vcc' | 'r1' | 'r2' | 'rb' | 'rc' | 're'>): Bias {
  const pnp = s.type === 'pnp';
  return { topo: s.topo, vcc: s.vcc, rHi: pnp ? s.r2 : s.r1, rLo: pnp ? s.r1 : s.r2, rb: s.rb, rc: s.rc, re: s.re };
}

/** Real node voltages (to ground) from NPN-frame values. */
export const actual = (s: { type: string; vcc: number }, v: number) => (s.type === 'pnp' ? s.vcc - v : v);

export function compute(st: BjtState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: BjtState): CalcReport {
  const s: BjtState = { ...st };
  const vcc = finite('Supply voltage', s.vcc);
  const t: Bjt = { beta: finite('β', s.beta), vbe: finite('V_BE', s.vbe), vceSat: finite('V_CE(sat)', s.vceSat) };
  const bMin = finite('β min', s.betaMin);
  const bMax = finite('β max', s.betaMax);
  if (!(vcc > 0) || !(t.beta > 0) || !(t.vbe > 0) || !(t.vceSat >= 0)) throw new Error('V_CC, β and V_BE must be > 0, V_CE(sat) ≥ 0.');
  if (!(bMin > 0) || !(bMax >= bMin)) throw new Error('β min must be > 0 and not above β max.');
  if (!['divider', 'fixed', 'feedback'].includes(s.topo)) throw new Error(`Unknown bias network "${String(s.topo)}".`);
  if (s.type !== 'npn' && s.type !== 'pnp') throw new Error(`Unknown transistor type "${String(s.type)}".`);
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });
  const div = s.topo === 'divider';
  const design0 = s.solveFor === 'design';
  let stdParts: { r1: number; r2: number; rb: number; rc: number; re: number } | null = null;

  if (design0) {
    const ic = finite('Target I_C', s.ic);
    const vce = finite('Target V_CE', s.vce);
    const ve = finite('Emitter voltage', s.ve);
    const k = finite('Divider ratio', s.k);
    if (!(ic > 0)) throw new Error('Target collector current must be > 0.');
    if (!(ve >= 0)) throw new Error('Emitter voltage must be ≥ 0.');
    if (div && !(k > 0)) throw new Error('Divider current ratio must be > 0.');
    const d = design(s.topo, vcc, t, ic, vce, ve, k);
    if (d === 'sat') return fail(`Target V_CE = ${fV(vce, 3)} is at or below V_CE(sat) = ${fV(t.vceSat, 3)}: the transistor would saturate. Choose a larger V_CE.`);
    if (d === 'headroom') return fail(`V_CC = ${fV(vcc, 3)} leaves nothing for R_C: V_CE + V_E = ${fV(vce + ve, 3)}. Lower V_CE or V_E, or raise V_CC.`);
    if (d === 'feedback-vce') return fail(`With collector feedback V_CE = V_CB + V_BE, so it cannot be below V_BE = ${fV(t.vbe, 3)}. Choose V_CE > ${fV(t.vbe, 3)}.`);
    const pnp = s.type === 'pnp';
    if (div) {
      s.r1 = pnp ? d.rLo : d.rHi;
      s.r2 = pnp ? d.rHi : d.rLo;
    } else s.rb = d.rb;
    s.rc = d.rc;
    s.re = d.re;
    const bad = (div ? [['R₁', s.r1], ['R₂', s.r2]] : [['R_B', s.rb]]).concat([['R_C', s.rc], ['R_E', s.re]]).find(([n, v]) => (v as number) > 1e9 || ((n === 'R₁' || n === 'R₂' || n === 'R_B') && (v as number) < 1));
    if (bad) return fail(`${bad[0]} would be ${fR(bad[1] as number)}, outside 1 Ω … 1 GΩ. Check the target current.`);
    const e = (r: number) => (r > 0 ? nearestE(r, s.eseries) : 0);
    stdParts = { r1: div ? e(s.r1) : s.r1, r2: div ? e(s.r2) : s.r2, rb: div ? s.rb : e(s.rb), rc: e(s.rc), re: e(s.re) };
  } else if (s.solveFor === 'ic') {
    for (const [n, v] of [['R₁', s.r1], ['R₂', s.r2], ['R_B', s.rb], ['R_C', s.rc], ['R_E', s.re]] as const) finite(n, v);
    if (div && !(s.r1 > 0 && s.r2 > 0)) throw new Error('R₁ and R₂ must be > 0.');
    if (!div && !(s.rb > 0)) throw new Error('R_B must be > 0.');
    if (!(s.rc >= 0) || !(s.re >= 0)) throw new Error('R_C and R_E must be ≥ 0.');
  } else throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);

  const c = frame(s);
  const p = solveBias(c, t);
  if (!design0) {
    s.ic = p.ic;
    s.vce = p.vce;
  }
  const cStd = stdParts ? frame({ ...s, ...stdParts }) : c;
  const pStd = stdParts ? solveBias(cStd, t) : p;
  // β spread and temperature, evaluated on the circuit as built (standard parts when designing)
  const atBeta = (b: number) => solveBias(cStd, { ...t, beta: b });
  const pLo = atBeta(bMin);
  const pHi = atBeta(bMax);
  const active = pStd.region === 'active';
  const sb = active ? sBeta(cStd, t.beta) : 0;
  const dIcdT = active ? dIcdVbe(cStd, t.beta) * DVBE_DT : 0; // A/°C
  const pd = pStd.vce * pStd.ic + t.vbe * pStd.ib;
  const isup = div ? pStd.ic + (vcc - pStd.vb) / cStd.rHi : pStd.ic + pStd.ib;
  const ratio = div ? ((t.beta + 1) * cStd.re) / p.rbth : NaN; // stiffness of the divider

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const pnp = s.type === 'pnp';
  const sgn = pnp ? -1 : 1;
  const vceSym = 'V_CE';
  const regionTone = pStd.region === 'active' ? '' : 'warn';
  const results: ResultItem[] = [];
  if (design0) {
    if (div) results.push(item('r1', 'Base resistor to V_CC', s.r1, 'Ω', fR(s.r1), { symbol: 'R₁', solved: true, primary: true, note: `${s.eseries}: ${fR(stdParts!.r1, 3)}` }), item('r2', 'Base resistor to ground', s.r2, 'Ω', fR(s.r2), { symbol: 'R₂', solved: true, primary: true, note: `${s.eseries}: ${fR(stdParts!.r2, 3)}` }));
    else results.push(item('rb', 'Base resistor', s.rb, 'Ω', fR(s.rb), { symbol: 'R_B', solved: true, primary: true, note: `${s.eseries}: ${fR(stdParts!.rb, 3)}` }));
    results.push(
      item('rc', 'Collector resistor', s.rc, 'Ω', fR(s.rc), { symbol: 'R_C', solved: true, primary: true, note: `${s.eseries}: ${fR(stdParts!.rc, 3)}` }),
      item('re', 'Emitter resistor', s.re, 'Ω', s.re > 0 ? fR(s.re) : '0 Ω (none)', { symbol: 'R_E', solved: true, primary: true, note: s.re > 0 ? `${s.eseries}: ${fR(stdParts!.re, 3)}` : undefined }),
      item('icStd', `I_C with ${s.eseries} parts`, pStd.ic, 'A', fI(pStd.ic, 4), { symbol: 'I_C', primary: true, tone: regionTone, note: `${vceSym} ${fV(sgn * pStd.vce, 3)} · ${((pStd.ic / s.ic - 1) * 100).toFixed(1)} % from target` }),
    );
  } else {
    results.push(
      item('ic', 'Collector current', p.ic, 'A', fI(p.ic, 4), { symbol: 'I_C', solved: true, primary: true, tone: regionTone, note: `β = ${t.beta}` }),
      item('vce', 'Collector–emitter voltage', p.vce, 'V', fV(sgn * p.vce, 4), { symbol: vceSym, solved: true, primary: true, note: pnp ? 'PNP: collector below emitter' : undefined }),
      item('region', 'Operating region', p.region, '', p.region, { primary: true, tone: regionTone, note: p.region === 'saturation' ? `forced β = ${(p.ic / p.ib).toFixed(1)}` : p.region === 'cutoff' ? 'V_BB ≤ V_BE' : `V_CB = ${fV(p.vce - t.vbe, 3)}` }),
      item('icSpread', 'I_C over the β range', pLo.ic, 'A', `${fI(pLo.ic)} … ${fI(pHi.ic)}`, { symbol: 'I_C', primary: true, note: `β ${bMin}…${bMax}` }),
    );
  }
  const q = pStd;
  const g1 = 'Bias point' + (design0 ? ` (${s.eseries} parts)` : '');
  results.push(
    item('ib', 'Base current', q.ib, 'A', fI(q.ib), { symbol: 'I_B', group: g1 }),
    item('ie', 'Emitter current', q.ie, 'A', fI(q.ie), { symbol: 'I_E', group: g1 }),
    item('vb', 'Base voltage', actual(s, q.vb), 'V', fV(actual(s, q.vb)), { symbol: 'V_B', group: g1, note: 'to ground' }),
    item('veNode', 'Emitter voltage', actual(s, q.ve), 'V', fV(actual(s, q.ve)), { symbol: 'V_E', group: g1 }),
    item('vc', 'Collector voltage', actual(s, q.vc), 'V', fV(actual(s, q.vc)), { symbol: 'V_C', group: g1 }),
    item('vceStd', 'Collector–emitter voltage', sgn * q.vce, 'V', fV(sgn * q.vce), { symbol: vceSym, group: g1 }),
    item('regionStd', 'Region', q.region, '', q.region, { group: g1, tone: regionTone }),
  );
  if (div) {
    results.push(
      item('vbb', 'Thévenin base voltage', actual(s, q.vbb), 'V', fV(actual(s, q.vbb)), { symbol: 'V_BB', group: 'Thévenin base' }),
      item('rbth', 'Thévenin base resistance', q.rbth, 'Ω', fR(q.rbth, 3), { symbol: 'R_B = R₁∥R₂', group: 'Thévenin base' }),
      item('idiv', 'Divider current', vcc / (cStd.rHi + cStd.rLo), 'A', fI(vcc / (cStd.rHi + cStd.rLo)), { group: 'Thévenin base', note: q.ib > 0 ? `${(vcc / (cStd.rHi + cStd.rLo) / q.ib).toFixed(1)} × I_B` : undefined }),
      item('stiff', '(β+1)R_E / R_B', ratio, '', Number.isFinite(ratio) ? ratio.toFixed(2) : '—', { group: 'Thévenin base', note: '≥ 10 for a stiff divider', tone: ratio < 3 ? 'warn' : '' }),
    );
  }
  results.push(
    item('sBeta', 'β sensitivity S_β', sb, '', active ? sb.toFixed(3) : '—', { symbol: 'S_β', group: 'Stability', note: '(ΔI_C/I_C) / (Δβ/β)' }),
    item('icoFactor', 'I_CBO stability factor', active ? (t.beta + 1) * sb : 0, '', active ? ((t.beta + 1) * sb).toFixed(1) : '—', { symbol: 'S', group: 'Stability', note: '∂I_C/∂I_CBO; 1 is ideal, β+1 worst' }),
    item('icLo', 'I_C at β min', pLo.ic, 'A', `${fI(pLo.ic)} (${pLo.region})`, { group: 'Stability', tone: pLo.region === 'active' ? '' : 'warn' }),
    item('icHi', 'I_C at β max', pHi.ic, 'A', `${fI(pHi.ic)} (${pHi.region})`, { group: 'Stability', tone: pHi.region === 'active' ? '' : 'warn' }),
    item('dIcdT', 'Drift from V_BE (−2 mV/°C)', dIcdT, 'A/°C', active ? `${si(dIcdT, 'A', 3)}/°C · ${((dIcdT / q.ic) * 100).toFixed(3)} %/°C` : '—', { group: 'Stability', note: active ? `+${fI(dIcdT * 50)} for +50 °C` : undefined }),
    item('pd', 'Transistor dissipation', pd, 'W', fP(pd), { symbol: 'P_D', group: 'Power', tone: pd > s.ptot ? 'fail' : pd > 0.5 * s.ptot ? 'warn' : '' }),
    item('isupply', 'Supply current', isup, 'A', fI(isup), { symbol: 'I_CC', group: 'Power', note: div ? 'incl. the divider' : undefined }),
  );
  if (design0 && stdParts) {
    results.push(item('vceStdOut', `V_CE with ${s.eseries} parts`, sgn * pStd.vce, 'V', fV(sgn * pStd.vce, 4), { group: 'Standard parts', note: `target ${fV(sgn * s.vce, 3)}` }));
  }
  // Analysis also writes the design choices the circuit embodies (V_E, and the divider current / I_B), so that
  // ◎ on a resistor right after an analysis designs the very same resistors instead of using stale targets.
  if (!design0 && p.region === 'active' && p.ib > 0) {
    if (p.ve >= 0 && p.ve <= 1000) results.push(item('ve', 'Emitter voltage (design form)', p.ve, 'V', fV(p.ve), { symbol: 'V_E', solved: true, group: 'Design form', note: 'drop across R_E' }));
    const k = div ? p.vb / c.rLo / p.ib : NaN;
    if (div && k >= 1 && k <= 1000) results.push(item('k', 'Divider current / I_B', k, '', k.toFixed(2), { symbol: 'k', solved: true, group: 'Design form', note: 'current in the lower resistor' }));
  }
  report.results = results;

  // ── warnings
  if (q.region === 'cutoff') warnings.push(s.topo === 'divider' ? `The divider gives V_BB = ${fV(q.vbb, 3)}, below V_BE = ${fV(t.vbe, 3)}: the transistor is off. Lower R₁ or raise R₂.` : `V_CC = ${fV(vcc, 3)} is below V_BE: the transistor cannot turn on.`);
  if (q.region === 'saturation') warnings.push(`The transistor is saturated (V_CE = V_CE(sat), forced β = ${(q.ic / q.ib).toFixed(1)}), so it cannot amplify. ${s.topo === 'divider' ? 'Lower R₂, raise R₁ or lower R_C.' : 'Raise R_B or lower R_C.'}`);
  else if (q.region === 'active' && q.vce < 1) warnings.push(`V_CE = ${fV(q.vce, 3)} is close to saturation: little room for signal swing. Aim for V_CE near (V_CC − V_E)/2.`);
  if (pLo.region !== q.region || pHi.region !== q.region) warnings.push(`Over the datasheet β range (${bMin}–${bMax}) the transistor moves between regions (${pLo.region} at β min, ${pHi.region} at β max). ${s.topo === 'fixed' ? 'Fixed bias depends directly on β: use the divider + R_E network.' : 'Make the bias stiffer: smaller divider resistors or a larger R_E.'}`);
  else if (q.region === 'active' && pHi.ic > 0 && (pHi.ic - pLo.ic) / q.ic > 0.2) warnings.push(`I_C varies ${(((pHi.ic - pLo.ic) / q.ic) * 100).toFixed(0)} % over the β range ${bMin}–${bMax}. ${s.topo === 'fixed' ? 'Fixed bias makes I_C proportional to β: use the divider + R_E network.' : s.topo === 'feedback' ? 'Make R_B small against (β+1)(R_C + R_E), or add R_E.' : 'Raise (β+1)R_E against R_B: smaller divider resistors or a larger R_E.'}`);
  if (q.region === 'active' && s.topo !== 'feedback' && cStd.re > 0 && q.ve < 0.5) warnings.push(`Only ${fV(q.ve, 3)} across R_E: a 0.1 V shift of V_BE (50 °C) moves I_C by about ${((0.1 / Math.max(q.ve, 1e-6)) * 100).toFixed(0)} %. Aim for V_E ≥ 1 V.`);
  if (cStd.re === 0 && s.topo !== 'feedback') notes.push('No emitter resistor: I_C follows β and V_BE directly. Even 0.1·V_CC across R_E stabilises the bias a lot.');
  if (t.beta < bMin || t.beta > bMax) warnings.push(`The design β = ${t.beta} is outside the datasheet range ${bMin}–${bMax}.`);
  if (vcc > s.vceo) warnings.push(`V_CC = ${fV(vcc, 3)} exceeds V_CEO = ${fV(s.vceo, 3)}: with the transistor off, the collector sees the full supply. Use a higher-voltage part.`);
  if (q.ic > s.icMax || pHi.ic > s.icMax) warnings.push(`I_C up to ${fI(Math.max(q.ic, pHi.ic))} exceeds the ${fI(s.icMax)} rating.`);
  if (pd > s.ptot) warnings.push(`The transistor dissipates ${fP(pd)}, above its ${fP(s.ptot)} rating at 25 °C. Lower I_C or V_CE, or use a power transistor with a heatsink.`);
  else if (pd > 0.5 * s.ptot) warnings.push(`The transistor dissipates ${fP(pd)}, over half its ${fP(s.ptot)} rating at 25 °C ambient: check the derating curve.`);
  if (design0 && pStd.region === 'active' && Math.abs(pStd.ic / s.ic - 1) > 0.05) warnings.push(`With ${s.eseries} parts I_C comes out ${((pStd.ic / s.ic - 1) * 100).toFixed(1)} % from the target. Use a finer series or adjust one resistor.`);
  notes.push(
    'Model: constant V_BE, I_C = β·I_B in the active region, V_CE = V_CE(sat) in saturation; Early effect and leakage (I_CBO) ignored.',
    'h_FE depends on I_C, V_CE and temperature (it rises roughly 0.5–1 %/°C); the β range checked is the datasheet spread at its test current.',
  );
  if (pnp) notes.push('PNP: the page solves magnitudes; node voltages are shown to ground and V_CE with its real (negative) sign.');

  report.summary = `${s.type.toUpperCase()} ${TOPO_NAME[s.topo]} · V_CC ${fV(vcc, 3)} · I_C ${fI(q.ic)} · V_CE ${fV(sgn * q.vce, 3)} · ${q.region}`;
  report.details = { point: p, pointStd: pStd, pLo, pHi, std: stdParts, frame: c, frameStd: cStd, pd, sb };
  report.tables.push(betaTable(cStd, t, bMin, bMax, sgn));
  if (design0 && stdParts) report.tables.push(partsTable(s, stdParts, div));
  report.graphs = graphs(s, cStd, t, q, pLo, pHi, bMin, bMax, sgn);
  return report;
}

function betaTable(c: Bias, t: Bjt, bMin: number, bMax: number, sgn: number): TableSpec {
  const betas = [...new Set([bMin, Math.sqrt(bMin * bMax), t.beta, bMax].map((b) => Math.round(b * 10) / 10))].sort((a, b) => a - b);
  const pts = betas.map((b) => ({ b, p: solveBias(c, { ...t, beta: b }) }));
  return {
    id: 'beta-spread',
    title: 'Bias point across the β spread',
    columns: [
      { key: 'beta', label: 'β' },
      { key: 'ic', label: 'I_C', unit: 'A' },
      { key: 'vce', label: 'V_CE', unit: 'V' },
      { key: 'region', label: 'Region', align: 'left' },
    ],
    rows: pts.map(({ b, p }) => ({ beta: b, ic: p.ic, vce: sgn * p.vce, region: p.region })),
    display: pts.map(({ b, p }) => ({ beta: String(b), ic: fI(p.ic), vce: fV(sgn * p.vce, 3), region: p.region })),
    rowTones: pts.map(({ p }) => (p.region !== 'active' ? 'fail' : p.vce < 1 ? 'warn' : 'pass')),
    note: 'Red: saturated or cut off. Yellow: active but V_CE < 1 V (little swing).',
  };
}

function partsTable(s: BjtState, std: { r1: number; r2: number; rb: number; rc: number; re: number }, div: boolean): TableSpec {
  const rows = (div ? [['R₁', s.r1, std.r1], ['R₂', s.r2, std.r2]] : [['R_B', s.rb, std.rb]]).concat([['R_C', s.rc, std.rc], ['R_E', s.re, std.re]]) as [string, number, number][];
  return {
    id: 'parts',
    title: `Designed resistors and nearest ${s.eseries} values`,
    columns: [
      { key: 'part', label: 'Part', align: 'left' },
      { key: 'exact', label: 'Exact', unit: 'Ω' },
      { key: 'std', label: s.eseries, unit: 'Ω' },
      { key: 'err', label: 'Error' },
    ],
    rows: rows.map(([n, e, v]) => ({ part: n, exact: e, std: v, err: e > 0 ? v / e - 1 : 0 })),
    display: rows.map(([n, e, v]) => ({ part: n, exact: e > 0 ? fR(e, 4) : '0 Ω', std: v > 0 ? fR(v, 3) : '0 Ω', err: e > 0 ? `${((v / e - 1) * 100).toFixed(1)} %` : '—' })),
  };
}

function graphs(s: BjtState, c: Bias, t: Bjt, q: BiasPoint, pLo: BiasPoint, pHi: BiasPoint, bMin: number, bMax: number, sgn: number): GraphSpec[] {
  const out: GraphSpec[] = [];
  const vcc = s.vcc;
  // 1 — DC load line on the output plane: V_CE = V_CC − I_C·(R_C + R_E)·(1 + 1/β) (I_B adds to I_E, and to R_C's current with feedback)
  const rLoad = c.rc + c.re;
  const kb = 1 + 1 / t.beta;
  const rEff = c.topo === 'feedback' ? (c.rc + c.re) * kb : c.rc + c.re * kb;
  if (rLoad > 0) {
    const iMax = vcc / rEff;
    const vs = Array.from({ length: 2 }, (_, k) => k * vcc);
    const yTop = Math.max(iMax, pHi.ic, q.ic) * 1.15;
    const hyp: { x: number[]; y: number[] } = { x: [], y: [] };
    for (let k = 1; k <= 200; k++) {
      const v = (vcc * k) / 200;
      const i = s.ptot / v;
      if (i <= yTop) {
        hyp.x.push(v);
        hyp.y.push(i);
      }
    }
    out.push({
      id: 'load-line',
      title: 'DC load line',
      subtitle: `Q at β ${bMin}, ${t.beta}, ${bMax}`,
      x: { label: s.type === 'pnp' ? 'Emitter–collector voltage |V_CE|' : 'Collector–emitter voltage V_CE', unit: 'V' },
      y: [{ id: 'i', label: 'Collector current', unit: 'A', includeZero: true, min: 0, max: yTop }],
      series: [
        { label: 'Load line', x: vs, y: vs.map((v) => (vcc - v) / rEff), axis: 'i', width: 2.2 },
        // where Q moves over the datasheet β spread (labels on the three close points would collide)
        { label: `Q over β ${bMin}–${bMax}`, x: [pHi.vce, q.vce, pLo.vce], y: [pHi.ic, q.ic, pLo.ic], axis: 'i', width: 5, color: '#c47b17' },
        ...(hyp.x.length > 1 ? [{ label: `P_tot ${fP(s.ptot)}`, x: hyp.x, y: hyp.y, axis: 'i', width: 1.4, dash: [6, 4], color: '#8b1e1e' }] : []),
      ],
      vlines: t.vceSat > 0 ? [{ value: t.vceSat, label: 'V_CE(sat)', color: '#9a8f7a', dash: [3, 3] }] : [],
      markers: [{ x: q.vce, y: q.ic, axis: 'i', label: `Q ${fI(q.ic)}` }],
    });
  }
  // 2 — I_C and V_CE against β
  const b0 = Math.max(1, bMin / 2);
  const b1 = Math.max(bMax * 1.5, t.beta * 1.5);
  const bs = Array.from({ length: 161 }, (_, k) => b0 + ((b1 - b0) * k) / 160);
  const pts = bs.map((b) => solveBias(c, { ...t, beta: b }));
  out.push({
    id: 'ic-beta',
    title: 'Bias vs β',
    subtitle: `${TOPO_NAME[c.topo]}`,
    x: { label: 'Current gain β', unit: '' },
    y: [
      { id: 'i', label: 'Collector current', unit: 'A', includeZero: true },
      { id: 'v', label: s.type === 'pnp' ? '|V_CE|' : 'V_CE', unit: 'V', side: 'right', includeZero: true },
    ],
    series: [
      { label: 'I_C', x: bs, y: pts.map((p) => p.ic), axis: 'i', width: 2.2 },
      { label: s.type === 'pnp' ? '|V_CE|' : 'V_CE', x: bs, y: pts.map((p) => p.vce), axis: 'v', width: 1.6, dash: [5, 3], color: '#c47b17' },
    ],
    vlines: [
      { value: bMin, label: 'β min', color: '#9a8f7a', dash: [4, 3] },
      { value: bMax, label: 'β max', color: '#9a8f7a', dash: [4, 3] },
    ],
    markers: [{ x: t.beta, y: q.ic, axis: 'i', label: fI(q.ic) }],
  });
  void sgn;
  return out;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(b), 1e-12);

export const def: CalcDef<BjtState> = {
  id: ID,
  version: '0.1.0',
  method:
    'DC bias by the constant-V_BE large-signal model (Sedra & Smith, Microelectronic Circuits 7e, §6.5–6.7 and §7.4; Horowitz & Hill, AoE 3e §2.2): Thévenin base network, active region I_C = β·I_B, saturation solved from both loops with V_CE = V_CE(sat), cutoff for V_BB ≤ V_BE; β sensitivity and −2 mV/°C V_BE drift by differentiation; exact design for target I_C, V_CE, V_E and divider current; onsemi datasheet h_FE ranges; IEC 60063 values.',
  fields,
  defaults,
  // Mode-switch harness notes (§12.3): from an active analysis, ◎ design reproduces the same resistors (the analysis
  // writes V_E and k). From a saturated or cut-off analysis no design form exists (the I_C, V_CE written there are not
  // reachable targets with these parts), so those round trips legitimately differ; ◎ after a cut-off analysis
  // (I_C = 0) is the user's explicit request and reports its own error.
  solve: {
    default: 'ic',
    analysis: 'ic',
    options: [
      { key: 'ic', label: 'I_C and V_CE from the resistors' },
      { key: 'design', label: 'Resistors for a target I_C and V_CE' },
    ],
  },
  compute,
  sync: (s) => {
    s.prevType = s.type;
    const p = BJT_PRESETS[s.part];
    if (p && !(p.type === s.type && near(s.beta, p.beta) && near(s.betaMin, p.betaMin) && near(s.betaMax, p.betaMax) && near(s.vbe, p.vbe) && near(s.vceSat, p.vceSat) && near(s.vceo, p.vceo) && near(s.icMax, p.icMax) && near(s.ptot, p.ptot))) s.part = 'Custom';
  },
  examples: [
    { id: 'divider-2n3904', label: '2N3904 divider bias on 12 V (160k/33k, 5.6k/1.2k)', state: defaults() },
    { id: 'design-1ma', label: 'Design: 2N3904 at 1 mA, V_CE 5 V on 12 V (V_E 1.2 V, divider 10 × I_B)', state: { ...defaults(), solveFor: 'design', ic: 1e-3, vce: 5, ve: 1.2, k: 10 } },
    {
      id: 'sedra-divider',
      label: 'Textbook: V_CC 15 V, 100k/50k, R_E 3k, R_C 5k, β 100 (Sedra & Smith)',
      state: { ...defaults(), solveFor: 'ic', part: 'Custom', type: 'npn', topo: 'divider', vcc: 15, r1: 100e3, r1Unit: 'kΩ', r2: 50e3, r2Unit: 'kΩ', rc: 5e3, rcUnit: 'kΩ', re: 3e3, reUnit: 'kΩ', beta: 100, betaMin: 50, betaMax: 200, vbe: 0.7, vceSat: 0.2 },
    },
    {
      id: 'pnp-9v',
      label: 'PNP: BC557B on a 9 V battery, designed for 0.5 mA',
      state: { ...defaults(), ...presetState('BC557B (PNP)'), solveFor: 'design', topo: 'divider', vcc: 9, ic: 0.5e-3, vce: 4, ve: 0.9, k: 10, r1Unit: 'kΩ', r2Unit: 'kΩ', rcUnit: 'kΩ', reUnit: 'kΩ' },
    },
    {
      id: 'feedback',
      label: 'Collector feedback: 2N3904, R_B 330k, R_C 4.7k on 9 V',
      state: { ...defaults(), solveFor: 'ic', topo: 'feedback', vcc: 9, rb: 330e3, rbUnit: 'kΩ', rc: 4.7e3, rcUnit: 'kΩ', re: 0, reUnit: 'Ω' },
    },
    {
      id: 'fixed-sat',
      label: 'Fixed bias 100k / 4.7k on 12 V: saturates for typical β',
      state: { ...defaults(), solveFor: 'ic', topo: 'fixed', vcc: 12, rb: 100e3, rbUnit: 'kΩ', rc: 4.7e3, rcUnit: 'kΩ', re: 0, reUnit: 'Ω' },
    },
  ],
};

function presetState(name: string): Partial<BjtState> {
  const p = BJT_PRESETS[name]!;
  return { part: name, type: p.type, beta: p.beta, betaMin: p.betaMin, betaMax: p.betaMax, vbe: p.vbe, vceSat: p.vceSat, vceo: p.vceo, icMax: p.icMax, ptot: p.ptot };
}
