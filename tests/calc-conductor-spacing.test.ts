import { describe, expect, it } from 'vitest';
import { CONDITIONS, def, type SpacingState } from '@/calculators/conductor-spacing/def';
import { BAND_MAX, COLUMNS, PER_VOLT, TABLE, maxVoltage, minSpacing } from '@/calculators/conductor-spacing/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const state = (p: Partial<SpacingState> = {}): SpacingState => ({ ...def.defaults(), ...p });
const MM = 1e-3;

describe('conductor spacing — IPC-2221B Table 6-1 transcription', () => {
  it('every cell equals the Altair PollEx copy of Table 6-1 (B1–B4, A5–A7, mm and mm/V)', () => {
    // python3 check_all.py: the same table typed in independently; columns 0–15 … 301–500 V, then per volt
    const ref: Record<string, number[]> = {
      B1: [0.05, 0.05, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0.25, 0.0025],
      B2: [0.1, 0.1, 0.6, 0.6, 0.6, 1.25, 1.25, 1.25, 2.5, 0.005],
      B3: [0.1, 0.1, 0.6, 1.5, 3.2, 3.2, 6.4, 12.5, 12.5, 0.025],
      B4: [0.05, 0.05, 0.13, 0.13, 0.4, 0.4, 0.4, 0.4, 0.8, 0.00305],
      A5: [0.13, 0.13, 0.13, 0.13, 0.4, 0.4, 0.4, 0.4, 0.8, 0.00305],
      A6: [0.13, 0.25, 0.4, 0.5, 0.8, 0.8, 0.8, 0.8, 1.5, 0.00305],
      A7: [0.13, 0.13, 0.13, 0.13, 0.4, 0.4, 0.4, 0.8, 0.8, 0.00305],
    };
    for (const c of COLUMNS) {
      expect(TABLE[c].map((x) => +(x / MM).toPrecision(6)), c).toEqual(ref[c].slice(0, 9));
      expect(+(PER_VOLT[c] / MM).toPrecision(6), c).toBe(ref[c][9]);
    }
    expect(BAND_MAX).toEqual([15, 30, 50, 100, 150, 170, 250, 300, 500]);
  });
  it('cross-check copies: Sierra Circuits differs in two cells (B3 151–170 V: 6.4, B1 > 500 V: 0.025); the majority value is used', () => {
    // Altair table + Altair worked example + KiCad pcb_calculator agree on 3.2 mm and 0.0025 mm/V
    expect(minSpacing('B3', 160) / MM).toBeCloseTo(3.2, 12);
    expect(PER_VOLT.B1 / MM).toBeCloseTo(0.0025, 12);
  });
  it('Altair worked example: B1 at 600 V → 0.25 mm + 100 V × 0.0025 mm/V = 0.50 mm', () => {
    const r = runCompute(def, state({ solveFor: 'd', v: 600, cond: 'B1' }));
    expect(res(r, 'd') / MM).toBeCloseTo(0.5, 12);
  });
  it('columns never decrease with voltage (the table is a staircase) and are continuous at 500 V', () => {
    for (const c of COLUMNS) {
      for (let i = 1; i < 9; i++) expect(TABLE[c][i]).toBeGreaterThanOrEqual(TABLE[c][i - 1]);
      expect(minSpacing(c, 500 + 1e-9) - minSpacing(c, 500)).toBeLessThan(1e-12);
    }
    // above 30 V, coated and internal never need more than bare external at altitude (at low voltage the
    // conformal-coat columns' 0.13 mm floor is larger than B3's 0.1 mm)
    for (const v of [40, 80, 120, 160, 200, 280, 400, 800, 3000]) for (const c of ['B1', 'B4', 'A5', 'A7'] as const) expect(minSpacing(c, v)).toBeLessThanOrEqual(minSpacing('B3', v));
  });
});

describe('conductor spacing — Python reference values (check_all.py)', () => {
  it('reproduces independent values', () => {
    expect(res(runCompute(def, state({ v: 230, vKind: 'rms', cond: 'B2' })), 'd')).toBeCloseTo(2.5e-3, 15); // 325 V peak → 301–500 V
    expect(res(runCompute(def, state({ v: 48, cond: 'B4' })), 'd')).toBeCloseTo(0.13e-3, 15);
    expect(res(runCompute(def, state({ solveFor: 'v', d: 1e-3, cond: 'B2', alt: 10e3 })), 'v')).toBe(50); // B3
    expect(res(runCompute(def, state({ solveFor: 'v', d: 0.5e-3, cond: 'A7' })), 'v')).toBe(250);
    expect(res(runCompute(def, state({ solveFor: 'v', d: 5e-3, cond: 'B2' })), 'v')).toBeCloseTo(500 + 2.5 / 0.005, 9); // 1000 V
  });
});

