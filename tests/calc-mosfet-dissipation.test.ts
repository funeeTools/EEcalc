import { describe, expect, it } from 'vitest';
import { def, type FetState, PARTS } from '@/calculators/mosfet-dissipation/def';
import { analyze, edges } from '@/calculators/mosfet-dissipation/model';
import { fuzz, res } from './fuzz-gen3';

const run = (p: Partial<FetState>) => def.compute({ ...def.defaults(), ...p });
const warned = (r: ReturnType<typeof run>, re: RegExp) => r.warnings.some((w) => re.test(w));

describe('MOSFET dissipation — SLUA618A switching equations by hand', () => {
  it('eq. 8, 11, 12 (as charges), 13–14: turn-on and turn-off intervals and energies', () => {
    // 48 V, 10 A, no ripple, V_th 2 V, g_fs 20 S, Q_gs 6 nC, Q_g(th) 2 nC, Q_gd 8 nC, 10 V drive, R_on = 2+3+1, R_off = 1+3+1
    const p = { role: 'switch' as const, v: 48, iL: 10, dIL: 0, d: 0.25, fsw: 200e3, rds25: 0.01, alpha: 0, vth: 2, gfs: 20, qg: 30e-9, qgs: 6e-9, qgd: 8e-9, qgth: 2e-9, rgInt: 1, coss: 0, cossOpp: 0, vsd: 0.8, vdrv: 10, rSrc: 2, rSnk: 1, rgExt: 3, tdt: 0, qrr: 0, ta: 25, rth: 10 };
    const e = edges(p);
    const vpl = 2 + 10 / 20; // eq. 8: 2.5 V
    expect(e.vplOn).toBeCloseTo(vpl, 12);
    const tir = 4e-9 / ((10 - 0.5 * (vpl + 2)) / 6); // Q_gs2 / I_G2
    const tvf = 8e-9 / ((10 - vpl) / 6); // Q_gd / I_G3
    const tvr = 8e-9 / (vpl / 5);
    const tif = 4e-9 / ((0.5 * (vpl + 2)) / 5);
    expect(e.tir).toBeCloseTo(tir, 18);
    expect(e.tvf).toBeCloseTo(tvf, 18);
    expect(e.tvr).toBeCloseTo(tvr, 18);
    expect(e.tif).toBeCloseTo(tif, 18);
    const o = analyze(p);
    // eq. 14: P_sw = V·I/2·(t2 + t3)/T per edge
    expect(o.loss.sw).toBeCloseTo(((48 * 10) / 2) * (tir + tvf + tvr + tif) * 200e3, 10);
    // eq. 10: share of Q_g·V_drv·f in R_G,int
    expect(o.loss.gate).toBeCloseTo(0.5 * 30e-9 * 10 * 200e3 * (1 / 6 + 1 / 5), 12);
    expect(o.irms).toBeCloseTo(Math.sqrt(0.25) * 10, 12);
    expect(o.tj).toBeCloseTo(25 + 10 * o.loss.total, 10); // α = 0: T_J = T_A + R_θ·P
  });
  it('no published numeric example in SLUA618: closed-form T_J checked against a fixed-point iteration (Python)', () => {
    // independent Python (scratch pb3/py/check.py): T = Ta + Rθ·P(T) iterated to convergence
    const r = run({});
    expect(res(r, 'tj')).toBeCloseTo(84.1747703196, 7);
    expect(res(r, 'pTotal')).toBeCloseTo(0.6834954064, 9);
    const sr = run({ role: 'sr' });
    expect(res(sr, 'tj')).toBeCloseTo(107.6813818882, 7);
    expect(res(sr, 'pTotal')).toBeCloseTo(1.1536276378, 9);
    const hs = run({ v: 48, qrr: 0, rgExt: 4.7, path: 'jc', rthCS: 1, rthSA: 10, ta: 40 });
    expect(res(hs, 'tj')).toBeCloseTo(92.1617974135, 7);
    expect(res(hs, 'pTotal')).toBeCloseTo(3.5244457712, 9);
  });
  it('presets carry the datasheet numbers (TI CSD18540Q5B SLPS488B)', () => {
    const p = PARTS['CSD18540Q5B · 60 V · V_GS 10 V'];
    expect([p.rds25, p.qg, p.qgd, p.qgs, p.qgth, p.gfs, p.rthJC, p.tjMax]).toEqual([2.2e-3, 41e-9, 6.7e-9, 8.8e-9, 6.3e-9, 116, 0.8, 175]);
    expect(p.coss).toBeCloseTo(83e-9 / 30, 15);
  });
});

