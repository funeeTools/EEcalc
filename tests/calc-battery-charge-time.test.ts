import { describe, expect, it } from 'vitest';
import { def, type ChgState } from '@/calculators/battery-charge-time/def';
import { charge } from '@/calculators/battery-charge-time/model';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<ChgState>) => def.compute({ ...def.defaults(), ...p });
const H = 3600;

function clean(r: CalcReport) {
  for (const x of r.results) {
    if (typeof x.value === 'number') expect(Number.isNaN(x.value), x.key).toBe(false);
    expect(x.display, x.key).not.toMatch(/NaN|undefined|Infinity/);
  }
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y), `${g.id}/${s.label}`).toBe(true);
}

describe('battery charge time — equations', () => {
  it('NiMH at 0.1 C with η_c = 70 % from empty → 1/(0.1·0.7) = 14.29 h; η_c = 62.5 % gives the IEC 61951-2 16 h rated charge', () => {
    const r = run(def.examples!.find((e) => e.id === 'nimh-std')!.state);
    expect(res(r, 't') / H).toBeCloseTo(1 / 0.07, 9);
    expect(res(run({ ...def.examples!.find((e) => e.id === 'nimh-std')!.state, eta: 62.5 }), 't') / H).toBeCloseTo(16, 9);
  });
  it('Python ODE reference (RK4 on dSoC/dt = η(V_CV − OCV)/(R·C)): defaults 119.9289 min', () => {
    expect(res(run({}), 't') / 60).toBeCloseTo(119.92894405196168, 4);
  });
  it('closed forms: CV onset 1 − ηIτ/C, CV time τ·ln(I/I_term), residual η·I_term·τ/C', () => {
    const o = charge({ profile: 'cccv', cap: 10800, i: 3, eta: 1, tau: 1800, iTerm: 0.15, s0: 0, sT: null });
    expect(o.sTr).toBeCloseTo(1 - (3 * 1800) / 10800, 12);
    expect(o.tCV).toBeCloseTo(1800 * Math.log(3 / 0.15), 9);
    expect(1 - o.sEnd).toBeCloseTo((0.15 * 1800) / 10800, 12);
    expect(o.tCC).toBeCloseTo((0.5 * 10800) / 3, 9);
  });
  it('starting above the CV onset: no CC phase, CV from a reduced current', () => {
    const o = charge({ profile: 'cccv', cap: 10800, i: 3, eta: 1, tau: 1800, iTerm: 0.15, s0: 0.8, sT: null });
    expect(o.tCC).toBe(0);
    expect(o.iStart).toBeCloseTo((3 * 0.2) / 0.5, 12);
  });
});

