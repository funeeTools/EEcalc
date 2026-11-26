/** RF power density & MPE — calculator definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ } from '@/core/unitsets';
import { type ExposureClass, GROUND_FACTOR, type Limit, type Standard, density, distanceFor, eirpFor, ETA0, exposureRatio, fieldsOf, icnirpLimit, limitOf, zones } from './model';

export const ID = 'rf/power-density';

export interface PdState {
  solveFor: 's' | 'r' | 'p';
  /** transmitter power at the antenna, W */
  p: number;
  /** antenna gain, dBi */
  g: number;
  /** duty factor, % (time-averaged transmit fraction) */
  duty: number;
  /** distance from the antenna, m */
  r: number;
  rUnit: string;
  /** time-averaged power density, W/m² */
  s: number;
  sUnit: string;
  ground: 'free' | 'ground';
  f: number;
  fUnit: string;
  /** largest antenna dimension, m (0 = not given) */
  d: number;
  dUnit: string;
  std: Standard;
  cls: ExposureClass;
}

/** A 2.4 GHz access point (1 W into an 8 dBi antenna) seen from 1 m, against the FCC general-population limit. */
export const defaults = (): PdState => ({
  solveFor: 's',
  p: 1,
  g: 8,
  duty: 100,
  r: 1,
  rUnit: 'm',
  s: 0.5,
  sUnit: 'W/m²',
  ground: 'free',
  f: 2.45e9,
  fUnit: 'GHz',
  d: 0.1,
  dUnit: 'cm',
  std: 'fcc',
  cls: 'general',
});

const U_DIST: Record<string, number> = { m: 1, km: 1e3, cm: 1e-2, mm: 1e-3, ft: 0.3048, in: 0.0254 };
const U_ANT: Record<string, number> = { cm: 1e-2, m: 1, mm: 1e-3, in: 0.0254, ft: 0.3048 };
/** pW/m² … GW/m² so a solved density reads 1–9999 across the transmitter powers the form allows (1 nW … 1 GW). */
const U_S: Record<string, number> = { 'W/m²': 1, 'mW/cm²': 10, 'µW/cm²': 1e-2, 'mW/m²': 1e-3, 'µW/m²': 1e-6, 'nW/m²': 1e-9, 'pW/m²': 1e-12, 'kW/m²': 1e3, 'MW/m²': 1e6, 'GW/m²': 1e9 };
const STD_NAME: Record<Standard, string> = { fcc: 'FCC §1.1310', icnirp: 'ICNIRP 2020' };
const CLS_NAME: Record<ExposureClass, string> = { general: 'general population', occupational: 'occupational' };

