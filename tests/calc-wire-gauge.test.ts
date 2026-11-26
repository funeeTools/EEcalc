import { describe, expect, it } from 'vitest';
import { def, type WireState } from '@/calculators/wire-gauge/def';
import { IEC60228, awgDiameter, awgFromDiameter, necAmpacity, resistivity } from '@/calculators/wire-gauge/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<WireState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;
const IN = 0.0254;

describe('wire-gauge: ASTM B258 table and NEC Chapter 9 Table 8', () => {
  it('ASTM B258 nominal diameters (rounded to 0.0001 in): 4/0 = 0.4600, 10 = 0.1019, 12 = 0.0808, 24 = 0.0201, 36 = 0.0050, 40 = 0.0031', () => {
    for (const [n, d] of [[-3, 0.46], [10, 0.1019], [12, 0.0808], [24, 0.0201], [36, 0.005], [40, 0.0031]]) expect(Math.round((awgDiameter(n) / IN) * 1e4) / 1e4, `AWG ${n}`).toBeCloseTo(d, 6);
    expect(awgFromDiameter(awgDiameter(7.3))).toBeCloseTo(7.3, 12);
  });
  it('NEC Ch. 9 Table 8, solid uncoated copper at 75 °C: 14 AWG 3.07, 12 AWG 1.93, 10 AWG 1.21 Ω/kft; 12 AWG = 6530 cmil', () => {
    for (const [n, rk] of [[14, 3.07], [12, 1.93], [10, 1.21]]) {
      const r = run({ given: 'awg', awg: n, temp: 75, material: 'cu' });
      expect(Math.round(res(r, 'rpm') * 304.8 * 100) / 100, `AWG ${n}`).toBeCloseTo(rk, 6);
    }
    expect((awgDiameter(12) / 25.4e-6) ** 2).toBeCloseTo(6530, -1);
  });
  it('IEC 60228: every size at its nominal area is below the standard’s maximum resistance (copper, 20 °C)', () => {
    for (const [a, rMax] of IEC60228) {
      const rNom = (resistivity('cu', 20) / (a * 1e-6)) * 1000;
      expect(rNom, `${a} mm²`).toBeLessThan(rMax);
      expect(rNom / rMax, `${a} mm²`).toBeGreaterThan(0.88);
    }
  });
  it('NEC 310.16 lookups (75/90 °C): 12 AWG Cu 25/30 A, 4/0 Al 180/205 A; outside the carried range → null', () => {
    expect(necAmpacity('cu', 12)).toEqual([25, 30]);
    expect(necAmpacity('al', -3)).toEqual([180, 205]);
    expect(necAmpacity('cu', 16)).toBeNull();
    expect(necAmpacity('cu', 12.5)).toBeNull();
  });
});

describe('wire-gauge: Python cross-check', () => {
  it('default 12 AWG Cu, 10 A, 2 × 3 m at 12 V: ΔV = 2.60540 %', () => {
    expect(res(run({}), 'dropPct')).toBeCloseTo(2.6054038696374913, 12);
  });
  it('4/0 aluminium at 75 °C, 150 A over 2 × 50 m at 240 V: 2.01274 %', () => {
    expect(res(run(def.examples!.find((e) => e.id === 'al-feeder')!.state), 'dropPct')).toBeCloseTo(2.012739006066167, 12);
  });
  it('smallest AWG for 24 V, 5 A, 20 m, 3 % is 10 AWG; IEC size for 230 V, 16 A, 30 m at 70 °C, 3 % is 4 mm²', () => {
    expect(res(runCompute(def, { ...def.defaults(), ...def.examples!.find((e) => e.id === 'awg-size')!.state }), 'awg')).toBe(10);
    expect(res(runCompute(def, { ...def.defaults(), ...def.examples!.find((e) => e.id === 'iec-size')!.state }), 'area')).toBeCloseTo(4e-6, 15);
  });
});

describe('wire-gauge: solve round trips and size forms', () => {
  it('exact diameter for a drop limit, fed back, gives the limit', () => {
    for (const lim of [0.5, 3, 10]) {
      const st: WireState = { ...def.defaults(), solveFor: 'size', given: 'd', dropPct: lim };
      runCompute(def, st);
      const back: WireState = { ...st, solveFor: 'dropPct' };
      runCompute(def, back);
      expect(back.dropPct).toBeCloseTo(lim, 10);
    }
  });
  it('the AWG chosen meets the limit and the next thinner one does not', () => {
    const st: WireState = { ...def.defaults(), solveFor: 'size', given: 'awg', dropPct: 2, len: 15 };
    runCompute(def, st);
    expect(res(run({ given: 'awg', awg: st.awg, len: 15 }), 'dropPct')).toBeLessThanOrEqual(2);
    expect(res(run({ given: 'awg', awg: st.awg + 1, len: 15 }), 'dropPct')).toBeGreaterThan(2);
  });
  it('the three size forms agree: AWG → area and d, and back', () => {
    const st: WireState = { ...def.defaults(), given: 'awg', awg: 18 };
    runCompute(def, st);
    const viaD: WireState = { ...st, given: 'd' };
    runCompute(def, viaD);
    expect(viaD.awg).toBeCloseTo(18, 10);
    const viaA: WireState = { ...st, given: 'mm2' };
    runCompute(def, viaA);
    expect(viaA.d / st.d).toBeCloseTo(1, 12);
  });
});

