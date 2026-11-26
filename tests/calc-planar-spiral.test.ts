import { describe, expect, it } from 'vitest';
import { def, type SpiralState } from '@/calculators/planar-spiral/def';
import { innerDiameter, lMonomial, lSheet, lWheeler, perimeter, skinFactor, type Shape } from '@/calculators/planar-spiral/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<SpiralState>) => def.compute({ ...def.defaults(), ...p });

describe('planar spiral — Mohan et al. 1999, Table IV (published worked examples)', () => {
  // [#, sides, n, d_out µm, w µm, s µm, L_meas nH, e_whe %, e_gmd %, e_mon %], e = (L_meas − L)/L_meas
  const ROWS: [number, Shape, number, number, number, number, number, number, number, number][] = [
    [1, 'square', 2.75, 344, 29.7, 1.9, 3.2, 5.2, 6.4, 3.6],
    [2, 'square', 3.75, 292, 13.0, 1.9, 6.0, -1.2, -0.7, -0.4],
    [7, 'square', 9.5, 153, 1.8, 1.9, 18.2, 0.8, 1.9, 2.7],
    [9, 'square', 2.75, 307, 18.3, 18.0, 2.9, 13.5, 14.6, 12.4],
    [16, 'square', 12, 180, 3.2, 2.1, 20.5, -1.0, -0.4, 3.9],
    [51, 'square', 3, 700, 90, 6, 3.7, -4.9, -5.4, -6.7],
    [55, 'octagonal', 4, 346, 18, 2, 5.9, -1.1, -1.6, -3.6],
    [56, 'octagonal', 5, 346, 18, 2, 7.5, 2.7, 0.7, 0.3],
    [57, 'octagonal', 4, 326, 8, 12, 5.6, -7.7, -7.8, -11.8],
  ];
  it('reproduces the tabulated errors of all three expressions (to the table’s rounding)', () => {
    for (const [id, shape, n, d, w, s, lm, ew, eg, em] of ROWS) {
      const g = { shape, n, dout: d * 1e-6, w: w * 1e-6, s: s * 1e-6 };
      const e = (L: number) => (100 * (lm * 1e-9 - L)) / (lm * 1e-9);
      expect(Math.abs(e(lMonomial(g)) - em), `#${id} monomial`).toBeLessThan(0.15);
      expect(Math.abs(e(lWheeler(g)) - ew), `#${id} Wheeler`).toBeLessThan(0.3);
      expect(Math.abs(e(lSheet(g)) - eg), `#${id} current sheet`).toBeLessThan(0.3);
    }
  });
  it('d_in = d_out − 2n·w − 2(n − 1)·s (the definition that reproduces Table IV)', () => {
    expect(innerDiameter({ shape: 'square', n: 2.75, dout: 344e-6, w: 29.7e-6, s: 1.9e-6 })).toBeCloseTo(344e-6 - 2 * 2.75 * 29.7e-6 - 2 * 1.75 * 1.9e-6, 15);
  });
});

describe('planar spiral — independent Python references', () => {
  it('matches ps_ref() in ref.py (Mohan, mean-perimeter length, IEC copper, Yue–Wong skin factor)', () => {
    const a = run({ solveFor: 'l', n: 6, dout: 25e-3, w: 0.5e-3, s: 0.3e-3, t: 35e-6, f: 13.56e6, shape: 'square', expr: 'sheet' });
    expect(res(a, 'l') / 1.348383111509233e-6).toBeCloseTo(1, 12);
    expect(res(a, 'lWheeler') / 1.3532255313759257e-6).toBeCloseTo(1, 12);
    expect(res(a, 'lMono') / 1.4133960328296168e-6).toBeCloseTo(1, 12);
    expect(res(a, 'rdc')).toBeCloseTo(0.4901477832512316, 12);
    expect(res(a, 'rac')).toBeCloseTo(1.1144273886981195, 12);
    expect(res(a, 'q')).toBeCloseTo(103.08633160902465, 9);
    expect(res(a, 'fcrowd') / 618907.7224044554).toBeCloseTo(1, 12);
    const b = run({ solveFor: 'l', n: 4, dout: 40e-3, w: 1.5e-3, s: 0.5e-3, t: 70e-6, f: 6.78e6, shape: 'hexagonal', expr: 'wheeler' });
    expect(res(b, 'l') / 8.092002877367006e-7).toBeCloseTo(1, 12);
    expect(res(b, 'q')).toBeCloseTo(154.6964258318988, 9);
    const c = run({ solveFor: 'l', n: 8, dout: 20e-3, w: 0.3e-3, s: 0.2e-3, t: 35e-6, f: 1e6, shape: 'circular', expr: 'sheet' });
    expect(res(c, 'l') / 1.5381659997968485e-6).toBeCloseTo(1, 12);
    expect(res(c, 'rdc')).toBeCloseTo(0.6757806369544126, 12);
    expect(res(c, 'lWheeler')).toBeNull();
  });
});

