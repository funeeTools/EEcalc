import { describe, expect, it } from 'vitest';
import { def, type SnubState } from '@/calculators/rc-snubber/def';
import { fromTwoFreqs, peak, stepResponse } from '@/calculators/rc-snubber/model';
import { fuzz, res } from './fuzz-gen3';

const run = (p: Partial<SnubState>) => def.compute({ ...def.defaults(), ...p });
const warned = (r: ReturnType<typeof run>, re: RegExp) => r.warnings.some((w) => re.test(w));

describe('RC snubber — TI SLVA255 worked example', () => {
  it('217 MHz halved by 300 pF: C_p = 100 pF, L = 5.4 nH, R_snub = 7.3 Ω (SLVA255 eq. 1–3)', () => {
    // SLVA255 treats the 113 MHz reading as exactly half, so C_p = C_add/3
    const p = fromTwoFreqs(217e6, 217e6 / 2, 300e-12);
    expect(p.cp).toBeCloseTo(100e-12, 20);
    expect(p.lp * 1e9).toBeCloseTo(5.4, 1);
    expect(p.z0).toBeCloseTo(7.3, 1);
    const r = run({ ...def.examples![1].state, f1: 217e6 / 2 });
    expect(res(r, 'rs')).toBeCloseTo(p.z0, 12);
  });
  it('with the measured 113 MHz the exact ratio gives C_p = 111.6 pF, L = 4.82 nH, Z₀ = 6.57 Ω', () => {
    const r = run(def.examples![1].state);
    expect(res(r, 'cpar')).toBeCloseTo(300e-12 / ((217 / 113) ** 2 - 1), 20);
    expect(res(r, 'lpar') * 1e9).toBeCloseTo(4.819, 3);
    expect(res(r, 'z0')).toBeCloseTo(6.571, 3);
  });
});

describe('RC snubber — damping model', () => {
  it('overshoot matches an independent RK4 circuit simulation (Python)', () => {
    // pb3/py/check.py: i_L, v_node, v_Cs integrated with RK4, unit step through L into C_p ∥ (R + C_s)
    expect(peak(1, 4).peak - 1).toBeCloseTo(0.377826, 4);
    expect(peak(1, 3).peak - 1).toBeCloseTo(0.434455, 4);
    expect(peak(0.5, 4).peak - 1).toBeCloseTo(0.447906, 4);
    expect(peak(2, 10).peak - 1).toBeCloseTo(0.474925, 4);
  });
  it('limits: no snubber or an open / shorted resistor leaves a 100 % ring', () => {
    expect(peak(1, 1e-6).peak).toBeCloseTo(2, 4);
    expect(peak(1e4, 4).peak).toBeCloseTo(2, 2);
    expect(peak(1e-4, 4).peak).toBeCloseTo(2, 2);
    // shorted R: C_s simply adds to C_p, ring at ω₀/√(1 + n)
    expect(stepResponse(0, 3).wRing).toBeCloseTo(0.5, 12);
  });
  it('step response starts at 0 and settles to 1; best R for n = 4 is a little below Z₀', () => {
    const sr = stepResponse(1, 4);
    expect(sr.y(0)).toBeCloseTo(0, 9);
    expect(sr.y(2000)).toBeCloseTo(1, 6);
    expect(peak(0.87, 4).peak).toBeLessThan(peak(1, 4).peak);
    expect(peak(0.87, 4).peak).toBeLessThan(peak(0.7, 4).peak);
  });
  it('resistor power: ½·C·V²·f on an inductive node (SLVA255), C·V²·f with both edges hard; independent of R', () => {
    const r = run({ solveFor: 'pr', rs: 3.3, cs: 1e-9 });
    expect(res(r, 'pr')).toBeCloseTo(0.5 * 1e-9 * 144 * 500e3, 15);
    expect(res(r, 'prBound')).toBeCloseTo(1e-9 * 144 * 500e3, 15);
    expect(res(run({ solveFor: 'pr', rs: 33, cs: 1e-9 }), 'pr')).toBe(res(r, 'pr'));
    expect(res(run({ solveFor: 'pr', rs: 3.3, cs: 1e-9, edges: 'both' }), 'pr')).toBeCloseTo(1e-9 * 144 * 500e3, 15);
  });
  it('review 2026-11-26: method switch carries L_p and C_p over and back', () => {
    const st = def.defaults();
    const f = def.fields.flatMap((x: any) => x.fields ?? [x]).find((x: any) => x.key === 'method') as any;
    const a = res(run(st), 'z0');
    f.apply('lc', st, st);
    st.method = 'lc';
    expect(res(run(st), 'z0') / a).toBeCloseTo(1, 12);
    f.apply('two', st, st);
    st.method = 'two';
    expect(st.f1 / 95e6).toBeCloseTo(1, 12);
  });
});

