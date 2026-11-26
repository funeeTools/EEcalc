import { describe, expect, it } from 'vitest';
import { def, type TraceLState } from '@/calculators/trace-inductance/def';
import { MU0, amdRect, groverL, hammerstad75LPer, lnGmdRect, microstripLPer, partialSelfL, plateLPer } from '@/calculators/trace-inductance/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const state = (p: Partial<TraceLState> = {}): TraceLState => ({ ...def.defaults(), ...p });

describe('trace inductance — independent references', () => {
  it('partial self-inductance equals the Hoer–Love closed form (Python, 60-digit Decimal) to ~1e-12', () => {
    // python3 ti_ref.py: Hoer & Love (1965) exact rectangular-bar formula in Decimal arithmetic
    expect(partialSelfL(0.5e-3, 35e-6, 20e-3) / 1.9283895751469346e-8).toBeCloseTo(1, 11);
    expect(partialSelfL(1e-3, 1e-3, 0.1) / 1.0217219624672933e-7).toBeCloseTo(1, 11);
    expect(partialSelfL(10e-3, 35e-6, 0.1e-3) / 1.0999155971338914e-12).toBeCloseTo(1, 10); // a plate 100× wider than long
    expect(partialSelfL(0.2e-3, 18e-6, 5e-3) / 4.337278832120807e-9).toBeCloseTo(1, 11);
  });
  it('loop inductance over a plane equals Z₀,air/c of Hammerstad–Jensen (Python)', () => {
    expect(microstripLPer(0.5e-3, 0.2e-3, 35e-6) * 20e-3 / 4.938219809118697e-9).toBeCloseTo(1, 12);
    expect(microstripLPer(3e-3, 0.1e-3, 10e-6) * 0.05 / 1.861616790711761e-9).toBeCloseTo(1, 12);
  });
  it('Maxwell’s GMD and the mean distance of a rectangle: square 0.44705a / 0.5214a, thin strip 0.2231a / a/3', () => {
    expect(Math.exp(lnGmdRect(1, 1))).toBeCloseTo(0.447049, 5);
    expect(Math.exp(lnGmdRect(1, 1e-9))).toBeCloseTo(Math.exp(-1.5), 6);
    expect(amdRect(1, 1)).toBeCloseTo(0.521405433, 8);
    expect(amdRect(1, 1e-9)).toBeCloseTo(1 / 3, 8);
  });
});

describe('trace inductance — published forms and limits', () => {
  it('long thin trace → Grover’s bar formula (ℓ ≫ W + T), within 1e-3 at ℓ = 200 (W+T) (Grover rounds the GMD to 0.2235(W+T))', () => {
    for (const [w, t] of [[0.2e-3, 35e-6], [1e-3, 1e-3], [2e-3, 18e-6]]) {
      const l = 200 * (w + t);
      expect(Math.abs(partialSelfL(w, t, l) / groverL(w, t, l) - 1)).toBeLessThan(1e-3);
    }
  });
  it('Hammerstad 1975 two-branch formula (published ±1 %) agrees with H&J 1980 for thin copper', () => {
    for (const u of [0.1, 0.3, 1, 2, 5, 20]) {
      const h = 0.2e-3;
      expect(Math.abs(hammerstad75LPer(u * h, h) / microstripLPer(u * h, h, 1e-9) - 1), `u=${u}`).toBeLessThan(0.01);
    }
  });
  it('very wide strip over a plane → parallel-plate μ₀H/W (fringing vanishes)', () => {
    const r = microstripLPer(100e-3, 0.1e-3, 1e-9) / plateLPer(100e-3, 0.1e-3);
    expect(r).toBeGreaterThan(0.98);
    expect(r).toBeLessThan(1);
  });
  it('monotonic: L grows with length (faster than linear) and falls with width; a plane always lowers L', () => {
    const a = partialSelfL(0.3e-3, 35e-6, 10e-3);
    const b = partialSelfL(0.3e-3, 35e-6, 20e-3);
    expect(b / a).toBeGreaterThan(2);
    expect(partialSelfL(0.6e-3, 35e-6, 10e-3)).toBeLessThan(a);
    for (const h of [0.05e-3, 0.2e-3, 1e-3]) expect(microstripLPer(0.3e-3, h, 35e-6) * 10e-3).toBeLessThan(a);
  });
  it('dimensions: L/ℓ of a filament scale is μ₀/2π per log unit', () => {
    const l1 = partialSelfL(0.1e-3, 0.1e-3, 0.1);
    const l2 = partialSelfL(0.1e-3, 0.1e-3, 0.1 * Math.E);
    // L(eℓ) − e·L(ℓ) = μ₀/2π · eℓ (ln e) for ℓ ≫ cross-section (up to the (1 − e)·mean-distance term, ~3e-4 here)
    expect((l2 - Math.E * l1) / ((MU0 / (2 * Math.PI)) * 0.1 * Math.E)).toBeCloseTo(1, 2);
  });
});

