import { describe, expect, it, vi } from 'vitest';
import { runCompute } from '@/core/calc/page';
import { def, type RcdState } from '@/calculators/rcd-clamp/def';
import { clampForR, clampOp, clampWave, rForClamp } from '@/calculators/rcd-clamp/model';
import { def as flyback } from '@/calculators/flyback-converter/def';

const val = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<RcdState>) => def.compute({ ...def.defaults(), ...p });
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('RCD clamp — AN-4147 equations, Python reference (pb2/ref.py)', () => {
  it('default: R = V²/P, C = V/(ΔV·R·f), V_DS = V_in,max + V_clamp', () => {
    const r = run({});
    expect(rel(val(r, 'r'), 3228.1431090954898)).toBeLessThan(1e-12);
    expect(rel(val(r, 'c'), 3.0977560975609756e-8)).toBeLessThan(1e-12);
    expect(rel(val(r, 'p'), 0.7744390243902439)).toBeLessThan(1e-12);
    expect(rel(val(r, 'ts'), 6.146341463414634e-8)).toBeLessThan(1e-12);
    expect(val(r, 'vds')).toBeCloseTo(122, 12);
  });
  it('analysis: a 10 kΩ resistor settles the clamp at 73.0 V (Python bisection)', () => {
    const r = run({ solveFor: 'vclamp', r: 10e3 });
    expect(rel(val(r, 'vclamp'), 72.99742483578137)).toBeLessThan(1e-12);
    expect(rel(val(r, 'p'), 0.532862403265555)).toBeLessThan(1e-11);
  });
  it('independent check of the factor: charge into C over t_s times V_clamp equals the clamp power', () => {
    const p = { llk: 2e-6, ipk: 3, fsw: 100e3, vor: 40 };
    const op = clampOp(p, 90, rForClamp(p, 90));
    const w = clampWave(p, op, 1e-6);
    let q = 0;
    for (let k = 1; k < w.t.length; k++) q += ((w.i[k] + w.i[k - 1]) / 2) * (w.t[k] - w.t[k - 1]);
    expect(rel(q * 90 * p.fsw, op.p)).toBeLessThan(1e-9);
    expect(op.p).toBeCloseTo(0.5 * 2e-6 * 9 * 100e3 * (90 / 50), 12);
    // the waveform’s peak-to-peak equals the design ripple V/(R·C·f)
    expect(rel(Math.max(...w.v) - Math.min(...w.v), 90 / (op.r * 1e-6 * p.fsw))).toBeLessThan(1e-9);
  });
  it('uses the Flyback page’s numbers: its default clamp loss matches', () => {
    const f = flyback.compute(flyback.defaults());
    const d = f.details as any;
    const r = run({ vor: d.lo.vor, ipk: d.lo.ipPk, vclamp: d.vclamp });
    expect(rel(val(r, 'p'), d.pClamp)).toBeLessThan(1e-12);
  });
});

describe('RCD clamp — round trips and physics', () => {
  it('R ↔ V_clamp at several points', () => {
    for (const vc of [31, 45, 59, 120, 400]) {
      const a = run({ vclamp: vc });
      const b = run({ solveFor: 'vclamp', r: val(a, 'r') });
      expect(rel(val(b, 'vclamp'), vc)).toBeLessThan(1e-9);
    }
    const p = { llk: 1e-6, ipk: 5, fsw: 100e3, vor: 40 };
    expect(clampForR(p, rForClamp(p, 80))).toBeCloseTo(80, 10);
  });
  it('loss falls and drain stress rises monotonically with V_clamp; loss → ½LI²f as V_clamp → ∞', () => {
    const vs = [31, 40, 60, 100, 200];
    const ps = vs.map((v) => val(run({ vclamp: v }), 'p'));
    for (let k = 1; k < ps.length; k++) expect(ps[k]).toBeLessThan(ps[k - 1]);
    const far = run({ vclamp: 4000 });
    expect(rel(val(far, 'p'), 0.5 * 0.5e-6 * 2.52 ** 2 * 200e3)).toBeLessThan(0.0075); // factor 4000/3970.5
  });
});

