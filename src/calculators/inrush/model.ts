/**
 * Inrush current / capacitor overshoot — pure calculation, no DOM.
 * Ported from electronics-calculator/electronics_calc/calculators/inrush.py.
 */

import {
  type CapacitorModel,
  type CeramicInput,
  type ElectrolyticInput,
  ceramicModel,
  electrolyticModel,
  linearClone,
  parallelCombine,
} from '@/physics/capacitors';
import { type ConductorResult, type ExtraParasitics, type TraceSegment, type WireSegment, combineConductors } from '@/physics/conductors';
import { C_LIGHT } from '@/physics/constants';
import { type RlcBranch, type RlcResult, equivalentFeed, simulateBranched } from '@/physics/rlc';
import type { Stimulus } from '@/physics/stimulus';
import { si } from '@/core/units';

export interface CapGroupInput {
  trace: TraceSegment;
  ceramics: CeramicInput[];
  electrolytics: ElectrolyticInput[];
}

export interface InrushInputs {
  stim: Stimulus;
  vFail: number;
  iLimit: number | null;
  v0: number;
  tempC: number;
  seriesTrace: TraceSegment;
  wires: WireSegment[];
  extra: ExtraParasitics;
  groups: CapGroupInput[];
  /** Run low/high-C uncertainty band sims (single group only). */
  band?: boolean;
}

export interface GroupOutput {
  index: number;
  cap: CapacitorModel;
  cond: ConductorResult;
  lBranch: number;
  rBranch: number;
  iPeak: number;
  vPeak: number;
  tIpeak: number;
  tVpeak: number;
  energyJ: number;
  vRatedMin: number;
  exceeded: boolean;
}

export interface InrushOutputs {
  waveform: string;
  cap: CapacitorModel;
  groups: GroupOutput[];
  lEq: number;
  rEq: number;
  lSeries: number;
  rSeries: number;
  feed: ConductorResult;
  result: RlcResult;
  resultLowC: RlcResult | null;
  resultHighC: RlcResult | null;
  passVoltage: boolean;
  passCurrent: boolean | null;
  vRatedMin: number;
  exceededRating: boolean;
  worstGroup: number;
  fGuess: number;
  warnings: string[];
  suggestions: string[];
}

function buildCap(ceramics: CeramicInput[], electrolytics: ElectrolyticInput[], vBias: number, f: number): CapacitorModel {
  const models = [...ceramics.map((c) => ceramicModel(c, vBias, f)), ...electrolytics.map((e) => electrolyticModel(e, f))];
  if (!models.length) throw new Error('Each capacitor group needs at least one capacitor type.');
  return parallelCombine(models);
}

function ratedMin(cap: CapacitorModel): number {
  const rated = (cap.groups.length ? cap.groups : [cap]).map((m) => m.vRated).filter((v) => v > 0);
  return rated.length ? Math.min(...rated) : 0;
}

function electricalLengthWarning(traces: TraceSegment[], wires: WireSegment[], f0: number): string | null {
  // Longest path: the shared feed (first trace + leads) plus the longest branch trace.
  const [feed, ...branches] = traces;
  const len = (feed?.lengthM ?? 0) + wires.reduce((s, w) => s + w.lengthM, 0) + Math.max(0, ...branches.map((b) => b.lengthM));
  if (f0 <= 0 || len <= 0) return null;
  // Guided wavelength with a velocity factor of 0.5 (FR-4 microstrip ≈ 0.55, PVC-insulated pairs ≈ 0.6–0.7): conservative.
  const lam = (0.5 * C_LIGHT) / f0;
  if (len > 0.1 * lam) {
    return `Wiring is electrically long at ${si(f0, 'Hz')} (longest path ~${(len * 1e3).toFixed(0)} mm vs λ/10 ≈ ${(0.1 * lam * 1e3).toFixed(0)} mm, assuming a velocity factor of 0.5). A lumped RLC model understates delay and may miss transmission-line peaks.`;
  }
  return null;
}