describe('MOSFET dissipation — physics', () => {
  it('conduction loss follows R_DS(on)(T_J); runaway is detected', () => {
    const r = run({});
    const d = r.details as any;
    expect(d.rdsTj).toBeCloseTo(9.3e-3 * (1 + 0.0055 * (res(r, 'tj') - 25)), 12);
    const hot = run({ iL: 60, dIL: 0, fsw: 1e3, rthJA: 400, alphaPct: 1, vdrv: 10 });
    expect(hot.status?.text).toBe('NO SOLUTION');
    expect(warned(hot, /Thermal runaway/)).toBe(true);
  });
  it('monotone in current, frequency and thermal resistance', () => {
    const t = (p: Partial<FetState>) => res(run(p), 'tj');
    expect(t({ iL: 5 })).toBeLessThan(t({ iL: 8 }));
    expect(t({ fsw: 200e3 })).toBeLessThan(t({ fsw: 800e3 }));
    expect(t({ rthJA: 30 })).toBeLessThan(t({ rthJA: 60 }));
    expect(t({ rgExt: 0 })).toBeLessThan(t({ rgExt: 5 }));
  });
  it('limits: f → 0 leaves conduction only; negative valley removes turn-on, C_oss and Q_rr losses', () => {
    const lf = run({ fsw: 1e3 });
    expect(res(lf, 'pSw')).toBeLessThan(3e-3 * res(lf, 'pCond'));
    const zvs = run({ iL: 2, dIL: 6 });
    expect(res(zvs, 'pOn')).toBe(0);
    expect(res(zvs, 'pCoss')).toBe(0);
    expect(res(zvs, 'pRr')).toBe(0);
    expect(zvs.notes.some((n) => /reverses/.test(n))).toBe(true);
  });
  it('SR: body-diode loss V_SD·t_dt·f·(I_pk + I_valley), no switching terms', () => {
    const r = run({ role: 'sr', tdt: 30e-9 });
    expect(res(r, 'pBd')).toBeCloseTo(0.8 * 30e-9 * 500e3 * (11.5 + 8.5), 12);
    expect(r.results.find((x) => x.key === 'pSw')).toBeUndefined();
  });
});

