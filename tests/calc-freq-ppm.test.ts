import { describe, expect, it } from 'vitest';
import { def, type PpmState } from '@/calculators/freq-ppm/def';
import { ageing, parabolic, parabolicRange, sumRss, uartMaxMismatch } from '@/calculators/freq-ppm/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<PpmState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity|\[object/;

describe('freq ppm — conversions', () => {
  it('1 ppm of 16 MHz is 16 Hz, 0.0001 %, 86.4 ms/day; all four forms agree', () => {
    for (const [given, v] of [['offPpm', 1], ['offHz', 16], ['offPct', 1e-4], ['fMeas', 16000016]] as const) {
      const r = run({ given, [given]: v });
      expect(res(r, 'offPpm')).toBeCloseTo(1, 7);
      expect(res(r, 'offHz')).toBeCloseTo(16, 6); // f/f₀ − 1 from a measured frequency keeps ~1e-10 relative
      expect(res(r, 'offPct') / 1e-4).toBeCloseTo(1, 7);
      expect(res(r, 'fMeas')).toBeCloseTo(16000016, 6);
      expect(res(r, 'convDrift') / 0.0864).toBeCloseTo(1, 7);
    }
  });
  it('counter reading 25.000 61 MHz on 25 MHz is +24.4 ppm', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'counter')!.state });
    expect(res(r, 'offPpm')).toBeCloseTo(24.4, 9);
  });
  it('typing into a computed box makes it the given one (round trip)', () => {
    const st: PpmState = { ...def.defaults(), given: 'offHz', offHz: -123.4 };
    runCompute(def, st);
    const back = run({ ...st, given: 'offPpm' });
    expect(res(back, 'offHz')).toBeCloseTo(-123.4, 9);
    const back2 = run({ ...st, given: 'fMeas' });
    expect(res(back2, 'offHz')).toBeCloseTo(-123.4, 6);
  });
});

describe('freq ppm — budget (Python reference values)', () => {
  it('defaults: ±20 initial, ±30 over range, ageing 3 + 4×1 → ±57 ppm; RSS ±36.7 ppm', () => {
    const r = run({});
    expect(res(r, 'worstHi')).toBeCloseTo(57, 12);
    expect(res(r, 'worstLo')).toBeCloseTo(-57, 12);
    expect(res(r, 'rssHi')).toBeCloseTo(Math.sqrt(20 ** 2 + 30 ** 2 + 7 ** 2), 12);
    expect(res(r, 'fmin')).toBeCloseTo(16e6 * (1 - 57e-6), 6);
    expect(res(r, 'fastDay')).toBeCloseTo(57e-6 * 86400, 12);
  });
  it('Abracon ABS07 data (β 0.036 ppm/°C², T₀ 25 °C) over −20 … 70 °C after 2 years: −96.9 … +24 ppm', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'rtc-abs07')!.state });
    expect(res(r, 'worstLo')).toBeCloseTo(-20 - 0.036 * 45 ** 2 - 4, 12);
    expect(res(r, 'worstHi')).toBeCloseTo(24, 12);
  });
  it('tuning-fork parabola: −0.034·30² = −30.6 ppm; zero at T₀; one-sided window', () => {
    expect(parabolic(0.034, 25, 55)).toBeCloseTo(-30.6, 12);
    expect(parabolic(0.034, 25, 25)).toBeCloseTo(0, 15);
    expect(parabolicRange(0.034, 25, -40, 85)).toEqual({ lo: -0.034 * 65 ** 2, hi: 0 });
    const off = parabolicRange(0.034, 25, 40, 60); // T₀ outside the range: never reaches 0
    expect(off.hi).toBeCloseTo(-0.034 * 15 ** 2, 12);
  });
  it('ageing law and RSS', () => {
    expect(ageing(3, 1, 0.5)).toBeCloseTo(1.5, 12);
    expect(ageing(3, 1, 10)).toBeCloseTo(12, 12);
    const r = sumRss([{ lo: -3, hi: 3 }, { lo: -4, hi: 0 }]);
    expect(r.lo).toBeCloseTo(-2 - Math.sqrt(13), 12);
    expect(r.hi).toBeCloseTo(-2 + Math.sqrt(13), 12);
  });
});

describe('freq ppm — link checks', () => {
  it('UART 8N1, 16×: (½ − 1/16)/9.5 = 4.605 %', () => {
    expect(uartMaxMismatch(10, 16)).toBeCloseTo(0.4375 / 9.5, 15);
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'uart-rc-rc')!.state });
    expect(r.status?.text).toBe('LINK FAILS');
    expect(r.warnings.join(' ')).toMatch(/crystal/);
  });
  it('USB 2.0 §7.1.11: a ±1 % RC clock fails full speed (±0.25 %); ±57 ppm passes high speed (±500 ppm)', () => {
    expect(def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'usb-rc')!.state }).status?.text).toBe('LINK FAILS');
    expect(run({ link: 'usbHs' }).status?.text).toBe('LINK OK');
    expect(run({ link: 'usbHs', init: 470 }).status?.text).toBe('LINK FAILS');
  });
  it('input errors', () => {
    expect(run({ tmin: 50, tmax: 0 }).ok).toBe(false);
    expect(run({ given: 'offHz', offHz: -32e6 }).error).toMatch(/negative/);
    expect(run({ given: 'fMeas', fMeas: 160e6 }).ok).toBe(true); // 10 × f₀ is just a frequency
  });
});

describe('freq ppm — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
  });
});

function collect(fields: FieldSpec[], nums: { key: string; min: number; max: number }[], sels: { key: string; options: string[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? String(o.value) : o)) });
  }
}

describe('freq ppm — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: { key: string; min: number; max: number }[] = [];
    const sels: { key: string; options: string[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 17;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) s[f.key] = rnd() < 0.1 ? (rnd() < 0.5 ? f.min : f.max) : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      // converter inputs: random offsets up to ±100 % (half of them small), consistent with f₀
      const off = (rnd() - 0.5) * 2 * (rnd() < 0.5 ? 1e-4 : 0.999);
      Object.assign(s, { offPpm: off * 1e6, offHz: off * (s.f0 as number), offPct: off * 100, fMeas: (s.f0 as number) * (1 + off) });
      if ((s.tmax as number) < (s.tmin as number)) [s.tmin, s.tmax] = [s.tmax, s.tmin];
      s.given = (['offPpm', 'offHz', 'offPct', 'fMeas'] as const)[i % 4];
      const st = s as unknown as PpmState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
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
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      expect(res(again, 'worstHi')).toBeCloseTo(res(r, 'worstHi'), 6);
    }
    expect(ok).toBeGreaterThan(380);
  });
});

describe('freq ppm: review regressions', () => {
  it('a negative worst-case high prints a typographic minus, never "+-"', () => {
    const r = run({ tempModel: 'parabolic', beta: 0.034, t0: 25, tmin: 30, tmax: 50, init: 0, aging1: 0, agingN: 0, link: 'none' });
    const fast = r.results.find((x) => x.key === 'fastDay')!;
    expect(fast.value as number).toBeLessThan(0);
    expect(fast.display).toMatch(/^−0\.07\d s\/day$/);
    for (const k of ['slowDay', 'fastDay', 'drift']) expect(r.results.find((x) => x.key === k)!.display + r.results.find((x) => x.key === k)!.note).not.toMatch(/\+-|-\d/);
  });
});
