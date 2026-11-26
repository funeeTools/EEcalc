import { describe, expect, it } from 'vitest';
import { def, type EffState } from '@/calculators/eff-dielectric/def';
import { effDielectric } from '@/calculators/eff-dielectric/model';
import { analyse } from '@/calculators/controlled-impedance/model';
import { runCompute } from '@/core/calc/page';
import { applyDefValues } from '@/core/calc/fields';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const C0 = 299792458;
const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const st = (p: Partial<EffState> = {}): EffState => ({ ...def.defaults(), ...p });
const run = (p: Partial<EffState>) => def.compute(st(p));
const rel = (a: number, b: number) => Math.abs(a / b - 1);
const has = (r: CalcReport, re: RegExp) => r.warnings.some((w) => re.test(w));
const inp = (p: Partial<EffState>) => {
  const s = st(p);
  return { structure: s.structure, w: s.w, h: s.h, t: s.t, er: s.er, c: s.c, erm: s.erm, hc: s.hc, erc: s.erc, g: s.g, f: s.f };
};

describe('effective dielectric constant — independent references', () => {
  // scratch builderA2/xcheck.py: Kirschning–Jansen 1982 written from the paper over the statics of pcb1/ref.py
  // (H&J 1980, Wan–Hoorfar 2000, Ghione–Naldi CPWG; written from the papers). 267 random states over all three solve
  // options and five structures agree with the page to ≤ 1.3e-14, and each εr solve meets its measured value.
  it('matches the Python re-implementation to 1e-9', () => {
    expect(rel(effDielectric(inp({})).eeff, 3.0805572829813066)).toBeLessThan(1e-9);
    expect(rel(res(run({}), 'tpd'), 5.854555690729684e-9)).toBeLessThan(1e-9);
    const d = effDielectric(inp({ w: 3e-3, h: 1.6e-3, er: 4.4, f: 10e9 }));
    expect(rel(d.eeff, 3.6048193351040183)).toBeLessThan(1e-9);
    expect(rel(d.eeff0, 3.300804585348324)).toBeLessThan(1e-9);
    expect(rel(effDielectric(inp({ structure: 'mask' })).eeff, 3.169989904237434)).toBeLessThan(1e-9);
    expect(rel(effDielectric(inp({ structure: 'cpwg', w: 0.45e-3, g: 0.2e-3, h: 0.254e-3, er: 3.66, f: 10e9 })).eeff, 2.5411025318904845)).toBeLessThan(1e-9);
  });

  it('Pozar, Microwave Engineering 4e, Example 3.7: εr = 2.20, W/d = 3.081 → εe = 1.87 (thin strip)', () => {
    // Pozar uses the simpler (εr+1)/2 + (εr−1)/2/√(1+12d/W) form; Hammerstad–Jensen agrees to within 1 %
    const e = effDielectric({ ...inp({}), w: 3.081 * 1.27e-3, h: 1.27e-3, t: 0, er: 2.2, f: 1e6 }).eeff;
    expect(Math.abs(e / 1.87 - 1)).toBeLessThan(0.01);
  });

  // No published table of Kirschning–Jansen values was available. Second independent source for the dispersion: the
  // Yamashita–Atsuki–Ueda formula (IEEE T-MTT 27(12), 1979, pp. 1036–1038), a separately fitted model. The two
  // agree within 2.5 % on these FR-4 and alumina lines up to 20 GHz.
  it('dispersion agrees with Yamashita et al. (1979) within 2.5 %', () => {
    const yam = (e0: number, er: number, w: number, h: number, f: number) => {
      const F = ((4 * h * f * Math.sqrt(er - 1)) / C0) * (0.5 + (1 + 2 * Math.log10(1 + w / h)) ** 2);
      return ((Math.sqrt(er) - Math.sqrt(e0)) / (1 + 4 * F ** -1.5) + Math.sqrt(e0)) ** 2;
    };
    for (const [w, h, er] of [[3e-3, 1.6e-3, 4.4], [0.38e-3, 0.2e-3, 4.2], [0.6e-3, 0.635e-3, 9.8]])
      for (const f of [2e9, 5e9, 10e9, 20e9]) {
        if ((f / 1e9) * h * 1e3 > 25) continue;
        const o = effDielectric({ ...inp({}), w, h, t: 0, er, f });
        expect(rel(o.eeff, yam(o.eeff0, er, w, h, f)), `${w} ${h} ${er} ${f}`).toBeLessThan(0.025);
      }
  });
});

