import { describe, expect, it } from 'vitest';
import { def, type RippleState } from '@/calculators/switcher-ripple/def';
import { capRipple, converter } from '@/calculators/switcher-ripple/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const val = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<RippleState>) => def.compute({ ...def.defaults(), ...p });
const BAD = /NaN|undefined|Infinity/;
/** one ideal part: C exactly as entered */
const plain: Partial<RippleState> = { nOut: 1, biasOut: 100, nIn: 1, biasIn: 100 };

describe('switcher ripple — textbook limits (SLVA477, SLVA372, SLVA630)', () => {
  it('buck output, ESR = ESL = 0: ΔV = ΔIL/(8·fs·C) (SLVA477 eq. 12)', () => {
    const r = run({ ...plain, cOut: 47e-6, esrOut: 0, eslOut: 0 });
    const dIL = ((12 - 3.3) * (3.3 / 12)) / (500e3 * 4.7e-6);
    expect(val(r, 'dIL')).toBeCloseTo(dIL, 12);
    expect(val(r, 'dvOut')).toBeCloseTo(dIL / (8 * 500e3 * 47e-6), 14);
  });
  it('buck output, ESR only (C → ∞): ESR·ΔIL (eq. 13); ESL only: square wave ESL·Vin/L (SLVA630)', () => {
    const dIL = ((12 - 3.3) * (3.3 / 12)) / (500e3 * 4.7e-6);
    expect(val(run({ ...plain, cOut: 1, esrOut: 10e-3, eslOut: 0 }), 'dvEsrOut')).toBeCloseTo(10e-3 * dIL, 14);
    const r = run({ ...plain, esrOut: 0, eslOut: 2e-9 });
    expect(val(r, 'dvEslOut')).toBeCloseTo((2e-9 * 12) / 4.7e-6, 14);
  });
  it('boost output, ESR = ESL = 0: ΔV → Iout·D/(fs·C) as t_tr → 0 (SLVA372 eq. 9); ESR part = ESR·Ipk (eq. 10)', () => {
    const p = { topo: 'boost' as const, vin: 5, vout: 12, iout: 1, fsw: 1e6, l: 4.7e-6, cOut: 22e-6, esrOut: 0, eslOut: 0, tr: 1e-12 };
    const r = run({ ...plain, ...p });
    expect(val(r, 'dvOut') / ((1 * (7 / 12)) / (1e6 * 22e-6))).toBeCloseTo(1, 5);
    const e = run({ ...plain, ...p, esrOut: 0.01 });
    expect(val(e, 'dvEsrOut') / (0.01 * val(e, 'iPk'))).toBeCloseTo(1, 6);
  });
  it('buck input, large L, ESR = ESL = 0: ΔV → Iout·D(1 − D)/(fs·Cin)', () => {
    const r = run({ ...plain, l: 1, tr: 1e-12, cIn: 10e-6, esrIn: 0, eslIn: 0 });
    const D = 3.3 / 12;
    expect(val(r, 'dvIn') / ((3 * D * (1 - D)) / (500e3 * 10e-6))).toBeCloseTo(1, 5);
    expect(val(r, 'irmsIn') / (3 * Math.sqrt(D * (1 - D)))).toBeCloseTo(1, 6);
  });
  it('C_eff = n·C·k_DC; ESR and ESL divide by n', () => {
    const a = run({ cOut: 22e-6, nOut: 3, biasOut: 50 });
    expect(val(a, 'ceffOut')).toBeCloseTo(33e-6, 15);
    const b = run({ ...plain, cOut: 33e-6, esrOut: 1e-3, eslOut: 0.5e-9 / 3 });
    expect(val(run({ cOut: 22e-6, nOut: 3, biasOut: 50, esrOut: 3e-3, eslOut: 0.5e-9 }), 'dvOut')).toBeCloseTo(val(b, 'dvOut'), 15);
  });
  it('exact p-p ≤ simple sum always; RSS can understate it (pulsed output)', () => {
    for (const ex of def.examples!) {
      const r = run(ex.state);
      if (r.status?.tone === 'fail') continue;
      expect(val(r, 'dvOut')).toBeLessThanOrEqual(val(r, 'dvSumOut') * (1 + 1e-12));
      expect(val(r, 'dvIn')).toBeLessThanOrEqual(val(r, 'dvSumIn') * (1 + 1e-12));
    }
    const bb = run(def.examples!.find((e) => e.id === 'bb-esr')!.state);
    expect(val(bb, 'dvRssOut')).toBeLessThan(val(bb, 'dvOut'));
  });
});

