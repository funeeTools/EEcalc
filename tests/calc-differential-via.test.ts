import { describe, expect, it } from 'vitest';
import { def, type DiffViaState } from '@/calculators/differential-via/def';
import { ETA0, johnsonC, johnsonL, partialL, stubResonance, viaIL, zcoax, zdiffVia } from '@/calculators/differential-via/model';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<DiffViaState>) => def.compute({ ...def.defaults(), ...p });
const r0 = (model: DiffViaState['model']) => run({ solveFor: 'zdiff', model, D: 2e-3, p: 1e-3 });
const IN = 0.0254;

describe('differential via — published values', () => {
  it('IEEE Std 287 7 mm air line (D 7.000, d 3.040 mm) is a 50 Ω coax → separate-antipad pair is 2 × 49.98 Ω', () => {
    expect(zcoax(3.04e-3, 7e-3, 1)).toBeCloseTo(49.98, 1);
    expect(zdiffVia('separate', 3.04e-3, 7e-3, 10e-3, 1)).toBeCloseTo(2 * zcoax(3.04e-3, 7e-3, 1), 12);
  });
  it('Johnson & Graham ch. 7 examples: 0.028 in pad, 0.055 in clearance, 0.063 in FR-4 board → 0.41 pF; 0.063 in via, 0.016 in drill → 1.2 nH', () => {
    expect(johnsonC(4.4, 0.063 * IN, 0.028 * IN, 0.055 * IN) * 1e12).toBeCloseTo(0.405, 3);
    expect(johnsonL(0.063 * IN, 0.016 * IN) * 1e9).toBeCloseTo(1.2, 1);
  });
  it('two-wire line (Pozar Table 2.1): Z = (η/π)·arccosh(p/d); 300 Ω twin-lead needs p/d = cosh(300π/η₀) in air', () => {
    const pd = Math.cosh((300 * Math.PI) / ETA0);
    expect(zdiffVia('none', 1e-3, 0, pd * 1e-3, 1)).toBeCloseTo(300, 9);
  });
});

describe('differential via — review fixes', () => {
  it('Rosa/Grover partial inductance 5.08h[ln(4h/d) − 1] is the primary L; the book form (+1) is 2 × 5.08h nH larger', () => {
    const h = 0.063 * IN;
    const d = 0.016 * IN;
    expect(partialL(h, d) * 1e9).toBeCloseTo(5.08 * 0.063 * (Math.log(15.75) - 1), 2); // 0.562 nH
    expect((johnsonL(h, d) - partialL(h, d)) * 1e9).toBeCloseTo(2 * 5.08 * 0.063, 2);
    const r = run({});
    expect(res(r, 'lPartial')).toBeCloseTo(partialL(1.6e-3, 0.25e-3), 18);
    expect(res(r, 'lJohnson')).toBeGreaterThan(res(r, 'lPartial'));
  });
  it('Johnson pad capacitance only for separate antipads (a ground-via ring is not an antipad)', () => {
    expect(r0('shared').results.some((x) => x.key === 'cJohnson')).toBe(false);
    expect(r0('none').results.some((x) => x.key === 'cJohnson')).toBe(false);
    const sep = run({ solveFor: 'zdiff', model: 'separate', D: 0.65e-3, p: 1e-3, pad: 0.5e-3 });
    expect(res(sep, 'cJohnson')).toBeCloseTo(johnsonC(4, 1.6e-3, 0.5e-3, 0.65e-3), 18);
  });
  it('never writes Zdiff outside the 1–1000 Ω field (analysis)', () => {
    const r = run({ solveFor: 'zdiff', model: 'none', d: 10e-6, p: 20e-3, er: 1 }); // arccosh(2000) → 991 Ω: inside
    expect(r.ok).toBe(true);
    const hi = run({ solveFor: 'zdiff', model: 'shared', d: 10e-6, p: 5e-3, D: 20e-3, er: 1 });
    if (!hi.ok) expect(hi.error).toMatch(/outside 1–1000 Ω/);
    else expect(res(hi, 'zdiff')).toBeLessThanOrEqual(1000);
    const lo = run({ solveFor: 'zdiff', model: 'separate', d: 1e-3, D: 1.001e-3, p: 2e-3, er: 20 });
    expect(lo.ok).toBe(false);
    expect(lo.error).toMatch(/outside 1–1000 Ω/);
  });
});

describe('differential via — independent Python model (image charges, voltage-transfer S21)', () => {
  it('impedances and stub loss', () => {
    expect(zdiffVia('shared', 0.25e-3, 1.77e-3, 1e-3, 4)).toBeCloseTo(85.01782890853434, 9);
    expect(zdiffVia('separate', 0.25e-3, 0.65e-3, 1e-3, 4)).toBeCloseTo(57.291024981569244, 9);
    expect(zdiffVia('none', 0.25e-3, 0, 0.8e-3, 3.66)).toBeCloseTo(114.76614442127011, 9);
    const z = zdiffVia('shared', 0.3e-3, 2e-3, 1e-3, 4);
    expect(z).toBeCloseTo(83.1201188515829, 9);
    expect(viaIL(14e9, z, 100, 4, 0.018, 0.4e-3, 2.6e-3)).toBeCloseTo(22.31565596683958, 8);
    expect(viaIL(14e9, z, 100, 4, 0.018, 0.4e-3, 0.2e-3)).toBeCloseTo(0.07914475415693346, 10);
  });
});

