/** Decoupling capacitor bank vs target impedance — calculator definition. DOM-free. */

import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_CAP, U_FREQ, U_IND, U_LEN_PCB, U_OHM, withDefault } from '@/core/unitsets';
import { absC, bankZ, type CapGroup, groupZ, type Mount, mountL, peakSeeds, peaks, srf, targetZ, worstInBand } from './model';

export type DecapSolve = 'zt' | 'dI' | 'n';

export interface Group {
  pkg: string;
  n: number;
  c: number;
  cUnit: string;
  esr: number;
  esrUnit: string;
  esl: number;
  eslUnit: string;
}

export interface DecapState {
  solveFor: DecapSolve;
  solveGroup: number;
  v: number;
  ripple: number;
  dI: number;
  zt: number;
  ztUnit: string;
  fLo: number;
  fLoUnit: string;
  fHi: number;
  fHiUnit: string;
  groups: Group[];
  h: number;
  hUnit: string;
  dv: number;
  dvUnit: string;
  s: number;
  sUnit: string;
  len: number;
  lenUnit: string;
  w: number;
  wUnit: string;
  cp: number;
  cpUnit: string;
  lsp: number;
  lspUnit: string;
}

/**
 * Typical intrinsic ESL of standard two-terminal MLCCs by case size (order of magnitude from manufacturers’
 * impedance data; a particular part can differ by ±30 % — use its datasheet SRF: ESL = 1/((2π f_SRF)² C)).
 * Body length is for the drawing only; pitch is the approximate pad centre distance of a nominal IPC-7351 land
 * pattern, the smallest sensible via spacing for a two-via layout (vias in or beside the pads).
 */
export const PKG: Record<string, { esl: number; body: number; pitch: number }> = {
  '0201': { esl: 0.25e-9, body: 0.6e-3, pitch: 0.6e-3 },
  '0402': { esl: 0.4e-9, body: 1.0e-3, pitch: 0.95e-3 },
  '0603': { esl: 0.55e-9, body: 1.6e-3, pitch: 1.5e-3 },
  '0805': { esl: 0.7e-9, body: 2.0e-3, pitch: 1.85e-3 },
  '1206': { esl: 1.0e-9, body: 3.2e-3, pitch: 2.8e-3 },
};

export const group = (pkg: string, n: number, c: number, esr: number, esl = PKG[pkg]?.esl ?? 1e-9): Group => ({
  pkg,
  n,
  c,
  cUnit: c >= 1e-6 ? 'µF' : c >= 1e-9 ? 'nF' : 'pF',
  esr,
  esrUnit: 'mΩ',
  esl,
  eslUnit: 'nH',
});

export const defaults = (): DecapState => ({
  solveFor: 'zt',
  solveGroup: 2,
  v: 1.8,
  ripple: 5,
  dI: 1,
  zt: 0.09,
  ztUnit: 'mΩ',
  fLo: 100e3,
  fLoUnit: 'kHz',
  fHi: 100e6,
  fHiUnit: 'MHz',
  groups: [group('0805', 2, 10e-6, 5e-3), group('0603', 4, 1e-6, 10e-3), group('0402', 8, 100e-9, 25e-3)],
  h: 0.2e-3,
  hUnit: 'mm',
  dv: 0.3e-3,
  dvUnit: 'mm',
  s: 1.8e-3,
  sUnit: 'mm',
  len: 0.35e-3,
  lenUnit: 'mm',
  w: 0.3e-3,
  wUnit: 'mm',
  cp: 2e-9,
  cpUnit: 'nF',
  lsp: 50e-12,
  lspUnit: 'pH',
});

export const N_MAX = 10000;
const isSolvedGroup = (scope: any, root: any) => root.solveFor === 'n' && root.groups?.indexOf(scope) === root.solveGroup;