describe('switcher ripple — independent Python reference (scratch ripple_ref.py)', () => {
  // Python on a fine time grid, waveforms built from Erickson ch. 2; 300 random states agree to ≤ 1.1e-7.
  it('defaults (buck, 2 × 22 µF at 60 %)', () => {
    const r = run({});
    expect(val(r, 'dvOut') / 0.009078489358710102).toBeCloseTo(1, 7);
    expect(val(r, 'dvCOut') / 0.009640957446808505).toBeCloseTo(1, 7);
    expect(val(r, 'irmsOut')).toBeCloseTo(0.2938958551140806, 10);
  });
  it('model values against the Python grid', () => {
    const cv = converter({ topo: 'boost', vin: 5, vout: 12, iout: 1, fsw: 1e6, l: 4.7e-6, tr: 5e-9 });
    const o = capRipple(cv.out, cv.T, { c: 17.6e-6, esr: 1.5e-3, esl: 0.5e-9 });
    expect(o.pp / PY.boostOut.pp).toBeCloseTo(1, 6);
    expect(o.irms / PY.boostOut.rms).toBeCloseTo(1, 9);
    const cb = converter({ topo: 'buckboost', vin: 12, vout: 12, iout: 0.5, fsw: 400e3, l: 22e-6, tr: 20e-9 });
    const i = capRipple(cb.in, cb.T, { c: 10e-6, esr: 2.5e-3, esl: 0.5e-9 });
    expect(i.pp / PY.bbIn.pp).toBeCloseTo(1, 6);
  });
});

const PY = {
  boostOut: { pp: 0.45130035561734616, rms: 1.1847401823715311 },
  bbIn: { pp: 0.0647759090909091 },
};

describe('switcher ripple — solve round trips', () => {
  for (const ex of def.examples!) {
    it(`every solve option from "${ex.id}"`, () => {
      const base = { ...def.defaults(), ...ex.state } as RippleState;
      const a = run({ ...base, solveFor: 'dvOut' });
      for (const [key, side] of [['cOut', 'Out'], ['esrOut', 'Out'], ['cIn', 'In'], ['esrIn', 'In']] as const) {
        for (const f of [0.8, 1.3]) {
          const tgt = val(a, `dv${side}`) * f;
          const r = run({ ...base, solveFor: key, [`dv${side}`]: tgt });
          if (r.status?.tone === 'fail') continue; // e.g. ESR/ESL floor above 0.8×
          const b = run({ ...base, solveFor: 'dvOut', [key]: val(r, key) });
          expect(val(b, `dv${side}`) / tgt, `${key} ${f}`).toBeCloseTo(1, 6);
        }
      }
    });
  }
  it('C solve picks the smallest C, ESR solve the largest ESR', () => {
    const r = run({ solveFor: 'cOut', dvOut: 9e-3 });
    const c = val(r, 'cOut');
    expect(val(run({ cOut: c * 0.99 }), 'dvOut')).toBeGreaterThan(9e-3);
    const e = run({ solveFor: 'esrOut', dvOut: 12e-3 });
    expect(val(run({ esrOut: val(e, 'esrOut') * 1.01 }), 'dvOut')).toBeGreaterThan(12e-3);
  });
});

describe('switcher ripple — limits and warnings', () => {
  it('topology checks are input errors', () => {
    expect(() => run({ topo: 'buck', vout: 15 })).toThrow(/steps down/);
    expect(() => run({ topo: 'boost', vout: 5 })).toThrow(/steps up/);
  });
  it('floors give NO SOLUTION with the reason', () => {
    const r = run({ solveFor: 'cOut', dvOut: 0.1e-3 });
    expect(r.status?.tone).toBe('fail');
    expect(r.warnings[0]).toMatch(/ESR and ESL alone/);
    const e = run({ solveFor: 'esrOut', dvOut: 1e-3 });
    expect(e.warnings[0]).toMatch(/zero ESR/);
  });
  it('DCM, clamped t_tr, large ripple and ESL-dominated output warn or note', () => {
    expect(run({ iout: 0.1 }).warnings.some((w) => /DCM/.test(w))).toBe(true);
    expect(run({ tr: 1e-6 }).warnings.some((w) => /t_tr/.test(w))).toBe(true);
    expect(run({ cOut: 0.1e-6 }).warnings.some((w) => /5 %/.test(w))).toBe(true);
    expect(run(def.examples!.find((e) => e.id === 'boost-spikes')!.state).notes.some((w) => /ESL spikes dominate/.test(w))).toBe(true);
  });
  it('topology change returns to analysis and fixes an impossible Vout', () => {
    const f = (def.fields[0] as any).fields.find((x: any) => x.key === 'topo');
    const st: any = { ...def.defaults(), solveFor: 'cOut', topo: 'boost' };
    f.apply(st.topo, st, st);
    expect(st.solveFor).toBe('dvOut');
    expect(st.vout).toBeGreaterThan(st.vin);
    expect(run(st).ok).toBe(true);
  });
});

