import { describe, expect, it } from 'vitest';
import { def, type ZenerState } from '@/calculators/zener-diode/def';
import { ZENER_PRESETS, opPoint, vz0 } from '@/calculators/zener-diode/model';
import { fuzz, res } from './fuzz-gen3';

const run = (p: Partial<ZenerState>) => def.compute({ ...def.defaults(), ...p });
const ex = (id: string) => ({ ...def.defaults(), ...def.examples!.find((e) => e.id === id)!.state }) as ZenerState;
const det = (r: ReturnType<typeof run>) => r.details as Record<string, number>;

describe('zener shunt regulator — published and reference values', () => {
  it('Sedra & Smith 6.8 V example: V_O = 6.83 V at 10 V no load, line reg 38.5 mV/V, load reg −19.2 mV/mA', () => {
    // V_Z = 6.8 V at 5 mA, r_z = 20 Ω, R = 0.5 kΩ: V_Z0 = 6.7 V, I_Z = 3.3/0.52 mA = 6.35 mA, V_O = 6.827 V
    const o = opPoint(10, 0, 500, vz0({ vz: 6.8, izt: 5e-3, rz: 20, tol: 0 }, 0), 20);
    expect(o.vout).toBeCloseTo(6.8269, 4);
    expect(o.iz).toBeCloseTo(6.346e-3, 6);
    const r = def.compute(ex('sedra-6v8'));
    expect(r.ok).toBe(true);
    expect(res(r, 'voutNom')).toBeCloseTo(6.8269, 4);
    expect(res(r, 'lineReg') * 1e3).toBeCloseTo(38.46, 2); // mV/V
    expect(res(r, 'rout')).toBeCloseTo(19.23, 2); // Ω = mV/mA
  });
  it('matches the independent Python nodal reference (gb3/py/zener_ref.py)', () => {
    const d = det(def.compute(def.defaults()));
    expect(d.rExact).toBeCloseTo(230.12000000000003, 10);
    expect(d.rUse).toBe(220);
    expect(d.pzMax).toBeCloseTo(0.18989282772807634, 14);
    expect(d.prMax).toBeCloseTo(0.3334870399192687, 14);
    expect(d.voutLo).toBeCloseTo(4.5605286343612335, 12);
    const b = det(def.compute(ex('bzx84-3v3')));
    expect(b.rExact).toBeCloseTo(543.34, 9);
    expect(b.rUse).toBe(510);
    expect(b.pzMax).toBeCloseTo(0.013177863601655612, 15);
    const m = det(def.compute(ex('max-load-12v')));
    expect(m.ilMax).toBeCloseTo(0.024763636363636366, 15);
    expect(m.pzMax).toBeCloseTo(0.5274715193045673, 14);
    const w = det(def.compute(ex('wide-input')));
    expect(w.rExact).toBeCloseTo(71.87272727272727, 10);
    expect(w.prMax).toBeCloseTo(8.076817612800001, 12);
  });
  it('1N47xxA and BZX84C presets carry the datasheet values', () => {
    const p = ZENER_PRESETS['1N4733A 5.1 V']!;
    expect([p.vz, p.izt, p.rz, p.izk, p.pd, p.tol]).toEqual([5.1, 49e-3, 7, 1e-3, 1.3, 0.05]);
    const b = ZENER_PRESETS['BZX84C5V1 SOT-23']!;
    expect([b.izt, b.rz, b.pd]).toEqual([5e-3, 60, 0.25]);
    expect(b.tol).toBeCloseTo(0.3 / 5.1, 4); // 4.8 … 5.4 V around 5.1 V
  });
});

