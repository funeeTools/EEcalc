import { describe, expect, it } from 'vitest';
import { type DyState, convertInto, def } from '@/calculators/delta-wye/def';
import { abs, add, deltaToWye, pairDelta, pairWye, wyeToDelta } from '@/calculators/delta-wye/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<DyState>) => def.compute({ ...def.defaults(), ...p });
const ex = (id: string) => ({ ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === id)!.state) }) as DyState;
const BAD = /NaN|undefined|Infinity|\[object/;
const c = (re: number, im = 0) => ({ re, im });

function clean(r: CalcReport) {
  const bad: string[] = [];
  for (const x of r.results) {
    if (typeof x.value === 'number' && !Number.isFinite(x.value)) bad.push(`value ${x.key}`);
    if (BAD.test(x.display)) bad.push(`display ${x.key}: ${x.display}`);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) if (BAD.test(v)) bad.push(`${t.id}: ${v}`);
  for (const s of [r.summary ?? '', r.error ?? '', ...r.warnings, ...r.notes]) if (BAD.test(s)) bad.push(s);
  for (const g of r.graphs) {
    for (const s of g.series ?? []) if (![...s.x, ...s.y].every(Number.isFinite)) bad.push(`${g.id}/${s.label}`);
    for (const m of g.markers ?? []) if (!(Number.isFinite(m.x) && Number.isFinite(m.y))) bad.push(`${g.id} marker`);
  }
  expect(bad).toEqual([]);
}

describe('delta–wye — Python reference (exact rational solve of the terminal-pair equations)', () => {
  it('Δ 1k / 2.2k / 4.7k → Y 594.937 / 278.481 / 1308.861 Ω', () => {
    const r = run({});
    expect(res(r, 'rA')).toBeCloseTo(594.9367088607595, 10);
    expect(res(r, 'rB')).toBeCloseTo(278.4810126582278, 10);
    expect(res(r, 'rC')).toBeCloseTo(1308.860759493671, 9);
  });
  it('Y 10 / 20 / 30 Ω → Δ 36.667 / 110 / 55 Ω', () => {
    const r = def.compute(ex('y-to-delta'));
    expect(res(r, 'rAB')).toBeCloseTo(36.666666666666664, 12);
    expect(res(r, 'rBC')).toBeCloseTo(110, 12);
    expect(res(r, 'rCA')).toBeCloseTo(55, 12);
  });
  it('Δ of j100, 50, j100 Ω at 10 MHz → Z_A = −11.765 + j47.059 Ω (negative real part warned)', () => {
    const r = def.compute(ex('rf-negative'));
    const out = (r.details as any).out;
    expect(out.A.re).toBeCloseTo(-11.764705882352942, 9);
    expect(out.A.im).toBeCloseTo(47.05882352941177, 9);
    expect(out.B.re).toBeCloseTo(23.529411764705884, 9);
    expect(out.C.im).toBeCloseTo(5.882352941176471, 9);
    expect(r.warnings.some((w) => w.includes('negative real part'))).toBe(true);
  });
  it('balanced three-phase load 12 + j9 Ω (Δ) → 4 + j3 Ω (Y) at 60 Hz: Z_Y = Z_Δ/3', () => {
    const r = def.compute(ex('three-phase'));
    const out = (r.details as any).out;
    for (const b of ['A', 'B', 'C']) {
      expect(out[b].re).toBeCloseTo(4, 12);
      expect(out[b].im).toBeCloseTo(3, 12);
    }
    expect(r.status?.text).toBe('BALANCED');
  });
});

describe('delta–wye — equivalence, round trips, limits', () => {
  it('terminal-pair impedances agree for random complex networks (definition of equivalence)', () => {
    let seed = 21;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 200; n++) {
      const z = () => c(10 ** (-1 + 6 * rnd()), (rnd() - 0.5) * 10 ** (6 * rnd()));
      const d = { ab: z(), bc: z(), ca: z() };
      const { y } = deltaToWye(d);
      const pd = pairDelta(d);
      const py = pairWye(y);
      for (const k of ['ab', 'bc', 'ca'] as const) expect(abs(add(pd[k], c(-py[k].re, -py[k].im))) / abs(pd[k])).toBeLessThan(1e-12);
      const back = wyeToDelta(y).d;
      for (const k of ['ab', 'bc', 'ca'] as const) expect(abs(add(back[k], c(-d[k].re, -d[k].im))) / abs(d[k])).toBeLessThan(1e-11);
    }
  });
  it('direction switch converts first: Δ→Y→Δ returns the same network (resistors and impedances)', () => {
    for (const id of ['default', 'three-phase']) {
      const st = ex(id);
      runCompute(def, st);
      const before = (runCompute(def, structuredClone(st)).details as any).inp;
      convertInto(st);
      st.given = 'wye';
      runCompute(def, st);
      convertInto(st);
      st.given = 'delta';
      const after = (runCompute(def, st).details as any).inp;
      for (const b of ['AB', 'BC', 'CA']) {
        expect(after[b].re / before[b].re, `${id} ${b}`).toBeCloseTo(1, 10);
        if (before[b].im) expect(after[b].im / before[b].im, `${id} ${b}`).toBeCloseTo(1, 10);
      }
    }
  });
  it('resistive solve round trip through runCompute (computed side written back, then entered)', () => {
    const st = def.defaults();
    runCompute(def, st);
    const y = { rA: st.rA, rB: st.rB, rC: st.rC };
    const st2: DyState = { ...structuredClone(st), given: 'wye', rAB: 1, rBC: 1, rCA: 1 };
    runCompute(def, st2);
    expect(st2.rAB / 1e3).toBeCloseTo(1, 12);
    expect(st2.rBC / 2.2e3).toBeCloseTo(1, 12);
    expect(st2.rCA / 4.7e3).toBeCloseTo(1, 12);
    expect(st2.rA).toBe(y.rA);
  });
  it('a zero delta branch zeroes two arms; one zero arm opens a delta branch; two zero arms or a resonant loop are refused', () => {
    const z = run({ rAB: 0 });
    expect(res(z, 'rA')).toBe(0);
    expect(res(z, 'rB')).toBe(0);
    // one zero arm: node A is the star point → Δ: Z_AB = Z_B, Z_CA = Z_C, Z_BC open
    const open = run({ given: 'wye', rA: 0, rB: 20, rC: 30 });
    expect(open.ok).toBe(true);
    expect(res(open, 'rAB')).toBe(20);
    expect(res(open, 'rCA')).toBe(30);
    expect(res(open, 'rBC')).toBeNull();
    expect(open.results.find((x) => x.key === 'rBC')!.display).toBe('open (∞)');
    expect(open.results.find((x) => x.key === 'pairBC')!.note).toBe('Δ and Y agree');
    clean(open);
    expect(run({ given: 'wye', rA: 0, rB: 0 }).error).toMatch(/not unique/);
    const w = 2 * Math.PI * 1e6;
    const lr = 1e-6;
    const cr = 1 / (w * w * lr * 2); // jωL·2 cancels −j/(ωC)… loop sum: j(ωL + ωL − 1/(ωC)) = 0
    const r = run({ kind: 'z', f: 1e6, rAB: 0, rBC: 0, rCA: 0, lAB: lr, lBC: lr, lCA: 0, cAB: null, cBC: null, cCA: cr });
    expect(r.error).toMatch(/series-resonant/);
  });
  it('the balanced check is shown, and only for balanced inputs', () => {
    expect(res(def.compute(ex('balanced')), 'rA')).toBeCloseTo(10, 12);
    expect(def.compute(ex('balanced')).results.find((x) => x.key === 'balanced')!.value).toBe('yes');
    expect(run({}).results.find((x) => x.key === 'balanced')!.value).toBe('no');
  });
});

