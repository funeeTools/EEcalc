import { describe, expect, it } from 'vitest';
import { def, type WgState } from '@/calculators/waveguide-cutoff/def';
import { alphaCTE10, rectAlphaC, rectCutoff, rectWave, NP_TO_DB } from '@/calculators/waveguide-cutoff/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<WgState>) => def.compute({ ...def.defaults(), ...p });
const INCH = 0.0254;
const WR90 = { wr: 'WR-90', a: 0.9 * INCH, b: 0.4 * INCH };

// ── generic fuzz helpers (field walk, random state, sanity of a report)
type NumF = { key: string; min: number; max: number; integer?: boolean };
function walk(fs: FieldSpec[], nums: NumF[], sels: { key: string; opts: (string | number)[] }[]) {
  for (const f of fs) {
    if (f.kind === 'section' || f.kind === 'group') walk(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? -1e3, max: f.max ?? 1e3, integer: f.integer });
    else if (f.kind === 'select') sels.push({ key: f.key, opts: f.options.map((o) => (typeof o === 'string' ? o : o.value)) });
  }
}
function fuzzStates(d: CalcDef<any>, n: number, seed = 7): Record<string, any>[] {
  const nums: NumF[] = [];
  const sels: { key: string; opts: (string | number)[] }[] = [];
  walk(d.fields, nums, sels);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const out: Record<string, any>[] = [];
  for (let i = 0; i < n; i++) {
    const st: Record<string, any> = { ...d.defaults() };
    for (const sel of sels) st[sel.key] = sel.opts[Math.floor(rnd() * sel.opts.length)];
    for (const f of nums) {
      let v = f.min > 0 && f.max / f.min > 100 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      if (f.integer) v = Math.round(v);
      st[f.key] = v;
    }
    if (d.solve) st.solveFor = d.solve.options[i % d.solve.options.length].key;
    out.push(st);
  }
  return out;
}
function sane(r: CalcReport) {
  for (const x of r.results) {
    if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
    expect(/NaN|undefined|Infinity/.test(x.display), `${x.key}: ${x.display}`).toBe(false);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(/NaN|undefined|Infinity/.test(v), v).toBe(false);
  for (const g of r.graphs) for (const sr of g.series ?? []) {
    expect(sr.x.every(Number.isFinite) && sr.y.every(Number.isFinite), `${g.id}/${sr.label}`).toBe(true);
  }
  for (const w of [...r.warnings, ...r.notes, r.summary ?? '', r.error ?? '']) expect(/NaN|undefined|Infinity/.test(w), w).toBe(false);
}

describe('rectangular waveguide — published values', () => {
  it('Pozar ex. 3.1: PTFE-filled K-band copper guide (a = 1.07 cm, b = 0.43 cm) at 15 GHz', () => {
    // Pozar (4th ed.) uses c = 3e8: fc10 = 9.72 GHz, TE20 19.44, TE01 24.19, TE11/TM11 26.06, β = 345.1 /m,
    // αd = 1.03 dB/m, αc = 0.434 dB/m (Rs = 0.0319 Ω).
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'pozar-3-1')!.state } as WgState);
    expect(r.ok).toBe(true);
    const c = 299792458 / 3e8;
    expect(res(r, 'fc') / 9.72e9).toBeCloseTo(c, 3);
    const t = r.tables[0].rows;
    expect((t[1].fc as number) / 19.44e9).toBeCloseTo(c, 3);
    expect((t[2].fc as number) / 24.19e9).toBeCloseTo(c, 3);
    expect((t[3].fc as number) / 26.06e9).toBeCloseTo(c, 3);
    expect(res(r, 'beta')).toBeCloseTo(345.1, -0.5); // 345.5 with the exact c
    expect(res(r, 'alphaD')).toBeCloseTo(1.03, 2);
    expect(res(r, 'alphaC')).toBeCloseTo(0.434, 2);
    expect(res(r, 'rs')).toBeCloseTo(0.0319, 4);
    expect(res(r, 'nProp')).toBe(1);
  });
  it('EIA WR-90: TE10 cutoff 6.557 GHz, recommended band 8.2–12.4 GHz ≈ 1.25–1.9 fc', () => {
    const r = run({});
    expect(res(r, 'fc') / 1e9).toBeCloseTo(6.5571, 3);
    expect(8.2 / 6.5571).toBeCloseTo(1.25, 1);
    expect(12.4 / 6.5571).toBeCloseTo(1.89, 2);
    expect(r.status?.text).toBe('SINGLE MODE');
  });
});

