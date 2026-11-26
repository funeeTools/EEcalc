import { describe, expect, it } from 'vitest';
import { def, type ViaState } from '@/calculators/via-calculator/def';
import { barrelArea, barrelTheta, johnsonC, johnsonL, viaCurrent, zcoax } from '@/calculators/via-calculator/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<ViaState>) => def.compute({ ...def.defaults(), ...p });
const IN = 0.0254;
const MIL2 = 25.4e-6 ** 2;

describe('via calculator — published values', () => {
  it('Johnson & Graham ch. 7: 0.028 in pad, 0.055 in clearance, 0.063 in FR-4 (εr 4.4) → 0.41 pF; 0.016 in drill → 1.2 nH (book form)', () => {
    expect(johnsonC(4.4, 0.063 * IN, 0.028 * IN, 0.055 * IN) * 1e12).toBeCloseTo(0.405, 3);
    expect(johnsonL(0.063 * IN, 0.016 * IN) * 1e9).toBeCloseTo(1.2, 1);
    const r = run({ d: 0.016 * IN, t: 25e-6, pad: 0.028 * IN, Da: 0.055 * IN, h: 0.063 * IN, er: 4.4 });
    expect(res(r, 'cJ') * 1e12).toBeCloseTo(0.405, 3);
    expect(res(r, 'lJohnson') * 1e9).toBeCloseTo(1.2, 1);
  });
  it('IPC-2221A Fig. 6-4 fit: 0.048·ΔT^0.44·A^0.725; 100 mil² external at 10 °C → 0.048·10^0.44·100^0.725 A', () => {
    // A barrel of exactly 100 mil²: t = 1 mil, d − t = 100/π mil
    const t = 25.4e-6;
    const d = (100 / Math.PI + 1) * 25.4e-6;
    expect(barrelArea(d, t) / MIL2).toBeCloseTo(100, 10);
    expect(viaCurrent(d, t, 10, 'external')).toBeCloseTo(0.048 * 10 ** 0.44 * 100 ** 0.725, 12); // 3.70 A
  });
  it('coaxial line (Pozar Table 2.1): Z = (η₀/2π√εr)·ln(D/d); 7 mm / 3.04 mm air line ≈ 50 Ω', () => {
    expect(zcoax(3.04e-3, 7e-3, 1)).toBeCloseTo(49.98, 1);
  });
});

describe('via calculator — independent Python model (xcheck.py)', () => {
  it('default 0.3 mm / 25 µm via in 1.6 mm FR-4', () => {
    const r = run({});
    expect(res(r, 'iMax')).toBeCloseTo(1.6853446055708454, 10);
    expect(res(r, 'z')).toBeCloseTo(34.41446620137177, 10);
    expect(res(r, 'r')).toBeCloseTo(0.0013524154504185862, 14);
    expect(res(r, 'theta')).toBeCloseTo(192.41400439917444, 9);
    expect(res(r, 'cJ')).toBeCloseTo(5.862047244094486e-13, 22);
    expect(res(r, 'lPartial')).toBeCloseTo(6.592866546601996e-10, 19);
  });
  it('internal chart, RO4350B, 0.5 mm drill, 2.4 mm board, 30 °C rise from 40 °C', () => {
    const r = run({ layer: 'internal', d: 0.5e-3, t: 20e-6, Da: 1.5e-3, pad: 0.9e-3, h: 2.4e-3, er: 3.66, dT: 30, ta: 40, kCu: 390 });
    expect(res(r, 'iMax')).toBeCloseTo(1.7406682441451204, 10);
    expect(res(r, 'z')).toBeCloseTo(34.431394210852375, 10);
    expect(res(r, 'r')).toBeCloseTo(0.0016414970267094838, 14);
    expect(res(r, 'theta')).toBeCloseTo(204.0447988357634, 9);
  });
  it('drill for 3 A (closed-form inverse in Python)', () => {
    const r = run({ solveFor: 'd', iMax: 3, pad: 1.6e-3, Da: 2.2e-3 });
    expect(res(r, 'd') / 0.0006341957798551391).toBeCloseTo(1, 12);
  });
});

