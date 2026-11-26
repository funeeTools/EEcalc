import { describe, expect, it } from 'vitest';
import { def, type TimerState } from '@/calculators/555-timer/def';
import { astable, monoFactor } from '@/calculators/555-timer/model';
import { applyDefValues, findField } from '@/core/calc/fields';
import { runCompute } from '@/core/calc/page';
import type { NumberField, SelectField, ToggleField } from '@/core/form/form';

const res = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<TimerState>) => def.compute({ ...def.defaults(), ...p });

describe('555-timer: TI NE555 data-sheet equations', () => {
  it('astable t_H = 0.693(R_A+R_B)C, t_L = 0.693·R_B·C, f ≈ 1.44/((R_A+2R_B)C)', () => {
    const o = astable({ vcc: 5, vcv: null, ra: 1e3, rb: 6.8e3, c: 100e-9, diode: false, vf: 0 });
    expect(o.tH).toBeCloseTo(0.693 * 7.8e3 * 100e-9, 6);
    expect(o.tL).toBeCloseTo(0.693 * 6.8e3 * 100e-9, 6);
    // the data sheet's 1.44 is 1/ln2 rounded: 986.3 Hz vs exact 988.15 Hz
    expect(o.f / (1.44 / (14.6e3 * 100e-9))).toBeCloseTo(1 / (1.44 * Math.LN2), 9);
    expect(o.duty).toBeCloseTo(7.8 / 14.6, 12);
  });
  it('monostable t_w = ln3·RC ≈ 1.1·RC', () => {
    expect(monoFactor(5, null)).toBeCloseTo(Math.log(3), 12);
    expect(monoFactor(15, null)).toBeCloseTo(1.0986, 4);
  });
  it('Python time-stepping simulation (comparators + latch) agrees', () => {
    // sim555.py: defaults → first 856.95 µs, tH 540.7 µs, tL 471.35 µs, f 988.09 Hz
    const r = run({});
    expect(res(r, 'tFirst')).toBeCloseTo(856.92e-6, 7);
    expect(res(r, 'tHigh')).toBeCloseTo(540.7e-6, 7);
    expect(res(r, 'tLow')).toBeCloseTo(471.34e-6, 7);
    // diode variant at 3.3 V, V_F 0.3 V: tH 6.5792 µs, tL 19.738 µs
    const o = astable({ vcc: 3.3, vcv: null, ra: 7605.742, rb: 28474.244, c: 1e-9, diode: true, vf: 0.3 });
    expect(o.tH / 6.5792e-6).toBeCloseTo(1, 3);
    expect(o.tL / 19.738e-6).toBeCloseTo(1, 3);
  });
  it('CONT voltage moves both thresholds; t_L stays ln2·R_B·C', () => {
    const r = run({ vcv: 2 });
    expect(res(r, 'vu')).toBe(2);
    expect(res(r, 'vl')).toBe(1);
    expect(res(r, 'tLow')).toBeCloseTo(Math.LN2 * 6.8e3 * 100e-9, 12);
    expect(res(r, 'tHigh')).toBeCloseTo(Math.log(4 / 3) * 7.8e3 * 100e-9, 12);
  });
  it('timing is independent of V_CC with the internal divider', () => {
    expect(res(run({ vcc: 5 }), 'f')).toBeCloseTo(res(run({ vcc: 15 }), 'f'), 9);
  });
});