describe('effective dielectric constant — physics', () => {
  it('stripline: εeff = εr exactly at every frequency and geometry', () => {
    for (const [w, h, f] of [[0.1e-3, 0.2e-3, 1e6], [2e-3, 0.1e-3, 50e9]]) expect(effDielectric({ ...inp({ structure: 'sl' }), w, h, f }).eeff).toBe(4.2);
  });
  it('microstrip: 1 < εeff < εr, rising with W/H and with frequency towards εr; εr = 1 gives 1', () => {
    let prev = 1;
    for (const u of [0.1, 0.3, 1, 3, 10]) {
      const e = effDielectric({ ...inp({}), w: u * 0.2e-3, t: 0 }).eeff0;
      expect(e).toBeGreaterThan(prev);
      expect(e).toBeLessThan(4.2);
      prev = e;
    }
    let pf = 0;
    for (const f of [1e6, 1e9, 1e10, 5e10, 2e11]) {
      const e = effDielectric({ ...inp({}), f }).eeff;
      expect(e).toBeGreaterThanOrEqual(pf);
      pf = e;
    }
    expect(pf).toBeLessThan(4.2);
    // far into dispersion most of the gap to εr has closed
    const e0 = effDielectric(inp({})).eeff0;
    expect((4.2 - pf) / (4.2 - e0)).toBeLessThan(0.5);
    expect(effDielectric({ ...inp({}), er: 1 }).eeff).toBeCloseTo(1, 12);
  });
  it('a mask or cover raises εeff over the bare line; CPWG has less field in the substrate than the bare microstrip', () => {
    const bare = effDielectric(inp({})).eeff0;
    expect(effDielectric(inp({ structure: 'mask' })).eeff).toBeGreaterThan(bare);
    expect(effDielectric(inp({ structure: 'emb' })).eeff).toBeGreaterThan(effDielectric(inp({ structure: 'mask' })).eeff);
    const p = { w: 0.45e-3, h: 0.254e-3, er: 3.66, f: 1e6 };
    expect(effDielectric(inp({ ...p, structure: 'cpwg' })).eeff).toBeLessThan(effDielectric(inp({ ...p, structure: 'ms' })).eeff);
  });
  it('static values are the controlled-impedance models; delay, velocity and wavelength follow from εeff', () => {
    for (const structure of ['ms', 'mask', 'emb', 'sl', 'cpwg'] as const) {
      const i = inp({ structure });
      expect(effDielectric(i).eeff0).toBe(analyse(i).epsEff);
    }
    const r = run({ f: 2e9 });
    const e = res(r, 'eeff');
    expect(rel(res(r, 'tpd'), Math.sqrt(e) / C0)).toBeLessThan(1e-14);
    expect(rel(res(r, 'vp'), C0 / Math.sqrt(e))).toBeLessThan(1e-14);
    expect(rel(res(r, 'lambdaG'), C0 / Math.sqrt(e) / 2e9)).toBeLessThan(1e-14);
    expect(rel(res(r, 'elecLen'), (360 * 0.1) / res(r, 'lambdaG'))).toBeLessThan(1e-14);
  });
});

describe('effective dielectric constant — solve-for', () => {
  it('εr from a measured delay and from a measured εeff round-trip for every structure', () => {
    for (const structure of ['ms', 'mask', 'emb', 'sl', 'cpwg'] as const)
      for (const er of [2.2, 4.2, 9.8]) {
        for (const f of [1e8, 5e9]) {
          const fwd = run({ structure, er, f });
          const e = res(fwd, 'eeff');
          const t = res(fwd, 'tpd');
          const a = st({ structure, f, er: 3, solveFor: 'erT', tpd: t });
          expect(runCompute(def, a).ok).toBe(true);
          expect(rel(a.er, er), `${structure} erT`).toBeLessThan(1e-6);
          expect(rel(a.eeff, e)).toBeLessThan(1e-9);
          const b = st({ structure, f, er: 3, solveFor: 'erE', eeff: e });
          expect(runCompute(def, b).ok).toBe(true);
          expect(rel(b.er, er), `${structure} erE`).toBeLessThan(1e-6);
          expect(rel(b.tpd, t)).toBeLessThan(1e-9);
        }
      }
  });
  it('a measured value no εr can give is a NO SOLUTION with the reachable range', () => {
    const r = runCompute(def, st({ solveFor: 'erT', tpd: 3.4e-8 }));
    expect(r.ok).toBe(false);
    expect(r.status?.text).toBe('NO SOLUTION');
    expect(r.error).toMatch(/No εr in 1–100 gives t_pd = .* it reaches ε_eff = 1 … /);
    expect(runCompute(def, st({ solveFor: 'erE', structure: 'mask', eeff: 1.01 })).error).toMatch(/the cover or mask alone already raises it above 1/);
  });
  it('field buttons switch modes as described; a structure or laminate switch returns to analysis', () => {
    const f = def.fields.flatMap((x: any) => x.fields ?? [x]);
    const get = (k: string) => f.find((x: any) => x.key === k);
    const s: any = st();
    get('er').onSolve(s, s);
    expect(s.solveFor).toBe('erT');
    get('eeff').onUnsolve(s, s); // εeff becomes the measured input
    expect(s.solveFor).toBe('erE');
    get('eeff').onSolve(s, s);
    expect(s.solveFor).toBe('eeff');
    s.solveFor = 'erT';
    def.sync!(s); // the page has computed this state (records the structure and material in use)
    get('structure').apply('ms', s, s); // same structure again: the solve stays
    expect(s.solveFor).toBe('erT');
    s.structure = 'sl';
    get('structure').apply('sl', s, s);
    expect(s.solveFor).toBe('eeff');
    s.solveFor = 'erE';
    def.sync!(s);
    s.material = 'RO4350B';
    get('material').apply('RO4350B', s, s);
    expect(s.solveFor).toBe('eeff');
    expect(s.er).toBe(3.66);
  });
  it('regression (review): a measured value set together with the structure in one API call is kept', () => {
    const s: any = st();
    expect(applyDefValues(def, s, { solveFor: 'erE', eeff: 3.5, structure: 'ms' })).toEqual([]);
    const r = runCompute(def, s);
    expect(r.ok).toBe(true);
    expect(s.solveFor).toBe('erE');
    expect(s.eeff).toBe(3.5);
    expect(rel(effDielectric({ ...inp({}), er: s.er }).eeff, 3.5)).toBeLessThan(1e-9);
  });
});

