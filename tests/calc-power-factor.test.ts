import { describe, expect, it } from 'vitest';
import { def, type PfState } from '@/calculators/power-factor/def';
import { runCompute } from '@/core/calc/page';

const val = (r: { results: { key: string; value: unknown }[] }, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<PfState>) => def.compute({ ...def.defaults(), ...p });
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('power factor — published examples', () => {
  it('Alexander & Sadiku (power-factor correction example): 4 kW at 0.8 lagging, 120 V 60 Hz → 0.95 needs 310.5 µF', () => {
    const r = run({ solveFor: 'c', phase: 'single', v: 120, f: 60, loadBy: 'p', p: 4000, pfd: 0.8, pfTarget: 0.95 });
    expect(rel(val(r, 'c'), 310.5e-6)).toBeLessThan(5e-4); // text rounds Q_C to 1685.6 var
    expect(val(r, 'q1')).toBeCloseTo(3000, 9);
  });
  it('feature-list case (S = 1 kVA, 0.8 → 0.95, 230 V 50 Hz) gives 20.28 µF, which the defaults reproduce', () => {
    const r = run({});
    expect(val(r, 'c')).toBeCloseTo(20.28e-6, 8);
    expect(val(r, 'p')).toBeCloseTo(800, 9);
  });
});

describe('power factor — independent Python reference (scratch pb4/ref.py)', () => {
  it('single-phase, S given', () => {
    const r = run({});
    expect(rel(val(r, 'c'), 2.0281136412542606e-5)).toBeLessThan(1e-12);
    expect(rel(val(r, 'iAfter'), 3.6613272311212817)).toBeLessThan(1e-12);
    expect(rel(val(r, 'ic'), 1.4654465906822152)).toBeLessThan(1e-12);
  });
  it('three-phase Y bank, P given', () => {
    const r = run({ phase: 'three', v: 400, loadBy: 'p', p: 75e3, pfd: 0.82, conn: 'wye' });
    expect(rel(val(r, 'c'), 5.510543774053835e-4)).toBeLessThan(1e-12);
    expect(rel(val(r, 'iAfter'), 113.95071102426826)).toBeLessThan(1e-12);
    expect(rel(val(r, 'ic'), 39.980083175854695)).toBeLessThan(1e-12);
  });
  it('leading load given by current with 80 % THD, analysis with 10 µF', () => {
    const r = run({ solveFor: 'pfTarget', loadBy: 'i', i: 5, thdPct: 80, pfd: 0.9, loadSide: 'lead', c: 10e-6 });
    expect(rel(val(r, 'pfTarget'), 0.823098425853352)).toBeLessThan(1e-12);
    expect(rel(val(r, 'iAfter'), 5.289756272292162)).toBeLessThan(1e-12);
    expect(rel(val(r, 'p'), 808.1992177735364)).toBeLessThan(1e-12);
    expect(rel(val(r, 'pfBefore'), 0.7027819284987272)).toBeLessThan(1e-12);
  });
  it('three-phase Δ bank, leading target 0.98', () => {
    const r = run({ phase: 'three', v: 480, f: 60, loadBy: 'p', p: 100e3, pfd: 0.75, pfTarget: 0.98, targetSide: 'lead', conn: 'delta' });
    expect(rel(val(r, 'c'), 4.163755208979206e-4)).toBeLessThan(1e-12);
    expect(rel(val(r, 'qc'), 108497.57643222011)).toBeLessThan(1e-12);
  });
});

describe('power factor — solve round trips', () => {
  const cases: Partial<PfState>[] = [
    {},
    { phase: 'three', v: 400, loadBy: 'p', p: 75e3, pfd: 0.82, conn: 'delta' },
    { phase: 'three', v: 11e3, loadBy: 'i', i: 40, pfd: 0.7, conn: 'wye', pfTarget: 0.99 },
    { thdPct: 60, pfTarget: 0.9, targetSide: 'lead' },
    { loadBy: 'p', p: 1e-3, v: 5, f: 400, pfd: 0.3, pfTarget: 1 },
  ];
  it.each(cases.map((c, k) => [k, c] as const))('case %i: C → PF → C', (_k, c) => {
    const st: any = { ...def.defaults(), ...c, solveFor: 'c' };
    runCompute(def, st);
    const c1 = st.c;
    const target = st.pfTarget;
    st.solveFor = 'pfTarget';
    runCompute(def, st);
    expect(st.pfTarget).toBeCloseTo(target, 9);
    expect(st.targetSide).toBe(c.targetSide === 'lead' && target < 1 ? 'lead' : 'lag');
    st.solveFor = 'c';
    runCompute(def, st);
    expect(rel(st.c, c1)).toBeLessThan(1e-6);
  });
  it('the three load forms P / S / I describe the same load (switching loadBy changes nothing)', () => {
    const st: any = { ...def.defaults(), thdPct: 40 };
    const r0 = runCompute(def, st);
    for (const by of ['p', 'i', 's']) {
      st.loadBy = by;
      const r = runCompute(def, st);
      for (const k of ['c', 'iAfter', 'p', 's', 'i']) expect(rel(val(r, k), val(r0, k))).toBeLessThan(1e-12);
    }
  });
});

