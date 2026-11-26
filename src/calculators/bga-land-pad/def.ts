/** BGA land pad — calculator definition (inputs, solve-for, report). DOM-free. */

import { type CalcDef, type CalcReport, type GraphSpec, type ResultItem, type TableSpec, emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN_PCB } from '@/core/unitsets';
import { type BallType, LEVEL_PCT, TI_PITCH, dMaxForN, ipcPct, landFrom, pctFrom, table, tableRow, tracesInGap, wMaxForN } from './model';

export const ID = 'pcb/bga-land-pad';

export type LandSolve = 'land' | 'pct';
export type Rule = 'ipc' | 'A' | 'B' | 'C' | 'pkg' | 'custom';

export interface LandState {
  solveFor: LandSolve;
  p: number;
  pUnit: string;
  ball: number;
  ballUnit: string;
  ballType: BallType;
  rule: Rule;
  pkgPad: number;
  pkgPadUnit: string;
  pct: number;
  land: number;
  landUnit: string;
  padDef: 'nsmd' | 'smd';
  maskClr: number;
  maskClrUnit: string;
  n: number;
  w: number;
  wUnit: string;
  s: number;
  sUnit: string;
}

const MM = 1e-3;

export const defaults = (): LandState => ({
  solveFor: 'land',
  p: 0.8 * MM,
  pUnit: 'mm',
  ball: 0.45 * MM,
  ballUnit: 'mm',
  ballType: 'collapse',
  rule: 'ipc',
  pkgPad: 0.35 * MM,
  pkgPadUnit: 'mm',
  pct: 20,
  land: 0.36 * MM,
  landUnit: 'mm',
  padDef: 'nsmd',
  maskClr: 0.05 * MM,
  maskClrUnit: 'mm',
  n: 1,
  w: 0.1 * MM,
  wUnit: 'mm',
  s: 0.1 * MM,
  sUnit: 'mm',
});

export const RULE_OPTIONS: { value: Rule; label: string }[] = [
  { value: 'ipc', label: 'IPC-7351B Table 14-5/14-6 (by ball size)' },
  { value: 'A', label: 'IPC-7352 level A (most)' },
  { value: 'B', label: 'IPC-7352 level B (nominal)' },
  { value: 'C', label: 'IPC-7352 level C (least)' },
  { value: 'pkg', label: 'Package pad (TI: NSMD 90 %, SMD 100 %)' },
  { value: 'custom', label: 'Custom percentage' },
];

const LIM = { land: [0.02 * MM, 3 * MM], pct: [-1e4, 1e4] } as const;

const len = (key: string, symbol: string, label: string, min: number, max: number, extra: Record<string, unknown> = {}): FieldSpec =>
  ({ kind: 'number', key, symbol, label, units: U_LEN_PCB, unitKey: `${key}Unit`, min, max, ...extra }) as FieldSpec;

