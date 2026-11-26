import { describe, expect, it } from 'vitest';
import { def } from '@/calculators/adc-snr/def';
import { adcSnr, idealSnr, jitterSnr } from '@/calculators/adc-snr/model';

const res = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const quiet = { vn: 0, tjAp: 0, tjClk: 0, thd: null, ain: 0, bw: 0 };

describe('adc snr: ADI tutorial values', () => {
  it('MT-001: ideal 12-bit full-scale SNR = 6.02·12 + 1.76 = 74.0 dB; ENOB = 12', () => {
    const r = def.compute({ ...def.defaults(), ...quiet, solveFor: 'snr', n: 12, fin: 1e6 });
    expect(res(r, 'snr')).toBeCloseTo(74.0, 1);
    expect(res(r, 'enob')).toBeCloseTo(12, 9);
    expect(idealSnr(16)).toBeCloseTo(98.09, 2);
  });
  it('MT-001: 4× oversampling gives 6 dB processing gain (one extra bit)', () => {
    const r = def.compute({ ...def.defaults(), ...quiet, solveFor: 'snr', n: 12, fs: 100e6, bw: 12.5e6, fin: 1e6 });
    expect(res(r, 'pg')).toBeCloseTo(6.02, 2);
    expect(res(r, 'enob')).toBeCloseTo(13, 9);
  });
  it('MT-008 / AN-756: 1 ps rms jitter at 100 MHz limits SNR to 64.0 dB', () => {
    expect(jitterSnr(100e6, 1e-12)).toBeCloseTo(64.04, 2);
    const r = def.compute({ ...def.defaults(), ...quiet, solveFor: 'snr', n: 24, fin: 100e6, tjClk: 1e-12 });
    expect(res(r, 'snr')).toBeCloseTo(64.04, 1);
    expect(res(r, 'limitedBy')).toBe('Jitter' as unknown as number);
  });
  it('MT-003: ENOB = (SINAD − 1.76 − A_in)/6.02 refers a −6 dBFS measurement to full scale', () => {
    const o = adcSnr({ n: 10, fs: 1e6, bw: 5e5, fin: 1e3, ain: -6, vfs: 2, vn: 0, tjClk: 0, tjAp: 0, thd: null });
    expect(o.sinad).toBeCloseTo(idealSnr(10) - 6, 9);
    expect(o.enob).toBeCloseTo(10, 9);
  });
});

describe('adc snr: independent Python re-implementation (noise powers in V², scratch script)', () => {
  it('default design: SINAD 74.3456 dB, ENOB 12.22', () => {
    const r = def.compute(def.defaults());
    expect(res(r, 'snr')).toBeCloseTo(74.34565, 4);
    expect(res(r, 'enob')).toBeCloseTo(12.2235, 2); // Python used the rounded 1.76/6.02
  });
  it('solves agree with Python bisection', () => {
    const ex = Object.fromEntries((def.examples ?? []).map((e) => [e.id, def.compute({ ...def.defaults(), ...e.state })]));
    expect(res(ex['max-jitter'], 'tjClk')).toBeCloseTo(2.3208184e-13, 18);
    expect(res(ex['max-fin'], 'fin') / 508602535.06).toBeCloseTo(1, 5); // Python target used 6.0206/1.7609 rounded
    expect(res(ex['oversampled-audio'], 'n')).toBe(13);
    expect(res(ex['oversampled-audio'], 'sinad')).toBeCloseTo(98.88232, 4);
  });
  it('THD adds in power to give SINAD', () => {
    const base = { n: 12, fs: 1e6, bw: 5e5, fin: 1e3, ain: 0, vfs: 2, vn: 0, tjClk: 0, tjAp: 0 };
    const o = adcSnr({ ...base, thd: -74.0081 });
    expect(o.sinad).toBeCloseTo(74.0081 - 3.0103, 3);
  });
});

