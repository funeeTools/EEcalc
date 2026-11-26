import { describe, expect, it } from 'vitest';
import { def, type LvdtState } from '@/calculators/lvdt/def';
import { K_AVG, MV_V_MIL, adcCode, demodGain } from '@/calculators/lvdt/model';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const run = (p: Partial<LvdtState>) => def.compute({ ...def.defaults(), ...p });
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

describe('LVDT: published examples', () => {
  it('Azimi, Quality Magazine 2025 (generic example): 192 mV/V/mm × 5 V × 1 mm = 960 mV', () => {
    const r = run(def.examples!.find((e) => e.id === 'probe-192')!.state);
    expect(res(r, 'vout')).toBeCloseTo(0.96, 12);
  });
  it('MEAS E-100 datasheet: 2.4 mV/V/mil at 3 V rms over ±0.100 in → 720 mV full-scale output', () => {
    const r = run(def.examples!.find((e) => e.id === 'e100')!.state);
    expect(res(r, 'fso')).toBeCloseTo(0.72, 12);
    expect(res(r, 'vout')).toBeCloseTo(0.72, 12);
    expect(res(r, 'sensMil')).toBeCloseTo(2.4, 12);
    expect(2.4 * MV_V_MIL).toBeCloseTo(94.488, 3); // mV/V/mm
  });
  it('synchronous averaging demodulator: DC = 2√2/π · V_rms = 0.9003 (full-wave average of a sine)', () => {
    expect(K_AVG).toBeCloseTo(0.900316, 6);
    expect(demodGain('avg', Math.PI / 3)).toBeCloseTo(0.900316 / 2, 6);
  });
});

describe('LVDT: independent Python re-implementation (numerical demodulator average)', () => {
  it('defaults: 648.228 mV DC at the ADC, code 8496, 1.17696 µm/LSB, noise 1.6667 µm', () => {
    const r = run({});
    expect(rel(res(r, 'vdc'), 0.648227747659785)).toBeLessThan(1e-9);
    expect(res(r, 'code')).toBe(8496);
    expect(rel(res(r, 'dxQ'), 1.176962041318571e-6)).toBeLessThan(1e-9);
    expect(rel(res(r, 'dxN'), 1.6666666666666669e-6)).toBeLessThan(1e-12);
  });
  it('15° phase error: k_d = 0.869639', () => {
    expect(rel(res(run({ phase: 15 }), 'kd'), 0.8696387816413494)).toBeLessThan(1e-9);
  });
  it('random case (solve x, rms demod, −9.2°): x 2.18703 mm, V_DC 0.35982 V, 8.2495 nm/LSB', () => {
    const r = run({ solveFor: 'x', sens: 43.794382641691335, fs: 0.010448041246382614, lin: 5.008207556732556, vex: 77.14070418496698, fex: 127732.66637944063, vout: 7.388513014273021, demod: 'rms', phase: -9.219024813134794, gain: 0.049337178409875136, bits: 15, vref: 0.02223698183913206, noise: 0 });
    expect(rel(res(r, 'x'), 0.0021870314836275216)).toBeLessThan(1e-12);
    expect(rel(res(r, 'vdc'), 0.35981981638925264)).toBeLessThan(1e-9);
    expect(rel(res(r, 'dxQ'), 8.249466428317717e-9)).toBeLessThan(1e-9);
    expect(rel(res(r, 'fill'), 77.30170617949298)).toBeLessThan(1e-9);
  });
  it('random case (solve S from a calibration point at −60°): S = 0.0166322 mV/V/mm', () => {
    const r = run({ solveFor: 'sens', fs: 0.01889157889587773, lin: 7.779492525262926, vex: 0.008964521315756292, x: -0.009253794205650577, vout: -1.3797376196188345e-6, demod: 'avg', phase: -59.782290432659636, gain: 0.00833237184360867, bits: 15, vref: 1.9489331285756553, noise: 0 });
    expect(rel(res(r, 'sens'), 0.016632194864049776)).toBeLessThan(1e-12);
    expect(rel(res(r, 'kd'), 0.45311755506066176)).toBeLessThan(1e-8);
  });
});

