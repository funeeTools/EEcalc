/** Inrush Current & Overshoot — calculator definition (pure; the ODE solve runs here). */

import type { CalcDef, CalcReport, GraphSeries, ResultItem } from '@/core/calc/types';
import { si } from '@/core/units';
import { cOfV } from '@/physics/capacitors';
import { type InrushOutputs, calculateInrush } from './model';
import { type InrushState, defaultState, formSpec, loadState, toInputs } from './state';

const C = { applied: '#9a8f7a', vWorst: '#1f4e5f', vOther: ['#4f8a8b', '#7aa6a1', '#2f6f7e', '#93b5b0', '#386a77'], current: '#c47b17', rating: '#c62828', fail: '#a33b2b', iFail: '#c2410c', band: 'rgba(31,78,95,0.45)' };

/** Raw model output for the page's custom tabs (not part of the JSON report). */
export const RAW = new WeakMap<CalcReport, InrushOutputs>();

/** Min/max bucket decimation over several series sharing one x array — keeps every peak. */
function pickIndices(n: number, ys: ArrayLike<number>[], buckets: number): number[] {
  if (n <= buckets * 2) return Array.from({ length: n }, (_, i) => i);
  const idx = new Set<number>([0, n - 1]);
  const size = n / buckets;
  for (let b = 0; b < buckets; b++) {
    const i0 = Math.floor(b * size);
    const i1 = Math.min(Math.floor((b + 1) * size), n);
    for (const y of ys) {
      let lo = i0;
      let hi = i0;
      for (let i = i0; i < i1; i++) {
        if (y[i] < y[lo]) lo = i;
        if (y[i] > y[hi]) hi = i;
      }
      idx.add(lo);
      idx.add(hi);
    }
  }
  return [...idx].sort((a, b) => a - b);
}

const take = (a: ArrayLike<number>, idx: number[]) => idx.map((i) => a[i]);

