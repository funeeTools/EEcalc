import { describe, expect, it } from 'vitest';
import { def, type AsymState } from '@/calculators/asymmetric-stripline/def';
import { offsetStripline } from '@/calculators/asymmetric-stripline/model';
import { analyse } from '@/calculators/controlled-impedance/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const st = (p: Partial<AsymState> = {}): AsymState => ({ ...def.defaults(), ...p });
const run = (p: Partial<AsymState>) => def.compute(st(p));
const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe('asymmetric stripline — independent references', () => {
  it('matches the Python re-implementation (scratch pcb1/ref.py; Cohn 1960 solved in 80-digit decimals) to 1e-9', () => {
    expect(rel(offsetStripline(0.13e-3, 17.5e-6, 0.125e-3, 0.3425e-3, 4.2).z0, 52.483521065914864)).toBeLessThan(1e-9);
    expect(rel(offsetStripline(0.15e-3, 0, 0.1e-3, 0.3e-3, 3.66).z0, 51.13596226684014)).toBeLessThan(1e-9);
    expect(rel(offsetStripline(0.5e-3, 35e-6, 0.2e-3, 0.2e-3, 4.4).z0, 24.83865839128227)).toBeLessThan(1e-9);
  });

  // No published worked example of an offset stripline was available; the second independent source is a
  // 2-D finite-volume Laplace solution (builder scratch fd.mjs; graded mesh, 3-grid Richardson extrapolation;
  // reproduces the exact centred stripline to 0.03 %).
  it('2-D field solution on 60 cross-sections (H₁ = 1, εr = 1): inside the stated band; image method far worse', () => {
    // [T, W, H2, Z_FD]
    const GRID = [[0,0.25,1.5,191.074],[0,0.25,2,196.374],[0,0.25,3,201.457],[0,0.25,5,204.983],[0,0.5,1.5,149.954],[0,0.5,2,155.211],[0,0.5,3,160.271],[0,0.5,5,163.79],[0,1,1.5,110],[0,1,2,115.1],[0,1,3,120.069],[0,1,5,123.556],[0,2,1.5,73.599],[0,2,2,78.208],[0,2,3,82.869],[0,2,5,86.245],[0,4,1.5,44.557],[0,4,2,48.138],[0,4,3,52.023],[0,4,5,55.062],[0.1,0.25,1.5,164.88],[0.1,0.25,2,170.123],[0.1,0.25,3,175.256],[0.1,0.25,5,178.898],[0.1,0.5,1.5,134.959],[0.1,0.5,2,140.146],[0.1,0.5,3,145.238],[0.1,0.5,5,148.86],[0.1,1,1.5,102.235],[0.1,1,2,107.244],[0.1,1,3,112.217],[0.1,1,5,115.783],[0.1,2,1.5,70.115],[0.1,2,2,74.622],[0.1,2,3,79.251],[0.1,2,5,82.669],[0.1,4,1.5,43.258],[0.1,4,2,46.764],[0.1,4,3,50.601],[0.1,4,5,53.644],[0.25,0.25,1.5,145.786],[0.25,0.25,2,150.94],[0.25,0.25,3,156.12],[0.25,0.25,5,159.91],[0.25,0.5,1.5,122.603],[0.25,0.5,2,127.689],[0.25,0.5,3,132.81],[0.25,0.5,5,136.562],[0.25,1,1.5,95.247],[0.25,1,2,100.141],[0.25,1,3,105.112],[0.25,1,5,108.78],[0.25,2,1.5,66.8],[0.25,2,2,71.191],[0.25,2,3,75.782],[0.25,2,5,79.256],[0.25,4,1.5,41.975],[0.25,4,2,45.399],[0.25,4,3,49.186],[0.25,4,5,52.241]];
    expect(GRID.length).toBe(60);
    let imgWorst = 0;
    for (const [t, w, h2, fd] of GRID) {
      const o = offsetStripline(w, t, 1, h2, 1);
      const e = (o.z0 / fd - 1) * 100;
      const hi = w >= 1 ? 0.9 : w >= 0.5 ? 1.75 : 2.65;
      expect(e, `T ${t} W ${w} H2 ${h2}`).toBeGreaterThanOrEqual(-0.1);
      expect(e, `T ${t} W ${w} H2 ${h2}`).toBeLessThanOrEqual(hi);
      imgWorst = Math.max(imgWorst, (o.zImage / fd - 1) * 100);
    }
    expect(imgWorst).toBeGreaterThan(7); // the plain image method (Wadell eq. 3.6.3.22) reads up to +7.2 %
  });
});

