import { describe, expect, it } from 'vitest';
import { def, type CiState } from '@/calculators/controlled-impedance/def';
import { analyse, coverDq, whQ2 } from '@/calculators/controlled-impedance/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const st = (p: Partial<CiState> = {}): CiState => ({ ...def.defaults(), ...p });
const run = (p: Partial<CiState>) => def.compute(st(p));
const inp = (p: Partial<CiState>) => ({ structure: 'ms' as const, w: 0.3e-3, h: 0.2e-3, t: 35e-6, er: 4.2, c: 20e-6, erm: 3.5, hc: 0.1e-3, erc: 4.2, g: 0.2e-3, ...p });
const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe('controlled impedance — independent references', () => {
  it('matches the Python re-implementation (scratch pcb1/ref.py, written from the papers) to 1e-9', () => {
    // python3 ref.py: ci(structure, W 0.3 mm, H 0.2 mm, T 35 µm, εr 4.2; mask 20 µm/3.5; cover 0.1 mm/4.2)
    expect(rel(analyse(inp({ structure: 'ms' })).z0, 55.63887792837692)).toBeLessThan(1e-9);
    expect(rel(analyse(inp({ structure: 'ms' })).epsEff, 3.004799865069901)).toBeLessThan(1e-9);
    expect(rel(analyse(inp({ structure: 'mask' })).z0, 54.67567683733327)).toBeLessThan(1e-9);
    expect(rel(analyse(inp({ structure: 'emb' })).z0, 51.04756461078325)).toBeLessThan(1e-9);
    expect(rel(analyse(inp({ structure: 'sl', w: 0.15e-3, t: 17.5e-6 })).z0, 52.36533321693261)).toBeLessThan(1e-9);
    const c = analyse(inp({ structure: 'cpwg', w: 1e-3, h: 1.6e-3, er: 4.4 }));
    expect(rel(c.z0, 51.41894508456815)).toBeLessThan(1e-9);
    expect(rel(c.epsEff, 2.620551893782599)).toBeLessThan(1e-9);
  });

  it('Hammerstad–Jensen microstrip equals the Microstrip page’s reviewed value (3 mm on 1.6 mm FR-4: 50.166 Ω)', () => {
    expect(analyse(inp({ structure: 'ms', w: 3e-3, h: 1.6e-3, er: 4.4 })).z0).toBeCloseTo(50.16596, 4);
  });

  it('Pozar Ex. 3.5 (4e): 50 Ω stripline, b = 3.2 mm, εr 2.2 → W ≈ 2.66 mm (Pozar’s fit ±1 %); here exact K/K′', () => {
    const ex = def.examples!.find((e) => e.id === 'pozar-3-5')!;
    const r = run(ex.state);
    expect(r.ok).toBe(true);
    expect(rel(res(r, 'w'), 2.66e-3)).toBeLessThan(0.01);
  });

  it('2-D field solution (builder finite-volume solver, Richardson-extrapolated) within the stated bands', () => {
    // [structure, W, H, T, εr, extra, Z0_FD]: normalised H = 1 (Z is scale-free)
    const cases: [CiState['structure'], number, number, number, number, Partial<CiState>, number, [number, number]][] = [
      ['ms', 1, 1, 0.05, 4.2, {}, 70.529, [-0.2, 0.2]],
      ['ms', 1.9, 1, 0.175, 4.2, {}, 48.94, [-0.2, 0.2]],
      ['mask', 1.9, 1, 0.175, 4.2, { c: 0.1, erm: 3.5 }, 47.569, [0.35, 2.1]],
      ['mask', 0.5, 1, 0.05, 4.2, { c: 0.1, erm: 3.5 }, 88.569, [0.35, 2.1]],
      ['mask', 1, 1, 0.1, 4.2, { c: 0.2, erm: 3.5 }, 65.126, [0.35, 2.1]],
      ['emb', 1.9, 1, 0.175, 4.2, { hc: 0.5, erc: 4.2 }, 44.697, [1.0, 2.9]],
      ['emb', 0.6, 1, 0.175, 4.2, { hc: 0.6, erc: 4.2 }, 70.465, [1.0, 2.9]],
      ['cpwg', 1, 1, 0, 4.4, { g: 0.5 }, 61.371, [0, 0.8]],
      ['cpwg', 1, 1, 0, 4.4, { g: 0.2 }, 51.184, [0, 0.8]],
      ['cpwg', 1.5, 1, 0.175, 4.2, { g: 0.75 }, 49.6576, [0, 2.4]],
      ['cpwg', 2, 1, 0.175, 4.2, { g: 0.25 }, 33.8933, [0, 2.4]],
      ['cpwg', 0.8, 1, 0.0875, 4.2, { g: 0.15 }, 44.4413, [0, 2.4]],
    ];
    for (const [structure, w, h, t, er, extra, fd, [lo, hi]] of cases) {
      const z = analyse(inp({ structure, w, h, t, er, ...extra } as any)).z0;
      const e = (z / fd - 1) * 100;
      expect(e, `${structure} W ${w} ${JSON.stringify(extra)}`).toBeGreaterThanOrEqual(lo);
      expect(e, `${structure} W ${w} ${JSON.stringify(extra)}`).toBeLessThanOrEqual(hi);
    }
  });
});

