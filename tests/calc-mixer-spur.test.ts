import { describe, expect, it } from 'vitest';
import { type MixState, def } from '@/calculators/mixer-spur/def';
import { type Conv, type Side, inFor, loFor, outFor, products, sweep } from '@/calculators/mixer-spur/model';

type R = { results: { key: string; value: unknown; display: string; solved?: boolean }[]; details?: any };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<MixState>) => def.compute({ ...def.defaults(), ...p } as MixState);

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

describe('mixer spurs', () => {
  it('superheterodyne relations (Rohde, Whitaker & Zahnd; Pozar ch. 13): FM 100 MHz, 10.7 MHz IF, high-side LO', () => {
    const r = run({ solveFor: 'flo', conv: 'down', side: 'high', plan: 'fixed', fin: 100e6, bin: 200e3, fout: 10.7e6, bout: 200e3, order: 5, margin: 1e6 });
    expect(res(r, 'flo')).toBeCloseTo(110.7e6, 3);
    expect(res(r, 'image')).toBeCloseTo(121.4e6, 3); // f_RF + 2·f_IF
    expect(res(r, 'halfIf')).toBeCloseTo(105.35e6, 3); // f_RF + f_IF/2
    const resp = r.details!.responses as { m: number; n: number; sign: number; lo: number; hi: number; wanted: boolean }[];
    expect(resp.some((x) => x.m === 1 && x.n === 1 && !x.wanted && Math.abs((x.lo + x.hi) / 2 - 121.4e6) < 1)).toBe(true);
    expect(resp.some((x) => x.m === 0 && x.n === 1 && Math.abs((x.lo + x.hi) / 2 - 10.7e6) < 1)).toBe(true); // IF feedthrough
  });

  it('matches the independent brute-force Python scan (reference values)', () => {
    const d = run({});
    expect(res(d, 'flo')).toBe(985e6);
    expect(res(d, 'inBand')).toBe(0);
    expect(res(d, 'total')).toBe(29);
    expect(res(d, 'nearest')).toBeCloseTo(31e6, 0);
    const ism = run(def.examples!.find((e) => e.id === 'ism-low-if')!.state);
    expect(res(ism, 'inBand')).toBe(1);
    expect(ism.details!.inBand).toEqual(['2·LO − 2·IN']);
    const row = ism.tables[0].rows[0];
    expect([row.lo, row.hi]).toEqual([116.5e6, 283.5e6]);
    expect(ism.tables[0].rows[1].dist).toBeCloseTo(33e6, 0);
    const up = run(def.examples!.find((e) => e.id === 'upconvert')!.state);
    expect(up.tables[0].rows[0].product).toBe('LO − 2·IN');
    expect(res(up, 'nearest')).toBeCloseTo(110e6, 0);
  });

  it('solve round trips for f_LO, f_out and f_in in every conversion / side', () => {
    const cases: [Conv, Side, number, number][] = [['down', 'high', 915e6, 70e6], ['down', 'low', 2.44e9, 300e6], ['up', 'low', 140e6, 2.45e9], ['up', 'high', 70e6, 1.2e9], ['down', 'high', 12e9, 1.2e9]];
    for (const [conv, side, fin, fout] of cases) {
      const lo = run({ solveFor: 'flo', conv, side, fin, fout, bin: fin * 0.01, bout: fout * 0.01 });
      expect(lo.ok, `${conv} ${side}`).toBe(true);
      const flo = res(lo, 'flo');
      expect(flo).toBeCloseTo(loFor(conv, side, fin, fout), 0);
      const o = run({ solveFor: 'fout', conv, side, fin, flo, bin: fin * 0.01, bout: fout * 0.01 });
      expect(res(o, 'fout') / fout).toBeCloseTo(1, 9);
      const i = run({ solveFor: 'fin', conv, side, fout, flo, bin: fin * 0.01, bout: fout * 0.01 });
      expect(res(i, 'fin') / fin).toBeCloseTo(1, 9);
      expect(outFor(conv, side, inFor(conv, side, fout, flo), flo) / fout).toBeCloseTo(1, 12);
    }
  });

  it('physics: product count, wanted product excluded, sweep width n·B_in, tuned plan keeps the wanted output fixed', () => {
    // (N+1)(N+2)/2 − 1 (m,n) pairs; pairs with m,n ≥ 1 have two signs; minus the wanted one
    for (const N of [2, 3, 5, 7]) {
      let pairs = 0;
      for (let m = 0; m <= N; m++) for (let n = 0; m + n <= N; n++) if (m + n > 0) pairs += m > 0 && n > 0 ? 2 : 1;
      expect(products(N, -1).length).toBe(pairs - 1);
    }
    const [lo, hi] = sweep({ m: 2, n: 3, sign: -1, order: 5 }, 900e6, 930e6, [0, 1e9]);
    expect(hi - lo).toBeCloseTo(3 * 30e6, 0);
    const tuned = run({ plan: 'tuned', bout: 200e3, margin: 1e6 });
    expect(tuned.ok).toBe(true);
    const law = tuned.details!.law as [number, number];
    for (const f of [902e6, 915e6, 928e6]) expect(Math.abs(law[0] * f + law[1] - f)).toBeCloseTo(70e6, 0);
    // switching LO side moves the image to the other side of the input
    expect(res(run({ side: 'low' }), 'image')).toBeLessThan(915e6);
    expect(res(run({ side: 'high' }), 'image')).toBeGreaterThan(915e6);
  });

  it('validity: inconsistent plans, image on top of the band, LO inside the band, narrow IF filter', () => {
    expect(run({ solveFor: 'fout', side: 'high', flo: 900e6 }).ok).toBe(false); // high-side LO below f_in
    expect(run({ solveFor: 'flo', conv: 'up', fout: 50e6 }).ok).toBe(false); // up-converter with f_out < f_in
    const img = run({ fout: 10e6, bout: 8e6 });
    expect(img.warnings.some((w) => w.includes('image band'))).toBe(true);
    const narrow = run({ bout: 5e6 });
    expect(narrow.warnings.some((w) => w.includes('narrower'))).toBe(true);
    const inband = run(def.examples!.find((e) => e.id === 'ism-low-if')!.state);
    expect(inband.status?.tone).toBe('fail');
    expect(inband.tables[0].rowTones![0]).toBe('fail');
    const loIn = run({ solveFor: 'fout', side: 'high', flo: 916e6, bin: 26e6, bout: 0.5e6 });
    expect(loIn.warnings.some((w) => w.includes('LO lies inside'))).toBe(true);
    expect(run({ order: 3 }).notes.some((n) => n.includes('Only orders up to 3'))).toBe(true);
  });

  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
  });

  it('fuzz: 360 random states never throw, stay finite, and recompute stably', () => {
    const r = rng(7);
    const solves = ['flo', 'fout', 'fin'] as const;
    let ok = 0;
    for (let i = 0; i < 360; i++) {
      const st: MixState = {
        ...def.defaults(),
        solveFor: solves[i % 3],
        conv: r() < 0.5 ? 'down' : 'up',
        side: r() < 0.5 ? 'low' : 'high',
        plan: r() < 0.5 ? 'fixed' : 'tuned',
        fin: logU(r, 1e3, 1e12),
        bin: logU(r, 1, 1e12),
        fout: logU(r, 1e3, 1e12),
        bout: logU(r, 1, 1e12),
        flo: logU(r, 1e3, 1e12),
        order: 2 + Math.floor(r() * 10),
        margin: r() < 0.2 ? 0 : logU(r, 1, 1e12),
      };
      // half the time make the bands sensible so most states get past validation
      if (r() < 0.5) {
        st.bin = st.fin * r() * 0.5;
        st.bout = st.fout * r() * 0.5 + 1;
      }
      let rep!: ReturnType<typeof def.compute>;
      expect(() => (rep = def.compute(st))).not.toThrow();
      if (!rep.ok) {
        expect(rep.error).toBeTruthy();
        expect(rep.error).not.toMatch(/NaN|undefined|Infinity/);
        continue;
      }
      ok++;
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
      expect(res(rep2, st.solveFor) / res(rep, st.solveFor)).toBeCloseTo(1, 9);
      expect(res(rep2, 'inBand')).toBe(res(rep, 'inBand'));
    }
    expect(ok).toBeGreaterThan(60);
  });
});