describe('adc snr: solve round trips', () => {
  it('bits: solved N meets the target, N − 1 does not', () => {
    const s = { ...def.defaults(), solveFor: 'n' as const, targetAs: 'snr' as const, snr: 72 };
    const r = def.compute(s);
    const n = res(r, 'n');
    expect(res(def.compute({ ...s, solveFor: 'snr', n }), 'snr')).toBeGreaterThanOrEqual(72);
    expect(res(def.compute({ ...s, solveFor: 'snr', n: n - 1 }), 'snr')).toBeLessThan(72);
  });
  it('jitter and f_in: solved value reproduces the target exactly', () => {
    const s = { ...def.defaults(), targetAs: 'enob' as const, enob: 11.5 };
    const rj = def.compute({ ...s, solveFor: 'tjClk' });
    expect(res(def.compute({ ...s, solveFor: 'snr', tjClk: res(rj, 'tjClk') }), 'enob')).toBeCloseTo(11.5, 8);
    const rf = def.compute({ ...s, solveFor: 'fin' });
    expect(res(def.compute({ ...s, solveFor: 'snr', fin: res(rf, 'fin') }), 'enob')).toBeCloseTo(11.5, 8);
  });
});

describe('adc snr: edge cases', () => {
  it('unreachable targets give NO SOLUTION with a reason, never NaN', () => {
    const r1 = def.compute({ ...def.defaults(), solveFor: 'n', targetAs: 'snr', snr: 90 }); // jitter/thermal cap ≈ 75 dB
    expect(r1.status?.text).toBe('NO SOLUTION');
    expect(r1.warnings[0]).toMatch(/out of reach/);
    const r2 = def.compute({ ...def.defaults(), solveFor: 'tjClk', targetAs: 'snr', snr: 80 });
    expect(r2.status?.text).toBe('NO SOLUTION');
    for (const r of [r1, r2]) expect(r.results.every((x) => x.value === null || Number.isFinite(x.value as number))).toBe(true);
  });
  it('invalid inputs throw with a message', () => {
    expect(() => def.compute({ ...def.defaults(), fs: 0 })).toThrow();
    expect(() => def.compute({ ...def.defaults(), bw: 200e6 })).toThrow(/fs\/2/);
    expect(() => def.compute({ ...def.defaults(), ain: 3 })).toThrow();
    expect(() => def.compute({ ...def.defaults(), tjClk: -1e-12 })).toThrow();
  });
  it('ideal converter with no noise sources stays finite', () => {
    const r = def.compute({ ...def.defaults(), ...quiet, solveFor: 'snr', n: 32 });
    expect(Number.isFinite(res(r, 'snr'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('thermal noise'))).toBe(true);
  });
  it('every example computes with finite results and graph data', () => {
    for (const ex of def.examples ?? []) {
      const r = def.compute({ ...def.defaults(), ...ex.state });
      expect(r.ok, ex.id).toBe(true);
      expect(r.status?.text, ex.id).not.toBe('NO SOLUTION');
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${ex.id} ${x.key}`).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite), `${ex.id} ${g.id} ${s.label}`).toBe(true);
    }
  });

  it('regression: zero jitter → f_in solve reports "met at every frequency" (∞), not a failure', () => {
    const r = def.compute({ ...def.defaults(), ...quiet, solveFor: 'fin', targetAs: 'snr', snr: 60 });
    expect(r.status?.text).toBe('NO LIMIT');
    expect(r.warnings[0]).toMatch(/met at every input frequency/);
    const fin = r.results.find((x) => x.key === 'fin')!;
    expect(fin.value).toBeNull(); // never write ∞ into the input
    expect(fin.display).toBe('∞');
    expect(Number.isFinite(res(r, 'sinad'))).toBe(true);
  });
  it('regression: unreachable N target with no other noise blames the bit count, not jitter', () => {
    const r = def.compute({ ...def.defaults(), ...quiet, solveFor: 'n', targetAs: 'snr', snr: 500 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.warnings[0]).toMatch(/more than 64 bits/);
    expect(r.warnings[0]).not.toMatch(/jitter/);
  });
});

describe('adc snr: review regressions', () => {
  it('NSD does not depend on BW: ideal 12-bit at 100 MSPS is −151.0 dBFS/Hz (MT-001)', () => {
    const nsdAt = (bw: number) => res(def.compute({ ...def.defaults(), ...quiet, solveFor: 'snr', n: 12, fs: 100e6, bw, fin: 1e5 }), 'nsd');
    expect(nsdAt(0)).toBeCloseTo(-(idealSnr(12)) - 10 * Math.log10(50e6), 6);
    expect(nsdAt(0)).toBeCloseTo(-151.0, 1);
    expect(nsdAt(1e6)).toBeCloseTo(nsdAt(0), 9);
    // oversampled-audio settings analysed at 16 bits: −(98.09) − 10·log10(1.536 MHz) = −159.95 dBFS/Hz (the buggy value was −197.66)
    const audio = (def.examples ?? []).find((e) => e.id === 'oversampled-audio')!.state;
    expect(res(def.compute({ ...def.defaults(), ...audio, solveFor: 'snr', n: 16 }), 'nsd')).toBeCloseTo(-159.95, 1);
  });
  it('f_in solve near 16 GHz hits the exact root (shared brent tolerance bug)', () => {
    const tj = 0.1e-12;
    const r = def.compute({ ...def.defaults(), ...quiet, solveFor: 'fin', targetAs: 'snr', snr: 40, n: 14, tjClk: tj, fs: 100e9, bw: 0 });
    // exact: (2π f t_j)² = 10^(−40/10) − quantization noise ratio
    const nq = 1 / (1.5 * 4 ** 14);
    const exact = Math.sqrt(1e-4 - nq) / (2 * Math.PI * tj);
    expect(exact / 1e9).toBeCloseTo(15.9153, 4);
    expect(res(r, 'fin') / exact).toBeCloseTo(1, 9);
  });
});


describe('adc snr: mode-switch regressions', () => {
  it('◎ jitter or f_in from an analysed ideal converter is met at the limit, not "no solution"', () => {
    const st = { ...def.defaults(), solveFor: 'snr' as const, n: 12, vn: 0, tjAp: 0, tjClk: 0, thd: null, ain: 0, fs: 100e6, bw: 0, fin: 1e6 };
    const a = def.compute(st);
    const target = res(a, 'snr');
    const j = def.compute({ ...st, solveFor: 'tjClk', targetAs: 'snr', snr: target });
    expect(j.status?.text).not.toBe('NO SOLUTION');
    expect(res(j, 'tjClk')).toBe(0);
    expect(j.graphs.length).toBeGreaterThan(0);
    const f = def.compute({ ...st, solveFor: 'fin', targetAs: 'snr', snr: target });
    expect(f.status?.text).toBe('NO LIMIT');
    expect(f.graphs.length).toBeGreaterThan(0);
  });
  it('a target outside the SINAD/ENOB field ranges is refused instead of writing an out-of-range SINAD', () => {
    expect(() => def.compute({ ...def.defaults(), solveFor: 'n', targetAs: 'enob', enob: 200, ain: 0 })).toThrow(/outside the range/);
    expect(def.compute({ ...def.defaults(), solveFor: 'n', targetAs: 'enob', enob: 16, ain: 0 }).ok).toBe(true);
  });
});

describe('adc snr: output ranges', () => {
  it('a very noisy analysed SINAD (−53 dB with 1 µs aperture jitter) fits the SINAD field, so no red error', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const r = runCompute(def, { ...def.defaults(), tjAp: 1e-6 } as any);
    expect(r.ok, r.error).toBe(true);
    expect(res(r, 'snr')).toBeLessThan(-50);
  });
});

describe('adc snr: graph range', () => {
  it('the SNR-vs-f_in sweep includes f_in when it is far below fs/2 (oversampled audio example)', () => {
    const ex = def.examples!.find((e) => e.id === 'oversampled-audio')!;
    const r = def.compute({ ...def.defaults(), ...structuredClone(ex.state) } as any);
    const x = r.graphs.find((g) => g.id === 'snr-vs-fin')!.series![0].x as number[];
    expect(x[0]).toBeLessThan(1e3);
  });
});