describe('controlled impedance — physics', () => {
  it('review: the Wan–Hoorfar wide/narrow branches are blended at W = H, so coated and embedded Z₀(W) fall monotonically', () => {
    // the published branches alone step Z₀ by +0.9 % at W = H (65.447 → 66.022 Ω at the default, C/H 0.1)
    for (const structure of ['mask', 'emb'] as const)
      for (const [c, hc, erm] of [[20e-6, 0.1e-3, 3.5], [5e-6, 0.02e-3, 4], [50e-6, 0.6e-3, 3]]) {
        let prev = Infinity;
        for (let i = 0; i <= 2000; i++) {
          const w = 0.1e-3 * 4 ** (i / 2000);
          const z = analyse(inp({ structure, w, c, hc, erm, erc: erm })).z0;
          expect(z, `${structure} W ${w}`).toBeLessThan(prev);
          prev = z;
        }
      }
    // the default W solve has a single root
    const s = st();
    const zs = Array.from({ length: 400 }, (_, i) => analyse(inp({ structure: 'mask', w: 0.15e-3 + (i * 0.45e-3) / 399 })).z0 - 50);
    expect(zs.filter((d, i) => i > 0 && Math.sign(d) !== Math.sign(zs[i - 1])).length).toBe(1);
    expect(runCompute(def, s).ok).toBe(true);
  });
  it('zero mask / zero cover reduce to the bare microstrip; Δq vanishes at hb = 1 and grows with the cover', () => {
    const bare = analyse(inp({ structure: 'ms' })).z0;
    expect(analyse(inp({ structure: 'mask', c: 0 })).z0).toBeCloseTo(bare, 12);
    expect(analyse(inp({ structure: 'emb', hc: 0, t: 0 })).z0).toBeCloseTo(analyse(inp({ structure: 'ms', t: 0 })).z0, 12);
    for (const u of [0.3, 1, 3]) {
      expect(coverDq(u, 1)).toBe(0);
      expect(coverDq(u, 1.1)).toBeGreaterThan(0);
      expect(coverDq(u, 1.5)).toBeGreaterThan(coverDq(u, 1.1));
      expect(whQ2(u, 50)).toBeGreaterThan(whQ2(u, 2));
    }
    // mask εr = 1 is no mask at all
    expect(analyse(inp({ structure: 'mask', erm: 1 })).z0).toBeCloseTo(bare, 12);
  });
  it('stripline: TEM (εeff = εr), Z ∝ 1/√εr exactly, symmetric to the exact K/K′ at t = 0', () => {
    const a = analyse(inp({ structure: 'sl', er: 1, t: 0 }));
    const b = analyse(inp({ structure: 'sl', er: 4, t: 0 }));
    expect(b.epsEff).toBe(4);
    expect(a.z0 / b.z0).toBeCloseTo(2, 12);
  });
  it('monotonic: Z₀ falls with W and εr, rises with H; CPWG Z₀ rises with the gap; mask/cover lower Z₀', () => {
    for (const structure of ['ms', 'mask', 'emb', 'sl', 'cpwg'] as const) {
      const z = (p: any) => analyse(inp({ structure, ...p })).z0;
      expect(z({ w: 0.35e-3 }), structure).toBeLessThan(z({}));
      expect(z({ h: 0.25e-3 }), structure).toBeGreaterThan(z({}));
      expect(z({ er: 4.6 }), structure).toBeLessThan(z({}));
    }
    expect(analyse(inp({ structure: 'cpwg', g: 0.3e-3 })).z0).toBeGreaterThan(analyse(inp({ structure: 'cpwg' })).z0);
    expect(analyse(inp({ structure: 'mask' })).z0).toBeLessThan(analyse(inp({ structure: 'ms' })).z0);
    expect(analyse(inp({ structure: 'emb' })).z0).toBeLessThan(analyse(inp({ structure: 'mask' })).z0);
  });
  it('scale invariance: all lengths × 10 leave Z₀ unchanged', () => {
    for (const structure of ['ms', 'mask', 'emb', 'sl', 'cpwg'] as const) {
      const a = analyse(inp({ structure }));
      const b = analyse(inp({ structure, w: 3e-3, h: 2e-3, t: 350e-6, c: 200e-6, hc: 1e-3, g: 2e-3 }));
      expect(rel(a.z0, b.z0), structure).toBeLessThan(1e-12);
    }
  });
});