export function compute(state: InrushState): CalcReport {
  const out = calculateInrush(toInputs(state));
  const r = out.result;
  const lin = r.linear;
  const n = out.groups.length;
  const worstN = out.worstGroup + 1;
  const fail = !out.passVoltage || out.exceededRating || out.passCurrent === false;
  // Overshoot beyond the applied voltage, relative to the step ΔV and positive in the direction of the step.
  const dv = state.v - state.v0;
  const overshoot = Math.abs(dv) > 1e-12 ? ((r.vPeak - state.v) / dv) * 100 : 0;
  const complete = r.solver.ok;

  const res = (key: string, label: string, value: number, unit: string, display: string, extra: Partial<ResultItem> = {}): ResultItem => ({ key, label, value, unit, display, ...extra });
  const results: ResultItem[] = [
    res('iPeak', 'Peak current', r.iPeak, 'A', si(r.iPeak, 'A'), { symbol: 'I_pk', primary: true, tone: out.passCurrent === false ? 'fail' : '', note: `at t = ${si(r.tIpeak, 's')}${state.iLimit > 0 ? ` · limit ${si(state.iLimit, 'A')}` : ''}` }),
    res('vPeak', n > 1 ? `Peak capacitor voltage (group ${worstN})` : 'Peak capacitor voltage', r.vPeak, 'V', si(r.vPeak, 'V'), { symbol: 'V_pk', primary: true, tone: out.passVoltage && !out.exceededRating ? '' : 'fail', note: `at t = ${si(r.tVpeak, 's')} · limit ${si(state.vFail, 'V')}` }),
    res('overshoot', 'Overshoot', overshoot, '%', `${overshoot.toFixed(1)} %`, { symbol: 'OS', primary: true, note: '(V_pk − Vₛ)/(Vₛ − V₀), simulated' }),
    res('zeta', 'Damping ratio', lin.zeta, '', lin.zeta.toPrecision(3), { symbol: 'ζ', primary: true, tone: lin.zeta < 0.5 ? 'warn' : '', note: `${lin.damping} · Q ${lin.q.toPrecision(3)} · small-signal, C at Vs` }),
    res('f0', 'Resonant frequency', lin.f0Hz, 'Hz', si(lin.f0Hz, 'Hz'), { symbol: 'f₀', primary: true }),
    res('i2t', 'Let-through I²t', r.i2t, 'A²s', si(r.i2t, 'A²s'), { symbol: 'I²t', primary: true, note: `within the ${si(r.solver.tReached, 's')} simulated window` }),
    res('energy', 'Energy Σ ½·C·Vpk²', r.energyJ, 'J', si(r.energyJ, 'J'), { group: 'Peaks' }),
    res('vRatedMin', 'Lowest capacitor rating', out.vRatedMin, 'V', out.vRatedMin ? `${si(out.vRatedMin, 'V')}${out.exceededRating ? ' — EXCEEDED' : ''}` : '—', { group: 'Peaks', tone: out.exceededRating ? 'fail' : '' }),
    res('lEq', 'Equivalent L', out.lEq, 'H', si(out.lEq, 'H'), { group: 'Equivalent series RLC', symbol: 'L_eq' }),
    res('rEq', 'Equivalent R', out.rEq, 'Ω', si(out.rEq, 'Ω'), { group: 'Equivalent series RLC', symbol: 'R_eq' }),
    res('cEff', 'Total C at applied bias', out.cap.cEffF, 'F', si(out.cap.cEffF, 'F'), { group: 'Equivalent series RLC', symbol: 'C_eq' }),
    res('zChar', 'Characteristic impedance √(L/C)', lin.zChar, 'Ω', si(lin.zChar, 'Ω'), { group: 'Equivalent series RLC', symbol: 'Z₀' }),
    res('rCrit', 'R for critical damping', 2 * lin.zChar, 'Ω', `${si(2 * lin.zChar, 'Ω')} (add ≈ ${si(Math.max(2 * lin.zChar - out.rEq, 0), 'Ω')})`, { group: 'Equivalent series RLC', symbol: 'R_crit' }),
  ];

  // Waveform graph
  const w = r.wave;
  const ys: ArrayLike<number>[] = [w.vSource, w.vCap, w.i, ...w.vGroups];
  const idx = pickIndices(w.t.length, ys, 1500);
  const t = take(w.t, idx);
  const series: GraphSeries[] = [{ x: t, y: take(w.vSource, idx), label: 'Applied V', color: C.applied, dash: [5, 4], width: 1.2, axis: 'v' }];
  if (n > 1) {
    w.vGroups.forEach((v, k) => {
      if (k === out.worstGroup || k >= 6) return;
      series.push({ x: t, y: take(v, idx), label: `Group ${k + 1} V`, color: C.vOther[k % C.vOther.length], width: 1.1, axis: 'v' });
    });
  }
  series.push({ x: t, y: take(w.vCap, idx), label: n > 1 ? `Group ${worstN} V (worst)` : 'Capacitor V', color: C.vWorst, width: 2.2, axis: 'v' });
  for (const [band, label, dash] of [[out.resultLowC, 'V at C low', [2, 3]], [out.resultHighC, 'V at C high', [6, 3]]] as const) {
    if (!band) continue;
    const bi = pickIndices(band.wave.t.length, [band.wave.vCap], 800);
    series.push({ x: take(band.wave.t, bi), y: take(band.wave.vCap, bi), label, color: C.band, width: 1, dash: [...dash], axis: 'v', noReadout: true });
  }
  series.push({ x: t, y: take(w.i, idx), label: n > 1 ? 'Total current' : 'Current', color: C.current, width: 1.7, axis: 'i' });

  const hlines = [];
  if (out.vRatedMin > 0) hlines.push({ value: out.vRatedMin, label: `Lowest rating ${si(out.vRatedMin, 'V')}`, color: C.rating, width: 1.8, axis: 'v' });
  if (state.vFail > 0 && Math.abs(state.vFail - out.vRatedMin) > 1e-9) hlines.push({ value: state.vFail, label: `Fail ${si(state.vFail, 'V')}`, color: C.fail, dash: [2, 3], width: 1.4, axis: 'v' });
  if (state.iLimit > 0) hlines.push({ value: state.iLimit, label: `I limit ${si(state.iLimit, 'A')}`, color: C.iFail, dash: [2, 3], width: 1.4, axis: 'i' });

  const vMax = Math.max(Math.abs(state.v) * 1.5, out.vRatedMin * 1.2, Math.abs(r.vPeak) * 1.05, 1);
  const vs = Array.from({ length: 121 }, (_, i) => (vMax * i) / 120);

  const report: CalcReport = {
    calc: 'power/inrush-overshoot',
    ok: true,
    status: !complete ? { text: fail ? 'FAIL (INCOMPLETE)' : 'INCOMPLETE', tone: fail ? 'fail' : 'warn' } : { text: fail ? 'FAIL' : 'PASS', tone: fail ? 'fail' : 'pass' },
    summary: `${lin.damping} · C_eq ${si(out.cap.cEffF, 'F')} · L_eq ${si(out.lEq, 'H')} · R_eq ${si(out.rEq, 'Ω')}`,
    results,
    graphs: [
      {
        id: 'waveform',
        title: 'Inrush waveform',
        subtitle: out.exceededRating ? `Warning: voltage exceeded the ${si(out.vRatedMin, 'V')} capacitor rating — C(V) beyond rating is extrapolated` : undefined,
        x: { label: 'Time', unit: 's' },
        y: [
          { id: 'v', label: 'Voltage', unit: 'V', side: 'left' },
          { id: 'i', label: 'Current', unit: 'A', side: 'right', includeZero: true },
        ],
        series,
        hlines,
        xRange: [0, w.t[w.t.length - 1]],
        // the ringing fills the frame: keep the legend from covering the peak and the rating line
        legend: 'below',
        markers: [
          { x: r.tVpeak, y: r.vPeak, axis: 'v', color: C.vWorst, label: si(r.vPeak, 'V') },
          { x: r.tIpeak, y: signedAt(w.t, w.i, r.tIpeak, r.iPeak), axis: 'i', color: C.current, label: si(r.iPeak, 'A') },
        ],
      },
      {
        id: 'cv',
        title: 'C(V) curves',
        subtitle: 'Estimated differential capacitance vs DC bias per group (dashed: applied voltage)',
        x: { label: 'Bias', unit: 'V' },
        y: [{ id: 'c', label: 'Capacitance', unit: 'F', includeZero: true }],
        series: out.groups.map((g, k) => ({ x: vs, y: vs.map((v) => cOfV(g.cap, v)), label: `Group ${k + 1}`, color: k === 0 ? C.vWorst : C.vOther[(k - 1) % C.vOther.length], width: k === out.worstGroup ? 2.2 : 1.4, axis: 'c' })),
        vlines: [{ value: Math.abs(state.v), label: 'Applied', color: C.applied }],
      },
    ],
    tables: [
      {
        id: 'groups',
        title: 'Capacitor groups',
        columns: [
          { key: 'group', label: 'Group', align: 'left' },
          { key: 'vPeak', label: 'V peak', unit: 'V' },
          { key: 'tVpeak', label: 't(V peak)', unit: 's' },
          { key: 'iPeak', label: 'I peak', unit: 'A' },
          { key: 'cEff', label: 'C at bias', unit: 'F' },
          { key: 'esr', label: 'ESR', unit: 'Ω' },
          { key: 'esl', label: 'ESL', unit: 'H' },
          { key: 'lBranch', label: 'Branch L', unit: 'H' },
          { key: 'rBranch', label: 'Branch R', unit: 'Ω' },
          { key: 'vRated', label: 'Rating', unit: 'V' },
        ],
        // each group against the lower of its rating and the fail voltage; yellow from 90 %
        rowTones: out.groups.map((g) => {
          const lim = Math.min(g.vRatedMin > 0 ? g.vRatedMin : Infinity, state.vFail > 0 ? state.vFail : Infinity);
          const v = Math.abs(g.vPeak);
          return !Number.isFinite(lim) ? '' : v > lim ? 'fail' : v >= 0.9 * lim ? 'warn' : 'pass';
        }),
        rows: out.groups.map((g) => ({ group: `Group ${g.index}`, vPeak: g.vPeak, tVpeak: g.tVpeak, iPeak: g.iPeak, cEff: g.cap.cEffF, esr: g.cap.esrOhm, esl: g.cap.eslH, lBranch: g.lBranch, rBranch: g.rBranch, vRated: g.vRatedMin })),
        display: out.groups.map((g) => ({
          group: `Group ${g.index}${g.index === worstN && n > 1 ? ' (worst)' : ''}`,
          vPeak: si(g.vPeak, ''),
          tVpeak: si(g.tVpeak, ''),
          iPeak: si(g.iPeak, ''),
          cEff: si(g.cap.cEffF, ''),
          esr: si(g.cap.esrOhm, ''),
          esl: si(g.cap.eslH, ''),
          lBranch: si(g.lBranch, ''),
          rBranch: si(g.rBranch, ''),
          vRated: g.vRatedMin ? si(g.vRatedMin, '') : '—',
        })),
        note: 'Peak voltage against the lower of the group’s rating and the fail voltage: yellow from 90 %, red above.',
      },
    ],
    warnings: [...out.warnings],
    notes: [...(n > 7 ? [`The waveform graph shows groups 1–6 and the worst group; all ${n} groups are in the Capacitor groups table.`] : []), ...out.suggestions.map((s) => `Suggestion: ${s}`), ...r.notes, ...out.feed.notes, ...out.groups.flatMap((g) => g.cond.notes)].filter((v, i, a) => a.indexOf(v) === i),
    details: {
      linear: lin,
      feedParts: out.feed.parts,
      lSeries: out.lSeries,
      rSeries: out.rSeries,
      fGuess: out.fGuess,
      solver: r.solver,
      groups: out.groups.map((g) => ({ index: g.index, vPeak: g.vPeak, tVpeak: g.tVpeak, iPeak: g.iPeak, tIpeak: g.tIpeak, energyJ: g.energyJ, cEffF: g.cap.cEffF, cLowF: g.cap.cLowF, cHighF: g.cap.cHighF, esrOhm: g.cap.esrOhm, eslH: g.cap.eslH, traceL: g.cond.L, traceR: g.cond.R, capNotes: g.cap.notes })),
      cBand: out.resultLowC && out.resultHighC ? { vPeakLowC: out.resultLowC.vPeak, vPeakHighC: out.resultHighC.vPeak } : null,
    },
  };
  RAW.set(report, out);
  return report;
}

/** Current peak is reported as |I|; recover its sign for the plot marker. */
function signedAt(t: ArrayLike<number>, y: ArrayLike<number>, tq: number, mag: number): number {
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < tq) lo = mid + 1;
    else hi = mid;
  }
  return (y[lo] ?? 1) < 0 ? -mag : mag;
}

export const def: CalcDef<InrushState> = {
  id: 'power/inrush-overshoot',
  version: '0.1.0',
  method: 'Branched RLC network (shared feed + N capacitor groups) integrated with adaptive Dormand–Prince 5(4) / Rosenbrock 2(3); class II ceramic C(V) included; linear series-RLC formulas give ζ, f₀ and Z₀.',
  fields: formSpec,
  defaults: defaultState,
  load: loadState,
  compute,
};
