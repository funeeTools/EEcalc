import { describe, expect, it } from 'vitest';
import { def, type FetState } from '@/calculators/mosfet-op-point/def';
import { idOf, kFromGfs, smallSignal, solveOp } from '@/calculators/mosfet-op-point/model';
import { fuzz, res } from './fuzz-gen3';

const run = (p: Partial<FetState>) => def.compute({ ...def.defaults(), ...p });
const ex = (id: string) => ({ ...def.defaults(), ...def.examples!.find((e) => e.id === id)!.state }) as FetState;

describe('MOSFET operating point — published and reference values', () => {
  it('Sedra & Smith NMOS design example: V_t 0.7 V, K 3.2 mA/V², R_S 3.25k, R_D 5k on ±2.5 V → I_D 0.4 mA, V_GS 1.2 V, V_D 0.5 V', () => {
    // shifted by +2.5 V: single 5 V supply, gate at 2.5 V from a 1M/1M divider
    const r = def.compute(ex('sedra-nmos'));
    expect(res(r, 'id')).toBeCloseTo(0.4e-3, 12);
    expect(res(r, 'vgsOp')).toBeCloseTo(1.2, 9);
    expect(res(r, 'vdNode') - 2.5).toBeCloseTo(0.5, 9);
    expect(res(r, 'region')).toBe('saturation');
    expect(res(r, 'gm')).toBeCloseTo(1.6e-3, 12); // 2I_D/V_ov = 0.8 mA / 0.5 V
  });
  it('matches the independent Python bisection reference (gb3/py/fet_ref.py)', () => {
    const d = run({});
    expect(res(d, 'id')).toBeCloseTo(0.031070169821974705, 13);
    expect(res(d, 'vds')).toBeCloseTo(5.879176545070983, 10);
    const p = def.compute(ex('pmos'));
    expect(res(p, 'id')).toBeCloseTo(0.023684210526315787, 13);
    expect(res(p, 'vds')).toBeCloseTo(2.6315789473684212, 10); // magnitude
    expect(res(p, 'region')).toBe('saturation');
    const a = def.compute(ex('logic-ao3400'));
    expect(res(a, 'id')).toBeCloseTo(0.4996388344129725, 12);
    expect(res(a, 'region')).toBe('triode');
  });
  it('K from the 2N7000 typical g_fs (320 mS at 200 mA) is 0.256 A/V²', () => {
    expect(kFromGfs(0.32, 0.2)).toBeCloseTo(0.256, 15);
    expect(res(run({}), 'kFit')).toBeCloseTo(0.256, 15);
  });
});

const field = (k: string) => def.fields.flatMap((x: any) => (x.fields ?? [x])).find((x: any) => x.key === k) as any;
const flip = (s: any, k: string, v: string) => { def.sync!(s); s[k] = v; field(k).apply(v, s, s); return def.compute(s); };

describe('MOSFET operating point — review fixes (mode switches)', () => {
  it('N → P mirrors the divider and keeps the bias; P → N restores R1/R2', () => {
    const s: any = def.defaults();
    const n = def.compute(s);
    const p = flip(s, 'type', 'p');
    expect(res(p, 'id')).toBeCloseTo(res(n, 'id'), 12);
    expect(res(p, 'region')).toBe('saturation');
    flip(s, 'type', 'n');
    expect([s.r1, s.r2]).toEqual([1e6, 510e3]);
  });
  it('switching the K form carries K over (no error even with V_th above the old point)', () => {
    for (const to of ['point', 'k', 'gfs']) {
      const s: any = { ...def.defaults(), part: 'Custom', vth: 5, vdd: 24, r2: 3e6 };
      const a = def.compute(s);
      const b = flip(s, 'form', to);
      expect(b.ok, to).toBe(true);
      expect(res(b, 'id')).toBeCloseTo(res(a, 'id'), 12);
    }
    expect(res(def.compute({ ...def.defaults(), form: 'point' }), 'kFit')).toBeCloseTo(0.256, 3); // default point ≡ typical g_fs
  });
});

describe('MOSFET operating point — solve round trips', () => {
  const cases: Partial<FetState>[] = [{}, ex('pmos'), ex('sedra-nmos'), { bias: 'vgs', vgs: 3, rd: 100 }, { lambda: 0.05, rs: 0 }];
  it('gate bias for a target I_D: solve, feed back, recover I_D', () => {
    for (const c of cases) {
      for (const id of [5e-3, 20e-3]) {
        const g = run({ ...c, solveFor: 'gate', id });
        if (!g.ok) continue;
        const key = (c.bias ?? 'divider') === 'divider' ? 'r2' : 'vgs';
        const back = run({ ...c, solveFor: 'id', [key]: res(g, key) });
        expect(res(back, 'id') / id - 1).toBeCloseTo(0, 9);
      }
    }
  });
  it('R_D for a target V_DS: solve, feed back, recover V_DS', () => {
    for (const c of cases) {
      for (const vds of [1, 3]) {
        const g = run({ ...c, solveFor: 'rd', vds });
        expect(g.ok, JSON.stringify(c)).toBe(true);
        const back = run({ ...c, solveFor: 'id', rd: res(g, 'rd') });
        expect(res(back, 'vds') - vds).toBeCloseTo(0, 9);
      }
    }
  });
});

