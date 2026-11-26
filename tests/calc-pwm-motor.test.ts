import { describe, expect, it } from 'vitest';
import { def, type PwmMotorState } from '@/calculators/pwm-motor/def';
import { operate, waveform, type PwmCircuit } from '@/calculators/pwm-motor/model';
import { RPM, operatingPoint } from '@/calculators/dc-motor-speed/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import type { SelectField } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<PwmMotorState>) => def.compute({ ...def.defaults(), ...p });

const BAD = /NaN|undefined|Infinity/;

// ── generic fuzz support: random states inside every field's min/max and every select option
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
function randomState(d: CalcDef<any>, rnd: () => number, extra: Record<string, unknown[]>): any {
  const st: any = d.defaults();
  const walk = (fs: FieldSpec[]) => {
    for (const f of fs) {
      if (f.kind === 'section' || f.kind === 'group') walk(f.fields);
      else if (f.kind === 'select') {
        const o = f.options[Math.floor(rnd() * f.options.length)];
        st[f.key] = typeof o === 'string' ? o : o.value;
      } else if (f.kind === 'number') {
        if (f.optional && rnd() < 0.25) {
          st[f.key] = null;
          continue;
        }
        const lo = f.min ?? -1e3;
        const hi = f.max ?? 1e3;
        // spread magnitudes over the whole range: log-uniform for wide ranges (with 0 or negatives too)
        let v: number;
        const span = Math.max(Math.abs(lo), Math.abs(hi));
        if (lo > 0 && hi / lo > 100) v = lo * (hi / lo) ** rnd();
        else if (lo >= 0 && hi > 100 * Math.max(lo, 1e-300)) v = rnd() < 0.05 ? lo : hi * 1e-7 * 1e7 ** rnd();
        else if (lo < 0 && span > 100) v = Math.min(Math.max((rnd() < 0.5 ? -1 : 1) * span * 1e-7 * 1e7 ** rnd(), lo), hi);
        else v = lo + (hi - lo) * rnd();
        if (f.integer) v = Math.round(v);
        st[f.key] = v;
      }
    }
  };
  walk(d.fields);
  st.solveFor = d.solve!.options[Math.floor(rnd() * d.solve!.options.length)].key;
  for (const [k, opts] of Object.entries(extra)) st[k] = opts[Math.floor(rnd() * opts.length)];
  return st;
}
function checkReport(r: CalcReport) {
  const bad: string[] = [];
  for (const x of r.results) {
    if (typeof x.value === 'number' && !Number.isFinite(x.value)) bad.push(`value ${x.key}`);
    if (BAD.test(x.display)) bad.push(`display ${x.key}: ${x.display}`);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const c of Object.values(row)) if (BAD.test(c)) bad.push(`${t.id}: ${c}`);
  for (const s of [r.summary ?? '', r.error ?? '', ...r.warnings, ...r.notes]) if (BAD.test(s)) bad.push(s);
  for (const g of r.graphs) {
    for (const s of g.series ?? []) if (![...s.x, ...s.y].every(Number.isFinite)) bad.push(`${g.id}/${s.label}`);
    for (const l of [...(g.hlines ?? []), ...(g.vlines ?? [])]) if (!Number.isFinite(l.value)) bad.push(`${g.id} line ${l.label}`);
    for (const m of g.markers ?? []) if (!(Number.isFinite(m.x) && Number.isFinite(m.y))) bad.push(`${g.id} marker`);
  }
  expect(bad).toEqual([]);
}
function fuzz(d: CalcDef<any>, n: number, seed: number, extra: Record<string, unknown[]>) {
  const rnd = rng(seed);
  let ok = 0;
  for (let k = 0; k < n; k++) {
    const st = normalizeState(d, randomState(d, rnd, extra));
    const snap = JSON.stringify(st);
    let r: CalcReport;
    try {
      r = runCompute(d, st); // as the page does: compute, range guard, write-back
    } catch (e) {
      throw new Error(`compute threw for ${snap}: ${e}`);
    }
    // the calculator's own checks must catch out-of-range answers before the generic core guard does
    expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
    if (!r.ok) {
      expect(r.error, 'error message').toBeTruthy();
      continue;
    }
    ok++;
    checkReport(r);
    const outside = r.results
      .filter((x) => x.solved && typeof x.value === 'number')
      .filter((x) => {
        const f = findField(d.fields, x.key)?.field;
        if (!f || f.kind !== 'number') return false;
        const v = x.value as number;
        const tol = 1e-9 * Math.abs(v);
        return (f.min != null && v < f.min - tol) || (f.max != null && v > f.max + tol);
      })
      .map((x) => `${x.key} = ${x.value}`);
    expect(outside, snap).toEqual([]);
    // stability: computing the written-back state again gives the same answers
    const r2 = runCompute(d, structuredClone(st));
    expect(r2.ok, snap).toBe(true);
    const drift = r.results
      .filter((y) => y.primary && typeof y.value === 'number')
      .filter((x) => !(Math.abs(res(r2, x.key) - (x.value as number)) <= 1e-9 * Math.max(Math.abs(x.value as number), 1e-12)))
      .map((x) => `${x.key}: ${x.value} → ${res(r2, x.key)}`);
    expect(drift).toEqual([]);
  }
  return ok;
}
const circ = (p: Partial<PwmCircuit> = {}): PwmCircuit => ({ drive: 'sync', vs: 24, d: 0.5, f: 20e3, ron: 0.01, vd: 0, r: 0.3, l: 1e-3, ...p });

