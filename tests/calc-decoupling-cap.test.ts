import { describe, expect, it } from 'vitest';
import { normalizeState, runCompute } from '@/core/calc/page';
import { findField } from '@/core/calc/fields';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';
import { def, type DecapState, group } from '@/calculators/decoupling-cap/def';
import { absC, bankZ, groupZ, mountL, peakSeeds, srf, targetZ, viaPairL, worstInBand } from '@/calculators/decoupling-cap/model';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const BAD = /NaN|undefined|Infinity/;

// ── generic fuzz support: random states inside every field's min/max and every select option
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
function randomState(d: CalcDef<any>, rnd: () => number, extra: Record<string, unknown[]>): any {
  const st: any = d.defaults();
  const num = (f: Extract<FieldSpec, { kind: 'number' }>) => {
    const lo = f.min ?? -1e3;
    const hi = f.max ?? 1e3;
    // spread magnitudes over the whole range: log-uniform for wide ranges (with 0 or negatives too)
    let v: number;
    const span = Math.max(Math.abs(lo), Math.abs(hi));
    if (lo > 0 && hi / lo > 100) v = lo * (hi / lo) ** rnd();
    else if (lo >= 0 && hi > 100 * Math.max(lo, 1e-300)) v = rnd() < 0.05 ? lo : hi * 1e-7 * 1e7 ** rnd();
    else if (lo < 0 && span > 100) v = Math.min(Math.max((rnd() < 0.5 ? -1 : 1) * span * 1e-7 * 1e7 ** rnd(), lo), hi);
    else v = lo + (hi - lo) * rnd();
    return f.integer ? Math.max(Math.round(v), Math.ceil(lo)) : v;
  };
  const walk = (fs: FieldSpec[], into: any) => {
    for (const f of fs) {
      if (f.kind === 'section' || f.kind === 'group') walk(f.fields, into);
      else if (f.kind === 'select') {
        const o = f.options[Math.floor(rnd() * f.options.length)];
        into[f.key] = typeof o === 'string' ? o : o.value;
      } else if (f.kind === 'number' && !f.output) into[f.key] = num(f);
      else if (f.kind === 'list') {
        const n = 1 + Math.floor(rnd() * Math.min(f.maxItems ?? 4, 4));
        into[f.key] = Array.from({ length: n }, () => {
          const item = f.create(undefined);
          walk(f.fields, item);
          return item;
        });
      }
    }
  };
  walk(d.fields, st);
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
function fuzz(d: CalcDef<any>, n: number, seed: number, extra: Record<string, unknown[]>, post?: (st: any, rnd: () => number) => void) {
  const rnd = rng(seed);
  let ok = 0;
  for (let k = 0; k < n; k++) {
    const raw = randomState(d, rnd, extra);
    post?.(raw, rnd);
    const st = normalizeState(d, raw);
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

const run = (p: Partial<DecapState>) => def.compute({ ...def.defaults(), ...p });
const MU0 = 1.25663706212e-6;

describe('decoupling — published relations', () => {
  it('target impedance Z_t = V·ripple/ΔI (Smith et al. 1999): 1.8 V, 5 %, 1 A → 90 mΩ', () => expect(targetZ(1.8, 5, 1)).toBeCloseTo(0.09, 15));
  it('via pair: Smith & Bogatin’s “≈ 10 pH per mil of length × ln(s/r)” is the s ≫ d form of (μ₀h/π)·acosh(s/d)', () => {
    const h = 10 * 25.4e-6;
    const l = viaPairL(h, 20 * 0.3e-3, 0.3e-3);
    expect(l / (10.16e-12 * 10 * Math.log((20 * 0.3e-3) / 0.15e-3))).toBeCloseTo(1, 3);
  });
  it('a capacitor at its mounted SRF shows only its ESR (÷N)', () => {
    const g = { n: 4, c: 100e-9, esr: 20e-3, esl: 0.4e-9 };
    const z = groupZ(g, 0.3e-9, srf(g.c, g.esl + 0.3e-9));
    expect(z.re).toBeCloseTo(5e-3, 15);
    expect(Math.abs(z.im)).toBeLessThan(1e-12);
  });
});

describe('decoupling — independent Python reference (decap.py: dense 20 001-point grid + brute-force counts, 168 states, all solve options; counts identical, worst |Z| within 1.5e-6)', () => {
  it('default mounting inductance', () => expect(res(run({}), 'lMount')).toBeCloseTo(4.4107553339425637e-10, 22));
  it('default worst in-band |Z| (at the 100 MHz band edge)', () => expect(res(run({}), 'zMax') / 0.0788011940800324).toBeCloseTo(1, 6));
  it('via pair 0.2 mm long, 1.2 mm apart, 0.3 mm', () => expect(viaPairL(0.2e-3, 1.2e-3, 0.3e-3)).toBeCloseTo(1.6507496560150767e-10, 22));
});

describe('decoupling — solves', () => {
  for (const [i, p] of ([{}, { v: 1.0, ripple: 3, dI: 1, fHi: 50e6 }, { fLo: 1e6, fHi: 300e6, lsp: 0, cp: 5e-9 }] as Partial<DecapState>[]).entries()) {
    it(`case ${i}: the count passes and one fewer does not`, () => {
      const r = run({ ...p, solveFor: 'n', solveGroup: 2 });
      expect(r.ok).toBe(true);
      const n = res(r, 'groups.2.n');
      expect(n).toBeGreaterThanOrEqual(1);
      const zt = res(r, 'zt');
      const with_ = (k: number) => run({ ...p, solveFor: 'zt', groups: def.defaults().groups.map((g, j) => (j === 2 ? { ...g, n: k } : g)) });
      expect(res(with_(n), 'zMax')).toBeLessThanOrEqual(zt);
      if (n > 1) expect(res(with_(n - 1), 'zMax')).toBeGreaterThan(zt);
    });
    it(`case ${i}: the largest step, fed back, sits exactly on the target`, () => {
      const r = run({ ...p, solveFor: 'dI' });
      const back = run({ ...p, solveFor: 'zt', dI: res(r, 'dI') });
      expect(res(back, 'zMax') / res(back, 'zt')).toBeCloseTo(1, 9);
    });
  }
  it('no count can beat the spreading inductance: NO SOLUTION with the reason', () => {
    const r = run({ solveFor: 'n', solveGroup: 2, lsp: 1e-9, dI: 5 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.warnings.join()).toMatch(/spreading inductance/);
  });
});

describe('decoupling — review regressions', () => {
  // reviewer's random 'n' solve: four groups, narrow high-Q anti-resonance at 195 MHz between grid points
  const REV: Partial<DecapState> = {
    solveFor: 'n', solveGroup: 0, v: 0.6213566474997818, ripple: 1.287428859271894, dI: 0.0540918054151331, fLo: 134148.23532176213, fHi: 791357367.8111475,
    groups: [
      { pkg: '1206', n: 2, c: 4.189159605187016e-5, cUnit: 'µF', esr: 0.0013295758879479334, esrUnit: 'mΩ', esl: 1.709538971874136e-10, eslUnit: 'nH' },
      { pkg: '0805', n: 40, c: 2.6036417464649258e-6, cUnit: 'µF', esr: 0.42307225224327044, esrUnit: 'mΩ', esl: 5.848593208359972e-10, eslUnit: 'nH' },
      { pkg: '0201', n: 2, c: 3.85938268751617e-10, cUnit: 'pF', esr: 0.0018680358358003392, esrUnit: 'mΩ', esl: 1.2090346147652018e-10, eslUnit: 'nH' },
      { pkg: '0402', n: 2, c: 2.406122337339329e-10, cUnit: 'pF', esr: 0.33929439234257114, esrUnit: 'mΩ', esl: 8.088695383227826e-10, eslUnit: 'nH' },
    ],
    h: 8.050626839997055e-5, dv: 3.8177637128008503e-4, s: 6.756665011638295e-4, len: 2.732727909653357e-3, w: 1.7977770310430668e-4, cp: 0, lsp: 1.0442471123620617e-11,
  };
  it('the narrow 195 MHz anti-resonance is found: N = 84 (was 54); a 400 000-point scan agrees (83 → 148.70 mΩ > Z_t, 84 → 147.72 mΩ)', () => {
    const r = run(REV);
    expect(res(r, 'groups.0.n')).toBe(84);
    expect((r.details as any).worst.f).toBeCloseTo(195.66e6, -5);
    const zt = res(r, 'zt');
    const at = (n: number) => res(run({ ...REV, solveFor: 'zt', groups: REV.groups!.map((g, i) => (i === 0 ? { ...g, n } : g)) }), 'zMax');
    expect(at(84) / 0.1477216666409461).toBeCloseTo(1, 5); // the refined peak sits a hair above the scan's best point
    expect(at(83)).toBeGreaterThan(zt);
  });
  it('band search never under-reads a dense scan (60 random low-ESR banks, 40 000 points each)', () => {
    let seed = 2024;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let k = 0; k < 60; k++) {
      const gs = Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({ n: 1 + Math.floor(rnd() * 40), c: 10 ** (-10 + 5.5 * rnd()), esr: 10 ** (-3.3 + 2.5 * rnd()), esl: 1e-10 * (1 + 9 * rnd()) }));
      const lm = 1e-10 * (1 + 20 * rnd());
      const lsp = rnd() < 0.5 ? 0 : 1e-11 * (1 + 10 * rnd());
      const cp = rnd() < 0.5 ? 0 : 1e-9 * (1 + 10 * rnd());
      const zf = (f: number) => absC(bankZ(gs, lm, lsp, cp, f));
      const w = worstInBand(zf, 1e5, 1e9, 240, peakSeeds(gs, lm, lsp, cp));
      let dense = 0;
      for (let i = 0; i < 40000; i++) dense = Math.max(dense, zf(1e5 * 1e4 ** (i / 39999)));
      expect(w.z, `bank ${k}`).toBeGreaterThanOrEqual(dense * (1 - 1e-6));
    }
  });
  it('NO SOLUTION still shows the mounting inductance (it does not depend on N)', () => {
    const r = run({ solveFor: 'n', solveGroup: 2, lsp: 1e-9, dI: 5 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(res(r, 'lMount')).toBeCloseTo(mountL({ h: 0.2e-3, dv: 0.3e-3, s: 1.8e-3, len: 0.35e-3, w: 0.3e-3 }).total, 20);
  });
  it('vias closer than any part’s pad pitch are flagged', () => expect(run({ s: 0.5e-3 }).warnings.join()).toMatch(/pad pitch/));
});

describe('decoupling — physics', () => {
  it('more capacitors never raise the worst in-band impedance here', () => {
    let prev = Infinity;
    for (const n of [1, 2, 4, 8, 16, 32]) {
      const z = res(run({ groups: def.defaults().groups.map((g, j) => (j === 2 ? { ...g, n } : g)) }), 'zMax');
      expect(z).toBeLessThanOrEqual(prev * (1 + 1e-9));
      prev = z;
    }
  });
  it('mounting inductance grows with depth, trace length and via spacing; via-in-pad removes the trace part', () => {
    const m = { h: 0.2e-3, dv: 0.3e-3, s: 1.2e-3, len: 0.4e-3, w: 0.3e-3 };
    expect(mountL({ ...m, h: 0.4e-3 }).total).toBeGreaterThan(mountL(m).total);
    expect(mountL({ ...m, len: 1e-3 }).total).toBeGreaterThan(mountL(m).total);
    expect(mountL({ ...m, s: 2e-3 }).total).toBeGreaterThan(mountL(m).total);
    expect(mountL({ ...m, len: 0 }).lTrace).toBe(0);
    expect(mountL(m).lVia).toBeCloseTo(((MU0 * 0.2e-3) / Math.PI) * Math.acosh(4), 22);
  });
  it('low-ESR caps of distant values anti-resonate far above the target (the anti-res example)', () => {
    const r = def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === 'anti-res')!.state });
    expect(res(r, 'zMax') / res(r, 'zt')).toBeGreaterThan(10);
    expect(r.tables.find((t) => t.id === 'peaks')!.rowTones).toContain('fail');
  });
  it('the plane capacitance dominates at high frequency', () => {
    const z = absC(bankZ([{ n: 1, c: 1e-6, esr: 0.01, esl: 1e-9 }], 0, 0, 1e-9, 10e9));
    expect(z * 2 * Math.PI * 10e9 * 1e-9).toBeCloseTo(1, 1);
  });
});

describe('decoupling — validity', () => {
  it('a failing bank says where and what to do', () => expect(run({ dI: 5 }).warnings.join()).toMatch(/reaches .* the target/));
  it('planes far below the parts', () => expect(run({ h: 2e-3 }).warnings.join()).toMatch(/via loop alone/));
  it('narrow pad traces are noted', () => expect(run({ w: 0.1e-3 }).notes.join()).toMatch(/narrower than their height/));
  it('a group resonating far above the band is noted', () => expect(run({ groups: [group('0201', 4, 1e-12, 0.1)] }).notes.join()).toMatch(/far above the band/));
  it('via spacing not larger than the via is refused', () => expect(() => def.compute({ ...def.defaults(), s: 0.2e-3 })).toThrow(/via spacing/));
});

describe('decoupling — examples and fuzz', () => {
  it('every example computes; the first is the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, normalizeState(def, { ...def.defaults(), ...structuredClone(ex.state) }));
      expect(r.ok, ex.id).toBe(true);
      expect(r.status?.text ?? '', ex.id).not.toBe('NO SOLUTION');
      checkReport(r);
    }
  });
  it('removing a group above the solved one keeps the same group solved', () => {
    const st: any = normalizeState(def, { ...def.defaults(), solveFor: 'n', solveGroup: 2 });
    runCompute(def, st);
    st.groups.splice(0, 1);
    runCompute(def, st);
    expect(st.solveGroup).toBe(1);
    expect(st.solveFor).toBe('n');
  });
  it('320 random states (1–4 random groups) through runCompute: no throw, finite, stable', () => {
    const ok = fuzz(def, 320, 31337, {}, (st, rnd) => {
      st.solveGroup = Math.floor(rnd() * st.groups.length);
      if (st.fHi <= st.fLo) st.fHi = st.fLo * (2 + 1000 * rnd());
      if (st.s <= st.dv) st.s = st.dv * (1.5 + 5 * rnd());
    });
    expect(ok).toBeGreaterThan(250);
  }, 120000);
});
