import { describe, expect, it } from 'vitest';
import { def, type SnrState } from '@/calculators/audio-snr/def';
import { idealDr, johnson2, noiseBandwidth, p2dbu, quantNoise, weightDb } from '@/calculators/audio-snr/model';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const run = (p: Partial<SnrState>) => def.compute({ ...def.defaults(), ...p });
const res = (r: CalcReport, k: string) => {
  const x = r.results.find((y) => y.key === k);
  return (x ? x.value : (r.details as Record<string, unknown>)?.[k]) as number;
};

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

// IEC 61672-1:2013 Table 3, nominal frequencies 10 Hz … 20 kHz (exact frequencies 1000·10^(n/10), n = −20 … 13)
const TABLE_A = [-70.4, -63.4, -56.7, -50.5, -44.7, -39.4, -34.6, -30.2, -26.2, -22.5, -19.1, -16.1, -13.4, -10.9, -8.6, -6.6, -4.8, -3.2, -1.9, -0.8, 0, 0.6, 1.0, 1.2, 1.3, 1.2, 1.0, 0.5, -0.1, -1.1, -2.5, -4.3, -6.6, -9.3];
const TABLE_C = [-14.3, -11.2, -8.5, -6.2, -4.4, -3.0, -2.0, -1.3, -0.8, -0.5, -0.3, -0.2, -0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.1, -0.2, -0.3, -0.5, -0.8, -1.3, -2.0, -3.0, -4.4, -6.2, -8.5, -11.2];

describe('audio SNR: IEC 61672-1 weightings', () => {
  it('Table 3: A- and C-weighting at all 34 frequencies 10 Hz – 20 kHz, within the table’s 0.1 dB rounding', () => {
    for (let n = -20; n <= 13; n++) {
      const f = 1000 * 10 ** (n / 10);
      expect(Math.abs(weightDb('A', f) - TABLE_A[n + 20]), `A @ ${f}`).toBeLessThanOrEqual(0.0501);
      expect(Math.abs(weightDb('C', f) - TABLE_C[n + 20]), `C @ ${f}`).toBeLessThanOrEqual(0.0501);
    }
  });
  it('both are 0 dB at 1 kHz (normalisation constants A1000 = −2.000, C1000 = −0.062 dB)', () => {
    expect(Math.abs(weightDb('A', 1000))).toBeLessThan(5e-4);
    expect(Math.abs(weightDb('C', 1000))).toBeLessThan(2e-4);
  });
});

describe('audio SNR: published values', () => {
  it('Johnson noise of 150 Ω over 20 kHz at room temperature: −130.9 dBu (Sound On Sound; the EIN floor of a mic preamp)', () => {
    const r = run(def.examples!.find((e) => e.id === 'johnson-150')!.state);
    expect(res(r, 'ein')).toBeCloseTo(-130.9, 1);
  });
  it('ideal converter: 16 bits 98.09 dB, 24 bits 146.26 dB (6.02N + 1.76, Kester MT-001)', () => {
    expect(idealDr(16)).toBeCloseTo(98.09, 2);
    expect(idealDr(24)).toBeCloseTo(146.26, 2);
  });
  it('TPDF dither adds 4.77 dB of noise (Lipshitz–Wannamaker–Vanderkooy 1992)', () => {
    expect(10 * Math.log10(quantNoise(0, 16, 'tpdf') / quantNoise(0, 16, 'none'))).toBeCloseTo(4.771, 3);
  });
});

