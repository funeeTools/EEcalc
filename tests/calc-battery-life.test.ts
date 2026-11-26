import { describe, expect, it } from 'vitest';
import { CHEMS, def, type LifeState } from '@/calculators/battery-life/def';
import { MONTH, life, peukertFactor } from '@/calculators/battery-life/model';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<LifeState>) => def.compute({ ...def.defaults(), ...p });
const H = 3600;
const ph = (i: number, duty: number) => ({ name: 'p', i, duty });

function clean(r: CalcReport) {
  for (const x of r.results) {
    if (typeof x.value === 'number') expect(Number.isNaN(x.value), x.key).toBe(false);
    expect(x.display, x.key).not.toMatch(/NaN|undefined|Infinity/);
  }
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y), `${g.id}/${s.label}`).toBe(true);
}

describe('battery life — equations', () => {
  it('Peukert’s law (Peukert 1897; Linden & Reddy §3): 100 Ah at 20 h, k = 1.2, 10 A → t = 20·(100/200)^1.2 = 8.7055 h', () => {
    const r = run({ chem: 'custom', cap: 100 * H, hRated: 20 * H, k: 1.2, sd: 0, dod: 100, fTemp: 100, fAge: 100, reg: 'none', loads: [ph(10, 100)] });
    expect(res(r, 'tRun') / H).toBeCloseTo(8.705505632961241, 9);
  });
  it('Python reference values (independent re-implementation)', () => {
    expect(res(run({}), 'tRun') / 86400).toBeCloseTo(474.2509211569432, 8); // default: 2 × AA, 212.8 µA
    // Feature check: 2000 mAh, 100 mA, 20 % reserve, 2 %/month → 1600 mAh / (100 mA + 54.76 µA)
    const r = run({ chem: 'custom', cap: 2000 * 3.6, dod: 80, sd: 2, k: 1, loads: [ph(0.1, 100)] });
    expect(res(r, 'tRun') / H).toBeCloseTo(1600 / (100 + (2000 * 0.02 * 3600) / MONTH), 9);
    expect(res(r, 'tRun') / H).toBeCloseTo(15.991243, 5);
  });
  it('switching regulator: I_bat = V_load·I/(η·V_bat) + I_q', () => {
    const r = run({ reg: 'switching', vLoad: 3.3, eff: 80, iq: 2e-6, ns: 2, vNom: 1.5, loads: [ph(10e-3, 100)] });
    expect(res(r, 'iBat')).toBeCloseTo((3.3 * 10e-3) / (0.8 * 3) + 2e-6, 12);
  });
  it('Peukert factor is 1 below the rated current (conservative) and < 1 above it', () => {
    expect(peukertFactor(0.1, 0.35, 1.2)).toBe(1);
    expect(peukertFactor(1.2, 0.35, 1.2)).toBeCloseTo(Math.pow(0.35 / 1.2, 0.2), 12);
  });
});

