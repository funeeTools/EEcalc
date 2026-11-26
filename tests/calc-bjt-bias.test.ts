import { describe, expect, it } from 'vitest';
import { def, frame, type BjtState } from '@/calculators/bjt-bias/def';
import { BJT_PRESETS, sBeta, solveBias } from '@/calculators/bjt-bias/model';
import { fuzz, res } from './fuzz-gen3';

const run = (p: Partial<BjtState>) => def.compute({ ...def.defaults(), ...p });
const ex = (id: string) => ({ ...def.defaults(), ...def.examples!.find((e) => e.id === id)!.state }) as BjtState;
const pt = (s: BjtState) => (def.compute(s).details as { pointStd: ReturnType<typeof solveBias> }).pointStd;

describe('BJT bias — published and reference values', () => {
  it('Sedra & Smith voltage-divider example: V_CC 15 V, 100k/50k, R_E 3k, R_C 5k, β 100 → I_E 1.29 mA, V_B 4.57 V, V_C 8.6 V', () => {
    const r = def.compute(ex('sedra-divider'));
    expect(res(r, 'ie')).toBeCloseTo(1.29e-3, 5);
    expect(res(r, 'vb')).toBeCloseTo(4.57, 2);
    expect(res(r, 'veNode')).toBeCloseTo(3.87, 2);
    expect(res(r, 'vc')).toBeCloseTo(8.6, 1);
    expect(res(r, 'region')).toBe('active');
  });
  it('matches the independent Python nodal reference (gb3/py/bjt_ref.py)', () => {
    expect(res(run({}), 'ic')).toBeCloseTo(0.0010269151615677598, 15);
    expect(res(run({}), 'vce')).toBeCloseTo(5.009853790391943, 12);
    const f = def.compute(ex('feedback'));
    expect(res(f, 'ic')).toBeCloseTo(0.0012585380728349885, 15);
    expect(res(f, 'vce')).toBeCloseTo(3.0506795608991126, 12);
    const sat = def.compute(ex('fixed-sat'));
    expect(res(sat, 'region')).toBe('saturation');
    expect(res(sat, 'ic')).toBeCloseTo(0.0025106382978723404, 15);
    expect(res(sat, 'ib')).toBeCloseTo(0.0001135, 15);
    const d = def.compute(ex('design-1ma'));
    expect(res(d, 'r1')).toBeCloseTo(159631.81818181818, 6);
    expect(res(d, 'r2')).toBeCloseTo(32005.0, 7);
    expect(res(d, 're')).toBeCloseTo(1193.103448275862, 9);
    const p = def.compute(ex('pnp-9v'));
    expect(res(p, 'r1')).toBeCloseTo(88160, 6);
    expect(res(p, 'r2')).toBeCloseTo(394400, 5);
  });
  it('presets carry the onsemi h_FE ranges', () => {
    expect(BJT_PRESETS['2N3904 (NPN)']).toMatchObject({ betaMin: 100, betaMax: 300, vceo: 40, icMax: 0.2 });
    expect(BJT_PRESETS['BC547B (NPN)']).toMatchObject({ beta: 290, betaMin: 200, betaMax: 450 });
    expect(BJT_PRESETS['BC557B (PNP)']).toMatchObject({ type: 'pnp', beta: 290, betaMin: 180, betaMax: 460, vbe: 0.62 });
  });
});

describe('BJT bias — review fixes (mode switches)', () => {
  it('NPN → PNP mirrors R1/R2 and keeps the bias point; back again restores them', () => {
    const f = def.fields.flatMap((x: any) => (x.fields ?? [x])).find((x: any) => x.key === 'type') as any;
    const s: any = def.defaults();
    const a = def.compute(s);
    def.sync!(s); s.type = 'pnp'; f.apply('pnp', s, s);
    const b = def.compute(s);
    expect(res(b, 'ic')).toBeCloseTo(res(a, 'ic'), 15);
    expect(res(b, 'region')).toBe('active');
    expect(b.results.find((x) => x.key === 'vce')!.display).toMatch(/^−5\.01/);
    def.sync!(s); s.type = 'npn'; f.apply('npn', s, s);
    expect([s.r1, s.r2]).toEqual([160e3, 33e3]);
  });
});

describe('BJT bias — solve round trips', () => {
  it('design → analysis returns the targets, for every network and both polarities', () => {
    for (const topo of ['divider', 'fixed', 'feedback'] as const)
      for (const type of ['npn', 'pnp'] as const)
        for (const [ic, vce, ve] of [[1e-3, 5, 1.2], [0.2e-3, 3, 0.5], [10e-3, 4, 0]]) {
          const d = def.compute({ ...def.defaults(), part: 'Custom', solveFor: 'design', topo, type, ic, vce, ve });
          expect(d.ok, `${topo} ${type}`).toBe(true);
          const vals = Object.fromEntries(d.results.filter((x) => x.solved).map((x) => [x.key, x.value as number]));
          const a = def.compute({ ...def.defaults(), part: 'Custom', solveFor: 'ic', topo, type, ...vals });
          expect(res(a, 'ic') / ic - 1, `${topo} ${type} ic`).toBeCloseTo(0, 12);
          expect(res(a, 'vce') / vce - 1, `${topo} ${type} vce`).toBeCloseTo(0, 12);
        }
  });
});