const R_MIN = 1e-3;
const R_MAX = 1e7;
const P_MIN = 1e-9;
const P_MAX = 1e9;
/** Density range: wide enough for every P_t, G_t, δ, F and r the other fields allow (8e-33 … 2e21 W/m²). */
const S_MIN = 1e-40;
const S_MAX = 1e25;

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Transmitter',
    note: 'Click ◎ to choose the unknown (S, r or P_t).',
    fields: [
      { kind: 'number', key: 'p', symbol: 'P_t', label: 'Tx power', unit: 'W', min: P_MIN, max: P_MAX, solvable: true, help: 'Average power delivered to the antenna (after cable loss). When solved: the power that gives the target density S at r.' },
      { kind: 'number', key: 'g', symbol: 'G_t', label: 'Antenna gain', suffix: 'dBi', min: -30, max: 70, help: 'Gain towards the point of interest, relative to isotropic. Use the main-beam gain for a worst case.' },
      { kind: 'number', key: 'f', symbol: 'f', label: 'Frequency', units: U_FREQ, unitKey: 'fUnit', min: 100e3, max: 300e9, help: 'Sets the limit (FCC: 0.3 MHz–100 GHz, ICNIRP: 100 kHz–300 GHz) and the near-field boundaries.' },
    ],
  },
  {
    kind: 'section',
    title: 'Point of interest',
    fields: [
      { kind: 'number', key: 'r', symbol: 'r', label: 'Distance', units: U_DIST, unitKey: 'rUnit', unitFamily: 'none', min: R_MIN, max: R_MAX, solvable: true, help: 'Distance from the antenna to the point. When solved: the distance at which the density falls to the target S.' },
      { kind: 'number', key: 's', symbol: 'S', label: 'Density', units: U_S, unitKey: 'sUnit', unitFamily: 'none', min: S_MIN, max: S_MAX, solvable: true, help: 'Time-averaged power density at r (1 mW/cm² = 10 W/m²). Solved by default; type a target here when solving for distance or power.' },
    ],
  },
  {
    kind: 'section',
    title: 'Exposure limit',
    fields: [
      { kind: 'select', key: 'std', label: 'Standard', options: [{ value: 'fcc', label: 'FCC §1.1310' }, { value: 'icnirp', label: 'ICNIRP 2020' }], help: 'FCC 47 CFR §1.1310 Table 1 maximum permissible exposure, or the ICNIRP 2020 whole-body reference levels (Table 5). The Tables tab compares both.' },
      { kind: 'select', key: 'cls', label: 'Exposure class', options: [{ value: 'general', label: 'General public' }, { value: 'occupational', label: 'Occupational' }], help: 'General population / uncontrolled (30 min average), or occupational / controlled: people aware of the exposure and able to control it (FCC: 6 min average).' },
    ],
  },
  {
    kind: 'section',
    title: 'More options',
    collapsed: true,
    note: 'Duty factor, ground reflection and antenna size (for the near-field check).',
    fields: [
      { kind: 'number', key: 'duty', symbol: 'δ', label: 'Duty factor', suffix: '%', min: 0.001, max: 100, help: 'Fraction of time the transmitter is on, averaged over the limit’s averaging time (6 or 30 min). 100 % for broadcast, base stations and worst-case push-to-talk assessments.' },
      { kind: 'select', key: 'ground', label: 'Ground reflection', options: [{ value: 'free', label: 'None (×1)' }, { value: 'ground', label: 'Ground (×2.56)' }], help: 'FCC OET-65: near ground, a reflected wave can add in phase with field factor 1.6, multiplying the density by 1.6² = 2.56. Use it for antennas above people standing on the ground.' },
      { kind: 'number', key: 'd', symbol: 'D', label: 'Antenna size', units: U_ANT, unitKey: 'dUnit', unitFamily: 'none', min: 0, max: 1000, zeroHint: 'not given', help: 'Largest dimension of the antenna, for the far-field distance 2D²/λ. Leave 0 to skip that check.' },
    ],
  },
];

