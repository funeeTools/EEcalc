import { describe, expect, it } from 'vitest';
import { def, type HornState } from '@/calculators/horn-antenna/def';
import { balanisDesign, directivity, fresnel, optimumGeom, patternE } from '@/calculators/horn-antenna/model';
import { hornDiagram } from '@/calculators/horn-antenna/diagram';
import { theory } from '@/calculators/horn-antenna/theory';
import { normalizeState, runCompute } from '@/core/calc/page';
import type { CalcDef, CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<HornState>) => def.compute({ ...def.defaults(), ...p });
const ex = (id: string) => def.compute({ ...def.defaults(), ...def.examples!.find((e) => e.id === id)!.state } as HornState);
const INCH = 0.0254;
const C0 = 299792458;

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

describe('horn — Fresnel integrals and Balanis eq. 13-52', () => {
  it('C(x), S(x) match Abramowitz & Stegun Table 7.7 (values by 20 000-point quadrature)', () => {
    const ref: [number, number, number][] = [[0.5, 0.4923442258714486, 0.06473243285999922], [1, 0.7798934003768299, 0.4382591473903534], [2, 0.48825340607533724, 0.34341567836369763], [3, 0.6057207892976911, 0.49631299896737197], [5, 0.5636311887040971, 0.4991913819171106]];
    for (const [x, c, s] of ref) {
      expect(fresnel(x).c).toBeCloseTo(c, 12);
      expect(fresnel(x).s).toBeCloseTo(s, 12);
      expect(fresnel(-x).c).toBeCloseTo(-c, 12);
    }
    expect(fresnel(1e4).c).toBeCloseTo(0.5, 4);
    // continuity across the series / continued-fraction switch at 1.5
    expect(fresnel(1.5 - 1e-12).c).toBeCloseTo(fresnel(1.5 + 1e-12).c, 10);
  });
  it('aperture directivity equals Balanis eq. 13-52 written with Fresnel integrals', () => {
    for (const [a1, b1, r1, r2, lam] of [[0.1, 0.075, 0.17, 0.19, 0.03], [0.3, 0.2, 0.4, 0.5, 0.01], [0.05, 0.04, 0.05, 0.06, 0.02]]) {
      const u = (Math.sqrt(lam * r2) / a1 + a1 / Math.sqrt(lam * r2)) / Math.SQRT2;
      const v = (Math.sqrt(lam * r2) / a1 - a1 / Math.sqrt(lam * r2)) / Math.SQRT2;
      const w = b1 / Math.sqrt(2 * lam * r1);
      const [fu, fv, fw] = [fresnel(u), fresnel(v), fresnel(w)];
      const dp = ((8 * Math.PI * r1 * r2) / (a1 * b1)) * ((fu.c - fv.c) ** 2 + (fu.s - fv.s) ** 2) * (fw.c ** 2 + fw.s ** 2);
      expect(directivity({ a1, b1, rho1: r1, rho2: r2, lambda: lam }) / dp).toBeCloseTo(1, 10);
    }
  });
});

describe('horn — Balanis ex. 13.6 (optimum 22.6 dBi pyramidal horn, 11 GHz, WR-90)', () => {
  it('closed-form procedure: χ = 11.1157, a₁ = 6.002λ = 16.37 cm, b₁ = 4.715λ = 12.859 cm, p_e = p_h = 27.29 cm', () => {
    const lam = 3e8 / 11e9; // Balanis uses c = 3e8 (λ = 2.7273 cm)
    const d = balanisDesign(10 ** 2.26, lam, 0.9 * INCH, 0.4 * INCH)!;
    expect(d.chi).toBeCloseTo(11.1157, 4);
    expect(d.a1 / lam).toBeCloseTo(6.002, 3);
    expect(d.b1 / lam).toBeCloseTo(4.715, 3);
    expect(d.a1 * 100).toBeCloseTo(16.37, 2);
    expect(d.b1 * 100).toBeCloseTo(12.859, 2);
    expect(d.pe * 100).toBeCloseTo(27.29, 1);
    expect(d.ph / d.pe).toBeCloseTo(1, 9);
    expect(d.rhoh / lam).toBeCloseTo(12.0094, 3);
  });
  it('the page example: exact optimum meets 22.6 dBi with s = 1/4, t = 3/8; Balanis’ horn is within 0.15 dB', () => {
    const r = ex('balanis-13-6');
    expect(r.ok).toBe(true);
    expect(res(r, 'gain')).toBeCloseTo(22.6, 9);
    expect((r.details as any).s).toBeCloseTo(0.25, 12);
    expect((r.details as any).t).toBeCloseTo(0.375, 12);
    expect(Math.abs(res(r, 'balGain') - 22.6)).toBeLessThan(0.15);
    expect(res(r, 'balChi')).toBeCloseTo(11.115, 2);
    expect(res(r, 'eap')).toBeCloseTo(0.51, 1);
  });
});

