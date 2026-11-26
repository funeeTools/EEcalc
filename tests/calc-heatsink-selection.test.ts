import { describe, expect, it } from 'vitest';
import { def, type HeatsinkSelState } from '@/calculators/heatsink-selection/def';
import { G0, finEfficiency, nuForced, nuNatural, sOptNatural, sinkTheta, spreading, type Air } from '@/calculators/heatsink-selection/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<HeatsinkSelState>) => def.compute({ ...def.defaults(), ...p });
const ex = (id: string) => ({ ...def.defaults(), ...def.examples!.find((e) => e.id === id)!.state }) as HeatsinkSelState;

const BAD = /NaN|undefined|Infinity/;

// ── generic fuzz support: random states inside every field's min/max and every select option
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
function randomState(d: CalcDef<any>, rnd: () => number, extra: Record<string, unknown[]>): any {
  const st: any = d.defaults();
  const walk = (fs: FieldSpec[]) => {
    for (const f of fs) {
      if (f.kind === 'section' || f.kind === 'group') walk(f.fields);
      else if (f.kind === 'select') {
        const o = f.options[Math.floor(rnd() * f.options.length)];
        st[f.key] = typeof o === 'string' ? o : o.value;
      } else if (f.kind === 'number') {
        if (f.optional && rnd() < 0.25) {
          st[f.key] = null;
          continue;
        }
        const lo = f.min ?? -1e3;
        const hi = f.max ?? 1e3;
        // spread magnitudes over the whole range: log-uniform for wide ranges (with 0 or negatives too)
        let v: number;
        const span = Math.max(Math.abs(lo), Math.abs(hi));
        if (lo > 0 && hi / lo > 100) v = lo * (hi / lo) ** rnd();
        else if (lo >= 0 && hi > 100 * Math.max(lo, 1e-300)) v = rnd() < 0.05 ? lo : hi * 1e-7 * 1e7 ** rnd();
        else if (lo < 0 && span > 100) v = Math.min(Math.max((rnd() < 0.5 ? -1 : 1) * span * 1e-7 * 1e7 ** rnd(), lo), hi);
        else v = lo + (hi - lo) * rnd();
        if (f.integer) v = Math.round(v);
        st[f.key] = v;
      }
    }
  };
  walk(d.fields);
  st.solveFor = d.solve!.options[Math.floor(rnd() * d.solve!.options.length)].key;
  for (const [k, opts] of Object.entries(extra)) st[k] = opts[Math.floor(rnd() * opts.length)];
  return st;
}
function checkReport(r: CalcReport) {
  const bad: string[] = [];
  for (const x of r.results) {
    if (typeof x.value === 'number' && !Number.isFinite(x.value)) bad.push(`value ${x.key}`);
    if (BAD.test(x.display)) bad.push(`display ${x.key}: ${x.display}`);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const c of Object.values(row)) if (BAD.test(c)) bad.push(`${t.id}: ${c}`);
  for (const s of [r.summary ?? '', r.error ?? '', ...r.warnings, ...r.notes]) if (BAD.test(s)) bad.push(s);
  for (const g of r.graphs) {
    for (const s of g.series ?? []) if (![...s.x, ...s.y].every(Number.isFinite)) bad.push(`${g.id}/${s.label}`);
    for (const l of [...(g.hlines ?? []), ...(g.vlines ?? [])]) if (!Number.isFinite(l.value)) bad.push(`${g.id} line ${l.label}`);
    for (const m of g.markers ?? []) if (!(Number.isFinite(m.x) && Number.isFinite(m.y))) bad.push(`${g.id} marker`);
  }
  expect(bad).toEqual([]);
}
function fuzz(d: CalcDef<any>, n: number, seed: number, extra: Record<string, unknown[]>) {
  const rnd = rng(seed);
  let ok = 0;
  for (let k = 0; k < n; k++) {
    const st = normalizeState(d, randomState(d, rnd, extra));
    const snap = JSON.stringify(st);
    let r: CalcReport;
    try {
      r = runCompute(d, st); // as the page does: compute, range guard, write-back
    } catch (e) {
      throw new Error(`compute threw for ${snap}: ${e}`);
    }
    // the calculator's own checks must catch out-of-range answers before the generic core guard does
    expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
    if (!r.ok) {
      expect(r.error, 'error message').toBeTruthy();
      continue;
    }
    ok++;
    checkReport(r);
    const outside = r.results
      .filter((x) => x.solved && typeof x.value === 'number')
      .filter((x) => {
        const f = findField(d.fields, x.key)?.field;
        if (!f || f.kind !== 'number') return false;
        const v = x.value as number;
        const tol = 1e-9 * Math.abs(v);
        return (f.min != null && v < f.min - tol) || (f.max != null && v > f.max + tol);
      })
      .map((x) => `${x.key} = ${x.value}`);
    expect(outside, snap).toEqual([]);
    // stability: computing the written-back state again gives the same answers
    const r2 = runCompute(d, structuredClone(st));
    expect(r2.ok, snap).toBe(true);
    const drift = r.results
      .filter((y) => y.primary && typeof y.value === 'number')
      .filter((x) => !(Math.abs(res(r2, x.key) - (x.value as number)) <= 1e-9 * Math.max(Math.abs(x.value as number), 1e-12)))
      .map((x) => `${x.key}: ${x.value} → ${res(r2, x.key)}`);
    expect(drift).toEqual([]);
  }
  return ok;
}
describe('heatsink selection — published example (Bahrami, SFU ENSC 388, natural convection ex. 2)', () => {
  // W = 120 mm, L = 180 mm, fins 24 mm × 1 mm, T_s = 80 °C, T∞ = 25 °C; air at 325.5 K as given in the notes
  const air: Air = { k: 0.0279, nu: 1.82e-5, pr: 0.709, alpha: 1.82e-5 / 0.709, beta: 0.003072, rho: 1.085, cp: 1007, mu: 1.82e-5 * 1.085 };
  const L = 0.18;
  const dT = 55;
  it('Ra_L = 2.067e7 and S_opt = 2.714·L/Ra_L^¼ = 7.2 mm', () => {
    const raL = (G0 * air.beta * dT * L ** 3) / (air.nu * air.alpha);
    expect(raL / 2.067e7).toBeCloseTo(1, 2);
    expect(sOptNatural(L, air, dT) * 1e3).toBeCloseTo(7.2, 1);
  });
  it('at S_opt the correlation gives Nu = 1.307, h = 5.08 W/m²K, and 15 fins carry 36.2 W', () => {
    const s = sOptNatural(L, air, dT);
    const nu = nuNatural(2.714 ** 4);
    expect(nu).toBeCloseTo(1.307, 3);
    const h = (nu * air.k) / s;
    expect(h).toBeCloseTo(5.08, 1);
    expect(h * 2 * 15 * L * 0.024 * dT).toBeCloseTo(36.2, 0);
  });
  it('the full calculator on that heatsink (Incropera air, fin efficiency, base) matches Python (hs.py)', () => {
    const r = def.compute(ex('sfu-example'));
    expect(res(r, 'n')).toBe(15);
    expect(res(r, 'hc')).toBeCloseTo(4.995285406858733, 10);
    expect(res(r, 'tj')).toBeCloseTo(74.02053994742005, 9);
    expect(Math.abs(res(r, 'hc') / 5.08 - 1)).toBeLessThan(0.03); // vs the notes’ 5.08 at 80 °C with other air data
  });
});