describe('battery life — solve round trips', () => {
  for (const ex of def.examples!) {
    it(`example ${ex.id} solves and round-trips`, () => {
      const r = run(ex.state);
      expect(r.ok, r.error).toBe(true);
      clean(r);
      const s = { ...def.defaults(), ...ex.state } as LifeState;
      if (s.solveFor === 'cap') expect(res(run({ ...s, solveFor: 'tRun', cap: res(r, 'cap') }), 'tRun') / s.tRun).toBeCloseTo(1, 6);
      if (s.solveFor === 'iMax') {
        const i = res(r, 'iMax');
        const p = { ...s, solveFor: 'tRun' as const, loads: [ph(i, 100)] };
        expect(res(run(p), 'tRun') / s.tRun).toBeCloseTo(1, 6);
      }
    });
  }
  it('first example equals the defaults', () => expect(def.examples![0].state).toEqual(def.defaults()));
  it('capacity beyond the self-discharge limit has no solution', () => {
    const r = run({ solveFor: 'cap', sd: 20, tRun: 2 * 31557600 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Self-discharge alone/);
  });
});

describe('battery life — physics and warnings', () => {
  it('runtime falls with current, rises with capacity', () => {
    const p = { cap: 1e4, hRated: 20 * H, k: 1.2, dod: 1, fTemp: 1, fAge: 1, sd: 0.02, reg: 'none' as const, vLoad: 3, vBat: 3, eff: 1, iq: 0 };
    let last = Infinity;
    for (const i of [1e-5, 1e-3, 0.1, 1, 10]) {
      const t = life(i, p).t;
      expect(t).toBeLessThan(last);
      last = t;
    }
    expect(life(0.1, { ...p, cap: 2e4 }).t).toBeGreaterThan(life(0.1, p).t);
  });
  it('warnings: duty > 100 %, LDO dropout, I_q dominance, pulse current, > 10 years', () => {
    expect(run({ loads: [ph(1e-3, 80), ph(1e-6, 40)] }).warnings.join()).toMatch(/more than all of the time/);
    expect(run({ reg: 'linear', vLoad: 3.3, ns: 1, vNom: 3.7, vEnd: 3.0 }).warnings.join()).toMatch(/LDO drops out/);
    expect(run({ reg: 'linear', vLoad: 1.8, iq: 50e-6, loads: [ph(10e-6, 100)] }).warnings.join()).toMatch(/I_q is/);
    expect(run({ loads: [ph(0.5, 1), ph(1e-6, 99)] }).warnings.join()).toMatch(/over 10×/);
    expect(run({ sd: 0, loads: [ph(1e-6, 100)] }).warnings.join()).toMatch(/Over 10 years/);
  });
  it('presets reuse the regulator-dropout cell voltages', () => {
    expect(CHEMS.liion.v).toEqual([3.7, 3.0]);
    expect(CHEMS.alk.v).toEqual([1.5, 0.8]);
    expect(CHEMS.lead.ns).toBe(6);
  });
});

describe('battery life — fuzz', () => {
  it('300 random states never throw a non-Error, stay finite and recompute stably', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lg = (a: number, b: number) => Math.pow(10, a + (b - a) * rnd());
    const chems = [...Object.keys(CHEMS), 'custom'];
    for (let n = 0; n < 300; n++) {
      const st: Partial<LifeState> = {
        solveFor: (['tRun', 'cap', 'iMax'] as const)[n % 3],
        chem: chems[n % chems.length], ns: 1 + Math.floor(rnd() * 12), cap: lg(-1.4, 9.5), hRated: lg(2.6, 8.5), vNom: 0.5 + 4.5 * rnd(), vEnd: 0.1 + 4.9 * rnd(),
        loads: [ph(lg(-9, 3), 100 * rnd()), ph(lg(-9, 0), 100 * rnd())], reg: (['none', 'linear', 'switching'] as const)[n % 3 === 0 ? 0 : Math.floor(rnd() * 3)],
        vLoad: lg(-0.5, 3), eff: 1 + 99 * rnd(), iq: rnd() < 0.3 ? 0 : lg(-12, 0), dod: 1 + 99 * rnd(), fTemp: 1 + 119 * rnd(), fAge: 1 + 99 * rnd(),
        sd: rnd() < 0.2 ? 0 : 50 * rnd(), k: 1 + rnd(), tRun: lg(0, 10.5), iMax: 1e-3,
      };
      let r: CalcReport;
      try {
        r = run(st);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        continue;
      }
      if (!r.ok) continue;
      clean(r);
      const s2 = { ...def.defaults(), ...st, ...Object.fromEntries(r.results.filter((x) => x.solved).map((x) => [x.key, x.value])) } as LifeState;
      const r2 = run(s2);
      expect(r2.ok).toBe(true);
      const k = r.solveFor!;
      expect(res(r2, k) / res(r, k)).toBeCloseTo(1, 6);
    }
  });
});
