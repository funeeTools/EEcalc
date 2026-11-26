import { describe, expect, it } from 'vitest';
import { def, type StubState } from '@/calculators/via-stub/def';
import { quarterWave, stubIL, stubResonances } from '@/calculators/via-stub/model';
import { viaIL } from '@/calculators/differential-via/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<StubState>) => def.compute({ ...def.defaults(), ...p });
const MIL = 25.4e-6;

describe('via stub — published values', () => {
  it('EMA: a 10 mil residual stub resonates near 150 GHz (Dk ≈ 4)', () => {
    expect(quarterWave(10 * MIL, 4) / 1e9).toBeCloseTo(147.5, 1);
  });
  it('Bogatin’s rule (Polar AP8204): stub < 300 mil ÷ bit rate (Gb/s) ≈ the 10× Nyquist margin for NRZ at Dk 4', () => {
    for (const gbps of [5, 10, 28]) {
      const r = run({ solveFor: 'stub', rate: gbps * 1e9, mod: 'nrz', k: 10, er: 4, cEnd: null, h: 10e-3, nL: 4, exit: 2 });
      expect(res(r, 'lMax') / ((300 / gbps) * MIL)).toBeCloseTo(0.98, 2);
    }
  });
  it('the open stub with C_end = 0 is the differential-via page’s stub model', () => {
    const p = { zVia: 45, z0: 50, er: 3.8, tanD: 0.01, lUse: 0.5e-3, lStub: 1.1e-3, cEnd: 0 };
    for (const f of [1e9, 20e9, 36e9, 60e9]) expect(stubIL(f, p)).toBeCloseTo(viaIL(f, 45, 50, 3.8, 0.01, 0.5e-3, 1.1e-3), 10);
  });
});

describe('via stub — independent Python model (xcheck.py)', () => {
  it('analysis, end capacitance, max stub and a back-drilled PAM4 backplane', () => {
    const a = run({ solveFor: 'kAch', stub: null });
    expect(res(a, 'fres')).toBeCloseTo(32789800093.749996, 0);
    expect(res(a, 'kAch')).toBeCloseTo(2.6231840075, 10);
    expect(res(a, 'il')).toBeCloseTo(0.9348213073363529, 9);
    expect(res(a, 'dIL')).toBeCloseTo(0.9033272503397491, 9);
    const c = run({ solveFor: 'kAch', stub: null, cEnd: 0.3e-12 });
    expect(res(c, 'fres') / 15067217485.952053).toBeCloseTo(1, 9);
    expect(res(c, 'il')).toBeCloseTo(9.73375099456555, 6);
    const m = run({});
    expect(res(m, 'stub')).toBeCloseTo(0.0009993081933333333, 15);
    const b = run({ solveFor: 'kAch', mod: 'pam4', rate: 112e9, h: 3e-3, nL: 24, exit: 4, stub: 0.2e-3, er: 3.4, tanD: 0.002 });
    expect(res(b, 'fres') / 203231609889.12576).toBeCloseTo(1, 12);
    expect(res(b, 'dIL')).toBeCloseTo(0.17367795202733094, 9);
  });
});

describe('via stub — solve round trips', () => {
  const pts: Partial<StubState>[] = [{}, { cEnd: 0.2e-12 }, { mod: 'pam4', rate: 56e9, h: 2.4e-3, nL: 14, exit: 5, k: 4 }, { rate: 2e9, k: 2, h: 3e-3, nL: 10, exit: 2, er: 4.4 }];
  it('stub ↔ rate ↔ achieved margin agree', () => {
    for (const p of pts) {
      const s = run({ ...p, solveFor: 'stub' });
      expect(s.ok, s.error).toBe(true);
      const lMax = res(s, 'lMax');
      // a stub at exactly ℓ_max (if back-drilled) sits at the margin; rate solved for it returns the rate entered
      const st = res(s, 'stub');
      if (st < res(s, 'full') - 1e-12) {
        expect(st / lMax).toBeCloseTo(1, 12);
        const back = run({ ...p, solveFor: 'kAch', stub: st });
        expect(res(back, 'kAch') / (p.k ?? 3)).toBeCloseTo(1, 8);
        const rr = run({ ...p, solveFor: 'rate', stub: st });
        expect(res(rr, 'rate') / (p.rate ?? 25e9)).toBeCloseTo(1, 8);
      }
      // rate → margin: the rate solved for any stub gives back the margin in analysis
      const rr = run({ ...p, solveFor: 'rate', stub: null });
      expect(res(run({ ...p, solveFor: 'kAch', stub: null, rate: res(rr, 'rate') }), 'kAch') / (p.k ?? 3)).toBeCloseTo(1, 9);
    }
  });
  it('end capacitance resonance solves tan(βℓ)·ωCZ = 1 and stays below the quarter wave', () => {
    const [f1, f3] = stubResonances(1e-3, 4, 40, 0.5e-12, 2);
    const q = quarterWave(1e-3, 4);
    expect(f1).toBeLessThan(q);
    expect(f3).toBeGreaterThan(2 * q);
    expect(f3).toBeLessThan(3 * q);
    const beta = (2 * Math.PI * f1 * 2) / 299792458;
    expect(Math.tan(beta * 1e-3) * 2 * Math.PI * f1 * 0.5e-12 * 40).toBeCloseTo(1, 9);
  });
});