describe('MOSFET dissipation — solve round trips', () => {
  const pts: Partial<FetState>[] = [{}, { role: 'sr' }, { v: 24, iL: 6, fsw: 300e3, path: 'jc' }, { ...def.examples![2].state, solveFor: 'tj' }];
  for (const p of pts)
    it(`analysis → each unknown → same value (${JSON.stringify(p).slice(0, 40)})`, () => {
      const base = run({ ...p, solveFor: 'tj' });
      const tj = res(base, 'tj');
      const st = { ...def.defaults(), ...p, tj } as FetState;
      for (const k of ['iL', 'fsw', st.path === 'ja' ? 'rthJA' : 'rthSA'] as const) {
        const r = def.compute({ ...st, solveFor: k });
        expect(res(r, k) / (st as any)[k], k).toBeCloseTo(1, 6);
        expect(res(r, 'tj')).toBeCloseTo(tj, 6);
      }
    });
  it('max current is capped by the gate drive (plateau at the peak below V_drv)', () => {
    const r = run({ solveFor: 'iL', tj: 150, rthJA: 1, ta: 25, vdrv: 3, fsw: 10e3 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(warned(r, /gate drive limits/)).toBe(true);
  });
  it('a target inside the soft→hard turn-on step is reported, not mis-solved', () => {
    const lo = res(run({ iL: 1.5, dIL: 3, qrr: 200e-9, v: 24 }), 'tj'); // just below ΔI/2: soft
    const hi = res(run({ iL: 1.51, dIL: 3, qrr: 200e-9, v: 24 }), 'tj'); // just above: hard
    expect(hi - lo).toBeGreaterThan(2);
    const r = run({ solveFor: 'iL', dIL: 3, qrr: 200e-9, v: 24, tj: (lo + hi) / 2 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(warned(r, /jumps past/)).toBe(true);
  });
});

describe('MOSFET dissipation — review 2026-11-26 regressions', () => {
  it('C_oss loss includes the opposite device: equal FETs give Q_oss·V·f (imax-48v ≈ 0.5 W)', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples![2].state } as FetState);
    const p = PARTS['CSD19534Q5A · 100 V · V_GS 10 V'];
    expect(res(r, 'pCoss')).toBeCloseTo(p.coss * 48 * 48 * 250e3, 12);
    expect(res(r, 'pCoss')).toBeGreaterThan(0.45);
  });
  it('zero gate-loop resistance and Q_g(th) > Q_gs are flagged', () => {
    expect(warned(run({ rSrc: 0, rSnk: 0, rgExt: 0, rgInt: 0 }), /zero resistance/)).toBe(true);
    expect(warned(run({ qgth: 4e-9 }), /exceeds Q_gs/)).toBe(true);
  });
  it('the SR is not limited by the Miller plateau (ZVS)', () => {
    expect(() => run({ vdrv: 2, iL: 30 })).toThrow(/Miller plateau/);
    expect(run({ role: 'sr', vdrv: 2, iL: 30 }).ok).toBe(true);
  });
});

describe('MOSFET dissipation — warnings at the limits', () => {
  it('each warning is reachable', () => {
    expect(warned(run({ ta: 120 }), /exceeds the .* rating/)).toBe(true);
    expect(warned(run({ v: 26 }), /of V_DSS/)).toBe(true);
    expect(warned(run({ vdrv: 4 }), /below the 4\.5 V at which R_DS\(on\)/)).toBe(true);
    expect(warned(run({ fsw: 5e6, rgExt: 20 }), /too slow for this frequency/)).toBe(true);
    expect(warned(run({ role: 'sr', tdt: 300e-9 }), /dead times/)).toBe(true);
    expect(warned(run({ solveFor: 'rthJA', iL: 140, tj: 125 }), /not achievable for a board-mounted/)).toBe(true);
    expect(run({ solveFor: 'rthSA', path: 'jc', iL: 25, rthCS: 30, tj: 125 }).status?.text).toBe('NO SOLUTION');
    expect(run({ solveFor: 'iL', tj: 40 }).status?.text).toBe('NO SOLUTION'); // target below ambient
    expect(() => run({ vdrv: 2, iL: 30 })).toThrow(/Miller plateau/);
  });
});

describe('MOSFET dissipation — examples, mode switches, fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = def.compute({ ...def.defaults(), ...e.state } as FetState);
      expect(r.ok && r.status?.text !== 'NO SOLUTION', e.id).toBe(true);
    }
    expect(def.compute({ ...def.defaults(), ...def.examples![5].state } as FetState).status?.text).toBe('OVER T_J,max');
  });
  it('preset sync: editing a device field switches to Custom; thermal path moves the R_θ unknown', () => {
    const s = { ...def.defaults(), rds25: 5e-3 };
    def.sync!(s);
    expect(s.part).toBe('Custom');
    const t = { ...def.defaults(), solveFor: 'rthJA' as const, path: 'jc' as const };
    def.sync!(t);
    expect(t.solveFor).toBe('rthSA');
  });
  it('compute < 50 ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) run({ solveFor: 'iL', tj: 125 });
    expect((performance.now() - t0) / 10).toBeLessThan(50);
  });
  it('fuzz: 400 random states plus 300 realistic ones through runCompute', () => {
    expect(fuzz(def, 400, 321)).toBeGreaterThan(30);
    expect(
      fuzz(def, 300, 77, (s, rnd) =>
        Object.assign(s, { v: 5 + 100 * rnd(), iL: 0.5 + 30 * rnd(), dIL: 10 * rnd(), duty: 5 + 90 * rnd(), fsw: 2e4 * 100 ** rnd(), vdrv: 5 + 7 * rnd(), rgExt: 10 * rnd(), rthJA: 10 + 80 * rnd(), rthSA: 1 + 30 * rnd(), tj: 60 + 100 * rnd(), ta: 60 * rnd(), vth: 1 + 2 * rnd(), gfs: 20 + 100 * rnd(), qgs: 5e-9, qgth: 2e-9, qgd: 5e-9 }),
      ),
    ).toBeGreaterThan(200);
  });
});
