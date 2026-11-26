import { describe, expect, it } from 'vitest';
import { def, retarget, type FilterState } from '@/calculators/filter/def';
import { protoOmega } from '@/calculators/filter/model';
import { runCompute } from '@/core/calc/page';

const res = (r: { results: { key: string; value: unknown; display?: string }[] }, k: string) => r.results.find((x) => x.key === k);
const fresh = (p: Partial<FilterState> = {}): FilterState => {
  const s = { ...def.defaults(), ...p };
  runCompute(def, s as any);
  return s;
};
/** What the page does on a Filter type change: set the value, run the select's apply, recompute. */
const switchBand = (s: FilterState, band: FilterState['band']) => {
  s.band = band;
  retarget(s);
  return runCompute(def, s as any);
};
const omega = (s: FilterState) => protoOmega(s.fs, s.band, s.fc, s.f0, s.bw);

describe('filter: mode-switch regressions', () => {
  it('low-pass → high-pass mirrors f_s into the new stopband (same Ω_s and order); switching back restores it', () => {
    const s = fresh();
    const n0 = s.n;
    const fs0 = s.fs;
    const r = switchBand(s, 'highpass');
    expect(r.warnings.some((w) => /passband/.test(w))).toBe(false);
    expect(s.fs).toBeCloseTo(50e6, 0);
    expect(omega(s)).toBeCloseTo(2, 12);
    expect(s.n).toBe(n0);
    switchBand(s, 'lowpass');
    expect(s.fs).toBeCloseTo(fs0, 0);
    expect(s.n).toBe(n0);
  });
  it('a low-pass → band-pass switch keeps the design frequency (no jump to the 100 MHz default)', () => {
    const s = fresh({ band: 'lowpass', fc: 20e3, fcUnit: 'kHz', fs: 40e3, fsUnit: 'kHz', r0: 600, n: 3, solveFor: 'as', eseries: 'E12' });
    const r = switchBand(s, 'bandpass');
    expect(r.ok).toBe(true);
    expect(s.f0).toBe(20e3);
    expect(s.f0Unit).toBe('kHz');
    expect(s.bw).toBe(2e3);
    expect(omega(s)).toBeGreaterThan(1);
    switchBand(s, 'lowpass');
    expect(s.fc).toBe(20e3);
    expect(s.fs).toBe(40e3);
  });
  it('every filter type switch from every example leaves f_s in the stopband', () => {
    for (const ex of def.examples!) {
      for (const band of ['lowpass', 'highpass', 'bandpass', 'bandstop'] as const) {
        const s = fresh(structuredClone(ex.state) as Partial<FilterState>);
        if (s.band === band) continue;
        const r = switchBand(s, band);
        expect(r.ok, `${ex.id} → ${band}`).toBe(true);
        expect(omega(s), `${ex.id} → ${band}`).toBeGreaterThan(1);
        expect(r.warnings.some((w) => /inside the passband/.test(w)), `${ex.id} → ${band}`).toBe(false);
      }
    }
  });
  it('solve A_s → solve n returns the same order (A_s is written back rounded down)', () => {
    const s = fresh({ band: 'lowpass', fc: 20e3, fs: 40e3, n: 3, solveFor: 'as' });
    expect(s.as).toBeLessThanOrEqual(10 * Math.log10(65));
    s.solveFor = 'n';
    runCompute(def, s as any);
    expect(s.n).toBe(3);
  });
  it('a lossless transmission zero is not described as "null"; extreme fractional bandwidths give no NaN', () => {
    const r = def.compute({ ...def.defaults(), band: 'bandstop', f0: 50e6, bw: 10e6, fs: 50e6, n: 3, solveFor: 'as' });
    expect(res(r, 'asBuilt')?.display).toMatch(/transmission zero/);
    const r2 = def.compute({ ...def.defaults(), band: 'bandpass', f0: 1e-3, bw: 1e6, fs: 13e6, n: 5, solveFor: 'as' });
    for (const x of r2.results) expect(x.display ?? '', x.key).not.toMatch(/NaN/);
  });
  it('the group-delay graph stays around the passband, so a narrow band-pass is not mostly undefined', () => {
    const r = def.compute({ ...def.defaults(), band: 'bandpass', f0: 107e6, bw: 1e6, fs: 13e6, n: 5, solveFor: 'as' });
    const g = r.graphs.find((x) => x.id === 'delay')!;
    const y = g.series![0].y;
    expect(y.filter((v) => !Number.isFinite(v as number)).length / y.length).toBeLessThan(0.5);
  });
});
