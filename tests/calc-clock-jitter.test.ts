import { describe, expect, it } from 'vitest';
import { type JitterState, def } from '@/calculators/clock-jitter/def';
import { bathtub, budget, erfc, jitterSnr, qfunc, qinv, totalJitter } from '@/calculators/clock-jitter/model';
import type { SelectField } from '@/core/form/form';
import { runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';

type R = { results: { key: string; value: unknown; display: string; solved?: boolean }[]; details?: any };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<JitterState>) => def.compute({ ...def.defaults(), ...p } as JitterState);

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const logU = (r: () => number, lo: number, hi: number) => lo * (hi / lo) ** r();


/** Field min/max by key (number fields, sections and groups; list items excluded). */
function fieldRanges(fields: any[], out: Record<string, { min: number; max: number }> = {}): Record<string, { min: number; max: number }> {
  for (const f of fields) {
    if (f.kind === 'number') out[f.key] = { min: f.min ?? -Infinity, max: f.max ?? Infinity };
    else if (f.fields && f.kind !== 'list') fieldRanges(f.fields, out);
  }
  return out;
}
/** Every solved result that is written back into an input lies inside that input's min/max. */
function expectSolvedInRange(rep: { ok: boolean; results: { key: string; value: unknown; solved?: boolean }[] }, ranges: Record<string, { min: number; max: number }>, ctx: string): void {
  if (!rep.ok) return;
  for (const x of rep.results) {
    if (!x.solved || typeof x.value !== 'number' || !ranges[x.key]) continue;
    expect(x.value >= ranges[x.key].min && x.value <= ranges[x.key].max, `${ctx}: ${x.key} = ${x.value} outside [${ranges[x.key].min}, ${ranges[x.key].max}]`).toBe(true);
  }
}