describe('audio SNR: independent Python re-implementation (Annex E poles, Gauss–Legendre bandwidth)', () => {
  it('A-weighted noise bandwidth 20 Hz – 20 kHz = 12468.17 Hz (−2.048 dB vs unweighted); C = 9027.25 Hz', () => {
    expect(noiseBandwidth('A', 20, 20e3) / 12468.17269644061 - 1).toBeLessThan(2e-8);
    expect(Math.abs(noiseBandwidth('C', 20, 20e3) / 9027.249162711185 - 1)).toBeLessThan(2e-8);
  });
  it('defaults (mic pre): SNR 76.99997 dB, DR 94.99997 dB', () => {
    const r = run({});
    expect(res(r, 'snr')).toBeCloseTo(76.99997292078012, 7);
    expect(res(r, 'dr')).toBeCloseTo(94.99997292078012, 7);
  });
  it('16-bit CD output, TPDF, A-weighted with 5 nV/√Hz + 1 kΩ: 95.7932 dB', () => {
    expect(res(run(def.examples!.find((e) => e.id === 'cd-16bit')!.state), 'snr')).toBeCloseTo(95.79322565209175, 6);
  });
  it('random case (solve EIN, C-weighted, −19 °C): EIN −99.00776 dBu, e_n 94.209 nV/√Hz', () => {
    const r = run({ solveFor: 'noise', weighting: 'C', flo: 24.6043706652513, fhi: 15060.272488338962, adc: false, lmax: 12.029473100662429, gainDb: 4.352409663895374, rs: 1268.0620898976385, temp: -19.06487773145616, noiseAs: 'ein', sigAs: 'dbu', sigDbu: -32.46677633970387, snr: 62.188570807531896 });
    expect(res(r, 'ein')).toBeCloseTo(-99.00775681113115, 6);
    expect(res(r, 'en') / 9.420933635553522e-8 - 1).toBeLessThan(1e-7);
  });
  it('random case (solve bits, A-weighted, 313 kHz): 14 bits, 66.8649 dB', () => {
    const r = run({ solveFor: 'bits', weighting: 'A', flo: 17.86470323218286, fhi: 34201.22649940612, adc: true, fsamp: 313291.511986441, lmax: 18.70858783599123, gainDb: 40.787934317317884, rs: 155.88118327722907, temp: 54.23054137415039, dither: 'none', noiseAs: 'en', en: 3.1379651748559632e-9, sigAs: 'dbu', sigDbu: -10.370387033033495, snr: 62.62491313969195 });
    expect(res(r, 'bits')).toBe(14);
    expect(res(r, 'snrCheck')).toBeCloseTo(66.86491908079334, 6);
  });
});

describe('audio SNR: solve round trips', () => {
  const pts: Partial<SnrState>[] = [
    {},
    { weighting: 'A', noiseAs: 'en', en: 4e-9, rs: 600, gainDb: 20, sigAs: 'dbv', sigDbv: -10, lmax: 18, bits: 16, dither: 'tpdf' },
    { weighting: 'C', noiseAs: 'ein', ein: -110, gainDb: 0, sigAs: 'dbfs', sigDbfs: -20, lmax: 24, adc: false },
    { weighting: 'none', noiseAs: 'en', en: 1e-9, rs: 200, gainDb: 60, sigAs: 'dbu', sigDbu: 4, lmax: 24, bits: 20, fsamp: 96e3, fhi: 40e3 },
  ];
  for (const [i, p] of pts.entries()) {
    it(`point ${i}: SNR → signal, → input noise, → bits`, () => {
      const a = run({ ...p, solveFor: 'snr' });
      const snr = res(a, 'snr');
      const sig = run({ ...p, solveFor: 'sig', snr });
      expect(res(sig, 'sigDbu')).toBeCloseTo(res(a, 'sigDbu'), 9);
      const nz = run({ ...p, solveFor: 'noise', snr });
      expect(res(nz, 'ein')).toBeCloseTo(res(a, 'ein'), 8);
      if (p.adc !== false) {
        const b = run({ ...p, solveFor: 'bits', snr: snr - 0.01 });
        const n = res(b, 'bits');
        expect(res(run({ ...p, solveFor: 'snr', bits: n }), 'snr')).toBeGreaterThanOrEqual(snr - 0.01 - 1e-9);
        if (n > 1) expect(res(run({ ...p, solveFor: 'snr', bits: n - 1 }), 'snr')).toBeLessThan(snr - 0.01);
      }
    });
  }
});

