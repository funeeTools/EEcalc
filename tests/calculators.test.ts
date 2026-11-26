import { describe, expect, it } from 'vitest';
import { def as filter } from '@/calculators/filter/def';
import { prototype, synthesize } from '@/calculators/filter/model';
import { def as microstrip } from '@/calculators/microstrip/def';
import { microstripStatic } from '@/calculators/microstrip/model';
import { def as nf } from '@/calculators/nf-cascade/def';
import { def as smith } from '@/calculators/smith/def';
import { lMatches, matchInput, gammaOf } from '@/calculators/smith/model';
import { abs, cx } from '@/core/math/complex';

const res = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;

describe('microstrip', () => {
  it('Hammerstad–Jensen worked example: 50 Ω on 0.508 mm RO4350B, 35 µm', () => {
    const r = microstrip.compute({ ...microstrip.defaults(), solveFor: 'w', z0: 50, h: 0.508e-3, t: 35e-6, er: 3.66 });
    expect(res(r, 'w') * 1e3).toBeCloseTo(1.0734, 3);
    expect(res(r, 'epsEff')).toBeCloseTo(2.806, 2);
  });
  it('solve-for round trips for every unknown', () => {
    const base = { ...microstrip.defaults(), w: 0.7e-3, h: 0.3e-3, er: 4.1, t: 18e-6 };
    const z0 = microstripStatic(base.w, base.h, base.t, base.er).z0;
    for (const k of ['w', 'h', 'er'] as const) {
      const r = microstrip.compute({ ...base, solveFor: k, z0, [k]: 1 });
      expect(res(r, k) / base[k]).toBeCloseTo(1, 6);
    }
  });
  it('zero-thickness, wide strip trend: Z0 falls with width', () => {
    expect(microstripStatic(2e-3, 1e-3, 0, 4.4).z0).toBeLessThan(microstripStatic(1e-3, 1e-3, 0, 4.4).z0);
  });
});

describe('noise figure cascade', () => {
  it('textbook chain', () => {
    // LNA NF 2 dB G 20 dB, then NF 10 dB: F = 1.585 + 9/100 = 1.675 → 2.24 dB
    const r = nf.compute({ ...nf.defaults(), stages: [
      { name: 'a', type: 'amp', gain: 20, nf: 2, loss: 0, tPhys: 290, oip3: null },
      { name: 'b', type: 'amp', gain: 10, nf: 10, loss: 0, tPhys: 290, oip3: null },
    ] });
    expect(res(r, 'nfTotal')).toBeCloseTo(10 * Math.log10(10 ** 0.2 + 9 / 100), 6);
  });
  it('passive stage at 290 K has NF = loss', () => {
    const r = nf.compute({ ...nf.defaults(), stages: [{ name: 'att', type: 'passive', gain: 0, nf: 0, loss: 6, tPhys: 290, oip3: null }] });
    expect(res(r, 'nfTotal')).toBeCloseTo(6, 9);
  });
  it('stage NF solve reproduces the target', () => {
    const s = { ...nf.defaults(), solveFor: 'nfStage' as const, solveStage: 1, nfTotal: 3 };
    const r = nf.compute(s);
    const solved = res(r, 'stages.1.nf');
    const check = nf.compute({ ...s, solveFor: 'nfTotal', stages: s.stages.map((x, i) => (i === 1 ? { ...x, nf: solved } : x)) });
    expect(res(check, 'nfTotal')).toBeCloseTo(3, 9);
  });
});

describe('filter', () => {
  it('Butterworth n=3 prototype', () => {
    const g = prototype(3, 'butterworth', 0);
    expect(g.map((x) => +x.toFixed(4))).toEqual([1, 2, 1, 1]);
  });
  it('Chebyshev 0.5 dB n=4 (Pozar table 8.4)', () => {
    const g = prototype(4, 'chebyshev', 0.5);
    expect(g.map((x) => +x.toFixed(4))).toEqual([1.6703, 1.1926, 2.3661, 0.8419, 1.9841]);
  });
  it('Butterworth low-pass is −3.01 dB at fc and ideal values for 5th order 100 MHz', () => {
    const r = filter.compute({ ...filter.defaults(), solveFor: 'as', n: 5 });
    expect(res(r, 'f3db')).toBeCloseTo(100e6, -2);
    const d = synthesize({ n: 5, response: 'butterworth', rippleDb: 0, band: 'lowpass', fc: 100e6, f0: 0, bw: 0, r0: 50, first: 'shunt' });
    expect(d.arms[0].parts[0].value * 1e12).toBeCloseTo(19.67, 2);
    expect(d.arms[1].parts[0].value * 1e9).toBeCloseTo(128.8, 1);
  });
  it('even-order Chebyshev passband peaks at 0 dB loss with the correct load', () => {
    const r = filter.compute({ ...filter.defaults(), response: 'chebyshev', ripple: 1, n: 4, solveFor: 'as' });
    expect(res(r, 'passLoss')).toBeCloseTo(1, 2);
  });
  it('band-pass edges land on f1/f2', () => {
    const r = filter.compute({ ...filter.defaults(), band: 'bandpass', f0: 10e6, bw: 2e6, n: 3, solveFor: 'as', fs: 15e6 });
    const half = 1e6;
    const c = Math.sqrt(half * half + 1e14);
    expect(res(r, 'f3db') / (c - half)).toBeCloseTo(1, 4);
    expect(res(r, 'f3db2') / (c + half)).toBeCloseTo(1, 4);
  });
});

describe('smith / matching', () => {
  it('Pozar example 5.1 solutions all match', () => {
    const z = cx(200, -100);
    const ms = lMatches(z, 100);
    expect(ms.length).toBeGreaterThanOrEqual(2);
    for (const m of ms) expect(abs(gammaOf(matchInput(m, z), 100))).toBeLessThan(1e-9);
    // Pozar: B = 2.899 mS, X = 122.5 Ω (solution 1) and B = −6.899 mS, X = −122.5 Ω
    const sh = ms.filter((m) => m.topology === 'shunt-load');
    expect(sh.map((m) => +(m.b * 1e3).toFixed(3)).sort()).toEqual([-6.899, 2.899]);
  });
  it('S11 0.3∠45° → 68.35 + j31.86 Ω', () => {
    const r = smith.compute({ ...smith.defaults(), specBy: 'gamma', gMag: 0.3, gAng: 45 });
    expect(res(r, 'r')).toBeCloseTo(68.35, 1);
    expect(res(r, 'x')).toBeCloseTo(31.86, 1);
  });
  it('quarter-wave transformer matches 100 Ω through 70.71 Ω', () => {
    const r = smith.compute({ ...smith.defaults(), r: 100, x: 0, lineDeg: 90, zLine: Math.SQRT2 * 50 });
    const zin = (r.details as any).zIn;
    expect(zin.re).toBeCloseTo(50, 6);
    expect(Math.abs(zin.im)).toBeLessThan(1e-6);
  });
});
