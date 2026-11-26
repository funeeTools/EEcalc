/** Wire Gauge — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN } from '@/core/unitsets';
import {
  IEC60228, IEC_SIZES, MATERIALS, areaOf, awgDiameter, awgFromDiameter, awgLabel, cmil, diameterOf, necAmpacity, necSmallConductorLimit, resistivity,
  type Material,
} from './model';

export const ID = 'general/wire-gauge';

export type SizeGiven = 'awg' | 'mm2' | 'd';

export interface WireState {
  /** dropPct: drop and loss for the given size (analysis) · size: smallest size meeting the drop limit */
  solveFor: 'dropPct' | 'size';
  /** Which size field is typed (and, when solving, which system is searched: AWG, IEC 60228 or any diameter) */
  given: SizeGiven;
  awg: number;
  /** Cross-section, m² (shown in mm²) */
  area: number;
  areaUnit: string;
  d: number;
  dUnit: string;
  material: Material;
  temp: number;
  current: number;
  currentUnit: string;
  vSupply: number;
  len: number;
  lenUnit: string;
  circuit: 'two' | 'one';
  dropPct: number;
}

export const defaults = (): WireState => ({
  solveFor: 'dropPct',
  given: 'awg',
  awg: 12,
  area: areaOf(awgDiameter(12)),
  areaUnit: 'mm²',
  d: awgDiameter(12),
  dUnit: 'mm',
  material: 'cu',
  temp: 20,
  current: 10,
  currentUnit: 'A',
  vSupply: 12,
  len: 3,
  lenUnit: 'm',
  circuit: 'two',
  dropPct: 2.6054,
});

const U_AREA: Record<string, number> = { 'mm²': 1e-6, kcmil: 0.506707479e-6, 'µm²': 1e-12, 'cm²': 1e-4 };
const U_D: Record<string, number> = { mm: 1e-3, in: 0.0254, mil: 25.4e-6, 'µm': 1e-6, cm: 1e-2 };
const U_A: Record<string, number> = { A: 1, mA: 1e-3, kA: 1e3 };
// Limits of the three size forms span the same wires (AWG −20 … 60, i.e. about 84 mm … 7.9 µm), so a size
// typed in one form never solves the others out of range. ASTM B258 itself covers 4/0 … 56 AWG (warned).
const AWG_LIM = [-20, 60] as const;
const D_LIM = [awgDiameter(AWG_LIM[1]), awgDiameter(AWG_LIM[0])] as const;
const LIM = { awg: AWG_LIM, d: D_LIM, area: [areaOf(D_LIM[0]), areaOf(D_LIM[1])] as const, b258: [-3, 56] as const };

const sizeSolved = (k: SizeGiven) => (_s: unknown, root: Record<string, any>) => root.given !== k || root.solveFor === 'size';
const sizeUnsolve = (k: SizeGiven) => (_s: unknown, root: Record<string, any>) => {
  root.given = k;
  root.solveFor = 'dropPct';
};

