import { describe, expect, it } from 'vitest';
import { def, type RingState } from '@/calculators/annular-ring/def';
import { breakout, maxHole, minLand, worstRing } from '@/calculators/annular-ring/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<RingState>) => def.compute({ ...def.defaults(), ...p });
const MIL = 25.4e-6;

describe('annular ring — published worked examples', () => {
  it('Altium (Peterson), Class 3, level C (c = 8 mil): 12 mil drill / 10 mil finished → 22 mil internal and external', () => {
    const r = run({ fhs: 10 * MIL, tol: 0, allow: 2 * MIL, req: 'c3', bExt: 50e-6, bInt: 25e-6, level: 'custom', c: 8 * MIL });
    // the article uses 1 / 2 mil rings; IPC's 25 / 50 µm are 0.98 / 1.97 mil
    expect(res(r, 'minInt') / MIL).toBeCloseTo(12 + 2 * (25e-6 / MIL) + 8, 9);
    expect(res(r, 'minExt') / MIL).toBeCloseTo(10 + 2 * (50e-6 / MIL) + 8, 9);
    expect(res(r, 'minInt') / MIL).toBeCloseTo(22, 0);
    expect(res(r, 'minExt') / MIL).toBeCloseTo(22, 0);
  });
  it('IPC-2221 land formula, level B: 0.25 mm finished via → 0.25 + 2·0.05 + 0.25 = 0.60 mm external land', () => {
    expect(minLand(0.25e-3, 50e-6, 0, 0.25e-3)).toBeCloseTo(0.6e-3, 15);
    const r = run({ fhs: 0.25e-3, tol: 0, allow: 0, solveFor: 'pad', ratio: 100 });
    expect(res(r, 'minExt')).toBeCloseTo(0.6e-3, 15);
  });
});

describe('annular ring — independent Python model (xcheck.py, breakout by bisection on the geometry)', () => {
  it('Class 3, Class 2 (90°), Class 1 (180°) and the largest hole', () => {
    expect(res(run({}), 'pad')).toBeCloseTo(0.00065, 15);
    const c2 = run({ req: 'c2', bExt: 0, bInt: 0 });
    expect(res(c2, 'minExt') / 0.000508493871327848).toBeCloseTo(1, 12);
    expect(res(c2, 'minInt') / 0.0005556470882742443).toBeCloseTo(1, 12);
    expect(res(c2, 'intWc') / -2.2176455862877854e-5).toBeCloseTo(1, 9);
    const c1 = run({ req: 'c1', bExt: 0, bInt: 0 });
    expect(res(c1, 'pad') / 0.00043011626335213125).toBeCloseTo(1, 12);
    const h = run({ solveFor: 'fhs', pad: 0.6e-3, level: 'C', c: 0.2e-3 });
    expect(res(h, 'fhs') / 0.00025).toBeCloseTo(1, 10);
  });
});

describe('annular ring — geometry', () => {
  it('breakout angle: 0 when the ring survives, exactly θ at the breakout-class minimum, 360° when the hole leaves the pad', () => {
    expect(breakout(0.7e-3, 0.3e-3, 0.1e-3)).toBe(0);
    for (const th of [Math.PI / 2, Math.PI]) {
      const D = minLand(0.35e-3, 0, th, 0.25e-3);
      expect(breakout(D, 0.35e-3, 0.125e-3)).toBeCloseTo(th, 9);
      expect(maxHole(D, 0, th, 0.25e-3)).toBeCloseTo(0.35e-3, 15);
    }
    expect(breakout(0.2e-3, 0.1e-3, 1e-3)).toBeCloseTo(2 * Math.PI, 12);
    expect(worstRing(0.65e-3, 0.3e-3, 0.125e-3)).toBeCloseTo(50e-6, 15);
  });
  it('a breakout class always needs a smaller pad than tangency, tangency smaller than Class 3', () => {
    const p = (req: RingState['req']) => res(run({ req, bExt: 0, bInt: 0 }), 'pad');
    expect(p('c1')).toBeLessThan(p('c2'));
    expect(p('c2')).toBeLessThan(p('c2t'));
    expect(p('c2t')).toBeLessThan(res(run({}), 'pad'));
  });
});

