import { describe, expect, it } from 'vitest';
import { def, type MicrostripState } from '@/calculators/microstrip/def';
import { runCompute } from '@/core/calc/page';

type R = { results: { key: string; value: unknown }[] };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const state = (p: Partial<MicrostripState> = {}): MicrostripState => ({ ...def.defaults(), ...p });
const material = (def.fields[1] as any).fields.find((f: any) => f.key === 'material');

describe('microstrip — independent cross-check', () => {
  it('Hammerstad–Jensen Z₀ and εeff match an independent Python implementation', () => {
    // H&J 1980 with the thickness correction, written from the paper (mode-switch review, Python)
    const r = runCompute(def, state({ solveFor: 'z0', w: 3e-3, h: 1.6e-3, t: 35e-6, er: 4.4 }));
    expect(res(r, 'z0')).toBeCloseTo(50.16596, 4);
    expect(res(r, 'epsEff')).toBeCloseTo(3.300805, 5);
  });

  it('every solve option round-trips', () => {
    const fwd = runCompute(def, state({ solveFor: 'z0' }));
    const z0 = res(fwd, 'z0');
    for (const k of ['w', 'h', 'er'] as const) {
      const st = state({ solveFor: k, z0, [k]: k === 'er' ? 2 : 1e-3 });
      const r = runCompute(def, st);
      expect(r.ok, k).toBe(true);
      expect(st[k] / def.defaults()[k], k).toBeCloseTo(1, 8);
    }
  });
});

describe('microstrip — mode-switch regressions', () => {
  it('an unreachable target Z₀ is an error that names the limit, not a stale "ok" report', () => {
    // Z₀ ×10 (500 Ω) while solving W: the old page said ok, kept W = 3 mm and a round trip gave 50 Ω
    const st = state({ z0: 500 });
    const r = runCompute(def, st);
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.error).toMatch(/Z₀ = 500 Ω needs W < 100 nm on this substrate/);
    expect(r.results).toEqual([]);
    expect(r.graphs).toEqual([]);
    // H = 1 m while solving W for 50 Ω: needs a wider trace than the 1 m limit
    const wide = runCompute(def, state({ h: 1 }));
    expect(wide.ok).toBe(false);
    expect(wide.error).toMatch(/needs W > 1 m/);
    // εr target out of reach
    expect(runCompute(def, state({ solveFor: 'er', z0: 200 })).error).toMatch(/needs εr < 1 with this geometry/);
  });

  it('picking a laminate while solving εr analyses the geometry instead of bouncing back to Custom', () => {
    const st = state({ solveFor: 'er' });
    runCompute(def, st);
    st.material = 'RO4350B';
    material.apply('RO4350B', st, st);
    const r = runCompute(def, st);
    expect(r.ok).toBe(true);
    expect(st.solveFor).toBe('z0');
    expect(st.material).toBe('RO4350B');
    expect(st.er).toBe(3.66);
    expect(st.tanD).toBe(0.0037);
    // and when εr is not the unknown the preset leaves the solve alone
    const w = state();
    w.material = 'RO4350B';
    material.apply('RO4350B', w, w);
    expect(w.solveFor).toBe('w');
  });
});