describe('planar spiral — solve-for', () => {
  it('n and d_out round-trip to 1e-9 for every shape and expression', () => {
    for (const shape of ['square', 'hexagonal', 'octagonal', 'circular'] as Shape[])
      for (const expr of ['sheet', 'wheeler', 'monomial'] as const) {
        if (shape === 'circular' && expr !== 'sheet') continue;
        for (const p of [
          { n: 3, dout: 10e-3, w: 0.3e-3, s: 0.2e-3 },
          { n: 7.5, dout: 30e-3, w: 0.4e-3, s: 0.4e-3 },
          { n: 2.25, dout: 300e-6, w: 10e-6, s: 3e-6 },
        ]) {
          const a = run({ ...p, shape, expr, solveFor: 'l' });
          const L = res(a, 'l');
          const b = run({ ...p, shape, expr, solveFor: 'n', l: L, n: 1.3 });
          expect(b.ok, b.error).toBe(true);
          expect(res(b, 'n') / p.n).toBeCloseTo(1, 7);
          const c = run({ ...p, shape, expr, solveFor: 'dout', l: L, dout: 1e-3 });
          expect(c.ok, c.error).toBe(true);
          expect(res(c, 'dout') / p.dout).toBeCloseTo(1, 7);
          expect(res(c, 'l') / L).toBeCloseTo(1, 9);
        }
      }
  });
  it('unreachable targets say why (too many turns / below one turn)', () => {
    const a = run({ solveFor: 'n', l: 1e-3 });
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/more turns than fit/);
    const b = run({ solveFor: 'n', l: 1e-12 });
    expect(b.ok).toBe(false);
    expect(b.error).toMatch(/below one turn/);
    const c = run({ solveFor: 'l', n: 40 });
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/do not fit/);
  });
});