describe('power factor — physics sanity', () => {
  it('unity target cancels Q₁ exactly and minimises the line current', () => {
    const r = run({ pfTarget: 1 });
    expect(val(r, 'c')).toBeCloseTo(val(r, 'cUnity'), 15);
    expect(val(r, 'iAfter')).toBeCloseTo(800 / 230, 12);
    const i = [0.5, 1, 1.5].map((f) => val(run({ solveFor: 'pfTarget', c: val(r, 'c') * f }), 'iAfter'));
    expect(i[1]).toBeLessThan(i[0]);
    expect(i[1]).toBeLessThan(i[2]);
  });
  it('a Δ bank needs one third of the Y-bank capacitance at the same voltage', () => {
    const d = val(run({ phase: 'three', v: 400, conn: 'delta' }), 'c');
    const y = val(run({ phase: 'three', v: 400, conn: 'wye' }), 'c');
    expect(y / d).toBeCloseTo(3, 12);
  });
  it('C scales as 1/(f·V²); true PF = cos θ₁/√(1 + THD²)', () => {
    const c0 = val(run({}), 'c');
    expect(val(run({ f: 100, v: 460 }), 'c')).toBeCloseTo(c0 / 8, 15);
    const r = run({ thdPct: 75, loadBy: 'p', p: 800 });
    expect(val(r, 'pfBefore')).toBeCloseTo(0.8 / 1.25, 12);
  });
  it('THD after correction rises (harmonics unchanged, fundamental smaller)', () => {
    const r = run({ thdPct: 30 });
    expect(val(r, 'thdAfter')).toBeGreaterThan(30);
  });
});

describe('power factor — warnings and edge cases', () => {
  it('load already better than target: C = 0 with a note', () => {
    const r = run({ pfd: 0.97, pfTarget: 0.95 });
    expect(val(r, 'c')).toBe(0);
    expect(r.notes.some((n) => n.includes('already meets'))).toBe(true);
  });
  it('leading load: C = 0 and a reactor warning', () => {
    const r = run({ loadSide: 'lead' });
    expect(val(r, 'c')).toBe(0);
    expect(r.warnings.some((w) => w.includes('shunt reactor'))).toBe(true);
  });
  it('review: a requested leading target is not called overcorrection (unity load → 0.9 lead)', () => {
    const r = run({ pfd: 1, pfTarget: 0.9, targetSide: 'lead' });
    expect(val(r, 'c')).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.startsWith('Overcorrected'))).toBe(false);
  });
  it('overcorrection warns', () => {
    expect(run({ solveFor: 'pfTarget', c: 40e-6 }).warnings.some((w) => w.startsWith('Overcorrected'))).toBe(true);
  });
  it('high THD warns that capacitors cannot fix the distortion', () => {
    expect(run({ thdPct: 120 }).warnings.some((w) => w.includes('active PFC'))).toBe(true);
    expect(run({ thdPct: 20 }).notes.some((w) => w.includes('1/√(1 + THD²)'))).toBe(true);
  });
  it('resonance near the 5th harmonic warns; far from it does not', () => {
    const ex = def.examples!.find((e) => e.id === 'resonance')!;
    const r = run(ex.state);
    expect(val(r, 'hr')).toBeCloseTo(Math.sqrt(5e6 / val(r, 'qc')), 12);
    expect(r.warnings.some((w) => w.startsWith('Parallel resonance'))).toBe(true);
    expect(run({ ...ex.state, ssc: 20e6 }).warnings.some((w) => w.startsWith('Parallel resonance'))).toBe(false);
  });
  it('a capacitance above 1 F is NO SOLUTION, not an out-of-range write', () => {
    const r = run({ v: 1, f: 1, loadBy: 'p', p: 1e9, pfd: 0.1 });
    expect(r.status?.text).toBe('NO SOLUTION');
  });
});

describe('power factor — examples', () => {
  it('first example equals the defaults; all compute with no error', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const st: any = { ...def.defaults(), ...structuredClone(ex.state) };
      const r = runCompute(def, st);
      expect(r.ok, ex.id).toBe(true);
      expect(r.status?.text ?? '', ex.id).not.toMatch(/NO SOLUTION|OUT OF RANGE/);
    }
  });
});

describe('power factor — fuzz through runCompute', () => {
  it('400 random states: no throw, finite values, no NaN text, stable recompute', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const lu = (a: number, b: number) => Math.exp(Math.log(a) + rnd() * (Math.log(b) - Math.log(a)));
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    for (let n = 0; n < 400; n++) {
      const st: any = {
        ...def.defaults(),
        solveFor: pick(['c', 'pfTarget']),
        phase: pick(['single', 'three']),
        v: lu(1, 1e6),
        f: lu(1, 1e4),
        loadBy: pick(['p', 's', 'i']),
        p: lu(1e-12, 1e15),
        s: lu(1e-12, 1e15),
        i: lu(1e-12, 1e15),
        pfd: 0.01 + rnd() * 0.99,
        loadSide: pick(['lag', 'lead']),
        thdPct: pick([0, rnd() * 500]),
        pfTarget: pick([1, rnd()]),
        targetSide: pick(['lag', 'lead']),
        c: pick([0, rnd(), lu(1e-12, 1)]),
        conn: pick(['delta', 'wye']),
        ssc: pick([0, lu(1, 1e12)]),
      };
      const r = runCompute(def, st);
      const text = JSON.stringify([r.results.map((x) => x.display + (x.note ?? '')), r.warnings, r.notes, r.summary ?? '']);
      expect(text).not.toMatch(/NaN|undefined|Infinity|\[object/);
      expect(r.ok, `${r.error} ${JSON.stringify(st)}`).toBe(true); // valid inputs are never refused
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of [...s.x, ...s.y]) expect(Number.isFinite(y)).toBe(true);
      if (r.status?.text) continue;
      const again = runCompute(def, { ...st });
      for (const k of ['c', 'pfTarget', 'iAfter']) {
        const a = val(r, k);
        const b = val(again, k);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(a), 1e-300));
      }
    }
  });
});
