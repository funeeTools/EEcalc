import { describe, expect, it, vi } from 'vitest';
import { runCompute } from '@/core/calc/page';
import { def, type FlybackState } from '@/calculators/flyback-converter/def';
import { analyzeFlyback, clampPower } from '@/calculators/flyback-converter/model';

const val = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<FlybackState>) => def.compute({ ...def.defaults(), ...p });
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('flyback — AN-4137 design equations', () => {
  it('N from D_max, L_m from K_RF, I_pk = I_EDC·(1 + K_RF) (default design)', () => {
    const r = run({});
    const pin = 24 / 0.88;
    const vro = (36 * 0.45) / 0.55;
    expect(val(r, 'n')).toBeCloseTo(vro / 12.5, 12);
    expect(val(r, 'lp')).toBeCloseTo((36 * 0.45) ** 2 / (2 * pin * 200e3 * 0.5), 15);
    expect(val(r, 'ipPk')).toBeCloseTo((pin / (36 * 0.45)) * 1.5, 12);
    expect(val(r, 'vdsMax')).toBeCloseTo(72 + 1.7 * vro, 10);
    expect(val(r, 'vRect')).toBeCloseTo(12 + 72 / (vro / 12.5), 10);
  });
  it('Erickson §6.3.4: CCM conversion ratio M = D/(N(1 − D)) at both input corners', () => {
    const r = run({ solveFor: 'dmax', n: 3, lp: 1e-3 });
    const d = r.details as any;
    for (const [o, vin] of [[d.lo, 36], [d.hi, 72]] as const) expect((o.d / (3 * (1 - o.d))) * vin).toBeCloseTo(12.5, 10);
  });
  it('energy per cycle: ½·L_p·(I_pk² − I_min²)·f = P_in, in CCM and DCM', () => {
    for (const lp of [200e-6, 10e-6]) {
      const o = analyzeFlyback({ vin: 40, vout: 5, iout: 3, vf: 0.4, eta: 0.85, fsw: 150e3, n: 3, lp });
      expect(0.5 * lp * (o.ipPk ** 2 - o.ipVal ** 2) * 150e3).toBeCloseTo(o.pin, 10);
      expect(o.mode).toBe(lp > o.lCrit ? 'ccm' : 'dcm');
    }
  });
  it('AN-4147 clamp power includes the V_clamp/(V_clamp − V_OR) factor', () => {
    expect(clampPower(1e-6, 2, 100e3, 80, 40)).toBeCloseTo(0.5 * 1e-6 * 4 * 100e3 * 2, 12);
  });
});

describe('flyback — independent Python reference (pb2/ref.py: AN-4137 + numerically integrated waveforms)', () => {
  it('default design', () => {
    const r = run({});
    expect(rel(val(r, 'n'), 2.356363636363636)).toBeLessThan(1e-12);
    expect(rel(val(r, 'lp'), 4.8114e-5)).toBeLessThan(1e-12);
    expect(rel(val(r, 'ipRms'), 1.1754410782997509)).toBeLessThan(1e-7);
    // review 2026-11-26: rectifier peak is the unscaled N·I_p,pk (was the η-scaled 5.45 A, 8 % low)
    expect(rel(val(r, 'isPk'), 2.356363636363636 * 2.5252525252525255)).toBeLessThan(1e-12);
    expect(rel(val(r, 'isRms'), 2.8069178543215485)).toBeLessThan(1e-7);
    expect(rel(val(r, 'dvOut'), 0.07173657020202019)).toBeLessThan(1e-6);
    expect(rel(val(r, 'pClamp'), 0.774337895550017)).toBeLessThan(1e-12);
  });
  it('analysis of a 2:1, 10 µH transformer (example)', () => {
    const r = run(def.examples!.find((e) => e.id === 'analyse')!.state);
    expect(rel(val(r, 'dmaxPct'), 37.93103448275862)).toBeLessThan(1e-12);
    expect(rel(val(r, 'krf'), 0.5283139120095124)).toBeLessThan(1e-12);
    expect(rel(val(r, 'ipPk'), 3.950187473108366)).toBeLessThan(1e-12);
    expect(rel(val(r, 'isRms'), 3.981087615069616)).toBeLessThan(1e-7);
    expect(rel(val(r, 'dvOut'), 0.0419194647032897)).toBeLessThan(1e-6);
  });
  it('DCM step-up design (example)', () => {
    const r = run(def.examples!.find((e) => e.id === 'dcm-boost')!.state);
    expect(rel(val(r, 'n'), 0.3855076802178051)).toBeLessThan(1e-12);
    expect(rel(val(r, 'lp'), 7.745625e-6)).toBeLessThan(1e-12);
    expect(rel(val(r, 'ipPk'), 3.485838779956426)).toBeLessThan(1e-12);
    expect(rel(val(r, 'isRms'), 0.44173919239560633)).toBeLessThan(1e-7);
    expect(rel(val(r, 'dMin'), 0.225)).toBeLessThan(1e-12);
  });
});

