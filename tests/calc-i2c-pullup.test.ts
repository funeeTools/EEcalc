import { describe, expect, it } from 'vitest';
import { def, type I2cState } from '@/calculators/i2c-pullup/def';
import { K_RISE, MODES, busWaveform, rpMax, rpMaxLeak, rpMin, riseTime, specSink } from '@/calculators/i2c-pullup/model';
import type { CalcReport } from '@/core/calc/types';
import { findField } from '@/core/calc/fields';
import { runCompute } from '@/core/calc/page';
import type { NumberField, SelectField } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<I2cState>) => def.compute({ ...def.defaults(), ...p });

function noNaN(r: CalcReport) {
  for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y), `${g.id}/${s.label}`).toBe(true);
}

describe('I²C pull-up — NXP UM10204 Rev. 7.0', () => {
  it('§7.1: t_r = 0.8473·RC from the 0.3/0.7 VDD crossings', () => {
    expect(K_RISE).toBeCloseTo(1.2039729 - 0.3566749, 6);
    expect(K_RISE).toBeCloseTo(0.8473, 4);
  });
  it('Table 10/11 limits', () => {
    expect([MODES.sm.trMax, MODES.fm.trMax, MODES.fmp.trMax]).toEqual([1000e-9, 300e-9, 120e-9]);
    expect([MODES.sm.cbMax, MODES.fm.cbMax, MODES.fmp.cbMax]).toEqual([400e-12, 400e-12, 550e-12]);
    expect(specSink('fm', 3.3)).toEqual({ vol: 0.4, iol: 3e-3 });
    expect(specSink('fmp', 5)).toEqual({ vol: 0.4, iol: 20e-3 });
    expect(specSink('fm', 1.8).vol).toBeCloseTo(0.36, 12);
    expect(specSink('fm', 1.8).iol).toBe(2e-3);
  });
  it('§7.2.4 worked example: 5 V ± 10 %, VOL 0.4 V at 3 mA → Rp(min) = 1.7 kΩ, about 200 pF at 300 ns', () => {
    expect(rpMin(5.5, 0.4, 3e-3)).toBeCloseTo(1700, 9);
    const r = run(def.examples!.find((e) => e.id === 'um10204-5v')!.state);
    expect(r.ok).toBe(true);
    expect(res(r, 'rpMin')).toBeCloseTo(1700, 9);
    // Python: 300 ns / (ln(7/3)·1.7 kΩ) = 208.27 pF ("about 200 pF" in the spec)
    expect(res(r, 'cb')).toBeCloseTo(2.0827455902538154e-10, 20);
    expect(r.status?.tone).toBe('pass');
  });
  it('Figure 41 end points: Rp(max) at the C_b limit: 2.95 kΩ (Sm, 400 pF), 885 Ω (Fm, 400 pF), 258 Ω (Fm+, 550 pF)', () => {
    expect(rpMax(1000e-9, 400e-12)).toBeCloseTo(2950.5, 0);
    expect(rpMax(300e-9, 400e-12)).toBeCloseTo(885.2, 0);
    expect(rpMax(120e-9, 550e-12)).toBeCloseTo(257.5, 0);
  });
  it('default: Fast-mode 3.3 V ±5 %, 100 pF → window 1.02 k … 3.54 k, E12 2.2 kΩ, 186 ns (Python)', () => {
    const r = run({});
    expect(res(r, 'rpMin')).toBeCloseTo(1021.6666666666666, 9);
    expect(res(r, 'rpMax')).toBeCloseTo(3540.658562492623, 0);
    expect(res(r, 'rp')).toBe(2200);
    expect(res(r, 'tr')).toBeCloseTo(riseTime(2200, 100e-12), 18);
    expect(res(r, 'tr')).toBeCloseTo(1.864e-7, 9);
    expect(r.warnings).toEqual([]);
  });
  it('Standard-mode 5 V, 350 pF → 2.2 kΩ (Python)', () => {
    expect(res(run(def.examples!.find((e) => e.id === 'sm-long')!.state), 'rp')).toBe(2200);
  });
  it('Fm+ at 1.8 V: narrow window, picks the fastest valid E24 value (820 Ω) and warns', () => {
    const r = run(def.examples!.find((e) => e.id === 'fmp-1v8')!.state);
    expect(res(r, 'rpMin')).toBeCloseTo(765, 6);
    expect(res(r, 'rp')).toBe(820);
    expect(r.warnings.some((w) => w.includes('narrow'))).toBe(true);
  });
});