describe('differential via — physics', () => {
  it('shared ring → ∞ tends to the thin-wire two-wire form (η/π)·ln(2p/d)', () => {
    const z = zdiffVia('shared', 0.1e-3, 100, 1e-3, 4);
    expect(z / ((ETA0 / (Math.PI * 2)) * Math.log(20))).toBeCloseTo(1, 9);
  });
  it('Zdiff rises with antipad D, falls with d and εr (1/√εr)', () => {
    expect(zdiffVia('separate', 0.25e-3, 0.7e-3, 1e-3, 4)).toBeGreaterThan(zdiffVia('separate', 0.25e-3, 0.6e-3, 1e-3, 4));
    expect(zdiffVia('shared', 0.3e-3, 2e-3, 1e-3, 4)).toBeLessThan(zdiffVia('shared', 0.25e-3, 2e-3, 1e-3, 4));
    expect(zdiffVia('none', 0.25e-3, 0, 1e-3, 1) / zdiffVia('none', 0.25e-3, 0, 1e-3, 4)).toBeCloseTo(2, 12);
  });
  it('stub: f_res ∝ 1/ℓ; IL peaks near f_res; no stub and matched via → IL ≈ dielectric loss only', () => {
    expect(stubResonance(1e-3, 4) / stubResonance(2e-3, 4)).toBeCloseTo(2, 12);
    const fr = stubResonance(1.5e-3, 4);
    const near = viaIL(fr, 100, 100, 4, 0.01, 0.1e-3, 1.5e-3);
    expect(near).toBeGreaterThan(viaIL(fr * 0.5, 100, 100, 4, 0.01, 0.1e-3, 1.5e-3));
    expect(near).toBeGreaterThan(viaIL(fr * 1.5, 100, 100, 4, 0.01, 0.1e-3, 1.5e-3));
    const alphaDb = ((Math.PI * 10e9 * 2 * 0.01) / 299792458) * 1e-3 * 20 * Math.LOG10E;
    expect(viaIL(10e9, 100, 100, 4, 0.01, 1e-3, 0)).toBeCloseTo(alphaDb, 9);
  });
  it('back-drilling shortens the stub and raises f_res', () => {
    const a = run({ solveFor: 'zdiff', h: 3e-3, lUse: 0.4e-3, backdrill: null });
    const b = run({ solveFor: 'zdiff', h: 3e-3, lUse: 0.4e-3, backdrill: 0.2e-3 });
    expect(res(b, 'fRes')).toBeGreaterThan(res(a, 'fRes'));
    expect(res(b, 'il')).toBeLessThan(res(a, 'il'));
  });
});

describe('differential via — solve-for round trips', () => {
  it('D, p and d for every return path where they enter, several points', () => {
    const geos: Partial<DiffViaState>[] = [
      { model: 'shared', d: 0.25e-3, D: 1.77e-3, p: 1e-3 },
      { model: 'shared', d: 0.2e-3, D: 2.5e-3, p: 0.8e-3, er: 3.66 },
      { model: 'separate', d: 0.3e-3, D: 0.7e-3, p: 1.2e-3 },
      { model: 'none', d: 0.25e-3, D: 1e-3, p: 0.9e-3 },
    ];
    for (const g of geos) {
      const z = res(run({ ...g, solveFor: 'zdiff' }), 'zdiff');
      for (const k of ['D', 'p', 'd'] as const) {
        if ((g.model === 'separate' && k === 'p') || (g.model === 'none' && k === 'D')) {
          expect(run({ ...g, solveFor: k, zdiff: z }).ok).toBe(false);
          continue;
        }
        const r = run({ ...g, solveFor: k, zdiff: z, [k]: g[k]! * 1.3 });
        expect(r.ok, `${g.model} ${k}: ${r.error}`).toBe(true);
        expect(res(r, k) / g[k]!).toBeCloseTo(1, 6);
        expect(res(run({ ...g, solveFor: 'zdiff', [k]: res(r, k) }), 'zdiff') / z).toBeCloseTo(1, 9);
      }
    }
  });
  it('the shared-ring pitch can have two solutions; both are reported', () => {
    // Zdiff(p) peaks between p → d and p → D − d
    const g = { model: 'shared' as const, d: 0.2e-3, D: 2e-3 };
    const ps = Array.from({ length: 200 }, (_, i) => 0.25e-3 + (1.5e-3 * i) / 199);
    const zs = ps.map((p) => zdiffVia('shared', g.d, g.D, p, 4));
    const zmax = Math.max(...zs);
    const r = run({ ...g, solveFor: 'p', zdiff: zmax * 0.97, er: 4 });
    expect(r.ok).toBe(true);
    expect(r.notes[0]).toMatch(/Two values of p/);
  });
  it('unreachable target reports the reachable range', () => {
    const r = run({ solveFor: 'D', zdiff: 500 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/reachable range/);
  });
});

describe('differential via — validity warnings', () => {
  it('thin-wire limit, ring close to barrels, stub loss, mismatch, overlapping antipads', () => {
    expect(run({ solveFor: 'zdiff', d: 0.4e-3, p: 0.9e-3, D: 2e-3 }).warnings.some((w) => w.includes('p/d'))).toBe(true);
    expect(run({ solveFor: 'zdiff', d: 0.2e-3, p: 1e-3, D: 1.3e-3 }).warnings.some((w) => w.includes('ring diameter'))).toBe(true);
    expect(run({ solveFor: 'zdiff', D: 2e-3, h: 3e-3, lUse: 0.4e-3 }).warnings.some((w) => w.includes('stub adds'))).toBe(true);
    expect(run({ solveFor: 'zdiff', model: 'separate', D: 0.4e-3, lUse: 1.6e-3, f: 30e9 }).warnings.some((w) => w.includes('barrel section alone'))).toBe(true);
    const o = run({ solveFor: 'zdiff', model: 'separate', D: 1.2e-3, p: 1e-3 });
    expect(o.ok).toBe(false);
    expect(o.error).toMatch(/overlap/);
    expect(run({}).warnings).toEqual([]);
  });
});

type Num = { key: string; min: number; max: number; optional?: boolean };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, optional: f.optional });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity/;

