import { describe, expect, it } from 'vitest';
import { type LandState, def } from '@/calculators/bga-land-pad/def';
import { T14_5, T14_6, ipcPct, landFrom, tableRow } from '@/calculators/bga-land-pad/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';
import type { FieldSpec } from '@/core/form/form';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const run = (p: Partial<LandState>) => def.compute({ ...def.defaults(), ...p });
const MM = 1e-3;

describe('BGA land pad — IPC-7351B Tables 14-5 / 14-6', () => {
  it('the tables row by row (ball, %, nominal, max, min in mm; 14-6 0.45 row corrected from 0.55–0.40)', () => {
    const mm = (rows: typeof T14_5) => rows.map((r) => [r.ball, r.pct, r.land, r.max, r.min].map((v, i) => (i === 1 ? v : +(v / MM).toFixed(3))));
    expect(mm(T14_5)).toEqual([[0.75, 25, 0.55, 0.6, 0.5], [0.65, 25, 0.5, 0.55, 0.45], [0.6, 25, 0.45, 0.5, 0.4], [0.55, 25, 0.4, 0.45, 0.35], [0.5, 20, 0.4, 0.45, 0.35], [0.45, 20, 0.35, 0.4, 0.3], [0.4, 20, 0.3, 0.35, 0.25], [0.35, 20, 0.3, 0.35, 0.25], [0.3, 20, 0.25, 0.25, 0.2], [0.25, 20, 0.2, 0.2, 0.17], [0.2, 15, 0.17, 0.2, 0.14], [0.17, 15, 0.15, 0.18, 0.12], [0.15, 15, 0.13, 0.15, 0.1]]);
    expect(mm(T14_6)).toEqual([[0.75, 15, 0.86, 0.91, 0.81], [0.65, 15, 0.75, 0.8, 0.7], [0.6, 15, 0.69, 0.74, 0.64], [0.55, 15, 0.63, 0.68, 0.58], [0.5, 10, 0.55, 0.6, 0.5], [0.45, 10, 0.5, 0.55, 0.45], [0.4, 10, 0.44, 0.49, 0.39], [0.35, 10, 0.38, 0.43, 0.33], [0.3, 10, 0.33, 0.38, 0.28], [0.25, 10, 0.27, 0.32, 0.22], [0.2, 5, 0.21, 0.24, 0.18], [0.17, 5, 0.18, 0.21, 0.15], [0.15, 5, 0.16, 0.19, 0.13]]);
    // each nominal lies within its own variation, and ball × (1 ∓ r) is within 0.025 mm of it
    for (const r of T14_5) { expect(r.land).toBeGreaterThanOrEqual(r.min - 1e-12); expect(r.land).toBeLessThanOrEqual(r.max + 1e-12); expect(Math.abs(landFrom('collapse', r.ball, r.pct) - r.land)).toBeLessThan(0.0251 * MM); }
    for (const r of T14_6) { expect(r.land).toBeGreaterThanOrEqual(r.min - 1e-12); expect(r.land).toBeLessThanOrEqual(r.max + 1e-12); expect(Math.abs(landFrom('noncollapse', r.ball, r.pct) - r.land)).toBeLessThan(0.0251 * MM); }
  });
  it('Table 14-5 rows: 0.45 mm ball → 0.35 mm (0.30–0.40), 20 %; 0.75 mm → 0.55 mm, 25 %; 0.20 mm → 0.17 mm, 15 %', () => {
    const r = run({ ball: 0.45 * MM });
    expect(res(r, 'tblNom')).toBeCloseTo(0.35 * MM, 15);
    expect(res(r, 'land')).toBeCloseTo(0.36 * MM, 15);
    expect(r.status?.tone).toBe('pass');
    expect(ipcPct('collapse', 0.75 * MM).pct).toBe(25);
    expect(tableRow('collapse', 0.2 * MM)?.row.land).toBeCloseTo(0.17 * MM, 15);
  });
  it('a ball between rows takes the smaller ball’s row (0.52 → 0.50 row, 20 %; 0.24 → 0.20 row, 15 %)', () => {
    expect(ipcPct('collapse', 0.52 * MM)).toEqual({ pct: 20, extended: false });
    expect(ipcPct('collapse', 0.24 * MM)).toEqual({ pct: 15, extended: false });
    expect(ipcPct('collapse', 0.76 * MM)).toEqual({ pct: 25, extended: true });
  });
  it('TI SPRAA99C Table 2-1 (second source): 1.0 mm pitch NSMD land 0.45 mm = IPC 25 % of a 0.6 mm ball', () => {
    const r = runCompute(def, { ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === 'p10')!.state) });
    expect(res(r, 'land')).toBeCloseTo(0.45 * MM, 15);
    expect(res(r, 'tiLand')).toBeCloseTo(0.45 * MM, 15);
  });
});

