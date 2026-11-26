import { describe, expect, it } from 'vitest';
import { type CpwState, def } from '@/calculators/conductor-pad-width/def';
import { exposedTrace, segInt } from '@/calculators/conductor-pad-width/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<CpwState>) => def.compute({ ...def.defaults(), ...p });
const MM = 1e-3;

describe('conductor-to-pad width — published guidelines', () => {
  it('TI AN-1112 §4.1: trace at an NSMD land ≤ 2/3 of the land; a 0.3 mm land takes 0.2 mm', () => {
    const r = run({ solveFor: 'w', shape: 'round', d: 0.3 * MM, other: 'none' });
    expect(res(r, 'w')).toBeCloseTo(0.2 * MM, 15);
    expect(r.status?.tone).toBe('pass');
  });
  it('Microchip WLCSP Table 6-1: 0.230 mm land, 0.075 mm trace → 32.6 %, inside the 2/3 limit', () => {
    const ex = def.examples!.find((e) => e.id === 'microchip-wlcsp')!;
    const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
    expect(res(r, 'ratio')).toBeCloseTo((0.075 / 0.23) * 100, 9);
    expect(r.status?.tone).toBe('pass');
    expect(r.notes.some((n) => /Microchip/.test(n))).toBe(false); // 75 µm is under Microchip's 100 µm
  });
});

describe('conductor-to-pad width — independent Python model (xcheck.py)', () => {
  it('exposed copper: rectangle exact, circle by 20 000-point quadrature', () => {
    // Python: rect 0.6 × 0.5 land, W = 0.4, e = 0.05 → 0.02 mm² / 0.3 mm² = 6.667 %
    expect(res(run({}), 'exposed')).toBeCloseTo(0.0666666666667, 10);
    // Python (quadrature): Ø0.3 land, W = 0.25, e = 0.05 → 0.0139914 mm² (19.794 % of the land)
    const r = run({ solveFor: 'ratio', shape: 'round', d: 0.3 * MM, w: 0.25 * MM, wr: 0.25 * MM, e: 0.05 * MM, other: 'none' });
    expect(res(r, 'exposed') / 0.1979383143).toBeCloseTo(1, 5);
    // Python: Ø0.23 land, W = 0.075, e = 0.035 → 6.4073 % of the land
    expect(exposedTrace('round', 0.23 * MM, 0.075 * MM, 0.035 * MM) / ((Math.PI * (0.23 * MM) ** 2) / 4) / 0.0640730124).toBeCloseTo(1, 5);
  });
  it('segment integral: quarter disc and the full strip limit', () => {
    expect(segInt(1, 1)).toBeCloseTo(Math.PI / 4, 14);
    expect(segInt(5, 1)).toBeCloseTo(Math.PI / 4, 14); // a wider strip sees the whole quarter disc
    // a trace wider than the opening exposes the whole ring half: π((R+e)² − R²)/2
    const R = 0.15e-3;
    const e = 0.05e-3;
    expect(exposedTrace('round', 2 * R, 1e-3, e)).toBeCloseTo((Math.PI * ((R + e) ** 2 - R ** 2)) / 2, 18);
  });
});

describe('conductor-to-pad width — physics sanity', () => {
  it('exposed copper grows with W and e, is zero for SMD lands and with no clearance', () => {
    const a = (w: number, e: number) => exposedTrace('round', 0.4 * MM, w, e);
    expect(a(0.2 * MM, 0.05 * MM)).toBeGreaterThan(a(0.1 * MM, 0.05 * MM));
    expect(a(0.2 * MM, 0.08 * MM)).toBeGreaterThan(a(0.2 * MM, 0.05 * MM));
    expect(a(0.2 * MM, 0)).toBe(0);
    expect(res(run({ padDef: 'smd' }), 'exposed')).toBe(0);
    // a narrow strip: the exposed length tends to e (the ring is locally straight)
    expect(exposedTrace('round', 0.4 * MM, 1e-9, 0.05 * MM) / (1e-9 * 0.05 * MM)).toBeCloseTo(1, 6);
  });
  it('neck length = mask clearance + registration, only when the routing trace is wider', () => {
    expect(res(run({}), 'lNeck')).toBeCloseTo(0.1 * MM, 15);
    expect(res(run({ wr: 0.3 * MM }), 'lNeck')).toBe(0);
  });
});