describe('rectangular waveguide — independent Python reference (rect_ref.py)', () => {
  // values from scratch rect_ref.py: closed forms from Pozar ch. 3, αc by numerical wall integration
  it('WR-90 copper at 10 GHz: λg, Z_TE, αc, P_max', () => {
    const r = run({});
    expect(res(r, 'lg') / 0.039707119211112106).toBeCloseTo(1, 10);
    expect(res(r, 'zw') / 498.97437630700523).toBeCloseTo(1, 10);
    expect(res(r, 'alphaC') / 0.10826407407767823).toBeCloseTo(1, 10);
    expect(res(r, 'pMax') / 1047307.486744512).toBeCloseTo(1, 10);
  });
  it('higher-mode conductor loss in WR-90 (TM11 and TE21 at 30 GHz, TE01 at 20 GHz)', () => {
    const a = WR90.a;
    const b = WR90.b;
    expect((rectAlphaC('TM', a, b, 1, 1, 1, 30e9, 5.813e7)! * NP_TO_DB) / 0.22078822641171156).toBeCloseTo(1, 10);
    expect((rectAlphaC('TE', a, b, 2, 1, 1, 30e9, 5.813e7)! * NP_TO_DB) / 0.2765219678351425).toBeCloseTo(1, 10);
    expect((rectAlphaC('TE', a, b, 0, 1, 1, 20e9, 5.813e7)! * NP_TO_DB) / 0.18987316947919358).toBeCloseTo(1, 10);
  });
  it('evanescent TE10 in a 25 mm square vent at 2.45 GHz: 996.22 dB/m', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'below-cutoff')!.state } as WgState);
    expect(res(r, 'alphaEv') / 996.2200111899969).toBeCloseTo(1, 10);
    expect(r.status?.tone).toBe('fail');
  });
  it('general perturbation integral equals Pozar eq. 3.96 for TE10 and the RWV TM formula', () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 100; i++) {
      const a = 1e-3 * 10 ** (3 * rnd());
      const b = a * (0.1 + rnd());
      const er = 1 + 5 * rnd();
      const f = rectCutoff(a, b, 1, 0, er) * (1.05 + 3 * rnd());
      expect(rectAlphaC('TE', a, b, 1, 0, er, f, 5.8e7)! / alphaCTE10(a, b, er, f, 5.8e7)!).toBeCloseTo(1, 12);
      const m = 1 + Math.floor(rnd() * 4);
      const n = 1 + Math.floor(rnd() * 4);
      const f2 = rectCutoff(a, b, m, n, er) * (1.05 + 3 * rnd());
      const w = rectWave('TM', a, b, m, n, er, f2);
      const rs = Math.sqrt((Math.PI * f2 * 4e-7 * Math.PI * 1.00000000055) / 5.8e7);
      const rwv = ((2 * rs) / (b * w.eta * Math.sqrt(1 - (w.fc / f2) ** 2))) * ((m * m * (b / a) ** 3 + n * n) / (m * m * (b / a) ** 2 + n * n));
      expect(rectAlphaC('TM', a, b, m, n, er, f2, 5.8e7)! / rwv).toBeCloseTo(1, 6);
    }
  });
});

