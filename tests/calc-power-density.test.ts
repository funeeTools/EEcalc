import { describe, expect, it } from 'vitest';
import { type PdState, def } from '@/calculators/power-density/def';
import { ETA0, density, fccLimit, icnirpLimit } from '@/calculators/power-density/model';

type R = { results: { key: string; value: unknown; display: string; solved?: boolean }[] };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<PdState>) => def.compute({ ...def.defaults(), ...p } as PdState);

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const logU = (r: () => number, lo: number, hi: number) => lo * (hi / lo) ** r();


/** Field min/max by key (number fields, sections and groups; list items excluded). */
function fieldRanges(fields: any[], out: Record<string, { min: number; max: number }> = {}): Record<string, { min: number; max: number }> {
  for (const f of fields) {
    if (f.kind === 'number') out[f.key] = { min: f.min ?? -Infinity, max: f.max ?? Infinity };
    else if (f.fields && f.kind !== 'list') fieldRanges(f.fields, out);
  }
  return out;
}
/** Every solved result that is written back into an input lies inside that input's min/max. */
function expectSolvedInRange(rep: { ok: boolean; results: { key: string; value: unknown; solved?: boolean }[] }, ranges: Record<string, { min: number; max: number }>, ctx: string): void {
  if (!rep.ok) return;
  for (const x of rep.results) {
    if (!x.solved || typeof x.value !== 'number' || !ranges[x.key]) continue;
    expect(x.value >= ranges[x.key].min && x.value <= ranges[x.key].max, `${ctx}: ${x.key} = ${x.value} outside [${ranges[x.key].min}, ${ranges[x.key].max}]`).toBe(true);
  }
}

