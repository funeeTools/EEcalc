import { describe, expect, it } from 'vitest';
import { PRESETS, def, type BgaState } from '@/calculators/bga-breakout/def';
import { dMaxForN, dogboneClearance, layersNeeded, tracesInGap, wMaxForN } from '@/calculators/bga-breakout/model';
import { runCompute } from '@/core/calc/page';
import type { CalcReport } from '@/core/calc/types';

const res = (r: CalcReport, k: string) => r.results.find((x) => x.key === k)?.value as number;
const state = (p: Partial<BgaState> = {}): BgaState => ({ ...def.defaults(), ...p });
const MM = 1e-3;
const field = (key: string): any => (def.fields as any[]).flatMap((s) => s.fields).find((f: any) => f.key === key);

describe('BGA breakout — channel arithmetic (Python check_all.py)', () => {
  it('reproduces independent values', () => {
    // 0.8 mm, 0.35 mm land, 4/4 mil: gap 0.45 → ⌊(0.45 − 0.1)/0.2⌋ = 1; vias 0.45 → gap 0.35 → 1
    const r = runCompute(def, state());
    expect(res(r, 'n')).toBe(1);
    expect(res(r, 'gapPad')).toBeCloseTo(0.45 * MM, 15);
    expect(res(r, 'nVia')).toBe(1);
    expect(res(r, 'layers')).toBe(4); // 8 rows deep: 2 on top, 2 per inner layer → 1 + 3
    // 1.27 mm, 0.6 mm land, 5/5 mil: gap 0.67 → 2 traces; W_max(2) = (0.67 − 3·0.127)/2 = 0.1445 mm
    expect(tracesInGap(0.67 * MM, 0.127 * MM, 0.127 * MM)).toBe(2);
    expect(wMaxForN(0.67 * MM, 0.127 * MM, 2)).toBeCloseTo(0.1445 * MM, 15);
    // dog-bone at 0.8 mm: 0.8/√2 − (0.35 + 0.45)/2 = 0.16569 mm
    expect(dogboneClearance(0.8 * MM, 0.35 * MM, 0.45 * MM)).toBeCloseTo(0.1656854 * MM, 9);
  });
  it('hand-worked 1.27 mm PBGA case: two 0.127 mm traces at 0.127 mm need a land ≤ 1.27 − 2·0.127 − 3·0.127 = 0.635 mm', () => {
    // no published worked example was accessible; this is the arithmetic of Intel AN 114 §1.3.4 done by hand
    expect(dMaxForN(1.27 * MM, 0.127 * MM, 0.127 * MM, 2)).toBeCloseTo(0.635 * MM, 15);
    expect(layersNeeded(12, 2, 1)).toEqual({ top: 3, perInner: 2, inner: 5, total: 6 });
  });
  it('an exact fit counts (W = W_max gives N, not N − 1)', () => {
    for (const n of [1, 2, 3, 5]) {
      const w = wMaxForN(0.53 * MM, 0.07 * MM, n);
      expect(tracesInGap(0.53 * MM, w, 0.07 * MM)).toBe(n);
    }
  });
});

describe('BGA breakout — solve round trips', () => {
  it('W, land and via pad for N traces reproduce N in their channel', () => {
    for (const p of [0.4, 0.5, 0.65, 0.8, 1.0, 1.27]) for (const n of [1, 2]) {
      const q = PRESETS[`${p === 1 ? '1.0' : p} mm`]!;
      const base = { p: q.p * MM, dPad: q.land * MM, dMask: q.land * MM + 0.1 * MM, dVia: q.via * MM, drill: q.drill * MM, w: q.w * MM, s: q.s * MM, n, preset: 'Custom' };
      for (const [solveFor, channel] of [['w', 'pads'], ['w', 'vias'], ['dPad', 'pads'], ['dVia', 'vias']] as const) {
        const st = state({ ...base, solveFor, channel });
        const r = runCompute(def, st);
        if (!r.ok) {
          expect(r.status?.text).toBe('NO SOLUTION');
          continue;
        }
        const back = runCompute(def, { ...st, solveFor: 'n' });
        expect(res(back, 'n'), `${p} ${n} ${solveFor}`).toBe(n);
      }
    }
  });
  it('solving the land ties the channel to the lands, and the via pad to the vias', () => {
    const st = state({ solveFor: 'dPad', channel: 'vias', n: 1 });
    runCompute(def, st);
    expect(st.channel).toBe('pads');
  });
});