describe('controlled impedance — solve-for', () => {
  it('round trips every unknown on every line type (target recovered to 1e-9, value to 1e-6)', () => {
    const geo: Partial<CiState>[] = [
      { w: 0.3e-3, h: 0.2e-3, t: 35e-6, er: 4.2, g: 0.2e-3 },
      { w: 1e-3, h: 1.6e-3, t: 35e-6, er: 4.4, g: 0.25e-3 },
      { w: 0.12e-3, h: 0.1e-3, t: 17.5e-6, er: 3.66, g: 0.1e-3 },
    ];
    for (const structure of ['ms', 'mask', 'emb', 'sl', 'cpwg'] as const)
      for (const p of geo) {
        const z = res(run({ ...p, structure, solveFor: 'z0' }), 'z0');
        for (const k of ['w', 'h', 'er', ...(structure === 'cpwg' ? ['g'] : [])] as ('w' | 'h' | 'er' | 'g')[]) {
          const s = st({ ...p, structure, solveFor: k, z0: z, [k]: (p[k] as number) * (k === 'er' ? 0.7 : 2.3) });
          const r = runCompute(def, s);
          expect(r.ok, `${structure} ${k}: ${r.error}`).toBe(true);
          expect(rel(s[k] as number, p[k] as number), `${structure} ${k}`).toBeLessThan(1e-6);
          const fwd = run({ ...s, solveFor: 'z0' });
          expect(rel(res(fwd, 'z0'), z)).toBeLessThan(1e-9);
        }
      }
  });
  it('unreachable targets are NO SOLUTION with the reason; a structure switch keeps the unknown visible', () => {
    const r = run({ z0: 400 });
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.error).toMatch(/Z₀ falls as the trace widens/);
    const s = st({ structure: 'cpwg', solveFor: 'g' });
    const field = def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === 'structure');
    s.structure = 'sl';
    field.apply('sl', s, s);
    expect(s.solveFor).toBe('z0');
    expect(runCompute(def, s).ok).toBe(true);
  });
  it('a laminate preset while solving εr analyses the geometry instead of bouncing to Custom', () => {
    const s = st({ solveFor: 'er' });
    runCompute(def, s);
    const mat = def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === 'material');
    s.material = 'RO4350B';
    mat.apply('RO4350B', s, s);
    const r = runCompute(def, s);
    expect(r.ok).toBe(true);
    expect(s.solveFor).toBe('z0');
    expect(s.material).toBe('RO4350B');
  });
});