describe('power density', () => {
  it('47 CFR §1.1310 Table 1 rows (mW/cm² × 10 = W/m²)', () => {
    expect(fccLimit(915e6, 'general')!.sEff).toBeCloseTo((915 / 1500) * 10, 12); // f/1500 mW/cm²
    expect(fccLimit(915e6, 'occupational')!.sEff).toBeCloseTo((915 / 300) * 10, 12);
    expect(fccLimit(2.45e9, 'general')!.sEff).toBe(10); // 1.0 mW/cm²
    expect(fccLimit(2.45e9, 'occupational')!.sEff).toBe(50); // 5 mW/cm²
    expect(fccLimit(100e6, 'general')!.sEff).toBe(2); // 0.2 mW/cm²
    expect(fccLimit(100e6, 'general')!.e).toBe(27.5);
    expect(fccLimit(14.2e6, 'general')!.sEff).toBeCloseTo((180 / 14.2 ** 2) * 10, 12);
    expect(fccLimit(14.2e6, 'occupational')!.sEff).toBeCloseTo((900 / 14.2 ** 2) * 10, 12);
    expect(fccLimit(1e6, 'general')!.sEff).toBe(1000);
    expect(fccLimit(0.2e6, 'general')).toBeNull();
    expect(fccLimit(150e9, 'general')).toBeNull();
    expect(fccLimit(30e6, 'occupational')!.avgMin).toBe(6);
    expect(fccLimit(30e6, 'general')!.avgMin).toBe(30);
  });

  it('ICNIRP 2020 Table 5 rows', () => {
    expect(icnirpLimit(1e9, 'general')!.s).toBeCloseTo(1000 / 200, 12); // f/200
    expect(icnirpLimit(1e9, 'occupational')!.s).toBeCloseTo(1000 / 40, 12); // f/40
    expect(icnirpLimit(1e9, 'general')!.e).toBeCloseTo(1.375 * Math.sqrt(1000), 12);
    expect(icnirpLimit(100e6, 'general')!.s).toBe(2);
    expect(icnirpLimit(28e9, 'general')!.s).toBe(10);
    expect(icnirpLimit(28e9, 'occupational')!.s).toBe(50);
    const hf = icnirpLimit(14.2e6, 'general')!;
    expect(hf.s).toBeNull();
    expect(hf.e).toBeCloseTo(300 / 14.2 ** 0.7, 12);
    expect(hf.h).toBeCloseTo(2.2 / 14.2, 12);
    expect(hf.sEff).toBeCloseTo(Math.min(hf.e! ** 2 / ETA0, ETA0 * hf.h! ** 2), 12);
  });

  it('OET-65 eq. (3) and ITU-R P.525 field strength E ≈ √(30·EIRP)/r', () => {
    // 100 W EIRP at 10 m: S = 100/(4π·100) = 0.0796 W/m²
    expect(density(100, 10, 1, 1)).toBeCloseTo(100 / (400 * Math.PI), 14);
    const r = run({ p: 100, g: 0, r: 10, duty: 100, ground: 'free' });
    expect(res(r, 'e') / (Math.sqrt(30 * 100) / 10)).toBeCloseTo(1, 3); // η₀/4π = 29.98 Ω vs 30 Ω
    expect(res(r, 'e') / res(r, 'h')).toBeCloseTo(ETA0, 9);
    // OET-65 eq. (6): ground reflection multiplies S by 1.6² = 2.56
    expect(res(run({ ground: 'ground' }), 's') / res(run({ ground: 'free' }), 's')).toBeCloseTo(2.56, 12);
  });

  it('matches the independent Python calculation (reference values)', () => {
    const d = run({});
    expect(res(d, 's')).toBeCloseTo(0.5020999012707928, 12);
    expect(res(d, 'e')).toBeCloseTo(13.753408788291067, 9);
    expect(res(d, 'rc')).toBeCloseTo(0.2240758579746584, 12);
    expect(res(d, 'ratio')).toBeCloseTo(0.05020999012707929, 12);
    const fm = run({ p: 10e3, g: 6, duty: 100, r: 50, f: 98e6, ground: 'ground', std: 'fcc', cls: 'general' });
    expect(res(fm, 'ratio')).toBeCloseTo(1.6220345362922834, 10);
    expect(res(fm, 'rc')).toBeCloseTo(63.67955983461812, 9);
    const hf = run({ p: 100, g: 2.15, duty: 100, r: 5, f: 14.2e6, ground: 'free', std: 'icnirp', cls: 'general', d: 0 });
    expect(res(hf, 'ratio')).toBeCloseTo(0.08971020873688444, 10);
    expect(res(hf, 'rc')).toBeCloseTo(1.4975831257135985, 10);
  });

  it('solve round trips for distance and power at several points', () => {
    const pts: Partial<PdState>[] = [{}, { f: 98e6, ground: 'ground', g: 6, p: 1e4 }, { f: 28e9, std: 'icnirp', duty: 25, g: 25 }, { f: 14.2e6, std: 'icnirp', cls: 'occupational', p: 400 }];
    for (const base of pts) {
      for (const target of [0.01, 2, 50]) {
        const rs = run({ ...base, solveFor: 'r', s: target });
        expect(rs.ok).toBe(true);
        const back = run({ ...base, solveFor: 's', r: res(rs, 'r') });
        expect(res(back, 's') / target).toBeCloseTo(1, 9);
        const ps = run({ ...base, solveFor: 'p', s: target, r: 3 });
        if (!ps.ok) continue; // power outside 1 nW … 1 GW
        const back2 = run({ ...base, solveFor: 's', r: 3, p: res(ps, 'p') });
        expect(res(back2, 's') / target).toBeCloseTo(1, 9);
      }
    }
    // the compliance distance is where the selected limit is met exactly
    const d = run({});
    expect(res(run({ r: res(d, 'rc') }), 'ratio')).toBeCloseTo(1, 9);
    expect(run({ r: res(d, 'rc') }).status?.text).toBe('COMPLIES');
  });

  it('physics: inverse square, linear in power and duty, limit scales with f below 1.5 GHz', () => {
    expect(res(run({ r: 2 }), 's') / res(run({ r: 1 }), 's')).toBeCloseTo(0.25, 12);
    expect(res(run({ p: 2 }), 's') / res(run({ p: 1 }), 's')).toBeCloseTo(2, 12);
    expect(res(run({ duty: 50 }), 's') / res(run({ duty: 100 }), 's')).toBeCloseTo(0.5, 12);
    expect(res(run({ g: 11 }), 's') / res(run({ g: 8 }), 's')).toBeCloseTo(10 ** 0.3, 12);
    expect(fccLimit(1000e6, 'general')!.sEff / fccLimit(500e6, 'general')!.sEff).toBeCloseTo(2, 12);
    expect(res(run({ r: 3 }), 'e') / res(run({ r: 1 }), 'e')).toBeCloseTo(1 / 3, 12);
  });

  it('validity: near-field, reactive near-field, portable-device and no-limit warnings', () => {
    const rad = run({ r: 0.5, d: 1, f: 2.45e9 });
    expect(rad.warnings.some((w) => w.includes('radiative near field'))).toBe(true);
    const react = run({ r: 1, f: 10e6, d: 0, std: 'icnirp' });
    expect(react.warnings.some((w) => w.includes('reactive near field'))).toBe(true);
    const port = run({ r: 0.1, f: 2.45e9, d: 0.02 });
    expect(port.warnings.some((w) => w.includes('§2.1093'))).toBe(true);
    const nolim = run({ f: 200e9, std: 'fcc', d: 0 });
    expect(nolim.status?.text).toBe('NO LIMIT');
    expect(nolim.warnings.some((w) => w.includes('no limit'))).toBe(true);
    const over = run({ r: 0.1, d: 0 });
    expect(over.status?.text).toBe('EXCEEDS LIMIT');
    expect(over.tables[0].rowTones![0]).toBe('fail');
    expect(run({ solveFor: 'r', s: 1e-14, p: 1e9, g: 70 }).ok).toBe(false);
  });

  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
    expect(run(def.examples!.find((e) => e.id === 'lora-20cm')!.state).status?.text).toBe('EXCEEDS LIMIT');
  });

  it('fuzz: 360 random states never throw, stay finite, and recompute stably', () => {
    const r = rng(1234);
    const solves = ['s', 'r', 'p'] as const;
    for (let i = 0; i < 360; i++) {
      const st: PdState = {
        ...def.defaults(),
        solveFor: solves[i % 3],
        p: logU(r, 1e-9, 1e9),
        g: -30 + 100 * r(),
        duty: logU(r, 0.001, 100),
        r: logU(r, 1e-3, 1e7),
        s: logU(r, 1e-15, 1e9),
        ground: r() < 0.5 ? 'free' : 'ground',
        f: logU(r, 1e5, 3e11),
        d: r() < 0.3 ? 0 : logU(r, 1e-3, 1000),
        std: r() < 0.5 ? 'fcc' : 'icnirp',
        cls: r() < 0.5 ? 'general' : 'occupational',
      };
      let rep!: ReturnType<typeof def.compute>;
      expect(() => (rep = def.compute(st))).not.toThrow();
      if (!rep.ok) {
        expect(rep.error).toBeTruthy();
        continue;
      }
      for (const x of rep.results) {
        if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
        expect(x.display).not.toMatch(/NaN|undefined|Infinity/);
      }
      for (const t of rep.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(v).not.toMatch(/NaN|undefined|Infinity/);
      for (const t of [...rep.warnings, ...rep.notes, rep.summary ?? '']) expect(t).not.toMatch(/NaN|undefined|Infinity/);
      expectSolvedInRange(rep, fieldRanges(def.fields as any[]), JSON.stringify(st));
      for (const g of rep.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite) && s.x.every(Number.isFinite), g.id).toBe(true);
      const st2: any = { ...st };
      for (const x of rep.results) if (x.solved && typeof x.value === 'number') st2[x.key] = x.value;
      const rep2 = def.compute(st2);
      expect(rep2.ok).toBe(true);
      for (const k of ['s', 'sAt', 'r', 'p', 'e', 'ratio']) {
        const a = res(rep, k);
        if (typeof a === 'number') expect(res(rep2, k) / a, k).toBeCloseTo(1, 9);
      }
    }
  });
});

