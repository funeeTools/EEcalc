import { describe, expect, it } from 'vitest';
import { def, type AmpState } from '@/calculators/audio-amp-gain/def';
import { maxDissipation, rails, supplyPower } from '@/calculators/audio-amp-gain/model';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const run = (p: Partial<AmpState>) => def.compute({ ...def.defaults(), ...p });
const res = (r: CalcReport, k: string) => {
  const x = r.results.find((y) => y.key === k);
  return (x ? x.value : (r.details as Record<string, unknown>)?.[k]) as number;
};
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
function fuzz(def: CalcDef<any>, n: number, seed: number): { ok: number; fail: number } {
  const rnd = rng(seed);
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < n; i++) {
    const st: Scope = def.defaults();
    randomize(def.fields, st, rnd);
    const opts = def.solve!.options;
    st.solveFor = opts[i % opts.length].key;
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

describe('power amp: LM3886 datasheet (TI SNAS091C) “Design a 40W/4Ω audio amplifier”', () => {
  const lm = def.examples!.find((e) => e.id === 'lm3886-40w')!.state;
  it('Vopeak = 17.9 V, Iopeak = 4.5 A, minimum gain A_V ≥ 12.6 (eq. 7, 8, 10)', () => {
    const r = run(lm);
    expect(r.ok).toBe(true);
    expect(res(r, 'vpk')).toBeCloseTo(17.89, 2);
    expect(res(r, 'ipk')).toBeCloseTo(4.47, 2);
    expect(res(r, 'gain')).toBeCloseTo(12.649, 3);
  });
  it('gain 13 → sensitivity 973 mV and R_i = R_f1/(A_V − 1) = 100k/12 = 8.3 kΩ (8.2 kΩ standard)', () => {
    const r = run({ ...lm, solveFor: 'vin', gainAs: 'vv', gain: 13 });
    expect(res(r, 'vin')).toBeCloseTo(0.97301, 5);
    expect(res(r, 'rg')).toBeCloseTo(100e3 / 12, 6);
    expect(res(r, 'rgStd')).toBe(8.2e3);
  });
  it('eq. 9: max supply = (Vopeak + Vod)(1 + regulation)(1.1); the datasheet’s ±21.0 V → ±26.6 V uses the same factor', () => {
    const r = run(lm);
    expect(res(r, 'rail')).toBeCloseTo(17.8885 + 4, 3);
    expect(res(r, 'railMax') / res(r, 'rail')).toBeCloseTo(1.15 * 1.1, 12);
    expect(21.0 * 1.15 * 1.1).toBeCloseTo(26.6, 1);
  });
  it('“40 W, 8 Ω: gain 20 → 894 mV, gain 200 → 89 mV sensitivity”', () => {
    expect(res(run({ solveFor: 'vin', pout: 40, rl: 8, gainAs: 'vv', gain: 20 }), 'vin')).toBeCloseTo(0.894, 3);
    expect(res(run({ solveFor: 'vin', pout: 40, rl: 8, gainAs: 'vv', gain: 200 }), 'vin')).toBeCloseTo(0.0894, 4);
  });
});

describe('power amp: class B (Sedra & Smith §12.3)', () => {
  it('ideal stage with no dropout: η = π/4 at full swing, P_D,max = 2V²/(π²R) at V_p = 2V/π', () => {
    const vs = 30;
    const r = 8;
    expect((vs * vs) / (2 * r) / supplyPower(vs, r, 2 * vs, 'se')).toBeCloseTo(Math.PI / 4, 12);
    const m = maxDissipation(r, 2 * vs, 'se');
    expect(m.pd).toBeCloseTo((2 * vs * vs) / (Math.PI ** 2 * r), 12);
    expect(m.vpAt).toBeCloseTo((2 * vs) / Math.PI, 12);
  });
  it('the dissipation maximum is capped at clipping when the dropout is large (found by the Python check)', () => {
    const m = maxDissipation(8, 2 * 30, 'se', 10);
    expect(m.vpAt).toBe(10);
    expect(m.pd).toBeCloseTo(supplyPower(10, 8, 60, 'se') - 100 / 16, 12);
  });
});

describe('power amp: independent Python re-implementation (numerical supply integration)', () => {
  it('defaults: gain 23.0393 V/V, ±44.0 V loaded, ±55.66 V high line, P_S 140.056 W', () => {
    const r = run({});
    expect(rel(res(r, 'gain'), 23.03930469302397)).toBeLessThan(1e-12);
    expect(res(r, 'rail')).toBeCloseTo(44, 12);
    expect(res(r, 'railMax')).toBeCloseTo(55.66, 10);
    expect(rel(res(r, 'ps'), 140.0563504968278)).toBeLessThan(1e-8);
  });
  it('car BTL on 14.4 V, 1.5 V dropout, 4 Ω: 16.245 W clean', () => {
    const r = run(def.examples!.find((e) => e.id === 'car-btl')!.state);
    expect(rel(res(r, 'pAvail'), 16.244999999999997)).toBeLessThan(1e-9);
  });
  it('random case (BTL, split, large dropout): P_D,max 1.8857 W, P_prog 57.15 mW', () => {
    const r = run({ solveFor: 'gain', pout: 0.2672686915195315, rl: 168.33398947895398, topology: 'btl', supply: 'split', vdrop: 25.264191028980022, reg: 58.90022579825517, highLine: 1.7262915075670793, cf: 9.709598941722707, rf: 970557.4280670586, vinAs: 'dbu', vinDbu: 41.06470764589795 });
    expect(rel(res(r, 'gain'), 0.076603558461068)).toBeLessThan(1e-10);
    expect(rel(res(r, 'rail'), 30.0071017969738)).toBeLessThan(1e-12);
    expect(rel(res(r, 'railMax'), 48.50447164999251)).toBeLessThan(1e-12);
    expect(rel(res(r, 'ps'), 2.152966664469185)).toBeLessThan(1e-7);
    expect(rel(res(r, 'pdMax'), 1.885697972949652)).toBeLessThan(1e-7);
    expect(rel(res(r, 'pProg'), 0.057150257162232834)).toBeLessThan(1e-10);
  });
});

describe('power amp: solve round trips', () => {
  const points: Partial<AmpState>[] = [
    { pout: 100, rl: 8, topology: 'se', supply: 'split', vinAs: 'v', vin: 1.228, gainAs: 'vv' },
    { pout: 16, rl: 4, topology: 'btl', supply: 'single', vinAs: 'dbv', vinDbv: -10, gainAs: 'db' },
    { pout: 0.05, rl: 32, topology: 'se', supply: 'single', vinAs: 'dbu', vinDbu: -20, gainAs: 'vv' },
    { pout: 2500, rl: 2, topology: 'btl', supply: 'split', vinAs: 'v', vin: 3.1, gainAs: 'db' },
  ];
  for (const [i, p] of points.entries()) {
    it(`point ${i}: gain → power → sensitivity all reproduce`, () => {
      const g = run({ ...p, solveFor: 'gain' });
      const a = res(g, 'gain');
      const fw = run({ ...p, solveFor: 'pout', gainAs: 'vv', gain: a });
      expect(rel(res(fw, 'pout'), p.pout!)).toBeLessThan(1e-12);
      const back = run({ ...p, solveFor: 'vin', gainAs: 'db', gainDb: res(g, 'gainDb') });
      expect(rel(res(back, 'vin'), res(g, 'vin'))).toBeLessThan(1e-12);
    });
  }
});

describe('power amp: physics sanity', () => {
  const z = { vdrop: 0, reg: 0, highLine: 0 };
  it('rail scales with √(P·R): doubling R at fixed P raises it √2', () => {
    expect(res(run({ ...z, rl: 16 }), 'rail') / res(run({ ...z, rl: 8 }), 'rail')).toBeCloseTo(Math.SQRT2, 12);
  });
  it('a bridge needs half the split rails of a single-ended stage for the same power, and each half sees R/2', () => {
    const se = run({ ...z, topology: 'se' });
    const btl = run({ ...z, topology: 'btl' });
    expect(res(btl, 'rail') / res(se, 'rail')).toBeCloseTo(0.5, 12);
    expect(res(btl, 'rHalf')).toBe(4);
    expect(res(btl, 'aHalf')).toBeCloseTo(res(btl, 'gain') / 2, 12);
  });
  it('quadrupling the power doubles the gain (+6.02 dB)', () => {
    expect(res(run({ pout: 400 }), 'gainDb') - res(run({ pout: 100 }), 'gainDb')).toBeCloseTo(6.0206, 4);
  });
  it('sine crest factor (3.01 dB) gives back the rated power; 20 dB of crest factor leaves 2 % of it', () => {
    expect(res(run({ cf: 20 * Math.log10(Math.SQRT2) }), 'pProg')).toBeCloseTo(100, 9);
    expect(res(run({ cf: 20 }), 'pProg')).toBeCloseTo(2, 9);
  });
  it('rails() table: SE split ±(V_pk+V_od), SE single 2(V_pk+V_od), BTL single V_pk+2V_od, BTL split ±(V_pk+2V_od)/2', () => {
    expect(rails(40, 4, 'se', 'split').rail).toBe(44);
    expect(rails(40, 4, 'se', 'single').rail).toBe(88);
    expect(rails(40, 4, 'btl', 'single').rail).toBe(48);
    expect(rails(40, 4, 'btl', 'split').rail).toBe(24);
  });
});

describe('power amp: warnings at the limits', () => {
  it('available rail too low', () => expect(run(def.examples!.find((e) => e.id === 'rail-short')!.state).warnings.some((w) => w.includes('clips at'))).toBe(true));
  it('gain < 1', () => expect(run({ vinAs: 'v', vin: 50 }).warnings.some((w) => w.includes('below the 1 V/V'))).toBe(true));
  it('gain > 200 per stage (LM3886 range)', () => expect(run({ vinAs: 'v', vin: 0.05 }).warnings.some((w) => w.includes('20–200'))).toBe(true));
  it('sensitivity above +24 dBu', () => expect(run({ solveFor: 'vin', gainAs: 'vv', gain: 2 }).warnings.some((w) => w.includes('+24 dBu'))).toBe(true));
  it('microphone-level sensitivity', () => expect(run({ vinAs: 'dbu', vinDbu: -50 }).warnings.some((w) => w.includes('microphone-level'))).toBe(true));
  it('load below 2 Ω, and R/2 below 2 Ω in a bridge', () => {
    expect(run({ rl: 1.5 }).warnings.some((w) => w.includes('below what most amplifiers'))).toBe(true);
    expect(run({ rl: 3, topology: 'btl' }).warnings.some((w) => w.includes('R_L/2'))).toBe(true);
  });
  it('no warnings for the default design', () => expect(run({}).warnings).toEqual([]));
  it('bad inputs come back as errors, not exceptions', () => {
    expect(run({ rl: 0 }).ok).toBe(false);
    expect(run({ vinAs: 'v', vin: 0 }).ok).toBe(false);
    expect(run({ vsup: -1 }).ok).toBe(false);
    expect(run({ pout: Number.NaN }).ok).toBe(false);
  });
});

describe('power amp: examples and fuzz', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      checkReport(r, e.id);
    }
  });
  it('400 random states: never throws, finite, stable', () => {
    const { ok } = fuzz(def as CalcDef<any>, 400, 11);
    expect(ok).toBeGreaterThan(200); // the rest solve outside an input's range and say so
  });
  it('compute is fast (< 5 ms average)', () => {
    const t = performance.now();
    for (let i = 0; i < 100; i++) run({ pout: 50 + i });
    expect((performance.now() - t) / 100).toBeLessThan(5);
  });
});