function suggestions(out: InrushOutputs): string[] {
  const s: string[] = [];
  const lin = out.result.linear;
  const src = out.result.wave.vSource;
  let srcPk = 0;
  for (let i = 0; i < src.length; i++) srcPk = Math.max(srcPk, Math.abs(src[i]));
  const simOvershoot = (Math.abs(out.result.vPeak) - srcPk) / Math.max(srcPk, 1e-12);
  const hotPlug = !/^(1\.2\/50|10\/700)/.test(out.waveform);
  if (lin.damping === 'underdamped' && lin.overshootFrac > 0.05 && simOvershoot > 0.05) {
    s.push('The common-mode equivalent is underdamped, so capacitor voltage can ring above the applied voltage. A small series damping resistor in the shared feed (near 2√(L/C)) cuts overshoot.');
  }
  if (hotPlug && out.result.iPeak > 20) {
    s.push('Peak current in the leads / series trace is high. Hot-plug NTC, a precharge resistor, or a controlled dV/dt ramp reduces I_peak much more than shortening a short PCB stub.');
  }
  if (out.groups.some((g) => g.cap.isVoltageDependent)) {
    s.push('Class II ceramics lose capacitance under DC bias, which raises √(L/C) and usually lowers inrush but raises ringing frequency. If you must stay linear, use C0G or a film capacitor for the bulk of C.');
  }
  if (out.groups.length > 1) {
    s.push('Separate groups do not share a capacitor node during the surge. A short-stub ceramic can ring faster and higher than a bulk capacitor on a longer branch — that is usually the worst overvoltage.');
  }
  const leadL = out.feed.parts.filter((p) => p.name.startsWith('leads')).reduce((a, p) => a + p.L, 0);
  const seriesL = out.feed.parts.filter((p) => p.name === 'series trace').reduce((a, p) => a + p.L, 0);
  if (leadL > seriesL * 3 && leadL > 50e-9) {
    s.push('Supply-lead inductance dominates the shared feed. Shorter leads, twisted pair (smaller spacing), or a local bulk capacitor at the connector will change the result more than trace width.');
  }
  if (!out.passVoltage) {
    s.push(`Predicted peak (highest on group ${out.worstGroup + 1}) exceeds the fail voltage. Options: slower rise time, damping R, lower L, voltage rating / TVS, or precharge so ΔV is smaller.`);
  }
  if (out.exceededRating) {
    s.push(`A group exceeded its capacitor rating (lowest rating in the circuit is ${si(out.vRatedMin, 'V')}). Parts may be damaged, and ceramic C(V) is no longer trustworthy above rating.`);
  }
  return s;
}