describe('audio SNR: physics sanity', () => {
  const quiet = { adc: false, noiseAs: 'en' as const, rs: 0, en: 5e-9 };
  it('doubling the bandwidth (white noise) costs 3.01 dB', () => {
    const a = res(run({ ...quiet, flo: 10, fhi: 10010 }), 'snr');
    const b = res(run({ ...quiet, flo: 10, fhi: 20010 }), 'snr');
    expect(a - b).toBeCloseTo(3.0103, 4);
  });
  it('Johnson noise rises 3 dB per doubling of R_s and of absolute temperature', () => {
    expect(10 * Math.log10(johnson2(300, 25) / johnson2(150, 25))).toBeCloseTo(3.0103, 4);
    expect(p2dbu(johnson2(1, 2 * 298.15 - 273.15)) - p2dbu(johnson2(1, 25))).toBeCloseTo(3.0103, 4);
  });
  it('input-referred noise: 20 dB more gain at the same output level costs exactly 20 dB of SNR', () => {
    expect(res(run({ adc: false, gainDb: 20, sigDbu: 0 }), 'snr') - res(run({ adc: false, gainDb: 40, sigDbu: 0 }), 'snr')).toBeCloseTo(20, 9);
  });
  it('one more bit buys 6.02 dB when quantisation dominates', () => {
    const p = { noiseAs: 'en' as const, en: 0, rs: 0, sigAs: 'dbfs' as const, sigDbfs: 0, bits: 12 };
    expect(res(run({ ...p, bits: 13 }), 'snr') - res(run(p), 'snr')).toBeCloseTo(6.0206, 4);
  });
});

describe('audio SNR: warnings and errors at the limits', () => {
  it('signal above the clip level', () => expect(run({ sigDbu: 20 }).warnings.some((w) => w.includes('clips'))).toBe(true));
  it('signal below one LSB', () => expect(run({ sigAs: 'dbfs', sigDbfs: -160, noiseAs: 'en', en: 0, rs: 0 }).warnings.some((w) => w.includes('below one LSB'))).toBe(true));
  it('weighting outside IEC 61672-1’s 10 Hz – 20 kHz table', () => expect(run({ weighting: 'A', fhi: 22e3 }).notes.some((w) => w.includes('extrapolation'))).toBe(true));
  it('EIN below the thermal noise of R_s is rejected', () => {
    const r = run({ ein: -135 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/below the thermal noise/);
  });
  it('band above fs/2, bits solve without a converter, unreachable targets', () => {
    expect(run({ fhi: 30e3 }).ok).toBe(false);
    expect(run({ solveFor: 'bits', adc: false }).ok).toBe(false);
    expect(run({ solveFor: 'bits', snr: 120 }).error).toMatch(/analog noise alone/);
    expect(run({ solveFor: 'noise', snr: 200, sigAs: 'dbfs', sigDbfs: 0, bits: 16 }).error).toMatch(/converter alone/);
    expect(run({ solveFor: 'noise', snr: 140, adc: false }).error).toMatch(/thermal noise/);
  });
  it('no warnings for the default design', () => expect(run({}).warnings).toEqual([]));
});

describe('audio SNR: examples and fuzz', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, `${e.id}: ${r.error}`).toBe(true);
      checkReport(r, e.id);
    }
  });
  it('400 unconstrained random states: never throws, errors carry a message, results finite and stable', () => {
    const { ok, fail } = fuzz(def as CalcDef<any>, 400, 31);
    expect(ok + fail).toBe(400);
    expect(ok).toBeGreaterThan(5); // unconstrained draws are mostly unreachable or out of range, each with a reason
  });
  it('400 random states in plausible ranges (consistent band, R_s ≤ 10 kΩ, target 0–140 dB): finite and stable', () => {
    const { ok } = fuzz(def as CalcDef<any>, 400, 32, (s) => {
      s.flo = Math.min(s.flo, 1e3);
      s.fhi = Math.max(s.flo * 2, Math.min(s.fhi, 1e5));
      s.fsamp = Math.max(s.fsamp, 2.2 * s.fhi);
      s.ein = Math.max(s.ein, -125);
      s.rs = Math.min(s.rs, 1e4);
      s.snr = Math.min(Math.max(s.snr, 0), 140);
      if (s.solveFor === 'bits') s.adc = true;
    });
    expect(ok).toBeGreaterThan(60); // the rest are unreachable targets or solutions outside an input's range (each returns its reason)
  });
});