describe('via calculator — solve round trips', () => {
  const pts: Partial<ViaState>[] = [{}, { d: 0.2e-3, t: 18e-6, h: 0.8e-3, layer: 'internal', dT: 20 }, { d: 1e-3, t: 35e-6, pad: 1.8e-3, Da: 2.5e-3, er: 3.5, dT: 45 }];
  it('d, t and D_ap: solve, feed back, recover the target', () => {
    for (const p of pts) {
      const base = run({ ...p, solveFor: 'iMax' });
      const i0 = res(base, 'iMax');
      const z0 = res(base, 'z');
      for (const k of ['d', 't'] as const) {
        const r = run({ ...p, solveFor: k, iMax: i0, [k]: (p[k] ?? def.defaults()[k]) * 1.4 });
        expect(r.ok, r.error).toBe(true);
        expect(res(r, k) / ((p[k] ?? def.defaults()[k]) as number)).toBeCloseTo(1, 8);
        expect(res(run({ ...p, solveFor: 'iMax', [k]: res(r, k) }), 'iMax') / i0).toBeCloseTo(1, 9);
      }
      const r = run({ ...p, solveFor: 'Da', z: z0, Da: 5e-3 });
      expect(r.ok, r.error).toBe(true);
      expect(res(run({ ...p, solveFor: 'iMax', Da: res(r, 'Da') }), 'z') / z0).toBeCloseTo(1, 9);
    }
  });
  it('impossible targets report what limits them', () => {
    const r = run({ solveFor: 't', iMax: 50, d: 0.2e-3 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/larger drill|several vias/);
    const big = run({ solveFor: 'd', iMax: 6 });
    expect(big.ok).toBe(false);
    expect(big.error).toMatch(/does not fit the .* pad/);
  });
});

describe('via calculator — physics', () => {
  it('current rises with drill, plating and ΔT; internal chart is exactly half', () => {
    expect(viaCurrent(0.4e-3, 25e-6, 10, 'external')).toBeGreaterThan(viaCurrent(0.3e-3, 25e-6, 10, 'external'));
    expect(viaCurrent(0.3e-3, 35e-6, 10, 'external')).toBeGreaterThan(viaCurrent(0.3e-3, 25e-6, 10, 'external'));
    expect(viaCurrent(0.3e-3, 25e-6, 10, 'internal') / viaCurrent(0.3e-3, 25e-6, 10, 'external')).toBeCloseTo(0.5, 12);
  });
  it('R and θ scale with length and 1/area; R/(θ·k_Cu) = ρ (same geometry factor h/A)', () => {
    const a = run({});
    const b = run({ h: 3.2e-3 });
    expect(res(b, 'r') / res(a, 'r')).toBeCloseTo(2, 12);
    expect(res(b, 'theta') / res(a, 'theta')).toBeCloseTo(2, 12);
    expect(res(a, 'r') / (res(a, 'theta') * 385) / (1.724e-8 * (1 + 0.00393 * 15))).toBeCloseTo(1, 12);
    expect(barrelTheta(0.3e-3, 25e-6, 1.6e-3, 385)).toBeCloseTo(192.414, 2);
  });
  it('impedance: zero as D_ap → d, ∝ 1/√εr; capacitance grows as the clearance shrinks', () => {
    expect(zcoax(0.3e-3, 0.3e-3 * (1 + 1e-9), 4)).toBeLessThan(1e-6);
    expect(zcoax(0.3e-3, 1e-3, 1) / zcoax(0.3e-3, 1e-3, 4)).toBeCloseTo(2, 12);
    expect(res(run({ Da: 0.8e-3 }), 'cJ')).toBeGreaterThan(res(run({ Da: 1.2e-3 }), 'cJ'));
  });
});

describe('via calculator — validity warnings', () => {
  it('AR limit, thin plating, IPC chart range, hot barrel, antipad ≤ pad, short fat via', () => {
    const has = (p: Partial<ViaState>, re: RegExp) => run(p).warnings.some((w) => re.test(w));
    expect(has({ d: 0.15e-3, h: 1.6e-3 }, /Aspect ratio/)).toBe(true);
    expect(run({ d: 0.15e-3, h: 1.6e-3 }).status?.tone).toBe('fail');
    expect(has({ t: 15e-6 }, /below the IPC-6012 minimum/)).toBe(true);
    expect(run({ t: 22e-6 }).notes.some((n) => /not Class 3/.test(n))).toBe(true);
    expect(has({ dT: 5 }, /Outside the IPC-2221 chart range/)).toBe(true);
    expect(has({ d: 4e-3, t: 100e-6, pad: 6e-3, Da: 8e-3 }, /mil² \(charts/)).toBe(true);
    expect(has({ dT: 100, ta: 25 }, /exceeds the ~105–130 °C/)).toBe(true);
    expect(has({ Da: 0.5e-3 }, /Johnson’s capacitance formula needs/)).toBe(true);
    expect(res(run({ Da: 0.5e-3 }), 'cJ')).toBeNull();
    expect(has({ d: 1.2e-3, pad: 2e-3, Da: 3e-3, h: 1.6e-3 }, /T\/d = .* < 2/)).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
  it('geometry errors are typed-input errors', () => {
    expect(run({ t: 0.16e-3, d: 0.3e-3 }).error).toMatch(/thinner than half the drill/);
    expect(run({ pad: 0.25e-3 }).error).toMatch(/Pad .* must be larger than the drill/);
  });
});

type Num = { key: string; min: number; max: number; integer?: boolean };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number' && !nums.some((n) => n.key === f.key)) nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, integer: f.integer });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('via calculator — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute; valid inputs not refused', () => {
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
      if (i % 2) {
        // half the states get a buildable via so the full path runs
        s.t = 10e-6 + 50e-6 * rnd();
        s.d = (s.t as number) * (3 + 60 * rnd());
        s.pad = (s.d as number) * (1.2 + 2 * rnd());
        s.Da = (s.pad as number) * (1.05 + 2 * rnd());
      }
      s.solveFor = def.solve!.options[i % 4].key;
      const st = s as unknown as ViaState;
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
      for (const k of ['iMax', 'z', 'r']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 7);
      if (st.solveFor === 'iMax') expect(r.ok).toBe(true);
    }
    expect(ok).toBeGreaterThan(150);
  });
  it('analysis of any buildable via is never refused', () => {
    let x = 99;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const t = 5e-6 + 100e-6 * rnd();
      const d = Math.min(6e-3, Math.max(50e-6, t * (2.2 + 50 * rnd())));
      const pad = Math.min(10e-3, d * (1.1 + 2 * rnd()));
      const st = { ...def.defaults(), solveFor: 'iMax' as const, t, d, pad, Da: Math.min(20e-3, pad * (1 + 2 * rnd())), h: 0.1e-3 + 6e-3 * rnd(), dT: 10 + 90 * rnd() };
      if (!(pad > d)) continue;
      const r = runCompute(def, st);
      expect(r.ok, `${JSON.stringify(st)} ${r.error}`).toBe(true);
    }
  });
});

describe('via calculator — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
    }
    expect(run(def.examples!.find((e) => e.id === 'backplane')!.state).status?.tone).toBe('fail');
  });
});