describe('asymmetric stripline — physics', () => {
  it('H₁ = H₂ reduces exactly to the symmetric stripline (Cohn/Wheeler), with and without copper', () => {
    for (const t of [0, 17.5e-6, 35e-6]) {
      const o = offsetStripline(0.15e-3, t, 0.2e-3, 0.2e-3, 4.2);
      const sym = analyse({ structure: 'sl', w: 0.15e-3, h: 0.2e-3, t, er: 4.2, c: 0, erm: 1, hc: 0, erc: 1, g: 1 }).z0;
      expect(rel(o.z0, sym)).toBeLessThan(1e-12);
    }
  });
  it('swapping H₁ and H₂ gives the same impedance; the return-current shares swap', () => {
    const a = offsetStripline(0.12e-3, 17.5e-6, 0.1e-3, 0.3e-3, 4);
    const b = offsetStripline(0.12e-3, 17.5e-6, 0.3e-3, 0.1e-3, 4);
    expect(rel(a.z0, b.z0)).toBeLessThan(1e-12);
    expect(a.lowerShare).toBeCloseTo(1 - b.lowerShare, 12);
    expect(a.lowerShare).toBeGreaterThan(0.5);
  });
  it('moving the far plane away raises Z₀ towards a limit; off-centre is lower than centred at the same b', () => {
    const z = (h2: number) => offsetStripline(0.12e-3, 17.5e-6, 0.1e-3, h2, 4).z0;
    expect(z(0.2e-3)).toBeGreaterThan(z(0.1e-3));
    expect(z(0.4e-3)).toBeGreaterThan(z(0.2e-3));
    expect(z(0.8e-3) - z(0.4e-3)).toBeLessThan(z(0.4e-3) - z(0.2e-3));
    const o = offsetStripline(0.12e-3, 17.5e-6, 0.1e-3, 0.3e-3, 4);
    expect(o.z0).toBeLessThan(o.zSym);
  });
  it('regression (harness): very wide traces stay positive and monotonic in H₁ (Cohn’s width equation overflowed at W/b ≈ 85)', () => {
    let prev = 0;
    for (const h1 of [26.25e-6, 29.5e-6, 40e-6, 80e-6, 125e-6, 200e-6]) {
      const z = offsetStripline(16.6e-3, 17.5e-6, h1, 0.3425e-3, 4.2).z0;
      expect(z).toBeGreaterThan(prev);
      prev = z;
    }
    // parallel-plate limit: C/ε → W/H₁ + W/H₂ (+ fringing) for W ≫ H
    const o = offsetStripline(50e-3, 0, 10e-6, 30e-6, 1);
    expect(o.c / (50e-3 / 10e-6 + 50e-3 / 30e-6)).toBeCloseTo(1, 3);
  });
  it('Z ∝ 1/√εr exactly; scale invariant', () => {
    const a = offsetStripline(0.12e-3, 17.5e-6, 0.1e-3, 0.3e-3, 1);
    const b = offsetStripline(0.12e-3, 17.5e-6, 0.1e-3, 0.3e-3, 4);
    expect(a.z0 / b.z0).toBeCloseTo(2, 12);
    const c = offsetStripline(1.2e-3, 175e-6, 1e-3, 3e-3, 4);
    expect(rel(c.z0, b.z0)).toBeLessThan(1e-12);
  });
});

describe('asymmetric stripline — solve-for', () => {
  it('round trips W, H₁, H₂ and εr at several points (value to 1e-6, target to 1e-9)', () => {
    const pts: Partial<AsymState>[] = [
      { dual: false, w: 0.13e-3, h1: 0.125e-3, h2: 0.3425e-3, t: 17.5e-6, er: 4.2 },
      { dual: false, w: 0.3e-3, h1: 0.2e-3, h2: 0.6e-3, t: 35e-6, er: 3.66 },
      { dual: true, d: 0.15e-3, w: 0.1e-3, h1: 0.1e-3, h2: 0.3e-3, t: 17.5e-6, er: 4 },
    ];
    for (const p of pts) {
      const z = res(run({ ...p, solveFor: 'z0' }), 'z0');
      for (const k of ['w', 'h1', 'h2', 'er'] as const) {
        const s = st({ ...p, solveFor: k, z0: z, [k]: p[k]! * (k === 'er' ? 0.6 : 2.2) });
        const r = runCompute(def, s);
        expect(r.ok, `${k} ${r.error}`).toBe(true);
        expect(rel(s[k] as number, p[k] as number), k).toBeLessThan(1e-6);
        expect(rel(res(run({ ...s, solveFor: 'z0' }), 'z0'), z)).toBeLessThan(1e-9);
      }
    }
  });
  it('dual stripline: layer-2 impedance equals the mirrored geometry; toggling the layer on never errors', () => {
    const r = run({});
    const s = st({ w: res(r, 'w') });
    const l2 = offsetStripline(s.w, s.t, s.h2 - s.d - s.t, s.h1 + s.t + s.d, s.er).z0;
    expect(rel(res(r, 'z0L2'), l2)).toBeLessThan(1e-12);
    const s2 = st({ dual: false, h2: 0.15e-3, d: 0.2e-3 });
    const tog = def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === 'dual');
    s2.dual = true;
    tog.apply(true, s2, s2);
    expect(runCompute(def, s2).ok).toBe(true);
  });
});

