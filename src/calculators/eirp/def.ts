/** EIRP / ERP calculator — definition (inputs, solve-for, report). DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_FREQ, withDefault } from '@/core/unitsets';
import { DIPOLE_DBI, LIMITS, dbmToW, eirpDbm, margin, maxGain, maxPt, wToDbm, type Chain, type LimitId, type LimitOpts } from './model';

export const ID = 'antenna/eirp-calculator';

export type SolveKey = 'eirp' | 'pt' | 'g' | 'lc';

export interface EirpState {
  solveFor: SolveKey;
  /** how the transmit power is entered */
  ptForm: 'dBm' | 'W';
  pt: number;
  ptW: number;
  lc: number;
  lo: number;
  gForm: 'dBi' | 'dBd';
  g: number;
  gd: number;
  /** EIRP, dBm: target (solve pt / g / lc) or result */
  eirp: number;
  limit: LimitId;
  /** user limit, dBm (EIRP or ERP) */
  lim: number;
  /** occupied bandwidth, Hz (for the ETSI PSD limit) */
  bw: number;
  bwUnit: string;
}

export const defaults = (): EirpState => ({
  solveFor: 'eirp',
  ptForm: 'dBm',
  pt: 20,
  ptW: 0.1,
  lc: 1.5,
  lo: 0.5,
  gForm: 'dBi',
  g: 8,
  gd: 8 - DIPOLE_DBI,
  eirp: 26,
  limit: 'fcc-dts',
  lim: 36,
  bw: 20e6,
  bwUnit: 'MHz',
});

