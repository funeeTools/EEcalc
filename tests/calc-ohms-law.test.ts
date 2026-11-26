import { describe, expect, it } from 'vitest';
import { type OhmState, def } from '@/calculators/ohms-law/def';
import { PAIRS, PARTS, autoPart, criticalResistance, ratedVoltage, solve } from '@/calculators/ohms-law/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<OhmState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;

function clean(r: CalcReport) {
  const bad: string[] = [];
  for (const x of r.results) {
    if (typeof x.value === 'number' && !Number.isFinite(x.value)) bad.push(`value ${x.key}`);
    if (BAD.test(x.display)) bad.push(`display ${x.key}: ${x.display}`);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const c of Object.values(row)) if (BAD.test(c)) bad.push(`${t.id}: ${c}`);
  for (const s of [r.summary ?? '', r.error ?? '', ...r.warnings, ...r.notes]) if (BAD.test(s)) bad.push(s);
  for (const g of r.graphs) {
    for (const s of g.series ?? []) if (![...s.x, ...s.y].every(Number.isFinite)) bad.push(`${g.id}/${s.label}`);
    for (const m of g.markers ?? []) if (!(Number.isFinite(m.x) && Number.isFinite(m.y))) bad.push(`${g.id} marker`);
  }
  expect(bad).toEqual([]);
}

describe('Ohm’s law — Python reference and identities', () => {
  it('12 V, 0.5 W → R = 288 Ω, I = 41.667 mA (Python)', () => {
    const r = run({ given: 'vp', v: 12, p: 0.5 });
    expect(res(r, 'r')).toBeCloseTo(288, 10);
    expect(res(r, 'i')).toBeCloseTo(0.041666666666666664, 14);
  });
  it('R and P keep the sign of V: 330 Ω, 0.25 W with V < 0 → −9.08295 V, −27.524 mA (Python)', () => {
    const r = run({ given: 'rp', r: 330, p: 0.25, v: -1 });
    expect(res(r, 'v')).toBeCloseTo(-9.082951062292475, 12);
    expect(res(r, 'i')).toBeCloseTo(-0.027524094128159014, 14);
  });
  it('60 W lamp on 230 V: R = 230²/60 = 881.667 Ω, I = 260.87 mA', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'mains-lamp')!.state });
    expect(res(r, 'r')).toBeCloseTo(52900 / 60, 9);
    expect(res(r, 'i')).toBeCloseTo(60 / 230, 12);
    expect(r.warnings.some((w) => w.includes('beyond the 10 W'))).toBe(true);
  });
  it('every pair reproduces the same operating point (6 forms of Ohm/Joule agree)', () => {
    const x = { v: 7.3, i: 7.3 / 4.7e3, r: 4.7e3, p: (7.3 * 7.3) / 4.7e3 };
    for (const pair of PAIRS) {
      const y = solve(pair, x);
      for (const q of ['v', 'i', 'r', 'p'] as const) expect(y[q] / x[q], `${pair}/${q}`).toBeCloseTo(1, 13);
    }
  });
});

describe('Ohm’s law — part ratings (IEC 60115-1, Vishay CRCW e3)', () => {
  it('rated voltage √(P·R) capped by the element limit; critical resistance U²/P', () => {
    const p0805 = PARTS.find((p) => p.id === '0805')!;
    expect(ratedVoltage(p0805, 10e3)).toBeCloseTo(Math.sqrt(0.125 * 10e3), 12);
    expect(ratedVoltage(p0805, 1e6)).toBe(150);
    expect(criticalResistance(p0805)).toBeCloseTo(150 ** 2 / 0.125, 6); // 180 kΩ
  });
  it('auto pick: smallest chip at ≤ 50 % load within its voltage, then leaded', () => {
    expect(autoPart(0.025, 5)!.id).toBe('0402'); // 25 mW ≤ 31.5 mW
    expect(autoPart(0.04, 5)!.id).toBe('0603');
    expect(autoPart(0.01, 100)!.id).toBe('0805'); // 75 V limit of 0603 rules it out
    expect(autoPart(2.5, 5)!.id).toBe('w5');
    expect(autoPart(6, 5)).toBeNull();
  });
  it('over-rating, half-rating and over-voltage warnings fire', () => {
    expect(run({ given: 'vr', v: 10, r: 100, part: '0603' }).warnings.some((w) => w.includes('will overheat'))).toBe(true);
    expect(run({ given: 'vr', v: 3.3, r: 330, part: '0402' }).warnings.some((w) => w.includes('≤ 50 %'))).toBe(true);
    expect(run({ given: 'vr', v: 300, r: 10e6, part: '0805' }).warnings.some((w) => w.includes('limiting element voltage'))).toBe(true);
    expect(run({ given: 'vr', v: 3.3, r: 330, part: '0402' }).status!.tone).toBe('warn');
  });
});

