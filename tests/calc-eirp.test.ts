import { describe, expect, it } from 'vitest';
import { def, type EirpState } from '@/calculators/eirp/def';
import { LIMITS, dbmToW, maxGain, wToDbm } from '@/calculators/eirp/model';
import { normalizeState, runCompute } from '@/core/calc/page';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<EirpState>) => {
  const st = { ...def.defaults(), ...p };
  def.sync!(st);
  return def.compute(st);
};
const O = { user: 0, bw: 20e6 };
const ex = (id: string) => run(def.examples!.find((e) => e.id === id)!.state);

// ── generic fuzz helpers (field walk, random state, sanity of a report)
type NumF = { key: string; min: number; max: number; integer?: boolean };
function walk(fs: FieldSpec[], nums: NumF[], sels: { key: string; opts: (string | number)[] }[]) {
  for (const f of fs) {
    if (f.kind === 'section' || f.kind === 'group') walk(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? -1e3, max: f.max ?? 1e3, integer: f.integer });
    else if (f.kind === 'select') sels.push({ key: f.key, opts: f.options.map((o) => (typeof o === 'string' ? o : o.value)) });
  }
}
function fuzzStates(d: CalcDef<any>, n: number, seed = 7): Record<string, any>[] {
  const nums: NumF[] = [];
  const sels: { key: string; opts: (string | number)[] }[] = [];
  walk(d.fields, nums, sels);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const out: Record<string, any>[] = [];
  for (let i = 0; i < n; i++) {
    const st: Record<string, any> = { ...d.defaults() };
    for (const sel of sels) st[sel.key] = sel.opts[Math.floor(rnd() * sel.opts.length)];
    for (const f of nums) {
      let v = f.min > 0 && f.max / f.min > 100 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      if (f.integer) v = Math.round(v);
      st[f.key] = v;
    }
    if (d.solve) st.solveFor = d.solve.options[i % d.solve.options.length].key;
    out.push(st);
  }
  return out;
}
function sane(r: CalcReport) {
  for (const x of r.results) {
    if (typeof x.value === 'number') expect(Number.isFinite(x.value), x.key).toBe(true);
    expect(/NaN|undefined|Infinity/.test(x.display), `${x.key}: ${x.display}`).toBe(false);
  }
  for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(/NaN|undefined|Infinity/.test(v), v).toBe(false);
  for (const g of r.graphs) for (const sr of g.series ?? []) {
    expect(sr.x.every(Number.isFinite) && sr.y.every(Number.isFinite), `${g.id}/${sr.label}`).toBe(true);
  }
  for (const w of [...r.warnings, ...r.notes, r.summary ?? '', r.error ?? '']) expect(/NaN|undefined|Infinity/.test(w), w).toBe(false);
}

describe('EIRP — rule text and unit conversions', () => {
  it('dBm ↔ W: 30 dBm = 1 W, 36 dBm = 3.98 W, 20 dBm = 100 mW, 0.125 W = 20.97 dBm', () => {
    expect(dbmToW(30)).toBeCloseTo(1, 12);
    expect(dbmToW(36)).toBeCloseTo(3.981, 3);
    expect(dbmToW(20)).toBeCloseTo(0.1, 12);
    expect(wToDbm(0.125)).toBeCloseTo(20.969, 3);
  });
  it('47 CFR 15.247(b)(3)/(b)(4): 1 W conducted, minus (G − 6 dBi) → 36 dBm EIRP ceiling for any gain ≥ 6 dBi with a lossless feed', () => {
    for (const g of [6, 9, 12, 20, 24]) {
      const r = run({ limit: 'fcc-dts', g, pt: 30 - (g - 6), lc: 0, lo: 0 });
      expect(res(r, 'eirp')).toBeCloseTo(36, 12);
      expect(res(r, 'margin')).toBeCloseTo(0, 12);
    }
    expect(LIMITS['fcc-dts'].max(3, O)).toBe(30); // below 6 dBi no reduction
  });
  it('§15.247(c)(1)(i): 2.4 GHz point-to-point, 24 dBi → 30 − 18/3 = 24 dBm (48 dBm EIRP lossless); (c)(1)(ii): 5.8 GHz no reduction', () => {
    expect(LIMITS['fcc-p2p-24'].max(24, O)).toBeCloseTo(24, 12);
    expect(LIMITS['fcc-p2p-58'].max(30, O)).toBe(30);
    expect(maxGain({ pt: 24, lc: 0, lo: 0, g: 24 }, 'fcc-p2p-24', O)).toBeCloseTo(24, 12);
    expect(maxGain({ pt: 30, lc: 0, lo: 0, g: 24 }, 'fcc-p2p-58', O)).toBe(Infinity);
  });
  it('ETSI EN 300 328 §4.3.2.2.3: 20 dBm e.i.r.p. → 15.8 dBm with a 5 dBi antenna and 0.8 dB feed', () => {
    const r = ex('etsi-max-pt');
    expect(res(r, 'pt')).toBeCloseTo(15.8, 12);
    expect(r.status?.text).toBe('WITHIN LIMIT');
  });
  it('ERP = EIRP − 2.15 dB; dBd = dBi − 2.15 (half-wave dipole, Balanis §4.6)', () => {
    const r = run({});
    expect(res(r, 'eirp') - res(r, 'erp')).toBeCloseTo(2.15, 12);
    const d = run({ gForm: 'dBd', gd: 5 });
    expect(res(d, 'gDbi')).toBeCloseTo(7.15, 12);
  });
});