const LIM = { pt: [-100, 100] as const, g: [-50, 70] as const, lc: [0, 100] as const };
/** EIRP box range: P_t − L_c − L_o + G spans −100 − 200 − 50 … 100 + 70 dBm with the input limits. */
const EIRP_LIM = [-400, 200] as const;
const db = (v: number, d = 2) => `${v.toFixed(d)}`.replace('-', '−');
const fW = (dbm: number) => si(dbmToW(dbm), 'W', 4);

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Transmitter',
    note: 'Tx → cable → connectors → antenna. ◎ picks the unknown.',
    fields: [
      { kind: 'select', key: 'ptForm', label: 'Enter power in', options: [{ value: 'dBm', label: 'dBm' }, { value: 'W', label: 'watts' }], structural: true },
      { kind: 'number', key: 'pt', symbol: 'P_t', label: 'Transmit power', suffix: 'dBm', solvable: true, min: LIM.pt[0], max: LIM.pt[1], visible: (_s, r) => r.ptForm !== 'W', help: 'Conducted power at the transmitter’s antenna port. 30 dBm = 1 W, 20 dBm = 100 mW, 0 dBm = 1 mW.' },
      { kind: 'number', key: 'ptW', symbol: 'P_t', label: 'Transmit power', unit: 'W', solvable: true, min: 1e-13, max: 1e7, visible: (_s, r) => r.ptForm === 'W', solvedWhen: (_s, r) => r.solveFor === 'pt', onSolve: (_s, r) => { r.solveFor = 'pt'; }, help: 'Conducted power at the transmitter’s antenna port, in watts (accepts 100m, 2.5, 1k…).' },
    ],
  },
  {
    kind: 'section',
    title: 'Feed losses',
    fields: [
      { kind: 'number', key: 'lc', symbol: 'L_c', label: 'Cable loss', suffix: 'dB', solvable: true, min: LIM.lc[0], max: LIM.lc[1], help: 'Loss of the cable at the operating frequency (length × dB per metre from its data sheet). When solved: the attenuation needed to bring the EIRP to the target.' },
      { kind: 'number', key: 'lo', symbol: 'L_o', label: 'Other losses', suffix: 'dB', min: 0, max: 100, help: 'Connectors (≈ 0.1–0.25 dB each), lightning arrestor, filter, splitter, mismatch loss.' },
    ],
  },
  {
    kind: 'section',
    title: 'Antenna',
    fields: [
      { kind: 'select', key: 'gForm', label: 'Gain given in', options: [{ value: 'dBi', label: 'dBi (isotropic)' }, { value: 'dBd', label: 'dBd (half-wave dipole)' }], structural: true },
      { kind: 'number', key: 'g', symbol: 'G', label: 'Antenna gain', suffix: 'dBi', solvable: true, min: LIM.g[0], max: LIM.g[1], visible: (_s, r) => r.gForm !== 'dBd', help: 'Gain relative to an isotropic radiator, in the direction of interest (normally the peak).' },
      { kind: 'number', key: 'gd', symbol: 'G', label: 'Antenna gain', suffix: 'dBd', solvable: true, min: LIM.g[0] - DIPOLE_DBI, max: LIM.g[1] - DIPOLE_DBI, visible: (_s, r) => r.gForm === 'dBd', solvedWhen: (_s, r) => r.solveFor === 'g', onSolve: (_s, r) => { r.solveFor = 'g'; }, help: 'Gain relative to a half-wave dipole: dBi = dBd + 2.15.' },
    ],
  },
  {
    kind: 'section',
    title: 'EIRP & limit',
    fields: [
      { kind: 'number', key: 'eirp', symbol: 'EIRP', label: 'Radiated', suffix: 'dBm', solvable: true, min: EIRP_LIM[0], max: EIRP_LIM[1], help: 'Equivalent isotropically radiated power. Calculated in analysis; the target when solving for P_t, G or L_c.' },
      { kind: 'select', key: 'limit', label: 'Limit', options: (Object.keys(LIMITS) as LimitId[]).map((k) => ({ value: k, label: LIMITS[k].label })), help: 'FCC 47 CFR 15.247 limits the conducted power (with a reduction for antenna gain above 6 dBi); ETSI EN 300 328 limits the e.i.r.p. Other rules: enter them as a user EIRP or ERP limit.' },
      { kind: 'number', key: 'lim', symbol: 'P_max', label: 'Limit value', suffix: 'dBm', min: -100, max: 150, visible: (_s, r) => r.limit === 'user-eirp' || r.limit === 'user-erp', help: 'Your regulatory limit in dBm (EIRP or ERP, as selected above). 36 dBm = 4 W, 27 dBm = 500 mW, 14 dBm = 25 mW.' },
      { kind: 'number', key: 'bw', symbol: 'B', label: 'Bandwidth', units: withDefault(U_FREQ, 'MHz'), unitKey: 'bwUnit', unitFamily: 'none', min: 1e3, max: 1e9, visible: (_s, r) => r.limit === 'etsi-328', help: 'Occupied bandwidth of the signal, for the EN 300 328 limit of 10 dBm per MHz e.i.r.p. (§4.3.2.3.3). Power is assumed spread evenly over it; below 1 MHz all of it counts in one MHz.' },
    ],
  },
];

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

/** Keep the hidden alternative forms (W ↔ dBm, dBd ↔ dBi) in step with the visible one. */
function syncForms(s: EirpState): void {
  if (s.ptForm === 'W') {
    if (typeof s.ptW === 'number' && s.ptW > 0) s.pt = wToDbm(s.ptW);
  } else if (typeof s.pt === 'number' && Number.isFinite(s.pt)) s.ptW = dbmToW(s.pt);
  if (s.gForm === 'dBd') {
    if (typeof s.gd === 'number' && Number.isFinite(s.gd)) s.g = s.gd + DIPOLE_DBI;
  } else if (typeof s.g === 'number' && Number.isFinite(s.g)) s.gd = s.g - DIPOLE_DBI;
}

/** No answer: solved boxes show "—" (value null) and keep the last answer in the state, so a round trip from such a state is not expected to reproduce it. */
function fail(s: EirpState, msg: string): CalcReport {
  const r: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } };
  r.warnings.push(msg);
  const keys = s.solveFor === 'pt' ? ['pt', 'ptW'] : s.solveFor === 'g' ? ['g', 'gd'] : [s.solveFor];
  const label: Record<string, string> = { pt: 'Transmit power', ptW: 'Transmit power (W)', g: 'Antenna gain', gd: 'Antenna gain (dBd)', lc: 'Cable loss', eirp: 'EIRP' };
  for (const k of keys) r.results.push({ key: k, label: label[k] ?? k, value: null, display: '—', primary: true, solved: true });
  return r;
}

