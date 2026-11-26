import { describe, expect, it } from 'vitest';
import { def, type BoostState } from '@/calculators/boost-converter/def';
import { analyzeBoost, ccmDuty } from '@/calculators/boost-converter/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const val = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<BoostState>) => def.compute({ ...def.defaults(), ...p });
/** Lossless parts and no low-line corner: the textbook (SLVA372) equations apply exactly. */
const ideal: Partial<BoostState> = { dcr: 0, rSw: 0, rRect: 0, vf: 0, esr: 0, esrIn: 0, tsw: 0, qg: 0, qrr: 0, pCore: 0, rect: 'sync', vinMin: 5 };
const BAD = /NaN|undefined|Infinity/;

describe('boost — TI SLVA372 equations (ideal parts)', () => {
  it('eq. 1, 4, 5, 6: D = 1 − Vin/Vout, L = Vin(Vout − Vin)/(ΔIL·fs·Vout), Isw,max = ΔIL/2 + Iout/(1 − D)', () => {
    // 5 V → 12 V, 0.5 A, 500 kHz; I_L = 0.5/(5/12) = 1.2 A, ΔIL = 30 % = 0.36 A
    const r = run({ ...ideal, solveFor: 'l', ripplePct: 30 });
    expect(val(r, 'duty')).toBeCloseTo(7 / 12, 12);
    expect(val(r, 'l')).toBeCloseTo((5 * 7) / (0.36 * 500e3 * 12), 12);
    expect(val(r, 'iPk')).toBeCloseTo(1.2 + 0.18, 10);
  });
  it('eq. 9: Cout(min) = Iout·D/(fs·ΔVout) with ESR = 0; eq. 10 ESR ripple = ESR·Ipk', () => {
    const r = run({ ...ideal, solveFor: 'cout', l: 22e-6, dvOut: 20e-3 });
    expect(val(r, 'cout')).toBeCloseTo((0.5 * (7 / 12)) / (500e3 * 20e-3), 12);
    const e = run({ ...ideal, solveFor: 'ripplePct', l: 22e-6, esr: 10e-3 });
    const dIL = (5 * (7 / 12)) / (500e3 * 22e-6);
    expect(val(e, 'dVoutEsr')).toBeCloseTo(10e-3 * (1.2 + dIL / 2), 12);
    // exact ripple lies between the larger term and the sum of both (the peaks do not coincide)
    const tot = val(e, 'dvOut');
    expect(tot).toBeGreaterThan(Math.max(val(e, 'dVoutC'), val(e, 'dVoutEsr')));
    expect(tot).toBeLessThan(val(e, 'dVoutC') + val(e, 'dVoutEsr'));
  });
  it('Cin carries the triangular inductor ripple: I_rms = ΔIL/√12, ΔVin = ΔIL/(8·fs·Cin)', () => {
    const r = run({ ...ideal, solveFor: 'ripplePct', l: 22e-6 });
    const dIL = (5 * (7 / 12)) / (500e3 * 22e-6);
    expect(val(r, 'iCinRms')).toBeCloseTo(dIL / Math.sqrt(12), 12);
    expect(val(r, 'dVin')).toBeCloseTo(dIL / (8 * 500e3 * 10e-6), 12);
  });
});

describe('boost — Erickson & Maksimović closed forms', () => {
  it('ch. 3: with only R_L, V/Vg = (1/D′)·1/(1 + R_L/(D′²R))', () => {
    const p = { vin: 12, vout: 30, iout: 2, rl: 0.1 };
    const dp = 1 - ccmDuty({ vin: p.vin, vout: p.vout, iout: p.iout, fsw: 1e5, l: 1e-4, dcr: p.rl, cout: 1e-4, esr: 0, rect: 'sync', rSw: 0, rRect: 0, vf: 0, qrr: 0, tsw: 0, qg: 0, vdrv: 0, pCore: 0, cin: 1e-5, esrIn: 0 })!;
    const R = p.vout / p.iout;
    expect((p.vin / dp) / (1 + p.rl / (dp * dp * R))).toBeCloseTo(p.vout, 10);
  });
  it('ch. 5: lossless DCM gain M = (1 + √(1 + 4D²/K))/2, K = 2L/(R·Ts)', () => {
    const r = run({ ...ideal, rect: 'diode', vinMin: 5, solveFor: 'ripplePct', iout: 0.02, l: 4.7e-6 });
    const d = r.details as any;
    expect(d.mode).toBe('dcm');
    const K = (2 * 4.7e-6 * 500e3) / (12 / 0.02);
    expect((1 + Math.sqrt(1 + (4 * d.d * d.d) / K)) / 2).toBeCloseTo(12 / 5, 10);
  });
  it('§8.2: RHP zero = (1 − D)²·R/(2πL)', () => {
    const r = run({ ...ideal, solveFor: 'ripplePct', l: 22e-6 });
    expect(val(r, 'fRhp')).toBeCloseTo(((5 / 12) ** 2 * 24) / (2 * Math.PI * 22e-6), 6);
  });
});