describe('heatsink selection — Python reference and Lee (1995) cross-check', () => {
  it('defaults (TO-247, 300 mm² source): L = 99.6 mm, 12 fins, h = 5.71 W/m²K (Python)', () => {
    const r = run({});
    expect(res(r, 'len')).toBeCloseTo(0.09957036299681232, 10);
    expect(res(r, 'n')).toBe(12);
    expect(res(r, 'hc')).toBeCloseTo(5.706625959089865, 9);
    expect(res(r, 'theta')).toBeCloseTo(2, 9);
  });
  it('forced 2.5 m/s example and maximum-power example match Python', () => {
    const a = def.compute(ex('forced-2m5'));
    expect(res(a, 'len')).toBeCloseTo(0.03339794979234935, 9);
    expect(res(a, 'n')).toBe(20);
    expect(res(a, 'hc')).toBeCloseTo(56.02555680976954, 7);
    const b = def.compute(ex('max-power'));
    expect(res(b, 'p')).toBeCloseTo(12.271538452494124, 9);
  });
  it('the natural-convection plate-fin design (heat spread over the base) lands inside Lee’s 500–800 cm³·°C/W band', () => {
    for (const p of [{}, { p: 25 }, { p: 15, w: 0.06 }]) {
      const r = run({ ...p, src: null });
      const rv = res(r, 'theta') * res(r, 'volume');
      expect(rv).toBeGreaterThan(400e-6);
      expect(rv).toBeLessThan(800e-6);
    }
  });
  it('class table volumes are Lee’s R_v / θ_SA,req', () => {
    const r = run({});
    const t = r.tables.find((x) => x.id === 'classes')!;
    expect(t.rows[0].vLo).toBeCloseTo(500e-6 / 2, 15);
    expect(t.rows[3].vHi).toBeCloseTo(80e-6 / 2, 15);
  });
});