describe('flyback — solve round trips', () => {
  const modes = ['n', 'lp', 'krf', 'dmax'] as const;
  const starts: Partial<FlybackState>[] = [{}, ...def.examples!.map((e) => e.state)];
  for (const [i, st] of starts.entries()) {
    it(`start ${i}: every option reproduces N, L_p, D_max and K_RF`, () => {
      const a = run(st);
      const s0 = (a.details as any).state as FlybackState;
      for (const m of modes) {
        const b = run({ ...s0, solveFor: m });
        expect(b.ok && b.status?.text !== 'NO SOLUTION').toBe(true);
        for (const k of ['n', 'lp', 'dmaxPct', 'krf']) expect(rel(val(b, k), val(a, k))).toBeLessThan(1e-9);
      }
    });
  }
  it('DCM with a fixed L_p: the duty does not depend on N, so the entered N is kept', () => {
    const a = run({ solveFor: 'dmax', n: 5, lp: 10e-6 });
    expect((a.details as any).lo.mode).toBe('dcm');
    const b = run({ solveFor: 'krf', n: 5, lp: 10e-6, dmaxPct: val(a, 'dmaxPct') });
    expect(val(b, 'n')).toBe(5);
    expect(b.notes.some((n) => n.includes('does not depend on N'))).toBe(true);
    const c = run({ solveFor: 'krf', lp: 10e-6, dmaxPct: val(a, 'dmaxPct') + 5 });
    expect(c.status?.text).toBe('NO SOLUTION');
  });
  it('K_RF is continuous and L_p monotonic across the CCM/DCM boundary', () => {
    const r0 = run({ solveFor: 'dmax', n: 2.356, lp: 24.06e-6 * 1.0001 });
    const r1 = run({ solveFor: 'dmax', n: 2.356, lp: 24.06e-6 * 0.9999 });
    expect(Math.abs(val(r0, 'ipPk') - val(r1, 'ipPk'))).toBeLessThan(1e-3);
    expect(Math.abs(val(r0, 'dmaxPct') - val(r1, 'dmaxPct'))).toBeLessThan(1e-2);
    const lps = [5e-6, 10e-6, 20e-6, 40e-6, 80e-6, 160e-6];
    const ipk = lps.map((lp) => val(run({ solveFor: 'dmax', lp }), 'ipPk'));
    for (let k = 1; k < ipk.length; k++) expect(ipk[k]).toBeLessThan(ipk[k - 1]);
  });
});