describe('audio SNR: review fixes', () => {
  it('OUT OF RANGE: solving e_n for SNR 20 dB at +20 dBu (no ADC) gives 5.48 mV/√Hz, above the 1e-4 limit', () => {
    const r = run({ solveFor: 'noise', noiseAs: 'en', sigAs: 'dbu', sigDbu: 20, snr: 20, gainDb: 0, adc: false });
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('OUT OF RANGE');
    expect(r.error).toMatch(/e_n/);
  });
  it('OUT OF RANGE: solving the signal for SNR 250 dB (+173 dBu) is refused', () => {
    const r = run({ solveFor: 'sig', snr: 250 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/L_sig/);
  });
  it('UX: the sub-LSB warning follows the dither mode', () => {
    const p = { sigAs: 'dbfs' as const, sigDbfs: -150, noiseAs: 'en' as const, en: 0, rs: 0 };
    expect(run({ ...p, dither: 'tpdf' }).warnings.some((w) => w.includes('TPDF dither keeps it coded'))).toBe(true);
    expect(run({ ...p, dither: 'none' }).warnings.some((w) => w.includes('undithered'))).toBe(true);
  });
  it('no analog noise at all: EIN shows −∞ and is not written back', () => {
    const r = run({ noiseAs: 'en', en: 0, rs: 0 });
    expect(r.ok).toBe(true);
    const e = r.results.find((x) => x.key === 'ein')!;
    expect(e.value).toBeNull();
    expect(e.display).toMatch(/−∞/);
  });
  it('NIT: theory quotes −130.9 dBu at 20 °C and −130.85 dBu at 25 °C, matching the model', () => {
    expect(p2dbu(johnson2(150, 20) * 20e3)).toBeCloseTo(-130.92, 2);
    expect(Math.abs(p2dbu(johnson2(150, 25) * 20e3) + 130.85)).toBeLessThan(0.01);
  });
});

describe('mode-switch review (regressions)', () => {
  it('switching the converter off while solving for bits goes back to analysis (no red error, no hidden unknown)', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const ex = def.examples!.find((e) => e.id === 'bits-110')!;
    const st: any = { ...def.defaults(), ...structuredClone(ex.state) };
    expect(runCompute(def as CalcDef<any>, st).ok).toBe(true);
    const bits = st.bits;
    st.adc = false;
    const r = runCompute(def as CalcDef<any>, st);
    expect(r.ok).toBe(true);
    expect(st.solveFor).toBe('snr');
    st.adc = true;
    const back = runCompute(def as CalcDef<any>, st);
    expect(back.ok).toBe(true);
    expect(st.bits).toBe(bits);
  });
});

describe('mode-switch review: ◎ on the noise at the thermal limit', () => {
  it('noiseless-amp example → ◎ e_n gives e_n = 0 (not NO SOLUTION), and ◎ EIN gives the thermal EIN', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const ex = def.examples!.find((e) => e.id === 'johnson-150')!;
    for (const form of ['en', 'ein'] as const) {
      const st: any = { ...def.defaults(), ...structuredClone(ex.state) };
      expect(runCompute(def as CalcDef<any>, st).ok).toBe(true);
      const snr = st.snr;
      st.solveFor = 'noise';
      st.noiseAs = form;
      const r = runCompute(def as CalcDef<any>, st);
      expect(r.ok, r.error).toBe(true);
      expect(st.en).toBeLessThan(1e-15);
      expect(Math.abs(st.ein - p2dbu(johnson2(150, 20) * 19980))).toBeLessThan(1e-6);
      expect(st.snr).toBeCloseTo(snr, 9);
    }
  });
});