describe('I²C pull-up — solve modes', () => {
  it('cb ↔ tr round trip: the solved C_b gives exactly the mode limit', () => {
    for (const mode of ['sm', 'fm', 'fmp'] as const) {
      const r = run({ mode, solveFor: 'cb', rp: 1.5e3 });
      const cb = res(r, 'cb');
      const t = run({ mode, solveFor: 'tr', rp: 1.5e3, cb });
      expect(res(t, 'tr') / MODES[mode].trMax).toBeCloseTo(1, 12);
    }
  });
  it('recommended Rp sits inside the window with margin and tolerance', () => {
    for (const cb of [20e-12, 50e-12, 100e-12, 200e-12]) {
      const r = run({ solveFor: 'rp', cb });
      const rp = res(r, 'rp');
      expect(rp * 0.95).toBeGreaterThanOrEqual(res(r, 'rpMin'));
      expect(rp * 1.05).toBeLessThanOrEqual(res(r, 'rpMax') * 0.8);
      const t = run({ solveFor: 'tr', rp, cb });
      expect(t.status?.tone).toBe('pass');
    }
  });
  it('10 kΩ on a 200 pF Fast-mode bus fails the rise time (1.69 µs)', () => {
    const r = run(def.examples!.find((e) => e.id === 'check-10k')!.state);
    expect(res(r, 'tr')).toBeCloseTo(1.6946e-6, 9);
    expect(r.status?.tone).toBe('fail');
    expect(r.warnings.some((w) => w.includes('exceeds'))).toBe(true);
  });
});

describe('I²C pull-up — edge cases', () => {
  it('Rp(min) > Rp(max): no solution, with the capacitance the supply allows', () => {
    const r = run({ mode: 'fm', vdd: 5, cb: 380e-12 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No pull-up meets/);
  });
  it('custom sink values and Cb above the spec limit', () => {
    const r = run({ sink: 'custom', vol: 0.4, iol: 6e-3, cb: 450e-12, mode: 'sm' });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('above the 400 pF'))).toBe(true);
    noNaN(r);
  });
  it('Rp below Rp(min) is flagged', () => {
    const r = run({ solveFor: 'tr', rp: 470 });
    expect(r.status?.tone).toBe('fail');
    expect(r.warnings.some((w) => w.includes('below Rp(min)'))).toBe(true);
  });
  it('bad inputs report errors', () => {
    expect(run({ cb: 0 }).ok).toBe(false);
    expect(run({ solveFor: 'cb', rp: 0 }).ok).toBe(false);
    expect(run({ sink: 'custom', vol: 5, vdd: 3.3 }).ok).toBe(false);
    expect(run({ vdd: NaN }).ok).toBe(false);
    expect(run({ margin: 100 }).ok).toBe(false);
  });
  it('very small and very large capacitance stay finite', () => {
    noNaN(run({ cb: 1e-12 }));
    noNaN(run({ solveFor: 'tr', cb: 1e-6, rp: 1e3 }));
  });
  it('every example computes', () => {
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      noNaN(r);
    }
    expect(def.examples![0].state).toEqual(def.defaults());
  });
});