describe('planar spiral — physics', () => {
  it('Wheeler and current sheet are scale-free; the monomial is not (exponents sum ≈ 1.01)', () => {
    const g = { shape: 'square' as const, n: 5, dout: 300e-6, w: 15e-6, s: 5e-6 };
    const g100 = { ...g, dout: g.dout * 100, w: g.w * 100, s: g.s * 100 };
    expect(lWheeler(g100) / lWheeler(g)).toBeCloseTo(100, 9);
    expect(lSheet(g100) / lSheet(g)).toBeCloseTo(100, 9);
    expect(lMonomial(g100) / lMonomial(g) / 100).toBeCloseTo(100 ** 0.013, 9);
  });
  it('L grows with n (fixed d_out) and with d_out (fixed n); R_dc ∝ 1/t; skin factor → 1 at DC, ≈ t/δ when thick', () => {
    let prev = 0;
    // (inside Mohan's range d_in ≥ 0.1·d_out; L peaks and dips slightly as the coil fills right to the centre)
    for (let n = 1; innerDiameter({ shape: 'square', n, dout: 25e-3, w: 0.5e-3, s: 0.3e-3 }) >= 2.5e-3; n += 0.5) {
      const L = lSheet({ shape: 'square', n, dout: 25e-3, w: 0.5e-3, s: 0.3e-3 });
      expect(L).toBeGreaterThan(prev);
      prev = L;
    }
    const r1 = res(run({ solveFor: 'l', t: 35e-6 }), 'rdc');
    const r2 = res(run({ solveFor: 'l', t: 70e-6 }), 'rdc');
    expect(r1 / r2).toBeCloseTo(2, 12);
    expect(skinFactor(35e-6, 1)).toBeCloseTo(1, 3);
    expect(skinFactor(35e-6, 0)).toBe(1);
    expect(skinFactor(1e-3, 1e9) / (1e-3 / Math.sqrt(1 / 58e6 / (Math.PI * 1e9 * 1.25663706212e-6)))).toBeCloseTo(1, 6);
    expect(perimeter('square', 1)).toBeCloseTo(4, 12);
    expect(perimeter('circular', 1)).toBeCloseTo(Math.PI, 12);
    expect(perimeter('octagonal', 1)).toBeCloseTo(8 * Math.tan(Math.PI / 8), 12);
  });
  it('the three expressions agree within a few % in the validated range', () => {
    const r = run({ solveFor: 'l' });
    expect(Math.abs(res(r, 'lWheeler') / res(r, 'lSheet') - 1)).toBeLessThan(0.03);
  });
  it('warnings at the published limits: s > 3w, d_in < 0.1 d_out, monomial at PCB size, crowding, λ/10, n < 2', () => {
    expect(run({ solveFor: 'l', s: 1.6e-3, w: 0.5e-3, n: 3 }).warnings.join(' ')).toMatch(/above 3w/);
    expect(run({ solveFor: 'l', n: 15 }).warnings.join(' ')).toMatch(/below 0\.1/);
    expect(run({ solveFor: 'l', expr: 'monomial' }).warnings.join(' ')).toMatch(/fitted to on-chip/);
    expect(run({ solveFor: 'l' }).warnings.join(' ')).toMatch(/current-crowding/);
    expect(run({ solveFor: 'l', f: 1e9 }).warnings.join(' ')).toMatch(/λ\/10/);
    expect(run({ solveFor: 'l', n: 1.5 }).warnings.join(' ')).toMatch(/Fewer than 2 turns/);
    expect(run({ solveFor: 'l', n: 2.75, dout: 344e-6, w: 29.7e-6, s: 1.9e-6, expr: 'monomial', f: 1e8 }).warnings.join(' ')).not.toMatch(/fitted to on-chip/);
  });
  it('a circular coil always uses the current sheet (no circular Wheeler / monomial coefficients)', () => {
    const r = runCompute(def, { ...def.defaults(), shape: 'circular', expr: 'monomial', solveFor: 'l' });
    expect(r.ok).toBe(true);
    expect(res(r, 'l')).toBe(res(r, 'lSheet'));
  });
});

// ── fuzz over the field spec, through runCompute
type Num = { key: string; min: number; max: number };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity/;

describe('planar spiral — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite or null results; clean strings; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 4242;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const st: Record<string, unknown> = { ...def.defaults() };
      for (const f of nums) st[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      for (const f of sels) st[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      // half the states with geometry that fits (the raw field ranges rarely give a spiral that fits)
      if (i % 2) {
        st.w = 0.05e-3 * 40 ** rnd();
        st.s = (st.w as number) * (0.2 + 3 * rnd());
        st.n = 1 + 12 * rnd();
        st.dout = (2 * (st.n as number) * (st.w as number) + 2 * ((st.n as number) - 1) * (st.s as number)) / (0.1 + 0.85 * rnd());
      }
      st.solveFor = def.solve!.options[i % 3].key;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y), `${g.id}/${s.label}`).toBe(true);
      for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(v).not.toMatch(BAD);
      const again = runCompute(def, { ...st });
      expect(again.ok, again.error).toBe(true);
      expect(res(again, 'l') / res(r, 'l')).toBeCloseTo(1, 7);
    }
    expect(ok).toBeGreaterThan(150);
  });
});

describe('planar spiral — examples', () => {
  it('first example equals the defaults; every example computes; fast', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    const t0 = performance.now();
    for (const ex of def.examples!) {
      const r = run(ex.state);
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.graphs.length).toBe(2);
    }
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
    // Mohan #1 measured 3.20 nH; the monomial is 3.6 % low
    const m1 = run(def.examples!.find((e) => e.id === 'mohan-1')!.state);
    expect((3.2e-9 - res(m1, 'l')) / 3.2e-9).toBeCloseTo(0.036, 3);
  });
});
