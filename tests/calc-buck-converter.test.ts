import { describe, expect, it } from 'vitest';
import { def, type BuckState } from '@/calculators/buck-converter/def';
import { analyzeBuck, outputRipple } from '@/calculators/buck-converter/model';

const val = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<BuckState>) => def.compute({ ...def.defaults(), ...p });

/** Lossless parts: the textbook (SLVA477) equations apply exactly. */
const ideal: Partial<BuckState> = { dcr: 0, rHs: 0, rLs: 0, vf: 0, esr: 0, esrIn: 0, tsw: 0, qg: 0, rect: 'sync' };

function finiteResults(r: ReturnType<typeof run>) {
  for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${x.key} = ${x.value}`).toBe(true);
  for (const g of r.graphs) for (const s of g.series ?? []) for (const y of [...s.x, ...s.y]) expect(Number.isFinite(y)).toBe(true);
}

describe('buck converter — TI SLVA477 equations (ideal parts)', () => {
  it('eq. 5: L = Vout·(Vin − Vout)/(ΔIL·fs·Vin)', () => {
    // 12 V → 3.3 V, 3 A, 500 kHz, ΔIL = 30 % of Iout = 0.9 A → L = 3.3·8.7/(0.9·500e3·12) = 5.3167 µH
    const r = run({ ...ideal, solveFor: 'l', vin: 12, vout: 3.3, iout: 3, fsw: 500e3, ripplePct: 30 });
    expect(val(r, 'l')).toBeCloseTo((3.3 * 8.7) / (0.9 * 500e3 * 12), 12);
    expect(val(r, 'duty')).toBeCloseTo(3.3 / 12, 12);
    expect(val(r, 'iPk')).toBeCloseTo(3.45, 9); // eq. 4: Iout + ΔIL/2
  });
  it('eq. 2 ripple, eq. 7 diode current, eq. 12 / 13 output ripple limits', () => {
    const r = run({ ...ideal, rect: 'diode', vf: 0, solveFor: 'ripplePct', vin: 24, vout: 5, iout: 2, fsw: 300e3, l: 22e-6, cout: 47e-6 });
    const d = 5 / 24;
    const dIL = ((24 - 5) * d) / (300e3 * 22e-6);
    expect(val(r, 'dIL')).toBeCloseTo(dIL, 10);
    expect(val(r, 'iLsAvg')).toBeCloseTo(2 * (1 - d), 10);
    // ESR = 0: the exact ripple equals ΔIL/(8·fs·C)
    expect(val(r, 'dvOut')).toBeCloseTo(dIL / (8 * 300e3 * 47e-6), 12);
    // C → ∞: the exact ripple equals ESR·ΔIL
    expect(outputRipple(analyzeBuck({ ...(r.details as any).inputs, esr: 0.02, cout: 1e3 }).segments, 2, 1e3, 0.02)).toBeCloseTo(0.02 * dIL, 6);
  });
  it('eq. 12: Cout(min) = ΔIL/(8·fs·ΔVout) when ESR = 0', () => {
    const r = run({ ...ideal, solveFor: 'cout', vin: 12, vout: 3.3, iout: 3, fsw: 500e3, l: 5.3167e-6, dvOut: 10e-3 });
    const dIL = (8.7 * (3.3 / 12)) / (500e3 * 5.3167e-6);
    expect(val(r, 'cout')).toBeCloseTo(dIL / (8 * 500e3 * 10e-3), 12);
  });
  it('input capacitor RMS ≈ Iout·√(D(1−D)) for small ripple', () => {
    const r = run({ ...ideal, solveFor: 'ripplePct', vin: 10, vout: 5, iout: 4, l: 1e-3 });
    expect(val(r, 'iCinRms')).toBeCloseTo(4 * 0.5, 3);
  });
});

describe('buck converter — independent time-domain simulation (Python, scratch)', () => {
  // A cycle-by-cycle simulation (R load, ideal switches with on-resistance, DCR, ESR) run to steady state.
  it('synchronous CCM with drops: duty from volt-second balance holds Vout', () => {
    const r = run({}); // defaults: 12 → 3.3 V, 3 A, solved L = 5.385 µH
    expect(val(r, 'duty')).toBeCloseTo(0.281955, 5);
    expect(val(r, 'l')).toBeCloseTo(5.385e-6, 8);
    // sim at that D and L: Vout 3.3005 V, ΔVout 6.30 mV, ipk 3.451 A, valley 2.551 A
    expect(val(r, 'iPk')).toBeCloseTo(3.451, 2);
    expect(val(r, 'iValley')).toBeCloseTo(2.551, 2);
    expect(val(r, 'dvOut')).toBeCloseTo(6.30e-3, 4); // model 6.34 mV (constant-current load) vs sim 6.30 mV (R load)
  });
  it('diode DCM: D1 and peak current reproduce Vout in simulation', () => {
    const r = run({ solveFor: 'ripplePct', vin: 24, vout: 5, iout: 0.1, fsw: 300e3, l: 22e-6, dcr: 0, rHs: 0, cout: 47e-6, esr: 10e-3, rect: 'diode', vf: 0.4 });
    expect((r.details as any).mode).toBe('dcm');
    // sim with D = 0.12396 → Vout 4.9998 V, ipk 0.3570 A, ΔVout 5.12 mV
    expect(val(r, 'duty')).toBeCloseTo(0.12396, 4);
    expect(val(r, 'dIL')).toBeCloseTo(0.357, 3);
    expect(val(r, 'dvOut')).toBeCloseTo(5.12e-3, 4);
    expect(r.warnings.some((w) => w.includes('Discontinuous'))).toBe(true);
  });
});

describe('buck converter — brute-force sampled waveform (Python, scratch)', () => {
  it('RMS currents, input/output ripple and the loss budget of the default design', () => {
    const r = run({});
    expect(val(r, 'iHsRms')).toBeCloseTo(1.5989457, 6);
    expect(val(r, 'iLsRms')).toBeCloseTo(2.5516412, 6);
    expect(val(r, 'iCinRms')).toBeCloseTo(1.3568860, 6);
    expect(val(r, 'iCoutRms')).toBeCloseTo(0.2598076, 6);
    expect(val(r, 'dvOut')).toBeCloseTo(6.33618e-3, 6);
    expect(val(r, 'dVin')).toBeCloseTo(77.9869e-3, 6);
    expect(val(r, 'pLoss')).toBeCloseTo(0.4917970, 6);
    expect(val(r, 'eff')).toBeCloseTo(0.9526745, 6);
  });
});

describe('buck converter — solve → forward round trips', () => {
  it('L for a ripple ratio', () => {
    const a = run({ solveFor: 'l', ripplePct: 35 });
    const b = run({ solveFor: 'ripplePct', l: val(a, 'l') });
    expect(val(b, 'ripplePct')).toBeCloseTo(35, 8);
  });
  it('fsw for a ripple ratio', () => {
    const a = run({ solveFor: 'fsw', ripplePct: 25, l: 10e-6 });
    const b = run({ solveFor: 'ripplePct', l: 10e-6, fsw: val(a, 'fsw') });
    expect(val(b, 'ripplePct')).toBeCloseTo(25, 8);
  });
  it('Cout for a ripple voltage (with ESR)', () => {
    const a = run({ solveFor: 'cout', dvOut: 8e-3, l: 4.7e-6 });
    const b = run({ solveFor: 'ripplePct', l: 4.7e-6, cout: val(a, 'cout') });
    expect(val(b, 'dvOut')).toBeCloseTo(8e-3, 10);
  });
  it('L for a ripple ratio that puts a diode buck into DCM', () => {
    const a = run({ solveFor: 'l', rect: 'diode', ripplePct: 300 });
    expect((a.details as any).mode).toBe('dcm');
    const b = run({ solveFor: 'ripplePct', rect: 'diode', l: val(a, 'l') });
    expect(val(b, 'ripplePct')).toBeCloseTo(300, 6);
  });
});

describe('buck converter — edge cases', () => {
  it('Vout ≥ Vin is an input error', () => {
    expect(() => run({ vin: 3.3, vout: 5 })).toThrow(/steps down/);
  });
  it('Vin too low for the conduction drops is an error, not D > 1', () => {
    expect(() => run({ vin: 3.4, vout: 3.3, iout: 10, rHs: 0.05 })).toThrow(/duty cycle/);
  });
  it('zero current is rejected', () => {
    expect(() => run({ iout: 0 })).toThrow();
  });
  it('Cout target below the ESR floor reports no solution', () => {
    const r = run({ solveFor: 'cout', esr: 50e-3, dvOut: 1e-3 });
    expect(r.status?.tone).toBe('fail');
    expect(r.warnings[0]).toMatch(/ESR alone/);
    expect(r.results.every((x) => x.value === null || Number.isFinite(x.value as number))).toBe(true);
  });
  it('extreme step-down warns about the on-time; light sync load warns about negative current', () => {
    expect(run({ vin: 48, vout: 1, fsw: 2e6 }).warnings.some((w) => w.includes('On-time'))).toBe(true);
    const r = run({ solveFor: 'ripplePct', iout: 0.2, l: 4.7e-6 });
    expect(r.warnings.some((w) => w.includes('negative'))).toBe(true);
    finiteResults(r);
  });
  it('high duty cycle warns', () => {
    expect(run({ vin: 3.6, vout: 3.3, iout: 1 }).warnings.some((w) => w.includes('Duty cycle'))).toBe(true);
  });
});

describe('buck converter — examples', () => {
  it('first example equals the defaults', () => {
    expect({ ...def.defaults(), ...def.examples![0].state }).toEqual(def.defaults());
  });
  for (const e of def.examples ?? []) {
    it(`example computes: ${e.label}`, () => {
      const r = run(e.state);
      expect(r.ok).toBe(true);
      expect(r.status?.tone).not.toBe('fail');
      finiteResults(r);
      expect(r.graphs.length).toBeGreaterThan(0);
    });
  }
});

describe('buck converter — review regressions (2026-11-22)', () => {
  const base: Partial<BuckState> = { solveFor: 'ripplePct', vin: 12, vout: 3.3, iout: 1, fsw: 500e3, rect: 'diode', rHs: 0.3, dcr: 0.3, vf: 0.5 };
  it('diode CCM/DCM boundary is continuous with resistive drops (D1 + D2 → 1, no duty jump)', () => {
    const dets = [0.999, 0.9995, 0.9999, 1.0001, 1.0003, 1.0005, 1.001].map((f) => run({ ...base, l: 2.7218e-6 * f }).details as any);
    for (const d of dets) expect(d.d + (d.mode === 'dcm' ? d.d2 : 1 - d.d)).toBeLessThanOrEqual(1 + 1e-9);
    for (let k = 1; k < dets.length; k++) expect(Math.abs(dets[k].d - dets[k - 1].d)).toBeLessThan(1e-3); // was an 8 % jump
  });
  it('ripple ratio is monotonic in L across the boundary, and solve-for-L picks the CCM root', () => {
    const ls = Array.from({ length: 60 }, (_, k) => 2.4e-6 * (3.2 / 2.4) ** (k / 59));
    const rr = ls.map((l) => val(run({ ...base, l }), 'ripplePct'));
    for (let k = 1; k < rr.length; k++) expect(rr[k]).toBeLessThan(rr[k - 1]);
    const s = run({ ...base, solveFor: 'l', ripplePct: 199 });
    expect((s.details as any).mode).toBe('ccm');
    expect(val(s, 'l')).toBeCloseTo(2.7358e-6, 9);
  });
  it('load-step Cout reports the undershoot bound when it governs (D > 0.5)', () => {
    const r = run({ solveFor: 'ripplePct', vin: 5, vout: 4, iout: 2, l: 1e-6, iStep: 2 });
    expect(val(r, 'coutStep')).toBeCloseTo(10e-6, 12); // 2²·1µ/(2·1 V·0.2 V)
    expect(r.results.find((x) => x.key === 'coutStep')!.note).toMatch(/undershoot governs/);
    const o = run({ iStep: 1.5 }); // 12 → 3.3 V: overshoot governs
    expect(o.results.find((x) => x.key === 'coutStep')!.note).toMatch(/overshoot governs/);
  });
  it('DCM diode-current and negative-current Cin notes', () => {
    const d = run({ ...base, iout: 0.1, l: 22e-6 });
    expect(d.results.find((x) => x.key === 'iLsAvg')!.note).toMatch(/D2/);
    const n = run({ solveFor: 'ripplePct', iout: 0.2, l: 4.7e-6 });
    expect(n.results.find((x) => x.key === 'iCinRms')!.note).toBe('');
  });
  it('making ΔVout a result again from solve-for-Cout does not make L the unknown', () => {
    const f = def.fields.flatMap((x: any) => x.fields ?? []).find((x: any) => x.key === 'dvOut') as any;
    const root: any = { ...def.defaults(), solveFor: 'cout' };
    f.onSolve(root, root);
    expect(root.solveFor).toBe('ripplePct');
  });
  it('solved values stay inside their field limits (deep DCM ripple, tiny ΔVout)', () => {
    const fields = def.fields.flatMap((x: any) => x.fields ?? []) as any[];
    const lim = (k: string) => fields.find((x) => x.key === k);
    const r = run({ ...base, iout: 1e-4, l: 22e-6, cout: 0.5 });
    for (const k of ['ripplePct', 'dvOut']) {
      expect(val(r, k)).toBeGreaterThanOrEqual(lim(k).min);
      expect(val(r, k)).toBeLessThanOrEqual(lim(k).max);
    }
  });
});

describe('buck — ◎ Cout at the ESR floor (mode-switch harness)', () => {
  it('a target equal to ESR·ΔIL gives the smallest C that reaches it, not NO SOLUTION', async () => {
    const { def } = await import('@/calculators/buck-converter/def');
    const { runCompute } = await import('@/core/calc/page');
    const ex = def.examples!.find((e) => e.label.startsWith('12 V → 1.0 V'))!;
    const st: any = { ...def.defaults(), ...structuredClone(ex.state) };
    runCompute(def, st);
    const before = st.dvOut;
    st.solveFor = 'cout';
    const r = runCompute(def, st);
    expect(r.ok).toBe(true);
    expect(r.status?.text ?? '').not.toMatch(/NO SOLUTION/);
    expect(st.cout).toBeGreaterThan(0);
    expect(st.cout).toBeLessThanOrEqual(470e-6 * (1 + 1e-9));
    // feeding the answer back reproduces the ripple
    st.solveFor = 'ripplePct';
    runCompute(def, st);
    expect(st.dvOut).toBeCloseTo(before, 9);
  });
});