// Mode-switch harness notes: (1) from a "size" state the round trip to the analysis gives the drop of the chosen
// STANDARD size, below the limit, and solving the size from an analysis state picks the next standard size up, so
// those round-trip flags are the intended rounding (as with E-series parts); the exact-diameter form round-trips.
// (2) kcmil and in have no SI prefixes, so an extreme value typed in them stays unreadable in the unit the user chose.
const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Conductor',
    note: 'Type the size in one form (◎ switches); the others follow. Solid round wire.',
    fields: [
      { kind: 'number', key: 'awg', symbol: 'AWG', label: 'Gauge', solvable: true, min: LIM.awg[0], max: LIM.awg[1], solvedWhen: sizeSolved('awg'), onUnsolve: sizeUnsolve('awg'), help: 'American Wire Gauge. 1/0 = 0, 2/0 = −1, 3/0 = −2, 4/0 = −3. When solving for the size, the smallest whole gauge meeting the drop limit is picked.' },
      { kind: 'number', key: 'area', symbol: 'A', label: 'Cross-section', units: U_AREA, unitKey: 'areaUnit', solvable: true, min: LIM.area[0], max: LIM.area[1], solvedWhen: sizeSolved('mm2'), onUnsolve: sizeUnsolve('mm2'), help: 'Conductor area. Metric cable is sold in IEC 60228 sizes (1.5, 2.5, 4, 6 mm² …); when solving for the size with this form, the smallest such size meeting the limit is picked.' },
      { kind: 'number', key: 'd', symbol: 'd', label: 'Diameter', units: U_D, unitKey: 'dUnit', unitFamily: 'none', solvable: true, min: LIM.d[0], max: LIM.d[1], solvedWhen: sizeSolved('d'), onUnsolve: sizeUnsolve('d'), help: 'Bare conductor diameter (solid wire). When solving for the size with this form, the exact diameter for the limit is found.' },
      {
        kind: 'select', key: 'material', label: 'Material',
        options: [{ value: 'cu', label: 'Copper (annealed)' }, { value: 'al', label: 'Aluminium 1350' }],
        help: 'Annealed copper: ρ₂₀ = 17.241 nΩ·m, α = 0.00393/K (IEC 60028). Aluminium 1350 (61 % IACS): ρ₂₀ = 28.264 nΩ·m, α = 0.00403/K (IEC 60889).',
      },
      { kind: 'number', key: 'temp', symbol: 'T', label: 'Conductor temperature', suffix: '°C', min: -100, max: 250, help: 'Temperature of the conductor itself (ambient plus its own heating). Resistance rises about 0.4 %/K.' },
    ],
  },
  {
    kind: 'section',
    title: 'Run',
    note: 'Click ◎ on ΔV to make it a limit and solve for the smallest size.',
    fields: [
      { kind: 'number', key: 'current', symbol: 'I', label: 'Current', units: U_A, unitKey: 'currentUnit', min: 1e-6, max: 1e5 },
      { kind: 'number', key: 'vSupply', symbol: 'V_s', label: 'Supply voltage', unit: 'V', min: 1e-3, max: 1e6, help: 'Source voltage, for the drop as a percentage and the voltage left at the load.' },
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'One-way length', units: U_LEN, unitKey: 'lenUnit', min: 1e-4, max: 1e6, help: 'Distance from source to load along the cable.' },
      { kind: 'select', key: 'circuit', label: 'Conductors in the loop', options: [{ value: 'two', label: 'Out and back (2 × ℓ)' }, { value: 'one', label: 'One conductor (1 × ℓ)' }], help: 'A DC or single-phase circuit drops voltage in both the supply and return conductors (2 × ℓ). Use one conductor for a chassis return or to see one wire alone.' },
      {
        kind: 'number', key: 'dropPct', symbol: 'ΔV', label: 'Voltage drop', suffix: '%', solvable: true, min: 1e-30, max: 1e30, // covers every computed drop over the input ranges
        onSolve: (_s, root) => (root.solveFor = 'dropPct'),
        onUnsolve: (_s, root) => {
          // The size search runs over the standard sizes (AWG 4/0 … 56, IEC 0.5 … 300 mm²). A wire thicker than the
          // largest of them can only be matched by the exact-diameter form, so switch to it rather than fail.
          if ((root.given === 'mm2' && root.area > 300e-6 * (1 + 1e-9)) || (root.given === 'awg' && root.awg < -3)) root.given = 'd';
          root.solveFor = 'size';
        },
        help: 'Drop across the wiring as a % of V_s. Computed for the given size; click ◎ to make it the limit and solve for the size (3 % is a common design figure for branch circuits and low-voltage DC runs).',
      },
    ],
  },
];

const fmtD = (d: number) => `${si(d, 'm', 4)} (${(d / 0.0254).toPrecision(4)} in)`;
const fmtA = (a: number) => `${Number((a * 1e6).toPrecision(4))} mm²`;
const fin = (name: string, v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
};