describe('PWM motor — published example and Python reference', () => {
  it('LiU TSTE25 exam 2023-10-20, problem 2: 250 V, D 0.8, 0.2 mH, 30 kHz, Ī 5 A → ΔI 6.67 A, 8.33 / 1.67 A', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'liu-ripple')!.state });
    expect(r.ok).toBe(true);
    expect(res(r, 'iAvg')).toBeCloseTo(5, 6);
    expect(res(r, 'ripple')).toBeCloseTo(6.6667, 3);
    expect(res(r, 'iMax')).toBeCloseTo(8.333, 3);
    expect(res(r, 'iMin')).toBeCloseTo(1.667, 3);
    expect(res(r, 'mode')).toBe('ccm');
  });
  it('defaults (maxon RE 40, low-side, 50 %) match the Python shooting / quadrature model (pm.py)', () => {
    const r = run({});
    expect(res(r, 'n')).toBeCloseTo(354.3571845764892, 8);
    expect(res(r, 'iAvg')).toBeCloseTo(3.4482582781456954, 10);
    expect(res(r, 'ripple')).toBeCloseTo(3.708766428154888, 10);
    expect(res(r, 'iRms')).toBeCloseTo(3.6107313222471515, 10);
    expect(res(r, 'iMin')).toBeCloseTo(1.5934064165525612, 10);
  });
  it('duty for 3000 rpm (sign-magnitude) and the light-load DCM case match Python', () => {
    const a = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'duty-for-3000')!.state });
    expect(res(a, 'duty')).toBeCloseTo(44.11501751904021, 9);
    expect(res(a, 'ripple')).toBeCloseTo(3.5875790620471513, 10);
    const b = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'light-load-dcm')!.state });
    expect(res(b, 'mode')).toBe('dcm');
    expect(res(b, 'n')).toBeCloseTo(752.0265921101743, 7);
    expect(res(b, 'ripple')).toBeCloseTo(0.8403614121192646, 10);
    expect(res(b, 'iRms')).toBeCloseTo(0.2795217049388522, 10);
  });
});