describe('power amp: review fixes', () => {
  it('BUG: BTL with 1.5 V/V total needs 0.75 V/V per half — no follower, an attenuator and a warning', () => {
    const r = run({ solveFor: 'vin', topology: 'btl', gainAs: 'vv', gain: 1.5 });
    expect(r.ok).toBe(true);
    expect(res(r, 'aHalf')).toBeCloseTo(0.75, 12);
    expect(r.results.find((x) => x.key === 'rg')!.display).toMatch(/stage gain < 1/);
    expect(res(r, 'atten')).toBeCloseTo(20 * Math.log10(0.75), 9);
    expect(r.warnings.some((w) => w.includes('below the 1 V/V'))).toBe(true);
  });
  it('UX: with an available rail, P_D,max and the dissipation graph use those rails (±35 V, clipped at 31 V peak)', () => {
    const r = run(def.examples!.find((e) => e.id === 'rail-short')!.state);
    expect(res(r, 'pdMax')).toBeCloseTo(maxDissipation(8, 70, 'se', 31).pd, 9);
    expect(res(r, 'ps')).toBeCloseTo(supplyPower(31, 8, 70, 'se'), 9);
    const g = r.graphs.find((x) => x.id === 'dissipation')!;
    expect(g.subtitle).toMatch(/available ±35 V/);
    expect(Math.max(...g.series![0].x)).toBeCloseTo((31 * 31) / 16, 9);
  });
  it('OUT OF RANGE: solved gain, sensitivity and power outside their inputs’ limits return ok:false', () => {
    const g = run({ solveFor: 'gain', pout: 1e5, rl: 1e4, vinAs: 'v', vin: 1e-6 });
    expect(g.ok).toBe(false);
    expect(g.status?.text).toBe('OUT OF RANGE');
    expect(g.error).toMatch(/outside the range/);
    expect(run({ solveFor: 'vin', gainAs: 'vv', gain: 1e-3 }).status?.text).toBe('OUT OF RANGE');
    expect(run({ solveFor: 'pout', vinAs: 'v', vin: 1000, gainAs: 'vv', gain: 1e6 }).status?.text).toBe('OUT OF RANGE');
  });
  it('paired forms keep consistent limits: V 1 µV … 1 kV ↔ dBu −117.8 … +62.2 ↔ dBV −120 … +60', () => {
    const num = def.fields.flatMap((f) => (f.kind === 'section' ? f.fields : [])).filter((f) => f.kind === 'number') as { key: string; min?: number; max?: number }[];
    const lim = (k: string) => num.find((f) => f.key === k)!;
    expect(lim('vinDbu').min).toBeCloseTo(20 * Math.log10(1e-6 / Math.sqrt(0.6)), 12);
    expect(lim('vinDbu').max).toBeCloseTo(20 * Math.log10(1000 / Math.sqrt(0.6)), 12);
    expect([lim('vinDbv').min, lim('vinDbv').max, lim('vin').min, lim('vin').max]).toEqual([-120, 60, 1e-6, 1000]);
    expect(run({ solveFor: 'vin', gainAs: 'db', gainDb: -20, pout: 1e5, rl: 1 }).status?.text).toBe('OUT OF RANGE'); // needs 3.16 kV in
  });
});