describe('delta–wye — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = def.compute(ex(e.id));
      expect(r.ok, e.id).toBe(true);
      expect(r.graphs.length).toBeGreaterThan(0);
      clean(r);
    }
  });
  it('320 random states through runCompute: no throw, finite, in range, stable', () => {
    let seed = 9;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    let ok = 0;
    for (let n = 0; n < 320; n++) {
      const raw: any = { given: pick(['delta', 'wye']), kind: pick(['r', 'z']), f: 10 ** (-3 + 15 * rnd()) };
      for (const b of ['AB', 'BC', 'CA', 'A', 'B', 'C']) {
        raw[`r${b}`] = rnd() < 0.05 ? 0 : 10 ** (-4 + 17 * rnd());
        raw[`l${b}`] = rnd() < 0.4 ? 0 : 10 ** (-12 + 15 * rnd());
        raw[`c${b}`] = rnd() < 0.4 ? null : 10 ** (-18 + 19 * rnd());
      }
      const st: any = normalizeState(def, raw);
      const snap = JSON.stringify(st);
      const r = runCompute(def, st);
      expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
      if (!r.ok) continue;
      ok++;
      clean(r);
      const r2 = runCompute(def, structuredClone(st));
      for (const x of r.results.filter((y) => typeof y.value === 'number')) expect(Math.abs(res(r2, x.key) - (x.value as number)) <= 1e-9 * Math.abs(x.value as number), `${snap} ${x.key}`).toBe(true);
    }
    expect(ok).toBeGreaterThan(200);
  });
});