describe('MOSFET operating point — physics', () => {
  const f = { vth: 1, k: 2e-3, lambda: 0.02 };
  it('continuous at the triode/saturation edge; g_m = 2I_D/V_ov(·) in saturation; g_m and g_ds match finite differences', () => {
    expect(idOf(3, 2 - 1e-12, f)).toBeCloseTo(idOf(3, 2, f), 12);
    for (const [vgs, vds] of [[3, 5], [3, 0.7], [1.5, 0.2]]) {
      const ss = smallSignal(vgs, vds, f);
      const h = 1e-6;
      expect(ss.gm).toBeCloseTo((idOf(vgs + h, vds, f) - idOf(vgs - h, vds, f)) / (2 * h), 9);
      expect(ss.gds).toBeCloseTo((idOf(vgs, vds + h, f) - idOf(vgs, vds - h, f)) / (2 * h), 9);
    }
    const sat = smallSignal(3, 5, { ...f, lambda: 0 });
    expect(sat.gm).toBeCloseTo((2 * idOf(3, 5, { ...f, lambda: 0 })) / 2, 15);
  });
  it('source degeneration reduces the threshold sensitivity', () => {
    const spread = (rs: number, vg: number) => solveOp({ vdd: 12, vg, rd: 100, rs }, { ...f, vth: 0.8 }).id / solveOp({ vdd: 12, vg, rd: 100, rs }, { ...f, vth: 1.2 }).id;
    expect(spread(500, 6)).toBeLessThan(spread(0, 2));
  });
  it('cutoff below threshold', () => {
    expect(res(run({ bias: 'vgs', vgs: 1.5 }), 'region')).toBe('cutoff');
    expect(res(run({ bias: 'vgs', vgs: 1.5 }), 'id')).toBe(0);
  });
});

describe('MOSFET operating point — warnings, examples, fuzz', () => {
  it('warns at the validity and rating limits', () => {
    const has = (p: Partial<FetState>, re: RegExp) => run(p).warnings.some((w) => re.test(w));
    expect(has({ bias: 'vgs', vgs: 1.5 }, /subthreshold/)).toBe(true);
    expect(has({ bias: 'vgs', vgs: 2.2 }, /Overdrive is only/)).toBe(true);
    expect(has({ bias: 'vgs', vgs: 2.2, rd: 0 }, /far from the .* where K was fitted/)).toBe(true);
    expect(has({}, /threshold spread/)).toBe(true);
    expect(has({ vdd: 80 }, /drain–source rating/)).toBe(true);
    expect(has({ bias: 'vgs', vgs: 25 }, /gate–source voltage can exceed/)).toBe(true);
    expect(has({ bias: 'vgs', vgs: 4, rd: 10 }, /continuous rating|dissipates/)).toBe(true);
    expect(run({ solveFor: 'gate', id: 1 }).error).toMatch(/more than V_DD/);
    expect(run({ solveFor: 'rd', r2: 10e3 }).error).toMatch(/not above V_th/);
    expect(run({ solveFor: 'rd', vds: 11.9 }).error).toMatch(/out of reach/);
  });
  it('every example computes; the first equals the defaults; preset edits fall back to Custom', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) expect(def.compute({ ...def.defaults(), ...e.state } as FetState).ok, e.id).toBe(true);
    const s = { ...def.defaults(), vth: 2 };
    def.sync!(s);
    expect(s.part).toBe('Custom');
  });
  it('fuzz: 400 random states plus 300 realistic ones through runCompute', () => {
    expect(fuzz(def, 400, 2024)).toBeGreaterThan(50);
    expect(fuzz(def, 300, 5, (s, rnd) => Object.assign(s, { vdd: 1 + 30 * rnd(), vgs: 5 * rnd(), r1: 1e3 * 1e4 ** rnd(), r2: 1e3 * 1e4 ** rnd(), rd: 1e4 * rnd(), rs: 1e3 * rnd(), id: 1e-4 * 1e3 ** rnd(), vds: 0.1 + 10 * rnd(), vth: 0.5 + 3 * rnd(), gfs: 0.01 * 1e3 ** rnd(), idG: 1e-3 * 1e3 ** rnd(), lambda: 0.05 * rnd() }))).toBeGreaterThan(120);
  });
});