describe('RC snubber — solve round trips', () => {
  for (const ex of def.examples!)
    it(`design → power budget → analysis agree (${ex.id})`, () => {
      const st = { ...def.defaults(), ...ex.state } as SnubState;
      const a = def.compute({ ...st, solveFor: 'rs' });
      const rs = res(a, 'rs');
      const cs = res(a, 'cs');
      const pr = res(a, 'pr');
      const b = def.compute({ ...st, solveFor: 'cs', pr });
      expect(res(b, 'cs') / cs).toBeCloseTo(1, 9);
      expect(res(b, 'n') / st.n).toBeCloseTo(1, 9);
      const c = def.compute({ ...st, solveFor: 'pr', rs, cs });
      expect(res(c, 'pr') / pr).toBeCloseTo(1, 9);
      expect(res(c, 'k') / st.k).toBeCloseTo(1, 9);
      expect(res(c, 'n') / st.n).toBeCloseTo(1, 9);
    });
});

describe('RC snubber — warnings and errors', () => {
  it('each limit is reported', () => {
    expect(() => run({ f1: 200e6 })).toThrow(/must be below f₀/);
    expect(warned(run({ f1: 170e6 }), /only/)).toBe(true); // tiny frequency shift
    expect(warned(run({ f1: 40e6 }), /test capacitor’s own ESL/)).toBe(true);
    expect(warned(run({ n: 1.2 }), /too small to damp/)).toBe(true);
    expect(warned(run({ k: 5 }), /too large/)).toBe(true);
    expect(warned(run({ k: 0.2 }), /too small — C_s just adds/)).toBe(true);
    expect(warned(run({ tonMin: 5e-9 }), /3·R_s·C_s/)).toBe(true);
    expect(warned(run(def.examples![3].state), /burns/)).toBe(true); // both edges hard: 5.3 W
  });
  it('E-series table: candidates bracket the ideal parts; power over budget is red', () => {
    const r = run(def.examples![2].state);
    const t = r.tables[0];
    expect(t.rows.length).toBeGreaterThanOrEqual(2);
    const cs = res(r, 'cs');
    t.rows.forEach((row, i) => {
      if ((row.p as number) > 0.5 * (1 + 1e-9)) expect(t.rowTones![i]).toBe('fail');
      expect(Math.abs((row.c as number) / cs - 1)).toBeLessThan(0.25);
    });
  });
});

describe('RC snubber — examples, fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = def.compute({ ...def.defaults(), ...e.state } as SnubState);
      expect(r.ok && r.status?.text !== 'NO SOLUTION', e.id).toBe(true);
    }
  });
  it('compute < 50 ms', () => {
    run({});
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) run({ n: 3 + i });
    expect((performance.now() - t0) / 10).toBeLessThan(50);
  });
  it('fuzz: 300 random states plus 300 realistic ones through runCompute', () => {
    expect(fuzz(def, 300, 99)).toBeGreaterThan(100);
    expect(
      fuzz(def, 300, 5, (s, rnd) => {
        Object.assign(s, { f0: 1e7 * 100 ** rnd(), cAdd: 1e-11 * 1000 ** rnd(), v: 5 + 400 * rnd(), fsw: 5e4 * 40 ** rnd(), n: 0.5 + 10 * rnd(), k: 0.2 + 3 * rnd(), pr: 0.01 * 300 ** rnd(), tonMin: 1e-7 * rnd() });
        s.f1 = s.f0 / (1.1 + 3 * rnd());
      }),
    ).toBeGreaterThan(250);
  });
});
