import { describe, expect, it } from 'vitest';
import { def, type LcState } from '@/calculators/lc-resonance/def';
import { band, f0Of, parallelZeroPhase } from '@/calculators/lc-resonance/model';

const res = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<LcState>) => def.compute({ ...def.defaults(), ...p });

describe('lc-resonance: published worked example', () => {
  it('Alexander & Sadiku ch. 14 series RLC: R = 2 Ω, L = 1 mH, C = 0.4 µF', () => {
    // ω₀ = 50 krad/s, ω₁ = 49.01 krad/s, ω₂ = 51.01 krad/s, B = 2 krad/s, Q = 25
    const r = run({ solveFor: 'f0', topology: 'series', l: 1e-3, c: 0.4e-6, rs: 2 });
    expect(r.ok).toBe(true);
    expect(res(r, 'w0')).toBeCloseTo(50e3, 6);
    expect((2 * Math.PI * res(r, 'f1')) / 1e3).toBeCloseTo(49.01, 2);
    expect((2 * Math.PI * res(r, 'f2')) / 1e3).toBeCloseTo(51.01, 2);
    expect(2 * Math.PI * res(r, 'bw')).toBeCloseTo(2000, 4);
    expect(res(r, 'q')).toBeCloseTo(25, 6);
    expect(res(r, 'qFormula')).toBeCloseTo(25, 12);
    expect(res(r, 'z0')).toBeCloseTo(50, 10);
  });
  it('series f₀ is the geometric mean of the half-power points', () => {
    const r = run({ topology: 'series', l: 3.3e-6, c: 47e-12, rs: 5 });
    expect(Math.sqrt(res(r, 'f1') * res(r, 'f2')) / res(r, 'f0')).toBeCloseTo(1, 9);
  });
});

describe('lc-resonance: parallel tank (pure-Python sweep cross-check)', () => {
  it('ideal coil + R_p: BW = 1/(2πR_pC) exactly, |Z|max = R_p', () => {
    const b = band({ l: 2.359067640321743e-3, c: 10e-9, topology: 'parallel', r: 0, rp: 100e3 });
    expect(b.bw!).toBeCloseTo(1 / (2 * Math.PI * 100e3 * 10e-9), 4);
    expect(b.peak).toBeCloseTo(100e3, 3);
  });
  it('455 kHz IF tank with coil Q = 80 (Python: f1 452165 Hz, f2 457852.6 Hz, f_r 454964 Hz, R_D 155.5 kΩ)', () => {
    const r = run({ solveFor: 'c', topology: 'parallel', f0: 455e3, l: 680e-6, rl: 24.3, rp: null });
    expect(res(r, 'f1')).toBeCloseTo(452165.1, -1);
    expect(res(r, 'f2')).toBeCloseTo(457852.6, -1);
    expect(res(r, 'fr')).toBeCloseTo(454964.4, 0);
    expect(res(r, 'zRes')).toBeCloseTo(155522.8, 0);
    expect(res(r, 'q')).toBeCloseTo(80, 1);
  });
  it('very lossy coil: peak, half-power points and f_r match a brute-force sweep', () => {
    const r = run({ solveFor: 'f0', topology: 'parallel', l: 10e-6, c: 1e-9, rl: 80, rp: null });
    expect(res(r, 'fPeak') / 1.48447e6).toBeCloseTo(1, 4);
    expect(res(r, 'f1') / 840738).toBeCloseTo(1, 4);
    expect(res(r, 'f2') / 2159361).toBeCloseTo(1, 4);
    expect(res(r, 'fr')).toBeCloseTo(f0Of(10e-6, 1e-9) * 0.6, 3);
  });
  it('no zero-phase resonance when r_L ≥ √(L/C)', () => {
    expect(parallelZeroPhase(10e-6, 1e-9, 100)).toBeNull();
    const r = run({ topology: 'parallel', l: 10e-6, c: 1e-9, rl: 150, rp: null });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/never looks purely resistive/);
    expect(JSON.stringify(r)).not.toMatch(/NaN/);
  });
});