describe('asymmetric stripline — validity', () => {
  const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));
  it('each limit triggers its warning; thick copper is refused with the reason', () => {
    expect(has(run({ solveFor: 'z0', dual: false, t: 35e-6, h1: 0.1e-3 }), /T\/\(2H_near \+ T\) = 0.149 > 0.1/)).toBe(true);
    expect(has(run({ solveFor: 'z0', dual: false, h1: 0.05e-3, h2: 0.4e-3 }), /far off-centre/)).toBe(true);
    expect(has(run({ solveFor: 'z0', dual: false, w: 0.02e-3 }), /under a quarter of the nearer dielectric/)).toBe(true);
    expect(has(run({ solveFor: 'z0', f: 200e9 }), /parallel-plate modes/)).toBe(true);
    expect(run({ solveFor: 'z0', dual: false, t: 0.3e-3, h1: 0.1e-3 }).error).toMatch(/too thick for the nearer dielectric/);
    expect(run({ solveFor: 'z0', dual: false, t: 35e-6, h1: 50.8e-6 }).warnings.some((w) => /> 0.2: .* −1.1 … \+0.6 %/.test(w))).toBe(true);
    expect(run({ solveFor: 'z0', dual: true, h2: 0.2e-3, d: 0.2e-3 }).error).toMatch(/second layer does not fit/);
    expect(run({}).warnings).toEqual([]);
  });
});

type Num = { key: string; min: number; max: number };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: unknown[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o: any) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('asymmetric stripline — fuzz (400 random states via runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: unknown[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 2024;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: any = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 3;
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      s.dual = rnd() < 0.5;
      if (i % 2) {
        s.h2 = s.h1 * (0.3 + 5 * rnd());
        s.w = s.h1 * (0.3 + 4 * rnd());
        s.t = s.h1 * 0.3 * rnd();
        s.d = s.h2 * 0.5 * rnd();
      }
      s.solveFor = def.solve!.options[i % 5].key;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, s))).not.toThrow();
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
      for (const g of r.graphs) for (const se of g.series ?? []) for (const y of se.y) expect(Number.isFinite(y), `${g.id}/${se.label}`).toBe(true);
      const again = runCompute(def, { ...s });
      expect(again.ok).toBe(true);
      expect(rel(res(again, 'z0'), res(r, 'z0'))).toBeLessThan(1e-9);
    }
    expect(ok).toBeGreaterThan(80);
  });
  it('realistic stack-ups (300 states): every solve option succeeds for a reachable target', () => {
    let x = 555;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const h1 = 0.05e-3 * 20 ** rnd();
      const p: Partial<AsymState> = { dual: false, h1, h2: h1 * (0.25 + 5 * rnd()), w: h1 * (0.3 + 4 * rnd()), t: h1 * 0.25 * rnd(), er: 2 + 6 * rnd() };
      const fwd = run({ ...p, solveFor: 'z0' });
      if (!fwd.ok) {
        expect(fwd.error).toMatch(/too thick for the nearer dielectric/); // the only refusal: T beyond the thin-strip limit
        continue;
      }
      const z = res(fwd, 'z0');
      const k = (['w', 'h1', 'h2', 'er'] as const)[i % 4];
      const r = runCompute(def, st({ ...p, solveFor: k, z0: z }));
      expect(r.ok, `${k} ${r.error}`).toBe(true);
      expect(rel(res(r, 'z0'), z)).toBeLessThan(1e-9);
    }
  });
});

describe('asymmetric stripline — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = run(ex.state);
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.graphs.length).toBe(2);
    }
    const c = run(def.examples!.find((e) => e.id === 'centred')!.state);
    expect(rel(res(c, 'z0'), res(c, 'zSym'))).toBeLessThan(1e-12);
  });
  it('compute is fast (< 50 ms per example)', () => {
    for (const ex of def.examples!) run(ex.state);
    const t0 = performance.now();
    for (const ex of def.examples!) run(ex.state);
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
  });
});
