/** Zener shunt regulator — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_OHM } from '@/core/unitsets';
import { bracketE, ratingFor } from '@/core/eseries';
import { ZENER_PRESETS, ilMaxFor, lineReg, opPoint, outputResistance, rForIzMin, vz0, type OpPoint, type ZenerParams } from './model';

export const ID = 'general/zener-diode';

export interface ZenerState {
  solveFor: 'r' | 'ilMax' | 'izMin';
  vinMin: number;
  vinMax: number;
  ilMin: number;
  ilMinUnit: string;
  ilMax: number;
  ilMaxUnit: string;
  izMin: number;
  izMinUnit: string;
  r: number;
  rUnit: string;
  part: string;
  vz: number;
  tol: number;
  izt: number;
  iztUnit: string;
  rz: number;
  rzUnit: string;
  pd: number;
  izk: number | null;
  izkUnit: string;
  eseries: string;
}

const U_I: Record<string, number> = { mA: 1e-3, 'µA': 1e-6, A: 1 };
const DEFAULT_PART = '1N4733A 5.1 V';

export const defaults = (): ZenerState => ({
  solveFor: 'r',
  vinMin: 10.8,
  vinMax: 13.2,
  ilMin: 0,
  ilMinUnit: 'mA',
  ilMax: 20e-3,
  ilMaxUnit: 'mA',
  izMin: 5e-3,
  izMinUnit: 'mA',
  r: 230,
  rUnit: 'Ω',
  part: DEFAULT_PART,
  vz: 5.1,
  tol: 5,
  izt: 49e-3,
  iztUnit: 'mA',
  rz: 7,
  rzUnit: 'Ω',
  pd: 1.3,
  izk: 1e-3,
  izkUnit: 'mA',
  eseries: 'E24',
});

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Supply and load',
    note: 'V_in → R → V_out; the zener and the load hang from V_out. Click ◎ to choose the unknown.',
    fields: [
      { kind: 'number', key: 'vinMin', symbol: 'V_in,min', label: 'Input, lowest', unit: 'V', min: 0.1, max: 1000, help: 'Lowest input voltage, e.g. the bottom of the ripple on an unregulated supply. Sets R: the zener must still get I_Z,min here at full load.' },
      { kind: 'number', key: 'vinMax', symbol: 'V_in,max', label: 'Input, highest', unit: 'V', min: 0.1, max: 1000, help: 'Highest input voltage. Sets the worst-case zener and resistor dissipation.' },
      { kind: 'number', key: 'ilMin', symbol: 'I_L,min', label: 'Load current, min', units: U_I, unitKey: 'ilMinUnit', min: 0, max: 1000, help: 'Lightest load. At no load the zener absorbs the whole resistor current, which is its worst dissipation.' },
      { kind: 'number', key: 'ilMax', symbol: 'I_L,max', label: 'Load current, max', units: U_I, unitKey: 'ilMaxUnit', solvable: true, min: 0, max: 1000, help: 'Heaviest load. Solve for it (◎) to find how much load a given resistor can carry while the zener stays in regulation.' },
      { kind: 'number', key: 'r', symbol: 'R', label: 'Series resistor', units: U_OHM, unitKey: 'rUnit', solvable: true, min: 0.01, max: 1e9 },
      { kind: 'number', key: 'izMin', symbol: 'I_Z,min', label: 'Min zener current', units: U_I, unitKey: 'izMinUnit', solvable: true, min: 0, max: 1000, help: 'Smallest zener current you accept at the worst corner (◎: the worst-corner current of the R and load entered; 0 means the regulator drops out). Keep it well above the datasheet knee current I_ZK, and preferably near 10–25 % of I_ZT, where r_z is close to its datasheet value.' },
    ],
  },
  {
    kind: 'section',
    title: 'Zener diode',
    fields: [
      {
        kind: 'select',
        key: 'part',
        label: 'Part preset',
        options: Object.keys(ZENER_PRESETS),
        apply: (v, s) => {
          const p = ZENER_PRESETS[v];
          if (p) Object.assign(s, { vz: p.vz, tol: Math.round(p.tol * 1e4) / 100, izt: p.izt, rz: p.rz, pd: p.pd, izk: p.izk });
        },
        help: '1N47xxA (DO-41, ±5 %): Vishay 1N4728A–1N4761A datasheet. BZX84C (SOT-23): onsemi BZX84C2V4LT1 series, I_ZT = 5 mA, tolerance from the wider side of its V_Z min/max columns (conservative: C3V3 is 3.1–3.5 V, taken as ±6.06 %). r_z is the datasheet maximum Z_ZT.',
      },
      { kind: 'number', key: 'vz', symbol: 'V_Z', label: 'Zener voltage at I_ZT', unit: 'V', min: 0.5, max: 400 },
      { kind: 'number', key: 'tol', symbol: 'tol', label: 'Voltage tolerance', suffix: '%', min: 0, max: 30, help: '±5 % for the A-suffix 1N47xx and the C-grade BZX84. The page designs R with the highest V_Z and checks power at both ends of the band.' },
      { kind: 'number', key: 'izt', symbol: 'I_ZT', label: 'Test current', units: U_I, unitKey: 'iztUnit', min: 1e-6, max: 100 },
      { kind: 'number', key: 'rz', symbol: 'r_z', label: 'Dynamic resistance', units: U_OHM, unitKey: 'rzUnit', min: 0, max: 1e5, help: 'Small-signal (incremental) resistance Z_ZT at I_ZT from the datasheet. It is much larger near the knee (Z_ZK at I_ZK).' },
      { kind: 'number', key: 'pd', symbol: 'P_D', label: 'Power rating', unit: 'W', min: 1e-3, max: 100, help: 'Datasheet power dissipation at 25 °C. It falls with temperature (e.g. 1N47xx: 1.3 W only with the leads held at ambient 4 mm from the body), so the page also warns above half of it.' },
      { kind: 'number', key: 'izk', symbol: 'I_ZK', label: 'Knee current', units: U_I, unitKey: 'izkUnit', optional: true, zeroHint: 'not checked', min: 1e-7, max: 10, help: 'Datasheet knee test current (I_ZK, I_ZT2). Below it the zener barely regulates. Leave blank to skip the check.' },
    ],
  },
  {
    kind: 'section',
    title: 'Standard part',
    fields: [{ kind: 'select', key: 'eseries', label: 'Preferred values', options: ['E12', 'E24', 'E48', 'E96'], help: 'IEC 60063 series. When solving for R the page takes the next standard value down, so the zener current only rises.' }],
  },
];

const fR = (r: number, d = 4) => si(r, 'Ω', d);
const fI = (i: number, d = 3) => si(i, 'A', d);
const fV = (v: number, d = 4) => si(v, 'V', d);
const fP = (p: number) => si(p, 'W', 3);
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export interface Corner extends OpPoint {
  vin: number;
  il: number;
  /** −1: V_Z at the bottom of its tolerance band, 0 nominal, +1 top */
  k: -1 | 0 | 1;
  pz: number;
  pr: number;
}