describe('lc-resonance: solve round trips', () => {
  it('L and C solved for the f₀ of a forward run reproduce the parts', () => {
    const f0 = res(run({ solveFor: 'f0', l: 4.7e-6, c: 33e-12 }), 'f0');
    expect(res(run({ solveFor: 'l', f0, c: 33e-12, l: 1 }), 'l') / 4.7e-6).toBeCloseTo(1, 12);
    expect(res(run({ solveFor: 'c', f0, l: 4.7e-6, c: 1 }), 'c') / 33e-12).toBeCloseTo(1, 12);
  });
  it('nearest E12 capacitor and the f₀ it gives', () => {
    const r = run({ solveFor: 'c', f0: 10e6, l: 1e-6, eseries: 'E12' });
    expect(res(r, 'c')).toBeCloseTo(253.3e-12, 13);
    expect(res(r, 'cStd')).toBeCloseTo(270e-12, 18);
    expect(res(r, 'f0CStd')).toBeCloseTo(f0Of(1e-6, 270e-12), 3);
  });
});

describe('lc-resonance: edge cases', () => {
  it('lossless circuits give Q = ∞ as null, never NaN', () => {
    for (const p of [{ topology: 'series' as const, rs: 0 }, { topology: 'parallel' as const, rl: 0, rp: null }]) {
      const r = run(p);
      expect(r.ok).toBe(true);
      expect(res(r, 'q')).toBeNull();
      expect(res(r, 'bw')).toBe(0);
      expect(JSON.stringify(r)).not.toMatch(/NaN/);
      for (const g of r.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite), `${g.id}/${s.label}`).toBe(true);
    }
  });
  it('overdamped series circuit warns', () => {
    const r = run({ topology: 'series', rs: 1000 });
    expect(r.notes.join(' ')).toMatch(/overdamped/);
    expect(res(r, 'bw')).toBeCloseTo(1000 / (2 * Math.PI * 1e-6), -2);
  });
  it('zero or missing parts are input errors', () => {
    expect(() => run({ solveFor: 'f0', l: 0 })).toThrow();
    expect(() => run({ solveFor: 'l', f0: 0 })).toThrow();
    expect(() => run({ topology: 'parallel', rp: 0 })).toThrow();
  });
  it('parasitic-scale parts warn', () => {
    expect(run({ c: 1e-12 }).warnings.join(' ')).toMatch(/stray/);
    expect(run({ solveFor: 'f0', l: 1e-9, c: 1e-12 }).warnings.join(' ')).toMatch(/parasitics/);
  });
  it('every example computes', () => {
    for (const ex of def.examples ?? []) {
      const r = def.compute({ ...def.defaults(), ...structuredClone(ex.state) } as LcState);
      expect(r.ok, ex.id).toBe(true);
      expect(JSON.stringify(r), ex.id).not.toMatch(/NaN/);
    }
  });
});

describe('lc-resonance: review regressions', () => {
  it('overdamped series RLC still has a peak and BW = R/2πL; no "no peak" warning', () => {
    const r = run({ topology: 'series', l: 1e-6, c: 220e-12, rs: 200 });
    expect(r.warnings.join(' ')).not.toMatch(/no real resonant peak|no resonant maximum/);
    expect(r.notes.join(' ')).toMatch(/overdamped/);
    expect(res(r, 'bw')).toBeCloseTo(200 / (2 * Math.PI * 1e-6), -2);
  });
  it('zero-phase pull is reported without a double sign', () => {
    const r = run({ topology: 'parallel', l: 10e-6, c: 1e-9, rl: 80, rp: null });
    expect(r.notes.join(' ')).toMatch(/40\.00 % below f₀/);
    expect(r.notes.join(' ')).not.toMatch(/-40/);
  });
  it('tank without a resonant maximum reports no f₁/f₂/BW and warns', () => {
    const r = run({ topology: 'parallel', l: 10e-6, c: 1e-9, rl: 300, rp: null });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/no resonant maximum/);
    expect(res(r, 'f2')).toBeNull();
    expect(res(r, 'bw')).toBeNull();
  });
});

describe('lc-resonance: mode-switch regressions', () => {
  it('large solved L and C move to H and mF/F instead of 1e6 µH or 1e6 µF', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const a: LcState = { ...def.defaults(), solveFor: 'l', f0: 1, c: 1e-3, cUnit: 'µF' };
    runCompute(def, a as any);
    expect(a.lUnit).toBe('H');
    const b: LcState = { ...def.defaults(), solveFor: 'c', f0: 10, l: 1e-3, lUnit: 'mH' };
    runCompute(def, b as any);
    expect(['mF', 'F']).toContain(b.cUnit);
  });
});