describe('555-timer: solve round trips', () => {
  it('R_A, R_B for f and duty reproduce the analysis', () => {
    const r = run({ solveFor: 'ra', f: 2.5e3, duty: 70, c: 22e-9 });
    const ra = res(r, 'ra');
    const rb = res(r, 'rb');
    const back = run({ solveFor: 'f', ra, rb, c: 22e-9 });
    expect(res(back, 'f')).toBeCloseTo(2.5e3, 8);
    expect(res(back, 'duty')).toBeCloseTo(70, 10);
  });
  it('diode mode reaches a duty below 50 %', () => {
    const p = { diode: true, vf: 0.6, vcc: 5 };
    const r = run({ ...p, solveFor: 'ra', f: 10e3, duty: 20, c: 10e-9 });
    const back = run({ ...p, solveFor: 'f', ra: res(r, 'ra'), rb: res(r, 'rb'), c: 10e-9 });
    expect(res(back, 'f')).toBeCloseTo(10e3, 7);
    expect(res(back, 'duty')).toBeCloseTo(20, 10);
  });
  it('C for f (astable) and C, R_A for t_w (monostable)', () => {
    const c = res(run({ solveFor: 'c', ra: 10e3, rb: 47e3, f: 440 }), 'c');
    expect(res(run({ solveFor: 'f', ra: 10e3, rb: 47e3, c }), 'f')).toBeCloseTo(440, 9);
    const m = { mode: 'monostable' as const };
    const ra = res(run({ ...m, solveFor: 'ra', tw: 0.25, c: 4.7e-6 }), 'ra');
    expect(res(run({ ...m, solveFor: 'tw', ra, c: 4.7e-6 }), 'tw')).toBeCloseTo(0.25, 12);
    const cm = res(run({ ...m, solveFor: 'c', tw: 0.25, ra: 47e3 }), 'c');
    expect(res(run({ ...m, solveFor: 'tw', ra: 47e3, c: cm }), 'tw')).toBeCloseTo(0.25, 12);
  });
  it('mode switch maps f ↔ t_w', () => {
    expect(run({ mode: 'monostable', solveFor: 'f' }).solveFor).toBe('tw');
    expect(run({ mode: 'astable', solveFor: 'tw' }).solveFor).toBe('f');
  });
  it('nearest-value timing', () => {
    const r = run({ solveFor: 'ra', f: 1, duty: 60, c: 10e-6, vcc: 9 });
    expect(res(r, 'raStd')).toBe(30e3);
    expect(res(r, 'rbStd')).toBe(56e3);
    expect(res(r, 'fStd')).toBeCloseTo(1 / (Math.LN2 * (30e3 + 2 * 56e3) * 10e-6), 9);
  });
});

describe('555-timer: limits and edge cases', () => {
  it('duty ≤ 50 % without the diode is an error that names the fix', () => {
    expect(() => run({ solveFor: 'ra', f: 1e3, duty: 40, c: 100e-9 })).toThrow(/Diode across R_B/);
    expect(() => run({ solveFor: 'ra', f: 1e3, duty: 50, c: 100e-9 })).toThrow(/R_A ≤ 0/);
  });
  it('NE555 threshold-current limit: 3.4 MΩ at 5 V, 10 MΩ at 15 V', () => {
    expect(run({ ra: 1e6, rb: 2.2e6, vcc: 5 }).warnings.join(' ')).not.toMatch(/threshold input current/);
    expect(run({ ra: 1e6, rb: 2.6e6, vcc: 5 }).warnings.join(' ')).toMatch(/threshold input current/);
    expect(run({ ra: 1e6, rb: 8.5e6, vcc: 15 }).warnings.join(' ')).not.toMatch(/threshold input current/);
    expect(run({ ra: 1e6, rb: 8.5e6, vcc: 15, device: 'TLC555' }).warnings.join(' ')).not.toMatch(/threshold/);
  });
  it('supply range, small R_A, small C and high frequency warn', () => {
    const w = run({ device: 'NE555', vcc: 3.3, ra: 470, rb: 3.3e3, c: 1e-9 }).warnings.join(' ');
    expect(w).toMatch(/supply range/);
    expect(w).toMatch(/R_A ≥ 1 kΩ/);
    expect(w).toMatch(/delays/);
  });
  it('bad inputs are errors, not NaN', () => {
    expect(() => run({ solveFor: 'f', c: 0 })).toThrow();
    expect(() => run({ vcv: 6, vcc: 5 })).toThrow();
    expect(() => run({ diode: true, vf: 4.5, vcc: 5 })).toThrow(/never reaches/);
  });
  it('every example computes', () => {
    for (const ex of def.examples ?? []) {
      const r = def.compute({ ...def.defaults(), ...structuredClone(ex.state) } as TimerState);
      expect(r.ok, ex.id).toBe(true);
      expect(JSON.stringify(r), ex.id).not.toMatch(/NaN/);
    }
  });
});