const groupFields: FieldSpec[] = [
  {
    kind: 'select', key: 'pkg', label: 'Package (typical ESL)', options: [...Object.keys(PKG), 'Custom'],
    apply: (v: string, s) => {
      const p = PKG[v];
      if (p) {
        s.esl = p.esl;
        s.eslUnit = 'nH';
      }
    },
    help: 'Fills a typical intrinsic ESL for a standard MLCC of that case size (0201 0.25 nH … 1206 1.0 nH). Parts differ: take the datasheet value, ESL = 1/((2π·SRF)²·C).',
  },
  {
    kind: 'number', key: 'n', symbol: 'N', label: 'Count', integer: true, min: 1, max: N_MAX, solvable: true, solvedWhen: isSolvedGroup,
    onSolve: (s, root) => {
      root.solveFor = 'n';
      root.solveGroup = root.groups.indexOf(s);
    },
    onUnsolve: (_s, root) => (root.solveFor = 'zt'),
    help: 'Identical capacitors in parallel. Click ◎ to find the fewest of this group that keep the bank under Z_t across the band.',
  },
  { kind: 'number', key: 'c', symbol: 'C', label: 'Capacitance', units: U_CAP, unitKey: 'cUnit', min: 1e-13, max: 0.1, help: 'Effective capacitance at the operating DC bias (X5R/X7R lose a large part of their rated value under bias).' },
  { kind: 'number', key: 'esr', symbol: 'ESR', label: 'ESR', units: withDefault(U_OHM, 'mΩ'), unitKey: 'esrUnit', min: 1e-5, max: 100, help: 'Equivalent series resistance near the self-resonance (datasheet impedance minimum).' },
  { kind: 'number', key: 'esl', symbol: 'ESL', label: 'ESL (part only)', units: U_IND, unitKey: 'eslUnit', min: 0, max: 1e-6, help: 'Intrinsic inductance of the part. The mounting inductance below is added to it.' },
];

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Target impedance',
    fields: [
      { kind: 'number', key: 'v', symbol: 'V', label: 'Supply voltage', unit: 'V', min: 0.1, max: 1000 },
      { kind: 'number', key: 'ripple', symbol: 'r', label: 'Allowed ripple', suffix: '%', min: 0.01, max: 50, help: 'Allowed supply noise as a percentage of V.' },
      { kind: 'number', key: 'dI', symbol: 'ΔI', label: 'Transient current', unit: 'A', min: 1e-6, max: 1e4, solvable: true, help: 'Largest load-current step. Click ◎ to find the largest step this bank can supply within the ripple.' },
      { kind: 'number', key: 'zt', symbol: 'Z_t', label: 'Target impedance', units: U_OHM, unitKey: 'ztUnit', output: true, min: 0, max: 1e12, help: 'Z_t = V · ripple / ΔI (calculated).' },
      { kind: 'number', key: 'fLo', symbol: 'f_lo', label: 'Band from', units: U_FREQ, unitKey: 'fLoUnit', min: 1, max: 1e10, help: 'Below this the regulator (VRM) holds the rail: often 10–500 kHz.' },
      { kind: 'number', key: 'fHi', symbol: 'f_hi', label: 'Band to', units: U_FREQ, unitKey: 'fHiUnit', min: 10, max: 1e11, help: 'Above this the package and on-die capacitance take over: often 50–500 MHz for board decoupling.' },
    ],
  },
  { kind: 'list', key: 'groups', itemTitle: (g, i) => `Group ${i + 1}: ${g.n} × ${si(g.c, 'F', 3)} ${g.pkg !== 'Custom' ? g.pkg : ''}`.trim(), fields: groupFields, addLabel: '+ Add capacitor group', minItems: 1, maxItems: 8, create: (prev) => ({ ...(prev ?? group('0402', 4, 100e-9, 25e-3)) }), variant: 'card' },
  {
    kind: 'section',
    title: 'Mounting (each capacitor)',
    note: 'Two vias per capacitor, from the pads down to the plane pair.',
    fields: [
      { kind: 'number', key: 'h', symbol: 'h', label: 'Depth to planes', units: U_LEN_PCB, unitKey: 'hUnit', min: 10e-6, max: 10e-3, help: 'From the component layer down to the nearer plane of the pair: taken as the length of both vias, and the height of the pad traces above that plane. The deeper via’s extra run through the plane cavity is part of the plane path (L_sp). Put the planes close to the surface.' },
      { kind: 'number', key: 'dv', symbol: 'd_v', label: 'Via diameter', units: U_LEN_PCB, unitKey: 'dvUnit', min: 10e-6, max: 5e-3, help: 'Finished barrel diameter (≈ drill).' },
      { kind: 'number', key: 's', symbol: 's', label: 'Via spacing', units: U_LEN_PCB, unitKey: 'sUnit', min: 10e-6, max: 50e-3, help: 'Centre to centre of the two vias. Closer vias, smaller loop: put them beside the pads, not at the ends of traces.' },
      { kind: 'number', key: 'len', symbol: 'ℓ', label: 'Pad-to-via trace', units: U_LEN_PCB, unitKey: 'lenUnit', min: 0, max: 50e-3, help: 'Length of each trace from a pad to its via (0 = via in pad).' },
      { kind: 'number', key: 'w', symbol: 'w', label: 'Trace width', units: U_LEN_PCB, unitKey: 'wUnit', min: 10e-6, max: 20e-3 },
    ],
  },
  {
    kind: 'section',
    title: 'Planes',
    collapsed: true,
    fields: [
      { kind: 'number', key: 'cp', symbol: 'C_p', label: 'Plane capacitance', units: U_CAP, unitKey: 'cpUnit', min: 0, max: 1e-3, help: 'Capacitance of the power/ground plane pair (see the plane-impedance calculator); 0 to leave it out.' },
      { kind: 'number', key: 'lsp', symbol: 'L_sp', label: 'Spreading inductance', units: U_IND, unitKey: 'lspUnit', min: 0, max: 1e-6, help: 'Plane inductance between the capacitors and the load’s vias (tens to hundreds of pH). It sits in series with the whole bank.' },
    ],
  },
];