describe('mixer spurs — review regressions', () => {
  const disp = (r: { results: { key: string; display: string }[] }, k: string) => r.results.find((x) => x.key === k)!.display;

  it('folded image: low-side LO below the IF reports |f_LO − f_out| (positive) and keeps the overlap check', () => {
    const r = run({ solveFor: 'flo', conv: 'down', side: 'low', fin: 100e6, fout: 70e6, bin: 2e6, bout: 2e6, margin: 1e6 });
    expect(res(r, 'flo')).toBeCloseTo(30e6, 0);
    expect(res(r, 'image')).toBeCloseTo(40e6, 0);
    expect(disp(r, 'image')).toBe('40 MHz');
    expect(res(r, 'halfIf')).toBeGreaterThan(0);
    // image 2·f_LO = 2 MHz from f_in: the overlap warning must fire
    const close = run({ solveFor: 'flo', conv: 'down', side: 'low', fin: 100e6, fout: 99e6, bin: 6e6, bout: 2e6, margin: 1e6 });
    expect(res(close, 'image')).toBeCloseTo(98e6, 0);
    expect(close.warnings.some((w) => w.includes('image band'))).toBe(true);
    for (const x of [...r.results, ...close.results]) expect(x.display.startsWith('−') || x.display.startsWith('-')).toBe(false);
  });

  it('up-converter other-sideband note says 2·f_LO when the LO is below the input', () => {
    const r = run({ solveFor: 'flo', conv: 'up', side: 'low', fin: 140e6, fout: 200e6, bin: 2e6, bout: 2e6 });
    expect(res(r, 'otherSideNote')).toBeCloseTo(120e6, 0);
    expect(r.results.find((x) => x.key === 'otherSideNote')!.note).toContain('2·f_LO');
    const hi = run({ solveFor: 'flo', conv: 'up', side: 'high', fin: 140e6, fout: 2e9, bin: 2e6, bout: 2e6 });
    expect(hi.results.find((x) => x.key === 'otherSideNote')!.note).toBe('= 2·f_in');
  });

  it('tuned up-converter shows the LO range low → high; a negative LO is refused', () => {
    const r = run({ solveFor: 'flo', conv: 'up', side: 'low', plan: 'tuned', fin: 10e6, bin: 2e6, fout: 1e9, bout: 1e6 });
    expect(disp(r, 'loRange')).toBe('989 MHz … 991 MHz');
    expect(run({ solveFor: 'flo', conv: 'down', side: 'low', plan: 'tuned', fin: 100e6, bin: 80e6, fout: 70e6, bout: 1e6 }).ok).toBe(false);
  });
});