describe('boost — independent Python reference (scratch boost_ref.py)', () => {
  // Written from Erickson / SLVA372: duty by bisection of the volt-second balance, ripple by fine integration.
  it('default stage analysed with L = 22 µH (diode, CCM)', () => {
    const r = run({ solveFor: 'ripplePct', l: 22e-6, vinMin: 5 });
    expect(val(r, 'duty')).toBeCloseTo(0.603920446740094, 12);
    expect(val(r, 'ripplePct')).toBeCloseTo(21.251386975334405, 9);
    expect(val(r, 'iPk')).toBeCloseTo(1.3965085117013731, 10);
    expect(val(r, 'dvOut') / 0.03583720639818293).toBeCloseTo(1, 6);
    expect(val(r, 'dVin') / 0.006776888079329463).toBeCloseTo(1, 6);
    expect(val(r, 'iCoutRms')).toBeCloseTo(0.6193236701105455, 10);
    expect(val(r, 'eff')).toBeCloseTo(0.9338522548696957, 10);
    expect(val(r, 'fRhp') / 27237.894881925797).toBeCloseTo(1, 9);
  });
  it('LED-string example in DCM', () => {
    const ex = def.examples!.find((e) => e.id === 'led-dcm')!.state;
    const r = run({ ...ex, vinMin: 3.6 });
    expect((r.details as any).mode).toBe('dcm');
    expect(val(r, 'duty')).toBeCloseTo(0.7103557604948489, 9);
    expect(val(r, 'ripplePct')).toBeCloseTo(249.4052306330619, 6);
    expect(val(r, 'iPk')).toBeCloseTo(0.43690997901731665, 9);
    expect(val(r, 'eff')).toBeCloseTo(0.8709090475314191, 9);
  });
  it('synchronous forced PWM at light load: CCM with negative inductor current', () => {
    const r = run({ solveFor: 'ripplePct', l: 22e-6, vinMin: 5, rect: 'sync', iout: 0.05 });
    expect((r.details as any).mode).toBe('ccm-negative');
    expect(val(r, 'duty')).toBeCloseTo(0.5841517713053079, 10);
    expect(val(r, 'ripplePct')).toBeCloseTo(220.35703890182222, 8);
    expect(val(r, 'iValley')).toBeLessThan(0);
    expect(r.warnings.some((w) => /negative/.test(w))).toBe(true);
  });
});

describe('boost — solve → forward round trips', () => {
  for (const ex of ['default', 'liion-5v', 'auto-24v', 'step-up-48', 'led-dcm']) {
    const base = { ...def.defaults(), ...def.examples!.find((e) => e.id === ex)!.state } as BoostState;
    it(`L and fsw for a ripple ratio (${ex})`, () => {
      for (const t of [15, 40, 300]) {
        const a = run({ ...base, solveFor: 'l', ripplePct: t });
        expect(val(run({ ...base, solveFor: 'ripplePct', l: val(a, 'l') }), 'ripplePct')).toBeCloseTo(t, 6);
        const b = run({ ...base, solveFor: 'fsw', ripplePct: t });
        expect(val(run({ ...base, solveFor: 'ripplePct', fsw: val(b, 'fsw') }), 'ripplePct')).toBeCloseTo(t, 6);
      }
    });
    it(`Cout for a ripple target (${ex})`, () => {
      const a0 = run({ ...base, solveFor: 'ripplePct' });
      const tgt = val(a0, 'dvOut') * 1.7;
      const a = run({ ...base, solveFor: 'cout', dvOut: tgt });
      expect(val(run({ ...base, solveFor: 'ripplePct', cout: val(a, 'cout') }), 'dvOut') / tgt).toBeCloseTo(1, 8);
    });
  }
});