describe('battery charge time — solve round trips and examples', () => {
  for (const ex of def.examples!) {
    it(`example ${ex.id}`, () => {
      const r = run(ex.state);
      expect(r.ok, r.error).toBe(true);
      clean(r);
      const s = { ...def.defaults(), ...ex.state } as ChgState;
      if (s.solveFor !== 't') {
        const back = run({ ...s, solveFor: 't', [s.solveFor]: res(r, s.solveFor) });
        expect(res(back, 't') / s.t).toBeCloseTo(1, 6);
      }
    });
  }
  it('first example equals the defaults', () => expect(def.examples![0].state).toEqual(def.defaults()));
  for (const tt of [0.5, 1, 3, 8]) {
    it(`solve current and capacity for ${tt} h, then recover the time`, () => {
      for (const k of ['iChg', 'cap'] as const) {
        const r = run({ solveFor: k, t: tt * H });
        if (!r.ok) continue;
        const back = run({ solveFor: 't', [k]: res(r, k) });
        expect(res(back, 't') / (tt * H)).toBeCloseTo(1, 6);
      }
    });
  }
  it('faster than the CV taper allows: no solution with a reason', () => {
    const r = run({ solveFor: 'iChg', t: 10 * 60 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/CV taper/);
  });
  it('review: target above SoC_end while solving capacity gives the specific message', () => {
    const r = run({ solveFor: 'cap', target: 'soc', socT: 100, t: 10 * H });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/charge stops at 98.51 %/);
  });
  it('review: a root on the bracket end (1 µA) is found', () => {
    const r = run({ ...def.examples!.find((e) => e.id === 'nimh-std')!.state, solveFor: 'iChg', cap: 0.036, t: (0.036 * 1) / (0.7 * 1e-6) });
    expect(r.ok, r.error).toBe(true);
    expect(res(r, 'iChg')).toBeCloseTo(1e-6, 15);
  });
  it('target above the termination SoC is reported', () => {
    const r = run({ target: 'soc', socT: 99.9, cTerm: 20 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/never reached/);
  });
});

describe('battery charge time — physics and warnings', () => {
  it('time falls with current and rises with capacity; CV onset moves down with C-rate', () => {
    let last = Infinity;
    let lastS = 2;
    for (const i of [0.3, 0.75, 1.5, 3]) {
      const r = run({ iChg: i });
      expect(res(r, 't')).toBeLessThan(last);
      expect(res(r, 'sTr')).toBeLessThan(lastS);
      last = res(r, 't');
      lastS = res(r, 'sTr');
    }
    expect(res(run({ cap: 4000 * 3.6 }), 't')).toBeGreaterThan(res(run({}), 't'));
  });
  it('linear charger dissipation (V_in − V_bat)·I and its warning', () => {
    const r = run({ charger: 'linear', vIn: 5, iChg: 1.5, soc0: 0 });
    expect(res(r, 'pd')).toBeCloseTo((5 - (3.0 + 1.5 * (0.995 * 1080 * 1.2) / 10800)) * 1.5, 6);
    expect(r.warnings.join()).toMatch(/dissipates/);
  });
  it('warnings: Li-ion > 1 C, VRLA > 0.3 C, NiMH fast charge, low V_in', () => {
    expect(run({ iChg: 4.5 }).warnings.join()).toMatch(/above the 0.5–1 C/);
    expect(run(def.examples!.find((e) => e.id === 'sla')!.state).warnings.length).toBe(0);
    expect(run({ ...def.examples!.find((e) => e.id === 'sla')!.state, iChg: 3 }).warnings.join()).toMatch(/VRLA/);
    expect(run({ ...def.examples!.find((e) => e.id === 'nimh-std')!.state, iChg: 2 }).warnings.join()).toMatch(/fast charge/);
    expect(run({ vIn: 3.6 }).warnings.join()).toMatch(/buck charger/);
  });
});

describe('battery charge time — fuzz', () => {
  it('300 random states: finite, stable on recompute', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lg = (a: number, b: number) => Math.pow(10, a + (b - a) * rnd());
    const chems = ['liion', 'lfp', 'nimh', 'nicd', 'lead'] as const;
    for (let n = 0; n < 300; n++) {
      const soc0 = 99.9 * rnd();
      const st: Partial<ChgState> = {
        solveFor: (['t', 'iChg', 'cap'] as const)[n % 3], chem: chems[n % 5], ns: 1 + Math.floor(rnd() * 20), cap: lg(-1.4, 9.5), vCv: 1 + 4 * rnd(), v0: 0.5 + 4.5 * rnd(),
        vFloat: 1 + 4 * rnd(), vAvg: 0.5 + 4.5 * rnd(), tau: lg(0, 6), eta: 10 + 90 * rnd(), iChg: lg(-6, 4), cTerm: 0.1 + 49.9 * rnd(), soc0,
        target: rnd() < 0.5 ? 'full' : 'soc', socT: soc0 + (100 - soc0) * rnd(), charger: rnd() < 0.5 ? 'linear' : 'switching', vIn: lg(-0.3, 3), effCh: 10 + 90 * rnd(), t: lg(0, 8),
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
      const k = r.solveFor!;
      const r2 = run({ ...st, [k]: res(r, k) });
      expect(r2.ok).toBe(true);
      expect(res(r2, k) / res(r, k)).toBeCloseTo(1, 5);
    }
  });
});