describe('rectangular waveguide — solve round trips', () => {
  const pts: Partial<WgState>[] = [
    { ...WR90, f: 10e9 },
    { wr: 'Custom', a: 0.05, b: 0.02, f: 9e9, er: 2.08, modeType: 'TE', m: 2, n: 1 },
    { wr: 'Custom', a: 3e-3, b: 1.2e-3, f: 150e9, modeType: 'TM', m: 1, n: 1 },
    { wr: 'Custom', a: 0.3, b: 0.12, f: 900e6, er: 1.5, modeType: 'TE', m: 1, n: 0 },
  ];
  it('a from the cutoff, f and a from λg reproduce the forward analysis', () => {
    for (const p of pts) {
      const fwd = run({ ...p, solveFor: 'fc' });
      expect(fwd.ok).toBe(true);
      const fc = res(fwd, 'fc');
      const lg = res(fwd, 'lg');
      const ra = run({ ...p, solveFor: 'a', fc, a: 1 });
      expect(res(ra, 'a') / p.a!).toBeCloseTo(1, 9);
      const rf = run({ ...p, solveFor: 'f', lg, f: 1 });
      expect(res(rf, 'f') / p.f!).toBeCloseTo(1, 9);
      const raLg = run({ ...p, solveFor: 'aLg', lg, a: 1 });
      expect(res(raLg, 'a') / p.a!).toBeCloseTo(1, 9);
      // and the solved state analysed forward gives the same targets
      const back = run({ ...p, a: res(raLg, 'a'), solveFor: 'fc' });
      expect(res(back, 'lg') / lg).toBeCloseTo(1, 9);
    }
  });
  it('impossible targets fail with a message and never write NaN', () => {
    const r1 = run({ solveFor: 'a', fc: 1e9, b: 1e-3, m: 1, n: 1 });
    expect(r1.ok).toBe(false);
    expect(r1.status?.text).toBe('NO SOLUTION');
    expect(r1.results).toEqual([]);
    const r2 = run({ solveFor: 'aLg', lg: 0.01, f: 10e9 });
    expect(r2.error).toMatch(/longer than the wavelength/);
    const r3 = run({ solveFor: 'a', m: 0, n: 1 });
    expect(r3.error).toMatch(/depends only on b/);
    const r4 = run({ modeType: 'TM', m: 1, n: 0 });
    expect(r4.ok).toBe(false);
    expect(r4.error).toMatch(/TM modes need/);
  });
});

describe('rectangular waveguide — physics sanity', () => {
  it('cutoff scales 1/a; filling lowers it by √εr; TE and TM share it', () => {
    expect(rectCutoff(0.02, 0.01, 1, 0, 1) / rectCutoff(0.04, 0.01, 1, 0, 1)).toBeCloseTo(2, 12);
    expect(rectCutoff(0.02, 0.01, 1, 0, 1) / rectCutoff(0.02, 0.01, 1, 0, 4)).toBeCloseTo(2, 12);
    expect(rectCutoff(0.02, 0.01, 1, 0, 1)).toBeCloseTo(299792458 / 0.04, 0);
  });
  it('vp·vg = v², λg → λ far above cutoff, αc ∝ √σ⁻¹', () => {
    const r = run({ f: 12e9 });
    expect(res(r, 'vp') * res(r, 'vg')).toBeCloseTo(1, 12);
    const far = rectWave('TE', 0.02286, 0.01016, 1, 0, 1, 1e12);
    expect(far.lg! / (299792458 / 1e12)).toBeCloseTo(1, 3);
    const a1 = rectAlphaC('TE', 0.02286, 0.01016, 1, 0, 1, 10e9, 5.8e7)!;
    const a4 = rectAlphaC('TE', 0.02286, 0.01016, 1, 0, 1, 10e9, 4 * 5.8e7)!;
    expect(a1 / a4).toBeCloseTo(2, 12);
  });
  it('TE10 loss falls when b grows; λg falls monotonically with f', () => {
    expect(rectAlphaC('TE', 0.02286, 0.005, 1, 0, 1, 10e9, 5.8e7)!).toBeGreaterThan(rectAlphaC('TE', 0.02286, 0.01016, 1, 0, 1, 10e9, 5.8e7)!);
    let prev = Infinity;
    for (let f = 7e9; f < 20e9; f += 0.5e9) {
      const lg = rectWave('TE', 0.02286, 0.01016, 1, 0, 1, f).lg!;
      expect(lg).toBeLessThan(prev);
      prev = lg;
    }
  });
  it('evanescent decay → 27.29/a dB far below cutoff', () => {
    const w = rectWave('TE', 0.01, 0.005, 1, 0, 1, 1e6);
    expect((w.alphaEv! * NP_TO_DB) / (27.2875 / 0.01)).toBeCloseTo(1, 4);
  });
});

