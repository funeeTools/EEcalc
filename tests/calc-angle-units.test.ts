import { describe, expect, it } from 'vitest';
import { type AngleState, def, dmsText, fmtNum } from '@/calculators/angle-units/def';
import { PER_TURN, convert, norm180, norm360, referenceAngle, toDms, trig } from '@/calculators/angle-units/model';

type R = { results: { key: string; value: unknown; display: string; solved?: boolean }[] };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<AngleState>) => def.compute({ ...def.defaults(), ...p } as AngleState);
const UNITS = ['deg', 'rad', 'grad', 'turn', 'arcmin', 'arcsec', 'mil'] as const;

/** mulberry32: small seeded PRNG so the fuzz run is reproducible */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


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

describe('angle units', () => {
  it('BIPM SI Brochure Table 8: 1° = π/180 rad, 1′ = 1/60°, 1″ = 1/60′; FM 3-25.26: 6400 mil per circle, 1° ≈ 17.78 mil', () => {
    expect(convert(1, 'deg', 'rad')).toBe(Math.PI / 180);
    expect(convert(1, 'arcmin', 'deg')).toBeCloseTo(1 / 60, 15);
    expect(convert(1, 'arcsec', 'arcmin')).toBeCloseTo(1 / 60, 15);
    expect(convert(1, 'turn', 'mil')).toBe(6400);
    expect(convert(1, 'deg', 'mil')).toBeCloseTo(17.78, 2);
    expect(convert(100, 'grad', 'deg')).toBe(90); // ISO 80000-3: gon = π/200 rad
  });

  it('matches the independent Python conversion (reference values)', () => {
    expect(res(run({ given: 'rad', rad: 1 }), 'deg')).toBeCloseTo(57.29577951308232, 12);
    expect(res(run({ given: 'mil', mil: 4800 }), 'deg')).toBe(270);
    expect(res(run({ given: 'arcsec', arcsec: 1 }), 'rad')).toBeCloseTo(4.84813681109536e-6, 18);
    expect(res(run({ given: 'dms', dmsSign: 1, dmsD: 123, dmsM: 45, dmsS: 30 }), 'deg')).toBeCloseTo(123.75833333333334, 12);
    expect(res(run({ given: 'deg', deg: 1 }), 'mil')).toBeCloseTo(17.77777777777778, 12);
  });

  it('round trip: every unit (and DMS) fed back in reproduces the angle', () => {
    for (const deg of [30, -0.5, 123.758333, 359.999, 1e-4, -7200.25, 12345.678]) {
      const base = run({ given: 'deg', deg });
      for (const u of UNITS) {
        const back = run({ given: u, [u]: res(base, u) });
        expect(res(back, 'deg') / deg, `${deg} via ${u}`).toBeCloseTo(1, 12);
      }
      const d = toDms(deg);
      const back = run({ given: 'dms', dmsSign: d.sign, dmsD: d.d, dmsM: d.m, dmsS: d.s });
      expect(res(back, 'deg') / deg, `${deg} via DMS`).toBeCloseTo(1, 11);
    }
  });

  it('sanity: normalisation ranges, whole turns change nothing, sin² + cos² = 1, exact axis values', () => {
    for (const deg of [-721, -180, -0.25, 0, 45, 180, 359.5, 360, 1e5 + 0.125]) {
      const a = norm360(deg);
      const b = norm180(deg);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
      expect(b).toBeGreaterThan(-180);
      expect(b).toBeLessThanOrEqual(180);
      const t = trig(deg);
      const t2 = trig(deg + 360 * 7);
      expect(t.sin * t.sin + t.cos * t.cos).toBeCloseTo(1, 14);
      expect(t2.sin).toBeCloseTo(t.sin, 10);
      expect(t2.cos).toBeCloseTo(t.cos, 10);
    }
    expect(trig(180).sin).toBe(0);
    expect(trig(-90).cos).toBe(0);
    expect(trig(90).tan).toBeNull();
    expect(run({ given: 'deg', deg: 270 }).results.find((x) => x.key === 'tan')!.value).toBeNull();
    expect(res(run({ given: 'deg', deg: -450 }), 'norm180')).toBe(-90);
    // monotone: a larger angle is larger in every unit
    for (const u of UNITS) expect(convert(10.5, 'deg', u)).toBeGreaterThan(convert(10.25, 'deg', u));
    expect(PER_TURN.arcsec).toBe(1296000);
  });

  it('validity limits: DMS fields out of range, very large angles warn', () => {
    expect(run({ given: 'dms', dmsD: 10, dmsM: 60, dmsS: 0 }).ok).toBe(false);
    expect(run({ given: 'dms', dmsD: 10, dmsM: 0, dmsS: 60 }).ok).toBe(false);
    expect(run({ given: 'dms', dmsD: -1, dmsM: 0, dmsS: 0 }).ok).toBe(false);
    expect(run({ given: 'deg', deg: 360 * 2e6 }).ok).toBe(false);
    const big = run({ given: 'turn', turn: 5e4 });
    expect(big.ok).toBe(true);
    expect(big.warnings.some((w) => w.includes('significant digits'))).toBe(true);
    expect(run({ given: 'turn', turn: 5e3 }).warnings.length).toBe(0);
  });

  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
    expect(res(run(def.examples!.find((e) => e.id === 'nato-mils')!.state), 'deg')).toBe(270);
  });

  it('fuzz: 400 random states never throw, stay finite, and recompute stably', () => {
    const r = rng(42);
    const givens = [...UNITS, 'dms'] as const;
    for (let i = 0; i < 400; i++) {
      const given = givens[i % givens.length];
      const st: AngleState = { ...def.defaults(), given, radUnit: r() < 0.5 ? 'rad' : 'mrad' };
      const mag = 10 ** (r() * 12 - 6) * (r() < 0.5 ? -1 : 1);
      if (given === 'dms') Object.assign(st, { dmsSign: r() < 0.5 ? 1 : -1, dmsD: Math.floor(r() * 1e6), dmsM: Math.floor(r() * 60), dmsS: r() * 59.999 });
      else (st as any)[given] = Math.max(Math.min(mag * convert(1, 'deg', given), convert(1e6, 'turn', given)), -convert(1e6, 'turn', given));
      let rep!: ReturnType<typeof def.compute>;
      expect(() => (rep = def.compute(st))).not.toThrow();
      expect(rep.ok, JSON.stringify(st)).toBe(true);
      for (const x of rep.results) {
        if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
        expect(x.display).not.toMatch(/NaN|undefined|Infinity/);
      }
      for (const t of [...rep.warnings, ...rep.notes, rep.summary ?? '']) expect(t).not.toMatch(/NaN|undefined|Infinity/);
      expectSolvedInRange(rep, fieldRanges(def.fields as any[]), JSON.stringify(st));
      for (const g of rep.graphs) for (const s of g.series ?? []) expect(s.y.every(Number.isFinite) && s.x.every(Number.isFinite)).toBe(true);
      // write the computed units back (as the page does) and recompute: same answer
      const st2: any = { ...st };
      for (const x of rep.results) if (x.solved && typeof x.value === 'number') st2[x.key] = x.value;
      def.sync!(st2);
      const rep2 = def.compute(st2);
      for (const u of UNITS) expect(res(rep2, u) / res(rep, u) || 1).toBeCloseTo(1, 9);
    }
  });
});