describe('wire-gauge: mode-switch regressions', () => {
  it('◎ on ΔV with a conductor above 300 mm² switches to the exact-diameter form instead of failing', () => {
    const st: WireState = { ...def.defaults(), given: 'mm2', area: 400e-6 };
    runCompute(def, st);
    const f = (def.fields[1] as any).fields.find((x: any) => x.key === 'dropPct');
    f.onUnsolve(st, st);
    expect(st.given).toBe('d');
    expect(runCompute(def, st).ok).toBe(true);
    expect(st.area / 400e-6).toBeCloseTo(1, 9);
  });
  it('the length graph is never empty for gauges past 56', () => {
    expect(run({ awg: 59 }).graphs.find((g) => g.id === 'drop-length')!.series!.length).toBeGreaterThan(0);
  });
});

describe('wire-gauge: physics sanity', () => {
  it('3 gauges ≈ 2× area; 10 gauges ≈ 10× resistance; drop ∝ I, ℓ; one conductor = half the loop', () => {
    expect((awgDiameter(9) / awgDiameter(12)) ** 2).toBeCloseTo(2.005, 3);
    expect(res(run({ awg: 20 }), 'rpm') / res(run({ awg: 10 }), 'rpm')).toBeCloseTo(10.16, 2);
    expect(res(run({ current: 20 }), 'dropPct') / res(run({}), 'dropPct')).toBeCloseTo(2, 12);
    expect(res(run({ circuit: 'one' }), 'dropPct') / res(run({}), 'dropPct')).toBeCloseTo(0.5, 12);
    expect(res(run({ temp: 75 }), 'rpm') / res(run({ temp: 20 }), 'rpm')).toBeCloseTo(1 + 0.00393 * 55, 12);
  });
});

describe('wire-gauge: validity warnings', () => {
  it('over the NEC 90 °C ampacity → warning; between 75 and 90 °C → warning about terminations', () => {
    expect(run({ awg: 14, current: 30 }).warnings.join(' ')).toMatch(/even with 90 °C/);
    expect(run({ awg: 14, current: 22 }).warnings.join(' ')).toMatch(/75 °C column/);
  });
  it('large drop and impossible drop warn; very hot conductor warns; extrapolated gauge noted', () => {
    expect(run(def.examples!.find((e) => e.id === 'thin')!.state).warnings.join(' ')).toMatch(/ΔV = /);
    expect(run({ awg: 40, current: 5, len: 100 }).warnings.join(' ')).toMatch(/cannot get this current/);
    expect(run({ temp: 200 }).warnings.join(' ')).toMatch(/insulation/);
    expect(run({ awg: -10 }).notes.join(' ')).toMatch(/extrapolated/);
  });
  it('no size meets the limit → error that says so', () => {
    expect(run({ solveFor: 'size', given: 'awg', current: 1000, len: 1000, dropPct: 1 }).error).toMatch(/Even 4\/0/);
    expect(run({ solveFor: 'size', given: 'mm2', current: 1000, len: 1000, dropPct: 1 }).error).toMatch(/Even 300 mm²/);
  });
});

function collect(fields: FieldSpec[], nums: { key: string; min: number; max: number }[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}

describe('wire-gauge: fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: { key: string; min: number; max: number }[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 5;
    const rnd = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      s.given = ['awg', 'mm2', 'd'][i % 3];
      if (i % 2) s.awg = Math.round(s.awg as number);
      s.solveFor = def.solve!.options[(i >> 1) % 2].key;
      const st = s as unknown as WireState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        expect(st.solveFor, r.error).not.toBe('dropPct'); // the analysis is never refused
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of [...sr.x, ...sr.y]) expect(Number.isFinite(y), g.id).toBe(true);
      for (const t of r.tables) for (const d of t.display ?? []) for (const v of Object.values(d)) expect(v).not.toMatch(BAD);
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      expect(res(again, 'dropPct') / res(r, 'dropPct')).toBeCloseTo(1, 9);
    }
    expect(ok).toBeGreaterThan(250);
  });
});

describe('wire-gauge: examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      // mode-switch regression: no NaN / Infinity text in any example (A&S 6.1 once showed "Infinity A" at V₂ = 0)
      expect(JSON.stringify([r.results, r.warnings, r.notes, r.summary]), ex.id).not.toMatch(BAD);
    }
  });
});