describe('power density — review regressions', () => {
  const item = (r: R, k: string) => r.results.find((x) => x.key === k)! as R['results'][number] & { note?: string; tone?: string; symbol?: string };

  it('display: W/cm² figures are S × 1e-4 (default 0.5021 W/m² = 50.21 µW/cm²)', () => {
    const r = run({});
    expect(item(r, 's').note).toContain('50.21 µW/cm²');
    expect(res(r, 'sMw')).toBeCloseTo(0.5020999012707928e-4, 15);
    expect(item(r, 'sMw').display).toBe('50.21 µW/cm²');
  });

  it('display: the no-solution message reads 10000 km, not 10 kkm', () => {
    const r = run({ solveFor: 'r', s: 1e-15, p: 1e9, g: 70 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('10000 km');
    expect(r.error).not.toContain('kkm');
  });

  it('compliance distance inside the near field is flagged (1 MHz, 100 W, ICNIRP)', () => {
    const r = run({ f: 1e6, p: 100, g: 0, std: 'icnirp', d: 0, r: 100 });
    expect(res(r, 'rc')).toBeLessThan(res(r, 'rReactive'));
    expect(item(r, 'rc').tone).toBe('warn');
    expect(r.warnings.some((w) => w.includes('compliance distance') && w.includes('reactive near field'))).toBe(true);
    expect(item(run({}), 'rc').tone).toBe('');
  });

  it('display: extreme values use scientific notation, never "0.00000… fW" or 13-digit percentages', () => {
    const tiny = run({ p: 1e-9, g: -30, r: 1e7, duty: 0.001 });
    for (const x of tiny.results) expect(x.display, x.key).not.toMatch(/\b0\.0000\d* f|e-1\d f/);
    expect(item(tiny, 's').display).toMatch(/^\d\.\d+e−\d+ W\/m²$/);
    const huge = run({ p: 1e9, g: 70, r: 1e-3 });
    expect(item(huge, 'ratio').display).toMatch(/^\d\.\d\de\+\d+ %$/);
  });

  it('rFar is labelled after the quantity it shows', () => {
    expect(item(run({ f: 1e6, d: 1 }), 'rFar').symbol).toBe('λ/2π');
    expect(item(run({ f: 2.45e9, d: 0.2 }), 'rFar').symbol).toBe('2D²/λ');
  });

  it('short select labels so the typical case fits the input column', () => {
    const opts = JSON.stringify(def.fields);
    expect(opts).not.toContain('FCC 47 CFR §1.1310"');
    expect(opts).not.toContain('General population"');
  });
});

describe('power density — review round 2', () => {
  it('a solved S is never written outside the density field range', () => {
    const ranges = fieldRanges(def.fields as any[]);
    for (const p of [{ p: 1e-9, g: -30, r: 1e7, f: 100e3 }, { p: 1e9, g: 70, r: 1e-3 }, { p: 1e-9, g: -30, r: 1e7, duty: 0.001 }]) {
      const r = run({ ...p, solveFor: 's' });
      expect(r.ok, JSON.stringify(p)).toBe(true);
      expect(res(r, 's')).toBeGreaterThanOrEqual(ranges.s.min);
      expect(res(r, 's')).toBeLessThanOrEqual(ranges.s.max);
    }
  });
});

describe('power density — readable solved density (review regression)', () => {
  it('S at the transmit-power limits moves to a unit that shows it as 1–9999', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const S: any = def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === 's');
    for (const p of [1e-9, 1e9]) {
      const st: any = { ...def.defaults(), p };
      runCompute(def as any, st);
      const shown = st.s / S.units[st.sUnit];
      expect(shown, `${p} W → ${shown} ${st.sUnit}`).toBeGreaterThanOrEqual(1);
      expect(shown).toBeLessThan(1e4);
    }
  });
});