/** sx() with a sane floor and ceiling: outside 1 f … 1000 T, scientific notation instead of “0.00002 fW”. */
export function sx(v: number, unit: string, d = 3): string {
  const a = Math.abs(v);
  if (Number.isFinite(v) && v !== 0 && (a < 0.9995e-15 || a >= 1e15)) return `${v.toExponential(d - 1).replace(/-/g, '−')} ${unit}`;
  return si(v, unit, d);
}
const fS = (v: number) => sx(v, 'W/m²', 4);
const fDist = (m: number) => (m >= 1e3 ? `${+(m / 1e3).toPrecision(4)} km` : sx(m, 'm', 4));
const dbm = (w: number) => 10 * Math.log10(w / 1e-3);
export const pct = (x: number) => {
  const v = x * 100;
  if (v >= 1e5 || (v > 0 && v < 1e-3)) return `${v.toExponential(2).replace(/-/g, '−')} %`;
  return `${v >= 1000 ? Math.round(v).toLocaleString('en-US') : +v.toPrecision(3)} %`;
};
/** Above the limit (with a 1e-9 allowance so a value solved onto the limit reads as compliant). */
const exceeds = (ratio: number) => ratio > 1 + 1e-9;
const toneOf = (ratio: number): 'pass' | 'warn' | 'fail' => (exceeds(ratio) ? 'fail' : ratio > 0.5 ? 'warn' : 'pass');

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: PdState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: PdState): CalcReport {
  const s: PdState = { ...st };
  if (!['s', 'r', 'p'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  const need = (k: 'p' | 'r' | 's') => (s.solveFor === k ? 0 : finite(k === 'p' ? 'Transmit power' : k === 'r' ? 'Distance' : 'Power density', s[k]));
  const p = need('p');
  const r = need('r');
  const sT = need('s');
  const g = finite('Antenna gain', s.g);
  const duty = finite('Duty factor', s.duty) / 100;
  const f = finite('Frequency', s.f);
  const dAnt = finite('Antenna size', s.d);
  if (s.solveFor !== 'p' && !(p > 0)) throw new Error('Transmit power must be > 0.');
  if (s.solveFor !== 'r' && !(r > 0)) throw new Error('Distance must be > 0.');
  if (s.solveFor !== 's' && !(sT > 0)) throw new Error('The target power density must be > 0.');
  if (!(duty > 0 && duty <= 1)) throw new Error('Duty factor must be between 0 and 100 %.');
  if (!(f > 0)) throw new Error('Frequency must be > 0.');
  if (dAnt < 0) throw new Error('Antenna size must be ≥ 0 (0 = not given).');
  if (!['free', 'ground'].includes(s.ground)) throw new Error('Ground reflection must be "free" or "ground".');
  if (!['fcc', 'icnirp'].includes(s.std) || !['general', 'occupational'].includes(s.cls)) throw new Error('Unknown standard or exposure class.');

  const k = s.ground === 'ground' ? GROUND_FACTOR : 1;
  const gLin = 10 ** (g / 10);
  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const noSolution = (why: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: why, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });

  // ── solve (closed-form inverses of the one forward equation density())
  switch (s.solveFor) {
    case 's':
      s.s = density(p * gLin, r, k, duty);
      if (!(s.s >= S_MIN && s.s <= S_MAX)) return noSolution(`S = ${fS(s.s)} is outside the ${fS(S_MIN)} … ${fS(S_MAX)} range of the density field.`);
      break;
    case 'r': {
      const rr = distanceFor(p * gLin, sT, k, duty);
      if (!(rr >= R_MIN && rr <= R_MAX)) return noSolution(`S = ${fS(sT)} is reached at ${fDist(rr)}, outside the ${fDist(R_MIN)} … ${fDist(R_MAX)} distance range. Change the target density or the power.`);
      s.r = rr;
      break;
    }
    case 'p': {
      const pp = eirpFor(sT, r, k, duty) / gLin;
      if (!(pp >= P_MIN && pp <= P_MAX)) return noSolution(`S = ${fS(sT)} at ${fDist(r)} needs P_t = ${sx(pp, 'W', 3)}, outside the ${sx(P_MIN, 'W')} … ${sx(P_MAX, 'W')} range.`);
      s.p = pp;
      break;
    }
  }

  const eirp = s.p * gLin;
  const S = density(eirp, s.r, k, duty);
  const { e, h } = fieldsOf(S);
  const z = zones(f, dAnt);
  const lim = limitOf(s.std, f, s.cls);
  const ratio = lim ? exposureRatio(lim, S) : null;
  const rc = lim ? distanceFor(eirp, lim.sEff, k, duty) : null;
  const eirpMax = lim ? eirpFor(lim.sEff, s.r, k, duty) : null;
  const solved = s.solveFor;
  // r_c from the far-field formula is only meaningful if it lies in the far field itself
  const rcNear = rc != null && (rc < z.reactive || (z.fraunhofer > 0 && rc < z.fraunhofer));
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const limName = `${STD_NAME[s.std]} ${CLS_NAME[s.cls]}`;

  // ── headline: solved first
  const head: Record<PdState['solveFor'], ResultItem> = {
    s: item('s', 'Power density', S, 'W/m²', fS(S), { symbol: 'S', note: `${sx(S * 1e-4, 'W/cm²', 4)}${duty < 1 ? ' · time-averaged' : ''}` }),
    r: item('r', 'Distance', s.r, 'm', fDist(s.r), { symbol: 'r', note: `S = ${fS(S)} here` }),
    p: item('p', 'Transmit power', s.p, 'W', sx(s.p, 'W', 4), { symbol: 'P_t', note: `${dbm(s.p).toFixed(2)} dBm · EIRP ${sx(eirp, 'W', 3)}` }),
  };
  const results: ResultItem[] = [{ ...head[solved], solved: true, primary: true }];
  if (solved !== 's') results.push({ ...head.s, key: 'sAt', primary: true });
  results.push(
    item('ratio', `% of ${s.std === 'fcc' ? 'FCC' : 'ICNIRP'} ${s.cls} limit`, ratio, '', ratio == null ? 'no limit' : pct(ratio), {
      primary: true,
      tone: ratio == null ? 'warn' : toneOf(ratio),
      note: lim ? `limit ${fS(lim.sEff)}${lim.s == null ? ' (from E/H)' : ''} at ${sx(f, 'Hz', 4)}` : `${STD_NAME[s.std]} has no limit at ${sx(f, 'Hz', 4)}`,
    }),
    item('rc', 'Compliance distance', rc, 'm', rc == null ? '—' : fDist(rc), { primary: true, symbol: 'r_c', tone: rcNear ? 'warn' : '', note: rcNear ? 'inside the near field: far-field estimate only' : 'closer than this exceeds the limit' }),
    item('e', 'Electric field (rms)', e, 'V/m', sx(e, 'V/m', 4), { symbol: 'E', group: 'Fields at r' }),
    item('h', 'Magnetic field (rms)', h, 'A/m', sx(h, 'A/m', 4), { symbol: 'H', group: 'Fields at r' }),
  );
  if (solved === 's') results.push(item('sMw', 'Power density', S * 1e-4, 'W/cm²', sx(S * 1e-4, 'W/cm²', 4), { symbol: 'S', group: 'Fields at r' }));
  results.push(
    item('eta0', 'Wave impedance', ETA0, 'Ω', sx(ETA0, 'Ω', 6), { symbol: 'η₀', group: 'Fields at r', note: 'plane wave, far field' }),
    item('eirp', 'EIRP', eirp, 'W', `${sx(eirp, 'W', 4)} (${dbm(eirp).toFixed(2)} dBm)`, { symbol: 'EIRP', group: 'Transmitter' }),
    item('pAvg', 'Time-averaged EIRP', eirp * duty, 'W', sx(eirp * duty, 'W', 4), { group: 'Transmitter', note: duty < 1 ? `δ = ${+(duty * 100).toPrecision(4)} %` : 'continuous' }),
    item('factor', 'Reflection factor', k, '', k === 1 ? '×1 (free space)' : '×2.56 (ground)', { group: 'Transmitter', symbol: 'F' }),
  );
  if (solved !== 'p') results.push(item('pDbm', 'Transmit power', dbm(s.p), 'dBm', `${dbm(s.p).toFixed(2)} dBm`, { group: 'Transmitter', symbol: 'P_t' }));
  if (lim) {
    results.push(
      item('limS', 'Limit (power density)', lim.sEff, 'W/m²', `${fS(lim.sEff)}${lim.s == null ? ' equiv.' : ''}`, { group: `Limit: ${limName}`, symbol: 'S_lim', note: lim.band }),
      ...(lim.e != null ? [item('limE', 'Limit (E field)', lim.e, 'V/m', sx(lim.e, 'V/m', 4), { group: `Limit: ${limName}`, symbol: 'E_lim' })] : []),
      ...(lim.h != null ? [item('limH', 'Limit (H field)', lim.h, 'A/m', sx(lim.h, 'A/m', 4), { group: `Limit: ${limName}`, symbol: 'H_lim' })] : []),
      item('avgTime', 'Averaging time', lim.avgMin * 60, 's', `${lim.avgMin} min`, { group: `Limit: ${limName}` }),
      item('eirpMax', 'Max EIRP at r', eirpMax, 'W', sx(eirpMax!, 'W', 4), { group: `Limit: ${limName}`, note: `P_t ≤ ${sx(eirpMax! / gLin, 'W', 3)}` }),
    );
  }
  const zone = z.fraunhofer > 0 && s.r < z.fraunhofer ? (s.r < z.reactive ? 'reactive near field' : 'radiative near field') : s.r < z.reactive ? 'reactive near field' : 'far field';
  results.push(
    item('lambda', 'Wavelength', z.lambda, 'm', sx(z.lambda, 'm', 4), { symbol: 'λ', group: 'Field region' }),
    item('rReactive', 'Reactive near field to', z.reactive, 'm', sx(z.reactive, 'm', 3), { symbol: 'λ/2π', group: 'Field region' }),
    item('rFar', 'Far field from', z.fraunhofer > 0 ? Math.max(z.fraunhofer, z.reactive) : null, 'm', z.fraunhofer > 0 ? sx(Math.max(z.fraunhofer, z.reactive), 'm', 3) : 'give D', { symbol: z.fraunhofer >= z.reactive ? '2D²/λ' : 'λ/2π', group: 'Field region', note: z.fraunhofer > 0 && z.fraunhofer < z.reactive ? 'λ/2π exceeds 2D²/λ here' : undefined }),
    item('zone', 'Point is in the', zone, '', zone, { group: 'Field region', tone: zone === 'far field' ? '' : 'warn' }),
  );
  report.results = results;

  // ── status, warnings, notes
  if (ratio == null) report.status = { text: 'NO LIMIT', tone: 'warn' };
  else report.status = exceeds(ratio) ? { text: 'EXCEEDS LIMIT', tone: 'fail' } : { text: 'COMPLIES', tone: 'pass' };
  const W = report.warnings;
  if (ratio != null && exceeds(ratio)) W.push(`S is ${pct(ratio)} of the ${limName} limit. Keep people beyond r_c = ${fDist(rc!)} (fence or mark the zone), or reduce the EIRP to ${sx(eirpMax!, 'W', 3)}.`);
  if (!lim) W.push(`${STD_NAME[s.std]} gives no limit at ${sx(f, 'Hz', 4)} (${s.std === 'fcc' ? 'Table 1 covers 0.3 MHz–100 GHz' : 'Table 5 covers 100 kHz–300 GHz'}). Check the other standard in the Tables tab or the rules that apply at this frequency.`);
  if (s.r < z.reactive) W.push(`r = ${fDist(s.r)} is inside the reactive near field (r < λ/2π = ${sx(z.reactive, 'm', 3)}): E and H are not related by η₀ and the inverse-square density is meaningless. Measure E and H separately or assess the basic restrictions (SAR).`);
  else if (z.fraunhofer > 0 && s.r < z.fraunhofer) W.push(`r = ${fDist(s.r)} is inside the radiative near field (r < 2D²/λ = ${fDist(z.fraunhofer)}): the far-field formula is only an estimate there. Use the near-field methods of FCC OET Bulletin 65 or a measurement for a compliance claim.`);
  if (rcNear) W.push(`The compliance distance r_c = ${fDist(rc!)} lies inside the ${rc! < z.reactive ? `reactive near field (λ/2π = ${fDist(z.reactive)})` : `radiative near field (2D²/λ = ${fDist(z.fraunhofer)})`}, where the far-field formula does not hold. Treat it as an estimate only: assess E and H (or SAR) near the antenna, or measure.`);
  if (s.std === 'fcc' && s.r < 0.2 && f <= 6e9) W.push('Closer than 20 cm the FCC treats a transmitter as a portable device: compliance is by SAR (47 CFR §2.1093), not by the MPE table (§1.1310(d)(2)).');
  if (s.std === 'icnirp' && lim && lim.s == null) report.notes.push('ICNIRP gives no power-density level below 30 MHz: the % uses the larger of (E/E_lim)² and (H/H_lim)², both of which must be met (Table 5 note 4).');
  if (s.std === 'icnirp' && f > 30e6 && f <= 2e9 && zone === 'radiative near field') report.notes.push('ICNIRP, 30 MHz–2 GHz, radiative near field: either S or both E and H must be within the levels (Table 5 note 5b).');
  if (duty < 1) report.notes.push(`Duty factor ${+(duty * 100).toPrecision(4)} %: S, E and H are averages over the limit’s averaging time, not peak values.`);
  report.notes.push('Far-field, main-beam estimate: one source, no body shadowing, no summation with other transmitters (sum the % of limit of every source for a site).');
  if (s.std === 'fcc') report.notes.push('FCC: the MPE limits may replace whole-body SAR from 300 kHz to 6 GHz and are always used above 6 GHz (§1.1310(d)(2)–(3)).');

  report.summary = `EIRP ${sx(eirp, 'W', 3)} at ${fDist(s.r)}, ${sx(f, 'Hz', 4)} · S ${fS(S)} · ${ratio == null ? 'no limit' : `${pct(ratio)} of ${limName} limit`}`;
  report.details = { eirp, S, e, h, k, duty, lambda: z.lambda, reactive: z.reactive, fraunhofer: z.fraunhofer, zone, limit: lim, ratio, rc, eirpMax };
  report.tables = [limitTable(f, S, eirp, k, duty, s)];
  report.graphs = graphs(s, eirp, k, duty, S, z.fraunhofer, z.reactive, lim, rc);
  return report;
}

function limitTable(f: number, S: number, eirp: number, k: number, duty: number, s: PdState): TableSpec {
  const rows: Record<string, number | string | null>[] = [];
  const display: Record<string, string>[] = [];
  const tones: ('pass' | 'warn' | 'fail' | '')[] = [];
  for (const std of ['fcc', 'icnirp'] as Standard[]) {
    for (const cls of ['general', 'occupational'] as ExposureClass[]) {
      const lim = limitOf(std, f, cls);
      const ratio = lim ? exposureRatio(lim, S) : null;
      const rc = lim ? distanceFor(eirp, lim.sEff, k, duty) : null;
      rows.push({ std: STD_NAME[std], cls: CLS_NAME[cls], band: lim?.band ?? 'none', lim: lim?.sEff ?? null, elim: lim?.e ?? null, ratio: ratio == null ? null : ratio * 100, rc, avg: lim?.avgMin ?? null });
      display.push({
        std: STD_NAME[std] + (std === s.std && cls === s.cls ? ' ◀' : ''),
        cls: CLS_NAME[cls],
        band: lim?.band ?? 'outside table',
        lim: lim ? `${fS(lim.sEff)}${lim.s == null ? ' equiv.' : ''}` : '—',
        elim: lim?.e != null ? sx(lim.e, 'V/m', 3) : '—',
        ratio: ratio == null ? '—' : pct(ratio),
        rc: rc == null ? '—' : fDist(rc),
        avg: lim ? `${lim.avgMin} min` : '—',
      });
      tones.push(ratio == null ? '' : toneOf(ratio));
    }
  }
  return {
    id: 'limits',
    title: `Exposure at ${fDist(s.r)} against every limit at ${sx(f, 'Hz', 4)}`,
    columns: [
      { key: 'std', label: 'Standard', align: 'left' },
      { key: 'cls', label: 'Class', align: 'left' },
      { key: 'band', label: 'Table row', align: 'left' },
      { key: 'lim', label: 'S limit', unit: 'W/m²' },
      { key: 'elim', label: 'E limit', unit: 'V/m' },
      { key: 'ratio', label: '% of limit', unit: '%' },
      { key: 'rc', label: 'Compliance distance', unit: 'm' },
      { key: 'avg', label: 'Averaging', unit: 'min' },
    ],
    rows,
    display,
    rowTones: tones,
    note: 'FCC 47 CFR §1.1310 Table 1 and ICNIRP 2020 Table 5. Green: below 50 % of the limit; yellow: 50–100 %; red: above the limit. ◀ marks the limit selected on the left. ICNIRP below 30 MHz has only E and H levels; the S column then shows the equivalent plane-wave density of the binding one.',
  };
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

function graphs(s: PdState, eirp: number, k: number, duty: number, S: number, ff: number, reactive: number, lim: Limit | null, rc: number | null): GraphSpec[] {
  // 1 — density vs distance
  const r0 = Math.max(Math.min(s.r, rc ?? s.r, reactive) / 10, R_MIN / 10);
  const r1 = Math.max(s.r, rc ?? 0, ff) * 20;
  const rs = logspace(r0, r1, 181);
  const other = limitOf(s.std, s.f, s.cls === 'general' ? 'occupational' : 'general');
  const dist: GraphSpec = {
    id: 'density-vs-distance',
    title: 'Density vs distance',
    x: { label: 'Distance r', unit: 'm', log: true },
    y: [{ id: 's', label: 'Power density S', unit: 'W/m²', log: true }],
    series: [{ label: 'S (far-field formula)', x: rs, y: rs.map((r) => density(eirp, r, k, duty)), axis: 's', width: 2.2 }],
    hlines: [
      ...(lim ? [{ value: lim.sEff, label: `${s.std === 'fcc' ? 'FCC' : 'ICNIRP'} ${s.cls} ${fS(lim.sEff)}`, axis: 's', color: '#8b1e1e', dash: [6, 4], width: 1.4 }] : []),
      ...(other ? [{ value: other.sEff, label: `${s.cls === 'general' ? 'occupational' : 'general'} ${fS(other.sEff)}`, axis: 's', color: '#9a8f7a', dash: [3, 3], width: 1 }] : []),
    ],
    vlines: [
      { value: s.r, label: `r = ${fDist(s.r)}`, color: '#1f4e5f' },
      ...(ff > 0 ? [{ value: ff, label: '2D²/λ', color: '#c47b17', dash: [4, 3] }] : []),
      { value: reactive, label: 'λ/2π', color: '#9a8f7a', dash: [2, 3] },
    ],
    markers: [{ x: s.r, y: S, axis: 's', label: fS(S) }],
  };
  // 2 — the limits across frequency
  const fs = logspace(1e5, 3e11, 400);
  const lims = [s.f, 0.3e6, 1.34e6, 3e6, 30e6, 300e6, 400e6, 1.5e9, 2e9, 100e9].filter((x) => x > 1e5 && x < 3e11);
  const fx = [...fs, ...lims].sort((a, b) => a - b);
  const curve = (std: Standard, cls: ExposureClass) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const f of fx) {
      const l = limitOf(std, f, cls);
      if (l) xs.push(f), ys.push(l.sEff);
    }
    return { x: xs, y: ys };
  };
  const pick = (std: Standard, cls: ExposureClass) => std === s.std && cls === s.cls;
  const lf: GraphSpec = {
    id: 'limits-vs-frequency',
    title: 'Limits vs frequency',
    subtitle: 'As power density (ICNIRP < 30 MHz: plane-wave equivalent of the E/H level)',
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 's', label: 'Limit', unit: 'W/m²', log: true }],
    series: [
      { label: 'FCC general', ...curve('fcc', 'general'), axis: 's', color: '#8b1e1e', width: pick('fcc', 'general') ? 2.4 : 1.3 },
      { label: 'FCC occupational', ...curve('fcc', 'occupational'), axis: 's', color: '#c47b17', width: pick('fcc', 'occupational') ? 2.4 : 1.3 },
      { label: 'ICNIRP general', ...curve('icnirp', 'general'), axis: 's', color: '#1f4e5f', width: pick('icnirp', 'general') ? 2.4 : 1.3, dash: [5, 3] },
      { label: 'ICNIRP occupational', ...curve('icnirp', 'occupational'), axis: 's', color: '#6b5b95', width: pick('icnirp', 'occupational') ? 2.4 : 1.3, dash: [5, 3] },
    ],
    vlines: [{ value: s.f, label: sx(s.f, 'Hz', 4), color: '#4f8a8b' }],
    markers: [{ x: s.f, y: S, axis: 's', label: `S at r: ${fS(S)}` }],
  };
  return [dist, lf];
}

