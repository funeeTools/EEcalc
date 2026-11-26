import { describe, expect, it } from 'vitest';
import { type BwState, def } from '@/calculators/opamp-bandwidth/def';
import { cascadeBw, overshoot, slewRise, phaseMargin, riseTime, riseTime1, riseTimeErlang, secondPole, stage, stepChain } from '@/calculators/opamp-bandwidth/model';
import { runCompute } from '@/core/calc/page';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const run = (p: Partial<BwState>) => def.compute({ ...def.defaults(), ...p });
const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const det = (r: CalcReport) => r.details as any;

// ── fuzz helpers: random states over every field's min/max and select option, through runCompute ──
type Scope = Record<string, any>;
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function randomize(fields: FieldSpec[], scope: Scope, rnd: () => number): void {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') randomize(f.fields, scope, rnd);
    else if (f.kind === 'number') {
      if (f.optional && rnd() < 0.25) {
        scope[f.key] = null;
        continue;
      }
      const lo = f.min ?? -1e3;
      const hi = f.max ?? 1e3;
      let v = lo > 0 && hi / lo > 100 ? lo * (hi / lo) ** rnd() : lo + (hi - lo) * rnd();
      if (f.integer) v = Math.round(v);
      scope[f.key] = v;
    } else if (f.kind === 'select') {
      const o = f.options[Math.floor(rnd() * f.options.length)];
      scope[f.key] = typeof o === 'string' ? o : o.value;
    } else if (f.kind === 'toggle') scope[f.key] = rnd() < 0.5;
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;
function checkReport(r: CalcReport, tag: string): void {
  if (!r.ok) {
    expect(typeof r.error, tag).toBe('string');
    expect(BAD.test(r.error!), `${tag} error text: ${r.error}`).toBe(false);
    return;
  }
  for (const x of r.results) {
    if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${tag} ${x.key}=${x.value}`).toBe(true);
    expect(BAD.test(x.display), `${tag} ${x.key} display "${x.display}"`).toBe(false);
    if (x.note) expect(BAD.test(x.note), `${tag} ${x.key} note "${x.note}"`).toBe(false);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(BAD.test(v), `${tag} table "${v}"`).toBe(false);
  for (const s of [r.summary ?? '', ...r.warnings, ...r.notes]) expect(BAD.test(s), `${tag} text "${s}"`).toBe(false);
  for (const g of r.graphs)
    for (const s of g.series ?? []) {
      expect(s.x.length, `${tag} ${g.id}`).toBe(s.y.length);
      expect(s.x.every(Number.isFinite) && s.y.every(Number.isFinite), `${tag} ${g.id}/${s.label}`).toBe(true);
    }
}
/** n random states (solve options in turn) through runCompute; returns ok/fail counts. Solved states must recompute stably. */
function fuzz(d: CalcDef<any>, n: number, seed: number, fix?: (s: Scope) => void): { ok: number; fail: number } {
  const rnd = rng(seed);
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < n; i++) {
    const st: Scope = d.defaults();
    randomize(d.fields, st, rnd);
    st.solveFor = d.solve!.options[i % d.solve!.options.length].key;
    fix?.(st);
    let r!: CalcReport;
    expect(() => (r = runCompute(d, st)), `case ${i}`).not.toThrow();
    checkReport(r, `case ${i} (${st.solveFor})`);
    if (!r.ok) {
      fail++;
      continue;
    }
    ok++;
    const st2 = structuredClone(st);
    const r2 = runCompute(d, st2);
    expect(r2.ok, `case ${i} recompute: ${r2.error}`).toBe(true);
    for (const x of r.results) {
      const y = r2.results.find((z) => z.key === x.key);
      if (typeof x.value === 'number' && typeof y?.value === 'number') expect(Math.abs(y.value - x.value), `case ${i} stability ${x.key}`).toBeLessThanOrEqual(1e-6 * Math.max(Math.abs(x.value), 1e-12) + 1e-15);
    }
  }
  return { ok, fail };
}

describe('op-amp bandwidth: textbook relations', () => {
  it('single pole: f₋₃dB = (GBW/A_OL)(1 + A_OL/NG) ≈ GBW/NG; inverting NG = |G| + 1', () => {
    const a = run({ opamp: 'Custom', pm: null, gbw: 1e6, a0: 200, gain: 10 });
    expect(res(a, 'bw')).toBeCloseTo(1e5, 3);
    const b = run({ opamp: 'Custom', pm: null, gbw: 1e6, a0: 200, gain: 10, config: 'inv' });
    expect(res(b, 'bw')).toBeCloseTo(1e6 / 11, 3);
    expect(res(run({ opamp: 'Custom', pm: null, gbw: 1e6, a0: 200, gain: 1, config: 'inv' }), 'bw') / res(run({ opamp: 'Custom', pm: null, gbw: 1e6, a0: 200, gain: 1 }), 'bw')).toBeCloseTo(0.5, 9);
  });
  it('cascade shrinkage √(2^{1/n} − 1): 0.6436 for two, 0.5098 for three stages', () => {
    const s = stage({ gbw: 1e6, a0: 1e10, f2: Infinity }, 10, 10);
    expect(cascadeBw(s, 2) / cascadeBw(s, 1)).toBeCloseTo(Math.sqrt(2 ** 0.5 - 1), 12);
    expect(cascadeBw(s, 3) / cascadeBw(s, 1)).toBeCloseTo(0.5098, 4);
  });
  it('rise time 0.35/f for one pole (exact ln9/2π), Erlang for n poles, exact-step chain agrees', () => {
    const s = stage({ gbw: 1e6, a0: 1e10, f2: Infinity }, 10, 10);
    expect(riseTime1(s) * cascadeBw(s, 1)).toBeCloseTo(Math.log(9) / (2 * Math.PI), 9);
    const rk = stepChain(s, 3, 20 / (2 * Math.PI * s.fc), 6000);
    expect(riseTime(rk.t, rk.y) / riseTimeErlang(s.fc, 3)).toBeCloseTo(1, 4);
  });
  it('full-power bandwidth SR/(2πV_pk): LM358 0.3 V/µs at 10 V pk → 4.775 kHz', () => {
    const r = run({ opamp: 'LM358', gbw: 0.7e6, a0: 100, sr: 0.3e6, pm: null, vpk: 10 });
    expect(res(r, 'fp')).toBeCloseTo(0.3e6 / (2 * Math.PI * 10), 9);
    expect(r.warnings.some((w) => w.includes('Slew-rate limit'))).toBe(true);
  });
  it('slewing step: slew at SR, then exponential settling; never faster than the small-signal t_r', () => {
    const r = run({});
    expect(res(r, 'trLarge')).toBeGreaterThan(res(r, 'tr1'));
    // two-pole TLV9002 default: τ = t_r/ln9 for the tail
    expect(res(r, 'trLarge')).toBeCloseTo(slewRise(4, 2e6, res(r, 'tr1') / Math.log(9)), 15);
    // no slewing (0.2 V step): exactly the small-signal t_r
    const lin = run({ vpk: 0.1 });
    expect(res(lin, 'trLarge')).toBe(res(lin, 'tr1'));
    // single-pole stage: τ = 1/(2π·f₋₃dB); 4 V step at 2 V/µs → 3.510 µs (vs 0.8·ΔV/SR = 1.6 µs)
    const s1 = run({ pm: null });
    const tau = 1 / (2 * Math.PI * res(s1, 'bw'));
    expect(res(s1, 'trLarge')).toBeCloseTo(slewRise(4, 2e6, tau), 15);
    expect(res(s1, 'trLarge')).toBeCloseTo(3.51e-6, 8);
    expect(slewRise(0.1, 1e6, 1e-6)).toBeCloseTo(Math.log(9) * 1e-6, 15);
    // closed form for ΔV = 4 V, SR = 1 V/µs, τ = 1 µs: slews 0…3 V, then e = e^(−t/τ)
    expect(slewRise(4, 1e6, 1e-6)).toBeCloseTo(3e-6 + 1e-6 * Math.log(1 / 0.4) - 0.4e-6, 15);
  });
  it('two-pole phase margin: 45° ↔ second pole at the crossover; overshoot ≈ 23 % at 45°, ≈ 9 % at 60°', () => {
    const a0 = 1e9;
    const f2 = secondPole(1e6, a0, 45);
    expect(phaseMargin({ gbw: 1e6, a0, f2 }, 1)).toBeCloseTo(45, 9);
    expect(overshoot(stage({ gbw: 1e6, a0, f2 }, 1, 1))).toBeCloseTo(0.233, 2);
    expect(overshoot(stage({ gbw: 1e6, a0, f2: secondPole(1e6, a0, 60) }, 1, 1))).toBeCloseTo(0.0877, 2);
    // more noise gain, more margin
    expect(phaseMargin({ gbw: 1e6, a0, f2 }, 0.1)).toBeGreaterThan(80);
  });
});

describe('op-amp bandwidth: independent Python reference (complex A(jf) closed loop, bisection)', () => {
  it('TLV9002 (1 MHz, 117 dB, φm 78°) at +10: 102 221.650 Hz, φm 88.756°', () => {
    const r = run({});
    expect(res(r, 'bw')).toBeCloseTo(102221.65021035429, 2);
    expect(res(r, 'pmHere')).toBeCloseTo(88.75622272396178, 6);
  });
  it('TL072H three ×10 stages (single pole): 267 660.554 Hz', () => {
    const r = run(def.examples!.find((e) => e.id === 'tl072-3stage')!.state);
    expect(res(r, 'bw')).toBeCloseTo(267660.5540591027, 2);
  });
  it('follower with φm = 40°, GBW 10 MHz, 100 dB: 10.304163 MHz', () => {
    const r = run(def.examples!.find((e) => e.id === 'low-pm')!.state);
    expect(res(r, 'bw')).toBeCloseTo(10304162.825070301, -1);
    expect(r.warnings.some((w) => w.includes('Phase margin is only'))).toBe(true);
  });
  it('rise times of second-order stages agree with a Python RK4 step of the transfer function', () => {
    for (const [gbw, a0dB, pm, ng, tr] of [[1e6, 117, 78, 1, 2.7620063076289876e-7], [10e6, 100, 45, 1, 2.8318484184978196e-8], [10e6, 100, 40, 2, 5.1355983249996214e-8], [38e6, 122, 60, 1, 6.444166825344693e-9]]) {
      const a0 = 10 ** (a0dB / 20);
      expect(riseTime1(stage({ gbw, a0, f2: secondPole(gbw, a0, pm) }, ng, ng)) / tr).toBeCloseTo(1, 6);
    }
  });
});

describe('op-amp bandwidth: solve round trips', () => {
  const bases: Partial<BwState>[] = [def.defaults(), { ...def.defaults(), pm: null, stages: 3 }, { ...def.defaults(), config: 'inv', gain: 0.5, pm: 55, stages: 2 }];
  for (const b of bases)
    it(`${b.config}/${b.pm}/${b.stages}: bw → GBW, gain, SR → same parts`, () => {
      const a = run(b);
      for (const k of ['gbw', 'gain'] as const) {
        const r = run({ ...b, solveFor: k, [k]: 5, bw: det(a).bwChain });
        expect(r.ok, r.error).toBe(true);
        expect(det(r).state[k] / (b as any)[k]).toBeCloseTo(1, 8);
      }
      const r = run({ ...b, solveFor: 'sr', fp: det(a).fpbw, sr: 1 });
      expect(res(r, 'sr') / (b as any).sr).toBeCloseTo(1, 12);
    });
  it('impossible targets explain the limit', () => {
    expect(run({ solveFor: 'gain', bw: 50e6 }).error).toMatch(/out of reach/);
    expect(run({ solveFor: 'gbw', bw: 1e12, gain: 1e6 }).ok).toBe(false);
  });
  it('the preset switch turns a GBW design back into analysis (targets do not carry over)', () => {
    const st = { ...def.defaults(), solveFor: 'gbw' } as BwState;
    const f = def.fields.flatMap((x) => (x.kind === 'section' ? x.fields : [x])).find((x) => x.kind === 'select' && x.key === 'opamp') as any;
    f.apply('OPA350', st, st);
    expect(st.solveFor).toBe('bw');
    expect(st.gbw).toBe(38e6);
  });
});

describe('op-amp bandwidth: examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = runCompute(def as CalcDef<any>, { ...def.defaults(), ...structuredClone(e.state) });
      expect(r.ok, `${e.id}: ${r.error}`).toBe(true);
      checkReport(r, e.id);
    }
  });
  it('warnings at the limits: low loop gain, slewing', () => {
    expect(run({ opamp: 'Custom', a0: 40, gain: 50, pm: null }).warnings.some((w) => w.includes('loop gain'))).toBe(true);
  });
  it('fuzz: 400 random states never throw, stay finite and recompute stably', () => {
    const { ok } = fuzz(def as CalcDef<any>, 400, 31);
    expect(ok).toBeGreaterThan(150);
  });
  it('fuzz: analysis of valid parts is never refused', () => {
    const { fail } = fuzz(def as CalcDef<any>, 300, 32, (s) => {
      s.solveFor = 'bw';
      if (s.config === 'noninv' && s.gain < 1) s.gain = 1 + s.gain;
    });
    expect(fail).toBe(0);
  });
  it('compute stays fast (two-pole, 10 stages) < 50 ms', () => {
    const t0 = performance.now();
    run({ stages: 10, pm: 50 });
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