describe('angle units — review regressions', () => {
  const disp = (r: R, k: string) => r.results.find((x) => x.key === k)!.display;

  it('DMS display rounds the seconds first and then carries: never 60″', () => {
    expect(disp(run({ given: 'deg', deg: 0.99999999999 }), 'dms')).toBe('1° 00′ 00″');
    expect(disp(run({ given: 'dms', dmsSign: 1, dmsD: 0, dmsM: 59, dmsS: 59.9999999 }), 'dms')).toBe('1° 00′ 00″');
    expect(disp(run({ given: 'arcsec', arcsec: 1295999.99999999 }), 'dms')).toBe('360° 00′ 00″');
    expect(dmsText({ sign: 1, d: 12, m: 59, s: 59.99999995 })).toBe('13° 00′ 00″');
  });

  it('normalisation: tiny negative angles stay exact and 0–360 stays below 360 (display too)', () => {
    expect(norm180(-1e-12)).toBe(-1e-12);
    expect(norm360(-1e-12)).toBeLessThan(360);
    const r = run({ given: 'deg', deg: -1e-12 });
    expect(res(r, 'norm180')).toBe(-1e-12);
    expect(disp(r, 'norm360')).not.toBe('360°');
    expect(norm180(540)).toBe(180);
    expect(norm180(-540)).toBe(180);
    expect(norm360(720)).toBe(0);
  });

  it('computed rows get 12 significant digits in their input boxes', () => {
    const nums: any[] = [];
    const walk = (fs: any[]) => fs.forEach((f) => (f.fields ? walk(f.fields) : f.kind === 'number' && f.solvable && nums.push(f)));
    walk(def.fields as any[]);
    expect(nums.length).toBeGreaterThanOrEqual(8);
    for (const f of nums) expect(f.digits, f.key).toBe(12);
  });

  it('signed zero and exponents: no “−0°” and a typographic minus in every exponent', () => {
    expect(disp(run({ given: 'dms', dmsSign: -1, dmsD: 0, dmsM: 0, dmsS: 0 }), 'dms')).toBe('0° 00′ 00″');
    expect(disp(run({ given: 'deg', deg: -1e-12 }), 'dms')).toBe('0° 00′ 00″');
    expect(fmtNum(-1.5e-12)).toBe('−1.5e−12');
    expect(fmtNum(1.5e-12)).toBe('1.5e−12');
  });
});