export function compute(st: ZenerState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: ZenerState): CalcReport {
  const s: ZenerState = { ...st };
  const vinMin = finite('Lowest input voltage', s.vinMin);
  const vinMax = finite('Highest input voltage', s.vinMax);
  const ilMin = finite('Minimum load current', s.ilMin);
  const analysis = s.solveFor === 'izMin';
  let izMin = analysis ? 0 : finite('Minimum zener current', s.izMin);
  const p: ZenerParams = { vz: finite('Zener voltage', s.vz), izt: finite('Test current', s.izt), rz: finite('Dynamic resistance', s.rz), tol: finite('Tolerance', s.tol) / 100 };
  const pd = finite('Power rating', s.pd);
  const izk = s.izk == null ? null : finite('Knee current', s.izk);
  if (!(vinMin > 0) || !(vinMax > 0)) throw new Error('Input voltages must be > 0.');
  if (vinMax < vinMin) throw new Error(`The highest input (${fV(vinMax)}) is below the lowest (${fV(vinMin)}). Swap them.`);
  if (!(ilMin >= 0)) throw new Error('Minimum load current must be ≥ 0.');
  // I_Z,min = 0 (e.g. left by the analysis of a dropped-out design) designs for the very edge of regulation; it is
  // allowed, and the knee warning below says why it is a poor choice.
  if (!(izMin >= 0)) throw new Error('Minimum zener current must be ≥ 0.');
  if (!(p.vz > 0) || !(p.izt > 0) || !(p.rz >= 0) || !(p.tol >= 0) || !(pd > 0)) throw new Error('Zener voltage, test current and power rating must be > 0; r_z and tolerance ≥ 0.');
  const v0hi = vz0(p, 1);
  const v0lo = vz0(p, -1);
  if (!(v0lo > 0)) throw new Error(`r_z·I_ZT = ${fV(p.rz * p.izt, 3)} is not much smaller than V_Z: the linear zener model does not apply. Check r_z and I_ZT.`);
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });
  const vzHiAtMin = v0hi + p.rz * izMin; // highest zener voltage at I_Z,min

  let rUse: number;
  let rExact: number;
  let ilMax: number;
  if (s.solveFor === 'r') {
    ilMax = finite('Maximum load current', s.ilMax);
    if (!(ilMax >= ilMin)) throw new Error(`Maximum load (${fI(ilMax)}) is below the minimum (${fI(ilMin)}).`);
    rExact = rForIzMin(vinMin, ilMax, izMin, v0hi, p.rz);
    if (!(rExact > 0)) return fail(`V_in,min = ${fV(vinMin)} is not above the zener voltage at I_Z,min (up to ${fV(vzHiAtMin)} with the +${(p.tol * 100).toFixed(1)} % tolerance), so no resistor can regulate. Raise the input or use a lower-voltage zener.`);
    if (rExact > 1e9) return fail(`R would be ${fR(rExact)}: more than 1 GΩ. Check the currents.`);
    if (rExact < 0.01) return fail(`R would be ${fR(rExact)}: under 10 mΩ. A shunt zener cannot supply this load; use a series regulator.`);
    s.r = rExact;
    rUse = bracketE(s.eseries, rExact)[0];
  } else if (s.solveFor === 'ilMax') {
    rUse = rExact = finite('Series resistor', s.r);
    if (!(rUse > 0)) throw new Error('Series resistor must be > 0.');
    ilMax = ilMaxFor(vinMin, rUse, izMin, v0hi, p.rz);
    const rMax = rForIzMin(vinMin, ilMin, izMin, v0hi, p.rz);
    if (!(ilMax >= ilMin)) {
      const fix = rMax > 0 ? `use R ≤ ${fR(rMax, 3)}` : `raise V_in,min above ${fV(vzHiAtMin)}`;
      return fail(`With R = ${fR(rUse)} the zener current at V_in,min falls below I_Z,min = ${fI(izMin)} even at the minimum load ${fI(ilMin)}: ${fix}, or lower I_Z,min.`);
    }
    if (ilMax > 1000) return fail(`The maximum load would be ${fI(ilMax)}: more than 1 kA. Check R.`);
    s.ilMax = ilMax;
  } else if (analysis) {
    rUse = rExact = finite('Series resistor', s.r);
    ilMax = finite('Maximum load current', s.ilMax);
    if (!(rUse > 0)) throw new Error('Series resistor must be > 0.');
    if (!(ilMax >= ilMin)) throw new Error(`Maximum load (${fI(ilMax)}) is below the minimum (${fI(ilMin)}).`);
  } else {
    throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  }

  // ── every corner of the operating range: Vin × load × zener tolerance
  const ks: (-1 | 0 | 1)[] = p.tol > 0 ? [-1, 1] : [0];
  const corners: Corner[] = [];
  for (const vin of vinMax > vinMin ? [vinMin, vinMax] : [vinMin])
    for (const il of ilMax > ilMin ? [ilMin, ilMax] : [ilMin])
      for (const k of ks) {
        const o = opPoint(vin, il, rUse, vz0(p, k), p.rz);
        corners.push({ ...o, vin, il, k, pz: o.vout * o.iz, pr: (vin - o.vout) ** 2 / rUse });
      }
  const max = (f: (c: Corner) => number) => Math.max(...corners.map(f));
  const min = (f: (c: Corner) => number) => Math.min(...corners.map(f));
  const izLo = min((c) => c.iz);
  const izHi = max((c) => c.iz);
  const pzMax = max((c) => c.pz);
  const prMax = max((c) => c.pr);
  const voutLo = min((c) => c.vout);
  const voutHi = max((c) => c.vout);
  const anyOff = corners.some((c) => !c.on || c.iz <= 0);
  if (analysis) {
    if (izLo > 1000) return fail(`The zener would carry ${fI(izLo)} even at the worst corner: over 1 kA. Check R.`);
    // a rounding residue of a cancelled difference (V_in − V_Z0 − R·I_L) is a zero current, not 1e-18 A
    izMin = s.izMin = izLo < 1e-12 * Math.max(...corners.map((c) => c.ir)) ? 0 : izLo;
  }
  const vinMid = (vinMin + vinMax) / 2;
  const nom = opPoint(vinMid, ilMin, rUse, vz0(p, 0), p.rz);
  const line = lineReg(rUse, p.rz);
  const rout = outputResistance(rUse, p.rz);
  const effOf = (c: Corner) => (c.ir > 0 ? (c.vout * c.il) / (c.vin * c.ir) : 0);
  const full = corners.filter((c) => c.il === ilMax);
  const effBest = Math.max(...full.map(effOf));
  const effWorst = Math.min(...full.map(effOf));
  const rRating = ratingFor(2 * prMax);
  const [rBelow, rAbove] = bracketE(s.eseries, rExact);

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const pzTone = pzMax > pd ? 'fail' : pzMax > 0.5 * pd ? 'warn' : '';
  const results: ResultItem[] = [];
  if (s.solveFor === 'r') {
    results.push(
      item('r', 'Series resistor', rExact, 'Ω', fR(rExact), { symbol: 'R', solved: true, primary: true, note: `exact: I_Z = ${fI(izMin)} at V_in,min, I_L,max` }),
      item('rStd', `${s.eseries} resistor`, rUse, 'Ω', fR(rUse, 3), { symbol: 'R', primary: true, note: `next value down · I_Z ≥ ${fI(izLo)}` }),
    );
  } else if (s.solveFor === 'ilMax') {
    results.push(item('ilMax', 'Maximum load current', ilMax, 'A', fI(ilMax, 4), { symbol: 'I_L,max', solved: true, primary: true, note: `I_Z = ${fI(izMin)} at V_in,min` }));
  } else {
    results.push(item('izMin', 'Zener current, worst corner', izMin, 'A', fI(izMin, 4), { symbol: 'I_Z,min', solved: true, primary: true, tone: anyOff ? 'fail' : '', note: anyOff ? 'out of regulation' : 'V_in,min, I_L,max, top of V_Z band' }));
  }
  results.push(
    item('pzMax', 'Zener power, worst case', pzMax, 'W', fP(pzMax), { symbol: 'P_Z,max', primary: true, tone: pzTone, note: `${pct(pzMax / pd, 0)} of ${fP(pd)} · at V_in,max, I_L,min` }),
    item('prMax', 'Resistor power, worst case', prMax, 'W', fP(prMax), { symbol: 'P_R,max', primary: true, note: rRating ? `use a ≥ ${si(rRating, 'W')} part (2× margin)` : 'over 10 W: use a series regulator' }),
  );
  results.push(
    item('voutRange', 'Output voltage range', voutLo, 'V', `${fV(voutLo)} … ${fV(voutHi)}`, { symbol: 'V_out', group: 'Regulation', note: 'all corners, incl. V_Z tolerance' }),
    item('voutNom', 'Output, nominal', nom.vout, 'V', fV(nom.vout), { symbol: 'V_out', group: 'Regulation', note: `V_in ${fV(vinMid, 3)}, I_L,min, nominal V_Z` }),
    item('lineReg', 'Line regulation', line, 'V/V', `${(line * 1e3).toPrecision(3)} mV/V`, { symbol: 'ΔV_out/ΔV_in', group: 'Regulation', note: 'r_z / (R + r_z)' }),
    item('dvLine', 'Output change over V_in range', line * (vinMax - vinMin), 'V', fV(line * (vinMax - vinMin), 3), { group: 'Regulation' }),
    item('rout', 'Output resistance (load reg.)', rout, 'Ω', fR(rout, 3), { symbol: 'R ∥ r_z', group: 'Regulation', note: 'ΔV_out per ΔI_L' }),
    item('dvLoad', 'Output change over load range', -rout * (ilMax - ilMin), 'V', fV(-rout * (ilMax - ilMin), 3), { group: 'Regulation' }),
    item('izRange', 'Zener current range', izLo, 'A', `${fI(izLo)} … ${fI(izHi)}`, { symbol: 'I_Z', group: 'Currents and power', tone: anyOff ? 'fail' : izLo < izMin * (1 - 1e-9) ? 'warn' : '' }),
    item('izMax', 'Zener current, max', izHi, 'A', fI(izHi), { symbol: 'I_Z,max', group: 'Currents and power', note: `rating allows ${fI(pd / (p.vz * (1 + p.tol)))}` }),
    item('irMax', 'Supply current, max', max((c) => c.ir), 'A', fI(max((c) => c.ir)), { symbol: 'I_R', group: 'Currents and power' }),
    item('pzPct', 'Zener power / rating', pzMax / pd, '', pct(pzMax / pd, 0), { group: 'Currents and power', tone: pzTone }),
    item('eff', 'Efficiency at full load', effBest, '', `${pct(effWorst, 0)} … ${pct(effBest, 0)}`, { symbol: 'η', group: 'Currents and power', note: 'P_load / P_in over the V_in range' }),
  );
  if (s.solveFor === 'r') {
    results.push(
      item('rBelow', `${s.eseries} value below`, rBelow, 'Ω', fR(rBelow, 3), { group: 'Standard values', note: 'used' }),
      item('rAbove', `${s.eseries} value above`, rAbove, 'Ω', fR(rAbove, 3), { group: 'Standard values', note: rAbove > rExact * (1 + 1e-9) ? 'too large: I_Z would fall below I_Z,min' : 'exact match' }),
    );
  }
  report.results = results;

  // ── warnings
  if (pzMax > pd) warnings.push(`The zener dissipates up to ${fP(pzMax)} at V_in,max with the lightest load, more than its ${fP(pd)} rating. Use a higher-power zener, narrow the input range, raise I_L,min, or let the zener drive an emitter follower instead.`);
  else if (pzMax > 0.5 * pd) warnings.push(`The zener dissipates up to ${fP(pzMax)}, ${pct(pzMax / pd, 0)} of its 25 °C rating. Ratings fall with temperature (see the datasheet derating curve): aim for about half, or use a larger part.`);
  // With R solved (rounded down) or I_L,max solved every corner keeps I_Z ≥ I_Z,min; the analysis option can drop out.
  if (anyOff) warnings.push(`At some corner the zener current reaches zero, so the output drops out of regulation (V_out falls to ${fV(voutLo)}). Lower R or the load.`);
  else if (izLo < izMin * (1 - 1e-9)) warnings.push(`The zener current falls to ${fI(izLo)}, below I_Z,min = ${fI(izMin)}. Lower R or the load.`);
  if (anyOff) {
    /* the dropout warning above says it all */
  } else if (izk != null && izMin < izk) warnings.push(`I_Z,min = ${fI(izMin)} is below the datasheet knee current I_ZK = ${fI(izk)}: there the zener barely regulates. Raise I_Z,min.`);
  else if (izMin < 0.1 * p.izt) warnings.push(`I_Z,min = ${fI(izMin)} is under 10 % of I_ZT = ${fI(p.izt)}. Near the knee r_z is several times its datasheet value, so the real output at the low corner sits below the straight-line model.`);
  if (izHi > 3 * p.izt) warnings.push(`The zener current reaches ${fI(izHi)}, over 3× I_ZT. Self-heating then shifts V_Z by its temperature coefficient; check the datasheet V_Z vs I_Z curve.`);
  if (line > 0.05) warnings.push(`Line regulation is poor: ${pct(line, 0)} of any input change reaches the output (r_z = ${fR(p.rz, 3)} is not small against R = ${fR(rUse, 3)}). A larger R with a higher input, a lower-r_z part, or an IC reference regulates better.`);
  if (prMax > 2) warnings.push(`The resistor dissipates up to ${fP(prMax)}: a shunt regulator wastes power at light load. For more than a few tens of milliamps use a series (linear or switching) regulator.`);
  if (s.solveFor === 'r' && rUse < rExact * 0.85) notes.push(`The next ${s.eseries} value down is ${pct(1 - rUse / rExact, 0)} below the exact R; a finer series wastes less current.`);
  notes.push(
    'Zener modelled as V_Z0 + r_z·I_Z (straight line through the datasheet point V_Z at I_ZT with slope r_z); temperature coefficient and self-heating are not modelled.',
    'Load modelled as a current sink between I_L,min and I_L,max. V_Z tolerance is a fixed ±band around the nominal voltage.',
  );
  report.summary = `${fV(vinMin, 3)} … ${fV(vinMax, 3)} → ${fV(p.vz, 3)} zener · R ${fR(rUse, 3)} · I_L up to ${fI(ilMax)} · P_Z ≤ ${fP(pzMax)}`;
  report.details = { rExact, rUse, ilMax, corners, izLo, izHi, pzMax, prMax, voutLo, voutHi, nom, v0hi, v0lo, line, rout, pd };
  report.tables.push(cornerTable(corners, izMin, pd));
  report.graphs = graphs(s, p, rUse, ilMax, izMin, pd, vinMin, vinMax, ilMin);
  return report;
}

