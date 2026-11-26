import { describe, expect, it } from 'vitest';
import { ALLOYS, AR_MIN, ASPECT_MIN, def, type SolderPasteState } from '@/calculators/solder-paste/def';
import { areaRatio, metalVolumeFraction, openingArea, openingPerimeter, printModel } from '@/calculators/solder-paste/model';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<SolderPasteState>) => def.compute({ ...def.defaults(), ...p });

describe('solder paste — references', () => {
  it('rule of thumb (Kurtz Ersa solder wiki): ~90 wt % metal ≈ 50 vol %; SAC305 88.5 wt % with 1.0 g/cm³ flux → 51.0 vol %', () => {
    // independent hand calculation from the published densities (Indium directory 7.40 g/cm³, flux 1.0 g/cm³)
    const vm = 0.885 / 7.4;
    const vf = 0.115 / 1.0;
    expect(metalVolumeFraction(0.885, 7400, 1000)).toBeCloseTo(vm / (vm + vf), 15);
    expect(metalVolumeFraction(0.885, 7400, 1000) * 100).toBeCloseTo(50.98, 2);
    for (const [wt, rho] of [[0.9, 7400], [0.9, 8400], [0.885, 8560]]) {
      const phi = metalVolumeFraction(wt, rho, 1000);
      expect(phi).toBeGreaterThan(0.45);
      expect(phi).toBeLessThan(0.6);
    }
  });
  it('alloy densities are the Indium Solder Alloy Directory values (its lb/in³ and g/cm³ columns agree)', () => {
    // directory: #256 SAC305 0.2674 lb/in³ 7.40; #106 Sn63Pb37 0.3035 / 8.40; #121 Sn96.5Ag3.5 0.2710 / 7.50; #281 Bi58Sn42 0.3093 / 8.56
    const LB_IN3 = 27679.9; // kg/m³ per lb/in³
    const dir: [string, number][] = [['SAC305 (96.5Sn 3.0Ag 0.5Cu)', 0.2674], ['Sn63Pb37', 0.3035], ['Sn96.5Ag3.5', 0.271], ['Bi58Sn42 (low temp.)', 0.3093]];
    for (const [name, lb] of dir) expect(Math.abs(ALLOYS[name]! / (lb * LB_IN3) - 1), name).toBeLessThan(0.002);
    // a rule of mixtures from the pure metals (Sn 7.265, Ag 10.49) gives 7.34 for Sn96.5Ag3.5: the measured 7.50 is used
    const mix = 1 / (0.965 / 7.265 + 0.035 / 10.49);
    expect(mix).toBeCloseTo(7.34, 2);
    expect(ALLOYS['Sn96.5Ag3.5']! / 1000 / mix - 1).toBeLessThan(0.025);
  });
  it('IPC-7525 area ratio identities: circle D/(4T), square side/(4T); 0.25 mm in 100 µm → 0.625', () => {
    expect(areaRatio({ shape: 'circle', l: 0, w: 0.25e-3, r: 0 }, 100e-6)).toBeCloseTo(0.625, 12);
    expect(areaRatio({ shape: 'rect', l: 0.3e-3, w: 0.3e-3, r: 0 }, 100e-6)).toBeCloseTo(0.75, 12);
    // a square with full corner radius r = W/2 is a circle
    const a = { shape: 'rect' as const, l: 0.4e-3, w: 0.4e-3, r: 0.2e-3 };
    expect(openingArea(a)).toBeCloseTo((Math.PI * 0.4e-3 ** 2) / 4, 18);
    expect(openingPerimeter(a)).toBeCloseTo(Math.PI * 0.4e-3, 15);
  });
  it('matches the Python re-implementation (rule of mixtures, rounded-rectangle geometry)', () => {
    // python3 refs.py paste_fwd(...)
    const q = printModel({ shape: 'rect', l: 0.6e-3, w: 0.2e-3, r: 0 }, 127e-6, 1, 0.885, 7400, 1000);
    expect(q.vPaste).toBeCloseTo(1.5239999999999997e-11, 24);
    expect(q.areaRatio).toBeCloseTo(0.5905511811023623, 13);
    expect(q.vSolder).toBeCloseTo(7.769239631336405e-12, 24);
    const r = run({ shape: 'rect', padL: 1.5e-3, padW: 0.8e-3, red: 10, radius: 0.1e-3, t: 120e-6, te: 90, wt: 90, rhoM: 8400, rhoF: 1013 });
    expect(res(r, 'vpaste')).toBeCloseTo(1.0404892006587699e-10, 22);
    expect(res(r, 'areaRatio')).toBeCloseTo(2.023140529753111, 12);
    expect(res(r, 'vSolder')).toBeCloseTo(5.415390787467036e-11, 22);
    expect(res(r, 'phiMetal')).toBeCloseTo(0.5204658331906149, 13);
  });
  it('defaults reproduce the 1.5 × 0.8 mm, 10 % reduction, 120 µm case (0.972 mm², AR 1.957, 0.1166 mm³)', () => {
    const r = run({});
    expect(res(r, 'area') * 1e6).toBeCloseTo(0.972, 9);
    expect(res(r, 'areaRatio')).toBeCloseTo(0.972 / (2 * (1.35 + 0.72) * 0.12), 12); // 1.9565
    expect(res(r, 'vpaste') * 1e9).toBeCloseTo(0.11664, 9);
  });
});