interface Run {
  rpm: number;
  rRun: number;
  dv: number;
  pct: number;
}
function runOf(s: WireState, d: number): Run {
  const rpm = resistivity(s.material, s.temp) / areaOf(d);
  const rRun = rpm * s.len * (s.circuit === 'two' ? 2 : 1);
  const dv = s.current * rRun;
  return { rpm, rRun, dv, pct: (dv / s.vSupply) * 100 };
}

export function compute(st: WireState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: WireState): CalcReport {
  const s: WireState = { ...st };
  for (const [k, n] of [['awg', 'Gauge'], ['area', 'Area'], ['d', 'Diameter'], ['temp', 'Temperature'], ['current', 'Current'], ['vSupply', 'Supply voltage'], ['len', 'Length'], ['dropPct', 'Voltage drop']] as const) fin(n, s[k]);
  if (!(s.current > 0) || !(s.vSupply > 0) || !(s.len > 0)) throw new Error('Current, supply voltage and length must be > 0.');
  if (!MATERIALS[s.material]) throw new Error('Unknown material.');
  if (resistivity(s.material, s.temp) <= 0) throw new Error('Temperature is too low for the linear resistivity model.');
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });
  const loop = s.circuit === 'two' ? 2 : 1;

  // ── the conductor diameter
  let d: number;
  if (s.solveFor === 'size') {
    if (!(s.dropPct > 0)) throw new Error('Enter a drop limit ΔV > 0 %.');
    const meets = (dd: number) => runOf(s, dd).pct <= s.dropPct * (1 + 1e-12);
    if (s.given === 'awg') {
      let n: number | null = null;
      for (let k = LIM.b258[1]; k >= LIM.b258[0]; k--) if (meets(awgDiameter(k))) {
        n = k;
        break;
      }
      if (n == null) return fail(`Even 4/0 AWG drops ${runOf(s, awgDiameter(-3)).pct.toPrecision(3)} % here, above the ${s.dropPct} % limit. Use parallel conductors, kcmil cable, a shorter run or a higher voltage.`);
      s.awg = n;
      d = awgDiameter(n);
    } else if (s.given === 'mm2') {
      const a = IEC_SIZES.find((x) => meets(diameterOf(x * 1e-6)));
      if (a == null) return fail(`Even 300 mm² drops ${runOf(s, diameterOf(300e-6)).pct.toPrecision(3)} % here, above the ${s.dropPct} % limit. Use parallel conductors, a shorter run or a higher voltage.`);
      d = diameterOf(a * 1e-6);
    } else {
      // exact: R_run = ΔV_max/I → A = ρ·loop·ℓ·I/(ΔV%·V_s/100)
      const aNeed = (resistivity(s.material, s.temp) * loop * s.len * s.current) / ((s.dropPct / 100) * s.vSupply);
      d = diameterOf(aNeed);
      if (d > LIM.d[1]) return fail(`The limit needs a ${fmtD(d)} conductor, beyond the range of this page (84 mm). Use parallel conductors, a shorter run or a higher voltage.`);
      if (d < LIM.d[0]) return fail(`Any wire thicker than ${si(d, 'm', 3)} meets the limit — the drop is negligible at this current and length.`);
    }
  } else {
    if (s.given === 'awg') d = awgDiameter(s.awg);
    else if (s.given === 'mm2') {
      if (!(s.area > 0)) throw new Error('Area must be > 0.');
      d = diameterOf(s.area);
    } else {
      if (!(s.d > 0)) throw new Error('Diameter must be > 0.');
      d = s.d;
    }
  }
  const area = areaOf(d);
  const awgEq = awgFromDiameter(d);
  // keep every size form consistent; a typed AWG stays exactly as typed
  if (s.given !== 'awg' || s.solveFor === 'size') s.awg = s.solveFor === 'size' && s.given === 'awg' ? s.awg : awgEq;
  if (!(s.given === 'mm2' && s.solveFor === 'dropPct')) s.area = area;
  if (!(s.given === 'd' && s.solveFor === 'dropPct')) s.d = d;
  const r = runOf(s, d);
  if (s.solveFor === 'dropPct') s.dropPct = r.pct;
  const limitPct = s.solveFor === 'size' ? s.dropPct : null;

  const warnings: string[] = [];
  const notes: string[] = [];
  const isAwg = s.given === 'awg' && Number.isInteger(s.awg);
  const amp = isAwg ? necAmpacity(s.material, s.awg) : null;
  const small = isAwg ? necSmallConductorLimit(s.material, s.awg) : null;
  const j = s.current / area / 1e6; // A/mm²
  if (r.pct >= 100) warnings.push(`The wiring would drop ${r.pct.toPrecision(3)} % of the supply: the load cannot get this current. Use a much thicker wire or a shorter run.`);
  else if (s.solveFor === 'dropPct' && r.pct > 5) warnings.push(`ΔV = ${r.pct.toPrecision(3)} % of the supply. Above about 3–5 % loads see a noticeably low voltage and the wiring runs warm: use a thicker conductor (◎ on ΔV solves for it).`);
  if (amp) {
    if (s.current > amp[1]) warnings.push(`${s.current.toPrecision(3)} A exceeds the NEC 310.16 ampacity of ${awgLabel(s.awg)} AWG ${s.material === 'cu' ? 'copper' : 'aluminium'} even with 90 °C insulation (${amp[1]} A): use a larger conductor.`);
    else if (s.current > amp[0]) warnings.push(`${s.current.toPrecision(3)} A is above the 75 °C column (${amp[0]} A) of NEC 310.16: allowed only with 90 °C insulation AND terminations rated 90 °C, which is rare. Most equipment terminals are rated 75 °C.`);
    if (small != null && s.current > small) notes.push(`NEC 240.4(D) limits the overcurrent protection of ${awgLabel(s.awg)} AWG ${s.material === 'cu' ? 'copper' : 'aluminium'} to ${small} A in building wiring.`);
  } else if (j > 10) warnings.push(`Current density ${j.toPrecision(3)} A/mm²: far above what insulated building or chassis wire carries continuously (typically a few A/mm²). Check the temperature rise and the insulation rating.`);
  if (awgEq < LIM.b258[0] - 1e-9 || awgEq > LIM.b258[1] + 1e-9) notes.push(`${awgLabel(awgEq)} AWG is outside the ASTM B258 range (4/0 … 56 AWG): the gauge formula is extrapolated.`);
  if (s.temp > 150) warnings.push(`T = ${s.temp} °C: above the rating of most wire insulation (60–105 °C for PVC, 150–200 °C for silicone or PTFE), and the linear α model is less accurate.`);
  if (s.temp < -50) notes.push('The linear temperature coefficient is a fit near room temperature; below −50 °C the resistivity is lower than this estimate.');
  if (d < 20e-6) notes.push('Very fine wire: real magnet-wire tolerances are several percent of the diameter, so resistance varies accordingly.');

  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const sizeSolved = (k: SizeGiven) => s.given !== k || s.solveFor === 'size';
  const iecHere = IEC60228.find(([a]) => Math.abs(a * 1e-6 - area) <= 1e-9 * area);
  const sizeName = s.given === 'awg' ? `${awgLabel(s.awg)} AWG` : s.given === 'mm2' ? fmtA(area) : `⌀ ${si(d, 'm', 4)}`;
  results.push(
    item('awg', 'Gauge (AWG)', s.awg, '', `${awgLabel(s.awg)} AWG`, { symbol: 'AWG', primary: s.given === 'awg', solved: sizeSolved('awg'), group: s.given === 'awg' ? undefined : 'Size', note: s.given === 'awg' ? fmtD(d) : 'equivalent (fractional) gauge' }),
    item('area', 'Cross-section', area, 'm²', `${fmtA(area)} · ${(cmil(d) / 1000).toPrecision(4)} kcmil`, { symbol: 'A', primary: s.given === 'mm2', solved: sizeSolved('mm2'), group: s.given === 'mm2' ? undefined : 'Size', note: iecHere ? 'IEC 60228 size' : undefined }),
    item('d', 'Diameter', d, 'm', fmtD(d), { symbol: 'd', primary: s.given === 'd', solved: sizeSolved('d'), group: s.given === 'd' ? undefined : 'Size' }),
  );
  results.push(item('dropPct', 'Voltage drop', r.pct, '%', `${r.pct.toPrecision(4)} % · ${si(r.dv, 'V', 4)}`, { symbol: 'ΔV', primary: true, solved: s.solveFor === 'dropPct', tone: limitPct != null ? (r.pct <= limitPct ? 'pass' : 'fail') : r.pct > 5 ? 'warn' : '', note: limitPct != null ? `limit ${limitPct} %` : `of ${si(s.vSupply, 'V', 4)}` }));
  results.push(item('pLoss', 'Power lost in the wire', s.current * r.dv, 'W', si(s.current * r.dv, 'W', 4), { symbol: 'P', primary: true, note: `I²R, ${loop} × ${si(s.len, 'm', 4)}` }));
  results.push(item('rpm', 'Resistance per length', r.rpm, 'Ω/m', `${si(r.rpm * 1000, 'Ω', 4)}/km · ${(r.rpm * 304.8).toPrecision(4)} Ω/kft`, { symbol: "R'", primary: true, note: `${MATERIALS[s.material].name} at ${s.temp} °C` }));

  const g = 'Run';
  results.push(
    item('rRun', 'Loop resistance', r.rRun, 'Ω', si(r.rRun, 'Ω', 4), { symbol: 'R', group: g, note: `R' × ${loop} × ℓ` }),
    item('dv', 'Voltage drop', r.dv, 'V', si(r.dv, 'V', 4), { symbol: 'ΔV', group: g }),
    item('vLoad', 'Voltage at the load', s.vSupply - r.dv, 'V', si(s.vSupply - r.dv, 'V', 4), { symbol: 'V_load', group: g, tone: r.pct >= 100 ? 'fail' : '' }),
    item('j', 'Current density', j * 1e6, 'A/m²', `${j.toPrecision(3)} A/mm²`, { symbol: 'J', group: g }),
    item('rho', 'Resistivity at T', resistivity(s.material, s.temp), 'Ω·m', `${(resistivity(s.material, s.temp) * 1e9).toPrecision(5)} nΩ·m`, { symbol: 'ρ(T)', group: g }),
  );
  const ga = 'Ampacity guide (NEC 310.16)';
  if (amp) {
    const tone = s.current > amp[1] ? 'fail' : s.current > amp[0] ? 'warn' : 'pass';
    results.push(
      item('amp75', '75 °C insulation', amp[0], 'A', `${amp[0]} A`, { group: ga, tone: s.current > amp[0] ? tone : 'pass', note: 'usual limit: terminals rated 75 °C' }),
      item('amp90', '90 °C insulation', amp[1], 'A', `${amp[1]} A`, { group: ga, tone: s.current > amp[1] ? 'fail' : '' }),
      ...(small != null ? [item('ocpd', 'Max overcurrent device', small, 'A', `${small} A`, { group: ga, note: 'NEC 240.4(D)' })] : []),
    );
  } else {
    results.push(item('amp75', 'Table ampacity', null, 'A', '— not in the table here', { group: ga, note: s.given === 'awg' ? `carried for ${s.material === 'cu' ? '14' : '12'} AWG – 4/0 (whole gauges)` : 'type a whole AWG to look it up' }));
  }

  // ── IEC 60228 comparison (copper only: the standard's resistance figures are for copper)
  const tables: TableSpec[] = [];
  const rows: Record<string, number | string | null>[] = [];
  const disp: Record<string, string>[] = [];
  for (const [a, rMax] of IEC60228) {
    const dd = diameterOf(a * 1e-6);
    const rr = runOf(s, dd);
    rows.push({ a: a * 1e-6, awg: awgFromDiameter(dd), rNom: (resistivity('cu', 20) / (a * 1e-6)) * 1000, rMax, pct: rr.pct });
    disp.push({ a: `${a} mm²`, awg: awgFromDiameter(dd).toFixed(1), rNom: `${((resistivity('cu', 20) / (a * 1e-6)) * 1000).toPrecision(3)}`, rMax: `${rMax}`, pct: `${rr.pct.toPrecision(3)} %` });
  }
  tables.push({
    id: 'iec60228',
    title: 'IEC 60228 metric sizes on this run',
    columns: [
      { key: 'a', label: 'Size', align: 'left' },
      { key: 'awg', label: '≈ AWG' },
      { key: 'rNom', label: 'Cu, nominal area, 20 °C', unit: 'Ω/km' },
      { key: 'rMax', label: 'IEC max, class 2 Cu, 20 °C', unit: 'Ω/km' },
      { key: 'pct', label: `ΔV (${MATERIALS[s.material].name}, ${s.temp} °C)`, unit: '%' },
    ],
    rows,
    display: disp,
    rowTones: limitPct != null ? rows.map((x) => ((x.pct as number) <= limitPct ? 'pass' : 'fail')) : undefined,
    note: `The standard sets a maximum resistance, not a minimum area, so real conductors may be a few percent under the nominal area.${limitPct != null ? ` Pass: ΔV ≤ ${limitPct} %.` : ''}`,
  });
  const awgRows: Record<string, number | string | null>[] = [];
  const awgDisp: Record<string, string>[] = [];
  for (let k = -3; k <= 40; k++) {
    const dd = awgDiameter(k);
    const rr = runOf(s, dd);
    const am = necAmpacity(s.material, k);
    awgRows.push({ awg: awgLabel(k), d: dd, a: areaOf(dd), rpm: rr.rpm, pct: rr.pct, amp75: am ? am[0] : null });
    awgDisp.push({ awg: awgLabel(k), d: (dd * 1e3).toPrecision(4), a: (areaOf(dd) * 1e6).toPrecision(4), rpm: (rr.rpm * 1e3).toPrecision(4), pct: `${rr.pct.toPrecision(3)} %`, amp75: am ? `${am[0]}` : '—' });
  }
  tables.push({
    id: 'awg',
    title: 'AWG sizes on this run',
    columns: [
      { key: 'awg', label: 'AWG', align: 'left' },
      { key: 'd', label: 'Diameter', unit: 'mm' },
      { key: 'a', label: 'Area', unit: 'mm²' },
      { key: 'rpm', label: "R'", unit: 'Ω/km' },
      { key: 'pct', label: 'ΔV', unit: '%' },
      { key: 'amp75', label: 'NEC 75 °C', unit: 'A' },
    ],
    rows: awgRows,
    display: awgDisp,
    rowTones: limitPct != null ? awgRows.map((x) => ((x.pct as number) <= limitPct ? 'pass' : 'fail')) : undefined,
    note: `ASTM B258 diameters. R' and ΔV for ${MATERIALS[s.material].name} at ${s.temp} °C.${limitPct != null ? ` Pass: ΔV ≤ ${limitPct} %.` : ''}`,
  });

  notes.push('DC resistance of a solid round conductor. Stranded wire of the same gauge has about 2 % more resistance per length (lay of the strands); at mains frequency skin effect is negligible below about 50 mm² copper.');
  notes.push('The NEC ampacities are for building wiring: 30 °C ambient and at most three current-carrying conductors together. Derate for higher ambient or bundling (NEC 310.15); chassis and harness wiring follow other rules.');

  return {
    ...emptyReport(ID),
    ok: true,
    solveFor: s.solveFor,
    status: limitPct != null ? { text: `MEETS ${limitPct} %`, tone: 'pass' } : undefined,
    results,
    graphs: graphs(s, d, r, limitPct),
    tables,
    warnings,
    notes,
    summary: `${sizeName} ${s.material === 'cu' ? 'copper' : 'aluminium'} · ${si(s.current, 'A', 4)} over ${loop} × ${si(s.len, 'm', 4)}: ΔV = ${si(r.dv, 'V', 4)} (${r.pct.toPrecision(3)} %)`,
    details: { state: s, d, area, awgEq, run: r },
  };
}

