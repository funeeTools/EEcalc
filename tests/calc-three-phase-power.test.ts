import { describe, expect, it } from 'vitest';
import { def, type TpState } from '@/calculators/three-phase-power/def';
import { balanced, pInst } from '@/calculators/three-phase-power/model';
import { runCompute } from '@/core/calc/page';

const val = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<TpState>) => def.compute({ ...def.defaults(), ...p });
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('three-phase — published examples', () => {
  it('Alexander & Sadiku Ex. 12.3: V_an = 100 V (ABC) into a Δ of 8 + j4 Ω → I_ab = 19.36 A, I_a = 33.54 A', () => {
    const ex = def.examples!.find((e) => e.id === 'sadiku')!;
    const r = run(ex.state);
    expect(val(r, 'il')).toBeCloseTo(33.54, 2);
    expect(val(r, 'iph')).toBeCloseTo(19.36, 2);
    expect(val(r, 'r')).toBeCloseTo(8, 9);
    expect(val(r, 'x')).toBeCloseTo(4, 9);
  });
  it('feature-list case (400 V Y, 10 A, 0.85) gives 5.889 kW, 3.65 kvar, 6.928 kVA, V_ph 230.9 V — the defaults', () => {
    const r = run({});
    expect(val(r, 'p')).toBeCloseTo(5889, 0);
    expect(val(r, 'q')).toBeCloseTo(3650, -1);
    expect(val(r, 's')).toBeCloseTo(6928, 0);
    expect(val(r, 'vph')).toBeCloseTo(230.94, 2);
  });
});

describe('three-phase — independent Python reference (scratch pb4/ref.py)', () => {
  it('Δ, 690 V, 120 A, 0.83 leading', () => {
    const r = run({ conn: 'delta', vl: 690, il: 120, pf: 0.83, side: 'lead' });
    expect(rel(val(r, 'p'), 119033.45969936354)).toBeLessThan(1e-12);
    expect(rel(val(r, 'q'), -79990.97119050377)).toBeLessThan(1e-12);
    expect(rel(val(r, 'iph'), 69.2820323027551)).toBeLessThan(1e-12);
    expect(rel(val(r, 'x'), -5.554928554896094)).toBeLessThan(1e-12);
  });
  it('Y 4-wire unbalanced 100 / 80 / 60 A, 120° apart: I_N = 34.64 A, I₁ = 80, I₂ = I₀ = 11.547 A', () => {
    const r = run({ conn: 'wye', vl: 690, il: 120, pf: 0.83, side: 'lead', unbal: true, ia: 100, aDeg: -25.84, ib: 80, bDeg: -145.84, ic: 60, cDeg: 94.16 });
    expect(rel(val(r, 'in'), 34.64101615137753)).toBeLessThan(1e-12);
    expect(rel(val(r, 'i1'), 80)).toBeLessThan(1e-12);
    expect(rel(val(r, 'i2'), 11.547005383792529)).toBeLessThan(1e-12);
    expect(rel(val(r, 'i0'), 11.54700538379251)).toBeLessThan(1e-12);
    expect(rel(val(r, 'r'), 2.7554041597074894)).toBeLessThan(1e-12);
  });
  it('solve V_L from S = 250 kVA at 300 A (Δ)', () => {
    const r = run({ solveFor: 'vl', conn: 'delta', pBy: 's', s: 250e3, il: 300, pf: 0.83, side: 'lead' });
    expect(rel(val(r, 'vl'), 481.12522432468813)).toBeLessThan(1e-12);
    expect(rel(val(r, 'r'), 2.305555555555555)).toBeLessThan(1e-12);
  });
});

describe('three-phase — solve round trips', () => {
  const pts: Partial<TpState>[] = [{}, { conn: 'delta', vl: 11e3, il: 52, pf: 0.7 }, { vl: 208, il: 0.5, pf: 0.99, side: 'lead' }, { vl: 1.5e6, il: 2000, pf: 0.2 }];
  it.each(pts.map((p, k) => [k, p] as const))('point %i: analysis → each unknown recovers its value', (_k, p) => {
    for (const by of ['p', 's'] as const)
      for (const key of ['il', 'vl', 'pf'] as const) {
        const st: any = { ...def.defaults(), ...p, solveFor: 'p' };
        runCompute(def, st);
        const want = st[key];
        st.solveFor = key;
        st.pBy = by;
        st[key] = want * 1.7; // stale value must be overwritten
        if (key === 'pf' && want * 1.7 > 1) st.pf = 0.5;
        const r = runCompute(def, st);
        expect(r.ok).toBe(true);
        expect(rel(st[key], want), `${key} by ${by}`).toBeLessThan(1e-9);
      }
  });
  it('kVA → current: 500 kVA at 400 V = 721.7 A whatever the PF', () => {
    for (const pf of [0.5, 0.9, 1]) expect(val(run({ solveFor: 'il', pBy: 's', s: 500e3, vl: 400, pf }), 'il')).toBeCloseTo(721.69, 2);
  });
});

