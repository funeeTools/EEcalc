import { describe, expect, it } from 'vitest';
import { def, type ChokeState } from '@/calculators/common-mode-choke/def';
import { insertionLoss, lcm, ldm, selfResonance, zcm } from '@/calculators/common-mode-choke/model';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { abs, cx } from '@/core/math/complex';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<ChokeState>) => def.compute({ ...def.defaults(), ...p });
const r0 = () => run({});

describe('common-mode choke — references', () => {
  it('matches the Python re-implementation (coupled-pair impedance matrix solved directly)', () => {
    // python3 refs.py choke_fwd(al 4 µH, N 50, Cp 10 pF, Rp 20 kΩ, leak 1 %, Rdc 0.1 Ω, 50/50 Ω, 150 kHz)
    const r = run({ solveFor: 'l' });
    expect(res(r, 'zcm')).toBeCloseTo(9167.641781602608, 7);
    expect(res(r, 'ilCm')).toBeCloseTo(39.288878329247794, 10);
    expect(res(r, 'ilDm')).toBeCloseTo(2.7800727004007464, 10);
    expect(res(r, 'fr')).toBeCloseTo(503924.0049049696, 4);
    expect(res(r, 'ldm')).toBeCloseTo(0.00010025125786760139, 15);
    // CISPR 17 worst case 0.1 Ω → 100 Ω, 27 turns on A_L 6 µH at 1 MHz
    const w = run({ solveFor: 'l', n: 27, al: 6e-6, cp: 8e-12, rp: 15e3, leak: 0.8, rdc: 0.05, f: 1e6, zsCm: 0.1, zlCm: 100, zsDm: 0.1, zlDm: 100 });
    expect(res(w, 'zcm')).toBeCloseTo(14688.374334832883, 6);
    expect(res(w, 'ilCm')).toBeCloseTo(43.388572470975355, 10);
    expect(res(w, 'ilDm')).toBeCloseTo(7.668317174074418, 10);
  });
  it('hand checks (no published worked example found): pure 10 mH at 150 kHz in 50/50 Ω is 39.49 dB; 10 mH with 10 pF resonates at 503.3 kHz', () => {
    const p = { l: 10e-3, cp: 0, rp: null, rdc: 0, leak: 0 };
    const z = zcm(p, 150e3);
    expect(abs(z)).toBeCloseTo(2 * Math.PI * 150e3 * 10e-3, 8);
    expect(insertionLoss(z, 50, 50)).toBeCloseTo(20 * Math.log10(Math.hypot(100, 2 * Math.PI * 150e3 * 0.01) / 100), 12);
    expect(insertionLoss(z, 50, 50)).toBeCloseTo(39.486, 3);
    expect(selfResonance(10e-3, 10e-12)).toBeCloseTo(503292.1, 0);
  });
});

describe('common-mode choke — review fixes', () => {
  it('series choke: CISPR 17 0.1/100 Ω gives the same IL as 50/50 Ω (only Zs + Zl matters), and the page says so', () => {
    const a = run({});
    const b = run({ zsCm: 0.1, zlCm: 100 });
    expect(Math.abs(res(a, 'ilCm') - res(b, 'ilCm'))).toBeLessThan(0.01);
    expect(a.notes.some((n) => n.includes('only on Z_s + Z_l'))).toBe(true);
    expect(def.examples!.some((e) => e.id === 'worst-case')).toBe(false);
    const lisn = run(def.examples!.find((e) => e.id === 'lisn-30m')!.state);
    expect(lisn.ok).toBe(true);
    expect(lisn.warnings.some((w) => w.includes('self-resonance'))).toBe(true);
  });
  it('A_L defaults to µH/N² so the default reads 4, not 4000', () => {
    expect(def.defaults().alUnit).toBe('µH/N²');
    expect(r0().results.find((x) => x.key === 'al')!.display).toBe('4 µH/N²');
  });
  it('solved L, N and A_L are never written outside their field limits', () => {
    const l = run({ solveFor: 'l', al: 1e-3, n: 1e4 });
    expect(l.ok).toBe(false);
    expect(l.error).toMatch(/outside the 1 nH – 10 H range/);
    expect(run({ solveFor: 'n', l: 10, al: 1e-10 }).ok).toBe(false);
    expect(run({ solveFor: 'al', l: 10, n: 1 }).ok).toBe(false);
    let x = 5;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 300; i++) {
      const st = { solveFor: (['l', 'n', 'al'] as const)[i % 3], l: 1e-9 * 1e10 ** rnd(), n: 1e4 ** rnd(), al: 1e-10 * 1e7 ** rnd() };
      const r = run(st);
      if (!r.ok) continue;
      const v = res(r, st.solveFor);
      const [lo, hi] = { l: [1e-9, 10], n: [1, 1e4], al: [1e-10, 1e-3] }[st.solveFor];
      expect(v).toBeGreaterThanOrEqual(lo * (1 - 1e-12));
      expect(v).toBeLessThanOrEqual(hi * (1 + 1e-12));
    }
  });
  it('lossless choke at exactly f_r: |Z| and IL shown as unbounded with advice, no "TΩ" or 290 dB', () => {
    const fr = res(run({ rp: null }), 'fr');
    const r = run({ rp: null, f: fr });
    expect(r.ok).toBe(true);
    const z = r.results.find((q) => q.key === 'zcm')!;
    expect(z.value).toBeNull();
    expect(z.display).toMatch(/∞/);
    expect(r.results.find((q) => q.key === 'ilCm')!.value).toBeNull();
    expect(r.warnings.some((w) => w.includes('R_p'))).toBe(true);
    for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of sr.y) expect(y).toBeLessThan(1e9);
  });
});

