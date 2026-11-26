import { describe, expect, it } from 'vitest';
import { def, type NfState } from '@/calculators/nf-cascade/def';
import { runCompute } from '@/core/calc/page';

type R = { results: { key: string; value: unknown }[] };
const res = (r: R, k: string) => r.results.find((x) => x.key === k)?.value as number;
const example = (id: string): NfState => ({ ...def.defaults(), ...structuredClone(def.examples!.find((e) => e.id === id)!.state) }) as NfState;

describe('noise-figure cascade — independent cross-check', () => {
  it('Friis cascade NF and gain match an independent Python implementation; a solved stage NF meets the target', () => {
    const r = runCompute(def, def.defaults());
    // filter 1.5 dB → LNA 18/1.2 → mixer −7/8 → IF 20/4, independent Python (Friis 1944)
    expect(res(r, 'nfTotal')).toBeCloseTo(3.325576, 5);
    expect(res(r, 'gain')).toBeCloseTo(29.5, 9);
    const st = example('lna-budget');
    runCompute(def, st);
    // the solved LNA NF makes the cascade exactly the 2 dB target
    expect(res(runCompute(def, { ...structuredClone(st), solveFor: 'nfTotal' }), 'nfTotal')).toBeCloseTo(2, 9);
  });
});

describe('noise-figure cascade — mode-switch regressions', () => {
  it('making the solved stage passive goes back to analysing the cascade (no hidden unknown)', () => {
    const st = example('lna-budget');
    runCompute(def, st);
    st.stages[1].type = 'passive';
    const r = runCompute(def, st);
    expect(st.solveFor).toBe('nfTotal');
    expect(r.results.find((x) => x.key === 'nfTotal')?.solved).toBe(true);
    expect(r.warnings.some((w) => w.includes('cannot be solved'))).toBe(false);
  });

  it('removing or duplicating stages keeps the unknown on the same stage, and removing it ends the solve', () => {
    const st = example('lna-budget');
    runCompute(def, st);
    const lna = st.stages[1];
    // remove the filter above the LNA: the LNA moves to index 0 and stays the unknown
    st.stages.splice(0, 1);
    runCompute(def, st);
    expect(st.solveFor).toBe('nfStage');
    expect(st.stages[st.solveStage]).toBe(lna);
    // a stage inserted above it (duplicate of another stage): the LNA moves down again
    st.stages.splice(0, 0, { ...structuredClone(st.stages[1]), name: 'Pre' });
    runCompute(def, st);
    expect(st.solveStage).toBe(1);
    expect(st.stages[st.solveStage]).toBe(lna);
    // duplicating the LNA itself puts the copy below it: the original stays the unknown
    st.stages.splice(2, 0, structuredClone(lna));
    runCompute(def, st);
    expect(st.stages[st.solveStage]).toBe(lna);
    // remove the solved stage itself: analyse the rest instead of solving the next stage's NF
    st.stages.splice(st.solveStage, 1);
    const r = runCompute(def, st);
    expect(st.solveFor).toBe('nfTotal');
    expect(r.ok).toBe(true);
    expect(r.results.filter((x) => x.solved).map((x) => x.key)).toEqual(['nfTotal']);
  });

  it('a new ◎ choice still wins over the remembered stage', () => {
    const st = example('lna-budget');
    runCompute(def, st);
    // ◎ on the mixer NF (onSolve sets the index)
    st.solveStage = 2;
    runCompute(def, st);
    expect(st.solveStage).toBe(2);
    expect(st.solveFor).toBe('nfStage');
  });
});