describe('BGA breakout — settings and validity', () => {
  it('NSMD ↔ SMD keeps the solderable diameter and A → B → A restores it', () => {
    const st = state();
    const f = field('padDef');
    st.padDef = 'smd';
    f.apply('smd', st, st);
    expect(st.dMask).toBeCloseTo(0.35 * MM, 15);
    expect(st.dPad).toBeCloseTo(0.45 * MM, 15);
    expect(res(runCompute(def, st), 'gapPad')).toBeCloseTo(0.35 * MM, 15);
    st.padDef = 'nsmd';
    f.apply('nsmd', st, st);
    expect(st.dPad).toBeCloseTo(0.35 * MM, 15);
    expect(st.dMask).toBeCloseTo(0.45 * MM, 15);
  });
  it('warnings: no fit, NSMD/SMD inconsistent, thin mask web, small ring, dog-bone collision, via in pad larger than land', () => {
    const w = (p: Partial<BgaState>) => runCompute(def, state(p)).warnings.join(' ');
    expect(w({ w: 0.3 * MM })).toMatch(/No trace fits between lands/);
    expect(w({ dMask: 0.3 * MM })).toMatch(/that is an SMD land/);
    expect(w({ padDef: 'smd', dMask: 0.5 * MM })).toMatch(/does not define the joint/);
    expect(w({ dMask: 0.75 * MM })).toMatch(/Mask web/);
    expect(w({ drill: 0.4 * MM })).toMatch(/Annular ring/);
    expect(w({ p: 0.5 * MM, dPad: 0.3 * MM, dMask: 0.4 * MM, dVia: 0.4 * MM, drill: 0.2 * MM, w: 0.05 * MM, s: 0.05 * MM })).toMatch(/no room for a via between the balls/);
    expect(w({ fanout: 'vip', dVia: 0.5 * MM })).toMatch(/larger than the land/);
  });
  it('lands or via pads as wide as the pitch are an input error that says they overlap', () => {
    const r = runCompute(def, state({ dPad: 0.8 * MM }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/The lands overlap/);
    expect(runCompute(def, state({ dVia: 0.9 * MM })).error).toMatch(/The via pads overlap/);
  });
  it('a preset switch while solving W goes back to the analysis of the new package', () => {
    const st = state({ solveFor: 'w', n: 2 });
    field('preset').apply('1.27 mm', st, st);
    expect(st.solveFor).toBe('n');
    expect(runCompute(def, st).ok).toBe(true);
  });
});

describe('BGA breakout — examples and fuzz', () => {
  it('every example computes; the first equals the defaults', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const ex of def.examples!) expect(runCompute(def, { ...def.defaults(), ...ex.state }).ok, ex.id).toBe(true);
  });
  it('400 random states: no throw, finite, clean text, stable', () => {
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const lg = (a: number, b: number) => a * (b / a) ** rnd();
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const p = lg(0.1 * MM, 3 * MM);
      // lands and vias mostly below the pitch (≥ pitch is the overlap input error, ~10 % of the states)
      const st = state({
        solveFor: pick(['n', 'w', 'dPad', 'dVia']), preset: pick(Object.keys(PRESETS)), p, ball: lg(0.05 * MM, 2 * MM), padDef: pick(['nsmd', 'smd']), dPad: Math.max(0.05 * MM, p * lg(0.1, 1.1)), dMask: lg(0.05 * MM, 3 * MM),
        fanout: pick(['dogbone', 'vip']), dVia: Math.max(0.05 * MM, p * lg(0.1, 1.1)), drill: lg(0.02 * MM, 2 * MM), channel: pick(['pads', 'vias']), n: Math.floor(rnd() * 21), w: lg(0.005 * MM, 2 * MM), s: lg(0.005 * MM, 1 * MM), rows: 2 + Math.floor(rnd() * 79),
      });
      const r = runCompute(def, st);
      const txt = JSON.stringify([r.results.map((x) => x.display), r.warnings, r.notes, r.summary, r.error ?? '', r.tables.map((t) => t.display)]);
      expect(txt).not.toMatch(/NaN|undefined|Infinity|\[object/);
      if (!r.ok) {
        // overlapping lands or via pads are an input error in any mode; otherwise only a solve can fail
        if (!(st.dPad >= st.p || st.dVia >= st.p)) expect(st.solveFor).not.toBe('n');
        continue;
      }
      ok++;
      for (const x of r.results) if (typeof x.value === 'number') expect(Number.isFinite(x.value)).toBe(true);
      for (const g of r.graphs) for (const s of g.series ?? []) for (const y of s.y) expect(Number.isFinite(y)).toBe(true);
      const again = runCompute(def, { ...st });
      expect(again.results.map((x) => x.value)).toEqual(r.results.map((x) => x.value));
    }
    expect(ok).toBeGreaterThan(150);
  });
});