describe('BJT bias — physics', () => {
  it('PNP mirrors NPN: same magnitudes with the divider resistors exchanged', () => {
    const n = pt({ ...def.defaults(), type: 'npn', r1: 160e3, r2: 33e3 });
    const p = pt({ ...def.defaults(), type: 'pnp', r1: 33e3, r2: 160e3 });
    expect(p.ic).toBeCloseTo(n.ic, 15);
    expect(p.vce).toBeCloseTo(n.vce, 12);
  });
  it('S_β matches a finite difference; a stiff divider beats fixed bias', () => {
    const s = def.defaults();
    const c = frame(s);
    const t = { beta: 173, vbe: 0.65, vceSat: 0.2 };
    const h = 1e-5;
    const fd = ((solveBias(c, { ...t, beta: 173 * (1 + h) }).ic - solveBias(c, { ...t, beta: 173 * (1 - h) }).ic) / (2 * h)) / solveBias(c, t).ic;
    expect(sBeta(c, 173)).toBeCloseTo(fd, 8);
    expect(sBeta({ ...c, topo: 'fixed', rb: 1.5e6, re: 0 }, 173)).toBe(1);
  });
  it('collector feedback never saturates; cut off when V_BB < V_BE', () => {
    expect(pt({ ...def.defaults(), topo: 'feedback', rb: 1e3, rc: 10e3, re: 0 }).region).toBe('active');
    expect(pt({ ...def.defaults(), r1: 1e6, r2: 10e3 }).region).toBe('cutoff');
    const sat = pt({ ...def.defaults(), r2: 330e3 });
    expect(sat.region).toBe('saturation');
    expect(sat.ic / sat.ib).toBeLessThan(173);
  });
});

describe('BJT bias — warnings, examples, fuzz', () => {
  it('warns at the validity and rating limits', () => {
    const has = (p: Partial<BjtState>, re: RegExp) => run(p).warnings.some((w) => re.test(w));
    expect(has({ r2: 330e3 }, /saturated/)).toBe(true);
    expect(has({ r1: 1e6, r2: 10e3 }, /transistor is off/)).toBe(true);
    expect(has(ex('fixed-sat'), /saturated/)).toBe(true);
    expect(has({ topo: 'fixed', rb: 2.2e6, re: 0, rc: 4.7e3 }, /proportional to β|moves between regions/)).toBe(true);
    expect(has({ re: 68, rc: 1e3 }, /across R_E/)).toBe(true);
    expect(has({ vcc: 48, part: 'Custom' }, /exceeds V_CEO/)).toBe(true);
    expect(has({ rc: 10, re: 10, r1: 10e3, r2: 4.7e3, vcc: 20, part: 'Custom' }, /dissipates/)).toBe(true);
    expect(has({ beta: 50, part: 'Custom' }, /outside the datasheet range/)).toBe(true);
    expect(run({ solveFor: 'design', vce: 11 }).error).toMatch(/leaves nothing for R_C/);
    expect(run({ solveFor: 'design', vce: 0.1 }).error).toMatch(/saturate/);
    expect(run({ solveFor: 'design', topo: 'feedback', vce: 0.5 }).error).toMatch(/cannot be below V_BE/);
  });
  it('every example computes; the first equals the defaults; preset edits fall back to Custom', () => {
    expect(def.examples![0].state).toEqual(def.defaults());
    for (const e of def.examples!) expect(def.compute({ ...def.defaults(), ...e.state } as BjtState).ok, e.id).toBe(true);
    const s = { ...def.defaults(), beta: 200 };
    def.sync!(s);
    expect(s.part).toBe('Custom');
  });
  it('fuzz: 400 random states plus 300 realistic ones through runCompute', () => {
    expect(fuzz(def, 400, 777)).toBeGreaterThan(50);
    expect(fuzz(def, 300, 31, (s, rnd) => Object.assign(s, { vcc: 3 + 27 * rnd(), r1: 1e3 * 1e3 ** rnd(), r2: 1e3 * 1e3 ** rnd(), rb: 1e4 * 1e3 ** rnd(), rc: 100 * 1e3 ** rnd(), re: 1e4 * rnd(), ic: 1e-5 * 1e3 ** rnd(), vce: 0.5 + 5 * rnd(), ve: 2 * rnd(), beta: 50 + 400 * rnd(), betaMin: 40, betaMax: 500, vbe: 0.6 + 0.1 * rnd() }))).toBeGreaterThan(200);
  });
});