describe('horn — independent Python reference (horn_ref.py: Simpson quadrature of the aperture integrals)', () => {
  it('default pyramidal horn: gain and both beamwidths', () => {
    const r = run({});
    expect(res(r, 'gain') / 18.679249900574426).toBeCloseTo(1, 7);
    expect(res(r, 'hpbwE') / 20.485255000925957).toBeCloseTo(1, 6);
    expect(res(r, 'hpbwH') / 21.102962424568705).toBeCloseTo(1, 6);
  });
  it('E-plane sectoral horn and an H-plane sectoral horn given by ρ₂', () => {
    const e = ex('e-sectoral');
    expect(res(e, 'gain') / 11.678003104990545).toBeCloseTo(1, 7);
    expect(res(e, 'hpbwE') / 25.464852585312567).toBeCloseTo(1, 6);
    const h = run({ type: 'h-sectoral', lenMode: 'rho', a1: 0.15, rho2: 0.3 });
    expect(res(h, 'gain') / 11.667041486242397).toBeCloseTo(1, 7);
    expect(res(h, 'hpbwH') / 14.826441852053632).toBeCloseTo(1, 6);
  });
});

describe('horn — solve round trips', () => {
  it('optimum design → analysis reproduces the target (pyramidal, E- and H-sectoral, several targets)', () => {
    const cases: Partial<HornState>[] = [
      { type: 'pyramidal', gain: 15, f: 10e9 },
      { type: 'pyramidal', gain: 28, f: 30e9, a: 0.28 * INCH, b: 0.14 * INCH, wr: 'WR-28' },
      { type: 'e-sectoral', gain: 12, f: 10e9 },
      { type: 'h-sectoral', gain: 14, f: 4e9, a: 2.29 * INCH, b: 1.145 * INCH, wr: 'WR-229' },
    ];
    for (const c of cases) {
      const d = run({ ...c, solveFor: 'design', lenMode: 'L' });
      expect(d.ok).toBe(true);
      const back = run({ ...c, solveFor: 'gain', lenMode: 'L', a1: res(d, 'a1') ?? c.a, b1: res(d, 'b1') ?? c.b, len: res(d, 'len') });
      expect(res(back, 'gain')).toBeCloseTo(c.gain!, 7);
      // and the apex-distance description of the same horn
      const backRho = run({ ...c, solveFor: 'gain', lenMode: 'rho', a1: res(d, 'a1') ?? c.a, b1: res(d, 'b1') ?? c.b, rho1: res(d, 'rho1') ?? 1, rho2: res(d, 'rho2') ?? 1 });
      expect(res(backRho, 'gain')).toBeCloseTo(c.gain!, 7);
      expect(res(backRho, 'realizable')).toBe(c.type === 'pyramidal' ? true : undefined);
    }
  });
  it('length for a target gain → analysis reproduces it', () => {
    for (const [a1, b1, g] of [[0.15, 0.12, 22], [0.08, 0.06, 17], [0.3, 0.2, 26.5]]) {
      const d = run({ solveFor: 'len', a1, b1, gain: g });
      expect(d.ok).toBe(true);
      expect(res(run({ solveFor: 'gain', a1, b1, len: res(d, 'len') }), 'gain')).toBeCloseTo(g, 7);
    }
  });
  it('impossible targets fail with a reason', () => {
    const r = run({ solveFor: 'len', a1: 0.05, b1: 0.04, gain: 25 });
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.warnings[0]).toMatch(/infinitely long/);
    const r2 = run({ solveFor: 'design', gain: 1 });
    expect(r2.warnings[0]).toMatch(/starts at about/);
    expect(run({ a1: 0.01 }).ok).toBe(false);
  });
});

