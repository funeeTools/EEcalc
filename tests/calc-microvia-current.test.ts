import { describe, expect, it } from 'vitest';
import { def, type MvState } from '@/calculators/microvia-current/def';
import { MIL2, mvArea, mvCapacity } from '@/calculators/microvia-current/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<MvState>) => def.compute({ ...def.defaults(), ...p });

describe('microvia current — published values', () => {
  it('IPC-2221A Fig. 6-4 fit: 100 mil² internal at 10 °C = 0.024·10^0.44·100^0.725', () => {
    const t = 25.4e-6;
    const d = (100 / Math.PI + 1) * 25.4e-6;
    expect(mvArea(d, t, false) / MIL2).toBeCloseTo(100, 10);
    expect(mvCapacity(1, d, t, false, 10, 'internal')).toBeCloseTo(0.024 * 10 ** 0.44 * 100 ** 0.725, 12);
  });
  it('worked example (cross-check): D 100 µm, t 18 µm, 75 µm deep, 10 °C → 7.187 mil², 276.2 mA; 2 vias 456.5 mA; 1 A needs 6 (1.012 A)', () => {
    expect(mvArea(100e-6, 18e-6, false) / MIL2).toBeCloseTo(7.187, 3);
    const r = run(def.examples!.find((e) => e.id === 'one-via')!.state);
    expect(res(r, 'iMax') * 1e3).toBeCloseTo(276.2, 1);
    expect(res(run({ t: 18e-6, n: 2 }), 'iMax') * 1e3).toBeCloseTo(456.5, 1);
    const a = run(def.examples!.find((e) => e.id === 'array')!.state);
    expect(res(a, 'n')).toBe(6);
    expect(res(a, 'iMax')).toBeCloseTo(1.012, 3);
  });
});

describe('microvia current — independent Python model (mv/x.py)', () => {
  it('defaults: capacity, trace, resistance, conduction rise, current density', () => {
    const r = run({});
    expect(res(r, 'iMax') / 0.19295757374430533).toBeCloseTo(1, 12);
    expect(res(r, 'iTrace') / 0.45048639594449186).toBeCloseTo(1, 12);
    expect(res(r, 'r') / 0.00048426334487644714).toBeCloseTo(1, 12);
    expect(res(r, 'dTcond') / 9.383876432057853e-5).toBeCloseTo(1, 12);
    expect(res(r, 'j') / 53051647.69729845).toBeCloseTo(1, 12);
    expect(res(r, 'dTtrace') / 0.8214236906096171).toBeCloseTo(1, 12);
  });
});

describe('microvia current — solve round trips', () => {
  const pts: Partial<MvState>[] = [{}, { fill: 'cu', i: 0.4, n: 3, viaLayer: 'external' }, { d: 150e-6, t: 15e-6, h: 100e-6, padCap: 350e-6, padTgt: 400e-6, dT: 30 }];
  it('D and ΔT reproduce the design current exactly; N is the smallest whole count', () => {
    for (const p of pts) {
      const rd = run({ ...p, solveFor: 'd' });
      expect(rd.ok, rd.error).toBe(true);
      if (res(rd, 'd') > 25e-6 * 1.001 && !rd.notes.some((n) => /aspect-ratio limit/.test(n))) expect(res(run({ ...p, d: res(rd, 'd') }), 'iMax') / (p.i ?? 0.15)).toBeCloseTo(1, 9);
      const rt = run({ ...p, solveFor: 'dT' });
      expect(rt.ok, rt.error).toBe(true);
      expect(res(run({ ...p, dT: res(rt, 'dT') }), 'iMax') / (p.i ?? 0.15)).toBeCloseTo(1, 9);
      const rn = run({ ...p, solveFor: 'n', i: 2 });
      const n = res(rn, 'n');
      expect(res(rn, 'iMax')).toBeGreaterThanOrEqual(2 * (1 - 1e-12));
      if (n > 1) expect(res(run({ ...p, n: n - 1 }), 'iMax')).toBeLessThan(2);
    }
  });
  it('unreachable currents show the closest in range, in red, with the reason (harness highs on ◎ D and ◎ ΔT)', () => {
    const d = run({ solveFor: 'd', i: 50 });
    expect(d.ok).toBe(true);
    expect(res(d, 'd')).toBe(0.5e-3);
    expect(d.warnings.some((w) => /beyond the .* of a laser microvia/.test(w))).toBe(true);
    expect(run({ solveFor: 'n', i: 100, d: 30e-6, t: 5e-6 }).warnings.some((w) => /Even 1000 microvias/.test(w))).toBe(true);
    const t = run({ solveFor: 'dT', n: 231, viaLayer: 'external' });
    expect(t.ok).toBe(true);
    expect(res(t, 'dT')).toBe(1e-3);
  });
});

