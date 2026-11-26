import { describe, expect, it } from 'vitest';
import { def, paramsOf, type BldcState } from '@/calculators/bldc-efficiency/def';
import { bestTorque, point } from '@/calculators/bldc-efficiency/model';
import { RPM } from '@/calculators/dc-motor-speed/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import type { SelectField } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<BldcState>) => def.compute({ ...def.defaults(), ...p });

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
describe('BLDC — published formula and Python reference', () => {
  it('maxon “Key information”: on the 24 V speed–torque line the best efficiency is (1 − √(I₀/I_A))²', () => {
    const ex = { ...def.defaults(), ...def.examples!.find((e) => e.id === 'maxon-check')!.state } as BldcState;
    const iA = 24 / 0.608;
    const etaMax = (1 - Math.sqrt(0.234 / iA)) ** 2;
    const r = def.compute(ex);
    expect(res(r, 'etaSys')).toBeCloseTo(etaMax, 12);
    expect(res(r, 'etaSys')).toBeCloseTo(0.8519409875606387, 12); // Python
    // no torque on the line does better
    for (const f of [0.5, 0.8, 0.95, 1.05, 1.3, 2]) {
      const q = def.compute({ ...ex, tq: ex.tq * f });
      expect(res(q, 'etaSys')).toBeLessThan(etaMax + 1e-12);
    }
    // speed on the line: n = (V − I·R)/K
    const i = 0.234 + ex.tq / 36.9e-3;
    expect(res(r, 'n')).toBeCloseTo((24 - i * 0.608) / 36.9e-3, 9);
  });
  it('defaults (48 V FOC) match the Python implementation (bl.py)', () => {
    const r = run({});
    expect(res(r, 'i')).toBeCloseTo(5.602001548538476, 12);
    expect(res(r, 'etaSys')).toBeCloseTo(0.9025419106262202, 13);
    expect(res(r, 'pLoss')).toBeCloseTo(21.711026708351085, 11);
    expect(res(r, 'mod')).toBeCloseTo(0.6765471950416503, 13);
  });
  it('top speed at 0.64 N·m on 48 V matches Python: 471.437 rad/s', () => {
    const r = run({ solveFor: 'n' });
    expect(res(r, 'n')).toBeCloseTo(471.4366638309448, 8);
    expect(res(r, 'etaSys')).toBeCloseTo(0.909615701021891, 10);
  });
});

describe('BLDC — solve round trips', () => {
  const pts: Partial<BldcState>[] = [
    {},
    { drive: 'block', kForm: 'k', k: 0.05, rLL: 0.3, lossForm: 'noload', i0: 0.4, n0: 4000 * RPM, eddy: 40, tq: 0.2, n: 2500 * RPM },
    { drive: 'sine', tq: 0.05, n: 500 * RPM, tW: 100 },
    { drive: 'block', kForm: 'kv', kv: 1000 * RPM, rLL: 0.05, vdc: 22.2, tq: 0.05, n: 15000 * RPM, lossForm: 'coeff' },
  ];
  for (const p of pts) {
    it(`current ↔ torque and top speed ↔ modulation (${JSON.stringify(p).slice(0, 80)})`, () => {
      const a = run({ ...p, solveFor: 'i' });
      expect(a.ok).toBe(true);
      const i = res(a, 'i');
      const b = run({ ...p, solveFor: 'tq', i });
      expect(res(b, 'tq') / (p.tq ?? 0.64)).toBeCloseTo(1, 10);
      const c = run({ ...p, solveFor: 'n' });
      const n = res(c, 'n');
      const d = run({ ...p, solveFor: 'i', n });
      expect(res(d, 'mod')).toBeCloseTo(1, 9);
    });
  }
});

describe('BLDC — physics', () => {
  it('copper loss: I²R_LL for block, 1.5·I²R_LL for sinusoidal; doubling R doubles it', () => {
    const b = point({ ...paramsOf(def.defaults()), drive: 'block' }, 300, 0.5);
    expect(b.pCu).toBeCloseTo(b.current ** 2 * 0.2, 12);
    const s = point(paramsOf(def.defaults()), 300, 0.5);
    expect(s.pCu).toBeCloseTo(1.5 * s.current ** 2 * 0.2, 12);
    const s2 = point({ ...paramsOf(def.defaults()), rLL: 0.4 }, 300, 0.5);
    expect(s2.pCu / s.pCu).toBeCloseTo(2, 12);
  });
  it('iron loss equals P_Fe,ref at n_ref, ∝ n for pure hysteresis and ∝ n² for pure eddy', () => {
    const p = paramsOf(def.defaults());
    const w = def.defaults().nRef;
    expect(point(p, w, 0.3).pFe).toBeCloseTo(6, 12);
    const hy = { ...p, loss: { ...(p.loss as any), hyst: 1 } };
    expect(point(hy, 2 * w, 0.3).pFe).toBeCloseTo(12, 12);
    const ed = { ...p, loss: { ...(p.loss as any), hyst: 0 } };
    expect(point(ed, 2 * w, 0.3).pFe).toBeCloseTo(24, 12);
  });
  it('power balance: P_dc = shaft + all losses; efficiencies multiply', () => {
    const q = point(paramsOf(def.defaults()), 400, 0.7);
    expect(q.pDc).toBeCloseTo(q.pShaft + q.pCu + q.pFe + q.pFw + q.pNoLoad + q.pCond + q.pSw + q.pCtrl, 10);
    expect(q.etaSys).toBeCloseTo(q.etaMotor * q.etaInv, 14);
  });
  it('best-efficiency torque beats its neighbours and the top speed falls with torque', () => {
    const p = paramsOf(def.defaults());
    const b = bestTorque(p, 314, 3);
    for (const f of [0.8, 0.95, 1.05, 1.25]) expect(point(p, 314, b.t * f).etaSys).toBeLessThan(b.eta + 1e-12);
    const n1 = res(run({ solveFor: 'n', tq: 0.3 }), 'n');
    const n2 = res(run({ solveFor: 'n', tq: 1.2 }), 'n');
    expect(n2).toBeLessThan(n1);
  });
  it('switching loss is linear in f_sw and t_sw; conduction in R_DS(on)', () => {
    const p = paramsOf(def.defaults());
    const a = point(p, 300, 0.5);
    expect(point({ ...p, fsw: 2 * p.fsw }, 300, 0.5).pSw / a.pSw).toBeCloseTo(2, 12);
    expect(point({ ...p, tsw: 3 * p.tsw }, 300, 0.5).pSw / a.pSw).toBeCloseTo(3, 12);
    expect(point({ ...p, rds: 2 * p.rds }, 300, 0.5).pCond / a.pCond).toBeCloseTo(2, 12);
  });
});