const fmtZ = (z: number) => (Number.isFinite(z) ? si(z, 'Ω', 4) : '∞');

export const caps = (s: DecapState): CapGroup[] => s.groups.map((g) => ({ n: g.n, c: g.c, esr: g.esr, esl: g.esl }));
export const mountOf = (s: DecapState): Mount => ({ h: s.h, dv: s.dv, s: s.s, len: s.len, w: s.w });

/** Worst |Z| in the band for a bank. */
export function worst(s: DecapState, groups: CapGroup[], lm: number): { f: number; z: number } {
  return worstInBand((f) => absC(bankZ(groups, lm, s.lsp, s.cp, f)), s.fLo, s.fHi, 240, peakSeeds(groups, lm, s.lsp, s.cp));
}

function logspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

export function compute(st: DecapState): CalcReport {
  for (const k of ['v', 'ripple', 'dI', 'fLo', 'fHi', 'h', 'dv', 's', 'len', 'w', 'cp', 'lsp'] as const)
    if (typeof st[k] !== 'number' || !Number.isFinite(st[k])) throw new Error(`${k} must be a finite number.`);
  if (!Array.isArray(st.groups) || !st.groups.length) throw new Error('Add at least one capacitor group.');
  for (const [i, g] of st.groups.entries()) {
    for (const k of ['n', 'c', 'esr', 'esl'] as const) if (typeof g[k] !== 'number' || !Number.isFinite(g[k])) throw new Error(`Group ${i + 1}: ${k} must be a finite number.`);
    if (!(g.c > 0) || !(g.esr > 0) || g.esl < 0) throw new Error(`Group ${i + 1}: C and ESR must be > 0, ESL ≥ 0.`);
    if (!(g.n >= 1) || !Number.isInteger(g.n)) throw new Error(`Group ${i + 1}: the count must be a whole number ≥ 1.`);
  }
  if (!['zt', 'dI', 'n'].includes(st.solveFor)) throw new Error('solveFor must be zt, dI or n.');
  const s: DecapState = { ...st, groups: st.groups.map((g) => ({ ...g })) };
  if (!(s.v > 0 && s.ripple > 0)) throw new Error('V and ripple must be > 0.');
  if (s.solveFor !== 'dI' && !(s.dI > 0)) throw new Error('ΔI must be > 0.');
  if (!(s.fLo > 0) || !(s.fHi > s.fLo)) throw new Error(`The band must run upwards: f_lo (${si(s.fLo, 'Hz', 3)}) below f_hi (${si(s.fHi, 'Hz', 3)}).`);
  if (!(s.h > 0 && s.dv > 0 && s.w > 0) || s.len < 0) throw new Error('Mounting dimensions must be > 0 (trace length ≥ 0).');
  if (!(s.s > s.dv)) throw new Error(`The via spacing (${si(s.s, 'm', 3)}) must exceed the via diameter (${si(s.dv, 'm', 3)}).`);
  if (s.cp < 0 || s.lsp < 0) throw new Error('Plane C and spreading L must be ≥ 0.');
  const k = Math.min(Math.max(Math.round(Number(s.solveGroup) || 0), 0), s.groups.length - 1);

  const warnings: string[] = [];
  const notes: string[] = [];
  const tables: TableSpec[] = [];
  const report: CalcReport = { calc: 'pcb/decoupling-capacitor', ok: true, solveFor: s.solveFor, results: [], graphs: [], tables, warnings, notes };
  const mnt = mountL(mountOf(s));
  const lm = mnt.total;
  const zOf = (gs: CapGroup[]) => (f: number) => absC(bankZ(gs, lm, s.lsp, s.cp, f));

  // ── solve
  if (s.solveFor === 'n') {
    const zt = targetZ(s.v, s.ripple, s.dI);
    const withN = (n: number) => caps(s).map((g, i) => (i === k ? { ...g, n } : g));
    const passes = (n: number) => worst(s, withN(n), lm).z <= zt;
    if (!passes(N_MAX)) {
      const wz = worst(s, withN(N_MAX), lm);
      warnings.push(`Even ${N_MAX} capacitors in group ${k + 1} leave ${fmtZ(wz.z)} at ${si(wz.f, 'Hz', 3)}, above Z_t = ${fmtZ(zt)}. ${s.lsp > 0 && 2 * Math.PI * s.fHi * s.lsp > zt ? `The spreading inductance alone is ${fmtZ(2 * Math.PI * s.fHi * s.lsp)} at f_hi: shorten the path to the load or lower f_hi.` : 'Another group (a different value or package) is needed to cover that part of the band.'}`);
      report.status = { text: 'NO SOLUTION', tone: 'fail' };
      report.results.push(
        { key: `groups.${k}.n`, label: `Count of group ${k + 1}`, value: null, display: `> ${N_MAX}`, primary: true, solved: true },
        // the mounting does not depend on the count: still worth showing
        { key: 'lMount', label: 'Mounting inductance', value: lm, unit: 'H', display: si(lm, 'H', 3), symbol: 'L_mnt', primary: true },
      );
      return report;
    }
    // smallest passing count: doubling search, then bisection (adding capacitors of one value lowers the bank
    // impedance across the band; the result is checked against n − 1 below)
    let hi = 1;
    while (!passes(hi)) hi = Math.min(hi * 2, N_MAX);
    let lo = Math.floor(hi / 2);
    if (hi === 1) lo = 0;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (passes(mid)) hi = mid;
      else lo = mid;
    }
    s.groups[k].n = hi;
  }
  const gs = caps(s);
  const w0 = worst(s, gs, lm);
  // 'dI' answers "the largest step this bank supports", so it equals the ΔI in the state only when the bank sits
  // exactly on its target. The mode-switch harness's round-trip check ("solving another unknown must return the
  // value already in the state") therefore flags dI from any other state; that is expected, not a bug.
  // Typed band edges in the wrong order, or vias wider than their spacing, are red errors on purpose
  // (harness "error-after-edit" on ×10 / ÷10 / min / max number steps: typed values).
  if (s.solveFor === 'dI') s.dI = (s.v * s.ripple) / 100 / w0.z;
  s.zt = targetZ(s.v, s.ripple, s.dI);
  const pass = w0.z <= s.zt * (1 + 1e-12);
  if (s.solveFor === 'dI' && !(s.dI >= 1e-6 && s.dI <= 1e4)) {
    warnings.push(`The bank’s worst in-band impedance (${fmtZ(w0.z)}) allows a ${si(s.dI, 'A', 3)} step, outside the 1 µA … 10 kA range of the input.`);
    report.status = { text: 'NO SOLUTION', tone: 'fail' };
    report.results.push({ key: 'dI', label: 'Largest transient current', value: null, display: '—', primary: true, solved: true });
    return report;
  }

  // ── results
  const item = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [];
  const ctot = gs.reduce((a, g) => a + g.n * g.c, 0) + s.cp;
  const ncap = gs.reduce((a, g) => a + g.n, 0);
  if (s.solveFor === 'n') results.push(item(`groups.${k}.n`, `Count of group ${k + 1}`, s.groups[k].n, '', `${s.groups[k].n} × ${si(s.groups[k].c, 'F', 3)}`, { symbol: 'N', primary: true, solved: true, note: `fewest that keep |Z| ≤ Z_t from ${si(s.fLo, 'Hz', 3)} to ${si(s.fHi, 'Hz', 3)}` }));
  if (s.solveFor === 'dI') results.push(item('dI', 'Largest transient current', s.dI, 'A', si(s.dI, 'A', 4), { symbol: 'ΔI', primary: true, solved: true, note: `${s.ripple} % of ${s.v} V across the worst ${fmtZ(w0.z)}` }));
  results.push(
    item('zt', 'Target impedance', s.zt, 'Ω', fmtZ(s.zt), { symbol: 'Z_t', primary: true, solved: true, note: `${s.v} V × ${s.ripple} % ÷ ${si(s.dI, 'A', 3)}` }),
    item('zMax', 'Worst |Z| in the band', w0.z, 'Ω', fmtZ(w0.z), { symbol: '|Z|max', primary: true, tone: pass ? 'pass' : 'fail', note: `at ${si(w0.f, 'Hz', 3)} · ${pass ? `${((1 - w0.z / s.zt) * 100).toFixed(0)} % margin` : `${(w0.z / s.zt).toFixed(2)}× Z_t`}` }),
    item('lMount', 'Mounting inductance', lm, 'H', si(lm, 'H', 3), { symbol: 'L_mnt', primary: true, note: `traces ${si(mnt.lTrace, 'H', 3)} + vias ${si(mnt.lVia, 'H', 3)}, per capacitor` }),
  );
  const gB = 'Bank';
  results.push(
    item('ncap', 'Capacitors', ncap, '', String(ncap), { group: gB }),
    item('ctot', 'Total capacitance', ctot, 'F', si(ctot, 'F', 4), { group: gB, note: s.cp > 0 ? `incl. plane ${si(s.cp, 'F', 3)}` : '' }),
    item('lTrace', 'Pad-to-via traces', mnt.lTrace, 'H', si(mnt.lTrace, 'H', 3), { group: gB, note: s.len > 0 ? `2 × ${si(s.len, 'm', 3)} at ${si(s.h, 'm', 3)} over the plane` : 'via in pad' }),
    item('lVia', 'Via pair', mnt.lVia, 'H', si(mnt.lVia, 'H', 3), { group: gB, note: `${si(s.h, 'm', 3)} long, ${si(s.s, 'm', 3)} apart` }),
  );
  report.status = pass ? { text: 'MEETS TARGET', tone: 'pass' } : { text: 'ABOVE TARGET', tone: 'fail' };
  report.results = results;

  // ── tables: the groups, and the anti-resonances judged against Z_t
  tables.push({
    id: 'groups',
    title: 'Capacitor groups (mounted)',
    columns: [
      { key: 'group', label: 'Group', align: 'left' },
      { key: 'n', label: 'N' },
      { key: 'c', label: 'C', unit: 'F' },
      { key: 'lTot', label: 'ESL + L_mnt', unit: 'H' },
      { key: 'srf', label: 'Mounted SRF', unit: 'Hz' },
      { key: 'zMin', label: '|Z| at SRF', unit: 'Ω' },
    ],
    rows: gs.map((g, i) => ({ group: `${i + 1} (${s.groups[i].pkg})`, n: g.n, c: g.c, lTot: g.esl + lm, srf: srf(g.c, g.esl + lm), zMin: g.esr / g.n })),
    display: gs.map((g, i) => ({ group: `${i + 1} (${s.groups[i].pkg})`, n: String(g.n), c: si(g.c, 'F', 3), lTot: si(g.esl + lm, 'H', 3), srf: si(srf(g.c, g.esl + lm), 'Hz', 3), zMin: fmtZ(g.esr / g.n) })),
    note: 'Each group alone: N parts in parallel, with the mounting inductance added to every part’s ESL.',
  });
  const fA = Math.min(s.fLo / 10, 1e4);
  const fB = Math.max(s.fHi * 10, 1e9);
  const pk = peaks(zOf(gs), fA, fB, 400, peakSeeds(gs, lm, s.lsp, s.cp)).filter((p) => p.f >= s.fLo * 0.5 && p.f <= s.fHi * 2);
  if (pk.length) {
    tables.push({
      id: 'peaks',
      title: 'Anti-resonance peaks',
      columns: [
        { key: 'f', label: 'Frequency', unit: 'Hz' },
        { key: 'z', label: '|Z|', unit: 'Ω' },
        { key: 'ratio', label: '|Z| / Z_t' },
        { key: 'where', label: 'Position', align: 'left' },
      ],
      rows: pk.map((p) => ({ f: p.f, z: p.z, ratio: p.z / s.zt, where: p.f < s.fLo || p.f > s.fHi ? 'outside band' : 'in band' })),
      display: pk.map((p) => ({ f: si(p.f, 'Hz', 4), z: fmtZ(p.z), ratio: (p.z / s.zt).toFixed(2), where: p.f < s.fLo || p.f > s.fHi ? 'outside band' : 'in band' })),
      rowTones: pk.map((p) => (p.f < s.fLo || p.f > s.fHi ? '' : p.z > s.zt ? 'fail' : p.z > 0.8 * s.zt ? 'warn' : 'pass')),
      note: `Local maxima of |Z| near the band, judged against Z_t = ${fmtZ(s.zt)} (yellow within 20 %). Peaks outside ${si(s.fLo, 'Hz', 3)}–${si(s.fHi, 'Hz', 3)} are listed without a verdict.`,
    });
  }

  // ── warnings
  if (!pass) {
    const lowEnd = w0.f <= s.fLo * 1.0001;
    warnings.push(`|Z| reaches ${fmtZ(w0.z)} at ${si(w0.f, 'Hz', 3)}, ${(w0.z / s.zt).toFixed(2)}× the target. ${lowEnd ? 'That is the bottom of the band: add bulk capacitance or let the regulator cover more of it (raise f_lo).' : w0.f >= s.fHi * 0.9999 ? 'That is the top of the band: the mounted inductance limits it — use more small capacitors, shorter mounting, or lower f_hi.' : 'Add capacitors of a value that resonates there, or more of the group just above it, and keep ESR from being too low so the anti-resonances stay damped.'}`);
  }
  if (s.len > 0 && s.w < s.h) notes.push('The pad traces are narrower than their height over the plane: they add a good share of the mounting inductance. Widen them or move the vias closer.');
  {
    const pk = s.groups.map((g) => ({ pkg: g.pkg, p: PKG[g.pkg]?.pitch })).filter((x): x is { pkg: string; p: number } => x.p != null);
    const minP = pk.length ? Math.min(...pk.map((x) => x.p)) : 0;
    if (pk.length && s.s < 0.9 * minP) warnings.push(`Vias ${si(s.s, 'm', 3)} apart are closer than the pads of any part in the bank allow (≈ ${si(minP, 'm', 3)} pad pitch for ${pk.find((x) => x.p === minP)!.pkg}): the mounting inductance is optimistic. Set s to at least the pad pitch.`);
    else {
      const big = [...new Set(pk.filter((x) => s.s < 0.9 * x.p).map((x) => x.pkg))];
      if (big.length) notes.push(`The mounting is shared by all groups: the ${big.join(', ')} pads are further apart than s = ${si(s.s, 'm', 3)}, so those groups' L_mnt is somewhat optimistic.`);
    }
  }
  if (s.h > 1e-3) warnings.push(`The planes are ${si(s.h, 'm', 3)} below the capacitors: the via loop alone is ${si(mnt.lVia, 'H', 3)}. Put the power/ground pair close to the component side.`);
  for (const [i, g] of gs.entries()) if (srf(g.c, g.esl + lm) > s.fHi * 10) notes.push(`Group ${i + 1} resonates at ${si(srf(g.c, g.esl + lm), 'Hz', 3)}, far above the band: it adds little there.`);
  notes.push(
    'Each capacitor is an ideal series R-L-C (ESR, ESL + L_mnt, C); DC-bias and temperature loss of capacitance are not modelled — enter the effective C.',
    'Mounting inductance: pad traces as microstrip over the nearest plane (Hammerstad–Jensen air impedance) plus the via pair as a two-wire loop, (μ₀h/π)·acosh(s/d_v), both vias taken h long down to the top of the plane pair. The deeper via’s extra length inside the plane cavity belongs to the plane-pair path (enter it with L_sp), as does the spreading beyond the vias; the capacitor body is in its ESL.',
    'The regulator (below f_lo) and the package / on-die capacitance (above f_hi) are not modelled; the band is where the board decoupling must hold.',
  );
  report.summary = `${ncap} capacitors · ${si(ctot, 'F', 3)} · L_mnt ${si(lm, 'H', 3)} · band ${si(s.fLo, 'Hz', 3)}–${si(s.fHi, 'Hz', 3)} · Z_t ${fmtZ(s.zt)}`;
  report.details = { mount: mnt, worst: w0, peaks: pk, solveGroup: k };

  // ── graphs
  const fs = logspace(fA, fB, 300);
  const zTot = fs.map(zOf(gs));
  const COLORS = ['#4f8a8b', '#c47b17', '#6b5b95', '#2f7d4f', '#9a8f7a', '#386a77', '#8b1e1e', '#1f4e5f'];
  const zg: GraphSpec = {
    id: 'z-vs-f',
    title: 'Bank impedance vs frequency',
    subtitle: `${ncap} capacitors, L_mnt ${si(lm, 'H', 3)} each${s.cp > 0 ? `, plane ${si(s.cp, 'F', 3)}` : ''}${s.lsp > 0 ? `, L_sp ${si(s.lsp, 'H', 3)}` : ''}`,
    x: { label: 'Frequency', unit: 'Hz', log: true },
    y: [{ id: 'z', label: '|Z|', unit: 'Ω', log: true }],
    series: [
      { label: '|Z| bank', x: fs, y: zTot, axis: 'z', color: '#1f4e5f', width: 2.4 },
      ...gs.map((g, i) => ({ label: `${g.n} × ${si(g.c, 'F', 3)}`, x: fs, y: fs.map((f) => absC(groupZ(g, lm, f))), axis: 'z', color: COLORS[i % COLORS.length], width: 1.1, dash: [4, 3] })),
    ],
    hlines: [{ value: s.zt, label: `Z_t = ${fmtZ(s.zt)}`, axis: 'z', color: '#8b1e1e', dash: [6, 4] }],
    vlines: [{ value: s.fLo, label: 'f_lo' }, { value: s.fHi, label: 'f_hi' }],
    markers: [{ x: w0.f, y: w0.z, axis: 'z', label: `worst ${fmtZ(w0.z)}`, color: pass ? '#2f7d4f' : '#8b1e1e' }],
    xRange: [fA, fB],
    legend: 'below',
  };
  // worst in-band |Z| against the count of the chosen group
  const nNow = s.groups[k].n;
  const nTop = Math.max(4 * nNow, 16);
  const ns = Array.from(new Set(logspace(1, nTop, 40).map((x) => Math.round(x))));
  const wz = ns.map((n) => worst(s, gs.map((g, i) => (i === k ? { ...g, n } : g)), lm).z);
  const ng: GraphSpec = {
    id: 'zmax-vs-n',
    title: 'Worst in-band |Z| vs count',
    subtitle: `group ${k + 1}: ${si(gs[k].c, 'F', 3)} ${s.groups[k].pkg}, others fixed`,
    x: { label: `Count of group ${k + 1}`, unit: '', log: true, integer: true },
    y: [{ id: 'z', label: 'Worst |Z| in band', unit: 'Ω', log: true }],
    series: [{ label: 'Worst |Z|', x: ns, y: wz, axis: 'z', width: 2.2 }],
    hlines: [{ value: s.zt, label: `Z_t = ${fmtZ(s.zt)}`, axis: 'z', color: '#8b1e1e', dash: [6, 4] }],
    vlines: [{ value: nNow, label: `N = ${nNow}` }],
    markers: [{ x: nNow, y: w0.z, axis: 'z', label: fmtZ(w0.z) }],
  };
  report.graphs = [zg, ng];
  return report;
}