describe('angle units — review round 2', () => {
  const disp = (r: R, k: string) => r.results.find((x) => x.key === k)!.display;

  it('359.99999999999994° never displays as 360° on 0–360', () => {
    const r = run({ given: 'deg', deg: 359.99999999999994 });
    expect(disp(r, 'norm360')).not.toBe('360°');
    expect(disp(r, 'norm360')).toBe('359.99999999999994°');
  });

  it('−1e-300°: θ mod 360, quadrant and whole turns agree', () => {
    const r = run({ given: 'deg', deg: -1e-300 });
    expect(res(r, 'norm360')).toBe(0);
    expect(res(r, 'quadrant')).toBe(0);
    expect(res(r, 'wholeTurns')).toBe(0);
    const w = run({ given: 'deg', deg: -450 });
    expect(res(w, 'norm360') + 360 * res(w, 'wholeTurns')).toBe(-450);
  });

  it('reference angle keeps the precision of tiny angles', () => {
    expect(res(run({ given: 'deg', deg: -1e-12 }), 'refAngle')).toBe(1e-12);
    expect(referenceAngle(-135)).toBe(45);
    expect(referenceAngle(200)).toBe(20);
    expect(referenceAngle(300)).toBe(60);
  });
});

describe('mode-switch review (regressions)', () => {
  it('the radians card uses the unit the box ends up in after the core fits a readable prefix', async () => {
    const { runCompute } = await import('@/core/calc/page');
    for (const [deg, unit] of [[30, 'rad'], [1, 'mrad'], [0.001, 'µrad'], [1e8, 'rad']] as const) {
      for (const start of ['rad', 'mrad', 'µrad']) {
        const st: any = { ...def.defaults(), given: 'deg', deg, radUnit: start };
        const r = runCompute(def as any, st);
        const card = r.results.find((x) => x.key === 'rad')!;
        expect(card.display.endsWith(` ${st.radUnit}`), `${deg}° from ${start}: ${card.display} vs ${st.radUnit}`).toBe(true);
        // the user's own choice is kept while it is readable
        if (start === 'mrad' && deg === 30) expect(st.radUnit).toBe('mrad');
        if (start === 'rad') expect(st.radUnit).toBe(unit);
      }
    }
  });
  it('1 arcsecond reads as 4.848 µrad', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const ex = def.examples!.find((e) => e.id === 'arcsec')!;
    const st: any = { ...def.defaults(), ...structuredClone(ex.state) };
    const r = runCompute(def as any, st);
    expect(st.radUnit).toBe('µrad');
    expect(r.results.find((x) => x.key === 'rad')!.display).toMatch(/^4\.848\d* µrad$/);
  });
  it('tan at 90° says “not defined” (no “undefined” text on the page)', () => {
    const r = def.compute({ ...def.defaults(), given: 'deg', deg: 90 });
    expect(r.results.find((x) => x.key === 'tan')!.display).toBe('not defined (cos θ = 0)');
  });
});