describe('BLDC — review fixes', () => {
  it('out-of-range solved current, torque and K_t give specific errors', () => {
    const a = run({ nRef: 1e-3 });
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/100 kA/);
    const b = run({ solveFor: 'tq', k: 100, i: 1e5, lLL: 0 });
    expect(b.ok).toBe(false);
    expect(b.error).toMatch(/100 kN·m/);
    const c = run({ drive: 'block', kForm: 'kv', kv: 1e-3 });
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/100 N·m\/A/);
  });
  it('best-efficiency torque stays within the voltage limit; none is offered when nothing is reachable', () => {
    const ov = run({ n: 5000 * RPM, tq: 1 });
    expect(res(ov, 'bestTorque')).toBeUndefined();
    expect(ov.warnings.some((w) => w.includes('no torque is reachable'))).toBe(true);
    expect(ov.graphs.find((g) => g.id === 'map')!.subtitle).toMatch(/beyond the limit/);
    const near = run({ n: 4400 * RPM, tq: 0.3 });
    const bt = res(near, 'bestTorque');
    expect(point(paramsOf({ ...def.defaults(), n: 4400 * RPM }), 4400 * RPM, bt).mod).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('K_v follows K_t in block mode (sync + write-back)', () => {
    const st = { ...def.defaults(), drive: 'block' as const, k: 0.05 };
    runCompute(def, st);
    expect(st.kv).toBeCloseTo(20, 12);
  });
});

describe('BLDC — warnings, errors, examples', () => {
  it('voltage limit, low margin, extrapolation, temperature and f_e warnings', () => {
    const ov = run({ n: 5000 * RPM, tq: 1 });
    expect(ov.status?.text).toBe('VOLTAGE LIMIT');
    expect(run({ n: 4400 * RPM, tq: 0.64 }).warnings.some((w) => w.includes('voltage margin'))).toBe(true);
    expect(run({ nRef: 1000 * RPM }).warnings.some((w) => w.includes('3 × n_ref'))).toBe(true);
    expect(run({ lossForm: 'noload', n0: 1000 * RPM }).warnings.some((w) => w.includes('2 × n₀'))).toBe(true);
    expect(run({ tW: 180 }).warnings.some((w) => w.includes('insulation'))).toBe(true);
    expect(run({ fsw: 1.5e3 }).warnings.some((w) => w.includes('f_sw/10'))).toBe(true);
  });
  it('impossible requests and bad inputs come back as errors', () => {
    expect(run({ solveFor: 'tq', i: 0.01 }).ok).toBe(false);
    expect(run({ solveFor: 'n', tq: 50 }).ok).toBe(false);
    expect(run({ rLL: 0 }).ok).toBe(false);
    expect(run({ hyst: 150 }).ok).toBe(false);
    expect(run({ k: NaN }).ok).toBe(false);
  });
  it('every example computes and the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      checkReport(r);
    }
  });
  it('fuzz: 400 random states in every field range and option', () => {
    const ok = fuzz(def, 400, 13, { kForm: ['k', 'kv'] });
    expect(ok).toBeGreaterThan(100);
  });
  it('computes in well under 50 ms', () => {
    run({});
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) run({ tq: 0.5 + k / 100 });
    expect((performance.now() - t0) / 10).toBeLessThan(25);
  });
});

describe('BLDC — mode-switch regressions', () => {
  const sel = (st: any, key: string, v: unknown) => {
    const f = findField(def.fields, key)!.field as SelectField;
    st[key] = v;
    f.apply?.(v, st, st);
    return runCompute(def as any, st);
  };
  const ex = (id: string) => ({ ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === id)!.state) }) as any;
  it('drive switch with "torque for a current" solves the current instead (current convention changes)', () => {
    const st = ex('drone');
    runCompute(def as any, st);
    const tq = st.tq;
    const r = sel(st, 'drive', 'sine');
    expect(r.ok).toBe(true);
    expect(st.solveFor).toBe('i');
    expect(st.tq).toBe(tq);
    // and back: the block-drive current for that torque is the 10 A of the example
    sel(st, 'drive', 'block');
    expect(st.i).toBeCloseTo(10, 9);
  });
  it('top speed writes the current back, so ◎ T afterwards returns the same torque', () => {
    const st = ex('top-speed');
    runCompute(def as any, st);
    st.solveFor = 'tq';
    runCompute(def as any, st);
    expect(st.tq).toBeCloseTo(0.64, 9);
  });
  it('efficiency map is not empty above the voltage limit', () => {
    const st = { ...def.defaults(), n: 30000 * RPM };
    const r = runCompute(def as any, st);
    const g = r.graphs.find((x) => x.id === 'map')!;
    expect(g.series!.length).toBeGreaterThan(1);
  });
});