export function compute(st: EirpState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

function run(st: EirpState): CalcReport {
  const s: EirpState = { ...st };
  if (!['eirp', 'pt', 'g', 'lc'].includes(s.solveFor)) throw new Error(`Unknown solve-for key "${String(s.solveFor)}".`);
  if (!LIMITS[s.limit]) throw new Error(`Unknown limit "${String(s.limit)}".`);
  if (s.ptForm === 'W' && s.solveFor !== 'pt' && !(finite('Transmit power', s.ptW) > 0)) throw new Error('Transmit power must be > 0 W.');
  syncForms(s);
  const need = (k: 'pt' | 'lc' | 'lo' | 'g' | 'eirp' | 'lim', name: string) => finite(name, s[k]);
  if (s.solveFor !== 'pt') need('pt', 'Transmit power');
  if (s.solveFor !== 'lc') need('lc', 'Cable loss');
  if (s.solveFor !== 'g') need('g', 'Antenna gain');
  if (s.solveFor !== 'eirp') need('eirp', 'Target EIRP');
  need('lo', 'Other losses');
  need('lim', 'Limit value');
  if (s.limit === 'etsi-328' && !(typeof s.bw === 'number' && s.bw > 0)) throw new Error('Occupied bandwidth must be > 0.');
  const opts: LimitOpts = { user: s.lim, bw: s.bw };
  if (s.solveFor !== 'lc' && s.lc < 0) throw new Error('Cable loss must be ≥ 0 dB (a gain is not a loss).');
  if (s.lo < 0) throw new Error('Connector and other losses must be ≥ 0 dB.');

  // ── solve (each unknown enters EIRP linearly, so the inverse is exact)
  if (s.solveFor === 'pt') {
    s.pt = s.eirp + s.lc + s.lo - s.g;
    if (!(s.pt >= LIM.pt[0] && s.pt <= LIM.pt[1])) return fail(s, `EIRP ${db(s.eirp)} dBm would need P_t = ${db(s.pt)} dBm, outside −100 … +100 dBm.`);
  } else if (s.solveFor === 'g') {
    s.g = s.eirp - s.pt + s.lc + s.lo;
    if (!(s.g >= LIM.g[0] && s.g <= LIM.g[1])) return fail(s, `EIRP ${db(s.eirp)} dBm would need an antenna gain of ${db(s.g)} dBi, outside −50 … +70 dBi. Change the transmit power instead.`);
  } else if (s.solveFor === 'lc') {
    const lc = s.pt - s.lo + s.g - s.eirp;
    if (lc < 0) return fail(s, `The chain already gives only ${db(s.pt - s.lo + s.g)} dBm with a lossless cable, ${db(-lc)} dB short of the ${db(s.eirp)} dBm target: no cable loss can reach it. Raise P_t or the antenna gain.`);
    if (lc > LIM.lc[1]) return fail(s, `The target needs ${db(lc)} dB of attenuation, more than 100 dB. Lower the transmit power instead.`);
    s.lc = lc;
  }
  s.ptW = dbmToW(s.pt);
  s.gd = s.g - DIPOLE_DBI;
  const c: Chain = { pt: s.pt, lc: s.lc, lo: s.lo, g: s.g };
  const eirp = eirpDbm(c);
  if (s.solveFor === 'eirp') s.eirp = eirp;
  const erp = eirp - DIPOLE_DBI;
  const pAnt = s.pt - s.lc - s.lo;
  const rule = LIMITS[s.limit];
  const m = margin(c, s.limit, opts);
  const pass = m >= -1e-9;
  const limVal = rule.max(c.g, opts);
  const ptMax = maxPt(c, s.limit, opts);
  const gMax = maxGain(c, s.limit, opts);

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const { warnings, notes } = report;
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });

  // ── headline
  const primary: ResultItem[] = [];
  if (s.solveFor === 'pt') primary.push(item('pt', 'Transmit power', s.pt, 'dBm', `${db(s.pt)} dBm`, { symbol: 'P_t', primary: true, solved: true, note: fW(s.pt) }));
  if (s.solveFor === 'g') primary.push(item('g', 'Antenna gain', s.g, 'dBi', `${db(s.g)} dBi`, { symbol: 'G', primary: true, solved: true, note: `${db(s.gd)} dBd` }));
  if (s.solveFor === 'lc') primary.push(item('lc', 'Cable loss', s.lc, 'dB', `${db(s.lc)} dB`, { symbol: 'L_c', primary: true, solved: true, note: 'attenuation that meets the target' }));
  primary.push(item('eirp', 'EIRP', eirp, 'dBm', `${db(eirp)} dBm`, { symbol: 'EIRP', primary: true, solved: s.solveFor === 'eirp', note: `${fW(eirp)} · ${db(eirp - 30)} dBW` }));
  primary.push(item('erp', 'ERP', erp, 'dBm', `${db(erp)} dBm`, { symbol: 'ERP', primary: true, note: `${fW(erp)} · re half-wave dipole` }));
  primary.push(item('margin', 'Margin to limit', m, 'dB', `${m >= -1e-9 ? '+' : '−'}${Math.abs(m).toFixed(2)} dB`, { primary: true, tone: pass ? 'pass' : 'fail', note: `${rule.ref === 'conducted' ? 'conducted P_t' : rule.ref.toUpperCase()} ≤ ${db(limVal)} dBm (${rule.cite})` }));
  report.status = pass ? { text: 'WITHIN LIMIT', tone: 'pass' } : { text: 'OVER LIMIT', tone: 'fail' };

  // hidden alternate forms are solved results too, so the visible box updates in either entry form
  const rest: ResultItem[] = [];
  if (s.solveFor === 'pt') rest.push(item('ptW', 'Transmit power (W)', s.ptW, 'W', si(s.ptW, 'W', 4), { symbol: 'P_t', group: 'Levels', solved: true }));
  if (s.solveFor === 'g') rest.push(item('gd', 'Antenna gain (dBd)', s.gd, 'dBd', `${db(s.gd)} dBd`, { symbol: 'G', group: 'Antenna', solved: true }));
  rest.push(
    item('ptDbm', 'Transmit power', s.pt, 'dBm', `${db(s.pt)} dBm · ${db(s.pt - 30)} dBW · ${fW(s.pt)}`, { symbol: 'P_t', group: 'Levels' }),
    item('lossTotal', 'Total feed loss', s.lc + s.lo, 'dB', `${db(s.lc + s.lo)} dB`, { symbol: 'L', group: 'Levels', note: `${(100 * (1 - 10 ** (-(s.lc + s.lo) / 10))).toFixed(1)} % of P_t lost` }),
    item('pAnt', 'Power into antenna', pAnt, 'dBm', `${db(pAnt)} dBm · ${fW(pAnt)}`, { symbol: 'P_ant', group: 'Levels' }),
    item('eirpW', 'EIRP (watts)', dbmToW(eirp), 'W', `${fW(eirp)} · ${db(eirp - 30)} dBW`, { group: 'Levels' }),
    item('erpW', 'ERP (watts)', dbmToW(erp), 'W', `${fW(erp)} · ${db(erp - 30)} dBW`, { group: 'Levels' }),
    item('gDbi', 'Antenna gain', s.g, 'dBi', `${db(s.g)} dBi · ${db(s.gd)} dBd · ×${(10 ** (s.g / 10)).toPrecision(4)}`, { symbol: 'G', group: 'Antenna' }),
  );
  const g = 'Limit';
  rest.push(
    item('limitRule', 'Rule', s.limit, '', rule.label, { group: g, note: rule.cite }),
    item('limitValue', `Allowed ${rule.ref === 'conducted' ? 'conducted power' : rule.ref.toUpperCase()}`, limVal, 'dBm', `${db(limVal)} dBm (${fW(limVal)})`, { group: g, note: rule.ref === 'conducted' && s.limit !== 'fcc-p2p-58' ? `with G = ${db(s.g)} dBi` : undefined }),
    item('ptMax', 'Max transmit power', ptMax, 'dBm', `${db(ptMax)} dBm (${fW(ptMax)})`, { group: g, note: 'with this antenna and feed', tone: s.pt > ptMax + 1e-9 ? 'fail' : '' }),
    item('gMax', 'Max antenna gain', gMax != null && Number.isFinite(gMax) ? gMax : null, 'dBi', gMax == null ? '— (P_t alone exceeds the limit)' : Number.isFinite(gMax) ? `${db(gMax)} dBi` : 'no limit', { group: g, note: 'at this transmit power', tone: gMax != null && s.g > gMax + 1e-9 ? 'fail' : '' }),
  );
  if (rule.ref === 'conducted') rest.push(item('eirpAllowed', 'Equivalent EIRP ceiling', limVal - s.lc - s.lo + s.g, 'dBm', `${db(limVal - s.lc - s.lo + s.g)} dBm`, { group: g, note: 'max conducted power after this feed and antenna' }));
  report.results = [...primary, ...rest];

  // ── warnings and notes
  if (!pass) {
    const fix = rule.ref === 'conducted'
      ? `Reduce the transmit power to ${db(ptMax)} dBm${gMax != null && Number.isFinite(gMax) && s.g > gMax ? ` or use an antenna of at most ${db(gMax)} dBi` : ''}.`
      : `Reduce the transmit power by ${(-m).toFixed(2)} dB (to ${db(ptMax)} dBm), add feed loss, or use a lower-gain antenna (≤ ${db(gMax ?? s.g + m)} dBi).`;
    warnings.push(`${rule.ref === 'conducted' ? `Conducted power ${db(s.pt)} dBm` : `${rule.ref.toUpperCase()} ${db(rule.ref === 'eirp' ? eirp : erp)} dBm`} exceeds the ${rule.label} limit of ${db(limVal)} dBm by ${(-m).toFixed(2)} dB. ${fix}`);
  }
  if (rule.ref === 'conducted') {
    notes.push('FCC 15.247 limits the conducted output power of the intentional radiator, reduced for directional gain above 6 dBi. It is applied here to P_t as entered, so cable loss earns no credit, which is the conservative reading. The rule covers only 902–928, 2400–2483.5 and 5725–5850 MHz.');
    if (s.limit === 'fcc-p2p-24' || s.limit === 'fcc-p2p-58') notes.push('The point-to-point relief of §15.247(c)(1) applies only to exclusively fixed point-to-point links. Point-to-multipoint, omnidirectional and co-located multiple-radiator systems use the standard rule (§15.247(c)(1)(iii)).');
  }
  if (s.limit === 'etsi-328' || s.limit === 'etsi-328-fhss') notes.push('EN 300 328 limits the mean e.i.r.p. during a transmission burst (§4.3.1.2.2 FHSS, §4.3.2.2.2 other wideband modulations), including the antenna assembly, so this is compared with the EIRP.');
  if (s.limit === 'etsi-328') {
    const psd = eirp - 10 * Math.log10(Math.max(s.bw, 1e6) / 1e6);
    report.results.push(item('psd', 'PSD (flat spectrum)', psd, 'dBm/MHz', `${db(psd)} dBm/MHz`, { group: 'Limit', note: `limit 10 dBm/MHz over ${si(s.bw, 'Hz', 3)}`, tone: psd > 10 + 1e-9 ? 'fail' : '' }));
    notes.push(`EN 300 328 also caps the PSD of non-FHSS equipment at 10 dBm per MHz e.i.r.p. (§4.3.2.3.3). With ${si(s.bw, 'Hz', 3)} occupied, that allows ${db(10 + 10 * Math.log10(Math.max(s.bw, 1e6) / 1e6))} dBm, so the ${10 + 10 * Math.log10(Math.max(s.bw, 1e6) / 1e6) < 20 ? 'PSD limit' : '20 dBm power limit'} is the binding one. A real spectrum is not flat: check the PSD peak.`);
  }
  if (s.lc + s.lo > 10) warnings.push(`The feed loses ${db(s.lc + s.lo)} dB (${(100 * (1 - 10 ** (-(s.lc + s.lo) / 10))).toFixed(0)} % of the power). Use a shorter or lower-loss cable, or mount the radio at the antenna.`);
  if (s.g < -10) notes.push('Gain below −10 dBi is typical only of chip or very small antennas; check the radiation efficiency from the antenna data sheet.');
  notes.push(
    'EIRP = P_t − L_c − L_o + G; ERP = EIRP − 2.15 dB, since a half-wave dipole has 2.15 dBi gain. Gains are peak values in the direction of interest.',
    'Mismatch loss (VSWR) and duty cycle are not included; add the mismatch to “Other losses” if it matters.',
  );
  report.summary = `${db(s.pt)} dBm − ${db(s.lc + s.lo)} dB + ${db(s.g)} dBi = ${db(eirp)} dBm EIRP (${fW(eirp)}) · ${rule.label}: ${pass ? 'within' : 'over'} by ${Math.abs(m).toFixed(2)} dB`;
  report.details = { pt: s.pt, ptW: s.ptW, lc: s.lc, lo: s.lo, g: s.g, gd: s.gd, eirp, erp, pAnt, margin: m, limitValue: limVal, ptMax, gMax };
  report.graphs = graphs(s, c, eirp);
  return report;
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