describe('PWM motor — limits of the exact solution', () => {
  it('τ ≫ T reduces to ΔI = V_s·D(1−D)/(L·f) (sign-magnitude) and twice that (anti-phase)', () => {
    for (const d of [0.2, 0.5, 0.7]) {
      const c = circ({ d, l: 10e-3, f: 100e3, r: 0.1, ron: 0 });
      const e = 0.3 * 24;
      const lin = (24 * d * (1 - d)) / (10e-3 * 100e3);
      expect(waveform(c, e).ripple / lin).toBeCloseTo(1, 3);
      expect(waveform({ ...c, drive: 'antiphase' }, e).ripple / (2 * lin)).toBeCloseTo(1, 3);
    }
  });
  it('I_rms² = Ī² + ΔI²/12 for a triangular ripple', () => {
    const w = waveform(circ({ l: 10e-3, f: 100e3, r: 0.1, ron: 0 }), 6);
    expect(w.iRms ** 2 / (w.iAvg ** 2 + w.ripple ** 2 / 12)).toBeCloseTo(1, 4);
  });
  it('sign-magnitude bridge in CCM equals the dc-motor-speed model on D·V_s through R + 2R_on (exact)', () => {
    for (const [d, tL] of [[0.3, 0.05], [0.6, 0.1], [0.9, 0.2]]) {
      const r = run({ drive: 'sync', duty: d * 100, tL });
      const rLoop = (r.details as any).rLoop;
      const op = operatingPoint({ v: d * 24, r: rLoop, k: 30.2e-3, i0: 0.137 }, tL);
      expect(res(r, 'n') / op.speed).toBeCloseTo(1, 10);
      expect(res(r, 'iAvg') / op.current).toBeCloseTo(1, 10);
    }
  });
  it('energy balance: V_s·Ī_s = copper + switch + diode + E·Ī, and the bridge mean equals E + RĪ', () => {
    for (const drive of ['lowside', 'sync', 'antiphase'] as const) {
      for (const e of [0, 5, 15]) {
        const c = circ({ drive, ron: 0.05, vd: drive === 'lowside' ? 0.6 : 0, d: 0.7, l: 50e-6, f: 5e3 });
        const w = waveform(c, e);
        expect(c.vs * w.isAvg).toBeCloseTo(w.pCu + w.pSw + w.pDiode + e * w.iAvg, 9);
        expect(w.vBridge).toBeCloseTo(w.vMotor, 9);
      }
    }
  });
  it('the low-side drive never carries negative current; the synchronous bridge can', () => {
    const lo = waveform(circ({ drive: 'lowside', l: 20e-6, f: 2e3, d: 0.3 }), 10);
    expect(lo.mode).toBe('dcm');
    expect(lo.iMin).toBeGreaterThanOrEqual(0);
    const sy = waveform(circ({ drive: 'sync', l: 20e-6, f: 2e3, d: 0.3 }), 6.5);
    expect(sy.mode).toBe('ccm');
    expect(sy.iMin).toBeLessThan(0);
  });
});

describe('PWM motor — solve round trips', () => {
  const pts: Partial<PwmMotorState>[] = [
    {},
    { drive: 'sync', duty: 35, tL: 0.15 },
    { drive: 'antiphase', duty: 80, tL: 0.05, lx: 50e-6 },
    { drive: 'lowside', duty: 25, f: 4e3, tL: 0.01 },
    { drive: 'lowside', vs: 48, duty: 70, ron: 0.05, vd: 0.8, tL: 0.2, tW: 90 },
  ];
  for (const p of pts) {
    it(`speed → duty → speed and speed → torque (${JSON.stringify(p)})`, () => {
      const a = run({ ...p, solveFor: 'n' });
      expect(a.ok).toBe(true);
      const n = res(a, 'n');
      const b = run({ ...p, solveFor: 'duty', n });
      expect(res(b, 'duty') / (p.duty ?? 50)).toBeCloseTo(1, 7);
      const c = run({ ...p, solveFor: 'tL', n });
      expect(res(c, 'tL')).toBeCloseTo(p.tL ?? 0.1, 7);
    });
  }
});

describe('PWM motor — physics', () => {
  it('speed rises with duty; ripple falls with frequency and with inductance', () => {
    let prev = -1;
    for (let d = 10; d <= 100; d += 10) {
      const n = res(run({ duty: d, tL: 0.02 }), 'n');
      expect(n).toBeGreaterThan(prev);
      prev = n;
    }
    const r1 = res(run({ f: 20e3 }), 'ripple');
    const r2 = res(run({ f: 40e3 }), 'ripple');
    expect(r2).toBeLessThan(r1);
    expect(res(run({ lx: 100e-6 }), 'ripple')).toBeLessThan(r1);
  });
  it('D = 100 % equals the plain DC motor on V_s through R + R_on', () => {
    const r = run({ duty: 100 });
    const op = operatingPoint({ v: 24, r: 0.299 + 0.01, k: 30.2e-3, i0: 0.137 }, 0.1);
    expect(res(r, 'n') / op.speed).toBeCloseTo(1, 10);
    expect(res(r, 'ripple')).toBeCloseTo(0, 9);
  });
  it('operate() is a root of the torque balance', () => {
    const c = circ({ drive: 'lowside', vd: 0.5, l: 80e-6, d: 0.4 });
    const m = { k: 0.03, i0: 0.1, tL: 0.05 };
    const op = operate(c, m);
    expect(m.k * (op.w.iAvg - m.i0)).toBeCloseTo(m.tL, 10);
  });
});