describe('solder paste — physics', () => {
  it('doubling T doubles the volume and halves both ratios; TE scales volume only', () => {
    const a = run({ t: 100e-6 });
    const b = run({ t: 200e-6 });
    expect(res(b, 'vpaste') / res(a, 'vpaste')).toBeCloseTo(2, 12);
    expect(res(a, 'areaRatio') / res(b, 'areaRatio')).toBeCloseTo(2, 12);
    expect(res(a, 'aspectRatio') / res(b, 'aspectRatio')).toBeCloseTo(2, 12);
    const c = run({ te: 50 });
    expect(res(c, 'vpaste') / res(run({}), 'vpaste')).toBeCloseTo(0.5, 12);
    expect(res(c, 'areaRatio')).toBe(res(run({}), 'areaRatio'));
  });
  it('metal fraction: 0 → 0, 1 → 1, equal densities → weight fraction; higher alloy density → less volume', () => {
    expect(metalVolumeFraction(0.5, 1000, 1000)).toBeCloseTo(0.5, 15);
    expect(metalVolumeFraction(1, 7400, 1000)).toBe(1);
    expect(metalVolumeFraction(0.885, 8400, 1000)).toBeLessThan(metalVolumeFraction(0.885, 7400, 1000));
  });
  it('the thickest-foil results sit exactly on the limits', () => {
    const r = run({});
    const tA = res(r, 'tMaxArea');
    const tS = res(r, 'tMaxAspect');
    expect(res(run({ t: tA }), 'areaRatio')).toBeCloseTo(AR_MIN, 12);
    expect(res(run({ t: tS }), 'aspectRatio')).toBeCloseTo(ASPECT_MIN, 12);
  });
});

describe('solder paste — solve-for round trips', () => {
  it('T and reduction for a target volume, several points', () => {
    const pts: Partial<SolderPasteState>[] = [
      {},
      { shape: 'circle', padW: 0.3e-3, red: 5, t: 100e-6, te: 80 },
      { shape: 'rect', padL: 0.5e-3, padW: 0.25e-3, red: 20, radius: 0.05e-3, t: 127e-6, te: 95 },
      { shape: 'rect', padL: 5e-3, padW: 5e-3, red: 30, radius: 0, t: 150e-6, te: 100 },
    ];
    for (const p of pts) {
      const v = res(run({ ...p, solveFor: 'vpaste' }), 'vpaste');
      for (const k of ['t', 'red'] as const) {
        const r = run({ ...p, solveFor: k, vpaste: v, [k]: k === 't' ? 300e-6 : 70 });
        expect(r.ok, `${k}: ${r.error}`).toBe(true);
        const x = res(r, k);
        expect(x / (k === 't' ? (p.t ?? 120e-6) : (p.red ?? 10))).toBeCloseTo(1, 6);
        expect(res(run({ ...p, solveFor: 'vpaste', [k]: x }), 'vpaste') / v).toBeCloseTo(1, 9);
      }
    }
  });
  it('unreachable volume reports what limits it', () => {
    const r = run({ solveFor: 'red', vpaste: 1e-9 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/1:1 aperture/);
  });
});

describe('solder paste — review fixes', () => {
  it('solved T stays inside the 10–1000 µm foil field; analysed volume inside 1e-15 … 1e-6 m³', () => {
    const r = run({ solveFor: 't', vpaste: 1e-12 }); // would need ~1 µm
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/outside the 10–1000 µm range/);
    const big = run({ solveFor: 't', vpaste: 1e-6 });
    expect(big.ok).toBe(false);
    const tiny = run({ solveFor: 'vpaste', shape: 'circle', padW: 1e-5, red: 90, t: 10e-6, te: 1 });
    expect(tiny.ok).toBe(false);
    expect(tiny.error).toMatch(/range of the volume field/);
  });
  it('bga05 example is labelled as failing the area ratio and shows RELEASE RISK', () => {
    const ex = def.examples!.find((e) => e.id === 'bga05')!;
    expect(ex.label).toMatch(/fails AR/);
    expect(run(ex.state).status?.text).toBe('RELEASE RISK');
  });
  it('round aperture: the ratio graph explains why the two curves coincide', () => {
    expect(run({ shape: 'circle', padW: 0.3e-3 }).graphs[0].subtitle).toMatch(/aspect = 4 × area ratio/);
    expect(run({}).graphs[0].subtitle).toBeUndefined();
  });
});