describe('EIRP — independent Python reference (eirp_ref.py, computed in watts)', () => {
  it('defaults, the 2.4 GHz point-to-point example and the 868 MHz ERP example', () => {
    const a = run({});
    expect(res(a, 'eirp')).toBeCloseTo(26.0, 12);
    expect(res(a, 'margin')).toBeCloseTo(8.0, 12);
    expect(res(a, 'ptMax')).toBeCloseTo(28.0, 12);
    const b = ex('p2p-24');
    expect(res(b, 'eirp')).toBeCloseTo(44.51029995663981, 12);
    expect(res(b, 'margin')).toBeCloseTo(0.9897000433601872, 12);
    const c = ex('srd-868-erp');
    expect(res(c, 'g')).toBeCloseTo(5.149999999999998, 12);
    expect(res(c, 'erp')).toBeCloseTo(14, 12);
  });
});

describe('EIRP — solve round trips', () => {
  it('P_t, G (dBi and dBd) and L_c solved for a target EIRP feed back to that EIRP', () => {
    const pts: Partial<EirpState>[] = [{}, { pt: 10, lc: 3, lo: 1, g: 2 }, { ptForm: 'W', ptW: 5, lc: 0.3, lo: 0.2, g: 27 }, { gForm: 'dBd', gd: 9, pt: 27, lc: 6, lo: 0 }];
    for (const p of pts) {
      const fwd = run({ ...p, solveFor: 'eirp' });
      const target = res(fwd, 'eirp') - 1.7; // below the present EIRP so the cable-loss solve has a positive answer
      for (const k of ['pt', 'g', 'lc'] as const) {
        const sol = run({ ...p, solveFor: k, eirp: target });
        expect(sol.ok, k).toBe(true);
        const back = run({ ...p, solveFor: 'eirp', pt: res(sol, 'ptDbm'), ptW: dbmToW(res(sol, 'ptDbm')), g: res(sol, 'gDbi'), gd: res(sol, 'gDbi') - 2.15, lc: res(sol, 'lossTotal') - (p.lo ?? 0.5) });
        expect(res(back, 'eirp')).toBeCloseTo(target, 9);
      }
    }
  });
  it('a cable cannot add power; out-of-range solutions fail cleanly', () => {
    const r = run({ solveFor: 'lc', eirp: 40 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.warnings[0]).toMatch(/no cable loss can reach it/);
    expect(res(r, 'lc')).toBeNull();
    expect(run({ solveFor: 'g', eirp: 140 }).warnings[0]).toMatch(/outside −50/);
    expect(run({ ptForm: 'W', ptW: 0 }).ok).toBe(false);
  });
});

describe('EIRP — physics sanity and limit checks', () => {
  it('+3 dB gain → +3 dB EIRP; doubling power in watts → +3.01 dB', () => {
    expect(res(run({ g: 11 }), 'eirp') - res(run({ g: 8 }), 'eirp')).toBeCloseTo(3, 12);
    expect(res(run({ ptForm: 'W', ptW: 0.2 }), 'eirp') - res(run({ ptForm: 'W', ptW: 0.1 }), 'eirp')).toBeCloseTo(3.0103, 4);
  });
  it('over-limit example fails with a fix; large feed loss warns; every preset gives a margin', () => {
    const r = ex('over-limit');
    expect(r.status?.text).toBe('OVER LIMIT');
    expect(r.warnings[0]).toMatch(/Reduce the transmit power to 22.00 dBm/);
    expect(run({ lc: 12 }).warnings.some((w) => /feed loses/.test(w))).toBe(true);
    for (const id of Object.keys(LIMITS)) expect(Number.isFinite(res(run({ limit: id as EirpState['limit'] }), 'margin'))).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
});

describe('EIRP — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = run(e.state);
      expect(r.ok, e.id).toBe(true);
      sane(r);
    }
  });
  it('300+ random states through runCompute: no throw, finite values, no NaN text, never OUT OF RANGE, stable recompute', () => {
    for (const raw of fuzzStates(def, 320, 31)) {
      const st = normalizeState(def, raw);
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      expect(r.status?.text, JSON.stringify(raw)).not.toBe('OUT OF RANGE');
      if (!r.ok) {
        expect(r.error).toBeTruthy();
        continue;
      }
      sane(r);
      // runCompute wrote the solved values into st: recomputing that state gives the same answer
      const r2 = runCompute(def, { ...st });
      expect(r2.ok, JSON.stringify(raw)).toBe(true);
      for (const x of r.results.filter((q) => q.solved && typeof q.value === 'number')) expect(res(r2, x.key) / (x.value as number)).toBeCloseTo(1, 9);
    }
  }, 60000);
});