describe('LVDT: solve round trips', () => {
  const pts: Partial<LvdtState>[] = [
    {},
    { sens: 192, fs: 2e-3, vex: 5, x: -1.7e-3 },
    { sens: 0.35, fs: 0.25, vex: 7, x: 0.2 },
    { sens: 2.4 * MV_V_MIL, fs: 2.54e-3, vex: 3, x: 1e-4 },
  ];
  for (const [i, p] of pts.entries()) {
    it(`point ${i}: V_out → x → S`, () => {
      const f = run({ ...p, solveFor: 'vout' });
      const vo = res(f, 'vout');
      const x = res(run({ ...p, solveFor: 'x', vout: vo }), 'x');
      expect(rel(x, (p.x ?? def.defaults().x) as number)).toBeLessThan(1e-12);
      const s = res(run({ ...p, solveFor: 'sens', vout: vo }), 'sens');
      expect(rel(s, (p.sens ?? def.defaults().sens) as number)).toBeLessThan(1e-12);
    });
  }
});

describe('LVDT: physics sanity', () => {
  it('output is ratiometric: doubling V_ex doubles V_out; negative x gives antiphase', () => {
    expect(res(run({ vex: 6 }), 'vout') / res(run({ vex: 3 }), 'vout')).toBeCloseTo(2, 12);
    expect(res(run({ x: -0.01 }), 'vout')).toBeCloseTo(-res(run({ x: 0.01 }), 'vout'), 15);
  });
  it('one more ADC bit halves the quantisation step', () => {
    expect(res(run({ bits: 17 }), 'dxQ') / res(run({ bits: 16 }), 'dxQ')).toBeCloseTo(0.5, 12);
  });
  it('gain for full range maps ±FS exactly onto ±V_ref', () => {
    const g = res(run({}), 'gainFull');
    expect(res(run({ gain: g }), 'fill')).toBeCloseTo(1, 12);
  });
  it('ADC codes clamp at the converter limits', () => {
    expect(adcCode(10, 1, 12)).toEqual({ lsb: 2 / 4096, code: 2047, clipped: true });
    expect(adcCode(-10, 1, 12).code).toBe(-2048);
  });
});

describe('LVDT: warnings at the limits', () => {
  it('core beyond the rated range (forward and from a reading)', () => {
    expect(run({ x: 0.03 }).warnings.some((w) => w.includes('no longer linear'))).toBe(true);
    expect(run({ solveFor: 'x', vout: 0.4 }).warnings.some((w) => w.includes('beyond the rated'))).toBe(true);
  });
  it('ADC clipping and an under-used ADC', () => {
    expect(run({ gain: 12 }).warnings.some((w) => w.includes('clip'))).toBe(true);
    expect(run({ gain: 1 }).warnings.some((w) => w.includes('wasting'))).toBe(true);
  });
  it('phase error above ~8° (1 % loss)', () => expect(run({ phase: 10 }).warnings.some((w) => w.includes('phase error'))).toBe(true));
  it('calibration point too near null', () => expect(run({ solveFor: 'sens', x: 1e-3, vout: 0.012 }).warnings.some((w) => w.includes('null'))).toBe(true));
  it('impossible calibration and bad inputs return errors', () => {
    expect(run({ solveFor: 'sens', x: 0 }).ok).toBe(false);
    expect(run({ solveFor: 'sens', x: 0.01, vout: -0.1 }).ok).toBe(false);
    expect(run({ phase: 90 }).ok).toBe(false);
    expect(run({ vex: 0 }).ok).toBe(false);
  });
  it('no warnings for the default design', () => expect(run({}).warnings).toEqual([]));
});

