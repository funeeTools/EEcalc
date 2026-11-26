import { describe, expect, it } from 'vitest';
import { type CdState, branch, def } from '@/calculators/current-divider/def';
import { divide, rForCurrent, rForShare } from '@/calculators/current-divider/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<CdState>) => def.compute({ ...def.defaults(), ...p });
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

describe('current divider — Python reference (nodal analysis)', () => {
  it('10 mA into 1k ∥ 2.2k ∥ 4.7k: V = 5.99768 V, I = 5.9977 / 2.7262 / 1.2761 mA', () => {
    const r = run({});
    const d = r.details as any;
    expect(d.vNode).toBeCloseTo(5.997679814385152, 12);
    expect(d.i[0]).toBeCloseTo(0.005997679814385152, 15);
    expect(d.i[1]).toBeCloseTo(0.0027262180974477962, 15);
    expect(d.i[2]).toBeCloseTo(0.0012761020881670536, 15);
  });
  it('5 V through 10 Ω into 47 Ω ∥ 100 Ω: V = 3.80875 V, 81.037 mA, 38.088 mA', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'source-loading')!.state });
    const d = r.details as any;
    expect(d.vNode).toBeCloseTo(3.8087520259319287, 12);
    expect(d.i[0]).toBeCloseTo(0.08103727714748785, 14);
    expect(d.i[1]).toBeCloseTo(0.03808752025931929, 14);
    expect(r.notes.some((n) => n.includes('R_s drops'))).toBe(true);
  });
  it('two branches: I₁ = I·R₂/(R₁+R₂) (Alexander & Sadiku §2.6)', () => {
    const d = divide([1e3, 2e3], 'i', 1);
    expect(d.i[0]).toBeCloseTo(2 / 3, 14);
    expect(d.vNode).toBeCloseTo(2000 / 3, 10);
  });
  it('ammeter shunt: 1 mA / 1 kΩ movement on 1 A needs R_sh = R_m·I_m/(I − I_m) = 1.001 Ω', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'ammeter-shunt')!.state });
    expect(res(r, 'branches.1.r')).toBeCloseTo(1.001001001001001, 12);
    expect((r.details as any).i[0]).toBeCloseTo(1e-3, 14);
  });
});

describe('current divider — solve round trips', () => {
  const rs = [470, 1.5e3, 3.3e3, 12e3];
  for (const drive of ['i', 'v'] as const) {
    for (const k of [0, 2, 3]) {
      it(`${drive} source: share and current targets both recover R${k + 1}`, () => {
        const base = { ...def.defaults(), drive, i: 25e-3, v: 9, rs: drive === 'v' ? 22 : 0, branches: rs.map((r) => branch(r)), solveIdx: k };
        const fwd = run({ ...base, solveFor: 'out' });
        const share = res(fwd, 'share');
        const ik = res(fwd, 'ik');
        for (const solveFor of ['rkShare', 'rkCurrent'] as const) {
          const st: CdState = { ...structuredClone(base), solveFor, share, ik, branches: rs.map((r, j) => branch(j === k ? 1 : r)) };
          const r = runCompute(def, st);
          expect(r.ok, solveFor).toBe(true);
          expect(st.branches[k].r / rs[k], solveFor).toBeCloseTo(1, 10);
          const back = run({ ...st, solveFor: 'out' });
          expect(res(back, solveFor === 'rkShare' ? 'share' : 'ik') / (solveFor === 'rkShare' ? share : ik)).toBeCloseTo(1, 12);
        }
      });
    }
  }
  it('closed forms agree with the forward model', () => {
    const r = rForCurrent([100, 220], 1, 0.01, 'v', 5, 10)!;
    expect(divide([100, r], 'v', 5, 10).i[1]).toBeCloseTo(0.01, 15);
    expect(divide([100, rForShare([100, 1, 330], 1, 0.2)!, 330], 'i', 1).share[1]).toBeCloseTo(0.2, 14);
  });
  it('impossible targets explain the limit', () => {
    expect(run({ solveFor: 'rkCurrent', solveIdx: 1, drive: 'i', i: 0.01, ik: 0.02 }).error).toMatch(/only take part of the source current/);
    expect(run({ solveFor: 'rkCurrent', solveIdx: 1, drive: 'v', v: 5, rs: 10, ik: 1 }).error).toMatch(/at most 500 mA/);
    expect(run({ solveFor: 'rkShare', solveIdx: 0, share: 100 }).error).toMatch(/between 0 and 100/);
    expect(run({ solveFor: 'rkShare', solveIdx: 0, branches: [branch(1e3)] }).error).toMatch(/single branch/);
  });
});