describe('differential via — fuzz (400 random states)', () => {
  it('never throws; finite results; clean strings; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 2024;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.optional && rnd() < 0.4 ? null : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      // half the states get a valid geometry for their model so the compute path is exercised
      if (i % 2) {
        const d = s.d as number;
        s.p = d * (1.3 + 6 * rnd());
        s.D = s.model === 'shared' ? ((s.p as number) + d) * (1.05 + 2 * rnd()) : s.model === 'separate' ? d + ((s.p as number) - d) * (0.2 + 0.7 * rnd()) : s.D;
        s.lUse = (s.h as number) * rnd();
      }
      s.solveFor = def.solve!.options[i % 4].key;
      const st = s as unknown as DiffViaState;
      let r!: CalcReport;
      expect(() => (r = def.compute(st))).not.toThrow();
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
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of sr.y) expect(Number.isFinite(y), g.id).toBe(true);
      const solved = r.results.find((q) => q.solved)!;
      const again = def.compute({ ...st, [st.solveFor]: solved.value as number });
      expect(again.ok).toBe(true);
      for (const k of ['zdiff', 'il']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 7);
    }
    expect(ok).toBeGreaterThan(80); // the rest: random geometries the chosen model cannot represent (reported)
  });
});

describe('differential via — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
  });
});

describe('differential via — return-path switches (review regressions)', () => {
  const field = (key: string): any => def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === key);
  const pick = (st: DiffViaState, v: DiffViaState['model']) => {
    st.model = v;
    field('model').apply(v, st, st);
    return def.compute(st);
  };
  it('every return-path switch from the defaults and examples computes (separate / none were red errors)', () => {
    for (const ex of def.examples!) {
      for (const m of ['shared', 'separate', 'none'] as const) {
        const st = { ...def.defaults(), ...ex.state } as DiffViaState;
        const first = def.compute(st);
        for (const r of first.results) if (r.solved && typeof r.value === 'number') (st as any)[r.key] = r.value;
        if (m === st.model) continue;
        const r = pick(st, m);
        expect(r.ok, `${ex.id} → ${m}: ${r.error}`).toBe(true);
        expect(st.solveFor).toBe('zdiff');
      }
    }
  });
  it('shared → separate → shared returns to the same Zdiff (D mapped by the pitch)', () => {
    const st = { ...def.defaults() } as DiffViaState;
    const z0 = res(def.compute(st), 'zdiff');
    st.D = res(def.compute(st), 'D');
    const sep = pick(st, 'separate');
    expect(st.D).toBeCloseTo(def.defaults().D - st.p, 3);
    expect(sep.ok).toBe(true);
    const back = pick(st, 'shared');
    expect(res(back, 'zdiff') / z0).toBeCloseTo(1, 3);
  });
  it('the pitch is not offered as an unknown with separate antipads', () => {
    const ps = def.fields.flatMap((f: any) => f.fields ?? [f]).filter((f: any) => f.key === 'p');
    const shown = ps.filter((f: any) => !f.visible || f.visible({ model: 'separate' }, { model: 'separate' }));
    expect(shown).toHaveLength(1);
    expect(shown[0].solvable).toBeFalsy();
  });
});
