import { describe, expect, it } from 'vitest';
import { def, type RccState } from '@/calculators/resistor-color-code/def';
import { E192, decodeSmd, encodeValue, nearestIn, seriesOf, smd3, smd4, smdEia96 } from '@/calculators/resistor-color-code/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as any;
const run = (p: Partial<RccState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;
const colors = (r: CalcReport) => String(res(r, 'colors')).toLowerCase().split(' · ');

describe('resistor-color-code: IEC 60062:2016 examples', () => {
  it('yellow-violet-red-gold = 4.7 kΩ ±5 % (defaults)', () => {
    const r = run({});
    expect(res(r, 'r')).toBe(4700);
    expect(res(r, 'tolPct')).toBe(5);
    expect(colors(r)).toEqual(['yellow', 'violet', 'red', 'gold']);
  });
  it('5-band brown-black-black-red-brown = 10.0 kΩ ±1 %; 6-band yellow-white-white-gold-violet-yellow = 49.9 Ω ±0.1 % 25 ppm/K', () => {
    expect(res(run(def.examples!.find((e) => e.id === 'five')!.state), 'r')).toBe(10000);
    const six = run(def.examples!.find((e) => e.id === 'six')!.state);
    expect(res(six, 'r')).toBeCloseTo(49.9, 12);
    expect(res(six, 'tcrPpm')).toBe(25);
  });
  it('pink multiplier ×0.001 (added in 2016): brown-black-black-pink = 0.100 Ω', () => {
    expect(res(run({ bands: 5, d1: 1, d2: 0, d3: 0, mult: -3, tol: 1 }), 'r')).toBeCloseTo(0.1, 15);
  });
  it('3 bands → ±20 %; tolerance letters F, J, K', () => {
    expect(res(run({ bands: 3 }), 'range')).toBeCloseTo(4700 * 0.8, 9);
    expect(run({ tol: 1 }).results.find((x) => x.key === 'tolPct')!.display).toMatch(/\(F\)/);
    expect(run({ tol: 10 }).results.find((x) => x.key === 'tolPct')!.display).toMatch(/\(K\)/);
  });
});

describe('resistor-color-code: SMD codes', () => {
  it('3/4-digit and R codes: 472 = 4.7 kΩ, 4702 = 47 kΩ, 4R7, R47, 10R0, 4K7, 000', () => {
    expect(decodeSmd('472').value).toBe(4700);
    expect(decodeSmd('4702').value).toBe(47000);
    expect(decodeSmd('4R7').value).toBeCloseTo(4.7, 15);
    expect(decodeSmd('r47').value).toBeCloseTo(0.47, 15);
    expect(decodeSmd('10R0').value).toBeCloseTo(10, 15);
    expect(decodeSmd('4K7').value).toBeCloseTo(4700, 9);
    expect(decodeSmd('000').value).toBe(0);
    expect(() => decodeSmd('9Q')).toThrow(/not a resistor code/);
    expect(() => decodeSmd('97C')).toThrow(/01 to 96/);
  });
  it('EIA-96: 01C = 10.0 kΩ, 68X = 49.9 Ω, 96F = 97.6 MΩ, 01Z = 0.1 Ω; and the encoders', () => {
    expect(decodeSmd('01C').value).toBe(10000);
    expect(decodeSmd('68X').value).toBeCloseTo(49.9, 12);
    expect(decodeSmd('96F').value).toBeCloseTo(97.6e6, 3);
    expect(decodeSmd('01Z').value).toBeCloseTo(0.1, 15);
    expect([smd3(4700), smd4(47000), smdEia96(10000), smdEia96(49.9), smd3(0.47), smd4(4.75)]).toEqual(['472', '4702', '01C', '68X', 'R47', '4R75']);
    expect(smdEia96(4700)).toBeNull(); // 4.70 is not an E96 value
  });
  it('“47R” is ambiguous: read as 47 Ω with a warning naming the EIA-96 reading (3.01 Ω)', () => {
    const r = run({ mode: 'smd', code: '47R' });
    expect(res(r, 'r')).toBe(47);
    expect(r.warnings.join(' ')).toMatch(/ambiguous.*3\.01 Ω/);
  });
});

describe('resistor-color-code: IEC 60063 series', () => {
  it('E192 uses 9.20 (the one exception to the rounding rule); E48 ⊂ E96 ⊂ E192', () => {
    expect(E192[185]).toBe(9.2);
    expect(E192).toHaveLength(192);
    expect(seriesOf(4.7)).toEqual(['E6', 'E12', 'E24', 'E192']);
    expect(seriesOf(4750)).toEqual(['E96', 'E192']);
    expect(seriesOf(6600)).toEqual([]);
    expect(nearestIn(6600, 'E24').near).toBe(6800);
  });
});

describe('resistor-color-code: Python cross-check (independent rounding with %.Ne)', () => {
  it('encode: 4.75 kΩ to 4 bands → 4.8 kΩ yellow-grey-red; 0.137 Ω to 5 bands → brown-orange-violet-pink; 68 GΩ to 4 bands → blue-grey-white', () => {
    const a = run({ mode: 'encode', bands: 4, r: 4750 });
    expect(res(a, 'coded')).toBe(4800);
    expect(colors(a).slice(0, 3)).toEqual(['yellow', 'grey', 'red']);
    expect(colors(run({ mode: 'encode', bands: 5, r: 0.137 })).slice(0, 4)).toEqual(['brown', 'orange', 'violet', 'pink']);
    expect(colors(run({ mode: 'encode', bands: 4, r: 68e9 })).slice(0, 3)).toEqual(['blue', 'grey', 'white']);
  });
});

describe('resistor-color-code: round trips between modes', () => {
  it('decode → encode → decode keeps the bands; encode → (◎) decode sets the bands from the value', () => {
    for (const r0 of [0.47, 2.2, 49.9, 4750, 10e3, 1e6, 820e6]) {
      const n = encodeValue(r0, 2) && Math.abs(encodeValue(r0, 2)!.value - r0) < 1e-9 * r0 ? 4 : 5;
      const st: RccState = { ...def.defaults(), mode: 'encode', bands: n as 4 | 5, r: r0 };
      // the ◎ on R in encode mode switches to decode and fills the band selects from the value
      const fR = (def.fields.flatMap((f: FieldSpec) => (f.kind === 'section' ? f.fields : [f])).find((f: FieldSpec) => f.kind === 'number' && f.key === 'r') as any);
      fR.onSolve(st, st);
      const r = runCompute(def, st);
      expect(r.ok).toBe(true);
      expect(st.r / r0).toBeCloseTo(1, 12);
    }
  });
  it('SMD mode from a value picks a code that decodes back to it', () => {
    for (const r0 of [4.7, 47e3, 4750, 0.1]) {
      const st: RccState = { ...def.defaults(), mode: 'encode', bands: 5, r: r0 };
      const mode = def.fields[0].kind === 'section' ? (def.fields[0].fields[0] as any) : null;
      mode.apply('smd', st, st);
      st.mode = 'smd';
      runCompute(def, st);
      expect(st.r / r0).toBeCloseTo(1, 12);
    }
  });
});

describe('resistor-color-code: review regressions', () => {
  const sec = (i: number, key: string) => (def.fields[i] as any).fields.find((x: any) => x.key === key);
  it('6-band 49.9 Ω → 4 bands stays at 4 bands, rounds to 50 Ω with a warning; back to 5 bands restores 49.9 Ω', () => {
    const st: RccState = { ...def.defaults(), ...(def.examples!.find((e) => e.id === 'six')!.state as RccState) };
    runCompute(def, st);
    st.bands = 4;
    sec(0, 'bands').apply(4, st, st);
    const r = runCompute(def, st);
    expect(st.bands).toBe(4);
    expect(st.r).toBeCloseTo(50, 12);
    expect(r.warnings.join(' ')).toMatch(/needs three significant digits/);
    st.bands = 5;
    sec(0, 'bands').apply(5, st, st);
    expect(runCompute(def, st).warnings.join(' ')).not.toMatch(/needs three/);
    expect(st.r).toBeCloseTo(49.9, 12);
  });
  it('encode 4753 Ω (4 bands) → SMD codes the coded 4.8 kΩ ("482"), and back to encode gives the same value', () => {
    const st: RccState = { ...def.defaults(), mode: 'encode', bands: 4, r: 4753 };
    runCompute(def, st);
    sec(0, 'mode').apply('smd', st, st);
    st.mode = 'smd';
    runCompute(def, st);
    expect(st.code).toBe('482');
    expect(st.r).toBe(4800);
    st.mode = 'encode';
    expect(res(runCompute(def, st), 'coded')).toBe(4800);
  });
});

describe('resistor-color-code: re-verify regressions', () => {
  it('encode 4.7 mΩ (no SMD code) → SMD clears the old code, keeps the value with a NO CODE warning; back to encode is unchanged', () => {
    const st: RccState = { ...def.defaults(), mode: 'encode', bands: 4, r: 0.0047, code: '472' };
    runCompute(def, st);
    ((def.fields[0] as any).fields.find((x: any) => x.key === 'mode')).apply('smd', st, st);
    st.mode = 'smd';
    const r = runCompute(def, st);
    expect(st.code).toBe('');
    expect(r.ok).toBe(true);
    expect(r.status?.text).toBe('NO CODE');
    expect(st.r).toBe(0.0047);
    expect(JSON.stringify(r.results)).not.toMatch(/4\.7 kΩ/);
    st.mode = 'encode';
    runCompute(def, st);
    expect(st.r).toBe(0.0047); // A → B → A: the value is untouched (4.7 mΩ is below the band range too)
  });
});

describe('resistor-color-code: warnings', () => {
  it('black first band → reading backwards; non-standard value → warning; too many digits → rounding', () => {
    expect(run({ d1: 0, d2: 4 }).warnings.join(' ')).toMatch(/backwards/);
    expect(run(def.examples!.find((e) => e.id === 'nonstd')!.state).warnings.join(' ')).toMatch(/not in any IEC 60063 series/);
    expect(run({ mode: 'encode', bands: 4, r: 4750 }).warnings.join(' ')).toMatch(/Use 5 bands/);
  });
  it('out-of-range values cannot be coded (warning + NO CODE, never a red error on a band switch); bad SMD code is an error', () => {
    const a = run({ mode: 'encode', bands: 4, r: 0.001 });
    expect(a.ok).toBe(true);
    expect(a.status?.text).toBe('NO CODE');
    expect(res(a, 'coded')).toBeNull();
    expect(run({ mode: 'encode', bands: 4, r: 699e9 }).warnings.join(' ')).toMatch(/Use 5 bands/);
    expect(run({ mode: 'smd', code: 'hello' }).ok).toBe(false);
  });
});

function collect(fields: FieldSpec[], nums: { key: string; min: number; max: number }[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}

describe('resistor-color-code: fuzz (450 random states through runCompute)', () => {
  it('never throws; clean text; finite graphs; stable recompute', () => {
    const nums: { key: string; min: number; max: number }[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 9;
    const rnd = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const codes = ['472', '1002', '4R7', 'R10', '01C', '68X', '000', '47R', '4K7', 'abc', '', '99Z', '0R0'];
    let ok = 0;
    for (let i = 0; i < 450; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      s.r = rnd() < 0.05 ? 0 : 1e-3 * 1e15 ** rnd();
      s.code = codes[Math.floor(rnd() * codes.length)];
      s.mode = ['decode', 'encode', 'smd'][i % 3];
      const st = s as unknown as RccState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        expect(st.mode).not.toBe('decode'); // every band combination decodes
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of [...sr.x, ...sr.y]) expect(Number.isFinite(y), g.id).toBe(true);
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      expect(again.summary).toBe(r.summary);
    }
    expect(ok).toBeGreaterThan(330);
  });
});

describe('resistor-color-code: examples', () => {
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