describe('I²C pull-up — review fixes', () => {
  it('§7.4 leakage limit caps Rp on a small Standard-mode bus (was 39 kΩ "MEETS")', () => {
    // 0.1·VDDmin / (N·10 µA): 2 devices on 3.3 V −5 % → 15.675 kΩ
    expect(rpMaxLeak(3.135, 2)).toBeCloseTo(15675, 6);
    const r = run({ solveFor: 'rp', mode: 'sm', vdd: 3.3, vddTol: 5, cb: 20e-12, eseries: 'E12', rTol: 5, margin: 20, nDev: 2 });
    expect(res(r, 'rp')).toBe(12e3); // 15k × 1.05 > 15.675k
    expect(res(r, 'rp') * 1.05 * 2 * 10e-6).toBeLessThanOrEqual(0.1 * 3.135);
    const check = run({ solveFor: 'tr', mode: 'sm', vdd: 3.3, vddTol: 5, cb: 20e-12, rp: 39e3, nDev: 2 });
    expect(check.status?.tone).toBe('fail');
    expect(check.warnings.some((w) => w.includes('input-leakage limit'))).toBe(true);
  });
  it('no standard part in the window: nearest value with a warning that suggests a finer series', () => {
    const r = run({ solveFor: 'rp', mode: 'fm', vdd: 3.3, vddTol: 5, cb: 330e-12, eseries: 'E12', rTol: 5, margin: 20 });
    expect(r.ok).toBe(true);
    const w = r.warnings.join(' ');
    expect(w).toMatch(/No E12 value/);
    expect(w).toMatch(/1\.05 kΩ ±1 % fits/);
    expect(r.status?.text).toBe('OUT OF SPEC');
  });
  it('Fast-mode 6 mA at 0.6 V sink makes a 400 pF bus possible (Table 10 note [4])', () => {
    const spec = run({ mode: 'fm', vdd: 3.3, vddTol: 5, cb: 400e-12, solveFor: 'rp' });
    expect(spec.ok).toBe(false);
    expect(spec.error).toMatch(/6 mA at 0\.6 V/);
    const r = run({ mode: 'fm', vdd: 3.3, vddTol: 5, cb: 400e-12, solveFor: 'rp', sink: 'fm6', eseries: 'E24', rTol: 1 });
    expect(r.ok).toBe(true);
    expect(res(r, 'rpMin')).toBeCloseTo((3.465 - 0.6) / 6e-3, 9);
    expect(res(r, 'rp')).toBe(680);
    expect(r.status?.tone).toBe('pass');
    expect(run({ mode: 'sm', sink: 'fm6' }).ok).toBe(false);
  });
  it('fail message does not suggest Fm+ drivers when already Fm+ or at VDD ≤ 2 V', () => {
    const r = run({ mode: 'fmp', vdd: 1.8, vddTol: 5, cb: 300e-12 });
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/Fm\+ \(20 mA\)/);
    const s = run({ mode: 'fm', vdd: 1.8, vddTol: 5, cb: 500e-12 });
    expect(s.ok).toBe(false);
    expect(s.error).not.toMatch(/Fm\+ \(20 mA\)/);
  });
  it('a large margin alone is not reported as a narrow spec window', () => {
    const r = run({ mode: 'fm', vdd: 3.3, cb: 100e-12, margin: 90 });
    expect(r.warnings.some((w) => w.includes('narrow'))).toBe(false);
    expect(r.warnings.some((w) => w.includes('Lower the margin'))).toBe(true);
    const n = run(def.examples!.find((e) => e.id === 'fmp-1v8')!.state);
    expect(n.warnings.some((w) => w.includes('narrow'))).toBe(true);
  });
  it('VOL above 0.2·VDD is flagged (low-level noise margin)', () => {
    const r = run({ sink: 'custom', vol: 0.8, iol: 3e-3, vdd: 3.3 });
    expect(r.warnings.some((w) => w.includes('noise margin'))).toBe(true);
  });
  it('bus waveform: RC edges at the clock rate, 30→70 % takes t_r', () => {
    const o = { vdd: 3.3, rp: 2.2e3, cb: 100e-12, ron: 0.4 / 3e-3, tLow: 1.3e-6, tHigh: 1.2e-6, cycles: 3, lead: 0.75e-6 };
    const w = busWaveform(o);
    expect(w.edges.map((e) => e.low)).toEqual([true, false, true, false, true, false]);
    const at = (t: number) => w.v[w.t.findIndex((x) => x >= t - 1e-15)];
    expect(at(0)).toBe(3.3);
    expect(at(o.lead + o.tLow - 1e-12)).toBeCloseTo(w.vLow, 6); // settled at V_OL ≈ 0.19 V
    expect(w.vLow).toBeCloseTo((3.3 * o.ron) / (o.ron + o.rp), 12);
    // first rise: find 0.3 and 0.7 VDD crossings by interpolation
    const t0 = o.lead + o.tLow;
    const cross = (f: number) => {
      const i = w.t.findIndex((t, k) => t > t0 && w.v[k] >= f * 3.3);
      const a = i - 1;
      return w.t[a] + ((f * 3.3 - w.v[a]) / (w.v[i] - w.v[a])) * (w.t[i] - w.t[a]);
    };
    expect((cross(0.7) - cross(0.3)) / riseTime(o.rp, o.cb)).toBeCloseTo(1, 2);
    const r = run({});
    const g = r.graphs[0];
    expect(g.id).toBe('waveform');
    expect(g.series!.length).toBe(3);
    noNaN(r);
    // a 10 kΩ / 200 pF Fast-mode line never reaches V_IH within t_HIGH (no t_r marker)
    const slow = run(def.examples!.find((e) => e.id === 'check-10k')!.state);
    expect(slow.graphs[0].markers).toEqual([]);
  });
  it('E-series table rows are coloured: red outside the window, yellow inside the margin', () => {
    const r = run({});
    const t = r.tables.find((x) => x.id === 'values')!;
    expect(t.rowTones!.length).toBe(t.rows.length);
    t.rows.forEach((row, i) => {
      const tone = t.rowTones![i];
      if (row.ok !== 'yes') expect(tone).toBe('fail');
      else expect(['pass', 'warn']).toContain(tone);
    });
    expect(t.rowTones).toContain('pass');
    expect(t.rowTones).toContain('fail');
  });
});