describe('RCD clamp — warnings, errors, table', () => {
  it('tight clamp and high loss (example)', () => {
    const r = run(def.examples!.find((e) => e.id === 'tight')!.state);
    expect(r.warnings.some((w) => w.startsWith('V_clamp is only'))).toBe(true);
    expect(r.warnings.some((w) => w.startsWith('Clamp loss'))).toBe(true);
  });
  it('over the derated rating, over V_DSS, no room for a clamp, long reset', () => {
    expect(run({ solveFor: 'vclamp', r: 10e3 }).warnings.some((w) => w.includes('above the 90 % allowed'))).toBe(true);
    expect(run({ vclamp: 100 }).warnings.some((w) => w.includes('avalanche'))).toBe(true);
    expect(run({ vinMax: 120 }).warnings.some((w) => w.includes('no room for a clamp'))).toBe(true);
    expect(run({ llk: 50e-6, vclamp: 31 }).warnings.some((w) => w.startsWith('Leakage reset'))).toBe(true);
  });
  it('V_clamp ≤ V_OR is an input error', () => {
    expect(() => run({ vclamp: 29 })).toThrow(/must exceed V_OR/);
  });
  it('candidate table: preferred values around R, a larger R gives a higher clamp', () => {
    const t = run({ vdss: 135 }).tables[0];
    const rows = t.rows as any[];
    expect(rows.length).toBe(6);
    for (let k = 1; k < rows.length; k++) expect(rows[k].vclamp).toBeGreaterThan(rows[k - 1].vclamp);
    expect(t.rowTones!.length).toBe(6);
    expect(t.rowTones).toEqual(['pass', 'pass', 'pass', 'fail', 'fail', 'fail']); // 3.3 kΩ and up push V_DS past 90 % of 135 V
  });
});

describe('RCD clamp — examples', () => {
  it('first example equals the defaults', () => {
    expect({ ...def.defaults(), ...def.examples![0].state }).toEqual(def.defaults());
  });
  for (const e of def.examples ?? []) {
    it(`computes: ${e.label}`, () => {
      const r = run(e.state);
      expect(r.ok).toBe(true);
      expect(r.status?.tone).not.toBe('fail');
      expect(r.graphs.length).toBe(2);
    });
  }
});

describe('RCD clamp — fuzz through runCompute', () => {
  it('400 random states', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let seed = 777;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const lu = (a: number, b: number) => a * (b / a) ** rnd();
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const vor = lu(0.01, 2000);
      const st: any = {
        ...def.defaults(),
        solveFor: i % 2 ? 'r' : 'vclamp',
        vinMax: 2000 * rnd(), vor, llk: lu(1e-9, 0.1), ipk: lu(1e-3, 1000), fsw: lu(1, 10e6), pout: lu(1e-3, 1e5),
        vclamp: Math.min(5000, vor * lu(1.001, 20)), r: lu(1e-3, 1e9), ripplePct: lu(0.1, 50), series: ['E12', 'E24', 'E48', 'E96'][i % 4],
        vdss: lu(1, 5000), deratePct: 10 + 90 * rnd(), vfD: 5 * rnd(),
      };
      const r = runCompute(def, st);
      expect(r.ok).toBe(true);
      if (r.status?.text === 'NO SOLUTION') continue;
      ok++;
      for (const x of r.results) {
        if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
        expect(`${x.display} ${x.note ?? ''}`).not.toMatch(/NaN|undefined|Infinity|\[object/);
      }
      for (const t of r.tables) for (const row of t.display ?? []) expect(Object.values(row).join(' ')).not.toMatch(/NaN|undefined|Infinity/);
      expect(r.graphs.length).toBeGreaterThan(0);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of [...s.x, ...s.y]) expect(Number.isFinite(y)).toBe(true);
      const again = runCompute(def, { ...st });
      expect(rel(val(again, 'vclamp'), val(r, 'vclamp'))).toBeLessThan(1e-9);
    }
    spy.mockRestore();
    expect(ok).toBeGreaterThan(300);
  });
});