describe('LVDT: examples and fuzz', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      checkReport(r, e.id);
    }
  });
  it('400 random states: never throws, finite, stable', () => {
    const { ok } = fuzz(def as CalcDef<any>, 400, 21);
    expect(ok).toBeGreaterThan(150); // random solves often land outside the S or x input range; those return OUT OF RANGE
  });
});

describe('LVDT: review fixes', () => {
  it('UX: a zero calibration reading says the sensitivity cannot be determined', () => {
    const r = run({ solveFor: 'sens', x: 0.01, vout: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/0 V/);
    expect(r.error).not.toMatch(/opposite signs/);
  });
  it('OUT OF RANGE: solved S = 1e12 and x = 10 Gm are refused', () => {
    const s = run({ solveFor: 'sens', vex: 1e-3, x: 1e-6, vout: 1000 });
    expect(s.status?.text).toBe('OUT OF RANGE');
    const x = run({ solveFor: 'x', sens: 1e-4, vex: 1e-3, vout: 1000 });
    expect(x.status?.text).toBe('OUT OF RANGE');
    expect(run({ solveFor: 'vout', x: 2, sens: 1e4, vex: 100 }).status?.text).toBe('OUT OF RANGE');
  });
  it('NIT: sensitivity unit keys are short (/mm, /mil, /in) and the label carries the mV/V', () => {
    const f = def.fields.flatMap((x) => (x.kind === 'section' ? x.fields : [])).find((x) => x.kind === 'number' && x.key === 'sens');
    expect(Object.keys((f as { units: Record<string, number> }).units)).toEqual(['/mm', '/mil', '/in']);
    expect(run(def.examples!.find((e) => e.id === 'e100')!.state).results.find((x) => x.key === 'sens')?.display ?? res(run({}), 'sens')).toBeDefined();
    expect(run({ solveFor: 'sens', x: 0.01, vout: 0.12 }).results[0].display).toBe('4.000 mV/V/mm');
  });
  it('NIT: the linearity band is shown in its own error-vs-position graph (not as near-invisible lines)', () => {
    const r = run({});
    expect(r.graphs.find((g) => g.id === 'output-vs-x')!.series!.some((s) => /FS band/.test(s.label))).toBe(false);
    const e = r.graphs.find((g) => g.id === 'error-budget')!;
    expect(e.series![0].y[0]).toBeCloseTo(0.0025 * 0.025, 12);
  });
  it('NIT: the 192 mV/V/mm example is credited as a generic example (Azimi, Quality 2025)', () => {
    expect(def.examples!.find((e) => e.id === 'probe-192')!.label).toMatch(/Azimi/);
  });
});

describe('LVDT: second review', () => {
  it('the sensitivity refusal states its limits in mV/V/mm (solve S with x = 20 mm, V_out = 1 nV)', () => {
    const r = run({ solveFor: 'sens', x: 20e-3, vout: 1e-9 });
    expect(r.status?.text).toBe('OUT OF RANGE');
    expect(r.error).toMatch(/0\.0001 mV\/V\/mm … 10000 mV\/V\/mm/);
    expect(r.error).not.toMatch(/\d mm …/);
  });
  it('the row reads “Sens. (mV/V)” with a /mm, /mil or /in dropdown, and old saved unit keys fall back to /mm', () => {
    const f = def.fields.flatMap((x) => (x.kind === 'section' ? x.fields : [])).find((x) => x.kind === 'number' && x.key === 'sens')!;
    expect((f as { label: string }).label).toBe('Sens. (mV/V)');
    expect(run({ solveFor: 'sens', x: 0.01, vout: 0.12, sensUnit: 'mV/V/mm' }).results[0].display).toBe('4.000 mV/V/mm');
    expect(run({ solveFor: 'sens', x: 0.01, vout: 0.12, sensUnit: '/mil' }).results[0].display).toBe(`${(4 / MV_V_MIL).toPrecision(4)} mV/V/mil`);
  });
});