describe('boost — limits and warnings', () => {
  it('Vout ≤ Vin and an unreachable gain are input errors with a reason', () => {
    expect(() => run({ vout: 4 })).toThrow(/steps up/);
    expect(() => run({ vout: 60, iout: 5, dcr: 0.2 })).toThrow(/at most/);
    expect(() => run({ solveFor: 'ripplePct', l: 1e-9, fsw: 1e3, rect: 'sync' })).toThrow(/far too small/);
    expect(() => run({ solveFor: 'ripplePct', cout: 1e-9, fsw: 1e3, l: 1e-3 })).toThrow(/exceed Vout/);
  });
  it('high duty, near-peak gain, DCM, low efficiency and short on-time warn', () => {
    expect(run({ vin: 5, vinMin: 5, vout: 48 }).warnings.some((w) => /Duty cycle/.test(w))).toBe(true);
    expect(run({ vinMin: 5, iout: 2, dcr: 0.15 }).warnings.some((w) => /peak of its gain/.test(w))).toBe(true);
    expect(run({ solveFor: 'ripplePct', iout: 0.01 }).warnings.some((w) => /Discontinuous/.test(w))).toBe(true);
    expect(run({ tsw: 5e-6 }).warnings.some((w) => /efficiency/.test(w))).toBe(true);
    expect(run({ vin: 10, vinMin: 10, vout: 11, fsw: 3e6 }).warnings.some((w) => /On-time/.test(w))).toBe(true);
    expect(run({ vinMin: 1, iout: 1 }).warnings.some((w) => /V_in,min/.test(w))).toBe(true);
  });
  it('Cout target below the ESR floor reports no solution', () => {
    const r = run({ solveFor: 'cout', esr: 0.1, dvOut: 1e-3 });
    expect(r.status?.tone).toBe('fail');
    expect(r.warnings[0]).toMatch(/ESR alone/);
  });
  it('a diode boost with huge drops and ripple has no self-consistent waveform (error, not a fake CCM)', () => {
    const p = { vin: 22.09, vout: 144.7, iout: 6.69, fsw: 7400, l: 1.28e-6, dcr: 0.0074, rSw: 0.0785, vf: 0.64, rect: 'diode' as const, vinMin: 22.09, solveFor: 'ripplePct' as const };
    expect(() => run(p)).toThrow(/self-consistent/);
    expect(analyzeBoost({ ...(run({ ...p, fsw: 7600 }).details as any).inputs, fsw: 7400 })).toBeNull();
  });
});

describe('boost — harness regressions (2026-11-26)', () => {
  it('LED example at fsw = 120 kHz: ◎ L / ◎ fsw return the entered part, not a tiny-L lossy-DCM root', () => {
    const ex = { ...def.defaults(), ...def.examples!.find((e) => e.id === 'led-dcm')!.state, fsw: 120e3 } as BoostState;
    const rp = val(run({ ...ex, solveFor: 'ripplePct' }), 'ripplePct');
    expect(val(run({ ...ex, solveFor: 'l', ripplePct: rp }), 'l')).toBeCloseTo(4.7e-6, 12);
    expect(val(run({ ...ex, solveFor: 'fsw', ripplePct: rp }), 'fsw') / 120e3).toBeCloseTo(1, 9);
  });
});

describe('boost — review regressions (2026-11-26)', () => {
  it('peak current reports the larger of nominal and V_in,min (forced-PWM sync at light load peaks at nominal)', () => {
    const p: Partial<BoostState> = { solveFor: 'ripplePct', vin: 90.4, vinMin: 72.3, vout: 275.8, iout: 19.4e-3, fsw: 1.43e6, l: 9.9e-6, rect: 'sync' };
    const r = run(p);
    const nom = val(run({ ...p, vinMin: 90.4 }), 'iPk');
    const lo = val(run({ ...p, vin: 72.3, vinMin: 72.3 }), 'iPk');
    expect(nom).toBeGreaterThan(lo);
    expect(val(r, 'iPk')).toBeCloseTo(nom, 12);
    expect(r.results.find((x) => x.key === 'iPk')!.note).toMatch(/worst case at Vin/);
  });
  it('a rectifier switch drops a ripple-ratio solve back to analysis (A → B → A)', () => {
    const f = (def.fields as any[]).flatMap((x) => x.fields ?? []).find((x: any) => x.key === 'rect');
    const st: any = { ...def.defaults(), solveFor: 'fsw' };
    f.apply('sync', st, st);
    expect(st.solveFor).toBe('ripplePct');
  });
});