describe('BGA land pad — independent Python model (xcheck.py)', () => {
  it('land, check percentage, copper gap and traces', () => {
    // Python: 0.75 ball collapsing → 0.5625; at 1.27 pitch NSMD, W/s 0.127 → gap 0.7075, 2 traces
    const r = run({ p: 1.27 * MM, ball: 0.75 * MM, w: 0.127 * MM, s: 0.127 * MM, n: 2 });
    expect(res(r, 'land')).toBeCloseTo(0.5625 * MM, 15);
    expect(res(r, 'gap')).toBeCloseTo(0.7075 * MM, 15);
    expect(res(r, 'nFit')).toBe(2);
    // Python: 0.55 land under a 0.6 ball → 8.333 % reduction, above the 0.40–0.50 range
    const c = run({ solveFor: 'pct', p: 1.0 * MM, ball: 0.6 * MM, land: 0.55 * MM });
    expect(res(c, 'pct')).toBeCloseTo(8.333333333333, 9);
    expect(c.status?.tone).toBe('fail');
    // Python: non-collapsing 0.3 ball +10 % → 0.33; SMD copper 0.43 on 0.5 pitch → gap 0.07, 0 traces at 75 µm
    const n = run({ p: 0.5 * MM, ball: 0.3 * MM, ballType: 'noncollapse', padDef: 'smd', w: 0.075 * MM, s: 0.075 * MM, n: 0 });
    expect(res(n, 'land')).toBeCloseTo(0.33 * MM, 15);
    expect(res(n, 'gap')).toBeCloseTo(0.07 * MM, 15);
    expect(res(n, 'nFit')).toBe(0);
  });
  it('IPC-7352 levels and package-pad rule', () => {
    expect(res(run({ rule: 'C', ball: 0.45 * MM }), 'land')).toBeCloseTo(0.3375 * MM, 15);
    expect(res(run({ rule: 'A', ball: 0.45 * MM, ballType: 'noncollapse' }), 'land')).toBeCloseTo(0.5175 * MM, 15);
    // TI SPRAA99C: NSMD land ≈ 90 % of the package pad, SMD opening = the package pad (review fix)
    const pk = run({ rule: 'pkg', ball: 0.45 * MM, pkgPad: 0.35 * MM });
    expect(res(pk, 'land')).toBeCloseTo(0.315 * MM, 15);
    expect(res(pk, 'pct')).toBeCloseTo((1 - 0.315 / 0.45) * 100, 12);
    expect(res(run({ rule: 'pkg', padDef: 'smd', ball: 0.45 * MM, pkgPad: 0.35 * MM }), 'land')).toBeCloseTo(0.35 * MM, 15);
  });
});

describe('BGA land pad — solve round trip and mode switches', () => {
  it('land → check → land returns the same percentage and land', () => {
    for (const [ball, type, rule] of [[0.45, 'collapse', 'ipc'], [0.3, 'noncollapse', 'B'], [0.76, 'collapse', 'ipc'], [0.6, 'collapse', 'C']] as const) {
      const r1 = run({ ball: ball * MM, ballType: type, rule, p: 3 * ball * MM });
      const land = res(r1, 'land');
      const r2 = run({ solveFor: 'pct', ball: ball * MM, ballType: type, rule, land, p: 3 * ball * MM });
      expect(res(r2, 'pct') / res(r1, 'pct')).toBeCloseTo(1, 10);
    }
  });
  it('clicking the computed percentage keeps it as a custom input; ball type resets a custom rule', () => {
    const find = (fs: FieldSpec[], k: string): any => {
      for (const f of fs) {
        if (f.kind === 'section' && find(f.fields, k)) return find(f.fields, k);
        if ((f.kind === 'number' || f.kind === 'select') && f.key === k) return f;
      }
    };
    const st: any = { ...def.defaults() };
    runCompute(def, st);
    find(def.fields, 'pct').onUnsolve(st, st);
    expect(st.rule).toBe('custom');
    expect(res(runCompute(def, st), 'land')).toBeCloseTo(0.36 * MM, 15);
    st.ballType = 'noncollapse';
    find(def.fields, 'ballType').apply('noncollapse', st, st);
    expect(st.rule).toBe('ipc');
  });
});