describe('clock jitter', () => {
  it('IDT/Renesas AN-815 Table 1: BER → rms multiplier N = 2·Q(BER), and its 4 ps → 56.3 ps example', () => {
    const table: [number, number][] = [[1e-3, 6.18], [1e-4, 7.438], [1e-5, 8.53], [1e-6, 9.507], [1e-7, 10.399], [1e-8, 11.224], [1e-9, 11.996], [1e-10, 12.723], [1e-11, 13.412], [1e-12, 14.069], [1e-13, 14.698], [1e-14, 15.301], [1e-15, 15.883], [1e-16, 16.444]];
    for (const [ber, n] of table) expect(Math.abs(2 * qinv(ber) - n), String(ber)).toBeLessThan(5e-4);
    const r = run(def.examples!.find((e) => e.id === 'an815-rms-to-pp')!.state);
    expect(res(r, 'tj') * 1e12).toBeCloseTo(56.28, 2);
  });

  it('erfc / Q against tabulated values (Abramowitz & Stegun Table 7.1, Python math.erfc)', () => {
    expect(erfc(0)).toBe(1);
    expect(erfc(0.5)).toBeCloseTo(0.4795001221869535, 15);
    expect(erfc(1)).toBeCloseTo(0.15729920705028513, 15);
    expect(erfc(2) / 0.004677734981047266).toBeCloseTo(1, 13);
    expect(erfc(5) / 1.5374597944280349e-12).toBeCloseTo(1, 12);
    expect(qfunc(7.034483825301132) / 1e-12).toBeCloseTo(1, 11);
    expect(erfc(-1)).toBeCloseTo(2 - 0.15729920705028513, 15);
  });

  it('matches the independent Python calculation (reference values)', () => {
    const d = run({});
    expect(res(d, 'tj')).toBeCloseTo(1.703448382530113e-10, 21);
    expect(res(d, 'snr')).toBeCloseTo(50.057002546117324, 10);
    expect(qinv(1e-12)).toBeCloseTo(7.034483825301132, 11);
    expect(res(run({ solveFor: 'rj', mode: 'direct', dj: 12e-12, tj: 30e-12, ber: 1e-15 }), 'rj')).toBeCloseTo(1.1333092354440457e-12, 22);
    expect(res(run({ solveFor: 'ber', mode: 'direct', rj: 2e-12, dj: 90e-12, tj: 120e-12 }), 'ber') / 3.19089167291092e-14).toBeCloseTo(1, 9);
    expect(res(run({ solveFor: 'rate', mode: 'direct', rj: 20e-12, dj: 150e-12, ber: 1e-12, tsu: 120e-12, th: 80e-12 }), 'rate') / 1583833863.4759288).toBeCloseTo(1, 12);
  });

  it('solve round trips for every unknown at several points', () => {
    const bases: Partial<JitterState>[] = [{}, { rj: 0.3e-12, dj: 0, ber: 1e-15, rate: 25e9 }, { rj: 40e-12, dj: 2e-9, ber: 1e-6, rate: 100e6 }];
    for (const b of bases) {
      const fwd = run({ ...b, mode: 'direct', solveFor: 'tj' });
      const tj = res(fwd, 'tj');
      const st = { ...def.defaults(), ...b, mode: 'direct' as const } as JitterState;
      const ber = run({ ...st, solveFor: 'ber', tj });
      expect(res(ber, 'ber') / st.ber).toBeCloseTo(1, 8);
      const rj = run({ ...st, solveFor: 'rj', tj });
      expect(res(rj, 'rj') / st.rj).toBeCloseTo(1, 9);
      if (st.dj > 0) {
        const dj = run({ ...st, solveFor: 'dj', tj });
        expect(res(dj, 'dj') / st.dj).toBeCloseTo(1, 6);
      }
      const rate = run({ ...st, solveFor: 'rate' });
      const back = run({ ...st, solveFor: 'tj', rate: res(rate, 'rate') });
      expect(Math.abs(res(back, 'margin')) * res(rate, 'rate')).toBeLessThan(1e-9);
    }
  });

  it('budget: RSS for random, linear for deterministic, identical stages counted', () => {
    const b = budget([
      { name: 'a', kind: 'rj', value: 3e-12, count: 1 },
      { name: 'b', kind: 'rj', value: 4e-12, count: 1 },
      { name: 'c', kind: 'dj', value: 10e-12, count: 2 },
      { name: 'd', kind: 'rj', value: 1e-12, count: 4 },
    ]);
    expect(b.rj).toBeCloseTo(Math.sqrt(9 + 16 + 4) * 1e-12, 24);
    expect(b.dj).toBeCloseTo(20e-12, 24);
    const r = run({ mode: 'budget', solveFor: 'tj' });
    const exp = budget(def.defaults().terms);
    expect(res(r, 'rj')).toBeCloseTo(exp.rj, 24);
    expect(res(r, 'tj')).toBeCloseTo(totalJitter(exp.rj, exp.dj, 1e-12), 24);
    expect(r.tables.find((t) => t.id === 'budget')).toBeTruthy();
    // RJ/DJ cannot be the unknown with a budget
    expect(run({ mode: 'budget', solveFor: 'rj' }).ok).toBe(false);
  });

  it('physics: TJ grows as BER falls, SNR −20 dB/decade, doubling RJ doubles the random part', () => {
    let last = 0;
    for (const ber of [1e-3, 1e-6, 1e-9, 1e-12, 1e-15]) {
      const t = totalJitter(5e-12, 20e-12, ber);
      expect(t).toBeGreaterThan(last);
      last = t;
    }
    expect(jitterSnr(10e6, 1e-12) - jitterSnr(100e6, 1e-12)).toBeCloseTo(20, 12);
    expect(jitterSnr(100e6, 1e-12)).toBeCloseTo(64.0364, 3); // MT-008: 1 ps at 100 MHz ≈ 64 dB
    expect(totalJitter(10e-12, 0, 1e-12) / totalJitter(5e-12, 0, 1e-12)).toBeCloseTo(2, 12);
    const d = run({});
    expect(res(d, 'perJ') / res(d, 'rjIn')).toBeCloseTo(Math.SQRT2, 12);
    expect(res(d, 'c2cJ') / res(d, 'perJ')).toBeCloseTo(Math.sqrt(3), 12);
    // bathtub crosses the target BER where the eye opening starts: t = TJ/2
    const ui = 1e-9;
    expect(bathtub(totalJitter(5e-12, 20e-12, 1e-12) / 2, ui, 5e-12, 20e-12) / 1e-12).toBeCloseTo(1, 6);
  });

  it('validity: high-BER warning, closed eye, marginal timing, impossible solves', () => {
    expect(run({ ber: 1e-3 }).warnings.some((w) => w.includes('dual-Dirac'))).toBe(true);
    expect(run({ ber: 1e-12 }).warnings.some((w) => w.includes('dual-Dirac'))).toBe(false);
    const closed = run({ rate: 6e9 });
    expect(closed.status?.text).toBe('EYE CLOSED');
    expect(closed.warnings.some((w) => w.includes('exceeds'))).toBe(true);
    expect(run({ rate: 2e9 }).status?.text).toBe('MARGINAL');
    expect(run({ solveFor: 'ber', tj: 50e-12 }).ok).toBe(false); // TJ below DJ
    expect(run({ solveFor: 'dj', tj: 60e-12 }).ok).toBe(false); // RJ alone needs more
    expect(run({ solveFor: 'rj', tj: 80e-12 }).ok).toBe(false);
  });

  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
  });

  it('fuzz: 400 random states never throw, stay finite, and recompute stably', () => {
    const r = rng(99);
    const solves = ['tj', 'ber', 'rj', 'dj', 'rate'] as const;
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const mode = r() < 0.7 ? 'direct' : 'budget';
      const st: JitterState = {
        ...def.defaults(),
        mode,
        solveFor: solves[i % 5],
        rj: logU(r, 1e-16, 1e-3),
        dj: r() < 0.2 ? 0 : logU(r, 1e-15, 1e-3),
        ber: logU(r, 1e-18, 0.1),
        rho: r() < 0.5 ? 1 : 0.5,
        tj: logU(r, 1e-15, 1e-2),
        rate: logU(r, 1, 1e12),
        tsu: r() < 0.3 ? 0 : logU(r, 1e-15, 1e-3),
        th: r() < 0.3 ? 0 : logU(r, 1e-15, 1e-3),
        fin: logU(r, 1, 1e12),
        terms: Array.from({ length: 1 + Math.floor(r() * 6) }, (_, k) => ({ name: `t${k}`, kind: k === 0 || r() < 0.5 ? ('rj' as const) : ('dj' as const), value: r() < 0.1 ? 0 : logU(r, 1e-16, 1e-3), count: 1 + Math.floor(r() * 64) })),
      };
      let rep!: ReturnType<typeof def.compute>;
      expect(() => (rep = def.compute(st))).not.toThrow();
      if (!rep.ok) {
        expect(rep.error).toBeTruthy();
        continue;
      }
      ok++;
      for (const x of rep.results) {
        if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
        expect(x.display).not.toMatch(/NaN|undefined|Infinity/);
      }
      for (const t of rep.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(v).not.toMatch(/NaN|undefined|Infinity/);
      for (const t of [...rep.warnings, ...rep.notes, rep.summary ?? '']) expect(t).not.toMatch(/NaN|undefined|Infinity/);
      expectSolvedInRange(rep, fieldRanges(def.fields as any[]), JSON.stringify(st));
      for (const g of rep.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite) && s.x.every(Number.isFinite), g.id).toBe(true);
      const st2: any = { ...st, terms: st.terms.map((t) => ({ ...t })) };
      for (const x of rep.results) if (x.solved && typeof x.value === 'number') st2[x.key] = x.value;
      def.sync!(st2);
      const rep2 = def.compute(st2);
      expect(rep2.ok).toBe(true);
      for (const k of ['tj', 'tjAt', 'ber', 'rj', 'dj', 'rate', 'snr']) {
        const a = res(rep, k);
        if (typeof a === 'number' && a !== 0) expect(res(rep2, k) / a, k).toBeCloseTo(1, 8);
      }
    }
    expect(ok).toBeGreaterThan(150);
  });
});