function cornerTable(corners: Corner[], izMin: number, pd: number): TableSpec {
  const tolName = (k: number) => (k < 0 ? 'low' : k > 0 ? 'high' : 'nom');
  return {
    id: 'corners',
    title: 'Worst-case corners',
    columns: [
      { key: 'vin', label: 'V_in', unit: 'V' },
      { key: 'il', label: 'I_L', unit: 'A' },
      { key: 'vz', label: 'V_Z band', align: 'left' },
      { key: 'vout', label: 'V_out', unit: 'V' },
      { key: 'iz', label: 'I_Z', unit: 'A' },
      { key: 'pz', label: 'P_Z', unit: 'W' },
      { key: 'pr', label: 'P_R', unit: 'W' },
    ],
    rows: corners.map((c) => ({ vin: c.vin, il: c.il, vz: tolName(c.k), vout: c.vout, iz: c.iz, pz: c.pz, pr: c.pr })),
    display: corners.map((c) => ({ vin: fV(c.vin, 4), il: fI(c.il), vz: tolName(c.k), vout: fV(c.vout, 4), iz: fI(c.iz), pz: fP(c.pz), pr: fP(c.pr) })),
    rowTones: corners.map((c) => (!c.on || c.iz <= 0 || c.pz > pd ? 'fail' : c.iz < izMin * (1 - 1e-9) || c.pz > 0.5 * pd ? 'warn' : 'pass')),
    note: 'Red: zener out of regulation (I_Z = 0) or over its power rating. Yellow: I_Z below I_Z,min, or over half the power rating.',
  };
}

