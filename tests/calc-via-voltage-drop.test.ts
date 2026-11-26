import { describe, expect, it } from 'vitest';
import { def, type DropState } from '@/calculators/via-voltage-drop/def';
import { condArea, padR, runawayCurrent, viaDrop } from '@/calculators/via-voltage-drop/model';
import { input } from '@/calculators/via-voltage-drop/def';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<DropState>) => def.compute({ ...def.defaults(), ...p });

describe('via voltage drop — published values', () => {
  it('IEC 60028 annealed copper: 1 m of 1 mm² at 20 °C is 17.24 mΩ; +0.393 %/K', () => {
    // a "via" 1 m long with 1 mm² of solid copper (copper-filled, d = 2/√π mm), no pads, 20 °C
    const d = 2e-3 / Math.sqrt(Math.PI);
    const r = viaDrop({ i: 1, n: 1, d, t: 0, h: 1, fill: 'cu', pads: false, pad: 0, tPad: 0, tOp: 20, selfHeat: false, kCu: 385 });
    expect(r.r * 1e3).toBeCloseTo(17.24, 10);
    const hot = viaDrop({ i: 1, n: 1, d, t: 0, h: 1, fill: 'cu', pads: false, pad: 0, tPad: 0, tOp: 70, selfHeat: false, kCu: 385 });
    expect(hot.r / r.r).toBeCloseTo(1 + 0.00393 * 50, 12);
  });
  it('Incropera eq. 3.42: rod with uniform generation, ends at Ts → peak rise q‴L²/(2k) at mid-length (L = h/2)', () => {
    const r = viaDrop({ i: 3, n: 1, d: 0.3e-3, t: 25e-6, h: 1.6e-3, fill: 'none', pads: false, pad: 0.6e-3, tPad: 35e-6, tOp: 25, selfHeat: false, kCu: 385 });
    const q = r.pVia / (r.area * 1.6e-3);
    expect(r.dTmax / ((q * 0.8e-3 ** 2) / (2 * 385))).toBeCloseTo(1, 12);
  });
  it('Griffiths §7.1 radial resistance ln(b/a)/(2πσL): pad 0.6 mm on a 0.3 mm drill, 35 µm, 20 °C → 54.34 µΩ', () => {
    expect(padR(0.6e-3, 0.3e-3, 35e-6, 1.724e-8) * 1e6).toBeCloseTo((1.724e-8 * Math.log(2)) / (2 * Math.PI * 35e-6) * 1e6, 12);
    expect(padR(0.6e-3, 0.3e-3, 35e-6, 1.724e-8) * 1e6).toBeCloseTo(54.34, 2);
  });
});

describe('via voltage drop — independent Python model (vd/xcheck.py: fixed-point self-heating, own root finder)', () => {
  it('default: 2 A through four 0.3 mm vias with pads, self-heated', () => {
    const r = run({});
    expect(res(r, 'v') / 0.0007065324120544237).toBeCloseTo(1, 12);
    expect(res(r, 'rb') / 0.0013022504930701895).toBeCloseTo(1, 12);
    expect(res(r, 'rPad') / 5.5407165519328956e-5).toBeCloseTo(1, 12);
    expect(res(r, 'ipcDT') / 0.6318868147692501).toBeCloseTo(1, 12);
    expect(res(r, 'theta') / 192.41400439917444).toBeCloseTo(1, 12);
  });
  it('copper-filled 0.25 mm, 3 vias, 7 A, 0.8 mm long, 60 °C board', () => {
    const r = run({ i: 7, n: 3, d: 0.25e-3, fill: 'cu', pad: 0.5e-3, tPad: 50e-6, tOp: 60, h: 0.8e-3 });
    expect(res(r, 'v') / 0.0009640810687446183).toBeCloseTo(1, 12);
    expect(res(r, 'dTmax') / 0.00936699373863332).toBeCloseTo(1, 11);
    expect(res(r, 'ipcDT') / 5.415224937230832).toBeCloseTo(1, 12);
  });
  it('solved drill and current match the Python bisection', () => {
    expect(res(run({ solveFor: 'd', v: 2e-3, i: 3, n: 2, pad: 1.2e-3 }), 'd') / 0.00034130498189727254).toBeCloseTo(1, 11);
    expect(res(run({ solveFor: 'i', v: 0.5e-3, n: 1, d: 0.2e-3, fill: 'cu', pad: 0.45e-3 }), 'i') / 0.4878373551963916).toBeCloseTo(1, 11);
  });
  it('near runaway (review R3): V = 10 V, one 0.1 mm via, 10 µm plating → I = 13.163 A, exact rod (runaway at u = π/2), hot-barrel warning', () => {
    const r = run({ solveFor: 'i', v: 10, n: 1, d: 0.1e-3, t: 10e-6, pad: 0.3e-3 });
    expect(r.ok, r.error).toBe(true);
    expect(res(r, 'i') / 13.16327410174495).toBeCloseTo(1, 10);
    expect(res(r, 'dTmax') / 30692.608142709807).toBeCloseTo(1, 8);
    expect(r.warnings.some((w) => /own self-heating takes its middle/.test(w))).toBe(true);
    expect(res(r, 'i')).toBeLessThan(runawayCurrent(input({ ...def.defaults(), n: 1, d: 0.1e-3, t: 10e-6 })));
  });
});