describe('solder paste — limits and warnings', () => {
  it('area ratio below 0.66 fails, near it warns, aspect below 1.5 fails; table rows toned', () => {
    const f = run({ shape: 'circle', padW: 0.25e-3, red: 0, t: 100e-6 });
    expect(f.status?.tone).toBe('fail');
    expect(f.warnings.some((w) => w.startsWith('Area ratio 0.625'))).toBe(true);
    const m = run({ shape: 'circle', padW: 0.28e-3, red: 0, t: 100e-6 }); // AR 0.70
    expect(m.status?.tone).toBe('warn');
    const n = run({ shape: 'rect', padL: 3e-3, padW: 0.15e-3, red: 0, t: 120e-6 }); // aspect 1.25
    expect(n.warnings.some((w) => w.startsWith('Aspect ratio'))).toBe(true);
    const tbl = run({}).tables[0];
    expect(tbl.rowTones?.length).toBe(tbl.rows.length);
    expect(f.tables[0].rowTones).toContain('fail');
  });
  it('bad input is reported, not thrown', () => {
    expect(run({ radius: 1e-3 }).ok).toBe(false);
    expect(run({ wt: 100 }).ok).toBe(false);
    expect(run({ padW: 0 }).ok).toBe(false);
  });
});

type Num = { key: string; min: number; max: number; optional?: boolean };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number' && !nums.some((n) => n.key === f.key)) nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, optional: f.optional });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity/;

describe('solder paste — fuzz (400 random states)', () => {
  it('never throws; finite results; clean strings; finite graphs; stable recompute', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 99;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of nums) s[f.key] = f.optional && rnd() < 0.2 ? null : f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      if (rnd() < 0.7) s.radius = (s.radius as number) * 1e-3; // mostly realistic radii
      s.solveFor = def.solve!.options[i % 3].key;
      const st = s as unknown as SolderPasteState;
      let r!: CalcReport;
      expect(() => (r = def.compute(st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of sr.y) expect(Number.isFinite(y)).toBe(true);
      for (const t of r.tables) for (const row of t.display ?? []) for (const v of Object.values(row)) expect(v).not.toMatch(BAD);
      const solved = r.results.find((q) => q.solved)!;
      const again = def.compute({ ...st, [st.solveFor]: solved.value as number });
      expect(again.ok).toBe(true);
      for (const k of ['vpaste', 'areaRatio', 'vSolder']) expect(res(again, k) / res(r, k)).toBeCloseTo(1, 9);
    }
    expect(ok).toBeGreaterThan(100); // others: corner radius larger than the opening, unreachable targets
  });
});

describe('solder paste — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(run(ex.state).ok, ex.id).toBe(true);
  });
});

describe('solder paste — mode switches (review regressions)', () => {
  it('a shape switch goes back to analysis (solve reduction → circle was a red error)', () => {
    const shape: any = def.fields.flatMap((f: any) => f.fields ?? [f]).find((f: any) => f.key === 'shape');
    for (const solveFor of ['red', 't'] as const) {
      const st = { ...def.defaults(), solveFor, vpaste: 0.1166e-9 } as SolderPasteState;
      st.shape = 'circle';
      shape.apply(st.shape, st, st);
      expect(st.solveFor).toBe('vpaste');
      expect(def.compute(st).ok).toBe(true);
    }
  });
});