describe('EIRP — review fixes', () => {
  const rc = (p: Partial<EirpState>) => runCompute(def, normalizeState(def, { ...def.defaults(), ...p }));
  it('#11 the EIRP box covers every analysis: 100 dBm into 70 dBi, and −100 dBm through 200 dB of loss into −50 dBi', () => {
    const hi = rc({ pt: 100, g: 70, lc: 0, lo: 0 });
    expect(hi.ok).toBe(true);
    expect(res(hi, 'eirp')).toBeCloseTo(170, 9);
    const lo = rc({ pt: -100, g: -50, lc: 100, lo: 100 });
    expect(lo.ok).toBe(true);
    expect(res(lo, 'eirp')).toBeCloseTo(-350, 9);
  });
  it('#12 ETSI EN 300 328 non-FHSS PSD (10 dBm/MHz, §4.3.2.3.3) caps narrow signals', () => {
    const r2 = run({ limit: 'etsi-328', bw: 2e6, pt: 10, lc: 0, lo: 0, g: 0 });
    expect(res(r2, 'limitValue')).toBeCloseTo(10 + 10 * Math.log10(2), 9);
    expect(res(r2, 'psd')).toBeCloseTo(10 - 10 * Math.log10(2), 9);
    expect(res(run({ limit: 'etsi-328', bw: 20e6 }), 'limitValue')).toBe(20); // power limit binds above 10 MHz
    expect(res(run({ limit: 'etsi-328', bw: 200e3 }), 'limitValue')).toBe(10); // all power in one MHz
    expect(res(run({ limit: 'etsi-328-fhss', bw: 1e6 }), 'limitValue')).toBe(20);
    expect(run({ limit: 'etsi-328', bw: 1e6 }).notes.some((n) => /10 dBm per MHz/.test(n))).toBe(true);
  });
  it('#13 FCC presets: 902 MHz FHSS 25–49 ch 0.25 W (b)(2); 2.4 GHz FHSS point-to-point (c)(1)(i); 1 W label covers FHSS', () => {
    expect(LIMITS['fcc-fhss-900'].max(6, O)).toBeCloseTo(wToDbm(0.25), 12);
    expect(LIMITS['fcc-fhss-900'].max(9, O)).toBeCloseTo(wToDbm(0.25) - 3, 12);
    expect(LIMITS['fcc-fhss-24-p2p'].max(24, O)).toBeCloseTo(wToDbm(0.125) - 6, 12);
    expect(LIMITS['fcc-dts'].label).toMatch(/FHSS/);
    expect(maxGain({ pt: 20, lc: 0, lo: 0, g: 0 }, 'fcc-fhss-900', O)).toBeCloseTo(6 + wToDbm(0.25) - 20, 12);
  });
  it('#14 the EN 300 328 note cites the wideband definition §4.3.2.2.2', () => {
    expect(run({ limit: 'etsi-328' }).notes.some((n) => n.includes('§4.3.2.2.2'))).toBe(true);
  });
  it('every limit preset computes through runCompute', () => {
    for (const id of Object.keys(LIMITS)) expect(rc({ limit: id as EirpState['limit'] }).ok, id).toBe(true);
  });
});