describe('three-phase — physics sanity', () => {
  it('Y and Δ give the same powers from the same line quantities; Δ branch Z = 3 × Y arm Z', () => {
    const y = run({ conn: 'wye' });
    const d = run({ conn: 'delta' });
    for (const k of ['p', 'q', 's']) expect(val(d, k)).toBeCloseTo(val(y, k), 9);
    expect(val(d, 'z') / val(y, 'z')).toBeCloseTo(3, 12);
  });
  it('the sum of the three instantaneous phase powers is constant and equals P', () => {
    const b = balanced(400, 10, 0.85, 'lag', 'wye');
    const w = 2 * Math.PI * 50;
    for (const t of [0, 1.3e-3, 7.1e-3, 13e-3]) {
      const sum = [0, (-2 * Math.PI) / 3, (2 * Math.PI) / 3].reduce((a, sh) => a + pInst(b.vph, b.iph, b.theta, w, t, sh), 0);
      expect(sum).toBeCloseTo(b.p, 8);
    }
  });
  it('balanced currents give zero neutral current', () => {
    const r = run({ unbal: true, ia: 50, ib: 50, ic: 50, aDeg: -30, bDeg: -150, cDeg: 90 });
    expect(val(r, 'in')).toBeLessThan(1e-12);
    expect(val(r, 'i2')).toBeLessThan(1e-12);
  });
  it('PF = 1: Q = 0, X = 0; PF = 0: P = 0', () => {
    expect(Math.abs(val(run({ pf: 1 }), 'q'))).toBeLessThan(1e-9);
    expect(Math.abs(val(run({ pf: 0 }), 'p'))).toBeLessThan(1e-9);
  });
});

describe('three-phase — limits and warnings', () => {
  it('P above √3·V·I is NO SOLUTION for the PF', () => {
    const r = run({ solveFor: 'pf', p: 10e3 });
    expect(r.status?.text).toBe('NO SOLUTION');
  });
  it('a current outside 1 µA – 1 MA is NO SOLUTION, never written back', () => {
    const r = run({ solveFor: 'il', pBy: 's', s: 1e13, vl: 1 });
    expect(r.status?.text).toBe('NO SOLUTION');
  });
  it('neutral above the largest phase current warns', () => {
    const r = run({ unbal: true, ia: 10, ib: 10, ic: 10, aDeg: 0, bDeg: 0, cDeg: 0 });
    expect(val(r, 'in')).toBeCloseTo(30, 9);
    expect(r.warnings.some((w) => w.startsWith('Neutral current'))).toBe(true);
  });
  it('review: unbal on → Δ → Y restores the neutral section (A → B → A)', () => {
    const st: any = { ...def.defaults(), unbal: true };
    expect(val(runCompute(def, st), 'in')).toBeGreaterThan(0);
    st.conn = 'delta';
    expect(runCompute(def, st).results.some((x) => x.key === 'in')).toBe(false);
    st.conn = 'wye';
    expect(val(runCompute(def, st), 'in')).toBeGreaterThan(0);
  });
});

describe('three-phase — examples and fuzz', () => {
  it('first example equals the defaults; all compute', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const st: any = { ...def.defaults(), ...structuredClone(ex.state) };
      const r = runCompute(def, st);
      expect(r.ok, ex.id).toBe(true);
      expect(r.status?.text ?? '', ex.id).not.toMatch(/NO SOLUTION|OUT OF RANGE/);
    }
  });
  it('400 random states through runCompute: finite, no NaN text, stable', () => {
    let seed = 99;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const lu = (a: number, b: number) => Math.exp(Math.log(a) + rnd() * (Math.log(b) - Math.log(a)));
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    let refused = 0;
    for (let n = 0; n < 400; n++) {
      const st: any = {
        ...def.defaults(),
        solveFor: pick(['p', 'il', 'vl', 'pf']),
        conn: pick(['wye', 'delta']),
        vl: lu(1, 2e6),
        f: lu(1, 1e4),
        il: lu(1e-6, 1e6),
        pf: pick([0, 1, rnd()]),
        side: pick(['lag', 'lead']),
        pBy: pick(['p', 's']),
        p: pick([0, lu(1e-9, 1e13)]),
        s: lu(1e-9, 1e13),
        unbal: rnd() < 0.5,
        ia: rnd() * 1e3,
        ib: rnd() * 1e3,
        ic: rnd() * 1e3,
        aDeg: -360 + 720 * rnd(),
        bDeg: -360 + 720 * rnd(),
        cDeg: -360 + 720 * rnd(),
      };
      const r = runCompute(def, st);
      const text = JSON.stringify([r.results.map((x) => x.display + (x.note ?? '')), r.warnings, r.notes, r.summary ?? '']);
      expect(text).not.toMatch(/NaN|undefined|Infinity|\[object/);
      if (!r.ok) {
        // typed-input errors only: P = 0 or PF = 0 as a target
        expect(r.error).toMatch(/must be > 0|PF = 0/);
        refused++;
        continue;
      }
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of [...s.x, ...s.y]) expect(Number.isFinite(y)).toBe(true);
      if (r.status?.text) continue;
      const again = runCompute(def, { ...st });
      for (const k of ['p', 's', 'q']) expect(Math.abs(val(again, k) - val(r, k))).toBeLessThanOrEqual(1e-9 * Math.abs(val(r, k)) + 1e-12);
    }
    expect(refused).toBeLessThan(100);
  });
});