describe('heatsink selection — correlation limits', () => {
  it('Bar-Cohen–Rohsenow: Nu → El/24 for narrow gaps and 0.59·El^¼ for wide ones', () => {
    expect(nuNatural(1e-4) / (1e-4 / 24)).toBeCloseTo(1, 3);
    expect(nuNatural(1e8) / (2.87 ** -0.5 * 1e8 ** 0.25)).toBeCloseTo(1, 2);
  });
  it('Teertstra: Nu → Re*·Pr/2 (fully developed) and the developing-flow branch at large Re*', () => {
    expect(nuForced(1e-3, 0.7) / (1e-3 * 0.7 / 2)).toBeCloseTo(1, 4);
    const re = 1e5;
    expect(nuForced(re, 0.7) / (0.664 * Math.sqrt(re) * 0.7 ** (1 / 3) * Math.sqrt(1 + 3.65 / Math.sqrt(re)))).toBeCloseTo(1, 4);
  });
  it('fin efficiency → 1 for very conductive fins and tanh(mL)/mL otherwise', () => {
    expect(finEfficiency(10, 1e9, 1e-3, 0.03)).toBeCloseTo(1, 6);
    const m = Math.sqrt((2 * 10) / (200 * 1e-3));
    expect(finEfficiency(10, 200, 1e-3, 0.03)).toBeCloseTo(Math.tanh(m * 0.0305) / (m * 0.0305), 14);
  });
});

describe('heatsink selection — solve round trips', () => {
  const pts: Partial<HeatsinkSelState>[] = [
    {},
    { mode: 'forced', v: 3, p: 60, thetaJC: 0.3, thetaCS: 0.2, w: 0.06 },
    { nMode: 'manual', n: 9, p: 8 },
    { mode: 'forced', v: 1, nMode: 'manual', n: 14, p: 25, eps: 0 },
  ];
  for (const p of pts) {
    it(`L → T_J and P → T_J recover the target (${JSON.stringify(p)})`, () => {
      const a = run({ ...p, solveFor: 'len' });
      expect(a.ok).toBe(true);
      const len = res(a, 'len');
      const b = run({ ...p, solveFor: 'tj', len, tjMax: 110 });
      expect(res(b, 'tj')).toBeCloseTo(110, 6);
      const c = run({ ...p, solveFor: 'p', len });
      expect(res(c, 'p') / (p.p ?? 20)).toBeCloseTo(1, 6);
    });
  }
});