function graphs(s: WireState, d: number, r: Run, limitPct: number | null): GraphSpec[] {
  const out: GraphSpec[] = [];
  const limitLine = limitPct != null ? [{ value: limitPct, label: `limit ${limitPct} %`, color: '#8b1e1e', dash: [5, 4] }] : [];
  if (s.given === 'awg') {
    const ks = Array.from({ length: 44 }, (_, i) => i - 3);
    out.push({
      id: 'drop-gauge',
      title: 'Voltage drop vs gauge',
      subtitle: `${si(s.current, 'A', 3)} over ${s.circuit === 'two' ? '2 × ' : ''}${si(s.len, 'm', 3)} at ${si(s.vSupply, 'V', 3)} · 0 = 1/0, −3 = 4/0`,
      x: { label: 'Gauge', unit: 'AWG', integer: true },
      y: [{ id: 'p', label: 'Voltage drop', unit: '%', log: true }],
      series: [{ label: 'ΔV', x: ks, y: ks.map((k) => runOf(s, awgDiameter(k)).pct), width: 2, color: '#1f4e5f' }],
      hlines: limitLine,
      markers: [{ x: awgFromDiameter(d), y: r.pct, label: `${awgLabel(s.awg)} AWG: ${r.pct.toPrecision(3)} %`, color: '#c47b17' }],
    });
  } else {
    const as = Array.from({ length: 161 }, (_, i) => 0.05e-6 * (400 / 0.05) ** (i / 160));
    out.push({
      id: 'drop-gauge',
      title: 'Voltage drop vs cross-section',
      subtitle: `${si(s.current, 'A', 3)} over ${s.circuit === 'two' ? '2 × ' : ''}${si(s.len, 'm', 3)} at ${si(s.vSupply, 'V', 3)}`,
      x: { label: 'Cross-section', unit: 'mm²', log: true },
      y: [{ id: 'p', label: 'Voltage drop', unit: '%', log: true }],
      series: [{ label: 'ΔV', x: as.map((a) => a * 1e6), y: as.map((a) => runOf(s, diameterOf(a)).pct), width: 2, color: '#1f4e5f' }],
      hlines: limitLine,
      markers: [{ x: areaOf(d) * 1e6, y: r.pct, label: `${(areaOf(d) * 1e6).toPrecision(3)} mm²: ${r.pct.toPrecision(3)} %`, color: '#c47b17' }],
    });
  }
  // drop against length for this size and its standard neighbours
  const sizes: { label: string; d: number }[] = [];
  if (s.given === 'awg' && Number.isInteger(s.awg)) for (const k of [s.awg + 2, s.awg, s.awg - 2]) {
    if ((k >= LIM.b258[0] && k <= LIM.b258[1]) || k === s.awg) sizes.push({ label: `${awgLabel(k)} AWG`, d: awgDiameter(k) });
  }
  else if (s.given === 'mm2') {
    // (a non-integer AWG falls through to the single-size branch below)
    const i = IEC_SIZES.findIndex((a) => a * 1e-6 >= areaOf(d) * (1 - 1e-9));
    const idx = i < 0 ? IEC_SIZES.length - 1 : i;
    for (const k of [idx - 1, idx, idx + 1]) if (k >= 0 && k < IEC_SIZES.length) sizes.push({ label: `${IEC_SIZES[k]} mm²`, d: diameterOf(IEC_SIZES[k] * 1e-6) });
    if (!sizes.some((z) => Math.abs(z.d - d) < 1e-9 * d)) sizes.splice(1, 0, { label: `${(areaOf(d) * 1e6).toPrecision(3)} mm²`, d });
  } else sizes.push({ label: `⌀ ${si(d, 'm', 3)}`, d });
  const lMax = s.len * 2;
  const ls = Array.from({ length: 101 }, (_, i) => (lMax * i) / 100);
  const colors = ['#4f8a8b', '#1f4e5f', '#c47b17', '#6b5b95'];
  out.push({
    id: 'drop-length',
    title: 'Voltage drop vs one-way length',
    x: { label: 'One-way length', unit: 'm' },
    y: [{ id: 'p', label: 'Voltage drop', unit: '%', includeZero: true }],
    series: sizes.map((z, i) => ({ label: z.label, x: ls, y: ls.map((l) => runOf({ ...s, len: l }, z.d).pct), width: Math.abs(z.d - d) < 1e-9 * d ? 2.4 : 1.4, color: colors[i % colors.length], dash: Math.abs(z.d - d) < 1e-9 * d ? undefined : [5, 3] })),
    hlines: limitLine,
    vlines: [{ value: s.len, label: `ℓ = ${si(s.len, 'm', 3)}`, color: '#9a8f7a', dash: [3, 3] }],
  });
  return out;
}