describe('Ohm’s law — round trips, physics, errors', () => {
  it('every pair round-trips from the defaults state to 1e-12', () => {
    const base = def.defaults();
    runCompute(def, base);
    for (const pair of PAIRS) {
      const st = { ...structuredClone(base), given: pair };
      const r = runCompute(def, st);
      for (const q of ['v', 'i', 'r', 'p']) expect(res(r, q) / (base as any)[q], `${pair}/${q}`).toBeCloseTo(1, 12);
    }
  });
  it('round trips at random points, every pair → every other pair', () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 40; n++) {
      const st = { ...def.defaults(), given: 'ir' as const, i: (rnd() < 0.3 ? -1 : 1) * 10 ** (-6 + 6 * rnd()), r: 10 ** (-2 + 9 * rnd()) };
      runCompute(def, st);
      const ref = { ...st };
      for (const pair of PAIRS) {
        const r = runCompute(def, { ...structuredClone(ref), given: pair });
        expect(r.ok).toBe(true);
        for (const q of ['v', 'i', 'r', 'p'] as const) expect(res(r, q) / ref[q], `${pair}/${q}`).toBeCloseTo(1, 9);
      }
    }
  });
  it('P = V²/R falls with R at fixed V and rises with R at fixed I; tolerance extremes', () => {
    const v = run({ given: 'vr', v: 5, r: 1e3, tol: 5 });
    expect(res(v, 'pMax')).toBeCloseTo(25 / 950, 12);
    const i = run({ given: 'ir', i: 0.01, r: 1e3, tol: 5 });
    expect(res(i, 'pMax')).toBeCloseTo(1e-4 * 1050, 12);
  });
  it('open, short and active pairs are refused with a reason', () => {
    expect(run({ given: 'vi', v: 5, i: 0 }).error).toMatch(/open circuit/);
    expect(run({ given: 'vi', v: 0, i: 1 }).error).toMatch(/short circuit/);
    expect(run({ given: 'vi', v: 5, i: -1 }).error).toMatch(/opposite signs/);
    expect(run({ given: 'vp', v: 5, p: 0 }).error).toMatch(/open circuit/);
    expect(run({ given: 'ip', i: 2, p: 0 }).error).toMatch(/short circuit/);
    expect(run({ given: 'vi', v: 1e-6, i: 1e5 }).error).toMatch(/outside 0.1 mΩ/);
  });
  it('◎ on a computed value makes it known, keeping the latest known', async () => {
    const f = (def.fields[0] as any).fields.find((x: any) => x.key === 'p');
    const st = def.defaults(); // given vr, keep r
    f.onUnsolve(st, st);
    expect(st.given).toBe('rp');
    const fv = (def.fields[0] as any).fields.find((x: any) => x.key === 'v');
    fv.onUnsolve(st, st);
    expect(st.given).toBe('vp');
    fv.onSolve(st, st); // V back to computed: bring in the first computed (I)
    expect(st.given).toBe('ip');
  });
});

describe('Ohm’s law — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = def.compute({ ...def.defaults(), ...e.state });
      expect(r.ok, e.id).toBe(true);
      expect(r.graphs.length).toBeGreaterThan(0);
      clean(r);
    }
  });
  it('300+ random states through runCompute: no throw, finite, stable', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const parts = ['auto', ...PARTS.map((p) => p.id)];
    let ok = 0;
    for (let n = 0; n < 400; n++) {
      const sgn = () => (rnd() < 0.3 ? -1 : 1);
      const st: any = normalizeState(def, {
        given: pick(PAIRS), v: rnd() < 0.05 ? 0 : sgn() * 10 ** (-6 + 12 * rnd()), i: rnd() < 0.05 ? 0 : sgn() * 10 ** (-12 + 17 * rnd()),
        r: 10 ** (-4 + 17 * rnd()), p: rnd() < 0.05 ? 0 : 10 ** (-15 + 27 * rnd()), part: pick(parts), eseries: pick(['E6', 'E12', 'E24', 'E48', 'E96']), tol: 50 * rnd(),
      });
      const snap = JSON.stringify(st);
      const r = runCompute(def, st);
      expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
      if (!r.ok) continue;
      ok++;
      clean(r);
      const r2 = runCompute(def, structuredClone(st));
      for (const q of ['v', 'i', 'r', 'p']) expect(Math.abs(res(r2, q) / res(r, q) - 1) <= 1e-9 || res(r, q) === 0, `${snap} ${q}`).toBe(true);
    }
    expect(ok).toBeGreaterThan(150);
  });
  it('computes in well under 50 ms', () => {
    const t0 = performance.now();
    for (let n = 0; n < 50; n++) run({});
    expect((performance.now() - t0) / 50).toBeLessThan(10);
  });
});