function graphs(s: EirpState, c: Chain, eirp: number): GraphSpec[] {
  const opts: LimitOpts = { user: s.lim, bw: s.bw };
  const rule = LIMITS[s.limit];
  const g0 = Math.min(-5, s.g - 10);
  const g1 = Math.max(30, s.g + 10);
  const gs = linspace(g0, g1, 141);
  if (!gs.includes(6)) gs.push(6);
  gs.sort((a, b) => a - b);
  const limEirp = (g: number) => {
    const lim = rule.max(g, opts);
    return rule.ref === 'conducted' ? lim - c.lc - c.lo + g : rule.ref === 'eirp' ? lim : lim + DIPOLE_DBI;
  };
  const out: GraphSpec[] = [];
  out.push({
    id: 'eirp-gain',
    title: 'EIRP vs antenna gain',
    subtitle: `Pt ${db(c.pt)} dBm, feed loss ${db(c.lc + c.lo)} dB`,
    x: { label: 'Antenna gain', unit: 'dBi' },
    y: [{ id: 'p', label: 'EIRP', unit: 'dBm' }],
    series: [
      { label: 'EIRP', x: gs, y: gs.map((g) => c.pt - c.lc - c.lo + g), width: 2.2, color: '#1f4e5f' },
      { label: `Limit (${rule.ref === 'eirp' ? 'EIRP' : rule.ref === 'erp' ? 'ERP + 2.15 dB' : 'max conducted → EIRP'})`, x: gs, y: gs.map(limEirp), width: 1.6, color: '#8b1e1e', dash: [6, 4] },
    ],
    vlines: [{ value: c.g, label: `G = ${db(c.g)} dBi`, color: '#9a8f7a' }],
    markers: [{ x: c.g, y: eirp, axis: 'p', label: `${db(eirp)} dBm` }],
  });
  const maxP = (g: number) => maxPt({ ...c, g }, s.limit, opts);
  out.push({
    id: 'max-pt',
    title: 'Max transmit power',
    subtitle: `Highest Pt the limit allows vs antenna gain (${rule.label})`,
    x: { label: 'Antenna gain', unit: 'dBi' },
    y: [{ id: 'p', label: 'Max Pt', unit: 'dBm' }],
    series: [{ label: 'Max Pt', x: gs, y: gs.map(maxP), width: 2.2, color: '#8b1e1e', dash: [6, 4] }],
    hlines: [{ value: c.pt, label: `Pt = ${db(c.pt)} dBm`, color: '#1f4e5f', dash: [3, 3] }],
    vlines: [{ value: c.g, label: `G = ${db(c.g)} dBi`, color: '#9a8f7a' }],
    markers: [{ x: c.g, y: c.pt, axis: 'p', label: 'now' }],
  });
  const xs = [0, 1, 2, 3];
  const ys = [c.pt, c.pt - c.lc, c.pt - c.lc - c.lo, eirp];
  out.push({
    id: 'levels',
    title: 'Level diagram',
    subtitle: '0 = Tx output · 1 = after cable · 2 = into antenna · 3 = EIRP',
    x: { label: 'Point in the chain', unit: '', integer: true },
    y: [{ id: 'p', label: 'Level', unit: 'dBm' }],
    series: [{ label: 'Level', x: xs, y: ys, width: 2.2, color: '#1f4e5f' }],
    hlines: rule.ref !== 'conducted' ? [{ value: rule.ref === 'eirp' ? rule.max(c.g, opts) : rule.max(c.g, opts) + DIPOLE_DBI, label: `${rule.ref === 'erp' ? 'ERP limit + 2.15' : 'EIRP limit'}`, color: '#8b1e1e', dash: [6, 4] }] : [{ value: rule.max(c.g, opts), label: 'conducted limit', color: '#8b1e1e', dash: [6, 4] }],
    markers: xs.map((x, i) => ({ x, y: ys[i], axis: 'p', label: `${db(ys[i], 1)} dBm` })),
    xRange: [-0.2, 3.2],
  });
  return out;
}