describe('mixer spurs — mode switches (review regressions)', () => {
  const field = (key: string): any => def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === key);
  const pick = (st: MixState, key: 'conv' | 'side', v: string) => {
    (st as any)[key] = v;
    field(key).apply?.(v, st, st);
    return def.compute(st);
  };
  const start = (id?: string) => ({ ...def.defaults(), ...(id ? def.examples!.find((e) => e.id === id)!.state : {}) }) as MixState;
  it('Direction switch from the defaults and every example keeps a valid plan and the same LO (was a red error)', () => {
    for (const ex of [undefined, ...def.examples!.map((e) => e.id)]) {
      const st = start(ex);
      const before = def.compute({ ...st });
      const flo = res(before, 'flo') ?? st.flo;
      const r = pick(st, 'conv', st.conv === 'down' ? 'up' : 'down');
      expect(r.ok, `${ex}: ${r.error}`).toBe(true);
      expect(st.solveFor === 'flo' ? res(r, 'flo') : st.flo).toBeCloseTo(flo, 0);
      // and back: the same state as before
      const back = pick(st, 'conv', st.conv === 'down' ? 'up' : 'down');
      expect(back.ok).toBe(true);
      expect(back.summary).toBe(before.summary);
    }
  });
  it('Direction switch keeps frequencies already in the new order (typed the wrong way round)', () => {
    const st = { ...def.defaults(), fin: 70e6, fout: 915e6 } as MixState;
    expect(def.compute({ ...st }).ok).toBe(false);
    const r = pick(st, 'conv', 'up');
    expect(r.ok).toBe(true);
    expect(st.fin).toBe(70e6);
  });
  it('LO-side switch solves the LO for the f_in, f_out entered (GPS example solving f_out was a red error)', () => {
    const st = start('solve-if');
    def.compute(st);
    st.fout = 175.42e6; // the solved IF written back
    const r = pick(st, 'side', 'high');
    expect(st.solveFor).toBe('flo');
    expect(r.ok).toBe(true);
    expect(res(r, 'flo')).toBeCloseTo(1575.42e6 + 175.42e6, 0);
  });
});