describe('zener shunt regulator — solve round trips', () => {
  it('R → I_L,max returns the load it was designed for, and back', () => {
    for (const p of [{}, { vinMin: 20, vinMax: 30, ilMax: 0.1, izMin: 10e-3 }, { tol: 0, rz: 0, vinMin: 6, vinMax: 6, ilMin: 1e-3, ilMax: 1e-3 }, { ...ex('bzx84-3v3') }]) {
      const r1 = run({ ...p, solveFor: 'r' });
      expect(r1.ok).toBe(true);
      const r = res(r1, 'r');
      const r2 = run({ ...p, solveFor: 'ilMax', r });
      expect(res(r2, 'ilMax')).toBeCloseTo((p as ZenerState).ilMax ?? 20e-3, 12);
      const r3 = run({ ...p, solveFor: 'r', ilMax: res(r2, 'ilMax') });
      expect(Math.abs(res(r3, 'r') / r - 1)).toBeLessThan(1e-9);
    }
  });
  it('analysis: the worst-corner zener current of the designed R is I_Z,min; a too-large R drops out', () => {
    for (const p of [{}, ex('bzx84-3v3'), ex('wide-input')]) {
      const r = res(run({ ...p, solveFor: 'r' }), 'r');
      const a = run({ ...p, solveFor: 'izMin', r });
      expect(res(a, 'izMin') / ((p as ZenerState).izMin ?? 5e-3) - 1).toBeCloseTo(0, 10);
    }
    const d = run({ solveFor: 'izMin', r: 2000 });
    expect(d.ok).toBe(true);
    expect(res(d, 'izMin')).toBe(0);
    expect(d.warnings.some((w) => /drops out of regulation/.test(w))).toBe(true);
  });
  it('the worst-corner zener current equals I_Z,min with the exact R', () => {
    const s = { ...def.defaults(), eseries: 'E96' };
    const r = def.compute({ ...s, solveFor: 'ilMax', r: res(def.compute(s), 'r') });
    expect(det(r).izLo).toBeCloseTo(s.izMin, 12);
  });
});

describe('zener shunt regulator — physics', () => {
  it('line regulation r_z/(R + r_z) is the slope of V_out vs V_in', () => {
    const v0 = vz0({ vz: 5.1, izt: 49e-3, rz: 7, tol: 0 }, 0);
    const a = opPoint(12, 10e-3, 220, v0, 7).vout;
    const b = opPoint(12.001, 10e-3, 220, v0, 7).vout;
    expect((b - a) / 0.001).toBeCloseTo(7 / 227, 9);
  });
  it('drops out when the load takes more than the resistor supplies; r_z = 0 is an ideal clamp', () => {
    const o = opPoint(10, 30e-3, 220, 5, 7);
    expect(o.on).toBe(false);
    expect(o.vout).toBeCloseTo(10 - 220 * 30e-3, 12);
    expect(opPoint(15, 5e-3, 330, 6.2, 0).vout).toBe(6.2);
  });
  it('more load → less zener power; higher V_in,max → more', () => {
    const p = (q: Partial<ZenerState>) => res(run(q), 'pzMax');
    expect(p({ ilMin: 10e-3 })).toBeLessThan(p({ ilMin: 0 }));
    expect(p({ vinMax: 15 })).toBeGreaterThan(p({ vinMax: 13.2 }));
  });
});

describe('zener shunt regulator — warnings, errors, examples', () => {
  it('warns at the validity and rating limits', () => {
    const has = (p: Partial<ZenerState>, re: RegExp) => run(p).warnings.some((w) => re.test(w));
    expect(has(ex('wide-input'), /more than its .* rating/)).toBe(true);
    expect(has({ vinMax: 35 }, /of its 25 °C rating/)).toBe(true);
    expect(has({ izMin: 0.5e-3 }, /below the datasheet knee/)).toBe(true);
    expect(has({ izMin: 2e-3 }, /under 10 % of I_ZT/)).toBe(true);
    expect(has(ex('bzx84-3v3'), /Line regulation is poor/)).toBe(true);
    // a resistor too large for even the minimum load is a NO SOLUTION, with the largest usable R in the message
    expect(run({ solveFor: 'ilMax', r: 2000 }).error).toMatch(/use R ≤ 1\.15 kΩ/);
    expect(run({ vinMin: 5 }).error).toMatch(/not above the zener voltage/);
    expect(run({ vinMax: 10 }).error).toMatch(/Swap them/);
  });
  it('every example computes; the first equals the defaults; preset edits fall back to Custom', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) expect(def.compute({ ...def.defaults(), ...e.state } as ZenerState).ok, e.id).toBe(true);
    const s = { ...def.defaults(), rz: 8 };
    def.sync!(s);
    expect(s.part).toBe('Custom');
    const t = def.defaults();
    def.sync!(t);
    expect(t.part).toBe('1N4733A 5.1 V');
  });
  it('fuzz: 400 random states through runCompute', () => {
    expect(fuzz(def, 400, 4242)).toBeGreaterThan(10);
    // a realistic sub-range, so most states compute
    expect(fuzz(def, 300, 99, (s, rnd) => Object.assign(s, { vinMin: 5 + 20 * rnd(), vinMax: 26 + 10 * rnd(), vz: 2 + 3 * rnd(), rz: 30 * rnd(), izt: 0.005 + 0.05 * rnd(), ilMin: 0, ilMax: 0.05 * rnd(), izMin: 1e-3 + 5e-3 * rnd() }))).toBeGreaterThan(200);
  });
});