describe('I²C pull-up — mode-switch regressions', () => {
  const sel = (st: I2cState, key: string, v: unknown) => {
    const f = findField(def.fields, key)!.field as SelectField;
    (st as any)[key] = v;
    f.apply?.(v, st, st);
    return runCompute(def, st as any);
  };
  const ex = (id: string) => ({ ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === id)!.state) }) as I2cState;
  it('Standard-mode 350 pF example → Fast-mode analyses the entered Rp instead of a red error', () => {
    const st = ex('sm-long');
    expect(runCompute(def, st as any).ok).toBe(true);
    const r = sel(st, 'mode', 'fm');
    expect(r.ok).toBe(true);
    expect(st.solveFor).toBe('tr');
    expect(r.status?.text).toBe('OUT OF SPEC');
    // back to Standard-mode: the Rp entered is unchanged and still meets it
    expect(sel(st, 'mode', 'sm').ok).toBe(true);
  });
  it('the Fast-mode-only 6 mA sink condition follows the bus speed', () => {
    const st = ex('sm-long');
    const r = sel(st, 'sink', 'fm6');
    expect(r.ok).toBe(true);
    expect(st.mode).toBe('fm');
    const r2 = sel(st, 'mode', 'fmp');
    expect(r2.ok).toBe(true);
    expect(st.sink).toBe('spec');
  });
  it('§7.2.4 example → ◎ Rp gives the nearest part, not an error (window is a single point)', () => {
    const st = ex('um10204-5v');
    runCompute(def, st as any);
    st.solveFor = 'rp';
    const r = runCompute(def, st as any);
    expect(r.ok).toBe(true);
    expect(st.rp).toBe(1.8e3);
    expect(r.warnings.join(' ')).toMatch(/No E24 value/);
  });
  it('C_b units stop at pF', () => {
    const f = findField(def.fields, 'cb')!.field as NumberField;
    expect(Object.keys(f.units!)).toEqual(['pF', 'nF', 'µF']);
  });
});
