import { describe, expect, it } from 'vitest';
import { def, surface, type Rt60State } from '@/calculators/rt60/def';
import { airAttenuation, bandRt, criticalDistance, schroederFreq, soundSpeed } from '@/calculators/rt60/model';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const run = (p: Partial<Rt60State>) => def.compute({ ...def.defaults(), ...p });
const res = (r: CalcReport, k: string) => {
  const x = r.results.find((y) => y.key === k);
  return (x ? x.value : (r.details as Record<string, unknown>)?.[k]) as number;
};
const band = (r: CalcReport, i: number) => (r.details as { bands: { sabine: number; eyring: number; ms: number; abar: number }[] }).bands[i];
const rel = (a: number, b: number) => Math.abs(a / b - 1);

// ── fuzz helpers (shared shape across builder-E tests) ──────────────────────────
type Scope = Record<string, any>;
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function randomize(fields: FieldSpec[], scope: Scope, rnd: () => number): void {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') randomize(f.fields, f.at ? scope[f.at] : scope, rnd);
    else if (f.kind === 'list') {
      const n = Math.max(f.minItems ?? 1, Math.floor(rnd() * Math.min(f.maxItems ?? 5, 5)) + 1);
      const items: Scope[] = [];
      for (let i = 0; i < n; i++) {
        const it = structuredClone(f.create(items[i - 1] ?? scope[f.key]?.[i]));
        randomize(f.fields, it, rnd);
        items.push(it);
      }
      scope[f.key] = items;
    } else if (f.kind === 'number') {
      if (f.optional && rnd() < 0.25) {
        scope[f.key] = null;
        continue;
      }
      const lo = f.min ?? -1e3;
      const hi = f.max ?? 1e3;
      let v = lo > 0 && hi / lo > 100 ? lo * (hi / lo) ** rnd() : lo + (hi - lo) * rnd();
      if (f.integer) v = Math.round(v);
      scope[f.key] = v;
    } else if (f.kind === 'select') {
      const o = f.options[Math.floor(rnd() * f.options.length)];
      scope[f.key] = typeof o === 'string' ? o : o.value;
    } else if (f.kind === 'toggle') scope[f.key] = rnd() < 0.5;
  }
}
const BAD = /NaN|undefined|Infinity/;
function checkReport(r: CalcReport, tag: string): void {
  if (!r.ok) {
    expect(typeof r.error, tag).toBe('string');
    expect(r.error!.length, tag).toBeGreaterThan(5);
    expect(BAD.test(r.error!), `${tag} error text: ${r.error}`).toBe(false);
    return;
  }
  for (const x of r.results) {
    if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${tag} ${x.key}=${x.value}`).toBe(true);
    expect(BAD.test(x.display), `${tag} ${x.key} display "${x.display}"`).toBe(false);
    if (x.note) expect(BAD.test(x.note), `${tag} ${x.key} note "${x.note}"`).toBe(false);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(BAD.test(v), `${tag} table ${t.id} "${v}"`).toBe(false);
  for (const s of [r.summary ?? '', ...r.warnings, ...r.notes]) expect(BAD.test(s), `${tag} text "${s}"`).toBe(false);
  for (const g of r.graphs)
    for (const s of g.series ?? []) {
      expect(s.x.length, `${tag} ${g.id}`).toBe(s.y.length);
      expect(s.x.every(Number.isFinite) && s.y.every(Number.isFinite), `${tag} ${g.id}/${s.label}`).toBe(true);
    }
}
/** Write solved results back into the state, as the page does. */
function writeBack(state: Scope, r: CalcReport): Scope {
  const s = structuredClone(state);
  for (const x of r.results) if (x.solved && typeof x.value === 'number' && Number.isFinite(x.value)) {
    const path = x.key.split('.');
    let o: Scope = s;
    for (const p of path.slice(0, -1)) o = o[p];
    o[path[path.length - 1]] = x.value;
  }
  return s;
}
function fuzz(def: CalcDef<any>, n: number, seed: number, fix?: (s: Scope) => void): { ok: number; fail: number } {
  const rnd = rng(seed);
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < n; i++) {
    const st: Scope = def.defaults();
    randomize(def.fields, st, rnd);
    const opts = def.solve!.options;
    st.solveFor = opts[i % opts.length].key;
    fix?.(st);
    def.sync?.(st as any);
    let r!: CalcReport;
    expect(() => (r = def.compute(st as any)), `case ${i}`).not.toThrow();
    checkReport(r, `case ${i} (${st.solveFor})`);
    if (!r.ok) {
      fail++;
      continue;
    }
    ok++;
    // stability: recomputing the solved state gives the same numbers
    const st2 = writeBack(st, r);
    const r2 = def.compute(st2 as any);
    expect(r2.ok, `case ${i} recompute: ${r2.error}`).toBe(true);
    for (const x of r.results) {
      const y = r2.results.find((z) => z.key === x.key);
      if (typeof x.value === 'number' && typeof y?.value === 'number') expect(Math.abs(y.value - x.value), `case ${i} stability ${x.key}`).toBeLessThanOrEqual(1e-6 * Math.max(Math.abs(x.value), 1e-9) + 1e-12);
    }
  }
  return { ok, fail };
}


describe('RT60: ISO 9613-1 air absorption against the published ISO 9613-2 Table 2 (dB/km, 63 Hz – 8 kHz)', () => {
  const table: [number, number, number[]][] = [
    [10, 70, [0.1, 0.4, 1.0, 1.9, 3.7, 9.7, 32.8, 117]],
    [20, 70, [0.1, 0.3, 1.1, 2.8, 5.0, 9.0, 22.9, 76.6]],
    [30, 70, [0.1, 0.3, 1.0, 3.1, 7.4, 12.7, 23.1, 59.3]],
    [15, 20, [0.3, 0.6, 1.2, 2.7, 8.2, 28.2, 88.8, 202]],
    [15, 50, [0.1, 0.5, 1.2, 2.2, 4.2, 10.8, 36.2, 129]],
    [15, 80, [0.1, 0.3, 1.1, 2.4, 4.2, 8.3, 23.7, 82.8]], // 1 kHz computes 4.151: on the rounding edge
  ];
  for (const [t, h, row] of table) {
    it(`${t} °C, ${h} % RH`, () => {
      row.forEach((v, k) => {
        const f = 1000 * 10 ** ((3 * (k - 4)) / 10);
        const got = 1000 * airAttenuation(f, t, h);
        expect(Math.abs(got - v), `${f} Hz: ${got}`).toBeLessThanOrEqual(v >= 100 ? 0.5 : 0.051);
      });
    });
  }
});

describe('RT60: NIOSH Compendium (1980) Example 9 — mean absorption from Table 5 coefficients at 500 Hz', () => {
  // areas in ft² (the ratio is all that matters): before and after treatment
  const before = [[1150, 0.03], [100, 0.55], [1250, 0.06], [1000, 0.05], [100, 0.1], [450, 0.05], [150, 0.18]];
  const after = [[1150, 0.03], [100, 0.55], [1250, 0.9], [1000, 0.95], [100, 0.1], [450, 0.95], [150, 0.18]];
  it('ᾱ = 0.065 before and 0.626 after treatment', () => {
    const c = soundSpeed(20);
    expect(bandRt(1, before.map(([area, alpha]) => ({ area, alpha })), 0, c).abar).toBeCloseTo(0.065, 3);
    expect(bandRt(1, after.map(([area, alpha]) => ({ area, alpha })), 0, c).abar).toBeCloseTo(0.626, 3);
  });
  it('Sabine’s constant: 24 ln10 / c = 0.161 s/m at 20 °C (c = 343.2 m/s)', () => {
    expect(soundSpeed(20)).toBeCloseTo(343.2, 9);
    expect((24 * Math.LN10) / soundSpeed(20)).toBeCloseTo(0.161, 3);
  });
});

describe('RT60: independent Python re-implementation', () => {
  it('classroom (defaults): 6.99365 m² of 25 mm glass fibre for ≤ 0.6 s at 500 Hz–2 kHz (Sabine)', () => {
    const r = run({});
    expect(rel(res(r, 'treatArea'), 6.993647174726191)).toBeLessThan(1e-9);
  });
  it('classroom untreated, Sabine per band', () => {
    const r = run({ solveFor: 'rt60', treatArea: 0 });
    const ref = [0.9267953505161655, 0.9701853039161898, 0.6511786111851795, 0.5558291852731438, 0.5485250906421807, 0.6066650172137926];
    ref.forEach((v, i) => expect(rel(band(r, i).sabine, v), `band ${i}`).toBeLessThan(1e-12));
    expect(rel(res(r, 'tEyringMid'), 0.533711781660209)).toBeLessThan(1e-12);
  });
  it('hard room example: Sabine / Eyring / Millington–Sette per band', () => {
    const r = run(def.examples!.find((e) => e.id === 'hard-room')!.state);
    const ref = [[4.869422754, 4.786239184, 4.217012126], [5.572815005, 5.494564937, 5.138827809], [5.320738506, 5.249040572, 5.099840596], [4.482565836, 4.416375412, 4.380972238], [3.661101822, 3.607277135, 3.600894886], [2.414165788, 2.384165589, 2.381089176]];
    ref.forEach(([s, e, m], i) => {
      expect(band(r, i).sabine).toBeCloseTo(s, 8);
      expect(band(r, i).eyring).toBeCloseTo(e, 8);
      expect(band(r, i).ms).toBeCloseTo(m, 8);
    });
  });
  it('random case (Millington–Sette, 4 kHz target): 79.889 m² of treatment', () => {
    const r = run({ solveFor: 'treatArea', length: 24.26804162525604, width: 8.803134674231911, height: 6.292945978151376, surfaces: [surface('floor', 'audience'), surface('ceiling', 'brick'), surface('walls', 'plasterLath'), surface('floor', 'marble', 'area', 15.287976412827993), surface('walls', 'plywood', 'area', 19.15866955618209), surface('ceiling', 'blockPainted', 'area', 14.258956758356465), surface('walls', 'audience', 'area', 2.7534737147967183)], treatMat: 'gf25', treatOn: 'walls', temp: 32.231012714685676, rh: 85.34705931734617, formula: 'ms', metric: '4000', rt60: 0.31882561774852913 });
    expect(rel(res(r, 'treatArea'), 79.88933735700093)).toBeLessThan(1e-9);
  });
});

describe('RT60: solve round trips', () => {
  const pts: Partial<Rt60State>[] = [
    {},
    { ...def.examples!.find((e) => e.id === 'studio')!.state },
    { formula: 'eyring', metric: 'mid', rt60: 0.45 },
    { formula: 'ms', metric: '1000', rt60: 0.5, treatOn: 'ceiling', treatMat: 'tileHi', surfaces: [surface('floor', 'vinyl'), surface('ceiling', 'plasterSmooth'), surface('walls', 'blockPainted')] },
    { ...def.examples!.find((e) => e.id === 'sports-hall')!.state },
  ];
  for (const [i, p] of pts.entries()) {
    it(`point ${i}: area for the target → RT60 back`, () => {
      const s = run({ ...p, solveFor: 'treatArea' });
      expect(s.ok, s.error).toBe(true);
      const target = (p.rt60 ?? def.defaults().rt60) as number;
      const f = run({ ...p, solveFor: 'rt60', treatArea: res(s, 'treatArea') });
      expect(rel(res(f, 'rt60'), target)).toBeLessThan(1e-9);
    });
  }
});

describe('RT60: physics sanity', () => {
  const c = soundSpeed(20);
  it('Sabine scales with V/A: doubling every dimension (no air) doubles T', () => {
    const t1 = bandRt(100, [{ area: 130, alpha: 0.1 }], 0, c).sabine;
    const t2 = bandRt(800, [{ area: 520, alpha: 0.1 }], 0, c).sabine;
    expect(t2 / t1).toBeCloseTo(2, 12);
  });
  it('Eyring < Sabine; Eyring → Sabine as ᾱ → 0; Millington–Sette = Eyring for uniform α', () => {
    const p = [{ area: 50, alpha: 0.3 }, { area: 50, alpha: 0.3 }];
    const b = bandRt(60, p, 0, c);
    expect(b.eyring).toBeLessThan(b.sabine);
    expect(b.ms).toBeCloseTo(b.eyring, 12);
    const small = bandRt(60, [{ area: 100, alpha: 1e-6 }], 0, c);
    expect(small.eyring / small.sabine).toBeCloseTo(1, 5);
  });
  it('more treatment never lengthens RT60 (absorbent treatment)', () => {
    const a = res(run({ solveFor: 'rt60', treatArea: 5 }), 'rt60');
    const b = res(run({ solveFor: 'rt60', treatArea: 20 }), 'rt60');
    expect(b).toBeLessThan(a);
  });
  it('Schroeder frequency 2000√(T/V) and critical distance √(A/16π) ≈ 0.057√(V/T)', () => {
    expect(schroederFreq(1, 100)).toBeCloseTo(200, 12);
    const v = 500;
    const t = 1.2;
    expect(criticalDistance((24 * Math.LN10 * v) / (c * t)) / Math.sqrt(v / t)).toBeCloseTo(0.0566, 4);
  });
});

describe('RT60: warnings and errors at the limits', () => {
  it('Sabine with ᾱ > 0.3 suggests Eyring', () => expect(run({ solveFor: 'rt60', treatArea: 70, treatMat: 'gf50', formula: 'sabine' }).warnings.some((w) => w.includes('Eyring'))).toBe(true));
  it('bands below the Schroeder frequency', () => expect(run(def.examples!.find((e) => e.id === 'studio')!.state).warnings.some((w) => w.includes('Schroeder'))).toBe(true));
  it('long room: diffuse field doubtful', () => expect(run({ solveFor: 'rt60', length: 80, width: 6, height: 3, treatArea: 0 }).warnings.some((w) => w.includes('diffuse'))).toBe(true));
  it('coefficients ≥ 1 capped inside the logarithms', () => expect(run({ solveFor: 'rt60', formula: 'eyring', treatMat: 'gf50', treatArea: 10 }).notes.some((w) => w.includes('capped'))).toBe(true));
  it('very dry air outside ISO 9613-1’s stated accuracy', () => expect(run({ rh: 5 }).notes.some((w) => w.includes('ISO 9613-1'))).toBe(true));
  it('impossible surface sets are errors with a reason', () => {
    expect(run({ surfaces: [surface('floor', 'vinyl'), surface('ceiling', 'tileFF')] }).error).toMatch(/no material/);
    // two “rest of” items on one boundary share it equally (a note, not an error): see the mode-switch regressions
    expect(run({ surfaces: [surface('floor', 'vinyl'), surface('floor', 'carpet'), surface('ceiling', 'tileFF'), surface('walls', 'gypsum')] }).notes.join(' ')).toMatch(/shared equally/);
    expect(run({ surfaces: [...def.defaults().surfaces, surface('walls', 'glass', 'area', 500)] }).error).toMatch(/more than/);
    expect(run({ solveFor: 'rt60', treatArea: 500 }).error).toMatch(/exceeds/);
    // an unreachable target is clamped at the whole free area with an amber status (not a red error)
    const short = run({ rt60: 0.05 });
    expect(short.ok).toBe(true);
    expect(short.status?.text).toBe('TARGET NOT MET');
  });
  it('a room that already meets the target needs no treatment', () => {
    const r = run({ rt60: 5 });
    expect(res(r, 'treatArea')).toBe(0);
    expect(r.notes.some((n) => n.includes('already meets'))).toBe(true);
  });
  it('editing a coefficient switches the material to Custom (sync)', () => {
    const s = def.defaults();
    s.surfaces[0].a500 = 0.5;
    def.sync!(s);
    expect(s.surfaces[0].material).toBe('custom');
    expect(s.surfaces[1].material).toBe('tileFF');
  });
  it('no warnings for the default classroom', () => expect(run({}).warnings).toEqual([]));
});

describe('RT60: examples and fuzz', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, `${e.id}: ${r.error}`).toBe(true);
      checkReport(r, e.id);
    }
  });
  it('300 unconstrained random states (random surface lists): never throws, finite, stable', () => {
    const { ok, fail } = fuzz(def as CalcDef<any>, 300, 41);
    expect(ok + fail).toBe(300);
  });
  it('300 random rooms with a full set of boundaries: finite and stable', () => {
    const { ok } = fuzz(def as CalcDef<any>, 300, 42, (s) => {
      const extra = (s.surfaces as Rt60State['surfaces']).map((x) => ({ ...x, cover: 'area' as const, area: Math.min(x.area, 3) }));
      s.surfaces = [{ ...extra[0], on: 'floor', cover: 'rest' }, { ...extra[0], on: 'ceiling', cover: 'rest' }, { ...extra[0], on: 'walls', cover: 'rest' }, ...extra.slice(1)];
      s.treatArea = Math.min(s.treatArea, 1);
      s.rt60 = 0.2 + 3 * (s.rt60 / 30);
      for (const k of ['length', 'width', 'height']) s[k] = Math.max(s[k], 3);
    });
    expect(ok).toBeGreaterThan(200);
  });
});

describe('RT60: review fixes', () => {
  const covered = { solveFor: 'rt60' as const, treatArea: 0, surfaces: [surface('floor', 'vinyl'), surface('ceiling', 'tileFF'), surface('walls', 'glass', 'area', 96)] };
  it('BUG: walls fully covered by patches (no free area) — no “NaN %”, a clear note instead', () => {
    const r = run(covered);
    expect(r.ok, r.error).toBe(true);
    checkReport(r, 'covered');
    expect(r.results.find((x) => x.key === 'treatArea')!.note).toMatch(/no free walls area/);
  });
  it('OUT OF RANGE: a 200 × 200 × 50 m room at α 0.01 judged at 125 Hz exceeds the 100 s RT60 input range', () => {
    const custom = (on: 'floor' | 'ceiling' | 'walls') => ({ ...surface(on, 'concrete'), material: 'custom', a125: 0.01, a250: 0.01, a500: 0.01, a1k: 0.01, a2k: 0.01, a4k: 0.01 });
    const r = run({ solveFor: 'rt60', treatArea: 0, length: 200, width: 200, height: 50, metric: '125', surfaces: [custom('floor'), custom('ceiling'), custom('walls')] });
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('OUT OF RANGE');
    // the reviewer's 51.7 s mid-band case is now inside the (raised) 100 s range
    const mid = run({ solveFor: 'rt60', treatArea: 0, length: 200, width: 200, height: 50, metric: 'mid', surfaces: [custom('floor'), custom('ceiling'), custom('walls')] });
    expect(mid.ok).toBe(true);
    expect(res(mid, 'rt60')).toBeGreaterThan(30);
  });
  it('NIT: the “not reachable” text does not suggest the surface already treated', () => {
    const r = run({ ...def.examples!.find((e) => e.id === 'sports-hall')!.state, rt60: 0.2 });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/\((floor or walls)\)/);
  });
  it('NIT: tile names carry the product, not a mismatched NRC', () => {
    expect(def.fields.flatMap((f) => (f.kind === 'section' ? f.fields : [])).some((f) => f.kind === 'select' && f.key === 'treatMat' && f.options.some((o) => typeof o !== 'string' && /NRC 0\.55/.test(o.label)))).toBe(false);
  });
  it('UX: the band graph spans 100 Hz – 5 kHz with a labelled line at each band centre', () => {
    const g = run({}).graphs.find((x) => x.id === 'rt60-bands')!;
    expect(g.xRange).toEqual([100, 5000]);
    expect(g.vlines!.map((v) => v.label)).toEqual(['125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz']);
  });
  it('fuzz: 200 random rooms whose walls are completely covered by patches (free area 0)', () => {
    const { ok } = fuzz(def as CalcDef<any>, 200, 43, (s) => {
      for (const k of ['length', 'width', 'height']) s[k] = Math.max(s[k], 2);
      const walls = 2 * (s.length + s.width) * s.height;
      s.surfaces = [{ ...surface('floor', 'vinyl') }, { ...surface('ceiling', 'tileFF') }, { ...surface('walls', 'glass', 'area', walls / 2) }, { ...surface('walls', 'brick', 'area', walls / 2) }];
      s.treatOn = 'walls';
      s.treatArea = 0;
      s.rt60 = 0.2 + 3 * (s.rt60 / 100);
    });
    expect(ok).toBeGreaterThan(50);
  });
});

describe('mode-switch review (regressions)', () => {
  const find = (key: string) => {
    const walk = (fs: FieldSpec[]): any => {
      for (const f of fs) {
        if ((f as any).key === key && f.kind === 'select') return f;
        const sub = (f as any).fields ? walk((f as any).fields) : null;
        if (sub) return sub;
      }
      return null;
    };
    return walk(def.fields);
  };
  it('a band, material or mount switch that makes the target unreachable clamps at the free area (amber, no red error)', async () => {
    const { runCompute } = await import('@/core/calc/page');
    for (const p of [{ treatOn: 'ceiling' }, { metric: '125' }, { metric: '250' }, { treatMat: 'concrete' }] as Partial<Rt60State>[]) {
      const st: any = { ...def.defaults(), ...p };
      const r = runCompute(def as any, st);
      expect(r.ok, JSON.stringify(p)).toBe(true);
      expect(r.status?.text).toBe('TARGET NOT MET');
      const free = st.treatOn === 'ceiling' ? 63 : 2 * 16 * 3 - 12;
      expect(st.treatArea).toBeCloseTo(free, 9);
      expect(res(r, 'rt60Check')).toBeGreaterThan(st.rt60);
      // feeding the clamped area back in analysis gives the same achieved RT60
      const back = runCompute(def as any, { ...structuredClone(st), solveFor: 'rt60' });
      expect(back.ok).toBe(true);
      expect(res(back, 'rt60')).toBeCloseTo(res(r, 'rt60Check'), 9);
    }
  });
  it('moving a “rest of” surface onto a boundary that has one swaps them (no red error, same set of materials)', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const on = find('on');
    const st: any = def.defaults();
    const before = runCompute(def as any, structuredClone(st));
    st.surfaces[0].on = 'ceiling'; // vinyl floor → ceiling
    on.apply('ceiling', st.surfaces[0], st);
    expect(st.surfaces[1].on).toBe('floor'); // tile ceiling → floor
    const r = runCompute(def as any, st);
    expect(r.ok, r.error).toBe(true);
    expect(before.ok).toBe(true);
  });
  it('switching Covers keeps the numbers: rest → area pre-fills the covered area; area → rest turns the old rest into a patch', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const cover = find('cover');
    const st: any = { ...def.defaults(), solveFor: 'rt60' };
    const t0 = res(runCompute(def as any, structuredClone(st)), 'rt60');
    // floor vinyl (not the treatment surface): rest → area of 63 m²
    st.surfaces[0].cover = 'area';
    cover.apply('area', st.surfaces[0], st);
    expect(st.surfaces[0].area).toBeCloseTo(63, 9);
    expect(res(runCompute(def as any, structuredClone(st)), 'rt60')).toBeCloseTo(t0, 9);
    // glass patch on the walls → rest: the painted-block rest becomes a patch of what it covered
    const st2: any = { ...def.defaults(), solveFor: 'rt60' };
    st2.surfaces[3].cover = 'rest';
    cover.apply('rest', st2.surfaces[3], st2);
    expect(st2.surfaces[2].cover).toBe('area');
    expect(st2.surfaces[2].area).toBeCloseTo(96 - 12 - 10, 9);
    const r2 = runCompute(def as any, st2);
    expect(r2.ok, r2.error).toBe(true);
    expect(res(r2, 'rt60')).toBeCloseTo(t0, 9);
  });
});

describe('mode-switch review: duplicated “rest of” rows', () => {
  it('⧉ on a “rest of” row shares the area equally: identical numbers, a note, no red error', () => {
    for (const i of [0, 1, 2]) {
      const base = def.defaults();
      const dup = def.defaults();
      dup.surfaces.splice(i + 1, 0, structuredClone(dup.surfaces[i]));
      for (const solveFor of ['rt60', 'treatArea'] as const) {
        const a = run({ ...base, solveFor });
        const b = run({ ...dup, solveFor });
        expect(b.ok, b.error).toBe(true);
        expect(b.notes.join(' ')).toMatch(/shared equally/);
        for (const k of ['rt60', 'treatArea', 'tSabineMid', 'tEyringMid']) if (res(a, k) != null) expect(res(b, k)).toBeCloseTo(res(a, k), 9);
      }
    }
  });
  it('two different “rest of” materials split the remaining area 50/50 (Sabine absorption adds up)', () => {
    const two = run({ solveFor: 'rt60', formula: 'sabine', treatArea: 0, surfaces: [surface('floor', 'vinyl'), surface('floor', 'carpet'), surface('ceiling', 'tileFF'), surface('walls', 'gypsum')] });
    const half = run({ solveFor: 'rt60', formula: 'sabine', treatArea: 0, surfaces: [surface('floor', 'vinyl', 'area', 31.5), surface('floor', 'carpet'), surface('ceiling', 'tileFF'), surface('walls', 'gypsum')] });
    expect(two.ok && half.ok).toBe(true);
    expect(res(two, 'rt60')).toBeCloseTo(res(half, 'rt60'), 9);
  });
});

describe('mode-switch review: treatment surface without a “rest of” row', () => {
  it('switching the walls’ “rest of” row to an area while solving keeps the solved treatment (no red error)', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const walk = (fs: FieldSpec[]): any => {
      for (const f of fs) {
        if ((f as any).key === 'cover') return f;
        const sub = (f as any).fields ? walk((f as any).fields) : null;
        if (sub) return sub;
      }
      return null;
    };
    const cover = walk(def.fields);
    const st: any = def.defaults();
    const r0 = runCompute(def as any, st);
    const ta = st.treatArea;
    st.surfaces[2].cover = 'area';
    cover.apply('area', st.surfaces[2], st);
    const r = runCompute(def as any, st);
    expect(r.ok, r.error).toBe(true);
    expect(st.treatArea).toBeCloseTo(ta, 9);
    expect(res(r, 'rt60Check')).toBeCloseTo(res(r0, 'rt60Check'), 9);
    expect(r.status?.text).not.toBe('TARGET NOT MET');
    expect(r.notes.join(' ')).toMatch(/no “rest of” item/);
  });
});

describe('rt60 — the only “rest of” row of a boundary cannot be removed', () => {
  it('canRemove refuses it with a reason and allows patches and shared rows', async () => {
    const { def } = await import('@/calculators/rt60/def');
    const { findField } = await import('@/core/calc/fields');
    const list = findField(def.fields, 'surfaces')!.field as import('@/core/form/form').ListSpec;
    const st = def.defaults() as any;
    const restFloor = st.surfaces.find((x: any) => x.on === 'floor' && x.cover === 'rest');
    expect(typeof list.canRemove!(restFloor, st.surfaces, st)).toBe('string');
    const twin = { ...restFloor };
    st.surfaces.push(twin);
    expect(list.canRemove!(restFloor, st.surfaces, st)).toBe(true);
    const patch = { ...restFloor, cover: 'area', area: 2 };
    expect(list.canRemove!(patch, st.surfaces, st)).toBe(true);
  });
});