describe('horn — physics sanity', () => {
  it('no phase error → ε_ap = 8/π²; scaling all dimensions with λ leaves the gain unchanged', () => {
    const d = directivity({ a1: 0.2, b1: 0.1, rho1: Infinity, rho2: Infinity, lambda: 0.01 });
    expect((d * 0.01 ** 2) / (4 * Math.PI * 0.02)).toBeCloseTo(8 / Math.PI ** 2, 12);
    const g1 = directivity({ a1: 0.1, b1: 0.08, rho1: 0.2, rho2: 0.25, lambda: 0.03 });
    const g2 = directivity({ a1: 0.2, b1: 0.16, rho1: 0.4, rho2: 0.5, lambda: 0.06 });
    expect(g1 / g2).toBeCloseTo(1, 12);
  });
  it('longer horn → more gain (fixed aperture); bigger optimum horn → narrower beam', () => {
    let prev = 0;
    for (const L of [0.1, 0.2, 0.4, 0.8, 1.6]) {
      const g = res(run({ len: L }), 'gain');
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
    const lam = C0 / 10e9;
    const small = optimumGeom('pyramidal', 4 * lam, 0.02286, 0.01016, lam)!;
    const big = optimumGeom('pyramidal', 8 * lam, 0.02286, 0.01016, lam)!;
    expect(directivity(big)).toBeGreaterThan(directivity(small));
    expect(patternE(big, 0.15)).toBeLessThan(patternE(small, 0.15));
  });
  it('gain doubles (+3 dB) when one aperture side doubles at negligible phase error', () => {
    const g1 = directivity({ a1: 0.1, b1: 0.1, rho1: 1e6, rho2: 1e6, lambda: 0.01 });
    const g2 = directivity({ a1: 0.2, b1: 0.1, rho1: 1e6, rho2: 1e6, lambda: 0.01 });
    expect(g2 / g1).toBeCloseTo(2, 6);
  });
});

describe('horn — validity warnings', () => {
  const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));
  it('feed cut off, feed near cutoff, overmoded feed, small aperture, large phase error, split beam, unbuildable', () => {
    expect(has(run({ f: 6e9 }), /below its TE₁₀ cutoff/)).toBe(true);
    expect(run({ f: 6e9 }).status?.text).toBe('FEED CUT OFF');
    expect(has(run({ f: 7.5e9 }), /feed cutoff/)).toBe(true);
    expect(has(run({ f: 14e9 }), /overmoded/)).toBe(true);
    expect(has(run({ type: 'e-sectoral', b1: 0.02, len: 0.05 }), /under one wavelength/)).toBe(true);
    expect(has(run({ a1: 0.2, b1: 0.15, len: 0.06 }), /twice the optimum/)).toBe(true);
    expect(has(run({ a1: 0.3, b1: 0.3, len: 0.05 }), /main beam splits/)).toBe(true);
    expect(has(ex('rho-unbuildable'), /differ: no single pyramidal horn/)).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
});

describe('horn — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) {
      const r = def.compute({ ...def.defaults(), ...e.state } as HornState);
      expect(r.ok, e.id).toBe(true);
      sane(r);
    }
  });
  it('300+ random states through runCompute: no throw, finite values, no NaN text, never OUT OF RANGE, stable recompute', () => {
    for (const raw of fuzzStates(def, 330, 5)) {
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
      for (const x of r.results.filter((q) => q.solved && typeof q.value === 'number')) expect(res(r2, x.key) / (x.value as number)).toBeCloseTo(1, 6);
    }
  }, 60000);
  it('computes well under 50 ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) run({ solveFor: 'design', gain: 15 + i });
    expect((performance.now() - t0) / 10).toBeLessThan(50);
  });
});

/** Minimal SVG DOM stand-in (vitest runs in node) — enough for Schematic to build a tree we can inspect. */
function fakeDocument() {
  type N = { tag: string; attrs: Record<string, string>; children: N[]; text: string };
  const mk = (tag: string): any => {
    const n: any = { tag, attrs: {}, children: [] as N[], text: '' };
    n.setAttribute = (k: string, v: string) => (n.attrs[k] = String(v));
    n.getAttribute = (k: string) => n.attrs[k];
    n.appendChild = (c: N) => (n.children.push(c), c);
    n.append = (...cs: N[]) => cs.forEach((c) => n.children.push(c));
    n.insertBefore = (c: N) => (n.children.unshift(c), c);
    Object.defineProperty(n, 'textContent', { get: () => n.text + n.children.map((c: any) => c.textContent ?? '').join(''), set: (v: string) => (n.text = v) });
    return n;
  };
  return { createElementNS: (_ns: string, tag: string) => mk(tag), createTextNode: (t: string) => ({ tag: '#text', textContent: t, children: [] }) };
}
const texts = (n: any): { cls: string; s: string }[] => [...(n.tag === 'text' ? [{ cls: n.attrs.class ?? '', s: n.textContent }] : []), ...(n.children ?? []).flatMap(texts)];