/** The percentage field is computed whenever a rule (not "custom") sets it, and when it is the unknown (check). */
const pctComputed = (s: Record<string, any>) => s.solveFor === 'pct' || s.rule !== 'custom';

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Package',
    fields: [
      len('p', 'p', 'Ball pitch', 0.2 * MM, 3 * MM, { help: 'Centre-to-centre ball pitch from the package drawing.' }),
      len('ball', 'D_ball', 'Nominal ball Ø', 0.05 * MM, 1.5 * MM, { help: 'Nominal (not maximum) ball diameter before reflow, from the package drawing or JEDEC JEP95.' }),
      {
        kind: 'select',
        key: 'ballType',
        label: 'Ball',
        options: [{ value: 'collapse', label: 'Collapsing (SAC / SnPb)' }, { value: 'noncollapse', label: 'Non-collapsing (high-melt, Cu core)' }],
        // a custom reduction would silently turn into an increase: go back to the IPC rule for the new ball type
        apply: (_v: string, sc: Record<string, any>) => { if (sc.rule === 'custom') sc.rule = 'ipc'; },
        help: 'Collapsing balls melt and slump onto the land, so IPC reduces the land; non-collapsing balls keep their shape, so it enlarges it.',
      },
    ],
  },
  {
    kind: 'section',
    title: 'Land',
    note: 'The land is solved from the ball; click ◎ on the land to check one you already have.',
    fields: [
      {
        kind: 'select',
        key: 'rule',
        label: 'Sizing rule',
        options: RULE_OPTIONS,
        help: 'IPC-7351B: the percentage of the ball’s size band (25 / 20 / 15 % smaller for collapsing balls). IPC-7352: one percentage per density level. Package pad: the land equals the pad on the package substrate (TI SPRAA99C).',
      },
      len('pkgPad', 'D_pkg', 'Package pad Ø', 0.02 * MM, 2 * MM, { visible: (s: Record<string, any>) => s.rule === 'pkg', help: 'Solder-mask opening (ball pad) on the package substrate, from the package drawing or vendor.' }),
      {
        kind: 'number',
        key: 'pct',
        symbol: 'r',
        label: 'Land change',
        suffix: '%',
        min: LIM.pct[0],
        max: LIM.pct[1],
        solvable: true,
        solvedWhen: (s: Record<string, any>) => pctComputed(s),
        onSolve: (s: Record<string, any>) => { s.solveFor = 'pct'; },
        // a computed percentage becomes an input: switch to a custom percentage at the same value
        onUnsolve: (s: Record<string, any>) => { if (s.solveFor === 'pct') s.solveFor = 'land'; s.rule = 'custom'; },
        help: 'Reduction from the ball for collapsing balls, increase for non-collapsing ones. Set by the rule; click it to enter your own. When checking a land, the percentage that land represents.',
      },
      len('land', 'D_land', 'Land Ø', LIM.land[0], LIM.land[1], {
        solvable: true,
        onUnsolve: (s: Record<string, any>) => { s.solveFor = 'pct'; },
        help: 'Solderable land: the copper for NSMD, the mask opening for SMD. Solved from the ball; click ◎ to type an existing land and check it.',
      }),
      {
        kind: 'select',
        key: 'padDef',
        label: 'Land definition',
        options: [{ value: 'nsmd', label: 'NSMD (copper-defined)' }, { value: 'smd', label: 'SMD (mask-defined)' }],
        help: 'NSMD: the mask opening clears the copper land, which sets the joint (preferred by IPC-7095, TI, Intel). SMD: the mask overlaps a larger copper pad and its opening sets the joint.',
      },
      len('maskClr', 'c_mask', 'Mask clearance', 0, 0.3 * MM, { help: 'NSMD: opening beyond the land, per side. SMD: copper beyond the opening, per side (the mask overlap). Typically 0.05 mm.' }),
    ],
  },
  {
    kind: 'section',
    title: 'Routing between lands',
    fields: [
      { kind: 'number', key: 'n', symbol: 'N', label: 'Traces needed', integer: true, min: 0, max: 6, help: 'Traces that must pass between two neighbouring lands on the top layer (the escape for the next row in).' },
      len('w', 'W', 'Trace width', 0.01 * MM, 1 * MM),
      len('s', 's', 'Clearance', 0.01 * MM, 1 * MM, { help: 'Copper-to-copper spacing, land to trace and trace to trace.' }),
    ],
  },
];

const f = (m: number) => (m === 0 ? '0' : si(m, 'm', 3));
const f4 = (m: number) => (m === 0 ? '0' : si(m, 'm', 4));
const pctS = (x: number) => `${+x.toFixed(2)} %`;

function num(name: string, v: unknown, strict = true): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  if (strict ? !(v > 0) : !(v >= 0)) throw new Error(`${name} must be ${strict ? '> 0' : '≥ 0'}.`);
  return v;
}