describe('via stub — physics', () => {
  it('f_res ∝ 1/(ℓ√ε); harmonics are odd multiples; PAM4 halves Nyquist', () => {
    expect(quarterWave(1e-3, 4) / quarterWave(2e-3, 4)).toBeCloseTo(2, 12);
    expect(quarterWave(1e-3, 1) / quarterWave(1e-3, 4)).toBeCloseTo(2, 12);
    expect(stubResonances(1e-3, 4, 40, 0, 3).map((f) => f / quarterWave(1e-3, 4))).toEqual([1, 3, 5]);
    expect(res(run({ solveFor: 'kAch', mod: 'pam4' }), 'fN') / res(run({ solveFor: 'kAch', mod: 'nrz' }), 'fN')).toBeCloseTo(0.5, 12);
  });
  it('back-drilling raises f_res and lowers the loss; IL peaks near f_res', () => {
    const a = run({ solveFor: 'kAch', stub: null });
    const b = run({ solveFor: 'kAch', stub: 0.3e-3 });
    expect(res(b, 'fres')).toBeGreaterThan(res(a, 'fres'));
    expect(res(b, 'dIL')).toBeLessThan(res(a, 'dIL'));
    const line = { zVia: 40, z0: 50, er: 4, tanD: 0.01, lUse: 0.4e-3, lStub: 1.2e-3, cEnd: 0 };
    const fr = quarterWave(1.2e-3, 4);
    expect(stubIL(fr, line)).toBeGreaterThan(stubIL(0.7 * fr, line));
    expect(stubIL(fr, line)).toBeGreaterThan(stubIL(1.3 * fr, line));
  });
  it('exit on the bottom layer: no stub, reported', () => {
    const r = run({ solveFor: 'kAch', exit: 8, nL: 8 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no stub/);
  });
});

describe('via stub — review fixes', () => {
  it('a notch inside the band marks ΔIL as a fail even when the loss at f_N is small', () => {
    const r = run({ solveFor: 'kAch', rate: 112e9, mod: 'pam4', h: 3e-3, nL: 24, exit: 4, stub: null, er: 3.4, tanD: 0.002 });
    const d = r.results.find((x) => x.key === 'dIL')!;
    expect(d.value as number).toBeLessThan(0.5);
    expect(d.tone).toBe('fail');
  });
  it('a lossless stub shows a deep notch, not the 600 dB numerical floor', () => {
    const r = run({ solveFor: 'kAch', tanD: 0, stub: null });
    const n = r.results.find((x) => x.key === 'notch')!;
    expect(n.display).toMatch(/> 100 dB/);
    expect(n.display).not.toMatch(/600/);
  });
});

describe('via stub — warnings', () => {
  it('notch in band, stub loss over 1 dB, residual below back-drill control', () => {
    const inBand = run({ solveFor: 'kAch', rate: 112e9, mod: 'pam4', h: 3e-3, nL: 24, exit: 4, stub: null });
    expect(inBand.warnings.some((w) => /inside the signal band/.test(w))).toBe(true);
    expect(inBand.status?.text).toBe('NOTCH IN BAND');
    const lossy = run({ solveFor: 'kAch', rate: 32e9, h: 2.36e-3, nL: 12, exit: 3, stub: null });
    expect(lossy.warnings.some((w) => /more than 1 dB/.test(w))).toBe(true);
    const tight = run({ solveFor: 'stub', rate: 112e9, mod: 'nrz', k: 10 });
    expect(tight.warnings.some((w) => /under 0\.1 mm/.test(w))).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
});

type Num = { key: string; min: number; max: number; integer?: boolean; optional?: boolean };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, integer: f.integer, optional: f.optional });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('via stub — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 5;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) {
        const v = f.optional && rnd() < 0.4 ? null : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
        s[f.key] = f.integer && v != null ? Math.round(v) : v;
      }
      if (i % 2) {
        s.nL = 2 + Math.floor(28 * rnd());
        s.exit = 1 + Math.floor(((s.nL as number) - 1) * rnd());
        s.rate = 1e9 * 10 ** (2 * rnd());
        s.k = 1 + 9 * rnd();
      }
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as StubState;
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
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '', r.status?.text ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of sr.y) expect(Number.isFinite(y), g.id).toBe(true);
      for (const t of r.tables) for (const d of t.display ?? []) for (const v of Object.values(d)) expect(v).not.toMatch(BAD);
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      for (const k of ['fres', 'kAch', 'dIL']) expect(Math.abs(res(again, k) - res(r, k))).toBeLessThanOrEqual(1e-7 * Math.max(Math.abs(res(r, k)), 1e-9));
    }
    expect(ok).toBeGreaterThan(200);
  });
});

describe('via stub — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
    }
  });
  it('compute stays fast (< 20 ms warm)', () => {
    for (let i = 0; i < 5; i++) run({});
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) for (const ex of def.examples!) run(ex.state);
    expect((performance.now() - t0) / (20 * def.examples!.length)).toBeLessThan(20);
  });
});