describe('horn — review fixes', () => {
  const rc = (p: Partial<HornState>) => runCompute(def, normalizeState(def, { ...def.defaults(), ...p }));
  it('#7 gain range is consistent: 0 dBi target gives a clear "no solution", out-of-box analyses are not refused', () => {
    const d = rc({ solveFor: 'design', gain: 0 });
    expect(d.ok).toBe(true);
    expect(d.status?.text).toBe('NO SOLUTION');
    expect(d.warnings[0]).toMatch(/starts at about/);
    const low = rc({ f: 100e6 }); // feed far below cutoff: −20.7 dBi, still a valid analysis
    expect(low.ok).toBe(true);
    expect(res(low, 'gain')).toBeCloseTo(-20.7, 1);
    expect(low.warnings[0]).toMatch(/below its TE₁₀ cutoff/);
    const big = rc({ solveFor: 'design', f: 1e12, gain: 120, a: 0.2e-3, b: 0.1e-3, wr: 'Custom' });
    expect(big.ok).toBe(true);
    expect(big.status?.text).toBe('NO SOLUTION');
    const nearFeed = rc({ solveFor: 'len', a1: 0.9 * INCH * (1 + 1e-9), b1: 0.4 * INCH * (1 + 1e-9), gain: -5 });
    expect(nearFeed.status?.text === 'OUT OF RANGE').toBe(false);
    // 3000 random valid analyses (aperture ≥ feed) are never refused
    let seed = 41;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const types: HornState['type'][] = ['pyramidal', 'e-sectoral', 'h-sectoral'];
    for (let i = 0; i < 3000; i++) {
      const a = 1e-4 * 2e4 ** rnd();
      const b = 1e-5 * 2e5 ** rnd();
      const st: Partial<HornState> = { solveFor: 'gain', wr: 'Custom', type: types[i % 3], lenMode: rnd() < 0.5 ? 'L' : 'rho', f: 1e8 * 1e4 ** rnd(), a, b, a1: Math.min(10, a * (1.001 + 50 * rnd())), b1: Math.min(10, b * (1.001 + 50 * rnd())), len: 1e-5 * 1e7 ** rnd(), rho1: 1e-5 * 1e11 ** rnd(), rho2: 1e-5 * 1e11 ** rnd() };
      if (st.a1! <= a || st.b1! <= b) continue;
      const r = rc(st);
      expect(r.ok, JSON.stringify(st)).toBe(true);
    }
  }, 120000);
  it('#8 theory states which c gives which Balanis numbers', () => {
    const solving = theory.sections.find((x) => x.title.startsWith('Solving'))!.html;
    expect(solving).toMatch(/c = 3\\times10\^8/);
    expect(solving).toMatch(/11\.1154/);
    expect(solving).toMatch(/27\.26/);
  });
  it('#9 the diagram marks ρ₁ and ρ₂ green when they are solved', () => {
    (globalThis as any).document = fakeDocument();
    try {
      const st = { ...def.defaults(), ...def.examples!.find((e) => e.id === 'balanis-13-6')!.state } as HornState;
      const svg = hornDiagram(st, def.compute(st));
      const t = texts(svg);
      expect(t.find((x) => x.s.startsWith('ρ₁'))!.cls).toMatch(/solved/);
      expect(t.find((x) => x.s.startsWith('ρ₂'))!.cls).toMatch(/solved/);
      const t2 = texts(hornDiagram(def.defaults(), def.compute(def.defaults())));
      expect(t2.find((x) => x.s.startsWith('ρ₁'))!.cls).not.toMatch(/solved/);
    } finally {
      delete (globalThis as any).document;
    }
  });
  it('#10 aperture efficiency appears once; at most 5 cards', () => {
    for (const st of [{}, { solveFor: 'design' as const, gain: 20 }, { solveFor: 'len' as const, a1: 0.15, b1: 0.12, gain: 22 }]) {
      const r = run(st);
      expect(r.results.filter((x) => /efficiency/i.test(x.label)).length).toBe(1);
      expect(r.results.filter((x) => x.primary).length).toBeLessThanOrEqual(5);
    }
  });
});

describe('horn — mode switches (review regressions)', () => {
  const field = (key: string): any => def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === key);
  it('a standard feed larger than the aperture scales the horn instead of a red error', () => {
    for (const wr of field('wr').options.map((o: any) => o.value)) {
      const st = { ...def.defaults() } as HornState;
      st.wr = wr;
      field('wr').apply(wr, st, st);
      const r = def.compute(st);
      expect(r.ok, `${wr}: ${r.error}`).toBe(true);
    }
    const st = { ...def.defaults() } as HornState;
    st.wr = 'WR-90';
    field('wr').apply('WR-62', st, st); // smaller feed: the horn is left alone
    expect(st.a1).toBe(def.defaults().a1);
  });
  it('a horn-type switch goes back to analysis', () => {
    for (const ex of def.examples!) {
      for (const type of ['pyramidal', 'e-sectoral', 'h-sectoral'] as const) {
        const st = { ...def.defaults(), ...ex.state } as HornState;
        st.type = type;
        field('type').apply(type, st, st);
        expect(st.solveFor).toBe('gain');
        expect(def.compute(st).ok).toBe(true);
      }
    }
  });
});