describe('PWM motor — review fixes', () => {
  it('K_v follows K_t (sync + solved result written back): 50 mN·m/A → 191 rpm/V', () => {
    const st = { ...def.defaults(), k: 50e-3 };
    const r = runCompute(def, st);
    expect(r.ok).toBe(true);
    expect(st.kv / RPM).toBeCloseTo(190.99, 2);
    const st2 = { ...def.defaults(), kForm: 'kv' as const, kv: 500 * RPM };
    runCompute(def, st2);
    expect(st2.k).toBeCloseTo(1 / (500 * RPM), 12);
  });
  it('out-of-range solved speed, torque or K_t give specific errors', () => {
    const a = run({ vs: 1e4, k: 1e-3, duty: 100, tL: 0, i0: 0.001 });
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/10⁶ rad\/s/);
    const b = run({ solveFor: 'tL', vs: 5819, kForm: 'kv', kv: 0.65 * RPM, n: 1 * RPM, duty: 100 });
    expect(b.ok).toBe(false);
    expect(b.error).toMatch(/10 kN·m/);
    const c = run({ kForm: 'kv', kv: 1e-3 });
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/100 N·m\/A/);
  });
});

describe('PWM motor — warnings, errors, examples', () => {
  it('stall, ripple, audible, temperature and peak-current warnings', () => {
    const st = run({ duty: 10, tL: 0.5 });
    expect(st.status?.text).toBe('STALLED');
    expect(run({ drive: 'antiphase', duty: 40 }).warnings.some((w) => w.includes('negative average'))).toBe(true);
    expect(run({ duty: 50, f: 5e3 }).warnings.some((w) => w.includes('copper loss'))).toBe(true);
    expect(run({ f: 10e3 }).notes.some((w) => w.includes('audible'))).toBe(true);
    expect(run({ tW: 180 }).warnings.some((w) => w.includes('insulation'))).toBe(true);
    expect(run({ duty: 95, tL: 2.5 }).warnings.some((w) => w.includes('Peak current'))).toBe(true);
  });
  it('impossible targets and bad inputs come back as errors', () => {
    expect(run({ solveFor: 'duty', n: 9000 * RPM }).ok).toBe(false);
    expect(run({ solveFor: 'tL', duty: 10, n: 5000 * RPM }).ok).toBe(false);
    expect(run({ tL: 0, i0: 0 }).ok).toBe(false);
    expect(run({ vs: 0 }).ok).toBe(false);
    expect(run({ l: NaN }).ok).toBe(false);
  });
  it('every example computes and the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      checkReport(r);
    }
  });
  it('fuzz: 300 random states in every field range and option', () => {
    const ok = fuzz(def, 300, 11, { kForm: ['k', 'kv'] });
    expect(ok).toBeGreaterThan(60);
  });
  it('computes in well under 50 ms', () => {
    run({});
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) run({ duty: 40 + k });
    expect((performance.now() - t0) / 10).toBeLessThan(40);
  });
});

describe('PWM motor — mode-switch regressions', () => {
  const sel = (st: any, key: string, v: unknown) => {
    const f = findField(def.fields, key)!.field as SelectField;
    st[key] = v;
    f.apply?.(v, st, st);
    return runCompute(def as any, st);
  };
  const ex = (id: string) => ({ ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === id)!.state) }) as any;
  it('topology switch with a torque solve analyses the speed instead of a red error', () => {
    const st = { ...def.defaults(), solveFor: 'tL' };
    expect(runCompute(def as any, st).ok).toBe(true);
    const r = sel(st, 'drive', 'antiphase');
    expect(r.ok).toBe(true);
    expect(st.solveFor).toBe('n');
  });
  it('zero load solved back from its own speed is 0, not a round-off error', () => {
    const st = { ...ex('light-load-dcm') };
    sel(st, 'drive', 'sync');
    st.solveFor = 'tL';
    expect(runCompute(def as any, st).ok).toBe(true);
    expect(st.tL).toBe(0);
  });
  it('the speed at 100 % duty solves back to 100 %', () => {
    const st = { ...ex('liu-ripple'), duty: 100 };
    runCompute(def as any, st);
    st.solveFor = 'duty';
    expect(runCompute(def as any, st).ok).toBe(true);
    expect(st.duty).toBeCloseTo(100, 6);
  });
});

describe('PWM motor — display regressions', () => {
  it('anti-phase at 50 %: the mean current is exactly 0 (no "−8.67 fA")', () => {
    const r = def.compute({ ...def.defaults(), drive: 'antiphase' });
    expect(res(r, 'iAvg')).toBe(0);
  });
});