describe('delta–wye — review fixes', () => {
  const given = (def.fields[0] as any).fields.find((f: any) => f.key === 'given');
  const flip = (st: DyState, v: 'delta' | 'wye') => {
    runCompute(def, st); // sync records prevGiven, as the page does
    st.given = v;
    given.apply(v, st, st);
    return runCompute(def, st);
  };
  it('a negative-real-part equivalent refuses the switch, says why, and leaves the network unchanged', () => {
    const st = ex('rf-negative');
    const before = (runCompute(def, structuredClone(st)).details as any).out;
    const r = flip(st, 'wye');
    expect(st.given).toBe('delta');
    expect(r.notes.some((n) => n.startsWith('Stayed on Δ → Y') && n.includes('Z_A'))).toBe(true);
    const after = (r.details as any).out;
    for (const b of ['A', 'B', 'C']) expect(after[b]).toEqual(before[b]);
    expect(runCompute(def, st).notes.some((n) => n.startsWith('Stayed'))).toBe(false); // one-shot
  });
  it('a realisable complex network round-trips Δ → Y → Δ through the direction switch', () => {
    const st = ex('three-phase');
    flip(st, 'wye');
    expect(st.given).toBe('wye');
    const r = flip(st, 'delta');
    for (const b of ['AB', 'BC', 'CA']) {
      expect((r.details as any).inp[b].re).toBeCloseTo(12, 10);
      expect((r.details as any).inp[b].im).toBeCloseTo(9, 10);
    }
  });
  it('R_AB = 0: choosing Y → Δ stays on Δ → Y with a note (two zero arms)', () => {
    const st: DyState = { ...def.defaults(), rAB: 0 };
    const r = flip(st, 'wye');
    expect(st.given).toBe('delta');
    expect(r.notes.some((n) => n.includes('not unique'))).toBe(true);
  });
  it('one zero arm → Δ (open branch) → Y gives the zero arm back exactly', () => {
    const st: DyState = { ...def.defaults(), given: 'wye', rA: 0, rB: 20, rC: 30 };
    flip(st, 'delta');
    expect(st.given).toBe('delta');
    flip(st, 'wye');
    expect(st.rA).toBe(0);
    expect(st.rB).toBeCloseTo(20, 9);
  });
});