describe('effective dielectric constant — validity', () => {
  it('each limit triggers its warning; impossible copper is refused', () => {
    expect(has(run({ w: 0.015e-3 }), /outside 0.1–100, the range Kirschning and Jansen/)).toBe(true);
    expect(has(run({ er: 25 }), /above 20, the range of the Kirschning–Jansen/)).toBe(true);
    expect(has(run({ h: 1.6e-3, w: 3e-3, f: 30e9 }), /above 39 GHz·mm \(H\/λ₀ = 0.13\)/)).toBe(true);
    expect(has(run({ h: 1.6e-3, w: 3e-3, f: 30e9 }), /TE₁ surface-wave onset/)).toBe(true);
    expect(has(run({ w: 0.005e-3, t: 0 }), /outside 0.05–20, where the microstrip and cover models were checked/)).toBe(true);
    expect(has(run({ t: 80e-6 }), /T\/H = 0.40/)).toBe(true);
    expect(has(run({ structure: 'mask', c: 60e-6 }), /C\/H = 0.30/)).toBe(true);
    expect(has(run({ structure: 'emb', hc: 0.7e-3 }), /more than 3.2× the substrate/)).toBe(true);
    expect(has(run({ structure: 'cpwg', g: 0.3e-3 }), /G = 1.50·H/)).toBe(true);
    expect(has(run({ structure: 'sl', f: 200e9 }), /parallel-plate modes/)).toBe(true);
    expect(run({ w: 0.01e-3, t: 35e-6 }).error).toMatch(/more than three times as thick/);
    // regression (harness, high): switching a thin-dielectric CPWG to stripline gave a red error; εeff = εr needs no Z₀
    const sl = run({ structure: 'sl', h: 5.19e-6, t: 35e-6 });
    expect(sl.ok).toBe(true);
    expect(res(sl, 'eeff')).toBe(4.2);
    expect(res(sl, 'z0')).toBeNull();
    expect(sl.notes.some((n) => /too thick for Cohn’s stripline thickness correction/.test(n))).toBe(true);
    expect(run({}).warnings).toEqual([]);
  });
});

type Num = { key: string; min: number; max: number };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: unknown[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1 });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o: any) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('effective dielectric constant — fuzz (450 random states via runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: unknown[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 1618;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 450; i++) {
      const s: any = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd() ** 3;
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      if (i % 2) {
        s.w = s.h * (0.2 + 5 * rnd());
        s.t = s.h * 0.2 * rnd();
        s.g = s.h * (0.2 + rnd());
        s.c = s.h * 0.2 * rnd() + 1e-6;
        s.er = 2 + 8 * rnd();
      }
      s.solveFor = def.solve!.options[i % 3].key;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, s))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const se of g.series ?? []) for (const y of se.y) expect(Number.isFinite(y), `${g.id}/${se.label}`).toBe(true);
      const again = runCompute(def, { ...s });
      expect(again.ok).toBe(true);
      expect(rel(res(again, 'eeff'), res(r, 'eeff'))).toBeLessThan(1e-9);
    }
    expect(ok).toBeGreaterThan(200);
  });
});

describe('effective dielectric constant — examples', () => {
  it('first example equals the defaults; every example computes without warnings; fast', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...ex.state });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
      expect(r.graphs.length).toBe(2);
      expect(r.warnings, ex.id).toEqual([]);
    }
    const t0 = performance.now();
    for (const ex of def.examples!) def.compute(st(ex.state));
    expect((performance.now() - t0) / def.examples!.length).toBeLessThan(50);
  });
});