describe('flyback — warnings at the limits', () => {
  it('drain peak above V_DSS (example: 100 V switch)', () => {
    const r = run(def.examples!.find((e) => e.id === 'fixed-lp')!.state);
    expect(r.warnings.some((w) => w.startsWith('Clamped drain peak') && w.includes('exceeds'))).toBe(true);
    expect(r.results.find((x) => x.key === 'vdsMax')!.tone).toBe('fail');
  });
  it('D > 50 % in CCM, D > 80 %, short on-time, high clamp loss, leakage reset, η above the rectifier limit', () => {
    expect(run({ dmaxPct: 60 }).warnings.some((w) => w.includes('slope compensation'))).toBe(true);
    expect(run({ dmaxPct: 85, vdss: 1000 }).warnings.some((w) => w.includes('70–80 %'))).toBe(true);
    expect(run({ fsw: 2e6, vinMax: 400 }).warnings.some((w) => w.startsWith('On-time'))).toBe(true);
    expect(run({ llk: 3e-6 }).warnings.some((w) => w.startsWith('Clamp dissipation'))).toBe(true);
    expect(run({ llk: 30e-6 }).warnings.some((w) => w.startsWith('Leakage reset'))).toBe(true);
    expect(run({ vout: 3.3, vf: 0.5, etaPct: 92 }).warnings.some((w) => w.includes('rectifier drop alone'))).toBe(true);
  });
  it('input errors and impossible targets', () => {
    expect(run({ vinMax: 30 }).warnings.some((w) => w.includes('below V_in,min'))).toBe(true);
    expect(val(run({ vinMax: 30 }), 'dMin')).toBeCloseTo(0.45, 12);
    expect(() => run({ kClamp: 1 })).toThrow(/k_c > 1/);
    expect(run({ dmaxPct: 80, krf: 2 }).status?.text).toBe('NO SOLUTION');
  });
});

describe('flyback — examples', () => {
  it('first example equals the defaults', () => {
    expect({ ...def.defaults(), ...def.examples![0].state }).toEqual(def.defaults());
  });
  for (const e of def.examples ?? []) {
    it(`computes: ${e.label}`, () => {
      const r = run(e.state);
      expect(r.ok).toBe(true);
      expect(r.status?.tone).not.toBe('fail');
      expect(r.graphs.length).toBe(3);
    });
  }
});

describe('flyback — fuzz through runCompute', () => {
  it('400 random states: no throw, finite values, no NaN text, stable recompute', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const lu = (a: number, b: number) => a * (b / a) ** rnd();
    let okCount = 0;
    for (let i = 0; i < 400; i++) {
      const vmin = lu(0.5, 2000);
      const st: any = {
        ...def.defaults(),
        solveFor: (['n', 'lp', 'krf', 'dmax'] as const)[i % 4],
        vinMin: vmin, vinMax: Math.min(2000, vmin * lu(1, 5)), vout: lu(0.5, 2000), iout: lu(1e-4, 500), etaPct: 10 + 90 * rnd(), fsw: lu(1e3, 10e6),
        dmaxPct: lu(1e-3, 99.9), n: lu(1e-3, 1e4), krf: lu(1e-3, 1e3), lp: lu(1e-9, 1), llk: lu(1e-9, 0.1) * (rnd() < 0.1 ? 0 : 1), vf: 5 * rnd(),
        cout: lu(1e-9, 1), esr: 100 * rnd() ** 4, kClamp: 1.01 + 19 * rnd(), vdss: lu(1, 5000), rds: rnd(), tsw: 1e-5 * rnd() ** 3, qg: 1e-5 * rnd() ** 3, vg: 30 * rnd(),
        rp: rnd(), rs: rnd(), pcore: 10 * rnd(),
      };
      const r = runCompute(def, st);
      if (!r.ok) continue;
      if (r.status?.text !== 'NO SOLUTION') okCount++;
      for (const x of r.results) {
        if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${x.key}`).toBe(true);
        expect(String(x.display)).not.toMatch(/NaN|undefined|Infinity|\[object/);
        expect(String(x.note ?? '')).not.toMatch(/NaN|undefined|Infinity|\[object/);
      }
      for (const w of [...r.warnings, ...r.notes]) expect(w).not.toMatch(/NaN|undefined|Infinity/);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of [...s.x, ...s.y]) expect(Number.isFinite(y)).toBe(true);
      if (r.status?.text !== 'NO SOLUTION') {
        const again = runCompute(def, { ...st });
        for (const k of ['n', 'lp', 'dmaxPct', 'krf', 'ipPk', 'dvOut']) expect(rel(val(again, k), val(r, k))).toBeLessThan(1e-9);
      }
    }
    spy.mockRestore();
    expect(okCount).toBeGreaterThan(150); // the rest: N or L_p outside its field range, or D_max·√K_RF ≥ 1
  });
});
