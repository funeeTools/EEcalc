import { describe, expect, it } from 'vitest';
import { def, type CwgState } from '@/calculators/circular-waveguide/def';
import { P_TE, P_TM, alphaCTE11Pozar, besselJ, circAlphaC, circCutoff, circWave } from '@/calculators/circular-waveguide/model';
import { NP_TO_DB } from '@/calculators/waveguide-cutoff/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<CwgState>) => def.compute({ ...def.defaults(), ...p });
const ex = (id: string) => def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === id)!.state } as CwgState);

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

describe('circular waveguide — Bessel zeros', () => {
  it('Pozar Tables 3.4 (p′nm) and 3.5 (pnm), 3 decimals', () => {
    const pTE = [[3.832, 7.016, 10.174], [1.841, 5.331, 8.536], [3.054, 6.706, 9.97]];
    const pTM = [[2.405, 5.52, 8.654], [3.832, 7.016, 10.174], [5.135, 8.417, 11.62]];
    for (let n = 0; n < 3; n++)
      for (let m = 0; m < 3; m++) {
        // Pozar prints 3 decimals and truncates some (5.1356 → 5.135)
        expect(Math.abs(P_TE[n][m] - pTE[n][m])).toBeLessThan(1e-3);
        expect(Math.abs(P_TM[n][m] - pTM[n][m])).toBeLessThan(1e-3);
      }
  });
  it('Abramowitz & Stegun Table 9.5 to 10 digits', () => {
    expect(P_TM[0][0]).toBeCloseTo(2.4048255577, 10);
    expect(P_TM[0][1]).toBeCloseTo(5.5200781103, 10);
    expect(P_TM[1][0]).toBeCloseTo(3.8317059702, 10);
    expect(P_TM[2][0]).toBeCloseTo(5.1356223018, 10);
    expect(P_TE[1][0]).toBeCloseTo(1.8411837813, 10);
    expect(P_TE[2][0]).toBeCloseTo(3.0542369282, 10);
    expect(P_TE[3][0]).toBeCloseTo(4.2011889412, 10);
  });
  it('every tabulated value is a zero of J_n or J_n′ (independent series in the test) and sorted', () => {
    const dJ = (n: number, x: number) => (n === 0 ? -besselJ(1, x) : 0.5 * (besselJ(n - 1, x) - besselJ(n + 1, x)));
    for (let n = 0; n < 8; n++)
      for (let m = 0; m < 5; m++) {
        // the double-precision power series loses ~1e-8 to cancellation at x ≈ 25; A&S checks the digits
        expect(Math.abs(besselJ(n, P_TM[n][m]))).toBeLessThan(1e-7);
        expect(Math.abs(dJ(n, P_TE[n][m]))).toBeLessThan(1e-7);
        if (m > 0) expect(P_TE[n][m]).toBeGreaterThan(P_TE[n][m - 1]);
      }
    expect(P_TE[0]).toEqual(P_TM[1]); // J0′ = −J1
  });
});

describe('circular waveguide — published worked example', () => {
  it('Pozar ex. 3.2: PTFE-filled, a = 0.5 cm, gold, 14 GHz, 30 cm', () => {
    // Pozar (c = 3e8): fc TE11 = 12.19 GHz, TM01 = 15.92 GHz; k = 422.9, β = 208.0 /m, αd = 0.172 Np/m,
    // Rs = 0.0367 Ω, αc ≈ 0.0672 Np/m, total loss over 0.3 m ≈ 0.62 dB.
    const r = ex('pozar-3-2');
    const c = 299792458 / 3e8;
    expect(res(r, 'fcTE11') / 12.19e9).toBeCloseTo(c, 3);
    expect(res(r, 'fcTM01') / 15.92e9).toBeCloseTo(c, 3);
    expect(res(r, 'beta')).toBeCloseTo(208.0, -0.5);
    expect(res(r, 'alphaD') / NP_TO_DB).toBeCloseTo(0.172, 3);
    expect(res(r, 'rs')).toBeCloseTo(0.0367, 4);
    expect(res(r, 'alphaC') / NP_TO_DB).toBeCloseTo(0.0672, 3);
    expect(res(r, 'lossLen')).toBeCloseTo(0.62, 2);
    expect(r.status?.text).toBe('SINGLE MODE');
  });
});