describe('common-mode choke — physics', () => {
  it('L = A_L·N²: doubling N quadruples L; perfect coupling → L_CM = L, L_DM = 0', () => {
    const a = run({ solveFor: 'l', n: 20 });
    const b = run({ solveFor: 'l', n: 40 });
    expect(res(b, 'l') / res(a, 'l')).toBeCloseTo(4, 12);
    const p = { l: 1e-3, cp: 0, rp: null, rdc: 0, leak: 0 };
    expect(lcm(p)).toBe(1e-3);
    expect(ldm(p)).toBe(0);
  });
  it('small leakage: L_DM ≈ L_lk (= 2L(1−k) vs L(1−k²))', () => {
    const p = { l: 1e-3, cp: 0, rp: null, rdc: 0, leak: 0.01 };
    expect(ldm(p) / (0.01 * 1e-3)).toBeCloseTo(1, 2);
  });
  it('|Z| peaks at f_r with value R_p; below f_r inductive, above capacitive', () => {
    const p = { l: 1e-3, cp: 10e-12, rp: 5e3, rdc: 0, leak: 0 };
    const fr = selfResonance(1e-3, 10e-12);
    expect(abs(zcm(p, fr))).toBeCloseTo(5e3, 6);
    expect(zcm(p, fr / 10).im).toBeGreaterThan(0);
    expect(zcm(p, fr * 10).im).toBeLessThan(0);
    // far above: |Z| → 1/(ωC)
    expect(abs(zcm({ ...p, rp: null }, fr * 1e3)) * 2 * Math.PI * fr * 1e3 * 10e-12).toBeCloseTo(1, 5);
  });
  it('insertion loss is 0 dB for Z = 0 and grows with Z; lower terminations give more loss', () => {
    expect(insertionLoss(cx(0, 0), 50, 50)).toBe(0);
    expect(insertionLoss(cx(0, 1000), 25, 25)).toBeGreaterThan(insertionLoss(cx(0, 1000), 50, 50));
  });
  it('CM flux scales with N and current, falls with A_e', () => {
    const a = run({ icm: 0.01, ae: 50e-6 });
    const b = run({ icm: 0.02, ae: 50e-6 });
    expect(res(b, 'bcm') / res(a, 'bcm')).toBeCloseTo(2, 12);
    expect(res(a, 'bcm')).toBeCloseTo((4e-6 * 50 * 0.01) / 50e-6, 12);
  });
});

describe('common-mode choke — solve-for round trips', () => {
  it('L, N and A_L at several points', () => {
    for (const [al, n] of [[4e-6, 50], [50e-9, 3], [1e-6, 137], [20e-6, 7.5]]) {
      const l = res(run({ solveFor: 'l', al, n }), 'l');
      const rn = run({ solveFor: 'n', l, al, n: 1 });
      expect(res(rn, 'n') / n).toBeCloseTo(1, 9);
      const ra = run({ solveFor: 'al', l, n, al: 1e-9 });
      expect(res(ra, 'al') / al).toBeCloseTo(1, 9);
      expect(res(run({ solveFor: 'l', al: res(ra, 'al'), n: res(rn, 'n') }), 'l') / l).toBeCloseTo(1, 9);
    }
  });
  it('impossible turn counts report what to change', () => {
    const r = run({ solveFor: 'n', l: 1, al: 1e-9 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/turns/);
  });
});

describe('common-mode choke — warnings', () => {
  it('above self-resonance, saturation, high leakage', () => {
    expect(run({ f: 2e6 }).warnings.some((w) => w.includes('self-resonance'))).toBe(true);
    const s = run({ icm: 0.2, ae: 10e-6 });
    expect(s.warnings.some((w) => w.includes('saturates'))).toBe(true);
    expect(s.status?.tone).toBe('fail');
    expect(run({ leak: 15 }).warnings.some((w) => w.includes('Leakage'))).toBe(true);
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

describe('common-mode choke — fuzz (400 random states)', () => {
  it('never throws; finite results; clean strings; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 31337;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.optional && rnd() < 0.3 ? null : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as ChokeState;
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
      for (const k of ['l', 'zcm', 'ilCm', 'ilDm']) if (res(r, k) != null) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 9);
    }
    expect(ok).toBeGreaterThan(200);
  });
});

describe('common-mode choke — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
  });
  it('lossless at f_r: the summary says ∞, not a capped dB number', () => {
    const d = def.defaults();
    const st0 = { ...d, rp: null } as any;
    const r0 = def.compute(st0);
    const fr = r0.details?.fr as number | undefined;
    expect(fr).toBeGreaterThan(0);
    const r = def.compute({ ...st0, f: fr });
    expect(r.results.find((x) => x.key === 'zcm')?.display).toMatch(/^∞/);
    expect(r.summary).toMatch(/IL_CM ∞/);
  });
});

describe('mode-switch review (regressions)', () => {
  it('every example shows its frequency and A_L in a readable unit (no “100000 kHz”)', async () => {
    const { normalizeState, freshDefaults } = await import('@/core/calc/page');
    const U: Record<string, number> = { GHz: 1e9, MHz: 1e6, kHz: 1e3, Hz: 1, 'µH/N²': 1e-6, 'nH/N²': 1e-9 };
    for (const ex of def.examples!) {
      const st = normalizeState(def, { ...freshDefaults(def), ...structuredClone(ex.state) }) as ChokeState;
      const f = st.f / U[st.fUnit];
      const al = st.al / U[st.alUnit];
      expect(f, ex.id).toBeGreaterThanOrEqual(1);
      expect(f, ex.id).toBeLessThan(1e4);
      expect(al, ex.id).toBeGreaterThanOrEqual(1);
      expect(al, ex.id).toBeLessThan(1e4);
    }
  });
});