describe('heatsink selection — physics', () => {
  const base = { w: 0.1, l: 0.1, h: 0.03, t: 1.5e-3, tb: 5e-3, n: 12, kf: 209, eps: 0.85 };
  it('θ_SA falls with length, with air speed and with temperature rise (natural)', () => {
    const nat = { mode: 'natural' as const, v: 0 };
    expect(sinkTheta({ ...base, l: 0.2 }, nat, 25, 50)!.theta).toBeLessThan(sinkTheta(base, nat, 25, 50)!.theta);
    expect(sinkTheta(base, nat, 25, 60)!.theta).toBeLessThan(sinkTheta(base, nat, 25, 30)!.theta);
    const f1 = sinkTheta(base, { mode: 'forced', v: 1 }, 25, 30)!.theta;
    const f2 = sinkTheta(base, { mode: 'forced', v: 4 }, 25, 30)!.theta;
    expect(f2).toBeLessThan(f1);
    expect(f1).toBeLessThan(sinkTheta(base, nat, 25, 30)!.theta);
  });
  it('S_opt scales as L^¼; radiation off raises θ_SA', () => {
    const air = sinkTheta(base, { mode: 'natural', v: 0 }, 25, 50)!.air;
    expect(sOptNatural(0.16, air, 50) / sOptNatural(0.01, air, 50)).toBeCloseTo(2, 12);
    expect(sinkTheta({ ...base, eps: 0 }, { mode: 'natural', v: 0 }, 25, 50)!.theta).toBeGreaterThan(sinkTheta(base, { mode: 'natural', v: 0 }, 25, 50)!.theta);
  });
  it('the natural-convection fin count has an interior optimum near S_opt', () => {
    const r = run({});
    const g = r.graphs.find((x) => x.id === 'vs-fins')!;
    const y = g.series![0].y;
    const iMin = y.indexOf(Math.min(...y));
    expect(iMin).toBeGreaterThan(0);
    expect(iMin).toBeLessThan(y.length - 1);
    expect(res(r, 'gap') / ((r.details as any).sOpt as number)).toBeGreaterThan(0.8);
    expect(res(r, 'gap') / ((r.details as any).sOpt as number)).toBeLessThan(1.4);
  });
});

describe('heatsink selection — review fixes', () => {
  it('Lee (Electronics Cooling 1998) worked example: 25 × 25 mm source on 100 × 100 × 1.3 mm Al, R₀ = 1 °C/W → R_c = 0.66 °C/W', () => {
    expect(spreading(625e-6, 0.01, 0.0013, 200, 1)).toBeCloseTo(0.66, 2);
    expect(spreading(625e-6, 0.01, 0.0013, 200, 1)).toBeCloseTo(0.657229502495517, 12); // Python
    expect(spreading(0.01, 0.01, 0.0013, 200, 1)).toBeCloseTo(0.0013 / (200 * 0.01), 15); // source covers the base: 1-D only
  });
  it('forced air: θ_conv = 1/(η_o·h·A) (Simons eq. 14), no extra air-heating term', () => {
    const r = def.compute(ex('forced-2m5'));
    const d = r.details as any;
    expect(d.thetaConv).toBeCloseTo(1 / (d.etaO * d.hc * d.area), 12);
    expect(res(r, 'dTair')).toBeGreaterThan(0);
  });
  it('ducted forced-air designs fall below Lee’s bypass-inclusive band, and the page says why', () => {
    const r = def.compute(ex('forced-2m5'));
    expect((res(r, 'theta') * res(r, 'volume')) / 1e-6).toBeLessThan(80);
    expect(r.notes.some((n) => n.includes('bypass'))).toBe(true);
  });
  it('solved P and T_J outside their inputs’ ranges give a specific error, not the generic guard', () => {
    const p = run({ solveFor: 'p', thetaJC: 1e5 });
    expect(p.ok).toBe(false);
    expect(p.error).toMatch(/temperature budget|this input accepts/);
    expect(p.error).not.toMatch(/The solved/);
    const big = run({ solveFor: 'p', thetaJC: 0, thetaCS: 0, w: 0.4, len: 0.5, h: 0.08, mode: 'forced', v: 10, tj: 1e4, tjMax: 400, src: null });
    if (!big.ok) expect(big.error).not.toMatch(/The solved/);
    const tj = run({ solveFor: 'tj', p: 1e5, thetaJC: 1000 });
    expect(tj.ok).toBe(false);
    expect(tj.error).toMatch(/10 000 °C/);
  });
  it('a base that beats the requirement at 5 mm says so', () => {
    const r = run({ p: 1 });
    expect(res(r, 'len')).toBeCloseTo(5e-3, 12);
    expect(r.notes.some((n) => n.includes('shortest length'))).toBe(true);
  });
  it('when the package alone exceeds the budget the analysis says so without a negative θ', () => {
    const r = run({ solveFor: 'tj', p: 100, thetaJC: 1, thetaCS: 0.5 });
    expect(r.status?.text).toBe('TOO HOT');
    expect(r.warnings.some((w) => w.includes('no heatsink can fix it'))).toBe(true);
    expect(r.warnings.join(' ')).not.toMatch(/−[\d.]+ °C\/W/);
  });
  it('a small source adds spreading resistance; none when it is blank', () => {
    const a = run({ solveFor: 'tj', src: 300e-6 });
    const b = run({ solveFor: 'tj', src: null });
    expect(res(a, 'tj')).toBeGreaterThan(res(b, 'tj'));
    expect(res(b, 'thetaBase')).toBeCloseTo(5e-3 / (209 * 0.1 * 0.1), 12);
  });
});