export function calculateInrush(inp: InrushInputs): InrushOutputs {
  if (!inp.groups.length) throw new Error('Add at least one capacitor group.');
  const warnings: string[] = [];
  let dummyC = 0;
  for (const g of inp.groups) {
    for (const b of g.ceramics) dummyC += b.cNominalF * Math.max(b.quantity, 1);
    for (const b of g.electrolytics) dummyC += b.cNominalF * Math.max(b.quantity, 1);
  }
  dummyC = Math.max(dummyC, 1e-12);

  const seriesSeg: TraceSegment = { ...inp.seriesTrace, label: inp.seriesTrace.label || 'series trace' };
  const wires = inp.wires.map((w) => ({ ...w, label: w.label || 'leads' }));
  const cond0 = combineConductors([seriesSeg], wires, inp.extra, 0, inp.tempC);
  const fGuess = 1 / (2 * Math.PI * Math.max(Math.sqrt(cond0.L * dummyC), 1e-16));

  const vBias = Math.abs(inp.stim.amplitudeV);
  const built = inp.groups.map((g, i) => {
    const cap = buildCap(g.ceramics, g.electrolytics, vBias, fGuess);
    const tr: TraceSegment = { ...g.trace, label: g.trace.label || `group ${i + 1} trace` };
    const cond = combineConductors([tr], [], null, fGuess, inp.tempC);
    return { cap, cond, tr };
  });

  const feed = combineConductors([seriesSeg], wires, inp.extra, fGuess, inp.tempC);
  const r0 = feed.R;
  const l0 = feed.L;
  const branches: RlcBranch[] = built.map(({ cap, cond }) => ({ r: cond.R + cap.esrOhm, l: cond.L + cap.eslH, cap }));
  const result = simulateBranched(inp.stim, r0, l0, branches, { v0: inp.v0, nonlinear: true });
  const eq = equivalentFeed(r0, l0, branches);
  const capAll = parallelCombine(built.map((b) => b.cap));

  let resultLowC: RlcResult | null = null;
  let resultHighC: RlcResult | null = null;
  if ((inp.band ?? true) && inp.groups.length === 1) {
    const cap = built[0].cap;
    const spread = Math.abs(cap.cHighF - cap.cLowF) / Math.max(cap.cEffF, 1e-18);
    if (cap.isVoltageDependent || spread > 0.05) {
      const b0 = branches[0];
      resultLowC = simulateBranched(inp.stim, r0, l0, [{ ...b0, cap: linearClone(cap, cap.cLowF) }], { v0: inp.v0, nonlinear: false });
      resultHighC = simulateBranched(inp.stim, r0, l0, [{ ...b0, cap: linearClone(cap, cap.cHighF) }], { v0: inp.v0, nonlinear: false });
    }
  }

  let f0Warn = result.linear.f0Hz;
  for (const { cap, cond } of built) {
    f0Warn = Math.max(f0Warn, 1 / (2 * Math.PI * Math.max(Math.sqrt((l0 + cond.L + cap.eslH) * Math.max(cap.cEffF, 1e-18)), 1e-16)));
  }
  const lw = electricalLengthWarning([seriesSeg, ...built.map((b) => b.tr)], wires, f0Warn);
  if (lw) warnings.push(lw);
  if (inp.vFail <= 0) warnings.push('Set a fail voltage so peak voltage can be judged against a test limit.');
  const rGen = (inp.extra.sourceOhm ?? 0) + (inp.extra.dampingOhm ?? 0);
  const is12 = inp.stim.waveform.startsWith('1.2/50');
  if (/^(1\.2\/50|10\/700)/.test(inp.stim.waveform) && rGen < (is12 ? 1.5 : 30)) {
    const zg = is12 ? '2 Ω (IEC 61000-4-5 combination wave, line-to-line; 12 Ω line-to-earth)' : '40 Ω (10/700 µs telecom generator, IEC 61000-4-5 / ITU-T K.44: 15 Ω + 25 Ω)';
    warnings.push(`Surge generators have a defined source impedance of about ${zg}. Source + damping R here is ${si(rGen, 'Ω')}, so the current is unrealistically high. (The generator is modelled as an ideal open-circuit voltage behind that resistance; a real generator's storage capacitor also sags into large µF loads.)`);
  }
  if (!result.solver.ok) warnings.push(`The simulation stopped before the end of its window (${si(result.solver.tReached, 's')} of ${si(result.solver.tEnd, 's')}). Peaks and PASS/FAIL are incomplete.`);

  const groups: GroupOutput[] = [];
  let anyExceeded = false;
  const ratings: number[] = [];
  built.forEach(({ cap, cond }, k) => {
    const pk = result.groupPeaks[k];
    const rated = ratedMin(cap);
    if (rated) ratings.push(rated);
    const exceeded = rated > 0 && Math.abs(pk.vPeak) > rated;
    anyExceeded ||= exceeded;
    if (cap.vRated && Math.abs(inp.stim.amplitudeV) > cap.vRated * 1.05) {
      warnings.push(`Applied voltage ${si(inp.stim.amplitudeV, 'V')} is above group ${k + 1} (${cap.dielectric}) rating ${si(cap.vRated, 'V')}.`);
    }
    if (exceeded) warnings.push(`Group ${k + 1} voltage reaches ${si(pk.vPeak, 'V')}, above its rating ${si(rated, 'V')}. The simulation may be inaccurate above rating.`);
    groups.push({
      index: k + 1,
      cap,
      cond,
      lBranch: branches[k].l,
      rBranch: branches[k].r,
      iPeak: pk.iPeak,
      vPeak: pk.vPeak,
      tIpeak: pk.tIpeak,
      tVpeak: pk.tVpeak,
      energyJ: pk.energyJ,
      vRatedMin: rated,
      exceeded,
    });
  });

  const out: InrushOutputs = {
    waveform: inp.stim.waveform,
    cap: capAll,
    groups,
    lEq: eq.l,
    rEq: eq.r,
    lSeries: l0,
    rSeries: r0,
    feed,
    result,
    resultLowC,
    resultHighC,
    passVoltage: inp.vFail > 0 ? groups.every((g) => Math.abs(g.vPeak) <= inp.vFail) : true,
    passCurrent: inp.iLimit != null && inp.iLimit > 0 ? result.iPeak <= inp.iLimit : null,
    vRatedMin: ratings.length ? Math.min(...ratings) : 0,
    exceededRating: anyExceeded,
    worstGroup: result.worstGroup,
    fGuess,
    warnings,
    suggestions: [],
  };
  out.suggestions = suggestions(out);
  return out;
}