describe('555-timer: review regressions', () => {
  it('monostable minimum pulse width: 10 µs (NE555), 1 µs (TLC555)', () => {
    expect(run({ mode: 'monostable', solveFor: 'tw', ra: 1e3, c: 1e-9 }).warnings.join(' ')).toMatch(/10 µs minimum/);
    expect(run({ mode: 'monostable', solveFor: 'tw', ra: 1e3, c: 470e-12, device: 'TLC555' }).warnings.join(' ')).toMatch(/1 µs/);
    expect(run({ mode: 'monostable', solveFor: 'tw', ra: 10e3, c: 1e-9, device: 'TLC555' }).warnings.join(' ')).not.toMatch(/1 µs/);
  });
  it('astable above 100 kHz warns for the TLC555 too', () => {
    const w = run({ device: 'TLC555', vcc: 5, ra: 1e3, rb: 3.3e3, c: 1e-9 }).warnings.join(' ');
    expect(w).toMatch(/below 100 kHz/);
  });
  it('TLC555 supply range depends on grade', () => {
    expect(run({ device: 'TLC555', vcc: 2.5 }).warnings.join(' ')).not.toMatch(/supply range/);
    expect(run({ device: 'TLC555I', vcc: 2.5 }).warnings.join(' ')).toMatch(/3–15 V/);
    expect(run({ device: 'TLC555M', vcc: 4 }).warnings.join(' ')).toMatch(/5–15 V/);
  });
  it('supply-independence note only without diode or V_CV; CONT range warnings', () => {
    expect(run({}).notes.join(' ')).toMatch(/independent of supply/);
    expect(run({ diode: true }).notes.join(' ')).not.toMatch(/independent of supply/);
    expect(run({ vcv: 4.5, vcc: 5 }).warnings.join(' ')).toMatch(/10–80 %/);
    expect(run({ vcv: 0.8, vcc: 5, device: 'TLC555' }).warnings.join(' ')).toMatch(/1 V minimum/);
  });
  it('NE555 max-R check uses V_CC − V_F with the diode; peak I_DIS includes V_U/R_B', () => {
    // 5 V, V_F 0.6: (5 − 0.6 − 3.333)/0.5 µA = 2.13 MΩ, so 3 MΩ warns only in diode mode
    expect(run({ ra: 3e6, rb: 1e6, diode: true, vf: 0.6 }).warnings.join(' ')).toMatch(/threshold input current/);
    expect(run({ ra: 2e6, rb: 1e6 }).warnings.join(' ')).not.toMatch(/threshold input current/);
    expect(res(run({}), 'iDis')).toBeCloseTo(5 / 1e3 + (10 / 3) / 6.8e3, 12);
  });
});

describe('555-timer: mode-switch regressions', () => {
  const sel = (st: TimerState, key: string, v: unknown) => {
    const f = findField(def.fields, key)!.field as SelectField | ToggleField;
    (st as any)[key] = v;
    f.apply?.(v as never, st, st);
    return runCompute(def, st as any);
  };
  const ex = (id: string) => ({ ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === id)!.state) }) as TimerState;
  it('monostable example → astable analyses the parts (the original bug)', () => {
    const st = ex('mono-1s');
    runCompute(def, st as any);
    const ra = st.ra;
    const r = sel(st, 'mode', 'astable');
    expect(r.ok).toBe(true);
    expect(st.solveFor).toBe('f');
    expect(st.ra).toBe(ra);
  });
  it('25 % diode design → diode off analyses the parts; on again returns 38 kHz / 25 %', () => {
    const st = ex('design-25');
    runCompute(def, st as any);
    const r = sel(st, 'diode', false);
    expect(r.ok).toBe(true);
    expect(st.solveFor).toBe('f');
    const r2 = sel(st, 'diode', true);
    expect(r2.ok).toBe(true);
    expect(st.f).toBeCloseTo(38e3, 6);
    expect(st.duty).toBeCloseTo(25, 9);
  });
  it('a diode design above 50 % keeps solving R for the same f and duty when the diode goes', () => {
    const st = { ...ex('design-25'), duty: 70 };
    runCompute(def, st as any);
    const r = sel(st, 'diode', false);
    expect(r.ok).toBe(true);
    expect(st.solveFor).toBe('ra');
    expect(st.f).toBeCloseTo(38e3, 6);
  });
  it('the diode is a toggle whose switch-off side effect also runs through the API', () => {
    const f = findField(def.fields, 'diode')!.field;
    expect(f.kind).toBe('toggle');
    const st = ex('design-25');
    runCompute(def, st as any);
    expect(applyDefValues(def, st as any, { diode: false })).toEqual([]);
    expect(st.solveFor).toBe('f');
  });
  it('R_A = 1 GΩ: a 99.9993 % duty is a valid solved value, not OUT OF RANGE', () => {
    const st = { ...def.defaults(), ra: 1e9 };
    const r = runCompute(def, st as any);
    expect(r.ok).toBe(true);
    expect(st.duty).toBeGreaterThan(99.99);
  });
  it('slow oscillators read in µHz / mHz; large C in mF', () => {
    const st = { ...def.defaults(), c: 1 };
    runCompute(def, st as any);
    expect(st.fUnit).toBe('µHz');
    const c = findField(def.fields, 'c')!.field as NumberField;
    expect(Object.keys(c.units!)).toEqual(['pF', 'nF', 'µF', 'mF']);
  });
});