describe('circular waveguide — independent Python reference (circ_ref.py, numerical perturbation integrals)', () => {
  it('αc of TE11, TE01, TM01, TE21 matches the numerical field integration', () => {
    expect(circAlphaC('TE', 0.005, 1, 1, 2.08, 14e9, 4.098e7)! / 0.06708783120467343).toBeCloseTo(1, 6);
    expect((circAlphaC('TE', 0.0105, 1, 1, 1, 10e9, 5.813e7)! * NP_TO_DB) / 0.11684663765509154).toBeCloseTo(1, 6);
    expect((circAlphaC('TE', 0.006, 0, 1, 1, 60e9, 5.813e7)! * NP_TO_DB) / 0.07343774050071634).toBeCloseTo(1, 6);
    expect((circAlphaC('TM', 0.0135, 0, 1, 1, 9.4e9, 3.816e7)! * NP_TO_DB) / 0.12469323106130625).toBeCloseTo(1, 6);
    expect((circAlphaC('TE', 0.01, 2, 1, 1, 20e9, 5.813e7)! * NP_TO_DB) / 0.15900551838007765).toBeCloseTo(1, 6);
    expect(res(run({}), 'lg') / 0.05473426281073305).toBeCloseTo(1, 10);
  });
  it('general TE formula equals Pozar eq. 3.133 for TE11', () => {
    for (const f of [9e9, 12e9, 20e9, 50e9]) expect(circAlphaC('TE', 0.0105, 1, 1, 1.5, f, 5.8e7)! / alphaCTE11Pozar(0.0105, 1.5, f, 5.8e7)!).toBeCloseTo(1, 12);
  });
});

describe('circular waveguide — solve round trips', () => {
  const pts: Partial<CwgState>[] = [
    {},
    { a: 0.05, f: 6e9, er: 2.25, modeType: 'TE', n: 2, m: 1 },
    { a: 1e-3, f: 150e9, modeType: 'TM', n: 0, m: 1 },
    { a: 0.2, f: 2.5e9, modeType: 'TE', n: 0, m: 2 },
  ];
  it('radius from cutoff, f and radius from λg reproduce the analysis', () => {
    for (const p of pts) {
      const fwd = run({ ...p, solveFor: 'fc' });
      expect(fwd.ok).toBe(true);
      const a0 = (p.a ?? def.defaults().a)!;
      const f0 = (p.f ?? def.defaults().f)!;
      const fc = res(fwd, 'fc');
      const lg = res(fwd, 'lg');
      expect(lg).toBeGreaterThan(0);
      expect(res(run({ ...p, solveFor: 'a', fc, a: 1 }), 'a') / a0).toBeCloseTo(1, 9);
      expect(res(run({ ...p, solveFor: 'f', lg, f: 1 }), 'f') / f0).toBeCloseTo(1, 9);
      const ra = run({ ...p, solveFor: 'aLg', lg, a: 1 });
      expect(res(ra, 'a') / a0).toBeCloseTo(1, 9);
      expect(res(run({ ...p, a: res(ra, 'a') }), 'lg') / lg).toBeCloseTo(1, 9);
    }
  });
  it('impossible targets fail cleanly', () => {
    const r = run({ solveFor: 'aLg', lg: 0.01, f: 10e9 });
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.results).toEqual([]);
    const r2 = run({ solveFor: 'a', fc: 1e6 });
    expect(r2.error).toMatch(/outside 50 µm/);
    expect(run({ n: 9 }).ok).toBe(false);
    expect(run({ m: 0 }).error).toMatch(/Mode indices/);
  });
});

describe('circular waveguide — physics sanity', () => {
  it('cutoff ∝ 1/a and 1/√εr; TE11 < TM01 < TE21 < TE01 = TM11', () => {
    expect(circCutoff('TE', 0.01, 1, 1, 1) / circCutoff('TE', 0.02, 1, 1, 1)).toBeCloseTo(2, 12);
    expect(circCutoff('TE', 0.01, 1, 1, 1) / circCutoff('TE', 0.01, 1, 1, 4)).toBeCloseTo(2, 12);
    const a = 0.01;
    expect(circCutoff('TE', a, 1, 1, 1)).toBeLessThan(circCutoff('TM', a, 0, 1, 1));
    expect(circCutoff('TM', a, 0, 1, 1)).toBeLessThan(circCutoff('TE', a, 2, 1, 1));
    expect(circCutoff('TE', a, 0, 1, 1)).toBe(circCutoff('TM', a, 1, 1, 1));
  });
  it('TE01 loss falls with frequency far above cutoff (≈ f^−3/2); TE11 and TM01 rise', () => {
    const a = 0.02;
    const l1 = circAlphaC('TE', a, 0, 1, 1, 50e9, 5.8e7)!;
    const l2 = circAlphaC('TE', a, 0, 1, 1, 100e9, 5.8e7)!;
    expect(l1 / l2).toBeGreaterThan(2.7); // 2^1.5 = 2.83 asymptotically
    expect(circAlphaC('TM', a, 0, 1, 1, 100e9, 5.8e7)!).toBeGreaterThan(circAlphaC('TM', a, 0, 1, 1, 50e9, 5.8e7)!);
    expect(circAlphaC('TE', a, 1, 1, 1, 100e9, 5.8e7)!).toBeGreaterThan(circAlphaC('TE', a, 1, 1, 1, 50e9, 5.8e7)!);
  });
  it('vp·vg = c², evanescent TE11 decay → 15.99/a dB far below cutoff', () => {
    const r = run({ f: 12e9 });
    expect(res(r, 'vp') * res(r, 'vg')).toBeCloseTo(1, 12);
    const w = circWave('TE', 0.003, 1, 1, 1, 1e6);
    expect((w.alphaEv! * NP_TO_DB * 0.003) / (1.8411837813 * NP_TO_DB)).toBeCloseTo(1, 6);
  });
});