describe('via voltage drop — solve round trips', () => {
  const pts: Partial<DropState>[] = [{}, { d: 0.2e-3, t: 18e-6, h: 0.8e-3, i: 5, n: 7, heat: 'fixed' }, { d: 1e-3, t: 35e-6, pad: 1.8e-3, fill: 'resin', tOp: 85, i: 20, n: 3 }, { fill: 'cu', d: 0.15e-3, pad: 0.35e-3, i: 1.5, n: 2, pads: false }];
  it('I, d and t: solve for the analysis drop, recover the value; the drop reproduces the limit', () => {
    for (const p of pts) {
      const v0 = res(run({ ...p, solveFor: 'v' }), 'v');
      for (const k of ['i', 'd', 't'] as const) {
        if (k === 't' && p.fill === 'cu') continue;
        const x0 = (p[k] ?? def.defaults()[k]) as number;
        const r = run({ ...p, solveFor: k, v: v0, [k]: x0 * 1.37 });
        expect(r.ok, r.error).toBe(true);
        expect(res(r, k) / x0).toBeCloseTo(1, 7);
        expect(res(run({ ...p, solveFor: 'v', [k]: res(r, k) }), 'v') / v0).toBeCloseTo(1, 9);
      }
    }
  });
  it('N: the smallest whole count at or below the limit', () => {
    for (const p of pts) {
      const v1 = res(run({ ...p, solveFor: 'v', n: 1 }), 'v');
      const lim = v1 / 4.5;
      const r = run({ ...p, solveFor: 'n', v: lim, n: 1 });
      expect(r.ok, r.error).toBe(true);
      const n = res(r, 'n');
      expect(res(r, 'vAch')).toBeLessThanOrEqual(lim * (1 + 1e-9));
      expect(res(run({ ...p, solveFor: 'v', n: n - 1 }), 'v')).toBeGreaterThan(lim);
    }
  });
  it('a loose limit returns the cheapest end of the range with a note (review R3), not an error', () => {
    const d = run({ solveFor: 'd', v: 0.1 });
    expect(d.ok).toBe(true);
    expect(res(d, 'd')).toBeCloseTo(50e-6, 12);
    expect(d.notes.some((n) => /every drill in range meets the limit/.test(n))).toBe(true);
    const t = run({ solveFor: 't', v: 0.1 });
    expect(res(t, 't')).toBeCloseTo(1e-6, 12);
    expect(run({ solveFor: 'i', v: 100, n: 1000, d: 3e-3, t: 100e-6, pad: 5e-3 }).ok).toBe(true);
  });
  it('impossible limits say what limits them; copper fill has no plating unknown', () => {
    const r = run({ solveFor: 'n', v: 1e-9, i: 100 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Even 1000 vias/);
    expect(run({ solveFor: 'd', v: 1e-6, i: 10, n: 1 }).error).toMatch(/does not fit|No drill/);
    expect(run({ solveFor: 't', fill: 'cu' }).error).toMatch(/copper-filled/);
  });
});

describe('via voltage drop — physics', () => {
  it('drop ∝ h, ∝ 1/N without self-heating; falls with drill and plating; copper fill < plated', () => {
    const a = run({ heat: 'fixed', pads: false });
    expect(res(run({ heat: 'fixed', pads: false, h: 3.2e-3 }), 'v') / res(a, 'v')).toBeCloseTo(2, 12);
    expect(res(run({ heat: 'fixed', pads: false, n: 8 }), 'v') / res(a, 'v')).toBeCloseTo(0.5, 12);
    expect(res(run({ d: 0.4e-3 }), 'v')).toBeLessThan(res(run({}), 'v'));
    expect(res(run({ t: 35e-6 }), 'v')).toBeLessThan(res(run({}), 'v'));
    expect(res(run({ fill: 'cu' }), 'v')).toBeLessThan(res(run({}), 'v'));
    expect(res(run({ fill: 'resin' }), 'v')).toBe(res(run({}), 'v'));
  });
  it('self-heating: R ≥ fixed-temperature R, → equal as I → 0; runaway current is finite and refused', () => {
    expect(res(run({ i: 1e-3 }), 'rb') / res(run({ i: 1e-3, heat: 'fixed' }), 'rb')).toBeCloseTo(1, 9);
    expect(res(run({ i: 10, n: 1 }), 'rb')).toBeGreaterThan(res(run({ i: 10, n: 1, heat: 'fixed' }), 'rb'));
    const iRun = runawayCurrent(input({ ...def.defaults(), n: 1 }));
    expect(Number.isFinite(iRun)).toBe(true);
    const small = runawayCurrent(input({ ...def.defaults(), n: 1, d: 0.1e-3, t: 5e-6, h: 10e-3 }));
    expect(run({ n: 1, d: 0.1e-3, t: 5e-6, h: 10e-3, pad: 0.3e-3, i: small * 1.01 }).error).toMatch(/no steady state/);
  });
  it('areas: annulus π·t·(d − t), solid π·d²/4; pads add 2·R_pad', () => {
    expect(condArea(0.3e-3, 25e-6, 'none')).toBeCloseTo(Math.PI * ((0.15e-3) ** 2 - (0.125e-3) ** 2), 18);
    expect(condArea(0.3e-3, 25e-6, 'cu')).toBeCloseTo((Math.PI * 0.09e-6) / 4, 18);
    const on = run({ heat: 'fixed', n: 1 });
    const off = run({ heat: 'fixed', n: 1, pads: false });
    expect(res(on, 'r') - res(off, 'r')).toBeCloseTo(2 * res(on, 'rPad'), 15);
  });
});

describe('via voltage drop — validity warnings', () => {
  it('hot via (IPC), thin plating, chart range note', () => {
    const has = (p: Partial<DropState>, re: RegExp) => run(p).warnings.some((w) => re.test(w));
    expect(has({ i: 3, n: 1, tOp: 70 }, /IPC-2221 chart puts the via at/)).toBe(true);
    expect(run({ i: 3, n: 1, tOp: 70 }).status?.tone).toBe('fail');
    expect(has({ t: 15e-6 }, /below the IPC-6012 minimum/)).toBe(true);
    expect(run({}).notes.some((n) => /outside its range/.test(n))).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
  it('regression (harness high): leaving copper fill or turning the pads on never leaves an impossible hidden value', () => {
    const fill = def.fields.flatMap((f) => (f.kind === 'section' ? f.fields : [f])).find((f) => 'key' in f && f.key === 'fill');
    const pads = def.fields.flatMap((f) => (f.kind === 'section' ? f.fields : [f])).find((f) => 'key' in f && f.key === 'pads');
    const s = { ...def.defaults(), fill: 'cu' as const, t: 84.8e-6, d: 163.9e-6, pads: false, pad: 0.1e-3 };
    if (fill?.kind === 'select') fill.apply!('none', s, s);
    s.fill = 'none' as never;
    expect(run(s).ok).toBe(true);
    if (pads?.kind === 'toggle') pads.apply!(true, s, s);
    s.pads = true;
    expect(run(s).ok).toBe(true);
  });
  it('geometry errors are typed-input errors', () => {
    expect(run({ t: 0.16e-3, d: 0.3e-3 }).error).toMatch(/thinner than half the drill/);
    expect(run({ pad: 0.25e-3 }).error).toMatch(/Pad .* must be larger than the drill/);
    expect(run({ pad: 0.25e-3, pads: false }).ok).toBe(true);
  });
});

type Num = { key: string; min: number; max: number; integer?: boolean };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number | boolean)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, integer: f.integer });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
    else if (f.kind === 'toggle') sels.push({ key: f.key, options: [true, false] });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('via voltage drop — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute; analysis of a buildable via never refused', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number | boolean)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 5;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) {
        const v = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
        s[f.key] = f.integer ? Math.round(v) : v;
      }
      const buildable = i % 2 === 1;
      if (buildable) {
        s.t = 10e-6 + 50e-6 * rnd();
        s.d = Math.min(6e-3, (s.t as number) * (3 + 60 * rnd()));
        s.pad = (s.d as number) * (1.2 + 2 * rnd());
        s.i = 1e-3 + 5 * rnd();
      }
      s.solveFor = def.solve!.options[i % 5].key;
      const st = s as unknown as DropState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        if (buildable && st.solveFor === 'v') expect(r.ok, `${JSON.stringify(st)} ${r.error}`).toBe(true);
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
      for (const k of ['r', 'p', 'ipcDT']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 7);
    }
    expect(ok).toBeGreaterThan(150);
  });
});

describe('via voltage drop — examples', () => {
  it('first example equals the defaults; every example computes; the hot one fails its check', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
    }
    expect(run(def.examples!.find((e) => e.id === 'hot')!.state).status?.tone).toBe('fail');
    expect(res(run({}), 'v')).toBeCloseTo(def.defaults().v, 7);
  });
});