describe('switcher ripple — review regressions (2026-11-26)', () => {
  const p: Partial<RippleState> = { topo: 'buckboost', vin: 26.33, vout: 82.27, iout: 0.2036, fsw: 2.905e6, l: 1.81e-6, tr: 18.8e-9, cOut: 1.555e-6, nOut: 2, biasOut: 60, eslOut: 0.394e-9 };
  it('ESR solve accepts targets below the zero-ESR ripple when the ripple dips with ESR', () => {
    const z = val(run({ ...p, esrOut: 0 }), 'dvOut');
    const m = val(run({ ...p, esrOut: 2.87e-3 }), 'dvOut');
    expect(m).toBeLessThan(z);
    const r = run({ ...p, solveFor: 'esrOut', dvOut: 37.8e-3 });
    expect(r.status?.tone).not.toBe('fail');
    expect(val(run({ ...p, esrOut: val(r, 'esrOut') }), 'dvOut') / 37.8e-3).toBeCloseTo(1, 6);
    expect(run({ ...p, solveFor: 'esrOut', dvOut: 0.5 * m }).warnings[0]).toMatch(/No ESR gets below/);
  });
  it('buck → boost → buck restores Vout (remembered per topology)', async () => {
    const { runCompute } = await import('@/core/calc/page');
    const f = (def.fields[0] as any).fields.find((x: any) => x.key === 'topo');
    const st: any = { ...def.defaults() };
    runCompute(def, st);
    for (const t of ['boost', 'buck']) {
      st.topo = t;
      f.apply(t, st, st);
      runCompute(def, st);
    }
    expect(st.vout).toBe(3.3);
  });
});

describe('switcher ripple — examples', () => {
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

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe('switcher ripple — fuzz (runCompute)', () => {
  it('400 random states: never throws, finite output, solved values in range, stable on recompute', () => {
    const rnd = rng(5);
    let ok = 0;
    for (let k = 0; k < 400; k++) {
      const st: any = def.defaults();
      const walk = (fs: FieldSpec[]) => {
        for (const f of fs) {
          if (f.kind === 'section' || f.kind === 'group') walk(f.fields);
          else if (f.kind === 'select') st[f.key] = (f.options[Math.floor(rnd() * f.options.length)] as any).value;
          else if (f.kind === 'number') {
            const lo = f.min ?? 0;
            const hi = f.max ?? 1e3;
            st[f.key] = lo > 0 ? lo * (hi / lo) ** rnd() : rnd() < 0.1 ? 0 : hi * 1e-7 * 1e7 ** rnd();
            if (f.integer) st[f.key] = Math.max(1, Math.round(st[f.key]));
          }
        }
      };
      walk(def.fields);
      if (rnd() < 0.5) {
        st.vin = 1 + 50 * rnd();
        st.vout = st.topo === 'buck' ? st.vin * (0.1 + 0.8 * rnd()) : st.vin * (1.2 + 3 * rnd());
      }
      st.solveFor = def.solve!.options[Math.floor(rnd() * 5)].key;
      const s2 = normalizeState(def, st);
      const snap = JSON.stringify(s2);
      const r = runCompute(def, s2);
      expect(r.error ?? '', snap).not.toMatch(/is outside the range this input accepts/);
      if (!r.ok) continue;
      ok++;
      for (const x of r.results) {
        if (typeof x.value === 'number') expect(Number.isFinite(x.value), `${snap} ${x.key}`).toBe(true);
        expect(BAD.test(x.display), `${snap} ${x.display}`).toBe(false);
        if (x.solved && typeof x.value === 'number') {
          const f = findField(def.fields, x.key)?.field as any;
          if (f?.kind === 'number') {
            expect(x.value).toBeGreaterThanOrEqual(f.min * (1 - 1e-9));
            expect(x.value).toBeLessThanOrEqual(f.max * (1 + 1e-9));
          }
        }
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(BAD.test(w), w).toBe(false);
      for (const g of r.graphs) for (const s of g.series ?? []) expect([...s.x, ...s.y].every(Number.isFinite), `${snap} ${g.id}`).toBe(true);
      const r2 = runCompute(def, structuredClone(s2));
      for (const x of r.results.filter((y) => y.primary && typeof y.value === 'number')) expect(Math.abs(val(r2, x.key) - (x.value as number))).toBeLessThanOrEqual(1e-7 * Math.abs(x.value as number) + 1e-18);
    }
    expect(ok).toBeGreaterThan(150);
  });
});