describe('BGA land pad — warnings', () => {
  it('outside the range, touching lands, no channel, mask web, ball outside the table; clean defaults', () => {
    expect(run({ solveFor: 'pct', land: 0.45 * MM }).warnings.some((w) => /above the .* IPC-7351B range/.test(w))).toBe(true);
    expect(run({ ball: 0.76 * MM, p: 1.27 * MM }).warnings.some((w) => /outside IPC-7351B Tables/.test(w))).toBe(true);
    expect(run({ n: 3 }).warnings.some((w) => /3 needed/.test(w))).toBe(true);
    expect(run({ maskClr: 0.2 * MM, n: 0 }).warnings.some((w) => /Mask web/.test(w))).toBe(true);
    expect(run({ solveFor: 'pct', land: 0.79 * MM, padDef: 'smd' }).warnings.some((w) => /lands touch/.test(w))).toBe(true);
    expect(run({ ball: 0.8 * MM, p: 0.8 * MM }).ok).toBe(false);
    expect(run({}).warnings).toEqual([]);
  });
  it('review fixes: mask web to the trace; IPC-7351B range is informational under IPC-7352 levels and the package pad', () => {
    // 0.8 mm pitch, 0.36 land: gap 0.44, one 0.1 trace centred → 0.17 mm from the copper
    expect(run({ maskClr: 0.2 * MM, n: 1 }).warnings.some((x) => /expose the traces/.test(x))).toBe(true);
    expect(res(run({ maskClr: 0.15 * MM, n: 1 }), 'web')).toBeCloseTo(0.02 * MM, 15);
    expect(run({ maskClr: 0.15 * MM, n: 1 }).warnings.some((x) => /nearest trace/.test(x))).toBe(true);
    const lvA = run({ rule: 'A', ball: 0.3 * MM, p: 0.5 * MM, n: 0 });
    expect(lvA.status).toBeUndefined();
    expect(lvA.warnings.some((x) => /IPC-7351B range/.test(x))).toBe(false);
    expect(lvA.notes.some((x) => /For comparison/.test(x))).toBe(true);
  });
});

type Num = { key: string; min: number; max: number; integer?: boolean };
function collect(fields: FieldSpec[], nums: Num[], sels: { key: string; options: (string | number)[] }[]) {
  for (const f of fields) {
    if (f.kind === 'section' || f.kind === 'group') collect(f.fields, nums, sels);
    else if (f.kind === 'number') nums.push({ key: f.key, min: f.min ?? 0, max: f.max ?? 1, integer: f.integer });
    else if (f.kind === 'select') sels.push({ key: f.key, options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) });
  }
}
const BAD = /NaN|undefined|Infinity|\[object/;

describe('BGA land pad — fuzz (400 random states through runCompute)', () => {
  it('never throws; finite results; clean text; finite graphs; stable recompute; valid designs never refused', () => {
    const nums: Num[] = [];
    const sels: { key: string; options: (string | number)[] }[] = [];
    collect(def.fields, nums, sels);
    let x = 5;
    const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const s: Record<string, unknown> = { ...def.defaults() };
      for (const f of sels) s[f.key] = f.options[Math.floor(rnd() * f.options.length)];
      for (const f of nums) {
        const v = f.min > 0 ? f.min * (f.max / f.min) ** rnd() : f.min + (f.max - f.min) * rnd();
        s[f.key] = f.integer ? Math.round(v) : v;
      }
      s.solveFor = def.solve!.options[i % 2].key;
      const st = s as unknown as LandState;
      let r!: CalcReport;
      expect(() => (r = runCompute(def, st))).not.toThrow();
      if (!r.ok) {
        expect(r.error).not.toMatch(BAD);
        // refusals: a ball at or above the pitch, or a land/package pad far outside the percentage range
        expect(st.ball >= st.p || /range/.test(r.error ?? ''), r.error).toBe(true);
        continue;
      }
      ok++;
      for (const it of r.results) {
        if (typeof it.value === 'number') expect(Number.isFinite(it.value), it.key).toBe(true);
        expect(it.display, it.key).not.toMatch(BAD);
      }
      for (const w of [...r.warnings, ...r.notes, r.summary ?? '', r.status?.text ?? '']) expect(w).not.toMatch(BAD);
      for (const g of r.graphs) for (const sr of g.series ?? []) for (const y of sr.y) expect(Number.isFinite(y), g.id).toBe(true);
      const again = def.compute({ ...st });
      expect(again.ok).toBe(true);
      for (const k of ['land', 'pct', 'gap']) expect(res(again, k)).toBeCloseTo(res(r, k), 12);
    }
    expect(ok).toBeGreaterThan(150);
  });
});

describe('BGA land pad — examples', () => {
  it('first example equals the defaults; every example computes', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) {
      const r = runCompute(def, { ...def.defaults(), ...structuredClone(ex.state) });
      expect(r.ok, `${ex.id}: ${r.error}`).toBe(true);
    }
  });
});