describe('circular waveguide — validity warnings', () => {
  const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));
  it('cut off, near cutoff, near TM01, multimode, incomplete table, lossy filling, skin depth', () => {
    expect(has(ex('vent-cell'), /is cut off/)).toBe(true);
    expect(has(run({ f: 8.5e9 }), /within 5 %/)).toBe(true);
    expect(has(run({ f: 10.6e9 }), /TM₀₁ cutoff/)).toBe(true);
    expect(has(ex('tm01-rotary'), /modes propagate/)).toBe(true);
    expect(has(run({ a: 0.1, f: 20e9 }), /not listed/)).toBe(true);
    expect(res(run({ a: 0.1, f: 20e9 }), 'nProp')).toBeGreaterThan(20);
    expect(has(run({ tanD: 0.2 }), /tan δ = 0.2/)).toBe(true);
    expect(has(run({ a: 5e-5, f: 2.5e12, sigma: 1e5 }), /Skin depth/)).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
});

describe('circular waveguide — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = def.compute({ ...def.defaults(), ...e.state } as CwgState);
      expect(r.ok, e.id).toBe(true);
      sane(r);
    }
  });
  it('300+ random states through runCompute: no throw, finite values, no NaN text, never OUT OF RANGE, stable recompute', () => {
    for (const raw of fuzzStates(def, 360, 23)) {
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
    for (let i = 0; i < 20; i++) run({ f: 9e9 + i * 1e8 });
    expect((performance.now() - t0) / 20).toBeLessThan(50);
  });
});

describe('circular waveguide — review fixes', () => {
  const rc = (p: Partial<CwgState>) => runCompute(def, normalizeState(def, { ...def.defaults(), ...p }));
  it('#6 valid analyses are never refused (high-order modes in a 50 µm pipe reach f_c ≈ 24 THz)', () => {
    const r = rc({ a: 5e-5, modeType: 'TM', n: 7, m: 5, f: 1e9 });
    expect(r.ok).toBe(true);
    expect(res(r, 'fc')).toBeGreaterThan(3e12);
    let seed = 29;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 3000; i++) {
      const st = { solveFor: 'fc' as const, modeType: (rnd() < 0.5 ? 'TE' : 'TM') as CwgState['modeType'], n: Math.floor(rnd() * 8), m: 1 + Math.floor(rnd() * 5), a: 5e-5 * 1e5 ** rnd(), f: 1e6 * 3e6 ** rnd(), er: 1 + 99 * rnd() };
      expect(rc(st).ok, JSON.stringify(st)).toBe(true);
    }
  });
  it('#3 mode-table tones judge single-mode operation (TE11 dominant)', () => {
    const tones = (p: Partial<CwgState>) => run(p).tables[0].rowTones!;
    expect(tones({}).slice(0, 3)).toEqual(['pass', 'warn', '']); // TM01 at 10.93 GHz is < 10 % above 10 GHz
    expect(tones({ f: 9.5e9 }).slice(0, 2)).toEqual(['pass', '']);
    expect(tones({ f: 9e9 })[0]).toBe('warn'); // 1.076 f_c: within 10 % of cutoff
    expect(tones({ f: 12e9 })[1]).toBe('fail'); // TM01 propagates
    expect(tones({ f: 7e9 })[0]).toBe('fail');
  });
});

describe('circular waveguide — mode-switch regressions', () => {
  const modeType = (def.fields[1] as any).fields.find((f: any) => f.key === 'modeType');
  it('a mode-type switch drops a cutoff / λg target set for the old mode', () => {
    for (const solveFor of ['a', 'f', 'aLg'] as const) {
      const st: any = { ...def.defaults(), solveFor };
      runCompute(def, st);
      const a = st.a;
      const f = st.f;
      st.modeType = 'TM';
      modeType.apply('TM', st, st);
      expect(st.solveFor).toBe('fc');
      expect(runCompute(def, st).ok).toBe(true);
      expect([st.a, st.f]).toEqual([a, f]);
    }
  });
});