function graphs(s: ZenerState, p: ZenerParams, r: number, ilMax: number, izMin: number, pd: number, vinMin: number, vinMax: number, ilMin: number): GraphSpec[] {
  const v0 = vz0(p, 0);
  // 1 — output and zener current against the input voltage, at the two load extremes
  const x1 = Math.max(vinMax * 1.25, vinMin + 1);
  const vs = Array.from({ length: 241 }, (_, k) => (x1 * k) / 240);
  const at = (il: number) => vs.map((v) => opPoint(v, il, r, v0, p.rz));
  const lo = at(ilMin);
  const hi = at(ilMax);
  const opLo = opPoint(vinMin, ilMax, r, v0, p.rz);
  const g1: GraphSpec = {
    id: 'vout-vin',
    title: 'Output vs input voltage',
    subtitle: `R = ${fR(r, 3)}, nominal V_Z`,
    x: { label: 'Input voltage', unit: 'V' },
    y: [
      { id: 'v', label: 'Output voltage', unit: 'V', includeZero: true },
      { id: 'i', label: 'Zener current', unit: 'A', side: 'right', includeZero: true },
    ],
    series: [
      { label: `V_out, I_L ${fI(ilMin)}`, x: vs, y: lo.map((o) => o.vout), axis: 'v', width: 2.2 },
      ...(ilMax > ilMin ? [{ label: `V_out, I_L ${fI(ilMax)}`, x: vs, y: hi.map((o) => o.vout), axis: 'v', width: 2.2, color: '#c47b17' }] : []),
      { label: `I_Z, I_L ${fI(ilMin)}`, x: vs, y: lo.map((o) => o.iz), axis: 'i', width: 1.4, dash: [5, 3], color: '#4f8a8b' },
      ...(ilMax > ilMin ? [{ label: `I_Z, I_L ${fI(ilMax)}`, x: vs, y: hi.map((o) => o.iz), axis: 'i', width: 1.4, dash: [5, 3], color: '#6b5b95' }] : []),
    ],
    hlines: izMin > 0 ? [{ value: izMin, label: `I_Z,min ${fI(izMin)}`, axis: 'i', color: '#8b1e1e', dash: [6, 4] }] : [],
    vlines: [
      { value: vinMin, label: 'V_in,min', color: '#9a8f7a' },
      ...(vinMax > vinMin ? [{ value: vinMax, label: 'V_in,max', color: '#9a8f7a' }] : []),
    ],
    markers: [{ x: vinMin, y: opLo.vout, axis: 'v', label: fV(opLo.vout, 3) }],
    legend: 'below',
  };
  // 2 — zener power against load current at the input extremes (worse V_Z corner)
  const x2 = Math.max(ilMax * 1.3, ((vinMax - v0) / r) * 1.05, 1e-6);
  const is = Array.from({ length: 201 }, (_, k) => (x2 * k) / 200);
  const ks: (-1 | 0 | 1)[] = p.tol > 0 ? [-1, 1] : [0];
  const pz = (vin: number, il: number) => Math.max(...ks.map((k) => {
    const o = opPoint(vin, il, r, vz0(p, k), p.rz);
    return o.vout * o.iz;
  }));
  const g2: GraphSpec = {
    id: 'pz-load',
    title: 'Zener power vs load',
    subtitle: `R = ${fR(r, 3)}, worse V_Z corner`,
    x: { label: 'Load current', unit: 'A' },
    y: [{ id: 'p', label: 'Zener power', unit: 'W', includeZero: true }],
    series: [
      { label: `V_in,max ${fV(vinMax, 3)}`, x: is, y: is.map((i) => pz(vinMax, i)), axis: 'p', width: 2.2 },
      ...(vinMax > vinMin ? [{ label: `V_in,min ${fV(vinMin, 3)}`, x: is, y: is.map((i) => pz(vinMin, i)), axis: 'p', width: 1.6, color: '#c47b17', dash: [5, 3] }] : []),
    ],
    hlines: [
      { value: pd, label: `P_D ${fP(pd)}`, axis: 'p', color: '#8b1e1e', dash: [6, 4] },
      { value: pd / 2, label: '½ P_D', axis: 'p', color: '#c47b17', dash: [3, 3] },
    ],
    vlines: [
      ...(ilMin > 0 ? [{ value: ilMin, label: 'I_L,min', color: '#9a8f7a' }] : []),
      { value: ilMax, label: 'I_L,max', color: '#9a8f7a' },
    ],
    markers: [{ x: ilMin, y: pz(vinMax, ilMin), axis: 'p', label: fP(pz(vinMax, ilMin)) }],
  };
  void s;
  return [g1, g2];
}