describe('conductor-to-pad width — solve round trips', () => {
  it('W ↔ D ↔ ratio at several targets and lands', () => {
    for (const [shape, d, ratio] of [['rect', 0.6, 66.667], ['round', 0.3, 50], ['rect', 1.5, 40], ['round', 0.25, 66.667]] as const) {
      const rw = run({ solveFor: 'w', shape, d: d * MM, ratio, other: 'none' });
      const w = res(rw, 'w');
      expect(res(run({ solveFor: 'ratio', shape, d: d * MM, w, other: 'none' }), 'ratio') / ratio).toBeCloseTo(1, 10);
      const rd = run({ solveFor: 'd', shape, w, ratio, d: 5 * MM, other: 'none' });
      expect(res(rd, 'd') / (d * MM)).toBeCloseTo(1, 10);
    }
  });
});

describe('conductor-to-pad width — review fixes (§5a)', () => {
  it('a typed limit moves a target that sits on the old limit (W_max 400 → 300 µm at k = 50 %)', () => {
    const st: any = { ...def.defaults() };
    runCompute(def, st);
    st.rule = 'custom';
    st.k = 50;
    const r = runCompute(def, st);
    expect(res(r, 'w')).toBeCloseTo(0.3 * MM, 15);
    expect(r.status?.tone).toBe('pass');
    // a target the user chose stays put
    st.ratio = 40;
    runCompute(def, st);
    st.k = 45;
    expect(res(runCompute(def, st), 'w')).toBeCloseTo(0.24 * MM, 15);
  });
  it('rect → round → rect keeps the other terminal’s connection', () => {
    const st: any = { ...def.defaults() };
    runCompute(def, st);
    st.shape = 'round';
    runCompute(def, st);
    st.shape = 'rect';
    const r = runCompute(def, st);
    expect(st.other).toBe('trace');
    expect(r.results.some((x) => x.key === 'balance')).toBe(true);
  });
});

describe('conductor-to-pad width — warnings', () => {
  it('too wide, thermal imbalance, Microchip limit; clean defaults', () => {
    const wide = run({ solveFor: 'ratio', w: 0.5 * MM });
    expect(wide.status?.tone).toBe('fail');
    expect(wide.warnings.some((w) => /Neck the trace/.test(w))).toBe(true);
    expect(run({ other: 'pour', wr: 0.3 * MM }).warnings.some((w) => /tombstoning/.test(w))).toBe(true);
    expect(run({ other: 'spokes', ns: 2, wsp: 0.2 * MM }).warnings).toEqual([]);
    expect(run({ solveFor: 'ratio', shape: 'round', d: 0.25 * MM, w: 0.15 * MM, wr: 0.15 * MM }).notes.some((n) => /Microchip/.test(n))).toBe(true);
    expect(run({ padDef: 'smd', solveFor: 'ratio', w: 0.5 * MM }).status).toBeUndefined();
    expect(run({}).warnings).toEqual([]);
  });
  it('◎ on W from the check starts the target at the limit', () => {
    const f = (def.fields[0] as any).fields[0] as FieldSpec;
    expect((f as any).key).toBe('ratio');
    const st: any = { ...def.defaults(), solveFor: 'ratio', w: 0.5 * MM };
    runCompute(def, st);
    expect(st.ratio).toBeCloseTo(83.33, 1);
    const wf: any = (def.fields[2] as any).fields[0];
    wf.onSolve(st, st);
    expect(st.solveFor).toBe('w');
    expect(st.ratio).toBeCloseTo(66.667, 3);
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

describe('conductor-to-pad width — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute; the check is never refused', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 7;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      s.ns = Math.max(1, Math.round(s.ns as number));
      s.ratio = 20 + 100 * rnd(); // a realistic target (random log targets over 0.01–30 000 % mostly leave the W / D ranges)
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as CpwState;
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
      for (const k of ['ratio', 'exposed']) expect(res(again, k)).toBeCloseTo(res(r, k), 9);
    }
    expect(ok).toBeGreaterThan(300);
  });
});

describe('conductor-to-pad width — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
    }
  });
});
