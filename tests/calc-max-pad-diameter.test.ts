import { describe, expect, it } from 'vitest';
import { type MaxPadState, def } from '@/calculators/max-pad-diameter/def';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<MaxPadState>) => def.compute({ ...def.defaults(), ...p });
const MM = 1e-3;

describe('maximum pad diameter — published worked example', () => {
  it('TI SPRAA99C Fig. 2-4: 0.65 mm pitch, 0.35 mm NSMD lands, one 0.100 mm line → 0.100 mm clearance', () => {
    const r = run({ solveFor: 's', padType: 'smd', p: 0.65 * MM, d: 0.35 * MM, n: 1, w: 0.1 * MM });
    expect(res(r, 's')).toBeCloseTo(0.1 * MM, 15);
    // and the same geometry the other way: the largest land at 0.1 / 0.1 is exactly 0.35 mm
    expect(res(run({ solveFor: 'd', padType: 'smd', p: 0.65 * MM, n: 1, w: 0.1 * MM, s: 0.1 * MM }), 'd')).toBeCloseTo(0.35 * MM, 15);
  });
  it('IPC-2221B §9.1.1 land formula (level B, Class 3): 1.0 mm hole, +0.08 mm → 1.08 + 0.10 + 0.25 = 1.43 mm', () => {
    expect(res(run({}), 'dMin')).toBeCloseTo(1.43 * MM, 15);
  });
});

describe('maximum pad diameter — independent Python model (xcheck.py)', () => {
  it('channel line and the minimum lands (breakout classes by sampling the hole wall, ±1e-4 mm)', () => {
    expect(res(run({}), 'd')).toBeCloseTo(1.54 * MM, 15); // 2.54 − 2·0.2 − 3·0.2
    expect(res(run({ solveFor: 'w', p: 1.27 * MM, d: 0.6 * MM, n: 1, s: 0.15 * MM, padType: 'smd' }), 'w')).toBeCloseTo(0.37 * MM, 15);
    expect(res(run({ solveFor: 'p', d: 1.6 * MM, n: 1, w: 0.25 * MM, s: 0.2 * MM }), 'p')).toBeCloseTo(2.25 * MM, 15);
    const base = { fhs: 0.3 * MM, tol: 0.05 * MM, allow: 0.1 * MM, c: 0.25 * MM, level: 'B' };
    const c2 = run({ ...base, req: 'c2' });
    expect(res(c2, 'dMinExt') / MM).toBeCloseTo(0.55563, 4);
    expect(res(c2, 'dMinInt') / MM).toBeCloseTo(0.60324, 4);
    const c1 = run({ ...base, req: 'c1' });
    expect(res(c1, 'dMinExt') / MM).toBeCloseTo(0.43008, 4);
    expect(res(c1, 'dMinInt') / MM).toBeCloseTo(0.47167, 4);
  });
});

describe('maximum pad diameter — solve round trips', () => {
  const pts: Partial<MaxPadState>[] = [{}, { p: 1.27 * MM, n: 1, w: 0.15 * MM, s: 0.15 * MM, padType: 'smd' }, { p: 0.8 * MM, n: 1, w: 0.1 * MM, s: 0.1 * MM }, { p: 5 * MM, n: 3, w: 0.3 * MM, s: 0.25 * MM }, { p: 2 * MM, n: 0, s: 0.3 * MM }];
  it('D → p, s, W each recover the inputs', () => {
    for (const pt of pts) {
      const rd = run({ ...pt, solveFor: 'd' });
      expect(rd.ok, rd.error).toBe(true);
      const d = res(rd, 'd');
      const s0 = { ...def.defaults(), ...pt };
      expect(res(run({ ...pt, solveFor: 'p', d, p: 9 * MM }), 'p') / s0.p).toBeCloseTo(1, 10);
      expect(res(run({ ...pt, solveFor: 's', d, s: 0.9 * MM }), 's') / s0.s).toBeCloseTo(1, 10);
      if ((s0.n ?? 0) > 0) expect(res(run({ ...pt, solveFor: 'w', d, w: 0.9 * MM }), 'w') / s0.w).toBeCloseTo(1, 10);
    }
  });
  it('W with N = 0 is reported and N is left alone (review fix: A → B → A)', () => {
    const st: any = { ...def.defaults(), solveFor: 'w', n: 0 };
    const r = runCompute(def, st);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/at least N = 1/);
    expect(st.n).toBe(0);
    st.solveFor = 'd';
    expect(res(runCompute(def, st), 'd')).toBeCloseTo(2.34 * MM, 15);
  });
  it('mask web counts the traces in the gap (review fix)', () => {
    expect(res(run({ maskExp: 0.15 * MM }), 'web')).toBeCloseTo(0.05 * MM, 15);
    expect(run({ maskExp: 0.15 * MM }).warnings.some((w) => /nearest trace/.test(w))).toBe(true);
    expect(run({ maskExp: 0.4 * MM }).warnings.some((w) => /expose the traces/.test(w))).toBe(true);
    expect(res(run({ n: 0, maskExp: 0.05 * MM }), 'web')).toBeCloseTo(2.54 * MM - 2.34 * MM - 0.1 * MM, 15);
  });
  it('a pitch filled by traces and clearances is reported, not a negative pad', () => {
    const r = run({ p: 0.5 * MM, n: 2, w: 0.15 * MM, s: 0.1 * MM });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/leaving nothing/);
  });
});

describe('maximum pad diameter — physics sanity', () => {
  it('D_max falls with N, W and s, rises with p; ring nominal = (D − a)/2', () => {
    const d = (p: Partial<MaxPadState>) => res(run(p), 'd');
    expect(d({ n: 1 })).toBeGreaterThan(d({ n: 2 }));
    expect(d({ w: 0.1 * MM })).toBeGreaterThan(d({ w: 0.2 * MM }));
    expect(d({ s: 0.15 * MM })).toBeGreaterThan(d({ s: 0.2 * MM }));
    expect(d({ p: 2.6 * MM })).toBeGreaterThan(d({}));
    expect(res(run({}), 'ringNom')).toBeCloseTo((1.54 * MM - 1.08 * MM) / 2, 15);
    expect(res(run({}), 'pMin')).toBeCloseTo(2.43 * MM, 15);
  });
});

describe('maximum pad diameter — warnings', () => {
  it('below the IPC land, mask web, fab limits; clean defaults', () => {
    const v = run(def.examples!.find((e) => e.id === 'bga-via-08')!.state);
    expect(v.status?.tone).toBe('fail');
    expect(v.warnings.some((w) => /below the .* IPC-2221 minimum land/.test(w))).toBe(true);
    expect(run({ maskExp: 0.15 * MM }).warnings.some((w) => /Mask web/.test(w))).toBe(true);
    expect(run({ w: 0.05 * MM }).notes.some((n) => /HDI/.test(n))).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
  it('the pitch table judges rows against the minimum land only for plated holes', () => {
    expect(run({}).tables[0].rowTones?.length).toBe(7);
    expect(run({ padType: 'smd' }).tables[0].rowTones).toBeUndefined();
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

describe('maximum pad diameter — fuzz (400 random states through runCompute)', () => {
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
      s.solveFor = def.solve!.options[i % 4].key;
      const st = s as unknown as MaxPadState;
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
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      for (const k of ['gap']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 9);
    }
    // the rest: random pitches too small for the random traces and clearances (reported with the binding term)
    expect(ok).toBeGreaterThan(150);
  });
});

describe('maximum pad diameter — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
    }
  });
});
