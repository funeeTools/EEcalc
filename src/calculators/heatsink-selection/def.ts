/** Heatsink selection — calculator definition (inputs, solve-for, report). DOM-free. */

import { brent } from '@/core/calc/solve';
import type { CalcDef, CalcReport, GraphSpec, ResultItem, TableSpec } from '@/core/calc/types';
import { emptyReport, errorReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { si } from '@/core/units';
import { U_LEN, withDefault } from '@/core/unitsets';
import { VOLUMETRIC, maxFins, riseFor, sinkTheta, thetaSaRequired, type Flow, type Sink, type SinkResult } from './model';

export const ID = 'thermal/heatsink-selection';

export interface HeatsinkSelState {
  solveFor: 'len' | 'p' | 'tj';
  p: number;
  tjMax: number;
  ta: number;
  thetaJC: number;
  thetaCS: number;
  tj: number;
  mode: 'natural' | 'forced';
  v: number;
  w: number;
  wUnit: string;
  len: number;
  lenUnit: string;
  h: number;
  hUnit: string;
  t: number;
  tUnit: string;
  tb: number;
  tbUnit: string;
  nMode: 'opt' | 'manual';
  /** smallest fin gap considered by the automatic fin count, m */
  sMin: number;
  sMinUnit: string;
  n: number;
  material: 'al6063' | 'cu' | 'custom';
  kf: number;
  eps: number;
  /** space available, m³ (null = not given) */
  maxVol: number | null;
  /** heat-source footprint on the base, m² (null = heat spread over the whole base) */
  src: number | null;
  srcUnit: string;
  maxVolUnit: string;
}

export const defaults = (): HeatsinkSelState => ({
  solveFor: 'len',
  p: 20,
  tjMax: 150,
  ta: 40,
  thetaJC: 1,
  thetaCS: 0.5,
  tj: 110,
  mode: 'natural',
  v: 2,
  w: 0.1,
  wUnit: 'mm',
  len: 0.1,
  lenUnit: 'mm',
  h: 0.03,
  hUnit: 'mm',
  t: 1.5e-3,
  tUnit: 'mm',
  tb: 5e-3,
  tbUnit: 'mm',
  nMode: 'opt',
  sMin: 1.5e-3,
  sMinUnit: 'mm',
  n: 12,
  material: 'al6063',
  kf: 209,
  eps: 0.85,
  maxVol: null,
  src: 300e-6,
  srcUnit: 'mm²',
  maxVolUnit: 'cm³',
});

const MATERIALS: Record<string, { label: string; k: number }> = {
  al6063: { label: 'Aluminium 6063-T5 (extrusion)', k: 209 },
  cu: { label: 'Copper', k: 401 },
  custom: { label: 'Custom', k: NaN },
};
const U_MM = withDefault(U_LEN, 'mm');
const U_VOL: Record<string, number> = { 'cm³': 1e-6, L: 1e-3, 'in³': 16.387064e-6 };
const U_AREA: Record<string, number> = { 'mm²': 1e-6, 'cm²': 1e-4, 'in²': 6.4516e-4 };

const fields: FieldSpec[] = [
  {
    kind: 'section',
    title: 'Requirement',
    note: 'Click ◎ to choose the unknown: heatsink length, maximum power, or junction temperature.',
    fields: [
      { kind: 'number', key: 'p', symbol: 'P', label: 'Power', unit: 'W', min: 1e-3, max: 1e5, solvable: true },
      { kind: 'number', key: 'ta', symbol: 'T_A', label: 'Ambient', suffix: '°C', min: -40, max: 200, help: 'Air temperature entering the heatsink (inside the enclosure, not the room).' },
      { kind: 'number', key: 'thetaJC', symbol: 'θ_JC', label: 'Junction–case', suffix: '°C/W', min: 0, max: 1e3 },
      { kind: 'number', key: 'thetaCS', symbol: 'θ_CS', label: 'Interface', suffix: '°C/W', min: 0, max: 1e3, help: 'Thermal grease, pad or insulator between the case and the heatsink.' },
      { kind: 'number', key: 'tj', symbol: 'T_J', label: 'Junction', suffix: '°C', min: -50, max: 1e4, solvable: true, help: 'The junction temperature to design to (usually 10–25 °C below the rating) when solving for L or P; calculated when you analyse a given heatsink (◎).' },
      { kind: 'number', key: 'tjMax', symbol: 'T_J,max', label: 'Rating', suffix: '°C', min: -50, max: 400, help: 'Absolute maximum from the datasheet; the analysis is judged against it.' },
    ],
  },
  {
    kind: 'section',
    title: 'Cooling',
    fields: [
      { kind: 'select', key: 'mode', label: 'Air flow', structural: true, options: [{ value: 'natural', label: 'Natural convection (fins vertical)' }, { value: 'forced', label: 'Forced air (ducted through the fins)' }] },
      { kind: 'number', key: 'v', symbol: 'V', label: 'Air velocity', unit: 'm/s', min: 0.05, max: 50, visible: (s) => s.mode === 'forced', help: 'Air speed ahead of the heatsink. All of it is assumed to pass between the fins (ducted, no bypass).' },
      { kind: 'number', key: 'maxVol', symbol: 'V_max', label: 'Space', units: U_VOL, unitKey: 'maxVolUnit', optional: true, zeroHint: 'not set', min: 1e-9, max: 1, help: 'Optional. The class table then marks which cooling classes fit this volume.' },
    ],
  },
  {
    kind: 'section',
    title: 'Plate-fin heatsink',
    note: 'Base W × L with N fins of height H; L runs along the air flow (vertical for natural convection).',
    fields: [
      { kind: 'number', key: 'w', symbol: 'W', label: 'Base width', units: U_MM, unitKey: 'wUnit', min: 5e-3, max: 2 },
      { kind: 'number', key: 'len', symbol: 'L', label: 'Fin length', units: U_MM, unitKey: 'lenUnit', min: 5e-3, max: 3, solvable: true, help: 'Length along the air flow (the vertical height of the fins in natural convection). Solved: the length that meets θ_SA,req.' },
      { kind: 'number', key: 'h', symbol: 'H', label: 'Fin height', units: U_MM, unitKey: 'hUnit', min: 1e-3, max: 0.5 },
      { kind: 'number', key: 't', symbol: 't', label: 'Fin thickness', units: U_MM, unitKey: 'tUnit', min: 0.1e-3, max: 0.02 },
      { kind: 'number', key: 'tb', symbol: 't_b', label: 'Base thickness', units: U_MM, unitKey: 'tbUnit', min: 0.2e-3, max: 0.1 },
      {
        kind: 'number', key: 'n', symbol: 'N', label: 'Fins', integer: true, min: 2, max: 500, solvable: true,
        solvedWhen: (_s, root) => root.nMode === 'opt', onSolve: (_s, root) => (root.nMode = 'opt'), onUnsolve: (_s, root) => (root.nMode = 'manual'),
        help: 'Green = chosen automatically for the lowest θ_SA. Click ◎ to enter your own count.',
      },
      { kind: 'number', key: 'sMin', symbol: 'S_min', label: 'Min. gap', units: U_MM, unitKey: 'sMinUnit', min: 0.2e-3, max: 0.1, visible: (s) => s.nMode === 'opt', help: 'Lower limit on the gap for the automatic fin count, from what the maker can extrude or bond and the pressure your fan can supply (dense fins need far more pressure, which this page does not compute). Matters mostly for forced air.' },
      {
        kind: 'select', key: 'material', label: 'Material', options: Object.entries(MATERIALS).map(([value, m]) => ({ value, label: m.label })),
        apply: (v: string, scope) => {
          if (MATERIALS[v] && Number.isFinite(MATERIALS[v].k)) scope.kf = MATERIALS[v].k;
        },
      },
      { kind: 'number', key: 'kf', symbol: 'k', label: 'Conductivity', suffix: 'W/m·K', min: 1, max: 2000 },
      { kind: 'number', key: 'src', symbol: 'A_s', label: 'Source area', units: U_AREA, unitKey: 'srcUnit', optional: true, zeroHint: 'whole base', min: 1e-8, max: 1, help: 'Footprint of the device on the base (a TO-247 case is roughly 300 mm², a TO-220 tab about 100 mm²). Adds Lee’s spreading resistance for a source centred on the base. Leave blank if the heat is spread over the whole base.' },
      { kind: 'number', key: 'eps', symbol: 'ε', label: 'Emissivity', min: 0, max: 1, help: 'Surface emissivity for radiation from the outer envelope: black anodised ≈ 0.8–0.9, bare or polished aluminium 0.05–0.1. 0 turns radiation off.' },
    ],
  },
];

const cw = (x: number) => `${Math.abs(x) >= 1000 ? Math.round(x) : x.toPrecision(3)} °C/W`;
const degC = (t: number) => `${t.toFixed(1)} °C`;
const mm = (x: number) => si(x, 'm', 3);
const cm3 = (v: number) => `${(v / 1e-6).toPrecision(3)} cm³`;

function finite(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a finite number.`);
  return v;
}

export function compute(st: HeatsinkSelState): CalcReport {
  try {
    return run(st);
  } catch (e) {
    return { ...errorReport(ID, e), solveFor: st.solveFor };
  }
}

export function sinkOf(s: HeatsinkSelState, len: number, n: number): Sink {
  return { w: s.w, l: len, h: s.h, t: s.t, tb: s.tb, n, kf: s.kf, eps: s.eps, src: s.src };
}

/** Fin count with the lowest θ_SA at base rise dT (all counts that leave a gap ≥ 0.5 mm, up to 200). */
export function bestFins(s: HeatsinkSelState, fl: Flow, len: number, dT: number): { n: number; r: SinkResult } | null {
  let best: { n: number; r: SinkResult } | null = null;
  const nMax = Math.min(maxFins(s.w, s.t, s.sMin), 200);
  for (let n = 2; n <= nMax; n++) {
    const r = sinkTheta(sinkOf(s, len, n), fl, s.ta, dT);
    if (r && (!best || r.theta < best.r.theta)) best = { n, r };
  }
  return best;
}

/** θ_SA of the design at rise dT (fin count fixed or optimised at that rise). */
function thetaAt(s: HeatsinkSelState, fl: Flow, len: number, dT: number): { n: number; r: SinkResult } | null {
  if (s.nMode === 'opt') return bestFins(s, fl, len, dT);
  const r = sinkTheta(sinkOf(s, len, s.n), fl, s.ta, dT);
  return r ? { n: s.n, r } : null;
}

/** Fin count to use with power p: optimised at the self-consistent rise (two passes), or the manual count. */
function finsFor(s: HeatsinkSelState, fl: Flow, len: number, p: number, dTguess: number): number {
  if (s.nMode !== 'opt') return s.n;
  let n = bestFins(s, fl, len, Math.max(dTguess, 0.5))?.n ?? 2;
  for (let k = 0; k < 2; k++) {
    const rise = riseFor(sinkOf(s, len, n), fl, s.ta, p);
    if (!rise) break;
    const n2 = bestFins(s, fl, len, Math.max(rise.dT, 0.5))?.n ?? n;
    if (n2 === n) break;
    n = n2;
  }
  return n;
}

function run(st: HeatsinkSelState): CalcReport {
  const s: HeatsinkSelState = { ...st };
  for (const k of ['tjMax', 'ta', 'thetaJC', 'thetaCS', 'w', 'h', 't', 'tb', 'kf', 'eps', 'v', 'sMin'] as const) finite(k, s[k]);
  if (!(s.sMin > 0)) throw new Error('Smallest fin gap must be > 0.');
  if (s.thetaJC < 0 || s.thetaCS < 0) throw new Error('θ_JC and θ_CS must be ≥ 0.');
  if (!(s.w > 0 && s.h > 0 && s.t > 0 && s.tb > 0)) throw new Error('Heatsink dimensions must be > 0.');
  if (!(s.kf > 0)) throw new Error('Thermal conductivity must be > 0.');
  if (s.eps < 0 || s.eps > 1) throw new Error('Emissivity must be 0 … 1.');
  if (s.mode === 'forced' && !(s.v > 0)) throw new Error('Air velocity must be > 0.');
  if (s.src != null && !(finite('Source area', s.src) > 0)) throw new Error('Source area must be > 0 (or blank for heat spread over the whole base).');
  if (s.maxVol != null && !(finite('Space available', s.maxVol) > 0)) throw new Error('Space available must be > 0 (or blank).');
  if (s.nMode === 'manual') {
    finite('Number of fins', s.n);
    s.n = Math.round(s.n);
    if (s.n < 2) throw new Error('At least 2 fins.');
    if (!(s.w - s.n * s.t > 0)) throw new Error(`${s.n} fins of ${mm(s.t)} do not fit on a ${mm(s.w)} base. Reduce N or t, or widen the base.`);
  } else if (!(s.w > 2 * s.t + s.sMin)) throw new Error(`The base is too narrow for two fins of ${mm(s.t)} with a ${mm(s.sMin)} gap.`);
  if (s.solveFor !== 'len') {
    finite('Fin length', s.len);
    if (!(s.len > 0)) throw new Error('Fin length must be > 0.');
  }
  if (s.solveFor !== 'p') {
    finite('Power', s.p);
    if (!(s.p > 0)) throw new Error('Power must be > 0.');
  }
  if (s.solveFor !== 'tj') finite('Junction temperature', s.tj);
  /** temperature limit: the design target when sizing, the rating when analysing */
  const tLim = s.solveFor === 'tj' ? s.tjMax : s.tj;
  if (!(tLim > s.ta)) throw new Error(`${s.solveFor === 'tj' ? 'T_J,max' : 'The target T_J'} must be above the ambient temperature.`);
  const fl: Flow = { mode: s.mode, v: s.v };
  const warnings: string[] = [];
  const notes: string[] = [];
  let status: CalcReport['status'];
  const fail = (msg: string): CalcReport => ({ ...emptyReport(ID), ok: false, error: msg, solveFor: s.solveFor, status: { text: 'NO SOLUTION', tone: 'fail' } });

  // ── solve
  let shortest = false;
  if (s.solveFor === 'len') {
    const req = thetaSaRequired(tLim, s.ta, s.p, s.thetaJC, s.thetaCS);
    if (!(req > 0)) return fail(`θ_JC + θ_CS = ${cw(s.thetaJC + s.thetaCS)} already uses the whole budget (T_J − T_A)/P = ${cw((tLim - s.ta) / s.p)}: no heatsink can work. Lower P or θ_CS, or use a part with lower θ_JC.`);
    const dTreq = s.p * req;
    const f = (len: number) => {
      const r = thetaAt(s, fl, len, dTreq);
      return r ? r.r.theta - req : NaN;
    };
    // θ_SA(L) is not monotonic once a small source is entered (the spreading resistance grows with the base
    // area faster than the convective part falls), so scan for its minimum before looking for the root.
    const lo = 5e-3;
    const hi = 3;
    const NS = 48;
    const ls = Array.from({ length: NS + 1 }, (_, k) => lo * (hi / lo) ** (k / NS));
    const fs = ls.map(f);
    let iMin = 0;
    fs.forEach((v, k) => {
      if (v < fs[iMin]) iMin = k;
    });
    // golden-section refinement of the minimum (on log L) between the scan neighbours
    let a = Math.log(ls[Math.max(iMin - 1, 0)]);
    let c = Math.log(ls[Math.min(iMin + 1, NS)]);
    const gr = (Math.sqrt(5) - 1) / 2;
    let x1 = c - gr * (c - a);
    let x2 = a + gr * (c - a);
    let f1 = f(Math.exp(x1));
    let f2 = f(Math.exp(x2));
    for (let k = 0; k < 60 && c - a > 1e-10; k++) {
      if (f1 < f2) {
        c = x2;
        x2 = x1;
        f2 = f1;
        x1 = c - gr * (c - a);
        f1 = f(Math.exp(x1));
      } else {
        a = x1;
        x1 = x2;
        f1 = f2;
        x2 = a + gr * (c - a);
        f2 = f(Math.exp(x2));
      }
    }
    let lBest = Math.exp((a + c) / 2);
    let fBest = f(lBest);
    if (fs[iMin] < fBest) {
      lBest = ls[iMin];
      fBest = fs[iMin];
    }
    if (!(fBest <= 0)) {
      const best = thetaAt(s, fl, lBest, dTreq);
      return fail(
        `No fin length works: the best is θ_SA = ${best ? cw(best.r.theta) : '—'} at L = ${mm(lBest)}, above the ${cw(req)} needed${lBest < 0.95 * hi ? ' (longer fins make it worse: the spreading resistance from the small source grows with the base)' : ''}. Use a wider base or taller fins, ${s.mode === 'natural' ? 'forced air' : 'more air flow'}, a thicker or copper base, or a heat pipe / liquid cold plate (see the class table).`,
      );
    }
    if (lBest < 0.95 * hi && fs[NS] > fBest + 1e-6 * req)
      notes.push(`θ_SA has a minimum near L = ${mm(lBest)}: longer fins make it worse, because the spreading resistance from the small source grows with the base area faster than the cooling improves. Keep L at or below that.`);
    if (f(lo) <= 0) {
      s.len = lo;
      shortest = true;
    } else {
      // shortest length that meets the requirement: first sign change below the minimum
      const pts = [...ls.filter((x) => x < lBest), lBest];
      const fp = pts.map((x) => (x === lBest ? fBest : f(x)));
      const k = fp.findIndex((v) => v <= 0);
      s.len = fp[k] === 0 ? pts[k] : brent(f, pts[k - 1], pts[k], 1e-9);
    }
  }
  let n: number;
  let rise: { dT: number; r: SinkResult } | null;
  if (s.solveFor === 'p') {
    const budget = tLim - s.ta;
    n = finsFor(s, fl, s.len, 1, 0.7 * budget);
    const tjOf = (p: number, nn: number) => {
      const rr = riseFor(sinkOf(s, s.len, nn), fl, s.ta, p);
      return rr ? s.ta + p * (s.thetaJC + s.thetaCS) + rr.dT - tLim : NaN;
    };
    const solveP = (nn: number) => {
      let hi = 1;
      for (let k = 0; k < 80 && tjOf(hi, nn) < 0; k++) hi *= 2;
      return brent((p) => tjOf(p, nn), 1e-9, hi, 1e-12 * hi);
    };
    let p = solveP(n);
    if (s.nMode === 'opt') {
      // the best fin count depends on the rise, which depends on P: take the count (n or a neighbour)
      // that allows the most power, and repeat until it settles
      const nMax = Math.min(maxFins(s.w, s.t, s.sMin), 200);
      for (let it = 0; it < 200; it++) {
        let bestN = n;
        let bestP = p;
        for (const m of [n - 1, n + 1]) {
          if (m < 2 || m > nMax) continue;
          const pm = solveP(m);
          if (pm > bestP * (1 + 1e-9)) {
            bestN = m;
            bestP = pm;
          }
        }
        if (bestN === n) break;
        n = bestN;
        p = bestP;
      }
    }
    if (p > 1e5 * (1 + 1e-9) || p < 1e-3 * (1 - 1e-9))
      return fail(`The heatsink allows ${si(p, 'W', 3)}, outside the ${si(1e-3, 'W')} … ${si(1e5, 'W')} this input accepts${p < 1e-3 ? ': θ_JC + θ_CS leave almost no temperature budget. Lower θ_JC + θ_CS or raise the target T_J' : '. Check θ_JC, θ_CS and the target T_J'}.`);
    s.p = p;
  } else {
    const req0 = thetaSaRequired(tLim, s.ta, s.p, s.thetaJC, s.thetaCS);
    n = finsFor(s, fl, s.len, s.p, s.p * Math.max(req0, 0.5));
  }
  rise = riseFor(sinkOf(s, s.len, n), fl, s.ta, s.p);
  if (!rise) throw new Error('This geometry has no gap between the fins.');
  const r = rise.r;
  s.n = n;
  const req = thetaSaRequired(tLim, s.ta, s.p, s.thetaJC, s.thetaCS);
  const tSink = s.ta + rise.dT;
  const tCase = tSink + s.p * s.thetaCS;
  const tjCalc = tCase + s.p * s.thetaJC;
  if (s.solveFor === 'tj') {
    if (tjCalc > 1e4) return fail(`T_J would be ${degC(tjCalc)}, beyond the 10 000 °C this input accepts: the stack (θ_JC + θ_CS = ${cw(s.thetaJC + s.thetaCS)}) or the power is far too high. Lower P or the package and interface resistances.`);
    s.tj = tjCalc;
  }
  const theta = rise.dT / s.p;
  const margin = tLim - tjCalc;
  if (shortest) notes.push(`Even the shortest length considered (5 mm) gives θ_SA = ${cw(theta)}, better than the ${cw(req)} needed: this base is larger than necessary. Use a narrower base, shorter fins, or a smaller (stamped or clip-on) heatsink.`);
  if (s.solveFor !== 'tj' && s.tj > s.tjMax) warnings.push(`The target T_J = ${degC(s.tj)} is above the ${degC(s.tjMax)} rating. Design to 10–25 °C below the rating.`);
  if (s.solveFor === 'tj' && margin < -1e-9) {
    status = { text: 'TOO HOT', tone: 'fail' };
    warnings.push(
      req > 0
        ? `T_J = ${degC(s.tj)} exceeds T_J,max = ${degC(tLim)} by ${(-margin).toFixed(1)} °C: this heatsink gives ${cw(theta)}, ${cw(req)} is needed. Lengthen it (solve for L), ${s.mode === 'natural' ? 'use forced air' : 'raise the air speed'}, or lower θ_CS.`
        : `T_J = ${degC(s.tj)} exceeds T_J,max = ${degC(tLim)}: the package and interface alone (θ_JC + θ_CS = ${cw(s.thetaJC + s.thetaCS)}) need more than the ${cw((tLim - s.ta) / s.p)} budget at ${si(s.p, 'W', 3)}, so no heatsink can fix it. Lower P, θ_CS or θ_JC.`,
    );
  } else if (s.solveFor === 'tj') status = { text: 'OK', tone: 'pass' };
  if (s.solveFor !== 'p' && s.solveFor !== 'tj' && !(req > 0)) warnings.push(`θ_JC + θ_CS alone exceed the budget: no heatsink can keep T_J below ${degC(tLim)} at ${si(s.p, 'W', 3)}.`);

  // ── report
  const item = (key: string, label: string, value: number | string | null, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const primary: ResultItem[] = [];
  if (s.solveFor === 'len') primary.push(item('len', 'Fin length needed', s.len, 'm', mm(s.len), { symbol: 'L', solved: true, primary: true, note: `${s.n} fins · ${mm(s.w)} × ${mm(s.len)} × ${mm(s.h + s.tb)}` }));
  if (s.solveFor === 'p') primary.push(item('p', 'Maximum power', s.p, 'W', si(s.p, 'W', 4), { symbol: 'P', solved: true, primary: true, note: `T_J reaches ${degC(tLim)}` }));
  if (s.solveFor === 'tj') primary.push(item('tj', 'Junction temperature', s.tj, '°C', degC(s.tj), { symbol: 'T_J', solved: true, primary: true, tone: margin < 0 ? 'fail' : '', note: `${margin >= 0 ? 'margin' : 'over by'} ${Math.abs(margin).toFixed(1)} °C` }));
  primary.push(
    item('thetaReq', 'Required θ_SA', req > 0 ? req : null, '°C/W', req > 0 ? cw(req) : '—', { symbol: 'θ_SA,req', primary: true, note: s.solveFor === 'tj' ? `to stay at T_J,max ${degC(s.tjMax)}` : `for T_J ${degC(s.tj)}` }),
    item('theta', 'Heatsink θ_SA', theta, '°C/W', cw(theta), { symbol: 'θ_SA', primary: true, tone: req > 0 && theta > req * (1 + 1e-9) ? 'fail' : '', note: `${s.mode === 'natural' ? 'natural convection' : `${s.v} m/s`} · sink at ${degC(tSink)}` }),
    item('volume', 'Heatsink volume', r.volume, 'm³', cm3(r.volume), { symbol: 'V', primary: true, tone: s.maxVol != null && r.volume > s.maxVol ? 'warn' : '', note: `θ·V = ${((theta * r.volume) / 1e-6).toFixed(0)} cm³·°C/W` }),
  );

  const D = 'Design';
  const rest: ResultItem[] = [
    item('n', 'Number of fins', s.n, '', `${s.n}`, { symbol: 'N', group: D, solved: s.nMode === 'opt', note: s.nMode === 'opt' ? 'lowest θ_SA' : undefined }),
    item('gap', 'Fin gap', r.s, 'm', mm(r.s), { symbol: 'S', group: D, note: s.mode === 'natural' ? `optimum S_opt ${mm(r.sOpt)}` : undefined }),
    item('hc', 'Convection coefficient', r.hc, 'W/m²K', `${r.hc.toPrecision(3)} W/m²·K`, { symbol: 'h', group: D, note: `Nu ${r.nu.toPrecision(3)}, ${s.mode === 'natural' ? 'Ra_S·S/L' : 'Re*'} ${r.group.toPrecision(3)}` }),
    item('etaF', 'Fin efficiency', r.etaF, '', `${(r.etaF * 100).toFixed(1)} %`, { symbol: 'η_f', group: D, tone: r.etaF < 0.6 ? 'warn' : '' }),
    item('area', 'Wetted area', r.area, 'm²', `${(r.area * 1e4).toPrecision(4)} cm²`, { symbol: 'A', group: D }),
    item('tSink', 'Heatsink base temperature', tSink, '°C', degC(tSink), { symbol: 'T_S', group: 'Temperatures' }),
    item('tCase', 'Case temperature', tCase, '°C', degC(tCase), { symbol: 'T_C', group: 'Temperatures' }),
    ...(s.solveFor !== 'tj' ? [item('tjOut', 'Junction temperature', tjCalc, '°C', degC(tjCalc), { symbol: 'T_J', group: 'Temperatures' })] : []),
    item('thetaConv', 'Convection', r.thetaConv, '°C/W', cw(r.thetaConv), { symbol: 'θ_conv', group: 'Resistances' }),
    item('thetaRad', 'Radiation (envelope)', Number.isFinite(r.thetaRad) ? r.thetaRad : null, '°C/W', Number.isFinite(r.thetaRad) ? cw(r.thetaRad) : 'off', { symbol: 'θ_rad', group: 'Resistances', note: Number.isFinite(r.thetaRad) ? `${((theta - r.thetaBase > 0 ? (theta - r.thetaBase) / r.thetaRad : 0) * 100).toFixed(0)} % of the heat` : undefined }),
    item('thetaBase', s.src != null ? 'Spreading (centred source)' : 'Base conduction', r.thetaBase, '°C/W', cw(r.thetaBase), { symbol: s.src != null ? 'R_c' : 'θ_base', group: 'Resistances', note: s.src != null ? `Lee (1998), ${si(s.src * 1e6, 'mm²', 3)} source` : 'heat spread over the whole base' }),
  ];
  if (s.mode === 'forced') {
    rest.push(
      item('vch', 'Channel velocity', r.vch, 'm/s', `${r.vch.toPrecision(3)} m/s`, { symbol: 'V_ch', group: 'Air' }),
      item('flow', 'Air flow', r.flow, 'm³/s', `${(r.flow * 1000).toPrecision(3)} L/s · ${(r.flow * 2118.88).toPrecision(3)} CFM`, { symbol: 'G', group: 'Air' }),
      item('dTair', 'Air temperature rise', r.dTair, 'K', `${r.dTair.toFixed(1)} K`, { symbol: 'ΔT_air', group: 'Air' }),
      item('reDh', 'Channel Reynolds number', r.reDh, '', r.reDh.toPrecision(3), { symbol: 'Re_Dh', group: 'Air', tone: r.reDh > 2300 ? 'warn' : '' }),
    );
  }
  const cls = VOLUMETRIC.find((c) => (s.mode === 'natural' ? c.v == null : c.v != null && Math.abs(c.v - s.v) < 1e-9));
  if (cls) rest.push(item('leeCheck', `Lee (1995) range, ${cls.label.toLowerCase()}`, theta * r.volume, 'm³K/W', `${(cls.lo / 1e-6).toFixed(0)}–${(cls.hi / 1e-6).toFixed(0)} cm³·°C/W (this design ${((theta * r.volume) / 1e-6).toFixed(0)})`, { group: 'Cross-check' }));

  const report: CalcReport = { ...emptyReport(ID), solveFor: s.solveFor, status, warnings, notes };
  report.results = [...primary, ...rest];

  // ── tables
  if (req > 0) report.tables.push(classTable(s, req));
  report.tables.push(finTable(s, fl, rise.dT, req));

  // ── warnings & notes
  if (s.src != null && Math.max(s.w / s.len, s.len / s.w) > 2.5) notes.push(`The base aspect ratio ${Math.max(s.w / s.len, s.len / s.w).toFixed(1)} is above 2.5, where Lee quotes ±5 % for the spreading correlation: treat R_c as approximate.`);
  if (s.src != null && s.src >= s.w * s.len) notes.push('The source covers the whole base: only one-dimensional base conduction is added.');
  if (s.src == null) notes.push('No source area given: the heat is assumed to spread evenly over the base. A small device on a large base adds spreading resistance; enter its footprint to include it.');
  if (r.etaF < 0.6) warnings.push(`Fin efficiency is only ${(r.etaF * 100).toFixed(0)} %: the fins are too thin or too tall for ${s.kf} W/m·K. Thicken them, shorten them, or use copper.`);
  if (s.mode === 'forced' && r.reDh > 2300) warnings.push(`Channel Reynolds number ${r.reDh.toPrecision(3)} is above 2300: the flow is no longer laminar, which the Teertstra model assumes. The real θ_SA will be somewhat lower; treat this as conservative.`);
  if (s.mode === 'natural' && s.nMode === 'manual' && r.s < 0.7 * r.sOpt) warnings.push(`The fin gap ${mm(r.s)} is well below the natural-convection optimum ${mm(r.sOpt)}: the channels choke the buoyant flow. Use fewer fins.`);
  if (s.mode === 'natural' && s.h < 2 * r.s) notes.push('Fins are short compared with the gap: the parallel-plate correlation is less accurate for such open channels.');
  const tFilmK = (tSink + s.ta) / 2 + 273.15;
  if (tFilmK > 500 || tFilmK < 200) warnings.push('The film temperature is outside the 200–500 K air-property table: properties are clamped at its end.');
  if (s.maxVol != null && r.volume > s.maxVol) warnings.push(`The design needs ${cm3(r.volume)}, more than the ${cm3(s.maxVol)} available. Check the class table for a cooling class that fits.`);
  if (cls && (theta * r.volume < 0.5 * cls.lo || theta * r.volume > 2 * cls.hi))
    notes.push(
      s.mode === 'forced' && theta * r.volume < cls.lo
        ? `This design’s θ·V is well below Lee’s ${cls.label.toLowerCase()} range: the ducted model sends all the air through the fins, while Lee’s figures include typical bypass. Without a shroud expect a higher θ_SA.`
        : `This design’s θ·V is far from Lee’s ${cls.label.toLowerCase()} range: check the geometry (very sparse or very dense fins).`,
    );
  notes.push(
    s.mode === 'natural'
      ? 'Natural convection with vertical fins and channels open top and bottom (Bar-Cohen & Rohsenow). Horizontal or boxed-in heatsinks perform noticeably worse.'
      : 'Forced air is ducted: all the air passes between the fins (Teertstra et al.). With bypass around the heatsink, θ_SA rises; Lee’s table includes typical bypass.',
    'Spreading resistance is for a single source centred on the base (Lee 1998); an off-centre source is worse (Lee gives ×1.9 at an edge, ×3.6 in a corner for his example).',
    'Radiation leaves only from the outer envelope (fin tips and the two outside fins) to surroundings at T_A.',
  );
  report.summary = `${si(s.p, 'W', 3)} · θ_SA,req ${req > 0 ? cw(req) : '—'} → ${s.n} fins ${mm(s.w)} × ${mm(s.len)} × ${mm(s.h)} (${s.mode === 'natural' ? 'natural' : `${s.v} m/s`}) gives ${cw(theta)}, T_J ${degC(s.tj)}`;
  report.details = { ...r, air: undefined, dT: rise.dT, tSink, tCase, tj: s.tj, theta, req, solved: { len: s.len, p: s.p, tj: s.tj, n: s.n } };
  report.graphs = graphs(s, fl, rise.dT, req, theta, r);
  return report;
}

function classTable(s: HeatsinkSelState, req: number): TableSpec {
  const rows = VOLUMETRIC.map((c) => ({ cls: c.label, rv: `${(c.lo / 1e-6).toFixed(0)}–${(c.hi / 1e-6).toFixed(0)}`, vLo: c.lo / req, vHi: c.hi / req }));
  const tones = s.maxVol != null ? rows.map((x) => (x.vHi <= s.maxVol! ? 'pass' : x.vLo <= s.maxVol! ? 'warn' : 'fail') as 'pass' | 'warn' | 'fail') : undefined;
  return {
    id: 'classes',
    title: `Heatsink volume for θSA = ${cw(req)} (Lee 1995)`,
    columns: [
      { key: 'cls', label: 'Cooling', align: 'left' },
      { key: 'rv', label: 'Volumetric resistance', unit: 'cm³·°C/W' },
      { key: 'vLo', label: 'Volume from' },
      { key: 'vHi', label: 'to' },
    ],
    rows,
    rowTones: tones,
    display: rows.map((x) => ({ cls: x.cls, rv: x.rv, vLo: cm3(x.vLo), vHi: cm3(x.vHi) })),
    note:
      (s.maxVol != null
        ? `Green: fits in ${cm3(s.maxVol)} even at the pessimistic end; yellow: fits only at the optimistic end; red: does not fit. `
        : 'Enter the space available to mark which classes fit. ') +
      'Volume ≈ R_v/θSA (envelope volume of the heatsink). A first estimate only (Lee): below what forced air fits in your space, heat pipes, vapour chambers or a liquid cold plate are the next steps.',
  };
}

function finTable(s: HeatsinkSelState, fl: Flow, dT: number, req: number): TableSpec {
  const nMax = Math.min(maxFins(s.w, s.t, s.nMode === 'opt' ? s.sMin : 0.2e-3), 200);
  const all: { n: number; r: SinkResult }[] = [];
  for (let n = 2; n <= nMax; n++) {
    const r = sinkTheta(sinkOf(s, s.len, n), fl, s.ta, dT);
    if (r) all.push({ n, r });
  }
  const iBest = all.reduce((b, x, i) => (x.r.theta < all[b].r.theta ? i : b), 0);
  const iCur = Math.max(all.findIndex((x) => x.n === s.n), 0);
  const lo = Math.max(0, Math.min(iBest, iCur) - 3);
  const hi = Math.min(all.length - 1, Math.max(iBest, iCur) + 3);
  const pick = all.slice(lo, hi + 1);
  const rows = pick.map((x) => ({ n: x.n, s: x.r.s, h: x.r.hc, etaF: x.r.etaF * 100, theta: x.r.theta, tj: s.ta + dT * (x.r.theta / (dT / s.p)) + s.p * (s.thetaJC + s.thetaCS) }));
  return {
    id: 'fins',
    title: `Fin count at L = ${mm(s.len)} (at TS − TA = ${dT.toFixed(1)} K)`,
    columns: [
      { key: 'n', label: 'N' },
      { key: 's', label: 'Gap S' },
      { key: 'h', label: 'h', unit: 'W/m²K' },
      { key: 'etaF', label: 'ηf', unit: '%' },
      { key: 'theta', label: 'θSA', unit: '°C/W' },
      { key: 'tj', label: 'TJ (approx.)', unit: '°C' },
    ],
    rows,
    rowTones: req > 0 ? rows.map((x) => (x.theta > req * (1 + 1e-9) ? 'fail' : x.theta > 0.9 * req ? 'warn' : 'pass')) : undefined,
    display: rows.map((x) => ({ n: `${x.n}${x.n === s.n ? ' ◀' : ''}`, s: mm(x.s), h: x.h.toPrecision(3), etaF: `${x.etaF.toFixed(1)} %`, theta: cw(x.theta), tj: degC(x.tj) })),
    note: 'θSA at the present temperature rise; TJ scales it to this power (approximate for other rows, since h depends on ΔT). Red: above θSA,req; yellow: within 10 % of it; green: ≥ 10 % margin. ◀ marks the design.',
  };
}

function graphs(s: HeatsinkSelState, fl: Flow, dT: number, req: number, theta: number, r: SinkResult): GraphSpec[] {
  // 1 — θ_SA vs fin length
  // the whole range of the L input (5 mm … 3 m), so a length solved at its 5 mm floor is still on the plot
  const ls = Array.from({ length: 61 }, (_, i) => 5e-3 * 600 ** (i / 60));
  if (s.len > ls[0] && s.len < ls[ls.length - 1]) ls.push(s.len), ls.sort((a, b) => a - b);
  const th = ls.map((l) => thetaAt(s, fl, l, dT)?.r.theta ?? NaN);
  const ok = th.map((x) => Number.isFinite(x));
  const g1: GraphSpec = {
    id: 'vs-length',
    title: 'θSA vs fin length',
    subtitle: `${s.nMode === 'opt' ? 'Best fin count at each length' : `${s.n} fins`} · at TS − TA = ${dT.toFixed(1)} K`,
    x: { label: 'Fin length L', unit: 'm', log: true },
    y: [{ id: 't', label: 'θSA', unit: '°C/W', log: true }],
    series: [{ label: 'θSA', x: ls.filter((_, i) => ok[i]), y: th.filter((_, i) => ok[i]), axis: 't', width: 2.2 }],
    hlines: req > 0 ? [{ value: req, label: `required ${cw(req)}`, axis: 't', color: '#8b1e1e', dash: [4, 4] }] : [],
    vlines: [{ value: s.len, label: `L ${mm(s.len)}`, color: '#1f4e5f' }],
    markers: [{ x: s.len, y: theta, axis: 't', label: cw(theta) }],
  };

  // 2 — θ_SA vs fin count at this length
  const nMax = Math.min(maxFins(s.w, s.t, s.nMode === 'opt' ? s.sMin : 0.2e-3), 200);
  const ns: number[] = [];
  const tn: number[] = [];
  for (let n = 2; n <= nMax; n++) {
    const x = sinkTheta(sinkOf(s, s.len, n), fl, s.ta, dT);
    if (x) ns.push(n), tn.push(x.theta);
  }
  const g2: GraphSpec = {
    id: 'vs-fins',
    title: 'θSA vs fin count',
    subtitle: `L = ${mm(s.len)}, W = ${mm(s.w)}, t = ${mm(s.t)}`,
    x: { label: 'Number of fins N', unit: '', integer: true },
    y: [{ id: 't', label: 'θSA', unit: '°C/W' }],
    series: [{ label: 'θSA', x: ns, y: tn, axis: 't', width: 2.2 }],
    hlines: req > 0 ? [{ value: req, label: 'required', axis: 't', color: '#8b1e1e', dash: [4, 4] }] : [],
    vlines: [{ value: s.n, label: `N = ${s.n}`, color: '#1f4e5f' }],
    markers: [{ x: s.n, y: theta, axis: 't', label: cw(theta) }],
  };

  // 3 — Lee's volumetric classes: volume vs θ_SA
  const ts = Array.from({ length: 41 }, (_, i) => 0.05 * 400 ** (i / 40));
  const colors = ['#1f4e5f', '#c47b17', '#4f8a8b', '#6b5b95'];
  const series: NonNullable<GraphSpec['series']> = [];
  VOLUMETRIC.forEach((c, j) => {
    series.push({ label: `${c.label} (${(c.lo / 1e-6).toFixed(0)})`, x: ts, y: ts.map((t) => c.lo / t / 1e-6), axis: 'v', color: colors[j], width: 1.4 });
    series.push({ label: `${c.label} (${(c.hi / 1e-6).toFixed(0)})`, x: ts, y: ts.map((t) => c.hi / t / 1e-6), axis: 'v', color: colors[j], width: 1.4, dash: [5, 3] });
  });
  const g3: GraphSpec = {
    id: 'classes',
    title: 'Volume by cooling class',
    subtitle: 'Lee (1995) volumetric resistance; solid = optimistic, dashed = pessimistic end',
    x: { label: 'θSA', unit: '°C/W', log: true },
    y: [{ id: 'v', label: 'Heatsink volume', unit: 'cm³', log: true }],
    series,
    hlines: s.maxVol != null ? [{ value: s.maxVol / 1e-6, label: `space ${cm3(s.maxVol)}`, axis: 'v', color: '#8b1e1e', dash: [4, 4] }] : [],
    vlines: req > 0 ? [{ value: req, label: `required ${cw(req)}`, color: '#8b1e1e', dash: [4, 4] }] : [],
    markers: [{ x: theta, y: r.volume / 1e-6, axis: 'v', label: 'this design' }],
    legend: 'below',
  };
  return [g1, g2, g3];
}

/** Settable non-field keys (window.eeCalc / URL inputs): validate against the allowed values. */
const oneOf = <T extends string>(name: string, ok: readonly T[]) => (raw: unknown): T => {
  const v = String(raw) as T;
  if (!ok.includes(v)) throw new Error(`${name} must be one of ${ok.map((o) => JSON.stringify(o)).join(', ')}`);
  return v;
};

export const def: CalcDef<HeatsinkSelState> = {
  id: ID,
  version: '0.1.0',
  method:
    'Required θ_SA from the stack; cooling class and volume from Lee’s volumetric resistance table (Electronics Cooling 1995); plate-fin θ_SA from the Bar-Cohen–Rohsenow parallel-plate natural-convection correlation (Incropera §9.7) or the Teertstra–Yovanovich–Culham forced-convection model (Simons, Electronics Cooling 2003) with fin efficiency, ε-NTU air heating, envelope radiation and base conduction; air properties from Incropera Table A.4; Brent for length and power.',
  fields,
  defaults,
  sync: (s) => {
    if (s.material !== 'custom' && MATERIALS[s.material] && Math.abs(MATERIALS[s.material].k - s.kf) > 1e-9) s.material = 'custom';
  },
  // Harness round-trip flags here are expected: the L solve stops at its 5 mm floor when even that beats θ_SA,req
  // (forced air), so the state is not at the target; and the optimised fin count is discrete and depends on
  // the temperature rise, so the P solve may pick a neighbouring N.
  solve: {
    default: 'len',
    analysis: 'tj',
    options: [
      { key: 'len', label: 'Fin length for the required θ_SA' },
      { key: 'p', label: 'Maximum power for a heatsink' },
      { key: 'tj', label: 'Junction temperature with a heatsink' },
    ],
  },
  compute,
  controls: { nMode: oneOf('nMode', ['opt', 'manual'] as const) },
  examples: [
    { id: 'to247-natural', label: 'TO-247 at 20 W, natural convection, 100 mm wide (solve L)', state: defaults() },
    { id: 'forced-2m5', label: '50 W, 50 mm wide, 2.5 m/s ducted air (solve L)', state: { ...defaults(), p: 50, thetaJC: 0.5, thetaCS: 0.2, mode: 'forced', v: 2.5, w: 0.05, h: 0.025, t: 1e-3 } },
    { id: 'sfu-example', label: 'Bahrami/Çengel 120 × 180 mm sink (36.2 W at 55 K there; 49 K here: base area, composite Nu)', state: { ...defaults(), solveFor: 'tj', src: null, p: 36.2, ta: 25, tjMax: 125, thetaJC: 0, thetaCS: 0, w: 0.12, len: 0.18, h: 0.024, t: 1e-3, tb: 2e-3, nMode: 'manual', n: 15, eps: 0, material: 'cu', kf: 401 } },
    { id: 'max-power', label: 'How much can a 50 × 75 × 25 mm natural-convection sink take? (solve P)', state: { ...defaults(), solveFor: 'p', w: 0.05, len: 0.075, h: 0.025, t: 1.2e-3, tb: 3e-3 } },
    { id: 'tight-space', label: '100 W module in 300 cm³: only fast forced air fits (class table)', state: { ...defaults(), p: 100, thetaJC: 0.2, thetaCS: 0.05, maxVol: 300e-6, src: 1000e-6, tb: 8e-3, mode: 'forced', v: 5, w: 0.06, h: 0.025, t: 1e-3 } },
    { id: 'too-hot', label: 'Edge case: small sink at 15 W runs too hot (analysis)', state: { ...defaults(), solveFor: 'tj', p: 15, w: 0.04, len: 0.04, h: 0.015, t: 1.2e-3, tb: 3e-3 } },
  ],
};