describe('current divider — physics, warnings, examples, fuzz', () => {
  it('shares sum to 1, the smallest R takes the most, Rs does not change shares', () => {
    const a = divide([1e3, 2.2e3, 4.7e3], 'v', 12, 0);
    const b = divide([1e3, 2.2e3, 4.7e3], 'v', 12, 500);
    expect(a.share.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 15);
    expect(a.share[0]).toBeGreaterThan(a.share[1]);
    a.share.forEach((s, j) => expect(b.share[j]).toBeCloseTo(s, 15));
    expect(b.iTotal).toBeLessThan(a.iTotal);
  });
  it('compliance and power warnings fire', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'compliance')!.state });
    expect(r.warnings.some((w) => w.includes('compliance'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('beyond a 2512'))).toBe(true);
    expect(run({ drive: 'v', v: 5, rs: 0 }).notes.some((n) => n.includes('do not interact'))).toBe(true);
  });
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = def.compute({ ...def.defaults(), ...structuredClone(e.state) });
      expect(r.ok, e.id).toBe(true);
      clean(r);
    }
  });
  it('300+ random states through runCompute: no throw, finite, in range, stable', () => {
    let seed = 17;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    let ok = 0;
    for (let n = 0; n < 400; n++) {
      const m = 1 + Math.floor(rnd() * 8);
      const st: any = normalizeState(def, {
        solveFor: pick(['out', 'rkShare', 'rkCurrent']), solveIdx: Math.floor(rnd() * m), drive: pick(['i', 'v']),
        i: (rnd() < 0.3 ? -1 : 1) * 10 ** (-9 + 14 * rnd()), v: (rnd() < 0.3 ? -1 : 1) * 10 ** (-3 + 9 * rnd()), rs: rnd() < 0.3 ? 0 : 10 ** (-3 + 15 * rnd()),
        branches: Array.from({ length: m }, () => ({ r: 10 ** (-4 + 17 * rnd()), rUnit: 'kΩ' })),
        share: 100 * rnd(), ik: (rnd() < 0.3 ? -1 : 1) * 10 ** (-9 + 14 * rnd()), eseries: pick(['E6', 'E12', 'E24', 'E48', 'E96']),
      });
      const snap = JSON.stringify(st);
      const r = runCompute(def, st);
      expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
      if (!r.ok) continue;
      ok++;
      clean(r);
      for (const x of r.results.filter((y) => y.solved)) {
        const f = findField(def.fields, x.key)!.field as any;
        expect(x.value as number, snap).toBeGreaterThanOrEqual(f.min - 1e-9 * Math.abs(f.min));
        expect(x.value as number, snap).toBeLessThanOrEqual(f.max + 1e-9 * Math.abs(f.max));
      }
      const r2 = runCompute(def, structuredClone(st));
      for (const x of r.results.filter((y) => y.primary && typeof y.value === 'number')) expect(Math.abs(res(r2, x.key) - (x.value as number)) <= 1e-9 * Math.abs(x.value as number), `${snap} ${x.key}`).toBe(true);
    }
    expect(ok).toBeGreaterThan(150);
  });
});

describe('current divider — mode-switch regressions', () => {
  it('◎ on another branch starts from that branch’s own share and current (targets do not carry over)', () => {
    const st: CdState = { ...def.defaults(), solveFor: 'rkCurrent', solveIdx: 0, ik: 6e-3, branches: [branch(1e3), branch(2.2e3), branch(4.7e3), branch(4.7e3)] };
    runCompute(def, st);
    const f = ((def.fields[1] as any).fields[0] as any).fields[0];
    f.onSolve(st.branches[3], st);
    const r = runCompute(def, st);
    expect(r.ok).toBe(true);
    expect(st.solveIdx).toBe(3);
    expect(st.branches[3].r / 4.7e3).toBeCloseTo(1, 10);
  });
});