describe('annular ring — solve round trips', () => {
  const pts: Partial<RingState>[] = [{}, { req: 'c2', bExt: 0, bInt: 0, fhs: 0.5e-3, level: 'A', c: 0.4e-3 }, { req: 'c1', bExt: 0, bInt: 0, fhs: 1e-3, tol: 0.08e-3 }, { req: 'custom', bExt: 0.1e-3, bInt: 0.05e-3, fhs: 0.3e-3, c: 0.15e-3, level: 'custom' }];
  it('pad ↔ hole ↔ ratio at several targets', () => {
    for (const p of pts) {
      for (const ratio of [100, 115]) {
        const rp = run({ ...p, solveFor: 'pad', ratio });
        expect(rp.ok, rp.error).toBe(true);
        const pad = res(rp, 'pad');
        expect(res(run({ ...p, solveFor: 'ratio', pad }), 'ratio') / ratio).toBeCloseTo(1, 10);
        const rh = run({ ...p, solveFor: 'fhs', ratio, pad, fhs: 1e-3 });
        expect(rh.ok, rh.error).toBe(true);
        expect(res(rh, 'fhs') / (p.fhs ?? 0.25e-3)).toBeCloseTo(1, 8);
      }
    }
  });
  it('a pad too small for any hole is reported', () => {
    const r = run({ solveFor: 'fhs', pad: 0.2e-3 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exceed the .* pad/);
  });
});

describe('annular ring — review fixes', () => {
  it('◎ on the pad or the hole from the check starts the target at 100 % (no carried-over 83 %)', () => {
    const find = (fs: FieldSpec[], k: string): any => {
      for (const f of fs) {
        if ((f.kind === 'section' || f.kind === 'group') && find(f.fields, k)) return find(f.fields, k);
        if (f.kind === 'number' && f.key === k) return f;
      }
    };
    for (const key of ['pad', 'fhs']) {
      const st: any = { ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === 'check-05')!.state) };
      runCompute(def, st);
      expect(st.ratio).toBeCloseTo(83.33, 1);
      find(def.fields, key).onSolve(st, st);
      expect(st.solveFor).toBe(key);
      expect(st.ratio).toBe(100);
      const r = runCompute(def, st);
      expect(r.ok).toBe(true);
      expect(r.status?.tone).toBe('pass');
    }
  });
});

describe('annular ring — warnings', () => {
  it('pad too small, aspect ratio, thin drill allowance; clean defaults', () => {
    const small = run({ solveFor: 'ratio', pad: 0.5e-3 });
    expect(small.status?.tone).toBe('fail');
    expect(small.warnings.some((w) => /below the .* minimum/.test(w))).toBe(true);
    expect(run({ fhs: 0.1e-3, allow: 0.05e-3, h: 3.2e-3 }).warnings.some((w) => /Aspect ratio/.test(w))).toBe(true);
    expect(run({ allow: 0.03e-3 }).notes.some((n) => /little room for plating/.test(n))).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
  it('the class table judges the same padstack against every class', () => {
    const t = run({ solveFor: 'ratio', pad: 0.6e-3 }).tables[0];
    expect(t.rows.length).toBe(4);
    expect(t.rowTones).toEqual(['fail', 'warn', 'warn', 'pass']); // c2t and c2 within 10 % of the 0.6 mm pad
  });
});

type Num = { key: string; min: number; max: number };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('annular ring — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute; analysis never refused', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 3;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      if (i % 2) s.ratio = 80 + 60 * rnd();
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as RingState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        expect(st.solveFor, r.error).not.toBe('ratio');
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '', r.status?.text ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of sr.y) expect(Number.isFinite(y), g.id).toBe(true);
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      for (const k of ['ratio', 'minExt', 'minInt']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 7);
    }
    expect(ok).toBeGreaterThan(220); // the rest: random targets whose pad or hole falls outside the field range (reported)
  });
});

describe('annular ring — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
    }
    expect(run(def.examples!.find((e) => e.id === 'check-05')!.state).status?.tone).toBe('fail');
  });
});