describe('boost — examples', () => {
  it('first example equals the defaults', () => {
    expect({ ...def.defaults(), ...def.examples![0].state }).toEqual(def.defaults());
  });
  for (const e of def.examples ?? []) {
    it(`example computes: ${e.label}`, () => {
      const r = run(e.state);
      expect(r.ok).toBe(true);
      expect(r.status?.tone).not.toBe('fail');
      expect(r.graphs.length).toBe(3);
    });
  }
});

// ── fuzz through runCompute
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
function randomState(d: CalcDef<any>, rnd: () => number): any {
  const st: any = d.defaults();
  const walk = (fs: FieldSpec[]) => {
    for (const f of fs) {
      if (f.kind === 'section' || f.kind === 'group') walk(f.fields);
      else if (f.kind === 'select') {
        const o = f.options[Math.floor(rnd() * f.options.length)];
        st[f.key] = typeof o === 'string' ? o : o.value;
      } else if (f.kind === 'number') {
        const lo = f.min ?? 0;
        const hi = f.max ?? 1e3;
        st[f.key] = lo > 0 ? lo * (hi / lo) ** rnd() : rnd() < 0.1 ? 0 : hi * 1e-7 * 1e7 ** rnd();
      }
    }
  };
  walk(d.fields);
  // half the states near a sensible design so most compute
  if (rnd() < 0.5) {
    st.vin = 1 + 50 * rnd();
    st.vinMin = st.vin * (0.5 + 0.6 * rnd());
    st.vout = st.vin * (1.1 + 5 * rnd());
    st.iout = 0.01 + 3 * rnd();
    for (const k of ['dcr', 'rSw', 'rRect', 'esr', 'esrIn']) st[k] = 0.1 * rnd();
  }
  st.solveFor = d.solve!.options[Math.floor(rnd() * d.solve!.options.length)].key;
  return st;
}
function checkReport(r: CalcReport) {
  const bad: string[] = [];
  for (const x of r.results) {
    if (typeof x.value === 'number' && !Number.isFinite(x.value)) bad.push(`value ${x.key}`);
    if (BAD.test(x.display)) bad.push(`display ${x.key}: ${x.display}`);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const c of Object.values(row)) if (BAD.test(String(c))) bad.push(`${t.id}: ${c}`);
  for (const s of [r.summary ?? '', ...r.warnings, ...r.notes]) if (BAD.test(s)) bad.push(s);
  for (const g of r.graphs) {
    for (const s of g.series ?? []) if (![...s.x, ...s.y].every(Number.isFinite)) bad.push(`${g.id}/${s.label}`);
    for (const l of [...(g.hlines ?? []), ...(g.vlines ?? [])]) if (!Number.isFinite(l.value)) bad.push(`${g.id} line ${l.label}`);
    for (const m of g.markers ?? []) if (!(Number.isFinite(m.x) && Number.isFinite(m.y))) bad.push(`${g.id} marker`);
  }
  expect(bad).toEqual([]);
}

describe('boost — fuzz (runCompute)', () => {
  it('400 random states: never throws, finite output, solved values in range, stable on recompute', () => {
    const rnd = rng(11);
    let ok = 0;
    for (let k = 0; k < 400; k++) {
      const st = normalizeState(def, randomState(def, rnd));
      const snap = JSON.stringify(st);
      const r = runCompute(def, st);
      expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
      if (!r.ok) {
        expect(r.error).toBeTruthy();
        continue;
      }
      ok++;
      checkReport(r);
      for (const x of r.results.filter((y) => y.solved && typeof y.value === 'number')) {
        const f = findField(def.fields, x.key)?.field as any;
        if (f?.kind === 'number') {
          expect(x.value as number, snap).toBeGreaterThanOrEqual(f.min * (1 - 1e-9));
          expect(x.value as number, snap).toBeLessThanOrEqual(f.max * (1 + 1e-9));
        }
      }
      const r2 = runCompute(def, structuredClone(st));
      expect(r2.ok, snap).toBe(true);
      for (const x of r.results.filter((y) => y.primary && typeof y.value === 'number')) expect(Math.abs(val(r2, x.key) - (x.value as number)), `${snap} ${x.key}`).toBeLessThanOrEqual(1e-7 * Math.max(Math.abs(x.value as number), 1e-12));
    }
    expect(ok).toBeGreaterThan(150);
  });
});