describe('rectangular waveguide — validity warnings', () => {
  const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));
  it('cut off, near cutoff, below/above the recommended band, multimode, b > a, outside WR band, lossy filling, thick skin', () => {
    expect(has(run({ f: 5e9 }), /is cut off/)).toBe(true);
    expect(has(run({ f: 6.7e9 }), /within 5 %/)).toBe(true);
    expect(has(run({ f: 7.5e9 }), /below the recommended 1.25/)).toBe(true);
    expect(has(run({ f: 12.6e9 }), /above the recommended 1.9/)).toBe(true);
    expect(has(run({ f: 16e9 }), /modes propagate/)).toBe(true);
    expect(has(run({ wr: 'Custom', a: 0.01, b: 0.02 }), /b > a/)).toBe(true);
    expect(has(run({ f: 13e9 }), /outside the WR-90 standard band/)).toBe(true);
    expect(has(run({ tanD: 0.1 }), /tan δ = 0.1 is large/)).toBe(true);
    expect(has(run({ wr: 'Custom', a: 1e-4, b: 1e-5, f: 2e12, sigma: 1e5 }), /Skin depth/)).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
});

describe('rectangular waveguide — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = def.compute({ ...def.defaults(), ...ex.state } as WgState);
      expect(r.ok, ex.id).toBe(true);
      sane(r);
    }
  });
  it('300+ random states through runCompute: no throw, finite values, no NaN text, never OUT OF RANGE, stable recompute', () => {
    for (const raw of fuzzStates(def, 360, 11)) {
      const st = normalizeState(def, raw);
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      expect(r.status?.text, JSON.stringify(raw)).not.toBe('OUT OF RANGE');
      if (!r.ok) {
        expect(r.error).toBeTruthy();
        continue;
      }
      sane(r);
      // runCompute wrote the solved values into st: recomputing that state gives the same answer
      const r2 = runCompute(def, { ...st });
      expect(r2.ok, JSON.stringify(raw)).toBe(true);
      for (const x of r.results.filter((q) => q.solved && typeof q.value === 'number')) expect(res(r2, x.key) / (x.value as number)).toBeCloseTo(1, 9);
    }
  }, 60000);
  it('computes well under 50 ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) run({ f: 8e9 + i * 1e8 });
    expect((performance.now() - t0) / 20).toBeLessThan(50);
  });
});