describe('clock jitter — review regressions', () => {
  it('transition density: ρ_T = 1 gives the AN-815 2Q = 14.069, ρ_T = 0.5 gives 13.874 at 10⁻¹² (table display too)', () => {
    const one = run({ rho: 1, ber: 1e-12 });
    const half = run({ rho: 0.5, ber: 1e-12 });
    expect(2 * res(one, 'q')).toBeCloseTo(14.069, 3);
    expect(2 * res(half, 'q')).toBeCloseTo(13.874, 3);
    expect(res(half, 'tj')).toBeLessThan(res(one, 'tj'));
    const row = half.tables[0].display!.find((d) => d.ber.includes('◀'))!;
    expect(row.alpha).toBe('13.874');
    expect(half.notes.some((n) => n.includes('ρ_T = 0.5'))).toBe(true);
    // BER solve and forward agree under ρ_T = 0.5
    const b = run({ rho: 0.5, solveFor: 'ber', tj: res(half, 'tj') });
    expect(res(b, 'ber') / 1e-12).toBeCloseTo(1, 8);
  });

  it('a BER solve never writes a value outside 10⁻¹⁸ … 0.1', () => {
    const nearDj = run({ mode: 'direct', solveFor: 'ber', rj: 5e-12, dj: 100e-12, tj: 100e-12 + 1e-15 });
    expect(nearDj.ok).toBe(false);
    expect(nearDj.error).toContain('above 0.1');
    expect(nearDj.results.length).toBe(0);
    const tiny = run({ mode: 'direct', solveFor: 'ber', rj: 1e-12, dj: 0, tj: 1e-9 });
    expect(tiny.ok).toBe(false);
    expect(tiny.error).toContain('10⁻¹⁸');
  });

  it('warns when 2π·f_in·RJ ≥ 1 (SNR and ENOB would be negative)', () => {
    const r = run({ fin: 1e9, rj: 1e-9 });
    expect(res(r, 'snr')).toBeLessThan(0);
    expect(r.warnings.some((w) => w.includes('1/(2π·f_in)'))).toBe(true);
    expect(run({}).warnings.some((w) => w.includes('1/(2π·f_in)'))).toBe(false);
  });
});