describe('heatsink selection — second review', () => {
  const repro = { mode: 'forced' as const, v: 5, w: 0.06, h: 0.03, t: 1.5e-3, tb: 2e-3, src: 100e-6, nMode: 'manual' as const, n: 12, p: 50, thetaJC: 0, thetaCS: 0, tj: 95 };
  it('θ_SA(L) with a small source has a minimum: the length solve finds the shortest root below it', () => {
    const a = run({ ...repro, solveFor: 'tj', len: 0.1 });
    const b = run({ ...repro, solveFor: 'tj', len: 3 });
    expect(res(a, 'theta')).toBeLessThan(res(b, 'theta')); // not monotonic
    const r = run({ ...repro, solveFor: 'len' });
    expect(r.ok).toBe(true);
    expect(res(r, 'theta')).toBeCloseTo(1.1, 9);
    expect(res(r, 'len')).toBeLessThan(0.1);
    expect(r.notes.some((n) => n.includes('longer fins make it worse'))).toBe(true);
    // shortest: a slightly shorter sink does not meet the requirement
    expect(res(run({ ...repro, solveFor: 'tj', len: res(r, 'len') * 0.98 }), 'tj')).toBeGreaterThan(95);
  });
  it('wide base inside Lee’s aspect range: solve still succeeds where θ rises again with L', () => {
    const r = run({ ...repro, w: 0.3, tj: 40 + 50 * 1.28, solveFor: 'len' });
    expect(r.ok).toBe(true);
    expect(res(r, 'theta')).toBeCloseTo(1.28, 9);
  });
  it('when even the best length fails, the error gives the best θ and its length', () => {
    const r = run({ ...repro, tj: 80, solveFor: 'len' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/the best is θ_SA = [\d.]+ °C\/W at L = [\d.]+ mm/);
  });
  it('the 5 mm note quotes the same θ_SA as the headline', () => {
    const r = run({ solveFor: 'len', p: 1e-3 });
    const th = r.results.find((x) => x.key === 'theta')!.display;
    expect(r.notes.find((n) => n.includes('shortest length'))).toContain(th);
  });
  it('maximum power climbs to the best fin count (no neighbour allows more)', () => {
    const st = { ...def.defaults(), solveFor: 'p' as const, ta: 20, tj: 120, thetaJC: 0.2, thetaCS: 0.1, w: 0.2, len: 0.15, h: 0.04, t: 1e-3, src: null };
    const r = def.compute(st);
    const n = res(r, 'n');
    const p = res(r, 'p');
    for (const m of [n - 1, n + 1]) {
      const q = def.compute({ ...st, nMode: 'manual', n: m });
      expect(res(q, 'p')).toBeLessThanOrEqual(p * (1 + 1e-9));
    }
  });
});

describe('heatsink selection — warnings, errors, examples', () => {
  it('warnings at the model limits', () => {
    expect(run({ solveFor: 'tj', t: 0.2e-3, h: 0.08, kf: 20, material: 'custom' }).warnings.some((w) => w.includes('Fin efficiency'))).toBe(true);
    expect(run({ mode: 'forced', v: 20, w: 0.1, nMode: 'manual', n: 4, h: 0.08, p: 100, thetaJC: 0.1, thetaCS: 0.1 }).warnings.some((w) => w.includes('2300'))).toBe(true);
    expect(run({ nMode: 'manual', n: 40, t: 1e-3 }).warnings.some((w) => w.includes('optimum'))).toBe(true);
    expect(run({ tj: 160 }).warnings.some((w) => w.includes('rating'))).toBe(true);
    expect(run({ maxVol: 100e-6 }).warnings.some((w) => w.includes('available'))).toBe(true);
    expect(def.compute(ex('too-hot')).status?.text).toBe('TOO HOT');
  });
  it('impossible requests and bad inputs come back as errors', () => {
    expect(run({ p: 100 }).ok).toBe(false); // θ_JC + θ_CS use the whole budget
    expect(run({ p: 200, thetaJC: 0.1, thetaCS: 0.1, w: 0.02, h: 0.005 }).ok).toBe(false); // not even 3 m works
    expect(run({ nMode: 'manual', n: 80 }).ok).toBe(false); // fins do not fit
    expect(run({ tj: 30 }).ok).toBe(false);
    expect(run({ w: NaN }).ok).toBe(false);
  });
  it('class table rows are toned against the space available', () => {
    const r = run({ maxVol: 300e-6 });
    const t = r.tables.find((x) => x.id === 'classes')!;
    t.rows.forEach((row, i) => expect(t.rowTones![i]).toBe((row.vHi as number) <= 300e-6 ? 'pass' : (row.vLo as number) <= 300e-6 ? 'warn' : 'fail'));
    expect(run({}).tables.find((x) => x.id === 'classes')!.rowTones).toBeUndefined();
  });
  it('fin-count rows are toned against θ_SA,req (10 % margin band)', () => {
    const r = run({});
    const t = r.tables.find((x) => x.id === 'fins')!;
    t.rows.forEach((row, i) => {
      const th = row.theta as number;
      expect(t.rowTones![i]).toBe(th > 2 * (1 + 1e-9) ? 'fail' : th > 1.8 ? 'warn' : 'pass');
    });
  });
  it('material preset sets k and switches back to custom on edit', () => {
    const s = { ...def.defaults(), kf: 150 };
    def.sync!(s);
    expect(s.material).toBe('custom');
  });
  it('every example computes and the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      checkReport(r);
    }
  });
  it('fuzz: 300 random states in every field range and option', () => {
    const ok = fuzz(def, 300, 17, { nMode: ['opt', 'manual'] });
    expect(ok).toBeGreaterThan(40);
  });
  it('computes in well under 50 ms', () => {
    run({});
    const t0 = performance.now();
    for (let k = 0; k < 5; k++) run({ p: 18 + k });
    expect((performance.now() - t0) / 5).toBeLessThan(40);
  });
});

describe('heatsink selection — review regressions', () => {
  it('a length solved at its 5 mm floor (natural → forced air) is inside the θSA-vs-L plot', () => {
    const st: any = { ...def.defaults(), mode: 'forced' };
    const r = runCompute(def as any, st);
    expect(r.ok).toBe(true);
    expect(st.len).toBeCloseTo(5e-3, 12);
    const g = r.graphs.find((x) => x.id === 'vs-length')!;
    expect(Math.min(...g.series![0].x)).toBeLessThanOrEqual(st.len);
  });
});