function noSol(s: LandState, error: string): CalcReport {
  return { ...emptyReport(ID), ok: false, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' }, error };
}

export const ruleLabel = (s: Pick<LandState, 'rule' | 'ballType'>) => ({ ipc: s.ballType === 'collapse' ? 'IPC-7351B Table 14-5' : 'IPC-7351B Table 14-6', A: 'IPC-7352 level A', B: 'IPC-7352 level B', C: 'IPC-7352 level C', pkg: 'package pad', custom: 'custom' })[s.rule];

/** The percentage the rule sets (null for a custom percentage). */
export function rulePct(s: LandState): { pct: number; extended: boolean } | null {
  if (s.rule === 'ipc') return ipcPct(s.ballType, s.ball);
  if (s.rule === 'A' || s.rule === 'B' || s.rule === 'C') return { pct: LEVEL_PCT[s.ballType][s.rule], extended: false };
  // TI SPRAA99C: the board land matches the package pad (A/B = 1, §2.1); for NSMD lands about 90 % of it (Table 3-4)
  if (s.rule === 'pkg') return { pct: pctFrom(s.ballType, s.ball, s.pkgPad * (s.padDef === 'nsmd' ? 0.9 : 1)), extended: false };
  return null;
}

/** Copper and mask-opening diameters for a solderable land. */
export const landGeom = (s: Pick<LandState, 'padDef' | 'maskClr'>, land: number) =>
  s.padDef === 'nsmd' ? { cu: land, open: land + 2 * s.maskClr } : { cu: land + 2 * s.maskClr, open: land };

/** IPC table range for the ball: the row's variation, or (between rows) the row's spread around the computed nominal. */
export function ipcRange(s: LandState) {
  const hit = tableRow(s.ballType, s.ball);
  if (!hit) return null;
  const { row, exact } = hit;
  if (exact) return { row, exact, nom: row.land, min: row.min, max: row.max };
  const nom = landFrom(s.ballType, s.ball, row.pct);
  return { row, exact, nom, min: nom - (row.land - row.min), max: nom + (row.max - row.land) };
}

export function compute(st: LandState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

/*
 * Mode-switch harness (§12.3) triage, reviewed: "roundtrip" mediums from the check example (an old 0.55 mm land under
 * 0.6 mm balls) are the point of a check: solving the land from the rule gives the rule's 0.45 mm, not the land being
 * checked, because the percentage comes from the rule, not from the state. Ball ≥ pitch and custom percentages over 100 %
 * (a negative land) are typed numbers and report their own errors. "unreadable" mediums on a solved length shown in inches (0.0009 in) come
 * from the user's own unit choice: inch has no prefixed forms for the core to move to, so they are left as chosen. an error after a typed number is a land that leaves the field range or
 * a ball at or above the pitch; both messages say what to change.
 */
function run(st: LandState): CalcReport {
  const s: LandState = { ...st };
  if (s.solveFor !== 'land' && s.solveFor !== 'pct') throw new Error('solveFor must be land or pct.');
  if (!RULE_OPTIONS.some((o) => o.value === s.rule)) throw new Error('Unknown sizing rule.');
  if (s.ballType !== 'collapse' && s.ballType !== 'noncollapse') throw new Error('Unknown ball type.');
  if (s.padDef !== 'nsmd' && s.padDef !== 'smd') throw new Error('Unknown land definition.');
  num('Ball pitch', s.p);
  num('Ball diameter', s.ball);
  num('Mask clearance', s.maskClr, false);
  num('Trace width', s.w);
  num('Clearance', s.s);
  s.n = Math.round(num('Traces needed', s.n, false));
  if (s.rule === 'pkg') num('Package pad', s.pkgPad);
  if (s.ball >= s.p) throw new Error(`A ${f(s.ball)} ball on a ${f(s.p)} pitch touches its neighbours. Check the ball diameter and the pitch.`);
  const rp = rulePct(s);
  if (s.solveFor === 'land') {
    if (!rp && !Number.isFinite(s.pct)) throw new Error('Land change must be a finite number.');
    const pct = rp ? rp.pct : s.pct;
    if (!(pct >= LIM.pct[0] && pct <= LIM.pct[1])) return noSol(s, `The ${f(s.pkgPad)} package pad is ${pctS(Math.abs(pctFrom(s.ballType, s.ball, s.pkgPad)))} away from the ${f(s.ball)} ball: outside the field range of the land change. Check the package pad and the ball.`);
    const land = landFrom(s.ballType, s.ball, pct);
    if (!(land >= LIM.land[0] && land <= LIM.land[1])) return noSol(s, `The land would be ${f(land)}, outside the 0.02–3 mm field range. Check the ball and the percentage.`);
    s.pct = pct;
    s.land = land;
  } else {
    num('Land diameter', s.land);
    const pct = pctFrom(s.ballType, s.ball, s.land);
    if (!(pct >= LIM.pct[0] && pct <= LIM.pct[1])) return noSol(s, `A ${f(s.land)} land is ${pctS(Math.abs(pct))} ${s.land > s.ball ? 'larger' : 'smaller'} than the ${f(s.ball)} ball, outside the field range. Check the land and the ball.`);
    s.pct = pct;
  }
  return report(s, rp);
}

function report(s: LandState, rp: ReturnType<typeof rulePct>): CalcReport {
  const rep: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor };
  const check = s.solveFor === 'pct';
  const g = landGeom(s, s.land);
  const gap = s.p - g.cu;
  // mask web: between neighbouring openings, and, with traces between the lands, between an opening and the nearest
  // trace (the N traces centred in the gap, never closer than s to the copper; NSMD: minus the clearance c, SMD: the
  // overlap adds to it)
  const webOpen = s.p - g.open;
  const webTrace = traceWeb(s, gap);
  const web = Math.min(webOpen, webTrace);
  const webToTrace = webTrace < webOpen;
  // the IPC-7351B range is the verdict under its own rule (or when checking a custom land); under IPC-7352 levels or
  // the package-pad rule it is shown for comparison only
  const binding = s.rule === 'ipc' || (s.rule === 'custom' && check);
  const nFit = tracesInGap(gap, s.w, s.s);
  const nReq = Math.max(s.n, 1);
  const wMax = wMaxForN(gap, s.s, nReq);
  const pMin = g.cu + s.n * s.w + (s.n + 1) * s.s;
  const range = ipcRange(s);
  const inRange = range ? s.land >= range.min - 1e-9 && s.land <= range.max + 1e-9 : null;
  const dir = s.ballType === 'collapse' ? 'smaller' : 'larger';
  const item = (key: string, label: string, value: number | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const pctComputedNow = check || s.rule !== 'custom';

  const prim: ResultItem[] = [
    item('land', s.padDef === 'nsmd' ? 'Land (copper)' : 'Land (mask opening)', s.land, 'm', f4(s.land), { symbol: 'D_land', primary: true, solved: !check, tone: binding && range && !inRange ? 'fail' : '', note: `${(s.land / 25.4e-6).toFixed(1)} mil · ${(s.land / s.ball).toFixed(3)} × ball` }),
    item('pct', check ? 'Land change of this land' : 'Land change', s.pct, '%', `${pctS(Math.abs(s.pct))} ${s.pct >= 0 ? dir : dir === 'smaller' ? 'larger' : 'smaller'}`, { symbol: 'r', primary: true, solved: pctComputedNow, note: check ? (rp ? `${ruleLabel(s)} asks ${pctS(rp.pct)}` : 'custom rule') : ruleLabel(s) }),
    item(s.padDef === 'nsmd' ? 'open' : 'cu', s.padDef === 'nsmd' ? 'Mask opening' : 'Copper pad', s.padDef === 'nsmd' ? g.open : g.cu, 'm', f(s.padDef === 'nsmd' ? g.open : g.cu), { symbol: s.padDef === 'nsmd' ? 'D_mask' : 'D_cu', primary: true, note: `land ${s.padDef === 'nsmd' ? '+' : '+'} 2 × ${f(s.maskClr)}` }),
    item('nFit', 'Traces between lands', nFit, '', `${nFit}`, { symbol: 'N_fit', primary: true, tone: nFit < s.n ? 'fail' : '', note: `${f(gap)} gap · W/s ${f(s.w)}/${f(s.s)}` }),
  ];
  const sec: ResultItem[] = [];
  if (range) {
    sec.push(
      item('tblBall', 'Table row (ball)', range.row.ball, 'm', `${f(range.row.ball)}${range.exact ? '' : ' (next smaller)'}`, { group: 'IPC-7351B table' }),
      item('tblPct', 'Band', range.row.pct, '%', `${range.row.pct} % ${dir}`, { group: 'IPC-7351B table', note: s.ballType === 'collapse' ? 'Table 14-5' : 'Table 14-6' }),
      item('tblNom', 'Nominal land', range.nom, 'm', f(range.nom), { group: 'IPC-7351B table', note: range.exact ? 'as tabulated (0.05 mm grid)' : 'ball × band, unrounded' }),
      item('tblRange', 'Land variation', range.max - range.min, 'm', `${f(range.min)} – ${f(range.max)}`, { group: 'IPC-7351B table', note: range.exact ? 'MMC–LMC of the row' : 'the row’s spread about the nominal' }),
      item('tblCheck', 'This land', inRange ? 1 : 0, '', inRange ? 'within the range' : s.land > range.max ? 'above the range' : 'below the range', { group: 'IPC-7351B table', tone: binding ? (inRange ? 'pass' : 'fail') : '', note: binding ? '' : `for comparison (${ruleLabel(s)} rule)` }),
    );
  }
  sec.push(
    item('ratio', 'Land ÷ ball', s.land / s.ball, '', (s.land / s.ball).toFixed(3), { group: 'Land' }),
    item('cuD', 'Copper diameter', g.cu, 'm', f(g.cu), { group: 'Land' }),
    item('openD', 'Mask opening', g.open, 'm', f(g.open), { group: 'Land' }),
    item('landPitch', 'Copper ÷ pitch', g.cu / s.p, '', `${((g.cu / s.p) * 100).toFixed(1)} %`, { group: 'Land' }),
    item('gap', 'Copper gap between lands', gap, 'm', gap > 0 ? f(gap) : 'lands touch', { symbol: 'p − D_cu', group: 'Pitch & routing', tone: gap <= 0 ? 'fail' : '' }),
    item('web', 'Mask web', web, 'm', web > 0 ? f(web) : webToTrace ? 'none (trace exposed)' : 'none (openings merge)', { symbol: webToTrace ? 's − c_mask' : 'p − D_mask', group: 'Pitch & routing', tone: web < 75e-6 ? 'warn' : '', note: webToTrace ? 'opening to the nearest trace' : 'between openings' }),
    item('wMax', `Widest trace for ${nReq} between`, wMax > 0 ? wMax : null, 'm', wMax > 0 ? f(wMax) : 'does not fit', { group: 'Pitch & routing', tone: wMax > 0 ? '' : 'fail', note: `at s = ${f(s.s)}` }),
    item('pMin', `Smallest pitch for ${s.n} between`, pMin, 'm', f(pMin), { group: 'Pitch & routing', note: 'D_cu + N·W + (N+1)·s' }),
    item('dMax', `Largest copper for ${s.n} between`, dMaxForN(s.p, s.w, s.s, s.n), 'm', dMaxForN(s.p, s.w, s.s, s.n) > 0 ? f(dMaxForN(s.p, s.w, s.s, s.n)) : 'none', { group: 'Pitch & routing', note: 'p − N·W − (N+1)·s' }),
  );
  const ti = TI_PITCH.find((t) => Math.abs(t.p - s.p) < 1e-6);
  if (ti) sec.push(item('tiLand', 'TI land for this pitch', ti.land, 'm', `${f(ti.land)} / ${f(ti.smo)}`, { group: 'Pitch & routing', note: 'NSMD land / opening, TI SPRAA99C Table 2-1' }));
  rep.results = [...prim, ...sec];

  // ── verdict and warnings
  if (range && binding) rep.status = inRange ? { text: 'WITHIN IPC-7351B RANGE', tone: 'pass' } : { text: 'OUTSIDE IPC-7351B RANGE', tone: 'fail' };
  if (range && !inRange && !binding) rep.notes.push(`For comparison: the ${f(s.land)} land is ${s.land > range.max ? 'above' : 'below'} the ${f(range.min)}–${f(range.max)} IPC-7351B Table ${s.ballType === 'collapse' ? '14-5' : '14-6'} range for this ball; the ${ruleLabel(s)} rule sizes it differently on purpose.`);
  if (range && !inRange && binding) rep.warnings.push(`The ${f(s.land)} land is ${s.land > range.max ? 'above' : 'below'} the ${f(range.min)}–${f(range.max)} IPC-7351B range for a ${f(s.ball)} ${s.ballType === 'collapse' ? 'collapsing' : 'non-collapsing'} ball (${range.row.pct} % ${dir}). ${s.land > range.max ? 'A larger land lowers the stand-off and shrinks the routing channel' : 'A smaller land weakens the board side of the joint'}; use about ${f(range.nom)} unless the package vendor says otherwise.`);
  if (!range) rep.warnings.push(`A ${f(s.ball)} ball is outside IPC-7351B Tables 14-5/14-6 (0.15–0.75 mm): ${s.rule === 'ipc' ? `the ${rp?.pct} % band of the nearest row is extended. ` : ''}Follow the package vendor’s land recommendation.`);
  if (gap <= 0) rep.warnings.push(`The ${f(g.cu)} copper is as large as the ${f(s.p)} pitch: neighbouring lands touch. Use a smaller land${s.padDef === 'smd' ? ', a smaller mask overlap, or NSMD lands' : ''}.`);
  else if (nFit < s.n) rep.warnings.push(`Only ${nFit} trace${nFit === 1 ? '' : 's'} of ${f(s.w)} at ${f(s.s)} fit${nFit === 1 ? 's' : ''} the ${f(gap)} gap; ${s.n} needed (that takes a pitch of ${f(pMin)} or copper of at most ${dMaxForN(s.p, s.w, s.s, s.n) > 0 ? f(dMaxForN(s.p, s.w, s.s, s.n)) : '—'}). Use narrower traces, ${s.padDef === 'smd' ? 'NSMD lands, ' : ''}a smaller land, or escape that row on an inner layer.`);
  if (webToTrace && web <= 0) rep.warnings.push(`The ${f(s.maskClr)} mask clearance is at least the ${f(s.s)} trace clearance: the NSMD openings expose the traces passing between the lands, and solder can bridge to them. Keep the opening well inside the clearance (≥ ~75 µm of mask over the trace).`);
  else if (web < 75e-6) rep.warnings.push(`Mask web ${webToTrace ? 'between an opening and the nearest trace' : 'between land openings'} is ${web > 0 ? f(web) : 'zero'}, below the ~75 µm a liquid photo-imageable mask holds (rule of thumb): it may flake and let solder bridge. Reduce the mask clearance${webToTrace ? '' : ', or ask the fabricator for a gang opening'}.`);
  if (rp?.extended && range) rep.notes.push('The ball is between table rows; the next smaller ball’s band is used.');
  if (s.padDef === 'smd' && s.ballType === 'collapse') rep.notes.push('SMD lands put a stress concentration at the mask edge and enlarge the copper; NSMD is the usual choice for collapsing balls (IPC-7095, TI AN-1112, Intel AN 114). SMD is used where pad adhesion matters (drop and bend tests) or with non-collapsing balls.');
  if (s.rule === 'pkg') rep.notes.push(`TI SPRAA99C: a board land equal to the package pad balances the strain on both sides of the joint (§2.1); for NSMD lands TI quotes about 90 % of it (Table 3-4), which this rule applies: ${s.padDef === 'nsmd' ? '0.9' : '1.0'} × ${f(s.pkgPad)}.`);
  if (s.rule === 'A' || s.rule === 'B' || s.rule === 'C') rep.notes.push('IPC-7352 replaced the ball-size bands of IPC-7351B with one percentage per density level; the IPC-7351B range above is shown for comparison.');
  rep.notes.push(`The land is ball × (1 ${s.ballType === 'collapse' ? '−' : '+'} r) unrounded; IPC-7351B rounds its tabulated nominal to the 0.05 mm grid.`);

  rep.summary = `${f(s.ball)} ${s.ballType === 'collapse' ? 'collapsing' : 'non-collapsing'} ball, ${f(s.p)} pitch · ${s.padDef.toUpperCase()} land ${f(s.land)} (${ruleLabel(s)}) · ${nFit} trace${nFit === 1 ? '' : 's'} between`;
  rep.details = { cu: g.cu, open: g.open, gap, web, range, rulePct: rp?.pct ?? null };
  rep.tables = [ipcTable(s), tiTable()];
  rep.graphs = graphs(s, range);
  return rep;
}

/** Mask between an opening and the nearest of the N traces centred in the copper gap g (∞ without traces). */
function traceWeb(s: LandState, gap: number): number {
  if (!(s.n > 0)) return Infinity;
  const edge = Math.max(s.s, (gap - s.n * s.w - (s.n - 1) * s.s) / 2);
  return s.padDef === 'nsmd' ? edge - s.maskClr : edge + s.maskClr;
}

function ipcTable(s: LandState): TableSpec {
  const rows = table(s.ballType).map((r) => {
    const g = landGeom(s, r.land);
    const gap = s.p - g.cu;
    return { ball: r.ball, pct: r.pct, land: r.land, min: r.min, max: r.max, gap, n: tracesInGap(gap, s.w, s.s), web: Math.min(s.p - g.open, traceWeb(s, gap)) };
  });
  return {
    id: 'ipc',
    title: s.ballType === 'collapse' ? 'IPC-7351B Table 14-5 (collapsing balls) at this pitch' : 'IPC-7351B Table 14-6 (non-collapsing balls) at this pitch',
    columns: [
      { key: 'ball', label: 'Ball', unit: 'm' },
      { key: 'pct', label: s.ballType === 'collapse' ? 'Reduction' : 'Increase', unit: '%' },
      { key: 'land', label: 'Nominal land', unit: 'm' },
      { key: 'range', label: 'Variation' },
      { key: 'gap', label: 'Copper gap', unit: 'm', align: 'right' },
      { key: 'n', label: 'Traces', align: 'right' },
    ],
    rows: rows.map((r) => ({ ball: r.ball, pct: r.pct, land: r.land, range: `${r.min}–${r.max}`, gap: r.gap, n: r.n })),
    display: rows.map((r) => ({ ball: f(r.ball), pct: `${r.pct} %`, land: f(r.land), range: `${f(r.min)} – ${f(r.max)}`, gap: r.gap > 0 ? f(r.gap) : 'touch', n: String(r.n) })),
    rowTones: rows.map((r) => (r.gap <= 0 || r.n < s.n ? 'fail' : r.web < 75e-6 ? 'warn' : 'pass')),
    note: `Pitch ${f(s.p)}, ${s.padDef.toUpperCase()} with ${f(s.maskClr)} mask clearance, W/s ${f(s.w)}/${f(s.s)}. Green: ${s.n} trace${s.n === 1 ? '' : 's'} fit${s.n === 1 ? 's' : ''} between the lands; yellow: they fit but the mask web is under 75 µm; red: they do not fit. ${s.ballType === 'noncollapse' ? 'The 0.45 mm row prints 0.55–0.40 in IPC-7351B; 0.55–0.45 is used (every other row spans 0.10 mm or less).' : ''}`.trim(),
  };
}

function tiTable(): TableSpec {
  return {
    id: 'ti',
    title: 'TI SPRAA99C Table 2-1: optimum lands by pitch',
    columns: [{ key: 'p', label: 'Pitch', unit: 'm' }, { key: 'land', label: 'NSMD land', unit: 'm' }, { key: 'smo', label: 'Mask opening', unit: 'm' }],
    rows: TI_PITCH.map((t) => ({ p: t.p, land: t.land, smo: t.smo })),
    display: TI_PITCH.map((t) => ({ p: f(t.p), land: f(t.land), smo: f(t.smo) })),
    note: 'For SMD lands TI swaps the two figures: the mask opening is the smaller number and the copper the larger.',
  };
}

function graphs(s: LandState, range: ReturnType<typeof ipcRange>): GraphSpec[] {
  const rows = table(s.ballType);
  const b0 = 0.12 * MM;
  const b1 = Math.max(0.8 * MM, s.ball * 1.1);
  const bs = Array.from({ length: 200 }, (_, i) => b0 + ((b1 - b0) * i) / 199);
  const band = bs.map((b) => landFrom(s.ballType, b, ipcPct(s.ballType, b).pct));
  const asc = [...rows].reverse();
  const gMax = Math.max(0.5 * s.p, 0.1 * MM);
  const ds = Array.from({ length: 160 }, (_, i) => s.p * (0.1 + (0.88 * i) / 159));
  const cuNow = landGeom(s, s.land).cu;
  return [
    {
      id: 'land-vs-ball',
      title: 'Land vs ball diameter',
      subtitle: `${s.ballType === 'collapse' ? 'Table 14-5, collapsing' : 'Table 14-6, non-collapsing'} · bands extended past the table (dotted)`,
      x: { label: 'Nominal ball Ø', unit: 'm' },
      y: [{ id: 'd', label: 'Land Ø', unit: 'm', includeZero: true }],
      legend: 'below',
      series: [
        { label: 'ball × band (IPC-7351B)', x: bs, y: band, width: 2.2 },
        { label: 'table nominal', x: asc.map((r) => r.ball), y: asc.map((r) => r.land), color: '#c47b17', width: 1.4, dash: [2, 3] },
        { label: 'table max', x: asc.map((r) => r.ball), y: asc.map((r) => r.max), color: '#9a8f7a', width: 1, dash: [5, 3] },
        { label: 'table min', x: asc.map((r) => r.ball), y: asc.map((r) => r.min), color: '#9a8f7a', width: 1, dash: [5, 3] },
        { label: 'land = ball', x: [b0, b1], y: [b0, b1], color: '#4f8a8b', width: 1, dash: [1, 3] },
      ],
      vlines: [{ value: s.ball, label: `ball ${f(s.ball)}`, color: '#9a8f7a' }],
      markers: [{ x: s.ball, y: s.land, label: `${f(s.land)}${range && !(s.land >= range.min - 1e-9 && s.land <= range.max + 1e-9) ? ' (outside)' : ''}` }],
    },
    {
      id: 'n-vs-land',
      title: 'Traces between lands vs copper size',
      subtitle: `pitch ${f(s.p)} · W/s ${f(s.w)}/${f(s.s)} · widest trace for ${Math.max(s.n, 1)} on the right axis`,
      x: { label: 'Copper land Ø', unit: 'm' },
      y: [
        { id: 'n', label: 'Traces that fit', unit: '', includeZero: true },
        { id: 'w', label: 'Widest trace', unit: 'm', side: 'right', includeZero: true, max: gMax },
      ],
      series: [
        { label: 'traces that fit', x: ds, y: ds.map((d) => tracesInGap(s.p - d, s.w, s.s)), width: 2.2, axis: 'n' },
        { label: `widest trace for ${Math.max(s.n, 1)}`, x: ds, y: ds.map((d) => Math.max(wMaxForN(s.p - d, s.s, Math.max(s.n, 1)), 0)), color: '#c47b17', width: 1.4, dash: [5, 3], axis: 'w' },
      ],
      hlines: s.n > 0 ? [{ value: s.n, label: `${s.n} needed`, axis: 'n', color: '#8b1e1e', dash: [6, 4] }] : [],
      vlines: [{ value: cuNow, label: `copper ${f(cuNow)}`, color: '#9a8f7a' }],
    },
  ];
}

export const def: CalcDef<LandState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Land = ball × (1 ∓ r): r by ball size from IPC-7351B Table 14-5 (collapsing: 25 / 20 / 15 %) or Table 14-6 (non-collapsing: +15 / +10 / +5 %), by IPC-7352 density level, or from the package pad (TI SPRAA99C §2.1); the land is judged against the tabulated variation. NSMD/SMD copper and mask opening from the mask clearance; routing channel between lands N = ⌊(p − D_cu − s)/(W + s)⌋ (Intel AN 114, imported from the BGA breakout page). Mask-web threshold is a labelled rule of thumb.',
  fields,
  defaults,
  solve: {
    default: 'land',
    analysis: 'land',
    options: [
      { key: 'land', label: 'Land from the ball (design)' },
      { key: 'pct', label: 'Check an existing land (its % of the ball)' },
    ],
  },
  compute,
  examples: [
    { id: 'default', label: '0.8 mm BGA, 0.45 mm SAC balls, IPC-7351B, NSMD', state: defaults() },
    { id: 'p10', label: '1.0 mm BGA, 0.6 mm balls: IPC 25 % gives TI’s 0.45 mm land', state: { ...defaults(), p: 1.0 * MM, ball: 0.6 * MM, land: 0.45 * MM, pct: 25, n: 2, w: 0.1 * MM, s: 0.1 * MM } },
    { id: 'pbga127', label: '1.27 mm PBGA, 0.75 mm balls, two 5 mil traces', state: { ...defaults(), p: 1.27 * MM, ball: 0.75 * MM, land: 0.5625 * MM, pct: 25, n: 2, w: 0.127 * MM, s: 0.127 * MM } },
    { id: 'check-old', label: 'Check an old 0.55 mm land under 0.6 mm balls (1.0 mm pitch)', state: { ...defaults(), solveFor: 'pct', p: 1.0 * MM, ball: 0.6 * MM, land: 0.55 * MM, pct: 8.33, n: 1 } },
    { id: 'wlcsp04', label: '0.4 mm WLCSP, 0.25 mm balls, 2 mil trace', state: { ...defaults(), p: 0.4 * MM, ball: 0.25 * MM, land: 0.2 * MM, pct: 20, maskClr: 0.0375 * MM, n: 1, w: 0.05 * MM, s: 0.05 * MM } },
    { id: 'cucore05', label: '0.5 mm pitch, 0.3 mm non-collapsing balls, SMD', state: { ...defaults(), p: 0.5 * MM, ball: 0.3 * MM, ballType: 'noncollapse', padDef: 'smd', land: 0.33 * MM, pct: 10, maskClr: 0.05 * MM, n: 0, w: 0.075 * MM, s: 0.075 * MM } },
  ],
};