export const def: CalcDef<EirpState> = {
  id: ID,
  version: '0.1.0',
  method:
    'EIRP = P_t − L_c − L_o + G (dBm); ERP = EIRP − 2.15 dB (half-wave dipole 2.15 dBi, ITU RR Art. 1, Balanis §4.6); exact inverses for P_t, G and L_c; limits from the rule text of 47 CFR 15.247(b)(1)–(b)(4), (c)(1)(i)–(iii) (conducted power, 6 dBi gain rule) and ETSI EN 300 328 V2.2.2 §4.3.1.2.3 / §4.3.2.2.3 (20 dBm e.i.r.p.) and §4.3.2.3.3 (10 dBm/MHz PSD, flat spectrum over the occupied bandwidth), or a user EIRP / ERP limit.',
  fields,
  defaults,
  solve: {
    default: 'eirp',
    analysis: 'eirp',
    options: [
      { key: 'eirp', label: 'EIRP and ERP from the chain (analysis)' },
      { key: 'pt', label: 'Transmit power for a target EIRP' },
      { key: 'g', label: 'Antenna gain for a target EIRP' },
      { key: 'lc', label: 'Cable loss for a target EIRP' },
    ],
  },
  compute,
  sync: syncForms,
  examples: [
    { id: 'wifi-ap', label: '2.4 GHz access point, 8 dBi panel, FCC 15.247', state: defaults() },
    { id: 'p2p-24', label: '2.4 GHz point-to-point: 200 mW into a 24 dBi dish, FCC (c)(1)(i)', state: { solveFor: 'eirp', ptForm: 'W', ptW: 0.2, pt: 10 * Math.log10(200), lc: 2, lo: 0.5, gForm: 'dBi', g: 24, gd: 24 - DIPOLE_DBI, limit: 'fcc-p2p-24', lim: 36 } },
    { id: 'etsi-max-pt', label: 'ETSI EN 300 328: max Tx power for 20 dBm EIRP with a 5 dBi antenna', state: { solveFor: 'pt', ptForm: 'dBm', eirp: 20, lc: 0.5, lo: 0.3, gForm: 'dBi', g: 5, limit: 'etsi-328', lim: 20 } },
    { id: 'srd-868-erp', label: '868 MHz SRD: gain allowed for 25 mW ERP (14 dBm), 12 dBm radio', state: { solveFor: 'g', ptForm: 'dBm', pt: 12, eirp: 14 + DIPOLE_DBI, lc: 0.8, lo: 0.2, gForm: 'dBd', limit: 'user-erp', lim: 14 } },
    { id: 'over-limit', label: 'Over the limit: 30 dBm into a 14 dBi Yagi, FCC 15.247', state: { solveFor: 'eirp', ptForm: 'dBm', pt: 30, lc: 1, lo: 0.4, gForm: 'dBi', g: 14, limit: 'fcc-dts', lim: 36 } },
    { id: 'pad-for-eirp', label: 'Attenuator needed for 36 dBm EIRP: 27 dBm radio, 19 dBi panel', state: { solveFor: 'lc', ptForm: 'dBm', pt: 27, lo: 0.5, eirp: 36, gForm: 'dBi', g: 19, limit: 'user-eirp', lim: 36 } },
  ],
};