describe('trace inductance — solve round trips', () => {
  it('length and width for a target L reproduce it (both return paths)', () => {
    for (const topo of ['free', 'plane'] as const)
      for (const L of [2e-9, 8e-9, 40e-9]) {
        for (const key of ['len', 'w'] as const) {
          const st = state({ topo, solveFor: key, L, len: 20e-3, w: 0.5e-3, h: 0.2e-3 });
          const r = runCompute(def, st);
          if (!r.ok) {
            expect(r.error).toMatch(/No (length|width)/);
            continue;
          }
          const back = runCompute(def, { ...st, solveFor: 'L' });
          expect(res(back, 'L') / L, `${topo} ${key} ${L}`).toBeCloseTo(1, 7);
        }
      }
  });
  it('over a plane the longest trace is exactly L / L′', () => {
    const st = state({ topo: 'plane', solveFor: 'len', L: 5e-9, w: 0.2e-3, h: 0.2e-3 });
    runCompute(def, st);
    expect(st.len).toBeCloseTo(5e-9 / microstripLPer(0.2e-3, 0.2e-3, 35e-6), 12);
  });
  it('switching the return path while solving goes back to the analysis (partial and loop L are different targets)', () => {
    const st = state({ solveFor: 'w', L: 8e-9, len: 10e-3 });
    runCompute(def, st);
    const f = (def.fields[0] as any).fields.find((x: any) => x.key === 'topo');
    st.topo = 'plane';
    f.apply('plane', st, st);
    expect(st.solveFor).toBe('L');
    expect(runCompute(def, st).ok).toBe(true);
  });
  it('an unreachable target is NO SOLUTION and names the limit', () => {
    const r = runCompute(def, state({ solveFor: 'w', L: 1e-6, len: 1e-3 }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/even W = 1 µm has only/);
  });
});

describe('trace inductance — validity warnings', () => {
  it('W/H outside the H&J range, short loop and thick copper all warn', () => {
    expect(runCompute(def, state({ topo: 'plane', w: 5e-3, h: 20e-6 })).warnings.join(' ')).toMatch(/outside 0.01–100/);
    expect(runCompute(def, state({ topo: 'plane', len: 0.5e-3, h: 0.2e-3 })).warnings.join(' ')).toMatch(/less than 5 H/);
    expect(runCompute(def, state({ topo: 'plane', h: 0.1e-3, t: 35e-6 })).warnings.join(' ')).toMatch(/T\/H = 0.35/);
    expect(runCompute(def, state({ len: 0.5e-3, w: 1e-3 })).notes.join(' ')).toMatch(/Grover’s approximation assumes/);
  });
});

describe('trace inductance — examples and fuzz', () => {
  it('every example computes; the first equals the defaults; default L is the stored value', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(runCompute(def, { ...def.defaults(), ...ex.state }).ok, ex.id).toBe(true);
    expect(res(runCompute(def, state()), 'L') / def.defaults().L).toBeCloseTo(1, 3);
  });
  it('320 random states through runCompute: no throw, finite, clean text, stable', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const lg = (a: number, b: number) => a * (b / a) ** rnd();
    let ok = 0;
    for (let i = 0; i < 320; i++) {
      const st = state({ solveFor: pick(['L', 'len', 'w']), topo: pick(['free', 'plane']), L: lg(1e-12, 1e-6), len: lg(1e-6, 10), w: lg(1e-6, 1), t: lg(1e-7, 1e-3), h: lg(1e-6, 0.1), f: lg(1, 1e12) });
      const r = runCompute(def, st);
      const txt = JSON.stringify([r.results.map((x) => x.display), r.warnings, r.notes, r.summary, r.error ?? '']);
      expect(txt).not.toMatch(/NaN|undefined|Infinity|\[object/);
      if (!r.ok) {
        expect(st.solveFor).not.toBe('L');
        continue;
      }
      ok++;
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value)).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y)).toBe(true);
      const again = runCompute(def, { ...st });
      const a = again.results.map((x) => x.value as number);
      r.results.forEach((x, j) => expect(a[j] / (x.value as number)).toBeCloseTo(1, 6));
    }
    expect(ok).toBeGreaterThan(200);
  });
});
