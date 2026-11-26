import { describe, expect, it } from 'vitest';
import { def, type ThermalViaState } from '@/calculators/via-thermal/def';
import { fillTheta, laminateRA, maxFit, platingTheta, thermalVias } from '@/calculators/via-thermal/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<ThermalViaState>) => def.compute({ ...def.defaults(), ...p });

describe('thermal vias — sources', () => {
  // No published numeric worked example of a via-array θ was found (Shen et al. 2020 give normalised curves and
  // measured case-to-ambient values that include the heatsink). The checks below use Fourier's law for a slab,
  // θ = L/(kA) (Incropera §3.1), worked by hand, with the material data of Shen et al. Table I.
  it('Fourier slab by hand: 0.3 mm drill, 25 µm plating, 1.6 mm, k = 393 → A = π(0.15² − 0.125²) mm², θ = 188.5 K/W', () => {
    const A = Math.PI * (0.15e-3 ** 2 - 0.125e-3 ** 2); // 2.1598e-8 m²
    expect(A).toBeCloseTo(2.1598e-8, 11);
    expect(platingTheta(0.3e-3, 25e-6, 1.6e-3, 393)).toBeCloseTo(1.6e-3 / (393 * A), 9);
    expect(platingTheta(0.3e-3, 25e-6, 1.6e-3, 393)).toBeCloseTo(188.5, 1);
  });
  it('Shen et al. Table I conductivities: an SnAgCu-filled core of 0.25 mm in 1.6 mm conducts h/(57.3·π·0.125²) → 568.8 K/W', () => {
    expect(fillTheta(0.3e-3, 25e-6, 1.6e-3, 57.3)).toBeCloseTo(1.6e-3 / (57.3 * Math.PI * 0.125e-3 ** 2), 9);
    expect(fillTheta(0.3e-3, 25e-6, 1.6e-3, 57.3)).toBeCloseTo(568.85, 1);
  });
  it('laminate path: FR-4 0.29 W/m·K through 1.6 mm with 4 × 35 µm copper in series', () => {
    expect(laminateRA(1.6e-3, 0.29, 4, 35e-6, 385)).toBeCloseTo(140e-6 / 385 + 1.46e-3 / 0.29, 12);
  });
});

describe('thermal vias — independent Python model (xcheck.py)', () => {
  it('default, copper-filled and solder-filled arrays', () => {
    const a = run({});
    expect(res(a, 'theta')).toBeCloseTo(20.484292396822074, 10);
    expect(res(a, 'thetaVia')).toBeCloseTo(192.38447667548172, 9);
    const b = run({ n: 16, d: 0.25e-3, fill: 'cu', padW: 3.5e-3, padL: 3.5e-3 });
    expect(res(b, 'theta')).toBeCloseTo(5.228389543693364, 10);
    expect(res(b, 'thetaVia')).toBeCloseTo(84.66216193563679, 9);
    const c = run({ n: 25, d: 0.4e-3, fill: 'solder', kFill: 57.3, padW: 6.4e-3, padL: 6.2e-3 });
    expect(res(c, 'theta')).toBeCloseTo(3.6958870006279056, 10);
    expect(res(c, 'thetaVia')).toBeCloseTo(94.94370170581567, 9);
  });
  it('19 vias reach 10 K/W under the default pad', () => {
    const r = run({ solveFor: 'n', theta: 10, pitch: 0.65e-3 }); // 25 fit at 0.65 mm; at 1 mm only 16 fit (out of reach)
    expect(res(r, 'n')).toBe(19);
    expect(res(r, 'thetaAch')).toBeCloseTo(9.934753917253031, 10);
  });
});

describe('thermal vias — solve round trips', () => {
  const pts: Partial<ThermalViaState>[] = [{}, { n: 4, d: 0.35e-3, padW: 2e-3, padL: 2e-3, pitch: 0.9e-3 }, { n: 25, d: 0.4e-3, fill: 'solder', kFill: 57.3, padW: 6.4e-3, padL: 6.2e-3, pitch: 1.2e-3 }, { n: 12, fill: 'cu', h: 0.8e-3 }];
  it('N: the analysed θ of N vias gives back N; d: solved drill reproduces the target', () => {
    for (const p of pts) {
      const th = res(run({ ...p, solveFor: 'theta' }), 'theta');
      const rn = run({ ...p, solveFor: 'n', theta: th, n: 1 });
      expect(rn.ok, rn.error).toBe(true);
      expect(res(rn, 'n')).toBe(p.n ?? 9);
      // one via fewer misses the target: N is the smallest
      expect(res(run({ ...p, solveFor: 'theta', n: (p.n ?? 9) - 1 || 1 }), 'theta')).toBeGreaterThanOrEqual(th);
      const rd = run({ ...p, solveFor: 'd', theta: th, d: 0.2e-3 });
      expect(rd.ok, rd.error).toBe(true);
      expect(res(rd, 'd') / (p.d ?? 0.3e-3)).toBeCloseTo(1, 8);
      expect(res(run({ ...p, solveFor: 'theta', d: res(rd, 'd') }), 'theta') / th).toBeCloseTo(1, 9);
    }
  });
  it('the N scan stops at the pad’s fit limit', () => {
    const r = run({ solveFor: 'n', theta: 10 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/at most 16 vias/);
  });
  it('a target below what any count reaches is reported', () => {
    const r = run({ solveFor: 'n', theta: 0.01 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/out of reach within this pad/);
    expect(run({ solveFor: 'n', theta: 400 }).notes[0]).toMatch(/One via already meets/);
  });
});

describe('thermal vias — review fixes', () => {
  it('◎ on the drill after an N solve starts from the θ achieved, not the unreachable target', () => {
    const find = (fs: FieldSpec[]): any => {
      for (const f of fs) {
        if (f.kind === 'section' && find(f.fields)) return find(f.fields);
        if (f.kind === 'number' && f.key === 'd') return f;
      }
    };
    const st: any = { ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === 'qfn-target')!.state) };
    runCompute(def, st);
    expect(st.n).toBe(19);
    find(def.fields).onSolve(st, st);
    const r = runCompute(def, st);
    expect(r.ok, r.error).toBe(true);
    expect(st.d / 0.3e-3).toBeCloseTo(1, 8);
  });
});