describe('microvia current — review fixes', () => {
  it('1: the D solve is floored at h so AR ≤ 1:1, with a note, and never goes red from the defaults', () => {
    const r = runCompute(def, { ...def.defaults(), solveFor: 'd' });
    expect(r.ok).toBe(true);
    expect(res(r, 'd')).toBeCloseTo(75e-6, 12);
    expect(res(r, 'ar')).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.status?.tone).not.toBe('fail');
    expect(r.notes.some((n) => /aspect-ratio limit/.test(n))).toBe(true);
    const tiny = run({ solveFor: 'd', i: 1e-4 });
    expect(res(tiny, 'ar')).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('2: a pad smaller than the hole is its own warning; the solved N is not called closest', () => {
    const r = run({ solveFor: 'n', d: 260e-6 });
    expect(res(r, 'n')).toBe(1);
    expect(r.results.find((x) => x.key === 'n')?.tone).not.toBe('fail');
    expect(r.warnings.some((w) => /pads must be larger/.test(w))).toBe(true);
    expect(r.status?.text).toMatch(/pads smaller than hole/);
    const t = run({ solveFor: 'dT', d: 260e-6 });
    expect(t.results.find((x) => x.key === 'dT')?.note).not.toMatch(/clamped/);
  });
  it('3: the status names thin plating, high current density and a too-deep via', () => {
    expect(run({ t: 8e-6 }).status).toEqual({ text: 'thin plating', tone: 'warn' });
    expect(run({ dT: 100, t: 18e-6, i: 0.5 }).status?.text).toMatch(/J > 100 A\/mm²/);
    expect(run({ h: 0.3e-3, d: 0.35e-3, padCap: 0.5e-3, padTgt: 0.55e-3 }).status?.text).toMatch(/not a microvia/);
  });
});

describe('microvia current — physics and checks', () => {
  it('N^0.725 array rule, external = 2× internal, filled > ring, capacity rises with ΔT', () => {
    expect(res(run({ n: 4 }), 'iMax') / res(run({}), 'iMax')).toBeCloseTo(4 ** 0.725, 12);
    expect(res(run({ viaLayer: 'external' }), 'iMax') / res(run({}), 'iMax')).toBeCloseTo(2, 12);
    expect(res(run({ fill: 'cu' }), 'iMax')).toBeGreaterThan(res(run({}), 'iMax'));
    expect(res(run({ dT: 20 }), 'iMax')).toBeGreaterThan(res(run({}), 'iMax'));
  });
  it('warnings: AR > 1, depth > 0.25 mm, thin plating, current density, trace limits, over capacity', () => {
    const has = (p: Partial<MvState>, re: RegExp) => run(p).warnings.some((w) => re.test(w));
    expect(has({ h: 150e-6, d: 125e-6, padCap: 300e-6, padTgt: 350e-6 }, /exceeds the 1:1 microvia limit/)).toBe(true);
    expect(run({ h: 90e-6 }).notes.some((n) => /0\.75:1/.test(n))).toBe(true);
    expect(has({ h: 0.3e-3, d: 0.35e-3, padCap: 0.5e-3, padTgt: 0.55e-3 }, /not a microvia/)).toBe(true);
    expect(has({ t: 8e-6 }, /below the IPC-6012 microvia minimum/)).toBe(true);
    expect(has({ i: 0.5 }, /rule of thumb/)).toBe(true);
    expect(has({ i: 0.3, n: 2, w: 75e-6, tCu: 18e-6 }, /feeding trace carries only/)).toBe(true);
    expect(res(run({ i: 0.3, n: 2, w: 75e-6, tCu: 18e-6 }), 'limit')).toBeNull();
    expect(has({ i: 0.3 }, /exceeds the guardrail capacity/)).toBe(true);
    expect(run({}).warnings).toEqual([]);
    expect(run({ t: 60e-6 }).error).toMatch(/thinner than half/);
    expect(run({ padCap: 90e-6 }).warnings.some((w) => /must be larger than/.test(w))).toBe(true);
    expect(run({ padCap: 90e-6 }).status?.tone).toBe('fail');
    expect(run({ viaLayer: 'external', n: 1000, d: 0.5e-3, padCap: 0.7e-3, padTgt: 0.8e-3, h: 0.2e-3 }).notes.some((n) => /35 A external chart/.test(n))).toBe(true);
  });
});

type Num = { key: string; min: number; max: number; integer?: boolean };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number' && !f.output) nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, integer: f.integer });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('microvia current — fuzz (320 states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute; buildable vias never refused', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 11;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 320; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) {
        const v = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
        s[f.key] = f.integer ? Math.round(v) : v;
      }
      const buildable = i % 2 === 1;
      if (buildable) {
        s.d = 40e-6 + 300e-6 * rnd();
        s.t = (s.d as number) * 0.4 * rnd() + 1e-6;
        s.padCap = (s.d as number) * (1.2 + rnd());
        s.padTgt = (s.d as number) * (1.2 + rnd());
      }
      s.solveFor = def.solve!.options[i % 4].key;
      const st = s as unknown as MvState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        if (buildable && st.solveFor === 'iMax') expect(r.ok, `${JSON.stringify(st)} ${r.error}`).toBe(true);
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
      for (const k of ['iMax', 'iTrace', 'j']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 9);
    }
    expect(ok).toBeGreaterThan(120);
  });
});

describe('microvia current — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
    }
    expect(run(def.examples!.find((e) => e.id === 'deep')!.state).status?.tone).toBe('fail');
  });
});