const D = defaults();

export const def: CalcDef<WireState> = {
  id: ID,
  version: '0.1.0',
  method: 'AWG diameter d = 0.005 in · 92^((36 − n)/39) (ASTM B258); R = ρ(T)·ℓ/A with annealed copper ρ₂₀ = 1/58 Ω·mm²/m, α = 0.00393/K (IEC 60028) or aluminium 1350 ρ₂₀ = 0.028264 Ω·mm²/m, α = 0.00403/K (IEC 60889); IEC 60228 metric sizes; ampacity guide from NEC Table 310.16 (75/90 °C columns, 30 °C ambient, ≤ 3 conductors). Size for a drop limit: the smallest standard size (AWG or IEC 60228) or the exact diameter.',
  fields,
  defaults,
  solve: {
    default: 'dropPct',
    analysis: 'dropPct',
    options: [
      { key: 'dropPct', label: 'Voltage drop and loss for the given size' },
      { key: 'size', label: 'Smallest size meeting a drop limit' },
    ],
  },
  compute,
  examples: [
    { id: 'dc12', label: '12 V, 10 A over 3 m with 12 AWG copper', state: { ...D } },
    { id: 'awg-size', label: 'Smallest AWG for 24 V, 5 A over 20 m within 3 %', state: { ...D, solveFor: 'size', given: 'awg', vSupply: 24, current: 5, len: 20, lenUnit: 'm', dropPct: 3, temp: 20, material: 'cu', circuit: 'two' } },
    { id: 'iec-size', label: 'IEC 60228 size for 230 V, 16 A over 30 m within 3 % at 70 °C', state: { ...D, solveFor: 'size', given: 'mm2', vSupply: 230, current: 16, len: 30, lenUnit: 'm', dropPct: 3, temp: 70, material: 'cu', circuit: 'two' } },
    { id: 'nec-table8', label: 'NEC Ch. 9 Table 8 check: 12 AWG solid copper at 75 °C = 1.93 Ω/kft', state: { ...D, solveFor: 'dropPct', given: 'awg', awg: 12, temp: 75, material: 'cu', current: 1, vSupply: 120, len: 304.8, lenUnit: 'ft', circuit: 'one' } },
    { id: 'al-feeder', label: '4/0 aluminium feeder: 240 V, 150 A over 50 m', state: { ...D, solveFor: 'dropPct', given: 'awg', awg: -3, temp: 75, material: 'al', current: 150, vSupply: 240, len: 50, lenUnit: 'm', circuit: 'two' } },
    { id: 'thin', label: 'Edge case: 2 A through 30 AWG over 2 m at 5 V', state: { ...D, solveFor: 'dropPct', given: 'awg', awg: 30, temp: 20, material: 'cu', current: 2, vSupply: 5, len: 2, lenUnit: 'm', circuit: 'two' } },
  ],
};