describe('rectangular waveguide — review fixes', () => {
  const rc = (p: Partial<WgState>) => runCompute(def, normalizeState(def, { ...def.defaults(), ...p }));
  it('#1 square guide: TE10 and TE01 are degenerate, so there is no single-mode band', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'below-cutoff')!.state } as WgState);
    const sb = r.results.find((x) => x.key === 'singleBand')!;
    expect(sb.value).toBeNull();
    expect(sb.display).toBe('none');
    expect(sb.note).toMatch(/TE₁₀ \/ TE₀₁/);
    expect(res(r, 'nextMode') / 8.479e9).toBeCloseTo(1, 3); // next distinct cutoff: TE11/TM11
    const above = run({ wr: 'Custom', a: 25e-3, b: 25e-3, f: 7e9 });
    expect(above.warnings.some((w) => /no single-mode band/.test(w))).toBe(true);
    expect(res(run({}), 'singleBand')).toBeCloseTo(6.557e9, -6); // WR-90 still has one
  });
  it('#2 valid analyses are never refused: f_c = 3.35 THz (TE10,10 in 1 × 0.5 mm) and λg near cutoff', () => {
    const r = rc({ wr: 'Custom', a: 1e-3, b: 0.5e-3, m: 10, n: 10, f: 2.9e12 });
    expect(r.ok).toBe(true);
    expect(res(r, 'fc') / 3.3518e12).toBeCloseTo(1, 3);
    const fc = rectCutoff(10, 0.5, 1, 0, 1);
    const r2 = rc({ wr: 'Custom', a: 10, b: 0.5, f: fc * (1 + 1e-14) });
    expect(r2.ok).toBe(true);
    const lg = r2.results.find((x) => x.key === 'lg')!;
    expect(lg.value).toBeNull(); // shown in the display, not written into the box
    expect(lg.display).toMatch(/m$/);
    // 3000 random analyses: every one with a valid mode computes
    let seed = 17;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 3000; i++) {
      const type = rnd() < 0.5 ? 'TE' : 'TM';
      const m = Math.floor(rnd() * 11);
      const n = Math.floor(rnd() * 11);
      if (type === 'TE' ? m + n === 0 : m === 0 || n === 0) continue;
      const st = { wr: 'Custom', solveFor: 'fc' as const, modeType: type as WgState['modeType'], m, n, a: 1e-4 * 1e5 ** rnd(), b: 1e-5 * 1e6 ** rnd(), f: 1e6 * 3e6 ** rnd(), er: 1 + 99 * rnd() };
      const r3 = rc(st);
      expect(r3.ok, JSON.stringify(st)).toBe(true);
    }
  });
  it('#3 mode-table tones judge single-mode operation', () => {
    const tones = (p: Partial<WgState>) => run(p).tables[0].rowTones!;
    expect(tones({}).slice(0, 4)).toEqual(['pass', '', '', '']); // WR-90 at 10 GHz
    expect(tones({ f: 12.5e9 }).slice(0, 3)).toEqual(['pass', 'warn', '']); // TE20 at 13.11 GHz is < 10 % above f
    expect(tones({ f: 16e9 }).slice(0, 3)).toEqual(['pass', 'fail', 'fail']); // TE20, TE01 propagate
    expect(tones({ f: 6.8e9 })[0]).toBe('warn');
    expect(tones({ f: 5e9 })[0]).toBe('fail');
    expect(run({}).tables[0].note).toMatch(/single-mode operation/);
  });
  it('#4 band messages print the ratio with enough digits not to contradict the limit', () => {
    const r = run({ f: 1.2495 * rectCutoff(0.9 * INCH, 0.4 * INCH, 1, 0, 1) });
    const w = r.warnings.find((x) => /recommended 1.25/.test(x))!;
    expect(w).toMatch(/f = 1\.2495 f_c/);
  });
  it('#5 every number label fits the input column (≤ 14 characters)', () => {
    const labels: string[] = [];
    const walk2 = (fs: FieldSpec[]) => fs.forEach((f) => (f.kind === 'section' ? walk2(f.fields) : f.kind === 'number' && labels.push(f.label)));
    walk2(def.fields);
    for (const l of labels) expect(l.length, l).toBeLessThanOrEqual(14);
    expect(labels).toContain('Breakdown E');
  });
});

describe('rectangular waveguide — mode-switch regressions', () => {
  const modeType = (def.fields[1] as any).fields.find((f: any) => f.key === 'modeType');
  it('TE₁₀ → TM lands on TM₁₁ (no red error), and a mode switch drops the old mode’s target', () => {
    const st: any = { ...def.defaults() };
    st.modeType = 'TM';
    modeType.apply('TM', st, st);
    expect([st.m, st.n]).toEqual([1, 1]);
    expect(runCompute(def, st).ok).toBe(true);
    // designing a for a 6.5 GHz TE₁₀ cutoff, then TE → TM: analyse the designed guide, not redesign it
    const d: any = { ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === 'design-6g5')!.state) };
    runCompute(def, d);
    const a = d.a;
    d.modeType = 'TM';
    modeType.apply('TM', d, d);
    expect(d.solveFor).toBe('fc');
    expect(runCompute(def, d).ok).toBe(true);
    expect(d.a).toBe(a);
  });
});