describe('thermal vias — physics', () => {
  it('θ falls with N, d, fill conductivity and k_Cu; rises with h', () => {
    expect(res(run({ n: 16 }), 'theta')).toBeLessThan(res(run({ n: 9 }), 'theta'));
    expect(res(run({ d: 0.4e-3 }), 'theta')).toBeLessThan(res(run({}), 'theta'));
    expect(res(run({ fill: 'cu' }), 'theta')).toBeLessThan(res(run({ fill: 'solder', kFill: 57.3 }), 'theta'));
    expect(res(run({ fill: 'solder', kFill: 57.3 }), 'theta')).toBeLessThan(res(run({ fill: 'epoxy', kFill: 0.35 }), 'theta'));
    expect(res(run({ h: 3.2e-3 }), 'theta')).toBeGreaterThan(res(run({}), 'theta'));
  });
  it('limits: no laminate conduction → θ_vias exactly; copper fill = solid cylinder πd²/4', () => {
    const g = { n: 4, d: 0.3e-3, t: 25e-6, h: 1.6e-3, padW: 2e-3, padL: 2e-3, kCu: 390, kFill: 0.026, fill: 'none' as const, kLam: 1e-12, nCu: 0, tCu: 0 };
    const r = thermalVias(g);
    expect(r.theta / r.thetaVias).toBeCloseTo(1, 9);
    const cu = thermalVias({ ...g, fill: 'cu', n: 1 });
    expect(cu.thetaVia).toBeCloseTo(1.6e-3 / (390 * Math.PI * 0.15e-3 ** 2), 9);
  });
  it('fit count on a square grid', () => {
    expect(maxFit(0.3e-3, 1e-3, 3.3e-3, 3.3e-3)).toBe(16);
    expect(maxFit(0.3e-3, 1e-3, 0.25e-3, 3e-3)).toBe(0);
  });
});

describe('thermal vias — warnings', () => {
  it('does not fit, tight pitch, aspect ratio, thin plating, small pad note', () => {
    const has = (p: Partial<ThermalViaState>, re: RegExp) => run(p).warnings.some((w) => re.test(w));
    expect(run({ n: 30 }).error).toMatch(/do not fit/);
    expect(run({ pitch: 0.25e-3 }).error).toMatch(/would overlap/);
    expect(has({ pitch: 0.4e-3, n: 4 }, /Pitch .* under 1\.5× the drill/)).toBe(true);
    expect(has({ d: 0.15e-3, h: 2.4e-3, pitch: 0.5e-3 }, /Aspect ratio/)).toBe(true);
    expect(has({ t: 15e-6 }, /below the IPC-6012 minimum/)).toBe(true);
    expect(run({ padW: 2e-3, padL: 2e-3, n: 4 }).notes.some((n) => /heat spreads sideways/.test(n))).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
});

type Num = { key: string; min: number; max: number; integer?: boolean };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, integer: f.integer });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('thermal vias — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 11;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) {
        const v = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
        s[f.key] = f.integer ? Math.round(v) : v;
      }
      if (i % 2) {
        s.t = 10e-6 + 40e-6 * rnd();
        s.d = (s.t as number) * (4 + 30 * rnd());
        s.padW = (s.d as number) * (4 + 30 * rnd());
        s.padL = (s.padW as number) * (0.5 + rnd());
        s.n = 1 + Math.floor(20 * rnd());
        s.pitch = (s.d as number) * (1.5 + 2 * rnd());
        s.nCu = Math.floor(8 * rnd());
        s.tCu = 35e-6;
        s.h = 0.4e-3 + 3e-3 * rnd();
      }
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as ThermalViaState;
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
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of sr.y) expect(Number.isFinite(y), g.id).toBe(true);
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      const key = st.solveFor === 'theta' ? 'theta' : 'thetaAch';
      expect(res(again, key) / res(r, key)).toBeCloseTo(1, 7);
    }
    expect(ok).toBeGreaterThan(100); // the rest: random geometries with no room for the holes (reported)
  });
});

describe('thermal vias — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.warnings, ex.id).toEqual([]);
    }
  });
});