export const def: CalcDef<PdState> = {
  id: ID,
  version: '0.1.0',
  method: 'Far-field S = F·EIRP/(4πr²) (F = 2.56 with ground reflection), E = √(Sη₀), H = E/η₀ (FCC OET Bulletin 65, 1997); limits from FCC 47 CFR §1.1310 Table 1 and ICNIRP 2020 Table 5; zones λ/2π and 2D²/λ (ICNIRP 2020 App. A).',
  fields,
  defaults,
  solve: { options: [{ key: 's', label: 'Power density' }, { key: 'r', label: 'Distance' }, { key: 'p', label: 'Transmit power' }], default: 's', analysis: 's' },
  compute,
  examples: [
    { id: 'default', label: '2.4 GHz AP, 1 W + 8 dBi at 1 m (FCC general)', state: defaults() },
    { id: 'lora-20cm', label: '915 MHz LoRa gateway at 20 cm: over the limit', state: { solveFor: 's', p: 1, g: 6, duty: 100, r: 0.2, rUnit: 'cm', f: 915e6, fUnit: 'MHz', d: 0.17, dUnit: 'cm', ground: 'free', std: 'fcc', cls: 'general' } },
    { id: 'fm-broadcast', label: 'FM 98 MHz, 10 kW + 6 dBi, ground: distance to 2 W/m²', state: { solveFor: 'r', p: 10e3, g: 6, duty: 100, s: 2, sUnit: 'W/m²', f: 98e6, fUnit: 'MHz', d: 3, dUnit: 'm', ground: 'ground', std: 'fcc', cls: 'general' } },
    { id: 'sector-occupational', label: 'Rooftop sector 40 W, 17 dBi at 1.95 GHz: worker distance', state: { solveFor: 'r', p: 40, g: 17, duty: 100, s: 50, sUnit: 'W/m²', f: 1.95e9, fUnit: 'GHz', d: 1.3, dUnit: 'm', ground: 'free', std: 'fcc', cls: 'occupational' } },
    { id: 'hf-amateur', label: '14.2 MHz dipole at 5 m: power for the ICNIRP level', state: { solveFor: 'p', g: 2.15, duty: 50, r: 5, rUnit: 'm', s: icnirpLimit(14.2e6, 'general')!.sEff, sUnit: 'W/m²', f: 14.2e6, fUnit: 'MHz', d: 10.6, dUnit: 'm', ground: 'ground', std: 'icnirp', cls: 'general' } },
    { id: 'mmwave', label: '28 GHz 5G array, 25 dBi EIRP 55 dBm at 3 m (ICNIRP)', state: { solveFor: 's', p: 1, g: 25, duty: 100, r: 3, rUnit: 'm', f: 28e9, fUnit: 'GHz', d: 0.1, dUnit: 'cm', ground: 'free', std: 'icnirp', cls: 'general' } },
  ],
};