describe('controlled impedance — validity warnings', () => {
  const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));
  it('each published limit triggers its warning', () => {
    expect(has(run({ solveFor: 'z0', structure: 'ms', w: 0.005e-3, t: 0 }), /W\/H = .* outside 0.05–20/)).toBe(true);
    expect(has(run({ solveFor: 'z0', structure: 'ms', t: 0.08e-3 }), /T\/H = 0.40/)).toBe(true);
    expect(has(run({ solveFor: 'z0', structure: 'mask', c: 0.06e-3 }), /C\/H = 0.30/)).toBe(true);
    expect(has(run({ solveFor: 'z0', structure: 'mask', erm: 6 }), /unusually high for solder mask/)).toBe(true);
    expect(has(run({ solveFor: 'z0', structure: 'emb', hc: 0.7e-3 }), /more than 3.2× the substrate/)).toBe(true);
    expect(has(run({ solveFor: 'z0', structure: 'sl', t: 35e-6, h: 0.12e-3 }), /T\/b = 0.127 > 0.1/)).toBe(true);
    expect(has(run({ solveFor: 'z0', structure: 'sl', f: 200e9 }), /parallel-plate modes/)).toBe(true);
    expect(has(run({ solveFor: 'z0', structure: 'ms', f: 300e9 }), /TE₁ surface-wave/)).toBe(true);
    expect(has(run({ solveFor: 'z0', structure: 'cpwg', g: 0.3e-3 }), /G = 1.50·H/)).toBe(true);
    expect(has(run({ solveFor: 'z0', structure: 'cpwg', g: 20e-6 }), /narrower than the copper is thick/)).toBe(true);
    expect(run({ solveFor: 'z0', structure: 'sl', t: 0.2e-3, h: 0.1e-3 }).error).toMatch(/T\/b = 0.500 is above 0.45/);
    // review: 1 oz on 2-mil dielectric is allowed, with the measured band as a warning
    const thin = run({ solveFor: 'z0', structure: 'sl', t: 35e-6, h: 50.8e-6 });
    expect(thin.ok).toBe(true);
    expect(has(thin, /T\/b = 0.256 > 0.2: .* −1.1 … \+0.6 %/)).toBe(true);
    // review: solving W where the copper limit (not the target) is the obstacle says so
    expect(run({ structure: 'sl', t: 35e-6, h: 20e-6 }).error).toMatch(/copper is too thick for the dielectric/);
    expect(run({}).warnings).toEqual([]);
  });
});

// ── fuzz over the field spec, through runCompute (core guard and write-back included)
type Num = { key: string; min: number; max: number };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: unknown[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o: any) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('controlled impedance — fuzz (400 random states via runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: unknown[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 777;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: any = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 3;
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      s.solveFor = def.solve!.options[i % 5].key;
      if (s.solveFor === 'g') s.structure = 'cpwg';
      let r!: CalcReport;
      expect(() => (r = runCompute(def, s))).not.toThrow();
      if (!r.ok) {
        expect(r.error && r.error.length > 5).toBe(true);
        expect(r.error).not.toMatch(BAD);
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const se of g.series ?? []) for (const y of se.y) expect(Number.isFinite(y), `${g.id}/${se.label}`).toBe(true);
      for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(v).not.toMatch(BAD);
      const again = runCompute(def, { ...s });
      expect(again.ok).toBe(true);
      expect(rel(res(again, 'z0'), res(r, 'z0'))).toBeLessThan(1e-9);
    }
    expect(ok).toBeGreaterThan(80);
  });
  it('realistic boards (300 states): every solve option succeeds for a reachable target', () => {
    let x = 4242;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const structures = ['ms', 'mask', 'emb', 'sl', 'cpwg'] as const;
    for (let i = 0; i < 300; i++) {
      const h = 0.07e-3 * 25 ** rnd();
      const p: Partial<CiState> = { structure: structures[i % 5], h, w: h * (0.3 + 4 * rnd()), t: h * 0.15 * rnd(), er: 2.2 + 4 * rnd(), c: 25e-6 * rnd(), hc: h * rnd(), g: h * (0.2 + 0.7 * rnd()) };
      const z = res(run({ ...p, solveFor: 'z0' }), 'z0');
      const opts = ['w', 'h', 'er', ...(p.structure === 'cpwg' ? ['g'] : [])];
      const k = opts[i % opts.length] as CiState['solveFor'];
      const r = runCompute(def, st({ ...p, solveFor: k, z0: z }));
      expect(r.ok, `${p.structure} ${k} ${r.error}`).toBe(true);
      expect(rel(res(r, 'z0'), z)).toBeLessThan(1e-9);
    }
  });
});

describe('controlled impedance — examples', () => {
  it('first example equals the defaults; every example computes without unexpected warnings', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = run(ex.state);
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.graphs.length).toBeGreaterThan(1);
      expect(r.tables[0].rows.length).toBe(5);
    }
  });
  it('compute is fast (< 50 ms per example)', () => {
    for (const ex of def.examples!) run(ex.state);
    const t0 = performance.now();
    for (const ex of def.examples!) run(ex.state);
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
  });
});