describe('conductor spacing — solve round trips', () => {
  it('max voltage satisfies the table, 1 V more does not (below 500 V), and the >500 V rule inverts exactly', () => {
    for (const c of CONDITIONS.map((x) => x.value))
      for (const d of [0.06e-3, 0.13e-3, 0.45e-3, 0.8e-3, 1.3e-3, 3e-3, 20e-3]) {
        const st = state({ solveFor: 'v', d, cond: c });
        const r = runCompute(def, st);
        if (!r.ok) {
          expect(r.error).toMatch(/below the smallest/);
          continue;
        }
        const back = runCompute(def, state({ solveFor: 'd', v: st.v, cond: c }));
        expect(res(back, 'd')).toBeLessThanOrEqual(d * (1 + 1e-12));
        if (st.v < 500) expect(minSpacing(c === 'B2' ? 'B2' : c, st.v + 1)).toBeGreaterThan(d);
        else expect(res(back, 'd') / d).toBeCloseTo(1, 9);
      }
  });
  it('RMS entry: V_max shown as RMS, √2 below the peak', () => {
    const pk = runCompute(def, state({ solveFor: 'v', d: 3e-3, cond: 'B2', vKind: 'peak' }));
    const rms = runCompute(def, state({ solveFor: 'v', d: 3e-3, cond: 'B2', vKind: 'rms' }));
    expect(res(rms, 'v') * Math.SQRT2).toBeCloseTo(res(pk, 'v'), 9);
  });
});

describe('conductor spacing — validity and conditions', () => {
  it('B2 becomes B3 above 3050 m; coated columns ignore altitude (with a note)', () => {
    expect(res(runCompute(def, state({ v: 120, alt: 3050 })), 'd')).toBeCloseTo(0.6e-3, 15);
    expect(res(runCompute(def, state({ v: 120, alt: 3051 })), 'd')).toBeCloseTo(3.2e-3, 15);
    const coated = runCompute(def, state({ v: 120, cond: 'B4', alt: 5000 }));
    expect(res(coated, 'd')).toBeCloseTo(0.4e-3, 15);
    expect(coated.notes.join(' ')).toMatch(/any elevation/);
  });
  it('uncoated leads above 3050 m warn and use the larger of A6 and B3', () => {
    const r = runCompute(def, state({ v: 20, cond: 'A6', alt: 4000 }));
    expect(r.warnings.join(' ')).toMatch(/no spacing for uncoated component leads above 3050 m/);
    expect(res(r, 'd')).toBeCloseTo(0.25e-3, 15); // A6 0.25 > B3 0.1 at 16–30 V
    expect(res(runCompute(def, state({ v: 120, cond: 'A6', alt: 4000 })), 'd')).toBeCloseTo(3.2e-3, 15);
  });
  it('a gap below the smallest table value has no voltage (NO SOLUTION)', () => {
    const r = runCompute(def, state({ solveFor: 'v', d: 0.04e-3, cond: 'B1' }));
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('NO SOLUTION');
  });
  it('band edges: 15 V is in 0–15 V, 15.5 V needs the 16–30 V value', () => {
    expect(minSpacing('A6', 15)).toBeCloseTo(0.13e-3, 15);
    expect(minSpacing('A6', 15.5)).toBeCloseTo(0.25e-3, 15);
    expect(maxVoltage('A6', 0.13e-3)).toBe(15);
  });
});

describe('conductor spacing — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(runCompute(def, { ...def.defaults(), ...ex.state }).ok, ex.id).toBe(true);
  });
  it('400 random states: never throws, finite values, clean text, stable recompute', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const st = state({ solveFor: pick(['d', 'v']), v: rnd() < 0.1 ? pick([0, 1e6]) : 10 ** (rnd() * 5), vKind: pick(['peak', 'rms']), d: rnd() < 0.1 ? pick([1e-6, 30]) : 10 ** (-4.5 + rnd() * 3), cond: pick(CONDITIONS.map((c) => c.value)), alt: pick([0, 3050, 3051, 30e3, rnd() * 3e4]) });
      const r = runCompute(def, st);
      const txt = JSON.stringify([r.results.map((x) => x.display), r.warnings, r.notes, r.summary, r.tables.map((t) => t.display)]);
      expect(txt).not.toMatch(/NaN|undefined|Infinity|\[object/);
      if (!r.ok) {
        expect(st.solveFor).toBe('v');
        continue;
      }
      ok++;
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value)).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y)).toBe(true);
      expect(st.v).toBeGreaterThanOrEqual(0);
      expect(st.v).toBeLessThanOrEqual(1e6);
      expect(st.d).toBeLessThanOrEqual(50);
      const again = runCompute(def, { ...st });
      expect(again.results.map((x) => x.value)).toEqual(r.results.map((x) => x.value));
    }
    expect(ok).toBeGreaterThan(300);
  });
});