describe('power amp: second review', () => {
  it('worst-case dissipation covers every level up to the rail’s clip: 10 W / 8 Ω on ±60 V → 2V²/(π²R) = 91.2 W', () => {
    const r = run({ solveFor: 'gain', pout: 10, rl: 8, topology: 'se', supply: 'split', vsup: 60, vdrop: 4 });
    expect(r.ok).toBe(true);
    expect(res(r, 'pdMax')).toBeCloseTo((2 * 60 * 60) / (Math.PI ** 2 * 8), 9);
    expect(res(r, 'pdMax')).toBeCloseTo(91.19, 2);
    // dissipation at the rated 10 W is still reported separately and is much lower
    expect(r.results.find((x) => x.key === 'pdRated')!.label).toBe('Dissipation at rated output');
    expect(res(r, 'pdRated')).toBeCloseTo(supplyPower(Math.sqrt(160), 8, 120, 'se') - 10, 9);
    const g = r.graphs.find((x) => x.id === 'dissipation')!;
    expect(Math.max(...g.series![0].x)).toBeCloseTo((56 * 56) / 16, 9); // drive up to the 56 V clip level
  });
  it('the LM3886 example label notes ±21.9 V against the datasheet’s printed ±21.0 V', () => {
    expect(def.examples!.find((e) => e.id === 'lm3886-40w')!.label).toMatch(/±21\.9 V; datasheet prints ±21\.0 V/);
  });
});