describe('clock jitter — review round 2', () => {
  it('solved TJ, RJ, DJ and budget totals are never written outside their field ranges', () => {
    const cases: Partial<JitterState>[] = [
      // (a TJ above its field is no longer reachable: the TJ range now covers RJ = DJ = 1 ms at 10⁻¹⁸)
      { mode: 'direct', solveFor: 'rj', dj: 0, tj: 1e-2, ber: 0.1 },
      { mode: 'direct', solveFor: 'rj', dj: 0, tj: 1e-16, ber: 1e-18 },
      { mode: 'direct', solveFor: 'dj', rj: 1e-16, tj: 1e-2 },
      { mode: 'budget', solveFor: 'tj', terms: [{ name: 'a', kind: 'rj', value: 1e-3, count: 64 }, { name: 'b', kind: 'dj', value: 1e-3, count: 64 }] },
    ];
    for (const c of cases) {
      const r = run(c);
      expect(r.ok, JSON.stringify(c)).toBe(false);
      expect(r.error).toMatch(/outside|above/);
      expect(r.results.length).toBe(0);
    }
  });
});

describe('clock jitter — mode-switch regressions', () => {
  const sel = (st: any, key: string, v: unknown) => {
    const f = findField(def.fields, key)!.field as SelectField;
    st[key] = v;
    f.apply?.(v, st, st);
    return runCompute(def as any, st);
  };
  const ex = (id: string) => ({ ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === id)!.state) }) as any;
  it('BER example → budget of sources analyses TJ (no red error); back to typed values restores the BER solve', () => {
    const st = ex('ber-from-eye');
    const r0 = runCompute(def as any, st);
    expect(r0.ok).toBe(true);
    const ber0 = st.ber;
    const r1 = sel(st, 'mode', 'budget');
    expect(r1.ok).toBe(true);
    expect(st.solveFor).toBe('tj');
    const r2 = sel(st, 'mode', 'direct');
    expect(r2.ok).toBe(true);
    expect(st.solveFor).toBe('ber');
    expect([st.rj, st.dj, st.tj]).toEqual([2e-12, 90e-12, 120e-12]);
    expect(st.ber).toBeCloseTo(ber0, 20);
  });
  it('RJ unknown → budget → typed again returns the RJ solve and the typed DJ', () => {
    const st = ex('serdes-rj-limit');
    runCompute(def as any, st);
    const rj0 = st.rj;
    sel(st, 'mode', 'budget');
    expect(st.solveFor).toBe('tj');
    sel(st, 'mode', 'direct');
    expect(st.solveFor).toBe('rj');
    expect(st.dj).toBe(12e-12);
    expect(st.rj).toBeCloseTo(rj0, 25);
  });
  it('a value typed at a field limit solves back without a round-off error', () => {
    const st = { ...def.defaults(), rj: 1e-16 };
    runCompute(def as any, st);
    st.solveFor = 'rj';
    expect(runCompute(def as any, st).ok).toBe(true);
  });
  it('TJ range covers the largest RJ and DJ at the lowest BER', () => {
    const st = { ...def.defaults(), rj: 1e-3, dj: 1e-3, ber: 1e-18 };
    expect(runCompute(def as any, st).ok).toBe(true);
  });
});