const sameNum = (a: number | null, b: number) => a != null && Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(b), 1e-12);

export const def: CalcDef<ZenerState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Shunt zener regulator with a piecewise-linear zener (V_Z0 + r_z·I_Z through the datasheet point V_ZT at I_ZT; Sedra & Smith, Microelectronic Circuits 7e §4.4), solved exactly for the largest R or the largest load that keeps I_Z ≥ I_Z,min at the worst corner (V_in,min, I_L,max, +tolerance), with every corner of V_in × load × V_Z tolerance evaluated for power; presets from the Vishay 1N4728A–1N4761A and onsemi BZX84C datasheets; IEC 60063 preferred values.',
  fields,
  defaults,
  // Mode-switch harness notes (§12.3): an error after ◎ R or ◎ I_L,max on a page whose input cannot reach the zener
  // voltage is the user's explicit request and reports its own error (style guide §5a). Round trips from a state the
  // analysis found dropped out (I_Z = 0 clamps) are not invertible, so "solve R from here" legitimately differs.
  solve: {
    default: 'r',
    analysis: 'izMin',
    options: [
      { key: 'r', label: 'Resistor for the load range' },
      { key: 'ilMax', label: 'Maximum load for a given resistor' },
      { key: 'izMin', label: 'Worst-case zener current for R and load' },
    ],
  },
  compute,
  sync: (s) => {
    const p = ZENER_PRESETS[s.part];
    if (p && !(sameNum(s.vz, p.vz) && sameNum(s.tol, Math.round(p.tol * 1e4) / 100) && sameNum(s.izt, p.izt) && sameNum(s.rz, p.rz) && sameNum(s.pd, p.pd) && sameNum(s.izk, p.izk))) s.part = 'Custom';
  },
  examples: [
    { id: 'default-5v1', label: '12 V ±10 % → 5.1 V (1N4733A), 0–20 mA load', state: defaults() },
    {
      id: 'sedra-6v8',
      label: 'Textbook: 6.8 V zener, r_z = 20 Ω, R = 0.5 kΩ, 10 V ± 1 V (Sedra & Smith)',
      state: { solveFor: 'ilMax', vinMin: 9, vinMax: 11, ilMin: 0, ilMinUnit: 'mA', izMin: 0.2e-3, izMinUnit: 'mA', r: 500, rUnit: 'Ω', part: 'Custom', vz: 6.8, tol: 0, izt: 5e-3, iztUnit: 'mA', rz: 20, rzUnit: 'Ω', pd: 0.5, izk: 0.2e-3, izkUnit: 'mA', eseries: 'E24', ilMaxUnit: 'mA' },
    },
    {
      id: 'bzx84-3v3',
      label: '3.3 V bias from 5 V USB with a SOT-23 BZX84C3V3 (high r_z)',
      state: { solveFor: 'r', vinMin: 4.75, vinMax: 5.25, ilMin: 0, ilMinUnit: 'mA', ilMax: 2e-3, ilMaxUnit: 'mA', izMin: 1e-3, izMinUnit: 'mA', rUnit: 'Ω', part: 'BZX84C3V3 SOT-23', ...presetVals('BZX84C3V3 SOT-23'), eseries: 'E24' },
    },
    {
      id: 'max-load-12v',
      label: 'How much load can 330 Ω feed? 24 V ±10 % → 12 V (1N4742A)',
      state: { solveFor: 'ilMax', vinMin: 21.6, vinMax: 26.4, ilMin: 0, ilMinUnit: 'mA', ilMaxUnit: 'mA', izMin: 3e-3, izMinUnit: 'mA', r: 330, rUnit: 'Ω', part: '1N4742A 12 V', ...presetVals('1N4742A 12 V'), eseries: 'E24' },
    },
    {
      id: 'wide-input',
      label: 'Wide 9–30 V input, 50 mA load: zener over its rating',
      state: { solveFor: 'r', vinMin: 9, vinMax: 30, ilMin: 0, ilMinUnit: 'mA', ilMax: 50e-3, ilMaxUnit: 'mA', izMin: 5e-3, izMinUnit: 'mA', rUnit: 'Ω', part: DEFAULT_PART, ...presetVals(DEFAULT_PART), eseries: 'E24' },
    },
  ],
};

function presetVals(name: string): Partial<ZenerState> {
  const p = ZENER_PRESETS[name]!;
  return { vz: p.vz, tol: Math.round(p.tol * 1e4) / 100, izt: p.izt, iztUnit: 'mA', rz: p.rz, rzUnit: 'Ω', pd: p.pd, izk: p.izk, izkUnit: 'mA' };
}