/**
 * The group whose count is solved, by identity, per page state (as in nf-cascade): removing or adding a
 * group above it must not silently move the unknown to another group.
 */
const solvedGroup = new WeakMap<DecapState, { g: Group | undefined; index: number }>();

export const def: CalcDef<DecapState> = {
  id: 'pcb/decoupling-capacitor',
  version: '0.1.0',
  method:
    'Target impedance Z_t = V·ripple/ΔI (Smith et al. 1999); each capacitor a series R-L-C with its ESL plus a mounting inductance from the pad traces (Hammerstad–Jensen microstrip in air over the plane) and the via pair (two-wire loop (μ₀h/π)·acosh(s/d_v), Paul 2010; Smith & Bogatin 2017); groups in parallel, then the spreading inductance, in parallel with the plane capacitance; worst |Z| in the band by grid + golden-section search; the count of one group solved as the smallest integer meeting Z_t.',
  fields,
  defaults,
  load: (raw) => {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const s = { ...d, ...(raw as object) } as DecapState;
    s.groups = (Array.isArray(s.groups) && s.groups.length ? s.groups : d.groups).map((g) => ({ ...group('0402', 4, 100e-9, 25e-3), ...g }));
    if (!['zt', 'dI', 'n'].includes(s.solveFor)) s.solveFor = 'zt';
    s.solveGroup = Math.min(Math.max(Math.round(Number(s.solveGroup) || 0), 0), s.groups.length - 1);
    return s;
  },
  solve: {
    default: 'zt',
    analysis: 'zt',
    options: [
      { key: 'zt', label: 'Check the bank against the target impedance' },
      { key: 'dI', label: 'Largest transient current the bank supports' },
      { key: 'n', label: 'Fewest capacitors of group `solveGroup` (0-based) to meet Z_t' },
    ],
  },
  compute,
  controls: {
    solveGroup: (raw, s) => {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n >= s.groups.length) throw new Error(`must be an integer group index 0…${s.groups.length - 1}`);
      return n;
    },
  },
  sync: (s) => {
    const prev = solvedGroup.get(s);
    if (s.solveFor === 'n' && prev?.g && prev.index === s.solveGroup && s.groups[s.solveGroup] !== prev.g) {
      const at = s.groups.indexOf(prev.g);
      if (at >= 0) s.solveGroup = at;
      else s.solveFor = 'zt'; // the solved group was removed: analyse what is left
    }
    s.solveGroup = Math.min(Math.max(Math.round(Number(s.solveGroup) || 0), 0), s.groups.length - 1);
    for (const g of s.groups) {
      const p = PKG[g.pkg];
      if (p && Math.abs(p.esl - g.esl) > 1e-9 * p.esl) g.pkg = 'Custom';
    }
    solvedGroup.set(s, { g: s.groups[s.solveGroup], index: s.solveGroup });
  },
  examples: [
    { id: 'default', label: '1.8 V rail: 10 µF, 1 µF and 100 nF groups, 100 kHz–100 MHz', state: defaults() },
    {
      id: 'fpga-core',
      label: 'FPGA core 1.0 V, 3 %, 1 A step to 50 MHz: how many 100 nF 0402?',
      state: { solveFor: 'n', solveGroup: 2, v: 1.0, ripple: 3, dI: 1, fLo: 100e3, fLoUnit: 'kHz', fHi: 50e6, fHiUnit: 'MHz', groups: [group('1206', 2, 47e-6, 3e-3), group('0805', 4, 4.7e-6, 6e-3), group('0402', 20, 100e-9, 20e-3)], h: 0.1e-3, dv: 0.25e-3, s: 0.95e-3, len: 0, w: 0.25e-3, cp: 5e-9, lsp: 20e-12 },
    },
    {
      id: 'anti-res',
      label: 'Low-ESR anti-resonance: 10 µF + 1 nF with nothing between',
      state: { solveFor: 'zt', solveGroup: 1, v: 3.3, ripple: 3, dI: 0.5, fLo: 100e3, fLoUnit: 'kHz', fHi: 200e6, fHiUnit: 'MHz', groups: [group('0805', 2, 10e-6, 3e-3), group('0402', 6, 1e-9, 60e-3)], h: 0.2e-3, dv: 0.3e-3, s: 1.2e-3, len: 0.4e-3, w: 0.3e-3, cp: 1e-9, lsp: 50e-12 },
    },
    {
      id: 'long-traces',
      label: 'Default bank with 3 mm traces to the vias, planes 1 mm deep',
      state: { solveFor: 'zt', solveGroup: 2, v: 1.8, ripple: 5, dI: 1, fLo: 100e3, fLoUnit: 'kHz', fHi: 100e6, fHiUnit: 'MHz', groups: [group('0805', 2, 10e-6, 5e-3), group('0603', 4, 1e-6, 10e-3), group('0402', 8, 100e-9, 25e-3)], h: 1e-3, dv: 0.3e-3, s: 7.6e-3, len: 3e-3, w: 0.25e-3, cp: 2e-9, lsp: 50e-12 },
    },
    {
      id: 'max-step',
      label: 'Largest load step a 3.3 V bank of 4 × 22 µF + 10 × 100 nF supports',
      state: { solveFor: 'dI', solveGroup: 1, v: 3.3, ripple: 5, dI: 1, fLo: 50e3, fLoUnit: 'kHz', fHi: 50e6, fHiUnit: 'MHz', groups: [group('1206', 4, 22e-6, 4e-3), group('0402', 10, 100e-9, 25e-3)], h: 0.2e-3, dv: 0.3e-3, s: 1.2e-3, len: 0.4e-3, w: 0.3e-3, cp: 2e-9, lsp: 50e-12 },
    },
  ],
};
