/** Regressions for issues found by the independent reviews (2026-11-21). */
import { describe, expect, it } from 'vitest';
import { def as filter } from '@/calculators/filter/def';
import { def as inrush } from '@/calculators/inrush/def';
import { def as nf } from '@/calculators/nf-cascade/def';
import { def as smith } from '@/calculators/smith/def';
import { sourceVoltage } from '@/physics/stimulus';

const val = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;

describe('filter', () => {
  it('narrow band-pass upper edge is found (no NaN at f0)', () => {
    const r = filter.compute({ ...filter.defaults(), band: 'bandpass', f0: 1e6, bw: 1e4, n: 1, solveFor: 'as', fs: 2e6 });
    expect(val(r, 'f3db2')).toBeCloseTo(1.005e6, -2);
  });
  it('band-stop with fs at f0 reports an infinite null, not NaN', () => {
    const r = filter.compute({ ...filter.defaults(), band: 'bandstop', f0: 50e6, bw: 10e6, fs: 50e6, n: 3, solveFor: 'as' });
    expect(val(r, 'asBuilt')).toBe(Infinity);
  });
  it('Chebyshev order with A_s below the ripple is 1', () => {
    const r = filter.compute({ ...filter.defaults(), response: 'chebyshev', ripple: 3, as: 2, solveFor: 'n' });
    expect(val(r, 'n')).toBe(1);
  });
});

describe('smith', () => {
  it('load whose line input sits on the g = 1 circle gives one-element matches only', () => {
    const r = smith.compute({ ...smith.defaults(), specBy: 'vswr', vswr: 3, gAng: -60, lineDeg: 30, zLine: 50 });
    const m = (r.details as any).matches as { x: number; b: number }[];
    for (const x of m) expect(x.x === 0 || x.b === 0 || (Math.abs(x.x) > 1e-3 && Math.abs(x.b) > 1e-6)).toBe(true);
  });
  it('a lossless load (|Γ| = 1 at an angle) is not "matched" by bogus networks', () => {
    const r = smith.compute({ ...smith.defaults(), specBy: 'gamma', gMag: 1, gAng: -37 });
    expect((r.details as any).matches.length).toBe(0);
  });
});

describe('noise figure', () => {
  it('sensitivity uses the source temperature', () => {
    const a = nf.compute({ ...nf.defaults(), tSrc: 290 });
    const b = nf.compute({ ...nf.defaults(), tSrc: 3000 });
    expect(val(b, 'sensitivity')).toBeGreaterThan(val(a, 'sensitivity') + 3);
  });
});

describe('inrush', () => {
  it('negative polarity is judged by magnitude', () => {
    const r = inrush.compute(inrush.load!({ ...inrush.defaults(), v: -12, vFail: 10 }));
    expect(r.status?.text).toBe('FAIL');
  });
  it('10/700 µs wave: peak ≈ 1, half value ≈ 700 µs after the virtual origin', () => {
    const st = { waveform: '10/700 µs impulse (telecom)', amplitudeV: 1, riseS: 0 };
    let pk = 0;
    for (let t = 0; t < 50e-6; t += 1e-8) pk = Math.max(pk, sourceVoltage(st, t));
    expect(pk).toBeCloseTo(1, 3);
    expect(sourceVoltage(st, 700e-6 + 2.6e-6)).toBeCloseTo(0.5, 2);
  });
});

describe('agent input layer', () => {
  it('suffix fields take plain numbers: "50 K" is 50 kelvin, "20m" is rejected', async () => {
    const { applyDefValues } = await import('@/core/calc/fields');
    const s = nf.defaults();
    expect(applyDefValues(nf, s, { tSrc: '50 K', 'stages.1.gain': '20 dB' })).toEqual([]);
    expect(s.tSrc).toBe(50);
    expect(s.stages[1].gain).toBe(20);
    expect(applyDefValues(nf, s, { 'stages.1.gain': '20m' }).length).toBe(1);
  });
  it('solveStage and solveFor are validated controls', async () => {
    const { applyDefValues } = await import('@/core/calc/fields');
    const s = nf.defaults();
    expect(applyDefValues(nf, s, { solveFor: 'nfStage', solveStage: 2 })).toEqual([]);
    expect(s.solveStage).toBe(2);
    expect(applyDefValues(nf, s, { solveStage: 9, solveFor: 'banana' }).length).toBe(2);
  });
  it('partial list items are completed and validated', async () => {
    const { applyDefValues } = await import('@/core/calc/fields');
    const s = nf.defaults();
    expect(applyDefValues(nf, s, { stages: [{ type: 'passive', loss: 2 }, { type: 'amp', gain: '10', nf: 3 }] })).toEqual([]);
    const r = nf.compute(s);
    expect(Number.isFinite(val(r, 'nfTotal'))).toBe(true);
    expect(applyDefValues(nf, s, { stages: [{ gain: 500 }] }).length).toBe(1);
  });
  it('case-insensitive unit names when unambiguous', async () => {
    const { applyDefValues } = await import('@/core/calc/fields');
    const s = nf.defaults();
    expect(applyDefValues(nf, s, { bw: '200 khz' })).toEqual([]);
    expect(s.bw).toBe(200e3);
  });
});

describe('inrush long windows', () => {
  it('a 1 s ramp reaches the full applied voltage (no truncated window)', () => {
    const r = inrush.compute(inrush.load!({ ...inrush.defaults(), waveform: 'Step with rise time', rise: 1 }));
    expect(val(r, 'vPeak')).toBeCloseTo(12, 1);
    expect(r.status?.text).toBe('PASS');
  });
});

describe('smith drag', () => {
  it('dragging Z_L to a Γ puts the load there in every input form', async () => {
    const { def } = await import('@/calculators/smith/def');
    const target = { re: 0.3, im: -0.2 };
    for (const specBy of ['z', 'gamma', 'vswr', 'rl'] as const) {
      const st = { ...def.defaults(), specBy };
      def.onDrag!(st, 'smith', 'load', target);
      const g = def.compute(st).details!.gamma as { re: number; im: number };
      expect(Math.hypot(g.re - target.re, g.im - target.im)).toBeLessThan(2e-3);
    }
  });
});
